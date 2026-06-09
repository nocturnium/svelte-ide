import { test, expect } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

test.describe('Editor Selection and Clipboard', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/editor-basic');
		await waitForNetworkIdle(page);
	});

	test('Ctrl+A selects all text', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.selectAll();
		await page.waitForTimeout(50);

		const hasSelection = await editor.hasSelection();
		expect(hasSelection).toBe(true);

		// Selection should span multiple lines
		const selectionRects = await editor.selection.locator('rect, div').count();
		expect(selectionRects).toBeGreaterThan(0);
	});

	test('double-click selects word', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Double-click near the left side of first line content to hit a word (not space/punctuation)
		const firstLineContent = editor.container.locator('.custom-editor__line-content').first();
		const box = await firstLineContent.boundingBox();

		if (box) {
			// Click near the start of the line to hit "interface" word
			await page.mouse.click(box.x + 30, box.y + box.height / 2, { clickCount: 2 });
			await page.waitForTimeout(100);

			const hasSelection = await editor.hasSelection();
			expect(hasSelection).toBe(true);
		}
	});

	test('triple-click selects entire line', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.tripleClickLine(0);
		await page.waitForTimeout(50);

		const hasSelection = await editor.hasSelection();
		expect(hasSelection).toBe(true);
	});

	test('click and drag creates selection', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		const line = editor.lines.first();
		const box = await line.boundingBox();

		if (box) {
			// Drag from left to right
			await page.mouse.move(box.x + 10, box.y + box.height / 2);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + box.height / 2);
			await page.mouse.up();

			await page.waitForTimeout(50);

			const hasSelection = await editor.hasSelection();
			expect(hasSelection).toBe(true);
		}
	});

	// Clipboard API tests only work reliably in Chromium
	test('Ctrl+C copies selection', async ({ page, context, browserName }) => {
		test.skip(browserName !== 'chromium', 'Clipboard API not reliable in non-Chromium browsers');
		// Grant clipboard permissions
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);

		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add known text and select it
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('COPY_TEST_TEXT');
		await page.waitForTimeout(50);

		// Select the text we just typed
		await editor.press('Home');
		await editor.press('Shift+End');

		// Copy
		await editor.copy();

		// Read clipboard
		const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboardText).toBe('COPY_TEST_TEXT');
	});

	test('Ctrl+X cuts selection', async ({ page, context, browserName }) => {
		test.skip(browserName !== 'chromium', 'Clipboard API not reliable in non-Chromium browsers');
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);

		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add known text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('CUT_TEST_TEXT');
		await page.waitForTimeout(50);

		// Select and cut
		await editor.press('Home');
		await editor.press('Shift+End');
		await editor.cut();
		await page.waitForTimeout(50);

		// Text should be gone from editor
		const content = await editor.getContent();
		expect(content).not.toContain('CUT_TEST_TEXT');

		// But should be in clipboard
		const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboardText).toBe('CUT_TEST_TEXT');
	});

	test('Ctrl+V pastes text', async ({ page, context, browserName }) => {
		test.skip(browserName !== 'chromium', 'Clipboard API not reliable in non-Chromium browsers');
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);

		const editor = await createEditorHelper(page);
		await editor.focus();

		// Write to clipboard
		await page.evaluate(() => navigator.clipboard.writeText('PASTED_TEXT'));

		// Paste into editor
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.paste();
		await page.waitForTimeout(100);

		const content = await editor.getContent();
		expect(content).toContain('PASTED_TEXT');
	});

	test('typing replaces selection', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('ORIGINAL');
		await page.waitForTimeout(50);

		// Select it
		await editor.press('Home');
		await editor.press('Shift+End');

		// Type replacement
		await editor.type('NEW');
		await page.waitForTimeout(50);

		const content = await editor.getContent();
		expect(content).not.toContain('ORIGINAL');
		expect(content).toContain('NEW');
	});

	test('Backspace deletes selection', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('DELETE_ME');
		await page.waitForTimeout(50);

		// Select it
		await editor.press('Home');
		await editor.press('Shift+End');

		// Delete
		await editor.press('Backspace');
		await page.waitForTimeout(50);

		const content = await editor.getContent();
		expect(content).not.toContain('DELETE_ME');
	});

	test('Delete key deletes selection', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add text
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('DELETE_ME_TOO');
		await page.waitForTimeout(50);

		// Select it
		await editor.press('Home');
		await editor.press('Shift+End');

		// Delete
		await editor.press('Delete');
		await page.waitForTimeout(50);

		const content = await editor.getContent();
		expect(content).not.toContain('DELETE_ME_TOO');
	});

	test('multi-line selection works', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start
		await editor.press('Control+Home');

		// Select multiple lines
		await editor.press('Shift+ArrowDown');
		await editor.press('Shift+ArrowDown');
		await editor.press('Shift+ArrowDown');

		await page.waitForTimeout(50);

		const hasSelection = await editor.hasSelection();
		expect(hasSelection).toBe(true);

		// Should span multiple lines
		const selectionElements = await editor.selection.locator('rect, div').count();
		expect(selectionElements).toBeGreaterThan(0);
	});

	test('Shift+Click extends selection', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// First click on line 0 to establish cursor position
		const firstLineContent = editor.container.locator('.custom-editor__line-content').first();
		const firstBox = await firstLineContent.boundingBox();

		if (firstBox) {
			await page.mouse.click(firstBox.x + 10, firstBox.y + firstBox.height / 2);
			await page.waitForTimeout(50);
		}

		// Shift+Click on line 3 to extend selection using keyboard.down/up for shift
		const thirdLineContent = editor.container.locator('.custom-editor__line-content').nth(2);
		const box = await thirdLineContent.boundingBox();

		if (box) {
			await page.keyboard.down('Shift');
			await page.mouse.click(box.x + 50, box.y + box.height / 2);
			await page.keyboard.up('Shift');

			await page.waitForTimeout(100);

			const hasSelection = await editor.hasSelection();
			expect(hasSelection).toBe(true);
		}
	});

	test('Enter key creates new lines at end of document', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to end, add a marker, create blank lines, then type a second marker.
		await editor.press('Control+End');
		const startPosition = await editor.getAnnouncedCursorPosition();
		await editor.type('TAIL_MARKER');
		await editor.press('Enter');
		await editor.press('Enter');
		await editor.press('Enter');
		await editor.type('END_MARKER');
		await page.waitForTimeout(100);

		const finalPosition = await editor.getAnnouncedCursorPosition();
		expect(finalPosition.line).toBe(startPosition.line + 3);
		expect(finalPosition.column).toBe('END_MARKER'.length + 1);
	});
});
