import { describe, it, expect, beforeEach } from 'vitest';
import { createEditorState, EditorState } from './state';
import type { ChangeEvent } from './state';

/**
 * EditorState — Content Management Tests
 *
 * Covers: content access, setContent, insert, delete, and line management.
 */

/** Helper: create a state pre-configured for fast plaintext tests */
function makeState(content = ''): EditorState {
	return createEditorState({ content, language: 'plaintext' });
}

// ============================================================
// Content Access
// ============================================================

describe('EditorState — Content Access', () => {
	it('should initialise with 1 empty line when no content is provided', () => {
		const state = makeState();
		expect(state.lineCount).toBe(1);
		expect(state.getLine(0)?.text).toBe('');
		expect(state.getContent()).toBe('');
	});

	it('should initialise with provided multi-line content', () => {
		const state = makeState('hello\nworld\nfoo');
		expect(state.lineCount).toBe(3);
		expect(state.getLine(0)?.text).toBe('hello');
		expect(state.getLine(1)?.text).toBe('world');
		expect(state.getLine(2)?.text).toBe('foo');
	});

	it('should normalise CRLF line endings to LF', () => {
		const state = makeState('a\r\nb\r\nc');
		expect(state.lineCount).toBe(3);
		expect(state.getContent()).toBe('a\nb\nc');
	});

	it('should normalise CR line endings to LF', () => {
		const state = makeState('a\rb\rc');
		expect(state.lineCount).toBe(3);
		expect(state.getContent()).toBe('a\nb\nc');
	});

	it('should use 0-based line numbering', () => {
		const state = makeState('first\nsecond\nthird');
		expect(state.getLine(0)?.number).toBe(0);
		expect(state.getLine(1)?.number).toBe(1);
		expect(state.getLine(2)?.number).toBe(2);
	});

	it('should return undefined for out-of-bounds line numbers', () => {
		const state = makeState('only');
		expect(state.getLine(-1)).toBeUndefined();
		expect(state.getLine(1)).toBeUndefined();
		expect(state.getLine(999)).toBeUndefined();
	});

	it('should cache getContent results', () => {
		const state = makeState('cached');
		const first = state.getContent();
		const second = state.getContent();
		// Same string reference means caching is active
		expect(first).toBe(second);
		// Verify by identity, not just equality
		expect(Object.is(first, second)).toBe(true);
	});

	it('should expose lines as a readonly array', () => {
		const state = makeState('a\nb');
		const lines = state.lines;
		expect(lines.length).toBe(2);
		expect(lines[0].text).toBe('a');
		expect(lines[1].text).toBe('b');
	});
});

// ============================================================
// setContent
// ============================================================

describe('EditorState — setContent', () => {
	let state: EditorState;

	beforeEach(() => {
		state = makeState('initial');
	});

	it('should replace all content', () => {
		state.setContent('replaced');
		expect(state.getContent()).toBe('replaced');
		expect(state.lineCount).toBe(1);
	});

	it('should update line count when setting multi-line content', () => {
		state.setContent('a\nb\nc\nd');
		expect(state.lineCount).toBe(4);
	});

	it('should fire a content change event when content changes', () => {
		const events: ChangeEvent[] = [];
		state.onContentChange((e) => events.push(e));

		state.setContent('new content');

		expect(events.length).toBe(1);
		expect(events[0].type).toBe('replace');
		expect(events[0].text).toBe('new content');
	});

	it('should not fire a content change event when content is unchanged', () => {
		// Set content to a known value first
		state.setContent('stable');

		const events: ChangeEvent[] = [];
		state.onContentChange((e) => events.push(e));

		state.setContent('stable');

		expect(events.length).toBe(0);
	});

	it('should handle setting empty string', () => {
		state.setContent('');
		expect(state.lineCount).toBe(1);
		expect(state.getLine(0)?.text).toBe('');
		expect(state.getContent()).toBe('');
	});

	it('should invalidate content cache after setContent', () => {
		const before = state.getContent();
		state.setContent('changed');
		const after = state.getContent();
		expect(before).not.toBe(after);
		expect(after).toBe('changed');
	});
});

// ============================================================
// insert
// ============================================================

