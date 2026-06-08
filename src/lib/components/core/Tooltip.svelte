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

<div
	class="ide-tooltip-wrapper {className}"
	onmouseenter={show}
	onmouseleave={hide}
	onfocus={show}
	onblur={hide}
	role="tooltip"
>
	{@render children()}
	{#if visible && content}
		<div class="ide-tooltip ide-tooltip--{position}" role="tooltip">
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
