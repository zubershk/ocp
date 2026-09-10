package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
)

// ------------------------------------------------------------------
// Server-side totals (PR 5 hardening 4/6).
//
// Security requirement, not just correctness: the client never
// decides the payable amount. Every mutation that can change what
// an order costs (create, discount apply/remove) ends here:
//
//	items (menu-authoritative prices)
//	 ↓
//	canonical pricing (size + crust, paise)
//	 ↓
//	discount (validated rule)
//	 ↓
//	tax (restaurant rate)
//	 ↓
//	authoritative totals persisted on the order
//
// CalculatePOSPrice stays advisory-only for UI estimates; the submit
// path always recalculates through RecalculateOrderTotals.
// ------------------------------------------------------------------

// ComputeTotalsFromLines applies discount then tax to a subtotal.
// All values in paise. The discount is capped at the subtotal so a
// flat discount can never drive the total negative.
func ComputeTotalsFromLines(subtotalPaise int64, discountType string, discountValuePaise int64, taxPercentPaise int64) (discountPaise, taxPaise, totalPaise int64) {
	afterDiscount, discountPaise := ComputeDiscountAmount(subtotalPaise, discountType, discountValuePaise)
	if discountPaise > subtotalPaise {
		discountPaise = subtotalPaise
	}
	if taxPercentPaise > 0 {
		taxPaise = (afterDiscount * taxPercentPaise) / 10000
	}
	totalPaise = afterDiscount + taxPaise
	return discountPaise, taxPaise, totalPaise
}

// paiseToRupees converts minor units for DECIMAL(10,2) columns.
func paiseToRupees(paise int64) float64 {
	return float64(paise) / 100
}

// dbQuerier is satisfied by both *sql.DB and *sql.Tx, so total
// recalculation can run inside a caller's transaction (creation) or
// in its own (discount apply/remove).
type dbQuerier interface {
	QueryRow(query string, args ...any) *sql.Row
	Query(query string, args ...any) (*sql.Rows, error)
	Exec(query string, args ...any) (sql.Result, error)
}

// loadDiscountForRecalc resolves the order's linked discount into a
// validated (type, value-paise) pair. Unlinked, foreign, inactive,
// expired, or below-minimum discounts resolve to ("none", 0): totals
// stay correct even if the rule changed after linking.
func loadDiscountForRecalc(q dbQuerier, discountID sql.NullInt64, orderRestaurantID int, subtotalPaise int64, now time.Time) (string, int64) {
	if !discountID.Valid {
		return "none", 0
	}
	var dType string
	var dValue float64
	var active bool
	var startsAt, endsAt sql.NullTime
	var minSubtotal float64
	err := q.QueryRow(`
		SELECT type, value, active, starts_at, ends_at, min_subtotal
		FROM discounts WHERE id = $1 AND restaurant_id = $2`,
		discountID.Int64, orderRestaurantID).Scan(
		&dType, &dValue, &active, &startsAt, &endsAt, &minSubtotal)
	if err != nil {
		return "none", 0
	}
	rule := DiscountRule{Type: dType, Active: active, MinSubtotal: rounding(minSubtotal)}
	if startsAt.Valid {
		rule.StartsAt = startsAt.Time
	}
	if endsAt.Valid {
		rule.EndsAt = endsAt.Time
	}
	if dType == "percent" {
		rule.Value = int64(dValue * 100) // 10% -> 1000 (0-10000 scale)
	} else {
		rule.Value = rounding(dValue) // rupees -> paise
	}
	if ok, _ := ValidateDiscountRules(rule, subtotalPaise, now); !ok {
		return "none", 0
	}
	return dType, rule.Value
}

// RecalculateOrderTotals recomputes an order's subtotal, discount,
// tax, and total from menu-authoritative prices and persists them.
// Frozen (completed/cancelled) orders are rejected: history must not
// change. Returns the canonical summary in paise.
func RecalculateOrderTotals(orderID, restaurantID int) (PriceSummary, error) {
	return recalculateOrderTotalsTx(database.DB, orderID, restaurantID)
}

