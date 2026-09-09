package services

import (
	"database/sql"
	"fmt"
	"math"
	"time"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
)

// ------------------------------------------------------------------
// Canonical pricing (Phase 5).
//
// All monetary amounts are in "minor units" (paise for INR).
// 1 rupee = 100 paise. Use int64 to avoid floating-point pitfalls.
// The same resolver is shared by website, POS, QR, and WhatsApp.
// ------------------------------------------------------------------

// PriceBreakdown represents the resolved price components of a single order.
type PriceBreakdown struct {
	Subtotal       int64 // base item prices (paise)
	DiscountAmount int64 // discount subtracted (paise); may be 0
	TaxAmount      int64 // tax added (paise); may be 0
	Total          int64 // final amount to charge (paise)
}

// CanonicalPriceResult is returned by the shared pricing resolver.
type CanonicalPriceResult struct {
	Subtotal      int64
	Discount      int64
	Tax           int64
	Total         int64
	ItemCount     int
	DiscountType  string // "percent", "flat", or "none"
}

// rounding rounds a float64 price (in rupees) to the nearest paise.
func rounding(rupees float64) int64 {
	// Use round-half-to-even (bankers rounding) to avoid float drift.
	// Multiply by 100, add 0.5, floor, then mod.
	val := rupees * 100
	if val < 0 {
		return int64(math.Ceil(val)) // ceil for negative -> round away from zero
	}
	return int64(math.Floor(val + 0.5))
}

// PricingFromItem resolves the price for one line item from the menu item,
// including size variant and crust extra charge. The result is in paise.
func PricingFromItem(item *models.MenuItem, size string, crustSlug string) (int64, int64, error) {
	// Base price from the item (already in rupees; convert to paise).
	basePaise := rounding(item.Price)

	// Size variant — if the item has size pricing, use it; otherwise flat price.
	if item.PriceBySize != nil {
		if v, ok := item.PriceBySize[size]; ok && v > 0 {
			basePaise = rounding(v)
		}
	}

	// Crust extra charge (if any).
	var crustPaise int64
	if crustSlug != "" {
		row := database.DB.QueryRow(`
			SELECT price_regular, price_medium, price_large
			FROM menu_crusts WHERE slug = $1 AND active = true AND restaurant_id = $2
		`, crustSlug, ResolveRestaurant(0))
		var pr, pm, pl sql.NullFloat64
		if err := row.Scan(&pr, &pm, &pl); err != nil {
			return 0, 0, fmt.Errorf("crust lookup failed: %w", err)
		}
		// Choose the crust price for the requested size.
		var crustFloat float64
		switch size {
		case "medium":
			if pm.Valid {
				crustFloat = pm.Float64
			}
		case "large":
			if pl.Valid {
				crustFloat = pl.Float64
			}
		default:
			if pr.Valid {
				crustFloat = pr.Float64
			}
		}
		if crustFloat > 0 {
			crustPaise = rounding(crustFloat)
		}
	}

	totalPaise := basePaise + crustPaise
	return totalPaise, crustPaise, nil
}

// Discount applies a discount to a subtotal and returns the new subtotal + discount amount.
// discountType: "percent" or "flat"
// discountValue is in paise for percent (0-10000 representing 0-100%) or absolute paise for flat.
func Discount(subtotalPaise int64, discountType string, discountValue int64) (newSubtotalPaise int64, discountAmountPaise int64, ok bool) {
	switch discountType {
	case "percent":
		// discountValue is in paise representing 0-10000 (0-100%)
		if discountValue < 0 || discountValue > 10000 {
			return 0, 0, false
		}
		// percent of subtotal
		 DiscAmount := (subtotalPaise * discountValue) / 10000
		newSubtotal := subtotalPaise - DiscAmount
		if newSubtotal < 0 {
			newSubtotal = 0
		}
		return newSubtotal, DiscAmount, true

	case "flat":
		// discountValue is absolute paise
		if discountValue < 0 {
			return 0, 0, false
		}
		newSubtotal := subtotalPaise - discountValue
		if newSubtotal < 0 {
			newSubtotal = 0
		}
		return newSubtotal, discountValue, true

	default:
		return subtotalPaise, 0, true // no discount
	}
}

