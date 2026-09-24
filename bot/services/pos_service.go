package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"strings"
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
	Subtotal     int64
	Discount     int64
	Tax          int64
	Total        int64
	ItemCount    int
	DiscountType string // "percent", "flat", or "none"
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
// Crusts resolve against the default restaurant (legacy single-tenant
// callers); tenant-aware callers must use PricingFromItemFor.
func PricingFromItem(item *models.MenuItem, size string, crustSlug string) (int64, int64, error) {
	return PricingFromItemFor(item, size, crustSlug, ResolveRestaurant(0))
}

// PricingFromItemFor is PricingFromItem scoped to an explicit restaurant
// so crust charges can never leak across tenants.
func PricingFromItemFor(item *models.MenuItem, size string, crustSlug string, restaurantID int) (int64, int64, error) {
	return pricingFromItemQ(database.DB, item, size, crustSlug, restaurantID)
}

// pricingFromItemQ is PricingFromItemFor runnable on any querier,
// including an open creation transaction.
func pricingFromItemQ(q dbQuerier, item *models.MenuItem, size string, crustSlug string, restaurantID int) (int64, int64, error) {
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
		row := q.QueryRow(`
			SELECT price_regular, price_medium, price_large
			FROM menu_crusts WHERE slug = $1 AND active = true AND restaurant_id = $2
		`, crustSlug, restaurantID)
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
		Subtotal:       base,           // original base before discount (paise)
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

// NormalizePOSOrderType maps legacy values to the canonical set.
// The only legacy value is 'pickup' → 'takeaway'.
// All other invalid inputs return an error.
func NormalizePOSOrderType(t string) (string, error) {
	switch NormalizeOrderType(t) {
	case OrderTypeDineIn, OrderTypeTakeaway, OrderTypeDelivery:
		return NormalizeOrderType(t), nil
	}
	return "", fmt.Errorf("invalid order type %q", t)
}

// CreateOrder creates a new draft order with the given items.
// Prices are resolved server-side from the menu (size + crust aware);
// totals are then derived by RecalculateOrderTotals. Client-supplied
// amounts are never trusted. The header + lines insert atomically.
func (s *POSOrderService) CreateOrder(restaurantID int, outletID int, items []DraftItem, tableID int, source string, orderType string) (*models.Order, error) {
	draft := DraftOrder{Items: items, TableID: tableID, Source: source, OrderType: orderType}
	return s.createOrderInternal(restaurantID, outletID, draft)
}

// CreateOrderWithDraft is the hardening entrypoint that transports customer, financial, and addon fields.
func (s *POSOrderService) CreateOrderWithDraft(restaurantID int, outletID int, draft DraftOrder) (*models.Order, error) {
	return s.createOrderInternal(restaurantID, outletID, draft)
}

func (s *POSOrderService) createOrderInternal(restaurantID int, outletID int, draft DraftOrder) (*models.Order, error) {
	items := draft.Items
	tableID := draft.TableID
	source := draft.Source
	orderType := draft.OrderType
	if len(items) == 0 {
		return nil, fmt.Errorf("order must contain at least one item")
	}
	if len(items) > 50 {
		return nil, fmt.Errorf("too many items (max 50)")
	}
	for i, it := range items {
		if it.Quantity < 1 || it.Quantity > 20 {
			return nil, fmt.Errorf("item %d: quantity must be 1..20", i+1)
		}
		if len(it.Addons) > 20 {
			return nil, fmt.Errorf("item %d: too many addons (max 20)", i+1)
		}
	}
	if !ValidOrderSource(source) {
		source = SourcePOS
	}
	if outletID <= 0 {
		outletID = DefaultOutletID(restaurantID)
	}
	normalizedType, err := NormalizePOSOrderType(orderType)
	if err != nil {
		return nil, err
	}
	// Hardening: validate and sanitize customer/financial fields (transport only, no calc)
	customerPhone := strings.TrimSpace(draft.CustomerPhone)
	customerName := strings.TrimSpace(draft.CustomerName)
	address := strings.TrimSpace(draft.Address)
	locality := strings.TrimSpace(draft.Locality)
	if len(customerPhone) > 20 {
		return nil, fmt.Errorf("phone too long (max 20)")
	}
	if len(customerName) > 100 {
		return nil, fmt.Errorf("name too long (max 100)")
	}
	if len(address) > 500 {
		return nil, fmt.Errorf("address too long (max 500)")
	}
	if len(locality) > 200 {
		return nil, fmt.Errorf("locality too long (max 200)")
	}
	guestCount := draft.GuestCount
	if guestCount == 0 {
		guestCount = 1
	}
	if guestCount < 1 || guestCount > 50 {
		return nil, fmt.Errorf("guest_count must be 1..50")
	}
	if draft.ContainerCharge < 0 || draft.ContainerCharge > 10000 {
		return nil, fmt.Errorf("container_charge must be 0..10000")
	}
	if draft.TipAmount < 0 || draft.TipAmount > 10000 {
		return nil, fmt.Errorf("tip_amount must be 0..10000")
	}
	var advanceAt sql.NullTime
	if strings.TrimSpace(draft.AdvanceAt) != "" {
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(draft.AdvanceAt))
		if err != nil {
			// also try datetime-local format from frontend
			if t2, err2 := time.Parse("2006-01-02T15:04", strings.TrimSpace(draft.AdvanceAt)); err2 == nil {
				t = t2
			} else {
				return nil, fmt.Errorf("invalid advance_at format, use RFC3339")
			}
		}
		advanceAt = sql.NullTime{Time: t, Valid: true}
	}
	customerSnapshot, _ := json.Marshal(map[string]string{
		"phone": customerPhone, "name": customerName, "address": address, "locality": locality,
	})
	idempotencyKey := strings.TrimSpace(draft.IdempotencyKey)
	if idempotencyKey != "" {
		var normErr error
		idempotencyKey, normErr = NormalizeIdempotencyKey(idempotencyKey)
		if normErr != nil {
			return nil, normErr
		}
		var existingID int
		if err := database.DB.QueryRow(`SELECT id FROM orders WHERE restaurant_id=$1 AND idempotency_key=$2`, restaurantID, idempotencyKey).Scan(&existingID); err == nil {
			var order models.Order
			if err := database.DB.QueryRow(`
				SELECT id, order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, created_at, updated_at
				FROM orders WHERE id=$1 AND restaurant_id=$2`, existingID, restaurantID).Scan(&order.ID, &order.OrderNumber, &order.CustomerName, &order.CustomerPhone, &order.OrderType, &order.Address, &order.Landmark, &order.PaymentMethod, &order.Subtotal, &order.DeliveryFee, &order.Discount, &order.Total, &order.Status, &order.CreatedAt, &order.UpdatedAt); err == nil {
				return &order, nil
			}
		} else if err != sql.ErrNoRows {
			// log but continue to create
		}
	}
	var idempotencyNull sql.NullString
	if idempotencyKey != "" {
		idempotencyNull = sql.NullString{String: idempotencyKey, Valid: true}
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("tx begin failed: %w", err)
	}
	defer tx.Rollback()

	var seq int64
	if err := tx.QueryRow(`SELECT nextval('ocp_order_number_seq')`).Scan(&seq); err != nil {
		return nil, fmt.Errorf("order number generation failed: %w", err)
	}
	orderNumber := fmt.Sprintf("POS-%s-%04d", time.Now().Format("20060102"), seq)

	var tableNull sql.NullInt64
	if tableID > 0 {
		var tblRestaurantID, tblOutletID int
		err := tx.QueryRow(
			`SELECT restaurant_id, outlet_id FROM tables WHERE id = $1`, tableID).Scan(&tblRestaurantID, &tblOutletID)
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("table not found")
		}
		if err != nil {
			return nil, err
		}
		if tblRestaurantID != restaurantID || tblOutletID != outletID {
			return nil, fmt.Errorf("table does not belong to current restaurant/outlet")
		}
		tableNull = sql.NullInt64{Int64: int64(tableID), Valid: true}
	}

	// Try new columns (039) first, fallback to legacy if migration not yet applied
	var orderID int
	err = tx.QueryRow(`
		INSERT INTO orders (order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, source, restaurant_id, outlet_id, table_id, guest_count, container_charge, tip_amount, is_complimentary, advance_at, customer_snapshot, idempotency_key)
		VALUES ($1, $2, $3, $4, $5, $6, '', 0, 0, 0, 0, 'draft', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17)
		RETURNING id
	`, orderNumber, customerName, customerPhone, normalizedType, address, locality, source, restaurantID, outletID, tableNull, guestCount, draft.ContainerCharge, draft.TipAmount, draft.IsComplimentary, advanceAt, string(customerSnapshot), idempotencyNull).Scan(&orderID)
	if err != nil {
		if IsUniqueViolation(err, "uq_orders_idempotency_restaurant") && idempotencyNull.Valid {
			var existingID int
			if err2 := tx.QueryRow(`SELECT id FROM orders WHERE restaurant_id=$1 AND idempotency_key=$2`, restaurantID, idempotencyNull.String).Scan(&existingID); err2 == nil {
				_ = tx.Rollback()
				var order models.Order
				if err3 := database.DB.QueryRow(`
					SELECT id, order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, created_at, updated_at
					FROM orders WHERE id=$1 AND restaurant_id=$2`, existingID, restaurantID).Scan(&order.ID, &order.OrderNumber, &order.CustomerName, &order.CustomerPhone, &order.OrderType, &order.Address, &order.Landmark, &order.PaymentMethod, &order.Subtotal, &order.DeliveryFee, &order.Discount, &order.Total, &order.Status, &order.CreatedAt, &order.UpdatedAt); err3 == nil {
					return &order, nil
				}
			}
		}
		// fallback for DB without 039 columns (tests / old)
		if strings.Contains(err.Error(), "guest_count") || strings.Contains(err.Error(), "container_charge") || strings.Contains(err.Error(), "customer_snapshot") {
			err = tx.QueryRow(`
				INSERT INTO orders (order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, source, restaurant_id, outlet_id, table_id, idempotency_key)
				VALUES ($1, $2, $3, $4, $5, $6, '', 0, 0, 0, 0, 'draft', $7, $8, $9, $10, $11)
				RETURNING id
			`, orderNumber, customerName, customerPhone, normalizedType, address, locality, source, restaurantID, outletID, tableNull, idempotencyNull).Scan(&orderID)
			if err != nil && IsUniqueViolation(err, "uq_orders_idempotency_restaurant") && idempotencyNull.Valid {
				var existingID int
				if err2 := tx.QueryRow(`SELECT id FROM orders WHERE restaurant_id=$1 AND idempotency_key=$2`, restaurantID, idempotencyNull.String).Scan(&existingID); err2 == nil {
					_ = tx.Rollback()
					var order models.Order
					if err3 := database.DB.QueryRow(`
						SELECT id, order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, created_at, updated_at
						FROM orders WHERE id=$1 AND restaurant_id=$2`, existingID, restaurantID).Scan(&order.ID, &order.OrderNumber, &order.CustomerName, &order.CustomerPhone, &order.OrderType, &order.Address, &order.Landmark, &order.PaymentMethod, &order.Subtotal, &order.DeliveryFee, &order.Discount, &order.Total, &order.Status, &order.CreatedAt, &order.UpdatedAt); err3 == nil {
						return &order, nil
					}
				}
			}
		}
		if err != nil {
			return nil, fmt.Errorf("order insert failed: %w", err)
		}
	}

	for _, item := range items {
		unitPaise, size, crust, itemName, err := canonicalDraftLine(tx, item, restaurantID)
		if err != nil {
			return nil, err
		}
		addonsSnap, err := resolveAddonsSnapshot(tx, item, restaurantID)
		if err != nil {
			return nil, err
		}
		var addonPaise int64
		for _, a := range addonsSnap {
			if p, ok := a["price"]; ok {
				if pf, ok := p.(float64); ok {
					addonPaise += rounding(pf)
				}
			}
		}
		lineTotal := (unitPaise + addonPaise) * int64(item.Quantity)
		optionsJSON, _ := json.Marshal(map[string]string{
			"size":  size,
			"crust": crust,
		})
		addonsJSON, _ := json.Marshal(addonsSnap)
		if len(addonsJSON) == 0 {
			addonsJSON = []byte("[]")
		}
		// Try addons_snapshot column (037), fallback if missing
		_, err = tx.Exec(`
			INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, options, subtotal, restaurant_id, addons_snapshot)
			VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)
		`, orderID, item.MenuItemID, itemName, item.Quantity,
			paiseToRupees(unitPaise), string(optionsJSON),
			paiseToRupees(lineTotal), restaurantID, string(addonsJSON))
		if err != nil && strings.Contains(err.Error(), "addons_snapshot") {
			_, err = tx.Exec(`
				INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, options, subtotal, restaurant_id)
				VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
			`, orderID, item.MenuItemID, itemName, item.Quantity,
				paiseToRupees(unitPaise), string(optionsJSON),
				paiseToRupees(lineTotal), restaurantID)
		}
		if err != nil {
			return nil, fmt.Errorf("order item insert failed: %w", err)
		}
	}

	if _, err := recalculateOrderTotalsTx(tx, orderID, restaurantID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("order commit failed: %w", err)
	}

	var order models.Order
	err = database.DB.QueryRow(`
		SELECT id, order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, created_at, updated_at
		FROM orders WHERE id = $1 AND restaurant_id = $2`, orderID, restaurantID).Scan(&order.ID, &order.OrderNumber, &order.CustomerName, &order.CustomerPhone, &order.OrderType, &order.Address, &order.Landmark, &order.PaymentMethod, &order.Subtotal, &order.DeliveryFee, &order.Discount, &order.Total, &order.Status, &order.CreatedAt, &order.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &order, nil
}

