# API: Types & Utils

`@nocturnium/svelte-ide` ships a large set of TypeScript type definitions and a small bundle of zero-dependency utility functions. The types model every domain the library touches — the editor, the virtual filesystem, AI assistance, plugins, real-time collaboration, agents, the IDE event system, and the Language Server Protocol — and are published both from the package root (`@nocturnium/svelte-ide`) and from the dedicated `@nocturnium/svelte-ide/types` entry point. The utilities (`@nocturnium/svelte-ide/utils`) cover language detection, human-readable formatting, and keybinding handling. This page summarizes the public type modules and documents the utility functions with real signatures and examples. Everything below is re-exported from the root entry, so you can import any of it from `@nocturnium/svelte-ide` directly. For the components and stores that consume these types, see [API: Components](./components.md), [API: Stores](./stores.md), and [API: Services](./services.md).

> Stability note: in the package's root barrel (`src/lib/index.ts`), the re-export blocks are annotated with `@public`/`@experimental` JSDoc tags. Almost everything on this page is tagged `@experimental` and may change between minor versions. The exception is a small, deliberately stable LSP subset — see [Stable vs. experimental](#stable-vs-experimental-lsp-types) below. Treat experimental types as useful shapes for your own code, not as a frozen contract.

---

## Importing types and utils

Types are type-only re-exports; utilities are real runtime functions.

```ts
// Types — from the root or the dedicated entry point (both work)
import type {
	EditorTab,
	CursorPosition,
	FileEntry,
	AIMessage,
	Diagnostic,
	LSPConnectionState
} from '@nocturnium/svelte-ide';

import type { CollaborationUser, VFSFileLock } from '@nocturnium/svelte-ide/types';

// Utilities — runtime functions
import {
	detectLanguage,
	formatFileSize,
	formatKeybinding,
	defaultKeybindings
} from '@nocturnium/svelte-ide/utils';
```

Both entry points expose the same names; the root re-exports `./types` and `./utils` wholesale.

---

## Type modules at a glance

| Module       | Domain                                  | Headline exported types                                                                                                               |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `editor`     | Tabs, cursors, view state, preferences  | `EditorTab`, `CursorPosition`, `EditorPreferences`, `EditorSelection`, `EditorViewState`, `SplitMode`, `DEFAULT_EDITOR_PREFERENCES`   |
| `filesystem` | Files, search, pluggable backends       | `FileNode`, `FileEntry`, `FileStat`, `FileOperation`, `SearchOptions`, `SearchResult`, `FilesystemAdapter`                            |
| `ai`         | Chat, tools, suggestions, edit sessions | `AIMessage`, `AIRole`, `AITool`, `AIContext`, `AIConversation`, `AIPanelConfig`, `AISuggestion`, `AIEditSession`                      |
| `events`     | IDE-wide event bus                      | `IDEEvent`, `IDEEventType`, `EventBus`, `IDECommand`, `IDEKeybinding`, plus per-event payload types                                   |
| `plugin`     | Proposal-based plugin lifecycle         | `PluginProposal`, `PluginStatus`, `PluginManifest`, `PluginInstance`, `PluginPermission`, `PluginContributions`, `PluginEvent`        |
| `crdt`       | Yjs-backed collaboration                | `CollaborationConfig`, `CollaborationUser`, `CollaborationState`, `CollaboratorAwareness`, `CollaborationEvent`, `YjsDocumentOptions` |
| `agents`     | Multi-agent presence & coordination     | `Agent`, `AgentStatus`, `AgentType`, `AgentTask`, `AgentProgress`, `TeamEvent`, `AgentActivity`, `AgentCursor`                        |
| `vfs`        | Virtual filesystem backend              | `VFSFileInfo`, `VFSFile`, `VFSWorkspace`, `VFSTransaction`, `VFSOperation`, `VFSFileLock`, `VFSEvent`, `VFSError`                     |
| `lsp`        | Language Server Protocol (LSP 3.17)     | `Position`, `Range`, `Diagnostic`, `CompletionItem`, `Hover`, `ServerCapabilities`, `LSPClientConfig`, `LSPConnectionState`           |

