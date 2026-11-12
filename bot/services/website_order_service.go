package services

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
	"html"
)

// stripHTMLTags removes HTML tags from user-provided text to prevent injection
// in receipts and customer-facing displays.
func stripHTMLTags(s string) string {
	return html.UnescapeString(regexp.MustCompile(`<[^>]*>`).ReplaceAllString(s, ""))
}

// ------------------------------------------------------------------
// Website order flow (Phase 2.2)
//
// POST /api/orders:
//   validate -> price from PostgreSQL (menu_items + menu_crusts)
//   -> BEGIN TX -> orders + order_items + order_events -> COMMIT
//   -> Evolution GO WhatsApp notification (best effort, never fails
//      the request; skipped when RESTAURANT_WHATSAPP_NUMBER is empty)
// ------------------------------------------------------------------

type WebsiteOrderItemRequest struct {
	ID       string `json:"id"`
	Size     string `json:"size,omitempty"`
	Crust    string `json:"crust,omitempty"`
	Quantity int    `json:"quantity"`
	// ComboSlug marks this line as a combo. ID then points at the
	// combo's backing menu item, and ComboSelection carries the items
	// the customer picked (required for pick-N combos).
	ComboSlug     string                `json:"combo_slug,omitempty"`
	ComboSelection []ComboSelectionItem `json:"combo_selection,omitempty"`
}

// ComboSelectionItem is one item the customer chose within a combo.
type ComboSelectionItem struct {
	MenuItemID int    `json:"menu_item_id"`
	Size       string `json:"size,omitempty"`
	Quantity   int    `json:"quantity"`
}

type WebsiteCustomerRequest struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Email string `json:"email,omitempty"`
}

type WebsiteOrderRequest struct {
	Customer      WebsiteCustomerRequest    `json:"customer"`
	DeliveryType  string                    `json:"delivery_type"`
	Address       string                    `json:"address,omitempty"`
	Landmark      string                    `json:"landmark,omitempty"`
	PaymentMethod string                    `json:"payment_method"`
	Items         []WebsiteOrderItemRequest `json:"items"`
	Source        string                    `json:"source,omitempty"` // website | whatsapp
}

type WebsiteOrderLine struct {
	MenuItemID int     `json:"menu_item_id"`
	Slug       string  `json:"slug,omitempty"`
	Name       string  `json:"name"`
	Size       string  `json:"size,omitempty"`
	Crust      string  `json:"crust,omitempty"`
	CrustName  string  `json:"crust_name,omitempty"`
	Quantity   int     `json:"quantity"`
	UnitPrice  float64 `json:"unit_price"`
	LineTotal  float64 `json:"line_total"`
	// ComboSlug / ComboItems are set when the line is a combo. The line
	// is billed at the combo price; ComboItems records what was chosen.
	ComboSlug  string           `json:"combo_slug,omitempty"`
	ComboID    int              `json:"combo_id,omitempty"`
	ComboItems []OrderComboItem `json:"combo_items,omitempty"`
}

// OrderComboItem is one resolved item inside a combo order line.
type OrderComboItem struct {
	MenuItemID int     `json:"menu_item_id"`
	Name       string  `json:"name"`
	Size       string  `json:"size,omitempty"`
	Quantity   int     `json:"quantity"`
	UnitPrice  float64 `json:"unit_price"`
	LineTotal  float64 `json:"line_total"`
}

type WhatsAppOutcome struct {
	Sent    bool   `json:"sent"`
	Skipped bool   `json:"skipped,omitempty"`
	Reason  string `json:"reason,omitempty"`
}

type WebsiteOrderResult struct {
	ID            int                 `json:"id"`
	OrderNumber   string              `json:"order_number"`
	Status        string              `json:"status"`
	CustomerName  string              `json:"customer_name"`
	CustomerPhone string              `json:"customer_phone"`
	Email         string              `json:"email,omitempty"`
	DeliveryType  string              `json:"delivery_type"`
	Address       string              `json:"address,omitempty"`
	Landmark      string              `json:"landmark,omitempty"`
	PaymentMethod string              `json:"payment_method"`
	Items         []WebsiteOrderLine  `json:"items"`
	Events        []models.OrderEvent `json:"events,omitempty"`
	Subtotal      float64             `json:"subtotal"`
	DeliveryFee   float64             `json:"delivery_fee"`
	Discount      float64             `json:"discount"`
	Total         float64             `json:"total"`
	CreatedAt     time.Time           `json:"created_at"`
	ETAminutes    int                 `json:"eta_minutes"`
	Source        string              `json:"source,omitempty"`
	AccessToken   string              `json:"access_token,omitempty"`
	WhatsApp      WhatsAppOutcome     `json:"-"`
	Replayed      bool                `json:"-"`
}

