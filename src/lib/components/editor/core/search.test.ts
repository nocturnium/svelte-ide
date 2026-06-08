import { describe, it, expect } from 'vitest';
import {
	createSearchState,
	findAllMatches,
	findMatchIndexAtOrAfter,
	findMatchIndexAtOrBefore,
	getNextMatchIndex,
	getPrevMatchIndex,
	replaceMatch,
	replaceAllMatches,
	isPositionInMatch,
	findMatchAtPosition,
	type SearchMatch
} from './search';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convenience: turn raw strings into the { text: string }[] the API expects */
function lines(...texts: string[]): readonly { text: string }[] {
	return texts.map((t) => ({ text: t }));
}

/** Build a minimal SearchMatch for helper-level tests */
function makeMatch(line: number, startCol: number, endCol: number, text: string): SearchMatch {
	return {
		start: { line, column: startCol },
		end: { line, column: endCol },
		text,
		line,
		startColumn: startCol,
		endColumn: endCol
	};
}

// ============================================================
// createSearchState
// ============================================================

describe('createSearchState', () => {
	it('should return default search state', () => {
		const state = createSearchState();
		expect(state.query).toBe('');
		expect(state.options.caseSensitive).toBe(false);
		expect(state.options.useRegex).toBe(false);
		expect(state.options.wrapAround).toBe(true);
		expect(state.matches).toEqual([]);
		expect(state.currentIndex).toBe(-1);
	});
});

// ============================================================
// findAllMatches — plain text
// ============================================================

describe('findAllMatches — plain text', () => {
	it('should find a single match on one line', () => {
		const result = findAllMatches(lines('hello world'), 'world');
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('world');
		expect(result[0].line).toBe(0);
		expect(result[0].startColumn).toBe(6);
		expect(result[0].endColumn).toBe(11);
	});

	it('should find multiple matches on the same line', () => {
		const result = findAllMatches(lines('abcabc'), 'abc');
		expect(result).toHaveLength(2);
		expect(result[0].startColumn).toBe(0);
		expect(result[1].startColumn).toBe(3);
	});

	it('should find matches across multiple lines', () => {
		const result = findAllMatches(lines('foo bar', 'baz foo', 'foo'), 'foo');
		expect(result).toHaveLength(3);
		expect(result[0]).toMatchObject({ line: 0, startColumn: 0 });
		expect(result[1]).toMatchObject({ line: 1, startColumn: 4 });
		expect(result[2]).toMatchObject({ line: 2, startColumn: 0 });
	});

	it('should return empty array for empty query', () => {
		expect(findAllMatches(lines('hello'), '')).toEqual([]);
	});

	it('should return empty array when no matches exist', () => {
		expect(findAllMatches(lines('hello'), 'xyz')).toEqual([]);
	});

	it('should return empty array for empty lines', () => {
		expect(findAllMatches([], 'foo')).toEqual([]);
	});

	it('should populate start/end Position fields correctly', () => {
		const result = findAllMatches(lines('  target  '), 'target');
		expect(result).toHaveLength(1);
		expect(result[0].start).toEqual({ line: 0, column: 2 });
		expect(result[0].end).toEqual({ line: 0, column: 8 });
	});

	it('should escape regex special characters in plain text mode', () => {
		const result = findAllMatches(lines('a.b+c'), 'a.b+c');
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('a.b+c');
	});

	it('should escape parentheses and brackets in plain text mode', () => {
		const result = findAllMatches(lines('fn(x) => [y]'), 'fn(x)');
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('fn(x)');
	});
});

// ============================================================
// findAllMatches — case sensitivity
// ============================================================

describe('findAllMatches — case sensitivity', () => {
	it('should be case-insensitive by default', () => {
		const result = findAllMatches(lines('Hello HELLO hello'), 'hello');
		expect(result).toHaveLength(3);
	});

	it('should respect caseSensitive: true', () => {
		const result = findAllMatches(lines('Hello HELLO hello'), 'hello', {
			caseSensitive: true
		});
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('hello');
		expect(result[0].startColumn).toBe(12);
	});

	it('should match case-insensitively with caseSensitive: false', () => {
		const result = findAllMatches(lines('FoO fOo'), 'foo', {
			caseSensitive: false
		});
		expect(result).toHaveLength(2);
	});
});

// ============================================================
// findAllMatches — regex mode
// ============================================================