describe('EditorState — insert', () => {
	it('should insert text at cursor position', () => {
		const state = makeState('hello world');
		state.setCursor({ line: 0, column: 5 });

		state.insert(',');

		expect(state.getContent()).toBe('hello, world');
	});

	it('should insert multiline text and split lines', () => {
		const state = makeState('ab');
		state.setCursor({ line: 0, column: 1 });

		state.insert('x\ny\nz');

		// "a" + "x\ny\nz" + "b"  =>  "ax\ny\nzb"
		expect(state.lineCount).toBe(3);
		expect(state.getLine(0)?.text).toBe('ax');
		expect(state.getLine(1)?.text).toBe('y');
		expect(state.getLine(2)?.text).toBe('zb');
	});

	it('should move cursor after insert (single line)', () => {
		const state = makeState('ab');
		state.setCursor({ line: 0, column: 1 });

		state.insert('XY');

		expect(state.cursor.line).toBe(0);
		expect(state.cursor.column).toBe(3); // 1 + len("XY")
	});

	it('should move cursor after insert (multiline)', () => {
		const state = makeState('ab');
		state.setCursor({ line: 0, column: 1 });

		state.insert('X\nYY');

		// Cursor should be at end of inserted text: line 1, column 2
		expect(state.cursor.line).toBe(1);
		expect(state.cursor.column).toBe(2);
	});

	it('should insert at start of line', () => {
		const state = makeState('hello');
		state.setCursor({ line: 0, column: 0 });

		state.insert('>>> ');

		expect(state.getContent()).toBe('>>> hello');
	});

	it('should insert at end of line', () => {
		const state = makeState('hello');
		state.setCursor({ line: 0, column: 5 });

		state.insert('!');

		expect(state.getContent()).toBe('hello!');
	});
});

describe('EditorState — insertAt', () => {
	it('should insert at a specific position without changing cursor manually first', () => {
		const state = makeState('hello world');

		state.insertAt({ line: 0, column: 5 }, ',');

		expect(state.getContent()).toBe('hello, world');
	});

	it('should update cursor to end of inserted text', () => {
		const state = makeState('hello world');

		state.insertAt({ line: 0, column: 5 }, ' dear');

		expect(state.cursor.line).toBe(0);
		expect(state.cursor.column).toBe(10); // 5 + len(" dear")
	});

	it('should handle multiline insertAt', () => {
		const state = makeState('AB');

		state.insertAt({ line: 0, column: 1 }, '1\n2\n3');

		expect(state.lineCount).toBe(3);
		expect(state.getLine(0)?.text).toBe('A1');
		expect(state.getLine(1)?.text).toBe('2');
		expect(state.getLine(2)?.text).toBe('3B');
	});
});

// ============================================================
// delete
// ============================================================

describe('EditorState — deleteBackward', () => {
	it('should delete character before cursor (within line)', () => {
		const state = makeState('abc');
		state.setCursor({ line: 0, column: 2 });

		state.deleteBackward();

		expect(state.getContent()).toBe('ac');
		expect(state.cursor.column).toBe(1);
	});

	it('should join with previous line at line start', () => {
		const state = makeState('first\nsecond');
		state.setCursor({ line: 1, column: 0 });

		state.deleteBackward();

		expect(state.lineCount).toBe(1);
		expect(state.getContent()).toBe('firstsecond');
		expect(state.cursor.line).toBe(0);
		expect(state.cursor.column).toBe(5); // end of "first"
	});

	it('should do nothing at start of document', () => {
		const state = makeState('hello');
		state.setCursor({ line: 0, column: 0 });

		state.deleteBackward();

		expect(state.getContent()).toBe('hello');
	});

	it('should delete last character on a line', () => {
		const state = makeState('x');
		state.setCursor({ line: 0, column: 1 });

		state.deleteBackward();

		expect(state.getContent()).toBe('');
		expect(state.cursor.column).toBe(0);
	});
});

