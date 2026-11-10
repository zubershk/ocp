package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"

	"github.com/skip2/go-qrcode"
)

// ------------------------------------------------------------------
// POS Printer Configuration (per restaurant, stored in site_settings
// key 'printer_config' — same pattern as pos_config / offers / banners).
// Supports: none | usb | network | web | browser
// ------------------------------------------------------------------

const (
	printerConfigKey           = "printer_config"
	printerTemplateConfigKey   = "printer_template_config"

	PrinterTypeNone    = "none"
	PrinterTypeUSB     = "usb"
	PrinterTypeNetwork = "network"
	PrinterTypeBrowser = "browser"
	PrinterTypeWeb     = "web"

	DefaultTCPPort = 9100
	DefaultWidth   = 58
)

// Printer config cache (mirrors pos_config.go pattern).
var (
	printerCfgCache          = map[int]*PrinterConfig{}
	printerCfgTemplateCache  = map[int]*PrinterTemplateConfig{}
	printerCfgMu             sync.RWMutex
	printerCfgTemplateMu     sync.RWMutex
)

// PrinterConfig is the persisted per-restaurant printer settings.
type PrinterConfig struct {
	PrinterType    string `json:"printer_type"`     // none | usb | network | virtual | browser
	PrinterPort    string `json:"printer_port"`     // COM3 or 192.168.1.50
	PrinterPortNum int    `json:"printer_port_num"` // TCP port for network/virtual
	PaperWidth     int    `json:"paper_width"`      // 58 or 80 mm
	AutoPrint      bool   `json:"auto_print"`       // print on new online order
}

// DefaultPrinterConfig returns a disabled config.
func DefaultPrinterConfig() *PrinterConfig {
	return &PrinterConfig{
		PrinterType:    PrinterTypeNone,
		PrinterPort:    "",
		PrinterPortNum: DefaultTCPPort,
		PaperWidth:     DefaultWidth,
		AutoPrint:      false,
	}
}

// Validate ensures the config is sane.
func (p *PrinterConfig) Validate() error {
	switch p.PrinterType {
	case PrinterTypeNone, PrinterTypeUSB, PrinterTypeNetwork, PrinterTypeBrowser, PrinterTypeWeb:
	default:
		return fmt.Errorf("invalid printer_type %q", p.PrinterType)
	}
	if p.PrinterType == PrinterTypeUSB && p.PrinterPort == "" {
		return fmt.Errorf("printer_port required for usb")
	}
	if p.PrinterType == PrinterTypeNetwork {
		if p.PrinterPort == "" {
			return fmt.Errorf("printer_port required for network")
		}
		if p.PrinterPortNum <= 0 || p.PrinterPortNum > 65535 {
			return fmt.Errorf("printer_port_num must be between 1 and 65535")
		}
		// Validate IP address format
		if net.ParseIP(p.PrinterPort) == nil {
			return fmt.Errorf("printer_port must be a valid IP address for network printer")
		}
	}
	if p.PaperWidth != 58 && p.PaperWidth != 80 {
		return fmt.Errorf("paper_width must be 58 or 80")
	}
	if p.PrinterPortNum <= 0 || p.PrinterPortNum > 65535 {
		p.PrinterPortNum = DefaultTCPPort
	}
	return nil
}

// ------------------------------------------------------------------
// Printer Template Configuration (per restaurant, stored in site_settings
// key 'printer_template_config').
// Defines the layout and styling of printed receipts.
// ------------------------------------------------------------------

