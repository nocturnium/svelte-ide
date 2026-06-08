<script lang="ts">
	import { Button, Icon, Textarea, Spinner } from '$components/core';

	interface Props {
		initialPrompt?: string;
		selection?: string;
		onSubmit: (prompt: string) => Promise<void>;
		onCancel: () => void;
		class?: string;
	}

	let {
		initialPrompt = '',
		selection = '',
		onSubmit,
		onCancel,
		class: className = ''
	}: Props = $props();

	// Seeded once from the prop: this is the editable input buffer, mounted fresh per edit.
	// svelte-ignore state_referenced_locally
	let prompt = $state(initialPrompt);
	let isSubmitting = $state(false);

	async function handleSubmit() {
		if (!prompt.trim() || isSubmitting) return;

		isSubmitting = true;
		try {
			await onSubmit(prompt);
		} finally {
			isSubmitting = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onCancel();
		} else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			handleSubmit();
		}
	}
</script>

<!-- Wrapper-level keydown only captures Escape / Cmd+Enter shortcuts; the real controls
	 (textarea, buttons) inside are the focusable interactive elements. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ai-inline-edit {className}" onkeydown={handleKeydown}>
	<div class="ai-inline-edit__header">
		<Icon name="sparkles" size={14} />
		<span>AI Edit</span>
	</div>

	{#if selection}
		<div class="ai-inline-edit__selection">
			<pre>{selection}</pre>
		</div>
	{/if}

	<div class="ai-inline-edit__input">
		<Textarea
			bind:value={prompt}
			placeholder="Describe the changes you want..."
			rows={2}
			fullWidth
			disabled={isSubmitting}
		/>
	</div>

	<div class="ai-inline-edit__actions">
		<Button variant="ghost" size="sm" onclick={onCancel} disabled={isSubmitting}>
			Cancel
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={handleSubmit}
			disabled={!prompt.trim() || isSubmitting}
		>
			{#if isSubmitting}
				<Spinner size="xs" />
			{:else}
				{#snippet _icon()}<Icon name="wand" size={14} />{/snippet}
			{/if}
			Apply
		</Button>
	</div>

	<div class="ai-inline-edit__hint">
		<span>Press <kbd>Cmd/Ctrl+Enter</kbd> to submit, <kbd>Esc</kbd> to cancel</span>
	</div>
</div>

<style>
	.ai-inline-edit {
		background: var(--ide-bg-elevated);
		border: 1px solid var(--ide-ai-assistant);
		border-radius: var(--ide-radius-lg);
		box-shadow: var(--ide-shadow-lg);
		overflow: hidden;
		animation: ide-slide-up var(--ide-transition-normal);
	}

	.ai-inline-edit__header {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: color-mix(in srgb, var(--ide-ai-assistant) 20%, transparent);
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
		color: var(--ide-ai-assistant);
	}

	.ai-inline-edit__selection {
		max-height: 100px;
		overflow: auto;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border-top: 1px solid var(--ide-border);
		border-bottom: 1px solid var(--ide-border);
	}

	.ai-inline-edit__selection pre {
		margin: 0;
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		white-space: pre-wrap;
	}

	.ai-inline-edit__input {
		padding: var(--ide-spacing-md);
	}

	.ai-inline-edit__actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--ide-spacing-sm);
		padding: 0 var(--ide-spacing-md) var(--ide-spacing-md);
	}

	.ai-inline-edit__hint {
		padding: var(--ide-spacing-xs) var(--ide-spacing-md) var(--ide-spacing-sm);
		text-align: center;
	}

	.ai-inline-edit__hint span {
		font-size: 10px;
		color: var(--ide-text-muted);
	}

	.ai-inline-edit__hint kbd {
		padding: 1px 4px;
		font-size: 9px;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 2px;
	}
</style>