describe('EditorState — deleteForward', () => {
	it('should delete character after cursor (within line)', () => {
		const state = makeState('abc');
		state.setCursor({ line: 0, column: 1 });

		state.deleteForward();

		expect(state.getContent()).toBe('ac');
		expect(state.cursor.line).toBe(0);
		expect(state.cursor.column).toBe(1);
	});

	it('should join with next line at line end', () => {
		const state = makeState('first\nsecond');
		state.setCursor({ line: 0, column: 5 });

		state.deleteForward();

		expect(state.lineCount).toBe(1);
		expect(state.getContent()).toBe('firstsecond');
		expect(state.cursor.line).toBe(0);
		expect(state.cursor.column).toBe(5);
	});

	it('should do nothing at end of document', () => {
		const state = makeState('hello');
		state.setCursor({ line: 0, column: 5 });

		state.deleteForward();

		expect(state.getContent()).toBe('hello');
	});
});

describe('EditorState — deleteSelection', () => {
	it('should remove selected text', () => {
		const state = makeState('hello world');
		// Select "lo wo" (columns 3..8)
		state.setSelection({ line: 0, column: 3 }, { line: 0, column: 8 });

		state.deleteSelection();

		expect(state.getContent()).toBe('helrld');
	});

	it('should remove multi-line selection', () => {
		const state = makeState('first\nsecond\nthird');
		// Select from middle of first line to middle of third
		state.setSelection({ line: 0, column: 3 }, { line: 2, column: 2 });

		state.deleteSelection();

		expect(state.getContent()).toBe('firird');
		expect(state.lineCount).toBe(1);
	});

	it('should be a no-op when there is no selection', () => {
		const state = makeState('hello');
		state.setCursor({ line: 0, column: 2 });

		state.deleteSelection();

		expect(state.getContent()).toBe('hello');
	});
});

describe('EditorState — deleteRange', () => {
	it('should remove a range on a single line', () => {
		const state = makeState('abcdef');

		state.deleteRange({ line: 0, column: 1 }, { line: 0, column: 4 });

		expect(state.getContent()).toBe('aef');
	});

	it('should remove a range spanning multiple lines', () => {
		const state = makeState('aaa\nbbb\nccc');

		state.deleteRange({ line: 0, column: 1 }, { line: 2, column: 2 });

		expect(state.getContent()).toBe('ac');
		expect(state.lineCount).toBe(1);
	});

	it('should place cursor at start of deleted range', () => {
		const state = makeState('hello world');

		state.deleteRange({ line: 0, column: 5 }, { line: 0, column: 11 });

		expect(state.cursor.line).toBe(0);
		expect(state.cursor.column).toBe(5);
		expect(state.getContent()).toBe('hello');
	});
});

// ============================================================
// Event listener management
// ============================================================

describe('EditorState — onContentChange', () => {
	it('should return an unsubscribe function', () => {
		const state = makeState('hi');
		const events: ChangeEvent[] = [];
		const unsub = state.onContentChange((e) => events.push(e));

		state.setContent('changed');
		expect(events.length).toBe(1);

		unsub();

		state.setContent('again');
		// Should not receive second event after unsubscribe
		expect(events.length).toBe(1);
	});

	it('should fire on insert', () => {
		const state = makeState('hi');
		const events: ChangeEvent[] = [];
		state.onContentChange((e) => events.push(e));

		state.setCursor({ line: 0, column: 2 });
		state.insert('!');

		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events.some((e) => e.type === 'insert')).toBe(true);
	});

	it('should fire on deleteBackward', () => {
		const state = makeState('hi');
		const events: ChangeEvent[] = [];
		state.onContentChange((e) => events.push(e));

		state.setCursor({ line: 0, column: 2 });
		state.deleteBackward();

		expect(events.length).toBeGreaterThanOrEqual(1);
	});
});

// ============================================================
// Cursor and Selection
// ============================================================

