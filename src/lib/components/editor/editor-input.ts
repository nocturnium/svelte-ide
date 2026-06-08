/**
 * Editor input handling — keyboard, mouse, clipboard, IME, focus, and measurement.
 *
 * Extracted from CustomEditor.svelte to keep the component focused on rendering.
 * All handlers are created via a factory that receives dependency callbacks so the
 * module remains framework-agnostic and testable.
 */

import type { EditorState, Position, Selection, Cursor } from './core';
import type { createNavigation, createKeyboardHandler, FoldManager } from './core';
import { selectNextOccurrence, selectAllOccurrences } from './editor-multicursor';
import { CONTENT_PADDING, DEFAULT_FONT_SIZE, LINE_HEIGHT_MULTIPLIER } from './constants';

// ---------------------------------------------------------------------------
// Dependency interface
// ---------------------------------------------------------------------------

export interface EditorInputDeps {
	// State access
	getEditorState: () => EditorState;
	getNavigation: () => ReturnType<typeof createNavigation>;
	getKeyboardHandler: () => ReturnType<typeof createKeyboardHandler>;
	getFoldManager: () => FoldManager;

	// DOM refs
	getEditorContent: () => HTMLDivElement | null;
	getHiddenInput: () => HTMLTextAreaElement | null;
	getMeasureSpan: () => HTMLSpanElement | null;

	// State queries
	isReadonly: () => boolean;
	isMultiCursor: () => boolean;
	isFolding: () => boolean;
	hasMultipleCursors: () => boolean;
	getSelection: () => Selection;
	getCursors: () => readonly Cursor[];
	getScrollPosition: () => { scrollTop: number; scrollLeft: number };
	getMeasurements: () => { charWidth: number; lineHeight: number; gutterWidth: number };
	/**
	 * Editor tab size (columns per tab stop). Optional for backwards
	 * compatibility; when omitted, DEFAULT_TAB_SIZE is used. Needed so that
	 * mouse hit-testing expands tabs to the correct visual width.
	 */
	getTabSize?: () => number;

	// Callbacks into CustomEditor
	onOpenFind: (withReplace: boolean) => void;
	onCloseFind: () => void;
	onFindNext: () => void;
	onFindPrev: () => void;
	onFoldCurrent: () => void;
	onUnfoldCurrent: () => void;
	onFoldAll: () => void;
	onUnfoldAll: () => void;
	onSelectNextOccurrence: () => void;
	onSelectAllOccurrences: () => void;
	onShowCommandPalette: () => void;
	onSave: (() => void) | undefined;
	announce: (message: string) => void;
	resetCursorBlink: () => void;
	stopCursorBlink: () => void;

	// Mutable state setters
	setCharWidth: (w: number) => void;
	setLineHeight: (h: number) => void;
	setScrollTop: (v: number) => void;
	setScrollLeft: (v: number) => void;
	setCursorVisible: (v: boolean) => void;

