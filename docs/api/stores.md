# API: Stores

`@nocturnium/svelte-ide` ships seven rune-based state stores — **layout**, **editor**, **ai**, **plugin**, **collaboration**, **vfs**, and **agents** — that back the IDE components but are also usable directly. Each store is a plain ES module that holds its state in a single Svelte 5 `$state` rune and exposes that state through exported reactive **accessors** plus **action functions** that mutate it. There is no class to instantiate and no provider to wrap your app in: importing a binding and using it reads or writes a process-wide singleton. Only the **layout** store is part of the stable `@public` surface; every other store is marked `@experimental` and its signatures may change before 1.0. Everything documented here is exported from the package entry point `@nocturnium/svelte-ide/stores` (and re-exported from the root `@nocturnium/svelte-ide`).

> Reading the source: every store lives in `src/lib/stores/*.svelte.ts`, and the namespaced re-exports (including all the `as`-renamed names below) are assembled in `src/lib/stores/index.ts`. **The barrel in `index.ts` is the published surface** — a binding only exists at the package boundary if `index.ts` re-exports it, even when the store module itself defines more.

---

## Two ways state is exposed: `.current` accessors and `get*()` functions

Svelte 5 modules **cannot directly export `$derived` (or `$state`) values**. A `$derived` rune only stays reactive while it is read inside a reactive context (a component, an `$effect`, or another rune) in the module where it was declared — re-exporting the value itself snapshots it and breaks reactivity across the module boundary. Each store works around this in two complementary ways:

1. A **`.current` accessor object** per piece of state — a small object with a single `current` getter that reads the rune on each access. These are exported from every store and are the most broadly available way to read state across the package boundary.
2. Internal **`get*()` functions** that read the rune on each call. Some of these are re-exported from the barrel (notably all of the **layout** store, most of **vfs** and **agents**, plus argument-taking lookups like `getTab(id)`), but for the **editor**, **ai**, **plugin**, and **collaboration** stores the plain state `get*()` readers are _not_ re-exported — use the `.current` accessors instead.

Read either form **inside** a reactive context in your own component and Svelte tracks the dependency for you:

```svelte
<script lang="ts">
	// layout store re-exports its get*() functions, so this works:
	import { getLeftSidebarVisible, toggleLeftSidebar } from '@nocturnium/svelte-ide/stores';

	// re-runs whenever the underlying rune changes
	const visible = $derived(getLeftSidebarVisible());
</script>

<button onclick={toggleLeftSidebar}>
	{visible ? 'Hide' : 'Show'} sidebar
</button>
```

For stores whose state `get*()` readers are not exported, read the `.current` accessor instead:

```svelte
<script lang="ts">
	import { tabs, activeTab } from '@nocturnium/svelte-ide/stores';

	const openTabs = $derived(tabs.current);
	const current = $derived(activeTab.current);
</script>
```

### Which accessors each store exports

| Store             | Re-exported `get*()` state readers                  | `.current` accessors                                         | Argument lookups                                  |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| **layout**        | All (`getLeftSidebarVisible()`, …) — via `export *` | none                                                         | `getEditorAreaStyle()` (no arg)                   |
| **editor**        | none (state readers stay internal)                  | yes (`tabs`, `activeTab`, …)                                 | `getTab(id)`, `getTabByPath(path)`                |
| **ai**            | none                                                | yes (`messages`, `aiConfig`, …)                              | none                                              |
| **plugin**        | none                                                | yes (`proposals`, `instances`, …)                            | `getProposal(id)`, `getInstance(id)`              |
| **collaboration** | none                                                | yes (`users`, `cursors`, …)                                  | `getDocumentSnapshots(id)`, `getUserColor(index)` |
| **vfs**           | most (`getWorkspace()`, `getFiles()`, …)            | a subset (`workspace`, `files`, `connected→vfsConnected`, …) | `getFile(path)`, `getLock(path)`, …               |
| **agents**        | most (`getAgents()`, `getOnlineAgents()`, …)        | a subset (`agents`, `events→agentEvents`, …)                 | `getAgent(id)`, `getCursor(id)→getAgentCursor`, … |

The per-store sections below list, for each piece of state, the binding(s) you can actually import.

### Name collisions across stores

Several stores export the same generic names (`error`, `connect`, `disconnect`, `reset`, `clearError`, `onEvent`, `updateCursor`, `config`, `connected`, `setError`, `setConnected`, …). Because all seven stores are flattened into one barrel, `src/lib/stores/index.ts` renames the colliding ones on the way out. The renamed public names are called out in each section below — for instance the editor store's `error` accessor is exported as **`editorError`**, and the collaboration store's `disconnect` as **`disconnectCollab`**. (Where a name does _not_ collide it is exported unchanged — for example the plugin store keeps the bare `connected` accessor, while vfs and agents had to rename theirs to `vfsConnected` / `agentsConnected`.)

