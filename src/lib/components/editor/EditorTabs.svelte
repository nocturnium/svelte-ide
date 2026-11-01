<script lang="ts">
	import { tick } from 'svelte';
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

	// Roving tabindex (WAI-ARIA tabs pattern): the tab strip is one Tab stop. The stop
	// follows focus, falls back to the active tab, then to the first tab.
	let focusedId = $state<string | null>(null);
	let tabsEl = $state<HTMLElement | null>(null);

	const stopId = $derived(
		tabs.some((t) => t.id === focusedId)
			? focusedId
			: tabs.some((t) => t.id === activeTabId)
				? activeTabId
				: (tabs[0]?.id ?? null)
	);

	function tabLabel(tab: EditorTab): string {
		return tab.isDirty ? `${tab.name}, unsaved changes` : tab.name;
	}

	function handleTabKeydown(event: KeyboardEvent, tabId: string) {
		// Keys pressed on the close button belong to the button, not the tab
		if (event.target !== event.currentTarget) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;

		const index = tabs.findIndex((t) => t.id === tabId);
		const focusAt = (i: number) => {
			const next = tabs[(i + tabs.length) % tabs.length];
			if (!next) return;
			tabsEl?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(next.id)}"]`)?.focus();
		};

		switch (event.key) {
			case 'ArrowRight':
				event.preventDefault();
				focusAt(index + 1);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				focusAt(index - 1);
				break;
			case 'Home':
				event.preventDefault();
				focusAt(0);
				break;
			case 'End':
				event.preventDefault();
				focusAt(tabs.length - 1);
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				onSelect(tabId);
				break;
			case 'Delete':
				// Keyboard route to close: the close buttons are not Tab stops
				event.preventDefault();
				onClose(tabId);
				// The focused tab is about to disappear: hand focus to its neighbour
				void tick().then(() => {
					const neighbour = tabs[Math.min(index, tabs.length - 1)];
					if (neighbour) focusAt(tabs.indexOf(neighbour));
				});
				break;
		}
	}
</script>

<div class="editor-tabs {className}" role="tablist" bind:this={tabsEl}>
	{#each tabs as tab (tab.id)}
		<div
			class="editor-tabs__tab"
			class:editor-tabs__tab--active={tab.id === activeTabId}
			class:editor-tabs__tab--dirty={tab.isDirty}
			class:editor-tabs__tab--ai={tab.aiEditing}
			role="tab"
			data-tab-id={tab.id}
			tabindex={stopId === tab.id ? 0 : -1}
			aria-label={tabLabel(tab)}
			aria-selected={tab.id === activeTabId}
			onfocus={() => (focusedId = tab.id)}
			onclick={() => onSelect(tab.id)}
			onkeydown={(e) => handleTabKeydown(e, tab.id)}
			oncontextmenu={(e) => handleContextMenu(e, tab.id)}
		>
			<FileIcon filename={tab.name} size={14} />
			<span class="editor-tabs__name">{tab.name}</span>
			{#if tab.isDirty}
				<span class="editor-tabs__dirty" title="Unsaved changes" aria-hidden="true"></span>
			{/if}
			{#if tab.aiEditing}
				<Tooltip content="AI is editing" position="bottom">
					<Icon name="sparkles" size={12} class="editor-tabs__ai-icon" />
				</Tooltip>
			{/if}
			<button
				class="editor-tabs__close"
				onclick={(e) => handleClose(e, tab.id)}
				aria-label="Close {tab.name}"
				tabindex={-1}
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
		/* Pad the hit area to 24px (WCAG 2.5.8) without growing the glyph box */
		position: relative;
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

	.editor-tabs__close::after {
		content: '';
		position: absolute;
		inset: -3px;
	}

	/* Reachable by keyboard: show the close button when it or its tab has focus */
	.editor-tabs__tab:focus-within .editor-tabs__close,
	.editor-tabs__close:focus-visible {
		opacity: 1;
	}

	.editor-tabs__close:focus-visible {
		outline: 2px solid var(--ide-focus-ring);
		outline-offset: 1px;
	}

	@media (pointer: coarse) {
		.editor-tabs__close {
			opacity: 1;
			width: 24px;
			height: 24px;
		}

		.editor-tabs__close::after {
			inset: -10px;
		}
	}

	.editor-tabs__close:hover {
		background: var(--ide-bg-tertiary);
		color: var(--ide-text-primary);
	}

	@media (prefers-reduced-motion: reduce) {
		.editor-tabs :global(.editor-tabs__ai-icon) {
			animation: none;
		}
	}
</style>
