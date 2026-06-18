import { test, expect } from '@playwright/test';

/**
 * Regression coverage for two demo features that previously misbehaved:
 *  - cognitive-load complexity highlighting (a medium function read as High,
 *    plus a phantom region), and
 *  - semantic fold presets, which were a no-op stub.
 */

test.describe('cognitive-load complexity highlighting', () => {
	test('paints gutter indicators in distinct complexity levels', async ({ page }) => {
		await page.goto('/demo/cognitive-load');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(800);

		const data = await page.evaluate(() => {
			// The thermal-map redesign renders one colored spine per complexity
			// region (was a per-line `.complexity-gutter__indicator`).
			const indicators = Array.from(
				document.querySelectorAll('.complexity-gutter__spine')
			) as HTMLElement[];
			const colors = new Set(indicators.map((el) => getComputedStyle(el).backgroundColor));
			return { count: indicators.length, distinctColors: colors.size };
		});

		// The sample contains a genuinely medium function and a critical one; both
		// must paint, in distinct colours. (Regressions: a 2-nested-if function used
		// to score High, and `const x = (a) / b` produced a phantom region.)
		expect(data.count).toBeGreaterThanOrEqual(2);
		expect(data.distinctColors).toBeGreaterThanOrEqual(2);
	});

	test('legend ranges match the analyzer levels', async ({ page }) => {
		await page.goto('/demo/cognitive-load');
		await page.waitForLoadState('networkidle');
		const legend = page.locator('.complexity-legend');
		await expect(legend).toContainText('Medium (50-69)');
		await expect(legend).toContainText('Critical (85+)');
	});

	test('high-complexity indicators render past the first viewport (not clipped)', async ({
		page
	}) => {
		await page.goto('/demo/cognitive-load');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000);

		const result = await page.evaluate(() => {
			const RED = 'rgb(248, 113, 113)'; // --ide-error / critical (#f87171, AA-safe)
			const content = document.querySelector(
				'.editor-container .custom-editor__content'
			) as HTMLElement | null;
			const viewportH = content ? content.clientHeight : 0;
			const spines = Array.from(
				document.querySelectorAll('.complexity-gutter__spine')
			) as HTMLElement[];
			// A critical (red) spine whose top sits below the first screenful proves
			// the gutter layer spans the full document height rather than one viewport.
			const redPastFold = spines.filter(
				(el) =>
					getComputedStyle(el).backgroundColor === RED &&
					(parseFloat(el.style.top) || 0) > viewportH
			);
			return { redPastFold: redPastFold.length, totalSpines: spines.length, viewportH };
		});

		// Regression: the gutter layer was sized to a single viewport, so the
		// critical region (which starts below the first screenful) was clipped and
		// never rendered. The full-height layer must paint the critical (red) spine
		// past the fold.
		expect(result.viewportH).toBeGreaterThan(0);
		expect(result.redPastFold).toBeGreaterThanOrEqual(1);
	});
});

test.describe('semantic fold presets', () => {
	test('applying a preset collapses regions in the live editor', async ({ page }) => {
		await page.goto('/demo/semantic-features');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(800);

		const collapsedBefore = await page.evaluate(
			() => document.querySelectorAll('[class*="collapsed"]').length
		);
		expect(collapsedBefore).toBe(0);

		// "Debugging" hides comments/types/tests — collapses the interface and
		// comment blocks in the sample.
		await page.locator('.preset-card__apply', { hasText: 'Debugging' }).click();
		await page.waitForTimeout(500);

		const collapsedAfter = await page.evaluate(
			() => document.querySelectorAll('[class*="collapsed"]').length
		);
		expect(collapsedAfter).toBeGreaterThan(0);

		// Clearing the preset expands everything again.
		await page.locator('.preset-card--active .preset-card__clear').click();
		await page.waitForTimeout(400);
		const collapsedCleared = await page.evaluate(
			() => document.querySelectorAll('[class*="collapsed"]').length
		);
		expect(collapsedCleared).toBe(0);
	});

	test('every preset folds something (editor height shrinks)', async ({ page }) => {
		await page.goto('/demo/semantic-features');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000);

		// The editor virtualizes, so count rendered "collapsed" nodes is unreliable;
		// instead measure the rendered line column height, which shrinks as folds
		// hide lines.
		const linesHeight = () =>
			page.evaluate(() => {
				const lines = document.querySelector('.editor-pane .custom-editor__lines');
				return lines ? (lines as HTMLElement).getBoundingClientRect().height : -1;
			});

		const baseline = await linesHeight();
		expect(baseline).toBeGreaterThan(0);

		const count = await page.locator('.preset-card__apply').count();
		expect(count).toBe(6);

		for (let i = 0; i < count; i++) {
			await page.locator('.preset-card__apply').nth(i).click();
			await page.waitForTimeout(350);
			const h = await linesHeight();
			expect(h, `preset #${i} should fold at least one region`).toBeLessThan(baseline);
			const clear = page.locator('.preset-card--active .preset-card__clear');
			if (await clear.count()) {
				await clear.click();
				await page.waitForTimeout(250);
			}
		}
	});

	test('an import-hiding preset folds the import group', async ({ page }) => {
		await page.goto('/demo/semantic-features');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000);

		// "Code Review" hides imports; the consecutive import lines collapse into a
		// single foldable header (import-group folding).
		await page.locator('.preset-card__apply', { hasText: 'Code Review' }).click();
		await page.waitForTimeout(500);

		const importLineHidden = await page.evaluate(() => {
			// Line index 2 (0-based) is the 3rd import; it should be hidden once the
			// import group collapses onto its header line.
			const lines = Array.from(
				document.querySelectorAll('.editor-pane .custom-editor__line')
			) as HTMLElement[];
			const indices = lines.map((l) => l.dataset.lineIndex);
			return { hasLine1: indices.includes('1'), hasLine3: indices.includes('3') };
		});
		// The header line (index 1) stays; a folded-away import line (index 3) is gone.
		expect(importLineHidden.hasLine1).toBe(true);
		expect(importLineHidden.hasLine3).toBe(false);
	});
});
