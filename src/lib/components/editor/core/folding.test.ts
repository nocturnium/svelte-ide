import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectFoldRegions, createFoldManager, FoldManager, type FoldRegion } from './folding';
import type { Line } from './state';

/**
 * Code Folding — Detection & Management Tests
 *
 * Covers: bracket folds, indentation folds, comment folds,
 * combined detection (detectFoldRegions), and FoldManager class.
 */

/** Helper: split a code string into Line[] (0-based numbering) */
function makeLines(code: string): Line[] {
	return code.split('\n').map((text, i) => ({ number: i, text }));
}

// ============================================================
// detectBracketFolds (via detectFoldRegions with brackets only)
// ============================================================

describe('detectBracketFolds', () => {
	/** Helper that isolates bracket detection by disabling other strategies */
	function detectBrackets(code: string, language = 'javascript'): FoldRegion[] {
		return detectFoldRegions(makeLines(code), language, {
			brackets: true,
			indentation: false,
			regions: false,
			comments: false
		});
	}

	it('should detect a single function brace fold', () => {
		const code = ['function greet() {', '  console.log("hi");', '  console.log("bye");', '}'].join(
			'\n'
		);

		const regions = detectBrackets(code);
		expect(regions.length).toBe(1);
		expect(regions[0].startLine).toBe(0);
		expect(regions[0].endLine).toBe(3);
		expect(regions[0].type).toBe('bracket');
		expect(regions[0].collapsed).toBe(false);
	});

	it('should detect nested brace folds', () => {
		const code = [
			'function outer() {', // 0
			'  if (true) {', // 1
			'    doStuff();', // 2
			'    doMore();', // 3
			'  }', // 4
			'}' // 5
		].join('\n');

		const regions = detectBrackets(code);
		// Outer: 0–5, Inner: 1–4
		expect(regions.length).toBe(2);

		const outer = regions.find((r) => r.startLine === 0);
		const inner = regions.find((r) => r.startLine === 1);

		expect(outer).toBeDefined();
		expect(outer!.endLine).toBe(5);

		expect(inner).toBeDefined();
		expect(inner!.endLine).toBe(4);
	});

	it('should skip braces inside double-quoted strings', () => {
		const code = ['const a = "{";', 'const b = "}";', '// no fold expected'].join('\n');

		const regions = detectBrackets(code);
		expect(regions.length).toBe(0);
	});

	it('should skip braces inside single-quoted strings', () => {
		const code = ["const a = '{';", "const b = '}';", '// no fold expected'].join('\n');

		const regions = detectBrackets(code);
		expect(regions.length).toBe(0);
	});

	it('should skip braces inside line comments (//) ', () => {
		const code = ['// function foo() {', '// }', 'const x = 1;'].join('\n');

		const regions = detectBrackets(code);
		expect(regions.length).toBe(0);
	});

	it('should not create a fold region for single-line braces', () => {
		const code = 'const obj = { a: 1 };';
		const regions = detectBrackets(code);
		expect(regions.length).toBe(0);
	});

	// --- Regression: block comments must not open phantom folds ---

	it('should skip a lone "{" inside a single-line block comment', () => {
		const code = ['/* an opening brace { lives here */', 'const x = 1;', 'const y = 2;'].join('\n');

		const regions = detectBrackets(code);
		expect(regions.length).toBe(0);
	});

	it('should carry block-comment state across lines (multi-line /* */)', () => {
		const code = [
			'/*', // 0
			'  function fake() {', // 1 — brace is INSIDE the comment
			'  still comment', // 2
			'*/', // 3
			'const x = 1;' // 4
		].join('\n');

		// No bracket fold: the "{" on line 1 is inside the block comment.
		const regions = detectBrackets(code);
		expect(regions.length).toBe(0);
	});

	it('should still detect real braces after a block comment closes', () => {
		const code = [
			'/* doc { */', // 0 — phantom brace, ignored
			'function real() {', // 1 — real brace
			'  doStuff();', // 2
			'  doMore();', // 3
			'}' // 4
		].join('\n');

		const regions = detectBrackets(code);
		expect(regions.length).toBe(1);
		expect(regions[0].startLine).toBe(1);
		expect(regions[0].endLine).toBe(4);
	});

	it('should not be confused by a closing brace inside a block comment', () => {
		const code = [
			'function f() {', // 0 — real open
			'  /* a stray } here */', // 1 — phantom close, must be ignored
			'  doStuff();', // 2
			'}' // 3 — real close
		].join('\n');

		const regions = detectBrackets(code);
		expect(regions.length).toBe(1);
		expect(regions[0].startLine).toBe(0);
		expect(regions[0].endLine).toBe(3);
	});

	it('should still treat braces inside strings containing /* as literal', () => {
		// "/*" inside a string must NOT start a block comment.
		const code = [
			'const s = "/* not a comment {";', // 0
			'const t = "another } string */";', // 1
			'const u = 3;' // 2
		].join('\n');

		const regions = detectBrackets(code);
		expect(regions.length).toBe(0);
	});

	it('should respect minLines config', () => {
		// 3 lines span (0,1,2) — default minLines=2 means endLine-startLine>=2
		const code = ['function f() {', '  return 1;', '}'].join('\n');

		const regions = detectFoldRegions(makeLines(code), 'javascript', {
			brackets: true,
			indentation: false,
			regions: false,
			comments: false,
			minLines: 2
		});
		expect(regions.length).toBe(1);

		// With minLines=3 the 3-line function should not be detected
		const noRegions = detectFoldRegions(makeLines(code), 'javascript', {
			brackets: true,
			indentation: false,
			regions: false,
			comments: false,
			minLines: 3
		});
		expect(noRegions.length).toBe(0);
	});
});