// PrinterTemplateElement represents a single line/element on a receipt.
type PrinterTemplateElement struct {
	ID          string `json:"id"`          // Unique element ID
	Type        string `json:"type"`        // "text" | "line" | "image" | "qr" | "divider" | "spacer"
	Text        string `json:"text"`        // Text content (for text type)
	Align       string `json:"align"`       // "left" | "center" | "right"
	Bold        bool   `json:"bold"`        // Bold text
	DoubleWidth bool   `json:"double_width"` // Double width text
	DoubleHeight bool  `json:"double_height"` // Double height text
	Underline   bool   `json:"underline"`   // Underline text
	Size        int    `json:"size"`        // Font size (1=small, 2=normal, 3=large)
	Value       string `json:"value"`       // Dynamic value placeholder (e.g., "{{order_number}}", "{customer_name}", "{total}")
	PaddingTop  int    `json:"padding_top"` // Space before element (lines)
	PaddingBottom int   `json:"padding_bottom"` // Space after element (lines)
	CharWidth   int    `json:"char_width"`  // Max characters per line (default based on paper width)
	// QR code specific
	QRValue string `json:"qr_value"`    // QR code content
	QRSize  int    `json:"qr_size"`     // QR code size (1-8)
	// Spacer specific
	SpacerLines int `json:"spacer_lines"` // Number of blank lines
	// Conditional display
	Condition string `json:"condition"`   // e.g., "show_if_customer", "show_if_delivery"
	Italic    bool   `json:"italic"`      // Italic text
}

// PrinterTemplateConfig is the template definition for receipt printing.
type PrinterTemplateConfig struct {
	PaperWidth int                  `json:"paper_width"`      // 58 or 80 mm
	Elements   []PrinterTemplateElement `json:"elements"`      // Ordered list of print elements
	Header     string                 `json:"header"`          // Header text (brand name)
	Footer     string                 `json:"footer"`          // Footer text
	ShowDateTime bool                `json:"show_date_time"`  // Show date/time on receipt
	ShowOrderNumber bool               `json:"show_order_number"` // Show order number
	ShowItems bool                   `json:"show_items"`      // Show item list
	ShowTotals bool                  `json:"show_totals"`     // Show totals section
	ShowPaymentMethod bool             `json:"show_payment_method"` // Show payment method
	CutPaper bool                   `json:"cut_paper"`       // Cut paper after print
}

// DefaultPrinterTemplateConfig returns default template config.
func DefaultPrinterTemplateConfig() *PrinterTemplateConfig {
	return &PrinterTemplateConfig{
		PaperWidth:       58,
		Header:           "{{brand_name}}",
		Footer:           "Thank you for your order!\nVisit us again!",
		ShowDateTime:     true,
		ShowOrderNumber:  true,
		ShowItems:        true,
		ShowTotals:       true,
		ShowPaymentMethod: true,
		CutPaper:         true,
		Elements: []PrinterTemplateElement{
			{ID: "header", Type: "text", Text: "{{brand_name}}", Align: "center", Bold: true, DoubleHeight: true, PaddingTop: 1},
			{ID: "divider1", Type: "divider", PaddingTop: 0, PaddingBottom: 0},
			{ID: "order_number", Type: "text", Text: "Order #{{order_number}}", Align: "left", PaddingTop: 0},
			{ID: "date_time", Type: "text", Text: "{{date_time}}", Align: "left", PaddingBottom: 1},
			{ID: "divider2", Type: "divider", PaddingBottom: 1},
			{ID: "items_header", Type: "text", Text: "Item           Qty  Price", Align: "left", Bold: true, PaddingBottom: 0},
			{ID: "items_divider", Type: "divider", PaddingBottom: 0},
			{ID: "items_list", Type: "text", Text: "{{items_list}}", Align: "left", PaddingBottom: 1},
			{ID: "totals_divider", Type: "divider", PaddingTop: 1, PaddingBottom: 0},
			{ID: "subtotal", Type: "text", Text: "Subtotal       {{subtotal}}", Align: "right", PaddingBottom: 0},
			{ID: "delivery_fee", Type: "text", Text: "Delivery       {{delivery_fee}}", Align: "right", PaddingBottom: 0},
			{ID: "discount", Type: "text", Text: "Discount       {{discount}}", Align: "right", PaddingBottom: 0},
			{ID: "total_divider", Type: "divider", PaddingBottom: 0},
			{ID: "total", Type: "text", Text: "Total          {{total}}", Align: "right", Bold: true, PaddingBottom: 1},
			{ID: "payment_method", Type: "text", Text: "Payment: {{payment_method}}", Align: "left", PaddingBottom: 1},
			{ID: "footer_divider", Type: "divider", PaddingTop: 1, PaddingBottom: 1},
			{ID: "footer", Type: "text", Text: "{{footer}}", Align: "center", Bold: false, PaddingBottom: 1},
			{ID: "thank_you", Type: "text", Text: "Thank you for your order!", Align: "center", Bold: false},
		},
	}
}

