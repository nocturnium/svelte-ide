# Getting Started

`@nocturnium/svelte-ide` is a lightweight, Svelte 5-native code-editor component library — a simpler alternative to CodeMirror when you don't need a full IDE. This guide walks you through the prerequisites, installation, the required theme import, your first working editor, framework setup for SvelteKit and plain Vite, and how to opt into the optional collaboration and language-server features. By the end you'll have a syntax-highlighted editor rendering on screen and know where to go next.

## Prerequisites

This library targets **Svelte 5 only**. It is built on runes (`$state`, `$derived`, `$props`, `$effect`), so it will not work on Svelte 4 or earlier.

- **Svelte `^5.0.0`** — declared as a peer dependency, so your project must already have it installed.
- **Node.js `>=18`** — required for the tooling.
- A Svelte build setup (SvelteKit or plain Vite + `@sveltejs/vite-plugin-svelte`).

Beyond that Svelte 5 peer, the package ships with **zero required runtime dependencies** — `package.json` declares no top-level `dependencies`, and styling is plain CSS custom properties with no CSS framework. The collaboration extras (`yjs`, `y-websocket`, `y-protocols`) are the only other runtime dependency: they're _optional_ peer dependencies you install only if you use the CRDT module — see [Optional features](#optional-features) below.

## Installation

```bash
npm install @nocturnium/svelte-ide
```

That's everything you need for the editor, syntax highlighting, code folding, multi-cursor editing, find & replace, and the rest of the core components.

## Import the theme (required)

The components ship **unstyled**. They rely on a set of design tokens — CSS custom properties on `:root`, prefixed `--ide-*` and `--color-nocturnium-*` — that live in a single stylesheet. Without it, the editor will render but look broken: no colors, no surfaces, no spacing.

Import the theme **once**, near your application's entry point:

```js
import '@nocturnium/svelte-ide/theme.css';
```

This applies the built-in dark "Nocturnium" theme. The stylesheet intentionally does **not** ship global `html`/`body` resets, so it won't fight your app's base styles — it only defines the tokens, a few keyframes, and the opt-in `.ide-*` utility classes the components use.

Because every value is a CSS variable, you can retheme without forking: load your own stylesheet _after_ the theme and override any token. See [Theming](./theming.md) for the full token reference and customization patterns.

## Your first editor

The core editor is `CustomEditor`. It's a controlled component: you own the document text in your own `$state`, pass it in via the `content` prop, and update your state from the `onChange` callback.

```svelte
<script lang="ts">
	import { CustomEditor } from '@nocturnium/svelte-ide';

	let code = $state(`function greet(name) {\n  return \`Hello, \${name}!\`;\n}\n`);
</script>

<div style="height: 400px;">
	<CustomEditor content={code} language="javascript" onChange={(value) => (code = value)} />
</div>
```

A few things worth knowing:

- **Give it a height.** The editor fills its container, so wrap it in an element with a defined height (a fixed `height`, a flex child, etc.).
- **`language`** drives syntax highlighting. The built-in tokenizer supports JavaScript, TypeScript, JSX, TSX, HTML, XML, CSS, JSON, Python, Go, Markdown, and Svelte; omit it (it defaults to `"plaintext"`) for no highlighting. See [Syntax Highlighting](./guides/syntax-highlighting.md) for the supported set and token classes.
- **`onChange`** receives the new content string. Write it back to your `$state` to keep the editor in sync.
- **Other useful props:** `readonly`, `preferences` (a partial `EditorPreferences` object — font size, tab size, line numbers, word wrap, and more), `folding`, `multiCursor`, and `onSave` (fired on Ctrl+S). See the [Editor guide](./guides/editor.md) for the complete prop list.

There's also a thin `Editor` wrapper that exposes the same core props (`content`, `language`, `readonly`, `preferences`, `onChange`, `onCursorChange`, `onSave`) if you prefer a smaller surface; `CustomEditor` is the underlying implementation with the full feature set.

## Framework setup

### SvelteKit

The cleanest place for the one-time theme import is your root layout. Create or edit `src/routes/+layout.svelte`:

```svelte
<script lang="ts">
	import '@nocturnium/svelte-ide/theme.css';

	let { children } = $props();
</script>

