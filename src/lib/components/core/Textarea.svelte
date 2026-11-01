<script lang="ts">
	interface Props {
		id?: string;
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		readonly?: boolean;
		rows?: number;
		resize?: 'none' | 'vertical' | 'horizontal' | 'both';
		error?: string;
		/** Id of extra help text; the error message id is appended while an error is shown. */
		'aria-describedby'?: string;
		fullWidth?: boolean;
		class?: string;
		oninput?: (event: Event) => void;
		onchange?: (event: Event) => void;
		onkeydown?: (event: KeyboardEvent) => void;
	}

	let {
		id,
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		readonly = false,
		rows = 3,
		resize = 'vertical',
		error = '',
		'aria-describedby': describedBy,
		fullWidth = false,
		class: className = '',
		oninput,
		onchange,
		onkeydown
	}: Props = $props();

	const uid = $props.id();
	const errorId = `ide-field-${uid}-error`;
	const ariaDescribedby = $derived(
		[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
	);

	function handleInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		value = target.value;
		oninput?.(event);
	}
</script>

<div class="ide-textarea-wrapper {fullWidth ? 'ide-textarea-wrapper--full' : ''} {className}">
	<textarea
		{id}
		class="ide-textarea"
		class:ide-textarea--error={!!error}
		style="resize: {resize}"
		{value}
		{placeholder}
		{disabled}
		{readonly}
		{rows}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={ariaDescribedby}
		oninput={handleInput}
		{onchange}
		{onkeydown}
	></textarea>
	{#if error}
		<span class="ide-textarea__error" id={errorId}>{error}</span>
	{/if}
</div>

<style>
	.ide-textarea-wrapper {
		display: inline-flex;
		min-width: 0;
		flex-direction: column;
		gap: var(--ide-spacing-xs);
	}

	.ide-textarea-wrapper--full {
		width: 100%;
	}

	.ide-textarea {
		width: 100%;
		min-width: 0;
		padding: var(--ide-spacing-sm);
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-sm);
		line-height: var(--ide-line-height-normal);
		background: var(--ide-bg-secondary);
		color: var(--ide-text-primary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		transition: all var(--ide-transition-fast);
	}

	.ide-textarea:hover:not(:disabled) {
		border-color: var(--ide-interactive);
	}

	.ide-textarea:focus {
		/* Invisible normally (the box-shadow ring shows); repainted in forced-colors mode. */
		outline: 2px solid transparent;
		border-color: var(--ide-interactive-focus);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--ide-interactive-focus) 25%, transparent);
	}

	.ide-textarea:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ide-textarea::placeholder {
		color: var(--ide-text-muted);
	}

	.ide-textarea--error {
		border-color: var(--ide-error);
	}

	.ide-textarea__error {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-error);
	}
</style>
