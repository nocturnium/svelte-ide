import { describe, it, expect, vi } from 'vitest';
import { getWordAtPosition, selectNextOccurrence, selectAllOccurrences } from './editor-multicursor';
import type { EditorState, Position, Selection } from './core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal EditorState-like mock with the properties needed
 * by getWordAtPosition, selectNextOccurrence, selectAllOccurrences.
 */
function makeMockState(opts: {
	lines?: string[];
	cursorPos?: Position;
	selectionAnchor?: Position;
	selectionHead?: Position;
}): EditorState {
	const lineTexts = opts.lines ?? ['hello world'];
	const lineObjects = lineTexts.map((text, i) => ({ text, number: i, tokens: undefined }));

	const anchor = opts.selectionAnchor ?? opts.cursorPos ?? { line: 0, column: 0 };
	const head = opts.selectionHead ?? opts.cursorPos ?? { line: 0, column: 0 };

	const primarySelection: Selection = { anchor, head };
	const primaryCursorId = 'primary-0';

	const cursors = [
		{ id: primaryCursorId, selection: primarySelection, isPrimary: true }
	];

	const cursorManager = {
		setSelection: vi.fn()
	};

	const addCursorWithSelection = vi.fn();

	return {
		lines: lineObjects,
		lineCount: lineObjects.length,
		getLine: (n: number) => lineObjects[n] ?? null,
		getTextInSelection: (sel: Selection) => {
			if (sel.anchor.line === sel.head.line) {
				const start = Math.min(sel.anchor.column, sel.head.column);
				const end = Math.max(sel.anchor.column, sel.head.column);
				return lineObjects[sel.anchor.line]?.text.slice(start, end) ?? '';
			}
			return '';
		},
		primaryCursor: {
			id: primaryCursorId,
			selection: primarySelection,
			isPrimary: true
		},
		allCursors: cursors,
		cursorManager,
		addCursorWithSelection,
		hasAnySelection: anchor.line !== head.line || anchor.column !== head.column
	} as unknown as EditorState;
}

// ============================================================
// getWordAtPosition
// ============================================================

describe('getWordAtPosition', () => {
	it('should return the word under the cursor', () => {
		const state = makeMockState({ lines: ['hello world'] });
		const result = getWordAtPosition(state, { line: 0, column: 2 });

		expect(result).not.toBeNull();
		expect(result!.text).toBe('hello');
		expect(result!.start).toEqual({ line: 0, column: 0 });
		expect(result!.end).toEqual({ line: 0, column: 5 });
	});

	it('should return the second word when cursor is in it', () => {
		const state = makeMockState({ lines: ['hello world'] });
		const result = getWordAtPosition(state, { line: 0, column: 7 });

		expect(result).not.toBeNull();
		expect(result!.text).toBe('world');
		expect(result!.start).toEqual({ line: 0, column: 6 });
		expect(result!.end).toEqual({ line: 0, column: 11 });
	});

	it('should return the preceding word when cursor is at a word boundary', () => {
		// Column 5 in "hello world" is the space, but the algorithm
		// walks backward from column 5 to find 'o' (a word char) and
		// forward finds ' ' (not a word char), so it returns "hello".
		const state = makeMockState({ lines: ['hello world'] });
		const result = getWordAtPosition(state, { line: 0, column: 5 });

		expect(result).not.toBeNull();
		expect(result!.text).toBe('hello');
		expect(result!.start).toEqual({ line: 0, column: 0 });
		expect(result!.end).toEqual({ line: 0, column: 5 });
	});

	it('should return null when cursor is on a non-word char with no adjacent word chars', () => {
		// The algorithm walks backward and forward from cursor position.
		// At column 2 of "a  b": text[2] = ' ' (not word char).
		// Backward: text[1] = ' ' (not word char), stops. start stays at 2.
		// Forward: text[2] = ' ', stops. end stays at 2.
		// start === end => null.
		const state = makeMockState({ lines: ['a  b'] });
		const result = getWordAtPosition(state, { line: 0, column: 2 });
		expect(result).toBeNull();
	});

	it('should return null for empty line', () => {
		const state = makeMockState({ lines: [''] });
		const result = getWordAtPosition(state, { line: 0, column: 0 });

		expect(result).toBeNull();
	});

	it('should return null if line does not exist', () => {
		const state = makeMockState({ lines: ['hello'] });
		const result = getWordAtPosition(state, { line: 5, column: 0 });

		expect(result).toBeNull();
	});

	it('should return null if column is beyond line length', () => {
		const state = makeMockState({ lines: ['hello'] });
		const result = getWordAtPosition(state, { line: 0, column: 10 });

		expect(result).toBeNull();
	});

	it('should handle underscores as word characters', () => {
		const state = makeMockState({ lines: ['my_variable = 5'] });
		const result = getWordAtPosition(state, { line: 0, column: 3 });

		expect(result).not.toBeNull();
		expect(result!.text).toBe('my_variable');
	});

	it('should handle digits as word characters', () => {
		const state = makeMockState({ lines: ['foo123bar'] });
		const result = getWordAtPosition(state, { line: 0, column: 4 });

		expect(result).not.toBeNull();
		expect(result!.text).toBe('foo123bar');
	});

	it('should handle cursor at start of word', () => {
		const state = makeMockState({ lines: ['hello world'] });
		const result = getWordAtPosition(state, { line: 0, column: 0 });

		expect(result).not.toBeNull();
		expect(result!.text).toBe('hello');
	});

	it('should work on multi-line content', () => {
		const state = makeMockState({ lines: ['first', 'second', 'third'] });
		const result = getWordAtPosition(state, { line: 1, column: 2 });

		expect(result).not.toBeNull();
		expect(result!.text).toBe('second');
		expect(result!.start.line).toBe(1);
		expect(result!.end.line).toBe(1);
	});
});

