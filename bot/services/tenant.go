package services

import (
	"errors"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/services/currency"
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

// RestaurantByDomain resolves a verified custom domain to a restaurant id.
func RestaurantByDomain(domain string) int {
	key := "domain:" + strings.ToLower(strings.TrimSpace(domain))
	if v, ok := tenantCacheGet(key); ok {
		return v
	}
	if database.DB == nil {
		return 0
	}
	var id int
	err := database.DB.QueryRow(
		`SELECT restaurant_id FROM domains WHERE lower(domain)=lower($1) AND verified_at IS NOT NULL LIMIT 1`, domain).Scan(&id)
	if err != nil {
		return 0
	}
	tenantCacheSet(key, id)
	return id
}

// RestaurantBySlug resolves a restaurant slug to its id.
func RestaurantBySlug(slug string) int {
	key := "slug:" + strings.ToLower(strings.TrimSpace(slug))
	if v, ok := tenantCacheGet(key); ok {
		return v
	}
	if database.DB == nil {
		return 0
	}
	var id int
	err := database.DB.QueryRow(
		`SELECT id FROM restaurants WHERE lower(slug)=lower($1) ORDER BY id LIMIT 1`, slug).Scan(&id)
	if err != nil {
		return 0
	}
	tenantCacheSet(key, id)
	return id
}

// RestaurantOrgID returns the organization that owns a restaurant.
func RestaurantOrgID(restaurantID int) int {
	key := "org:" + strconv.Itoa(restaurantID)
	if v, ok := tenantCacheGet(key); ok {
		return v
	}
	if database.DB == nil {
		return 0
	}
	var id int
	err := database.DB.QueryRow(
		`SELECT organization_id FROM restaurants WHERE id=$1`, restaurantID).Scan(&id)
	if err != nil {
		return 0
	}
	tenantCacheSet(key, id)
	return id
}

// tenantCache bounds the repeated tenant/domain/outlet lookups that were
// previously issued on every single request. Entries expire after
// TENANT_CACHE_TTL_SECS (default 300) so new tenants propagate quickly.
// InvalidateTenantCache() is called after provisioning.
var tenantCache = struct {
	sync.RWMutex
	items map[string]tenantCacheEntry
}{items: make(map[string]tenantCacheEntry)}

type tenantCacheEntry struct {
	value     int
	expiresAt time.Time
}

func tenantCacheGet(key string) (int, bool) {
	tenantCache.RLock()
	e, ok := tenantCache.items[key]
	tenantCache.RUnlock()
	if !ok || time.Now().After(e.expiresAt) {
		return 0, false
	}
	return e.value, true
}

func tenantCacheSet(key string, value int) {
	if tenantCacheTTL() <= 0 || value == 0 {
		return
	}
	tenantCache.Lock()
	tenantCache.items[key] = tenantCacheEntry{value: value, expiresAt: time.Now().Add(tenantCacheTTL())}
	tenantCache.Unlock()
}

// InvalidateTenantCache clears all cached tenant resolution (call after
// provisioning a new restaurant/outlet so it is discoverable immediately).
func InvalidateTenantCache() {
	tenantCache.Lock()
	tenantCache.items = make(map[string]tenantCacheEntry)
	tenantCache.Unlock()
}

// DefaultRestaurantID returns the first restaurant (bootstrap tenant).
func DefaultRestaurantID() int {
	if v, ok := tenantCacheGet("default_restaurant"); ok {
		return v
	}
	if database.DB == nil {
		return 0
	}
	var id int
	if err := database.DB.QueryRow(
		`SELECT id FROM restaurants ORDER BY id LIMIT 1`).Scan(&id); err != nil {
		return 0
	}
	tenantCacheSet("default_restaurant", id)
	return id
}

// DefaultOutletID returns the first active outlet of a restaurant.
func DefaultOutletID(restaurantID int) int {
	if database.DB == nil {
		return 0
	}
	key := "default_outlet:" + strconv.Itoa(restaurantID)
	if v, ok := tenantCacheGet(key); ok {
		return v
	}
	var id int
	err := database.DB.QueryRow(
		`SELECT id FROM outlets WHERE restaurant_id = $1 AND active = true ORDER BY sort_order, id LIMIT 1`,
		restaurantID).Scan(&id)
	if err != nil {
		return 0
	}
	tenantCacheSet(key, id)
	return id
}

// RestaurantCurrency returns the ISO-4217 currency code for a restaurant.
// Falls back to "USD" if not found or DB unavailable.
func RestaurantCurrency(restaurantID int) string {
	if database.DB == nil {
		return "USD"
	}
	rid := ResolveRestaurant(restaurantID)
	var currency string
	err := database.DB.QueryRow(
		`SELECT currency FROM restaurants WHERE id = $1`, rid).Scan(&currency)
	if err != nil || currency == "" {
		return "USD"
	}
	return currency
}

// CurrencyAuthority describes the single authoritative operating currency
// for a restaurant. One restaurant → one currency: configs, POS, website,
// receipts, and channels consume this block instead of keeping their own
// currency values. Integer ledger semantics are unchanged (minor units);
// no FX or multi-currency conversion exists.
type CurrencyAuthority struct {
	Code      string `json:"code"`
	Symbol    string `json:"symbol"`
	Locale    string `json:"locale"`
	MinorUnit int    `json:"minor_unit"`
}

// RestaurantCurrencyAuthority returns the authoritative currency block for
// a restaurant, resolved from restaurants.currency (D2 bootstrap default).
func RestaurantCurrencyAuthority(restaurantID int) CurrencyAuthority {
	code := RestaurantCurrency(restaurantID)
	info := currency.Lookup(code)
	return CurrencyAuthority{
		Code:      info.Code,
		Symbol:    info.Symbol,
		Locale:    info.Locale,
		MinorUnit: info.MinorUnit,
	}
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
// In GIN_MODE=release (production), default is false (fail-closed) to avoid accidental tenant isolation bypass via deployment misconfiguration.
func IsSingleTenantMode() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("SINGLE_TENANT_MODE")))
	if v == "" {
		if os.Getenv("GIN_MODE") == "release" {
			return false
		}
		// open-source only default: allow fallback to bootstrap tenant
		return true
	}
	if v == "0" || v == "false" || v == "no" || v == "off" {
		return false
	}
	return true
}

// singleTenantFallbackWarn keeps the single-tenant fallback notice to one line
// per process instead of one per request.
var singleTenantFallbackWarn sync.Once

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
		// This fallback applies to every unscoped request; logging it per call
		// floods stdout under load (thousands of identical lines/sec). It is a
		// startup configuration fact, so emit it once per process.
		singleTenantFallbackWarn.Do(func() {
			log.Printf("[WARN] single-tenant fallback active: no restaurant context, falling back to bootstrap restaurant %d (SINGLE_TENANT_MODE fallback)", rid)
		})
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
