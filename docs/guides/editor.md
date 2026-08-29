# Editor Guide

The editor is the heart of `@nocturnium/svelte-ide`: a custom-built, zero-dependency code editor for Svelte 5 with its own tokenizer, code folding, and multi-cursor editing — no CodeMirror, no Monaco. This guide covers the two component layers you will actually use (`Editor` and `CustomEditor`), every prop and callback they expose, controlled-vs-uncontrolled patterns with runes, the multi-file `EditorPane` / `EditorTabs` components, and the low-level `editor-core` utilities (`createEditorState`, `createNavigation`, `createKeyboardHandler`, `createDefaultKeybindings`) for when you need to drive an editing surface yourself.

> Components ship **unstyled**. Import the theme once in your app root so the design tokens resolve:
>
> ```ts
> import '@nocturnium/svelte-ide/theme.css';
> ```
>
> See [Theming](../theming.md) for how to retheme via CSS custom properties.

---

## `Editor` vs `CustomEditor`

There are two components, and the distinction matters:

|              | `Editor`                                     | `CustomEditor`                                                                                                    |
| ------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Role         | Thin, stable wrapper                         | Full implementation                                                                                               |
| Surface area | Small, curated prop set                      | Every feature flag                                                                                                |
| Use when     | You want a code editor and sensible defaults | You need folding flags, multi-cursor limits, complexity highlighting, AI-presence layers, or per-cursor callbacks |

`Editor` simply wraps `CustomEditor`, forwarding `content`, `language`, `readonly`, `preferences`, `onChange`, `onCursorChange`, and `onSave`, and applying the `.ide-editor` container. It is the recommended entry point — start here and reach for `CustomEditor` only when you need a prop that `Editor` does not surface.

Both are exported from the package root and from the `./components/editor` subpath:

```svelte
<script lang="ts">
	// Either import path works — root re-exports everything.
	import { Editor } from '@nocturnium/svelte-ide';
	// or: import { Editor } from "@nocturnium/svelte-ide/components/editor";

	let code = $state(`function greet(name) {\n  return "Hello, " + name;\n}\n`);
</script>

<div style="height: 400px;">
	<Editor content={code} language="javascript" onChange={(value) => (code = value)} />
</div>
```

> The editor fills its container (`width: 100%; height: 100%`). Always give the parent element an explicit height, or the editor will collapse.

---

## `Editor` props and callbacks

These are the exact props from the `Editor` component's `Props` interface:

