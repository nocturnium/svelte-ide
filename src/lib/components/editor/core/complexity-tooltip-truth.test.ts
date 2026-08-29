import { describe, it, expect } from 'vitest';
import * as acorn from 'acorn';
import {
	COGNITIVE_COMPLEXITY_BANDS,
	ComplexityAnalyzer,
	getComplexityContributionLabel,
	getComplexityLevel,
	getComplexitySuggestion,
	getLegacyComplexityScore,
	summarizeContributions,
	type ComplexityContribution,
	type ComplexityContributionKind,
	type ComplexityMetrics
} from './complexity-analyzer';
import { analyzeAstComplexity, astComplexityMetrics } from './complexity-ast';
import { createEstreeAdapter, type EstreeNode } from './complexity-estree';
import { mergeProvidedComplexity } from './complexity-provider';
import { CORPUS } from '../../../../../tests/helpers/cognitive-complexity-corpus';
import type { Line } from './state';

/**
 * Tooltip truth.
 *
 * The hover tooltip is headed "Cognitive Complexity" and its footer used to
 * report `factors.branchingFactor` — a cyclomatic-flavoured regex tally that
 * disagrees with the score by construction — beside `factors.nestingDepth`, a
 * cumulative brace counter that never fully unwound and therefore grew with the
 * length of a region rather than its depth. The same deprecated fields also
 * generated the refactor advice printed directly above them.
 *
 * These tests pin the replacement: every number the tooltip shows is derived
 * from `contributions`, which IS the score, and from the region's own line span.
 *
 * No component-test harness exists in this repo (no jsdom, no testing-library),
 * so these assert the data the template binds to rather than rendered DOM. Every
 * value checked here is read by the markup with no further arithmetic.
 */

const makeLines = (code: string): Line[] =>
	code.split('\n').map((text, number) => ({ number, text }));

const adapter = createEstreeAdapter();
const parse = (code: string): EstreeNode =>
	acorn.parse(code, { ecmaVersion: 'latest', locations: true }) as unknown as EstreeNode;

const analyze = (code: string): ComplexityMetrics =>
	new ComplexityAnalyzer().analyze(makeLines(code), 'typescript');

/** Outermost region — NOT `regions[0]`, which can be a nested arrow. */
const outermost = (metrics: ComplexityMetrics) =>
	metrics.regions.reduce((best, r) => (r.startLine < best.startLine ? r : best));

const contribution = (
	over: Partial<ComplexityContribution> & Pick<ComplexityContribution, 'kind' | 'increment'>
): ComplexityContribution => ({
	line: 0,
	nesting: 0,
	reason: 'test',
	...over
});

// ---------------------------------------------------------------------------

describe('summarizeContributions', () => {
	it('is all zeros for a region that scored nothing', () => {
		expect(summarizeContributions([])).toEqual({ maxNesting: 0, incrementCount: 0, total: 0 });
	});

	it('counts increments and reports the deepest one', () => {
		const summary = summarizeContributions([
			contribution({ kind: 'if', increment: 1, nesting: 0 }),
			contribution({ kind: 'for', increment: 2, nesting: 1 }),
			contribution({ kind: 'if', increment: 3, nesting: 2 })
		]);
		expect(summary).toEqual({ maxNesting: 2, incrementCount: 3, total: 6 });
	});

	it('does not count a nested function as an increment', () => {
		// `nested-function` carries increment 0: it explains why the lines under it
		// cost more, it does not cost anything itself. Counting it would report more
		// increments than the score has, in the one place a reader can add them up.
		const summary = summarizeContributions([
			contribution({ kind: 'if', increment: 1, nesting: 0 }),
			contribution({ kind: 'nested-function', increment: 0, nesting: 0 })
		]);
		expect(summary.incrementCount).toBe(1);
		expect(summary.total).toBe(1);
	});

	it('never reports a depth that no increment was charged at', () => {
		// The regression: a nested function declared three levels in, whose body
		// scores nothing. Reading depth off every contribution would advertise
		// "deepest nesting 3" for a region where nothing was ever charged for depth.
		const summary = summarizeContributions([
			contribution({ kind: 'if', increment: 1, nesting: 0 }),
			contribution({ kind: 'nested-function', increment: 0, nesting: 3 })
		]);
		expect(summary.maxNesting).toBe(0);
	});
});

