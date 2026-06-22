<script module lang="ts">
	/** A remote collaborator's caret (and optional selection) to render in the editor. */
	export interface RemoteCursor {
		/** Stable id (for keying). */
		id: string;
		/** Display name shown on the caret flag. */
		name: string;
		/** Accent colour (hex or CSS colour). */
		color: string;
		/** 1-based line number. */
		line: number;
		/** 1-based column number. */
		column: number;
		/** Optional selection range (1-based line/column). */
		selection?: {
			anchor: { line: number; column: number };
			head: { line: number; column: number };
		};
	}
</script>

<script lang="ts">
	/**
	 * RemoteCursorLayer — renders OTHER collaborators' carets, name flags, and
	 * selections in the editor (your own caret is the editor's native one). Rendered
	 * inside the scrolling content area, so it tracks scroll automatically. Positions
	 * mirror the AI focus layer's math (gutter + contentPadding + col*charWidth,
	 * line*lineHeight) so remote carets line up with the text.
	 */
	interface Props {
		cursors: RemoteCursor[];
		lineHeight: number;
		charWidth: number;
		gutterWidth: number;
		contentPadding?: number;
		/** Show the name flag above each caret (default true). */
		showLabels?: boolean;
	}

	let {
		cursors,
		lineHeight,
		charWidth,
		gutterWidth,
		contentPadding = 8,
		showLabels = true
	}: Props = $props();

	const xFor = (column: number) =>
		gutterWidth + contentPadding + Math.max(0, column - 1) * charWidth;
	const yFor = (line: number) => Math.max(0, line - 1) * lineHeight;

	type Rect = { top: number; left: number; width: number; height: number };

	// Wide enough to read as a full-line selection; clipped by the layer's overflow.
	const FULL_WIDTH = 4000;

	function selectionRects(sel: NonNullable<RemoteCursor['selection']>): Rect[] {
		const forward =
			sel.anchor.line < sel.head.line ||
			(sel.anchor.line === sel.head.line && sel.anchor.column <= sel.head.column);
		const start = forward ? sel.anchor : sel.head;
		const end = forward ? sel.head : sel.anchor;
		const rects: Rect[] = [];
		if (start.line === end.line) {
			rects.push({
				top: yFor(start.line),
				left: xFor(start.column),
				width: Math.max(2, (end.column - start.column) * charWidth),
				height: lineHeight
			});
			return rects;
		}
		rects.push({
			top: yFor(start.line),
			left: xFor(start.column),
			width: FULL_WIDTH,
			height: lineHeight
		});
		for (let ln = start.line + 1; ln < end.line; ln++) {
			rects.push({ top: yFor(ln), left: xFor(1), width: FULL_WIDTH, height: lineHeight });
		}
		rects.push({
			top: yFor(end.line),
			left: xFor(1),
			width: Math.max(2, (end.column - 1) * charWidth),
			height: lineHeight
		});
		return rects;
	}
</script>

{#if cursors.length > 0}
	<div class="remote-cursors" aria-hidden="true">
		{#each cursors as c (c.id)}
			{#if c.selection}
				{#each selectionRects(c.selection) as r, i (i)}
					<div
						class="remote-cursors__selection"
						style="top: {r.top}px; left: {r.left}px; width: {r.width}px; height: {r.height}px; --rc: {c.color};"
					></div>
				{/each}
			{/if}

			<div
				class="remote-cursors__caret"
				style="top: {yFor(c.line)}px; left: {xFor(
					c.column
				)}px; height: {lineHeight}px; --rc: {c.color};"
			></div>

			{#if showLabels}
				<div
					class="remote-cursors__flag"
					style="top: {yFor(c.line)}px; left: {xFor(c.column)}px; background: {c.color};"
				>
					{c.name}
				</div>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.remote-cursors {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		overflow: hidden;
		z-index: 6;
	}

	.remote-cursors__selection {
		position: absolute;
		background: color-mix(in srgb, var(--rc) 24%, transparent);
		border-radius: 2px;
	}

	.remote-cursors__caret {
		position: absolute;
		width: 2px;
		background: var(--rc);
		border-radius: 1px;
		box-shadow: 0 0 6px color-mix(in srgb, var(--rc) 60%, transparent);
		animation: remote-caret-blink 1.1s steps(2, start) infinite;
	}

	.remote-cursors__flag {
		position: absolute;
		transform: translateY(-100%);
		padding: 1px 6px;
		border-radius: 4px 4px 4px 0;
		font-size: 11px;
		font-weight: 600;
		line-height: 1.4;
		color: #0d1421;
		white-space: nowrap;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	@keyframes remote-caret-blink {
		0%,
		60% {
			opacity: 1;
		}
		61%,
		100% {
			opacity: 0.35;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.remote-cursors__caret {
			animation: none;
		}
	}
</style>
