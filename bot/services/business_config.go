package services

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/services/currency"
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
	Inches string `json:"inches,omitempty"`
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
	TaxLabel       string            `json:"tax_label"`
	// WhatsApp browsing experience ( pointers: nil = default ).
	WhatsappLists  *bool  `json:"whatsapp_lists,omitempty"`
	WhatsappPhotos *bool  `json:"whatsapp_photos,omitempty"`
	PublicBaseURL  string `json:"public_base_url"`
}

// CurrencySymbol returns the currency symbol for the given restaurant.
// Derived from the restaurant's authoritative currency code.
func (c *BusinessConfig) CurrencySymbol(restaurantID int) string {
	return currency.Symbol(RestaurantCurrency(restaurantID))
}

// CurrencyCode returns the ISO-4217 currency code for the given restaurant.
func (c *BusinessConfig) CurrencyCode(restaurantID int) string {
	return RestaurantCurrency(restaurantID)
}

// CurrencyLocale returns the formatting locale for the given restaurant.
func (c *BusinessConfig) CurrencyLocale(restaurantID int) string {
	return currency.Locale(RestaurantCurrency(restaurantID))
}

// CurrencyMinorUnit returns the decimal places for the given restaurant.
func (c *BusinessConfig) CurrencyMinorUnit(restaurantID int) int {
	return currency.MinorUnit(RestaurantCurrency(restaurantID))
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
var bizCfgLoadedAt = map[int]time.Time{}
var bizCacheMu sync.RWMutex

// bizConfigCacheTTL bounds how long a tenant's config is served from memory
// before it is re-read from PostgreSQL. With multiple bot replicas, an admin
// config save only invalidates the local process immediately; a short TTL
// ensures the other replicas converge within this window.
// Env BIZ_CONFIG_CACHE_TTL_SECS (default 60, 0 = no expiry / legacy behaviour).
func bizConfigCacheTTL() time.Duration {
	secs, err := strconv.Atoi(os.Getenv("BIZ_CONFIG_CACHE_TTL_SECS"))
	if err != nil || secs < 0 || secs > 86400 {
		return 60 * time.Second
	}
	return time.Duration(secs) * time.Second
}

// cacheEntryFresh reports whether a cached entry for rid exists and is still
// within its TTL. Caller must hold at least bizCacheMu.RLock.
func cacheEntryFresh(rid int) (*BusinessConfig, bool) {
	cached, ok := bizCfgCache[rid]
	if !ok {
		return nil, false
	}
	ttl := bizConfigCacheTTL()
	if ttl > 0 {
		loaded, ok := bizCfgLoadedAt[rid]
		if !ok || time.Since(loaded) > ttl {
			return nil, false
		}
	}
	return cached, true
}

// setCacheEntry stores a config with its load timestamp.
func setCacheEntry(rid int, cfg *BusinessConfig) {
	bizCfgCache[rid] = cfg
	bizCfgLoadedAt[rid] = time.Now()
}

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
	// fast path cache (with TTL)
	bizCacheMu.RLock()
	cached, fresh := cacheEntryFresh(rid)
	bizCacheMu.RUnlock()
	if fresh {
		// still return copy to prevent mutation
		out := *cached
		return &out
	}

	var raw []byte
	err := database.DB.QueryRow(
		`SELECT value::text FROM site_settings WHERE key = 'bot_config' AND restaurant_id = $1`,
		rid,
	).Scan(&raw)
	if err != nil {
		log.Printf("[BusinessConfig] failed to load from DB: %v (using defaults)", err)
		cfg := defaultBusinessConfig()
		bizCacheMu.Lock()
		setCacheEntry(rid, cfg)
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
		setCacheEntry(rid, cfg2)
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
	setCacheEntry(rid, &cfg)
	bizCacheMu.Unlock()
	if rid == ResolveRestaurant(0) {
		bizCfgMu.Lock()
		globalBizCfg = &cfg
		bizCfgMu.Unlock()
	}
	out := cfg
	return &out
}

// LoadBusinessConfigForEx is LoadBusinessConfigFor plus provenance: "db"
// when a stored row parsed, "fallback-default" when no row exists,
// "fallback-invalid" on parse failure, "fallback-offline" without a DB.
// Callers that render or persist config must surface the source.
func LoadBusinessConfigForEx(restaurantID int) (*BusinessConfig, ConfigSource) {
	if database.DB == nil {
		return defaultBusinessConfig(), ConfigSourceFallbackOffline
	}
	rid := ResolveRestaurant(restaurantID)
	var raw []byte
	if err := database.DB.QueryRow(
		`SELECT value::text FROM site_settings WHERE key = 'bot_config' AND restaurant_id = $1`,
		rid).Scan(&raw); err != nil {
		return LoadBusinessConfigFor(restaurantID), ConfigSourceFallbackDefault
	}
	var probe BusinessConfig
	if err := json.Unmarshal(raw, &probe); err != nil {
		return LoadBusinessConfigFor(restaurantID), ConfigSourceFallbackInvalid
	}
	return LoadBusinessConfigFor(restaurantID), ConfigSourceDB
}

// GetBusinessConfigFor reads one restaurant's config without touching
// the process cache (admin paths).
func GetBusinessConfigFor(restaurantID int) *BusinessConfig {
	return LoadBusinessConfigFor(restaurantID)
}

func GetBizConfig() *BusinessConfig {
	// Route through the tenant-aware cache so the default tenant's config
	// also benefits from TTL refresh and stays in sync across replicas.
	return LoadBusinessConfigFor(0)
}

func GetBizConfigFor(restaurantID int) *BusinessConfig {
	if restaurantID == 0 {
		return GetBizConfig()
	}
	bizCacheMu.RLock()
	c, fresh := cacheEntryFresh(restaurantID)
	bizCacheMu.RUnlock()
	if fresh {
		out := *c
		return &out
	}
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
	delete(bizCfgLoadedAt, restaurantID)
	bizCacheMu.Unlock()
}

// SaveBusinessConfig persists the config to DB and refreshes cache.
func SaveBusinessConfig(cfg *BusinessConfig, restaurantID int) error {
	if cfg.DeliveryFee < 0 || cfg.DeliveryFee > 100000 {
		return fmt.Errorf("delivery fee must be 0..100000")
	}
	if cfg.MinOrderAmount < 0 || cfg.MinOrderAmount > 100000 {
		return fmt.Errorf("min order amount must be 0..100000")
	}
	if len(cfg.OrderPrefix) > 20 {
		return fmt.Errorf("order prefix too long (max 20)")
	}
	if len(cfg.PublicBaseURL) > 500 {
		return fmt.Errorf("public base URL too long (max 500)")
	}
	if len(cfg.CategoryIcons) > 100 {
		return fmt.Errorf("too many category icons (max 100)")
	}
	for k, v := range cfg.CategoryIcons {
		if len(k) > 100 || len(v) > 500 {
			return fmt.Errorf("category icon key/value too long")
		}
	}
	if len(cfg.Sizes) > 20 {
		return fmt.Errorf("too many sizes (max 20)")
	}
	if len(cfg.PaymentMethods) > 20 {
		return fmt.Errorf("too many payment methods (max 20)")
	}
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
	// Store copies so callers cannot mutate the cached config through
	// the pointer they passed in (cross-request corruption).
	cfgCopy := *cfg
	bizCacheMu.Lock()
	setCacheEntry(rid, &cfgCopy)
	bizCacheMu.Unlock()
	if rid == ResolveRestaurant(0) {
		globalCopy := *cfg
		bizCfgMu.Lock()
		globalBizCfg = &globalCopy
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
			{Key: "regular", Label: "Regular", Active: true, Inches: "7 Inches"},
			{Key: "medium", Label: "Medium", Active: true, Inches: "10 Inches"},
			{Key: "large", Label: "Large", Active: true, Inches: "13 Inches"},
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
		TaxLabel:       "taxes included",
	}
}
