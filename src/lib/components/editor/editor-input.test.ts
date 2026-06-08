/**
 * Tests for editor-input.ts
 *
 * This module is heavily DOM-dependent: almost every handler requires
 * HTMLDivElement, HTMLTextAreaElement, MouseEvent, getBoundingClientRect, etc.
 * We test:
 *   1. The factory creates successfully and returns the expected API shape.
 *   2. The constants it imports are available.
 *   3. handleFocus / handleBlur (pure callback delegation).
 *   4. handleCompositionStart / handleCompositionEnd composition flag semantics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEditorInput, type EditorInputDeps } from './editor-input';
import type { EditorState, FoldManager, createNavigation, createKeyboardHandler } from './core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal deps mock where every callback is a no-op / stub */
function makeDeps(overrides: Partial<EditorInputDeps> = {}): EditorInputDeps {
	const noopSelection = {
		anchor: { line: 0, column: 0 },
		head: { line: 0, column: 0 }
	};

	return {
		getEditorState: () => ({}) as unknown as EditorState,
		getNavigation: () => ({}) as unknown as ReturnType<typeof createNavigation>,
		getKeyboardHandler: () =>
			({ handleKeyDown: vi.fn(() => false) }) as unknown as ReturnType<
				typeof createKeyboardHandler
			>,
		getFoldManager: () => ({}) as unknown as FoldManager,

		getEditorContent: () => null,
		getHiddenInput: () => null,
		getMeasureSpan: () => null,

		isReadonly: () => false,
		isMultiCursor: () => false,
		isFolding: () => false,
		hasMultipleCursors: () => false,
		getSelection: () => noopSelection,
		getCursors: () => [],
		getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
		getMeasurements: () => ({ charWidth: 8, lineHeight: 20, gutterWidth: 50 }),

		onOpenFind: vi.fn(),
		onCloseFind: vi.fn(),
		onFindNext: vi.fn(),
		onFindPrev: vi.fn(),
		onFoldCurrent: vi.fn(),
		onUnfoldCurrent: vi.fn(),
		onFoldAll: vi.fn(),
		onUnfoldAll: vi.fn(),
		onSelectNextOccurrence: vi.fn(),
		onSelectAllOccurrences: vi.fn(),
		onShowCommandPalette: vi.fn(),
		onSave: vi.fn(),
		announce: vi.fn(),
		resetCursorBlink: vi.fn(),
		stopCursorBlink: vi.fn(),

		setCharWidth: vi.fn(),
		setLineHeight: vi.fn(),
		setScrollTop: vi.fn(),
		setScrollLeft: vi.fn(),
		setCursorVisible: vi.fn(),

		isShowFindReplace: () => false,
		getSearchQuery: () => '',
		getSearchMatchCount: () => 0,

		...overrides
	};
}

// ============================================================
// Factory shape
// ============================================================

describe('createEditorInput', () => {
	it('should return an object with all expected handler methods', () => {
		const input = createEditorInput(makeDeps());

		const expectedMethods = [
			'handleMouseDown',
			'handleKeyDown',
			'handleInput',
			'handlePaste',
			'handleCopy',
			'handleCut',
			'handleScroll',
			'handleFocus',
			'handleBlur',
			'handleCompositionStart',
			'handleCompositionEnd',
			'measureCharacter',
			'cleanupGlobalListeners'
		];

		for (const method of expectedMethods) {
			expect(typeof (input as unknown as Record<string, unknown>)[method]).toBe('function');
		}
	});
});

// ============================================================
// handleFocus / handleBlur
// ============================================================

describe('handleFocus', () => {
	it('should call resetCursorBlink', () => {
		const deps = makeDeps();
		const input = createEditorInput(deps);

		input.handleFocus();

		expect(deps.resetCursorBlink).toHaveBeenCalledTimes(1);
	});
});

describe('handleBlur', () => {
	it('should call stopCursorBlink and setCursorVisible(false)', () => {
		const deps = makeDeps();
		const input = createEditorInput(deps);

		input.handleBlur();

		expect(deps.stopCursorBlink).toHaveBeenCalledTimes(1);
		expect(deps.setCursorVisible).toHaveBeenCalledWith(false);
	});
});

// ============================================================
// handleScroll
// ============================================================

describe('handleScroll', () => {
	it('should read scrollTop and scrollLeft from the event target', () => {
		const deps = makeDeps();
		const input = createEditorInput(deps);

		const fakeEvent = {
			target: { scrollTop: 42, scrollLeft: 17 }
		} as unknown as Event;

		input.handleScroll(fakeEvent);

		expect(deps.setScrollTop).toHaveBeenCalledWith(42);
		expect(deps.setScrollLeft).toHaveBeenCalledWith(17);
	});
});

