package handlers

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/services"
)

// AuthHandler serves POST /api/auth/* — web customer login synced to WhatsApp.
type AuthHandler struct {
	evolution *services.EvolutionClient
}

func NewAuthHandler(evolution *services.EvolutionClient) *AuthHandler {
	return &AuthHandler{evolution: evolution}
}

type sendOTPReq struct {
	Phone string `json:"phone" binding:"required"`
}

type verifyOTPReq struct {
	Phone string `json:"phone" binding:"required"`
	Code  string `json:"code" binding:"required"`
	Name  string `json:"name"`
}

// SendOTP handles POST /api/auth/send-otp
func (h *AuthHandler) SendOTP(c *gin.Context) {
	var req sendOTPReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "phone is required"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	code, err := services.SendOTPFor(req.Phone, rid, h.evolution)
	if err != nil {
		if ve, ok := err.(*services.ValidationError); ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		// WhatsApp send failure: OTP is already stored and verifiable.
		log.Printf("[auth] whatsapp send failed for %s: %v", req.Phone, err)
		log.Printf("[auth] OTP for %s: %s (expires in 5 min) — deliver via server log", req.Phone, code)
		c.JSON(http.StatusOK, gin.H{"sent": false, "delivered": false, "message": "code generated — check server logs (dev mode)"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sent": true, "delivered": true, "message": "code sent on WhatsApp"})
}

// VerifyOTP handles POST /api/auth/verify-otp
func (h *AuthHandler) VerifyOTP(c *gin.Context) {
	var req verifyOTPReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "phone and code are required"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	token, cust, err := services.VerifyOTPFor(req.Phone, req.Code, req.Name, rid)
	if err != nil {
		if ve, ok := err.(*services.ValidationError); ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "verification failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"customer": gin.H{
			"phone":        cust.WhatsAppNumber,
			"name":         cust.FirstName,
			"total_orders": cust.TotalOrders,
			"total_spent":  cust.TotalSpent,
		},
	})
}

// Me handles GET /api/auth/me — requires Bearer token.
func (h *AuthHandler) Me(c *gin.Context) {
	_, cust, ok := customerFromHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized — please log in"})
		return
	}
	resp := gin.H{"phone": cust.WhatsAppNumber}
	if cust != nil {
		resp["name"] = cust.FirstName
		resp["total_orders"] = cust.TotalOrders
		resp["total_spent"] = cust.TotalSpent
		resp["email"] = cust.Email.String
		resp["default_address"] = cust.DefaultAddress.String
	}
	c.JSON(http.StatusOK, gin.H{"customer": resp})
}

