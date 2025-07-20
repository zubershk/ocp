package services

import (
	"database/sql"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Persistent WhatsApp cart, variant-aware (size + crust = line key).
// unit_price is captured at add-time for display; the authoritative
// re-pricing always happens in WebsiteOrderService.Create.
// ------------------------------------------------------------------

type WACartLine struct {
	ID        int     `json:"id"`
	Phone     string  `json:"-"`
	Slug      string  `json:"slug"`
	ItemName  string  `json:"name"`
	Size      string  `json:"size,omitempty"`
	Crust     string  `json:"crust,omitempty"`
	CrustName string  `json:"crust_name,omitempty"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
	LineTotal float64 `json:"line_total"`
}

const waCartColumns = `
	wc.id, wc.customer_phone, COALESCE(mi.slug,''), wc.menu_item_id, mi.name,
	wc.size, wc.crust, COALESCE(mc.name,''), wc.quantity,
	wc.unit_price, wc.quantity * wc.unit_price
`

func scanWALine(scanner interface{ Scan(...interface{}) error }) (WACartLine, int, error) {
	var l WACartLine
	var itemID int
	err := scanner.Scan(&l.ID, &l.Phone, &l.Slug, &itemID, &l.ItemName,
		&l.Size, &l.Crust, &l.CrustName, &l.Quantity, &l.UnitPrice, &l.LineTotal)
	return l, itemID, err
}

// AddToWACart inserts or merges a variant line.
func AddToWACart(phone string, itemID int, size, crust string, qty int, unitPrice float64) error {
	_, err := database.DB.Exec(`
		INSERT INTO whatsapp_cart_items
			(customer_phone, menu_item_id, size, crust, quantity, unit_price)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (customer_phone, menu_item_id, size, crust) DO UPDATE SET
			quantity = LEAST(whatsapp_cart_items.quantity + $5, 20),
			unit_price = EXCLUDED.unit_price,
			updated_at = CURRENT_TIMESTAMP
	`, phone, itemID, size, crust, qty, unitPrice)
	return err
}

// GetWACart returns all lines for a customer.
func GetWACart(phone string) ([]WACartLine, error) {
	rows, err := database.DB.Query(`
		SELECT `+waCartColumns+`
		FROM whatsapp_cart_items wc
		JOIN menu_items mi ON mi.id = wc.menu_item_id
		LEFT JOIN menu_crusts mc ON mc.slug = wc.crust
		WHERE wc.customer_phone = $1
		ORDER BY wc.id
	`, phone)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	lines := []WACartLine{}
	for rows.Next() {
		l, _, err := scanWALine(rows)
		if err != nil {
			return nil, err
		}
		lines = append(lines, l)
	}
	return lines, rows.Err()
}

// RemoveFromWACart deletes one line by id, scoped to the owner.
func RemoveFromWACart(phone string, lineID int) error {
	_, err := database.DB.Exec(
		`DELETE FROM whatsapp_cart_items WHERE id = $1 AND customer_phone = $2`,
		lineID, phone)
	return err
}

// ClearWACart empties the customer's cart.
func ClearWACart(phone string) error {
	_, err := database.DB.Exec(`DELETE FROM whatsapp_cart_items WHERE customer_phone = $1`, phone)
	return err
}

// WACartCount returns total quantity across lines.
func WACartCount(phone string) (int, error) {
	var n int
	err := database.DB.QueryRow(
		`SELECT COALESCE(SUM(quantity),0) FROM whatsapp_cart_items WHERE customer_phone = $1`,
		phone).Scan(&n)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return n, err
}

// UpdateWACartLine sets an absolute quantity for one line; 0 removes it.
func UpdateWACartLine(phone string, lineID, qty int) error {
	if qty <= 0 {
		return RemoveFromWACart(phone, lineID)
	}
	_, err := database.DB.Exec(`
		UPDATE whatsapp_cart_items
		SET quantity = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND customer_phone = $3
	`, qty, lineID, phone)
	return err
}

// GetWACartLineByID fetches one line scoped to its owner.
func GetWACartLineByID(phone string, lineID int) (*WACartLine, error) {
	row := database.DB.QueryRow(`
		SELECT `+waCartColumns+`
		FROM whatsapp_cart_items wc
		JOIN menu_items mi ON mi.id = wc.menu_item_id
		LEFT JOIN menu_crusts mc ON mc.slug = wc.crust
		WHERE wc.id = $1 AND wc.customer_phone = $2
	`, lineID, phone)
	l, _, err := scanWALine(row)
	if err != nil {
		return nil, err
	}
	return &l, nil
}
