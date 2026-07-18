package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"orangecheesepizza/bot/models"
)

// ------------------------------------------------------------------
// ConversationEngine handlers - Phase 3.2 restaurant-grade workflow.
//
// Interaction rules:
//   - buttons for <=3 choices, paginated lists for larger sets
//   - typed digits/words remain silent fallbacks, never instructed
//   - every money figure resolved from PostgreSQL at render time
// ------------------------------------------------------------------

func atoiSafe(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "..."
}

func pretty(s string) string {
	return strings.Title(strings.ReplaceAll(s, "_", " "))
}

func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return s
}

func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

func unknownInput(options string) string {
	return "I didn't quite understand that.\n\n" + options
}

func globalHelp() string {
	return emRobot + ` I can help you with:

` + emPizza + ` Ordering
` + emCart + ` Cart
` + emPackage + ` Order tracking
` + emUser + ` Profile
` + emPin + ` Restaurant location
` + emTel + ` Human support

Tap a button above, or type: menu - cart - status - orders`
}

func crustChargePlain(reg, med, lg float64, size string) float64 {
	return CrustCharge(
		sql.NullFloat64{Float64: reg, Valid: true},
		sql.NullFloat64{Float64: med, Valid: true},
		sql.NullFloat64{Float64: lg, Valid: true}, size)
}

func sizeOrRegular(s string) string {
	if s == "" {
		return "regular"
	}
	return s
}

// ---------- send helpers ----------

func (e *ConversationEngine) sendButtons(phone, title, body string, buttons []Button) {
	if err := e.evolution.SendButton(phone, title, body, "Orange Cheese Pizza", buttons); err != nil {
		log.Printf("WA button send failed to %s: %v", phone, err)
	}
}

func (e *ConversationEngine) evolutionSendList(conv *conversation, phone, title string, rows []Row) {
	err := e.evolution.SendList(phone, title, "Choose an option", "Select",
		"Orange Cheese Pizza", []Section{{Title: "Options", Rows: rows}})
	if err != nil {
		log.Printf("WA list send failed to %s: %v", phone, err)
	}
}

// ---------- chooser: button-pages (default) or lists (env opt-in) ----------
// Your WhatsApp client cannot render list-message cards, so large sets
// are paginated as groups of <=3 quick-reply buttons with ▶ More / ◀ Back.
// Set WA_LISTS=1 to restore native lists for capable clients.

type pagerItem struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

func rowsToPager(rows []Row) []pagerItem {
	out := make([]pagerItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, pagerItem{ID: r.RowID, Label: r.Title})
	}
	return out
}

const waPagerSize = 3

func (e *ConversationEngine) sendListPage(conv *conversation, phone, pageKey, title string, rows []Row) {
	if os.Getenv("WA_LISTS") == "1" {
		e.evolutionSendList(conv, phone, title, rows)
		return
	}
	e.sendButtonPages(conv, phone, pageKey, title, rowsToPager(rows))
}

func (e *ConversationEngine) sendButtonPages(conv *conversation, phone, key, title string, items []pagerItem) {
	q, _ := json.Marshal(items)
	conv.Context["pg_"+key] = string(q)
	conv.Context["pgt_"+key] = title
	conv.Context["pgpos_"+key] = "0"
	_ = conv.save()
	e.renderPagerPage(conv, phone, key)
}

