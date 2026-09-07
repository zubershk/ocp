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
	NoCrust          bool               `json:"no_crust,omitempty"`
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
	OrderType     string      `json:"order_type"` // dine_in, takeaway, delivery, online, whatsapp
	Address       string      `json:"address"`
	Landmark      string      `json:"landmark"`
	PaymentMethod string      `json:"payment_method"` // cash, upi, online
	Subtotal      float64     `json:"subtotal"`
	DeliveryFee   float64     `json:"delivery_fee"`
	Discount      float64     `json:"discount"`
	Total         float64     `json:"total"`
	Status        string      `json:"status"` // pending, confirmed, preparing, ready, out_for_delivery, completed, cancelled, held
	CreatedAt     time.Time   `json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
	Items         []OrderItem `json:"items,omitempty"`
	RestaurantID  int         `json:"restaurant_id,omitempty"`
	OutletID      int         `json:"outlet_id,omitempty"`

	// Phase 2 (POS) fields.
	Source     string  `json:"source,omitempty"`      // pos, website, whatsapp, qr
	TableID    int     `json:"table_id,omitempty"`    // dine-in table; 0 = none
	DiscountID int     `json:"discount_id,omitempty"` // applied discount; 0 = none
	TaxAmount  float64 `json:"tax_amount,omitempty"`  // computed tax (0 = tax-inclusive pricing)
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
	// Display conveniences (populated by GetOrderByID / loadOrderLines).
	Size      string  `json:"size,omitempty"`
	Crust     string  `json:"crust,omitempty"`
	LineTotal float64 `json:"line_total"`
}

type OrderEvent struct {
	ID          int       `json:"id"`
	OrderID     int       `json:"order_id"`
	EventType   string    `json:"event_type"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

// Table is a physical restaurant table (Phase 2 POS).
// Status is stored for cheap floor rendering; the POS reconciles
// 'occupied' from open orders at query time.
type Table struct {
	ID           int       `json:"id"`
	OutletID     int       `json:"outlet_id"`
	RestaurantID int       `json:"restaurant_id"`
	Name         string    `json:"name"`
	Capacity     int       `json:"capacity"`
	Status       string    `json:"status"` // free, occupied, reserved, dirty
	Position     int       `json:"position"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// OrderPayment is one payment row against an order (Phase 2 POS).
// Payments are never deleted; refunds are negative-amount rows
// linked via RefundOf. Sum(payments) is the amount actually paid.
type OrderPayment struct {
	ID           int       `json:"id"`
	OrderID      int       `json:"order_id"`
	RestaurantID int       `json:"restaurant_id"`
	OutletID     int       `json:"outlet_id"`
	Method       string    `json:"method"` // cash, upi, card, online, other
	Amount       float64   `json:"amount"` // signed; refunds are negative
	Tendered     float64   `json:"tendered"`
	ChangeDue    float64   `json:"change_due"`
	Reference    string    `json:"reference"`
	RefundOf     int       `json:"refund_of,omitempty"`
	ReceivedBy   int       `json:"received_by,omitempty"` // cashier user id
	CreatedAt    time.Time `json:"created_at"`
}

// Discount is an order-header discount (Phase 2 POS).
// Type: "percent" (Value = 0-100) or "flat" (absolute amount).
// Code "" = open/manual discount applied by a cashier.
type Discount struct {
	ID           int        `json:"id"`
	RestaurantID int        `json:"restaurant_id"`
	Name         string     `json:"name"`
	Code         string     `json:"code"`
	Type         string     `json:"type"` // percent, flat
	Value        float64    `json:"value"`
	Active       bool       `json:"active"`
	StartsAt     *time.Time `json:"starts_at,omitempty"`
	EndsAt       *time.Time `json:"ends_at,omitempty"`
	MinSubtotal  float64    `json:"min_subtotal"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type Review struct {
	ID            int       `json:"id"`
	OrderID       int       `json:"order_id"`
	ItemSlug      string    `json:"item_slug"`
	CustomerName  string    `json:"customer_name"`
	CustomerPhone string    `json:"customer_phone,omitempty"`
	Rating        int       `json:"rating"`
	Title         string    `json:"title"`
	Body          string    `json:"body"`
	Approved      bool      `json:"approved"`
	CreatedAt     time.Time `json:"created_at"`
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
