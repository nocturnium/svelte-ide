import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { createAstComplexityProvider } from './complexity-ast';
import { createEstreeAdapter } from './complexity-estree';
import { ComplexityAnalyzer } from './complexity-analyzer';
import { CORPUS, PARITY_CORPUS } from '../../../../../tests/helpers/cognitive-complexity-corpus';
import type { Line } from './state';

/**
 * The acorn snippet in the guide, extracted from the markdown and RUN.
 *
 * This block is the one readers copy first — it is the recommended way to fill
 * the provider seam, and it is the only one whose dependency this repository
 * already has. It has been wrong before: it was missing `sourceType: 'module'`,
 * so acorn threw on the first `import` in any real file, the provider declined,
 * and the reader silently got the built-in reading while believing they were
 * getting the parser's. Nothing failed loudly. Nothing failed at all.
 *
 * A snippet nobody executes is a claim, not documentation. This executes it.
 *
 * Only the acorn block is covered. The tree-sitter one is labelled a sketch in
 * the guide and needs a 411KB vendored `.wasm` plus node-gyp — a heavy dependency
 * for 1 of 88 fenced blocks, in a package whose selling point is having none.
 */

const GUIDE = new URL('../../../../../docs/guides/editor.md', import.meta.url);

/** The fenced block that builds an acorn-backed provider. */
function extractAcornSnippet(): string {
	const markdown = readFileSync(GUIDE, 'utf8');
	const blocks = [...markdown.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);
	const matches = blocks.filter(
		(b) => b.includes('createAstComplexityProvider') && b.includes('acorn.parse')
	);
	// Exactly one, or the test is silently covering the wrong thing.
	expect(matches, 'guide must contain exactly one runnable acorn provider block').toHaveLength(1);
	return matches[0];
}

/**
 * Run the snippet with its imports supplied rather than resolved.
 *
 * The block imports from the published package name, which does not resolve to
 * this working tree. Stripping the import lines and injecting the same bindings
 * runs the reader's code path without asking the test to fake it — every line
 * below the imports is executed exactly as written in the guide.
 */
function runSnippet(source: string): ReturnType<typeof createAstComplexityProvider> {
	const body = source
		.split('\n')
		.filter((line) => !/^\s*import\s/.test(line))
		.join('\n');

	const build = new Function(
		'createAstComplexityProvider',
		'createEstreeAdapter',
		'acorn',
		`${body}\nreturn provider;`
	);
	return build(createAstComplexityProvider, createEstreeAdapter, acorn);
}

const makeLines = (code: string): Line[] =>
	code.split('\n').map((text, number) => ({ number, text }));

describe('numbers the guide quotes about its own verification', () => {
	it('states the real corpus size', () => {
		// It said "30-case" while the corpus held 36. A number a reader is invited
		// to weigh the metric by has to be the number, and this one only moves when
		// someone adds a case — exactly the moment they will not think to grep the
		// docs. It earned itself on the first run by catching 37, a miscount from a
		// `grep -c` that also matched the type annotation. The other quoted figure,
		// "over 300 comparisons", is already pinned by complexity-sweep.test.ts
		// asserting the same bound.
		const markdown = readFileSync(GUIDE, 'utf8');
		const stated = markdown.match(/(\d+)-case curated corpus/);
		expect(stated, 'guide must quote the corpus size').not.toBeNull();
		expect(Number(stated![1])).toBe(CORPUS.length);
	});

	it('states the real parity-corpus size, in both places it quotes it', () => {
		const markdown = readFileSync(GUIDE, 'utf8');
		const quoted = [...markdown.matchAll(/(\d+)-case parity corpus/g)].map((m) => Number(m[1]));
		expect(quoted.length, 'guide must quote the parity corpus size').toBeGreaterThan(0);
		for (const n of quoted) expect(n).toBe(PARITY_CORPUS.length);
	});

	it('states how many parity cases actually discriminate their language', () => {
		// The guide's "seven of the 28 score differently if told the wrong language"
		// is the load-bearing claim — it separates a corpus that exercises the Go and
		// Python rules from one that merely coincides with the shared core, and it is
		// the number most likely to drift as those rules change. It caught its own
		// author: the guide first said "nine", counted by eye off a probe table.
		const analyzer = new ComplexityAnalyzer();
		const score = (code: string, language: string): number => {
			const regions = analyzer.analyze(makeLines(code), language).regions;
			if (regions.length === 0) return 0;
			return regions.reduce((b, r) => (r.startLine < b.startLine ? r : b)).cognitiveComplexity;
		};
		const discriminating = PARITY_CORPUS.filter(
			(p) => score(p.code, p.language) !== score(p.code, 'javascript')
		).length;

		const markdown = readFileSync(GUIDE, 'utf8');
		const stated = markdown.match(/(\w+) of the \d+ score differently/);
		expect(stated, 'guide must state the discriminating count').not.toBeNull();
		const words: Record<string, number> = {
			six: 6,
			seven: 7,
			eight: 8,
			nine: 9,
			ten: 10,
			eleven: 11,
			twelve: 12
		};
		expect(words[stated![1].toLowerCase()] ?? Number(stated![1])).toBe(discriminating);
	});
});

describe('the acorn snippet in docs/guides/editor.md', () => {
	it('is present and constructs a provider', () => {
		const provider = runSnippet(extractAcornSnippet());
		expect(typeof provider).toBe('function');
	});

	it('scores a module rather than declining on its first import', async () => {
		// The exact regression. `sourceType: 'module'` absent => acorn throws on
		// `import` => the provider catches, declines, and returns null.
		const code = [
			"import { helper } from './helper';",
			'',
			'export function triage(items) {',
			'  for (const item of items) {',
			'    if (item.urgent && item.open) {',
			'      return helper(item);',
			'    }',
			'  }',
			'  return null;',
			'}'
		].join('\n');

		const provider = runSnippet(extractAcornSnippet());
		const baseline = new ComplexityAnalyzer().analyze(makeLines(code), 'typescript');

		const result = await provider({
			code,
			language: 'typescript',
			baseline,
			signal: new AbortController().signal
		});

		expect(result, 'provider declined — the snippet cannot parse a module').not.toBeNull();
		expect(result!.source).toBe('acorn');

		const triage = result!.regions.find((r) => r.name === 'triage');
		expect(triage).toBeDefined();
		// for(+1) + if(+2, nesting 1) + boolean run(+1) = 4. Pinned, so the snippet
		// is checked for a correct reading rather than merely a non-null one.
		expect(triage!.cognitiveComplexity).toBe(4);

		// `locations: true` is load-bearing in the same silent way `sourceType` is.
		// Without it acorn omits `loc`, the ESTree adapter falls back to
		// `{ startLine: 0, endLine: 0 }`, and every region the provider reports
		// claims the first line of the file — which then lands on whatever the
		// merge finds overlapping there. Nothing throws.
		expect(triage!.startLine).toBe(2);
		expect(triage!.endLine).toBe(9);
	});

	it('carries the per-line breakdown the guide promises', async () => {
		const code = 'export function f(a, b) {\n  if (a && b) return 1;\n  return 0;\n}';
		const provider = runSnippet(extractAcornSnippet());
		const result = await provider({
			code,
			language: 'typescript',
			baseline: new ComplexityAnalyzer().analyze(makeLines(code), 'typescript'),
			signal: new AbortController().signal
		});

		const region = result!.regions.find((r) => r.name === 'f');
		expect(region?.contributions?.length).toBeGreaterThan(0);
		expect(region!.contributions!.reduce((t, c) => t + c.increment, 0)).toBe(
			region!.cognitiveComplexity
		);
	});
});
