package services

import (
	"database/sql"
	"math"
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

// paiseFromDecimal converts a DECIMAL ledger value that already holds
// whole paise into int64. It must NOT use rounding() (rupees→paise):
// order_payments.amount stores paise, while orders.total stores rupees.
// Mixing the two up inflates every ledger read 100x and defeats refund
// validation — exactly the over-refund staging caught.
func paiseFromDecimal(v float64) int64 {
	if v < 0 {
		return int64(math.Ceil(v - 0.5))
	}
	return int64(math.Floor(v + 0.5))
}

// nullReceiver maps a cashier user ID to a nullable FK value: 0 means
// "unattributed" (e.g. the legacy env owner, who has no users row),
// never a dangling reference.
func nullReceiver(receivedBy int) any {
	if receivedBy <= 0 {
		return nil
	}
	return receivedBy
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

	key, err := NormalizeIdempotencyKey(idempotencyKey)
	if err != nil {
		return 0, false, err
	}
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
		orderID, restaurantID, outletID, method, amountPaise, tenderedPaise, 0, reference, nullReceiver(receivedBy), nullIfEmpty(key)).Scan(&paymentID)
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
// amountPaise is the refund amount in paise (positive number; stored as
// negative in amount). refund_of is the payment ID being refunded.
// Like payments, refunds accept an idempotency key so a retried refund
// never posts twice.
func RecordRefund(orderID, refundOf, restaurantID, outletID int, amountPaise int64, reference string, receivedBy int, idempotencyKey string) (paymentID int, replayed bool, err error) {
	key, err := NormalizeIdempotencyKey(idempotencyKey)
	if err != nil {
		return 0, false, err
	}
	if key != "" {
		if existing, findErr := GetPaymentIDByIdempotencyKey(key, orderID); findErr == nil && existing > 0 {
			return existing, true, nil
		}
	}
	err = database.DB.QueryRow(`
		INSERT INTO order_payments (order_id, restaurant_id, outlet_id,
			method, amount, tendered, change_due, reference, received_by, refund_of, idempotency_key, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
		RETURNING id`,
		orderID, restaurantID, outletID, "refund", -amountPaise, 0, 0, reference, nullReceiver(receivedBy), refundOf, nullIfEmpty(key)).Scan(&paymentID)
	if err != nil {
		if key != "" && IsUniqueViolation(err, "uq_order_payments_idempotency_key") {
			if existing, findErr := GetPaymentIDByIdempotencyKey(key, orderID); findErr == nil && existing > 0 {
				return existing, true, nil
			}
		}
		return 0, false, err
	}
	return paymentID, false, nil
}

// ComputeSummaryFromLedger derives paid / refunded / due from the
// order_payments table for a given order. All values in paise.
// The ledger is authoritative: due = total - paid + refunded.
func ComputeSummaryFromLedger(orderID int) (PaymentSummary, error) {
	var totalRupees float64
	err := database.DB.QueryRow(`SELECT total FROM orders WHERE id = $1`, orderID).Scan(&totalRupees)
	if err != nil {
		return PaymentSummary{}, err
	}
	totalPaise := rounding(totalRupees)

	// Sum all positive amounts = paid (DECIMAL reads as rupees first).
	var paidRupees float64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount), 0) FROM order_payments WHERE order_id = $1 AND amount > 0`, orderID).Scan(&paidRupees)

	// Sum absolute value of negative amounts = refunded.
	var refundedRupees float64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(ABS(amount)), 0) FROM order_payments WHERE order_id = $1 AND amount < 0`, orderID).Scan(&refundedRupees)

	paid := paiseFromDecimal(paidRupees)
	refunded := paiseFromDecimal(refundedRupees)
	due := totalPaise - paid + refunded
	if due < 0 {
		due = 0
	}
	overpaid := paid - refunded - totalPaise
	if overpaid < 0 {
		overpaid = 0
	}

	return PaymentSummary{
		Paid:       paid,
		Refunded:   refunded,
		Due:        due,
		Total:      totalPaise,
		Overpaid:   overpaid,
	}, nil
}

