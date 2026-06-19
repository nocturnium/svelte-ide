# Architecture

`@nocturnium/svelte-ide` is a Svelte 5-native editor toolkit with **zero required runtime dependencies beyond the Svelte 5 peer** (the optional Yjs collaboration stack is the only other runtime dependency, and it's pulled in only if you use the CRDT module). It ships as plain Svelte components, runes-based stores, and small service modules — no UI framework, no CSS framework, no CodeMirror, and no bundled server. Every feature that needs a backend (language servers, real-time collaboration, a virtual filesystem, a plugin host, an AI chat endpoint) talks to a network boundary that _you_ supply; nothing is reachable until you wire it up. This page is the contributor's and advanced user's map of how the pieces are layered, how editor state flows through runes, where the optional networked seams are, and how the package is built and published.

## Table of contents

- [Layering](#layering)
- [Module map](#module-map-srclib)
- [How editor state and runes flow](#how-editor-state-and-runes-flow)
- [The networked boundaries](#the-networked-boundaries)
- [Build and publish model](#build-and-publish-model)
- [Where to go next](#where-to-go-next)

## Layering

The library is organized as four conceptual tiers. Code only ever depends _downward_: components consume stores and services, stores hold state and may call services, services own I/O, and the optional backends live entirely outside the npm package.

```
┌──────────────────────────────────────────────────────────────────────┐
│  CONSUMER APP  (your SvelteKit / Vite app)                             │
│  import "@nocturnium/svelte-ide/theme.css"  ← tokens make UI visible   │
└──────────────────────────────────────────────────────────────────────┘
                                  │  imports
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  COMPONENTS  (src/lib/components/*)  — .svelte, Svelte 5 runes         │
│  core · editor · layout · lsp · ai · agents · vfs · plugins           │
└──────────────────────────────────────────────────────────────────────┘
            │ read/derive                       │ call
            ▼                                    ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│  STORES  (src/lib/stores/*.svelte.ts) │  SERVICES (src/lib/services/*)  │
│  module-scoped $state runes      │   │  lsp-client · vfs-client ·       │
│  editor · ai · plugin · vfs ·    │◄──┤  ide-integration · optimistic ·  │
│  collaboration · agents · layout │   │  error-handling                  │
└─────────────────────────────────┘   └──────────────────────────────────┘
                                                 │  network I/O (optional)
                                                 ▼
        ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ NETWORK BOUNDARY (caller-supplied) ╌╌╌╌╌╌╌╌╌╌╌╌╌
                                                 │
   ┌───────────┬───────────────┬───────────────┬────────────┬────────────┐
   ▼           ▼               ▼               ▼            ▼            ▼
LSP bridge   VFS backend   Plugin host    AI chat       CRDT relay   (your
(WebSocket   (HTTP         (HTTP/SSE      endpoint      (y-websocket  infra)
 + JSON-RPC)  /api/vfs)     /api/plugins)  /api/chat)    serverUrl)

      backend/  (standalone Go "lsp-bridge", separate module — NOT in npm)
```

Two rules fall out of this picture and are worth keeping in mind when contributing:

1. **The core is offline-first.** Components, stores, utils, the tokenizer, folding, multi-cursor, and find/replace have _zero_ runtime dependencies and never touch the network. You can render an `<Editor>` with nothing but the package and the theme stylesheet.
2. **Everything networked is opt-in and bring-your-own-backend.** The base URLs (`/api/vfs`, `/api/plugins`, `/api/chat`) are same-origin defaults; the LSP and CRDT endpoints are always caller-supplied. The package never embeds a host.

## Module map (`src/lib`)

Most of the published surface is re-exported from `src/lib/index.ts` (the root `.` entry point). Two parts are deliberately kept off the root barrel and live only behind their own subpaths: the CRDT _wrappers_ (`./crdt`, because they pull in optional peer dependencies) and the client-side _plugin runtime_ (`./plugins`). The root barrel still re-exports the plugin _components_ (`PluginPanel`, …) from `components/plugins`; only the `pluginRegistry` / `definePlugin` runtime is subpath-only.

| Subdirectory         | What it does                                                                                                                                                                                                                 | Published entry point                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/core`    | Unstyled UI primitives: `Button`, `Icon`, `Input`, `Textarea`, `Tooltip`, `Kbd`, `Badge`, `Spinner`, `Avatar`, `ContextMenu`, `ResizeHandle`, `ErrorBoundary`, `ConnectionStatus`.                                           | `./components/core`, `.`                                                                                                                                        |
| `components/editor`  | The editor itself and its internals: `Editor`, `CustomEditor`, `CollaborativeEditor`, `EditorPane`, `EditorTabs`, `FileExplorer`, `FileIcon`, plus the `core/` subsystems, the `tokenizer/`, `languages.ts`, and `theme.ts`. | `./components/editor`, `.`                                                                                                                                      |
| `components/layout`  | App shell: `IDELayout`, `StatusBar`.                                                                                                                                                                                         | `./components/layout`, `.`                                                                                                                                      |
| `components/lsp`     | LSP-aware UI: `LSPEditor`, `AutocompleteWidget`, `HoverTooltip`, `SignatureHelpWidget`, `DiagnosticsPanel`, `DiagnosticMarker`.                                                                                              | `./components/lsp`, `.`                                                                                                                                         |
| `components/ai`      | AI assistant UI: `AIPanel`, `AIMessage`, `AIToolCallDisplay`, `AIEditPreview`, `AIInlineEdit`, `AISuggestionWidget`.                                                                                                         | `./components/ai`, `.`                                                                                                                                          |
| `components/agents`  | Multi-agent presence UI: `AgentAvatar`, `AgentActivityPanel`, `AgentPresenceBar`, `AgentCursor`.                                                                                                                             | `./components/agents`, `.`                                                                                                                                      |
| `components/vfs`     | Lock and version conflict UI: `LockIndicator`, `LockConflictDialog`, `LockOverlay`, `VersionConflictDialog`.                                                                                                                 | `./components/vfs`, `.`                                                                                                                                         |
| `components/plugins` | Plugin marketplace UI: `PluginPanel`, `PluginCard`, `PluginProposalForm`, `PluginStatusBadge`.                                                                                                                               | `./components/plugins`, `.`                                                                                                                                     |
| `stores`             | Module-scoped Svelte 5 runes stores: `editor`, `ai`, `ai-persistence`, `plugin`, `collaboration`, `vfs`, `agents`, `layout`.                                                                                                 | `./stores`, `.`                                                                                                                                                 |
| `services`           | I/O and coordination: `lsp-client`, `vfs-client`, `ide-integration`, `optimistic`, `error-handling`.                                                                                                                         | `.` (re-exported; the LSP client surface is exported by name, the others under namespaces such as `vfsClient`, `ideIntegration`, `optimistic`, `errorHandling`) |
| `crdt`               | Yjs wrappers for real-time collaboration: `CollaborativeDocument`, `CollaborativeProvider`, `createAwarenessProtocol`, `createUndoManager`. Requires optional peers.                                                         | `./crdt` **only**                                                                                                                                               |
| `plugins`            | Client-side plugin runtime: `pluginRegistry`, `createPluginLoader`, `definePlugin`, `defineCommand`, `definePanel`. Requires a caller-supplied plugin host.                                                                  | `./plugins` **only**                                                                                                                                            |
| `types`              | Type-only modules: `editor`, `filesystem`, `vfs`, `ai`, `plugin`, `crdt`, `lsp`, `events`, `agents`.                                                                                                                         | `./types` (full set); the root `.` re-exports most of these — `editor`, `filesystem`, `ai`, `plugin`, `crdt`, `events`, `lsp`                                   |
| `utils`              | Pure helpers: `language` (detection), `format`, `keybindings`.                                                                                                                                                               | `./utils`, `.`                                                                                                                                                  |
| `styles`             | `theme.css` — the design tokens (CSS custom properties on `:root`).                                                                                                                                                          | `./theme.css`                                                                                                                                                   |

> **Note on `CollaborativeEditor`.** The `<CollaborativeEditor>` component lives under `components/editor` and is exported from the root `.` entry (it does not require Yjs to _import_, because it accepts an externally created `Y.Doc`). The Yjs document/provider _wrappers_ it pairs with (`CollaborativeDocument`, `CollaborativeProvider`) live in the `crdt` module and are imported from `@nocturnium/svelte-ide/crdt`, which is where the optional `yjs`/`y-websocket`/`y-protocols` peers come in. See [The networked boundaries](#the-networked-boundaries).

### Inside `components/editor`

The editor is the densest subtree, so it deserves a closer look. It is split into pure logic (`core/`, `tokenizer/`) and the `.svelte` layers that render it:

- **`core/`** — framework-agnostic editor logic, each in its own testable module: `state` (the editor document model), `navigation`, `keybindings`, `search`, `folding`, `multi-cursor`, `diagnostics`, `crdt-binding`, and several enhancement subsystems (`semantic-analyzer`, `complexity-analyzer`, `git-blame`, `snippet-manager`, and more). The publicly exported surface is the curated set from `./components/editor/core` (`createEditorState`, `createNavigation`, `createKeyboardHandler`, `createDefaultKeybindings`, `createCRDTBinding`, and their types).
- **`tokenizer/`** — the hand-written, per-language tokenizer (`getTokenizer`, `tokenize`, `getTokenClass`, `tokensToHTML`). This is what replaces CodeMirror's highlighting. See [Syntax highlighting](guides/syntax-highlighting.md).
- **`languages.ts`** — language registry and detection helpers (`resolveLanguage`, `getLanguageFromFilename`, …).
- **`theme.ts`** — editor token color maps (`nocturniumTheme`, `getThemeCSS`), distinct from the global `styles/theme.css` tokens.
- **The `.svelte` files** — `CustomEditor.svelte` is the keyboard/mouse engine; `Editor.svelte` wraps it; `CollaborativeEditor.svelte` wraps it with a CRDT binding; `EditorPane`, `EditorTabs`, `EditorGutter`, `EditorLines`, `Minimap`, `FindReplace`, and the various overlay layers compose around it.

## How editor state and runes flow

State lives in **module-scoped runes**, not in component instances. A store like `editor.svelte.ts` declares a single `let state = $state<EditorState>({ … })` at module scope, then exposes reactivity through **getter functions** and small `{ get current() }` accessor objects. This pattern exists because Svelte 5 modules cannot directly export a `$derived` value — wrapping the read in a getter keeps the reactivity intact across the module boundary.

```ts
// Reading reactive store state in a component
import { activeTab, dirtyTabs, openFile, updateContent } from '@nocturnium/svelte-ide/stores';

// `activeTab.current` and `dirtyTabs.current` are reactive reads;
// mutating functions like openFile() / updateContent() drive the $state.
```

Because `index.ts` re-exports many stores from one namespace, conflicting names are aliased at the barrel (for example each store's `error` becomes `editorError`, `aiError`, `pluginError`, `vfsError`, `collabError`, `agentsError`). When you import from `@nocturnium/svelte-ide/stores` (or the root), use those disambiguated names.

The typical write/read cycle for the editor:

```
 user keypress
      │
      ▼
CustomEditor.svelte  ──uses──►  editor/core (state · navigation · multi-cursor · search)
      │                                   │ produces ChangeEvent
      │ commits document change           ▼
      ▼                          editor store ($state)  ──► updateContent() (sets tab.isDirty)
 re-render (runes recompute)  ◄───────────┘
      │
      └──► optional consumers react to the same $state:
             • dirtyTabs.current (derived from tab.isDirty) drives the tab "•" indicator
             • LSP editor pushes the change to the language server
             • CRDT binding mirrors the change into the shared Yjs doc
```

The editor document model in `editor/core/state` (`createEditorState`, `EditorState`, `Position`, `Selection`, `Line`, `ChangeEvent`) is deliberately plain — it is not a rune. Components own the runes; `core/` owns the algorithms. That separation is why every `core/` module is unit-tested in isolation (`*.test.ts` siblings) without a DOM. When you contribute editor logic, prefer adding it to `core/` as a pure function and let a `.svelte` file bind it to `$state`/`$derived`/`$effect`.

> The editor store has no explicit "mark dirty" call: `updateContent(tabId, content)` sets the tab's `isDirty` field by comparing the new content against the saved content, and `markSaved()` clears it. The `dirtyTabs` accessor is derived from those tab flags. (The separate VFS store _does_ expose a `markDirty()` for filesystem-level dirty tracking — don't confuse the two.)

For deeper, feature-specific flow see [Editor](guides/editor.md), [Multi-cursor](guides/multi-cursor.md), [Code folding](guides/code-folding.md), and the stores reference (`docs/api/stores.md`).

## The networked boundaries

Each networked feature is isolated behind exactly one seam, so you can adopt them independently. None of these connect on import — you must call the connect/configure function with your own endpoint.

| Feature     | Client surface                                                                        | Transport                   | Default / endpoint                                              | Backend you provide                                                |
| ----------- | ------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| **LSP**     | `createLSPClient` / `LSPClient` + `<LSPEditor>`                                       | WebSocket + JSON-RPC        | caller-supplied `serverUrl`                                     | An LSP-over-WebSocket bridge (e.g. the Go server in `backend/`).   |
| **VFS**     | `vfsClient` service + `vfs` store                                                     | HTTP (`fetch`)              | `/api/vfs`, configurable via `vfsClient.configure({ baseUrl })` | A virtual-filesystem REST backend.                                 |
| **Plugins** | `createPluginLoader(apiBase)` + `plugin` store `connect(endpoint)`                    | HTTP / SSE                  | `/api/plugins`, configurable                                    | A "plugin host" that compiles/serves proposals and streams events. |
| **AI**      | `<AIPanel>` + `ai` store `sendMessage()`                                              | HTTP (`fetch`)              | `/api/chat`, model id configurable                              | Your own chat completion endpoint.                                 |
| **CRDT**    | `CollaborativeProvider` (transport) from `./crdt` + `<CollaborativeEditor>` (binding) | WebSocket via `y-websocket` | `serverUrl` always caller-supplied                              | A Yjs WebSocket relay.                                             |

```ts
// LSP — connect to your own bridge (e.g. backend/cmd/lsp-bridge on :8765)
import { createLSPClient } from '@nocturnium/svelte-ide';

const lsp = createLSPClient({ serverUrl: 'ws://localhost:8765' });

// VFS — point the client at your filesystem backend
import { vfsClient } from '@nocturnium/svelte-ide';

vfsClient.configure({ baseUrl: '/api/vfs' });

// Plugins — bind the loader to your plugin host
import { createPluginLoader } from '@nocturnium/svelte-ide/plugins';

const loader = createPluginLoader('/api/plugins');

// CRDT — serverUrl is never baked in; you supply the relay.
// The provider needs a Yjs doc and a room id (not a "room" field).
import { CollaborativeDocument, CollaborativeProvider } from '@nocturnium/svelte-ide/crdt';

const collabDoc = new CollaborativeDocument({ documentId: 'doc-123' });

const provider = new CollaborativeProvider({
	serverUrl: 'wss://collab.example.com',
	roomId: 'doc-123',
	doc: collabDoc.doc
});
```

The `ide-integration` service is the one place these seams are stitched together: it wires the `vfs`, `agents`, and `collaboration` stores into a single coordinated context (locks → presence → awareness) so a host app can light up the whole multi-user experience from one config object. It is optional; you can use any store on its own.

For end-to-end setup of each boundary, see [LSP](guides/lsp.md), Collaboration (`docs/guides/collaboration.md`), [Plugins](guides/plugins.md), [AI and agents](guides/ai-and-agents.md), and the low-level [LSP integration notes](LSP_INTEGRATION.md). Service signatures are catalogued in the [services reference](api/services.md).

### Security at the boundaries

A few seams handle untrusted input and are worth knowing about when reviewing changes:

- **AI rendering** — `AIMessageContent` escapes HTML and whitelists link schemes _before_ any `{@html}`, so model output can never inject markup.
- **Untrusted plugin code** — the library ships **no** client-side sandbox. The former in-realm `createSandbox` (`new Function`) evaluator was removed in v1.0.0 because it was not a real security boundary. Run untrusted plugin code on the host (out of band, via `loadModule`) or in `<iframe sandbox>`/Web Worker isolation you control — see the [plugins guide](guides/plugins.md#running-untrusted-plugin-code).
- **CRDT relay & LSP bridge** — because the URLs are caller-supplied, origin and auth policy are entirely your backend's responsibility. The reference Go bridge in `backend/` defaults to localhost-only origins.

## Build and publish model

The repository is two independent units:

1. **The npm package** — everything under `src/lib`. It is compiled to `dist/` by `@sveltejs/package` (`svelte-package`) and validated by `publint`. The `package` script runs `svelte-kit sync && svelte-package && publint`; `prepublishOnly` additionally runs `svelte-check`. Only `dist` is published (`"files": ["dist"]`), and every `exports` subpath maps to a `dist/**` file.
2. **The backend** — `backend/` is a _standalone Go module_ (`lsp-bridge`), not part of the npm package and never bundled. Run it separately with `go run ./cmd/lsp-bridge` (listens on `:8765`, localhost-only origins by default; add more with `-allowed-origins`). It is one possible implementation of the LSP boundary; any LSP-over-WebSocket server works.

```
 src/lib/  ──(svelte-package + publint)──►  dist/  ──(npm publish)──►  @nocturnium/svelte-ide
   │                                          │
   │ "." → dist/index.js                      └─ exports subpaths: ./theme.css, ./stores,
   │ type defs → dist/index.d.ts                  ./components/{core,editor,layout,lsp,
   │                                              ai,agents,vfs,plugins}, ./types,
   │                                              ./utils, ./plugins, ./crdt
   ▼
 src/routes/  ──(vite build)──►  demo SvelteKit app (public in repo, NOT published)

 backend/  ──(go build)──►  lsp-bridge binary (separate module, NOT published to npm)
```

Notes for contributors:

- Inside the library, internal imports use the SvelteKit aliases `$lib`, `$types`, `$utils`. **Published consumers must never use `$lib`** — they import from `@nocturnium/svelte-ide` or one of its subpath exports. Examples in docs always use the published paths.
- `"sideEffects": false` lets bundlers tree-shake unused exports, including the entire `crdt` module when collaboration is not used.
- `svelte` and the three Yjs packages (`yjs`, `y-websocket`, `y-protocols`) are **peer dependencies**; the Yjs trio is marked optional and only needed by the `./crdt` entry point.
- The demo app under `src/routes/` (`npm run dev`, http://localhost:5173) exercises every feature and is the fastest way to see a change in context. It is public in the repo but excluded from the npm tarball.

Common scripts: `dev`, `build`, `package`, `check`, `test` (Vitest), `test:e2e` (Playwright), `lint`, `format`.

## Where to go next

- Getting started (`docs/getting-started.md`) — install, import the theme, render your first editor.
- Theming (`docs/theming.md`) — the design tokens and how to retheme.
- Component reference (`docs/api/components.md`) · Stores reference (`docs/api/stores.md`) · [Services reference](api/services.md) · Types and utils (`docs/api/types-and-utils.md`)
- Documentation hub (`docs/README.md`) — full table of contents.
