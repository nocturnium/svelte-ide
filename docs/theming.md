# Theming

`@nocturnium/svelte-ide` ships its entire visual identity as a single stylesheet of CSS custom properties (design tokens). The components themselves render structurally — backgrounds, text colors, borders, syntax highlighting, agent cursors, plugin badges, and layout sizes all read from tokens defined on `:root`. Import the theme once and you get the built-in dark "Nocturnium" look; override any token in your own CSS (loaded afterward) to retheme without forking. This guide walks through importing the theme, the full token catalog, how to build a custom or light theme, and the editor's programmatic syntax-theme exports.

## Importing the theme

The components are **unstyled without the design tokens**. Import the shipped theme once, near your app's entry point:

```js
import '@nocturnium/svelte-ide/theme.css';
```

In a SvelteKit app, the natural home for this is your root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import '@nocturnium/svelte-ide/theme.css';
</script>

<slot />
```

This single file defines all tokens, the animation `@keyframes`, and a small set of opt-in `.ide-*` helper classes (cursor styles, plugin status badges, agent presence rings, lock badges). It deliberately does **not** apply global `html`/`body`/`*` resets, so it won't fight your application's base styles.

> The theme source lives at `src/lib/styles/theme.css` in the repository if you want to read the canonical values.

## How tokens work

Every token is a CSS variable on `:root`. There are two prefixes:

- `--color-nocturnium-*` — the raw brand palette (the "paint").
- `--ide-*` — semantic tokens consumed by the components. Most `--ide-*` color tokens are defined in terms of the brand palette (e.g. `--ide-bg-primary: var(--color-nocturnium-night)`).

Because everything cascades from these variables, you retheme by **redefining tokens after** importing `theme.css`. Override the brand palette to recolor everything at once, or override individual `--ide-*` tokens for surgical changes.

## Token catalog

### Brand palette

The base colors everything else derives from.

| Token | Default |
| --- | --- |
| `--color-nocturnium-night` | `#0d1421` |
| `--color-nocturnium-deep` | `#1a2744` |
| `--color-nocturnium-ocean` | `#2d5a7b` |
| `--color-nocturnium-wave` | `#4a8db7` |
| `--color-nocturnium-foam` | `#a8c5d9` |
| `--color-nocturnium-ember` | `#d4793a` |
| `--color-nocturnium-flame` | `#e9a456` |
| `--color-nocturnium-moon` | `#f4f1e0` |
| `--color-nocturnium-glow` | `#fffdf5` |
| `--color-nocturnium-aurora-blue` | `#60a5fa` |
| `--color-nocturnium-aurora-purple` | `#a78bfa` |
| `--color-nocturnium-aurora-green` | `#4ade80` |
| `--color-nocturnium-aurora-yellow` | `#facc15` |
| `--color-nocturnium-aurora-pink` | `#f472b6` |

### Surfaces

Backgrounds for panels, hovers, and active states.

| Token | Default |
| --- | --- |
| `--ide-bg-primary` | `var(--color-nocturnium-night)` |
| `--ide-bg-secondary` | `var(--color-nocturnium-deep)` |
| `--ide-bg-tertiary` | `var(--color-nocturnium-ocean)` |
| `--ide-bg-elevated` | `color-mix(in srgb, var(--ide-bg-secondary) 90%, white 10%)` |
| `--ide-bg-hover` | `color-mix(in srgb, var(--ide-bg-tertiary) 50%, transparent)` |
| `--ide-bg-active` | `var(--ide-bg-tertiary)` |

### Text

| Token | Default |
| --- | --- |
| `--ide-text-primary` | `var(--color-nocturnium-moon)` |
| `--ide-text-secondary` | `var(--color-nocturnium-foam)` |
| `--ide-text-muted` | `color-mix(in srgb, var(--ide-text-secondary) 60%, transparent)` |
| `--ide-text-accent` | `var(--color-nocturnium-ember)` |
| `--ide-text-inverse` | `var(--color-nocturnium-night)` |

### Interactive

States for buttons, links, and focus rings.

| Token | Default |
| --- | --- |
| `--ide-interactive` | `var(--color-nocturnium-wave)` |
| `--ide-interactive-hover` | `var(--color-nocturnium-flame)` |
| `--ide-interactive-active` | `var(--color-nocturnium-ember)` |
| `--ide-interactive-focus` | `var(--color-nocturnium-aurora-blue)` |

### Semantic

Status colors shared across the UI.

| Token | Default |
| --- | --- |
| `--ide-success` | `var(--color-nocturnium-aurora-green)` |
| `--ide-warning` | `var(--color-nocturnium-aurora-yellow)` |
| `--ide-error` | `#ef4444` |
| `--ide-info` | `var(--color-nocturnium-aurora-blue)` |

