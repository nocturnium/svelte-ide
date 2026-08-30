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

/**
 * The subset of an ESTree node this adapter needs at the boundary.
 *
 * Deliberately only the two fields the CONTRACT depends on — `type` to classify
 * a node, `loc` to place it. There used to be an `[key: string]: unknown` index
 * signature here so the adapter's internals could read `body`, `alternate`,
 * `consequent` and the rest without declaring them, and it made this type
 * unusable with every real ESTree definition:
 *
 * TypeScript gives implicit index signatures to type ALIASES, never to
 * interfaces, and acorn's `Program`, `@types/estree`'s `Program` and
 * `TSESTree.Node` are all interfaces. Measured against the published `.d.ts`:
 * the guide's own example failed with TS2322, an explicit type parameter failed
 * with "Index signature for type 'string' is missing in type 'Program'", and
 * even `as EstreeNode` was rejected with TS2352 — the only spelling that
 * compiled was `as unknown as EstreeNode`, the cast reserved for overriding the
 * type system. The flagship adapter did not typecheck against the parser named
 * in its own documentation.
 *
 * With the index signature gone, acorn's `Program`, `@types/estree`'s `Program`
 * and its `Node` union all assign with zero casts. The untyped field access the
 * signature used to buy now happens inside this module through {@link fields},
 * which is where it always belonged: it is this adapter's business, not its
 * callers'.
 */
export interface EstreeNode {
	type: string;
	loc?: { start: { line: number }; end: { line: number } } | null;
}

/**
 * Read arbitrary ESTree fields off a node, internally.
 *
 * One cast, in one place, instead of an index signature on the public type. The
 * shapes differ per node kind and per parser, so this stays `unknown`-typed and
 * every read is guarded by {@link isNode} or an explicit typeof check.
 */
function fields(node: EstreeNode): Record<string, unknown> {
	return node as unknown as Record<string, unknown>;
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
		const f = fields(n);
		if (n.type === 'LogicalExpression' && (f.operator === '&&' || f.operator === '||')) {
			walk(f.left as EstreeNode);
			operators.push(f.operator as string);
			walk(f.right as EstreeNode);
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
	return parent?.type === 'IfStatement' && fields(parent).alternate === node;
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
				const op = fields(node).operator;
				if (op === '&&' || op === '||') return 'boolean-sequence';
			}

			if ((t === 'BreakStatement' || t === 'ContinueStatement') && fields(node).label) {
				return 'labelled-jump';
			}

			// Direct recursion into the function being scored — including from inside
			// a nested callback, which is still a re-entry. The callee must be a bare
			// identifier: matching `db.save(x)` inside `save()` was a real defect in
			// this repo's token scanner, and a member call is never a recursive call
			// to the function whose name it happens to end in.
			if (t === 'CallExpression' && context.scoredName) {
				const callee = fields(node).callee;
				if (
					isNode(callee) &&
					callee.type === 'Identifier' &&
					fields(callee).name === context.scoredName
				) {
					return 'recursion';
				}
			}

			return null;
		},

		childrenOf(node) {
			const out: EstreeNode[] = [];
			const f = fields(node);
			for (const key of Object.keys(f)) {
				if (SKIP_KEYS.has(key)) continue;
				const value = f[key];
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
			const id = fields(node).id;
			if (isNode(id) && typeof fields(id).name === 'string') return fields(id).name as string;
			if (!parent) return undefined;
			// `const f = () => {}`, `{ f() {} }`, `class A { f() {} }`
			const p = fields(parent);
			const holder =
				parent.type === 'VariableDeclarator'
					? p.id
					: parent.type === 'Property' ||
						  parent.type === 'MethodDefinition' ||
						  parent.type === 'PropertyDefinition'
						? p.key
						: null;
			if (isNode(holder) && typeof fields(holder).name === 'string') {
				return fields(holder).name as string;
			}
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
			const f = fields(node);
			if (t === 'IfStatement') {
				// The consequent nests; the test does not. The alternate is classified
				// separately as `else`/`else-if` and nests through its own rule.
				return (f.consequent as EstreeNode) ?? null;
			}
			if (LOOPS.has(t) || FUNCTIONS.has(t) || t === 'CatchClause') {
				return (f.body as EstreeNode) ?? null;
			}
			if (t === 'SwitchStatement') {
				return (f.cases as EstreeNode[]) ?? null;
			}
			if (t === 'ConditionalExpression') {
				return [f.consequent as EstreeNode, f.alternate as EstreeNode].filter(isNode);
			}
			return null;
		}
	};
}
