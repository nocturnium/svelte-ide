import { describe, it, expect } from 'vitest';
import { createEditorState, type EditorState } from './state';
import { createNavigation, isWordChar } from './navigation';

/**
 * Navigation — Unit Tests
 *
 * Covers: character movement, line movement, word movement,
 * line start/end, document boundaries, page movement, and isWordChar utility.
 */

/** Helper: create a state pre-configured for fast plaintext tests */
function makeState(content = ''): EditorState {
	return createEditorState({ content, language: 'plaintext' });
}

/** Helper: create state + navigation and position cursor */
function setup(content: string, line = 0, column = 0) {
	const state = makeState(content);
	state.setCursor({ line, column });
	const nav = createNavigation(state);
	return { state, nav };
}

/** Multiline test content */
const MULTILINE = `function hello() {
  const x = 42;
  return x;
}`;

// ============================================================
// Character Movement
// ============================================================

describe('Navigation — Character Movement', () => {
	it('moveLeft within a line decrements column', () => {
		const { state, nav } = setup('hello', 0, 3);
		nav.moveLeft();
		expect(state.cursor).toEqual({ line: 0, column: 2 });
	});

	it('moveLeft at column 0 wraps to end of previous line', () => {
		const { state, nav } = setup('hello\nworld', 1, 0);
		nav.moveLeft();
		expect(state.cursor).toEqual({ line: 0, column: 5 });
	});

	it('moveLeft at document start (0:0) stays at 0:0', () => {
		const { state, nav } = setup('hello', 0, 0);
		nav.moveLeft();
		expect(state.cursor).toEqual({ line: 0, column: 0 });
	});

	it('moveRight within a line increments column', () => {
		const { state, nav } = setup('hello', 0, 2);
		nav.moveRight();
		expect(state.cursor).toEqual({ line: 0, column: 3 });
	});

	it('moveRight at end of line wraps to start of next line', () => {
		const { state, nav } = setup('hello\nworld', 0, 5);
		nav.moveRight();
		expect(state.cursor).toEqual({ line: 1, column: 0 });
	});

	it('moveRight at document end stays at document end', () => {
		const { state, nav } = setup('hello', 0, 5);
		nav.moveRight();
		expect(state.cursor).toEqual({ line: 0, column: 5 });
	});
});

// ============================================================
// Line Movement
// ============================================================

describe('Navigation — Line Movement', () => {
	it('moveUp decrements line number', () => {
		const { state, nav } = setup(MULTILINE, 2, 3);
		nav.moveUp();
		expect(state.cursor.line).toBe(1);
	});

	it('moveDown increments line number', () => {
		const { state, nav } = setup(MULTILINE, 0, 3);
		nav.moveDown();
		expect(state.cursor.line).toBe(1);
	});

	it('moveUp at first line stays at line 0', () => {
		const { state, nav } = setup(MULTILINE, 0, 5);
		nav.moveUp();
		expect(state.cursor.line).toBe(0);
		expect(state.cursor.column).toBe(5);
	});

	it('moveDown at last line stays at last line', () => {
		const { state, nav } = setup(MULTILINE, 3, 0);
		nav.moveDown();
		expect(state.cursor.line).toBe(3);
	});

	it('column is clamped to shorter line when moving vertically', () => {
		// Line 0: "function hello() {" (18 chars)
		// Line 3: "}" (1 char)
		const { state, nav } = setup(MULTILINE, 0, 15);
		nav.moveDown(); // line 1: "  const x = 42;" (16 chars) -> 15 fits
		nav.moveDown(); // line 2: "  return x;" (11 chars) -> clamped to 11
		expect(state.cursor.line).toBe(2);
		expect(state.cursor.column).toBeLessThanOrEqual(11);
	});
});

// ============================================================
// Word Movement
// ============================================================

describe('Navigation — Word Movement', () => {
	it('moveWordRight jumps to next word boundary', () => {
		// "function hello() {"
		const { state, nav } = setup(MULTILINE, 0, 0);
		nav.moveWordRight();
		// Should jump past "function" to the space, then to "hello"
		expect(state.cursor.column).toBe(9); // start of "hello"
	});

	it('moveWordLeft jumps to previous word boundary', () => {
		// "function hello() {"  cursor at column 14 (in "lo()")
		const { state, nav } = setup(MULTILINE, 0, 14);
		nav.moveWordLeft();
		// Should jump back to start of "hello" at column 9
		expect(state.cursor.column).toBe(9);
	});

	it('moveWordRight at end of line wraps to next line', () => {
		// Position at end of line 0: "function hello() {"
		const line0 = 'function hello() {';
		const { state, nav } = setup(MULTILINE, 0, line0.length);
		nav.moveWordRight();
		expect(state.cursor.line).toBe(1);
		expect(state.cursor.column).toBe(0);
	});

	it('moveWordLeft at column 0 wraps to end of previous line', () => {
		const { state, nav } = setup(MULTILINE, 1, 0);
		nav.moveWordLeft();
		expect(state.cursor.line).toBe(0);
		// Should go to end of previous line
		const line0Len = state.getLine(0)!.text.length;
		expect(state.cursor.column).toBe(line0Len);
	});

	it('moveWordRight skips punctuation between words', () => {
		const { state, nav } = setup('foo.bar baz', 0, 0);
		nav.moveWordRight();
		// Should skip "foo", then skip ".", arriving at "bar"
		expect(state.cursor.column).toBe(4); // start of "bar"
	});
});

