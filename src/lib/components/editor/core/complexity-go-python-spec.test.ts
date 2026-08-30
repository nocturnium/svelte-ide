import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer } from './complexity-analyzer';
import type { Line } from './state';

/**
 * Go and Python against SonarSource's specification, not against this repo.
 *
 * WHAT THIS ADDS OVER THE PARITY CORPUS. `complexity-parity.test.ts` translates
 * JavaScript cases into Go and Python and inherits the JS oracle's value for each
 * one. That proves the three implementations agree; it cannot prove any of them
 * is right, because the expected number is produced inside this repository. It is
 * exactly the blind spot that let a wrong recursion rule survive 300+ passing
 * comparisons — the oracle had the same defect it was certifying.
 *
 * So every expected value below is derived from Appendix B of the whitepaper,
 * by hand, and the derivation is written out beside it. Nothing here consults the
 * oracle. The specification is normative and short:
 *
 *   B1 — increments: if / else if / else / ternary; switch; for / foreach;
 *        while / do-while; catch; goto LABEL, break LABEL, continue LABEL,
 *        break NUMBER, continue NUMBER; sequences of binary logical operators;
 *        each method in a recursion cycle.
 *   B2 — raise the nesting level: if / else if / else / ternary; switch;
 *        for / foreach; while / do-while; catch; nested methods and
 *        method-like structures such as lambdas.
 *   B3 — take a nesting increment (+1 plus current depth): if / ternary;
 *        switch; for / foreach; while / do-while; catch.
 *
 * Note what B3 omits: `else` and `else if` take a flat +1 and no depth penalty.
 *
 * On applying a Java/JS-flavoured spec to these languages, the paper answers
 * directly: it is written "without being language-exhaustive. That is, if a
 * language has an atypical spelling for a keyword, such as elif for else if, its
 * omission here is not intended to omit it from the specification." Python's
 * `elif` is the paper's own example.
 *
 * WHAT THIS STILL DOES NOT PROVE. This is conformance to a published
 * specification, case by case — not a differential against a second, independent
 * Go or Python implementation. Constructs the specification does not name are
 * covered at the bottom as recorded conventions, clearly separated, because for
 * those there is nothing to conform to.
 *
 * @see https://www.sonarsource.com/docs/CognitiveComplexity.pdf (v1.7, Appendix B)
 */

const makeLines = (code: string): Line[] =>
	code.split('\n').map((text, number) => ({ number, text }));

/** Outermost region — the function each case declares. Never `regions[0]`. */
function score(code: string, language: 'go' | 'python'): number {
	const regions = new ComplexityAnalyzer().analyze(makeLines(code), language).regions;
	if (regions.length === 0) return 0;
	return regions.reduce((best, r) => (r.startLine < best.startLine ? r : best)).cognitiveComplexity;
}

/** name, expected, the Appendix-B arithmetic, code. */
type Case = [string, number, string, string];