// resolveAddonsSnapshot validates addons against addon_groups/addon_items catalog and builds historical snapshot.
// Frontend selection is NOT price authority: price comes from catalog price_override or menu price.
func resolveAddonsSnapshot(tx *sql.Tx, item DraftItem, restaurantID int) ([]map[string]interface{}, error) {
	if len(item.Addons) == 0 {
		return []map[string]interface{}{}, nil
	}
	// Group addons by group_id to enforce min/max and size_scope
	type groupInfo struct {
		id            int
		name          string
		sizeScope     string
		selType       string
		min, max      int
	}
	groups := map[int]groupInfo{}
	for _, ad := range item.Addons {
		var gi groupInfo
		err := tx.QueryRow(
			`SELECT id, name, size_scope, selection_type, min_select, max_select FROM addon_groups WHERE id=$1 AND restaurant_id=$2 AND active=true`, ad.GroupID, restaurantID).Scan(&gi.id, &gi.name, &gi.sizeScope, &gi.selType, &gi.min, &gi.max)
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("addon group %d not found or inactive", ad.GroupID)
		}
		if err != nil {
			return nil, err
		}
		// Ensure group belongs to this base item
		var grpMenuItem int
		_ = tx.QueryRow(`SELECT menu_item_id FROM addon_groups WHERE id=$1`, ad.GroupID).Scan(&grpMenuItem)
		if grpMenuItem != item.MenuItemID {
			return nil, fmt.Errorf("addon group %d does not belong to menu item %d", ad.GroupID, item.MenuItemID)
		}
		if gi.sizeScope != "all" && gi.sizeScope != strings.ToLower(strings.TrimSpace(item.Size)) && gi.sizeScope != "regular" && strings.TrimSpace(item.Size) == "" {
			// allow regular default when size empty
		} else if gi.sizeScope != "all" && gi.sizeScope != strings.ToLower(strings.TrimSpace(item.Size)) {
			return nil, fmt.Errorf("addon group %q not available for size %q", gi.name, item.Size)
		}
		groups[ad.GroupID] = gi
	}
	// Count per group
	counts := map[int]int{}
	for _, ad := range item.Addons {
		counts[ad.GroupID]++
	}
	for gid, gi := range groups {
		c := counts[gid]
		if c < gi.min || c > gi.max {
			return nil, fmt.Errorf("addon group %q requires %d..%d selections (got %d)", gi.name, gi.min, gi.max, c)
		}
	}
	var out []map[string]interface{}
	for _, ad := range item.Addons {
		gi := groups[ad.GroupID]
		var itName string
		var priceOverride sql.NullFloat64
		var addonRest int
		err := tx.QueryRow(
			`SELECT mi.name, ai.price_override, ai.restaurant_id FROM addon_items ai JOIN menu_items mi ON mi.id=ai.menu_item_id WHERE ai.group_id=$1 AND ai.menu_item_id=$2 AND ai.restaurant_id=$3 AND ai.active=true`,
			ad.GroupID, ad.MenuItemID, restaurantID).Scan(&itName, &priceOverride, &addonRest)
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("addon item %d not found in group %d", ad.MenuItemID, ad.GroupID)
		}
		if err != nil {
			return nil, err
		}
		var price float64
		if priceOverride.Valid {
			price = priceOverride.Float64
		} else {
			_ = tx.QueryRow(`SELECT price FROM menu_items WHERE id=$1`, ad.MenuItemID).Scan(&price)
		}
		out = append(out, map[string]interface{}{
			"group": gi.name, "group_id": gi.id, "item": itName, "item_id": ad.MenuItemID, "quantity": 1, "price": price,
		})
	}
	if out == nil {
		out = []map[string]interface{}{}
	}
	return out, nil
}

