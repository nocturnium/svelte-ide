<script lang="ts">
/**
 * VersionConflictDialog Component
 *
 * Displays when a file version conflict is detected, allowing the user
 * to choose how to resolve the conflict (merge, overwrite, or discard).
 */

interface ConflictDetails {
	path: string;
	localVersion: number;
	serverVersion: number;
	localContent: string;
	serverContent: string;
	baseContent?: string;
	lastModifiedBy?: string;
	lastModifiedAt?: string;
}

interface Props {
	conflict: ConflictDetails;
	onResolve: (resolution: 'merge' | 'overwrite' | 'discard', mergedContent?: string) => void;
	onCancel: () => void;
}

let { conflict, onResolve, onCancel }: Props = $props();

// View state
let activeView = $state<'side-by-side' | 'unified' | 'local' | 'server'>('side-by-side');
let mergedContent = $state(conflict.localContent);
let showMergeEditor = $state(false);

// Computed
let fileName = $derived(conflict.path.split('/').pop() ?? conflict.path);
let hasChanges = $derived(mergedContent !== conflict.localContent);

// Line diff (simplified)
let localLines = $derived(conflict.localContent.split('\n'));
let serverLines = $derived(conflict.serverContent.split('\n'));

function handleOverwrite() {
	onResolve('overwrite', conflict.localContent);
}

function handleDiscard() {
	onResolve('discard');
}

