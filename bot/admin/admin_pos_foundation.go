package admin

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/services"
)

// ------------------------------------------------------------------
// PR #2 Foundation Admin Handlers — addon groups/items, tables admin,
// payment methods, customer fields. Tenant-isolated, audit all mutations,
// no POS runtime wiring.
// ------------------------------------------------------------------

// Addon Groups

func (h *AdminHandler) ListAddonGroups(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	menuItemID, _ := strconv.Atoi(c.Query("menu_item_id"))
	groups, err := services.ListAddonGroups(rid, menuItemID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	if groups == nil {
		groups = []services.AddonGroup{}
	}
	c.JSON(http.StatusOK, gin.H{"addon_groups": groups})
}

func (h *AdminHandler) CreateAddonGroup(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var req services.AddonGroup
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	// Ensure tenant: ignore client restaurant_id
	req.RestaurantID = rid
	if req.MenuItemID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "menu_item_id is required"})
		return
	}
	req.Active = true
	if _, ok := c.GetQuery("active"); ok {
		// allow active override if provided via patch-style create? keep true default
	}
	created, err := services.CreateAddonGroup(rid, req)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "already exists") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		if strings.Contains(err.Error(), "menu item") || strings.Contains(err.Error(), "belong") || strings.Contains(err.Error(), "required") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "create_addon_group", strconv.Itoa(created.ID), map[string]interface{}{"name": created.Name, "menu_item_id": created.MenuItemID})
	c.JSON(http.StatusCreated, gin.H{"addon_group": created})
}

func (h *AdminHandler) UpdateAddonGroup(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var patch map[string]interface{}
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	updated, err := services.UpdateAddonGroup(id, rid, patch)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "addon group not found"})
			return
		}
		if strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "update_addon_group", strconv.Itoa(id), patch)
	c.JSON(http.StatusOK, gin.H{"addon_group": updated})
}

func (h *AdminHandler) DeleteAddonGroup(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	if err := services.DeleteAddonGroup(id, rid); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "addon group not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	auditLog(c, "delete_addon_group", strconv.Itoa(id), nil)
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// Addon Items

func (h *AdminHandler) ListAddonItems(c *gin.Context) {
	gid, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	items, err := services.ListAddonItems(gid, rid)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "addon group not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	if items == nil {
		items = []services.AddonItem{}
	}
	c.JSON(http.StatusOK, gin.H{"addon_items": items})
}

func (h *AdminHandler) CreateAddonItem(c *gin.Context) {
	gid, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var req struct {
		MenuItemID    int      `json:"menu_item_id" binding:"required"`
		PriceOverride *float64 `json:"price_override"`
		SortOrder     int      `json:"sort_order"`
		Active        *bool    `json:"active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	created, err := services.CreateAddonItem(rid, gid, req.MenuItemID, req.PriceOverride, req.SortOrder, active)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "create_addon_item", strconv.Itoa(created.ID), map[string]interface{}{"group_id": gid, "menu_item_id": req.MenuItemID})
	c.JSON(http.StatusCreated, gin.H{"addon_item": created})
}

func (h *AdminHandler) UpdateAddonItem(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var patch map[string]interface{}
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	updated, err := services.UpdateAddonItem(id, rid, patch)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "addon item not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "update_addon_item", strconv.Itoa(id), patch)
	c.JSON(http.StatusOK, gin.H{"addon_item": updated})
}

func (h *AdminHandler) DeleteAddonItem(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	if err := services.DeleteAddonItem(id, rid); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "addon item not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	auditLog(c, "delete_addon_item", strconv.Itoa(id), nil)
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// Tables Admin

func (h *AdminHandler) ListTablesAdmin(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	outletID, _ := strconv.Atoi(c.Query("outlet_id"))
	if outletID == 0 {
		outletID = c.GetInt("outletID")
	}
	tables, err := services.ListTablesAdmin(rid, outletID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	if tables == nil {
		tables = []services.TableInfo{}
	}
	c.JSON(http.StatusOK, gin.H{"tables": tables})
}

func (h *AdminHandler) CreateTableAdmin(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var req struct {
		OutletID    int    `json:"outlet_id"`
		Name        string `json:"name" binding:"required"`
		Capacity    int    `json:"capacity"`
		Position    int    `json:"position"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	if req.Capacity == 0 {
		req.Capacity = 4
	}
	outletID := req.OutletID
	if outletID == 0 {
		outletID = c.GetInt("outletID")
	}
	created, err := services.CreateTableAdmin(rid, outletID, req.Name, req.Capacity, req.Position, req.Description)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		if strings.Contains(err.Error(), "does not belong") || strings.Contains(err.Error(), "outlet") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "create_table", strconv.Itoa(created.ID), map[string]interface{}{"name": created.Name, "outlet_id": outletID})
	c.JSON(http.StatusCreated, gin.H{"table": created})
}

