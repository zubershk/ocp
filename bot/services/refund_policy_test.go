package services

import (
	"errors"
	"testing"
)

func baseRefundCheck() RefundCheck {
	return RefundCheck{
		OriginalAmountPaise:  100000, // ₹1,000 payment
		AlreadyRefundedPaise: 0,
		OriginalRefundOf:     0,
		OriginalOrderID:      7,
		OriginalRestaurantID: 1,
		OriginalOutletID:     2,
	}
}

func TestValidateRefundHappyPath(t *testing.T) {
	if err := ValidateRefundRequest(baseRefundCheck(), 7, 1, 2, 60000); err != nil {
		t.Fatalf("valid partial refund rejected: %v", err)
	}
}

func TestValidateRefundExceedsOriginal(t *testing.T) {
	err := ValidateRefundRequest(baseRefundCheck(), 7, 1, 2, 100001)
	if !errors.Is(err, ErrRefundExceedsRemain) {
		t.Fatalf("expected ErrRefundExceedsRemain, got %v", err)
	}
}

func TestValidateRefundExceedsRemaining(t *testing.T) {
	c := baseRefundCheck()
	c.AlreadyRefundedPaise = 60000 // ₹600 already returned; ₹400 remain
	if err := ValidateRefundRequest(c, 7, 1, 2, 40000); err != nil {
		t.Fatalf("refund of exact remainder rejected: %v", err)
	}
	if err := ValidateRefundRequest(c, 7, 1, 2, 40001); !errors.Is(err, ErrRefundExceedsRemain) {
		t.Fatalf("expected ErrRefundExceedsRemain, got %v", err)
	}
}

func TestValidateRefundOfRefund(t *testing.T) {
	c := baseRefundCheck()
	c.OriginalRefundOf = 3
	c.OriginalAmountPaise = -60000
	if err := ValidateRefundRequest(c, 7, 1, 2, 100); !errors.Is(err, ErrRefundOfRefund) {
		t.Fatalf("expected ErrRefundOfRefund, got %v", err)
	}
}

func TestValidateRefundTenantAndOrder(t *testing.T) {
	if err := ValidateRefundRequest(baseRefundCheck(), 8, 1, 2, 100); !errors.Is(err, ErrRefundOrderMismatch) {
		t.Fatalf("expected ErrRefundOrderMismatch, got %v", err)
	}
	if err := ValidateRefundRequest(baseRefundCheck(), 7, 9, 2, 100); !errors.Is(err, ErrRefundTenantMismatch) {
		t.Fatalf("expected ErrRefundTenantMismatch (restaurant), got %v", err)
	}
	if err := ValidateRefundRequest(baseRefundCheck(), 7, 1, 9, 100); !errors.Is(err, ErrRefundTenantMismatch) {
		t.Fatalf("expected ErrRefundTenantMismatch (outlet), got %v", err)
	}
}

func TestValidateRefundAlreadyComplete(t *testing.T) {
	c := baseRefundCheck()
	c.AlreadyRefundedPaise = 100000
	if err := ValidateRefundRequest(c, 7, 1, 2, 100); !errors.Is(err, ErrRefundAlreadyComplete) {
		t.Fatalf("expected ErrRefundAlreadyComplete, got %v", err)
	}
}

func TestValidateRefundBadAmounts(t *testing.T) {
	if err := ValidateRefundRequest(baseRefundCheck(), 7, 1, 2, 0); !errors.Is(err, ErrRefundAmountInvalid) {
		t.Fatalf("expected ErrRefundAmountInvalid for zero, got %v", err)
	}
	if err := ValidateRefundRequest(baseRefundCheck(), 7, 1, 2, -50); !errors.Is(err, ErrRefundAmountInvalid) {
		t.Fatalf("expected ErrRefundAmountInvalid for negative, got %v", err)
	}
}

func TestRemainingRefundable(t *testing.T) {
	c := baseRefundCheck()
	c.AlreadyRefundedPaise = 60000
	if got := c.RemainingRefundable(); got != 40000 {
		t.Fatalf("expected 40000 paise remaining, got %d", got)
	}
	c.AlreadyRefundedPaise = 200000 // corrupt ledger must never go negative
	if got := c.RemainingRefundable(); got != 0 {
		t.Fatalf("expected clamped 0, got %d", got)
	}
}
