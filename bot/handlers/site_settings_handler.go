package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/services"

	"github.com/gin-gonic/gin"
)

type SiteSettingsHandler struct{}

func NewSiteSettingsHandler() *SiteSettingsHandler {
	return &SiteSettingsHandler{}
}

// publicKeys are the settings keys exposed to the public API.
var publicKeys = []string{"brand", "seo", "social", "footer"}

// --- Public endpoints ---

func (h *SiteSettingsHandler) GetSiteSettings(c *gin.Context) {
	placeholders := make([]string, len(publicKeys))
	args := make([]interface{}, len(publicKeys))
	for i, k := range publicKeys {
		placeholders[i] = "$" + strconv.Itoa(i+1)
		args[i] = k
	}
	// Public storefront serves the default restaurant until Phase 4 routing.
	args = append(args, services.ResolveRestaurant(0))
	rows, err := database.DB.Query(`SELECT key, value FROM site_settings WHERE key IN (`+strings.Join(placeholders, ",")+`) AND restaurant_id = $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		// table may not exist yet — return empty defaults
		c.JSON(http.StatusOK, gin.H{"settings": map[string]interface{}{}})
		return
	}
	defer rows.Close()
	result := map[string]interface{}{}
	for rows.Next() {
		var key string
		var value []byte
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}
		result[key] = json.RawMessage(value)
	}
	c.JSON(http.StatusOK, gin.H{"settings": result})
}

func (h *SiteSettingsHandler) GetPage(c *gin.Context) {
	slug := c.Param("slug")
	var id int
	var title, content, metaTitle, metaDesc string
	var updatedAt string
	err := database.DB.QueryRow(
		`SELECT id, title, content, meta_title, meta_desc, updated_at::text
		 FROM site_pages WHERE slug=$1 AND published=true AND restaurant_id=$2`, slug,
		services.ResolveRestaurant(0),
	).Scan(&id, &title, &content, &metaTitle, &metaDesc, &updatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"page": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"page": gin.H{
		"id": id, "slug": slug, "title": title, "content": content,
		"meta_title": metaTitle, "meta_desc": metaDesc, "updated_at": updatedAt,
	}})
}

func (h *SiteSettingsHandler) GetMenuCategories(c *gin.Context) {
	rows, err := database.DB.Query(
		`SELECT id, slug, name, description, image_url, sort_order
		 FROM menu_categories WHERE active=true AND restaurant_id=$1 ORDER BY sort_order, name`,
		services.ResolveRestaurant(0))
	if err != nil {
		// table may not exist yet — return empty
		c.JSON(http.StatusOK, gin.H{"categories": []map[string]interface{}{}})
		return
	}
	defer rows.Close()
	var cats []map[string]interface{}
	for rows.Next() {
		var id, sortOrder int
		var slug, name, desc, imageURL string
		if err := rows.Scan(&id, &slug, &name, &desc, &imageURL, &sortOrder); err != nil {
			continue
		}
		cats = append(cats, map[string]interface{}{
			"id": id, "slug": slug, "name": name, "description": desc,
			"image_url": imageURL, "sort_order": sortOrder,
		})
	}
	if cats == nil {
		cats = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"categories": cats})
}

// --- Admin endpoints ---

func (h *SiteSettingsHandler) GetSiteSettingsAdmin(c *gin.Context) {
	rows, err := database.DB.Query(
		`SELECT key, value, updated_at::text FROM site_settings WHERE restaurant_id=$1 ORDER BY key`,
		services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		// table may not exist yet — return empty
		c.JSON(http.StatusOK, gin.H{"settings": []map[string]interface{}{}})
		return
	}
	defer rows.Close()
	var settings []map[string]interface{}
	for rows.Next() {
		var key string
		var value []byte
		var updatedAt string
		if err := rows.Scan(&key, &value, &updatedAt); err != nil {
			continue
		}
		settings = append(settings, map[string]interface{}{
			"key": key, "value": json.RawMessage(value), "updated_at": updatedAt,
		})
	}
	if settings == nil {
		settings = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"settings": settings})
}

func (h *SiteSettingsHandler) UpdateSiteSetting(c *gin.Context) {
	key := c.Param("key")
	if matched, _ := regexp.MatchString(`^[a-z0-9_]{1,64}$`, key); !matched {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid key format"})
		return
	}
	var req struct {
		Value *json.RawMessage `json:"value"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Value == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	res, err := database.DB.Exec(
		`INSERT INTO site_settings (key, value, restaurant_id) VALUES ($1, $2::jsonb, $3)
		 ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
		 WHERE site_settings.restaurant_id = $3`,
		key, []byte(*req.Value), rid,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update setting"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "setting not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
}

func (h *SiteSettingsHandler) ListPages(c *gin.Context) {
	rows, err := database.DB.Query(
		`SELECT id, slug, title, content, meta_title, meta_desc, published, updated_at::text
		 FROM site_pages WHERE restaurant_id=$1 ORDER BY id`,
		services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"pages": []map[string]interface{}{}})
		return
	}
	defer rows.Close()
	var pages []map[string]interface{}
	for rows.Next() {
		var id int
		var slug, title, content, metaTitle, metaDesc, updatedAt string
		var published bool
		if err := rows.Scan(&id, &slug, &title, &content, &metaTitle, &metaDesc, &published, &updatedAt); err != nil {
			continue
		}
		pages = append(pages, map[string]interface{}{
			"id": id, "slug": slug, "title": title, "content": content,
			"meta_title": metaTitle, "meta_desc": metaDesc,
			"published": published, "updated_at": updatedAt,
		})
	}
	if pages == nil {
		pages = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"pages": pages})
}

