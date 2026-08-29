import { describe, it, expect, beforeEach } from 'vitest';
import { ComplexityAnalyzer } from './complexity-analyzer';
import { CORPUS } from '../../../../../tests/helpers/cognitive-complexity-corpus';
import { oracle } from '../../../../../tests/helpers/cognitive-complexity-oracle';
import type { Line } from './state';

/**
 * Differential test: this analyzer vs an INDEPENDENT reference implementation.
 *
 * Why this file exists. Three review rounds of this feature each shipped a
 * confidently-wrong number: `?.` counted as a branch, a saturating score, a
 * contrast figure computed against the wrong colour. Every one was encoded in
 * code, restated in a comment, asserted in a test, and agreed with by everyone
 * who read all three — because nothing here could be falsified from outside the
 * repository. A reviewer eventually wrote a reference implementation on an AST
 * and found 131 of 1742 functions disagreed, including the single most important
 * rule in the metric (nesting is not counted for braceless bodies).
 *
 * So: the oracle is written from the SonarSource whitepaper's rules over an
 * acorn ESTree AST, deliberately NOT from the analyzer's logic. The analyzer is
 * token-based and language-agnostic; the oracle is AST-based and JS/TS only.
 * They share no code and no assumptions, so agreement is evidence.
 *
 * It lives in tests/helpers/cognitive-complexity-oracle.ts and is imported here.
 * A byte-identical copy used to sit in this file, which meant a correction to the
 * reference could be applied to one and not the other — the analyzer would then
 * be graded against a stale rule by exactly the harness built to stop that.
 *
 * acorn is a devDependency and this is a `*.test.ts`, which
 * scripts/strip-dist-tests.mjs removes from `dist/` — the package's
 * zero-runtime-dependency guarantee is untouched.
 *
 * @see https://www.sonarsource.com/docs/CognitiveComplexity.pdf
 */

function makeLines(code: string): Line[] {
	return code.split('\n').map((text, number) => ({ number, text }));
}

/**
 * Score of the OUTERMOST region, which is the function every corpus entry
 * declares. NOT `regions[0]`: a nested arrow gets a region of its own and can
 * sort ahead of the function enclosing it, so index 0 silently compares the
 * wrong function against the reference.
 */
function scannerScore(analyzer: ComplexityAnalyzer, code: string): number {
	const regions = analyzer.analyze(makeLines(code), 'typescript').regions;
	if (regions.length === 0) return 0;
	return regions.reduce((best, r) => (r.startLine < best.startLine ? r : best)).cognitiveComplexity;
}

describe('cognitive complexity: differential vs AST reference', () => {
	let analyzer: ComplexityAnalyzer;

	beforeEach(() => {
		analyzer = new ComplexityAnalyzer();
	});

	// Pin the ORACLE first. If the reference drifts, every agreement below becomes
	// meaningless, so these are the whitepaper's own published answers.
	describe('the reference itself matches the published examples', () => {
		it('sumOfPrimes is 7', () => {
			expect(oracle(CORPUS.find((c) => c.name === 'whitepaper sumOfPrimes')!.code)).toBe(7);
		});

		it('getWords is 1', () => {
			expect(oracle(CORPUS.find((c) => c.name === 'whitepaper getWords')!.code)).toBe(1);
		});

		it('boolean runs: a && b is 1, a && b || c is 2', () => {
			expect(oracle('function f(a, b, c) {\n  return a && b;\n}')).toBe(1);
			expect(oracle('function f(a, b, c) {\n  return a && b || c;\n}')).toBe(2);
		});
	});

	describe('analyzer agrees with the reference', () => {
		for (const entry of CORPUS) {
			it(entry.name, () => {
				const expected = oracle(entry.code);
				expect(scannerScore(analyzer, entry.code), `${entry.name}: analyzer vs reference`).toBe(
					expected
				);
			});
		}
	});

	it('scores every corpus entry identically to the reference', () => {
		const mismatches = CORPUS.map((entry) => {
			const expected = oracle(entry.code);
			const actual = scannerScore(analyzer, entry.code);
			return { name: entry.name, expected, actual };
		}).filter((r) => r.expected !== r.actual);

		expect(mismatches, `mismatches:\n${JSON.stringify(mismatches, null, 2)}`).toEqual([]);
	});
});