// ============================================================
// detectIndentationFolds (via detectFoldRegions for python)
// ============================================================

describe('detectIndentationFolds', () => {
	/** Helper that isolates indentation detection */
	function detectIndentation(code: string): FoldRegion[] {
		return detectFoldRegions(makeLines(code), 'python', {
			brackets: false,
			indentation: true,
			regions: false,
			comments: false
		});
	}

	it('should detect indentation-based folds (Python-style)', () => {
		const code = [
			'def greet():', // 0
			'    print("hello")', // 1
			'    print("world")', // 2
			'', // 3
			'x = 1' // 4
		].join('\n');

		const regions = detectIndentation(code);
		expect(regions.length).toBeGreaterThanOrEqual(1);

		const fnFold = regions.find((r) => r.startLine === 0);
		expect(fnFold).toBeDefined();
		expect(fnFold!.endLine).toBe(2);
		expect(fnFold!.type).toBe('indentation');
	});

	it('should detect nested indentation folds', () => {
		const code = [
			'class Foo:', // 0
			'    def bar(self):', // 1
			'        pass', // 2
			'        return True', // 3
			'    def baz(self):', // 4
			'        pass', // 5
			'        return False' // 6
		].join('\n');

		const regions = detectIndentation(code);
		// Class-level fold starting at 0 should exist
		const classFold = regions.find((r) => r.startLine === 0);
		expect(classFold).toBeDefined();
		expect(classFold!.endLine).toBe(6);
	});

	it('should not create fold for single indented line', () => {
		const code = ['if True:', '    pass', 'done'].join('\n');

		// Only 1 indented line after "if True:" — not enough for minLines=2
		const regions = detectIndentation(code);
		const ifFold = regions.find((r) => r.startLine === 0);
		// A fold from line 0 to line 1 is only 1 line difference, which is < minLines(2)
		if (ifFold) {
			// If it does detect, it should span at least 2 lines
			expect(ifFold.endLine - ifFold.startLine).toBeGreaterThanOrEqual(2);
		}
	});

	// --- Regression: single-pass detection must end folds at dedent ---

	it('should end an indentation fold at the dedent, not run to EOF', () => {
		const code = [
			'def a():', // 0
			'    x = 1', // 1
			'    y = 2', // 2
			'def b():', // 3 — dedent: closes the `a` block at line 2
			'    z = 3', // 4
			'    w = 4' // 5
		].join('\n');

		const regions = detectIndentation(code);

		const aFold = regions.find((r) => r.startLine === 0);
		expect(aFold).toBeDefined();
		// Must stop at line 2 (the last body line of `a`), NOT bleed into `b`.
		expect(aFold!.endLine).toBe(2);

		const bFold = regions.find((r) => r.startLine === 3);
		expect(bFold).toBeDefined();
		expect(bFold!.endLine).toBe(5);
	});

	it('should absorb trailing blank lines into a fold but not count them as body for minLines', () => {
		const code = [
			'def a():', // 0
			'    x = 1', // 1
			'    y = 2', // 2
			'', // 3 — blank, between blocks
			'b = 5' // 4 — dedent
		].join('\n');

		const regions = detectIndentation(code);
		const aFold = regions.find((r) => r.startLine === 0);
		expect(aFold).toBeDefined();
		// endLine is the last non-empty body line (2), blank line 3 is not included.
		expect(aFold!.endLine).toBe(2);
	});

	it('should produce O(n) number of regions for deeply nested input (sanity)', () => {
		// Build a staircase of increasing indentation; single-pass must handle it
		// without quadratic blowup and produce one fold per level that qualifies.
		const lines: string[] = [];
		for (let i = 0; i < 20; i++) {
			lines.push('  '.repeat(i) + `level${i}:`);
		}
		const code = lines.join('\n');

		const regions = detectIndentation(code);
		// Each header (except the last couple that lack >=minLines body) folds.
		expect(regions.length).toBeGreaterThan(0);
		// All regions are well-formed (start < end).
		for (const r of regions) {
			expect(r.endLine).toBeGreaterThan(r.startLine);
		}
	});
});

