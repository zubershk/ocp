package services

import "strings"

// MaskPhone returns a log-safe representation of a phone number, keeping only
// the last 4 digits. Logs are not a secret store; full customer phone numbers
// must never be written to them (GDPR / India DPDP data-minimisation).
func MaskPhone(phone string) string {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	if len(digits) <= 4 {
		return "****"
	}
	return "****" + digits[len(digits)-4:]
}

// MaskEmail returns a log-safe representation of an email, keeping the first
// character and the domain. e.g. j•••••@example.com.
func MaskEmail(email string) string {
	email = strings.TrimSpace(email)
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return "***"
	}
	local, domain := email[:at], email[at:]
	masked := string(local[0]) + "***"
	return masked + domain
}