| Prop             | Type                                     | Default       | Description                                                                                                                                                           |
| ---------------- | ---------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`        | `string`                                 | — (required)  | Document text to display.                                                                                                                                             |
| `language`       | `string`                                 | `"plaintext"` | Language id for syntax highlighting (e.g. `"typescript"`, `"python"`, `"go"`, `"svelte"`). See [Syntax highlighting](./syntax-highlighting.md) for the supported set. |
| `readonly`       | `boolean`                                | `false`       | Disables editing; navigation/selection keybindings still work.                                                                                                        |
| `preferences`    | `Partial<EditorPreferences>`             | `{}`          | Per-instance overrides for font, tabs, word wrap, line numbers, etc. See [Editor preferences](#editor-preferences).                                                   |
| `class`          | `string`                                 | `""`          | Extra CSS class applied to the editor container.                                                                                                                      |
| `onChange`       | `(content: string) => void`              | —             | Fired (debounced) whenever the document text changes.                                                                                                                 |
| `onCursorChange` | `(line: number, column: number) => void` | —             | Fired when the primary cursor moves. `line`/`column` are reported as the editor exposes them.                                                                         |
| `onSave`         | `() => void`                             | —             | Fired when the save keybinding (Ctrl/Cmd+S) is pressed. The editor does **not** persist anything itself — this is your hook to write the buffer wherever it belongs.  |

There are no Svelte `createEventDispatcher` events on these components — all interaction is through the callback props above. This is the idiomatic Svelte 5 pattern (callback props instead of `on:` events).

---

## `CustomEditor` props and callbacks

`CustomEditor` is a superset of `Editor`. It accepts everything `Editor` does **plus** the following feature flags and extra callbacks (defaults shown are the component's own defaults):

| Prop                     | Type                                           | Default | Description                                                                                                         |
| ------------------------ | ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `folding`                | `boolean`                                      | `true`  | Enables code folding (bracket / indentation / comment / region strategies). See [Code folding](./code-folding.md).  |
| `multiCursor`            | `boolean`                                      | `true`  | Enables multi-cursor editing. See [Multi-cursor](./multi-cursor.md).                                                |
| `maxCursors`             | `number`                                       | `100`   | Upper bound on simultaneous cursors.                                                                                |
| `complexityHighlighting` | `boolean`                                      | `false` | Highlights high-complexity regions inline.                                                                          |
| `complexityThreshold`    | `number`                                       | `5`     | Lowest raw Cognitive Complexity that gets a mark. Not the deprecated 0-100 score — 5/10/15 are the band boundaries. |
| `complexityProvider`     | `ComplexityProvider`                           | —       | Optional pluggable analysis; refines the built-in reading. See below.                                               |
| `aiAgents`               | `AIAwareness[]`                                | `[]`    | AI agents to visualize (Ghost Pair cursors / focus regions). See [AI and agents](./ai-and-agents.md).               |
| `showAILabels`           | `boolean`                                      | `true`  | Show name labels next to AI cursors.                                                                                |
| `showAIFocusRegions`     | `boolean`                                      | `false` | Shade the region an AI agent is focused on.                                                                         |
| `onCursorsChange`        | `(cursors: readonly Cursor[]) => void`         | —       | Fired when the **set** of cursors changes (multi-cursor aware), complementing the single-cursor `onCursorChange`.   |
| `onComplexityChange`     | `(metrics: ComplexityMetrics \| null) => void` | —       | Fired when computed complexity metrics change.                                                                      |

> The `AIAwareness` and `ComplexityMetrics` types named in the table above are not re-exported from the package root; if you need to import them, pull them from the editor subpath: `import type { AIAwareness, ComplexityMetrics } from "@nocturnium/svelte-ide/components/editor"`.

Reach for `CustomEditor` directly when you want, for example, to cap cursors, disable folding, or wire up AI presence:

```svelte
<script lang="ts">
	import { CustomEditor } from '@nocturnium/svelte-ide';
	import type { Cursor } from '@nocturnium/svelte-ide';

	let source = $state('const answer = 42;\n');
	let cursorCount = $state(1);
</script>

<div style="height: 480px;">
	<CustomEditor
		content={source}
		language="typescript"
		folding={true}
		multiCursor={true}
		maxCursors={8}
		complexityHighlighting={false}
		onChange={(value) => (source = value)}
		onCursorsChange={(cursors) => (cursorCount = cursors.length)}
	/>
</div>

<p>{cursorCount} cursor{cursorCount === 1 ? '' : 's'} active</p>
```

---

## Editor preferences

`preferences` is a `Partial<EditorPreferences>`; any keys you omit fall back to the editor's defaults. The full shape (from `EditorPreferences`):

```ts
interface EditorPreferences {
	fontSize: number;
	fontFamily: string;
	tabSize: number;
	insertSpaces: boolean;
	wordWrap: 'off' | 'on' | 'wordWrapColumn';
	wordWrapColumn: number;
	lineNumbers: 'on' | 'off' | 'relative';
	minimap: boolean;
	bracketMatching: boolean;
	autoCloseBrackets: boolean;
	highlightActiveLine: boolean;
	renderWhitespace: 'none' | 'boundary' | 'all';
	theme: string;
}
```

The defaults applied when a key is not provided:

```ts
{
  fontSize: 14,
  fontFamily: "JetBrains Mono",
  tabSize: 2,
  insertSpaces: false,
  wordWrap: "off",
  wordWrapColumn: 80,
  lineNumbers: "on",
  minimap: false,
  bracketMatching: true,
  autoCloseBrackets: true,
  highlightActiveLine: true,
  renderWhitespace: "none",
  theme: "nocturnium",
}
```

The constant is exported as `DEFAULT_EDITOR_PREFERENCES` if you want to start from it:

```svelte
<script lang="ts">
	import { Editor } from '@nocturnium/svelte-ide';
	import { DEFAULT_EDITOR_PREFERENCES } from '@nocturnium/svelte-ide/types';

	let code = $state('');

	const prefs = {
		...DEFAULT_EDITOR_PREFERENCES,
		fontSize: 16,
		tabSize: 4,
		insertSpaces: true,
		wordWrap: 'on' as const,
		lineNumbers: 'relative' as const
	};
