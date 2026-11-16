package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
)

// defaultOrderService reuses the existing order persistence layer (shared
// across order_stream.go, website_order_service.go and this file).
var defaultOrderService = NewOrderService()

// queryRower is implemented by both *sql.DB and *sql.Tx.
type queryRower interface {
	QueryRow(query string, args ...interface{}) *sql.Row
	Query(query string, args ...interface{}) (*sql.Rows, error)
}

// getOrderByIDTx loads one order (with items) inside a transaction, taking a
// row lock (FOR UPDATE) on the orders row so status transitions are serialized.
func getOrderByIDTx(q queryRower, id, restaurantID int) (*models.Order, error) {
	var order models.Order
	var advanceAt sql.NullTime
	var discountID, tableID sql.NullInt64
	err := q.QueryRow(`
		SELECT id, order_number, customer_name, customer_phone, order_type, COALESCE(address,''), COALESCE(landmark,''), payment_method,
		       subtotal, delivery_fee, discount, total, status, created_at, updated_at,
		       tax_amount, discount_id, source, table_id, guest_count, container_charge, tip_amount, is_complimentary, advance_at
		FROM orders WHERE id = $1 AND restaurant_id = $2 FOR UPDATE
	`, id, restaurantID).Scan(&order.ID, &order.OrderNumber, &order.CustomerName, &order.CustomerPhone, &order.OrderType, &order.Address, &order.Landmark, &order.PaymentMethod, &order.Subtotal, &order.DeliveryFee, &order.Discount, &order.Total, &order.Status, &order.CreatedAt, &order.UpdatedAt,
		&order.TaxAmount, &discountID, &order.Source, &tableID, &order.GuestCount, &order.ContainerCharge, &order.TipAmount, &order.IsComplimentary, &advanceAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if discountID.Valid {
		order.DiscountID = int(discountID.Int64)
	}
	if tableID.Valid {
		order.TableID = int(tableID.Int64)
	}
	if advanceAt.Valid {
		order.AdvanceAt = &advanceAt.Time
	}
	rows, err := q.Query(`
		SELECT id, order_id, menu_item_id, name, quantity, unit_price, options, subtotal, created_at,
		       COALESCE(addons_snapshot, '[]'::jsonb), COALESCE(combo_snapshot, '[]'::jsonb)
		FROM order_items WHERE order_id = $1
	`, order.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var item models.OrderItem
		var optionsJSON, addonsJSON, comboJSON []byte
		if err := rows.Scan(&item.ID, &item.OrderID, &item.MenuItemID, &item.Name, &item.Quantity, &item.UnitPrice, &optionsJSON, &item.Subtotal, &item.CreatedAt, &addonsJSON, &comboJSON); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(optionsJSON, &item.Options)
		_ = json.Unmarshal(addonsJSON, &item.Addons)
		_ = json.Unmarshal(comboJSON, &item.Combo)
		order.Items = append(order.Items, item)
	}
	return &order, rows.Err()
}

// ------------------------------------------------------------------
// Explicit order lifecycle shared by the website tracker, the admin
// board, and WhatsApp notifications. Kept short on purpose: new
// orders auto-confirm at creation, staff only move them forward.
//
//	placed -> confirmed | cancelled             (auto-confirm)
//	confirmed -> out_for_delivery | completed | cancelled
//	out_for_delivery -> delivered
//	delivered/completed/cancelled are terminal
//
// preparing/ready exits exist only to close pre-simplify rows.
// ------------------------------------------------------------------

var AllowedTransitions = map[string][]string{
	"placed":           {"confirmed", "cancelled"},
	"confirmed":        {"out_for_delivery", "completed", "cancelled"},
	"preparing":        {"out_for_delivery", "completed", "cancelled"},
	"ready":            {"out_for_delivery", "completed", "cancelled"},
	"out_for_delivery": {"delivered"},
	"delivered":        {},
	"completed":        {},
	"cancelled":        {},
}

// ValidStatus covers every state the lifecycle knows about.
var ValidStatus = func() map[string]bool {
	m := map[string]bool{}
	for status := range AllowedTransitions {
		m[status] = true
	}
	return m
}()

type TransitionError struct {
	From    string
	To      string
	Allowed []string
}

func (e *TransitionError) Error() string {
	if len(e.Allowed) == 0 {
		return fmt.Sprintf("status %q is terminal; no further changes allowed", e.From)
	}
	return fmt.Sprintf("cannot move from %q to %q; allowed next: %s",
		e.From, e.To, strings.Join(e.Allowed, ", "))
}

func ValidateTransition(from, to string) error {
	allowed, ok := AllowedTransitions[from]
	if !ok {
		return &TransitionError{From: from, To: to}
	}
	for _, a := range allowed {
		if a == to {
			return nil
		}
	}
	return &TransitionError{From: from, To: to, Allowed: allowed}
}

// StatusUpdateText renders the customer-facing WhatsApp status ping.
func StatusUpdateText(status, orderNumber string) string {
	pretty := strings.ReplaceAll(strings.ToUpper(status[:1])+status[1:], "_", " ")
	var lineKey string
	switch status {
	case "confirmed":
		lineKey = "status_confirmed"
	case "preparing":
		lineKey = "status_preparing"
	case "ready":
		lineKey = "status_ready"
	case "out_for_delivery":
		lineKey = "status_out_for_delivery"
	case "delivered", "completed":
		lineKey = "status_delivered"
	case "cancelled":
		lineKey = "status_cancelled"
	default:
		lineKey = "status_default"
	}
	line := Msg(lineKey, nil)
	return Msg("status_update", map[string]interface{}{
		"OrderNumber": orderNumber,
		"Status":      pretty,
		"Message":     line,
	})
}

// ApplyStatusChange validates the transition, persists it atomically,
// then notifies the CUSTOMER on WhatsApp (best effort, never fails the
// request). Returns the updated order plus the notification outcome.
func ApplyStatusChange(orderID int, newStatus string, evolution *EvolutionClient, cfg *config.Config, restaurantID int) (*models.Order, WhatsAppOutcome, error) {
	if !ValidStatus[newStatus] {
		return nil, WhatsAppOutcome{}, fmt.Errorf("unknown status %q", newStatus)
	}

	rid := ResolveRestaurant(restaurantID)

	// Lock the order row for the whole read-validate-write sequence so two
	// concurrent admins cannot both validate the same transition and commit
	// (last-writer-wins), which could skip states in the state machine.
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, WhatsAppOutcome{}, err
	}
	defer tx.Rollback()

	order, err := getOrderByIDTx(tx, orderID, rid)
	if err != nil {
		return nil, WhatsAppOutcome{}, err
	}
	if order == nil {
		return nil, WhatsAppOutcome{}, sql.ErrNoRows
	}
	if order.Status == newStatus {
		_ = tx.Commit()
		return order, WhatsAppOutcome{}, nil // no-op, treat as success
	}
	if err := ValidateTransition(order.Status, newStatus); err != nil {
		return nil, WhatsAppOutcome{}, err
	}

	fromStatus := order.Status
	res, err := tx.Exec(`
		UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND restaurant_id = $3 AND status = $4
	`, newStatus, orderID, rid, fromStatus)
	if err != nil {
		return nil, WhatsAppOutcome{}, err
	}
	if affected, err := res.RowsAffected(); err != nil || affected == 0 {
		// Row changed underneath us (or wrong tenant) — do not fake success.
		return nil, WhatsAppOutcome{}, fmt.Errorf("order status changed concurrently or order not found")
	}
	desc := "Status changed to " + newStatus
	if _, err := tx.Exec(`
		INSERT INTO order_events (order_id, event_type, description)
		VALUES ($1, $2, $3)
	`, orderID, newStatus, desc); err != nil {
		return nil, WhatsAppOutcome{}, err
	}
	if err := tx.Commit(); err != nil {
		return nil, WhatsAppOutcome{}, err
	}

	order.Status = newStatus

	// Auto-print receipt when an order is completed (POS orders flow here).
	go func() {
		printed, err := PrintOrderReceipt(order, cfg.RestaurantName)
		if err != nil {
			log.Printf("[printer] auto-print failed for order %s: %v", order.OrderNumber, err)
		} else if printed {
			log.Printf("[printer] auto-printed order %s", order.OrderNumber)
		}
	}()

	outcome := notifyCustomerStatus(order.OrderNumber, order.CustomerPhone, newStatus, evolution.ForRestaurant(order.RestaurantID), cfg)
	BroadcastRealtimeFor(order.RestaurantID, order.OutletID, 0, "order.status", map[string]interface{}{
		"order_id": order.ID, "order_number": order.OrderNumber, "status": newStatus, "restaurant_id": order.RestaurantID, "outlet_id": order.OutletID,
	})
	BroadcastOrderStatus(order.ID, order.OrderNumber, newStatus)
	return order, outcome, nil
}

