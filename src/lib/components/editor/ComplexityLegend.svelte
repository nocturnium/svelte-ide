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
			width: 2,
			hollow: true
		},
		{
			label: 'Moderate',
			range: `${COGNITIVE_COMPLEXITY_BANDS.medium}–${COGNITIVE_COMPLEXITY_BANDS.high - 1}`,
			color: 'var(--ide-complexity-medium)',
			width: 2,
			hollow: false
		},
		{
			label: 'Complex',
			range: `${COGNITIVE_COMPLEXITY_BANDS.high}–${COGNITIVE_COMPLEXITY_BANDS.critical - 1}`,
			color: 'var(--ide-complexity-high)',
			width: 3,
			hollow: false
		},
		{
			label: 'Refactor',
			range: `${COGNITIVE_COMPLEXITY_BANDS.critical}+`,
			color: 'var(--ide-complexity-critical)',
			width: 5,
			hollow: false
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
				<span class="complexity-legend__slot" aria-hidden="true">
					<span
						class="complexity-legend__mark"
						class:complexity-legend__mark--hollow={band.hollow}
						style="background: {band.color}; width: {6 + band.width * 2}px;"
					></span>
				</span>
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
		gap: var(--ide-spacing-sm, 8px) var(--ide-spacing-lg, 20px);
		font-size: 12px;
		/* --ide-text-muted is a 60%-alpha colour; at 11px the labels measured ~4.1:1
		   and the ranges, which stacked a further 0.72 opacity, ~2.8:1. The ranges
		   are the only thing tying the chip's number to a band name, so they were
		   the least legible pixels in the frame. Full-strength secondary, 12px. */
		color: var(--ide-text-secondary, #a8c5d9);
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
		/* >= 20px so a 2px mark cannot read as a delimiter between two labels. */
		gap: var(--ide-spacing-lg, 20px);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.complexity-legend__band {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		white-space: nowrap;
	}

	/* Fixed-width slot so all four labels start on the same x whatever their mark
	   measures. */
	.complexity-legend__slot {
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		width: 18px;
		flex: none;
	}

	/* The mark encodes the band by SIZE as well as colour (WCAG 1.4.1), but it is
	   laid on its side. A 2px x 14px vertical bar is parsed as a delimiter at any
	   gap — the earlier form rendered as `Simple 0-4 | Moderate 5-9 |` and read as
	   pipe-separated text. Horizontal pills cannot be mistaken for punctuation,
	   and width still carries the ordinal. */
	.complexity-legend__mark {
		display: inline-block;
		height: 4px;
		border-radius: 999px;
		flex: none;
	}

	/* Simple has no painted mark in the editor, so the key states the absence
	   rather than rendering nothing and leaving one row unaligned. A dash pattern
	   cannot resolve at this size, so it is an outline instead. */
	.complexity-legend__mark--hollow {
		background: transparent !important;
		height: 0;
		border-top: 1px solid color-mix(in srgb, var(--ide-text-secondary) 45%, transparent);
	}

	.complexity-legend__label {
		color: var(--ide-text-secondary, #a8c5d9);
	}

	.complexity-legend__range {
		font-variant-numeric: tabular-nums;
		color: var(--ide-text-secondary, #a8c5d9);
	}

	/* flex-shrink: 0 matters — without it the paragraph collapsed onto the bands'
	   row instead of taking its own line, rendering as a cramped column jammed
	   against the last chip. */
	.complexity-legend__note {
		flex: 0 0 100%;
		margin: 0;
		max-width: 68ch;
		line-height: 1.5;
	}

	.complexity-legend--compact {
		gap: 6px 16px;
		font-size: 11.5px;
	}

	/* The compact variant does NOT reopen the delimiter problem: it previously
	   overrode the gap back to 10px, on the homepage, which is the surface the rule
	   was written for. It trims the wrapper instead. */
	.complexity-legend--compact .complexity-legend__band {
		gap: 6px;
	}

	.complexity-legend--compact .complexity-legend__slot {
		width: 16px;
	}

	@media (max-width: 560px) {
		.complexity-legend__unit .complexity-legend__arrow {
			display: none;
		}
	}
</style>