func (h *SiteSettingsHandler) GetPageAdmin(c *gin.Context) {
	slug := c.Param("slug")
	var id int
	var title, content, metaTitle, metaDesc, updatedAt string
	var published bool
	err := database.DB.QueryRow(
		`SELECT id, title, content, meta_title, meta_desc, published, updated_at::text
		 FROM site_pages WHERE slug=$1 AND restaurant_id=$2`, slug,
		services.ResolveRestaurant(c.GetInt("restaurantID")),
	).Scan(&id, &title, &content, &metaTitle, &metaDesc, &published, &updatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"page": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"page": gin.H{
		"id": id, "slug": slug, "title": title, "content": content,
		"meta_title": metaTitle, "meta_desc": metaDesc,
		"published": published, "updated_at": updatedAt,
	}})
}

func (h *SiteSettingsHandler) UpsertPage(c *gin.Context) {
	slug := c.Param("slug")
	var req struct {
		Title     string `json:"title" binding:"required"`
		Content   string `json:"content"`
		MetaTitle string `json:"meta_title"`
		MetaDesc  string `json:"meta_desc"`
		Published *bool  `json:"published"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if len(req.Title) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title too long (max 200 characters)"})
		return
	}
	if len(req.Content) > 50000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "content too long (max 50000 characters)"})
		return
	}
	published := true
	if req.Published != nil {
		published = *req.Published
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var id int
	err := database.DB.QueryRow(
		`INSERT INTO site_pages (slug, title, content, meta_title, meta_desc, published, restaurant_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)
		 ON CONFLICT (slug) DO UPDATE SET
		   title=EXCLUDED.title, content=EXCLUDED.content,
		   meta_title=EXCLUDED.meta_title, meta_desc=EXCLUDED.meta_desc,
		   published=EXCLUDED.published, updated_at=NOW()
		 WHERE site_pages.restaurant_id=$7
		 RETURNING id`,
		slug, req.Title, req.Content, req.MetaTitle, req.MetaDesc, published, rid,
	).Scan(&id)
	if err == sql.ErrNoRows {
		// Conflict hit another tenant's slug: reveal nothing.
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save page"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "slug": slug})
}

func (h *SiteSettingsHandler) DeletePage(c *gin.Context) {
	slug := c.Param("slug")
	res, err := database.DB.Exec(`DELETE FROM site_pages WHERE slug=$1 AND restaurant_id=$2`,
		slug, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete page"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (h *SiteSettingsHandler) GetMenuCategoriesAdmin(c *gin.Context) {
	rows, err := database.DB.Query(
		`SELECT id, slug, name, description, image_url, sort_order, active, updated_at::text
		 FROM menu_categories WHERE restaurant_id=$1 ORDER BY sort_order, name`,
		services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"categories": []map[string]interface{}{}})
		return
	}
	defer rows.Close()
	var cats []map[string]interface{}
	for rows.Next() {
		var id, sortOrder int
		var slug, name, desc, imageURL, updatedAt string
		var active bool
		if err := rows.Scan(&id, &slug, &name, &desc, &imageURL, &sortOrder, &active, &updatedAt); err != nil {
			continue
		}
		cats = append(cats, map[string]interface{}{
			"id": id, "slug": slug, "name": name, "description": desc,
			"image_url": imageURL, "sort_order": sortOrder,
			"active": active, "updated_at": updatedAt,
		})
	}
	if cats == nil {
		cats = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"categories": cats})
}

func (h *SiteSettingsHandler) CreateCategory(c *gin.Context) {
	var req struct {
		Slug        string `json:"slug" binding:"required"`
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		ImageURL    string `json:"image_url"`
		SortOrder   int    `json:"sort_order"`
		Active      *bool  `json:"active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if len(req.Slug) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug too long (max 100 characters)"})
		return
	}
	if len(req.Name) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name too long (max 100 characters)"})
		return
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	var id int
	err := database.DB.QueryRow(
		`INSERT INTO menu_categories (slug, name, description, image_url, sort_order, active, restaurant_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		req.Slug, req.Name, req.Description, req.ImageURL, req.SortOrder, active,
		services.ResolveRestaurant(c.GetInt("restaurantID")),
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create category"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "slug": req.Slug})
}

func (h *SiteSettingsHandler) UpdateCategory(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	var req struct {
		Slug        *string `json:"slug"`
		Name        *string `json:"name"`
		Description *string `json:"description"`
		ImageURL    *string `json:"image_url"`
		SortOrder   *int    `json:"sort_order"`
		Active      *bool   `json:"active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	set := []string{}
	args := []interface{}{}
	n := 1
	if req.Slug != nil {
		set = append(set, "slug=$"+strconv.Itoa(n))
		args = append(args, *req.Slug)
		n++
	}
	if req.Name != nil {
		set = append(set, "name=$"+strconv.Itoa(n))
		args = append(args, *req.Name)
		n++
	}
	if req.Description != nil {
		set = append(set, "description=$"+strconv.Itoa(n))
		args = append(args, *req.Description)
		n++
	}
	if req.ImageURL != nil {
		set = append(set, "image_url=$"+strconv.Itoa(n))
		args = append(args, *req.ImageURL)
		n++
	}
	if req.SortOrder != nil {
		set = append(set, "sort_order=$"+strconv.Itoa(n))
		args = append(args, *req.SortOrder)
		n++
	}
	if req.Active != nil {
		set = append(set, "active=$"+strconv.Itoa(n))
		args = append(args, *req.Active)
		n++
	}
	if len(set) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields"})
		return
	}
	set = append(set, "updated_at=NOW()")
	args = append(args, id)
	n++
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	args = append(args, rid)
	res, err := database.DB.Exec(`UPDATE menu_categories SET `+strings.Join(set, ", ")+` WHERE id=$`+strconv.Itoa(n-1)+` AND restaurant_id=$`+strconv.Itoa(n), args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update category"})
		return
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
}

