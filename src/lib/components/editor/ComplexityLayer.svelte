<script lang="ts">
	/**
	 * Complexity Layer
	 *
	 * Gutter spine + score chip + explain-on-hover tooltip.
	 *
	 * The region plane itself is drawn by the sibling ComplexityHeatLayer; this
	 * layer never paints over code. (This docblock previously claimed there was no
	 * background highlighting at all, which contradicted the sibling component.)
	 */

	import {
		COGNITIVE_COMPLEXITY_BANDS,
		getComplexityRegionKey,
		getComplexityBandLabel,
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
		/**
		 * Full height of the scrollable content in pixels. The layer must span the
		 * whole document (not just one viewport) or indicators below the first
		 * screenful get clipped — which previously hid every high-complexity region
		 * that sat past the initial view.
		 */
		totalHeight?: number;
		/** Estimated full scrollable content width in pixels */
		contentWidth?: number;
		/**
		 * Lowest Cognitive Complexity that gets a mark. Raw Cognitive Complexity,
		 * not the deprecated 0-100 score.
		 */
		minCognitiveComplexity?: number;
		/** Visible width of the editor viewport, for anchoring the score chip. */
		viewportWidth?: number;
		/** Current horizontal scroll offset, for anchoring the score chip. */
		scrollLeft?: number;
		/**
		 * X coordinate, in content pixels, where a line's text ends. Used to place
		 * the chip on a row it will not cover.
		 */
		lineEndX?: (line: number) => number;
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
		minCognitiveComplexity = COGNITIVE_COMPLEXITY_BANDS.medium,
		viewportWidth = 0,
		scrollLeft = 0,
		lineEndX,
		enabled = true,
		flashRegionKey = '',
		lineToVisualRow = (line: number) => line
	}: Props = $props();

	let highlightedRegions = $derived(
		enabled && metrics
			? metrics.regions.filter((r) => r.cognitiveComplexity >= minCognitiveComplexity)
			: []
	);

	/**
	 * Band colour, from the dedicated complexity ramp.
	 *
	 * Never the semantic error/warning/info/success tokens: all four are already
	 * syntax-token colours in this same viewport, and --ide-error specifically is
	 * --editor-token-invalid, i.e. "this code does not parse". Complexity is a
	 * property of code that is perfectly valid.
	 */
	function getColor(level: ComplexityRegion['level']): string {
		if (level === 'critical') return 'var(--ide-complexity-critical)';
		if (level === 'high') return 'var(--ide-complexity-high)';
		return 'var(--ide-complexity-medium)';
	}

	/**
	 * Spine thickness in px — a second, non-colour channel for the band so
	 * severity survives colour blindness (WCAG 1.4.1). Previously the spine was a
	 * fixed 4px and the intended size redundancy (`--indicator-glow`) was computed
	 * but never referenced by any rule.
	 */
	function getSpineWidth(level: ComplexityRegion['level']): number {
		if (level === 'critical') return 5;
		if (level === 'high') return 3;
		return 2;
	}

	/**
	 * Horizontal position of the score chip, in the layer's content coordinates.
	 *
	 * Anchored to the VISIBLE viewport rather than to the scrollable content
	 * width. The chip used to be `right: 18px` inside a container sized to the
	 * full content width, so as soon as any line was longer than the viewport the
	 * chip was laid out past the right edge and the region's number silently
	 * disappeared until you scrolled sideways — reproducibly, at a 760px viewport
	 * on the demo page. Following scrollLeft keeps it pinned to the right of
	 * whatever is actually on screen.
	 */
	const CHIP_INSET = 18;
	// Widest rendered chip ("Refactor 113"); used to keep the right edge inside the
	// viewport rather than past the scrollable content width.
	const CHIP_WIDTH = 96;
	let badgeLeft = $derived(
		Math.max(
			gutterWidth + 8,
			(viewportWidth > 0 ? scrollLeft + viewportWidth : contentWidth) - CHIP_INSET - CHIP_WIDTH
		)
	);

	/**
	 * Which row inside the region the chip sits on.
	 *
	 * The chip is pinned to the right of the viewport, so on a narrow screen the
	 * region's first line — the signature — often runs straight underneath it: at
	 * 390px the hero rendered `triageLoa[Refactor 16]`, the badge covering the very
	 * function it measures. Rather than shrink or hide it, walk the region for the
	 * first row whose text ends clear of the chip. A closing brace or a short body
	 * line almost always qualifies, so the number stays full-size and legible and
	 * the code stays readable. Falls back to the first row when every line is long.
	 */
	function getChipRow(region: ComplexityRegion): number {
		if (!lineEndX) return region.startLine;
		const limit = badgeLeft - 10;
		for (let line = region.startLine; line <= region.endLine; line++) {
			if (lineEndX(line) < limit) return line;
		}
		return region.startLine;
	}

	let hoveredRegion = $state<ComplexityRegion | null>(null);
	let tooltipPosition = $state({ top: 0, left: 0, right: 0 });
	let tooltipAnchor = $state<'left' | 'right'>('right');
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

	function handleMouseEnter(
		region: ComplexityRegion,
		event: MouseEvent,
		anchor: 'left' | 'right' = 'right'
	) {
		hoveredRegion = region;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		tooltipAnchor = anchor;
		// The gutter spine opens the tooltip to its right (over the code); the score
		// badge sits at the right edge, so it opens to its left. Anchor the left case
		// by `right` (not a translateX) so the box grows leftward cleanly — translateX
		// could subpixel-clip the first glyph of the region name.
		tooltipPosition =
			anchor === 'right'
				? { top: rect.top, left: rect.right + 8, right: 0 }
				: { top: rect.top, left: 0, right: window.innerWidth - rect.left + 8 };
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
		{#each highlightedRegions as region (getComplexityRegionKey(region))}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="complexity-gutter__spine"
				class:complexity-gutter__spine--critical={region.level === 'critical'}
				class:complexity-gutter__spine--flash={flashRegionKey === getComplexityRegionKey(region)}
				style="
					top: {getRegionTop(region)}px;
					height: {getRegionHeight(region)}px;
					--indicator-color: {getColor(region.level)};
					--indicator-width: {getSpineWidth(region.level)}px;
				"
				onmouseenter={(e) => handleMouseEnter(region, e)}
				onmouseleave={handleMouseLeave}
			></div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="complexity-gutter__score"
				class:complexity-gutter__score--critical={region.level === 'critical'}
				class:complexity-gutter__score--flash={flashRegionKey === getComplexityRegionKey(region)}
				style="
					top: {lineToVisualRow(getChipRow(region)) * lineHeight + 3}px;
					left: {badgeLeft}px;
					--indicator-color: {getColor(region.level)};
				"
				onmouseenter={(e) => handleMouseEnter(region, e, 'left')}
				onmouseleave={handleMouseLeave}
			>
				<span class="complexity-gutter__score-band">{getComplexityBandLabel(region.level)}</span>
				<span class="complexity-gutter__score-value">{region.cognitiveComplexity}</span>
			</div>
		{/each}
	</div>

	<!-- Tooltip (positioned fixed to avoid clipping) -->
	{#if hoveredRegion}
		<div
			class="complexity-tooltip"
			style={tooltipAnchor === 'left'
				? `top: ${tooltipPosition.top}px; right: ${tooltipPosition.right}px;`
				: `top: ${tooltipPosition.top}px; left: ${tooltipPosition.left}px;`}
		>
			<div class="complexity-tooltip__header">
				<span class="complexity-tooltip__badge" style="color: {getColor(hoveredRegion.level)}">
					{hoveredRegion.cognitiveComplexity}
				</span>
				<div class="complexity-tooltip__heading">
					<span class="complexity-tooltip__title">
						{getComplexityBandLabel(hoveredRegion.level)} Cognitive Complexity
					</span>
					<span class="complexity-tooltip__source">SonarSource Cognitive Complexity metric</span>
				</div>
			</div>
			<div class="complexity-tooltip__lines">
				{hoveredRegion.name || hoveredRegion.type} · Lines {hoveredRegion.startLine + 1} - {hoveredRegion.endLine +
					1}
				· Refactor threshold {COGNITIVE_COMPLEXITY_BANDS.critical}
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
		width: var(--indicator-width, 2px);
		pointer-events: auto;
		cursor: help;
		background: var(--indicator-color);
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

	.complexity-gutter__score-value {
		font-weight: 700;
	}

	/* The verdict, always rendered. A bare number cannot say which direction is
	   worse, and "cc" alone reads as engine displacement to anyone who has not met
	   the metric. The band name is self-describing, and it is the word the legend
	   and the meter use for the same state. */
	.complexity-gutter__score-band {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.complexity-gutter__score {
		position: absolute;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 3px;
		min-width: 0;
		height: 22px;
		padding: 0 8px;
		border: 1px solid color-mix(in srgb, var(--indicator-color) 55%, transparent);
		border-radius: 999px;
		/* Opaque, and deliberately DARKER than --ide-bg-elevated. That token resolves
		   to rgb(49,61,87), not the #17203a this rule was originally reasoned
		   against, which left the band text at 3.0-4.1:1 — under AA, and a
		   regression from the old 22px chip that passed on the large-text bar. */
		background: #0f1729;
		color: var(--indicator-color);
		font-size: 12px;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		transform: scale(1);
		transform-origin: center;
		/* The badge is a primary hover target for the explain-on-hover tooltip,
		   not only the 4px spine. */
		pointer-events: auto;
		cursor: help;
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