</script>

<div style="height: 400px;">
	<Editor content={code} language="python" preferences={prefs} onChange={(v) => (code = v)} />
</div>
```

The `EditorPreferences` **type** is available from the package root and from the `./types` subpath. The runtime constant `DEFAULT_EDITOR_PREFERENCES` is a value, so import it from the `./types` subpath (`@nocturnium/svelte-ide/types`) as shown above — the package root re-exports editor types only, not this value. See [Types and utils](../api/types-and-utils.md).

---

## Controlled vs uncontrolled usage with runes

The editor maintains its own internal document state, so you get to choose how tightly your component mirrors it.

### Controlled

You hold the source of truth in `$state` and write back to it inside `onChange`. The `content` prop reflects your state; your state reflects user edits. This is the right default — it keeps your model authoritative and lets you transform, validate, or persist on every change.

```svelte
<script lang="ts">
	import { Editor } from '@nocturnium/svelte-ide';

	let code = $state('// start typing\n');

	// Derived values stay in sync automatically.
	let lineCount = $derived(code.split('\n').length);
</script>

<div style="height: 400px;">
	<Editor content={code} language="javascript" onChange={(value) => (code = value)} />
</div>

<footer>{lineCount} lines</footer>
```

Because `code` drives `content`, you can also mutate it from outside the editor (load a new file, run a formatter, reset to a template) and the editor re-renders to match:

```svelte
<button onclick={() => (code = '')}>Clear</button>
<button onclick={() => (code = templateFor(language))}>Reset to template</button>
```

> Avoid feedback loops: update `code` _from_ `onChange`, but do not re-derive `content` from a value you also mutate inside `onChange`. Keep one piece of `$state` as the single source of truth.

### Uncontrolled

If you only need the final value at specific moments (on save, on submit), let the editor own the buffer and capture the value through `onChange` (or `onSave`) without binding it back to `content` on every keystroke:

```svelte
<script lang="ts">
	import { Editor } from '@nocturnium/svelte-ide';

	// `initial` seeds the editor once; latestValue is updated but not fed back to `content`.
	const initial = 'const users = await db.query("users");\n';
	let latestValue = initial;

	function handleSave() {
		void persist(latestValue);
	}
</script>

<div style="height: 320px;">
	<Editor
		content={initial}
		language="typescript"
		onChange={(value) => (latestValue = value)}
		onSave={handleSave}
	/>
</div>
```

### Read-only

Pass `readonly` for a viewer. Cursor movement and text selection still work (handy for copying), but edits are blocked:

```svelte
<Editor content={logOutput} language="plaintext" readonly />
```

---

## Multi-file editing: `EditorPane` and `EditorTabs`

For a multi-file experience, the library ships a tab-aware pair backed by the editor store. `EditorPane` renders the tab strip plus the active buffer; `EditorTabs` is the tab strip on its own if you want to compose it yourself.

### `EditorPane`

`EditorPane` is **store-driven**: it reads open tabs, the active tab, and the active buffer straight from the editor store, so you manage files by calling store actions (`openFile`, `setActiveTab`, `closeTab`, …) rather than passing tab arrays in as props. Its props are small:

| Prop          | Type                                               | Default | Description                                                                                                                    |
| ------------- | -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `preferences` | `Partial<EditorPreferences>`                       | `{}`    | Forwarded to the underlying editor.                                                                                            |
| `onSave`      | `(path: string, content: string) => Promise<void>` | —       | Called with the active tab's path and content when Ctrl/Cmd+S fires. The pane marks the tab clean after your promise resolves. |
| `class`       | `string`                                           | `""`    | Extra CSS class on the pane container.                                                                                         |

`EditorPane` already wires content edits and cursor moves back into the store and shows a "No files open" empty state when there are no tabs. A tab whose `aiEditing` flag is set is rendered read-only.

Open files through the store and the pane updates itself:

```svelte
<script lang="ts">
	import { EditorPane } from '@nocturnium/svelte-ide';
	import { openFile } from '@nocturnium/svelte-ide/stores';

	// Seed some tabs (e.g. after loading from your backend).
	openFile('src/app.ts', 'export const app = createApp();\n', { language: 'typescript' });
	openFile('README.md', '# My Project\n', { language: 'markdown' });

	async function save(path: string, content: string) {
		await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
			method: 'PUT',
			body: content
		});
	}
