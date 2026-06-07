<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon, Input, Badge, Button } from '$components/core';
	import type { AIConversation } from '$types';
	import { formatRelativeTime } from '$utils/format';

	interface ConversationWithMeta extends AIConversation {
		starred?: boolean;
	}

	interface Props {
		conversations: ConversationWithMeta[];
		activeId: string | null;
		onSelect: (conversation: AIConversation) => void;
		onNew: () => void;
		onDelete?: (conversation: AIConversation) => void;
		onRename?: (conversation: AIConversation, newTitle: string) => void;
		onStar?: (conversation: AIConversation, starred: boolean) => void;
		onExport?: (conversation: AIConversation, format: 'json' | 'md') => void;
	}

	let {
		conversations,
		activeId,
		onSelect,
		onNew,
		onDelete,
		onRename,
		onStar,
		onExport
	}: Props = $props();

	let searchQuery = $state('');
	let filter = $state<'all' | 'starred' | 'today'>('all');
	let editingId = $state<string | null>(null);
	let editingTitle = $state('');
	let menuOpenId = $state<string | null>(null);
	let menuRef = $state<HTMLDivElement | null>(null);

	// Close menu when clicking outside
	onMount(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuOpenId && menuRef && !menuRef.contains(event.target as Node)) {
				menuOpenId = null;
			}
		}

		function handleEscape(event: KeyboardEvent) {
			if (event.key === 'Escape' && menuOpenId) {
				menuOpenId = null;
			}
		}

		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleEscape);

		return () => {
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
		};
	});

	// Filter conversations
	const filteredConversations = $derived(() => {
		let result = conversations;

		// Apply text search
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(c) =>
					c.title.toLowerCase().includes(query) ||
					c.messages.some((m) => m.content.toLowerCase().includes(query))
			);
		}

		// Apply filter
		if (filter === 'starred') {
			result = result.filter((c) => c.starred);
		} else if (filter === 'today') {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			result = result.filter((c) => new Date(c.updatedAt) >= today);
		}

		return result;
	});

	function startRename(conv: ConversationWithMeta) {
		editingId = conv.id;
		editingTitle = conv.title;
		menuOpenId = null;
	}

	function saveRename(conv: ConversationWithMeta) {
		if (editingTitle.trim() && editingTitle !== conv.title) {
			onRename?.(conv, editingTitle.trim());
		}
		editingId = null;
		editingTitle = '';
	}

	function cancelRename() {
		editingId = null;
		editingTitle = '';
	}

	function handleKeydown(event: KeyboardEvent, conv: ConversationWithMeta) {
		if (event.key === 'Enter') {
			saveRename(conv);
		} else if (event.key === 'Escape') {
			cancelRename();
		}
	}

	function toggleMenu(id: string) {
		menuOpenId = menuOpenId === id ? null : id;
	}

	function getPreview(conv: AIConversation): string {
		const lastMessage = conv.messages[conv.messages.length - 1];
		if (!lastMessage) return 'No messages';
		const content = lastMessage.content.slice(0, 60);
		return content + (lastMessage.content.length > 60 ? '...' : '');
	}
</script>

