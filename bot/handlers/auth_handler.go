package handlers

import (
	"log"
	"net/http"
	"os"
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
		resp := gin.H{"sent": false, "delivered": false, "message": "code generated — check server logs (dev mode)"}
		// Only expose the code in dev mode (no WhatsApp instance configured) to ease local testing.
		if strings.TrimSpace(os.Getenv("EVOLUTION_INSTANCE_TOKEN")) == "" {
			resp["dev_code"] = code
		}
		c.JSON(http.StatusOK, resp)
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

// UpdateMe handles PATCH /api/auth/me — update customer profile (name, email, address).
func (h *AuthHandler) UpdateMe(c *gin.Context) {
	phone, _, ok := customerFromHeader(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized — please log in"})
		return
	}
	var req struct {
		Name           string `json:"name"`
		Email          string `json:"email"`
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
	if strings.TrimSpace(req.Email) != "" {
		fields["email"] = strings.TrimSpace(req.Email)
	}
	if strings.TrimSpace(req.DefaultAddress) != "" {
		fields["default_address"] = strings.TrimSpace(req.DefaultAddress)
	}
	if err := services.UpdateCustomerProfileFor(phone, rid, fields); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
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
