<script module lang="ts">
	// Stable per-instance counter (SSR-safe — no Math.random/Date) so the bubble's
	// id matches across server render and hydration for aria-describedby.
	let tooltipCounter = 0;
	function nextTooltipId(): string {
		tooltipCounter += 1;
		return `ide-tooltip-${tooltipCounter}`;
	}
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

	const tooltipId = nextTooltipId();
	let visible = $state(false);
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let wrapperRef: HTMLDivElement | undefined = $state();
	// Element that carries aria-describedby while the tooltip is open: the control the
	// keyboard focus is on, or else the first focusable control inside the wrapper.
	let describedEl: HTMLElement | null = null;

	function show() {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => {
			timeout = null;
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

	// Keyboard focus shows the tooltip at once. Mouse-click focus (not :focus-visible) does not.
	function handleFocusIn(event: FocusEvent) {
		const target = event.target as HTMLElement;
		if (!target.matches?.(':focus-visible')) return;
		describedEl = target;
		if (timeout) clearTimeout(timeout);
		timeout = null;
		visible = true;
	}

	function handleFocusOut() {
		hide();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (visible && event.key === 'Escape') hide();
	}

	// Point the trigger at the bubble so assistive tech reads it with the control's name.
	$effect(() => {
		if (!visible || !content || !wrapperRef) return;
		const el =
			describedEl && wrapperRef.contains(describedEl)
				? describedEl
				: wrapperRef.querySelector<HTMLElement>(
						'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
					);
		if (!el) return;
		const previous = el.getAttribute('aria-describedby');
		el.setAttribute('aria-describedby', previous ? `${previous} ${tooltipId}` : tooltipId);
		return () => {
			if (previous) el.setAttribute('aria-describedby', previous);
			else el.removeAttribute('aria-describedby');
			describedEl = null;
		};
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- Presentational hover/focus container: the real trigger is the wrapped child,
     and the tooltip text is exposed via aria-describedby. It is deliberately NOT
     given a role (a role="tooltip" here was the original bug). -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={wrapperRef}
	class="ide-tooltip-wrapper {className}"
	onmouseenter={show}
	onmouseleave={hide}
	onfocusin={handleFocusIn}
	onfocusout={handleFocusOut}
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
