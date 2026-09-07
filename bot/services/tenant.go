package services

import (
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
	var id int
	if err := database.DB.QueryRow(
		`SELECT id FROM restaurants ORDER BY id LIMIT 1`).Scan(&id); err != nil {
		return 0
	}
	return id
}

// DefaultOutletID returns the first active outlet of a restaurant.
func DefaultOutletID(restaurantID int) int {
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
func ResolveRestaurant(restaurantID int) int {
	if restaurantID > 0 {
		return restaurantID
	}
	return DefaultRestaurantID()
}
