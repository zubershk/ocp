package services

import (
	"database/sql"
	"errors"
	"fmt"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Table service (Phase 5 POS) — concurrency-hardened.
//
// Two POS terminals racing for the same table must produce exactly
// one success and one rejection. Every status change is therefore a
// single conditional UPDATE (tenant + expected source status in the
// WHERE clause); the affected-row count is the arbiter, never a
// prior SELECT. AssignTableToOrder additionally holds a row lock in
// a transaction while it links the order, and migration 025 backs it
// with a partial UNIQUE index (one open order per table).
// ------------------------------------------------------------------

// ErrTableNotFound is returned when a table ID is unknown.
var ErrTableNotFound = errors.New("table not found")

// ErrTableNotAvailable is returned when a table exists but is not in
// a status the requested action may leave (e.g. occupying an already
// occupied table, or two cashiers racing for T01).
var ErrTableNotAvailable = errors.New("table is not available for this action")

// ErrTableTenantMismatch is returned when a table belongs to a
// different restaurant/outlet than the caller.
var ErrTableTenantMismatch = errors.New("table does not belong to current restaurant/outlet")

// IsTableConflict reports whether err is a lost race for a table
// (caller should surface HTTP 409).
func IsTableConflict(err error) bool {
	return errors.Is(err, ErrTableNotAvailable)
}

// allowedTableSources lists the statuses each action may leave.
func allowedTableSources(action string) []string {
	switch action {
	case "occupy", "reserve":
		return []string{"free"}
	case "release":
		return []string{"occupied", "reserved", "dirty"}
	case "dirty":
		return []string{"occupied"}
	}
	return nil
}

// transitionTable performs the atomic conditional status change shared
// by occupy/release/reserve/dirty. Zero affected rows means the table
// is missing, foreign, or already moved — disambiguated afterwards.
func transitionTable(tableID, restaurantID, outletID int, action, to string) error {
	from := allowedTableSources(action)
	if len(from) == 0 {
		return fmt.Errorf("unknown table action %q", action)
	}
	placeholders := ""
	args := []interface{}{tableID, restaurantID, outletID, to}
	for i, s := range from {
		if i > 0 {
			placeholders += ", "
		}
		placeholders += fmt.Sprintf("$%d", len(args)+1)
		args = append(args, s)
	}
	res, err := database.DB.Exec(
		`UPDATE tables SET status = $4, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1 AND restaurant_id = $2 AND outlet_id = $3
		   AND status IN (`+placeholders+`)`, args...)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows > 0 {
		return nil
	}
	// Lost race or bad target: tell them apart without trusting a
	// stale read for the decision itself.
	var tr, toID int
	var status string
	err = database.DB.QueryRow(
		`SELECT restaurant_id, outlet_id, status FROM tables WHERE id = $1`, tableID).Scan(&tr, &toID, &status)
	if err == sql.ErrNoRows {
		return ErrTableNotFound
	}
	if err != nil {
		return err
	}
	if tr != restaurantID || toID != outletID {
		return ErrTableTenantMismatch
	}
	return fmt.Errorf("%w: table is %q", ErrTableNotAvailable, status)
}

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

// OccupyTable marks a free table as occupied. Atomic: concurrent
// occupiers produce one success and one ErrTableNotAvailable.
func OccupyTable(tableID, orderID, restaurantID, outletID int) error {
	return transitionTable(tableID, restaurantID, outletID, "occupy", "occupied")
}

// ReleaseTable frees an occupied/reserved/dirty table. Atomic.
func ReleaseTable(tableID, restaurantID, outletID int) error {
	return transitionTable(tableID, restaurantID, outletID, "release", "free")
}

// ReserveTable reserves a free table. Atomic.
func ReserveTable(tableID, restaurantID, outletID int) error {
	return transitionTable(tableID, restaurantID, outletID, "reserve", "reserved")
}

// DirtyTable marks an occupied table dirty (needs cleaning). Atomic.
func DirtyTable(tableID, restaurantID, outletID int) error {
	return transitionTable(tableID, restaurantID, outletID, "dirty", "dirty")
}

// AssignTableToOrder assigns a free table to a mutable order and marks
// it occupied, atomically: the table row is locked (SELECT ... FOR
// UPDATE), verified free, flipped, and linked inside one transaction.
// Two cashiers racing for T01 get one success and one conflict.
func AssignTableToOrder(orderID, tableID, restaurantID, outletID int) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("tx begin failed: %w", err)
	}
	defer tx.Rollback()

	var status string
	err = tx.QueryRow(
		`SELECT status FROM tables WHERE id = $1 AND restaurant_id = $2 AND outlet_id = $3 FOR UPDATE`,
		tableID, restaurantID, outletID).Scan(&status)
	if err == sql.ErrNoRows {
		// Missing or foreign table: disambiguate for a useful error.
		var tr, toID int
		if lerr := database.DB.QueryRow(
			`SELECT restaurant_id, outlet_id FROM tables WHERE id = $1`, tableID).Scan(&tr, &toID); lerr == sql.ErrNoRows {
			return ErrTableNotFound
		} else if lerr != nil {
			return lerr
		} else if tr != restaurantID || toID != outletID {
			return ErrTableTenantMismatch
		}
		return ErrTableNotAvailable
	}
	if err != nil {
		return err
	}
	if status != "free" {
		return fmt.Errorf("%w: table is %q", ErrTableNotAvailable, status)
	}

	// Verify order is tenant-local, mutable, and eligible.
	var orderStatus string
	var orderRestaurantID, orderOutletID int
	err = tx.QueryRow(
		`SELECT status, restaurant_id, outlet_id FROM orders WHERE id = $1 FOR UPDATE`,
		orderID).Scan(&orderStatus, &orderRestaurantID, &orderOutletID)
	if err == sql.ErrNoRows {
		return ErrOrderNotFound
	}
	if err != nil {
		return err
	}
	if orderRestaurantID != restaurantID || orderOutletID != outletID {
		return fmt.Errorf("order does not belong to current restaurant/outlet")
	}
	if !CanMutateOrder(orderStatus) {
		return fmt.Errorf("%w: cannot assign table to %q order", ErrInvalidOrderTransition, orderStatus)
	}
	if orderStatus != OrderStatusHeld && orderStatus != OrderStatusConfirmed && orderStatus != OrderStatusDraft {
		return fmt.Errorf("order is not in a state eligible for table assignment")
	}

	if _, err := tx.Exec(
		`UPDATE tables SET status = 'occupied', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		tableID); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`UPDATE orders SET table_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		orderID, tableID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		// A violated uq_open_order_per_table means another order won
		// the table between our checks: report conflict, not 500.
		if IsUniqueViolation(err, "uq_open_order_per_table") {
			return fmt.Errorf("%w: table already has an open order", ErrTableNotAvailable)
		}
		return fmt.Errorf("order commit failed: %w", err)
	}
	return nil
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