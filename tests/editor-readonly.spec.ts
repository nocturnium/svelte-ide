import { test, expect } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

test.describe('Editor Syntax Highlighting', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/editor-basic');
		await waitForNetworkIdle(page);
	});

	test('TypeScript code has syntax tokens', async ({ page }) => {
		const editor = await createEditorHelper(page);

		// TypeScript should have various token types
		// Check for any token class (they all start with 'token-')
		const tokens = editor.container.locator('[class*="token-"]');
		const tokenCount = await tokens.count();
		expect(tokenCount).toBeGreaterThan(0);
	});

	test('code has keyword highlighting', async ({ page }) => {
		const editor = await createEditorHelper(page);

		// Look for keyword tokens (including variants)
		const keywords = editor.container.locator('[class*="token-keyword"]');
		const keywordCount = await keywords.count();
		expect(keywordCount).toBeGreaterThan(0);
	});

	test('code has string highlighting', async ({ page }) => {
		const editor = await createEditorHelper(page);

		const strings = editor.container.locator('[class*="token-string"]');
		const stringCount = await strings.count();
		expect(stringCount).toBeGreaterThan(0);
	});

	test('code has punctuation highlighting', async ({ page }) => {
		const editor = await createEditorHelper(page);

		const punctuation = editor.container.locator('[class*="token-punctuation"]');
		const punctCount = await punctuation.count();
		expect(punctCount).toBeGreaterThan(0);
	});

	test('different languages can be selected', async ({ page }) => {
		// All language buttons should be visible
		const languages = [
			'TypeScript',
			'JavaScript',
			'Python',
			'HTML',
			'CSS',
			'JSON',
			'Go',
			'Markdown'
		];

		for (const lang of languages) {
			const btn = page.locator(`.language-btn:has-text("${lang}")`);
			await expect(btn).toBeVisible();
		}
	});
});
