package services

import (
	"testing"

	"orangecheesepizza/bot/models"
)

func TestPopulatePriceBySize(t *testing.T) {
	reg, med, lg := 205.0, 385.0, 615.0
	item := &models.MenuItem{PriceRegular: &reg, PriceMedium: &med, PriceLarge: &lg}
	item.BuildPriceBySize()
	if item.PriceBySize["regular"] != 205 || item.PriceBySize["medium"] != 385 || item.PriceBySize["large"] != 615 {
		t.Fatalf("unexpected price map: %+v", item.PriceBySize)
	}
}

func TestPopulatePriceBySizeSinglePrice(t *testing.T) {
	single := 110.0
	item := &models.MenuItem{Price: single, PriceRegular: &single}
	item.BuildPriceBySize()
	if item.PriceBySize["regular"] != 110 {
		t.Fatalf("expected regular=110, got %+v", item.PriceBySize)
	}
	if _, ok := item.PriceBySize["medium"]; ok {
		t.Fatalf("medium should be absent for single-price items: %+v", item.PriceBySize)
	}
}

func TestPopulatePriceBySizeEmpty(t *testing.T) {
	item := &models.MenuItem{}
	item.BuildPriceBySize()
	if item.PriceBySize != nil {
		t.Fatalf("expected nil map for no size prices, got %+v", item.PriceBySize)
	}
}

func TestIsNumericID(t *testing.T) {
	cases := map[string]bool{
		"123":   true,
		"":      false,
		"12a":   false,
		"veg-1": false,
	}
	for input, want := range cases {
		if got := isNumericID(input); got != want {
			t.Fatalf("isNumericID(%q) = %v, want %v", input, got, want)
		}
	}
}
