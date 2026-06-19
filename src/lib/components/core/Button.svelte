<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
		size?: 'xs' | 'sm' | 'md' | 'lg';
		disabled?: boolean;
		loading?: boolean;
		fullWidth?: boolean;
		type?: 'button' | 'submit' | 'reset';
		title?: string;
		'aria-label'?: string;
		class?: string;
		children: Snippet;
		icon?: Snippet;
		onclick?: (event: MouseEvent) => void;
	}

	let {
		variant = 'primary',
		size = 'md',
		disabled = false,
		loading = false,
		fullWidth = false,
		type = 'button',
		title,
		'aria-label': ariaLabel,
		class: className = '',
		children,
		icon,
		onclick
	}: Props = $props();
</script>

<button
	{type}
	class="ide-button ide-button--{variant} ide-button--{size} {fullWidth
		? 'ide-button--full'
		: ''} {className}"
	disabled={disabled || loading}
	{title}
	aria-label={ariaLabel}
	{onclick}
>
	{#if loading}
		<span class="ide-button__spinner"></span>
	{:else if icon}
		<span class="ide-button__icon">
			{@render icon()}
		</span>
	{/if}
	<span class="ide-button__content">
		{@render children()}
	</span>
</button>

<style>
	.ide-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--ide-spacing-sm);
		font-family: var(--ide-font-sans);
		font-weight: 500;
		border-radius: var(--ide-radius-md);
		transition: all var(--ide-transition-fast);
		cursor: pointer;
		border: 1px solid transparent;
		white-space: nowrap;
	}

	.ide-button:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	/* Disabled/loading: dim the fill, not the label. Routing every variant
	   to a neutral tertiary surface with muted (still legible) text keeps the
	   label >=3:1 instead of multiplying the variant fill by opacity 0.5,
	   which crushed cream-on-orange/white-on-salmon below readable contrast. */
	.ide-button.ide-button:disabled {
		background: var(--ide-bg-tertiary);
		color: var(--ide-text-secondary);
		border-color: var(--ide-border);
		opacity: 0.85;
		cursor: not-allowed;
	}

	.ide-button--full {
		width: 100%;
	}

	/* Variants */
	.ide-button--primary {
		background: var(--ide-primary);
		color: var(--ide-text-inverse);
	}

	.ide-button--primary:hover:not(:disabled) {
		background: var(--ide-primary-hover);
	}

	.ide-button--secondary {
		background: var(--ide-bg-tertiary);
		color: var(--ide-text-primary);
		border-color: var(--ide-border);
	}

	.ide-button--secondary:hover:not(:disabled) {
		background: var(--ide-bg-hover);
		border-color: var(--ide-interactive);
	}

	.ide-button--ghost {
		background: transparent;
		color: var(--ide-text-secondary);
	}

	.ide-button--ghost:hover:not(:disabled) {
		background: var(--ide-bg-elevated);
		color: var(--ide-text-primary);
	}

	.ide-button--danger {
		background: var(--ide-error);
		color: var(--ide-text-inverse);
	}

	.ide-button--danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--ide-error) 80%, black);
	}

	.ide-button--success {
		background: var(--ide-success);
		color: var(--ide-text-inverse);
	}

	.ide-button--success:hover:not(:disabled) {
		background: color-mix(in srgb, var(--ide-success) 80%, black);
	}

	/* Sizes */
	.ide-button--xs {
		height: 1.5rem;
		padding: 0 var(--ide-spacing-xs);
		font-size: var(--ide-font-size-xs);
	}

	.ide-button--sm {
		height: 1.75rem;
		padding: 0 var(--ide-spacing-sm);
		font-size: var(--ide-font-size-xs);
	}

	.ide-button--md {
		height: 2.25rem;
		padding: 0 var(--ide-spacing-md);
		font-size: var(--ide-font-size-sm);
	}

	.ide-button--lg {
		height: 2.75rem;
		padding: 0 var(--ide-spacing-lg);
		font-size: var(--ide-font-size-base);
	}

	/* Spinner */
	.ide-button__spinner {
		width: 1em;
		height: 1em;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: ide-spin 0.6s linear infinite;
	}

	.ide-button__icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
