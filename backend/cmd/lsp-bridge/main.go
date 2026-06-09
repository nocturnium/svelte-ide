// LSP Bridge Server
//
// This server acts as a WebSocket-to-LSP bridge, allowing browser-based editors
// to communicate with native language servers (gopls, typescript-language-server, etc.)
//
// Architecture:
//   Browser <--WebSocket--> LSP Bridge <--stdio--> Language Server
//
// The bridge handles:
//   - WebSocket connection management
//   - Language server lifecycle (spawn, restart, shutdown)
//   - JSON-RPC message routing
//   - Multi-language support via server registry

package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/nocturnium/svelte-ide/backend/internal/bridge"
	"github.com/nocturnium/svelte-ide/backend/internal/server"
)

func main() {
	// Configuration flags
	addr := flag.String("addr", ":8765", "Server address")
	gopls := flag.String("gopls", "gopls", "Path to gopls binary")
	tsserver := flag.String("tsserver", "typescript-language-server", "Path to typescript-language-server")
	maxSessions := flag.Int("max-sessions", 32, "Maximum concurrent LSP sessions; 0 or negative means unlimited")
	originsFlag := flag.String("allowed-origins", "",
		"Comma-separated extra browser origins allowed to connect (e.g. https://app.example.com). "+
			"localhost is always allowed; use '*' to allow any origin (NOT recommended — the bridge runs language servers against your filesystem).")
	flag.Parse()

	// Parse the allowed-origins list (localhost is always permitted; see bridge.OriginAllowed).
	var allowedOrigins []string
	for _, o := range strings.Split(*originsFlag, ",") {
		if o = strings.TrimSpace(o); o != "" {
			allowedOrigins = append(allowedOrigins, o)
		}
	}

	// Create server registry with available language servers
	registry := server.NewRegistry()

	// Register Go language server (gopls)
	registry.Register("go", server.Config{
		Command:   *gopls,
		Args:      []string{"serve"},
		Languages: []string{"go"},
	})

	// Register TypeScript language server
	registry.Register("typescript", server.Config{
		Command:   *tsserver,
		Args:      []string{"--stdio"},
		Languages: []string{"typescript", "javascript", "typescriptreact", "javascriptreact"},
	})

	// Create the bridge handler
	bridgeHandler := bridge.NewHandler(registry, allowedOrigins, *maxSessions)

	// Setup HTTP routes
	mux := http.NewServeMux()

	// WebSocket endpoint for LSP connections
	mux.HandleFunc("/lsp", bridgeHandler.HandleWebSocket)

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","version":"1.0.0"}`))
	})

	// Server info endpoint
	mux.HandleFunc("/info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(registry.InfoJSON()))
	})

	// Create HTTP server with timeouts
	httpServer := &http.Server{
		Addr:         *addr,
		Handler:      corsMiddleware(mux, allowedOrigins),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Recovered panic in HTTP server goroutine: %v", r)
			}
		}()

		log.Printf("🚀 LSP Bridge server starting on %s", *addr)
		log.Printf("   WebSocket endpoint: ws://localhost%s/lsp", *addr)
		log.Printf("   Health check: http://localhost%s/health", *addr)
		log.Printf("   Server info: http://localhost%s/info", *addr)
		if *maxSessions <= 0 {
			log.Println("   Max sessions: unlimited")
		} else {
			log.Printf("   Max sessions: %d", *maxSessions)
		}
		if len(allowedOrigins) == 1 && allowedOrigins[0] == "*" {
			log.Println("   ⚠️  Origin policy: ALL origins allowed ('*') — do not expose this server publicly")
		} else if len(allowedOrigins) > 0 {
			log.Printf("   Origin policy: localhost + %v", allowedOrigins)
		} else {
			log.Println("   Origin policy: localhost only (use -allowed-origins to add more)")
		}
		log.Println()
		log.Println("Registered language servers:")
		for name, cfg := range registry.Configs() {
			log.Printf("   %s: %s %v", name, cfg.Command, cfg.Args)
		}

		if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Graceful shutdown on SIGINT/SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("\n🛑 Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Shutdown bridge (kills all language servers)
	bridgeHandler.Shutdown()

	// Shutdown HTTP server
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	log.Println("Server stopped")
}

// corsMiddleware reflects the request Origin only when it is allowed, instead of
// sending a blanket "*". The allow-list mirrors the WebSocket origin check.
func corsMiddleware(next http.Handler, allowedOrigins []string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && bridge.OriginAllowed(origin, allowedOrigins) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
