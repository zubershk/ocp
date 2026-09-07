package services

// ============================================================
// Canonical order vocabulary (Phase 2, PR 4).
//
// One order system, one source of truth: every channel (POS,
// website, WhatsApp, QR) writes to the same orders table using
// the same type vocabulary. Never invent channel-specific order
// tables or type strings.
// ============================================================

// Order types (orders.order_type CHECK constraint).
const (
	OrderTypeDineIn   = "dine_in"
	OrderTypeTakeaway = "takeaway"
	OrderTypeDelivery = "delivery"
	OrderTypeOnline   = "online"
	OrderTypeWhatsApp = "whatsapp"
)

// Order sources (orders.source CHECK constraint).
const (
	SourcePOS      = "pos"
	SourceWebsite  = "website"
	SourceWhatsApp = "whatsapp"
	SourceQR       = "qr"
)

// NormalizeOrderType maps legacy values into the canonical set.
// The only legacy value in the wild is 'pickup' (pre-Phase-2
// website/checkout vocabulary); it maps to 'takeaway'.
func NormalizeOrderType(t string) string {
	if t == "pickup" {
		return OrderTypeTakeaway
	}
	return t
}

// ValidOrderType reports whether t is in the canonical set.
func ValidOrderType(t string) bool {
	switch t {
	case OrderTypeDineIn, OrderTypeTakeaway, OrderTypeDelivery,
		OrderTypeOnline, OrderTypeWhatsApp:
		return true
	}
	return false
}

// ValidOrderSource reports whether s is in the canonical set.
func ValidOrderSource(s string) bool {
	switch s {
	case SourcePOS, SourceWebsite, SourceWhatsApp, SourceQR:
		return true
	}
	return false
}
