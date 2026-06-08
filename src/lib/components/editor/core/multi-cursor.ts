/**
 * Multi-cursor management for the custom editor
 *
 * Provides support for creating, managing, and editing with multiple cursors.
 * Cursors can have selections and are automatically merged when they touch or overlap.
 */

import type { Position, Selection } from './state';

/**
 * A single cursor with optional selection
 */
export interface Cursor {
	/** Unique identifier */
	id: string;
	/** Selection range (anchor = head for no selection) */
	selection: Selection;
	/** Whether this is the primary cursor */
	isPrimary: boolean;
}

/**
 * Configuration for CursorManager
 */
export interface CursorManagerConfig {
	/** Maximum number of cursors allowed (default: 100) */
	maxCursors?: number;
}

/** Default maximum cursors */
const DEFAULT_MAX_CURSORS = 100;

/**
 * Compare two positions
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export function comparePositions(a: Position, b: Position): number {
	if (a.line !== b.line) return a.line - b.line;
	return a.column - b.column;
}

/**
 * Check if position a is before position b
 */
export function isPositionBefore(a: Position, b: Position): boolean {
	return comparePositions(a, b) < 0;
}

/**
 * Check if position a is before or equal to position b
 */
export function isPositionBeforeOrEqual(a: Position, b: Position): boolean {
	return comparePositions(a, b) <= 0;
}

/**
 * Check if two positions are equal
 */
export function positionsEqual(a: Position, b: Position): boolean {
	return a.line === b.line && a.column === b.column;
}

/**
 * Get the start position of a selection (min of anchor and head)
 */
export function getSelectionStart(selection: Selection): Position {
	return isPositionBefore(selection.anchor, selection.head) ? selection.anchor : selection.head;
}

/**
 * Get the end position of a selection (max of anchor and head)
 */
export function getSelectionEnd(selection: Selection): Position {
	return isPositionBefore(selection.anchor, selection.head) ? selection.head : selection.anchor;
}

/**
 * Check if a selection is empty (anchor equals head)
 */
export function isSelectionEmpty(selection: Selection): boolean {
	return positionsEqual(selection.anchor, selection.head);
}

/**
 * Check if two selections overlap or touch
 */
export function selectionsOverlap(a: Selection, b: Selection): boolean {
	const aStart = getSelectionStart(a);
	const aEnd = getSelectionEnd(a);
	const bStart = getSelectionStart(b);
	const bEnd = getSelectionEnd(b);

	// They overlap if neither is completely before the other
	return isPositionBeforeOrEqual(aStart, bEnd) && isPositionBeforeOrEqual(bStart, aEnd);
}

/**
 * Merge two selections into one (union)
 */
export function mergeSelections(a: Selection, b: Selection): Selection {
	const aStart = getSelectionStart(a);
	const aEnd = getSelectionEnd(a);
	const bStart = getSelectionStart(b);
	const bEnd = getSelectionEnd(b);

	const start = isPositionBefore(aStart, bStart) ? aStart : bStart;
	const end = isPositionBefore(aEnd, bEnd) ? bEnd : aEnd;

	return { anchor: start, head: end };
}

/**
 * Manages multiple cursors in the editor
 */
/** Maximum number of listeners allowed per manager */
const MAX_LISTENERS = 100;

export class CursorManager {
	private cursors: Map<string, Cursor> = new Map();
	private primaryId: string = '';
	private nextId: number = 0;
	private maxCursors: number;
	private listeners: Set<() => void> = new Set();

	constructor(config: CursorManagerConfig = {}) {
		this.maxCursors = config.maxCursors ?? DEFAULT_MAX_CURSORS;

		// Initialize with a single primary cursor at start
		this.addCursor({ line: 0, column: 0 }, true);
	}

	/**
	 * Get all cursors
	 */
	getCursors(): readonly Cursor[] {
		return [...this.cursors.values()];
	}

