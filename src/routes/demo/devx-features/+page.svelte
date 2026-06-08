<script lang="ts">
	/**
	 * Phase 5: Developer Experience Features Demo
	 *
	 * Demonstrates Git Blame, Code Snippets, and Inline Diff visualization.
	 */

	import { onMount } from 'svelte';
	import {
		createGitBlameManager,
		generateMockBlameData,
		type GitBlameManager
	} from '$lib/components/editor/core/git-blame';
	import {
		createSnippetManager,
		type SnippetManager,
		type Snippet
	} from '$lib/components/editor/core/snippet-manager';
	import GitBlameLayer from '$lib/components/editor/GitBlameLayer.svelte';
	import SnippetPalette from '$lib/components/editor/SnippetPalette.svelte';
	import InlineDiffLayer from '$lib/components/editor/InlineDiffLayer.svelte';

	// Demo state
	let activeDemo = $state<'blame' | 'snippets' | 'diff'>('blame');

	// Git blame demo
	let blameManager = $state<GitBlameManager>(null!);
	let blameEnabled = $state(false);
	let blameColorMode = $state<'age' | 'author'>('age');

	// Snippet demo
	let snippetManager = $state<SnippetManager>(null!);
	let snippetPaletteOpen = $state(false);
	let selectedSnippet = $state<Snippet | null>(null);
	let expandedCode = $state('');

	// Diff demo
	let diffChanges = $state<Array<{ line: number; type: 'added' | 'modified' | 'removed'; originalContent?: string }>>([]);
	let diffEnabled = $state(true);

	// Sample code for demos
	const sampleCode = `import { useState, useEffect } from 'react';
import { fetchData, processResults } from './api';
import { Logger } from './utils/logger';

const logger = new Logger('DataComponent');

interface DataItem {
  id: string;
  name: string;
  value: number;
  createdAt: Date;
}

export function DataComponent({ userId }: { userId: string }) {
  const [data, setData] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        logger.info('Fetching data for user:', userId);
        const results = await fetchData(userId);
        const processed = processResults(results);
        setData(processed);
      } catch (err) {
        logger.error('Failed to fetch data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="data-list">
      {data.map(item => (
        <div key={item.id} className="data-item">
          <h3>{item.name}</h3>
          <p>Value: {item.value}</p>
        </div>
      ))}
    </div>
  );
}`;

	const sampleLines = sampleCode.split('\n');
	const lineHeight = 20;

	// Responsive blame gutter: collapse the 180px gutter on narrow screens so the
	// code preview does not get pushed off-screen on mobile.
	let viewportWidth = $state(1200);
	const blameWidth = $derived(viewportWidth <= 640 ? 96 : 180);

	onMount(() => {
		const updateWidth = () => {
			viewportWidth = window.innerWidth;
		};
		updateWidth();
		window.addEventListener('resize', updateWidth);

		// Initialize blame manager
		blameManager = createGitBlameManager();
		const mockBlame = generateMockBlameData(sampleLines.length);
		blameManager.setBlameData(mockBlame);

		// Initialize snippet manager
		snippetManager = createSnippetManager();

		// Initialize diff changes
		diffChanges = [
			{ line: 3, type: 'added' },
			{ line: 4, type: 'added' },
			{ line: 15, type: 'modified', originalContent: '  const [data, setData] = useState([]);' },
			{ line: 16, type: 'modified', originalContent: '  const [loading, setLoading] = useState(false);' },
			{ line: 25, type: 'added' },
			{ line: 26, type: 'added' },
			{ line: 35, type: 'removed', originalContent: '  if (loading) return null;' },
			{ line: 42, type: 'modified', originalContent: '        <p>{item.value}</p>' }
		];

		return () => {
			window.removeEventListener('resize', updateWidth);
		};
	});

	function toggleBlame() {
		if (blameEnabled) {
			blameManager.disable();
		} else {
			blameManager.enable();
		}
		blameEnabled = blameManager.isEnabled();
	}

	function setBlameColorMode(mode: 'age' | 'author') {
		blameColorMode = mode;
		blameManager.setConfig({ colorMode: mode });
	}

	function handleSnippetSelect(snippet: Snippet) {
		selectedSnippet = snippet;
		const expanded = snippetManager.expand(snippet);
		expandedCode = expanded.text;
	}