---

## Layout store — the stable `@public` set

Source: `src/lib/stores/layout.svelte.ts`. Manages IDE chrome: sidebars, bottom panel, activity bar, status bar, full-screen / zen mode, and the command-palette / search / settings overlays. This is the **only store whose functions are part of the stable public API** (per the `@public` annotation on the `./stores` re-export in `src/lib/index.ts`); the explicitly-blessed stable functions are `toggleLeftSidebar`, `toggleRightSidebar`, `toggleBottomPanel`, `setLeftSidebarPanel`, `setRightSidebarPanel`, `setBottomPanelTab`, `getLeftSidebarVisible`, `getLeftSidebarActivePanel`, `getRightSidebarVisible`, `getRightSidebarActivePanel`, `getBottomPanelVisible`, `getBottomPanelActiveTab`, `openCommandPalette`, `closeCommandPalette`, `getCommandPaletteOpen`, `focusAIPanel`, `focusTerminal`, and `focusExplorer`. The remaining layout helpers below are exported too and follow the same conventions. Unlike the other stores, layout is re-exported with `export *`, so **all** of its `get*()` functions are importable and the names below are unchanged. The layout store does **not** provide `.current` accessors — use the getters.

```ts
import {
	getLeftSidebarVisible,
	setLeftSidebarPanel,
	toggleBottomPanel,
	openCommandPalette,
	focusAIPanel
} from '@nocturnium/svelte-ide/stores';
```

### Getters

| Function                       | Returns                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `getLeftSidebarVisible()`      | `boolean` — left sidebar shown (false in zen mode).                                                           |
| `getLeftSidebarWidth()`        | `number` — left sidebar width in px.                                                                          |
| `getLeftSidebarActivePanel()`  | `string` — active left panel id (e.g. `'explorer'`, `'search'`).                                              |
| `getRightSidebarVisible()`     | `boolean` — right sidebar shown (false in zen mode).                                                          |
| `getRightSidebarWidth()`       | `number` — right sidebar width in px.                                                                         |
| `getRightSidebarActivePanel()` | `string` — active right panel id (e.g. `'ai'`).                                                               |
| `getBottomPanelVisible()`      | `boolean` — bottom panel shown (false in zen mode).                                                           |
| `getBottomPanelHeight()`       | `number` — bottom panel height in px.                                                                         |
| `getBottomPanelActiveTab()`    | `string` — active bottom tab (e.g. `'terminal'`).                                                             |
| `getActivityBarPosition()`     | `'left' \| 'hidden'`.                                                                                         |
| `getStatusBarVisible()`        | `boolean` — status bar shown (false in zen mode).                                                             |
| `getIsFullScreen()`            | `boolean`.                                                                                                    |
| `getZenMode()`                 | `boolean` — distraction-free mode active.                                                                     |
| `getCommandPaletteOpen()`      | `boolean`.                                                                                                    |
| `getSearchPanelOpen()`         | `boolean`.                                                                                                    |
| `getSettingsOpen()`            | `boolean`.                                                                                                    |
| `getEditorAreaStyle()`         | `{ marginLeft, marginRight, marginBottom }` — computed CSS margins that reserve space for the visible chrome. |

### Actions

| Function                                                                    | Description                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `toggleLeftSidebar()` / `showLeftSidebar()` / `hideLeftSidebar()`           | Change left sidebar visibility.                                                   |
| `setLeftSidebarWidth(width)`                                                | Set left width (clamped 180–500px).                                               |
| `setLeftSidebarPanel(panel)`                                                | Activate a left panel; clicking the already-active panel toggles the sidebar off. |
| `toggleRightSidebar()` / `showRightSidebar()` / `hideRightSidebar()`        | Change right sidebar visibility.                                                  |
| `setRightSidebarWidth(width)`                                               | Set right width (clamped 180–500px).                                              |
| `setRightSidebarPanel(panel)`                                               | Activate a right panel (toggle-off behavior like the left).                       |
| `toggleBottomPanel()` / `showBottomPanel()` / `hideBottomPanel()`           | Change bottom panel visibility.                                                   |
| `setBottomPanelHeight(height)`                                              | Set bottom height (clamped 100–500px).                                            |
| `setBottomPanelTab(tab)`                                                    | Activate a bottom tab (toggle-off behavior).                                      |
| `toggleActivityBar()`                                                       | Switch activity bar between `'left'` and `'hidden'`.                              |
| `toggleStatusBar()`                                                         | Show/hide the status bar.                                                         |
| `toggleFullScreen()`                                                        | Toggle browser fullscreen (calls `requestFullscreen` / `exitFullscreen`).         |
| `toggleZenMode()` / `exitZenMode()`                                         | Enter/leave distraction-free mode.                                                |
| `openCommandPalette()` / `closeCommandPalette()` / `toggleCommandPalette()` | Control the command palette overlay.                                              |
| `openSearchPanel()` / `closeSearchPanel()` / `toggleSearchPanel()`          | Control the search panel (opening also focuses the `'search'` left panel).        |
| `openSettings()` / `closeSettings()` / `toggleSettings()`                   | Control the settings overlay.                                                     |
| `focusAIPanel()`                                                            | Reveal the right sidebar and select the `'ai'` panel.                             |
| `focusExplorer()`                                                           | Reveal the left sidebar and select the `'explorer'` panel.                        |
| `focusTerminal()`                                                           | Reveal the bottom panel and select the `'terminal'` tab.                          |
| `resetLayout()`                                                             | Restore all layout state to defaults.                                             |

