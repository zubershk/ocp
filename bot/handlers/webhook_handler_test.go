package handlers

import (
	"strconv"
	"testing"
	"time"
)

func TestResolveSenderPhone(t *testing.T) {
	tests := []struct {
		name   string
		data   map[string]interface{}
		info   map[string]interface{}
		keyMap map[string]interface{}
		sender string
		want   string
	}{
		{
			name:   "plain PN sender",
			sender: "919876543210@s.whatsapp.net",
			want:   "9876543210",
		},
		{
			name:   "LID sender with PN SenderAlt wins",
			info:   map[string]interface{}{"Sender": "104080529731775@lid", "SenderAlt": "919876543210@s.whatsapp.net"},
			sender: "104080529731775@lid",
			want:   "9876543210",
		},
		{
			name:   "LID sender with bare PN Chat wins",
			info:   map[string]interface{}{"Sender": "104080529731775@lid", "Chat": "919876543210@s.whatsapp.net"},
			sender: "104080529731775@lid",
			want:   "9876543210",
		},
		{
			name:   "LID-only sender falls back to LID row",
			sender: "104080529731775@lid",
			want:   "104080529731775",
		},
		{
			name:   "LID SenderAlt is ignored, PN remoteJidAlt used",
			info:   map[string]interface{}{"Sender": "104080529731775@lid", "SenderAlt": "276372622684178@lid"},
			keyMap: map[string]interface{}{"remoteJidAlt": "919876543210@s.whatsapp.net"},
			sender: "104080529731775@lid",
			want:   "9876543210",
		},
		{
			name:   "remoteJidAlt as user/server object",
			keyMap: map[string]interface{}{"remoteJidAlt": map[string]interface{}{"user": "919876543210", "server": "s.whatsapp.net"}},
			sender: "38809425154277@lid",
			want:   "9876543210",
		},
		{
			name:   "senderPn on data",
			data:   map[string]interface{}{"senderPn": "919876543210@s.whatsapp.net"},
			sender: "59622769614968@lid",
			want:   "9876543210",
		},
		{
			name:   "group participant LID with participantPn",
			keyMap: map[string]interface{}{"remoteJid": "120363012345@g.us", "participantPn": "918367293998@s.whatsapp.net"},
			sender: "120363012345@g.us",
			want:   "8367293998",
		},
		{
			name:   "91-prefixed PN canonicalized",
			info:   map[string]interface{}{"SenderAlt": "919167719331@s.whatsapp.net"},
			sender: "271673945251993@lid",
			want:   "9167719331",
		},
		{
			name:   "empty sender yields empty",
			sender: "",
			want:   "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolveSenderPhone(tt.data, tt.info, tt.keyMap, tt.sender); got != tt.want {
				t.Fatalf("resolveSenderPhone() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCleanPhoneStrict(t *testing.T) {
	tests := []struct{ in, want string }{
		{"919876543210@s.whatsapp.net", "9876543210"},
		{"9876543210@s.whatsapp.net", "9876543210"},
		{"09876543210@s.whatsapp.net", "9876543210"},
		{"9876543210", "9876543210"},
		{"104080529731775@lid", ""},
		{"120363012345@g.us", ""},
		{"12345@s.whatsapp.net", ""},
		{"", ""},
	}
	for _, tt := range tests {
		if got := cleanPhoneStrict(tt.in); got != tt.want {
			t.Fatalf("cleanPhoneStrict(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestMessageSendTime(t *testing.T) {
	now := time.Now().UTC()
	tests := []struct {
		name  string
		data  map[string]interface{}
		info  map[string]interface{}
		want  time.Time
		wantOK bool
	}{
		{
			name:   "RFC3339 in Info.Timestamp",
			info:   map[string]interface{}{"Timestamp": now.Add(-time.Hour).Format(time.RFC3339)},
			want:   now.Add(-time.Hour).Truncate(time.Second),
			wantOK: true,
		},
		{
			name:   "unix float in data.timestamp (ButtonClick shape)",
			data:   map[string]interface{}{"timestamp": float64(now.Add(-time.Hour).Unix())},
			want:   now.Add(-time.Hour).Truncate(time.Second),
			wantOK: true,
		},
		{
			name:   "unix string digits",
			info:   map[string]interface{}{"Timestamp": strconv.FormatInt(now.Add(-time.Hour).Unix(), 10)},
			want:   now.Add(-time.Hour).Truncate(time.Second),
			wantOK: true,
		},
		{
			name:   "lowercase info key",
			info:   map[string]interface{}{"timestamp": now.Add(-time.Hour).Format(time.RFC3339)},
			want:   now.Add(-time.Hour).Truncate(time.Second),
			wantOK: true,
		},
		{
			name:   "missing everywhere fails open",
			wantOK: false,
		},
		{
			name:   "garbage string fails open",
			info:   map[string]interface{}{"Timestamp": "not-a-time"},
			wantOK: false,
		},
		{
			name:   "zero/unset timestamp fails open (never silently drop live)",
			info:   map[string]interface{}{"Timestamp": "1970-01-01T00:00:00Z"},
			wantOK: false,
		},
		{
			name:   "future timestamp parses (never stale)",
			info:   map[string]interface{}{"Timestamp": now.Add(time.Hour).Format(time.RFC3339)},
			want:   now.Add(time.Hour).Truncate(time.Second),
			wantOK: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := messageSendTime(tt.data, tt.info)
			if ok != tt.wantOK {
				t.Fatalf("messageSendTime() ok = %v, want %v", ok, tt.wantOK)
			}
			if ok && !got.Equal(tt.want) {
				t.Fatalf("messageSendTime() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsStaleMessage(t *testing.T) {
	ttl := 120 * time.Second
	tests := []struct {
		name string
		ts   time.Time
		want bool
	}{
		{"offline backlog (3h old) is stale", time.Now().Add(-3 * time.Hour), true},
		{"just over TTL is stale", time.Now().Add(-121 * time.Second), true},
		{"fresh message is live", time.Now().Add(-5 * time.Second), false},
		{"future (clock skew) is never stale", time.Now().Add(time.Hour), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isStaleMessage(tt.ts, ttl); got != tt.want {
				t.Fatalf("isStaleMessage(%v) = %v, want %v", tt.ts, got, tt.want)
			}
		})
	}
}
