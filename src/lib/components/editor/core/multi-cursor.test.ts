import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	CursorManager,
	createCursorManager,
	comparePositions,
	positionsEqual,
	isPositionBefore,
	isPositionBeforeOrEqual,
	getSelectionStart,
	getSelectionEnd,
	isSelectionEmpty,
	selectionsOverlap,
	mergeSelections
} from './multi-cursor';
import type { Cursor } from './multi-cursor';
import type { Position, Selection } from './state';

// ============================================================
// Helpers
// ============================================================

/** Shorthand for creating a position */
function pos(line: number, column: number): Position {
	return { line, column };
}

/** Shorthand for creating a selection */
function sel(anchorLine: number, anchorCol: number, headLine: number, headCol: number): Selection {
	return { anchor: pos(anchorLine, anchorCol), head: pos(headLine, headCol) };
}

// ============================================================
// Utility Functions
// ============================================================

describe('comparePositions', () => {
	it('returns 0 for equal positions', () => {
		expect(comparePositions(pos(0, 0), pos(0, 0))).toBe(0);
		expect(comparePositions(pos(5, 10), pos(5, 10))).toBe(0);
	});

	it('orders by line first', () => {
		expect(comparePositions(pos(1, 0), pos(2, 0))).toBeLessThan(0);
		expect(comparePositions(pos(3, 0), pos(1, 0))).toBeGreaterThan(0);
	});

	it('orders by column when lines are equal', () => {
		expect(comparePositions(pos(1, 3), pos(1, 7))).toBeLessThan(0);
		expect(comparePositions(pos(1, 7), pos(1, 3))).toBeGreaterThan(0);
	});

	it('line difference takes priority over column', () => {
		expect(comparePositions(pos(1, 100), pos(2, 0))).toBeLessThan(0);
	});
});

describe('positionsEqual', () => {
	it('returns true for identical positions', () => {
		expect(positionsEqual(pos(0, 0), pos(0, 0))).toBe(true);
		expect(positionsEqual(pos(5, 10), pos(5, 10))).toBe(true);
	});

	it('returns false when line differs', () => {
		expect(positionsEqual(pos(0, 0), pos(1, 0))).toBe(false);
	});

	it('returns false when column differs', () => {
		expect(positionsEqual(pos(0, 0), pos(0, 1))).toBe(false);
	});

	it('returns false when both differ', () => {
		expect(positionsEqual(pos(1, 2), pos(3, 4))).toBe(false);
	});
});

describe('isPositionBefore', () => {
	it('returns true when a is before b', () => {
		expect(isPositionBefore(pos(0, 0), pos(0, 1))).toBe(true);
		expect(isPositionBefore(pos(0, 5), pos(1, 0))).toBe(true);
	});

	it('returns false when a equals b', () => {
		expect(isPositionBefore(pos(1, 1), pos(1, 1))).toBe(false);
	});

	it('returns false when a is after b', () => {
		expect(isPositionBefore(pos(1, 0), pos(0, 5))).toBe(false);
	});
});

describe('isPositionBeforeOrEqual', () => {
	it('returns true when a is before b', () => {
		expect(isPositionBeforeOrEqual(pos(0, 0), pos(0, 1))).toBe(true);
	});

	it('returns true when a equals b', () => {
		expect(isPositionBeforeOrEqual(pos(1, 1), pos(1, 1))).toBe(true);
	});

	it('returns false when a is after b', () => {
		expect(isPositionBeforeOrEqual(pos(1, 0), pos(0, 5))).toBe(false);
	});
});

describe('getSelectionStart', () => {
	it('returns anchor when anchor is before head (forward selection)', () => {
		const s = sel(1, 0, 3, 5);
		const start = getSelectionStart(s);
		expect(start.line).toBe(1);
		expect(start.column).toBe(0);
	});

	it('returns head when head is before anchor (backward selection)', () => {
		const s = sel(3, 5, 1, 0);
		const start = getSelectionStart(s);
		expect(start.line).toBe(1);
		expect(start.column).toBe(0);
	});

	it('returns either when anchor equals head', () => {
		const s = sel(2, 3, 2, 3);
		const start = getSelectionStart(s);
		expect(start.line).toBe(2);
		expect(start.column).toBe(3);
	});
});

