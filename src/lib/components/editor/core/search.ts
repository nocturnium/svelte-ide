/**
 * Search utilities for find and replace functionality
 */

import type { Position } from './state';

export interface SearchMatch {
	/** Start position of match */
	start: Position;
	/** End position of match */
	end: Position;
	/** The matched text */
	text: string;
	/** Line index (0-based) */
	line: number;
	/** Start column in line */
	startColumn: number;
	/** End column in line */
	endColumn: number;
}

export interface SearchOptions {
	/** Case sensitive search */
	caseSensitive?: boolean;
	/** Use regular expression */
	useRegex?: boolean;
	/** Wrap around when reaching end of document */
	wrapAround?: boolean;
}

export interface SearchState {
	/** Current search query */
	query: string;
	/** Search options */
	options: SearchOptions;
	/** All matches in document */
	matches: SearchMatch[];
	/** Current match index (0-based) */
	currentIndex: number;
}

/**
 * Create initial search state
 */
export function createSearchState(): SearchState {
	return {
		query: '',
		options: {
			caseSensitive: false,
			useRegex: false,
			wrapAround: true
		},
		matches: [],
		currentIndex: -1
	};
}

/**
 * Find all matches in content
 */
export function findAllMatches(
	lines: readonly { text: string }[],
	query: string,
	options: SearchOptions = {}
): SearchMatch[] {
	if (!query) return [];

	const matches: SearchMatch[] = [];
	const { caseSensitive = false, useRegex = false } = options;

	let searchPattern: RegExp;

	try {
		if (useRegex) {
			searchPattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
		} else {
			// Escape regex special characters for literal search
			const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			searchPattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
		}
	} catch {
		// Invalid regex - return empty matches
		return [];
	}

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const text = line.text;

		let match: RegExpExecArray | null;
		// Reset lastIndex for each line
		searchPattern.lastIndex = 0;

		while ((match = searchPattern.exec(text)) !== null) {
			const startColumn = match.index;
			const endColumn = match.index + match[0].length;

			matches.push({
				start: { line: lineIndex, column: startColumn },
				end: { line: lineIndex, column: endColumn },
				text: match[0],
				line: lineIndex,
				startColumn,
				endColumn
			});

			// Prevent infinite loop on zero-width matches
			if (match[0].length === 0) {
				searchPattern.lastIndex++;
			}
		}
	}

	return matches;
}

/**
 * Find the match index closest to a position (at or after)
 */
export function findMatchIndexAtOrAfter(matches: SearchMatch[], position: Position): number {
	if (matches.length === 0) return -1;

	for (let i = 0; i < matches.length; i++) {
		const match = matches[i];
		// Match is at or after position
		if (
			match.line > position.line ||
			(match.line === position.line && match.startColumn >= position.column)
		) {
			return i;
		}
	}

	// No match at or after position - wrap to first match
	return 0;
}

/**
 * Find the match index closest to a position (at or before)
 */
export function findMatchIndexAtOrBefore(matches: SearchMatch[], position: Position): number {
	if (matches.length === 0) return -1;

	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		// Match is at or before position
		if (
			match.line < position.line ||
			(match.line === position.line && match.endColumn <= position.column)
		) {
			return i;
		}
	}

	// No match at or before position - wrap to last match
	return matches.length - 1;
}

/**
 * Get next match index (with wrap-around)
 */
export function getNextMatchIndex(
	matches: SearchMatch[],
	currentIndex: number,
	wrapAround = true
): number {
	if (matches.length === 0) return -1;
	if (currentIndex < 0) return 0;

	const next = currentIndex + 1;
	if (next >= matches.length) {
		return wrapAround ? 0 : currentIndex;
	}
	return next;
}

/**
 * Get previous match index (with wrap-around)
 */
export function getPrevMatchIndex(
	matches: SearchMatch[],
	currentIndex: number,
	wrapAround = true
): number {
	if (matches.length === 0) return -1;
	if (currentIndex < 0) return matches.length - 1;

	const prev = currentIndex - 1;
	if (prev < 0) {
		return wrapAround ? matches.length - 1 : currentIndex;
	}
	return prev;
}

/**
 * Replace text at a match position
 * Returns the new content and adjusted cursor position
 */
export function replaceMatch(
	lines: readonly { text: string }[],
	match: SearchMatch,
	replacement: string
): {
	newLines: string[];
	cursorPosition: Position;
	lengthDiff: number;
} {
	const newLines = lines.map((l) => l.text);
	const line = newLines[match.line];

	// Replace the match
	newLines[match.line] =
		line.substring(0, match.startColumn) + replacement + line.substring(match.endColumn);

	const lengthDiff = replacement.length - match.text.length;

	return {
		newLines,
		cursorPosition: {
			line: match.line,
			column: match.startColumn + replacement.length
		},
		lengthDiff
	};
}

/**
 * Replace all matches
 * Returns the new content
 */
export function replaceAllMatches(
	lines: readonly { text: string }[],
	matches: SearchMatch[],
	replacement: string
): string[] {
	if (matches.length === 0) return lines.map((l) => l.text);

	const newLines = lines.map((l) => l.text);

	// Process matches in reverse order to maintain correct positions
	const sortedMatches = [...matches].sort((a, b) => {
		if (a.line !== b.line) return b.line - a.line;
		return b.startColumn - a.startColumn;
	});

	for (const match of sortedMatches) {
		const line = newLines[match.line];
		newLines[match.line] =
			line.substring(0, match.startColumn) + replacement + line.substring(match.endColumn);
	}

	return newLines;
}

/**
 * Check if a position is within a match
 */
export function isPositionInMatch(position: Position, match: SearchMatch): boolean {
	if (position.line !== match.line) return false;
	return position.column >= match.startColumn && position.column < match.endColumn;
}

/**
 * Find match at exact position (if cursor is inside a match)
 */
export function findMatchAtPosition(matches: SearchMatch[], position: Position): number {
	for (let i = 0; i < matches.length; i++) {
		if (isPositionInMatch(position, matches[i])) {
			return i;
		}
	}
	return -1;
}
