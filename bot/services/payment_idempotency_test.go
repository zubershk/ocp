package services

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeIdempotencyKey(t *testing.T) {
	if got, err := NormalizeIdempotencyKey(""); err != nil || got != "" {
		t.Fatalf("empty key should stay empty, got %q, err %v", got, err)
	}
	if got, err := NormalizeIdempotencyKey("  PAY-500-abc  "); err != nil || got != "PAY-500-abc" {
		t.Fatalf("key should be trimmed, got %q, err %v", got, err)
	}
	exact := strings.Repeat("k", MaxIdempotencyKeyLen)
	if got, err := NormalizeIdempotencyKey(exact); err != nil || got != exact {
		t.Fatalf("120-char key must be stored verbatim, err %v", err)
	}
}

func TestNormalizeIdempotencyKeyTooLong(t *testing.T) {
	// Two keys sharing a 120-char prefix but differing after it must
	// never collapse into one stored key: reject, don't truncate.
	prefix := strings.Repeat("k", MaxIdempotencyKeyLen)
	for _, key := range []string{prefix + "AAA", prefix + "BBB", strings.Repeat("k", MaxIdempotencyKeyLen+1)} {
		if _, err := NormalizeIdempotencyKey(key); !errors.Is(err, ErrIdempotencyKeyTooLong) {
			t.Fatalf("expected ErrIdempotencyKeyTooLong for %d-char key, got %v", len(key), err)
		}
	}
}

func TestValidatePaymentInput(t *testing.T) {
	for _, m := range []string{"cash", "upi", "card", "online", "other"} {
		if err := ValidatePaymentInput(m, 50000); err != nil {
			t.Fatalf("method %q with positive amount rejected: %v", m, err)
		}
	}
	if err := ValidatePaymentInput("refund", 100); err == nil {
		t.Fatal("refund must not be accepted as a payment method")
	}
	if err := ValidatePaymentInput("bitcoin", 100); err == nil {
		t.Fatal("unknown method accepted")
	}
	if err := ValidatePaymentInput("cash", 0); err == nil {
		t.Fatal("zero amount accepted")
	}
	if err := ValidatePaymentInput("upi", -500); err == nil {
		t.Fatal("negative amount accepted")
	}
}

func TestIsUniqueViolation(t *testing.T) {
	dup := errors.New(`pq: duplicate key value violates unique constraint "uq_order_payments_idempotency_key"`)
	if !IsUniqueViolation(dup, "uq_order_payments_idempotency_key") {
		t.Fatal("expected unique-violation detection")
	}
	other := errors.New(`pq: duplicate key value violates unique constraint "uq_orders_idempotency_key"`)
	if IsUniqueViolation(other, "uq_order_payments_idempotency_key") {
		t.Fatal("wrong constraint must not match")
	}
	if IsUniqueViolation(errors.New("connection refused"), "uq_order_payments_idempotency_key") {
		t.Fatal("non-duplicate error must not match")
	}
	if IsUniqueViolation(nil, "uq_order_payments_idempotency_key") {
		t.Fatal("nil error must not match")
	}
}
