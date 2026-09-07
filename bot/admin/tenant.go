package admin

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Tenant context (Phase 1, PR 2).
//
// Resolves, for an authenticated request:
//
//	authenticated request -> user -> organization -> restaurant -> outlet
//
// Results are stored in Gin context under orgID / restaurantID /
// outletID / tenantUser. Nothing here changes business behavior yet:
// handlers keep reading unscoped data until PR 3 scopes them.
// ------------------------------------------------------------------

// tenantUser is the authenticated identity plus its resolved tenant.
type tenantUser struct {
	UserID       int
	Name         string
	Role         string
	OrgID        int
	RestaurantID int
	OutletID     int
	 ViaEnvOwner bool
}

// defaultOrgID returns the bootstrap organization (first by id).
// Fresh installs always have exactly one until org creation ships.
func defaultOrgID() (int, error) {
	var id int
	err := database.DB.QueryRow(`SELECT id FROM organizations ORDER BY id LIMIT 1`).Scan(&id)
	return id, err
}

// defaultRestaurantID returns the first restaurant of an organization.
func defaultRestaurantID(orgID int) (int, error) {
	var id int
	err := database.DB.QueryRow(
		`SELECT id FROM restaurants WHERE organization_id = $1 ORDER BY id LIMIT 1`, orgID).Scan(&id)
	return id, err
}

// defaultOutletID returns the first active outlet of a restaurant.
func defaultOutletID(restaurantID int) (int, error) {
	var id int
	err := database.DB.QueryRow(
		`SELECT id FROM outlets WHERE restaurant_id = $1 AND active = true ORDER BY sort_order, id LIMIT 1`,
		restaurantID).Scan(&id)
	if err == sql.ErrNoRows {
		err = database.DB.QueryRow(
			`SELECT id FROM outlets WHERE restaurant_id = $1 ORDER BY sort_order, id LIMIT 1`,
			restaurantID).Scan(&id)
	}
	return id, err
}

// resolveTenant builds the tenant context for an authenticated admin user.
// Outlet comes from X-Outlet-ID when present and valid; otherwise the
// restaurant default. An explicit outlet outside the restaurant is rejected.
func resolveTenant(au *adminUserCtx) (*tenantUser, error) {
	tu := &tenantUser{Name: au.Name, Role: au.Role}
	if au.OrgID > 0 {
		tu.UserID = au.ID
		tu.OrgID = au.OrgID
	} else {
		// Legacy backstop (admin_users row or env owner): bootstrap tenant.
		orgID, err := defaultOrgID()
		if err != nil {
			return nil, err
		}
		tu.OrgID = orgID
		tu.ViaEnvOwner = au.ID == 0
	}
	restID, err := defaultRestaurantID(tu.OrgID)
	if err != nil {
		return nil, err
	}
	tu.RestaurantID = restID
	tu.OutletID, err = defaultOutletID(restID)
	if err != nil {
		return nil, err
	}
	return tu, nil
}

// resolveOutlet validates an explicit outlet request against the restaurant.
func resolveOutlet(tu *tenantUser, raw string) error {
	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 {
		return errInvalidOutlet()
	}
	var rid int
	err = database.DB.QueryRow(
		`SELECT restaurant_id FROM outlets WHERE id = $1`, id).Scan(&rid)
	if err != nil {
		return errInvalidOutlet()
	}
	if rid != tu.RestaurantID {
		return errInvalidOutlet()
	}
	tu.OutletID = id
	return nil
}

type outletError struct{}

func (outletError) Error() string { return "invalid or inaccessible outlet" }

func errInvalidOutlet() error { return outletError{} }

// TenantMiddleware resolves tenant context after RequireAdminKey and
// stores orgID / restaurantID / outletID / tenantUser in Gin context.
// Existing handlers ignore these keys until PR 3 scopes them.
func TenantMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		u, _ := c.Get("adminUser")
		au, ok := u.(*adminUserCtx)
		if !ok || au == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}
		tu, err := resolveTenant(au)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "tenant resolution failed"})
			c.Abort()
			return
		}
		if raw := c.GetHeader("X-Outlet-ID"); raw != "" {
			if err := resolveOutlet(tu, raw); err != nil {
				c.JSON(http.StatusForbidden, gin.H{"error": "invalid or inaccessible outlet"})
				c.Abort()
				return
			}
		}
		c.Set("orgID", tu.OrgID)
		c.Set("restaurantID", tu.RestaurantID)
		c.Set("outletID", tu.OutletID)
		c.Set("tenantUser", tu)
		c.Next()
	}
}

