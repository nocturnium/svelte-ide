import { test, expect } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

test.describe('Editor Find and Replace', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/editor');
		await waitForNetworkIdle(page);
	});

	test('Ctrl+F opens find dialog', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.openFind();

		await expect(editor.findReplace).toBeVisible();
		await expect(editor.findInput).toBeVisible();
		await expect(editor.findInput).toBeFocused();
	});

	test('Ctrl+H opens find and replace dialog', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.openFindReplace();

		await expect(editor.findReplace).toBeVisible();
		await expect(editor.findInput).toBeVisible();
		await expect(editor.replaceInput).toBeVisible();
	});

	test('Escape closes find dialog', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.openFind();
		await expect(editor.findReplace).toBeVisible();

		await editor.closeFind();
		await expect(editor.findReplace).not.toBeVisible();
	});

	test('searching for text shows match count', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Search for a common word in TypeScript code
		await editor.search('User');

		await page.waitForTimeout(200);

		const countElement = editor.container.locator('.find-replace__count');
		await expect(countElement).toBeVisible();

		const countText = await countElement.innerText();
		expect(countText).toMatch(/\d+\s+of\s+\d+|No results/);
	});

	test('search highlights matching text', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('User');
		await page.waitForTimeout(200);

		// Should have visible match highlights
		const matchCount = await editor.matches.count();
		expect(matchCount).toBeGreaterThan(0);
	});

	test('F3 navigates to next match', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('User');
		await page.waitForTimeout(200);

		const { current: initial } = await editor.getMatchCount();

		// Click on editor content to focus it, then press F3
		await editor.content.click();
		await page.keyboard.press('F3');
		await page.waitForTimeout(100);

		const { current: after } = await editor.getMatchCount();

		// Should have moved to next match (or wrapped around)
		expect(after).not.toBe(initial);
	});

	test('Shift+F3 navigates to previous match', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('User');
		await page.waitForTimeout(200);

		// Click on editor content to focus it, then navigate
		await editor.content.click();
		await page.keyboard.press('F3');
		await page.keyboard.press('F3');
		await page.waitForTimeout(100);

		const { current: before } = await editor.getMatchCount();

		// Press Shift+F3 to go to previous
		await page.keyboard.press('Shift+F3');
		await page.waitForTimeout(100);

		const { current: after } = await editor.getMatchCount();

		expect(after).toBeLessThan(before);
	});

	test('Enter in find input navigates to next match', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('User');
		await page.waitForTimeout(200);

		const { current: initial } = await editor.getMatchCount();

		await editor.findInput.press('Enter');
		await page.waitForTimeout(100);

		const { current: after } = await editor.getMatchCount();
		expect(after).not.toBe(initial);
	});

	test('Shift+Enter in find input navigates to previous match', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('User');
		await page.waitForTimeout(200);

		// Go forward first
		await editor.findInput.press('Enter');
		await editor.findInput.press('Enter');
		await page.waitForTimeout(100);

		const { current: before } = await editor.getMatchCount();

		await editor.findInput.press('Shift+Enter');
		await page.waitForTimeout(100);

		const { current: after } = await editor.getMatchCount();
		expect(after).toBeLessThanOrEqual(before);
	});

	test('case sensitivity toggle works', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Search for lowercase "user" (should match "User" in case-insensitive mode)
		await editor.search('user');
		await page.waitForTimeout(200);

		const { total: insensitiveCount } = await editor.getMatchCount();

		// Toggle case sensitivity
		const caseSensitiveBtn = editor.container.locator('.find-replace__option:has-text("Aa")');
		await caseSensitiveBtn.click();
		await page.waitForTimeout(200);

		const { total: sensitiveCount } = await editor.getMatchCount();

		// Case-sensitive search should find fewer or equal matches
		expect(sensitiveCount).toBeLessThanOrEqual(insensitiveCount);
	});

	test('regex toggle allows regex search', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Enable regex mode
		await editor.openFind();
		const regexBtn = editor.container.locator('.find-replace__option:has-text(".*")');
		await regexBtn.click();

		// Search with regex pattern
		await editor.findInput.fill('User|user');
		await page.waitForTimeout(200);

		const { total: matchCount } = await editor.getMatchCount();
		expect(matchCount).toBeGreaterThan(0);
	});

	test('replace single replaces current match', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add some content we can replace
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('REPLACE_ME_TEST');
		await page.waitForTimeout(100);

		// Open find/replace
		await editor.openFindReplace();
		await editor.findInput.fill('REPLACE_ME_TEST');
		await page.waitForTimeout(200);

		await editor.replaceInput.fill('REPLACED');

		// Click replace button
		const replaceBtn = editor.container.locator('.find-replace__action[aria-label="Replace"]');
		await replaceBtn.click();
		await page.waitForTimeout(100);

		// Verify replacement
		const content = await editor.getContent();
		expect(content).toContain('REPLACED');
		expect(content).not.toContain('REPLACE_ME_TEST');
	});

	test('replace all replaces all matches', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		// Add multiple occurrences
		await editor.press('Control+Home');
		await editor.press('End');
		await editor.press('Enter');
		await editor.type('AAA BBB AAA');
		await page.waitForTimeout(100);

		// Open find/replace
		await editor.openFindReplace();
		await editor.findInput.fill('AAA');
		await page.waitForTimeout(200);

		const { total: beforeCount } = await editor.getMatchCount();
		expect(beforeCount).toBe(2);

		await editor.replaceInput.fill('XXX');

		// Click replace all button
		const replaceAllBtn = editor.container.locator('.find-replace__action[aria-label="Replace all"]');
		await replaceAllBtn.click();
		await page.waitForTimeout(200);

		// Verify all replaced - match count should be 0
		const { total: afterCount } = await editor.getMatchCount();
		expect(afterCount).toBe(0);
	});

	test('Tab switches focus between find and replace inputs', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.openFindReplace();

		// Click and focus find input explicitly
		await editor.findInput.click();
		await expect(editor.findInput).toBeFocused();

		await editor.findInput.press('Tab');
		await expect(editor.replaceInput).toBeFocused();

		await editor.replaceInput.press('Shift+Tab');
		await expect(editor.findInput).toBeFocused();
	});

	test('search with no results shows "No results"', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('XYZNONEXISTENT123');
		await page.waitForTimeout(200);

		const countElement = editor.container.locator('.find-replace__count');
		const countText = await countElement.innerText();
		expect(countText).toContain('No results');
	});

	test('next/prev buttons are disabled when no matches', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.search('XYZNONEXISTENT123');
		await page.waitForTimeout(200);

		const prevBtn = editor.container.locator('.find-replace__action[aria-label="Previous match"]');
		const nextBtn = editor.container.locator('.find-replace__action[aria-label="Next match"]');

		await expect(prevBtn).toBeDisabled();
		await expect(nextBtn).toBeDisabled();
	});

	test('toggle expand/collapse replace row', async ({ page }) => {
		const editor = await createEditorHelper(page);
		await editor.focus();

		await editor.openFind();

		// Replace should not be visible initially
		await expect(editor.replaceInput).not.toBeVisible();

		// Click toggle to show replace
		const toggleBtn = editor.container.locator('.find-replace__toggle');
		await toggleBtn.click();

		await expect(editor.replaceInput).toBeVisible();

		// Click again to hide
		await toggleBtn.click();
		await expect(editor.replaceInput).not.toBeVisible();
	});
});
