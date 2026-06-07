import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	GitBlameManager,
	createGitBlameManager,
	generateMockBlameData,
	type BlameInfo,
	type BlameState
} from './git-blame';

// ============================================================
// Helpers
// ============================================================

function makeBlameInfo(overrides: Partial<BlameInfo> = {}): BlameInfo {
	return {
		line: overrides.line ?? 0,
		commitSha: overrides.commitSha ?? 'abc1234',
		fullSha: overrides.fullSha ?? 'abc1234def5678901234567890abcdef12345678',
		author: overrides.author ?? 'Alice',
		authorEmail: overrides.authorEmail ?? 'alice@example.com',
		timestamp: overrides.timestamp ?? new Date('2025-01-15T12:00:00Z'),
		message: overrides.message ?? 'Initial commit',
		uncommitted: overrides.uncommitted ?? false,
		color: overrides.color
	};
}

function makeSampleData(count: number): BlameInfo[] {
	const data: BlameInfo[] = [];
	for (let i = 0; i < count; i++) {
		data.push(makeBlameInfo({
			line: i,
			commitSha: `sha${i}`,
			author: i % 2 === 0 ? 'Alice' : 'Bob',
			authorEmail: i % 2 === 0 ? 'alice@example.com' : 'bob@example.com',
			timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
			message: `Commit for line ${i}`
		}));
	}
	return data;
}

// ============================================================
// GitBlameManager -- creation
// ============================================================

describe('GitBlameManager -- creation', () => {
	it('should create via factory function', () => {
		const mgr = createGitBlameManager();
		expect(mgr).toBeInstanceOf(GitBlameManager);
	});

	it('should create with default config', () => {
		const mgr = new GitBlameManager();
		const cfg = mgr.getConfig();
		expect(cfg.colorMode).toBe('age');
		expect(cfg.showAuthor).toBe(true);
		expect(cfg.showTimestamp).toBe(true);
		expect(cfg.dateFormat).toBe('relative');
		expect(cfg.authorColors).toHaveLength(10);
		expect(cfg.ageColors).toEqual(['#22c55e', '#6b7280']);
	});

	it('should merge partial config', () => {
		const mgr = new GitBlameManager({ colorMode: 'author', showAuthor: false });
		const cfg = mgr.getConfig();
		expect(cfg.colorMode).toBe('author');
		expect(cfg.showAuthor).toBe(false);
		// Defaults preserved
		expect(cfg.showTimestamp).toBe(true);
		expect(cfg.dateFormat).toBe('relative');
	});

	it('should start disabled with empty state', () => {
		const mgr = new GitBlameManager();
		expect(mgr.isEnabled()).toBe(false);
		const state = mgr.getState();
		expect(state.enabled).toBe(false);
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
		expect(state.lastUpdated).toBeNull();
		expect(state.lineBlame.size).toBe(0);
	});
});

// ============================================================
// GitBlameManager -- enable/disable/toggle
// ============================================================

describe('GitBlameManager -- enable/disable/toggle', () => {
	let mgr: GitBlameManager;

	beforeEach(() => {
		mgr = new GitBlameManager();
	});

	it('enable() should set enabled to true', () => {
		mgr.enable();
		expect(mgr.isEnabled()).toBe(true);
		expect(mgr.getState().enabled).toBe(true);
	});

	it('disable() should set enabled to false', () => {
		mgr.enable();
		mgr.disable();
		expect(mgr.isEnabled()).toBe(false);
	});

	it('toggle() should flip the enabled state and return new value', () => {
		expect(mgr.toggle()).toBe(true);  // was false, now true
		expect(mgr.isEnabled()).toBe(true);
		expect(mgr.toggle()).toBe(false); // was true, now false
		expect(mgr.isEnabled()).toBe(false);
	});

	it('enable/disable/toggle should notify listeners', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);

		mgr.enable();
		expect(listener).toHaveBeenCalledTimes(1);
		mgr.disable();
		expect(listener).toHaveBeenCalledTimes(2);
		mgr.toggle();
		expect(listener).toHaveBeenCalledTimes(3);
	});
});

// ============================================================
// GitBlameManager -- setBlameData
// ============================================================

