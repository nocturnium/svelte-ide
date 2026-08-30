import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { EditorHelper } from './utils/editor-helpers';

/**
 * Track H Phase 2: the "Extract to function" action on /demo/cognitive-load
 * actually applies a behavior-preserving extraction (or refuses with a reason).
 *
 * SEEDING. These tests used to fill a `#visitor-code` textarea bound to the same
 * `content` as the editor. That textarea was deliberately removed — the page now
 * argues that "the page that argues for building an editor from scratch should
 * not ask you to type into the browser's default one" — and the spec was never
 * updated, so both tests had been failing on a missing selector rather than on
 * anything the feature was doing.
 *
 * Typing the fixture in is not a substitute: `autoCloseBrackets` defaults on, so
 * every `{` and `(` inserts its partner and the seeded source is not the source
 * written here. Select-all followed by a clipboard paste inserts verbatim, goes
 * through the editor's own paste handler, and matches the pattern already used by
 * editor-selection.spec.ts and editor-undo-redo.spec.ts.
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

async function seed(page: Page, context: BrowserContext, source: string): Promise<EditorHelper> {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/demo/cognitive-load');
	await page.waitForLoadState('networkidle');

	const editor = new EditorHelper(page, page.locator('.editor-container'));
	await expect(editor.content).toBeVisible();

	await page.evaluate((text) => navigator.clipboard.writeText(text), source);
	await editor.focus();
	await editor.selectAll();
	await editor.paste();

	// Wait for the replacement to land rather than for a fixed delay: the first
	// line is the fixture's own signature, which the demo sample never contains.
	const firstLine = source.split('\n')[0];
	await expect(
		page.locator('.editor-container .custom-editor__line-content').first()
	).toContainText(firstLine);
	return editor;
}

const extractButton = (page: Page) => page.getByRole('button', { name: /extract to function/i });

test.describe('extract function (Track H ph2)', () => {
	test('extracts the selected block into a new function; one undo restores it', async ({
		page,
		context
	}) => {
		const editor = await seed(page, context, EXTRACTABLE);

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

	test('surfaces a refusal reason for a block that escapes via return', async ({
		page,
		context
	}) => {
		const editor = await seed(page, context, ESCAPING);

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
