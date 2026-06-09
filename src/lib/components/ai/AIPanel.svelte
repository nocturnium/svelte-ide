<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Icon, Spinner, Avatar } from '$components/core';
	import {
		getMessages,
		getIsStreaming,
		sendMessage,
		createConversation,
		deleteConversation as deleteConv,
		getConversations,
		getActiveConversationId,
		setActiveConversation,
		getActiveConversation,
		getError,
		clearError
	} from '$stores/ai.svelte';
	import {
		initPersistence,
		saveConversation,
		autoSaveConversation,
		loadConversations,
		deleteConversation as deletePersisted,
		toggleStarConversation,
		exportConversationMarkdown,
		exportConversationJSON
	} from '$stores/ai-persistence.svelte';
	import AIMessage from './AIMessage.svelte';
	import AIConversationList from './AIConversationList.svelte';
	import type { AIConversation, AIMessage as AIMessageType } from '$types';

	interface Props {
		class?: string;
		showSidebar?: boolean;
	}

	let { class: className = '', showSidebar = false }: Props = $props();

	let inputValue = $state('');
	let messagesContainer: HTMLDivElement;
	let textareaEl: HTMLTextAreaElement;
	// Writable derived: tracks the prop, but can be toggled locally (Svelte ≥5.25).
	let sidebarOpen = $derived(showSidebar);
	let persistedConversations = $state<AIConversation[]>([]);

	// Auto-resize textarea without causing cursor jump
	function autoResizeTextarea() {
		if (!textareaEl) return;
		// Set to auto first to get accurate scrollHeight, then clamp
		textareaEl.style.height = 'auto';
		textareaEl.style.height = Math.min(textareaEl.scrollHeight, 120) + 'px';
	}

	// Reset textarea height after submit
	function resetTextareaHeight() {
		if (!textareaEl) return;
		textareaEl.style.height = '';
	}

	// Initialize persistence on mount
	onMount(async () => {
		await initPersistence();
		persistedConversations = await loadConversations();
	});

	// Auto-scroll to bottom when new messages arrive
	$effect(() => {
		if (messagesContainer && getMessages().length > 0) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	// Auto-save conversation when messages change. Use the debounced helper (not
	// saveConversation) so a burst of streamed tokens collapses into one write and
	// the persistence call is deferred out of this effect's synchronous run.
	$effect(() => {
		const conv = getActiveConversation();
		if (conv && getMessages().length > 0) {
			autoSaveConversation(conv);
		}
	});

	let isSubmitting = $state(false);

	async function handleSubmit() {
		if (!inputValue.trim() || getIsStreaming() || isSubmitting) return;

		const message = inputValue.trim();
		inputValue = '';
		isSubmitting = true;
		resetTextareaHeight();

		try {
			await sendMessage(message);
		} finally {
			isSubmitting = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSubmit();
		}
	}

	function handleNewConversation() {
		createConversation();
	}

	function handleSelectConversation(conv: AIConversation) {
		setActiveConversation(conv.id);
		if (window.innerWidth < 768) {
			sidebarOpen = false;
		}
	}

	async function handleDeleteConversation(conv: AIConversation) {
		deleteConv(conv.id);
		await deletePersisted(conv.id);
		persistedConversations = await loadConversations();
	}

	async function handleRenameConversation(conv: AIConversation, newTitle: string) {
		// Update in store and persistence
		const updated = { ...conv, title: newTitle };
		await saveConversation(updated);
		persistedConversations = await loadConversations();
	}

	async function handleStarConversation(conv: AIConversation, starred: boolean) {
		await toggleStarConversation(conv.id, starred);
		persistedConversations = await loadConversations();
	}

	function handleExportConversation(conv: AIConversation, format: 'json' | 'md') {
		const content =
			format === 'md' ? exportConversationMarkdown(conv) : exportConversationJSON(conv);
		const blob = new Blob([content], {
			type: format === 'md' ? 'text/markdown' : 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${conv.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.${format === 'md' ? 'md' : 'json'}`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleCopyMessage(msg: AIMessageType) {
		navigator.clipboard.writeText(msg.content);
	}

	function handleRetryMessage(msg: AIMessageType) {
		if (msg.role === 'user') {
			inputValue = msg.content;
		} else {
			// Regenerate from last user message
			const userMessages = getMessages().filter((m) => m.role === 'user');
			const lastUserMessage = userMessages[userMessages.length - 1];
			if (lastUserMessage) {
				sendMessage(lastUserMessage.content);
			}
		}
	}

	// Combine persisted and in-memory conversations
	const allConversations = $derived.by(() => {
		// Use in-memory conversations as source of truth, merge with persisted metadata
		const convMap = new Map(persistedConversations.map((c) => [c.id, c]));
		return getConversations().map((conv) => ({
			...conv,
			starred: (convMap.get(conv.id) as AIConversation & { starred?: boolean })?.starred || false
		}));
	});
</script>

<div class="ai-panel {className}" class:ai-panel--with-sidebar={sidebarOpen}>
	<!-- Sidebar -->
	{#if sidebarOpen}
		<div class="ai-panel__sidebar">
			<AIConversationList
				conversations={allConversations}
				activeId={getActiveConversationId()}
				onSelect={handleSelectConversation}
				onNew={handleNewConversation}
				onDelete={handleDeleteConversation}
				onRename={handleRenameConversation}
				onStar={handleStarConversation}
				onExport={handleExportConversation}
			/>
		</div>
	{/if}

	<!-- Main Panel -->
	<div class="ai-panel__main">
		<!-- Header -->
		<div class="ai-panel__header">
			<div class="ai-panel__header-left">
				<Button
					variant="ghost"
					size="xs"
					onclick={() => (sidebarOpen = !sidebarOpen)}
					title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
				>
					<Icon name={sidebarOpen ? 'panel-left-close' : 'panel-left'} size={14} />
				</Button>
				<div class="ai-panel__title">
					<Icon name="sparkles" size={16} />
					<span>AI Assistant</span>
				</div>
				<span class="ai-panel__mock-badge">Demo mock - no real model</span>
			</div>
			<div class="ai-panel__actions">
				<Button variant="ghost" size="xs" onclick={handleNewConversation} title="New conversation">
					<Icon name="plus" size={14} />
				</Button>
			</div>
		</div>

		<!-- Messages -->
		<div
			class="ai-panel__messages"
			bind:this={messagesContainer}
			role="log"
			aria-live="polite"
			aria-label="Conversation messages"
		>
			{#if getMessages().length === 0}
				<div class="ai-panel__empty">
					<div class="ai-panel__empty-icon">
						<Icon name="message-circle" size={40} />
					</div>
					<h3>Start a conversation</h3>
					<p>Ask questions, request code changes, or get explanations about your code.</p>
					<div class="ai-panel__suggestions">
						<button class="suggestion-chip" onclick={() => (inputValue = 'Explain this code')}>
							Explain this code
						</button>
						<button class="suggestion-chip" onclick={() => (inputValue = 'Find bugs in this file')}>
							Find bugs
						</button>
						<button
							class="suggestion-chip"
							onclick={() => (inputValue = 'Write tests for this function')}
						>
							Write tests
						</button>
					</div>
				</div>
			{:else}
				{#each getMessages() as message (message.id)}
					<AIMessage {message} onCopy={handleCopyMessage} onRetry={handleRetryMessage} />
				{/each}
				{#if getIsStreaming()}
					<div class="ai-panel__typing">
						<Avatar name="AI" isAI size="sm" />
						<div class="ai-panel__typing-indicator">
							<span></span>
							<span></span>
							<span></span>
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Error display -->
		{#if getError()}
			<div class="ai-panel__error">
				<Icon name="alert-circle" size={14} />
				<span>{getError()}</span>
				<Button variant="ghost" size="xs" onclick={clearError}>
					<Icon name="x" size={12} />
				</Button>
			</div>
		{/if}

		<!-- Input -->
		<div class="ai-panel__input">
			<textarea
				bind:this={textareaEl}
				bind:value={inputValue}
				class="ai-panel__textarea"
				placeholder="Ask AI anything... (Enter to send, Shift+Enter for new line)"
				rows={1}
				disabled={getIsStreaming() || isSubmitting}
				onkeydown={handleKeydown}
				oninput={autoResizeTextarea}
				aria-label="Message input"
			></textarea>
			<Button
				variant="primary"
				size="sm"
				disabled={!inputValue.trim() || getIsStreaming() || isSubmitting}
				onclick={handleSubmit}
				aria-label={getIsStreaming() || isSubmitting ? 'Sending message...' : 'Send message'}
			>
				{#if getIsStreaming() || isSubmitting}
					<Spinner size="sm" />
				{:else}
					<Icon name="send" size={14} />
				{/if}
			</Button>
		</div>
	</div>
</div>

<style>
	.ai-panel {
		display: flex;
		height: 100%;
		background: var(--ide-bg-primary);
	}

	.ai-panel__sidebar {
		width: 280px;
		border-right: 1px solid var(--ide-border);
		flex-shrink: 0;
	}

	.ai-panel__main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.ai-panel__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
		background: var(--ide-bg-secondary);
	}

	.ai-panel__header-left {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		min-width: 0;
	}

	.ai-panel__title {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
		color: var(--ide-text-primary);
		flex-shrink: 0;
	}

	.ai-panel__mock-badge {
		display: inline-flex;
		align-items: center;
		min-width: 0;
		padding: 0.125rem var(--ide-spacing-sm);
		border: 1px solid color-mix(in srgb, var(--ide-accent) 40%, var(--ide-border));
		border-radius: var(--ide-radius-full);
		background: color-mix(in srgb, var(--ide-accent) 10%, var(--ide-bg-secondary));
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-xs);
		font-weight: 500;
		line-height: var(--ide-line-height-normal);
		white-space: nowrap;
	}

	.ai-panel__actions {
		display: flex;
		gap: var(--ide-spacing-xs);
	}

	.ai-panel__messages {
		flex: 1;
		overflow-y: auto;
		padding: var(--ide-spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-sm);
	}

	.ai-panel__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		padding: var(--ide-spacing-xl);
	}

	.ai-panel__empty-icon {
		margin-bottom: var(--ide-spacing-md);
		color: var(--ide-text-muted);
		opacity: 0.5;
	}

	.ai-panel__empty h3 {
		margin: 0 0 var(--ide-spacing-xs);
		font-size: var(--ide-font-size-md);
		font-weight: 600;
		color: var(--ide-text-primary);
	}

	.ai-panel__empty p {
		margin: 0 0 var(--ide-spacing-lg);
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-muted);
		max-width: 280px;
	}

	.ai-panel__suggestions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--ide-spacing-xs);
	}

	.suggestion-chip {
		padding: 0.375rem 0.75rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-full);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.suggestion-chip:hover {
		background: var(--color-nocturnium-wave);
		border-color: var(--color-nocturnium-wave);
		color: var(--color-nocturnium-night);
	}

	.ai-panel__typing {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) 0;
	}

	.ai-panel__typing-indicator {
		display: flex;
		gap: 4px;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border-radius: var(--ide-radius-lg);
	}

	.ai-panel__typing-indicator span {
		width: 6px;
		height: 6px;
		background: var(--ide-text-muted);
		border-radius: 50%;
		animation: typing-bounce 1.4s infinite ease-in-out;
	}

	.ai-panel__typing-indicator span:nth-child(1) {
		animation-delay: 0s;
	}

	.ai-panel__typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.ai-panel__typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing-bounce {
		0%,
		60%,
		100% {
			transform: translateY(0);
		}
		30% {
			transform: translateY(-4px);
		}
	}

	.ai-panel__error {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: color-mix(in srgb, var(--ide-error) 15%, transparent);
		color: var(--ide-error);
		font-size: var(--ide-font-size-xs);
	}

	.ai-panel__error span {
		flex: 1;
	}

	.ai-panel__input {
		display: flex;
		align-items: flex-end;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-md);
		border-top: 1px solid var(--ide-border);
		background: var(--ide-bg-secondary);
	}

	.ai-panel__textarea {
		flex: 1;
		min-height: 40px;
		max-height: 120px;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-sm);
		line-height: var(--ide-line-height-normal);
		background: var(--ide-bg-primary);
		color: var(--ide-text-primary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		resize: none;
		transition: border-color var(--ide-transition-fast);
	}

	.ai-panel__textarea:focus {
		outline: none;
		border-color: var(--color-nocturnium-wave);
	}

	.ai-panel__textarea::placeholder {
		color: var(--ide-text-muted);
	}

	.ai-panel__textarea:disabled {
		opacity: 0.5;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.ai-panel__sidebar {
			width: 260px;
		}
	}

	@media (max-width: 768px) {
		.ai-panel__sidebar {
			position: absolute;
			left: 0;
			top: 0;
			bottom: 0;
			z-index: 10;
			width: calc(100% - 48px);
			max-width: 300px;
			background: var(--ide-bg-primary);
			box-shadow: 4px 0 12px rgba(0, 0, 0, 0.3);
		}

		.ai-panel__messages {
			padding: var(--ide-spacing-sm);
		}

		.ai-panel__input {
			padding: var(--ide-spacing-sm);
		}

		.ai-panel__mock-badge {
			white-space: normal;
		}
	}

	@media (max-width: 480px) {
		.ai-panel__sidebar {
			width: calc(100% - 24px);
		}

		.ai-panel__empty {
			padding: var(--ide-spacing-md);
		}

		.ai-panel__empty p {
			max-width: 100%;
		}

		.ai-panel__suggestions {
			flex-direction: column;
			align-items: stretch;
		}

		.suggestion-chip {
			text-align: center;
		}
	}
</style>
