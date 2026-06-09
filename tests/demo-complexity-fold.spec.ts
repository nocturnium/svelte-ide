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
			const indicators = Array.from(
				document.querySelectorAll('.complexity-gutter__indicator')
			) as HTMLElement[];
			const colors = new Set(indicators.map((el) => getComputedStyle(el).backgroundColor));
			return { count: indicators.length, distinctColors: colors.size };
		});

		// The sample contains a genuinely medium function and a critical one; both
		// must paint, in distinct colours. (Regressions: a 2-nested-if function used
		// to score High, and `const x = (a) / b` produced a phantom region.)
		expect(data.count).toBeGreaterThan(10);
		expect(data.distinctColors).toBeGreaterThanOrEqual(2);
	});

	test('legend ranges match the analyzer levels', async ({ page }) => {
		await page.goto('/demo/cognitive-load');
		await page.waitForLoadState('networkidle');
		const legend = page.locator('.complexity-legend');
		await expect(legend).toContainText('Medium (50-69)');
		await expect(legend).toContainText('Critical (85+)');
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
});
