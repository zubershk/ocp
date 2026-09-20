package services

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
)

// ------------------------------------------------------------------
// Centralized image URL policy for bot (layer 2 of 3).
// Reusable validators: no fetch, no state.
// Enforces scheme, allowlist, private-network denial, and basic hygiene.
// Evolution sink (layer 3) does DNS + redirect re-validation + body caps.
// ------------------------------------------------------------------

func imageAllowlist() []string {
	raw := os.Getenv("IMAGE_ALLOWLIST")
	if raw == "" {
		raw = os.Getenv("ALLOWED_IMAGE_HOSTS")
	}
	if raw == "" {
		return nil
	}
	var out []string
	for _, s := range strings.Split(raw, ",") {
		if v := strings.TrimSpace(strings.ToLower(s)); v != "" {
			out = append(out, v)
		}
	}
	// Implicitly allow the bot's own public base URL host even when allowlist empty
	if pb := os.Getenv("PUBLIC_BASE_URL"); pb != "" {
		if u, err := url.Parse(strings.TrimSpace(pb)); err == nil && u.Hostname() != "" {
			found := false
			lower := strings.ToLower(u.Hostname())
			for _, e := range out {
				if strings.ToLower(e) == lower {
					found = true
					break
				}
			}
			if !found {
				out = append(out, lower)
			}
		}
	}
	return out
}

func isAllowedHost(host string, allowlist []string) bool {
	if len(allowlist) == 0 {
		return false
	}
	h := strings.ToLower(host)
	for _, e := range allowlist {
		if strings.HasPrefix(e, "*.") {
			suffix := strings.ToLower(e[2:])
			if h == suffix || strings.HasSuffix(h, "."+suffix) {
				return true
			}
		} else if h == strings.ToLower(e) {
			return true
		}
	}
	return false
}

func isPrivateIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	// IPv4 private
	if ip4 := ip.To4(); ip4 != nil {
		a := int(ip4[0])
		b := int(ip4[1])
		if a == 10 {
			return true
		}
		if a == 172 && b >= 16 && b <= 31 {
			return true
		}
		if a == 192 && b == 168 {
			return true
		}
		if a == 169 && b == 254 {
			return true
		}
		// CGNAT 100.64/10, TEST-NET, etc. — treat as private for SSRF
		if a == 100 && b >= 64 && b <= 127 {
			return true
		}
		if a == 192 && b == 0 && int(ip4[2]) == 2 {
			return true
		}
		if a == 198 && b == 51 && int(ip4[2]) == 100 {
			return true
		}
		if a == 203 && b == 0 && int(ip4[2]) == 113 {
			return true
		}
		if a == 255 && b == 255 && int(ip4[2]) == 255 && int(ip4[3]) == 255 {
			return true
		}
		return false
	}
	// IPv6: loopback handled above, plus unique local fc00::/7
	if len(ip) == net.IPv6len {
		if ip[0]&0xfe == 0xfc { // fc00::/7
			return true
		}
		if ip[0] == 0xfe && ip[1]&0xc0 == 0x80 { // fe80::/10
			return true
		}
		if ip[0] == 0xff { // ff00::/8 multicast
			return true
		}
	}
	return false
}

// ValidateExternalImageURL checks an http(s) image URL against the centralized
// policy. Empty string is allowed (text-only broadcast). Data and /uploads
// URLs are NOT handled here — BroadcastSend routes those separately via the
// resolved payload path. This function validates the pre-forward check for
// external URLs: when IMAGE_ALLOWLIST is empty, all http(s) are rejected
// (uploads-only mode).
func ValidateExternalImageURL(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	// Only http(s) reaches this validator; data:/uploads are validated before call.
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(raw)), "http://") && !strings.HasPrefix(strings.ToLower(strings.TrimSpace(raw)), "https://") {
		return nil // not an external URL — caller handles data:/uploads
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("invalid image URL")
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return fmt.Errorf("image URL must be https")
	}
	if u.User != nil {
		return fmt.Errorf("image URL must not contain credentials")
	}
	if u.Port() != "" && u.Port() != "80" && u.Port() != "443" {
		return fmt.Errorf("image URL must use default port")
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("invalid image URL host")
	}
	if ip := net.ParseIP(host); ip != nil {
		if isPrivateIP(ip) {
			return fmt.Errorf("image host not allowed")
		}
	}
	allowlist := imageAllowlist()
	if len(allowlist) == 0 {
		return fmt.Errorf("external image URLs not allowed — use uploads library")
	}
	if !isAllowedHost(host, allowlist) {
		return fmt.Errorf("image host not allowed")
	}
	return nil
}
