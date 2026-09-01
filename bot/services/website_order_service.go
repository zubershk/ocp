package services

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
)

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
}

type WhatsAppOutcome struct {
	Sent    bool   `json:"sent"`
	Skipped bool   `json:"skipped,omitempty"`
	Reason  string `json:"reason,omitempty"`
}

type WebsiteOrderResult struct {
	ID            int                `json:"id"`
	OrderNumber   string             `json:"order_number"`
	Status        string             `json:"status"`
	CustomerName  string             `json:"customer_name"`
	CustomerPhone string             `json:"customer_phone"`
	Email         string             `json:"email,omitempty"`
	DeliveryType  string             `json:"delivery_type"`
	Address       string             `json:"address,omitempty"`
	Landmark      string             `json:"landmark,omitempty"`
	PaymentMethod string             `json:"payment_method"`
	Items         []WebsiteOrderLine `json:"items"`
	Subtotal      float64            `json:"subtotal"`
	DeliveryFee   float64            `json:"delivery_fee"`
	Discount      float64            `json:"discount"`
	Total         float64            `json:"total"`
	CreatedAt     time.Time          `json:"created_at"`
	Source        string             `json:"source,omitempty"`
	AccessToken   string             `json:"access_token,omitempty"`
	WhatsApp      WhatsAppOutcome    `json:"-"`
	Replayed      bool               `json:"-"`
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
	if idempotencyKey != "" {
		if existing, err := s.getByIdepotencyKey(idempotencyKey); err == nil && existing != nil {
			existing.Replayed = true
			return existing, nil
		}
	}

	// ---- validation ----
	name := strings.TrimSpace(req.Customer.Name)
	if name == "" || len(name) > 200 {
		return nil, badRequest("customer name is required")
	}
	phone, err := normalizePhone(req.Customer.Phone)
	if err != nil {
		return nil, err
	}
	if req.DeliveryType != "delivery" && req.DeliveryType != "pickup" {
		return nil, badRequest("delivery_type must be delivery or pickup")
	}
	address := strings.TrimSpace(req.Address)
	if req.DeliveryType == "delivery" && address == "" {
		return nil, badRequest("address is required for delivery")
	}
	biz := GetBizConfig()
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
		item, err := s.menu.GetItemByIdentifier(requested.ID)
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
				FROM menu_crusts WHERE slug = $1 AND active = true
			`, crustSlug)
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
	if source != "whatsapp" {
		source = "website" // authoritative default; never trust client values blindly
	}

	var (
		orderID     int
		createdAt   time.Time
		accessToken string
	)
	err = tx.QueryRow(`
		INSERT INTO orders
			(order_number, customer_name, customer_phone, email, order_type,
			 address, landmark, payment_method, subtotal, delivery_fee, discount,
			 total, status, idempotency_key, source, access_token)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'placed',$13,$14,$15)
		RETURNING id, created_at, access_token
	`, orderNumber, name, phone, strings.TrimSpace(req.Customer.Email), req.DeliveryType,
		address, strings.TrimSpace(req.Landmark), req.PaymentMethod,
		subtotal, deliveryFee, discount, total, nullIfEmpty(idempotencyKey), source,
		orderAccessToken(),
	).Scan(&orderID, &createdAt, &accessToken)
	if err != nil {
		if strings.Contains(err.Error(), "uq_orders_idempotency_key") && idempotencyKey != "" {
			// Concurrent duplicate: return the winner instead of erroring.
			if existing, getErr := s.getByIdepotencyKey(idempotencyKey); getErr == nil && existing != nil {
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
		if _, err := tx.Exec(`
			INSERT INTO order_items
				(order_id, menu_item_id, name, quantity, unit_price, options, subtotal)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
		`, orderID, line.MenuItemID, line.Name, line.Quantity, line.UnitPrice, string(optionsJSON), line.LineTotal); err != nil {
			return nil, fmt.Errorf("order item insert failed: %w", err)
		}
	}

	if _, err := tx.Exec(`
		INSERT INTO order_events (order_id, event_type, description)
		VALUES ($1, 'placed', 'Website order created')
	`, orderID); err != nil {
		return nil, fmt.Errorf("order event insert failed: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("order commit failed: %w", err)
	}

	result := &WebsiteOrderResult{
		ID: orderID, OrderNumber: orderNumber, Status: "placed",
		CustomerName: name, CustomerPhone: phone,
		Email:        strings.TrimSpace(req.Customer.Email),
		DeliveryType: req.DeliveryType, Address: address,
		Landmark:      strings.TrimSpace(req.Landmark),
		PaymentMethod: req.PaymentMethod,
		Items:         lines, Subtotal: subtotal,
		DeliveryFee: deliveryFee, Discount: discount, Total: total,
		CreatedAt: createdAt, Source: source,
	}

	// ---- notification (post-commit, best effort) ----
	result.AccessToken = accessToken
	result.WhatsApp = s.notifyWhatsApp(result)
	return result, nil
}

// orderAccessToken generates a cryptographically random per-order token.
func orderAccessToken() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand never fails on Linux; fall back to time-based uniqueness
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// Get resolves an order by numeric ID or order number, with items.
// When the order has an access token, token must match (404 otherwise).
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

	itemRows, err := database.DB.Query(`
		SELECT oi.menu_item_id, oi.name, COALESCE(mi.slug, ''), oi.quantity, oi.unit_price, oi.options, oi.subtotal
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
		)
		if err := itemRows.Scan(&line.MenuItemID, &line.Name, &line.Slug, &quantity, &unitPrice, &optionsJSON, &lineTotal); err != nil {
			return nil, err
		}
		var opts map[string]string
		_ = json.Unmarshal(optionsJSON, &opts)
		line.Size = opts["size"]
		line.Crust = opts["crust"]
		line.Quantity = quantity
		line.UnitPrice = unitPrice
		line.LineTotal = lineTotal
		o.Items = append(o.Items, line)
	}
	return &o, itemRows.Err()
}

func (s *WebsiteOrderService) getByIdepotencyKey(key string) (*WebsiteOrderResult, error) {
	var orderID int
	err := database.DB.QueryRow(
		`SELECT id FROM orders WHERE idempotency_key = $1`, key,
	).Scan(&orderID)
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
