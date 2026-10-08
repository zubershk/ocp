package services

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sync"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/services/currency"
)

// ------------------------------------------------------------------
// POS Configuration (Admin-configurable foundation — no behavior yet)
// Mirrors business_config.go cache pattern, but scoped to POS only.
// Future: ResolvePOSConfig(restaurantID, outletID int) will merge
// restaurant config + outlet overrides; today it returns restaurant only.
// ------------------------------------------------------------------

type POSOrderType struct {
	Key            string `json:"key"`
	Label          string `json:"label"`
	Short          string `json:"short"`
	Icon           string `json:"icon"`
	Active         bool   `json:"active"`
	RequiresTable  bool   `json:"requires_table"`
	RequiresAddress bool  `json:"requires_address"`
}

type POSSizeMeta struct {
	Label  string `json:"label"`
	Inches string `json:"inches"` // derived from bot_config.sizes[].inches (canonical); not edited via pos_config UI
}

type POSBillRow struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Visible  bool   `json:"visible"`
	Editable bool   `json:"editable,omitempty"`
	Default  *int   `json:"default,omitempty"`
}

type POSCharges struct {
	ContainerDefault int    `json:"container_default"`
	TipEnabled       bool   `json:"tip_enabled"`
	RoundMode        string `json:"round_mode"` // none|nearest|up|down
	TaxSource        string `json:"tax_source"` // restaurant.tax_percent
}

type POSCustomerField struct {
	Visible  bool     `json:"visible"`
	Required bool     `json:"required"`
	For      []string `json:"for"`
}

type POSFeatures struct {
	Bogo         bool `json:"bogo"`
	SplitBill    bool `json:"split_bill"`
	Complimentary bool `json:"complimentary"`
	AdvanceOrder bool `json:"advance_order"`
	KOT          bool `json:"kot"`
	Hold         bool `json:"hold"`
}

var validPOSFeatureKeys = map[string]bool{
	"bogo": true, "split_bill": true, "complimentary": true,
	"advance_order": true, "kot": true, "hold": true,
}

var posIconRe = regexp.MustCompile(`^[a-z0-9_-]{1,40}$`)

// UnmarshalJSON rejects unknown feature keys instead of silently
// dropping them: a typo'd flag must fail the save, not vanish.
func (f *POSFeatures) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	for k := range raw {
		if !validPOSFeatureKeys[k] {
			return fmt.Errorf("unknown pos feature %q", k)
		}
	}
	type alias POSFeatures
	var a alias
	if err := json.Unmarshal(data, &a); err != nil {
		return err
	}
	*f = POSFeatures(a)
	return nil
}

type POSUI struct {
	HeaderTitle string `json:"header_title"`
	// CurrencySymbol is derived from the restaurant's authoritative currency.
	// Kept in JSON for backward compatibility; populated on load from restaurant.currency.
	CurrencySymbol string `json:"currency_symbol,omitempty"`
	PosAccent     string `json:"pos_accent"`
}

type POSConfig struct {
	OrderTypes     []POSOrderType            `json:"order_types"`
	SizeMeta       map[string]POSSizeMeta    `json:"size_meta"`
	BillRows       []POSBillRow              `json:"bill_rows"`
	Charges        POSCharges                `json:"charges"`
	CustomerFields map[string]POSCustomerField `json:"customer_fields"`
	Features       POSFeatures               `json:"features"`
	UI             POSUI                     `json:"ui"`
	Version        int                       `json:"version"`
}

var (
	posCfgCache = map[int]cachedPOSConfig{}
	posCfgMu    sync.RWMutex
)

// ConfigSource tells callers whether a config came from the database or
// from a fallback. Fallbacks must be surfaced, never silently served as
// tenant configuration.
type ConfigSource string

const (
	ConfigSourceDB               ConfigSource = "db"
	ConfigSourceFallbackDefault  ConfigSource = "fallback-default"
	ConfigSourceFallbackInvalid  ConfigSource = "fallback-invalid"
	ConfigSourceFallbackOffline  ConfigSource = "fallback-offline"
)

type cachedPOSConfig struct {
	cfg *POSConfig
	src ConfigSource
}

