<script lang="ts">
	/**
	 * Conflict Zone Layer
	 *
	 * Visualizes potential conflict zones when multiple users
	 * are editing nearby regions. Shows warning indicators
	 * and participant avatars.
	 */

	import type { ConflictZone } from './core/conflict-predictor';

	interface Props {
		/** Conflict zones to display */
		zones: ConflictZone[];
		/** Line height in pixels */
		lineHeight: number;
		/** Gutter width in pixels */
		gutterWidth?: number;
		/** Whether to show participant indicators */
		showParticipants?: boolean;
		/** Whether enabled */
		enabled?: boolean;
		/** Callback when zone is clicked */
		onZoneClick?: (zone: ConflictZone) => void;
	}

	let {
		zones = [],
		lineHeight,
		gutterWidth = 50,
		showParticipants = true,
		enabled = true,
		onZoneClick
	}: Props = $props();

	let hoveredZone = $state<ConflictZone | null>(null);
	let tooltipPosition = $state({ top: 0, left: 0 });

	/**
	 * Get color for severity level
	 */
	function getSeverityColor(severity: ConflictZone['severity']): string {
		switch (severity) {
			case 'critical':
				return '#ef4444';
			case 'high':
				return '#f59e0b';
			case 'medium':
				return '#eab308';
			case 'low':
				return '#22c55e';
			default:
				return '#6b7280';
		}
	}

	/**
	 * Get opacity based on probability
	 */
	function getOpacity(probability: number): number {
		return 0.1 + probability * 0.3;
	}

	/**
	 * Get border opacity based on probability
	 */
	function getBorderOpacity(probability: number): number {
		return 0.3 + probability * 0.5;
	}

	function handleMouseEnter(zone: ConflictZone, event: MouseEvent) {
		hoveredZone = zone;
		const rect = (event.target as HTMLElement).getBoundingClientRect();
		tooltipPosition = {
			top: rect.top + window.scrollY,
			left: rect.right + 8
		};
	}

	function handleMouseLeave() {
		hoveredZone = null;
	}

	function handleClick(zone: ConflictZone) {
		onZoneClick?.(zone);
	}

	/**
	 * Get initials from name
	 */
	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	/**
	 * Get severity icon
	 */
	function getSeverityIcon(severity: ConflictZone['severity']): string {
		switch (severity) {
			case 'critical':
				return '\u{26A0}'; // Warning sign
			case 'high':
				return '\u{26A0}';
			case 'medium':
				return '\u{1F6C8}'; // Information
			case 'low':
				return '\u{1F465}'; // People
			default:
				return '\u{1F465}';
		}
	}
</script>

