package services

import (
	"bytes"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"sync"
	"text/template"

	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Bot Message Service
// Loads configurable message templates from bot_messages table.
// Templates use Go text/template syntax: {{.VariableName}}
// Falls back to compiled-in defaults if DB row is missing.
// ------------------------------------------------------------------

type BotMessage struct {
	ID          int    `json:"id"`
	Key         string `json:"message_key"`
	Category    string `json:"category"`
	Description string `json:"description"`
	MessageText string `json:"message_text"`
	Variables   string `json:"variables"`
	ImageURL    string `json:"image_url"`
	Active      bool   `json:"active"`
}

type BotMessageService struct {
	mu       sync.RWMutex
	messages map[string]*BotMessage
	// brandName is loaded from restaurant_config at startup
	brandName string
}

var globalMsgSvc *BotMessageService

func NewBotMessageService() *BotMessageService {
	svc := &BotMessageService{
		messages: make(map[string]*BotMessage),
	}
	globalMsgSvc = svc
	svc.syncDefaults()
	svc.loadAll()
	return svc
}

// syncDefaults inserts any compiled-in keys missing from the DB so new
// messages appear in the admin dashboard with zero migrations.
// Existing rows are never touched (admin edits are sacred). Coverage is
// ensured for every restaurant, not just the default.
func syncDefaultsFor(restaurantID int) {
	defs := defaultMessages()
	meta := defaultMessageMeta()
	for key, text := range defs {
		m, _ := meta[key]
		if _, err := database.DB.Exec(`
			INSERT INTO bot_messages (message_key, category, description, message_text, variables, restaurant_id)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (message_key, restaurant_id) DO NOTHING
		`, key, m.Category, m.Description, text, m.Variables, restaurantID); err != nil {
			log.Printf("[BotMessages] sync failed for %q: %v", key, err)
		}
	}
}
func (s *BotMessageService) syncDefaults() {
	rows, err := database.DB.Query(`SELECT id FROM restaurants`)
	if err != nil {
		syncDefaultsFor(ResolveRestaurant(0))
	} else {
		defer rows.Close()
		for rows.Next() {
			var rid int
			if err := rows.Scan(&rid); err == nil {
				syncDefaultsFor(rid)
			}
		}
	}
	syncTemplateUpgrades()
}

// templateUpgrades rewrites rows that still carry a previous compiled-in
// default. Rows an admin customized (text differs) are never touched.
var templateUpgrades = [][3]string{
	// NOTE: the 015 seed lacked the E'' prefix on these two keys, so the
	// stored text contains literal backslash-n sequences — match those.
	{"cart_item_added",
		"{{.ItemName}}\\n{{.Size}}\\n{{.CrustName}}\\nQty: {{.Quantity}}\\nRs.{{.Total}}",
		"{{.ItemName}}{{if .Size}}\n{{.Size}}{{end}}{{if .CrustName}}\n{{.CrustName}}{{end}}\nQty: {{.Quantity}}\nRs.{{.Total}}"},
	{"selection_summary",
		"*Your selection:*\\n\\n\\U0001F355 {{.ItemName}}\\n{{.Size}}\\n{{.CrustName}}\\nRs.{{.Price}}",
		"*Your selection:*\n\n🍕 {{.ItemName}}{{if .Size}}\n{{.Size}}{{end}}{{if .CrustName}}\n{{.CrustName}}{{end}}\nRs.{{.Price}}"},
	{"order_summary_body",
		"🍕 ORDER SUMMARY\n\nCustomer: {{.Name}}\nOrder type: {{.DeliveryType}}\n\nItems:\n{{.Items}}\nSubtotal: Rs.{{.Subtotal}}\nDelivery: Rs.0\nTotal: Rs.{{.Total}}\n\nPayment: {{.Payment}}\n\n{{.AddressBlock}}",
		"🍕 ORDER SUMMARY\n\nCustomer: {{.Name}}\nOrder type: {{.DeliveryType}}\n\nItems:\n{{.Items}}\nSubtotal: Rs.{{.Subtotal}}\nDelivery: Rs.{{.Delivery}}\nTotal: Rs.{{.Total}}\n\nPayment: {{.Payment}}\n\n{{.AddressBlock}}"},
}

func syncTemplateUpgrades() {
	for _, u := range templateUpgrades {
		if _, err := database.DB.Exec(
			`UPDATE bot_messages SET message_text = $1, updated_at = CURRENT_TIMESTAMP
			 WHERE message_key = $2 AND message_text = $3`,
			u[2], u[0], u[1]); err != nil {
			log.Printf("[BotMessages] template upgrade failed for %q: %v", u[0], err)
		}
	}
	// newlineFixTemplates repairs seeds stored with literal backslash-n
	// (migration 015 lines missing the E'' prefix). Only exact matches are
	// rewritten — customized rows are never touched.
	for key, fixed := range newlineFixTemplates {
		broken := strings.ReplaceAll(fixed, "\n", "\\n")
		if _, err := database.DB.Exec(
			`UPDATE bot_messages SET message_text = $1, updated_at = CURRENT_TIMESTAMP
			 WHERE message_key = $2 AND message_text = $3`,
			fixed, key, broken); err != nil {
			log.Printf("[BotMessages] newline fix failed for %q: %v", key, err)
		}
	}
}

// newlineFixTemplates holds the correct (real-newline) text for every
// template seeded without the E'' prefix in migration 015.
var newlineFixTemplates = map[string]string{
	"name_greeting_delivery":      "Nice to meet you, {{.Name}}!\n\nWhat's your delivery address?",
	"address_saved_body":          "We have your saved address:\n\n{{.Address}}\n\nUse this address?",
	"order_failed":                "Couldn't place your order: {{.Error}}\n\nType 'cart' to review and retry.",
	"notification_support_request": "*CUSTOMER REQUESTED SUPPORT*\n\nWhatsApp: {{.Phone}}\nName: {{.Name}}\nCurrent order: {{.Order}}\nCart lines: {{.CartCount}}\n\nReply to them directly on WhatsApp.",
	"profile_body":                "WhatsApp: {{.Phone}}\nAddress: {{.Address}}\nLandmark: {{.Landmark}}\nOrders: {{.OrderCount}}\nSpent: Rs.{{.TotalSpent}}",
	"support_team_notified":       "The team will reach out here.\nType 'menu' whenever you're ready.",
	"location_body":               "{{.Address}}\n\nTel: {{.Phone}}\nKitchen: {{.KitchenHours}}\nDelivery: {{.DeliveryHours}}",
	"unknown_input":               "I didn't quite understand that.\n\n{{.Options}}",
	"status_view_body":            "Status: {{.Emoji}} {{.Status}}\n\n{{.Items}}\nTotal: Rs.{{.Total}}",
	"status_order_detail":         "Status: {{.Emoji}} {{.Status}}\nPlaced: {{.Date}}\n\n{{.Items}}Total: Rs.{{.Total}}",
}

// loadAll loads the default restaurant's bot_messages into memory.
// The runtime cache always tracks the default restaurant; per-tenant
// admin reads go straight to the DB (ListFor/GetFor).
func (s *BotMessageService) loadAll() {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := database.DB.Query(
		`SELECT id, message_key, category, COALESCE(description,''), message_text, COALESCE(variables,''), COALESCE(image_url,''), active
		 FROM bot_messages WHERE restaurant_id = $1 ORDER BY id`, ResolveRestaurant(0))
	if err != nil {
		log.Printf("[BotMessages] failed to load from DB: %v (using defaults)", err)
		return
	}
	defer rows.Close()

	s.messages = make(map[string]*BotMessage)
	count := 0
	for rows.Next() {
		var m BotMessage
		if err := rows.Scan(&m.ID, &m.Key, &m.Category, &m.Description, &m.MessageText, &m.Variables, &m.ImageURL, &m.Active); err != nil {
			log.Printf("[BotMessages] scan error: %v", err)
			continue
		}
		s.messages[m.Key] = &m
		count++
	}
	log.Printf("[BotMessages] loaded %d message templates from DB", count)
}

// Reload refreshes the in-memory cache from DB. Called after admin updates.
func (s *BotMessageService) Reload() {
	s.loadAll()
}

// SetBrandName sets the restaurant brand name (called after DB load).
func (s *BotMessageService) SetBrandName(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.brandName = name
}

// GetBrandName returns the current brand name.
func (s *BotMessageService) GetBrandName() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.brandName
}

