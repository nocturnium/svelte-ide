/**
 * Tests for editor-scroll.ts
 *
 * This module is DOM-dependent (reads from HTMLDivElement and calls
 * Svelte's tick()). We test:
 *   1. Factory shape — createEditorScroll returns the expected API.
 *   2. Behavior with a null editor element (early return, no crash).
 *   3. Scrolling logic with a mocked DOM element.
 */

import { describe, it, expect, vi } from 'vitest';
import { createEditorScroll, type ScrollConfig } from './editor-scroll';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock ScrollConfig. The getEditorContent callback returns
 * either null or a minimal mock HTMLDivElement.
 */
function makeConfig(overrides: Partial<ScrollConfig> = {}): ScrollConfig {
	return {
		getEditorContent: () => null,
		getSelection: () => ({
			anchor: { line: 0, column: 0 },
			head: { line: 5, column: 10 }
		}),
		getMeasurements: () => ({
			lineHeight: 20,
			charWidth: 8,
			gutterWidth: 50,
			contentPadding: 8
		}),
		...overrides
	};
}

/** Create a minimal mock of an HTMLDivElement with scroll/viewport properties */
function makeMockElement(props: {
	scrollTop?: number;
	scrollLeft?: number;
	clientHeight?: number;
	clientWidth?: number;
} = {}) {
	return {
		scrollTop: props.scrollTop ?? 0,
		scrollLeft: props.scrollLeft ?? 0,
		clientHeight: props.clientHeight ?? 500,
		clientWidth: props.clientWidth ?? 800
	} as unknown as HTMLDivElement;
}

// ============================================================
// Factory shape
// ============================================================

describe('createEditorScroll', () => {
	it('should return an object with scrollCursorIntoView method', () => {
		const scroll = createEditorScroll(makeConfig());
		expect(typeof scroll.scrollCursorIntoView).toBe('function');
	});
});

// ============================================================
// scrollCursorIntoView
// ============================================================

describe('scrollCursorIntoView', () => {
	it('should not throw when editorContent is null', async () => {
		const scroll = createEditorScroll(makeConfig({
			getEditorContent: () => null
		}));

		await expect(scroll.scrollCursorIntoView()).resolves.toBeUndefined();
	});

	it('should scroll down when cursor is below viewport', async () => {
		const el = makeMockElement({
			scrollTop: 0,
			clientHeight: 100,
			clientWidth: 800
		});

		const scroll = createEditorScroll(makeConfig({
			getEditorContent: () => el,
			getSelection: () => ({
				anchor: { line: 20, column: 0 },
				head: { line: 20, column: 0 }
			}),
			getMeasurements: () => ({
				lineHeight: 20,
				charWidth: 8,
				gutterWidth: 50,
				contentPadding: 8
			})
		}));

		await scroll.scrollCursorIntoView();

		// cursorTop = 20 * 20 = 400
		// cursorTop + lineHeight (420) > scrollTop + viewportHeight (100)
		// So scrollTop should be set to cursorTop + lineHeight - viewportHeight = 320
		expect(el.scrollTop).toBe(320);
	});

	it('should scroll up when cursor is above viewport', async () => {
		const el = makeMockElement({
			scrollTop: 200,
			clientHeight: 100,
			clientWidth: 800
		});

		const scroll = createEditorScroll(makeConfig({
			getEditorContent: () => el,
			getSelection: () => ({
				anchor: { line: 2, column: 0 },
				head: { line: 2, column: 0 }
			}),
			getMeasurements: () => ({
				lineHeight: 20,
				charWidth: 8,
				gutterWidth: 50,
				contentPadding: 8
			})
		}));

		await scroll.scrollCursorIntoView();

		// cursorTop = 2 * 20 = 40, which is < scrollTop (200)
		// So scrollTop should be set to cursorTop = 40
		expect(el.scrollTop).toBe(40);
	});

	it('should not change scrollTop when cursor is already visible', async () => {
		const el = makeMockElement({
			scrollTop: 0,
			clientHeight: 500,
			clientWidth: 800
		});

		const scroll = createEditorScroll(makeConfig({
			getEditorContent: () => el,
			getSelection: () => ({
				anchor: { line: 5, column: 0 },
				head: { line: 5, column: 0 }
			}),
			getMeasurements: () => ({
				lineHeight: 20,
				charWidth: 8,
				gutterWidth: 50,
				contentPadding: 8
			})
		}));

		await scroll.scrollCursorIntoView();

		// cursorTop = 5 * 20 = 100, which is within [0, 500)
		expect(el.scrollTop).toBe(0);
	});

	it('should scroll right when cursor is beyond viewport width', async () => {
		const el = makeMockElement({
			scrollTop: 0,
			scrollLeft: 0,
			clientHeight: 500,
			clientWidth: 200
		});

		const scroll = createEditorScroll(makeConfig({
			getEditorContent: () => el,
			getSelection: () => ({
				anchor: { line: 0, column: 100 },
				head: { line: 0, column: 100 }
			}),
			getMeasurements: () => ({
				lineHeight: 20,
				charWidth: 8,
				gutterWidth: 50,
				contentPadding: 8
			})
		}));

		await scroll.scrollCursorIntoView();

		// cursorLeft = 50 + 8 + 100*8 = 858
		// 858 > 0 + 200 - 20 = 180, so horizontal scroll happens
		// scrollLeft = 858 - 200 + 40 = 698
		expect(el.scrollLeft).toBe(698);
	});
});