// recalculateOrderTotalsTx is RecalculateOrderTotals runnable inside an
// existing transaction — used by CreateOrder so header, lines, and
// totals commit atomically with no zero-total window in between.
func recalculateOrderTotalsTx(q dbQuerier, orderID, restaurantID int) (PriceSummary, error) {
	var summary PriceSummary

	var discountID sql.NullInt64
	var status string
	err := q.QueryRow(
		`SELECT discount_id, status FROM orders WHERE id = $1 AND restaurant_id = $2`,
		orderID, restaurantID).Scan(&discountID, &status)
	if err == sql.ErrNoRows {
		return summary, ErrOrderNotFound
	}
	if err != nil {
		return summary, err
	}
	if !CanMutateOrder(status) {
		return summary, fmt.Errorf("%w: cannot recalculate %q order", ErrInvalidOrderTransition, status)
	}

	rows, err := q.Query(
		`SELECT menu_item_id, quantity, options FROM order_items WHERE order_id = $1`,
		orderID)
	if err != nil {
		return summary, err
	}
	defer rows.Close()

	var subtotalPaise int64
	itemCount := 0
	for rows.Next() {
		var menuItemID, quantity int
		var optionsJSON []byte
		if err := rows.Scan(&menuItemID, &quantity, &optionsJSON); err != nil {
			return summary, err
		}
		var opts map[string]string
		_ = json.Unmarshal(optionsJSON, &opts)
		unitPaise, err := canonicalUnitPrice(q, menuItemID, opts["size"], opts["crust"], restaurantID)
		if err != nil {
			return summary, err
		}
		subtotalPaise += unitPaise * int64(quantity)
		itemCount += quantity
	}
	if err := rows.Err(); err != nil {
		return summary, err
	}

	dType, dValue := loadDiscountForRecalc(q, discountID, restaurantID, subtotalPaise, time.Now())

	var taxPercent float64
	_ = q.QueryRow(
		`SELECT COALESCE(tax_percent, 0) FROM restaurants WHERE id = $1`,
		restaurantID).Scan(&taxPercent)
	taxPercentPaise := int64(taxPercent * 100) // 5% -> 500

	discountPaise, taxPaise, totalPaise := ComputeTotalsFromLines(subtotalPaise, dType, dValue, taxPercentPaise)

	_, err = q.Exec(`
		UPDATE orders
		SET subtotal = $2, discount = $3, tax_amount = $4, total = $5,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`,
		orderID,
		paiseToRupees(subtotalPaise), paiseToRupees(discountPaise),
		paiseToRupees(taxPaise), paiseToRupees(totalPaise))
	if err != nil {
		return summary, err
	}

	summary = PriceSummary{
		Subtotal:  subtotalPaise,
		Discount:  discountPaise,
		Tax:       taxPaise,
		Total:     totalPaise,
		ItemCount: itemCount,
	}
	return summary, nil
}

// canonicalUnitPrice resolves one unit's price from the menu (not from
// any client-supplied amount): base/size price plus crust extra.
func canonicalUnitPrice(q dbQuerier, menuItemID int, size, crustSlug string, restaurantID int) (int64, error) {
	var name string
	var price float64
	var pr, pm, pl sql.NullFloat64
	err := q.QueryRow(`
		SELECT name, price, price_regular, price_medium, price_large
		FROM menu_items WHERE id = $1 AND active = true AND restaurant_id = $2`,
		menuItemID, restaurantID).Scan(&name, &price, &pr, &pm, &pl)
	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("item %d not found", menuItemID)
	}
	if err != nil {
		return 0, err
	}
	item := &models.MenuItem{Price: price}
	if pr.Valid {
		v := pr.Float64
		item.PriceRegular = &v
	}
	if pm.Valid {
		v := pm.Float64
		item.PriceMedium = &v
	}
	if pl.Valid {
		v := pl.Float64
		item.PriceLarge = &v
	}
	item.BuildPriceBySize()
	unitPaise, _, err := pricingFromItemQ(q, item, size, crustSlug, restaurantID)
	if err != nil {
		return 0, err
	}
	return unitPaise, nil
}
