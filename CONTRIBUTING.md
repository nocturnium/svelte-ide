# Contributing to @nocturnium/svelte-ide

Thanks for your interest in contributing! This document explains how to set up
the project, the conventions we follow, and how to get a change merged.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Project layout](#project-layout)
- [Development setup](#development-setup)
- [Everyday scripts](#everyday-scripts)
- [Coding conventions](#coding-conventions)
- [Tests](#tests)
- [Commit & PR guidelines](#commit--pr-guidelines)
- [Reporting bugs & requesting features](#reporting-bugs--requesting-features)

## Ways to contribute

- **Bug reports** — open an issue with a minimal reproduction.
- **Bug fixes & features** — open (or comment on) an issue first so we can agree
  on the approach, then send a PR.
- **Documentation** — fixes and additions under [`docs/`](./docs) and the README
  are always welcome and a great first contribution.
- **Examples** — the demo app under `src/routes/` is a good place to showcase a
  component or pattern.

## Project layout

```
src/lib/            # the published library (built into dist/ by svelte-package)
  components/        #   UI: editor, core, ai, lsp, agents, vfs, plugins, layout
  stores/            #   Svelte 5 runes stores (layout, editor, ai, plugin, …)
  services/          #   lsp-client, vfs-client, ide-integration, error-handling
  crdt/              #   optional Yjs-based collaboration (peer dependency)
  plugins/           #   proposal-based plugin system
  types/  utils/     #   shared types and helpers
  styles/theme.css   #   shippable design tokens + component styles
src/routes/         # SvelteKit demo app (NOT published; run with `npm run dev`)
backend/            # standalone Go "lsp-bridge" WebSocket server (separate module)
docs/               # user & contributor documentation
tests/              # Playwright end-to-end tests
```

Only `dist/` (compiled from `src/lib/`) is published to npm — see the `files`
field in `package.json`.

## Development setup

Requirements: **Node.js >= 18** and **npm**. (The optional Go backend needs
**Go >= 1.23**.)

```bash
git clone https://github.com/nocturnium/svelte-ide.git
cd svelte-ide
npm install
npm run dev        # start the demo app at http://localhost:5173
```

### Optional: collaboration dependencies

CRDT collaboration is tree-shakeable and gated behind optional peer
dependencies. Install them only if you work on `src/lib/crdt/` or the
`CollaborativeEditor`:

```bash
npm install yjs y-websocket y-protocols
```

### Optional: the Go LSP backend

```bash
cd backend
go build ./...
go test ./...
go run ./cmd/lsp-bridge        # listens on :8765, localhost origins only
```

## Everyday scripts

| Script               | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `npm run dev`        | Run the demo app (Vite dev server).                           |
| `npm run build`      | Build the demo app.                                           |
| `npm run package`    | Build the publishable library (`svelte-package` + `publint`). |
| `npm run check`      | Type-check with `svelte-check`.                               |
| `npm test`           | Run unit tests (Vitest, single run).                          |
| `npm run test:watch` | Run unit tests in watch mode.                                 |
| `npm run test:e2e`   | Run Playwright end-to-end tests.                              |
| `npm run lint`       | Lint with ESLint.                                             |
| `npm run format`     | Format with Prettier.                                         |

Before opening a PR, please run:

```bash
npm run check && npm run lint && npm test
```

## Coding conventions

- **Svelte 5 + runes.** Use `$state`, `$derived`, `$props`, `$effect`. Avoid
  legacy stores/reactive statements in new code.
- **Zero runtime UI dependencies.** Core components are built from scratch — do
  not add UI/component libraries. The only optional runtime deps are the Yjs
  family, behind the `./crdt` entry point.
- **TypeScript everywhere.** Public API should be fully typed; prefer explicit
  exported types over inferred `any`.
- **Styling via design tokens.** Use the `--ide-*` CSS variables (see
  `src/lib/styles/theme.css`) rather than hard-coded colors so components stay
  themeable.
- **Public API hygiene.** Anything exported from `src/lib/index.ts` ships in the
  published type declarations. Tag exports `@public` (stable) or `@experimental`
  in JSDoc, and keep comments free of internal/private references.
- **Formatting & linting** are enforced by Prettier and ESLint — run
  `npm run format` and `npm run lint:fix` before committing.

## Tests

- **Unit tests** live next to the code as `*.test.ts` and run under Vitest.
- **End-to-end tests** live in `tests/` and run under Playwright.
- New behavior should come with tests. Bug fixes should include a regression
  test where practical.

## Commit & PR guidelines

- Branch off `main`. Keep PRs focused and reasonably small.
- We use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages, e.g. `feat: add bracket-folding toggle`, `fix: escape AI markdown`,
  `docs: document the plugin host contract`.
- Fill in the pull-request template, link the related issue, and note any
  breaking changes (these affect the published API surface).
- Update `CHANGELOG.md` under an `Unreleased` heading when your change is
  user-visible.
- CI must be green (`check`, `lint`, tests) before review.

## Reporting bugs & requesting features

Use the GitHub issue templates. For security-sensitive reports, **do not** open a
public issue — follow [SECURITY.md](./SECURITY.md) instead.
