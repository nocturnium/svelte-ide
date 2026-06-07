# Syntax Highlighting

`@nocturnium/svelte-ide` ships its own zero-dependency tokenizer — there is no CodeMirror, Prism, or Shiki underneath. Every editor component highlights code by splitting each line into typed **tokens**, mapping each token type to a `token-*` CSS class, and letting the theme color those classes through CSS custom properties. The same tokenizer is exposed as a small, framework-agnostic API so you can highlight code outside the editor too — in a custom renderer, a read-only viewer, a diff view, or a static HTML string. This guide enumerates the supported languages, documents the tokenizer API and its types, explains the `token-*` classes and how they map to theme colors, and shows the language-detection helpers and standalone `tokenize` usage.

## Where the API lives

All of the highlighting functions and types are re-exported from the package root and from the `./components/editor` entry point. Import from whichever is convenient:

```ts
// From the root barrel — everything is re-exported here
import { tokenize, getTokenClass, tokensToHTML, getTokenizer } from "@nocturnium/svelte-ide";

// Or from the editor entry point
import { tokenize, getTokenClass, tokensToHTML } from "@nocturnium/svelte-ide/components/editor";
```

> Always import from the published package. Do not import from `$lib/...` — that path only exists inside this repository.

Remember that components are unstyled until you load the shipped theme once. The `token-*` colors come from the design tokens in that stylesheet:

```ts
import "@nocturnium/svelte-ide/theme.css";
```

See [Theming](../theming.md) for the full token reference and how to override colors.

## Supported languages

The tokenizer resolves a language name (or file extension) to a canonical id, then builds a dedicated tokenizer for it. The canonical ids with real, syntax-aware tokenizers are:

| Canonical id | Display name        | Highlights |
| ------------ | ------------------- | ---------- |
| `javascript` | JavaScript          | keywords, strings, template literals, regex, numbers, functions, comments |
| `typescript` | TypeScript          | everything in JavaScript plus type syntax |
| `jsx`        | JavaScript React    | JavaScript plus JSX tags |
| `tsx`        | TypeScript React    | TypeScript plus JSX tags |
| `html`       | HTML                | tags, attributes, attribute values, comments |
| `xml`        | XML                 | tags, attributes, values (used for SVG, RSS, etc.) |
| `css`        | CSS                 | selectors, properties, values, comments |
| `json`       | JSON                | keys, strings, numbers, booleans, null |
| `python`     | Python              | keywords, strings, f-strings, numbers, comments |
| `go`         | Go                  | keywords, strings, numbers, types, comments |
| `markdown`   | Markdown            | headings, bold/italic, links, code, quotes, lists |
| `svelte`     | Svelte              | HTML plus `{...}` template expressions and `<script>`/`<style>` blocks |
| `plaintext`  | Plain Text          | no highlighting (every line is a single `text` token) |

You never need to hard-code this list — read it at runtime:

```ts
import { getSupportedLanguages, isLanguageSupported } from "@nocturnium/svelte-ide";

getSupportedLanguages();
// → ['javascript', 'typescript', 'jsx', 'tsx', 'html', 'xml',
//    'css', 'json', 'python', 'go', 'markdown', 'svelte', 'plaintext']

isLanguageSupported("ts");     // → true  (alias resolves to 'typescript')
isLanguageSupported("ruby");   // → false (no tokenizer; would fall back to plaintext)
```

Any language that is not in this list — or any unknown alias — is tokenized by the plaintext tokenizer, so the code still renders correctly; it just isn't colored.

### Aliases and extensions

`resolveLanguage` maps a long list of aliases and bare file extensions onto those canonical ids. A leading dot is stripped and matching is case-insensitive:

```ts
import { resolveLanguage } from "@nocturnium/svelte-ide";

resolveLanguage("js");      // → 'javascript'
resolveLanguage(".mjs");    // → 'javascript'
resolveLanguage("TS");      // → 'typescript'
resolveLanguage("scss");    // → 'css'      (scss/sass/less map to css)
resolveLanguage("svg");     // → 'xml'
resolveLanguage("py");      // → 'python'
resolveLanguage("md");      // → 'markdown'
resolveLanguage("golang");  // → 'go'
resolveLanguage("rust");    // → 'rust'     (unknown — returned unchanged, highlights as plaintext)
```

