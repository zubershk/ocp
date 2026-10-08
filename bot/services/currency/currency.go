package currency

import (
	"fmt"
	"strings"
)

// CurrencyInfo holds presentation metadata for an ISO-4217 currency.
type CurrencyInfo struct {
	Code       string // ISO-4217 code (e.g., "USD", "INR")
	Symbol     string // Presentation symbol (e.g., "$", "₹")
	Locale     string // Locale for formatting (e.g., "en-US", "en-IN")
	MinorUnit  int    // Decimal places (2 for most, 0 for JPY, 3 for BHD)
	Name       string // Human-readable name
}

// CurrencyRegistry maps ISO codes to CurrencyInfo.
var CurrencyRegistry = map[string]CurrencyInfo{
	"USD": {Code: "USD", Symbol: "$", Locale: "en-US", MinorUnit: 2, Name: "US Dollar"},
	"INR": {Code: "INR", Symbol: "₹", Locale: "en-IN", MinorUnit: 2, Name: "Indian Rupee"},
	"EUR": {Code: "EUR", Symbol: "€", Locale: "de-DE", MinorUnit: 2, Name: "Euro"},
	"GBP": {Code: "GBP", Symbol: "£", Locale: "en-GB", MinorUnit: 2, Name: "British Pound"},
	"JPY": {Code: "JPY", Symbol: "¥", Locale: "ja-JP", MinorUnit: 0, Name: "Japanese Yen"},
	"CNY": {Code: "CNY", Symbol: "¥", Locale: "zh-CN", MinorUnit: 2, Name: "Chinese Yuan"},
	"AUD": {Code: "AUD", Symbol: "A$", Locale: "en-AU", MinorUnit: 2, Name: "Australian Dollar"},
	"CAD": {Code: "CAD", Symbol: "C$", Locale: "en-CA", MinorUnit: 2, Name: "Canadian Dollar"},
	"CHF": {Code: "CHF", Symbol: "CHF", Locale: "de-CH", MinorUnit: 2, Name: "Swiss Franc"},
	"SGD": {Code: "SGD", Symbol: "S$", Locale: "en-SG", MinorUnit: 2, Name: "Singapore Dollar"},
	"HKD": {Code: "HKD", Symbol: "HK$", Locale: "zh-HK", MinorUnit: 2, Name: "Hong Kong Dollar"},
	"NZD": {Code: "NZD", Symbol: "NZ$", Locale: "en-NZ", MinorUnit: 2, Name: "New Zealand Dollar"},
	"KRW": {Code: "KRW", Symbol: "₩", Locale: "ko-KR", MinorUnit: 0, Name: "South Korean Won"},
	"BRL": {Code: "BRL", Symbol: "R$", Locale: "pt-BR", MinorUnit: 2, Name: "Brazilian Real"},
	"MXN": {Code: "MXN", Symbol: "MX$", Locale: "es-MX", MinorUnit: 2, Name: "Mexican Peso"},
	"ZAR": {Code: "ZAR", Symbol: "R", Locale: "en-ZA", MinorUnit: 2, Name: "South African Rand"},
	"TRY": {Code: "TRY", Symbol: "₺", Locale: "tr-TR", MinorUnit: 2, Name: "Turkish Lira"},
	"AED": {Code: "AED", Symbol: "د.إ", Locale: "ar-AE", MinorUnit: 2, Name: "UAE Dirham"},
	"SAR": {Code: "SAR", Symbol: "﷼", Locale: "ar-SA", MinorUnit: 2, Name: "Saudi Riyal"},
	"THB": {Code: "THB", Symbol: "฿", Locale: "th-TH", MinorUnit: 2, Name: "Thai Baht"},
	"IDR": {Code: "IDR", Symbol: "Rp", Locale: "id-ID", MinorUnit: 0, Name: "Indonesian Rupiah"},
	"MYR": {Code: "MYR", Symbol: "RM", Locale: "ms-MY", MinorUnit: 2, Name: "Malaysian Ringgit"},
	"PHP": {Code: "PHP", Symbol: "₱", Locale: "en-PH", MinorUnit: 2, Name: "Philippine Peso"},
	"VND": {Code: "VND", Symbol: "₫", Locale: "vi-VN", MinorUnit: 0, Name: "Vietnamese Dong"},
	"PLN": {Code: "PLN", Symbol: "zł", Locale: "pl-PL", MinorUnit: 2, Name: "Polish Zloty"},
	"CZK": {Code: "CZK", Symbol: "Kč", Locale: "cs-CZ", MinorUnit: 2, Name: "Czech Koruna"},
	"HUF": {Code: "HUF", Symbol: "Ft", Locale: "hu-HU", MinorUnit: 0, Name: "Hungarian Forint"},
	"RON": {Code: "RON", Symbol: "lei", Locale: "ro-RO", MinorUnit: 2, Name: "Romanian Leu"},
	"BGN": {Code: "BGN", Symbol: "лв", Locale: "bg-BG", MinorUnit: 2, Name: "Bulgarian Lev"},
	"HRK": {Code: "HRK", Symbol: "kn", Locale: "hr-HR", MinorUnit: 2, Name: "Croatian Kuna"},
	"RUB": {Code: "RUB", Symbol: "₽", Locale: "ru-RU", MinorUnit: 2, Name: "Russian Ruble"},
	"ILS": {Code: "ILS", Symbol: "₪", Locale: "he-IL", MinorUnit: 2, Name: "Israeli New Shekel"},
	"NOK": {Code: "NOK", Symbol: "kr", Locale: "nb-NO", MinorUnit: 2, Name: "Norwegian Krone"},
	"SEK": {Code: "SEK", Symbol: "kr", Locale: "sv-SE", MinorUnit: 2, Name: "Swedish Krona"},
	"DKK": {Code: "DKK", Symbol: "kr", Locale: "da-DK", MinorUnit: 2, Name: "Danish Krone"},
	"ARS": {Code: "ARS", Symbol: "$", Locale: "es-AR", MinorUnit: 2, Name: "Argentine Peso"},
	"CLP": {Code: "CLP", Symbol: "$", Locale: "es-CL", MinorUnit: 0, Name: "Chilean Peso"},
	"COP": {Code: "COP", Symbol: "$", Locale: "es-CO", MinorUnit: 0, Name: "Colombian Peso"},
	"PEN": {Code: "PEN", Symbol: "S/", Locale: "es-PE", MinorUnit: 2, Name: "Peruvian Sol"},
	"UYU": {Code: "UYU", Symbol: "$U", Locale: "es-UY", MinorUnit: 2, Name: "Uruguayan Peso"},
	"EGP": {Code: "EGP", Symbol: "E£", Locale: "ar-EG", MinorUnit: 2, Name: "Egyptian Pound"},
	"NGN": {Code: "NGN", Symbol: "₦", Locale: "en-NG", MinorUnit: 2, Name: "Nigerian Naira"},
	"KES": {Code: "KES", Symbol: "KSh", Locale: "en-KE", MinorUnit: 2, Name: "Kenyan Shilling"},
	"GHS": {Code: "GHS", Symbol: "₵", Locale: "en-GH", MinorUnit: 2, Name: "Ghanaian Cedi"},
	"MAD": {Code: "MAD", Symbol: "د.م.", Locale: "ar-MA", MinorUnit: 2, Name: "Moroccan Dirham"},
	"TWD": {Code: "TWD", Symbol: "NT$", Locale: "zh-TW", MinorUnit: 2, Name: "New Taiwan Dollar"},
}

