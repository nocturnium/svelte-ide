import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, readableTextColor, TEXT_ON_DARK, TEXT_ON_LIGHT } from './color';

describe('parseColor', () => {
	it('parses hex and rgb forms', () => {
		expect(parseColor('#4a8db7')).toEqual([74, 141, 183]);
		expect(parseColor('#fff')).toEqual([255, 255, 255]);
		expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
		expect(parseColor('rgba(10 20 30 / 0.5)')).toEqual([10, 20, 30]);
		expect(parseColor('color(srgb 0.29 0.55 0.72)')).toEqual([74, 140, 184]);
	});

	it('returns null for values it cannot resolve', () => {
		expect(parseColor('var(--ide-interactive)')).toBeNull();
		expect(parseColor('tomato')).toBeNull();
	});
});

describe('readableTextColor', () => {
	// The review measured white on these at 1.53 (yellow), 1.74 (green) and 2.54 (blue).
	it.each(['#facc15', '#4ade80', '#60a5fa', '#a78bfa', '#f472b6', '#4a8db7'])(
		'uses night on the light aurora and wave colours (%s)',
		(bg) => {
			expect(readableTextColor(bg)).toBe(TEXT_ON_LIGHT);
		}
	);

	it('uses white on dark backgrounds', () => {
		expect(readableTextColor('#1a2744')).toBe(TEXT_ON_DARK);
		expect(readableTextColor('#3b7aa3')).toBe(TEXT_ON_DARK);
	});

	it('reaches AA (4.5:1) for every aurora colour and the wave blue', () => {
		const night = parseColor(TEXT_ON_LIGHT)!;
		for (const bg of ['#facc15', '#4ade80', '#60a5fa', '#a78bfa', '#f472b6', '#4a8db7']) {
			expect(contrastRatio(parseColor(bg)!, night)).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('returns null for unresolved values', () => {
		expect(readableTextColor('var(--x)')).toBeNull();
	});
});
