<script lang="ts">
	import { Avatar, Icon, Badge } from '$components/core';
	import AIMessageContent from './AIMessageContent.svelte';
	import AIMessageActions from './AIMessageActions.svelte';
	import AIToolCallDisplay from './AIToolCallDisplay.svelte';
	import type { AIMessage } from '$types';
	import { formatRelativeTime } from '$utils/format';

	interface Props {
		message: AIMessage;
		showActions?: boolean;
		onCopy?: (message: AIMessage) => void;
		onEdit?: (message: AIMessage) => void;
		onRetry?: (message: AIMessage) => void;
		onDelete?: (message: AIMessage) => void;
		onBranch?: (message: AIMessage) => void;
	}

	let {
		message,
		showActions = true,
		onCopy,
		onEdit,
		onRetry,
		onDelete,
		onBranch
	}: Props = $props();

	const isUser = $derived(message.role === 'user');
	const isAssistant = $derived(message.role === 'assistant');
	const isSystem = $derived(message.role === 'system');
	const isTool = $derived(message.role === 'tool');
</script>

<div class="ai-message" class:ai-message--user={isUser} class:ai-message--assistant={isAssistant}>
	<div class="ai-message__avatar">
		{#if isUser}
			<Avatar name="You" size="sm" color="var(--ide-ai-user)" />
		{:else if isAssistant}
			<Avatar name="AI" size="sm" isAI />
		{:else if isSystem}
			<Icon name="settings" size={20} />
		{:else if isTool}
			<Icon name="zap" size={20} />
		{/if}
	</div>

	<div class="ai-message__content">
		<div class="ai-message__header">
			<span class="ai-message__role">
				{#if isUser}
					You
				{:else if isAssistant}
					AI Assistant
				{:else if isSystem}
					System
				{:else if isTool}
					Tool Result
				{/if}
			</span>
			<span class="ai-message__time">{formatRelativeTime(message.timestamp)}</span>

			{#if showActions && (isUser || isAssistant)}
				<AIMessageActions
					{message}
					{onCopy}
					onEdit={isUser ? onEdit : undefined}
					{onRetry}
					{onDelete}
					{onBranch}
				/>
			{/if}
		</div>

		{#if message.error}
			<div class="ai-message__error">
				<Icon name="alert-circle" size={14} />
				<span>{message.error}</span>
			</div>
		{:else if message.content}
			<div class="ai-message__text">
				<AIMessageContent content={message.content} isStreaming={message.isStreaming} />
			</div>
		{/if}

		{#if message.toolCalls && message.toolCalls.length > 0}
			<div class="ai-message__tool-calls">
				{#each message.toolCalls as toolCall (toolCall.id)}
					<AIToolCallDisplay
						{toolCall}
						status="completed"
					/>
				{/each}
			</div>
		{/if}

		{#if message.toolResult}
			<div class="ai-message__tool-result">
				<Badge variant="success" size="sm">
					<Icon name="check" size={10} />
					Tool executed successfully
				</Badge>
			</div>
		{/if}

		{#if message.metadata}
			<div class="ai-message__metadata">
				{#if message.metadata.model}
					<span class="ai-message__meta-item">
						<Icon name="cpu" size={10} />
						{message.metadata.model}
					</span>
				{/if}
				{#if message.metadata.tokensUsed}
					<span class="ai-message__meta-item">
						<Icon name="hash" size={10} />
						{message.metadata.tokensUsed} tokens
					</span>
				{/if}
				{#if message.metadata.latencyMs}
					<span class="ai-message__meta-item">
						<Icon name="clock" size={10} />
						{message.metadata.latencyMs}ms
					</span>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.ai-message {
		display: flex;
		gap: var(--ide-spacing-sm);
		animation: ide-slide-up var(--ide-transition-normal);
		padding: var(--ide-spacing-sm) 0;
	}

	.ai-message--user {
		flex-direction: row-reverse;
	}

	.ai-message__avatar {
		flex-shrink: 0;
		padding-top: 2px;
	}

	.ai-message__content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-xs);
	}

	.ai-message--user .ai-message__content {
		align-items: flex-end;
	}

	.ai-message__header {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
	}

	.ai-message--user .ai-message__header {
		flex-direction: row-reverse;
	}

	.ai-message__role {
		font-size: var(--ide-font-size-xs);
		font-weight: 600;
		color: var(--ide-text-secondary);
	}

	.ai-message__time {
		font-size: 10px;
		color: var(--ide-text-muted);
	}

	.ai-message__text {
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border-radius: var(--ide-radius-lg);
		max-width: 90%;
	}

	.ai-message--user .ai-message__text {
		background: var(--ide-ai-user, color-mix(in srgb, var(--color-nocturnium-wave) 25%, var(--ide-bg-secondary)));
		color: var(--ide-text-primary);
		border-bottom-right-radius: var(--ide-radius-sm);
		border: 1px solid color-mix(in srgb, var(--color-nocturnium-wave) 40%, transparent);
	}

	.ai-message--assistant .ai-message__text {
		background: var(--ide-bg-secondary);
		color: var(--ide-text-primary);
		border-bottom-left-radius: var(--ide-radius-sm);
		max-width: 100%;
	}

	.ai-message__error {
		display: flex;
		align-items: flex-start;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: color-mix(in srgb, var(--ide-error) 15%, transparent);
		color: var(--ide-error);
		font-size: var(--ide-font-size-sm);
		border-radius: var(--ide-radius-lg);
		max-width: 90%;
	}

	.ai-message__tool-calls {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-sm);
		margin-top: var(--ide-spacing-xs);
		max-width: 100%;
	}

	.ai-message__tool-result {
		margin-top: var(--ide-spacing-xs);
	}

	.ai-message__metadata {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ide-spacing-md);
		margin-top: var(--ide-spacing-xs);
	}

	.ai-message__meta-item {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		font-size: 10px;
		color: var(--ide-text-muted);
	}
</style>
