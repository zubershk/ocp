package services

import (
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Business Configuration Service
// Loads all business-specific settings from site_settings.bot_config.
// Makes sizes, payment methods, category icons, delivery fee,
// order prefix, and other settings fully configurable via admin UI.
// ------------------------------------------------------------------

type SizeOption struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Active bool   `json:"active"`
}

type PaymentMethod struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Icon   string `json:"icon"`
	Active bool   `json:"active"`
}

type BusinessConfig struct {
	OrderPrefix    string            `json:"order_prefix"`
	DeliveryFee    float64           `json:"delivery_fee"`
	MinOrderAmount float64           `json:"min_order_amount"`
	Sizes          []SizeOption      `json:"sizes"`
	PaymentMethods []PaymentMethod   `json:"payment_methods"`
	CategoryIcons  map[string]string `json:"category_icons"`
	KitchenHours   string            `json:"kitchen_hours"`
	DeliveryHours  string            `json:"delivery_hours"`
	BusinessType   string            `json:"business_type"`
	CurrencySymbol string            `json:"currency_symbol"`
	TaxLabel       string            `json:"tax_label"`
	// WhatsApp browsing experience ( pointers: nil = default ).
	WhatsappLists  *bool  `json:"whatsapp_lists,omitempty"`
	WhatsappPhotos *bool  `json:"whatsapp_photos,omitempty"`
	PublicBaseURL  string `json:"public_base_url"`
}

// UseWhatsAppLists reports whether browse lists render as native
// WhatsApp list messages instead of paginated reply buttons.
func (c *BusinessConfig) UseWhatsAppLists() bool {
	if os.Getenv("WA_LISTS") == "1" {
		return true
	}
	return c != nil && c.WhatsappLists != nil && *c.WhatsappLists
}

// UseWhatsAppPhotos reports whether item photos are attached to
// WhatsApp messages. Defaults to true.
func (c *BusinessConfig) UseWhatsAppPhotos() bool {
	return c == nil || c.WhatsappPhotos == nil || *c.WhatsappPhotos
}

// GetPublicBaseURL returns the admin-configured base URL for turning
// relative /uploads paths into absolute WhatsApp-fetchable URLs,
// falling back to the PUBLIC_BASE_URL environment variable.
func (c *BusinessConfig) GetPublicBaseURL() string {
	if c != nil && strings.TrimSpace(c.PublicBaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(c.PublicBaseURL), "/")
	}
	return strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/")
}

var globalBizCfg *BusinessConfig
var bizCfgMu sync.RWMutex
var bizCfgCache = map[int]*BusinessConfig{}
var bizCacheMu sync.RWMutex

func LoadBusinessConfig() *BusinessConfig {
	return LoadBusinessConfigFor(0)
}

// LoadBusinessConfigFor loads one restaurant's config (0 = default).
// Per-tenant LRU-style map cache (bounded by restaurant count, not unbounded).
func LoadBusinessConfigFor(restaurantID int) *BusinessConfig {
	if database.DB == nil {
		return defaultBusinessConfig()
	}
	rid := ResolveRestaurant(restaurantID)
	// fast path cache
	bizCacheMu.RLock()
	if cached, ok := bizCfgCache[rid]; ok {
		bizCacheMu.RUnlock()
		// still return copy to prevent mutation
		out := *cached
		return &out
	}
	bizCacheMu.RUnlock()

	var raw []byte
	err := database.DB.QueryRow(
		`SELECT value::text FROM site_settings WHERE key = 'bot_config' AND restaurant_id = $1`,
		rid,
	).Scan(&raw)
	if err != nil {
		log.Printf("[BusinessConfig] failed to load from DB: %v (using defaults)", err)
		cfg := defaultBusinessConfig()
		bizCacheMu.Lock()
		bizCfgCache[rid] = cfg
		bizCacheMu.Unlock()
		if rid == ResolveRestaurant(0) {
			bizCfgMu.Lock()
			globalBizCfg = cfg
			bizCfgMu.Unlock()
		}
		return cfg
	}

	var cfg BusinessConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		log.Printf("[BusinessConfig] JSON parse error: %v (using defaults)", err)
		cfg2 := defaultBusinessConfig()
		bizCacheMu.Lock()
		bizCfgCache[rid] = cfg2
		bizCacheMu.Unlock()
		if rid == ResolveRestaurant(0) {
			bizCfgMu.Lock()
			globalBizCfg = cfg2
			bizCfgMu.Unlock()
		}
		return cfg2
	}

	// Apply defaults for empty fields
	if cfg.OrderPrefix == "" {
		cfg.OrderPrefix = "ORD"
	}
	if cfg.CurrencySymbol == "" {
		cfg.CurrencySymbol = "₹"
	}
	if cfg.BusinessType == "" {
		cfg.BusinessType = "restaurant"
	}
	if cfg.KitchenHours == "" {
		cfg.KitchenHours = "11 AM - 11 PM"
	}
	if cfg.DeliveryHours == "" {
		cfg.DeliveryHours = "11 AM - 4 AM"
	}
	if cfg.TaxLabel == "" {
		cfg.TaxLabel = "taxes included"
	}
	if len(cfg.Sizes) == 0 {
		cfg.Sizes = defaultBusinessConfig().Sizes
	}
	if len(cfg.PaymentMethods) == 0 {
		cfg.PaymentMethods = defaultBusinessConfig().PaymentMethods
	}
	if cfg.CategoryIcons == nil {
		cfg.CategoryIcons = defaultBusinessConfig().CategoryIcons
	}

	bizCacheMu.Lock()
	bizCfgCache[rid] = &cfg
	bizCacheMu.Unlock()
	if rid == ResolveRestaurant(0) {
		bizCfgMu.Lock()
		globalBizCfg = &cfg
		bizCfgMu.Unlock()
	}
	out := cfg
	return &out
}

