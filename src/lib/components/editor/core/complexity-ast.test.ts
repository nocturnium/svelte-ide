import { describe, it, expect } from 'vitest';
import * as acorn from 'acorn';
import {
	analyzeAstComplexity,
	astComplexityMetrics,
	createAstComplexityProvider,
	type ComplexityAstAdapter
} from './complexity-ast';
import { createEstreeAdapter, type EstreeNode } from './complexity-estree';
import { ComplexityAnalyzer } from './complexity-analyzer';
import { CORPUS } from '../../../../../tests/helpers/cognitive-complexity-corpus';
import { oracle } from '../../../../../tests/helpers/cognitive-complexity-oracle';
import type { Line } from './state';

const adapter = createEstreeAdapter();

const parse = (code: string): EstreeNode =>
	acorn.parse(code, { ecmaVersion: 'latest', locations: true }) as unknown as EstreeNode;

/** Score of the OUTERMOST function, which is what every corpus entry declares. */
function astScore(code: string): number {
	const regions = analyzeAstComplexity(parse(code), adapter);
	if (regions.length === 0) return 0;
	return regions.reduce((best, r) => (r.startLine < best.startLine ? r : best)).cognitiveComplexity;
}

const makeLines = (code: string): Line[] =>
	code.split('\n').map((text, number) => ({ number, text }));

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

describe('AST walker: the published examples', () => {
	// Pin the walker to the whitepaper directly, not only to the oracle. Two
	// implementations agreeing proves consistency; this proves correctness.
	it('sumOfPrimes is 7', () => {
		expect(astScore(CORPUS.find((c) => c.name === 'whitepaper sumOfPrimes')!.code)).toBe(7);
	});

	it('getWords is 1', () => {
		expect(astScore(CORPUS.find((c) => c.name === 'whitepaper getWords')!.code)).toBe(1);
	});

	it('counts boolean RUNS, not operators', () => {
		expect(astScore('function f(a, b, c) {\n  return a && b;\n}')).toBe(1);
		expect(astScore('function f(a, b, c) {\n  return a && b && c;\n}')).toBe(1);
		expect(astScore('function f(a, b, c) {\n  return a && b || c;\n}')).toBe(2);
		// Parenthesising must not change the score — the rule exists precisely so
		// that how you wrap an expression cannot move the number.
		expect(astScore('function f(a, b, c) {\n  return (a && b) || c;\n}')).toBe(2);
	});

	it('charges nesting to structural constructs and not to else/else-if', () => {
		expect(astScore('function f(a) {\n  if (a) { if (a) {} }\n}')).toBe(3);
		expect(astScore('function f(a) {\n  if (a) {} else if (a) {} else {}\n}')).toBe(3);
	});
});

describe('AST walker: agrees with the independent reference', () => {
	for (const entry of CORPUS) {
		it(entry.name, () => {
			expect(astScore(entry.code), `${entry.name}: walker vs reference`).toBe(oracle(entry.code));
		});
	}

	it('scores every corpus entry identically to the reference', () => {
		const mismatches = CORPUS.map((entry) => ({
			name: entry.name,
			expected: oracle(entry.code),
			actual: astScore(entry.code)
		})).filter((r) => r.expected !== r.actual);

		expect(mismatches, `mismatches:\n${JSON.stringify(mismatches, null, 2)}`).toEqual([]);
	});

	it('agrees with the built-in token scanner too, on all three', () => {
		const scanner = new ComplexityAnalyzer();
		const mismatches = CORPUS.map((entry) => ({
			name: entry.name,
			reference: oracle(entry.code),
			walker: astScore(entry.code),
			scanner: scannerScore(scanner, entry.code)
		})).filter((r) => r.reference !== r.walker || r.reference !== r.scanner);

		expect(mismatches, `three-way mismatches:\n${JSON.stringify(mismatches, null, 2)}`).toEqual([]);
	});
});

