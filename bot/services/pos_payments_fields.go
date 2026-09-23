package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Payment methods + customer fields (PR #2 foundation)
// ------------------------------------------------------------------

var paymentKeyRe = regexp.MustCompile(`^[a-z0-9_]{2,30}$`)

type RestaurantPaymentMethod struct {
	ID           int    `json:"id"`
	RestaurantID int    `json:"restaurant_id"`
	Key          string `json:"key"`
	Label        string `json:"label"`
	Icon         string `json:"icon"`
	Active       bool   `json:"active"`
	SortOrder    int    `json:"sort_order"`
	IsSystem     bool   `json:"is_system"`
}

func validatePaymentMethod(m *RestaurantPaymentMethod, isCreate bool) error {
	if !paymentKeyRe.MatchString(m.Key) {
		return fmt.Errorf("key must be 2..30 lowercase alphanumeric + underscore")
	}
	if len(strings.TrimSpace(m.Label)) == 0 || len(m.Label) > 40 {
		return fmt.Errorf("label must be 1..40")
	}
	if len(m.Icon) == 0 || len(m.Icon) > 40 {
		return fmt.Errorf("icon must be 1..40")
	}
	if m.SortOrder < 0 || m.SortOrder > 999 {
		return fmt.Errorf("sort_order must be 0..999")
	}
	return nil
}

func ListPaymentMethods(restaurantID int) ([]RestaurantPaymentMethod, error) {
	rid := ResolveRestaurant(restaurantID)
	rows, err := database.DB.Query(
		`SELECT id, restaurant_id, key, label, icon, active, sort_order, is_system FROM restaurant_payment_methods WHERE restaurant_id=$1 ORDER BY sort_order, label`, rid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RestaurantPaymentMethod
	for rows.Next() {
		var m RestaurantPaymentMethod
		if err := rows.Scan(&m.ID, &m.RestaurantID, &m.Key, &m.Label, &m.Icon, &m.Active, &m.SortOrder, &m.IsSystem); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func GetPaymentMethod(id, restaurantID int) (*RestaurantPaymentMethod, error) {
	rid := ResolveRestaurant(restaurantID)
	var m RestaurantPaymentMethod
	err := database.DB.QueryRow(
		`SELECT id, restaurant_id, key, label, icon, active, sort_order, is_system FROM restaurant_payment_methods WHERE id=$1 AND restaurant_id=$2`, id, rid).Scan(
		&m.ID, &m.RestaurantID, &m.Key, &m.Label, &m.Icon, &m.Active, &m.SortOrder, &m.IsSystem)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func CreatePaymentMethod(restaurantID int, m RestaurantPaymentMethod) (*RestaurantPaymentMethod, error) {
	rid := ResolveRestaurant(restaurantID)
	m.Key = strings.ToLower(strings.TrimSpace(m.Key))
	m.Label = strings.TrimSpace(m.Label)
	m.Icon = strings.TrimSpace(m.Icon)
	if m.Icon == "" {
		m.Icon = "cash"
	}
	if err := validatePaymentMethod(&m, true); err != nil {
		return nil, err
	}
	m.RestaurantID = rid
	// Count check: max 20
	var cnt int
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM restaurant_payment_methods WHERE restaurant_id=$1`, rid).Scan(&cnt)
	if cnt >= 20 {
		return nil, fmt.Errorf("too many payment methods (max 20)")
	}
	var id int
	err := database.DB.QueryRow(
		`INSERT INTO restaurant_payment_methods (restaurant_id, key, label, icon, active, sort_order, is_system) VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING id`,
		rid, m.Key, m.Label, m.Icon, m.Active, m.SortOrder).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			return nil, fmt.Errorf("duplicate payment key in this restaurant")
		}
		return nil, err
	}
	m.ID = id
	m.IsSystem = false
	return &m, nil
}

func UpdatePaymentMethod(id, restaurantID int, patch map[string]interface{}) (*RestaurantPaymentMethod, error) {
	rid := ResolveRestaurant(restaurantID)
	existing, err := GetPaymentMethod(id, rid)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, sql.ErrNoRows
	}
	if v, ok := patch["label"]; ok {
		if s, ok2 := v.(string); ok2 {
			existing.Label = strings.TrimSpace(s)
		}
	}
	if v, ok := patch["icon"]; ok {
		if s, ok2 := v.(string); ok2 {
			existing.Icon = strings.TrimSpace(s)
		}
	}
	if v, ok := patch["active"]; ok {
		if b, ok2 := v.(bool); ok2 {
			existing.Active = b
		}
	}
	if v, ok := patch["sort_order"]; ok {
		switch n := v.(type) {
		case float64:
			existing.SortOrder = int(n)
		case int:
			existing.SortOrder = n
		}
	}
	// key is immutable for system rows; for non-system, allow label/icon/sort/active only — not key change via patch
	// To keep PR #2 simple, key is never updated via this path. If needed, delete+create.
	if err := validatePaymentMethod(existing, false); err != nil {
		return nil, err
	}
	_, err = database.DB.Exec(
		`UPDATE restaurant_payment_methods SET label=$2, icon=$3, active=$4, sort_order=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND restaurant_id=$6`,
		id, existing.Label, existing.Icon, existing.Active, existing.SortOrder, rid)
	if err != nil {
		return nil, err
	}
	return existing, nil
}

func DeletePaymentMethod(id, restaurantID int) error {
	rid := ResolveRestaurant(restaurantID)
	existing, err := GetPaymentMethod(id, rid)
	if err != nil {
		return err
	}
	if existing == nil {
		return sql.ErrNoRows
	}
	if existing.IsSystem {
		return fmt.Errorf("cannot delete system payment method %q (toggle active instead)", existing.Key)
	}
	res, err := database.DB.Exec(`DELETE FROM restaurant_payment_methods WHERE id=$1 AND restaurant_id=$2`, id, rid)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ReorderPaymentMethods bulk sort_order
func ReorderPaymentMethods(restaurantID int, orderedIDs []int) error {
	rid := ResolveRestaurant(restaurantID)
	if len(orderedIDs) > 20 {
		return fmt.Errorf("too many payment methods")
	}
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for idx, id := range orderedIDs {
		var tr int
		if err := tx.QueryRow(`SELECT restaurant_id FROM restaurant_payment_methods WHERE id=$1 FOR UPDATE`, id).Scan(&tr); err != nil {
			return err
		}
		if tr != rid {
			return fmt.Errorf("payment method %d does not belong to current restaurant", id)
		}
		if _, err := tx.Exec(`UPDATE restaurant_payment_methods SET sort_order=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id, idx); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// --- Customer fields ---

type POSCustomerFieldRow struct {
	ID            int      `json:"id"`
	RestaurantID  int      `json:"restaurant_id"`
	FieldKey      string   `json:"field_key"`
	Label         string   `json:"label"`
	Visible       bool     `json:"visible"`
	Required      bool     `json:"required"`
	ForOrderTypes []string `json:"for_order_types"`
	SortOrder     int      `json:"sort_order"`
}

var validFieldKeys = map[string]bool{"phone": true, "name": true, "address": true, "locality": true}

func validateCustomerField(f *POSCustomerFieldRow) error {
	if !validFieldKeys[f.FieldKey] {
		return fmt.Errorf("field_key must be phone/name/address/locality")
	}
	if len(strings.TrimSpace(f.Label)) == 0 || len(f.Label) > 40 {
		return fmt.Errorf("label must be 1..40")
	}
	if f.Required && !f.Visible {
		return fmt.Errorf("required field must be visible")
	}
	if f.SortOrder < 0 || f.SortOrder > 999 {
		return fmt.Errorf("sort_order must be 0..999")
	}
	if len(f.ForOrderTypes) > 5 {
		return fmt.Errorf("too many order types (max 5)")
	}
	for _, k := range f.ForOrderTypes {
		if len(k) == 0 || len(k) > 30 {
			return fmt.Errorf("order type key 1..30")
		}
	}
	return nil
}

func ListCustomerFields(restaurantID int) ([]POSCustomerFieldRow, error) {
	rid := ResolveRestaurant(restaurantID)
	rows, err := database.DB.Query(
		`SELECT id, restaurant_id, field_key, label, visible, required, for_order_types, sort_order FROM pos_customer_fields WHERE restaurant_id=$1 ORDER BY sort_order, field_key`, rid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []POSCustomerFieldRow
	for rows.Next() {
		var f POSCustomerFieldRow
		var raw []byte
		if err := rows.Scan(&f.ID, &f.RestaurantID, &f.FieldKey, &f.Label, &f.Visible, &f.Required, &raw, &f.SortOrder); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(raw, &f.ForOrderTypes)
		out = append(out, f)
	}
	return out, rows.Err()
}

func GetCustomerField(id, restaurantID int) (*POSCustomerFieldRow, error) {
	rid := ResolveRestaurant(restaurantID)
	var f POSCustomerFieldRow
	var raw []byte
	err := database.DB.QueryRow(
		`SELECT id, restaurant_id, field_key, label, visible, required, for_order_types, sort_order FROM pos_customer_fields WHERE id=$1 AND restaurant_id=$2`, id, rid).Scan(
		&f.ID, &f.RestaurantID, &f.FieldKey, &f.Label, &f.Visible, &f.Required, &raw, &f.SortOrder)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(raw, &f.ForOrderTypes)
	return &f, nil
}

// UpsertCustomerField creates or updates by (restaurant_id, field_key) — admin config, max 10.
func UpsertCustomerField(restaurantID int, f POSCustomerFieldRow) (*POSCustomerFieldRow, error) {
	rid := ResolveRestaurant(restaurantID)
	f.FieldKey = strings.ToLower(strings.TrimSpace(f.FieldKey))
	f.Label = strings.TrimSpace(f.Label)
	if err := validateCustomerField(&f); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(f.ForOrderTypes)
	if len(f.ForOrderTypes) == 0 {
		raw = []byte("[]")
	}
	// Max 10 fields already enforced by seed + constraint but check here
	var cnt int
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM pos_customer_fields WHERE restaurant_id=$1`, rid).Scan(&cnt)
	// Allow upsert if exists, else check limit
	var existsID int
	err := database.DB.QueryRow(`SELECT id FROM pos_customer_fields WHERE restaurant_id=$1 AND field_key=$2`, rid, f.FieldKey).Scan(&existsID)
	if err == sql.ErrNoRows && cnt >= 10 {
		return nil, fmt.Errorf("too many customer fields (max 10)")
	}
	if err != sql.ErrNoRows && err != nil {
		return nil, err
	}
	if existsID != 0 {
		_, err = database.DB.Exec(
			`UPDATE pos_customer_fields SET label=$3, visible=$4, required=$5, for_order_types=$6::jsonb, sort_order=$7, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND restaurant_id=$2`,
			existsID, rid, f.Label, f.Visible, f.Required, string(raw), f.SortOrder)
		if err != nil {
			return nil, err
		}
		f.ID = existsID
		f.RestaurantID = rid
		return &f, nil
	}
	var id int
	err = database.DB.QueryRow(
		`INSERT INTO pos_customer_fields (restaurant_id, field_key, label, visible, required, for_order_types, sort_order) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id`,
		rid, f.FieldKey, f.Label, f.Visible, f.Required, string(raw), f.SortOrder).Scan(&id)
	if err != nil {
		return nil, err
	}
	f.ID = id
	f.RestaurantID = rid
	return &f, nil
}

func UpdateCustomerField(id, restaurantID int, patch map[string]interface{}) (*POSCustomerFieldRow, error) {
	rid := ResolveRestaurant(restaurantID)
	existing, err := GetCustomerField(id, rid)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, sql.ErrNoRows
	}
	if v, ok := patch["label"]; ok {
		if s, ok2 := v.(string); ok2 {
			existing.Label = strings.TrimSpace(s)
		}
	}
	if v, ok := patch["visible"]; ok {
		if b, ok2 := v.(bool); ok2 {
			existing.Visible = b
		}
	}
	if v, ok := patch["required"]; ok {
		if b, ok2 := v.(bool); ok2 {
			existing.Required = b
		}
	}
	if v, ok := patch["for_order_types"]; ok {
		switch arr := v.(type) {
		case []interface{}:
			var out []string
			for _, x := range arr {
				if s, ok := x.(string); ok {
					out = append(out, s)
				}
			}
			existing.ForOrderTypes = out
		case []string:
			existing.ForOrderTypes = arr
		}
	}
	if v, ok := patch["sort_order"]; ok {
		switch n := v.(type) {
		case float64:
			existing.SortOrder = int(n)
		case int:
			existing.SortOrder = n
		}
	}
	if err := validateCustomerField(existing); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(existing.ForOrderTypes)
	_, err = database.DB.Exec(
		`UPDATE pos_customer_fields SET label=$2, visible=$3, required=$4, for_order_types=$5::jsonb, sort_order=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND restaurant_id=$7`,
		id, existing.Label, existing.Visible, existing.Required, string(raw), existing.SortOrder, rid)
	if err != nil {
		return nil, err
	}
	return existing, nil
}

func ReorderCustomerFields(restaurantID int, orderedIDs []int) error {
	rid := ResolveRestaurant(restaurantID)
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for idx, id := range orderedIDs {
		var tr int
		if err := tx.QueryRow(`SELECT restaurant_id FROM pos_customer_fields WHERE id=$1 FOR UPDATE`, id).Scan(&tr); err != nil {
			return err
		}
		if tr != rid {
			return fmt.Errorf("customer field %d does not belong to current restaurant", id)
		}
		if _, err := tx.Exec(`UPDATE pos_customer_fields SET sort_order=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id, idx); err != nil {
			return err
		}
	}
	return tx.Commit()
}
