/**
 * Cursor navigation utilities
 *
 * This module provides cursor movement operations for the custom editor.
 * Properly handles Unicode including emoji and characters outside the BMP.
 */

import type { EditorState, Position } from './state';

/**
 * Word boundary pattern - supports Unicode letters and digits
 * Uses Unicode property escapes for proper internationalization
 */
const WORD_PATTERN = /[\p{L}\p{N}_]/u;

/**
 * Check if character is a word character
 * Supports Unicode identifiers (e.g., café, π, 日本語)
 */
export function isWordChar(char: string): boolean {
	if (!char || char.length === 0) return false;
	return WORD_PATTERN.test(char);
}

/**
 * Get the code point at a position in a string
 * Properly handles surrogate pairs (emoji, etc.)
 * @returns The code point string and its UTF-16 length (1 or 2)
 */
function getCodePointAt(text: string, index: number): { char: string; length: number } | null {
	if (index < 0 || index >= text.length) return null;

	const code = text.charCodeAt(index);

	// Check if this is a high surrogate (first half of a surrogate pair)
	if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
		const nextCode = text.charCodeAt(index + 1);
		// Check if next is a low surrogate (second half)
		if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
			return { char: text.slice(index, index + 2), length: 2 };
		}
	}

	return { char: text[index], length: 1 };
}

/**
 * Get the code point before a position in a string
 * Properly handles surrogate pairs (emoji, etc.)
 * @returns The code point string and its UTF-16 length (1 or 2)
 */
function getCodePointBefore(text: string, index: number): { char: string; length: number } | null {
	if (index <= 0 || index > text.length) return null;

	const code = text.charCodeAt(index - 1);

	// Check if this is a low surrogate (second half of a surrogate pair)
	if (code >= 0xdc00 && code <= 0xdfff && index >= 2) {
		const prevCode = text.charCodeAt(index - 2);
		// Check if prev is a high surrogate (first half)
		if (prevCode >= 0xd800 && prevCode <= 0xdbff) {
			return { char: text.slice(index - 2, index), length: 2 };
		}
	}

	return { char: text[index - 1], length: 1 };
}

/**
 * Navigation operations for the editor
 */
export class Navigation {
	/**
	 * Sticky column (preferred column) for vertical navigation.
	 * Remembers the column position when moving through lines of varying lengths.
	 */
	private stickyColumn: number = -1;

	constructor(private state: EditorState) {}

	/**
	 * Reset sticky column - call this when cursor moves horizontally
	 */
	private resetStickyColumn(): void {
		this.stickyColumn = -1;
	}

	/**
	 * Get the target column for vertical movement, using sticky column if set
	 */
	private getTargetColumn(currentColumn: number): number {
		if (this.stickyColumn < 0) {
			this.stickyColumn = currentColumn;
		}
		return this.stickyColumn;
	}

	// ============================================
	// Basic Movement
	// ============================================

	/**
	 * Move cursor left
	 * Properly handles Unicode surrogate pairs (emoji, etc.)
	 */
	moveLeft(extend = false): void {
		this.resetStickyColumn(); // Horizontal movement resets sticky column
		const { line, column } = this.state.cursor;

		if (column > 0) {
			const currentLine = this.state.getLine(line);
			if (currentLine) {
				// Get the code point before cursor to handle surrogate pairs
				const cp = getCodePointBefore(currentLine.text, column);
				const step = cp?.length ?? 1;
				this.moveTo({ line, column: column - step }, extend);
			} else {
				this.moveTo({ line, column: column - 1 }, extend);
			}
		} else if (line > 0) {
			// Move to end of previous line
			const prevLine = this.state.getLine(line - 1);
			if (prevLine) {
				this.moveTo({ line: line - 1, column: prevLine.text.length }, extend);
			}
		}
	}

	/**
	 * Move cursor right
	 * Properly handles Unicode surrogate pairs (emoji, etc.)
	 */
	moveRight(extend = false): void {
		this.resetStickyColumn(); // Horizontal movement resets sticky column
		const { line, column } = this.state.cursor;
		const currentLine = this.state.getLine(line);

		if (!currentLine) return;

		if (column < currentLine.text.length) {
			// Get the code point at cursor to handle surrogate pairs
			const cp = getCodePointAt(currentLine.text, column);
			const step = cp?.length ?? 1;
			this.moveTo({ line, column: column + step }, extend);
		} else if (line < this.state.lineCount - 1) {
			// Move to start of next line
			this.moveTo({ line: line + 1, column: 0 }, extend);
		}
	}

