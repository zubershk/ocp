package services

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
)

// defaultOrderService reuses the existing order persistence layer.
var defaultOrderService = NewOrderService()

// ------------------------------------------------------------------
// Explicit order lifecycle shared by the website tracker, the admin
// board, and WhatsApp notifications.
//
//	placed -> confirmed | cancelled
//	confirmed -> preparing | cancelled
//	preparing -> ready
//	ready -> out_for_delivery | completed   (delivery vs pickup)
//	out_for_delivery -> delivered
//	delivered/completed/cancelled are terminal
// ------------------------------------------------------------------

var AllowedTransitions = map[string][]string{
	"placed":           {"confirmed", "cancelled"},
	"confirmed":        {"preparing", "cancelled"},
	"preparing":        {"ready"},
	"ready":            {"out_for_delivery", "completed"},
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
	var line string
	switch status {
	case "confirmed":
		line = "We have received your order and it will start shortly. 🧑‍🍳"
	case "preparing":
		line = "Your order is being prepared."
	case "ready":
		line = "Your order is ready!"
	case "out_for_delivery":
		line = "Your order is on its way! 🛵"
	case "delivered", "completed":
		line = "Order completed. Thank you for ordering with us! ❤️"
	case "cancelled":
		line = "This order has been cancelled. Contact us if this was a mistake."
	default:
		line = "Status updated."
	}
	var b strings.Builder
	b.WriteString("\U0001F355 Orange Cheese Pizza\n\n")
	fmt.Fprintf(&b, "Order: %s\n", orderNumber)
	fmt.Fprintf(&b, "Status: %s\n\n", pretty)
	b.WriteString(line)
	return b.String()
}

// ApplyStatusChange validates the transition, persists it atomically,
// then notifies the CUSTOMER on WhatsApp (best effort, never fails the
// request). Returns the updated order plus the notification outcome.
func ApplyStatusChange(orderID int, newStatus string, evolution *EvolutionClient, cfg *config.Config) (*models.Order, WhatsAppOutcome, error) {
	if !ValidStatus[newStatus] {
		return nil, WhatsAppOutcome{}, fmt.Errorf("unknown status %q", newStatus)
	}

	order, err := defaultOrderService.GetOrderByID(orderID)
	if err != nil {
		return nil, WhatsAppOutcome{}, err
	}
	if order == nil {
		return nil, WhatsAppOutcome{}, sql.ErrNoRows
	}
	if order.Status == newStatus {
		return order, WhatsAppOutcome{}, nil // no-op, treat as success
	}
	if err := ValidateTransition(order.Status, newStatus); err != nil {
		return nil, WhatsAppOutcome{}, err
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return nil, WhatsAppOutcome{}, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, newStatus, orderID); err != nil {
		return nil, WhatsAppOutcome{}, err
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

	outcome := notifyCustomerStatus(order.OrderNumber, order.CustomerPhone, newStatus, evolution, cfg)
	return order, outcome, nil
}

func notifyCustomerStatus(orderNumber, phone, status string, evolution *EvolutionClient, cfg *config.Config) WhatsAppOutcome {
	dest := normalizeWhatsAppDest(phone, cfg)
	if dest == "" {
		log.Println("WhatsApp status notification skipped: customer phone missing")
		return WhatsAppOutcome{Skipped: true, Reason: "customer phone missing"}
	}
	msg := StatusUpdateText(status, orderNumber)
	if err := evolution.SendText(dest, msg); err != nil {
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
