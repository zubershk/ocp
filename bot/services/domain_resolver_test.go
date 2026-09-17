package services

import (
	"testing"
)

func TestNormalizeHost(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"victim.ocp.app", "victim.ocp.app", true},
		{"victim.ocp.app:443", "victim.ocp.app", true},
		{"victim.ocp.app.", "victim.ocp.app", true},
		{"a, b", "a", true},
		{"bad host", "", false},
		{"", "", false},
		{"evil.com ", "evil.com", true},
	}
	for _, tc := range cases {
		got, ok := normalizeHost(tc.in)
		if ok != tc.ok || got != tc.want {
			t.Fatalf("normalizeHost(%q)=%q,%v want %q,%v", tc.in, got, ok, tc.want, tc.ok)
		}
	}
}

func TestParseTrustedProxies(t *testing.T) {
	m := parseTrustedProxies("127.0.0.1/32, 10.0.0.0/8")
	if !m["127.0.0.1/32"] && !m["127.0.0.1"] {
		t.Fatalf("expected trusted map")
	}
}
