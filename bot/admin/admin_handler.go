package admin

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/services"
)

type AdminHandler struct {
	menuService     *services.MenuService
	orderService    *services.OrderService
	posOrderService *services.POSOrderService
	evolutionClient *services.EvolutionClient
	config          *config.Config
}

func NewAdminHandler(menuService *services.MenuService, orderService *services.OrderService, posOrderService *services.POSOrderService, evolutionClient *services.EvolutionClient, cfg *config.Config) *AdminHandler {
	return &AdminHandler{
		menuService:     menuService,
		orderService:    orderService,
		posOrderService: posOrderService,
		evolutionClient: evolutionClient,
		config:          cfg,
	}
}

func hashAdminKey(k string) string {
	h := sha256.Sum256([]byte(k))
	return hex.EncodeToString(h[:])
}

type adminUserCtx struct {
	ID    int
	Name  string
	Role  string
	OrgID int
}

func getAdminUserByKey(key string) (*adminUserCtx, error) {
	if key == "" {
		return nil, nil
	}
	h := hashAdminKey(key)
	// New users table first (populated by migration 021 backfill).
	var u adminUserCtx
	err := database.DB.QueryRow(
		`SELECT id, name, role, organization_id FROM users WHERE key_hash=$1 AND active=true`,
		h).Scan(&u.ID, &u.Name, &u.Role, &u.OrgID)
	if err == nil {
		_, _ = database.DB.Exec(`UPDATE users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=$1`, u.ID)
		return &u, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}
	// Backstop: pre-cutover admin_users rows (e.g. keys created after 021
	// by the still-unmigrated Team page). Org resolves at middleware time.
	var legacy adminUserCtx
	err = database.DB.QueryRow(`SELECT id, name, role FROM admin_users WHERE key_hash=$1 AND active=true`, h).Scan(&legacy.ID, &legacy.Name, &legacy.Role)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	// touch last_seen
	_, _ = database.DB.Exec(`UPDATE admin_users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=$1`, legacy.ID)
	return &legacy, nil
}

// EnsureOwnerSeed creates an owner from BOT_ADMIN_KEY if no admins exist (SaaS bootstrap).
func EnsureOwnerSeed(cfg *config.Config) {
	var cnt int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM admin_users`).Scan(&cnt); err != nil || cnt > 0 {
		return
	}
	if cfg.BotAdminKey == "" {
		return
	}
	h := hashAdminKey(cfg.BotAdminKey)
	_, _ = database.DB.Exec(`INSERT INTO admin_users (name, key_hash, role) VALUES ($1,$2,'owner') ON CONFLICT (key_hash) DO NOTHING`, "Owner", h)
}

func auditLog(c *gin.Context, action, target string, details interface{}) {
	u, _ := c.Get("adminUser")
	var adminID *int
	var adminName string
	if au, ok := u.(*adminUserCtx); ok && au != nil {
		adminID = &au.ID
		adminName = au.Name
	} else {
		// fallback to header key name
		adminName = "env_owner"
	}
	b, _ := json.Marshal(details)
	ip := c.ClientIP()
	orgID := c.GetInt("orgID")
	if orgID <= 0 {
		orgID = 1 // bootstrap org until every caller carries tenant context
	}
	if adminID != nil {
		_, _ = database.DB.Exec(`INSERT INTO admin_audit_log (admin_user_id, admin_name, action, target, details, ip, organization_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`, *adminID, adminName, action, target, string(b), ip, orgID)
	} else {
		_, _ = database.DB.Exec(`INSERT INTO admin_audit_log (admin_name, action, target, details, ip, organization_id) VALUES ($1,$2,$3,$4::jsonb,$5,$6)`, adminName, action, target, string(b), ip, orgID)
	}
}

// safeError returns a generic message for internal errors, logging the real error server-side.
func safeError(err error) string {
	log.Printf("[admin-error] %v", err)
	return "internal error"
}

func (h *AdminHandler) RequireAdminKey() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-Admin-Key")
		// Query param removed for SaaS — header only to avoid log leakage
		if apiKey == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized — X-Admin-Key header required"})
			c.Abort()
			return
		}
		// Check DB first (hashed SaaS users)
		if u, err := getAdminUserByKey(apiKey); err == nil && u != nil {
			c.Set("adminUser", u)
			c.Set("adminRole", u.Role)
			c.Next()
			return
		}
		// Fallback to env owner (legacy single-tenant) — constant-time compare to prevent timing attacks
		if h.config.BotAdminKey != "" && subtle.ConstantTimeCompare([]byte(apiKey), []byte(h.config.BotAdminKey)) == 1 {
			c.Set("adminUser", &adminUserCtx{ID: 0, Name: "env_owner", Role: "owner"})
			c.Set("adminRole", "owner")
			c.Next()
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		c.Abort()
	}
}

// RequireRole restricts to given roles (owner/manager/kitchen/viewer). Owner bypasses all.
func (h *AdminHandler) RequireRole(roles ...string) gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *gin.Context) {
		role := c.GetString("adminRole")
		if role == "owner" {
			c.Next()
			return
		}
		if allowed[role] {
			c.Next()
			return
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden — requires " + strings.Join(roles, "/")})
		c.Abort()
	}
}

func (h *AdminHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ListCustomers returns all customers from the database for campaign runner integration.
func (h *AdminHandler) ListCustomers(c *gin.Context) {
	limit := 500
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 2000 {
			limit = v
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}
	search := c.Query("search")

	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	query := `SELECT id, whatsapp_number, COALESCE(name,''), COALESCE(email,''),
	                 total_orders, total_spent, created_at, last_seen_at
	          FROM customers WHERE restaurant_id = $1`
	args := []interface{}{rid}
	argN := 2
	if search != "" {
		query += ` AND (whatsapp_number ILIKE $` + strconv.Itoa(argN) + ` OR name ILIKE $` + strconv.Itoa(argN) + `)`
		args = append(args, "%"+search+"%")
		argN++
	}
	query += ` ORDER BY last_seen_at DESC NULLS LAST LIMIT $` + strconv.Itoa(argN) + ` OFFSET $` + strconv.Itoa(argN+1)
	args = append(args, limit, offset)

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	defer rows.Close()

	type custResp struct {
		ID             int     `json:"id"`
		Phone          string  `json:"phone"`
		Name           string  `json:"name"`
		Email          string  `json:"email"`
		TotalOrders    int     `json:"total_orders"`
		TotalSpent     float64 `json:"total_spent"`
		CreatedAt      string  `json:"created_at"`
		LastSeenAt     *string `json:"last_seen_at"`
	}
	var list []custResp
	for rows.Next() {
		var cr custResp
		if err := rows.Scan(&cr.ID, &cr.Phone, &cr.Name, &cr.Email, &cr.TotalOrders, &cr.TotalSpent, &cr.CreatedAt, &cr.LastSeenAt); err != nil {
			continue
		}
		list = append(list, cr)
	}
	var total int
	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM customers WHERE restaurant_id = $1`, rid).Scan(&total)
	c.JSON(http.StatusOK, gin.H{"customers": list, "total": total})
}

