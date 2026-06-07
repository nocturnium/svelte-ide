<script lang="ts">
	/**
	 * Ghost Bracket Layer
	 *
	 * Visualizes ghost bracket suggestions from the BracketHealer.
	 * Shows semi-transparent brackets that can be accepted or dismissed.
	 */

	import type { BracketHealer, GhostBracket, BracketMismatch } from './core/bracket-healer';
	import { onMount } from 'svelte';

	interface Props {
		/** Bracket healer instance */
		healer: BracketHealer;
		/** Line height in pixels */
		lineHeight: number;
		/** Character width in pixels */
		charWidth: number;
		/** Gutter width offset */
		gutterWidth?: number;
		/** Whether enabled */
		enabled?: boolean;
		/** Callback when ghost is accepted */
		onAcceptGhost?: (ghost: GhostBracket) => void;
	}

	let {
		healer,
		lineHeight,
		charWidth,
		gutterWidth = 50,
		enabled = true,
		onAcceptGhost
	}: Props = $props();

	let ghosts = $state<GhostBracket[]>([]);
	let mismatches = $state<BracketMismatch[]>([]);
	let hoveredGhost = $state<GhostBracket | null>(null);

	// Subscribe to healer state
	onMount(() => {
		const state = healer.getState();
		ghosts = state.ghosts.filter((g) => !g.dismissed);
		mismatches = state.mismatches;

		const unsubscribe = healer.subscribe((newState) => {
			ghosts = newState.ghosts.filter((g) => !g.dismissed);
			mismatches = newState.mismatches;
		});

		return unsubscribe;
	});

	/**
	 * Get position style for a ghost bracket
	 */
	function getGhostStyle(ghost: GhostBracket): string {
		const top = ghost.position.line * lineHeight;
		const left = gutterWidth + ghost.position.column * charWidth;
		return `top: ${top}px; left: ${left}px;`;
	}

	/**
	 * Get position style for a mismatch marker
	 */
	function getMismatchStyle(mismatch: BracketMismatch): string {
		const top = mismatch.position.line * lineHeight;
		const left = gutterWidth + mismatch.position.column * charWidth;
		return `top: ${top}px; left: ${left}px;`;
	}

	/**
	 * Get connector line between ghost and its match
	 */
	function getConnectorStyle(ghost: GhostBracket): string | null {
		const fromLine = ghost.matchPosition.line;
		const toLine = ghost.position.line;

		if (fromLine === toLine) return null; // Same line, no connector needed

		const top = Math.min(fromLine, toLine) * lineHeight + lineHeight / 2;
		const height = Math.abs(toLine - fromLine) * lineHeight;
		const left = gutterWidth + ghost.matchPosition.column * charWidth + charWidth / 2;

		return `top: ${top}px; left: ${left}px; height: ${height}px;`;
	}

	/**
	 * Accept a ghost bracket
	 */
	function handleAccept(ghost: GhostBracket, e: MouseEvent) {
		e.stopPropagation();
		const accepted = healer.acceptGhost(ghost.id);
		if (accepted) {
			onAcceptGhost?.(accepted);
		}
	}

	/**
	 * Dismiss a ghost bracket
	 */
	function handleDismiss(ghost: GhostBracket, e: MouseEvent) {
		e.stopPropagation();
		healer.dismissGhost(ghost.id);
	}

	/**
	 * Get color for confidence level
	 */
	function getConfidenceColor(confidence: number): string {
		if (confidence >= 0.85) return '#22c55e'; // green
		if (confidence >= 0.7) return '#eab308'; // yellow
		return '#f59e0b'; // amber
	}

	/**
	 * Get severity color
	 */
	function getSeverityColor(severity: BracketMismatch['severity']): string {
		switch (severity) {
			case 'error':
				return '#ef4444';
			case 'warning':
				return '#f59e0b';
			default:
				return '#6b7280';
		}
	}
</script>

