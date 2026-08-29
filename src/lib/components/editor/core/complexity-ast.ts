/**
 * Cognitive Complexity over a parse tree, for any parser.
 *
 * Validating the provider seam against 77 local models settled what it should be
 * pointed at. Measured against an independent AST reference on twelve functions:
 * the built-in token scanner scored 12/12 in under a millisecond, the best model
 * scored 4/12 in five seconds, and asked the same function three times at
 * temperature 0 it answered 7, then 10, then 12 against a true value of 16. The
 * metric is mechanical counting over a syntax tree — what a parser is good at and
 * a model is bad at.
 *
 * So this ships the part that is actually hard. Parsing is a solved problem with
 * a dozen good libraries; implementing Campbell's rules correctly is not — it
 * took this repository four review rounds and a differential harness to get the
 * token scanner there, and every defect found was in the rules, not the parsing.
 * A consumer plugging in tree-sitter should not have to rediscover that.
 *
 * Bring any tree. Describe it with a {@link ComplexityAstAdapter} and the rules
 * below are applied for you, identically across every language your parser
 * supports.
 *
 * @see https://www.sonarsource.com/docs/CognitiveComplexity.pdf
 */

import type {
	ComplexityContribution,
	ComplexityContributionKind,
	ComplexityMetrics,
	ComplexityRegion
} from './complexity-analyzer';
import {
	COGNITIVE_COMPLEXITY_BANDS,
	getComplexityContributionLabel,
	getComplexityLevel,
	getComplexitySuggestion,
	getLegacyComplexityScore
} from './complexity-analyzer';
import type { ComplexityProvider, ProvidedComplexityRegion } from './complexity-provider';

/**
 * What a node means to the metric. An adapter maps its parser's native node
 * types onto these; everything else in the tree is structure the walker
 * traverses without scoring.
 *
 * The three groups matter and are easy to conflate — this is the distinction
 * the whitepaper draws and the one most re-implementations get wrong:
 *
 *  - `if` `ternary` `switch` `loop` `catch` take a STRUCTURAL increment: +1 plus
 *    the current nesting depth, and they raise nesting for their own body.
 *  - `else` and `else-if` take a FLAT +1 with no nesting penalty — the reader has
 *    already paid for the branch — but `else` still raises nesting for its body.
 *  - `boolean-sequence`, `labelled-jump` and `recursion` are flat +1 and raise
 *    nothing.
 *  - `function` scores nothing at all but raises nesting for its body, which is
 *    what makes a callback inside a loop cost more than one beside it.
 */
export type ComplexityNodeKind =
	| 'function'
	| 'if'
	| 'else-if'
	| 'else'
	| 'ternary'
	| 'switch'
	| 'loop'
	| 'catch'
	| 'boolean-sequence'
	| 'labelled-jump'
	| 'recursion';

/** What the walker knows about where it is when it asks the adapter a question. */
export interface ComplexityWalkContext<TNode> {
	/**
	 * The function whose score is currently being computed — NOT the innermost
	 * function enclosing this node.
	 *
	 * The difference decides what counts as recursion, and it is not academic. In
	 * this repository's own `connect()`, a `setTimeout` callback calls `connect`;
	 * that is a recursive re-entry into the function being scored even though the
	 * innermost enclosing function is the anonymous callback. Every function gets
	 * its own scoring pass, so a nested function's self-calls are still counted —
	 * when it is the one being scored.
	 */
	scoredFunction: TNode | null;
	/** Its declared name, when it has one — the hook for detecting recursion. */
	scoredName?: string;
}

/**
 * Describes one parse tree to the walker.
 *
 * Deliberately tiny. Everything the rules need is here and nothing else, so an
 * adapter is a short pure function per parser rather than an integration.
 */
