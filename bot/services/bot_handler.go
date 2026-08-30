package services

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"time"

	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
)

type StateType string

const (
	StateStart             StateType = "START"
	StateMainMenu          StateType = "MAIN_MENU"
	StateBrowsingMenu      StateType = "BROWSING_MENU"
	StateSelectingItem     StateType = "SELECTING_ITEM"
	StateCustomizingItem   StateType = "CUSTOMIZING_ITEM"
	StateCart              StateType = "CART"
	StateDeliveryType      StateType = "DELIVERY_TYPE"
	StateCustomerName      StateType = "CUSTOMER_NAME"
	StateDeliveryAddress   StateType = "DELIVERY_ADDRESS"
	StateLandmark          StateType = "LANDMARK"
	StatePaymentMethod     StateType = "PAYMENT_METHOD"
	StateOrderConfirmation StateType = "ORDER_CONFIRMATION"
	StateOrderPlaced       StateType = "ORDER_PLACED"
	StateHumanSupport      StateType = "HUMAN_SUPPORT"
	StateRestaurantInfo    StateType = "RESTAURANT_INFO"
	StateOpeningHours      StateType = "OPENING_HOURS"
	StateLocation          StateType = "LOCATION"
)

type BotHandler struct {
	evolutionClient         *EvolutionClient
	menuService             *MenuService
	cartService             *CartService
	orderService            *OrderService
	stateService            *CustomerStateService
	restaurantConfigService *RestaurantConfigService
	config                  *config.Config
}

func NewBotHandler(
	evolutionClient *EvolutionClient,
	menuService *MenuService,
	cartService *CartService,
	orderService *OrderService,
	stateService *CustomerStateService,
	restaurantConfigService *RestaurantConfigService,
	config *config.Config,
) *BotHandler {
	return &BotHandler{
		evolutionClient:         evolutionClient,
		menuService:             menuService,
		cartService:             cartService,
		orderService:            orderService,
		stateService:            stateService,
		restaurantConfigService: restaurantConfigService,
		config:                  config,
	}
}

func (h *BotHandler) ProcessMessage(phone, text, messageID string) error {
	// Check for duplicate message
	if h.isDuplicateMessage(messageID) {
		return nil
	}
	h.markMessageProcessed(messageID)

	// Get or create customer state
	state, err := h.stateService.GetState(phone)
	if err != nil {
		return err
	}

	// Parse context
	var context map[string]interface{}
	json.Unmarshal([]byte(state.Context), &context)

	// Normalize text
	text = strings.TrimSpace(strings.ToLower(text))

	// Handle commands
	if h.isCommand(text, "cancel", "restart", "clear") {
		return h.handleRestart(phone)
	}

	if h.isCommand(text, "help", "support", "human", "agent") {
		return h.handleHumanSupport(phone, state)
	}

	if h.isCommand(text, "menu") {
		return h.handleShowCategories(phone, state)
	}

	if h.isCommand(text, "cart", "my cart") {
		return h.handleShowCart(phone, state)
	}

	if h.isCommand(text, "checkout", "order") {
		return h.handleCheckout(phone, state)
	}

	if h.isCommand(text, "location", "address", "where") {
		return h.handleLocation(phone, state)
	}

	if h.isCommand(text, "hours", "timing", "open") {
		return h.handleOpeningHours(phone, state)
	}

	if h.isCommand(text, "hi", "hello", "hey", "start", "0", "9") {
		return h.handleWelcome(phone, state)
	}

	// Handle based on current state
	switch StateType(state.State) {
	case StateStart:
		return h.handleWelcome(phone, state)
	case StateMainMenu:
		return h.handleMainMenu(phone, state, text)
	case StateBrowsingMenu:
		return h.handleBrowsingMenu(phone, state, text, context)
	case StateSelectingItem:
		return h.handleSelectingItem(phone, state, text, context)
	case StateCustomizingItem:
		return h.handleCustomizingItem(phone, state, text, context)
	case StateCart:
		return h.handleCart(phone, state, text, context)
	case StateDeliveryType:
		return h.handleDeliveryType(phone, state, text, context)
	case StateCustomerName:
		return h.handleCustomerName(phone, state, text, context)
	case StateDeliveryAddress:
		return h.handleDeliveryAddress(phone, state, text, context)
	case StateLandmark:
		return h.handleLandmark(phone, state, text, context)
	case StatePaymentMethod:
		return h.handlePaymentMethod(phone, state, text, context)
	case StateOrderConfirmation:
		return h.handleOrderConfirmation(phone, state, text, context)
	case StateHumanSupport:
		return h.handleHumanSupport(phone, state)
	default:
		return h.handleWelcome(phone, state)
	}
}

