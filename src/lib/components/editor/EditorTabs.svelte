<script lang="ts">
	import { Icon, Tooltip } from '$components/core';
	import FileIcon from './FileIcon.svelte';
	import type { EditorTab } from '$types';

	interface Props {
		tabs: EditorTab[];
		activeTabId: string | null;
		onSelect: (tabId: string) => void;
		onClose: (tabId: string) => void;
		onContextMenu?: (tabId: string, event: MouseEvent) => void;
		class?: string;
	}

	let {
		tabs,
		activeTabId,
		onSelect,
		onClose,
		onContextMenu,
		class: className = ''
	}: Props = $props();

	function handleClose(event: MouseEvent, tabId: string) {
		event.stopPropagation();
		onClose(tabId);
	}

	function handleContextMenu(event: MouseEvent, tabId: string) {
		event.preventDefault();
		onContextMenu?.(tabId, event);
	}
</script>

<div class="editor-tabs {className}" role="tablist">
	{#each tabs as tab (tab.id)}
		<div
			class="editor-tabs__tab"
			class:editor-tabs__tab--active={tab.id === activeTabId}
			class:editor-tabs__tab--dirty={tab.isDirty}
			class:editor-tabs__tab--ai={tab.aiEditing}
			role="tab"
			tabindex={0}
			aria-selected={tab.id === activeTabId}
			onclick={() => onSelect(tab.id)}
			onkeydown={(e) => e.key === 'Enter' && onSelect(tab.id)}
			oncontextmenu={(e) => handleContextMenu(e, tab.id)}
		>
			<FileIcon filename={tab.name} size={14} />
			<span class="editor-tabs__name">{tab.name}</span>
			{#if tab.isDirty}
				<span class="editor-tabs__dirty"></span>
			{/if}
			{#if tab.aiEditing}
				<Tooltip content="AI is editing" position="bottom">
					<Icon name="sparkles" size={12} class="editor-tabs__ai-icon" />
				</Tooltip>
			{/if}
			<button
				class="editor-tabs__close"
				onclick={(e) => handleClose(e, tab.id)}
				aria-label="Close tab"
			>
				<Icon name="close" size={12} />
			</button>
		</div>
	{/each}
</div>

<style>
	.editor-tabs {
		display: flex;
		align-items: stretch;
		height: var(--ide-tab-height);
		background: var(--ide-bg-secondary);
		border-bottom: 1px solid var(--ide-border);
		overflow-x: auto;
		overflow-y: hidden;
	}

	.editor-tabs::-webkit-scrollbar {
		height: 3px;
	}

	.editor-tabs__tab {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		padding: 0 var(--ide-spacing-sm);
		min-width: 100px;
		max-width: 200px;
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		background: transparent;
		border: none;
		border-right: 1px solid var(--ide-border);
		cursor: pointer;
		transition: all var(--ide-transition-fast);
	}

	.editor-tabs__tab:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.editor-tabs__tab--active {
		background: var(--ide-bg-primary);
		color: var(--ide-text-primary);
		border-bottom: 2px solid var(--ide-interactive);
	}

	.editor-tabs__tab--dirty .editor-tabs__name {
		font-style: italic;
	}

	.editor-tabs__tab--ai {
		border-top: 2px solid var(--ide-ai-assistant);
	}

	.editor-tabs__name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}

	.editor-tabs__dirty {
		width: 6px;
		height: 6px;
		background: var(--ide-text-accent);
		border-radius: 50%;
		flex-shrink: 0;
	}

	.editor-tabs__tab--active .editor-tabs__dirty {
		background: var(--ide-interactive);
	}

	.editor-tabs :global(.editor-tabs__ai-icon) {
		color: var(--ide-ai-assistant);
		animation: ide-pulse 2s infinite;
	}

	.editor-tabs__close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		padding: 0;
		color: var(--ide-text-muted);
		background: transparent;
		border: none;
		border-radius: var(--ide-radius-sm);
		cursor: pointer;
		opacity: 0;
		transition: all var(--ide-transition-fast);
	}

	.editor-tabs__tab:hover .editor-tabs__close {
		opacity: 1;
	}

	.editor-tabs__close:hover {
		background: var(--ide-bg-tertiary);
		color: var(--ide-text-primary);
	}
</style>
