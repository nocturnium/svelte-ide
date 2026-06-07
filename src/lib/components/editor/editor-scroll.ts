import { tick } from 'svelte';
import type { Selection } from './core';
import { CONTENT_PADDING } from './constants';

export interface ScrollConfig {
	getEditorContent: () => HTMLDivElement | null;
	getSelection: () => Selection;
	getMeasurements: () => {
		lineHeight: number;
		charWidth: number;
		gutterWidth: number;
		contentPadding: number;
	};
}

export function createEditorScroll(config: ScrollConfig) {
	async function scrollCursorIntoView() {
		await tick();
		const editorContent = config.getEditorContent();
		if (!editorContent) return;

		const selection = config.getSelection();
		const { lineHeight, charWidth, gutterWidth } = config.getMeasurements();

		const cursorTop = selection.head.line * lineHeight;
		const cursorLeft = gutterWidth + CONTENT_PADDING + selection.head.column * charWidth;
		const viewportHeight = editorContent.clientHeight;
		const viewportWidth = editorContent.clientWidth;
		const scrollTop = editorContent.scrollTop;
		const scrollLeft = editorContent.scrollLeft;

		// Vertical scroll
		if (cursorTop < scrollTop) {
			editorContent.scrollTop = cursorTop;
		} else if (cursorTop + lineHeight > scrollTop + viewportHeight) {
			editorContent.scrollTop = cursorTop + lineHeight - viewportHeight;
		}

		// Horizontal scroll
		const contentStart = gutterWidth + CONTENT_PADDING;
		if (cursorLeft < scrollLeft + contentStart) {
			editorContent.scrollLeft = Math.max(0, cursorLeft - contentStart - 20);
		} else if (cursorLeft > scrollLeft + viewportWidth - 20) {
			editorContent.scrollLeft = cursorLeft - viewportWidth + 40;
		}
	}

	return { scrollCursorIntoView };
}
