package services

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// WhatsApp Conversation Engine (Phase 3)
// Deterministic stateful ordering assistant over the shared
// PostgreSQL menu, cart pricing and WebsiteOrderService.
// ------------------------------------------------------------------

type ConversationEngine struct {
	menu      *MenuService
	orders    *WebsiteOrderService
	evolution *EvolutionClient
	cfg       *config.Config
	messages  *BotMessageService
	biz       *BusinessConfig
}

func NewConversationEngine(menu *MenuService, orders *WebsiteOrderService,
	evolution *EvolutionClient, cfg *config.Config, messages *BotMessageService) *ConversationEngine {
	return &ConversationEngine{menu: menu, orders: orders, evolution: evolution, cfg: cfg, messages: messages, biz: GetBizConfig()}
}

// msg renders a bot message template by key with data.
func (e *ConversationEngine) msg(key string, data map[string]interface{}) string {
	return e.messages.Render(key, data)
}

// msgBrand renders a bot message template by key with no extra data (uses brand name).
func (e *ConversationEngine) msgBrand(key string) string {
	return e.messages.Render(key, nil)
}

// ------------------------- persistence ---------------------------

type conversation struct {
	CustomerID int               `json:"-"`
	State      string            `json:"state"`
	Context    map[string]string `json:"context"`
}

func loadConversation(customerID int) (*conversation, error) {
	row := database.DB.QueryRow(
		`SELECT state, COALESCE(context,'{}') FROM whatsapp_conversations WHERE customer_id = $1`,
		customerID)
	var c conversation
	var raw []byte
	if err := row.Scan(&c.State, &raw); err != nil {
		return &conversation{CustomerID: customerID, State: "IDLE", Context: map[string]string{}}, nil
	}
	c.CustomerID = customerID
	if err := json.Unmarshal(raw, &c.Context); err != nil || c.Context == nil {
		c.Context = map[string]string{}
	}
	if c.State == "" {
		c.State = "IDLE"
	}
	return &c, nil
}

func (c *conversation) save() error {
	raw, _ := json.Marshal(c.Context)
	_, err := database.DB.Exec(`
		INSERT INTO whatsapp_conversations (customer_id, state, context, last_message_at, updated_at)
		VALUES ($1,$2,$3::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
		ON CONFLICT (customer_id) DO UPDATE SET
			state = EXCLUDED.state,
			context = EXCLUDED.context,
			last_message_at = CURRENT_TIMESTAMP,
			updated_at = CURRENT_TIMESTAMP
	`, c.CustomerID, c.State, string(raw))
	return err
}

func (c *conversation) reset(state string) {
	c.State = state
	c.Context = map[string]string{}
	_ = c.save()
}

// ------------------------- entry point ---------------------------

// per-customer locks serialize rapid taps; different customers stay independent.
var custLocks = struct {
	sync.Mutex
	m     map[string]*sync.Mutex
	ages  map[string]time.Time
}{m: map[string]*sync.Mutex{}, ages: map[string]time.Time{}}

func lockFor(phone string) *sync.Mutex {
	custLocks.Lock()
	defer custLocks.Unlock()
	if custLocks.m[phone] == nil {
		custLocks.m[phone] = &sync.Mutex{}
	}
	custLocks.ages[phone] = time.Now()
	return custLocks.m[phone]
}

