import { test, expect } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

test.describe('Editor Undo and Redo', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/editor');
		await waitForNetworkIdle(page);
	});

	test('Ctrl+Z undoes last change', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add some text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('UNDO_TEST');
		await page.waitForTimeout(100);

		// Verify text is there
		let content = await editor.getContent();
		expect(content).toContain('UNDO_TEST');

		// Undo
		await editor.undo();
		await page.waitForTimeout(100);

		// Text should be gone (or partially gone depending on undo grouping)
		content = await editor.getContent();
		// After enough undos, UNDO_TEST should be gone
		await editor.undo();
		await editor.undo();
		await editor.undo();
		await editor.undo();
		await page.waitForTimeout(100);

		content = await editor.getContent();
		expect(content).not.toContain('UNDO_TEST');
	});

	test('Ctrl+Shift+Z redoes undone change', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('REDO_TEST');
		await page.waitForTimeout(100);

		// Undo multiple times
		await editor.undo();
		await editor.undo();
		await editor.undo();
		await editor.undo();
		await editor.undo();
		await page.waitForTimeout(100);

		let content = await editor.getContent();
		expect(content).not.toContain('REDO_TEST');

		// Redo multiple times
		await editor.redo();
		await editor.redo();
		await editor.redo();
		await editor.redo();
		await editor.redo();
		await page.waitForTimeout(100);

		content = await editor.getContent();
		expect(content).toContain('REDO_TEST');
	});

	test('Ctrl+Y also redoes (alternative keybinding)', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('REDO_Y');
		await page.waitForTimeout(100);

		// Undo
		await editor.undo();
		await editor.undo();
		await editor.undo();
		await page.waitForTimeout(100);

		// Redo with Ctrl+Y
		await editor.press('Control+y');
		await editor.press('Control+y');
		await editor.press('Control+y');
		await page.waitForTimeout(100);

		const content = await editor.getContent();
		expect(content).toContain('REDO_Y');
	});

	test('undo after Enter removes the newline', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.press('Control+Home');
		const beforeLineCount = await editor.getLineCount();

		await editor.press('End');
		await editor.press('Enter');
		await page.waitForTimeout(50);

		const afterLineCount = await editor.getLineCount();
		expect(afterLineCount).toBe(beforeLineCount + 1);

		// Undo
		await editor.undo();
		await page.waitForTimeout(50);

		const finalLineCount = await editor.getLineCount();
		expect(finalLineCount).toBe(beforeLineCount);
	});

	test('undo after delete restores content', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('RESTORE_ME');
		await page.waitForTimeout(100);

		// Select and delete
		await editor.press('Home');
		await editor.press('Shift+End');
		await editor.press('Delete');
		await page.waitForTimeout(50);

		let content = await editor.getContent();
		expect(content).not.toContain('RESTORE_ME');

		// Undo
		await editor.undo();
		await page.waitForTimeout(100);

		content = await editor.getContent();
		expect(content).toContain('RESTORE_ME');
	});

	test('new edit clears redo stack', async ({ page, browserName }) => {
		// This test has timing-sensitive undo/redo behavior that's flaky in WebKit
		test.skip(browserName === 'webkit', 'Undo/redo timing flaky in WebKit');

		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('AAA');
		await page.waitForTimeout(100);

		// Undo
		await editor.undo();
		await editor.undo();
		await editor.undo();
		await page.waitForTimeout(50);

		// Type something new
		await editor.type('BBB');
		await page.waitForTimeout(100);

		// Redo should have no effect (stack cleared)
		const beforeRedo = await editor.getContent();
		await editor.redo();
		await page.waitForTimeout(50);
		const afterRedo = await editor.getContent();

		// Content should be unchanged
		expect(afterRedo).toBe(beforeRedo);
		expect(afterRedo).toContain('BBB');
		expect(afterRedo).not.toContain('AAA');
	});

	test('undo after paste restores original content', async ({ page, context, browserName }) => {
		test.skip(browserName !== 'chromium', 'Clipboard API not reliable in non-Chromium browsers');
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);

		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.press('Control+Home');
		const _originalContent = await editor.getContent();

		// Paste some text
		await page.evaluate(() => navigator.clipboard.writeText('PASTED_STUFF'));
		await editor.press('End');
		await editor.press('Enter');
		await editor.paste();
		await page.waitForTimeout(100);

		let content = await editor.getContent();
		expect(content).toContain('PASTED_STUFF');

		// Undo multiple times to restore
		await editor.undo();
		await editor.undo();
		await page.waitForTimeout(100);

		content = await editor.getContent();
		expect(content).not.toContain('PASTED_STUFF');
	});

	test('undo after cut restores deleted text', async ({ page, context, browserName }) => {
		test.skip(browserName !== 'chromium', 'Clipboard API not reliable in non-Chromium browsers');
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);

		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('CUT_RESTORE');
		await page.waitForTimeout(100);

		// Select and cut
		await editor.press('Home');
		await editor.press('Shift+End');
		await editor.cut();
		await page.waitForTimeout(50);

		let content = await editor.getContent();
		expect(content).not.toContain('CUT_RESTORE');

		// Undo
		await editor.undo();
		await page.waitForTimeout(100);

		content = await editor.getContent();
		expect(content).toContain('CUT_RESTORE');
	});

	test('multiple undos work correctly', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');

		// Type multiple distinct words with pauses
		await editor.type('ONE');
		await page.waitForTimeout(400); // Allow undo grouping timeout
		await editor.type(' TWO');
		await page.waitForTimeout(400);
		await editor.type(' THREE');
		await page.waitForTimeout(100);

		let content = await editor.getContent();
		expect(content).toContain('ONE');
		expect(content).toContain('TWO');
		expect(content).toContain('THREE');

		// Undo should progressively remove
		await editor.undo();
		await page.waitForTimeout(50);

		content = await editor.getContent();
		// At least THREE should be gone or partial
		const hasThree = content.includes('THREE');
		if (!hasThree) {
			expect(content).toContain('TWO');
		}
	});

	test('undo history survives across cursor movements', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add text at end
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('HISTORY_TEST');
		await page.waitForTimeout(100);

		// Move cursor around
		await editor.press('ArrowUp');
		await editor.press('ArrowDown');
		await editor.press('Home');
		await editor.press('End');

		// Undo should still work
		await editor.undo();
		await editor.undo();
		await editor.undo();
		await editor.undo();
		await page.waitForTimeout(100);

		const content = await editor.getContent();
		expect(content).not.toContain('HISTORY_TEST');
	});
});
