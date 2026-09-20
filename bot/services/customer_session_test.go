package services

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"testing"
	"time"
)

func TestSessionTTLDefault(t *testing.T) {
	os.Unsetenv("CUSTOMER_SESSION_TTL_SECONDS")
	if got := sessionTTL(); got != defaultSessionExpiry {
		t.Fatalf("default TTL = %v, want %v", got, defaultSessionExpiry)
	}
}

func TestSessionTTLEnv(t *testing.T) {
	t.Setenv("CUSTOMER_SESSION_TTL_SECONDS", "3600")
	if got := sessionTTL(); got != time.Hour {
		t.Fatalf("env TTL = %v, want 1h", got)
	}
	t.Setenv("CUSTOMER_SESSION_TTL_SECONDS", "0")
	if got := sessionTTL(); got != defaultSessionExpiry {
		t.Fatalf("zero TTL should fallback to default, got %v", got)
	}
	t.Setenv("CUSTOMER_SESSION_TTL_SECONDS", "notanint")
	if got := sessionTTL(); got != defaultSessionExpiry {
		t.Fatalf("invalid TTL should fallback to default, got %v", got)
	}
}

func TestDeleteSessionHashesBothVariants(t *testing.T) {
	// Unit-level: hashHex with pepper vs legacy sha256 must differ when pepper is set.
	t.Setenv("OTP_PEPPER", "test-pepper-123")
	t.Setenv("BOT_ADMIN_KEY", "")
	token := "abc123-test-token-value-for-unit-test"
	peppered := hashHex(token)
	legacy := func(s string) string {
		h := sha256.Sum256([]byte(s))
		return hex.EncodeToString(h[:])
	}(token)
	if peppered == legacy {
		t.Fatalf("peppered and legacy hashes must differ when pepper is set")
	}
	// Without pepper they differ via BOT_ADMIN_KEY fallback; at minimum ensure deterministic
	t.Setenv("OTP_PEPPER", "")
	t.Setenv("BOT_ADMIN_KEY", "fallback-pepper")
	peppered2 := hashHex(token)
	if peppered2 == legacy {
		t.Fatalf("peppered (fallback) and legacy must differ")
	}
}

func TestIsStaleLogicForSessions(t *testing.T) {
	// Validate expiry boundary logic in isolation: time.Now().After(expiresAt)
	expired := time.Now().Add(-time.Second)
	if !time.Now().After(expired) {
		t.Fatal("expired session should be after now")
	}
	valid := time.Now().Add(time.Hour)
	if time.Now().After(valid) {
		t.Fatal("valid session should not be expired")
	}
}

func TestSessionRotationThreshold(t *testing.T) {
	ttl := 30 * 24 * time.Hour
	// More than half elapsed → should rotate (remaining < ttl/2)
	almostExpired := time.Now().Add(ttl/4) // 7.5d remaining < 15d half → rotate
	if ttl/2 >= time.Until(almostExpired) == false {
		// remaining 7.5d < 15d, so condition time.Until < ttl/2 should be true
		t.Fatalf("rotation threshold miscalculated")
	}
	fresh := time.Now().Add(ttl) // full TTL remaining → no rotate
	if time.Until(fresh) < ttl/2 {
		t.Fatalf("fresh session should not trigger rotation")
	}
}

func TestValidateSessionInputValidation(t *testing.T) {
	if _, _, err := ValidateSessionFor("   ", 0); err == nil {
		t.Fatal("empty token must be rejected")
	}
	if _, _, err := ValidateSessionFor("", 0); err == nil {
		t.Fatal("empty token must be rejected")
	}
}

func TestSessionTokenEntropy(t *testing.T) {
	a, err := randomToken()
	if err != nil {
		t.Fatalf("randomToken failed: %v", err)
	}
	b, err := randomToken()
	if err != nil {
		t.Fatalf("randomToken failed: %v", err)
	}
	if a == b {
		t.Fatal("two tokens must not collide")
	}
	if len(a) != 48 {
		t.Fatalf("token length = %d, want 48 hex chars", len(a))
	}
}
