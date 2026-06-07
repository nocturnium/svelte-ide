# LSP and IntelliSense Integration Guide

This document covers the Language Server Protocol (LSP) integration for the Nocturnium Svelte IDE.

## Overview

### What is LSP?

The Language Server Protocol (LSP) is a protocol used between an editor/IDE and a language server that provides language features like:

- **Auto-completion** (IntelliSense)
- **Go to Definition**
- **Find References**
- **Hover Information**
- **Diagnostics** (errors, warnings)
- **Code Actions** (quick fixes, refactoring)
- **Rename Symbol**
- **Document Formatting**
- **Signature Help**

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Architecture                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     WebSocket      ┌──────────────────────┐   │
│  │  LSPEditor   │ ◄─────────────────► │  Go LSP Bridge       │   │
│  │  (Browser)   │     JSON-RPC        │  (backend/)          │   │
│  └──────────────┘                     └──────────┬───────────┘   │
│         │                                        │ stdio         │
│         │                              ┌─────────▼────────────┐  │
│  ┌──────▼──────┐                       │  Language Server     │  │
│  │ LSPClient   │                       │  (gopls, tsserver,   │  │
│  │ (WebSocket) │                       │   pylsp, etc.)       │  │
│  └─────────────┘                       └──────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Start the Go LSP Bridge

```bash
cd backend
go mod tidy
go build -o lsp-bridge ./cmd/lsp-bridge
./lsp-bridge
```

### 2. Use the LSPEditor Component

```svelte
<script>
  import { LSPEditor, createLSPClient } from '@nocturnium/svelte-ide';

  // Create LSP client
  const lspClient = createLSPClient({
    serverUrl: 'ws://localhost:8765/lsp?language=go',
    rootUri: 'file:///path/to/project',
    clientInfo: { name: 'my-editor', version: '1.0.0' }
  });

  // Connect when component mounts
  $effect(() => {
    lspClient.connect();
    return () => lspClient.disconnect();
  });

  let code = $state(`package main

func main() {

}`);
</script>

<LSPEditor
  content={code}
  uri="file:///path/to/project/main.go"
  language="go"
  {lspClient}
  onChange={(content) => code = content}
  onDiagnostics={(diagnostics) => console.log('Diagnostics:', diagnostics)}
/>
```

---

## Components

### LSPEditor

The main component that wraps `CustomEditor` with LSP features.

```svelte
<LSPEditor
  content={string}
  uri={string}
  language="go" | "typescript" | "javascript" | "python" | etc.
  lspClient={LSPClient}
  readonly={boolean}
  preferences={EditorPreferences}
  onChange={(content: string) => void}
  onCursorChange={(line: number, column: number) => void}
  onSave={() => void}
  onDiagnostics={(diagnostics: Diagnostic[]) => void}
/>
```

**Features:**
- Autocomplete (Ctrl+Space or triggered by typing)
- Hover tooltips (mouse hover with 500ms delay)
- Signature help (triggered by `(` and `,`)
- Inline diagnostics

### AutocompleteWidget

Displays completion suggestions dropdown.

```svelte
<AutocompleteWidget
  items={CompletionItem[]}
  selectedIndex={number}
  position={{ x: number, y: number }}
  onSelect={(item: CompletionItem) => void}
  onDismiss={() => void}
  onSelectionChange={(index: number) => void}
/>
```

### HoverTooltip

Shows type information and documentation on hover.

```svelte
<HoverTooltip
  hover={Hover}
  position={{ x: number, y: number }}
  onDismiss={() => void}
/>
```

### SignatureHelpWidget

Displays function signatures with active parameter highlighting.

```svelte
<SignatureHelpWidget
  signatureHelp={SignatureHelp}
  position={{ x: number, y: number }}
  onDismiss={() => void}
/>
```

### DiagnosticsPanel

Panel for displaying all errors/warnings in a list.

```svelte
<DiagnosticsPanel
  diagnostics={Map<string, Diagnostic[]>}
  severityFilter={DiagnosticSeverity | null}
  onNavigate={(uri: string, line: number, column: number) => void}
  onFilterChange={(severity: DiagnosticSeverity | null) => void}
/>
```

### DiagnosticMarker

Inline marker for diagnostics (squiggly underlines).

```svelte
<DiagnosticMarker
  diagnostic={Diagnostic}
  type="gutter" | "inline"
  onClick={() => void}
/>
```

---