// ValidationError maps cleanly to HTTP 400.
type ValidationError struct{ Msg string }

func (e *ValidationError) Error() string { return e.Msg }

func badRequest(format string, args ...interface{}) *ValidationError {
	return &ValidationError{Msg: fmt.Sprintf(format, args...)}
}

var phoneDigits = regexp.MustCompile(`^[0-9]{10,13}$`)

type WebsiteOrderService struct {
	menu      *MenuService
	evolution *EvolutionClient
	cfg       *config.Config
}

func NewWebsiteOrderService(menu *MenuService, evolution *EvolutionClient, cfg *config.Config) *WebsiteOrderService {
	return &WebsiteOrderService{menu: menu, evolution: evolution, cfg: cfg}
}

// ------------------------------------------------------------------
// Pricing helpers (exported for unit tests)
// ------------------------------------------------------------------

// CrustCharge returns the extra charge for a crust at a given size.
func CrustCharge(priceRegular, priceMedium, priceLarge sql.NullFloat64, size string) float64 {
	switch size {
	case "medium":
		if priceMedium.Valid {
			return priceMedium.Float64
		}
	case "large":
		if priceLarge.Valid {
			return priceLarge.Float64
		}
	default: // regular / ""
		if priceRegular.Valid {
			return priceRegular.Float64
		}
	}
	return 0
}

// ValidateQuantities enforces sane cart limits.
func ValidateQuantities(items []WebsiteOrderItemRequest) error {
	if len(items) == 0 {
		return badRequest("cart is empty")
	}
	if len(items) > 50 {
		return badRequest("too many distinct items (max 50)")
	}
	for _, it := range items {
		if it.Quantity < 1 || it.Quantity > 20 {
			return badRequest("quantity for %q must be between 1 and 20", it.ID)
		}
	}
	return nil
}

func canonicalPhoneRaw(phone string) string {
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	if len(cleaned) == 12 && strings.HasPrefix(cleaned, "91") {
		return cleaned[2:]
	}
	if len(cleaned) == 11 && cleaned[0] == '0' {
		return cleaned[1:]
	}
	return cleaned
}

func normalizePhone(phone string) (string, error) {
	cleaned := canonicalPhoneRaw(phone)
	if !phoneDigits.MatchString(cleaned) {
		return "", badRequest("invalid phone number")
	}
	// Enforce 10-digit canonical for OCP sync (web ↔ WhatsApp same customer)
	if len(cleaned) > 10 {
		cleaned = cleaned[len(cleaned)-10:]
	}
	if len(cleaned) != 10 {
		return "", badRequest("enter a 10-digit mobile number")
	}
	return cleaned, nil
}

// ------------------------------------------------------------------
// Create
// ------------------------------------------------------------------

// Create validates, prices from PostgreSQL, persists atomically, then
// attempts the WhatsApp notification. Returns (result, replayed, error).
// A nil error with Replay=false and HTTP layer mapping gives 201;
// replayed idempotent hits return the stored order with Replay=true.
func (s *WebsiteOrderService) Create(req *WebsiteOrderRequest, idempotencyKey string) (*WebsiteOrderResult, error) {
	return s.CreateFor(req, idempotencyKey, 0)
}

