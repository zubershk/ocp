package services

import (
	"fmt"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Table service (Phase 5 POS).
//
// Manages physical restaurant tables: CRUD + operational actions
// (occupy / release / reserve / dirty). Table assignment to orders
// is verified against the current restaurant/outlet context.
// ------------------------------------------------------------------

// TableInfo is the data returned for a table in listings.
type TableInfo struct {
	ID           int
	OutletID     int
	RestaurantID int
	Name         string
	Capacity     int
	Status       string // free, occupied, reserved, dirty
	Position     int
	Active       bool
}

// GetTables returns all active tables for the current restaurant/outlet.
func GetTables(restaurantID, outletID int) ([]TableInfo, error) {
	// If outletID == 0, return tables for the restaurant default outlet;
	// otherwise filter by the given outlet.
	query := `SELECT id, outlet_id, restaurant_id, name, capacity, status, position, active
	          FROM tables WHERE active = true AND restaurant_id = $1`
	args := []interface{}{restaurantID}

	if outletID > 0 {
		query += ` AND outlet_id = $2`
		args = append(args, outletID)
	}

	query += ` ORDER BY position, name`

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []TableInfo
	for rows.Next() {
		var t TableInfo
		var status string
		if err := rows.Scan(&t.ID, &t.OutletID, &t.RestaurantID, &t.Name,
			&t.Capacity, &status, &t.Position, &t.Active); err != nil {
			return nil, err
		}
		t.Status = status
		tables = append(tables, t)
	}
	return tables, rows.Err()
}

// GetTable returns a single table by ID, verifying it belongs to the
// current restaurant/outlet context.
func GetTable(tableID, restaurantID, outletID int) (TableInfo, error) {
	var t TableInfo
	var status string
	err := database.DB.QueryRow(`
		SELECT id, outlet_id, restaurant_id, name, capacity, status, position, active
		FROM tables WHERE id = $1 AND restaurant_id = $2 AND outlet_id = $3`,
		tableID, restaurantID, outletID).Scan(&t.ID, &t.OutletID, &t.RestaurantID,
		&t.Name, &t.Capacity, &status, &t.Position, &t.Active)
	if err != nil {
		return TableInfo{}, err
	}
	t.Status = status
	return t, nil
}

// OccupyTable marks a table as occupied (linked to an order).
func OccupyTable(tableID, orderID, restaurantID, outletID int) error {
	// Verify table belongs to the restaurant/outlet.
	var tblRestaurantID, tblOutletID int
	err := database.DB.QueryRow(`
		SELECT restaurant_id, outlet_id FROM tables WHERE id = $1`, tableID).Scan(&tblRestaurantID, &tblOutletID)
	if err != nil {
		return err
	}
	if tblRestaurantID != restaurantID || tblOutletID != outletID {
		return fmt.Errorf("table does not belong to current restaurant/outlet")
	}
	// Set status to occupied; optionally link to order via a separate
	// mechanism (for now we just set status).
	_, err = database.DB.Exec(`
		UPDATE tables SET status = 'occupied', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`, tableID)
	return err
}

// ReleaseTable marks a table as free, clearing any order association.
func ReleaseTable(tableID, restaurantID, outletID int) error {
	var tblRestaurantID, tblOutletID int
	err := database.DB.QueryRow(`
		SELECT restaurant_id, outlet_id FROM tables WHERE id = $1`, tableID).Scan(&tblRestaurantID, &tblOutletID)
	if err != nil {
		return err
	}
	if tblRestaurantID != restaurantID || tblOutletID != outletID {
		return fmt.Errorf("table does not belong to current restaurant/outlet")
	}
	_, err = database.DB.Exec(`
		UPDATE tables SET status = 'free', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`, tableID)
	return err
}

// ReserveTable marks a table as reserved.
func ReserveTable(tableID, restaurantID, outletID int) error {
	var tblRestaurantID, tblOutletID int
	err := database.DB.QueryRow(`
		SELECT restaurant_id, outlet_id FROM tables WHERE id = $1`, tableID).Scan(&tblRestaurantID, &tblOutletID)
	if err != nil {
		return err
	}
	if tblRestaurantID != restaurantID || tblOutletID != outletID {
		return fmt.Errorf("table does not belong to current restaurant/outlet")
	}
	_, err = database.DB.Exec(`
		UPDATE tables SET status = 'reserved', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`, tableID)
	return err
}

// DirtyTable marks a table as dirty (needs cleaning).
func DirtyTable(tableID, restaurantID, outletID int) error {
	var tblRestaurantID, tblOutletID int
	err := database.DB.QueryRow(`
		SELECT restaurant_id, outlet_id FROM tables WHERE id = $1`, tableID).Scan(&tblRestaurantID, &tblOutletID)
	if err != nil {
		return err
	}
	if tblRestaurantID != restaurantID || tblOutletID != outletID {
		return fmt.Errorf("table does not belong to current restaurant/outlet")
	}
	_, err = database.DB.Exec(`
		UPDATE tables SET status = 'dirty', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`, tableID)
	return err
}

// AssignTableToOrder assigns a table to an order, verifying the table
// belongs to the same restaurant/outlet and the order is in a valid
// state (held or confirmed).
func AssignTableToOrder(orderID, tableID, restaurantID, outletID int) error {
	// Verify table ownership.
	var tblRestaurantID, tblOutletID int
	err := database.DB.QueryRow(`
		SELECT restaurant_id, outlet_id FROM tables WHERE id = $1`, tableID).Scan(&tblRestaurantID, &tblOutletID)
	if err != nil {
		return err
	}
	if tblRestaurantID != restaurantID || tblOutletID != outletID {
		return fmt.Errorf("table does not belong to current restaurant/outlet")
	}
	// Verify order is in a valid state.
	var orderStatus string
	err = database.DB.QueryRow(`SELECT status FROM orders WHERE id = $1`, orderID).Scan(&orderStatus)
	if err != nil {
		return err
	}
	if orderStatus != "held" && orderStatus != "confirmed" {
		return fmt.Errorf("order is not in a state eligible for table assignment")
	}
	// Assign table to order.
	_, err = database.DB.Exec(`
		UPDATE orders SET table_id = $2 WHERE id = $1`, orderID, tableID)
	return err
}

// ------------------------------------------------------------------
// Helpers used by admin HTTP handlers.
// ------------------------------------------------------------------

// TableFromRow scans a database row into a TableInfo.
func TableFromRow(r scanner) TableInfo {
	var t TableInfo
	var status string
	r.Scan(&t.ID, &t.OutletID, &t.RestaurantID, &t.Name,
		&t.Capacity, &status, &t.Position, &t.Active)
	t.Status = status
	return t
}

// scanner is a convenient interface for database.Row.Scan.
type scanner interface {
	Scan(dest ...interface{}) error
}