<script lang="ts">
	import { Icon } from '$components/core';
	import type { AIMessage } from '$types';

	interface Props {
		message: AIMessage;
		onCopy?: (message: AIMessage) => void;
		onEdit?: (message: AIMessage) => void;
		onRetry?: (message: AIMessage) => void;
		onDelete?: (message: AIMessage) => void;
		onBranch?: (message: AIMessage) => void;
	}

	let { message, onCopy, onEdit, onRetry, onDelete, onBranch }: Props = $props();

	let copied = $state(false);
	let showConfirmDelete = $state(false);

	const isUser = $derived(message.role === 'user');

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(message.content);
			copied = true;
			setTimeout(() => (copied = false), 2000);
			onCopy?.(message);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	function handleEdit() {
		onEdit?.(message);
	}

	function handleRetry() {
		onRetry?.(message);
	}

	function handleDelete() {
		if (showConfirmDelete) {
			onDelete?.(message);
			showConfirmDelete = false;
		} else {
			showConfirmDelete = true;
			// Auto-hide after 3 seconds
			setTimeout(() => (showConfirmDelete = false), 3000);
		}
	}

	function handleBranch() {
		onBranch?.(message);
	}
</script>

<div
	class="message-actions"
	class:message-actions--user={isUser}
	role="group"
	aria-label="Message actions"
>
	<!-- Copy -->
	<button
		class="action-btn"
		onclick={handleCopy}
		title="Copy message"
		aria-label={copied ? 'Copied to clipboard' : 'Copy message'}
		disabled={!message.content}
	>
		{#if copied}
			<Icon name="check" size={16} />
		{:else}
			<Icon name="copy" size={16} />
		{/if}
	</button>

	<!-- Edit (user messages only) -->
	{#if isUser && onEdit}
		<button class="action-btn" onclick={handleEdit} title="Edit message" aria-label="Edit message">
			<Icon name="edit" size={16} />
		</button>
	{/if}

	<!-- Retry (user messages to resend, assistant to regenerate) -->
	{#if onRetry}
		<button
			class="action-btn"
			onclick={handleRetry}
			title={isUser ? 'Resend' : 'Regenerate'}
			aria-label={isUser ? 'Resend message' : 'Regenerate response'}
		>
			<Icon name="refresh" size={16} />
		</button>
	{/if}

	<!-- Branch conversation from this point -->
	{#if onBranch}
		<button
			class="action-btn"
			onclick={handleBranch}
			title="Branch from here"
			aria-label="Create branch from this message"
		>
			<Icon name="git-branch" size={16} />
		</button>
	{/if}

	<!-- Delete -->
	{#if onDelete}
		<button
			class="action-btn"
			class:action-btn--danger={showConfirmDelete}
			onclick={handleDelete}
			title={showConfirmDelete ? 'Click again to confirm' : 'Delete message'}
			aria-label={showConfirmDelete ? 'Click again to confirm deletion' : 'Delete message'}
		>
			{#if showConfirmDelete}
				<Icon name="alert-triangle" size={16} />
			{:else}
				<Icon name="trash" size={16} />
			{/if}
		</button>
	{/if}
</div>

<style>
	.message-actions {
		display: flex;
		gap: 0.25rem;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	/* Show on hover of parent message */
	:global(.ai-message:hover) .message-actions {
		opacity: 1;
	}

	/* Always show if confirm delete is active */
	.message-actions:has(.action-btn--danger) {
		opacity: 1;
	}

	.message-actions--user {
		flex-direction: row-reverse;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-sm);
		color: var(--ide-text-muted);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
		border-color: var(--color-nocturnium-wave);
	}

	.action-btn:focus-visible {
		outline: 2px solid var(--color-nocturnium-wave);
		outline-offset: 2px;
		background: var(--ide-bg-hover);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn--danger {
		background: color-mix(in srgb, var(--ide-error) 15%, var(--ide-bg-secondary));
		border-color: var(--ide-error);
		color: var(--ide-error);
	}

	.action-btn--danger:hover {
		background: var(--ide-error);
		color: white;
	}
</style>
