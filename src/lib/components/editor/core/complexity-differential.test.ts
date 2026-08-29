import { describe, it, expect, beforeEach } from 'vitest';
import * as acorn from 'acorn';
import { ComplexityAnalyzer } from './complexity-analyzer';
import { CORPUS } from '../../../../../tests/helpers/cognitive-complexity-corpus';
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

	const body = (fnNode.body as AnyNode) ?? fnNode;
	if (body.type === 'BlockStatement') {
		for (const child of childNodes(body)) visit(child, 0, null);
	} else {
		// An expression-bodied arrow: the body IS the expression, and it can score.
		// Walking its children instead skips it — `(a, b) => a && b` then reads 0.
		// Found by the repo-wide AST-walker sweep, which disagreed on exactly the
		// two functions in this repo shaped that way.
		visit(body, 0, null);
	}
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
