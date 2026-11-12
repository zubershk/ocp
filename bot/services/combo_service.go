package services

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"orangecheesepizza/bot/database"
)

// ComboType values are not constrained to an enum: a combo is a
// product, not a discount rule (that is what coupons are for).
type Combo struct {
	ID           int         `json:"id"`
	RestaurantID int         `json:"restaurant_id"`
	Name         string      `json:"name"`
	Slug         string      `json:"slug"`
	Description  string      `json:"description"`
	ImageURL     string      `json:"image_url"`
	ComboPrice   float64     `json:"combo_price"`
	// MRPTotal is the sum of the constituent items at their live
	// menu prices. Derived on read so it never goes stale.
	MRPTotal float64 `json:"mrp_total"`
	// Savings is MRPTotal - ComboPrice, clamped at 0.
	Savings     float64    `json:"savings"`
	IsActive    bool       `json:"is_active"`
	SortOrder   int        `json:"sort_order"`
	StartsAt    time.Time  `json:"starts_at"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	Items       []ComboItem `json:"items"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	// MenuItemID is the backing sellable menu_items row. The combo is
	// ordered through it so the whole cart/checkout/pricing pipeline
	// bills it at ComboPrice instead of the sum of its parts.
	MenuItemID int `json:"menu_item_id,omitempty"`
	// SelectionLimit: 0 = fixed bundle (the pool is taken as defined);
	// N > 0 = the customer picks exactly N units from the pool.
	SelectionLimit int `json:"selection_limit"`
	// ShowInMenu controls whether the combo also appears in the
	// storefront menu grid. Pick-N combos are always hidden there,
	// because buying one without making a selection is impossible.
	ShowInMenu bool `json:"show_in_menu"`
	// RequiresSelection is true when the customer must choose from the
	// pool before the combo can be added to the cart.
	RequiresSelection bool `json:"requires_selection"`
	// DefaultSelection is the starting mix for a pick-N combo: the
	// pool's configured quantities, clamped to the selection limit.
	// The storefront opens the picker on this mix so the customer can
	// redistribute it (e.g. 2 onion + 1 tomato + 1 corn) instead of
	// starting from an empty picker.
	DefaultSelection []ComboSelection `json:"default_selection,omitempty"`
}

// ComboItem is one constituent of a combo.
type ComboItem struct {
	ID         int     `json:"id"`
	ComboID    int     `json:"combo_id"`
	MenuItemID int     `json:"menu_item_id"`
	// Name / Slug / ImageURL are denormalised for display so the
	// customer-facing payload needs no extra joins.
	Name     string  `json:"name"`
	Slug     string  `json:"slug"`
	ImageURL string  `json:"image_url"`
	Size     string  `json:"size"`
	Quantity int     `json:"quantity"`
	// MaxQty is the EFFECTIVE cap on how many units of this pool item
	// may be selected. It is derived, never admin-set: in pick-N mode
	// it equals the combo's selection limit (there is no per-item cap),
	// and in a fixed bundle it equals the configured quantity.
	MaxQty    int     `json:"max_qty"`
	UnitPrice float64 `json:"unit_price"`
	LineTotal float64 `json:"line_total"`
}

// ComboConfig is the admin-supplied payload for create/update.
type ComboConfig struct {
	RestaurantID int           `json:"restaurant_id"`
	Name         string        `json:"name"`
	Slug         string        `json:"slug"`
	Description  string        `json:"description"`
	ImageURL     string        `json:"image_url"`
	ComboPrice   float64       `json:"combo_price"`
	IsActive     bool          `json:"is_active"`
	SortOrder    int           `json:"sort_order"`
	StartsAt     *time.Time    `json:"starts_at,omitempty"`
	ExpiresAt    *time.Time    `json:"expires_at,omitempty"`
	// SelectionLimit: 0 = fixed bundle; N > 0 = customer picks N from the pool.
	SelectionLimit int           `json:"selection_limit"`
	ShowInMenu     bool          `json:"show_in_menu"`
	Items          []ComboItemIn `json:"items"`
}

// ComboItemIn is a requested constituent of a combo.
type ComboItemIn struct {
	MenuItemID int    `json:"menu_item_id"`
	Size       string `json:"size"`
	// Quantity is the item's share of the combo's starting mix.
	Quantity int `json:"quantity"`
	// MaxQty is accepted for backwards compatibility but IGNORED.
	// There is no per-item cap: the customer may take any number of
	// any pool item, bounded only by the combo's selection limit.
	MaxQty int `json:"max_qty"`
}