// Render looks up a message by key and renders it with the given data map.
// Falls back to compiled-in default if key not found in DB.
func (s *BotMessageService) Render(key string, data map[string]interface{}) string {
	s.mu.RLock()
	m, ok := s.messages[key]
	s.mu.RUnlock()

	var text string
	if ok && m.Active {
		text = m.MessageText
	} else {
		text = defaultMessage(key)
	}

	if data == nil {
		data = map[string]interface{}{}
	}
	// Always inject brand name if not explicitly provided
	if _, has := data["RestaurantName"]; !has {
		data["RestaurantName"] = s.GetBrandName()
	}

	tmpl, err := template.New(key).Parse(text)
	if err != nil {
		log.Printf("[BotMessages] template parse error for %q: %v", key, err)
		return text
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		log.Printf("[BotMessages] template execute error for %q: %v", key, err)
		return text
	}
	return buf.String()
}

// scanBotMessage reads one bot_messages row into a BotMessage.
func scanBotMessage(scanner interface {
	Scan(dest ...interface{}) error
}) (BotMessage, error) {
	var m BotMessage
	err := scanner.Scan(&m.ID, &m.Key, &m.Category, &m.Description, &m.MessageText, &m.Variables, &m.ImageURL, &m.Active)
	return m, err
}

// GetMessage returns a BotMessage by key (for admin editing).
func (s *BotMessageService) GetMessage(key string, restaurantID int) (*BotMessage, bool) {
	var m BotMessage
	err := database.DB.QueryRow(
		`SELECT id, message_key, category, COALESCE(description,''), message_text, COALESCE(variables,''), COALESCE(image_url,''), active
		 FROM bot_messages WHERE message_key = $1 AND restaurant_id = $2`,
		key, ResolveRestaurant(restaurantID)).Scan(
		&m.ID, &m.Key, &m.Category, &m.Description, &m.MessageText, &m.Variables, &m.ImageURL, &m.Active)
	if err != nil {
		return &BotMessage{Key: key, MessageText: defaultMessage(key), Active: true}, false
	}
	return &m, true
}