describe('GitBlameManager -- setBlameData', () => {
	let mgr: GitBlameManager;

	beforeEach(() => {
		mgr = new GitBlameManager();
	});

	it('should store blame data indexed by line', () => {
		const data = makeSampleData(5);
		mgr.setBlameData(data);

		for (let i = 0; i < 5; i++) {
			const info = mgr.getLineBlame(i);
			expect(info).toBeDefined();
			expect(info!.line).toBe(i);
		}
	});

	it('should clear loading and error state', () => {
		mgr.setLoading(true);
		mgr.setError('something went wrong');
		mgr.setBlameData(makeSampleData(2));

		const state = mgr.getState();
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it('should set lastUpdated', () => {
		mgr.setBlameData(makeSampleData(1));
		const state = mgr.getState();
		expect(state.lastUpdated).toBeInstanceOf(Date);
	});

	it('should assign age-based colors by default', () => {
		const data = [makeBlameInfo({ line: 0, timestamp: new Date() })];
		mgr.setBlameData(data);
		const info = mgr.getLineBlame(0);
		expect(info!.color).toBeDefined();
		expect(typeof info!.color).toBe('string');
	});

	it('should assign author-based colors when colorMode is author', () => {
		const mgr2 = new GitBlameManager({ colorMode: 'author' });
		const data = [
			makeBlameInfo({ line: 0, author: 'Alice' }),
			makeBlameInfo({ line: 1, author: 'Bob' }),
			makeBlameInfo({ line: 2, author: 'Alice' })
		];
		mgr2.setBlameData(data);

		const aliceLine0 = mgr2.getLineBlame(0);
		const bobLine = mgr2.getLineBlame(1);
		const aliceLine2 = mgr2.getLineBlame(2);

		// Same author should get same color
		expect(aliceLine0!.color).toBe(aliceLine2!.color);
		// Different authors should get different colors
		expect(aliceLine0!.color).not.toBe(bobLine!.color);
	});

	it('should replace previous blame data', () => {
		mgr.setBlameData(makeSampleData(10));
		expect(mgr.getAllBlame()).toHaveLength(10);

		mgr.setBlameData(makeSampleData(3));
		expect(mgr.getAllBlame()).toHaveLength(3);
	});

	it('should notify listeners', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.setBlameData(makeSampleData(1));
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('should handle empty data array', () => {
		mgr.setBlameData([]);
		expect(mgr.getAllBlame()).toHaveLength(0);
		expect(mgr.getState().lastUpdated).toBeInstanceOf(Date);
	});
});

// ============================================================
// GitBlameManager -- age color assignment
// ============================================================

describe('GitBlameManager -- age-based colors', () => {
	let mgr: GitBlameManager;

	beforeEach(() => {
		mgr = new GitBlameManager({ colorMode: 'age' });
	});

	it('should assign bright green for today', () => {
		const data = [makeBlameInfo({ line: 0, timestamp: new Date() })];
		mgr.setBlameData(data);
		expect(mgr.getLineBlame(0)!.color).toBe('#22c55e');
	});

	it('should assign green shade for this week', () => {
		const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
		const data = [makeBlameInfo({ line: 0, timestamp: threeDaysAgo })];
		mgr.setBlameData(data);
		expect(mgr.getLineBlame(0)!.color).toBe('#4ade80');
	});

	it('should assign light green for this month', () => {
		const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
		const data = [makeBlameInfo({ line: 0, timestamp: twoWeeksAgo })];
		mgr.setBlameData(data);
		expect(mgr.getLineBlame(0)!.color).toBe('#86efac');
	});

	it('should assign gray for recent (within 6 months)', () => {
		const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		const data = [makeBlameInfo({ line: 0, timestamp: twoMonthsAgo })];
		mgr.setBlameData(data);
		expect(mgr.getLineBlame(0)!.color).toBe('#9ca3af');
	});

	it('should assign darker gray for old (within 1 year)', () => {
		const eightMonthsAgo = new Date(Date.now() - 240 * 24 * 60 * 60 * 1000);
		const data = [makeBlameInfo({ line: 0, timestamp: eightMonthsAgo })];
		mgr.setBlameData(data);
		expect(mgr.getLineBlame(0)!.color).toBe('#6b7280');
	});

	it('should assign darkest gray for ancient (> 1 year)', () => {
		const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
		const data = [makeBlameInfo({ line: 0, timestamp: twoYearsAgo })];
		mgr.setBlameData(data);
		expect(mgr.getLineBlame(0)!.color).toBe('#4b5563');
	});
});

// ============================================================
// GitBlameManager -- author color assignment
// ============================================================

describe('GitBlameManager -- author-based colors', () => {
	it('should cycle through author colors for many unique authors', () => {
		const mgr = new GitBlameManager({ colorMode: 'author' });
		const data: BlameInfo[] = [];
		const authorCount = 15; // More than the 10 default colors

		for (let i = 0; i < authorCount; i++) {
			data.push(makeBlameInfo({ line: i, author: `Author${i}` }));
		}
		mgr.setBlameData(data);

		// First and 11th author should have the same color (cycling)
		const first = mgr.getLineBlame(0)!.color;
		const eleventh = mgr.getLineBlame(10)!.color;
		expect(first).toBe(eleventh);
	});

	it('should remember author color across setBlameData calls', () => {
		const mgr = new GitBlameManager({ colorMode: 'author' });

		// First batch
		mgr.setBlameData([makeBlameInfo({ line: 0, author: 'Alice' })]);
		const aliceColor1 = mgr.getLineBlame(0)!.color;

		// Second batch - Alice should keep the same color
		mgr.setBlameData([makeBlameInfo({ line: 0, author: 'Alice' })]);
		const aliceColor2 = mgr.getLineBlame(0)!.color;

		expect(aliceColor1).toBe(aliceColor2);
	});
});

// ============================================================
// GitBlameManager -- loading & error state
// ============================================================

describe('GitBlameManager -- loading & error state', () => {
	let mgr: GitBlameManager;

	beforeEach(() => {
		mgr = new GitBlameManager();
	});

	it('setLoading(true) should set loading and clear error', () => {
		mgr.setError('old error');
		mgr.setLoading(true);
		const state = mgr.getState();
		expect(state.loading).toBe(true);
		expect(state.error).toBeNull();
	});

	it('setLoading(false) should clear loading', () => {
		mgr.setLoading(true);
		mgr.setLoading(false);
		expect(mgr.getState().loading).toBe(false);
	});

	it('setError should set error and clear loading', () => {
		mgr.setLoading(true);
		mgr.setError('Failed to fetch blame');
		const state = mgr.getState();
		expect(state.error).toBe('Failed to fetch blame');
		expect(state.loading).toBe(false);
	});

	it('setLoading and setError should notify listeners', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.setLoading(true);
		expect(listener).toHaveBeenCalledTimes(1);
		mgr.setError('oops');
		expect(listener).toHaveBeenCalledTimes(2);
	});
});

// ============================================================
// GitBlameManager -- clear
// ============================================================

describe('GitBlameManager -- clear', () => {
	it('should remove all blame data', () => {
		const mgr = new GitBlameManager();
		mgr.setBlameData(makeSampleData(10));
		expect(mgr.getAllBlame()).toHaveLength(10);

		mgr.clear();
		expect(mgr.getAllBlame()).toHaveLength(0);
		expect(mgr.getLineBlame(0)).toBeUndefined();
	});

	it('should reset error and lastUpdated', () => {
		const mgr = new GitBlameManager();
		mgr.setBlameData(makeSampleData(1));
		mgr.setError('err');
		mgr.clear();

		const state = mgr.getState();
		expect(state.error).toBeNull();
		expect(state.lastUpdated).toBeNull();
	});

	it('should notify listeners', () => {
		const mgr = new GitBlameManager();
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.clear();
		expect(listener).toHaveBeenCalledTimes(1);
	});
});

// ============================================================
// GitBlameManager -- getLineBlame & getAllBlame
// ============================================================

describe('GitBlameManager -- getLineBlame & getAllBlame', () => {
	let mgr: GitBlameManager;

	beforeEach(() => {
		mgr = new GitBlameManager();
		mgr.setBlameData(makeSampleData(5));
	});

	it('getLineBlame should return info for existing line', () => {
		const info = mgr.getLineBlame(2);
		expect(info).toBeDefined();
		expect(info!.line).toBe(2);
	});

	it('getLineBlame should return undefined for non-existent line', () => {
		expect(mgr.getLineBlame(999)).toBeUndefined();
	});

	it('getAllBlame should return all entries', () => {
		const all = mgr.getAllBlame();
		expect(all).toHaveLength(5);
	});
});

// ============================================================
// GitBlameManager -- getState & getConfig immutability
// ============================================================

describe('GitBlameManager -- getState & getConfig immutability', () => {
	it('getState should return a copy', () => {
		const mgr = new GitBlameManager();
		const s1 = mgr.getState();
		const s2 = mgr.getState();
		expect(s1).not.toBe(s2);
		expect(s1.enabled).toBe(s2.enabled);
	});

	it('getConfig should return a copy', () => {
		const mgr = new GitBlameManager();
		const c1 = mgr.getConfig();
		const c2 = mgr.getConfig();
		expect(c1).not.toBe(c2);
		expect(c1.colorMode).toBe(c2.colorMode);
	});
});

// ============================================================
// GitBlameManager -- setConfig
// ============================================================

describe('GitBlameManager -- setConfig', () => {
	it('should merge partial config', () => {
		const mgr = new GitBlameManager();
		mgr.setConfig({ dateFormat: 'absolute' });
		expect(mgr.getConfig().dateFormat).toBe('absolute');
		// Other defaults preserved
		expect(mgr.getConfig().colorMode).toBe('age');
	});

	it('should recompute colors when colorMode changes', () => {
		const mgr = new GitBlameManager({ colorMode: 'age' });
		mgr.setBlameData([
			makeBlameInfo({ line: 0, author: 'Alice', timestamp: new Date() }),
			makeBlameInfo({ line: 1, author: 'Bob', timestamp: new Date() })
		]);

		mgr.getLineBlame(0)!.color; // age color established

		// Switch to author mode
		mgr.setConfig({ colorMode: 'author' });

		const authorColor0 = mgr.getLineBlame(0)!.color;
		const authorColor1 = mgr.getLineBlame(1)!.color;

		// Colors should differ between authors
		expect(authorColor0).not.toBe(authorColor1);
	});

	it('should notify listeners', () => {
		const mgr = new GitBlameManager();
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.setConfig({ showAuthor: false });
		expect(listener).toHaveBeenCalledTimes(1);
	});
});

// ============================================================
// GitBlameManager -- formatTimestamp
// ============================================================

describe('GitBlameManager -- formatTimestamp', () => {
	it('should format relative time for "just now"', () => {
		const mgr = new GitBlameManager({ dateFormat: 'relative' });
		const result = mgr.formatTimestamp(new Date());
		expect(result).toBe('just now');
	});

	it('should format relative time for minutes ago', () => {
		const mgr = new GitBlameManager({ dateFormat: 'relative' });
		const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
		const result = mgr.formatTimestamp(fiveMinAgo);
		expect(result).toBe('5m ago');
	});

	it('should format relative time for hours ago', () => {
		const mgr = new GitBlameManager({ dateFormat: 'relative' });
		const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
		const result = mgr.formatTimestamp(threeHoursAgo);
		expect(result).toBe('3h ago');
	});

	it('should format relative time for days ago', () => {
		const mgr = new GitBlameManager({ dateFormat: 'relative' });
		const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
		const result = mgr.formatTimestamp(twoDaysAgo);
		expect(result).toBe('2d ago');
	});

	it('should format relative time for weeks ago', () => {
		const mgr = new GitBlameManager({ dateFormat: 'relative' });
		const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
		const result = mgr.formatTimestamp(threeWeeksAgo);
		expect(result).toBe('3w ago');
	});

	it('should format relative time for months ago', () => {
		const mgr = new GitBlameManager({ dateFormat: 'relative' });
		const fourMonthsAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
		const result = mgr.formatTimestamp(fourMonthsAgo);
		expect(result).toBe('4mo ago');
	});

	it('should format relative time for years ago', () => {
		const mgr = new GitBlameManager({ dateFormat: 'relative' });
		const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
		const result = mgr.formatTimestamp(twoYearsAgo);
		expect(result).toBe('2y ago');
	});

	it('should format absolute date when dateFormat is absolute', () => {
		const mgr = new GitBlameManager({ dateFormat: 'absolute' });
		const date = new Date('2025-06-15T12:00:00Z');
		const result = mgr.formatTimestamp(date);
		// Should be a locale-formatted date string
		expect(result).toContain('2025');
		expect(result.length).toBeGreaterThan(0);
	});
});

// ============================================================
// GitBlameManager -- subscribe
// ============================================================

describe('GitBlameManager -- subscribe', () => {
	it('should call listener with state copy on changes', () => {
		const mgr = new GitBlameManager();
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.enable();

		expect(listener).toHaveBeenCalledTimes(1);
		const receivedState: BlameState = listener.mock.calls[0][0];
		expect(receivedState.enabled).toBe(true);
	});

	it('unsubscribe should stop notifications', () => {
		const mgr = new GitBlameManager();
		const listener = vi.fn();
		const unsub = mgr.subscribe(listener);
		unsub();
		mgr.enable();
		expect(listener).not.toHaveBeenCalled();
	});

	it('should catch listener errors without breaking other listeners', () => {
		const mgr = new GitBlameManager();
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const badListener = vi.fn(() => { throw new Error('boom'); });
		const goodListener = vi.fn();

		mgr.subscribe(badListener);
		mgr.subscribe(goodListener);

		mgr.enable();

		expect(badListener).toHaveBeenCalled();
		expect(goodListener).toHaveBeenCalled();
		expect(consoleSpy).toHaveBeenCalled();

		consoleSpy.mockRestore();
	});
});

// ============================================================
// generateMockBlameData
// ============================================================

describe('generateMockBlameData', () => {
	it('should generate the specified number of lines', () => {
		const data = generateMockBlameData(50);
		expect(data).toHaveLength(50);
	});

	it('should have sequential line numbers starting at 0', () => {
		const data = generateMockBlameData(10);
		for (let i = 0; i < 10; i++) {
			expect(data[i].line).toBe(i);
		}
	});

	it('should populate all required fields', () => {
		const data = generateMockBlameData(5);
		for (const info of data) {
			expect(typeof info.commitSha).toBe('string');
			expect(info.commitSha.length).toBeGreaterThan(0);
			expect(typeof info.fullSha).toBe('string');
			expect(typeof info.author).toBe('string');
			expect(typeof info.authorEmail).toBe('string');
			expect(info.timestamp).toBeInstanceOf(Date);
			expect(typeof info.message).toBe('string');
			expect(typeof info.uncommitted).toBe('boolean');
		}
	});

	it('should use known authors from the predefined set', () => {
		const knownAuthors = ['Alice Chen', 'Bob Smith', 'Carol White', 'David Lee'];
		const data = generateMockBlameData(100);
		for (const info of data) {
			expect(knownAuthors).toContain(info.author);
		}
	});

	it('should use known commit messages from the predefined set', () => {
		const knownMessages = [
			'Initial commit', 'Add feature X', 'Fix bug in Y',
			'Refactor Z module', 'Update dependencies', 'Improve performance',
			'Add tests', 'Fix typo', 'Clean up code', 'Add documentation'
		];
		const data = generateMockBlameData(100);
		for (const info of data) {
			expect(knownMessages).toContain(info.message);
		}
	});

	it('should handle lineCount of 0', () => {
		const data = generateMockBlameData(0);
		expect(data).toHaveLength(0);
	});

	it('should handle lineCount of 1', () => {
		const data = generateMockBlameData(1);
		expect(data).toHaveLength(1);
		expect(data[0].line).toBe(0);
	});

	it('consecutive lines often share the same commit', () => {
		// With 100 lines, there should be fewer unique commits than lines
		const data = generateMockBlameData(100);
		const uniqueCommits = new Set(data.map(d => d.commitSha));
		expect(uniqueCommits.size).toBeLessThan(100);
	});
});

// ============================================================
// Integration: setBlameData + setConfig color recomputation
// ============================================================

describe('GitBlameManager -- integration: color recomputation on config change', () => {
	it('switching from age to author should change colors', () => {
		const mgr = new GitBlameManager({ colorMode: 'age' });
		const data = [
			makeBlameInfo({ line: 0, author: 'Alice', timestamp: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) }),
			makeBlameInfo({ line: 1, author: 'Bob', timestamp: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) })
		];
		mgr.setBlameData(data);

		// In age mode, both lines have same age so same color
		const ageColor0 = mgr.getLineBlame(0)!.color;
		const ageColor1 = mgr.getLineBlame(1)!.color;
		expect(ageColor0).toBe(ageColor1);

		// Switch to author mode
		mgr.setConfig({ colorMode: 'author' });

		// Now different authors should have different colors
		const authorColor0 = mgr.getLineBlame(0)!.color;
		const authorColor1 = mgr.getLineBlame(1)!.color;
		expect(authorColor0).not.toBe(authorColor1);
	});

	it('switching from author to age should recompute based on timestamps', () => {
		const mgr = new GitBlameManager({ colorMode: 'author' });
		const data = [
			makeBlameInfo({ line: 0, author: 'Alice', timestamp: new Date() }),
			makeBlameInfo({ line: 1, author: 'Alice', timestamp: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) })
		];
		mgr.setBlameData(data);

		// In author mode, same author = same color
		expect(mgr.getLineBlame(0)!.color).toBe(mgr.getLineBlame(1)!.color);

		// Switch to age mode
		mgr.setConfig({ colorMode: 'age' });

		// Different ages should yield different colors
		expect(mgr.getLineBlame(0)!.color).not.toBe(mgr.getLineBlame(1)!.color);
	});
});
