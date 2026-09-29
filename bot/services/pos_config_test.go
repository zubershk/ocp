package services

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPOSFeaturesRejectUnknownKey(t *testing.T) {
	var f POSFeatures
	if err := json.Unmarshal([]byte(`{"bogo":true,"bogus":true}`), &f); err == nil {
		t.Fatal("unknown feature key must be rejected")
	} else if !strings.Contains(err.Error(), "bogus") {
		t.Fatalf("error must name the key, got %v", err)
	}
	var ok POSFeatures
	if err := json.Unmarshal([]byte(`{"bogo":false,"split_bill":false,"complimentary":true,"advance_order":true,"kot":true,"hold":true}`), &ok); err != nil {
		t.Fatalf("known feature set rejected: %v", err)
	}
}

func TestValidatePOSConfigShortIcon(t *testing.T) {
	cfg := defaultPOSConfig()
	cfg.OrderTypes[0].Short = strings.Repeat("x", 25)
	if err := validatePOSConfig(cfg); err == nil {
		t.Fatal("short >24 must be rejected")
	}
	cfg = defaultPOSConfig()
	cfg.OrderTypes[0].Icon = "Bike Icon!"
	if err := validatePOSConfig(cfg); err == nil {
		t.Fatal("icon with uppercase/space must be rejected")
	}
	cfg = defaultPOSConfig()
	if err := validatePOSConfig(cfg); err != nil {
		t.Fatalf("default config must validate: %v", err)
	}
}

func TestDefaultPOSConfigHasNoRoundOff(t *testing.T) {
	for _, r := range defaultPOSConfig().BillRows {
		if r.Key == "round_off" {
			t.Fatal("default bill rows must not advertise round_off: no server computation exists")
		}
	}
}

func TestValidatePaymentAmount(t *testing.T) {
	if err := ValidatePaymentAmount(50000); err != nil {
		t.Fatalf("positive amount rejected: %v", err)
	}
	if err := ValidatePaymentAmount(0); err == nil {
		t.Fatal("zero amount accepted")
	}
	if err := ValidatePaymentAmount(-1); err == nil {
		t.Fatal("negative amount accepted")
	}
}