describe('findAllMatches — regex mode', () => {
	it('should support basic regex patterns', () => {
		const result = findAllMatches(lines('abc 123 def 456'), '\\d+', {
			useRegex: true
		});
		expect(result).toHaveLength(2);
		expect(result[0].text).toBe('123');
		expect(result[1].text).toBe('456');
	});

	it('should support character classes', () => {
		const result = findAllMatches(lines('cat bat rat'), '[cbr]at', {
			useRegex: true
		});
		expect(result).toHaveLength(3);
	});

	it('should support anchors within a line', () => {
		const result = findAllMatches(lines('hello', 'world'), '^hello$', {
			useRegex: true
		});
		expect(result).toHaveLength(1);
		expect(result[0].line).toBe(0);
	});

	it('should handle regex with case-sensitive flag', () => {
		const result = findAllMatches(lines('Abc abc ABC'), '[A-Z][a-z]+', {
			useRegex: true,
			caseSensitive: true
		});
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('Abc');
	});

	it('should return empty for invalid regex', () => {
		const result = findAllMatches(lines('hello'), '[invalid', {
			useRegex: true
		});
		expect(result).toEqual([]);
	});

	it('should handle zero-width matches without infinite loop', () => {
		// The pattern matches zero-width assertions; should not hang
		const result = findAllMatches(lines('abc'), '', { useRegex: false });
		// Empty query returns [] regardless
		expect(result).toEqual([]);
	});

	it('should handle regex that can produce zero-length matches', () => {
		// a* can match empty string — the code advances lastIndex to prevent infinite loop
		const result = findAllMatches(lines('bbb'), 'a*', { useRegex: true });
		// Each position can match zero-length "a*" — should not hang
		expect(result.length).toBeGreaterThanOrEqual(1);
	});
});

// ============================================================
// Match counting
// ============================================================

describe('match counting', () => {
	it('should count total matches correctly', () => {
		const result = findAllMatches(lines('the cat sat on the mat', 'the dog sat on the rug'), 'the');
		expect(result).toHaveLength(4);
	});

	it('should count overlapping-position matches for non-overlapping pattern', () => {
		// "aa" in "aaa" — regex global won't find overlapping, so expect 1 match
		const result = findAllMatches(lines('aaa'), 'aa');
		expect(result).toHaveLength(1);
		expect(result[0].startColumn).toBe(0);
		expect(result[0].endColumn).toBe(2);
	});
});

// ============================================================
// findMatchIndexAtOrAfter
// ============================================================

describe('findMatchIndexAtOrAfter', () => {
	const matches = [makeMatch(0, 0, 3, 'foo'), makeMatch(1, 5, 8, 'bar'), makeMatch(3, 2, 5, 'baz')];

	it('should return 0 for position before all matches', () => {
		expect(findMatchIndexAtOrAfter(matches, { line: 0, column: 0 })).toBe(0);
	});

	it('should return correct index for position at a match start', () => {
		expect(findMatchIndexAtOrAfter(matches, { line: 1, column: 5 })).toBe(1);
	});

	it('should return next match when position is between matches', () => {
		expect(findMatchIndexAtOrAfter(matches, { line: 2, column: 0 })).toBe(2);
	});

	it('should wrap to 0 when position is after all matches', () => {
		expect(findMatchIndexAtOrAfter(matches, { line: 10, column: 0 })).toBe(0);
	});

	it('should return -1 for empty matches array', () => {
		expect(findMatchIndexAtOrAfter([], { line: 0, column: 0 })).toBe(-1);
	});
});

// ============================================================
// findMatchIndexAtOrBefore
// ============================================================

describe('findMatchIndexAtOrBefore', () => {
	const matches = [makeMatch(0, 0, 3, 'foo'), makeMatch(1, 5, 8, 'bar'), makeMatch(3, 2, 5, 'baz')];

	it('should return last match index for position after all matches', () => {
		expect(findMatchIndexAtOrBefore(matches, { line: 10, column: 0 })).toBe(2);
	});

	it('should return correct index for position at a match end', () => {
		expect(findMatchIndexAtOrBefore(matches, { line: 1, column: 8 })).toBe(1);
	});

	it('should return previous match when position is between matches', () => {
		expect(findMatchIndexAtOrBefore(matches, { line: 2, column: 0 })).toBe(1);
	});

	it('should wrap to last match when position is before all matches (endColumn based)', () => {
		// Position line=0, column=0 — match 0 endColumn=3 > column=0, so it's not at-or-before
		// The function wraps to matches.length - 1
		expect(findMatchIndexAtOrBefore(matches, { line: 0, column: 0 })).toBe(2);
	});

	it('should return -1 for empty matches array', () => {
		expect(findMatchIndexAtOrBefore([], { line: 0, column: 0 })).toBe(-1);
	});
});

// ============================================================
// getNextMatchIndex — find next navigation
// ============================================================

