package services

import (
	"database/sql"
	"strconv"
	"strings"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
)

// ------------------------------------------------------------------
// Customer profiles keyed by WhatsApp number (Phase 3).
// Empty values never overwrite existing profile data.
// ------------------------------------------------------------------

type Customer struct {
	ID             int            `json:"id"`
	WhatsAppNumber string         `json:"whatsapp_number"`
	Name           sql.NullString `json:"-"`
	Email          sql.NullString `json:"-"`
	DefaultAddress sql.NullString `json:"-"`
	Landmark       sql.NullString `json:"-"`
	TotalOrders    int            `json:"total_orders"`
	TotalSpent     float64        `json:"total_spent"`
	FirstName      string         `json:"name,omitempty"`
}

func (c *Customer) displayName() string {
	if c.Name.Valid && strings.TrimSpace(c.Name.String) != "" {
		return c.Name.String
	}
	return ""
}

func canonicalForStorage(phone string) string {
	// Reuse canonicalPhone from auth service if available, else inline
	cleaned := canonicalPhone(phone)
	// canonicalPhone already returns 10-digit; ensure fallback
	if cleaned == "" {
		return phone
	}
	return cleaned
}

// restaurantForPhone resolves the owning restaurant of a customer phone.
// Deprecated for SaaS: phone is not tenant identifier. Strict mode returns 0 for unknown phone.
func restaurantForPhone(phone string) int {
	return RestaurantForPhoneStrict(phone)
}

// RestaurantForPhoneStrict is exported strict version (0 means unknown, no fallback in strict mode).
func RestaurantForPhoneStrict(phone string) int {
	if database.DB == nil {
		return 0
	}
	var rid sql.NullInt64
	_ = database.DB.QueryRow(
		`SELECT restaurant_id FROM customers WHERE whatsapp_number = $1 ORDER BY id LIMIT 1`,
		canonicalForStorage(phone)).Scan(&rid)
	if rid.Valid && rid.Int64 > 0 {
		return int(rid.Int64)
	}
	if IsSingleTenantMode() {
		return ResolveRestaurant(0)
	}
	return 0
}

// GetOrCreateCustomer upserts by whatsapp_number and refreshes last_seen.
// Wrapper for open-source single-tenant (uses default restaurant).
func GetOrCreateCustomer(phone string) (*Customer, error) {
	return GetOrCreateCustomerFor(phone, 0)
}

// GetOrCreateCustomerFor is tenant-aware (composite unique).
func GetOrCreateCustomerFor(phone string, restaurantID int) (*Customer, error) {
	phone = canonicalForStorage(phone)
	if database.DB == nil {
		return &Customer{WhatsAppNumber: phone}, nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return nil, ErrTenantRequired
	}
	_, err := database.DB.Exec(`
		INSERT INTO customers (whatsapp_number, last_seen_at, restaurant_id)
		VALUES ($1, CURRENT_TIMESTAMP, $2)
		ON CONFLICT (whatsapp_number, restaurant_id) DO UPDATE SET
			last_seen_at = CURRENT_TIMESTAMP,
			updated_at = CURRENT_TIMESTAMP
	`, phone, rid)
	if err != nil {
		// fallback for DBs still on old global unique (pre-027) during transition
		_, _ = database.DB.Exec(`
			INSERT INTO customers (whatsapp_number, last_seen_at, restaurant_id)
			VALUES ($1, CURRENT_TIMESTAMP, $2)
			ON CONFLICT (whatsapp_number) DO UPDATE SET
				last_seen_at = CURRENT_TIMESTAMP,
				updated_at = CURRENT_TIMESTAMP
		`, phone, rid)
	}
	return getCustomerFor(phone, rid)
}

func getCustomer(phone string) (*Customer, error) {
	phone = canonicalForStorage(phone)
	if database.DB == nil {
		return &Customer{WhatsAppNumber: phone}, nil
	}
	row := database.DB.QueryRow(`
		SELECT id, whatsapp_number, name, email, default_address, landmark,
		       total_orders, total_spent
		FROM customers WHERE whatsapp_number = $1
	`, phone)

	var c Customer
	err := row.Scan(&c.ID, &c.WhatsAppNumber, &c.Name, &c.Email,
		&c.DefaultAddress, &c.Landmark, &c.TotalOrders, &c.TotalSpent)
	if err != nil {
		return nil, err
	}
	c.FirstName = c.displayName()
	return &c, nil
}

func getCustomerFor(phone string, restaurantID int) (*Customer, error) {
	phone = canonicalForStorage(phone)
	if database.DB == nil {
		return &Customer{WhatsAppNumber: phone}, nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return nil, ErrTenantRequired
	}
	row := database.DB.QueryRow(`
		SELECT id, whatsapp_number, name, email, default_address, landmark,
		       total_orders, total_spent
		FROM customers WHERE whatsapp_number = $1 AND restaurant_id = $2
	`, phone, rid)

	var c Customer
	err := row.Scan(&c.ID, &c.WhatsAppNumber, &c.Name, &c.Email,
		&c.DefaultAddress, &c.Landmark, &c.TotalOrders, &c.TotalSpent)
	if err != nil {
		return nil, err
	}
	c.FirstName = c.displayName()
	return &c, nil
}

// UpdateCustomerProfile applies only the non-empty fields provided.
// Deprecated: use UpdateCustomerProfileFor with explicit restaurantID for tenant isolation.
func UpdateCustomerProfile(phone string, fields map[string]string) error {
	return UpdateCustomerProfileFor(phone, 0, fields)
}

