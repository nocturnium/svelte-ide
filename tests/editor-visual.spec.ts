import { test, expect } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

test.describe('Editor Visual Regression', () => {
	test.beforeEach(async ({ page, browserName }) => {
		// Visual regression tests should run on a single browser for consistency
		// Different browsers render fonts/elements differently
		test.skip(browserName !== 'chromium', 'Visual regression tests only run on Chromium');
		await page.goto('/demo/editor');
		await waitForNetworkIdle(page);
	});

	test('editor renders correctly on initial load', async ({ page }) => {
		const editor = await createEditorHelper(page);

		// Wait for syntax highlighting to complete
		await page.waitForTimeout(500);

		// Take screenshot of the editor
		await expect(editor.container).toHaveScreenshot('editor-initial-load.png', {
			maxDiffPixelRatio: 0.01
		});
	});

	test('cursor is visible when focused', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Wait for cursor to be visible
		await expect(editor.cursor).toBeVisible();

		// Take screenshot showing cursor
		await expect(editor.container).toHaveScreenshot('editor-cursor-visible.png', {
			maxDiffPixelRatio: 0.02
		});
	});

	test('selection highlighting renders correctly', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start and select first 3 lines
		await editor.press('Control+Home');
		await editor.press('Shift+ArrowDown');
		await editor.press('Shift+ArrowDown');
		await editor.press('Shift+ArrowDown');

		await page.waitForTimeout(100);

		await expect(editor.container).toHaveScreenshot('editor-selection-highlight.png', {
			maxDiffPixelRatio: 0.02
		});
	});

	test('active line highlighting renders correctly', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Move to line 5
		await editor.press('Control+Home');
		for (let i = 0; i < 4; i++) {
			await editor.press('ArrowDown');
		}

		await page.waitForTimeout(100);

		await expect(editor.container).toHaveScreenshot('editor-active-line.png', {
			maxDiffPixelRatio: 0.02
		});
	});

	test('find/replace bar renders correctly', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Open find/replace
		await editor.openFindReplace();
		await editor.findInput.fill('User');
		await page.waitForTimeout(200);

		await expect(editor.container).toHaveScreenshot('editor-find-replace.png', {
			maxDiffPixelRatio: 0.02
		});
	});

	test('search matches are highlighted', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('string');
		await page.waitForTimeout(300);

		// Check that matches are visible
		const matches = editor.container.locator('.custom-editor__match');
		const matchCount = await matches.count();
		expect(matchCount).toBeGreaterThan(0);

		await expect(editor.container).toHaveScreenshot('editor-search-matches.png', {
			maxDiffPixelRatio: 0.02
		});
	});

	test('different language syntax highlighting', async ({ page }) => {
		// Test Python syntax highlighting
		const pythonBtn = page.locator('.language-btn:has-text("Python")');
		await pythonBtn.click();
		await page.waitForTimeout(300);

		const editor = await createEditorHelper(page);
		await expect(editor.container).toHaveScreenshot('editor-python-syntax.png', {
			maxDiffPixelRatio: 0.02
		});
	});

	test('JSON syntax highlighting', async ({ page }) => {
		const jsonBtn = page.locator('.language-btn:has-text("JSON")');
		await jsonBtn.click();
		await page.waitForTimeout(300);

		const editor = await createEditorHelper(page);
		await expect(editor.container).toHaveScreenshot('editor-json-syntax.png', {
			maxDiffPixelRatio: 0.02
		});
	});

	test('line numbers are aligned', async ({ page }) => {
		const editor = await createEditorHelper(page);

		// Get first few line numbers
		const lineNumbers = editor.container.locator('.custom-editor__line-number');
		const count = await lineNumbers.count();
		expect(count).toBeGreaterThan(0);

		// Check alignment - all line numbers should have same left position
		const positions: number[] = [];
		for (let i = 0; i < Math.min(5, count); i++) {
			const box = await lineNumbers.nth(i).boundingBox();
			if (box) positions.push(box.x);
		}

		// All positions should be the same (aligned)
		const firstPos = positions[0];
		for (const pos of positions) {
			expect(Math.abs(pos - firstPos)).toBeLessThan(2);
		}
	});

	test('scrolled editor maintains layout', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Scroll down
		await editor.press('Control+End');
		await page.waitForTimeout(200);

		await expect(editor.container).toHaveScreenshot('editor-scrolled.png', {
			maxDiffPixelRatio: 0.02
		});
	});
});
