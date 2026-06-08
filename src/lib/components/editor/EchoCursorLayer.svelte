<script lang="ts">
	/**
	 * Echo Cursor Layer
	 *
	 * Visualizes echo cursors that replay keystrokes with a delay.
	 * Shows cursor markers, replay animations, and edit trails.
	 */

	import type { EchoCursor, EchoCursorManager, EchoCursorEvent } from './core/echo-cursor';
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		/** Echo cursor manager instance */
		manager: EchoCursorManager;
		/** Line height in pixels */
		lineHeight: number;
		/** Character width in pixels */
		charWidth: number;
		/** Gutter width offset */
		gutterWidth?: number;
		/** Whether enabled */
		enabled?: boolean;
		/** Click handler for adding echo points */
		onAddEchoPoint?: (line: number, column: number) => void;
	}

	let {
		manager,
		lineHeight,
		charWidth,
		gutterWidth = 50,
		enabled = true,
		onAddEchoPoint: _onAddEchoPoint
	}: Props = $props();

	let echoCursors = $state<EchoCursor[]>([]);
	let replayingCursors = $state<Set<string>>(new Set());
	let recentReplay = new SvelteMap<string, { text: string; opacity: number }>();

	// Subscribe to echo cursor events
	onMount(() => {
		// Initialize with current cursors
		echoCursors = manager.getEchoCursors();

		const unsubscribe = manager.subscribe((event: EchoCursorEvent) => {
			switch (event.type) {
				case 'echo-added':
					echoCursors = manager.getEchoCursors();
					break;
				case 'echo-removed':
					echoCursors = manager.getEchoCursors();
					break;
				case 'replay-started':
					replayingCursors = new Set([...replayingCursors, event.cursorId]);
					// Show replay text animation
					if (event.keystroke.type === 'insert' && event.keystroke.data.text) {
						recentReplay.set(event.cursorId, {
							text: event.keystroke.data.text,
							opacity: 1
						});
					}
					break;
				case 'replay-completed':
					replayingCursors = new Set([...replayingCursors].filter((id) => id !== event.cursorId));
					// Fade out replay text
					setTimeout(() => {
						const entry = recentReplay.get(event.cursorId);
						if (entry) {
							entry.opacity = 0;
							setTimeout(() => {
								recentReplay.delete(event.cursorId);
							}, 200);
						}
					}, 100);
					break;
				case 'mode-changed':
					if (!event.enabled) {
						echoCursors = [];
						replayingCursors = new Set();
						recentReplay.clear();
					}
					break;
			}
		});

		return unsubscribe;
	});

	/**
	 * Get cursor position in pixels
	 */
	function getCursorStyle(cursor: EchoCursor): string {
		const top = cursor.position.line * lineHeight;
		const left = gutterWidth + cursor.position.column * charWidth;
		return `top: ${top}px; left: ${left}px;`;
	}

	/**
	 * Handle remove echo click
	 */
	function handleRemoveEcho(id: string, e: MouseEvent) {
		e.stopPropagation();
		manager.removeEcho(id);
	}
</script>

