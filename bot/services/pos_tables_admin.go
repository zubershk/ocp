package services

import (
	"database/sql"
	"fmt"
	"strings"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Tables admin CRUD (PR #2 foundation, operational data)
// Separated from POS occupancy flow (table_service.go). Handles
// create/update/delete/reorder for admin UI, with tenant isolation.
// ------------------------------------------------------------------

func validateTableName(name string) error {
	n := strings.TrimSpace(name)
	if len(n) == 0 || len(n) > 40 {
		return fmt.Errorf("name must be 1..40 characters")
	}
	return nil
}

func validateTableCapacity(cap int) error {
	if cap < 1 || cap > 50 {
		return fmt.Errorf("capacity must be 1..50")
	}
	return nil
}

func validateTablePosition(pos int) error {
	if pos < 0 || pos > 999 {
		return fmt.Errorf("position must be 0..999")
	}
	return nil
}

// ListTablesAdmin returns tables for outlet (0 = all outlets of restaurant).
func ListTablesAdmin(restaurantID, outletID int) ([]TableInfo, error) {
	rid := ResolveRestaurant(restaurantID)
	query := `SELECT id, outlet_id, restaurant_id, name, capacity, status, position, active, COALESCE(description,'') FROM tables WHERE restaurant_id=$1`
	args := []interface{}{rid}
	if outletID > 0 {
		query += ` AND outlet_id=$2`
		args = append(args, outletID)
	}
	query += ` ORDER BY position, name`
	rows, err := database.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TableInfo
	for rows.Next() {
		var t TableInfo
		var status, desc string
		if err := rows.Scan(&t.ID, &t.OutletID, &t.RestaurantID, &t.Name, &t.Capacity, &status, &t.Position, &t.Active, &desc); err != nil {
			return nil, err
		}
		t.Status = status
		out = append(out, t)
	}
	return out, rows.Err()
}

// CreateTableAdmin inserts a table after verifying outlet belongs to restaurant.
func CreateTableAdmin(restaurantID, outletID int, name string, capacity, position int, description string) (*TableInfo, error) {
	rid := ResolveRestaurant(restaurantID)
	if outletID <= 0 {
		outletID = DefaultOutletID(rid)
		if outletID == 0 {
			return nil, fmt.Errorf("outlet is required")
		}
	}
	var outletRest int
	if err := database.DB.QueryRow(`SELECT restaurant_id FROM outlets WHERE id=$1`, outletID).Scan(&outletRest); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("outlet not found")
		}
		return nil, err
	}
	if outletRest != rid {
		return nil, ErrTableTenantMismatch
	}
	if err := validateTableName(name); err != nil {
		return nil, err
	}
	if err := validateTableCapacity(capacity); err != nil {
		return nil, err
	}
	if err := validateTablePosition(position); err != nil {
		return nil, err
	}
	if len(description) > 500 {
		return nil, fmt.Errorf("description max 500")
	}
	var id int
	err := database.DB.QueryRow(
		`INSERT INTO tables (outlet_id, restaurant_id, name, capacity, position, description, active, status)
		 VALUES ($1,$2,$3,$4,$5,$6,true,'free') RETURNING id`,
		outletID, rid, strings.TrimSpace(name), capacity, position, description).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			return nil, fmt.Errorf("duplicate table name in this outlet")
		}
		if strings.Contains(err.Error(), "tables_capacity_range") || strings.Contains(err.Error(), "capacity") {
			return nil, fmt.Errorf("capacity must be 1..50")
		}
		return nil, err
	}
	return &TableInfo{ID: id, OutletID: outletID, RestaurantID: rid, Name: strings.TrimSpace(name), Capacity: capacity, Position: position, Active: true, Status: "free"}, nil
}

