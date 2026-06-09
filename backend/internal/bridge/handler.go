// Package bridge provides the WebSocket-to-LSP bridge implementation.
package bridge

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nocturnium/svelte-ide/backend/internal/server"
)

const (
	// WebSocket configuration
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1024 * 1024 // 1MB
)

// OriginAllowed reports whether a browser Origin may access the bridge.
//
// Because the bridge spawns native language servers against the local
// filesystem, it must not be drivable by arbitrary web pages. The policy:
//   - an empty Origin (non-browser clients such as curl or native apps) is allowed;
//   - localhost / 127.0.0.1 / ::1 on any port is always allowed (dev convenience);
//   - any other origin must be listed explicitly in allowed, or allowed must
//     contain the single entry "*" (opt-in, NOT recommended for exposed servers).
func OriginAllowed(origin string, allowed []string) bool {
	if origin == "" {
		return true
	}
	for _, a := range allowed {
		if a == "*" || a == origin {
			return true
		}
	}
	if u, err := url.Parse(origin); err == nil {
		switch u.Hostname() {
		case "localhost", "127.0.0.1", "::1":
			return true
		}
	}
	return false
}

// Handler manages WebSocket connections and language server processes.
type Handler struct {
	registry       *server.Registry
	allowedOrigins []string
	maxSessions    int
	liveSessions   int64
	upgrader       websocket.Upgrader
	sessions       sync.Map // map[string]*Session
}

// NewHandler creates a new bridge handler. allowedOrigins is an optional list of
// extra browser origins permitted to open WebSocket connections; localhost is
// always allowed, and a single "*" entry allows any origin (development only).
func NewHandler(registry *server.Registry, allowedOrigins []string, maxSessions int) *Handler {
	h := &Handler{
		registry:       registry,
		allowedOrigins: allowedOrigins,
		maxSessions:    maxSessions,
	}
	h.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return OriginAllowed(r.Header.Get("Origin"), h.allowedOrigins)
		},
	}
	return h
}

func (h *Handler) acquireSessionSlot() bool {
	if h.maxSessions <= 0 {
		return true
	}
	maxSessions := int64(h.maxSessions)
	for {
		current := atomic.LoadInt64(&h.liveSessions)
		if current >= maxSessions {
			return false
		}
		if atomic.CompareAndSwapInt64(&h.liveSessions, current, current+1) {
			return true
		}
	}
}

func (h *Handler) releaseSessionSlot() {
	if h.maxSessions <= 0 {
		return
	}
	atomic.AddInt64(&h.liveSessions, -1)
}

// Session represents a client connection with its language server.
type Session struct {
	id       string
	conn     *websocket.Conn
	process  *server.Process
	language string
	mu       sync.Mutex
	closed   bool
}

// HandleWebSocket handles incoming WebSocket connections.
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Get language from query parameter
	language := r.URL.Query().Get("language")
	if language == "" {
		http.Error(w, "Missing 'language' query parameter", http.StatusBadRequest)
		return
	}

	// Find a server that supports this language
	serverName, cfg, found := h.registry.GetByLanguage(language)
	if !found {
		http.Error(w, fmt.Sprintf("No language server found for '%s'", language), http.StatusNotFound)
		return
	}

	if !h.acquireSessionSlot() {
		http.Error(w, "Maximum LSP sessions reached", http.StatusServiceUnavailable)
		return
	}

	// Upgrade to WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.releaseSessionSlot()
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	// Create session
	sessionID := fmt.Sprintf("%s-%d", serverName, time.Now().UnixNano())
	session := &Session{
		id:       sessionID,
		conn:     conn,
		language: language,
	}

	// Store session
	h.sessions.Store(sessionID, session)

	log.Printf("[Session %s] New connection for language: %s", sessionID, language)

	// Start language server process
	process := server.NewProcess(cfg)
	if err := process.Start(); err != nil {
		log.Printf("[Session %s] Failed to start language server: %v", sessionID, err)
		conn.WriteJSON(map[string]interface{}{
			"jsonrpc": "2.0",
			"error": map[string]interface{}{
				"code":    -32002,
				"message": fmt.Sprintf("Failed to start language server: %v", err),
			},
		})
		h.closeSession(session)
		return
	}
	session.process = process

	// Handle bidirectional message routing
	go func() {
		defer h.recoverGoroutine(session.id, "routeClientToServer")
		h.routeClientToServer(session)
	}()
	go func() {
		defer h.recoverGoroutine(session.id, "routeServerToClient")
		h.routeServerToClient(session)
	}()
}

