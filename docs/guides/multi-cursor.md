# Multi-Cursor Editing

The editor supports editing at many positions at once. Every cursor is a small object with its own selection, and a `CursorManager` keeps the whole set consistent: it assigns ids, tracks which cursor is *primary*, enforces a maximum count, and automatically merges cursors whose selections touch or overlap. In `<CustomEditor>` this all happens for you behind keyboard and mouse gestures, but the same primitives are exported so you can drive multiple cursors from your own code. This guide covers the cursor model, the `CursorManager` API, how selections behave across cursors, the merge-on-overlap rule, and the gestures the editor exposes by default.

## The cursor model

A cursor is a selection plus an identity. When the selection's `anchor` equals its `head`, the cursor is a plain blinking caret with no highlighted range; when they differ, it has a selection. Positions are zero-based.

```ts
import type { Cursor, Position, Selection } from "@nocturnium/svelte-ide";

// Position: a point in the document (both fields are 0-based)
interface Position {
  line: number;
  column: number;
}

// Selection: a directional range. `head` is where the caret sits;
// `anchor` is the fixed end. anchor === head means "no selection".
interface Selection {
  anchor: Position;
  head: Position;
}

// Cursor: a selection with an id and a primary flag
interface Cursor {
  id: string; // e.g. "cursor-0", assigned by the manager
  selection: Selection;
  isPrimary: boolean; // exactly one cursor is primary at a time
}
```

`Cursor`, `Position`, and `Selection` are all type-only exports from the package root. The runtime helpers and the `CursorManager` class described below live behind the editor subpath entry point, `@nocturnium/svelte-ide/components/editor`.

> Direction matters for *extending* a selection (Shift+Arrow moves the `head`), but most range questions — "where does this selection start/end?" — should go through the helper functions below, which normalize anchor/head order for you.

## The CursorManager

`CursorManager` owns the set of cursors. Construct one directly, or use the `createCursorManager` factory. A manager always starts with a single primary caret at `{ line: 0, column: 0 }`, so the set is never empty.

```ts
import {
  CursorManager,
  createCursorManager,
  type CursorManagerConfig,
} from "@nocturnium/svelte-ide/components/editor";

// CursorManagerConfig
interface CursorManagerConfig {
  maxCursors?: number; // default: 100
}

const cursors = createCursorManager({ maxCursors: 200 });
// equivalent to: new CursorManager({ maxCursors: 200 })
```

### Reading the cursor set

```ts
cursors.getCursors();             // readonly Cursor[] (unordered)
cursors.getSortedCursors();       // Cursor[] sorted top-to-bottom, left-to-right
cursors.getSortedCursorsReverse(); // bottom-to-top; use this when applying edits
cursors.getPrimary();             // the primary Cursor (always defined)

cursors.count;        // number of cursors
cursors.hasMultiple;  // true when count > 1
```

Apply text edits in **reverse document order** (`getSortedCursorsReverse()`): editing from the bottom up means earlier edits never shift the positions of cursors you have not processed yet.

### Creating cursors

```ts
// Add a caret at a position. Returns the new Cursor.
const c = cursors.addCursor({ line: 5, column: 0 });

// Add a cursor that already owns a selection.
cursors.addCursorWithSelection(
  { line: 2, column: 4 }, // anchor
  { line: 2, column: 9 }, // head
);

// Add relative to the primary cursor's current line.
cursors.addCursorAbove(lineCount); // returns false if already on the first line
cursors.addCursorBelow(lineCount); // returns false if already on the last line
```

`addCursor` accepts a second `makePrimary` argument; passing `true` promotes the new cursor to primary and demotes the previous one. When the set is already at `maxCursors`, `addCursor` does **not** add another caret — it returns the existing cursor closest to the requested position instead, so the call always yields a usable `Cursor`. Both `addCursorAbove`/`addCursorBelow` operate from the primary cursor's `head` and place the new caret at the same column on the adjacent line (the editor clamps that column to the target line's length).

### Removing cursors

```ts
cursors.removeCursor(id);     // false if it was the last remaining cursor
cursors.removeLastSecondary(); // remove the most recently added non-primary cursor
cursors.clearSecondary();      // collapse back to just the primary cursor
```