	// Search state
	isShowFindReplace: () => boolean;
	getSearchQuery: () => string;
	getSearchMatchCount: () => number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Fallback tab size used when deps.getTabSize is not provided. */
const DEFAULT_TAB_SIZE = 4;

export function createEditorInput(deps: EditorInputDeps) {
	// ---- internal mutable state ----
	let isMouseDown = false;
	let _isDragging = false;
	let isComposing = false;
	let boundMouseMove: ((e: MouseEvent) => void) | null = null;
	let boundMouseUp: (() => void) | null = null;

	/**
	 * Map a horizontal pixel offset (relative to the start of the text content,
	 * scroll already applied) to a character column on a line, expanding tabs to
	 * the next tab stop. A tab occupies `tabSize - (visualCol % tabSize)` columns
	 * worth of width. We pick the column whose character boundary is nearest the
	 * target x by tracking the visual width consumed character-by-character.
	 *
	 * Perfect proportional measurement (emoji, CJK wide glyphs) is not attempted;
	 * tabs are the dominant source of mis-clicks and are handled exactly.
	 */
	function columnFromX(lineText: string, x: number, charWidth: number, tabSize: number): number {
		if (charWidth <= 0) return 0;
		if (x <= 0) return 0;

		let visualCol = 0; // visual column in "cells" (each cell == charWidth px)
		for (let i = 0; i < lineText.length; i++) {
			const cellsForChar = lineText[i] === '\t' ? tabSize - (visualCol % tabSize) : 1;
			const startPx = visualCol * charWidth;
			const widthPx = cellsForChar * charWidth;
			// If x falls within the first half of this character's width, the
			// click belongs to column i; otherwise it moves past it.
			if (x < startPx + widthPx / 2) {
				return i;
			}
			visualCol += cellsForChar;
		}
		return lineText.length;
	}

	// ------------------------------------------------------------------
	// Measurement
	// ------------------------------------------------------------------

	function measureCharacter(): void {
		const measureSpan = deps.getMeasureSpan();
		if (!measureSpan) return;

		measureSpan.textContent = 'M';
		const rect = measureSpan.getBoundingClientRect();
		deps.setCharWidth(rect.width || 8);

		// Use computed line-height from CSS, not character bounding box height
		const computedStyle = window.getComputedStyle(measureSpan);
		const computedLineHeight = parseFloat(computedStyle.lineHeight);

		if (isNaN(computedLineHeight)) {
			const fontSize = parseFloat(computedStyle.fontSize) || DEFAULT_FONT_SIZE;
			deps.setLineHeight(Math.ceil(fontSize * LINE_HEIGHT_MULTIPLIER));
		} else {
			deps.setLineHeight(Math.ceil(computedLineHeight));
		}
	}

	// ------------------------------------------------------------------
	// Mouse helpers
	// ------------------------------------------------------------------

	function getPositionFromMouse(e: MouseEvent): Position {
		const editorContent = deps.getEditorContent();
		if (!editorContent) return { line: 0, column: 0 };

		const { charWidth, lineHeight, gutterWidth } = deps.getMeasurements();
		const { scrollTop, scrollLeft } = deps.getScrollPosition();

		const rect = editorContent.getBoundingClientRect();
		const x = e.clientX - rect.left - gutterWidth - CONTENT_PADDING;
		const y = e.clientY - rect.top;

		const editorState = deps.getEditorState();
		const line = Math.max(
			0,
			Math.min(Math.floor((y + scrollTop) / lineHeight), editorState.lineCount - 1)
		);
		const lineContent = editorState.getLine(line);
		const lineText = lineContent?.text ?? '';
		const tabSize = deps.getTabSize?.() ?? DEFAULT_TAB_SIZE;

		// Map the pixel offset to a column, expanding tabs to tab stops so that
		// clicks on lines containing tabs land on the intended character.
		const column = columnFromX(lineText, x + scrollLeft, charWidth, tabSize);

		return { line, column };
	}

	// ------------------------------------------------------------------
	// Mouse handlers
	// ------------------------------------------------------------------

	function handleMouseDown(e: MouseEvent): void {
		if (e.button !== 0) return;

		e.preventDefault();
		deps.getHiddenInput()?.focus();

		isMouseDown = true;
		_isDragging = false;

		// Attach global listeners only when drag starts (per-instance scoping)
		if (!boundMouseMove) {
			boundMouseMove = (ev: MouseEvent) => handleMouseMove(ev);
			boundMouseUp = () => handleMouseUp();
			window.addEventListener('mousemove', boundMouseMove);
			window.addEventListener('mouseup', boundMouseUp);
		}

		const pos = getPositionFromMouse(e);
		const editorState = deps.getEditorState();
		const navigation = deps.getNavigation();

		if (e.shiftKey) {
			editorState.extendSelection(pos);
		} else if (e.altKey && deps.isMultiCursor() && !e.shiftKey) {
			// Alt+Click - add a new cursor
			editorState.addCursor(pos);
		} else if (e.detail === 2) {
			// Double click - select word
			editorState.setCursor(pos);
			navigation.selectWord();
		} else if (e.detail === 3) {
			// Triple click - select line
			editorState.setCursor(pos);
			navigation.selectLine();
		} else {
			editorState.setCursor(pos);
		}
	}

	function handleMouseMove(e: MouseEvent): void {
		if (!isMouseDown) return;

		_isDragging = true;
		const pos = getPositionFromMouse(e);
		deps.getEditorState().extendSelection(pos);
	}

	function handleMouseUp(): void {
		isMouseDown = false;
		_isDragging = false;

		// Remove global listeners when drag ends
		if (boundMouseMove) {
			window.removeEventListener('mousemove', boundMouseMove);
			boundMouseMove = null;
		}
		if (boundMouseUp) {
			window.removeEventListener('mouseup', boundMouseUp);
			boundMouseUp = null;
		}
	}

	function cleanupGlobalListeners(): void {
		if (boundMouseMove) {
			window.removeEventListener('mousemove', boundMouseMove);
			boundMouseMove = null;
		}
		if (boundMouseUp) {
			window.removeEventListener('mouseup', boundMouseUp);
			boundMouseUp = null;
		}
	}

	// ------------------------------------------------------------------
	// Keyboard
	// ------------------------------------------------------------------

	function handleKeyDown(e: KeyboardEvent): void {
		// Don't process keyboard shortcuts during IME composition
		if (isComposing) return;

		const isMod = e.ctrlKey || e.metaKey;
		const editorState = deps.getEditorState();

		// Find/Replace shortcuts
		if (isMod && e.key === 'f') {
			e.preventDefault();
			deps.onOpenFind(false);
			return;
		}

		if (isMod && e.key === 'h') {
			e.preventDefault();
			deps.onOpenFind(true);
			return;
		}

		// Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
		if (isMod && e.shiftKey && e.key.toLowerCase() === 'p') {
			e.preventDefault();
			deps.onShowCommandPalette();
			return;
		}

		if (e.key === 'F3' || (isMod && e.key === 'g')) {
			e.preventDefault();
			if (deps.isShowFindReplace() && deps.getSearchMatchCount() > 0) {
				if (e.shiftKey) {
					deps.onFindPrev();
				} else {
					deps.onFindNext();
				}
			} else if (deps.getSearchQuery()) {
				// Re-open find with last query
				deps.onOpenFind(false);
			}
			return;
		}

		if (e.key === 'Escape' && deps.isShowFindReplace()) {
			e.preventDefault();
			deps.onCloseFind();
			return;
		}

		// Folding shortcuts (Ctrl+Shift+[ and Ctrl+Shift+])
		if (deps.isFolding() && isMod && e.shiftKey) {
			if (e.key === '[' || e.code === 'BracketLeft') {
				e.preventDefault();
				deps.onFoldCurrent();
				return;
			}
			if (e.key === ']' || e.code === 'BracketRight') {
				e.preventDefault();
				deps.onUnfoldCurrent();
				return;
			}
		}

		// Ctrl+Alt+[ for fold all, Ctrl+Alt+] for unfold all
		if (deps.isFolding() && isMod && e.altKey && !e.shiftKey) {
			if (e.key === '[' || e.code === 'BracketLeft') {
				e.preventDefault();
				deps.onFoldAll();
				deps.announce('Collapsed all foldable regions');
				return;
			}
			if (e.key === ']' || e.code === 'BracketRight') {
				e.preventDefault();
				deps.onUnfoldAll();
				deps.announce('Expanded all foldable regions');
				return;
			}
		}

		// Multi-cursor shortcuts
		if (deps.isMultiCursor()) {
			// Escape to clear secondary cursors
			if (e.key === 'Escape' && deps.hasMultipleCursors()) {
				e.preventDefault();
				editorState.clearSecondaryCursors();
				return;
			}

			// Ctrl+Alt+Up/Down to add cursors above/below
			if (isMod && e.altKey && !e.shiftKey) {
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					editorState.addCursorAbove();
					return;
				}
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					editorState.addCursorBelow();
					return;
				}
			}

			// Ctrl+U to remove last cursor
			if (isMod && e.key === 'u' && !e.shiftKey && !e.altKey) {
				e.preventDefault();
				editorState.removeLastCursor();
				return;
			}

			// Ctrl+D to select next occurrence
			if (isMod && e.key === 'd' && !e.shiftKey && !e.altKey) {
				e.preventDefault();
				selectNextOccurrence(editorState);
				return;
			}

			// Ctrl+Shift+L to select all occurrences
			if (isMod && e.shiftKey && e.key === 'l') {
				e.preventDefault();
				selectAllOccurrences(editorState);
				return;
			}

			// Ctrl+S to save
			if (isMod && e.key === 's') {
				e.preventDefault();
				if (deps.onSave) {
					deps.onSave();
				}
				return;
			}
		}

