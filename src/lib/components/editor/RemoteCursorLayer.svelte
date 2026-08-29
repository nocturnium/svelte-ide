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
		/**
		 * Full height of the scrollable content in pixels.
		 *
		 * The layer must span the whole document. It used to be stretched with
		 * `bottom: 0`, which resolves against the containing block — the editor's
		 * padding box, i.e. ONE VIEWPORT — so with `overflow: hidden` every remote
		 * caret below the first screenful was clipped away. Silently: the caret was
		 * in the DOM at the right coordinates, just painted nowhere.
		 *
		 * The identical bug and fix are documented on the sibling overlay in
		 * `ComplexityLayer.svelte` ('Height is set inline to the full content
		 * height so indicators below the first viewport are not clipped').
		 */
		totalHeight?: number;
		/** Estimated full scrollable content width in pixels. */
		contentWidth?: number;
		/**
		 * Maps a raw document line to its rendered visual row.
		 *
		 * Required alongside `totalHeight`, not optional polish. `totalHeight` is
		 * measured in VISUAL ROWS (folded ranges collapse to one), while a remote
		 * caret arrives as a raw document line. Sizing the layer by one and
		 * positioning within it by the other puts every caret below a collapsed fold
		 * at the wrong row.
		 */
		lineToVisualRow?: (line: number) => number;
	}

	let {
		cursors,
		lineHeight,
		charWidth,
		gutterWidth,
		contentPadding = 8,
		showLabels = true,
		totalHeight = 0,
		contentWidth = 0,
		lineToVisualRow = (line: number) => line
	}: Props = $props();

	const xFor = (column: number) =>
		gutterWidth + contentPadding + Math.max(0, column - 1) * charWidth;
	// RemoteCursor lines are 1-based; visual rows are 0-based.
	const yFor = (line: number) => lineToVisualRow(Math.max(0, line - 1)) * lineHeight;

	type Rect = { top: number; left: number; width: string; height: number };

	/**
	 * Width of a selection rect that runs to the end of the line.
	 *
	 * Bounded by the content, never a magic constant. This was a flat 4000px that
	 * relied entirely on the layer's `overflow: hidden` to cut it back — a rect
	 * fourteen times wider than the text it highlights, correct only for as long as
	 * nobody touched one line of CSS. The layer still clips, so this is not a fix
	 * for a live defect; it removes a trip-wire.
	 */
	const fullWidthFrom = (left: number): string =>
		contentWidth > 0 ? `${Math.max(2, contentWidth - left)}px` : `calc(100% - ${left}px)`;

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
				width: `${Math.max(2, (end.column - start.column) * charWidth)}px`,
				height: lineHeight
			});
			return rects;
		}
		rects.push({
			top: yFor(start.line),
			left: xFor(start.column),
			width: fullWidthFrom(xFor(start.column)),
			height: lineHeight
		});
		for (let ln = start.line + 1; ln < end.line; ln++) {
			rects.push({
				top: yFor(ln),
				left: xFor(1),
				width: fullWidthFrom(xFor(1)),
				height: lineHeight
			});
		}
		rects.push({
			top: yFor(end.line),
			left: xFor(1),
			width: `${Math.max(2, (end.column - 1) * charWidth)}px`,
			height: lineHeight
		});
		return rects;
	}
</script>

{#if cursors.length > 0}
	<div
		class="remote-cursors"
		aria-hidden="true"
		style="
			height: {totalHeight ? `${totalHeight}px` : '100%'};
			width: {contentWidth ? `${contentWidth}px` : '100%'};
		"
	>
		{#each cursors as c (c.id)}
			{#if c.selection}
				{#each selectionRects(c.selection) as r, i (i)}
					<div
						class="remote-cursors__selection"
						style="top: {r.top}px; left: {r.left}px; width: {r.width}; height: {r.height}px; --rc: {c.color};"
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
		/* Size comes from the inline height/width above, which carry the full
		   scrollable content extent. `min-*` keeps the layer covering the viewport
		   when a caller has not measured it yet; `right`/`bottom: 0` used to size
		   the layer to one viewport and hide every caret below the fold. */
		min-width: 100%;
		min-height: 100%;
		pointer-events: none;
		/* Still hidden, and deliberately. Once the layer spans the whole document
		   there is nothing real left for it to clip: the only child that lands
		   outside is a name flag on line 1, drawn above its caret by
		   translateY(-100%), and that sits above the editor's own scrollport, which
		   no setting here can reveal. Keeping it hidden is a guarantee that no
		   overlay can ever widen the editor's scrollable area. */
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