describe('getNextMatchIndex', () => {
	const threeMatches = [makeMatch(0, 0, 3, 'a'), makeMatch(1, 0, 3, 'b'), makeMatch(2, 0, 3, 'c')];

	it('should advance to next match', () => {
		expect(getNextMatchIndex(threeMatches, 0)).toBe(1);
		expect(getNextMatchIndex(threeMatches, 1)).toBe(2);
	});

	it('should wrap around from last to first when wrapAround is true', () => {
		expect(getNextMatchIndex(threeMatches, 2, true)).toBe(0);
	});

	it('should stay at last match when wrapAround is false', () => {
		expect(getNextMatchIndex(threeMatches, 2, false)).toBe(2);
	});

	it('should return 0 when currentIndex is negative', () => {
		expect(getNextMatchIndex(threeMatches, -1)).toBe(0);
	});

	it('should return -1 for empty matches', () => {
		expect(getNextMatchIndex([], 0)).toBe(-1);
	});
});

// ============================================================
// getPrevMatchIndex — find previous navigation
// ============================================================

describe('getPrevMatchIndex', () => {
	const threeMatches = [makeMatch(0, 0, 3, 'a'), makeMatch(1, 0, 3, 'b'), makeMatch(2, 0, 3, 'c')];

	it('should go to previous match', () => {
		expect(getPrevMatchIndex(threeMatches, 2)).toBe(1);
		expect(getPrevMatchIndex(threeMatches, 1)).toBe(0);
	});

	it('should wrap around from first to last when wrapAround is true', () => {
		expect(getPrevMatchIndex(threeMatches, 0, true)).toBe(2);
	});

	it('should stay at first match when wrapAround is false', () => {
		expect(getPrevMatchIndex(threeMatches, 0, false)).toBe(0);
	});

	it('should return last match index when currentIndex is negative', () => {
		expect(getPrevMatchIndex(threeMatches, -1)).toBe(2);
	});

	it('should return -1 for empty matches', () => {
		expect(getPrevMatchIndex([], 0)).toBe(-1);
	});
});

// ============================================================
// replaceMatch — single replacement
// ============================================================

describe('replaceMatch', () => {
	it('should replace a match with same-length text', () => {
		const src = lines('hello world');
		const match = makeMatch(0, 6, 11, 'world');
		const result = replaceMatch(src, match, 'earth');

		expect(result.newLines).toEqual(['hello earth']);
		expect(result.cursorPosition).toEqual({ line: 0, column: 11 });
		expect(result.lengthDiff).toBe(0);
	});

	it('should replace a match with shorter text', () => {
		const src = lines('hello world');
		const match = makeMatch(0, 6, 11, 'world');
		const result = replaceMatch(src, match, 'hi');

		expect(result.newLines).toEqual(['hello hi']);
		expect(result.cursorPosition).toEqual({ line: 0, column: 8 });
		expect(result.lengthDiff).toBe(-3);
	});

	it('should replace a match with longer text', () => {
		const src = lines('hello world');
		const match = makeMatch(0, 6, 11, 'world');
		const result = replaceMatch(src, match, 'universe');

		expect(result.newLines).toEqual(['hello universe']);
		expect(result.cursorPosition).toEqual({ line: 0, column: 14 });
		expect(result.lengthDiff).toBe(3);
	});

	it('should replace a match with empty string (delete)', () => {
		const src = lines('hello world');
		const match = makeMatch(0, 5, 11, ' world');
		const result = replaceMatch(src, match, '');

		expect(result.newLines).toEqual(['hello']);
		expect(result.cursorPosition).toEqual({ line: 0, column: 5 });
		expect(result.lengthDiff).toBe(-6);
	});

	it('should only modify the target line', () => {
		const src = lines('line one', 'line two', 'line three');
		const match = makeMatch(1, 5, 8, 'two');
		const result = replaceMatch(src, match, 'TWO');

		expect(result.newLines).toEqual(['line one', 'line TWO', 'line three']);
	});

	it('should not mutate the original lines array', () => {
		const src = lines('hello world');
		const match = makeMatch(0, 6, 11, 'world');
		replaceMatch(src, match, 'earth');

		expect(src[0].text).toBe('hello world');
	});
});

// ============================================================
// replaceAllMatches — bulk replacement
// ============================================================

