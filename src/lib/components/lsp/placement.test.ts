import { describe, it, expect } from 'vitest';
import { computePlacement } from './placement';

const viewport = { width: 320, height: 568 };

describe('computePlacement', () => {
	it('keeps the anchor when the widget fits below', () => {
		const p = computePlacement({ x: 20, y: 100 }, { width: 200, height: 150 }, viewport);
		expect(p).toEqual({ x: 20, y: 100, placement: 'below' });
	});

	it('shifts left so the right edge stays inside the margin', () => {
		const p = computePlacement({ x: 280, y: 100 }, { width: 200, height: 100 }, viewport);
		expect(p.x).toBe(320 - 8 - 200);
	});

	it('never goes left of the margin, even when wider than the viewport', () => {
		const p = computePlacement({ x: 0, y: 100 }, { width: 500, height: 100 }, viewport);
		expect(p.x).toBe(8);
	});

	it('flips above when below is too short and above has room', () => {
		const p = computePlacement({ x: 20, y: 500 }, { width: 200, height: 200 }, viewport);
		expect(p.placement).toBe('above');
		expect(p.y).toBe(500 - 20 - 200);
	});

	it('stays below when neither side fits but below has more room', () => {
		const p = computePlacement({ x: 20, y: 100 }, { width: 200, height: 600 }, viewport);
		expect(p.placement).toBe('below');
		expect(p.y).toBeGreaterThanOrEqual(8);
	});

	it('keeps a widget taller than both sides inside the top margin', () => {
		const p = computePlacement({ x: 20, y: 300 }, { width: 200, height: 600 }, viewport);
		expect(p.y).toBe(8);
	});

	it('opens above the whole anchor line, not on top of it', () => {
		const p = computePlacement({ x: 20, y: 500 }, { width: 100, height: 100 }, viewport, {
			anchorHeight: 24
		});
		expect(p).toEqual({ x: 20, y: 500 - 24 - 100, placement: 'above' });
	});
});
