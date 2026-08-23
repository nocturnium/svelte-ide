import { test, expect } from '@playwright/test';
import { waitForNetworkIdle } from './utils/editor-helpers';

/**
 * Regression coverage for /demo/playground.
 *
 * This route had no e2e coverage, which is how an uncaught defect that left the
 * whole page inert survived svelte-check, eslint, vitest and prettier: the page
 * still server-renders and looks correct in a screenshot, so only an
 * interaction proves it is alive. Every test here asserts *behaviour after a
 * click or keypress*, never just that markup exists.
 */
test.describe('Demo playground', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/demo/playground');
		await waitForNetworkIdle(page);
	});

	test('hydrates: the full-page toggle actually responds to a click', async ({ page }) => {
		const toggle = page.locator('.status-fullscreen-btn');
		await expect(toggle).toBeVisible();

		// Opens full page, so the control starts pressed.
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	});

	test('logs no console errors on load (an effect loop would surface here)', async ({ page }) => {
		const errors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(msg.text());
		});
		page.on('pageerror', (err) => errors.push(String(err)));

		await page.reload();
		await waitForNetworkIdle(page);
		await page.locator('.status-fullscreen-btn').click();

		// Vite's dev-time HMR websocket noise is not a page defect.
		const real = errors.filter((e) => !/WebSocket|net::ERR_/i.test(e));
		expect(real).toEqual([]);
	});

	test('Esc leaves full page, and is a no-op once already exited', async ({ page }) => {
		const toggle = page.locator('.status-fullscreen-btn');
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');

		await page.keyboard.press('Escape');
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');

		// Esc does not toggle back on — it is an escape hatch, not a switch.
		await page.keyboard.press('Escape');
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	});

	test('advertises the Esc shortcut only in the state where it works', async ({ page }) => {
		const toggle = page.locator('.status-fullscreen-btn');

		await expect(toggle).toHaveAttribute('aria-keyshortcuts', 'Escape');
		await expect(toggle).toHaveAttribute('title', /Esc/);

		await toggle.click();
		await expect(toggle).not.toHaveAttribute('aria-keyshortcuts', 'Escape');
		await expect(toggle).not.toHaveAttribute('title', /Esc/);
	});

	test('the toggle keeps a stable accessible name across states (WCAG 2.5.3)', async ({ page }) => {
		const toggle = page.locator('.status-fullscreen-btn');
		const railToggle = page.locator('.activity-btn[aria-label="Toggle Full Page"]');

		const before = (await toggle.textContent())?.trim();
		await toggle.click();
		const after = (await toggle.textContent())?.trim();

		expect(before).toBe(after);
		await expect(railToggle).toHaveAttribute('aria-label', 'Toggle Full Page');
	});

	test('full page actually covers the viewport on a phone-sized screen', async ({ page }) => {
		// `.playground.is-narrow` used to out-specify the full-page rule and reset
		// `position` to relative, silently disabling full page under 1040px.
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/demo/playground');
		await waitForNetworkIdle(page);

		const shell = page.locator('.playground');
		await expect(shell).toHaveClass(/playground--full-page/);
		await expect(shell).toHaveCSS('position', 'fixed');

		const box = await shell.boundingBox();
		expect(box?.width).toBe(390);
		expect(box?.height).toBe(844);

		// The demo chrome is *covered* while full page is on. `toBeInViewport` only
		// measures geometry, so it cannot see occlusion — a trial click does, via
		// Playwright's hit-target check.
		const mobileToggle = page.locator('.mobile-toggle');
		await expect(mobileToggle.click({ trial: true, timeout: 2000 })).rejects.toThrow();

		// Exiting hands the navigation back, and now the toggle is really reachable.
		await page.locator('.status-fullscreen-btn').click();
		await expect(shell).not.toHaveClass(/playground--full-page/);
		await mobileToggle.click({ trial: true });
	});

	test('the AI panel streams a mocked reply instead of erroring on /api/chat', async ({ page }) => {
		const input = page.locator('.ai-panel__textarea');
		await expect(input).toBeVisible();

		await input.fill('Explain this code');
		await page.locator('.ai-panel button[aria-label="Send message"]').click();

		// Assert against the ASSISTANT bubble only, on text that appears nowhere in
		// the prompt. Matching the whole message list for /explain/ would match the
		// echo of what we just typed, so the assertion would pass with the mock
		// removed entirely and the panel showing "API error: 404".
		const reply = page.locator('.ai-message--assistant').last();
		await expect(reply).toContainText('binary search algorithm', { timeout: 15000 });
		await expect(reply).toContainText('O(log n)');

		// Only meaningful once the reply above has actually arrived — checked first,
		// an error band simply has not had time to render yet.
		await expect(page.locator('.ai-panel__error, .ai-message__error')).toHaveCount(0);
	});
});