### AI panel

Used by the AI chat surface (see [AI and Agents](./guides/ai-and-agents.md)).

| Token | Default |
| --- | --- |
| `--ide-ai-user` | `var(--color-nocturnium-ocean)` |
| `--ide-ai-assistant` | `var(--color-nocturnium-aurora-purple)` |
| `--ide-ai-system` | `var(--color-nocturnium-deep)` |
| `--ide-ai-thinking` | `var(--color-nocturnium-aurora-blue)` |
| `--ide-ai-tool` | `var(--color-nocturnium-aurora-green)` |

### Plugin status

Drives the `.ide-plugin-status--*` badge classes (see [Plugins](./guides/plugins.md)).

| Token | Default |
| --- | --- |
| `--ide-plugin-draft` | `var(--ide-text-muted)` |
| `--ide-plugin-reviewing` | `var(--color-nocturnium-aurora-yellow)` |
| `--ide-plugin-approved` | `var(--color-nocturnium-aurora-green)` |
| `--ide-plugin-rejected` | `var(--ide-error)` |
| `--ide-plugin-deploying` | `var(--color-nocturnium-aurora-blue)` |
| `--ide-plugin-deployed` | `var(--color-nocturnium-aurora-green)` |

### Collaboration (CRDT)

Cursor colors for realtime collaborators (see [Collaboration](./guides/collaboration.md)).

| Token | Default |
| --- | --- |
| `--ide-collab-cursor-1` | `var(--color-nocturnium-aurora-blue)` |
| `--ide-collab-cursor-2` | `var(--color-nocturnium-aurora-purple)` |
| `--ide-collab-cursor-3` | `var(--color-nocturnium-aurora-green)` |
| `--ide-collab-cursor-4` | `var(--color-nocturnium-aurora-pink)` |
| `--ide-collab-cursor-5` | `var(--color-nocturnium-aurora-yellow)` |
| `--ide-collab-ai` | `var(--color-nocturnium-ember)` |

### Agents

Presence, type, lock, transaction, and progress tokens used by agent and VFS components.

**Agent status & type**

| Token | Default |
| --- | --- |
| `--ide-agent-online` | `var(--color-nocturnium-aurora-green)` |
| `--ide-agent-busy` | `var(--color-nocturnium-aurora-yellow)` |
| `--ide-agent-offline` | `var(--ide-text-muted)` |
| `--ide-agent-error` | `var(--ide-error)` |
| `--ide-agent-stalled` | `var(--color-nocturnium-aurora-pink)` |
| `--ide-agent-human` | `var(--color-nocturnium-aurora-blue)` |
| `--ide-agent-ai-primary` | `var(--color-nocturnium-ember)` |
| `--ide-agent-ai-secondary` | `var(--color-nocturnium-aurora-purple)` |
| `--ide-agent-system` | `var(--color-nocturnium-ocean)` |

**Lock status**

| Token | Default |
| --- | --- |
| `--ide-lock-owned` | `var(--color-nocturnium-aurora-green)` |
| `--ide-lock-other` | `var(--color-nocturnium-aurora-yellow)` |
| `--ide-lock-pending` | `var(--color-nocturnium-aurora-blue)` |
| `--ide-lock-expired` | `var(--ide-text-muted)` |
| `--ide-lock-conflict` | `var(--ide-error)` |

**Transaction status**

| Token | Default |
| --- | --- |
| `--ide-transaction-staged` | `var(--color-nocturnium-aurora-blue)` |
| `--ide-transaction-pending` | `var(--color-nocturnium-aurora-yellow)` |
| `--ide-transaction-committed` | `var(--color-nocturnium-aurora-green)` |
| `--ide-transaction-failed` | `var(--ide-error)` |

**Progress & glow effects**

| Token | Default |
| --- | --- |
| `--ide-progress-track` | `var(--ide-bg-tertiary)` |
| `--ide-progress-fill` | `var(--color-nocturnium-wave)` |
| `--ide-progress-stalled` | `var(--color-nocturnium-aurora-pink)` |
| `--ide-agent-glow` | `0 0 12px color-mix(in srgb, var(--ide-agent-ai-primary) 40%, transparent)` |
| `--ide-lock-glow` | `0 0 8px color-mix(in srgb, var(--ide-lock-other) 30%, transparent)` |

### Borders & shadows

| Token | Default |
| --- | --- |
| `--ide-border` | `color-mix(in srgb, var(--ide-text-secondary) 20%, transparent)` |
| `--ide-border-focus` | `var(--ide-interactive)` |
| `--ide-border-error` | `var(--ide-error)` |
| `--ide-shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.3)` |
| `--ide-shadow-md` | `0 4px 6px rgba(0, 0, 0, 0.4)` |
| `--ide-shadow-lg` | `0 10px 15px rgba(0, 0, 0, 0.5)` |
| `--ide-shadow-xl` | `0 20px 25px rgba(0, 0, 0, 0.6)` |