const GO: Case[] = [
	[
		'for + if',
		3,
		'for B1+B3 = 1 at depth 0; if B1+B3 = 1+1 inside the for (B2)',
		'func f(xs []int) int {\n\tfor _, x := range xs {\n\t\tif x > 0 {\n\t\t\treturn x\n\t\t}\n\t}\n\treturn 0\n}'
	],
	[
		'three nested loops',
		6,
		'1 + (1+1) + (1+2)',
		'func f(a [][][]int) int {\n\tfor i := range a {\n\t\tfor j := range a[i] {\n\t\t\tfor k := range a[i][j] {\n\t\t\t\t_ = k\n\t\t\t}\n\t\t}\n\t}\n\treturn 0\n}'
	],
	[
		'switch inside for',
		3,
		'for = 1; switch = 1+1 (B3, nested in one B2)',
		'func f(xs []int) int {\n\tfor _, x := range xs {\n\t\tswitch x {\n\t\tcase 1:\n\t\t\treturn 1\n\t\t}\n\t}\n\treturn 0\n}'
	],
	[
		'labelled continue',
		7,
		'for 1 + for 2 + if 3 + `continue OUT` 1 (B1 continue LABEL, no depth)',
		'func sumOfPrimes(max int) int {\n\ttotal := 0\nOUT:\n\tfor i := 1; i <= max; i++ {\n\t\tfor j := 2; j < i; j++ {\n\t\t\tif i%j == 0 {\n\t\t\t\tcontinue OUT\n\t\t\t}\n\t\t}\n\t\ttotal += i\n\t}\n\treturn total\n}'
	],
	[
		'func literal raises nesting',
		2,
		'func literal is a B2 method-like structure, scores 0; the if inside is 1+1',
		'func outer(xs []int) []int {\n\treturn mapInts(xs, func(x int) int {\n\t\tif x > 0 {\n\t\t\treturn 1\n\t\t}\n\t\treturn 0\n\t})\n}'
	],
	[
		'for-as-while, which is Go s only loop keyword',
		3,
		'for 1 + if 1+1',
		'func f(n int) int {\n\ti := 0\n\tfor i < n {\n\t\tif i == 3 {\n\t\t\tbreak\n\t\t}\n\t\ti++\n\t}\n\treturn i\n}'
	],
	[
		'unlabelled break is not an increment',
		1,
		'B1 lists break LABEL and break NUMBER, not bare break: for 1, break 0',
		'func f(xs []int) int {\n\tfor _, x := range xs {\n\t\tbreak\n\t}\n\treturn 0\n}'
	],
	[
		'one run of like operators',
		2,
		'if 1 + one binary-logical sequence 1 (B1, no depth)',
		'func f(a Point) int {\n\tif a.x && a.y && a.z {\n\t\treturn 1\n\t}\n\treturn 0\n}'
	],
	[
		'mixed operators are three runs',
		4,
		'if 1 + runs(&&, ||, &&) = 3',
		'func f(a Point) int {\n\tif a.w && a.x || a.y && a.z {\n\t\treturn 1\n\t}\n\treturn 0\n}'
	],
	[
		'recursion is once per method, not per call site',
		2,
		'if 1 + recursion 1, for two self-calls',
		'func fib(n int) int {\n\tif n <= 1 {\n\t\treturn n\n\t}\n\treturn fib(n-1) + fib(n-2)\n}'
	]
];

const PYTHON: Case[] = [
	[
		'elif, the spec s own example of an atypical spelling',
		3,
		'if 1 + elif 1 + else 1, none taking a depth penalty (absent from B3)',
		'def f(a):\n    if a > 2:\n        return 2\n    elif a > 1:\n        return 1\n    else:\n        return 0'
	],
	[
		'for + if',
		3,
		'for 1 + if 1+1',
		'def f(xs):\n    for x in xs:\n        if x > 0:\n            return x\n    return 0'
	],
	[
		'while + if',
		3,
		'while 1 + if 1+1',
		'def f(n):\n    i = 0\n    while i < n:\n        if i == 3:\n            break\n        i += 1\n    return i'
	],
	[
		'except is catch',
		2,
		'try is not in B1 or B2, so the if inside it is 1 at depth 0; except 1',
		'def f(a):\n    try:\n        if a:\n            return 1\n    except ValueError:\n        return 0\n    return 2'
	],
	[
		'ternary',
		1,
		'conditional expression is B1+B3, at depth 0',
		'def f(a):\n    return 1 if a else 2'
	],
	[
		'lambda is a method-like structure and raises nesting',
		2,
		'lambda B2 scores 0; the ternary inside is 1+1',
		'def f():\n    g = lambda v: 1 if v else 0\n    return g'
	],
	[
		'nested def raises nesting',
		2,
		'nested def B2 scores 0; the if inside is 1+1',
		'def outer(xs):\n    def inner(x):\n        if x > 0:\n            return 1\n        return 0\n    return list(map(inner, xs))'
	],
	[
		'one run of like operators',
		2,
		'if 1 + one sequence 1',
		'def f(a):\n    if a.x and a.y and a.z:\n        return 1\n    return 0'
	],
	[
		'mixed operators are three runs',
		4,
		'if 1 + runs(and, or, and) = 3',
		'def f(a):\n    if a.w and a.x or a.y and a.z:\n        return 1\n    return 0'
	],
	[
		'recursion is once per method, not per call site',
		2,
		'if 1 + recursion 1, for two self-calls',
		'def fib(n):\n    if n <= 1:\n        return n\n    return fib(n - 1) + fib(n - 2)'
	]
];

