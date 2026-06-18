import { describe, it, expect, vi } from 'vitest';
import { createEditorFind, type EditorFindDeps, type MatchRect } from './editor-find';
import type { SearchMatch } from './core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lines(...texts: string[]): readonly { text: string }[] {
	return texts.map((t) => ({ text: t }));
}

function makeDeps(overrides: Partial<EditorFindDeps> = {}): EditorFindDeps {
	const defaultLines = lines('hello world', 'foo bar baz', 'hello again');
	return {
		getLines: () => defaultLines,
		getLineCount: () => defaultLines.length,
		getSelection: () => ({
			anchor: { line: 0, column: 0 },
			head: { line: 0, column: 0 }
		}),
		setSelection: vi.fn(),
		setCursor: vi.fn(),
		setContent: vi.fn(),
		scrollCursorIntoView: vi.fn(),
		focusEditor: vi.fn(),
		isReadonly: () => false,
		...overrides
	};
}

// ============================================================
// createEditorFind – initial state
// ============================================================

describe('createEditorFind', () => {
	it('should return an object with the expected API shape', () => {
		const finder = createEditorFind(makeDeps());

		expect(finder).toHaveProperty('query');
		expect(finder).toHaveProperty('replaceText');
		expect(finder).toHaveProperty('caseSensitive');
		expect(finder).toHaveProperty('useRegex');
		expect(finder).toHaveProperty('matches');
		expect(finder).toHaveProperty('currentIndex');

		expect(typeof finder.setQuery).toBe('function');
		expect(typeof finder.setReplaceText).toBe('function');
		expect(typeof finder.setCaseSensitive).toBe('function');
		expect(typeof finder.setUseRegex).toBe('function');
		expect(typeof finder.updateMatches).toBe('function');
		expect(typeof finder.findNext).toBe('function');
		expect(typeof finder.findPrev).toBe('function');
		expect(typeof finder.replace).toBe('function');
		expect(typeof finder.replaceAll).toBe('function');
		expect(typeof finder.computeMatchRects).toBe('function');
	});

	it('should start with empty query and no matches', () => {
		const finder = createEditorFind(makeDeps());

		expect(finder.query).toBe('');
		expect(finder.replaceText).toBe('');
		expect(finder.caseSensitive).toBe(false);
		expect(finder.useRegex).toBe(false);
		expect(finder.matches).toEqual([]);
		expect(finder.currentIndex).toBe(-1);
	});
});

// ============================================================
// setQuery / updateMatches
// ============================================================

describe('setQuery', () => {
	it('should find matches when query is set', () => {
		const finder = createEditorFind(makeDeps());
		finder.setQuery('hello');

		expect(finder.query).toBe('hello');
		expect(finder.matches.length).toBe(2);
		expect(finder.currentIndex).toBe(0);
	});

	it('should clear matches when query is empty', () => {
		const finder = createEditorFind(makeDeps());
		finder.setQuery('hello');
		expect(finder.matches.length).toBe(2);

		finder.setQuery('');
		expect(finder.matches).toEqual([]);
		expect(finder.currentIndex).toBe(-1);
	});

	it('should find no matches for non-existent text', () => {
		const finder = createEditorFind(makeDeps());
		finder.setQuery('zzzzz');

		expect(finder.matches.length).toBe(0);
		expect(finder.currentIndex).toBe(-1);
	});

	it('should be case-insensitive by default', () => {
		const deps = makeDeps({
			getLines: () => lines('Hello World', 'HELLO again', 'hello third')
		});
		const finder = createEditorFind(deps);
		finder.setQuery('hello');

		expect(finder.matches.length).toBe(3);
	});
});

// ============================================================
// setReplaceText
// ============================================================

describe('setReplaceText', () => {
	it('should store replace text', () => {
		const finder = createEditorFind(makeDeps());
		finder.setReplaceText('REPLACED');

		expect(finder.replaceText).toBe('REPLACED');
	});
});

// ============================================================
// setCaseSensitive
// ============================================================

describe('setCaseSensitive', () => {
	it('should update case sensitivity and refresh matches', () => {
		const deps = makeDeps({
			getLines: () => lines('Hello World', 'hello again')
		});
		const finder = createEditorFind(deps);

		finder.setQuery('Hello');
		expect(finder.matches.length).toBe(2); // case insensitive

		finder.setCaseSensitive(true);
		expect(finder.caseSensitive).toBe(true);
		expect(finder.matches.length).toBe(1); // only exact case match
	});
});

// ============================================================
// setUseRegex
// ============================================================

