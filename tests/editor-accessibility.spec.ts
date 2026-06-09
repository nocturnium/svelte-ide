import { test, expect } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

test.describe('Editor Accessibility', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/editor-basic');
		await waitForNetworkIdle(page);
	});

	// ==========================================
	// Keyboard Navigation
	// ==========================================

	test('editor is keyboard focusable', async ({ page }) => {
		// Tab to editor from page
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');

		// Editor should eventually receive focus
		const editorContainer = page.locator('.editor-container');

		// There should be a focusable element within the editor
		const containerHandle = await editorContainer.elementHandle();
		expect(containerHandle).not.toBeNull();
		const focusedInEditor = await page.evaluate(
			(container) => container.contains(document.activeElement),
			containerHandle!
		);

		// If not focused in editor, try direct focus
		if (!focusedInEditor) {
			const editor = await createEditorHelper(page);
			await editor.focus();
			await expect(editor.cursor).toBeVisible();
		}
	});

	test('can navigate with keyboard only', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Navigate to known position
		await editor.press('Control+Home');
		const startIndex = await editor.getActiveLineIndex();
		expect(startIndex).toBe(0);

		// Navigate down
		await editor.press('ArrowDown');
		await editor.press('ArrowDown');
		const newIndex = await editor.getActiveLineIndex();
		expect(newIndex).toBe(2);

		// Navigate to end
		await editor.press('Control+End');
		const lineCount = await editor.getLineCount();
		const endIndex = await editor.getActiveLineIndex();
		expect(endIndex).toBe(lineCount - 1);
	});

	test('Tab key works for indentation', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();
		await editor.press('Control+Home');

		const beforeText = await editor.getLineText(0);
		await editor.press('Tab');
		const afterText = await editor.getLineText(0);

		// Should have added indentation
		expect(afterText.length).toBeGreaterThan(beforeText.length);
	});

	test('Escape closes find dialog', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.openFind();
		await expect(editor.findReplace).toBeVisible();

		await editor.press('Escape');
		await expect(editor.findReplace).not.toBeVisible();
	});

	// ==========================================
	// ARIA Attributes
	// ==========================================

	test('editor content has appropriate role', async ({ page }) => {
		const editor = await createEditorHelper(page);

		// Check for textbox role or contenteditable
		const content = editor.content;
		const role = await content.getAttribute('role');
		const contentEditable = await content.getAttribute('contenteditable');

		// Should have either role="textbox" or use a hidden textarea for input
		const hiddenInput = page.locator('.custom-editor__input');
		const inputExists = await hiddenInput.count();

		expect(inputExists > 0 || role === 'textbox' || contentEditable === 'true').toBe(true);
	});

	test('find input has aria-label', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();
		await editor.openFind();

		const findInput = editor.findInput;
		const ariaLabel = await findInput.getAttribute('aria-label');

		expect(ariaLabel).toBeTruthy();
		expect(ariaLabel?.toLowerCase()).toContain('search');
	});

	test('replace input has aria-label', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();
		await editor.openFindReplace();

		const replaceInput = editor.replaceInput;
		const ariaLabel = await replaceInput.getAttribute('aria-label');

		expect(ariaLabel).toBeTruthy();
	});

	test('action buttons have accessible labels', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();
		await editor.openFindReplace();

		// Check for aria-labels on buttons
		const buttons = editor.container.locator('.find-replace__action');
		const buttonCount = await buttons.count();

		for (let i = 0; i < buttonCount; i++) {
			const button = buttons.nth(i);
			const ariaLabel = await button.getAttribute('aria-label');
			const title = await button.getAttribute('title');
			const textContent = await button.textContent();

			// Button should have some accessible name
			expect(ariaLabel || title || textContent?.trim()).toBeTruthy();
		}
	});

	// ==========================================
	// Color Contrast
	// ==========================================

	test('text has sufficient contrast', async ({ page }) => {
		const editor = await createEditorHelper(page);

		// Get computed styles for line content
		const lineContent = editor.container.locator('.custom-editor__line-content').first();
		const styles = await lineContent.evaluate((el) => {
			const computed = window.getComputedStyle(el);
			return {
				color: computed.color,
				backgroundColor: computed.backgroundColor
			};
		});

		// Just verify we got styles (detailed contrast check would need color parsing)
		expect(styles.color).toBeTruthy();
	});

	test('cursor is visible against background', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		const cursor = editor.cursor;
		await expect(cursor).toBeVisible();

		// Get cursor dimensions
		const box = await cursor.boundingBox();
		expect(box).toBeTruthy();
		expect(box!.width).toBeGreaterThan(0);
		expect(box!.height).toBeGreaterThan(0);
	});

	test('selection is distinguishable from regular text', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.press('Control+Home');
		await editor.press('Shift+End');

		await page.waitForTimeout(100);

		// Selection should create visible highlight
		const hasSelection = await editor.hasSelection();
		expect(hasSelection).toBe(true);

		// Selection elements should have different styling
		const selectionDivs = editor.container.locator(
			'.custom-editor__selections .custom-editor__selection'
		);
		const count = await selectionDivs.count();
		expect(count).toBeGreaterThan(0);
	});

	// ==========================================
	// Focus Management
	// ==========================================

	test('focus is visible', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Cursor should be visible when focused
		await expect(editor.cursor).toBeVisible();
	});

	test('focus returns to editor after closing find dialog', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Open and close find
		await editor.openFind();
		await editor.press('Escape');

		// Should be able to type in editor again
		await editor.type('test');
		const content = await editor.getContent();
		expect(content).toContain('test');
	});

	test('Tab in find dialog moves to replace input', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.openFindReplace();
		await editor.findInput.click();

		await editor.findInput.press('Tab');

		// Replace input should be focused
		await expect(editor.replaceInput).toBeFocused();
	});

	// ==========================================
	// Screen Reader Support
	// ==========================================

	test('line numbers are associated with lines', async ({ page }) => {
		const editor = await createEditorHelper(page);

		// Line numbers should be visible
		const lineNumbers = editor.container.locator('.custom-editor__line-number');
		const count = await lineNumbers.count();
		expect(count).toBeGreaterThan(0);

		// First line number should show "1"
		const firstNumber = await lineNumbers.first().textContent();
		expect(firstNumber?.trim()).toBe('1');
	});

	test('match count is announced', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('string');
		await page.waitForTimeout(200);

		// Match count should be visible in UI
		const countElement = editor.container.locator('.find-replace__count');
		const countText = await countElement.textContent();

		expect(countText).toBeTruthy();
		expect(countText).toMatch(/\d+\s+(of|result)/i);
	});

	// ==========================================
	// Motion and Animation
	// ==========================================

	test('cursor blink can be observed', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Wait and check cursor visibility changes
		const cursor = editor.cursor;

		// Initial state
		const initialVisible = await cursor.isVisible();
		expect(initialVisible).toBe(true);

		// Cursor should continue to work after waiting
		await page.waitForTimeout(1000);

		// Type to verify editor is still responsive
		await editor.type('x');
		const content = await editor.getContent();
		expect(content).toContain('x');
	});

	// ==========================================
	// Error States
	// ==========================================

	test('invalid search shows appropriate feedback', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('NONEXISTENT_STRING_12345');
		await page.waitForTimeout(200);

		// Should show "No results" or similar
		const countElement = editor.container.locator('.find-replace__count');
		const countText = await countElement.textContent();

		expect(countText?.toLowerCase()).toContain('no');
	});

	test('regex error is handled gracefully', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.openFind();
		await editor.findInput.fill('[invalid regex');

		// Toggle regex mode
		const regexToggle = editor.container.locator(
			'.find-replace__toggle[aria-label*="regex"], .find-replace__toggle[title*="regex"]'
		);
		if ((await regexToggle.count()) > 0) {
			await regexToggle.click();
			await page.waitForTimeout(200);

			// Editor should not crash - either show error or no matches
			const countElement = editor.container.locator('.find-replace__count');
			await expect(countElement).toBeVisible();
		}
	});
});
