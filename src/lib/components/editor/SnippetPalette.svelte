<script lang="ts">
	/**
	 * Snippet Palette
	 *
	 * A searchable palette for browsing and inserting code snippets.
	 * Supports filtering by category and shows live preview.
	 */

	import { onMount } from 'svelte';
	import type { SnippetManager, Snippet } from './core/snippet-manager';

	interface Props {
		/** Snippet manager instance */
		manager: SnippetManager;
		/** Current language for filtering */
		language?: string;
		/** Whether palette is open */
		open?: boolean;
		/** Callback when snippet is selected */
		onSelect?: (snippet: Snippet) => void;
		/** Callback when closed */
		onClose?: () => void;
	}

	let {
		manager,
		language = 'javascript',
		open = false,
		onSelect,
		onClose
	}: Props = $props();

	let searchQuery = $state('');
	let selectedCategory = $state<string | null>(null);
	let selectedIndex = $state(0);
	let searchInput = $state<HTMLInputElement>(null!);
	let hoveredSnippet = $state<Snippet | null>(null);

	// Get snippets for current language
	const allSnippets = $derived(manager.getSnippetsForLanguage(language));
	const categories = $derived(['All', ...manager.getCategories(language)]);

	// Filter snippets
	const filteredSnippets = $derived.by(() => {
		let snippets = allSnippets;

		// Filter by category
		if (selectedCategory && selectedCategory !== 'All') {
			snippets = snippets.filter((s) => s.category === selectedCategory);
		}

		// Filter by search query
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			snippets = snippets.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.prefix.toLowerCase().includes(q) ||
					s.description.toLowerCase().includes(q)
			);
		}

		return snippets;
	});

	// Reset selection when filters change
	$effect(() => {
		if (filteredSnippets) {
			selectedIndex = 0;
		}
	});

	// Focus search input when opened
	$effect(() => {
		if (open) {
			setTimeout(() => {
				searchInput?.focus();
			}, 50);
		}
	});

	/**
	 * Handle keyboard navigation
	 */
	function handleKeyDown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, filteredSnippets.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (filteredSnippets[selectedIndex]) {
					selectSnippet(filteredSnippets[selectedIndex]);
				}
				break;
			case 'Escape':
				e.preventDefault();
				onClose?.();
				break;
			case 'Tab':
				// Tab through categories
				e.preventDefault();
				const currentIdx = categories.indexOf(selectedCategory ?? 'All');
				const nextIdx = e.shiftKey
					? (currentIdx - 1 + categories.length) % categories.length
					: (currentIdx + 1) % categories.length;
				selectedCategory = categories[nextIdx] === 'All' ? null : categories[nextIdx];
				break;
		}
	}

	/**
	 * Select a snippet
	 */
	function selectSnippet(snippet: Snippet) {
		onSelect?.(snippet);
		onClose?.();
	}

	/**
	 * Escape HTML special characters so a snippet body cannot inject markup.
	 */
	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	/**
	 * Get syntax-highlighted preview of snippet body.
	 *
	 * The body is escaped FIRST, then our own placeholder spans are re-introduced
	 * on the escaped string — so the only HTML emitted is ours. The placeholder
	 * regexes only match `$`, `{`, `}`, digits, `:`, and `[A-Z_]`, none of which
	 * are altered by HTML escaping, so highlighting still works on escaped text.
	 */
	function getPreview(body: string): string {
		return escapeHtml(body)
			.replace(/\$\{?\d+(?::[^}]*)?\}?/g, '<span class="preview-tabstop">$&</span>')
			.replace(/\$[A-Z_]+/g, '<span class="preview-variable">$&</span>');
	}

	/**
	 * Format usage stats
	 */
	function formatUsage(snippet: Snippet): string {
		if (snippet.usageCount === 0) return 'Never used';
		if (snippet.usageCount === 1) return 'Used once';
		return `Used ${snippet.usageCount} times`;
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div class="snippet-backdrop" onclick={() => onClose?.()} role="presentation"></div>

	<!-- Palette -->
	<div class="snippet-palette" onkeydown={handleKeyDown} role="dialog" tabindex={-1} aria-modal="true" aria-label="Snippet palette">
		<div class="snippet-header">
			<input
				bind:this={searchInput}
				type="text"
				class="snippet-search"
				placeholder="Search snippets..."
				bind:value={searchQuery}
			/>
			<span class="snippet-hint">Tab: categories, Enter: insert, Esc: close</span>
		</div>

		<div class="snippet-categories">
			{#each categories as category}
				<button
					class="category-tab"
					class:active={category === 'All' ? !selectedCategory : selectedCategory === category}
					onclick={() => (selectedCategory = category === 'All' ? null : category)}
				>
					{category}
				</button>
			{/each}
		</div>

		<div class="snippet-content">
			<div class="snippet-list">
				{#if filteredSnippets.length === 0}
					<div class="snippet-empty">
						No snippets found
						{#if searchQuery}
							for "{searchQuery}"
						{/if}
					</div>
				{:else}
					{#each filteredSnippets as snippet, i (snippet.id)}
						<button
							class="snippet-item"
							class:selected={i === selectedIndex}
							onclick={() => selectSnippet(snippet)}
							onmouseenter={() => {
								hoveredSnippet = snippet;
								selectedIndex = i;
							}}
							onmouseleave={() => (hoveredSnippet = null)}
						>
							<div class="snippet-item-header">
								<span class="snippet-prefix">{snippet.prefix}</span>
								<span class="snippet-name">{snippet.name}</span>
								{#if snippet.isUserDefined}
									<span class="snippet-badge">User</span>
								{/if}
							</div>
							<div class="snippet-item-desc">{snippet.description}</div>
						</button>
					{/each}
				{/if}
			</div>

			<!-- Preview pane -->
			<div class="snippet-preview">
				{#if hoveredSnippet || filteredSnippets[selectedIndex]}
					{@const snippet = hoveredSnippet || filteredSnippets[selectedIndex]}
					<div class="preview-header">
						<span class="preview-name">{snippet.name}</span>
						<span class="preview-category">{snippet.category}</span>
					</div>

					<div class="preview-body">
						<pre>{@html getPreview(snippet.body)}</pre>
					</div>

					<div class="preview-footer">
						<span class="preview-prefix">Prefix: <code>{snippet.prefix}</code></span>
						<span class="preview-usage">{formatUsage(snippet)}</span>
					</div>

					{#if snippet.languages.length > 0}
						<div class="preview-languages">
							{#each snippet.languages as lang}
								<span class="lang-tag">{lang}</span>
							{/each}
						</div>
					{/if}
				{:else}
					<div class="preview-empty">
						Select a snippet to preview
					</div>
				{/if}
			</div>
		</div>

		<div class="snippet-footer">
			<span class="snippet-count">
				{filteredSnippets.length} snippet{filteredSnippets.length !== 1 ? 's' : ''}
			</span>
			<span class="snippet-language">{language}</span>
		</div>
	</div>
{/if}

<style>
	.snippet-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 999;
	}

	.snippet-palette {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 90vw;
		max-width: 800px;
		height: 70vh;
		max-height: 600px;
		background: var(--color-surface, #1e1e2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		z-index: 1000;
		overflow: hidden;
	}

	.snippet-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--color-border, #333);
	}

	.snippet-search {
		flex: 1;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		color: var(--color-text, #e8e8f0);
		font-size: 14px;
		outline: none;
	}

	.snippet-search:focus {
		border-color: var(--ide-interactive, #4f8cc9);
	}

	.snippet-hint {
		font-size: 11px;
		color: var(--color-text-muted, #888);
		white-space: nowrap;
	}

	.snippet-categories {
		display: flex;
		gap: 4px;
		padding: 8px 16px;
		border-bottom: 1px solid var(--color-border, #333);
		overflow-x: auto;
	}

	.category-tab {
		padding: 4px 12px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: var(--color-text-secondary, #aaa);
		font-size: 12px;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s ease;
	}

	.category-tab:hover {
		background: rgba(255, 255, 255, 0.05);
		color: var(--color-text, #e8e8f0);
	}

	.category-tab.active {
		background: rgba(168, 85, 247, 0.2);
		color: #a855f7;
	}

	.snippet-content {
		display: grid;
		grid-template-columns: 1fr 1fr;
		flex: 1;
		overflow: hidden;
	}

	.snippet-list {
		overflow-y: auto;
		border-right: 1px solid var(--color-border, #333);
	}

	.snippet-empty {
		padding: 24px;
		text-align: center;
		color: var(--color-text-muted, #888);
		font-size: 13px;
	}

	.snippet-item {
		display: block;
		width: 100%;
		padding: 10px 16px;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--color-border, #333);
		text-align: left;
		cursor: pointer;
		transition: background 0.1s ease;
	}

	.snippet-item:hover,
	.snippet-item.selected {
		background: rgba(168, 85, 247, 0.1);
	}

	.snippet-item-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.snippet-prefix {
		font-family: monospace;
		font-size: 12px;
		padding: 2px 6px;
		background: rgba(168, 85, 247, 0.2);
		border-radius: 4px;
		color: #a855f7;
	}

	.snippet-name {
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text, #e8e8f0);
	}

	.snippet-badge {
		margin-left: auto;
		padding: 1px 6px;
		background: rgba(34, 197, 94, 0.2);
		border-radius: 4px;
		font-size: 10px;
		color: #22c55e;
	}

	.snippet-item-desc {
		font-size: 11px;
		color: var(--color-text-muted, #888);
	}

	/* Preview pane */
	.snippet-preview {
		display: flex;
		flex-direction: column;
		padding: 16px;
		overflow: hidden;
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.preview-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--color-text, #e8e8f0);
	}

	.preview-category {
		font-size: 11px;
		padding: 2px 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		color: var(--color-text-secondary, #aaa);
	}

	.preview-body {
		flex: 1;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 6px;
		padding: 12px;
		overflow: auto;
	}

	.preview-body pre {
		margin: 0;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 12px;
		line-height: 1.5;
		color: var(--color-text, #e8e8f0);
		white-space: pre-wrap;
		word-break: break-all;
	}

	:global(.preview-tabstop) {
		background: rgba(168, 85, 247, 0.3);
		border-radius: 2px;
		padding: 0 2px;
	}

	:global(.preview-variable) {
		color: #22c55e;
	}

	.preview-footer {
		display: flex;
		justify-content: space-between;
		margin-top: 12px;
		font-size: 11px;
		color: var(--color-text-muted, #888);
	}

	.preview-footer code {
		font-family: monospace;
		background: rgba(255, 255, 255, 0.1);
		padding: 1px 4px;
		border-radius: 2px;
	}

	.preview-languages {
		display: flex;
		gap: 4px;
		margin-top: 8px;
	}

	.lang-tag {
		font-size: 10px;
		padding: 2px 6px;
		background: rgba(59, 130, 246, 0.2);
		border-radius: 3px;
		color: #3b82f6;
	}

	.preview-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--color-text-muted, #888);
		font-size: 13px;
	}

	.snippet-footer {
		display: flex;
		justify-content: space-between;
		padding: 8px 16px;
		border-top: 1px solid var(--color-border, #333);
		font-size: 11px;
		color: var(--color-text-muted, #888);
	}
</style>
