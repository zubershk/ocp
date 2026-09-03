package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
	"orangecheesepizza/bot/services"
)

type ReviewHandler struct{}

func NewReviewHandler() *ReviewHandler {
	return &ReviewHandler{}
}

type reviewOrder struct {
	OrderID int
	Name    string
	Phone   string
}

// resolveOrder verifies the caller may review orderID: either the
// per-order access token matches, or the customer bearer owns it.
// Only delivered orders can be reviewed.
func (h *ReviewHandler) resolveOrder(c *gin.Context, orderID int) *reviewOrder {
	var (
		status      string
		accessToken string
		name        string
		phone       string
	)
	err := database.DB.QueryRow(
		`SELECT status, COALESCE(access_token,''), customer_name, customer_phone
		 FROM orders WHERE id = $1`, orderID,
	).Scan(&status, &accessToken, &name, &phone)
	if err != nil {
		return nil
	}
	if status != "delivered" {
		return nil
	}
	if token := c.GetHeader("X-Order-Token"); token != "" && accessToken != "" && token == accessToken {
		return &reviewOrder{OrderID: orderID, Name: name, Phone: phone}
	}
	if bearerPhone := customerPhoneFromBearer(c); bearerPhone != "" {
		if owned, err := services.CustomerOrderByIdentifier(bearerPhone, strconv.Itoa(orderID)); err == nil && owned != nil {
			return &reviewOrder{OrderID: orderID, Name: name, Phone: phone}
		}
	}
	return nil
}

