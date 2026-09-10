package admin

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/services"
)

// ------------------------------------------------------------------
// HTTP role-matrix acceptance for PR 5 (merge gate, part of staging).
//
// Runs only against live migrated Postgres (OCP_TEST_DATABASE_URL or
// BOT_DATABASE_URL); skips otherwise. Uses the bootstrap ocp org,
// whose system roles carry the 021 presets plus the 026 pos.* grants,
// and drives the real middleware chain (RequireAdminKey ->
// TenantMiddleware -> RequireRole -> RequirePermission) with the same
// guards main.go wires. Asserts the matrix:
//
//	owner/manager  full POS access
//	cashier        create/update/pay, no refund/discount/tables
//	kitchen/viewer read-only (kitchen: no payment/refund)
//
// plus cross-tenant denial between two organizations.
// ------------------------------------------------------------------

var stagingMigrateOnce sync.Once

func stagingAdminDB(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("OCP_TEST_DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("BOT_DATABASE_URL")
	}
	if dsn == "" {
		t.Skip("no staging DB: set OCP_TEST_DATABASE_URL to run POS staging tests")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open staging DB: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Fatalf("ping staging DB: %v", err)
	}
	old := database.DB
	database.DB = db
	t.Cleanup(func() {
		database.DB = old
		_ = db.Close()
	})
	stagingMigrateOnce.Do(func() {
		cwd, err := os.Getwd()
		if err != nil {
			t.Fatalf("getwd: %v", err)
		}
		if err := os.Chdir("../"); err != nil {
			t.Fatalf("chdir to bot/: %v", err)
		}
		defer func() {
			_ = os.Chdir(cwd)
		}()
		if err := database.RunMigrations(); err != nil {
			t.Fatalf("run staging migrations: %v", err)
		}
	})
}

func hashKey(k string) string {
	h := sha256.Sum256([]byte(k))
	return hex.EncodeToString(h[:])
}

// stagingRouter mirrors the main.go POS route guards exactly.
func stagingRouter(h *AdminHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	g := r.Group("/admin", h.RequireAdminKey(), TenantMiddleware())
	g.GET("/pos/menu", h.RequirePermission("pos.read"), h.GetPOSMenu)
	g.GET("/pos/orders/:id", h.RequirePermission("pos.read"), h.GetPOSOrder)
	g.POST("/pos/orders/:id/payments",
		h.RequireRole("owner", "manager", "cashier"), h.RequirePermission("pos.take_payment"), h.TakePaymentPOSOrder)
	g.POST("/pos/orders/:id/refunds",
		h.RequireRole("owner", "manager"), h.RequirePermission("pos.refund"), h.RefundPOSOrder)
	g.POST("/pos/discounts",
		h.RequireRole("owner", "manager"), h.RequirePermission("pos.apply_discount"), h.ApplyPOSDiscount)
	g.PATCH("/pos/tables/:id",
		h.RequireRole("owner", "manager"), h.RequirePermission("pos.manage_tables"), h.AssignTableToOrder)
	return r
}

