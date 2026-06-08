// Conventional Commits enforcement (see CONTRIBUTING.md). Linted on pull requests
// by .github/workflows/ci.yml and consumed by semantic-release to compute versions.
//
// `type(scope): subject` — types: feat, fix, perf, refactor, docs, style, test,
// build, ci, chore, revert. A `!` after the type/scope or a `BREAKING CHANGE:`
// footer marks a breaking change. (The historical `polish()` type is not valid —
// use `style`, `refactor`, or `chore`.)
export default {
	extends: ['@commitlint/config-conventional']
};