	/**
	 * Move cursor up
	 * Uses sticky column to preserve horizontal position through lines of varying lengths
	 */
	moveUp(extend = false): void {
		const { line, column } = this.state.cursor;

		if (line > 0) {
			const prevLine = this.state.getLine(line - 1);
			if (prevLine) {
				// Use sticky column to remember preferred position
				const targetColumn = this.getTargetColumn(column);
				const newColumn = Math.min(targetColumn, prevLine.text.length);
				this.moveTo({ line: line - 1, column: newColumn }, extend);
			}
		}
	}

	/**
	 * Move cursor down
	 * Uses sticky column to preserve horizontal position through lines of varying lengths
	 */
	moveDown(extend = false): void {
		const { line, column } = this.state.cursor;

		if (line < this.state.lineCount - 1) {
			const nextLine = this.state.getLine(line + 1);
			if (nextLine) {
				// Use sticky column to remember preferred position
				const targetColumn = this.getTargetColumn(column);
				const newColumn = Math.min(targetColumn, nextLine.text.length);
				this.moveTo({ line: line + 1, column: newColumn }, extend);
			}
		}
	}

	// ============================================
	// Line Movement
	// ============================================

	/**
	 * Move to start of line
	 */
	moveToLineStart(extend = false): void {
		const { line } = this.state.cursor;
		const currentLine = this.state.getLine(line);

		if (!currentLine) return;

		// Find first non-whitespace character
		const firstNonWs = currentLine.text.search(/\S/);
		const targetColumn = firstNonWs === -1 ? 0 : firstNonWs;

		// If already at first non-ws, go to column 0
		if (this.state.cursor.column === targetColumn && targetColumn > 0) {
			this.moveTo({ line, column: 0 }, extend);
		} else {
			this.moveTo({ line, column: targetColumn }, extend);
		}
	}

	/**
	 * Move to end of line
	 */
	moveToLineEnd(extend = false): void {
		const { line } = this.state.cursor;
		const currentLine = this.state.getLine(line);

		if (currentLine) {
			this.moveTo({ line, column: currentLine.text.length }, extend);
		}
	}

	// ============================================
	// Word Movement
	// ============================================

	/**
	 * Move to start of previous word
	 * Properly handles Unicode surrogate pairs (emoji, etc.)
	 */
	moveWordLeft(extend = false): void {
		const { line, column } = this.state.cursor;
		const currentLine = this.state.getLine(line);

		if (!currentLine) return;

		if (column === 0) {
			// Move to end of previous line
			if (line > 0) {
				const prevLine = this.state.getLine(line - 1);
				if (prevLine) {
					this.moveTo({ line: line - 1, column: prevLine.text.length }, extend);
				}
			}
			return;
		}

		const text = currentLine.text;
		let pos = column;

		// Skip backwards, handling surrogate pairs
		// First, skip whitespace/punctuation
		while (pos > 0) {
			const cp = getCodePointBefore(text, pos);
			if (!cp || isWordChar(cp.char)) break;
			pos -= cp.length;
		}

		// Then skip word characters
		while (pos > 0) {
			const cp = getCodePointBefore(text, pos);
			if (!cp || !isWordChar(cp.char)) break;
			pos -= cp.length;
		}

		this.moveTo({ line, column: pos }, extend);
	}

	/**
	 * Move to start of next word
	 * Properly handles Unicode surrogate pairs (emoji, etc.)
	 */
	moveWordRight(extend = false): void {
		const { line, column } = this.state.cursor;
		const currentLine = this.state.getLine(line);

		if (!currentLine) return;

		const text = currentLine.text;

		if (column >= text.length) {
			// Move to start of next line
			if (line < this.state.lineCount - 1) {
				this.moveTo({ line: line + 1, column: 0 }, extend);
			}
			return;
		}

		let pos = column;

		// Skip forwards, handling surrogate pairs
		// First, skip current word characters
		while (pos < text.length) {
			const cp = getCodePointAt(text, pos);
			if (!cp || !isWordChar(cp.char)) break;
			pos += cp.length;
		}

		// Then skip whitespace/punctuation
		while (pos < text.length) {
			const cp = getCodePointAt(text, pos);
			if (!cp || isWordChar(cp.char)) break;
			pos += cp.length;
		}

		this.moveTo({ line, column: pos }, extend);
	}

