<script lang="ts">
	import Editor from './Editor.svelte';
	import EditorTabs from './EditorTabs.svelte';
	import type { EditorPreferences } from '$types';
	import type { AIAwareness } from './core/ai-awareness';
	import {
		getTabs,
		getActiveTab,
		getActiveTabId,
		setActiveTab,
		closeTab,
		updateContent,
		markSaved,
		updateCursor
	} from '$stores/editor.svelte';

	interface Props {
		preferences?: Partial<EditorPreferences>;
		folding?: boolean;
		multiCursor?: boolean;
		maxCursors?: number;
		aiAgents?: AIAwareness[];
		onSave?: (path: string, content: string) => Promise<void>;
		class?: string;
	}

	let {
		preferences = {},
		folding = true,
		multiCursor = true,
		maxCursors = 100,
		aiAgents = [],
		onSave,
		class: className = ''
	}: Props = $props();

	// Use getter functions for reactive access
	let tabs = $derived(getTabs());
	let activeTab = $derived(getActiveTab());
	let activeTabId = $derived(getActiveTabId());

	async function handleSave() {
		if (!activeTab) return;

		if (onSave) {
			await onSave(activeTab.path, activeTab.content);
		}
		markSaved(activeTab.id);
	}

	function handleChange(content: string) {
		if (activeTab) {
			updateContent(activeTab.id, content);
		}
	}

	function handleCursorChange(line: number, column: number) {
		if (activeTab) {
			updateCursor(activeTab.id, { line, column });
		}
	}

	function handleCloseTab(tabId: string) {
		const tab = tabs.find((t) => t.id === tabId);
		if (tab?.isDirty) {
			// Could show confirmation dialog
			if (!confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) {
				return;
			}
		}
		closeTab(tabId);
	}
</script>

<div class="editor-pane {className}">
	{#if tabs.length > 0}
		<EditorTabs {tabs} {activeTabId} onSelect={setActiveTab} onClose={handleCloseTab} />

		{#if activeTab}
			<div class="editor-pane__content">
				<Editor
					content={activeTab.content}
					language={activeTab.language}
					readonly={activeTab.aiEditing}
					{preferences}
					{folding}
					{multiCursor}
					{maxCursors}
					{aiAgents}
					onChange={handleChange}
					onCursorChange={handleCursorChange}
					onSave={handleSave}
				/>
			</div>
		{/if}
	{:else}
		<div class="editor-pane__empty">
			<p>No files open</p>
			<p class="editor-pane__hint">
				Open a file from the explorer or use <kbd>Cmd/Ctrl+P</kbd> to quick open
			</p>
		</div>
	{/if}
</div>

<style>
	.editor-pane {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--ide-bg-primary);
	}

	.editor-pane__content {
		flex: 1;
		min-height: 0;
	}

	.editor-pane__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		color: var(--ide-text-muted);
	}

	.editor-pane__empty p {
		margin: 0;
	}

	.editor-pane__hint {
		margin-top: var(--ide-spacing-sm) !important;
		font-size: var(--ide-font-size-xs);
	}

	.editor-pane__hint kbd {
		padding: 2px 6px;
		font-family: var(--ide-font-mono);
		font-size: 10px;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-sm);
	}
</style>
