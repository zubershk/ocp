package services

import (
	"net"
	"os"
	"testing"
)

func TestIsPrivateIP(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.0.0.1", "172.16.5.4", "192.168.1.1", "0.0.0.0", "169.254.1.1", "::1", "::", "fc00::1", "fe80::1", "255.255.255.255"} {
		parsed := net.ParseIP(ip)
		if parsed == nil {
			t.Fatalf("failed to parse %s", ip)
		}
		if !isPrivateIP(parsed) {
			t.Fatalf("%s should be private", ip)
		}
	}
	for _, ip := range []string{"8.8.8.8", "1.1.1.1", "93.184.216.34"} {
		parsed := net.ParseIP(ip)
		if isPrivateIP(parsed) {
			t.Fatalf("%s should be public", ip)
		}
	}
}

func TestValidateExternalImageURL(t *testing.T) {
	// Need to test via direct function; set allowlist
	os.Setenv("IMAGE_ALLOWLIST", "cdn.example.com,*.allowed.com")
	os.Unsetenv("PUBLIC_BASE_URL")
	defer os.Unsetenv("IMAGE_ALLOWLIST")

	if err := ValidateExternalImageURL("https://cdn.example.com/img.jpg"); err != nil {
		t.Fatalf("allowlisted should pass: %v", err)
	}
	if err := ValidateExternalImageURL("https://foo.allowed.com/img.jpg"); err != nil {
		t.Fatalf("wildcard should pass: %v", err)
	}
	if err := ValidateExternalImageURL("https://evil.com/img.jpg"); err == nil {
		t.Fatal("non-allowlisted should fail")
	}
	// private IP literal
	if err := ValidateExternalImageURL("http://127.0.0.1/img.jpg"); err == nil {
		t.Fatal("loopback should fail")
	}
	// credentials
	if err := ValidateExternalImageURL("https://user:pass@cdn.example.com/img.jpg"); err == nil {
		t.Fatal("credentials should fail")
	}
	// non-default port
	if err := ValidateExternalImageURL("https://cdn.example.com:8080/img.jpg"); err == nil {
		t.Fatal("non-default port should fail")
	}
	// empty allowlist => uploads-only
	os.Unsetenv("IMAGE_ALLOWLIST")
	if err := ValidateExternalImageURL("https://cdn.example.com/img.jpg"); err == nil {
		t.Fatal("when allowlist empty, external should fail (uploads-only)")
	}
	// empty string allowed (text-only)
	if err := ValidateExternalImageURL(""); err != nil {
		t.Fatalf("empty should pass: %v", err)
	}
	// data: not handled here (returns nil)
	if err := ValidateExternalImageURL("data:image/png;base64,abcd"); err != nil {
		t.Fatalf("data: should be ignored here: %v", err)
	}
}
