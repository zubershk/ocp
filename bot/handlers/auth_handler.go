package handlers

import (
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
	_, err := services.SendOTP(req.Phone, h.evolution)
	if err != nil {
		if ve, ok := err.(*services.ValidationError); ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Msg})
			return
		}
		// whatsapp send failure still counts as 500 but OTP is stored
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not send WhatsApp code — is WhatsApp connected? " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sent": true, "message": "code sent on WhatsApp"})
}

// VerifyOTP handles POST /api/auth/verify-otp
func (h *AuthHandler) VerifyOTP(c *gin.Context) {
	var req verifyOTPReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "phone and code are required"})
		return
	}
	token, cust, err := services.VerifyOTP(req.Phone, req.Code, req.Name)
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
			"phone":       cust.WhatsAppNumber,
			"name":        cust.FirstName,
			"total_orders": cust.TotalOrders,
			"total_spent":  cust.TotalSpent,
		},
	})
}

// Me handles GET /api/auth/me — requires Bearer token.
func (h *AuthHandler) Me(c *gin.Context) {
	phone, cust, ok := customerFromHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized — please log in"})
		return
	}
	resp := gin.H{"phone": phone}
	if cust != nil {
		resp["name"] = cust.FirstName
		resp["total_orders"] = cust.TotalOrders
		resp["total_spent"] = cust.TotalSpent
		resp["email"] = cust.Email.String
		resp["default_address"] = cust.DefaultAddress.String
	}
	c.JSON(http.StatusOK, gin.H{"customer": resp})
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
	orders, err := services.CustomerOrders(phone, 50)
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
	phone, cust, err := services.ValidateSession(token)
	if err != nil {
		return "", nil, false
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
