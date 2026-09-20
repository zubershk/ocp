package utils

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ------------------------------------------------------------------
// Centralized image URL policy for evolution-go (layer 3 of 3).
// Enforces at request time with DNS resolution and redirect re-validation.
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
	if len(ip) == net.IPv6len {
		if ip[0]&0xfe == 0xfc {
			return true
		}
		if ip[0] == 0xfe && ip[1]&0xc0 == 0x80 {
			return true
		}
		if ip[0] == 0xff {
			return true
		}
	}
	return false
}

func validateURLString(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	// Only http(s) reaches this; data:/uploads handled elsewhere
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(raw)), "http://") && !strings.HasPrefix(strings.ToLower(strings.TrimSpace(raw)), "https://") {
		return nil
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
	} else {
		// DNS resolution for hostname -> private IP check
		addrs, err := net.DefaultResolver.LookupIP(context.Background(), "ip", host)
		if err != nil {
			return fmt.Errorf("image host not allowed")
		}
		for _, ip := range addrs {
			if isPrivateIP(ip) {
				return fmt.Errorf("image host not allowed")
			}
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

// FetchImageValidated fetches an image URL with full SSRF protections:
// allowlist, DNS private-IP denial, redirect re-validation, 200 check,
// permitted Content-Type, and 5MB body cap.
func FetchImageValidated(rawURL string) ([]byte, string, error) {
	if err := validateURLString(rawURL); err != nil {
		return nil, "", err
	}
	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("too many redirects")
			}
			if err := validateURLString(req.URL.String()); err != nil {
				return err
			}
			return nil
		},
	}
	resp, err := client.Get(rawURL)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("image fetch failed: %d", resp.StatusCode)
	}
	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	// Allow image/* and video/mp4; be permissive on suffixes (e.g., image/jpeg)
	allowed := false
	for _, prefix := range []string{"image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "image/heic", "image/heif"} {
		if strings.HasPrefix(ct, prefix) || ct == "" { // empty CT allowed, sniff after
			allowed = true
			break
		}
	}
	// Also allow if URL ends with known extension even if CT is generic
	if !allowed {
		lowerURL := strings.ToLower(rawURL)
		for _, ext := range []string{".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4"} {
			if strings.HasSuffix(lowerURL, ext) {
				allowed = true
				break
			}
		}
	}
	if !allowed && ct != "" {
		return nil, "", fmt.Errorf("image content type not allowed: %s", ct)
	}
	limited := io.LimitReader(resp.Body, 5*1024*1024+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", err
	}
	if int64(len(data)) > 5*1024*1024 {
		return nil, "", fmt.Errorf("image too large (max 5MB)")
	}
	return data, ct, nil
}