### Typography

| Token | Default |
| --- | --- |
| `--ide-font-sans` | `'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| `--ide-font-mono` | `'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Monaco, 'Courier New', monospace` |
| `--ide-font-size-xs` | `0.75rem` |
| `--ide-font-size-sm` | `0.875rem` |
| `--ide-font-size-base` | `1rem` |
| `--ide-font-size-lg` | `1.125rem` |
| `--ide-font-size-xl` | `1.25rem` |
| `--ide-line-height-tight` | `1.25` |
| `--ide-line-height-normal` | `1.5` |
| `--ide-line-height-relaxed` | `1.75` |

### Spacing

| Token | Default |
| --- | --- |
| `--ide-spacing-xs` | `0.25rem` |
| `--ide-spacing-sm` | `0.5rem` |
| `--ide-spacing-md` | `1rem` |
| `--ide-spacing-lg` | `1.5rem` |
| `--ide-spacing-xl` | `2rem` |
| `--ide-spacing-2xl` | `3rem` |

### Radii

| Token | Default |
| --- | --- |
| `--ide-radius-sm` | `0.25rem` |
| `--ide-radius-md` | `0.375rem` |
| `--ide-radius-lg` | `0.5rem` |
| `--ide-radius-xl` | `0.75rem` |
| `--ide-radius-full` | `9999px` |

### Transitions

| Token | Default |
| --- | --- |
| `--ide-transition-fast` | `100ms ease` |
| `--ide-transition-normal` | `200ms ease` |
| `--ide-transition-slow` | `300ms ease` |
| `--ide-transition-bounce` | `300ms cubic-bezier(0.68, -0.55, 0.265, 1.55)` |

### Z-index scale

| Token | Default |
| --- | --- |
| `--ide-z-base` | `0` |
| `--ide-z-dropdown` | `100` |
| `--ide-z-sticky` | `200` |
| `--ide-z-overlay` | `300` |
| `--ide-z-modal` | `400` |
| `--ide-z-popover` | `500` |
| `--ide-z-tooltip` | `600` |
| `--ide-z-notification` | `700` |

### Layout sizes

Dimensions used by the [editor and layout](./guides/editor.md) components (activity bar, sidebar, panels, status bar, tabs).

| Token | Default |
| --- | --- |
| `--ide-activity-bar-width` | `48px` |
| `--ide-sidebar-width` | `260px` |
| `--ide-sidebar-min-width` | `180px` |
| `--ide-sidebar-max-width` | `500px` |
| `--ide-panel-height` | `200px` |
| `--ide-panel-min-height` | `100px` |
| `--ide-panel-max-height` | `500px` |
| `--ide-status-bar-height` | `24px` |
| `--ide-tab-height` | `36px` |
| `--ide-header-height` | `40px` |

## Overriding tokens

Define the tokens you want to change in a stylesheet that loads **after** `theme.css`. The cascade does the rest. Because most `--ide-*` color tokens are expressed in terms of the brand palette, overriding a handful of `--color-nocturnium-*` values recolors the whole UI; override `--ide-*` tokens directly for finer control.

### Recolor the brand palette

```css
/* app.css — loaded after '@nocturnium/svelte-ide/theme.css' */
:root {
  --color-nocturnium-night: #11111b;
  --color-nocturnium-deep: #1e1e2e;
  --color-nocturnium-ocean: #313244;
  --color-nocturnium-wave: #89b4fa;
  --color-nocturnium-ember: #fab387;
  --color-nocturnium-aurora-purple: #cba6f7;
  --color-nocturnium-aurora-green: #a6e3a1;
}
```

### A complete light theme

The default theme is dark. To build a light variant, redefine the surface and text tokens (and any semantics you want softened). This example scopes the overrides to a `data-theme="light"` attribute so you can toggle it, but a plain `:root` block works too.

```css
/* app.css — loaded after '@nocturnium/svelte-ide/theme.css' */
:root[data-theme='light'] {
  /* Surfaces */
  --ide-bg-primary: #ffffff;
  --ide-bg-secondary: #f4f4f5;
  --ide-bg-tertiary: #e4e4e7;
  --ide-bg-elevated: #fafafa;
  --ide-bg-hover: color-mix(in srgb, #e4e4e7 60%, transparent);
  --ide-bg-active: #e4e4e7;

  /* Text */
  --ide-text-primary: #18181b;
  --ide-text-secondary: #3f3f46;
  --ide-text-muted: color-mix(in srgb, #3f3f46 55%, transparent);
  --ide-text-inverse: #ffffff;

  /* Interactive + borders tuned for a light background */
  --ide-interactive: #2563eb;
  --ide-interactive-hover: #1d4ed8;
  --ide-border: color-mix(in srgb, #18181b 12%, transparent);

  /* Semantic */
  --ide-success: #16a34a;
  --ide-warning: #d97706;
  --ide-error: #dc2626;
  --ide-info: #2563eb;
}
```

