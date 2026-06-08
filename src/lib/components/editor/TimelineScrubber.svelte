<script lang="ts">
	/**
	 * Timeline Scrubber
	 *
	 * A visual timeline for scrubbing through document history.
	 * Shows colored markers for different authors and change types.
	 * Supports playback mode with smooth transitions.
	 */

	import {
		type SnapshotMetadata,
		formatTimestamp
	} from './core/timeline';

	interface TimelineMarker {
		position: number;
		color: string;
		type: SnapshotMetadata['changeType'];
		label: string;
		timestamp: number;
	}

	interface Props {
		/** Timeline markers to display */
		markers: TimelineMarker[];
		/** Current position (0-1, where 1 is live) */
		position?: number;
		/** Whether in playback mode */
		isPlayback?: boolean;
		/** Whether auto-playing */
		isPlaying?: boolean;
		/** Timeline duration in ms */
		duration?: number;
		/** Callback when position changes */
		onPositionChange?: (position: number) => void;
		/** Callback when playback starts */
		onPlay?: () => void;
		/** Callback when playback pauses */
		onPause?: () => void;
		/** Callback to go live */
		onGoLive?: () => void;
		/** Whether the scrubber is enabled */
		enabled?: boolean;
	}

	let {
		markers = [],
		position = $bindable(1),
		isPlayback = false,
		isPlaying = false,
		duration = 0,
		onPositionChange,
		onPlay,
		onPause,
		onGoLive,
		enabled = true
	}: Props = $props();

	let trackElement: HTMLDivElement | null = $state(null);
	let isDragging = $state(false);
	let hoveredMarker = $state<TimelineMarker | null>(null);
	let tooltipPosition = $state({ x: 0, y: 0 });

	// Format current position as time
	let positionTime = $derived(() => {
		if (markers.length === 0) return '';
		if (position >= 1) return 'Live';

		const startTime = markers[0]?.timestamp ?? 0;
		const currentTime = startTime + position * duration;
		return formatTimestamp(currentTime);
	});

	function handlePointerDown(e: PointerEvent) {
		if (!enabled || !trackElement) return;

		isDragging = true;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		updatePosition(e);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging || !trackElement) return;
		updatePosition(e);
	}

	function handlePointerUp(e: PointerEvent) {
		isDragging = false;
		(e.target as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function updatePosition(e: PointerEvent) {
		if (!trackElement) return;

		const rect = trackElement.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const newPosition = Math.max(0, Math.min(1, x / rect.width));

		position = newPosition;
		onPositionChange?.(newPosition);
	}

	function handleMarkerHover(marker: TimelineMarker, e: MouseEvent) {
		hoveredMarker = marker;
		tooltipPosition = { x: e.clientX, y: e.clientY - 40 };
	}

	function handleMarkerLeave() {
		hoveredMarker = null;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!enabled) return;

		const step = e.shiftKey ? 0.1 : 0.01;

		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				position = Math.max(0, position - step);
				onPositionChange?.(position);
				break;
			case 'ArrowRight':
				e.preventDefault();
				position = Math.min(1, position + step);
				onPositionChange?.(position);
				break;
			case 'Home':
				e.preventDefault();
				position = 0;
				onPositionChange?.(position);
				break;
			case 'End':
				e.preventDefault();
				position = 1;
				onPositionChange?.(position);
				onGoLive?.();
				break;
			case ' ':
				e.preventDefault();
				if (isPlaying) {
					onPause?.();
				} else {
					onPlay?.();
				}
				break;
		}
	}

	function getMarkerIcon(type: SnapshotMetadata['changeType']): string {
		switch (type) {
			case 'commit':
				return '\u{1F4BE}';
			case 'save':
				return '\u{1F4BE}';
			case 'ai-suggestion':
				return '🤖';
			case 'checkpoint':
				return '\u{23F8}';
			default:
				return '\u{270F}';
		}
	}
</script>

