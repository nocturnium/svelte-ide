import { test, expect } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

test.describe('Editor Keyboard Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/editor-basic');
		await waitForNetworkIdle(page);
	});

	test('ArrowLeft moves cursor left', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to a known position: start of document, then end of line 1
		await editor.press('Control+Home');
		await editor.press('End');
		const beforePos = await editor.getCursorPosition();

		await editor.press('ArrowLeft');
		const afterPos = await editor.getCursorPosition();

		// Cursor should have moved left (on same line)
		expect(afterPos.x).toBeLessThan(beforePos.x);
	});

	test('ArrowRight moves cursor right', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start of document
		await editor.press('Control+Home');
		const beforePos = await editor.getCursorPosition();

		await editor.press('ArrowRight');
		const afterPos = await editor.getCursorPosition();

		expect(afterPos.x).toBeGreaterThan(beforePos.x);
	});

	test('ArrowUp moves cursor up', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to second line
		await editor.press('ArrowDown');
		const beforePos = await editor.getCursorPosition();

		await editor.press('ArrowUp');
		const afterPos = await editor.getCursorPosition();

		expect(afterPos.y).toBeLessThan(beforePos.y);
	});

	test('ArrowDown moves cursor down', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		const beforePos = await editor.getCursorPosition();

		await editor.press('ArrowDown');
		const afterPos = await editor.getCursorPosition();

		expect(afterPos.y).toBeGreaterThan(beforePos.y);
	});

	test('Home moves cursor to beginning of line', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to middle of line
		await editor.press('End');
		await editor.press('ArrowLeft');
		await editor.press('ArrowLeft');

		const beforePos = await editor.getCursorPosition();

		await editor.press('Home');
		const afterPos = await editor.getCursorPosition();

		expect(afterPos.x).toBeLessThan(beforePos.x);
	});

	test('End moves cursor to end of line', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start of document first for deterministic position
		await editor.press('Control+Home');
		const beforePos = await editor.getCursorPosition();

		await editor.press('End');
		const afterPos = await editor.getCursorPosition();

		expect(afterPos.x).toBeGreaterThan(beforePos.x);
	});

	test('Ctrl+Home moves to document start', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go somewhere in the middle
		await editor.press('ArrowDown');
		await editor.press('ArrowDown');
		await editor.press('ArrowDown');
		await editor.press('End');

		await editor.press('Control+Home');

		const index = await editor.getActiveLineIndex();
		expect(index).toBe(0);

		const pos = await editor.getCursorPosition();
		// Should be at the leftmost position
		const lineBox = await editor.lines.first().boundingBox();
		expect(pos.x).toBeLessThanOrEqual(lineBox!.x + 50); // Allow some margin for gutter
	});

	test('Ctrl+End moves to document end', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.press('Control+End');

		const lineCount = await editor.getLineCount();
		const activeIndex = await editor.getActiveLineIndex();

		expect(activeIndex).toBe(lineCount - 1);
	});

	test('Ctrl+ArrowLeft moves to previous word boundary', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Type some words
		await editor.press('End');
		await editor.type(' hello world');

		const beforePos = await editor.getCursorPosition();

		// Move back one word
		await editor.press('Control+ArrowLeft');
		const afterPos = await editor.getCursorPosition();

		expect(afterPos.x).toBeLessThan(beforePos.x);

		// Move back another word
		await editor.press('Control+ArrowLeft');
		const afterPos2 = await editor.getCursorPosition();

		expect(afterPos2.x).toBeLessThan(afterPos.x);
	});

	test('Ctrl+ArrowRight moves to next word boundary', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start of document for deterministic position
		await editor.press('Control+Home');
		const beforePos = await editor.getCursorPosition();

		await editor.press('Control+ArrowRight');
		const afterPos = await editor.getCursorPosition();

		expect(afterPos.x).toBeGreaterThan(beforePos.x);
	});

	test('PageDown scrolls down', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		const beforeIndex = await editor.getActiveLineIndex();

		await editor.press('PageDown');
		await page.waitForTimeout(50);

		const afterIndex = await editor.getActiveLineIndex();
		expect(afterIndex).toBeGreaterThan(beforeIndex);
	});

	test('PageUp scrolls up', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// First go down
		await editor.press('PageDown');
		await editor.press('PageDown');
		const beforeIndex = await editor.getActiveLineIndex();

		await editor.press('PageUp');
		await page.waitForTimeout(50);

		const afterIndex = await editor.getActiveLineIndex();
		expect(afterIndex).toBeLessThan(beforeIndex);
	});

	test('Shift+ArrowRight creates selection', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start of document for deterministic position
		await editor.press('Control+Home');

		// Shift+Arrow to select
		await editor.press('Shift+ArrowRight');
		await editor.press('Shift+ArrowRight');
		await editor.press('Shift+ArrowRight');

		const afterHasSelection = await editor.hasSelection();
		expect(afterHasSelection).toBe(true);
	});

	test('Shift+ArrowLeft expands selection left', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to end of first line for deterministic position
		await editor.press('Control+Home');
		await editor.press('End');

		await editor.press('Shift+ArrowLeft');
		await editor.press('Shift+ArrowLeft');

		const hasSelection = await editor.hasSelection();
		expect(hasSelection).toBe(true);
	});

	test('Shift+Home selects to line start', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to end of first line for deterministic position
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Shift+Home');

		const hasSelection = await editor.hasSelection();
		expect(hasSelection).toBe(true);
	});

	test('Shift+End selects to line end', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start of document for deterministic position
		await editor.press('Control+Home');
		await editor.press('Shift+End');

		const hasSelection = await editor.hasSelection();
		expect(hasSelection).toBe(true);
	});

	test('Ctrl+Shift+ArrowRight selects word', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Go to start of document for deterministic position
		await editor.press('Control+Home');
		await editor.press('Control+Shift+ArrowRight');

		const hasSelection = await editor.hasSelection();
		expect(hasSelection).toBe(true);
	});

	test('Arrow key cancels selection and moves cursor', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Create selection on first line
		await editor.press('Control+Home');
		await editor.press('Shift+End');

		expect(await editor.hasSelection()).toBe(true);

		// Press arrow without shift
		await editor.press('ArrowRight');
		await page.waitForTimeout(50);

		// Selection should be cleared
		expect(await editor.hasSelection()).toBe(false);
	});
});
