# AI Panel & Agents

`@nocturnium/svelte-ide` ships two complementary feature sets for building AI-aware editors: a **chat assistant** (the `<AIPanel>` component plus the `ai` store, which talk to _your_ chat backend) and a set of **multi-agent presence** components (`AgentAvatar`, `AgentActivityPanel`, `AgentPresenceBar`, `AgentCursor`) that visualize other actors — human or AI — working alongside the user. Neither feature bundles a server or a model: you bring your own chat endpoint and your own source of agent state, and the library renders the UI and manages reactive state around it. This guide covers wiring both, the message/tool-call/edit-preview pieces, the HTML-safety guarantees of the rendered message content, and the agent types.

---

## Quick start

Install the package and import the theme once (components are unstyled without the design tokens — see [Theming](../theming.md)):

```ts
import '@nocturnium/svelte-ide/theme.css';
```

Drop the panel into a layout and point the store at your endpoint:

```svelte
<script lang="ts">
	import { AIPanel } from '@nocturnium/svelte-ide/components/ai';
	import { updateConfig } from '@nocturnium/svelte-ide/stores';

	// Configure once (e.g. in a top-level component or onMount)
	updateConfig({
		endpoint: '/api/chat', // your backend (default shown)
		model: 'your-model-id', // forwarded in the request body
		systemPrompt: 'You are a coding assistant.',
		streaming: true
	});
</script>

<div style="height: 600px">
	<AIPanel showSidebar />
</div>
```

Everything the AI/agents features expose is also re-exported from the package root, so `import { AIPanel } from '@nocturnium/svelte-ide'` works too. The sub-path entry points (`/components/ai`, `/components/agents`, `/stores`, `/types`) exist so you can import only what you use.

---

## The chat assistant

### `<AIPanel>`

`<AIPanel>` is the full chat surface: a message list, a streaming typing indicator, an input box (Enter to send, Shift+Enter for a newline), an error banner, and an optional conversation sidebar with history persistence.

```svelte
<script lang="ts">
	import { AIPanel } from '@nocturnium/svelte-ide/components/ai';
</script>

<AIPanel showSidebar class="my-panel" />
```

| Prop          | Type      | Default | Description                                                      |
| ------------- | --------- | ------- | ---------------------------------------------------------------- |
| `showSidebar` | `boolean` | `false` | Show the conversation list sidebar (toggleable from the header). |
| `class`       | `string`  | `''`    | Extra class applied to the panel root.                           |

The panel reads and drives the `ai` store directly — it calls `sendMessage()` on submit, renders `getMessages()`, shows `getIsStreaming()` while a response streams, and surfaces `getError()` in the banner. You don't pass messages in as props; you configure the store and let the panel react.

