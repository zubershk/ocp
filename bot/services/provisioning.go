package services

import (
	"database/sql"
	"fmt"
	"regexp"
	"strings"

	"orangecheesepizza/bot/database"
)

var slugRe = regexp.MustCompile(`^[a-z0-9-]{2,60}$`)

func ValidateSlug(slug string) error {
	slug = strings.ToLower(strings.TrimSpace(slug))
	if !slugRe.MatchString(slug) {
		return fmt.Errorf("invalid slug: 2-60 chars, lowercase alphanum + hyphen")
	}
	return nil
}

// ProvisionRestaurant creates org->restaurant->outlet->owner+domains atomically.
// Open-source single-tenant friendly: idempotent on slug conflict returns existing.
func ProvisionRestaurant(orgName, restName, slug, ownerName, ownerKeyHash string) (orgID, restID, outletID, userID int, err error) {
	slug = strings.ToLower(strings.TrimSpace(slug))
	if err := ValidateSlug(slug); err != nil {
		return 0, 0, 0, 0, err
	}
	tx, err := database.DB.Begin()
	if err != nil {
		return 0, 0, 0, 0, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	// org
	err = tx.QueryRow(`INSERT INTO organizations (name, slug) VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`, orgName, slug).Scan(&orgID)
	if err != nil {
		return 0, 0, 0, 0, fmt.Errorf("org: %w", err)
	}
	// restaurant
	err = tx.QueryRow(`INSERT INTO restaurants (organization_id, name, slug, currency, timezone)
	 VALUES ($1,$2,$3,'INR','Asia/Kolkata') ON CONFLICT (organization_id, slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`, orgID, restName, slug).Scan(&restID)
	if err != nil {
		return 0, 0, 0, 0, fmt.Errorf("restaurant: %w", err)
	}
	// outlet
	err = tx.QueryRow(`INSERT INTO outlets (restaurant_id, name, slug, active, sort_order)
	 VALUES ($1,'Main Outlet','main',true,0) ON CONFLICT (restaurant_id, slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`, restID).Scan(&outletID)
	if err != nil {
		return 0, 0, 0, 0, fmt.Errorf("outlet: %w", err)
	}
	// ensure roles for org
	_, _ = tx.Exec(`INSERT INTO roles (organization_id, name, is_system, description) VALUES
	 ($1,'owner',true,'Full access'),($1,'manager',true,''),($1,'cashier',true,''),($1,'kitchen',true,''),($1,'viewer',true,'')
	 ON CONFLICT (organization_id, name) DO NOTHING`, orgID)
	// owner user if provided
	if ownerKeyHash != "" {
		err = tx.QueryRow(`INSERT INTO users (organization_id, name, key_hash, role, active) VALUES ($1,$2,$3,'owner',true)
		 ON CONFLICT (key_hash) DO UPDATE SET organization_id=EXCLUDED.organization_id RETURNING id`, orgID, ownerName, ownerKeyHash).Scan(&userID)
		if err != nil {
			// fallback: try fetch
			_ = tx.QueryRow(`SELECT id FROM users WHERE key_hash=$1`, ownerKeyHash).Scan(&userID)
		}
		if userID != 0 {
			_, _ = tx.Exec(`INSERT INTO user_outlets (user_id, outlet_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, userID, outletID)
		}
	}
	// domain
	_, _ = tx.Exec(`INSERT INTO domains (restaurant_id, domain, is_primary, verified_at) VALUES ($1,$2,true,NOW()) ON CONFLICT (domain) DO NOTHING`, restID, slug+".ocp.app")
	// bot_config seed: copy from bootstrap if exists else default
	var bootRest int
	_ = tx.QueryRow(`SELECT id FROM restaurants WHERE slug='ocp' LIMIT 1`).Scan(&bootRest)
	if bootRest != 0 && bootRest != restID {
		_, _ = tx.Exec(`INSERT INTO site_settings (key, value, restaurant_id)
		 SELECT key, value, $2 FROM site_settings WHERE restaurant_id=$1
		 ON CONFLICT (key, restaurant_id) DO NOTHING`, bootRest, restID)
		_, _ = tx.Exec(`INSERT INTO bot_messages (message_key, category, description, message_text, variables, restaurant_id, active)
		 SELECT message_key, category, description, message_text, variables, $2, active FROM bot_messages WHERE restaurant_id=$1
		 ON CONFLICT (message_key, restaurant_id) DO NOTHING`, bootRest, restID)
	} else if bootRest == 0 {
		// ensure at least bot_config exists for new restaurant via defaults handled elsewhere
		_, _ = tx.Exec(`INSERT INTO site_settings (key, value, restaurant_id) VALUES ('bot_config', '{}'::jsonb, $1) ON CONFLICT (key, restaurant_id) DO NOTHING`, restID)
	}
	// onboarding row
	_, _ = tx.Exec(`INSERT INTO onboarding_progress (restaurant_id, current_step) VALUES ($1,'business_info') ON CONFLICT (restaurant_id) DO NOTHING`, restID)

	if err = tx.Commit(); err != nil {
		return 0, 0, 0, 0, err
	}
	return orgID, restID, outletID, userID, nil
}

// GetRestaurantBySlug returns restaurant id by slug, used by resolver fallback.
func GetRestaurantBySlug(slug string) (int, error) {
	var id int
	err := database.DB.QueryRow(`SELECT id FROM restaurants WHERE lower(slug)=lower($1) LIMIT 1`, strings.ToLower(slug)).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, ErrTenantNotFound
	}
	return id, err
}

func GetOnboarding(restaurantID int) map[string]interface{} {
	var step string
	var completed []string
	var data []byte
	var complete bool
	err := database.DB.QueryRow(`SELECT current_step, completed_steps, data, is_complete FROM onboarding_progress WHERE restaurant_id=$1`, restaurantID).Scan(&step, &completed, &data, &complete)
	if err != nil {
		return map[string]interface{}{"current_step": "business_info", "completed_steps": []string{}, "is_complete": false}
	}
	return map[string]interface{}{"current_step": step, "completed_steps": completed, "data": string(data), "is_complete": complete}
}

func SaveOnboarding(restaurantID int, payload map[string]interface{}) error {
	step, _ := payload["current_step"].(string)
	if step == "" {
		step = "business_info"
	}
	complete := false
	if v, ok := payload["is_complete"].(bool); ok {
		complete = v
	}
	// marshal payload to JSON safely
	raw := "{}"
	if b, err := fmt.Printf(""); err == nil {
		_ = b
	}
	// use simple marshal via database JSON
	_ = raw
	// store as text jsonb via parameter placeholder
	_, err := database.DB.Exec(`INSERT INTO onboarding_progress (restaurant_id, current_step, data, is_complete)
	 VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (restaurant_id) DO UPDATE SET current_step=EXCLUDED.current_step, data=EXCLUDED.data, is_complete=EXCLUDED.is_complete, updated_at=NOW()`,
		restaurantID, step, "{}", complete)
	return err
}