export interface ComplexityAstAdapter<TNode> {
	/** Native type -> metric meaning. Return null for nodes that do not score. */
	kindOf(
		node: TNode,
		parent: TNode | null,
		context: ComplexityWalkContext<TNode>
	): ComplexityNodeKind | null;
	/** Every child node, in source order. */
	childrenOf(node: TNode): TNode[];
	/** 0-based inclusive line span. */
	lineRangeOf(node: TNode): { startLine: number; endLine: number };
	/** Declared name, when the node is a function. */
	nameOf?(node: TNode, parent: TNode | null): string | undefined;
	/**
	 * For a `boolean-sequence`, how many increments it is worth: the number of
	 * RUNS of like operators. `a && b && c` is one run; `a && b || c` is two.
	 * This is the rule that makes the score independent of how the expression is
	 * wrapped. Defaults to 1 when not supplied.
	 */
	booleanRunsOf?(node: TNode): number;
	/**
	 * Which child is the node's BODY, for kinds that raise nesting. Children that
	 * are not the body — a loop's init/test/update, an `if`'s condition — stay at
	 * the current depth.
	 *
	 * REQUIRED, deliberately. It was optional, and an adapter that omitted it (or
	 * returned null) got every child nested, which over-counts: a ternary in a
	 * loop header or an `if` condition was charged for depth it does not create.
	 * A required method makes the author decide rather than inherit a wrong
	 * default silently — and the contract freezes at 2.0.0, so "optional and
	 * quietly wrong" would have been permanent.
	 *
	 * Return null only when the node genuinely has no distinguished body; every
	 * child then nests, which is the honest reading for a node that is all body.
	 */
	bodyOf(node: TNode): TNode | TNode[] | null;
	/**
	 * Increments from a construct this node MERGES with — one that wraps it but
	 * has no node of its own in the tree.
	 *
	 * Exists because a node can be two things at once in trees with no dedicated
	 * `else`. ESTree represents `else while (x) {}` as a WhileStatement sitting in
	 * the `alternate` slot: it is a loop AND an else, and `kindOf` can only say
	 * one, so the adapter would have to drop an increment it knows is there.
	 *
	 * Each merged increment also RAISES NESTING for this node and its subtree,
	 * because the construct it stands for is a real enclosing scope. That is what
	 * keeps `else while (x) {}` and `else { while (x) {} }` scoring the same —
	 * adding braces must never change the number.
	 */
	mergedIncrementOf?(node: TNode, parent: TNode | null): number;
}

export interface AstComplexityRegion extends ProvidedComplexityRegion {
	name?: string;
	/**
	 * Per-increment breakdown, in source order — the same shape the built-in
	 * scanner produces, so the hover tooltip explains a parser-backed reading as
	 * fully as a built-in one.
	 */
	contributions: ComplexityContribution[];
}

/**
 * Increment kind for the breakdown, from the kind the adapter reported.
 *
 * `loop` stays `loop`: {@link ComplexityNodeKind} deliberately does not
 * distinguish `for` from `while` — one kind is all an adapter has to classify —
 * so naming it either would be a detail the walker does not actually have.
 * `function` becomes `nested-function`, which scores nothing and appears in the
 * list only to explain why the lines under it cost more.
 */
const CONTRIBUTION_KIND: Record<ComplexityNodeKind, ComplexityContributionKind> = {
	function: 'nested-function',
	if: 'if',
	'else-if': 'else if',
	else: 'else',
	ternary: 'ternary',
	switch: 'switch',
	loop: 'loop',
	catch: 'catch',
	'boolean-sequence': 'boolean-sequence',
	'labelled-jump': 'labelled-jump',
	recursion: 'recursion'
};

/**
 * Cognitive Complexity of every function in `root`.
 *
 * A function's score includes the constructs inside any function nested within
 * it, each at raised nesting — so an outer function is never cheaper than its
 * contents, which is what the metric intends.
 */