describe('EditorState — Cursor and Selection', () => {
	it('should set cursor position with setCursor', () => {
		const state = makeState('hello world');
		state.setCursor({ line: 0, column: 5 });

		expect(state.cursor.line).toBe(0);
		expect(state.cursor.column).toBe(5);
	});

	it('should clamp cursor to valid position when line is out of bounds', () => {
		const state = makeState('hello\nworld');
		state.setCursor({ line: 99, column: 0 });

		// Should clamp to last line
		expect(state.cursor.line).toBe(1);
	});

	it('should clamp cursor to valid position when column is out of bounds', () => {
		const state = makeState('hi');
		state.setCursor({ line: 0, column: 999 });

		// Should clamp to end of line
		expect(state.cursor.column).toBe(2);
	});

	it('should clamp cursor when line is negative', () => {
		const state = makeState('hello');
		state.setCursor({ line: -5, column: 3 });

		expect(state.cursor.line).toBe(0);
	});

	it('should clamp cursor when column is negative', () => {
		const state = makeState('hello');
		state.setCursor({ line: 0, column: -10 });

		expect(state.cursor.column).toBe(0);
	});

	it('should set selection with anchor and head positions', () => {
		const state = makeState('hello world');
		state.setSelection({ line: 0, column: 0 }, { line: 0, column: 5 });

		expect(state.selection.anchor.line).toBe(0);
		expect(state.selection.anchor.column).toBe(0);
		expect(state.selection.head.line).toBe(0);
		expect(state.selection.head.column).toBe(5);
	});

	it('should report hasSelection correctly when selection exists', () => {
		const state = makeState('hello world');
		state.setSelection({ line: 0, column: 0 }, { line: 0, column: 5 });

		expect(state.hasSelection).toBe(true);
	});

	it('should report hasSelection as false when no selection', () => {
		const state = makeState('hello world');
		state.setCursor({ line: 0, column: 3 });

		expect(state.hasSelection).toBe(false);
	});

	it('should return selected text with getSelectedText', () => {
		const state = makeState('hello world');
		state.setSelection({ line: 0, column: 0 }, { line: 0, column: 5 });

		expect(state.getSelectedText()).toBe('hello');
	});

	it('should return empty string from getSelectedText when no selection', () => {
		const state = makeState('hello world');
		state.setCursor({ line: 0, column: 3 });

		expect(state.getSelectedText()).toBe('');
	});

	it('should return normalizedSelection with start before end (forward selection)', () => {
		const state = makeState('hello world');
		state.setSelection({ line: 0, column: 0 }, { line: 0, column: 5 });

		const norm = state.normalizedSelection;
		expect(norm.start.column).toBe(0);
		expect(norm.end.column).toBe(5);
	});

	it('should return normalizedSelection with start before end (backward selection)', () => {
		const state = makeState('hello world');
		// Backward: anchor after head
		state.setSelection({ line: 0, column: 5 }, { line: 0, column: 0 });

		const norm = state.normalizedSelection;
		expect(norm.start.column).toBe(0);
		expect(norm.end.column).toBe(5);
	});

	it('should select entire document with selectAll', () => {
		const state = makeState('hello\nworld\nfoo');
		state.selectAll();

		const norm = state.normalizedSelection;
		expect(norm.start.line).toBe(0);
		expect(norm.start.column).toBe(0);
		expect(norm.end.line).toBe(2);
		expect(norm.end.column).toBe(3); // length of "foo"
		expect(state.getSelectedText()).toBe('hello\nworld\nfoo');
	});

	it('should return multiline selected text', () => {
		const state = makeState('first\nsecond\nthird');
		state.setSelection({ line: 0, column: 3 }, { line: 2, column: 2 });

		expect(state.getSelectedText()).toBe('st\nsecond\nth');
	});

	it('should fire selection change event on setSelection', () => {
		const state = makeState('hello world');
		const events: unknown[] = [];
		state.onSelectionChange((sel) => events.push(sel));

		state.setSelection({ line: 0, column: 0 }, { line: 0, column: 5 });

		expect(events.length).toBeGreaterThanOrEqual(1);
	});

	it('should extend selection from current anchor', () => {
		const state = makeState('hello world');
		// First set a selection with a known anchor
		state.setSelection({ line: 0, column: 2 }, { line: 0, column: 5 });

		// Extend to a new head position (anchor should stay at column 2)
		state.extendSelection({ line: 0, column: 9 });

		expect(state.selection.anchor.column).toBe(2);
		expect(state.selection.head.column).toBe(9);
		expect(state.getSelectedText()).toBe('llo wor');
	});
});

// ============================================================
// Undo and Redo
// ============================================================