// ============================================================
// selectNextOccurrence
// ============================================================

describe('selectNextOccurrence', () => {
	it('should do nothing when state is null', () => {
		// Should not throw
		selectNextOccurrence(null as unknown as EditorState);
	});

	it('should select word under cursor when no selection exists', () => {
		const state = makeMockState({
			lines: ['hello world hello'],
			cursorPos: { line: 0, column: 2 }
		});

		selectNextOccurrence(state);

		// Should first select the word under cursor, then add cursor at next occurrence
		expect(state.cursorManager.setSelection).toHaveBeenCalledWith(
			'primary-0',
			{ line: 0, column: 0 },
			{ line: 0, column: 5 }
		);
		expect(state.addCursorWithSelection).toHaveBeenCalledWith(
			{ line: 0, column: 12 },
			{ line: 0, column: 17 }
		);
	});

	it('should add cursor at next occurrence when selection exists', () => {
		const state = makeMockState({
			lines: ['foo bar foo baz foo'],
			selectionAnchor: { line: 0, column: 0 },
			selectionHead: { line: 0, column: 3 }
		});

		selectNextOccurrence(state);

		expect(state.addCursorWithSelection).toHaveBeenCalledWith(
			{ line: 0, column: 8 },
			{ line: 0, column: 11 }
		);
	});

	it('should add cursor at the single occurrence when mock does not update selection', () => {
		// When selection is empty, selectNextOccurrence selects the word via
		// cursorManager.setSelection, then searches for other occurrences.
		// Because our mock does not actually update the cursor selection,
		// the "already selected" check uses the stale cursor position.
		// With cursor at column 2, the primary start is {0,2} which doesn't
		// match the match start {0,0}, so the match is treated as unselected.
		const state = makeMockState({
			lines: ['unique'],
			cursorPos: { line: 0, column: 2 }
		});

		selectNextOccurrence(state);

		// The function considers the only occurrence as "not already selected"
		// because the mock doesn't update the primary selection.
		expect(state.addCursorWithSelection).toHaveBeenCalledTimes(1);
	});

	it('should not add duplicate cursor when cursor is at word start', () => {
		// When cursor position matches the word start, the "already selected"
		// check succeeds and the single match is skipped.
		const state = makeMockState({
			lines: ['unique'],
			cursorPos: { line: 0, column: 0 }
		});

		selectNextOccurrence(state);

		expect(state.addCursorWithSelection).not.toHaveBeenCalled();
	});

	// --- Regression: whole-word matching for word-under-cursor ---

	it('should NOT land a cursor inside a larger word (foo vs foobar)', () => {
		// Cursor in "foo"; the substring "foo" also appears in "foobar" but the
		// whole-word filter must skip it. The only other whole-word "foo" is the
		// last one, so exactly one cursor is added there.
		const state = makeMockState({
			lines: ['foo foobar foo'],
			cursorPos: { line: 0, column: 0 }
		});

		selectNextOccurrence(state);

		// Should select the trailing whole-word "foo" at column 11, NOT the
		// "foo" embedded in "foobar" at column 4.
		expect(state.addCursorWithSelection).toHaveBeenCalledTimes(1);
		expect(state.addCursorWithSelection).toHaveBeenCalledWith(
			{ line: 0, column: 11 },
			{ line: 0, column: 14 }
		);
	});

	it('should not add a cursor when the only other match is a substring of a larger word', () => {
		const state = makeMockState({
			lines: ['foo foobar'],
			cursorPos: { line: 0, column: 0 }
		});

		selectNextOccurrence(state);

		// "foo" inside "foobar" is filtered out; no other whole-word match.
		expect(state.addCursorWithSelection).not.toHaveBeenCalled();
	});

	it('should bail out (no cursors) when the selection spans multiple lines', () => {
		const state = makeMockState({
			lines: ['foo', 'foo', 'foo'],
			selectionAnchor: { line: 0, column: 0 },
			selectionHead: { line: 1, column: 3 }
		});
		(state as unknown as { getTextInSelection: () => string }).getTextInSelection =
			() => 'foo\nfoo';

		expect(() => selectNextOccurrence(state)).not.toThrow();
		expect(state.addCursorWithSelection).not.toHaveBeenCalled();
	});
});

