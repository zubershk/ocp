package services

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
	"time"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Customer auth via WhatsApp OTP — phone is the identity synced
// between web and WhatsApp bot (customers.whatsapp_number).
// OTP: 6-digit, 5m expiry, max 3 attempts, 30s resend cooldown.
// Session: opaque 48-hex token, hashed at rest, 30d expiry. SaaS hardening.
 // ------------------------------------------------------------------

const otpExpiry = 5 * time.Minute
const otpCooldown = 30 * time.Second
const sessionExpiry = 30 * 24 * time.Hour

func hashHex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// canonicalPhone returns 10-digit Indian local form for storage sync (web ↔ WhatsApp).
// Strips leading 91 (12-digit) or 0 (11-digit) to unify 9876543210 vs 919876543210.
func canonicalPhone(raw string) string {
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, raw)
	if len(cleaned) == 12 && strings.HasPrefix(cleaned, "91") {
		return cleaned[2:]
	}
	if len(cleaned) == 11 && cleaned[0] == '0' {
		return cleaned[1:]
	}
	return cleaned
}

// normalizeAuthPhone returns canonical 10-digit, error on invalid.
func normalizeAuthPhone(raw string) (string, error) {
	cleaned := canonicalPhone(raw)
	if cleaned == "" || len(cleaned) < 10 || len(cleaned) > 10 {
		// For SaaS we strictly store 10-digit Indian numbers for sync; international 10-13 was legacy
		// Keep 10-digit canonical for OCP; reject others as invalid for login sync
		if len(cleaned) >= 10 && len(cleaned) <= 13 {
			// allow international but canonicalize to last 10 for India
			if len(cleaned) > 10 {
				cleaned = cleaned[len(cleaned)-10:]
			}
		} else {
			return "", fmt.Errorf("invalid phone number")
		}
	}
	if len(cleaned) != 10 {
		return "", fmt.Errorf("invalid phone number")
	}
	return cleaned, nil
}

// whatsappDest mirrors order_status_service.normalizeWhatsAppDest.
func whatsappDest(phone string) string {
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' { return r }
		return -1
	}, phone)
	switch {
	case len(cleaned) == 10:
		return "91" + cleaned
	case len(cleaned) >= 11 && len(cleaned) <= 13:
		return cleaned
	default:
		return ""
	}
}

func randomOTP() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()+100000), nil
}

func randomToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// SendOTP creates a fresh OTP and sends it on WhatsApp. Returns remaining cooldown.
func SendOTP(phone string, evolution *EvolutionClient) (string, error) {
	normalized, err := normalizeAuthPhone(phone)
	if err != nil {
		return "", &ValidationError{Msg: "enter a valid 10-digit mobile number"}
	}
	// cooldown check: most recent OTP within 30s
	var lastCreated time.Time
	err = database.DB.QueryRow(`SELECT created_at FROM customer_otps WHERE phone=$1 ORDER BY id DESC LIMIT 1`, normalized).Scan(&lastCreated)
	if err == nil && time.Since(lastCreated) < otpCooldown {
		remaining := otpCooldown - time.Since(lastCreated)
		return "", &ValidationError{Msg: fmt.Sprintf("please wait %d seconds before requesting a new code", int(remaining.Seconds())+1)}
	}
	if err != nil && err != sql.ErrNoRows {
		return "", fmt.Errorf("otp lookup failed: %w", err)
	}
	code, err := randomOTP()
	if err != nil {
		return "", err
	}
	// invalidate previous OTPs for this phone
	if _, err := database.DB.Exec(`DELETE FROM customer_otps WHERE phone=$1`, normalized); err != nil {
		return "", err
	}
	expires := time.Now().Add(otpExpiry)
	hashed := hashHex(code)
	if _, err := database.DB.Exec(`INSERT INTO customer_otps (phone, code, expires_at) VALUES ($1,$2,$3)`, normalized, hashed, expires); err != nil {
		return "", err
	}
	dest := whatsappDest(normalized)
	if dest == "" {
		return "", &ValidationError{Msg: "invalid phone number"}
	}
	msg := fmt.Sprintf("🍕 Orange Cheese Pizza\n\nYour login code is *%s*\nValid for 5 minutes. Do not share this code.\n\nIf you didn't request this, ignore this message.", code)
	if err := evolution.SendText(dest, msg); err != nil {
		// keep OTP but surface warning; client sees sent:false
		return "", fmt.Errorf("whatsapp send failed: %w", err)
	}
	return code, nil
}

