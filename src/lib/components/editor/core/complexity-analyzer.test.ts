import { describe, it, expect, beforeEach } from 'vitest';
import {
	ComplexityAnalyzer,
	createComplexityAnalyzer,
	COGNITIVE_COMPLEXITY_BANDS
} from './complexity-analyzer';
import type { Line } from './state';

/** Helper to create Line[] from a string */
function makeLines(code: string): Line[] {
	return code.split('\n').map((text, i) => ({ number: i, text }));
}

describe('ComplexityAnalyzer', () => {
	let analyzer: ComplexityAnalyzer;

	beforeEach(() => {
		analyzer = createComplexityAnalyzer();
	});

	describe('cache correctness', () => {
		it('should return different results when middle lines change but line count stays the same', () => {
			const linesV1 = makeLines(`function foo() {\n  return 1;\n}`);
			const linesV2 = makeLines(
				`function foo() {\n  if (x) { if (y) { if (z) { return deep; } } }\n}`
			);

			const result1 = analyzer.analyze(linesV1);
			const result2 = analyzer.analyze(linesV2);

			// These have the same line count and same first/last lines
			// but very different complexity — results must differ
			expect(result2.overall).not.toBe(result1.overall);
		});

		it('should update when content changes even if line count is unchanged', () => {
			const simple = makeLines(`function a() {\n  return 1;\n}`);
			const complex = makeLines(`function a() {\n  if (x) { for (;;) { while (true) { } } }\n}`);

			analyzer.analyze(simple);
			const result = analyzer.analyze(complex);

			// Should reflect the complex version, not return cached simple version
			expect(result.regions.length).toBeGreaterThan(0);
			expect(result.regions[0].factors!.branchingFactor).toBeGreaterThan(0);
		});
	});

	describe('region detection', () => {
		it('should correctly detect a simple function region', () => {
			const lines = makeLines(`function hello() {\n  console.log("hi");\n}`);
			const result = analyzer.analyze(lines);

			expect(result.regions.length).toBe(1);
			expect(result.regions[0].type).toBe('function');
			expect(result.regions[0].name).toBe('hello');
			expect(result.regions[0].startLine).toBe(0);
			expect(result.regions[0].endLine).toBe(2);
		});

		it('should not be corrupted by inline object literals', () => {
			const lines = makeLines(
				[
					'function process() {',
					'  const config = { timeout: 5000, retries: 3 };',
					'  const result = doSomething(config);',
					'  return result;',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			// Should detect one function region spanning lines 0-4
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('process');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(4);
		});

		it('should not be corrupted by destructuring assignments', () => {
			const lines = makeLines(
				[
					'function extract() {',
					'  const { a, b } = getValues();',
					'  const { c } = other();',
					'  return a + b + c;',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].endLine).toBe(4);
		});

		it('should handle nested functions correctly', () => {
			const lines = makeLines(
				[
					'function outer() {',
					'  function inner() {',
					'    return 42;',
					'  }',
					'  return inner();',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(2);

			const inner = funcRegions.find((r) => r.name === 'inner');
			const outer = funcRegions.find((r) => r.name === 'outer');
			expect(inner).toBeDefined();
			expect(outer).toBeDefined();
			expect(inner!.startLine).toBe(1);
			expect(inner!.endLine).toBe(3);
			expect(outer!.startLine).toBe(0);
			expect(outer!.endLine).toBe(5);
		});

		it('should handle arrow functions assigned to variables', () => {
			const lines = makeLines(
				['const handler = (req, res) => {', '  res.send("ok");', '}'].join('\n')
			);

			const result = analyzer.analyze(lines);

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('handler');
		});

		it('should handle class with methods', () => {
			const lines = makeLines(
				['class MyClass {', '  method() {', '    return 1;', '  }', '}'].join('\n')
			);

			const result = analyzer.analyze(lines);

			const classRegions = result.regions.filter((r) => r.type === 'class');
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(classRegions.length).toBe(1);
			expect(funcRegions.length).toBe(1);
		});

		it('should detect functions with TypeScript return type annotations', () => {
			const source = [
				'function add(a: number, b: number): number {',
				'  return a + b;',
				'}',
				'',
				'function processUser(user: { active: boolean; roles: string[] }): string {',
				'  if (!user.active) {',
				'    return "inactive";',
				'  }',
				'  if (user.roles.includes("admin")) {',
				'    return "admin";',
				'  }',
				'  return "user";',
				'}',
				'',
				'const capitalize = (value: string): string => {',
				'  return value.charAt(0).toUpperCase() + value.slice(1);',
				'}'
			];
			const result = analyzer.analyze(makeLines(source.join('\n')), 'typescript');

			expect(result.regions).not.toHaveLength(1);
			expect(result.regions[0].type).not.toBe('file');

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.map((r) => r.name).sort()).toEqual(['add', 'capitalize', 'processUser']);

			const add = funcRegions.find((r) => r.name === 'add')!;
			const processUser = funcRegions.find((r) => r.name === 'processUser')!;
			const capitalize = funcRegions.find((r) => r.name === 'capitalize')!;

			expect(add.startLine).toBe(0);
			expect(add.endLine).toBe(2);
			expect(processUser.startLine).toBe(4);
			expect(processUser.endLine).toBe(12);
			expect(capitalize.startLine).toBe(14);
			expect(capitalize.endLine).toBe(16);
			expect(add.score!).toBeLessThan(processUser.score!);
		});

		it('should detect a multi-line TypeScript signature instead of falling back to file', () => {
			const source = [
				'type AnalysisResult = { total: number; flagged: number };',
				'',
				'function add(a: number, b: number): number {',
				'  return a + b;',
				'}',
				'',
				'function analyzeDataMatrix(',
				'  data: number[][],',
				'  threshold: number',
				'): Promise<AnalysisResult | null> {',
				'  let total = 0;',
				'  let flagged = 0;',
				'  for (const row of data) {',
				'    for (const value of row) {',
				'      if (value > threshold) {',
				'        flagged++;',
				'        if (value % 2 === 0) {',
				'          total += value;',
				'        } else {',
				'          while (total < threshold) {',
				'            total++;',
				'          }',
				'        }',
				'      }',
				'    }',
				'  }',
				'  return total > 0 ? { total, flagged } : null;',
				'}'
			];
			const result = analyzer.analyze(makeLines(source.join('\n')), 'typescript');

			expect(result.regions).not.toEqual([
				expect.objectContaining({ startLine: 0, endLine: source.length - 1, type: 'file' })
			]);

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.map((r) => r.name).sort()).toEqual(['add', 'analyzeDataMatrix']);

			const add = funcRegions.find((r) => r.name === 'add')!;
			const analyzeDataMatrix = funcRegions.find((r) => r.name === 'analyzeDataMatrix')!;

			expect(add.startLine).toBe(2);
			expect(add.endLine).toBe(4);
			expect(analyzeDataMatrix.startLine).toBe(6);
			expect(analyzeDataMatrix.endLine).toBe(27);
			expect(analyzeDataMatrix.cognitiveComplexity).toBe(17);
			expect(add.score).toBeLessThan(30);
			// This nested loop/branch function is firmly "high" complexity; the
			// deeper demo sample reaches critical (100). See COGNITIVE_SCORE_MULTIPLIER calibration.
			expect(analyzeDataMatrix.score).toBeGreaterThanOrEqual(80);
			expect(analyzeDataMatrix.score!).toBeGreaterThan(add.score!);
		});

		it('does not treat a parenthesised expression assignment as a function', () => {
			// `const x = (a - b) / c` matches the arrow-assignment shape but is not a
			// function. It must not create a phantom region (which previously
			// attached itself to the following `if (...) {` block).
			const source = [
				'function outer(values: number[]): number {',
				'  let max = 0;',
				'  for (const v of values) {',
				'    const normalized = (v - 1) / (max - 1);',
				'    if (normalized > 0.5) {',
				'      max = v;',
				'    }',
				'  }',
				'  return max;',
				'}'
			];
			const result = analyzer.analyze(makeLines(source.join('\n')), 'typescript');
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.map((r) => r.name)).toEqual(['outer']);
		});

		it('still detects a block-bodied arrow const as a function', () => {
			const source = ['const handler = (e: Event): void => {', '  e.preventDefault();', '};'];
			const result = analyzer.analyze(makeLines(source.join('\n')), 'typescript');
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.map((r) => r.name)).toContain('handler');
		});
	});

	describe('cognitive complexity (SonarSource)', () => {
		const cases: Array<{
			id: string;
			language: string;
			expected: number;
			code: string;
			regionName?: string;
		}> = [
			{
				id: 'JS-1',
				language: 'javascript',
				expected: 7,
				regionName: 'sumOfPrimes',
				code: [
					'function sumOfPrimes(max) {',
					'  let total = 0;',
					'  outer: for (let i = 1; i <= max; i++) {',
					'    for (let j = 2; j < i; j++) {',
					'      if (i % j === 0) {',
					'        continue outer;',
					'      }',
					'    }',
					'    total += i;',
					'  }',
					'  return total;',
					'}'
				].join('\n')
			},
			{
				id: 'DW-1',
				language: 'javascript',
				expected: 1,
				regionName: 'loopOnce',
				code: ['function loopOnce(c) {', '  do {', '    work();', '  } while (c);', '}'].join('\n')
			},
			{
				id: 'DW-2',
				language: 'javascript',
				expected: 3,
				regionName: 'loopGuard',
				code: [
					'function loopGuard(a, c) {',
					'  do {',
					'    if (a) {',
					'      x();',
					'    }',
					'  } while (c);',
					'}'
				].join('\n')
			},
			{
				id: 'JS-2',
				language: 'javascript',
				expected: 1,
				regionName: 'getWords',
				code: [
					'function getWords(number) {',
					'  switch (number) {',
					'    case 1: return "one";',
					'    case 2: return "two";',
					'    case 3: return "three";',
					'    default: return "lots";',
					'  }',
					'}'
				].join('\n')
			},
			{
				id: 'JS-3',
				language: 'javascript',
				expected: 5,
				regionName: 'classify',
				code: [
					'function classify(x, y) {',
					'  if (x > 0 && y > 0) {',
					'    return "positive";',
					'  } else if (x < 0 || y < 0) {',
					'    return "negative";',
					'  } else {',
					'    return "mixed";',
					'  }',
					'}'
				].join('\n')
			},
			{
				id: 'JS-4',
				language: 'javascript',
				expected: 4,
				regionName: 'check',
				code: [
					'function check(a, b) {',
					'  if (a) {',
					'    if (b) {}',
					'  } else if (b) {}',
					'}'
				].join('\n')
			},
			{
				id: 'JS-5',
				language: 'javascript',
				expected: 3,
				code: 'const choose = (a, b, c, d) => (a && b || c) ? d : 0;'
			},
			{
				id: 'TS-6',
				language: 'typescript',
				expected: 3,
				regionName: 'setup',
				code: [
					'function setup(items: number[]) {',
					'  items.forEach((it) => {',
					'    if (it > 0) {}',
					'  });',
					'  if (items.length === 0) {}',
					'}'
				].join('\n')
			},
			{
				id: 'TS-7',
				language: 'typescript',
				expected: 9,
				regionName: 'myMethod',
				code: [
					'function myMethod(c1: boolean, c2: boolean) {',
					'  try {',
					'    if (c1) {',
					'      for (const item of items) {',
					'        while (c2) {}',
					'      }',
					'    }',
					'  } catch (e) {',
					'    if (c2) {}',
					'  }',
					'}'
				].join('\n')
			},
			{
				id: 'PY-1',
				language: 'python',
				expected: 7,
				regionName: 'sum_of_primes',
				code: [
					'def sum_of_primes(max):',
					'    total = 0',
					'    for i in range(1, max + 1):',
					'        for j in range(2, i):',
					'            if i % j == 0:',
					'                break',
					'        else:',
					'            total += i',
					'    return total'
				].join('\n')
			},
			{
				id: 'PY-2',
				language: 'python',
				expected: 5,
				regionName: 'validate',
				code: [
					'def validate(user):',
					'    if user.active and user.email:',
					'        return True',
					'    elif user.admin or user.owner:',
					'        return True',
					'    try:',
					'        return bool(user.id)',
					'    except ValueError:',
					'        return False'
				].join('\n')
			},
			{
				id: 'PY-3',
				language: 'python',
				expected: 2,
				regionName: 'not_a_decorator',
				code: [
					'def not_a_decorator(a, b):',
					'    my_var = a * b',
					'    def inner(func):',
					'        if condition:',
					'            return func()',
					'    return inner'
				].join('\n')
			},
			{
				id: 'GO-1',
				language: 'go',
				expected: 7,
				regionName: 'sumOfPrimes',
				code: [
					'func sumOfPrimes(max int) int {',
					'  total := 0',
					'Outer:',
					'  for i := 1; i <= max; i++ {',
					'    for j := 2; j < i; j++ {',
					'      if i%j == 0 {',
					'        continue Outer',
					'      }',
					'    }',
					'    total += i',
					'  }',
					'  return total',
					'}'
				].join('\n')
			},
			{
				id: 'GO-2',
				language: 'go',
				expected: 4,
				regionName: 'route',
				code: [
					'func route(x int, ok bool, ready bool) string {',
					'  switch x {',
					'  case 1:',
					'    return "one"',
					'  default:',
					'    return "other"',
					'  }',
					'  if ok && ready || x > 0 {',
					'    return "ready"',
					'  }',
					'  return "no"',
					'}'
				].join('\n')
			},
			{
				id: 'GO-3',
				language: 'go',
				expected: 5,
				regionName: 'process',
				code: [
					'func process(items []int) {',
					'  handle := func(v int) {',
					'    if v > 0 {}',
					'  }',
					'  for _, it := range items {',
					'    if it%2 == 0 {',
					'      handle(it)',
					'    }',
					'  }',
					'}'
				].join('\n')
			}
		];

		for (const oracle of cases) {
			it(`${oracle.id} returns exact cognitive complexity ${oracle.expected}`, () => {
				const result = analyzer.analyze(makeLines(oracle.code), oracle.language);
				const region = oracle.regionName
					? result.regions.find((r) => r.name === oracle.regionName)
					: result.regions[0];

				expect(region, `${oracle.id} region`).toBeDefined();
				expect(region!.cognitiveComplexity).toBe(oracle.expected);
			});
		}

		it('keeps contribution and total cognitive complexity invariants', () => {
			for (const oracle of cases) {
				const result = analyzer.analyze(makeLines(oracle.code), oracle.language);
				for (const region of result.regions) {
					const sum = region.contributions.reduce(
						(total, contribution) => total + contribution.increment,
						0
					);
					expect(sum, `${oracle.id} ${region.name ?? region.type}`).toBe(
						region.cognitiveComplexity
					);
				}

				expect(result.totalCognitiveComplexity, oracle.id).toBe(
					result.regions.reduce((total, region) => total + region.cognitiveComplexity, 0)
				);
			}
		});
	});

	describe('getLineComplexity', () => {
		it('reports the highest cognitive complexity among overlapping regions', () => {
			const factors = {
				nestingDepth: 0,
				branchingFactor: 0,
				lineCount: 1,
				identifierCount: 0,
				callCount: 0
			};
			const metrics = {
				overall: 0,
				level: 'low' as const,
				hotspots: [],
				totalCognitiveComplexity: 0,
				maxCognitiveComplexity: 0,
				regions: [
					{
						startLine: 0,
						endLine: 20,
						score: 90,
						level: 'critical' as const,
						type: 'function' as const,
						factors,
						cognitiveComplexity: 18,
						contributions: []
					},
					{
						startLine: 5,
						endLine: 8,
						score: 40,
						level: 'medium' as const,
						type: 'block' as const,
						factors,
						cognitiveComplexity: 6,
						contributions: []
					}
				]
			};
			// Line 6 sits inside both the cc-6 inner block and the cc-18 function; the
			// function must win. Reports raw Cognitive Complexity, never the
			// deprecated score — this accessor was the last public path handing the
			// saturating value out.
			expect(analyzer.getLineComplexity(metrics, 6)).toBe(18);
			expect(analyzer.getLineComplexity(metrics, 15)).toBe(18);
			expect(analyzer.getLineComplexity(metrics, 50)).toBe(0);
		});
	});

	describe('nesting depth', () => {
		it('should count multiple nesting openers on the same line', () => {
			const lines = makeLines(
				[
					'function deep() {',
					'  if (a) { if (b) { if (c) {',
					'    return "deep";',
					'  }}}',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegion = result.regions.find((r) => r.type === 'function');
			expect(funcRegion).toBeDefined();
			// Should detect nesting depth of 3 (three nested ifs)
			expect(funcRegion!.factors!.nestingDepth).toBeGreaterThanOrEqual(3);
		});

		it('should track nesting across for/while/if', () => {
			const lines = makeLines(
				[
					'function nested() {',
					'  for (let i = 0; i < 10; i++) {',
					'    while (condition) {',
					'      if (check) {',
					'        doSomething();',
					'      }',
					'    }',
					'  }',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegion = result.regions.find((r) => r.type === 'function');
			expect(funcRegion).toBeDefined();
			expect(funcRegion!.factors!.nestingDepth).toBeGreaterThanOrEqual(3);
		});
	});

	describe('function call counting', () => {
		it('should not count control structures as function calls', () => {
			const lines = makeLines(
				[
					'function test() {',
					'  if (x) {',
					'    for (let i = 0; i < n; i++) {',
					'      while (running) {',
					'        switch (mode) {',
					'          case 1: break;',
					'        }',
					'      }',
					'    }',
					'  }',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegion = result.regions.find((r) => r.type === 'function');
			expect(funcRegion).toBeDefined();
			// if, for, while, switch should NOT count as function calls
			// Only actual calls should count
			expect(funcRegion!.factors!.callCount).toBe(0);
		});

		it('should count actual function calls', () => {
			const lines = makeLines(
				['function test() {', '  foo();', '  bar(1, 2);', '  baz(qux());', '}'].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegion = result.regions.find((r) => r.type === 'function');
			expect(funcRegion).toBeDefined();
			// foo(), bar(), baz(), qux() = 4 calls
			expect(funcRegion!.factors!.callCount).toBe(4);
		});
	});

	describe('string and comment awareness in region detection', () => {
		it('should ignore braces inside double-quoted strings', () => {
			const lines = makeLines(
				[
					'function render() {',
					'  const html = "<div>{content}</div>";',
					'  return html;',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('render');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(3);
		});

		it('should ignore braces inside single-quoted strings', () => {
			const lines = makeLines(
				['function render() {', "  const tmpl = '{name}: {value}';", '  return tmpl;', '}'].join(
					'\n'
				)
			);

			const result = analyzer.analyze(lines);
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].endLine).toBe(3);
		});

		it('should ignore braces inside template literal strings', () => {
			const lines = makeLines(
				[
					'function format() {',
					'  const msg = `Hello {name}, you have {unread} messages`;',
					'  return msg;',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].endLine).toBe(3);
		});

		it('should ignore braces in line comments', () => {
			const lines = makeLines(
				[
					'function commented() {',
					'  // TODO: handle { edge case } here',
					'  return true;',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].endLine).toBe(3);
		});

		it('should handle multiple inline objects without corrupting regions', () => {
			const lines = makeLines(
				[
					'function multiObj() {',
					'  const a = { x: 1 };',
					'  const b = { y: 2, z: 3 };',
					'  const c = { ...a, ...b };',
					'  return { a, b, c };',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('multiObj');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(5);
		});

		it('should handle mixed destructuring and object literals', () => {
			const lines = makeLines(
				[
					'function transform(input) {',
					'  const { a, b } = input;',
					'  const result = { sum: a + b, product: a * b };',
					'  const { sum } = result;',
					'  return { answer: sum };',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].endLine).toBe(5);
		});
	});

	describe('cache key robustness', () => {
		it('should not return stale results after single character edit', () => {
			const before = makeLines(['function calc() {', '  return 1;', '}'].join('\n'));
			const after = makeLines(['function calc() {', '  return 2;', '}'].join('\n'));

			analyzer.analyze(before);
			const result = analyzer.analyze(after);
			// Should be a fresh analysis, not cached
			expect(result.regions.length).toBeGreaterThan(0);
		});

		it('should return cached result for identical content', () => {
			const lines = makeLines('function f() {\n  return 1;\n}');
			const result1 = analyzer.analyze(lines);
			const result2 = analyzer.analyze(lines);
			// Same object reference means cache hit
			expect(result1).toBe(result2);
		});
	});

	describe('function call counting edge cases', () => {
		it('should not count "new" keyword as a call but should count the constructor', () => {
			const lines = makeLines(
				['function create() {', '  const obj = new MyClass(1, 2);', '  return obj;', '}'].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegion = result.regions.find((r) => r.type === 'function');
			expect(funcRegion).toBeDefined();
			// "new" is excluded, "MyClass(" is a call = 1
			expect(funcRegion!.factors!.callCount).toBe(1);
		});

		it('should count chained calls correctly', () => {
			const lines = makeLines(
				['function chain() {', '  return getData().filter(x => x > 0).map(x => x * 2);', '}'].join(
					'\n'
				)
			);

			const result = analyzer.analyze(lines);
			const funcRegion = result.regions.find((r) => r.type === 'function');
			expect(funcRegion).toBeDefined();
			// getData(), filter(), map() = 3 calls
			expect(funcRegion!.factors!.callCount).toBe(3);
		});
	});

	describe('functionDef keyword exclusion', () => {
		it('should not treat if/for/while as function definitions', () => {
			const lines = makeLines(
				[
					'function main() {',
					'  if (true) {',
					'    for (let i = 0; i < 5; i++) {',
					'      while (running) {',
					'        process();',
					'      }',
					'    }',
					'  }',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			// Only "main" should be a function — if/for/while are not functions
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('main');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(8);
		});

		it('should not treat try/catch/switch as function definitions', () => {
			const lines = makeLines(
				[
					'function handler() {',
					'  try {',
					'    switch (mode) {',
					'      case 1: break;',
					'    }',
					'  } catch (e) {',
					'    log(e);',
					'  }',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('handler');
		});

		it('should still detect actual method definitions', () => {
			const lines = makeLines(
				[
					'class Service {',
					'  getData() {',
					'    return this.data;',
					'  }',
					'  setData(val) {',
					'    this.data = val;',
					'  }',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(2);
			expect(funcRegions.map((r) => r.name).sort()).toEqual(['getData', 'setData']);
		});
	});

	describe('score calculation', () => {
		it('should produce low score for trivial function', () => {
			const lines = makeLines(`function add(a, b) {\n  return a + b;\n}`);
			const result = analyzer.analyze(lines);
			expect(result.totalCognitiveComplexity).toBe(0);
			expect(result.regions[0].cognitiveComplexity).toBe(0);
			expect(result.level).toBe('low');
			expect(result.overall).toBeLessThan(30);
		});

		it('should produce higher score for complex function', () => {
			const lines = makeLines(
				[
					'function complex(data) {',
					'  if (data.type === "a") {',
					'    for (const item of data.items) {',
					'      if (item.active) {',
					'        switch (item.status) {',
					'          case "pending":',
					'            processPending(item);',
					'            break;',
					'          case "active":',
					'            processActive(item);',
					'            break;',
					'          case "done":',
					'            processDone(item);',
					'            break;',
					'          default:',
					'            handleUnknown(item);',
					'        }',
					'      }',
					'    }',
					'  } else if (data.type === "b") {',
					'    while (data.hasMore()) {',
					'      const next = data.getNext();',
					'      if (next.isValid()) {',
					'        transform(next);',
					'      }',
					'    }',
					'  }',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			expect(result.regions[0].cognitiveComplexity).toBe(16);
			expect(result.overall).toBeGreaterThan(30);
		});

		it('should cap score at 100', () => {
			// Extremely complex code
			const lines = makeLines(
				[
					'function nightmare() {',
					...Array.from(
						{ length: 50 },
						(_, i) =>
							`  if (c${i}) { for (let i${i} = 0; i${i} < n; i${i}++) { while (r${i}) { switch (m${i}) { case ${i}: f${i}(g${i}(h${i}())); break; } } } }`
					),
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			expect(result.overall).toBeLessThanOrEqual(100);
		});
	});

	describe('overall metrics', () => {
		it('should return file-level fallback when no functions are found', () => {
			const lines = makeLines(['const x = 1;', 'const y = 2;', 'console.log(x + y);'].join('\n'));

			const result = analyzer.analyze(lines);
			expect(result.regions.length).toBe(1);
			expect(result.regions[0].type).toBe('file');
		});

		it('should identify hotspots for high-score regions', () => {
			const lines = makeLines(
				[
					'function simple() {',
					'  return 1;',
					'}',
					'function monster() {',
					...Array.from(
						{ length: 30 },
						(_, i) => `  if (c${i}) { for (;;) { while (true) { f${i}(g${i}()); } } }`
					),
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);
			// The monster function should generate hotspots
			if (result.hotspots.length > 0) {
				// Hotspot lines should be within the monster function range
				expect(result.hotspots.every((h) => h >= 3)).toBe(true);
			}
		});
	});

	describe('dogfood: analyze own source file', () => {
		it('should analyze the complexity analyzer itself without crashing or corrupting regions', () => {
			// Feed the analyzer its own source code
			const source = `
import type { Line } from './state';

export interface ComplexityFactors {
	nestingDepth: number;
	branchingFactor: number;
	lineCount: number;
	identifierCount: number;
	callCount: number;
}

export class ComplexityAnalyzer {
	private cache: Map<string, any> = new Map();

	analyze(lines: readonly Line[], language: string = 'javascript') {
		const regions = this.identifyRegions(lines, language);
		const analyzed = regions.map((r) => this.analyzeRegion(lines, r));
		return { overall: 50, level: 'medium', regions: analyzed, hotspots: [] };
	}

	private identifyRegions(lines: readonly Line[], _lang: string) {
		const regions: Array<{ startLine: number; endLine: number; type: string; name?: string }> = [];
		const stack: Array<{ line: number; type: string; name?: string; depth: number }> = [];
		let depth = 0;

		for (let i = 0; i < lines.length; i++) {
			const text = lines[i].text;
			let inStr: string | null = null;

			for (let ch = 0; ch < text.length; ch++) {
				const c = text[ch];
				if (!inStr && c === '/' && text[ch + 1] === '/') break;
				if (inStr) {
					if (c === inStr && text[ch - 1] !== '\\\\') inStr = null;
					continue;
				}
				if (c === '"' || c === "'" || c === '\`') { inStr = c; continue; }
				if (c === '{') {
					depth++;
					if (text.includes('function') || text.includes('=>')) {
						stack.push({ line: i, type: 'function', depth });
					}
				} else if (c === '}') {
					if (stack.length > 0 && depth === stack[stack.length - 1].depth) {
						const block = stack.pop()!;
						regions.push({ startLine: block.line, endLine: i, type: block.type, name: block.name });
					}
					depth = Math.max(0, depth - 1);
				}
			}
		}

		if (regions.length === 0 && lines.length > 0) {
			regions.push({ startLine: 0, endLine: lines.length - 1, type: 'file' });
		}
		return regions;
	}

	private analyzeRegion(lines: readonly Line[], region: any) {
		return { ...region, score: 42, factors: { nestingDepth: 2, branchingFactor: 3, lineCount: region.endLine - region.startLine + 1, identifierCount: 10, callCount: 5 } };
	}
}`.trim();

			const lines = makeLines(source);
			const result = analyzer.analyze(lines);

			// Should not crash or return empty
			expect(result).toBeDefined();
			expect(result.regions.length).toBeGreaterThan(0);
			expect(result.overall).toBeGreaterThanOrEqual(0);
			expect(result.overall).toBeLessThanOrEqual(100);

			// Should detect the class
			const classRegions = result.regions.filter((r) => r.type === 'class');
			expect(classRegions.length).toBe(1);
			expect(classRegions[0].name).toBe('ComplexityAnalyzer');

			// Should detect methods
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBeGreaterThanOrEqual(2);

			// No region should have endLine < startLine (corruption signal)
			for (const region of result.regions) {
				expect(region.endLine).toBeGreaterThanOrEqual(region.startLine);
			}

			// No region should extend beyond the file
			for (const region of result.regions) {
				expect(region.endLine).toBeLessThan(lines.length);
			}
		});
	});

	describe('realistic complex files', () => {
		it('should correctly analyze an Express-style route handler', () => {
			const lines = makeLines(
				[
					'const router = (app) => {',
					'  app.get("/users/:id", async (req, res) => {',
					'    try {',
					'      const { id } = req.params;',
					'      const { fields, include } = req.query;',
					'      const user = await db.users.findOne({ where: { id } });',
					'',
					'      if (!user) {',
					'        return res.status(404).json({ error: "Not found" });',
					'      }',
					'',
					'      if (include === "posts") {',
					'        const posts = await db.posts.findAll({',
					'          where: { authorId: id },',
					'          order: [["createdAt", "DESC"]],',
					'          limit: 20',
					'        });',
					'        return res.json({ ...user, posts });',
					'      }',
					'',
					'      if (fields) {',
					'        const filtered = {};',
					'        for (const field of fields.split(",")) {',
					'          if (user[field] !== undefined) {',
					'            filtered[field] = user[field];',
					'          }',
					'        }',
					'        return res.json(filtered);',
					'      }',
					'',
					'      return res.json(user);',
					'    } catch (err) {',
					'      console.error("Failed to fetch user:", err);',
					'      return res.status(500).json({ error: "Internal server error" });',
					'    }',
					'  });',
					'};'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			// Should detect router as a function region spanning the whole file
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBeGreaterThanOrEqual(1);

			// Should detect meaningful complexity (branching, nesting, calls)
			expect(result.overall).toBeGreaterThan(0);

			// Object literals in .json({...}), destructuring, query objects
			// should NOT fragment the regions
			const outerFunc = funcRegions.find((r) => r.name === 'router');
			if (outerFunc) {
				expect(outerFunc.startLine).toBe(0);
				expect(outerFunc.endLine).toBe(lines.length - 1);
			}
		});

		it('should correctly analyze a React-style class component', () => {
			const lines = makeLines(
				[
					'class DataTable {',
					'  constructor(config) {',
					'    this.columns = config.columns || [];',
					'    this.data = config.data || [];',
					'    this.sortField = null;',
					'    this.sortDir = "asc";',
					'    this.filters = {};',
					'    this.page = 0;',
					'    this.pageSize = config.pageSize || 25;',
					'  }',
					'',
					'  sort(field) {',
					'    if (this.sortField === field) {',
					'      this.sortDir = this.sortDir === "asc" ? "desc" : "asc";',
					'    } else {',
					'      this.sortField = field;',
					'      this.sortDir = "asc";',
					'    }',
					'    this.data.sort((a, b) => {',
					'      const valA = a[field];',
					'      const valB = b[field];',
					'      if (valA === valB) return 0;',
					'      if (valA === null || valA === undefined) return 1;',
					'      if (valB === null || valB === undefined) return -1;',
					'      const cmp = valA < valB ? -1 : 1;',
					'      return this.sortDir === "asc" ? cmp : -cmp;',
					'    });',
					'  }',
					'',
					'  filter(field, predicate) {',
					'    this.filters[field] = predicate;',
					'  }',
					'',
					'  getVisibleRows() {',
					'    let rows = [...this.data];',
					'    for (const [field, predicate] of Object.entries(this.filters)) {',
					'      rows = rows.filter(row => {',
					'        const val = row[field];',
					'        if (typeof predicate === "string") {',
					'          return String(val).toLowerCase().includes(predicate.toLowerCase());',
					'        } else if (typeof predicate === "function") {',
					'          return predicate(val);',
					'        }',
					'        return true;',
					'      });',
					'    }',
					'    const start = this.page * this.pageSize;',
					'    return rows.slice(start, start + this.pageSize);',
					'  }',
					'',
					'  getTotalPages() {',
					'    return Math.ceil(this.data.length / this.pageSize);',
					'  }',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			// Should detect the class region
			const classRegions = result.regions.filter((r) => r.type === 'class');
			expect(classRegions.length).toBe(1);
			expect(classRegions[0].name).toBe('DataTable');
			expect(classRegions[0].startLine).toBe(0);
			expect(classRegions[0].endLine).toBe(lines.length - 1);

			// Should detect methods inside the class
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			const methodNames = funcRegions.map((r) => r.name).sort();
			expect(methodNames).toContain('constructor');
			expect(methodNames).toContain('sort');
			expect(methodNames).toContain('getVisibleRows');
			expect(methodNames).toContain('getTotalPages');

			// getVisibleRows has nested loops + branching — should score higher than getTotalPages
			const getVisible = funcRegions.find((r) => r.name === 'getVisibleRows');
			const getTotal = funcRegions.find((r) => r.name === 'getTotalPages');
			expect(getVisible).toBeDefined();
			expect(getTotal).toBeDefined();
			expect(getVisible!.score!).toBeGreaterThan(getTotal!.score!);
		});

		it('should correctly analyze a state machine / reducer pattern', () => {
			const lines = makeLines(
				[
					'function reducer(state, action) {',
					'  switch (action.type) {',
					'    case "FETCH_START":',
					'      return { ...state, loading: true, error: null };',
					'    case "FETCH_SUCCESS": {',
					'      const items = action.payload.items.map(item => ({',
					'        ...item,',
					'        normalized: item.name.toLowerCase().trim()',
					'      }));',
					'      return {',
					'        ...state,',
					'        loading: false,',
					'        items,',
					'        total: action.payload.total,',
					'        lastFetched: Date.now()',
					'      };',
					'    }',
					'    case "FETCH_ERROR":',
					'      return { ...state, loading: false, error: action.payload };',
					'    case "SET_FILTER": {',
					'      const { field, value } = action.payload;',
					'      const filters = { ...state.filters };',
					'      if (value === null || value === "") {',
					'        delete filters[field];',
					'      } else {',
					'        filters[field] = value;',
					'      }',
					'      return { ...state, filters, page: 0 };',
					'    }',
					'    case "SET_PAGE":',
					'      return { ...state, page: action.payload };',
					'    case "RESET":',
					'      return { loading: false, items: [], filters: {}, page: 0, error: null };',
					'    default:',
					'      throw new Error(`Unknown action: ${action.type}`);',
					'  }',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			// Should detect reducer as a single function — NOT fragment at each case
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('reducer');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(lines.length - 1);

			// Heavy spread operators + object literals should not corrupt regions
			// High branching (6 cases + if/else) should be detected
			expect(funcRegions[0].factors!.branchingFactor).toBeGreaterThanOrEqual(6);
		});

		it('should correctly analyze async/await with Promise combinators', () => {
			const lines = makeLines(
				[
					'async function fetchDashboard(userId) {',
					'  const [profile, notifications, settings] = await Promise.all([',
					'    fetchProfile(userId),',
					'    fetchNotifications(userId).catch(() => []),',
					'    fetchSettings(userId).catch(() => ({}))',
					'  ]);',
					'',
					'  if (!profile) {',
					'    throw new Error("Profile not found");',
					'  }',
					'',
					'  const unreadCount = notifications.filter(n => !n.read).length;',
					'',
					'  if (settings.theme) {',
					'    applyTheme(settings.theme);',
					'  }',
					'',
					'  if (settings.locale) {',
					'    await loadLocale(settings.locale);',
					'  }',
					'',
					'  return {',
					'    user: profile,',
					'    notifications: notifications.slice(0, 10),',
					'    unreadCount,',
					'    settings: { ...settings, applied: true }',
					'  };',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('fetchDashboard');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(lines.length - 1);

			// The return { ... } with nested spread should NOT break the region
			// Multiple awaits, catch callbacks, filter callback — should count calls
			expect(funcRegions[0].factors!.callCount).toBeGreaterThanOrEqual(5);
		});

		it('should correctly analyze deeply nested callback-heavy code', () => {
			const lines = makeLines(
				[
					'function processQueue(queue, options) {',
					'  const results = [];',
					'  const errors = [];',
					'',
					'  for (const batch of chunk(queue, options.batchSize || 10)) {',
					'    for (const item of batch) {',
					'      try {',
					'        if (item.type === "transform") {',
					'          if (item.subtype === "map") {',
					'            results.push(item.data.map(d => transform(d, item.config)));',
					'          } else if (item.subtype === "reduce") {',
					'            results.push(item.data.reduce((acc, d) => {',
					'              const key = d[item.config.groupBy];',
					'              if (!acc[key]) {',
					'                acc[key] = { items: [], total: 0 };',
					'              }',
					'              acc[key].items.push(d);',
					'              acc[key].total += d.value || 0;',
					'              return acc;',
					'            }, {}));',
					'          } else {',
					'            results.push(identity(item.data));',
					'          }',
					'        } else if (item.type === "filter") {',
					'          const predicate = buildPredicate(item.config);',
					'          results.push(item.data.filter(predicate));',
					'        } else if (item.type === "sort") {',
					'          const comparator = buildComparator(item.config);',
					'          results.push([...item.data].sort(comparator));',
					'        } else {',
					'          throw new Error(`Unknown type: ${item.type}`);',
					'        }',
					'      } catch (err) {',
					'        if (options.failFast) {',
					'          throw err;',
					'        }',
					'        errors.push({ item, error: err.message });',
					'      }',
					'    }',
					'  }',
					'',
					'  return { results, errors, processed: queue.length };',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			// Should be a single function, not fragmented
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('processQueue');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(lines.length - 1);

			// Deep nesting: for > for > try > if > if = 5 levels
			expect(funcRegions[0].factors!.nestingDepth).toBeGreaterThanOrEqual(4);

			// Heavy branching: multiple if/else if/else chains
			expect(funcRegions[0].factors!.branchingFactor).toBeGreaterThanOrEqual(6);

			// Should rate this as medium-to-high complexity
			expect(funcRegions[0].score).toBeGreaterThanOrEqual(50);
		});

		it('should correctly analyze a file with multiple exported functions', () => {
			const lines = makeLines(
				[
					'function validate(schema, data) {',
					'  const errors = {};',
					'  for (const [field, rules] of Object.entries(schema)) {',
					'    const value = data[field];',
					'    for (const rule of rules) {',
					'      if (rule.type === "required" && (value === undefined || value === null || value === "")) {',
					'        errors[field] = rule.message || `${field} is required`;',
					'        break;',
					'      }',
					'      if (rule.type === "minLength" && typeof value === "string" && value.length < rule.value) {',
					'        errors[field] = rule.message || `${field} must be at least ${rule.value} characters`;',
					'        break;',
					'      }',
					'      if (rule.type === "pattern" && typeof value === "string" && !rule.value.test(value)) {',
					'        errors[field] = rule.message || `${field} format is invalid`;',
					'        break;',
					'      }',
					'    }',
					'  }',
					'  return errors;',
					'}',
					'',
					'function sanitize(data) {',
					'  const clean = {};',
					'  for (const [key, value] of Object.entries(data)) {',
					'    if (typeof value === "string") {',
					'      clean[key] = value.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");',
					'    } else {',
					'      clean[key] = value;',
					'    }',
					'  }',
					'  return clean;',
					'}',
					'',
					'function formatErrors(errors) {',
					'  return Object.entries(errors)',
					'    .map(([field, msg]) => `${field}: ${msg}`)',
					'    .join("\\n");',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(3);

			const names = funcRegions.map((r) => r.name).sort();
			expect(names).toEqual(['formatErrors', 'sanitize', 'validate']);

			// validate is most complex (nested loops + branching)
			const validateFn = funcRegions.find((r) => r.name === 'validate')!;
			const sanitizeFn = funcRegions.find((r) => r.name === 'sanitize')!;
			const formatFn = funcRegions.find((r) => r.name === 'formatErrors')!;

			expect(validateFn.score!).toBeGreaterThan(sanitizeFn.score!);
			expect(sanitizeFn.score!).toBeGreaterThan(formatFn.score!);
		});

		it('should handle a realistic config-heavy module with many object literals', () => {
			const lines = makeLines(
				[
					'function createWebpackConfig(env) {',
					'  const isDev = env.mode === "development";',
					'  const entry = {',
					'    main: "./src/index.js",',
					'    vendor: ["react", "react-dom"]',
					'  };',
					'',
					'  const output = {',
					'    path: "/dist",',
					'    filename: isDev ? "[name].js" : "[name].[contenthash].js",',
					'    publicPath: "/"',
					'  };',
					'',
					'  const rules = [',
					'    {',
					'      test: /\\.jsx?$/,',
					'      exclude: /node_modules/,',
					'      use: {',
					'        loader: "babel-loader",',
					'        options: {',
					'          presets: ["@babel/preset-env", "@babel/preset-react"],',
					'          plugins: isDev ? ["react-refresh/babel"] : []',
					'        }',
					'      }',
					'    },',
					'    {',
					'      test: /\\.css$/,',
					'      use: [isDev ? "style-loader" : "mini-css-extract", "css-loader"]',
					'    }',
					'  ];',
					'',
					'  const plugins = [];',
					'  if (isDev) {',
					'    plugins.push(new HotModulePlugin());',
					'  } else {',
					'    plugins.push(new MinifyPlugin({ removeComments: true }));',
					'    plugins.push(new BundleAnalyzer({ analyzerMode: "static" }));',
					'  }',
					'',
					'  return { entry, output, module: { rules }, plugins, mode: env.mode };',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			// Heavily nested object literals should NOT corrupt the function boundary
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('createWebpackConfig');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(lines.length - 1);
		});

		it('should handle a module mixing classes, closures, and IIFEs', () => {
			const lines = makeLines(
				[
					'const EventBus = (function() {',
					'  const listeners = {};',
					'',
					'  class Bus {',
					'    on(event, callback) {',
					'      if (!listeners[event]) {',
					'        listeners[event] = [];',
					'      }',
					'      listeners[event].push(callback);',
					'      return () => {',
					'        listeners[event] = listeners[event].filter(cb => cb !== callback);',
					'      };',
					'    }',
					'',
					'    emit(event, data) {',
					'      if (listeners[event]) {',
					'        for (const cb of listeners[event]) {',
					'          try {',
					'            cb(data);',
					'          } catch (err) {',
					'            console.error(`Error in ${event} listener:`, err);',
					'          }',
					'        }',
					'      }',
					'    }',
					'',
					'    clear() {',
					'      for (const key of Object.keys(listeners)) {',
					'        delete listeners[key];',
					'      }',
					'    }',
					'  }',
					'',
					'  return new Bus();',
					'})();'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			// Should detect at least the class and its methods
			const classRegions = result.regions.filter((r) => r.type === 'class');
			expect(classRegions.length).toBe(1);
			expect(classRegions[0].name).toBe('Bus');

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			const methodNames = funcRegions
				.map((r) => r.name)
				.filter(Boolean)
				.sort();
			expect(methodNames).toContain('on');
			expect(methodNames).toContain('emit');
			expect(methodNames).toContain('clear');

			// emit has the deepest nesting (if > for > try/catch)
			const emitFn = funcRegions.find((r) => r.name === 'emit');
			expect(emitFn).toBeDefined();
			expect(emitFn!.factors!.nestingDepth).toBeGreaterThanOrEqual(2);
		});

		it('should handle TypeScript-style code with generics and type annotations', () => {
			const lines = makeLines(
				[
					'function mergeDeep(target, ...sources) {',
					'  for (const source of sources) {',
					'    if (source === null || typeof source !== "object") {',
					'      continue;',
					'    }',
					'    for (const key of Object.keys(source)) {',
					'      const targetVal = target[key];',
					'      const sourceVal = source[key];',
					'      if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {',
					'        target[key] = [...targetVal, ...sourceVal];',
					'      } else if (typeof targetVal === "object" && targetVal !== null && typeof sourceVal === "object" && sourceVal !== null) {',
					'        target[key] = mergeDeep({ ...targetVal }, sourceVal);',
					'      } else {',
					'        target[key] = sourceVal;',
					'      }',
					'    }',
					'  }',
					'  return target;',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('mergeDeep');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(lines.length - 1);

			// Nested for > for > if/else if/else — should get meaningful nesting
			expect(funcRegions[0].factors!.nestingDepth).toBeGreaterThanOrEqual(3);

			// Spread operators { ...targetVal } should not corrupt regions
			expect(funcRegions[0].factors!.branchingFactor).toBeGreaterThanOrEqual(4);
		});

		it('should handle a YAML-style config file with no functions (pure data)', () => {
			const lines = makeLines(
				[
					'# This file configures golangci-lint for the project',
					'# Documentation: https://golangci-lint.run/usage/configuration/',
					'',
					'run:',
					'  # Default concurrency is the number of available CPU cores',
					'  concurrency: 4',
					'',
					'  # Timeout for analysis, e.g., 30s, 5m, default is 1m',
					'  timeout: 5m',
					'',
					'  # Include test files',
					'  tests: true',
					'',
					'  # Skip directories',
					'  skip-dirs:',
					'    - vendor',
					'    - node_modules',
					'    - .git',
					'    - .cache',
					'    - dist',
					'    - bin',
					'',
					'  # Skip files',
					'  skip-files:',
					'    - ".*_test\\\\.go$"',
					'',
					'# Output configuration',
					'output:',
					'  formats:',
					'    - format: colored-line-number',
					'      path: stdout',
					'',
					'  print-issued-lines: true',
					'  print-linter-name: true',
					'',
					'# Linters configuration',
					'linters:',
					'  disable-all: true',
					'',
					'  enable:',
					'    - govet',
					'    - gofmt',
					'    - staticcheck',
					'    - gosimple',
					'    - unused',
					'    - ineffassign',
					'    - typecheck',
					'    - errcheck',
					'    - bodyclose',
					'    - gosec',
					'    - goconst',
					'    - gocyclo',
					'    - goimports',
					'    - misspell',
					'    - revive',
					'    - nolintlint',
					'',
					'linters-settings:',
					'  govet:',
					'    check-shadowing: true',
					'    settings:',
					'      printf:',
					'        funcs:',
					'          - fmt.Printf',
					'          - fmt.Sprintf',
					'          - fmt.Fprintf',
					'          - log.Printf',
					'          - errors.New',
					'          - fmt.Errorf',
					'',
					'  gosec:',
					'    excludes:',
					'      - G101',
					'      - G104',
					'      - G204',
					'      - G307',
					'',
					'  gocyclo:',
					'    min-complexity: 15',
					'',
					'  goimports:',
					'    local-prefixes: github.com/',
					'',
					'  misspell:',
					'    locale: US',
					'',
					'  revive:',
					'    rules:',
					'      - name: blank-imports',
					'      - name: context-as-argument',
					'      - name: context-keys-type',
					'      - name: dot-imports',
					'      - name: error-return',
					'      - name: error-strings',
					'      - name: error-naming',
					'      - name: exported',
					'      - name: if-return',
					'      - name: increment-decrement',
					'      - name: var-naming',
					'      - name: var-declaration',
					'      - name: package-comments',
					'      - name: range',
					'      - name: receiver-naming',
					'      - name: time-naming',
					'      - name: unexported-return',
					'      - name: indent-error-flow',
					'      - name: errorf',
					'      - name: empty-block',
					'      - name: superfluous-else',
					'      - name: unused-parameter',
					'      - name: unreachable-code',
					'      - name: redefines-builtin-id',
					'',
					'issues:',
					'  exclude-rules:',
					'    - path: _test\\.go$',
					'      linters:',
					'        - gosec',
					'        - gocyclo',
					'        - funlen',
					'',
					'    - text: "Error return value of .* is not checked"',
					'      linters:',
					'        - errcheck',
					'',
					'    - text: "exported.*should have comment.*or be unexported"',
					'      linters:',
					'        - revive',
					'',
					'    - text: "^Test.*"',
					'      linters:',
					'        - gocyclo',
					'',
					'  max-issues-per-linter: 0',
					'  max-same-issues: 0',
					'',
					'severity:',
					'  default-severity: error',
					'  rules:',
					'    - linters:',
					'        - misspell',
					'      severity: warning',
					'    - linters:',
					'        - goconst',
					'      severity: warning',
					'    - linters:',
					'        - gocyclo',
					'      severity: warning'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			// YAML has no functions/classes — should fall back to file-level region
			expect(result.regions.length).toBe(1);
			expect(result.regions[0].type).toBe('file');
			expect(result.regions[0].startLine).toBe(0);
			expect(result.regions[0].endLine).toBe(lines.length - 1);

			// No nesting or real function calls in YAML
			expect(result.regions[0].factors!.nestingDepth).toBe(0);
			expect(result.regions[0].factors!.callCount).toBe(0);

			// Note: overall score may be elevated for large non-code files because
			// lineCount and identifierCount still contribute to the weighted formula.
			// This is expected — the analyzer is designed for code, not config files.
			// The key invariant is: no false function/class regions, no crashes.
			expect(result.overall).toBeLessThanOrEqual(100);
		});

		it('should handle a Go-style file with braces in string literals and comments', () => {
			const lines = makeLines(
				[
					'function parseConfig(raw) {',
					'  // YAML keys like "skip-files:" and regex patterns like ".*_test\\.go$"',
					'  // should not confuse the parser. Neither should { or } in comments.',
					'  const defaults = {',
					'    concurrency: 4,',
					'    timeout: "5m",',
					'    tests: true',
					'  };',
					'',
					'  if (!raw || typeof raw !== "object") {',
					'    return defaults;',
					'  }',
					'',
					'  // Merge sections',
					'  const result = { ...defaults };',
					'  for (const [section, value] of Object.entries(raw)) {',
					'    if (typeof value === "object" && value !== null) {',
					'      result[section] = { ...defaults[section], ...value };',
					'    } else {',
					'      result[section] = value;',
					'    }',
					'  }',
					'',
					'  // Validate severity rules: { linters: [...], severity: "warning" }',
					'  if (result.severity && result.severity.rules) {',
					'    for (const rule of result.severity.rules) {',
					'      if (!rule.linters || !Array.isArray(rule.linters)) {',
					'        throw new Error(`Invalid severity rule: ${JSON.stringify(rule)}`);',
					'      }',
					'    }',
					'  }',
					'',
					'  return result;',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('parseConfig');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(lines.length - 1);

			// Braces in comments (lines 1-2, line 22) must not corrupt region detection
			// Inline objects { ...defaults }, { ...defaults[section], ...value } must not corrupt
			// Template literal with JSON.stringify must not corrupt

			// Should have meaningful nesting (if > for > if)
			expect(funcRegions[0].factors!.nestingDepth).toBeGreaterThanOrEqual(2);
			expect(funcRegions[0].factors!.branchingFactor).toBeGreaterThanOrEqual(3);
		});

		it('should handle a file mixing code and large config objects', () => {
			const lines = makeLines(
				[
					'function createLintConfig(options) {',
					'  const linters = {};',
					'',
					'  if (options.strict) {',
					'    Object.assign(linters, {',
					'      govet: { "check-shadowing": true },',
					'      gosec: { excludes: [] },',
					'      gocyclo: { "min-complexity": 10 },',
					'      revive: {',
					'        rules: [',
					'          { name: "blank-imports" },',
					'          { name: "context-as-argument" },',
					'          { name: "error-return" },',
					'          { name: "error-strings" },',
					'          { name: "exported" },',
					'          { name: "if-return" },',
					'          { name: "var-naming" },',
					'          { name: "range" },',
					'          { name: "receiver-naming" },',
					'          { name: "indent-error-flow" },',
					'          { name: "errorf" },',
					'          { name: "empty-block" },',
					'          { name: "superfluous-else" },',
					'          { name: "unused-parameter" },',
					'          { name: "unreachable-code" }',
					'        ]',
					'      }',
					'    });',
					'  } else {',
					'    Object.assign(linters, {',
					'      govet: {},',
					'      gocyclo: { "min-complexity": 20 }',
					'    });',
					'  }',
					'',
					'  const issues = {',
					'    "exclude-rules": [],',
					'    "max-issues-per-linter": 0,',
					'    "max-same-issues": 0',
					'  };',
					'',
					'  if (options.excludeTests) {',
					'    issues["exclude-rules"].push({',
					'      path: "_test\\\\.go$",',
					'      linters: ["gosec", "gocyclo", "funlen"]',
					'    });',
					'  }',
					'',
					'  for (const pattern of options.excludePatterns || []) {',
					'    issues["exclude-rules"].push({',
					'      text: pattern,',
					'      linters: ["errcheck"]',
					'    });',
					'  }',
					'',
					'  return {',
					'    run: { concurrency: options.concurrency || 4, timeout: options.timeout || "5m" },',
					'    linters: { "disable-all": true, enable: Object.keys(linters) },',
					'    "linters-settings": linters,',
					'    issues,',
					'    severity: {',
					'      "default-severity": "error",',
					'      rules: [',
					'        { linters: ["misspell"], severity: "warning" },',
					'        { linters: ["goconst"], severity: "warning" }',
					'      ]',
					'    }',
					'  };',
					'}'
				].join('\n')
			);

			const result = analyzer.analyze(lines);

			// The entire thing is one function despite massive nested config objects
			const funcRegions = result.regions.filter((r) => r.type === 'function');
			expect(funcRegions.length).toBe(1);
			expect(funcRegions[0].name).toBe('createLintConfig');
			expect(funcRegions[0].startLine).toBe(0);
			expect(funcRegions[0].endLine).toBe(lines.length - 1);

			// Deeply nested object literals with arrays of objects ({ name: "..." })
			// inside Object.assign() must not fragment the function

			// Should detect branching (if/else, if, for)
			expect(funcRegions[0].factors!.branchingFactor).toBeGreaterThanOrEqual(2);
		});
	});
	describe('non-branching `?` tokens (regression)', () => {
		// The tokenizer emits `?` as a standalone operator, so optional chaining,
		// nullish coalescing and TS optional members each used to fire a ternary
		// increment AND arm the nesting latch. A five-line function with one `if`
		// and two `??` defaults measured Cognitive Complexity 15 — SonarSource's
		// "too complex to keep" threshold — of which 14 points were noise.
		const cc = (code: string) =>
			analyzer.analyze(makeLines(code), 'typescript').regions[0]?.cognitiveComplexity ?? 0;

		it('does not count optional chaining as a branch', () => {
			expect(cc('function f(a: any) {\n  const v = a?.b;\n  return v;\n}')).toBe(0);
		});

		it('does not count nullish coalescing as a branch', () => {
			expect(cc('function f(a: any) {\n  const v = a ?? 0;\n  return v;\n}')).toBe(0);
		});

		it('does not count TypeScript optional parameters as branches', () => {
			expect(cc('function f(a?: string, b?: number) {\n  return a;\n}')).toBe(0);
		});

		it('does not count optional call or index access as branches', () => {
			expect(cc('function f(a: any) {\n  return a?.[0] ?? a?.();\n}')).toBe(0);
		});

		it('still counts a real ternary', () => {
			expect(cc('function f(a: number) {\n  return a > 1 ? 1 : 2;\n}')).toBe(1);
		});

		// The numeric control above is the one literal type that survived the
		// original string-filtering defect, so it passed while every string ternary
		// silently scored zero. These are the shapes that actually caught it.
		it('counts a ternary whose branches are string literals', () => {
			expect(cc("function f(a: boolean) {\n  return a ? 'yes' : 'no';\n}")).toBe(1);
		});

		it('counts a ternary whose branches are template literals', () => {
			expect(cc('function f(a: boolean) {\n  return a ? `yes` : `no`;\n}')).toBe(1);
		});

		it('counts a string ternary alongside optional chaining on one line', () => {
			expect(
				cc("function f(u?: { n?: string }) {\n  return u?.n ?? (u ? 'some' : 'none');\n}")
			).toBe(1);
		});

		it('counts only the real branch when both forms appear together', () => {
			expect(
				cc(
					'function f(cfg: any, user?: any) {\n' +
						"  const name = user?.name ?? 'anon';\n" +
						"  const tier = cfg?.tier ?? 'free';\n" +
						"  if (tier === 'pro') return name;\n" +
						"  return 'x';\n" +
						'}'
				)
			).toBe(1);
		});
	});

	describe('levels derive from raw Cognitive Complexity', () => {
		const flat = (n: number) =>
			`function f(x: number) {\n${Array.from({ length: n }, (_, i) => `  if (x === ${i}) return ${i};`).join('\n')}\n  return -1;\n}`;

		it('bands at the published thresholds (5 / 10 / 15)', () => {
			const level = (n: number) => analyzer.analyze(makeLines(flat(n)), 'typescript').level;
			expect(level(1)).toBe('low');
			expect(level(5)).toBe('medium');
			expect(level(10)).toBe('high');
			expect(level(15)).toBe('critical');
		});

		it('reports the hottest region unbounded, where the legacy score saturates', () => {
			const m = analyzer.analyze(makeLines(flat(120)), 'typescript');
			expect(m.maxCognitiveComplexity).toBe(120);
			// The deprecated score cannot tell 15 from 120 — this is why it is not shown.
			expect(m.regions[0].score).toBe(100);
			expect(analyzer.analyze(makeLines(flat(15)), 'typescript').regions[0].score).toBe(100);
		});

		it('is not diluted by appending simple functions', () => {
			const hot = flat(15);
			const padded = [
				hot,
				...Array.from({ length: 20 }, (_, i) => `function n${i}() {\n  return ${i};\n}`)
			].join('\n\n');

			const alone = analyzer.analyze(makeLines(hot), 'typescript');
			const withPadding = analyzer.analyze(makeLines(padded), 'typescript');

			expect(withPadding.maxCognitiveComplexity).toBe(alone.maxCognitiveComplexity);
			expect(withPadding.level).toBe('critical');
			// The deprecated mean is what used to collapse to 'low' here.
			expect(withPadding.overall!).toBeLessThan(alone.overall!);
		});
	});
	describe('score is independent of formatting (regression)', () => {
		// A boolean sequence does not end at a line break. Building the sequence
		// state per line meant one increment when the condition fit on one line and
		// one per operator once Prettier wrapped the identical expression — Simple
		// to past the refactor threshold with no semantic change.
		const cc = (code: string) =>
			analyzer.analyze(makeLines(code), 'typescript').regions[0]?.cognitiveComplexity ?? 0;

		it('scores a wrapped && chain the same as a one-line one', () => {
			const oneLine =
				'function f(u: any) {\n  if (u.a && u.b && u.c && u.d && u.e && u.f) return 1;\n  return 0;\n}';
			const wrapped =
				'function f(u: any) {\n  if (\n    u.a &&\n    u.b &&\n    u.c &&\n    u.d &&\n    u.e &&\n    u.f\n  )\n    return 1;\n  return 0;\n}';
			expect(cc(wrapped)).toBe(cc(oneLine));
		});

		it('still charges a mixed &&/|| sequence per alternation', () => {
			const mixed =
				'function f(a: any) {\n  if (a.x && a.y || a.z && a.w) return 1;\n  return 0;\n}';
			expect(cc(mixed)).toBeGreaterThan(1);
		});
	});

	describe('declarations are not recursive calls (regression)', () => {
		// Only `function`/`func`/`def` were excluded as the preceding token, but a
		// class method, object-literal method, getter or setter has no such keyword,
		// so its own declaration line matched the region name and took a phantom +1.
		const cc = (code: string) =>
			analyzer.analyze(makeLines(code), 'typescript').regions[0]?.cognitiveComplexity ?? 0;
		const total = (code: string) =>
			analyzer.analyze(makeLines(code), 'typescript').totalCognitiveComplexity;

		it('scores a branchless class method as zero', () => {
			expect(cc('class S {\n  work(x: number) {\n    return x;\n  }\n}')).toBe(0);
		});

		it('scores a branchless getter as zero', () => {
			expect(cc('class S {\n  get work() {\n    return 1;\n  }\n}')).toBe(0);
		});

		it('scores a method the same as the identical free function', () => {
			const free = 'function work(x: number) {\n  if (x > 1) return 1;\n  return 0;\n}';
			const method =
				'class S {\n  work(x: number) {\n    if (x > 1) return 1;\n    return 0;\n  }\n}';
			expect(cc(method)).toBe(cc(free));
		});

		it('does not accumulate phantom increments across many methods', () => {
			const many =
				'class S {\n' +
				Array.from({ length: 20 }, (_, i) => `  m${i}() {\n    return ${i};\n  }`).join('\n') +
				'\n}';
			expect(total(many)).toBe(0);
		});

		it('still counts genuine direct recursion', () => {
			expect(
				cc(
					'function fact(n: number): number {\n  if (n <= 1) return 1;\n  return n * fact(n - 1);\n}'
				)
			).toBeGreaterThanOrEqual(2);
		});
	});
	describe('nesting and sequence bookkeeping (differential regressions)', () => {
		// Found by an independent acorn-AST implementation of the SonarSource rules,
		// run differentially over this repo's own source: 131 of 1742 functions
		// disagreed before these fixes.
		const cc = (code: string) =>
			analyzer.analyze(makeLines(code), 'typescript').regions[0]?.cognitiveComplexity ?? 0;

		it('counts nesting for BRACELESS bodies', () => {
			// The central rule of the metric. The nesting stack only pushed on `{`, so
			// every increment here reported nesting 0 and the total was 3, not 6.
			expect(
				cc('function f(a: any, b: any, c: any) {\n  if (a) if (b) if (c) return 1;\n  return 0;\n}')
			).toBe(6);
			expect(
				cc('function f(xs: any[]) {\n  for (const x of xs) if (x > 0) return x;\n  return 0;\n}')
			).toBe(3);
		});

		it('scores a braced body the same as the equivalent braceless one', () => {
			const braceless =
				'function f(xs: any[]) {\n  for (const x of xs) if (x > 0) return x;\n  return 0;\n}';
			const braced =
				'function f(xs: any[]) {\n  for (const x of xs) {\n    if (x > 0) {\n      return x;\n    }\n  }\n  return 0;\n}';
			expect(cc(braced)).toBe(cc(braceless));
		});

		it('treats parenthesised ternaries as siblings, not a chain', () => {
			expect(
				cc(
					'function f(a: any, b: any, c: any) {\n  return (a ? 1 : 2) && (b ? 3 : 4) && (c ? 5 : 6);\n}'
				)
			).toBe(4);
			// while a genuine chain still nests
			expect(cc("function f(n: number) {\n  return n > 90 ? 'A' : n > 80 ? 'B' : 'C';\n}")).toBe(3);
		});

		it('does not let a ternary colon split a boolean sequence', () => {
			expect(cc('function f(a: any) {\n  if (a.x && a.y && a.z) return 1;\n  return 0;\n}')).toBe(
				2
			);
		});

		it('requires a self receiver for recursion', () => {
			expect(cc('function save(x: any) {\n  return db.save(x);\n}')).toBe(0);
			expect(
				cc('class A {\n  clear() {\n    this.contexts.clear();\n    this.manager.clear();\n  }\n}')
			).toBe(0);
			expect(cc('class A {\n  save(x: any) {\n    return this.save(x);\n  }\n}')).toBe(1);
			expect(
				cc(
					'function fact(n: number): number {\n  if (n <= 1) return 1;\n  return n * fact(n - 1);\n}'
				)
			).toBeGreaterThanOrEqual(2);
		});

		it('reproduces the shipped hero and demo samples exactly', () => {
			const hero =
				"export function triageLoad(s: any[], q: number): string {\n  let score = 0;\n  for (const signal of s) {\n    if (signal.kind === 'error') {\n      if (signal.count > 3 && q > 20) {\n        if (signal.owner) score += signal.count * 6;\n        else if (q > 80) score += 24;\n        else score += 12;\n      } else {\n        score += 3;\n      }\n    } else if (signal.count > 5) {\n      score += 10;\n    }\n  }\n  return score > 80 ? 'critical' : 'clear';\n}";
			expect(cc(hero)).toBe(16);
		});
	});
	describe('region detection survives regex literals (regression)', () => {
		const analyze = (code: string) => analyzer.analyze(makeLines(code), 'typescript');

		it('does not let a brace inside a regex literal extend a function', () => {
			// The char scanner skipped strings and `//` comments but not regex
			// literals, so `/[{,]\\s*$/` inflated the brace depth and the enclosing
			// function never closed. In this repo's own YAML tokenizer a 20-line
			// method was reported as 379 lines at cognitive complexity 127.
			const code = [
				'function atKey(before) {',
				'  if (/[{,]\\s*$/.test(before)) {',
				'    if (/\\{\\s*$/.test(before)) return true;',
				'  }',
				'  return false;',
				'}',
				'function other(a) {',
				'  if (a) return 1;',
				'  return 0;',
				'}'
			].join('\n');

			const regions = analyze(code).regions.filter((r) => r.type === 'function');
			const atKey = regions.find((r) => r.name === 'atKey');
			const other = regions.find((r) => r.name === 'other');

			expect(atKey).toBeDefined();
			expect(other, 'the function after the regex must still be found').toBeDefined();
			expect(atKey!.endLine).toBeLessThan(other!.startLine);
		});

		it('still treats division as division', () => {
			const code =
				'function ratio(a: number, b: number) {\n  const r = a / b;\n  if (r > 1) return r;\n  return 0;\n}';
			expect(analyze(code).regions[0]?.cognitiveComplexity).toBe(1);
		});
	});

	describe('the file headline is a function, not a class', () => {
		it('reports the hottest FUNCTION, not the class that contains it', () => {
			// Cognitive Complexity is defined per function. A class region aggregates
			// every method it holds, so including it made the headline a class under a
			// label reading "hottest function".
			const code = [
				'class Service {',
				'  simple() {',
				'    return 1;',
				'  }',
				'  hot(x: number) {',
				'    if (x > 1) {',
				'      if (x > 2) {',
				'        return 2;',
				'      }',
				'    }',
				'    return 0;',
				'  }',
				'}'
			].join('\n');

			const metrics = analyzer.analyze(makeLines(code), 'typescript');
			const hottestFn = metrics.regions
				.filter((r) => r.type === 'function')
				.reduce((a, b) => (b.cognitiveComplexity > a.cognitiveComplexity ? b : a));

			expect(metrics.maxCognitiveComplexity).toBe(hottestFn.cognitiveComplexity);
			expect(hottestFn.name).toBe('hot');
		});
	});
	describe('statement boundaries are structural, not punctuation-shaped', () => {
		// A sequence ends at a real statement end. An earlier fix used `;`, which is
		// the one terminator Python and Go do not have — two separate `and`-chains
		// collapsed into a single increment in both languages, and in JS written
		// without semicolons.
		const cc = (code: string, language = 'typescript') =>
			analyzer.analyze(makeLines(code), language).regions[0]?.cognitiveComplexity ?? 0;

		it('separates boolean sequences in Python', () => {
			expect(
				cc('def f(a, b, c, d):\n    x = a and b\n    y = c and d\n    return x and y', 'python')
			).toBe(3);
		});

		it('separates boolean sequences in Go', () => {
			expect(
				cc('func f(a, b, c, d bool) bool {\n\tx := a && b\n\ty := c && d\n\treturn x && y\n}', 'go')
			).toBe(3);
		});

		it('separates boolean sequences in JS written without semicolons', () => {
			const asi =
				'function f(a: any, b: any, c: any, d: any) {\n  const x = a && b\n  const y = c && d\n  return x && y\n}';
			const semis =
				'function f(a: any, b: any, c: any, d: any) {\n  const x = a && b;\n  const y = c && d;\n  return x && y;\n}';
			expect(cc(asi)).toBe(3);
			expect(cc(asi)).toBe(cc(semis));
		});

		it('still scores a wrapped condition as one sequence', () => {
			const wrapped =
				'function f(u: any) {\n  if (\n    u.a &&\n    u.b &&\n    u.c\n  ) return 1;\n  return 0;\n}';
			const oneLine = 'function f(u: any) {\n  if (u.a && u.b && u.c) return 1;\n  return 0;\n}';
			expect(cc(wrapped)).toBe(cc(oneLine));
		});
	});

	describe('the gauge scale is monotonic', () => {
		// Mirrors CognitiveLoadMeter's fill. Two earlier scales failed: one pegged at
		// 100% in every shipped state, the next made cc 15 fill the bar and cc 16
		// drop it to 53% — crossing the refactor threshold made the graphic say
		// "better". A metric graphic must never shrink as the metric grows.
		const THRESHOLD = COGNITIVE_COMPLEXITY_BANDS.critical;
		const MARK = 70;
		const fill = (cc: number) => {
			if (cc <= 0) return 0;
			if (cc <= THRESHOLD) return Math.round((cc / THRESHOLD) * MARK);
			const over = Math.log2(cc / THRESHOLD);
			return Math.round(MARK + (100 - MARK) * (1 - 1 / (1 + over)));
		};

		it('never decreases as complexity rises', () => {
			let previous = -1;
			for (let cc = 0; cc <= 300; cc++) {
				const value = fill(cc);
				expect(
					value,
					`fill(${cc}) = ${value} < fill(${cc - 1}) = ${previous}`
				).toBeGreaterThanOrEqual(previous);
				previous = value;
			}
		});

		it('puts the refactor threshold at a fixed mark and never saturates below it', () => {
			expect(fill(THRESHOLD)).toBe(MARK);
			expect(fill(THRESHOLD + 1)).toBeGreaterThan(MARK);
			expect(fill(300)).toBeLessThanOrEqual(100);
		});
	});
});