describe('tooltip footer cannot disagree with the headline number', () => {
	// The footer sits directly under the badge showing `cognitiveComplexity` and
	// under a list of the increments. If the summary's total ever diverged from
	// the badge, the tooltip would be contradicting itself in one box.
	it.each(CORPUS)('$name — built-in scanner', ({ code }) => {
		for (const region of analyze(code).regions) {
			expect(summarizeContributions(region.contributions).total).toBe(region.cognitiveComplexity);
		}
	});

	it.each(CORPUS)('$name — parser path', ({ code }) => {
		for (const region of analyzeAstComplexity(parse(code), adapter)) {
			expect(summarizeContributions(region.contributions).total).toBe(region.cognitiveComplexity);
		}
	});
});

describe('getComplexityContributionLabel', () => {
	const KINDS: ComplexityContributionKind[] = [
		'if',
		'else',
		'else if',
		'for',
		'while',
		'loop',
		'switch',
		'catch',
		'ternary',
		'boolean-sequence',
		'labelled-jump',
		'goto',
		'recursion',
		'nested-function'
	];

	it('has a label for every kind, and does not fall back to one', () => {
		// The switch it replaced had `default: return 'if branch'`, so an unhandled
		// kind was silently relabelled as an `if` rather than failing loudly.
		const labels = KINDS.map(getComplexityContributionLabel);
		expect(labels.every((label) => label.length > 0)).toBe(true);
		expect(labels.filter((label) => label === 'if branch')).toHaveLength(1);
	});

	it('does not show the reader a raw enum member', () => {
		// The tooltip previously rendered `contribution.kind` directly, so the list
		// read "boolean-sequence" and "nested-function".
		expect(getComplexityContributionLabel('boolean-sequence')).toBe('boolean operator sequence');
		expect(getComplexityContributionLabel('nested-function')).toBe('nested function');
		expect(getComplexityContributionLabel('labelled-jump')).toBe('labelled jump');
	});
});

// ---------------------------------------------------------------------------

describe('advice is derived from the metric on the label', () => {
	it('says nothing below the Moderate band', () => {
		expect(
			getComplexitySuggestion({
				cognitiveComplexity: COGNITIVE_COMPLEXITY_BANDS.medium - 1,
				contributions: [contribution({ kind: 'if', increment: 4, nesting: 3 })],
				lineCount: 400
			})
		).toBeUndefined();
	});

	it('reports the real nesting depth in the deep-nesting advice', () => {
		const advice = getComplexitySuggestion({
			cognitiveComplexity: 10,
			contributions: [contribution({ kind: 'if', increment: 4, nesting: 3 })],
			lineCount: 10
		});
		expect(advice).toContain('Nested 3 levels deep');
	});

	it('does not call a wide flat function deeply nested', () => {
		// The defect this closes: the old trigger read a brace counter that only
		// decremented on a closing brace on the same pass, so a long flat function
		// accumulated "nesting" it does not have and was told to extract nested
		// logic that is not there. Twelve increments, every one at depth 0.
		const flat = Array.from({ length: 12 }, (_, i) =>
			contribution({ kind: 'if', increment: 1, nesting: 0, line: i })
		);
		const advice = getComplexitySuggestion({
			cognitiveComplexity: 12,
			contributions: flat,
			lineCount: 30
		});
		expect(advice).toBeDefined();
		expect(advice).not.toMatch(/nest/i);
		expect(advice).toMatch(/lookup table/);
	});

	it('names compound conditions when that is what the score is made of', () => {
		const advice = getComplexitySuggestion({
			cognitiveComplexity: 8,
			contributions: [
				contribution({ kind: 'boolean-sequence', increment: 2, nesting: 0, line: 1 }),
				contribution({ kind: 'boolean-sequence', increment: 2, nesting: 0, line: 2 }),
				contribution({ kind: 'boolean-sequence', increment: 2, nesting: 0, line: 3 })
			],
			lineCount: 20
		});
		expect(advice).toMatch(/conditions/);
	});

	it('falls back to the band when no single shape dominates', () => {
		expect(
			getComplexitySuggestion({
				cognitiveComplexity: COGNITIVE_COMPLEXITY_BANDS.high,
				contributions: [contribution({ kind: 'if', increment: 1, nesting: 0 })],
				lineCount: 10
			})
		).toMatch(/High cognitive complexity/);
	});

	it('never mentions function calls, which this metric does not charge for', () => {
		// The removed `callCount > 20` trigger had no Cognitive Complexity analogue
		// at all — the metric deliberately scores nothing for a call — so it printed
		// advice about a quantity the number above it does not measure.
		//
		// The shape matters, or this test asserts nothing. It has to land ABOVE the
		// band (or advice is withheld regardless of any trigger) and MISS every
		// surviving trigger, so that the only thing which could produce
		// call-flavoured advice is a call-flavoured trigger. Measured: 35 calls,
		// complexity 10, 37 lines, 10 increments, all at nesting 0.
		const ifs = Array.from({ length: 10 }, (_, i) => `  if (a) return g${i}();`).join('\n');
		const calls = Array.from({ length: 25 }, (_, i) => `  h${i}();`).join('\n');
		const region = outermost(analyze(`function f(a) {\n${ifs}\n${calls}\n}`));

		expect(region.factors.callCount).toBeGreaterThan(20);
		expect(region.cognitiveComplexity).toBeGreaterThanOrEqual(COGNITIVE_COMPLEXITY_BANDS.high);
		expect(region.factors.lineCount).toBeLessThanOrEqual(50);
		expect(summarizeContributions(region.contributions)).toMatchObject({
			maxNesting: 0,
			incrementCount: 10
		});

		expect(region.suggestion).toBe(
			'High cognitive complexity. This code may be difficult to understand and maintain.'
		);
	});
});