describe('AST walker: else in ESTree, which has no else node', () => {
	// The alternate slot holds whatever follows `else`. When that is itself a
	// scoring construct the node is two things at once, and a naive adapter drops
	// one of the two increments.
	//
	// The score must not depend on whether the author wrote braces. Both forms are
	// if(+1) + else(+1) + construct at depth 1(+2) = 4.
	it('scores a braceless `else while` exactly as the braced form', () => {
		const braceless = 'function f(a) {\n  if (a) {} else while (a) {}\n}';
		const braced = 'function f(a) {\n  if (a) {} else { while (a) {} }\n}';
		expect(astScore(braceless)).toBe(4);
		expect(astScore(braced)).toBe(4);
		expect(astScore(braceless)).toBe(oracle(braceless));
	});

	it('scores a braceless `else switch` exactly as the braced form', () => {
		expect(astScore('function f(a) {\n  if (a) {} else switch (a) {}\n}')).toBe(4);
		expect(astScore('function f(a) {\n  if (a) {} else { switch (a) {} }\n}')).toBe(4);
	});

	it('nests inside an else branch', () => {
		// if(+1) + else(+1) + if at depth 1(+2) = 4
		expect(astScore('function f(a) {\n  if (a) {} else { if (a) {} }\n}')).toBe(4);
	});
});

describe('AST walker: nesting rules', () => {
	it('a nested function raises nesting for its contents', () => {
		const flat = 'function f(a) {\n  if (a) {}\n}';
		const nested = 'function f(a) {\n  const g = () => { if (a) {} };\n}';
		expect(astScore(flat)).toBe(1);
		// The callback's `if` sits one level deeper, so the OUTER function pays 2.
		expect(astScore(nested)).toBe(2);
	});

	it('does not charge nesting to a loop header', () => {
		// The ternary is in the init clause, not the body: +1, not +2.
		expect(astScore('function f(a) {\n  for (let i = a ? 0 : 1; i < 9; i++) {}\n}')).toBe(2);
	});

	it('scores a parameter default at the function\u2019s own nesting level', () => {
		// The parameter rule, decided during the 2.0.0 cut. It had three answers
		// across three implementations \u2014 the walker said 1, the token scanner said 1,
		// and the reference said 0 because it began walking at `.body` and never saw
		// a default at all. A construct in a default is real branching the reader has
		// to follow, so it counts; it sits at the function's boundary rather than
		// inside its body, so it takes no nesting penalty of its own.
		const code = 'function f(a, b = a ? 1 : 2) {\n  return b;\n}';
		expect(astScore(code)).toBe(1);
		expect(oracle(code)).toBe(1);
	});

	it('still raises nesting for an arrow in a parameter default', () => {
		// The other half of the rule: a default that CONTAINS a function is still a
		// nested function, so its own body nests.
		const code = 'function f(cb = (v) => { if (v) return 1; }) {\n  return cb;\n}';
		expect(astScore(code)).toBe(2);
		expect(oracle(code)).toBe(2);
	});

	it('counts direct recursion but not a same-named method call', () => {
		// `db.save(x)` inside `save()` is not a recursive call. An over-eager
		// version of this rule was a real defect in the token scanner.
		expect(astScore('function save(x) {\n  if (x) save(x - 1);\n}')).toBe(2);
		expect(astScore('function save(x) {\n  if (x) db.save(x - 1);\n}')).toBe(1);
	});

	it('counts a callback that re-enters the function being scored', () => {
		// Found by the repo-wide sweep, in this repository's own `connect()`: a
		// setTimeout callback calls `connect`. The innermost enclosing function is
		// the anonymous callback, but the call still re-enters `connect`, so it is
		// recursion for `connect`'s score.
		const code = 'function connect(id) {\n  setTimeout(() => { connect(id); }, 10);\n}';
		const regions = analyzeAstComplexity(parse(code), adapter);
		expect(regions.find((r) => r.name === 'connect')?.cognitiveComplexity).toBe(1);
	});

	it('scores a nested function’s own self-calls in its own pass', () => {
		const code = 'function outer() {\n  const walk = (n) => { walk(n); };\n}';
		const regions = analyzeAstComplexity(parse(code), adapter);
		// `walk(n)` is not recursion for `outer` — only for `walk`.
		expect(regions.find((r) => r.name === 'outer')?.cognitiveComplexity).toBe(0);
		expect(regions.find((r) => r.name === 'walk')?.cognitiveComplexity).toBe(1);
	});

	it('does not charge nesting to an if condition', () => {
		// if(+1) + ternary in the TEST at depth 0(+1) = 2
		expect(astScore('function f(a) {\n  if (a ? a : !a) {}\n}')).toBe(2);
	});

	it('charges nesting to both ternary branches', () => {
		// outer(+1) + inner in the alternate at depth 1(+2) = 3
		expect(astScore('function f(a) {\n  return a ? 1 : a ? 2 : 3;\n}')).toBe(3);
	});
});

