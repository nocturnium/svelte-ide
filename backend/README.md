# LSP Bridge Server

A WebSocket-to-LSP bridge server written in Go that allows browser-based editors to communicate with native language servers.

## Architecture

```
Browser (Svelte IDE)
    ↕ WebSocket (JSON-RPC)
LSP Bridge Server
    ↕ stdio (JSON-RPC)
Language Server (gopls, tsserver, etc.)
```

## Features

- **Multi-language support**: Connect to any LSP-compliant language server
- **Session isolation**: Each client gets its own language server instance
- **Automatic lifecycle management**: Servers start on connect, stop on disconnect
- **Graceful shutdown**: Clean process termination
- **CORS enabled**: Works with local development

## Prerequisites

Install the language servers you want to use:

```bash
# Go (gopls)
go install golang.org/x/tools/gopls@latest

# TypeScript/JavaScript
npm install -g typescript-language-server typescript

# Python (pylsp)
pip install python-lsp-server

# Rust (rust-analyzer)
# Install from https://rust-analyzer.github.io/
```

## Building

```bash
cd backend
go mod tidy
go build -o lsp-bridge ./cmd/lsp-bridge
```

## Running

```bash
# Start with defaults
./lsp-bridge

# Custom port and paths
./lsp-bridge -addr :9000 -gopls /path/to/gopls

# Options:
#   -addr             Server address (default ":8765")
#   -allowed-origins  Comma-separated extra browser origins; localhost is always allowed
#   -gopls            Path to gopls (default "gopls")
#   -max-sessions     Maximum concurrent LSP sessions (default 32; 0 or negative means unlimited)
#   -tsserver         Path to typescript-language-server (default "typescript-language-server")
```

## Security

The bridge is intended for localhost and development use. It has no authentication, so any local web page on an allowed origin can connect to `/lsp`; this creates a cross-site WebSocket hijacking risk if an origin is too broad. Each accepted session spawns a native language server that can operate against the local filesystem.

Do not expose this server publicly. When embedding it in another application, set `-allowed-origins` explicitly for the trusted browser origin, avoid `*`, and use `-max-sessions` to cap concurrent language server sessions. The default `-max-sessions` value is `32`; set it to `0` or a negative value only if you intentionally want unlimited sessions.

## API Endpoints

### WebSocket: `/lsp?language=<lang>`

Connect via WebSocket to get an LSP session. The `language` parameter determines which language server to use.

```javascript
const ws = new WebSocket('ws://localhost:8765/lsp?language=go');
```

Supported languages:
- `go` - Uses gopls
- `typescript`, `javascript`, `typescriptreact`, `javascriptreact` - Uses typescript-language-server

### HTTP: `/health`

Returns server health status.

```json
{"status":"ok","version":"1.0.0"}
```

### HTTP: `/info`

Returns information about registered language servers.

```json
{
  "servers": {
    "go": {
      "command": "gopls",
      "languages": ["go"]
    },
    "typescript": {
      "command": "typescript-language-server",
      "languages": ["typescript", "javascript", "typescriptreact", "javascriptreact"]
    }
  }
}
```

## Usage Example

```javascript
import { createLSPClient } from '@nocturnium/svelte-ide';

// Connect to Go language server
const client = createLSPClient({
  serverUrl: 'ws://localhost:8765/lsp?language=go',
  rootUri: 'file:///path/to/project',
  clientInfo: { name: 'svelte-ide', version: '1.0.0' }
});

// Initialize connection
await client.connect();

// Open a file
await client.didOpen({
  textDocument: {
    uri: 'file:///path/to/project/main.go',
    languageId: 'go',
    version: 1,
    text: 'package main\n\nfunc main() {\n\t\n}'
  }
});

// Get completions at cursor position
const completions = await client.completion({
  textDocument: { uri: 'file:///path/to/project/main.go' },
  position: { line: 3, character: 1 }
});

// Handle diagnostics
client.onDiagnostics((params) => {
  console.log('Diagnostics for', params.uri, params.diagnostics);
});
```

## LSP Message Flow

1. **Initialize handshake**:
   - Client sends `initialize` request
   - Server responds with capabilities
   - Client sends `initialized` notification

2. **Document sync**:
   - `textDocument/didOpen` - Open a file
   - `textDocument/didChange` - File content changed
   - `textDocument/didClose` - Close a file

3. **Language features**:
   - `textDocument/completion` - Autocomplete
   - `textDocument/hover` - Hover information
   - `textDocument/signatureHelp` - Function signatures
   - `textDocument/definition` - Go to definition
   - `textDocument/references` - Find references
   - `textDocument/codeAction` - Quick fixes
   - `textDocument/formatting` - Format document

4. **Server notifications**:
   - `textDocument/publishDiagnostics` - Errors/warnings

## Adding Language Servers

Edit `cmd/lsp-bridge/main.go` to register additional servers:

```go
// Register Python language server
registry.Register("python", server.Config{
    Command:   "pylsp",
    Args:      []string{},
    Languages: []string{"python"},
})

// Register Rust analyzer
registry.Register("rust", server.Config{
    Command:   "rust-analyzer",
    Args:      []string{},
    Languages: []string{"rust"},
})
```

## Debugging

The server logs all JSON-RPC messages:

```
[Session go-123456] Client -> Server: initialize
[Session go-123456] Server -> Client: response for 0
[Session go-123456] Client -> Server: initialized
[Session go-123456] Client -> Server: textDocument/didOpen
[Session go-123456] Server -> Client: textDocument/publishDiagnostics
```

Set `DEBUG=1` for verbose logging:

```bash
DEBUG=1 ./lsp-bridge
```

## Production Considerations

1. **Process limits**: Use `-max-sessions` to limit concurrent language server processes
2. **Memory**: Language servers can be memory-intensive; monitor usage
3. **Security**: Restrict origins in production (update CORS settings)
4. **TLS**: Use a reverse proxy (nginx, caddy) for HTTPS/WSS
5. **Health checks**: Monitor `/health` endpoint

## License

MIT
