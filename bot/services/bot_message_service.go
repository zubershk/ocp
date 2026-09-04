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
// Existing rows are never touched (admin edits are sacred).
func (s *BotMessageService) syncDefaults() {
	defs := defaultMessages()
	meta := defaultMessageMeta()
	synced := 0
	for key, text := range defs {
		m, _ := meta[key]
		if _, err := database.DB.Exec(`
			INSERT INTO bot_messages (message_key, category, description, message_text, variables)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (message_key) DO NOTHING
		`, key, m.Category, m.Description, text, m.Variables); err == nil {
			synced++
		} else {
			log.Printf("[BotMessages] sync failed for %q: %v", key, err)
		}
	}
	_ = synced
}

// loadAll loads all bot_messages from the database into memory.
func (s *BotMessageService) loadAll() {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := database.DB.Query(
		`SELECT id, message_key, category, COALESCE(description,''), message_text, COALESCE(variables,''), COALESCE(image_url,''), active
		 FROM bot_messages ORDER BY id`)
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

// GetMessage returns a BotMessage by key (for admin editing).
func (s *BotMessageService) GetMessage(key string) (*BotMessage, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.messages[key]
	if !ok {
		return &BotMessage{Key: key, MessageText: defaultMessage(key), Active: true}, false
	}
	return m, true
}

// GetAllMessages returns all messages grouped by category (for admin UI).
func (s *BotMessageService) GetAllMessages() []BotMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]BotMessage, 0, len(s.messages))
	for _, m := range s.messages {
		out = append(out, *m)
	}
	return out
}

// UpdateMessage updates a single message template in DB and cache.
// Image is preserved by ResetMessage and updated when provided (nil = keep).
func (s *BotMessageService) UpdateMessage(key, text string, imageURL *string) error {
	var res sql.Result
	var err error
	if imageURL != nil {
		res, err = database.DB.Exec(
			`UPDATE bot_messages SET message_text = $1, image_url = $2, updated_at = CURRENT_TIMESTAMP WHERE message_key = $3`,
			text, *imageURL, key)
	} else {
		res, err = database.DB.Exec(
			`UPDATE bot_messages SET message_text = $1, updated_at = CURRENT_TIMESTAMP WHERE message_key = $2`,
			text, key)
	}
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("message key %q not found", key)
	}
	s.mu.Lock()
	if m, ok := s.messages[key]; ok {
		m.MessageText = text
		if imageURL != nil {
			m.ImageURL = *imageURL
		}
	}
	s.mu.Unlock()
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
func (s *BotMessageService) ResetMessage(key string) error {
	def := defaultMessage(key)
	return s.UpdateMessage(key, def, nil)
}

// ResetAllMessages resets all messages to compiled-in defaults.
func (s *BotMessageService) ResetAllMessages() error {
	for key := range defaultMessages() {
		if err := s.ResetMessage(key); err != nil {
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
func (s *BotMessageService) GetMessageCategories() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	seen := map[string]bool{}
	var cats []string
	for _, m := range s.messages {
		if !seen[m.Category] {
			seen[m.Category] = true
			cats = append(cats, m.Category)
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
