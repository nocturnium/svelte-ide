import { describe, it, expect, beforeEach } from 'vitest';
import * as acorn from 'acorn';
import { ComplexityAnalyzer } from './complexity-analyzer';
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
 * So: the oracle below is written from the SonarSource whitepaper's rules over
 * an acorn ESTree AST, deliberately NOT from the analyzer's logic. The analyzer
 * is token-based and language-agnostic; the oracle is AST-based and JS/TS only.
 * They share no code and no assumptions, so agreement is evidence.
 *
 * acorn is a devDependency and this is a `*.test.ts`, which
 * scripts/strip-dist-tests.mjs removes from `dist/` — the package's
 * zero-runtime-dependency guarantee is untouched.
 *
 * @see https://www.sonarsource.com/docs/CognitiveComplexity.pdf
 */

type AnyNode = acorn.Node & Record<string, unknown>;

const LOOPS = new Set([
	'ForStatement',
	'ForInStatement',
	'ForOfStatement',
	'WhileStatement',
	'DoWhileStatement'
]);
const FUNCS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function childNodes(node: AnyNode): AnyNode[] {
	const out: AnyNode[] = [];
	for (const key of Object.keys(node)) {
		if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (const child of value) {
				if (child && typeof (child as AnyNode).type === 'string') out.push(child as AnyNode);
			}
		} else if (value && typeof (value as AnyNode).type === 'string') {
			out.push(value as AnyNode);
		}
	}
	return out;
}

/**
 * Number of operator RUNS in a logical chain. `a && b && c` is one run (+1);
 * `a && b || c` is two (+2). This is the rule that makes the metric independent
 * of how the expression is wrapped.
 */
function logicalRuns(node: AnyNode): number {
	const ops: string[] = [];
	(function walk(n: AnyNode) {
		if (n.type === 'LogicalExpression' && (n.operator === '&&' || n.operator === '||')) {
			walk(n.left as AnyNode);
			ops.push(n.operator as string);
			walk(n.right as AnyNode);
		}
	})(node);
	let runs = 0;
	for (let i = 0; i < ops.length; i++) if (i === 0 || ops[i] !== ops[i - 1]) runs++;
	return runs;
}

/** Reference Cognitive Complexity for one function node. */
function oracleComplexity(fnNode: AnyNode, fnName: string | undefined): number {
	let total = 0;

	function visit(node: AnyNode | null | undefined, nesting: number, parent: AnyNode | null): void {
		if (!node) return;
		const t = node.type;

		if (t === 'IfStatement') {
			const isElseIf = parent?.type === 'IfStatement' && parent.alternate === node;
			// B1 + B2: `if` takes the nesting penalty, `else if` and `else` do not.
			total += isElseIf ? 1 : 1 + nesting;
			visit(node.test as AnyNode, nesting, node);
			visit(node.consequent as AnyNode, nesting + 1, node);
			const alternate = node.alternate as AnyNode | null;
			if (alternate) {
				if (alternate.type === 'IfStatement') {
					visit(alternate, nesting, node);
				} else {
					total += 1;
					visit(alternate, nesting + 1, node);
				}
			}
			return;
		}
		if (t === 'ConditionalExpression') {
			total += 1 + nesting;
			visit(node.test as AnyNode, nesting, node);
			visit(node.consequent as AnyNode, nesting + 1, node);
			visit(node.alternate as AnyNode, nesting + 1, node);
			return;
		}
		if (t === 'SwitchStatement') {
			total += 1 + nesting;
			visit(node.discriminant as AnyNode, nesting, node);
			for (const c of node.cases as AnyNode[]) visit(c, nesting + 1, node);
			return;
		}
		if (LOOPS.has(t)) {
			total += 1 + nesting;
			for (const child of childNodes(node)) {
				visit(child, child === node.body ? nesting + 1 : nesting, node);
			}
			return;
		}
		if (t === 'CatchClause') {
			total += 1 + nesting;
			for (const child of childNodes(node)) visit(child, nesting + 1, node);
			return;
		}
		if (t === 'LogicalExpression' && parent?.type !== 'LogicalExpression') {
			total += logicalRuns(node);
			for (const child of childNodes(node)) visit(child, nesting, node);
			return;
		}
		if ((t === 'BreakStatement' || t === 'ContinueStatement') && node.label) {
			total += 1;
			return;
		}
		if (FUNCS.has(t)) {
			// A nested function takes no increment but raises nesting for its body.
			for (const child of childNodes(node)) visit(child, nesting + 1, node);
			return;
		}
		if (
			t === 'CallExpression' &&
			fnName &&
			(node.callee as AnyNode)?.type === 'Identifier' &&
			(node.callee as AnyNode).name === fnName
		) {
			total += 1;
		}
		for (const child of childNodes(node)) visit(child, nesting, node);
	}

	for (const child of childNodes((fnNode.body as AnyNode) ?? fnNode)) visit(child, 0, null);
	return total;
}

