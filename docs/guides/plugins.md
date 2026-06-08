# Plugin System

`@nocturnium/svelte-ide` ships a **proposal-based** plugin system: extensions are not loaded from disk or a registry, they are *proposed*, reviewed, tested, and gradually rolled out before they ever run in front of a user. The library provides the client-side pieces — a reactive store that tracks proposal lifecycle, a loader for server-rendered plugin components, a best-effort sandbox, and small helpers for declaring plugin metadata. It deliberately ships **no backend**. You bring your own *plugin host*: an HTTP + Server-Sent-Events service that stores proposals, runs reviews/tests, and serves compiled plugin artifacts. Everything in this guide talks to that host over a small, fully configurable contract.

---

## Mental model

A plugin starts life as a **proposal** and moves through a lifecycle managed entirely by your host. The library never advances the lifecycle itself — it reflects the host's state (via SSE) and lets the user trigger transitions (create, submit, load) through the host's REST API.

```
draft → submitted → reviewing → approved → testing → deploying → deployed
                         │                                            │
                         └──────────────→ rejected      rolled_back ←─┘
```

These nine states are the `PluginStatus` union:

| Status        | Meaning                                                        |
| ------------- | ------------------------------------------------------------- |
| `draft`       | Created locally / on the host, not yet submitted for review.  |
| `submitted`   | Sent to the host for review.                                  |
| `reviewing`   | Host is collecting review votes/issues.                       |
| `approved`    | Review passed; cleared to enter testing.                      |
| `testing`     | Host is running the proposal's test cases.                    |
| `deploying`   | Host is rolling the plugin out (optionally gradually).        |
| `deployed`    | Live and loadable by clients.                                 |
| `rejected`    | Review failed; terminal.                                      |
| `rolled_back` | Was deployed, then reverted; terminal.                        |