// ============================================================
// detectCommentFolds (via detectFoldRegions with comments only)
// ============================================================

describe('detectCommentFolds', () => {
	/** Helper that isolates comment detection */
	function detectComments(code: string): FoldRegion[] {
		return detectFoldRegions(makeLines(code), 'javascript', {
			brackets: false,
			indentation: false,
			regions: false,
			comments: true
		});
	}

	it('should detect block comments (/* ... */)', () => {
		const code = [
			'/*', // 0
			' * This is a big', // 1
			' * block comment', // 2
			' */', // 3
			'const x = 1;' // 4
		].join('\n');

		const regions = detectComments(code);
		expect(regions.length).toBe(1);
		expect(regions[0].startLine).toBe(0);
		expect(regions[0].endLine).toBe(3);
		expect(regions[0].type).toBe('comment');
	});

	it('should not fold single-line block comments', () => {
		const code = '/* short */';
		const regions = detectComments(code);
		expect(regions.length).toBe(0);
	});

	it('should detect multiple block comments', () => {
		const code = [
			'/*', // 0
			' * first', // 1
			' */', // 2
			'code();', // 3
			'/*', // 4
			' * second', // 5
			' */' // 6
		].join('\n');

		const regions = detectComments(code);
		expect(regions.length).toBe(2);
		expect(regions[0].startLine).toBe(0);
		expect(regions[0].endLine).toBe(2);
		expect(regions[1].startLine).toBe(4);
		expect(regions[1].endLine).toBe(6);
	});

	it('should detect HTML block comments', () => {
		const code = [
			'<!--', // 0
			'  This is a long comment', // 1
			'  spanning lines', // 2
			'-->' // 3
		].join('\n');

		const regions = detectComments(code);
		expect(regions.length).toBe(1);
		expect(regions[0].startLine).toBe(0);
		expect(regions[0].endLine).toBe(3);
		expect(regions[0].type).toBe('comment');
	});
});

// ============================================================
// detectFoldRegions — combined strategies
// ============================================================

describe('detectFoldRegions (combined)', () => {
	it('should combine bracket and comment folds for JavaScript', () => {
		const code = [
			'/*', // 0
			' * Module doc', // 1
			' */', // 2
			'function main() {', // 3
			'  doStuff();', // 4
			'  doMore();', // 5
			'}' // 6
		].join('\n');

		const regions = detectFoldRegions(makeLines(code), 'javascript');

		const commentFold = regions.find((r) => r.type === 'comment');
		expect(commentFold).toBeDefined();
		expect(commentFold!.startLine).toBe(0);
		expect(commentFold!.endLine).toBe(2);

		const bracketFold = regions.find((r) => r.type === 'bracket');
		expect(bracketFold).toBeDefined();
		expect(bracketFold!.startLine).toBe(3);
		expect(bracketFold!.endLine).toBe(6);
	});

	it('should use indentation folds for Python', () => {
		const code = [
			'def hello():', // 0
			'    print("hi")', // 1
			'    print("bye")', // 2
			'', // 3
			'x = 1' // 4
		].join('\n');

		const regions = detectFoldRegions(makeLines(code), 'python');

		const indentFold = regions.find((r) => r.type === 'indentation');
		expect(indentFold).toBeDefined();
		expect(indentFold!.startLine).toBe(0);
	});

	it('should not produce indentation folds for JavaScript', () => {
		const code = ['function f() {', '  return 1;', '  return 2;', '}'].join('\n');

		const regions = detectFoldRegions(makeLines(code), 'javascript');
		const indentFolds = regions.filter((r) => r.type === 'indentation');
		expect(indentFolds.length).toBe(0);
	});

	it('should return regions sorted by start line', () => {
		const code = [
			'function a() {', // 0
			'  x();', // 1
			'  y();', // 2
			'}', // 3
			'function b() {', // 4
			'  z();', // 5
			'  w();', // 6
			'}' // 7
		].join('\n');

		const regions = detectFoldRegions(makeLines(code), 'javascript');
		for (let i = 1; i < regions.length; i++) {
			expect(regions[i].startLine).toBeGreaterThanOrEqual(regions[i - 1].startLine);
		}
	});

	it('should handle empty input', () => {
		const regions = detectFoldRegions([], 'javascript');
		expect(regions.length).toBe(0);
	});
});