describe('EditorState — Undo and Redo', () => {
	it('should undo an insert', () => {
		const state = makeState('hello');
		state.setCursor({ line: 0, column: 5 });
		state.insert(' world');

		expect(state.getContent()).toBe('hello world');

		state.undo();

		expect(state.getContent()).toBe('hello');
	});

	it('should redo after undo', () => {
		const state = makeState('hello');
		state.setCursor({ line: 0, column: 5 });
		state.insert(' world');

		state.undo();
		expect(state.getContent()).toBe('hello');

		state.redo();
		expect(state.getContent()).toBe('hello world');
	});

	it('should report canUndo correctly', () => {
		const state = makeState('hello');

		expect(state.canUndo).toBe(false);

		state.setCursor({ line: 0, column: 5 });
		state.insert('!');

		expect(state.canUndo).toBe(true);
	});

	it('should report canRedo correctly', () => {
		const state = makeState('hello');

		expect(state.canRedo).toBe(false);

		state.setCursor({ line: 0, column: 5 });
		state.insert('!');
		state.undo();

		expect(state.canRedo).toBe(true);
	});

	it('should clear redo stack when a new edit is made after undo', () => {
		const state = makeState('hello');
		state.setCursor({ line: 0, column: 5 });
		state.insert('!');
		state.undo();

		expect(state.canRedo).toBe(true);

		// New edit should clear redo stack
		state.setCursor({ line: 0, column: 5 });
		state.insert('?');

		expect(state.canRedo).toBe(false);
	});
});

// ============================================================
// Newline and Tab
// ============================================================

describe('EditorState — Newline and Tab', () => {
	it('should split line at cursor when inserting newline', () => {
		const state = makeState('hello world');
		state.setCursor({ line: 0, column: 5 });

		state.insertNewline();

		expect(state.lineCount).toBe(2);
		expect(state.getLine(0)?.text).toBe('hello');
		expect(state.getLine(1)?.text).toBe(' world');
	});

	it('should insert tab character when insertSpaces is false', () => {
		const state = createEditorState({
			content: 'hello',
			language: 'plaintext',
			insertSpaces: false
		});
		state.setCursor({ line: 0, column: 0 });

		state.insertTab();

		expect(state.getContent()).toBe('\thello');
	});

	it('should insert spaces when insertSpaces is true', () => {
		const state = createEditorState({
			content: 'hello',
			language: 'plaintext',
			insertSpaces: true,
			tabSize: 4
		});
		state.setCursor({ line: 0, column: 0 });

		state.insertTab();

		expect(state.getContent()).toBe('    hello');
	});
});

// ============================================================
// Event Listeners (additional)
// ============================================================

describe('EditorState — Event Listeners (extended)', () => {
	it('should stop receiving content change events after unsubscribe', () => {
		const state = makeState('hello');
		const events: ChangeEvent[] = [];
		const unsub = state.onContentChange((e) => events.push(e));

		state.setContent('first change');
		expect(events.length).toBe(1);

		unsub();

		state.setContent('second change');
		expect(events.length).toBe(1); // no new event
	});

	it('should fire cursor change events on setCursor', () => {
		const state = makeState('hello');
		const events: unknown[] = [];
		state.onCursorChange((cursors) => events.push(cursors));

		state.setCursor({ line: 0, column: 3 });

		expect(events.length).toBeGreaterThanOrEqual(1);
	});

	it('should fire cursor change events on setSelection', () => {
		const state = makeState('hello world');
		const events: unknown[] = [];
		state.onCursorChange((cursors) => events.push(cursors));

		state.setSelection({ line: 0, column: 0 }, { line: 0, column: 5 });

		expect(events.length).toBeGreaterThanOrEqual(1);
	});

	it('should suppress events inside runWithoutNotifications', () => {
		const state = makeState('hello');
		const contentEvents: ChangeEvent[] = [];
		const selectionEvents: unknown[] = [];
		const cursorEvents: unknown[] = [];

		state.onContentChange((e) => contentEvents.push(e));
		state.onSelectionChange((sel) => selectionEvents.push(sel));
		state.onCursorChange((c) => cursorEvents.push(c));

		state.runWithoutNotifications(() => {
			state.setContent('changed inside');
			state.setCursor({ line: 0, column: 3 });
		});

		expect(contentEvents.length).toBe(0);
		expect(selectionEvents.length).toBe(0);
		expect(cursorEvents.length).toBe(0);
	});

	it('should resume firing events after runWithoutNotifications completes', () => {
		const state = makeState('hello');
		const contentEvents: ChangeEvent[] = [];

		state.onContentChange((e) => contentEvents.push(e));

		state.runWithoutNotifications(() => {
			state.setContent('suppressed');
		});

		expect(contentEvents.length).toBe(0);

		state.setContent('after suppression');
		expect(contentEvents.length).toBe(1);
	});
});

