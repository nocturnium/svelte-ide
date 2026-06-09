import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Editor test helper utilities
 */
export class EditorHelper {
	constructor(
		public page: Page,
		public container: Locator
	) {}

	/**
	 * Get the editor content area
	 */
	get content(): Locator {
		return this.container.locator('.custom-editor__content');
	}

	/**
	 * Get the cursor element
	 */
	get cursor(): Locator {
		return this.container.locator('.custom-editor__cursor');
	}

	/**
	 * Get all line elements
	 */
	get lines(): Locator {
		return this.container.locator('.custom-editor__line');
	}

	/**
	 * Get the active/current line
	 */
	get activeLine(): Locator {
		return this.container.locator('.custom-editor__line--active');
	}

	/**
	 * Get the gutter (line numbers) - first one
	 */
	get gutter(): Locator {
		return this.container.locator('.custom-editor__gutter').first();
	}

	/**
	 * Get all gutters
	 */
	get gutters(): Locator {
		return this.container.locator('.custom-editor__gutter');
	}

	/**
	 * Get the selection overlay container
	 */
	get selection(): Locator {
		return this.container.locator('.custom-editor__selections');
	}

	/**
	 * Get the find/replace bar
	 */
	get findReplace(): Locator {
		return this.container.locator('.find-replace');
	}

	/**
	 * Get the find input
	 */
	get findInput(): Locator {
		return this.container.locator('.find-replace__input').first();
	}

	/**
	 * Get the replace input
	 */
	get replaceInput(): Locator {
		return this.container.locator('.find-replace__input').nth(1);
	}

	/**
	 * Get highlighted matches
	 */
	get matches(): Locator {
		return this.container.locator('.custom-editor__match');
	}

	/**
	 * Get current match (highlighted differently)
	 */
	get currentMatch(): Locator {
		return this.container.locator('.custom-editor__match--current');
	}

	/**
	 * Focus the editor by clicking on it
	 */
	async focus(): Promise<void> {
		await this.content.click();
		await expect(this.cursor).toBeVisible();
	}

	/**
	 * Type text into the editor
	 */
	async type(text: string): Promise<void> {
		await this.page.keyboard.type(text);
	}

	/**
	 * Press a key or key combination
	 */
	async press(key: string): Promise<void> {
		await this.page.keyboard.press(key);
	}

	/**
	 * Get the current content as text (excluding line numbers)
	 */
	async getContent(): Promise<string> {
		const lineContents = this.container.locator('.custom-editor__line-content');
		const lines = await lineContents.all();
		const texts: string[] = [];
		for (const line of lines) {
			const text = await line.innerText();
			texts.push(text);
		}
		return texts.join('\n');
	}

	/**
	 * Get line count
	 */
	async getLineCount(): Promise<number> {
		return await this.container.locator('.custom-editor__lines').evaluate((el) => {
			const line = el.querySelector('.custom-editor__line');
			const lineHeight = line ? line.getBoundingClientRect().height : 0;
			const totalHeight = parseFloat((el as HTMLElement).style.height);

			if (lineHeight > 0 && Number.isFinite(totalHeight)) {
				return Math.round(totalHeight / lineHeight);
			}

			return el.querySelectorAll('.custom-editor__line').length;
		});
	}

	/**
	 * Get the text of a specific line (0-indexed, excluding line numbers)
	 */
	async getLineText(index: number): Promise<string> {
		const lineContent = this.container.locator('.custom-editor__line-content').nth(index);
		return await lineContent.innerText();
	}

	/**
	 * Get cursor position info
	 */
	async getCursorPosition(): Promise<{ x: number; y: number; height: number }> {
		const box = await this.cursor.boundingBox();
		if (!box) throw new Error('Cursor not visible');
		return { x: box.x, y: box.y, height: box.height };
	}

	/**
	 * Get active line index (0-indexed)
	 */
	async getActiveLineIndex(): Promise<number> {
		const allLines = await this.lines.all();
		for (const line of allLines) {
			const activeLineIndex = await line.evaluate((el) => {
				if (!el.classList.contains('custom-editor__line--active')) return null;
				const rawIndex = el.getAttribute('data-line-index');
				return rawIndex === null ? null : Number(rawIndex);
			});
			if (activeLineIndex !== null) return activeLineIndex;
		}
		return -1;
	}

	/**
	 * Get the logical cursor position announced to assistive technology.
	 */
	async getAnnouncedCursorPosition(): Promise<{ line: number; column: number }> {
		const status = await this.container.locator('.custom-editor__sr-status').first().textContent();
		const match = status?.match(/Line\s+(\d+),\s+Column\s+(\d+)/);
		if (!match) throw new Error(`Unexpected cursor status: ${status}`);
		return { line: Number(match[1]), column: Number(match[2]) };
	}