// BroadcastSend sends a text message to multiple phone numbers via Evolution GO.
func (h *AdminHandler) BroadcastSend(c *gin.Context) {
	var req struct {
		Phones   []string `json:"phones" binding:"required"`
		Message  string   `json:"message" binding:"required"`
		ImageURL string   `json:"image_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	if len(req.Phones) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max 200 recipients per request"})
		return
	}
	if len(req.Message) > 4096 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message too long (max 4096 chars)"})
		return
	}

	type result struct {
		Phone string `json:"phone"`
		OK    bool   `json:"ok"`
		Error string `json:"error,omitempty"`
	}
	var results []result
	success, failed := 0, 0

	for _, raw := range req.Phones {
		phone := strings.TrimSpace(raw)
		if phone == "" {
			continue
		}
		// ensure 10-digit
		phone = strings.ReplaceAll(phone, "+", "")
		if len(phone) > 10 {
			phone = phone[len(phone)-10:]
		}
		dest := phone
		if len(phone) == 10 {
			dest = "91" + phone
		}

		var sendErr error
		if req.ImageURL != "" {
			sendErr = h.evolutionClient.SendMedia(dest, req.ImageURL, "image", req.Message)
		} else {
			sendErr = h.evolutionClient.SendText(dest, req.Message)
		}

		if sendErr != nil {
			results = append(results, result{Phone: phone, OK: false, Error: sendErr.Error()})
			failed++
		} else {
			// persist outgoing message
			_ = services.SaveWhatsAppMessage(phone, "out", req.Message, "")
			results = append(results, result{Phone: phone, OK: true})
			success++
		}
	}
	auditLog(c, "broadcast_send", "campaign", map[string]interface{}{"total": len(req.Phones), "success": success, "failed": failed})
	c.JSON(http.StatusOK, gin.H{"success": success, "failed": failed, "results": results})
}

func (h *AdminHandler) GetMenu(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	categories, err := h.menuService.GetCategories(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}

	result := make(map[string]interface{})
	for _, cat := range categories {
		items, _ := h.menuService.GetItemsByCategory(cat.ID, rid)
		result[cat.Name] = items
	}

	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) CreateMenuItem(c *gin.Context) {
	var req struct {
		CategoryID       int      `json:"category_id" binding:"required"`
		Name             string   `json:"name" binding:"required"`
		Description      string   `json:"description"`
		Price            float64  `json:"price" binding:"required"`
		PriceRegular     *float64 `json:"price_regular"`
		PriceMedium      *float64 `json:"price_medium"`
		PriceLarge       *float64 `json:"price_large"`
		ImageURL         string   `json:"image_url"`
		SortOrder        int      `json:"sort_order"`
		Slug             string   `json:"slug"`
		Dietary          string   `json:"dietary"`
		PizzaSubcategory string   `json:"pizza_subcategory"`
		PizzaType        string   `json:"pizza_type"`
		IsSpicy          *bool    `json:"is_spicy"`
		IsJain           *bool    `json:"is_jain"`
		IsNew            *bool    `json:"is_new"`
		NoCrust          *bool    `json:"no_crust"`
		Available        *bool    `json:"available"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	if req.Price <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "price must be greater than zero"})
		return
	}
	if len(req.Name) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name too long (max 200 characters)"})
		return
	}
	if len(req.Description) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "description too long (max 2000 characters)"})
		return
	}
	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		slug = slugify(req.Name)
	}
	// Default dietary
	dietary := strings.TrimSpace(req.Dietary)
	if dietary == "" {
		dietary = "veg"
	}
	// Category must belong to the caller's restaurant.
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var catOK int
	if err := database.DB.QueryRow(
		`SELECT id FROM menu_categories WHERE id = $1 AND restaurant_id = $2`,
		req.CategoryID, rid).Scan(&catOK); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
		return
	}
	// Build website-ready insert with extended columns (idempotent for SaaS)
	var id int
	isSpicy := false
	if req.IsSpicy != nil {
		isSpicy = *req.IsSpicy
	}
	isJain := false
	if req.IsJain != nil {
		isJain = *req.IsJain
	}
	isNew := false
	if req.IsNew != nil {
		isNew = *req.IsNew
	}
	noCrust := false
	if req.NoCrust != nil {
		noCrust = *req.NoCrust
	}
	available := true
	if req.Available != nil {
		available = *req.Available
	}
	err := database.DB.QueryRow(`
		INSERT INTO menu_items
		(category_id, name, slug, description, price, price_regular, price_medium, price_large,
		 image_url, available, sort_order, active, dietary, pizza_subcategory, pizza_type, is_spicy, is_jain, is_new, no_crust, restaurant_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13,$14,$15,$16,$17,$18,$19)
		RETURNING id
	`, req.CategoryID, req.Name, slug, req.Description, req.Price,
		req.PriceRegular, req.PriceMedium, req.PriceLarge,
		req.ImageURL, available, req.SortOrder,
		dietary, req.PizzaSubcategory, req.PizzaType, isSpicy, isJain, isNew, noCrust, rid).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	item, _ := h.menuService.GetItemByID(id, rid)
	auditLog(c, "create_menu_item", req.Name, map[string]interface{}{"id": id, "slug": slug})
	c.JSON(http.StatusCreated, item)
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
		} else if !prevDash {
			b.WriteRune('-')
			prevDash = true
		}
	}
	res := strings.Trim(b.String(), "-")
	if res == "" {
		b2 := make([]byte, 4)
		if _, err := rand.Read(b2); err != nil {
			res = "item-" + hex.EncodeToString([]byte("xxxx"))
		} else {
			res = "item-" + hex.EncodeToString(b2)[:6]
		}
	}
	return res
}

func (h *AdminHandler) UpdateMenuItem(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	var req struct {
		CategoryID       *int     `json:"category_id"`
		Name             *string  `json:"name"`
		Description      *string  `json:"description"`
		Price            *float64 `json:"price"`
		PriceRegular     *float64 `json:"price_regular"`
		PriceMedium      *float64 `json:"price_medium"`
		PriceLarge       *float64 `json:"price_large"`
		ImageURL         *string  `json:"image_url"`
		Available        *bool    `json:"available"`
		SortOrder        *int     `json:"sort_order"`
		Slug             *string  `json:"slug"`
		Dietary          *string  `json:"dietary"`
		PizzaSubcategory *string  `json:"pizza_subcategory"`
		PizzaType        *string  `json:"pizza_type"`
		IsSpicy          *bool    `json:"is_spicy"`
		IsJain           *bool    `json:"is_jain"`
		IsNew            *bool    `json:"is_new"`
		NoCrust          *bool    `json:"no_crust"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	if req.Price != nil && *req.Price <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "price must be greater than zero"})
		return
	}
	if req.Name != nil && len(*req.Name) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name too long (max 200 characters)"})
		return
	}
	if req.Description != nil && len(*req.Description) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "description too long (max 2000 characters)"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	existing, err := h.menuService.GetItemByID(id, rid)
	if err != nil || existing == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	// merge
	name := existing.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}
	desc := existing.Description
	if req.Description != nil {
		desc = *req.Description
	}
	price := existing.Price
	if req.Price != nil {
		price = *req.Price
	}
	img := existing.ImageURL
	if req.ImageURL != nil {
		img = *req.ImageURL
	}
	available := existing.Available
	if req.Available != nil {
		available = *req.Available
	}
	catID := existing.CategoryID
	if req.CategoryID != nil {
		catID = *req.CategoryID
	}
	sortOrder := existing.SortOrder
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	}
	slug := existing.Slug
	if req.Slug != nil && strings.TrimSpace(*req.Slug) != "" {
		slug = strings.TrimSpace(*req.Slug)
	}
	dietary := existing.Dietary
	if req.Dietary != nil && strings.TrimSpace(*req.Dietary) != "" {
		dietary = strings.TrimSpace(*req.Dietary)
	}
	subcat := existing.PizzaSubcategory
	if req.PizzaSubcategory != nil {
		subcat = *req.PizzaSubcategory
	}
	ptype := existing.PizzaType
	if req.PizzaType != nil {
		ptype = *req.PizzaType
	}
	isSpicy := existing.IsSpicy
	if req.IsSpicy != nil {
		isSpicy = *req.IsSpicy
	}
	isJain := existing.IsJain
	if req.IsJain != nil {
		isJain = *req.IsJain
	}
	isNew := existing.IsNew
	if req.IsNew != nil {
		isNew = *req.IsNew
	}
	noCrust := existing.NoCrust
	if req.NoCrust != nil {
		noCrust = *req.NoCrust
	}
	// price variants — keep existing if not provided; BuildPriceBySize will handle nil vs 0
	var pr, pm, pl *float64
	if req.PriceRegular != nil {
		pr = req.PriceRegular
	} else {
		pr = existing.PriceRegular
	}
	if req.PriceMedium != nil {
		pm = req.PriceMedium
	} else {
		pm = existing.PriceMedium
	}
	if req.PriceLarge != nil {
		pl = req.PriceLarge
	} else {
		pl = existing.PriceLarge
	}
	// If moving categories, the target must belong to this restaurant.
	if req.CategoryID != nil && catID != existing.CategoryID {
		var catOK int
		if err := database.DB.QueryRow(
			`SELECT id FROM menu_categories WHERE id = $1 AND restaurant_id = $2`,
			catID, rid).Scan(&catOK); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
			return
		}
	}
	_, err = database.DB.Exec(`
		UPDATE menu_items SET
		category_id=$2, name=$3, slug=$4, description=$5, price=$6,
		price_regular=$7, price_medium=$8, price_large=$9,
		image_url=$10, available=$11, sort_order=$12, dietary=$13,
		pizza_subcategory=$14, pizza_type=$15, is_spicy=$16, is_jain=$17, is_new=$18, no_crust=$19,
		updated_at=CURRENT_TIMESTAMP
		WHERE id=$1 AND restaurant_id=$20
	`, id, catID, name, slug, desc, price, pr, pm, pl, img, available, sortOrder, dietary, subcat, ptype, isSpicy, isJain, isNew, noCrust, rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	updated, _ := h.menuService.GetItemByID(id, rid)
	// Field-level diff so the audit log shows what actually changed.
	diff := map[string]map[string]interface{}{}
	diffField := func(field string, from, to interface{}) {
		if fmt.Sprintf("%v", from) != fmt.Sprintf("%v", to) {
			diff[field] = map[string]interface{}{"from": from, "to": to}
		}
	}
	if existing != nil {
		diffField("name", existing.Name, name)
		diffField("slug", existing.Slug, slug)
		diffField("description", existing.Description, desc)
		diffField("price", existing.Price, price)
		diffField("category_id", existing.CategoryID, catID)
		diffField("available", existing.Available, available)
		diffField("image_url", existing.ImageURL, img)
		diffField("is_spicy", existing.IsSpicy, isSpicy)
		diffField("is_jain", existing.IsJain, isJain)
		diffField("is_new", existing.IsNew, isNew)
		diffField("no_crust", existing.NoCrust, noCrust)
	}
	auditLog(c, "update_menu_item", strconv.Itoa(id), map[string]interface{}{"name": name, "changes": diff})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminHandler) DeleteMenuItem(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := h.menuService.DeleteItem(id, services.ResolveRestaurant(c.GetInt("restaurantID"))); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	auditLog(c, "delete_menu_item", strconv.Itoa(id), nil)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *AdminHandler) CreateCategory(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		SortOrder   int    `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	if len(req.Name) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name too long (max 100 characters)"})
		return
	}
	if len(req.Description) > 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "description too long (max 1000 characters)"})
		return
	}

	cat, err := h.menuService.CreateCategory(req.Name, req.Description, req.SortOrder, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	auditLog(c, "create_category", req.Name, map[string]interface{}{"id": cat.ID})
	c.JSON(http.StatusCreated, cat)
}