// UpdateMe handles PATCH /api/auth/me — update customer profile (name, email, address).
func (h *AuthHandler) UpdateMe(c *gin.Context) {
	_, cust, ok := customerFromHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized — please log in"})
		return
	}
	var req struct {
		Name           string `json:"name"`
		Email          string `json:"email"`
		Phone          string `json:"phone"`
		DefaultAddress string `json:"default_address"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	fields := map[string]string{}
	if strings.TrimSpace(req.Name) != "" {
		fields["name"] = strings.TrimSpace(req.Name)
	}
	if strings.TrimSpace(req.Email) != "" && strings.TrimSpace(req.Email) != cust.Email.String {
		// Email change requires verification
		if err := services.RequestEmailVerification(strings.TrimSpace(req.Email), rid); err != nil {
			if ve, ok := err.(*services.ValidationError); ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to request email verification"})
			return
		}
		fields["email"] = strings.TrimSpace(req.Email)
		fields["email_verified"] = "false" // Reset verification until new email is confirmed
	}
	if strings.TrimSpace(req.Phone) != "" {
		// Allow adding/updating phone for email-registered accounts
		fields["whatsapp_number"] = strings.TrimSpace(req.Phone)
	}
	if strings.TrimSpace(req.DefaultAddress) != "" {
		fields["default_address"] = strings.TrimSpace(req.DefaultAddress)
	}
	if err := services.UpdateCustomerProfileByID(cust.ID, rid, fields); err != nil {
		log.Printf("update me failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true, "email_verified": false})
}

// Register handles POST /api/auth/register - creates account with email + password.
// Phone is optional for WhatsApp sync. Name is optional.
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
		Phone    string `json:"phone"`
		Name     string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("register bind error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	cust, err := services.RegisterCustomer(req.Email, req.Password, req.Phone, req.Name, rid)
	if err != nil {
		log.Printf("register failed: %v", err)
		if ve, ok := err.(*services.ValidationError); ok {
			log.Printf("register validation: %s", ve.Msg)
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "registration failed"})
		return
	}
	// Auto-login after registration
	token, cust2, err := services.LoginCustomer(req.Email, req.Password, rid)
	if err != nil {
		log.Printf("register auto-login failed: %v", err)
		if ve, ok := err.(*services.ValidationError); ok {
			log.Printf("register auto-login validation: %s", ve.Msg)
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "registration succeeded but login failed"})
		return
	}
	_ = cust2
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"customer": gin.H{
			"id":             cust.ID,
			"whatsapp_number": cust.WhatsAppNumber,
			"email":          cust.Email.String,
			"name":           cust.FirstName,
			"total_orders":   cust.TotalOrders,
			"total_spent":    cust.TotalSpent,
		},
	})
}

// Login handles POST /api/auth/login - email + password authentication.
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	token, cust, err := services.LoginCustomer(req.Email, req.Password, rid)
	if err != nil {
		if ve, ok := err.(*services.ValidationError); ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"customer": gin.H{
			"id":             cust.ID,
			"whatsapp_number": cust.WhatsAppNumber,
			"email":          cust.Email.String,
			"name":           cust.FirstName,
			"total_orders":   cust.TotalOrders,
			"total_spent":    cust.TotalSpent,
		},
	})
}

// RequestPasswordReset handles POST /api/auth/request-password-reset
func (h *AuthHandler) RequestPasswordReset(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	if err := services.RequestPasswordReset(req.Email, rid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process request"})
		return
	}
	// Always return success to prevent email enumeration
	c.JSON(http.StatusOK, gin.H{"message": "If an account exists, a reset link has been sent"})
}

// ResetPassword handles POST /api/auth/reset-password
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	if err := services.ResetPassword(req.Token, req.Password, rid); err != nil {
		if ve, ok := err.(*services.ValidationError); ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "reset failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password reset successful"})
}

// RequestEmailVerification handles POST /api/auth/request-email-verification
func (h *AuthHandler) RequestEmailVerification(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	if err := services.RequestEmailVerification(req.Email, rid); err != nil {
		if ve, ok := err.(*services.ValidationError); ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send verification email"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "verification email sent"})
}

// ChangePassword handles POST /api/auth/change-password — requires current password + new password.
// Requires authenticated customer (session token).
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	_, cust, ok := customerFromHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized — please log in"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	// Verify current password using customer ID
	if err := services.VerifyPassword(cust.ID, req.CurrentPassword, rid); err != nil {
		if ve, ok := err.(*services.ValidationError); ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "password change failed"})
		return
	}
	if err := services.ChangePassword(cust.ID, req.CurrentPassword, req.NewPassword); err != nil {
		if ve, ok := err.(*services.ValidationError); ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "password change failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password changed successfully"})
}

// VerifyEmail handles POST /api/auth/verify-email
func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	if err := services.VerifyEmail(req.Token, rid); err != nil {
		if ve, ok := err.(*services.ValidationError); ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "verification failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "email verified successfully"})
}

// Logout handles POST /api/auth/logout
func (h *AuthHandler) Logout(c *gin.Context) {
	token := bearerToken(c)
	if token != "" {
		_ = services.DeleteSession(token)
	}
	c.JSON(http.StatusOK, gin.H{"logged_out": true})
}

// Orders handles GET /api/auth/orders — customer order history (requires auth)
func (h *AuthHandler) Orders(c *gin.Context) {
	phone, _, ok := customerFromHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	rid, _ := services.RequireRestaurant(c)
	orders, err := services.CustomerOrdersFor(phone, 50, rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load orders"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

func bearerToken(c *gin.Context) string {
	h := c.GetHeader("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return strings.TrimSpace(c.GetHeader("X-Customer-Token"))
}

func customerFromHeader(c *gin.Context) (string, *services.Customer, bool) {
	token := bearerToken(c)
	if token == "" {
		return "", nil, false
	}
	rid, _ := services.RequireRestaurant(c)
	phone, cust, err := services.ValidateSessionFor(token, rid)
	if err != nil {
		// fallback to global for open-source single-tenant transition
		phone, cust, err = services.ValidateSession(token)
		if err != nil {
			return "", nil, false
		}
		// in strict mode, if session has tenant but request is missing, still allow when single-tenant
		if rid != 0 {
			// verify tenant matches if session has it (already checked in For); if fallback got here, treat as invalid
			if !services.IsSingleTenantMode() {
				return "", nil, false
			}
		}
	}
	return phone, cust, true
}

// RequireCustomerAuth is optional middleware for routes that need login.
func RequireCustomerAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, _, ok := customerFromHeader(c); !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "please log in"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RequireCSRF middleware validates CSRF token on state-changing requests.
// The token must be sent as X-CSRF-Token header.
func RequireCSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
		token := c.GetHeader("X-CSRF-Token")
		if token == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "CSRF token required"})
			c.Abort()
			return
		}
		_, cust, ok := customerFromHeader(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized — please log in"})
			c.Abort()
			return
		}
		_, _ = services.RequireRestaurant(c)
		if err := services.ValidateCSRFToken(cust.ID, token); err != nil {
			if ve, ok := err.(*services.ValidationError); ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "csrf validation failed"})
			}
			c.Abort()
			return
		}
		c.Next()
	}
}