### Constant

| Export        | Description                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `constraints` | Object of size limits: `sidebarMinWidth`, `sidebarMaxWidth`, `sidebarDefaultWidth`, `panelMinHeight`, `panelMaxHeight`, `panelDefaultHeight`. |

---

## Editor store

Source: `src/lib/stores/editor.svelte.ts`. Manages open tabs, the active file, split mode, editor preferences, and recent files. **Experimental.** Powers the `<EditorPane>` / `<EditorTabs>` components documented in the [Editor guide](../guides/editor.md).

```ts
import { openFile, tabs, activeTab, editorError } from '@nocturnium/svelte-ide/stores';
```

> The editor store's plain state `get*()` readers (`getTabs`, `getActiveTab`, `getError`, …) are **not** re-exported from the package — read state via the `.current` accessors listed below. The argument-taking lookups `getTab(id)` and `getTabByPath(path)` _are_ exported.
>
> Renamed on export to avoid collisions: the `error` accessor is exported as **`editorError`**, `setError` → **`setEditorError`**, `updateCursor` → **`updateEditorCursor`**.

### State accessors

Read these inside a reactive context (`$derived(...)`):

| `.current` accessor    | Returns                                      | Backed by                       |
| ---------------------- | -------------------------------------------- | ------------------------------- |
| `tabs.current`         | `EditorTab[]` — all open tabs.               | `getTabs()`                     |
| `activeTabId.current`  | `string \| null`.                            | `getActiveTabId()`              |
| `activeTab.current`    | `EditorTab \| null`.                         | `getActiveTab()`                |
| `splitMode.current`    | `SplitMode`.                                 | `getSplitMode()`                |
| `preferences.current`  | `EditorPreferences`.                         | `getPreferences()`              |
| `recentFiles.current`  | `string[]` — recently opened paths (max 20). | `getRecentFiles()`              |
| `loading.current`      | `boolean`.                                   | `getLoading()`                  |
| `editorError.current`  | `string \| null`.                            | `getError()` (renamed accessor) |
| `dirtyTabs.current`    | `EditorTab[]` — tabs with unsaved changes.   | `getDirtyTabs()`                |
| `hasDirtyTabs.current` | `boolean`.                                   | `getHasDirtyTabs()`             |

Argument lookups (exported as functions): `getTab(tabId)` and `getTabByPath(path)`, each returning `EditorTab | undefined`.

### Actions

| Function                              | Description                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `openFile(path, content, options?)`   | Open a file in a new tab (or focus the existing one); returns the tab id. `options` may set `language` and `focus`. |
| `closeTab(tabId)`                     | Close a tab; returns `false` (refusing to close) if the tab is dirty.                                               |
| `forceCloseTab(tabId)`                | Close a tab regardless of dirty state.                                                                              |
| `closeAllTabs(force?)`                | Close all tabs; returns `false` if any are dirty and `force` is not set.                                            |
| `closeOtherTabs(keepTabId, force?)`   | Close every tab except one; same dirty guard.                                                                       |
| `setActiveTab(tabId)`                 | Focus an existing tab.                                                                                              |
| `updateContent(tabId, content)`       | Replace a tab's content and mark it dirty if changed.                                                               |
| `markSaved(tabId, newContent?)`       | Clear the dirty flag (optionally swapping in saved content).                                                        |
| `updateEditorCursor(tabId, position)` | (`updateCursor`) Store the tab's cursor position.                                                                   |
| `setAIEditing(tabId, editing)`        | Flag a tab as currently being edited by AI.                                                                         |
| `reorderTabs(fromIndex, toIndex)`     | Move a tab within the tab strip.                                                                                    |
| `setSplitMode(mode)`                  | Set the editor split layout.                                                                                        |
| `updatePreferences(updates)`          | Merge a partial `EditorPreferences` patch.                                                                          |
| `resetPreferences()`                  | Restore defaults.                                                                                                   |
| `nextTab()` / `prevTab()`             | Cycle the active tab.                                                                                               |
| `setLoading(state)`                   | Set the loading flag.                                                                                               |
| `setEditorError(error)`               | (`setError`) Set or clear the error string.                                                                         |