Notable alias groups: `js`/`mjs`/`cjs` → `javascript`; `ts`/`mts`/`cts` → `typescript`; `htm`/`xhtml`/`vue` → `html`; `svg`/`xsl`/`xslt`/`rss`/`atom`/`plist` → `xml`; `scss`/`sass`/`less` → `css`; `jsonc`/`json5` → `json`; `py`/`pyw`/`pyi` → `python`; `golang` → `go`; `md`/`mkd`/`mkdn`/`mdown` → `markdown`; `txt`/`text` → `plaintext`.

## The tokenizer API

There are four functions you will use most: `getTokenizer`, `tokenize`, `getTokenClass`, and `tokensToHTML`.

### `tokenize(content, language): TokenizedLine[]`

The highest-level entry point. Pass it source text and a language name and it returns one `TokenizedLine` per line, threading multi-line state (block comments, template literals, multi-line strings) from each line to the next for you:

```ts
import { tokenize } from "@nocturnium/svelte-ide";

const lines = tokenize(`const greet = (name) => \`Hi \${name}\`;`, "javascript");

// lines[0].tokens is an array of { type, text, start, end }
for (const token of lines[0].tokens) {
  console.log(token.type, JSON.stringify(token.text));
}
// keyword     "const"
// text        " "
// variable    "greet"
// ...
// string.template "`Hi "
// ...
```

`tokenize` splits on `\n`, so each `TokenizedLine.lineNumber` is 1-based and aligns with editor gutters.

### `getTokenizer(language): LanguageTokenizer`

Returns the cached tokenizer instance for a language (resolving aliases first). Use this when you want to drive tokenization line-by-line yourself — for example in a virtualized renderer that only tokenizes visible lines and needs to carry state across them:

```ts
import { getTokenizer } from "@nocturnium/svelte-ide";

const tokenizer = getTokenizer("python");
const source = ['def add(a, b):', '    return a + b'];

let state = tokenizer.getInitialState();
const result = source.map((line, i) => {
  const tokenized = tokenizer.tokenizeLine(line, i + 1, state);
  state = tokenized.state ?? state; // carry multi-line state forward
  return tokenized;
});
```

A `LanguageTokenizer` exposes exactly three members:

- `language: string` — the resolved language id.
- `getInitialState(): TokenizerState` — the state to pass for the first line.
- `tokenizeLine(line, lineNumber, state?): TokenizedLine` — tokenize one line, returning the next-line state on the result.

Tokenizers are cached internally with an LRU policy, so calling `getTokenizer("javascript")` repeatedly returns the same instance — there is no need to memoize it yourself.

### `getTokenClass(type): string`

Maps a `TokenType` to its CSS class. Dotted type names become hyphenated, prefixed with `token-`. The function sanitizes its input, so anything that isn't a clean class name falls back to `token-text`:

```ts
import { getTokenClass } from "@nocturnium/svelte-ide";

getTokenClass("keyword");        // → 'token-keyword'
getTokenClass("comment.block");  // → 'token-comment-block'
getTokenClass("tag.attribute");  // → 'token-tag-attribute'
getTokenClass("text");           // → 'token-text'
```

### `tokensToHTML(tokens): string`

Renders an array of tokens to an HTML string of `<span>` elements, one per non-text token, with the text content HTML-escaped. Plain `text` tokens are emitted as bare escaped text (no wrapping span), which keeps the markup small:

```ts
import { tokenize, tokensToHTML } from "@nocturnium/svelte-ide";

const [line] = tokenize('const x = 1;', "javascript");
tokensToHTML(line.tokens);
// → '<span class="token-keyword">const</span> '
//   + '<span class="token-variable">x</span> = '
//   + '<span class="token-number">1</span>;'
```

The output is safe to inject as HTML because every token's text is escaped (`&`, `<`, `>`, `"`, `'`). In Svelte you can render it with `{@html ...}`:

```svelte
<script lang="ts">
  import { tokenize, tokensToHTML } from "@nocturnium/svelte-ide";
  import "@nocturnium/svelte-ide/theme.css";

  let { code, language = "javascript" } = $props();
  const lines = $derived(tokenize(code, language));
</script>

<pre class="code-block">
  {#each lines as line (line.lineNumber)}
    <div class="line">{@html tokensToHTML(line.tokens)}</div>
  {/each}
</pre>

<style>
  .code-block {
    background: var(--ide-bg-primary);
    color: var(--ide-text-primary);
    font-family: var(--ide-font-mono, monospace);
    padding: 1rem;
  }
</style>
```

Because `tokensToHTML` already escapes its text, you do not need to escape `code` again before calling it.

## Types

The tokenizer ships a small set of TypeScript types you can import for your own helpers and renderers.

### `Token`

```ts
interface Token {
  /** Token type, drives the CSS class */
  type: TokenType;
  /** The literal source text of this token */
  text: string;
  /** Start column within the line (0-based) */
  start: number;
  /** End column within the line (start + text.length) */
  end: number;
}
```

### `TokenizedLine`

```ts
interface TokenizedLine {
  /** 1-based line number */
  lineNumber: number;
  /** Tokens covering the entire line, in order */
  tokens: Token[];
  /** The raw, untokenized line text */
  text: string;
  /** State to feed into the next line (multi-line constructs) */
  state?: TokenizerState;
}
```

The tokens always cover the whole line with no gaps; an empty line yields a single empty `text` token. To reconstruct the line you can concatenate `tokens.map((t) => t.text)`, and it will equal `text`.

### `TokenizerState`

State threaded between lines so multi-line constructs highlight correctly. You rarely build this by hand — get the first value from `tokenizer.getInitialState()` and pass each line's returned `state` to the next call:

```ts
interface TokenizerState {
  inBlockComment?: boolean;
  inTemplateLiteral?: boolean;
  inMultilineString?: boolean;
  stringDelimiter?: string;
  templateDepth?: number;
  custom?: Record<string, unknown>;
}
```

### `TokenType`

A union of every token type the tokenizers can emit. The categories (and a few representative members) are:

- **Comments** — `comment`, `comment.line`, `comment.block`, `comment.doc`
- **Strings** — `string`, `string.template`, `string.regex`, `string.escape`
- **Numbers** — `number`, `number.integer`, `number.float`, `number.hex`, `number.binary`
- **Keywords** — `keyword`, `keyword.control`, `keyword.operator`, `keyword.definition`, `keyword.module`, `keyword.storage`
- **Operators** — `operator`, `operator.arithmetic`, `operator.comparison`, `operator.logical`, `operator.assignment`
- **Names** — `variable`, `variable.definition`, `variable.parameter`, `function`, `function.definition`, `function.call`, `property`, `property.definition`
- **Types** — `type`, `type.class`, `type.interface`, `type.namespace`, `type.builtin`
- **Constants** — `constant`, `constant.boolean`, `constant.null`, `constant.builtin`
- **Punctuation** — `punctuation`, `punctuation.bracket`, `punctuation.brace`, `punctuation.paren`, `punctuation.separator`, `punctuation.accessor`
- **Markup (HTML/XML)** — `tag`, `tag.name`, `tag.attribute`, `tag.attribute.value`, `tag.punctuation`
- **Markdown** — `markup.heading`, `markup.bold`, `markup.italic`, `markup.link`, `markup.code`, `markup.quote`, `markup.list`
- **Special** — `invalid`, `text`

### `LanguageTokenizer`