func defaultPOSConfig() *POSConfig {
	return &POSConfig{
		OrderTypes: []POSOrderType{
			{Key: "dine_in", Label: "Dine In", Short: "Dine In", Icon: "utensils", Active: true, RequiresTable: true},
			{Key: "delivery", Label: "Delivery", Short: "Delivery", Icon: "bike", Active: true, RequiresAddress: true},
			{Key: "takeaway", Label: "Take Away", Short: "Take Away", Icon: "bag", Active: true},
		},
		SizeMeta: map[string]POSSizeMeta{
			"regular": {Label: "Regular", Inches: "7 Inches"},
			"medium":  {Label: "Medium", Inches: "10 Inches"},
			"large":   {Label: "Large", Inches: "13 Inches"},
		},
		BillRows: []POSBillRow{
			{Key: "subtotal", Label: "Sub Total", Visible: true},
			{Key: "discount", Label: "Discount", Visible: true},
			{Key: "container", Label: "Container Charge", Visible: true, Editable: true},
		{Key: "tax", Label: "Tax", Visible: true},
		{Key: "customer_paid", Label: "Customer Paid", Visible: true},
			{Key: "return_to_customer", Label: "Return to Customer", Visible: true},
			{Key: "tip", Label: "Tip", Visible: true, Editable: true},
		},
		Charges: POSCharges{ContainerDefault: 0, TipEnabled: true, RoundMode: "nearest", TaxSource: "restaurant.tax_percent"},
		CustomerFields: map[string]POSCustomerField{
			"phone":    {Visible: true, Required: true, For: []string{"delivery", "takeaway"}},
			"name":     {Visible: true, Required: false, For: []string{"dine_in", "delivery", "takeaway"}},
			"address":  {Visible: true, Required: false, For: []string{"delivery"}},
			"locality": {Visible: true, Required: false, For: []string{"delivery"}},
		},
		Features: POSFeatures{Bogo: false, SplitBill: false, Complimentary: true, AdvanceOrder: true, KOT: true, Hold: true},
		UI: POSUI{HeaderTitle: "OCP POS", PosAccent: "#b91c1c"},
		Version: 1,
	}
}

func enrichPOSSizeMeta(cfg *POSConfig, restaurantID int) {
	if cfg == nil || cfg.SizeMeta == nil {
		return
	}
	biz := GetBizConfigFor(restaurantID)
	if biz == nil || len(biz.Sizes) == 0 {
		return
	}
	byKey := map[string]string{}
	for _, s := range biz.Sizes {
		if s.Inches != "" {
			byKey[s.Key] = s.Inches
		}
	}
	for k, v := range cfg.SizeMeta {
		if inches, ok := byKey[k]; ok {
			v.Inches = inches
			cfg.SizeMeta[k] = v
		}
	}
}

func canonicalizePOSSizeMeta(cfg *POSConfig, restaurantID int) {
	enrichPOSSizeMeta(cfg, restaurantID)
}

func validatePOSConfig(cfg *POSConfig) error {
	if len(cfg.OrderTypes) == 0 || len(cfg.OrderTypes) > 5 {
		return fmt.Errorf("order_types must be 1..5")
	}
	keys := map[string]bool{}
	for _, o := range cfg.OrderTypes {
		if len(o.Key) == 0 || len(o.Key) > 30 {
			return fmt.Errorf("order_type key 1..30")
		}
		if keys[o.Key] {
			return fmt.Errorf("duplicate order_type %q", o.Key)
		}
		keys[o.Key] = true
		if len(o.Label) == 0 || len(o.Label) > 40 {
			return fmt.Errorf("order_type label 1..40")
		}
		if len(o.Short) > 24 {
			return fmt.Errorf("order_type short max 24")
		}
		if o.Icon != "" && !posIconRe.MatchString(o.Icon) {
			return fmt.Errorf("order_type icon must be 1..40 lowercase alphanumeric, dash or underscore")
		}
	}
	if len(cfg.SizeMeta) == 0 || len(cfg.SizeMeta) > 5 {
		return fmt.Errorf("size_meta 1..5")
	}
	for k, v := range cfg.SizeMeta {
		if len(k) == 0 || len(k) > 20 {
			return fmt.Errorf("size key 1..20")
		}
		if len(v.Label) == 0 || len(v.Label) > 20 {
			return fmt.Errorf("size label 1..20")
		}
		if len(v.Inches) > 20 {
			return fmt.Errorf("size inches max 20")
		}
	}
	if len(cfg.BillRows) == 0 || len(cfg.BillRows) > 12 {
		return fmt.Errorf("bill_rows 1..12")
	}
	for _, r := range cfg.BillRows {
		if len(r.Key) == 0 || len(r.Key) > 30 {
			return fmt.Errorf("bill_row key 1..30")
		}
		if len(r.Label) == 0 || len(r.Label) > 40 {
			return fmt.Errorf("bill_row label 1..40")
		}
	}
	validRound := map[string]bool{"none": true, "nearest": true, "up": true, "down": true}
	if !validRound[cfg.Charges.RoundMode] {
		return fmt.Errorf("invalid round_mode")
	}
	if len(cfg.UI.CurrencySymbol) > 5 {
		return fmt.Errorf("currency_symbol max 5")
	}
	if len(cfg.UI.HeaderTitle) > 40 {
		return fmt.Errorf("header_title max 40")
	}
	// Features are bools, no validation beyond type
	return nil
}

// LoadPOSConfigFor loads and caches per-restaurant config. Falls back to defaults if no row.
// Size inches are derived from bot_config.sizes[].inches (canonical) on every load.
func LoadPOSConfigFor(restaurantID int) *POSConfig {
	cfg, _ := LoadPOSConfigForEx(restaurantID)
	return cfg
}