	/**
	 * Get all cursors sorted by position (top to bottom, left to right)
	 */
	getSortedCursors(): Cursor[] {
		return [...this.cursors.values()].sort((a, b) => {
			const posA = getSelectionStart(a.selection);
			const posB = getSelectionStart(b.selection);
			return comparePositions(posA, posB);
		});
	}

	/**
	 * Get cursors sorted in reverse order (bottom to top)
	 * Useful for editing operations to maintain position validity
	 */
	getSortedCursorsReverse(): Cursor[] {
		return this.getSortedCursors().reverse();
	}

	/**
	 * Get the primary cursor
	 */
	getPrimary(): Cursor {
		const primary = this.cursors.get(this.primaryId);
		if (!primary) {
			// Fallback: return first cursor
			const first = this.cursors.values().next().value;
			if (first) {
				this.setPrimary(first.id);
				return first;
			}
			// Should never happen, but create a default cursor
			return this.addCursor({ line: 0, column: 0 }, true);
		}
		return primary;
	}

	/**
	 * Get cursor count
	 */
	get count(): number {
		return this.cursors.size;
	}

	/**
	 * Check if there are multiple cursors
	 */
	get hasMultiple(): boolean {
		return this.cursors.size > 1;
	}

	/**
	 * Add a new cursor at a position
	 * @param position - Position for the new cursor
	 * @param makePrimary - Make this the primary cursor
	 * @returns The new cursor, or null if at max capacity
	 */
	addCursor(position: Position, makePrimary = false): Cursor {
		// Check if we're at capacity
		if (this.cursors.size >= this.maxCursors && !makePrimary) {
			// Return the closest existing cursor instead
			return this.getClosestCursor(position);
		}

		const id = `cursor-${this.nextId++}`;
		const cursor: Cursor = {
			id,
			selection: { anchor: { ...position }, head: { ...position } },
			isPrimary: makePrimary || this.cursors.size === 0
		};

		if (cursor.isPrimary) {
			// Clear previous primary
			const oldPrimary = this.cursors.get(this.primaryId);
			if (oldPrimary) {
				oldPrimary.isPrimary = false;
			}
			this.primaryId = id;
		}

		this.cursors.set(id, cursor);
		this.mergeTouchingCursors();
		this.emit();

		return cursor;
	}

	/**
	 * Add a cursor with a selection
	 */
	addCursorWithSelection(anchor: Position, head: Position, makePrimary = false): Cursor {
		const cursor = this.addCursor(anchor, makePrimary);
		cursor.selection = {
			anchor: { ...anchor },
			head: { ...head }
		};
		this.mergeTouchingCursors();
		this.emit();
		return cursor;
	}

	/**
	 * Remove a cursor by ID
	 * @returns true if removed, false if it was the last cursor
	 */
	removeCursor(id: string): boolean {
		if (this.cursors.size <= 1) {
			return false; // Must keep at least one cursor
		}

		const wasPrimary = this.primaryId === id;
		this.cursors.delete(id);

		if (wasPrimary) {
			// Promote first remaining cursor to primary
			const first = this.cursors.values().next().value;
			if (first) {
				this.setPrimary(first.id);
			}
		}

		this.emit();
		return true;
	}

	/**
	 * Remove the last added secondary cursor (for Ctrl+U)
	 * @returns true if a cursor was removed
	 */
	removeLastSecondary(): boolean {
		if (this.cursors.size <= 1) {
			return false;
		}

		// Get all non-primary cursors sorted by ID (most recent last)
		const secondaries = [...this.cursors.values()]
			.filter((c) => !c.isPrimary)
			.sort((a, b) => {
				// Extract numeric part of ID for comparison
				const idA = parseInt(a.id.replace('cursor-', ''), 10);
				const idB = parseInt(b.id.replace('cursor-', ''), 10);
				return idB - idA; // Descending (newest first)
			});

		if (secondaries.length > 0) {
			this.cursors.delete(secondaries[0].id);
			this.emit();
			return true;
		}

		return false;
	}

