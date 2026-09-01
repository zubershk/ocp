package services

import (
	"encoding/json"
	"log"
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
	OrderPrefix     string            `json:"order_prefix"`
	DeliveryFee     float64           `json:"delivery_fee"`
	MinOrderAmount  float64           `json:"min_order_amount"`
	Sizes           []SizeOption      `json:"sizes"`
	PaymentMethods  []PaymentMethod   `json:"payment_methods"`
	CategoryIcons   map[string]string `json:"category_icons"`
	KitchenHours    string            `json:"kitchen_hours"`
	DeliveryHours   string            `json:"delivery_hours"`
	BusinessType    string            `json:"business_type"`
	CurrencySymbol  string            `json:"currency_symbol"`
	TaxLabel        string            `json:"tax_label"`
}

var globalBizCfg *BusinessConfig
var bizCfgMu sync.RWMutex

func LoadBusinessConfig() *BusinessConfig {
	bizCfgMu.Lock()
	defer bizCfgMu.Unlock()

	var raw []byte
	err := database.DB.QueryRow(
		`SELECT value::text FROM site_settings WHERE key = 'bot_config'`,
	).Scan(&raw)
	if err != nil {
		log.Printf("[BusinessConfig] failed to load from DB: %v (using defaults)", err)
		globalBizCfg = defaultBusinessConfig()
		return globalBizCfg
	}

	var cfg BusinessConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		log.Printf("[BusinessConfig] JSON parse error: %v (using defaults)", err)
		globalBizCfg = defaultBusinessConfig()
		return globalBizCfg
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

	globalBizCfg = &cfg
	return globalBizCfg
}

func GetBizConfig() *BusinessConfig {
	bizCfgMu.RLock()
	defer bizCfgMu.RUnlock()
	if globalBizCfg == nil {
		return defaultBusinessConfig()
	}
	return globalBizCfg
}

// ReloadBizConfig refreshes the in-memory config from DB.
func ReloadBizConfig() {
	LoadBusinessConfig()
}

// SaveBusinessConfig persists the config to DB and refreshes cache.
func SaveBusinessConfig(cfg *BusinessConfig) error {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = database.DB.Exec(
		`UPDATE site_settings SET value = $1::jsonb, updated_at = NOW() WHERE key = 'bot_config'`,
		string(raw),
	)
	if err != nil {
		return err
	}
	bizCfgMu.Lock()
	globalBizCfg = cfg
	bizCfgMu.Unlock()
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
