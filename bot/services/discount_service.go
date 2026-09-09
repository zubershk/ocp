package services

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Discount service (Phase 5).
//
// Defines business rules for percent / flat discounts, restaurant-scoped
// codes, and manual/open discounts. Validates at the point of application.
// ------------------------------------------------------------------

// DiscountRule is the business-rule container for a discount.
type DiscountRule struct {
	ID          int
	RestaurantID int
	Name         string
	Code         string // "" = manual/open; non-empty = code-based
	Type         string // "percent" or "flat"
	Value        int64 // paise: 0–10000 for percent, absolute for flat
	Active       bool
	MinSubtotal  int64 // paise; 0 = no minimum
	StartsAt     time.Time
	EndsAt       time.Time
}

// ValidateDiscountRules checks that a discount can be applied to an order.
// Returns ok=false if any rule fails.
func ValidateDiscountRules(rule DiscountRule, orderSubtotalPaise int64,
	currentTime time.Time) (ok bool, reason string) {

	// Active check
	if !rule.Active {
		return false, "discount is not active"
	}

	// Time window check
	if !rule.StartsAt.IsZero() && currentTime.Before(rule.StartsAt) {
		return false, "discount not yet valid"
	}
	if !rule.EndsAt.IsZero() && currentTime.After(rule.EndsAt) {
		return false, "discount has expired"
	}

	// MinSubtotal check
	if rule.MinSubtotal > 0 && orderSubtotalPaise < rule.MinSubtotal {
		return false, fmt.Sprintf("order subtotal %d paise below minimum %d paise",
			orderSubtotalPaise, rule.MinSubtotal)
	}

	// Percent range check
	if rule.Type == "percent" {
		if rule.Value < 0 || rule.Value > 10000 {
			return false, "percent discount must be 0–100%"
		}
	}

	// Flat discount must not produce negative subtotal (checked by caller
	// via Discount() but we flag it here too).
	if rule.Type == "flat" && rule.Value > orderSubtotalPaise {
		// Not fatal; the Discount() function caps it, but we log.
		reason = "flat discount would exceed subtotal; capped at subtotal"
	}

	return true, ""
}

// GetDiscountByCode returns the discount rule for a given code at a
// restaurant, or nil if not found.
func GetDiscountByCode(restaurantID int, code string) *DiscountRule {
	var rule DiscountRule
	err := database.DB.QueryRow(`
		SELECT id, restaurant_id, name, code, type, value, active,
		       starts_at, ends_at, min_subtotal
		FROM discounts WHERE restaurant_id = $1 AND code = $2`,
		restaurantID, code).Scan(
		&rule.ID, &rule.RestaurantID, &rule.Name, &rule.Code,
		&rule.Type, &rule.Value, &rule.Active,
		&rule.StartsAt, &rule.EndsAt, &rule.MinSubtotal)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return nil
	}
	return &rule
}

// GetDiscountByID returns the discount rule by its internal ID.
func GetDiscountByID(discountID int) *DiscountRule {
	var rule DiscountRule
	err := database.DB.QueryRow(`
		SELECT id, restaurant_id, name, code, type, value, active,
		       starts_at, ends_at, min_subtotal
		FROM discounts WHERE id = $1`, discountID).Scan(
		&rule.ID, &rule.RestaurantID, &rule.Name, &rule.Code,
		&rule.Type, &rule.Value, &rule.Active,
		&rule.StartsAt, &rule.EndsAt, &rule.MinSubtotal)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return nil
	}
	return &rule
}

// ListActiveDiscounts returns all active discounts for a restaurant.
func ListActiveDiscounts(restaurantID int, currentTime time.Time) ([]DiscountRule, error) {
	rows, err := database.DB.Query(`
		SELECT id, restaurant_id, name, code, type, value, active,
		       starts_at, ends_at, min_subtotal
		FROM discounts WHERE restaurant_id = $1 AND active = true`, restaurantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []DiscountRule
	for rows.Next() {
		var r DiscountRule
		if err := rows.Scan(
			&r.ID, &r.RestaurantID, &r.Name, &r.Code,
			&r.Type, &r.Value, &r.Active,
			&r.StartsAt, &r.EndsAt, &r.MinSubtotal); err != nil {
			return nil, err
		}
		ok, _ := ValidateDiscountRules(r, 0, currentTime) // subtotal checked by caller
		if ok {
			rules = append(rules, r)
		}
	}
	return rules, rows.Err()
}

// ApplyDiscountToOrder links a discount to an order, then recalculates
// the authoritative totals server-side. The resolved discount amount is
// never accepted from the client.
func ApplyDiscountToOrder(orderID int, discountID int) error {
	// Verify the discount exists and is active.
	rule := GetDiscountByID(discountID)
	if rule == nil {
		return errors.New("discount not found")
	}
	ok, _ := ValidateDiscountRules(*rule, 0, time.Now())
	if !ok {
		return errors.New("discount not applicable at this time")
	}
	var restaurantID int
	err := database.DB.QueryRow(
		`SELECT restaurant_id FROM orders WHERE id = $1`, orderID).Scan(&restaurantID)
	if err != nil {
		return err
	}
	if rule.RestaurantID != restaurantID {
		return errors.New("discount does not belong to current restaurant")
	}
	// Link discount to order.
	if _, err := database.DB.Exec(`
		UPDATE orders SET discount_id = $2 WHERE id = $1`, orderID, discountID); err != nil {
		return err
	}
	_, err = RecalculateOrderTotals(orderID, restaurantID)
	return err
}

// RemoveDiscountFromOrder clears the discount link on an order, then
// recalculates the authoritative totals server-side.
func RemoveDiscountFromOrder(orderID int) error {
	var restaurantID int
	err := database.DB.QueryRow(
		`SELECT restaurant_id FROM orders WHERE id = $1`, orderID).Scan(&restaurantID)
	if err != nil {
		return err
	}
	if _, err := database.DB.Exec(`
		UPDATE orders SET discount_id = NULL WHERE id = $1`, orderID); err != nil {
		return err
	}
	_, err = RecalculateOrderTotals(orderID, restaurantID)
	return err
}

// ComputeDiscountAmount resolves the monetary amount of a discount given
// its type and value, applied to a subtotal. All values in paise.
func ComputeDiscountAmount(subtotalPaise int64, dType string, valuePaise int64) (newSubtotal int64, discountAmount int64) {
	switch dType {
	case "percent":
		// valuePaise is 0–10000 representing 0–100%
		if valuePaise < 0 || valuePaise > 10000 {
			return subtotalPaise, 0
		}
		amount := (subtotalPaise * valuePaise) / 10000
		newSubtotal = subtotalPaise - amount
		if newSubtotal < 0 {
			newSubtotal = 0
		}
		return newSubtotal, amount

	case "flat":
		if valuePaise < 0 {
			return subtotalPaise, 0
		}
		newSubtotal := subtotalPaise - valuePaise
		if newSubtotal < 0 {
			newSubtotal = 0
		}
		return newSubtotal, valuePaise

	default:
		return subtotalPaise, 0
	}
}