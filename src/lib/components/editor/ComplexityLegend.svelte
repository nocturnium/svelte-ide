<script lang="ts">
	import { COGNITIVE_COMPLEXITY_BANDS } from './core/complexity-analyzer';

	interface Props {
		/** Compact single-line form, for placing beside an editor. */
		compact?: boolean;
		/** Extra class on the root. */
		class?: string;
	}

	let { compact = false, class: className = '' }: Props = $props();

	// Widths mirror ComplexityLayer.getSpineWidth so the key is the mark, not an
	// approximation of it — the previous demo legend was hand-authored swatches
	// that had drifted from what the overlay actually painted.
	const bands = [
		{
			label: 'Simple',
			range: `0–${COGNITIVE_COMPLEXITY_BANDS.medium - 1}`,
			color: 'transparent',
			width: 0
		},
		{
			label: 'Moderate',
			range: `${COGNITIVE_COMPLEXITY_BANDS.medium}–${COGNITIVE_COMPLEXITY_BANDS.high - 1}`,
			color: 'var(--ide-complexity-medium)',
			width: 2
		},
		{
			label: 'Complex',
			range: `${COGNITIVE_COMPLEXITY_BANDS.high}–${COGNITIVE_COMPLEXITY_BANDS.critical - 1}`,
			color: 'var(--ide-complexity-high)',
			width: 3
		},
		{
			label: 'Refactor',
			range: `${COGNITIVE_COMPLEXITY_BANDS.critical}+`,
			color: 'var(--ide-complexity-critical)',
			width: 5
		}
	];
</script>

<div class="complexity-legend {compact ? 'complexity-legend--compact' : ''} {className}">
	<span class="complexity-legend__unit">
		Cognitive complexity<span class="complexity-legend__arrow" aria-hidden="true">→</span>
	</span>
	<ul class="complexity-legend__bands">
		{#each bands as band (band.label)}
			<li class="complexity-legend__band">
				<span
					class="complexity-legend__mark"
					style="background: {band.color}; width: {band.width || 2}px; opacity: {band.width
						? 1
						: 0.25};"
					aria-hidden="true"
				></span>
				<span class="complexity-legend__label">{band.label}</span>
				<span class="complexity-legend__range">{band.range}</span>
			</li>
		{/each}
	</ul>
	{#if !compact}
		<p class="complexity-legend__note">
			Higher is harder to hold in your head. The <strong>Refactor</strong> band starts at
			{COGNITIVE_COMPLEXITY_BANDS.critical}, SonarSource's default threshold for a function that has
			grown too complex to keep. The number is unbounded — a function at 113 reports 113.
		</p>
	{/if}
</div>

<style>
	.complexity-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ide-spacing-sm, 8px) var(--ide-spacing-md, 12px);
		font-size: 11px;
		color: var(--ide-text-muted, #8b9bb4);
	}

	.complexity-legend__unit {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--ide-text-secondary, #a8c5d9);
		white-space: nowrap;
	}

	.complexity-legend__arrow {
		opacity: 0.5;
	}

	.complexity-legend__bands {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ide-spacing-md, 12px);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.complexity-legend__band {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		white-space: nowrap;
	}

	/* The key IS the mark: same colour and same thickness the overlay draws, so
	   band severity is legible from width alone if colour is unavailable. */
	.complexity-legend__mark {
		display: inline-block;
		height: 13px;
		border-radius: 999px;
		flex: none;
	}

	.complexity-legend__label {
		color: var(--ide-text-secondary, #a8c5d9);
	}

	.complexity-legend__range {
		font-variant-numeric: tabular-nums;
		opacity: 0.72;
	}

	.complexity-legend__note {
		flex-basis: 100%;
		margin: 0;
		max-width: 68ch;
		line-height: 1.5;
	}

	.complexity-legend--compact {
		gap: 10px;
	}

	/* Ranges stay visible even when compact: they are what ties the "15 cc" chip on
	   the code to the band names here. Without them the legend names four moods
	   and explains nothing. */
	.complexity-legend--compact .complexity-legend__bands {
		gap: 10px;
	}

	.complexity-legend--compact .complexity-legend__band {
		gap: 4px;
	}

	@media (max-width: 560px) {
		.complexity-legend__unit .complexity-legend__arrow {
			display: none;
		}
	}
</style>
