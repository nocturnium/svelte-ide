<script lang="ts">
	/**
	 * Complexity Layer
	 *
	 * Shows complexity indicators in the gutter area only.
	 * No background highlighting - keeps editing area clean.
	 * Hover over gutter indicators for details.
	 */

	import { SvelteMap } from 'svelte/reactivity';
	import type { ComplexityMetrics, ComplexityRegion } from './core/complexity-analyzer';

	interface Props {
		/** Complexity metrics for the current document */
		metrics: ComplexityMetrics | null;
		/** Line height in pixels */
		lineHeight: number;
		/** Gutter width in pixels */
		gutterWidth?: number;
		/** Minimum score to show indicators (default: 50) */
		minScore?: number;
		/** Whether indicators are enabled */
		enabled?: boolean;
	}

	let { metrics, lineHeight, gutterWidth = 50, minScore = 50, enabled = true }: Props = $props();

	// Filter regions that exceed the threshold
	let highlightedRegions = $derived(
		enabled && metrics ? metrics.regions.filter((r) => r.score >= minScore) : []
	);

	// Expand regions to individual line indicators for gutter
	let lineIndicators = $derived.by(() => {
		if (!enabled || !metrics) return [];

		const indicators: Array<{
			line: number;
			score: number;
			region: ComplexityRegion;
			isStart: boolean;
			isEnd: boolean;
		}> = [];

		for (const region of highlightedRegions) {
			for (let line = region.startLine; line <= region.endLine; line++) {
				indicators.push({
					line,
					score: region.score,
					region,
					isStart: line === region.startLine,
					isEnd: line === region.endLine
				});
			}
		}

		return indicators;
	});

	// Group by line (in case of overlapping regions, take highest score)
	let lineScores = $derived.by(() => {
		const scores = new SvelteMap<
			number,
			{ score: number; region: ComplexityRegion; isStart: boolean; isEnd: boolean }
		>();

		for (const indicator of lineIndicators) {
			const existing = scores.get(indicator.line);
			if (!existing || indicator.score > existing.score) {
				scores.set(indicator.line, {
					score: indicator.score,
					region: indicator.region,
					isStart: indicator.isStart,
					isEnd: indicator.isEnd
				});
			}
		}

		return scores;
	});

	/**
	 * Get the color based on score level
	 */
	function getColor(score: number): string {
		if (score >= 85) return '#ef4444'; // Critical - red
		if (score >= 70) return '#f59e0b'; // High - orange
		return '#3b82f6'; // Medium - blue
	}

	/**
	 * Get opacity based on score
	 */
	function getOpacity(score: number): number {
		const normalized = Math.min(1, Math.max(0, (score - minScore) / (100 - minScore)));
		return 0.4 + normalized * 0.6;
	}

	let hoveredRegion = $state<ComplexityRegion | null>(null);
	let tooltipPosition = $state({ top: 0, left: 0 });

	function handleMouseEnter(region: ComplexityRegion, event: MouseEvent) {
		hoveredRegion = region;
		const rect = (event.target as HTMLElement).getBoundingClientRect();
		tooltipPosition = {
			top: rect.top + window.scrollY,
			left: rect.right + 8
		};
	}

	function handleMouseLeave() {
		hoveredRegion = null;
	}
</script>

{#if enabled && lineScores.size > 0}
	<div class="complexity-gutter" aria-hidden="true" style="width: {gutterWidth}px;">
		{#each [...lineScores.entries()] as [line, data] (line)}
			<div
				class="complexity-gutter__indicator"
				class:complexity-gutter__indicator--start={data.isStart}
				class:complexity-gutter__indicator--end={data.isEnd}
				style="
					top: {line * lineHeight}px;
					height: {lineHeight}px;
					--indicator-color: {getColor(data.score)};
					--indicator-opacity: {getOpacity(data.score)};
				"
				onmouseenter={(e) => handleMouseEnter(data.region, e)}
				onmouseleave={handleMouseLeave}
				role="button"
				tabindex="-1"
			>
				{#if data.isStart}
					<span class="complexity-gutter__score">{data.score}</span>
				{/if}
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
				<span class="complexity-tooltip__badge" style="background: {getColor(hoveredRegion.score)}">
					{hoveredRegion.score}
				</span>
				<span class="complexity-tooltip__title">
					{hoveredRegion.name || hoveredRegion.type}
				</span>
			</div>
			<div class="complexity-tooltip__lines">
				Lines {hoveredRegion.startLine + 1} - {hoveredRegion.endLine + 1}
			</div>
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
		bottom: 0;
		pointer-events: none;
		z-index: 5;
		overflow: hidden;
	}

	.complexity-gutter__indicator {
		position: absolute;
		right: 2px;
		width: 4px;
		pointer-events: auto;
		cursor: help;
		background: var(--indicator-color);
		opacity: var(--indicator-opacity);
		transition:
			opacity 0.15s ease,
			width 0.15s ease;
	}

	.complexity-gutter__indicator:hover {
		opacity: 1;
		width: 6px;
	}

	.complexity-gutter__indicator--start {
		border-radius: 2px 2px 0 0;
	}

	.complexity-gutter__indicator--end {
		border-radius: 0 0 2px 2px;
	}

	.complexity-gutter__indicator--start.complexity-gutter__indicator--end {
		border-radius: 2px;
	}

	.complexity-gutter__score {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 9px;
		font-weight: 700;
		color: var(--indicator-color);
		opacity: 0;
		transition: opacity 0.15s ease;
		pointer-events: none;
	}

	.complexity-gutter__indicator:hover .complexity-gutter__score {
		opacity: 1;
	}

	/* Tooltip */
	.complexity-tooltip {
		position: fixed;
		z-index: 1000;
		min-width: 200px;
		max-width: 300px;
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
		width: 28px;
		height: 28px;
		border-radius: 50%;
		font-size: 11px;
		font-weight: 700;
		color: #fff;
	}

	.complexity-tooltip__title {
		font-weight: 600;
		color: var(--ide-text-primary, #f4f1e0);
	}

	.complexity-tooltip__lines {
		color: var(--ide-text-muted, #a8c5d9);
		font-size: 11px;
		margin-bottom: 8px;
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
