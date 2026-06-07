import { test, expect } from '@playwright/test';

test.describe('Editor Cursor Position', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/editor');
		await page.waitForLoadState('networkidle');
	});

	test('cursor should be aligned with line content', async ({ page }) => {
		// Find the editor
		const editor = page.locator('.custom-editor__content');
		await expect(editor).toBeVisible();

		// Click on the editor to focus
		await editor.click();

		// Wait for cursor to appear
		const cursor = page.locator('.custom-editor__cursor');
		await expect(cursor).toBeVisible();

		// Get cursor position
		const cursorBox = await cursor.boundingBox();
		expect(cursorBox).toBeTruthy();

		// Get the active line
		const activeLine = page.locator('.custom-editor__line--active');
		const lineBox = await activeLine.boundingBox();
		expect(lineBox).toBeTruthy();

		if (cursorBox && lineBox) {
			// Cursor should be within the active line vertically
			console.log('Cursor:', cursorBox);
			console.log('Line:', lineBox);

			// Cursor top should be >= line top
			expect(cursorBox.y).toBeGreaterThanOrEqual(lineBox.y - 1);
			// Cursor bottom should be <= line bottom
			expect(cursorBox.y + cursorBox.height).toBeLessThanOrEqual(lineBox.y + lineBox.height + 1);
		}

		await page.screenshot({ path: 'tests/screenshots/editor-cursor-position.png' });
	});

	test('cursor should move with arrow keys and stay aligned', async ({ page }) => {
		const editor = page.locator('.custom-editor__content');
		await expect(editor).toBeVisible();
		await editor.click();

		const cursor = page.locator('.custom-editor__cursor');
		await expect(cursor).toBeVisible();

		// Move down several lines
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(50);
		}

		// Get cursor and line positions
		const cursorBox = await cursor.boundingBox();
		const activeLine = page.locator('.custom-editor__line--active');
		const lineBox = await activeLine.boundingBox();

		if (cursorBox && lineBox) {
			console.log('After moving down - Cursor:', cursorBox);
			console.log('After moving down - Line:', lineBox);

			// Cursor should still be within the active line
			expect(cursorBox.y).toBeGreaterThanOrEqual(lineBox.y - 1);
			expect(cursorBox.y + cursorBox.height).toBeLessThanOrEqual(lineBox.y + lineBox.height + 1);
		}

		await page.screenshot({ path: 'tests/screenshots/editor-cursor-after-move.png' });
	});

	test('cursor height should match line height', async ({ page }) => {
		const editor = page.locator('.custom-editor__content');
		await expect(editor).toBeVisible();
		await editor.click();

		const cursor = page.locator('.custom-editor__cursor');
		await expect(cursor).toBeVisible();

		const cursorBox = await cursor.boundingBox();
		const line = page.locator('.custom-editor__line').first();
		const lineBox = await line.boundingBox();

		if (cursorBox && lineBox) {
			console.log('Cursor height:', cursorBox.height);
			console.log('Line height:', lineBox.height);

			// Cursor height should approximately match line height (within 2px tolerance)
			expect(Math.abs(cursorBox.height - lineBox.height)).toBeLessThanOrEqual(2);
		}
	});
});