// LoadPOSConfigForEx is LoadPOSConfigFor plus the provenance of the
// returned config. Callers that render or persist config must use the
// source to distinguish tenant data from development defaults.
func LoadPOSConfigForEx(restaurantID int) (*POSConfig, ConfigSource) {
	rid := ResolveRestaurant(restaurantID)
	posCfgMu.RLock()
	if c, ok := posCfgCache[rid]; ok {
		posCfgMu.RUnlock()
		out := *c.cfg
		enrichPOSSizeMeta(&out, rid)
		return &out, c.src
	}
	posCfgMu.RUnlock()

	store := func(cfg *POSConfig, src ConfigSource) (*POSConfig, ConfigSource) {
		enrichPOSSizeMeta(cfg, rid)
		// Currency authority: the symbol is always derived from the
		// restaurant's authoritative currency. Any stored mirror is
		// overwritten so a stale row can never override the authority.
		ApplyCurrencyAuthority(cfg, rid)
		posCfgMu.Lock()
		posCfgCache[rid] = cachedPOSConfig{cfg: cfg, src: src}
		posCfgMu.Unlock()
		out := *cfg
		enrichPOSSizeMeta(&out, rid)
		return &out, src
	}

	if database.DB == nil {
		return store(defaultPOSConfig(), ConfigSourceFallbackOffline)
	}
	var raw string
	err := database.DB.QueryRow(`SELECT value::text FROM site_settings WHERE key='pos_config' AND restaurant_id=$1`, rid).Scan(&raw)
	if err != nil {
		return store(defaultPOSConfig(), ConfigSourceFallbackDefault)
	}
	var cfg POSConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return store(defaultPOSConfig(), ConfigSourceFallbackInvalid)
	}
	// Validate persisted value; on failure return defaults (do not cache invalid)
	if err := validatePOSConfig(&cfg); err != nil {
		out := *defaultPOSConfig()
		enrichPOSSizeMeta(&out, rid)
		ApplyCurrencyAuthority(&out, rid)
		return &out, ConfigSourceFallbackInvalid
	}
	return store(&cfg, ConfigSourceDB)
}

// ApplyCurrencyAuthority sets the POS display currency from the
// restaurant's authoritative currency code. The symbol is derived, never
// stored: SavePOSConfig strips it before persist.
func ApplyCurrencyAuthority(cfg *POSConfig, restaurantID int) {
	if cfg == nil {
		return
	}
	cfg.UI.CurrencySymbol = currency.Symbol(RestaurantCurrency(ResolveRestaurant(restaurantID)))
}

// SavePOSConfig validates, persists, and invalidates cache.
// Inches are canonicalized from bot_config before persist to prevent drift.
// The currency symbol mirror is stripped before persist: it is derived on
// every load from the restaurant's authoritative currency.
func SavePOSConfig(cfg *POSConfig, restaurantID int) error {
	if err := validatePOSConfig(cfg); err != nil {
		return err
	}
	rid := ResolveRestaurant(restaurantID)
	canonicalizePOSSizeMeta(cfg, rid)
	cfg.UI.CurrencySymbol = ""
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = database.DB.Exec(
		`INSERT INTO site_settings (key, value, restaurant_id) VALUES ('pos_config', $1::jsonb, $2)
		 ON CONFLICT (key, restaurant_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
		string(raw), rid,
	)
	if err != nil {
		return err
	}
	posCfgMu.Lock()
	delete(posCfgCache, rid)
	posCfgMu.Unlock()
	return nil
}

func InvalidatePOSCache(restaurantID int) {
	posCfgMu.Lock()
	delete(posCfgCache, ResolveRestaurant(restaurantID))
	posCfgMu.Unlock()
}

// ResolvePOSConfig returns effective config for restaurant+outlet.
// Today: restaurant only; later: merges outlet overrides. Always enriches inches from bot_config.
func ResolvePOSConfig(restaurantID, outletID int) *POSConfig {
	cfg, _ := ResolvePOSConfigForEx(restaurantID, outletID)
	return cfg
}

// ResolvePOSConfigForEx is ResolvePOSConfig plus provenance.
func ResolvePOSConfigForEx(restaurantID, outletID int) (*POSConfig, ConfigSource) {
	_ = outletID // reserved for outlet overrides
	cfg, src := LoadPOSConfigForEx(restaurantID)
	enrichPOSSizeMeta(cfg, ResolveRestaurant(restaurantID))
	return cfg, src
}

// EnsurePOSConfigSeed creates the default pos_config row only when the
// restaurant has none. It never overwrites an existing row: the previous
// implementation saved defaults unconditionally before the guarded
// insert, destroying custom configuration on every call.
func EnsurePOSConfigSeed(restaurantID int) {
	rid := ResolveRestaurant(restaurantID)
	var exists bool
	if err := database.DB.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM site_settings WHERE key='pos_config' AND restaurant_id=$1)`,
		rid).Scan(&exists); err == nil && exists {
		return
	}
	raw, _ := json.Marshal(defaultPOSConfig())
	_, _ = database.DB.Exec(
		`INSERT INTO site_settings (key, value, restaurant_id) VALUES ('pos_config', $1::jsonb, $2) ON CONFLICT (key, restaurant_id) DO NOTHING`,
		string(raw), rid,
	)
	posCfgMu.Lock()
	delete(posCfgCache, rid)
	posCfgMu.Unlock()
}
