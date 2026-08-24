<script lang="ts">
	/**
	 * Cognitive Load Meter
	 *
	 * A status bar component that displays real-time code complexity metrics.
	 * Shows an animated gauge with color-coded levels and optional tooltip details.
	 */

	import {
		COGNITIVE_COMPLEXITY_BANDS,
		getComplexityBandLabel,
		type ComplexityMetrics
	} from './core/complexity-analyzer';

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
	// The headline is the hottest region's raw Cognitive Complexity, not the
	// deprecated `overall`: that one is a region-length-weighted mean, so padding a
	// file with simple functions dragged it down while the hard code sat untouched.
	let cognitiveComplexity = $derived(metrics?.maxCognitiveComplexity ?? 0);
	let level = $derived(metrics?.level ?? 'low');

	// Dedicated complexity ramp — never the semantic error/warning/info/success
	// tokens, which are all syntax-token colours in the editor this sits beside.
	let levelColor = $derived(
		level === 'critical'
			? 'var(--ide-complexity-critical, #d4664a)'
			: level === 'high'
				? 'var(--ide-complexity-high, #c9944a)'
				: level === 'medium'
					? 'var(--ide-complexity-medium, #4d9db0)'
					: 'var(--ide-text-muted, #8b9bb4)'
	);

	let levelLabel = $derived(getComplexityBandLabel(level));

	/**
	 * Gauge fill, on a scale that keeps moving past the refactor threshold.
	 *
	 * An unbounded metric cannot fill a percentage bar. Scaling to the threshold
	 * pegged it at 100% in every state this library actually ships — the hero at 16
	 * and the demo at 113 both rendered a full bar — which is the saturation bug the
	 * number itself was just freed from, relocated into the graphic. The scale now
	 * doubles once the threshold is passed, so the bar keeps saying something, and
	 * a tick marks where the threshold sits.
	 */
	let gaugeMax = $derived(
		cognitiveComplexity <= COGNITIVE_COMPLEXITY_BANDS.critical
			? COGNITIVE_COMPLEXITY_BANDS.critical
			: Math.pow(
					2,
					Math.ceil(Math.log2(cognitiveComplexity / COGNITIVE_COMPLEXITY_BANDS.critical))
				) * COGNITIVE_COMPLEXITY_BANDS.critical
	);
	let thresholdProgress = $derived(
		Math.min(100, Math.round((cognitiveComplexity / gaugeMax) * 100))
	);
	let thresholdMarkPercent = $derived(
		Math.round((COGNITIVE_COMPLEXITY_BANDS.critical / gaugeMax) * 100)
	);

	let highComplexityRegions = $derived(
		metrics?.regions.filter((r) => r.cognitiveComplexity >= COGNITIVE_COMPLEXITY_BANDS.medium) ?? []
	);

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
	aria-valuenow={cognitiveComplexity}
	aria-valuemin={0}
	aria-valuemax={gaugeMax}
	aria-label="Cognitive complexity {cognitiveComplexity}, {levelLabel}. Refactor threshold {COGNITIVE_COMPLEXITY_BANDS.critical}."
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
			style="width: {thresholdProgress}%; background-color: {levelColor}"
			class:cognitive-meter__fill--animated={level === 'critical'}
		></div>
		<!-- Where the refactor threshold falls on the current scale. -->
		<div
			class="cognitive-meter__threshold"
			style="left: {thresholdMarkPercent}%"
			aria-hidden="true"
		></div>
	</div>

	<!-- Score value -->
	<span class="cognitive-meter__value" style="color: {levelColor}">
		{cognitiveComplexity}<span class="cognitive-meter__unit">cc</span>
	</span>

	<!-- Tooltip -->
	{#if showTooltip && metrics}
		<div class="cognitive-meter__tooltip">
			<div class="cognitive-meter__tooltip-header">
				<span class="cognitive-meter__tooltip-title">Cognitive Complexity</span>
				<span class="cognitive-meter__tooltip-score" style="color: {levelColor}">
					{cognitiveComplexity} cc ({levelLabel})
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
									{region.cognitiveComplexity}
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

<!-- Always-available screen-reader equivalent of the visual, hover-only per-region
     complexity breakdown. The overlay and the hover tooltip are sighted-only, so this
     carries the same data to assistive technology.

     role="status" (polite) because the whole point of the feature is that the number
     moves as you type: without it, editing announced only "Line 1, Column 1" from the
     cursor status while complexity went from Refactor to Simple in silence. Reports
     raw Cognitive Complexity, never the deprecated "out of 100" score, which saturated
     and implied a percentage it never was.

     Rendered whenever `metrics` exists, NOT only while high-complexity regions
     remain. Gating on that unmounted the region the moment the last one dropped
     below Moderate, so the one announcement most worth hearing — you fixed it —
     was the only one that never fired. -->
{#if metrics}
	<div class="cognitive-meter__sr-only" role="status" aria-live="polite">
		Hottest function cognitive complexity {metrics.maxCognitiveComplexity}, {levelLabel}. Refactor
		threshold is {COGNITIVE_COMPLEXITY_BANDS.critical}.
		{#if highComplexityRegions.length > 0}
			{highComplexityRegions.length}
			{highComplexityRegions.length === 1 ? 'region' : 'regions'} at or above Moderate:
			{#each highComplexityRegions.slice(0, 8) as region (region.startLine)}
				{region.name || `${region.type} at line ${region.startLine + 1}`}, cognitive complexity
				{region.cognitiveComplexity}.
			{/each}
		{:else}
			No regions above the Simple band.
		{/if}
	</div>
{/if}

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
		outline: 2px solid var(--ide-interactive-focus, #60a5fa);
		outline-offset: 2px;
	}

	.cognitive-meter__icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.cognitive-meter__gauge {
		position: relative;
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

	/* The only complexity component that lacked this guard, while its seven
	   siblings all had one — and it is the one that pulses INFINITELY, in the
	   default state of the flagship demo. */
	@media (prefers-reduced-motion: reduce) {
		.cognitive-meter__fill--animated {
			animation: none;
		}
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
		background-color: var(--ide-bg-secondary, #1a2744);
		border: 1px solid var(--ide-border, #a8c5d9);
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
		border-top-color: var(--ide-border, #a8c5d9);
	}

	.cognitive-meter__tooltip-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--ide-border, #a8c5d9);
	}

	.cognitive-meter__tooltip-title {
		font-weight: 600;
		color: var(--ide-text-primary, #f4f1e0);
	}

	.cognitive-meter__threshold {
		position: absolute;
		top: -1px;
		bottom: -1px;
		width: 1px;
		background: var(--ide-text-secondary, #a8c5d9);
		opacity: 0.55;
	}

	.cognitive-meter__unit {
		margin-left: 2px;
		font-size: 0.72em;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0.75;
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
		color: var(--ide-text-muted, #a8c5d9);
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
		color: var(--ide-text-primary, #f4f1e0);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 200px;
	}

	.cognitive-meter__tooltip-region-score {
		color: var(--ide-warning, #facc15);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.cognitive-meter__tooltip-more {
		color: var(--ide-text-muted, #a8c5d9);
		font-style: italic;
	}

	.cognitive-meter__tooltip-suggestion {
		margin: 4px 0 0;
		padding: 6px 8px;
		background-color: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		font-size: 11px;
		color: var(--ide-text-muted, #a8c5d9);
		line-height: 1.4;
	}

	/* Visually hidden, but exposed to assistive technology. */
	.cognitive-meter__sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
