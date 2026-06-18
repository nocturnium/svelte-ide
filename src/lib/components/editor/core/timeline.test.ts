import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	TimelineManager,
	createTimelineManager,
	getTimelineManager,
	formatTimestamp,
	formatDuration,
	type SnapshotMetadata,
	type TimelineEvent
} from './timeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetadata(overrides: Partial<SnapshotMetadata> = {}): SnapshotMetadata {
	return {
		author: 'user-1',
		authorColor: '#ff0000',
		isAI: false,
		changeType: 'edit',
		description: 'test edit',
		...overrides
	};
}

// ---------------------------------------------------------------------------
// TimelineManager
// ---------------------------------------------------------------------------

describe('TimelineManager', () => {
	let manager: TimelineManager;

	beforeEach(() => {
		vi.useFakeTimers();
		manager = new TimelineManager();
	});

	afterEach(() => {
		manager.stop();
		vi.useRealTimers();
	});

	// ---- Construction & defaults ------------------------------------------

	describe('constructor', () => {
		it('creates with default config', () => {
			expect(manager.getSnapshots()).toHaveLength(0);
		});

		it('accepts partial config overrides', () => {
			const custom = new TimelineManager({ maxSnapshots: 10 });
			expect(custom.getSnapshots()).toHaveLength(0);
		});
	});

	// ---- captureSnapshot ---------------------------------------------------

	describe('captureSnapshot', () => {
		it('captures a snapshot and returns it', () => {
			const snap = manager.captureSnapshot('hello\nworld', makeMetadata());
			expect(snap).toBeDefined();
			expect(snap.content).toBe('hello\nworld');
			expect(snap.lineCount).toBe(2);
			expect(snap.id).toMatch(/^snapshot-/);
		});

		it('calculates diff from previous snapshot', () => {
			manager.captureSnapshot('line1\nline2', makeMetadata());
			const snap2 = manager.captureSnapshot('line1\nline2\nline3', makeMetadata());

			expect(snap2.diffFromPrevious).toBeDefined();
			expect(snap2.diffFromPrevious!.addedLines).toBeGreaterThan(0);
		});

		it('first snapshot has no diff', () => {
			const snap = manager.captureSnapshot('hello', makeMetadata());
			expect(snap.diffFromPrevious).toBeUndefined();
		});

		it('emits snapshot-added event', () => {
			const events: TimelineEvent[] = [];
			manager.subscribe((e) => events.push(e));

			manager.captureSnapshot('test', makeMetadata());

			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('snapshot-added');
		});

		it('prunes snapshots when exceeding maxSnapshots', () => {
			const small = new TimelineManager({ maxSnapshots: 5 });
			for (let i = 0; i < 10; i++) {
				small.captureSnapshot(`content-${i}`, makeMetadata({ changeType: 'edit' }));
			}
			expect(small.getSnapshots().length).toBeLessThanOrEqual(5);
		});

		it('prune keeps significant snapshots (commit, save, checkpoint)', () => {
			const small = new TimelineManager({ maxSnapshots: 4 });
			small.captureSnapshot('a', makeMetadata({ changeType: 'checkpoint' }));
			small.captureSnapshot('b', makeMetadata({ changeType: 'edit' }));
			small.captureSnapshot('c', makeMetadata({ changeType: 'save' }));
			small.captureSnapshot('d', makeMetadata({ changeType: 'edit' }));
			small.captureSnapshot('e', makeMetadata({ changeType: 'edit' }));
			small.captureSnapshot('f', makeMetadata({ changeType: 'commit' }));

			const types = small.getSnapshots().map((s) => s.metadata.changeType);
			// Significant types should be preserved
			expect(types).toContain('checkpoint');
			expect(types).toContain('save');
			expect(types).toContain('commit');
		});
	});

	// ---- start / stop / auto-snapshot ------------------------------------

	describe('start and stop', () => {
		it('captures initial snapshot on start', () => {
			manager.start('initial content');
			expect(manager.getSnapshots()).toHaveLength(1);
			expect(manager.getSnapshots()[0].content).toBe('initial content');
			expect(manager.getSnapshots()[0].metadata.changeType).toBe('checkpoint');
		});

		it('captures auto-snapshots at configured interval', () => {
			manager.start('content');
			expect(manager.getSnapshots()).toHaveLength(1);

			vi.advanceTimersByTime(30000);
			expect(manager.getSnapshots().length).toBeGreaterThanOrEqual(2);
		});

		it('stop prevents further auto-snapshots', () => {
			manager.start('content');
			manager.stop();
			const countAfterStop = manager.getSnapshots().length;

			vi.advanceTimersByTime(60000);
			expect(manager.getSnapshots()).toHaveLength(countAfterStop);
		});
	});

	// ---- recordChange -----------------------------------------------------

	describe('recordChange', () => {
		it('updates lastContent used by auto-snapshot timer', () => {
			manager.start('old content');
			manager.recordChange('new content');

			vi.advanceTimersByTime(30000);
			const snaps = manager.getSnapshots();
			const lastSnap = snaps[snaps.length - 1];
			expect(lastSnap.content).toBe('new content');
		});
	});

	// ---- captureOnEdit ----------------------------------------------------

	describe('captureOnEdit', () => {
		it('captures when line count difference exceeds threshold', () => {
			manager.captureSnapshot('line1', makeMetadata());
			const before = manager.getSnapshots().length;

			// Add enough lines to exceed default minLinesForSnapshot (5)
			manager.captureOnEdit('l1\nl2\nl3\nl4\nl5\nl6\nl7');
			expect(manager.getSnapshots().length).toBe(before + 1);
		});

		it('captures when enough time has passed (>10s)', () => {
			manager.captureSnapshot('line1', makeMetadata());
			const before = manager.getSnapshots().length;

			vi.advanceTimersByTime(11000);
			manager.captureOnEdit('line1-changed');
			expect(manager.getSnapshots().length).toBe(before + 1);
		});

		it('skips if change is too small and too recent', () => {
			manager.captureSnapshot('line1', makeMetadata());
			const before = manager.getSnapshots().length;

			// Tiny change, no time elapsed
			manager.captureOnEdit('line1-x');
			expect(manager.getSnapshots().length).toBe(before);
		});

		it('uses provided author overrides', () => {
			manager.captureSnapshot('a', makeMetadata());
			vi.advanceTimersByTime(11000);
			manager.captureOnEdit('b', {
				author: 'custom-user',
				isAI: true,
				changeType: 'ai-suggestion'
			});

			const last = manager.getSnapshots()[manager.getSnapshots().length - 1];
			expect(last.metadata.author).toBe('custom-user');
			expect(last.metadata.isAI).toBe(true);
			expect(last.metadata.changeType).toBe('ai-suggestion');
		});

		it('captures distinct real edit states and reconstructs stored content exactly', () => {
			const liveManager = new TimelineManager({ minLinesForSnapshot: 0 });
			liveManager.start('const total = 1;');

			const editStates = [
				'const total = 1;\nconst tax = 0.08;',
				'const total = 2;\nconst tax = 0.08;',
				'const total = 2;\nconst tax = 0.08;\nconst grandTotal = total + tax;'
			];

			for (const state of editStates) {
				vi.advanceTimersByTime(1);
				liveManager.captureOnEdit(
					state,
					makeMetadata({ author: 'local-user', description: 'Edit' })
				);
			}

			const contents = liveManager.getSnapshots().map((snapshot) => snapshot.content);
			expect(contents).toEqual(['const total = 1;', ...editStates]);
			expect(new Set(contents).size).toBe(contents.length);

			const snapshots = liveManager.getSnapshots();
			expect(liveManager.getContentAtPosition(0)).toBe('const total = 1;');
			expect(liveManager.getContentAtPosition(1)).toBe(editStates[2]);
			expect(liveManager.getContentAtPosition(0.5)).toBe(editStates[0]);
			expect(snapshots[1].diffFromPrevious).toEqual({
				addedLines: 1,
				removedLines: 0,
				changedRegions: [{ start: 1, end: 1 }]
			});
			expect(snapshots[2].diffFromPrevious).toEqual({
				addedLines: 1,
				removedLines: 1,
				changedRegions: [{ start: 0, end: 0 }]
			});

			liveManager.stop();
		});
	});

	// ---- captureAISuggestion ----------------------------------------------

	describe('captureAISuggestion', () => {
		it('captures with AI metadata', () => {
			manager.captureAISuggestion('ai content', 'Added logging');
			const snap = manager.getSnapshots()[0];

			expect(snap.metadata.author).toBe('ai-assistant');
			expect(snap.metadata.authorColor).toBe('#a855f7');
			expect(snap.metadata.isAI).toBe(true);
			expect(snap.metadata.description).toBe('Added logging');
			expect(snap.metadata.changeType).toBe('ai-suggestion');
		});
	});

	// ---- captureOnSave ----------------------------------------------------

	describe('captureOnSave', () => {
		it('captures with save metadata', () => {
			manager.captureOnSave('saved content');
			const snap = manager.getSnapshots()[0];

			expect(snap.metadata.changeType).toBe('save');
			expect(snap.metadata.description).toBe('Saved');
			expect(snap.metadata.isAI).toBe(false);
		});
	});

	// ---- getSnapshots -----------------------------------------------------

	describe('getSnapshots', () => {
		it('returns readonly array', () => {
			manager.captureSnapshot('a', makeMetadata());
			const snaps = manager.getSnapshots();
			expect(Array.isArray(snaps)).toBe(true);
			expect(snaps).toHaveLength(1);
		});
	});

	// ---- getSnapshotAtPosition --------------------------------------------

	describe('getSnapshotAtPosition', () => {
		it('returns null when no snapshots', () => {
			expect(manager.getSnapshotAtPosition(0.5)).toBeNull();
		});

		it('returns first snapshot at position 0', () => {
			manager.captureSnapshot('first', makeMetadata());
			manager.captureSnapshot('second', makeMetadata());
			expect(manager.getSnapshotAtPosition(0)?.content).toBe('first');
		});

		it('returns last snapshot at position 1', () => {
			manager.captureSnapshot('first', makeMetadata());
			manager.captureSnapshot('second', makeMetadata());
			expect(manager.getSnapshotAtPosition(1)?.content).toBe('second');
		});

		it('returns last snapshot at position > 1', () => {
			manager.captureSnapshot('first', makeMetadata());
			manager.captureSnapshot('second', makeMetadata());
			expect(manager.getSnapshotAtPosition(1.5)?.content).toBe('second');
		});

		it('returns first snapshot at position < 0', () => {
			manager.captureSnapshot('first', makeMetadata());
			manager.captureSnapshot('second', makeMetadata());
			expect(manager.getSnapshotAtPosition(-0.5)?.content).toBe('first');
		});

		it('returns intermediate snapshot at mid-position', () => {
			manager.captureSnapshot('a', makeMetadata());
			manager.captureSnapshot('b', makeMetadata());
			manager.captureSnapshot('c', makeMetadata());
			// position 0.5 => index floor(0.5 * 2) = 1
			expect(manager.getSnapshotAtPosition(0.5)?.content).toBe('b');
		});
	});

	// ---- getContentAtPosition ---------------------------------------------

	describe('getContentAtPosition', () => {
		it('returns null when no snapshots', () => {
			expect(manager.getContentAtPosition(0.5)).toBeNull();
		});

		it('returns content string for valid position', () => {
			manager.captureSnapshot('hello', makeMetadata());
			expect(manager.getContentAtPosition(0.5)).toBe('hello');
		});
	});

	// ---- getSnapshotById --------------------------------------------------

	describe('getSnapshotById', () => {
		it('finds snapshot by id', () => {
			const snap = manager.captureSnapshot('content', makeMetadata());
			expect(manager.getSnapshotById(snap.id)).toBe(snap);
		});

		it('returns undefined for unknown id', () => {
			expect(manager.getSnapshotById('nonexistent')).toBeUndefined();
		});
	});

	// ---- getDuration ------------------------------------------------------

	describe('getDuration', () => {
		it('returns 0 with fewer than 2 snapshots', () => {
			expect(manager.getDuration()).toBe(0);
			manager.captureSnapshot('a', makeMetadata());
			expect(manager.getDuration()).toBe(0);
		});

		it('returns time span between first and last snapshot', () => {
			manager.captureSnapshot('a', makeMetadata());
			vi.advanceTimersByTime(5000);
			manager.captureSnapshot('b', makeMetadata());
			expect(manager.getDuration()).toBe(5000);
		});
	});

	// ---- getPositionForTimestamp -------------------------------------------

	describe('getPositionForTimestamp', () => {
		it('returns 1 with fewer than 2 snapshots', () => {
			expect(manager.getPositionForTimestamp(Date.now())).toBe(1);
		});

		it('returns 0 for timestamp at start', () => {
			manager.captureSnapshot('a', makeMetadata());
			const startTs = manager.getSnapshots()[0].timestamp;
			vi.advanceTimersByTime(10000);
			manager.captureSnapshot('b', makeMetadata());

			expect(manager.getPositionForTimestamp(startTs)).toBe(0);
		});

		it('returns 1 for timestamp at end', () => {
			manager.captureSnapshot('a', makeMetadata());
			vi.advanceTimersByTime(10000);
			manager.captureSnapshot('b', makeMetadata());
			const endTs = manager.getSnapshots()[1].timestamp;

			expect(manager.getPositionForTimestamp(endTs)).toBe(1);
		});

		it('returns 0.5 for midpoint timestamp', () => {
			manager.captureSnapshot('a', makeMetadata());
			const startTs = manager.getSnapshots()[0].timestamp;
			vi.advanceTimersByTime(10000);
			manager.captureSnapshot('b', makeMetadata());

			expect(manager.getPositionForTimestamp(startTs + 5000)).toBeCloseTo(0.5);
		});

		it('clamps to 0 for timestamp before start', () => {
			manager.captureSnapshot('a', makeMetadata());
			const startTs = manager.getSnapshots()[0].timestamp;
			vi.advanceTimersByTime(10000);
			manager.captureSnapshot('b', makeMetadata());

			expect(manager.getPositionForTimestamp(startTs - 5000)).toBe(0);
		});

		it('clamps to 1 for timestamp after end', () => {
			manager.captureSnapshot('a', makeMetadata());
			vi.advanceTimersByTime(10000);
			manager.captureSnapshot('b', makeMetadata());
			const endTs = manager.getSnapshots()[1].timestamp;

			expect(manager.getPositionForTimestamp(endTs + 5000)).toBe(1);
		});
	});

	// ---- getMarkers -------------------------------------------------------

	describe('getMarkers', () => {
		it('returns empty array when no snapshots', () => {
			expect(manager.getMarkers()).toEqual([]);
		});

		it('returns markers for each snapshot', () => {
			manager.captureSnapshot('a', makeMetadata({ description: 'First' }));
			vi.advanceTimersByTime(5000);
			manager.captureSnapshot('b', makeMetadata({ description: 'Second' }));

			const markers = manager.getMarkers();
			expect(markers).toHaveLength(2);
			expect(markers[0].position).toBe(0);
			expect(markers[1].position).toBe(1);
			expect(markers[0].label).toBe('First');
			expect(markers[1].label).toBe('Second');
		});

		it('uses changeType as label fallback when description is missing', () => {
			manager.captureSnapshot('a', { ...makeMetadata(), description: undefined });
			const markers = manager.getMarkers();
			expect(markers[0].label).toBe('edit');
		});

		it('handles single snapshot (duration = 0) without error', () => {
			manager.captureSnapshot('a', makeMetadata());
			const markers = manager.getMarkers();
			expect(markers).toHaveLength(1);
			// position = (ts - ts) / 1 = 0
			expect(markers[0].position).toBe(0);
		});
	});

	// ---- subscribe --------------------------------------------------------

	describe('subscribe', () => {
		it('receives events and can unsubscribe', () => {
			const events: TimelineEvent[] = [];
			const unsub = manager.subscribe((e) => events.push(e));

			manager.captureSnapshot('a', makeMetadata());
			expect(events).toHaveLength(1);

			unsub();
			manager.captureSnapshot('b', makeMetadata());
			expect(events).toHaveLength(1); // no new event
		});

		it('handles listener errors gracefully', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			manager.subscribe(() => {
				throw new Error('boom');
			});

			// Should not throw
			expect(() => manager.captureSnapshot('a', makeMetadata())).not.toThrow();
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	// ---- clear ------------------------------------------------------------

	describe('clear', () => {
		it('removes all snapshots', () => {
			manager.captureSnapshot('a', makeMetadata());
			manager.captureSnapshot('b', makeMetadata());
			manager.clear();
			expect(manager.getSnapshots()).toHaveLength(0);
		});
	});

	// ---- diff calculation -------------------------------------------------

	describe('diff calculation', () => {
		it('detects added lines', () => {
			manager.captureSnapshot('a\nb', makeMetadata());
			const snap = manager.captureSnapshot('a\nb\nc\nd', makeMetadata());
			expect(snap.diffFromPrevious!.addedLines).toBeGreaterThan(0);
		});

		it('detects removed lines', () => {
			manager.captureSnapshot('a\nb\nc\nd', makeMetadata());
			const snap = manager.captureSnapshot('a\nb', makeMetadata());
			expect(snap.diffFromPrevious!.removedLines).toBeGreaterThan(0);
		});

		it('detects changed lines', () => {
			manager.captureSnapshot('hello\nworld', makeMetadata());
			const snap = manager.captureSnapshot('hello\nearth', makeMetadata());
			expect(snap.diffFromPrevious!.addedLines).toBe(1);
			expect(snap.diffFromPrevious!.removedLines).toBe(1);
		});

		it('reports changed regions', () => {
			manager.captureSnapshot('a\nb\nc\nd', makeMetadata());
			const snap = manager.captureSnapshot('a\nX\nc\nY', makeMetadata());
			expect(snap.diffFromPrevious!.changedRegions.length).toBeGreaterThanOrEqual(1);
		});

		it('returns no diff for identical content', () => {
			manager.captureSnapshot('same', makeMetadata());
			const snap = manager.captureSnapshot('same', makeMetadata());
			expect(snap.diffFromPrevious!.addedLines).toBe(0);
			expect(snap.diffFromPrevious!.removedLines).toBe(0);
			expect(snap.diffFromPrevious!.changedRegions).toHaveLength(0);
		});
	});
});

// ---------------------------------------------------------------------------
// Factory & singleton
// ---------------------------------------------------------------------------

describe('createTimelineManager', () => {
	it('returns a TimelineManager instance', () => {
		const m = createTimelineManager();
		expect(m).toBeInstanceOf(TimelineManager);
	});

	it('passes config through', () => {
		const m = createTimelineManager({ maxSnapshots: 3 });
		for (let i = 0; i < 6; i++) {
			m.captureSnapshot(`content-${i}`, {
				author: 'u',
				authorColor: '#000',
				isAI: false,
				changeType: 'edit'
			});
		}
		expect(m.getSnapshots().length).toBeLessThanOrEqual(3);
	});
});

describe('getTimelineManager', () => {
	it('returns a TimelineManager instance', () => {
		const m = getTimelineManager();
		expect(m).toBeInstanceOf(TimelineManager);
	});

	it('returns the same instance on subsequent calls', () => {
		const a = getTimelineManager();
		const b = getTimelineManager();
		expect(a).toBe(b);
	});
});

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe('formatTimestamp', () => {
	it('returns a non-empty string', () => {
		const result = formatTimestamp(Date.now());
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);
	});

	it('formats same-day timestamps as time only', () => {
		const now = Date.now();
		const result = formatTimestamp(now);
		// Should NOT contain a month abbreviation if same day
		// This test asserts it is short (time only format)
		expect(result.length).toBeLessThan(20);
	});

	it('formats different-day timestamps with date', () => {
		// A date far in the past
		const pastDate = new Date('2020-01-15T10:30:00').getTime();
		const result = formatTimestamp(pastDate);
		// Should contain month abbreviation
		expect(result).toMatch(/Jan/);
	});
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
	it('formats seconds', () => {
		expect(formatDuration(5000)).toBe('5s');
	});

	it('formats zero', () => {
		expect(formatDuration(0)).toBe('0s');
	});

	it('formats minutes and seconds', () => {
		expect(formatDuration(65000)).toBe('1m 5s');
	});

	it('formats hours and minutes', () => {
		expect(formatDuration(3661000)).toBe('1h 1m');
	});

	it('formats exact minutes', () => {
		expect(formatDuration(120000)).toBe('2m 0s');
	});

	it('formats exact hours', () => {
		expect(formatDuration(7200000)).toBe('2h 0m');
	});
});
