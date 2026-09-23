package services

import (
	"encoding/json"
	"fmt"
	"sync"

	"orangecheesepizza/bot/database"
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

type POSUI struct {
	HeaderTitle   string `json:"header_title"`
	CurrencySymbol string `json:"currency_symbol"`
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
	posCfgCache = map[int]*POSConfig{}
	posCfgMu    sync.RWMutex
)

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
			{Key: "round_off", Label: "Round Off", Visible: true},
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
		UI: POSUI{HeaderTitle: "OCP POS", CurrencySymbol: "₹", PosAccent: "#b91c1c"},
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
	if len(cfg.UI.CurrencySymbol) == 0 || len(cfg.UI.CurrencySymbol) > 5 {
		return fmt.Errorf("currency_symbol 1..5")
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
	rid := ResolveRestaurant(restaurantID)
	posCfgMu.RLock()
	if c, ok := posCfgCache[rid]; ok {
		posCfgMu.RUnlock()
		out := *c
		enrichPOSSizeMeta(&out, rid)
		return &out
	}
	posCfgMu.RUnlock()

	var raw string
	err := database.DB.QueryRow(`SELECT value::text FROM site_settings WHERE key='pos_config' AND restaurant_id=$1`, rid).Scan(&raw)
	if err != nil {
		cfg := defaultPOSConfig()
		enrichPOSSizeMeta(cfg, rid)
		posCfgMu.Lock()
		posCfgCache[rid] = cfg
		posCfgMu.Unlock()
		out := *cfg
		enrichPOSSizeMeta(&out, rid)
		return &out
	}
	var cfg POSConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		cfg2 := defaultPOSConfig()
		enrichPOSSizeMeta(cfg2, rid)
		posCfgMu.Lock()
		posCfgCache[rid] = cfg2
		posCfgMu.Unlock()
		out := *cfg2
		enrichPOSSizeMeta(&out, rid)
		return &out
	}
	// Validate persisted value; on failure return defaults (do not cache invalid)
	if err := validatePOSConfig(&cfg); err != nil {
		cfg2 := defaultPOSConfig()
		enrichPOSSizeMeta(cfg2, rid)
		out := *cfg2
		enrichPOSSizeMeta(&out, rid)
		return &out
	}
	enrichPOSSizeMeta(&cfg, rid)
	posCfgMu.Lock()
	posCfgCache[rid] = &cfg
	posCfgMu.Unlock()
	out := cfg
	enrichPOSSizeMeta(&out, rid)
	return &out
}

// SavePOSConfig validates, persists, and invalidates cache.
// Inches are canonicalized from bot_config before persist to prevent drift.
func SavePOSConfig(cfg *POSConfig, restaurantID int) error {
	if err := validatePOSConfig(cfg); err != nil {
		return err
	}
	rid := ResolveRestaurant(restaurantID)
	canonicalizePOSSizeMeta(cfg, rid)
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
	_ = outletID // reserved for outlet overrides
	cfg := LoadPOSConfigFor(restaurantID)
	enrichPOSSizeMeta(cfg, ResolveRestaurant(restaurantID))
	return cfg
}

// Helper for provisioning new restaurant default pos_config (call after org/restaurant creation)
func EnsurePOSConfigSeed(restaurantID int) {
	_ = SavePOSConfig(defaultPOSConfig(), restaurantID)
	// Seed is idempotent via ON CONFLICT; validate ensures not to overwrite custom
	// So we use INSERT ... ON CONFLICT DO NOTHING via raw Exec to avoid overwriting
	rid := ResolveRestaurant(restaurantID)
	raw, _ := json.Marshal(defaultPOSConfig())
	_, _ = database.DB.Exec(
		`INSERT INTO site_settings (key, value, restaurant_id) VALUES ('pos_config', $1::jsonb, $2) ON CONFLICT (key, restaurant_id) DO NOTHING`,
		string(raw), rid,
	)
	posCfgMu.Lock()
	delete(posCfgCache, rid)
	posCfgMu.Unlock()
}
