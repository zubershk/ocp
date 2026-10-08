package currency

import "testing"

func TestLookupKnown(t *testing.T) {
	usd := Lookup("USD")
	if usd.Symbol != "$" || usd.Locale != "en-US" || usd.MinorUnit != 2 || usd.Code != "USD" {
		t.Fatalf("unexpected USD info: %+v", usd)
	}
	inr := Lookup("inr") // case-insensitive
	if inr.Symbol != "₹" || inr.Locale != "en-IN" || inr.MinorUnit != 2 || inr.Code != "INR" {
		t.Fatalf("unexpected INR info: %+v", inr)
	}
	jpy := Lookup("JPY")
	if jpy.MinorUnit != 0 {
		t.Fatalf("expected JPY minor unit 0, got %d", jpy.MinorUnit)
	}
}

func TestLookupUnknownFallsBack(t *testing.T) {
	got := Lookup("XXQ")
	if got.Code != DefaultCurrency || got.Symbol != "$" || got.MinorUnit != 2 {
		t.Fatalf("expected USD fallback, got %+v", got)
	}
	if Lookup("") != got {
		t.Fatalf("expected empty code to fall back identically")
	}
}

func TestSymbolHelpers(t *testing.T) {
	if Symbol("USD") != "$" {
		t.Fatalf("expected $, got %q", Symbol("USD"))
	}
	if Symbol("INR") != "₹" {
		t.Fatalf("expected ₹, got %q", Symbol("INR"))
	}
	if Locale("USD") != "en-US" {
		t.Fatalf("expected en-US, got %q", Locale("USD"))
	}
	if MinorUnit("JPY") != 0 {
		t.Fatalf("expected 0, got %d", MinorUnit("JPY"))
	}
}

func TestFormatMinorAndMajor(t *testing.T) {
	if got := FormatMinor("USD", 1050); got != "$10.50" {
		t.Fatalf("expected $10.50, got %q", got)
	}
	if got := FormatMinor("INR", 77000); got != "₹770.00" {
		t.Fatalf("expected ₹770.00, got %q", got)
	}
	if got := FormatMinor("JPY", 1000); got != "¥1000" {
		t.Fatalf("expected ¥1000, got %q", got)
	}
	if got := FormatMajor("USD", 10.5); got != "$10.50" {
		t.Fatalf("expected $10.50, got %q", got)
	}
}
