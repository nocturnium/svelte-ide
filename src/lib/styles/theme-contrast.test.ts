/**
 * WCAG AA contrast for the theme's text tokens on every surface they sit on.
 * Values are read from theme.css itself, so changing a token re-runs the
 * arithmetic instead of trusting a comment.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8');
/** app.css loads after theme.css and overrides the editor syntax tokens, including the comment colour. */
const appCss = readFileSync(join(import.meta.dirname, '..', '..', 'app.css'), 'utf8');
const heatLayer = readFileSync(
	join(import.meta.dirname, '..', 'components', 'editor', 'ComplexityHeatLayer.svelte'),
	'utf8'
);

/** Value of a custom property. app.css wins when it redefines the token, as it does in the browser. */
function token(name: string): string {
	const pattern = new RegExp('--' + name + ':\\s*([^;]+);');
	const match = pattern.exec(appCss) ?? pattern.exec(css);
	if (!match) throw new Error('missing token --' + name);
	return match[1].trim();
}

type RGB = [number, number, number];

/** Resolve a token to an opaque colour over a backdrop (handles var() and color-mix with transparent/white). */
function resolve(value: string, backdrop: RGB = [0, 0, 0]): RGB {
	value = value.trim();
	const ref = /^var\(--([\w-]+)\)$/.exec(value);
	if (ref) return resolve(token(ref[1]), backdrop);
	value = value.replace(/\s+\d+%$/, ''); // second color-mix operand may carry its own %
	if (value === 'white') return [255, 255, 255];
	if (value === 'black') return [0, 0, 0];
	if (value === 'transparent') return backdrop;
	const hex = /^#([0-9a-f]{6})$/i.exec(value);
	if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as RGB;
	const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/s.exec(value);
	if (mix) {
		const a = resolve(mix[1], backdrop);
		const b = resolve(mix[3], backdrop);
		const p = Number(mix[2]) / 100;
		return a.map((v, i) => v * p + b[i] * (1 - p)) as RGB;
	}
	throw new Error('cannot resolve ' + value);
}

function luminance([r, g, b]: RGB): number {
	const f = (c: number) => {
		c /= 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

describe('theme contrast (WCAG AA, 4.5:1 for text)', () => {
	const page = resolve('var(--ide-bg-primary)');
	const surfaces: Record<string, RGB> = {
		primary: page,
		secondary: resolve('var(--ide-bg-secondary)', page),
		tertiary: resolve('var(--ide-bg-tertiary)', page),
		elevated: resolve('var(--ide-bg-elevated)', page),
		hover: resolve('var(--ide-bg-hover)', page)
	};

	for (const text of [
		'ide-text-primary',
		'ide-text-secondary',
		'ide-text-muted',
		'ide-interactive-text'
	]) {
		for (const [name, surface] of Object.entries(surfaces)) {
			it(text + ' on ' + name, () => {
				expect(contrast(resolve('var(--' + text + ')', surface), surface)).toBeGreaterThanOrEqual(
					4.5
				);
			});
		}
	}

	it('white text on the selected-row background', () => {
		expect(contrast([255, 255, 255], resolve('var(--ide-bg-selected)'))).toBeGreaterThanOrEqual(
			4.5
		);
	});
});
describe('editor comment colour (WCAG AA) on every surface it can land on', () => {
	const page = resolve('var(--ide-bg-primary)');
	/** Critical-band veil: rgb triplet from theme.css, alpha from the component that paints it. */
	const veilRgb = token('ide-complexity-veil').split(',').map(Number) as RGB;
	const alphaMatch = /level === 'critical'\)\s*return\s*([\d.]+)/.exec(heatLayer);
	if (!alphaMatch) throw new Error('could not read the critical veil alpha');
	const veilAlpha = Number(alphaMatch[1]);
	const over = (top: RGB, base: RGB, alpha: number): RGB =>
		top.map((v, i) => v * alpha + base[i] * (1 - alpha)) as RGB;

	// The active line paints --ide-bg-elevated (EditorLines.svelte, editor theme activeLine).
	const activeLine = resolve('var(--ide-bg-elevated)', page);

	const surfaces: Record<string, RGB> = {
		'editor background': page,
		'editor background under the critical veil': over(veilRgb, page, veilAlpha),
		'active-line band': activeLine,
		'active-line band under the critical veil': over(veilRgb, activeLine, veilAlpha)
	};

	it('app.css overrides the comment token, so the test is measuring the shipped value', () => {
		expect(appCss).toMatch(/--editor-token-comment:/);
	});

	for (const [name, surface] of Object.entries(surfaces)) {
		it('comment on ' + name, () => {
			// resolve() composites the translucent token over the surface actually behind it.
			const comment = resolve('var(--editor-token-comment)', surface);
			expect(contrast(comment, surface)).toBeGreaterThanOrEqual(4.5);
		});
	}
});
describe('library Badge variants (WCAG AA) on the panel surfaces', () => {
	const badgeCss = readFileSync(
		join(import.meta.dirname, '..', 'components', 'core', 'Badge.svelte'),
		'utf8'
	);
	const page = resolve('var(--ide-bg-primary)');
	const surfaces: Record<string, RGB> = {
		primary: page,
		secondary: resolve('var(--ide-bg-secondary)', page),
		elevated: resolve('var(--ide-bg-elevated)', page),
		tertiary: resolve('var(--ide-bg-tertiary)', page)
	};

	/** Declaration value of a property inside a single `.ide-badge--<variant> { ... }` rule. */
	function declaration(variant: string, property: 'color' | 'background'): string {
		const rule = new RegExp('\\.ide-badge--' + variant + '\\s*\\{([^}]*)\\}').exec(badgeCss);
		if (!rule) throw new Error('missing badge variant ' + variant);
		const decl = new RegExp('(?:^|[;\\s])' + property + ':\\s*([^;]+);').exec(rule[1]);
		if (!decl) throw new Error('missing ' + property + ' on ' + variant);
		return decl[1].trim();
	}

	for (const variant of ['default', 'primary', 'success', 'warning', 'error', 'info', 'danger']) {
		for (const [name, surface] of Object.entries(surfaces)) {
			it(variant + ' badge text on its own tint over the ' + name + ' surface', () => {
				// The tint is translucent: composite it over the surface, then measure the text on that.
				const background = resolve(declaration(variant, 'background'), surface);
				const text = resolve(declaration(variant, 'color'), background);
				expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
			});
		}
	}
});