// CreateReview handles POST /api/reviews — verified-purchase only.
func (h *ReviewHandler) CreateReview(c *gin.Context) {
	var req struct {
		OrderID     int    `json:"order_id" binding:"required"`
		Rating      int    `json:"rating" binding:"required"`
		Title       string `json:"title"`
		Body        string `json:"body"`
		ItemRatings []struct {
			ItemSlug string `json:"item_slug" binding:"required"`
			Rating   int    `json:"rating" binding:"required"`
		} `json:"item_ratings"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if req.Rating < 1 || req.Rating > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rating must be 1-5"})
		return
	}
	ord := h.resolveOrder(c, req.OrderID)
	if ord == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "only delivered orders can be reviewed"})
		return
	}
	title := strings.TrimSpace(req.Title)
	if len(title) > 120 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title too long (max 120 characters)"})
		return
	}
	body := strings.TrimSpace(req.Body)
	if len(body) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "review too long (max 2000 characters)"})
		return
	}
	_, err := database.DB.Exec(`
		INSERT INTO reviews (order_id, item_slug, customer_name, customer_phone, rating, title, body)
		VALUES ($1, '', $2, $3, $4, $5, $6)
		ON CONFLICT (order_id, item_slug) DO UPDATE SET
			rating=EXCLUDED.rating, title=EXCLUDED.title, body=EXCLUDED.body,
			approved=false, created_at=CURRENT_TIMESTAMP
	`, req.OrderID, ord.Name, ord.Phone, req.Rating, title, body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save review"})
		return
	}
	for _, ir := range req.ItemRatings {
		if ir.Rating < 1 || ir.Rating > 5 || strings.TrimSpace(ir.ItemSlug) == "" {
			continue
		}
		_, _ = database.DB.Exec(`
			INSERT INTO reviews (order_id, item_slug, customer_name, customer_phone, rating, title, body)
			VALUES ($1, $2, $3, $4, $5, '', '')
			ON CONFLICT (order_id, item_slug) DO UPDATE SET
				rating=EXCLUDED.rating, approved=false, created_at=CURRENT_TIMESTAMP
		`, req.OrderID, strings.TrimSpace(ir.ItemSlug), ord.Name, ord.Phone, ir.Rating)
	}
	c.JSON(http.StatusCreated, gin.H{"saved": true})
}

// ListReviews handles GET /api/reviews — approved only.
func (h *ReviewHandler) ListReviews(c *gin.Context) {
	limit := 20
	if n, err := strconv.Atoi(c.DefaultQuery("limit", "20")); err == nil && n > 0 && n <= 100 {
		limit = n
	}
	args := []interface{}{}
	where := `WHERE approved = true`
	if slug := strings.TrimSpace(c.Query("item")); slug != "" {
		where += ` AND item_slug = $1`
		args = append(args, slug)
	}
	args = append(args, limit)
	rows, err := database.DB.Query(`
		SELECT id, order_id, item_slug, customer_name, rating,
		       COALESCE(title,''), COALESCE(body,''), created_at
		FROM reviews `+where+` ORDER BY created_at DESC LIMIT $`+strconv.Itoa(len(args)),
		args...,
	)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"reviews": []interface{}{}})
		return
	}
	defer rows.Close()
	out := []models.Review{}
	for rows.Next() {
		var r models.Review
		if err := rows.Scan(&r.ID, &r.OrderID, &r.ItemSlug, &r.CustomerName, &r.Rating, &r.Title, &r.Body, &r.CreatedAt); err != nil {
			continue
		}
		out = append(out, r)
	}
	c.JSON(http.StatusOK, gin.H{"reviews": out})
}

// ReviewSummary handles GET /api/reviews/summary — overall + per-item aggregates.
func (h *ReviewHandler) ReviewSummary(c *gin.Context) {
	var avg sql.NullFloat64
	var count int
	_ = database.DB.QueryRow(`
		SELECT AVG(rating), COUNT(*) FROM reviews
		WHERE approved = true AND item_slug = ''
	`).Scan(&avg, &count)
	rows, err := database.DB.Query(`
		SELECT item_slug, AVG(rating), COUNT(*) FROM reviews
		WHERE approved = true AND item_slug <> ''
		GROUP BY item_slug
	`)
	perItem := map[string]map[string]interface{}{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var slug string
			var a sql.NullFloat64
			var n int
			if err := rows.Scan(&slug, &a, &n); err != nil {
				continue
			}
			perItem[slug] = map[string]interface{}{"average": a.Float64, "count": n}
		}
	}
	overall := 0.0
	if avg.Valid {
		overall = avg.Float64
	}
	c.JSON(http.StatusOK, gin.H{
		"summary": map[string]interface{}{
			"average":  overall,
			"count":    count,
			"per_item": perItem,
		},
	})
}

// ListReviewsAdmin handles GET /admin/reviews — all reviews, newest first.
func (h *ReviewHandler) ListReviewsAdmin(c *gin.Context) {
	limit := 100
	if n, err := strconv.Atoi(c.DefaultQuery("limit", "100")); err == nil && n > 0 && n <= 500 {
		limit = n
	}
	where := ""
	if c.Query("pending") == "1" {
		where = "WHERE approved = false"
	}
	rows, err := database.DB.Query(`
		SELECT id, order_id, item_slug, customer_name, COALESCE(customer_phone,''),
		       rating, COALESCE(title,''), COALESCE(body,''), approved, created_at
		FROM reviews `+where+` ORDER BY created_at DESC LIMIT $1
	`, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load reviews"})
		return
	}
	defer rows.Close()
	out := []models.Review{}
	for rows.Next() {
		var r models.Review
		if err := rows.Scan(&r.ID, &r.OrderID, &r.ItemSlug, &r.CustomerName, &r.CustomerPhone,
			&r.Rating, &r.Title, &r.Body, &r.Approved, &r.CreatedAt); err != nil {
			continue
		}
		out = append(out, r)
	}
	c.JSON(http.StatusOK, gin.H{"reviews": out})
}

// ModerateReview handles PATCH /admin/reviews/:id — approve or hide.
func (h *ReviewHandler) ModerateReview(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req struct {
		Approved *bool `json:"approved"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Approved == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "approved is required"})
		return
	}
	res, err := database.DB.Exec(`UPDATE reviews SET approved = $1 WHERE id = $2`, *req.Approved, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update review"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "review not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