// GetPrinterTemplateConfig reads the printer template config from site_settings.
func GetPrinterTemplateConfig(restaurantID int) (*PrinterTemplateConfig, error) {
	rid := ResolveRestaurant(restaurantID)
	var raw []byte
	err := database.DB.QueryRow(
		`SELECT value FROM site_settings WHERE key=$1 AND restaurant_id=$2`,
		printerTemplateConfigKey, rid).Scan(&raw)
	if err == sql.ErrNoRows {
		return DefaultPrinterTemplateConfig(), nil
	}
	if err != nil {
		return nil, err
	}
	var cfg PrinterTemplateConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SavePrinterTemplateConfig validates, persists, and returns the saved config.
func SavePrinterTemplateConfig(cfg *PrinterTemplateConfig, restaurantID int) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	rid := ResolveRestaurant(restaurantID)
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = database.DB.Exec(
		`INSERT INTO site_settings (key, value, restaurant_id) VALUES ($1, $2::jsonb, $3)
		 ON CONFLICT (key, restaurant_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
		printerTemplateConfigKey, string(raw), rid,
	)
	if err != nil {
		return err
	}
	printerCfgTemplateMu.Lock()
	printerCfgTemplateCache[rid] = cfg
	printerCfgTemplateMu.Unlock()
	return nil
}

// InvalidatePrinterTemplateCache removes the cached printer config for a restaurant.
func InvalidatePrinterTemplateConfig(restaurantID int) {
	printerCfgTemplateMu.Lock()
	printerCfgTemplateCache[ResolveRestaurant(restaurantID)] = nil
	printerCfgTemplateMu.Unlock()
}

// Template Config Cache already declared above.

// Validate ensures the template config is valid.
func (c *PrinterTemplateConfig) Validate() error {
	if c.PaperWidth != 58 && c.PaperWidth != 80 {
		return fmt.Errorf("paper_width must be 58 or 80")
	}
	if len(c.Elements) == 0 {
		return fmt.Errorf("at least one element is required")
	}
	for i, el := range c.Elements {
		if el.ID == "" {
			return fmt.Errorf("element %d: id is required", i)
		}
		if el.Type != "text" && el.Type != "divider" && el.Type != "image" && el.Type != "qr" && el.Type != "spacer" {
			return fmt.Errorf("element %d (%s): invalid type %q", i, el.ID, el.Type)
		}
		if el.Align != "" && el.Align != "left" && el.Align != "center" && el.Align != "right" {
			return fmt.Errorf("element %d (%s): invalid align %q", i, el.ID, el.Align)
		}
		if el.Type == "qr" && el.QRSize > 0 && (el.QRSize < 1 || el.QRSize > 8) {
			return fmt.Errorf("element %d (%s): qr_size must be between 1 and 8", i, el.ID)
		}
		if el.Type == "spacer" && el.SpacerLines > 0 && el.SpacerLines > 20 {
			return fmt.Errorf("element %d (%s): spacer_lines must be between 1 and 20", i, el.ID)
		}
	}
	return nil
}

// getRestaurantAddress fetches the restaurant address from restaurant_config.
func getRestaurantAddress(restaurantID int) string {
	rid := ResolveRestaurant(restaurantID)
	var address string
	err := database.DB.QueryRow(`SELECT address FROM restaurant_config WHERE restaurant_id=$1 LIMIT 1`, rid).Scan(&address)
	if err != nil {
		return ""
	}
	return address
}

// GenerateReceiptFromTemplate generates ESC/POS receipt bytes from template config.
func GenerateReceiptFromTemplate(order *models.Order, cfg *PrinterTemplateConfig, brandName string) []byte {
	if cfg == nil {
		cfg = DefaultPrinterTemplateConfig()
	}
	width := cfg.PaperWidth
	if cfg.PaperWidth != 58 && cfg.PaperWidth != 80 {
		width = 58
	}

	var b strings.Builder

	// Initialize printer
	b.WriteString(initCmd)
	b.WriteString(lineFeed)

	// Helper functions
	center := func(s string) string {
		if len(s) >= width {
			return s
		}
		leftPad := (width - len(s)) / 2
		return strings.Repeat(" ", leftPad) + s
	}
	right := func(s string) string {
		if len(s) >= width {
			return s
		}
		return strings.Repeat(" ", width-len(s)) + s
	}
	left := func(s string) string {
		if len(s) >= width {
			return s
		}
		return s + strings.Repeat(" ", width-len(s))
	}
	divider := strings.Repeat("-", width)
	boldOn := esc + "E" + "\x01"
	boldOff := esc + "E" + "\x00"
	doubleH := esc + "!" + "\x01"
	doubleReset := esc + "!" + "\x00"
	italicOn := esc + "4"
	italicOff := esc + "5"

	// Helper to replace template variables
	// Fetch restaurant info for placeholders
	restaurantAddress := getRestaurantAddress(order.RestaurantID)

	replaceVars := func(text string) string {
		text = strings.ReplaceAll(text, "{{brand_name}}", brandName)
		text = strings.ReplaceAll(text, "{{restaurant_address}}", restaurantAddress)
		text = strings.ReplaceAll(text, "{{order_number}}", order.OrderNumber)
		text = strings.ReplaceAll(text, "{{customer_name}}", order.CustomerName)
		text = strings.ReplaceAll(text, "{{customer_phone}}", order.CustomerPhone)
		text = strings.ReplaceAll(text, "{{customer_address}}", order.Address)
		text = strings.ReplaceAll(text, "{{customer_landmark}}", order.Landmark)
		text = strings.ReplaceAll(text, "{{order_type}}", order.OrderType)
		text = strings.ReplaceAll(text, "{{tax_amount}}", fmt.Sprintf("%.2f", order.TaxAmount))
		text = strings.ReplaceAll(text, "{{container_charge}}", fmt.Sprintf("%.2f", order.ContainerCharge))
		text = strings.ReplaceAll(text, "{{tip_amount}}", fmt.Sprintf("%.2f", order.TipAmount))
		text = strings.ReplaceAll(text, "{{guest_count}}", fmt.Sprintf("%d", order.GuestCount))
		text = strings.ReplaceAll(text, "{{payment_method}}", order.PaymentMethod)
		text = strings.ReplaceAll(text, "{{status}}", order.Status)
		text = strings.ReplaceAll(text, "{{date_time}}", order.CreatedAt.Format("2006-01-02 15:04"))
		text = strings.ReplaceAll(text, "{{subtotal}}", fmt.Sprintf("%.2f", order.Subtotal))
		text = strings.ReplaceAll(text, "{{delivery_fee}}", fmt.Sprintf("%.2f", order.DeliveryFee))
		text = strings.ReplaceAll(text, "{{discount}}", fmt.Sprintf("%.2f", order.Discount))
		text = strings.ReplaceAll(text, "{{total}}", fmt.Sprintf("%.2f", order.Total))
		text = strings.ReplaceAll(text, "{{footer}}", cfg.Footer)
		// Items list
		if text == "{{items_list}}" {
			var itemsText strings.Builder
			nameWidth := width - 12
			if nameWidth < 8 {
				nameWidth = 8
			}
			for _, item := range order.Items {
				name := item.Name
				if len(name) > nameWidth {
					name = name[:nameWidth-1]
				}
				price := item.LineTotal
				if price == 0 {
					price = item.Subtotal
				}
				itemsText.WriteString(fmt.Sprintf("%-*s %3d %6.2f\n", nameWidth, name, item.Quantity, price))
			}
			return itemsText.String()
		}
		return text
	}

	for _, elem := range cfg.Elements {
		// Conditional display
		if elem.Condition == "show_if_delivery" && order.OrderType != "delivery" {
			continue
		}
		if elem.Condition == "show_if_discount" && order.Discount <= 0 {
			continue
		}
		if elem.Condition == "show_if_customer" && strings.TrimSpace(order.CustomerName) == "" {
			continue
		}
		if elem.Condition == "show_if_tax" && order.TaxAmount <= 0 {
			continue
		}
		if elem.Condition == "show_if_container" && order.ContainerCharge <= 0 {
			continue
		}
		if elem.Condition == "show_if_tip" && order.TipAmount <= 0 {
			continue
		}
		switch elem.Type {
		case "divider":
			for i := 0; i < elem.PaddingTop; i++ {
				b.WriteString(lineFeed)
			}
			b.WriteString(divider + lineFeed)
			for i := 0; i < elem.PaddingBottom; i++ {
				b.WriteString(lineFeed)
			}
		case "text":
			// Apply padding top
			for i := 0; i < elem.PaddingTop; i++ {
				b.WriteString(lineFeed)
			}
			text := replaceVars(elem.Text)
			switch elem.Align {
			case "center":
				text = center(text)
			case "right":
				text = right(text)
			default:
				text = left(text)
			}
			if elem.Bold {
				b.WriteString(boldOn)
			}
			if elem.Italic {
				b.WriteString(italicOn)
			}
			if elem.DoubleHeight {
				b.WriteString(doubleH)
			}
			b.WriteString(text + lineFeed)
			for i := 0; i < elem.PaddingBottom; i++ {
				b.WriteString(lineFeed)
			}
			if elem.DoubleHeight {
				b.WriteString(doubleReset)
			}
			if elem.Italic {
				b.WriteString(italicOff)
			}
			if elem.Bold {
				b.WriteString(boldOff)
			}
		case "spacer":
			lines := elem.SpacerLines
			if lines < 1 {
				lines = elem.PaddingTop + elem.PaddingBottom + 2
				if lines < 1 {
					lines = 1
				}
			}
			for i := 0; i < lines; i++ {
				b.WriteString(lineFeed)
			}
		case "qr":
			qrText := replaceVars(elem.QRValue)
			if qrText == "" {
				qrText = replaceVars(elem.Text)
			}
			if qrText != "" {
				qrBytes, err := generateQRCodeESCPOS(qrText, elem.QRSize)
				if err == nil {
					b.Write(qrBytes)
				} else {
					b.WriteString(center("QR:" + lineFeed))
					b.WriteString(center("[" + qrText + "]") + lineFeed)
				}
			}
	}
	}

	b.WriteString(cutPaper)
	return []byte(b.String())
}

// generateQRCodeESCPOS generates a QR code as ESC/POS raster bitmap commands.
func generateQRCodeESCPOS(text string, size int) ([]byte, error) {
	if size < 1 || size > 8 {
		size = 4
	}
	qrCode, err := qrcode.New(text, qrcode.Medium)
	if err != nil {
		return nil, err
	}
	qrCode.DisableBorder = true

	img := qrCode.Image(size * 10)

	width := img.Bounds().Dx()
	height := img.Bounds().Dy()

	var result []byte

	for y := 0; y < height; y += 8 {
		for x := 0; x < width; x++ {
			var byteVal byte
			for bit := 0; bit < 8; bit++ {
				yPos := y + bit
				if yPos < height {
					color := img.At(x, yPos)
					r, g, b, _ := color.RGBA()
					if r < 128 && g < 128 && b < 128 {
						byteVal |= byte(1 << uint(7-bit))
					}
				}
			}
			result = append(result, byteVal)
		}
	}

	// GS v 0 raster bit image command (ESC/POS standard)
	xL := byte(width % 256)
	xH := byte(width / 256)
	yL := byte(height % 256)
	yH := byte(height / 256)
	cmd := append([]byte{0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH}, result...)

	return cmd, nil
}

const (
	esc         = "\x1b"
	initCmd     = esc + "@"   // Initialize printer
	boldOn      = esc + "E" + "\x01"
	boldOff     = esc + "E" + "\x00"
	underlineOn = esc + "-" + "\x01"
	underlineOff= esc + "-" + "\x00"
	center      = esc + "a" + "\x01"
	left        = esc + "a" + "\x00"
	right       = esc + "a" + "\x02"
	doubleH     = esc + "!" + "\x01" // double height
	doubleReset = esc + "!" + "\x00"
	lineFeed    = "\n"
	cutPaper    = esc + "i" + "\x01" // partial cut
)

func padRight(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return s + strings.Repeat(" ", width-len(s))
}

func padLeft(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return strings.Repeat(" ", width-len(s)) + s
}

// GenerateESCPOSReceipt builds ESC/POS bytes for an order receipt.
func GenerateESCPOSReceipt(order *models.Order, cfg *PrinterConfig, brandName string) []byte {
	width := 32 // columns for 58mm
	if cfg != nil && cfg.PaperWidth == 80 {
		width = 48
	}

	var b strings.Builder

	b.WriteString(initCmd)
	b.WriteString(lineFeed)
	b.WriteString(center)
	b.WriteString(boldOn)
	b.WriteString(doubleH)
	b.WriteString(padCenter(brandName, width))
	b.WriteString(doubleReset)
	b.WriteString(boldOff)
	b.WriteString(lineFeed)
	b.WriteString(underlineOn)
	b.WriteString(padCenter("Receipt", width))
	b.WriteString(underlineOff)
	b.WriteString(lineFeed)
	b.WriteString(lineFeed)

	// Order header
	b.WriteString(left)
	b.WriteString(padRight("Order #", 12) + order.OrderNumber + lineFeed)
	b.WriteString(padRight("Date:", 12) + order.CreatedAt.Format("2006-01-02 15:04") + lineFeed)
	b.WriteString(padRight("Type:", 12) + order.OrderType + lineFeed)
	b.WriteString(padRight("Payment:", 12) + order.PaymentMethod + lineFeed)
	b.WriteString(padRight("Status:", 12) + order.Status + lineFeed)
	b.WriteString(lineFeed)

	// Items
	b.WriteString(center)
	b.WriteString(boldOn)
	b.WriteString("ITEMS")
	b.WriteString(boldOff)
	b.WriteString(lineFeed)
	b.WriteString(left)
	b.WriteString(padRight("Item", 16) + padRight("Qty", 5) + padRight("Price", 8) + lineFeed)
	b.WriteString(strings.Repeat("-", width) + lineFeed)

	for _, item := range order.Items {
		name := item.Name
		if len(name) > 16 {
			name = name[:15]
		}
		b.WriteString(padRight(name, 16))
		b.WriteString(padLeft(fmt.Sprintf("%d", item.Quantity), 5))
		itemPrice := item.LineTotal
		if itemPrice == 0 {
			itemPrice = item.Subtotal
		}
		b.WriteString(padLeft(fmt.Sprintf("%.2f", itemPrice), 8))
		b.WriteString(lineFeed)
		if item.Options != "" {
			b.WriteString(padRight("  "+item.Options, width) + lineFeed)
		}
	}
	b.WriteString(strings.Repeat("-", width) + lineFeed)

	// Totals
	b.WriteString(padRight("Subtotal:", 20) + padLeft(fmt.Sprintf("%.2f", order.Subtotal), width-20) + lineFeed)
	if order.Discount > 0 {
		b.WriteString(padRight("Discount:", 20) + padLeft(fmt.Sprintf("-%.2f", order.Discount), width-20) + lineFeed)
	}
	if order.ContainerCharge > 0 {
		b.WriteString(padRight("Container:", 20) + padLeft(fmt.Sprintf("%.2f", order.ContainerCharge), width-20) + lineFeed)
	}
	if order.TipAmount > 0 {
		b.WriteString(padRight("Tip:", 20) + padLeft(fmt.Sprintf("%.2f", order.TipAmount), width-20) + lineFeed)
	}
	b.WriteString(underlineOn)
	b.WriteString(padRight("TOTAL:", 20) + padLeft(fmt.Sprintf("%.2f", order.Total), width-20) + lineFeed)
	b.WriteString(underlineOff)
	b.WriteString(lineFeed)
	b.WriteString(lineFeed)

	// Footer
	b.WriteString(center)
	b.WriteString("Thank you!" + lineFeed)
	b.WriteString("Visit again." + lineFeed)
	b.WriteString(lineFeed)
	b.WriteString(lineFeed)
	b.WriteString(cutPaper)

	return []byte(b.String())
}

func padCenter(s string, width int) string {
	if len(s) >= width {
		return s
	}
	leftPad := (width - len(s)) / 2
	return strings.Repeat(" ", leftPad) + s
}

// ------------------------------------------------------------------
// Printer delivery
// ------------------------------------------------------------------

// SendToPrinter sends ESC/POS bytes to the configured printer.
// Returns an error if the printer cannot be reached.
func SendToPrinter(bytes []byte, cfg *PrinterConfig) error {
	if cfg == nil {
		cfg = DefaultPrinterConfig()
	}
	if err := cfg.Validate(); err != nil {
		return err
	}

	switch cfg.PrinterType {
	case PrinterTypeNone:
		return fmt.Errorf("printer not configured")
	case PrinterTypeBrowser, PrinterTypeWeb:
		// Web/Browser printing is client-side; server has nothing to do.
		return nil
	case PrinterTypeUSB:
		return sendSerial(bytes, cfg.PrinterPort)
	case PrinterTypeNetwork:
		addr := net.JoinHostPort(cfg.PrinterPort, fmt.Sprintf("%d", cfg.PrinterPortNum))
		return sendTCP(bytes, addr)
	default:
		return fmt.Errorf("unsupported printer_type %q", cfg.PrinterType)
	}
}

func sendTCP(data []byte, addr string) error {
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("printer connection failed: %w", err)
	}
	defer conn.Close()
	if err := conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return err
	}
	if _, err := conn.Write(data); err != nil {
		return fmt.Errorf("printer write failed: %w", err)
	}
	return nil
}

func sendSerial(data []byte, port string) error {
	// USB serial printing requires hardware connection and go-tarm/serial dependency.
	// For production: go get github.com/tarm/serial
	return fmt.Errorf("USB printing to %s not available - hardware connection required. Ensure printer is connected to COM port %s.", port, port)
}

// ------------------------------------------------------------------
// Persistence helpers (site_settings key 'printer_config')
// ------------------------------------------------------------------

// GetPrinterConfig reads the printer config for a restaurant from site_settings.
// Results are cached per restaurant to avoid repeated DB lookups.
func GetPrinterConfig(restaurantID int) (*PrinterConfig, error) {
	rid := ResolveRestaurant(restaurantID)
	printerCfgMu.RLock()
	if c, ok := printerCfgCache[rid]; ok {
		printerCfgMu.RUnlock()
		return c, nil
	}
	printerCfgMu.RUnlock()

	var raw []byte
	err := database.DB.QueryRow(
		`SELECT value FROM site_settings WHERE key=$1 AND restaurant_id=$2`,
		printerConfigKey, rid).Scan(&raw)
	if err == sql.ErrNoRows {
		cfg := DefaultPrinterConfig()
		printerCfgMu.Lock()
		printerCfgCache[rid] = cfg
		printerCfgMu.Unlock()
		return cfg, nil
	}
	if err != nil {
		return nil, err
	}
	var cfg PrinterConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, err
	}
	printerCfgMu.Lock()
	printerCfgCache[rid] = &cfg
	printerCfgMu.Unlock()
	return &cfg, nil
}

// SavePrinterConfig validates, persists, and returns the saved config.
// Invalidates the cache after successful write.
func SavePrinterConfig(cfg *PrinterConfig, restaurantID int) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	rid := ResolveRestaurant(restaurantID)
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = database.DB.Exec(
		`INSERT INTO site_settings (key, value, restaurant_id) VALUES ($1, $2::jsonb, $3)
		 ON CONFLICT (key, restaurant_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
		printerConfigKey, string(raw), rid,
	)
	if err != nil {
		return err
	}
	printerCfgMu.Lock()
	printerCfgCache[rid] = cfg
	printerCfgMu.Unlock()
	return nil
}

// InvalidatePrinterConfig removes the cached printer config for a restaurant.
func InvalidatePrinterConfig(restaurantID int) {
	printerCfgMu.Lock()
	printerCfgCache[ResolveRestaurant(restaurantID)] = nil
	printerCfgMu.Unlock()
}

// PrintOrderReceipt prints an order receipt if auto-print is enabled.
// Returns true if a print job was dispatched (successfully or not).
func PrintOrderReceipt(order *models.Order, brandName string) (bool, error) {
	cfg, err := GetPrinterConfig(order.RestaurantID)
	if err != nil {
		return false, err
	}
	if !cfg.AutoPrint || cfg.PrinterType == PrinterTypeNone {
		return false, nil
	}
	tmplCfg, err := GetPrinterTemplateConfig(order.RestaurantID)
	if err != nil || tmplCfg == nil {
		tmplCfg = DefaultPrinterTemplateConfig()
	}
	bytes := GenerateReceiptFromTemplate(order, tmplCfg, brandName)
	if err := SendToPrinter(bytes, cfg); err != nil {
		return true, err
	}
	return true, nil
}

// ManualPrintOrderReceipt prints a specific order receipt on demand.
func ManualPrintOrderReceipt(order *models.Order, brandName string) error {
	cfg, err := GetPrinterConfig(order.RestaurantID)
	if err != nil {
		return err
	}
	if cfg.PrinterType == PrinterTypeNone {
		return fmt.Errorf("printer not configured")
	}
	// Use template config if available, fall back to non-template
	tmplCfg, err := GetPrinterTemplateConfig(order.RestaurantID)
	if err != nil || tmplCfg == nil {
		tmplCfg = DefaultPrinterTemplateConfig()
	}
	bytes := GenerateReceiptFromTemplate(order, tmplCfg, brandName)
	return SendToPrinter(bytes, cfg)
}

// TestPrinterConnection sends a test page to the configured printer.
func TestPrinterConnection(cfg *PrinterConfig, brandName string) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	if cfg.PrinterType == PrinterTypeNone {
		return fmt.Errorf("printer not configured")
	}
	// Build a minimal test receipt
	testOrder := &models.Order{
		OrderNumber:   "TEST-001",
		CustomerName:  "Test Customer",
		CustomerPhone: "",
		OrderType:     "delivery",
		PaymentMethod: "cash",
		Status:        "test",
		Subtotal:      0,
		DeliveryFee:   0,
		Discount:      0,
		Total:         0,
		Items: []models.OrderItem{
			{Name: "Test Item", Quantity: 1, Subtotal: 0},
		},
		CreatedAt: time.Now(),
	}
	bytes := GenerateESCPOSReceipt(testOrder, cfg, brandName+" (Test)")
	return SendToPrinter(bytes, cfg)
}