</script>

<div style="height: 600px;">
	<EditorPane onSave={save} />
</div>
```

The editor store actions you will use most (all exported from `@nocturnium/svelte-ide/stores`):

- `openFile(path, content, options?)` — open or focus a tab. `options` is `{ language?: string; focus?: boolean }`. Returns the tab id; language is auto-detected from the filename when omitted.
- `setActiveTab(tabId)` / `nextTab()` / `prevTab()` — switch the focused tab.
- `closeTab(tabId)` / `closeOtherTabs(keepTabId)` / `closeAllTabs()` — close tabs (dirty tabs are protected; `forceCloseTab` skips that check).
- `updateContent(tabId, content)` / `markSaved(tabId, newContent?)` — mutate buffer / clear the dirty flag.
- `updatePreferences(updates)` / `resetPreferences()` — global preference state.

> The cursor-update action is exported under a renamed alias (`updateEditorCursor`) to avoid clashing with the collaboration and agent stores; the same is true of a few other names (e.g. `editorError`, `setEditorError`). `EditorPane` calls these internally, so you rarely need them directly.

Reactive store getters are exposed both as plain getter functions (`getTabs()`, `getActiveTab()`, `getHasDirtyTabs()`) and as `.current` accessors so they work inside `$derived`:

```svelte
<script lang="ts">
	import { tabs, activeTab, hasDirtyTabs } from '@nocturnium/svelte-ide/stores';

	let openCount = $derived(tabs.current.length);
	let currentPath = $derived(activeTab.current?.path ?? '—');
	let unsaved = $derived(hasDirtyTabs.current);
</script>

<status-bar>{currentPath} · {openCount} open {unsaved ? '· unsaved changes' : ''}</status-bar>
```

See [Stores reference](../api/stores.md) for the full editor-store API.

### `EditorTabs`

`EditorTabs` is the presentational tab strip. Unlike `EditorPane`, it is fully **prop-driven** — pass it the tab list and callbacks, and it owns no store coupling. Useful when you maintain tab state yourself or want the tab UI without the editor body.

| Prop            | Type                                         | Default      | Description                                           |
| --------------- | -------------------------------------------- | ------------ | ----------------------------------------------------- |
| `tabs`          | `EditorTab[]`                                | — (required) | Tabs to render.                                       |
| `activeTabId`   | `string \| null`                             | — (required) | Id of the active tab.                                 |
| `onSelect`      | `(tabId: string) => void`                    | — (required) | Called when a tab is clicked / activated by keyboard. |
| `onClose`       | `(tabId: string) => void`                    | — (required) | Called when a tab's close button is clicked.          |
| `onContextMenu` | `(tabId: string, event: MouseEvent) => void` | —            | Optional right-click handler.                         |
| `class`         | `string`                                     | `""`         | Extra CSS class.                                      |

Each tab renders a `FileIcon`, the name (italicized when `isDirty`), a dirty dot, a sparkles indicator when `aiEditing` is set, and a close button.

```svelte
<script lang="ts">
	import { EditorTabs } from '@nocturnium/svelte-ide';
	import type { EditorTab } from '@nocturnium/svelte-ide';

	let tabs = $state<EditorTab[]>([
		{ id: '1', path: 'a.ts', name: 'a.ts', content: '', language: 'typescript', isDirty: false },
		{ id: '2', path: 'b.css', name: 'b.css', content: '', language: 'css', isDirty: true }
	]);
	let activeTabId = $state<string | null>('1');
</script>

<EditorTabs
	{tabs}
	{activeTabId}
	onSelect={(id) => (activeTabId = id)}
	onClose={(id) => (tabs = tabs.filter((t) => t.id !== id))}
