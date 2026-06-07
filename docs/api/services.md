# API: Services

Services are the plain-TypeScript layer that talks to your backends — the virtual filesystem, the language server, and the cross-store glue that wires it all together — plus a pair of pure utility services (error handling and optimistic updates) that have no network of their own. Every service is zero-dependency and framework-agnostic: it ships as ordinary functions and classes you can call from a Svelte component, a store, or even a plain Node script. The four namespaced services (`vfsClient`, `ideIntegration`, `errorHandling`, `optimistic`) are exported as `import * as` namespaces from the package root, while the LSP client is exported as named symbols. All HTTP/WebSocket endpoints default to a same-origin path and are configurable — the library never bakes in a host. Each service is detailed below; for deeper, task-oriented walkthroughs see the [LSP](../guides/lsp.md), [collaboration](../guides/collaboration.md), and [plugins](../guides/plugins.md) guides.

> Every service export is re-exported from the package root (`@nocturnium/svelte-ide`). Import paths below use the published package; never use `$lib`.

---

## `vfsClient`

A namespaced HTTP client for a virtual-filesystem (VFS) backend. It is a module of standalone async functions — there is no class to instantiate; a single module-level config object is shared across all calls.

**Source:** `src/lib/services/vfs-client.ts`

**Default endpoint:** `/api/vfs` (same-origin). Configurable via `vfsClient.configure({ baseUrl })`.

```ts
import { vfsClient } from '@nocturnium/svelte-ide';

// Point the client at your backend (defaults to '/api/vfs')
vfsClient.configure({
  baseUrl: '/api/vfs',
  timeout: 30000,   // request timeout in ms (default 30s)
  lockTTL: 300000   // default lock time-to-live in ms (default 5min)
});

// Read and write files within a workspace
const file = await vfsClient.readFile('workspace-1', '/src/main.ts');
await vfsClient.writeFile('workspace-1', '/src/main.ts', updatedSource, file.info.version);
```

Each request is sent as JSON over `fetch`, guarded by an `AbortController` timeout. Non-2xx responses are thrown as a `VFSError` whose `code` is mapped from the HTTP status (404 → `FILE_NOT_FOUND`, 403 → `PERMISSION_DENIED`, 409 → `VERSION_CONFLICT`, 423 → `FILE_LOCKED`, otherwise `NETWORK_ERROR`).

### Configuration

| Function | Signature | Notes |
| --- | --- | --- |
| `configure` | `(config: Partial<VFSClientConfig>) => void` | Merges into the shared config. Fields: `baseUrl`, `timeout`, `lockTTL`, `maxReconnectAttempts`, `defaultWorkspaceId`. |
| `getConfig` | `() => VFSClientConfig` | Returns a copy of the current config. |

### Workspace operations

| Function | Signature |
| --- | --- |
| `getWorkspace` | `(workspaceId: string) => Promise<VFSWorkspace>` |
| `updateWorkspace` | `(workspaceId: string, updates: Partial<VFSWorkspace>) => Promise<VFSWorkspace>` |
| `listWorkspaces` | `() => Promise<VFSWorkspace[]>` |

### File operations

| Function | Signature |
| --- | --- |
| `readFile` | `(workspaceId: string, path: string) => Promise<VFSFile>` |
| `writeFile` | `(workspaceId: string, path: string, content: string, version?: number) => Promise<VFSFileInfo>` |
| `deleteFile` | `(workspaceId: string, path: string, version?: number) => Promise<void>` |
| `renameFile` | `(workspaceId: string, oldPath: string, newPath: string, version?: number) => Promise<VFSFileInfo>` |
| `getFileInfo` | `(workspaceId: string, path: string) => Promise<VFSFileInfo>` |
| `copyFile` | `(workspaceId: string, sourcePath: string, destPath: string) => Promise<VFSFileInfo>` |

### Directory operations

| Function | Signature |
| --- | --- |
| `readDirectory` | `(workspaceId: string, path: string) => Promise<VFSDirectory>` |
| `createDirectory` | `(workspaceId: string, path: string) => Promise<VFSFileInfo>` |
| `deleteDirectory` | `(workspaceId: string, path: string, recursive?: boolean) => Promise<void>` |