// GetBusinessConfigFor reads one restaurant's config without touching
// the process cache (admin paths).
func GetBusinessConfigFor(restaurantID int) *BusinessConfig {
	return LoadBusinessConfigFor(restaurantID)
}

func GetBizConfig() *BusinessConfig {
	bizCfgMu.RLock()
	defer bizCfgMu.RUnlock()
	if globalBizCfg == nil {
		return defaultBusinessConfig()
	}
	return globalBizCfg
}

func GetBizConfigFor(restaurantID int) *BusinessConfig {
	if restaurantID == 0 {
		return GetBizConfig()
	}
	bizCacheMu.RLock()
	if c, ok := bizCfgCache[restaurantID]; ok {
		bizCacheMu.RUnlock()
		out := *c
		return &out
	}
	bizCacheMu.RUnlock()
	return LoadBusinessConfigFor(restaurantID)
}

// ReloadBizConfig refreshes the in-memory config from DB.
func ReloadBizConfig() {
	LoadBusinessConfig()
}

// InvalidateBizCache clears per-tenant cache (for tests).
func InvalidateBizCache(restaurantID int) {
	bizCacheMu.Lock()
	delete(bizCfgCache, restaurantID)
	bizCacheMu.Unlock()
}

// SaveBusinessConfig persists the config to DB and refreshes cache.
func SaveBusinessConfig(cfg *BusinessConfig, restaurantID int) error {
	rid := ResolveRestaurant(restaurantID)
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	// upsert rather than pure UPDATE so fresh tenant bootstraps don't 404
	_, err = database.DB.Exec(
		`INSERT INTO site_settings (key, value, restaurant_id) VALUES ('bot_config', $1::jsonb, $2)
		 ON CONFLICT (key, restaurant_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
		string(raw), rid,
	)
	if err != nil {
		return err
	}
	bizCacheMu.Lock()
	bizCfgCache[rid] = cfg
	bizCacheMu.Unlock()
	if rid == ResolveRestaurant(0) {
		bizCfgMu.Lock()
		globalBizCfg = cfg
		bizCfgMu.Unlock()
	}
	return nil
}

// GetValidSizes returns the list of active size keys.
func (c *BusinessConfig) GetValidSizes() map[string]bool {
	m := make(map[string]bool)
	for _, s := range c.Sizes {
		if s.Active {
			m[s.Key] = true
		}
	}
	return m
}

// GetValidPaymentMethods returns the list of active payment method keys.
func (c *BusinessConfig) GetValidPaymentMethods() map[string]bool {
	m := make(map[string]bool)
	for _, p := range c.PaymentMethods {
		if p.Active {
			m[p.Key] = true
		}
	}
	return m
}

// GetCategoryIcon returns the icon for a category slug, or the default.
func (c *BusinessConfig) GetCategoryIcon(slug string) string {
	if icon, ok := c.CategoryIcons[slug]; ok {
		return icon
	}
	if icon, ok := c.CategoryIcons["default"]; ok {
		return icon
	}
	return "🍽️"
}

// GetSizeLabel returns the display label for a size key.
func (c *BusinessConfig) GetSizeLabel(key string) string {
	for _, s := range c.Sizes {
		if s.Key == key {
			return s.Label
		}
	}
	return key
}

// GetPaymentLabel returns the display label for a payment method key.
func (c *BusinessConfig) GetPaymentLabel(key string) string {
	for _, p := range c.PaymentMethods {
		if p.Key == key {
			return p.Label
		}
	}
	return key
}

func defaultBusinessConfig() *BusinessConfig {
	return &BusinessConfig{
		OrderPrefix:    "ORD",
		DeliveryFee:    0,
		MinOrderAmount: 0,
		Sizes: []SizeOption{
			{Key: "regular", Label: "Regular", Active: true},
			{Key: "medium", Label: "Medium", Active: true},
			{Key: "large", Label: "Large", Active: true},
		},
		PaymentMethods: []PaymentMethod{
			{Key: "cod", Label: "Cash on Delivery", Icon: "cash", Active: true},
			{Key: "upi", Label: "UPI", Icon: "phone", Active: true},
			{Key: "online", Label: "Online Payment", Icon: "card", Active: true},
		},
		CategoryIcons:  map[string]string{"default": "🍽️"},
		KitchenHours:   "11 AM - 11 PM",
		DeliveryHours:  "11 AM - 4 AM",
		BusinessType:   "restaurant",
		CurrencySymbol: "₹",
		TaxLabel:       "taxes included",
	}
}
