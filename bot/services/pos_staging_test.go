package services

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Live staging acceptance for PR 5 (merge gate).
//
// Covers, against real PostgreSQL: the complete cashier flow with
// server-computed pricing, payment/refund idempotency, tenant and
// outlet isolation, and the state machine's terminal/due guards.
// The concurrent refund race lives in refund_concurrency_test.go;
// the HTTP role matrix in bot/admin/pos_staging_roles_test.go.
// ------------------------------------------------------------------

// stagingTenant is an isolated org/restaurant/outlet set plus POS fixtures.
type stagingTenant struct {
	suffix  string
	orgID   int
	restID  int
	outID   int
	out2ID  int
	userID  int
	catID   int
	itemID  int
	crust   string
	discID  int
	discCd  string
	tableID int
	tableNm string
}

// seedStagingTenant builds a full tenant: 5% tax, one sized menu item,
// one crust, one 10% discount, one table, two outlets, one cashier.
func seedStagingTenant(t *testing.T, prefix string) *stagingTenant {
	t.Helper()
	st := &stagingTenant{suffix: fmt.Sprintf("%s%d", prefix, time.Now().UnixNano())}
	s := st.suffix
	q := func(msg, query string, args ...any) int {
		t.Helper()
		var id int
		if err := database.DB.QueryRow(query, args...).Scan(&id); err != nil {
			t.Fatalf("%s: %v", msg, err)
		}
		return id
	}
	st.orgID = q("org", `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		"stg "+s, "stg-org-"+s)
	st.restID = q("restaurant", `INSERT INTO restaurants (organization_id, name, slug, currency, timezone) VALUES ($1, $2, $3, 'INR', 'Asia/Kolkata') RETURNING id`,
		st.orgID, "stg "+s, "stg-rest-"+s)
	st.outID = q("outlet", `INSERT INTO outlets (restaurant_id, name, slug, active, sort_order) VALUES ($1, $2, $3, true, 0) RETURNING id`,
		st.restID, "stg out", "stg-out-"+s)
	st.out2ID = q("outlet2", `INSERT INTO outlets (restaurant_id, name, slug, active, sort_order) VALUES ($1, $2, $3, true, 1) RETURNING id`,
		st.restID, "stg out2", "stg-out2-"+s)
	st.userID = q("user", `INSERT INTO users (organization_id, name, key_hash, role, active) VALUES ($1, $2, $3, 'cashier', true) RETURNING id`,
		st.orgID, "stg cashier", "stg-key-"+s)
	st.catID = q("category", `INSERT INTO menu_categories (name, slug, restaurant_id) VALUES ($1, $2, $3) RETURNING id`,
		"stg cat", "stg-cat-"+s, st.restID)
	st.itemID = q("item", `INSERT INTO menu_items (category_id, name, slug, description, price, price_regular, price_medium, price_large, available, active, restaurant_id)
		VALUES ($1, $2, $3, '', 400, 400, 500, 600, true, true, $4) RETURNING id`,
		st.catID, "stg pizza", "stg-pizza-"+s, st.restID)
	st.crust = "stg-crust-" + s
	q("crust", `INSERT INTO menu_crusts (slug, name, price_regular, price_medium, price_large, active, sort_order, restaurant_id)
		VALUES ($1, $2, 30, 50, 70, true, 0, $3) RETURNING id`,
		st.crust, "stg crust", st.restID)
	st.discCd = "STG10-" + s
	st.discID = q("discount", `INSERT INTO discounts (restaurant_id, name, code, type, value, active, min_subtotal)
		VALUES ($1, $2, $3, 'percent', 10, true, 0) RETURNING id`,
		st.restID, "stg 10pct", st.discCd)
	st.tableNm = "STG-" + s[len(s)-6:]
	st.tableID = q("table", `INSERT INTO tables (outlet_id, restaurant_id, name, capacity, position) VALUES ($1, $2, $3, 4, 0) RETURNING id`,
		st.outID, st.restID, st.tableNm)
	if _, err := database.DB.Exec(`UPDATE restaurants SET tax_percent = 5 WHERE id = $1`, st.restID); err != nil {
		t.Fatalf("tax: %v", err)
	}

	t.Cleanup(func() {
		_, _ = database.DB.Exec(`DELETE FROM order_payments WHERE restaurant_id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM order_items WHERE restaurant_id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM orders WHERE restaurant_id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM discounts WHERE restaurant_id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM tables WHERE restaurant_id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM menu_items WHERE restaurant_id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM menu_crusts WHERE restaurant_id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM menu_categories WHERE restaurant_id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM outlets WHERE restaurant_id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM users WHERE organization_id = $1`, st.orgID)
		_, _ = database.DB.Exec(`DELETE FROM restaurants WHERE id = $1`, st.restID)
		_, _ = database.DB.Exec(`DELETE FROM organizations WHERE id = $1`, st.orgID)
	})
	return st
}

// readTotals returns (subtotal, discount, tax, total) in rupees.
func readTotals(t *testing.T, orderID int) (float64, float64, float64, float64) {
	t.Helper()
	var sub, disc, tax, total float64
	if err := database.DB.QueryRow(
		`SELECT subtotal, discount, tax_amount, total FROM orders WHERE id = $1`,
		orderID).Scan(&sub, &disc, &tax, &total); err != nil {
		t.Fatalf("read totals: %v", err)
	}
	return sub, disc, tax, total
}

func TestStagingCashierFlow(t *testing.T) {
	stagingDB(t)
	st := seedStagingTenant(t, "flow")
	svc := NewPOSOrderService()

	// 1. Create: 2x medium (500) + crust (50) => 2 x 550 = 1100.
	order, err := svc.CreateOrder(st.restID, st.outID, []DraftItem{
		{MenuItemID: st.itemID, Size: "medium", Crust: st.crust, Quantity: 2},
	}, 0, SourcePOS)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if order.Status != OrderStatusDraft {
		t.Fatalf("new order must be draft, got %q", order.Status)
	}
	if order.Source != "" && order.Source != SourcePOS {
		t.Fatalf("source must be pos, got %q", order.Source)
	}
	// Fresh draft carries 5% tax: 1100 + 55 = 1155.
	if sub, _, tax, total := readTotals(t, order.ID); sub != 1100 || tax != 55 || total != 1155 {
		t.Fatalf("expected 1100/55/1155, got sub=%v tax=%v total=%v", sub, tax, total)
	}
	// Stored line must carry the canonical unit price, not client math.
	var unitPrice float64
	var opts string
	if err := database.DB.QueryRow(
		`SELECT unit_price, options::text FROM order_items WHERE order_id = $1`,
		order.ID).Scan(&unitPrice, &opts); err != nil {
		t.Fatalf("line: %v", err)
	}
	if unitPrice != 550 {
		t.Fatalf("expected canonical unit price 550, got %v", unitPrice)
	}

	// 2. Discount 10%: 110000 -> -11000, tax 5% of 99000 = 4950, total 103950 paise.
	if err := svc.ApplyDiscount(order.ID, st.discID); err != nil {
		t.Fatalf("apply discount: %v", err)
	}
	if sub, disc, tax, total := readTotals(t, order.ID); sub != 1100 || disc != 110 || tax != 49.50 || total != 1039.50 {
		t.Fatalf("discounted totals wrong: sub=%v disc=%v tax=%v total=%v", sub, disc, tax, total)
	}

	// 3. Remove discount: back to 1100 + 55 tax = 1155, then re-apply.
	if err := RemoveDiscountFromOrder(order.ID); err != nil {
		t.Fatalf("remove discount: %v", err)
	}
	if sub, disc, tax, total := readTotals(t, order.ID); sub != 1100 || disc != 0 || tax != 55 || total != 1155 {
		t.Fatalf("undiscounted totals wrong: sub=%v disc=%v tax=%v total=%v", sub, disc, tax, total)
	}
	if err := svc.ApplyDiscount(order.ID, st.discID); err != nil {
		t.Fatalf("re-apply discount: %v", err)
	}

	// 4. Table, hold, resume.
	if err := svc.SetTable(order.ID, st.tableID, st.restID, st.outID); err != nil {
		t.Fatalf("assign table: %v", err)
	}
	var tblStatus string
	if err := database.DB.QueryRow(`SELECT status FROM tables WHERE id = $1`, st.tableID).Scan(&tblStatus); err != nil || tblStatus != "occupied" {
		t.Fatalf("table must be occupied, got %q (%v)", tblStatus, err)
	}
	if ok, err := svc.HoldOrder(order.ID, st.userID, "manual"); err != nil || !ok {
		t.Fatalf("hold: ok=%v err=%v", ok, err)
	}
	if _, err := svc.HoldOrder(order.ID, st.userID, "manual"); err == nil {
		t.Fatal("second hold must fail")
	}
	if err := svc.ResumeOrder(order.ID); err != nil {
		t.Fatalf("resume: %v", err)
	}
	if err := svc.ResumeOrder(order.ID); err == nil {
		t.Fatal("second resume must fail")
	}

	// 5. Split payment: 500 cash + 539.50 UPI = 1039.50, due 0.
	payCash, _, due, err := svc.TakePayment(order.ID, st.restID, st.outID, "cash", 50000, 50000, "stg-cash", st.userID, "stg-k1-"+st.suffix)
	if err != nil || due != 53950 {
		t.Fatalf("cash pay: due=%d err=%v", due, err)
	}
	_ = payCash
	payUPI, _, due, err := svc.TakePayment(order.ID, st.restID, st.outID, "upi", 53950, 53950, "stg-upi", st.userID, "stg-k2-"+st.suffix)
	if err != nil || due != 0 {
		t.Fatalf("upi pay: due=%d err=%v", due, err)
	}

	// 6. Complete, then prove terminal states are frozen.
	if err := svc.CompleteOrder(order.ID); err != nil {
		t.Fatalf("complete: %v", err)
	}
	for name, fn := range map[string]func() error{
		"complete again": func() error { return svc.CompleteOrder(order.ID) },
		"pay completed":  func() error { _, _, _, err := svc.TakePayment(order.ID, st.restID, st.outID, "cash", 100, 100, "", st.userID, ""); return err },
		"hold completed": func() error { _, err := svc.HoldOrder(order.ID, st.userID, "x"); return err },
		"discount done":  func() error { return RemoveDiscountFromOrder(order.ID) },
	} {
		if err := fn(); err == nil {
			t.Fatalf("%s must fail on a completed order", name)
		}
	}

	// 7. Full refund of the UPI leg: +50000 +53950 -53950 => net 50000.
	if _, _, err := RefundPayment(payUPI, order.ID, st.restID, st.outID, 53950, "stg-ref", st.userID, "stg-rk-"+st.suffix); err != nil {
		t.Fatalf("refund: %v", err)
	}
	sum, err := ComputeSummaryFromLedger(order.ID)
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if sum.Paid != 103950 || sum.Refunded != 53950 || sum.Due != 53950 || sum.Total != 103950 || sum.Overpaid != 0 {
		t.Fatalf("ledger wrong: %+v", sum)
	}
	if net := sum.Paid - sum.Refunded; net != 50000 {
		t.Fatalf("net collected must be 50000 paise, got %d", net)
	}
	if _, _, err := RefundPayment(payUPI, order.ID, st.restID, st.outID, 100, "x", st.userID, ""); !errors.Is(err, ErrRefundAlreadyComplete) {
		t.Fatalf("expected ErrRefundAlreadyComplete, got %v", err)
	}
}

func TestStagingPaymentIdempotency(t *testing.T) {
	stagingDB(t)
	st := seedStagingTenant(t, "idem")
	svc := NewPOSOrderService()

	order, err := svc.CreateOrder(st.restID, st.outID, []DraftItem{
		{MenuItemID: st.itemID, Quantity: 1},
	}, 0, SourcePOS)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	key := "idem-pay-" + st.suffix
	p1, replayed, _, err := svc.TakePayment(order.ID, st.restID, st.outID, "cash", 20000, 20000, "", st.userID, key)
	if err != nil || replayed {
		t.Fatalf("first payment: id=%d replayed=%v err=%v", p1, replayed, err)
	}
	p2, replayed, _, err := svc.TakePayment(order.ID, st.restID, st.outID, "cash", 20000, 20000, "", st.userID, key)
	if err != nil || !replayed || p2 != p1 {
		t.Fatalf("replay must return original: id=%d replayed=%v err=%v", p2, replayed, err)
	}
	var n int
	if err := database.DB.QueryRow(
		`SELECT COUNT(*) FROM order_payments WHERE order_id = $1 AND idempotency_key = $2`,
		order.ID, key).Scan(&n); err != nil || n != 1 {
		t.Fatalf("duplicate key must yield exactly one row, got %d (%v)", n, err)
	}

	rkey := "idem-ref-" + st.suffix
	r1, rreplayed, err := RefundPayment(p1, order.ID, st.restID, st.outID, 5000, "", st.userID, rkey)
	if err != nil || rreplayed {
		t.Fatalf("first refund: id=%d replayed=%v err=%v", r1, rreplayed, err)
	}
	r2, rreplayed, err := RefundPayment(p1, order.ID, st.restID, st.outID, 5000, "", st.userID, rkey)
	if err != nil || !rreplayed || r2 != r1 {
		t.Fatalf("refund replay must return original: id=%d replayed=%v err=%v", r2, rreplayed, err)
	}
}

func TestStagingTenantIsolation(t *testing.T) {
	stagingDB(t)
	a := seedStagingTenant(t, "tnta")
	b := seedStagingTenant(t, "tntb")
	svc := NewPOSOrderService()

	order, err := svc.CreateOrder(a.restID, a.outID, []DraftItem{
		{MenuItemID: a.itemID, Quantity: 1},
	}, 0, SourcePOS)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	pay, _, _, err := svc.TakePayment(order.ID, a.restID, a.outID, "cash", 20000, 20000, "", a.userID, "")
	if err != nil {
		t.Fatalf("pay: %v", err)
	}

	// Restaurant B credentials must not move Restaurant A money.
	if _, _, _, err := svc.TakePayment(order.ID, b.restID, b.outID, "cash", 100, 100, "", b.userID, ""); err == nil ||
		!strings.Contains(err.Error(), "current restaurant/outlet") {
		t.Fatalf("cross-restaurant payment must fail, got %v", err)
	}
	if _, _, err := RefundPayment(pay, order.ID, b.restID, b.outID, 100, "", b.userID, ""); !errors.Is(err, ErrRefundTenantMismatch) {
		t.Fatalf("expected ErrRefundTenantMismatch, got %v", err)
	}
	if err := svc.SetTable(order.ID, b.tableID, a.restID, a.outID); err == nil {
		t.Fatal("cross-restaurant table assignment must fail")
	}
	if err := svc.SetTable(order.ID, a.tableID, b.restID, b.outID); err == nil {
		t.Fatal("cross-restaurant order scoping must fail")
	}
	if rule := GetDiscountByCode(b.restID, a.discCd); rule != nil {
		t.Fatal("restaurant B must not see restaurant A discount codes")
	}
	if err := svc.ApplyDiscount(order.ID, b.discID); err == nil {
		t.Fatal("foreign discount must be rejected")
	}
	// Outlet boundary inside one restaurant.
	if _, _, _, err := svc.TakePayment(order.ID, a.restID, a.out2ID, "cash", 100, 100, "", a.userID, ""); err == nil {
		t.Fatal("cross-outlet payment must fail")
	}
}

func TestStagingStateMachine(t *testing.T) {
	stagingDB(t)
	st := seedStagingTenant(t, "sm")
	svc := NewPOSOrderService()

	order, err := svc.CreateOrder(st.restID, st.outID, []DraftItem{
		{MenuItemID: st.itemID, Quantity: 1},
	}, 0, SourcePOS)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	// Cannot complete with outstanding due: reach a completable state
	// first (draft cannot jump straight to completed by design).
	if ok, err := svc.HoldOrder(order.ID, st.userID, "x"); err != nil || !ok {
		t.Fatalf("hold: %v", err)
	}
	if err := svc.ResumeOrder(order.ID); err != nil {
		t.Fatalf("resume: %v", err)
	}
	if err := svc.CompleteOrder(order.ID); !errors.Is(err, ErrOrderHasDue) {
		t.Fatalf("expected ErrOrderHasDue, got %v", err)
	}
	// Held cannot jump straight to completed either.
	if ok, err := svc.HoldOrder(order.ID, st.userID, "x"); err != nil || !ok {
		t.Fatalf("hold: %v", err)
	}
	if err := svc.CompleteOrder(order.ID); !errors.Is(err, ErrInvalidOrderTransition) {
		t.Fatalf("expected ErrInvalidOrderTransition, got %v", err)
	}
	if err := svc.ResumeOrder(order.ID); err != nil {
		t.Fatalf("resume: %v", err)
	}
	if err := svc.CancelOrder(order.ID); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	for name, err := range map[string]error{
		"resume cancelled": func() error { return svc.ResumeOrder(order.ID) }(),
		"hold cancelled":   func() error { _, e := svc.HoldOrder(order.ID, st.userID, "x"); return e }(),
	} {
		if !errors.Is(err, ErrInvalidOrderTransition) {
			t.Fatalf("%s: expected ErrInvalidOrderTransition, got %v", name, err)
		}
	}
	if _, _, _, err := svc.TakePayment(order.ID, st.restID, st.outID, "cash", 100, 100, "", st.userID, ""); !errors.Is(err, ErrInvalidOrderTransition) {
		t.Fatalf("pay cancelled: expected ErrInvalidOrderTransition, got %v", err)
	}
}