// ============================================================
// Line Start / End
// ============================================================

describe('Navigation — Line Start / End', () => {
	it('moveToLineStart goes to first non-whitespace character', () => {
		// Line 1: "  const x = 42;" — first non-ws at column 2
		const { state, nav } = setup(MULTILINE, 1, 10);
		nav.moveToLineStart();
		expect(state.cursor).toEqual({ line: 1, column: 2 });
	});

	it('moveToLineStart toggles between column 0 and first non-ws', () => {
		// Line 1: "  const x = 42;" — first non-ws at column 2
		const { state, nav } = setup(MULTILINE, 1, 2);
		// Already at first non-ws, should toggle to column 0
		nav.moveToLineStart();
		expect(state.cursor).toEqual({ line: 1, column: 0 });

		// Now at column 0, should go back to first non-ws
		nav.moveToLineStart();
		expect(state.cursor).toEqual({ line: 1, column: 2 });
	});

	it('moveToLineEnd goes to end of line', () => {
		const { state, nav } = setup(MULTILINE, 1, 0);
		nav.moveToLineEnd();
		const line1Len = state.getLine(1)!.text.length;
		expect(state.cursor).toEqual({ line: 1, column: line1Len });
	});
});

// ============================================================
// Document Boundaries
// ============================================================

describe('Navigation — Document Boundaries', () => {
	it('moveToDocumentStart returns 0:0', () => {
		const { state, nav } = setup(MULTILINE, 2, 5);
		nav.moveToDocumentStart();
		expect(state.cursor).toEqual({ line: 0, column: 0 });
	});

	it('moveToDocumentEnd returns last line, last column', () => {
		const { state, nav } = setup(MULTILINE, 0, 0);
		nav.moveToDocumentEnd();
		const lastLine = state.lineCount - 1;
		const lastCol = state.getLine(lastLine)!.text.length;
		expect(state.cursor).toEqual({ line: lastLine, column: lastCol });
	});
});

// ============================================================
// Page Movement
// ============================================================

describe('Navigation — Page Movement', () => {
	it('movePageUp moves cursor up by page size', () => {
		const { state, nav } = setup(MULTILINE, 3, 0);
		nav.movePageUp(2);
		expect(state.cursor.line).toBe(1);
	});

	it('movePageDown moves cursor down by page size', () => {
		const { state, nav } = setup(MULTILINE, 0, 0);
		nav.movePageDown(2);
		expect(state.cursor.line).toBe(2);
	});

	it('movePageUp clamps to first line', () => {
		const { state, nav } = setup(MULTILINE, 1, 0);
		nav.movePageUp(100);
		expect(state.cursor.line).toBe(0);
	});

	it('movePageDown clamps to last line', () => {
		const { state, nav } = setup(MULTILINE, 1, 0);
		nav.movePageDown(100);
		expect(state.cursor.line).toBe(3);
	});

	it('movePageUp clamps column to shorter target line', () => {
		// Line 3 is "}" (1 char), line 1 is "  const x = 42;" (16 chars)
		// Start at line 3 col 1, page up by 100 -> line 0 "function hello() {" (18 chars)
		// col 1 fits fine on line 0
		const { state, nav } = setup(MULTILINE, 2, 10);
		nav.movePageUp(100);
		// Line 0: "function hello() {" — col 10 fits
		expect(state.cursor.line).toBe(0);
		expect(state.cursor.column).toBe(10);
	});
});

// ============================================================
// isWordChar Utility
// ============================================================

describe('isWordChar', () => {
	it('returns true for ASCII letters', () => {
		expect(isWordChar('a')).toBe(true);
		expect(isWordChar('z')).toBe(true);
		expect(isWordChar('A')).toBe(true);
		expect(isWordChar('Z')).toBe(true);
		expect(isWordChar('m')).toBe(true);
	});

	it('returns true for digits', () => {
		expect(isWordChar('0')).toBe(true);
		expect(isWordChar('5')).toBe(true);
		expect(isWordChar('9')).toBe(true);
	});

	it('returns true for underscore', () => {
		expect(isWordChar('_')).toBe(true);
	});

	it('returns false for space', () => {
		expect(isWordChar(' ')).toBe(false);
	});

	it('returns false for punctuation', () => {
		expect(isWordChar('.')).toBe(false);
		expect(isWordChar(',')).toBe(false);
		expect(isWordChar(';')).toBe(false);
		expect(isWordChar('(')).toBe(false);
		expect(isWordChar(')')).toBe(false);
		expect(isWordChar('{')).toBe(false);
		expect(isWordChar('}')).toBe(false);
		expect(isWordChar('=')).toBe(false);
		expect(isWordChar('+')).toBe(false);
	});

	it('returns false for empty string', () => {
		expect(isWordChar('')).toBe(false);
	});

	it('returns true for Unicode letters (internationalization)', () => {
		expect(isWordChar('é')).toBe(true);
		expect(isWordChar('ñ')).toBe(true);
		expect(isWordChar('π')).toBe(true);
	});
});