// RequirePermission restricts to callers holding a permission key.
// Reads role_permissions for the caller's (organization, role).
// Owner bypasses all, mirroring RequireRole behavior during transition.
// Existing routes keep their RequireRole checks; migration to
// permissions happens in the controlled PR 3 pass.
func (h *AdminHandler) RequirePermission(permKeys ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString("adminRole")
		if role == "owner" {
			c.Next()
			return
		}
		orgID := c.GetInt("orgID")
		if orgID == 0 {
			// Tenant middleware not in chain (shouldn't happen on /admin).
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden — no tenant context"})
			c.Abort()
			return
		}
		if h.hasPermissions(orgID, role, permKeys) {
			c.Next()
			return
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden — missing permission"})
		c.Abort()
	}
}

func (h *AdminHandler) hasPermissions(orgID int, role string, permKeys []string) bool {
	if len(permKeys) == 0 {
		return true
	}
	rows, err := database.DB.Query(`
		SELECT p.key FROM permissions p
		JOIN role_permissions rp ON rp.permission_id = p.id
		JOIN roles r ON r.id = rp.role_id
		WHERE r.organization_id = $1 AND r.name = $2
	`, orgID, role)
	if err != nil {
		return false
	}
	defer rows.Close()
	have := map[string]bool{}
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err == nil {
			have[k] = true
		}
	}
	for _, want := range permKeys {
		if !have[want] {
			return false
		}
	}
	return true
}

// EnsureTenantBootstrap guarantees the bootstrap tenant exists:
// OCP organization -> OCP restaurant -> Main Outlet. Idempotent and
// a no-op on existing installations (mirrors migration 021 for DBs
// created outside the migration path).
func EnsureTenantBootstrap() {
	var orgID int
	err := database.DB.QueryRow(`SELECT id FROM organizations WHERE slug='ocp'`).Scan(&orgID)
	if err == sql.ErrNoRows {
		err = database.DB.QueryRow(
			`INSERT INTO organizations (name, slug) VALUES ('Orange Cheese Pizza','ocp') RETURNING id`).Scan(&orgID)
	}
	if err != nil {
		return
	}
	var restID int
	err = database.DB.QueryRow(
		`SELECT id FROM restaurants WHERE organization_id=$1 AND slug='ocp'`, orgID).Scan(&restID)
	if err == sql.ErrNoRows {
		err = database.DB.QueryRow(
			`INSERT INTO restaurants (organization_id, name, slug, currency, timezone)
			 VALUES ($1,'Orange Cheese Pizza','ocp','INR','Asia/Kolkata') RETURNING id`, orgID).Scan(&restID)
	}
	if err != nil {
		return
	}
	// Main Outlet only when the restaurant has no outlets at all
	// (fresh installs) — never invent outlets for live restaurants.
	var outletCount int
	if err := database.DB.QueryRow(
		`SELECT COUNT(*) FROM outlets WHERE restaurant_id = $1`, restID).Scan(&outletCount); err == nil && outletCount == 0 {
		_, _ = database.DB.Exec(
			`INSERT INTO outlets (restaurant_id, name, slug, active, sort_order)
			 VALUES ($1,'Main Outlet','main',true,0) ON CONFLICT (restaurant_id, slug) DO NOTHING`, restID)
	}
	_, _ = database.DB.Exec(
		`INSERT INTO subscriptions (organization_id, plan, status) VALUES ($1,'free','active')
		 ON CONFLICT (organization_id) DO NOTHING`, orgID)
}

// GetTenantContext returns the resolved tenant for the caller.
// Debug/introspection endpoint for PR 3 work; harmless to keep.
func (h *AdminHandler) GetTenantContext(c *gin.Context) {
	tu, _ := c.Get("tenantUser")
	if t, ok := tu.(*tenantUser); ok && t != nil {
		c.JSON(http.StatusOK, gin.H{
			"user_id": t.UserID, "name": t.Name, "role": t.Role,
			"organization_id": t.OrgID, "restaurant_id": t.RestaurantID,
			"outlet_id": t.OutletID,
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"organization_id": c.GetInt("orgID"),
		"restaurant_id":   c.GetInt("restaurantID"),
		"outlet_id":       c.GetInt("outletID"),
	})
}
