package handlers

import "testing"

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