/>
```

The `EditorTab` shape (from the package types):

```ts
interface EditorTab {
	id: string;
	path: string;
	name: string;
	content: string;
	language: string;
	isDirty: boolean;
	cursorPosition?: { line: number; column: number };
	scrollPosition?: { top: number; left: number };
	aiEditing?: boolean; // tab is being edited by an AI agent
	version?: number; // CRDT conflict-resolution version
}
```

### `FileExplorer` and `FileIcon`

A file tree (`FileExplorer`) and a per-extension icon (`FileIcon`) round out a typical IDE shell. `FileExplorer` is prop-driven over a `FileNode[]` tree and emits `onSelect` / `onOpen` (double-click) callbacks, among others (`onToggle`, `onNewFile`, `onNewFolder`, `onRename`, `onDelete`, `onLock`, `onUnlock`). Wire `onOpen` to `openFile` to feed the `EditorPane`:

```svelte
<script lang="ts">
	import { FileExplorer, EditorPane } from '@nocturnium/svelte-ide';
	import { openFile } from '@nocturnium/svelte-ide/stores';

	// FileNode is exported from the FileExplorer module.
	const files = [
		{
			id: '1',
			name: 'src',
			type: 'folder',
			path: 'src',
			expanded: true,
			children: [{ id: '2', name: 'app.ts', type: 'file', path: 'src/app.ts' }]
		}
	];

	async function loadAndOpen(node: { path: string; type: string }) {
		if (node.type !== 'file') return;
		const content = await fetch(`/api/files?path=${node.path}`).then((r) => r.text());
		openFile(node.path, content);
	}
</script>

<div style="display: grid; grid-template-columns: 240px 1fr; height: 600px;">
	<FileExplorer {files} onOpen={loadAndOpen} />
	<EditorPane onSave={async () => {}} />
</div>
```

`FileExplorer` also accepts lock/agent/status maps (`lockStatuses`, `agentsByFile`, `fileStatuses`) for collaborative scenarios — see the [VFS](../api/services.md) and [collaboration](./collaboration.md) docs.

---

## Editor-core utilities

Everything above is built on a headless core under `./components/editor/core`, re-exported from the package root. Use it directly when you are building a bespoke editing surface, embedding the model in a non-standard view, or writing tools/tests against editor state. These are plain TypeScript classes and factories — no Svelte required.

The four factories you will reach for:

```ts
import {
	createEditorState,
	createNavigation,
	createKeyboardHandler,
	createDefaultKeybindings
} from '@nocturnium/svelte-ide';
import type {
	EditorState,
	Navigation,
	KeyboardHandler,
	Keybinding,
	Position,
	Selection,
	Cursor
} from '@nocturnium/svelte-ide';
```

### `createEditorState(config?)`

Creates the document model — content, cursors, selections, and undo/redo history. It is multi-cursor aware and merges overlapping cursors automatically.

```ts
const state = createEditorState({
	content: 'function add(a, b) {\n  return a + b;\n}\n',
	language: 'javascript',
	tabSize: 2,
	insertSpaces: true,
	maxCursors: 100
});

state.getContent(); // current text
state.setContent('...'); // replace whole document
state.setLanguage('python'); // change tokenizer
state.undo(); // -> boolean (true if a change was reverted)
state.redo();
```

`EditorStateConfig` accepts `content`, `language`, `maxHistorySize`, `tabSize`, `insertSpaces`, and `maxCursors`. Subscribe to changes with the listener methods, e.g. `state.onSelectionChange((selection) => { ... })`, which returns an unsubscribe function.

### `createNavigation(state)`

Wraps an `EditorState` with cursor movement. Every movement method takes an optional `extend` boolean — pass `true` to extend the selection instead of collapsing it.

```ts
const nav = createNavigation(state);

nav.moveLeft(); // collapse + move
nav.moveRight(true); // extend selection right
nav.moveUp();
nav.moveDown();
nav.moveToLineStart();
nav.moveToLineEnd(true);
nav.moveWordLeft();
nav.moveWordRight(true);
nav.moveToDocumentStart();
nav.moveToDocumentEnd();
nav.movePageUp(20); // pageSize lines
nav.movePageDown(20, true);
nav.selectWord();
nav.selectLine();
```

### `createKeyboardHandler()` and `createDefaultKeybindings(state, nav, options?)`

`createDefaultKeybindings` returns the standard `Keybinding[]` (arrows, word/line/document motions, selection extension, save, etc.). `createKeyboardHandler` is the dispatcher that matches a `KeyboardEvent` against a binding list and runs the handler. Wire them together and feed it `keydown`:

```ts
const state = createEditorState({ content: '', language: 'javascript' });
const nav = createNavigation(state);