</script>

<div class="devx-features-demo">
	<header class="demo-header">
		<span class="demo-eyebrow">Phase 5</span>
		<h1>Developer Experience</h1>
		<p>Git Blame, Code Snippets, and Inline Diff visualization</p>
	</header>

	<!-- Demo tabs -->
	<div class="demo-tabs">
		<button class="tab" class:active={activeDemo === 'blame'} onclick={() => (activeDemo = 'blame')}>
			Git Blame
		</button>
		<button
			class="tab"
			class:active={activeDemo === 'snippets'}
			onclick={() => (activeDemo = 'snippets')}
		>
			Snippets
		</button>
		<button class="tab" class:active={activeDemo === 'diff'} onclick={() => (activeDemo = 'diff')}>
			Inline Diff
		</button>
	</div>

	<!-- Git Blame Demo -->
	{#if activeDemo === 'blame'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Git Blame</h2>
				<p>
					View commit history inline with author information, timestamps, and commit messages.
				</p>
			</div>

			<div class="blame-demo">
				<div class="blame-controls">
					<button class="control-btn" class:active={blameEnabled} onclick={toggleBlame}>
						{blameEnabled ? 'Hide' : 'Show'} Blame
					</button>

					{#if blameEnabled}
						<div class="color-mode-toggle">
							<span class="toggle-label">Color by:</span>
							<button
								class="mode-btn"
								class:active={blameColorMode === 'age'}
								onclick={() => setBlameColorMode('age')}
							>
								Age
							</button>
							<button
								class="mode-btn"
								class:active={blameColorMode === 'author'}
								onclick={() => setBlameColorMode('author')}
							>
								Author
							</button>
						</div>
					{/if}
				</div>

				<div class="editor-preview">
					<!-- Blame layer -->
					{#if blameEnabled && blameManager}
						<GitBlameLayer
							manager={blameManager}
							lineHeight={lineHeight}
							gutterWidth={0}
							blameWidth={blameWidth}
							enabled={true}
						/>
					{/if}

					<!-- Code display -->
					<div class="code-container" style="margin-left: {blameEnabled ? blameWidth : 0}px;">
						{#each sampleLines as line, i (i)}
							<div class="code-line" style="height: {lineHeight}px;">
								<span class="line-num">{i + 1}</span>
								<span class="line-content">{line || ' '}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="blame-info">
					<h4>Features</h4>
					<ul>
						<li>Shows author and timestamp for each line</li>
						<li>Color-coded by age (green = recent, gray = old) or author</li>
						<li>Hover for full commit details</li>
						<li>Click to view full commit</li>
						<li>Groups consecutive lines from same commit</li>
					</ul>
				</div>
			</div>
		</section>
	{/if}

	<!-- Snippets Demo -->
	{#if activeDemo === 'snippets'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Code Snippets</h2>
				<p>
					Quick code templates with tab stops, placeholders, and variable expansion.
				</p>
			</div>

			<div class="snippets-demo">
				<div class="snippets-controls">
					<button class="control-btn primary" onclick={() => (snippetPaletteOpen = true)}>
						Open Snippet Palette
					</button>
					<span class="shortcut-hint">Shortcut: Ctrl+Shift+S</span>
				</div>

				<div class="snippets-content">
					<div class="snippet-preview-area">
						<h4>Selected Snippet</h4>
						{#if selectedSnippet}
							<div class="selected-snippet">
								<div class="snippet-header-info">
									<span class="snippet-prefix">{selectedSnippet.prefix}</span>
									<span class="snippet-name">{selectedSnippet.name}</span>
								</div>
								<div class="snippet-desc">{selectedSnippet.description}</div>
								<div class="snippet-body">
									<pre>{selectedSnippet.body}</pre>
								</div>
								{#if expandedCode}
									<div class="expanded-preview">
										<h5>Expanded:</h5>
										<pre>{expandedCode}</pre>
									</div>
								{/if}
							</div>
						{:else}
							<div class="no-snippet">
								<p class="no-snippet-text">No snippet selected yet</p>
								<button
									class="control-btn primary"
									onclick={() => (snippetPaletteOpen = true)}
								>
									Open Snippet Palette
								</button>
								<span class="no-snippet-hint">Browse built-in templates to preview them here</span>
							</div>
						{/if}
					</div>

					<div class="snippets-info">
						<h4>Built-in Snippets</h4>
						<div class="snippet-categories">
							<div class="category">
								<h5>JavaScript/TypeScript</h5>
								<ul>
									<li><code>log</code> - Console log</li>
									<li><code>fn</code> - Function</li>
									<li><code>af</code> - Arrow function</li>
									<li><code>for</code> - For loop</li>
									<li><code>try</code> - Try/catch</li>
									<li><code>imp</code> - Import</li>
								</ul>
							</div>
							<div class="category">
								<h5>Svelte</h5>
								<ul>
									<li><code>state</code> - $state rune</li>
									<li><code>derived</code> - $derived rune</li>
									<li><code>effect</code> - $effect rune</li>
									<li><code>props</code> - Props interface</li>
									<li><code>each</code> - Each block</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</div>

			{#if snippetManager}
				<SnippetPalette
					manager={snippetManager}
					language="javascript"
					open={snippetPaletteOpen}
					onSelect={handleSnippetSelect}
					onClose={() => (snippetPaletteOpen = false)}
				/>
			{/if}
		</section>
	{/if}

	<!-- Inline Diff Demo -->
	{#if activeDemo === 'diff'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Inline Diff</h2>
				<p>
					Visual indicators showing changes since last commit or save.
				</p>
			</div>

			<div class="diff-demo">
				<div class="diff-controls">
					<button
						class="control-btn"
						class:active={diffEnabled}
						onclick={() => (diffEnabled = !diffEnabled)}
					>
						{diffEnabled ? 'Hide' : 'Show'} Diff Indicators
					</button>
				</div>

				<div class="diff-legend">
					<div class="legend-item">
						<span class="legend-color" style="background: #22c55e;"></span>
						<span>Added lines</span>
					</div>
					<div class="legend-item">
						<span class="legend-color" style="background: #3b82f6;"></span>
						<span>Modified lines</span>
					</div>
					<div class="legend-item">
						<span class="legend-color legend-color--removed"></span>
						<span>Removed lines</span>
					</div>
				</div>

				<div class="editor-preview">
					<!-- Diff layer -->
					<InlineDiffLayer
						changes={diffChanges}
						lineHeight={lineHeight}
						enabled={diffEnabled}
						gutterOnly={true}
						indicatorWidth={4}
					/>

					<!-- Code display -->
					<div class="code-container" style="margin-left: 8px;">
						{#each sampleLines as line, i (i)}
							<div class="code-line" style="height: {lineHeight}px;">
								<span class="line-num">{i + 1}</span>
								<span class="line-content">{line || ' '}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="diff-info">
					<h4>How It Works</h4>
					<ul>
						<li>Green bar: Newly added lines</li>
						<li>Blue bar: Lines that have been modified</li>
						<li>Red triangle: Lines that were removed</li>
						<li>Hover to see original content</li>
						<li>Click to navigate to diff view</li>
					</ul>

					<div class="diff-summary">
						<h5>Changes Summary</h5>
						<div class="summary-stats">
							<span class="stat stat--add">+{diffChanges.filter(c => c.type === 'added').length} added</span>
							<span class="stat stat--mod">~{diffChanges.filter(c => c.type === 'modified').length} modified</span>
							<span class="stat stat--del">-{diffChanges.filter(c => c.type === 'removed').length} removed</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	{/if}
</div>

<style>
	.devx-features-demo {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
		overflow-x: hidden;
	}

	.demo-header {
		text-align: left;
		margin-bottom: 2.5rem;
	}

	.demo-eyebrow {
		display: inline-block;
		margin-bottom: 0.6rem;
		padding: 0.2rem 0.65rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #c084fc;
		background: rgba(168, 85, 247, 0.12);
		border: 1px solid rgba(168, 85, 247, 0.3);
		border-radius: 999px;
	}

	.demo-header h1 {
		margin: 0 0 0.4rem;
		font-size: 2rem;
		font-weight: 700;
		background: linear-gradient(135deg, #e8e8f0 0%, #c084fc 100%);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.demo-header p {
		margin: 0;
		color: var(--ide-text-secondary, #aaa);
	}

	/* Tabs */
	.demo-tabs {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--ide-border, #333);
		padding-bottom: 0.5rem;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
	}

	.tab {
		flex: 0 0 auto;
		white-space: nowrap;
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: none;
		border-radius: 6px 6px 0 0;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tab:hover {
		color: var(--ide-text-primary, #e8e8f0);
		background: rgba(255, 255, 255, 0.05);
	}

	.tab.active {
		color: #a855f7;
		background: rgba(168, 85, 247, 0.1);
	}

	/* Section */
	.demo-section {
		background: var(--ide-bg-secondary, #1e1e2e);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.section-header {
		margin-bottom: 1.5rem;
	}

	.section-header h2 {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.section-header p {
		margin: 0;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.9rem;
	}

	/* Controls */
	.control-btn {
		padding: 0.5rem 1rem;
		background: rgba(168, 85, 247, 0.2);
		border: 1px solid rgba(168, 85, 247, 0.3);
		border-radius: 6px;
		color: #c084fc;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		background: rgba(168, 85, 247, 0.35);
		border-color: rgba(168, 85, 247, 0.55);
		color: #f3e8ff;
	}

	.control-btn.active {
		background: #a855f7;
		color: #fff;
	}

	.control-btn.primary {
		background: #a855f7;
		color: #fff;
	}

	.control-btn.primary:hover {
		background: #9333ea;
	}

	/* Blame demo */
	.blame-demo {
		display: grid;
		gap: 1rem;
	}

	.blame-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.color-mode-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toggle-label {
		font-size: 0.8rem;
		color: var(--ide-text-muted, #888);
	}

	.mode-btn {
		padding: 0.25rem 0.75rem;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.mode-btn:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.mode-btn.active {
		background: rgba(168, 85, 247, 0.3);
		color: #a855f7;
	}

	.editor-preview {
		position: relative;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		max-height: 400px;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
	}

	.code-container {
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		transition: margin-left 0.2s ease;
	}

	.code-line {
		display: flex;
		line-height: 20px;
	}

	.line-num {
		width: 40px;
		padding-right: 8px;
		text-align: right;
		color: var(--ide-text-muted, #888);
		user-select: none;
	}

	.line-content {
		flex: 1;
		white-space: pre;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.blame-info,
	.snippets-info,
	.diff-info {
		padding: 1rem;
		background: rgba(168, 85, 247, 0.1);
		border-radius: 8px;
	}

	.blame-info h4,
	.snippets-info h4,
	.diff-info h4 {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		color: #a855f7;
	}

	.blame-info ul,
	.diff-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.blame-info li,
	.diff-info li {
		margin: 0.25rem 0;
	}

	/* Snippets demo */
	.snippets-demo {
		display: grid;
		gap: 1rem;
	}

	.snippets-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.shortcut-hint {
		font-size: 0.75rem;
		color: var(--ide-text-muted, #888);
	}

	.snippets-content {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.snippet-preview-area {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		padding: 1rem;
	}

	.snippet-preview-area h4 {
		margin: 0 0 1rem;
		font-size: 0.9rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.selected-snippet {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.snippet-header-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
		font-weight: 500;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.snippet-desc {
		font-size: 0.85rem;
		color: var(--ide-text-muted, #888);
	}

	.snippet-body,
	.expanded-preview {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 6px;
		padding: 0.75rem;
	}

	.snippet-body pre,
	.expanded-preview pre {
		margin: 0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		color: var(--ide-text-primary, #e8e8f0);
		white-space: pre-wrap;
	}

	.expanded-preview h5 {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		color: var(--ide-text-muted, #888);
	}

	.no-snippet {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		color: var(--ide-text-muted, #888);
		font-size: 0.9rem;
		text-align: center;
		padding: 2rem 1.5rem;
		border: 1px dashed rgba(168, 85, 247, 0.35);
		border-radius: 8px;
		background: rgba(168, 85, 247, 0.04);
	}

	.no-snippet-text {
		margin: 0;
		color: var(--ide-text-secondary, #aaa);
		font-weight: 500;
	}

	.no-snippet-hint {
		font-size: 0.75rem;
		color: var(--ide-text-muted, #888);
	}

	.snippet-categories {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.category h5 {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.category ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.category li {
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
		margin: 0.25rem 0;
	}

	.category code {
		font-family: monospace;
		background: rgba(255, 255, 255, 0.1);
		padding: 1px 4px;
		border-radius: 2px;
		color: #a855f7;
	}

	/* Diff demo */
	.diff-demo {
		display: grid;
		gap: 1rem;
	}

	.diff-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.diff-legend {
		display: flex;
		gap: 1.5rem;
		padding: 0.5rem 0;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.legend-color {
		width: 16px;
		height: 16px;
		border-radius: 3px;
	}

	.legend-color--removed {
		width: 0;
		height: 0;
		border-left: 10px solid #ef4444;
		border-top: 5px solid transparent;
		border-bottom: 5px solid transparent;
		border-radius: 0;
	}

	.diff-summary {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.diff-summary h5 {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.summary-stats {
		display: flex;
		gap: 1rem;
	}

	.stat {
		font-size: 0.8rem;
		padding: 2px 8px;
		border-radius: 4px;
	}

	.stat--add {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
	}

	.stat--mod {
		background: rgba(59, 130, 246, 0.2);
		color: #3b82f6;
	}

	.stat--del {
		background: rgba(239, 68, 68, 0.2);
		color: #ef4444;
	}

	/* ===== Responsive: tablet -> mobile ===== */
	@media (max-width: 860px) {
		.devx-features-demo {
			padding: 1.5rem 1rem;
		}

		.snippets-content {
			grid-template-columns: 1fr;
		}
	}

	/* ===== Responsive: phones ===== */
	@media (max-width: 640px) {
		.devx-features-demo {
			padding: 1.25rem 0.85rem;
		}

		.demo-header h1 {
			font-size: 1.6rem;
		}

		/* Stack the snippet preview above categories; the preview is first
		   in DOM order, so it stays pinned at the top on phones. */
		.snippets-content {
			grid-template-columns: 1fr;
		}

		/* Category cards become a horizontal scroll row (matching the tab
		   strip pattern) so the 'pick category -> see preview' relationship
		   stays legible instead of becoming a tall equal-weight stack. The
		   partial peek of the next card signals that more can be scrolled to. */
		.snippet-categories {
			display: flex;
			flex-wrap: nowrap;
			gap: 0.75rem;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: thin;
			padding-bottom: 0.25rem;
		}

		.category {
			flex: 0 0 78%;
			min-width: 0;
		}

		/* Right-edge fade hints the code preview scrolls horizontally, applied
		   only at phone widths where lines genuinely exceed the viewport. */
		.editor-preview {
			mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent 100%);
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent 100%);
		}

		/* Keep tab tap targets >= 44px and a clear scroll affordance */
		.demo-tabs {
			mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent 100%);
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent 100%);
		}

		.tab {
			min-height: 44px;
			padding: 0.65rem 1.1rem;
		}

		.control-btn {
			min-height: 44px;
		}

		/* Smaller code so more fits before horizontal scroll kicks in */
		.code-container {
			font-size: var(--ide-font-size-xs, 11px);
		}

		.line-num {
			width: 32px;
		}

		/* Controls and legend wrap instead of overflowing */
		.blame-controls,
		.snippets-controls,
		.diff-controls,
		.diff-legend {
			flex-wrap: wrap;
			gap: 0.6rem;
		}

		.summary-stats {
			flex-wrap: wrap;
			gap: 0.5rem;
		}
	}
</style>