	/**
	 * Open find dialog
	 */
	async openFind(): Promise<void> {
		await this.page.keyboard.press('Control+f');
		await expect(this.findReplace).toBeVisible();
	}

	/**
	 * Open find and replace dialog
	 */
	async openFindReplace(): Promise<void> {
		await this.page.keyboard.press('Control+h');
		await expect(this.findReplace).toBeVisible();
		// Ctrl+H may or may not auto-expand replace. Click toggle to ensure it's visible
		const replaceVisible = await this.replaceInput.isVisible().catch(() => false);
		if (!replaceVisible) {
			const toggleBtn = this.container.locator('.find-replace__toggle');
			await toggleBtn.click();
		}
		await expect(this.replaceInput).toBeVisible();
	}

	/**
	 * Close find dialog
	 */
	async closeFind(): Promise<void> {
		await this.page.keyboard.press('Escape');
		await expect(this.findReplace).not.toBeVisible();
	}

	/**
	 * Search for text
	 */
	async search(query: string): Promise<void> {
		await this.openFind();
		await this.findInput.fill(query);
	}

	/**
	 * Get match count from UI
	 */
	async getMatchCount(): Promise<{ current: number; total: number }> {
		const countText = await this.container.locator('.find-replace__count').innerText();
		const match = countText.match(/(\d+)\s+of\s+(\d+)/);
		if (match) {
			return { current: parseInt(match[1]), total: parseInt(match[2]) };
		}
		if (countText.includes('No results')) {
			return { current: 0, total: 0 };
		}
		throw new Error(`Unexpected count text: ${countText}`);
	}

	/**
	 * Select all text
	 */
	async selectAll(): Promise<void> {
		await this.page.keyboard.press('Control+a');
	}

	/**
	 * Copy selection to clipboard
	 */
	async copy(): Promise<void> {
		await this.page.keyboard.press('Control+c');
	}

	/**
	 * Cut selection to clipboard
	 */
	async cut(): Promise<void> {
		await this.page.keyboard.press('Control+x');
	}

	/**
	 * Paste from clipboard
	 */
	async paste(): Promise<void> {
		await this.page.keyboard.press('Control+v');
	}

	/**
	 * Undo last action
	 */
	async undo(): Promise<void> {
		await this.page.keyboard.press('Control+z');
	}

	/**
	 * Redo last undone action
	 */
	async redo(): Promise<void> {
		await this.page.keyboard.press('Control+Shift+z');
	}

	/**
	 * Wait for editor to be ready
	 */
	async waitForReady(): Promise<void> {
		await expect(this.content).toBeVisible();
		// Wait for at least one line to be rendered (with longer timeout for initial load)
		await expect(this.lines.first()).toBeVisible({ timeout: 10000 });
	}

	/**
	 * Check if editor has visible selection
	 */
	async hasSelection(): Promise<boolean> {
		// Selection divs are .custom-editor__selection inside .custom-editor__selections container
		const selectionDivs = this.container.locator(
			'.custom-editor__selections .custom-editor__selection'
		);
		const count = await selectionDivs.count();
		if (count === 0) return false;

		// Check if at least one selection element has visible dimensions
		for (let i = 0; i < count; i++) {
			const box = await selectionDivs.nth(i).boundingBox();
			if (box && box.width > 0 && box.height > 0) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Double click on a word to select it
	 */
	async doubleClickLine(lineIndex: number): Promise<void> {
		// Click on line content, not the gutter
		const lineContent = this.container.locator('.custom-editor__line-content').nth(lineIndex);
		// Use click with clickCount: 2 to ensure event.detail === 2
		await lineContent.click({ clickCount: 2 });
	}

	/**
	 * Triple click to select entire line
	 */
	async tripleClickLine(lineIndex: number): Promise<void> {
		// Click on line content, not the gutter
		const lineContent = this.container.locator('.custom-editor__line-content').nth(lineIndex);
		await lineContent.click({ clickCount: 3 });
	}
}

/**
 * Create an editor helper for a page
 */
export async function createEditorHelper(
	page: Page,
	containerSelector = '.editor-container'
): Promise<EditorHelper> {
	if (!page.url().includes('/demo/editor-basic')) {
		await page.goto('/demo/editor-basic');
		await waitForNetworkIdle(page);
	}

	// Wait a moment for Svelte to hydrate
	await page.waitForTimeout(200);

	const container = page.locator(containerSelector);
	await expect(container).toBeVisible({ timeout: 10000 });

	const helper = new EditorHelper(page, container);
	await helper.waitForReady();
	return helper;
}

/**
 * Wait for page to be ready (load state, not network idle which can timeout with HMR)
 */
export async function waitForNetworkIdle(page: Page): Promise<void> {
	await page.waitForLoadState('domcontentloaded');
	// Give Svelte a moment to hydrate
	await page.waitForTimeout(300);
}
