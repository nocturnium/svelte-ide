<script lang="ts">
	import {
		COGNITIVE_COMPLEXITY_BANDS,
		getComplexityRegionKey,
		type ComplexityMetrics,
		type ComplexityRegion
	} from './core/complexity-analyzer';

	interface Props {
		/** Complexity metrics for the current document */
		metrics: ComplexityMetrics | null;
		/** Line height in pixels */
		lineHeight: number;
		/** Gutter width in pixels */
		gutterWidth?: number;
		/** Full height of the scrollable content in pixels */
		totalHeight?: number;
		/** Estimated full scrollable content width in pixels */
		contentWidth?: number;
		/**
		 * Lowest Cognitive Complexity that gets a mark. Defaults to the `medium`
		 * band, so trivially readable code stays completely unmarked.
		 */
		minCognitiveComplexity?: number;
		/** Whether depth rendering is enabled */
		enabled?: boolean;
		/** Region key to briefly emphasize after jump-to-hottest */
		flashRegionKey?: string;
		/** Maps a raw document line to its rendered visual row */
		lineToVisualRow?: (line: number) => number;
	}

	let {
		metrics,
		lineHeight,
		gutterWidth = 50,
		totalHeight = 0,
		contentWidth = 0,
		minCognitiveComplexity = COGNITIVE_COMPLEXITY_BANDS.medium,
		enabled = true,
		flashRegionKey = '',
		lineToVisualRow = (line: number) => line
	}: Props = $props();

	let markedRegions = $derived(
		enabled && metrics
			? metrics.regions.filter((r) => r.cognitiveComplexity >= minCognitiveComplexity)
			: []
	);

	/**
	 * Region plane alpha by band — measured, not guessed.
	 *
	 * Against the editor background #0d1421 these render 1.067 / 1.129 / 1.200:1,
	 * so the bands are distinguishable from each other and from unmarked code. The
	 * ceiling is set by token legibility rather than taste: at 0.13 the worst-case
	 * token (comments) still measures 4.68:1, and 0.16 would drop it to 4.44:1,
	 * under AA. Do not raise these without re-measuring.
	 *
	 * Two earlier attempts failed here. A `mix-blend-mode: screen` wash at up to
	 * 0.48 could only lighten, dragging the backdrop into the mid-luminance this
	 * palette occupies and pushing comments to ~1.7:1. Replacing it with a
	 * near-black "deepening" veil was arithmetically invisible — 1.008-1.018:1 —
	 * because you cannot darken below a near-black.
	 */
	function getVeilAlpha(level: ComplexityRegion['level']): number {
		if (level === 'critical') return 0.13;
		if (level === 'high') return 0.09;
		if (level === 'medium') return 0.05;
		return 0;
	}

	function getEdgeColor(level: ComplexityRegion['level']): string {
		if (level === 'critical') return 'var(--ide-complexity-critical)';
		if (level === 'high') return 'var(--ide-complexity-high)';
		return 'var(--ide-complexity-medium)';
	}

	/**
	 * Edge thickness in px — a second, non-colour channel for the band, so the
	 * severity survives any form of colour blindness (WCAG 1.4.1).
	 */
	function getEdgeWidth(level: ComplexityRegion['level']): number {
		if (level === 'critical') return 5;
		if (level === 'high') return 3;
		return 2;
	}

	function getRegionTop(region: ComplexityRegion): number {
		return lineToVisualRow(region.startLine) * lineHeight;
	}

	function getRegionHeight(region: ComplexityRegion): number {
		const startRow = lineToVisualRow(region.startLine);
		const endRow = Math.max(startRow, lineToVisualRow(region.endLine));
		return Math.max(lineHeight, (endRow - startRow + 1) * lineHeight);
	}
</script>

{#if enabled && markedRegions.length > 0}
	<div
		class="complexity-heat"
		aria-hidden="true"
		style="
			height: {totalHeight ? `${totalHeight}px` : '100%'};
			width: {contentWidth ? `${contentWidth}px` : '100%'};
		"
	>
		{#each markedRegions as region (getComplexityRegionKey(region))}
			<div
				class="complexity-heat__region"
				class:complexity-heat__region--flash={flashRegionKey === getComplexityRegionKey(region)}
				style="
					top: {getRegionTop(region)}px;
					left: {gutterWidth}px;
					width: {Math.max(0, contentWidth - gutterWidth)}px;
					height: {getRegionHeight(region)}px;
					--edge-color: {getEdgeColor(region.level)};
					--edge-width: {getEdgeWidth(region.level)}px;
					--veil-alpha: {getVeilAlpha(region.level)};
				"
			></div>
		{/each}
	</div>
{/if}

<style>
	.complexity-heat {
		position: absolute;
		top: 0;
		left: 0;
		min-width: 100%;
		min-height: 100%;
		pointer-events: none;
		z-index: 0;
		overflow: hidden;
	}

	/* Flat veil, no gradient. Complexity is a property of the whole region and has
	   no horizontal dimension, so the old 90deg ramp encoded nothing while doing
	   all the damage — it hit hardest at the left margin, exactly where the
	   indentation and closing-brace ladder of deeply nested code lives. Its stops
	   were percentages of the scrollable content width, so the column at which
	   text became readable also moved when you resized the window. */
	.complexity-heat__region {
		position: absolute;
		background: rgba(var(--ide-complexity-veil), var(--veil-alpha));
		border-left: var(--edge-width) solid var(--edge-color);
		box-sizing: border-box;
	}

	.complexity-heat__region--flash {
		animation: complexity-heat-flash 0.9s ease-out 1;
	}

	@keyframes complexity-heat-flash {
		0% {
			background: rgba(var(--ide-complexity-veil), calc(var(--veil-alpha) + 0.06));
			box-shadow: inset 0 0 0 1px var(--edge-color);
		}
		100% {
			background: rgba(var(--ide-complexity-veil), var(--veil-alpha));
			box-shadow: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.complexity-heat__region--flash {
			animation: none;
		}
	}
</style>