<div class="conversation-list">
	<!-- Header -->
	<div class="list-header">
		<h3>Conversations</h3>
		<Button variant="primary" size="sm" onclick={onNew}>
			<Icon name="plus" size={14} />
			New
		</Button>
	</div>

	<!-- Search -->
	<div class="list-search">
		<Input
			type="search"
			placeholder="Search conversations..."
			bind:value={searchQuery}
			size="sm"
		/>
	</div>

	<!-- Filters -->
	<div class="list-filters">
		<button
			class="filter-btn"
			class:active={filter === 'all'}
			onclick={() => (filter = 'all')}
		>
			All
		</button>
		<button
			class="filter-btn"
			class:active={filter === 'starred'}
			onclick={() => (filter = 'starred')}
		>
			<Icon name="star" size={12} />
			Starred
		</button>
		<button
			class="filter-btn"
			class:active={filter === 'today'}
			onclick={() => (filter = 'today')}
		>
			Today
		</button>
	</div>

	<!-- Conversation Items -->
	<div class="list-items">
		{#each filteredConversations() as conv (conv.id)}
			<div
				class="conversation-item"
				class:active={conv.id === activeId}
				class:starred={conv.starred}
			>
				{#if editingId === conv.id}
					<!-- Edit mode -->
					<input
						class="rename-input"
						type="text"
						bind:value={editingTitle}
						onblur={() => saveRename(conv)}
						onkeydown={(e) => handleKeydown(e, conv)}
					/>
				{:else}
					<!-- Normal mode -->
					<button class="item-content" onclick={() => onSelect(conv)}>
						<div class="item-header">
							<span class="item-title">{conv.title}</span>
							{#if conv.starred}
								<Icon name="star" size={12} class="star-icon" />
							{/if}
						</div>
						<p class="item-preview">{getPreview(conv)}</p>
						<div class="item-meta">
							<span>{formatRelativeTime(conv.updatedAt)}</span>
							<Badge variant="default" size="sm">{conv.messages.length}</Badge>
						</div>
					</button>

					<!-- Actions menu -->
					<div class="item-actions" bind:this={menuRef}>
						<button
							class="action-trigger"
							onclick={(e) => { e.stopPropagation(); toggleMenu(conv.id); }}
							aria-label="Conversation options"
							aria-expanded={menuOpenId === conv.id}
							aria-haspopup="menu"
						>
							<Icon name="more-vertical" size={14} />
						</button>

						{#if menuOpenId === conv.id}
							<div class="action-menu" role="menu" aria-label="Conversation actions">
								{#if onStar}
									<button role="menuitem" onclick={() => { onStar(conv, !conv.starred); menuOpenId = null; }}>
										<Icon name={conv.starred ? 'star-off' : 'star'} size={14} />
										{conv.starred ? 'Unstar' : 'Star'}
									</button>
								{/if}
								{#if onRename}
									<button role="menuitem" onclick={() => startRename(conv)}>
										<Icon name="edit" size={14} />
										Rename
									</button>
								{/if}
								{#if onExport}
									<button role="menuitem" onclick={() => { onExport(conv, 'md'); menuOpenId = null; }}>
										<Icon name="download" size={14} />
										Export Markdown
									</button>
									<button role="menuitem" onclick={() => { onExport(conv, 'json'); menuOpenId = null; }}>
										<Icon name="code" size={14} />
										Export JSON
									</button>
								{/if}
								{#if onDelete}
									<button role="menuitem" class="danger" onclick={() => { onDelete(conv); menuOpenId = null; }}>
										<Icon name="trash" size={14} />
										Delete
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<div class="empty-state">
				{#if searchQuery}
					<p>No conversations match your search</p>
				{:else if filter === 'starred'}
					<p>No starred conversations</p>
				{:else if filter === 'today'}
					<p>No conversations today</p>
				{:else}
					<p>No conversations yet</p>
					<Button variant="primary" size="sm" onclick={onNew}>
						Start a conversation
					</Button>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.conversation-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--ide-bg-secondary);
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
	}

	.list-header h3 {
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
		color: var(--ide-text-primary);
		margin: 0;
	}

	.list-search {
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
	}

	.list-filters {
		display: flex;
		gap: var(--ide-spacing-xs);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
	}

	.filter-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 36px;
		padding: 0.375rem 0.625rem;
		background: transparent;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-sm);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.filter-btn:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.filter-btn:focus-visible {
		outline: 2px solid var(--color-nocturnium-wave);
		outline-offset: 2px;
	}

	.filter-btn.active {
		background: var(--color-nocturnium-wave);
		border-color: var(--color-nocturnium-wave);
		color: var(--color-nocturnium-night);
	}

	.list-items {
		flex: 1;
		overflow-y: auto;
	}

	.conversation-item {
		position: relative;
		border-bottom: 1px solid var(--ide-border);
	}

	.conversation-item:hover {
		background: var(--ide-bg-hover);
	}

	.conversation-item.active {
		background: color-mix(in srgb, var(--color-nocturnium-wave) 15%, transparent);
		border-left: 3px solid var(--color-nocturnium-wave);
	}

	.item-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 100%;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
	}

	.item-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.item-title {
		font-size: var(--ide-font-size-sm);
		font-weight: 500;
		color: var(--ide-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-header :global(.star-icon) {
		color: var(--ide-warning);
		flex-shrink: 0;
	}

	.item-preview {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-meta {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		font-size: 10px;
		color: var(--ide-text-muted);
	}

	.item-actions {
		position: absolute;
		top: var(--ide-spacing-sm);
		right: var(--ide-spacing-sm);
	}

	.action-trigger {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--ide-radius-sm);
		color: var(--ide-text-muted);
		cursor: pointer;
		opacity: 0;
		transition: all 0.15s ease;
	}

	.conversation-item:hover .action-trigger {
		opacity: 1;
	}

	.action-trigger:hover {
		background: var(--ide-bg-secondary);
		color: var(--ide-text-primary);
	}

	.action-trigger:focus-visible {
		opacity: 1;
		outline: 2px solid var(--color-nocturnium-wave);
		outline-offset: 2px;
		background: var(--ide-bg-hover);
	}

	.action-menu {
		position: absolute;
		top: 100%;
		right: 0;
		z-index: 100;
		min-width: 150px;
		background: var(--ide-bg-elevated);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		overflow: hidden;
	}

	.action-menu button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 40px;
		padding: 0.625rem 0.75rem;
		background: transparent;
		border: none;
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-primary);
		cursor: pointer;
		text-align: left;
	}

	.action-menu button:hover {
		background: var(--ide-bg-hover);
	}

	.action-menu button:focus-visible {
		outline: none;
		background: var(--ide-bg-hover);
		box-shadow: inset 0 0 0 2px var(--color-nocturnium-wave);
	}

	.action-menu button.danger {
		color: var(--ide-error);
	}

	.action-menu button.danger:hover {
		background: color-mix(in srgb, var(--ide-error) 15%, transparent);
	}

	.action-menu button.danger:focus-visible {
		box-shadow: inset 0 0 0 2px var(--ide-error);
	}

	.rename-input {
		width: 100%;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-primary);
		border: 2px solid var(--color-nocturnium-wave);
		border-radius: 0;
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-primary);
	}

	.rename-input:focus {
		outline: none;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--ide-spacing-md);
		padding: var(--ide-spacing-xl);
		text-align: center;
	}

	.empty-state p {
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-muted);
		margin: 0;
	}
</style>
