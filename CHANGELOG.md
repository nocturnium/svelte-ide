## [1.1.1](https://github.com/nocturnium/svelte-ide/compare/v1.1.0...v1.1.1) (2026-06-09)


### Bug Fixes

* **editor:** stop clipping complexity indicators below the first viewport ([54f3e2c](https://github.com/nocturnium/svelte-ide/commit/54f3e2cac77d4d3811359b3157469df3d77f6403)), closes [hi#complexity](https://github.com/hi/issues/complexity)

# [1.1.0](https://github.com/nocturnium/svelte-ide/compare/v1.0.6...v1.1.0) (2026-06-09)


### Bug Fixes

* **demo:** align the active fold-preset clear button to the card corner ([88ec36e](https://github.com/nocturnium/svelte-ide/commit/88ec36eb8211b766b80dc07252d8a1aaf28b297b))
* **editor:** make fold presets collapse by range, not exact header line ([f8b6643](https://github.com/nocturnium/svelte-ide/commit/f8b6643c434a920e660890bb62344811753fcfdf))


### Features

* **editor:** fold consecutive import statements ([a4b7f43](https://github.com/nocturnium/svelte-ide/commit/a4b7f43a60396339cbcd60fd4af2c1ed5ededbf2))

## [1.0.6](https://github.com/nocturnium/svelte-ide/compare/v1.0.5...v1.0.6) (2026-06-09)


### Bug Fixes

* **complexity:** align gutter colors and demo legend with analyzer levels ([49843e9](https://github.com/nocturnium/svelte-ide/commit/49843e94c87ed18051b877b6ef7ba0e8e25ca92b))
* **complexity:** drop phantom regions and stop over-rating shallow code ([3598108](https://github.com/nocturnium/svelte-ide/commit/3598108c3df9868aa896d57afe4e67e7d2da99e6))
* **editor:** make semantic fold presets actually fold ([3a29e1f](https://github.com/nocturnium/svelte-ide/commit/3a29e1ff576937ae5b211bd392fa915061864009))

## [1.0.5](https://github.com/nocturnium/svelte-ide/compare/v1.0.4...v1.0.5) (2026-06-09)


### Bug Fixes

* **avatar:** default AI avatars to the assistant hue, not the presence hue ([32bf449](https://github.com/nocturnium/svelte-ide/commit/32bf449eba40db09d9337ddf5c65d35b9a6d2df3))
* **complexity:** detect functions with TS return types and multi-line signatures ([2cfae99](https://github.com/nocturnium/svelte-ide/commit/2cfae99f9aa9b2041fada90b6125ca9ff7a378b1))
* **components:** style all plugin states, stop badge clipping, color config icons ([21bce41](https://github.com/nocturnium/svelte-ide/commit/21bce410a66e5ecdf1cd89e7e980bce8831e916c))
* **core:** render a clean AI glyph in Avatar instead of a clipped badge ([c7ba1c7](https://github.com/nocturnium/svelte-ide/commit/c7ba1c784a7b83213834ae6c838b33a833020d71))
* **demo:** align demo accents to brand tokens and fix code/copy issues ([69c49db](https://github.com/nocturnium/svelte-ide/commit/69c49db82cdcc05733978d1f28c52b7597f7723c)), closes [#a855f7](https://github.com/nocturnium/svelte-ide/issues/a855f7)
* **editor:** point intelligence components at real --ide-* design tokens ([bdf17de](https://github.com/nocturnium/svelte-ide/commit/bdf17debad6c8b4d516648f05611ffb296514338))
* **semantic:** detect exported expression-bodied arrow functions ([f4c416d](https://github.com/nocturnium/svelte-ide/commit/f4c416dd6c5d93ef2b321592325550303a3c7656))
* **structure-map:** de-collide labels and drop duplicate export rows ([c8a236d](https://github.com/nocturnium/svelte-ide/commit/c8a236d4ec7854eee21f5833f5e079389f81f63b))

## [1.0.4](https://github.com/nocturnium/svelte-ide/compare/v1.0.3...v1.0.4) (2026-06-09)


### Bug Fixes

* **ai,editor:** de-Claudify the mock model id and theme the intelligence overlays ([9f75c7d](https://github.com/nocturnium/svelte-ide/commit/9f75c7d03924ee4146ba3bcfd910119efbb6ce34))

## [1.0.3](https://github.com/nocturnium/svelte-ide/compare/v1.0.2...v1.0.3) (2026-06-09)


### Bug Fixes

* **backend:** stop send-on-closed-channel panic from tearing down the LSP bridge ([a094172](https://github.com/nocturnium/svelte-ide/commit/a094172de0eb39cacdef3797628897f1bf16fd14))
* **crdt:** make yjs a truly optional peer and wire presence through the provider ([defe79d](https://github.com/nocturnium/svelte-ide/commit/defe79d1be0d5cdde2c7e8526c7507f7cb5c4af1))
* **editor:** align caret, selection, scroll and clicks with folded text ([3a21216](https://github.com/nocturnium/svelte-ide/commit/3a2121652377f6d65847c73af5b36ab8b268f6a1))
* **editor:** correct multi-cursor edits and undo grouping ([34a2fad](https://github.com/nocturnium/svelte-ide/commit/34a2fadf7ea791d6b0d0ee2946698c05c60aa634))
* **editor:** expose folding/multi-cursor via Editor/EditorPane and make overlays opt-in ([995f481](https://github.com/nocturnium/svelte-ide/commit/995f4817270fbd15ae99a10a4784a54e10d109b9))
* Overall hardening and improvements ([3a70628](https://github.com/nocturnium/svelte-ide/commit/3a706288b9f9ec2a7ccb8bfb90906fcdeb6b9f93))
* **services:** harden LSP socket lifecycle and isolate optimistic queues ([ed20a51](https://github.com/nocturnium/svelte-ide/commit/ed20a515aa10a8753749304521ec157ed1fb139f))
* **stores:** make collections reactive and fix the dirty-flag latch ([49c5a31](https://github.com/nocturnium/svelte-ide/commit/49c5a311951d99466b2035980bf19eddfc4af6fb))
* **tokenizer:** re-tokenize stale lines and make language support truthful ([f99a827](https://github.com/nocturnium/svelte-ide/commit/f99a827501b73f1265fbb07bfe9172a08a1ab6be))

## [1.0.2](https://github.com/nocturnium/svelte-ide/compare/v1.0.1...v1.0.2) (2026-06-08)


### Bug Fixes

* **tokenizer:** stop template-literal highlighting from leaking past its line ([11066ce](https://github.com/nocturnium/svelte-ide/commit/11066cefa99b38163a2ce669add6dfbcbc36280f))

## [1.0.1](https://github.com/nocturnium/svelte-ide/compare/v1.0.0...v1.0.1) (2026-06-08)


### Bug Fixes

* **editor:** fold/unfold the block containing the cursor, not only the header line ([863752a](https://github.com/nocturnium/svelte-ide/commit/863752a20839e8111f39e6038a67228946c7cc8a))

# 1.0.0 (2026-06-08)


* feat(layout)!: migrate IDELayout from slots to snippet props ([1e5d4a8](https://github.com/nocturnium/svelte-ide/commit/1e5d4a846cfd2135fdcda333ad31fd561ba3dbf3)), closes [#snippet](https://github.com/nocturnium/svelte-ide/issues/snippet)


### Bug Fixes

* **ai:** stop AIPanel auto-save effect from looping ([08e21d9](https://github.com/nocturnium/svelte-ide/commit/08e21d9f280b2397d9f0a501712ea7504316aaa1))
* **demo:** make all demo pages responsive and usable on mobile ([88f7eb6](https://github.com/nocturnium/svelte-ide/commit/88f7eb6473bb119f42eaaed3c1feb3446b0e140c))
* **demo:** scope full-bleed to the IDE pages and widen docs pages on large screens ([33c4d53](https://github.com/nocturnium/svelte-ide/commit/33c4d53f39884e5a6fdad1c808cee3fd583d589b))
* **demo:** seed plugin store offline in the playground to stop /api/plugins 404s ([1933df1](https://github.com/nocturnium/svelte-ide/commit/1933df1f8095e0a188a7693e0348cc0f81e17e4f))
* **editor:** prevent StructureMap each_key_duplicate crash ([978e570](https://github.com/nocturnium/svelte-ide/commit/978e5709e15c11e3b45c1b7d2b6f169beab7df0c))
* **test:** polyfill CloseEvent for Node < 23 so the LSP tests pass in CI ([6162ce0](https://github.com/nocturnium/svelte-ide/commit/6162ce0170b45a3c8adc1c410dbaa8c3b63aee0b))


### Features

* **demo:** full-bleed IDE pages and single-source version badge ([9dd2886](https://github.com/nocturnium/svelte-ide/commit/9dd2886037a33b3bb9f0833f6227d30678e44171))
* from nocturnium/docs/site-visual-and-content-correctness ([f38ffda](https://github.com/nocturnium/svelte-ide/commit/f38ffda374926dc8b07d8ca1f0a2089481e7c7ea))


### BREAKING CHANGES

* IDELayout content is now passed as snippet props
(activityBar, leftSidebar, editor, bottomPanel, rightSidebar, statusBar)

# Changelog

## [Unreleased]

### Breaking
- `IDELayout` content is now provided via **snippet props** (`activityBar`,
  `leftSidebar`, `editor`, `bottomPanel`, `rightSidebar`, `statusBar`) instead of
  named `<slot>`s — use `{#snippet editor()}…{/snippet}` rather than
  `<div slot="editor">…</div>`. Slots are deprecated in Svelte 5 and removed in
  Svelte 6; this was the last public component still using them.

### Fixed
- `StructureMap` no longer crashes with `each_key_duplicate` when two semantic
  regions share a start line (this blanked the Semantic Features demo entirely).
- `AIPanel` auto-save no longer triggers `effect_update_depth_exceeded`: the
  persistence layer's internal state is no longer reactive, and the save is
  debounced out of the effect's synchronous frame.
- All demo/documentation pages are now responsive and usable on mobile
  (single-pane editor with drawers, scrollable tab strips, stacked panels);
  the flagship editor/playground no longer render a blank editor on phones.

### Changed
- Removed the bogus `y-codemirror.next` entry from Vite `optimizeDeps` (it
  errored on every dev start; the package does not use CodeMirror).
- Cleared all remaining `svelte-check` deprecation and a11y warnings (now 0).

## [1.0.0-rc.1] - 2026-06-07

First public release candidate. Open-sourced from a clean history and hardened
for v1 following independent code and design review.

### Breaking
- The package root now exports only the stable core. Backend-dependent
  subsystems (`components/{agents,vfs,plugins}` and the plugin runtime) and the
  `format`/`keybinding` utilities are reachable only via their subpath entries
  (e.g. `@nocturnium/svelte-ide/components/agents`, `/plugins`, `/utils`).
- Removed `createSandbox` / `PluginSandbox` (it executed code via `new Function`
  in the main realm and was not a real security boundary).
- `content` is now a `$bindable()` prop on the editors (enables `bind:content`).

### Added
- MIT `LICENSE` (repo root + `backend/`).
- Shippable theme stylesheet: `import '@nocturnium/svelte-ide/theme.css'`.
- `exports` subpaths for `components/{lsp,agents,vfs,plugins}`, `types`, and
  `utils`, plus `publishConfig.access: "public"`.
- Viewport virtualization for large files; new design tokens (accent, secondary
  cursor/selection, a distinct type-syntax color, extended font scale).
- Community health files (`CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, GitHub
  templates) and extensive `docs/` (getting started, architecture, theming,
  per-subsystem guides, API reference, and an API-stability policy).
- Go LSP bridge: origin allow-list (`-allowed-origins`) and a `-max-sessions`
  cap, with a Security section in the backend README. Self-hosted demo fonts.

### Changed
- Collaboration deps (`yjs`, `y-websocket`, `y-protocols`) are now optional
  `peerDependencies` (`lib0` dropped); the plugin host default path is the
  generic `/api/plugins`; `golang.org/x/net` bumped off a known CVE.
- Curated, stability-tagged public API; aligned package description.

### Fixed
- Editor correctness: multi-line tokenizer state now propagates on single-line
  edits; the shared tokenizer no longer races across editors; controlled-mode no
  longer wipes undo/cursors on echoed updates; `CollaborativeEditor` now sends
  local edits to the CRDT; comment-aware, O(n) folding; word-boundary
  multi-cursor; tab-aware mouse hit-testing; multi-subscriber LSP events.
- Security: stored XSS in the snippet preview and unsafe link schemes in hover
  markdown closed; AI message HTML escaped with link-scheme whitelisting.
- Design: ~63 broken theme-token references repaired; translucent selection wash;
  brighter caret; two broken demo pages restored.

## [0.2.0] - 2026-04-04

### Added
- Comprehensive unit test suite (1,389 tests across 23 files)
- Test coverage for all 21 core editor modules
- Test coverage for base tokenizer and 8 language tokenizers
- `editor-find.ts` -- extracted find/replace logic
- `editor-multicursor.ts` -- extracted multi-cursor helpers
- `editor-input.ts` -- extracted input handling (keyboard, mouse, clipboard, IME)
- `editor-scroll.ts` -- extracted scroll management
- `EditorGutter.svelte` -- extracted gutter sub-component
- `EditorSelections.svelte` -- extracted selection/cursor sub-component
- `EditorLines.svelte` -- extracted line rendering sub-component

### Fixed
- Complexity analyzer: stale cache returning wrong results for mid-file edits
- Complexity analyzer: region detection corrupted by inline object literals and destructuring
- Complexity analyzer: nesting depth undercounted for multiple openers on same line
- Complexity analyzer: control flow keywords counted as function calls
- Complexity analyzer: function definition regex matching if/for/while as functions
- Build warnings: all Svelte 5 a11y and reactivity warnings resolved (0 warnings)
- Vitest config: Playwright e2e tests no longer incorrectly picked up by vitest

### Changed
- CustomEditor.svelte decomposed from 2,038 to 1,164 lines (43% reduction)
- CustomEditor now delegates to focused sub-components and TypeScript modules
- No public API changes -- drop-in compatible with v0.1.0

## [0.1.0] - 2026-03-31

### Added
- Initial release
- Custom code editor (CustomEditor, Editor, CollaborativeEditor)
- LSP integration (LSPEditor, createLSPClient)
- Syntax highlighting for JavaScript, TypeScript, Python, Go, CSS, HTML, Markdown, JSON, Svelte
- Code folding, multi-cursor editing, find/replace
- AI panel and agent awareness
- Plugin system, file explorer, IDE layout
- CRDT collaboration support (optional Yjs)
