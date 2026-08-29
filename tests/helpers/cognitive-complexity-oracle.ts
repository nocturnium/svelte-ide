/**
 * Independent SonarSource Cognitive Complexity reference, over an acorn ESTree AST.
 *
 * Written from the whitepaper's rules, deliberately NOT from the analyzer's logic:
 * the analyzer is token-based and language-agnostic, this is AST-based and JS-only.
 * They share no code and no assumptions, so agreement between them is evidence
 * rather than restatement.
 *
 * Lives in tests/ — outside src/lib — so it can never reach the published package,
 * and is excluded from vitest discovery by the `tests/**` pattern in vite.config.ts
 * while remaining importable by the suites that need it.
 *
 * @see https://www.sonarsource.com/docs/CognitiveComplexity.pdf
 */
import * as acorn from 'acorn';
import ts from 'typescript';

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
export function oracle(source: string): number {
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

function nameOf(node: AnyNode, parent: AnyNode | null): string | undefined {
	const id = node.id as AnyNode | undefined;
	if (id?.name) return id.name as string;
	const pid = parent?.id as AnyNode | undefined;
	if (parent?.type === 'VariableDeclarator' && pid?.type === 'Identifier')
		return pid.name as string;
	const key = parent?.key as AnyNode | undefined;
	if (key?.type === 'Identifier') return key.name as string;
	return undefined;
}
/** Reference complexity of the FIRST function declared in `source` (JS only). */
export interface ReferenceRegion {
	name: string;
	startLine: number;
	endLine: number;
	cc: number;
}

/**
 * Every named function in a TypeScript source, with its reference complexity.
 * Types are stripped with the TypeScript compiler (already a devDependency)
 * because acorn cannot parse TS. Returns null when the transpiled output will
 * not parse, so the sweep skips rather than guesses.
 */
export function referenceRegions(tsSource: string): ReferenceRegion[] | null {
	const js = ts.transpileModule(tsSource, {
		compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
	}).outputText;

	let ast: AnyNode;
	try {
		ast = acorn.parse(js, {
			ecmaVersion: 'latest',
			sourceType: 'module',
			locations: true
		}) as unknown as AnyNode;
	} catch {
		return null;
	}

	const out: ReferenceRegion[] = [];
	(function walk(node: AnyNode, parent: AnyNode | null) {
		if (FUNCS.has(node.type)) {
			const name = nameOf(node, parent);
			if (name) {
				const loc = node.loc as { start: { line: number }; end: { line: number } };
				out.push({
					name,
					startLine: loc.start.line - 1,
					endLine: loc.end.line - 1,
					cc: oracleComplexity(node, name)
				});
			}
		}
		for (const child of childNodes(node)) walk(child, node);
	})(ast, null);
	return out;
}
