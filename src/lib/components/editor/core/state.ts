/**
 * Core editor state management
 *
 * This module provides the fundamental state management for the custom editor,
 * handling document content, cursor positions, selections, and history.
 * Supports multi-cursor editing with automatic cursor merging.
 */

import type { TokenizedLine, TokenizerState } from '../tokenizer/types';
import { getTokenizer } from '../tokenizer';
import { HISTORY_GROUP_TIMEOUT_MS, MAX_HISTORY_SIZE } from '../constants';
import {
	CursorManager,
	createCursorManager,
	type Cursor,
	comparePositions,
	getSelectionStart,
	getSelectionEnd,
	isSelectionEmpty
} from './multi-cursor';

/**
 * Position in the document
 */
export interface Position {
	/** Line number (0-based) */
	line: number;
	/** Column number (0-based, represents character index in line) */
	column: number;
}

/**
 * A selection range in the document
 */
export interface Selection {
	/** Start of selection (anchor) */
	anchor: Position;
	/** End of selection (head/cursor position) */
	head: Position;
}

/**
 * A single line in the document
 */
export interface Line {
	/** Line number (0-based) */
	number: number;
	/** Raw text content */
	text: string;
	/** Tokenized content for syntax highlighting */
	tokens?: TokenizedLine;
}

/**
 * History entry for undo/redo
 */
export interface HistoryEntry {
	/** Document content before this change */
	content: string;
	/** Selection state before this change (deprecated, use cursors) */
	selection: Selection;
	/** All cursors state before this change */
	cursors?: Cursor[];
	/** Primary cursor ID */
	primaryCursorId?: string;
	/** Timestamp of the change */
	timestamp: number;
}

/**
 * Editor state configuration
 */
export interface EditorStateConfig {
	/** Initial document content */
	content?: string;
	/** Language for syntax highlighting */
	language?: string;
	/** Maximum history entries */
	maxHistorySize?: number;
	/** Tab size in spaces */
	tabSize?: number;
	/** Insert spaces instead of tabs */
	insertSpaces?: boolean;
	/** Maximum number of cursors (default: 100) */
	maxCursors?: number;
}

/**
 * Change event for document updates
 */
export interface ChangeEvent {
	/** Type of change */
	type: 'insert' | 'delete' | 'replace';
	/** Start position of change */
	from: Position;
	/** End position of change (for delete/replace) */
	to?: Position;
	/** Inserted text (for insert/replace) */
	text?: string;
	/** Removed text (for delete/replace) */
	removed?: string;
}

/**
 * Core editor state class
 */
export class EditorState {
	/** Document lines */
	private _lines: Line[] = [];

	/** Multi-cursor manager */
	private _cursorManager: CursorManager;

	/** Language for syntax highlighting */
	private _language: string;

	/** Tokenizer state for incremental tokenization */
	private _tokenizerStates: (TokenizerState | undefined)[] = [];

	/** Undo history */
	private _undoStack: HistoryEntry[] = [];

	/** Redo history */
	private _redoStack: HistoryEntry[] = [];

	/** Maximum history size */
	private maxHistorySize: number;

	/** Tab settings */
	private tabSize: number;
	private insertSpaces: boolean;

	/** Maximum listeners per type to prevent memory leaks */
	private static readonly MAX_LISTENERS = 100;

	/** Change listeners */
	private changeListeners: Set<(event: ChangeEvent) => void> = new Set();

	/** Selection change listeners */
	private selectionListeners: Set<(selection: Selection) => void> = new Set();

	/** Cursor change listeners (for multi-cursor) */
	private cursorListeners: Set<(cursors: readonly Cursor[]) => void> = new Set();

	/** Undo grouping: timestamp of last history save */
	private lastHistoryTimestamp = 0;

	/** Undo grouping: type of last change */
	private lastHistoryType: 'insert' | 'delete' | null = null;

	/** Undo grouping: time window in ms for grouping consecutive edits */
	private readonly historyGroupTimeout = HISTORY_GROUP_TIMEOUT_MS;

	/** Cached content string (invalidated on changes) */
	private _contentCache: string | null = null;

	/** Flag to suppress notifications during atomic operations (e.g., CRDT sync) */
	private _suppressNotifications = false;