## LSP Client

### Creating a Client

```typescript
import { createLSPClient, type LSPClientConfig } from '@nocturnium/svelte-ide';

const config: LSPClientConfig = {
  serverUrl: 'ws://localhost:8765/lsp?language=go',
  rootUri: 'file:///path/to/project',
  clientInfo: {
    name: 'my-editor',
    version: '1.0.0'
  },
  // Optional settings
  timeout: 30000,        // Request timeout (ms)
  autoReconnect: true,   // Reconnect on disconnect
  debug: false           // Log messages to console
};

const client = createLSPClient(config);
```

### Client API

```typescript
interface LSPClient {
  // Connection
  connect(): Promise<void>;
  disconnect(): void;
  readonly state: LSPConnectionState; // 'disconnected' | 'connecting' | 'connected' | 'error'

  // Document synchronization
  didOpen(params: DidOpenTextDocumentParams): Promise<void>;
  didChange(params: DidChangeTextDocumentParams): Promise<void>;
  didClose(params: DidCloseTextDocumentParams): Promise<void>;

  // Language features
  completion(params: CompletionParams): Promise<CompletionItem[] | CompletionList | null>;
  hover(params: HoverParams): Promise<Hover | null>;
  signatureHelp(params: SignatureHelpParams): Promise<SignatureHelp | null>;
  definition(params: DefinitionParams): Promise<Location | Location[] | null>;
  references(params: ReferenceParams): Promise<Location[] | null>;
  codeAction(params: CodeActionParams): Promise<CodeAction[] | null>;
  rename(params: RenameParams): Promise<WorkspaceEdit | null>;
  formatting(params: DocumentFormattingParams): Promise<TextEdit[] | null>;

  // Events
  onDiagnostics(handler: (params: PublishDiagnosticsParams) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  onStateChange(handler: (state: LSPConnectionState) => void): () => void;
}
```

### Usage Examples

#### Autocomplete

```typescript
const completions = await client.completion({
  textDocument: { uri: 'file:///path/to/file.go' },
  position: { line: 10, character: 5 }
});

for (const item of completions ?? []) {
  console.log(item.label, item.kind, item.detail);
}
```

#### Hover

```typescript
const hover = await client.hover({
  textDocument: { uri: 'file:///path/to/file.go' },
  position: { line: 10, character: 5 }
});

if (hover) {
  console.log('Hover contents:', hover.contents);
}
```

#### Go to Definition

```typescript
const locations = await client.definition({
  textDocument: { uri: 'file:///path/to/file.go' },
  position: { line: 10, character: 5 }
});

if (locations) {
  for (const loc of Array.isArray(locations) ? locations : [locations]) {
    console.log(`${loc.uri}:${loc.range.start.line}:${loc.range.start.character}`);
  }
}
```

#### Diagnostics

```typescript
client.onDiagnostics((params) => {
  console.log(`Diagnostics for ${params.uri}:`);
  for (const diag of params.diagnostics) {
    const severity = ['', 'Error', 'Warning', 'Info', 'Hint'][diag.severity ?? 1];
    console.log(`  ${severity}: ${diag.message} at line ${diag.range.start.line + 1}`);
  }
});
```

---

## Go Backend

### Building

```bash
cd backend
go mod tidy
go build -o lsp-bridge ./cmd/lsp-bridge
```

### Running

```bash
# Default (port 8765)
./lsp-bridge

# Custom port
./lsp-bridge -addr :9000

# Custom language server paths
./lsp-bridge -gopls /custom/path/gopls -tsserver /custom/path/tsserver
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:8765/lsp?language=go` | WebSocket LSP connection for Go |
| `ws://localhost:8765/lsp?language=typescript` | WebSocket LSP connection for TypeScript |
| `GET /health` | Health check |
| `GET /info` | Registered language servers |

### Adding Language Servers

Edit `backend/cmd/lsp-bridge/main.go`:

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

### Prerequisites

Install the language servers you want to use:

```bash
# Go (gopls)
go install golang.org/x/tools/gopls@latest

# TypeScript/JavaScript
npm install -g typescript-language-server typescript

# Python
pip install python-lsp-server

# Rust
# Install from https://rust-analyzer.github.io/
```

---

## Types

### Core Types

```typescript
interface Position {
  line: number;      // 0-indexed
  character: number; // 0-indexed (UTF-16 code units)
}

interface Range {
  start: Position;
  end: Position;
}

interface Location {
  uri: string;
  range: Range;
}

interface TextEdit {
  range: Range;
  newText: string;
}
```

