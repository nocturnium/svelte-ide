<script lang="ts">
	/**
	 * EditorSelections - Renders selection rectangles and cursors for all cursors.
	 *
	 * Internal sub-component extracted from CustomEditor.svelte.
	 * Not exported from the library — used only by CustomEditor.
	 */
	import {
		type Cursor,
		type Position,
		getSelectionStart,
		getSelectionEnd,
		isSelectionEmpty
	} from './core';
	import { FALLBACK_VIEWPORT_HEIGHT } from './constants';

	interface Props {
		cursors: readonly Cursor[];
		cursorVisible: boolean;
		readonly: boolean;
		lineHeight: number;
		charWidth: number;
		gutterWidth: number;
		contentPadding: number;
		scrollTop: number;
		viewportHeight: number;
		getLine: (n: number) => { text: string } | undefined;
		lineCount: number;
	}

	let {
		cursors,
		cursorVisible,
		readonly: isReadonly,
		lineHeight,
		charWidth,
		gutterWidth,
		contentPadding,
		scrollTop,
		viewportHeight,
		getLine,
		lineCount
	}: Props = $props();

	// Selection rects memoization
	let cachedSelectionRects: Array<{
		top: number;
		left: number;
		width: number;
		height: number;
		isPrimary: boolean;
	}> = [];
	let cachedSelectionKey = '';

	// Get selection rectangles for all cursors (memoized and virtualized to viewport)
	function getSelectionRects(): Array<{
		top: number;
		left: number;
		width: number;
		height: number;
		isPrimary: boolean;
	}> {
		// Check if any cursor has a selection
		const anySelection = cursors.some((c) => !isSelectionEmpty(c.selection));
		if (!anySelection) {
			cachedSelectionRects = [];
			cachedSelectionKey = '';
			return [];
		}

		// Calculate visible line range (with 1-line buffer for smooth scrolling)
		const vh = viewportHeight || FALLBACK_VIEWPORT_HEIGHT;
		const firstVisibleLine = Math.max(0, Math.floor(scrollTop / lineHeight) - 1);
		const lastVisibleLine = Math.min(lineCount - 1, Math.ceil((scrollTop + vh) / lineHeight) + 1);

		// Create cache key from all cursors, scroll position, and measurement values
		const cursorKeys = cursors
			.map(
				(c) =>
					`${c.id}:${c.selection.anchor.line}:${c.selection.anchor.column}-${c.selection.head.line}:${c.selection.head.column}`
			)
			.join('|');
		const key = `${cursorKeys}@${firstVisibleLine}-${lastVisibleLine}:${charWidth}:${lineHeight}:${gutterWidth}`;
		if (key === cachedSelectionKey) {
			return cachedSelectionRects;
		}

		const rects: Array<{
			top: number;
			left: number;
			width: number;
			height: number;
			isPrimary: boolean;
		}> = [];

		// Process each cursor's selection
		for (const cursor of cursors) {
			if (isSelectionEmpty(cursor.selection)) continue;

			const start = getSelectionStart(cursor.selection);
			const end = getSelectionEnd(cursor.selection);

			// Only iterate over lines that are both selected AND visible
			const renderStart = Math.max(start.line, firstVisibleLine);
			const renderEnd = Math.min(end.line, lastVisibleLine);

			for (let line = renderStart; line <= renderEnd; line++) {
				const lineContent = getLine(line);
				if (!lineContent) continue;

				let startCol = 0;
				let endCol = lineContent.text.length;

				if (line === start.line) {
					startCol = start.column;
				}
				if (line === end.line) {
					endCol = end.column;
				}

				// Ensure minimum width for empty selections at line end
				const width = Math.max((endCol - startCol) * charWidth, 4);

				rects.push({
					top: line * lineHeight,
					left: gutterWidth + contentPadding + startCol * charWidth,
					width,
					height: lineHeight,
					isPrimary: cursor.isPrimary
				});
			}
		}

		cachedSelectionKey = key;
		cachedSelectionRects = rects;
		return rects;
	}

	// Get cursor style for a specific cursor position
	function getCursorStyleForPosition(pos: Position): string {
		const left = gutterWidth + contentPadding + pos.column * charWidth;
		const top = pos.line * lineHeight;
		return `left: ${left}px; top: ${top}px; height: ${lineHeight}px;`;
	}
</script>

<!-- Selection layer (all cursor selections) -->
<div class="custom-editor__selections">
	{#each getSelectionRects() as rect, i (i)}
		<div
			class="custom-editor__selection"
			class:custom-editor__selection--secondary={!rect.isPrimary}
			style="top: {rect.top}px; left: {rect.left}px; width: {rect.width}px; height: {rect.height}px;"
		></div>
	{/each}
</div>

<!-- Cursors (all cursors rendered with primary/secondary distinction) -->
{#if cursorVisible && !isReadonly}
	{#each cursors as cursor (cursor.id)}
		<div
			class="custom-editor__cursor"
			class:custom-editor__cursor--secondary={!cursor.isPrimary}
			style={getCursorStyleForPosition(cursor.selection.head)}
		></div>
	{/each}
{/if}

<style>
	.custom-editor__selections {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		pointer-events: none;
		z-index: 1;
	}

	.custom-editor__selection {
		position: absolute;
		/* Translucent wash so syntax-colored text remains legible underneath */
		background: color-mix(in srgb, var(--ide-interactive) 28%, transparent);
	}

	/* Secondary selection (slightly different shade) */
	.custom-editor__selection--secondary {
		background: var(--ide-bg-selection-secondary);
	}

	.custom-editor__cursor {
		position: absolute;
		width: 2px;
		background: var(--color-nocturnium-aurora-blue);
		z-index: 10;
		pointer-events: none;
		transition: opacity 80ms;
	}

	/* Secondary cursor (slightly dimmer to distinguish from primary) */
	.custom-editor__cursor--secondary {
		background: var(--ide-interactive-muted);
		opacity: 0.85;
	}
</style>
