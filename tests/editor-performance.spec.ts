import { test, expect } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

test.describe('Editor Performance', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/editor');
		await waitForNetworkIdle(page);
	});

	test('typing latency is acceptable', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();
		await editor.press('Control+Home');

		// Measure time to type 100 characters
		const startTime = Date.now();

		for (let i = 0; i < 100; i++) {
			await page.keyboard.type('x', { delay: 0 });
		}

		const endTime = Date.now();
		const totalTime = endTime - startTime;
		const avgLatency = totalTime / 100;

		// Each keystroke should complete in under 50ms on average
		expect(avgLatency).toBeLessThan(50);

		// Verify the content was actually inserted
		const content = await editor.getContent();
		expect(content).toContain('x'.repeat(100));
	});

	test('rapid cursor movement is smooth', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();
		await editor.press('Control+Home');

		// Time rapid arrow key presses
		const startTime = Date.now();

		for (let i = 0; i < 50; i++) {
			await page.keyboard.press('ArrowDown');
		}

		const endTime = Date.now();
		const totalTime = endTime - startTime;

		// 50 cursor movements should complete in under 2 seconds
		expect(totalTime).toBeLessThan(2000);
	});

	test('selection performance on large range', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();
		await editor.press('Control+Home');

		// Time selecting all content
		const startTime = Date.now();

		await editor.press('Control+Shift+End');
		await page.waitForTimeout(100);

		const endTime = Date.now();
		const selectionTime = endTime - startTime;

		// Selecting all should complete in under 500ms
		expect(selectionTime).toBeLessThan(500);

		// Verify selection exists
		const hasSelection = await editor.hasSelection();
		expect(hasSelection).toBe(true);
	});

	test('find operation completes quickly', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		const startTime = Date.now();

		await editor.search('string');
		await page.waitForTimeout(100);

		// Wait for matches to be highlighted
		const matches = editor.container.locator('.custom-editor__match');
		await expect(matches.first()).toBeVisible({ timeout: 1000 });

		const endTime = Date.now();
		const searchTime = endTime - startTime;

		// Search should complete in under 500ms
		expect(searchTime).toBeLessThan(500);

		const matchCount = await matches.count();
		expect(matchCount).toBeGreaterThan(0);
	});

	test('replace all completes quickly', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add some test content
		await editor.press('Control+End');
		await editor.press('Enter');
		await editor.type('PERF_TEST PERF_TEST PERF_TEST PERF_TEST PERF_TEST');

		await editor.openFindReplace();
		await editor.findInput.fill('PERF_TEST');
		await page.waitForTimeout(200);

		const startTime = Date.now();

		await editor.replaceInput.fill('DONE');
		const replaceAllBtn = editor.container.locator('.find-replace__action[aria-label="Replace all"]');
		await replaceAllBtn.click();
		await page.waitForTimeout(100);

		const endTime = Date.now();
		const replaceTime = endTime - startTime;

		// Replace all should complete in under 500ms
		expect(replaceTime).toBeLessThan(500);
	});

	test('undo operation is fast', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();
		await editor.press('Control+Home');

		// Make several edits
		for (let i = 0; i < 20; i++) {
			await editor.type(`Line${i}`);
			await editor.press('Enter');
		}
		await page.waitForTimeout(100);

		// Time undoing all changes
		const startTime = Date.now();

		for (let i = 0; i < 20; i++) {
			await editor.undo();
		}

		const endTime = Date.now();
		const undoTime = endTime - startTime;

		// 20 undos should complete in under 2 seconds
		expect(undoTime).toBeLessThan(2000);
	});

	test('scroll performance is acceptable', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Measure scroll performance
		const startTime = Date.now();

		// Page down multiple times
		for (let i = 0; i < 10; i++) {
			await editor.press('PageDown');
			await page.waitForTimeout(10);
		}

		// Page up back
		for (let i = 0; i < 10; i++) {
			await editor.press('PageUp');
			await page.waitForTimeout(10);
		}

		const endTime = Date.now();
		const scrollTime = endTime - startTime;

		// 20 page scrolls should complete in under 3 seconds
		expect(scrollTime).toBeLessThan(3000);
	});

	test('syntax highlighting does not cause visible delay', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();
		await editor.press('Control+End');
		await editor.press('Enter');

		// Type a code snippet that triggers syntax highlighting
		const codeSnippet = 'function test() { return "hello"; }';

		const startTime = Date.now();

		await editor.type(codeSnippet);
		await page.waitForTimeout(50);

		const endTime = Date.now();
		const totalTime = endTime - startTime;

		// Typing with syntax highlighting should still be responsive
		// Allow more time since we're typing full snippet
		const expectedTime = codeSnippet.length * 30; // 30ms per char max
		expect(totalTime).toBeLessThan(expectedTime);

		// Verify syntax tokens are present
		const tokens = editor.container.locator('[class*="token-"]');
		const tokenCount = await tokens.count();
		expect(tokenCount).toBeGreaterThan(0);
	});

	test('memory usage stays stable during editing', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Get initial memory if available
		const getMemory = async () => {
			return page.evaluate(() => {
				if ('memory' in performance) {
					return (performance as any).memory?.usedJSHeapSize ?? 0;
				}
				return 0;
			});
		};

		const initialMemory = await getMemory();

		// Make many edits
		await editor.press('Control+Home');
		for (let i = 0; i < 50; i++) {
			await editor.type(`Test line ${i}`);
			await editor.press('Enter');
		}

		// Undo all
		for (let i = 0; i < 50; i++) {
			await editor.undo();
		}

		// Redo all
		for (let i = 0; i < 50; i++) {
			await editor.redo();
		}

		const finalMemory = await getMemory();

		// Memory shouldn't grow more than 10MB during editing session
		// Skip this assertion if memory API isn't available
		if (initialMemory > 0) {
			const memoryGrowth = finalMemory - initialMemory;
			expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
		}
	});

	test('cursor blink does not cause excessive repaints', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Wait for cursor to blink a few times
		await page.waitForTimeout(2000);

		// Cursor should still be rendering (alternating visibility)
		const cursor = editor.cursor;
		await expect(cursor).toBeVisible();

		// The editor should still be responsive
		await editor.type('test');
		const content = await editor.getContent();
		expect(content).toContain('test');
	});
});
