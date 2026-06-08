<script lang="ts">
	/**
	 * EditorGutter - Renders per-line gutter content (line number + fold indicator).
	 *
	 * Internal sub-component extracted from CustomEditor.svelte.
	 * Not exported from the library — used only by CustomEditor / EditorLines.
	 */

	interface Props {
		lineIndex: number;
		lineNumbers: string; // 'on' | 'off'
		gutterWidth: number;
		folding: boolean;
		hasFoldIndicator: boolean;
		isFoldCollapsed: boolean;
		hiddenLineCount: number;
		onFoldIndicatorClick: (line: number, e: MouseEvent) => void;
	}

	let {
		lineIndex,
		lineNumbers,
		gutterWidth: _gutterWidth,
		folding,
		hasFoldIndicator,
		isFoldCollapsed,
		hiddenLineCount: _hiddenLineCount,
		onFoldIndicatorClick
	}: Props = $props();
</script>

<!-- Fold indicator (shown on hover or when folded) -->
{#if folding && hasFoldIndicator}
	<button
		class="custom-editor__fold-indicator"
		class:custom-editor__fold-indicator--collapsed={isFoldCollapsed}
		onclick={(e) => onFoldIndicatorClick(lineIndex, e)}
		aria-label={isFoldCollapsed
			? `Expand fold at line ${lineIndex + 1} (Ctrl+Shift+])`
			: `Collapse fold at line ${lineIndex + 1} (Ctrl+Shift+[)`}
		aria-expanded={!isFoldCollapsed}
	>
		{#if isFoldCollapsed}
			<span class="fold-icon">&#9654;</span>
		{:else}
			<span class="fold-icon">&#9660;</span>
		{/if}
	</button>
{/if}

<!-- Line number -->
{#if lineNumbers !== 'off'}
	<div class="custom-editor__gutter" data-cursor-type="default" style="cursor: default !important;">
		<span class="custom-editor__line-number" data-cursor-type="default" style="cursor: default !important;">{lineIndex + 1}</span>
	</div>
{/if}

<style>
	/* Fold indicator */
	.custom-editor__fold-indicator {
		position: absolute;
		left: 2px;
		width: 16px;
		height: var(--editor-line-height);
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		color: var(--ide-text-muted);
		font-size: 8px;
		opacity: 0;
		transition: opacity 0.15s ease, color 0.15s ease;
		z-index: 5;
	}

	.custom-editor__fold-indicator:hover {
		color: var(--ide-text-primary);
	}

	.custom-editor__fold-indicator--collapsed {
		opacity: 1;
		color: var(--ide-interactive);
	}

	.fold-icon {
		display: inline-block;
		transform-origin: center;
		transition: transform 0.15s ease;
	}

	.custom-editor__gutter {
		position: sticky;
		left: 0;
		width: var(--editor-gutter-width);
		min-width: var(--editor-gutter-width);
		background: transparent; /* Let the gutter-bg show through */
		text-align: right;
		padding-right: 8px;
		user-select: none;
		cursor: default !important;
		z-index: 3;
		pointer-events: auto;
	}

	/* Force gutter and descendants to have default cursor - override any inheritance */
	.custom-editor__gutter,
	.custom-editor__gutter * {
		cursor: default !important;
	}

	.custom-editor__line-number {
		color: var(--ide-text-muted);
		cursor: default !important;
	}
</style>