{@render children()}
```

Then use the editor in any page or component, exactly as shown in [Your first editor](#your-first-editor).

If you render the editor during server-side rendering, keep it inside normal component markup — it hydrates on the client like any Svelte component. No special adapter configuration is required.

### Plain Vite

With a plain Vite + Svelte app, import the theme once from your entry module (commonly `src/main.ts`):

```ts
import { mount } from 'svelte';
import '@nocturnium/svelte-ide/theme.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;
```

Your `App.svelte` (and any descendant) can then import and render `CustomEditor` directly.

## Import paths and entry points

Everything is re-exported from the package root, so a single import works for most cases:

```ts
import { CustomEditor, LSPEditor, AIPanel } from '@nocturnium/svelte-ide';
```

If you'd rather import from a narrower entry point (for clarity or finer tree-shaking), the package also exposes scoped subpaths that mirror its modules:

```ts
import { CustomEditor } from '@nocturnium/svelte-ide/components/editor';
import { AIPanel } from '@nocturnium/svelte-ide/components/ai';
```

Available subpaths include `./stores`, `./components/editor`, `./components/core`, `./components/ai`, `./components/layout`, `./components/lsp`, `./components/agents`, `./components/vfs`, `./components/plugins`, `./types`, `./utils`, `./plugins`, and `./crdt`. The CRDT module is the one piece **not** re-exported from root — import it from `@nocturnium/svelte-ide/crdt` (see below).

> Always import from the published package name. Don't reference `$lib` — that's an internal alias used inside this repo's source, not a public entry point.

## Optional features

### Real-time collaboration (CRDT)

Collaborative editing is shipped as a separate, tree-shakeable module so it stays out of your bundle unless you use it. It's built on [Yjs](https://yjs.dev), which you install as optional peer dependencies:

```bash
npm install yjs y-websocket y-protocols
```

Then import the CRDT building blocks from the dedicated subpath:

```ts
import {
	CollaborativeDocument,
	CollaborativeProvider,
	createAwarenessProtocol,
	createUndoManager
} from '@nocturnium/svelte-ide/crdt';
```

The ready-made `CollaborativeEditor` component is available from the package root. The collaboration server URL is always **caller-supplied** — there's no host baked into the library, so you point it at your own y-websocket server. The full walkthrough lives in the [Collaboration guide](./guides/collaboration.md).

### Language Server Protocol (LSP)

For autocomplete, hover info, signature help, and diagnostics, the library includes an LSP client and an `LSPEditor` component. The client connects to a language server **over WebSocket** — you bring (or run) the server. This repo includes a standalone Go "lsp-bridge" you can use, documented in the [LSP guide](./guides/lsp.md) and the lower-level [LSP_INTEGRATION.md](./LSP_INTEGRATION.md).

A minimal client looks like this:

```ts
import { createLSPClient } from '@nocturnium/svelte-ide';

const client = createLSPClient({
	serverUrl: 'ws://localhost:8765',
	rootUri: 'file:///workspace'
});
```

Pass the client to the `LSPEditor` component along with the document `uri`:

```svelte
<script lang="ts">
	import { LSPEditor } from '@nocturnium/svelte-ide';
	import { client } from './lsp'; // the createLSPClient instance above

	let code = $state('');
</script>

<div style="height: 400px;">
	<LSPEditor
		content={code}
		uri="file:///workspace/main.ts"
		language="typescript"
		lspClient={client}
		onChange={(value) => (code = value)}
	/>
</div>
```

No LSP server is bundled with the npm package — see the [LSP guide](./guides/lsp.md) for how to run the bridge and wire it up end to end.

### AI, plugins, agents, and VFS

The library also includes opt-in components for an AI assistant panel, a proposal-based plugin system, agent presence, and a virtual filesystem. Each talks to a backend you provide (no servers are bundled). Start with the [AI & agents guide](./guides/ai-and-agents.md) and the [plugins guide](./guides/plugins.md).

## Next steps

- [Editor](./guides/editor.md) — `CustomEditor`, `Editor`, `EditorPane`, and `EditorTabs` in depth
- [Syntax Highlighting](./guides/syntax-highlighting.md) — the tokenizer, supported languages, and token classes
- [Code Folding](./guides/code-folding.md) — bracket, indentation, comment, and region folding
- [Multi-Cursor](./guides/multi-cursor.md) — multiple cursors and selections
- [Theming](./theming.md) — design tokens and how to retheme
- [LSP](./guides/lsp.md) — language-server integration and the bridge backend
- [Collaboration](./guides/collaboration.md) — CRDT / Yjs real-time editing
- [AI & Agents](./guides/ai-and-agents.md) — the AI panel and agent presence
- [Plugins](./guides/plugins.md) — the bring-your-own-backend plugin system
- [Architecture](./architecture.md) — system overview and module map
- [Docs home](./README.md) — the full documentation table of contents
- [Project README](../README.md) — the repository front door

Looking for the API reference? See [Components](./api/components.md), [Stores](./api/stores.md), [Services](./api/services.md), and [Types & Utils](./api/types-and-utils.md).
