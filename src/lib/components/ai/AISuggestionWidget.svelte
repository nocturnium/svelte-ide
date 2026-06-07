<script lang="ts">
	import { Button, Icon, Badge } from '$components/core';
	import type { AISuggestion } from '$types';

	interface Props {
		suggestion: AISuggestion;
		onAccept: () => void;
		onDismiss: () => void;
		class?: string;
	}

	let { suggestion, onAccept, onDismiss, class: className = '' }: Props = $props();

	const typeIcon = $derived(() => {
		switch (suggestion.type) {
			case 'completion':
				return 'sparkles';
			case 'refactor':
				return 'refresh';
			case 'fix':
				return 'zap';
			case 'explain':
				return 'info';
			default:
				return 'sparkles';
		}
	});

	const typeLabel = $derived(() => {
		switch (suggestion.type) {
			case 'completion':
				return 'Completion';
			case 'refactor':
				return 'Refactor';
			case 'fix':
				return 'Fix';
			case 'explain':
				return 'Explain';
			default:
				return 'Suggestion';
		}
	});
</script>

<div class="ai-suggestion {className}">
	<div class="ai-suggestion__header">
		<Icon name={typeIcon()} size={14} />
		<Badge variant="info" size="sm">{typeLabel()}</Badge>
		{#if suggestion.confidence}
			<span class="ai-suggestion__confidence">{Math.round(suggestion.confidence * 100)}%</span>
		{/if}
	</div>

	{#if suggestion.description}
		<div class="ai-suggestion__description">
			{suggestion.description}
		</div>
	{/if}

	<div class="ai-suggestion__preview">
		<pre>{suggestion.content}</pre>
	</div>

	<div class="ai-suggestion__actions">
		<Button variant="ghost" size="xs" onclick={onDismiss}>
			Dismiss
		</Button>
		<Button variant="primary" size="xs" onclick={onAccept}>
			{#snippet icon()}<Icon name="check" size={12} />{/snippet}
			Accept
		</Button>
	</div>
</div>

<style>
	.ai-suggestion {
		min-width: 280px;
		max-width: 400px;
		background: var(--ide-bg-elevated);
		border: 1px solid var(--ide-ai-assistant);
		border-radius: var(--ide-radius-md);
		box-shadow: var(--ide-shadow-lg);
		overflow: hidden;
		animation: ide-fade-in var(--ide-transition-fast);
	}

	.ai-suggestion__header {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: color-mix(in srgb, var(--ide-ai-assistant) 15%, transparent);
		color: var(--ide-ai-assistant);
	}

	.ai-suggestion__confidence {
		margin-left: auto;
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}

	.ai-suggestion__description {
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-secondary);
		border-bottom: 1px solid var(--ide-border);
	}

	.ai-suggestion__preview {
		max-height: 150px;
		overflow: auto;
		background: var(--ide-bg-secondary);
	}

	.ai-suggestion__preview pre {
		margin: 0;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.ai-suggestion__actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-primary);
		border-top: 1px solid var(--ide-border);
	}
</style>