---

## AI store

Source: `src/lib/stores/ai.svelte.ts`. Manages AI conversations, messages, registered tools, edit sessions, and inline suggestions, and performs the actual chat request against your endpoint (default `/api/chat`). **Experimental.** Backs the `<AIPanel>` described in the [AI & agents guide](../guides/ai-and-agents.md).

```ts
import { sendMessage, messages, aiConfig, updateConfig } from '@nocturnium/svelte-ide/stores';
```

> The AI store exports **no** `get*()` functions — read state via the `.current` accessors below.
>
> Renamed on export: the `config` accessor → **`aiConfig`**, `error` accessor → **`aiError`**, `clearError` → **`clearAIError`**.

### State accessors

| `.current` accessor            | Returns                                              | Backed by                        |
| ------------------------------ | ---------------------------------------------------- | -------------------------------- |
| `conversations.current`        | `AIConversation[]`.                                  | `getConversations()`             |
| `activeConversationId.current` | `string \| null`.                                    | `getActiveConversationId()`      |
| `activeConversation.current`   | `AIConversation \| null`.                            | `getActiveConversation()`        |
| `messages.current`             | `AIMessage[]` — messages of the active conversation. | `getMessages()`                  |
| `tools.current`                | `AITool[]` — registered tools.                       | `getTools()`                     |
| `aiConfig.current`             | `AIPanelConfig`.                                     | `getConfig()` (renamed accessor) |
| `editSessions.current`         | `AIEditSession[]`.                                   | `getEditSessions()`              |
| `activeEditSessions.current`   | `AIEditSession[]` — sessions in `'editing'` state.   | `getActiveEditSessions()`        |
| `suggestions.current`          | `AISuggestion[]`.                                    | `getSuggestions()`               |
| `isStreaming.current`          | `boolean`.                                           | `getIsStreaming()`               |
| `isPanelOpen.current`          | `boolean`.                                           | `getIsPanelOpen()`               |
| `aiError.current`              | `string \| null`.                                    | `getError()` (renamed accessor)  |

### Actions