// ============================================================
// Multi-line tokenizer state propagation (regression for BUG 1)
//
// Single-line edits must re-tokenize from the edited line to the END of the
// document, because the tokenizer carries multi-line state (block comments,
// template literals). A single-line edit that opens or closes such a construct
// must propagate to all following lines, not just the edited one.
// ============================================================

describe('EditorState — multi-line tokenizer propagation', () => {
	/** Collect every token type present on a given line */
	function lineTokenTypes(state: EditorState, lineNumber: number): string[] {
		return (state.getLine(lineNumber)?.tokens?.tokens ?? []).map((t) => t.type);
	}

	/** True if a line is (entirely or partly) inside a block comment */
	function lineHasBlockComment(state: EditorState, lineNumber: number): boolean {
		return lineTokenTypes(state, lineNumber).includes('comment.block');
	}

	it('inserting "/*" at end of line 0 comments out following lines', () => {
		const state = createEditorState({
			content: 'const a = 1;\nconst b = 2;\nconst c = 3;',
			language: 'javascript'
		});

		// Initially nothing below is a block comment
		expect(lineHasBlockComment(state, 1)).toBe(false);
		expect(lineHasBlockComment(state, 2)).toBe(false);

		// Type "/*" at end of line 0 (single-line insert)
		const endOfLine0 = { line: 0, column: state.getLine(0)!.text.length };
		state.insertAt(endOfLine0, '/*');

		// Now line 1 and line 2 should be inside the (unterminated) block comment
		expect(lineHasBlockComment(state, 1)).toBe(true);
		expect(lineHasBlockComment(state, 2)).toBe(true);
	});

	it('deleting the "/*" stops following lines from being comments', () => {
		const state = createEditorState({
			content: '/*\nconst b = 2;\nconst c = 3;',
			language: 'javascript'
		});

		// Lines below the unterminated /* are comments
		expect(lineHasBlockComment(state, 1)).toBe(true);
		expect(lineHasBlockComment(state, 2)).toBe(true);

		// Remove the "/*" on line 0 via two forward deletes (single-line deletes)
		state.setCursor({ line: 0, column: 0 });
		state.deleteForward(); // removes '/'
		state.deleteForward(); // removes '*'

		expect(state.getLine(0)?.text).toBe('');

		// Following lines must no longer be block comments
		expect(lineHasBlockComment(state, 1)).toBe(false);
		expect(lineHasBlockComment(state, 2)).toBe(false);
	});

	it('deleting a closing "*/" re-comments the lines below it', () => {
		// A block comment closes on line 1; line 2 is normal code.
		const state = createEditorState({
			content: '/* start\nend */ const b = 2;\nconst c = 3;',
			language: 'javascript'
		});

		// Line 2 starts out as ordinary code (not a comment)
		expect(lineHasBlockComment(state, 2)).toBe(false);

		// Delete the closing "*/" on line 1 (cols 3-5: 'end ' then '*/').
		// "end " is 4 chars, so '*/' is at columns 4-5. Delete those two chars.
		state.deleteRange({ line: 1, column: 4 }, { line: 1, column: 6 });
		expect(state.getLine(1)?.text).toBe('end  const b = 2;');

		// With the close gone, the comment now runs through line 2.
		expect(lineHasBlockComment(state, 2)).toBe(true);
	});

	it('backspacing into a "/*" un-comments following lines', () => {
		const state = createEditorState({
			content: 'x/*\nconst b = 2;',
			language: 'javascript'
		});

		expect(lineHasBlockComment(state, 1)).toBe(true);

		// Cursor after the '*' (column 3), backspace removes '*' -> '/' alone.
		state.setCursor({ line: 0, column: 3 });
		state.deleteBackward();
		expect(state.getLine(0)?.text).toBe('x/');

		expect(lineHasBlockComment(state, 1)).toBe(false);
	});
});
