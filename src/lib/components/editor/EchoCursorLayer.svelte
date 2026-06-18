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
	let echoContents = $state<Record<string, string>>({});

	// Subscribe to echo cursor events
	onMount(() => {
		// Initialize with current cursors
		echoCursors = manager.getEchoCursors();
		echoContents = getEchoContents();

		const unsubscribe = manager.subscribe((event: EchoCursorEvent) => {
			switch (event.type) {
				case 'echo-added':
					echoCursors = manager.getEchoCursors();
					echoContents = getEchoContents();
					break;
				case 'echo-removed':
					echoCursors = manager.getEchoCursors();
					echoContents = getEchoContents();
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
					echoCursors = manager.getEchoCursors();
					echoContents = getEchoContents();
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
						echoContents = {};
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

	function getEchoColorToken(cursor: EchoCursor): string {
		const tokens = [
			'--ide-success',
			'--ide-warning',
			'--ide-syntax-tag',
			'--ide-syntax-type',
			'--ide-ai-assistant',
			'--ide-error',
			'--ide-accent',
			'--ide-accent-strong',
			'--ide-syntax-function',
			'--ide-syntax-string'
		];
		const index = echoCursors.findIndex((echo) => echo.id === cursor.id);
		return tokens[Math.max(index, 0) % tokens.length];
	}

	function getEchoContents(): Record<string, string> {
		return Object.fromEntries(
			manager.getEchoCursors().map((cursor) => [cursor.id, manager.getEchoContent(cursor.id)])
		);
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
			{@const echoContent = echoContents[cursor.id] ?? ''}

			<!-- Echo cursor marker -->
			<div
				class="echo-cursor"
				class:echo-cursor--replaying={isReplaying}
				class:echo-cursor--active={cursor.active}
				style="{getCursorStyle(cursor)} --echo-color: var({getEchoColorToken(cursor)});"
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

			<!-- Echo readout: the mirror's CURRENT line at the echo position, drawn on
			     an opaque lane so it never composites over the editor's own code
			     glyphs (a full-document transparent overlay read as doubled text). -->
			<div
				class="echo-cursor-buffer"
				style="top: {cursor.position.line *
					lineHeight}px; left: {gutterWidth}px; height: {lineHeight}px; --echo-color: var({getEchoColorToken(
					cursor
				)});"
			>
				<span class="echo-cursor-buffer__text"
					>{echoContent.split('\n')[cursor.position.line] || ' '}</span
				>
			</div>
		{/each}

		<!-- Mode indicator -->
		{#if echoCursors.length > 0}
			<div class="echo-mode-indicator">
				<span class="echo-mode-indicator__icon">~</span>
				<span class="echo-mode-indicator__count"
					>{echoCursors.length} echo{echoCursors.length !== 1 ? 's' : ''}</span
				>
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
		/* Keep the caret/label/replay above the echo readout lane. */
		z-index: 1;
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
		color: var(--ide-text-inverse);
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
		background: var(--ide-bg-overlay);
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
		background: color-mix(in srgb, var(--ide-error) 90%, transparent);
		border: none;
		border-radius: 50%;
		color: var(--ide-text-inverse);
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
		background: var(--ide-error);
	}

	.echo-cursor__replay {
		position: absolute;
		top: 0;
		left: 4px;
		padding: 2px 6px;
		background: var(--echo-color);
		color: var(--ide-text-inverse);
		font-size: 12px;
		font-family: monospace;
		border-radius: 4px;
		white-space: pre;
		transition: opacity 0.2s ease;
		box-shadow: var(--ide-shadow-md);
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

	.echo-cursor-buffer {
		position: absolute;
		right: 0;
		display: flex;
		align-items: center;
		padding: 0 8px 0 10px;
		font-family: monospace;
		font-size: 13px;
		line-height: 1;
		white-space: pre;
		overflow: hidden;
		pointer-events: none;
		/* Opaque lane: the echoed line must never show through onto the editor's
		   own glyphs — that reads as doubled, illegible code. */
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--echo-color) 24%, var(--ide-bg-secondary, #1a2744)) 0%,
			var(--ide-bg-secondary, #1a2744) 72%
		);
		border-left: 2px solid var(--echo-color);
		box-shadow: 0 1px 4px color-mix(in srgb, #000 35%, transparent);
	}

	.echo-cursor-buffer__text {
		overflow: hidden;
		text-overflow: ellipsis;
		color: color-mix(in srgb, var(--echo-color) 60%, var(--ide-text-primary));
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
		background: color-mix(in srgb, var(--ide-success) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-success) 30%, transparent);
		border-radius: 6px;
		font-size: 12px;
		color: var(--ide-success);
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

	@media (prefers-reduced-motion: reduce) {
		.echo-cursor__caret,
		.echo-cursor--replaying .echo-cursor__caret,
		.echo-cursor__ripple,
		.echo-mode-indicator__icon {
			animation: none;
		}

		.echo-cursor__delay,
		.echo-cursor__remove,
		.echo-cursor__replay {
			transition: none;
		}
	}
</style>