	constructor(config: EditorStateConfig = {}) {
		this._language = config.language ?? 'plaintext';
		this.maxHistorySize = config.maxHistorySize ?? MAX_HISTORY_SIZE;
		this.tabSize = config.tabSize ?? 2;
		this.insertSpaces = config.insertSpaces ?? false;

		// Initialize cursor manager
		this._cursorManager = createCursorManager({
			maxCursors: config.maxCursors
		});

		// Set initial content
		this.setContent(config.content ?? '');
	}

	// ============================================
	// Content Access
	// ============================================

	/**
	 * Get all lines
	 */
	get lines(): readonly Line[] {
		return this._lines;
	}

	/**
	 * Get line count
	 */
	get lineCount(): number {
		return this._lines.length;
	}

	/**
	 * Get a specific line
	 */
	getLine(lineNumber: number): Line | undefined {
		return this._lines[lineNumber];
	}

	/**
	 * Get document content as string (cached for performance)
	 */
	getContent(): string {
		if (this._contentCache === null) {
			this._contentCache = this._lines.map((l) => l.text).join('\n');
		}
		return this._contentCache;
	}

	/**
	 * Invalidate content cache (call when lines change)
	 */
	private invalidateContentCache(): void {
		this._contentCache = null;
	}

	/**
	 * Set document content (replaces everything)
	 */
	setContent(content: string): void {
		const oldContent = this.getContent();
		// Normalize line endings: CRLF and CR to LF
		const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		const textLines = normalized.split('\n');

		this._lines = textLines.map((text, i) => ({
			number: i,
			text
		}));

		// Reset tokenizer states
		this._tokenizerStates = new Array(this._lines.length).fill(undefined);

		// Tokenize all lines
		this.retokenize(0, this._lines.length);

		// Emit change event
		if (oldContent !== content) {
			this.emitChange({
				type: 'replace',
				from: { line: 0, column: 0 },
				to: this.endPosition(),
				text: content,
				removed: oldContent
			});
		}
	}

	/**
	 * Get current language
	 */
	get language(): string {
		return this._language;
	}

	/**
	 * Set language (triggers re-tokenization)
	 */
	setLanguage(language: string): void {
		if (this._language !== language) {
			this._language = language;
			this._tokenizerStates = new Array(this._lines.length).fill(undefined);
			this.retokenize(0, this._lines.length);
		}
	}

	// ============================================
	// Selection (backward compatible - uses primary cursor)
	// ============================================

	/**
	 * Get current selection (primary cursor)
	 */
	get selection(): Selection {
		return this._cursorManager.getPrimary().selection;
	}

	/**
	 * Get cursor position (primary cursor head)
	 */
	get cursor(): Position {
		return this._cursorManager.getPrimary().selection.head;
	}

	/**
	 * Check if primary cursor has a selection
	 */
	get hasSelection(): boolean {
		return !isSelectionEmpty(this._cursorManager.getPrimary().selection);
	}

	/**
	 * Get normalized selection (start before end) for primary cursor
	 */
	get normalizedSelection(): { start: Position; end: Position } {
		const selection = this._cursorManager.getPrimary().selection;
		return {
			start: getSelectionStart(selection),
			end: getSelectionEnd(selection)
		};
	}

	/**
	 * Set cursor position (clears selection, affects primary cursor only)
	 */
	setCursor(position: Position): void {
		const clamped = this.clampPosition(position);
		this._cursorManager.setSingleCursor(clamped);
		this.emitSelectionChange();
		this.emitCursorChange();
	}

	/**
	 * Set selection range (affects primary cursor only, clears secondary cursors)
	 */
	setSelection(anchor: Position, head: Position): void {
		this._cursorManager.setSingleSelection(this.clampPosition(anchor), this.clampPosition(head));
		this.emitSelectionChange();
		this.emitCursorChange();
	}

	/**
	 * Extend selection to position (keeps anchor, primary cursor only)
	 */
	extendSelection(head: Position): void {
		const primary = this._cursorManager.getPrimary();
		this._cursorManager.extendSelection(primary.id, this.clampPosition(head));
		this.emitSelectionChange();
		this.emitCursorChange();
	}

	/**
	 * Select all
	 */
	selectAll(): void {
		this.setSelection({ line: 0, column: 0 }, this.endPosition());
	}

	/**
	 * Get selected text (primary cursor)
	 */
	getSelectedText(): string {
		return this.getTextInSelection(this._cursorManager.getPrimary().selection);
	}