	/**
	 * Clear all secondary cursors, keeping only the primary
	 */
	clearSecondary(): void {
		if (this.cursors.size <= 1) {
			return;
		}

		const primary = this.getPrimary();
		this.cursors.clear();
		this.cursors.set(primary.id, primary);
		this.emit();
	}

	/**
	 * Set the primary cursor
	 */
	setPrimary(id: string): void {
		const newPrimary = this.cursors.get(id);
		if (!newPrimary) return;

		// Clear old primary
		const oldPrimary = this.cursors.get(this.primaryId);
		if (oldPrimary) {
			oldPrimary.isPrimary = false;
		}

		newPrimary.isPrimary = true;
		this.primaryId = id;
	}

	/**
	 * Set cursor position (clears selection)
	 */
	setCursor(id: string, position: Position): void {
		const cursor = this.cursors.get(id);
		if (!cursor) return;

		cursor.selection = {
			anchor: { ...position },
			head: { ...position }
		};
		this.mergeTouchingCursors();
		this.emit();
	}

	/**
	 * Batch update cursor positions without triggering merge/emit on each update
	 * More efficient for updating multiple cursors at once
	 */
	batchUpdateCursors(updates: Array<{ id: string; position: Position }>): void {
		for (const update of updates) {
			const cursor = this.cursors.get(update.id);
			if (cursor) {
				cursor.selection = {
					anchor: { ...update.position },
					head: { ...update.position }
				};
			}
		}
		this.mergeTouchingCursors();
		this.emit();
	}

	/**
	 * Set cursor selection
	 */
	setSelection(id: string, anchor: Position, head: Position): void {
		const cursor = this.cursors.get(id);
		if (!cursor) return;

		cursor.selection = {
			anchor: { ...anchor },
			head: { ...head }
		};
		this.mergeTouchingCursors();
		this.emit();
	}

	/**
	 * Extend cursor selection (move head, keep anchor)
	 */
	extendSelection(id: string, head: Position): void {
		const cursor = this.cursors.get(id);
		if (!cursor) return;

		cursor.selection.head = { ...head };
		this.mergeTouchingCursors();
		this.emit();
	}

	/**
	 * Set all cursors to new positions (for single cursor operations)
	 */
	setSingleCursor(position: Position): void {
		this.clearSecondary();
		const primary = this.getPrimary();
		primary.selection = {
			anchor: { ...position },
			head: { ...position }
		};
		this.emit();
	}

	/**
	 * Set single cursor with selection
	 */
	setSingleSelection(anchor: Position, head: Position): void {
		this.clearSecondary();
		const primary = this.getPrimary();
		primary.selection = {
			anchor: { ...anchor },
			head: { ...head }
		};
		this.emit();
	}

