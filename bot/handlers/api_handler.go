package handlers

import (
	"errors"
	"log"
	"net/http"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
	"orangecheesepizza/bot/services"

	"github.com/gin-gonic/gin"
)

// MenuReader is the surface the public website API needs from the menu service.
type MenuReader interface {
	GetCategoriesWithSlug() ([]models.MenuCategory, error)
	GetAllActiveItems() ([]models.MenuItem, error)
	GetItemByIdentifier(identifier string) (*models.MenuItem, error)
}

// ApiHandler serves the public, unauthenticated catalog endpoints
// consumed by the Orange Cheese Pizza website (localhost:5173).
type ApiHandler struct {
	menu   MenuReader
	orders *services.WebsiteOrderService
}

func NewApiHandler(menu MenuReader, orders *services.WebsiteOrderService) *ApiHandler {
	return &ApiHandler{menu: menu, orders: orders}
}

// CORSMiddleware — origins from CORS_ALLOWED_ORIGINS (comma-separated).
// Defaults cover Vite dev (5173) for local SaaS development.
func CORSMiddleware(allowedOriginsCSV string) gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, o := range splitCSV(allowedOriginsCSV) {
		if o != "" {
			allowed[o] = true
		}
	}
	// Ensure dev defaults if env omitted
	if len(allowed) == 0 {
		// Production: no CORS defaults — must be explicitly configured
		allowed["http://localhost:5173"] = true
		allowed["http://127.0.0.1:5173"] = true
		log.Println("WARNING: CORS_ALLOWED_ORIGINS not set — using localhost defaults for development only")
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowed[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Key, X-Customer-Token")
			c.Header("Access-Control-Max-Age", "86400")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func splitCSV(s string) []string {
	// tiny helper to avoid importing strings for a single use — inlined below
	parts := []string{}
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			part := s[start:i]
			// trim spaces
			for len(part) > 0 && (part[0] == ' ' || part[0] == '\t') {
				part = part[1:]
			}
			for len(part) > 0 && (part[len(part)-1] == ' ' || part[len(part)-1] == '\t') {
				part = part[:len(part)-1]
			}
			if part != "" {
				parts = append(parts, part)
			}
			start = i + 1
		}
	}
	return parts
}

// SecurityHeaders adds SaaS baseline hardening.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Header("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		// CSP is page-level; for API we keep restrictive but allow JSON
		c.Header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		c.Next()
	}
}

type menuResponse struct {
	Categories []models.MenuCategory `json:"categories"`
	Items      []models.MenuItem     `json:"items"`
}

// GetMenu handles GET /api/menu
func (h *ApiHandler) GetMenu(c *gin.Context) {
	categories, err := h.menu.GetCategoriesWithSlug()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load categories"})
		return
	}
	items, err := h.menu.GetAllActiveItems()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load menu items"})
		return
	}
	c.JSON(http.StatusOK, menuResponse{Categories: categories, Items: items})
}

// GetItem handles GET /api/menu/:id (numeric ID or slug)
func (h *ApiHandler) GetItem(c *gin.Context) {
	item, err := h.menu.GetItemByIdentifier(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load menu item"})
		return
	}
	if item == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "menu item not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": item})
}

// CreateOrder handles POST /api/orders.
// Prices are always recalculated from PostgreSQL; client totals ignored.
func (h *ApiHandler) CreateOrder(c *gin.Context) {
	var req services.WebsiteOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	result, err := h.orders.Create(&req, c.GetHeader("Idempotency-Key"))
	if err != nil {
		var validationErr *services.ValidationError
		if errors.As(err, &validationErr) {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationErr.Msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create order"})
		return
	}

	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK // idempotent replay returns the stored order
	}
	result.AccessToken = "" // don't leak access token in response
	c.JSON(status, gin.H{
		"order":        result,
		"notification": result.WhatsApp,
	})
}