func (h *AdminHandler) UpdateTableAdmin(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var patch map[string]interface{}
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	updated, err := services.UpdateTableAdmin(id, rid, patch)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "table not found"})
			return
		}
		if strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "update_table", strconv.Itoa(id), patch)
	c.JSON(http.StatusOK, gin.H{"table": updated})
}

func (h *AdminHandler) DeleteTableAdmin(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	if err := services.DeleteTableAdmin(id, rid); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "table not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	auditLog(c, "delete_table", strconv.Itoa(id), nil)
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (h *AdminHandler) ReorderTables(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var req struct {
		OrderedIDs []int `json:"ordered_ids" binding:"required"`
		OutletID   int   `json:"outlet_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	outletID := req.OutletID
	if outletID == 0 {
		outletID = c.GetInt("outletID")
	}
	if err := services.ReorderTables(rid, outletID, req.OrderedIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "reorder_tables", "tables", map[string]interface{}{"ordered_ids": req.OrderedIDs})
	c.JSON(http.StatusOK, gin.H{"reordered": true})
}

// Payment Methods

func (h *AdminHandler) ListPaymentMethods(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	methods, err := services.ListPaymentMethods(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	if methods == nil {
		methods = []services.RestaurantPaymentMethod{}
	}
	c.JSON(http.StatusOK, gin.H{"payment_methods": methods})
}

func (h *AdminHandler) CreatePaymentMethod(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var req services.RestaurantPaymentMethod
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	created, err := services.CreatePaymentMethod(rid, req)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "create_payment_method", strconv.Itoa(created.ID), map[string]interface{}{"key": created.Key})
	c.JSON(http.StatusCreated, gin.H{"payment_method": created})
}

func (h *AdminHandler) UpdatePaymentMethod(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var patch map[string]interface{}
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	// Prevent key mutation via patch for system rows — service will ignore
	if _, hasKey := patch["key"]; hasKey {
		delete(patch, "key")
	}
	if _, hasSystem := patch["is_system"]; hasSystem {
		delete(patch, "is_system")
	}
	updated, err := services.UpdatePaymentMethod(id, rid, patch)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "payment method not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "update_payment_method", strconv.Itoa(id), patch)
	c.JSON(http.StatusOK, gin.H{"payment_method": updated})
}

func (h *AdminHandler) DeletePaymentMethod(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	if err := services.DeletePaymentMethod(id, rid); err != nil {
		if strings.Contains(err.Error(), "cannot delete system") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "payment method not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	auditLog(c, "delete_payment_method", strconv.Itoa(id), nil)
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (h *AdminHandler) ReorderPaymentMethods(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var req struct {
		OrderedIDs []int `json:"ordered_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	if err := services.ReorderPaymentMethods(rid, req.OrderedIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "reorder_payment_methods", "payment_methods", map[string]interface{}{"ordered_ids": req.OrderedIDs})
	c.JSON(http.StatusOK, gin.H{"reordered": true})
}

// Customer Fields

func (h *AdminHandler) ListCustomerFields(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	fields, err := services.ListCustomerFields(rid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": safeError(err)})
		return
	}
	if fields == nil {
		fields = []services.POSCustomerFieldRow{}
	}
	c.JSON(http.StatusOK, gin.H{"customer_fields": fields})
}

func (h *AdminHandler) UpsertCustomerField(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var req services.POSCustomerFieldRow
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	created, err := services.UpsertCustomerField(rid, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "upsert_customer_field", created.FieldKey, map[string]interface{}{"label": created.Label, "visible": created.Visible, "required": created.Required})
	c.JSON(http.StatusOK, gin.H{"customer_field": created})
}

func (h *AdminHandler) UpdateCustomerField(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return
	}
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var patch map[string]interface{}
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	// field_key immutable
	if _, ok := patch["field_key"]; ok {
		delete(patch, "field_key")
	}
	updated, err := services.UpdateCustomerField(id, rid, patch)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "customer field not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "update_customer_field", strconv.Itoa(id), patch)
	c.JSON(http.StatusOK, gin.H{"customer_field": updated})
}

func (h *AdminHandler) ReorderCustomerFields(c *gin.Context) {
	rid := services.ResolveRestaurant(c.GetInt("restaurantID"))
	var req struct {
		OrderedIDs []int `json:"ordered_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}
	if err := services.ReorderCustomerFields(rid, req.OrderedIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	auditLog(c, "reorder_customer_fields", "customer_fields", map[string]interface{}{"ordered_ids": req.OrderedIDs})
	c.JSON(http.StatusOK, gin.H{"reordered": true})
}
