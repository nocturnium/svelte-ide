# @nocturnium/svelte-ide — Documentation

`@nocturnium/svelte-ide` is a zero-dependency, Svelte 5-native code editor component library. It ships a custom editor (no CodeMirror) with syntax highlighting for 8+ languages, code folding, multi-cursor editing, and find & replace, plus optional layers for LSP, real-time CRDT collaboration, AI panels, a virtual filesystem, and a proposal-based plugin system. This page is the navigational hub for the docs — start with **Getting started**, then dig into the guides and API reference below.

```bash
npm install @nocturnium/svelte-ide
```

```svelte
<script>
  import { CustomEditor } from '@nocturnium/svelte-ide';
  import '@nocturnium/svelte-ide/theme.css';

  let code = $state('function hello() {\n  console.log("world");\n}');
</script>

<CustomEditor
  content={code}
  language="javascript"
  onChange={(next) => (code = next)}
/>
```

> Components are unstyled until you import the shipped theme. Load `@nocturnium/svelte-ide/theme.css` once at your app root, then override its CSS custom properties to retheme — see [Theming](theming.md).

## Getting started

| Doc | Description |
| --- | --- |
| [Getting Started](getting-started.md) | Install the package, load the theme, render your first editor, and wire it into your framework. |

## Architecture & theming

| Doc | Description |
| --- | --- |
| [Architecture](architecture.md) | System overview and module map — how the editor, stores, services, and optional layers fit together. |
| [Theming](theming.md) | Design tokens (`--ide-*` / `--color-nocturnium-*` CSS custom properties) and how to customize them. |

## Guides

| Doc | Description |
| --- | --- |
| [Editor](guides/editor.md) | The editor components — `Editor`, `CustomEditor`, `EditorPane`, and `EditorTabs`. |
| [Syntax Highlighting](guides/syntax-highlighting.md) | The built-in tokenizer, supported languages, and token classes. |
| [Code Folding](guides/code-folding.md) | Folding strategies — bracket, indentation, comment, and region. |
| [Multi-Cursor](guides/multi-cursor.md) | Multiple cursors and selections. |
| [LSP](guides/lsp.md) | `createLSPClient` / `LSPClient` and `<LSPEditor>` over a WebSocket LSP bridge. |
| [Collaboration](guides/collaboration.md) | Real-time CRDT collaboration with Yjs and `<CollaborativeEditor>`. |
| [AI & Agents](guides/ai-and-agents.md) | The `<AIPanel>` component, the `ai` store, and agent presence layers. |
| [Plugins](guides/plugins.md) | The proposal-based plugin lifecycle and bring-your-own-backend plugin host. |

## API reference

| Doc | Description |
| --- | --- |
| [Components](api/components.md) | Reference for every exported component. |
| [Stores](api/stores.md) | Reference for the reactive stores (`@nocturnium/svelte-ide/stores`). |
| [Services](api/services.md) | Reference for the service clients (LSP, VFS, plugins, chat). |
| [Types & Utils](api/types-and-utils.md) | Reference for exported types (`@nocturnium/svelte-ide/types`) and utilities (`@nocturnium/svelte-ide/utils`). |

## Reference docs

| Doc | Description |
| --- | --- |
| [LSP Integration](LSP_INTEGRATION.md) | Low-level Language Server Protocol integration details and message handling. |

## Entry points

Everything is re-exported from the package root, but you can import from a narrower entry point to keep bundles lean:

```ts
// Everything (root)
import { CustomEditor, LSPEditor, createLSPClient, CollaborativeEditor } from '@nocturnium/svelte-ide';

// Scoped entry points
import { openFile } from '@nocturnium/svelte-ide/stores';
import { EditorPane } from '@nocturnium/svelte-ide/components/editor';
import { CollaborativeProvider } from '@nocturnium/svelte-ide/crdt';
import { createPluginLoader } from '@nocturnium/svelte-ide/plugins';
```

Available entry points: `.` · `./theme.css` · `./stores` · `./components/editor` · `./components/core` · `./components/ai` · `./components/layout` · `./components/lsp` · `./components/agents` · `./components/vfs` · `./components/plugins` · `./types` · `./utils` · `./plugins` · `./crdt`.

> The `<CollaborativeEditor>` component itself is exported from the package root (and from `./components/editor`); the `./crdt` entry point exports the lower-level CRDT primitives (`CollaborativeDocument`, `CollaborativeProvider`, `createAwarenessProtocol`, `createUndoManager`). See [Collaboration](guides/collaboration.md).

## Backend (separate)

Optional features that need a server bring their own backend — none is bundled with the npm package. The repo includes a standalone Go `lsp-bridge` WebSocket server under [`backend/`](../backend) for LSP, and the [LSP guide](guides/lsp.md) covers how to connect to it (or any LSP-over-WebSocket server).

---

See also the [project README](../README.md) for a feature summary and quick start.