| Function                                                                    | Description                                                                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createConversation(title?, context?)`                                      | Create and activate a conversation; returns its id.                                                                               |
| `setActiveConversation(conversationId \| null)`                             | Switch the active conversation.                                                                                                   |
| `deleteConversation(conversationId)`                                        | Remove a conversation.                                                                                                            |
| `addMessage(message)`                                                       | Append a message (without `id`/`timestamp`) to the active conversation; returns the new id.                                       |
| `updateMessage(messageId, updates)`                                         | Patch a message in place (used during streaming).                                                                                 |
| `sendMessage(content, context?)`                                            | `async` — add the user message, POST the conversation to `config.endpoint`, and stream the assistant reply (handling tool calls). |
| `registerTool(tool)` / `unregisterTool(toolName)`                           | Add or remove an `AITool` the model may call.                                                                                     |
| `updateConfig(updates)`                                                     | Merge a partial `AIPanelConfig` (endpoint, model, system prompt, streaming, etc.).                                                |
| `togglePanel()` / `openPanel()` / `closePanel()`                            | Control AI panel visibility.                                                                                                      |
| `startEditSession(conversationId, filePath, originalContent)`               | Begin an AI edit session; returns its id.                                                                                         |
| `updateEditSession(sessionId, updates)`                                     | Patch a session.                                                                                                                  |
| `completeEditSession(sessionId, proposedContent, diff?)`                    | Move a session to `'reviewing'` with proposed output.                                                                             |
| `resolveEditSession(sessionId, apply)`                                      | Mark a session `'applied'` or `'rejected'`.                                                                                       |
| `addSuggestion(suggestion)` / `removeSuggestion(id)` / `clearSuggestions()` | Manage inline suggestions.                                                                                                        |
| `updateContext(context)`                                                    | Merge context into the active conversation.                                                                                       |
| `clearAIError()`                                                            | (`clearError`) Clear the error string.                                                                                            |

---

## Plugin store

Source: `src/lib/stores/plugin.svelte.ts`. Manages the proposal-based plugin lifecycle (`draft → reviewing → testing → deployed`) against a backend **plugin host** that exposes a REST + Server-Sent-Events API (default base path `/api/plugins`). **Experimental.** See the [Plugins guide](../guides/plugins.md) for the bring-your-own-backend contract.

```ts
import { connect, fetchProposals, loadPlugin, pluginError } from '@nocturnium/svelte-ide/stores';
```

> The plugin store's plain state `get*()` readers are **not** re-exported — read state via the `.current` accessors below. The argument lookups `getProposal(id)` and `getInstance(id)` _are_ exported.
>
> Renamed on export: the `error` accessor → **`pluginError`**, `disconnect` → **`disconnectPlugins`**, `onEvent` → **`onPluginEvent`**, `clearError` → **`clearPluginError`**. (`connect` is **not** renamed.)

### State accessors

| `.current` accessor          | Returns                                                    | Backed by                       |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------- |
| `proposals.current`          | `PluginProposal[]`.                                        | `getProposals()`                |
| `instances.current`          | `PluginInstance[]`.                                        | `getInstances()`                |
| `activeInstances.current`    | `PluginInstance[]` — instances with `status === 'active'`. | `getActiveInstances()`          |
| `commands.current`           | `PluginCommand[]`.                                         | `getCommands()`                 |
| `panels.current`             | `PluginPanel[]`.                                           | `getPanels()`                   |
| `connected.current`          | `boolean` — SSE stream connected.                          | `getConnected()`                |
| `loadingProposals.current`   | `boolean`.                                                 | `getLoadingProposals()`         |
| `loadingInstance.current`    | `string \| null` — id of the plugin currently loading.     | `getLoadingInstance()`          |
| `pluginError.current`        | `string \| null`.                                          | `getError()` (renamed accessor) |
| `draftProposals.current`     | `PluginProposal[]` — `status === 'draft'`.                 | `getDraftProposals()`           |
| `reviewingProposals.current` | `PluginProposal[]` — `status === 'reviewing'`.             | `getReviewingProposals()`       |
| `deployedProposals.current`  | `PluginProposal[]` — `status === 'deployed'`.              | `getDeployedProposals()`        |

Argument lookups (exported as functions): `getProposal(proposalId)` and `getInstance(pluginId)`.

### Actions

| Function                                                                | Description                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `connect(endpoint?)`                                                    | Open the plugin host's SSE stream (default `/api/plugins/stream`).                         |
| `disconnectPlugins()`                                                   | (`disconnect`) Close the SSE stream.                                                       |
| `onPluginEvent(type, handler)`                                          | (`onEvent`) Subscribe to a `PluginEvent` type (or `'*'`); returns an unsubscribe function. |
| `fetchProposals()`                                                      | `async` — load all proposals from the host (`GET /api/plugins/proposals`).                 |
| `createProposal(proposal)`                                              | `async` — POST a new proposal; returns its id or `null`.                                   |
| `submitProposal(proposalId)`                                            | `async` — submit a draft for review; returns `boolean`.                                    |
| `loadPlugin(proposalId)`                                                | `async` — instantiate a deployed plugin (refusing non-deployed ones); returns `boolean`.   |
| `unloadPlugin(proposalId)`                                              | Dispose an instance and unregister its contributions.                                      |
| `registerCommand(pluginId, command)` / `registerPanel(pluginId, panel)` | Register plugin contributions (namespaced as `pluginId:id`).                               |
| `executeCommand(commandId)`                                             | `async` — run a registered command's handler.                                              |
| `clearPluginError()`                                                    | (`clearError`) Clear the error string.                                                     |

---

## Collaboration store

Source: `src/lib/stores/collaboration.svelte.ts`. Manages CRDT-based real-time collaboration: connection status, remote users, cursors, awareness, AI collaboration sessions, proposed changes, and document snapshots. **Experimental.** Pairs with the Yjs-backed `<CollaborativeEditor>` from `@nocturnium/svelte-ide/crdt`; see the [Collaboration guide](../guides/collaboration.md).

```ts
import { initialize, addUser, setLocalCursor, collabConfig } from '@nocturnium/svelte-ide/stores';
```

> The collaboration store's plain state `get*()` readers are **not** re-exported — read state via the `.current` accessors below. The argument lookups `getDocumentSnapshots(id)` and `getUserColor(index)` _are_ exported. (This store has no `clearError` function.)
>
> Renamed on export: the `config` accessor → **`collabConfig`**, `error` accessor → **`collabError`**, `updateCursor` → **`updateCollabCursor`**, `disconnect` → **`disconnectCollab`**, `onEvent` → **`onCollabEvent`**. (`initialize` and `reset` are **not** renamed.)

### State accessors

| `.current` accessor        | Returns                                                                 | Backed by                        |
| -------------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `collabConfig.current`     | `CollaborationConfig \| null`.                                          | `getConfig()` (renamed accessor) |
| `status.current`           | connection status (`'disconnected'`, `'connecting'`, `'connected'`, …). | `getStatus()`                    |
| `collabError.current`      | `string \| null`.                                                       | `getError()` (renamed accessor)  |
| `synced.current`           | `boolean`.                                                              | `getSynced()`                    |
| `users.current`            | `CollaborationUser[]`.                                                  | `getUsers()`                     |
| `cursors.current`          | `CollaboratorCursor[]`.                                                 | `getCursors()`                   |
| `awareness.current`        | `CollaboratorAwareness[]`.                                              | `getAwareness()`                 |
| `aiSessions.current`       | `AICollaborationSession[]`.                                             | `getAISessions()`                |
| `activeAISessions.current` | `AICollaborationSession[]` — `status === 'active'`.                     | `getActiveAISessions()`          |
| `pendingChanges.current`   | `AIProposedChange[]`.                                                   | `getPendingChanges()`            |
| `snapshots.current`        | `DocumentSnapshot[]`.                                                   | `getSnapshots()`                 |
| `localUser.current`        | `CollaborationUser \| null`.                                            | `getLocalUser()`                 |
| `isConnected.current`      | `boolean` — `status === 'connected'`.                                   | `getIsConnected()`               |
| `otherUsers.current`       | `CollaborationUser[]` — everyone but the local user.                    | `getOtherUsers()`                |

Argument lookups (exported as functions): `getDocumentSnapshots(documentId)` and `getUserColor(index)`.

### Actions

| Function                                                      | Description                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `initialize(config)`                                          | Set config + local user (read from `config.user`) and enter `'connecting'`.     |
| `setStatus(status, errorMsg?)`                                | Update connection status (emits connect/disconnect events).                     |
| `setSynced(synced)`                                           | Set the synced flag.                                                            |
| `addUser(user)` / `removeUser(userId)`                        | Add (auto-assigning a cursor color) or remove a participant.                    |
| `updateCollabCursor(cursor)`                                  | (`updateCursor`) Store a remote user's cursor.                                  |
| `updateAwareness(data)`                                       | Store a remote user's awareness.                                                |
| `setLocalCursor(position, selection?)`                        | Update the local user's cursor.                                                 |
| `setLocalAwareness(updates)`                                  | Update the local user's awareness.                                              |
| `startAISession(documentId, aiUser)`                          | Begin an AI collaboration session (adds the AI as a user); returns its id.      |
| `updateAISession(sessionId, updates)`                         | Patch a session.                                                                |
| `setAITask(sessionId, task)`                                  | Set a session's current task and mark it `'active'`.                            |
| `proposeAIChange(sessionId, change)`                          | Queue an AI-proposed change; returns its id.                                    |
| `reviewAIChange(changeId, approved, reviewerId)`              | Approve or reject a proposed change.                                            |
| `completeAISession(sessionId)` / `cancelAISession(sessionId)` | Finish or abort a session (and clean up its changes).                           |
| `createSnapshot(documentId, content, reason?)`                | Save a document snapshot; returns its id.                                       |
| `onCollabEvent(handler)`                                      | (`onEvent`) Subscribe to collaboration events; returns an unsubscribe function. |
| `disconnectCollab()`                                          | (`disconnect`) Drop the session and clear users/cursors/awareness.              |
| `reset()`                                                     | Disconnect and clear all collaboration state.                                   |

---

## VFS store

Source: `src/lib/stores/vfs.svelte.ts`. Manages a virtual-filesystem workspace: the file tree, per-file locks, dirty tracking, transactions, and a Server-Sent-Events stream from the VFS backend (default `/api/vfs`). **Experimental.** Drives the lock/version components (`LockIndicator`, `LockConflictDialog`, `LockOverlay`, `VersionConflictDialog`); see the [Services reference](./services.md) and [Architecture overview](../architecture.md).

```ts
import { initializeVFS, getFileTree, acquireLock, vfsError } from '@nocturnium/svelte-ide/stores';
```

> Renamed on export: the `connected` accessor → **`vfsConnected`**, `error` accessor → **`vfsError`**, `clearError` → **`clearVFSError`**, `connect` → **`connectVFS`**, `disconnect` → **`disconnectVFS`**, `onEvent` → **`onVFSEvent`**, `reset` → **`resetVFS`**, and `initialize` → **`initializeVFS`**. Note that `getConnected()` and `getError()` are **not** re-exported — read connection state via `vfsConnected.current` and the error via `vfsError.current`.

### Getters

Most of the VFS state `get*()` functions **are** re-exported and can be imported directly: `getWorkspace()`, `getWorkspaceLoading()`, `getFiles()`, `getFileTree()`, `getLocks()`, `getDirtyFiles()`, `getActiveTransactions()`, and `getSyncing()`. Each also has a `.current` accessor (`workspace`, `workspaceLoading`, `files`, `fileTree`, `locks`, `dirtyFiles`, `activeTransactions`, `syncing`). Connection state and the error are exposed **only** through the renamed accessors **`vfsConnected`** (`.current`) and **`vfsError`** (`.current`) — the underlying `getConnected()` / `getError()` are not exported.

Additional getters (argument lookups / scalars, exported as functions, no `.current` accessor):

| Function                                                          | Returns                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| `getFile(path)`                                                   | `VFSFileInfo \| undefined`.                             |
| `getLock(path)`                                                   | `VFSFileLock \| undefined`.                             |
| `getLockStatus(path)`                                             | `VFSLockStatus`.                                        |
| `isLocked(path)` / `isLockedByMe(path)` / `isLockedByOther(path)` | `boolean`.                                              |
| `getMyLocks()` / `getOtherLocks()`                                | `VFSFileLock[]`.                                        |
| `isDirty(path)`                                                   | `boolean`.                                              |
| `getTransactionHistory()`                                         | `VFSTransaction[]` — completed transactions (last 100). |
| `getVersion()`                                                    | `number` — workspace version for conflict detection.    |
| `getReconnectAttempts()`                                          | `number`.                                               |
| `getLockedFiles()` / `getMyLockedFiles()`                         | `VFSFileInfo[]`.                                        |
| `getDirectories()`                                                | `VFSFileInfo[]`.                                        |
| `getFilesInDirectory(dirPath)`                                    | `VFSFileInfo[]` — immediate children of a directory.    |

### Actions

| Function                                                                                 | Description                                                                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `initializeVFS(userId, workspaceId?)`                                                    | (`initialize`) Set the current user and optionally load a workspace.                                       |
| `loadWorkspace(workspaceId)`                                                             | `async` — fetch a workspace and connect its SSE stream.                                                    |
| `updateFileInfo(fileInfo)` / `removeFileInfo(path)`                                      | Upsert or remove a file entry.                                                                             |
| `markDirty(path)` / `markClean(path)`                                                    | Toggle a file's local-changes flag.                                                                        |
| `setFiles(files)`                                                                        | Replace the whole file list.                                                                               |
| `setLock(lock)` / `removeLock(path)` / `setLockStatus(path, status)` / `setLocks(locks)` | Manage lock state (own locks auto-refresh before TTL expiry).                                              |
| `acquireLock(path, purpose?)`                                                            | `async` — request a lock; returns the lock or `null`.                                                      |
| `releaseLock(path)` / `releaseAllMyLocks()`                                              | `async` — release one or all of your locks.                                                                |
| `startTransaction(transaction)` / `completeTransaction(txId, status)`                    | Track multi-file transactions.                                                                             |
| `setSyncing(syncing)`                                                                    | Set the syncing flag.                                                                                      |
| `connectVFS(workspaceId)`                                                                | (`connect`) Open the workspace SSE stream `…/workspaces/{id}/stream` (with exponential-backoff reconnect). |
| `disconnectVFS()`                                                                        | (`disconnect`) Close the stream and clear lock-refresh timers.                                             |
| `onVFSEvent(type, handler)`                                                              | (`onEvent`) Subscribe to a `VFSEvent` type (or `'*'`); returns an unsubscribe function.                    |
| `clearVFSError()`                                                                        | (`clearError`) Clear the error string and code.                                                            |
| `resetVFS()`                                                                             | (`reset`) Disconnect and clear all VFS state.                                                              |

---

## Agents store

Source: `src/lib/stores/agents.svelte.ts`. Manages multi-agent coordination: an agent registry, a team-event log, an activity feed, and per-agent cursors, plus selection/filter UI state. **Experimental.** Backs the agent-presence UI in the [AI & agents guide](../guides/ai-and-agents.md).

```ts
import { addAgent, getOnlineAgents, onTeamEvent, agentsError } from '@nocturnium/svelte-ide/stores';
```

> Renamed on export: the `events` accessor → **`agentEvents`**, `cursors` accessor → **`agentCursors`**, `filter` accessor → **`agentFilter`**, `connected` accessor → **`agentsConnected`**, `error` accessor → **`agentsError`**, `getEvents` → **`getAgentEvents`**, `getCursors` → **`getAgentCursors`**, `getCursor` → **`getAgentCursor`**, `getFilter` → **`getAgentFilter`**, `updateCursor` → **`updateAgentCursor`**, `removeCursor` → **`removeAgentCursor`**, `addEvent` → **`addAgentEvent`**, `setFilter` → **`setAgentFilter`**, `clearEvents` → **`clearAgentEvents`**, `setConnected` → **`setAgentsConnected`**, `setError` → **`setAgentsError`**, `clearError` → **`clearAgentsError`**, and `reset` → **`resetAgents`**. Note `getConnected()` and `getError()` are **not** re-exported — read connection state via `agentsConnected.current` and the error via `agentsError.current`.

### Getters

Most of the agents state `get*()` functions **are** re-exported and can be imported directly: `getAgents()`, `getOnlineAgents()`, `getBusyAgents()`, `getAgentEvents()` (renamed from `getEvents()`), `getActivities()`, `getAgentCursors()` (renamed from `getCursors()`), `getSelectedAgent()`, and `getAgentFilter()` (renamed from `getFilter()`). Each also has a `.current` accessor: `agents`, `onlineAgents`, `busyAgents`, `agentEvents`, `activities`, `agentCursors`, `selectedAgent`, `agentFilter`. Connection state and the error are exposed **only** through the renamed accessors **`agentsConnected`** (`.current`) and **`agentsError`** (`.current`).

Additional getters (exported as functions, no `.current` accessor):

| Function                                                        | Returns                                          |
| --------------------------------------------------------------- | ------------------------------------------------ |
| `getAgent(agentId)`                                             | `Agent \| undefined`.                            |
| `getOfflineAgents()` / `getStalledAgents()`                     | `Agent[]`.                                       |
| `getAgentsByType(type)`                                         | `Agent[]`.                                       |
| `getAgentsWorkingOnFile(filePath)`                              | `Agent[]`.                                       |
| `getActivitiesForAgent(agentId)` / `getRecentActivities(count)` | `AgentActivity[]`.                               |
| `getAgentCursor(agentId)`                                       | `AgentCursor \| undefined`.                      |
| `getCursorsForFile(filePath)`                                   | `AgentCursor[]`.                                 |
| `getFilteredAgents()`                                           | `Agent[]` — agents matching the current filter.  |
| `getActiveTasksCount()`                                         | `number`.                                        |
| `getTotalProgress()`                                            | `number` — mean progress of busy agents (0–100). |
| `getAgentCount()` / `getOnlineCount()`                          | `number`.                                        |

### Actions

| Function                                                                                     | Description                                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `addAgent(agent)` / `removeAgent(agentId)`                                                   | Register or remove an agent (logs a milestone activity).                          |
| `updateAgent(agentId, updates)`                                                              | Patch an agent and bump its `lastActivity`.                                       |
| `setAgentStatus(agentId, status)`                                                            | Set an agent's status.                                                            |
| `setAgentTask(agentId, task)`                                                                | Assign or clear an agent's current task.                                          |
| `updateAgentProgress(agentId, progress)`                                                     | Patch the active task's progress.                                                 |
| `completeAgentTask(agentId, result, summary)`                                                | Finish a task (logs a milestone, returns the agent to `'online'`).                |
| `updateAgentCursor(cursor)` / `removeAgentCursor(agentId)` / `clearCursorsForFile(filePath)` | Manage agent cursors.                                                             |
| `addAgentEvent(event)`                                                                       | (`addEvent`) Append a `TeamEvent` (notifies subscribers and derives an activity). |
| `onTeamEvent(type, handler)`                                                                 | Subscribe to a `TeamEvent` type (or `'*'`); returns an unsubscribe function.      |
| `addActivity(activity)`                                                                      | Push an item onto the activity feed.                                              |
| `selectAgent(agentId \| null)`                                                               | Set the selected agent.                                                           |
| `setAgentFilter(filter)`                                                                     | (`setFilter`) Set the agent filter.                                               |
| `clearActivities()` / `clearAgentEvents()`                                                   | (`clearEvents`) Clear the feeds.                                                  |
| `handleVFSEvent(event)`                                                                      | Translate VFS iteration/gate events into agent progress + activity.               |
| `addMockAgents()`                                                                            | Seed sample agents (development aid).                                             |
| `setAgentsConnected(connected)`                                                              | (`setConnected`) Set the connection flag.                                         |
| `setAgentsError(error)`                                                                      | (`setError`) Set or clear the error string.                                       |
| `clearAgentsError()`                                                                         | (`clearError`) Clear the error string.                                            |
| `resetAgents()`                                                                              | (`reset`) Clear all agent state.                                                  |

---

## See also

- [Getting started](../getting-started.md) — install, theme, and your first editor.
- [Architecture overview](../architecture.md) — how the stores fit the module map.
- [Component reference](./components.md) — the components these stores back.
- [Services reference](./services.md) — the VFS / network clients the stores call.
- [Types & utils reference](./types-and-utils.md) — the `EditorTab`, `AIPanelConfig`, `VFSFileInfo`, `Agent`, and related types referenced above.
- [Editor guide](../guides/editor.md) · [AI & agents guide](../guides/ai-and-agents.md) · [Collaboration guide](../guides/collaboration.md) · [Plugins guide](../guides/plugins.md).