export function analyzeAstComplexity<TNode>(
	root: TNode,
	adapter: ComplexityAstAdapter<TNode>
): AstComplexityRegion[] {
	const regions: AstComplexityRegion[] = [];

	const scoreFunction = (
		fnNode: TNode,
		fnName: string | undefined
	): { total: number; contributions: ComplexityContribution[] } => {
		let total = 0;
		const contributions: ComplexityContribution[] = [];

		const record = (
			node: TNode,
			kind: ComplexityContributionKind,
			increment: number,
			nesting: number
		): void => {
			contributions.push({
				line: adapter.lineRangeOf(node).startLine,
				kind,
				increment,
				nesting,
				reason: `${getComplexityContributionLabel(kind)} (+${increment}, nesting ${nesting})`
			});
		};

		const visit = (
			node: TNode,
			rawNesting: number,
			parent: TNode | null,
			context: ComplexityWalkContext<TNode>
		): void => {
			const kind = adapter.kindOf(node, parent, context);
			const body = adapter.bodyOf(node);
			const bodySet = body === null ? null : new Set(Array.isArray(body) ? body : [body]);

			// A merged construct (an `else` with no node of its own) both scores and
			// opens a scope, so it shifts the depth this node is measured at.
			const merged = adapter.mergedIncrementOf?.(node, parent) ?? 0;
			total += merged;
			// Reported as the `else` it stands for, at the depth it was charged at.
			// It has no node of its own, so it borrows this node's start line —
			// which is where a reader sees it in the source anyway.
			if (merged > 0) record(node, 'else', merged, rawNesting);
			const nesting = rawNesting + merged;

			// The context is NOT re-bound on entering a nested function: recursion is
			// judged against the function being scored, so a callback that calls its
			// enclosing function is counted. That nested function gets its own pass,
			// where its own self-calls count instead.
			const descend = (child: TNode, raised: boolean) =>
				visit(child, raised ? nesting + 1 : nesting, node, context);

			switch (kind) {
				case 'if':
				case 'ternary':
				case 'switch':
				case 'loop':
				case 'catch':
					total += 1 + nesting;
					record(node, CONTRIBUTION_KIND[kind], 1 + nesting, nesting);
					for (const child of adapter.childrenOf(node)) {
						descend(child, bodySet === null || bodySet.has(child));
					}
					return;

				case 'else-if':
					// Flat +1: the reader has already paid for this chain. Its own body
					// still nests, and an `else if` sits at the SAME depth as its `if`.
					total += 1;
					record(node, 'else if', 1, nesting);
					for (const child of adapter.childrenOf(node)) {
						descend(child, bodySet !== null && bodySet.has(child));
					}
					return;

				case 'else':
					total += 1;
					record(node, 'else', 1, nesting);
					for (const child of adapter.childrenOf(node)) {
						descend(child, bodySet === null || bodySet.has(child));
					}
					return;

				case 'boolean-sequence': {
					const runs = Math.max(1, adapter.booleanRunsOf?.(node) ?? 1);
					total += runs;
					record(node, 'boolean-sequence', runs, nesting);
					for (const child of adapter.childrenOf(node)) descend(child, false);
					return;
				}

				case 'labelled-jump':
				case 'recursion':
					total += 1;
					record(node, CONTRIBUTION_KIND[kind], 1, nesting);
					for (const child of adapter.childrenOf(node)) descend(child, false);
					return;

				case 'function':
					// No increment; its contents cost more because they are nested.
					// Parameters are not the body and stay at the current depth, so a
					// default value containing a ternary is not charged for nesting it
					// does not create.
					record(node, 'nested-function', 0, nesting);
					for (const child of adapter.childrenOf(node)) {
						descend(child, bodySet === null || bodySet.has(child));
					}
					return;

				default:
					for (const child of adapter.childrenOf(node)) descend(child, false);
			}
		};

		const scoped: ComplexityWalkContext<TNode> = {
			scoredFunction: fnNode,
			scoredName: fnName
		};
		for (const child of adapter.childrenOf(fnNode)) visit(child, 0, fnNode, scoped);
		// A breakdown read beside the code has to run down the page.
		//
		// For an adapter that honours `childrenOf`'s "in source order" this is a
		// no-op — pre-order descent over source-ordered children already yields
		// source order. It is here for the ones that do not: `childrenOf` is a
		// consumer-supplied function, several parsers expose children in an order
		// that is convenient rather than positional, and the cost of being wrong is
		// a tooltip listing line 9 above line 1. Cheap insurance on an extension
		// point this library does not control.
		contributions.sort((a, b) => a.line - b.line);
		return { total, contributions };
	};

	const empty: ComplexityWalkContext<TNode> = { scoredFunction: null };

	const collect = (node: TNode, parent: TNode | null): void => {
		if (adapter.kindOf(node, parent, empty) === 'function') {
			const name = adapter.nameOf?.(node, parent);
			const { startLine, endLine } = adapter.lineRangeOf(node);
			const { total, contributions } = scoreFunction(node, name);
			regions.push({
				name,
				startLine,
				endLine,
				cognitiveComplexity: total,
				contributions
			});
		}
		for (const child of adapter.childrenOf(node)) collect(child, node);
	};

	collect(root, null);
	return regions;
}