### Quick (auto-transaction) operations

These hit the `/quick/files` route and wrap a single write/delete in a server-side transaction for you.

| Function | Signature |
| --- | --- |
| `quickWriteFile` | `(workspaceId: string, path: string, content: string) => Promise<VFSFileInfo>` |
| `quickDeleteFile` | `(workspaceId: string, path: string) => Promise<void>` |

### Transactions

Group multiple operations atomically. `executeTransaction` is the convenience wrapper: it begins a transaction, commits the operations, and rolls back automatically if the commit throws.

| Function | Signature |
| --- | --- |
| `beginTransaction` | `(workspaceId: string) => Promise<string>` — returns a transaction id |
| `commitTransaction` | `(transactionId: string, operations: VFSOperation[]) => Promise<VFSTransactionResult>` |
| `rollbackTransaction` | `(transactionId: string) => Promise<void>` |
| `getTransaction` | `(transactionId: string) => Promise<VFSTransaction>` |
| `executeTransaction` | `(workspaceId: string, operations: VFSOperation[]) => Promise<VFSTransactionResult>` — begin + commit, auto-rollback on failure |

### Locks

Advisory locks coordinate concurrent edits. `acquireLock` retries while the file is `FILE_LOCKED` (up to `maxRetries`, default 30, spaced by `retryDelay`, default 100 ms); see [collaboration](../guides/collaboration.md) for how the lock UI components consume these.

| Function | Signature |
| --- | --- |
| `acquireLock` | `(workspaceId: string, path: string, holder: string, options?: VFSLockAcquisitionOptions) => Promise<VFSFileLock>` |
| `releaseLock` | `(workspaceId: string, path: string, holder: string) => Promise<void>` |
| `refreshLock` | `(workspaceId: string, path: string, holder: string) => Promise<VFSFileLock>` |
| `getLockInfo` | `(workspaceId: string, path: string) => Promise<VFSFileLock \| null>` — returns `null` when no lock exists |
| `listLocks` | `(workspaceId: string) => Promise<VFSFileLock[]>` |
| `forceReleaseLock` | `(workspaceId: string, path: string, adminId: string) => Promise<void>` |

`VFSLockAcquisitionOptions` accepts `{ ttl, maxRetries, retryDelay, purpose }`.

### Convenience helpers

| Function | Signature | Notes |
| --- | --- | --- |
| `withLock` | `<T>(workspaceId, path, holder, fn: () => Promise<T>, options?) => Promise<T>` | Acquires a lock, runs `fn`, always releases. |
| `batchUpdate` | `(workspaceId, holder, updates: Array<{ path; content; version? }>) => Promise<VFSTransactionResult>` | Locks every path, runs one transaction, releases all locks. |
| `readFileWithVersion` | `(workspaceId, path) => Promise<{ content: string; version: number }>` | |
| `safeWriteFile` | `(workspaceId, path, content, expectedVersion) => Promise<VFSFileInfo>` | Write with optimistic version check. |

### Search & health

| Function | Signature | Endpoint |
| --- | --- | --- |
| `searchFiles` | `(workspaceId: string, options: VFSSearchOptions) => Promise<VFSSearchResult[]>` | `POST /search` |
| `healthCheck` | `() => Promise<{ status: 'ok' \| 'error'; latency: number }>` | `GET /health` |

`VFSSearchOptions` and `VFSSearchResult` are exported from this module:

```ts
interface VFSSearchOptions {
  pattern: string;
  caseSensitive?: boolean;
  regex?: boolean;
  includeHidden?: boolean;
  maxResults?: number;
  filePatterns?: string[];
}

interface VFSSearchResult {
  path: string;
  line: number;
  column: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}
```

