package services

import (
	"orangecheesepizza/bot/database"
)

// SaveWhatsAppMessage persists a chat line for live board.
func SaveWhatsAppMessage(phone, direction, body, messageID string) error {
	if phone == "" || body == "" {
		return nil
	}
	if direction != "in" && direction != "out" {
		direction = "in"
	}
	_, err := database.DB.Exec(
		`INSERT INTO whatsapp_messages (customer_phone, direction, body, message_id) VALUES ($1,$2,$3,$4)`,
		phone, direction, body, messageID,
	)
	return err
}

type ConversationSummary struct {
	Phone        string `json:"phone"`
	Name         string `json:"name"`
	State        string `json:"state"`
	LastBody     string `json:"last_body"`
	LastAt       string `json:"last_at"`
	LastDirection string `json:"last_direction"`
	TotalMessages int    `json:"total_messages"`
}

// ListConversations returns recent chats ordered by last message,
// scoped to one restaurant. Message phones without a customer row
// attach to the default restaurant (single-tenant behavior preserved).
func ListConversations(limit, offset, restaurantID int) ([]ConversationSummary, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	rid := ResolveRestaurant(restaurantID)
	def := ResolveRestaurant(0)
	rows, err := database.DB.Query(`
		SELECT
			COALESCE(c.whatsapp_number, m.customer_phone) AS phone,
			COALESCE(c.name, '') AS name,
			COALESCE(wc.state, 'IDLE') AS state,
			COALESCE((SELECT body FROM whatsapp_messages m2 WHERE m2.customer_phone = COALESCE(c.whatsapp_number, m.customer_phone) ORDER BY m2.created_at DESC LIMIT 1), '') AS last_body,
			COALESCE((SELECT created_at::text FROM whatsapp_messages m2 WHERE m2.customer_phone = COALESCE(c.whatsapp_number, m.customer_phone) ORDER BY m2.created_at DESC LIMIT 1), '') AS last_at,
			COALESCE((SELECT direction FROM whatsapp_messages m2 WHERE m2.customer_phone = COALESCE(c.whatsapp_number, m.customer_phone) ORDER BY m2.created_at DESC LIMIT 1), '') AS last_dir,
			COALESCE((SELECT COUNT(*) FROM whatsapp_messages m2 WHERE m2.customer_phone = COALESCE(c.whatsapp_number, m.customer_phone)), 0) AS total
		FROM (
			SELECT DISTINCT customer_phone FROM whatsapp_messages
			UNION
			SELECT whatsapp_number FROM customers WHERE restaurant_id = $3
		) m
		LEFT JOIN customers c ON c.whatsapp_number = m.customer_phone
		LEFT JOIN whatsapp_conversations wc ON wc.customer_id = c.id
		WHERE COALESCE(c.restaurant_id, $4) = $3
		ORDER BY last_at DESC NULLS LAST, phone DESC
		LIMIT $1 OFFSET $2
	`, limit, offset, rid, def)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ConversationSummary
	for rows.Next() {
		var s ConversationSummary
		if err := rows.Scan(&s.Phone, &s.Name, &s.State, &s.LastBody, &s.LastAt, &s.LastDirection, &s.TotalMessages); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type ChatMessage struct {
	ID        int    `json:"id"`
	Phone     string `json:"phone"`
	Direction string `json:"direction"`
	Body      string `json:"body"`
	MessageID string `json:"message_id"`
	CreatedAt string `json:"created_at"`
}

func ListMessages(phone string, limit, restaurantID int) ([]ChatMessage, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rid := ResolveRestaurant(restaurantID)
	rows, err := database.DB.Query(`
		SELECT id, customer_phone, direction, body, COALESCE(message_id,''), created_at::text
		FROM whatsapp_messages WHERE customer_phone = $1
		  AND (EXISTS (SELECT 1 FROM customers c WHERE c.whatsapp_number = whatsapp_messages.customer_phone AND c.restaurant_id = $3)
		       OR $3 = $4)
		ORDER BY created_at ASC LIMIT $2
	`, phone, limit, rid, ResolveRestaurant(0))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChatMessage
	for rows.Next() {
		var m ChatMessage
		if err := rows.Scan(&m.ID, &m.Phone, &m.Direction, &m.Body, &m.MessageID, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// SetConversationState forces a conversation into a state (e.g. HUMAN_SUPPORT for live takeover).
func SetConversationState(phone, state string) error {
	cust, err := GetOrCreateCustomer(phone)
	if err != nil {
		return err
	}
	// preserve existing context
	var raw []byte
	_ = database.DB.QueryRow(`SELECT COALESCE(context,'{}') FROM whatsapp_conversations WHERE customer_id=$1`, cust.ID).Scan(&raw)
	if raw == nil {
		raw = []byte("{}")
	}
	_, err = database.DB.Exec(`
		INSERT INTO whatsapp_conversations (customer_id, state, context, last_message_at)
		VALUES ($1,$2,$3::jsonb,CURRENT_TIMESTAMP)
		ON CONFLICT (customer_id) DO UPDATE SET state=EXCLUDED.state, last_message_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
	`, cust.ID, state, string(raw))
	return err
}