// ============================================================
// selectAllOccurrences
// ============================================================

describe('selectAllOccurrences', () => {
	it('should do nothing when state is null', () => {
		selectAllOccurrences(null as unknown as EditorState);
	});

	it('should add cursors at all occurrences of word under cursor', () => {
		// Place cursor at column 0 (start of "foo") so the primary skip works.
		// The mock does not update the selection on cursorManager.setSelection,
		// so primaryStart must already match the first match's start for proper skip.
		const state = makeMockState({
			lines: ['foo bar foo baz foo'],
			cursorPos: { line: 0, column: 0 }
		});

		selectAllOccurrences(state);

		// Should select word first
		expect(state.cursorManager.setSelection).toHaveBeenCalled();
		// Should add cursors for the other two occurrences (primary at col 0 is skipped)
		expect(state.addCursorWithSelection).toHaveBeenCalledTimes(2);
	});

	it('should add cursors at all occurrences across multiple lines', () => {
		// Place cursor at column 0 (start of "hello") so primary skip works.
		const state = makeMockState({
			lines: ['hello world', 'hello again', 'hello once more'],
			cursorPos: { line: 0, column: 0 }
		});

		selectAllOccurrences(state);

		// Should add cursors for line 1 and line 2 occurrences (skip primary at line 0 col 0)
		expect(state.addCursorWithSelection).toHaveBeenCalledTimes(2);
	});

	it('should not add cursors when only one occurrence exists', () => {
		const state = makeMockState({
			lines: ['unique word here'],
			cursorPos: { line: 0, column: 1 }
		});

		selectAllOccurrences(state);

		expect(state.addCursorWithSelection).not.toHaveBeenCalled();
	});

	it('should use existing selection text when there is a selection', () => {
		const state = makeMockState({
			lines: ['foo bar foo baz foo'],
			selectionAnchor: { line: 0, column: 0 },
			selectionHead: { line: 0, column: 3 }
		});

		selectAllOccurrences(state);

		// Two other occurrences of "foo"
		expect(state.addCursorWithSelection).toHaveBeenCalledTimes(2);
	});

	// --- Regression: multi-line selection must bail out cleanly ---

	it('should bail out (no cursors) when the selection spans multiple lines', () => {
		const state = makeMockState({
			lines: ['foo', 'foo', 'foo'],
			selectionAnchor: { line: 0, column: 0 },
			selectionHead: { line: 1, column: 3 }
		});
		// Force getTextInSelection to return multi-line text for this selection.
		(state as unknown as { getTextInSelection: () => string }).getTextInSelection =
			() => 'foo\nfoo';

		expect(() => selectAllOccurrences(state)).not.toThrow();
		expect(state.addCursorWithSelection).not.toHaveBeenCalled();
	});
});