// ============================================================
// FoldManager
// ============================================================

describe('FoldManager', () => {
	let manager: FoldManager;

	const sampleCode = [
		'function outer() {', // 0
		'  if (true) {', // 1
		'    doA();', // 2
		'    doB();', // 3
		'  }', // 4
		'  doC();', // 5
		'  doD();', // 6
		'}' // 7
	].join('\n');

	const sampleLines = makeLines(sampleCode);

	beforeEach(() => {
		manager = createFoldManager();
		manager.updateRegions(sampleLines, 'javascript');
	});

	// ----- updateRegions -----

	it('should detect regions from lines via updateRegions', () => {
		const regions = manager.getRegions();
		expect(regions.length).toBeGreaterThanOrEqual(1);

		// Should have the outer function fold
		const outer = regions.find((r) => r.startLine === 0);
		expect(outer).toBeDefined();
		expect(outer!.endLine).toBe(7);
	});

	it('should preserve collapsed state across updateRegions calls', () => {
		manager.collapse(0);
		expect(manager.isFoldCollapsed(0)).toBe(true);

		// Re-update with same content
		manager.updateRegions(sampleLines, 'javascript');

		// Collapsed state should be preserved
		expect(manager.isFoldCollapsed(0)).toBe(true);
	});

	// ----- collapse / expand -----

	it('should collapse a region', () => {
		const result = manager.collapse(0);
		expect(result).toBe(true);
		expect(manager.isFoldCollapsed(0)).toBe(true);
	});

	it('should return false when collapsing an already collapsed region', () => {
		manager.collapse(0);
		const result = manager.collapse(0);
		expect(result).toBe(false);
	});

	it('should return false when collapsing a non-existent region', () => {
		const result = manager.collapse(999);
		expect(result).toBe(false);
	});

	it('should expand a region', () => {
		manager.collapse(0);
		const result = manager.expand(0);
		expect(result).toBe(true);
		expect(manager.isFoldCollapsed(0)).toBe(false);
	});

	it('should return false when expanding an already expanded region', () => {
		const result = manager.expand(0);
		expect(result).toBe(false);
	});

	// ----- toggleFold -----

	it('should toggle a fold from expanded to collapsed', () => {
		expect(manager.isFoldCollapsed(0)).toBe(false);
		manager.toggleFold(0);
		expect(manager.isFoldCollapsed(0)).toBe(true);
	});

	it('should toggle a fold from collapsed to expanded', () => {
		manager.collapse(0);
		manager.toggleFold(0);
		expect(manager.isFoldCollapsed(0)).toBe(false);
	});

	it('should return false when toggling a non-fold line', () => {
		const result = manager.toggleFold(999);
		expect(result).toBe(false);
	});

	// ----- getVisibleLines -----

	it('should return all lines when nothing is collapsed', () => {
		const visible = manager.getVisibleLines(8);
		expect(visible).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	it('should exclude collapsed region lines (except start line)', () => {
		manager.collapse(0);
		const visible = manager.getVisibleLines(8);

		// Line 0 (start) is visible; lines 1–7 are hidden
		expect(visible).toContain(0);
		expect(visible).not.toContain(1);
		expect(visible).not.toContain(7);
	});

	it('should handle nested collapsed folds correctly', () => {
		// Collapse inner fold only
		const innerRegion = manager.getRegions().find((r) => r.startLine === 1);
		if (innerRegion) {
			manager.collapse(1);
			const visible = manager.getVisibleLines(8);

			// Line 1 (start of inner) should be visible
			expect(visible).toContain(1);
			// Lines 2–4 should be hidden
			expect(visible).not.toContain(2);
			expect(visible).not.toContain(3);
			// But line 0, 5, 6, 7 should still be visible
			expect(visible).toContain(0);
			expect(visible).toContain(5);
			expect(visible).toContain(6);
			expect(visible).toContain(7);
		}
	});

	// ----- collapseAll / expandAll -----

	it('should collapse all regions with collapseAll', () => {
		manager.collapseAll();

		for (const region of manager.getRegions()) {
			expect(region.collapsed).toBe(true);
		}
	});

	it('should expand all regions with expandAll', () => {
		manager.collapseAll();
		manager.expandAll();

		for (const region of manager.getRegions()) {
			expect(region.collapsed).toBe(false);
		}

		// All lines should be visible after expandAll
		const visible = manager.getVisibleLines(8);
		expect(visible).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	// ----- collapseLevel -----

	it('should collapse folds at a specific nesting level', () => {
		// The outer fold is at level 0, inner at level 1
		manager.collapseLevel(0);

		const outer = manager.getRegions().find((r) => r.startLine === 0);
		expect(outer?.collapsed).toBe(true);

		// Inner fold may or may not be level 0; check if any level-1 folds are uncollapsed
		const innerRegions = manager.getRegions().filter((r) => r.level !== 0);
		for (const r of innerRegions) {
			expect(r.collapsed).toBe(false);
		}
	});

	// ----- onChange -----

	it('should fire callback on fold state changes', () => {
		const cb = vi.fn();
		manager.onChange(cb);

		manager.collapse(0);
		expect(cb).toHaveBeenCalledTimes(1);

		manager.expand(0);
		expect(cb).toHaveBeenCalledTimes(2);
	});

	it('should return an unsubscribe function from onChange', () => {
		const cb = vi.fn();
		const unsub = manager.onChange(cb);

		manager.collapse(0);
		expect(cb).toHaveBeenCalledTimes(1);

		unsub();

		manager.expand(0);
		// Should not fire again
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('should fire callback on toggleFold', () => {
		const cb = vi.fn();
		manager.onChange(cb);

		manager.toggleFold(0);
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('should fire callback on collapseAll and expandAll', () => {
		const cb = vi.fn();
		manager.onChange(cb);

		manager.collapseAll();
		expect(cb).toHaveBeenCalledTimes(1);

		manager.expandAll();
		expect(cb).toHaveBeenCalledTimes(2);
	});

	// ----- hasFoldIndicator -----

	it('should return true for start lines of fold regions', () => {
		expect(manager.hasFoldIndicator(0)).toBe(true);
	});

	it('should return false for non-start lines', () => {
		// Lines in the middle or end of a fold are not indicators
		expect(manager.hasFoldIndicator(2)).toBe(false);
		expect(manager.hasFoldIndicator(7)).toBe(false);
	});

	it('should return false for lines outside any region', () => {
		expect(manager.hasFoldIndicator(999)).toBe(false);
	});

	// ----- isFoldCollapsed -----

	it('should report collapsed state correctly', () => {
		expect(manager.isFoldCollapsed(0)).toBe(false);

		manager.collapse(0);
		expect(manager.isFoldCollapsed(0)).toBe(true);

		manager.expand(0);
		expect(manager.isFoldCollapsed(0)).toBe(false);
	});

	it('should return false for non-fold lines', () => {
		expect(manager.isFoldCollapsed(999)).toBe(false);
	});

	// ----- isLineHidden -----

	it('should report hidden lines inside collapsed folds', () => {
		manager.collapse(0);

		expect(manager.isLineHidden(0)).toBe(false); // start line is visible
		expect(manager.isLineHidden(1)).toBe(true);
		expect(manager.isLineHidden(7)).toBe(true);
	});

	it('should not report lines as hidden when no folds are collapsed', () => {
		for (let i = 0; i < 8; i++) {
			expect(manager.isLineHidden(i)).toBe(false);
		}
	});

	// ----- getHiddenLineCount -----

	it('should return hidden line count for a collapsed fold', () => {
		manager.collapse(0);
		expect(manager.getHiddenLineCount(0)).toBe(7); // endLine(7) - startLine(0)
	});

	it('should return 0 for an expanded fold', () => {
		expect(manager.getHiddenLineCount(0)).toBe(0);
	});

	it('should return 0 for a non-fold line', () => {
		expect(manager.getHiddenLineCount(999)).toBe(0);
	});
});