The interface implemented by every tokenizer, as described under [`getTokenizer`](#gettokenizerlanguage-languagetokenizer):

```ts
interface LanguageTokenizer {
  language: string;
  tokenizeLine(line: string, lineNumber: number, state?: TokenizerState): TokenizedLine;
  getInitialState(): TokenizerState;
}
```

## Token CSS classes and theme colors

Each `TokenType` maps to a `token-*` class (dots become hyphens). The shipped theme styles those classes with the Nocturnium design tokens, so retheming highlighting is just a matter of overriding CSS custom properties. The table below lists the canonical mappings used by the editor's default styling.

| Token classes | Default color token | Default value |
| ------------- | ------------------- | ------------- |
| `token-comment`, `token-comment-line`, `token-comment-block`, `token-comment-doc` | `--ide-text-muted` | muted gray (italic) |
| `token-string`, `token-string-template` | `--color-nocturnium-aurora-green` | `#4ade80` |
| `token-string-regex` | `--color-nocturnium-aurora-pink` | `#f472b6` |
| `token-string-escape` | `--color-nocturnium-aurora-yellow` | `#facc15` |
| `token-number`, `token-number-integer`, `token-number-float`, `token-number-hex`, `token-number-binary` | `--color-nocturnium-aurora-yellow` | `#facc15` |
| `token-keyword`, `token-keyword-control`, `token-keyword-operator`, `token-keyword-definition`, `token-keyword-module`, `token-keyword-storage` | `--color-nocturnium-aurora-purple` | `#a78bfa` |
| `token-operator` (and `-arithmetic`/`-comparison`/`-logical`/`-assignment`) | `--ide-text-primary` | primary text |
| `token-variable` | `--ide-text-primary` | primary text |
| `token-variable-definition`, `token-variable-parameter` | `--color-nocturnium-wave` | `#4a8db7` |
| `token-function`, `token-function-definition`, `token-function-call` | `--color-nocturnium-aurora-blue` | `#60a5fa` |
| `token-property`, `token-property-definition` | `--color-nocturnium-wave` | `#4a8db7` |
| `token-type`, `token-type-class`, `token-type-interface`, `token-type-namespace`, `token-type-builtin` | `--color-nocturnium-aurora-yellow` | `#facc15` |
| `token-constant`, `token-constant-boolean`, `token-constant-null`, `token-constant-builtin` | `--color-nocturnium-aurora-yellow` | `#facc15` |
| `token-punctuation` (and `-bracket`/`-paren`/`-separator`/`-accessor`) | `--ide-text-secondary` | secondary text |
| `token-punctuation-brace` | `--color-nocturnium-aurora-yellow` | `#facc15` (bold — Svelte braces stand out) |
| `token-tag`, `token-tag-name` | `--color-nocturnium-aurora-pink` | `#f472b6` |
| `token-tag-attribute` | `--color-nocturnium-aurora-yellow` | `#facc15` |
| `token-tag-attribute-value` | `--color-nocturnium-aurora-green` | `#4ade80` |
| `token-tag-punctuation` | `--ide-text-secondary` | secondary text |
| `token-markup-heading` | `--color-nocturnium-aurora-blue` | `#60a5fa` (bold) |
| `token-markup-bold` | — | inherited color, bold |
| `token-markup-italic` | — | inherited color, italic |
| `token-markup-link` | `--color-nocturnium-wave` | `#4a8db7` (underlined) |
| `token-markup-code` | `--color-nocturnium-aurora-green` | `#4ade80` on `--ide-bg-tertiary` |
| `token-markup-quote` | `--ide-text-secondary` | secondary text (italic) |
| `token-markup-list` | `--color-nocturnium-ember` | `#d4793a` |
| `token-invalid` | `--ide-error` | error red |

`text` tokens are emitted without a span, so they simply inherit the surrounding `--ide-text-primary` color.

### Retheming highlighting

Two ways to recolor syntax highlighting:

**1. Override the design tokens** — load `theme.css` first, then your overrides. This recolors highlighting and the rest of the IDE at once:

```css
:root {
  /* Make keywords teal and strings amber across the whole editor */
  --color-nocturnium-aurora-purple: #2dd4bf;
  --color-nocturnium-aurora-green: #fbbf24;
}
```

**2. Target the `token-*` classes directly** — when you want highlighting to diverge from the global palette:

```css
.token-keyword {
  color: #c678dd;
  font-weight: 600;
}
.token-comment {
  color: #6b7280;
  font-style: normal;
}
```

Both approaches work for the built-in editor components and for any markup you produce with `tokensToHTML`, since they share the same class names.

## Language detection helpers

Besides `resolveLanguage`, the editor entry point exposes helpers that map files and MIME types to a language id and return richer language configuration. These are useful when you load arbitrary files and need to pick a tokenizer.

```ts
import {
  getLanguageFromFilename,
  getLanguageFromExtension,
  getLanguageFromMimeType,
  getLanguageConfig,
} from "@nocturnium/svelte-ide";

getLanguageFromFilename("server.go");        // → 'go'
getLanguageFromFilename("README.md");        // → 'markdown'
getLanguageFromFilename("LICENSE");          // → 'plaintext' (no extension)

getLanguageFromExtension(".tsx");            // → 'tsx'
getLanguageFromExtension("scss");            // → 'css'

getLanguageFromMimeType("application/json"); // → 'json'
getLanguageFromMimeType("text/x-python");    // → 'python'
```

> Note: `getLanguageFromFilename` and `getLanguageFromExtension` are exported from the package root and from `./components/editor`. `getLanguageFromMimeType` is exported only from the `./components/editor` entry point (it is not in the root barrel), so import it from `@nocturnium/svelte-ide/components/editor` if you use it on its own.

`getLanguageConfig` returns a `LanguageConfig` describing the language — its display name, file extensions, MIME types, comment delimiters, and editor pairs (auto-closing and surrounding):

```ts
import { getLanguageConfig, type LanguageConfig } from "@nocturnium/svelte-ide";

const cfg: LanguageConfig = getLanguageConfig("typescript");
cfg.name;        // → 'TypeScript'
cfg.extensions;  // → ['ts', 'mts', 'cts']
cfg.lineComment; // → '//'
cfg.blockComment;// → ['/*', '*/']
```

To enumerate every configured language (for a language picker, say), use `getAllLanguageConfigs` from the editor entry point:

```ts
import { getAllLanguageConfigs } from "@nocturnium/svelte-ide/components/editor";

for (const cfg of getAllLanguageConfigs()) {
  console.log(`${cfg.id}: ${cfg.name} (.${cfg.extensions.join(", .")})`);
}
```

Note that `getAllLanguageConfigs` includes languages such as `yaml` that have an editing **configuration** (comment style, bracket pairs) but no syntax-highlighting tokenizer yet. For those, `isLanguageSupported` returns `false` and tokenization falls back to plaintext, while auto-closing pairs and comment toggling still work in the editor.

## Putting it together: a standalone highlighter

A complete, self-contained example that picks a tokenizer from a filename and renders highlighted, line-numbered HTML — no editor component required:

```svelte
<script lang="ts">
  import {
    getLanguageFromFilename,
    tokenize,
    tokensToHTML,
  } from "@nocturnium/svelte-ide";
  import "@nocturnium/svelte-ide/theme.css";

  let { filename, source } = $props<{ filename: string; source: string }>();

  const language = $derived(getLanguageFromFilename(filename));
  const lines = $derived(tokenize(source, language));
</script>

<figure class="viewer">
  <figcaption>{filename} — {language}</figcaption>
  <pre>
    {#each lines as line (line.lineNumber)}
      <div class="row">
        <span class="ln">{line.lineNumber}</span>
        <code>{@html tokensToHTML(line.tokens)}</code>
      </div>
    {/each}
  </pre>
</figure>

<style>
  .viewer {
    margin: 0;
    background: var(--ide-bg-primary);
    color: var(--ide-text-primary);
    font-family: var(--ide-font-mono, ui-monospace, monospace);
  }
  figcaption {
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--ide-border);
    color: var(--ide-text-secondary);
  }
  pre { margin: 0; padding: 0.5rem 0; }
  .row { display: flex; gap: 1rem; padding: 0 1rem; }
  .ln { color: var(--ide-text-muted); user-select: none; text-align: right; min-width: 2ch; }
</style>
```

For an interactive, editable surface — gutter, cursor, selections, folding, and live re-highlighting — reach for the editor components instead of rolling your own; the tokenizer is already wired into them.

## See also

- [Editor guide](./editor.md) — the `Editor`, `CustomEditor`, `EditorPane`, and `EditorTabs` components that use this tokenizer.
- [Code folding](./code-folding.md) — folding strategies that pair with highlighting.
- [Multi-cursor & selections](./multi-cursor.md) — editing on top of the highlighted view.
- [Theming](../theming.md) — the design tokens behind every `token-*` color.
- [Getting started](../getting-started.md) — install, load the theme, and render your first editor.
- [Component reference](../api/components.md) and [Types & utils reference](../api/types-and-utils.md) — exhaustive export listings.