The manager guarantees at least one cursor survives: `removeCursor` refuses to delete the final cursor, and removing the primary promotes another cursor to primary automatically. `removeLastSecondary` powers the "undo last cursor" gesture; `clearSecondary` powers "escape back to a single caret".

### Moving cursors and changing selections

```ts
cursors.setPrimary(id);                    // choose which cursor is primary
cursors.setCursor(id, position);           // move one caret, clearing its selection
cursors.setSelection(id, anchor, head);    // set one cursor's selection
cursors.extendSelection(id, head);         // move only the head, keep the anchor

// Batch many caret moves in a single merge + notify pass (more efficient
// than calling setCursor in a loop):
cursors.batchUpdateCursors([
  { id: "cursor-0", position: { line: 1, column: 0 } },
  { id: "cursor-1", position: { line: 2, column: 0 } },
]);
```

To collapse everything down to one cursor in a single step, use the "single" helpers — they clear all secondary cursors and then position the primary:

```ts
cursors.setSingleCursor(position);          // one caret, no selection
cursors.setSingleSelection(anchor, head);   // one cursor with a selection
```

### Reacting to changes

Every mutating call notifies subscribers. Register a listener and keep the returned unsubscribe function:

```ts
const off = cursors.onChange(() => {
  render(cursors.getSortedCursors());
});

// later, when tearing down:
off();
```

`onChange` guards against listener leaks: it caps the number of subscribers, so always call the returned unsubscribe function when your component unmounts.

### Snapshot and restore

For undo/redo or persistence, clone the full state and restore it later. These are the same primitives the editor uses to roll cursor positions back and forward through history:

```ts
const snapshot = cursors.clone(); // { cursors: Cursor[]; primaryId: string }
// ...edits happen...
cursors.restore(snapshot.cursors, snapshot.primaryId);
```

## Selection helpers

These pure functions are exported alongside the manager from `@nocturnium/svelte-ide/components/editor`. They are the canonical way to reason about positions and selections regardless of anchor/head direction.

```ts
import {
  comparePositions,
  isPositionBefore,
  isPositionBeforeOrEqual,
  positionsEqual,
  getSelectionStart,
  getSelectionEnd,
  isSelectionEmpty,
  selectionsOverlap,
  mergeSelections,
} from "@nocturnium/svelte-ide/components/editor";

comparePositions(a, b);        // <0 if a before b, >0 if after, 0 if equal
isPositionBefore(a, b);        // a strictly before b
isPositionBeforeOrEqual(a, b); // a before or equal to b
positionsEqual(a, b);          // same line and column

getSelectionStart(sel); // the earlier of anchor/head (document order)
getSelectionEnd(sel);   // the later of anchor/head
isSelectionEmpty(sel);  // anchor equals head (a plain caret)

selectionsOverlap(a, b); // true if the ranges overlap OR merely touch
mergeSelections(a, b);   // the union range { anchor: start, head: end }
```

Because `getSelectionStart`/`getSelectionEnd` normalize direction, prefer them over reading `selection.anchor`/`selection.head` directly when you only care about the span.

## Merging on overlap

After any change to the set, the manager runs a merge pass. It sorts cursors by start position and folds each one into the previous if their selections overlap **or touch** (adjacency counts — `selectionsOverlap` returns `true` when one range's start is `<=` the other's end). Two touching selections become a single selection spanning their union via `mergeSelections`. If the primary cursor is absorbed into another during a merge, the surviving cursor becomes primary, so you never lose your primary.

This means:

- Adding a cursor inside an existing selection will not create a duplicate — it collapses into that selection.
- Moving two carets onto the same position leaves you with one caret there.
- You cannot end up with overlapping highlighted ranges; the visible selection set is always disjoint.

You get this behavior for free through every `addCursor*`, `setCursor`, `setSelection`, `extendSelection`, and `batchUpdateCursors` call — there is no separate "merge" step to invoke.

## Using cursors through EditorState

You rarely touch a `CursorManager` directly when you have an `EditorState`. The state wraps it, clamps every position to valid document bounds, and emits cursor/selection change events. The manager is still reachable via `state.cursorManager` for advanced cases.

