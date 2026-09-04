package services

// ------------------------------------------------------------------
// Compiled-in default messages (fallback when DB row is missing).
// These match the migration seed data exactly.
// ------------------------------------------------------------------

func defaultMessages() map[string]string {
	return map[string]string{
		// GREETING
		"welcome":              emPizza + " {{.RestaurantName}}\n\nWelcome! What would you like to do?",
		"welcome_back":         emPizza + " Welcome back, {{.Name}}! " + emWave + "\n\nWhat would you like to do?",
		"welcome_back_with_cart": emWave + " Welcome back!\n\nYou have {{.ItemCount}} item(s) in your cart.\n",
		"welcome_back_in_flow": emWave + " Welcome back!\n\nYou were in the middle of: {{.State}}\n\nContinue below, or type 'cancel'.",
		"help":                 emRobot + " I can help you with:\n\n" + emPizza + " Ordering\n" + emCart + " Cart\n" + emPackage + " Order tracking\n" + emUser + " Profile\n" + emPin + " Restaurant location\n" + emTel + " Human support\n\nTap a button above, or type: menu - cart - status - orders",
		"welcome_footer":       "We're ready when you are.",

		// ORDERING
		"category_title":          emPizza + " What would you like to order?",
		"category_empty":          "Menu is temporarily unavailable. Please try again shortly.",
		"item_title":              emPizza + " {{.CategoryName}} - choose your item",
		"item_empty":              "No items available in that category right now. Type 'menu' to browse.",
		"item_unavailable":        "That item is unavailable right now. Type 'menu' to browse.",
		"item_became_unavailable": "That item became unavailable. Type 'menu' to pick another.",
		"size_title":              "Choose your size",
		"crust_title":             emBread + " Choose your crust",
		"quantity_title":          "How many would you like?",
		"quantity_invalid":        "Please send a number between 1 and 20, or type 'cancel'.",
		"quantity_more_prompt":    "How many would you like? Send a number (1-20).",
		"item_added":              emCheck + " Added to your cart!",
		"selection_summary":       "*Your selection:*\n\n" + emPizza + " {{.ItemName}}\n{{.Size}}\n{{.CrustName}}\nRs.{{.Price}}",

		// CART
		"cart_empty":          "Your cart is empty. " + emCart + "\nType 'menu' to start an order!",
		"cart_title":          emCart + " Your Cart",
		"cart_item_added":     "{{.ItemName}}\n{{.Size}}\n{{.CrustName}}\nQty: {{.Quantity}}\nRs.{{.Total}}",
		"cart_clear_confirm":  emTrash + " Clear your cart?",
		"cart_clear_body":     "This removes all items.",
		"cart_cleared":        emBroom + " Cart cleared.\nType 'menu' to start fresh!",
		"cart_cleared_alt":    emBroom + " Cart cleared.\nType 'menu' to start a new order!",
		"cart_line_gone":      "That cart line no longer exists.",
		"cart_item_empty":     "Your cart is empty. " + emCart + " Type 'menu' to add items.",
		"cart_item_first":     "Your cart is empty. " + emCart + " Type 'menu' first.",
		"cart_done":           "Done. Type 'cart' to see your cart.",
		"cart_empty_checkout": "Cart is empty - type 'menu' to start over.",
		"cart_empty_place":    "Cart is empty - nothing placed. Type 'menu'.",

		// CHECKOUT
		"fulfillment_title":      "How would you like to receive your order?",
		"fulfillment_body":       "Choose one:",
		"pickup_info":            emStore + " Pickup from:\n{{.RestaurantName}}\n{{.Address}}",
		"pickup_name_prompt":     "What's your name?",
		"name_prompt":            "What name should we use for your order?",
		"name_greeting_delivery": "Nice to meet you, {{.Name}}!\n\nWhat's your delivery address?",
		"name_greeting_pickup":   "Thanks, {{.Name}}!",
		"address_prompt":         "Any landmark nearby? Type it, or type 'skip'.",
		"address_too_short":      "That address looks too short. Please enter your complete delivery address.",
		"address_confirm_saved":  emPin + " Saved address",
		"address_saved_body":     "We have your saved address:\n\n{{.Address}}\n\nUse this address?",
		"address_new_prompt":     "Please send your delivery address first, then we'll continue.",
		"payment_title":          emCard + " Choose payment method:",
		"payment_body":           "Cash on delivery available.",
		"payment_how":            "How would you like to pay?",
		"name_invalid":           "Please enter a valid name (2-60 characters).",

		// ORDER CONFIRMATION
		"order_summary_title": "Ready to place your order?",
		"order_summary_body":  emPizza + " ORDER SUMMARY\n\nCustomer: {{.Name}}\nOrder type: {{.DeliveryType}}\n\nItems:\n{{.Items}}\nSubtotal: Rs.{{.Subtotal}}\nDelivery: Rs.{{.Delivery}}\nTotal: Rs.{{.Total}}\n\nPayment: {{.Payment}}\n\n{{.AddressBlock}}",
		"order_placed":        emCheck + " *ORDER PLACED!*\n\nThank you{{.ThankSuffix}}! " + emPizza + "\n\nOrder:\n*{{.OrderNumber}}*\n\nTotal:\nRs.{{.Total}}\n\nWe'll keep you updated here.",
		"order_placed_title":  emTada + " Thank you!",
		"order_failed":        "Couldn't place your order: {{.Error}}\n\nType 'cart' to review and retry.",
		"confirm_cancel":      emCross + " Order not placed - your cart is safe.",

		// ORDER STATUS
		"status_update":           emPizza + " {{.RestaurantName}}\n\nOrder: {{.OrderNumber}}\nStatus: {{.Status}}\n\n{{.Message}}",
		"status_confirmed":        "We have received your order and it will start shortly. " + emChefMan,
		"status_preparing":        "Your order is being prepared.",
		"status_ready":            "Your order is ready!",
		"status_out_for_delivery": "Your order is on its way! " + emScooter,
		"status_delivered":        "Order completed. Thank you for ordering with us! " + emHeart,
		"status_cancelled":        "This order has been cancelled. Contact us if this was a mistake.",
		"status_default":          "Status updated.",
		"status_none":             "You have no active orders right now. " + emPizza,
		"status_no_active":        "You don't have an active order right now.",

		// NOTIFICATIONS
		"notification_new_website_order": emPizza + " {{.RestaurantName}}\nNew Website Order",
		"notification_new_wa_order":      emPizza + " {{.RestaurantName}}\nNEW WHATSAPP ORDER",
		"notification_otp":               emPizza + " {{.RestaurantName}}\n\nYour login code is *{{.Code}}*\nValid for 5 minutes. Do not share this code.\n\nIf you didn't request this, ignore this message.",
		"notification_support_request":   "*CUSTOMER REQUESTED SUPPORT*\n\nWhatsApp: {{.Phone}}\nName: {{.Name}}\nCurrent order: {{.Order}}\nCart lines: {{.CartCount}}\n\nReply to them directly on WhatsApp.",

		// PROFILE
		"profile_title":      emUser + " {{.Name}}",
		"profile_body":       "WhatsApp: {{.Phone}}\nAddress: {{.Address}}\nLandmark: {{.Landmark}}\nOrders: {{.OrderCount}}\nSpent: Rs.{{.TotalSpent}}",
		"profile_edit_name":  "Send the new name you'd like to use.",
		"profile_edit_addr":  "Send your new default delivery address.",

		// SUPPORT
		"support_customer":         emWave + " I'll connect you with the restaurant team.\nSomeone from {{.RestaurantName}} will respond shortly.",
		"support_team_notified":    "The team will reach out here.\nType 'menu' whenever you're ready.",
		"support_team_notified_menu": "The team has been notified. Type 'menu' when ready.",

		// LOCATION
		"location_title":      emPin + " {{.RestaurantName}}",
		"location_body":       "{{.Address}}\n\nTel: {{.Phone}}\nKitchen: {{.KitchenHours}}\nDelivery: {{.DeliveryHours}}",
		"location_maps_hint":  "{{.RestaurantName}} Mira Road",

		// ERRORS
		"unknown_input":     "I didn't quite understand that.\n\n{{.Options}}",
		"menu_unavailable":  "Menu is temporarily unavailable. Please try again shortly.",
		"session_expired":   "Session expired for that list - type 'menu' to browse again.",
		"nothing_to_show":   "Nothing to show. Type 'menu'.",
		"order_not_found":   "That order was not found on this account.",
		"cart_update_failed": "Couldn't update the cart. Please try again.",

		// GLOBAL COMMANDS
		"cancel_message":       emBroom + " Current flow cancelled. Your cart was kept - type 'cart' or 'menu'.",
		"restart_message":      emArrows + " Fresh start! Cart cleared.\n\n",
		"state_name":           "Please type your name, or 'cancel' to abort.",
		"state_address":        "Please type your full delivery address, or 'cancel'.",
		"state_landmark":       "Type a landmark or 'skip'.",
		"state_payment":        "Choose Cash, UPI or Online using the buttons above.",
		"state_confirmation":   "Tap 'Place Order' or 'Cancel' above, or 'cancel' to exit.",
		"state_human_support":  "The team has been notified. Type 'menu' when ready.",

		// REORDER
		"reorder_added":       emCheck + " Added {{.Count}} item(s) from {{.OrderNumber}} to your cart.",
		"reorder_unavailable": emWarning + " {{.ItemName}} is currently unavailable.",

		// ORDER HISTORY
		"history_empty": "Your first pizza awaits!",
		"history_title": emPackage + " Your recent orders",

		// STATUS VIEW
		"status_view_title":    emPackage + " {{.OrderNumber}}",
		"status_view_body":     "Status: {{.Emoji}} {{.Status}}\n\n{{.Items}}\nTotal: Rs.{{.Total}}",
		"status_order_detail":  "Status: {{.Emoji}} {{.Status}}\nPlaced: {{.Date}}\n\n{{.Items}}Total: Rs.{{.Total}}",

		// PAGER (buttonPages chrome)
		"pager_tap":  "Tap a button below:",
		"pager_more": "More " + emArrowR + " ({{.Remaining}})",
		"pager_back": emArrowL + " Start",
		"pager_page": " (page {{.Page}} of {{.Pages}})",

		// CART EDITING
		"cart_which_item": "Which item?",
		"cart_set_qty":    "Current quantity: {{.Quantity}}\nSet new quantity:",

		// MID-FLOW HINTS (wrong input while browsing)
		"state_category":    "Tap a category button above, or type 'menu'.",
		"state_item":        "Tap an item, use More to see others, or type 'menu'.",
		"state_size":        "Choose a size above, or type 'cancel'.",
		"state_crust":       "Choose a crust above, or type 'cancel'.",
		"state_quantity":    "Send a number 1-20, or type 'cancel'.",
		"state_cart":        "Tap Checkout, Change Qty or Clear Cart — or type 'menu'.",
		"state_fulfillment": "Choose Delivery or Pickup above.",
	}
}

