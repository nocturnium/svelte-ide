<script lang="ts">
	/**
	 * EditorLines - Renders the main line loop with gutter, tokens, and fold placeholders.
	 *
	 * Internal sub-component extracted from CustomEditor.svelte.
	 * Not exported from the library — used only by CustomEditor.
	 */
	import type { TokenizedLine } from './tokenizer';
	import TokenRenderer from './TokenRenderer.svelte';
	import EditorGutter from './EditorGutter.svelte';

	interface LineData {
		tokens?: TokenizedLine;
		text?: string;
	}

	interface Props {
		/**
		 * Virtualized slice of the (folded) visible line sequence. Only the rows
		 * intersecting the viewport (+ overscan) are passed in. Each entry carries:
		 *  - `line`: the line data to render
		 *  - `index`: the raw 0-based line index (for gutter numbers, folds)
		 *  - `visualRow`: the absolute visual-row position, used to position the
		 *    rendered line at its true offset (visualRow * lineHeight)
		 */
		windowedLines: Array<{ line: LineData | undefined; index: number; visualRow: number }>;
		/** Full scrollable content height in px (spacer keeps the scrollbar correct). */
		totalHeight: number;
		lineHeight: number;
		activeLine: number;
		highlightActiveLine: boolean;
		lineNumbers: string; // 'on' | 'off'
		gutterWidth: number;
		tabSize: number;
		folding: boolean;
		hasFoldIndicator: (line: number) => boolean;
		isFoldCollapsed: (line: number) => boolean;
		getHiddenLineCount: (line: number) => number;
		onFoldIndicatorClick: (line: number, e: MouseEvent) => void;
		onExpandFold: (line: number) => void;
	}

	let {
		windowedLines,
		totalHeight,
		lineHeight,
		activeLine,
		highlightActiveLine,
		lineNumbers,
		gutterWidth,
		tabSize,
		folding,
		hasFoldIndicator,
		isFoldCollapsed,
		getHiddenLineCount,
		onFoldIndicatorClick,
		onExpandFold
	}: Props = $props();
</script>

<div class="custom-editor__lines" style="height: {totalHeight}px;">
	{#each windowedLines as { line, index, visualRow } (index)}
		<div
			class="custom-editor__line"
			class:custom-editor__line--active={highlightActiveLine && activeLine === index}
			style="top: {visualRow * lineHeight}px;"
			data-line-index={index}
		>
			<EditorGutter
				lineIndex={index}
				{lineNumbers}
				{gutterWidth}
				{folding}
				hasFoldIndicator={hasFoldIndicator(index)}
				isFoldCollapsed={isFoldCollapsed(index)}
				hiddenLineCount={getHiddenLineCount(index)}
				{onFoldIndicatorClick}
			/>

			<!-- Line content -->
			<div class="custom-editor__line-content">
				<TokenRenderer tokens={line?.tokens} {tabSize} />
				{#if folding && isFoldCollapsed(index)}
					<button
						class="custom-editor__fold-placeholder"
						title="{getHiddenLineCount(index)} lines hidden"
						onclick={(e) => {
							e.stopPropagation();
							onExpandFold(index);
						}}
						aria-label="Expand {getHiddenLineCount(index)} hidden lines">...</button
					>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.custom-editor__lines {
		position: relative;
		min-height: 100%;
		z-index: 2;
	}

	/*
	 * Each line is absolutely positioned at its true vertical offset
	 * (top = visualRow * lineHeight, set inline). This lets us render only the
	 * windowed slice of rows while keeping every line at the correct position;
	 * the parent .custom-editor__lines reserves the full document height so the
	 * scrollbar range stays correct.
	 */
	.custom-editor__line {
		position: absolute;
		left: 0;
		display: flex;
		/* At least full width (so active-line highlight spans the viewport) but free
		   to grow with long, non-wrapping content for horizontal scrolling. */
		min-width: 100%;
		width: max-content;
		height: var(--editor-line-height);
		line-height: var(--editor-line-height);
		min-height: var(--editor-line-height);
		cursor: default;
	}

	.custom-editor__line--active {
		background: var(--ide-bg-elevated);
		box-shadow: inset 2px 0 0 0 var(--ide-interactive);
	}

	/* Gutter overrides for active line (cross-component into EditorGutter) */
	.custom-editor__line--active :global(.custom-editor__gutter) {
		background: var(--ide-bg-elevated);
	}

	.custom-editor__line--active :global(.custom-editor__line-number) {
		color: var(--ide-text-secondary);
	}

	/* Show fold indicator on line hover (cross-component into EditorGutter) */
	.custom-editor__line:hover :global(.custom-editor__fold-indicator) {
		opacity: 1;
	}

	.custom-editor__line-content {
		flex: 1;
		white-space: pre;
		padding-left: 8px;
		cursor: text;
	}

	/* Ensure line-content cursor doesn't affect siblings */
	.custom-editor__line-content,
	.custom-editor__line-content * {
		cursor: text;
	}

	/* Fold placeholder (ellipsis) - styled as inline button */
	.custom-editor__fold-placeholder {
		display: inline-block;
		margin-left: 4px;
		padding: 0 6px;
		background: var(--ide-bg-tertiary);
		border: 1px solid var(--ide-border);
		border-radius: 3px;
		color: var(--ide-text-muted);
		font: inherit;
		font-size: 0.85em;
		cursor: pointer;
		vertical-align: middle;
		line-height: 1.2;
	}

	.custom-editor__fold-placeholder:hover {
		background: var(--ide-bg-elevated);
		color: var(--ide-text-secondary);
		border-color: var(--ide-interactive);
	}

	.custom-editor__fold-placeholder:focus {
		outline: 2px solid var(--ide-interactive);
		outline-offset: 1px;
	}
</style>
