import { describe, it, expect } from 'vitest';
import * as acorn from 'acorn';
import { ComplexityAnalyzer } from './complexity-analyzer';
import { analyzeAstComplexity } from './complexity-ast';
import { createEstreeAdapter, type EstreeNode } from './complexity-estree';
import { oracle } from '../../../../../tests/helpers/cognitive-complexity-oracle';
import type { Line } from './state';

/**
 * Conformance against SonarSource's published answers.
 *
 * WHY THIS EXISTS, AND WHY IT IS DIFFERENT FROM EVERY OTHER SUITE HERE.
 *
 * The differential harness asserts that the token scanner and the AST walker
 * agree with `tests/helpers/cognitive-complexity-oracle.ts`, on a curated corpus
 * and on every function in `src/` — 300+ exact comparisons. That is a strong
 * check of CONSISTENCY and it is structurally blind to one thing: a rule the
 * oracle itself gets wrong. Nothing asserted that the oracle matched the
 * specification.
 *
 * It did not. Recursion was charged once per call SITE across all three
 * implementations AND the reference, where the whitepaper charges once per
 * METHOD:
 *
 *   "Cognitive Complexity adds a fundamental increment for each method in a
 *    recursion cycle, whether direct or indirect."   — Recursion section
 *   "each method in a recursion cycle"               — Appendix B.1
 *
 * `fib` with two self-calls scored 3 against a published 2; a five-way tree
 * walker scored 6 against 2. Three hundred comparisons all agreed, because they
 * were agreeing with each other. The corpus could not see it either: its only
 * recursion case has a single call site, where both readings coincide.
 *
 * So these cases come from OUTSIDE the repository, and every one is asserted
 * against all three implementations — scanner, walker, and the oracle that
 * certifies them. This is the check that has to exist for the other 300 to mean
 * what they claim.
 *
 * @see https://www.sonarsource.com/docs/CognitiveComplexity.pdf (v1.7)
 */

const makeLines = (code: string): Line[] =>
	code.split('\n').map((text, number) => ({ number, text }));

const parse = (code: string): EstreeNode =>
	acorn.parse(code, {
		ecmaVersion: 'latest',
		sourceType: 'module',
		locations: true
	}) as unknown as EstreeNode;

/** Outermost region — the function each case declares. Never `regions[0]`. */
const outermost = (regions: Array<{ startLine: number; cognitiveComplexity: number }>) =>
	regions.length === 0
		? 0
		: regions.reduce((best, r) => (r.startLine < best.startLine ? r : best)).cognitiveComplexity;

const scannerScore = (code: string) =>
	outermost(new ComplexityAnalyzer().analyze(makeLines(code), 'typescript').regions);

const walkerScore = (code: string) =>
	outermost(analyzeAstComplexity(parse(code), createEstreeAdapter()));

/** name, published score, source in the paper, code. */
const PUBLISHED: Array<[string, number, string, string]> = [
	[
		'sumOfPrimes',
		7,
		'p.10',
		`function sumOfPrimes(max) {
  let total = 0;
  OUT: for (let i = 1; i <= max; i++) {
    for (let j = 2; j < i; j++) {
      if (i % j === 0) {
        continue OUT;
      }
    }
    total += i;
  }
  return total;
}`
	],
	[
		'getWords',
		1,
		'p.10',
		`function getWords(number) {
  switch (number) {
    case 1:
      return 'one';
    case 2:
      return 'a couple';
    default:
      return 'lots';
  }
}`
	],
	[
		'try/catch with nested control flow',
		9,
		'p.9',
		`function myMethod(a, b, c, d) {
  try {
    if (a) {
      for (const x of b) {
        while (c) {
          d();
        }
      }
    }
  } catch (e) {
    if (a) {
      d();
    }
  }
}`
	],
	[
		'boolean operator runs',
		4,
		'p.8',
		`function f(a, b, c, d, e, f2) {
  if (a && b && c || d || e && f2) return 1;
  return 0;
}`
	],
	[
		'negated sub-expression breaks the run',
		3,
		'p.8',
		`function f(a, b, c) {
  if (a && !(b && c)) return 1;
  return 0;
}`
	],
	[
		'null-coalescing introduces no branch',
		0,
		'p.6',
		`function f(a, b) {
  return a ?? b;
}`
	],
	// --- the case that exposed the recursion defect -------------------------
	[
		'recursion: two self-calls, one method',
		2,
		'App. B.1',
		`function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}`
	],
	[
		'recursion: five self-calls, still one method',
		2,
		'App. B.1',
		`function walk(node) {
  if (!node) return 0;
  return walk(node.a) + walk(node.b) + walk(node.c) + walk(node.d) + walk(node.e);
}`
	],
	[
		'recursion: a single self-call, where both readings coincide',
		2,
		'App. B.1',
		`function fact(n) {
  if (n <= 1) return 1;
  return n * fact(n - 1);
}`
	]
];

describe('conformance: SonarSource published answers', () => {
	describe.each(PUBLISHED)('%s = %i (%s)', (_name, expected, _source, code) => {
		it('token scanner', () => {
			expect(scannerScore(code)).toBe(expected);
		});
		it('AST walker', () => {
			expect(walkerScore(code)).toBe(expected);
		});
		it('the oracle that certifies both', () => {
			// The one that had never been checked against anything external.
			expect(oracle(code)).toBe(expected);
		});
	});
});

describe('conformance: object-literal methods are not named "function"', () => {
	// `save: function (a, b) {` matched the method-style branch of `functionDef`,
	// which excluded control-flow keywords but not `function` itself. The region
	// was named "function", and recursion detection then matched every inner
	// `function (` as a self-call.
	const code = `var M = {
  save: function (a, b) {
    var x = function (p) { return p; };
    var y = function (q) { return q; };
    var z = function (r) { return r; };
    return x(a) + y(b) + z(a);
  }
};`;

	it('scores the straight-line body as 0, not as a pile of phantom recursion', () => {
		expect(scannerScore(code)).toBe(0);
		expect(walkerScore(code)).toBe(0);
	});

	it('emits no recursion increment anywhere', () => {
		const regions = new ComplexityAnalyzer().analyze(makeLines(code), 'typescript').regions;
		const kinds = regions.flatMap((r) => r.contributions.map((c) => c.kind));
		expect(kinds).not.toContain('recursion');
	});

	it('never labels a region "function"', () => {
		const regions = new ComplexityAnalyzer().analyze(makeLines(code), 'typescript').regions;
		expect(regions.map((r) => r.name)).not.toContain('function');
	});
});