Conversation history is persisted locally (via the panel's built-in persistence layer) so the sidebar survives reloads. Conversations can be created, selected, renamed, starred, deleted, and exported to Markdown or JSON from the sidebar UI.

### The `ai` store

The store is the programmatic surface behind the panel. Import its functions from the `/stores` entry point. The store is module-level singleton state built on Svelte 5 runes, so any component reading it stays reactive.

```ts
import {
	updateConfig,
	sendMessage,
	createConversation,
	setActiveConversation,
	registerTool,
	togglePanel,
	isStreaming,
	messages,
	aiConfig,
	aiError,
	clearAIError
} from '@nocturnium/svelte-ide/stores';
```

> Note the renamed aliases when importing from the barrel: the store's internal `config`, `error`, and `clearError` are exported as **`aiConfig`**, **`aiError`**, and **`clearAIError`** to avoid clashing with the other stores. Reactive values exposed as objects (`messages`, `isStreaming`, `aiConfig`, `aiError`, …) are read through a `.current` getter, e.g. `messages.current` and `isStreaming.current`.

Common operations:

```ts
// 1. Configure the backend
updateConfig({
	endpoint: '/api/chat',
	model: 'your-model-id',
	systemPrompt: 'You are a helpful coding assistant integrated into an IDE.',
	maxTokens: 4096,
	temperature: 0.7,
	streaming: true,
	headers: { 'X-Workspace': 'demo' } // merged into every request
});

// 2. Start (or implicitly create) a conversation and send a message
const conversationId = createConversation('Refactor session');
await sendMessage('Explain this function', {
	selection: { path: 'src/app.ts', content: '…', startLine: 10, endLine: 24 }
});

// 3. React to streaming state in your own UI
$effect(() => {
	if (isStreaming.current) console.log('assistant is responding…');
});
```

#### What `sendMessage` sends and expects

When you call `sendMessage(content, context?)`, the store appends the user message, creates a streaming placeholder for the assistant reply, then `POST`s JSON to `config.endpoint` (default `/api/chat`). The request body has this shape:

```jsonc
{
  "messages":     [ /* prior AIMessage objects in the active conversation */ ],
  "model":        "your-model-id",
  "systemPrompt": "…",
  "tools":        [ { "name": "…", "description": "…", "parameters": { … } } ],
  "maxTokens":    4096,
  "temperature":  0.7,
  "context":      { /* AIContext, if supplied */ }
}
```

Your backend owns everything beyond this contract — authentication, the actual model provider, rate limiting, and prompt assembly. The library never embeds a host or an API key.

The response is handled two ways depending on `config.streaming`:

- **Streaming (`streaming: true`)** — the store reads `response.body` as a stream and decodes each chunk as UTF-8 text, appending it to the assistant message as it arrives. Your endpoint should write the assistant's text directly to the response body.
- **Non-streaming (`streaming: false`)** — the store calls `response.json()` and expects an object like `{ content, toolCalls?, metadata? }`. Any `toolCalls` returned are executed against tools you registered (see below), and the results are appended as `tool`-role messages.

A non-2xx response sets `aiError` and marks the assistant message with an `error`. Clear it with `clearAIError()`.

#### Registering tools

Tools let the model call back into your application. Register an `AITool` (from `@nocturnium/svelte-ide/types`) and its `name`/`description`/`parameters` are forwarded in every request; when the backend returns a matching tool call (non-streaming responses), the store runs the tool's `handler` and records the result.

```ts
import { registerTool } from '@nocturnium/svelte-ide/stores';
import type { AITool } from '@nocturnium/svelte-ide/types';

const readFile: AITool = {
	name: 'read_file',
	description: 'Read the contents of a file in the workspace',
	parameters: {
		type: 'object',
		properties: { path: { type: 'string', description: 'Workspace-relative path' } },
		required: ['path']
	},
	handler: async (args, context) => {
		// args is Record<string, unknown>; context is the conversation's AIContext
		return await myVfs.read(String(args.path));
	}
};

registerTool(readFile);
```

Tool results are appended as messages with `role: 'tool'` and a `toolResult` payload; the panel renders a success badge for them. Remove a tool with `unregisterTool(name)`.

#### Edit sessions and suggestions

The store also models **AI edit sessions** (a proposed change to a file that the user reviews and applies or rejects) and **inline suggestions**. These are surfaced by `<AIEditPreview>` and `<AISuggestionWidget>` respectively (below). The relevant store functions are `startEditSession`, `completeEditSession`, `resolveEditSession`, `updateEditSession`, and `addSuggestion` / `removeSuggestion` / `clearSuggestions`.

---

## Message rendering components

You normally let `<AIPanel>` compose these, but each is exported from `@nocturnium/svelte-ide/components/ai` so you can build a custom chat UI.

### `<AIMessage>`

Renders a single `AIMessage` — avatar, role label, relative timestamp, body, any tool calls, tool-result badge, and metadata (model / tokens / latency). User and assistant messages are styled distinctly; errors render an inline error block.

```svelte
<script lang="ts">
	import { AIMessage } from '@nocturnium/svelte-ide/components/ai';
	import type { AIMessage as AIMessageType } from '@nocturnium/svelte-ide/types';

	let { message }: { message: AIMessageType } = $props();
</script>

<AIMessage
	{message}
	showActions
	onCopy={(m) => navigator.clipboard.writeText(m.content)}
	onRetry={(m) => {
		/* re-send */
	}}
/>
```

Props: `message` (required), `showActions` (default `true`), and the optional callbacks `onCopy`, `onEdit`, `onRetry`, `onDelete`, `onBranch` — each receives the `AIMessage`. (`onEdit` is only wired for user messages.)

### `<AIMessageContent>` and the HTML-safety model

`<AIMessageContent>` renders the body of a message. It splits the text into fenced code blocks, inline code, and prose; code blocks are syntax-highlighted with the library's own tokenizer (see [Syntax highlighting](syntax-highlighting.md)) and get a copy button.

```svelte
<script lang="ts">
	import { AIMessageContent } from '@nocturnium/svelte-ide/components/ai';
</script>

<AIMessageContent content={message.content} isStreaming={message.isStreaming} />
```

Props: `content` (required `string`) and `isStreaming` (default `false`, which adds a blinking cursor).

**Safety.** Model output is untrusted text, and this component is the only place the library renders model output as HTML. It defends in two layers:

1. **HTML is escaped first.** Before any formatting is applied, `&`, `<`, `>`, `"`, and `'` are replaced with entities, so raw markup in the model's reply is shown as literal text and never interpreted as DOM. Only a small, fixed set of inline elements the component generates itself (`<strong>`, `<em>`, links, `<br>`) is re-introduced afterward.
2. **Link schemes are whitelisted.** Markdown links are only emitted as `<a>` when the href is a relative/anchor URL (`/…`, `#…`, `./…`, `../…`) or uses `http:`, `https:`, or `mailto:`. Anything else (`javascript:`, `data:`, `vbscript:`, …) degrades to plain text. Emitted links always carry `target="_blank" rel="noopener noreferrer"`.

This protects against markup injected _through_ the model's response. It does **not** establish trust in the endpoint itself — you still own the security of the backend you point `endpoint` at (authentication, what the model is allowed to return, and any tool side effects). Treat the chat backend as part of your trust boundary.

### `<AIToolCallDisplay>`

A collapsible card for a single `AIToolCall`: tool name, a status badge, optional duration, and — when expanded — the arguments, result (truncated past ~500 chars with a "Show full" toggle), error, and timing.

```svelte
<script lang="ts">
	import { AIToolCallDisplay } from '@nocturnium/svelte-ide/components/ai';
	import type { AIToolCall } from '@nocturnium/svelte-ide/types';

	let { toolCall }: { toolCall: AIToolCall } = $props();
</script>

<AIToolCallDisplay {toolCall} status="completed" result={{ ok: true }} duration={1240} />
```

Props: `toolCall` (required), `status` (`'pending' | 'running' | 'completed' | 'error'`, default `'completed'`), and the optional `result`, `error`, `duration` (ms), `startedAt` (`Date`).

### `<AIMessageActions>` and `<AIConversationList>`

`<AIMessageActions>` is the per-message action row (copy / edit / retry / branch / delete) used inside `<AIMessage>`. `<AIConversationList>` is the sidebar used inside `<AIPanel>` (select, new, rename, star, export, delete). Both are exported if you want to reuse them in a custom layout.

---

## Edit and suggestion widgets

### `<AIEditPreview>`

Shows a proposed file edit from an `AIEditSession` — file path, a diff, a status badge, and Apply / Reject buttons while the session is in the `reviewing` state. Apply/Reject call `resolveEditSession` on the store for you.

```svelte
<script lang="ts">
	import { AIEditPreview } from '@nocturnium/svelte-ide/components/ai';
	import type { AIEditSession } from '@nocturnium/svelte-ide/types';

	let { session }: { session: AIEditSession } = $props();
</script>

<AIEditPreview {session} />
```

Props: `session` (required), `class`. The buttons only appear when `session.status === 'reviewing'`.

### `<AIInlineEdit>`

A floating prompt box for an "edit this selection" flow. It collects an instruction (with the selected code shown for context) and hands the prompt to your `onSubmit` callback. Submit with Cmd/Ctrl+Enter, cancel with Escape.

```svelte
<script lang="ts">
	import { AIInlineEdit } from '@nocturnium/svelte-ide/components/ai';
</script>

<AIInlineEdit
	selection={selectedText}
	initialPrompt=""
	onSubmit={async (prompt) => {
		await requestEdit(prompt, selectedText);
	}}
	onCancel={() => (editing = false)}
/>
```

Props: `onSubmit` (required, `(prompt: string) => Promise<void>`), `onCancel` (required, `() => void`), `initialPrompt`, `selection`, `class`. `onSubmit` is awaited and a spinner is shown while it runs.

### `<AISuggestionWidget>`

A compact card for an inline `AISuggestion` (completion / refactor / fix / explain) with a preview, optional confidence percentage, and Accept / Dismiss buttons.

```svelte
<script lang="ts">
	import { AISuggestionWidget } from '@nocturnium/svelte-ide/components/ai';
	import type { AISuggestion } from '@nocturnium/svelte-ide/types';

	let { suggestion }: { suggestion: AISuggestion } = $props();
</script>

<AISuggestionWidget
	{suggestion}
	onAccept={() => applySuggestion(suggestion)}
	onDismiss={() => dismiss(suggestion.id)}
/>
```

Props: `suggestion` (required), `onAccept` (required, `() => void`), `onDismiss` (required, `() => void`), `class`.

---

## Multi-agent presence

The agent components visualize _other_ actors in the workspace. They are pure presentation: you feed them `Agent` objects (and activities/cursors), and they render avatars, panels, bars, and remote cursors. Where the agent state comes from — a websocket, the `agents` store, your own polling — is up to you. The agents store (also under `/stores`) provides reactive state and mutators (`addAgent`, `updateAgent`, `setAgentStatus`, `setAgentTask`, `updateAgentProgress`, `getFilteredAgents`, …) if you want a ready-made source.

All four components are imported from `@nocturnium/svelte-ide/components/agents`, and the types from `@nocturnium/svelte-ide/types`.

### The `Agent` model

```ts
import type { Agent, AgentStatus, AgentType } from '@nocturnium/svelte-ide/types';

// AgentStatus: 'online' | 'offline' | 'busy' | 'error' | 'stalled'
// AgentType:   'coder' | 'reviewer' | 'tester' | 'architect' | 'coordinator'

const agent: Agent = {
	id: 'agent-1',
	name: 'Refactor Bot',
	type: 'coder',
	status: 'busy',
	capabilities: ['code_generation', 'refactoring'],
	workspaceId: 'ws-1',
	joinedAt: new Date().toISOString(),
	lastActivity: new Date().toISOString(),
	color: '#7c5cff', // used for this agent's remote cursor
	currentTask: {
		id: 'task-1',
		description: 'Extract helper from app.ts',
		startedAt: new Date().toISOString(),
		files: ['src/app.ts'],
		progress: {
			phase: 'implementing', // 'planning' | 'implementing' | 'testing' | 'reviewing' | 'complete'
			percentage: 60,
			tokensUsed: 1820,
			stepsCompleted: 3,
			toolCalls: 7,
			filesModified: 1,
			lastUpdate: new Date().toISOString()
		}
	}
};
```

The full set of agent types (`Agent`, `AgentTask`, `AgentProgress`, `AgentActivity`, `AgentCursor`, the `TeamEvent` union, `AgentFilter`, `AgentViewMode`, and the capability/status/type enums) is documented in the [Types & utils reference](../api/types-and-utils.md).

### `<AgentAvatar>`

An avatar with a status ring, a work-progress ring (for `busy` agents with a task), and a role badge. AI-type agents (`coder` / `reviewer` / `tester` / `architect`) get a distinct treatment.

```svelte
<script lang="ts">
	import { AgentAvatar } from '@nocturnium/svelte-ide/components/agents';
</script>

<AgentAvatar {agent} size="md" showStatus showBadge showProgress />
```

Props: `agent` (required); `size` (`'xs' | 'sm' | 'md' | 'lg' | 'xl'`, default `'md'`); booleans `showStatus`, `showBadge`, `showProgress` (default `true`) and `showPhase` (default `false`, renders a "Coding…/Testing…" label below the avatar); `class`.

### `<AgentPresenceBar>`

A compact, stacked row (or column) of the online/busy agents, with an overflow count and a working/stalled summary. Good for an activity bar or header.

```svelte
<script lang="ts">
	import { AgentPresenceBar } from '@nocturnium/svelte-ide/components/agents';
</script>

<AgentPresenceBar
	{agents}
	maxVisible={5}
	orientation="horizontal"
	onAgentClick={(a) => select(a.id)}
	onExpand={() => openPanel()}
/>
```

Props: `agents` (required `Agent[]`); `maxVisible` (default `5`); `orientation` (`'horizontal' | 'vertical'`, default `'horizontal'`); `expandable` (default `true`); callbacks `onExpand` and `onAgentClick(agent)`; `class`. Only agents whose status is `online` or `busy` are shown.

### `<AgentActivityPanel>`

A full panel: filterable agent grid/list, a selected-agent detail view with task progress, and a real-time activity feed. The component is controlled — selection, filter, and view mode are props with change callbacks, so you keep the state.

```svelte
<script lang="ts">
	import { AgentActivityPanel } from '@nocturnium/svelte-ide/components/agents';
	import type { AgentFilter, AgentViewMode } from '@nocturnium/svelte-ide/types';

	let selectedAgentId = $state<string | null>(null);
	let filter = $state<AgentFilter>('all'); // AgentStatus | 'all'
	let viewMode = $state<AgentViewMode>('grid'); // 'grid' | 'list' | 'compact'
</script>

<AgentActivityPanel
	{agents}
	{activities}
	{selectedAgentId}
	{filter}
	{viewMode}
	onSelectAgent={(id) => (selectedAgentId = id)}
	onFilterChange={(f) => (filter = f)}
	onViewModeChange={(m) => (viewMode = m)}
/>
```

Props: `agents` (required `Agent[]`), `activities` (required `AgentActivity[]`), `selectedAgentId` (`string | null`, default `null`), `filter` (default `'all'`), `viewMode` (default `'grid'`), the change callbacks above, and `class`.

### `<AgentCursor>`

A remote cursor overlay for collaborative editing — a colored caret, a name label (with an "AI" badge for non-coordinator agents), an optional selection highlight, and a typing animation. It is absolutely positioned, so render it inside a positioned container layered over your editor and feed it the editor's metrics.

```svelte
<script lang="ts">
	import { AgentCursor } from '@nocturnium/svelte-ide/components/agents';
	import type { CursorPosition, CursorSelection } from '@nocturnium/svelte-ide/types';

	let { agent, position }: { agent: Agent; position: CursorPosition } = $props();
</script>

<AgentCursor {agent} {position} charWidth={8} lineHeight={20} gutterWidth={50} isTyping={false} />
```

Props: `agent` (required), `position` (required `CursorPosition` — `{ line, column }`), `charWidth` (required), `lineHeight` (required); optional `selection` (`CursorSelection`), `isTyping` (default `false`), `scrollX`/`scrollY` (default `0`), `gutterWidth` (default `50`), `class`. The caret color comes from `agent.color`, falling back to a theme token.

> For human (rather than agent) real-time presence — shared cursors and selections driven by Yjs — see the CRDT [Collaboration](collaboration.md) guide, which provides its own `<CollaborativeEditor>` and presence store. `<AgentCursor>` is the lower-level overlay primitive you can drive from any source.

---

## Ghost Pair: agents in the editor

`<AgentCursor>` above is an overlay you position yourself. **Ghost Pair** is the
built-in alternative: hand the editor a list of agents and it draws them inside
the document — a ghost caret with a glow, a name-and-activity label, and an
optional shaded region showing what the agent is reading.

It is three props on `CustomEditor`, `Editor` and `EditorPane`, and all three
matter:

| Prop                 | Type            | Default | What it does                                        |
| -------------------- | --------------- | ------- | --------------------------------------------------- |
| `aiAgents`           | `AIAwareness[]` | `[]`    | The agents to draw. An empty list draws nothing.    |
| `showAILabels`       | `boolean`       | `true`  | The name-and-activity label beside each caret.      |
| `showAIFocusRegions` | `boolean`       | `false` | The shaded focus region. **Off unless you say so.** |

`showAIFocusRegions` defaulting to `false` is the one that catches people: pass
`aiAgents` alone and you get a caret and a label but no region glow, which reads
as "the focus feature is broken" rather than "the focus feature is off".

```svelte
<script lang="ts">
	import { CustomEditor } from '@nocturnium/svelte-ide';
	import { createAIAwareness } from '@nocturnium/svelte-ide/components/editor';

	let content = $state(source);

	const claude = createAIAwareness('claude-1', 'Claude', {
		attentionType: 'reading',
		activity: 'Reading processUser',
		cursor: {
			// 0-based, like every other line number in the editor API.
			position: { line: 13, column: 8 },
			color: '#a78bfa',
			visible: true,
			animation: 'thinking'
		},
		focusRegions: [
			{ startLine: 13, endLine: 24, intensity: 0.6, type: 'reading', label: 'Analyzing' }
		],
		isActive: true
	});
</script>

<CustomEditor
	bind:content
	language="typescript"
	aiAgents={[claude]}
	showAILabels
	showAIFocusRegions
/>
```

`createAIAwareness(agentId, agentName, options)` fills in sensible defaults —
a colour derived from the name, `attentionType: 'reading'`, `confidence: 0.5`,
`isActive: true` — so you only pass what you are actually driving. `attentionType`
(`reading` | `thinking` | `writing` | `reviewing` | `waiting`) picks both the
label's indicator glyph and the region's colour and animation.

Two things to know before wiring one up:

- **An agent is only drawn while `isActive` is true and it has either a visible
  cursor or at least one focus region.** An agent with neither is not an error and
  produces no output.
- **Line numbers are raw document lines, 0-based.** The editor maps them to
  rendered rows for you, so a focus region stays on its code when the user folds
  something above it.

`AIAwareness` is not re-exported from the package root. Import it, and
`createAIAwareness`, from the editor subpath:

```ts
import { createAIAwareness, type AIAwareness } from '@nocturnium/svelte-ide/components/editor';
```

There is a live version of all of this on the
[cognitive complexity demo](https://ide.nocturnium.ai/demo/cognitive-load) — the
agent there is a scripted cursor on a timer, not a model, which is exactly what
this API is: a rendering layer for presence you supply.

---

## Theming

Every component here is unstyled until the theme tokens are present. Import `@nocturnium/svelte-ide/theme.css` once, then override the `--ide-*` and `--color-nocturnium-*` custom properties to retheme. AI and agent components lean on tokens such as `--ide-agent-online`, `--ide-agent-busy`, `--ide-agent-stalled`, `--ide-agent-error`, `--ide-agent-ai-primary`, `--ide-agent-ai-secondary`, and the syntax token colors used in code blocks. See [Theming](../theming.md) for the full token list.

---

## See also

- [Getting started](../getting-started.md) — install, theme, and your first editor
- [Architecture](../architecture.md) — how the modules fit together
- [Editor guide](editor.md) — the editor components AI edits and cursors sit on top of
- [Syntax highlighting](syntax-highlighting.md) — the tokenizer that renders code blocks in messages
- [Collaboration (CRDT)](collaboration.md) — Yjs-based human presence and shared editing
- [Plugins](plugins.md) — extend the IDE with a bring-your-own backend
- [Component reference](../api/components.md) · [Stores reference](../api/stores.md) · [Types & utils](../api/types-and-utils.md)