describe('replaceAllMatches', () => {
	it('should replace all matches across multiple lines', () => {
		const src = lines('foo bar', 'baz foo', 'foo');
		const matches = findAllMatches(src, 'foo');
		const result = replaceAllMatches(src, matches, 'qux');

		expect(result).toEqual(['qux bar', 'baz qux', 'qux']);
	});

	it('should handle multiple matches on the same line', () => {
		const src = lines('abcabc');
		const matches = findAllMatches(src, 'abc');
		const result = replaceAllMatches(src, matches, 'XY');

		expect(result).toEqual(['XYXY']);
	});

	it('should handle replacement with longer text on same line', () => {
		const src = lines('a b a');
		const matches = findAllMatches(src, 'a');
		const result = replaceAllMatches(src, matches, 'ZZZ');

		expect(result).toEqual(['ZZZ b ZZZ']);
	});

	it('should return original text for empty matches array', () => {
		const src = lines('unchanged');
		const result = replaceAllMatches(src, [], 'whatever');

		expect(result).toEqual(['unchanged']);
	});

	it('should handle replacing with empty string', () => {
		const src = lines('remove all the words');
		const matches = findAllMatches(src, 'the ');
		const result = replaceAllMatches(src, matches, '');

		expect(result).toEqual(['remove all words']);
	});

	it('should not mutate the original lines array', () => {
		const src = lines('foo bar');
		const matches = findAllMatches(src, 'foo');
		replaceAllMatches(src, matches, 'baz');

		expect(src[0].text).toBe('foo bar');
	});
});

// ============================================================
// isPositionInMatch
// ============================================================

describe('isPositionInMatch', () => {
	const match = makeMatch(2, 5, 10, 'hello');

	it('should return true for position at match start', () => {
		expect(isPositionInMatch({ line: 2, column: 5 }, match)).toBe(true);
	});

	it('should return true for position inside match', () => {
		expect(isPositionInMatch({ line: 2, column: 7 }, match)).toBe(true);
	});

	it('should return false for position at match end (exclusive)', () => {
		expect(isPositionInMatch({ line: 2, column: 10 }, match)).toBe(false);
	});

	it('should return false for position on a different line', () => {
		expect(isPositionInMatch({ line: 1, column: 7 }, match)).toBe(false);
	});

	it('should return false for position before match on same line', () => {
		expect(isPositionInMatch({ line: 2, column: 4 }, match)).toBe(false);
	});

	it('should return false for position after match on same line', () => {
		expect(isPositionInMatch({ line: 2, column: 11 }, match)).toBe(false);
	});
});

// ============================================================
// findMatchAtPosition
// ============================================================

describe('findMatchAtPosition', () => {
	const matches = [
		makeMatch(0, 0, 3, 'foo'),
		makeMatch(0, 10, 13, 'bar'),
		makeMatch(2, 5, 8, 'baz')
	];

	it('should return index of match containing position', () => {
		expect(findMatchAtPosition(matches, { line: 0, column: 1 })).toBe(0);
		expect(findMatchAtPosition(matches, { line: 0, column: 11 })).toBe(1);
		expect(findMatchAtPosition(matches, { line: 2, column: 6 })).toBe(2);
	});

	it('should return -1 when position is not in any match', () => {
		expect(findMatchAtPosition(matches, { line: 0, column: 5 })).toBe(-1);
		expect(findMatchAtPosition(matches, { line: 1, column: 0 })).toBe(-1);
	});

	it('should return -1 for empty matches array', () => {
		expect(findMatchAtPosition([], { line: 0, column: 0 })).toBe(-1);
	});
});

// ============================================================
// Integration-style: find + navigate + replace cycle
// ============================================================

describe('integration: find, navigate, replace cycle', () => {
	it('should support a typical find-next-replace workflow', () => {
		const src = lines('apple banana apple cherry apple');
		const matches = findAllMatches(src, 'apple');
		expect(matches).toHaveLength(3);

		// Start navigation
		let idx = getNextMatchIndex(matches, -1); // first
		expect(idx).toBe(0);
		expect(matches[idx].startColumn).toBe(0);

		idx = getNextMatchIndex(matches, idx); // second
		expect(idx).toBe(1);
		expect(matches[idx].startColumn).toBe(13);

		// Replace the second match
		const { newLines } = replaceMatch(src, matches[idx], 'APPLE');
		expect(newLines[0]).toBe('apple banana APPLE cherry apple');
	});

	it('should support find-prev navigation with wrap', () => {
		const src = lines('x', 'y', 'x');
		const matches = findAllMatches(src, 'x');
		expect(matches).toHaveLength(2);

		// Start from index 0, go prev -> wraps to last
		const idx = getPrevMatchIndex(matches, 0, true);
		expect(idx).toBe(1);
		expect(matches[idx].line).toBe(2);
	});

	it('should support replace-all then re-search showing zero matches', () => {
		const src = lines('todo: fix this', 'todo: update that');
		const matches = findAllMatches(src, 'todo');
		expect(matches).toHaveLength(2);

		const newLines = replaceAllMatches(src, matches, 'done');
		const newSrc = newLines.map((t) => ({ text: t }));

		const afterMatches = findAllMatches(newSrc, 'todo');
		expect(afterMatches).toHaveLength(0);

		const doneMatches = findAllMatches(newSrc, 'done');
		expect(doneMatches).toHaveLength(2);
	});
});
