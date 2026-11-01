/**
 * Colour helpers for picking readable text on an arbitrary background.
 */

/** Nocturnium night (#0d1421) and white: the two foregrounds components choose between. */
export const TEXT_ON_LIGHT = '#0d1421';
export const TEXT_ON_DARK = '#ffffff';

/** Parses #rgb, #rrggbb, rgb()/rgba() and `color(srgb r g b)` into 0-255 channels, or null for anything else. */
export function parseColor(input: string): [number, number, number] | null {
	const value = input.trim().toLowerCase();
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
	if (hex) {
		const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
		return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
	}
	const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/.exec(value);
	if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
	// Browsers serialise color-mix() results as color(srgb 0.29 0.55 0.72 / 0.5), channels in 0-1.
	const srgb = /^color\(\s*srgb\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(value);
	if (srgb) {
		return [1, 2, 3].map((i) => Math.round(Math.min(1, Math.max(0, Number(srgb[i]))) * 255)) as [
			number,
			number,
			number
		];
	}
	return null;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Night or white, whichever has the higher contrast against `background`.
 * Returns null when the background cannot be parsed (for example a CSS variable).
 */
export function readableTextColor(background: string): string | null {
	const rgb = parseColor(background);
	if (!rgb) return null;
	const night = parseColor(TEXT_ON_LIGHT)!;
	const white = parseColor(TEXT_ON_DARK)!;
	return contrastRatio(rgb, night) >= contrastRatio(rgb, white) ? TEXT_ON_LIGHT : TEXT_ON_DARK;
}