// GetOrder handles GET /api/orders/:id (numeric ID or order number).
// Requires the per-order access token OR (SaaS) a valid customer Bearer
// token whose phone matches the order's customer_phone (syncs web+WhatsApp).
func (h *ApiHandler) GetOrder(c *gin.Context) {
	token := c.GetHeader("X-Order-Token")
	order, err := h.orders.Get(c.Param("id"), token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load order"})
		return
	}
	if order != nil {
		c.JSON(http.StatusOK, gin.H{"order": order})
		return
	}
	// SaaS fallback: authenticated customer owns this order?
	if bearerPhone := customerPhoneFromBearer(c); bearerPhone != "" {
		if owned, err := services.CustomerOrderByIdentifier(bearerPhone, c.Param("id")); err == nil && owned != nil {
			c.JSON(http.StatusOK, gin.H{"order": owned})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
}

// GetOutlets handles GET /api/outlets — public SaaS settings.
func (h *ApiHandler) GetOutlets(c *gin.Context) {
	rows, err := database.DB.Query(`SELECT id, slug, name, address_lines, phones, delivery_hours, online_ordering, active, sort_order FROM restaurant_outlets WHERE active=true ORDER BY sort_order, name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load outlets"})
		return
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var id int
		var slug, name, hours string
		var addr, ph []string
		var online, active bool
		var sort int
		// reuse admin stringSlice helper via manual scan
		var addrRaw, phRaw string
		if err := rows.Scan(&id, &slug, &name, &addrRaw, &phRaw, &hours, &online, &active, &sort); err != nil {
			// fallback for array types — try stringSlice
			_ = addr
			_ = ph
			continue
		}
		// parse pg array strings like {a,b}
		addr = parsePGArray(addrRaw)
		ph = parsePGArray(phRaw)
		out = append(out, map[string]interface{}{
			"id": id, "slug": slug, "name": name, "address_lines": addr, "phones": ph,
			"delivery_hours": hours, "online_ordering": online, "active": active, "sort_order": sort,
		})
	}
	if out == nil {
		out = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"outlets": out})
}

// GetConfig handles GET /api/config — public restaurant config.
func (h *ApiHandler) GetConfig(c *gin.Context) {
	var id int
	var name, phone, address, mapURL, opening, delivery, payment, support string
	err := database.DB.QueryRow(`SELECT id, name, phone, address, map_url, opening_hours::text, delivery_area::text, payment_info::text, support_phone FROM restaurant_config LIMIT 1`).Scan(&id, &name, &phone, &address, &mapURL, &opening, &delivery, &payment, &support)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"config": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"config": map[string]interface{}{
		"id": id, "name": name, "phone": phone, "address": address, "map_url": mapURL,
		"opening_hours": opening, "delivery_area": delivery, "payment_info": payment, "support_phone": support,
	}})
}

func parsePGArray(s string) []string {
	if len(s) < 2 {
		return []string{}
	}
	s = s[1 : len(s)-1] // trim {}
	if s == "" {
		return []string{}
	}
	// naive split for our simple data (no commas in values except address lines with commas — but our seed uses simple)
	// Use helper from admin (duplicate) — just split by "," and trim quotes
	parts := []string{}
	cur := ""
	inQ := false
	for _, r := range s {
		if r == '"' {
			inQ = !inQ
			continue
		}
		if r == ',' && !inQ {
			parts = append(parts, cur)
			cur = ""
			continue
		}
		cur += string(r)
	}
	parts = append(parts, cur)
	for i, v := range parts {
		parts[i] = v
	}
	return parts
}

func customerPhoneFromBearer(c *gin.Context) string {
	h := c.GetHeader("Authorization")
	token := ""
	if len(h) > 7 && h[:7] == "Bearer " {
		token = h[7:]
	} else {
		token = c.GetHeader("X-Customer-Token")
	}
	if token == "" {
		return ""
	}
	phone, _, err := services.ValidateSession(token)
	if err != nil {
		return ""
	}
	return phone
}
