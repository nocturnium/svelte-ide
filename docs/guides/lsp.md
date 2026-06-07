# Language Server Protocol (LSP)

The Language Server Protocol turns the editor into an IDE: autocomplete, hover documentation, signature help, go-to-definition, find-references, rename, formatting, and live diagnostics (errors and warnings), all powered by the same native language servers that VS Code uses (`gopls`, `typescript-language-server`, `pylsp`, `rust-analyzer`, and so on). `@nocturnium/svelte-ide` ships an `LSPClient` that speaks JSON-RPC over a WebSocket, an `<LSPEditor>` component that wires those features into the editor, and a set of UI widgets for completions, hovers, signatures, and diagnostics. Because browsers cannot spawn native processes, you also run a small **bridge** server that relays between the WebSocket and the language server's stdio; a ready-to-run Go bridge lives in [`backend/`](../../backend/README.md).

> This guide is consumer-facing. For low-level protocol details (the full JSON-RPC message flow, type shapes, and message logs), see [LSP_INTEGRATION.md](../LSP_INTEGRATION.md).

---

## How it fits together

```
┌──────────────┐   WebSocket / JSON-RPC   ┌──────────────────┐   stdio   ┌──────────────────┐
│  <LSPEditor> │ ◄──────────────────────► │   LSP bridge      │ ◄───────► │ Language server  │
│  + LSPClient │                          │  (backend/, Go)   │           │ gopls, tsserver… │
└──────────────┘                          └──────────────────┘           └──────────────────┘
       browser                                    your host                     your host
```

You supply three things:

1. A **bridge** reachable over WebSocket (the bundled Go server, or any LSP-over-WebSocket server).
2. An **`LSPClient`**, created with `createLSPClient(...)` and pointed at that bridge.
3. An **`<LSPEditor>`** (or the lower-level client API) that consumes the client.

The WebSocket URL is always caller-supplied — nothing is baked into the package.

---

## Installing the editor and importing

LSP support is part of the main package; there is nothing extra to install:

```bash
npm install @nocturnium/svelte-ide
```

Remember to import the theme once in your app so the editor and widgets are styled (see [Getting Started](../getting-started.md) and [Theming](../theming.md)):

```js
import "@nocturnium/svelte-ide/theme.css";
```

LSP exports are available from the package root and from the `./components/lsp` subpath:

```ts
import {
  createLSPClient,
  LSPClient,
  LSPEditor,
  // UI widgets
  AutocompleteWidget,
  HoverTooltip,
  SignatureHelpWidget,
  DiagnosticsPanel,
  DiagnosticMarker
} from "@nocturnium/svelte-ide";

// Types live in the type surface (also re-exported from root):
import type {
  LSPClientConfig,
  LSPConnectionState,
  ServerCapabilities,
  Diagnostic,
  DiagnosticSeverity,
  CompletionItem,
  Hover,
  SignatureHelp,
  Position,
  Range,
  Location
} from "@nocturnium/svelte-ide";
```

---

## The `LSPClient` API

`createLSPClient(config)` returns an `LSPClient` instance. (`new LSPClient(config)` is equivalent — the factory is the conventional entry point.)

### Configuration

```ts
import { createLSPClient } from "@nocturnium/svelte-ide";

const client = createLSPClient({
  // Required
  serverUrl: "ws://localhost:8765/lsp?language=go", // your bridge endpoint
  rootUri: "file:///path/to/project",               // workspace root

  // Optional (defaults shown)
  autoReconnect: true,        // reconnect automatically when the socket drops
  reconnectDelay: 1000,       // base backoff in ms (multiplied by attempt count)
  maxReconnectAttempts: 5,    // give up after this many tries
  requestTimeout: 30000,      // reject a request after this many ms
  debug: false                // console.log every JSON-RPC message
});
```

`LSPClientConfig` fields:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `serverUrl` | `string` | — | WebSocket URL of the bridge. Required. |
| `rootUri` | `string` | — | `file://` URI of the workspace root. Required. |
| `autoReconnect` | `boolean` | `true` | Reconnect on unexpected disconnect. |
| `reconnectDelay` | `number` | `1000` | Backoff base in ms; delay grows linearly with the attempt count (`reconnectDelay × attempt`). |
| `maxReconnectAttempts` | `number` | `5` | Stop reconnecting after this many failures. |
| `requestTimeout` | `number` | `30000` | Per-request timeout in ms. |
| `debug` | `boolean` | `false` | Log all traffic to the console. |

