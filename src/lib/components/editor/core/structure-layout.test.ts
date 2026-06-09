import { describe, it, expect } from 'vitest';
import { layoutStructureRows } from './structure-layout';

const ROW = 18;

/** Assert every adjacent pair is at least `gap` apart. */
function assertNoOverlap(tops: number[], gap: number) {
	for (let i = 1; i < tops.length; i++) {
		expect(tops[i] - tops[i - 1]).toBeGreaterThanOrEqual(gap - 1e-9);
	}
}

describe('layoutStructureRows', () => {
	it('returns an empty array for no rows', () => {
		expect(layoutStructureRows([], 100, 400, ROW)).toEqual([]);
	});

	it('places a single row proportionally to its start line', () => {
		// line 50 of 100, height 400 -> 200px
		expect(layoutStructureRows([50], 100, 400, ROW)).toEqual([200]);
	});

	it('keeps proportional spacing when rows have room', () => {
		// well-separated interior rows stay exactly where proportional placement puts them
		const tops = layoutStructureRows([0, 25, 50], 100, 600, ROW);
		expect(tops).toEqual([0, 150, 300]);
		assertNoOverlap(tops, ROW);
	});

	it('pushes co-starting rows apart by exactly one row height', () => {
		// two regions on the same line (e.g. exports + class) must not overprint
		const tops = layoutStructureRows([52, 52], 153, 400, ROW);
		expect(tops[1] - tops[0]).toBeCloseTo(ROW, 9);
		assertNoOverlap(tops, ROW);
	});

	it('de-collides a dense cluster and keeps it within bounds', () => {
		// six test hooks packed into the last fifth of the file
		const starts = [136, 139, 143, 147, 152, 161];
		const height = 400;
		const tops = layoutStructureRows(starts, 153, height, ROW);

		assertNoOverlap(tops, ROW);
		// nothing escapes the top or bottom of the available height
		expect(tops[0]).toBeGreaterThanOrEqual(0);
		expect(tops[tops.length - 1] + ROW).toBeLessThanOrEqual(height + 1e-9);
	});

	it('anchors the last row to the bottom when the stack overflows downward', () => {
		// rows near the end of the file that would otherwise spill past `height`
		const tops = layoutStructureRows([95, 97, 99], 100, 100, ROW);
		assertNoOverlap(tops, ROW);
		expect(tops[2] + ROW).toBeCloseTo(100, 9);
	});

	it('degrades deterministically when there are more rows than fit', () => {
		// 10 rows * 18px = 180px needed, only 90px available
		const starts = Array.from({ length: 10 }, (_, i) => i * 10);
		const tops = layoutStructureRows(starts, 100, 90, ROW);
		// floored at the top and placed sequentially at the row pitch
		expect(tops[0]).toBe(0);
		assertNoOverlap(tops, ROW);
		for (let i = 0; i < tops.length; i++) {
			expect(tops[i]).toBeCloseTo(i * ROW, 9);
		}
	});

	it('treats a zero/unknown height as not-yet-measured without overlap', () => {
		// before the ResizeObserver reports, height is 0 — rows still must not stack
		const tops = layoutStructureRows([0, 5, 5, 20], 50, 0, ROW);
		assertNoOverlap(tops, ROW);
		expect(tops[0]).toBe(0);
	});

	it('guards against negative start lines', () => {
		const tops = layoutStructureRows([-3, 10], 100, 400, ROW);
		expect(tops[0]).toBeGreaterThanOrEqual(0);
		assertNoOverlap(tops, ROW);
	});
});
