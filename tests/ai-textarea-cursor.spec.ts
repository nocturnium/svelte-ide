import { test, expect } from '@playwright/test';

test.describe('AI Panel Textarea Cursor', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/ai');
		// Wait for page to fully load
		await page.waitForLoadState('networkidle');
	});

	test('cursor position should remain stable while typing', async ({ page }) => {
		// Find the AI panel textarea
		const textarea = page.locator('.ai-panel__textarea');
		await expect(textarea).toBeVisible();

		// Click to focus
		await textarea.click();

		// Type some text
		const testText = 'Hello, this is a test message';
		await textarea.fill(testText);

		// Get cursor position after typing
		const cursorPos = await textarea.evaluate((el: HTMLTextAreaElement) => ({
			selectionStart: el.selectionStart,
			selectionEnd: el.selectionEnd,
			value: el.value
		}));

		expect(cursorPos.selectionStart).toBe(testText.length);
		expect(cursorPos.selectionEnd).toBe(testText.length);
		expect(cursorPos.value).toBe(testText);
	});

	test('cursor should stay in position when typing in middle of text', async ({ page }) => {
		const textarea = page.locator('.ai-panel__textarea');
		await expect(textarea).toBeVisible();
		await textarea.click();

		// Type initial text
		await textarea.fill('Hello World');

		// Move cursor to middle (after "Hello ")
		await textarea.evaluate((el: HTMLTextAreaElement) => {
			el.setSelectionRange(6, 6);
		});

		// Type additional text at cursor position
		await textarea.press('a');
		await textarea.press('b');
		await textarea.press('c');

		// Check cursor position and text
		const result = await textarea.evaluate((el: HTMLTextAreaElement) => ({
			selectionStart: el.selectionStart,
			selectionEnd: el.selectionEnd,
			value: el.value
		}));

		// Cursor should be at position 9 (6 + 3 typed chars)
		expect(result.value).toBe('Hello abcWorld');
		expect(result.selectionStart).toBe(9);
	});

	test('textarea should auto-resize without cursor jump', async ({ page }) => {
		const textarea = page.locator('.ai-panel__textarea');
		await expect(textarea).toBeVisible();
		await textarea.click();

		// Get initial height
		const initialHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

		// Type multiple lines to trigger resize
		const multilineText = 'Line 1\nLine 2\nLine 3\nLine 4';
		await textarea.fill(multilineText);

		// Small delay to allow resize
		await page.waitForTimeout(100);

		// Get new height
		const newHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

		// Height should have increased
		expect(newHeight).toBeGreaterThan(initialHeight);

		// Cursor should be at the end
		const cursorPos = await textarea.evaluate((el: HTMLTextAreaElement) => ({
			selectionStart: el.selectionStart,
			selectionEnd: el.selectionEnd
		}));

		expect(cursorPos.selectionStart).toBe(multilineText.length);
	});

	test('visual cursor position matches logical cursor position', async ({ page }) => {
		const textarea = page.locator('.ai-panel__textarea');
		await expect(textarea).toBeVisible();
		await textarea.click();

		// Type text
		await textarea.fill('Test cursor position');

		// Move cursor to specific position
		await textarea.evaluate((el: HTMLTextAreaElement) => {
			el.setSelectionRange(5, 5);
			el.focus();
		});

		// Get the cursor position details
		const details = await textarea.evaluate((el: HTMLTextAreaElement) => {
			const style = window.getComputedStyle(el);
			return {
				selectionStart: el.selectionStart,
				selectionEnd: el.selectionEnd,
				value: el.value,
				scrollTop: el.scrollTop,
				scrollLeft: el.scrollLeft,
				height: el.offsetHeight,
				fontSize: style.fontSize,
				lineHeight: style.lineHeight
			};
		});
		expect(details.selectionStart).toBe(5);
	});

	test('interactive demo textarea works correctly', async ({ page }) => {
		// Test the demo-specific textarea
		const demoTextarea = page.locator('.demo-input textarea');
		await expect(demoTextarea).toBeVisible();
		await demoTextarea.click();

		await demoTextarea.fill('Testing the demo textarea');

		const result = await demoTextarea.evaluate((el: HTMLTextAreaElement) => ({
			selectionStart: el.selectionStart,
			value: el.value
		}));

		expect(result.value).toBe('Testing the demo textarea');
		expect(result.selectionStart).toBe(result.value.length);
	});
});