// UploadImage handles POST /admin/upload (multipart, admin only) — SaaS media for menu images.
func (h *AdminHandler) UploadImage(c *gin.Context) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file required (field 'image')"})
		return
	}
	defer file.Close()
	if header.Size > 5<<20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image too large — max 5MB"})
		return
	}
	// sniff type
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read image"})
		return
	}
	ct := http.DetectContentType(buf[:n])
	allowed := map[string]string{
		"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
		"image/gif": ".gif", "image/bmp": ".bmp", "image/svg+xml": ".svg",
		"image/x-icon": ".ico", "image/vnd.microsoft.icon": ".ico",
		"image/avif": ".avif", "image/heic": ".heic", "image/heif": ".heif",
		"image/tiff": ".tiff",
	}
	ext, ok := allowed[ct]
	if !ok {
		// fall back to the client-provided extension for any other image/* type
		if len(ct) > 6 && ct[:6] == "image/" {
			feo := filepath.Ext(header.Filename)
			if feo == "" {
				feo = ".jpg"
			}
			ext = feo
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file is not an image"})
			return
		}
	}
	// ensure dir
	dir := "./uploads"
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot create upload dir"})
		return
	}
	// random name
	rnd := make([]byte, 8)
	if _, err := rand.Read(rnd); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot generate filename"})
		return
	}
	name := hex.EncodeToString(rnd) + ext
	dst := filepath.Join(dir, name)
	out, err := os.Create(dst)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot save image"})
		return
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save image"})
		return
	}
	// return path usable via GET /uploads/<name> (proxied + static)
	auditLog(c, "upload_image", name, map[string]interface{}{"url": "/uploads/" + name})
	c.JSON(http.StatusOK, gin.H{"url": "/uploads/" + name, "filename": name})
}

// ListUploads returns the media library (files in ./uploads).
func (h *AdminHandler) ListUploads(c *gin.Context) {
	entries, err := os.ReadDir("./uploads")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"files": []interface{}{}})
		return
	}
	out := []map[string]interface{}{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"name": e.Name(), "size": info.Size(),
			"modified":    info.ModTime().UTC().Format(time.RFC3339),
			"url":         "/uploads/" + e.Name(),
			"referenced":  h.uploadReferenced(e.Name(), services.ResolveRestaurant(c.GetInt("restaurantID"))),
		})
	}
	c.JSON(http.StatusOK, gin.H{"files": out})
}

// uploadReferenced reports whether a file is still pointed at by any
// menu item, offer, banner, page, or brand setting (best effort).
func (h *AdminHandler) uploadReferenced(name string, restaurantID int) bool {
	url := "/uploads/" + name
	var n int
	_ = database.DB.QueryRow(`
		SELECT (
			(SELECT COUNT(*) FROM menu_items WHERE image_url LIKE '%' || $1 || '%' AND restaurant_id = $2) +
			(SELECT COUNT(*) FROM site_settings WHERE value::text LIKE '%' || $1 || '%' AND restaurant_id = $2)
		)`, url, services.ResolveRestaurant(restaurantID)).Scan(&n)
	return n > 0
}

// DeleteUpload removes an uploaded file (DB references left for admin to fix).
func (h *AdminHandler) DeleteUpload(c *gin.Context) {
	name := c.Param("name")
	if name == "" || name != filepath.Base(name) || strings.Contains(name, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}
	p := filepath.Join("./uploads", name)
	if _, err := os.Stat(p); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}
	if err := os.Remove(p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete file"})
		return
	}
	auditLog(c, "delete_upload", name, nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetCategoriesAdmin returns website categories with slug for the dashboard.
func (h *AdminHandler) GetCategoriesAdmin(c *gin.Context) {
	cats, err := h.menuService.GetCategoriesWithSlug(services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"categories": cats})
}

func (h *AdminHandler) GetOrders(c *gin.Context) {
	limit := 50
	offset := 0

	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil {
			if v < 1 {
				v = 1
			}
			if v > 50 {
				v = 50
			}
			limit = v
		}
	}
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil {
			if v < 0 {
				v = 0
			}
			if v > 10000 {
				v = 10000
			}
			offset = v
		}
	}

	orders, err := h.orderService.GetAllOrders(limit, offset, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}

	// Embed items so the restaurant board renders full tickets.
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	for i := range orders {
		full, err := h.orderService.GetOrderByID(orders[i].ID, rid)
		if err == nil && full != nil {
			orders[i].Items = full.Items
		}
	}

	c.JSON(http.StatusOK, orders)
}

func (h *AdminHandler) GetOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	order, err := h.orderService.GetOrderByID(id, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	if order == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}

	c.JSON(http.StatusOK, order)
}

func (h *AdminHandler) UpdateOrderStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}

	if !services.ValidStatus[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
		return
	}

	// Explicit lifecycle + post-commit customer WhatsApp notification.
	order, notification, err := services.ApplyStatusChange(id, req.Status, h.evolutionClient, h.config, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		var transitionErr *services.TransitionError
		if errors.As(err, &transitionErr) {
			c.JSON(http.StatusConflict, gin.H{
				"error":         transitionErr.Error(),
				"current":       transitionErr.From,
				"allowed_nexts": transitionErr.Allowed,
			})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	if order == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "status updated",
		"order_number": order.OrderNumber,
		"status":       order.Status,
		"notification": notification,
	})
	auditLog(c, "update_order_status", order.OrderNumber, map[string]interface{}{"status": req.Status, "id": id})
}

// GetPOSMenu returns the POS menu for the current restaurant.
func (h *AdminHandler) GetPOSMenu(c *gin.Context) {
	restaurantID := c.GetInt("restaurantID")
	items, err := services.GetMenuItems(restaurantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"menu": items})
}

// ---------- POS order endpoints ----------