func (h *SiteSettingsHandler) DeleteCategory(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	res, err := database.DB.Exec(`DELETE FROM menu_categories WHERE id=$1 AND restaurant_id=$2`,
		id, services.ResolveRestaurant(c.GetInt("restaurantID")))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete category"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// settingValue reads one site_settings key for a restaurant.
// restaurantID 0 resolves to the default (public storefront behavior).
func settingValue(key string, restaurantID int) ([]byte, error) {
	var value []byte
	err := database.DB.QueryRow(
		`SELECT value FROM site_settings WHERE key=$1 AND restaurant_id=$2`,
		key, services.ResolveRestaurant(restaurantID)).Scan(&value)
	return value, err
}

// upsertSetting writes one site_settings key for a restaurant.
// Returns rows affected (0 = key owned by another tenant).
func upsertSetting(key string, raw []byte, restaurantID int) (int64, error) {
	// NOTE: UNIQUE(key) becomes UNIQUE(key, restaurant_id) in migration 022.
	// Until then the guarded conflict target below prevents cross-tenant writes.
	res, err := database.DB.Exec(
		`INSERT INTO site_settings (key, value, restaurant_id) VALUES ($1, $2::jsonb, $3)
		 ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
		 WHERE site_settings.restaurant_id = $3`,
		key, raw, services.ResolveRestaurant(restaurantID),
	)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// --- Offers / Banners (stored in site_settings) ---

func (h *SiteSettingsHandler) GetOffers(c *gin.Context) {
	value, err := settingValue("offers", c.GetInt("restaurantID"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"offers": []interface{}{}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"offers": json.RawMessage(value)})
}

func (h *SiteSettingsHandler) UpdateOffers(c *gin.Context) {
	var req struct {
		Offers *json.RawMessage `json:"offers"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Offers == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	n, err := upsertSetting("offers", []byte(*req.Offers), c.GetInt("restaurantID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update offers"})
		return
	}
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "offers not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
}

func (h *SiteSettingsHandler) GetBanners(c *gin.Context) {
	value, err := settingValue("banners", c.GetInt("restaurantID"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"banners": []interface{}{}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"banners": json.RawMessage(value)})
}

func (h *SiteSettingsHandler) UpdateBanners(c *gin.Context) {
	var req struct {
		Banners *json.RawMessage `json:"banners"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Banners == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	n, err := upsertSetting("banners", []byte(*req.Banners), c.GetInt("restaurantID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update banners"})
		return
	}
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "banners not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
}

// --- Public endpoints for customer-facing pages ---

func (h *SiteSettingsHandler) GetOffersPublic(c *gin.Context) {
	value, err := settingValue("offers", 0)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"offers": []interface{}{}})
		return
	}
	var offers []map[string]interface{}
	if err := json.Unmarshal(value, &offers); err != nil {
		c.JSON(http.StatusOK, gin.H{"offers": []interface{}{}})
		return
	}
	var active []map[string]interface{}
	for _, o := range offers {
		if v, ok := o["active"].(bool); ok && v {
			active = append(active, o)
		}
	}
	c.JSON(http.StatusOK, gin.H{"offers": active})
}