	/**
	 * Check if any cursor contains a position
	 */
	isPositionInAnyCursor(position: Position): boolean {
		for (const cursor of this.cursors.values()) {
			const start = getSelectionStart(cursor.selection);
			const end = getSelectionEnd(cursor.selection);

			if (
				(isPositionBeforeOrEqual(start, position) && isPositionBeforeOrEqual(position, end)) ||
				positionsEqual(cursor.selection.head, position)
			) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Get the closest cursor to a position
	 */
	private getClosestCursor(position: Position): Cursor {
		let closest = this.getPrimary();
		let closestDistance = Infinity;

		for (const cursor of this.cursors.values()) {
			const cursorPos = cursor.selection.head;
			const distance =
				Math.abs(cursorPos.line - position.line) * 10000 +
				Math.abs(cursorPos.column - position.column);

			if (distance < closestDistance) {
				closestDistance = distance;
				closest = cursor;
			}
		}

		return closest;
	}

	/**
	 * Merge overlapping or touching cursors
	 */
	private mergeTouchingCursors(): void {
		if (this.cursors.size <= 1) return;

		const sorted = this.getSortedCursors();
		const merged: Cursor[] = [];
		let primaryWasMerged = false;
		let mergedPrimaryInto: Cursor | null = null;

		for (const cursor of sorted) {
			const last = merged[merged.length - 1];

			if (last && selectionsOverlap(last.selection, cursor.selection)) {
				// Merge into last cursor
				last.selection = mergeSelections(last.selection, cursor.selection);

				// Track if primary was merged
				if (cursor.isPrimary) {
					primaryWasMerged = true;
					mergedPrimaryInto = last;
				}
			} else {
				merged.push(cursor);
			}
		}

		// Rebuild the map
		this.cursors.clear();
		for (const cursor of merged) {
			this.cursors.set(cursor.id, cursor);
		}

		// Ensure we have a valid primary
		if (primaryWasMerged && mergedPrimaryInto) {
			this.setPrimary(mergedPrimaryInto.id);
		} else if (!this.cursors.has(this.primaryId)) {
			// Primary was removed in merge, set new primary
			const first = this.cursors.values().next().value;
			if (first) {
				this.setPrimary(first.id);
			}
		}
	}

	/**
	 * Add cursor above the current primary cursor
	 * @param lineCount - Number of lines in the document
	 */
	addCursorAbove(_lineCount: number): boolean {
		const primary = this.getPrimary();
		const pos = primary.selection.head;

		if (pos.line <= 0) {
			return false;
		}

		// Add cursor on line above, same column (will be clamped by caller)
		this.addCursor({ line: pos.line - 1, column: pos.column });
		return true;
	}

	/**
	 * Add cursor below the current primary cursor
	 * @param lineCount - Number of lines in the document
	 */
	addCursorBelow(lineCount: number): boolean {
		const primary = this.getPrimary();
		const pos = primary.selection.head;

		if (pos.line >= lineCount - 1) {
			return false;
		}

		// Add cursor on line below, same column (will be clamped by caller)
		this.addCursor({ line: pos.line + 1, column: pos.column });
		return true;
	}

	/**
	 * Subscribe to cursor changes
	 * In development mode, throws an error to catch memory leaks early.
	 * In production, warns and evicts the oldest listener.
	 */
	onChange(callback: () => void): () => void {
		if (this.listeners.size >= MAX_LISTENERS) {
			const msg = `[CursorManager] Maximum listener count (${MAX_LISTENERS}) exceeded. Possible memory leak - ensure listeners are unsubscribed.`;

			// Fail fast in development to catch bugs early
			if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
				throw new Error(msg);
			}

			// In production, warn and auto-cleanup oldest listener
			console.warn(msg);
			const firstListener = this.listeners.values().next().value;
			if (firstListener) {
				this.listeners.delete(firstListener);
			}
		}
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private emit(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (error) {
				console.error('[CursorManager] Listener callback failed:', error);
			}
		}
	}

	/**
	 * Restore cursors from a saved state (for undo/redo)
	 */
	restore(cursors: Cursor[], primaryId: string): void {
		this.cursors.clear();
		for (const cursor of cursors) {
			this.cursors.set(cursor.id, {
				id: cursor.id,
				selection: {
					anchor: { ...cursor.selection.anchor },
					head: { ...cursor.selection.head }
				},
				isPrimary: cursor.isPrimary
			});
		}
		this.primaryId = primaryId;

		// Ensure we have at least one cursor
		if (this.cursors.size === 0) {
			this.addCursor({ line: 0, column: 0 }, true);
		}

		this.emit();
	}

	/**
	 * Clone the current state (for undo/redo)
	 */
	clone(): { cursors: Cursor[]; primaryId: string } {
		return {
			cursors: [...this.cursors.values()].map((c) => ({
				id: c.id,
				selection: {
					anchor: { ...c.selection.anchor },
					head: { ...c.selection.head }
				},
				isPrimary: c.isPrimary
			})),
			primaryId: this.primaryId
		};
	}
}

/**
 * Create a new CursorManager
 */
export function createCursorManager(config?: CursorManagerConfig): CursorManager {
	return new CursorManager(config);
}
