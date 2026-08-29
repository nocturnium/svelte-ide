import { test, expect, type Page, type Locator } from '@playwright/test';
import { waitForNetworkIdle } from './utils/editor-helpers';

/**
 * Geometry regression coverage for the two editor overlays that position by
 * document line: the AI focus layer (Ghost Pair) and the remote cursor layer.
 *
 * WHY THESE ASSERT BOXES, NOT STATE
 *
 * Both layers were stretched with `right: 0; bottom: 0` and clipped with
 * `overflow: hidden`. Those offsets resolve against the containing block — the
 * editor's padding box, which is ONE VIEWPORT, not the scrollable content — so
 * every agent cursor and remote caret below the first screenful was painted
 * nowhere. The element was in the DOM, at the right coordinates, with the right
 * classes and inline styles, and `getBoundingClientRect()` still reported its
 * layout box, because a box clipped by an ancestor is still laid out.
 *
 * So no assertion about the caret alone can see this bug, and no assertion about
 * component state can either — the repository already had 72 passing state tests
 * across these surfaces while the feature was invisible. The only thing that
 * distinguishes a painted overlay from a clipped one is the relationship between
 * two boxes: the caret's, and the box of the layer that clips it.
 *
 * Each test below therefore compares a child box against its clipping ancestor,
 * or against the text row it claims to sit on.
 */

/** How much sub-pixel rounding to forgive when comparing two laid-out boxes. */
const EPSILON = 1.5;

async function collapseFoldAtRawLine(container: Locator, rawLine: number): Promise<void> {
	const line = container.locator(`.custom-editor__line[data-line-index="${rawLine}"]`);
	await expect(line).toBeVisible();
	await line.hover();
	const foldIndicator = line.locator('.custom-editor__fold-indicator');
	await expect(foldIndicator).toBeVisible();
	await foldIndicator.click();
	await expect(foldIndicator).toHaveClass(/custom-editor__fold-indicator--collapsed/);
}

/** Scroll the editor's own scroll container to the bottom and settle. */
async function scrollEditorToBottom(page: Page, contentSelector: string): Promise<void> {
	await page.evaluate((sel) => {
		const content = document.querySelector(sel) as HTMLElement | null;
		if (content) content.scrollTop = content.scrollHeight;
	}, contentSelector);
	await page.waitForTimeout(250);
}

test.describe('remote cursor layer geometry', () => {
	const CONTENT = '.editor-container .custom-editor__content';

	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/collaboration');
		await waitForNetworkIdle(page);
		// The collaborative editor renders a loading placeholder until its Yjs
		// document is ready, so wait for the real scroller rather than a fixed delay.
		await page.locator('.editor-container .custom-editor__content').first().waitFor();
		await page.locator('.remote-cursors__caret').first().waitFor();
		await page.waitForTimeout(300);
	});

	test('the layer spans the whole document, not one viewport', async ({ page }) => {
		const measured = await page.evaluate((sel) => {
			const content = document.querySelector(sel) as HTMLElement | null;
			const layer = document.querySelector('.remote-cursors') as HTMLElement | null;
			if (!content || !layer) return null;
			return {
				layerHeight: layer.getBoundingClientRect().height,
				viewportHeight: content.clientHeight,
				scrollHeight: content.scrollHeight
			};
		}, CONTENT);

		expect(measured).not.toBeNull();
		// Guard the guard: if the sample ever shrinks to fit the window there is no
		// fold to fall below, and every assertion here would pass vacuously.
		expect(measured!.scrollHeight).toBeGreaterThan(measured!.viewportHeight + 40);
		// The bug in one number: the layer used to measure exactly one viewport.
		expect(measured!.layerHeight).toBeGreaterThan(measured!.viewportHeight + 40);
	});

	test('a caret below the fold is inside its clipping layer, not past its edge', async ({
		page
	}) => {
		const result = await page.evaluate((sel) => {
			const content = document.querySelector(sel) as HTMLElement | null;
			const layer = document.querySelector('.remote-cursors') as HTMLElement | null;
			if (!content || !layer) return null;

			const layerTop = layer.getBoundingClientRect().top;
			const carets = Array.from(layer.querySelectorAll('.remote-cursors__caret')) as HTMLElement[];

			// Offset within the layer, which is what the clip is measured against —
			// independent of how far the page or the editor happens to be scrolled.
			const offsets = carets.map((caret) => {
				const r = caret.getBoundingClientRect();
				return { top: r.top - layerTop, bottom: r.bottom - layerTop };
			});

			return {
				offsets,
				layerHeight: layer.getBoundingClientRect().height,
				viewportHeight: content.clientHeight
			};
		}, CONTENT);

		expect(result).not.toBeNull();
		expect(result!.offsets.length).toBeGreaterThan(0);

		// The demo seeds a collaborator past line 25 precisely so this case exists.
		// Without one, the layer could be a single viewport tall and still contain
		// every caret it was given.
		const belowFold = result!.offsets.filter((o) => o.top > result!.viewportHeight);
		expect(
			belowFold.length,
			'demo must seed a remote caret below the first screenful'
		).toBeGreaterThan(0);

		for (const caret of result!.offsets) {
			expect(caret.top).toBeGreaterThanOrEqual(-EPSILON);
			expect(caret.bottom).toBeLessThanOrEqual(result!.layerHeight + EPSILON);
		}
	});

	test('a caret tracks the rendered text row after a fold collapses above it', async ({ page }) => {
		// The desync guard. The layer's height is measured in VISUAL ROWS while a
		// remote caret arrives as a raw document line, so sizing the layer to the
		// document without also mapping line -> visual row would leave every caret
		// after a collapsed fold sitting a few rows low. Fixing the clip alone would
		// have traded an invisible caret for a misplaced one.
		const container = page.locator('.editor-container');
		const CARET_RAW_LINE = 27; // Charlie is seeded on 1-based line 28.

		await collapseFoldAtRawLine(container, 3); // the `interface Document` block
		await page.waitForTimeout(200);
		await scrollEditorToBottom(page, CONTENT);

		const row = container.locator(`.custom-editor__line[data-line-index="${CARET_RAW_LINE}"]`);
		await expect(row).toBeVisible();

		const rowBox = await row.boundingBox();
		const caretBox = await page
			.locator('.remote-cursors__caret')
			.nth(2) // third seeded cursor — the one past the fold
			.boundingBox();

		expect(rowBox).toBeTruthy();
		expect(caretBox).toBeTruthy();
		// Same row, to the pixel. Under a line/visual-row desync this is off by
		// exactly the number of lines the collapsed fold hid.
		expect(Math.abs(caretBox!.y - rowBox!.y)).toBeLessThanOrEqual(3);
	});
});

