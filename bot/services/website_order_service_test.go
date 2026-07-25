package services

import (
	"database/sql"
	"strings"
	"testing"
)

func nullFloat(v float64) sql.NullFloat64 { return sql.NullFloat64{Float64: v, Valid: true} }

func TestCrustCharge(t *testing.T) {
	cases := []struct {
		name         string
		reg, med, lg float64
		valid        bool // all valid or all zero (simplified)
		size         string
		want         float64
	}{
		{"cheese-burst regular", 85, 110, 135, true, "regular", 85},
		{"cheese-burst medium", 85, 110, 135, true, "medium", 110},
		{"cheese-burst large", 85, 110, 135, true, "large", 135},
	}
	for _, tc := range cases {
		got := CrustCharge(nullFloat(tc.reg), nullFloat(tc.med), nullFloat(tc.lg), tc.size)
		if got != tc.want {
			t.Fatalf("%s: got %v want %v", tc.name, got, tc.want)
		}
	}
}

func TestCrustChargeNullColumns(t *testing.T) {
	// DCC: only medium is priced (120); others NULL -> 0
	if got := CrustCharge(nullFloat(0), nullFloat(120), nullFloat(0), "large"); got != 0 {
		t.Fatalf("dcc large expected 0, got %v", got)
	}
}

func TestValidateQuantities(t *testing.T) {
	if err := ValidateQuantities(nil); err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("expected empty-cart error, got %v", err)
	}
	ok := []WebsiteOrderItemRequest{{ID: "x", Quantity: 3}}
	if err := ValidateQuantities(ok); err != nil {
		t.Fatalf("valid cart rejected: %v", err)
	}
	bad := []WebsiteOrderItemRequest{{ID: "x", Quantity: 21}}
	if err := ValidateQuantities(bad); err == nil {
		t.Fatal("quantity 21 should be rejected")
	}
}

func TestNormalizePhone(t *testing.T) {
	if _, err := normalizePhone("98765 43210"); err != nil {
		t.Fatalf("spaced number rejected: %v", err)
	}
	if _, err := normalizePhone("+919876543210"); err != nil {
		t.Fatalf("country-code number rejected: %v", err)
	}
	if _, err := normalizePhone("12345"); err == nil {
		t.Fatal("short number accepted")
	}
}