// routeClientToServer forwards messages from WebSocket client to language server.
func (h *Handler) routeClientToServer(session *Session) {
	defer h.closeSession(session)

	session.conn.SetReadLimit(maxMessageSize)
	session.conn.SetReadDeadline(time.Now().Add(pongWait))
	session.conn.SetPongHandler(func(string) error {
		session.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := session.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Session %s] WebSocket read error: %v", session.id, err)
			}
			return
		}

		// Parse JSON-RPC message to log it
		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err == nil {
			if method, ok := msg["method"].(string); ok {
				log.Printf("[Session %s] Client -> Server: %s", session.id, method)
			}
		}

		// Forward to language server
		if err := session.process.Send(json.RawMessage(message)); err != nil {
			log.Printf("[Session %s] Failed to send to LSP: %v", session.id, err)
			return
		}
	}
}

// routeServerToClient forwards messages from language server to WebSocket client.
func (h *Handler) routeServerToClient(session *Session) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-session.process.Messages():
			if !ok {
				return
			}

			// Parse JSON-RPC message to log it
			var parsed map[string]interface{}
			if err := json.Unmarshal(msg, &parsed); err == nil {
				if method, ok := parsed["method"].(string); ok {
					log.Printf("[Session %s] Server -> Client: %s", session.id, method)
				} else if id, ok := parsed["id"]; ok {
					log.Printf("[Session %s] Server -> Client: response for %v", session.id, id)
				}
			}

			session.mu.Lock()
			session.conn.SetWriteDeadline(time.Now().Add(writeWait))
			err := session.conn.WriteMessage(websocket.TextMessage, msg)
			session.mu.Unlock()

			if err != nil {
				log.Printf("[Session %s] WebSocket write error: %v", session.id, err)
				return
			}

		case err, ok := <-session.process.Errors():
			if ok && err != nil {
				log.Printf("[Session %s] LSP error: %v", session.id, err)
				// Send error notification to client
				session.mu.Lock()
				session.conn.WriteJSON(map[string]interface{}{
					"jsonrpc": "2.0",
					"method":  "$/error",
					"params": map[string]interface{}{
						"message": err.Error(),
					},
				})
				session.mu.Unlock()
			}

		case <-ticker.C:
			session.mu.Lock()
			session.conn.SetWriteDeadline(time.Now().Add(writeWait))
			err := session.conn.WriteMessage(websocket.PingMessage, nil)
			session.mu.Unlock()

			if err != nil {
				return
			}
		}
	}
}

// closeSession cleans up a session.
func (h *Handler) closeSession(session *Session) {
	session.mu.Lock()
	if session.closed {
		session.mu.Unlock()
		return
	}
	session.closed = true
	session.mu.Unlock()

	log.Printf("[Session %s] Closing session", session.id)

	if session.process != nil {
		session.process.Stop()
	}

	session.conn.Close()
	h.sessions.Delete(session.id)
	h.releaseSessionSlot()
}

// Shutdown closes all sessions and stops all language servers.
func (h *Handler) Shutdown() {
	h.sessions.Range(func(key, value interface{}) bool {
		if session, ok := value.(*Session); ok {
			h.closeSession(session)
		}
		return true
	})
}

func (h *Handler) recoverGoroutine(sessionID, name string) {
	if r := recover(); r != nil {
		log.Printf("[Session %s] Recovered panic in %s: %v", sessionID, name, r)
	}
}