// UpdateCustomerProfileFor is tenant-aware: WHERE whatsapp_number=$1 AND restaurant_id=$2 when restaurantID !=0.
func UpdateCustomerProfileFor(phone string, restaurantID int, fields map[string]string) error {
	phone = canonicalForStorage(phone)
	if database.DB == nil {
		return nil
	}
	if restaurantID == 0 && !IsSingleTenantMode() {
		return ErrTenantRequired
	}
	setClauses := []string{"updated_at = CURRENT_TIMESTAMP"}
	args := []interface{}{}
	n := 1
	for column, value := range fields {
		if strings.TrimSpace(value) == "" {
			continue // never blank out stored data
		}
		switch column {
		case "name", "email", "default_address", "landmark":
			setClauses = append(setClauses, column+" = $"+itoa(n))
			args = append(args, strings.TrimSpace(value))
			n++
		}
	}
	if len(args) == 0 {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid != 0 {
		args = append(args, phone, rid)
		_, err := database.DB.Exec(
			`UPDATE customers SET `+strings.Join(setClauses, ", ")+` WHERE whatsapp_number = $`+itoa(n)+` AND restaurant_id = $`+itoa(n+1),
			args...,
		)
		return err
	}
	args = append(args, phone)
	_, err := database.DB.Exec(
		`UPDATE customers SET `+strings.Join(setClauses, ", ")+` WHERE whatsapp_number = $`+itoa(n),
		args...,
	)
	return err
}

// RecordCustomerOrder bumps lifetime stats (open-source wrapper, single-tenant).
func RecordCustomerOrder(phone string, total float64) error {
	return RecordCustomerOrderFor(phone, 0, total)
}

// RecordCustomerOrderFor is tenant-aware.
func RecordCustomerOrderFor(phone string, restaurantID int, total float64) error {
	phone = canonicalForStorage(phone)
	if database.DB == nil {
		return nil
	}
	if restaurantID == 0 && !IsSingleTenantMode() {
		return ErrTenantRequired
	}
	rid := ResolveRestaurant(restaurantID)
	if rid != 0 {
		_, err := database.DB.Exec(`
			UPDATE customers SET
				total_orders = total_orders + 1,
				total_spent = total_spent + $1,
				first_order_at = COALESCE(first_order_at, CURRENT_TIMESTAMP),
				last_order_at = CURRENT_TIMESTAMP,
				updated_at = CURRENT_TIMESTAMP
			WHERE whatsapp_number = $2 AND restaurant_id = $3
		`, total, phone, rid)
		return err
	}
	_, err := database.DB.Exec(`
		UPDATE customers SET
			total_orders = total_orders + 1,
			total_spent = total_spent + $1,
			first_order_at = COALESCE(first_order_at, CURRENT_TIMESTAMP),
			last_order_at = CURRENT_TIMESTAMP,
			updated_at = CURRENT_TIMESTAMP
		WHERE whatsapp_number = $2
	`, total, phone)
	return err
}

// CustomerOrders returns recent orders (open-source wrapper uses phone→restaurant fallback).
func CustomerOrders(phone string, limit int) ([]models.Order, error) {
	return CustomerOrdersFor(phone, limit, 0)
}

// CustomerOrdersFor is tenant-aware (no phone→tenant inference when rid !=0).
func CustomerOrdersFor(phone string, limit int, restaurantID int) ([]models.Order, error) {
	phone = canonicalForStorage(phone)
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 {
		rid = restaurantForPhone(phone)
		if rid == 0 && !IsSingleTenantMode() {
			return nil, ErrTenantRequired
		}
	}
	rows, err := database.DB.Query(`
		SELECT id, order_number, customer_name, customer_phone, order_type,
		       payment_method, subtotal, delivery_fee, discount, total, status,
		       created_at, updated_at
		FROM orders
		WHERE customer_phone = $1 AND restaurant_id = $2
		ORDER BY id DESC LIMIT $3
	`, phone, rid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orders := []models.Order{}
	for rows.Next() {
		var o models.Order
		if err := rows.Scan(&o.ID, &o.OrderNumber, &o.CustomerName, &o.CustomerPhone,
			&o.OrderType, &o.PaymentMethod, &o.Subtotal, &o.DeliveryFee, &o.Discount,
			&o.Total, &o.Status, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		o.Items = loadOrderLines(o.ID)
		orders = append(orders, o)
	}
	return orders, rows.Err()
}

// loadOrderLines fetches display lines for one order. Never fails the caller.
func loadOrderLines(orderID int) []models.OrderItem {
	itemRows, err := database.DB.Query(`
		SELECT menu_item_id, name, quantity, unit_price, subtotal
		FROM order_items WHERE order_id = $1 ORDER BY id
	`, orderID)
	if err != nil {
		return nil
	}
	defer itemRows.Close()
	var out []models.OrderItem
	for itemRows.Next() {
		var it models.OrderItem
		if err := itemRows.Scan(&it.MenuItemID, &it.Name, &it.Quantity, &it.UnitPrice, &it.Subtotal); err != nil {
			continue
		}
		it.LineTotal = it.Subtotal
		out = append(out, it)
	}
	return out
}

// LatestActiveOrder returns the most recent non-terminal order.
func LatestActiveOrder(phone string) (*models.Order, error) {
	orders, err := CustomerOrders(phone, 10)
	if err != nil {
		return nil, err
	}
	for i := range orders {
		s := orders[i].Status
		if s != "delivered" && s != "completed" && s != "cancelled" {
			return &orders[i], nil
		}
	}
	return nil, nil
}

func itoa(n int) string { return strconv.Itoa(n) }