describe('getSelectionEnd', () => {
	it('returns head when anchor is before head (forward selection)', () => {
		const s = sel(1, 0, 3, 5);
		const end = getSelectionEnd(s);
		expect(end.line).toBe(3);
		expect(end.column).toBe(5);
	});

	it('returns anchor when head is before anchor (backward selection)', () => {
		const s = sel(3, 5, 1, 0);
		const end = getSelectionEnd(s);
		expect(end.line).toBe(3);
		expect(end.column).toBe(5);
	});

	it('returns either when anchor equals head', () => {
		const s = sel(2, 3, 2, 3);
		const end = getSelectionEnd(s);
		expect(end.line).toBe(2);
		expect(end.column).toBe(3);
	});
});

describe('isSelectionEmpty', () => {
	it('returns true when anchor equals head', () => {
		expect(isSelectionEmpty(sel(0, 0, 0, 0))).toBe(true);
		expect(isSelectionEmpty(sel(5, 10, 5, 10))).toBe(true);
	});

	it('returns false when anchor differs from head', () => {
		expect(isSelectionEmpty(sel(0, 0, 0, 1))).toBe(false);
		expect(isSelectionEmpty(sel(0, 0, 1, 0))).toBe(false);
	});
});

describe('selectionsOverlap', () => {
	it('detects overlapping selections', () => {
		const a = sel(1, 0, 1, 10);
		const b = sel(1, 5, 1, 15);
		expect(selectionsOverlap(a, b)).toBe(true);
	});

	it('detects touching selections (end of a equals start of b)', () => {
		const a = sel(1, 0, 1, 5);
		const b = sel(1, 5, 1, 10);
		expect(selectionsOverlap(a, b)).toBe(true);
	});

	it('returns true for completely contained selections', () => {
		const outer = sel(1, 0, 1, 20);
		const inner = sel(1, 5, 1, 10);
		expect(selectionsOverlap(outer, inner)).toBe(true);
		expect(selectionsOverlap(inner, outer)).toBe(true);
	});

	it('returns false for non-overlapping selections', () => {
		const a = sel(1, 0, 1, 5);
		const b = sel(1, 6, 1, 10);
		expect(selectionsOverlap(a, b)).toBe(false);
	});

	it('returns false for selections on different lines with no overlap', () => {
		const a = sel(1, 0, 1, 10);
		const b = sel(3, 0, 3, 10);
		expect(selectionsOverlap(a, b)).toBe(false);
	});

	it('handles backward selections correctly', () => {
		const a = sel(1, 10, 1, 0); // backward
		const b = sel(1, 5, 1, 15); // forward
		expect(selectionsOverlap(a, b)).toBe(true);
	});

	it('detects overlap for empty selections at the same position', () => {
		const a = sel(1, 5, 1, 5);
		const b = sel(1, 5, 1, 5);
		expect(selectionsOverlap(a, b)).toBe(true);
	});
});

describe('mergeSelections', () => {
	it('merges overlapping selections into their union', () => {
		const a = sel(1, 0, 1, 10);
		const b = sel(1, 5, 1, 15);
		const merged = mergeSelections(a, b);
		expect(merged.anchor.line).toBe(1);
		expect(merged.anchor.column).toBe(0);
		expect(merged.head.line).toBe(1);
		expect(merged.head.column).toBe(15);
	});

	it('merges when one contains the other', () => {
		const outer = sel(1, 0, 3, 10);
		const inner = sel(2, 0, 2, 5);
		const merged = mergeSelections(outer, inner);
		expect(merged.anchor).toEqual(pos(1, 0));
		expect(merged.head).toEqual(pos(3, 10));
	});
});

// ============================================================
// CursorManager Initialization
// ============================================================

describe('CursorManager — Initialization', () => {
	it('starts with one primary cursor at 0:0', () => {
		const manager = createCursorManager();
		expect(manager.count).toBe(1);
		const primary = manager.getPrimary();
		expect(primary.selection.head).toEqual(pos(0, 0));
		expect(primary.selection.anchor).toEqual(pos(0, 0));
	});

	it('primary cursor has isPrimary=true', () => {
		const manager = createCursorManager();
		const primary = manager.getPrimary();
		expect(primary.isPrimary).toBe(true);
	});

	it('uses default maxCursors of 100 when no config provided', () => {
		const manager = createCursorManager();
		// Add 99 more cursors (100 total including the initial one)
		// We test that 99 additions succeed by placing them at unique positions
		for (let i = 1; i < 100; i++) {
			manager.addCursor(pos(i, 0));
		}
		// After merging won't reduce count since all are on different lines
		expect(manager.count).toBe(100);
	});

	it('accepts a custom maxCursors config', () => {
		const manager = createCursorManager({ maxCursors: 3 });
		manager.addCursor(pos(1, 0));
		manager.addCursor(pos(2, 0));
		// Already at 3 cursors (1 initial + 2 added), next non-primary add returns closest
		const _result = manager.addCursor(pos(3, 0));
		// Should not increase count beyond maxCursors
		expect(manager.count).toBe(3);
	});
});