{#if enabled}
	<div class="ghost-bracket-layer" aria-hidden="true">
		<!-- Ghost bracket suggestions -->
		{#each ghosts as ghost (ghost.id)}
			{@const color = getConfidenceColor(ghost.confidence)}
			{@const connectorStyle = getConnectorStyle(ghost)}

			<!-- Connector line to matching bracket -->
			{#if connectorStyle && hoveredGhost?.id === ghost.id}
				<div class="ghost-connector" style="{connectorStyle} --ghost-color: {color};">
					<div class="ghost-connector__line"></div>
				</div>
			{/if}

			<!-- Ghost bracket marker -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="ghost-bracket"
				role="tooltip"
				style="{getGhostStyle(ghost)} --ghost-color: {color};"
				onmouseenter={() => (hoveredGhost = ghost)}
				onmouseleave={() => (hoveredGhost = null)}
			>
				<!-- The ghost character -->
				<span class="ghost-bracket__char">{ghost.character}</span>

				<!-- Confidence indicator -->
				<div class="ghost-bracket__confidence">
					{Math.round(ghost.confidence * 100)}%
				</div>

				<!-- Actions popup -->
				{#if hoveredGhost?.id === ghost.id}
					<div class="ghost-bracket__popup">
						<div class="ghost-bracket__reason">
							{ghost.reason}
						</div>
						<div class="ghost-bracket__actions">
							<button
								class="ghost-bracket__btn ghost-bracket__btn--accept"
								onclick={(e) => handleAccept(ghost, e)}
								title="Accept suggestion (Tab)"
							>
								Insert
							</button>
							<button
								class="ghost-bracket__btn ghost-bracket__btn--dismiss"
								onclick={(e) => handleDismiss(ghost, e)}
								title="Dismiss suggestion (Esc)"
							>
								Dismiss
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/each}

		<!-- Bracket mismatch markers -->
		{#each mismatches as mismatch}
			{@const color = getSeverityColor(mismatch.severity)}
			<div
				class="bracket-mismatch bracket-mismatch--{mismatch.issue}"
				style="{getMismatchStyle(mismatch)} --mismatch-color: {color};"
				title="{mismatch.issue === 'unclosed'
					? `Unclosed '${mismatch.character}'`
					: mismatch.issue === 'unexpected'
						? `Unexpected '${mismatch.character}'`
						: `Expected '${mismatch.expected}' but found '${mismatch.character}'`}"
			>
				<span class="bracket-mismatch__underline"></span>
				{#if mismatch.issue === 'mismatched' && mismatch.expected}
					<span class="bracket-mismatch__expected">{mismatch.expected}?</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.ghost-bracket-layer {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 5;
	}

	/* Ghost bracket */
	.ghost-bracket {
		position: absolute;
		pointer-events: auto;
		cursor: pointer;
	}

	.ghost-bracket__char {
		display: inline-block;
		font-family: inherit;
		font-size: inherit;
		color: var(--ghost-color);
		opacity: 0.5;
		animation: ghost-pulse 2s ease-in-out infinite;
	}

	@keyframes ghost-pulse {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 0.3;
		}
	}

	.ghost-bracket:hover .ghost-bracket__char {
		opacity: 0.8;
		animation: none;
	}

	.ghost-bracket__confidence {
		position: absolute;
		top: -16px;
		left: 0;
		padding: 1px 4px;
		background: rgba(0, 0, 0, 0.7);
		color: var(--ghost-color);
		font-size: 9px;
		font-family: monospace;
		border-radius: 3px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.ghost-bracket:hover .ghost-bracket__confidence {
		opacity: 1;
	}

	.ghost-bracket__popup {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		padding: 8px;
		background: var(--color-surface, #1e1e2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		min-width: 140px;
		z-index: 100;
	}

	.ghost-bracket__reason {
		font-size: 11px;
		color: var(--color-text-secondary, #aaa);
		margin-bottom: 8px;
		line-height: 1.3;
	}

	.ghost-bracket__actions {
		display: flex;
		gap: 6px;
	}

	.ghost-bracket__btn {
		flex: 1;
		padding: 4px 8px;
		border: none;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.ghost-bracket__btn--accept {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
	}

	.ghost-bracket__btn--accept:hover {
		background: rgba(34, 197, 94, 0.3);
	}

	.ghost-bracket__btn--dismiss {
		background: rgba(239, 68, 68, 0.2);
		color: #ef4444;
	}

	.ghost-bracket__btn--dismiss:hover {
		background: rgba(239, 68, 68, 0.3);
	}

	/* Connector line */
	.ghost-connector {
		position: absolute;
		pointer-events: none;
	}

	.ghost-connector__line {
		width: 1px;
		height: 100%;
		background: linear-gradient(
			to bottom,
			var(--ghost-color),
			transparent 20%,
			transparent 80%,
			var(--ghost-color)
		);
		opacity: 0.4;
	}

	/* Bracket mismatch markers */
	.bracket-mismatch {
		position: absolute;
		pointer-events: auto;
	}

	.bracket-mismatch__underline {
		position: absolute;
		bottom: 2px;
		left: 0;
		width: 8px;
		height: 2px;
		background: var(--mismatch-color);
		border-radius: 1px;
	}

	.bracket-mismatch--unclosed .bracket-mismatch__underline {
		animation: mismatch-blink 1s ease-in-out infinite;
	}

	@keyframes mismatch-blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.bracket-mismatch__expected {
		position: absolute;
		top: -14px;
		left: 0;
		padding: 1px 3px;
		background: var(--mismatch-color);
		color: #fff;
		font-size: 9px;
		font-family: monospace;
		border-radius: 2px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.bracket-mismatch:hover .bracket-mismatch__expected {
		opacity: 1;
	}
</style>
