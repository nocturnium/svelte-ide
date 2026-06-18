<script lang="ts">
	/**
	 * Complexity Layer
	 *
	 * Shows complexity indicators in the gutter area only.
	 * No background highlighting - keeps editing area clean.
	 * Hover over gutter indicators for details.
	 */

	import type { ComplexityMetrics, ComplexityRegion } from './core/complexity-analyzer';

	interface Props {
		/** Complexity metrics for the current document */
		metrics: ComplexityMetrics | null;
		/** Line height in pixels */
		lineHeight: number;
		/** Gutter width in pixels */
		gutterWidth?: number;
		/**
		 * Full height of the scrollable content in pixels. The layer must span the
		 * whole document (not just one viewport) or indicators below the first
		 * screenful get clipped — which previously hid every high-complexity region
		 * that sat past the initial view.
		 */
		totalHeight?: number;
		/** Estimated full scrollable content width in pixels */
		contentWidth?: number;
		/** Minimum score to show indicators (default: 50) */
		minScore?: number;
		/** Whether indicators are enabled */
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

	// Filter regions that exceed the threshold
	let highlightedRegions = $derived(
		enabled && metrics ? metrics.regions.filter((r) => r.score >= minScore) : []
	);

	/**
	 * Get the color based on score level
	 */
	function getColor(score: number): string {
		// Bands match the analyzer's levels: critical >= 85, high >= 70,
		// medium otherwise (lines below the minScore threshold aren't shown).
		if (score >= 85) return 'var(--ide-error)'; // Critical
		if (score >= 70) return 'var(--ide-warning)'; // High
		if (score >= 50) return 'var(--ide-info)'; // Medium
		return 'var(--ide-success)'; // Low
	}

	/**
	 * Get opacity based on score
	 */
	function getOpacity(score: number): number {
		const normalized = Math.min(1, Math.max(0, (score - minScore) / (100 - minScore)));
		return 0.65 + normalized * 0.35;
	}

	let hoveredRegion = $state<ComplexityRegion | null>(null);
	let tooltipPosition = $state({ top: 0, left: 0 });
	let visibleContributions = $derived(
		hoveredRegion
			? [...hoveredRegion.contributions].sort((a, b) => a.line - b.line).slice(0, 8)
			: []
	);
	let hiddenContributionCount = $derived(
		hoveredRegion
			? Math.max(0, hoveredRegion.contributions.length - visibleContributions.length)
			: 0
	);

	function getRegionKey(region: ComplexityRegion): string {
		return `${region.startLine}:${region.endLine}:${region.name ?? region.type}:${region.score}`;
	}

	function getLevelLabel(score: number): string {
		if (score >= 85) return 'Critical';
		if (score >= 70) return 'High';
		if (score >= 50) return 'Medium';
		return 'Low';
	}

	function getRegionTop(region: ComplexityRegion): number {
		return lineToVisualRow(region.startLine) * lineHeight;
	}

	function getRegionHeight(region: ComplexityRegion): number {
		const startRow = lineToVisualRow(region.startLine);
		const endRow = Math.max(startRow, lineToVisualRow(region.endLine));
		return Math.max(lineHeight, (endRow - startRow + 1) * lineHeight);
	}

	function getContributionLabel(contribution: ComplexityRegion['contributions'][number]): string {
		return contribution.kind || contribution.reason;
	}

	function handleMouseEnter(region: ComplexityRegion, event: MouseEvent) {
		hoveredRegion = region;
		const rect = (event.target as HTMLElement).getBoundingClientRect();
		tooltipPosition = {
			top: rect.top,
			left: rect.right + 8
		};
	}

	function handleMouseLeave() {
		hoveredRegion = null;
	}
</script>

{#if enabled && highlightedRegions.length > 0}
	<div
		class="complexity-gutter"
		aria-hidden="true"
		style="width: {contentWidth ? `${contentWidth}px` : '100%'};{totalHeight
			? ` height: ${totalHeight}px;`
			: ''} --editor-gutter-width: {gutterWidth}px;"
	>
		{#each highlightedRegions as region (getRegionKey(region))}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="complexity-gutter__spine"
				class:complexity-gutter__spine--critical={region.score >= 85}
				class:complexity-gutter__spine--flash={flashRegionKey === getRegionKey(region)}
				style="
					top: {getRegionTop(region)}px;
					height: {getRegionHeight(region)}px;
					--indicator-color: {getColor(region.score)};
					--indicator-opacity: {getOpacity(region.score)};
					--indicator-glow: {region.score >= 85 ? 18 : region.score >= 70 ? 14 : 9}px;
				"
				onmouseenter={(e) => handleMouseEnter(region, e)}
				onmouseleave={handleMouseLeave}
			></div>
			<div
				class="complexity-gutter__score"
				class:complexity-gutter__score--critical={region.score >= 85}
				class:complexity-gutter__score--flash={flashRegionKey === getRegionKey(region)}
				style="
					top: {getRegionTop(region) + 3}px;
					right: 18px;
					--indicator-color: {getColor(region.score)};
					--indicator-opacity: {getOpacity(region.score)};
				"
			>
				{region.score}
			</div>
		{/each}
	</div>

	<!-- Tooltip (positioned fixed to avoid clipping) -->
	{#if hoveredRegion}
		<div
			class="complexity-tooltip"
			style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px;"
		>
			<div class="complexity-tooltip__header">
				<span class="complexity-tooltip__badge" style="color: {getColor(hoveredRegion.score)}">
					{hoveredRegion.cognitiveComplexity}
				</span>
				<div class="complexity-tooltip__heading">
					<span class="complexity-tooltip__title">
						{getLevelLabel(hoveredRegion.score)} Cognitive Complexity
					</span>
					<span class="complexity-tooltip__source">SonarSource Cognitive Complexity metric</span>
				</div>
			</div>
			<div class="complexity-tooltip__lines">
				{hoveredRegion.name || hoveredRegion.type} · Lines {hoveredRegion.startLine + 1} - {hoveredRegion.endLine +
					1}
				· Score {hoveredRegion.score}
			</div>
			{#if visibleContributions.length > 0}
				<ul class="complexity-tooltip__contributions">
					{#each visibleContributions as contribution, index (`${contribution.line}:${contribution.kind}:${index}`)}
						<li>
							<span>line {contribution.line + 1}</span>
							<strong>+{contribution.increment}</strong>
							<span>{getContributionLabel(contribution)} (nesting {contribution.nesting})</span>
						</li>
					{/each}
					{#if hiddenContributionCount > 0}
						<li class="complexity-tooltip__more">+{hiddenContributionCount} more</li>
					{/if}
				</ul>
			{/if}
			{#if hoveredRegion.suggestion}
				<div class="complexity-tooltip__suggestion">
					{hoveredRegion.suggestion}
				</div>
			{/if}
			<div class="complexity-tooltip__factors">
				<span>Nesting: {hoveredRegion.factors.nestingDepth}</span>
				<span>Branches: {hoveredRegion.factors.branchingFactor}</span>
				<span>Lines: {hoveredRegion.factors.lineCount}</span>
			</div>
		</div>
	{/if}
{/if}

<style>
	.complexity-gutter {
		position: absolute;
		top: 0;
		left: 0;
		/* Height is set inline to the full content height so indicators below the
		   first viewport are not clipped. Fall back to the viewport when unknown. */
		bottom: 0;
		pointer-events: none;
		z-index: 5;
		overflow: visible;
	}

	.complexity-gutter__spine {
		position: absolute;
		left: calc(var(--editor-gutter-width, 50px) - 3px);
		width: 4px;
		pointer-events: auto;
		cursor: help;
		background: var(--indicator-color);
		opacity: var(--indicator-opacity);
		border-radius: 999px;
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--indicator-color) 35%, transparent);
		isolation: isolate;
		transition:
			opacity 0.15s ease,
			width 0.15s ease,
			box-shadow 0.15s ease,
			transform 0.15s ease;
	}

	.complexity-gutter__spine::before {
		content: '';
		position: absolute;
		inset: -2px -1px;
		border-radius: inherit;
		background: var(--indicator-color);
		filter: blur(6px);
		opacity: 0.55;
		transform: scaleX(1);
		transform-origin: center;
		z-index: -1;
	}

	.complexity-gutter__spine:hover {
		opacity: 1;
		width: 6px;
		transform: translateX(-1px);
	}

	.complexity-gutter__spine--critical {
		animation: complexity-spine-pulse 2.4s ease-in-out infinite;
	}

	.complexity-gutter__spine--critical::before {
		animation: complexity-spine-bloom-pulse 2.4s ease-in-out infinite;
	}

	.complexity-gutter__spine--flash {
		animation: complexity-spine-flash 0.9s ease-out 1;
	}

	.complexity-gutter__spine--flash::before {
		animation: complexity-spine-bloom-flash 0.9s ease-out 1;
	}

	.complexity-gutter__score {
		position: absolute;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		height: 30px;
		padding: 0 10px;
		border: 1px solid color-mix(in srgb, var(--indicator-color) 65%, transparent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--indicator-color) 18%, var(--ide-bg-primary));
		box-shadow:
			0 0 18px color-mix(in srgb, var(--indicator-color) 32%, transparent),
			inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent);
		color: var(--indicator-color);
		font-size: 22px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		text-shadow: 0 0 12px color-mix(in srgb, var(--indicator-color) 48%, transparent);
		opacity: calc(0.76 + (var(--indicator-opacity) - 0.65) * 0.7);
		transform: scale(1);
		transform-origin: center;
		pointer-events: none;
		box-sizing: border-box;
	}

	.complexity-gutter__score--critical {
		animation: complexity-score-glow-pulse 2.4s ease-in-out infinite;
	}

	.complexity-gutter__score--flash {
		animation: complexity-score-arrival-pop 0.35s ease-out 1;
	}

	@keyframes complexity-spine-pulse {
		0%,
		100% {
			transform: scaleX(1);
		}
		50% {
			transform: scaleX(1.12);
		}
	}

	@keyframes complexity-spine-bloom-pulse {
		0%,
		100% {
			filter: blur(6px);
			opacity: 0.55;
			transform: scaleX(1);
		}
		50% {
			filter: blur(10px);
			opacity: 0.78;
			transform: scaleX(1.35);
		}
	}

	@keyframes complexity-score-glow-pulse {
		0%,
		100% {
			box-shadow:
				0 0 18px color-mix(in srgb, var(--indicator-color) 32%, transparent),
				inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent);
			transform: scale(1);
		}
		50% {
			box-shadow:
				0 0 28px color-mix(in srgb, var(--indicator-color) 52%, transparent),
				0 0 44px color-mix(in srgb, var(--indicator-color) 28%, transparent),
				inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent);
			transform: scale(1.04);
		}
	}

	@keyframes complexity-score-arrival-pop {
		0% {
			transform: scale(1.15);
			box-shadow:
				0 0 30px color-mix(in srgb, var(--indicator-color) 62%, transparent),
				0 0 58px color-mix(in srgb, var(--indicator-color) 36%, transparent),
				inset 0 1px 0 color-mix(in srgb, #fff 18%, transparent);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes complexity-spine-flash {
		0% {
			opacity: 1;
			width: 8px;
			box-shadow: 0 0 0 1px color-mix(in srgb, var(--indicator-color) 70%, transparent);
			transform: translateX(-2px);
		}
		100% {
			opacity: var(--indicator-opacity);
			width: 4px;
			transform: translateX(0);
		}
	}

	@keyframes complexity-spine-bloom-flash {
		0% {
			filter: blur(12px);
			opacity: 0.9;
			transform: scaleX(1.45);
		}
		100% {
			filter: blur(6px);
			opacity: 0.55;
			transform: scaleX(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.complexity-gutter__spine--critical,
		.complexity-gutter__spine--critical::before,
		.complexity-gutter__spine--flash,
		.complexity-gutter__spine--flash::before,
		.complexity-gutter__score--critical,
		.complexity-gutter__score--flash {
			animation: none;
		}
	}

	/* Tooltip */
	.complexity-tooltip {
		position: fixed;
		z-index: 1000;
		min-width: 200px;
		max-width: 360px;
		padding: 12px;
		background: var(--ide-bg-secondary, #1a2744);
		border: 1px solid var(--ide-border, #a8c5d9);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		font-size: 12px;
		pointer-events: none;
	}

	.complexity-tooltip__header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.complexity-tooltip__badge {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 38px;
		height: 38px;
		font-size: 24px;
		font-weight: 700;
		color: var(--indicator-color);
		font-variant-numeric: tabular-nums;
	}

	.complexity-tooltip__heading {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.complexity-tooltip__title {
		font-weight: 600;
		color: var(--ide-text-primary, #f4f1e0);
	}

	.complexity-tooltip__source {
		font-size: 10px;
		color: var(--ide-text-muted, #a8c5d9);
	}

	.complexity-tooltip__lines {
		color: var(--ide-text-muted, #a8c5d9);
		font-size: 11px;
		margin-bottom: 8px;
	}

	.complexity-tooltip__contributions {
		list-style: none;
		margin: 0 0 8px;
		padding: 0;
		display: grid;
		gap: 3px;
	}

	.complexity-tooltip__contributions li {
		display: grid;
		grid-template-columns: 52px 34px minmax(0, 1fr);
		gap: 6px;
		align-items: baseline;
		font-size: 11px;
		color: var(--ide-text-secondary, #a8c5d9);
	}

	.complexity-tooltip__contributions strong {
		color: var(--ide-text-primary, #f4f1e0);
		font-variant-numeric: tabular-nums;
	}

	.complexity-tooltip__contributions .complexity-tooltip__more {
		display: block;
		color: var(--ide-text-muted, #a8c5d9);
		font-style: italic;
	}

	.complexity-tooltip__suggestion {
		padding: 8px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		color: var(--ide-text-secondary, #a8c5d9);
		line-height: 1.4;
		margin-bottom: 8px;
	}

	.complexity-tooltip__factors {
		display: flex;
		gap: 12px;
		font-size: 10px;
		color: var(--ide-text-muted, #a8c5d9);
	}

	.complexity-tooltip__factors span {
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 3px;
	}
</style>