// CreatePOSOrder creates a new POS order draft.
// Tenant is taken from middleware context, never from the body: a
// caller cannot forge restaurant/outlet IDs, and the source is always
// stamped pos on this endpoint.
func (h *AdminHandler) CreatePOSOrder(c *gin.Context) {
	var draft services.DraftOrder
	if err := c.ShouldBindJSON(&draft); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	restaurantID := c.GetInt("restaurantID")
	outletID := c.GetInt("outletID")
	order, err := h.posOrderService.CreateOrder(restaurantID, outletID, draft.Items, draft.TableID, services.SourcePOS, draft.OrderType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"order": order})
}

// GetPOSOrder returns a POS order by ID.
func (h *AdminHandler) GetPOSOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	order, err := h.orderService.GetOrderByID(id, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if order == nil {
		// Tenant-scoped miss (including cross-tenant IDs): same 404,
		// never a 200 with a null body.
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"order": order})
}

// UpdatePOSOrder updates a mutable POS order's fulfillment type.
// Body: {order_type: dine_in | takeaway | delivery}.
func (h *AdminHandler) UpdatePOSOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	var req struct {
		OrderType string `json:"order_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	if err := h.posOrderService.UpdateOrder(id, c.GetInt("restaurantID"), c.GetInt("outletID"), req.OrderType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
}

// HoldPOSOrder holds a POS order.
func (h *AdminHandler) HoldPOSOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	au, _ := c.Get("adminUser")
	userID := 0
	if a, ok := au.(*adminUserCtx); ok && a != nil {
		userID = a.ID
	}
	ok, err := h.posOrderService.HoldOrder(id, c.GetInt("restaurantID"), c.GetInt("outletID"), userID, "manual")
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": safeError(err)})
		return
	}
	if !ok {
		c.JSON(http.StatusConflict, gin.H{"error": "order already held or could not be held"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"held": true})
}

// ResumePOSOrder resumes a held POS order.
func (h *AdminHandler) ResumePOSOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	err = h.posOrderService.ResumeOrder(id, c.GetInt("restaurantID"), c.GetInt("outletID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"resumed": true})
}

// CompletePOSOrder completes a fully-paid POS order.
// Rejects terminal states and any order with outstanding due.
func (h *AdminHandler) CompletePOSOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	if err := h.posOrderService.CompleteOrder(id, c.GetInt("restaurantID"), c.GetInt("outletID")); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"completed": true})
}

// CancelPOSOrder cancels a non-terminal POS order.
func (h *AdminHandler) CancelPOSOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	if err := h.posOrderService.CancelOrder(id, c.GetInt("restaurantID"), c.GetInt("outletID")); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"cancelled": true})
}

// TakePaymentPOSOrder records a payment for a POS order.
// Idempotent: pass Idempotency-Key (header, preferred) or
// idempotency_key (body); a replayed key returns the original
// payment with replayed=true instead of a second ledger row.
func (h *AdminHandler) TakePaymentPOSOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	var req services.PaymentRecord
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	key := c.GetHeader("Idempotency-Key")
	if key == "" {
		key = req.IdempotencyKey
	}
	// Attribute the payment to the calling cashier when the body omits
	// it: received_by is a FK to users, so a bare 0 would violate it.
	receivedBy := req.ReceivedBy
	if receivedBy == 0 {
		if au, _ := c.Get("adminUser"); au != nil {
			if a, ok := au.(*adminUserCtx); ok && a != nil {
				receivedBy = a.ID
			}
		}
	}
	restaurantID := c.GetInt("restaurantID")
	outletID := c.GetInt("outletID")
	paymentID, replayed, duePaise, err := h.posOrderService.TakePayment(id, restaurantID, outletID, req.Method, req.Amount, req.Tendered, req.Reference, receivedBy, key)
	if err != nil {
		if errors.Is(err, services.ErrIdempotencyKeyTooLong) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "idempotency key exceeds 120 characters"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"payment_id": paymentID, "replayed": replayed, "due_paise": duePaise})
}

// RefundPOSOrder records a refund for a POS order payment.
// The ledger stays authoritative: the original payment row is never
// mutated; the refund posts as a linked negative-amount row. Accepts
// Idempotency-Key like TakePaymentPOSOrder.
func (h *AdminHandler) RefundPOSOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	var req services.PaymentRecord
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	key := c.GetHeader("Idempotency-Key")
	if key == "" {
		key = req.IdempotencyKey
	}
	restaurantID := c.GetInt("restaurantID")
	outletID := c.GetInt("outletID")
	receivedBy := req.ReceivedBy
	if receivedBy == 0 {
		if au, _ := c.Get("adminUser"); au != nil {
			if a, ok := au.(*adminUserCtx); ok && a != nil {
				receivedBy = a.ID
			}
		}
	}
	paymentID, replayed, err := services.RefundPayment(req.ID, id, restaurantID, outletID, req.Amount, req.Reference, receivedBy, key)
	if err != nil {
		if errors.Is(err, services.ErrIdempotencyKeyTooLong) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "idempotency key exceeds 120 characters"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"payment_id": paymentID, "replayed": replayed})
}

// GetPOSOrderTables returns tables for the current restaurant/outlet.
func (h *AdminHandler) GetPOSOrderTables(c *gin.Context) {
	restaurantID := c.GetInt("restaurantID")
	outletID := c.GetInt("outletID")
	tables, err := services.GetTables(restaurantID, outletID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tables": tables})
}

// AssignTableToOrder assigns a table to a POS order.
// Route: PATCH /pos/tables/:id — :id is the table; the order arrives
// in the JSON body. (The route carries no :order_id/:table_id params,
// so reading them there always 400'd; body + :id is the contract.)
func (h *AdminHandler) AssignTableToOrder(c *gin.Context) {
	tableID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid table ID"})
		return
	}
	var req struct {
		OrderID int `json:"order_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.OrderID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order_id is required"})
		return
	}
	orderID := req.OrderID
	restaurantID := c.GetInt("restaurantID")
	outletID := c.GetInt("outletID")
	err = h.posOrderService.SetTable(orderID, tableID, restaurantID, outletID)
	if err != nil {
		if services.IsTableConflict(err) {
			c.JSON(http.StatusConflict, gin.H{"error": safeError(err)})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"assigned": true})
}

// GetPOSDiscounts returns active discounts for the current restaurant.
func (h *AdminHandler) GetPOSDiscounts(c *gin.Context) {
	restaurantID := c.GetInt("restaurantID")
	currentTime := time.Now()
	discounts, err := services.ListActiveDiscounts(restaurantID, currentTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"discounts": discounts})
}

