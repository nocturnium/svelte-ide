import { test, expect } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

test.describe('Editor Basic Functionality', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/editor-basic');
		await waitForNetworkIdle(page);
	});

	test('should render editor with content', async ({ page }) => {
		const editor = await createEditorHelper(page);

		// Should have visible lines
		const lineCount = await editor.getLineCount();
		expect(lineCount).toBeGreaterThan(0);

		// Should have line numbers visible
		await expect(editor.gutter).toBeVisible();
	});

	test('should display cursor on focus', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await expect(editor.cursor).toBeVisible();
	});

	test('should type characters into editor', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Get initial content
		const initialContent = await editor.getContent();

		// Move to start and type (more reliable than End)
		await editor.press('Control+Home');
		await page.waitForTimeout(50);

		// Type some text
		await editor.type('TYPED_TEXT');
		await page.waitForTimeout(100);

		// Verify content changed
		const newContent = await editor.getContent();
		expect(newContent).toContain('TYPED_TEXT');
		expect(newContent).not.toBe(initialContent);
	});

	test('should handle Enter key to create new lines', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Move to end of first line and press Enter
		const originalSecondLine = await editor.getLineText(1);
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');

		await expect
			.poll(async () => (await editor.getLineText(1)).replace(/\u00a0/g, '').trim())
			.toBe('');
		expect(await editor.getLineText(2)).toBe(originalSecondLine);
	});

	test('should handle Backspace to delete characters', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to a known position and type
		await editor.press('Control+Home');
		await page.waitForTimeout(50);
		await editor.type('ABC');
		await page.waitForTimeout(100);

		// Verify ABC is there
		let content = await editor.getContent();
		expect(content).toContain('ABC');

		// Delete one character
		await editor.press('Backspace');
		await page.waitForTimeout(50);

		// Now should have AB but not ABC
		content = await editor.getContent();
		expect(content).toContain('AB');
		// The C should be gone, so the full "ABC" should not be present
		expect(content.includes('ABC')).toBe(false);
	});

	test('should handle Delete key to remove characters ahead', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start of document
		await editor.press('Control+Home');

		const beforeDelete = await editor.getLineText(0);

		// Delete first character
		await editor.press('Delete');

		const afterDelete = await editor.getLineText(0);
		expect(afterDelete.length).toBe(beforeDelete.length - 1);
	});

	test('should have language selector buttons', async ({ page }) => {
		// Verify language buttons are present
		const languageButtons = [
			'JavaScript',
			'TypeScript',
			'Python',
			'HTML',
			'CSS',
			'JSON',
			'Go',
			'Markdown'
		];

		for (const lang of languageButtons) {
			const btn = page.locator(`.language-btn:has-text("${lang}")`);
			await expect(btn).toBeVisible();
		}

		// TypeScript should be active by default
		const tsBtn = page.locator('.language-btn:has-text("TypeScript")');
		await expect(tsBtn).toHaveClass(/active/);
	});

	test('should highlight syntax tokens', async ({ page }) => {
		const editor = await createEditorHelper(page);

		// Check for syntax highlighting spans
		const keywords = editor.container.locator('.token-keyword');
		const strings = editor.container.locator('.token-string');

		// Should have some keywords and strings in TypeScript code
		expect(await keywords.count()).toBeGreaterThan(0);
		expect(await strings.count()).toBeGreaterThan(0);
	});

	test('should show line numbers matching line count', async ({ page }) => {
		const editor = await createEditorHelper(page);

		const renderedLineCount = await editor.lines.count();
		const lineNumbers = editor.container.locator('.custom-editor__line-number');
		const numberCount = await lineNumbers.count();

		expect(numberCount).toBe(renderedLineCount);
	});

	test('should highlight active line', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Active line should be visible
		await expect(editor.activeLine).toBeVisible();

		// Move down and verify active line changes
		const initialIndex = await editor.getActiveLineIndex();

		await editor.press('ArrowDown');
		await page.waitForTimeout(50);

		const newIndex = await editor.getActiveLineIndex();
		expect(newIndex).toBe(initialIndex + 1);
	});

	test('should handle Tab key for indentation', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start of a line
		await editor.press('Control+Home');
		await editor.press('Home');

		const before = await editor.getLineText(0);

		// Press Tab
		await editor.press('Tab');

		const after = await editor.getLineText(0);

		// Should have added indentation (spaces or tab)
		expect(after.length).toBeGreaterThan(before.length);
	});

	test('editor should be scrollable with many lines', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Get scroll position before
		const scrollBefore = await editor.content.evaluate((el) => el.scrollTop);

		// Press Page Down multiple times
		await editor.press('PageDown');
		await editor.press('PageDown');

		const scrollAfter = await editor.content.evaluate((el) => el.scrollTop);

		// Scroll position should have changed
		expect(scrollAfter).toBeGreaterThan(scrollBefore);
	});
});
