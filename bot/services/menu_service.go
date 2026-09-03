package services

import (
	"database/sql"
	"encoding/json"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
)

type MenuService struct{}

func NewMenuService() *MenuService {
	return &MenuService{}
}

func (s *MenuService) GetCategories() ([]models.MenuCategory, error) {
	rows, err := database.DB.Query(`
		SELECT id, name, description, sort_order, active, created_at, updated_at
		FROM menu_categories
		WHERE active = true
		ORDER BY sort_order, name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []models.MenuCategory
	for rows.Next() {
		var cat models.MenuCategory
		if err := rows.Scan(&cat.ID, &cat.Name, &cat.Description, &cat.SortOrder, &cat.Active, &cat.CreatedAt, &cat.UpdatedAt); err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}
	return categories, nil
}

func (s *MenuService) GetCategoryByID(id int) (*models.MenuCategory, error) {
	var cat models.MenuCategory
	err := database.DB.QueryRow(`
		SELECT id, name, description, sort_order, active, created_at, updated_at
		FROM menu_categories
		WHERE id = $1 AND active = true
	`, id).Scan(&cat.ID, &cat.Name, &cat.Description, &cat.SortOrder, &cat.Active, &cat.CreatedAt, &cat.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &cat, err
}

func (s *MenuService) GetItemsByCategory(categoryID int) ([]models.MenuItem, error) {
	rows, err := database.DB.Query(`
		SELECT id, category_id, name, description, price, image_url, available, sort_order, active, created_at, updated_at
		FROM menu_items
		WHERE category_id = $1 AND active = true AND available = true
		ORDER BY sort_order, name
	`, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.MenuItem
	for rows.Next() {
		var item models.MenuItem
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Name, &item.Description, &item.Price, &item.ImageURL, &item.Available, &item.SortOrder, &item.Active, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		// Load options for each item
		item.Options, _ = s.GetOptionsByItemID(item.ID)
		items = append(items, item)
	}
	return items, nil
}

func (s *MenuService) GetItemByID(id int) (*models.MenuItem, error) {
	var item models.MenuItem
	err := database.DB.QueryRow(`
		SELECT id, category_id, name, slug, description, price, image_url, available, sort_order, active, created_at, updated_at,
		price_regular, price_medium, price_large, COALESCE(dietary,'veg'), COALESCE(pizza_subcategory,''), COALESCE(pizza_type,''), is_spicy, is_jain, is_new, COALESCE(no_crust,false)
		FROM menu_items
		WHERE id = $1 AND active = true
	`, id).Scan(&item.ID, &item.CategoryID, &item.Name, &item.Slug, &item.Description, &item.Price, &item.ImageURL, &item.Available, &item.SortOrder, &item.Active, &item.CreatedAt, &item.UpdatedAt,
		&item.PriceRegular, &item.PriceMedium, &item.PriceLarge, &item.Dietary, &item.PizzaSubcategory, &item.PizzaType, &item.IsSpicy, &item.IsJain, &item.IsNew, &item.NoCrust)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	item.Options, _ = s.GetOptionsByItemID(item.ID)
	return &item, nil
}

func (s *MenuService) GetOptionsByItemID(itemID int) ([]models.MenuItemOption, error) {
	rows, err := database.DB.Query(`
		SELECT id, menu_item_id, name, option_type, price_delta, active, created_at, updated_at
		FROM menu_item_options
		WHERE menu_item_id = $1 AND active = true
	`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var options []models.MenuItemOption
	for rows.Next() {
		var opt models.MenuItemOption
		if err := rows.Scan(&opt.ID, &opt.MenuItemID, &opt.Name, &opt.OptionType, &opt.PriceDelta, &opt.Active, &opt.CreatedAt, &opt.UpdatedAt); err != nil {
			return nil, err
		}
		options = append(options, opt)
	}
	return options, nil
}

func (s *MenuService) CreateCategory(name, description string, sortOrder int) (*models.MenuCategory, error) {
	var cat models.MenuCategory
	err := database.DB.QueryRow(`
		INSERT INTO menu_categories (name, description, sort_order, active)
		VALUES ($1, $2, $3, true)
		RETURNING id, name, description, sort_order, active, created_at, updated_at
	`, name, description, sortOrder).Scan(&cat.ID, &cat.Name, &cat.Description, &cat.SortOrder, &cat.Active, &cat.CreatedAt, &cat.UpdatedAt)
	return &cat, err
}

func (s *MenuService) CreateItem(categoryID int, name, description string, price float64, imageURL string, sortOrder int) (*models.MenuItem, error) {
	var item models.MenuItem
	err := database.DB.QueryRow(`
		INSERT INTO menu_items (category_id, name, description, price, image_url, available, sort_order, active)
		VALUES ($1, $2, $3, $4, $5, true, $6, true)
		RETURNING id, category_id, name, description, price, image_url, available, sort_order, active, created_at, updated_at
	`, categoryID, name, description, price, imageURL, sortOrder).Scan(&item.ID, &item.CategoryID, &item.Name, &item.Description, &item.Price, &item.ImageURL, &item.Available, &item.SortOrder, &item.Active, &item.CreatedAt, &item.UpdatedAt)
	return &item, err
}

func (s *MenuService) UpdateItem(id int, name, description string, price float64, imageURL string, available bool) (*models.MenuItem, error) {
	var item models.MenuItem
	err := database.DB.QueryRow(`
		UPDATE menu_items
		SET name = $2, description = $3, price = $4, image_url = $5, available = $6, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
		RETURNING id, category_id, name, description, price, image_url, available, sort_order, active, created_at, updated_at
	`, id, name, description, price, imageURL, available).Scan(&item.ID, &item.CategoryID, &item.Name, &item.Description, &item.Price, &item.ImageURL, &item.Available, &item.SortOrder, &item.Active, &item.CreatedAt, &item.UpdatedAt)
	return &item, err
}

func (s *MenuService) DeleteItem(id int) error {
	_, err := database.DB.Exec(`DELETE FROM menu_items WHERE id = $1`, id)
	return err
}

type CartService struct{}

func NewCartService() *CartService {
	return &CartService{}
}

func (s *CartService) GetCart(phone string) ([]models.CartItem, error) {
	rows, err := database.DB.Query(`
		SELECT c.id, c.customer_phone, c.menu_item_id, c.quantity, c.unit_price, c.options, c.subtotal, c.created_at, c.updated_at,
		       mi.id, mi.category_id, mi.name, mi.description, mi.price, mi.image_url, mi.available, mi.sort_order, mi.active, mi.created_at, mi.updated_at
		FROM carts c
		JOIN menu_items mi ON c.menu_item_id = mi.id
		WHERE c.customer_phone = $1
		ORDER BY c.created_at
	`, phone)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.CartItem
	for rows.Next() {
		var item models.CartItem
		var mi models.MenuItem
		var optionsJSON []byte
		if err := rows.Scan(&item.ID, &item.CustomerPhone, &item.MenuItemID, &item.Quantity, &item.UnitPrice, &optionsJSON, &item.Subtotal, &item.CreatedAt, &item.UpdatedAt,
			&mi.ID, &mi.CategoryID, &mi.Name, &mi.Description, &mi.Price, &mi.ImageURL, &mi.Available, &mi.SortOrder, &mi.Active, &mi.CreatedAt, &mi.UpdatedAt); err != nil {
			return nil, err
		}
		item.MenuItem = &mi
		json.Unmarshal(optionsJSON, &item.Options)
		items = append(items, item)
	}
	return items, nil
}

func (s *CartService) AddItem(phone string, menuItemID, quantity int, options map[string]interface{}) error {
	// Get menu item price
	var price float64
	err := database.DB.QueryRow(`SELECT price FROM menu_items WHERE id = $1`, menuItemID).Scan(&price)
	if err != nil {
		return err
	}

	optionsJSON, _ := json.Marshal(options)
	subtotal := price * float64(quantity)

	_, err = database.DB.Exec(`
		INSERT INTO carts (customer_phone, menu_item_id, quantity, unit_price, options, subtotal)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (customer_phone, menu_item_id) DO UPDATE SET
			quantity = carts.quantity + EXCLUDED.quantity,
			options = EXCLUDED.options,
			subtotal = carts.unit_price * (carts.quantity + EXCLUDED.quantity),
			updated_at = CURRENT_TIMESTAMP
	`, phone, menuItemID, quantity, price, optionsJSON, subtotal)
	return err
}

func (s *CartService) UpdateQuantity(phone string, cartItemID, quantity int) error {
	if quantity <= 0 {
		return s.RemoveItem(phone, cartItemID)
	}

	var unitPrice float64
	err := database.DB.QueryRow(`SELECT unit_price FROM carts WHERE id = $1 AND customer_phone = $2`, cartItemID, phone).Scan(&unitPrice)
	if err != nil {
		return err
	}

	subtotal := unitPrice * float64(quantity)
	_, err = database.DB.Exec(`
		UPDATE carts SET quantity = $1, subtotal = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $3 AND customer_phone = $4
	`, quantity, subtotal, cartItemID, phone)
	return err
}

func (s *CartService) RemoveItem(phone string, cartItemID int) error {
	_, err := database.DB.Exec(`DELETE FROM carts WHERE id = $1 AND customer_phone = $2`, cartItemID, phone)
	return err
}

func (s *CartService) ClearCart(phone string) error {
	_, err := database.DB.Exec(`DELETE FROM carts WHERE customer_phone = $1`, phone)
	return err
}

func (s *CartService) GetCartTotal(phone string) (float64, error) {
	var total float64
	err := database.DB.QueryRow(`SELECT COALESCE(SUM(subtotal), 0) FROM carts WHERE customer_phone = $1`, phone).Scan(&total)
	return total, err
}

type OrderService struct{}

func NewOrderService() *OrderService {
	return &OrderService{}
}

func (s *OrderService) CreateOrder(order *models.Order) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert order
	err = tx.QueryRow(`
		INSERT INTO orders (order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, created_at, updated_at
	`, order.OrderNumber, order.CustomerName, order.CustomerPhone, order.OrderType, order.Address, order.Landmark, order.PaymentMethod, order.Subtotal, order.DeliveryFee, order.Discount, order.Total, order.Status).Scan(&order.ID, &order.CreatedAt, &order.UpdatedAt)
	if err != nil {
		return err
	}

	// Insert order items
	for _, item := range order.Items {
		optionsJSON, _ := json.Marshal(item.Options)
		_, err = tx.Exec(`
			INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, options, subtotal)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, order.ID, item.MenuItemID, item.Name, item.Quantity, item.UnitPrice, optionsJSON, item.Subtotal)
		if err != nil {
			return err
		}
	}

	// Insert initial order event
	_, err = tx.Exec(`
		INSERT INTO order_events (order_id, event_type, description)
		VALUES ($1, 'created', 'Order created')
	`, order.ID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (s *OrderService) GetOrderByID(id int) (*models.Order, error) {
	var order models.Order
	err := database.DB.QueryRow(`
		SELECT id, order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, created_at, updated_at
		FROM orders WHERE id = $1
	`, id).Scan(&order.ID, &order.OrderNumber, &order.CustomerName, &order.CustomerPhone, &order.OrderType, &order.Address, &order.Landmark, &order.PaymentMethod, &order.Subtotal, &order.DeliveryFee, &order.Discount, &order.Total, &order.Status, &order.CreatedAt, &order.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	// Load order items
	rows, err := database.DB.Query(`
		SELECT id, order_id, menu_item_id, name, quantity, unit_price, options, subtotal, created_at
		FROM order_items WHERE order_id = $1
	`, order.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var item models.OrderItem
		var optionsJSON []byte
		if err := rows.Scan(&item.ID, &item.OrderID, &item.MenuItemID, &item.Name, &item.Quantity, &item.UnitPrice, &optionsJSON, &item.Subtotal, &item.CreatedAt); err != nil {
			return nil, err
		}
		json.Unmarshal(optionsJSON, &item.Options)
		order.Items = append(order.Items, item)
	}

	return &order, nil
}

func (s *OrderService) GetOrdersByPhone(phone string) ([]models.Order, error) {
	rows, err := database.DB.Query(`
		SELECT id, order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, created_at, updated_at
		FROM orders WHERE customer_phone = $1 ORDER BY created_at DESC
	`, phone)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var order models.Order
		if err := rows.Scan(&order.ID, &order.OrderNumber, &order.CustomerName, &order.CustomerPhone, &order.OrderType, &order.Address, &order.Landmark, &order.PaymentMethod, &order.Subtotal, &order.DeliveryFee, &order.Discount, &order.Total, &order.Status, &order.CreatedAt, &order.UpdatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, order)
	}
	return orders, nil
}

func (s *OrderService) UpdateOrderStatus(orderID int, status string) error {
	_, err := database.DB.Exec(`
		UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, status, orderID)
	if err != nil {
		return err
	}

	_, err = database.DB.Exec(`
		INSERT INTO order_events (order_id, event_type, description)
		VALUES ($1, $2, $3)
	`, orderID, status, "Status updated to "+status)
	return err
}

func (s *OrderService) GetAllOrders(limit, offset int) ([]models.Order, error) {
	rows, err := database.DB.Query(`
		SELECT id, order_number, customer_name, customer_phone, order_type, address, landmark, payment_method, subtotal, delivery_fee, discount, total, status, created_at, updated_at
		FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var order models.Order
		if err := rows.Scan(&order.ID, &order.OrderNumber, &order.CustomerName, &order.CustomerPhone, &order.OrderType, &order.Address, &order.Landmark, &order.PaymentMethod, &order.Subtotal, &order.DeliveryFee, &order.Discount, &order.Total, &order.Status, &order.CreatedAt, &order.UpdatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, order)
	}
	return orders, nil
}

type CustomerStateService struct{}

func NewCustomerStateService() *CustomerStateService {
	return &CustomerStateService{}
}

func (s *CustomerStateService) GetState(phone string) (*models.CustomerState, error) {
	var state models.CustomerState
	err := database.DB.QueryRow(`
		SELECT id, phone, state, context, current_cart_id, current_order_id, updated_at
		FROM customer_states WHERE phone = $1
	`, phone).Scan(&state.ID, &state.Phone, &state.State, &state.Context, &state.CurrentCartID, &state.CurrentOrderID, &state.UpdatedAt)
	if err == sql.ErrNoRows {
		// Create new state
		return s.CreateState(phone)
	}
	return &state, err
}

func (s *CustomerStateService) CreateState(phone string) (*models.CustomerState, error) {
	var state models.CustomerState
	err := database.DB.QueryRow(`
		INSERT INTO customer_states (phone, state, context)
		VALUES ($1, 'START', '{}')
		RETURNING id, phone, state, context, current_cart_id, current_order_id, updated_at
	`, phone).Scan(&state.ID, &state.Phone, &state.State, &state.Context, &state.CurrentCartID, &state.CurrentOrderID, &state.UpdatedAt)
	return &state, err
}

func (s *CustomerStateService) UpdateState(phone, newState string, context map[string]interface{}) error {
	contextJSON, _ := json.Marshal(context)
	_, err := database.DB.Exec(`
		INSERT INTO customer_states (phone, state, context, updated_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
		ON CONFLICT (phone) DO UPDATE SET
			state = EXCLUDED.state,
			context = EXCLUDED.context,
			updated_at = EXCLUDED.updated_at
	`, phone, newState, contextJSON)
	return err
}

func (s *CustomerStateService) UpdateContext(phone string, context map[string]interface{}) error {
	contextJSON, _ := json.Marshal(context)
	_, err := database.DB.Exec(`
		UPDATE customer_states SET context = $1, updated_at = CURRENT_TIMESTAMP WHERE phone = $2
	`, contextJSON, phone)
	return err
}

type RestaurantConfigService struct{}

func NewRestaurantConfigService() *RestaurantConfigService {
	return &RestaurantConfigService{}
}

func (s *RestaurantConfigService) GetConfig() (*models.RestaurantConfig, error) {
	var config models.RestaurantConfig
	err := database.DB.QueryRow(`
		SELECT id, name, phone, address, map_url, opening_hours, delivery_area, payment_info, support_phone, created_at, updated_at
		FROM restaurant_config LIMIT 1
	`).Scan(&config.ID, &config.Name, &config.Phone, &config.Address, &config.MapURL, &config.OpeningHours, &config.DeliveryArea, &config.PaymentInfo, &config.SupportPhone, &config.CreatedAt, &config.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &config, err
}

// ============================================================
// Website catalog API support (Phase 2 / Milestone 1).
// These methods read the extended menu schema (slugs, size
// pricing, dietary flags). Existing bot-facing methods above
// are intentionally left untouched.
// ============================================================

const websiteItemColumns = `
	id, category_id, name, COALESCE(slug, ''), COALESCE(description, ''), price,
	COALESCE(image_url, ''), available, sort_order, active, created_at, updated_at,
	COALESCE(dietary, ''), COALESCE(pizza_subcategory, ''), COALESCE(pizza_type, ''),
	COALESCE(is_spicy, false), COALESCE(is_jain, false), COALESCE(is_new, false),
	COALESCE(no_crust, false),
	price_regular, price_medium, price_large
`

func scanWebsiteItem(scanner interface {
	Scan(dest ...interface{}) error
}) (models.MenuItem, error) {
	var item models.MenuItem
	err := scanner.Scan(
		&item.ID, &item.CategoryID, &item.Name, &item.Slug, &item.Description, &item.Price,
		&item.ImageURL, &item.Available, &item.SortOrder, &item.Active, &item.CreatedAt, &item.UpdatedAt,
		&item.Dietary, &item.PizzaSubcategory, &item.PizzaType,
		&item.IsSpicy, &item.IsJain, &item.IsNew, &item.NoCrust,
		&item.PriceRegular, &item.PriceMedium, &item.PriceLarge,
	)
	if err != nil {
		return item, err
	}
	item.BuildPriceBySize()
	return item, nil
}

// GetCategoriesWithSlug returns all active categories ordered for the website.
func (s *MenuService) GetCategoriesWithSlug() ([]models.MenuCategory, error) {
	rows, err := database.DB.Query(`
		SELECT id, name, COALESCE(slug, ''), COALESCE(description, ''), sort_order, active, created_at, updated_at
		FROM menu_categories
		WHERE active = true
		ORDER BY sort_order, name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	categories := []models.MenuCategory{}
	for rows.Next() {
		var cat models.MenuCategory
		if err := rows.Scan(&cat.ID, &cat.Name, &cat.Slug, &cat.Description, &cat.SortOrder, &cat.Active, &cat.CreatedAt, &cat.UpdatedAt); err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}
	return categories, rows.Err()
}

// GetAllActiveItems returns every active menu item for the website catalog.
func (s *MenuService) GetAllActiveItems() ([]models.MenuItem, error) {
	rows, err := database.DB.Query(`
		SELECT ` + websiteItemColumns + `
		FROM menu_items
		WHERE active = true AND available = true
		ORDER BY category_id, sort_order, name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.MenuItem{}
	for rows.Next() {
		item, err := scanWebsiteItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetItemByIdentifier resolves an item by numeric ID or by slug.
func (s *MenuService) GetItemByIdentifier(identifier string) (*models.MenuItem, error) {
	query := `SELECT ` + websiteItemColumns + ` FROM menu_items WHERE active = true AND `
	var arg string
	if isNumericID(identifier) {
		query += `id = $1 AND available = true`
		arg = identifier
	} else {
		query += `slug = $1`
		arg = identifier
	}

	row := database.DB.QueryRow(query, arg)
	item, err := scanWebsiteItem(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func isNumericID(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// CrustInfo is the website/WhatsApp-facing crust catalog row.
type CrustInfo struct {
	Slug        string  `json:"slug"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Regular     float64 `json:"regular"`
	Medium      float64 `json:"medium"`
	Large       float64 `json:"large"`
}

// GetActiveCrusts returns the backend-owned crust catalog (Phase 3).
func (s *MenuService) GetActiveCrusts() ([]CrustInfo, error) {
	rows, err := database.DB.Query(`
		SELECT slug, name, COALESCE(description,''),
		       COALESCE(price_regular,0), COALESCE(price_medium,0), COALESCE(price_large,0)
		FROM menu_crusts WHERE active = true ORDER BY sort_order
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []CrustInfo{}
	for rows.Next() {
		var c CrustInfo
		if err := rows.Scan(&c.Slug, &c.Name, &c.Description, &c.Regular, &c.Medium, &c.Large); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetCartDebug returns the WhatsApp cart lines for admin diagnostics.
func (s *MenuService) GetCartDebug(phone string) ([]WACartLine, error) {
	return GetWACart(phone)
}
