<script lang="ts">
	interface Props {
		id?: string;
		value?: string;
		type?: 'text' | 'password' | 'email' | 'number' | 'search' | 'url';
		placeholder?: string;
		disabled?: boolean;
		readonly?: boolean;
		error?: string;
		size?: 'sm' | 'md' | 'lg';
		fullWidth?: boolean;
		class?: string;
		oninput?: (event: Event) => void;
		onchange?: (event: Event) => void;
		onkeydown?: (event: KeyboardEvent) => void;
		onfocus?: (event: FocusEvent) => void;
		onblur?: (event: FocusEvent) => void;
	}

	let {
		id,
		value = $bindable(''),
		type = 'text',
		placeholder = '',
		disabled = false,
		readonly = false,
		error = '',
		size = 'md',
		fullWidth = false,
		class: className = '',
		oninput,
		onchange,
		onkeydown,
		onfocus,
		onblur
	}: Props = $props();

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		value = target.value;
		oninput?.(event);
	}
</script>

<div class="ide-input-wrapper {fullWidth ? 'ide-input-wrapper--full' : ''} {className}">
	<input
		{id}
		class="ide-input ide-input--{size}"
		class:ide-input--error={!!error}
		{type}
		{value}
		{placeholder}
		{disabled}
		{readonly}
		oninput={handleInput}
		{onchange}
		{onkeydown}
		{onfocus}
		{onblur}
	/>
	{#if error}
		<span class="ide-input__error">{error}</span>
	{/if}
</div>

<style>
	.ide-input-wrapper {
		display: inline-flex;
		flex-direction: column;
		gap: var(--ide-spacing-xs);
	}

	.ide-input-wrapper--full {
		width: 100%;
	}

	.ide-input {
		width: 100%;
		font-family: var(--ide-font-sans);
		background: var(--ide-bg-secondary);
		color: var(--ide-text-primary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		transition: all var(--ide-transition-fast);
	}

	.ide-input:hover:not(:disabled) {
		border-color: var(--ide-interactive);
	}

	.ide-input:focus {
		outline: none;
		border-color: var(--ide-interactive-focus);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--ide-interactive-focus) 25%, transparent);
	}

	.ide-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ide-input::placeholder {
		color: var(--ide-text-muted);
	}

	.ide-input--error {
		border-color: var(--ide-error);
	}

	.ide-input--error:focus {
		border-color: var(--ide-error);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--ide-error) 25%, transparent);
	}

	/* Sizes */
	.ide-input--sm {
		height: 1.75rem;
		padding: 0 var(--ide-spacing-sm);
		font-size: var(--ide-font-size-xs);
	}

	.ide-input--md {
		height: 2.25rem;
		padding: 0 var(--ide-spacing-md);
		font-size: var(--ide-font-size-sm);
	}

	.ide-input--lg {
		height: 2.75rem;
		padding: 0 var(--ide-spacing-md);
		font-size: var(--ide-font-size-base);
	}

	.ide-input__error {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-error);
	}
</style>
