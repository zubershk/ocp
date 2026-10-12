package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/services"
)

type ContactHandler struct{}

func NewContactHandler() *ContactHandler {
	return &ContactHandler{}
}

type ContactSubmission struct {
	ID           int    `json:"id"`
	RestaurantID int    `json:"restaurant_id"`
	Name         string `json:"name"`
	Phone        string `json:"phone"`
	Email        string `json:"email"`
	Category     string `json:"category"`
	Priority     string `json:"priority"`
	Message      string `json:"message"`
	Status       string `json:"status"`
	CreatedAt    string `json:"created_at"`
}

var validCategories = map[string]bool{
	"general": true, "order": true, "feedback": true, "complaint": true, "other": true,
}

var validPriorities = map[string]bool{
	"low": true, "normal": true, "high": true, "urgent": true,
}

// SubmitContact handles POST /api/contact — public endpoint.
func (h *ContactHandler) SubmitContact(c *gin.Context) {
	var req struct {
		Name     string `json:"name" binding:"required"`
		Phone    string `json:"phone" binding:"required"`
		Email    string `json:"email"`
		Category string `json:"category"`
		Priority string `json:"priority"`
		Message  string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name, phone, and message are required"})
		return
	}

	// Validate inputs
	name := strings.TrimSpace(req.Name)
	if len(name) < 2 || len(name) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name must be 2-100 characters"})
		return
	}
	phone := strings.TrimSpace(req.Phone)
	if !isValidPhone(phone) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "phone must be 10 digits"})
		return
	}
	message := strings.TrimSpace(req.Message)
	if len(message) < 5 || len(message) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message must be 5-2000 characters"})
		return
	}
	category := strings.ToLower(strings.TrimSpace(req.Category))
	if category == "" {
		category = "general"
	}
	if !validCategories[category] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category"})
		return
	}
	priority := strings.ToLower(strings.TrimSpace(req.Priority))
	if priority == "" {
		priority = "normal"
	}
	if !validPriorities[priority] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid priority"})
		return
	}
	email := strings.TrimSpace(req.Email)
	if email != "" {
		if !strings.Contains(email, "@") || !strings.Contains(email, ".") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid email format"})
			return
		}
	}

	rid, errReq := services.RequireRestaurant(c)
	if errReq != nil {
		if database.DB != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tenant required"})
			return
		}
		rid = 0
	}

	var id int
	err := database.DB.QueryRow(`
		INSERT INTO contact_submissions (restaurant_id, name, phone, email, category, priority, message)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7)
		RETURNING id
	`, rid, name, phone, email, category, priority, message).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save submission"})
		return
	}

	// Broadcast realtime event for admin notification
	services.BroadcastRealtimeFor(rid, 0, 0, "contact.submitted", map[string]interface{}{
		"id":       id,
		"name":     name,
		"category": category,
		"priority": priority,
	})

	c.JSON(http.StatusCreated, gin.H{"id": id, "saved": true})
}

// ListContactSubmissions handles GET /admin/contact-submissions — admin only.
func (h *ContactHandler) ListContactSubmissions(c *gin.Context) {
	limit := 50
	if n, err := strconv.Atoi(c.DefaultQuery("limit", "50")); err == nil && n > 0 && n <= 200 {
		limit = n
	}
	status := strings.TrimSpace(c.Query("status"))
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))

	args := []interface{}{rid, limit}
	where := "WHERE restaurant_id = $1"
	if status != "" {
		where += " AND status = $3"
		args = append(args, status)
	}

	rows, err := database.DB.Query(`
		SELECT id, name, phone, COALESCE(email,''), category, priority, message, status, created_at::text
		FROM contact_submissions `+where+` ORDER BY created_at DESC LIMIT $2
	`, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load submissions"})
		return
	}
	defer rows.Close()

	out := []ContactSubmission{}
	for rows.Next() {
		var s ContactSubmission
		if err := rows.Scan(&s.ID, &s.Name, &s.Phone, &s.Email, &s.Category, &s.Priority, &s.Message, &s.Status, &s.CreatedAt); err != nil {
			continue
		}
		out = append(out, s)
	}
	c.JSON(http.StatusOK, gin.H{"submissions": out})
}

// UpdateContactSubmission handles PATCH /admin/contact-submissions/:id — update status.
func (h *ContactHandler) UpdateContactSubmission(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
		return
	}
	status := strings.TrimSpace(req.Status)
	if status != "new" && status != "read" && status != "responded" && status != "closed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be new, read, responded, or closed"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	res, err := database.DB.Exec(`UPDATE contact_submissions SET status = $1, updated_at = NOW() WHERE id = $2 AND restaurant_id = $3`, status, id, rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update submission"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func isValidPhone(phone string) bool {
	if len(phone) != 10 {
		return false
	}
	for _, c := range phone {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}