// ApplyPOSDiscount applies a discount to a POS order.
// Route: POST /pos/discounts — both IDs arrive in the JSON body.
func (h *AdminHandler) ApplyPOSDiscount(c *gin.Context) {
	var req struct {
		OrderID    int `json:"order_id"`
		DiscountID int `json:"discount_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.OrderID <= 0 || req.DiscountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order_id and discount_id are required"})
		return
	}
	orderID, discountID := req.OrderID, req.DiscountID
	if err := h.posOrderService.ApplyDiscount(orderID, c.GetInt("restaurantID"), c.GetInt("outletID"), discountID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"applied": true})
}

// RemovePOSDiscount removes a discount from a POS order.
// Route: DELETE /pos/discounts/:id — :id is the order ID.
func (h *AdminHandler) RemovePOSDiscount(c *gin.Context) {
	orderID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid order ID"})
		return
	}
	err = services.RemoveDiscountFromOrder(orderID, c.GetInt("restaurantID"), c.GetInt("outletID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"removed": true})
}

// CalculatePOSPrice returns an ADVISORY-ONLY price estimate for UI display.
// It never writes anything: order creation, discount changes, and payment
// always recalculate server-side via RecalculateOrderTotals, so a forged
// browser request cannot submit a cheaper total.
func (h *AdminHandler) CalculatePOSPrice(c *gin.Context) {
	// Route: GET /pos/price?item_id=.. — the route carries no :item_id
	// param, so the ID comes from the query string like every other
	// filter on this endpoint.
	idStr := c.Param("item_id")
	if idStr == "" {
		idStr = c.Query("item_id")
	}
	itemID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item ID"})
		return
	}
	size := c.Query("size")
	crust := c.Query("crust")
	discountType := c.Query("discount_type")
	discountValue, _ := strconv.ParseInt(c.Query("discount_value"), 10, 64)
	taxPercent, _ := strconv.ParseInt(c.Query("tax_percent"), 10, 64)

	item, err := h.menuService.GetItemByIdentifier(strconv.Itoa(itemID))
	if err != nil || item == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	br, err := services.ResolvePriceBreakdown(item, size, crust, discountType, discountValue, taxPercent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"price_breakdown": br, "advisory_only": true})
}

// DebugWhatsApp returns live conversation internals for support/diagnosis.
func (h *AdminHandler) DebugWhatsApp(c *gin.Context) {
	phone := cleanPhoneParam(c.Param("phone"))
	state, ctx, err := services.LoadConversationForPhone(phone)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	cart, _ := h.menuService.GetCartDebug(phone)
	orders, _ := h.orderService.GetOrdersByPhone(phone, services.ResolveRestaurant(c.GetInt("restaurantID")))
	c.JSON(http.StatusOK, gin.H{
		"phone":         phone,
		"state":         state,
		"context":       json.RawMessage(ctx),
		"cart":          cart,
		"recent_orders": orders,
	})
}

// Live chat — SaaS bot dashboard

func (h *AdminHandler) ListConversations(c *gin.Context) {
	limit := 50
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}
	list, err := services.ListConversations(limit, offset, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"conversations": list})
}

func (h *AdminHandler) GetChatMessages(c *gin.Context) {
	phone := cleanPhoneParam(c.Param("phone"))
	limit := 100
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 200 {
			limit = v
		}
	}
	msgs, err := services.ListMessages(phone, limit, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	state, ctx, _ := services.LoadConversationForPhone(phone)
	cart, _ := h.menuService.GetCartDebug(phone)
	c.JSON(http.StatusOK, gin.H{
		"phone":    phone,
		"state":    state,
		"context":  json.RawMessage(ctx),
		"cart":     cart,
		"messages": msgs,
	})
}

func (h *AdminHandler) SendChatMessage(c *gin.Context) {
	phone := cleanPhoneParam(c.Param("phone"))
	var req struct {
		Body string `json:"body" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Body) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body is required"})
		return
	}
	body := strings.TrimSpace(req.Body)
	// Ensure customer exists and put conversation in human mode
	cust, err := services.GetOrCreateCustomer(phone)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	// Send via Evolution (human) — ensure 91 prefix for India
	dest := phone
	if len(phone) == 10 {
		dest = "91" + phone
	}
	if err := h.evolutionClient.SendText(dest, body); err != nil {
		log.Printf("[admin] WhatsApp send failed: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to send message"})
		return
	}
	_ = services.SaveWhatsAppMessage(phone, "out", body, "")
	services.BroadcastRealtime("chat.message", map[string]interface{}{"phone": phone, "dir": "out"})
	// Mark takeover so bot pauses
	if cust != nil {
		_ = services.SetConversationState(phone, "HUMAN_SUPPORT")
	}
	auditLog(c, "send_chat", phone, map[string]interface{}{"body": body})
	c.JSON(http.StatusOK, gin.H{"sent": true})
}