// ============================================================
// CursorManager — Cursor Operations
// ============================================================

describe('CursorManager — Cursor Operations', () => {
	let manager: InstanceType<typeof CursorManager>;

	beforeEach(() => {
		manager = createCursorManager();
	});

	it('addCursor adds a new cursor and count increases', () => {
		expect(manager.count).toBe(1);
		manager.addCursor(pos(5, 3));
		expect(manager.count).toBe(2);
	});

	it('addCursor returns the new cursor with correct position', () => {
		const cursor = manager.addCursor(pos(3, 7));
		expect(cursor.selection.head).toEqual(pos(3, 7));
		expect(cursor.selection.anchor).toEqual(pos(3, 7));
	});

	it('removeCursor removes a cursor by id', () => {
		const c = manager.addCursor(pos(2, 0));
		expect(manager.count).toBe(2);
		const removed = manager.removeCursor(c.id);
		expect(removed).toBe(true);
		expect(manager.count).toBe(1);
	});

	it('cannot remove the last remaining cursor', () => {
		const primary = manager.getPrimary();
		const removed = manager.removeCursor(primary.id);
		expect(removed).toBe(false);
		expect(manager.count).toBe(1);
	});

	it('removeCursor promotes another cursor to primary when primary is removed', () => {
		manager.addCursor(pos(5, 0));
		const primaryId = manager.getPrimary().id;
		manager.removeCursor(primaryId);
		// The remaining cursor should now be primary
		expect(manager.getPrimary().isPrimary).toBe(true);
		expect(manager.count).toBe(1);
	});

	it('setCursor updates position and clears selection', () => {
		const primary = manager.getPrimary();
		manager.setCursor(primary.id, pos(10, 5));
		const updated = manager.getPrimary();
		expect(updated.selection.head).toEqual(pos(10, 5));
		expect(updated.selection.anchor).toEqual(pos(10, 5));
	});

	it('clearSecondary removes all non-primary cursors', () => {
		manager.addCursor(pos(1, 0));
		manager.addCursor(pos(2, 0));
		manager.addCursor(pos(3, 0));
		expect(manager.count).toBe(4);
		manager.clearSecondary();
		expect(manager.count).toBe(1);
		expect(manager.getPrimary().isPrimary).toBe(true);
	});

	it('clearSecondary is a no-op when there is only one cursor', () => {
		manager.clearSecondary();
		expect(manager.count).toBe(1);
	});

	it('hasMultiple reports false with one cursor', () => {
		expect(manager.hasMultiple).toBe(false);
	});

	it('hasMultiple reports true with multiple cursors', () => {
		manager.addCursor(pos(1, 0));
		expect(manager.hasMultiple).toBe(true);
	});

	it('setSelection sets anchor and head on a cursor', () => {
		const primary = manager.getPrimary();
		manager.setSelection(primary.id, pos(1, 0), pos(1, 10));
		const updated = manager.getPrimary();
		expect(updated.selection.anchor).toEqual(pos(1, 0));
		expect(updated.selection.head).toEqual(pos(1, 10));
	});

	it('extendSelection moves head while keeping anchor', () => {
		const primary = manager.getPrimary();
		// First set a position
		manager.setCursor(primary.id, pos(2, 5));
		// Now extend selection from that anchor
		manager.extendSelection(primary.id, pos(2, 15));
		const updated = manager.getPrimary();
		expect(updated.selection.anchor).toEqual(pos(2, 5));
		expect(updated.selection.head).toEqual(pos(2, 15));
	});

	it('getSortedCursors returns cursors ordered by position', () => {
		// Primary is at 0,0. Add cursors in non-sorted order.
		manager.addCursor(pos(5, 0));
		manager.addCursor(pos(2, 0));
		manager.addCursor(pos(8, 0));

		const sorted = manager.getSortedCursors();
		expect(sorted.length).toBe(4);
		for (let i = 1; i < sorted.length; i++) {
			const prev = getSelectionStart(sorted[i - 1].selection);
			const curr = getSelectionStart(sorted[i].selection);
			expect(comparePositions(prev, curr)).toBeLessThanOrEqual(0);
		}
	});

	it('getSortedCursorsReverse returns cursors in bottom-to-top order', () => {
		manager.addCursor(pos(5, 0));
		manager.addCursor(pos(2, 0));

		const reversed = (
			manager as InstanceType<typeof CursorManager> & { getSortedCursorsReverse(): Cursor[] }
		).getSortedCursorsReverse();
		expect(reversed.length).toBe(3);
		for (let i = 1; i < reversed.length; i++) {
			const prev = getSelectionStart(reversed[i - 1].selection);
			const curr = getSelectionStart(reversed[i].selection);
			expect(comparePositions(prev, curr)).toBeGreaterThanOrEqual(0);
		}
	});

	it('maxCursors limit is respected', () => {
		const mgr = createCursorManager({ maxCursors: 2 });
		mgr.addCursor(pos(1, 0)); // now 2 cursors
		expect(mgr.count).toBe(2);

		// Adding a third non-primary cursor should not increase count
		mgr.addCursor(pos(2, 0));
		expect(mgr.count).toBe(2);
	});

	it('maxCursors does not prevent adding a primary cursor', () => {
		const mgr = createCursorManager({ maxCursors: 1 });
		expect(mgr.count).toBe(1);
		// Adding as primary should still work even at capacity
		mgr.addCursor(pos(1, 0), true);
		expect(mgr.count).toBe(2);
	});

	it('removeLastSecondary removes the most recently added secondary cursor', () => {
		manager.addCursor(pos(1, 0));
		manager.addCursor(pos(2, 0));
		const c3 = manager.addCursor(pos(3, 0));
		expect(manager.count).toBe(4);

		manager.removeLastSecondary();
		expect(manager.count).toBe(3);

		// The last added secondary (c3) should be gone
		const cursors = manager.getCursors();
		const ids = cursors.map((c) => c.id);
		expect(ids).not.toContain(c3.id);
	});

	it('removeLastSecondary returns false when only one cursor', () => {
		expect(manager.removeLastSecondary()).toBe(false);
	});
});

