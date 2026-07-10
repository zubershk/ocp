package models

import (
	"time"
)

type MenuCategory struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug,omitempty"`
	Description string    `json:"description"`
	SortOrder   int       `json:"sort_order"`
	Active      bool      `json:"active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type MenuItem struct {
	ID               int                `json:"id"`
	CategoryID       int                `json:"category_id"`
	Name             string             `json:"name"`
	Slug             string             `json:"slug,omitempty"`
	Description      string             `json:"description"`
	Price            float64            `json:"price"`
	ImageURL         string             `json:"image_url"`
	Available        bool               `json:"available"`
	SortOrder        int                `json:"sort_order"`
	Active           bool               `json:"active"`
	CreatedAt        time.Time          `json:"created_at"`
	UpdatedAt        time.Time          `json:"updated_at"`
	Category         *MenuCategory      `json:"category,omitempty"`
	Options          []MenuItemOption   `json:"options,omitempty"`
	Dietary          string             `json:"dietary,omitempty"`
	PizzaSubcategory string             `json:"pizza_subcategory,omitempty"`
	PizzaType        string             `json:"pizza_type,omitempty"`
	IsSpicy          bool               `json:"is_spicy,omitempty"`
	IsJain           bool               `json:"is_jain,omitempty"`
	IsNew            bool               `json:"is_new,omitempty"`
	PriceRegular     *float64           `json:"-"`
	PriceMedium      *float64           `json:"-"`
	PriceLarge       *float64           `json:"-"`
	PriceBySize      map[string]float64 `json:"price_by_size,omitempty"`
}

// PriceBySizeFor returns the effective price for a pizza size,
// falling back to the flat Price when no size pricing exists.
func (m *MenuItem) PriceBySizeFor(size string) float64 {
	if m.PriceBySize != nil {
		if v, ok := m.PriceBySize[size]; ok && v > 0 {
			return v
		}
	}
	return m.Price
}

// BuildPriceBySize constructs the JSON-friendly price_by_size map
// from the nullable per-size columns.
func (m *MenuItem) BuildPriceBySize() {
	sizes := map[string]*float64{
		"regular": m.PriceRegular,
		"medium":  m.PriceMedium,
		"large":   m.PriceLarge,
	}
	var bySize map[string]float64
	for size, ptr := range sizes {
		if ptr != nil && *ptr > 0 {
			if bySize == nil {
				bySize = make(map[string]float64, 3)
			}
			bySize[size] = *ptr
		}
	}
	m.PriceBySize = bySize
}

type MenuItemOption struct {
	ID         int       `json:"id"`
	MenuItemID int       `json:"menu_item_id"`
	Name       string    `json:"name"`
	OptionType string    `json:"option_type"` // single, multiple
	PriceDelta float64   `json:"price_delta"`
	Active     bool      `json:"active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type CartItem struct {
	ID            int       `json:"id"`
	CustomerPhone string    `json:"customer_phone"`
	MenuItemID    int       `json:"menu_item_id"`
	Quantity      int       `json:"quantity"`
	UnitPrice     float64   `json:"unit_price"`
	Options       string    `json:"options"` // JSON string of selected options
	Subtotal      float64   `json:"subtotal"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	MenuItem      *MenuItem `json:"menu_item,omitempty"`
}

type Order struct {
	ID            int         `json:"id"`
	OrderNumber   string      `json:"order_number"`
	CustomerName  string      `json:"customer_name"`
	CustomerPhone string      `json:"customer_phone"`
	OrderType     string      `json:"order_type"` // delivery, pickup
	Address       string      `json:"address"`
	Landmark      string      `json:"landmark"`
	PaymentMethod string      `json:"payment_method"` // cash, upi, online
	Subtotal      float64     `json:"subtotal"`
	DeliveryFee   float64     `json:"delivery_fee"`
	Discount      float64     `json:"discount"`
	Total         float64     `json:"total"`
	Status        string      `json:"status"` // pending, confirmed, preparing, ready, out_for_delivery, completed, cancelled
	CreatedAt     time.Time   `json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
	Items         []OrderItem `json:"items,omitempty"`
}

type OrderItem struct {
	ID         int       `json:"id"`
	OrderID    int       `json:"order_id"`
	MenuItemID int       `json:"menu_item_id"`
	Name       string    `json:"name"`
	Quantity   int       `json:"quantity"`
	UnitPrice  float64   `json:"unit_price"`
	Options    string    `json:"options"` // JSON string
	Subtotal   float64   `json:"subtotal"`
	CreatedAt  time.Time `json:"created_at"`
}

type OrderEvent struct {
	ID          int       `json:"id"`
	OrderID     int       `json:"order_id"`
	EventType   string    `json:"event_type"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

type CustomerState struct {
	ID             int       `json:"id"`
	Phone          string    `json:"phone"`
	State          string    `json:"state"`   // START, MAIN_MENU, BROWSING_MENU, SELECTING_ITEM, CUSTOMIZING_ITEM, CART, DELIVERY_TYPE, CUSTOMER_NAME, DELIVERY_ADDRESS, LANDMARK, PAYMENT_METHOD, ORDER_CONFIRMATION, ORDER_PLACED, HUMAN_SUPPORT
	Context        string    `json:"context"` // JSON string for additional context
	CurrentCartID  int       `json:"current_cart_id"`
	CurrentOrderID int       `json:"current_order_id"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type RestaurantConfig struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	Phone        string    `json:"phone"`
	Address      string    `json:"address"`
	MapURL       string    `json:"map_url"`
	OpeningHours string    `json:"opening_hours"` // JSON string
	DeliveryArea string    `json:"delivery_area"` // JSON string
	PaymentInfo  string    `json:"payment_info"`  // JSON string
	SupportPhone string    `json:"support_phone"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ProcessedMessage struct {
	ID        string    `json:"id"`
	MessageID string    `json:"message_id"`
	CreatedAt time.Time `json:"created_at"`
}