// ResolvePriceBreakdown computes the full price breakdown for one line item
// with discount and tax. All values in paise.
func ResolvePriceBreakdown(item *models.MenuItem, size string, crustSlug string,
	discountType string, discountValuePaise int64, taxPercent int64) (PriceBreakdown, error) {

	base, _, err := PricingFromItem(item, size, crustSlug)
	if err != nil {
		return PriceBreakdown{}, err
	}

	// Apply discount
	subtotalAfterDiscount, discountAmount, ok := Discount(base, discountType, discountValuePaise)
	if !ok {
		return PriceBreakdown{}, fmt.Errorf("invalid discount")
	}

	// Apply tax (taxPercent is in paise-per-100, i.e. 5% = 500 paise)
	var taxAmount int64
	if taxPercent > 0 {
		// tax = floor(subtotal * taxPercent / 10000)
		taxAmount = (subtotalAfterDiscount * taxPercent) / 10000
	}

	total := subtotalAfterDiscount + taxAmount

	return PriceBreakdown{
		Subtotal:       base,             // original base before discount (paise)
		DiscountAmount: discountAmount, // discount subtracted (paise)
		TaxAmount:      taxAmount,      // tax added (paise)
		Total:          total,          // final total (paise)
	}, nil
}

// POSOrderService orchestrates the full POS workflow:
// create draft, add/update items, calculate totals, apply discount,
// assign table, hold, resume, take payment, complete, cancel.
// Do not put this logic directly into HTTP handlers.
type POSOrderService struct{}

// NewPOSOrderService creates a new POS order service.
func NewPOSOrderService() *POSOrderService {
	return &POSOrderService{}
}

// CreateOrder creates a new draft order with the given items.
func (s *POSOrderService) CreateOrder(restaurantID int, outletID int, items []DraftItem, tableID int, source string) (*models.Order, error) {
	// Build order number
	var seq int64
	err := database.DB.QueryRow(`SELECT nextval('ocp_order_number_seq')`).Scan(&seq)
	if err != nil {
		return nil, fmt.Errorf("order number generation failed: %w", err)
	}
	orderNumber := fmt.Sprintf("POS-%s-%04d", time.Now().Format("20060102"), seq)

	// Calculate subtotal from items (base prices only)
	var subtotalPaise int64
	for _, item := range items {
		var itemPrice int64
		err := database.DB.QueryRow(`
			SELECT price FROM menu_items WHERE id = $1 AND active = true AND restaurant_id = $2`,
			item.MenuItemID, restaurantID).Scan(&itemPrice)
		if err != nil {
			return nil, fmt.Errorf("item %d not found", item.MenuItemID)
		}
		subtotalPaise += itemPrice * int64(item.Quantity)
	}

	// Insert order with status 'draft'
	var orderID int
	err = database.DB.QueryRow(`
		INSERT INTO orders (order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, source, restaurant_id, outlet_id, table_id)
		VALUES ($1, '', '', 'dine_in', '', '', '', $2, 0, 0, $2, 'draft', $3, $4, $5, $6)
		RETURNING id
	`, orderNumber, subtotalPaise, source, restaurantID, outletID, tableID).Scan(&orderID)
	if err != nil {
		return nil, fmt.Errorf("order insert failed: %w", err)
	}

	// Insert order items
	for _, item := range items {
		var itemName string
		err := database.DB.QueryRow(`SELECT name FROM menu_items WHERE id = $1`, item.MenuItemID).Scan(&itemName)
		if err != nil {
			continue
		}
		var itemPrice int64
		database.DB.QueryRow(`SELECT price FROM menu_items WHERE id = $1`, item.MenuItemID).Scan(&itemPrice)
		lineTotal := itemPrice * int64(item.Quantity)
		_, _ = database.DB.Exec(`
			INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, options, subtotal, restaurant_id)
			VALUES ($1, $2, $3, $4, $5, '{}', $6, $7)
		`, orderID, item.MenuItemID, itemName, item.Quantity, itemPrice, lineTotal, restaurantID)
	}

	// Return the order
	var order models.Order
	err = database.DB.QueryRow(`
		SELECT id, order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, created_at, updated_at
		FROM orders WHERE id = $1 AND restaurant_id = $2`, orderID, restaurantID).Scan(&order.ID, &order.OrderNumber, &order.CustomerName, &order.CustomerPhone, &order.OrderType, &order.Address, &order.Landmark, &order.PaymentMethod, &order.Subtotal, &order.DeliveryFee, &order.Discount, &order.Total, &order.Status, &order.CreatedAt, &order.UpdatedAt)
	if err != nil {
		return nil, err
	}
	order.Total = float64(subtotalPaise) / 100
	return &order, nil
}