### Connection lifecycle

```ts
await client.connect();   // opens the socket and performs the LSP initialize handshake
// ... use the client ...
await client.disconnect(); // sends shutdown/exit, closes the socket, stops reconnecting
```

`connect()` resolves once the server has responded to `initialize` and the client has sent `initialized` — at that point `client.isReady` is `true`. The connection moves through these states (`LSPConnectionState`):

```
disconnected → connecting → connected → initializing → ready
```

| State | Meaning |
| --- | --- |
| `disconnected` | No socket open (initial state, or after `disconnect()`). |
| `connecting` | WebSocket is opening. |
| `connected` | Socket is open; the `initialize` handshake is about to run. |
| `initializing` | `initialize` request sent, awaiting server capabilities. |
| `ready` | Handshake complete; language features are usable. |
| `error` | The connection failed while opening the socket. |

> `connect()` only starts from `disconnected` or `error`; calling it again while already connecting/ready is a no-op. On an unexpected socket drop the client returns to `disconnected` and (if `autoReconnect` is on) schedules a reconnect.

Read the current state and capabilities directly off the instance:

```ts
client.state;        // LSPConnectionState
client.isReady;      // boolean — true only when state === 'ready'
client.capabilities; // ServerCapabilities | null (populated after initialize)
```

### Events

Subscribe with `on(event, handler)`. Each call returns an unsubscribe function. The four events come from `LSPClientEvents`:

```ts
const offState = client.on("onConnectionStateChange", (state) => {
  console.log("LSP state:", state);
});

const offDiag = client.on("onDiagnostics", (params) => {
  // params.uri, params.diagnostics
  console.log(params.uri, params.diagnostics);
});

const offCaps = client.on("onServerCapabilities", (capabilities) => {
  console.log("server can:", capabilities);
});

const offErr = client.on("onError", (err) => {
  console.error("LSP error:", err);
});

// Later: offState(); offDiag(); offCaps(); offErr();
```

> Only one handler per event name is retained — registering a new handler for the same event replaces the previous one. For diagnostics you usually subscribe once at the client level (or let `<LSPEditor>` handle it for you).

### Document synchronization

The client tracks open documents and their versions for you. Notify it as the buffer changes:

```ts
client.didOpen(uri, languageId, version, text);     // start tracking a file
client.didChange(uri, version, contentChanges);     // content changed (bump version)
client.didSave(uri, text?);                         // optional: file was saved
client.didClose(uri);                               // stop tracking; clears cached diagnostics
```

`contentChanges` is an array of `TextDocumentContentChangeEvent`. The simplest, always-correct form is a full-document replacement:

```ts
client.didChange(uri, 2, [{ text: newFullContent }]);
```

When you drive the editor through `<LSPEditor>`, all four of these are called for you.

### Language features

Every feature method first checks the relevant server capability and short-circuits (returning `[]` or `null`) when the server does not advertise it — so you can call them unconditionally. Positions are **zero-based** (`{ line, character }`).

```ts
// Autocomplete — returns CompletionItem[]
const items = await client.completion(uri, { line, character });
// triggerKind/triggerCharacter are optional 3rd/4th args:
//   client.completion(uri, pos, 2, ".")  // 2 = triggered by a character
const resolved = await client.completionResolve(items[0]); // fill in lazy fields

// Hover docs — Hover | null
const hover = await client.hover(uri, { line, character });

// Signature help — SignatureHelp | null
const sig = await client.signatureHelp(uri, { line, character }, "(");

// Navigation — Location[]
const defs = await client.definition(uri, { line, character });
const typeDefs = await client.typeDefinition(uri, { line, character });
const refs = await client.references(uri, { line, character }, /* includeDeclaration */ true);

// Refactors
const prep = await client.prepareRename(uri, { line, character }); // Range | {range, placeholder} | null
const edit = await client.rename(uri, { line, character }, "newName"); // WorkspaceEdit | null

// Quick fixes for a range, optionally scoped to diagnostics
const actions = await client.codeAction(uri, range, diagnostics);

// Formatting — TextEdit[]
const edits = await client.formatting(uri, { tabSize: 2, insertSpaces: true });
```

