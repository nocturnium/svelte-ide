# @nocturnium/svelte-ide

Lightweight, Svelte 5-native code editor components — a simpler alternative to
CodeMirror when you want a fast, themeable editor without dragging in a full IDE
framework.

[![npm version](https://img.shields.io/npm/v/@nocturnium/svelte-ide)](https://www.npmjs.com/package/@nocturnium/svelte-ide)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![svelte](https://img.shields.io/badge/Svelte-5-ff3e00.svg)](https://svelte.dev)

Built from scratch with Svelte 5 runes and **zero required runtime dependencies
beyond the Svelte 5 peer**. Use a single `<CustomEditor>` for a textarea-grade
upgrade, or compose the editor, LSP, collaboration, AI, and plugin pieces into a
full IDE experience.

---

## Features

- **Custom code editor** — no CodeMirror, no Monaco; pure Svelte 5.
- **Syntax highlighting** for 12 languages via a built-in tokenizer.
- **Code folding** — bracket, indentation, comment, and region strategies.
- **Multi-cursor editing** with overlap merging and configurable limits.
- **Find & replace** with regex support.
- **LSP client** — autocomplete, hover, signatures, diagnostics over WebSocket.
- **Realtime collaboration** (optional) — CRDT/Yjs, tree-shakeable.
- **AI panel & agent presence** layers for assistant UI and presence patterns.
- **Plugin system** with a proposal-based lifecycle (bring your own backend).
- **Themeable** — every color/size is a CSS custom property you can override.
- **Minimal footprint** — no required runtime dependencies beyond the Svelte 5
  peer; styling is plain CSS variables (no CSS framework). The Yjs collaboration
  stack is the only other runtime dependency, and it's an optional peer.

## Install

```bash
npm install @nocturnium/svelte-ide
```

Requires **Svelte 5** (declared as a peer dependency).

Collaboration is optional and tree-shakeable — install these only if you use the
`./crdt` entry point or `<CollaborativeEditor>`:

```bash
npm install yjs y-websocket y-protocols
```

## Dependencies

The published package carries **no top-level `dependencies`** — it ships with
zero required runtime dependencies beyond the Svelte 5 peer.

- **`svelte` `^5.0.0`** — the one required peer. Your app already has it.
- **`yjs`, `y-protocols`, `y-websocket`** — _optional_ peers, marked
  `optional: true`. They are imported only by the realtime-collaboration code
  (`<CollaborativeEditor>` and the `./crdt` entry), so they're pulled in only if
  you actually use collaboration. The rest of the library never touches them.
- **No CSS framework at runtime.** Styling is plain CSS custom properties
  shipped in `@nocturnium/svelte-ide/theme.css` — no Tailwind, no `@apply`, no
  utility-class runtime. (Tailwind is used only to build this repo's demo site.)

Everything else in `package.json` — Vite, ESLint, TypeScript, Vitest,
Playwright, semantic-release, Tailwind, Prettier, and the rest — is a
`devDependency` used to build, test, and lint the library. None of it is
published: only the `dist/` folder ships (`"files": ["dist"]`).

## Quick start

Import the component **and** the theme stylesheet (components are unstyled
without the design tokens):

```svelte
<script>
	import { CustomEditor } from '@nocturnium/svelte-ide';
	import '@nocturnium/svelte-ide/theme.css';

	let code = $state('function hello() {\n  console.log("world");\n}');
</script>

<CustomEditor content={code} language="javascript" onChange={(value) => (code = value)} />
```

`<CustomEditor>` also accepts `readonly`, `folding`, `multiCursor`, `maxCursors`,
`preferences`, and callbacks like `onCursorsChange`, `onSave`, and
`onComplexityChange`. See the [Editor guide](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/editor.md).

> **Theme it your way:** all tokens are CSS variables on `:root` (prefixed
> `--ide-*` and `--color-nocturnium-*`). Override them in a stylesheet loaded
> after `theme.css` — see [Theming](https://github.com/nocturnium/svelte-ide/blob/main/docs/theming.md).

## Language support

JavaScript · TypeScript · JSX · TSX · HTML · XML · CSS · JSON · Python · Go ·
Markdown · Svelte (plus a `plaintext` fallback). Call `getSupportedLanguages()`
to enumerate them at runtime.

## Feature highlights

### Language Server Protocol

```svelte
<script>
	import { LSPEditor, createLSPClient } from '@nocturnium/svelte-ide';
	import '@nocturnium/svelte-ide/theme.css';

	const client = createLSPClient({
		serverUrl: 'ws://localhost:8765/lsp?language=typescript',
		rootUri: 'file:///workspace'
	});

	let code = $state('const greeting: string = "hi";');
</script>

<LSPEditor
	content={code}
	uri="file:///workspace/main.ts"
	language="typescript"
	lspClient={client}
	onChange={(value) => (code = value)}
	onDiagnostics={(diagnostics) => console.log(diagnostics)}
/>
```

You supply the LSP bridge. A ready-to-run Go WebSocket bridge lives in
[`backend/`](https://github.com/nocturnium/svelte-ide/blob/main/backend/README.md); any LSP-over-WebSocket server works. See the
[LSP guide](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/lsp.md).

### Realtime collaboration (optional)

```svelte
<script>
	import { CollaborativeEditor } from '@nocturnium/svelte-ide';
	import '@nocturnium/svelte-ide/theme.css';
	// requires: npm install yjs y-websocket y-protocols

	let content = $state('');
</script>

<CollaborativeEditor
	documentId="room-1"
	initialContent="// edit together"
	language="javascript"
	onChange={(value) => (content = value)}
/>
```

The collaboration server URL is always caller-supplied — nothing is baked in.
See the [Collaboration guide](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/collaboration.md).

### AI assistant panel

```svelte
<script>
	import { AIPanel } from '@nocturnium/svelte-ide';
	import '@nocturnium/svelte-ide/theme.css';
</script>

<AIPanel />
```

`<AIPanel>` talks to **your own** chat endpoint (configurable; defaults to
`/api/chat`) via the AI store. The repository's demo route returns canned mock
responses only; it does not connect to a real model provider. Consumers should
bring their own backend for inference. Model output is HTML-escaped with
link-scheme whitelisting before rendering. See the
[AI & agents guide](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/ai-and-agents.md).

## Entry points

The package root exposes the **stable core**. Backend-dependent and
experimental subsystems live behind dedicated subpaths — this keeps intent
explicit and tree-shaking clean.

| Import                             | Contents                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@nocturnium/svelte-ide`           | Stable core: editors, layout shell, file explorer, core UI primitives, editor/language/tokenizer/theme utilities, LSP client, layout-store functions, public types |
| `@nocturnium/svelte-ide/theme.css` | Default theme (design tokens + component styles)                                                                                                                   |
| `.../components/editor`            | `CustomEditor`, `Editor`, `EditorPane`, `EditorTabs`, …                                                                                                            |
| `.../components/core`              | `Button`, `Icon`, `Input`, `Tooltip`, `ResizeHandle`, …                                                                                                            |
| `.../components/ai`                | `AIPanel`, `AIMessage`, `AIInlineEdit`, …                                                                                                                          |
| `.../components/lsp`               | `LSPEditor`, `AutocompleteWidget`, `HoverTooltip`, …                                                                                                               |
| `.../components/agents`            | `AgentAvatar`, `AgentActivityPanel`, `AgentCursor`, …                                                                                                              |
| `.../components/vfs`               | `LockIndicator`, `LockConflictDialog`, …                                                                                                                           |
| `.../components/layout`            | `IDELayout`, `StatusBar`                                                                                                                                           |
| `.../components/plugins`           | `PluginPanel`, `PluginCard`, …                                                                                                                                     |
| `.../stores`                       | Full Svelte 5 runes store surface (layout, editor, ai, plugin, …)                                                                                                  |
| `.../plugins`                      | Plugin runtime (`createPluginLoader`, `definePlugin`, `defineCommand`, `definePanel`, `pluginRegistry`)                                                            |
| `.../crdt`                         | CRDT collaboration primitives (requires Yjs)                                                                                                                       |
| `.../types`, `.../utils`           | Full type and helper-function surface                                                                                                                              |

## API Stability

This package follows [SemVer](https://semver.org/). The surface is split into a
stable core and a set of experimental subpaths.

**Stable (root entry).** Imported from `@nocturnium/svelte-ide`, these follow
SemVer and only change with a major version bump:

- Editors: `Editor`, `CustomEditor`, `LSPEditor` (`CollaborativeEditor` is
  experimental — see below).
- Composition: `EditorPane`, `EditorTabs`, `FileExplorer`, `FileIcon`,
  `IDELayout`, `StatusBar`.
- Core UI primitives: `Button`, `Icon`, `Input`, `Textarea`, `Tooltip`, `Kbd`,
  `Badge`, `Spinner`, `Avatar`, `ContextMenu`, `ResizeHandle`, `ErrorBoundary`,
  `ConnectionStatus`.
- Editor-core, language, tokenizer, and theme utilities.
- LSP client: `LSPClient`, `createLSPClient`, the position helpers, and the
  public LSP types (`Diagnostic`, `LSPConnectionState`, `ServerCapabilities`).
- The curated layout-store functions and the public editor/filesystem/LSP/AI
  types.

**Experimental (subpath entries).** These are reachable only via their
subpaths and **may change in minor versions**:

- `./components/agents` — agent presence UI
- `./components/vfs` — virtual-filesystem lock/conflict UI
- `./components/plugins` — plugin UI components
- `./plugins` — plugin runtime/loader
- `./crdt` and `<CollaborativeEditor>` — realtime collaboration (requires Yjs)

The full store, type, and util surfaces exposed via `./stores`, `./types`, and
`./utils` beyond the curated root set are likewise experimental.

## Documentation

- **[Documentation hub](https://github.com/nocturnium/svelte-ide/blob/main/docs/README.md)** — full table of contents
- [Getting started](https://github.com/nocturnium/svelte-ide/blob/main/docs/getting-started.md)
- [Architecture](https://github.com/nocturnium/svelte-ide/blob/main/docs/architecture.md)
- [Theming](https://github.com/nocturnium/svelte-ide/blob/main/docs/theming.md)
- Guides: [Editor](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/editor.md) ·
  [Syntax highlighting](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/syntax-highlighting.md) ·
  [Code folding](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/code-folding.md) ·
  [Multi-cursor](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/multi-cursor.md) ·
  [LSP](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/lsp.md) ·
  [Collaboration](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/collaboration.md) ·
  [AI & agents](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/ai-and-agents.md) ·
  [Plugins](https://github.com/nocturnium/svelte-ide/blob/main/docs/guides/plugins.md)
- API reference: [Components](https://github.com/nocturnium/svelte-ide/blob/main/docs/api/components.md) ·
  [Stores](https://github.com/nocturnium/svelte-ide/blob/main/docs/api/stores.md) ·
  [Services](https://github.com/nocturnium/svelte-ide/blob/main/docs/api/services.md) ·
  [Types & utils](https://github.com/nocturnium/svelte-ide/blob/main/docs/api/types-and-utils.md)

## The LSP backend

[`backend/`](https://github.com/nocturnium/svelte-ide/tree/main/backend) is a standalone Go "lsp-bridge" WebSocket server that
proxies browser editors to native language servers (gopls,
typescript-language-server, …). It is a separate module — **not** part of the
npm package — and accepts `localhost` origins only by default. See
[`backend/README.md`](https://github.com/nocturnium/svelte-ide/blob/main/backend/README.md).

## Try the demo

```bash
git clone https://github.com/nocturnium/svelte-ide.git
cd svelte-ide
npm install
npm run dev   # http://localhost:5173
```

The SvelteKit app under `src/routes/` showcases every feature.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/nocturnium/svelte-ide/blob/main/CONTRIBUTING.md) for setup,
scripts, and conventions, and our [Code of Conduct](https://github.com/nocturnium/svelte-ide/blob/main/CODE_OF_CONDUCT.md).
Security issues: please follow [SECURITY.md](https://github.com/nocturnium/svelte-ide/blob/main/SECURITY.md).

## License

[MIT](./LICENSE) © Nocturnium and Jordan Dziat
