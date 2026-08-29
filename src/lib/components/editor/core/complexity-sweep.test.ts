import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as acorn from 'acorn';
import ts from 'typescript';
import { ComplexityAnalyzer } from './complexity-analyzer';
import { analyzeAstComplexity } from './complexity-ast';
import { createEstreeAdapter, type EstreeNode } from './complexity-estree';
import { referenceRegions } from '../../../../../tests/helpers/cognitive-complexity-oracle';
import type { Line } from './state';

/**
 * Repo-wide differential sweep.
 *
 * The curated corpus in complexity-differential.test.ts passed 30/30 while a
 * sweep over this same build found 58 truncated regions and 4 phantoms. A corpus
 * chosen by the author encodes the author's blind spots; this points the same
 * oracle at code nobody selected, which is the only way it can surprise us.
 *
 * Two properties are asserted, and they are the ones that are unambiguous:
 *
 *   TRUNCATED — the analyzer's region ends far short of the reference's. This is
 *               the dangerous direction: it silently UNDER-reports, telling you
 *               the hottest function in a file is fine. One real case reported
 *               cognitive complexity 2 for a function whose true value is 39.
 *   PHANTOM   — the reference finds no branches at all in a function the analyzer
 *               scores 5+. A region that swallowed its enclosing function.
 *
 * Note on why PHANTOM is measured by SCORE and not by span. Feeding acorn
 * requires stripping types first, which collapses multi-line signatures and
 * removes interface members, so reference spans are shorter than the original
 * source by construction. That makes "analyzer span > reference span" a property
 * of the harness, not of the analyzer — gating on it would fail on noise, and a
 * suite that cries wolf gets muted, which is worse than not having one. The
 * truncation direction does not have this problem: the analyzer being shorter
 * than an already-shortened reference is real every time.
 *
 * Exact score agreement is NOT asserted repo-wide for the same reason; it is
 * asserted on the curated corpus instead, where both sides are hand-verified.
 *
 * Regions are matched BY NAME, never by index. The phantom defects this exists
 * to catch specifically occupy `regions[0]`, so asserting on that slot would be
 * blind exactly where the bugs live.
 */

const SRC = join(process.cwd(), 'src');

function listSourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
		else if (/\.ts$/.test(entry) && !/\.(test|spec|d)\.ts$/.test(entry)) out.push(full);
	}
	return out;
}

function makeLines(code: string): Line[] {
	return code.split('\n').map((text, number) => ({ number, text }));
}

interface Finding {
	file: string;
	name: string;
	refSpan: number;
	gotSpan: number;
	refCc: number;
	gotCc: number;
}

describe('cognitive complexity: repo-wide differential sweep', () => {
	const analyzer = new ComplexityAnalyzer();
	const files = listSourceFiles(SRC);

	const truncated: Finding[] = [];
	const phantom: Finding[] = [];
	let compared = 0;
	let filesSwept = 0;

	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		const reference = referenceRegions(source);
		if (!reference) continue;
		filesSwept++;

		const metrics = analyzer.analyze(makeLines(source), 'typescript');
		const short = file.slice(SRC.length + 1);

		for (const ref of reference) {
			const candidates = metrics.regions.filter((r) => r.name === ref.name);
			if (candidates.length === 0) continue;
			// Nearest by start line: transpilation shifts positions, so the closest
			// same-named region is the intended counterpart.
			const got = candidates.reduce((a, b) =>
				Math.abs(b.startLine - ref.startLine) < Math.abs(a.startLine - ref.startLine) ? b : a
			);
			compared++;

			const refSpan = ref.endLine - ref.startLine;
			const gotSpan = got.endLine - got.startLine;
			const finding: Finding = {
				file: short,
				name: ref.name,
				refSpan,
				gotSpan,
				refCc: ref.cc,
				gotCc: got.cognitiveComplexity
			};

			// Deliberately generous: only gross structural disagreement, never
			// off-by-a-few from transpilation moving lines around.
			if (refSpan >= 10 && gotSpan < refSpan * 0.4) truncated.push(finding);
			// A function the reference finds branchless cannot legitimately score 5+.
			else if (ref.cc === 0 && got.cognitiveComplexity >= 5) phantom.push(finding);
		}
	}

	const fmt = (list: Finding[]) =>
		list
			.slice(0, 12)
			.map(
				(f) =>
					`  ${f.file} :: ${f.name} — reference span ${f.refSpan}/cc ${f.refCc}, analyzer span ${f.gotSpan}/cc ${f.gotCc}`
			)
			.join('\n');

	it('sweeps a meaningful amount of real source', () => {
		// Guards the guard: if the walker or the transpile step silently breaks,
		// the assertions below would pass vacuously.
		expect(filesSwept).toBeGreaterThan(50);
		expect(compared).toBeGreaterThan(300);
	});

	it('truncates no region (silent under-reporting)', () => {
		expect(truncated, `${truncated.length} truncated:\n${fmt(truncated)}`).toEqual([]);
	});

	it('reports no phantom region (one that swallowed its enclosing function)', () => {
		expect(phantom, `${phantom.length} phantom:\n${fmt(phantom)}`).toEqual([]);
	});
});

/**
 * Repo-wide sweep for the AST WALKER — the rules consumers plug a parser into.
 *
 * This one asserts EXACT score agreement on every function in the repository,
 * which the token-scanner sweep above deliberately does not. It can, because
 * both sides here consume the same transpiled JavaScript through the same
 * parser: there is no tokenizer approximation and no span drift to forgive, so
 * any disagreement is a real disagreement about the rules.
 *
 * That makes this the strongest falsifier in the repo. If the walker and the
 * independent reference both claim to implement Campbell's rules and they differ
 * on any one of ~1700 real functions, one of them is wrong.
 */
describe('cognitive complexity: repo-wide sweep of the AST walker', () => {
	const adapter = createEstreeAdapter();
	const files = listSourceFiles(SRC);

	interface Divergence {
		file: string;
		name: string;
		reference: number;
		walker: number;
	}

	const divergences: Divergence[] = [];
	let compared = 0;

	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		const reference = referenceRegions(source);
		if (!reference) continue;

		const js = ts.transpileModule(source, {
			compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
		}).outputText;

		let root: EstreeNode;
		try {
			root = acorn.parse(js, {
				ecmaVersion: 'latest',
				sourceType: 'module',
				locations: true
			}) as unknown as EstreeNode;
		} catch {
			continue;
		}

		const walked = analyzeAstComplexity(root, adapter);
		const short = file.slice(SRC.length + 1);

		for (const ref of reference) {
			// Match by name AND start line: both sides read the same transpiled text,
			// so counterparts line up exactly and a near-miss would be a real defect
			// rather than harness noise.
			const got = walked.find((r) => r.name === ref.name && r.startLine === ref.startLine);
			if (!got) continue;
			compared++;

			if (got.cognitiveComplexity !== ref.cc) {
				divergences.push({
					file: short,
					name: ref.name,
					reference: ref.cc,
					walker: got.cognitiveComplexity
				});
			}
		}
	}

	it('compares a meaningful number of real functions', () => {
		// Guards the guard: a broken walk would otherwise pass vacuously.
		expect(compared).toBeGreaterThan(300);
	});

	it('scores every function in the repository exactly as the reference does', () => {
		const detail = divergences
			.slice(0, 20)
			.map((d) => `  ${d.file} :: ${d.name} — reference ${d.reference}, walker ${d.walker}`)
			.join('\n');
		expect(divergences, `${divergences.length} divergences:\n${detail}`).toEqual([]);
	});
});
