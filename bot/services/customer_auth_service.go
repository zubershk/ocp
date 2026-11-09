package services

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

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
const defaultSessionExpiry = 30 * 24 * time.Hour

// sessionTTL returns the configured customer session lifetime.
// Env CUSTOMER_SESSION_TTL_SECONDS overrides the 30d default; invalid values fall back to default.
func sessionTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("CUSTOMER_SESSION_TTL_SECONDS"))
	if raw != "" {
		if secs, err := strconv.Atoi(raw); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return defaultSessionExpiry
}

func hashHex(s string) string {
	pepper := os.Getenv("OTP_PEPPER")
	if pepper == "" {
		// Fail closed: OTP_PEPPER is required. Do not fall back to BOT_ADMIN_KEY.
		panic("OTP_PEPPER environment variable is required for session hashing")
	}
	h := sha256.Sum256([]byte(pepper + s))
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
		if r >= '0' && r <= '9' {
			return r
		}
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

// SendOTP creates a fresh OTP and sends it on WhatsApp (open-source wrapper uses default tenant).
func SendOTP(phone string, evolution *EvolutionClient) (string, error) {
	return SendOTPFor(phone, 0, evolution)
}

// SendOTPFor is tenant-aware (phone,restaurant_id).
func SendOTPFor(phone string, restaurantID int, evolution *EvolutionClient) (string, error) {
	normalized, err := normalizeAuthPhone(phone)
	if err != nil {
		return "", &ValidationError{Msg: "enter a valid 10-digit mobile number"}
	}
	if restaurantID == 0 && !IsSingleTenantMode() {
		return "", ErrTenantRequired
	}
	rid := ResolveRestaurant(restaurantID)
	// cooldown check per tenant (use DB clock to avoid client/server TZ skew)
	var secondsAgo float64
	err = database.DB.QueryRow(`SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) FROM customer_otps WHERE phone=$1 AND restaurant_id=$2 ORDER BY id DESC LIMIT 1`, normalized, rid).Scan(&secondsAgo)
	if err == nil && secondsAgo < otpCooldown.Seconds() {
		remaining := otpCooldown.Seconds() - secondsAgo
		if remaining < 1 {
			remaining = 1
		}
		return "", &ValidationError{Msg: fmt.Sprintf("please wait %d seconds before requesting a new code", int(remaining)+1)}
	}
	if err != nil && err != sql.ErrNoRows {
		return "", fmt.Errorf("otp lookup failed: %w", err)
	}
	var dailyCount int
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM customer_otps WHERE phone=$1 AND restaurant_id=$2 AND created_at > NOW() - INTERVAL '24 hours'`, normalized, rid).Scan(&dailyCount)
	if dailyCount >= 10 {
		return "", &ValidationError{Msg: "too many codes sent today — try again tomorrow"}
	}
	code, err := randomOTP()
	if err != nil {
		return "", err
	}
	if _, err := database.DB.Exec(`DELETE FROM customer_otps WHERE phone=$1 AND restaurant_id=$2`, normalized, rid); err != nil {
		return "", err
	}
	expires := time.Now().Add(otpExpiry)
	hashed := hashHex(code)
	if _, err := database.DB.Exec(`INSERT INTO customer_otps (phone, code, expires_at, restaurant_id) VALUES ($1,$2,$3,$4)`, normalized, hashed, expires, rid); err != nil {
		// fallback for DBs without column during transition
		if _, err2 := database.DB.Exec(`INSERT INTO customer_otps (phone, code, expires_at) VALUES ($1,$2,$3)`, normalized, hashed, expires); err2 != nil {
			return "", err
		}
	}
	dest := whatsappDest(normalized)
	if dest == "" {
		return "", &ValidationError{Msg: "invalid phone number"}
	}
	msg := Msg("notification_otp", map[string]interface{}{"Code": code})
	if err := evolution.SendText(dest, msg); err != nil {
		// Evolution GO may not be running (e.g., native Windows without Docker).
		// Log the OTP so it can be used for testing/development.
		log.Printf("[auth] WhatsApp send failed for %s: %v", normalized, err)
		log.Printf("[auth] OTP for %s: %s (expires in 5 min)", normalized, code)
		return code, fmt.Errorf("whatsapp send failed: %w", err)
	}
	return code, nil
}

// VerifyOTP checks code, creates session, and upserts customer profile (open-source wrapper).
func VerifyOTP(phone, code, name string) (string, *Customer, error) {
	return VerifyOTPFor(phone, code, name, 0)
}

// VerifyPassword verifies a plaintext password against a customer's stored hash by customer ID.
// Used by change-password endpoint.
func VerifyPassword(customerID int, password string, restaurantID int) error {
	if database.DB == nil {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return ErrTenantRequired
	}
	var currentHash sql.NullString
	err := database.DB.QueryRow(`SELECT password_hash FROM customers WHERE id = $1 AND restaurant_id = $2`, customerID, rid).Scan(&currentHash)
	if err == sql.ErrNoRows {
		return &ValidationError{Msg: "customer not found"}
	}
	if err != nil {
		return err
	}
	if !currentHash.Valid || !checkPassword(password, currentHash.String) {
		return &ValidationError{Msg: "current password is incorrect"}
	}
	return nil
}

// VerifyOTPFor is tenant-aware.
func VerifyOTPFor(phone, code, name string, restaurantID int) (string, *Customer, error) {
	normalized, err := normalizeAuthPhone(phone)
	if err != nil {
		return "", nil, &ValidationError{Msg: "invalid phone number"}
	}
	if restaurantID == 0 && !IsSingleTenantMode() {
		return "", nil, ErrTenantRequired
	}
	rid := ResolveRestaurant(restaurantID)
	code = strings.TrimSpace(code)
	if code == "" {
		return "", nil, &ValidationError{Msg: "enter the 6-digit code"}
	}
	tx, err := database.DB.Begin()
	if err != nil {
		return "", nil, err
	}
	defer tx.Rollback()
	var rowID int
	var stored string
	var attempts int
	var expiresAt time.Time
	err = tx.QueryRow(`SELECT id, code, attempts, expires_at FROM customer_otps WHERE phone=$1 AND restaurant_id=$2 ORDER BY id DESC LIMIT 1 FOR UPDATE`, normalized, rid).Scan(&rowID, &stored, &attempts, &expiresAt)
	if err == sql.ErrNoRows {
		// fallback to global during transition
		err = tx.QueryRow(`SELECT id, code, attempts, expires_at FROM customer_otps WHERE phone=$1 ORDER BY id DESC LIMIT 1 FOR UPDATE`, normalized).Scan(&rowID, &stored, &attempts, &expiresAt)
		if err == sql.ErrNoRows {
			return "", nil, &ValidationError{Msg: "no code found — request a new one"}
		}
	}
	if err != nil {
		return "", nil, err
	}
	if time.Now().After(expiresAt) {
		tx.Exec(`DELETE FROM customer_otps WHERE phone=$1 AND restaurant_id=$2`, normalized, rid)
		_ = tx.Commit()
		return "", nil, &ValidationError{Msg: "code expired — request a new one"}
	}
	if attempts >= 3 {
		tx.Exec(`DELETE FROM customer_otps WHERE phone=$1 AND restaurant_id=$2`, normalized, rid)
		_ = tx.Commit()
		return "", nil, &ValidationError{Msg: "too many attempts — request a new code"}
	}
	if len(stored) == 6 {
		if subtle.ConstantTimeCompare([]byte(stored), []byte(code)) != 1 {
			tx.Exec(`UPDATE customer_otps SET attempts=attempts+1 WHERE id=$1`, rowID)
			_ = tx.Commit()
			return "", nil, &ValidationError{Msg: "incorrect code"}
		}
	} else if subtle.ConstantTimeCompare([]byte(stored), []byte(hashHex(code))) != 1 {
		tx.Exec(`UPDATE customer_otps SET attempts=attempts+1 WHERE id=$1`, rowID)
		_ = tx.Commit()
		return "", nil, &ValidationError{Msg: "incorrect code"}
	}
	tx.Exec(`DELETE FROM customer_otps WHERE phone=$1 AND restaurant_id=$2`, normalized, rid)
	if err := tx.Commit(); err != nil {
		return "", nil, err
	}
	if _, err := GetOrCreateCustomerFor(normalized, rid); err != nil {
		return "", nil, err
	}
	if strings.TrimSpace(name) != "" {
		if len(strings.TrimSpace(name)) > 100 {
			name = strings.TrimSpace(name)[:100]
		}
		_ = UpdateCustomerProfileFor(normalized, rid, map[string]string{"name": strings.TrimSpace(name)})
	}
	cust, err := getCustomerFor(normalized, rid)
	if err != nil {
		return "", nil, err
	}
	token, err := randomToken()
	if err != nil {
		return "", nil, err
	}
	expires := time.Now().Add(sessionTTL())
	hashedToken := hashHex(token)
	if _, err := database.DB.Exec(`INSERT INTO customer_sessions (phone, token, expires_at, restaurant_id) VALUES ($1,$2,$3,$4)`, normalized, hashedToken, expires, rid); err != nil {
		if _, err2 := database.DB.Exec(`INSERT INTO customer_sessions (phone, token, expires_at) VALUES ($1,$2,$3)`, normalized, hashedToken, expires); err2 != nil {
			return "", nil, err
		}
	}
	return token, cust, nil
}

// ValidateSession returns the phone and customer for a valid token (open-source wrapper).
func ValidateSession(token string) (string, *Customer, error) {
	return ValidateSessionFor(token, 0)
}

// ValidateSessionFor is tenant-aware: session must belong to request tenant.
// ValidateSessionFor is tenant-aware: session must belong to request tenant.
func ValidateSessionFor(token string, restaurantID int) (string, *Customer, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return "", nil, fmt.Errorf("empty token")
	}
	hashed := hashHex(token)
	var phone string
	var email string
	var expiresAt time.Time
	var sessRid sql.NullInt64
	err := database.DB.QueryRow(`SELECT phone, email, expires_at, restaurant_id FROM customer_sessions WHERE token=$1 LIMIT 1`, hashed).Scan(&phone, &email, &expiresAt, &sessRid)
	if err == sql.ErrNoRows {
		return "", nil, fmt.Errorf("invalid token")
	}
	if err != nil {
		return "", nil, err
	}
	// Sliding rotation: if more than half the TTL has elapsed, extend expiry to now+TTL.
	// This keeps active users logged in without extending idle sessions indefinitely.
	ttl := sessionTTL()
	// Only rotate when the session is within the last quarter of its TTL,
	// cutting DB write amplification on active sessions ~4x.
	if time.Until(expiresAt) < ttl/4 {
		newExp := time.Now().Add(ttl)
		_, _ = database.DB.Exec(`UPDATE customer_sessions SET expires_at=$1 WHERE token=$2`, newExp, hashed)
		expiresAt = newExp
	}
	// tenant check: if request has tenant, session must match or be global (NULL) for transition
	if restaurantID != 0 {
		reqRid := ResolveRestaurant(restaurantID)
		if sessRid.Valid && int(sessRid.Int64) != reqRid {
			return "", nil, fmt.Errorf("invalid token")
		}
	} else if !IsSingleTenantMode() {
		// strict SaaS requires tenant
		if sessRid.Valid && sessRid.Int64 != 0 {
			// session has tenant but request did not provide … reject
			return "", nil, ErrTenantRequired
		}
	}
	var cust *Customer
	var cerr error
	// Prefer email lookup (email-based login), fall back to phone (WhatsApp OTP login)
	if email != "" {
		cust, cerr = GetCustomerByEmail(email, int(sessRid.Int64))
	} else {
		if sessRid.Valid && sessRid.Int64 != 0 {
			cust, cerr = getCustomerFor(phone, int(sessRid.Int64))
		} else {
			cust, cerr = getCustomer(phone)
		}
	}
	if cerr != nil {
		return phone, nil, nil
	}
	return phone, cust, nil
}

// DeleteSession removes a token (logout).
func DeleteSession(token string) error {
	raw := strings.TrimSpace(token)
	if raw == "" {
		return nil
	}
	hashed := hashHex(raw)
	_, err := database.DB.Exec(`DELETE FROM customer_sessions WHERE token=$1`, hashed)
	return err
}

// CustomerOrderByIdentifier fetches an order if it belongs to phone (either 10-digit or 91-prefixed).
// Scoped to the phone owner's restaurant so tenants never resolve each other's orders.
func CustomerOrderByIdentifier(phone, identifier string) (*WebsiteOrderResult, error) {
	// try numeric id vs order_number, with phone ownership check (both 10-digit and 91+ forms)
	rid := restaurantForPhone(phone)
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
			q = `SELECT id FROM orders WHERE id = $1 AND customer_phone = $2 AND restaurant_id = $3`
			arg = identifier
		} else {
			q = `SELECT id FROM orders WHERE order_number = $1 AND customer_phone = $2 AND restaurant_id = $3`
			arg = identifier
		}
		err := database.DB.QueryRow(q, arg, p, rid).Scan(&orderID)
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
	database.DB.Exec(`DELETE FROM customer_email_verification WHERE expires_at < CURRENT_TIMESTAMP`)
	database.DB.Exec(`DELETE FROM customer_password_reset WHERE expires_at < CURRENT_TIMESTAMP`)
	database.DB.Exec(`DELETE FROM customer_login_attempts WHERE locked_until < CURRENT_TIMESTAMP AND attempts = 0`)
}

// hashPassword bcrypt-hashes a plaintext password with cost 12.
func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// checkPassword compares a plaintext password against a bcrypt hash using constant-time comparison.
func checkPassword(password, hash string) bool {
	if hash == "" {
		return false
	}
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// sendResendEmail sends an email via Resend API.
// getRestaurantName fetches the restaurant name from restaurant_config.
func getRestaurantName(restaurantID int) string {
	rid := ResolveRestaurant(restaurantID)
	var name string
	err := database.DB.QueryRow(`SELECT name FROM restaurant_config WHERE restaurant_id=$1 LIMIT 1`, rid).Scan(&name)
	if err != nil || name == "" {
		return "Restaurant"
	}
	return name
}

func sendResendEmail(to, subject, html string) error {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		// In dev mode without Resend configured, log instead of sending
		log.Printf("[email] RESEND_API_KEY not set. Would send to %s: %s", to, subject)
		return nil
	}

	type emailRequest struct {
		From    string `json:"from"`
		To      []string `json:"to"`
		Subject string `json:"subject"`
		Html    string `json:"html"`
	}

	fromName := os.Getenv("RESEND_FROM_NAME")
	if fromName == "" {
		fromName = "Restaurant"
	}
	reqBody, err := json.Marshal(emailRequest{
		From:    fromName + " <onboarding@resend.dev>",
		To:      []string{to},
		Subject: subject,
		Html:    html,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal email request: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(reqBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend API returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// ValidatePasswordStrength enforces minimum security requirements for new passwords.
func ValidatePasswordStrength(password string) error {
	if len(password) < 8 {
		return &ValidationError{Msg: "password must be at least 8 characters"}
	}
	if len(password) > 128 {
		return &ValidationError{Msg: "password must be less than 128 characters"}
	}
	hasUpper := false
	hasLower := false
	hasDigit := false
	hasSpecial := false
	for _, ch := range password {
		switch {
		case ch >= 'A' && ch <= 'Z':
			hasUpper = true
		case ch >= 'a' && ch <= 'z':
			hasLower = true
		case ch >= '0' && ch <= '9':
			hasDigit = true
		default:
			hasSpecial = true
		}
	}
	if !hasUpper {
		return &ValidationError{Msg: "password must contain at least one uppercase letter"}
	}
	if !hasLower {
		return &ValidationError{Msg: "password must contain at least one lowercase letter"}
	}
	if !hasDigit {
		return &ValidationError{Msg: "password must contain at least one digit"}
	}
	if !hasSpecial {
		return &ValidationError{Msg: "password must contain at least one special character"}
	}
	return nil
}

// ValidateEmailFormat performs basic email format validation.
func ValidateEmailFormat(email string) error {
	email = strings.TrimSpace(email)
	if email == "" {
		return &ValidationError{Msg: "email is required"}
	}
	if len(email) > 254 {
		return &ValidationError{Msg: "email is too long"}
	}
	atCount := strings.Count(email, "@")
	if atCount != 1 {
		return &ValidationError{Msg: "invalid email format"}
	}
	parts := strings.Split(email, "@")
	if len(parts[0]) == 0 || len(parts[1]) == 0 {
		return &ValidationError{Msg: "invalid email format"}
	}
	if !strings.Contains(parts[1], ".") {
		return &ValidationError{Msg: "invalid email format"}
	}
	if strings.Contains(parts[0], "..") || strings.Contains(parts[1], "..") {
		return &ValidationError{Msg: "invalid email format"}
	}
	return nil
}

// CheckLoginAttempts returns an error if the account is locked due to too many failed attempts.
func CheckLoginAttempts(email string, restaurantID int) error {
	if database.DB == nil {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	var attempts int
	var lockedUntil *time.Time
	err := database.DB.QueryRow(`SELECT attempts, locked_until FROM customer_login_attempts WHERE email = $1 AND restaurant_id = $2`, email, rid).Scan(&attempts, &lockedUntil)
	if err == sql.ErrNoRows {
		return nil // no attempts yet
	}
	if err != nil {
		return nil // treat DB errors as non-blocking
	}
	if attempts >= 5 && lockedUntil != nil && time.Now().Before(*lockedUntil) {
		remaining := time.Until(*lockedUntil)
		return &ValidationError{Msg: fmt.Sprintf("account temporarily locked. Try again in %d minutes", int(remaining.Minutes())+1)}
	}
	return nil
}

// RecordLoginFailure increments the attempt counter and locks the account after 5 failures.
func RecordLoginFailure(email string, restaurantID int) error {
	if database.DB == nil {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	_, err := database.DB.Exec(`
		INSERT INTO customer_login_attempts (email, restaurant_id, attempts, updated_at)
		VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
		ON CONFLICT (email, restaurant_id) DO UPDATE SET
			attempts = customer_login_attempts.attempts + 1,
			updated_at = CURRENT_TIMESTAMP
	`, email, rid)
	if err != nil {
		return err
	}
	var attempts int
	database.DB.QueryRow(`SELECT attempts FROM customer_login_attempts WHERE email = $1 AND restaurant_id = $2`, email, rid).Scan(&attempts)
	if attempts >= 5 {
		lockedUntil := time.Now().Add(15 * time.Minute)
		database.DB.Exec(`UPDATE customer_login_attempts SET locked_until = $1 WHERE email = $2 AND restaurant_id = $3`, lockedUntil, email, rid)
	}
	return nil
}

// ResetLoginAttempts clears the failure counter after a successful login.
func ResetLoginAttempts(email string, restaurantID int) error {
	if database.DB == nil {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	_, err := database.DB.Exec(`DELETE FROM customer_login_attempts WHERE email = $1 AND restaurant_id = $2`, email, rid)
	return err
}

// GetCustomerByEmail looks up a customer by email address (tenant-aware).
func GetCustomerByEmail(email string, restaurantID int) (*Customer, error) {
	if email == "" {
		return nil, &ValidationError{Msg: "email is required"}
	}
	if database.DB == nil {
		return nil, nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return nil, ErrTenantRequired
	}
	row := database.DB.QueryRow(`
		SELECT id, whatsapp_number, name, email, default_address, landmark,
		       total_orders, total_spent, password_hash
		FROM customers WHERE email = $1 AND restaurant_id = $2
	`, strings.TrimSpace(email), rid)

	var c Customer
	var wa sql.NullString
	err := row.Scan(&c.ID, &wa, &c.Name, &c.Email,
		&c.DefaultAddress, &c.Landmark, &c.TotalOrders, &c.TotalSpent,
		&c.PasswordHash)
	if err != nil {
		return nil, err
	}
	if wa.Valid {
		c.WhatsAppNumber = wa.String
	}
	c.FirstName = c.displayName()
	return &c, nil
}

// getCustomerByID fetches a customer by ID (tenant-aware).
func getCustomerByID(id, restaurantID int) (*Customer, error) {
	if database.DB == nil {
		return nil, nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return nil, ErrTenantRequired
	}
	row := database.DB.QueryRow(`
		SELECT id, whatsapp_number, name, email, default_address, landmark,
		       total_orders, total_spent, password_hash
		FROM customers WHERE id = $1 AND restaurant_id = $2
	`, id, rid)

	var c Customer
	var wa sql.NullString
	err := row.Scan(&c.ID, &wa, &c.Name, &c.Email,
		&c.DefaultAddress, &c.Landmark, &c.TotalOrders, &c.TotalSpent,
		&c.PasswordHash)
	if err == nil && wa.Valid {
		c.WhatsAppNumber = wa.String
	}
	if err != nil {
		return nil, err
	}
	c.FirstName = c.displayName()
	return &c, nil
}

// RegisterCustomer creates a new customer with email + password.
// Phone is optional for web-only registration; if provided it syncs with WhatsApp bot.
// auth_provider is set to 'email' or 'both' accordingly.
// Returns the customer without password_hash.
func RegisterCustomer(email, password, phone, name string, restaurantID int) (*Customer, error) {
	email = strings.TrimSpace(email)
	if err := ValidateEmailFormat(email); err != nil {
		return nil, err
	}
	if err := ValidatePasswordStrength(password); err != nil {
		return nil, err
	}
	if database.DB == nil {
		return nil, nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return nil, ErrTenantRequired
	}

	// Check if email already exists
	existing, err := GetCustomerByEmail(email, rid)
	if err == nil && existing != nil {
		return nil, &ValidationError{Msg: "email already registered"}
	}

	hashedPassword, err := hashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Normalize phone if provided
	var whatsappNumber string
	var hasPhone bool
	if strings.TrimSpace(phone) != "" {
		normalized, err := normalizeAuthPhone(phone)
		if err == nil && normalized != "" {
			whatsappNumber = normalized
			hasPhone = true
		}
	}

	// Determine auth provider
	authProvider := "email"
	if hasPhone {
		authProvider = "both"
	}

	// Insert new customer. Use NULL for whatsapp_number when no phone is
	// provided so the (whatsapp_number, restaurant_id) unique constraint
	// does not collide on empty strings.
	var phoneVal interface{}
	if hasPhone {
		phoneVal = whatsappNumber
	}
	var id int
	err = database.DB.QueryRow(`
		INSERT INTO customers (email, password_hash, whatsapp_number, auth_provider, name, last_seen_at, restaurant_id)
		VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
		RETURNING id
	`, email, hashedPassword, phoneVal, authProvider, name, rid).Scan(&id)
	if err != nil {
		// Fallback for DBs still on old global unique (pre-027) during transition
		_, _ = database.DB.Exec(`
			INSERT INTO customers (email, password_hash, whatsapp_number, auth_provider, name, last_seen_at)
			VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
			ON CONFLICT (email) DO NOTHING
		`, email, hashedPassword, phoneVal, authProvider, name)
		var id2 int
		err = database.DB.QueryRow(`SELECT id FROM customers WHERE email = $1`, email).Scan(&id2)
		if err != nil {
			return nil, err
		}
		id = id2
	}

	// Get the created customer
	cust, err := getCustomerByID(id, rid)
	if err != nil {
		return nil, err
	}
	return cust, nil
}

// LoginCustomer authenticates with email + password and returns a session token.
// Implements login attempt tracking, lockout, and session regeneration.
func LoginCustomer(email, password string, restaurantID int) (string, *Customer, error) {
	email = strings.TrimSpace(email)
	if err := ValidateEmailFormat(email); err != nil {
		return "", nil, err
	}
	if password == "" {
		return "", nil, &ValidationError{Msg: "password is required"}
	}
	if database.DB == nil {
		return "", nil, nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return "", nil, ErrTenantRequired
	}

	// Check lockout before anything else
	if err := CheckLoginAttempts(email, rid); err != nil {
		return "", nil, err
	}

	// Look up customer by email
	cust, err := GetCustomerByEmail(email, rid)
	if err != nil || cust == nil {
		// Always record a failure to prevent timing attacks / user enumeration
		_ = RecordLoginFailure(email, rid)
		return "", nil, &ValidationError{Msg: "invalid email or password"}
	}

	// Verify password
	if !cust.PasswordHash.Valid || !checkPassword(password, cust.PasswordHash.String) {
		_ = RecordLoginFailure(email, rid)
		return "", nil, &ValidationError{Msg: "invalid email or password"}
	}

	// Reset failure counter on successful auth
	_ = ResetLoginAttempts(email, rid)

	// SESSION FIXATION PROTECTION: Delete all existing sessions for this email
	// before issuing a new one. This prevents session fixation attacks.
	_, _ = database.DB.Exec(`DELETE FROM customer_sessions WHERE email = $1 AND restaurant_id = $2`, email, rid)

	// Create new session token
	token, err := randomToken()
	if err != nil {
		return "", nil, err
	}
	expires := time.Now().Add(sessionTTL())
	hashedToken := hashHex(token)

	_, err = database.DB.Exec(`
		INSERT INTO customer_sessions (phone, email, token, expires_at, restaurant_id)
		VALUES ($1,$2,$3,$4,$5)
	`, cust.WhatsAppNumber, email, hashedToken, expires, rid)
	if err != nil {
		if _, err2 := database.DB.Exec(`
			INSERT INTO customer_sessions (phone, email, token, expires_at)
			VALUES ($1,$2,$3,$4)`, cust.WhatsAppNumber, email, hashedToken, expires); err2 != nil {
			return "", nil, err2
		}
	}

	// Update last_seen
	_, _ = database.DB.Exec(`UPDATE customers SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1`, cust.ID)

	return token, cust, nil
}

// RequestPasswordReset generates a password reset token and sends it via email.
// Returns nil on success (email queued), error only on system failure.
// Does NOT reveal whether the email exists (prevents enumeration).
func RequestPasswordReset(email string, restaurantID int) error {
	email = strings.TrimSpace(email)
	if err := ValidateEmailFormat(email); err != nil {
		return err
	}
	if database.DB == nil {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return ErrTenantRequired
	}

	// Check if email exists (don't reveal if it doesn't)
	cust, err := GetCustomerByEmail(email, rid)
	if err != nil || cust == nil {
		// Generate and discard a token to prevent timing attacks / email enumeration
		_, _ = randomToken()
		return nil
	}

	// Generate reset token
	token, err := randomToken()
	if err != nil {
		return err
	}
	hashedToken := hashHex(token)
	expires := time.Now().Add(15 * time.Minute) // 15 minute expiry for reset

	_, err = database.DB.Exec(`
		INSERT INTO customer_password_reset (email, restaurant_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (email, restaurant_id) WHERE used_at IS NULL DO UPDATE SET
			token_hash = EXCLUDED.token_hash,
			expires_at = EXCLUDED.expires_at,
			created_at = CURRENT_TIMESTAMP,
			used_at = NULL
	`, email, rid, hashedToken, expires)
	if err != nil {
		// Fallback for DBs without partial unique index support
		_, _ = database.DB.Exec(`
			INSERT INTO customer_password_reset (email, restaurant_id, token_hash, expires_at)
			VALUES ($1, $2, $3, $4)
		`, email, rid, hashedToken, expires)
	}

	// Send email via Resend
	resetURL := os.Getenv("RESET_PASSWORD_URL")
	if resetURL == "" {
		resetURL = "https://api.yourdomain.com/r/reset-password"
	}
	html := fmt.Sprintf(`
		<h2>Password Reset</h2>
		<p>Hi %s,</p>
		<p>You requested a password reset for your %s account.</p>
		<p>Click the button below to reset your password:</p>
		<p><a href="%s?token=%s" style="background:#ea580c;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Reset Password</a></p>
		<p>This link expires in 15 minutes. If you didn't request this, please ignore this email.</p>
		<p>Thanks,<br>The %s Team</p>
	`, cust.Name.String, getRestaurantName(rid), resetURL, token, getRestaurantName(rid))

	if err := sendResendEmail(email, "Reset your OCP password", html); err != nil {
		log.Printf("[auth] failed to send password reset email to %s: %v", email, err)
		// Don't return error - token is stored, user can retry
	}

	return nil
}

// ResetPassword validates a reset token and sets a new password.
func ResetPassword(token, newPassword string, restaurantID int) error {
	if err := ValidatePasswordStrength(newPassword); err != nil {
		return err
	}
	if database.DB == nil {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return ErrTenantRequired
	}

	hashedToken := hashHex(token)
	var email string
	var expiresAt time.Time
	var usedAt *time.Time
	err := database.DB.QueryRow(`
		SELECT email, expires_at, used_at FROM customer_password_reset
		WHERE token_hash = $1 AND restaurant_id = $2
	`, hashedToken, rid).Scan(&email, &expiresAt, &usedAt)
	if err == sql.ErrNoRows {
		return &ValidationError{Msg: "invalid or expired reset token"}
	}
	if err != nil {
		return err
	}
	if usedAt != nil {
		return &ValidationError{Msg: "reset token already used"}
	}
	if time.Now().After(expiresAt) {
		return &ValidationError{Msg: "reset token expired"}
	}

	// Update password
	hashedPassword, err := hashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	_, err = database.DB.Exec(`
		UPDATE customers SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
		WHERE email = $2 AND restaurant_id = $3
	`, hashedPassword, email, rid)
	if err != nil {
		return err
	}

	// Mark token as used
	_, _ = database.DB.Exec(`UPDATE customer_password_reset SET used_at = CURRENT_TIMESTAMP WHERE token_hash = $1`, hashedToken)

	// Invalidate all existing sessions for this email (force re-login)
	_, _ = database.DB.Exec(`DELETE FROM customer_sessions WHERE email = $1 AND restaurant_id = $2`, email, rid)

	return nil
}

// VerifyEmail verifies an email verification token.
func VerifyEmail(token string, restaurantID int) error {
	if database.DB == nil {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return ErrTenantRequired
	}

	hashedToken := hashHex(token)
	var email string
	var expiresAt time.Time
	var verifiedAt *time.Time
	err := database.DB.QueryRow(`
		SELECT email, expires_at, verified_at FROM customer_email_verification
		WHERE token_hash = $1 AND restaurant_id = $2
	`, hashedToken, rid).Scan(&email, &expiresAt, &verifiedAt)
	if err == sql.ErrNoRows {
		return &ValidationError{Msg: "invalid or expired verification token"}
	}
	if err != nil {
		return err
	}
	if verifiedAt != nil {
		return &ValidationError{Msg: "email already verified"}
	}
	if time.Now().After(expiresAt) {
		return &ValidationError{Msg: "verification token expired"}
	}

	// Mark email as verified
	_, err = database.DB.Exec(`
		UPDATE customers SET email_verified = TRUE, updated_at = CURRENT_TIMESTAMP
		WHERE email = $1 AND restaurant_id = $2
	`, email, rid)
	if err != nil {
		return err
	}

	// Mark token as used
	_, _ = database.DB.Exec(`UPDATE customer_email_verification SET verified_at = CURRENT_TIMESTAMP WHERE token_hash = $1`, hashedToken)

	return nil
}

// RequestEmailVerification generates an email verification token and sends it via email.
// Returns nil on success, error only on system failure.
func RequestEmailVerification(email string, restaurantID int) error {
	email = strings.TrimSpace(email)
	if err := ValidateEmailFormat(email); err != nil {
		return err
	}
	if database.DB == nil {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid == 0 && !IsSingleTenantMode() {
		return ErrTenantRequired
	}

	// Check if email exists
	cust, err := GetCustomerByEmail(email, rid)
	if err != nil || cust == nil {
		return &ValidationError{Msg: "email not found"}
	}

	// Generate verification token
	token, err := randomToken()
	if err != nil {
		return err
	}
	hashedToken := hashHex(token)
	expires := time.Now().Add(24 * time.Hour) // 24 hour expiry for verification

	_, err = database.DB.Exec(`
		INSERT INTO customer_email_verification (email, restaurant_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (email, restaurant_id) WHERE verified_at IS NULL DO UPDATE SET
			token_hash = EXCLUDED.token_hash,
			expires_at = EXCLUDED.expires_at,
			created_at = CURRENT_TIMESTAMP,
			verified_at = NULL
	`, email, rid, hashedToken, expires)
	if err != nil {
		// Fallback
		_, _ = database.DB.Exec(`
			INSERT INTO customer_email_verification (email, restaurant_id, token_hash, expires_at)
			VALUES ($1, $2, $3, $4)
		`, email, rid, hashedToken, expires)
	}

	// Send verification email via Resend
	verifyURL := os.Getenv("EMAIL_VERIFY_URL")
	if verifyURL == "" {
		verifyURL = "https://api.yourdomain.com/r/verify-email"
	}
	html := fmt.Sprintf(`
		<h2>Verify Your Email</h2>
		<p>Hi %s,</p>
		<p>Welcome to %s! Please verify your email address by clicking the button below:</p>
		<p><a href="%s?token=%s" style="background:#ea580c;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Verify Email</a></p>
		<p>This link expires in 24 hours.</p>
		<p>Thanks,<br>The %s Team</p>
	`, cust.Name.String, getRestaurantName(rid), verifyURL, token, getRestaurantName(rid))

	if err := sendResendEmail(email, "Verify your email - "+getRestaurantName(rid), html); err != nil {
		log.Printf("[auth] failed to send verification email to %s: %v", email, err)
		// Don't return error - token is stored, user can retry
	}

	return nil
}

// ------------------------------------------------------------------
// Password history, CSRF tokens, session management, and IP rate limiting
// ============================================================

// CheckPasswordHistory checks if the new password matches any of the last 5 passwords.
func CheckPasswordHistory(customerID int, newPassword string) error {
	if database.DB == nil {
		return nil
	}
	hashedNewPassword, err := hashPassword(newPassword)
	if err != nil {
		return err
	}
	var count int
	err = database.DB.QueryRow(`SELECT COUNT(*) FROM customer_password_history WHERE customer_id = $1 AND password_hash = $2`, customerID, hashedNewPassword).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return &ValidationError{Msg: "password has been used previously. Please choose a different password"}
	}
	return nil
}

// StorePasswordHistory saves the current password hash to history before changing.
func StorePasswordHistory(customerID int, passwordHash string) error {
	if database.DB == nil {
		return nil
	}
	var count int
	database.DB.QueryRow(`SELECT COUNT(*) FROM customer_password_history WHERE customer_id = $1`, customerID).Scan(&count)
	if count >= 5 {
		database.DB.Exec(`
			DELETE FROM customer_password_history
			WHERE customer_id = $1 AND id IN (
				SELECT id FROM customer_password_history
				WHERE customer_id = $1
				ORDER BY created_at ASC
				LIMIT 1
			)
		`, customerID)
	}
	_, err := database.DB.Exec(`INSERT INTO customer_password_history (customer_id, password_hash) VALUES ($1, $2)`, customerID, passwordHash)
	return err
}

// ChangePassword changes a user's password with history check.
// Requires current password verification.
func ChangePassword(customerID int, currentPassword, newPassword string) error {
	if database.DB == nil {
		return nil
	}
	if err := ValidatePasswordStrength(newPassword); err != nil {
		return err
	}
	var currentHash sql.NullString
	err := database.DB.QueryRow(`SELECT password_hash FROM customers WHERE id = $1`, customerID).Scan(&currentHash)
	if err != nil {
		return &ValidationError{Msg: "customer not found"}
	}
	if !currentHash.Valid || !checkPassword(currentPassword, currentHash.String) {
		return &ValidationError{Msg: "current password is incorrect"}
	}
	if err := CheckPasswordHistory(customerID, newPassword); err != nil {
		return err
	}
	if currentHash.Valid {
		if err := StorePasswordHistory(customerID, currentHash.String); err != nil {
			return err
		}
	}
	newHash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}
	_, err = database.DB.Exec(`UPDATE customers SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, newHash, customerID)
	if err != nil {
		return err
	}
	_, _ = database.DB.Exec(`DELETE FROM customer_sessions WHERE customer_id = $1 AND token != $2`, customerID, "")
	return nil
}

// DeleteAccount deletes a customer account and all associated data.
// Requires password confirmation.
func DeleteAccount(customerID int, password string) error {
	if database.DB == nil {
		return nil
	}
	var currentHash sql.NullString
	err := database.DB.QueryRow(`SELECT password_hash FROM customers WHERE id = $1`, customerID).Scan(&currentHash)
	if err != nil {
		return &ValidationError{Msg: "customer not found"}
	}
	if !currentHash.Valid || !checkPassword(password, currentHash.String) {
		return &ValidationError{Msg: "incorrect password"}
	}
	_, _ = database.DB.Exec(`DELETE FROM customer_login_attempts WHERE email IN (SELECT email FROM customers WHERE id = $1)`, customerID)
	_, _ = database.DB.Exec(`DELETE FROM customer_email_verification WHERE email IN (SELECT email FROM customers WHERE id = $1)`, customerID)
	_, _ = database.DB.Exec(`DELETE FROM customer_password_reset WHERE email IN (SELECT email FROM customers WHERE id = $1)`, customerID)
	_, _ = database.DB.Exec(`DELETE FROM customer_password_history WHERE customer_id = $1`, customerID)
	_, _ = database.DB.Exec(`DELETE FROM customer_login_sessions WHERE customer_id = $1`, customerID)
	_, _ = database.DB.Exec(`DELETE FROM customer_csrf_tokens WHERE customer_id = $1`, customerID)
	_, _ = database.DB.Exec(`DELETE FROM customer_sessions WHERE email IN (SELECT email FROM customers WHERE id = $1)`, customerID)
	_, err = database.DB.Exec(`DELETE FROM customers WHERE id = $1`, customerID)
	return err
}

// GenerateCSRFToken creates a new CSRF token for the customer.
func GenerateCSRFToken(customerID int) (string, error) {
	if database.DB == nil {
		return "", nil
	}
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	hashedToken := hashHex(token)
	expires := time.Now().Add(24 * time.Hour)
	_, err = database.DB.Exec(`INSERT INTO customer_csrf_tokens (customer_id, token_hash, expires_at) VALUES ($1, $2, $3)`, customerID, hashedToken, expires)
	if err != nil {
		return "", err
	}
	return token, nil
}

// ValidateCSRFToken validates a CSRF token and consumes it (one-time use).
func ValidateCSRFToken(customerID int, token string) error {
	if database.DB == nil {
		return nil
	}
	hashedToken := hashHex(token)
	var expiresAt time.Time
	err := database.DB.QueryRow(`SELECT expires_at FROM customer_csrf_tokens WHERE customer_id = $1 AND token_hash = $2`, customerID, hashedToken).Scan(&expiresAt)
	if err == sql.ErrNoRows {
		return &ValidationError{Msg: "invalid CSRF token"}
	}
	if err != nil {
		return err
	}
	if time.Now().After(expiresAt) {
		_, _ = database.DB.Exec(`DELETE FROM customer_csrf_tokens WHERE customer_id = $1 AND token_hash = $2`, customerID, hashedToken)
		return &ValidationError{Msg: "CSRF token expired"}
	}
	_, _ = database.DB.Exec(`DELETE FROM customer_csrf_tokens WHERE customer_id = $1 AND token_hash = $2`, customerID, hashedToken)
	return nil
}

// ListCustomerSessions returns all active sessions for a customer.
func ListCustomerSessions(customerID int) ([]map[string]interface{}, error) {
	if database.DB == nil {
		return nil, nil
	}
	rows, err := database.DB.Query(`SELECT id, ip_address, user_agent, country_code, created_at, last_activity, is_active FROM customer_login_sessions WHERE customer_id = $1 AND is_active = true ORDER BY last_activity DESC`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sessions []map[string]interface{}
	for rows.Next() {
		var id int
		var ipAddress sql.NullString
		var userAgent sql.NullString
		var countryCode sql.NullString
		var createdAt, lastActivity time.Time
		var isActive bool
		if err := rows.Scan(&id, &ipAddress, &userAgent, &countryCode, &createdAt, &lastActivity, &isActive); err != nil {
			continue
		}
		sessions = append(sessions, map[string]interface{}{
			"id":            id,
			"ip_address":    ipAddress.String,
			"user_agent":    userAgent.String,
			"country_code":  countryCode.String,
			"created_at":    createdAt,
			"last_activity": lastActivity,
			"is_active":     isActive,
		})
	}
	return sessions, nil
}

// RevokeCustomerSession revokes a specific customer session.
func RevokeCustomerSession(customerID int, sessionID int) error {
	if database.DB == nil {
		return nil
	}
	_, err := database.DB.Exec(`UPDATE customer_login_sessions SET is_active = false, revoked_at = CURRENT_TIMESTAMP WHERE customer_id = $1 AND id = $2 AND is_active = true`, customerID, sessionID)
	return err
}

// RecordLoginSession records login location for security monitoring.
func RecordLoginSession(customerID int, restaurantID int, token string, ipAddress string, userAgent string, countryCode string) error {
	if database.DB == nil {
		return nil
	}
	hashedToken := hashHex(token)
	_, err := database.DB.Exec(`INSERT INTO customer_login_sessions (customer_id, restaurant_id, token_hash, ip_address, user_agent, country_code, created_at, last_activity, is_active) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)`, customerID, restaurantID, hashedToken, ipAddress, userAgent, countryCode)
	return err
}

// CheckIPRateLimit checks if an IP has exceeded rate limits for auth endpoints.
func CheckIPRateLimit(ipAddress string, endpoint string) (bool, error) {
	if database.DB == nil {
		return true, nil
	}
	var count int
	err := database.DB.QueryRow(`SELECT COUNT(*) FROM customer_login_attempts WHERE email = $1 AND created_at > NOW() - INTERVAL '10 minutes'`, ipAddress).Scan(&count)
	if err != nil && err != sql.ErrNoRows {
		return true, err
	}
	if count >= 20 {
		return false, nil
	}
	return true, nil
}

// RecordLoginAttemptIP records an IP-based login attempt for rate limiting.
func RecordLoginAttemptIP(ipAddress string) error {
	if database.DB == nil {
		return nil
	}
	_, err := database.DB.Exec(`INSERT INTO customer_login_attempts (email, restaurant_id, attempts, created_at) VALUES ($1, 0, 1, CURRENT_TIMESTAMP) ON CONFLICT (email, restaurant_id) DO UPDATE SET attempts = customer_login_attempts.attempts + 1, updated_at = CURRENT_TIMESTAMP`, ipAddress, 0)
	return err
}
