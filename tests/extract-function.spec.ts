import { test, expect, type Page } from '@playwright/test';
import { EditorHelper } from './utils/editor-helpers';

/**
 * Track H Phase 2: the "Extract to function" action on /demo/cognitive-load
 * actually applies a behavior-preserving extraction (or refuses with a reason).
 * The editor content is seeded deterministically through the page's "paste your
 * code" textarea, which is bound to the same `content` as the editor.
 */

const EXTRACTABLE = [
	'function demo(a, b) {',
	'\tconst sum = a + b;',
	'\tconst product = a * b;',
	'\tuse(sum, product);',
	'}'
].join('\n');

const ESCAPING = ['function g(x) {', '\tif (x) {', '\t\treturn 1;', '\t}', '\tdone();', '}'].join(
	'\n'
);

async function seed(page: Page, source: string): Promise<EditorHelper> {
	await page.goto('/demo/cognitive-load');
	await page.waitForLoadState('networkidle');
	await page.locator('#visitor-code').fill(source);
	const editor = new EditorHelper(page, page.locator('.editor-container'));
	await expect(editor.content).toBeVisible();
	await expect(
		page.locator('.editor-container .custom-editor__line-content').first()
	).toContainText(source.slice(0, 12).split('\n')[0]);
	await page.waitForTimeout(150);
	return editor;
}

const extractButton = (page: Page) =>
	page.getByRole('button', { name: /extract to function/i });

test.describe('extract function (Track H ph2)', () => {
	test('extracts the selected block into a new function; one undo restores it', async ({
		page
	}) => {
		const editor = await seed(page, EXTRACTABLE);

		// Select the two `const` lines (lines 1-2).
		await editor.focus();
		await editor.press('Control+Home');
		await editor.press('ArrowDown');
		await editor.press('Home');
		await editor.press('Shift+ArrowDown');
		await editor.press('Shift+End');

		await extractButton(page).click();
		await page.waitForTimeout(200);

		const after = await editor.getContent();
		expect(after).toContain('function extracted(');
		expect(after).toContain('= extracted(a, b)');

		// A single undo restores the original program.
		await editor.focus();
		await editor.press('Control+z');
		await page.waitForTimeout(150);
		const restored = await editor.getContent();
		expect(restored).toContain('const sum = a + b;');
		expect(restored).not.toContain('function extracted(');
	});

	test('surfaces a refusal reason for a block that escapes via return', async ({ page }) => {
		const editor = await seed(page, ESCAPING);

		// Select the `if (x) { return 1; }` block (lines 1-3).
		await editor.focus();
		await editor.press('Control+Home');
		await editor.press('ArrowDown');
		await editor.press('Home');
		await editor.press('Shift+ArrowDown');
		await editor.press('Shift+ArrowDown');
		await editor.press('Shift+End');

		await extractButton(page).click();

		await expect(page.locator('.extract-toast')).toBeVisible();
		const content = await editor.getContent();
		expect(content).not.toContain('function extracted(');
	});
});