// ============================================================
// CursorManager — Merging
// ============================================================

describe('CursorManager — Merging', () => {
	it('merges cursors at the same position', () => {
		const manager = createCursorManager();
		// Primary is at 0,0. Adding another at 0,0 should merge.
		manager.addCursor(pos(0, 0));
		expect(manager.count).toBe(1);
	});

	it('merges cursors with overlapping selections', () => {
		const manager = createCursorManager();
		const primary = manager.getPrimary();
		// Give primary a selection from 1,0 to 1,10
		manager.setSelection(primary.id, pos(1, 0), pos(1, 10));
		// Add a cursor with overlapping position
		manager.addCursor(pos(1, 5));
		// They should merge since the new cursor (1,5)-(1,5) overlaps with (1,0)-(1,10)
		expect(manager.count).toBe(1);
	});

	it('does not merge cursors at distinct positions', () => {
		const manager = createCursorManager();
		manager.addCursor(pos(5, 0));
		expect(manager.count).toBe(2);
	});

	it('preserves primary status after merge', () => {
		const manager = createCursorManager();
		manager.addCursor(pos(0, 0)); // same position as primary -> merge
		expect(manager.count).toBe(1);
		expect(manager.getPrimary().isPrimary).toBe(true);
	});
});

// ============================================================
// CursorManager — Save/Restore (clone)
// ============================================================

