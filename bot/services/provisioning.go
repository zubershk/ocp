package services

import (
	"database/sql"
	"encoding/json"
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

var ErrSlugTaken = fmt.Errorf("slug already taken")

// ProvisionRestaurant creates org->restaurant->outlet->owner+domains atomically.
// Strict: slug/user/domain conflicts return 409 without mutating existing tenant.
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
	// advisory lock keyed to slug to serialize concurrent same-slug signups
	_, _ = tx.Exec(`SELECT pg_advisory_xact_lock(hashtext($1))`, slug)
	// org — fail closed on slug taken, never update existing
	err = tx.QueryRow(`INSERT INTO organizations (name, slug) VALUES ($1,$2) ON CONFLICT (slug) DO NOTHING RETURNING id`, orgName, slug).Scan(&orgID)
	if err == sql.ErrNoRows {
		return 0, 0, 0, 0, ErrSlugTaken
	}
	if err != nil {
		return 0, 0, 0, 0, fmt.Errorf("org: %w", err)
	}
	// restaurant
	err = tx.QueryRow(`INSERT INTO restaurants (organization_id, name, slug, currency, timezone)
	 VALUES ($1,$2,$3,'INR','Asia/Kolkata') ON CONFLICT (organization_id, slug) DO NOTHING RETURNING id`, orgID, restName, slug).Scan(&restID)
	if err == sql.ErrNoRows {
		return 0, 0, 0, 0, ErrSlugTaken
	}
	if err != nil {
		return 0, 0, 0, 0, fmt.Errorf("restaurant: %w", err)
	}
	// outlet
	err = tx.QueryRow(`INSERT INTO outlets (restaurant_id, name, slug, active, sort_order)
	 VALUES ($1,'Main Outlet','main',true,0) ON CONFLICT (restaurant_id, slug) DO NOTHING RETURNING id`, restID).Scan(&outletID)
	if err == sql.ErrNoRows {
		// outlet already exists for this restaurant — fetch it (idempotent retry)
		_ = tx.QueryRow(`SELECT id FROM outlets WHERE restaurant_id=$1 AND slug='main'`, restID).Scan(&outletID)
		if outletID == 0 {
			return 0, 0, 0, 0, fmt.Errorf("outlet: %w", err)
		}
	} else if err != nil {
		return 0, 0, 0, 0, fmt.Errorf("outlet: %w", err)
	}
	// ensure roles for org
	_, _ = tx.Exec(`INSERT INTO roles (organization_id, name, is_system, description) VALUES
	 ($1,'owner',true,'Full access'),($1,'manager',true,''),($1,'cashier',true,''),($1,'kitchen',true,''),($1,'viewer',true,'')
	 ON CONFLICT (organization_id, name) DO NOTHING`, orgID)
	// owner user if provided — never reassign existing key to another org
	if ownerKeyHash != "" {
		err = tx.QueryRow(`INSERT INTO users (organization_id, name, key_hash, role, active) VALUES ($1,$2,$3,'owner',true)
		 ON CONFLICT (key_hash) DO NOTHING RETURNING id`, orgID, ownerName, ownerKeyHash).Scan(&userID)
		if err == sql.ErrNoRows {
			var existingOrg int
			_ = tx.QueryRow(`SELECT organization_id FROM users WHERE key_hash=$1`, ownerKeyHash).Scan(&existingOrg)
			if existingOrg != 0 && existingOrg != orgID {
				return 0, 0, 0, 0, fmt.Errorf("owner identity conflict: %w", ErrSlugTaken)
			}
			_ = tx.QueryRow(`SELECT id FROM users WHERE key_hash=$1`, ownerKeyHash).Scan(&userID)
		} else if err != nil {
			return 0, 0, 0, 0, fmt.Errorf("user: %w", err)
		}
		if userID != 0 {
			_, _ = tx.Exec(`INSERT INTO user_outlets (user_id, outlet_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, userID, outletID)
		}
	}
	// domain — fail closed if taken by other restaurant
	var domainID int
	err = tx.QueryRow(`INSERT INTO domains (restaurant_id, domain, is_primary, verified_at) VALUES ($1,$2,true,NOW()) ON CONFLICT (domain) DO NOTHING RETURNING id`, restID, slug+".ocp.app").Scan(&domainID)
	if err == sql.ErrNoRows {
		var existingRest int
		_ = tx.QueryRow(`SELECT restaurant_id FROM domains WHERE domain=$1`, slug+".ocp.app").Scan(&existingRest)
		if existingRest != 0 && existingRest != restID {
			return 0, 0, 0, 0, ErrSlugTaken
		}
	} else if err != nil {
		return 0, 0, 0, 0, fmt.Errorf("domain: %w", err)
	}
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
		_, _ = tx.Exec(`INSERT INTO site_settings (key, value, restaurant_id) VALUES ('bot_config', '{}'::jsonb, $1) ON CONFLICT (key, restaurant_id) DO NOTHING`, restID)
	}
	// pos_config seed per-restaurant
	_, _ = tx.Exec(`INSERT INTO site_settings (key, value, restaurant_id)
	 SELECT 'pos_config', value, $2 FROM site_settings WHERE key='pos_config' AND restaurant_id=$1
	 ON CONFLICT (key, restaurant_id) DO NOTHING`, bootRest, restID)
	// Fallback default if boot has no pos_config (fresh DB or old)
	_, _ = tx.Exec(`INSERT INTO site_settings (key, value, restaurant_id) VALUES ('pos_config', '{
    "order_types": [
      {"key":"dine_in","label":"Dine In","short":"Dine In","icon":"utensils","active":true,"requires_table":true},
      {"key":"delivery","label":"Delivery","short":"Delivery","icon":"bike","active":true,"requires_address":true},
      {"key":"takeaway","label":"Take Away","short":"Take Away","icon":"bag","active":true}
    ],
    "size_meta": {"regular":{"label":"Regular","inches":"7 Inches"},"medium":{"label":"Medium","inches":"10 Inches"},"large":{"label":"Large","inches":"13 Inches"}},
    "bill_rows": [{"key":"subtotal","label":"Sub Total","visible":true},{"key":"discount","label":"Discount","visible":true},{"key":"container","label":"Container Charge","visible":true,"editable":true},{"key":"tax","label":"Tax","visible":true},{"key":"round_off","label":"Round Off","visible":true},{"key":"customer_paid","label":"Customer Paid","visible":true},{"key":"return_to_customer","label":"Return to Customer","visible":true},{"key":"tip","label":"Tip","visible":true,"editable":true}],
    "charges": {"container_default":0,"tip_enabled":true,"round_mode":"nearest","tax_source":"restaurant.tax_percent"},
    "customer_fields": {"phone":{"visible":true,"required":true,"for":["delivery","takeaway"]},"name":{"visible":true,"required":false,"for":["dine_in","delivery","takeaway"]},"address":{"visible":true,"required":false,"for":["delivery"]},"locality":{"visible":true,"required":false,"for":["delivery"]}},
    "features": {"bogo":false,"split_bill":false,"complimentary":true,"advance_order":true,"kot":true,"hold":true},
    "ui": {"header_title":"OCP POS","currency_symbol":"₹","pos_accent":"#b91c1c"},
    "version": 1
  }'::jsonb, $1) ON CONFLICT (key, restaurant_id) DO NOTHING`, restID)
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
	// preserve completed_steps if provided
	completedSteps := []string{}
	if v, ok := payload["completed_steps"].([]string); ok {
		completedSteps = v
	} else if v, ok := payload["completed_steps"].([]interface{}); ok {
		for _, s := range v {
			if str, ok := s.(string); ok {
				completedSteps = append(completedSteps, str)
			}
		}
	}
	dataRaw, _ := json.Marshal(payload["data"])
	if len(dataRaw) == 0 || string(dataRaw) == "null" {
		// fallback to whole payload
		dataRaw, _ = json.Marshal(payload)
		if len(dataRaw) == 0 {
			dataRaw = []byte("{}")
		}
	}
	_, err := database.DB.Exec(`INSERT INTO onboarding_progress (restaurant_id, current_step, completed_steps, data, is_complete)
	 VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT (restaurant_id) DO UPDATE SET current_step=EXCLUDED.current_step, completed_steps=EXCLUDED.completed_steps, data=EXCLUDED.data, is_complete=EXCLUDED.is_complete, updated_at=NOW()`,
		restaurantID, step, completedSteps, string(dataRaw), complete)
	if err != nil {
		return err
	}
	if complete {
		_, _ = database.DB.Exec(`UPDATE restaurants SET onboarding_complete=true WHERE id=$1`, restaurantID)
	}
	return nil
}
