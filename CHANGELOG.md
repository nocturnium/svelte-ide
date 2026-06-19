# [1.5.0](https://github.com/nocturnium/svelte-ide/compare/v1.4.0...v1.5.0) (2026-06-19)


### Bug Fixes

* **a11y/design:** resolve component-level follow-ups from the design audit ([2c33e82](https://github.com/nocturnium/svelte-ide/commit/2c33e829b66d9fb6a47eb6c4073bc6f5d29a1ad4)), closes [#a78bfa](https://github.com/nocturnium/svelte-ide/issues/a78bfa) [#8B5CF6](https://github.com/nocturnium/svelte-ide/issues/8B5CF6)
* **a11y:** keyboard-operable ResizeHandle + correct Tooltip roles ([9424a95](https://github.com/nocturnium/svelte-ide/commit/9424a9583b9c2da0d0ba3f7d97fe53c20635cda3))
* **demo:** correct Symbol Outline + Breadcrumbs line numbers (editor-intelligence) ([a82c5fb](https://github.com/nocturnium/svelte-ide/commit/a82c5fbc029444584bab3d15d8618f907479c478))
* **demo:** make every demo page tell the truth + wire dead controls for real ([118b628](https://github.com/nocturnium/svelte-ide/commit/118b628598d68089c192d00bb592d695fe829e7f))
* **demo:** make the collaboration Store API sample compile against the real exports ([20b41ed](https://github.com/nocturnium/svelte-ide/commit/20b41edc726784cdbf59b7002fd1566a60c04067))
* **demo:** make the debugging diagnostics accurate to the sample code ([0ab830d](https://github.com/nocturnium/svelte-ide/commit/0ab830d14475c814d01e24f4d4c7f3ef8e300aae))
* **design:** apply design-pass findings across all demo pages (AA-clean blue) ([43dfa87](https://github.com/nocturnium/svelte-ide/commit/43dfa87e7859742a8a232e927ba261ab48586270)), closes [#2d5a7b](https://github.com/nocturnium/svelte-ide/issues/2d5a7b) [white-on-#4a8db7](https://github.com/white-on-/issues/4a8db7) [#4a9eff](https://github.com/nocturnium/svelte-ide/issues/4a9eff) [#8b5cf6](https://github.com/nocturnium/svelte-ide/issues/8b5cf6) [#hex](https://github.com/nocturnium/svelte-ide/issues/hex)
* **theme:** one deliberate primary — derive primary-hover from --ide-primary ([3fb11fc](https://github.com/nocturnium/svelte-ide/commit/3fb11fcd77995f02fc829f2fa40994a95c15d250))


### Features

* **editor:** always-visible inline diagnostics (Error Lens) + monochrome severity icons ([0e10cbc](https://github.com/nocturnium/svelte-ide/commit/0e10cbc6e5c36a6908f0e2b8c94f8ade604feb21)), closes [large/hi#DPI](https://github.com/large/hi/issues/DPI)

# [1.4.0](https://github.com/nocturnium/svelte-ide/compare/v1.3.0...v1.4.0) (2026-06-19)


### Features

* **demo:** make the Quick Actions tab tell the truth — real extract-function (Track H ph3a) ([5f7e1ef](https://github.com/nocturnium/svelte-ide/commit/5f7e1ef6215bb5e519dd32e53d24bf0d21aeec6d))
* **demo:** wire extract-variable + organize-imports as real quick actions (Track H ph3b) ([79d7fda](https://github.com/nocturnium/svelte-ide/commit/79d7fda89f04af4e987c8537b0467cbabe2d70dc))

# [1.3.0](https://github.com/nocturnium/svelte-ide/compare/v1.2.1...v1.3.0) (2026-06-19)


### Bug Fixes

* **editor:** close the sibling safe-or-refuse holes + add a parser gate (Track H ph2) ([d0f02c1](https://github.com/nocturnium/svelte-ide/commit/d0f02c10e16e92864bc1af0307989e6f3ea880e4))
* **editor:** close two safe-or-refuse holes in wired extract-function (Track H ph2) ([b32231f](https://github.com/nocturnium/svelte-ide/commit/b32231f1404aba25a461e671fa4056724dd5b39c))
* **editor:** harden extract-function planner before wiring (Track H ph2 prep) ([e22d9ff](https://github.com/nocturnium/svelte-ide/commit/e22d9ffa4c2a6bb2d1d373a0b31585d11f1f7bda))


### Features

* **demo:** extract button uses the interactive accent + a success pill ([3e052aa](https://github.com/nocturnium/svelte-ide/commit/3e052aa34d49879854ce11357a4bc58f37e4f8b1))
* **editor:** add EditorState.transact for single-undo multi-edit (Track H ph2) ([c162530](https://github.com/nocturnium/svelte-ide/commit/c16253024dab10d1558e4e91d454754e1ce73003))
* **editor:** extract-function applier + orchestration (Track H ph2) ([7757d75](https://github.com/nocturnium/svelte-ide/commit/7757d75e1149f0d83d4520c7228f2cc07c80a34b))
* **editor:** wire extract-function into CustomEditor + cognitive-load demo (Track H ph2) ([742f19a](https://github.com/nocturnium/svelte-ide/commit/742f19aea0d2335de336378e2a563c0cbc03f0c2))

## [1.2.1](https://github.com/nocturnium/svelte-ide/compare/v1.2.0...v1.2.1) (2026-06-18)


### Bug Fixes

* **demos:** center every demo page's content column, not just some ([49fd5e9](https://github.com/nocturnium/svelte-ide/commit/49fd5e93a934e1dba01f2dbb25e27adec567b989))

# [1.2.0](https://github.com/nocturnium/svelte-ide/compare/v1.1.1...v1.2.0) (2026-06-18)


### Bug Fixes

* **collab:** give the second editor a distinct presence id (feature-truth) ([5b6b11a](https://github.com/nocturnium/svelte-ide/commit/5b6b11a90b8a2fd17db09c64b6204d9a53aabdbf))
* **crdt:** make replace self-consistent from editor content (10x-review) ([7b20702](https://github.com/nocturnium/svelte-ide/commit/7b2070290cbce914b91c0ab926404d260ec2e5aa))
* **demos:** close re-gate consistency gaps ([f0f32f0](https://github.com/nocturnium/svelte-ide/commit/f0f32f029d421de410f994b6edb425762a578fd3))
* **echo:** render echo readout on an opaque lane, not ghost text over glyphs ([3505140](https://github.com/nocturnium/svelte-ide/commit/35051402e0859b8bbd169fc94fc8833c5a48313f))
* **editor:** close surviving extract-function false-accepts (spaced ++, param scope) ([888d44b](https://github.com/nocturnium/svelte-ide/commit/888d44b12da339e7f3ec4f73424f3827cfb92d7a))
* **editor:** incremental CRDT apply (C1) + honest plugin-preview trust model (C2) ([d617144](https://github.com/nocturnium/svelte-ide/commit/d617144f4916f0d71e4ffee424abb73e49c1277c))
* **editor:** restore extract-function safe-or-refuse on ++/compound/catch (Track H) ([2ff8d1f](https://github.com/nocturnium/svelte-ide/commit/2ff8d1f3ec713745fb8da518e04a3e40be76b0de))
* **landing+demos:** distinct AI icon, themed select, unified headers, mobile hero affordance ([ddd2926](https://github.com/nocturnium/svelte-ide/commit/ddd29265ab8394253e628f07493473888e8d1c2f))
* **landing:** unclip the hero score chip and intensify the thermal glow ([4c441b3](https://github.com/nocturnium/svelte-ide/commit/4c441b3025bdb90fda7f33ed6983070aa9bb5c4f))
* **theme:** make error red AA-safe and route conflict severity through band tokens ([52367b4](https://github.com/nocturnium/svelte-ide/commit/52367b460fb3b05b259de19ad7a10ea1c9c0baf3)), closes [#ef4444](https://github.com/nocturnium/svelte-ide/issues/ef4444) [#1a2744](https://github.com/nocturnium/svelte-ide/issues/1a2744)
* **theme:** make the rich syntax palette the default for every editor surface ([600c76e](https://github.com/nocturnium/svelte-ide/commit/600c76eb674bc8d802736e49b796df01d7a635b2))


### Features

* **collab:** real timeline capture + awareness-driven conflict prediction ([53353e3](https://github.com/nocturnium/svelte-ide/commit/53353e342a4b075f7adf1f9b9d78830f298851bc))
* **complexity:** expose per-region cognitive load to screen readers ([1b774f0](https://github.com/nocturnium/svelte-ide/commit/1b774f09c4872ecce350d463bfcae3df9b0974a2)), closes [hi#complexity](https://github.com/hi/issues/complexity)
* **complexity:** implement SonarSource Cognitive Complexity, language-aware ([210c9d1](https://github.com/nocturnium/svelte-ide/commit/210c9d1190613c53cff4afa6e41d7854df03b8cf))
* **complexity:** make the score badge open the explain-on-hover tooltip ([bcbbf70](https://github.com/nocturnium/svelte-ide/commit/bcbbf700f9f4bf6459d2a20c6fb4c53e5bbf2c06))
* **complexity:** thermal-camera aesthetic for the heatmap ([41d74d0](https://github.com/nocturnium/svelte-ide/commit/41d74d01fc0d248379be8247f655d441800555c1))
* **complexity:** thermal-map heatmap, explain-on-hover, paste-your-code ([1629339](https://github.com/nocturnium/svelte-ide/commit/1629339b07546948eea65bc7c8f3d899060ac669))
* **echo-cursor:** make echo cursors apply real edits, not animation ([10d5805](https://github.com/nocturnium/svelte-ide/commit/10d58055af019750fa1efaf0957ea9d2a36e738f))
* **editor:** pure extract-function planner — safe-or-refuse (Track H ph1) ([5caa03e](https://github.com/nocturnium/svelte-ide/commit/5caa03e216ed051dea26f9676b9a00330e35b640))
* **landing:** lead the hero with the live cognitive-load thermal map ([f8b55e3](https://github.com/nocturnium/svelte-ide/commit/f8b55e3b57be20a59e0b9043e60856b840c36c25))


### Performance Improvements

* **editor:** delta-based undo history, find cull, buffered LSP framing ([d5a965a](https://github.com/nocturnium/svelte-ide/commit/d5a965afeac3d6682d4b5969b5bc953ea3a65a1c))

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
