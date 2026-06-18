<script lang="ts">
	import type { ComplexityMetrics, ComplexityRegion } from './core/complexity-analyzer';

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
		/** Minimum score to show heat (default: 50) */
		minScore?: number;
		/** Whether heat rendering is enabled */
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
		minScore = 50,
		enabled = true,
		flashRegionKey = '',
		lineToVisualRow = (line: number) => line
	}: Props = $props();

	let highlightedRegions = $derived(
		enabled && metrics ? metrics.regions.filter((region) => region.score >= minScore) : []
	);

	function getRegionKey(region: ComplexityRegion): string {
		return `${region.startLine}:${region.endLine}:${region.name ?? region.type}:${region.score}`;
	}

	function getColor(score: number): string {
		if (score >= 85) return 'var(--ide-error)';
		if (score >= 70) return 'var(--ide-warning)';
		if (score >= 50) return 'var(--ide-info)';
		return 'var(--ide-success)';
	}

	function getWashOpacity(score: number): number {
		const normalized = Math.min(1, Math.max(0, score / 100));
		return Number((0.06 + normalized * 0.16).toFixed(3));
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

{#if enabled && highlightedRegions.length > 0}
	<div
		class="complexity-heat"
		aria-hidden="true"
		style="
			height: {totalHeight ? `${totalHeight}px` : '100%'};
			width: {contentWidth ? `${contentWidth}px` : '100%'};
		"
	>
		{#each highlightedRegions as region (getRegionKey(region))}
			<div
				class="complexity-heat__region"
				class:complexity-heat__region--critical={region.score >= 85}
				class:complexity-heat__region--flash={flashRegionKey === getRegionKey(region)}
				style="
					top: {getRegionTop(region)}px;
					left: {gutterWidth}px;
					width: {Math.max(0, contentWidth - gutterWidth)}px;
					height: {getRegionHeight(region)}px;
					--heat-color: {getColor(region.score)};
					--heat-opacity: {getWashOpacity(region.score)};
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

	.complexity-heat__region {
		position: absolute;
		min-width: calc(100% - var(--editor-gutter-width, 50px));
		background: var(--heat-color);
		opacity: var(--heat-opacity);
		border-left: 1px solid color-mix(in srgb, var(--heat-color) 35%, transparent);
		box-sizing: border-box;
	}

	.complexity-heat__region--critical {
		animation: complexity-heat-pulse 1.5s ease-in-out infinite;
	}

	.complexity-heat__region--flash {
		animation: complexity-heat-flash 0.9s ease-out 1;
	}

	@keyframes complexity-heat-pulse {
		0%,
		100% {
			opacity: var(--heat-opacity);
		}
		50% {
			opacity: calc(var(--heat-opacity) + 0.04);
		}
	}

	@keyframes complexity-heat-flash {
		0% {
			opacity: min(0.34, calc(var(--heat-opacity) + 0.14));
			box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--heat-color) 65%, transparent);
		}
		100% {
			opacity: var(--heat-opacity);
			box-shadow: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.complexity-heat__region--critical,
		.complexity-heat__region--flash {
			animation: none;
		}
	}
</style>