	// ============================================
	// Document Movement
	// ============================================

	/**
	 * Move to start of document
	 */
	moveToDocumentStart(extend = false): void {
		this.moveTo({ line: 0, column: 0 }, extend);
	}

	/**
	 * Move to end of document
	 */
	moveToDocumentEnd(extend = false): void {
		const lastLine = this.state.getLine(this.state.lineCount - 1);
		if (lastLine) {
			this.moveTo({ line: this.state.lineCount - 1, column: lastLine.text.length }, extend);
		}
	}

	/**
	 * Move up by a page
	 */
	movePageUp(pageSize: number, extend = false): void {
		const { line, column } = this.state.cursor;
		const targetLine = Math.max(0, line - pageSize);
		const targetLineContent = this.state.getLine(targetLine);
		const newColumn = targetLineContent ? Math.min(column, targetLineContent.text.length) : 0;

		this.moveTo({ line: targetLine, column: newColumn }, extend);
	}

	/**
	 * Move down by a page
	 */
	movePageDown(pageSize: number, extend = false): void {
		const { line, column } = this.state.cursor;
		const targetLine = Math.min(this.state.lineCount - 1, line + pageSize);
		const targetLineContent = this.state.getLine(targetLine);
		const newColumn = targetLineContent ? Math.min(column, targetLineContent.text.length) : 0;

		this.moveTo({ line: targetLine, column: newColumn }, extend);
	}

	// ============================================
	// Selection
	// ============================================

	/**
	 * Select current word
	 * Properly handles Unicode surrogate pairs (emoji, etc.)
	 */
	selectWord(): void {
		const { line, column } = this.state.cursor;
		const currentLine = this.state.getLine(line);

		if (!currentLine) return;

		const text = currentLine.text;

		// Find word boundaries, handling surrogate pairs
		let start = column;
		let end = column;

		// Find start of word
		while (start > 0) {
			const cp = getCodePointBefore(text, start);
			if (!cp || !isWordChar(cp.char)) break;
			start -= cp.length;
		}

		// Find end of word
		while (end < text.length) {
			const cp = getCodePointAt(text, end);
			if (!cp || !isWordChar(cp.char)) break;
			end += cp.length;
		}

		if (start !== end) {
			this.state.setSelection({ line, column: start }, { line, column: end });
		}
	}

	/**
	 * Select current line
	 */
	selectLine(): void {
		const { line } = this.state.cursor;
		const currentLine = this.state.getLine(line);

		if (!currentLine) return;

		// Select from start of current line to start of next line (or end of document)
		if (line < this.state.lineCount - 1) {
			this.state.setSelection({ line, column: 0 }, { line: line + 1, column: 0 });
		} else {
			this.state.setSelection({ line, column: 0 }, { line, column: currentLine.text.length });
		}
	}

	// ============================================
	// Helpers
	// ============================================

	/**
	 * Move to position, optionally extending selection
	 */
	private moveTo(position: Position, extend: boolean): void {
		if (extend) {
			this.state.extendSelection(position);
		} else {
			this.state.setCursor(position);
		}
	}

	/**
	 * Get position from mouse coordinates
	 */
	positionFromPoint(
		x: number,
		y: number,
		lineHeight: number,
		charWidth: number,
		scrollTop: number,
		scrollLeft: number,
		paddingLeft: number,
		gutterWidth: number
	): Position {
		// Calculate line from y position
		const adjustedY = y + scrollTop;
		const line = Math.max(
			0,
			Math.min(Math.floor(adjustedY / lineHeight), this.state.lineCount - 1)
		);

		// Calculate column from x position
		const adjustedX = x + scrollLeft - paddingLeft - gutterWidth;
		const column = Math.max(0, Math.round(adjustedX / charWidth));

		// Clamp to line length
		const lineContent = this.state.getLine(line);
		const maxColumn = lineContent ? lineContent.text.length : 0;

		return {
			line,
			column: Math.min(column, maxColumn)
		};
	}
}

/**
 * Create navigation helper
 */
export function createNavigation(state: EditorState): Navigation {
	return new Navigation(state);
}