describe('Go: conformance to Appendix B', () => {
	it.each(GO)('%s = %i  [%s]', (_name, expected, _why, code) => {
		expect(score(code, 'go')).toBe(expected);
	});
});

describe('Python: conformance to Appendix B', () => {
	it.each(PYTHON)('%s = %i  [%s]', (_name, expected, _why, code) => {
		expect(score(code, 'python')).toBe(expected);
	});
});

describe('the breakdown explains the depth it charges', () => {
	it('records the lambda that puts the ternary at nesting 1', () => {
		// Python computes lambda nesting in two independent places: the contribution
		// that appears in the tooltip, and the arithmetic that produces the score.
		// Only the second moves the number, so a score assertion cannot see the
		// first going missing — and a reader would then see `ternary (nesting 1)`
		// with nothing above it accounting for the 1.
		const regions = new ComplexityAnalyzer().analyze(
			makeLines('def f():\n    g = lambda v: 1 if v else 0\n    return g'),
			'python'
		).regions;
		const kinds = regions.flatMap((r) => r.contributions.map((c) => c.kind));
		expect(kinds).toContain('nested-function');
		expect(kinds).toContain('ternary');
	});
});

describe('constructs the specification does not name', () => {
	// Not conformance — there is nothing to conform to. These pin decisions this
	// library made, so that a future change to any of them is a visible choice
	// rather than a drift. Each is recorded in docs/guides/editor.md.
	it('Go select IS scored, as a switch', () => {
		// Absent from B1, B2 and B3, so nothing to conform to — but it is a genuine
		// multi-way branch over channel readiness, and the scanner maps it onto
		// `switch` deliberately, alongside Go's type switch. Scoring it 0 would
		// under-report a five-case select as straight-line code.
		//
		// The guide claimed the opposite ("not scored") while the code scored it.
		// The code was right and the table has been corrected; this pins the
		// behaviour so the two cannot drift apart again.
		const code =
			'func f(a chan int, b chan int) int {\n\tselect {\n\tcase v := <-a:\n\t\treturn v\n\tcase v := <-b:\n\t\treturn v\n\t}\n}';
		expect(score(code, 'go')).toBe(1);
	});

	it('a select nested in a loop takes the depth penalty a switch would', () => {
		const code =
			'func f(a chan int) int {\n\tfor {\n\t\tselect {\n\t\tcase v := <-a:\n\t\t\treturn v\n\t\t}\n\t}\n}';
		expect(score(code, 'go')).toBe(3); // for 1 + select 1+1
	});

	it('Python for...else IS scored, as an else', () => {
		// Absent from B1 as such — B1 lists `else` beside `if`/`else if` — but it is
		// the idiomatic Python spelling of the labelled `continue` in the paper's own
		// `sumOfPrimes`. Excluding it makes that algorithm score 6 in Python against
		// a published 7 in Java, and a metric whose number moves with the language's
		// spelling of one control flow is not measuring the control flow.
		const withElse =
			'def f(xs):\n    for x in xs:\n        if x:\n            return x\n    else:\n        return 0';
		const withoutElse =
			'def f(xs):\n    for x in xs:\n        if x:\n            return x\n    return 0';
		expect(score(withElse, 'python')).toBe(score(withoutElse, 'python') + 1);
	});

	it('the paper s sumOfPrimes scores 7 in Python, as it does in Java', () => {
		// The cross-language parity that settles the rule above.
		const code = [
			'def sum_of_primes(max):',
			'    total = 0',
			'    for i in range(1, max + 1):',
			'        for j in range(2, i):',
			'            if i % j == 0:',
			'                break',
			'        else:',
			'            total += i',
			'    return total'
		].join('\n');
		expect(score(code, 'python')).toBe(7);
	});

	it('a comprehension filter is not scored', () => {
		const code = 'def f(xs):\n    return [x for x in xs if x > 0]';
		expect(score(code, 'python')).toBe(0);
	});
});
