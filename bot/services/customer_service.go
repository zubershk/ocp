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

// GetOrCreateCustomer upserts by whatsapp_number and refreshes last_seen.
func GetOrCreateCustomer(phone string) (*Customer, error) {
	phone = canonicalForStorage(phone)
	_, err := database.DB.Exec(`
		INSERT INTO customers (whatsapp_number, last_seen_at)
		VALUES ($1, CURRENT_TIMESTAMP)
		ON CONFLICT (whatsapp_number) DO UPDATE SET
			last_seen_at = CURRENT_TIMESTAMP,
			updated_at = CURRENT_TIMESTAMP
	`, phone)
	if err != nil {
		return nil, err
	}
	return getCustomer(phone)
}

func getCustomer(phone string) (*Customer, error) {
	phone = canonicalForStorage(phone)
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

// UpdateCustomerProfile applies only the non-empty fields provided.
func UpdateCustomerProfile(phone string, fields map[string]string) error {
	phone = canonicalForStorage(phone)
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
	args = append(args, phone)
	_, err := database.DB.Exec(
		`UPDATE customers SET `+strings.Join(setClauses, ", ")+` WHERE whatsapp_number = $`+itoa(n),
		args...,
	)
	return err
}

// RecordCustomerOrder bumps lifetime stats after a successful order.
func RecordCustomerOrder(phone string, total float64) error {
	phone = canonicalForStorage(phone)
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

// CustomerOrders returns recent orders belonging strictly to this number.
func CustomerOrders(phone string, limit int) ([]models.Order, error) {
	phone = canonicalForStorage(phone)
	rows, err := database.DB.Query(`
		SELECT id, order_number, customer_name, customer_phone, order_type,
		       payment_method, subtotal, delivery_fee, discount, total, status,
		       created_at, updated_at
		FROM orders
		WHERE customer_phone = $1
		ORDER BY id DESC LIMIT $2
	`, phone, limit)
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
		orders = append(orders, o)
	}
	return orders, rows.Err()
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
