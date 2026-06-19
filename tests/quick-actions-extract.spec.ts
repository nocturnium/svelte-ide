import { test, expect, type Page } from '@playwright/test';

/**
 * Track H Phase 3: the editor-intelligence "Quick Actions" tab tells the truth.
 * Three advertised actions now perform real, single-undo edits through
 * CustomEditor — Extract to variable, Extract to function, and Organize imports —
 * while the actions that cannot be done safely in a self-contained demo (Rename,
 * Fix all) refuse with a specific reason instead of faking an "Executed" toast.
 */

async function openQuickActionsTab(page: Page): Promise<void> {
	await page.goto('/demo/editor-intelligence');
	await page.waitForLoadState('networkidle');
	await page.locator('#tab-quickactions').click();
	await expect(page.locator('.qa-editor-wrap .custom-editor__content')).toBeVisible();
	await expect(page.locator('.qa-editor-wrap')).toContainText('renderInvoice');
}

async function qaContent(page: Page): Promise<string> {
	return (await page.locator('.qa-editor-wrap .custom-editor__line-content').allInnerTexts()).join(
		'\n'
	);
}

async function pressN(page: Page, key: string, n: number): Promise<void> {
	for (let i = 0; i < n; i++) await page.keyboard.press(key);
}

async function focusEditorTop(page: Page): Promise<void> {
	await page.locator('.qa-editor-wrap .custom-editor__content').click();
	await page.keyboard.press('Control+Home');
}

async function openMenu(page: Page): Promise<void> {
	await page.locator('.qa-menu-layer .lightbulb').click();
	await expect(page.locator('.actions-menu')).toBeVisible();
}

async function clickAction(page: Page, name: string): Promise<void> {
	await page.locator('.actions-menu .action-item', { hasText: name }).click();
	await page.waitForTimeout(200);
}

// The three const lines sit at document rows 5–7 (after the three imports + blank).
async function selectConstBlock(page: Page, lines: number): Promise<void> {
	await focusEditorTop(page);
	await pressN(page, 'ArrowDown', 5);
	await page.keyboard.press('Home');
	for (let i = 0; i < lines - 1; i++) await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+End');
}

// Select exactly `subtotal * order.taxRate` on row 6. Anchored from END and
// counted backward over the known expression length — immune to smart-Home and
// tab-column quirks that a forward count from Home would hit.
const TAX_EXPR = 'subtotal * order.taxRate';
async function selectTaxExpression(page: Page): Promise<void> {
	await focusEditorTop(page);
	await pressN(page, 'ArrowDown', 6);
	await page.keyboard.press('End');
	await page.keyboard.press('ArrowLeft'); // move before the trailing ';'
	await pressN(page, 'Shift+ArrowLeft', TAX_EXPR.length);
}

test.describe('Quick Actions — wired actions run for real (Track H ph3)', () => {
	test('Extract to function performs a real extraction', async ({ page }) => {
		await openQuickActionsTab(page);
		await selectConstBlock(page, 3);
		await openMenu(page);

		await clickAction(page, 'Extract to function');

		const after = await qaContent(page);
		expect(after).toContain('function extracted(');
		expect(after).toContain('= extracted(order)');
		await expect(page.locator('.action-toast--ok')).toBeVisible();
	});

	test('Extract to variable performs a real extraction', async ({ page }) => {
		await openQuickActionsTab(page);
		await selectTaxExpression(page);
		await openMenu(page);

		await clickAction(page, 'Extract to variable');

		const after = await qaContent(page);
		expect(after).toContain('const extracted = subtotal * order.taxRate;');
		expect(after).toContain('const tax = extracted;');
		await expect(page.locator('.action-toast--ok')).toBeVisible();
	});

	test('Organize imports removes the duplicate import', async ({ page }) => {
		await openQuickActionsTab(page);

		expect((await qaContent(page)).match(/from '\.\/money'/g)?.length).toBe(2);

		await focusEditorTop(page);
		await openMenu(page);
		await clickAction(page, 'Organize imports');

		const after = await qaContent(page);
		expect(after.match(/from '\.\/money'/g)?.length).toBe(1);
		await expect(page.locator('.action-toast--ok')).toBeVisible();
	});

	test('an unwired action (Fix all) refuses honestly instead of faking execution', async ({
		page
	}) => {
		await openQuickActionsTab(page);
		const before = await qaContent(page);

		await focusEditorTop(page);
		await openMenu(page);
		await clickAction(page, 'Fix all');

		const toast = page.locator('.action-toast');
		await expect(toast).toBeVisible();
		await expect(toast).not.toHaveClass(/action-toast--ok/);
		await expect(toast).toContainText('nothing to fix');
		// The code is untouched — the duplicate import is still there.
		expect(await qaContent(page)).toBe(before);
	});
});
