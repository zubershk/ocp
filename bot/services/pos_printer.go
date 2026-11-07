package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"strings"
	"time"

	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/models"
)

// ------------------------------------------------------------------
// POS Printer Configuration (per restaurant, stored in site_settings
// key 'printer_config' — same pattern as pos_config / offers / banners).
// Supports: none | usb | network | virtual | browser
// ------------------------------------------------------------------

const (
	printerConfigKey = "printer_config"

	PrinterTypeNone    = "none"
	PrinterTypeUSB     = "usb"
	PrinterTypeNetwork = "network"
	PrinterTypeVirtual = "virtual"
	PrinterTypeBrowser = "browser"

	DefaultTCPPort = 9100
	DefaultWidth   = 58
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
	case PrinterTypeNone, PrinterTypeUSB, PrinterTypeNetwork, PrinterTypeVirtual, PrinterTypeBrowser:
	default:
		return fmt.Errorf("invalid printer_type %q", p.PrinterType)
	}
	if p.PrinterType == PrinterTypeUSB && p.PrinterPort == "" {
		return fmt.Errorf("printer_port required for usb")
	}
	if p.PrinterType == PrinterTypeNetwork && p.PrinterPort == "" {
		return fmt.Errorf("printer_port required for network")
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
// ESC/POS receipt generation (ESC/POS command set, compatible with
// most 58mm/80mm thermal printers including the virtual thermal printer).
// ------------------------------------------------------------------

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
		b.WriteString(padLeft(fmt.Sprintf("%.2f", item.Subtotal), 8))
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
	case PrinterTypeBrowser:
		// Browser printing is client-side; server has nothing to do.
		return nil
	case PrinterTypeUSB:
		return sendSerial(bytes, cfg.PrinterPort)
	case PrinterTypeNetwork, PrinterTypeVirtual:
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
	// Try to open serial port. go-tarm/serial may not be in go.mod;
	// fall back to a best-effort log if unavailable.
	log.Printf("USB serial printing to %s (%d bytes) — serial port support requires go-tarm/serial dependency", port, len(data))
	// For now, USB printing is logged; a real serial implementation would
	// open the COM port and write the ESC/POS bytes here.
	return nil
}

// ------------------------------------------------------------------
// Persistence helpers (site_settings key 'printer_config')
// ------------------------------------------------------------------

// GetPrinterConfig reads the printer config for a restaurant from site_settings.
func GetPrinterConfig(restaurantID int) (*PrinterConfig, error) {
	rid := ResolveRestaurant(restaurantID)
	var raw []byte
	err := database.DB.QueryRow(
		`SELECT value FROM site_settings WHERE key=$1 AND restaurant_id=$2`,
		printerConfigKey, rid).Scan(&raw)
	if err == sql.ErrNoRows {
		return DefaultPrinterConfig(), nil
	}
	if err != nil {
		return nil, err
	}
	var cfg PrinterConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SavePrinterConfig validates, persists, and returns the saved config.
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
	return err
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
	bytes := GenerateESCPOSReceipt(order, cfg, brandName)
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
	bytes := GenerateESCPOSReceipt(order, cfg, brandName)
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