// priceComboLine resolves a combo order line. The line is billed at the
// combo price; the customer's selection is validated against the combo's
// pool and recorded so the kitchen knows what to prepare.
func (s *WebsiteOrderService) priceComboLine(requested WebsiteOrderItemRequest, rid int) (WebsiteOrderLine, error) {
	comboSvc := NewComboService()
	combo, err := comboSvc.GetActiveBySlug(requested.ComboSlug, rid)
	if err != nil {
		if errors.Is(err, ErrComboNotFound) {
			return WebsiteOrderLine{}, badRequest("combo is not available: %s", requested.ComboSlug)
		}
		return WebsiteOrderLine{}, err
	}
	if combo.MenuItemID == 0 {
		return WebsiteOrderLine{}, badRequest("combo %s is not orderable", combo.Slug)
	}

	selection, err := comboSvc.ResolveSelection(combo, requested.ComboSelection)
	if err != nil {
		if ve, ok := err.(*ComboValidationError); ok {
			return WebsiteOrderLine{}, badRequest("%s", ve.Msg)
		}
		return WebsiteOrderLine{}, err
	}

	comboItems := make([]OrderComboItem, 0, len(selection))
	for _, sel := range selection {
		comboItems = append(comboItems, OrderComboItem{
			MenuItemID: sel.MenuItemID,
			Name:       sel.Name,
			Size:       sel.Size,
			Quantity:   sel.Quantity,
			UnitPrice:  sel.UnitPrice,
			LineTotal:  sel.LineTotal,
		})
	}

	return WebsiteOrderLine{
		MenuItemID: combo.MenuItemID,
		Slug:       combo.Slug,
		Name:       combo.Name,
		Quantity:   requested.Quantity,
		UnitPrice:  combo.ComboPrice,
		LineTotal:  round2(combo.ComboPrice * float64(requested.Quantity)),
		ComboSlug:  combo.Slug,
		ComboID:    combo.ID,
		ComboItems: comboItems,
	}, nil
}

