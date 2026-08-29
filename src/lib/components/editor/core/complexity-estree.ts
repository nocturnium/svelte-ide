/**
 * ESTree adapter for {@link analyzeAstComplexity}.
 *
 * ESTree is the shape acorn, espree, meriyah, and @typescript-eslint/parser all
 * emit, so this one adapter covers JavaScript, JSX, TypeScript and TSX depending
 * only on which parser the consumer brings. The parser stays THEIR dependency —
 * this package still installs nothing.
 *
 * Written as a worked example as much as a utility: an adapter is short, and
 * seeing one makes writing a tree-sitter or SWC adapter obvious.
 */

import type { ComplexityAstAdapter, ComplexityNodeKind } from './complexity-ast';

/** The subset of an ESTree node this adapter reads. */
export interface EstreeNode {
	type: string;
	loc?: { start: { line: number }; end: { line: number } } | null;
	[key: string]: unknown;
}

const LOOPS = new Set([
	'ForStatement',
	'ForInStatement',
	'ForOfStatement',
	'WhileStatement',
	'DoWhileStatement'
]);

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

const SKIP_KEYS = new Set([
	'loc',
	'range',
	'start',
	'end',
	'parent',
	'leadingComments',
	'trailingComments'
]);

function isNode(value: unknown): value is EstreeNode {
	return (
		typeof value === 'object' && value !== null && typeof (value as EstreeNode).type === 'string'
	);
}

/**
 * Count RUNS of like operators in a logical chain. `a && b && c` is one run,
 * `a && b || c` is two. Counting operators instead of runs is the single most
 * common way to get this rule wrong, and it makes the score depend on how the
 * author parenthesised rather than on how hard the expression is to read.
 */
function booleanRuns(node: EstreeNode): number {
	const operators: string[] = [];
	const walk = (n: EstreeNode) => {
		if (n.type === 'LogicalExpression' && (n.operator === '&&' || n.operator === '||')) {
			walk(n.left as EstreeNode);
			operators.push(n.operator as string);
			walk(n.right as EstreeNode);
		}
	};
	walk(node);

	let runs = 0;
	for (let i = 0; i < operators.length; i++) {
		if (i === 0 || operators[i] !== operators[i - 1]) runs++;
	}
	return Math.max(1, runs);
}

/** Nodes that take a structural increment and would collide with an `else`. */
const STRUCTURAL = new Set(['SwitchStatement', 'CatchClause', 'ConditionalExpression', ...LOOPS]);

/** Is this node the `else` branch of its parent? */
function inElseSlot(node: EstreeNode, parent: EstreeNode | null): boolean {
	return parent?.type === 'IfStatement' && parent.alternate === node;
}

/** Adapter for ESTree-shaped trees. */
export function createEstreeAdapter(): ComplexityAstAdapter<EstreeNode> {
	return {
		kindOf(node, parent, context): ComplexityNodeKind | null {
			const t = node.type;

			if (FUNCTIONS.has(t)) return 'function';
			if (LOOPS.has(t)) return 'loop';
			if (t === 'SwitchStatement') return 'switch';
			if (t === 'CatchClause') return 'catch';
			if (t === 'ConditionalExpression') return 'ternary';

			if (t === 'IfStatement') {
				// An `if` occupying its parent's `alternate` slot IS an `else if`, and
				// takes a flat increment at the same depth rather than a structural one.
				return inElseSlot(node, parent) ? 'else-if' : 'if';
			}

			// ESTree has no `else` node: the alternate is whatever statement follows.
			// So the else branch is "whatever sits in that slot" — usually a block,
			// but a braceless `else doThing()` puts the statement there directly.
			// When that statement is itself a scoring construct (`else while (x) {}`)
			// it keeps its own kind and picks the else increment up via
			// mergedIncrementOf, because one node cannot report two kinds.
			if (inElseSlot(node, parent) && !STRUCTURAL.has(t)) return 'else';

			// Score a chain once, at its top, so `a && b && c` is not counted per node.
			if (t === 'LogicalExpression' && parent?.type !== 'LogicalExpression') {
				const op = node.operator;
				if (op === '&&' || op === '||') return 'boolean-sequence';
			}

			if ((t === 'BreakStatement' || t === 'ContinueStatement') && node.label) {
				return 'labelled-jump';
			}

			// Direct recursion into the function being scored — including from inside
			// a nested callback, which is still a re-entry. The callee must be a bare
			// identifier: matching `db.save(x)` inside `save()` was a real defect in
			// this repo's token scanner, and a member call is never a recursive call
			// to the function whose name it happens to end in.
			if (
				t === 'CallExpression' &&
				context.scoredName &&
				isNode(node.callee) &&
				node.callee.type === 'Identifier' &&
				node.callee.name === context.scoredName
			) {
				return 'recursion';
			}

			return null;
		},

		childrenOf(node) {
			const out: EstreeNode[] = [];
			for (const key of Object.keys(node)) {
				if (SKIP_KEYS.has(key)) continue;
				const value = node[key];
				if (Array.isArray(value)) {
					for (const item of value) if (isNode(item)) out.push(item);
				} else if (isNode(value)) {
					out.push(value);
				}
			}
			return out;
		},

		lineRangeOf(node) {
			const loc = node.loc;
			if (!loc) return { startLine: 0, endLine: 0 };
			return { startLine: loc.start.line - 1, endLine: loc.end.line - 1 };
		},

		nameOf(node, parent) {
			const id = node.id;
			if (isNode(id) && typeof id.name === 'string') return id.name;
			if (!parent) return undefined;
			// `const f = () => {}`, `{ f() {} }`, `class A { f() {} }`
			const holder =
				parent.type === 'VariableDeclarator'
					? parent.id
					: parent.type === 'Property' ||
						  parent.type === 'MethodDefinition' ||
						  parent.type === 'PropertyDefinition'
						? parent.key
						: null;
			if (isNode(holder) && typeof holder.name === 'string') return holder.name;
			return undefined;
		},

		booleanRunsOf(node) {
			return booleanRuns(node);
		},

		mergedIncrementOf(node, parent) {
			// The else increment for a braceless `else <construct>`, which reported
			// its own structural kind and so could not also report `else`. Merging it
			// here also raises the depth, so `else while (x) {}` scores exactly as
			// `else { while (x) {} }` does.
			return inElseSlot(node, parent) && STRUCTURAL.has(node.type) ? 1 : 0;
		},

		bodyOf(node) {
			const t = node.type;
			if (t === 'IfStatement') {
				// The consequent nests; the test does not. The alternate is classified
				// separately as `else`/`else-if` and nests through its own rule.
				return (node.consequent as EstreeNode) ?? null;
			}
			if (LOOPS.has(t) || FUNCTIONS.has(t) || t === 'CatchClause') {
				return (node.body as EstreeNode) ?? null;
			}
			if (t === 'SwitchStatement') {
				return (node.cases as EstreeNode[]) ?? null;
			}
			if (t === 'ConditionalExpression') {
				return [node.consequent as EstreeNode, node.alternate as EstreeNode].filter(isNode);
			}
			return null;
		}
	};
}
