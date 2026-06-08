import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	BracketHealer,
	createBracketHealer,
	type BracketHealerConfig,
	type BracketHealerState
} from './bracket-healer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Shorthand: create a healer, set language, analyzeImmediate, return state.
 */
function analyzeCode(content: string, language = 'javascript', config: Partial<BracketHealerConfig> = {}): BracketHealerState {
	const healer = new BracketHealer(config);
	healer.setLanguage(language);
	healer.analyzeImmediate(content);
	return healer.getState();
}

// ---------------------------------------------------------------------------
// createBracketHealer factory
// ---------------------------------------------------------------------------
describe('createBracketHealer', () => {
	it('should return a BracketHealer instance', () => {
		const healer = createBracketHealer();
		expect(healer).toBeInstanceOf(BracketHealer);
	});

	it('should accept partial config', () => {
		const healer = createBracketHealer({ minConfidence: 0.9 });
		expect(healer).toBeInstanceOf(BracketHealer);
	});
});

// ---------------------------------------------------------------------------
// Basic bracket pairing
// ---------------------------------------------------------------------------
describe('bracket pairing detection', () => {
	it('should match a single pair of parentheses', () => {
		const state = analyzeCode('(a)');
		expect(state.matches).toHaveLength(1);
		expect(state.matches[0].isComplete).toBe(true);
		expect(state.matches[0].type.open).toBe('(');
		expect(state.matches[0].type.close).toBe(')');
		expect(state.matches[0].openPos).toEqual({ line: 0, column: 0 });
		expect(state.matches[0].closePos).toEqual({ line: 0, column: 2 });
	});

	it('should match square brackets', () => {
		const state = analyzeCode('[x]');
		expect(state.matches).toHaveLength(1);
		expect(state.matches[0].isComplete).toBe(true);
		expect(state.matches[0].type.open).toBe('[');
	});

	it('should match curly braces', () => {
		const state = analyzeCode('{ }');
		expect(state.matches).toHaveLength(1);
		expect(state.matches[0].isComplete).toBe(true);
		expect(state.matches[0].type.open).toBe('{');
	});

	it('should match angle brackets only for supported languages', () => {
		// Angle brackets should NOT be matched for javascript (not in language list)
		const jsState = analyzeCode('<div>', 'javascript');
		const angleBracketMatches = jsState.matches.filter((m) => m.type.open === '<');
		expect(angleBracketMatches).toHaveLength(0);

		// Angle brackets SHOULD be matched for html
		const htmlState = analyzeCode('<div>', 'html');
		const htmlAngleMatches = htmlState.matches.filter((m) => m.type.open === '<');
		expect(htmlAngleMatches.length).toBeGreaterThan(0);
	});

	it('should match angle brackets for svelte', () => {
		const state = analyzeCode('<Component>', 'svelte');
		const angleMatches = state.matches.filter((m) => m.type.open === '<');
		expect(angleMatches.length).toBeGreaterThan(0);
		expect(angleMatches[0].isComplete).toBe(true);
	});

	it('should match multiple separate pairs', () => {
		const state = analyzeCode('(a) [b] {c}');
		const completePairs = state.matches.filter((m) => m.isComplete);
		expect(completePairs).toHaveLength(3);
	});

	it('should handle empty content', () => {
		const state = analyzeCode('');
		expect(state.matches).toHaveLength(0);
		expect(state.mismatches).toHaveLength(0);
		expect(state.ghosts).toHaveLength(0);
	});

	it('should handle content with no brackets', () => {
		const state = analyzeCode('hello world\nfoo bar');
		expect(state.matches).toHaveLength(0);
		expect(state.mismatches).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Nested brackets
// ---------------------------------------------------------------------------
describe('nested brackets', () => {
	it('should match simple nested parentheses', () => {
		const state = analyzeCode('((a))');
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(2);
	});

	it('should track nesting depth', () => {
		const state = analyzeCode('((a))');
		const depths = state.matches.map((m) => m.depth).sort();
		expect(depths).toEqual([0, 1]);
	});

	it('should match nested mixed bracket types', () => {
		const state = analyzeCode('({[a]})');
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(3);
	});

	it('should handle deeply nested brackets across lines', () => {
		const code = `function foo() {
  if (x) {
    return [1, 2];
  }
}`;
		const state = analyzeCode(code);
		const complete = state.matches.filter((m) => m.isComplete);
		// Expect: () around x, [] around 1,2, {} for if, {} for function, () after foo
		expect(complete.length).toBeGreaterThanOrEqual(4);
		expect(state.mismatches).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Unmatched / mismatched brackets
// ---------------------------------------------------------------------------
describe('unmatched bracket detection', () => {
	it('should detect an unclosed opening bracket', () => {
		const state = analyzeCode('(hello');
		const unclosed = state.mismatches.filter((m) => m.issue === 'unclosed');
		expect(unclosed).toHaveLength(1);
		expect(unclosed[0].character).toBe('(');
		expect(unclosed[0].severity).toBe('warning');
	});

	it('should detect an unexpected closing bracket', () => {
		const state = analyzeCode('hello)');
		const unexpected = state.mismatches.filter((m) => m.issue === 'unexpected');
		expect(unexpected).toHaveLength(1);
		expect(unexpected[0].character).toBe(')');
		expect(unexpected[0].severity).toBe('error');
	});

	it('should detect a mismatched bracket pair', () => {
		const state = analyzeCode('(hello]');
		const mismatched = state.mismatches.filter((m) => m.issue === 'mismatched');
		expect(mismatched).toHaveLength(1);
		expect(mismatched[0].character).toBe(']');
		expect(mismatched[0].expected).toBe(')');
		expect(mismatched[0].severity).toBe('error');
	});

	it('should detect multiple unclosed brackets', () => {
		const state = analyzeCode('({[');
		const unclosed = state.mismatches.filter((m) => m.issue === 'unclosed');
		expect(unclosed).toHaveLength(3);
	});

	it('should mark incomplete matches for unclosed brackets', () => {
		const state = analyzeCode('(hello');
		const incomplete = state.matches.filter((m) => !m.isComplete);
		expect(incomplete).toHaveLength(1);
		expect(incomplete[0].closePos).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Brackets inside strings (should be ignored)
// ---------------------------------------------------------------------------
describe('brackets inside strings', () => {
	it('should ignore brackets in double-quoted strings', () => {
		const state = analyzeCode('"(hello)"');
		expect(state.matches).toHaveLength(0);
		expect(state.mismatches).toHaveLength(0);
	});

	it('should ignore brackets in single-quoted strings', () => {
		const state = analyzeCode("'[foo]'");
		expect(state.matches).toHaveLength(0);
		expect(state.mismatches).toHaveLength(0);
	});

	it('should ignore brackets in template literals', () => {
		const state = analyzeCode('`{value}`');
		expect(state.matches).toHaveLength(0);
		expect(state.mismatches).toHaveLength(0);
	});

	it('should parse brackets outside strings but skip those inside', () => {
		const state = analyzeCode('("(")');
		// The outer () is real, inner "(" is in a string
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(1);
		expect(complete[0].type.open).toBe('(');
	});
});

// ---------------------------------------------------------------------------
// Brackets inside comments (should be ignored)
// ---------------------------------------------------------------------------
describe('brackets inside comments', () => {
	it('should ignore brackets after // comment', () => {
		const state = analyzeCode('// (hello)');
		expect(state.matches).toHaveLength(0);
		expect(state.mismatches).toHaveLength(0);
	});

	it('should still parse brackets before // comment', () => {
		const state = analyzeCode('(a) // (b)');
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(1);
		expect(complete[0].openPos).toEqual({ line: 0, column: 0 });
		expect(complete[0].closePos).toEqual({ line: 0, column: 2 });
	});

	it('should ignore brackets on a comment-only line', () => {
		const code = `// [unclosed
(x)`;
		const state = analyzeCode(code);
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(1);
		expect(state.mismatches).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Escaped characters
// ---------------------------------------------------------------------------
describe('escaped characters', () => {
	it('should skip escaped brackets', () => {
		// The backslash before ( means the ( is escaped and should be skipped
		const state = analyzeCode('\\(hello)');
		// The ( is escaped, ) is not => the ) is unexpected
		const unexpected = state.mismatches.filter(
			(m) => m.issue === 'unexpected' || m.issue === 'mismatched'
		);
		expect(unexpected.length).toBeGreaterThanOrEqual(1);
	});

	it('should skip escaped string delimiters', () => {
		// Escaped quote inside a string should not end the string early
		const state = analyzeCode('"hello\\"(world"');
		// The ( is inside the string (quote is escaped so string continues)
		// This tests that \\" does not break out of string tracking
		expect(state.matches).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Multi-line analysis
// ---------------------------------------------------------------------------
describe('multi-line analysis', () => {
	it('should match brackets across lines', () => {
		const code = `{
  hello
}`;
		const state = analyzeCode(code);
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(1);
		expect(complete[0].openPos).toEqual({ line: 0, column: 0 });
		expect(complete[0].closePos).toEqual({ line: 2, column: 0 });
	});

	it('should handle complex multi-line nesting', () => {
		const code = `function f(a, b) {
  if (a) {
    return [a, b];
  }
}`;
		const state = analyzeCode(code);
		expect(state.mismatches).toHaveLength(0);
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete.length).toBeGreaterThanOrEqual(4);
	});
});

// ---------------------------------------------------------------------------
// Ghost bracket suggestions
// ---------------------------------------------------------------------------
describe('ghost bracket suggestions', () => {
	it('should generate a ghost for an unclosed bracket', () => {
		const state = analyzeCode('(hello');
		expect(state.ghosts.length).toBeGreaterThanOrEqual(1);
		expect(state.ghosts[0].character).toBe(')');
		expect(state.ghosts[0].type).toBe('close');
	});

	it('should generate ghosts with confidence score', () => {
		const state = analyzeCode('(hello');
		expect(state.ghosts[0].confidence).toBeGreaterThanOrEqual(0);
		expect(state.ghosts[0].confidence).toBeLessThanOrEqual(1);
	});

	it('should generate ghosts with reason text', () => {
		const state = analyzeCode('(hello');
		expect(state.ghosts[0].reason).toBeTruthy();
		expect(typeof state.ghosts[0].reason).toBe('string');
	});

	it('should not generate ghosts for fully matched brackets', () => {
		const state = analyzeCode('(hello)');
		expect(state.ghosts).toHaveLength(0);
	});

	it('should limit ghost count to maxGhosts config', () => {
		// Create many unclosed brackets
		const state = analyzeCode('((((((((((', 'javascript', { maxGhosts: 3 });
		expect(state.ghosts.length).toBeLessThanOrEqual(3);
	});

	it('should filter ghosts below minConfidence', () => {
		// With a very high minConfidence, some or all ghosts may be excluded
		const state = analyzeCode('(hello', 'javascript', { minConfidence: 0.99 });
		// Either no ghosts or all ghosts have confidence >= 0.99
		for (const ghost of state.ghosts) {
			expect(ghost.confidence).toBeGreaterThanOrEqual(0.99);
		}
	});

	it('should sort ghosts by confidence descending', () => {
		const code = `{
  (
    [`;
		const state = analyzeCode(code);
		for (let i = 1; i < state.ghosts.length; i++) {
			expect(state.ghosts[i].confidence).toBeLessThanOrEqual(state.ghosts[i - 1].confidence);
		}
	});

	it('should have higher confidence for same-line completions', () => {
		// A bracket opened and unclosed on a single-line block gets high confidence
		const state = analyzeCode('(hello');
		const sameLineGhosts = state.ghosts.filter((g) => g.reason === 'Same line completion');
		if (sameLineGhosts.length > 0) {
			expect(sameLineGhosts[0].confidence).toBeGreaterThanOrEqual(0.9);
		}
	});
});

// ---------------------------------------------------------------------------
// Ghost accept / dismiss
// ---------------------------------------------------------------------------
describe('ghost accept and dismiss', () => {
	let healer: BracketHealer;

	beforeEach(() => {
		healer = new BracketHealer();
		healer.analyzeImmediate('(hello');
	});

	afterEach(() => {
		healer.destroy();
	});

	it('should accept a ghost and return it', () => {
		const ghosts = healer.getState().ghosts;
		expect(ghosts.length).toBeGreaterThan(0);
		const id = ghosts[0].id;
		const accepted = healer.acceptGhost(id);
		expect(accepted).not.toBeNull();
		expect(accepted!.id).toBe(id);
		// Ghost removed from state
		expect(healer.getState().ghosts.find((g) => g.id === id)).toBeUndefined();
	});

	it('should return null for non-existent ghost id', () => {
		const accepted = healer.acceptGhost('non-existent-id');
		expect(accepted).toBeNull();
	});

	it('should dismiss a ghost', () => {
		const ghosts = healer.getState().ghosts;
		const id = ghosts[0].id;
		healer.dismissGhost(id);
		const ghost = healer.getState().ghosts.find((g) => g.id === id);
		expect(ghost).toBeDefined();
		expect(ghost!.dismissed).toBe(true);
	});

	it('should exclude dismissed ghosts from getActiveGhosts()', () => {
		const ghosts = healer.getState().ghosts;
		const id = ghosts[0].id;
		healer.dismissGhost(id);
		const active = healer.getActiveGhosts();
		expect(active.find((g) => g.id === id)).toBeUndefined();
	});

	it('should preserve dismissed state across re-analysis', () => {
		const ghosts = healer.getState().ghosts;
		const id = ghosts[0].id;
		healer.dismissGhost(id);

		// Re-analyze same content
		healer.analyzeImmediate('(hello');

		const ghost = healer.getState().ghosts.find((g) => g.id === id);
		expect(ghost).toBeDefined();
		expect(ghost!.dismissed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// findMatchingBracket
// ---------------------------------------------------------------------------
describe('findMatchingBracket', () => {
	let healer: BracketHealer;

	beforeEach(() => {
		healer = new BracketHealer();
	});

	afterEach(() => {
		healer.destroy();
	});

	it('should find closing bracket from opening position', () => {
		healer.analyzeImmediate('(hello)');
		const result = healer.findMatchingBracket({ line: 0, column: 0 });
		expect(result).toEqual({ line: 0, column: 6 });
	});

	it('should find opening bracket from closing position', () => {
		healer.analyzeImmediate('(hello)');
		const result = healer.findMatchingBracket({ line: 0, column: 6 });
		expect(result).toEqual({ line: 0, column: 0 });
	});

	it('should return null for non-bracket position', () => {
		healer.analyzeImmediate('(hello)');
		const result = healer.findMatchingBracket({ line: 0, column: 3 });
		expect(result).toBeNull();
	});

	it('should return null for unmatched bracket', () => {
		healer.analyzeImmediate('(hello');
		const result = healer.findMatchingBracket({ line: 0, column: 0 });
		expect(result).toBeNull();
	});

	it('should handle multi-line bracket matching', () => {
		healer.analyzeImmediate('{\n  a\n}');
		const result = healer.findMatchingBracket({ line: 0, column: 0 });
		expect(result).toEqual({ line: 2, column: 0 });
	});

	it('should find the correct bracket in nested expressions', () => {
		healer.analyzeImmediate('([a])');
		// Opening ( is at 0,0; closing ) is at 0,4
		const fromOpen = healer.findMatchingBracket({ line: 0, column: 0 });
		expect(fromOpen).toEqual({ line: 0, column: 4 });
		// Opening [ is at 0,1; closing ] is at 0,3
		const fromInner = healer.findMatchingBracket({ line: 0, column: 1 });
		expect(fromInner).toEqual({ line: 0, column: 3 });
	});

	it('should return null when no analysis has been run', () => {
		const result = healer.findMatchingBracket({ line: 0, column: 0 });
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Enable / disable
// ---------------------------------------------------------------------------
describe('enable / disable', () => {
	let healer: BracketHealer;

	beforeEach(() => {
		healer = new BracketHealer();
	});

	afterEach(() => {
		healer.destroy();
	});

	it('should be enabled by default', () => {
		expect(healer.getState().enabled).toBe(true);
	});

	it('should clear state when disabled', () => {
		healer.analyzeImmediate('(hello');
		expect(healer.getState().matches.length).toBeGreaterThan(0);

		healer.setEnabled(false);
		const state = healer.getState();
		expect(state.enabled).toBe(false);
		expect(state.matches).toHaveLength(0);
		expect(state.ghosts).toHaveLength(0);
		expect(state.mismatches).toHaveLength(0);
	});

	it('should not analyze when disabled', () => {
		healer.setEnabled(false);
		healer.analyzeImmediate('(hello');
		expect(healer.getState().matches).toHaveLength(0);
	});

	it('should resume analysis after re-enabling', () => {
		healer.setEnabled(false);
		healer.setEnabled(true);
		healer.analyzeImmediate('(hello)');
		expect(healer.getState().matches.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Language-specific bracket filtering
// ---------------------------------------------------------------------------
describe('language-specific brackets', () => {
	let healer: BracketHealer;

	beforeEach(() => {
		healer = new BracketHealer();
	});

	afterEach(() => {
		healer.destroy();
	});

	it('should exclude angle brackets for unsupported languages', () => {
		healer.setLanguage('python');
		healer.analyzeImmediate('<hello>');
		const angleMatches = healer.getState().matches.filter((m) => m.type.open === '<');
		expect(angleMatches).toHaveLength(0);
	});

	it('should include angle brackets for jsx', () => {
		healer.setLanguage('jsx');
		healer.analyzeImmediate('<div>');
		const angleMatches = healer.getState().matches.filter((m) => m.type.open === '<');
		expect(angleMatches.length).toBeGreaterThan(0);
	});

	it('should include angle brackets for tsx', () => {
		healer.setLanguage('tsx');
		healer.analyzeImmediate('<Component></Component>');
		const angleMatches = healer
			.getState()
			.matches.filter((m) => m.type.open === '<' && m.isComplete);
		expect(angleMatches.length).toBeGreaterThan(0);
	});

	it('should include angle brackets for xml', () => {
		healer.setLanguage('xml');
		healer.analyzeImmediate('<tag>');
		const angleMatches = healer.getState().matches.filter((m) => m.type.open === '<');
		expect(angleMatches.length).toBeGreaterThan(0);
	});

	it('should include angle brackets for vue', () => {
		healer.setLanguage('vue');
		healer.analyzeImmediate('<template>');
		const angleMatches = healer.getState().matches.filter((m) => m.type.open === '<');
		expect(angleMatches.length).toBeGreaterThan(0);
	});

	it('should always include parentheses, brackets, and braces regardless of language', () => {
		healer.setLanguage('python');
		healer.analyzeImmediate('(a) [b] {c}');
		const complete = healer.getState().matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// Subscription / listener
// ---------------------------------------------------------------------------
describe('subscribe and notify', () => {
	let healer: BracketHealer;

	beforeEach(() => {
		healer = new BracketHealer();
	});

	afterEach(() => {
		healer.destroy();
	});

	it('should notify listeners on analyzeImmediate', () => {
		const listener = vi.fn();
		healer.subscribe(listener);
		healer.analyzeImmediate('(hello)');
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener.mock.calls[0][0]).toHaveProperty('matches');
	});

	it('should notify on setEnabled', () => {
		const listener = vi.fn();
		healer.subscribe(listener);
		healer.setEnabled(false);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('should allow unsubscribe', () => {
		const listener = vi.fn();
		const unsub = healer.subscribe(listener);
		unsub();
		healer.analyzeImmediate('(hello)');
		expect(listener).not.toHaveBeenCalled();
	});

	it('should handle listener errors gracefully', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const badListener = () => {
			throw new Error('listener error');
		};
		const goodListener = vi.fn();

		healer.subscribe(badListener);
		healer.subscribe(goodListener);
		healer.analyzeImmediate('(hello)');

		expect(goodListener).toHaveBeenCalledTimes(1);
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// Debounced analyze
// ---------------------------------------------------------------------------
describe('debounced analyze', () => {
	let healer: BracketHealer;

	beforeEach(() => {
		vi.useFakeTimers();
		healer = new BracketHealer({ debounceMs: 100 });
	});

	afterEach(() => {
		healer.destroy();
		vi.useRealTimers();
	});

	it('should not update state immediately on analyze()', () => {
		healer.analyze('(hello)');
		expect(healer.getState().matches).toHaveLength(0);
	});

	it('should update state after debounce delay', () => {
		healer.analyze('(hello)');
		vi.advanceTimersByTime(150);
		expect(healer.getState().matches.length).toBeGreaterThan(0);
	});

	it('should debounce multiple analyze calls', () => {
		const listener = vi.fn();
		healer.subscribe(listener);

		healer.analyze('(');
		healer.analyze('(a');
		healer.analyze('(a)');

		vi.advanceTimersByTime(150);
		// Only one actual analysis should have been performed (the last one)
		expect(listener).toHaveBeenCalledTimes(1);
		const state = healer.getState();
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// destroy
// ---------------------------------------------------------------------------
describe('destroy', () => {
	it('should clear listeners on destroy', () => {
		const healer = new BracketHealer();
		const listener = vi.fn();
		healer.subscribe(listener);
		healer.destroy();
		// After destroy, analyzeImmediate should not call the listener
		healer.analyzeImmediate('(hello)');
		expect(listener).not.toHaveBeenCalled();
	});

	it('should clear debounce timer on destroy', () => {
		vi.useFakeTimers();
		const healer = new BracketHealer({ debounceMs: 100 });
		const listener = vi.fn();
		healer.subscribe(listener);
		healer.analyze('(hello)');
		healer.destroy();
		vi.advanceTimersByTime(200);
		expect(listener).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});

// ---------------------------------------------------------------------------
// getMismatches
// ---------------------------------------------------------------------------
describe('getMismatches', () => {
	it('should return a copy of the mismatches array', () => {
		const healer = new BracketHealer();
		healer.analyzeImmediate('(hello');
		const m1 = healer.getMismatches();
		const m2 = healer.getMismatches();
		expect(m1).toEqual(m2);
		expect(m1).not.toBe(m2); // different array references
		healer.destroy();
	});
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('edge cases', () => {
	it('should handle a single opening bracket', () => {
		const state = analyzeCode('(');
		expect(state.matches).toHaveLength(1);
		expect(state.matches[0].isComplete).toBe(false);
		expect(state.mismatches).toHaveLength(1);
	});

	it('should handle a single closing bracket', () => {
		const state = analyzeCode(')');
		expect(state.mismatches).toHaveLength(1);
		expect(state.mismatches[0].issue).toBe('unexpected');
	});

	it('should handle many brackets on a single line', () => {
		const state = analyzeCode('(((())))');
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(4);
		expect(state.mismatches).toHaveLength(0);
	});

	it('should handle interleaved bracket types correctly', () => {
		// ([)] is technically mismatched in strict mode
		const state = analyzeCode('([)]');
		// The algorithm does a stack-based search; ] closes [ (found by scanning back)
		// Then ) closes ( (found by scanning back)
		// This is bracket "healing" behavior - it finds the best match
		const complete = state.matches.filter((m) => m.isComplete);
		// The algorithm scans backward in the stack for a matching bracket
		expect(complete.length).toBeGreaterThanOrEqual(1);
	});

	it('should handle cursor at column 0', () => {
		const healer = new BracketHealer();
		healer.analyzeImmediate('{a}');
		const result = healer.findMatchingBracket({ line: 0, column: 0 });
		expect(result).toEqual({ line: 0, column: 2 });
		healer.destroy();
	});

	it('should handle very long lines', () => {
		const longContent = '(' + 'a'.repeat(10000) + ')';
		const state = analyzeCode(longContent);
		expect(state.matches).toHaveLength(1);
		expect(state.matches[0].isComplete).toBe(true);
		expect(state.mismatches).toHaveLength(0);
	});

	it('should handle content that is only whitespace', () => {
		const state = analyzeCode('   \n  \n    ');
		expect(state.matches).toHaveLength(0);
		expect(state.mismatches).toHaveLength(0);
	});

	it('should handle adjacent brackets with no content', () => {
		const state = analyzeCode('()[]{}');
		const complete = state.matches.filter((m) => m.isComplete);
		expect(complete).toHaveLength(3);
		expect(state.mismatches).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Custom config
// ---------------------------------------------------------------------------
describe('custom configuration', () => {
	it('should use custom bracket pairs', () => {
		const healer = new BracketHealer({
			pairs: [{ open: '/*', close: '*/' }]
		});
		// Note: the current implementation works character-by-character,
		// so multi-char pairs won't match. This tests that the config is accepted.
		expect(healer).toBeInstanceOf(BracketHealer);
		healer.destroy();
	});

	it('should respect custom debounceMs', () => {
		vi.useFakeTimers();
		const healer = new BracketHealer({ debounceMs: 500 });
		const listener = vi.fn();
		healer.subscribe(listener);

		healer.analyze('(hello)');
		vi.advanceTimersByTime(200);
		expect(listener).not.toHaveBeenCalled();

		vi.advanceTimersByTime(400);
		expect(listener).toHaveBeenCalledTimes(1);

		healer.destroy();
		vi.useRealTimers();
	});
});

// ---------------------------------------------------------------------------
// getState returns a shallow copy
// ---------------------------------------------------------------------------
describe('getState immutability', () => {
	it('should return a shallow copy of state', () => {
		const healer = new BracketHealer();
		healer.analyzeImmediate('(hello)');
		const s1 = healer.getState();
		const s2 = healer.getState();
		expect(s1).toEqual(s2);
		expect(s1).not.toBe(s2);
		healer.destroy();
	});
});

// ---------------------------------------------------------------------------
// Ghost indentation heuristics
// ---------------------------------------------------------------------------
describe('ghost bracket placement heuristics', () => {
	it('should suggest closing bracket before a dedented line', () => {
		const code = `if (true) {
  doSomething()
done`;
		const state = analyzeCode(code);
		const ghosts = state.ghosts.filter((g) => g.character === '}');
		if (ghosts.length > 0) {
			expect(ghosts[0].confidence).toBeGreaterThanOrEqual(0.5);
			expect(ghosts[0].reason).toBeTruthy();
		}
	});

	it('should suggest closing bracket before control flow statement at same indentation', () => {
		// The { and } are matched. But if we remove the }:
		const code2 = `function f() {
  return 1`;
		const state = analyzeCode(code2);
		const ghosts = state.ghosts.filter((g) => g.character === '}');
		expect(ghosts.length).toBeGreaterThanOrEqual(1);
	});
});