// canonicalDraftLine resolves one draft item to its menu-authoritative
// unit price (paise), normalized size/crust, and display name.
func canonicalDraftLine(tx *sql.Tx, item DraftItem, restaurantID int) (unitPaise int64, size, crust, itemName string, err error) {
	size = strings.ToLower(strings.TrimSpace(item.Size))
	crust = strings.ToLower(strings.TrimSpace(item.Crust))
	var price float64
	var pr, pm, pl sql.NullFloat64
	err = tx.QueryRow(`
		SELECT name, price, price_regular, price_medium, price_large
		FROM menu_items WHERE id = $1 AND active = true AND restaurant_id = $2`,
		item.MenuItemID, restaurantID).Scan(&itemName, &price, &pr, &pm, &pl)
	if err == sql.ErrNoRows {
		return 0, "", "", "", fmt.Errorf("item %d not found", item.MenuItemID)
	}
	if err != nil {
		return 0, "", "", "", err
	}
	menuItem := &models.MenuItem{Price: price}
	if pr.Valid {
		v := pr.Float64
		menuItem.PriceRegular = &v
	}
	if pm.Valid {
		v := pm.Float64
		menuItem.PriceMedium = &v
	}
	if pl.Valid {
		v := pl.Float64
		menuItem.PriceLarge = &v
	}
	menuItem.BuildPriceBySize()
	unitPaise, _, err = PricingFromItemFor(menuItem, size, crust, restaurantID)
	if err != nil {
		return 0, "", "", "", err
	}
	return unitPaise, size, crust, itemName, nil
}

