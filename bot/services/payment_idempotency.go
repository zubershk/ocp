package services

import (
	"errors"
	"fmt"
	"strings"
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

// NormalizeIdempotencyKey trims and caps a client-supplied key.
// Empty input stays empty (no idempotency requested).
func NormalizeIdempotencyKey(key string) string {
	key = strings.TrimSpace(key)
	if len(key) > MaxIdempotencyKeyLen {
		key = key[:MaxIdempotencyKeyLen]
	}
	return key
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