function handleMerge() {
	if (showMergeEditor) {
		onResolve('merge', mergedContent);
	} else {
		showMergeEditor = true;
	}
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		onCancel();
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="conflict-overlay" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
	<div class="conflict-dialog">
		<header class="conflict-header">
			<div class="conflict-title-row">
				<svg
					class="conflict-icon"
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
					<line x1="12" y1="9" x2="12" y2="13" />
					<line x1="12" y1="17" x2="12.01" y2="17" />
				</svg>
				<h2 id="conflict-title">Version Conflict</h2>
			</div>
			<button class="close-btn" onclick={onCancel} aria-label="Close">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<div class="conflict-info">
			<p class="conflict-message">
				<strong>{fileName}</strong> was modified by someone else while you were editing.
			</p>
			<div class="version-badges">
				<span class="version-badge local">
					Your version: v{conflict.localVersion}
				</span>
				<span class="version-badge server">
					Server version: v{conflict.serverVersion}
					{#if conflict.lastModifiedBy}
						<span class="modified-by">by {conflict.lastModifiedBy}</span>
					{/if}
				</span>
			</div>
		</div>

		<div class="view-controls">
			<div class="view-tabs" role="tablist">
				<button
					class="view-tab"
					class:active={activeView === 'side-by-side'}
					onclick={() => (activeView = 'side-by-side')}
					role="tab"
					aria-selected={activeView === 'side-by-side'}
				>
					Side by Side
				</button>
				<button
					class="view-tab"
					class:active={activeView === 'local'}
					onclick={() => (activeView = 'local')}
					role="tab"
					aria-selected={activeView === 'local'}
				>
					Your Version
				</button>
				<button
					class="view-tab"
					class:active={activeView === 'server'}
					onclick={() => (activeView = 'server')}
					role="tab"
					aria-selected={activeView === 'server'}
				>
					Server Version
				</button>
			</div>
		</div>

		<div class="diff-container">
			{#if activeView === 'side-by-side'}
				<div class="side-by-side">
					<div class="diff-pane local">
						<div class="pane-header">
							<span class="pane-label">Your Changes</span>
							<span class="line-count">{localLines.length} lines</span>
						</div>
						<div class="pane-content">
							<pre><code>{conflict.localContent}</code></pre>
						</div>
					</div>
					<div class="diff-pane server">
						<div class="pane-header">
							<span class="pane-label">Server Version</span>
							<span class="line-count">{serverLines.length} lines</span>
						</div>
						<div class="pane-content">
							<pre><code>{conflict.serverContent}</code></pre>
						</div>
					</div>
				</div>
			{:else if activeView === 'local'}
				<div class="single-pane">
					<div class="pane-header">
						<span class="pane-label">Your Changes</span>
						<span class="line-count">{localLines.length} lines</span>
					</div>
					<div class="pane-content">
						<pre><code>{conflict.localContent}</code></pre>
					</div>
				</div>
			{:else if activeView === 'server'}
				<div class="single-pane">
					<div class="pane-header">
						<span class="pane-label">Server Version</span>
						<span class="line-count">{serverLines.length} lines</span>
					</div>
					<div class="pane-content">
						<pre><code>{conflict.serverContent}</code></pre>
					</div>
				</div>
			{/if}

			{#if showMergeEditor}
				<div class="merge-editor">
					<div class="pane-header">
						<span class="pane-label">Merged Result</span>
						{#if hasChanges}
							<span class="modified-indicator">Modified</span>
						{/if}
					</div>
					<textarea
						class="merge-textarea"
						bind:value={mergedContent}
						spellcheck="false"
					></textarea>
				</div>
			{/if}
		</div>

		<footer class="conflict-footer">
			<div class="action-group secondary">
				<button class="action-btn cancel" onclick={onCancel}>
					Cancel
				</button>
			</div>
			<div class="action-group primary">
				<button class="action-btn discard" onclick={handleDiscard}>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
					</svg>
					Use Server Version
				</button>
				<button class="action-btn merge" onclick={handleMerge}>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="18" cy="18" r="3" />
						<circle cx="6" cy="6" r="3" />
						<path d="M6 21V9a9 9 0 0 0 9 9" />
					</svg>
					{showMergeEditor ? 'Save Merge' : 'Merge Changes'}
				</button>
				<button class="action-btn overwrite" onclick={handleOverwrite}>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
					</svg>
					Overwrite with Mine
				</button>
			</div>
		</footer>
	</div>
</div>

<style>
	.conflict-overlay {
		position: fixed;
		inset: 0;
		background: var(--ide-bg-overlay, rgba(0, 0, 0, 0.75));
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.conflict-dialog {
		background: var(--ide-bg-primary, #1e1e1e);
		border: 1px solid var(--ide-border, #3c3c3c);
		border-radius: 8px;
		width: 100%;
		max-width: 1000px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
	}

	.conflict-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--ide-border, #3c3c3c);
	}

	.conflict-title-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.conflict-icon {
		color: var(--ide-warning, #e5c07b);
	}

	.conflict-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--ide-text-primary, #e0e0e0);
	}

	.close-btn {
		background: transparent;
		border: none;
		color: var(--ide-text-muted, #808080);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		color: var(--ide-text-primary, #e0e0e0);
		background: var(--ide-bg-hover, #3c3c3c);
	}

	.conflict-info {
		padding: 16px 20px;
		background: var(--ide-bg-secondary, #252526);
		border-bottom: 1px solid var(--ide-border, #3c3c3c);
	}

	.conflict-message {
		margin: 0 0 12px;
		color: var(--ide-text-secondary, #a0a0a0);
		font-size: 14px;
	}

	.conflict-message strong {
		color: var(--ide-text-primary, #e0e0e0);
	}

	.version-badges {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	.version-badge {
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		font-family: var(--ide-font-mono, monospace);
	}

	.version-badge.local {
		background: var(--ide-accent, #569cd6);
		color: white;
	}

	.version-badge.server {
		background: var(--ide-warning, #e5c07b);
		color: var(--ide-bg-primary, #1e1e1e);
	}

	.modified-by {
		opacity: 0.8;
		margin-left: 4px;
	}

	.view-controls {
		padding: 0 20px;
		border-bottom: 1px solid var(--ide-border, #3c3c3c);
	}

	.view-tabs {
		display: flex;
		gap: 0;
	}

	.view-tab {
		padding: 12px 16px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--ide-text-muted, #808080);
		font-size: 13px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.view-tab:hover {
		color: var(--ide-text-primary, #e0e0e0);
	}

	.view-tab.active {
		color: var(--ide-accent, #569cd6);
		border-bottom-color: var(--ide-accent, #569cd6);
	}

	.diff-container {
		flex: 1;
		overflow: auto;
		min-height: 300px;
		max-height: 50vh;
	}

	.side-by-side {
		display: grid;
		grid-template-columns: 1fr 1fr;
		height: 100%;
	}

	.diff-pane {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--ide-border, #3c3c3c);
	}

	.diff-pane:last-child {
		border-right: none;
	}

	.single-pane {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.pane-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: var(--ide-bg-secondary, #252526);
		border-bottom: 1px solid var(--ide-border, #3c3c3c);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.pane-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--ide-text-secondary, #a0a0a0);
	}

	.diff-pane.local .pane-label {
		color: var(--ide-accent, #569cd6);
	}

	.diff-pane.server .pane-label {
		color: var(--ide-warning, #e5c07b);
	}

	.line-count {
		font-size: 11px;
		color: var(--ide-text-muted, #808080);
		font-family: var(--ide-font-mono, monospace);
	}

	.pane-content {
		flex: 1;
		overflow: auto;
		padding: 12px;
	}

	.pane-content pre {
		margin: 0;
		font-family: var(--ide-font-mono, monospace);
		font-size: 13px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.pane-content code {
		color: var(--ide-text-primary, #e0e0e0);
	}

	.merge-editor {
		border-top: 1px solid var(--ide-border, #3c3c3c);
		display: flex;
		flex-direction: column;
	}

	.modified-indicator {
		font-size: 11px;
		color: var(--ide-warning, #e5c07b);
	}

	.merge-textarea {
		flex: 1;
		min-height: 150px;
		padding: 12px;
		background: var(--ide-bg-primary, #1e1e1e);
		border: none;
		color: var(--ide-text-primary, #e0e0e0);
		font-family: var(--ide-font-mono, monospace);
		font-size: 13px;
		line-height: 1.5;
		resize: vertical;
	}

	.merge-textarea:focus {
		outline: none;
		background: var(--ide-bg-secondary, #252526);
	}

	.conflict-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-top: 1px solid var(--ide-border, #3c3c3c);
		background: var(--ide-bg-secondary, #252526);
	}

	.action-group {
		display: flex;
		gap: 8px;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border: none;
		border-radius: 4px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn.cancel {
		background: transparent;
		color: var(--ide-text-muted, #808080);
	}

	.action-btn.cancel:hover {
		color: var(--ide-text-primary, #e0e0e0);
	}

	.action-btn.discard {
		background: var(--ide-bg-tertiary, #2d2d2d);
		color: var(--ide-text-primary, #e0e0e0);
		border: 1px solid var(--ide-border, #3c3c3c);
	}

	.action-btn.discard:hover {
		background: var(--ide-bg-hover, #3c3c3c);
	}

	.action-btn.merge {
		background: var(--ide-accent, #569cd6);
		color: white;
	}

	.action-btn.merge:hover {
		background: var(--ide-accent-hover, #4a8bc4);
	}

	.action-btn.overwrite {
		background: var(--ide-warning, #e5c07b);
		color: var(--ide-bg-primary, #1e1e1e);
	}

	.action-btn.overwrite:hover {
		filter: brightness(1.1);
	}
</style>