{#if enabled && manager.isEnabled()}
	<div class="echo-cursor-layer" aria-hidden="true">
		{#each echoCursors as cursor (cursor.id)}
			{@const isReplaying = replayingCursors.has(cursor.id)}
			{@const replayText = recentReplay.get(cursor.id)}

			<!-- Echo cursor marker -->
			<div
				class="echo-cursor"
				class:echo-cursor--replaying={isReplaying}
				class:echo-cursor--active={cursor.active}
				style="{getCursorStyle(cursor)} --echo-color: {cursor.color};"
			>
				<!-- Cursor line -->
				<div class="echo-cursor__caret" style="height: {lineHeight}px;"></div>

				<!-- Label badge -->
				{#if cursor.label}
					<div class="echo-cursor__label">
						{cursor.label}
					</div>
				{/if}

				<!-- Delay indicator -->
				<div class="echo-cursor__delay">
					{cursor.delayMs}ms
				</div>

				<!-- Remove button -->
				<button
					class="echo-cursor__remove"
					onclick={(e) => handleRemoveEcho(cursor.id, e)}
					title="Remove echo cursor"
				>
					x
				</button>

				<!-- Replay animation -->
				{#if replayText}
					<div class="echo-cursor__replay" style="opacity: {replayText.opacity};">
						{replayText.text}
					</div>
				{/if}

				<!-- Trail effect when replaying -->
				{#if isReplaying}
					<div class="echo-cursor__ripple"></div>
				{/if}
			</div>
		{/each}

		<!-- Mode indicator -->
		{#if echoCursors.length > 0}
			<div class="echo-mode-indicator">
				<span class="echo-mode-indicator__icon">~</span>
				<span class="echo-mode-indicator__count">{echoCursors.length} echo{echoCursors.length !== 1 ? 's' : ''}</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.echo-cursor-layer {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 6;
	}

	.echo-cursor {
		position: absolute;
		pointer-events: auto;
	}

	.echo-cursor__caret {
		width: 2px;
		background: var(--echo-color);
		border-radius: 1px;
		opacity: 0.8;
		animation: echo-blink 1s ease-in-out infinite;
	}

	.echo-cursor--replaying .echo-cursor__caret {
		opacity: 1;
		animation: echo-pulse 0.15s ease-out;
	}

	@keyframes echo-blink {
		0%,
		100% {
			opacity: 0.8;
		}
		50% {
			opacity: 0.4;
		}
	}

	@keyframes echo-pulse {
		0% {
			transform: scaleX(1);
			opacity: 1;
		}
		50% {
			transform: scaleX(3);
			opacity: 0.6;
		}
		100% {
			transform: scaleX(1);
			opacity: 1;
		}
	}

	.echo-cursor__label {
		position: absolute;
		top: -20px;
		left: 0;
		padding: 2px 6px;
		background: var(--echo-color);
		color: #fff;
		font-size: 10px;
		font-weight: 600;
		border-radius: 4px;
		white-space: nowrap;
	}

	.echo-cursor__delay {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 2px;
		padding: 1px 4px;
		background: rgba(0, 0, 0, 0.7);
		color: var(--echo-color);
		font-size: 9px;
		font-family: monospace;
		border-radius: 3px;
		white-space: nowrap;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.echo-cursor:hover .echo-cursor__delay {
		opacity: 1;
	}

	.echo-cursor__remove {
		position: absolute;
		top: -8px;
		left: 6px;
		width: 14px;
		height: 14px;
		padding: 0;
		background: rgba(239, 68, 68, 0.9);
		border: none;
		border-radius: 50%;
		color: #fff;
		font-size: 10px;
		line-height: 14px;
		text-align: center;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.echo-cursor:hover .echo-cursor__remove {
		opacity: 1;
	}

	.echo-cursor__remove:hover {
		background: #ef4444;
	}

	.echo-cursor__replay {
		position: absolute;
		top: 0;
		left: 4px;
		padding: 2px 6px;
		background: var(--echo-color);
		color: #fff;
		font-size: 12px;
		font-family: monospace;
		border-radius: 4px;
		white-space: pre;
		transition: opacity 0.2s ease;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.echo-cursor__ripple {
		position: absolute;
		top: 50%;
		left: 0;
		width: 20px;
		height: 20px;
		margin-top: -10px;
		margin-left: -9px;
		border: 2px solid var(--echo-color);
		border-radius: 50%;
		animation: echo-ripple 0.4s ease-out forwards;
	}

	@keyframes echo-ripple {
		0% {
			transform: scale(0.5);
			opacity: 0.8;
		}
		100% {
			transform: scale(2);
			opacity: 0;
		}
	}

	/* Mode indicator */
	.echo-mode-indicator {
		position: fixed;
		bottom: 16px;
		right: 16px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: rgba(34, 197, 94, 0.15);
		border: 1px solid rgba(34, 197, 94, 0.3);
		border-radius: 6px;
		font-size: 12px;
		color: #22c55e;
		pointer-events: auto;
	}

	.echo-mode-indicator__icon {
		font-size: 16px;
		font-weight: bold;
		animation: echo-wave 1.5s ease-in-out infinite;
	}

	@keyframes echo-wave {
		0%,
		100% {
			transform: translateX(0);
		}
		25% {
			transform: translateX(-2px);
		}
		75% {
			transform: translateX(2px);
		}
	}

	.echo-mode-indicator__count {
		font-weight: 500;
	}
</style>