func notifyCustomerStatus(orderNumber, phone, status string, evolution *EvolutionClient, cfg *config.Config) WhatsAppOutcome {
	dest := normalizeWhatsAppDest(phone, cfg)
	if dest == "" {
		log.Println("WhatsApp status notification skipped: customer phone missing")
		return WhatsAppOutcome{Skipped: true, Reason: "customer phone missing"}
	}
	msg := StatusUpdateText(status, orderNumber)
	var err error
	if img := resolvePublicImage(MsgImage("status_update"), cfg.PublicBaseURL); img != "" {
		err = evolution.SendMedia(dest, img, "image", msg)
	} else {
		err = evolution.SendText(dest, msg)
	}
	if err != nil {
		log.Printf("WhatsApp status notification failed for order %s: %v", orderNumber, err)
		return WhatsAppOutcome{Reason: err.Error()}
	}
	log.Printf("WhatsApp status notification sent for order %s (%s) to %s", orderNumber, status, dest)
	return WhatsAppOutcome{Sent: true}
}

// normalizeWhatsAppDest ensures the customer number is usable; falls
// back to the configured restaurant number ONLY when the order has no
// phone AND a fallback flag env is set — kept simple here: require a
// 10-13 digit customer number, prefix country code 91 when 10 digits.
func normalizeWhatsAppDest(phone string, cfg *config.Config) string {
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	switch {
	case len(cleaned) == 10:
		return "91" + cleaned
	case len(cleaned) >= 11 && len(cleaned) <= 13:
		return cleaned
	default:
		return ""
	}
}