// VerifyOTP checks code, creates session, and upserts customer profile.
func VerifyOTP(phone, code, name string) (string, *Customer, error) {
	normalized, err := normalizeAuthPhone(phone)
	if err != nil {
		return "", nil, &ValidationError{Msg: "invalid phone number"}
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return "", nil, &ValidationError{Msg: "enter the 6-digit code"}
	}
	var rowID int
	var stored, expiresStr string
	var attempts int
	var expiresAt time.Time
	err = database.DB.QueryRow(`SELECT id, code, attempts, expires_at FROM customer_otps WHERE phone=$1 ORDER BY id DESC LIMIT 1`, normalized).Scan(&rowID, &stored, &attempts, &expiresAt)
	if err == sql.ErrNoRows {
		return "", nil, &ValidationError{Msg: "no code found — request a new one"}
	}
	if err != nil {
		return "", nil, err
	}
	// expired cleanup
	if time.Now().After(expiresAt) {
		database.DB.Exec(`DELETE FROM customer_otps WHERE phone=$1`, normalized)
		_ = expiresStr
		return "", nil, &ValidationError{Msg: "code expired — request a new one"}
	}
	if attempts >= 3 {
		database.DB.Exec(`DELETE FROM customer_otps WHERE phone=$1`, normalized)
		return "", nil, &ValidationError{Msg: "too many attempts — request a new code"}
	}
	// stored is SHA256 hex; compare hash; backward-compat for old plaintext rows (6 chars)
	if len(stored) == 6 {
		if stored != code {
			database.DB.Exec(`UPDATE customer_otps SET attempts=attempts+1 WHERE id=$1`, rowID)
			return "", nil, &ValidationError{Msg: "incorrect code"}
		}
	} else if stored != hashHex(code) {
		database.DB.Exec(`UPDATE customer_otps SET attempts=attempts+1 WHERE id=$1`, rowID)
		return "", nil, &ValidationError{Msg: "incorrect code"}
	}
	// success: consume OTP
	database.DB.Exec(`DELETE FROM customer_otps WHERE phone=$1`, normalized)

	// ensure customer exists
	if _, err := GetOrCreateCustomer(normalized); err != nil {
		return "", nil, err
	}
	if strings.TrimSpace(name) != "" {
		_ = UpdateCustomerProfile(normalized, map[string]string{"name": name})
	}
	cust, err := getCustomer(normalized)
	if err != nil {
		return "", nil, err
	}
	token, err := randomToken()
	if err != nil {
		return "", nil, err
	}
	expires := time.Now().Add(sessionExpiry)
	hashedToken := hashHex(token)
	if _, err := database.DB.Exec(`INSERT INTO customer_sessions (phone, token, expires_at) VALUES ($1,$2,$3)`, normalized, hashedToken, expires); err != nil {
		return "", nil, err
	}
	return token, cust, nil
}

// ValidateSession returns the phone and customer for a valid token.
func ValidateSession(token string) (string, *Customer, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return "", nil, fmt.Errorf("empty token")
	}
	hashed := hashHex(token)
	var phone string
	var expiresAt time.Time
	// Support both new hashed rows and legacy plaintext (48-char) during migration window
	err := database.DB.QueryRow(`SELECT phone, expires_at FROM customer_sessions WHERE token=$1 OR token=$2 LIMIT 1`, hashed, token).Scan(&phone, &expiresAt)
	if err == sql.ErrNoRows {
		return "", nil, fmt.Errorf("invalid token")
	}
	if err != nil {
		return "", nil, err
	}
	if time.Now().After(expiresAt) {
		// delete both hash and legacy plain
		database.DB.Exec(`DELETE FROM customer_sessions WHERE token=$1 OR token=$2`, hashed, token)
		return "", nil, fmt.Errorf("session expired")
	}
	cust, err := getCustomer(phone)
	if err != nil {
		// customer may have been deleted; still return phone
		return phone, nil, nil
	}
	return phone, cust, nil
}

// DeleteSession removes a token (logout).
func DeleteSession(token string) error {
	hashed := hashHex(strings.TrimSpace(token))
	_, err := database.DB.Exec(`DELETE FROM customer_sessions WHERE token=$1 OR token=$2`, hashed, strings.TrimSpace(token))
	return err
}

// CustomerOrderByIdentifier fetches an order if it belongs to phone (either 10-digit or 91-prefixed).
func CustomerOrderByIdentifier(phone, identifier string) (*WebsiteOrderResult, error) {
	// try numeric id vs order_number, with phone ownership check (both 10-digit and 91+ forms)
	candidates := []string{phone}
	if len(phone) == 10 {
		candidates = append(candidates, "91"+phone)
	} else if len(phone) == 12 && phone[:2] == "91" {
		candidates = append(candidates, phone[2:])
	}
	for _, p := range candidates {
		var orderID int
		var q string
		var arg interface{}
		if isNumericID(identifier) {
			q = `SELECT id FROM orders WHERE id = $1 AND customer_phone = $2`
			arg = identifier
		} else {
			q = `SELECT id FROM orders WHERE order_number = $1 AND customer_phone = $2`
			arg = identifier
		}
		err := database.DB.QueryRow(q, arg, p).Scan(&orderID)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return nil, err
		}
		return dummyWebsiteOrderService().getByID(orderID)
	}
	return nil, nil
}

// dummyWebsiteOrderService returns a minimal service to reuse getByID without circular deps.
func dummyWebsiteOrderService() *WebsiteOrderService {
	return &WebsiteOrderService{}
}

// CleanupExpired purges stale rows (call periodically or on each request lazily).
func CleanupExpired() {
	database.DB.Exec(`DELETE FROM customer_otps WHERE expires_at < CURRENT_TIMESTAMP`)
	database.DB.Exec(`DELETE FROM customer_sessions WHERE expires_at < CURRENT_TIMESTAMP`)
}