{#if enabled}
	<div
		class="timeline-scrubber"
		class:timeline-scrubber--playback={isPlayback}
		class:timeline-scrubber--dragging={isDragging}
		role="slider"
		aria-label="Timeline scrubber"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={Math.round(position * 100)}
		tabindex={0}
		onkeydown={handleKeyDown}
	>
		<!-- Playback controls -->
		<div class="timeline-scrubber__controls">
			{#if isPlayback}
				<button
					class="timeline-scrubber__btn"
					onclick={() => (isPlaying ? onPause?.() : onPlay?.())}
					aria-label={isPlaying ? 'Pause' : 'Play'}
				>
					{#if isPlaying}
						<span class="icon">&#x23F8;</span>
					{:else}
						<span class="icon">&#x25B6;</span>
					{/if}
				</button>
			{/if}

			<button
				class="timeline-scrubber__btn timeline-scrubber__btn--rewind"
				onclick={() => {
					position = 0;
					onPositionChange?.(0);
				}}
				aria-label="Go to start"
			>
				<span class="icon">&#x23EE;</span>
			</button>
		</div>

		<!-- Track: pointer-driven scrub surface; the handle below is the focusable control -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="timeline-scrubber__track"
			bind:this={trackElement}
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
		>
			<!-- Progress fill -->
			<div class="timeline-scrubber__fill" style="width: {position * 100}%;"></div>

			<!-- Markers -->
			{#each markers as marker (marker.timestamp)}
				<div
					class="timeline-scrubber__marker timeline-scrubber__marker--{marker.type}"
					style="left: {marker.position * 100}%; --marker-color: {marker.color};"
					onmouseenter={(e) => handleMarkerHover(marker, e)}
					onmouseleave={handleMarkerLeave}
					role="button"
					tabindex={-1}
				>
					<span class="timeline-scrubber__marker-dot"></span>
				</div>
			{/each}

			<!-- Thumb -->
			<div class="timeline-scrubber__thumb" style="left: {position * 100}%;">
				<div class="timeline-scrubber__thumb-handle"></div>
			</div>
		</div>

		<!-- Time display -->
		<div class="timeline-scrubber__time">
			{#if position >= 1}
				<span class="timeline-scrubber__live">LIVE</span>
			{:else}
				<span class="timeline-scrubber__position">{positionTime()}</span>
			{/if}
		</div>

		<!-- Go Live button -->
		{#if isPlayback || position < 1}
			<button class="timeline-scrubber__btn timeline-scrubber__btn--live" onclick={onGoLive}>
				<span class="icon">&#x25CF;</span>
				<span>Live</span>
			</button>
		{/if}
	</div>

	<!-- Marker tooltip -->
	{#if hoveredMarker}
		<div
			class="timeline-scrubber__tooltip"
			style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;"
		>
			<div class="timeline-scrubber__tooltip-icon" style="color: {hoveredMarker.color}">
				{getMarkerIcon(hoveredMarker.type)}
			</div>
			<div class="timeline-scrubber__tooltip-content">
				<div class="timeline-scrubber__tooltip-label">{hoveredMarker.label}</div>
				<div class="timeline-scrubber__tooltip-time">{formatTimestamp(hoveredMarker.timestamp)}</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	.timeline-scrubber {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px;
		background: var(--color-surface, #1e1e2e);
		border-top: 1px solid var(--color-border, #333);
		user-select: none;
	}

	.timeline-scrubber--playback {
		background: var(--color-surface-elevated, #252535);
	}

	.timeline-scrubber__controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.timeline-scrubber__btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: var(--color-text-muted, #888);
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.timeline-scrubber__btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--color-text, #e8e8f0);
	}

	.timeline-scrubber__btn--live {
		width: auto;
		padding: 0 8px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.timeline-scrubber__btn--live .icon {
		color: #ef4444;
		font-size: 8px;
	}

	.timeline-scrubber__btn .icon {
		font-size: 14px;
	}

	.timeline-scrubber__track {
		flex: 1;
		position: relative;
		height: 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		cursor: pointer;
	}

	.timeline-scrubber__fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: linear-gradient(90deg, rgba(74, 158, 255, 0.3), rgba(74, 158, 255, 0.5));
		border-radius: 4px;
		pointer-events: none;
	}

	.timeline-scrubber__marker {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 1;
		cursor: pointer;
	}

	.timeline-scrubber__marker-dot {
		display: block;
		width: 6px;
		height: 6px;
		background: var(--marker-color, #4a9eff);
		border-radius: 50%;
		transition: transform 0.15s ease;
	}

	.timeline-scrubber__marker:hover .timeline-scrubber__marker-dot {
		transform: scale(1.5);
	}

	.timeline-scrubber__marker--ai-suggestion .timeline-scrubber__marker-dot {
		width: 8px;
		height: 8px;
		box-shadow: 0 0 4px var(--marker-color);
	}

	.timeline-scrubber__marker--commit .timeline-scrubber__marker-dot,
	.timeline-scrubber__marker--save .timeline-scrubber__marker-dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}

	.timeline-scrubber__thumb {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 2;
		pointer-events: none;
	}

	.timeline-scrubber__thumb-handle {
		width: 14px;
		height: 14px;
		background: var(--color-primary, #4a9eff);
		border: 2px solid #fff;
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		transition: transform 0.1s ease;
	}

	.timeline-scrubber--dragging .timeline-scrubber__thumb-handle {
		transform: scale(1.2);
	}

	.timeline-scrubber__time {
		min-width: 50px;
		text-align: center;
		font-size: 11px;
		font-family: var(--font-mono, monospace);
		color: var(--color-text-muted, #888);
	}

	.timeline-scrubber__live {
		color: #ef4444;
		font-weight: 600;
		animation: live-pulse 2s ease-in-out infinite;
	}

	@keyframes live-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}

	.timeline-scrubber__tooltip {
		position: fixed;
		z-index: 1000;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--color-surface, #1e1e2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		pointer-events: none;
		transform: translateX(-50%);
	}

	.timeline-scrubber__tooltip-icon {
		font-size: 16px;
	}

	.timeline-scrubber__tooltip-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.timeline-scrubber__tooltip-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--color-text, #e8e8f0);
	}

	.timeline-scrubber__tooltip-time {
		font-size: 10px;
		color: var(--color-text-muted, #888);
	}
</style>
