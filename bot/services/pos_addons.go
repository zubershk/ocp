package services

import (
	"database/sql"
	"fmt"
	"strings"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Addon groups/items CRUD (PR #2 foundation, no behavior yet)
// Tenant isolation via restaurant_id, validation strict, audit via
// admin_handler. Reuses addon_groups/menu_item_id NOT NULL + junction.
// ------------------------------------------------------------------

type AddonGroup struct {
	ID            int    `json:"id"`
	MenuItemID    int    `json:"menu_item_id"`
	Name          string `json:"name"`
	SizeScope     string `json:"size_scope"`
	SelectionType string `json:"selection_type"`
	MinSelect     int    `json:"min_select"`
	MaxSelect     int    `json:"max_select"`
	SortOrder     int    `json:"sort_order"`
	Active        bool   `json:"active"`
	RestaurantID  int    `json:"restaurant_id"`
	Description   string `json:"description,omitempty"`
}

type AddonItem struct {
	ID            int      `json:"id"`
	GroupID       int      `json:"group_id"`
	MenuItemID    int      `json:"menu_item_id"`
	MenuItemName  string   `json:"menu_item_name,omitempty"`
	PriceOverride *float64 `json:"price_override"`
	SortOrder     int      `json:"sort_order"`
	Active        bool     `json:"active"`
	RestaurantID  int      `json:"restaurant_id"`
}

func validateAddonGroup(g *AddonGroup) error {
	if len(strings.TrimSpace(g.Name)) == 0 || len(g.Name) > 200 {
		return fmt.Errorf("name must be 1..200 characters")
	}
	if g.SizeScope != "regular" && g.SizeScope != "medium" && g.SizeScope != "large" && g.SizeScope != "all" {
		return fmt.Errorf("size_scope must be regular/medium/large/all")
	}
	if g.SelectionType != "single" && g.SelectionType != "multiple" {
		return fmt.Errorf("selection_type must be single/multiple")
	}
	if g.MinSelect < 0 || g.MinSelect > 10 {
		return fmt.Errorf("min_select must be 0..10")
	}
	if g.MaxSelect < 1 || g.MaxSelect > 20 {
		return fmt.Errorf("max_select must be 1..20")
	}
	if g.MinSelect > g.MaxSelect {
		return fmt.Errorf("min_select cannot exceed max_select")
	}
	if g.SelectionType == "single" && g.MaxSelect != 1 {
		return fmt.Errorf("single selection requires max_select=1")
	}
	if g.SortOrder < 0 || g.SortOrder > 999 {
		return fmt.Errorf("sort_order must be 0..999")
	}
	if g.Description != "" && len(g.Description) > 500 {
		return fmt.Errorf("description max 500")
	}
	return nil
}

func validateAddonItem(priceOverride *float64) error {
	if priceOverride != nil {
		if *priceOverride < 0 || *priceOverride > 10000 {
			return fmt.Errorf("price_override must be 0..10000 or null (inherit)")
		}
	}
	return nil
}

// ListAddonGroups returns groups for a restaurant, optionally filtered by menu_item_id.
func ListAddonGroups(restaurantID, menuItemID int) ([]AddonGroup, error) {
	rid := ResolveRestaurant(restaurantID)
	query := `SELECT id, menu_item_id, name, size_scope, selection_type, min_select, max_select, sort_order, active, restaurant_id, COALESCE(description,'') FROM addon_groups WHERE restaurant_id=$1`
	args := []interface{}{rid}
	if menuItemID > 0 {
		query += ` AND menu_item_id=$2`
		args = append(args, menuItemID)
	}
	query += ` ORDER BY sort_order, name`
	rows, err := database.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AddonGroup
	for rows.Next() {
		var g AddonGroup
		if err := rows.Scan(&g.ID, &g.MenuItemID, &g.Name, &g.SizeScope, &g.SelectionType, &g.MinSelect, &g.MaxSelect, &g.SortOrder, &g.Active, &g.RestaurantID, &g.Description); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// GetAddonGroup returns one group if it belongs to the restaurant.
func GetAddonGroup(id, restaurantID int) (*AddonGroup, error) {
	rid := ResolveRestaurant(restaurantID)
	var g AddonGroup
	err := database.DB.QueryRow(
		`SELECT id, menu_item_id, name, size_scope, selection_type, min_select, max_select, sort_order, active, restaurant_id, COALESCE(description,'') FROM addon_groups WHERE id=$1 AND restaurant_id=$2`,
		id, rid).Scan(&g.ID, &g.MenuItemID, &g.Name, &g.SizeScope, &g.SelectionType, &g.MinSelect, &g.MaxSelect, &g.SortOrder, &g.Active, &g.RestaurantID, &g.Description)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// CreateAddonGroup creates a group after verifying menu_item belongs to restaurant.
func CreateAddonGroup(restaurantID int, g AddonGroup) (*AddonGroup, error) {
	rid := ResolveRestaurant(restaurantID)
	if g.MenuItemID <= 0 {
		return nil, fmt.Errorf("menu_item_id is required")
	}
	var itemRest int
	if err := database.DB.QueryRow(`SELECT restaurant_id FROM menu_items WHERE id=$1`, g.MenuItemID).Scan(&itemRest); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("menu item not found")
		}
		return nil, err
	}
	if itemRest != rid {
		return nil, fmt.Errorf("menu item does not belong to current restaurant")
	}
	g.RestaurantID = rid
	if g.SizeScope == "" {
		g.SizeScope = "regular"
	}
	if g.SelectionType == "" {
		g.SelectionType = "multiple"
	}
	if err := validateAddonGroup(&g); err != nil {
		return nil, err
	}
	var id int
	err := database.DB.QueryRow(
		`INSERT INTO addon_groups (menu_item_id, name, size_scope, selection_type, min_select, max_select, sort_order, active, restaurant_id, description)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
		g.MenuItemID, strings.TrimSpace(g.Name), g.SizeScope, g.SelectionType, g.MinSelect, g.MaxSelect, g.SortOrder, g.Active, rid, g.Description).Scan(&id)
	if err != nil {
		if IsUniqueViolation(err, "uq_addon_groups_restaurant_item_name") || strings.Contains(err.Error(), "uq_addon_groups") {
			return nil, fmt.Errorf("duplicate: addon group name already exists for this item in this restaurant")
		}
		return nil, err
	}
	g.ID = id
	return &g, nil
}

// UpdateAddonGroup updates mutable fields (name, scopes, min/max, sort, active, description) — not menu_item_id migration.
func UpdateAddonGroup(id, restaurantID int, patch map[string]interface{}) (*AddonGroup, error) {
	rid := ResolveRestaurant(restaurantID)
	existing, err := GetAddonGroup(id, rid)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, sql.ErrNoRows
	}
	// apply patch
	if v, ok := patch["name"]; ok {
		if s, ok2 := v.(string); ok2 {
			existing.Name = s
		}
	}
	if v, ok := patch["size_scope"]; ok {
		if s, ok2 := v.(string); ok2 {
			existing.SizeScope = s
		}
	}
	if v, ok := patch["selection_type"]; ok {
		if s, ok2 := v.(string); ok2 {
			existing.SelectionType = s
		}
	}
	if v, ok := patch["min_select"]; ok {
		switch n := v.(type) {
		case float64:
			existing.MinSelect = int(n)
		case int:
			existing.MinSelect = n
		}
	}
	if v, ok := patch["max_select"]; ok {
		switch n := v.(type) {
		case float64:
			existing.MaxSelect = int(n)
		case int:
			existing.MaxSelect = n
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
	if v, ok := patch["active"]; ok {
		if b, ok2 := v.(bool); ok2 {
			existing.Active = b
		}
	}
	if v, ok := patch["description"]; ok {
		if s, ok2 := v.(string); ok2 {
			existing.Description = s
		}
	}
	if err := validateAddonGroup(existing); err != nil {
		return nil, err
	}
	_, err = database.DB.Exec(
		`UPDATE addon_groups SET name=$2, size_scope=$3, selection_type=$4, min_select=$5, max_select=$6, sort_order=$7, active=$8, description=$9, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND restaurant_id=$10`,
		id, strings.TrimSpace(existing.Name), existing.SizeScope, existing.SelectionType, existing.MinSelect, existing.MaxSelect, existing.SortOrder, existing.Active, existing.Description, rid)
	if err != nil {
		return nil, err
	}
	return existing, nil
}

// DeleteAddonGroup deletes if no open order depends on it (soft via FK cascade not applied to orders — just delete).
func DeleteAddonGroup(id, restaurantID int) error {
	rid := ResolveRestaurant(restaurantID)
	res, err := database.DB.Exec(`DELETE FROM addon_groups WHERE id=$1 AND restaurant_id=$2`, id, rid)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ListAddonItems returns items for a group, verifying tenant.
func ListAddonItems(groupID, restaurantID int) ([]AddonItem, error) {
	rid := ResolveRestaurant(restaurantID)
	grp, err := GetAddonGroup(groupID, rid)
	if err != nil {
		return nil, err
	}
	if grp == nil {
		return nil, sql.ErrNoRows
	}
	rows, err := database.DB.Query(
		`SELECT ai.id, ai.group_id, ai.menu_item_id, COALESCE(mi.name,''), ai.price_override, ai.sort_order, ai.active, ai.restaurant_id
		 FROM addon_items ai JOIN menu_items mi ON mi.id=ai.menu_item_id
		 WHERE ai.group_id=$1 AND ai.restaurant_id=$2 ORDER BY ai.sort_order, mi.name`, groupID, rid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AddonItem
	for rows.Next() {
		var it AddonItem
		var po sql.NullFloat64
		if err := rows.Scan(&it.ID, &it.GroupID, &it.MenuItemID, &it.MenuItemName, &po, &it.SortOrder, &it.Active, &it.RestaurantID); err != nil {
			return nil, err
		}
		if po.Valid {
			v := po.Float64
			it.PriceOverride = &v
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// CreateAddonItem inserts one addon item, verifying group and menu_item tenant.
func CreateAddonItem(restaurantID int, groupID, menuItemID int, priceOverride *float64, sortOrder int, active bool) (*AddonItem, error) {
	rid := ResolveRestaurant(restaurantID)
	if err := validateAddonItem(priceOverride); err != nil {
		return nil, err
	}
	grp, err := GetAddonGroup(groupID, rid)
	if err != nil {
		return nil, err
	}
	if grp == nil {
		return nil, fmt.Errorf("addon group not found")
	}
	var itemRest int
	if err := database.DB.QueryRow(`SELECT restaurant_id FROM menu_items WHERE id=$1`, menuItemID).Scan(&itemRest); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("menu item not found")
		}
		return nil, err
	}
	if itemRest != rid {
		return nil, fmt.Errorf("menu item does not belong to current restaurant")
	}
	var id int
	err = database.DB.QueryRow(
		`INSERT INTO addon_items (group_id, menu_item_id, price_override, sort_order, active, restaurant_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		groupID, menuItemID, priceOverride, sortOrder, active, rid).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "UNIQUE") {
			return nil, fmt.Errorf("duplicate: menu item already in this addon group")
		}
		return nil, err
	}
	var name string
	_ = database.DB.QueryRow(`SELECT name FROM menu_items WHERE id=$1`, menuItemID).Scan(&name)
	return &AddonItem{ID: id, GroupID: groupID, MenuItemID: menuItemID, MenuItemName: name, PriceOverride: priceOverride, SortOrder: sortOrder, Active: active, RestaurantID: rid}, nil
}

// UpdateAddonItem updates price_override, sort_order, active.
func UpdateAddonItem(itemID, restaurantID int, patch map[string]interface{}) (*AddonItem, error) {
	rid := ResolveRestaurant(restaurantID)
	var it AddonItem
	var po sql.NullFloat64
	err := database.DB.QueryRow(
		`SELECT id, group_id, menu_item_id, price_override, sort_order, active, restaurant_id FROM addon_items WHERE id=$1 AND restaurant_id=$2`,
		itemID, rid).Scan(&it.ID, &it.GroupID, &it.MenuItemID, &po, &it.SortOrder, &it.Active, &it.RestaurantID)
	if err != nil {
		return nil, err
	}
	if po.Valid {
		v := po.Float64
		it.PriceOverride = &v
	}
	if v, ok := patch["price_override"]; ok {
		if v == nil {
			it.PriceOverride = nil
		} else if f, ok2 := v.(float64); ok2 {
			it.PriceOverride = &f
		}
	}
	if v, ok := patch["sort_order"]; ok {
		switch n := v.(type) {
		case float64:
			it.SortOrder = int(n)
		case int:
			it.SortOrder = n
		}
	}
	if v, ok := patch["active"]; ok {
		if b, ok2 := v.(bool); ok2 {
			it.Active = b
		}
	}
	if err := validateAddonItem(it.PriceOverride); err != nil {
		return nil, err
	}
	_, err = database.DB.Exec(
		`UPDATE addon_items SET price_override=$2, sort_order=$3, active=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND restaurant_id=$5`,
		it.ID, it.PriceOverride, it.SortOrder, it.Active, rid)
	if err != nil {
		return nil, err
	}
	_ = database.DB.QueryRow(`SELECT name FROM menu_items WHERE id=$1`, it.MenuItemID).Scan(&it.MenuItemName)
	return &it, nil
}

// DeleteAddonItem deletes one link.
func DeleteAddonItem(itemID, restaurantID int) error {
	rid := ResolveRestaurant(restaurantID)
	res, err := database.DB.Exec(`DELETE FROM addon_items WHERE id=$1 AND restaurant_id=$2`, itemID, rid)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
