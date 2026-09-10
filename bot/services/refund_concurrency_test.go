package services

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Staging-gated concurrency test (PR 5 review blocker #1).
//
// Runs only against a live migrated PostgreSQL database:
//
//	OCP_TEST_DATABASE_URL (preferred) or BOT_DATABASE_URL
//
// Without either, the test skips: unit CI stays DB-free while staging
// executes the real race. The DB must have migrations through 026
// applied (the test probes for order_payments.idempotency_key and
// fails loudly otherwise).
//
// Scenario: one ₹1,000 payment, two concurrent ₹800 refunds fired
// from a shared start barrier. Exactly one must succeed; the loser
// must see the winner's row (via SELECT ... FOR UPDATE) and fail
// with ErrRefundExceedsRemain. Final refunded total must be ₹800,
// never ₹1,600.
// ------------------------------------------------------------------

func openStagingDB(t *testing.T) {
	t.Helper()
	stagingDB(t) // migrated staging DB, or Skip when unconfigured
}

func TestConcurrentRefundsCannotOverRefund(t *testing.T) {
	openStagingDB(t)

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	var orgID, restID, outID, userID, orderID, payID int

	must := func(msg string, err error) {
		t.Helper()
		if err != nil {
			t.Fatalf("%s: %v", msg, err)
		}
	}
	must("org", database.DB.QueryRow(
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		"race org", "t-org-"+suffix).Scan(&orgID))
	must("restaurant", database.DB.QueryRow(
		`INSERT INTO restaurants (organization_id, name, slug, currency, timezone) VALUES ($1, $2, $3, 'INR', 'Asia/Kolkata') RETURNING id`,
		orgID, "race rest", "t-rest-"+suffix).Scan(&restID))
	must("outlet", database.DB.QueryRow(
		`INSERT INTO outlets (restaurant_id, name, slug, active, sort_order) VALUES ($1, $2, $3, true, 0) RETURNING id`,
		restID, "race outlet", "t-out-"+suffix).Scan(&outID))
	must("user", database.DB.QueryRow(
		`INSERT INTO users (organization_id, name, key_hash, role, active) VALUES ($1, $2, $3, 'cashier', true) RETURNING id`,
		orgID, "race cashier", "t-key-"+suffix).Scan(&userID))
	must("order", database.DB.QueryRow(
		`INSERT INTO orders (order_number, customer_name, customer_phone, order_type, payment_method,
			subtotal, delivery_fee, discount, total, status, source, restaurant_id, outlet_id)
		 VALUES ($1, 'race', '9000000000', 'dine_in', 'cash', 1000, 0, 0, 1000, 'confirmed', 'pos', $2, $3)
		 RETURNING id`,
		"t-ord-"+suffix, restID, outID).Scan(&orderID))
	must("payment", database.DB.QueryRow(
		`INSERT INTO order_payments (order_id, restaurant_id, outlet_id, method, amount, tendered, reference, received_by)
		 VALUES ($1, $2, $3, 'cash', 100000, 100000, 'race-seed', $4) RETURNING id`,
		orderID, restID, outID, userID).Scan(&payID))

	t.Cleanup(func() {
		_, _ = database.DB.Exec(`DELETE FROM order_payments WHERE order_id = $1`, orderID)
		_, _ = database.DB.Exec(`DELETE FROM orders WHERE id = $1`, orderID)
		_, _ = database.DB.Exec(`DELETE FROM outlets WHERE id = $1`, outID)
		_, _ = database.DB.Exec(`DELETE FROM users WHERE id = $1`, userID)
		_, _ = database.DB.Exec(`DELETE FROM restaurants WHERE id = $1`, restID)
		_, _ = database.DB.Exec(`DELETE FROM organizations WHERE id = $1`, orgID)
	})

	start := make(chan struct{})
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, _, err := RefundPayment(payID, orderID, restID, outID, 80000,
				fmt.Sprintf("race-%d", i), userID, fmt.Sprintf("race-key-%s-%d", suffix, i))
			errs[i] = err
		}(i)
	}
	close(start) // release both racers together
	wg.Wait()

	succeeded := 0
	for _, err := range errs {
		if err == nil {
			succeeded++
		} else if !errors.Is(err, ErrRefundExceedsRemain) {
			t.Fatalf("loser must fail with ErrRefundExceedsRemain, got %v", err)
		}
	}
	if succeeded != 1 {
		t.Fatalf("expected exactly 1 successful refund, got %d (errs=%v)", succeeded, errs)
	}

	var refundedRupees float64
	must("sum", database.DB.QueryRow(
		`SELECT COALESCE(SUM(ABS(amount)), 0) FROM order_payments WHERE refund_of = $1 AND amount < 0`,
		payID).Scan(&refundedRupees))
	if refunded := paiseFromDecimal(refundedRupees); refunded != 80000 {
		t.Fatalf("expected ₹800 refunded total, got %d paise", refunded)
	}
}