// cleanupCustLocks removes mutexes not touched in 30 minutes to prevent memory growth.
func init() {
	go func() {
		for range time.Tick(30 * time.Minute) {
			custLocks.Lock()
			cutoff := time.Now().Add(-30 * time.Minute)
			for phone, t := range custLocks.ages {
				if t.Before(cutoff) {
					delete(custLocks.m, phone)
					delete(custLocks.ages, phone)
				}
			}
			custLocks.Unlock()
		}
	}()
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

// HandleInbound processes one inbound message (text or normalized
// button/list action id). Duplicate deliveries are ignored via message id.
// Same customer's messages are serialized; customers are independent.
func (e *ConversationEngine) HandleInbound(phone, input, messageID string) error {
	input = strings.TrimSpace(input)
	if input == "" || phone == "" {
		return nil
	}
	lk := lockFor(phone)
	lk.Lock()
	defer lk.Unlock()

	if messageID != "" {
		var exists bool
		_ = database.DB.QueryRow(
			`SELECT EXISTS(SELECT 1 FROM processed_messages WHERE message_id=$1)`, messageID).Scan(&exists)
		if exists {
			log.Printf("[WA] duplicate id=%s from *%s ignored", shortID(messageID), shortPhone(phone))
			return nil
		}
		database.DB.Exec(`INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING`, messageID)
	}

	cust, err := GetOrCreateCustomer(phone)
	if err != nil {
		return fmt.Errorf("customer upsert failed: %w", err)
	}
	conv, err := loadConversation(cust.ID)
	if err != nil {
		return fmt.Errorf("conversation load failed: %w", err)
	}

	stateBefore := conv.State
	reply := e.route(cust, conv, phone, input)

	log.Printf("[WA] customer=*%s action=%q state %s -> %s",
		shortPhone(phone), input, stateBefore, conv.State)

	if reply != "" {
		if err := e.evolution.SendText(phone, reply); err != nil {
			log.Printf("WA text send failed to %s: %v", phone, err)
		}
	}
	return nil
}

// route applies global commands, self-describing selections, then
// falls back to the current state's free-text handling.
func (e *ConversationEngine) route(cust *Customer, conv *conversation, phone, input string) string {
	lower := strings.ToLower(input)

	// ---------- global commands ----------
	switch lower {
	case "hi", "hello", "hey", "start":
		// Smart Hi: never destroy an active flow or the cart.
		if conv.State == "IDLE" || conv.State == "MAIN_MENU" {
			conv.State = "MAIN_MENU"
			_ = conv.save()
			e.mainMenuText(cust, conv)
			return ""
		}
		count, _ := WACartCount(phone)
		if count > 0 {
			e.sendButtons(phone, e.msg("welcome_back_with_cart", map[string]interface{}{"ItemCount": count}),
				e.msg("welcome_back_with_cart", map[string]interface{}{"ItemCount": count}),
				[]Button{
					{Type: "reply", ID: "view_cart", DisplayText: emCart + " View Cart"},
					{Type: "reply", ID: "__continue__", DisplayText: emPizza + " Continue Ordering"},
					{Type: "reply", ID: "back_main", DisplayText: "Main Menu"},
				})
			return ""
		}
		flowMsg := e.msg("welcome_back_in_flow", map[string]interface{}{"State": pretty(conv.State)})
		flowMsg += "\n\n" + e.stateOptions(conv)
		e.evolution.SendText(phone, flowMsg)
		return ""
	case "menu", "main menu":
		conv.State = "MAIN_MENU"
		_ = conv.save()
		e.mainMenuText(cust, conv)
		return ""
	case "__continue__":
		// resume wherever the customer was
		return e.stateOptions(conv)
	case "help":
		return e.msgBrand("help")
	case "cancel":
		conv.reset("IDLE")
		return e.msgBrand("cancel_message")
	case "restart":
		ClearWACart(phone)
		conv.reset("IDLE")
		return e.msgBrand("restart_message")
	case "cart", "my cart", "view cart":
		lines, _ := GetWACart(phone)
		e.cartView(phone, lines)
		return ""
	case "status", "track order", "track":
		e.sendStatusView(phone)
		return ""
	case "orders", "my orders":
		e.sendOrderHistoryList(conv, phone)
		return ""
	case "profile", "my profile":
		e.profileText(cust, conv, phone)
		return ""
	case "location", "hours", "location hours":
		e.locationView(cust, conv, phone)
		return ""
	}

	// ---------- numbered reply against the last sent list ----------
	if n := atoiSafe(lower); n > 0 && conv.Context["pending_ids"] != "" {
		var ids []string
		if json.Unmarshal([]byte(conv.Context["pending_ids"]), &ids) == nil &&
			n >= 1 && n <= len(ids) {
			rowID := ids[n-1]
			delete(conv.Context, "pending_ids")
			_ = conv.save()
		if !e.handleSelection(cust, conv, phone, rowID) {
			return e.msg("unknown_input", map[string]interface{}{"Options": "That option is no longer available. Type 'menu'."})
		}
			return ""
		}
	}

	// ---------- interactive selections (self-describing IDs) ----------
	if handled := e.handleSelection(cust, conv, phone, input); handled {
		return ""
	}
	if handled := e.handleSelection(cust, conv, phone, lower); handled {
		return ""
	}

	// ---------- free-text states ----------
	switch conv.State {
	case "IDLE", "MAIN_MENU":
		conv.reset("MAIN_MENU")
		e.mainMenuText(cust, conv)
		return ""

	case "QUANTITY_MORE":
		n := atoiSafe(strings.TrimSpace(input))
		if n < 1 || n > 20 {
			return e.msgBrand("quantity_invalid")
		}
		e.addToCart(conv, phone, n)
		return ""

	case "PROFILE_NAME":
		name := strings.TrimSpace(input)
		if len(name) < 2 || len(name) > 60 {
			return e.msgBrand("name_invalid")
		}
		_ = UpdateCustomerProfile(phone, map[string]string{"name": name})
		cust2, _ := GetOrCreateCustomer(phone)
		if cust2 != nil {
			e.profileText(cust2, conv, phone)
		}
		return ""

	case "PROFILE_ADDR":
		addr := strings.TrimSpace(input)
		if len(addr) < 8 {
			return e.msgBrand("address_too_short")
		}
		_ = UpdateCustomerProfile(phone, map[string]string{"default_address": addr})
		cust2, _ := GetOrCreateCustomer(phone)
		if cust2 != nil {
			e.profileText(cust2, conv, phone)
		}
		return ""

	case "NAME":
		name := strings.TrimSpace(input)
		if len(name) < 2 || len(name) > 60 {
			return e.msgBrand("name_invalid")
		}
		conv.Context["name"] = name
		_ = UpdateCustomerProfile(phone, map[string]string{"name": name})
		if conv.Context["delivery_type"] == "delivery" && conv.Context["address"] == "" {
			conv.State = "ADDRESS"
			_ = conv.save()
			return e.msg("name_greeting_delivery", map[string]interface{}{"Name": name})
		}
		e.askPayment(conv, phone)
		return ""

	case "ADDRESS":
		addr := strings.TrimSpace(input)
		if len(addr) < 8 {
			return e.msgBrand("address_too_short")
		}
		conv.Context["address"] = addr
		_ = UpdateCustomerProfile(phone, map[string]string{"default_address": addr})
		conv.State = "LANDMARK"
		_ = conv.save()
		return e.msgBrand("address_prompt")

	case "LANDMARK":
		lm := strings.TrimSpace(input)
		if strings.EqualFold(lm, "skip") {
			lm = ""
		}
		conv.Context["landmark"] = lm
		if lm != "" {
			_ = UpdateCustomerProfile(phone, map[string]string{"landmark": lm})
		}
		e.askPayment(conv, phone)
		return ""

	case "HUMAN_SUPPORT":
		conv.reset("IDLE")
		return e.msgBrand("support_team_notified")

	default:
		return e.msg("unknown_input", map[string]interface{}{"Options": e.stateOptions(conv)})
	}
}

// handleSelection processes structured ids AND plain-text aliases,
// so the full flow works even if interactive cards never render.
func (e *ConversationEngine) handleSelection(cust *Customer, conv *conversation, phone, input string) bool {
	// Display-text fallback (when a client echoes only the label).
	switch strings.TrimSpace(input) {
	case emPizza + " Order Now", "Order Now", "order now":
		e.showCategories(conv, phone)
		return true
	case emPizza + " Menu", emPizza + " Browse Menu", "Browse Menu", "browse menu":
		e.showCategories(conv, phone)
		return true
	case emCart + " Cart", "My Cart", "my cart":
		lines, _ := GetWACart(phone)
		e.cartView(phone, lines)
		return true
	}

	switch input {
	case "order now", "order", "view menu":
		e.showCategories(conv, phone)
		return true
	case "checkout":
		e.promptFulfillment(conv, phone)
		return true
	case "add more":
		e.showCategories(conv, phone)
		return true
	case "view cart":
		lines, _ := GetWACart(phone)
		e.cartView(phone, lines)
		return true
	case "clear cart":
		ClearWACart(phone)
		conv.reset("IDLE")
		e.evolution.SendText(phone, e.msgBrand("cart_cleared"))
		return true
	case "delivery":
		if conv.State == "FULFILLMENT" || conv.State == "CART_MENU" || conv.State == "IDLE" {
			e.fulfillmentChosen(conv, phone, "delivery")
			return true
		}
	case "pickup":
		if conv.State == "FULFILLMENT" || conv.State == "CART_MENU" || conv.State == "IDLE" {
			e.fulfillmentChosen(conv, phone, "pickup")
			return true
		}
	case "cash", "cash on delivery":
		if conv.State == "PAYMENT" {
			e.paymentChosen(conv, phone, "cod")
			return true
		}
	case "upi":
		if conv.State == "PAYMENT" {
			e.paymentChosen(conv, phone, "upi")
			return true
		}
	case "online":
		if conv.State == "PAYMENT" {
			e.paymentChosen(conv, phone, "online")
			return true
		}
	case "place order", "yes", "confirm":
		if conv.State == "CONFIRMATION" {
			e.placeOrder(conv, phone)
			return true
		}
	case "track order":
		e.evolution.SendText(phone, e.latestStatusText(phone))
		return true
	}

	switch {
	case e.pagerNav(conv, phone, input):
		return true

	case input == "__more__" || strings.HasPrefix(input, "__more__"):
		key := strings.TrimPrefix(input, "__more__")
		e.replayListPage(conv, phone, key)
		return true

	case strings.HasPrefix(input, "act_"), strings.HasPrefix(input, "main_"):
		e.handleMainAction(cust, conv, phone, input)
		return true

	case input == "menu" || input == "back_main": // post-order / generic button
		conv.reset("MAIN_MENU")
		e.mainMenuText(cust, conv)
		return true

	case input == "order_again":
		e.showCategories(conv, phone)
		return true

	case input == "cmd_status" || input == "status_btn" || input == "track_order" ||
		strings.HasPrefix(input, "track_refresh_"):
		e.sendStatusView(phone)
		return true

	case strings.HasPrefix(input, "ord_"):
		e.orderDetailByName(conv, phone, strings.TrimPrefix(input, "ord_"))
		return true

	case input == "profile_edit_name":
		conv.State = "PROFILE_NAME"
		_ = conv.save()
		e.evolution.SendText(phone, e.msgBrand("profile_edit_name"))
		return true

	case input == "profile_edit_addr":
		conv.State = "PROFILE_ADDR"
		_ = conv.save()
		e.evolution.SendText(phone, e.msgBrand("profile_edit_addr"))
		return true

	case input == "maps_open":
		e.evolution.SendText(phone, e.mapsLink())
		return true

	case strings.HasPrefix(input, "category_"):
		e.showItems(conv, phone, strings.TrimPrefix(input, "category_"))
		return true

	case strings.HasPrefix(input, "cat_"): // legacy alias
		e.showItems(conv, phone, strings.TrimPrefix(input, "cat_"))
		return true

	case strings.HasPrefix(input, "item_"):
		e.startItemFlow(conv, phone, strings.TrimPrefix(input, "item_"))
		return true

	case strings.HasPrefix(input, "itm_"): // legacy alias
		e.startItemFlow(conv, phone, strings.TrimPrefix(input, "itm_"))
		return true

	case strings.HasPrefix(input, "size_"), strings.HasPrefix(input, "sz_"): // sz_ = legacy
		size := strings.TrimPrefix(input, "size_")
		size = strings.TrimPrefix(size, "sz_")
		conv.Context["size"] = size
		conv.State = "CRUST"
		_ = conv.save()
		e.sendCrustList(conv, phone, size)
		return true

	case strings.HasPrefix(input, "crust_"), strings.HasPrefix(input, "cr_"): // cr_ = legacy
		crust := strings.TrimPrefix(input, "crust_")
		crust = strings.TrimPrefix(crust, "cr_")
		conv.Context["crust"] = crust
		e.confirmSelection(conv, phone) // summary first, then quantity buttons
		return true

	case strings.HasPrefix(input, "qty_"), strings.HasPrefix(input, "q_"): // q_ = legacy
		q := strings.TrimPrefix(input, "qty_")
		q = strings.TrimPrefix(q, "q_")
		if q == "more" {
			conv.State = "QUANTITY_MORE"
			_ = conv.save()
			e.evolution.SendText(phone, e.msgBrand("quantity_more_prompt"))
			return true
		}
		e.addToCart(conv, phone, atoiSafe(q))
		return true

	case input == "add_more":
		e.showCategories(conv, phone)
		return true

	case input == "view_cart":
		lines, _ := GetWACart(phone)
		e.cartView(phone, lines)
		return true

	case input == "clear_cart" || input == "clr_cart":
		ClearWACart(phone)
		conv.reset("IDLE")
		e.evolution.SendText(phone, e.msgBrand("cart_cleared"))
		return true

	case input == "checkout":
		lines, _ := GetWACart(phone)
		if len(lines) == 0 {
			e.evolution.SendText(phone, e.msgBrand("cart_item_empty"))
			return true
		}
		var pb strings.Builder
		for _, l := range lines {
			variant := l.ItemName
			if l.Size != "" {
				variant += "\n   " + strings.Title(l.Size)
			}
			if l.CrustName != "" {
				variant += " - " + l.CrustName
			}
			fmt.Fprintf(&pb, "%d x %s : Rs.%d\n", l.Quantity, variant, int(l.LineTotal))
		}
		fmt.Fprintf(&pb, "\nTotal: Rs.%d", int(subtotalOf(lines)))
		e.evolution.SendText(phone, emCart+" Checkout\n\n"+pb.String()+"\n\nHow would you like to receive your order?")
		e.promptFulfillment(conv, phone)
		return true

	case input == "change_qty":
		e.sendCartLinePicker(conv, phone)
		return true

	case input == "ask_clear_cart":
		e.askClearCart(conv, phone)
		return true

	case input == "clear_yes":
		ClearWACart(phone)
		delete(conv.Context, "clear_pending")
		conv.reset("IDLE")
		e.evolution.SendText(phone, e.msgBrand("cart_cleared_alt"))
		return true

	case input == "clear_no":
		delete(conv.Context, "clear_pending")
		_ = conv.save()
		lines, _ := GetWACart(phone)
		e.cartView(phone, lines)
		return true

	case strings.HasPrefix(input, "cline_"):
		lineID := atoiSafe(strings.TrimPrefix(input, "cline_"))
		if line, err := GetWACartLineByID(phone, lineID); err == nil && line != nil {
			e.sendLineEditButtons(conv, phone, *line)
		} else {
			e.evolution.SendText(phone, e.msgBrand("cart_line_gone"))
		}
		return true

	case strings.HasPrefix(input, "qset_"):
		qty := atoiSafe(strings.TrimPrefix(input, "qset_"))
		e.applyLineQty(conv, phone, qty)
		return true

	case input == "line_remove":
		e.applyLineQty(conv, phone, 0)
		return true

	case strings.HasPrefix(input, "reorder_"):
		e.reorderAll(conv, phone, strings.TrimPrefix(input, "reorder_"))
		return true

	case input == "fulfillment_delivery" || input == "ful_delivery":
		e.fulfillmentChosen(conv, phone, "delivery")
		return true

	case input == "fulfillment_pickup" || input == "ful_pickup":
		e.fulfillmentChosen(conv, phone, "pickup")
		return true

	case input == "addr_saved":
		e.addressConfirmed(conv, phone, true)
		return true

	case input == "addr_new":
		e.addressConfirmed(conv, phone, false)
		return true

	case strings.HasPrefix(input, "payment_"), strings.HasPrefix(input, "pay_"): // pay_ = legacy
		method := ""
		switch input {
		case "payment_cash", "pay_cash":
			method = "cod"
		case "payment_upi", "pay_upi":
			method = "upi"
		default:
			method = "online"
		}
		e.paymentChosen(conv, phone, method)
		return true

	case input == "confirm_order" || input == "confirm_yes":
		e.placeOrder(conv, phone)
		return true

	case input == "confirm_change":
		e.promptFulfillment(conv, phone)
		return true

	case input == "confirm_cancel" || input == "confirm_no":
		// Cancel aborts placement but KEEPS the cart for later.
		lines, _ := GetWACart(phone)
		conv.reset("CART_MENU")
		e.evolution.SendText(phone, e.msgBrand("confirm_cancel"))
		e.cartView(phone, lines)
		return true
	}
	return false
}

// replayListPage re-renders a stored page after "More...".
func (e *ConversationEngine) replayListPage(conv *conversation, phone, pageKey string) {
	switch {
	case strings.HasPrefix(pageKey, "cat_page"):
		e.showCategories(conv, phone)
	case strings.HasPrefix(pageKey, "item_page_"):
		cat := strings.TrimPrefix(pageKey, "item_page_")
		e.showItems(conv, phone, cat)
	case strings.HasPrefix(pageKey, "crust_page_"):
		size := strings.TrimPrefix(pageKey, "crust_page_")
		e.sendCrustList(conv, phone, size)
	default:
		e.evolution.SendText(phone, e.msgBrand("session_expired"))
	}
}

func (e *ConversationEngine) stateOptions(conv *conversation) string {
	switch conv.State {
	case "NAME":
		return e.msgBrand("state_name")
	case "ADDRESS":
		return e.msgBrand("state_address")
	case "LANDMARK":
		return e.msgBrand("state_landmark")
	case "PAYMENT":
		return e.msgBrand("state_payment")
	case "CONFIRMATION":
		return e.msgBrand("state_confirmation")
	case "HUMAN_SUPPORT":
		return e.msgBrand("state_human_support")
	default:
		return e.msgBrand("help")
	}
}

// LoadConversationForPhone exposes conversation lookup for the admin
// debug endpoint.
func LoadConversationForPhone(phone string) (state string, contextJSON string, err error) {
	cust, err := GetOrCreateCustomer(phone)
	if err != nil {
		return "", "", err
	}
	conv, err := loadConversation(cust.ID)
	if err != nil {
		return "", "", err
	}
	raw, _ := json.Marshal(conv.Context)
	return conv.State, string(raw), nil
}