The sections below describe each module's most important shapes. The tables above are not exhaustive — open the corresponding `src/lib/types/*.ts` file (or your editor's go-to-definition) for every field.

---

## `editor` — editor model types

The editor module describes the documents you put in front of users and the per-document view state.

- **`EditorTab`** — one open document: `id`, `path`, `name`, `content`, `language`, `isDirty`, optional `cursorPosition`/`scrollPosition`, an `aiEditing` flag, and a `version` used for CRDT conflict resolution.
- **`CursorPosition`** — `{ line: number; column: number }`. This is the canonical cursor shape reused across the agents and event modules.
- **`ScrollPosition`** — `{ top: number; left: number }`.
- **`EditorSelection`** — an `anchor`/`head` pair of `CursorPosition`s.
- **`EditorViewState`** — a snapshot you can persist and restore: `cursorPosition`, `scrollPosition`, `selections`, and `foldedRanges` (line numbers).
- **`EditorPreferences`** — font, tab size, word-wrap mode, line numbers, minimap, bracket matching, whitespace rendering, theme, and more.
- **`SplitMode`** — `'none' | 'horizontal' | 'vertical'`.
- **`DEFAULT_EDITOR_PREFERENCES`** — a ready-to-use `EditorPreferences` constant (a real runtime value, not just a type) you can spread and override.

```ts
import { DEFAULT_EDITOR_PREFERENCES } from '@nocturnium/svelte-ide';
import type { EditorPreferences } from '@nocturnium/svelte-ide';

const prefs: EditorPreferences = {
	...DEFAULT_EDITOR_PREFERENCES,
	fontSize: 16,
	lineNumbers: 'relative',
	minimap: true
};
```

> Note: the editor _component_ core (from `@nocturnium/svelte-ide`) also exports `Position` and `Selection` types from the tokenizer/editor-state layer. Those are distinct from the LSP `Position` and the model `CursorPosition` here. See [Editor guide](../guides/editor.md) and [Multi-cursor](../guides/multi-cursor.md).

---

## `filesystem` — files, search, and the adapter contract

This module is backend-agnostic: it describes file shapes and a pluggable adapter you can implement against any storage.

- **`FileNode`** — a tree node (`path`, `name`, `isDirectory`, optional `children`, `size`, `modifiedAt`, `language`), used to render explorers.
- **`FileEntry`** — a loaded file with `content`, `language`, `size`, `lineCount`, and an optional `version`.
- **`FileStat`** — metadata only (`path`, `name`, `isDirectory`, `size`, `createdAt`, `modifiedAt`).
- **`FileOperation`** — a description of a create/read/update/delete/rename/move (`type`, `path`, optional `newPath`/`content`).
- **`SearchOptions`** / **`SearchResult`** / **`TextMatch`** — regex/case/whole-word search inputs and their results (per-line matches with character offsets).
- **`WatchEvent`**, **`WatchCallback`**, **`Unsubscribe`** — the watch primitives.
- **`FilesystemAdapter`** — the interface to implement for a custom backend. Read ops (`readFile`, `readDirectory`, `exists`, `stat`), write ops (`writeFile`, `createDirectory`, `delete`, `rename`, `copy`), `search`, and an optional `watch`.

```ts
import type { FilesystemAdapter, FileEntry } from '@nocturnium/svelte-ide';

const memoryAdapter: FilesystemAdapter = {
	async readFile(path): Promise<FileEntry> {
		/* ... */
		return {
			path,
			name: path.split('/').pop()!,
			content: '',
			language: 'plaintext',
			size: 0,
			lineCount: 0
		};
	},
	async readDirectory(path) {
		return [];
	},
	async exists(path) {
		return true;
	},
	async stat(path) {
		/* ... */ throw new Error('not implemented');
	},
	async writeFile(path, content) {},
	async createDirectory(path) {},
	async delete(path) {},
	async rename(oldPath, newPath) {},
	async copy(source, destination) {},
	async search(query, options) {
		return [];
	}
	// watch is optional
};
```