{#if enabled && zones.length > 0}
	<div class="conflict-zones" aria-hidden="true">
		{#each zones as zone (zone.id)}
			{@const color = getSeverityColor(zone.severity)}
			{@const height = (zone.endLine - zone.startLine + 1) * lineHeight}
			<div
				class="conflict-zone conflict-zone--{zone.severity}"
				style="
					top: {zone.startLine * lineHeight}px;
					height: {height}px;
					left: {gutterWidth}px;
					--zone-color: {color};
					--zone-opacity: {getOpacity(zone.probability)};
					--border-opacity: {getBorderOpacity(zone.probability)};
				"
				onmouseenter={(e) => handleMouseEnter(zone, e)}
				onmouseleave={handleMouseLeave}
				onclick={() => handleClick(zone)}
				onkeydown={(e) => e.key === 'Enter' && handleClick(zone)}
				role="button"
				tabindex={-1}
			>
				<!-- Gutter indicator -->
				<div
					class="conflict-zone__gutter"
					style="left: -{gutterWidth}px; width: {gutterWidth}px;"
				>
					<span class="conflict-zone__icon">{getSeverityIcon(zone.severity)}</span>
				</div>

				<!-- Participant avatars -->
				{#if showParticipants && zone.participants.length > 0}
					<div class="conflict-zone__participants">
						{#each zone.participants.slice(0, 3) as participant, i (participant.userId)}
							<div
								class="conflict-zone__avatar"
								class:conflict-zone__avatar--ai={participant.isAI}
								style="
									background: {participant.color};
									z-index: {10 - i};
								"
								title={participant.userName}
							>
								{#if participant.isAI}
									<span class="ai-icon">🤖</span>
								{:else}
									{getInitials(participant.userName)}
								{/if}
							</div>
						{/each}
						{#if zone.participants.length > 3}
							<div class="conflict-zone__avatar conflict-zone__avatar--more">
								+{zone.participants.length - 3}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Warning badge for high severity -->
				{#if zone.severity === 'critical' || zone.severity === 'high'}
					<div class="conflict-zone__warning">
						<span class="conflict-zone__warning-text">
							{Math.round(zone.probability * 100)}% conflict risk
						</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Tooltip -->
	{#if hoveredZone}
		<div
			class="conflict-tooltip"
			style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px;"
		>
			<div class="conflict-tooltip__header">
				<span
					class="conflict-tooltip__badge"
					style="background: {getSeverityColor(hoveredZone.severity)}"
				>
					{Math.round(hoveredZone.probability * 100)}%
				</span>
				<span class="conflict-tooltip__title">
					{hoveredZone.severity.charAt(0).toUpperCase() + hoveredZone.severity.slice(1)} Risk
				</span>
			</div>

			<div class="conflict-tooltip__region">
				{hoveredZone.semanticUnit}
			</div>

			<div class="conflict-tooltip__participants">
				{#each hoveredZone.participants as participant (participant.userId)}
					<div class="conflict-tooltip__participant">
						<span
							class="conflict-tooltip__dot"
							style="background: {participant.color}"
						></span>
						<span class="conflict-tooltip__name">
							{participant.userName}
							{#if participant.isAI}
								<span class="ai-badge">AI</span>
							{/if}
						</span>
						<span class="conflict-tooltip__line">Line {participant.cursorLine + 1}</span>
					</div>
				{/each}
			</div>

			{#if hoveredZone.suggestion}
				<div class="conflict-tooltip__suggestion">
					{hoveredZone.suggestion}
				</div>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.conflict-zones {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 4;
	}

	.conflict-zone {
		position: absolute;
		right: 0;
		background: linear-gradient(
			90deg,
			rgba(var(--zone-color-rgb, 239, 68, 68), var(--zone-opacity)),
			transparent
		);
		background-color: rgba(239, 68, 68, var(--zone-opacity));
		border-left: 3px solid rgba(239, 68, 68, var(--border-opacity));
		border-left-color: var(--zone-color);
		pointer-events: auto;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.conflict-zone:hover {
		background-color: rgba(239, 68, 68, calc(var(--zone-opacity) + 0.1));
	}

	.conflict-zone--critical {
		animation: conflict-pulse 2s ease-in-out infinite;
	}

	@keyframes conflict-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.conflict-zone__gutter {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 4px;
		pointer-events: none;
	}

	.conflict-zone__icon {
		font-size: 12px;
		opacity: 0.8;
	}

	.conflict-zone__participants {
		position: absolute;
		right: 8px;
		top: 4px;
		display: flex;
		gap: -8px;
	}

	.conflict-zone__avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		font-size: 10px;
		font-weight: 600;
		color: #fff;
		border: 2px solid var(--color-surface, #1e1e2e);
		margin-left: -8px;
	}

	.conflict-zone__avatar:first-child {
		margin-left: 0;
	}

	.conflict-zone__avatar--ai {
		font-size: 14px;
	}

	.conflict-zone__avatar--more {
		background: rgba(255, 255, 255, 0.2);
		font-size: 9px;
	}

	.conflict-zone__warning {
		position: absolute;
		right: 8px;
		bottom: 4px;
		padding: 2px 6px;
		background: var(--zone-color);
		border-radius: 4px;
		font-size: 10px;
		font-weight: 600;
		color: #fff;
	}

	/* Tooltip */
	.conflict-tooltip {
		position: fixed;
		z-index: 1000;
		min-width: 220px;
		max-width: 300px;
		padding: 12px;
		background: var(--color-surface, #1e1e2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		font-size: 12px;
		pointer-events: none;
	}

	.conflict-tooltip__header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.conflict-tooltip__badge {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 700;
		color: #fff;
	}

	.conflict-tooltip__title {
		font-weight: 600;
		color: var(--color-text, #e8e8f0);
	}

	.conflict-tooltip__region {
		padding: 6px 8px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		color: var(--color-text-secondary, #aaa);
		margin-bottom: 8px;
	}

	.conflict-tooltip__participants {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 8px;
	}

	.conflict-tooltip__participant {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.conflict-tooltip__dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.conflict-tooltip__name {
		flex: 1;
		color: var(--color-text, #e8e8f0);
	}

	.conflict-tooltip__line {
		font-size: 10px;
		color: var(--color-text-muted, #888);
	}

	.ai-badge {
		display: inline-block;
		padding: 1px 4px;
		margin-left: 4px;
		background: rgba(168, 85, 247, 0.3);
		border-radius: 3px;
		font-size: 9px;
		color: #a855f7;
	}

	.conflict-tooltip__suggestion {
		padding: 8px;
		background: rgba(255, 200, 0, 0.1);
		border-radius: 4px;
		border-left: 2px solid #eab308;
		color: var(--color-text-secondary, #aaa);
		font-size: 11px;
		line-height: 1.4;
	}
</style>
