import { expect, test, type Locator } from '@playwright/test';
import { waitForNetworkIdle } from './utils/editor-helpers';

const MAX_RENDERED_LINES = 80;

async function renderedLineCount(editor: Locator): Promise<number> {
	return editor.locator('.custom-editor__line').count();
}

async function visibleLineSnapshot(editor: Locator): Promise<{ firstIndex: number; text: string }> {
	return editor
		.locator('.custom-editor__line')
		.first()
		.evaluate((line) => {
			const rawIndex = line.getAttribute('data-line-index');
			const text = line.querySelector('.custom-editor__line-content')?.textContent ?? '';
			return {
				firstIndex: rawIndex === null ? -1 : Number(rawIndex),
				text: text.trim()
			};
		});
}

test.describe('Editor virtualization stress proof', () => {
	test('keeps rendered line DOM bounded while scrolling a 50k-line document', async ({ page }) => {
		await page.goto('/demo/stress');
		await waitForNetworkIdle(page);

		const editor = page.locator('.editor-container');
		const scroller = editor.locator('.custom-editor__content');
		const lines = editor.locator('.custom-editor__line');

		await expect(page.getByTestId('stress-line-count')).toHaveText('50,000');
		await expect(scroller).toBeVisible();
		await expect(lines.first()).toBeVisible({ timeout: 15000 });

		await expect
			.poll(() => renderedLineCount(editor), {
				message: 'initial rendered .custom-editor__line count stays virtualized'
			})
			.toBeLessThan(MAX_RENDERED_LINES);

		const before = await visibleLineSnapshot(editor);

		await scroller.evaluate((element) => {
			element.scrollTop = 600_000;
			element.dispatchEvent(new Event('scroll', { bubbles: true }));
		});

		await expect
			.poll(async () => (await visibleLineSnapshot(editor)).firstIndex, {
				message: 'visible window changes after a large scroll'
			})
			.toBeGreaterThan(before.firstIndex + 1000);

		await expect
			.poll(() => renderedLineCount(editor), {
				message: 'rendered .custom-editor__line count remains bounded after scroll'
			})
			.toBeLessThan(MAX_RENDERED_LINES);

		const after = await visibleLineSnapshot(editor);
		expect(after.text).not.toBe(before.text);
		expect(after.firstIndex).toBeGreaterThan(before.firstIndex);
	});
});