> `formatting`'s `options` argument is optional; omitted fields fall back to `tabSize: 2` and `insertSpaces: true`.

### Diagnostics

Diagnostics arrive asynchronously as the server analyzes your code. The client caches the latest set per file and emits `onDiagnostics`:

```ts
client.on("onDiagnostics", ({ uri, diagnostics }) => {
  for (const d of diagnostics) {
    // d.severity: 1=Error, 2=Warning, 3=Information, 4=Hint (DiagnosticSeverity)
    // d.message, d.range, d.code, d.source
  }
});

// Or pull the cached set at any time:
const current = client.getDiagnostics(uri);     // Diagnostic[]
const all = client.getAllDiagnostics();          // Map<string, Diagnostic[]>
```

### Capability helpers

```ts
client.supportsFeature("renameProvider");          // boolean
client.getCompletionTriggerCharacters();           // string[] e.g. ['.', '"']
client.getSignatureHelpTriggerCharacters();        // string[] e.g. ['(', ',']
```

`ServerCapabilities` mirrors the LSP spec — `completionProvider`, `hoverProvider`, `signatureHelpProvider`, `definitionProvider`, `referencesProvider`, `codeActionProvider`, `renameProvider`, `documentFormattingProvider`, and so on. Inspect `client.capabilities` after `connect()` to see exactly what your server offers.

### Position utilities

For mapping between string offsets and LSP positions (handy when bridging editor selections to LSP requests), three helpers are exported alongside the client:

```ts
import {
  positionToOffset,
  offsetToPosition,
  rangeToOffsets
} from "@nocturnium/svelte-ide";

const offset = positionToOffset(content, { line: 3, character: 1 });
const pos = offsetToPosition(content, offset);
const { start, end } = rangeToOffsets(content, range);
```

---

## Wiring `<LSPEditor>`

`<LSPEditor>` wraps the [Custom Editor](./editor.md) and layers LSP features on top: autocomplete (Ctrl+Space or while typing identifier characters), hover tooltips (on mouse-hover with a short delay), signature help (triggered by `(` and `,`), and inline diagnostics. Pass it a connected `LSPClient` and a document `uri`.

```svelte
<script lang="ts">
  import { LSPEditor, createLSPClient } from "@nocturnium/svelte-ide";
  import "@nocturnium/svelte-ide/theme.css";
  import type { Diagnostic } from "@nocturnium/svelte-ide";

  const client = createLSPClient({
    serverUrl: "ws://localhost:8765/lsp?language=go",
    rootUri: "file:///path/to/project"
  });

  // Open the socket while the component is alive, close it on teardown.
  $effect(() => {
    client.connect();
    return () => client.disconnect();
  });

  let code = $state("package main\n\nfunc main() {\n\t\n}\n");
  let problems = $state<Diagnostic[]>([]);
</script>

<LSPEditor
  content={code}
  uri="file:///path/to/project/main.go"
  language="go"
  lspClient={client}
  onChange={(content) => (code = content)}
  onDiagnostics={(diagnostics) => (problems = diagnostics)}
/>
```

### `<LSPEditor>` props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `content` | `string` | — | The editor's text. Required. |
| `uri` | `string` | — | `file://` URI used in all LSP requests for this document. Required. |
| `language` | `string` | `"plaintext"` | Language id (`"go"`, `"typescript"`, `"python"`, …). |
| `lspClient` | `LSPClient` | — | A connected client. Without it, the editor behaves as a plain `CustomEditor`. |
| `readonly` | `boolean` | `false` | Disable editing. |
| `preferences` | `Partial<EditorPreferences>` | `{}` | Editor preferences (theme, tab size, etc.). See [Editor guide](./editor.md). |
| `folding` | `boolean` | `true` | Enable [code folding](./code-folding.md). |
| `multiCursor` | `boolean` | `true` | Enable [multi-cursor editing](./multi-cursor.md). |
| `maxCursors` | `number` | `100` | Upper bound on simultaneous cursors. |
| `class` | `string` | `""` | Extra CSS class on the wrapper. |
| `onChange` | `(content: string) => void` | — | Fires on every edit; the editor also forwards the change to the client as `didChange`. |
| `onCursorChange` | `(line: number, column: number) => void` | — | Fires when the primary cursor moves (1-based line/column). |
| `onCursorsChange` | `(cursors: readonly Cursor[]) => void` | — | Fires when the multi-cursor set changes. |
| `onSave` | `() => void` | — | Fires on Ctrl+S / Cmd+S. |
| `onDiagnostics` | `(diagnostics: Diagnostic[]) => void` | — | Fires when diagnostics for this document arrive. |

