package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/services"
)

type WebhookHandler struct {
	botHandler *services.BotHandler
	engine     *services.ConversationEngine
	config     *config.Config
}

func NewWebhookHandler(botHandler *services.BotHandler, cfg *config.Config) *WebhookHandler {
	return &WebhookHandler{
		botHandler: botHandler,
		config:     cfg,
	}
}

// AttachEngine routes inbound customer messages to the Phase 3
// conversation engine instead of the legacy flow.
func (h *WebhookHandler) AttachEngine(engine *services.ConversationEngine) {
	h.engine = engine
}

type WebhookPayload struct {
	Event      string                 `json:"event"`
	Instance   string                 `json:"instance"`
	InstanceID string                 `json:"instanceId"`
	Data       map[string]interface{} `json:"data"`
}

func (h *WebhookHandler) HandleWebhook(c *gin.Context) {
	raw, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}
	var payload WebhookPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		log.Printf("[wa-debug] unparsable body (%d bytes)", len(raw))
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}
	log.Printf("[wa-debug] event=%q instance=%q bytes=%d", payload.Event, payload.Instance, len(raw))

	// Only process MESSAGE events (Evolution GO sends "Message", also accept "MESSAGE" and "messages.upsert")
	event := strings.ToLower(payload.Event)
	if event != "message" && event != "messages.upsert" {
		log.Printf("[wa-debug] ignored event type")
		c.JSON(http.StatusOK, gin.H{"status": "ignored"})
		return
	}

	// Extract message data
	data := payload.Data
	if data == nil {
		log.Printf("[wa-debug] bail: no data (bytes=%d)", len(raw))
		c.JSON(http.StatusOK, gin.H{"status": "no data"})
		return
	}

	// Get message info - Evolution GO stores message under "Message" (capital M)
	messageData, ok := data["Message"].(map[string]interface{})
	if !ok {
		// Fallback: check lowercase "message" or direct data fields
		if _, ok := data["message"].(map[string]interface{}); ok {
			messageData, _ = data["message"].(map[string]interface{})
		} else if _, hasConv := data["conversation"]; hasConv {
			messageData = data
		} else if _, hasExt := data["extendedTextMessage"]; hasExt {
			messageData = data
		} else {
			c.JSON(http.StatusOK, gin.H{"status": "no message data"})
			return
		}
	}

	// --- normalize identity fields across payload shapes ---
	// Evolution GO v0.7.2 nests them under data.Info{Sender,IsFromMe,ID};
	// older/Baileys shapes use data.key{...} or top-level fields.
	info, _ := data["Info"].(map[string]interface{})
	if info == nil {
		info, _ = data["info"].(map[string]interface{})
	}
	keyMap, _ := data["key"].(map[string]interface{})

	fromMe, _ := data["FromMe"].(bool)
	if !fromMe {
		fromMe, _ = data["fromMe"].(bool)
	}
	if !fromMe && info != nil {
		fromMe, _ = info["IsFromMe"].(bool)
	}
	if !fromMe && keyMap != nil {
		fromMe, _ = keyMap["fromMe"].(bool)
	}
	if fromMe {
		log.Printf("[wa-debug] bail: own message (FromMe)")
		c.JSON(http.StatusOK, gin.H{"status": "ignored own message"})
		return
	}

	sender := ""
	if s, ok := info["Sender"].(string); ok {
		sender = s
	} else if s, ok := info["Chat"].(string); ok {
		sender = s
	} else if s, ok := data["Sender"].(string); ok {
		sender = s
	} else if s, ok := data["Participant"].(string); ok {
		sender = s
	} else if s, ok := data["sender"].(string); ok {
		sender = s
	} else if s, ok := data["participant"].(string); ok {
		sender = s
	} else if keyMap != nil {
		if rj, ok := keyMap["remoteJid"].(string); ok {
			sender = rj
		} else if sObj, ok := keyMap["remoteJid"].(map[string]interface{}); ok {
			if u, ok := sObj["user"].(string); ok {
				sv, _ := sObj["server"].(string)
				sender = u + "@" + sv
			}
		}
	}

	// Clean phone number (remove @s.whatsapp.net)
	phone := cleanPhone(sender)
	if phone == "" {
		log.Printf("[wa-debug] bail: no phone. body=%.700s", string(raw))
		c.JSON(http.StatusOK, gin.H{"status": "no phone"})
		return
	}

	// Get message ID for idempotency
	messageID := ""
	if info != nil {
		if id, ok := info["ID"].(string); ok {
			messageID = id
		}
	}
	if messageID == "" && keyMap != nil {
		if id, ok := keyMap["id"].(string); ok {
			messageID = id
		}
	}
	if messageID == "" {
		if id, ok := data["id"].(string); ok {
			messageID = id
		}
	}

	// Extract message content -> normalized (Type, ActionID, Title)
	actionType, actionID, actionTitle := extractInbound(messageData)
	if actionID == "" && actionTitle != "" {
		actionID = actionTitle
	}
	if actionID == "" {
		log.Printf("[wa-debug] bail: no text. sender=%q msgData=%.700s", sender, mustJSON(messageData))
		c.JSON(http.StatusOK, gin.H{"status": "no text content"})
		return
	}

	log.Printf("[WA-IN] id=%s phone=***%s type=%s action=%q title=%q",
		shortID(messageID), shortPhone(phone), actionType, actionID, actionTitle)

	// Live chat history — save inbound for dashboard (best effort)
	body := actionID
	if body == "" {
		body = actionTitle
	}
	if body != "" {
		_ = services.SaveWhatsAppMessage(phone, "in", body, messageID)
	}

	// If human has taken over, don't let bot auto-reply — keep in HUMAN_SUPPORT for live board
	if h.engine != nil {
		// Peek state without lock (best effort) — if HUMAN_SUPPORT, just ack
		if cust, err := services.GetOrCreateCustomer(phone); err == nil {
			if st, _, err2 := services.LoadConversationForPhone(phone); err2 == nil && st == "HUMAN_SUPPORT" {
				// ensure customer exists so conversation is visible
				_ = cust
				c.JSON(http.StatusOK, gin.H{"status": "human_support — held for live chat"})
				return
			}
		}
	}

	// Process message (Phase 3 conversation engine; legacy fallback)
	if h.engine != nil {
		if err := h.engine.HandleInbound(phone, actionID, messageID); err != nil {
			log.Printf("[webhook] engine error: %v", err)
			c.JSON(http.StatusOK, gin.H{"status": "error"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "processed"})
		return
	}
	if err := h.botHandler.ProcessMessage(phone, actionID, messageID); err != nil {
		log.Printf("[webhook] bot error: %v", err)
		c.JSON(http.StatusOK, gin.H{"status": "error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "processed"})
}

func (h *WebhookHandler) HandleButtonClick(c *gin.Context) {
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	// Handle button click events
	data, ok := payload["data"].(map[string]interface{})
	if !ok {
		c.JSON(http.StatusOK, gin.H{"status": "no data"})
		return
	}

	phone := ""
	if p, ok := data["phone"].(string); ok {
		phone = cleanPhone(p)
	} else if p, ok := data["jid"].(string); ok {
		phone = cleanPhone(p)
	}

	buttonID := ""
	if b, ok := data["buttonId"].(string); ok {
		buttonID = b
	} else if b, ok := data["rowId"].(string); ok {
		buttonID = b
	}

	if phone == "" || buttonID == "" {
		c.JSON(http.StatusOK, gin.H{"status": "missing data"})
		return
	}

	messageID := ""
	if id, ok := data["messageId"].(string); ok {
		messageID = id
	}

	// Phase 3: route button/list responses through the engine too.
	if h.engine != nil {
		if err := h.engine.HandleInbound(phone, buttonID, messageID); err != nil {
			log.Printf("[webhook] engine button error: %v", err)
			c.JSON(http.StatusOK, gin.H{"status": "error"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "processed"})
		return
	}

	// Process button click as a message
	if err := h.botHandler.ProcessMessage(phone, buttonID, messageID+"_btn"); err != nil {
		log.Printf("[webhook] bot button error: %v", err)
		c.JSON(http.StatusOK, gin.H{"status": "error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "processed"})
}

func mustJSON(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "<marshal error>"
	}
	return string(b)
}

func cleanPhone(phone string) string {
	// Remove @s.whatsapp.net, @lid, @g.us suffixes and canonicalize to 10-digit
	for _, suffix := range []string{"@s.whatsapp.net", "@lid", "@g.us", "@broadcast", "@newsletter"} {
		phone = strings.ReplaceAll(phone, suffix, "")
	}
	// canonicalize to 10-digit for storage sync (strip 91 / 0)
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	if len(cleaned) == 12 && strings.HasPrefix(cleaned, "91") {
		return cleaned[2:]
	}
	if len(cleaned) == 11 && cleaned[0] == '0' {
		return cleaned[1:]
	}
	return cleaned
}

// extractInbound normalizes every known payload variant into
// (type, actionID, title). Shapes covered:
//
//	Evolution v0.7.2: buttonsResponseMessage.Response.SelectedButtonID
//	Baileys legacy:   buttonsResponseMessage.selectedButtonId
//	Lists (both):     listResponseMessage.Response.SelectedRowID /
//	                  singleSelectReply.selectedRowId
//	Plain text:       conversation / extendedTextMessage.text
func extractInbound(messageData map[string]interface{}) (string, string, string) {
	if conversation, ok := messageData["conversation"].(string); ok {
		return "text", conversation, ""
	}
	if extText, ok := messageData["extendedTextMessage"].(map[string]interface{}); ok {
		if text, ok := extText["text"].(string); ok {
			return "text", text, ""
		}
	}
	if btnResp, ok := messageData["buttonsResponseMessage"].(map[string]interface{}); ok {
		// REAL on-device shape (v0.7.2): selectedButtonID at TOP level,
		// exact casing "selectedButtonID" (lower d, capital ID).
		if id, ok := btnResp["selectedButtonID"].(string); ok && id != "" {
			title, _ := btnResp["selectedDisplayText"].(string)
			return "button", id, title
		}
		if resp, ok := btnResp["Response"].(map[string]interface{}); ok {
			if id, ok := resp["SelectedButtonID"].(string); ok && id != "" {
				title, _ := resp["SelectedDisplayText"].(string)
				return "button", id, title
			}
		}
		if id, ok := btnResp["selectedButtonId"].(string); ok && id != "" {
			return "button", id, ""
		}
		if resp, ok := btnResp["Response"].(map[string]interface{}); ok {
			if t, ok := resp["SelectedDisplayText"].(string); ok {
				return "button_text", t, t // last resort; engine aliases may catch
			}
		}
		if t, ok := btnResp["selectedDisplayText"].(string); ok {
			return "button_text", t, t
		}
	}
	if listResp, ok := messageData["listResponseMessage"].(map[string]interface{}); ok {
		// defensive top-level casings (mirror of button fix)
		for _, k := range []string{"selectedRowID", "SelectedRowID", "rowID"} {
			if id, ok := listResp[k].(string); ok && id != "" {
				return "list", id, ""
			}
		}
		if resp, ok := listResp["Response"].(map[string]interface{}); ok {
			id, _ := resp["SelectedRowID"].(string)
			title, _ := resp["Title"].(string)
			if t2, ok := resp["SelectedDisplayText"].(string); ok && title == "" {
				title = t2
			}
			if id != "" || title != "" {
				return "list", id, title
			}
		}
		if singleSelect, ok := listResp["singleSelectReply"].(map[string]interface{}); ok {
			rowID, _ := singleSelect["selectedRowId"].(string)
			title, _ := singleSelect["title"].(string)
			if rowID != "" || title != "" {
				return "list", rowID, title
			}
		}
	}
	if tmplBtn, ok := messageData["templateButtonReplyMessage"].(map[string]interface{}); ok {
		if selectedID, ok := tmplBtn["selectedId"].(string); ok {
			txt, _ := tmplBtn["selectedDisplayText"].(string)
			return "button", selectedID, txt
		}
	}
	if interactiveResp, ok := messageData["interactiveResponseMessage"].(map[string]interface{}); ok {
		if nativeFlow, ok := interactiveResp["nativeFlowResponseMessage"].(map[string]interface{}); ok {
			if paramsJSON, ok := nativeFlow["paramsJson"].(string); ok {
				var params map[string]interface{}
				if json.Unmarshal([]byte(paramsJSON), &params) == nil {
					if id, ok := params["id"].(string); ok {
						return "interactive", id, ""
					}
					if dt, ok := params["display_text"].(string); ok {
						return "interactive", dt, ""
					}
				}
			}
		}
	}
	return "", "", ""
}

func shortPhone(p string) string {
	if len(p) <= 4 {
		return "***"
	}
	return "*" + p[len(p)-4:]
}

func shortID(id string) string {
	if len(id) <= 6 {
		return id
	}
	return id[:6] + "..."
}