	/**
	 * Get selected text from all cursors
	 * Joins multiple selections with newlines (VS Code behavior)
	 */
	getSelectedTextFromAllCursors(): string {
		const selections: string[] = [];
		for (const cursor of this._cursorManager.getSortedCursors()) {
			if (!isSelectionEmpty(cursor.selection)) {
				selections.push(this.getTextInSelection(cursor.selection));
			}
		}
		return selections.join('\n');
	}

	/**
	 * Check if any cursor has a selection
	 */
	get hasAnySelection(): boolean {
		for (const cursor of this._cursorManager.getCursors()) {
			if (!isSelectionEmpty(cursor.selection)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Get text within a selection range
	 */
	getTextInSelection(selection: Selection): string {
		if (isSelectionEmpty(selection)) {
			return '';
		}

		const start = getSelectionStart(selection);
		const end = getSelectionEnd(selection);

		if (start.line === end.line) {
			return this._lines[start.line].text.slice(start.column, end.column);
		}

		const lines: string[] = [];
		lines.push(this._lines[start.line].text.slice(start.column));
		for (let i = start.line + 1; i < end.line; i++) {
			lines.push(this._lines[i].text);
		}
		lines.push(this._lines[end.line].text.slice(0, end.column));
		return lines.join('\n');
	}

	// ============================================
	// Multi-Cursor API
	// ============================================

	/**
	 * Get cursor manager for advanced multi-cursor operations
	 */
	get cursorManager(): CursorManager {
		return this._cursorManager;
	}

	/**
	 * Get all cursors
	 */
	get allCursors(): readonly Cursor[] {
		return this._cursorManager.getCursors();
	}

	/**
	 * Get primary cursor
	 */
	get primaryCursor(): Cursor {
		return this._cursorManager.getPrimary();
	}

	/**
	 * Check if there are multiple cursors
	 */
	get hasMultipleCursors(): boolean {
		return this._cursorManager.hasMultiple;
	}

	/**
	 * Add a new cursor at position
	 */
	addCursor(position: Position, makePrimary = false): Cursor {
		const clamped = this.clampPosition(position);
		const cursor = this._cursorManager.addCursor(clamped, makePrimary);
		this.emitCursorChange();
		return cursor;
	}

	/**
	 * Add a cursor with selection
	 */
	addCursorWithSelection(anchor: Position, head: Position, makePrimary = false): Cursor {
		const cursor = this._cursorManager.addCursorWithSelection(
			this.clampPosition(anchor),
			this.clampPosition(head),
			makePrimary
		);
		this.emitCursorChange();
		return cursor;
	}

	/**
	 * Add cursor above primary cursor
	 */
	addCursorAbove(): boolean {
		const primary = this._cursorManager.getPrimary();
		const pos = primary.selection.head;

		if (pos.line <= 0) return false;

		const newLine = pos.line - 1;
		const lineText = this._lines[newLine]?.text ?? '';
		const newColumn = Math.min(pos.column, lineText.length);

		this._cursorManager.addCursor({ line: newLine, column: newColumn });
		this.emitCursorChange();
		return true;
	}

	/**
	 * Add cursor below primary cursor
	 */
	addCursorBelow(): boolean {
		const primary = this._cursorManager.getPrimary();
		const pos = primary.selection.head;

		if (pos.line >= this._lines.length - 1) return false;

		const newLine = pos.line + 1;
		const lineText = this._lines[newLine]?.text ?? '';
		const newColumn = Math.min(pos.column, lineText.length);

		this._cursorManager.addCursor({ line: newLine, column: newColumn });
		this.emitCursorChange();
		return true;
	}

	/**
	 * Remove last added secondary cursor
	 */
	removeLastCursor(): boolean {
		const result = this._cursorManager.removeLastSecondary();
		if (result) {
			this.emitCursorChange();
		}
		return result;
	}

	/**
	 * Clear all secondary cursors
	 */
	clearSecondaryCursors(): void {
		this._cursorManager.clearSecondary();
		this.emitCursorChange();
	}

	// ============================================
	// Editing Operations (Multi-Cursor Aware)
	// ============================================

	/**
	 * Insert text at all cursor positions
	 */
	insert(text: string): void {
		this.saveHistory('insert');

		// Get cursors in reverse order (bottom to top) to maintain position validity
		const cursors = this._cursorManager.getSortedCursorsReverse();

		// Store cursor updates to apply after all insertions
		const updates: Array<{ id: string; position: Position }> = [];

		for (const cursor of cursors) {
			let currentPos = cursor.selection.head;

			// Delete selection first if exists
			if (!isSelectionEmpty(cursor.selection)) {
				const start = getSelectionStart(cursor.selection);
				const end = getSelectionEnd(cursor.selection);
				this.deleteRangeInternal(start, end);
				this.transformCursorUpdatesForDelete(updates, start, end);
				currentPos = start;
			}

			// Insert text
			const newPos = this.insertAtInternal(currentPos, text);
			this.transformCursorUpdatesForInsert(updates, currentPos, text);
			updates.push({ id: cursor.id, position: newPos });
		}

		// Apply all cursor updates using batch update to avoid multiple merge/emit calls
		this._cursorManager.batchUpdateCursors(updates);

		this.emitChange({ type: 'insert', from: this.cursor, text });
		this.emitSelectionChange();
		this.emitCursorChange();
	}

	/**
	 * Insert text at a specific position (internal, doesn't update cursor)
	 * @returns New position after insert
	 */
	private insertAtInternal(position: Position, text: string): Position {
		const pos = this.clampPosition(position);
		const line = this._lines[pos.line];
		const textLines = text.split('\n');

		if (textLines.length === 1) {
			// Single line insert
			line.text = line.text.slice(0, pos.column) + text + line.text.slice(pos.column);
			// Re-tokenize from the edited line to the end of the document: the
			// tokenizer carries multi-line state (block comments, template
			// literals), so typing `/*` must propagate downward. retokenize()
			// early-exits once the carried state re-converges, so this is cheap
			// in the common single-line case.
			this.retokenize(pos.line, this._lines.length);
			return { line: pos.line, column: pos.column + text.length };
		} else {
			// Multi-line insert
			const before = line.text.slice(0, pos.column);
			const after = line.text.slice(pos.column);

			// Modify first line
			line.text = before + textLines[0];

			// Insert middle lines
			const newLines: Line[] = textLines.slice(1, -1).map((t, i) => ({
				number: pos.line + i + 1,
				text: t
			}));

			// Add last line
			newLines.push({
				number: pos.line + textLines.length - 1,
				text: textLines[textLines.length - 1] + after
			});

			// Splice in new lines
			this._lines.splice(pos.line + 1, 0, ...newLines);
			this._tokenizerStates.splice(pos.line + 1, 0, ...new Array(newLines.length).fill(undefined));

			// Renumber lines
			this.renumberLines(pos.line + 1);

			// Retokenize affected lines
			this.retokenize(pos.line, pos.line + textLines.length);

			// Return new position
			const lastLineIdx = textLines.length - 1;
			return {
				line: pos.line + lastLineIdx,
				column: textLines[lastLineIdx].length
			};
		}
	}

	/**
	 * Insert text at a specific position (public API - single cursor)
	 */
	insertAt(position: Position, text: string): void {
		this.saveHistory('insert');
		const newPos = this.insertAtInternal(position, text);
		this.setCursor(newPos);
		this.emitChange({ type: 'insert', from: position, text });
	}

	/**
	 * Delete the current selection (all cursors)
	 */
	deleteSelection(): void {
		const cursors = this._cursorManager.getSortedCursorsReverse();
		let hasAnySelection = false;

		for (const cursor of cursors) {
			if (!isSelectionEmpty(cursor.selection)) {
				hasAnySelection = true;
			}
		}

		if (!hasAnySelection) {
			return;
		}

		this.saveHistory('delete');

		const updates: Array<{ id: string; position: Position }> = [];

		for (const cursor of cursors) {
			if (!isSelectionEmpty(cursor.selection)) {
				const start = getSelectionStart(cursor.selection);
				const end = getSelectionEnd(cursor.selection);
				this.deleteRangeInternal(start, end);
				this.transformCursorUpdatesForDelete(updates, start, end);

				updates.push({ id: cursor.id, position: start });
			}
		}

		// Apply all cursor updates using batch update
		this._cursorManager.batchUpdateCursors(updates);

		this.emitChange({ type: 'delete', from: this.cursor, to: this.cursor });
		this.emitSelectionChange();
		this.emitCursorChange();
	}

	/**
	 * Delete a range of text (internal, doesn't update cursor)
	 */
	private deleteRangeInternal(from: Position, to: Position): void {
		if (from.line === to.line) {
			// Single line deletion
			const line = this._lines[from.line];
			line.text = line.text.slice(0, from.column) + line.text.slice(to.column);
			// Re-tokenize to end of document so removing a multi-line construct
			// delimiter (e.g. a closing `*/`) re-propagates state to lines below.
			this.retokenize(from.line, this._lines.length);
		} else {
			// Multi-line deletion
			const firstLine = this._lines[from.line];
			const lastLine = this._lines[to.line];

			// Merge first and last lines
			firstLine.text = firstLine.text.slice(0, from.column) + lastLine.text.slice(to.column);

			// Remove intermediate lines
			const removedCount = to.line - from.line;
			this._lines.splice(from.line + 1, removedCount);
			this._tokenizerStates.splice(from.line + 1, removedCount);

			// Renumber lines
			this.renumberLines(from.line + 1);

			// Retokenize from affected line to end
			this.retokenize(from.line, this._lines.length);
		}
	}

	/**
	 * Delete a range of text (public API - single cursor)
	 */
	deleteRange(from: Position, to: Position): void {
		this.deleteRangeInternal(from, to);
		this.setCursor(from);
	}

	/**
	 * Delete character before all cursors (backspace)
	 */
	deleteBackward(): void {
		// Check if any cursor has a selection
		const cursors = this._cursorManager.getSortedCursorsReverse();
		let hasAnySelection = false;

		for (const cursor of cursors) {
			if (!isSelectionEmpty(cursor.selection)) {
				hasAnySelection = true;
				break;
			}
		}

		if (hasAnySelection) {
			this.deleteSelection();
			return;
		}

		this.saveHistory('delete');

		const updates: Array<{ id: string; position: Position }> = [];

		for (const cursor of cursors) {
			const { line, column } = cursor.selection.head;

			if (column > 0) {
				const from = { line, column: column - 1 };
				const to = { line, column };

				// Delete within line
				const currentLine = this._lines[line];
				currentLine.text = currentLine.text.slice(0, from.column) + currentLine.text.slice(to.column);
				// Re-tokenize to end of document so deleting a multi-line construct
				// delimiter re-propagates state to lines below.
				this.retokenize(line, this._lines.length);

				this.transformCursorUpdatesForDelete(updates, from, to);
				updates.push({ id: cursor.id, position: from });
			} else if (line > 0) {
				// Join with previous line
				const prevLine = this._lines[line - 1];
				const currentLine = this._lines[line];
				const newColumn = prevLine.text.length;
				const from = { line: line - 1, column: newColumn };
				const to = { line, column: 0 };

				prevLine.text += currentLine.text;
				this._lines.splice(line, 1);
				this._tokenizerStates.splice(line, 1);
				this.renumberLines(line);
				this.retokenize(line - 1, this._lines.length);

				this.transformCursorUpdatesForDelete(updates, from, to);
				updates.push({ id: cursor.id, position: from });
			}
		}

		// Apply all cursor updates using batch update
		this._cursorManager.batchUpdateCursors(updates);

		this.emitChange({ type: 'delete', from: this.cursor, to: this.cursor });
		this.emitSelectionChange();
		this.emitCursorChange();
	}

	/**
	 * Delete character after all cursors (delete key)
	 */
	deleteForward(): void {
		// Check if any cursor has a selection
		const cursors = this._cursorManager.getSortedCursorsReverse();
		let hasAnySelection = false;

		for (const cursor of cursors) {
			if (!isSelectionEmpty(cursor.selection)) {
				hasAnySelection = true;
				break;
			}
		}

		if (hasAnySelection) {
			this.deleteSelection();
			return;
		}

		this.saveHistory('delete');

		const updates: Array<{ id: string; position: Position }> = [];

		for (const cursor of cursors) {
			const { line, column } = cursor.selection.head;
			const currentLine = this._lines[line];

			if (column < currentLine.text.length) {
				const from = { line, column };
				const to = { line, column: column + 1 };

				// Delete within line
				currentLine.text = currentLine.text.slice(0, from.column) + currentLine.text.slice(to.column);
				// Re-tokenize to end of document so deleting a multi-line construct
				// delimiter re-propagates state to lines below.
				this.retokenize(line, this._lines.length);

				this.transformCursorUpdatesForDelete(updates, from, to);
				updates.push({ id: cursor.id, position: from });
			} else if (line < this._lines.length - 1) {
				// Join with next line
				const nextLine = this._lines[line + 1];
				const from = { line, column };
				const to = { line: line + 1, column: 0 };

				currentLine.text += nextLine.text;
				this._lines.splice(line + 1, 1);
				this._tokenizerStates.splice(line + 1, 1);
				this.renumberLines(line + 1);
				this.retokenize(line, this._lines.length);

				this.transformCursorUpdatesForDelete(updates, from, to);
				updates.push({ id: cursor.id, position: from });
			}
		}

		// Apply all cursor updates using batch update
		this._cursorManager.batchUpdateCursors(updates);

		this.emitChange({ type: 'delete', from: this.cursor, to: this.cursor });
		this.emitSelectionChange();
		this.emitCursorChange();
	}

	/**
	 * Insert a new line (enter key)
	 */
	insertNewline(): void {
		this.insert('\n');
	}

	/**
	 * Insert tab
	 */
	insertTab(): void {
		const tabStr = this.insertSpaces ? ' '.repeat(this.tabSize) : '\t';
		this.insert(tabStr);
	}

	// ============================================
	// History (Undo/Redo)
	// ============================================

	/**
	 * Save current state to history with optional grouping
	 * @param changeType - Type of change for grouping consecutive edits
	 */
	private saveHistory(changeType?: 'insert' | 'delete'): void {
		const now = Date.now();

		// Check if we should merge with the last history entry
		const shouldMerge =
			changeType &&
			changeType === this.lastHistoryType &&
			this._undoStack.length > 0 &&
			now - this.lastHistoryTimestamp < this.historyGroupTimeout;

		// Save cursor state
		const cursorState = this._cursorManager.clone();

		const entry: HistoryEntry = {
			content: this.getContent(),
			selection: this.deepCopySelection(this.selection),
			cursors: cursorState.cursors,
			primaryCursorId: cursorState.primaryId,
			timestamp: now
		};

		if (shouldMerge) {
			// Keep the original restore snapshot; only extend the group's recency.
			this._undoStack[this._undoStack.length - 1].timestamp = now;
		} else {
			this._undoStack.push(entry);

			// Limit history size
			if (this._undoStack.length > this.maxHistorySize) {
				this._undoStack.shift();
			}
		}

		// Update grouping state
		this.lastHistoryTimestamp = now;
		this.lastHistoryType = changeType ?? null;

		// Clear redo stack on new edit
		this._redoStack = [];
	}

	/**
	 * Undo last change
	 */
	undo(): boolean {
		const entry = this._undoStack.pop();
		if (!entry) {
			return false;
		}

		// Save current state to redo stack
		const currentCursorState = this._cursorManager.clone();
		this._redoStack.push({
			content: this.getContent(),
			selection: this.deepCopySelection(this.selection),
			cursors: currentCursorState.cursors,
			primaryCursorId: currentCursorState.primaryId,
			timestamp: Date.now()
		});

		// Restore state
		this.setContent(entry.content);

		// Restore cursor state
		if (entry.cursors && entry.primaryCursorId) {
			this._cursorManager.restore(entry.cursors, entry.primaryCursorId);
		} else {
			// Fallback for old history entries
			this._cursorManager.setSingleSelection(entry.selection.anchor, entry.selection.head);
		}

		this.emitSelectionChange();
		this.emitCursorChange();

		return true;
	}

	/**
	 * Redo last undone change
	 */
	redo(): boolean {
		const entry = this._redoStack.pop();
		if (!entry) {
			return false;
		}

		// Save current state to undo stack (with size limit)
		const currentCursorState = this._cursorManager.clone();
		this._undoStack.push({
			content: this.getContent(),
			selection: this.deepCopySelection(this.selection),
			cursors: currentCursorState.cursors,
			primaryCursorId: currentCursorState.primaryId,
			timestamp: Date.now()
		});

		// Enforce history size limit
		while (this._undoStack.length > this.maxHistorySize) {
			this._undoStack.shift();
		}

		// Restore state
		this.setContent(entry.content);

		// Restore cursor state
		if (entry.cursors && entry.primaryCursorId) {
			this._cursorManager.restore(entry.cursors, entry.primaryCursorId);
		} else {
			// Fallback for old history entries
			this._cursorManager.setSingleSelection(entry.selection.anchor, entry.selection.head);
		}

		this.emitSelectionChange();
		this.emitCursorChange();

		return true;
	}

	/**
	 * Deep copy a selection to prevent reference issues in history
	 */
	private deepCopySelection(sel: Selection): Selection {
		return {
			anchor: { line: sel.anchor.line, column: sel.anchor.column },
			head: { line: sel.head.line, column: sel.head.column }
		};
	}

	private transformCursorUpdatesForInsert(
		updates: Array<{ id: string; position: Position }>,
		at: Position,
		text: string
	): void {
		for (const update of updates) {
			update.position = this.transformPositionForInsert(update.position, at, text);
		}
	}

	private transformPositionForInsert(position: Position, at: Position, text: string): Position {
		if (comparePositions(position, at) < 0) {
			return position;
		}

		const textLines = text.split('\n');
		const insertedLineCount = textLines.length - 1;

		if (insertedLineCount === 0) {
			if (position.line !== at.line) {
				return position;
			}

			return { line: position.line, column: position.column + text.length };
		}

		if (position.line === at.line) {
			return {
				line: position.line + insertedLineCount,
				column: textLines[textLines.length - 1].length + position.column - at.column
			};
		}

		return { line: position.line + insertedLineCount, column: position.column };
	}

	private transformCursorUpdatesForDelete(
		updates: Array<{ id: string; position: Position }>,
		from: Position,
		to: Position
	): void {
		for (const update of updates) {
			update.position = this.transformPositionForDelete(update.position, from, to);
		}
	}

	private transformPositionForDelete(position: Position, from: Position, to: Position): Position {
		if (comparePositions(position, from) <= 0) {
			return position;
		}

		if (comparePositions(position, to) <= 0) {
			return from;
		}

		if (from.line === to.line) {
			if (position.line !== from.line) {
				return position;
			}

			return { line: position.line, column: position.column - (to.column - from.column) };
		}

		if (position.line === to.line) {
			return {
				line: from.line,
				column: from.column + position.column - to.column
			};
		}

		return { line: position.line - (to.line - from.line), column: position.column };
	}

	/**
	 * Check if undo is available
	 */
	get canUndo(): boolean {
		return this._undoStack.length > 0;
	}

	/**
	 * Check if redo is available
	 */
	get canRedo(): boolean {
		return this._redoStack.length > 0;
	}

	// ============================================
	// Tokenization
	// ============================================

	/**
	 * Compare two tokenizer states for equality
	 */
	private tokenizerStatesEqual(a?: TokenizerState, b?: TokenizerState): boolean {
		if (a === b) return true;
		if (!a || !b) return a === b;

		const aKeys = Object.keys(a).filter((key) => a[key as keyof TokenizerState] !== undefined).sort();
		const bKeys = Object.keys(b).filter((key) => b[key as keyof TokenizerState] !== undefined).sort();
		if (aKeys.length !== bKeys.length) return false;

		for (let i = 0; i < aKeys.length; i++) {
			const key = aKeys[i];
			if (key !== bKeys[i]) return false;
			if (!this.tokenizerStateValuesEqual(a[key as keyof TokenizerState], b[key as keyof TokenizerState])) {
				return false;
			}
		}

		return true;
	}

	private tokenizerStateValuesEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		if (typeof a !== typeof b) return false;
		if (a === null || b === null) return a === b;
		if (typeof a !== 'object' || typeof b !== 'object') return false;
		if (Array.isArray(a) || Array.isArray(b)) {
			if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
			return a.every((value, index) => this.tokenizerStateValuesEqual(value, b[index]));
		}

		const aRecord = a as Record<string, unknown>;
		const bRecord = b as Record<string, unknown>;
		const aKeys = Object.keys(aRecord).filter((key) => aRecord[key] !== undefined).sort();
		const bKeys = Object.keys(bRecord).filter((key) => bRecord[key] !== undefined).sort();
		if (aKeys.length !== bKeys.length) return false;

		for (let i = 0; i < aKeys.length; i++) {
			const key = aKeys[i];
			if (key !== bKeys[i]) return false;
			if (!this.tokenizerStateValuesEqual(aRecord[key], bRecord[key])) return false;
		}

		return true;
	}

	/**
	 * Re-tokenize a range of lines with early-exit optimization
	 */
	private retokenize(startLine: number, endLine: number): void {
		const tokenizer = getTokenizer(this._language);
		let state = startLine > 0 ? this._tokenizerStates[startLine - 1] : tokenizer.getInitialState();

		for (let i = startLine; i < endLine && i < this._lines.length; i++) {
			const line = this._lines[i];
			const oldState = this._tokenizerStates[i];
			const tokenized = tokenizer.tokenizeLine(line.text, i + 1, state);
			line.tokens = tokenized;
			state = tokenized.state;

			// Early exit: if state unchanged from what was stored, subsequent lines are unchanged
			if (i > startLine && this.tokenizerStatesEqual(oldState, state)) {
				break;
			}

			this._tokenizerStates[i] = state;
		}
	}

	// ============================================
	// Helpers
	// ============================================

	/**
	 * Clamp a position to valid document bounds
	 */
	private clampPosition(pos: Position): Position {
		const line = Math.max(0, Math.min(pos.line, this._lines.length - 1));
		const lineText = this._lines[line]?.text ?? '';
		const column = Math.max(0, Math.min(pos.column, lineText.length));
		return { line, column };
	}

	/**
	 * Get end position of document
	 */
	private endPosition(): Position {
		if (this._lines.length === 0) {
			return { line: 0, column: 0 };
		}
		const lastLine = this._lines.length - 1;
		return { line: lastLine, column: this._lines[lastLine].text.length };
	}

	/**
	 * Renumber lines from a starting point
	 */
	private renumberLines(startFrom: number): void {
		for (let i = startFrom; i < this._lines.length; i++) {
			this._lines[i].number = i;
		}
	}

	// ============================================
	// Event Listeners
	// ============================================

	/**
	 * Helper to add a listener with overflow protection
	 * In development mode, throws an error to catch memory leaks early.
	 * In production, warns and evicts the oldest listener.
	 */
	private addListener<T>(listeners: Set<T>, callback: T, name: string): () => void {
		if (listeners.size >= EditorState.MAX_LISTENERS) {
			const msg = `[EditorState] Maximum ${name} listener count (${EditorState.MAX_LISTENERS}) exceeded. Possible memory leak - ensure listeners are unsubscribed.`;

			// Fail fast in development to catch bugs early
			if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
				throw new Error(msg);
			}

			// In production, warn and auto-cleanup oldest listener
			console.warn(msg);
			const firstListener = listeners.values().next().value;
			if (firstListener) {
				listeners.delete(firstListener);
			}
		}
		listeners.add(callback);
		return () => listeners.delete(callback);
	}

	/**
	 * Add change listener
	 */
	onContentChange(callback: (event: ChangeEvent) => void): () => void {
		return this.addListener(this.changeListeners, callback, 'change');
	}

	/**
	 * Add selection change listener
	 */
	onSelectionChange(callback: (selection: Selection) => void): () => void {
		return this.addListener(this.selectionListeners, callback, 'selection');
	}

	/**
	 * Add cursor change listener (for multi-cursor updates)
	 */
	onCursorChange(callback: (cursors: readonly Cursor[]) => void): () => void {
		return this.addListener(this.cursorListeners, callback, 'cursor');
	}

	private emitChange(event: ChangeEvent): void {
		// Invalidate cache when content changes
		this.invalidateContentCache();

		if (this._suppressNotifications) return;

		for (const listener of this.changeListeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('[EditorState] Change listener failed:', error);
			}
		}
	}

	private emitSelectionChange(): void {
		if (this._suppressNotifications) return;

		const selection = this.selection;
		for (const listener of this.selectionListeners) {
			try {
				listener(selection);
			} catch (error) {
				console.error('[EditorState] Selection listener failed:', error);
			}
		}
	}

	private emitCursorChange(): void {
		if (this._suppressNotifications) return;

		const cursors = this._cursorManager.getCursors();
		for (const listener of this.cursorListeners) {
			try {
				listener(cursors);
			} catch (error) {
				console.error('[EditorState] Cursor listener failed:', error);
			}
		}
	}

	/**
	 * Run a function with notifications suppressed.
	 * Useful for atomic operations like CRDT sync where we want to
	 * update content and selection without triggering intermediate events.
	 */
	runWithoutNotifications<T>(fn: () => T): T {
		const wasSupressed = this._suppressNotifications;
		this._suppressNotifications = true;
		try {
			return fn();
		} finally {
			this._suppressNotifications = wasSupressed;
		}
	}
}

/**
 * Create editor state
 */
export function createEditorState(config?: EditorStateConfig): EditorState {
	return new EditorState(config);
}