```html
<html data-theme="light">
  <!-- ... -->
</html>
```

Toggling `data-theme` between values (or removing it to fall back to the dark default) switches themes live, with no component re-mount required.

## The editor syntax theme

Syntax highlighting in the [custom editor](./guides/editor.md) is driven by the same token system: the editor renders each token with a `token-*` CSS class whose color rules resolve to `--color-nocturnium-*` / `--ide-*` variables. So the override techniques above re-theme syntax highlighting too — change `--color-nocturnium-aurora-purple`, for example, and keywords recolor.

Alongside the CSS, the package exports a small, typed module that describes the editor's color model programmatically. It is available from the root entry and from the editor entry:

```ts
import {
  nocturniumTheme,
  tokenColors,
  editorColors,
  getThemeCSS,
  type EditorTheme
} from '@nocturnium/svelte-ide';

// or, scoped to the editor entry:
import {
  nocturniumTheme,
  tokenColors,
  editorColors,
  getThemeCSS,
  type EditorTheme
} from '@nocturnium/svelte-ide/components/editor';
```

### What each export is

- **`tokenColors`** — a readonly object mapping syntax categories to CSS values. Each value is a `var(--...)` reference into the design tokens, so the syntax theme inherits any token override you make. Keys include `comment`, `string`, `stringTemplate`, `stringRegex`, `stringEscape`, `number`, `keyword`, `keywordControl`, `keywordDefinition`, `keywordModule`, `operator`, `variable`, `variableDefinition`, `variableParameter`, `function`, `functionCall`, `functionDefinition`, `property`, `type`, `typeClass`, `typeBuiltin`, `constant`, `constantBoolean`, `constantNull`, `punctuation`, `tag`, `tagAttribute`, `tagAttributeValue`, `markupHeading`, `markupLink`, `markupCode`, `markupQuote`, `markupList`, and `invalid`.

  ```ts
  tokenColors.keyword; // 'var(--color-nocturnium-aurora-purple)'
  tokenColors.string;  // 'var(--color-nocturnium-aurora-green)'
  ```

- **`editorColors`** — a readonly object mapping editor-chrome surfaces (background, text, cursor, selection, search match, bracket match, gutter, line numbers, active line, border) to token references. For example `editorColors.cursor` is `var(--ide-interactive)` and `editorColors.activeLine` is `var(--ide-bg-elevated)`.

- **`EditorTheme`** — the interface describing a theme object:

  ```ts
  interface EditorTheme {
    name: string;
    isDark: boolean;
    tokenColors: typeof tokenColors;
    editorColors: typeof editorColors;
  }
  ```

- **`nocturniumTheme`** — the default `EditorTheme` instance (`name: 'nocturnium'`, `isDark: true`). It is also the module's default export.

- **`getThemeCSS(theme?)`** — takes an `EditorTheme` (defaulting to `nocturniumTheme`) and returns a string of `--editor-token-*` and `--editor-*` CSS custom-property declarations derived from that theme's `tokenColors` and `editorColors`. Use it when you want to emit a flat set of editor variables into a scope you control — for instance injecting a derived theme into a `<style>` block or a container's inline style.

  ```svelte
  <script>
    import { getThemeCSS, nocturniumTheme } from '@nocturnium/svelte-ide';

    const css = getThemeCSS(nocturniumTheme);
    // → a block of "--editor-token-comment: var(--ide-text-muted); ...
    //   --editor-border: var(--ide-border);" declarations
  </script>

  <div style={css}>
    <!-- editor mounted here can read --editor-token-* / --editor-* vars -->
  </div>
  ```

Because both `tokenColors` and `editorColors` resolve through `var(--...)` references, the simplest way to retheme the editor remains overriding the underlying `--color-nocturnium-*` / `--ide-*` tokens — the programmatic exports are there for when you need the values in JS/TS or want to derive a flattened, editor-scoped variable set.

## Related guides

- [Getting Started](./getting-started.md) — install, import the theme, and render your first editor.
- [Architecture](./architecture.md) — where the styling layer fits in the module map.
- [Editor guide](./guides/editor.md) — the editor and layout components that consume layout-size tokens.
- [Syntax highlighting](./guides/syntax-highlighting.md) — the tokenizer, languages, and token classes the syntax theme colors.
- [API: Components](./api/components.md) · [Stores](./api/stores.md) · [Services](./api/services.md) · [Types & Utils](./api/types-and-utils.md)