test.describe('AI focus layer geometry', () => {
	const CONTENT = '.editor-container .custom-editor__content';

	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/cognitive-load');
		await waitForNetworkIdle(page);
		// Explicit waits, not a fixed delay. Under a full-suite run these pages
		// share one dev server with five other workers, and a timeout long enough
		// for the slowest run is dead time in every other one.
		await page.locator('.editor-container .custom-editor__content').first().waitFor();
		// A painted spine means the complexity pass has completed, which is what
		// gives the layer its measured content height.
		await page.locator('.complexity-gutter__spine').first().waitFor();
		await page.locator('.ai-focus-layer__cursor').first().waitFor();
		await page.locator('.ai-focus-layer__region').first().waitFor();
	});

	test('the layer spans the whole document, not one viewport', async ({ page }) => {
		const measured = await page.evaluate((sel) => {
			const content = document.querySelector(sel) as HTMLElement | null;
			const layer = document.querySelector('.ai-focus-layer') as HTMLElement | null;
			if (!content || !layer) return null;
			return {
				layerHeight: layer.getBoundingClientRect().height,
				viewportHeight: content.clientHeight,
				scrollHeight: content.scrollHeight
			};
		}, CONTENT);

		expect(measured).not.toBeNull();
		expect(measured!.scrollHeight).toBeGreaterThan(measured!.viewportHeight + 40);
		expect(measured!.layerHeight).toBeGreaterThan(measured!.viewportHeight + 40);
	});

	test('the agent cursor and its focus glow sit inside the layer', async ({ page }) => {
		const result = await page.evaluate(() => {
			const layer = document.querySelector('.ai-focus-layer') as HTMLElement | null;
			if (!layer) return null;
			const lr = layer.getBoundingClientRect();
			const boxes = Array.from(
				layer.querySelectorAll('.ai-focus-layer__cursor, .ai-focus-layer__region')
			).map((el) => {
				const r = el.getBoundingClientRect();
				return { top: r.top - lr.top, bottom: r.bottom - lr.top };
			});
			return { boxes, layerHeight: lr.height };
		});

		expect(result).not.toBeNull();
		expect(result!.boxes.length).toBeGreaterThan(0);
		for (const box of result!.boxes) {
			expect(box.top).toBeGreaterThanOrEqual(-EPSILON);
			expect(box.bottom).toBeLessThanOrEqual(result!.layerHeight + EPSILON);
		}
	});

	test('the agent is on screen at the initial scroll position', async ({ page }) => {
		// The demo used to roam the agent over lines 45-90 of a 157-line sample in a
		// 500px window, so even with the clip fixed you had to scroll to find the
		// feature the section above is describing. Asserts real intersection with
		// the visible viewport, not merely that the element exists.
		const intersects = await page.evaluate((sel) => {
			const content = document.querySelector(sel) as HTMLElement | null;
			const cursor = document.querySelector('.ai-focus-layer__cursor') as HTMLElement | null;
			if (!content || !cursor) return null;
			const c = content.getBoundingClientRect();
			const k = cursor.getBoundingClientRect();
			return k.bottom > c.top && k.top < c.bottom && k.right > c.left && k.left < c.right;
		}, CONTENT);

		expect(intersects).toBe(true);
	});
});