// GetAllMessages returns all messages grouped by category (for admin UI).
func (s *BotMessageService) GetAllMessages(restaurantID int) []BotMessage {
	rows, err := database.DB.Query(
		`SELECT id, message_key, category, COALESCE(description,''), message_text, COALESCE(variables,''), COALESCE(image_url,''), active
		 FROM bot_messages WHERE restaurant_id = $1 ORDER BY id`,
		ResolveRestaurant(restaurantID))
	if err != nil {
		return []BotMessage{}
	}
	defer rows.Close()
	out := []BotMessage{}
	for rows.Next() {
		if m, err := scanBotMessage(rows); err == nil {
			out = append(out, m)
		}
	}
	return out
}

// UpdateMessage updates a single message template in DB and cache.
// Image is preserved by ResetMessage and updated when provided (nil = keep).
func (s *BotMessageService) UpdateMessage(key, text string, imageURL *string, restaurantID int) error {
	rid := ResolveRestaurant(restaurantID)
	var res sql.Result
	var err error
	if imageURL != nil {
		res, err = database.DB.Exec(
			`UPDATE bot_messages SET message_text = $1, image_url = $2, updated_at = CURRENT_TIMESTAMP WHERE message_key = $3 AND restaurant_id = $4`,
			text, *imageURL, key, rid)
	} else {
		res, err = database.DB.Exec(
			`UPDATE bot_messages SET message_text = $1, updated_at = CURRENT_TIMESTAMP WHERE message_key = $2 AND restaurant_id = $3`,
			text, key, rid)
	}
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("message key %q not found", key)
	}
	if rid == ResolveRestaurant(0) {
		s.mu.Lock()
		if m, ok := s.messages[key]; ok {
			m.MessageText = text
			if imageURL != nil {
				m.ImageURL = *imageURL
			}
		}
		s.mu.Unlock()
	}
	return nil
}

// MessageImage returns the configured image URL for a key, or "".
// Only active rows contribute images.
func (s *BotMessageService) MessageImage(key string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if m, ok := s.messages[key]; ok && m.Active {
		return strings.TrimSpace(m.ImageURL)
	}
	return ""
}

// ResetMessage resets a message to its compiled-in default (image kept).
func (s *BotMessageService) ResetMessage(key string, restaurantID int) error {
	def := defaultMessage(key)
	return s.UpdateMessage(key, def, nil, restaurantID)
}

// ResetAllMessages resets all messages to compiled-in defaults.
func (s *BotMessageService) ResetAllMessages(restaurantID int) error {
	for key := range defaultMessages() {
		if err := s.ResetMessage(key, restaurantID); err != nil {
			return err
		}
	}
	return nil
}

// GetMessageKeys returns all known message keys (for admin reference).
func (s *BotMessageService) GetMessageKeys() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	keys := make([]string, 0, len(s.messages))
	for k := range s.messages {
		keys = append(keys, k)
	}
	return keys
}

// GetMessageCategories returns distinct categories.
func (s *BotMessageService) GetMessageCategories(restaurantID int) []string {
	rows, err := database.DB.Query(
		`SELECT DISTINCT category FROM bot_messages WHERE restaurant_id = $1 ORDER BY category`,
		ResolveRestaurant(restaurantID))
	if err != nil {
		return nil
	}
	defer rows.Close()
	var cats []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err == nil {
			cats = append(cats, c)
		}
	}
	return cats
}

// Global convenience accessors

func Msg(key string, data map[string]interface{}) string {
	if globalMsgSvc != nil {
		return globalMsgSvc.Render(key, data)
	}
	return defaultMessage(key)
}

func MsgBrand(key string) string {
	return Msg(key, nil)
}

// MsgImage returns the configured image URL for a key, or "".
func MsgImage(key string) string {
	if globalMsgSvc != nil {
		return globalMsgSvc.MessageImage(key)
	}
	return ""
}

// FormatItems builds a line-item string from cart/order items for templates.
func FormatItems(qty int, name, size, crust string, price float64) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%d x %s", qty, name)
	if size != "" || crust != "" {
		b.WriteString("\n    ")
		if size != "" {
			b.WriteString(strings.Title(size))
		}
		if crust != "" {
			if size != "" {
				b.WriteString(" - ")
			}
			b.WriteString(crust)
		}
	}
	fmt.Fprintf(&b, "\n    Rs.%d", int(price))
	return b.String()
}