describe('setUseRegex', () => {
	it('should enable regex search and refresh matches', () => {
		const deps = makeDeps({
			getLines: () => lines('foo123', 'bar456', 'baz')
		});
		const finder = createEditorFind(deps);

		finder.setUseRegex(true);
		finder.setQuery('\\d+');
		expect(finder.useRegex).toBe(true);
		expect(finder.matches.length).toBe(2);
	});

	it('should handle invalid regex gracefully', () => {
		const finder = createEditorFind(makeDeps());
		finder.setUseRegex(true);
		finder.setQuery('[invalid');

		expect(finder.matches.length).toBe(0);
		expect(finder.currentIndex).toBe(-1);
	});
});

// ============================================================
// findNext / findPrev
// ============================================================

describe('findNext', () => {
	it('should advance to next match', () => {
		const deps = makeDeps();
		const finder = createEditorFind(deps);
		finder.setQuery('hello');
		expect(finder.currentIndex).toBe(0);

		finder.findNext();
		expect(finder.currentIndex).toBe(1);
		expect(deps.setSelection).toHaveBeenCalled();
		expect(deps.scrollCursorIntoView).toHaveBeenCalled();
	});

	it('should wrap around from last to first match', () => {
		const finder = createEditorFind(makeDeps());
		finder.setQuery('hello');
		finder.findNext(); // index 1
		finder.findNext(); // wraps to 0
		expect(finder.currentIndex).toBe(0);
	});

	it('should do nothing when there are no matches', () => {
		const deps = makeDeps();
		const finder = createEditorFind(deps);
		finder.setQuery('zzzzz');
		finder.findNext();
		expect(deps.setSelection).not.toHaveBeenCalled();
	});
});

describe('findPrev', () => {
	it('should go to previous match', () => {
		const finder = createEditorFind(makeDeps());
		finder.setQuery('hello');
		finder.findNext(); // go to index 1
		finder.findPrev(); // back to index 0
		expect(finder.currentIndex).toBe(0);
	});

	it('should wrap around from first to last match', () => {
		const finder = createEditorFind(makeDeps());
		finder.setQuery('hello');
		expect(finder.currentIndex).toBe(0);

		finder.findPrev(); // wraps to last (index 1)
		expect(finder.currentIndex).toBe(1);
	});
});

// ============================================================
// replace
// ============================================================

describe('replace', () => {
	it('should replace current match and update content', () => {
		const deps = makeDeps();
		const finder = createEditorFind(deps);
		finder.setQuery('hello');
		finder.setReplaceText('HI');

		finder.replace();

		expect(deps.setContent).toHaveBeenCalled();
		expect(deps.setCursor).toHaveBeenCalled();
	});

	it('should not replace when readonly', () => {
		const deps = makeDeps({ isReadonly: () => true });
		const finder = createEditorFind(deps);
		finder.setQuery('hello');
		finder.setReplaceText('HI');

		finder.replace();

		expect(deps.setContent).not.toHaveBeenCalled();
	});

	it('should not replace when no matches', () => {
		const deps = makeDeps();
		const finder = createEditorFind(deps);
		finder.setQuery('zzzzz');
		finder.setReplaceText('HI');

		finder.replace();

		expect(deps.setContent).not.toHaveBeenCalled();
	});
});

// ============================================================
// replaceAll
// ============================================================

describe('replaceAll', () => {
	it('should replace all matches', () => {
		const deps = makeDeps();
		const finder = createEditorFind(deps);
		finder.setQuery('hello');
		finder.setReplaceText('HI');

		finder.replaceAll();

		expect(deps.setContent).toHaveBeenCalledTimes(1);
	});

	it('should not replace all when readonly', () => {
		const deps = makeDeps({ isReadonly: () => true });
		const finder = createEditorFind(deps);
		finder.setQuery('hello');
		finder.setReplaceText('HI');

		finder.replaceAll();

		expect(deps.setContent).not.toHaveBeenCalled();
	});

	it('should not replace all when no matches', () => {
		const deps = makeDeps();
		const finder = createEditorFind(deps);
		finder.setQuery('zzzzz');
		finder.setReplaceText('HI');

		finder.replaceAll();

		expect(deps.setContent).not.toHaveBeenCalled();
	});
});

// ============================================================
// computeMatchRects
// ============================================================

