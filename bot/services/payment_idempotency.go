package services

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// ------------------------------------------------------------------
// Payment idempotency (PR 5 hardening 1/6).
//
// Invariant: same idempotency key -> same payment operation ->
// never two ledger rows. Reuses the orders.idempotency_key pattern
// from migration 004 (nullable key + partial UNIQUE index):
//
//	1. SELECT by key first (cheap replay path for retries).
//	2. INSERT with the key.
//	3. On unique-violation, SELECT the winner and report replayed.
//
// The key travels in the `Idempotency-Key` header (preferred) or the
// `idempotency_key` body field. An empty key preserves the legacy
// single-attempt behavior.
// ------------------------------------------------------------------

// MaxIdempotencyKeyLen caps stored keys (matches VARCHAR(120)).
const MaxIdempotencyKeyLen = 120

// ErrIdempotencyKeyTooLong is returned when a client sends a key that
// cannot be stored. Keys are never truncated: truncating two distinct
// keys ("<120-char-prefix>AAA" vs "<120-char-prefix>BBB") into the same
// stored value would merge two distinct operations into one payment.
var ErrIdempotencyKeyTooLong = errors.New("idempotency key too long")

// NormalizeIdempotencyKey trims a client-supplied key and rejects it
// when it exceeds the stored limit. Empty input stays empty (no
// idempotency requested); 1..120 characters are stored verbatim.
func NormalizeIdempotencyKey(key string) (string, error) {
	key = strings.TrimSpace(key)
	if utf8.RuneCountInString(key) > MaxIdempotencyKeyLen {
		return "", fmt.Errorf("%w: max %d characters", ErrIdempotencyKeyTooLong, MaxIdempotencyKeyLen)
	}
	return key, nil
}

// IsUniqueViolation reports whether err is a Postgres unique-violation
// on the named constraint. Used to detect a concurrent duplicate that
// won the INSERT race after our pre-check.
func IsUniqueViolation(err error, constraint string) bool {
	if err == nil || constraint == "" {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") && strings.Contains(msg, constraint)
}

// ValidPaymentMethods are the ledger-accepted methods for money in.
// 'refund' rows are written only by RecordRefund, never by callers.
var ValidPaymentMethods = map[string]bool{
	"cash":   true,
	"upi":    true,
	"card":   true,
	"online": true,
	"other":  true,
}

// ValidatePaymentInput rejects unknown methods and non-positive amounts
// before anything touches the ledger.
func ValidatePaymentInput(method string, amountPaise int64) error {
	if !ValidPaymentMethods[method] {
		return fmt.Errorf("unsupported payment method %q", method)
	}
	if amountPaise <= 0 {
		return errors.New("payment amount must be positive")
	}
	return nil
}