func (s *WebsiteOrderService) CreateFor(req *WebsiteOrderRequest, idempotencyKey string, restaurantID int) (*WebsiteOrderResult, error) {
	if restaurantID == 0 && !IsSingleTenantMode() {
		return nil, ErrTenantRequired
	}
	ridForScope := ResolveRestaurant(restaurantID)
	if idempotencyKey != "" {
		if existing, err := s.getByIdepotencyKeyFor(idempotencyKey, ridForScope); err == nil && existing != nil {
			existing.Replayed = true
			return existing, nil
		}
	}

	// ---- validation ----
	name := stripHTMLTags(strings.TrimSpace(req.Customer.Name))
	if name == "" || len(name) > 200 {
		return nil, badRequest("customer name is required")
	}
	phone, err := normalizePhone(req.Customer.Phone)
	if err != nil {
		return nil, err
	}
	req.DeliveryType = NormalizeOrderType(req.DeliveryType)
	if req.DeliveryType != OrderTypeDelivery && req.DeliveryType != OrderTypeTakeaway {
		return nil, badRequest("delivery_type must be delivery or takeaway")
	}
	address := stripHTMLTags(strings.TrimSpace(req.Address))
	if req.DeliveryType == OrderTypeDelivery && address == "" {
		return nil, badRequest("address is required for delivery")
	}
	biz := GetBizConfigFor(ridForScope)
	if biz == nil {
		return nil, badRequest("restaurant configuration not found")
	}
	validPayments := biz.GetValidPaymentMethods()
	validSizes := biz.GetValidSizes()

	if !validPayments[req.PaymentMethod] {
		return nil, badRequest("payment_method must be one of the configured methods")
	}
	if req.Customer.Email != "" {
		emailRegex := regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
		if !emailRegex.MatchString(req.Customer.Email) {
			return nil, &ValidationError{Msg: "invalid email format"}
		}
	}
	if err := ValidateQuantities(req.Items); err != nil {
		return nil, err
	}

	// ---- price calculation from PostgreSQL ----
	lines := make([]WebsiteOrderLine, 0, len(req.Items))
	var subtotal float64
	for _, requested := range req.Items {
		// A combo line is billed at the combo price, not the sum of its
		// parts. The combo is resolved from the DB and the customer's
		// selection is validated against its pool.
		if requested.ComboSlug != "" {
			line, err := s.priceComboLine(requested, ridForScope)
			if err != nil {
				return nil, err
			}
			subtotal += line.LineTotal
			lines = append(lines, line)
			continue
		}

		item, err := s.menu.GetItemByIdentifierFor(requested.ID, ridForScope)
		if err != nil || item == nil {
			return nil, badRequest("unknown or unavailable menu item: %s", requested.ID)
		}

		size := strings.ToLower(strings.TrimSpace(requested.Size))
		if size != "" {
			if !validSizes[size] {
				return nil, badRequest("invalid size %q for %s", size, item.Name)
			}
			if item.PriceBySize != nil {
				if _, ok := item.PriceBySize[size]; !ok {
					return nil, badRequest("size %q not offered for %s", size, item.Name)
				}
			} else if size != "regular" {
				return nil, badRequest("%s is single-size; omit the size", item.Name)
			}
		}

		base := item.PriceBySizeFor(size)

		crustSlug := strings.ToLower(strings.TrimSpace(requested.Crust))
		crustName := ""
		crustExtra := 0.0
		if crustSlug != "" {
			row := database.DB.QueryRow(`
				SELECT name, price_regular, price_medium, price_large
				FROM menu_crusts WHERE slug = $1 AND active = true AND restaurant_id = $2
			`, crustSlug, ridForScope)
			var cName string
			var pr, pm, pl sql.NullFloat64
			if err := row.Scan(&cName, &pr, &pm, &pl); err != nil {
				if err == sql.ErrNoRows {
					return nil, badRequest("unknown crust: %s", crustSlug)
				}
				return nil, fmt.Errorf("crust lookup failed: %w", err)
			}
			crustName = cName
			crustExtra = CrustCharge(pr, pm, pl, size)
		}

		unit := base + crustExtra
		line := WebsiteOrderLine{
			MenuItemID: item.ID,
			Slug:       item.Slug,
			Name:       item.Name,
			Size:       size,
			Crust:      crustSlug,
			CrustName:  crustName,
			Quantity:   requested.Quantity,
			UnitPrice:  unit,
			LineTotal:  unit * float64(requested.Quantity),
		}
		subtotal += line.LineTotal
		lines = append(lines, line)
	}

	deliveryFee := 0.0
	if req.DeliveryType == "delivery" {
		deliveryFee = biz.DeliveryFee
	}
	discount := 0.0
	total := subtotal + deliveryFee - discount

	// ---- transactional persist ----
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("tx begin failed: %w", err)
	}
	defer tx.Rollback()

	var seq int64
	if err := tx.QueryRow(`SELECT nextval('ocp_order_number_seq')`).Scan(&seq); err != nil {
		return nil, fmt.Errorf("order number generation failed: %w", err)
	}
	orderNumber := fmt.Sprintf("%s-%s-%04d", strings.ToUpper(biz.OrderPrefix), time.Now().Format("20060102"), seq)

	source := req.Source
	if source != SourceWhatsApp {
		source = SourceWebsite // authoritative default; never trust client values blindly
	}

	var (
		orderID     int
		createdAt   time.Time
		accessToken string
	)
	rid := ridForScope
	outletID := DefaultOutletID(rid)
	err = tx.QueryRow(`
		INSERT INTO orders
			(order_number, customer_name, customer_phone, email, order_type,
			 address, landmark, payment_method, subtotal, delivery_fee, discount,
			 total, status, idempotency_key, source, access_token, restaurant_id, outlet_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'confirmed',$13,$14,$15,$16,$17)
		RETURNING id, created_at, access_token
	`, orderNumber, name, phone, strings.TrimSpace(req.Customer.Email), req.DeliveryType,
		address, stripHTMLTags(strings.TrimSpace(req.Landmark)), req.PaymentMethod,
		subtotal, deliveryFee, discount, total, nullIfEmpty(idempotencyKey), source,
		orderAccessToken(), rid, outletID,
	).Scan(&orderID, &createdAt, &accessToken)
	if err != nil {
		if strings.Contains(err.Error(), "uq_orders") && idempotencyKey != "" {
			if existing, getErr := s.getByIdepotencyKeyFor(idempotencyKey, rid); getErr == nil && existing != nil {
				existing.Replayed = true
				return existing, nil
			}
		}
		return nil, fmt.Errorf("order insert failed: %w", err)
	}

	for _, line := range lines {
		optionsJSON, _ := json.Marshal(map[string]string{
			"size":  line.Size,
			"crust": line.Crust,
		})
		// Combo lines additionally record WHAT was chosen, so the kitchen
		// ticket lists the actual items to prepare.
		comboJSON, _ := json.Marshal(line.ComboItems)
		if line.ComboItems == nil {
			comboJSON = []byte("[]")
		}
		var comboID interface{}
		if line.ComboID > 0 {
			comboID = line.ComboID
		}
		if _, err := tx.Exec(`
			INSERT INTO order_items
				(order_id, menu_item_id, name, quantity, unit_price, options, subtotal, restaurant_id,
				 combo_id, combo_snapshot)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)
		`, orderID, line.MenuItemID, line.Name, line.Quantity, line.UnitPrice,
			string(optionsJSON), line.LineTotal, rid, comboID, string(comboJSON)); err != nil {
			return nil, fmt.Errorf("order item insert failed: %w", err)
		}
	}

	if _, err := tx.Exec(`
		INSERT INTO order_events (order_id, event_type, description)
		VALUES ($1, 'confirmed', 'Order auto-confirmed on creation')
	`, orderID); err != nil {
		return nil, fmt.Errorf("order event insert failed: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("order commit failed: %w", err)
	}

	result := &WebsiteOrderResult{
		ID: orderID, OrderNumber: orderNumber, Status: "confirmed",
		CustomerName: name, CustomerPhone: phone,
		Email:        strings.TrimSpace(req.Customer.Email),
		DeliveryType: req.DeliveryType, Address: address,
		Landmark:      stripHTMLTags(strings.TrimSpace(req.Landmark)),
		PaymentMethod: req.PaymentMethod,
		Items:         lines, Subtotal: subtotal,
		DeliveryFee: deliveryFee, Discount: discount, Total: total,
		CreatedAt: createdAt, Source: source,
	}

	// ---- lifetime stats (post-commit, best effort) ----
	_ = RecordCustomerOrderFor(phone, rid, total)

	// ---- auto-print receipt if printer is configured ----
	go func() {
		// Fetch full order with items for the receipt
		fullOrder, err := defaultOrderService.GetOrderByID(orderID, rid)
		if err != nil || fullOrder == nil {
			log.Printf("[printer] failed to fetch order %d for printing: %v", orderID, err)
			return
		}
		printed, err := PrintOrderReceipt(fullOrder, s.cfg.RestaurantName)
		if err != nil {
			log.Printf("[printer] auto-print failed for order %s: %v", orderNumber, err)
		} else if printed {
			log.Printf("[printer] auto-printed order %s", orderNumber)
		}
	}()

	BroadcastRealtimeFor(rid, outletID, 0, "order.created", map[string]interface{}{
		"order_id": orderID, "order_number": orderNumber, "total": total, "restaurant_id": rid, "outlet_id": outletID,
	})

	// ---- notification (post-commit, best effort) ----
	result.AccessToken = accessToken
	result.WhatsApp = s.notifyWhatsApp(result)
	return result, nil
}

