//go:build !windows

package bridge

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nocturnium/svelte-ide/backend/internal/server"
)

func newTestBridge(t *testing.T, script string, maxSessions int) (*Handler, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "lsp.sh")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
	reg := server.NewRegistry()
	reg.Register("fake", server.Config{Command: path, Languages: []string{"fake"}})
	h := NewHandler(reg, nil, maxSessions)
	srv := httptest.NewServer(h)
	t.Cleanup(func() { h.Shutdown(); srv.Close() })
	return h, "ws" + strings.TrimPrefix(srv.URL, "http") + "/lsp?language=fake"
}

// When the language server exits, the client must see the socket close and
// the session slot must be released.
func TestSessionClosesWhenServerExits(t *testing.T) {
	h, url := newTestBridge(t, "exit 3\n", 1)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			if ne, ok := err.(interface{ Timeout() bool }); ok && ne.Timeout() {
				t.Fatal("socket stayed open after the language server exited")
			}
			break
		}
	}
	waitForSlots(t, h, 0)
}

// A server that never reads stdin must not wedge the session slot after the
// client disconnects.
func TestBlockedServerReleasesSlotOnDisconnect(t *testing.T) {
	h, url := newTestBridge(t, "exec sleep 600\n", 1)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	big := []byte(`{"jsonrpc":"2.0","method":"x","params":"` + strings.Repeat("y", 900*1024) + `"}`)
	for i := 0; i < 4; i++ {
		_ = conn.WriteMessage(websocket.TextMessage, big)
	}
	time.Sleep(200 * time.Millisecond)
	conn.Close()
	waitForSlots(t, h, 0)
}

func waitForSlots(t *testing.T, h *Handler, want int64) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if h.LiveSessions() == want {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("live sessions = %d, want %d", h.LiveSessions(), want)
}