> **Note** — `VFSError` thrown by this client carries a `.code` (a `VFSErrorCode`) you can branch on. The separate [`errorHandling`](#errorhandling) service offers a richer, user-facing error model with recovery options. The VFS components (`LockIndicator`, `LockConflictDialog`, `VersionConflictDialog`) are documented in [API: Components](./components.md).

---

## `ideIntegration`

A stateful coordination service that connects the VFS, agents, and collaboration stores into one system and routes events between them. Unlike `vfsClient`, this service holds a single internal session — call `initialize` once, then `cleanup` when you tear the IDE down.

**Source:** `src/lib/services/ide-integration.ts`

**Default endpoint:** none of its own; it reuses the VFS client and collaboration store. The collaboration server URL defaults to `/api/collab`, supplied through `config.vfsEndpoint`.

```ts
import { ideIntegration } from '@nocturnium/svelte-ide';

ideIntegration.initialize({
  workspaceId: 'workspace-1',
  userId: 'user-42',
  userName: 'Ada',
  vfsEndpoint: '/api/collab',     // collaboration server URL (default '/api/collab')
  enableAgentSync: true,
  enableCollaboration: true       // set false to skip the collaboration store
});

// ...later, on unmount
ideIntegration.cleanup();
```

Once initialized, it subscribes to VFS, team (agent), and collaboration events and forwards them across stores — for example, when an agent acquires a VFS lock the corresponding agent is marked `busy`, and when an AI user joins via collaboration it is registered as an agent.

| Function | Signature | Notes |
| --- | --- | --- |
| `initialize` | `(config: IDEIntegrationConfig) => void` | Wires up the stores and event routing. Re-initializing first runs `cleanup`. |
| `cleanup` | `() => void` | Unsubscribes everything and resets the VFS/agents/collaboration stores. |
| `isInitialized` | `() => boolean` | |
| `getContext` | `() => IDEContext \| null` | Current `{ workspaceId, userId, userName, connected, synced }`. |
| `updateAgentCursorPosition` | `(agentId, filePath, position, selection?) => void` | Pushes a cursor into the agents store and, if collaboration is on, mirrors it to the collaboration store. |
| `acquireLockWithContext` | `(filePath: string, purpose?: VFSFileLock['purpose']) => Promise<VFSFileLock \| null>` | Acquires a lock and updates collaboration awareness. |
| `releaseLockWithContext` | `(filePath: string) => Promise<void>` | Releases the lock and clears awareness. |
| `canEditFile` | `(filePath: string) => boolean` | `true` when unlocked, or locked by the current user. |
| `getFileEditors` | `(filePath: string) => Agent[]` | Agents currently working on a file. |
| `getOnlineAgents` | `() => Agent[]` | |
| `getAllLocks` | `() => VFSFileLock[]` | |
| `getFileLock` | `(filePath: string) => VFSFileLock \| undefined` | |

`IDEIntegrationConfig`:

```ts
interface IDEIntegrationConfig {
  workspaceId: string;
  userId: string;
  userName: string;
  vfsEndpoint?: string;        // used as the collaboration serverUrl
  enableAgentSync?: boolean;
  enableCollaboration?: boolean;
}
```

> **Usage note** — `ideIntegration` is the glue layer; the stores it coordinates (VFS, agents, collaboration) are documented in [API: Stores](./stores.md), and the higher-level behavior is covered in [AI & agents](../guides/ai-and-agents.md).

---

## `errorHandling`

A pure (no-network) service for turning raw errors into a structured, user-presentable `VFSError` model — complete with retryability, a human-readable message, and a list of recovery options. It also keeps a small in-memory error log.

**Source:** `src/lib/services/error-handling.ts`

**Default endpoint:** none — this service performs no I/O.

```ts
import { errorHandling } from '@nocturnium/svelte-ide';

try {
  await vfsClient.writeFile(ws, path, content, version);
} catch (raw) {
  const err = errorHandling.parseError(raw, { path, workspaceId: ws });
  console.warn(err.userMessage);            // friendly, end-user copy
  if (err.retryable) { /* schedule a retry */ }
  for (const option of err.recoveryOptions) {
    // render a button per recovery option (retry / force / merge / discard / ...)
  }
}
```

> This `VFSError` is the **structured interface** defined in `error-handling.ts` (`code`, `retryable`, `userMessage`, `recoveryOptions`, ...). It is distinct from the lightweight `VFSError` class thrown by [`vfsClient`](#vfsclient); use `parseError` to normalize either kind into this richer shape.

### Construction & parsing

| Function | Signature | Notes |
| --- | --- | --- |
| `createVFSError` | `(code: VFSErrorCode, message: string, options?: { statusCode?; path?; workspaceId?; cause? }) => VFSError` | Builds a fully-populated structured error. |
| `parseError` | `(error: unknown, context?: { path?; workspaceId? }) => VFSError` | Normalizes any thrown value, `Response`, or status-bearing object into a `VFSError`. |

### Classification

| Function | Signature | Notes |
| --- | --- | --- |
| `isVFSError` | `(error: unknown) => error is VFSError` | Type guard. |
| `isConflictError` | `(error: VFSError) => boolean` | `FILE_LOCKED`, `LOCK_CONFLICT`, or `VERSION_CONFLICT`. |
| `isRecoverableError` | `(error: VFSError) => boolean` | True when `recoveryOptions` is non-empty. |

### Recovery & aggregation

| Function | Signature | Notes |
| --- | --- | --- |
| `executeRecovery` | `(option: RecoveryOption, handlers: Partial<ErrorRecoveryHandler>) => Promise<void>` | Dispatches the chosen option's `action` to your handler (`onRetry`, `onForce`, `onMerge`, `onDiscard`, `onRefresh`, `onWait`, `onCancel`). |
| `aggregateErrors` | `(errors: VFSError[]) => AggregatedErrors` | Buckets a batch into `byCode`, `retryable`, `needsUserAction`, and `fatal`. |

### Logging

| Function | Signature | Notes |
| --- | --- | --- |
| `logError` | `(error: VFSError, level?: ErrorLogLevel, context?: Record<string, unknown>) => void` | Appends to an in-memory ring buffer (capped at 100 entries). |
| `getRecentErrors` | `(limit?: number) => ErrorLogEntry[]` | Default limit 10. |
| `clearErrorLog` | `() => void` | |

A `RecoveryOption` is `{ id, label, description, action, recommended?, dangerous? }`, where `action` is one of `'retry' | 'force' | 'merge' | 'discard' | 'refresh' | 'wait' | 'cancel'`. The `VFSErrorCode` union and full type shapes are exported from this module.

---

## `optimistic`

A pure service for optimistic UI updates with automatic rollback: apply a change locally, attempt to commit it to the server with retries, and revert if every attempt fails. No network of its own — you supply the `commit` function.

**Source:** `src/lib/services/optimistic.ts`

**Default endpoint:** none — the `commit` callback you pass does the I/O.

```ts
import { optimistic, vfsClient } from '@nocturnium/svelte-ide';

const result = await optimistic.optimisticUpdate({
  type: 'file_save',
  payload: { path, content },
  apply: () => updateLocalFile(path, content),       // show the change now
  rollback: () => updateLocalFile(path, previous),   // revert on failure
  commit: () => vfsClient.writeFile(ws, path, content) // persist
});

if (!result.success) {
  console.error('Save failed and was rolled back', result.error);
}
```

`optimisticUpdate` applies immediately; if `apply` throws it bails before committing. Otherwise it retries `commit` up to `maxRetries` (default 3) with linear back-off (`retryDelay * attempt`, default base 1000 ms), and on exhaustion runs `rollback`.

### Core functions

| Function | Signature | Notes |
| --- | --- | --- |
| `optimisticUpdate` | `<T, R>(options: { type; payload: T; apply: () => void; rollback: RollbackFn; commit: () => Promise<R>; config?: OptimisticConfig }) => Promise<OptimisticResult<R>>` | The primary entry point. |
| `createOptimisticState` | `<T>(initialValue: T) => { readonly value: T; readonly isPending: boolean; readonly confirmedValue: T; update(newValue, commit, config?): Promise<OptimisticResult<T>>; confirm(value: T): void; reset(): void }` | Returns an inline state-container object (no named type exported). |
| `batchOptimisticUpdates` | `<T>(operations: Array<{ type; payload; apply; rollback; commit }>, config?) => Promise<{ success; results; failedCount }>` | Applies all first (rolling back everything if any `apply` fails), then commits each. |
| `createDebouncedOptimistic` | `<T>(commitFn: (value: T) => Promise<T>, delayMs?: number) => { update(value, apply, rollback): Promise<OptimisticResult<T>>; flush(): void; readonly isPending: boolean }` | Returns an inline object (no named type exported). Coalesces rapid updates; default debounce 500 ms. |

### Queue management

The service tracks in-flight operations in a module-level queue.

| Function | Signature |
| --- | --- |
| `getPendingOperations` | `() => OptimisticOperation<unknown>[]` |
| `getOperation` | `(id: string) => OptimisticOperation<unknown> \| undefined` |
| `cancelOperation` | `(id: string) => Promise<boolean>` |
| `cancelAllOperations` | `() => Promise<void>` |

### Conflict detection

| Function | Signature | Notes |
| --- | --- | --- |
| `isConflictError` | `(error: Error) => ConflictInfo \| null` | Heuristic substring match on `error.message`: returns a `version` conflict for `version`/`conflict`/`stale`, a `lock` conflict for `lock`/`locked`, a `concurrent` conflict for `concurrent`/`modified`, else `null`. |
| `parseConflictDetails` | `(error: Error) => { localContent?; serverContent?; baseContent? } \| null` | Attempts to JSON-parse structured conflict payloads. |

`OptimisticConfig` accepts `{ maxRetries, retryDelay, onCommit, onRollback, onRetry }`; `OptimisticResult<T>` is `{ success, data?, error?, operation }`. All interfaces are exported from this module.

---

## LSP client

The Language Server Protocol client speaks JSON-RPC over a WebSocket to any LSP-over-WebSocket bridge — for example the standalone Go `lsp-bridge` server in [`backend/`](../../backend) (defaults to `:8765`). Unlike the four namespaced services above, the LSP client is exported as named symbols (`LSPClient`, `createLSPClient`, and three position helpers), and is part of the **stable** public API.

**Source:** `src/lib/services/lsp-client.ts`

**Default endpoint:** none baked in — `serverUrl` is always caller-supplied (a `ws://` or `wss://` URL). See the [LSP guide](../guides/lsp.md) and [LSP_INTEGRATION.md](../LSP_INTEGRATION.md) for the bridge protocol.

```ts
import { createLSPClient } from '@nocturnium/svelte-ide';

const client = createLSPClient({
  serverUrl: 'ws://localhost:8765',   // your LSP bridge (required)
  rootUri: 'file:///workspace',       // workspace root (required)
  autoReconnect: true,                // default true
  reconnectDelay: 1000,               // ms, default 1000
  maxReconnectAttempts: 5,            // default 5
  requestTimeout: 30000,              // ms, default 30s
  debug: false                        // log all JSON-RPC traffic
});

await client.connect();               // connects + runs the LSP initialize handshake

client.on('onDiagnostics', ({ uri, diagnostics }) => { /* render markers */ });

client.didOpen('file:///workspace/main.ts', 'typescript', 1, sourceText);
const items = await client.completion('file:///workspace/main.ts', { line: 10, character: 4 });
```

For most apps you do not instantiate this directly — drop in the `<LSPEditor>` component (see [API: Components](./components.md)) and it manages a client for you. Use the raw client when you need lower-level control.

### Factory

| Function | Signature |
| --- | --- |
| `createLSPClient` | `(config: LSPClientConfig) => LSPClient` |

`LSPClientConfig` (from the LSP types): `{ serverUrl, rootUri, autoReconnect?, reconnectDelay?, maxReconnectAttempts?, requestTimeout?, debug? }`. `serverUrl` and `rootUri` are required.

### `LSPClient` — connection

| Member | Signature | Notes |
| --- | --- | --- |
| `connect` | `() => Promise<void>` | Opens the socket and performs the `initialize` / `initialized` handshake. |
| `disconnect` | `() => Promise<void>` | Sends `shutdown`/`exit` (when ready) and closes the socket. |
| `state` *(getter)* | `LSPConnectionState` | `'disconnected' \| 'connecting' \| 'connected' \| 'initializing' \| 'ready' \| 'error'`. |
| `isReady` *(getter)* | `boolean` | True when `state === 'ready'`. |
| `capabilities` *(getter)* | `ServerCapabilities \| null` | Negotiated server capabilities. |
| `on` | `<K extends keyof LSPClientEvents>(event: K, handler) => () => void` | Subscribe; returns an unsubscribe. Events: `onConnectionStateChange`, `onDiagnostics`, `onError`, `onServerCapabilities`. |
| `onNotification` | `(method: string, handler: (params: unknown) => void) => () => void` | Low-level raw notification hook. |

The client auto-reconnects on unexpected close (when `autoReconnect` is set), with the delay scaling per attempt up to `maxReconnectAttempts`.

### `LSPClient` — document sync

| Method | Signature |
| --- | --- |
| `didOpen` | `(uri: string, languageId: string, version: number, text: string) => void` |
| `didChange` | `(uri: string, version: number, changes: TextDocumentContentChangeEvent[]) => void` |
| `didSave` | `(uri: string, text?: string) => void` |
| `didClose` | `(uri: string) => void` |

### `LSPClient` — language features

Each feature first checks the negotiated `ServerCapabilities` and resolves to an empty/`null` result if the server does not advertise support.

| Method | Signature |
| --- | --- |
| `completion` | `(uri, position, triggerKind?, triggerCharacter?) => Promise<CompletionItem[]>` |
| `completionResolve` | `(item: CompletionItem) => Promise<CompletionItem>` |
| `hover` | `(uri, position) => Promise<Hover \| null>` |
| `signatureHelp` | `(uri, position, triggerCharacter?) => Promise<SignatureHelp \| null>` |
| `definition` | `(uri, position) => Promise<Location[]>` |
| `typeDefinition` | `(uri, position) => Promise<Location[]>` |
| `references` | `(uri, position, includeDeclaration?) => Promise<Location[]>` |
| `codeAction` | `(uri, range, diagnostics?) => Promise<CodeAction[]>` |
| `prepareRename` | `(uri, position) => Promise<Range \| { range; placeholder } \| null>` |
| `rename` | `(uri, position, newName) => Promise<WorkspaceEdit \| null>` |
| `formatting` | `(uri, options?) => Promise<TextEdit[]>` |

### `LSPClient` — diagnostics & capability helpers

| Method | Signature | Notes |
| --- | --- | --- |
| `getDiagnostics` | `(uri: string) => Diagnostic[]` | Cached diagnostics for one document. |
| `getAllDiagnostics` | `() => Map<string, Diagnostic[]>` | All cached diagnostics. |
| `getCompletionTriggerCharacters` | `() => string[]` | From server capabilities. |
| `getSignatureHelpTriggerCharacters` | `() => string[]` | From server capabilities. |
| `supportsFeature` | `(feature: keyof ServerCapabilities) => boolean` | |

### Position helpers

Pure functions for converting between LSP `Position`/`Range` (line + character) and string offsets — handy when applying `TextEdit`s to in-memory content.

```ts
import { positionToOffset, offsetToPosition, rangeToOffsets } from '@nocturnium/svelte-ide';

const offset = positionToOffset(content, { line: 3, character: 2 });
const pos = offsetToPosition(content, offset);
const { start, end } = rangeToOffsets(content, edit.range);
```

| Function | Signature |
| --- | --- |
| `positionToOffset` | `(content: string, position: Position) => number` |
| `offsetToPosition` | `(content: string, offset: number) => Position` |
| `rangeToOffsets` | `(content: string, range: Range) => { start: number; end: number }` |

---

## See also

- [API: Components](./components.md) — `LSPEditor`, the VFS lock dialogs, and other UI that consume these services
- [API: Stores](./stores.md) — the VFS, agents, and collaboration stores that `ideIntegration` coordinates
- [API: Types & Utils](./types-and-utils.md) — `VFSError`, `Position`, `Range`, `Diagnostic`, and related types
- [Guide: LSP](../guides/lsp.md) and [LSP_INTEGRATION.md](../LSP_INTEGRATION.md) — the LSP client, `<LSPEditor>`, and the backend bridge
- [Guide: Collaboration](../guides/collaboration.md) — CRDT collaboration that pairs with VFS locks
- [Guide: AI & agents](../guides/ai-and-agents.md) — the agent presence layer wired up by `ideIntegration`
- [Architecture](../architecture.md) — where the service layer sits in the system
