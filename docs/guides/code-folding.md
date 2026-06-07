# Code Folding

The editor can collapse multi-line blocks of code into a single line so you can hide detail you do not currently care about. Folding is built into the custom editor core: a set of strategies scans the document and produces a list of foldable regions, a `FoldManager` tracks which of those regions are collapsed and which lines are therefore hidden, and the editor renders fold indicators in the gutter that you can click or toggle from the keyboard. This guide covers the four folding strategies, how regions are computed and represented, how to enable and interact with folding through the editor, and the public folding API for building your own folding UI.

## Quick start

Folding is enabled by default on `CustomEditor` and `LSPEditor`. Pass `folding={false}` to turn it off.

```svelte
<script lang="ts">
  import { CustomEditor } from '@nocturnium/svelte-ide';

  let content = $state(`function greet(name) {\n  return 'Hello, ' + name;\n}`);
</script>

<CustomEditor bind:content language="javascript" folding />
```

Once enabled, lines that start a foldable region show a chevron in the gutter. Click it to collapse or expand that region. See [Interacting with folds](#interacting-with-folds) below for the keyboard shortcuts.

> Note: the higher-level `Editor` component (`<Editor>`) is a thin wrapper that does not forward a `folding` prop — it uses the editor's default behavior. To control folding explicitly, use `CustomEditor` (or `LSPEditor`). See the [Editor guide](./editor.md) for the differences between these components.

## Folding strategies

Folding is computed by running one or more strategies over the document's lines. The strategy (or strategies) used for a given document depend on its `language`:

| Strategy | `type` | What it folds | Languages |
| --- | --- | --- | --- |
| Bracket | `'bracket'` | Multi-line `{}`, `[]`, `()` blocks (string- and comment-aware) | Most languages (the default) |
| Tag | `'bracket'` | Matched HTML/XML element pairs | `html`, `xml`, `xhtml`, `svg`, plus `vue`, `svelte`, `jsx`, `tsx` (alongside brackets) |
| Indentation | `'indentation'` | Blocks defined purely by indentation | `python`, `yaml`/`yml`, `haml`, `slim`, `pug`/`jade` |
| Region | `'region'` | Explicit `#region` / `#endregion` marker pairs | All languages |
| Comment | `'comment'` | Multi-line `/* ... */` and `<!-- ... -->` comments | All languages |

A few strategies always run regardless of language (region markers and multi-line comments); the bracket/tag and indentation strategies are selected based on the language. See [`detectFoldRegions`](#detectfoldregions) for exactly how the language string maps to strategies.

### Bracket folding

For most languages the editor pairs opening and closing brackets — `{}`, `[]`, and `()` — and creates a fold from the line of the opening bracket to the line of its matching closing bracket. The scanner is aware of:

- **Strings** — `"`, `'`, and `` ` `` delimited strings are skipped, with proper backslash-escape handling, so a brace inside a string literal does not open a fold.
- **Line comments** — everything after `//` on a line is ignored.
- **Nesting** — a closing bracket only matches if it corresponds to the bracket on top of the stack, so mismatched/unbalanced brackets are ignored rather than producing bad folds.

The fold's `level` reflects how deeply nested it is.

### Tag (HTML/XML) folding

Pure markup languages (`html`, `xml`, `xhtml`, `svg`) use tag matching instead of simple bracket matching: opening tags are paired with their corresponding closing tags to produce a fold spanning the element. The tag scanner skips HTML comments, ignores self-closing tags and HTML5 void elements (`<br>`, `<img>`, `<input>`, etc.), and tolerates malformed nesting. Tag folds are reported with `type: 'bracket'`.

Mixed languages — `vue`, `svelte`, `jsx`, `tsx` — run **both** the tag strategy and the bracket strategy, so you get folds for markup elements and for the surrounding JavaScript/TypeScript braces.

### Indentation folding

Indentation-sensitive languages (`python`, `yaml`/`yml`, `haml`, `slim`, `pug`/`jade`) fold based on leading whitespace. A line opens a fold that includes every following line with greater indentation; blank lines are absorbed into the fold rather than terminating it. Indentation is measured in columns with a tab width of 4. Folds are reported with `type: 'indentation'` and a `level` equal to the indentation column of the opening line.

### Region folding

Any document may use explicit region markers. The opening and closing markers are matched as a stack so regions can nest. The default markers match common comment syntaxes:

```text
// #region Setup
const config = loadConfig();
const client = createClient(config);
// #endregion
```

The leading `#` is optional and the markers are case-insensitive, so `// region`, `# region`, `-- region`, and `/* region` all work. Python (`# region`) and HTML (`<!-- #region -->`) have dedicated marker patterns. Region folds are reported with `type: 'region'`.

### Comment folding

Multi-line block comments fold from their opening line to their closing line. Both C-style `/* ... */` and HTML-style `<!-- ... -->` block comments are recognized. Comment folds are reported with `type: 'comment'` and `level: 0`.

## How regions are computed and combined

A document is folded in two passes.

1. **Detection.** Each enabled strategy scans the lines and emits its own `FoldRegion` list.
2. **Merge.** All regions are concatenated, sorted by start line (longest region first when two regions start on the same line), and then de-duplicated so that **at most one fold begins on any given line**. Nested folds are kept as long as their start lines differ.

A region must span at least `minLines` (default `2`) — measured as `endLine - startLine` — to be kept. Single-line braces, one-line comments, and shallow blocks are not foldable.

### The `FoldRegion` shape

Each foldable region is described by a `FoldRegion`:

```ts
import type { FoldRegion } from '@nocturnium/svelte-ide/components/editor';

interface FoldRegion {
  /** Start line (0-based) — the line that shows the fold indicator. */
  startLine: number;
  /** End line (0-based) — the last line included in the fold. */
  endLine: number;
  /** Nesting / indentation level, used for nested folds. */
  level: number;
  /** Which strategy produced this region. */
  type: 'bracket' | 'indentation' | 'region' | 'comment';
  /** Whether this region is currently collapsed. */
  collapsed: boolean;
}
```

When a region is collapsed, every line from `startLine + 1` through `endLine` is hidden; the `startLine` itself stays visible and keeps showing the indicator.

## Public folding API

Everything below is exported from the `./components/editor` entry point. You only need these if you are building custom folding UI or computing folds outside the editor — the bundled editor wires them up for you.

```ts
import {
  detectFoldRegions,
  createFoldManager,
  FoldManager,
  type FoldRegion,
  type FoldingConfig,
} from '@nocturnium/svelte-ide/components/editor';
```

> Note: the folding API (`detectFoldRegions`, `createFoldManager`, `FoldManager`, `FoldRegion`, `FoldingConfig`) is exported from the `@nocturnium/svelte-ide/components/editor` subpath, not from the package root. The components themselves (`CustomEditor`, `LSPEditor`) and the `Line` type _are_ available from the root `@nocturnium/svelte-ide`.

### `detectFoldRegions`

```ts
function detectFoldRegions(
  lines: readonly Line[],
  language?: string,            // default: 'plaintext'
  config?: Partial<FoldingConfig>,
): FoldRegion[];
```

Runs the strategies appropriate for `language` and returns the merged, de-duplicated, sorted list of fold regions. `lines` is the editor's line model — an array of `{ number, text }` objects (the `Line` type, exported from the package root `@nocturnium/svelte-ide`). `config` lets you turn individual strategies on or off and set the minimum region length:

```ts
import { detectFoldRegions } from '@nocturnium/svelte-ide/components/editor';

const lines = source.split('\n').map((text, number) => ({ number, text }));

const regions = detectFoldRegions(lines, 'typescript', {
  brackets: true,
  comments: true,
  regions: true,
  indentation: false, // ignored for non-indentation languages anyway
  minLines: 3,        // only fold blocks of 3+ lines
});
```

#### `FoldingConfig`

```ts
interface FoldingConfig {
  /** Enable bracket- and tag-based folding. */
  brackets: boolean;
  /** Enable indentation-based folding (only applies to indentation languages). */
  indentation: boolean;
  /** Enable #region / #endregion marker folding. */
  regions: boolean;
  /** Enable multi-line comment folding. */
  comments: boolean;
  /** Minimum number of lines a region must span to be foldable. */
  minLines: number;
}
```

All five fields default to `{ brackets: true, indentation: true, regions: true, comments: true, minLines: 2 }`; pass a partial object to override only the fields you care about.

### `FoldManager`

`FoldManager` holds the detected regions, tracks collapsed state, computes which lines are hidden, and notifies subscribers when folds change. Create one with `createFoldManager()` (or `new FoldManager()`).

```ts
import { createFoldManager } from '@nocturnium/svelte-ide/components/editor';

const folds = createFoldManager();

// Recompute regions from the current document (preserves collapsed state
// for regions that still start on the same line).
folds.updateRegions(lines, 'javascript', { minLines: 2 });

// React to collapse/expand changes.
const unsubscribe = folds.onChange(() => {
  render(folds.getVisibleLines(lines.length));
});

// ...later, when tearing down:
unsubscribe();
```

#### Methods

**Region access**

- `updateRegions(lines, language, config?)` — recompute regions from the document. Collapsed state is preserved for any region whose `startLine` is unchanged.
- `getRegions(): readonly FoldRegion[]` — all current regions.
- `getRegionAtLine(line): FoldRegion | undefined` — the region that **starts** on `line`, if any.
- `hasFoldIndicator(line): boolean` — whether a fold begins on `line` (i.e. whether to draw an indicator there).

**Collapse / expand**

- `toggleFold(line): boolean` — flip the fold that starts on `line`. Returns `false` if there is no fold there.
- `collapse(line): boolean` / `expand(line): boolean` — collapse or expand the fold starting on `line`. Return `false` if there is no such fold or it is already in that state.
- `collapseAll()` / `expandAll()` — collapse or expand every region.
- `collapseLevel(level)` — collapse every region at a given nesting `level`.

**Visibility queries**

- `isFoldCollapsed(line): boolean` — whether the fold starting on `line` is collapsed.
- `isLineHidden(line): boolean` — whether `line` is hidden inside some collapsed fold.
- `getVisibleLines(totalLines): number[]` — the 0-based indices of every line that should be rendered.
- `getHiddenLineCount(startLine): number` — how many lines are hidden by the collapsed fold starting on `startLine` (0 if not collapsed).

**Subscriptions**

- `onChange(callback): () => void` — subscribe to collapse/expand changes (not detection). Returns an unsubscribe function. Always call it on teardown; the manager caps listeners and will warn (or throw, in development) if you leak subscriptions.

## Interacting with folds

Inside the editor, folding is driven entirely by the gutter indicators and keyboard shortcuts — you do not normally touch the `FoldManager` yourself.

### Gutter indicators

Lines that begin a foldable region render a chevron in the gutter (`▼` when expanded, `▶` when collapsed). The expanded chevron appears on hover; once a region is collapsed its chevron stays visible so you can find it again. Click the indicator to toggle that fold. The editor announces the change to assistive technology, including how many lines were hidden or revealed.

### Keyboard shortcuts

When `folding` is enabled, the editor binds:

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Shift + [` | Fold (collapse) the region at the cursor |
| `Ctrl/Cmd + Shift + ]` | Unfold (expand) the region at the cursor |
| `Ctrl/Cmd + Alt + [` | Fold all regions |
| `Ctrl/Cmd + Alt + ]` | Unfold all regions |

When you collapse the region the cursor is inside, the cursor is moved to the fold's visible start line so it never lands on a hidden line.

### Performance

Fold detection re-runs when the document changes, debounced (~250 ms) so that typing in large files stays responsive. You do not need to manage this — the editor schedules updates internally whenever `folding` is on.

## Related

- [Editor guide](./editor.md) — the `Editor`, `CustomEditor`, `EditorPane`, and `EditorTabs` components and their props.
- [Syntax highlighting](./syntax-highlighting.md) — the tokenizer and language detection that also feed the editor's `language` prop.
- [Multi-cursor & selections](./multi-cursor.md) — the other core editing capability.
- [Component reference](../api/components.md) and [editor core / types reference](../api/types-and-utils.md) — full export listings.