describe('AST walker: regions', () => {
	it('reports every function, each scored from its own baseline', () => {
		const code = [
			'function outer(a) {',
			'  if (a) {}',
			'  function inner(b) {',
			'    if (b) {}',
			'  }',
			'}'
		].join('\n');
		const regions = analyzeAstComplexity(parse(code), adapter);

		expect(regions.map((r) => r.name).sort()).toEqual(['inner', 'outer']);
		// `inner` alone is 1; `outer` pays for its own if plus inner's, nested.
		expect(regions.find((r) => r.name === 'inner')?.cognitiveComplexity).toBe(1);
		expect(regions.find((r) => r.name === 'outer')?.cognitiveComplexity).toBe(3);
	});

	it('names functions held by a variable, property or method', () => {
		const code = [
			'const arrow = (a) => { if (a) {} };',
			'const obj = { prop(a) { if (a) {} } };',
			'class K { method(a) { if (a) {} } }'
		].join('\n');
		const names = analyzeAstComplexity(parse(code), adapter).map((r) => r.name);
		expect(names).toEqual(expect.arrayContaining(['arrow', 'prop', 'method']));
	});

	it('reports 0-based inclusive line spans', () => {
		const region = analyzeAstComplexity(parse('function f() {\n  return 1;\n}'), adapter)[0];
		expect(region.startLine).toBe(0);
		expect(region.endLine).toBe(2);
	});
});

describe('AST provider', () => {
	const request = (code: string) => ({
		code,
		language: 'javascript',
		baseline: new ComplexityAnalyzer().analyze(makeLines(code), 'javascript'),
		signal: new AbortController().signal
	});

	const provider = createAstComplexityProvider({
		parse: (code) => parse(code),
		source: 'acorn',
		adapter
	});

	it('returns validated regions tagged with their provenance', async () => {
		const result = await provider(request('function f(a) {\n  if (a) { if (a) {} }\n}'));
		expect(result?.source).toBe('acorn');
		expect(result?.regions[0].cognitiveComplexity).toBe(3);
	});

	it('declines on a parse error rather than blanking the reading', async () => {
		// Mid-edit code is unparseable constantly. Declining leaves the token
		// scanner's number on screen; throwing or returning 0 would make the UI
		// flicker to "simple" every time a brace is open.
		expect(await provider(request('function f( {'))).toBeNull();
	});

	it('declines when the file has no functions', async () => {
		expect(await provider(request('const x = 1;'))).toBeNull();
	});

	it('builds metrics whose band always matches the number', async () => {
		const metrics = astComplexityMetrics(
			parse('function f(a) {\n  if (a) { if (a) { if (a) { if (a) { if (a) {} } } } }\n}'),
			adapter
		);
		expect(metrics.maxCognitiveComplexity).toBe(15);
		expect(metrics.level).toBe('critical');
		expect(metrics.source).toBe('provider');
		expect(metrics.regions[0].level).toBe('critical');
	});
});

describe('AST walker: adapter contract', () => {
	// A hand-rolled tree standing in for tree-sitter, SWC, or any non-ESTree
	// parser: if the walker only works on ESTree shapes, the seam is a lie.
	interface Toy {
		k: string;
		kids?: Toy[];
		line?: number;
	}

	const toyAdapter: ComplexityAstAdapter<Toy> = {
		kindOf: (n) =>
			n.k === 'fn'
				? 'function'
				: n.k === 'if'
					? 'if'
					: n.k === 'loop'
						? 'loop'
						: n.k === 'and'
							? 'boolean-sequence'
							: null,
		childrenOf: (n) => n.kids ?? [],
		lineRangeOf: (n) => ({ startLine: n.line ?? 0, endLine: n.line ?? 0 }),
		nameOf: () => 'toy'
	};

	it('applies the rules to a tree that is not ESTree at all', () => {
		const tree: Toy = {
			k: 'fn',
			kids: [{ k: 'loop', kids: [{ k: 'if', kids: [{ k: 'and' }] }] }]
		};
		// loop(+1) + if at depth 1(+2) + boolean at depth 2, flat(+1) = 4
		const regions = analyzeAstComplexity(tree, toyAdapter);
		expect(regions).toHaveLength(1);
		expect(regions[0].cognitiveComplexity).toBe(4);
	});

	it('nests every child when the adapter declines to name a body', () => {
		// bodyOf is optional; omitting it must not silently drop the nesting rule.
		const tree: Toy = { k: 'fn', kids: [{ k: 'if', kids: [{ k: 'if' }] }] };
		expect(analyzeAstComplexity(tree, toyAdapter)[0].cognitiveComplexity).toBe(3);
	});
});
