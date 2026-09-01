package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"orangecheesepizza/bot/models"
	"orangecheesepizza/bot/services"

	"github.com/gin-gonic/gin"
)

type stubMenuReader struct {
	categories []models.MenuCategory
	items      []models.MenuItem
	itemById   map[string]*models.MenuItem
	err        error
}

func (s *stubMenuReader) GetCategoriesWithSlug() ([]models.MenuCategory, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.categories, nil
}

func (s *stubMenuReader) GetAllActiveItems() ([]models.MenuItem, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.items, nil
}

func (s *stubMenuReader) GetItemByIdentifier(identifier string) (*models.MenuItem, error) {
	if s.err != nil {
		return nil, s.err
	}
	if item, ok := s.itemById[identifier]; ok {
		return item, nil
	}
	return nil, nil
}

func (s *stubMenuReader) GetActiveCrusts() ([]services.CrustInfo, error) {
	return nil, nil
}

func newTestRouter(reader MenuReader) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(CORSMiddleware("http://localhost:5173,http://127.0.0.1:5173"))
	api := router.Group("/api")
	{
		api.GET("/menu", NewApiHandler(reader, nil).GetMenu)
		api.GET("/menu/:id", NewApiHandler(reader, nil).GetItem)
	}
	return router
}

func sampleItem() *models.MenuItem {
	reg := 205.0
	med := 385.0
	lg := 615.0
	item := &models.MenuItem{
		ID: 101, CategoryID: 1, Name: "Cheese & Tomato", Slug: "cheese-tomato",
		Description: "A delectable combination of cheese and juicy tomato.",
		Price:       205, Available: true, Active: true,
		Dietary: "veg", PizzaSubcategory: "classic", PizzaType: "veg",
		PriceRegular: &reg, PriceMedium: &med, PriceLarge: &lg,
	}
	item.BuildPriceBySize()
	return item
}

func TestGetMenuReturnsCategoriesAndItems(t *testing.T) {
	reader := &stubMenuReader{
		categories: []models.MenuCategory{{ID: 1, Name: "Veg Pizzas", Slug: "veg-pizzas"}},
		items:      []models.MenuItem{*sampleItem()},
		itemById:   map[string]*models.MenuItem{},
	}
	router := newTestRouter(reader)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/menu", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body struct {
		Categories []models.MenuCategory `json:"categories"`
		Items      []models.MenuItem     `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(body.Categories) != 1 || body.Categories[0].Slug != "veg-pizzas" {
		t.Fatalf("unexpected categories: %+v", body.Categories)
	}
	if len(body.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(body.Items))
	}
	bySize := body.Items[0].PriceBySize
	if bySize == nil || bySize["regular"] != 205 || bySize["medium"] != 385 || bySize["large"] != 615 {
		t.Fatalf("unexpected price_by_size: %+v", bySize)
	}
}

func TestGetItemBySlugFound(t *testing.T) {
	reader := &stubMenuReader{
		itemById: map[string]*models.MenuItem{"cheese-tomato": sampleItem()},
	}
	router := newTestRouter(reader)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/menu/cheese-tomato", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body struct {
		Item *models.MenuItem `json:"item"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body.Item == nil || body.Item.Slug != "cheese-tomato" {
		t.Fatalf("unexpected item: %+v", body.Item)
	}
	if body.Item.PriceBySizeFor("medium") != 385 {
		t.Fatalf("expected medium price 385, got %v", body.Item.PriceBySizeFor("medium"))
	}
}

func TestGetItemNotFound(t *testing.T) {
	reader := &stubMenuReader{itemById: map[string]*models.MenuItem{}}
	router := newTestRouter(reader)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/menu/does-not-exist", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	var body map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body["error"] != "menu item not found" {
		t.Fatalf("unexpected error payload: %v", body)
	}
}

func TestGetMenuServiceError(t *testing.T) {
	reader := &stubMenuReader{err: errors.New("db down"), itemById: map[string]*models.MenuItem{}}
	router := newTestRouter(reader)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/menu", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestCORSAllowsDevOrigin(t *testing.T) {
	reader := &stubMenuReader{
		categories: []models.MenuCategory{},
		items:      []models.MenuItem{},
		itemById:   map[string]*models.MenuItem{},
	}
	router := newTestRouter(reader)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/api/menu", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "GET")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for preflight, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("missing CORS header, got %q", w.Header().Get("Access-Control-Allow-Origin"))
	}
}