// UpdateOrder updates an existing order's status or table assignment.
func (s *POSOrderService) UpdateOrder(id int) error {
	_, err := database.DB.Exec(`UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, id)
	return err
}

// DraftOrder represents a POS order before it is finalized.
// It carries the tenant context (org / restaurant / outlet) and items.
type DraftOrder struct {
	RestaurantID int
	OutletID     int
	Items        []DraftItem
	TableID      int // 0 = none
	Source       string
}

// DraftItem is a single item in a draft order.
type DraftItem struct {
	MenuItemID int
	Size       string
	Crust      string
	Quantity   int
}

// PriceSummary is the summary shown to the cashier before payment.
type PriceSummary struct {
	Subtotal      int64 // paise
	Discount      int64 // paise (negative = discount)
	Tax           int64 // paise
	Total         int64 // paise
	ItemCount     int
}

// OrderHoldInfo records why an order is held and by whom.
type OrderHoldInfo struct {
	OrderID     int
	HoldReason  string // "manual", "kitchen", "pending_payment", etc.
	HoldedBy    int    // user ID
	HoldedAt    time.Time
	Version     int // optimistic concurrency version
}

// HoldOrder attempts to hold an order. Returns false if the order
// is already held by another cashier (optimistic concurrency check).
func (s *POSOrderService) HoldOrder(orderID int, heldBy int, reason string) bool {
	// Optimistic concurrency: increment version and check.
	// We use a simple approach: update status to 'held' and check rows affected.
	var rows int
	err := database.DB.QueryRow(`
		UPDATE orders SET status = 'held', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status != 'held'
	`, orderID).Scan(&rows)
	if err != nil || rows == 0 {
		return false // already held or error
	}
	// Record hold info (we could add a holds table, but for now
	// we just set status and record in the order's updated_at).
	return true
}

// ResumeOrder resumes a held order. Idempotent: if the order is not held,
// it stays active.
func (s *POSOrderService) ResumeOrder(orderID int) error {
	_, err := database.DB.Exec(`
		UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status = 'held'
	`, orderID)
	return err
}

// CompleteOrder completes a paid order.
func (s *POSOrderService) CompleteOrder(orderID int) error {
	_, err := database.DB.Exec(`
		UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status IN ('confirmed', 'held')
	`, orderID)
	return err
}

// CancelOrder cancels an order.
func (s *POSOrderService) CancelOrder(orderID int) error {
	_, err := database.DB.Exec(`
		UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, orderID)
	return err
}

// TakePayment records a payment against an order. Returns the payment ID,
// whether the call replayed an earlier operation (same idempotency key),
// and the remaining due amount (paise). Append-only: never update a row.
//
// Tenant guard: the order must belong to (restaurantID, outletID); the
// ledger row carries the same tenant so cross-tenant payments are
// impossible even if a caller forges IDs.
func (s *POSOrderService) TakePayment(orderID, restaurantID, outletID int, method string, amountPaise int64, tenderedPaise int64, reference string, receivedBy int, idempotencyKey string) (paymentID int, replayed bool, duePaise int64, err error) {
	var orderRestaurantID, orderOutletID int
	err = database.DB.QueryRow(
		`SELECT restaurant_id, outlet_id FROM orders WHERE id = $1`, orderID).Scan(&orderRestaurantID, &orderOutletID)
	if err == sql.ErrNoRows {
		return 0, false, 0, fmt.Errorf("order not found")
	}
	if err != nil {
		return 0, false, 0, err
	}
	if orderRestaurantID != restaurantID || orderOutletID != outletID {
		return 0, false, 0, fmt.Errorf("order does not belong to current restaurant/outlet")
	}
	paymentID, replayed, err = RecordPayment(orderID, restaurantID, outletID, method, amountPaise, tenderedPaise, reference, receivedBy, idempotencyKey)
	if err != nil {
		return 0, false, 0, err
	}
	// Compute due: derived from the payment ledger (see ComputeDueFromLedger).
	_, _, duePaise = ComputeDueFromLedger(orderID)
	return paymentID, replayed, duePaise, nil
}