/** Reference complexity of the FIRST function declared in `source`. */
function oracle(source: string): number {
	const ast = acorn.parse(source, {
		ecmaVersion: 'latest',
		sourceType: 'module',
		locations: true
	}) as unknown as AnyNode;

	let found: { node: AnyNode; name: string | undefined } | null = null;
	(function walk(node: AnyNode, parent: AnyNode | null) {
		if (!found && FUNCS.has(node.type)) {
			const id = node.id as AnyNode | undefined;
			const key = parent?.key as AnyNode | undefined;
			const pid = parent?.id as AnyNode | undefined;
			found = {
				node,
				name:
					(id?.name as string | undefined) ??
					(pid?.type === 'Identifier' ? (pid.name as string) : undefined) ??
					(key?.type === 'Identifier' ? (key.name as string) : undefined)
			};
		}
		for (const child of childNodes(node)) walk(child, node);
	})(ast, null);

	if (!found) throw new Error('oracle: no function found in source');
	return oracleComplexity(found.node, found.name);
}

function makeLines(code: string): Line[] {
	return code.split('\n').map((text, number) => ({ number, text }));
}

/**
 * Corpus. Every entry is plain JS so acorn can parse it without a TS plugin;
 * the analyzer is run in `typescript` mode regardless, which is the mode the
 * editor, the hero and the demo all default to.
 */
