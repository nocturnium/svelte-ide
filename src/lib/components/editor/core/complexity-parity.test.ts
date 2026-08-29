import { describe, it, expect, beforeEach } from 'vitest';
import { ComplexityAnalyzer } from './complexity-analyzer';
import { CORPUS, PARITY_CORPUS } from '../../../../../tests/helpers/cognitive-complexity-corpus';
import { oracle } from '../../../../../tests/helpers/cognitive-complexity-oracle';
import type { Line } from './state';

/**
 * Go and Python, judged against the SAME independent reference as JavaScript.
 *
 * The gap this closes: the oracle is an acorn ESTree walk, so it speaks
 * JavaScript and nothing else, while the scanner claims four languages. Every Go
 * and Python assertion in this repository was therefore written by reading the
 * scanner's output and pinning it — which proves the scanner has not changed, not
 * that it is right. The two languages with the fewest eyes on them had the
 * weakest evidence behind them.
 *
 * The trick is translation. Each parity case is a Go or Python rendering of a
 * named JavaScript case and inherits that case's oracle value; acorn scores the
 * JavaScript, and the scanner is asked to reach the same number from source acorn
 * never sees. Nothing here is scored by the implementation under test and then
 * asserted against itself.
 *
 * A failure is genuinely ambiguous — a scanner defect OR an unfaithful
 * translation — and that ambiguity is the point. Both are worth finding, and
 * neither is visible while the expected value comes from the scanner.
 */

function makeLines(code: string): Line[] {
	return code.split('\n').map((text, number) => ({ number, text }));
}

/**
 * Score of the OUTERMOST region — the function each case declares.
 *
 * NOT `regions[0]`: a nested function gets a region of its own and can sort ahead
 * of the function enclosing it, so index 0 silently compares the wrong function.
 */
function scannerScore(analyzer: ComplexityAnalyzer, code: string, language: string): number {
	const regions = analyzer.analyze(makeLines(code), language).regions;
	if (regions.length === 0) return 0;
	return regions.reduce((best, r) => (r.startLine < best.startLine ? r : best)).cognitiveComplexity;
}

describe('cognitive complexity parity: Go and Python vs the JS reference', () => {
	let analyzer: ComplexityAnalyzer;

	beforeEach(() => {
		analyzer = new ComplexityAnalyzer();
	});

	const bodyFor = (name: string): string => CORPUS.find((c) => c.name === name)!.code;

	describe('the corpus is wired up correctly', () => {
		it('every parity case names a JS case that exists', () => {
			// A typo in `inherits` would otherwise throw at lookup inside one test and
			// read as a scoring failure, or worse, silently skip.
			const dangling = PARITY_CORPUS.filter((p) => !CORPUS.some((c) => c.name === p.inherits)).map(
				(p) => `${p.name} -> ${p.inherits}`
			);
			expect(dangling, `dangling inherits:\n${dangling.join('\n')}`).toEqual([]);
		});

		it('covers both languages with enough cases to mean something', () => {
			const go = PARITY_CORPUS.filter((p) => p.language === 'go');
			const py = PARITY_CORPUS.filter((p) => p.language === 'python');
			expect(go.length).toBeGreaterThanOrEqual(12);
			expect(py.length).toBeGreaterThanOrEqual(12);
		});

		it('has no duplicate names', () => {
			const names = PARITY_CORPUS.map((p) => p.name);
			expect(new Set(names).size).toBe(names.length);
		});

		it('spans a real range of scores, not just the trivial ones', () => {
			// Fourteen cases that all score 0 or 1 would pass while saying nothing.
			const values = [...new Set(PARITY_CORPUS.map((p) => oracle(bodyFor(p.inherits))))];
			expect(Math.max(...values)).toBeGreaterThanOrEqual(6);
			expect(values.length).toBeGreaterThanOrEqual(6);
		});

		it('actually exercises the language-specific rules', () => {
			// Measured, and worth being precise about: for 21 of these 28 cases the
			// scanner reaches the same number whether it is told `go`/`python` or
			// `javascript`, because brace- and keyword-shaped constructs fall out of
			// the shared core. Those cases still prove the SCORE is right; they do not
			// prove the language dispatch ran.
			//
			// Seven do: `elif`, Python's `x if c else y` ternary, `try`/`except`, and
			// recursion and nested-function nesting in both languages. Asserting a
			// floor here means the corpus cannot quietly lose its discriminating power
			// — if someone generalises the JavaScript path far enough to absorb these,
			// this test says so.
			const discriminating = PARITY_CORPUS.filter(
				(p) =>
					scannerScore(analyzer, p.code, p.language) !==
					scannerScore(analyzer, p.code, 'javascript')
			);
			expect(
				discriminating.length,
				`only ${discriminating.length} cases distinguish their language from JavaScript`
			).toBeGreaterThanOrEqual(6);
		});
	});

	describe('each translation scores what the reference says its original scores', () => {
		for (const entry of PARITY_CORPUS) {
			it(`${entry.name} (inherits "${entry.inherits}")`, () => {
				const expected = oracle(bodyFor(entry.inherits));
				const actual = scannerScore(analyzer, entry.code, entry.language);
				expect(actual, `${entry.name}: scanner ${actual} vs acorn-on-JS-original ${expected}`).toBe(
					expected
				);
			});
		}
	});

	it('reports every divergence at once rather than the first', () => {
		const mismatches = PARITY_CORPUS.map((entry) => ({
			name: entry.name,
			language: entry.language,
			inherits: entry.inherits,
			expected: oracle(bodyFor(entry.inherits)),
			actual: scannerScore(analyzer, entry.code, entry.language)
		})).filter((r) => r.expected !== r.actual);

		expect(mismatches, `mismatches:\n${JSON.stringify(mismatches, null, 2)}`).toEqual([]);
	});
});
