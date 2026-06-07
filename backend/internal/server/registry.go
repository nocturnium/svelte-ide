// Package server provides language server management and configuration.
package server

import (
	"encoding/json"
	"sync"
)

// Config holds the configuration for a language server.
type Config struct {
	Command   string   // Path to the language server executable
	Args      []string // Command line arguments
	Languages []string // Languages this server supports
	RootURI   string   // Workspace root URI (can be overridden per-connection)
}

// Registry manages available language server configurations.
type Registry struct {
	mu      sync.RWMutex
	configs map[string]Config
}

// NewRegistry creates a new language server registry.
func NewRegistry() *Registry {
	return &Registry{
		configs: make(map[string]Config),
	}
}

// Register adds a language server configuration to the registry.
func (r *Registry) Register(name string, cfg Config) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.configs[name] = cfg
}

// Get retrieves a language server configuration by name.
func (r *Registry) Get(name string) (Config, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	cfg, ok := r.configs[name]
	return cfg, ok
}

// GetByLanguage finds a language server configuration that supports the given language.
func (r *Registry) GetByLanguage(language string) (string, Config, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for name, cfg := range r.configs {
		for _, lang := range cfg.Languages {
			if lang == language {
				return name, cfg, true
			}
		}
	}
	return "", Config{}, false
}

// Configs returns a copy of all registered configurations.
func (r *Registry) Configs() map[string]Config {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make(map[string]Config, len(r.configs))
	for k, v := range r.configs {
		result[k] = v
	}
	return result
}

// InfoJSON returns server information as JSON.
func (r *Registry) InfoJSON() string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	info := struct {
		Servers map[string]struct {
			Command   string   `json:"command"`
			Languages []string `json:"languages"`
		} `json:"servers"`
	}{
		Servers: make(map[string]struct {
			Command   string   `json:"command"`
			Languages []string `json:"languages"`
		}),
	}

	for name, cfg := range r.configs {
		info.Servers[name] = struct {
			Command   string   `json:"command"`
			Languages []string `json:"languages"`
		}{
			Command:   cfg.Command,
			Languages: cfg.Languages,
		}
	}

	data, _ := json.Marshal(info)
	return string(data)
}
