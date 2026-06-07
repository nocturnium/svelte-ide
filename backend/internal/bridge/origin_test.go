package bridge

import "testing"

func TestOriginAllowed(t *testing.T) {
	cases := []struct {
		name    string
		origin  string
		allowed []string
		want    bool
	}{
		{"empty origin (non-browser client)", "", nil, true},
		{"localhost any port", "http://localhost:5173", nil, true},
		{"loopback ip", "http://127.0.0.1:4173", nil, true},
		{"ipv6 loopback", "http://[::1]:8080", nil, true},
		{"foreign origin blocked by default", "https://evil.example", nil, false},
		{"wildcard allows all", "https://evil.example", []string{"*"}, true},
		{"explicit allow-list match", "https://app.example.com", []string{"https://app.example.com"}, true},
		{"explicit allow-list miss", "https://other.example.com", []string{"https://app.example.com"}, false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := OriginAllowed(c.origin, c.allowed); got != c.want {
				t.Errorf("OriginAllowed(%q, %v) = %v, want %v", c.origin, c.allowed, got, c.want)
			}
		})
	}
}