`<LSPEditor>` opens the document (`didOpen`) when it mounts with a client, forwards edits as `didChange`, subscribes to `onDiagnostics` for the matching `uri`, and calls `didClose` on teardown — you do not call those methods yourself when using the component.

### Switching languages

To support several languages, create one client per language (each bridge endpoint targets a different server) and swap the client and `language` prop together:

```svelte
<script lang="ts">
  import { LSPEditor, createLSPClient } from "@nocturnium/svelte-ide";

  const clients = {
    go: createLSPClient({ serverUrl: "ws://localhost:8765/lsp?language=go", rootUri }),
    typescript: createLSPClient({ serverUrl: "ws://localhost:8765/lsp?language=typescript", rootUri })
  };

  let language = $state<"go" | "typescript">("go");
</script>

<LSPEditor {language} lspClient={clients[language]} content={code} uri={fileUri} />
```

---

## LSP UI widgets

`<LSPEditor>` renders the completion, hover, and signature widgets internally, so most consumers never instantiate them directly. They are exported for building custom editor surfaces or a standalone problems panel. All are positioned with absolute viewport coordinates (`{ x, y }`).

### `AutocompleteWidget`

A dropdown of completion suggestions.

```svelte
<AutocompleteWidget
  items={completionItems}              {/* CompletionItem[] */}
  selectedIndex={0}                    {/* number, default 0 */}
  position={{ x: 120, y: 240 }}
  maxHeight={300}                      {/* number, default 300 */}
  onSelect={(item) => apply(item)}
  onDismiss={() => close()}
  onSelectionChange={(index) => (selected = index)}
/>
```

### `HoverTooltip`

Renders the type/documentation `contents` of a `Hover` result.

```svelte
<HoverTooltip
  hover={hoverResult}                  {/* Hover */}
  position={{ x, y }}
  maxWidth={500}                       {/* number, default 500 */}
  onDismiss={() => close()}
/>
```

### `SignatureHelpWidget`

Shows a function signature with the active parameter highlighted.

```svelte
<SignatureHelpWidget
  signatureHelp={sigHelp}              {/* SignatureHelp */}
  position={{ x, y }}
  onDismiss={() => close()}
/>
```

### `DiagnosticsPanel`

A scrollable "Problems" list across one or more files, with severity filtering and click-to-navigate. Feed it the client's full diagnostics map.

```svelte
<script lang="ts">
  import { DiagnosticsPanel } from "@nocturnium/svelte-ide";
  import type { Diagnostic, DiagnosticSeverity } from "@nocturnium/svelte-ide";

  let byFile = $state<Map<string, Diagnostic[]>>(new Map());
  let filter = $state<DiagnosticSeverity | null>(null);

  // keep the map fresh from the client
  client.on("onDiagnostics", () => (byFile = client.getAllDiagnostics()));
</script>

<DiagnosticsPanel
  diagnostics={byFile}
  severityFilter={filter}
  onNavigate={(uri, line, column) => openAt(uri, line, column)}
  onFilterChange={(severity) => (filter = severity)}
/>
```

| Prop | Type | Description |
| --- | --- | --- |
| `diagnostics` | `Map<string, Diagnostic[]>` | Diagnostics grouped by file URI (use `client.getAllDiagnostics()`). |
| `severityFilter` | `DiagnosticSeverity \| null` | Show only one severity, or `null` for all (default `null`). |
| `onNavigate` | `(uri, line, column) => void` | Called when a row is clicked. |
| `onFilterChange` | `(severity) => void` | Called when the severity filter changes. |

### `DiagnosticMarker`

A single inline squiggle or gutter marker for one diagnostic.

```svelte
<DiagnosticMarker
  diagnostic={d}                       {/* Diagnostic */}
  type="inline"                        {/* 'inline' (default) | 'gutter' */}
  onClick={() => showDetail(d)}
/>
```