func defaultMessage(key string) string {
	if msg, ok := defaultMessages()[key]; ok {
		return msg
	}
	return key // return the key itself as last resort
}

// defaultMessageMeta carries the admin-UI metadata (category,
// description, variable list) for every compiled-in key. Used by
// SyncDefaults so new keys appear in the dashboard with zero migrations.
type messageMeta struct {
	Category    string
	Description string
	Variables   string
}

func defaultMessageMeta() map[string]messageMeta {
	return map[string]messageMeta{
		"pager_tap":         {"ordering", "Pager body prompt", ""},
		"pager_more":        {"ordering", "Pager More button", "Remaining"},
		"pager_back":        {"ordering", "Pager back-to-start button", ""},
		"pager_page":        {"ordering", "Pager page indicator suffix", "Page,Pages"},
		"cart_which_item":   {"cart", "Cart line picker title", ""},
		"cart_set_qty":      {"cart", "Edit-line quantity prompt", "Quantity"},
		"state_category":    {"commands", "Hint when input arrives mid-category-browse", ""},
		"state_item":        {"commands", "Hint when input arrives mid-item-browse", ""},
		"state_size":        {"commands", "Hint when input arrives at size step", ""},
		"state_crust":       {"commands", "Hint when input arrives at crust step", ""},
		"state_quantity":    {"commands", "Hint when input arrives at quantity step", ""},
		"state_cart":        {"commands", "Hint when input arrives at cart step", ""},
		"state_fulfillment": {"commands", "Hint when input arrives at fulfillment step", ""},
	}
}