```ts
import { createEditorState } from "@nocturnium/svelte-ide";

const state = createEditorState({ content: "const x = 1;\nconst y = 2;\n" });

// Inspect cursors
state.allCursors;          // readonly Cursor[]
state.primaryCursor;       // Cursor
state.hasMultipleCursors;  // boolean
state.hasAnySelection;     // boolean across all cursors

// Add cursors (positions are clamped to the document)
state.addCursor({ line: 1, column: 0 });
state.addCursorWithSelection({ line: 0, column: 0 }, { line: 0, column: 5 });
state.addCursorAbove();           // false if already on the first line
state.addCursorBelow();           // false if already on the last line
state.removeLastCursor();         // remove most recent secondary cursor
state.clearSecondaryCursors();    // collapse to a single primary cursor

// Read selected text
state.getSelectedText();                 // primary cursor's selection
state.getSelectedTextFromAllCursors();   // every non-empty selection, joined by "\n"

// Advanced: reach the underlying manager
state.cursorManager.setSelection(state.primaryCursor.id, anchor, head);
```

Note that `state.setCursor`, `state.setSelection`, and `state.extendSelection` operate on the **primary cursor only** and clear secondary cursors first — they are single-cursor operations. To move or extend a specific secondary cursor, go through `state.cursorManager`.

For the full `EditorState` surface (history, editing, navigation), see the [Editor guide](./editor.md) and the [stores reference](../api/stores.md).

## Keyboard and mouse interactions

`<CustomEditor>` wires the cursor model to a default set of gestures. They are active whenever its `multiCursor` prop is `true` (the default). On macOS, `Cmd` substitutes for `Ctrl` everywhere below.

### Mouse

| Gesture | Effect |
| --- | --- |
| Click | Place a single caret, clearing other cursors |
| Shift+Click | Extend the primary selection to the clicked point |
| **Alt+Click** | Add a new caret at the clicked point (multi-cursor) |
| Double-click | Select the word under the pointer |
| Triple-click | Select the whole line |
| Click + drag | Extend the selection as you move |

### Keyboard

| Shortcut | Effect |
| --- | --- |
| `Ctrl/Cmd+D` | Select the next occurrence of the current word/selection, adding a cursor there |
| `Ctrl/Cmd+Shift+L` | Add a cursor at **every** occurrence of the current word/selection |
| `Ctrl/Cmd+Alt+ArrowUp` | Add a cursor on the line above |
| `Ctrl/Cmd+Alt+ArrowDown` | Add a cursor on the line below |
| `Ctrl/Cmd+U` | Remove the most recently added cursor |
| `Escape` | Collapse back to a single primary cursor (when multiple are active) |

`Ctrl/Cmd+D` and `Ctrl/Cmd+Shift+L` work on the current selection; if nothing is selected, they first select the word under the primary caret and then match against it. Matching is case-sensitive and literal (not regex). When several cursors are active, ordinary navigation (arrows, Home/End) and text edits apply to **all** of them at once — type a character and it appears at every caret; press Backspace and it deletes at every caret.

### Configuring multi-cursor on the component

```svelte
<script>
  import { CustomEditor } from "@nocturnium/svelte-ide";
  import "@nocturnium/svelte-ide/theme.css";

  let cursors = $state([]);
</script>

<CustomEditor
  content={`const x = 1;\nconst y = 2;\n`}
  language="javascript"
  multiCursor={true}
  maxCursors={100}
  onCursorsChange={(c) => (cursors = c)}
/>

<p>Active cursors: {cursors.length}</p>
```

- `multiCursor` (default `true`) — enable the gestures above. When `false`, the editor is held to a single cursor (`maxCursors` is forced to `1` internally).
- `maxCursors` (default `100`) — the ceiling enforced by the underlying `CursorManager`.
- `onCursorsChange(cursors: readonly Cursor[])` — fires whenever the cursor set changes, giving you the live set for your own UI.

The higher-level `<Editor>` wrapper does not expose `multiCursor`/`maxCursors`; reach for `<CustomEditor>` when you need to configure them.

---

## See also

- [Editor guide](./editor.md) — `Editor`, `CustomEditor`, `EditorPane`, `EditorTabs`
- [Syntax highlighting](./syntax-highlighting.md) — the tokenizer that powers word selection
- [Code folding](./code-folding.md) — folding strategies and gestures
- [Components reference](../api/components.md) and [stores reference](../api/stores.md)
- [Getting started](../getting-started.md) — installation and theming