// DefaultCurrency is the fallback when code is unknown or empty.
const DefaultCurrency = "USD"

var defaultInfo = CurrencyInfo{
	Code:      DefaultCurrency,
	Symbol:    "$",
	Locale:    "en-US",
	MinorUnit: 2,
	Name:      "US Dollar",
}

// Lookup returns CurrencyInfo for the given ISO code (case-insensitive).
// Unknown codes fall back to USD.
func Lookup(code string) CurrencyInfo {
	c := strings.ToUpper(strings.TrimSpace(code))
	if info, ok := CurrencyRegistry[c]; ok {
		return info
	}
	return defaultInfo
}

// Symbol returns the presentation symbol for the given ISO code.
func Symbol(code string) string {
	return Lookup(code).Symbol
}

// Locale returns the formatting locale for the given ISO code.
func Locale(code string) string {
	return Lookup(code).Locale
}

// MinorUnit returns the decimal places for the given ISO code.
func MinorUnit(code string) int {
	return Lookup(code).MinorUnit
}

// FormatMinor formats an integer minor-unit amount (e.g., paise, cents) as a
// localized string with the correct symbol and decimal places.
func FormatMinor(code string, minor int) string {
	info := Lookup(code)
	divisor := 1
	for i := 0; i < info.MinorUnit; i++ {
		divisor *= 10
	}
	major := float64(minor) / float64(divisor)
	format := "%." + fmt.Sprintf("%d", info.MinorUnit) + "f"
	if info.MinorUnit == 0 {
		format = "%.0f"
	}
	return info.Symbol + fmt.Sprintf(format, major)
}

// FormatMajor formats a major-unit amount (e.g., dollars, rupees) as a
// localized string with the correct symbol and decimal places.
func FormatMajor(code string, major float64) string {
	info := Lookup(code)
	format := "%." + fmt.Sprintf("%d", info.MinorUnit) + "f"
	if info.MinorUnit == 0 {
		format = "%.0f"
	}
	return info.Symbol + fmt.Sprintf(format, major)
}