// ComboValidationError maps cleanly to HTTP 400.
type ComboValidationError struct{ Msg string }

func (e *ComboValidationError) Error() string { return e.Msg }

// ErrComboNotFound signals that a combo does not exist, or exists but is
// not currently purchasable (inactive or expired). Callers use errors.Is
// to distinguish this from a genuine server fault.
var ErrComboNotFound = errors.New("combo not found")

func comboBadRequest(format string, args ...interface{}) *ComboValidationError {
	return &ComboValidationError{Msg: fmt.Sprintf(format, args...)}
}

type ComboService struct{}

func NewComboService() *ComboService { return &ComboService{} }

// ---------------------------------------------------------------------------
// Slug handling
// ---------------------------------------------------------------------------

// comboSlug normalises a name into a URL-safe slug. Combos share the
// menu_items slug namespace conceptually but live in their own table, so a
// dedicated helper avoids depending on the admin package.
func comboSlug(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
		} else if !prevDash {
			b.WriteRune('-')
			prevDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

// comboColumns is the shared column list for reading a combo header.
const comboColumns = `id, restaurant_id, name, slug, COALESCE(description, ''), COALESCE(image_url, ''),
	combo_price, is_active, sort_order, starts_at, expires_at, created_at, updated_at,
	COALESCE(menu_item_id, 0), selection_limit, show_in_menu`

// List returns every combo for a restaurant, including inactive ones.
func (s *ComboService) List(restaurantID int) ([]*Combo, error) {
	rid := ResolveRestaurant(restaurantID)
	rows, err := database.DB.Query(`
		SELECT `+comboColumns+`
		FROM combos
		WHERE restaurant_id = $1
		ORDER BY sort_order, id
	`, rid)
	if err != nil {
		return nil, fmt.Errorf("failed to list combos: %w", err)
	}
	defer rows.Close()

	var combos []*Combo
	for rows.Next() {
		c, err := scanCombo(rows)
		if err != nil {
			return nil, err
		}
		combos = append(combos, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to list combos: %w", err)
	}

	for _, c := range combos {
		items, err := s.itemsFor(c.ID, rid)
		if err != nil {
			return nil, err
		}
		c.Items = items
		c.applyTotals()
	}
	return combos, nil
}

// ListActive returns only the combos that are currently purchasable:
// active, within their date window, and belonging to the tenant.
func (s *ComboService) ListActive(restaurantID int) ([]*Combo, error) {
	all, err := s.List(restaurantID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]*Combo, 0, len(all))
	for _, c := range all {
		if !c.IsActive {
			continue
		}
		if c.ExpiresAt != nil && now.After(*c.ExpiresAt) {
			continue
		}
		if len(c.Items) == 0 {
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

// GetByID returns a single combo scoped to the tenant.
func (s *ComboService) GetByID(id, restaurantID int) (*Combo, error) {
	rid := ResolveRestaurant(restaurantID)
	row := database.DB.QueryRow(`
		SELECT `+comboColumns+`
		FROM combos
		WHERE id = $1 AND restaurant_id = $2
	`, id, rid)
	c, err := scanCombo(row)
	if err == sql.ErrNoRows {
		return nil, comboBadRequest("combo not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch combo: %w", err)
	}
	items, err := s.itemsFor(c.ID, rid)
	if err != nil {
		return nil, err
	}
	c.Items = items
	c.applyTotals()
	return c, nil
}

// GetBySlug returns a combo by its slug, scoped to the tenant.
func (s *ComboService) GetBySlug(slug string, restaurantID int) (*Combo, error) {
	rid := ResolveRestaurant(restaurantID)
	row := database.DB.QueryRow(`
		SELECT `+comboColumns+`
		FROM combos
		WHERE slug = $1 AND restaurant_id = $2
	`, strings.ToLower(strings.TrimSpace(slug)), rid)
	c, err := scanCombo(row)
	if err == sql.ErrNoRows {
		return nil, comboBadRequest("combo not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch combo: %w", err)
	}
	items, err := s.itemsFor(c.ID, rid)
	if err != nil {
		return nil, err
	}
	c.Items = items
	c.applyTotals()
	return c, nil
}

// GetActiveBySlug returns a combo by slug only when it is currently
// purchasable (active, in-window, has items). It returns
// ErrComboNotFound when the combo is missing or not purchasable, so
// callers can distinguish "gone" from a server fault.
func (s *ComboService) GetActiveBySlug(slug string, restaurantID int) (*Combo, error) {
	combo, err := s.GetBySlug(slug, restaurantID)
	if err != nil {
		if ve, ok := err.(*ComboValidationError); ok && ve.Msg == "combo not found" {
			return nil, ErrComboNotFound
		}
		return nil, err
	}
	if !combo.IsActive {
		return nil, ErrComboNotFound
	}
	now := time.Now()
	if combo.ExpiresAt != nil && now.After(*combo.ExpiresAt) {
		return nil, ErrComboNotFound
	}
	if len(combo.Items) == 0 {
		return nil, ErrComboNotFound
	}
	return combo, nil
}

// itemsFor loads the constituents of a combo with their live menu prices.
func (s *ComboService) itemsFor(comboID, restaurantID int) ([]ComboItem, error) {
	rows, err := database.DB.Query(`
		SELECT ci.id, ci.combo_id, ci.menu_item_id,
		       mi.name, COALESCE(mi.slug, ''), COALESCE(mi.image_url, ''),
		       ci.size, ci.quantity, ci.max_qty,
		       COALESCE(mi.price_regular, mi.price) AS price_regular,
		       COALESCE(mi.price_medium,  mi.price) AS price_medium,
		       COALESCE(mi.price_large,   mi.price) AS price_large
		FROM combo_items ci
		JOIN menu_items mi ON mi.id = ci.menu_item_id
		WHERE ci.combo_id = $1 AND mi.restaurant_id = $2 AND mi.active = true
		ORDER BY ci.id
	`, comboID, restaurantID)
	if err != nil {
		return nil, fmt.Errorf("failed to load combo items: %w", err)
	}
	defer rows.Close()

	items := []ComboItem{}
	for rows.Next() {
		var it ComboItem
		var pRegular, pMedium, pLarge float64
		if err := rows.Scan(&it.ID, &it.ComboID, &it.MenuItemID,
			&it.Name, &it.Slug, &it.ImageURL, &it.Size, &it.Quantity, &it.MaxQty,
			&pRegular, &pMedium, &pLarge); err != nil {
			return nil, fmt.Errorf("failed to scan combo item: %w", err)
		}
		it.UnitPrice = comboUnitPrice(it.Size, pRegular, pMedium, pLarge)
		it.LineTotal = it.UnitPrice * float64(it.Quantity)
		items = append(items, it)
	}
	return items, rows.Err()
}

// comboUnitPrice picks the price for a size, falling back to the regular
// price when the item has no price for that size (mirrors the website
// order pricing rules so cart and receipt agree).
func comboUnitPrice(size string, pRegular, pMedium, pLarge float64) float64 {
	switch strings.ToLower(strings.TrimSpace(size)) {
	case "medium":
		if pMedium > 0 {
			return pMedium
		}
	case "large":
		if pLarge > 0 {
			return pLarge
		}
	}
	if pRegular > 0 {
		return pRegular
	}
	return pMedium
}

// applyTotals recomputes the derived MRP / savings fields.
//
// For a fixed bundle the MRP is the sum of the pool at the configured
// quantities. For a pick-N combo the customer chooses N units, so the
// MRP shown is the value of the starting mix — that is the true "value
// of the bundle" the combo price is compared against.
//
// It also normalises each pool item's effective cap, which is derived
// from the selection limit rather than set per item.
func (c *Combo) applyTotals() {
	c.RequiresSelection = c.SelectionLimit > 0

	// There is no per-item cap: the effective cap on any single pool
	// item is the combo's total selection limit.
	for i := range c.Items {
		if c.SelectionLimit > 0 {
			c.Items[i].MaxQty = c.SelectionLimit
		} else {
			c.Items[i].MaxQty = c.Items[i].Quantity
			if c.Items[i].MaxQty <= 0 {
				c.Items[i].MaxQty = 1
			}
		}
	}

	var mrp float64
	if c.RequiresSelection {
		// MRP is the value of the mix the customer starts from. Using
		// the default selection (rather than the theoretical cheapest
		// pick) keeps the advertised saving tied to what the customer
		// actually sees in the picker.
		for _, sel := range c.buildDefaultSelection() {
			mrp += sel.LineTotal
		}
		if mrp == 0 {
			mrp = c.cheapestSelectionTotal()
		}
	} else {
		for _, it := range c.Items {
			mrp += it.LineTotal
		}
	}
	c.MRPTotal = round2(mrp)
	c.Savings = round2(c.MRPTotal - c.ComboPrice)
	if c.Savings < 0 {
		c.Savings = 0
	}
	c.DefaultSelection = c.buildDefaultSelection()
}

// cheapestSelectionTotal returns the lowest-price valid selection of
// SelectionLimit units from the pool. There is no per-item cap, so any
// single pool item can fill the whole selection.
func (c *Combo) cheapestSelectionTotal() float64 {
	type unit struct {
		price float64
	}
	var units []unit
	for _, it := range c.Items {
		max := c.SelectionLimit
		if max <= 0 {
			max = it.Quantity
		}
		if max <= 0 {
			max = 1
		}
		for i := 0; i < max; i++ {
			units = append(units, unit{price: it.UnitPrice})
		}
	}
	if len(units) < c.SelectionLimit {
		// Pool cannot satisfy the limit — fall back to the whole pool so
		// the displayed MRP is still meaningful.
		total := 0.0
		for _, it := range c.Items {
			total += it.LineTotal
		}
		return total
	}
	sort.Slice(units, func(i, j int) bool { return units[i].price < units[j].price })
	total := 0.0
	for i := 0; i < c.SelectionLimit; i++ {
		total += units[i].price
	}
	return total
}

func round2(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}

// scanCombo reads a combo row from a queryable source.
func scanCombo(scanner interface {
	Scan(dest ...interface{}) error
}) (*Combo, error) {
	var c Combo
	var expiresAt *time.Time
	if err := scanner.Scan(&c.ID, &c.RestaurantID, &c.Name, &c.Slug,
		&c.Description, &c.ImageURL, &c.ComboPrice, &c.IsActive, &c.SortOrder,
		&c.StartsAt, &expiresAt, &c.CreatedAt, &c.UpdatedAt,
		&c.MenuItemID, &c.SelectionLimit, &c.ShowInMenu); err != nil {
		return nil, err
	}
	c.ExpiresAt = expiresAt
	return &c, nil
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

// validate checks the payload and resolves the constituent menu items.
func (s *ComboService) validate(cfg *ComboConfig, rid int) error {
	cfg.Name = strings.TrimSpace(cfg.Name)
	if cfg.Name == "" {
		return comboBadRequest("combo name is required")
	}
	if len(cfg.Name) > 160 {
		return comboBadRequest("combo name too long (max 160 characters)")
	}
	if len(cfg.Description) > 2000 {
		return comboBadRequest("combo description too long (max 2000 characters)")
	}
	if cfg.ComboPrice <= 0 {
		return comboBadRequest("combo price must be greater than zero")
	}
	if len(cfg.Items) == 0 {
		return comboBadRequest("a combo needs at least one menu item")
	}
	if len(cfg.Items) > 25 {
		return comboBadRequest("too many items in a combo (max 25)")
	}
	if cfg.SelectionLimit < 0 {
		return comboBadRequest("selection limit cannot be negative")
	}
	if cfg.SelectionLimit > 50 {
		return comboBadRequest("selection limit cannot be greater than 50")
	}

	seen := map[string]bool{}
	for i := range cfg.Items {
		it := &cfg.Items[i]
		if it.MenuItemID <= 0 {
			return comboBadRequest("menu_item_id is required for every combo item")
		}
		// In a pick-N combo the default quantity may be 0: the item is
		// offered in the pool but is not part of the starting mix.
		// In a fixed bundle every pool item is included, so the quantity
		// is at least 1.
		if it.Quantity < 0 {
			return comboBadRequest("quantity for a combo item cannot be negative")
		}
		if it.Quantity == 0 && cfg.SelectionLimit == 0 {
			it.Quantity = 1
		}
		if it.Quantity > 20 {
			return comboBadRequest("quantity for a combo item must be between 1 and 20")
		}
		// There is NO per-item cap: the customer may take any number of
		// any pool item, bounded only by the combo's selection limit.
		// MaxQty is derived here so the client knows the effective cap.
		if cfg.SelectionLimit > 0 {
			it.MaxQty = cfg.SelectionLimit
		} else {
			it.MaxQty = it.Quantity
			if it.MaxQty <= 0 {
				it.MaxQty = 1
			}
		}
		// The starting mix can never exceed the effective cap, or the
		// picker would open on an invalid state.
		if it.Quantity > it.MaxQty {
			it.Quantity = it.MaxQty
		}
		it.Size = strings.ToLower(strings.TrimSpace(it.Size))
		if it.Size == "" {
			it.Size = "regular"
		}
		if it.Size != "regular" && it.Size != "medium" && it.Size != "large" {
			return comboBadRequest("invalid size %q for combo item", it.Size)
		}
		key := fmt.Sprintf("%d:%s", it.MenuItemID, it.Size)
		if seen[key] {
			return comboBadRequest("duplicate combo item (same menu item and size)")
		}
		seen[key] = true

		var ok int
		err := database.DB.QueryRow(
			`SELECT id FROM menu_items WHERE id = $1 AND restaurant_id = $2 AND active = true`,
			it.MenuItemID, rid).Scan(&ok)
		if err == sql.ErrNoRows {
			return comboBadRequest("menu item %d not found", it.MenuItemID)
		}
		if err != nil {
			return fmt.Errorf("menu item lookup failed: %w", err)
		}
	}

	// A pick-N combo can always satisfy its limit: there is no per-item
	// cap, so the customer may take every unit from a single pool item.
	// The pool only needs to contain at least one item, which is
	// enforced above.
	return nil
}

// Create inserts a combo and its constituent items.
func (s *ComboService) Create(cfg *ComboConfig) (*Combo, error) {
	rid := ResolveRestaurant(cfg.RestaurantID)
	if err := s.validate(cfg, rid); err != nil {
		return nil, err
	}

	slug := strings.ToLower(strings.TrimSpace(cfg.Slug))
	if slug == "" {
		slug = comboSlug(cfg.Name)
	}
	if slug == "" {
		return nil, comboBadRequest("could not derive a slug for this combo")
	}

	// Slug must be unique per tenant.
	var dup string
	err := database.DB.QueryRow(`SELECT slug FROM combos WHERE slug = $1 AND restaurant_id = $2`, slug, rid).Scan(&dup)
	if err == nil {
		return nil, comboBadRequest("a combo with this slug already exists")
	}
	if err != sql.ErrNoRows {
		return nil, fmt.Errorf("slug lookup failed: %w", err)
	}

	startsAt := time.Now()
	if cfg.StartsAt != nil {
		startsAt = *cfg.StartsAt
	}
	now := time.Now()

	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("tx begin failed: %w", err)
	}
	defer tx.Rollback()

	var comboID int
	if err := tx.QueryRow(`
		INSERT INTO combos
			(restaurant_id, name, slug, description, image_url, combo_price, is_active,
			 sort_order, starts_at, expires_at, created_at, updated_at,
			 selection_limit, show_in_menu)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13)
		RETURNING id
	`, rid, cfg.Name, slug, strings.TrimSpace(cfg.Description), strings.TrimSpace(cfg.ImageURL),
		cfg.ComboPrice, cfg.IsActive, cfg.SortOrder, startsAt, cfg.ExpiresAt, now,
		cfg.SelectionLimit, cfg.ShowInMenu,
	).Scan(&comboID); err != nil {
		return nil, fmt.Errorf("failed to create combo: %w", err)
	}

	for _, it := range cfg.Items {
		if _, err := tx.Exec(`
			INSERT INTO combo_items (combo_id, menu_item_id, size, quantity, max_qty, created_at)
			VALUES ($1,$2,$3,$4,$5,$6)
		`, comboID, it.MenuItemID, it.Size, it.Quantity, it.MaxQty, now); err != nil {
			return nil, fmt.Errorf("failed to create combo item: %w", err)
		}
	}

	// Create the backing sellable menu item so the combo can be ordered
	// through the normal cart/checkout pipeline at the combo price.
	menuItemID, err := upsertComboMenuItem(tx, rid, comboID, slug, cfg, 0)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(
		`UPDATE combos SET menu_item_id = $1 WHERE id = $2`, menuItemID, comboID); err != nil {
		return nil, fmt.Errorf("failed to link combo menu item: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("tx commit failed: %w", err)
	}
	return s.GetByID(comboID, rid)
}

// Update replaces the mutable fields and the constituent item list.
func (s *ComboService) Update(id, restaurantID int, cfg *ComboConfig) (*Combo, error) {
	rid := ResolveRestaurant(restaurantID)
	existing, err := s.GetByID(id, rid)
	if err != nil {
		return nil, err
	}
	if err := s.validate(cfg, rid); err != nil {
		return nil, err
	}

	slug := strings.ToLower(strings.TrimSpace(cfg.Slug))
	if slug == "" {
		slug = comboSlug(cfg.Name)
	}
	if slug == "" {
		return nil, comboBadRequest("could not derive a slug for this combo")
	}
	var dup string
	err = database.DB.QueryRow(
		`SELECT slug FROM combos WHERE slug = $1 AND restaurant_id = $2 AND id != $3`,
		slug, rid, id).Scan(&dup)
	if err == nil {
		return nil, comboBadRequest("a combo with this slug already exists")
	}
	if err != sql.ErrNoRows {
		return nil, fmt.Errorf("slug lookup failed: %w", err)
	}

	now := time.Now()
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("tx begin failed: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE combos SET
			name = $1, slug = $2, description = $3, image_url = $4, combo_price = $5,
			is_active = $6, sort_order = $7, expires_at = $8, updated_at = $9,
			selection_limit = $10, show_in_menu = $11
		WHERE id = $12 AND restaurant_id = $13
	`, cfg.Name, slug, strings.TrimSpace(cfg.Description), strings.TrimSpace(cfg.ImageURL),
		cfg.ComboPrice, cfg.IsActive, cfg.SortOrder, cfg.ExpiresAt, now,
		cfg.SelectionLimit, cfg.ShowInMenu, id, rid,
	); err != nil {
		return nil, fmt.Errorf("failed to update combo: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM combo_items WHERE combo_id = $1`, id); err != nil {
		return nil, fmt.Errorf("failed to replace combo items: %w", err)
	}
	for _, it := range cfg.Items {
		if _, err := tx.Exec(`
			INSERT INTO combo_items (combo_id, menu_item_id, size, quantity, max_qty, created_at)
			VALUES ($1,$2,$3,$4,$5,$6)
		`, id, it.MenuItemID, it.Size, it.Quantity, it.MaxQty, now); err != nil {
			return nil, fmt.Errorf("failed to create combo item: %w", err)
		}
	}

	// Keep the backing sellable item in sync with the combo.
	if _, err := upsertComboMenuItem(tx, rid, id, slug, cfg, existing.MenuItemID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("tx commit failed: %w", err)
	}
	return s.GetByID(id, rid)
}

// upsertComboMenuItem creates or updates the menu_items row that makes a
// combo orderable. It lives in the restaurant's 'combos' category and is
// priced at the combo price, so the standard cart/checkout/order pipeline
// bills the customer the combo price rather than the sum of its parts.
//
// menuItemID is the existing backing item (0 to create a new one).
func upsertComboMenuItem(tx *sql.Tx, rid, comboID int, slug string, cfg *ComboConfig, menuItemID int) (int, error) {
	// Resolve (or create) the tenant's Combos category.
	var categoryID int
	err := tx.QueryRow(
		`SELECT id FROM menu_categories WHERE slug = 'combos' AND restaurant_id = $1`,
		rid).Scan(&categoryID)
	if err == sql.ErrNoRows {
		err = tx.QueryRow(`
			INSERT INTO menu_categories (name, slug, description, sort_order, active, restaurant_id)
			VALUES ('Combos', 'combos', 'Curated combo meals', 90, true, $1)
			RETURNING id
		`, rid).Scan(&categoryID)
		if err != nil {
			return 0, fmt.Errorf("failed to create combos category: %w", err)
		}
	} else if err != nil {
		return 0, fmt.Errorf("failed to resolve combos category: %w", err)
	}

	// Pick-N combos cannot be bought without making a selection, so they
	// are never listed in the menu grid — only on the offers page.
	available := cfg.IsActive && cfg.SelectionLimit == 0
	backingSlug := "combo-" + strconv.Itoa(comboID) + "-" + slug

	if menuItemID > 0 {
		if _, err := tx.Exec(`
			UPDATE menu_items SET
				category_id = $1, name = $2, slug = $3, description = $4, price = $5,
				image_url = $6, available = $7, sort_order = $8, active = $9,
				no_crust = true, updated_at = $10
			WHERE id = $11 AND restaurant_id = $12
		`, categoryID, cfg.Name, backingSlug, strings.TrimSpace(cfg.Description), cfg.ComboPrice,
			strings.TrimSpace(cfg.ImageURL), available, cfg.SortOrder, cfg.IsActive, time.Now(),
			menuItemID, rid,
		); err != nil {
			return 0, fmt.Errorf("failed to update combo menu item: %w", err)
		}
		return menuItemID, nil
	}

	var newID int
	if err := tx.QueryRow(`
		INSERT INTO menu_items
			(category_id, name, slug, description, price, image_url, available, sort_order,
			 active, no_crust, dietary, restaurant_id, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'veg',$10,$11,$11)
		RETURNING id
	`, categoryID, cfg.Name, backingSlug, strings.TrimSpace(cfg.Description), cfg.ComboPrice,
		strings.TrimSpace(cfg.ImageURL), available, cfg.SortOrder, cfg.IsActive, rid, time.Now(),
	).Scan(&newID); err != nil {
		return 0, fmt.Errorf("failed to create combo menu item: %w", err)
	}
	return newID, nil
}

// Delete removes a combo, its constituent items and its backing menu item.
func (s *ComboService) Delete(id, restaurantID int) error {
	rid := ResolveRestaurant(restaurantID)
	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("tx begin failed: %w", err)
	}
	defer tx.Rollback()

	var menuItemID int
	err = tx.QueryRow(
		`SELECT COALESCE(menu_item_id, 0) FROM combos WHERE id = $1 AND restaurant_id = $2`,
		id, rid).Scan(&menuItemID)
	if err == sql.ErrNoRows {
		return comboBadRequest("combo not found")
	}
	if err != nil {
		return fmt.Errorf("failed to load combo: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM combos WHERE id = $1 AND restaurant_id = $2`, id, rid); err != nil {
		return fmt.Errorf("failed to delete combo: %w", err)
	}

	// Remove the backing sellable item too, otherwise it would linger in
	// the catalog as an unorderable orphan. The slug prefix check keeps
	// this from ever touching a real (non-combo) menu item.
	if menuItemID > 0 {
		if _, err := tx.Exec(
			`DELETE FROM menu_items WHERE id = $1 AND restaurant_id = $2 AND slug LIKE 'combo-%'`,
			menuItemID, rid); err != nil {
			return fmt.Errorf("failed to delete combo menu item: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("tx commit failed: %w", err)
	}
	return nil
}

// ComboSelection is a validated customer choice within a combo.
type ComboSelection struct {
	MenuItemID int     `json:"menu_item_id"`
	Name       string  `json:"name"`
	Size       string  `json:"size"`
	Quantity   int     `json:"quantity"`
	UnitPrice  float64 `json:"unit_price"`
	LineTotal  float64 `json:"line_total"`
}

// ResolveSelection validates a customer's combo selection against the
// combo's pool and returns the resolved items.
//
// For a fixed bundle (SelectionLimit == 0) the pool is taken as defined
// and any customer selection is ignored. For a pick-N combo the customer
// must select exactly SelectionLimit units and every selected item must
// be in the pool. There is NO per-item cap: the customer may take any
// number of any pool item (e.g. all 4 units as onion), bounded only by
// the total selection limit.
//
// The returned prices are the LIVE menu prices, so the receipt shows what
// the items were worth; the customer is still billed the combo price.
func (s *ComboService) ResolveSelection(combo *Combo, selection []ComboSelectionItem) ([]ComboSelection, error) {
	if combo == nil {
		return nil, comboBadRequest("combo not found")
	}

	// Fixed bundle: the pool is the selection.
	if combo.SelectionLimit == 0 {
		out := make([]ComboSelection, 0, len(combo.Items))
		for _, it := range combo.Items {
			out = append(out, ComboSelection{
				MenuItemID: it.MenuItemID,
				Name:       it.Name,
				Size:       it.Size,
				Quantity:   it.Quantity,
				UnitPrice:  it.UnitPrice,
				LineTotal:  it.LineTotal,
			})
		}
		return out, nil
	}

	// Pick-N: index the pool by (menu_item_id, size).
	type poolKey struct {
		id   int
		size string
	}
	pool := make(map[poolKey]ComboItem, len(combo.Items))
	for _, it := range combo.Items {
		pool[poolKey{it.MenuItemID, it.Size}] = it
	}

	picked := make(map[poolKey]int)
	var total int
	for _, sel := range selection {
		if sel.Quantity <= 0 {
			continue
		}
		size := strings.ToLower(strings.TrimSpace(sel.Size))
		if size == "" {
			size = "regular"
		}
		key := poolKey{sel.MenuItemID, size}
		if _, ok := pool[key]; !ok {
			return nil, comboBadRequest("item %d is not part of this combo", sel.MenuItemID)
		}
		picked[key] += sel.Quantity
		total += sel.Quantity
	}

	if total != combo.SelectionLimit {
		return nil, comboBadRequest(
			"select exactly %d item(s) for this combo (got %d)", combo.SelectionLimit, total)
	}

	out := make([]ComboSelection, 0, len(picked))
	for key, qty := range picked {
		it := pool[key]
		out = append(out, ComboSelection{
			MenuItemID: it.MenuItemID,
			Name:       it.Name,
			Size:       it.Size,
			Quantity:   qty,
			UnitPrice:  it.UnitPrice,
			LineTotal:  round2(it.UnitPrice * float64(qty)),
		})
	}
	return out, nil
}

// buildDefaultSelection returns the mix the customer starts from in a
// pick-N combo: the pool's configured quantities, clamped so the
// total never exceeds the selection limit.
//
// This lets the storefront open the picker on a sensible, valid
// starting point (the "1 of each" bundle) that the customer can then
// redistribute — e.g. swap a capsicum for a second onion — without
// the picker starting empty or in an invalid state.
//
// If the configured quantities add up to less than the limit the mix is
// topped up from the pool (cheapest first) so the picker always opens
// on a COMPLETE selection the customer can accept as-is.
//
// For a fixed bundle it returns the pool exactly as configured.
func (c *Combo) buildDefaultSelection() []ComboSelection {
	out := make([]ComboSelection, 0, len(c.Items))
	if c.SelectionLimit == 0 {
		for _, it := range c.Items {
			out = append(out, ComboSelection{
				MenuItemID: it.MenuItemID,
				Name:       it.Name,
				Size:       it.Size,
				Quantity:   it.Quantity,
				UnitPrice:  it.UnitPrice,
				LineTotal:  it.LineTotal,
			})
		}
		return out
	}

	remaining := c.SelectionLimit
	for _, it := range c.Items {
		if remaining <= 0 {
			break
		}
		qty := it.Quantity
		if qty > remaining {
			qty = remaining
		}
		if qty <= 0 {
			continue
		}
		remaining -= qty
		out = append(out, ComboSelection{
			MenuItemID: it.MenuItemID,
			Name:       it.Name,
			Size:       it.Size,
			Quantity:   qty,
			UnitPrice:  it.UnitPrice,
			LineTotal:  round2(it.UnitPrice * float64(qty)),
		})
	}

	// Top up to the limit so the picker opens on a complete selection.
	// There is no per-item cap, so the cheapest pool items fill the gap
	// first — which also keeps the advertised MRP a conservative floor.
	if remaining > 0 {
		type poolKey struct {
			id   int
			size string
		}
		// Index the mix by pool key so the top-up extends an existing
		// entry instead of duplicating it.
		idx := make(map[poolKey]int, len(out))
		for i, sel := range out {
			idx[poolKey{sel.MenuItemID, sel.Size}] = i
		}

		pool := make([]ComboItem, len(c.Items))
		copy(pool, c.Items)
		sort.Slice(pool, func(i, j int) bool { return pool[i].UnitPrice < pool[j].UnitPrice })

		for _, it := range pool {
			key := poolKey{it.MenuItemID, it.Size}
			for remaining > 0 {
				if i, ok := idx[key]; ok {
					out[i].Quantity++
					out[i].LineTotal = round2(out[i].UnitPrice * float64(out[i].Quantity))
				} else {
					idx[key] = len(out)
					out = append(out, ComboSelection{
						MenuItemID: it.MenuItemID,
						Name:       it.Name,
						Size:       it.Size,
						Quantity:   1,
						UnitPrice:  it.UnitPrice,
						LineTotal:  round2(it.UnitPrice),
					})
				}
				remaining--
			}
		}
	}
	return out
}

// MenuItemInUseError reports that a menu item still belongs to one or
// more combos and therefore cannot be deleted. The admin UI shows this
// message so the user knows to remove it from the combo first.
type MenuItemInUseError struct {
	MenuItemID int
	Combos     []string
}

func (e *MenuItemInUseError) Error() string {
	if len(e.Combos) == 1 {
		return fmt.Sprintf("menu item is used in combo %q — remove it from the combo first", e.Combos[0])
	}
	return fmt.Sprintf("menu item is used in %d combos — remove it from them first", len(e.Combos))
}

// CountMenuItemCombos returns the combos a menu item belongs to, scoped
// to the tenant. Used to produce a friendly error instead of a raw
// foreign-key violation when the item is deleted.
func (s *ComboService) CountMenuItemCombos(menuItemID, restaurantID int) ([]string, error) {
	rid := ResolveRestaurant(restaurantID)
	rows, err := database.DB.Query(`
		SELECT c.name
		FROM combo_items ci
		JOIN combos c ON c.id = ci.combo_id
		WHERE ci.menu_item_id = $1 AND c.restaurant_id = $2
		ORDER BY c.name
	`, menuItemID, rid)
	if err != nil {
		return nil, fmt.Errorf("failed to check combo usage: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("failed to scan combo name: %w", err)
		}
		names = append(names, name)
	}
	return names, rows.Err()
}
