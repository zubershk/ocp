package services

import (
	"testing"
)

func TestComputeTotalsPercentAndTax(t *testing.T) {
	// ₹1,000 subtotal, 10% off, 5% tax on the discounted base.
	disc, tax, total := ComputeTotalsFromLines(100000, "percent", 1000, 500)
	if disc != 10000 {
		t.Fatalf("expected 10000 paise discount, got %d", disc)
	}
	if tax != 4500 { // 5% of 90000
		t.Fatalf("expected 4500 paise tax, got %d", tax)
	}
	if total != 94500 {
		t.Fatalf("expected 94500 paise total, got %d", total)
	}
}

func TestComputeTotalsFlat(t *testing.T) {
	disc, tax, total := ComputeTotalsFromLines(100000, "flat", 15000, 0)
	if disc != 15000 || tax != 0 || total != 85000 {
		t.Fatalf("unexpected flat totals: disc=%d tax=%d total=%d", disc, tax, total)
	}
}

func TestComputeTotalsFlatCappedAtSubtotal(t *testing.T) {
	// A ₹2,000 flat discount on a ₹1,000 order must floor at zero,
	// never a negative payable.
	disc, tax, total := ComputeTotalsFromLines(100000, "flat", 200000, 500)
	if disc != 100000 {
		t.Fatalf("discount must cap at subtotal, got %d", disc)
	}
	if total != 0 || tax != 0 {
		t.Fatalf("expected zeroed total/tax, got total=%d tax=%d", total, tax)
	}
}

func TestComputeTotalsNoDiscount(t *testing.T) {
	disc, tax, total := ComputeTotalsFromLines(50000, "none", 0, 0)
	if disc != 0 || tax != 0 || total != 50000 {
		t.Fatalf("unexpected passthrough totals: disc=%d tax=%d total=%d", disc, tax, total)
	}
}

func TestPaiseToRupees(t *testing.T) {
	if got := paiseToRupees(94500); got != 945.0 {
		t.Fatalf("expected 945.0, got %v", got)
	}
	if got := paiseToRupees(1); got != 0.01 {
		t.Fatalf("expected 0.01, got %v", got)
	}
}