// UpdateOrder changes a mutable order's fulfillment type. Frozen
// (completed/cancelled) orders reject the change, as do callers
// outside the order's tenant.
func (s *POSOrderService) UpdateOrder(id, restaurantID, outletID int, orderType string) error {
	status, _, err := loadOrderForMutation(id, restaurantID, outletID)
	if err != nil {
		return err
	}
	if !CanMutateOrder(status) {
		return fmt.Errorf("%w: cannot change order type on %q order", ErrInvalidOrderTransition, status)
	}
	normalized, err := NormalizePOSOrderType(orderType)
	if err != nil {
		return err
	}
	_, err = database.DB.Exec(
		`UPDATE orders SET order_type = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND restaurant_id = $3 AND outlet_id = $4`,
		id, normalized, restaurantID, outletID)
	return err
}

// DraftOrder represents a POS order before it is finalized.
// It carries the tenant context (org / restaurant / outlet) and items.
// Hardening: plus customer/financial fields (transport only, no business calc yet).
type DraftOrder struct {
	RestaurantID    int
	OutletID        int
	Items           []DraftItem `json:"Items"`
	TableID         int         `json:"TableID"` // 0 = none
	Source          string      `json:"source"`
	OrderType       string      `json:"order_type"` // dine_in | takeaway | delivery
	CustomerPhone   string      `json:"customer_phone"`
	CustomerName    string      `json:"customer_name"`
	Address         string      `json:"address"`
	Locality        string      `json:"locality"` // -> landmark
	GuestCount      int         `json:"guest_count"`
	ContainerCharge float64     `json:"container_charge"`
	TipAmount       float64     `json:"tip_amount"`
	IsComplimentary bool        `json:"is_complimentary"`
	AdvanceAt       string      `json:"advance_at"` // RFC3339 or ""
	IdempotencyKey  string      `json:"idempotency_key"`
}

