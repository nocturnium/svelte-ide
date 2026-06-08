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