Only `deployed` proposals can be loaded into the running editor (see [`loadPlugin`](#loading-and-unloading-deployed-plugins)).

> The library is the *thin client* of this system. Who may submit, who votes, what "approved" requires, and how rollout works are all decisions your host makes. The client simply renders proposals, opens an event stream, and POSTs the three user-driven transitions.

---

## Installation

The plugin system is part of the core package — no extra dependencies.

```bash
npm install @nocturnium/svelte-ide
```

Plugin UI components are unstyled until you load the theme once at your app root:

```js
import "@nocturnium/svelte-ide/theme.css";
```

See [Theming](../theming.md) for customizing the design tokens.

---

## The bring-your-own plugin-host contract

There is **no bundled server**. You implement these endpoints under a base path (default `/api/plugins`, same-origin). Every path below is derived from that base and can be moved by passing a different base path / endpoint to the client APIs.

| Method | Path                                       | Used by                          | Purpose |
| ------ | ------------------------------------------ | -------------------------------- | ------- |
| `GET`  | `/api/plugins/stream`                      | `connect()`                      | SSE stream of `PluginEvent`s. |
| `GET`  | `/api/plugins/proposals`                   | `fetchProposals()`               | List proposals. Returns `{ proposals: PluginProposal[] }`. |
| `POST` | `/api/plugins/proposals`                   | `createProposal()`               | Create a proposal. Returns the created `PluginProposal` (must include `id`). |
| `POST` | `/api/plugins/proposals/:id/submit`        | `submitProposal(id)`             | Move a `draft` to `submitted` for review. |
| `GET`  | `/api/plugins/plugins/:id/component?path=` | `loadPlugin()` / `loadComponent` | Return a host-compiled/SSR-rendered Svelte component for a deployed plugin. |
| `GET`  | `/api/plugins/plugins/:id/module?entry=`   | `loadModule()`                   | Execute a plugin module in the host's sandbox and return its exports. |

> The repeated `plugins/plugins/...` segment is intentional: the component/module routes live under `<apiBase>/plugins/:id/...`, and the default `apiBase` is already `/api/plugins`.

### The SSE stream

`connect()` opens an [`EventSource`](https://developer.mozilla.org/docs/Web/API/EventSource) to the stream endpoint. Each message's `data` field must be JSON that parses into a `PluginEvent`:

```ts
interface PluginEvent {
  id: string;
  proposalId: string;
  type: PluginEventType;
  actor: string;
  details: Record<string, unknown>;
  occurredAt: Date;
}

type PluginEventType =
  | 'created'      | 'submitted'      | 'review_started'
  | 'vote_cast'    | 'consensus'      | 'testing_started'
  | 'test_completed' | 'approved'     | 'rejected'
  | 'deploying'    | 'rollout_step'   | 'deployed'
  | 'rolled_back'  | 'feedback';
```

The store reacts to these automatically:

- `created` → re-fetches the full proposal list.
- `submitted`, `review_started`, `approved`, `rejected`, `testing_started`, `deploying`, `deployed`, `rolled_back` → patch the matching proposal's `status` in place (`review_started` maps to `reviewing`, `testing_started` maps to `testing`).
- `vote_cast`, `test_completed`, `rollout_step`, `consensus`, `feedback` → no built-in state change, but you can observe them (see [`onPluginEvent`](#observing-raw-events)).

A minimal host SSE frame looks like:

```
data: {"id":"evt_1","proposalId":"p_42","type":"deployed","actor":"ci","details":{},"occurredAt":"2026-06-07T12:00:00Z"}

```

### Request/response shapes

`GET /api/plugins/proposals` must return:

```json
{ "proposals": [ /* PluginProposal[] */ ] }
```

`POST /api/plugins/proposals` receives the proposal *without* server-managed fields (the client omits `id`, `version`, `status`, `votes`, `issues`, `createdAt`, `updatedAt`) and must return the full created `PluginProposal`, including a generated `id`. A `PluginProposal` looks like:

```ts
interface PluginProposal {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;     // 'file_ops' | 'http' | 'analysis' | 'transform'
                                // | 'validation' | 'utility' | 'integration'
                                // | 'ui' | 'editor' | 'ai'
  tags: string[];
  version: number;
  status: PluginStatus;
  author: string;
  parameters: PluginParameters;       // JSON-Schema-ish parameter spec
  implementation: PluginImplementation;
  testCases: PluginTestCase[];
  votes: PluginVote[];                // collected during review
  issues: PluginIssue[];              // found during review
  metrics?: PluginMetrics;            // post-deploy
  rolloutState?: PluginRolloutState;  // gradual rollout progress
  createdAt: Date;
  updatedAt: Date;
  deployedAt?: Date;
}
```

The `implementation` tells the client (and host) how the plugin runs:

```ts
interface PluginImplementation {
  type: 'component' | 'module' | 'action' | 'provider';
  componentPath?: string;   // for SSR-rendered components
  moduleCode?: string;      // for JS modules
  entryPoint?: string;      // entry function name for modules
  dependencies?: string[];
  permissions?: PluginPermission[];
}
```

`PluginPermission` is a closed set: `filesystem:read`, `filesystem:write`, `network:fetch`, `editor:read`, `editor:write`, `ai:invoke`, `ui:render`, `storage:local`, `storage:sync`.

The full type surface (`PluginParameters`, `PluginTestCase`, `PluginVote`, `PluginIssue`, `PluginMetrics`, `PluginRolloutState`, `PluginManifest`, etc.) is documented in [Types & utilities](../api/types-and-utils.md) and exported from `@nocturnium/svelte-ide/types`.

---

## Driving the lifecycle from the store

The plugin store is a Svelte 5 runes module. Import the actions and reactive accessors from the package's stores entry point (also re-exported from the root):

```ts
import {
  connect,
  disconnectPlugins,
  fetchProposals,
  createProposal,
  submitProposal,
  loadPlugin,
  unloadPlugin,
  onPluginEvent,
  // reactive accessors (see "Reactive accessors" below)
  proposals,
  draftProposals,
  reviewingProposals,
  deployedProposals,
  instances,
  activeInstances,
  commands,
  panels,
  connected,
  loadingProposals,
  loadingInstance,
  pluginError
} from "@nocturnium/svelte-ide/stores";
```

> Several names are aliased on the stores entry point to avoid clashing with other stores: `disconnect` → `disconnectPlugins`, `onEvent` → `onPluginEvent`, `error` → `pluginError`, and `clearError` → `clearPluginError`. Inside the store module the originals keep their plain names.

### Connecting and listing

Open the event stream and load the current proposals — typically once when your plugin UI mounts:

```svelte
<script lang="ts">
  import {
    connect,
    disconnectPlugins,
    fetchProposals,
    proposals,
    connected
  } from "@nocturnium/svelte-ide/stores";

  $effect(() => {
    connect();            // defaults to /api/plugins/stream
    fetchProposals();     // GET /api/plugins/proposals
    return () => disconnectPlugins();
  });
</script>

{#if connected.current}<span>Live</span>{/if}

<ul>
  {#each proposals.current as p (p.id)}
    <li>{p.name} — {p.status}</li>
  {/each}
</ul>
```

`connect()` accepts a custom endpoint if your host serves SSE elsewhere:

```ts
connect("/my/host/plugins/events");
```

### Creating and submitting a proposal

`createProposal()` POSTs to `/api/plugins/proposals`. You pass everything *except* the server-managed fields; the host fills those in and returns the created proposal. The call resolves to the new proposal's `id`, or `null` on failure (with the error surfaced on `pluginError.current`).

```ts
import { createProposal, submitProposal } from "@nocturnium/svelte-ide/stores";

const id = await createProposal({
  name: "uppercase-selection",
  description: "Uppercases the current editor selection.",
  category: "editor",
  tags: ["text", "transform"],
  author: "you@example.com",
  parameters: { type: "object", properties: {} },
  implementation: {
    type: "module",
    moduleCode: "",
    permissions: ["editor:read", "editor:write"]
  },
  testCases: []
});

if (id) {
  await submitProposal(id); // POST /api/plugins/proposals/:id/submit
}
```

`submitProposal(id)` optimistically flips the local status to `submitted` and resolves to `true`/`false`. From there the host drives the rest of the lifecycle and pushes `PluginEvent`s; the store keeps each proposal's `status` in sync as those events arrive.

### Loading and unloading deployed plugins

A plugin can only be loaded once the host reports it `deployed`. `loadPlugin(id)`:

1. Verifies the proposal exists and is `deployed` (otherwise sets `pluginError` and returns `false`).
2. For `component` implementations, fetches the host-rendered component via `GET /api/plugins/plugins/:id/component?path=<componentPath>`.
3. Creates a `PluginInstance` (`status: 'active'`) and registers its contributions.

```ts
import { loadPlugin, unloadPlugin, activeInstances } from "@nocturnium/svelte-ide/stores";

await loadPlugin("p_42");      // instance becomes 'active' (or 'error' with .error set)
// ...
unloadPlugin("p_42");          // disposes the instance and removes its commands/panels
```

`activeInstances.current` lists the live plugins; `instances.current` lists all loaded instances regardless of status (`inactive` | `activating` | `active` | `error`).

### Observing raw events

For event types the store doesn't fold into state (votes, test results, rollout steps), subscribe directly. `onPluginEvent` returns an unsubscribe function; pass `'*'` to observe everything.

```ts
import { onPluginEvent } from "@nocturnium/svelte-ide/stores";

const off = onPluginEvent("vote_cast", (event) => {
  console.log(`${event.actor} voted on ${event.proposalId}`, event.details);
});

const offAll = onPluginEvent("*", (event) => {
  console.log("plugin event:", event.type);
});

// later
off();
offAll();
```

### Commands and panels

Plugins contribute commands and panels. The store namespaces every contribution under its plugin id (`<pluginId>:<id>`), so unloading a plugin cleanly removes its contributions.

```ts
import { registerCommand, registerPanel, executeCommand } from "@nocturnium/svelte-ide/stores";

registerCommand("p_42", {
  id: "run",                       // stored as "p_42:run"
  title: "Run uppercase",
  handler: () => { /* ... */ }
});

registerPanel("p_42", {
  id: "output",                    // stored as "p_42:output"
  title: "Plugin Output",
  position: "bottom",
  component: "OutputPanel"
});

await executeCommand("p_42:run");  // invokes the registered handler
```

### Reactive accessors

Svelte 5 module scripts cannot export `$derived` values directly, so the store exposes its reactive state as `{ current }` accessor objects. Read `.current` in your markup or `$derived`:

| Accessor                    | `.current` returns                                  |
| --------------------------- | --------------------------------------------------- |
| `proposals`                 | all `PluginProposal[]`                              |
| `draftProposals`            | proposals with `status === 'draft'`                 |
| `reviewingProposals`        | proposals with `status === 'reviewing'`             |
| `deployedProposals`         | proposals with `status === 'deployed'`              |
| `instances`                 | all loaded `PluginInstance[]`                        |
| `activeInstances`           | instances with `status === 'active'`                |
| `commands`                  | registered `PluginCommand[]`                         |
| `panels`                    | registered `PluginPanel[]`                           |
| `connected`                 | `boolean` — SSE connection state                    |
| `loadingProposals`          | `boolean` — list fetch in flight                    |
| `loadingInstance`           | proposal id currently loading, or `null`            |
| `pluginError`               | last error message, or `null`                       |

Imperative lookups are also available: `getProposal(id)` and `getInstance(id)` return a single item (or `undefined`), and `clearPluginError()` resets the error.

```svelte
<script lang="ts">
  import { deployedProposals, loadPlugin } from "@nocturnium/svelte-ide/stores";
</script>

{#each deployedProposals.current as p (p.id)}
  <button onclick={() => loadPlugin(p.id)}>Install {p.name}</button>
{/each}
```

---

## The plugin loader

`createPluginLoader` is a thin client over the host's component/module endpoints. It is independent of the store — use it when you want to fetch artifacts yourself. Import it from the package's `plugins` entry point:

```ts
import { createPluginLoader } from "@nocturnium/svelte-ide/plugins";

const loader = createPluginLoader();          // base: /api/plugins
// const loader = createPluginLoader("/my/host"); // custom base path

const { default: Component } = await loader.loadComponent("p_42", "src/Panel.svelte");
const exports = await loader.loadModule("p_42", "main");
```

- `loadComponent(proposalId, componentPath)` → `GET <base>/plugins/:id/component?path=...`, expects the host to return a compiled Svelte component as JSON (`{ default: ... }`).
- `loadModule(proposalId, entryPoint)` → `GET <base>/plugins/:id/module?entry=...`, expects the host to execute the module in *its* sandbox and return the exports as JSON.

Both throw on a non-2xx response. The host is responsible for compilation and for whatever real isolation it enforces server-side.

---

## Running untrusted plugin code

This library deliberately ships **no** client-side sandbox. An earlier
`createSandbox` helper evaluated plugin code with `new Function(...)` in the app's
own realm; it was removed in v1.0.0 because in-realm evaluation is not a real
security boundary and only invited a false sense of safety.

To run untrusted plugin code safely, keep it out of your app's realm entirely:

- **Run it on the host, out of band.** Fetch the result with `loadModule` (above);
  the plugin host executes the module in an environment *you* control and returns
  only its JSON output — no untrusted code ever reaches the browser.
- **Isolate it in the browser** with an `<iframe sandbox>` or a Web Worker (ideally
  cross-origin) and communicate over `postMessage`. Code running there cannot touch
  your DOM, cookies, or module scope.

Either way, treat plugin source as untrusted input: validate the *contract* of what
comes back, never trust the code itself.

---

## Declaring plugin metadata

Three identity helpers give you typed, no-op wrappers for authoring manifests and contributions. They simply return their argument with the right type — handy for `definePlugin`-style authoring with autocompletion. Import them from the `plugins` entry point:

```ts
import { definePlugin, defineCommand, definePanel } from "@nocturnium/svelte-ide/plugins";

export const manifest = definePlugin({
  name: "uppercase-selection",
  version: "1.0.0",
  description: "Uppercases the current editor selection.",
  author: "you@example.com",
  category: "editor",
  tags: ["text", "transform"],
  permissions: ["editor:read", "editor:write"]
});

export const runCommand = defineCommand({
  id: "run",
  title: "Uppercase selection",
  handler: () => { /* ... */ }
});

export const outputPanel = definePanel({
  id: "output",
  title: "Output",
  position: "bottom",
  component: "OutputPanel"
});
```

- `definePlugin(manifest: PluginManifest)` → `PluginManifest`
- `defineCommand(command)` → `PluginCommand` (`id` required)
- `definePanel(panel)` → `PluginPanel` (`id` required)

There is also a module-level `pluginRegistry` (an instance of an internal `PluginRegistry`) exported from `@nocturnium/svelte-ide/plugins` for managing plugin instances, commands, and panels imperatively outside the store — `register`, `unregister`, `get`, `getAll`, `registerCommand`, `executeCommand`, `getCommands`, `registerPanel`, `getPanels`, and `getPanelsByPosition`.

---

## Prebuilt UI components

The package ships ready-made plugin UI, importable from `@nocturnium/svelte-ide/components/plugins` (or the root). These are wired to the store described above.

```svelte
<script lang="ts">
  import { PluginPanel } from "@nocturnium/svelte-ide/components/plugins";
</script>

<PluginPanel />
```

| Component             | Purpose                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `PluginPanel`         | Full extensions panel: Installed / Available / Proposals tabs, live SSE badge, create flow. It calls `connect()` + `fetchProposals()` on mount and `disconnect()` on cleanup. Takes an optional `class`. |
| `PluginCard`          | A single proposal/instance row with install / uninstall actions and an optional status badge. Takes `plugin`, `installed`, `showStatus`, `onInstall`, and `onUninstall`. |
| `PluginProposalForm`  | Modal form that gathers name, description, category, tags, and author, then calls `createProposal()`. Takes an `onClose` prop. |
| `PluginStatusBadge`   | Small badge that renders a `PluginStatus` as a humanized label. Takes `status` (and optional `class`). |

`PluginPanel` is the fastest way to get a working plugin browser: drop it into a [layout](./editor.md) panel, point your host at `/api/plugins`, and it handles connection, listing, creating, installing, and uninstalling out of the box.

See [Component reference](../api/components.md) for full prop tables.

---

## Putting it together: a host checklist

To make the plugin system live, your backend must:

1. **Stream events** at `GET /api/plugins/stream` as SSE, emitting `PluginEvent` JSON whenever a proposal's state changes.
2. **List proposals** at `GET /api/plugins/proposals` as `{ proposals: [...] }`.
3. **Accept new proposals** at `POST /api/plugins/proposals`, returning the created `PluginProposal` with a generated `id`.
4. **Accept submissions** at `POST /api/plugins/proposals/:id/submit`.
5. **Run review, testing, and rollout** however you like, advancing `status` and emitting the matching events (`review_started`, `approved`/`rejected`, `testing_started`/`test_completed`, `deploying`/`rollout_step`/`deployed`, `rolled_back`).
6. **Serve artifacts** for deployed plugins at `GET /api/plugins/plugins/:id/component` and `/module`, returning JSON the loader can consume.

The library handles the rest: reactive state, optimistic transitions, event reconciliation, the loader, the sandbox guard, and the UI.

---

## Related guides

- [Architecture overview](../architecture.md) — where the plugin system sits in the module map.
- [Stores reference](../api/stores.md) — every exported store accessor and action.
- [Services reference](../api/services.md) — the other backend-facing clients (VFS, LSP, AI).
- [Types & utilities](../api/types-and-utils.md) — the full plugin type surface.
- [Component reference](../api/components.md) — props for `PluginPanel`, `PluginCard`, and friends.
- [AI & agents](./ai-and-agents.md) and [LSP](./lsp.md) — other bring-your-own-backend integrations that follow the same pattern.
