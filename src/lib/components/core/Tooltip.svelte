<script module lang="ts">
	// Stable per-instance counter (SSR-safe — no Math.random/Date) so the bubble's
	// id matches across server render and hydration for aria-describedby.
	let tooltipCounter = 0;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		content: string;
		position?: 'top' | 'bottom' | 'left' | 'right';
		delay?: number;
		class?: string;
		children: Snippet;
	}

	let { content, position = 'top', delay = 300, class: className = '', children }: Props = $props();

	const tooltipId = `ide-tooltip-${++tooltipCounter}`;
	let visible = $state(false);
	let timeout: ReturnType<typeof setTimeout> | null = null;

	function show() {
		timeout = setTimeout(() => {
			visible = true;
		}, delay);
	}

	function hide() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
		visible = false;
	}
</script>

<!-- Presentational hover/focus container: the real trigger is the wrapped child,
     and the tooltip text is exposed via aria-describedby. It is deliberately NOT
     given a role (a role="tooltip" here was the original bug). -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="ide-tooltip-wrapper {className}"
	onmouseenter={show}
	onmouseleave={hide}
	onfocus={show}
	onblur={hide}
	aria-describedby={visible && content ? tooltipId : undefined}
>
	{@render children()}
	{#if visible && content}
		<div id={tooltipId} class="ide-tooltip ide-tooltip--{position}" role="tooltip">
			{content}
		</div>
	{/if}
</div>

<style>
	.ide-tooltip-wrapper {
		position: relative;
		display: inline-flex;
	}

	.ide-tooltip {
		position: absolute;
		z-index: var(--ide-z-tooltip);
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		font-size: var(--ide-font-size-xs);
		font-family: var(--ide-font-sans);
		color: var(--ide-text-primary);
		background: var(--ide-bg-elevated);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		box-shadow: var(--ide-shadow-md);
		white-space: nowrap;
		pointer-events: none;
		animation: ide-fade-in var(--ide-transition-fast);
	}

	.ide-tooltip--top {
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 6px;
	}

	.ide-tooltip--bottom {
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 6px;
	}

	.ide-tooltip--left {
		right: 100%;
		top: 50%;
		transform: translateY(-50%);
		margin-right: 6px;
	}

	.ide-tooltip--right {
		left: 100%;
		top: 50%;
		transform: translateY(-50%);
		margin-left: 6px;
	}
</style>
