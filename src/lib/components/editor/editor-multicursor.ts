/**
 * Multi-cursor selection helpers extracted from CustomEditor.
 * Pure functions that operate on EditorState.
 */

import type { EditorState, Position } from './core';
import { findAllMatches, getSelectionStart, getSelectionEnd, isSelectionEmpty } from './core';
import type { SearchMatch } from './core';

/**
 * Test whether a character is a word character (\w). Used to enforce whole-word
 * boundaries so that selecting `foo` does not also land cursors inside `foobar`.
 */
function isWordChar(c: string | undefined): boolean {
	return c !== undefined && /\w/.test(c);
}

/**
 * Find all matches of `searchText` across the document.
 *
 * - When `wholeWord` is true, matches are filtered so that the characters
 *   immediately before and after the match are NOT word characters. This is the
 *   "select word under cursor" behaviour where `foo` should not match `foobar`.
 * - Multi-line search text (containing a newline) is the caller's responsibility
 *   to handle; this helper only ever sees single-line search text because the
 *   per-line search engine cannot span lines.
 */
function findOccurrences(
	state: EditorState,
	searchText: string,
	wholeWord: boolean
): SearchMatch[] {
	const matches = findAllMatches(state.lines, searchText, {
		caseSensitive: true,
		useRegex: false
	});

	if (!wholeWord) return matches;

	if (!isWordChar(searchText[0]) && !isWordChar(searchText[searchText.length - 1])) {
		// The search text is not bounded by word characters at all (e.g. an
		// operator or punctuation), so word-boundary filtering is meaningless.
		return matches;
	}

	return matches.filter((m) => {
		const lineText = state.getLine(m.start.line)?.text ?? '';
		const before = m.start.column > 0 ? lineText[m.start.column - 1] : undefined;
		const after = lineText[m.end.column];
		return !isWordChar(before) && !isWordChar(after);
	});
}

/**
 * Get word at cursor position
 */
export function getWordAtPosition(state: EditorState, pos: Position): { text: string; start: Position; end: Position } | null {
	const line = state.getLine(pos.line);
	if (!line) return null;

	const text = line.text;
	if (!text || pos.column >= text.length) return null;

	// Find word boundaries
	let start = pos.column;
	let end = pos.column;

	const isWordChar = (c: string) => /\w/.test(c);

	// Move start backwards
	while (start > 0 && isWordChar(text[start - 1])) {
		start--;
	}

	// Move end forwards
	while (end < text.length && isWordChar(text[end])) {
		end++;
	}

	if (start === end) return null;

	return {
		text: text.slice(start, end),
		start: { line: pos.line, column: start },
		end: { line: pos.line, column: end }
	};
}

/**
 * Select next occurrence of current word/selection (Ctrl+D)
 */
export function selectNextOccurrence(state: EditorState): void {
	if (!state) return;

	const primary = state.primaryCursor;
	let searchText: string;
	// Whole-word matching only applies to the implicit "word under cursor" case;
	// an explicit selection should match exactly as selected (substring).
	let wholeWord = false;

	// Get text to search for
	if (!isSelectionEmpty(primary.selection)) {
		// Use current selection
		searchText = state.getTextInSelection(primary.selection);
	} else {
		// Select word at cursor first
		const word = getWordAtPosition(state, primary.selection.head);
		if (!word) return;

		searchText = word.text;
		wholeWord = true;

		// Select the word under cursor for the primary cursor
		state.cursorManager.setSelection(
			primary.id,
			word.start,
			word.end
		);
	}

	if (!searchText) return;

	// A multi-line selection cannot be matched by the per-line search engine, so
	// bail out cleanly rather than silently searching for the (never-found) text.
	if (searchText.includes('\n')) return;

	// Find all matches (whole-word filtered for the word-under-cursor case)
	const matches = findOccurrences(state, searchText, wholeWord);

	if (matches.length === 0) return;

	// Get all current cursor positions to find next unselected match
	const currentCursors = state.allCursors;

	// Find next match after the last cursor that isn't already selected
	let lastCursorEnd = { line: 0, column: 0 };
	for (const cursor of currentCursors) {
		const end = getSelectionEnd(cursor.selection);
		if (end.line > lastCursorEnd.line ||
			(end.line === lastCursorEnd.line && end.column > lastCursorEnd.column)) {
			lastCursorEnd = end;
		}
	}

	// Find next match
	let foundMatch: typeof matches[0] | null = null;
	for (const match of matches) {
		const matchStart = match.start;
		if (matchStart.line > lastCursorEnd.line ||
			(matchStart.line === lastCursorEnd.line && matchStart.column >= lastCursorEnd.column)) {
			// Check if this match is already covered by a cursor
			const alreadySelected = currentCursors.some(cursor => {
				const start = getSelectionStart(cursor.selection);
				return start.line === matchStart.line && start.column === matchStart.column;
			});

			if (!alreadySelected) {
				foundMatch = match;
				break;
			}
		}
	}

	// If no match found after last cursor, wrap around
	if (!foundMatch) {
		for (const match of matches) {
			const matchStart = match.start;
			const alreadySelected = currentCursors.some(cursor => {
				const start = getSelectionStart(cursor.selection);
				return start.line === matchStart.line && start.column === matchStart.column;
			});

			if (!alreadySelected) {
				foundMatch = match;
				break;
			}
		}
	}

	if (foundMatch) {
		state.addCursorWithSelection(foundMatch.start, foundMatch.end);
	}
}

/**
 * Select all occurrences of current word/selection (Ctrl+Shift+L)
 */
export function selectAllOccurrences(state: EditorState): void {
	if (!state) return;

	const primary = state.primaryCursor;
	let searchText: string;
	// Whole-word matching only applies to the implicit "word under cursor" case.
	let wholeWord = false;

	// Get text to search for
	if (!isSelectionEmpty(primary.selection)) {
		searchText = state.getTextInSelection(primary.selection);
	} else {
		const word = getWordAtPosition(state, primary.selection.head);
		if (!word) return;

		searchText = word.text;
		wholeWord = true;

		// Select the word under cursor for the primary cursor
		state.cursorManager.setSelection(
			primary.id,
			word.start,
			word.end
		);
	}

	if (!searchText) return;

	// A multi-line selection cannot be matched by the per-line search engine.
	if (searchText.includes('\n')) return;

	// Find all matches (whole-word filtered for the word-under-cursor case)
	const matches = findOccurrences(state, searchText, wholeWord);

	if (matches.length <= 1) return;

	// Add cursors at all other matches
	for (const match of matches) {
		const matchStart = match.start;

		// Skip the primary cursor's position
		const primaryStart = getSelectionStart(primary.selection);
		if (matchStart.line === primaryStart.line && matchStart.column === primaryStart.column) {
			continue;
		}

		state.addCursorWithSelection(match.start, match.end);
	}
}