describe('computeMatchRects', () => {
	const viewport = { scrollTop: 0, viewportHeight: 500 };
	const measurements = {
		lineHeight: 20,
		charWidth: 8,
		gutterWidth: 50,
		contentPadding: 8
	};

	function legacyComputeMatchRects(
		matches: SearchMatch[],
		currentIndex: number,
		localViewport: typeof viewport,
		lineToVisualRow: (line: number) => number
	): MatchRect[] {
		const firstVisibleRow = Math.max(
			0,
			Math.floor(localViewport.scrollTop / measurements.lineHeight) - 1
		);
		const lastVisibleRow = Math.max(
			0,
			Math.ceil(
				(localViewport.scrollTop + localViewport.viewportHeight) / measurements.lineHeight
			) + 1
		);
		const rects: MatchRect[] = [];

		for (let i = 0; i < matches.length; i++) {
			const match = matches[i];
			const visualRow = lineToVisualRow(match.line);

			if (visualRow < firstVisibleRow || visualRow > lastVisibleRow) continue;

			const width = (match.endColumn - match.startColumn) * measurements.charWidth;
			if (width <= 0) continue;

			rects.push({
				top: visualRow * measurements.lineHeight,
				left:
					measurements.gutterWidth +
					measurements.contentPadding +
					match.startColumn * measurements.charWidth,
				width,
				height: measurements.lineHeight,
				isCurrent: i === currentIndex
			});
		}

		return rects;
	}

	it('should return empty array when no matches', () => {
		const finder = createEditorFind(makeDeps());
		const rects = finder.computeMatchRects(viewport, measurements);
		expect(rects).toEqual([]);
	});

	it('should return rects for visible matches', () => {
		const finder = createEditorFind(makeDeps());
		finder.setQuery('hello');

		const rects = finder.computeMatchRects(viewport, measurements);
		expect(rects.length).toBe(2);

		// First match: "hello" on line 0, columns 0-5
		expect(rects[0].top).toBe(0);
		expect(rects[0].left).toBe(50 + 8 + 0 * 8); // gutterWidth + contentPadding + startColumn * charWidth
		expect(rects[0].width).toBe(5 * 8); // 5 chars * charWidth
		expect(rects[0].height).toBe(20);
		expect(rects[0].isCurrent).toBe(true); // currentIndex is 0

		// Second match: "hello" on line 2, columns 0-5
		expect(rects[1].top).toBe(2 * 20);
		expect(rects[1].isCurrent).toBe(false);
	});

	it('should exclude matches outside viewport', () => {
		const deps = makeDeps({
			getLines: () => {
				// 100 lines, match on line 0 and line 99
				const arr = Array.from({ length: 100 }, (_, i) =>
					i === 0 || i === 99 ? { text: 'hello' } : { text: 'other' }
				);
				return arr;
			},
			getLineCount: () => 100
		});
		const finder = createEditorFind(deps);
		finder.setQuery('hello');

		// viewport only shows first ~25 lines
		const smallViewport = { scrollTop: 0, viewportHeight: 500 };
		const rects = finder.computeMatchRects(smallViewport, measurements);

		// Only the match on line 0 should be visible (line 99 is outside viewport)
		expect(rects.length).toBe(1);
		expect(rects[0].top).toBe(0);
	});

	it('should mark the current match with isCurrent=true', () => {
		const finder = createEditorFind(makeDeps());
		finder.setQuery('hello');
		finder.findNext(); // advance to index 1

		const rects = finder.computeMatchRects(viewport, measurements);

		const current = rects.find((r) => r.isCurrent);
		expect(current).toBeDefined();
		// Current should be the second match (line 2)
		expect(current!.top).toBe(2 * 20);
	});

	it('should match legacy full-scan rect output while scanning only visible matches', () => {
		const manyLines = Array.from({ length: 10000 }, () => ({ text: 'hit value' }));
		const lineToVisualRow = vi.fn((line: number) => line);
		const finder = createEditorFind(
			makeDeps({
				getLines: () => manyLines,
				getLineCount: () => manyLines.length,
				lineToVisualRow
			})
		);
		finder.setQuery('hit');

		lineToVisualRow.mockClear();
		const deepViewport = { scrollTop: 5000 * measurements.lineHeight, viewportHeight: 120 };
		const optimized = finder.computeMatchRects(deepViewport, measurements);
		const optimizedCalls = lineToVisualRow.mock.calls.length;
		const legacy = legacyComputeMatchRects(
			finder.matches,
			finder.currentIndex,
			deepViewport,
			(line) => line
		);

		expect(optimized).toEqual(legacy);
		expect(optimized.length).toBeGreaterThan(0);
		expect(optimizedCalls).toBeLessThan(100);
		expect(optimizedCalls).toBeLessThan(finder.matches.length);
	});
});
