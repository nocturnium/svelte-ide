import { describe, it, expect } from 'vitest';
import {
	analyzeAstComplexity,
	createAstComplexityProvider,
	ComplexityAdapterError,
	type ComplexityAstAdapter
} from './complexity-ast';

/**
 * `bodyOf` matching, for adapters whose nodes are not reference-stable.
 *
 * The walker learns which child raises nesting by matching `bodyOf`'s return
 * against the entries of `childrenOf`. It matched by reference, which is correct
 * for ESTree — acorn hands back the same object every time — and wrong for
 * tree-sitter, whose bindings allocate a fresh JavaScript wrapper on every
 * accessor call. `childForFieldName('body')` and the matching entry of
 * `namedChildren` are then two different objects wrapping the same node, the
 * match never succeeds, nothing nests, and the nesting penalty disappears.
 *
 * That is the entire difference between Cognitive Complexity and a cyclomatic
 * count, and it failed silently into a believable number. `identityOf` is the
 * opt-in that fixes it; these tests pin all three states.
 */

type Raw = {
	kind: 'function' | 'if' | null;
	line: number;
	children: Raw[];
	/** Index into `children` that is the body. */
	bodyIndex?: number;
};

/** `function f { if(a){ if(b){ if(c){ if(d){} } } } }` — correct score 1+2+3+4. */
function nestedTree(): Raw {
	const leaf = (line: number): Raw => ({ kind: null, line, children: [] });
	const mkIf = (line: number, body: Raw): Raw => ({
		kind: 'if',
		line,
		children: [leaf(line), body], // [test, body]
		bodyIndex: 1
	});
	return {
		kind: 'function',
		line: 0,
		children: [mkIf(1, mkIf(2, mkIf(3, mkIf(4, leaf(5)))))],
		bodyIndex: 0
	};
}

type Wrapped = { raw: Raw };

/** Fresh wrapper on every access — models tree-sitter's bindings exactly. */
function freshWrapperAdapter(withIdentity: boolean): ComplexityAstAdapter<Wrapped> {
	const wrap = (raw: Raw): Wrapped => ({ raw });
	const adapter: ComplexityAstAdapter<Wrapped> = {
		kindOf: (n) => n.raw.kind,
		childrenOf: (n) => n.raw.children.map(wrap),
		lineRangeOf: (n) => ({ startLine: n.raw.line, endLine: n.raw.line }),
		bodyOf: (n) => (n.raw.bodyIndex === undefined ? null : wrap(n.raw.children[n.raw.bodyIndex]))
	};
	// The raw node is stable even though its wrapper is not, which is precisely
	// the situation `node.id` covers for tree-sitter.
	if (withIdentity) adapter.identityOf = (n) => n.raw;
	return adapter;
}

/** Stable identity, the ESTree case: one wrapper per raw node, reused. */
function stableAdapter(): ComplexityAstAdapter<Wrapped> {
	const cache = new Map<Raw, Wrapped>();
	const wrap = (raw: Raw): Wrapped => {
		let w = cache.get(raw);
		if (!w) {
			w = { raw };
			cache.set(raw, w);
		}
		return w;
	};
	return {
		kindOf: (n) => n.raw.kind,
		childrenOf: (n) => n.raw.children.map(wrap),
		lineRangeOf: (n) => ({ startLine: n.raw.line, endLine: n.raw.line }),
		bodyOf: (n) => (n.raw.bodyIndex === undefined ? null : wrap(n.raw.children[n.raw.bodyIndex]))
	};
}

const outermost = (regions: Array<{ startLine: number; cognitiveComplexity: number }>) =>
	regions.length === 0
		? 0
		: regions.reduce((best, r) => (r.startLine < best.startLine ? r : best)).cognitiveComplexity;

describe('bodyOf matching across node-identity models', () => {
	const tree = nestedTree();

	it('scores four nested ifs as 1+2+3+4 when nodes are reference-stable', () => {
		expect(outermost(analyzeAstComplexity({ raw: tree }, stableAdapter()))).toBe(10);
	});

	it('scores the same with fresh wrappers once identityOf is supplied', () => {
		expect(outermost(analyzeAstComplexity({ raw: tree }, freshWrapperAdapter(true)))).toBe(10);
	});

	it('refuses to score at all when identityOf is missing and needed', () => {
		// This used to return 4 — the flat count, every nesting penalty gone, and
		// entirely believable. A wrong number nobody can detect is the worst outcome
		// this library can produce, so the walker now raises instead.
		expect(() => analyzeAstComplexity({ raw: tree }, freshWrapperAdapter(false))).toThrow(
			ComplexityAdapterError
		);
	});

	it('names identityOf in the error, since that is the fix', () => {
		// The message is the entire remediation path for someone whose tree-sitter
		// adapter looks correct and scores low.
		let caught: unknown;
		try {
			analyzeAstComplexity({ raw: tree }, freshWrapperAdapter(false));
		} catch (error) {
			caught = error;
		}
		expect((caught as Error).message).toMatch(/identityOf/);
		expect((caught as Error).message).toMatch(/childrenOf/);
	});

	it('surfaces through a provider as a rejection, which the editor treats as declining', async () => {
		// Precisely: the provider REJECTS — it does not return null. What makes that
		// safe is the call site. `CustomEditor` wraps the whole provider call in
		// try/catch and keeps its built-in reading, so a broken adapter costs a
		// refinement rather than crashing an editor or rendering a wrong number.
		// Called directly instead, this is a loud failure a CI check will see.
		const provider = createAstComplexityProvider({
			parse: () => ({ raw: tree }),
			adapter: freshWrapperAdapter(false)
		});
		await expect(
			provider({
				code: 'irrelevant',
				language: 'typescript',
				baseline: {
					level: 'low',
					regions: [],
					hotspots: [],
					totalCognitiveComplexity: 0,
					maxCognitiveComplexity: 0
				},
				signal: new AbortController().signal
			})
		).rejects.toThrow(ComplexityAdapterError);
	});

	it('leaves adapters that never set identityOf working exactly as before', () => {
		// The ESTree adapter does not set it, so the default path must stay correct.
		const withIdentity = analyzeAstComplexity(
			{ raw: tree },
			{
				...stableAdapter(),
				identityOf: (n: Wrapped) => n.raw
			}
		);
		expect(outermost(withIdentity)).toBe(
			outermost(analyzeAstComplexity({ raw: tree }, stableAdapter()))
		);
	});
});