func doReq(t *testing.T, r *gin.Engine, key, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf *bytes.Buffer
	if body == nil {
		buf = bytes.NewBuffer(nil)
	} else {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		buf = bytes.NewBuffer(b)
	}
	req := httptest.NewRequest(method, path, buf)
	req.Header.Set("X-Admin-Key", key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestStagingPOSRoleMatrix(t *testing.T) {
	stagingAdminDB(t)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	var ocpOrg, ocpRest, ocpOut int
	if err := database.DB.QueryRow(`SELECT id FROM organizations WHERE slug = 'ocp'`).Scan(&ocpOrg); err != nil {
		t.Fatalf("ocp org (021 seed) missing: %v", err)
	}
	if err := database.DB.QueryRow(
		`SELECT id FROM restaurants WHERE organization_id = $1 ORDER BY id LIMIT 1`, ocpOrg).Scan(&ocpRest); err != nil {
		t.Fatalf("ocp restaurant: %v", err)
	}
	if err := database.DB.QueryRow(
		`SELECT id FROM outlets WHERE restaurant_id = $1 AND active = true ORDER BY sort_order, id LIMIT 1`,
		ocpRest).Scan(&ocpOut); err != nil {
		t.Fatalf("ocp outlet: %v", err)
	}

	// One API key per system role in the ocp org.
	keys := map[string]string{}
	for _, role := range []string{"owner", "manager", "cashier", "kitchen", "viewer"} {
		k := "stg-" + role + "-" + suffix
		if _, err := database.DB.Exec(
			`INSERT INTO users (organization_id, name, key_hash, role, active) VALUES ($1, $2, $3, $4, true)`,
			ocpOrg, "stg "+role, hashKey(k), role); err != nil {
			t.Fatalf("user %s: %v", role, err)
		}
		keys[role] = k
	}
	t.Cleanup(func() {
		_, _ = database.DB.Exec(`DELETE FROM order_payments WHERE restaurant_id = $1 AND reference LIKE 'stg-role-%'`, ocpRest)
		_, _ = database.DB.Exec(`DELETE FROM order_items WHERE restaurant_id = $1 AND order_id IN (SELECT id FROM orders WHERE restaurant_id = $1 AND order_number LIKE 'STG-ROLE-%')`, ocpRest)
		_, _ = database.DB.Exec(`DELETE FROM orders WHERE restaurant_id = $1 AND order_number LIKE 'STG-ROLE-%'`, ocpRest)
		_, _ = database.DB.Exec(`DELETE FROM menu_items WHERE restaurant_id = $1 AND slug LIKE 'stg-role-item-%'`, ocpRest)
		_, _ = database.DB.Exec(`DELETE FROM menu_categories WHERE restaurant_id = $1 AND slug LIKE 'stg-role-cat-%'`, ocpRest)
		_, _ = database.DB.Exec(`DELETE FROM users WHERE organization_id = $1 AND key_hash LIKE 'stg-%'`, ocpOrg)
	})

	// Hermetic menu item inside the ocp tenant.
	var catID, itemID int
	if err := database.DB.QueryRow(
		`INSERT INTO menu_categories (name, slug, restaurant_id) VALUES ('stg', $1, $2) RETURNING id`,
		"stg-role-cat-"+suffix, ocpRest).Scan(&catID); err != nil {
		t.Fatalf("category: %v", err)
	}
	if err := database.DB.QueryRow(
		`INSERT INTO menu_items (category_id, name, slug, price, available, active, restaurant_id)
		 VALUES ($1, 'stg', $2, 400, true, true, $3) RETURNING id`,
		catID, "stg-role-item-"+suffix, ocpRest).Scan(&itemID); err != nil {
		t.Fatalf("item: %v", err)
	}

	h := NewAdminHandler(services.NewMenuService(), services.NewOrderService(),
		services.NewPOSOrderService(), services.NewEvolutionClient(&config.Config{}), &config.Config{})
	router := stagingRouter(h)
	pos := services.NewPOSOrderService()

	newDraft := func() int {
		t.Helper()
		o, err := pos.CreateOrder(ocpRest, ocpOut, []services.DraftItem{{MenuItemID: itemID, Quantity: 1}}, 0, services.SourcePOS)
		if err != nil {
			t.Fatalf("draft: %v", err)
		}
		if _, err := database.DB.Exec(
			`UPDATE orders SET order_number = 'STG-ROLE-' || id::text WHERE id = $1`, o.ID); err != nil {
			t.Fatalf("tag order: %v", err)
		}
		return o.ID
	}

	// Read-only surface: every role may read.
	for role, k := range keys {
		if w := doReq(t, router, k, "GET", "/admin/pos/menu", nil); w.Code != http.StatusOK {
			t.Fatalf("%s GET /pos/menu: want 200, got %d", role, w.Code)
		}
	}

	// Cashier can take payment (operational access).
	payOrder := newDraft()
	payBody := map[string]any{"method": "cash", "amount": 10000, "tendered": 10000, "reference": "stg-role-cash"}
	if w := doReq(t, router, keys["cashier"], "POST",
		fmt.Sprintf("/admin/pos/orders/%d/payments", payOrder), payBody); w.Code != http.StatusOK {
		t.Fatalf("cashier payment: want 200, got %d (%s)", w.Code, w.Body.String())
	}
	// Kitchen and viewer cannot.
	if w := doReq(t, router, keys["kitchen"], "POST",
		fmt.Sprintf("/admin/pos/orders/%d/payments", payOrder), payBody); w.Code != http.StatusForbidden {
		t.Fatalf("kitchen payment: want 403, got %d", w.Code)
	}
	if w := doReq(t, router, keys["viewer"], "POST",
		fmt.Sprintf("/admin/pos/orders/%d/payments", payOrder), payBody); w.Code != http.StatusForbidden {
		t.Fatalf("viewer payment: want 403, got %d", w.Code)
	}

	// Refunds: manager yes, cashier no.
	payID, _, _, err := pos.TakePayment(payOrder, ocpRest, ocpOut, "upi", 5000, 5000, "stg-role-upi", 0, "")
	if err != nil {
		t.Fatalf("fixture payment: %v", err)
	}
	refBody := map[string]any{"id": payID, "amount": 5000, "reference": "stg-role-ref"}
	if w := doReq(t, router, keys["cashier"], "POST",
		fmt.Sprintf("/admin/pos/orders/%d/refunds", payOrder), refBody); w.Code != http.StatusForbidden {
		t.Fatalf("cashier refund: want 403, got %d", w.Code)
	}
	if w := doReq(t, router, keys["manager"], "POST",
		fmt.Sprintf("/admin/pos/orders/%d/refunds", payOrder), refBody); w.Code != http.StatusOK {
		t.Fatalf("manager refund: want 200, got %d (%s)", w.Code, w.Body.String())
	}

	// Discounts and tables: manager yes (gates), cashier no.
	discBody := map[string]any{}
	if w := doReq(t, router, keys["cashier"], "POST", "/admin/pos/discounts", discBody); w.Code != http.StatusForbidden {
		t.Fatalf("cashier discount: want 403, got %d", w.Code)
	}
	if w := doReq(t, router, keys["cashier"], "PATCH", "/admin/pos/tables/1", discBody); w.Code != http.StatusForbidden {
		t.Fatalf("cashier tables: want 403, got %d", w.Code)
	}
}

func TestStagingTenantIsolationHTTP(t *testing.T) {
	stagingAdminDB(t)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	// Second organization with its own restaurant/outlet/owner.
	var orgB, restB, outB int
	if err := database.DB.QueryRow(
		`INSERT INTO organizations (name, slug) VALUES ('stg-b', $1) RETURNING id`,
		"stg-org-b-"+suffix).Scan(&orgB); err != nil {
		t.Fatalf("orgB: %v", err)
	}
	if err := database.DB.QueryRow(
		`INSERT INTO restaurants (organization_id, name, slug) VALUES ($1, 'stg-b', $2) RETURNING id`,
		orgB, "stg-rest-b-"+suffix).Scan(&restB); err != nil {
		t.Fatalf("restB: %v", err)
	}
	if err := database.DB.QueryRow(
		`INSERT INTO outlets (restaurant_id, name, slug, active, sort_order) VALUES ($1, 'b', $2, true, 0) RETURNING id`,
		restB, "stg-out-b-"+suffix).Scan(&outB); err != nil {
		t.Fatalf("outB: %v", err)
	}
	keyB := "stg-owner-b-" + suffix
	if _, err := database.DB.Exec(
		`INSERT INTO users (organization_id, name, key_hash, role, active) VALUES ($1, 'b-owner', $2, 'owner', true)`,
		orgB, hashKey(keyB)); err != nil {
		t.Fatalf("userB: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.DB.Exec(`DELETE FROM outlets WHERE restaurant_id = $1`, restB)
		_, _ = database.DB.Exec(`DELETE FROM users WHERE organization_id = $1`, orgB)
		_, _ = database.DB.Exec(`DELETE FROM restaurants WHERE id = $1`, restB)
		_, _ = database.DB.Exec(`DELETE FROM organizations WHERE id = $1`, orgB)
	})

	var ocpOrg, ocpRest, ocpOut int
	if err := database.DB.QueryRow(`SELECT id FROM organizations WHERE slug = 'ocp'`).Scan(&ocpOrg); err != nil {
		t.Fatalf("ocp org: %v", err)
	}
	if err := database.DB.QueryRow(
		`SELECT id FROM restaurants WHERE organization_id = $1 ORDER BY id LIMIT 1`, ocpOrg).Scan(&ocpRest); err != nil {
		t.Fatalf("ocp restaurant: %v", err)
	}
	if err := database.DB.QueryRow(
		`SELECT id FROM outlets WHERE restaurant_id = $1 AND active = true ORDER BY sort_order, id LIMIT 1`,
		ocpRest).Scan(&ocpOut); err != nil {
		t.Fatalf("ocp outlet: %v", err)
	}
	var catID, itemID int
	if err := database.DB.QueryRow(
		`INSERT INTO menu_categories (name, slug, restaurant_id) VALUES ('stg', $1, $2) RETURNING id`,
		"stg-iso-cat-"+suffix, ocpRest).Scan(&catID); err != nil {
		t.Fatalf("category: %v", err)
	}
	if err := database.DB.QueryRow(
		`INSERT INTO menu_items (category_id, name, slug, price, available, active, restaurant_id)
		 VALUES ($1, 'stg', $2, 400, true, true, $3) RETURNING id`,
		catID, "stg-iso-item-"+suffix, ocpRest).Scan(&itemID); err != nil {
		t.Fatalf("item: %v", err)
	}
	pos := services.NewPOSOrderService()
	orderA, err := pos.CreateOrder(ocpRest, ocpOut,
		[]services.DraftItem{{MenuItemID: itemID, Quantity: 1}}, 0, services.SourcePOS)
	if err != nil {
		t.Fatalf("orderA: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.DB.Exec(`DELETE FROM order_payments WHERE order_id = $1`, orderA.ID)
		_, _ = database.DB.Exec(`DELETE FROM order_items WHERE order_id = $1`, orderA.ID)
		_, _ = database.DB.Exec(`DELETE FROM orders WHERE id = $1`, orderA.ID)
		_, _ = database.DB.Exec(`DELETE FROM menu_items WHERE id = $1`, itemID)
		_, _ = database.DB.Exec(`DELETE FROM menu_categories WHERE id = $1`, catID)
	})

	h := NewAdminHandler(services.NewMenuService(), services.NewOrderService(),
		services.NewPOSOrderService(), services.NewEvolutionClient(&config.Config{}), &config.Config{})
	router := stagingRouter(h)

	// Org B owner (permission-bypassed) still cannot see org A's order.
	if w := doReq(t, router, keyB, "GET", fmt.Sprintf("/admin/pos/orders/%d", orderA.ID), nil); w.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant read: want 404, got %d", w.Code)
	}
	// ... nor move its money.
	payBody := map[string]any{"method": "cash", "amount": 100, "tendered": 100}
	if w := doReq(t, router, keyB, "POST",
		fmt.Sprintf("/admin/pos/orders/%d/payments", orderA.ID), payBody); w.Code == http.StatusOK {
		t.Fatal("cross-tenant payment must not succeed")
	}
	var n int
	if err := database.DB.QueryRow(
		`SELECT COUNT(*) FROM order_payments WHERE order_id = $1 AND restaurant_id = $2`, orderA.ID, restB).Scan(&n); err != nil || n != 0 {
		t.Fatalf("cross-tenant ledger write detected: n=%d err=%v", n, err)
	}
}