For a concrete networked backend, see the VFS client in [API: Services](./services.md) and the [VFS types](#vfs--virtual-filesystem-backend) below.

---

## `ai` — assistant messages, tools, and sessions

Types behind the `<AIPanel>` component and the `ai` store. The panel talks to your own chat endpoint — these types describe what flows in and out.

- **`AIRole`** — `'user' | 'assistant' | 'system' | 'tool'`.
- **`AIMessage`** — a single turn: `id`, `role`, `content`, `timestamp`, optional `toolCalls`/`toolResult`, an `isStreaming` flag, an `error`, and `metadata` (`AIMessageMetadata`: model, tokens used, latency, finish reason).
- **`AIToolCall`** / **`AIToolResult`** — function-call request/response pairs.
- **`AITool`** — a registerable tool: `name`, `description`, JSON-Schema-shaped `parameters` (`AIToolParameters` / `AIToolProperty`), and an async `handler` (`AIToolHandler`).
- **`AIContext`** — what the assistant sees: `openFiles`, the current `selection`, `workspace` metadata, and a `custom` bag for plugins.
- **`AIConversation`** — an `AIMessage[]` with title, timestamps, and attached `context`.
- **`AIPanelConfig`** — wiring for the panel: `endpoint`, `model`, `systemPrompt`, `tools`, `maxTokens`, `temperature`, `streaming`, and custom `headers`.
- **`AISuggestion`** — an inline hint (`type: 'completion' | 'refactor' | 'fix' | 'explain'`) with an optional `range` and `confidence`.
- **`AIEditSession`** — a collaborative-edit session over one file, tracking `status`, `originalContent`, and `proposedContent`/`diff`.

```ts
import type { AITool } from '@nocturnium/svelte-ide';

const readFileTool: AITool = {
	name: 'read_file',
	description: 'Read the contents of a file by path',
	parameters: {
		type: 'object',
		properties: { path: { type: 'string', description: 'Absolute file path' } },
		required: ['path']
	},
	handler: async (args, context) => {
		const path = args.path as string;
		return { path, workspace: context.workspace?.name };
	}
};
```

See the [AI and agents guide](../guides/ai-and-agents.md) for the full panel walkthrough.

---

## `events` — the IDE event bus

A typed pub/sub layer for IDE-wide coordination.

- **`IDEEvent<T>`** — `{ type, payload, timestamp, source? }`.
- **`IDEEventType`** — a string-union of every event name, grouped by domain: `file:*`, `editor:*`, `tab:*`, `search:*`, `command:*`, `panel:*`, `layout:*`, `ai:*`, `collab:*`, and `plugin:*`.
- **`EventBus`** — `emit`, `on`, `once`, `off`, with `on`/`once` returning an unsubscribe function.
- **`IDEAction`** / **`IDECommand`** — command descriptors (`id`, `label`, optional `keybinding`, `when`, `handler`); `IDECommand` adds a `category`.
- **`IDEKeybinding`** — `{ keys, command, when?, args? }`.
- **Payload interfaces** — strongly-typed payloads per event family, e.g. `FileOpenPayload`, `FileSavePayload`, `EditorChangePayload`, `EditorCursorPayload`, `CommandExecutePayload`, `AIMessagePayload`, `CollabCursorPayload`.

```ts
import type { EventBus, EditorCursorPayload } from '@nocturnium/svelte-ide';

function trackCursor(bus: EventBus) {
	return bus.on<EditorCursorPayload>('editor:cursor', (event) => {
		const { path, line, column } = event.payload;
		console.log(`${path} @ ${line}:${column}`);
	});
}
```

---

## `plugin` — proposal-based plugin lifecycle

The plugin types model a governed lifecycle (`draft → submitted → reviewing → approved → testing → deploying → deployed`, with `rejected`/`rolled_back` branches). The library is bring-your-own-backend; these types describe what a plugin host exchanges with the UI.

- **`PluginStatus`** / **`PluginCategory`** / **`PluginPermission`** — the lifecycle states, functional categories (`file_ops`, `http`, `analysis`, `ui`, `editor`, `ai`, …), and capability grants (`filesystem:read`, `network:fetch`, `editor:write`, …).
- **`PluginProposal`** — the central record: identity, `parameters` (JSON-Schema-shaped `PluginParameters`/`PluginParameterProperty`), `implementation`, `testCases`, review `votes`, `issues`, optional `metrics`, and `rolloutState`.
- **`PluginImplementation`** — `type: 'component' | 'module' | 'action' | 'provider'`, plus `componentPath`/`moduleCode`/`entryPoint`, `dependencies`, and required `permissions`.
- **`PluginVote`** / **`PluginIssue`** / **`PluginTestCase`** / **`PluginTestResult`** — the review and validation artifacts.
- **`PluginMetrics`** / **`PluginRolloutState`** — deployment health (success rate, p50/p95/p99 latency) and gradual rollout percentages.
- **`PluginEvent`** / **`PluginEventType`** — SSE-stream events (`created`, `vote_cast`, `consensus`, `deployed`, `rolled_back`, …).
- **`PluginManifest`** / **`PluginInstance`** — registration shape and a live runtime instance (`status`, `exports`, `dispose`).
- **`PluginContributions`** — UI contribution points: `commands`, `menus`, `keybindings`, `panels`, `statusBarItems`, `decorations`, `iconThemes`.

```ts
import type { PluginProposal } from '@nocturnium/svelte-ide';

function isDeployable(p: PluginProposal): boolean {
	return p.status === 'approved' && p.testCases.length > 0;
}
```

See the [Plugins guide](../guides/plugins.md) for the host-integration flow.

---

## `crdt` — collaborative editing

Types for the optional Yjs-backed collaboration layer. The collab server URL is always caller-supplied. These types are also surfaced from the `@nocturnium/svelte-ide/crdt` entry point; the bare type definitions live here.

- **`CollaborationConfig`** — `serverUrl`, `roomId`, the current `user`, optional `awareness`, and `reconnect` tuning.
- **`CollaborationUser`** — `id`, `name`, `color`, optional `isAI` and `avatar`.
- **`CollaborationState`** — connection `status` (`'connecting' | 'connected' | 'disconnected' | 'error'`), connected `users`, `synced`, and `pendingChanges`.
- **`CollaboratorCursor`** / **`CollaboratorAwareness`** / **`PresenceState`** — remote cursor positions, per-user awareness (cursor, selection, viewing/editing file, active/idle/away), and the keyed presence map.
- **`DocumentOperation`** / **`DocumentSnapshot`** — CRDT operations (insert/delete/retain) and point-in-time snapshots.
- **`AICollaborationSession`** / **`AIProposedChange`** — an AI participant proposing reviewable changes.
- **`ConflictResolution`** — `'last_write_wins' | 'first_write_wins' | 'manual' | 'ai_assisted'`.
- **`UndoManager`** / **`UndoItem`** — undo/redo stack state.
- **`CollaborationEvent`** / **`CollaborationEventHandler`** — a discriminated union of every collaboration event (`connected`, `user_joined`, `cursor_moved`, `document_changed`, `conflict`, `ai_edit_proposed`, …).
- **`YjsDocumentOptions`** — `documentId`, optional `initialContent`, undo-manager toggles, and IndexedDB `persistence`.

```ts
import type { CollaborationConfig } from '@nocturnium/svelte-ide';

const config: CollaborationConfig = {
	serverUrl: 'wss://collab.example.com',
	roomId: 'doc-42',
	user: { id: 'u1', name: 'Ada', color: '#7c3aed' },
	awareness: true
};
```

See the [Collaboration guide](../guides/collaboration.md).

---

## `agents` — multi-agent presence & coordination

Types for visualizing and coordinating multiple AI/human agents in a workspace.

- **`Agent`** — `id`, `name`, `type` (`AgentType`: `'coder' | 'reviewer' | 'tester' | 'architect' | 'coordinator'`), `status` (`AgentStatus`: `'online' | 'offline' | 'busy' | 'error' | 'stalled'`), `capabilities` (`AgentCapability[]`), `workspaceId`, `joinedAt`/`lastActivity` timestamps, an optional `currentTask`, and presentation hints (`avatar`, `color`).
- **`AgentTask`** / **`AgentProgress`** — what an agent is doing and how far along (`phase`, `percentage`, `tokensUsed`, `toolCalls`, `filesModified`).
- **`TeamEvent`** — a discriminated union of coordination events (`WorkStartedEvent`, `FileModifiedEvent`, `AgentJoinedEvent`, `AgentLeftEvent`, `AgentBlockedEvent`, `AgentConflictEvent`, `TaskCompletedEvent`, `ProgressUpdateEvent`), all extending `BaseTeamEvent`.
- **`AgentActivity`** / **`ActivityMetadata`** — activity-feed entries (`type`: message/action/error/milestone/system; `ActivitySeverity`).
- **`AgentCursor`** / **`CursorSelection`** — agent cursor positions (reusing `CursorPosition` from the editor module) for real-time presence.
- **`AgentFilter`** / **`AgentViewMode`** / **`AgentFilterOptions`** — filtering and view-mode helpers for presence UIs.

```ts
import type { Agent } from '@nocturnium/svelte-ide';

const reviewer: Agent = {
	id: 'agent-2',
	name: 'Reviewer',
	type: 'reviewer',
	status: 'busy',
	capabilities: ['code_review', 'testing'],
	workspaceId: 'ws-1',
	joinedAt: new Date().toISOString(),
	lastActivity: new Date().toISOString()
};
```

See the [AI and agents guide](../guides/ai-and-agents.md).

---

## `vfs` — virtual filesystem backend

Types for the networked virtual filesystem backend the VFS service and components talk to (locking, transactions, and SSE). The matching components (`LockIndicator`, `LockConflictDialog`, `LockOverlay`, `VersionConflictDialog`) are listed in [API: Components](./components.md), and the client is in [API: Services](./services.md).

- **`VFSFileInfo`** / **`VFSFile`** / **`VFSDirectory`** — file metadata (including a `version` for conflict detection and an optional `checksum`), file content (text or `ArrayBuffer`), and directory listings.
- **`VFSWorkspace`** / **`VFSWorkspaceSettings`** — workspace identity and per-workspace settings (theme, auto-save, exclusion globs).
- **`VFSTransaction`** / **`VFSOperation`** / **`VFSTransactionResult`** — atomic multi-op transactions; `VFSOperation` is a discriminated union (`create`, `update`, `delete`, `rename`, `mkdir`) carrying version numbers for optimistic concurrency.
- **`VFSFileLock`** / **`VFSLockStatus`** / **`VFSLockAcquisitionOptions`** — advisory file locks (holder, TTL, refresh count, purpose) and the lock-status state machine.
- **`VFSEvent`** — a union of SSE events: `VFSSnapshotEvent`, `VFSUpdateEvent`, `VFSPingEvent`, `VFSCompleteEvent`, `VFSErrorEvent`, plus agent-workflow events (`VFSIterationCompletedEvent`, `VFSChangeClassifiedEvent`, `VFSGateProgressEvent`, `VFSLockAcquiredEvent`, `VFSLockReleasedEvent`). All extend `VFSBaseEvent`.
- **`VFSConnectionState`** / **`VFSClientConfig`** — connection status and client wiring (`baseUrl`, `defaultWorkspaceId`, `timeout`, `lockTTL`, `maxReconnectAttempts`).
- **`VFSError`** (a runtime `class`) / **`VFSErrorCode`** — a typed error carrying a `code` such as `'FILE_LOCKED'`, `'VERSION_CONFLICT'`, or `'FILE_NOT_FOUND'`. Because it is a real class, you can `instanceof`-check it.

```ts
import type { VFSEvent } from '@nocturnium/svelte-ide';

function onEvent(event: VFSEvent) {
	switch (event.type) {
		case 'lock_acquired':
			// event is narrowed to VFSLockAcquiredEvent; its `lock` is a VFSFileLock
			console.log('locked', event.lock.path, 'by', event.lock.holder);
			break;
		case 'lock_released':
			console.log('released', event.path, 'held by', event.holder);
			break;
		// Note: version conflicts are NOT an SSE event type — they surface as a
		// thrown VFSError with code "VERSION_CONFLICT". Handle them at the call site.
	}
}
```

---

## `lsp` — Language Server Protocol types

The LSP module is a TypeScript port of the LSP 3.17 specification, consumed by `createLSPClient`/`LSPClient` and `<LSPEditor>`. It is the largest type module and covers the full request/response surface. Highlights:

- **Basic shapes** — `Position` (0-indexed line/character), `Range`, `Location`, `TextEdit`, `TextDocumentEdit`, `WorkspaceEdit`, `MarkupContent`.
- **Diagnostics** — `Diagnostic`, `DiagnosticSeverity` (enum: `Error`/`Warning`/`Information`/`Hint`), `DiagnosticTag`, `DiagnosticRelatedInformation`, `PublishDiagnosticsParams`.
- **Completion** — `CompletionItem`, `CompletionItemKind` (enum), `CompletionList`, `CompletionParams`, `InsertTextFormat`, `CompletionTriggerKind`.
- **Hover & signatures** — `Hover`, `HoverParams`, `SignatureHelp`, `SignatureInformation`, `ParameterInformation`.
- **Navigation & edits** — `DefinitionParams`, `ReferenceParams`, `CodeAction`, `CodeActionKind`, `RenameParams`, `DocumentFormattingParams`, `FormattingOptions`, `Command`.
- **Server / client capabilities** — `ServerCapabilities`, `TextDocumentSyncKind` (enum), `CompletionOptions`, `InitializeParams`, `InitializeResult`, `ClientCapabilities`.
- **Transport** — `JSONRPCRequest`, `JSONRPCResponse`, `JSONRPCNotification`, `JSONRPCError`, `JSONRPCErrorCode` (enum).
- **Client wiring** — `LSPClientConfig` (`serverUrl`, `rootUri`, `autoReconnect`/`reconnectDelay`/`maxReconnectAttempts`/`requestTimeout`, `debug`), `LSPConnectionState` (`'disconnected' | 'connecting' | 'connected' | 'initializing' | 'ready' | 'error'`), and `LSPClientEvents` (the `onConnectionStateChange`/`onDiagnostics`/`onError`/`onServerCapabilities` callbacks).

Note that several LSP exports are runtime `enum`s (`DiagnosticSeverity`, `CompletionItemKind`, `TextDocumentSyncKind`, `JSONRPCErrorCode`, …), so they exist as values you can reference, not just types.

```ts
import { DiagnosticSeverity } from '@nocturnium/svelte-ide';
import type { Diagnostic } from '@nocturnium/svelte-ide';

function isBlocking(d: Diagnostic): boolean {
	return d.severity === DiagnosticSeverity.Error;
}
```

For the client API and the backend bridge, see the [LSP guide](../guides/lsp.md) and the low-level [LSP integration doc](../LSP_INTEGRATION.md).

### Stable vs. experimental LSP types

Within the LSP module, a small set is annotated `@public` in the root barrel — i.e. part of the stable API and least likely to change:

- **`Diagnostic`**
- **`LSPClient`** (the client class, exported from the LSP service — `createLSPClient`/`LSPClient` — alongside these types)
- **`LSPConnectionState`**
- **`ServerCapabilities`**

Every other LSP type, and every other type module on this page, is tagged `@experimental` and may change in future minor versions. If you need long-term stability, build on the four stable LSP types above and keep your own adapters around the rest.

---

## Utilities

The utility functions are exported from `@nocturnium/svelte-ide/utils` (and the root). They are split into three files: language detection, formatting, and keybindings. All are pure, dependency-free helpers.

### Language utilities

Map filenames to languages and look up display metadata. Backs the editor's syntax highlighting and file-icon logic.

```ts
function detectLanguage(filename: string): string;
function getExtension(filename: string): string;
function getLanguageMimeType(language: string): string;
function isLanguageSupported(language: string): boolean;
function getLanguageDisplayName(language: string): string;
function getLanguageIcon(language: string): string;
```

- **`detectLanguage(filename)`** — resolves a language id from a filename. Checks exact special-cased names first (`Dockerfile`, `Makefile`, `.gitignore`, `.env`, etc.), then the extension (`ts → typescript`, `py → python`, `svelte → svelte`, …), and falls back to `'plaintext'`.
- **`getExtension(filename)`** — the lowercase extension without the dot (`''` if none).
- **`getLanguageMimeType(language)`** — a MIME type for a language id (defaults to `'text/plain'`).
- **`isLanguageSupported(language)`** — `true` for languages with first-class tokenizer support (javascript, typescript, jsx, tsx, html, xml, css, json, python, go, markdown, svelte, plaintext).
- **`getLanguageDisplayName(language)`** — a human-friendly label (`'typescript' → 'TypeScript'`, `'svelte' → 'Svelte'`); unknown ids are title-cased.
- **`getLanguageIcon(language)`** — an icon identifier (e.g. `'file-ts'`) for mapping to your own icon set; defaults to `'file'`.

```ts
import {
	detectLanguage,
	getLanguageDisplayName,
	isLanguageSupported
} from '@nocturnium/svelte-ide/utils';

detectLanguage('src/App.svelte'); // "svelte"
detectLanguage('Dockerfile'); // "dockerfile"
detectLanguage('notes.txt'); // "plaintext"
getLanguageDisplayName('svelte'); // "Svelte"
isLanguageSupported('python'); // true
```

See the [Syntax-highlighting guide](../guides/syntax-highlighting.md) for the full language list.

### Formatting utilities

Small, display-oriented formatters for sizes, dates, durations, positions, paths, and text.

```ts
function formatFileSize(bytes: number): string;
function formatRelativeTime(date: Date): string;
function formatDate(date: Date): string;
function formatDateTime(date: Date): string;
function formatDuration(ms: number): string;
function formatPosition(line: number, column: number): string;
function formatPath(path: string, maxLength?: number): string;
function formatNumber(num: number): string;
function formatPercent(value: number, decimals?: number): string;
function pluralize(count: number, singular: string, plural?: string): string;
function truncate(text: string, maxLength: number): string;
function camelToTitle(text: string): string;
function snakeToTitle(text: string): string;
```

- **`formatFileSize(bytes)`** — `1536 → "1.5 KB"`, `0 → "0 B"`.
- **`formatRelativeTime(date)`** — `"just now"`, `"5m ago"`, `"3h ago"`, `"2d ago"`, or a locale date beyond a week.
- **`formatDate(date)`** / **`formatDateTime(date)`** — locale-aware short date and date+time.
- **`formatDuration(ms)`** — `850 → "850ms"`, `1500 → "1.5s"`, `90000 → "1m 30s"`, `3700000 → "1h 1m"`.
- **`formatPosition(line, column)`** — `formatPosition(12, 4) → "Ln 12, Col 4"`.
- **`formatPath(path, maxLength = 50)`** — middle-truncates long paths (`"first/.../last"`).
- **`formatNumber(num)`** — thousands separators via `toLocaleString()`.
- **`formatPercent(value, decimals = 0)`** — `0.873 → "87%"` (value is a 0–1 fraction).
- **`pluralize(count, singular, plural?)`** — `pluralize(1, "file") → "1 file"`, `pluralize(3, "file") → "3 files"`.
- **`truncate(text, maxLength)`** — ellipsis-truncate to a max length.
- **`camelToTitle(text)`** / **`snakeToTitle(text)`** — `"toggleComment" → "Toggle Comment"`, `"save_all" → "Save All"`.

```ts
import { formatFileSize, formatDuration, pluralize } from '@nocturnium/svelte-ide/utils';

formatFileSize(2_500_000); // "2.4 MB"
formatDuration(95_000); // "1m 35s"
pluralize(0, 'error'); // "0 errors"
```

### Keybinding utilities

Cross-platform keyboard-shortcut handling. Bindings are arrays of key tokens; the special token `'mod'` maps to ⌘ on macOS and Ctrl elsewhere.

```ts
interface Keybinding {
	keys: string[];
	command: string;
	when?: string;
	label?: string;
}

function isMac(): boolean;
function getModKey(): string;
function formatKeybinding(keys: string[]): string;
function matchesKeybinding(event: KeyboardEvent, keys: string[]): boolean;
function createKeybindingHandler(
	bindings: Keybinding[],
	executeCommand: (command: string) => void
): (event: KeyboardEvent) => void;

const defaultKeybindings: Keybinding[];
```

- **`Keybinding`** — a single shortcut: a `keys` token array, the `command` to run, an optional `when` clause, and a display `label`.
- **`isMac()`** — `true` on macOS (safe to call without a browser; returns `false` when `navigator` is undefined).
- **`getModKey()`** — `"Cmd"` on macOS, `"Ctrl"` elsewhere.
- **`formatKeybinding(keys)`** — a display string: `["mod", "s"] → "⌘S"` on macOS, `"Ctrl+S"` elsewhere. Translates `enter`, `escape`, `tab`, arrows, etc. to symbols.
- **`matchesKeybinding(event, keys)`** — `true` if a `KeyboardEvent` exactly matches a binding (modifiers and main key, rejecting extra modifiers).
- **`createKeybindingHandler(bindings, executeCommand)`** — builds a `keydown` handler that matches against your bindings, calls `preventDefault`/`stopPropagation` on a hit, and invokes `executeCommand(command)`.
- **`defaultKeybindings`** — a ready-made `Keybinding[]` covering common IDE actions (save, quick-open, command palette, find/replace, toggle comment, multi-cursor, AI panel, and more) — a real runtime value you can use as-is or spread and extend.

```svelte
<script lang="ts">
	import {
		createKeybindingHandler,
		defaultKeybindings,
		formatKeybinding
	} from '@nocturnium/svelte-ide/utils';

	function run(command: string) {
		console.log('execute', command);
	}

	const onKeydown = createKeybindingHandler(defaultKeybindings, run);

	// Show the platform-correct hint for Save
	const saveHint = formatKeybinding(['mod', 's']); // "⌘S" or "Ctrl+S"
</script>

<svelte:window on:keydown={onKeydown} />
<span>Save ({saveHint})</span>
```

---

## See also

- [Getting started](../getting-started.md) — install, theme, first editor.
- [Architecture](../architecture.md) — how these modules fit together.
- [API: Components](./components.md) · [API: Stores](./stores.md) · [API: Services](./services.md) — the consumers of these types.
- [Editor](../guides/editor.md) · [Syntax highlighting](../guides/syntax-highlighting.md) · [Multi-cursor](../guides/multi-cursor.md) — feature guides.
- [LSP](../guides/lsp.md) · [Collaboration](../guides/collaboration.md) · [AI and agents](../guides/ai-and-agents.md) · [Plugins](../guides/plugins.md) — integration guides.