// RefundPayment records a refund for a previous payment.
// It never mutates the original payment row; it inserts a new
// negative-amount row linked via refund_of. Every invariant lives in
// ValidateRefundRequest; the refundable balance is derived from the
// ledger, never from a stored mutable total.
//
// Atomicity: validation + insertion run inside one transaction holding
// a row lock (SELECT ... FOR UPDATE) on the original payment, so two
// concurrent refunds against the same payment serialize: the loser
// re-reads the winner's row and fails ErrRefundExceedsRemain instead
// of over-refunding.
func RefundPayment(paymentID, orderID, restaurantID, outletID int, amountPaise int64, reference string, receivedBy int, idempotencyKey string) (paymentIDOut int, replayed bool, err error) {
	key, err := NormalizeIdempotencyKey(idempotencyKey)
	if err != nil {
		return 0, false, err
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()

	if key != "" {
		var existing int
		err := tx.QueryRow(
			`SELECT id FROM order_payments WHERE idempotency_key = $1 AND order_id = $2`,
			key, orderID).Scan(&existing)
		if err == nil && existing > 0 {
			return existing, true, nil
		}
		if err != nil && err != sql.ErrNoRows {
			return 0, false, err
		}
	}

	var check RefundCheck
	var refundOf sql.NullInt64
	var origAmountRupees float64
	err = tx.QueryRow(`
		SELECT amount, refund_of, order_id, restaurant_id, outlet_id
		FROM order_payments WHERE id = $1 FOR UPDATE`, paymentID).Scan(
		&origAmountRupees, &refundOf,
		&check.OriginalOrderID, &check.OriginalRestaurantID, &check.OriginalOutletID)
	if err == sql.ErrNoRows {
		return 0, false, ErrRefundNotFound
	}
	if err != nil {
		return 0, false, err
	}
	// Ledger amounts are DECIMAL holding whole paise: convert without
	// the rupees→paise scaling (see paiseFromDecimal). Scanning NUMERIC
	// straight into int64 fails ("100000.00").
	check.OriginalAmountPaise = paiseFromDecimal(origAmountRupees)
	if refundOf.Valid {
		check.OriginalRefundOf = int(refundOf.Int64)
	}
	// Ledger-derived within the same lock: abs sum of prior refunds
	// against this payment, including rows committed by a winner that
	// held this lock before us.
	var refundedRupees float64
	err = tx.QueryRow(`
		SELECT COALESCE(SUM(ABS(amount)), 0) FROM order_payments
		WHERE refund_of = $1 AND amount < 0`, paymentID).Scan(&refundedRupees)
	if err != nil {
		return 0, false, err
	}
	check.AlreadyRefundedPaise = paiseFromDecimal(refundedRupees)

	if err := ValidateRefundRequest(check, orderID, restaurantID, outletID, amountPaise); err != nil {
		return 0, false, err
	}
	err = tx.QueryRow(`
		INSERT INTO order_payments (order_id, restaurant_id, outlet_id,
			method, amount, tendered, change_due, reference, received_by, refund_of, idempotency_key, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
		RETURNING id`,
		orderID, restaurantID, outletID, "refund", -amountPaise, 0, 0, reference, nullReceiver(receivedBy), paymentID, nullIfEmpty(key)).Scan(&paymentIDOut)
	if err != nil {
		// A failed statement poisons the transaction, so roll back
		// before looking up the concurrent winner on a fresh query.
		_ = tx.Rollback()
		if key != "" && IsUniqueViolation(err, "uq_order_payments_idempotency_key") {
			if existing, findErr := GetPaymentIDByIdempotencyKey(key, orderID); findErr == nil && existing > 0 {
				return existing, true, nil
			}
		}
		return 0, false, err
	}
	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	return paymentIDOut, false, nil
}