package services

import (
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"

	"orangecheesepizza/bot/database"
)

type CouponType string

const (
	CouponTypePercentage CouponType = "percentage"
	CouponTypeFixed      CouponType = "fixed"
)

type Coupon struct {
	ID           int       `json:"id"`
	RestaurantID int       `json:"restaurant_id"`
	Code         string    `json:"code"`
	Type         string    `json:"type"`
	Value        float64   `json:"value"`
	MinSubtotal  float64   `json:"min_subtotal"`
	MaxDiscount  *float64  `json:"max_discount,omitempty"`
	UsageLimit   *int      `json:"usage_limit,omitempty"`
	UsedCount    int       `json:"used_count"`
	StartsAt     time.Time `json:"starts_at"`
	ExpiresAt    *time.Time `json:"expires_at,omitempty"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CouponConfig struct {
	RestaurantID int       `json:"restaurant_id"`
	Code         string    `json:"code"`
	Type         string    `json:"type"`
	Value        float64   `json:"value"`
	MinSubtotal  float64   `json:"min_subtotal"`
	MaxDiscount  *float64  `json:"max_discount,omitempty"`
	UsageLimit   *int      `json:"usage_limit,omitempty"`
	StartsAt     *time.Time `json:"starts_at,omitempty"`
	ExpiresAt    *time.Time `json:"expires_at,omitempty"`
	IsActive     bool      `json:"is_active"`
}

type CouponApplyResult struct {
	Code          string    `json:"code"`
	Type          string    `json:"type"`
	Value         float64   `json:"value"`
	Discount      float64   `json:"discount"`
	OriginalTotal float64   `json:"original_total"`
	NewTotal      float64   `json:"new_total"`
}

type CouponValidationError struct {
	Code    string
	Message string
}

func (e *CouponValidationError) Error() string {
	return fmt.Sprintf("coupon %s: %s", e.Code, e.Message)
}

type CouponService struct{}

func NewCouponService() *CouponService {
	return &CouponService{}
}

func (s *CouponService) Create(cfg *CouponConfig) (*Coupon, error) {
	cfg.Code = strings.ToUpper(strings.TrimSpace(cfg.Code))
	if cfg.Code == "" {
		return nil, &CouponValidationError{Code: "", Message: "coupon code is required"}
	}
	if cfg.Type != string(CouponTypePercentage) && cfg.Type != string(CouponTypeFixed) {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "type must be 'percentage' or 'fixed'"}
	}
	if cfg.Value <= 0 {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "value must be greater than 0"}
	}
	if cfg.Type == string(CouponTypePercentage) && cfg.Value > 100 {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "percentage value must be between 0 and 100"}
	}
	if cfg.MinSubtotal < 0 {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "minimum subtotal must be >= 0"}
	}
	if cfg.MaxDiscount != nil && *cfg.MaxDiscount < 0 {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "max discount must be >= 0"}
	}

	rid := ResolveRestaurant(cfg.RestaurantID)
	var existing string
	err := database.DB.QueryRow(`SELECT code FROM coupons WHERE code = $1 AND restaurant_id = $2`, cfg.Code, rid).Scan(&existing)
	if err == nil {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "coupon code already exists"}
	}

	now := time.Now()
	startsAt := now
	if cfg.StartsAt != nil {
		startsAt = *cfg.StartsAt
	}

	_, err = database.DB.Exec(`
		INSERT INTO coupons (restaurant_id, code, type, value, min_subtotal, max_discount, usage_limit, used_count, starts_at, expires_at, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $11)
	`,
		rid, cfg.Code, cfg.Type, cfg.Value, cfg.MinSubtotal, cfg.MaxDiscount, cfg.UsageLimit, startsAt, cfg.ExpiresAt, cfg.IsActive, now,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create coupon: %w", err)
	}
	return s.GetByCode(cfg.Code, rid)
}

func (s *CouponService) GetByCode(code string, restaurantID int) (*Coupon, error) {
	rid := ResolveRestaurant(restaurantID)
	var c Coupon
	var expiresAt *time.Time
	err := database.DB.QueryRow(`
		SELECT id, restaurant_id, code, type, value, min_subtotal, max_discount, usage_limit, used_count, starts_at, expires_at, is_active, created_at, updated_at
		FROM coupons
		WHERE code = $1 AND restaurant_id = $2
	`, strings.ToUpper(code), rid).Scan(
		&c.ID, &c.RestaurantID, &c.Code, &c.Type, &c.Value, &c.MinSubtotal, &c.MaxDiscount,
		&c.UsageLimit, &c.UsedCount, &c.StartsAt, &expiresAt, &c.IsActive, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, &CouponValidationError{Code: code, Message: "coupon code not found"}
		}
		return nil, fmt.Errorf("failed to fetch coupon: %w", err)
	}
	c.ExpiresAt = expiresAt
	return &c, nil
}

func (s *CouponService) GetByID(id, restaurantID int) (*Coupon, error) {
	rid := ResolveRestaurant(restaurantID)
	var c Coupon
	var expiresAt *time.Time
	err := database.DB.QueryRow(`
		SELECT id, restaurant_id, code, type, value, min_subtotal, max_discount, usage_limit, used_count, starts_at, expires_at, is_active, created_at, updated_at
		FROM coupons
		WHERE id = $1 AND restaurant_id = $2
	`, id, rid).Scan(
		&c.ID, &c.RestaurantID, &c.Code, &c.Type, &c.Value, &c.MinSubtotal, &c.MaxDiscount,
		&c.UsageLimit, &c.UsedCount, &c.StartsAt, &expiresAt, &c.IsActive, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, &CouponValidationError{Code: "", Message: "coupon not found"}
		}
		return nil, fmt.Errorf("failed to fetch coupon: %w", err)
	}
	c.ExpiresAt = expiresAt
	return &c, nil
}

func (s *CouponService) List(restaurantID int) ([]*Coupon, error) {
	rid := ResolveRestaurant(restaurantID)
	rows, err := database.DB.Query(`
		SELECT id, restaurant_id, code, type, value, min_subtotal, max_discount, usage_limit, used_count, starts_at, expires_at, is_active, created_at, updated_at
		FROM coupons
		WHERE restaurant_id = $1
		ORDER BY created_at DESC
	`, rid)
	if err != nil {
		return nil, fmt.Errorf("failed to list coupons: %w", err)
	}
	defer rows.Close()

	var coupons []*Coupon
	for rows.Next() {
		var c Coupon
		var expiresAt *time.Time
		err := rows.Scan(
			&c.ID, &c.RestaurantID, &c.Code, &c.Type, &c.Value, &c.MinSubtotal, &c.MaxDiscount,
			&c.UsageLimit, &c.UsedCount, &c.StartsAt, &expiresAt, &c.IsActive, &c.CreatedAt, &c.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan coupon: %w", err)
		}
		c.ExpiresAt = expiresAt
		coupons = append(coupons, &c)
	}
	return coupons, nil
}

// ListActive returns only the coupons a customer can currently redeem:
// active, within their date window, and not exhausted. Used by the
// public offers page so codes shown are always redeemable.
func (s *CouponService) ListActive(restaurantID int) ([]*Coupon, error) {
	all, err := s.List(restaurantID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]*Coupon, 0, len(all))
	for _, c := range all {
		if !c.IsActive {
			continue
		}
		if now.Before(c.StartsAt) {
			continue
		}
		if c.ExpiresAt != nil && now.After(*c.ExpiresAt) {
			continue
		}
		if c.UsageLimit != nil && c.UsedCount >= *c.UsageLimit {
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *CouponService) Update(id, restaurantID int, cfg *CouponConfig) (*Coupon, error) {
	rid := ResolveRestaurant(restaurantID)
	existing, err := s.GetByID(id, rid)
	if err != nil {
		return nil, err
	}

	if cfg.Code != "" && strings.ToUpper(cfg.Code) != strings.ToUpper(existing.Code) {
		var existingCode string
		err := database.DB.QueryRow(`SELECT code FROM coupons WHERE code = $1 AND restaurant_id = $2 AND id != $3`,
			strings.ToUpper(cfg.Code), rid, id).Scan(&existingCode)
		if err == nil {
			return nil, &CouponValidationError{Code: cfg.Code, Message: "coupon code already exists"}
		}
	}

	setParts := []string{}
	args := []interface{}{}
	argIdx := 1

	if cfg.Code != "" {
		setParts = append(setParts, fmt.Sprintf("code = $%d", argIdx))
		args = append(args, strings.ToUpper(cfg.Code))
		argIdx++
	}
	if cfg.Type != "" {
		if cfg.Type != string(CouponTypePercentage) && cfg.Type != string(CouponTypeFixed) {
			return nil, &CouponValidationError{Code: cfg.Code, Message: "type must be 'percentage' or 'fixed'"}
		}
		setParts = append(setParts, fmt.Sprintf("type = $%d", argIdx))
		args = append(args, cfg.Type)
		argIdx++
	}
	if cfg.Value > 0 {
		if cfg.Type == string(CouponTypePercentage) && cfg.Value > 100 {
			return nil, &CouponValidationError{Code: cfg.Code, Message: "percentage value must be between 0 and 100"}
		}
		setParts = append(setParts, fmt.Sprintf("value = $%d", argIdx))
		args = append(args, cfg.Value)
		argIdx++
	}
	if cfg.MinSubtotal >= 0 {
		setParts = append(setParts, fmt.Sprintf("min_subtotal = $%d", argIdx))
		args = append(args, cfg.MinSubtotal)
		argIdx++
	}
	if cfg.MaxDiscount != nil {
		setParts = append(setParts, fmt.Sprintf("max_discount = $%d", argIdx))
		args = append(args, *cfg.MaxDiscount)
		argIdx++
	}
	if cfg.UsageLimit != nil {
		setParts = append(setParts, fmt.Sprintf("usage_limit = $%d", argIdx))
		args = append(args, *cfg.UsageLimit)
		argIdx++
	}
	if cfg.StartsAt != nil {
		setParts = append(setParts, fmt.Sprintf("starts_at = $%d", argIdx))
		args = append(args, *cfg.StartsAt)
		argIdx++
	}
	if cfg.ExpiresAt != nil {
		setParts = append(setParts, fmt.Sprintf("expires_at = $%d", argIdx))
		args = append(args, *cfg.ExpiresAt)
		argIdx++
	}
	if cfg.IsActive {
		setParts = append(setParts, fmt.Sprintf("is_active = $%d", argIdx))
		args = append(args, cfg.IsActive)
		argIdx++
	}

	if len(setParts) == 0 {
		return s.GetByID(id, rid)
	}

	setParts = append(setParts, fmt.Sprintf("updated_at = $%d", argIdx))
	args = append(args, time.Now())
	args = append(args, id, rid)

	query := fmt.Sprintf(`UPDATE coupons SET %s WHERE id = $%d AND restaurant_id = $%d`,
		strings.Join(setParts, ", "), argIdx+1, argIdx+2)

	_, err = database.DB.Exec(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to update coupon: %w", err)
	}
	return s.GetByID(id, rid)
}

func (s *CouponService) Delete(id, restaurantID int) error {
	rid := ResolveRestaurant(restaurantID)
	_, err := database.DB.Exec(`DELETE FROM coupons WHERE id = $1 AND restaurant_id = $2`, id, rid)
	if err != nil {
		return fmt.Errorf("failed to delete coupon: %w", err)
	}
	return nil
}

func (s *CouponService) Validate(code string, restaurantID int, subtotal float64) (*CouponApplyResult, error) {
	cfg, err := s.GetByCode(code, restaurantID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	if !cfg.IsActive {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "coupon is not active"}
	}
	if now.Before(cfg.StartsAt) {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "coupon is not yet active"}
	}
	if cfg.ExpiresAt != nil && now.After(*cfg.ExpiresAt) {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "coupon has expired"}
	}
	if cfg.UsageLimit != nil && cfg.UsedCount >= *cfg.UsageLimit {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "coupon usage limit has been reached"}
	}
	if subtotal < 0 {
		return nil, &CouponValidationError{Code: cfg.Code, Message: "subtotal must be >= 0"}
	}
	if subtotal < cfg.MinSubtotal {
		return nil, &CouponValidationError{Code: cfg.Code, Message: fmt.Sprintf("minimum subtotal of %s required", formatCurrency(cfg.MinSubtotal))}
	}

	var discount float64
	if cfg.Type == string(CouponTypePercentage) {
		discount = subtotal * (cfg.Value / 100.0)
		if cfg.MaxDiscount != nil && discount > *cfg.MaxDiscount {
			discount = *cfg.MaxDiscount
		}
	} else {
		discount = cfg.Value
		if discount > subtotal {
			discount = subtotal
		}
	}

	discount = math.Round(discount*100) / 100

	return &CouponApplyResult{
		Code:          cfg.Code,
		Type:          cfg.Type,
		Value:         cfg.Value,
		Discount:      discount,
		OriginalTotal: subtotal,
		NewTotal:      subtotal - discount,
	}, nil
}

func (s *CouponService) Apply(code string, restaurantID int, subtotal float64) (*CouponApplyResult, error) {
	return s.Validate(code, restaurantID, subtotal)
}

func (s *CouponService) IncrementUse(code string, restaurantID int) error {
	rid := ResolveRestaurant(restaurantID)
	_, err := database.DB.Exec(`UPDATE coupons SET used_count = used_count + 1 WHERE code = $1 AND restaurant_id = $2`,
		strings.ToUpper(code), rid)
	if err != nil {
		return fmt.Errorf("failed to increment coupon usage: %w", err)
	}
	return nil
}

func formatCurrency(v float64) string {
	return fmt.Sprintf("%.2f", v)
}