const handler = createKeyboardHandler();
handler.setKeybindings(
	createDefaultKeybindings(state, nav, {
		onSave: () => persist(state.getContent()),
		readonly: false,
		pageSize: 20
	})
);

element.addEventListener('keydown', (event) => {
	// returns true (and calls preventDefault) when a binding handled the event
	handler.handleKeyDown(event, /* readonly */ false);
});
```

The handler also lets you extend or trim the binding set at runtime:

```ts
handler.addKeybinding({
	key: 'd',
	modifiers: { ctrl: true },
	description: 'Duplicate line',
	handler: () => duplicateCurrentLine(state)
});

handler.removeKeybinding('d', { ctrl: true });
handler.setEnabled(false); // temporarily ignore all keys
handler.getKeybindings(); // introspect for a shortcut cheatsheet
```

A `Keybinding` is:

```ts
interface Keybinding {
	key: string; // e.g. "ArrowLeft", "Enter", "s"
	modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean };
	handler: () => boolean | void; // return false to let the event fall through
	description?: string; // shown in help / cheatsheets
	readonly?: boolean; // also runs while the editor is read-only
}
```

> Modifier matching treats Cmd (meta) on macOS as Ctrl, so a binding with `{ ctrl: true }` fires on Ctrl (Windows/Linux) and Cmd (macOS) alike. Returning `false` from a `handler` signals "not handled" and lets the original key event proceed.

Beyond these four, the `core` barrel also exports utilities for folding (`createFoldManager`), search, multi-cursor management, CRDT binding (`createCRDTBinding`), and more — covered in [Code folding](./code-folding.md), [Multi-cursor](./multi-cursor.md), and [Collaboration](./collaboration.md).

---

## Related guides

- [Getting started](../getting-started.md) — install, theme, and your first editor.
- [Syntax highlighting](./syntax-highlighting.md) — the tokenizer, supported languages, and token classes.
- [Code folding](./code-folding.md) — folding strategies and the fold manager.
- [Multi-cursor](./multi-cursor.md) — multi-cursor editing and selections.
- [LSP](./lsp.md) — `LSPEditor` and connecting to an LSP-over-WebSocket bridge.
- [Collaboration](./collaboration.md) — CRDT / Yjs realtime editing with `CollaborativeEditor`.
- [AI and agents](./ai-and-agents.md) — AI presence layers and the AI panel.
- API reference: [Components](../api/components.md) · [Stores](../api/stores.md) · [Types and utils](../api/types-and-utils.md).

## Cognitive complexity

The editor measures [SonarSource Cognitive
Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) — how hard
code is to hold in your head, not how many paths it has. Higher is worse, the
number is unbounded, and `15` is SonarSource's published threshold for a function
that has grown too complex to keep.

```svelte
<CustomEditor
	{content}
	language="typescript"
	complexityHighlighting
	complexityThreshold={COGNITIVE_COMPLEXITY_BANDS.medium}
	onComplexityChange={(m) => (metrics = m)}
/>
```

Read `metrics.maxCognitiveComplexity` (the hottest function) and
`region.cognitiveComplexity`. `score` and `overall` still exist but are
deprecated: `score` saturates at 15, and `overall` is a length-weighted mean that
_falls_ when you append simple functions.

### Plugging in better analysis

The built-in analyzer is a token scanner: instant, offline, no configuration, and
it works on every language the tokenizer knows. It is also an approximation of a
parser. A differential harness pins it against an AST reference on every build,
but that reference only speaks JavaScript and TypeScript — so on the other 30
languages the scanner is unverified, and it will occasionally be wrong.

When you need more than an approximation, supply a provider. It runs _after_ the
built-in result is already on screen, so typing is never blocked and a slow or
failing provider simply leaves the built-in reading in place.

```ts
import { createOllamaComplexityProvider } from '@nocturnium/svelte-ide';

