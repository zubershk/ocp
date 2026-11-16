package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/services"
)

// generateOwnerKey returns a high-entropy admin key for a newly provisioned
// tenant. It is shown to the caller exactly once and only its hash is stored.
func generateOwnerKey() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

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
	// Always create a usable owner. If the caller did not supply a key,
	// generate a high-entropy one and return it exactly once in the response.
	ownerKey := strings.TrimSpace(req.OwnerKey)
	generatedKey := ""
	if ownerKey == "" {
		var err error
		ownerKey, err = generateOwnerKey()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate owner key"})
			return
		}
		generatedKey = ownerKey
	}
	keyHash := hashKey(ownerKey)
	orgID, restID, outletID, userID, err := services.ProvisionRestaurant(req.OrgName, req.RestName, slug, req.OwnerName, keyHash)
	if err != nil {
		if err == services.ErrSlugTaken {
			c.JSON(http.StatusConflict, gin.H{"error": "slug already taken"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "provision failed"})
		return
	}
	resp := gin.H{
		"organization_id": orgID,
		"restaurant_id":   restID,
		"outlet_id":       outletID,
		"user_id":         userID,
		"slug":            slug,
		"domain":          slug + ".ocp.app",
	}
	if generatedKey != "" {
		// Shown exactly once — the caller must save it. Only the hash is stored.
		resp["owner_key"] = generatedKey
		resp["warning"] = "Save this owner key now; it cannot be retrieved again."
	}
	c.JSON(http.StatusCreated, resp)
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
