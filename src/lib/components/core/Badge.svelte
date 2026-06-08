<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?:
			| 'default'
			| 'primary'
			| 'secondary'
			| 'success'
			| 'warning'
			| 'error'
			| 'danger'
			| 'info';
		size?: 'sm' | 'md';
		dot?: boolean;
		class?: string;
		children: Snippet;
	}

	let {
		variant = 'default',
		size = 'md',
		dot = false,
		class: className = '',
		children
	}: Props = $props();
</script>

<span class="ide-badge ide-badge--{variant} ide-badge--{size} {className}">
	{#if dot}
		<span class="ide-badge__dot"></span>
	{/if}
	{@render children()}
</span>

<style>
	.ide-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		font-family: var(--ide-font-sans);
		font-weight: 500;
		border-radius: var(--ide-radius-full);
		white-space: nowrap;
	}

	/* Sizes */
	.ide-badge--sm {
		padding: 1px 6px;
		font-size: 10px;
	}

	.ide-badge--md {
		padding: 2px 8px;
		font-size: var(--ide-font-size-xs);
	}

	/* Variants */
	.ide-badge--default {
		background: color-mix(in srgb, var(--ide-text-secondary) 12%, transparent);
		color: var(--ide-text-secondary);
	}

	.ide-badge--primary {
		background: color-mix(in srgb, var(--ide-interactive) 20%, transparent);
		color: var(--ide-interactive);
	}

	.ide-badge--success {
		background: color-mix(in srgb, var(--ide-success) 20%, transparent);
		color: var(--ide-success);
	}

	.ide-badge--warning {
		background: color-mix(in srgb, var(--ide-warning) 20%, transparent);
		color: var(--ide-warning);
	}

	.ide-badge--error {
		background: color-mix(in srgb, var(--ide-error) 20%, transparent);
		color: var(--ide-error);
	}

	.ide-badge--info {
		background: color-mix(in srgb, var(--ide-info) 20%, transparent);
		color: var(--ide-info);
	}

	.ide-badge--secondary {
		background: var(--ide-bg-secondary);
		color: var(--ide-text-muted);
	}

	.ide-badge--danger {
		background: color-mix(in srgb, var(--ide-error) 20%, transparent);
		color: var(--ide-error);
	}

	/* Dot */
	.ide-badge__dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
</style>