describe('the analyzer publishes the advice it derives', () => {
	it('attaches advice built from contributions, not from the deprecated tallies', () => {
		const deep = `function f(rows) {
  for (const row of rows) {
    for (const cell of row) {
      if (cell) {
        if (cell.x) {
          return cell;
        }
      }
    }
  }
  return null;
}`;
		const region = outermost(analyze(deep));
		expect(region.cognitiveComplexity).toBeGreaterThanOrEqual(COGNITIVE_COMPLEXITY_BANDS.medium);
		expect(summarizeContributions(region.contributions).maxNesting).toBeGreaterThanOrEqual(3);
		expect(region.suggestion).toContain('levels deep');
	});
});

// ---------------------------------------------------------------------------

describe('the parser path explains itself', () => {
	it('produces a breakdown, not just a total', () => {
		// Before this, `astComplexityMetrics` hard-coded `contributions: []`, so the
		// path the guide recommends rendered a tooltip with a line count and nothing
		// else — the built-in scanner explained itself and the accurate one did not.
		const metrics = astComplexityMetrics(
			parse(CORPUS.find((c) => c.name === 'whitepaper sumOfPrimes')!.code),
			adapter
		);
		const region = outermost(metrics);
		expect(region.cognitiveComplexity).toBe(7);
		expect(region.contributions.length).toBeGreaterThan(0);
		expect(summarizeContributions(region.contributions).total).toBe(7);
	});

	it('reports increments in source order even when the adapter does not', () => {
		// `childrenOf` is consumer-supplied, and its "in source order" contract is a
		// request the walker cannot enforce. Several parsers expose children in an
		// order that is convenient rather than positional, and a breakdown listing
		// line 9 above line 1 is unreadable beside the code it explains.
		//
		// This adapter hands back children in REVERSE source order, which is the
		// cheapest way to make visit order and line order disagree. Against a
		// conforming ESTree adapter they never do — pre-order descent over
		// source-ordered children is already source order — so an ESTree fixture
		// would pass whether or not the walker sorted anything.
		type Node = { kind: 'function' | 'if' | null; line: number; children: Node[] };
		const leaf = (line: number): Node => ({ kind: 'if', line, children: [] });
		const root: Node = { kind: 'function', line: 0, children: [leaf(1), leaf(5), leaf(9)] };

		const reversing = {
			kindOf: (node: Node) => node.kind,
			childrenOf: (node: Node) => [...node.children].reverse(),
			lineRangeOf: (node: Node) => ({ startLine: node.line, endLine: node.line }),
			bodyOf: () => null
		};

		const region = analyzeAstComplexity(root, reversing)[0];
		expect(region.contributions.map((c) => c.line)).toEqual([1, 5, 9]);
	});

	it('records a nested function so the depth jump under it is explained', () => {
		const region = analyzeAstComplexity(
			parse(
				'function f(xs) {\n  return xs.map((x) => {\n    if (x) return 1;\n    return 0;\n  });\n}'
			),
			adapter
		).reduce((best, r) => (r.startLine < best.startLine ? r : best));
		const nested = region.contributions.find((c) => c.kind === 'nested-function');
		expect(nested).toBeDefined();
		expect(nested!.increment).toBe(0);
	});

	it('fills the deprecated score instead of reporting 0 for every function', () => {
		// `score: 0` reads as "simple" on the legacy scale, for a region of any
		// complexity. It is deprecated, not licensed to be wrong.
		const metrics = astComplexityMetrics(
			parse('function f(a, b) {\n  if (a && b) return 1;\n  if (a) return 2;\n  return 0;\n}'),
			adapter
		);
		const region = outermost(metrics);
		expect(region.score).toBe(getLegacyComplexityScore(region.cognitiveComplexity));
		expect(region.score).toBeGreaterThan(0);
	});

	it('marks hotspot lines rather than always returning none', () => {
		const hot = `function f(rows) {
  for (const row of rows) {
    for (const cell of row) {
      if (cell && cell.x) {
        for (const y of cell.list) {
          if (y) return y;
        }
      }
    }
  }
  return null;
}`;
		const metrics = astComplexityMetrics(parse(hot), adapter);
		expect(metrics.maxCognitiveComplexity).toBeGreaterThanOrEqual(COGNITIVE_COMPLEXITY_BANDS.high);
		expect(metrics.hotspots.length).toBeGreaterThan(0);
		// Deduplicated and ascending — nested functions share lines with the
		// function enclosing them.
		expect(metrics.hotspots).toEqual([...new Set(metrics.hotspots)].sort((a, b) => a - b));
	});
});