`DiagnosticSeverity` values: `1` Error, `2` Warning, `3` Information, `4` Hint.

---

## Running an LSP bridge

A browser cannot launch `gopls` or `tsserver` itself. The repo ships a standalone Go bridge in [`backend/`](../../backend/README.md) that accepts WebSocket connections and proxies JSON-RPC to a native language server over stdio. It is a separate Go module and is **not** part of the npm package — you run it yourself (or substitute any LSP-over-WebSocket server).

### Prerequisites

Install the language servers you want to expose:

```bash
go install golang.org/x/tools/gopls@latest                 # Go
npm install -g typescript-language-server typescript        # TypeScript / JavaScript
```

### Build and run

```bash
cd backend
go mod tidy
go run ./cmd/lsp-bridge        # or: go build -o lsp-bridge ./cmd/lsp-bridge && ./lsp-bridge
```

By default it listens on `:8765` and exposes:

| Endpoint | Purpose |
| --- | --- |
| `ws://localhost:8765/lsp?language=<lang>` | WebSocket LSP session; `language` selects the server. |
| `GET /health` | `{"status":"ok",...}` |
| `GET /info` | Registered language servers. |

Out of the box, `language=go` routes to `gopls` and `language=typescript` (also `javascript`, `typescriptreact`, `javascriptreact`) routes to `typescript-language-server`. Each WebSocket client gets its own language-server process, started on connect and stopped on disconnect.

### Flags

| Flag | Default | Description |
| --- | --- | --- |
| `-addr` | `:8765` | Listen address. |
| `-gopls` | `gopls` | Path to the `gopls` binary. |
| `-tsserver` | `typescript-language-server` | Path to the TypeScript server binary. |
| `-allowed-origins` | _(empty)_ | Comma-separated extra browser origins allowed to connect. |

```bash
go run ./cmd/lsp-bridge -addr :9000 -gopls /opt/go/bin/gopls
```

### Origin policy (security)

The bridge runs language servers against your filesystem, so it ships with a **localhost-only origin policy**: any `localhost`, `127.0.0.1`, or `::1` origin (on any port) may connect, and requests with no `Origin` header (non-browser clients such as curl or native apps) are allowed; every other browser origin is rejected. Add trusted origins with `-allowed-origins`:

```bash
# Allow your deployed front-end in addition to localhost
go run ./cmd/lsp-bridge -allowed-origins https://app.example.com,https://staging.example.com
```

`-allowed-origins '*'` permits any origin, but this is strongly discouraged and intended only for throwaway local experiments — never expose a `*` bridge publicly. For production, terminate TLS at a reverse proxy (so the editor connects over `wss://`), keep the origin allow-list tight, and treat the bridge as a trusted-network service.

### Adding more languages

Register additional servers in `backend/cmd/lsp-bridge/main.go` (for example `pylsp` for Python or `rust-analyzer` for Rust) and rebuild. See the [backend README](../../backend/README.md) for the registration snippet and the full list of popular language servers.

---

## Troubleshooting

- **Nothing happens / no completions.** Confirm `client.state` reaches `ready` after `connect()`, and that `client.capabilities` advertises the feature (e.g. `completionProvider`). Each feature method returns empty/`null` when the server lacks the capability.
- **Connection refused or immediately closed.** Check the bridge is running on the expected `-addr`, the `serverUrl` matches (including `?language=`), and the browser origin is allowed by the bridge's origin policy.
- **See every message.** Set `debug: true` in the client config, and run the bridge with `DEBUG=1` to log JSON-RPC traffic on the server side.
- **It keeps reconnecting.** That is `autoReconnect` doing its job after a drop; set `autoReconnect: false` or lower `maxReconnectAttempts` to change the behavior.

For the underlying message flow, request/response shapes, and a web-worker integration pattern, see [LSP_INTEGRATION.md](../LSP_INTEGRATION.md).

---

## Related guides

- [Getting Started](../getting-started.md) — install, theme, and your first editor.
- [Editor](./editor.md) — the `CustomEditor` that `<LSPEditor>` wraps.
- [Architecture](../architecture.md) — where LSP sits in the module map.
- [Components API reference](../api/components.md) and [Services API reference](../api/services.md).
- [LSP_INTEGRATION.md](../LSP_INTEGRATION.md) — low-level protocol detail.
