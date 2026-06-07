# API: Components

This is the complete component reference for `@nocturnium/svelte-ide`. Every component listed here is enumerated directly from the package's real export barrels. Components are grouped by domain (Core, Editor, AI, LSP, Agents, VFS, Plugins, Layout). For each one you get its import paths — both from the package root (`@nocturnium/svelte-ide`) and from its domain subpath (e.g. `@nocturnium/svelte-ide/components/core`) — a one-line description, and a stability marker:

- **`@public`** — stable API; safe to depend on.
- **`@experimental`** — usable today, but the API may change in a future release.

Stability is taken from the JSDoc tags on the root export in [`src/lib/index.ts`](https://github.com/nocturnium/svelte-ide/blob/main/src/lib/index.ts). A handful of components are exported only from a domain subpath barrel and not from the package root; these are called out inline and can only be imported via their subpath.

Remember that components are **unstyled** until you import the design tokens once in your app:

```ts
import "@nocturnium/svelte-ide/theme.css";
```

See [Getting Started](../getting-started.md) for first-run setup and [Theming](../theming.md) for customizing the tokens.

---

## Importing components

Every component is re-exported from the package root, so the simplest import is:

```svelte
<script>
  import { Editor, Button, AIPanel } from "@nocturnium/svelte-ide";
</script>
```

Each domain also has a dedicated subpath entry point for narrower imports:

```svelte
<script>
  import { Button, Icon } from "@nocturnium/svelte-ide/components/core";
  import { Editor, EditorPane } from "@nocturnium/svelte-ide/components/editor";
  import { LSPEditor } from "@nocturnium/svelte-ide/components/lsp";
</script>
```

The package exposes these component subpaths (from `package.json` `exports`):

| Domain   | Subpath entry point                          |
| -------- | -------------------------------------------- |
| Core     | `@nocturnium/svelte-ide/components/core`      |
| Editor   | `@nocturnium/svelte-ide/components/editor`    |
| AI       | `@nocturnium/svelte-ide/components/ai`        |
| LSP      | `@nocturnium/svelte-ide/components/lsp`       |
| Agents   | `@nocturnium/svelte-ide/components/agents`    |
| VFS      | `@nocturnium/svelte-ide/components/vfs`       |
| Plugins  | `@nocturnium/svelte-ide/components/plugins`   |
| Layout   | `@nocturnium/svelte-ide/components/layout`    |

> Always import from the published package paths above. Do **not** import from `$lib/...` — that path only exists inside this repository's source tree, not in the installed package.

---

## Core

Foundational, framework-agnostic UI primitives used throughout the library and safe to use on their own. Import from the root or from `@nocturnium/svelte-ide/components/core`.

```svelte
<script>
  import { Button, Icon, ResizeHandle } from "@nocturnium/svelte-ide";
  // or, scoped to the domain:
  import { Button, Icon, ResizeHandle } from "@nocturnium/svelte-ide/components/core";
</script>
```

| Component          | Description                                                        | Stability        |
| ------------------ | ----------------------------------------------------------------- | ---------------- |
| `Button`           | Themeable button primitive.                                       | `@public`        |
| `Icon`             | Inline icon renderer.                                             | `@public`        |
| `Input`            | Single-line text input primitive.                                | `@experimental`  |
| `Textarea`         | Multi-line text input primitive.                                 | `@experimental`  |
| `Tooltip`          | Hover/focus tooltip wrapper.                                      | `@experimental`  |
| `Kbd`              | Keyboard-key label for shortcut hints.                           | `@experimental`  |
| `Badge`            | Small status/count badge.                                        | `@experimental`  |
| `Spinner`          | Loading spinner indicator.                                       | `@experimental`  |
| `Avatar`           | User/agent avatar.                                               | `@experimental`  |
| `ContextMenu`      | Right-click / contextual menu.                                  | `@experimental`  |
| `ResizeHandle`     | Draggable handle for resizing panes.                            | `@public`        |
| `ErrorBoundary`    | Catches and renders fallback UI for child render errors.        | `@experimental`  |
| `ConnectionStatus` | Visual indicator of a connection's online/offline state.        | `@experimental`  |

---

## Editor

The custom-built code editor and its surrounding chrome (tabs, panes, file tree, file icons). The editor is built from scratch — no CodeMirror — with its own tokenizer, folding, and multi-cursor support. Import from the root or from `@nocturnium/svelte-ide/components/editor`.

```svelte
<script>
  import { Editor, EditorPane, EditorTabs } from "@nocturnium/svelte-ide";
  // or, scoped to the domain:
  import { Editor, EditorPane, EditorTabs } from "@nocturnium/svelte-ide/components/editor";
</script>
```

| Component             | Description                                                                 | Stability        |
| --------------------- | --------------------------------------------------------------------------- | ---------------- |
| `Editor`              | High-level code editor component.                                          | `@public`        |
| `CustomEditor`        | Low-level editor with full keyboard/mouse handling and multi-cursor.       | `@public`        |
| `CollaborativeEditor` | Editor wired for CRDT realtime collaboration (requires Yjs peers).         | `@experimental`  |
| `EditorTabs`          | Tab bar for switching between open editor buffers.                         | `@experimental`  |
| `EditorPane`          | Container that hosts an editor (and its tabs) as a pane.                   | `@public`        |
| `FileIcon`            | File-type icon derived from a filename/extension.                          | `@experimental`  |
| `FileExplorer`        | File-tree sidebar with optional Git change status.                         | `@public`        |

> `FileExplorer` also exports two associated types from the same module: `FileChangeStatus` (`@public`) and `GitFileStatus` (`@experimental`). The editor domain barrel additionally re-exports editor-core utilities, theme helpers, language config, and tokenizer functions — those are documented under [Types & Utils](./types-and-utils.md), not here.

Related guides: [Editor](../guides/editor.md), [Syntax Highlighting](../guides/syntax-highlighting.md), [Code Folding](../guides/code-folding.md), [Multi-Cursor](../guides/multi-cursor.md), and [Collaboration](../guides/collaboration.md) for `CollaborativeEditor`.

---

## AI

Components for an in-editor AI assistant: a chat panel, message rendering, tool-call and edit previews, and inline suggestion UI. These talk to **your** chat endpoint (see [AI and Agents](../guides/ai-and-agents.md)). Import from the root or from `@nocturnium/svelte-ide/components/ai`.

```svelte
<script>
  import { AIPanel, AIMessage } from "@nocturnium/svelte-ide";
  // or, scoped to the domain:
  import { AIPanel, AIMessage } from "@nocturnium/svelte-ide/components/ai";
</script>
```

| Component            | Description                                                               | Stability        | Notes                                                  |
| -------------------- | ------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------ |
| `AIPanel`            | Full AI assistant chat panel.                                             | `@public`        |                                                        |
| `AIMessage`          | Renders a single AI/user chat message.                                    | `@experimental`  |                                                        |
| `AIToolCallDisplay`  | Renders an AI tool/function call and its result.                          | `@experimental`  |                                                        |
| `AIEditPreview`      | Preview of a proposed AI code edit before applying.                       | `@experimental`  |                                                        |
| `AIInlineEdit`       | Inline AI edit affordance within the editor.                              | `@experimental`  |                                                        |
| `AISuggestionWidget` | Floating widget surfacing an AI suggestion.                               | `@experimental`  |                                                        |
| `AIMessageContent`   | Sanitized message body renderer (escapes HTML, whitelists link schemes).  | `@experimental`  | Subpath only — `@nocturnium/svelte-ide/components/ai`  |
| `AIMessageActions`   | Action toolbar (copy, retry, etc.) for a message.                         | `@experimental`  | Subpath only — `@nocturnium/svelte-ide/components/ai`  |
| `AIConversationList` | List/switcher of AI conversations.                                        | `@experimental`  | Subpath only — `@nocturnium/svelte-ide/components/ai`  |

> The last three components (`AIMessageContent`, `AIMessageActions`, `AIConversationList`) are exported from the `@nocturnium/svelte-ide/components/ai` barrel but are **not** re-exported from the package root. Import them via the subpath:
>
> ```svelte
> <script>
>   import { AIMessageContent, AIConversationList } from "@nocturnium/svelte-ide/components/ai";
> </script>
> ```

Related guide: [AI and Agents](../guides/ai-and-agents.md).

---

## LSP

Language Server Protocol UI: an LSP-aware editor plus the floating widgets for completions, hovers, signatures, and diagnostics. These pair with the `LSPClient` service over a WebSocket bridge. Import from the root or from `@nocturnium/svelte-ide/components/lsp`.

```svelte
<script>
  import { LSPEditor, DiagnosticsPanel } from "@nocturnium/svelte-ide";
  // or, scoped to the domain:
  import { LSPEditor, DiagnosticsPanel } from "@nocturnium/svelte-ide/components/lsp";
</script>
```

| Component              | Description                                                       | Stability        |
| ---------------------- | ---------------------------------------------------------------- | ---------------- |
| `LSPEditor`            | Editor integrated with an LSP client for live language features. | `@public`        |
| `AutocompleteWidget`   | Dropdown for LSP completion items.                              | `@experimental`  |
| `HoverTooltip`         | Tooltip showing LSP hover information.                          | `@experimental`  |
| `SignatureHelpWidget`  | Popup showing LSP signature/parameter help.                     | `@experimental`  |
| `DiagnosticsPanel`     | Panel listing LSP diagnostics for the workspace/file.          | `@experimental`  |
| `DiagnosticMarker`     | Inline marker for a single LSP diagnostic.                     | `@experimental`  |

Related: [LSP guide](../guides/lsp.md), [Services reference](./services.md) for `createLSPClient` / `LSPClient`, and the low-level [LSP Integration doc](../LSP_INTEGRATION.md).

---

## Agents

UI for collaborating-agent presence: avatars, an activity feed, a presence bar, and remote cursors. Import from the root or from `@nocturnium/svelte-ide/components/agents`.

```svelte
<script>
  import { AgentPresenceBar, AgentCursor } from "@nocturnium/svelte-ide";
  // or, scoped to the domain:
  import { AgentPresenceBar, AgentCursor } from "@nocturnium/svelte-ide/components/agents";
</script>
```

| Component            | Description                                              | Stability        |
| -------------------- | ------------------------------------------------------- | ---------------- |
| `AgentAvatar`        | Avatar representing an individual agent.               | `@experimental`  |
| `AgentActivityPanel` | Panel showing recent agent activity.                  | `@experimental`  |
| `AgentPresenceBar`   | Bar summarizing currently-present agents.              | `@experimental`  |
| `AgentCursor`        | Remote agent's cursor/selection overlay in the editor. | `@experimental`  |

Related guide: [AI and Agents](../guides/ai-and-agents.md).

---

## VFS

Virtual-filesystem UI for file locking and conflict resolution. These coordinate with a VFS backend (see [Services](./services.md)). Import from the root or from `@nocturnium/svelte-ide/components/vfs`.

```svelte
<script>
  import { LockIndicator, VersionConflictDialog } from "@nocturnium/svelte-ide";
  // or, scoped to the domain:
  import { LockIndicator, VersionConflictDialog } from "@nocturnium/svelte-ide/components/vfs";
</script>
```

| Component               | Description                                                  | Stability        |
| ----------------------- | ------------------------------------------------------------ | ---------------- |
| `LockIndicator`         | Shows lock state for a file/resource.                       | `@experimental`  |
| `LockConflictDialog`    | Dialog shown when a lock acquisition conflicts.             | `@experimental`  |
| `LockOverlay`           | Overlay applied to locked editor content.                  | `@experimental`  |
| `VersionConflictDialog` | Dialog for resolving a version/write conflict.             | `@experimental`  |

Related: [Services reference](./services.md) for the VFS client.

---

## Plugins

UI for the proposal-based plugin lifecycle: a management panel, plugin cards, a proposal form, and status badges. These drive a consumer-provided plugin backend. Import from the root or from `@nocturnium/svelte-ide/components/plugins`.

```svelte
<script>
  import { PluginPanel, PluginCard } from "@nocturnium/svelte-ide";
  // or, scoped to the domain:
  import { PluginPanel, PluginCard } from "@nocturnium/svelte-ide/components/plugins";
</script>
```

| Component            | Description                                              | Stability        |
| -------------------- | ------------------------------------------------------- | ---------------- |
| `PluginPanel`        | Panel listing/managing installed and proposed plugins. | `@experimental`  |
| `PluginCard`         | Card summarizing a single plugin.                      | `@experimental`  |
| `PluginProposalForm` | Form for submitting a plugin proposal.                 | `@experimental`  |
| `PluginStatusBadge`  | Badge reflecting a plugin's lifecycle status.          | `@experimental`  |

Related guide: [Plugins](../guides/plugins.md).

---

## Layout

Top-level structural shell components: the IDE layout frame and the status bar. Import from the root or from `@nocturnium/svelte-ide/components/layout`.

```svelte
<script>
  import { IDELayout, StatusBar } from "@nocturnium/svelte-ide";
  // or, scoped to the domain:
  import { IDELayout, StatusBar } from "@nocturnium/svelte-ide/components/layout";
</script>
```

| Component   | Description                                            | Stability  |
| ----------- | ----------------------------------------------------- | ---------- |
| `IDELayout` | Main IDE layout shell (sidebars, panels, editor area). | `@public`  |
| `StatusBar` | Bottom status bar.                                    | `@public`  |

---

## See also

- [Getting Started](../getting-started.md) — install, theme, and render your first editor.
- [Architecture](../architecture.md) — how the modules fit together.
- [Theming](../theming.md) — design tokens and retheming.
- [Stores reference](./stores.md) — reactive stores that back these components.
- [Services reference](./services.md) — LSP, VFS, and other backend clients.
- [Types & Utils reference](./types-and-utils.md) — exported types and utility functions.
- [Docs hub](../README.md) — full table of contents.