func (h *BotHandler) isCommand(text string, commands ...string) bool {
	for _, cmd := range commands {
		if text == cmd {
			return true
		}
	}
	return false
}

func (h *BotHandler) isDuplicateMessage(messageID string) bool {
	var exists bool
	err := database.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM processed_messages WHERE message_id = $1)`, messageID).Scan(&exists)
	return err == nil && exists
}

func (h *BotHandler) markMessageProcessed(messageID string) {
	database.DB.Exec(`INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING`, messageID)
}

func (h *BotHandler) handleWelcome(phone string, state *models.CustomerState) error {
	h.stateService.UpdateState(phone, string(StateMainMenu), map[string]interface{}{})

	welcomeText := fmt.Sprintf("Welcome to %s! 🍕\n\nHow can I help you today?", h.config.RestaurantName)

	buttons := []Button{
		{Type: "reply", DisplayText: "🍕 Order Now", ID: "order_now"},
		{Type: "reply", DisplayText: "📋 View Menu", ID: "view_menu"},
		{Type: "reply", DisplayText: "🛒 My Cart", ID: "my_cart"},
		{Type: "reply", DisplayText: "🏪 Restaurant Info", ID: "restaurant_info"},
		{Type: "reply", DisplayText: "💬 Talk to Us", ID: "talk_to_us"},
	}

	return h.evolutionClient.SendButton(phone, h.config.RestaurantName, welcomeText, "Orange Cheese Pizza", buttons)
}

func (h *BotHandler) handleMainMenu(phone string, state *models.CustomerState, text string) error {
	switch text {
	case "order_now", "1":
		return h.handleShowCategories(phone, state)
	case "view_menu", "2":
		return h.handleShowCategories(phone, state)
	case "my_cart", "3":
		return h.handleShowCart(phone, state)
	case "restaurant_info", "4":
		return h.handleRestaurantInfo(phone, state)
	case "talk_to_us", "5":
		return h.handleHumanSupport(phone, state)
	default:
		// Try to parse as number
		if num := parseNumber(text); num >= 1 && num <= 5 {
			return h.handleMainMenu(phone, state, fmt.Sprintf("%d", num))
		}
		return h.handleWelcome(phone, state)
	}
}

func (h *BotHandler) handleShowCategories(phone string, state *models.CustomerState) error {
	categories, err := h.menuService.GetCategories()
	if err != nil {
		return err
	}

	h.stateService.UpdateState(phone, string(StateBrowsingMenu), map[string]interface{}{})

	var rows []Row
	for _, cat := range categories {
		rows = append(rows, Row{
			Title:       cat.Name,
			Description: cat.Description,
			RowID:       fmt.Sprintf("cat_%d", cat.ID),
		})
	}

	sections := []Section{
		{Title: "Categories", Rows: rows},
	}

	return h.evolutionClient.SendList(
		phone,
		"📋 Menu Categories",
		"Select a category to browse:",
		"View Menu",
		"Orange Cheese Pizza",
		sections,
	)
}

func (h *BotHandler) handleBrowsingMenu(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	// Handle list selection
	if strings.HasPrefix(text, "cat_") {
		categoryID := parseNumber(strings.TrimPrefix(text, "cat_"))
		if categoryID > 0 {
			return h.handleShowCategoryItems(phone, state, categoryID)
		}
	}
	return h.handleShowCategories(phone, state)
}

func (h *BotHandler) handleShowCategoryItems(phone string, state *models.CustomerState, categoryID int) error {
	items, err := h.menuService.GetItemsByCategory(categoryID)
	if err != nil {
		return err
	}

	category, _ := h.menuService.GetCategoryByID(categoryID)
	categoryName := "Items"
	if category != nil {
		categoryName = category.Name
	}

	h.stateService.UpdateState(phone, string(StateSelectingItem), map[string]interface{}{
		"category_id": categoryID,
	})

	var rows []Row
	for _, item := range items {
		rows = append(rows, Row{
			Title:       fmt.Sprintf("%s - ₹%.2f", item.Name, item.Price),
			Description: item.Description,
			RowID:       fmt.Sprintf("item_%d", item.ID),
		})
	}

	sections := []Section{
		{Title: categoryName, Rows: rows},
	}

	return h.evolutionClient.SendList(
		phone,
		fmt.Sprintf("🍕 %s", categoryName),
		"Select an item to add to cart:",
		"Choose Item",
		"Orange Cheese Pizza",
		sections,
	)
}

func (h *BotHandler) handleSelectingItem(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	if strings.HasPrefix(text, "item_") {
		itemID := parseNumber(strings.TrimPrefix(text, "item_"))
		if itemID > 0 {
			return h.handleShowItemDetails(phone, state, itemID, context)
		}
	}
	return h.handleShowCategories(phone, state)
}

func (h *BotHandler) handleShowItemDetails(phone string, state *models.CustomerState, itemID int, context map[string]interface{}) error {
	item, err := h.menuService.GetItemByID(itemID)
	if err != nil {
		return err
	}
	if item == nil {
		return h.handleShowCategories(phone, state)
	}

	h.stateService.UpdateState(phone, string(StateCustomizingItem), map[string]interface{}{
		"item_id":  itemID,
		"quantity": 1,
	})

	// Check if item has options
	if len(item.Options) > 0 {
		// Show options
		var rows []Row
		for _, opt := range item.Options {
			rows = append(rows, Row{
				Title:       fmt.Sprintf("%s (₹%.2f)", opt.Name, opt.PriceDelta),
				Description: fmt.Sprintf("Type: %s", opt.OptionType),
				RowID:       fmt.Sprintf("opt_%d", opt.ID),
			})
		}

		sections := []Section{
			{Title: "Customize Your Pizza", Rows: rows},
		}

		return h.evolutionClient.SendList(
			phone,
			fmt.Sprintf("🍕 %s - ₹%.2f", item.Name, item.Price),
			item.Description,
			"Select Options",
			"Orange Cheese Pizza",
			sections,
		)
	}

	// No options, show quantity selector
	return h.handleShowQuantitySelector(phone, state, item, context)
}

func (h *BotHandler) handleCustomizingItem(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	if strings.HasPrefix(text, "opt_") {
		optionID := parseNumber(strings.TrimPrefix(text, "opt_"))
		if optionID > 0 {
			// Add option to context
			selectedOptions := getContextMap(context, "selected_options")
			selectedOptions[fmt.Sprintf("%d", optionID)] = true
			context["selected_options"] = selectedOptions
			h.stateService.UpdateContext(phone, context)
			return h.handleShowQuantitySelector(phone, state, nil, context)
		}
	}
	return h.handleShowCategories(phone, state)
}

func (h *BotHandler) handleShowQuantitySelector(phone string, state *models.CustomerState, item *models.MenuItem, context map[string]interface{}) error {
	var currentItem *models.MenuItem
	var itemID int

	if item != nil {
		currentItem = item
		itemID = item.ID
	} else {
		// Get item ID from context
		itemID = getContextInt(context, "item_id")
		if itemID == 0 {
			return h.handleShowCategories(phone, state)
		}
		var err error
		currentItem, err = h.menuService.GetItemByID(itemID)
		if err != nil || currentItem == nil {
			return h.handleShowCategories(phone, state)
		}
	}

	quantity := getContextInt(context, "quantity")
	if quantity == 0 {
		quantity = 1
	}

	// Build quantity buttons
	buttons := []Button{}
	for i := 1; i <= 5; i++ {
		btn := Button{
			Type:        "reply",
			DisplayText: fmt.Sprintf("%d", i),
			ID:          fmt.Sprintf("qty_%d", i),
		}
		buttons = append(buttons, btn)
	}
	// Add more button
	buttons = append(buttons, Button{Type: "reply", DisplayText: "More", ID: "qty_more"})

	// Add selected options to context
	selectedOpts := getContextMap(context, "selected_options")
	optionsText := ""
	if len(selectedOpts) > 0 {
		optionsText = "\n\nSelected options: "
		for optID := range selectedOpts {
			if opt, _ := h.menuService.GetOptionsByItemID(itemID); opt != nil {
				for _, o := range opt {
					if fmt.Sprintf("%d", o.ID) == optID {
						optionsText += fmt.Sprintf("%s, ", o.Name)
					}
				}
			}
		}
		optionsText = strings.TrimSuffix(optionsText, ", ")
	}

	text := fmt.Sprintf("%s - ₹%.2f%s\n\nHow many would you like?", currentItem.Name, currentItem.Price, optionsText)

	return h.evolutionClient.SendButton(phone, "Select Quantity", text, "Orange Cheese Pizza", buttons)
}

func (h *BotHandler) handleCart(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	switch text {
	case "view_cart", "cart":
		return h.handleShowCart(phone, state)
	case "continue_ordering", "continue":
		return h.handleShowCategories(phone, state)
	case "checkout":
		return h.handleCheckout(phone, state)
	case "clear_cart", "clear":
		return h.handleClearCart(phone, state)
	default:
		// Check for quantity changes or remove
		if strings.HasPrefix(text, "qty_") {
			// This shouldn't happen in cart state
		}
		return h.handleShowCart(phone, state)
	}
}

func (h *BotHandler) handleShowCart(phone string, state *models.CustomerState) error {
	items, err := h.cartService.GetCart(phone)
	if err != nil {
		return err
	}

	total, _ := h.cartService.GetCartTotal(phone)

	if len(items) == 0 {
		h.stateService.UpdateState(phone, string(StateMainMenu), map[string]interface{}{})
		return h.evolutionClient.SendText(phone, "Your cart is empty! 🛒\n\nWould you like to order something?")
	}

	h.stateService.UpdateState(phone, string(StateCart), map[string]interface{}{})

	var cartText strings.Builder
	cartText.WriteString("🛒 *Your Cart*\n\n")

	for i, item := range items {
		opts := ""
		if item.Options != "" {
			var options map[string]interface{}
			json.Unmarshal([]byte(item.Options), &options)
			if len(options) > 0 {
				optNames := []string{}
				for k := range options {
					if opt, _ := h.menuService.GetOptionsByItemID(item.MenuItemID); opt != nil {
						for _, o := range opt {
							if fmt.Sprintf("%d", o.ID) == k {
								optNames = append(optNames, o.Name)
							}
						}
					}
				}
				opts = " (" + strings.Join(optNames, ", ") + ")"
			}
		}
		cartText.WriteString(fmt.Sprintf("%d. %s x%d%s - ₹%.2f\n", i+1, item.MenuItem.Name, item.Quantity, opts, item.Subtotal))
	}

	cartText.WriteString(fmt.Sprintf("\n*Total: ₹%.2f*", total))

	// Add buttons
	buttons := []Button{
		{Type: "reply", DisplayText: "🛒 View Cart", ID: "view_cart"},
		{Type: "reply", DisplayText: "➕ Continue Ordering", ID: "continue_ordering"},
		{Type: "reply", DisplayText: "✅ Checkout", ID: "checkout"},
		{Type: "reply", DisplayText: "🗑️ Clear Cart", ID: "clear_cart"},
	}

	return h.evolutionClient.SendButton(phone, "Your Cart", cartText.String(), "Orange Cheese Pizza", buttons)
}

func (h *BotHandler) handleClearCart(phone string, state *models.CustomerState) error {
	h.cartService.ClearCart(phone)
	h.stateService.UpdateState(phone, string(StateMainMenu), map[string]interface{}{})
	return h.evolutionClient.SendText(phone, "Cart cleared! 🗑️\n\nWould you like to start a new order?")
}

func (h *BotHandler) handleCheckout(phone string, state *models.CustomerState) error {
	items, err := h.cartService.GetCart(phone)
	if err != nil {
		return err
	}

	if len(items) == 0 {
		return h.evolutionClient.SendText(phone, "Your cart is empty! Add items before checkout.")
	}

	total, _ := h.cartService.GetCartTotal(phone)
	if total < h.config.MinOrderAmount {
		return h.evolutionClient.SendText(phone, fmt.Sprintf("Minimum order amount is ₹%.2f. Please add more items.", h.config.MinOrderAmount))
	}

	h.stateService.UpdateState(phone, string(StateDeliveryType), map[string]interface{}{})

	buttons := []Button{
		{Type: "reply", DisplayText: "🚚 Delivery", ID: "delivery"},
		{Type: "reply", DisplayText: "🏪 Pickup", ID: "pickup"},
	}

	return h.evolutionClient.SendButton(phone, "Delivery or Pickup?", "How would you like to receive your order?", "Orange Cheese Pizza", buttons)
}

func (h *BotHandler) handleDeliveryType(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	if text == "delivery" || text == "1" {
		context["order_type"] = "delivery"
		h.stateService.UpdateContext(phone, context)
		h.stateService.UpdateState(phone, string(StateCustomerName), context)
		return h.evolutionClient.SendText(phone, "Please enter your name for the delivery:")
	} else if text == "pickup" || text == "2" {
		context["order_type"] = "pickup"
		h.stateService.UpdateContext(phone, context)
		h.stateService.UpdateState(phone, string(StateCustomerName), context)
		return h.evolutionClient.SendText(phone, "Please enter your name for the pickup:")
	}
	return h.handleCheckout(phone, state)
}

func (h *BotHandler) handleCustomerName(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	if len(strings.TrimSpace(text)) < 2 {
		return h.evolutionClient.SendText(phone, "Please enter a valid name:")
	}

	context["customer_name"] = strings.TrimSpace(text)
	h.stateService.UpdateContext(phone, context)

	orderType := getContextString(context, "order_type")
	if orderType == "delivery" {
		h.stateService.UpdateState(phone, string(StateDeliveryAddress), context)
		return h.evolutionClient.SendText(phone, "Please enter your complete delivery address:")
	} else {
		h.stateService.UpdateState(phone, string(StatePaymentMethod), context)
		return h.handleShowPaymentMethods(phone, state, context)
	}
}

func (h *BotHandler) handleDeliveryAddress(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	if len(strings.TrimSpace(text)) < 5 {
		return h.evolutionClient.SendText(phone, "Please enter a valid address:")
	}

	context["address"] = strings.TrimSpace(text)
	h.stateService.UpdateContext(phone, context)
	h.stateService.UpdateState(phone, string(StateLandmark), context)

	return h.evolutionClient.SendText(phone, "Please provide a nearby landmark (optional, type 'skip' to skip):")
}

func (h *BotHandler) handleLandmark(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	text = strings.TrimSpace(text)
	if text != "skip" && text != "" {
		context["landmark"] = text
	} else {
		context["landmark"] = ""
	}
	h.stateService.UpdateContext(phone, context)
	h.stateService.UpdateState(phone, string(StatePaymentMethod), context)

	return h.handleShowPaymentMethods(phone, state, context)
}

func (h *BotHandler) handleShowPaymentMethods(phone string, state *models.CustomerState, context map[string]interface{}) error {
	buttons := []Button{
		{Type: "reply", DisplayText: "💵 Cash on Delivery", ID: "cash"},
		{Type: "reply", DisplayText: "📱 UPI", ID: "upi"},
		{Type: "reply", DisplayText: "💳 Online Payment", ID: "online"},
	}

	return h.evolutionClient.SendButton(phone, "Payment Method", "How would you like to pay?", "Orange Cheese Pizza", buttons)
}

func (h *BotHandler) handlePaymentMethod(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	paymentMethod := ""
	switch text {
	case "cash", "1":
		paymentMethod = "cash"
	case "upi", "2":
		paymentMethod = "upi"
	case "online", "3":
		paymentMethod = "online"
	default:
		return h.handleShowPaymentMethods(phone, state, context)
	}

	context["payment_method"] = paymentMethod
	h.stateService.UpdateContext(phone, context)
	h.stateService.UpdateState(phone, string(StateOrderConfirmation), context)

	return h.handleShowOrderSummary(phone, context)
}

func (h *BotHandler) handleShowOrderSummary(phone string, context map[string]interface{}) error {
	items, _ := h.cartService.GetCart(phone)
	subtotal, _ := h.cartService.GetCartTotal(phone)
	deliveryFee := h.config.DeliveryFee
	if getContextString(context, "order_type") == "pickup" {
		deliveryFee = 0
	}
	total := subtotal + deliveryFee

	var summary strings.Builder
	summary.WriteString("📋 *Order Summary*\n\n")

	summary.WriteString(fmt.Sprintf("*Customer:* %s\n", getContextString(context, "customer_name")))
	summary.WriteString(fmt.Sprintf("*Type:* %s\n", strings.Title(getContextString(context, "order_type"))))

	if getContextString(context, "order_type") == "delivery" {
		summary.WriteString(fmt.Sprintf("*Address:* %s\n", getContextString(context, "address")))
		if landmark := getContextString(context, "landmark"); landmark != "" {
			summary.WriteString(fmt.Sprintf("*Landmark:* %s\n", landmark))
		}
	}

	summary.WriteString(fmt.Sprintf("*Payment:* %s\n\n", strings.Title(getContextString(context, "payment_method"))))

	summary.WriteString("*Items:*\n")
	for i, item := range items {
		opts := ""
		if item.Options != "" {
			var options map[string]interface{}
			json.Unmarshal([]byte(item.Options), &options)
			if len(options) > 0 {
				optNames := []string{}
				for k := range options {
					if opt, _ := h.menuService.GetOptionsByItemID(item.MenuItemID); opt != nil {
						for _, o := range opt {
							if fmt.Sprintf("%d", o.ID) == k {
								optNames = append(optNames, o.Name)
							}
						}
					}
				}
				opts = " (" + strings.Join(optNames, ", ") + ")"
			}
		}
		summary.WriteString(fmt.Sprintf("%d. %s x%d%s - ₹%.2f\n", i+1, item.MenuItem.Name, item.Quantity, opts, item.Subtotal))
	}

	summary.WriteString(fmt.Sprintf("\n*Subtotal: ₹%.2f*", subtotal))
	if deliveryFee > 0 {
		summary.WriteString(fmt.Sprintf("\n*Delivery: ₹%.2f*", deliveryFee))
	}
	summary.WriteString(fmt.Sprintf("\n*Total: ₹%.2f*", total))

	buttons := []Button{
		{Type: "reply", DisplayText: "✅ Confirm Order", ID: "confirm_order"},
		{Type: "reply", DisplayText: "✏️ Edit Order", ID: "edit_order"},
		{Type: "reply", DisplayText: "❌ Cancel", ID: "cancel_order"},
	}

	return h.evolutionClient.SendButton(phone, "Order Summary", summary.String(), "Orange Cheese Pizza", buttons)
}

func (h *BotHandler) handleOrderConfirmation(phone string, state *models.CustomerState, text string, context map[string]interface{}) error {
	switch text {
	case "confirm_order":
		return h.handlePlaceOrder(phone, context)
	case "edit_order":
		return h.handleCheckout(phone, state)
	case "cancel_order", "cancel":
		h.cartService.ClearCart(phone)
		h.stateService.UpdateState(phone, string(StateMainMenu), map[string]interface{}{})
		return h.evolutionClient.SendText(phone, "Order cancelled. Let me know if you'd like to order something else!")
	}
	return h.handleShowOrderSummary(phone, context)
}

func (h *BotHandler) handlePlaceOrder(phone string, context map[string]interface{}) error {
	items, _ := h.cartService.GetCart(phone)
	subtotal, _ := h.cartService.GetCartTotal(phone)
	deliveryFee := h.config.DeliveryFee
	if getContextString(context, "order_type") == "pickup" {
		deliveryFee = 0
	}
	total := subtotal + deliveryFee

	// Generate order number
	orderNumber := generateOrderNumber()

	order := &models.Order{
		OrderNumber:   orderNumber,
		CustomerName:  getContextString(context, "customer_name"),
		CustomerPhone: phone,
		OrderType:     getContextString(context, "order_type"),
		Address:       getContextString(context, "address"),
		Landmark:      getContextString(context, "landmark"),
		PaymentMethod: getContextString(context, "payment_method"),
		Subtotal:      subtotal,
		DeliveryFee:   deliveryFee,
		Discount:      0,
		Total:         total,
		Status:        "confirmed",
		Items:         make([]models.OrderItem, len(items)),
	}

	for i, item := range items {
		var options map[string]interface{}
		json.Unmarshal([]byte(item.Options), &options)
		optionsJSON, _ := json.Marshal(options)
		order.Items[i] = models.OrderItem{
			MenuItemID: item.MenuItemID,
			Name:       item.MenuItem.Name,
			Quantity:   item.Quantity,
			UnitPrice:  item.UnitPrice,
			Options:    string(optionsJSON),
			Subtotal:   item.Subtotal,
		}
	}

	err := h.orderService.CreateOrder(order)
	if err != nil {
		return h.evolutionClient.SendText(phone, "Failed to place order. Please try again.")
	}

	// Clear cart
	h.cartService.ClearCart(phone)
	h.stateService.UpdateState(phone, string(StateOrderPlaced), map[string]interface{}{
		"order_id":     order.ID,
		"order_number": order.OrderNumber,
	})

	confirmText := fmt.Sprintf("✅ *Order Confirmed!*\n\nYour order *#%s* has been placed successfully.\n\n", orderNumber)
	confirmText += fmt.Sprintf("*Estimated Time:* 30-45 minutes\n")
	confirmText += fmt.Sprintf("*Total: ₹%.2f*\n\n", total)

	if order.OrderType == "delivery" {
		confirmText += "Our delivery partner will contact you soon. 🚚"
	} else {
		confirmText += "Your order will be ready for pickup soon. 🏪"
	}

	if order.PaymentMethod == "online" {
		confirmText += "\n\n💳 *Payment pending* - Please complete payment to confirm your order."
	}

	return h.evolutionClient.SendText(phone, confirmText)
}

func (h *BotHandler) handleRestaurantInfo(phone string, state *models.CustomerState) error {
	config, _ := h.restaurantConfigService.GetConfig()
	h.stateService.UpdateState(phone, string(StateRestaurantInfo), map[string]interface{}{})

	var info strings.Builder
	info.WriteString(fmt.Sprintf("🏪 *%s*\n\n", h.config.RestaurantName))

	if config != nil {
		if config.Phone != "" {
			info.WriteString(fmt.Sprintf("📞 Phone: %s\n", config.Phone))
		}
		if config.Address != "" {
			info.WriteString(fmt.Sprintf("📍 Address: %s\n", config.Address))
		}
		if config.MapURL != "" {
			info.WriteString(fmt.Sprintf("🗺️ Map: %s\n", config.MapURL))
		}
	}

	info.WriteString("\nUse the buttons below for more info:")

	buttons := []Button{
		{Type: "reply", DisplayText: "🕐 Opening Hours", ID: "opening_hours"},
		{Type: "reply", DisplayText: "📍 Location", ID: "location"},
		{Type: "reply", DisplayText: "🔙 Back to Menu", ID: "main_menu"},
	}

	return h.evolutionClient.SendButton(phone, "Restaurant Info", info.String(), "Orange Cheese Pizza", buttons)
}

func (h *BotHandler) handleOpeningHours(phone string, state *models.CustomerState) error {
	config, _ := h.restaurantConfigService.GetConfig()
	h.stateService.UpdateState(phone, string(StateOpeningHours), map[string]interface{}{})

	var hours strings.Builder
	hours.WriteString("🕐 *Opening Hours*\n\n")

	if config != nil && config.OpeningHours != "" {
		var openingHours map[string]map[string]string
		json.Unmarshal([]byte(config.OpeningHours), &openingHours)
		days := []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
		for _, day := range days {
			if h, ok := openingHours[day]; ok {
				hours.WriteString(fmt.Sprintf("%s: %s - %s\n", strings.Title(day), h["open"], h["close"]))
			}
		}
	} else {
		hours.WriteString("Mon-Sun: 11:00 AM - 11:00 PM\n")
	}

	buttons := []Button{
		{Type: "reply", DisplayText: "🔙 Back", ID: "restaurant_info"},
		{Type: "reply", DisplayText: "🏠 Main Menu", ID: "main_menu"},
	}

	return h.evolutionClient.SendButton(phone, "Opening Hours", hours.String(), "Orange Cheese Pizza", buttons)
}

func (h *BotHandler) handleLocation(phone string, state *models.CustomerState) error {
	config, _ := h.restaurantConfigService.GetConfig()
	h.stateService.UpdateState(phone, string(StateLocation), map[string]interface{}{})

	var location strings.Builder
	location.WriteString("📍 *Our Location*\n\n")

	if config != nil {
		if config.Address != "" {
			location.WriteString(fmt.Sprintf("%s\n", config.Address))
		}
		if config.MapURL != "" {
			location.WriteString(fmt.Sprintf("\n🗺️ View on Map: %s\n", config.MapURL))
		}
	}

	// Send location if coordinates available
	if config != nil && config.MapURL != "" {
		// Try to extract lat/lng from map URL or use defaults
		h.evolutionClient.SendLocation(phone, h.config.RestaurantName, config.Address, 0, 0)
	}

	buttons := []Button{
		{Type: "reply", DisplayText: "🔙 Back", ID: "restaurant_info"},
		{Type: "reply", DisplayText: "🏠 Main Menu", ID: "main_menu"},
	}

	return h.evolutionClient.SendButton(phone, "Location", location.String(), "Orange Cheese Pizza", buttons)
}

func (h *BotHandler) handleHumanSupport(phone string, state *models.CustomerState) error {
	h.stateService.UpdateState(phone, string(StateHumanSupport), map[string]interface{}{})

	config, _ := h.restaurantConfigService.GetConfig()
	supportMsg := "Sure! A team member will assist you shortly. 🙋‍♂️\n\n"
	if config != nil && config.SupportPhone != "" {
		supportMsg += fmt.Sprintf("You can also call us at: %s", config.SupportPhone)
	} else {
		supportMsg += "We'll get back to you soon."
	}

	return h.evolutionClient.SendText(phone, supportMsg)
}

func (h *BotHandler) handleRestart(phone string) error {
	h.cartService.ClearCart(phone)
	h.stateService.UpdateState(phone, string(StateStart), map[string]interface{}{})
	return h.handleWelcome(phone, &models.CustomerState{Phone: phone, State: string(StateStart)})
}

func parseNumber(text string) int {
	var num int
	fmt.Sscanf(text, "%d", &num)
	return num
}

func getContextString(context map[string]interface{}, key string) string {
	if val, ok := context[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return ""
}

func getContextInt(context map[string]interface{}, key string) int {
	if val, ok := context[key]; ok {
		switch v := val.(type) {
		case float64:
			return int(v)
		case int:
			return v
		case string:
			var num int
			fmt.Sscanf(v, "%d", &num)
			return num
		}
	}
	return 0
}

func getContextMap(context map[string]interface{}, key string) map[string]interface{} {
	if val, ok := context[key]; ok {
		if m, ok := val.(map[string]interface{}); ok {
			return m
		}
	}
	return make(map[string]interface{})
}

func generateOrderNumber() string {
	// Use timestamp + random suffix to avoid collisions
	n, _ := rand.Int(rand.Reader, big.NewInt(9999))
	return fmt.Sprintf("OCP-%d%04d", time.Now().Unix()%100000, n.Int64())
}
