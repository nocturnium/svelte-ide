import { test, expect, type Locator } from '@playwright/test';
import { createEditorHelper, waitForNetworkIdle } from './utils/editor-helpers';

async function collapseFoldAtRawLine(editorContainer: Locator, rawLine: number): Promise<void> {
	const line = editorContainer.locator(`.custom-editor__line[data-line-index="${rawLine}"]`);
	await expect(line).toBeVisible();
	await line.hover();

	const foldIndicator = line.locator('.custom-editor__fold-indicator');
	await expect(foldIndicator).toBeVisible();
	await foldIndicator.click();
	await expect(foldIndicator).toHaveClass(/custom-editor__fold-indicator--collapsed/);
}

test.describe('Editor folding cursor geometry', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/folding');
		await waitForNetworkIdle(page);
	});

	test('caret aligns with rendered text row below a collapsed fold', async ({ page }) => {
		const editor = await createEditorHelper(page);
		const targetRawLine = 16;

		await collapseFoldAtRawLine(editor.container, 3);

		const targetLine = editor.container.locator(
			`.custom-editor__line[data-line-index="${targetRawLine}"]`
		);
		await expect(targetLine).toBeVisible();
		await targetLine.locator('.custom-editor__line-content').click({ position: { x: 12, y: 8 } });
		await expect(targetLine).toHaveClass(/custom-editor__line--active/);

		const cursorBox = await editor.cursor.boundingBox();
		const targetBox = await targetLine.boundingBox();
		expect(cursorBox).toBeTruthy();
		expect(targetBox).toBeTruthy();

		expect(Math.abs(cursorBox!.y - targetBox!.y)).toBeLessThanOrEqual(3);
	});

	test('clicking a visible row below a collapsed fold selects the correct raw line', async ({
		page
	}) => {
		const editor = await createEditorHelper(page);
		const targetRawLine = 16;

		await collapseFoldAtRawLine(editor.container, 3);

		const targetLine = editor.container.locator(
			`.custom-editor__line[data-line-index="${targetRawLine}"]`
		);
		await expect(targetLine).toBeVisible();
		await targetLine.locator('.custom-editor__line-content').click({ position: { x: 12, y: 8 } });

		const activeLine = editor.container.locator('.custom-editor__line--active');
		await expect(activeLine).toHaveAttribute('data-line-index', String(targetRawLine));
	});
});
