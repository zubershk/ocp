package services

import (
	"strconv"
	"strings"

	"orangecheesepizza/bot/database"
)

// UpdateCustomerProfileByID updates a customer's profile fields by primary key.
// Used by email/password accounts where whatsapp_number may be NULL.
func UpdateCustomerProfileByID(customerID, restaurantID int, fields map[string]string) error {
	if database.DB == nil {
		return nil
	}
	if restaurantID == 0 && !IsSingleTenantMode() {
		return ErrTenantRequired
	}
	setClauses := []string{"updated_at = CURRENT_TIMESTAMP"}
	args := []interface{}{}
	n := 1
	for column, value := range fields {
		if strings.TrimSpace(value) == "" {
			continue
		}
		switch column {
		case "name", "email", "default_address", "landmark", "whatsapp_number":
			setClauses = append(setClauses, column+" = $"+strconv.Itoa(n))
			args = append(args, strings.TrimSpace(value))
			n++
		}
	}
	if len(args) == 0 {
		return nil
	}
	rid := ResolveRestaurant(restaurantID)
	if rid != 0 {
		args = append(args, customerID, rid)
		_, err := database.DB.Exec(
			`UPDATE customers SET `+strings.Join(setClauses, ", ")+` WHERE id = $`+strconv.Itoa(n)+` AND restaurant_id = $`+strconv.Itoa(n+1),
			args...,
		)
		return err
	}
	args = append(args, customerID)
	_, err := database.DB.Exec(
		`UPDATE customers SET `+strings.Join(setClauses, ", ")+` WHERE id = $`+strconv.Itoa(n),
		args...,
	)
	return err
}