// ---------------------------------------------------------------------------

describe('a merged provider region shows nobody else s numbers', () => {
	const SAMPLE = `function alpha(a, b) {
  for (const x of a) {
    for (const y of b) {
      if (x && y) {
        if (x > y) return x;
      }
    }
  }
  return 0;
}`;

	it('drops the built-in advice when the provider says the region is simple', () => {
		// The exact defect: a merged region inherited `nearest.suggestion`, which was
		// computed from the BUILT-IN score. A provider correcting a false positive
		// down to 0 still displayed "extract the nested logic" underneath its own 0.
		const baseline = analyze(SAMPLE);
		expect(outermost(baseline).suggestion).toBeDefined();

		const merged = mergeProvidedComplexity(
			baseline,
			{ regions: [{ startLine: 0, endLine: 9, cognitiveComplexity: 0 }], source: 'parser' },
			getComplexityLevel
		);
		expect(merged.regions.find((r) => r.startLine === 0)!.suggestion).toBeUndefined();
	});

	it('derives advice from the provider s own breakdown', () => {
		const merged = mergeProvidedComplexity(
			analyze(SAMPLE),
			{
				regions: [
					{
						startLine: 0,
						endLine: 9,
						cognitiveComplexity: 12,
						contributions: [contribution({ kind: 'if', increment: 4, nesting: 3, line: 4 })]
					}
				]
			},
			getComplexityLevel
		);
		expect(merged.regions.find((r) => r.startLine === 0)!.suggestion).toContain(
			'Nested 3 levels deep'
		);
	});

	it('reports the provider s own line span, not the region it overlapped', () => {
		const merged = mergeProvidedComplexity(
			analyze(SAMPLE),
			{ regions: [{ startLine: 1, endLine: 3, cognitiveComplexity: 6 }] },
			getComplexityLevel
		);
		const region = merged.regions.find((r) => r.startLine === 1)!;
		expect(region.factors.lineCount).toBe(3);
	});

	it('derives the deprecated score from the provider s complexity', () => {
		const baseline = analyze(SAMPLE);
		const merged = mergeProvidedComplexity(
			baseline,
			{ regions: [{ startLine: 0, endLine: 9, cognitiveComplexity: 2 }] },
			getComplexityLevel
		);
		const region = merged.regions.find((r) => r.startLine === 0)!;
		expect(region.score).toBe(getLegacyComplexityScore(2));
		expect(region.score).not.toBe(outermost(baseline).score);
	});
});
