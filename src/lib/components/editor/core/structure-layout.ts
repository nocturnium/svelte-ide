/**
 * Structure Map row layout
 *
 * The Structure Map places one labeled row per semantic region. Rows want to sit
 * at a position proportional to their start line (so the map reads like a
 * minimap), but every label needs a minimum pixel height to stay legible. With
 * pure proportional placement, regions that start on the same line (e.g. the
 * `exports` and `class` regions of `export class Foo`) or that cluster densely
 * (a run of test hooks) overprint each other into illegible mush.
 *
 * `layoutStructureRows` resolves non-overlapping vertical offsets:
 *  - pass 1 (top-down): no row sits closer than `rowHeight` below the previous
 *    one, preserving proportional placement wherever there is room;
 *  - pass 2 (bottom-up): if the de-collided stack overruns the available height,
 *    pull rows back up so the last one ends exactly at `height`, keeping the
 *    minimum spacing intact.
 *
 * When there are genuinely more rows than can fit (`rows * rowHeight > height`)
 * the stack is floored at the top and rows are placed sequentially; callers are
 * expected to clip the overflow (`overflow: hidden`).
 */

/**
 * Resolve non-overlapping top offsets (in px) for structure-map rows.
 *
 * @param startLines  0-based start line of each row, in render order.
 * @param totalLines  Total line count the map represents.
 * @param height      Available height of the rendering area, in px.
 * @param rowHeight   Minimum legible height of a single row, in px.
 * @returns Top offset in px for each input row, in the same order.
 */
export function layoutStructureRows(
	startLines: readonly number[],
	totalLines: number,
	height: number,
	rowHeight: number
): number[] {
	const n = startLines.length;
	if (n === 0) return [];

	const span = Math.max(1, totalLines);
	const tops = startLines.map((line) => (Math.max(0, line) / span) * height);

	// Pass 1 — top-down: enforce the minimum gap, keeping proportional order.
	for (let i = 1; i < n; i++) {
		const min = tops[i - 1] + rowHeight;
		if (tops[i] < min) tops[i] = min;
	}

	// Pass 2 — bottom-up: if the stack overflows, slide it back into bounds.
	if (height > 0 && tops[n - 1] + rowHeight > height) {
		tops[n - 1] = height - rowHeight;
		for (let i = n - 2; i >= 0; i--) {
			const max = tops[i + 1] - rowHeight;
			if (tops[i] > max) tops[i] = max;
		}

		// More rows than fit: floor at the top and place sequentially. Some
		// overlap is unavoidable here, but the result is deterministic and the
		// caller clips it.
		if (tops[0] < 0) {
			tops[0] = 0;
			for (let i = 1; i < n; i++) {
				const min = tops[i - 1] + rowHeight;
				if (tops[i] < min) tops[i] = min;
			}
		}
	}

	return tops;
}