// UpdateTableAdmin updates mutable fields (name, capacity, position, description, active, status) for one table.
func UpdateTableAdmin(id, restaurantID int, patch map[string]interface{}) (*TableInfo, error) {
	rid := ResolveRestaurant(restaurantID)
	var t TableInfo
	var status, desc sql.NullString
	err := database.DB.QueryRow(
		`SELECT id, outlet_id, restaurant_id, name, capacity, status, position, active, description FROM tables WHERE id=$1 AND restaurant_id=$2`,
		id, rid).Scan(&t.ID, &t.OutletID, &t.RestaurantID, &t.Name, &t.Capacity, &status, &t.Position, &t.Active, &desc)
	if err != nil {
		return nil, err
	}
	if status.Valid {
		t.Status = status.String
	}
	if v, ok := patch["name"]; ok {
		if s, ok2 := v.(string); ok2 {
			if err := validateTableName(s); err != nil {
				return nil, err
			}
			t.Name = strings.TrimSpace(s)
		}
	}
	if v, ok := patch["capacity"]; ok {
		switch n := v.(type) {
		case float64:
			if err := validateTableCapacity(int(n)); err != nil {
				return nil, err
			}
			t.Capacity = int(n)
		case int:
			if err := validateTableCapacity(n); err != nil {
				return nil, err
			}
			t.Capacity = n
		}
	}
	if v, ok := patch["position"]; ok {
		switch n := v.(type) {
		case float64:
			if err := validateTablePosition(int(n)); err != nil {
				return nil, err
			}
			t.Position = int(n)
		case int:
			if err := validateTablePosition(n); err != nil {
				return nil, err
			}
			t.Position = n
		}
	}
	if v, ok := patch["description"]; ok {
		if s, ok2 := v.(string); ok2 {
			if len(s) > 500 {
				return nil, fmt.Errorf("description max 500")
			}
			desc = sql.NullString{String: s, Valid: true}
		}
	}
	if v, ok := patch["active"]; ok {
		if b, ok2 := v.(bool); ok2 {
			t.Active = b
		}
	}
	if v, ok := patch["status"]; ok {
		if s, ok2 := v.(string); ok2 {
			s = strings.ToLower(strings.TrimSpace(s))
			if s != "free" && s != "occupied" && s != "reserved" && s != "dirty" {
				return nil, fmt.Errorf("invalid status")
			}
			t.Status = s
		}
	}
	// outlet change not allowed via this path; outlet is immutable after creation (use delete+create)
	_, err = database.DB.Exec(
		`UPDATE tables SET name=$2, capacity=$3, position=$4, description=$5, active=$6, status=$7, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND restaurant_id=$8`,
		id, t.Name, t.Capacity, t.Position, desc.String, t.Active, t.Status, rid)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			return nil, fmt.Errorf("duplicate table name in this outlet")
		}
		return nil, err
	}
	return &t, nil
}

// DeleteTableAdmin soft-deletes (active=false) if the table has any open order, else hard deletes.
// For PR #2 we do hard delete if free and no open order, otherwise set active=false to preserve history.
func DeleteTableAdmin(id, restaurantID int) error {
	rid := ResolveRestaurant(restaurantID)
	var status string
	var outletID int
	if err := database.DB.QueryRow(`SELECT status, outlet_id FROM tables WHERE id=$1 AND restaurant_id=$2`, id, rid).Scan(&status, &outletID); err != nil {
		return err
	}
	// Check for open order on this table
	var openCount int
	_ = database.DB.QueryRow(
		`SELECT COUNT(*) FROM orders WHERE table_id=$1 AND status NOT IN ('completed','cancelled')`, id).Scan(&openCount)
	if openCount > 0 || status == "occupied" || status == "reserved" {
		_, err := database.DB.Exec(`UPDATE tables SET active=false, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND restaurant_id=$2`, id, rid)
		return err
	}
	res, err := database.DB.Exec(`DELETE FROM tables WHERE id=$1 AND restaurant_id=$2`, id, rid)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ReorderTables sets position for a batch of table IDs in one transaction.
// ids order is the desired position order (0..n).
func ReorderTables(restaurantID, outletID int, orderedIDs []int) error {
	rid := ResolveRestaurant(restaurantID)
	if len(orderedIDs) == 0 {
		return fmt.Errorf("no tables provided")
	}
	if len(orderedIDs) > 100 {
		return fmt.Errorf("too many tables (max 100)")
	}
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for idx, id := range orderedIDs {
		var tr, toID int
		if err := tx.QueryRow(`SELECT restaurant_id, outlet_id FROM tables WHERE id=$1 FOR UPDATE`, id).Scan(&tr, &toID); err != nil {
			return err
		}
		if tr != rid {
			return ErrTableTenantMismatch
		}
		if outletID > 0 && toID != outletID {
			return fmt.Errorf("table %d does not belong to requested outlet", id)
		}
		if _, err := tx.Exec(`UPDATE tables SET position=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, id, idx); err != nil {
			return err
		}
	}
	return tx.Commit()
}
