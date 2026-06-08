// Conventional Commits enforcement (see CONTRIBUTING.md). Linted on pull requests
// by .github/workflows/ci.yml and consumed by semantic-release to compute versions.
//
// `type(scope): subject` — types: feat, fix, perf, refactor, docs, style, test,
// build, ci, chore, revert. A `!` after the type/scope or a `BREAKING CHANGE:`
// footer marks a breaking change. (The historical `polish()` type is not valid —
// use `style`, `refactor`, or `chore`.)
export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		// Don't nitpick body wrapping — bodies routinely carry URLs, error output,
		// and explanatory prose. The type/scope/subject rules are what we enforce.
		'body-max-line-length': [0, 'always', 100]
	}
};