// orderAccessToken generates a cryptographically random per-order token.
// Fails closed — panics if crypto/rand is unavailable rather than emitting
// predictable time-based tokens (which would expose order PII).
// estimateETA returns remaining minutes until delivery based on status and kitchen load.
func estimateETA(status string, createdAt time.Time) int {
	base := map[string]int{
		"placed":           35,
		"confirmed":        28,
		"preparing":        22,
		"ready":            15,
		"out_for_delivery": 10,
		"delivered":        0,
		"completed":        0,
		"cancelled":        0,
	}[status]
	if base == 0 && status != "delivered" && status != "completed" && status != "cancelled" {
		base = 30
	}
	// kitchen load adjustment
	var active int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM orders WHERE status IN ('placed','confirmed','preparing','ready','out_for_delivery') AND created_at > NOW() - INTERVAL '2 hours'`).Scan(&active); err == nil {
		if active > 15 {
			base += 10
		} else if active > 8 {
			base += 5
		}
	}
	// elapsed time reduction
	elapsed := int(time.Since(createdAt).Minutes())
	if elapsed > 0 && elapsed < base {
		base -= elapsed
	}
	if base < 0 {
		base = 0
	}
	return base
}

func orderAccessToken() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand unavailable — cannot generate unpredictable order access token")
	}
	return hex.EncodeToString(b)
}

// Get resolves an order by numeric ID or order number, with items.
// When the order has an access token, token must match (404 otherwise).
// Cancel allows the ordering customer to cancel within 5 minutes of placing,
// only while the order is still in 'placed' or 'confirmed' state.
func (s *WebsiteOrderService) Cancel(identifier, token string) error {
	order, err := s.Get(identifier, token)
	if err != nil {
		return err
	}
	if order == nil {
		return fmt.Errorf("order not found")
	}
	if order.Status != "placed" && order.Status != "confirmed" {
		return fmt.Errorf("order can no longer be cancelled")
	}
	if time.Since(order.CreatedAt) > 5*time.Minute {
		return fmt.Errorf("cancellation window (5 min) has expired")
	}
	_, err = database.DB.Exec(`UPDATE orders SET status='cancelled', updated_at=NOW() WHERE id=$1`, order.ID)
	if err != nil {
		return err
	}
	_, err = database.DB.Exec(`INSERT INTO order_events (order_id, event_type, description) VALUES ($1, 'cancelled', 'Cancelled by customer')`, order.ID)
	BroadcastOrderStatus(order.ID, order.OrderNumber, "cancelled")
	return err
}

func (s *WebsiteOrderService) Get(identifier string, token string) (*WebsiteOrderResult, error) {
	var (
		query string
		arg   interface{}
	)
	if isNumericID(identifier) {
		query = `SELECT id FROM orders WHERE id = $1`
		arg = identifier
	} else {
		query = `SELECT id FROM orders WHERE order_number = $1`
		arg = identifier
	}

	var orderID int
	if err := database.DB.QueryRow(query, arg).Scan(&orderID); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	order, err := s.getByID(orderID)
	if err != nil || order == nil {
		return order, err
	}
	if order.AccessToken == "" {
		// Order has no access token (e.g. WhatsApp bot orders) — cannot be
		// accessed via token auth; require Bearer ownership instead.
		return nil, nil
	}
	if token != order.AccessToken {
		// Unknown token == unknown order: do not confirm existence.
		return nil, nil
	}
	return order, nil
}

func (s *WebsiteOrderService) getByID(orderID int) (*WebsiteOrderResult, error) {
	const cols = `
		id, order_number, status, customer_name, customer_phone,
		COALESCE(email,''), order_type, COALESCE(address,''), COALESCE(landmark,''),
		payment_method, subtotal, delivery_fee, discount, total, created_at,
		COALESCE(access_token,'')
	`
	row := database.DB.QueryRow(`SELECT `+cols+` FROM orders WHERE id = $1`, orderID)
	var o WebsiteOrderResult
	if err := row.Scan(&o.ID, &o.OrderNumber, &o.Status, &o.CustomerName, &o.CustomerPhone,
		&o.Email, &o.DeliveryType, &o.Address, &o.Landmark,
		&o.PaymentMethod, &o.Subtotal, &o.DeliveryFee, &o.Discount, &o.Total, &o.CreatedAt,
		&o.AccessToken); err != nil {
		return nil, err
	}

	o.ETAminutes = estimateETA(o.Status, o.CreatedAt)

	itemRows, err := database.DB.Query(`
		SELECT oi.menu_item_id, oi.name, COALESCE(mi.slug, ''), oi.quantity, oi.unit_price, oi.options, oi.subtotal,
		       COALESCE(oi.combo_id, 0), COALESCE(oi.combo_snapshot, '[]'::jsonb)
		FROM order_items oi
		LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
		WHERE oi.order_id = $1 ORDER BY oi.id
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()

	o.Items = []WebsiteOrderLine{}
	for itemRows.Next() {
		var (
			line        WebsiteOrderLine
			quantity    int
			unitPrice   float64
			optionsJSON []byte
			lineTotal   float64
			comboJSON   []byte
		)
		if err := itemRows.Scan(&line.MenuItemID, &line.Name, &line.Slug, &quantity, &unitPrice, &optionsJSON, &lineTotal,
			&line.ComboID, &comboJSON); err != nil {
			return nil, err
		}
		var opts map[string]string
		_ = json.Unmarshal(optionsJSON, &opts)
		line.Size = opts["size"]
		line.Crust = opts["crust"]
		line.Quantity = quantity
		line.UnitPrice = unitPrice
		line.LineTotal = lineTotal
		if line.ComboID > 0 {
			var comboItems []OrderComboItem
			if err := json.Unmarshal(comboJSON, &comboItems); err == nil {
				line.ComboItems = comboItems
			}
			// Resolve the combo slug for display.
			_ = database.DB.QueryRow(`SELECT slug FROM combos WHERE id = $1`, line.ComboID).Scan(&line.ComboSlug)
		}
		o.Items = append(o.Items, line)
	}
	if err := itemRows.Err(); err != nil {
		return nil, err
	}
	evRows, err := database.DB.Query(`
		SELECT id, order_id, event_type, COALESCE(description,''), created_at
		FROM order_events WHERE order_id = $1 ORDER BY created_at, id
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer evRows.Close()
	o.Events = []models.OrderEvent{}
	for evRows.Next() {
		var ev models.OrderEvent
		if err := evRows.Scan(&ev.ID, &ev.OrderID, &ev.EventType, &ev.Description, &ev.CreatedAt); err != nil {
			return nil, err
		}
		o.Events = append(o.Events, ev)
	}
	return &o, evRows.Err()
}

func (s *WebsiteOrderService) getByIdepotencyKey(key string) (*WebsiteOrderResult, error) {
	return s.getByIdepotencyKeyFor(key, 0)
}

func (s *WebsiteOrderService) getByIdepotencyKeyFor(key string, restaurantID int) (*WebsiteOrderResult, error) {
	if restaurantID != 0 {
		// Scoped lookup only: falling back to the global query on a
		// miss would replay another tenant's order as our own.
		var orderID int
		err := database.DB.QueryRow(`SELECT id FROM orders WHERE idempotency_key = $1 AND restaurant_id = $2`, key, ResolveRestaurant(restaurantID)).Scan(&orderID)
		if err == nil {
			return s.getByID(orderID)
		}
		if err != sql.ErrNoRows {
			return nil, err
		}
		return nil, nil
	}
	var orderID int
	err := database.DB.QueryRow(`SELECT id FROM orders WHERE idempotency_key = $1`, key).Scan(&orderID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return s.getByID(orderID)
}

// notifyWhatsApp sends the restaurant alert AFTER commit. It never
// fails the order: outcomes are logged and reported in the response.
func (s *WebsiteOrderService) notifyWhatsApp(order *WebsiteOrderResult) WhatsAppOutcome {
	dest := strings.TrimSpace(s.cfg.RestaurantWhatsAppNumber)
	if dest == "" {
		log.Println("WhatsApp notification skipped: RESTAURANT_WHATSAPP_NUMBER not configured")
		return WhatsAppOutcome{Skipped: true, Reason: "RESTAURANT_WHATSAPP_NUMBER not configured"}
	}

	var b strings.Builder
	headerKey := "notification_new_website_order"
	if order.Source == "whatsapp" {
		headerKey = "notification_new_wa_order"
	}
	header := Msg(headerKey, nil)
	b.WriteString(header + "\n\n")
	fmt.Fprintf(&b, "Order: %s\n", order.OrderNumber)
	fmt.Fprintf(&b, "Customer: %s\n", order.CustomerName)
	fmt.Fprintf(&b, "Phone: %s\n", order.CustomerPhone)
	fmt.Fprintf(&b, "Type: %s\n\n", strings.Title(order.DeliveryType))

	b.WriteString("Items:\n")
	for i, line := range order.Items {
		label := line.Name
		if line.Size != "" {
			label += " - " + strings.Title(line.Size)
		}
		if line.CrustName != "" {
			label += " + " + line.CrustName
		}
		fmt.Fprintf(&b, "%d × %s\n", line.Quantity, label)
		// Combo lines are billed at the combo price; list what was picked
		// inside so the kitchen knows what to prepare.
		for _, ci := range line.ComboItems {
			ciLabel := ci.Name
			if ci.Size != "" && ci.Size != "regular" {
				ciLabel += " - " + strings.Title(ci.Size)
			}
			fmt.Fprintf(&b, "   - %d × %s\n", ci.Quantity, ciLabel)
		}
		if i == 14 && len(order.Items) > 15 {
			fmt.Fprintf(&b, "...and %d more\n", len(order.Items)-15)
			break
		}
	}

	fmt.Fprintf(&b, "\nSubtotal: \u20B9%.0f\n", order.Subtotal)
	fmt.Fprintf(&b, "Delivery: \u20B9%.0f\n", order.DeliveryFee)
	fmt.Fprintf(&b, "Discount: \u20B9%.0f\n", order.Discount)
	fmt.Fprintf(&b, "Total: \u20B9%.0f\n", order.Total)

	if order.Address != "" {
		fmt.Fprintf(&b, "\nAddress:\n%s\n", order.Address)
	}
	if order.Landmark != "" {
		fmt.Fprintf(&b, "\nLandmark:\n%s\n", order.Landmark)
	}
	fmt.Fprintf(&b, "\nPayment:\n%s\n", strings.ToUpper(order.PaymentMethod))

	if err := s.evolution.SendText(dest, b.String()); err != nil {
		log.Printf("WhatsApp notification failed for order %s: %v", order.OrderNumber, err)
		return WhatsAppOutcome{Reason: err.Error()}
	}
	log.Printf("WhatsApp notification sent for order %s to %s", order.OrderNumber, dest)
	return WhatsAppOutcome{Sent: true}
}

func nullIfEmpty(s string) interface{} {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
