/**
 * Editor find/replace logic extracted from CustomEditor.svelte
 *
 * Factory function that creates all find/replace state and operations,
 * accepting callbacks for things it cannot own (editor state access, DOM operations).
 */

import {
	findAllMatches,
	findMatchIndexAtOrAfter,
	getNextMatchIndex,
	getPrevMatchIndex,
	replaceMatch,
	replaceAllMatches,
	type SearchMatch,
	type Position,
	type Selection
} from './core';

export interface EditorFindDeps {
	getLines: () => readonly { text: string }[];
	getLineCount: () => number;
	getSelection: () => Selection;
	setSelection: (anchor: Position, head: Position) => void;
	setCursor: (pos: Position) => void;
	setContent: (content: string) => void;
	scrollCursorIntoView: () => void;
	focusEditor: () => void;
	isReadonly: () => boolean;
}

export interface MatchRect {
	top: number;
	left: number;
	width: number;
	height: number;
	isCurrent: boolean;
}

export interface ViewportInfo {
	scrollTop: number;
	viewportHeight: number;
}

export interface MeasurementInfo {
	lineHeight: number;
	charWidth: number;
	gutterWidth: number;
	contentPadding: number;
}

export function createEditorFind(deps: EditorFindDeps) {
	let query = '';
	let replace = '';
	let caseSensitive = false;
	let useRegex = false;
	let matches: SearchMatch[] = [];
	let currentIndex = -1;

	function updateMatches(): void {
		const lines = deps.getLines();
		if (!lines || !query) {
			matches = [];
			currentIndex = -1;
			return;
		}

		matches = findAllMatches(lines, query, {
			caseSensitive,
			useRegex
		});

		if (matches.length > 0) {
			currentIndex = findMatchIndexAtOrAfter(matches, deps.getSelection().head);
		} else {
			currentIndex = -1;
		}
	}

	function setQuery(q: string): void {
		query = q;
		updateMatches();
	}

	function setReplaceText(text: string): void {
		replace = text;
	}

	function setCaseSensitive(value: boolean): void {
		caseSensitive = value;
		updateMatches();
	}

	function setUseRegex(value: boolean): void {
		useRegex = value;
		updateMatches();
	}

	function goToMatch(index: number): void {
		if (index < 0 || index >= matches.length) return;

		const match = matches[index];
		deps.setSelection(match.start, match.end);
		deps.scrollCursorIntoView();
		deps.focusEditor();
	}

	function findNext(): void {
		if (matches.length === 0) return;

		currentIndex = getNextMatchIndex(matches, currentIndex, true);
		goToMatch(currentIndex);
	}

	function findPrev(): void {
		if (matches.length === 0) return;

		currentIndex = getPrevMatchIndex(matches, currentIndex, true);
		goToMatch(currentIndex);
	}

	function doReplace(): void {
		if (deps.isReadonly() || matches.length === 0 || currentIndex < 0) return;

		const match = matches[currentIndex];
		const lines = deps.getLines();
		const result = replaceMatch(lines, match, replace);

		deps.setContent(result.newLines.join('\n'));
		deps.setCursor(result.cursorPosition);

		updateMatches();
		if (matches.length > 0) {
			currentIndex = Math.min(currentIndex, matches.length - 1);
			goToMatch(currentIndex);
		}
	}

	function doReplaceAll(): void {
		if (deps.isReadonly() || matches.length === 0) return;

		const lines = deps.getLines();
		const newLines = replaceAllMatches(lines, matches, replace);

		deps.setContent(newLines.join('\n'));

		updateMatches();
	}

	function computeMatchRects(
		viewport: ViewportInfo,
		measurements: MeasurementInfo
	): MatchRect[] {
		if (matches.length === 0) return [];

		const { scrollTop, viewportHeight } = viewport;
		const { lineHeight, charWidth, gutterWidth, contentPadding } = measurements;

		const firstVisibleLine = Math.max(0, Math.floor(scrollTop / lineHeight) - 1);
		const lineCount = deps.getLineCount();
		const lastVisibleLine = Math.min(
			lineCount - 1,
			Math.ceil((scrollTop + viewportHeight) / lineHeight) + 1
		);

		const rects: MatchRect[] = [];

		for (let i = 0; i < matches.length; i++) {
			const match = matches[i];

			if (match.line < firstVisibleLine || match.line > lastVisibleLine) continue;

			const width = (match.endColumn - match.startColumn) * charWidth;
			if (width <= 0) continue;

			rects.push({
				top: match.line * lineHeight,
				left: gutterWidth + contentPadding + match.startColumn * charWidth,
				width,
				height: lineHeight,
				isCurrent: i === currentIndex
			});
		}

		return rects;
	}

	return {
		// Getters for reactive reads
		get query() {
			return query;
		},
		get replaceText() {
			return replace;
		},
		get caseSensitive() {
			return caseSensitive;
		},
		get useRegex() {
			return useRegex;
		},
		get matches() {
			return matches;
		},
		get currentIndex() {
			return currentIndex;
		},

		// Setters / actions
		setQuery,
		setReplaceText,
		setCaseSensitive,
		setUseRegex,
		updateMatches,
		findNext,
		findPrev,
		replace: doReplace,
		replaceAll: doReplaceAll,
		computeMatchRects
	};
}

export type EditorFind = ReturnType<typeof createEditorFind>;