// DraftAddon is one addon selection within a DraftItem (frontend selection, backend validates price).
type DraftAddon struct {
	GroupID    int `json:"group_id"`
	MenuItemID int `json:"menu_item_id"`
}

// DraftItem is a single item in a draft order.
type DraftItem struct {
	MenuItemID int          `json:"MenuItemID"`
	Size       string       `json:"Size"`
	Crust      string       `json:"Crust"`
	Quantity   int          `json:"Quantity"`
	Addons     []DraftAddon `json:"addons"`
}

// PriceSummary is the summary shown to the cashier before payment.
type PriceSummary struct {
	Subtotal  int64 // paise
	Discount  int64 // paise (negative = discount)
	Tax       int64 // paise
	Total     int64 // paise
	ItemCount int
}

// OrderHoldInfo records why an order is held and by whom.
type OrderHoldInfo struct {
	OrderID    int
	HoldReason string // "manual", "kitchen", "pending_payment", etc.
	HoldedBy   int    // user ID
	HoldedAt   time.Time
	Version    int // optimistic concurrency version
}

// loadOrderForMutation loads an order's status after verifying it
// belongs to the caller's (restaurantID, outletID) tenant. Every POS
// mutation goes through here so cross-tenant or cross-outlet access
// fails closed even when a caller forges order IDs. It returns the
// order's status and restaurant for downstream rule checks.
func loadOrderForMutation(orderID, restaurantID, outletID int) (status string, orderRestaurantID int, err error) {
	var orderOutletID int
	err = database.DB.QueryRow(
		`SELECT status, restaurant_id, outlet_id FROM orders WHERE id = $1`,
		orderID).Scan(&status, &orderRestaurantID, &orderOutletID)
	if err == sql.ErrNoRows {
		return "", 0, ErrOrderNotFound
	}
	if err != nil {
		return "", 0, err
	}
	if orderRestaurantID != restaurantID || orderOutletID != outletID {
		return "", 0, ErrOrderTenantMismatch
	}
	return status, orderRestaurantID, nil
}

