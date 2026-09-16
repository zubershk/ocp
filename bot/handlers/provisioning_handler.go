package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/services"
)

type ProvisioningHandler struct{}

func NewProvisioningHandler() *ProvisioningHandler { return &ProvisioningHandler{} }

func hashKey(raw string) string {
	h := sha256.Sum256([]byte(strings.TrimSpace(raw)))
	return hex.EncodeToString(h[:])
}

func (h *ProvisioningHandler) Signup(c *gin.Context) {
	var req struct {
		OrgName   string `json:"org_name" binding:"required"`
		RestName  string `json:"restaurant_name" binding:"required"`
		Slug      string `json:"slug" binding:"required"`
		OwnerName string `json:"owner_name"`
		OwnerKey  string `json:"owner_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if len(req.OrgName) > 200 || len(req.RestName) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name too long"})
		return
	}
	slug := strings.ToLower(strings.TrimSpace(req.Slug))
	if err := services.ValidateSlug(slug); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	keyHash := ""
	if strings.TrimSpace(req.OwnerKey) != "" {
		keyHash = hashKey(req.OwnerKey)
	}
	orgID, restID, outletID, userID, err := services.ProvisionRestaurant(req.OrgName, req.RestName, slug, req.OwnerName, keyHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "provision failed"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"organization_id": orgID,
		"restaurant_id":   restID,
		"outlet_id":       outletID,
		"user_id":         userID,
		"slug":            slug,
		"domain":          slug + ".ocp.app",
	})
}

func (h *ProvisioningHandler) GetOnboarding(c *gin.Context) {
	rid, err := services.RequireRestaurant(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant required"})
		return
	}
	// fetch onboarding_progress
	rows := services.GetOnboarding(rid)
	c.JSON(http.StatusOK, rows)
}

func (h *ProvisioningHandler) UpdateOnboarding(c *gin.Context) {
	rid, err := services.RequireRestaurant(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant required"})
		return
	}
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if err := services.SaveOnboarding(rid, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true})
}
