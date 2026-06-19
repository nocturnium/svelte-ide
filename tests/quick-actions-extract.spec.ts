import { test, expect, type Page } from '@playwright/test';

/**
 * Track H Phase 3a: the editor-intelligence "Quick Actions" tab no longer lies.
 * Its menu advertises "Extract to function" — and now actually performs a real,
 * single-undo extraction through CustomEditor.extractFunction(), instead of
 * flashing a fake "Executed:" toast over a static code preview.
 */

async function openQuickActionsTab(page: Page): Promise<void> {
	await page.goto('/demo/editor-intelligence');
	await page.waitForLoadState('networkidle');
	await page.locator('#tab-quickactions').click();
	await expect(page.locator('.qa-editor-wrap .custom-editor__content')).toBeVisible();
	await expect(page.locator('.qa-editor-wrap .custom-editor__line-content').first()).toContainText(
		'renderInvoice'
	);
}

async function qaContent(page: Page): Promise<string> {
	return (await page.locator('.qa-editor-wrap .custom-editor__line-content').allInnerTexts()).join(
		'\n'
	);
}

async function selectConstBlock(page: Page, lines: number): Promise<void> {
	await page.locator('.qa-editor-wrap .custom-editor__content').click();
	await page.keyboard.press('Control+Home');
	await page.keyboard.press('ArrowDown'); // to line 1 (first const)
	await page.keyboard.press('Home');
	for (let i = 0; i < lines - 1; i++) await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+End');
}

async function openMenu(page: Page): Promise<void> {
	await page.locator('.qa-menu-layer .lightbulb').click();
	await expect(page.locator('.actions-menu')).toBeVisible();
}

test.describe('Quick Actions extract-function (Track H ph3a)', () => {
	test('the advertised "Extract to function" performs a real extraction', async ({ page }) => {
		await openQuickActionsTab(page);
		await selectConstBlock(page, 3); // the three const lines
		await openMenu(page);

		await page.locator('.actions-menu .action-item', { hasText: 'Extract to function' }).click();
		await page.waitForTimeout(200);

		const after = await qaContent(page);
		expect(after).toContain('function extracted(');
		expect(after).toContain('= extracted(order)');
		await expect(page.locator('.action-toast--ok')).toBeVisible();
	});

	test('other advertised actions are honestly labeled, not falsely executed', async ({ page }) => {
		await openQuickActionsTab(page);
		await selectConstBlock(page, 2);
		await openMenu(page);

		await page.locator('.actions-menu .action-item', { hasText: 'Extract to variable' }).click();

		const toast = page.locator('.action-toast');
		await expect(toast).toBeVisible();
		await expect(toast).toContainText('preview only');
		expect(await qaContent(page)).not.toContain('function extracted(');
	});
});
