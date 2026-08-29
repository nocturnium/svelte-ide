# Realtime Collaboration (CRDT)

`@nocturnium/svelte-ide` ships an optional, conflict-free realtime collaboration layer built on [Yjs](https://docs.yjs.dev/). It lets multiple people (and AI agents) edit the same document at once, with character-level merge resolution, shared undo/redo, and live presence (cursors and selections). The CRDT layer is **opt-in**: it lives behind its own entry point (`@nocturnium/svelte-ide/crdt`) and behind a set of _optional_ peer dependencies, so consumers who do not need collaboration pay nothing for it. Crucially, **no collaboration server URL is baked into the library** — every `serverUrl` you see below is supplied by you at runtime, pointing at a Yjs WebSocket backend you operate.

## Contents

- [Install the optional peer dependencies](#install-the-optional-peer-dependencies)
- [The `/crdt` entry point](#the-crdt-entry-point)
- [Quick start: a synced document](#quick-start-a-synced-document)
- [`<CollaborativeEditor>`](#collaborativeeditor)
- [`CollaborativeDocument`](#collaborativedocument)
- [`CollaborativeProvider`](#collaborativeprovider)
- [Awareness & presence](#awareness--presence)
- [Undo & redo](#undo--redo)
- [Bring your own server](#bring-your-own-server)
- [Cleanup](#cleanup)
- [Related guides](#related-guides)

## Install the optional peer dependencies

The CRDT module depends on three packages that are declared as **optional** peer dependencies. They are not installed by default — add them only when you want collaboration:

```bash
npm install yjs y-websocket y-protocols
```

| Package       | Why it is needed                                                     |
| ------------- | -------------------------------------------------------------------- |
| `yjs`         | The CRDT data types (`Y.Doc`, `Y.Text`, `Y.UndoManager`).            |
| `y-websocket` | The `WebsocketProvider` that syncs a `Y.Doc` over a WebSocket.       |
| `y-protocols` | The `Awareness` protocol used for cursors, selections, and presence. |

If these packages are absent, the rest of the library still works; only imports from `@nocturnium/svelte-ide/crdt` (and `<CollaborativeEditor>`) require them.

## The `/crdt` entry point

Import the collaboration primitives from the dedicated subpath. Use the **published package path** — never `$lib`.

```ts
import {
	CollaborativeDocument,
	CollaborativeProvider,
	createAwarenessProtocol,
	createUndoManager
} from '@nocturnium/svelte-ide/crdt';

import type {
	DocumentOptions,
	ProviderOptions,
	AwarenessState,
	ConnectionStatus,
	CRDTChange,
	SyncState,
	CRDTEventMap
} from '@nocturnium/svelte-ide/crdt';
```

The `/crdt` barrel exports exactly these four runtime values:

| Export                    | Kind     | Summary                                                                                  |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `CollaborativeDocument`   | class    | Wraps a `Y.Doc` with text helpers, snapshots, and built-in undo.                         |
| `CollaborativeProvider`   | class    | Wraps `y-websocket`'s `WebsocketProvider` + `Awareness`, with status/sync subscriptions. |
| `createAwarenessProtocol` | function | Builds a presence helper (users, cursors, selections) over a `Y.Doc`.                    |
| `createUndoManager`       | function | Builds a standalone undo manager bound to a `CollaborativeDocument`.                     |

...plus the TypeScript types listed above (`DocumentOptions`, `ProviderOptions`, `AwarenessState`, `ConnectionStatus`, `CRDTChange`, `SyncState`, `CRDTEventMap`).

The high-level `<CollaborativeEditor>` Svelte component is exported from the package root (and from `@nocturnium/svelte-ide/components/editor`), not from `/crdt`:

```ts
import { CollaborativeEditor } from '@nocturnium/svelte-ide';
// or
import { CollaborativeEditor } from '@nocturnium/svelte-ide/components/editor';
```

> Remember to import the theme once so the editor (and remote-cursor styles) render correctly: `import '@nocturnium/svelte-ide/theme.css';`. See [Theming](../theming.md).

## Quick start: a synced document

The smallest end-to-end setup: create a `Y.Doc`, attach a `CollaborativeProvider` to your own server, and feed the doc into `<CollaborativeEditor>`. The `serverUrl` is yours to supply.

```svelte
<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as Y from 'yjs';
	import { CollaborativeEditor } from '@nocturnium/svelte-ide';
	import { CollaborativeProvider } from '@nocturnium/svelte-ide/crdt';
	import '@nocturnium/svelte-ide/theme.css';

	// 1. A shared Yjs document.
	const doc = new Y.Doc();

	// 2. Connect it to YOUR collaboration server. Nothing is baked in —
	//    this URL comes from your config/env.
	const provider = new CollaborativeProvider({
		serverUrl: import.meta.env.VITE_COLLAB_URL, // e.g. 'wss://collab.example.com'
		roomId: 'project-42:src/main.ts', // any stable per-document key
		doc
	});

	// 3. Announce who we are (drives the presence list / remote cursors).
	provider.setLocalState({
		user: { id: 'u-1', name: 'Ada Lovelace', color: '#a78bfa' },
		state: 'active'
	});

	onDestroy(() => provider.destroy());
</script>

<CollaborativeEditor {doc} textName="content" language="typescript" />
```

Open the same `serverUrl` + `roomId` in two browser tabs and edits merge live.

## `<CollaborativeEditor>`

`<CollaborativeEditor>` wraps the [custom editor](./editor.md) with a Yjs binding so the editor's buffer stays in sync with a `Y.Text`. It does **not** open a network connection by itself — you pair it with a `CollaborativeProvider` (or any `WebsocketProvider`) that syncs the same `Y.Doc`.

### Props

| Prop             | Type                                     | Default       | Description                                                                                                                       |
| ---------------- | ---------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `doc`            | `Y.Doc`                                  | _(internal)_  | The shared Yjs document. If omitted, the component creates an internal, **un-synced** doc — pass your own `doc` to collaborate.   |
| `provider`       | `CollaborativeProvider`                  | —             | An existing provider; its awareness is used for transmitted presence.                                                             |
| `awareness`      | `Awareness`                              | —             | An existing provider-attached awareness instance.                                                                                 |
| `serverUrl`      | `string`                                 | —             | WebSocket URL, when the component should create the provider itself.                                                              |
| `roomId`         | `string`                                 | —             | WebSocket room id, paired with `serverUrl`.                                                                                       |
| `documentId`     | `string`                                 | —             | Optional identifier for standalone mode.                                                                                          |
| `initialContent` | `string`                                 | `''`          | Seed content used when the component creates its own internal doc.                                                                |
| `textName`       | `string`                                 | `'content'`   | The key of the `Y.Text` inside the doc to bind to. Must match what your other peers and `CollaborativeDocument.getText(key)` use. |
| `language`       | `string`                                 | `'plaintext'` | Language id for syntax highlighting (see [Syntax Highlighting](./syntax-highlighting.md)).                                        |
| `readonly`       | `boolean`                                | `false`       | Disable local editing while still receiving remote updates.                                                                       |
| `preferences`    | `Partial<EditorPreferences>`             | `{}`          | Editor preferences (tab size, insert-spaces, etc.).                                                                               |
| `class`          | `string`                                 | `''`          | Extra CSS class on the wrapper.                                                                                                   |
| `currentUser`    | `CollaborationUser`                      | —             | Local user info used for cursor display.                                                                                          |
| `viewingFile`    | `string`                                 | —             | Path broadcast as the file this user is viewing.                                                                                  |
| `editingFile`    | `string`                                 | —             | Path broadcast as the file this user is editing.                                                                                  |
| `remoteCursors`  | `RemoteCursor[]`                         | `[]`          | Other people's carets, name flags and selections, drawn inside the document. See below.                                           |
| `onChange`       | `(content: string) => void`              | —             | Fires when the document content changes.                                                                                          |
| `onCursorChange` | `(line: number, column: number) => void` | —             | Fires when the local cursor moves.                                                                                                |
| `onSave`         | `() => void`                             | —             | Fires on the save shortcut (`Ctrl`/`Cmd`+`S`).                                                                                    |

> Pass the **same `doc` instance** to `<CollaborativeEditor>` that you attach to your provider. If you let the component create its own internal doc, edits are local-only — the component never connects to a server on its own.

### Drawing other people's carets

`remoteCursors` renders peers **inside** the document — a coloured caret, a name
flag above it, and any selection they hold — so they scroll with the text and
survive folding. It is available on `<CollaborativeEditor>` and on
`<CustomEditor>` directly, alongside `showRemoteCursorLabels` (default `true`) to
hide the flags.

The prop is deliberately **not** wired to awareness for you. Awareness carries
whatever your application chose to put in it, so you decide how a peer's state
becomes a caret:

```svelte
<script lang="ts">
	import { CollaborativeEditor } from '@nocturnium/svelte-ide';
	import type { RemoteCursor } from '@nocturnium/svelte-ide/components/editor';

	// Whatever your awareness states look like, mapped to carets.
	let remoteCursors = $derived<RemoteCursor[]>(
		peers.map((p) => ({
			id: p.userId,
			name: p.user.name,
			color: p.user.color,
			// 1-based, matching what `onCursorChange` reports back to you.
			line: p.position.line,
			column: p.position.column,
			selection: p.selection
		}))
	);
</script>

<CollaborativeEditor {doc} {provider} language="typescript" {remoteCursors} />
```

Note the line basis: `RemoteCursor.line` and `.column` are **1-based**, which
matches `onCursorChange` — unlike the editor's internal `Position` and the AI
awareness API, which are 0-based. Off-by-one here puts every peer one row high.

`RemoteCursor` is not re-exported from the package root; import it from the editor
subpath as shown above.

The `CollaborationUser` type (and the other collaboration types) are exported from the package root and from `@nocturnium/svelte-ide/types`:

```ts
import type { CollaborationUser } from '@nocturnium/svelte-ide';
```

## `CollaborativeDocument`

If you want to manage the Yjs document yourself — or build a non-editor surface (preview, diff, terminal) over the same shared text — use `CollaborativeDocument`. It wraps a `Y.Doc`, exposes a `Y.Text` per key, and bundles a built-in `Y.UndoManager`.

```ts
import { CollaborativeDocument } from '@nocturnium/svelte-ide/crdt';

const document = new CollaborativeDocument({
	documentId: 'src/main.ts',
	initialContent: 'export const x = 1;\n',
	enableUndo: true, // default: true
	undoCaptureTimeout: 500 // ms to coalesce edits into one undo step
});

// The underlying Y.Doc — hand this to a provider to sync it.
const ydoc = document.doc;

// Read / mutate text (each method takes an optional key, default 'content').
document.getContent(); // -> string
document.insert(0, '// header\n'); // insert at index
document.delete(0, 10); // delete length from index
document.setContent('replaced'); // replace whole buffer (transactional)

// React to changes.
const off = document.onTextChange((event, transaction) => {
	// event.delta describes the change; transaction.origin tells you who made it
});

// Sync helpers (handy for custom transports / persistence).
const snapshot = document.createSnapshot(); // Uint8Array of full state
document.applySnapshot(snapshot);
const sv = document.getStateVector();
const diff = document.getDiff(sv); // changes since a peer's state vector
document.merge(diff); // apply an incoming update

off();
document.destroy();
```

### `DocumentOptions`

| Field                | Type      | Default      | Description                                                              |
| -------------------- | --------- | ------------ | ------------------------------------------------------------------------ |
| `documentId`         | `string`  | _(required)_ | Logical id for the document.                                             |
| `initialContent`     | `string`  | —            | Seed text inserted into the `'content'` text on creation.                |
| `enableUndo`         | `boolean` | `true`       | Create a built-in `Y.UndoManager` tracking `null` and `'local'` origins. |
| `undoCaptureTimeout` | `number`  | `500`        | Coalesce window (ms) for grouping edits into one undo step.              |

### Built-in undo on the document

`CollaborativeDocument` exposes undo directly when `enableUndo` is on:

```ts
document.canUndo(); // boolean
document.undo(); // boolean — true if something was undone
document.canRedo();
document.redo();
document.trackOrigin('ai'); // also undo edits tagged with this origin
document.clearHistory();
```

For finer control (stack sizes, change subscriptions, per-user scoping) use the standalone [`createUndoManager`](#undo--redo) below.

## `CollaborativeProvider`

`CollaborativeProvider` is a thin, IDE-friendly wrapper around `y-websocket`'s `WebsocketProvider` and `y-protocols`' `Awareness`. It owns the connection, exposes status/sync getters, and offers subscription helpers.

```ts
import { CollaborativeProvider } from '@nocturnium/svelte-ide/crdt';
import type { ProviderOptions } from '@nocturnium/svelte-ide/crdt';

const provider = new CollaborativeProvider({
	serverUrl: 'wss://collab.example.com', // YOUR server — required, never defaulted
	roomId: 'project-42:src/main.ts', // the room/document key
	doc // the Y.Doc to sync
	// --- all optional ---
	// awareness,                 // bring an existing Awareness instance
	// params: { token: '...' },  // query params appended to the WS URL (e.g. auth)
	// connect: true,             // connect immediately (default true)
	// resyncInterval: 30000,     // periodic resync in ms (default 30000)
	// maxBackoffTime: 10000      // max reconnect backoff in ms (default 10000)
});
```

### `ProviderOptions`

| Field            | Type                     | Default      | Description                                                      |
| ---------------- | ------------------------ | ------------ | ---------------------------------------------------------------- |
| `serverUrl`      | `string`                 | _(required)_ | WebSocket URL of **your** Yjs server. There is no default.       |
| `roomId`         | `string`                 | _(required)_ | Room/document name appended to the connection.                   |
| `doc`            | `Y.Doc`                  | _(required)_ | The document to synchronize.                                     |
| `awareness`      | `Awareness`              | _(new)_      | Reuse an existing awareness instance; one is created if omitted. |
| `params`         | `Record<string, string>` | —            | Query params on the WS URL (e.g. auth tokens).                   |
| `connect`        | `boolean`                | `true`       | Connect on construction.                                         |
| `resyncInterval` | `number`                 | `30000`      | Interval (ms) for periodic full resync.                          |
| `maxBackoffTime` | `number`                 | `10000`      | Cap (ms) on reconnect backoff.                                   |

### Properties & methods

```ts
provider.status; // 'connecting' | 'connected' | 'disconnected'
provider.synced; // boolean — initial sync with the server complete
provider.clientId; // number — this client's awareness id
provider.provider; // the raw y-websocket WebsocketProvider, if you need it
provider.awareness; // the raw y-protocols Awareness instance

provider.connect();
provider.disconnect();

// Subscriptions return an unsubscribe function.
const offStatus = provider.onStatus((status: ConnectionStatus) => {
	console.log('connection:', status);
});
const offSync = provider.onSync((synced: boolean) => {
	if (synced) console.log('document synced');
});

provider.destroy(); // tears down provider + awareness and clears listeners
```

The `ConnectionStatus` type is `'connecting' | 'connected' | 'disconnected'`.

## Awareness & presence

Presence — who is in the room, where their cursors and selections are, and what file they are looking at — rides on the Yjs **awareness** protocol. There are two ways to drive it.

### 1. Via the provider's awareness helpers

`CollaborativeProvider` exposes typed shortcuts over its `Awareness` instance using the `AwarenessState` shape:

```ts
import type { AwarenessState } from '@nocturnium/svelte-ide/crdt';

// Publish local presence (merged into the existing local state).
provider.setLocalState({
	user: { id: 'u-1', name: 'Ada Lovelace', color: '#a78bfa' },
	cursor: { anchor: 12, head: 12 },
	selection: { anchor: 12, head: 20 },
	editingFile: 'src/main.ts',
	state: 'active' // 'active' | 'idle' | 'away'
});

// Read presence.
provider.getLocalState(); // AwarenessState | null
provider.getStates(); // Map<clientId, AwarenessState>
provider.getState(clientId); // AwarenessState | undefined
provider.getClientIds(); // number[]

// React to anyone joining, leaving, or moving.
const off = provider.onAwarenessChange((changes, origin) => {
	// changes: { added: number[]; updated: number[]; removed: number[] }
});
```

`AwarenessState` carries `user` (`id`, `name`, `color`, optional `isAI`), optional `cursor`/`selection` (`{ anchor, head }` offsets), optional `viewingFile`/`editingFile`, and a required `state` of `'active' | 'idle' | 'away'`.

### 2. Via `createAwarenessProtocol`

For a presence-focused API decoupled from the connection, build an awareness protocol directly over a `Y.Doc`. This is convenient when you render your own presence UI (avatars, remote cursors) and want a tidy user list.

```ts
import { createAwarenessProtocol } from '@nocturnium/svelte-ide/crdt';

const presence = createAwarenessProtocol(doc);

presence.setUser({ id: 'u-1', name: 'Ada Lovelace', color: '#a78bfa' });
presence.setCursor(12, 12);
presence.setSelection(12, 20);
presence.setEditingFile('src/main.ts');
presence.setViewingFile('README.md');
presence.setState('idle');

// Current participants and their cursors.
presence.getUsers(); // AwarenessUser[]
presence.getCursors(); // Map<clientId, { user, cursor: { anchor, head } }>

// Subscribe; the callback fires immediately with the current users, then on change.
const off = presence.onUsersChange((users) => {
	renderAvatars(users);
});

off();
presence.destroy();
```

> If you create the awareness protocol with `createAwarenessProtocol(doc)`, pass its `presence.awareness` instance into the provider (`new CollaborativeProvider({ ..., awareness: presence.awareness })`) so the presence you publish is the presence that gets synced. Otherwise the provider creates its own separate awareness instance.

## Undo & redo

You have two layers of undo, both backed by Yjs's `Y.UndoManager` (collaborative undo: each user undoes their own edits without clobbering peers').

- **Document-level**: `CollaborativeDocument` has built-in `undo()/redo()/canUndo()/canRedo()` (see above) when `enableUndo` is on.
- **Standalone manager**: `createUndoManager` gives you a richer instance with stack sizes and change notifications.

```ts
import { createUndoManager } from '@nocturnium/svelte-ide/crdt';

const undo = createUndoManager(document, {
	captureTimeout: 500, // group rapid edits (ms)
	trackedOrigins: new Set([null, 'local']) // which edit origins this manager owns
	// deleteFilter: (item) => true        // optional Y.Item filter for deletions
});

undo.undo(); // boolean — true if a change was undone
undo.redo(); // boolean
undo.clear();
undo.stopCapturing(); // force the next edit to start a fresh undo step

undo.getState(); // { canUndo, canRedo, undoStackSize, redoStackSize }

// Drive UI button enable/disable; fires immediately, then on every stack change.
const off = undo.onStateChange((state) => {
	undoButton.disabled = !state.canUndo;
	redoButton.disabled = !state.canRedo;
});

off();
undo.destroy();
```

To scope undo to a single participant's edits in a multi-user room, set `trackedOrigins` to that user's origin (e.g. `new Set(['user-7'])`) and tag that user's transactions with the same origin.

## Bring your own server

**There is no collaboration server bundled with this library and no default `serverUrl` anywhere in the CRDT layer.** You must run a Yjs-compatible WebSocket backend and pass its URL to `CollaborativeProvider` (or to a raw `WebsocketProvider`).

Any server speaking the `y-websocket` protocol works. The reference option is the official one:

```bash
# Minimal dev server on ws://localhost:1234 (port via env).
PORT=1234 npx y-websocket
```

```ts
const provider = new CollaborativeProvider({
	serverUrl: 'ws://localhost:1234',
	roomId: 'demo-room',
	doc
});
```

For production, point `serverUrl` at your own deployment (typically `wss://…`), and use `params` to pass an auth token your server validates:

```ts
const provider = new CollaborativeProvider({
	serverUrl: 'wss://collab.example.com',
	roomId: `${projectId}:${filePath}`,
	doc,
	params: { token: sessionToken }
});
```

> The Go `lsp-bridge` server in `backend/` is for the [LSP integration](./lsp.md), **not** for CRDT collaboration. Collaboration needs a separate Yjs WebSocket server that you supply.

## Cleanup

Collaboration objects hold sockets, observers, and awareness entries. Always tear them down — in a Svelte component, do this in `onDestroy`:

```svelte
<script lang="ts">
	import { onDestroy } from 'svelte';
	// ...create doc, provider, presence, undo...

	onDestroy(() => {
		undo.destroy();
		presence.destroy();
		provider.destroy(); // closes the WebSocket + awareness
		document.destroy(); // if you created a CollaborativeDocument
	});
</script>
```

Destroying the provider also broadcasts the local client's departure, so other peers see you leave.

## Related guides

- [Editor](./editor.md) — the editor surface `<CollaborativeEditor>` wraps.
- [Syntax Highlighting](./syntax-highlighting.md) — language ids and token classes.
- [Multi-cursor & Selections](./multi-cursor.md) — local multi-cursor editing.
- [AI & Agents](./ai-and-agents.md) — AI participants and agent presence.
- [LSP](./lsp.md) — language intelligence (uses the separate `backend/` bridge).
- [Architecture](../architecture.md) — where the CRDT module fits in the system.
- [Theming](../theming.md) — design tokens, including collaboration cursor colors.
- [Components reference](../api/components.md) · [Stores reference](../api/stores.md) · [Services reference](../api/services.md) · [Types & Utils](../api/types-and-utils.md)