func (h *AdminHandler) SetConversationState(c *gin.Context) {
	phone := cleanPhoneParam(c.Param("phone"))
	var req struct {
		State string `json:"state" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "state is required"})
		return
	}
	validStates := map[string]bool{
		"IDLE": true, "MAIN_MENU": true, "CATEGORY": true, "ITEM": true,
		"SIZE": true, "CRUST": true, "QUANTITY": true, "QUANTITY_MORE": true,
		"CART_MENU": true, "CART_EDIT": true, "CART_EDIT_QTY": true,
		"FULFILLMENT": true, "NAME": true, "ADDRESS": true, "ADDRESS_CONFIRM": true,
		"LANDMARK": true, "PAYMENT": true, "CONFIRMATION": true,
		"HUMAN_SUPPORT": true, "PROFILE_NAME": true, "PROFILE_ADDR": true,
	}
	if !validStates[req.State] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation state"})
		return
	}
	if err := services.SetConversationState(phone, req.State); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"state": req.State})
}

func (h *AdminHandler) GetMeAdmin(c *gin.Context) {
	u, _ := c.Get("adminUser")
	if au, ok := u.(*adminUserCtx); ok && au != nil {
		// org/restaurant are additive; existing clients ignore extras.
		c.JSON(http.StatusOK, gin.H{
			"id": au.ID, "name": au.Name, "role": au.Role,
			"organization_id": c.GetInt("orgID"),
			"restaurant_id":   c.GetInt("restaurantID"),
			"outlet_id":       c.GetInt("outletID"),
		})
		return
	}
	// env owner fallback
	c.JSON(http.StatusOK, gin.H{"id": 0, "name": "owner", "role": "owner"})
}

func (h *AdminHandler) ListAdminUsers(c *gin.Context) {
	rows, err := database.DB.Query(
		`SELECT id, name, role, active, created_at::text, last_seen_at::text FROM users WHERE organization_id=$1 ORDER BY id`,
		c.GetInt("orgID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var id int
		var name, role, created, lastSeen sql.NullString
		var active bool
		_ = rows.Scan(&id, &name, &role, &active, &created, &lastSeen)
		out = append(out, map[string]interface{}{"id": id, "name": name.String, "role": role.String, "active": active, "created_at": created.String, "last_seen_at": lastSeen.String})
	}
	if out == nil {
		out = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"users": out})
}

func (h *AdminHandler) CreateAdminUser(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	if req.Role != "owner" && req.Role != "manager" && req.Role != "kitchen" && req.Role != "cashier" && req.Role != "viewer" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role must be owner/manager/kitchen/cashier/viewer"})
		return
	}
	// generate key
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot generate key"})
		return
	}
	plain := hex.EncodeToString(b)
	hash := hashAdminKey(plain)
	var id int
	err := database.DB.QueryRow(
		`INSERT INTO users (organization_id, name, key_hash, role) VALUES ($1,$2,$3,$4) RETURNING id`,
		c.GetInt("orgID"), req.Name, hash, req.Role).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	auditLog(c, "create_admin_user", req.Name, map[string]string{"role": req.Role, "id": strconv.Itoa(id)})
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": req.Name, "role": req.Role, "key": plain})
}

func (h *AdminHandler) DeleteAdminUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	res, err := database.DB.Exec(`DELETE FROM users WHERE id=$1 AND organization_id=$2`,
		id, c.GetInt("orgID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	auditLog(c, "delete_admin_user", strconv.Itoa(id), nil)
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (h *AdminHandler) GetAuditLog(c *gin.Context) {
	limit := 50
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 200 {
			limit = v
		}
	}
	rows, err := database.DB.Query(
		`SELECT id, COALESCE(admin_name,'') , action, COALESCE(target,''), COALESCE(details::text,'{}'), COALESCE(ip,''), created_at::text FROM admin_audit_log WHERE organization_id=$2 ORDER BY id DESC LIMIT $1`,
		limit, c.GetInt("orgID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var id int
		var admin, action, target, details, ip, at string
		_ = rows.Scan(&id, &admin, &action, &target, &details, &ip, &at)
		out = append(out, map[string]interface{}{"id": id, "admin_name": admin, "action": action, "target": target, "details": details, "ip": ip, "created_at": at})
	}
	if out == nil {
		out = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"logs": out})
}

func (h *AdminHandler) GetAnalytics(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	// Today
	var todayRevenue float64
	var todayCount int
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(total),0), COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE AND status != 'cancelled' AND restaurant_id = $1`, rid).Scan(&todayRevenue, &todayCount)
	// Week (last 7 days inclusive)
	var weekRevenue float64
	var weekCount int
	_ = database.DB.QueryRow(`SELECT COALESCE(SUM(total),0), COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '6 days' AND status != 'cancelled' AND restaurant_id = $1`, rid).Scan(&weekRevenue, &weekCount)

	// Orders by status
	statusRows, _ := database.DB.Query(`SELECT status, COUNT(*) FROM orders WHERE restaurant_id = $1 GROUP BY status`, rid)
	statusMap := map[string]int{}
	if statusRows != nil {
		defer statusRows.Close()
		for statusRows.Next() {
			var s string
			var n int
			_ = statusRows.Scan(&s, &n)
			statusMap[s] = n
		}
	}
	// Top items (last 30 days)
	type TopItem struct {
		Name     string  `json:"name"`
		Quantity int     `json:"quantity"`
		Revenue  float64 `json:"revenue"`
	}
	var top []TopItem
	rows, err := database.DB.Query(`
		SELECT oi.name, SUM(oi.quantity)::int, SUM(oi.subtotal)
		FROM order_items oi JOIN orders o ON o.id = oi.order_id
		WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days' AND o.status != 'cancelled' AND o.restaurant_id = $1
		GROUP BY oi.name ORDER BY SUM(oi.quantity) DESC LIMIT 5
	`, rid)
	if err == nil && rows != nil {
		defer rows.Close()
		for rows.Next() {
			var t TopItem
			_ = rows.Scan(&t.Name, &t.Quantity, &t.Revenue)
			top = append(top, t)
		}
	}
	if top == nil {
		top = []TopItem{}
	}
	// Revenue by day last 7 days
	type DayRev struct {
		Day     string  `json:"day"`
		Revenue float64 `json:"revenue"`
		Orders  int     `json:"orders"`
	}
	var byDay []DayRev
	dayRows, err := database.DB.Query(`
		SELECT to_char(d::date,'YYYY-MM-DD') as day, COALESCE(SUM(o.total),0), COUNT(o.id)
		FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
		LEFT JOIN orders o ON o.created_at::date = d::date AND o.status != 'cancelled' AND o.restaurant_id = $1
		GROUP BY d::date ORDER BY d::date
	`, rid)
	if err == nil && dayRows != nil {
		defer dayRows.Close()
		for dayRows.Next() {
			var dr DayRev
			_ = dayRows.Scan(&dr.Day, &dr.Revenue, &dr.Orders)
			byDay = append(byDay, dr)
		}
	}
	if byDay == nil {
		byDay = []DayRev{}
	}
	// Orders by hour-of-day, last 7 days (peak-hour heatmap).
	type HourStat struct {
		Hour   int `json:"hour"`
		Orders int `json:"orders"`
	}
	byHour := make([]HourStat, 24)
	for h := 0; h < 24; h++ {
		byHour[h].Hour = h
	}
	hourRows, err := database.DB.Query(`
		SELECT EXTRACT(HOUR FROM created_at)::int AS h, COUNT(*)
		FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '6 days' AND restaurant_id = $1
		GROUP BY h
	`, rid)
	if err == nil && hourRows != nil {
		defer hourRows.Close()
		for hourRows.Next() {
			var h, n int
			if err := hourRows.Scan(&h, &n); err == nil && h >= 0 && h < 24 {
				byHour[h].Orders = n
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"today": gin.H{"revenue": todayRevenue, "orders": todayCount},
		"week":  gin.H{"revenue": weekRevenue, "orders": weekCount},
		"by_status": statusMap,
		"top_items": top,
		"by_day": byDay,
		"by_hour": byHour,
	})
}

// --- Settings: outlets + restaurant config ---

func (h *AdminHandler) GetOutletsAdmin(c *gin.Context) {
	rows, err := database.DB.Query(
		`SELECT id, slug, name, address_lines, phones, delivery_hours, online_ordering, active, sort_order FROM outlets WHERE restaurant_id=$1 ORDER BY sort_order, name`,
		services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	defer rows.Close()
	type Outlet struct {
		ID             int      `json:"id"`
		Slug           string   `json:"slug"`
		Name           string   `json:"name"`
		AddressLines   []string `json:"address_lines"`
		Phones         []string `json:"phones"`
		DeliveryHours  string   `json:"delivery_hours"`
		OnlineOrdering bool     `json:"online_ordering"`
		Active         bool     `json:"active"`
		SortOrder      int      `json:"sort_order"`
	}
	var out []Outlet
	for rows.Next() {
		var o Outlet
		var addr, ph []string
		// lib/pq array handling via string scan
		var addrStr, phStr sql.NullString
		// use pq.Array
		// fallback: scan as string then parse
		if err := rows.Scan(&o.ID, &o.Slug, &o.Name, (*stringSlice)(&o.AddressLines), (*stringSlice)(&o.Phones), &o.DeliveryHours, &o.OnlineOrdering, &o.Active, &o.SortOrder); err != nil {
			// try fallback scan as string
			_ = addrStr
			_ = phStr
			_ = addr
			_ = ph
			c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
			return
		}
		out = append(out, o)
	}
	c.JSON(http.StatusOK, gin.H{"outlets": out})
}

func (h *AdminHandler) CreateOutlet(c *gin.Context) {
	var req struct {
		Slug           string   `json:"slug" binding:"required"`
		Name           string   `json:"name" binding:"required"`
		AddressLines   []string `json:"address_lines"`
		Phones         []string `json:"phones"`
		DeliveryHours  string   `json:"delivery_hours"`
		OnlineOrdering *bool    `json:"online_ordering"`
		SortOrder      int      `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	if len(req.Slug) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug too long (max 100 characters)"})
		return
	}
	if len(req.Name) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name too long (max 200 characters)"})
		return
	}
	online := true
	if req.OnlineOrdering != nil {
		online = *req.OnlineOrdering
	}
	if req.DeliveryHours == "" {
		req.DeliveryHours = "11:00 AM to 04:00 AM"
	}
	var id int
	err := database.DB.QueryRow(`
		INSERT INTO outlets (restaurant_id, slug, name, address_lines, phones, delivery_hours, online_ordering, sort_order)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
	`, services.ResolveRestaurant(c.GetInt("restaurantID")), req.Slug, req.Name, stringSlice(req.AddressLines), stringSlice(req.Phones), req.DeliveryHours, online, req.SortOrder).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "slug": req.Slug})
}

func (h *AdminHandler) UpdateOutlet(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	var req struct {
		Name           *string  `json:"name"`
		AddressLines   []string `json:"address_lines"`
		Phones         []string `json:"phones"`
		DeliveryHours  *string  `json:"delivery_hours"`
		OnlineOrdering *bool    `json:"online_ordering"`
		Active         *bool    `json:"active"`
		SortOrder      *int     `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	// build dynamic update
	set := []string{}
	args := []interface{}{}
	n := 1
	if req.Name != nil {
		set = append(set, "name=$"+strconv.Itoa(n))
		args = append(args, *req.Name)
		n++
	}
	if req.AddressLines != nil {
		set = append(set, "address_lines=$"+strconv.Itoa(n))
		args = append(args, stringSlice(req.AddressLines))
		n++
	}
	if req.Phones != nil {
		set = append(set, "phones=$"+strconv.Itoa(n))
		args = append(args, stringSlice(req.Phones))
		n++
	}
	if req.DeliveryHours != nil {
		set = append(set, "delivery_hours=$"+strconv.Itoa(n))
		args = append(args, *req.DeliveryHours)
		n++
	}
	if req.OnlineOrdering != nil {
		set = append(set, "online_ordering=$"+strconv.Itoa(n))
		args = append(args, *req.OnlineOrdering)
		n++
	}
	if req.Active != nil {
		set = append(set, "active=$"+strconv.Itoa(n))
		args = append(args, *req.Active)
		n++
	}
	if req.SortOrder != nil {
		set = append(set, "sort_order=$"+strconv.Itoa(n))
		args = append(args, *req.SortOrder)
		n++
	}
	if len(set) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields"})
		return
	}
	set = append(set, "updated_at=CURRENT_TIMESTAMP")
	args = append(args, id)
	n++
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	args = append(args, rid)
	res, err := database.DB.Exec(`UPDATE outlets SET `+strings.Join(set, ", ")+` WHERE id=$`+strconv.Itoa(n-1)+` AND restaurant_id=$`+strconv.Itoa(n), args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update outlet"})
		return
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "outlet not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
}

func (h *AdminHandler) DeleteOutlet(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	res, err := database.DB.Exec(`DELETE FROM outlets WHERE id=$1 AND restaurant_id=$2`,
		id, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete outlet (it may still have orders)"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "outlet not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (h *AdminHandler) GetConfigAdmin(c *gin.Context) {
	var row struct {
		ID           int    `json:"id"`
		Name         string `json:"name"`
		Phone        string `json:"phone"`
		Address      string `json:"address"`
		MapURL       string `json:"map_url"`
		OpeningHours string `json:"opening_hours"`
		DeliveryArea string `json:"delivery_area"`
		PaymentInfo  string `json:"payment_info"`
		SupportPhone string `json:"support_phone"`
	}
	err := database.DB.QueryRow(
		`SELECT id, name, phone, address, map_url, opening_hours::text, delivery_area::text, payment_info::text, support_phone FROM restaurant_config WHERE restaurant_id=$1 LIMIT 1`,
		services.ResolveRestaurant(c.GetInt("restaurantID"))).Scan(&row.ID, &row.Name, &row.Phone, &row.Address, &row.MapURL, &row.OpeningHours, &row.DeliveryArea, &row.PaymentInfo, &row.SupportPhone)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	c.JSON(http.StatusOK, row)
}

func (h *AdminHandler) UpdateConfigAdmin(c *gin.Context) {
	var req struct {
		Name         *string `json:"name"`
		Phone        *string `json:"phone"`
		Address      *string `json:"address"`
		MapURL       *string `json:"map_url"`
		OpeningHours *string `json:"opening_hours"`
		DeliveryArea *string `json:"delivery_area"`
		PaymentInfo  *string `json:"payment_info"`
		SupportPhone *string `json:"support_phone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": safeError(err)})
		return
	}
	if req.Name != nil && len(*req.Name) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name too long (max 200)"})
		return
	}
	if req.Phone != nil && len(*req.Phone) > 15 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "phone too long (max 15)"})
		return
	}
	if req.Address != nil && len(*req.Address) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "address too long (max 500)"})
		return
	}
	if req.MapURL != nil && len(*req.MapURL) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "map_url too long (max 500)"})
		return
	}
	if req.SupportPhone != nil && len(*req.SupportPhone) > 15 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "support_phone too long (max 15)"})
		return
	}
	set := []string{}
	args := []interface{}{}
	n := 1
	if req.Name != nil {
		set = append(set, "name=$"+strconv.Itoa(n))
		args = append(args, *req.Name)
		n++
	}
	if req.Phone != nil {
		set = append(set, "phone=$"+strconv.Itoa(n))
		args = append(args, *req.Phone)
		n++
	}
	if req.Address != nil {
		set = append(set, "address=$"+strconv.Itoa(n))
		args = append(args, *req.Address)
		n++
	}
	if req.MapURL != nil {
		set = append(set, "map_url=$"+strconv.Itoa(n))
		args = append(args, *req.MapURL)
		n++
	}
	if req.OpeningHours != nil {
		set = append(set, "opening_hours=$"+strconv.Itoa(n)+"::jsonb")
		args = append(args, *req.OpeningHours)
		n++
	}
	if req.DeliveryArea != nil {
		set = append(set, "delivery_area=$"+strconv.Itoa(n)+"::jsonb")
		args = append(args, *req.DeliveryArea)
		n++
	}
	if req.PaymentInfo != nil {
		set = append(set, "payment_info=$"+strconv.Itoa(n)+"::jsonb")
		args = append(args, *req.PaymentInfo)
		n++
	}
	if req.SupportPhone != nil {
		set = append(set, "support_phone=$"+strconv.Itoa(n))
		args = append(args, *req.SupportPhone)
		n++
	}
	if len(set) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields"})
		return
	}
	set = append(set, "updated_at=CURRENT_TIMESTAMP")
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	args = append(args, rid)
	res, err := database.DB.Exec(`UPDATE restaurant_config SET `+strings.Join(set, ", ")+` WHERE restaurant_id=$`+strconv.Itoa(n), args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "restaurant config not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
}

// helper for pq array
type stringSlice []string

func (s *stringSlice) Scan(src interface{}) error {
	// pq array comes as string like "{a,b}" — parse
	if src == nil {
		*s = []string{}
		return nil
	}
	var str string
	switch v := src.(type) {
	case string:
		str = v
	case []byte:
		str = string(v)
	default:
		return nil
	}
	// simple parser for TEXT[]: "{a,\"b c\",d}"
	str = strings.Trim(str, "{}")
	if str == "" {
		*s = []string{}
		return nil
	}
	// split by "," but handle quoted
	var out []string
	var cur strings.Builder
	inQuote := false
	for i, r := range str {
		if r == '"' {
			inQuote = !inQuote
			continue
		}
		if r == ',' && !inQuote {
			out = append(out, cur.String())
			cur.Reset()
			continue
		}
		// handle escaped?
		cur.WriteRune(r)
		_ = i
	}
	out = append(out, cur.String())
	// trim spaces/quotes
	for i, v := range out {
		out[i] = strings.Trim(v, `" `)
	}
	*s = out
	return nil
}

func (s stringSlice) Value() (interface{}, error) {
	// encode as postgres array literal
	if len(s) == 0 {
		return "{}", nil
	}
	var b strings.Builder
	b.WriteString("{")
	for i, v := range s {
		if i > 0 {
			b.WriteString(",")
		}
		// quote if contains comma/space/quote
		if strings.Contains(v, ",") || strings.Contains(v, `"`) || strings.Contains(v, " ") {
			b.WriteString(`"` + strings.ReplaceAll(v, `"`, `\"`) + `"`)
		} else {
			b.WriteString(v)
		}
	}
	b.WriteString("}")
	return b.String(), nil
}

func cleanPhoneParam(phone string) string {
	for _, suffix := range []string{"@s.whatsapp.net", "@lid", "@g.us", "@broadcast", "@newsletter"} {
		phone = strings.ReplaceAll(phone, suffix, "")
	}
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	if len(cleaned) == 12 && strings.HasPrefix(cleaned, "91") {
		return cleaned[2:]
	}
	if len(cleaned) == 11 && cleaned[0] == '0' {
		return cleaned[1:]
	}
	return cleaned
}

// ------------------------------------------------------------------
// Bot Message Templates (configurable WhatsApp responses)
// ------------------------------------------------------------------

// BotMessageService is a lazy accessor — initialized once in main.go.
var botMsgSvc *services.BotMessageService

func SetBotMessageService(svc *services.BotMessageService) {
	botMsgSvc = svc
}

// ListBotMessages returns all message templates grouped by category.
func (h *AdminHandler) ListBotMessages(c *gin.Context) {
	if botMsgSvc == nil {
		c.JSON(500, gin.H{"error": "bot message service not initialized"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	messages := botMsgSvc.GetAllMessages(rid)
	c.JSON(200, gin.H{"messages": messages, "categories": botMsgSvc.GetMessageCategories(rid)})
}

// GetBotMessage returns a single message template by key.
func (h *AdminHandler) GetBotMessage(c *gin.Context) {
	if botMsgSvc == nil {
		c.JSON(500, gin.H{"error": "bot message service not initialized"})
		return
	}
	key := c.Param("key")
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	msg, found := botMsgSvc.GetMessage(key, rid)
	if !found {
		c.JSON(404, gin.H{"error": "message not found"})
		return
	}
	c.JSON(200, gin.H{"message": msg})
}

// UpdateBotMessage updates a single message template.
func (h *AdminHandler) UpdateBotMessage(c *gin.Context) {
	if botMsgSvc == nil {
		c.JSON(500, gin.H{"error": "bot message service not initialized"})
		return
	}
	key := c.Param("key")
	var req struct {
		MessageText string  `json:"message_text"`
		ImageURL    *string `json:"image_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
		return
	}
	if strings.TrimSpace(req.MessageText) == "" {
		c.JSON(400, gin.H{"error": "message_text is required"})
		return
	}
	if err := botMsgSvc.UpdateMessage(key, req.MessageText, req.ImageURL, services.ResolveRestaurant(c.GetInt("restaurantID"))); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "bot_message_updated", key, nil)
	c.JSON(200, gin.H{"ok": true})
}

// ResetBotMessage resets a single message to compiled-in default.
func (h *AdminHandler) ResetBotMessage(c *gin.Context) {
	if botMsgSvc == nil {
		c.JSON(500, gin.H{"error": "bot message service not initialized"})
		return
	}
	key := c.Param("key")
	if err := botMsgSvc.ResetMessage(key, services.ResolveRestaurant(c.GetInt("restaurantID"))); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "bot_message_reset", key, nil)
	c.JSON(200, gin.H{"ok": true})
}

// ResetAllBotMessages resets all messages to compiled-in defaults.
func (h *AdminHandler) ResetAllBotMessages(c *gin.Context) {
	if botMsgSvc == nil {
		c.JSON(500, gin.H{"error": "bot message service not initialized"})
		return
	}
	if err := botMsgSvc.ResetAllMessages(services.ResolveRestaurant(c.GetInt("restaurantID"))); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "bot_messages_reset_all", "all", nil)
	c.JSON(200, gin.H{"ok": true})
}

// RenderBotMessagePreview renders a message with sample data for preview.
func (h *AdminHandler) RenderBotMessagePreview(c *gin.Context) {
	if botMsgSvc == nil {
		c.JSON(500, gin.H{"error": "bot message service not initialized"})
		return
	}
	key := c.Param("key")
	var req struct {
		Data map[string]interface{} `json:"data"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.Data == nil {
		req.Data = sampleData(key)
	}
	rendered := botMsgSvc.Render(key, req.Data)
	resp := gin.H{"rendered": rendered}
	if msg, found := botMsgSvc.GetMessage(key, services.ResolveRestaurant(c.GetInt("restaurantID"))); found && strings.TrimSpace(msg.ImageURL) != "" {
		resp["image_url"] = msg.ImageURL
	}
	c.JSON(200, resp)
}

func sampleData(key string) map[string]interface{} {
	return map[string]interface{}{
		"RestaurantName": "My Restaurant",
		"Name":           "John",
		"Phone":          "9876543210",
		"ItemCount":      3,
		"State":          "Category",
		"CategoryName":   "Veg Pizzas",
		"ItemName":       "Margherita",
		"Size":           "Medium",
		"CrustName":      "Thin Crust",
		"Price":          385,
		"Quantity":       2,
		"Total":          770,
		"Subtotal":       770,
		"OrderNumber":    "OCP-20260901-0001",
		"Address":        "123 Main Street, Mumbai",
		"Payment":        "Cash",
		"DeliveryType":   "Delivery",
		"Emoji":          "\U0001F355",
		"Status":         "Confirmed",
		"Date":           "01 Sep, 3:00 PM",
		"Error":          "Item unavailable",
		"Count":          2,
		"Code":           "123456",
		"Order":          "OCP-20260901-0001",
		"CartCount":      2,
		"KitchenHours":   "11 AM - 11 PM",
		"DeliveryHours":  "11 AM - 4 AM",
		"Options":        "Type 'menu' to start over.",
		"AddressBlock":   "123 Main Street, Mumbai",
		"ThankSuffix":    ", John",
		"Items":          "2 x Margherita\nMedium\nRs.770",
	}
}

// ---------- Business Configuration ----------

func (h *AdminHandler) GetBusinessConfig(c *gin.Context) {
	cfg := services.GetBusinessConfigFor(services.ResolveRestaurant(c.GetInt("restaurantID")))
	c.JSON(200, cfg)
}

func (h *AdminHandler) UpdateBusinessConfig(c *gin.Context) {
	var cfg services.BusinessConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(400, gin.H{"error": "invalid JSON"})
		return
	}
	if err := services.SaveBusinessConfig(&cfg, services.ResolveRestaurant(c.GetInt("restaurantID"))); err != nil {
		c.JSON(500, gin.H{"error": "failed to save: " + err.Error()})
		return
	}
	// Reload in all engines
	services.ReloadBizConfig()
	auditLog(c, "update_business_config", "updated business configuration", "business_config")
	c.JSON(200, gin.H{"ok": true, "config": cfg})
}

func (h *AdminHandler) ReloadBusinessConfig(c *gin.Context) {
	services.ReloadBizConfig()
	auditLog(c, "reload_business_config", "reloaded business configuration from DB", "business_config")
	c.JSON(200, gin.H{"ok": true, "config": services.GetBizConfig()})
}

// ---------- Crust Management ----------

func (h *AdminHandler) GetCrustsAdmin(c *gin.Context) {
	rows, err := database.DB.Query(`
		SELECT id, slug, name, COALESCE(description,''),
		       COALESCE(price_regular,0), COALESCE(price_medium,0), COALESCE(price_large,0),
		       active, sort_order
		FROM menu_crusts WHERE restaurant_id=$1 ORDER BY sort_order
	`, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to load crusts"})
		return
	}
	defer rows.Close()

	type Crust struct {
		ID          int     `json:"id"`
		Slug        string  `json:"slug"`
		Name        string  `json:"name"`
		Description string  `json:"description"`
		PriceRegular float64 `json:"price_regular"`
		PriceMedium  float64 `json:"price_medium"`
		PriceLarge   float64 `json:"price_large"`
		Active       bool    `json:"active"`
		SortOrder    int     `json:"sort_order"`
	}
	var crusts []Crust
	for rows.Next() {
		var cr Crust
		if err := rows.Scan(&cr.ID, &cr.Slug, &cr.Name, &cr.Description, &cr.PriceRegular, &cr.PriceMedium, &cr.PriceLarge, &cr.Active, &cr.SortOrder); err != nil {
			c.JSON(500, gin.H{"error": "failed to scan crust"})
			return
		}
		crusts = append(crusts, cr)
	}
	c.JSON(200, crusts)
}

func (h *AdminHandler) CreateCrust(c *gin.Context) {
	var req struct {
		Slug         string  `json:"slug"`
		Name         string  `json:"name"`
		Description  string  `json:"description"`
		PriceRegular float64 `json:"price_regular"`
		PriceMedium  float64 `json:"price_medium"`
		PriceLarge   float64 `json:"price_large"`
		SortOrder    int     `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid JSON"})
		return
	}
	if req.Slug == "" || req.Name == "" {
		c.JSON(400, gin.H{"error": "slug and name required"})
		return
	}
	var id int
	err := database.DB.QueryRow(`
		INSERT INTO menu_crusts (slug, name, description, price_regular, price_medium, price_large, sort_order, restaurant_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
	`, req.Slug, req.Name, req.Description, req.PriceRegular, req.PriceMedium, req.PriceLarge, req.SortOrder,
		services.ResolveRestaurant(c.GetInt("restaurantID"))).Scan(&id)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to create crust: " + err.Error()})
		return
	}
	auditLog(c, "create_crust", "created crust: "+req.Name, req.Name)
	c.JSON(201, gin.H{"id": id, "slug": req.Slug, "name": req.Name})
}

func (h *AdminHandler) UpdateCrust(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid id"})
		return
	}
	var req struct {
		Slug         string  `json:"slug"`
		Name         string  `json:"name"`
		Description  string  `json:"description"`
		PriceRegular float64 `json:"price_regular"`
		PriceMedium  float64 `json:"price_medium"`
		PriceLarge   float64 `json:"price_large"`
		Active       bool    `json:"active"`
		SortOrder    int     `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid JSON"})
		return
	}
	res, err := database.DB.Exec(`
		UPDATE menu_crusts SET slug=$1, name=$2, description=$3,
		       price_regular=$4, price_medium=$5, price_large=$6,
		       active=$7, sort_order=$8
		WHERE id=$9 AND restaurant_id=$10
	`, req.Slug, req.Name, req.Description, req.PriceRegular, req.PriceMedium, req.PriceLarge, req.Active, req.SortOrder, id,
		services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to update crust"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(404, gin.H{"error": "crust not found"})
		return
	}
	auditLog(c, "update_crust", "updated crust: "+req.Name, req.Name)
	c.JSON(200, gin.H{"ok": true})
}

func (h *AdminHandler) DeleteCrust(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid id"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var name string
	database.DB.QueryRow(`SELECT name FROM menu_crusts WHERE id=$1 AND restaurant_id=$2`, id, rid).Scan(&name)
	res, err := database.DB.Exec(`DELETE FROM menu_crusts WHERE id=$1 AND restaurant_id=$2`, id, rid)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to delete crust"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(404, gin.H{"error": "crust not found"})
		return
	}
	auditLog(c, "delete_crust", "deleted crust: "+name, name)
	c.JSON(200, gin.H{"ok": true})
}