// ============================================================
// handleCompositionStart / handleCompositionEnd
// ============================================================

describe('IME composition', () => {
	it('handleCompositionStart should suppress subsequent input handling', () => {
		const deps = makeDeps();
		const mockState = {
			insert: vi.fn()
		};
		deps.getEditorState = () => mockState as unknown as EditorState;

		const input = createEditorInput(deps);

		// Start composition
		input.handleCompositionStart();

		// handleInput during composition should be a no-op
		const fakeInputEvent = {
			target: { value: 'partial' }
		} as unknown as Event;
		input.handleInput(fakeInputEvent);

		expect(mockState.insert).not.toHaveBeenCalled();
	});

	it('handleCompositionEnd should insert composed text', () => {
		const deps = makeDeps();
		const mockState = { insert: vi.fn() };
		deps.getEditorState = () => mockState as unknown as EditorState;
		deps.getHiddenInput = () => ({ value: '' }) as unknown as HTMLTextAreaElement;

		const input = createEditorInput(deps);

		input.handleCompositionStart();

		const compositionEvent = {
			data: 'composed-text'
		} as CompositionEvent;

		input.handleCompositionEnd(compositionEvent);

		expect(mockState.insert).toHaveBeenCalledWith('composed-text');
	});

	it('handleCompositionEnd should not insert when readonly', () => {
		const deps = makeDeps({ isReadonly: () => true });
		const mockState = { insert: vi.fn() };
		deps.getEditorState = () => mockState as unknown as EditorState;

		const input = createEditorInput(deps);
		input.handleCompositionStart();

		const compositionEvent = { data: 'text' } as CompositionEvent;
		input.handleCompositionEnd(compositionEvent);

		expect(mockState.insert).not.toHaveBeenCalled();
	});
});

// ============================================================
// handleInput (without composition)
// ============================================================

describe('handleInput', () => {
	it('should insert text from hidden input and clear it', () => {
		const deps = makeDeps();
		const mockState = { insert: vi.fn() };
		deps.getEditorState = () => mockState as unknown as EditorState;

		const input = createEditorInput(deps);

		const fakeTarget = { value: 'typed-text' };
		const fakeEvent = { target: fakeTarget } as unknown as Event;

		input.handleInput(fakeEvent);

		expect(mockState.insert).toHaveBeenCalledWith('typed-text');
		expect(fakeTarget.value).toBe('');
	});

	it('should not insert when readonly', () => {
		const deps = makeDeps({ isReadonly: () => true });
		const mockState = { insert: vi.fn() };
		deps.getEditorState = () => mockState as unknown as EditorState;

		const input = createEditorInput(deps);

		const fakeEvent = {
			target: { value: 'text' }
		} as unknown as Event;

		input.handleInput(fakeEvent);

		expect(mockState.insert).not.toHaveBeenCalled();
	});

	it('should not insert when value is empty', () => {
		const deps = makeDeps();
		const mockState = { insert: vi.fn() };
		deps.getEditorState = () => mockState as unknown as EditorState;

		const input = createEditorInput(deps);

		const fakeEvent = {
			target: { value: '' }
		} as unknown as Event;

		input.handleInput(fakeEvent);

		expect(mockState.insert).not.toHaveBeenCalled();
	});
});

// ============================================================
// cleanupGlobalListeners
// ============================================================

describe('cleanupGlobalListeners', () => {
	it('should not throw even when called without prior mouse activity', () => {
		const input = createEditorInput(makeDeps());
		expect(() => input.cleanupGlobalListeners()).not.toThrow();
	});
});

// ============================================================
// getPositionFromMouse (via handleMouseDown) — tab-aware hit-testing
// ============================================================

