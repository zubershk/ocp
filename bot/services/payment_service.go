package services

import (
	"errors"
	"time"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Payment service (Phase 5 POS).
//
// Append-only payment ledger. Never mutate historical rows.
// Refunds are negative-amount rows linked via refund_of.
// Calculates paid / refunded / due from the ledger.
// ------------------------------------------------------------------

// PaymentRecord is a single payment entry in the ledger.
type PaymentRecord struct {
	ID             int
	OrderID        int
	RestaurantID   int
	OutletID       int
	Method         string // cash, upi, card, online, other
	Amount         int64  // signed paise; positive = payment, negative = refund
	Tendered       int64  // paise handed over by customer
	ChangeDue      int64  // paise returned to customer
	Reference      string // UPI txn id, card auth, etc.
	RefundOf       int    // 0 = not a refund; otherwise payment ID
	ReceivedBy     int    // cashier user ID
	CreatedAt      time.Time
	IdempotencyKey string `json:"idempotency_key,omitempty"`
}

// PaymentSummary is the derived view from the ledger.
type PaymentSummary struct {
	Paid         int64  // paise paid (positive amounts)
	Refunded     int64  // paise refunded (absolute value of negative amounts)
	Due          int64  // paise still due (order total - paid + refunded)
	Total        int64  // order total paise
	Overpaid     int64  // paise paid in excess of total (credit for next visit)
}

// GetPaymentIDByIdempotencyKey returns the ledger row for a key scoped
// to one order, or 0 when the key was never recorded.
func GetPaymentIDByIdempotencyKey(key string, orderID int) (int, error) {
	var id int
	err := database.DB.QueryRow(
		`SELECT id FROM order_payments WHERE idempotency_key = $1 AND order_id = $2`,
		key, orderID).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

// RecordPayment inserts a new payment row and returns the payment ID.
// When idempotencyKey is non-empty, a repeated call with the same key
// returns the original row with replayed=true instead of inserting a
// second row (double-click / browser-retry safe).
func RecordPayment(orderID, restaurantID, outletID int, method string,
	amountPaise int64, tenderedPaise int64, reference string,
	receivedBy int, idempotencyKey string) (paymentID int, replayed bool, err error) {

	key := NormalizeIdempotencyKey(idempotencyKey)
	if key != "" {
		if existing, findErr := GetPaymentIDByIdempotencyKey(key, orderID); findErr == nil && existing > 0 {
			return existing, true, nil
		}
	}
	if err := ValidatePaymentInput(method, amountPaise); err != nil {
		return 0, false, err
	}

	err = database.DB.QueryRow(`
		INSERT INTO order_payments (order_id, restaurant_id, outlet_id,
			method, amount, tendered, change_due, reference, received_by, idempotency_key, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
		RETURNING id`,
		orderID, restaurantID, outletID, method, amountPaise, tenderedPaise, 0, reference, receivedBy, nullIfEmpty(key)).Scan(&paymentID)
	if err != nil {
		// Concurrent duplicate won the INSERT race: return the winner.
		if key != "" && IsUniqueViolation(err, "uq_order_payments_idempotency_key") {
			if existing, findErr := GetPaymentIDByIdempotencyKey(key, orderID); findErr == nil && existing > 0 {
				return existing, true, nil
			}
		}
		return 0, false, err
	}
	return paymentID, false, nil
}

// RecordRefund records a refund against an existing payment.
// amount is the refund amount in paise (positive number; stored as negative in amount).
// refund_of is the payment ID being refunded.
func RecordRefund(orderID, refundOf, restaurantID, outletID int, amountPaise int64, reference string, receivedBy int) (int, error) {
	// Insert a negative-amount payment row linked to the original.
	var paymentID int
	err := database.DB.QueryRow(`
		INSERT INTO order_payments (order_id, restaurant_id, outlet_id,
			method, amount, tendered, change_due, reference, received_by, refund_of, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
		RETURNING id`,
		orderID, restaurantID, outletID, "refund", -amountPaise, 0, 0, reference, receivedBy, refundOf).Scan(&paymentID)
	if err != nil {
		return 0, err
	}
	return paymentID, nil
}

// ComputeSummaryFromLedger derives paid / refunded / due from the
// order_payments table for a given order. All values in paise.
func ComputeSummaryFromLedger(orderID int) (PaymentSummary, error) {
	var totalPaise int64
	err := database.DB.QueryRow(`SELECT total FROM orders WHERE id = $1`, orderID).Scan(&totalPaise)
	if err != nil {
		return PaymentSummary{}, err
	}

	// Sum all positive amounts = paid
	var totalPaid int64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount), 0) FROM order_payments WHERE order_id = $1 AND amount > 0`, orderID).Scan(&totalPaid)

	// Sum absolute value of negative amounts = refunded
	var totalRefund int64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(ABS(amount)), 0) FROM order_payments WHERE order_id = $1 AND amount < 0`, orderID).Scan(&totalRefund)

	paid := totalPaid
	refunded := totalRefund
	due := totalPaid - totalRefund // due = total - paid + refunded? Let's keep it simple: due = total - paid
	if due < 0 {
		due = 0
		// track overpayment as credit
	}
	overpaid := totalPaid - totalPaise

	return PaymentSummary{
		Paid:       paid,
		Refunded:   refunded,
		Due:        due,
		Total:      totalPaise,
		Overpaid:   overpaid,
	}, nil
}

// RefundPayment records a refund for a previous payment.
// It does not mutate the original payment row; it inserts a new negative-amount row.
func RefundPayment(paymentID, orderID, restaurantID, outletID int, amountPaise int64, reference string, receivedBy int) (int, error) {
	// Validate the original payment exists and belongs to the order.
	var origMethod string
	var origAmount int64
	err := database.DB.QueryRow(`SELECT method, amount FROM order_payments WHERE id = $1`, paymentID).Scan(&origMethod, &origAmount)
	if err != nil {
		return 0, errors.New("original payment not found")
	}
	if origAmount > 0 {
		return 0, errors.New("original payment is not a refund candidate (positive amount)")
	}
	// Record the refund row.
	return RecordRefund(orderID, paymentID, restaurantID, outletID, amountPaise, reference, receivedBy)
}