func (h *SiteSettingsHandler) GetBannersPublic(c *gin.Context) {
	value, err := settingValue("banners", 0)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"banners": []interface{}{}})
		return
	}
	var banners []map[string]interface{}
	if err := json.Unmarshal(value, &banners); err != nil {
		c.JSON(http.StatusOK, gin.H{"banners": []interface{}{}})
		return
	}
	var active []map[string]interface{}
	for _, b := range banners {
		if v, ok := b["active"].(bool); ok && v {
			active = append(active, b)
		}
	}
	c.JSON(http.StatusOK, gin.H{"banners": active})
}

// --- Family packs page config (BOGO card + pack list) ---

func (h *SiteSettingsHandler) GetFamilyPacks(c *gin.Context) {
	value, err := settingValue("family_packs", c.GetInt("restaurantID"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"family_packs": defaultFamilyPacks()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"family_packs": json.RawMessage(value)})
}

func (h *SiteSettingsHandler) UpdateFamilyPacks(c *gin.Context) {
	var req struct {
		FamilyPacks *json.RawMessage `json:"family_packs"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.FamilyPacks == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	raw := []byte(*req.FamilyPacks)
	n, err := upsertSetting("family_packs", raw, c.GetInt("restaurantID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update family packs"})
		return
	}
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "family packs not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
}

func (h *SiteSettingsHandler) GetFamilyPacksPublic(c *gin.Context) {
	value, err := settingValue("family_packs", 0)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"family_packs": defaultFamilyPacks()})
		return
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(value, &cfg); err != nil {
		c.JSON(http.StatusOK, gin.H{"family_packs": defaultFamilyPacks()})
		return
	}
	if packs, ok := cfg["packs"].([]interface{}); ok {
		var active []interface{}
		for _, p := range packs {
			if m, ok := p.(map[string]interface{}); ok {
				if v, ok := m["active"].(bool); ok && v {
					active = append(active, m)
				}
			}
		}
		cfg["packs"] = active
	}
	c.JSON(http.StatusOK, gin.H{"family_packs": cfg})
}

// Empty shape — every business configures its own content via admin.
// No business-specific content belongs in code fallbacks.
func defaultFamilyPacks() map[string]interface{} {
	return map[string]interface{}{
		"bogo": map[string]interface{}{
			"title":       "",
			"subtitle":    "",
			"description": "",
			"pricing":     "",
			"active":      false,
		},
		"packs": []interface{}{},
	}
}