### Diagnostics

```typescript
interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity; // 1=Error, 2=Warning, 3=Info, 4=Hint
  code?: string | number;
  source?: string;
  message: string;
  tags?: DiagnosticTag[];
  relatedInformation?: DiagnosticRelatedInformation[];
}
```

### Completion

```typescript
interface CompletionItem {
  label: string;
  kind?: CompletionItemKind; // 1=Text, 2=Method, 3=Function, etc.
  detail?: string;
  documentation?: string | MarkupContent;
  insertText?: string;
  insertTextFormat?: InsertTextFormat;
  textEdit?: TextEdit;
  additionalTextEdits?: TextEdit[];
}
```

### Hover

```typescript
interface Hover {
  contents: MarkupContent | MarkedString | MarkedString[];
  range?: Range;
}

interface MarkupContent {
  kind: 'plaintext' | 'markdown';
  value: string;
}
```

### Signature Help

```typescript
interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

interface SignatureInformation {
  label: string;
  documentation?: string | MarkupContent;
  parameters?: ParameterInformation[];
  activeParameter?: number;
}

interface ParameterInformation {
  label: string | [number, number];
  documentation?: string | MarkupContent;
}
```

---

## Advanced Usage

### Custom LSP Provider

You can implement your own LSP client if you have a different backend:

```typescript
import type { LSPClient } from '@nocturnium/svelte-ide';

class MyLSPClient implements LSPClient {
  // Implement all required methods
  async connect() { /* ... */ }
  disconnect() { /* ... */ }
  // etc.
}
```

### Web Worker Integration

For better performance, run the LSP client in a Web Worker:

```typescript
// lsp-worker.ts
import { createLSPClient } from '@nocturnium/svelte-ide';

const client = createLSPClient({ /* config */ });

self.onmessage = async (e) => {
  const { id, method, params } = e.data;
  try {
    const result = await (client as any)[method](...params);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
```

### Multiple Language Support

The editor can switch languages dynamically:

```svelte
<script>
  let language = $state('go');
  let clients = {
    go: createLSPClient({ serverUrl: 'ws://localhost:8765/lsp?language=go', /* ... */ }),
    typescript: createLSPClient({ serverUrl: 'ws://localhost:8765/lsp?language=typescript', /* ... */ })
  };
</script>

<select bind:value={language}>
  <option value="go">Go</option>
  <option value="typescript">TypeScript</option>
</select>

<LSPEditor
  {language}
  lspClient={clients[language]}
  {content}
/>
```

---

## Performance Tips

1. **Debounce Changes**: The LSP client automatically debounces `didChange` notifications
2. **Request Cancellation**: Cancel in-flight requests when new ones come in
3. **Lazy Loading**: Only load LSP components when needed
4. **Connection Pooling**: Reuse connections across editors for the same language

---

## Popular Language Servers

| Language | Server | Installation |
|----------|--------|--------------|
| TypeScript/JavaScript | typescript-language-server | `npm i -g typescript-language-server typescript` |
| Go | gopls | `go install golang.org/x/tools/gopls@latest` |
| Python | pylsp | `pip install python-lsp-server` |
| Rust | rust-analyzer | `rustup component add rust-analyzer` |
| C/C++ | clangd | `apt install clangd` or download from releases |
| Java | jdtls | Eclipse JDT Language Server |
| PHP | intelephense | `npm i -g intelephense` |
| Ruby | solargraph | `gem install solargraph` |
| Svelte | svelte-language-server | `npm i -g svelte-language-server` |
| HTML/CSS | vscode-langservers | `npm i -g vscode-langservers-extracted` |

---

## Troubleshooting

### Connection Issues

```typescript
client.onError((error) => {
  console.error('LSP Error:', error);
});

client.onStateChange((state) => {
  console.log('LSP State:', state);
});
```

### Debugging

Enable debug mode to see all JSON-RPC messages:

```typescript
const client = createLSPClient({
  // ...
  debug: true
});
```

### Language Server Logs

The Go bridge logs all messages:

```
[Session go-123456] Client -> Server: initialize
[Session go-123456] Server -> Client: response for 0
[Session go-123456] Client -> Server: textDocument/didOpen
[Session go-123456] Server -> Client: textDocument/publishDiagnostics
```