describe('CursorManager — Save/Restore', () => {
	it('clone captures current state', () => {
		const manager = createCursorManager();
		manager.addCursor(pos(3, 5));
		manager.addCursor(pos(7, 2));

		const snapshot = manager.clone();
		expect(snapshot.cursors.length).toBe(3);
		expect(snapshot.primaryId).toBe(manager.getPrimary().id);
	});

	it('clone returns deep copies (mutations do not affect original)', () => {
		const manager = createCursorManager();
		const snapshot = manager.clone();

		// Mutate the snapshot
		snapshot.cursors[0].selection.head.line = 999;

		// Original should be unaffected
		expect(manager.getPrimary().selection.head.line).toBe(0);
	});

	it('restore brings back saved state', () => {
		const manager = createCursorManager();
		manager.addCursor(pos(3, 5));
		manager.addCursor(pos(7, 2));
		const snapshot = manager.clone();

		// Change state
		manager.clearSecondary();
		manager.setCursor(manager.getPrimary().id, pos(99, 99));
		expect(manager.count).toBe(1);

		// Restore
		manager.restore(snapshot.cursors, snapshot.primaryId);
		expect(manager.count).toBe(3);

		const primary = manager.getPrimary();
		expect(primary.id).toBe(snapshot.primaryId);
	});

	it('restore creates a default cursor if given an empty array', () => {
		const manager = createCursorManager();
		manager.restore([], 'nonexistent');
		expect(manager.count).toBe(1);
		expect(manager.getPrimary().selection.head).toEqual(pos(0, 0));
	});

	it('restore makes deep copies of input (input mutations do not affect manager)', () => {
		const manager = createCursorManager();
		const cursorsInput: Cursor[] = [
			{
				id: 'test-1',
				selection: { anchor: pos(1, 0), head: pos(1, 5) },
				isPrimary: true
			}
		];

		manager.restore(cursorsInput, 'test-1');

		// Mutate the input
		cursorsInput[0].selection.head.line = 999;

		// Manager should be unaffected
		expect(manager.getPrimary().selection.head.line).toBe(1);
	});
});

// ============================================================
// CursorManager — Events
// ============================================================

describe('CursorManager — Events', () => {
	it('onChange fires when cursor operations trigger emit', () => {
		const manager = createCursorManager();
		const callback = vi.fn();
		manager.onChange(callback);

		// addCursor triggers emit
		manager.addCursor(pos(5, 0));
		expect(callback).toHaveBeenCalled();
	});

	it('onChange returns an unsubscribe function', () => {
		const manager = createCursorManager();
		const callback = vi.fn();
		const unsub = manager.onChange(callback);

		// Should be called for addCursor
		manager.addCursor(pos(1, 0));
		const callCountAfterAdd = callback.mock.calls.length;

		// Unsubscribe
		unsub();

		// Should NOT be called after unsubscribe
		manager.addCursor(pos(2, 0));
		expect(callback.mock.calls.length).toBe(callCountAfterAdd);
	});

	it('onChange fires for setCursor', () => {
		const manager = createCursorManager();
		const callback = vi.fn();
		manager.onChange(callback);

		const primary = manager.getPrimary();
		callback.mockClear();
		manager.setCursor(primary.id, pos(3, 3));
		expect(callback).toHaveBeenCalled();
	});

	it('onChange fires for clearSecondary when there are secondary cursors', () => {
		const manager = createCursorManager();
		manager.addCursor(pos(1, 0));

		const callback = vi.fn();
		manager.onChange(callback);

		manager.clearSecondary();
		expect(callback).toHaveBeenCalled();
	});

	it('onChange fires for setSelection', () => {
		const manager = createCursorManager();
		const callback = vi.fn();
		manager.onChange(callback);

		const primary = manager.getPrimary();
		callback.mockClear();
		manager.setSelection(primary.id, pos(0, 0), pos(0, 10));
		expect(callback).toHaveBeenCalled();
	});

	it('onChange fires for extendSelection', () => {
		const manager = createCursorManager();
		const callback = vi.fn();
		manager.onChange(callback);

		const primary = manager.getPrimary();
		callback.mockClear();
		manager.extendSelection(primary.id, pos(1, 5));
		expect(callback).toHaveBeenCalled();
	});

	it('onChange fires for removeCursor', () => {
		const manager = createCursorManager();
		const secondary = manager.addCursor(pos(5, 0));

		const callback = vi.fn();
		manager.onChange(callback);

		manager.removeCursor(secondary.id);
		expect(callback).toHaveBeenCalled();
	});

	it('onChange fires for restore', () => {
		const manager = createCursorManager();
		const snapshot = manager.clone();

		const callback = vi.fn();
		manager.onChange(callback);

		manager.restore(snapshot.cursors, snapshot.primaryId);
		expect(callback).toHaveBeenCalled();
	});

	it('listener errors do not prevent other listeners from firing', () => {
		const manager = createCursorManager();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const badCallback = vi.fn(() => {
			throw new Error('listener error');
		});
		const goodCallback = vi.fn();

		manager.onChange(badCallback);
		manager.onChange(goodCallback);

		manager.addCursor(pos(1, 0));

		expect(badCallback).toHaveBeenCalled();
		expect(goodCallback).toHaveBeenCalled();

		errorSpy.mockRestore();
	});
});

// ============================================================
// CursorManager — Additional Operations
// ============================================================

