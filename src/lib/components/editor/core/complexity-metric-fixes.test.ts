import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer } from './complexity-analyzer';
import type { Line } from './state';

/**
 * Metric defects found by review and by the adversarial planning sweep.
 *
 * Every case here scored WRONG before its fix, and each assertion is an exact
 * value rather than a bound. A `>= 2` would have passed whether the decorator
 * fix worked or did nothing at all, which is the failure mode that let several
 * of these survive four review rounds.
 */

const mk = (code: string): Line[] => code.split('\n').map((text, number) => ({ number, text }));

const cc = (code: string, language: string): number =>
	new ComplexityAnalyzer().analyze(mk(code), language).regions[0]?.cognitiveComplexity ?? 0;

describe('decorated methods are declarations, not recursive calls', () => {
	// `@Input() compute()` put a `)` immediately before the method name, so the
	// backward scan for a declaration position gave up and concluded `compute`
	// was being CALLED — inside a region also named `compute`. Every decorated
	// method took a phantom +1, and the tooltip attributed it to a real line.
	it.each([
		['bare', '@Input compute() {'],
		['called', '@Input() compute() {'],
		['with an object argument', "@Input({ alias: 'x' }) compute() {"],
		['dotted and called', '@Foo.Bar() compute() {'],
		['dotted, no parens', '@ns.Dec compute() {'],
		['stacked', '@Input() @Output() compute() {']
	])('scores 0 for a branchless decorated method: %s', (_label, decorated) => {
		expect(cc(`class C {\n\t${decorated}\n\t\treturn 1;\n\t}\n}`, 'typescript')).toBe(0);
	});

	it('still counts genuine recursion', () => {
		// Exactly 2: if(+1) + the recursive call(+1). Not ">= 2" — at a bound this
		// passes whether the fix worked or removed recursion detection entirely.
		expect(
			cc('function fact(n) {\n\tif (n <= 1) return 1;\n\treturn n * fact(n - 1);\n}', 'typescript')
		).toBe(2);
	});

	it('still counts recursion inside a decorated method', () => {
		expect(
			cc(
				'class C {\n\t@Input() walk(n) {\n\t\tif (n) return walk(n - 1);\n\t\treturn 0;\n\t}\n}',
				'typescript'
			)
		).toBe(2);
	});
});

describe('logical assignment is not a boolean sequence', () => {
	// `a ||= b` is one assignment, not a branch the reader has to hold. The
	// tokenizer emits `||` followed by `=`, so it was indistinguishable from a
	// real chain. `??=` was accidentally correct only because `??` is not in the
	// operator list at all.
	it.each([
		['||=', 'a.x ||= 1;'],
		['&&=', 'a.x &&= 1;'],
		['??=', 'a.x ??= 1;']
	])('scores 0: %s', (_label, statement) => {
		expect(cc(`function f(a) {\n\t${statement}\n\treturn a;\n}`, 'typescript')).toBe(0);
	});

	it('does not let a logical assignment start or extend a run', () => {
		// If the fix returned after recording the run instead of before it, the
		// `||=` would seed the sequence and the real `||` below would then be
		// treated as a continuation and score 0.
		expect(cc('function f(a, b, c) {\n\ta.x ||= 1;\n\treturn b || c;\n}', 'typescript')).toBe(1);
	});

	it('still counts real operators', () => {
		expect(cc('function f(a, b) {\n\treturn a || b;\n}', 'typescript')).toBe(1);
		expect(cc('function f(a, b, c, d) {\n\treturn a && b || c && d;\n}', 'typescript')).toBe(3);
	});
});

describe('Python: match is a soft keyword', () => {
	it('counts a match statement as a switch', () => {
		const code = [
			'def f(x):',
			'    match x:',
			'        case 1:',
			'            return 1',
			'        case 2:',
			'            return 2',
			'    return 0'
		].join('\n');
		expect(cc(code, 'python')).toBe(1);
	});

	it('nests inside a match', () => {
		// match(+1) + if one level deeper(+2) = 3
		const code = [
			'def f(x):',
			'    match x:',
			'        case 1:',
			'            if x:',
			'                return 1',
			'    return 0'
		].join('\n');
		expect(cc(code, 'python')).toBe(3);
	});

	it('does not count `match` used as a variable', () => {
		// One of the most common lines in Python. `match` is a soft keyword and
		// remains a perfectly ordinary identifier; the trailing colon is what the
		// language itself uses to tell the two apart.
		const code = [
			'def f(x):',
			'    match = re.match(r"a", x)',
			'    if match:',
			'        return 1',
			'    return 0'
		].join('\n');
		expect(cc(code, 'python')).toBe(1);
	});
});

describe('Python: lambda raises nesting like a JS arrow', () => {
	it('nests a ternary inside a lambda', () => {
		// The JS arrow this translates to is oracle-verified at 2, and the two must
		// agree — the metric is meant to be language-independent.
		expect(cc('def f(xs):\n    g = lambda v: 1 if v else 0\n    return g', 'python')).toBe(2);
		expect(
			cc('function f(xs) {\n\tconst g = (v) => (v ? 1 : 0);\n\treturn g;\n}', 'typescript')
		).toBe(2);
	});

	it('nests deeper for a lambda inside a lambda', () => {
		expect(cc('def f():\n    g = lambda a: lambda b: 1 if b else 0\n    return g', 'python')).toBe(
			3
		);
	});

	it('scores a branchless lambda at 0', () => {
		expect(cc('def f():\n    g = lambda v: v + 1\n    return g', 'python')).toBe(0);
	});

	it('does not nest a ternary that precedes the lambda', () => {
		// Only lambdas opening BEFORE the `if` enclose it.
		expect(cc('def f(a):\n    g = 1 if a else 0\n    return g', 'python')).toBe(1);
	});
});

describe('Go: a composite literal in a control header is not the block body', () => {
	it('nests the body of an if with an init clause', () => {
		// if(+1) + inner if one level deeper(+2) = 3. The literal's brace used to
		// take the latch, close on the same line, and pop the nesting straight back
		// off — so the body ran at depth 0 and everything inside was undercounted.
		const code = [
			'func f(a int) int {',
			'\tif x := (Point{1, 2}); x.X > 0 {',
			'\t\tif a > 1 {',
			'\t\t\treturn 1',
			'\t\t}',
			'\t}',
			'\treturn 0',
			'}'
		].join('\n');
		expect(cc(code, 'go')).toBe(3);
	});

	it('nests the body of a plain if with an init clause', () => {
		// Go puts an unparenthesised `;` in the header, which the statement-end
		// rule read as the end of the statement and disarmed the pending `if`.
		const code = [
			'func f(a int) int {',
			'\tif v, err := g(); err == nil {',
			'\t\tif a > 1 {',
			'\t\t\treturn v',
			'\t\t}',
			'\t}',
			'\treturn 0',
			'}'
		].join('\n');
		expect(cc(code, 'go')).toBe(3);
	});

	it('does not disarm a brace-language statement on a real `;`', () => {
		// The Go exemption must not leak: in JS a bare `;` genuinely ends the
		// statement, so a following block is not the if's body.
		expect(
			cc('function f(a) {\n\tif (a) return 1;\n\t{\n\t\treturn 2;\n\t}\n}', 'typescript')
		).toBe(1);
	});
});
