<script lang="ts">
	/**
	 * Cognitive Load Meter
	 *
	 * A status bar component that displays real-time code complexity metrics.
	 * Shows an animated gauge with color-coded levels and optional tooltip details.
	 */

	import type { ComplexityMetrics } from './core/complexity-analyzer';

	interface Props {
		/** Current complexity metrics */
		metrics: ComplexityMetrics | null;
		/** Whether to show detailed tooltip on hover */
		showDetails?: boolean;
		/** Callback when clicked */
		onclick?: () => void;
	}

	let { metrics, showDetails = true, onclick }: Props = $props();

	let showTooltip = $state(false);

	// Derived values
	let score = $derived(metrics?.overall ?? 0);
	let level = $derived(metrics?.level ?? 'low');

	let levelColor = $derived(
		level === 'critical'
			? 'var(--color-error, #ef4444)'
			: level === 'high'
				? 'var(--color-warning, #f59e0b)'
				: level === 'medium'
					? 'var(--color-info, #3b82f6)'
					: 'var(--color-success, #22c55e)'
	);

	let levelLabel = $derived(
		level === 'critical'
			? 'Critical'
			: level === 'high'
				? 'High'
				: level === 'medium'
					? 'Medium'
					: 'Low'
	);

	let highComplexityRegions = $derived(metrics?.regions.filter((r) => r.score >= 50) ?? []);

	function handleMouseEnter() {
		if (showDetails) {
			showTooltip = true;
		}
	}

	function handleMouseLeave() {
		showTooltip = false;
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="cognitive-meter"
	role={onclick ? 'button' : 'meter'}
	aria-valuenow={score}
	aria-valuemin={0}
	aria-valuemax={100}
	aria-label="Code complexity: {score} out of 100, {levelLabel} complexity"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	{onclick}
	onkeydown={(e) => e.key === 'Enter' && onclick?.()}
	tabindex={onclick ? 0 : -1}
>
	<!-- Brain icon -->
	<div class="cognitive-meter__icon" style="color: {levelColor}">
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path
				d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"
			/>
			<path
				d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"
			/>
		</svg>
	</div>

	<!-- Gauge bar -->
	<div class="cognitive-meter__gauge">
		<div
			class="cognitive-meter__fill"
			style="width: {score}%; background-color: {levelColor}"
			class:cognitive-meter__fill--animated={level === 'critical'}
		></div>
	</div>

	<!-- Score value -->
	<span class="cognitive-meter__value" style="color: {levelColor}">
		{score}
	</span>

	<!-- Tooltip -->
	{#if showTooltip && metrics}
		<div class="cognitive-meter__tooltip">
			<div class="cognitive-meter__tooltip-header">
				<span class="cognitive-meter__tooltip-title">Cognitive Complexity</span>
				<span class="cognitive-meter__tooltip-score" style="color: {levelColor}">
					{score}/100 ({levelLabel})
				</span>
			</div>

			{#if highComplexityRegions.length > 0}
				<div class="cognitive-meter__tooltip-section">
					<span class="cognitive-meter__tooltip-label">High complexity regions:</span>
					<ul class="cognitive-meter__tooltip-list">
						{#each highComplexityRegions.slice(0, 5) as region (region.startLine)}
							<li>
								<span class="cognitive-meter__tooltip-region-name">
									{region.name || `${region.type} at line ${region.startLine + 1}`}
								</span>
								<span class="cognitive-meter__tooltip-region-score">
									{region.score}
								</span>
							</li>
						{/each}
						{#if highComplexityRegions.length > 5}
							<li class="cognitive-meter__tooltip-more">
								+{highComplexityRegions.length - 5} more regions
							</li>
						{/if}
					</ul>
				</div>
			{/if}

			{#if metrics.regions.some((r) => r.suggestion)}
				<div class="cognitive-meter__tooltip-section">
					<span class="cognitive-meter__tooltip-label">Suggestions:</span>
					{#each metrics.regions
						.filter((r) => r.suggestion)
						.slice(0, 2) as region (region.startLine)}
						<p class="cognitive-meter__tooltip-suggestion">
							{region.suggestion}
						</p>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.cognitive-meter {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 8px;
		border-radius: 4px;
		cursor: default;
		position: relative;
		font-size: 12px;
		transition: background-color 0.15s ease;
	}

	.cognitive-meter:hover {
		background-color: rgba(255, 255, 255, 0.1);
	}

	.cognitive-meter:focus-visible {
		outline: 2px solid var(--color-focus, #3b82f6);
		outline-offset: 2px;
	}

	.cognitive-meter__icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.cognitive-meter__gauge {
		width: 40px;
		height: 6px;
		background-color: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		overflow: hidden;
	}

	.cognitive-meter__fill {
		height: 100%;
		border-radius: 3px;
		transition:
			width 0.3s ease,
			background-color 0.3s ease;
	}

	.cognitive-meter__fill--animated {
		animation: pulse-critical 1.5s ease-in-out infinite;
	}

	@keyframes pulse-critical {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}

	.cognitive-meter__value {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		min-width: 20px;
		text-align: right;
	}

	/* Tooltip */
	.cognitive-meter__tooltip {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 8px;
		padding: 12px;
		background-color: var(--color-surface, #1e1e1e);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		min-width: 280px;
		max-width: 320px;
		z-index: 1000;
		pointer-events: none;
	}

	.cognitive-meter__tooltip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 6px solid transparent;
		border-top-color: var(--color-border, #333);
	}

	.cognitive-meter__tooltip-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--color-border, #333);
	}

	.cognitive-meter__tooltip-title {
		font-weight: 600;
		color: var(--color-text, #fff);
	}

	.cognitive-meter__tooltip-score {
		font-weight: 700;
	}

	.cognitive-meter__tooltip-section {
		margin-top: 8px;
	}

	.cognitive-meter__tooltip-label {
		display: block;
		font-size: 11px;
		color: var(--color-text-muted, #888);
		margin-bottom: 4px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.cognitive-meter__tooltip-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.cognitive-meter__tooltip-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 2px 0;
		font-size: 12px;
	}

	.cognitive-meter__tooltip-region-name {
		color: var(--color-text, #fff);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 200px;
	}

	.cognitive-meter__tooltip-region-score {
		color: var(--color-warning, #f59e0b);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.cognitive-meter__tooltip-more {
		color: var(--color-text-muted, #888);
		font-style: italic;
	}

	.cognitive-meter__tooltip-suggestion {
		margin: 4px 0 0;
		padding: 6px 8px;
		background-color: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		font-size: 11px;
		color: var(--color-text-muted, #aaa);
		line-height: 1.4;
	}
</style>
