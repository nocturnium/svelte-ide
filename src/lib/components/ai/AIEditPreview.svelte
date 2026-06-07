<script lang="ts">
	import { Button, Icon, Badge } from '$components/core';
	import type { AIEditSession } from '$types';
	import { resolveEditSession } from '$stores/ai.svelte';

	interface Props {
		session: AIEditSession;
		class?: string;
	}

	let { session, class: className = '' }: Props = $props();

	function handleApply() {
		resolveEditSession(session.id, true);
	}

	function handleReject() {
		resolveEditSession(session.id, false);
	}

	const statusVariant = $derived.by(() => {
		switch (session.status) {
			case 'pending':
				return 'default';
			case 'editing':
				return 'info';
			case 'reviewing':
				return 'warning';
			case 'applied':
				return 'success';
			case 'rejected':
				return 'error';
			default:
				return 'default';
		}
	});
</script>

<div class="ai-edit-preview {className}">
	<div class="ai-edit-preview__header">
		<div class="ai-edit-preview__title">
			<Icon name="edit" size={14} />
			<span>AI Edit Proposal</span>
		</div>
		<Badge variant={statusVariant}>{session.status}</Badge>
	</div>

	<div class="ai-edit-preview__file">
		<Icon name="file" size={12} />
		<span>{session.filePath}</span>
	</div>

	{#if session.diff}
		<div class="ai-edit-preview__diff">
			<pre>{session.diff}</pre>
		</div>
	{/if}

	{#if session.status === 'reviewing'}
		<div class="ai-edit-preview__actions">
			<Button variant="success" size="sm" onclick={handleApply}>
				{#snippet icon()}<Icon name="check" size={14} />{/snippet}
				Apply Changes
			</Button>
			<Button variant="danger" size="sm" onclick={handleReject}>
				{#snippet icon()}<Icon name="x" size={14} />{/snippet}
				Reject
			</Button>
		</div>
	{/if}
</div>

<style>
	.ai-edit-preview {
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		overflow: hidden;
	}

	.ai-edit-preview__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border-bottom: 1px solid var(--ide-border);
	}

	.ai-edit-preview__title {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
		color: var(--ide-text-primary);
	}

	.ai-edit-preview__file {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		padding: var(--ide-spacing-xs) var(--ide-spacing-md);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		background: var(--ide-bg-primary);
		border-bottom: 1px solid var(--ide-border);
	}

	.ai-edit-preview__diff {
		max-height: 300px;
		overflow: auto;
		background: var(--ide-bg-primary);
	}

	.ai-edit-preview__diff pre {
		margin: 0;
		padding: var(--ide-spacing-md);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		line-height: 1.6;
		white-space: pre-wrap;
	}

	.ai-edit-preview__actions {
		display: flex;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border-top: 1px solid var(--ide-border);
	}
</style>
