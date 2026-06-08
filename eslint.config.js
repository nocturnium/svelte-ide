import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

// Flat config (ESLint 9) for a SvelteKit + TypeScript + Svelte 5 project.
// Type-aware rules are intentionally left off to keep linting fast and avoid
// coupling to the tsconfig project graph; `svelte-check` already covers types.
export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// TypeScript resolves globals/ambient declarations; eslint's core
			// no-undef is redundant and noisy in a TS project.
			'no-undef': 'off',
			// Allow deliberately-unused bindings when prefixed with `_`
			// (positional params, intentional destructure holes, ignored catches).
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_'
				}
			],
			// svelte-check (the Svelte compiler) is the authoritative source for unused
			// `<!-- svelte-ignore -->` comments; eslint-plugin-svelte's reimplementation
			// disagrees on a11y codes and flags ignores the compiler still needs.
			'svelte/no-unused-svelte-ignore': 'off',
			// The demo app intentionally stores internal hrefs without the base and
			// prefixes `base` at render time; this rule conflicts with that pattern and
			// with typed-routes on dynamically-built hrefs.
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte'],
				svelteConfig
			}
		}
	},
	{
		ignores: [
			'dist/',
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'playwright-report/',
			'test-results/',
			'coverage/'
		]
	}
);