const provider = createOllamaComplexityProvider({ model: 'qwen2.5-coder:1.5b' });
```

```ts
import { createOpenAICompatibleComplexityProvider } from '@nocturnium/svelte-ide';

const provider = createOpenAICompatibleComplexityProvider({
	endpoint: 'https://your-gateway.example.com/v1/chat/completions',
	model: 'your-small-fast-model',
	apiKey: import.meta.env.VITE_YOUR_KEY
});
```

Anything that turns a string into a string works — a language server, your own
AST pass, a queue:

```ts
import { createChatComplexityProvider } from '@nocturnium/svelte-ide';

const provider = createChatComplexityProvider(
	async (prompt, signal) => myBackend.complete(prompt, { signal }),
	{ source: 'my-analyzer' }
);
```

Or implement the interface directly, if you are not using a model at all:

```ts
import type { ComplexityProvider } from '@nocturnium/svelte-ide';

const provider: ComplexityProvider = async ({ code, language, signal }) => ({
	regions: await myParser.analyze(code, language, signal),
	source: 'my-parser'
});
```

**This library never calls a model.** It defines the contract and ships transports
built on `fetch` alone; there is no default endpoint and no default key, and no
code leaves the machine unless you wire it to. The package keeps zero runtime
dependencies either way.

Replies are validated, never trusted — malformed JSON, negative or fractional
scores, and out-of-range line spans are refused, and the provider declines rather
than render them. `metrics.source` tells you which reading you are looking at
(`'builtin'` or `'provider'`) and `metrics.sourceName` carries the model or tool
id; both tooltips display it, so a number is always attributable.

`buildComplexityPrompt` is exported if you want to inspect or replace the
instruction sent to a model.

### Measured: do not use an LLM for this particular metric

The seam was validated against a local llama.cpp OpenAI-compatible proxy across
77 models. The honest result is that a language model is the **wrong tool for
Cognitive Complexity**, and the numbers are worth stating plainly:

|                      | exact       | declined | latency |
| -------------------- | ----------- | -------- | ------- |
| Built-in scanner     | **12 / 12** | 0        | < 1 ms  |
| Devstral-Small-2-24B | 4 / 12      | 0        | ~5 s    |
| Qwen3-Coder-30B-A3B  | 4 / 12      | 8        | ~45 s   |

Ground truth came from an independent AST implementation of the SonarSource
rules, not from the scanner, so this is not the scanner grading itself.

Worse than the accuracy is the stability. Asked the same function three times at
`temperature: 0`, Devstral answered **7, then 10, then 12**. The true value is 16.
A metric that changes when nothing changed is not a metric.

This is not really a surprise in hindsight. Cognitive Complexity is mechanical
counting over a syntax tree — precisely what a parser is good at and a language
model is bad at. The failure mode is also the dangerous one: the faster model
never declined, so it produced confidently wrong numbers rather than admitting
it did not know.

**So use this seam to plug in a parser**, not a model: tree-sitter, a language
server, or your own AST pass. That is where the accuracy the built-in scanner
cannot reach on its 30 unverified languages actually lives. The chat transports
remain because the seam is generic and the plumbing is useful — but if you wire
one up for complexity scoring, measure it against a reference before you trust
a number it produces.

### The rules, for any parser

Parsing is a solved problem with a dozen good libraries. Implementing Campbell's
rules correctly is not — it took this repository four review rounds and a
differential harness to get the token scanner there, and every defect found was
in the rules, not the parsing. So the rules ship here, and you bring the tree.

Describe your parser's node shapes with a `ComplexityAstAdapter` and
`analyzeAstComplexity` applies the whitepaper's rules for you, identically across
every language your parser supports.

```ts
import { createAstComplexityProvider, createEstreeAdapter } from '@nocturnium/svelte-ide';
import * as acorn from 'acorn';

const provider = createAstComplexityProvider({
	// `sourceType: 'module'` is not optional in practice: without it acorn throws
	// on the first `import` or `export`, the provider declines, and you silently
	// get the built-in reading while believing you are getting the parser's.
	parse: (code) =>
		acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true }),
	adapter: createEstreeAdapter(),
	source: 'acorn'
});
```

`createEstreeAdapter` covers anything emitting ESTree — acorn, espree, meriyah,
`@typescript-eslint/parser` — so JS, JSX, TS and TSX. For a parser with its own
node shapes, write your own. The one below is a working sketch rather than a
tested adapter — the node type names are grammar-specific, and you should check
each against the grammar you install:

```ts
import { createAstComplexityProvider, type ComplexityAstAdapter } from '@nocturnium/svelte-ide';