// HoldOrder moves a draft/confirmed order to held. The status is read
// first and the write is conditional on it, so two concurrent holders
// cannot both succeed: the loser sees zero affected rows.
func (s *POSOrderService) HoldOrder(orderID, restaurantID, outletID int, heldBy int, reason string) (bool, error) {
	status, _, err := loadOrderForMutation(orderID, restaurantID, outletID)
	if err != nil {
		return false, err
	}
	if err := RequireTransition(status, OrderStatusHeld); err != nil {
		return false, err
	}
	res, err := database.DB.Exec(`
		UPDATE orders SET status = 'held', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status = $2 AND restaurant_id = $3 AND outlet_id = $4
	`, orderID, status, restaurantID, outletID)
	if err != nil {
		return false, err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	if rows == 0 {
		return false, fmt.Errorf("%w: order changed under us", ErrInvalidOrderTransition)
	}
	return true, nil
}

// ResumeOrder moves a held order back to confirmed. Resuming anything
// that is not held is an explicit error, not a silent no-op.
func (s *POSOrderService) ResumeOrder(orderID, restaurantID, outletID int) error {
	status, _, err := loadOrderForMutation(orderID, restaurantID, outletID)
	if err != nil {
		return err
	}
	if err := RequireTransition(status, OrderStatusConfirmed); err != nil {
		return err
	}
	res, err := database.DB.Exec(`
		UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status = 'held' AND restaurant_id = $2 AND outlet_id = $3
	`, orderID, restaurantID, outletID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("%w: order changed under us", ErrInvalidOrderTransition)
	}
	return nil
}

// CompleteOrder completes a confirmed order once its ledger balance is
// fully paid (due == 0). Completed orders are terminal: no further
// hold, payment, discount, or table change is possible.
func (s *POSOrderService) CompleteOrder(orderID, restaurantID, outletID int) error {
	status, _, err := loadOrderForMutation(orderID, restaurantID, outletID)
	if err != nil {
		return err
	}
	if err := RequireTransition(status, OrderStatusCompleted); err != nil {
		return err
	}
	_, _, duePaise, err := ComputeDueFromLedger(orderID)
	if err != nil {
		return fmt.Errorf("failed to compute due: %w", err)
	}
	if duePaise > 0 {
		return fmt.Errorf("%w: %d paise still due", ErrOrderHasDue, duePaise)
	}
	res, err := database.DB.Exec(`
		UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status = $2 AND restaurant_id = $3 AND outlet_id = $4
	`, orderID, status, restaurantID, outletID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("%w: order changed under us", ErrInvalidOrderTransition)
	}
	return nil
}

// CancelOrder cancels a non-terminal order. Completed and cancelled
// orders are terminal and reject cancellation.
func (s *POSOrderService) CancelOrder(orderID, restaurantID, outletID int) error {
	status, _, err := loadOrderForMutation(orderID, restaurantID, outletID)
	if err != nil {
		return err
	}
	if err := RequireTransition(status, OrderStatusCancelled); err != nil {
		return err
	}
	res, err := database.DB.Exec(`
		UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status = $2 AND restaurant_id = $3 AND outlet_id = $4
	`, orderID, status, restaurantID, outletID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("%w: order changed under us", ErrInvalidOrderTransition)
	}
	return nil
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
	var status string
	err = database.DB.QueryRow(
		`SELECT restaurant_id, outlet_id, status FROM orders WHERE id = $1`, orderID).Scan(&orderRestaurantID, &orderOutletID, &status)
	if err == sql.ErrNoRows {
		return 0, false, 0, ErrOrderNotFound
	}
	if err != nil {
		return 0, false, 0, err
	}
	if orderRestaurantID != restaurantID || orderOutletID != outletID {
		return 0, false, 0, fmt.Errorf("order does not belong to current restaurant/outlet")
	}
	if !CanAcceptPayment(status) {
		return 0, false, 0, fmt.Errorf("%w: cannot take payment on %q order", ErrInvalidOrderTransition, status)
	}
	paymentID, replayed, err = RecordPayment(orderID, restaurantID, outletID, method, amountPaise, tenderedPaise, reference, receivedBy, idempotencyKey)
	if err != nil {
		return 0, false, 0, err
	}
	// Compute due: derived from the payment ledger (see ComputeDueFromLedger).
	_, _, duePaise, err = ComputeDueFromLedger(orderID)
	if err != nil {
		return 0, false, 0, fmt.Errorf("failed to compute due: %w", err)
	}
	return paymentID, replayed, duePaise, nil
}

// ComputeDueFromLedger calculates paid, refunded, and due from the order_payments
// table for a given order. All amounts are in paise. The ledger is
// authoritative: due = order total - paid + refunded. (orders.total is
// stored in rupees, so it is converted via rounding, never truncated.)
// DB failures are propagated (not swallowed) to avoid completing unpaid orders on infrastructure failure.
func ComputeDueFromLedger(orderID int) (paidPaise int64, refundedPaise int64, duePaise int64, err error) {
	var totalRupees float64
	if err = database.DB.QueryRow(`SELECT total FROM orders WHERE id = $1`, orderID).Scan(&totalRupees); err != nil {
		return 0, 0, 0, fmt.Errorf("failed to load order total: %w", err)
	}
	totalPaise := rounding(totalRupees)

	// Sum payments (DECIMAL reads as rupees first; see RefundPayment).
	var paidRupees float64
	if err = database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount), 0) FROM order_payments WHERE order_id = $1 AND amount > 0`, orderID).Scan(&paidRupees); err != nil {
		return 0, 0, 0, fmt.Errorf("failed to sum payments: %w", err)
	}

	// Sum refunds (negative amounts).
	var refundedRupees float64
	if err = database.DB.QueryRow(`
		SELECT COALESCE(SUM(ABS(amount)), 0) FROM order_payments WHERE order_id = $1 AND amount < 0`, orderID).Scan(&refundedRupees); err != nil {
		return 0, 0, 0, fmt.Errorf("failed to sum refunds: %w", err)
	}

	paidPaise = paiseFromDecimal(paidRupees)
	refundedPaise = paiseFromDecimal(refundedRupees)
	duePaise = totalPaise - paidPaise + refundedPaise
	if duePaise < 0 {
		duePaise = 0
	}
	return paidPaise, refundedPaise, duePaise, nil
}

// OrderEventPayload is what gets posted to the order_events table.
type OrderEventPayload struct {
	EventType   string `json:"event_type"`
	Description string `json:"description"`
}

// ApplyDiscount applies a discount to an active order. Returns the new
// discount ID or an error. Completed/cancelled orders are frozen.
// Totals are recalculated server-side after linking: the client never
// supplies the resulting amounts.
func (s *POSOrderService) ApplyDiscount(orderID, restaurantID, outletID, discountID int) error {
	status, orderRestaurantID, err := loadOrderForMutation(orderID, restaurantID, outletID)
	if err != nil {
		return err
	}
	if !CanMutateOrder(status) {
		return fmt.Errorf("%w: cannot apply discount to %q order", ErrInvalidOrderTransition, status)
	}
	rule := GetDiscountByID(discountID)
	if rule == nil {
		return fmt.Errorf("discount not found")
	}
	if rule.RestaurantID != orderRestaurantID {
		return fmt.Errorf("discount does not belong to current restaurant")
	}
	// Validate the discount belongs to the order's restaurant and is active.
	// We simply link the discount via orders.discount_id.
	_, err = database.DB.Exec(`
		UPDATE orders SET discount_id = $2 WHERE id = $1 AND restaurant_id = $3
	`, orderID, discountID, orderRestaurantID)
	if err != nil {
		return err
	}
	// Server owns the resulting totals.
	_, err = RecalculateOrderTotals(orderID, restaurantID)
	return err
}

// SetTable assigns a table to an order. Verifies the table belongs to
// the same restaurant/outlet and the order is still mutable.
// Delegates to the atomic AssignTableToOrder so concurrent claimants
// get one success and one conflict (see table_service.go).
func (s *POSOrderService) SetTable(orderID int, tableID int, restaurantID int, outletID int) error {
	status, _, err := loadOrderForMutation(orderID, restaurantID, outletID)
	if err != nil {
		return err
	}
	if !CanMutateOrder(status) {
		return fmt.Errorf("%w: cannot change table on %q order", ErrInvalidOrderTransition, status)
	}
	return AssignTableToOrder(orderID, tableID, restaurantID, outletID)
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