const CORPUS: Array<{ name: string; code: string }> = [
	{ name: 'empty function', code: 'function f() {\n  return 1;\n}' },
	{ name: 'single if', code: 'function f(a) {\n  if (a) return 1;\n  return 0;\n}' },
	{
		name: 'if/else',
		code: 'function f(a) {\n  if (a) {\n    return 1;\n  } else {\n    return 0;\n  }\n}'
	},
	{
		name: 'if/else-if/else',
		code: 'function f(a) {\n  if (a > 2) {\n    return 2;\n  } else if (a > 1) {\n    return 1;\n  } else {\n    return 0;\n  }\n}'
	},
	{
		name: 'braceless if chain',
		code: 'function f(a, b, c) {\n  if (a) if (b) if (c) return 1;\n  return 0;\n}'
	},
	{
		name: 'braceless for + if',
		code: 'function f(xs) {\n  for (const x of xs) if (x > 0) return x;\n  return 0;\n}'
	},
	{
		name: 'braced for + if',
		code: 'function f(xs) {\n  for (const x of xs) {\n    if (x > 0) {\n      return x;\n    }\n  }\n  return 0;\n}'
	},
	{
		name: 'nested loops with if',
		code: 'function f(rows) {\n  for (let i = 0; i < rows.length; i++) {\n    for (let j = 0; j < rows[i].length; j++) {\n      if (rows[i][j]) {\n        return 1;\n      }\n    }\n  }\n  return 0;\n}'
	},
	{
		name: 'whitepaper sumOfPrimes',
		code: 'function sumOfPrimes(max) {\n  let total = 0;\n  OUT: for (let i = 1; i <= max; i++) {\n    for (let j = 2; j < i; j++) {\n      if (i % j === 0) {\n        continue OUT;\n      }\n    }\n    total += i;\n  }\n  return total;\n}'
	},
	{
		name: 'whitepaper getWords',
		code: 'function getWords(num) {\n  switch (num) {\n    case 1:\n      return "one";\n    case 2:\n      return "a couple";\n    default:\n      return "lots";\n  }\n}'
	},
	{ name: 'single ternary', code: 'function f(a) {\n  return a ? 1 : 2;\n}' },
	{ name: 'string ternary', code: "function f(a) {\n  return a ? 'yes' : 'no';\n}" },
	{
		name: 'chained ternary',
		code: "function f(n) {\n  return n > 90 ? 'A' : n > 80 ? 'B' : 'C';\n}"
	},
	{
		name: 'sibling ternaries',
		code: 'function f(a, b, c) {\n  return (a ? 1 : 2) && (b ? 3 : 4) && (c ? 5 : 6);\n}'
	},
	{
		name: 'boolean run &&',
		code: 'function f(a) {\n  if (a.x && a.y && a.z) return 1;\n  return 0;\n}'
	},
	{
		name: 'boolean runs mixed',
		code: 'function f(a) {\n  if (a.w && a.x || a.y && a.z) return 1;\n  return 0;\n}'
	},
	{
		name: 'boolean wrapped over lines',
		code: 'function f(a) {\n  if (\n    a.w &&\n    a.x &&\n    a.y\n  ) {\n    return 1;\n  }\n  return 0;\n}'
	},
	{
		name: 'try/catch',
		code: 'function f(a) {\n  try {\n    if (a) return 1;\n  } catch (e) {\n    return 0;\n  }\n  return 2;\n}'
	},
	{
		name: 'while with break',
		code: 'function f(n) {\n  let i = 0;\n  while (i < n) {\n    if (i === 3) {\n      break;\n    }\n    i++;\n  }\n  return i;\n}'
	},
	{
		name: 'recursion',
		code: 'function fact(n) {\n  if (n <= 1) return 1;\n  return n * fact(n - 1);\n}'
	},
	{
		name: 'nested function raises nesting',
		code: 'function outer(xs) {\n  return xs.map(function (x) {\n    if (x > 0) {\n      return 1;\n    }\n    return 0;\n  });\n}'
	},
	{
		name: 'arrow with block body',
		code: 'function outer(xs) {\n  return xs.map((x) => {\n    if (x > 0) {\n      return 1;\n    }\n    return 0;\n  });\n}'
	},
	{
		name: 'deeply nested conditionals',
		code: 'function f(a, b, c, d) {\n  if (a) {\n    if (b) {\n      if (c) {\n        if (d) {\n          return 1;\n        }\n      }\n    }\n  }\n  return 0;\n}'
	},
	{
		name: 'do/while',
		code: 'function f(n) {\n  let i = 0;\n  do {\n    if (i === n) {\n      return i;\n    }\n    i++;\n  } while (i < 10);\n  return -1;\n}'
	},
	{
		name: 'switch inside loop',
		code: 'function f(xs) {\n  for (const x of xs) {\n    switch (x) {\n      case 1:\n        return 1;\n      default:\n        break;\n    }\n  }\n  return 0;\n}'
	},
	{
		name: 'hero triageLoad',
		code: "function triageLoad(signals, queueDepth) {\n  let score = 0;\n  for (const signal of signals) {\n    if (signal.kind === 'error') {\n      if (signal.count > 3 && queueDepth > 20) {\n        if (signal.owner) score += signal.count * 6;\n        else if (queueDepth > 80) score += 24;\n        else score += 12;\n      } else {\n        score += 3;\n      }\n    } else if (signal.count > 5) {\n      score += 10;\n    }\n  }\n  return score > 80 ? 'critical' : 'clear';\n}"
	},
	{
		name: 'demo processUser',
		code: "function processUser(user, request) {\n  if (!user) {\n    return 'No user';\n  }\n\n  if (user.role === 'admin') {\n    if (user.permissions.includes('write')) {\n      return request.channel === 'api' ? 'Admin API write access' : 'Admin with write access';\n    } else {\n      return 'Admin readonly';\n    }\n  }\n\n  return 'Regular user';\n}"
	}
];

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
				const region = analyzer.analyze(makeLines(entry.code), 'typescript').regions[0];
				expect(region?.cognitiveComplexity ?? 0, `${entry.name}: analyzer vs reference`).toBe(
					expected
				);
			});
		}
	});

	it('scores every corpus entry identically to the reference', () => {
		const mismatches = CORPUS.map((entry) => {
			const expected = oracle(entry.code);
			const actual =
				analyzer.analyze(makeLines(entry.code), 'typescript').regions[0]?.cognitiveComplexity ?? 0;
			return { name: entry.name, expected, actual };
		}).filter((r) => r.expected !== r.actual);

		expect(mismatches, `mismatches:\n${JSON.stringify(mismatches, null, 2)}`).toEqual([]);
	});
});