const treeSitter: ComplexityAstAdapter<SyntaxNode> = {
	kindOf: (node, parent) => {
		switch (node.type) {
			case 'function_declaration':
			case 'method_definition':
				return 'function';
			case 'if_statement':
				return parent?.type === 'else_clause' ? 'else-if' : 'if';
			case 'else_clause':
				return 'else';
			case 'for_statement':
			case 'while_statement':
				return 'loop';
			case 'switch_statement':
				return 'switch';
			case 'catch_clause':
				return 'catch';
			case 'ternary_expression':
				return 'ternary';
			case 'binary_expression': {
				// `childForFieldName` is the accessor both bindings agree on.
				const operator = node.childForFieldName('operator')?.text;
				return operator === '&&' || operator === '||' ? 'boolean-sequence' : null;
			}
			default:
				return null;
		}
	},
	childrenOf: (node) => node.namedChildren,
	lineRangeOf: (node) => ({
		startLine: node.startPosition.row,
		endLine: node.endPosition.row
	}),
	nameOf: (node) => node.childForFieldName('name')?.text,
	bodyOf: (node) => node.childForFieldName('body') ?? null
};
```

The parser is always **your** dependency. This package still installs nothing.

Two subtleties the adapter interface exists to get right, both of which were real
bugs caught by the sweep below rather than by reasoning:

- `bodyOf` names which child raises nesting. A loop's init clause and an `if`'s
  condition are not the body, so a ternary in either is not charged for depth it
  does not create. It is required rather than optional precisely because the
  default — nesting everything — is wrong in a way nothing would tell you.
- `mergedIncrementOf` covers a node that is two things at once. ESTree has no
  `else` node, so `else while (x) {}` is a loop sitting in the `alternate` slot —
  it must score as both, and at the same depth as `else { while (x) {} }`, because
  adding braces must never change the number.

You can also use the rules outside an editor entirely — a CI gate, a report, a
pre-commit hook — with `astComplexityMetrics(tree, adapter)`.

#### How this is verified

The walker is checked against an independent AST implementation of the
SonarSource rules on a 30-case curated corpus **and on every function in this
repository** — over 300 comparisons, asserting exact score agreement, on every
build. Both sides consume the same transpiled JavaScript through the same parser,
so there is no approximation to forgive and any disagreement is a real
disagreement about the rules.

That sweep is not decorative. Writing it turned up four genuine defects that
review had not: recursion judged against the wrong function (a `setTimeout`
callback calling its enclosing `connect()` is still recursion), an `else` that
changed score depending on braces, and — in the reference implementation that had
been gating this feature all along — a blind spot for expression-bodied arrow
functions, which scored `(a, b) => a && b` as 0.

### Building a provider chain

A real deployment usually wants more than one provider: a parser where a parser
exists, something slower behind it, and a bound on how long any of it may take.

```ts
import {
	composeComplexityProviders,
	withComplexityCache,
	withComplexityTimeout
} from '@nocturnium/svelte-ide';

const provider = withComplexityCache(
	composeComplexityProviders(
		createAstComplexityProvider({ parse, adapter: createEstreeAdapter() }),
		withComplexityTimeout(createOllamaComplexityProvider({ model: 'qwen2.5-coder' }), 3000)
	)
);
```

`composeComplexityProviders` takes the first provider that answers; one that
declines or throws is skipped, so a failing network provider cannot mask a
working local one. `withComplexityCache` keys on content and language, so it is
always coherent — there is no invalidation to get wrong. `withComplexityTimeout`
aborts the inner provider rather than merely ignoring it.

There is deliberately **no retry combinator**. One model averaged 44.7 seconds
per request in the measurements above; retrying that turns a slow refinement into
a stuck one, and the editor already re-asks on the next keystroke with a fresh
abort. Timeouts, not retries, are the right bound here.