describe('CursorManager — Additional Operations', () => {
	it('setSingleCursor clears secondary and sets primary position', () => {
		const manager = createCursorManager();
		manager.addCursor(pos(1, 0));
		manager.addCursor(pos(2, 0));
		expect(manager.count).toBe(3);

		manager.setSingleCursor(pos(10, 5));
		expect(manager.count).toBe(1);
		expect(manager.getPrimary().selection.head).toEqual(pos(10, 5));
		expect(manager.getPrimary().selection.anchor).toEqual(pos(10, 5));
	});

	it('setSingleSelection clears secondary and sets primary selection', () => {
		const manager = createCursorManager();
		manager.addCursor(pos(1, 0));

		manager.setSingleSelection(pos(2, 0), pos(2, 10));
		expect(manager.count).toBe(1);
		expect(manager.getPrimary().selection.anchor).toEqual(pos(2, 0));
		expect(manager.getPrimary().selection.head).toEqual(pos(2, 10));
	});

	it('addCursorAbove adds a cursor on the line above primary', () => {
		const manager = createCursorManager();
		manager.setCursor(manager.getPrimary().id, pos(5, 3));

		const added = manager.addCursorAbove(10);
		expect(added).toBe(true);
		expect(manager.count).toBe(2);

		// One of the cursors should be at line 4
		const cursors = manager.getCursors();
		const lines = cursors.map((c) => c.selection.head.line);
		expect(lines).toContain(4);
	});

	it('addCursorAbove returns false when primary is at line 0', () => {
		const manager = createCursorManager();
		const added = manager.addCursorAbove(10);
		expect(added).toBe(false);
		expect(manager.count).toBe(1);
	});

	it('addCursorBelow adds a cursor on the line below primary', () => {
		const manager = createCursorManager();
		const added = manager.addCursorBelow(10);
		expect(added).toBe(true);
		expect(manager.count).toBe(2);

		const cursors = manager.getCursors();
		const lines = cursors.map((c) => c.selection.head.line);
		expect(lines).toContain(1);
	});

	it('addCursorBelow returns false when primary is at last line', () => {
		const manager = createCursorManager();
		manager.setCursor(manager.getPrimary().id, pos(9, 0));
		const added = manager.addCursorBelow(10); // 10 lines, last index = 9
		expect(added).toBe(false);
		expect(manager.count).toBe(1);
	});

	it('batchUpdateCursors updates multiple cursors in one operation', () => {
		const manager = createCursorManager();
		const c1 = manager.addCursor(pos(1, 0));
		const c2 = manager.addCursor(pos(2, 0));

		const primary = manager.getPrimary();

		manager.batchUpdateCursors([
			{ id: primary.id, position: pos(10, 0) },
			{ id: c1.id, position: pos(11, 0) },
			{ id: c2.id, position: pos(12, 0) }
		]);

		const sorted = manager.getSortedCursors();
		expect(sorted[0].selection.head).toEqual(pos(10, 0));
		expect(sorted[1].selection.head).toEqual(pos(11, 0));
		expect(sorted[2].selection.head).toEqual(pos(12, 0));
	});

	it('addCursorWithSelection creates a cursor with a selection range', () => {
		const manager = createCursorManager();
		const cursor = manager.addCursorWithSelection(pos(1, 0), pos(1, 10));
		expect(cursor.selection.anchor).toEqual(pos(1, 0));
		expect(cursor.selection.head).toEqual(pos(1, 10));
	});

	it('isPositionInAnyCursor detects position inside a cursor selection', () => {
		const manager = createCursorManager();
		const primary = manager.getPrimary();
		manager.setSelection(primary.id, pos(1, 0), pos(1, 10));

		expect(manager.isPositionInAnyCursor(pos(1, 5))).toBe(true);
		expect(manager.isPositionInAnyCursor(pos(2, 0))).toBe(false);
	});

	it('getCursors returns all cursors', () => {
		const manager = createCursorManager();
		manager.addCursor(pos(1, 0));
		manager.addCursor(pos(2, 0));

		const cursors = manager.getCursors();
		expect(cursors.length).toBe(3);
	});

	it('setPrimary changes which cursor is the primary', () => {
		const manager = createCursorManager();
		const secondary = manager.addCursor(pos(5, 0));

		manager.setPrimary(secondary.id);
		expect(manager.getPrimary().id).toBe(secondary.id);
		expect(manager.getPrimary().isPrimary).toBe(true);
	});
});
