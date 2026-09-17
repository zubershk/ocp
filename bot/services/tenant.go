package services

import (
	"errors"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Tenant helpers (Phase 1, PR 3).
//
// Authenticated admin handlers resolve scope from Gin context keys set
// by TenantMiddleware. Public/WhatsApp paths have no tenant and use
// the default (first) restaurant — multi-restaurant storefront routing
// arrives with Phase 4; until then the default serves the site.
// ------------------------------------------------------------------

// TenantIDs extracts (restaurantID, outletID) from Gin context.
// Returns zeros when no tenant middleware ran (public paths).
func TenantIDs(c *gin.Context) (restaurantID, outletID int) {
	if c == nil {
		return 0, 0
	}
	return c.GetInt("restaurantID"), c.GetInt("outletID")
}

// TenantOrgID extracts the organization ID from Gin context.
func TenantOrgID(c *gin.Context) int {
	if c == nil {
		return 0
	}
	return c.GetInt("orgID")
}

// DefaultRestaurantID returns the first restaurant (bootstrap tenant).
func DefaultRestaurantID() int {
	if database.DB == nil {
		return 0
	}
	var id int
	if err := database.DB.QueryRow(
		`SELECT id FROM restaurants ORDER BY id LIMIT 1`).Scan(&id); err != nil {
		return 0
	}
	return id
}

// DefaultOutletID returns the first active outlet of a restaurant.
func DefaultOutletID(restaurantID int) int {
	if database.DB == nil {
		return 0
	}
	var id int
	err := database.DB.QueryRow(
		`SELECT id FROM outlets WHERE restaurant_id = $1 AND active = true ORDER BY sort_order, id LIMIT 1`,
		restaurantID).Scan(&id)
	if err != nil {
		return 0
	}
	return id
}

// ResolveRestaurant returns the explicit tenant restaurant or the default.
// Deprecated for SaaS paths: use RequireTenant. Kept only for single-tenant/bootstrap fallback.
func ResolveRestaurant(restaurantID int) int {
	if restaurantID > 0 {
		return restaurantID
	}
	return DefaultRestaurantID()
}

var (
	ErrTenantRequired = errors.New("tenant context required")
	ErrTenantNotFound = errors.New("tenant not found")
)

// IsSingleTenantMode reports whether the process is running in self-hosted single-tenant fallback.
// For open-source installs this defaults to true (backward compat). Set SINGLE_TENANT_MODE=0/false to enforce SaaS strict tenant.
func IsSingleTenantMode() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("SINGLE_TENANT_MODE")))
	if v == "" {
		// open-source only default: allow fallback to bootstrap tenant
		return true
	}
	if v == "0" || v == "false" || v == "no" || v == "off" {
		return false
	}
	return true
}

// RequireTenant extracts tenant IDs or returns 400/404 semantics for SaaS callers.
// In single-tenant mode it falls back to the default restaurant for backward compat.
func RequireTenant(c *gin.Context) (restaurantID, outletID int, err error) {
	if c != nil {
		restaurantID = c.GetInt("restaurantID")
		outletID = c.GetInt("outletID")
		if restaurantID > 0 {
			return restaurantID, outletID, nil
		}
	}
	if database.DB == nil {
		// unit test without DB: treat as no tenant, caller will fallback to 0
		return 0, 0, ErrTenantNotFound
	}
	if IsSingleTenantMode() {
		rid := DefaultRestaurantID()
		if rid == 0 {
			return 0, 0, ErrTenantNotFound
		}
		if c != nil {
			c.Set("restaurantID", rid)
			if outletID == 0 {
				oid := DefaultOutletID(rid)
				c.Set("outletID", oid)
				outletID = oid
			}
		}
		return rid, outletID, nil
	}
	return 0, 0, ErrTenantRequired
}

// RequireRestaurant returns just the restaurant ID or ErrTenantRequired.
func RequireRestaurant(c *gin.Context) (int, error) {
	rid, _, err := RequireTenant(c)
	return rid, err
}
