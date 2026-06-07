import { describe, it, expect } from 'vitest';

/**
 * Line-virtualization windowing regression tests.
 *
 * CustomEditor.svelte renders only the rows of the (folded) visible-line
 * sequence that intersect the viewport, plus a small overscan. This caps DOM
 * nodes at ~viewport-worth regardless of document size (a 10k+ line file must
 * NOT mount 10k line elements).
 *
 * There is no component-test harness in this repo, so `computeWindow` below is a
 * faithful, standalone copy of the windowing math in CustomEditor's
 * `windowedLines` derived. If that derived regresses, update this and the test
 * together — the invariants asserted here (bounded node count, correct slice,
 * full spacer height) are the contract.
 */

const ROW_OVERSCAN = 8;

interface Window {
	firstRow: number;
	lastRow: number;
	/** Number of rows actually rendered (DOM nodes). */
	renderedCount: number;
	/** Full scrollable content height in px (spacer). */
	totalHeight: number;
}

function computeWindow(
	rowCount: number,
	scrollTop: number,
	viewportHeight: number,
	lineHeight: number
): Window {
	const totalHeight = Math.max(rowCount, 1) * lineHeight;
	if (rowCount === 0) {
		return { firstRow: 0, lastRow: -1, renderedCount: 0, totalHeight };
	}
	const rowsPerViewport = Math.ceil(viewportHeight / lineHeight);
	const firstRow = Math.max(0, Math.floor(scrollTop / lineHeight) - ROW_OVERSCAN);
	const lastRow = Math.min(rowCount - 1, firstRow + rowsPerViewport + ROW_OVERSCAN * 2);
	return { firstRow, lastRow, renderedCount: lastRow - firstRow + 1, totalHeight };
}

describe('Line virtualization windowing', () => {
	const lineHeight = 20;
	const viewportHeight = 400; // 20 rows visible

	it('renders only ~viewport-worth of rows for a 10k-line document', () => {
		const rowCount = 10_000;
		const w = computeWindow(rowCount, 0, viewportHeight, lineHeight);

		// 20 visible rows + overscan on both ends — nowhere near 10k.
		expect(w.renderedCount).toBeLessThan(60);
		expect(w.renderedCount).toBeGreaterThanOrEqual(20);
		// Spacer must still reserve the full document height for a correct scrollbar.
		expect(w.totalHeight).toBe(10_000 * lineHeight);
	});

	it('keeps the rendered count bounded no matter how far you scroll', () => {
		const rowCount = 50_000;
		const counts = [0, 100_000, 500_000, 999_980].map(
			(scrollTop) => computeWindow(rowCount, scrollTop, viewportHeight, lineHeight).renderedCount
		);
		for (const c of counts) {
			expect(c).toBeLessThan(60);
		}
	});

	it('windows to the correct slice when scrolled into the middle', () => {
		const rowCount = 1000;
		// Scroll so row 500 is at the top of the viewport.
		const scrollTop = 500 * lineHeight;
		const w = computeWindow(rowCount, scrollTop, viewportHeight, lineHeight);

		// First rendered row is 500 - overscan.
		expect(w.firstRow).toBe(500 - ROW_OVERSCAN);
		// The viewport's visible rows (500..519) must all be inside the window.
		expect(w.firstRow).toBeLessThanOrEqual(500);
		expect(w.lastRow).toBeGreaterThanOrEqual(519);
	});

	it('clamps the window to document bounds at the very top', () => {
		const w = computeWindow(1000, 0, viewportHeight, lineHeight);
		expect(w.firstRow).toBe(0); // never negative despite overscan
	});

	it('clamps the window to document bounds at the very bottom', () => {
		const rowCount = 1000;
		const scrollTop = (rowCount - 1) * lineHeight; // scrolled to the last row
		const w = computeWindow(rowCount, scrollTop, viewportHeight, lineHeight);
		expect(w.lastRow).toBe(rowCount - 1); // never past the end
		expect(w.renderedCount).toBeLessThan(60);
	});

	it('handles an empty document (single spacer, no rows)', () => {
		const w = computeWindow(0, 0, viewportHeight, lineHeight);
		expect(w.renderedCount).toBe(0);
		expect(w.totalHeight).toBe(lineHeight); // Math.max(0,1) * lineHeight
	});

	it('renders the whole document when it is smaller than the viewport', () => {
		const rowCount = 5; // far fewer than the ~20 visible rows
		const w = computeWindow(rowCount, 0, viewportHeight, lineHeight);
		expect(w.firstRow).toBe(0);
		expect(w.lastRow).toBe(rowCount - 1);
		expect(w.renderedCount).toBe(rowCount);
	});
});