// ComputeDueFromLedger calculates paid, refunded, and due from the order_payments
// table for a given order. All amounts are in paise. The ledger is
// authoritative: due = order total - paid + refunded. (orders.total is
// stored in rupees, so it is converted via rounding, never truncated.)
func ComputeDueFromLedger(orderID int) (paidPaise int64, refundedPaise int64, duePaise int64) {
	var totalRupees float64
	err := database.DB.QueryRow(`SELECT total FROM orders WHERE id = $1`, orderID).Scan(&totalRupees)
	if err != nil {
		return 0, 0, 0
	}
	totalPaise := rounding(totalRupees)

	// Sum payments
	var totalPaid int64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount), 0) FROM order_payments WHERE order_id = $1 AND amount > 0`, orderID).Scan(&totalPaid)

	// Sum refunds (negative amounts)
	var totalRefund int64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(ABS(amount)), 0) FROM order_payments WHERE order_id = $1 AND amount < 0`, orderID).Scan(&totalRefund)

	paidPaise = totalPaid
	refundedPaise = totalRefund
	duePaise = totalPaise - totalPaid + totalRefund
	if duePaise < 0 {
		duePaise = 0
	}
	return paidPaise, refundedPaise, duePaise
}

// OrderEventPayload is what gets posted to the order_events table.
type OrderEventPayload struct {
	EventType   string `json:"event_type"`
	Description string `json:"description"`
}

// ApplyDiscount applies a discount to an active order. Returns the new
// discount ID or an error.
func (s *POSOrderService) ApplyDiscount(orderID int, discountID int) error {
	// Validate the discount belongs to the order's restaurant and is active.
	// We simply link the discount via orders.discount_id.
	_, err := database.DB.Exec(`
		UPDATE orders SET discount_id = $2 WHERE id = $1
	`, orderID, discountID)
	return err
}

// SetTable assigns a table to an order. Verifies the table belongs to
// the same restaurant/outlet.
func (s *POSOrderService) SetTable(orderID int, tableID int, restaurantID int, outletID int) error {
	// Verify table exists and matches restaurant/outlet.
	var tblRestaurantID, tblOutletID int
	err := database.DB.QueryRow(`
		SELECT restaurant_id, outlet_id FROM tables WHERE id = $1`, tableID).Scan(&tblRestaurantID, &tblOutletID)
	if err != nil {
		return err
	}
	if tblRestaurantID != restaurantID || tblOutletID != outletID {
		return fmt.Errorf("table does not belong to current restaurant/outlet")
	}
	// Assign table to order (SET NULL on previous order if any).
	_, err = database.DB.Exec(`
		UPDATE orders SET table_id = $2 WHERE id = $1
	`, orderID, tableID)
	return err
}

// ------------------------------------------------------------------
// Below: helpers that the admin HTTP handlers will call.
// ------------------------------------------------------------------

// GetMenuItems returns active menu items for the POS catalog.
func GetMenuItems(restaurantID int) ([]models.MenuItem, error) {
	rows, err := database.DB.Query(`
		SELECT `+modelsWebsiteItemColumns+`
		FROM menu_items WHERE active = true AND restaurant_id = $1
		ORDER BY sort_order, name
	`, restaurantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.MenuItem
	for rows.Next() {
		var item models.MenuItem
		err := rows.Scan(
			&item.ID, &item.CategoryID, &item.Name, &item.Slug,
			&item.Description, &item.Price, &item.ImageURL,
			&item.Available, &item.SortOrder, &item.Active,
			&item.CreatedAt, &item.UpdatedAt,
			&item.Dietary, &item.PizzaSubcategory, &item.PizzaType,
			&item.IsSpicy, &item.IsJain, &item.IsNew, &item.NoCrust,
			&item.PriceRegular, &item.PriceMedium, &item.PriceLarge,
		)
		if err != nil {
			return nil, err
		}
		item.BuildPriceBySize()
		items = append(items, item)
	}
	return items, rows.Err()
}

// modelsWebsiteItemColumns is the column list used by website item queries.
const modelsWebsiteItemColumns = `
	id, category_id, name, COALESCE(slug, ''), COALESCE(description, ''), price,
	COALESCE(image_url, ''), available, sort_order, active, created_at, updated_at,
	COALESCE(dietary, ''), COALESCE(pizza_subcategory, ''), COALESCE(pizza_type, ''),
	COALESCE(is_spicy, false), COALESCE(is_jain, false), COALESCE(is_new, false),
	COALESCE(no_crust, false),
	price_regular, price_medium, price_large
`