		// Let keyboard handler process it
		const handled = deps.getKeyboardHandler().handleKeyDown(e, deps.isReadonly());

		if (
			!handled &&
			!deps.isReadonly() &&
			e.key.length === 1 &&
			!e.ctrlKey &&
			!e.metaKey &&
			!e.altKey
		) {
			// Regular character input - handled by input event
		}
	}

	// ------------------------------------------------------------------
	// Text input / IME
	// ------------------------------------------------------------------

	function handleInput(e: Event): void {
		if (deps.isReadonly()) return;
		// Don't process input during IME composition - wait for compositionend
		if (isComposing) return;

		const target = e.target as HTMLTextAreaElement;
		const inputText = target.value;

		if (inputText) {
			deps.getEditorState().insert(inputText);
			target.value = '';
		}
	}

	function handleCompositionStart(): void {
		isComposing = true;
	}

	function handleCompositionEnd(e: CompositionEvent): void {
		isComposing = false;
		if (deps.isReadonly()) return;

		// Insert the composed text
		const composedText = e.data;
		if (composedText) {
			deps.getEditorState().insert(composedText);
		}

		// Clear the hidden input
		const hiddenInput = deps.getHiddenInput();
		if (hiddenInput) {
			hiddenInput.value = '';
		}
	}

	// ------------------------------------------------------------------
	// Clipboard
	// ------------------------------------------------------------------

	function handlePaste(e: ClipboardEvent): void {
		if (deps.isReadonly()) return;

		e.preventDefault();
		const text = e.clipboardData?.getData('text/plain');
		if (text) {
			deps.getEditorState().insert(text);
		}
	}

	function handleCopy(e: ClipboardEvent): void {
		e.preventDefault();

		const editorState = deps.getEditorState();
		const selection = deps.getSelection();
		const cursors = deps.getCursors();

		// Multi-cursor: if any cursor has a selection, copy from all cursors
		if (editorState.hasAnySelection) {
			const text = editorState.getSelectedTextFromAllCursors();
			e.clipboardData?.setData('text/plain', text);
		} else if (deps.hasMultipleCursors()) {
			// Multiple cursors with no selection: copy line at each cursor
			const lines = cursors.map((c) => editorState.getLine(c.selection.head.line)?.text ?? '');
			e.clipboardData?.setData('text/plain', lines.join('\n') + '\n');
		} else {
			// Single cursor with no selection: copy the entire current line
			const line = editorState.getLine(selection.head.line);
			const lineText = (line?.text ?? '') + '\n';
			e.clipboardData?.setData('text/plain', lineText);
		}
	}

	function handleCut(e: ClipboardEvent): void {
		if (deps.isReadonly()) return;

		e.preventDefault();

		const editorState = deps.getEditorState();
		const selection = deps.getSelection();
		const cursors = deps.getCursors();

		// Multi-cursor: if any cursor has a selection, cut from all cursors
		if (editorState.hasAnySelection) {
			const text = editorState.getSelectedTextFromAllCursors();
			e.clipboardData?.setData('text/plain', text);
			editorState.deleteSelection();
		} else if (deps.hasMultipleCursors()) {
			// Multiple cursors with no selection: cut line at each cursor
			const lines = cursors.map((c) => editorState.getLine(c.selection.head.line)?.text ?? '');
			e.clipboardData?.setData('text/plain', lines.join('\n') + '\n');

			// Select and delete each line (in reverse order to maintain positions)
			const sortedCursors = [...cursors].sort(
				(a, b) => b.selection.head.line - a.selection.head.line
			);
			for (const cursor of sortedCursors) {
				const lineNum = cursor.selection.head.line;
				const line = editorState.getLine(lineNum);
				const lineStart = { line: lineNum, column: 0 };
				const lineEnd =
					lineNum < editorState.lineCount - 1
						? { line: lineNum + 1, column: 0 }
						: { line: lineNum, column: line?.text.length ?? 0 };
				editorState.cursorManager.setSelection(cursor.id, lineStart, lineEnd);
			}
			editorState.deleteSelection();
		} else {
			// Single cursor with no selection: cut the entire current line
			const lineNum = selection.head.line;
			const line = editorState.getLine(lineNum);
			const lineText = (line?.text ?? '') + '\n';
			e.clipboardData?.setData('text/plain', lineText);

			// Delete the entire line
			const lineStart = { line: lineNum, column: 0 };
			const lineEnd =
				lineNum < editorState.lineCount - 1
					? { line: lineNum + 1, column: 0 }
					: { line: lineNum, column: line?.text.length ?? 0 };
			editorState.setSelection(lineStart, lineEnd);
			editorState.deleteSelection();
		}
	}

	// ------------------------------------------------------------------
	// Scroll
	// ------------------------------------------------------------------

	function handleScroll(e: Event): void {
		const target = e.target as HTMLElement;
		deps.setScrollTop(target.scrollTop);
		deps.setScrollLeft(target.scrollLeft);
	}

	// ------------------------------------------------------------------
	// Focus
	// ------------------------------------------------------------------

	function handleFocus(): void {
		deps.resetCursorBlink();
	}

	function handleBlur(): void {
		deps.stopCursorBlink();
		deps.setCursorVisible(false);
	}

	// ------------------------------------------------------------------
	// Public API
	// ------------------------------------------------------------------

	return {
		handleMouseDown,
		handleKeyDown,
		handleInput,
		handlePaste,
		handleCopy,
		handleCut,
		handleScroll,
		handleFocus,
		handleBlur,
		handleCompositionStart,
		handleCompositionEnd,
		measureCharacter,
		cleanupGlobalListeners
	};
}