/**
 * A provider backed by a parser.
 *
 * This is the shape the seam was built for. Unlike a model it is deterministic,
 * fast enough to run on every keystroke, and correct in exactly the languages
 * your parser supports — which is the gap the built-in token scanner cannot
 * close on its own.
 *
 * @example tree-sitter
 * ```ts
 * const provider = createAstComplexityProvider({
 *   parse: (code) => parser.parse(code).rootNode,
 *   adapter: treeSitterAdapter
 * });
 * ```
 *
 * @example acorn / any ESTree parser
 * ```ts
 * const provider = createAstComplexityProvider({
 *   parse: (code) => acorn.parse(code, { ecmaVersion: 'latest', locations: true }),
 *   adapter: createEstreeAdapter()
 * });
 * ```
 */
export function createAstComplexityProvider<TNode>(options: {
	parse: (code: string, language: string) => TNode | null;
	adapter: ComplexityAstAdapter<TNode>;
	/** Provenance shown beside the number. Defaults to `ast`. */
	source?: string;
}): ComplexityProvider {
	return async ({ code, language }) => {
		let root: TNode | null;
		try {
			root = options.parse(code, language);
		} catch {
			// A parse failure mid-edit is expected and constant. Decline quietly and
			// leave the token scanner's reading in place rather than blanking the UI.
			return null;
		}
		if (!root) return null;

		const regions = analyzeAstComplexity(root, options.adapter);
		if (regions.length === 0) return null;
		return { regions, source: options.source ?? 'ast' };
	};
}

/**
 * Build {@link ComplexityMetrics} directly from a tree, for callers using the
 * rules outside an editor — a CI check, a report, a pre-commit hook.
 *
 * The deprecated {@link ComplexityFactors} tallies other than `lineCount` are
 * zero here and honestly so: they are raw-text counts of source characters, and
 * this path never sees the source — only a tree. Everything that is part of the
 * metric (`cognitiveComplexity`, `contributions`, `level`, `suggestion`) is
 * fully populated.
 */
export function astComplexityMetrics<TNode>(
	root: TNode,
	adapter: ComplexityAstAdapter<TNode>
): ComplexityMetrics {
	const found = analyzeAstComplexity(root, adapter);
	const regions: ComplexityRegion[] = found.map((r) => {
		const lineCount = r.endLine - r.startLine + 1;
		return {
			startLine: r.startLine,
			endLine: r.endLine,
			name: r.name,
			type: 'function',
			cognitiveComplexity: r.cognitiveComplexity,
			level: getComplexityLevel(r.cognitiveComplexity),
			score: getLegacyComplexityScore(r.cognitiveComplexity),
			factors: {
				nestingDepth: 0,
				branchingFactor: 0,
				lineCount,
				identifierCount: 0,
				callCount: 0
			},
			suggestion: getComplexitySuggestion({
				cognitiveComplexity: r.cognitiveComplexity,
				contributions: r.contributions,
				lineCount
			}),
			contributions: r.contributions
		};
	});

	const max = regions.reduce((m, r) => Math.max(m, r.cognitiveComplexity), 0);

	// Deduplicated across overlapping regions — a nested function's lines belong to
	// its enclosing function too, and pushing each region's span separately counted
	// the shared lines once per region.
	const hotspots = new Set<number>();
	for (const region of regions) {
		if (region.cognitiveComplexity < COGNITIVE_COMPLEXITY_BANDS.high) continue;
		for (let line = region.startLine; line <= region.endLine; line++) hotspots.add(line);
	}

	return {
		overall: 0,
		level: getComplexityLevel(max),
		regions,
		hotspots: [...hotspots].sort((a, b) => a - b),
		totalCognitiveComplexity: regions.reduce((t, r) => t + r.cognitiveComplexity, 0),
		maxCognitiveComplexity: max,
		source: 'provider'
	};
}