describe('mouse hit-testing with tabs', () => {
	// handleMouseDown attaches global window listeners on first drag. The base
	// editor-input test file runs without a DOM, so provide a minimal window
	// stub for these mouse tests only.
	beforeEach(() => {
		if (typeof globalThis.window === 'undefined') {
			vi.stubGlobal('window', {
				addEventListener: vi.fn(),
				removeEventListener: vi.fn()
			});
		}
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/**
	 * Build deps wired so handleMouseDown reaches getPositionFromMouse and
	 * forwards the computed position to editorState.setCursor. charWidth=10,
	 * gutterWidth=0, no padding offset beyond CONTENT_PADDING (8).
	 */
	function makeMouseDeps(opts: {
		lineText: string;
		charWidth?: number;
		tabSize?: number;
		gutterWidth?: number;
	}) {
		const setCursor = vi.fn();
		const editorState = {
			lineCount: 1,
			getLine: (_n: number) => ({ text: opts.lineText, number: 0 }),
			setCursor,
			extendSelection: vi.fn(),
			addCursor: vi.fn()
		};

		const editorContent = {
			getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 100 })
		} as unknown as HTMLDivElement;

		const deps = makeDeps({
			getEditorState: () => editorState as unknown as EditorState,
			getEditorContent: () => editorContent,
			getHiddenInput: () => ({ focus: vi.fn() }) as unknown as HTMLTextAreaElement,
			getNavigation: () =>
				({ selectWord: vi.fn(), selectLine: vi.fn() }) as unknown as ReturnType<
					typeof createNavigation
				>,
			getMeasurements: () => ({
				charWidth: opts.charWidth ?? 10,
				lineHeight: 20,
				gutterWidth: opts.gutterWidth ?? 0
			}),
			getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
			getTabSize: () => opts.tabSize ?? 4
		});

		return { deps, setCursor };
	}

	/** CONTENT_PADDING is 8px (imported indirectly); clientX = padding + textX. */
	const PADDING = 8;

	function fakeMouseEvent(clientX: number, clientY = 5): MouseEvent {
		return {
			button: 0,
			detail: 1,
			shiftKey: false,
			altKey: false,
			clientX,
			clientY,
			preventDefault: vi.fn()
		} as unknown as MouseEvent;
	}

	it('maps a click past a leading tab to the correct column', () => {
		// Line: "\tX" with tabSize 4 => the tab occupies visual columns 0..3,
		// 'X' sits at visual column 4. charWidth=10.
		// Clicking near the start of 'X' (visualCol 4 => x≈40) should yield column 1.
		const { deps, setCursor } = makeMouseDeps({ lineText: '\tX', tabSize: 4, charWidth: 10 });
		const input = createEditorInput(deps);

		// x within the text area = 42 (just past the tab's 40px width).
		input.handleMouseDown(fakeMouseEvent(PADDING + 42));

		expect(setCursor).toHaveBeenCalledTimes(1);
		const pos = setCursor.mock.calls[0][0];
		expect(pos).toEqual({ line: 0, column: 1 });
	});

	it('a click inside the leading tab maps to column 0', () => {
		const { deps, setCursor } = makeMouseDeps({ lineText: '\tX', tabSize: 4, charWidth: 10 });
		const input = createEditorInput(deps);

		// x = 5px: inside the first half of the 40px-wide tab => column 0.
		input.handleMouseDown(fakeMouseEvent(PADDING + 5));

		const pos = setCursor.mock.calls[0][0];
		expect(pos.column).toBe(0);
	});

	it('without tabs, column maps roughly to round(x/charWidth)', () => {
		// "hello", charWidth 10. Click at x=23 (between col 2 boundary 20 and
		// midpoint 25) => column 2.
		const { deps, setCursor } = makeMouseDeps({ lineText: 'hello', charWidth: 10 });
		const input = createEditorInput(deps);

		input.handleMouseDown(fakeMouseEvent(PADDING + 23));
		expect(setCursor.mock.calls[0][0].column).toBe(2);

		// Click at x=27 (past midpoint of col 2) => column 3.
		input.handleMouseDown(fakeMouseEvent(PADDING + 27));
		expect(setCursor.mock.calls[1][0].column).toBe(3);
	});

	it('respects a different tab size when expanding tabs', () => {
		// tabSize 2: a leading tab occupies visual cols 0..1 (20px at charWidth 10).
		// 'X' at visual col 2 (x≈20). Click at x=22 => column 1.
		const { deps, setCursor } = makeMouseDeps({ lineText: '\tX', tabSize: 2, charWidth: 10 });
		const input = createEditorInput(deps);

		input.handleMouseDown(fakeMouseEvent(PADDING + 22));
		expect(setCursor.mock.calls[0][0].column).toBe(1);
	});

	it('clamps clicks beyond end of line to line length', () => {
		const { deps, setCursor } = makeMouseDeps({ lineText: 'ab', charWidth: 10 });
		const input = createEditorInput(deps);

		input.handleMouseDown(fakeMouseEvent(PADDING + 9999));
		expect(setCursor.mock.calls[0][0].column).toBe(2);
	});
});

// ============================================================
// measureCharacter
// ============================================================

describe('measureCharacter', () => {
	it('should be a no-op when getMeasureSpan returns null', () => {
		const deps = makeDeps({ getMeasureSpan: () => null });
		const input = createEditorInput(deps);

		// Should not throw
		expect(() => input.measureCharacter()).not.toThrow();
		expect(deps.setCharWidth).not.toHaveBeenCalled();
	});
});