func (e *ConversationEngine) renderPagerPage(conv *conversation, phone, key string) {
	var items []pagerItem
	if raw, ok := conv.Context["pg_"+key]; ok {
		_ = json.Unmarshal([]byte(raw), &items)
	}
	title := orDefault(conv.Context["pgt_"+key], "Choose:")
	pos := atoiSafe(orDefault(conv.Context["pgpos_"+key], "0"))

	start := pos * waPagerSize
	if start >= len(items) { // past the end (list shrank) -> reset to first page
		conv.Context["pgpos_"+key] = "0"
		_ = conv.save()
		start = 0
	}

	// HARD LIMIT: max 3 reply buttons TOTAL per message.
	// While more pages exist, reserve one slot for "More".
	hasNext := start+waPagerSize < len(items)
	take := waPagerSize
	if hasNext {
		take = waPagerSize - 1 // leave room for the More button
	}
	end := start + take
	if end > len(items) {
		end = len(items)
	}

	buttons := make([]Button, 0, waPagerSize)
	for _, it := range items[start:end] {
		buttons = append(buttons, Button{Type: "reply", ID: it.ID, DisplayText: it.Label})
	}
	if hasNext {
		buttons = append(buttons, Button{
			Type: "reply", ID: "__pgnext__" + key,
			DisplayText: "More " + emArrowR + fmt.Sprintf(" (%d)", len(items)-end),
		})
	} else if len(items) > waPagerSize && start > 0 {
		buttons = append(buttons, Button{Type: "reply", ID: "__pgfirst__" + key, DisplayText: emArrowL + " Start"})
	}
	if len(buttons) == 0 {
		e.evolution.SendText(phone, "Nothing to show. Type 'menu'.")
		return
	}
	pageInfo := ""
	if len(items) > waPagerSize {
		pageInfo = fmt.Sprintf(" (page %d)", pos+1)
	}
	e.sendButtons(phone, title+pageInfo, "Tap an option:", buttons)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (e *ConversationEngine) pagerNav(conv *conversation, phone, input string) bool {
	const pfxN = "__pgnext__"
	const pxF = "__pgfirst__"
	const pfxF = "__pgfirst__"
	switch {
	case strings.HasPrefix(input, pfxN):
		key := strings.TrimPrefix(input, pfxN)
		pos := atoiSafe(orDefault(conv.Context["pgpos_"+key], "0"))
		conv.Context["pgpos_"+key] = itoa(pos + 1)
		_ = conv.save()
		e.renderPagerPage(conv, phone, key)
		return true
	case strings.HasPrefix(input, pxF):
		key := strings.TrimPrefix(input, pxF)
		conv.Context["pgpos_"+key] = "0"
		_ = conv.save()
		e.renderPagerPage(conv, phone, key)
		return true
	}
	return false
}

// ---------- MAIN MENU ----------

func (e *ConversationEngine) mainMenuText(cust *Customer, conv *conversation) {
	greeting := emPizza + " Orange Cheese Pizza\n\nWelcome! What would you like to do?"
	if cust.FirstName != "" {
		greeting = fmt.Sprintf(emPizza+" Welcome back, %s! "+emWave+"\n\nWhat would you like to do?", cust.FirstName)
	}
	e.sendButtons(cust.WhatsAppNumber, greeting,
		"We're ready when you are.",
		[]Button{
			{Type: "reply", ID: "main_order", DisplayText: emPizza + " Order Now"},
			{Type: "reply", ID: "main_browse", DisplayText: emPizza + " Browse Menu"},
			{Type: "reply", ID: "main_cart", DisplayText: emCart + " My Cart"},
		})
}

func (e *ConversationEngine) handleMainAction(cust *Customer, conv *conversation, phone, input string) bool {
	switch input {
	case "main_order":
		e.showCategories(conv, phone)
	case "main_browse", "act_menu":
		e.showCategories(conv, phone)
	case "main_cart", "act_cart":
		lines, _ := GetWACart(phone)
		e.cartView(phone, lines)
	case "main_orders", "act_orders":
		e.sendOrderHistoryList(conv, phone)
	case "main_profile", "act_profile":
		e.profileText(cust, conv, phone)
	case "main_location", "act_location":
		e.locationView(cust, conv, phone)
	case "main_support", "act_support":
		e.startHumanSupport(cust, phone)
	default:
		return false
	}
	return true
}

// ---------- CATEGORIES ----------

func (e *ConversationEngine) showCategories(conv *conversation, phone string) {
	cats, err := e.menu.GetCategoriesWithSlug()
	if err != nil || len(cats) == 0 {
		e.evolution.SendText(phone, "Menu is temporarily unavailable. Please try again shortly.")
		return
	}
	rows := make([]Row, 0, len(cats))
	for _, c := range cats {
		rows = append(rows, Row{
			RowID:       "category_" + c.Slug,
			Title:       categoryIcons[c.Slug] + " " + c.Name,
			Description: truncate(c.Description, 55),
		})
	}
	conv.State = "CATEGORY"
	_ = conv.save()
	e.sendListPage(conv, phone, "cat_page", emPizza+" What would you like to order?", rows)
}

func categorySlugOf(m *models.MenuItem) string {
	if m.Category == nil {
		return ""
	}
	return m.Category.Slug
}

// ---------- ITEMS ----------

func (e *ConversationEngine) showItems(conv *conversation, phone, catSlug string) {
	cats, err := e.menu.GetCategoriesWithSlug()
	if err != nil {
		e.evolution.SendText(phone, "Menu is temporarily unavailable.")
		return
	}
	catID := -1
	catName := ""
	for _, c := range cats {
		if c.Slug == catSlug {
			catID = c.ID
			catName = c.Name
			break
		}
	}
	items, err := e.menu.GetAllActiveItems()
	if err != nil || catID == -1 {
		e.evolution.SendText(phone, "Menu is temporarily unavailable.")
		return
	}
	rows := []Row{}
	for i := range items {
		it := &items[i]
		if it.CategoryID != catID {
			continue
		}
		price := fmt.Sprintf("Rs.%d", int(it.Price))
		if r, ok := it.PriceBySize["regular"]; ok && r > 0 {
			price = "from Rs." + itoa(int(r))
		}
		title := it.Name
		if len(title) > 24 {
			title = title[:24]
		}
		rows = append(rows, Row{
			RowID:       itemRef(it),
			Title:       title + " - " + price,
			Description: truncate(it.Description, 58),
		})
	}
	if len(rows) == 0 {
		e.evolution.SendText(phone, "No items available in that category right now. Type 'menu' to browse.")
		return
	}
	conv.State = "ITEM"
	conv.Context["category"] = catSlug
	_ = conv.save()

	title := emPizza + " " + catName + " - choose your item"
	e.sendListPage(conv, phone, "item_page_"+catSlug, title, rows)
}

func itemRef(m *models.MenuItem) string {
	if m.Slug != "" {
		return "item_" + m.Slug
	}
	return fmt.Sprintf("item_%d", m.ID)
}

// ---------- ITEM DETAIL -> SIZE -> CRUST -> SUMMARY -> QTY ----------

func (e *ConversationEngine) startItemFlow(conv *conversation, phone, ref string) {
	item, err := e.menu.GetItemByIdentifier(ref)
	if err != nil || item == nil {
		e.evolution.SendText(phone, "That item is unavailable right now. Type 'menu' to browse.")
		return
	}
	// reset per-item customization so nothing leaks between items
	delete(conv.Context, "size")
	delete(conv.Context, "crust")
	delete(conv.Context, "unit_price")
	conv.Context["item_slug"] = item.Slug
	conv.Context["item_name"] = item.Name

	detail := emPizza + " *" + item.Name + "*\n" + item.Description

	if len(item.PriceBySize) == 0 {
		conv.Context["size"] = ""
		conv.Context["crust"] = ""
		// crust-less, single-price item: skip size AND crust entirely
		e.confirmSelection(conv, phone)
		return
	}

	var sizes strings.Builder
	sizes.WriteString("Available sizes:\n")
	for _, s := range []string{"regular", "medium", "large"} {
		if p, ok := item.PriceBySize[s]; ok && p > 0 {
			fmt.Fprintf(&sizes, "%s Rs.%d\n", strings.Title(s), int(p))
		}
	}

	buttons := []Button{}
	for _, s := range []string{"regular", "medium", "large"} {
		if p, ok := item.PriceBySize[s]; ok && p > 0 {
			buttons = append(buttons, Button{
				Type:        "reply",
				ID:          "size_" + s,
				DisplayText: fmt.Sprintf("%s Rs.%d", strings.Title(s), int(p)),
			})
		}
	}
	conv.State = "SIZE"
	_ = conv.save()
	e.sendButtons(phone, "Choose your size", detail+"\n\n"+sizes.String(), buttons)
}

func (e *ConversationEngine) sendCrustList(conv *conversation, phone, size string) {
	cr, err := e.menu.GetActiveCrusts()
	sz := sizeOrRegular(size)
	if err != nil || len(cr) == 0 {
		conv.Context["crust"] = ""
		e.confirmSelection(conv, phone)
		return
	}
	rows := make([]Row, 0, len(cr))
	for _, c := range cr {
		label := c.Name
		if extra := crustChargePlain(c.Regular, c.Medium, c.Large, sz); extra > 0 {
			label += fmt.Sprintf(" (+Rs.%d)", int(extra))
		}
		rows = append(rows, Row{RowID: "crust_" + c.Slug, Title: label, Description: c.Description})
	}
	conv.State = "CRUST"
	_ = conv.save()
	e.sendListPage(conv, phone, "crust_page_"+sz, emBread+" Choose your crust", rows)
}

// confirmSelection echoes the built selection, then asks quantity.
func (e *ConversationEngine) confirmSelection(conv *conversation, phone string) {
	item, err := e.menu.GetItemByIdentifier(conv.Context["item_slug"])
	if err != nil || item == nil {
		conv.reset("IDLE")
		e.evolution.SendText(phone, "That item became unavailable. Type 'menu' to pick another.")
		return
	}
	size := conv.Context["size"]
	crustSlug := conv.Context["crust"]
	crustName := ""

	unit := item.PriceBySizeFor(size)
	if crustSlug != "" {
		if cr, _ := e.menu.GetActiveCrusts(); cr != nil {
			for _, c := range cr {
				if c.Slug == crustSlug {
					crustName = c.Name
					unit += crustChargePlain(c.Regular, c.Medium, c.Large, size)
					break
				}
			}
		}
	}
	conv.Context["unit_price"] = itoa(int(unit))

	var b strings.Builder
	b.WriteString("*Your selection:*\n\n")
	fmt.Fprintf(&b, "%s %s\n", emPizza, item.Name)
	if size != "" {
		fmt.Fprintf(&b, "%s\n", strings.Title(size))
	}
	if crustName != "" {
		fmt.Fprintf(&b, "%s\n", crustName)
	}
	fmt.Fprintf(&b, "Rs.%d", int(unit))

	conv.State = "QUANTITY"
	_ = conv.save()
	e.sendButtons(phone, b.String(), "How many would you like?",
		[]Button{
			{Type: "reply", ID: "qty_1", DisplayText: "1"},
			{Type: "reply", ID: "qty_2", DisplayText: "2"},
			{Type: "reply", ID: "qty_3", DisplayText: "3"},
		})
	e.sendButtons(phone, "...more",
		"How many would you like?",
		[]Button{
			{Type: "reply", ID: "qty_4", DisplayText: "4"},
			{Type: "reply", ID: "qty_5", DisplayText: "5"},
			{Type: "reply", ID: "qty_more", DisplayText: emPlus + " More"},
		})
}

func (e *ConversationEngine) addToCart(conv *conversation, phone string, qty int) {
	if qty < 1 || qty > 20 {
		qty = 1
	}
	item, err := e.menu.GetItemByIdentifier(conv.Context["item_slug"])
	if err != nil || item == nil {
		conv.reset("IDLE")
		e.evolution.SendText(phone, "That item became unavailable. Type 'menu' to pick another.")
		return
	}
	size := conv.Context["size"]
	crustSlug := conv.Context["crust"]

	// ALWAYS recompute from PostgreSQL at add-time; never trust stale context.
	unit := item.PriceBySizeFor(size)
	crustName := ""
	if crustSlug != "" {
		if cr, _ := e.menu.GetActiveCrusts(); cr != nil {
			for _, c := range cr {
				if c.Slug == crustSlug {
					crustName = c.Name
					unit += crustChargePlain(c.Regular, c.Medium, c.Large, size)
					break
				}
			}
		}
	}
	if err := AddToWACart(phone, item.ID, size, crustSlug, qty, unit); err != nil {
		e.evolution.SendText(phone, "Couldn't update the cart. Please try again.")
		return
	}

	sizeLine := ""
	if size != "" {
		sizeLine = "\n" + strings.Title(size)
	}
	crustLine := ""
	if crustName != "" {
		crustLine = " - " + crustName
	}
	summary := fmt.Sprintf("%s %s%s%s\nQty: %d\nRs.%d",
		emPizza, item.Name, sizeLine, crustLine, qty, int(unit*float64(qty)))

	conv.State = "CART_MENU"
	_ = conv.save()
	e.sendButtons(phone, emCheck+" Added to your cart!", summary,
		[]Button{
			{Type: "reply", ID: "add_more", DisplayText: emPizza + " Add More"},
			{Type: "reply", ID: "view_cart", DisplayText: emCart + " View Cart"},
			{Type: "reply", ID: "checkout", DisplayText: emCheck + " Checkout"},
		})
}

// ---------- CART ----------

func (e *ConversationEngine) cartView(phone string, lines []WACartLine) {
	if len(lines) == 0 {
		e.evolution.SendText(phone, "Your cart is empty. "+emCart+"\nType 'menu' to start an order!")
		return
	}
	var b strings.Builder
	subtotal := 0.0
	for i, l := range lines {
		b.WriteString(fmt.Sprintf("%d. %s\n", i+1, l.ItemName))
		if l.Size != "" || l.CrustName != "" {
			variant := "   "
			if l.Size != "" {
				variant += strings.Title(l.Size)
			}
			if l.CrustName != "" {
				if l.Size != "" {
					variant += " - "
				}
				variant += l.CrustName
			}
			b.WriteString(variant + "\n")
		}
		fmt.Fprintf(&b, "   Qty %d : Rs.%d\n", l.Quantity, int(l.LineTotal))
		subtotal += l.LineTotal
	}
	fmt.Fprintf(&b, "\nSubtotal: Rs.%d\n(taxes included)", int(subtotal))

	e.sendButtons(phone, emCart+" Your Cart", b.String(),
		[]Button{
			{Type: "reply", ID: "checkout", DisplayText: emCheck + " Checkout"},
			{Type: "reply", ID: "change_qty", DisplayText: "Change Qty"},
			{Type: "reply", ID: "ask_clear_cart", DisplayText: emTrash + " Clear Cart"},
		})
}

// change-qty: pick a line, then set its quantity via buttons.
func (e *ConversationEngine) sendCartLinePicker(conv *conversation, phone string) {
	lines, _ := GetWACart(phone)
	if len(lines) == 0 {
		e.evolution.SendText(phone, "Your cart is empty.")
		return
	}
	rows := make([]Row, 0, len(lines))
	for _, l := range lines {
		variant := l.ItemName
		if l.Size != "" {
			variant += " - " + strings.Title(l.Size)
		}
		rows = append(rows, Row{
			RowID:       fmt.Sprintf("cline_%d", l.ID),
			Title:       fmt.Sprintf("%s (Qty %d)", variant, l.Quantity),
			Description: fmt.Sprintf("Rs.%d", int(l.LineTotal)),
		})
	}
	conv.State = "CART_EDIT"
	_ = conv.save()
	e.sendListPage(conv, phone, "cline_page", "Which item?", rows)
}

func (e *ConversationEngine) sendLineEditButtons(conv *conversation, phone string, line WACartLine) {
	conv.Context["edit_line"] = itoa(line.ID)
	conv.State = "CART_EDIT_QTY"
	_ = conv.save()
	e.sendButtons(phone, line.ItemName,
		fmt.Sprintf("Current quantity: %d\nSet new quantity:", line.Quantity),
		[]Button{
			{Type: "reply", ID: "qset_1", DisplayText: emMinus + " 1"},
			{Type: "reply", ID: "qset_2", DisplayText: "2"},
			{Type: "reply", ID: "qset_3", DisplayText: "3"},
		})
	e.sendButtons(phone, line.ItemName, "or:",
		[]Button{
			{Type: "reply", ID: "qset_4", DisplayText: "4"},
			{Type: "reply", ID: "qset_5", DisplayText: "5"},
			{Type: "reply", ID: "line_remove", DisplayText: emTrash + " Remove"},
		})
}

func (e *ConversationEngine) applyLineQty(conv *conversation, phone string, qty int) {
	lineID := atoiSafe(conv.Context["edit_line"])
	if lineID == 0 {
		e.cartViewPrompt(phone)
		return
	}
	if qty <= 0 {
		_ = RemoveFromWACart(phone, lineID)
	} else {
		_ = UpdateWACartLine(phone, lineID, qty)
	}
	delete(conv.Context, "edit_line")
	conv.State = "CART_MENU"
	_ = conv.save()
	lines, _ := GetWACart(phone)
	e.cartView(phone, lines)
}

func (e *ConversationEngine) cartViewPrompt(phone string) {
	e.evolution.SendText(phone, "Done. Type 'cart' to see your cart.")
}

func (e *ConversationEngine) askClearCart(conv *conversation, phone string) {
	conv.Context["clear_pending"] = "1"
	e.sendButtons(phone, emTrash+" Clear your cart?",
		"This removes all items.",
		[]Button{
			{Type: "reply", ID: "clear_yes", DisplayText: "Yes, Clear"},
			{Type: "reply", ID: "clear_no", DisplayText: "Keep Cart"},
		})
}

// ---------- CHECKOUT ----------

func (e *ConversationEngine) promptFulfillment(conv *conversation, phone string) {
	lines, _ := GetWACart(phone)
	if len(lines) == 0 {
		e.evolution.SendText(phone, "Your cart is empty. "+emCart+" Type 'menu' to add items.")
		return
	}
	conv.State = "FULFILLMENT"
	_ = conv.save()
	e.sendButtons(phone, "How would you like to receive your order?",
		"Choose one:",
		[]Button{
			{Type: "reply", ID: "fulfillment_delivery", DisplayText: emScooter + " Delivery"},
			{Type: "reply", ID: "fulfillment_pickup", DisplayText: emStore + " Pickup"},
		})
}

func (e *ConversationEngine) sendQuantity(conv *conversation, phone string) {
	name := conv.Context["item_name"]
	e.sendButtons(phone, "How many would you like?",
		name,
		[]Button{
			{Type: "reply", ID: "qty_1", DisplayText: "1"},
			{Type: "reply", ID: "qty_2", DisplayText: "2"},
			{Type: "reply", ID: "qty_3", DisplayText: "3"},
		})
	e.sendButtons(phone, "...more",
		"How many would you like?",
		[]Button{
			{Type: "reply", ID: "qty_4", DisplayText: "4"},
			{Type: "reply", ID: "qty_5", DisplayText: "5"},
			{Type: "reply", ID: "qty_more", DisplayText: emPlus + " More"},
		})
}

func subtotalOf(lines []WACartLine) float64 {
	s := 0.0
	for _, l := range lines {
		s += l.LineTotal
	}
	return s
}

func (e *ConversationEngine) fulfillmentChosen(conv *conversation, phone, kind string) {
	lines, _ := GetWACart(phone)
	if len(lines) == 0 {
		e.evolution.SendText(phone, "Your cart is empty. "+emCart+" Type 'menu' first.")
		return
	}
	conv.Context["delivery_type"] = kind
	cust, _ := GetOrCreateCustomer(phone)

	if kind == "pickup" {
		addr := orDefault(e.cfg.RestaurantAddress,
			"Shop 21, B Wing, Winstone PNK, Beverly Park, Mira Road East")
		store := emStore + " Pickup from:\nOrange Cheese Pizza\n" + addr
		if cust != nil && cust.FirstName != "" {
			conv.Context["name"] = cust.FirstName
			e.askPaymentAfter(conv, phone, store+"\n\n"+"Thanks, "+cust.FirstName+"!")
			return
		}
		conv.State = "NAME"
		_ = conv.save()
		e.evolution.SendText(phone, store+"\n\nWhat's your name?")
		return
	}

	if cust != nil && cust.DefaultAddress.Valid {
		conv.Context["saved_address"] = cust.DefaultAddress.String
		if cust.Landmark.Valid {
			conv.Context["saved_landmark"] = cust.Landmark.String
		}
		if cust.FirstName != "" {
			conv.Context["name"] = cust.FirstName
		}
		conv.State = "ADDRESS_CONFIRM"
		_ = conv.save()
		e.sendButtons(phone, emPin+" Saved address",
			fmt.Sprintf("We have your saved address:\n\n%s\n\nUse this address?", cust.DefaultAddress.String),
			[]Button{
				{Type: "reply", ID: "addr_saved", DisplayText: emCheck + " Use This"},
				{Type: "reply", ID: "addr_new", DisplayText: emPencil + " Change"},
			})
		return
	}
	conv.State = "NAME"
	_ = conv.save()
	e.evolution.SendText(phone, "What name should we use for your order?")
}

func (e *ConversationEngine) addressConfirmed(conv *conversation, phone string, useSaved bool) {
	if useSaved {
		conv.Context["address"] = conv.Context["saved_address"]
		conv.Context["landmark"] = conv.Context["saved_landmark"]
		e.askPayment(conv, phone)
		return
	}
	conv.State = "NAME"
	_ = conv.save()
	e.evolution.SendText(phone, "Please send your delivery address first, then we'll continue.")
}

func (e *ConversationEngine) askPayment(conv *conversation, phone string) {
	conv.State = "PAYMENT"
	_ = conv.save()
	e.sendButtons(phone, emCard+" Choose payment method:",
		"Cash on delivery available.",
		[]Button{
			{Type: "reply", ID: "payment_cash", DisplayText: emCash + " Cash"},
			{Type: "reply", ID: "payment_upi", DisplayText: emPhone + " UPI"},
			{Type: "reply", ID: "payment_online", DisplayText: emCard + " Online"},
		})
}

func (e *ConversationEngine) askPaymentAfter(conv *conversation, phone, intro string) {
	conv.State = "PAYMENT"
	_ = conv.save()
	e.evolution.SendText(phone, intro)
	e.sendButtons(phone, emCard+" Payment method", "How would you like to pay?",
		[]Button{
			{Type: "reply", ID: "payment_cash", DisplayText: emCash + " Cash"},
			{Type: "reply", ID: "payment_upi", DisplayText: emPhone + " UPI"},
			{Type: "reply", ID: "payment_online", DisplayText: emBank + " Online"},
		})
}

// ---------- FINAL REVIEW ----------

func (e *ConversationEngine) paymentChosen(conv *conversation, phone, method string) {
	conv.Context["payment"] = method
	lines, _ := GetWACart(phone)
	if len(lines) == 0 {
		conv.reset("IDLE")
		e.evolution.SendText(phone, "Cart is empty - type 'menu' to start over.")
		return
	}
	payLabel := map[string]string{"cod": "Cash", "upi": "UPI", "online": "Online"}[method]

	var b strings.Builder
	b.WriteString(emPizza + " ORDER SUMMARY\n\n")
	name := orDash(conv.Context["name"])
	dt := strings.Title(conv.Context["delivery_type"])

	fmt.Fprintf(&b, "Customer: %s\n", name)
	fmt.Fprintf(&b, "Order type: %s\n", dt)

	itemsBlock := ""
	for _, l := range lines {
		itemsBlock += fmt.Sprintf("%d x %s", l.Quantity, l.ItemName)
		if l.Size != "" || l.CrustName != "" {
			itemsBlock += "\n    "
			if l.Size != "" {
				itemsBlock += strings.Title(l.Size)
			}
			if l.CrustName != "" {
				if l.Size != "" {
					itemsBlock += " - "
				}
				itemsBlock += l.CrustName
			}
		}
		itemsBlock += fmt.Sprintf("\n    Rs.%d\n", int(l.LineTotal))
	}

	sub := subtotalOf(lines)
	fmt.Fprintf(&b, "\nItems:\n%s", itemsBlock)
	fmt.Fprintf(&b, "\nSubtotal: Rs.%d\nDelivery: Rs.0\nTotal: Rs.%d\n", int(sub), int(sub))
	fmt.Fprintf(&b, "\nPayment: %s\n", payLabel)

	if dt == "Delivery" {
		fmt.Fprintf(&b, "\nAddress:\n%s", conv.Context["address"])
		if lm := conv.Context["landmark"]; lm != "" {
			fmt.Fprintf(&b, "\nLandmark: %s", lm)
		}
	} else {
		fmt.Fprintf(&b, "\n\nPickup at the store")
	}

	conv.State = "CONFIRMATION"
	_ = conv.save()
	e.sendButtons(phone, "Ready to place your order?", b.String(),
		[]Button{
			{Type: "reply", ID: "confirm_order", DisplayText: emCheck + " Place Order"},
			{Type: "reply", ID: "confirm_change", DisplayText: emPencil + " Change"},
			{Type: "reply", ID: "confirm_cancel", DisplayText: emCross + " Cancel"},
		})
}

func (e *ConversationEngine) placeOrder(conv *conversation, phone string) {
	lines, _ := GetWACart(phone)
	if len(lines) == 0 {
		conv.reset("IDLE")
		e.evolution.SendText(phone, "Cart is empty - nothing placed. Type 'menu'.")
		return
	}
	items := make([]WebsiteOrderItemRequest, 0, len(lines))
	for _, l := range lines {
		items = append(items, WebsiteOrderItemRequest{
			ID: l.Slug, Size: l.Size, Crust: l.Crust, Quantity: l.Quantity,
		})
	}
	req := &WebsiteOrderRequest{
		Customer:      WebsiteCustomerRequest{Name: conv.Context["name"], Phone: phone},
		DeliveryType:  orDefault(conv.Context["delivery_type"], "pickup"),
		Address:       conv.Context["address"],
		Landmark:      conv.Context["landmark"],
		PaymentMethod: orDefault(conv.Context["payment"], "cod"),
		Items:         items,
		Source:        "whatsapp",
	}
	result, err := e.orders.Create(req, "")
	if err != nil {
		log.Printf("WA order create failed for %s: %v", phone, err)
		e.evolution.SendText(phone, "Couldn't place your order: "+err.Error()+"\n\nType 'cart' to review and retry.")
		return
	}

	_ = RecordCustomerOrder(phone, result.Total)
	ClearWACart(phone)
	conv.reset("IDLE")

	confirmation := fmt.Sprintf(emCheck+" *ORDER PLACED!*\n\nThank you%s! %s\n\nOrder:\n*%s*\n\nTotal:\nRs.%d\n\nWe'll keep you updated here.",
		thankSuffix(custFirstName(phone)), emPizza, result.OrderNumber, int(result.Total))
	e.sendButtons(phone, emTada+" Thank you!", confirmation,
		[]Button{
			{Type: "reply", ID: "track_order", DisplayText: emPackage + " Track Order"},
			{Type: "reply", ID: "order_again", DisplayText: emPizza + " Order Again"},
			{Type: "reply", ID: "back_main", DisplayText: "Main Menu"},
		})
}

func thankSuffix(name string) string {
	if strings.TrimSpace(name) != "" {
		return ", " + name
	}
	return ""
}

func custFirstName(phone string) string {
	c, err := GetOrCreateCustomer(phone)
	if err != nil || c == nil {
		return ""
	}
	return c.FirstName
}

// ---------------- VIEWS ----------------

func (e *ConversationEngine) sendStatusView(phone string) {
	order, _ := LatestActiveOrder(phone)
	if order == nil {
		e.sendButtons(phone, "No active order",
			"You don't have an active order right now.",
			[]Button{
				{Type: "reply", ID: "main_order", DisplayText: emPizza + " Order Now"},
				{Type: "reply", ID: "back_main", DisplayText: emPackage + " My Orders"},
			})
		return
	}
	e.sendStatusViewFor(phone, order)
}

func (e *ConversationEngine) sendStatusViewFor(phone string, o *models.Order) {
	var items strings.Builder
	for _, it := range o.Items {
		fmt.Fprintf(&items, "%d x %s\n", it.Quantity, it.Name)
	}
	e.sendButtons(phone, emPackage+" "+o.OrderNumber,
		fmt.Sprintf("Status: %s %s\n\n%s\nTotal: Rs.%d",
			statusEmoji[o.Status], pretty(o.Status), items.String(), int(o.Total)),
		[]Button{
			{Type: "reply", ID: "track_refresh_" + o.OrderNumber, DisplayText: "Refresh"},
			{Type: "reply", ID: "back_main", DisplayText: "Main Menu"},
		})
}

func (e *ConversationEngine) latestStatusText(phone string) string {
	order, _ := LatestActiveOrder(phone)
	if order == nil {
		return "You have no active orders right now. " + emPizza
	}
	return fmt.Sprintf("Order %s\nStatus: %s %s\nTotal: Rs.%d",
		order.OrderNumber, statusEmoji[order.Status], pretty(order.Status), int(order.Total))
}

func (e *ConversationEngine) sendOrderHistoryList(conv *conversation, phone string) {
	orders, err := CustomerOrders(phone, 10)
	if err != nil || len(orders) == 0 {
		e.sendButtons(phone, "No past orders yet",
			"Your first pizza awaits!",
			[]Button{{Type: "reply", ID: "main_order", DisplayText: emPizza + " Order Now"}})
		return
	}
	rows := make([]Row, 0, len(orders))
	for _, o := range orders {
		rows = append(rows, Row{
			RowID:       "ord_" + o.OrderNumber,
			Title:       o.OrderNumber,
			Description: fmt.Sprintf("Rs.%d - %s", int(o.Total), pretty(o.Status)),
		})
	}
	e.sendButtonPages(conv, phone, "hist_page", emPackage+" Your recent orders", rowsToPager(rows))
}

func (e *ConversationEngine) orderDetailByName(conv *conversation, phone, number string) {
	orders, _ := CustomerOrders(phone, 20)
	for i := range orders {
		if orders[i].OrderNumber != number {
			continue
		}
		o := &orders[i]
		var items strings.Builder
		for _, it := range o.Items {
			fmt.Fprintf(&items, "%d x %s : Rs.%d\n", it.Quantity, it.Name, int(it.Subtotal))
		}
		e.sendButtons(phone, emPackage+" "+number,
			fmt.Sprintf("Status: %s %s\nPlaced: %s\n\n%sTotal: Rs.%d",
				statusEmoji[o.Status], pretty(o.Status),
				o.CreatedAt.Format("02 Jan, 3:04 PM"), items.String(), int(o.Total)),
			[]Button{
				{Type: "reply", ID: "reorder_" + number, DisplayText: emPizza + " Order Again"},
				{Type: "reply", ID: "back_main", DisplayText: "Main Menu"},
			})
		return
	}
	e.evolution.SendText(phone, "That order was not found on this account.")
}

// reorder adds every still-available item from a past order.
func (e *ConversationEngine) reorderAll(conv *conversation, phone, number string) {
	orders, _ := CustomerOrders(phone, 20)
	var target *models.Order
	for i := range orders {
		if orders[i].OrderNumber == number {
			target = &orders[i]
			break
		}
	}
	if target == nil {
		e.evolution.SendText(phone, "That order was not found on this account.")
		return
	}
	added, skipped := 0, []string{}
	for _, it := range target.Items {
		item, err := e.menu.GetItemByIdentifier(fmt.Sprintf("%d", it.MenuItemID))
		if err != nil || item == nil {
			skipped = append(skipped, it.Name)
			continue
		}
		if err := AddToWACart(phone, item.ID, "", "", it.Quantity, item.Price); err != nil {
			skipped = append(skipped, it.Name)
			continue
		}
		added++
	}
	msg := fmt.Sprintf(emCheck+" Added %d item(s) from %s to your cart.", added, number)
	for _, s := range skipped {
		msg += fmt.Sprintf("\n"+emWarning+" %s is currently unavailable.", s)
	}
	conv.State = "CART_MENU"
	_ = conv.save()
	lines, _ := GetWACart(phone)
	e.cartView(phone, lines)
	log.Printf("reorder %s: added=%d skipped=%v", number, added, skipped)
	_ = msg
}

func (e *ConversationEngine) profileText(cust *Customer, conv *conversation, phone string) {
	addr, lm := "-", "-"
	if cust.DefaultAddress.Valid {
		addr = cust.DefaultAddress.String
	}
	if cust.Landmark.Valid {
		lm = cust.Landmark.String
	}
	name := orDash(cust.FirstName)
	body := fmt.Sprintf("WhatsApp: %s\nAddress: %s\nLandmark: %s\nOrders: %d\nSpent: Rs.%d",
		cust.WhatsAppNumber, addr, lm, cust.TotalOrders, int(cust.TotalSpent))
	e.sendButtons(phone, emUser+" "+name, body,
		[]Button{
			{Type: "reply", ID: "profile_edit_name", DisplayText: emPencil + " Name"},
			{Type: "reply", ID: "profile_edit_addr", DisplayText: emPin + " Address"},
			{Type: "reply", ID: "back_main", DisplayText: "Main Menu"},
		})
}

func (e *ConversationEngine) locationView(cust *Customer, conv *conversation, phone string) {
	addr := orDefault(e.cfg.RestaurantAddress,
		"Shop 21, B Wing, Winstone PNK, Beverly Park, Mira Road East, Thane 401107")
	phoneOut := orDefault(e.cfg.RestaurantPhone, "8369293998 / 8591683998")
	e.sendButtons(phone,
		emPin+" Orange Cheese Pizza",
		fmt.Sprintf("%s\n\nTel: %s\nKitchen: 11 AM - 11 PM\nDelivery: 11 AM - 4 AM", addr, phoneOut),
		[]Button{
			{Type: "reply", ID: "maps_open", DisplayText: "Open Maps"},
			{Type: "reply", ID: "back_main", DisplayText: "Main Menu"},
		})
}

func (e *ConversationEngine) mapsLink() string {
	if u := strings.TrimSpace(e.cfg.RestaurantMapURL); u != "" {
		return u
	}
	addr := orDefault(e.cfg.RestaurantAddress, "Orange Cheese Pizza Mira Road")
	return "https://maps.google.com/?q=" + strings.ReplaceAll(addr, " ", "+")
}

func (e *ConversationEngine) startHumanSupport(cust *Customer, phone string) {
	dest := strings.TrimSpace(e.cfg.RestaurantWhatsAppNumber)
	count, _ := WACartCount(phone)
	active, _ := LatestActiveOrder(phone)
	activeLine := "none"
	if active != nil {
		activeLine = active.OrderNumber
	}
	if dest != "" {
		msg := fmt.Sprintf(
			"*CUSTOMER REQUESTED SUPPORT*\n\nWhatsApp: %s\nName: %s\nCurrent order: %s\nCart lines: %d\n\nReply to them directly on WhatsApp.",
			phone, orDash(cust.FirstName), activeLine, count)
		if err := e.evolution.SendText(dest, msg); err != nil {
			log.Printf("support notify failed: %v", err)
		}
	}
	conv, _ := loadConversation(cust.ID)
	conv.State = "HUMAN_SUPPORT"
	_ = conv.save()
	e.evolution.SendText(phone,
		emWave+" I'll connect you with the restaurant team.\nSomeone from Orange Cheese Pizza will respond shortly.")
}

const emWarning = "\u26A0\uFE0F"
