<script lang="ts">
	/**
	 * Developer Experience Features Demo
	 *
	 * Demonstrates Git Blame, Code Snippets, and Inline Diff visualization.
	 */

	import { onMount } from 'svelte';
	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
	import {
		createGitBlameManager,
		generateMockBlameData,
		type GitBlameManager,
		type BlameInfo
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
	// Selected commit, set when a blame row's onCommitClick fires.
	let selectedCommit = $state<BlameInfo | null>(null);

	// Snippet demo
	let snippetManager = $state<SnippetManager>(null!);
	let snippetPaletteOpen = $state(false);
	let selectedSnippet = $state<Snippet | null>(null);
	let expandedCode = $state('');

	// Diff demo
	type DiffChange = {
		line: number;
		type: 'added' | 'modified' | 'removed';
		originalContent?: string;
	};
	let diffChanges = $state<DiffChange[]>([]);
	let diffEnabled = $state(true);
	// Selected change, set when a diff indicator's onChangeClick fires.
	let selectedChange = $state<DiffChange | null>(null);

	// Sample code for demos — idiomatic Svelte 5 (runes), so the DevX demos
	// showcase the product's own language rather than React/JSX.
	const sampleCode = `<script lang="ts">
  import { fetchData, processResults } from './api';
  import { Logger } from './utils/logger';

  const logger = new Logger('DataPanel');

  interface DataItem {
    id: string;
    name: string;
    value: number;
    createdAt: Date;
  }

  let { userId }: { userId: string } = $props();

  let data = $state<DataItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const total = $derived(data.reduce((sum, item) => sum + item.value, 0));

  $effect(() => {
    let cancelled = false;
    loading = true;
    logger.info('Fetching data for user:', userId);
    fetchData(userId)
      .then((results) => {
        if (cancelled) return;
        data = processResults(results);
      })
      .catch((err) => {
        logger.error('Failed to fetch data:', err);
        error = 'Failed to load data';
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });
${'<'}/script>

{#if loading}
  <div>Loading...</div>
{:else if error}
  <div>Error: {error}</div>
{:else}
  <div class="data-list">
    {#each data as item (item.id)}
      <div class="data-item">
        <h3>{item.name}</h3>
        <p>Value: {item.value}</p>
      </div>
    {/each}
  </div>
{/if}`;

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

		// Real Ctrl/Cmd+Shift+S shortcut to open the snippet palette, matching the
		// hint shown on the Snippets tab.
		const handleKeydown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
				e.preventDefault();
				activeDemo = 'snippets';
				snippetPaletteOpen = true;
			}
		};
		window.addEventListener('keydown', handleKeydown);

		// Initialize blame manager, and turn blame ON from the start (enable the
		// manager AND flip the layer flag, exactly as toggleBlame does) so the Git
		// Blame demo shows its author-coloured gutter on first paint rather than an
		// empty editor behind a "Show Blame" button.
		blameManager = createGitBlameManager();
		const mockBlame = generateMockBlameData(sampleLines.length);
		blameManager.setBlameData(mockBlame);
		blameManager.enable();
		blameEnabled = blameManager.isEnabled();

		// Initialize snippet manager
		snippetManager = createSnippetManager();

		// Initialize diff changes.
		// NOTE: InlineDiffLayer consumes `line` as 0-based (top = line * lineHeight)
		// and the code preview below renders row N at array index N (the `i` key),
		// so each entry's 0-based `line` must equal the array index of the line it
		// describes. Every `originalContent` is the genuine "before" of that exact
		// rendered line, so each bar sits on the line it actually annotates.
		diffChanges = [
			// Logging was newly introduced.
			{ line: 2, type: 'added' }, // import { Logger } from './utils/logger';
			{ line: 4, type: 'added' }, // const logger = new Logger('DataPanel');
			// $state runes were typed / re-defaulted.
			{ line: 15, type: 'modified', originalContent: '  let data = $state([]);' },
			{ line: 16, type: 'modified', originalContent: '  let loading = $state(false);' },
			// Error state was added.
			{ line: 17, type: 'added' }, // let error = $state<string | null>(null);
			// A derived total was newly introduced.
			{ line: 19, type: 'added' }, // const total = $derived(...)
			// A bare `if (loading) return;` early-return that used to sit just inside
			// the effect was deleted; the triangle marks where it was.
			{ line: 22, type: 'removed', originalContent: '    if (loading) return;' },
			// The value paragraph gained its "Value:" label.
			{ line: 52, type: 'modified', originalContent: '        <p>{item.value}</p>' }
		];

		return () => {
			window.removeEventListener('resize', updateWidth);
			window.removeEventListener('keydown', handleKeydown);
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

	function handleCommitClick(info: BlameInfo) {
		selectedCommit = info;
	}

	function handleChangeClick(change: DiffChange) {
		selectedChange = change;
	}

	function handleSnippetSelect(snippet: Snippet) {
		selectedSnippet = snippet;
		const expanded = snippetManager.expand(snippet);
		expandedCode = expanded.text;
	}

	// Inline usage snippet shown in the Git Blame exhibit's Code tab.
	const blameCode = `<script lang="ts">
  import {
    createGitBlameManager,
    generateMockBlameData
  } from '@nocturnium/svelte-ide';
  import { GitBlameLayer } from '@nocturnium/svelte-ide';

  const manager = createGitBlameManager();
  manager.setBlameData(generateMockBlameData(lineCount));
  manager.enable();
<${'/'}script>

<GitBlameLayer
  {manager}
  lineHeight={20}
  blameWidth={180}
  enabled={true}
  onCommitClick={(info) => (selectedCommit = info)}
/>`;
</script>

<DemoPage
	eyebrow="Intelligence"
	title="DevX Features"
	description="Git Blame, Code Snippets, and Inline Diff visualization."
>
	<!-- Demo tabs -->
	<div class="demo-tabs">
		<button
			class="tab"
			class:active={activeDemo === 'blame'}
			onclick={() => (activeDemo = 'blame')}
		>
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
				<p>View commit history inline with author information, timestamps, and commit messages.</p>
			</div>

			<DemoExhibit code={blameCode} language="svelte" filename="GitBlameLayer.svelte">
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
								{lineHeight}
								gutterWidth={0}
								{blameWidth}
								enabled={true}
								onCommitClick={handleCommitClick}
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
							<li>Click a blame row to load the full commit below</li>
							<li>Groups consecutive lines from same commit</li>
						</ul>

						{#if selectedCommit}
							<div class="selected-commit">
								<h5>Selected Commit</h5>
								<div class="commit-row">
									<span class="commit-sha">{selectedCommit.commitSha.slice(0, 7)}</span>
									<span class="commit-author">{selectedCommit.author}</span>
									<span class="commit-date">
										{selectedCommit.timestamp.toLocaleDateString(undefined, {
											year: 'numeric',
											month: 'short',
											day: 'numeric'
										})}
									</span>
								</div>
								<p class="commit-message">{selectedCommit.message}</p>
							</div>
						{:else}
							<p class="blame-hint">Enable blame, then click a row to inspect its commit here.</p>
						{/if}
					</div>
				</div>
			</DemoExhibit>
		</section>
	{/if}

	<!-- Snippets Demo -->
	{#if activeDemo === 'snippets'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Code Snippets</h2>
				<p>Quick code templates with tab stops, placeholders, and variable expansion.</p>
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
								<button class="control-btn primary" onclick={() => (snippetPaletteOpen = true)}>
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
				<p>Visual indicators showing changes since last commit or save.</p>
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
						<span class="legend-color legend-color--added"></span>
						<span>Added lines</span>
					</div>
					<div class="legend-item">
						<span class="legend-color legend-color--modified"></span>
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
						{lineHeight}
						enabled={diffEnabled}
						gutterOnly={true}
						indicatorWidth={4}
						onChangeClick={handleChangeClick}
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
						<li>Click an indicator to inspect the change below</li>
					</ul>

					{#if selectedChange}
						<div class="selected-change">
							<h5>Selected Change</h5>
							<div class="change-row">
								<span class="change-type change-type--{selectedChange.type}">
									{selectedChange.type}
								</span>
								<span class="change-line">Line {selectedChange.line + 1}</span>
							</div>
							{#if selectedChange.originalContent}
								<div class="change-original">
									<span class="change-original-label">Original:</span>
									<pre>{selectedChange.originalContent}</pre>
								</div>
							{:else}
								<p class="change-note">
									This line was {selectedChange.type === 'added' ? 'newly added' : 'removed'}, so it
									has no prior content.
								</p>
							{/if}
						</div>
					{/if}

					<div class="diff-summary">
						<h5>Changes Summary</h5>
						<div class="summary-stats">
							<span class="stat stat--add"
								>+{diffChanges.filter((c) => c.type === 'added').length} added</span
							>
							<span class="stat stat--mod"
								>~{diffChanges.filter((c) => c.type === 'modified').length} modified</span
							>
							<span class="stat stat--del"
								>-{diffChanges.filter((c) => c.type === 'removed').length} removed</span
							>
						</div>
					</div>
				</div>
			</div>
		</section>
	{/if}
</DemoPage>

<style>
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
		border-bottom: 2px solid transparent;
		border-radius: 6px 6px 0 0;
		color: var(--ide-text-secondary);
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tab:hover {
		color: var(--ide-text-primary);
		background: color-mix(in srgb, var(--ide-text-primary) 6%, transparent);
	}

	.tab:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	/* Filled active state: white text on the deeper ocean blue clears AA (~5.3:1),
	   plus a flush bottom accent so the selected demo is unmistakable. */
	.tab.active {
		color: #fff;
		font-weight: 600;
		background: var(--ide-interactive-strong);
		border-bottom-color: var(--ide-interactive);
	}

	/* Section — frameless: the DemoExhibit (Git Blame) is the sole window frame,
	   so the wrapper drops its own card chrome to avoid a card-on-card. Vertical
	   rhythm comes from the section-header margin and inner grid gaps. */
	.demo-section {
		background: transparent;
		border-radius: 0;
		padding: 0;
	}

	.section-header {
		margin-bottom: 1.5rem;
	}

	.section-header h2 {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		color: var(--ide-text-primary);
	}

	.section-header p {
		margin: 0;
		color: var(--ide-text-secondary);
		font-size: 0.9rem;
	}

	/* Controls */
	.control-btn {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--ide-interactive) 20%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-interactive) 35%, transparent);
		border-radius: 6px;
		color: var(--ide-text-primary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		background: color-mix(in srgb, var(--ide-interactive) 35%, transparent);
		border-color: color-mix(in srgb, var(--ide-interactive) 55%, transparent);
		color: var(--ide-text-primary);
	}

	.control-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	/* Filled states use white text — pair with the deeper ocean blue (AA-safe). */
	.control-btn.active,
	.control-btn.primary {
		background: var(--ide-interactive-strong);
		border-color: var(--ide-interactive-strong);
		color: #fff;
	}

	.control-btn.primary:hover {
		background: color-mix(in srgb, var(--ide-interactive-strong) 85%, white 15%);
		border-color: color-mix(in srgb, var(--ide-interactive-strong) 85%, white 15%);
		color: #fff;
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
		color: var(--ide-text-secondary);
	}

	.mode-btn {
		padding: 0.25rem 0.75rem;
		background: color-mix(in srgb, var(--ide-text-primary) 10%, transparent);
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-btn:hover {
		background: color-mix(in srgb, var(--ide-text-primary) 15%, transparent);
		color: var(--ide-text-primary);
	}

	.mode-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	/* Filled active toggle: white text on the deeper ocean blue (AA-safe). */
	.mode-btn.active {
		background: var(--ide-interactive-strong);
		color: #fff;
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
		color: var(--ide-text-secondary);
		user-select: none;
	}

	.line-content {
		flex: 1;
		white-space: pre;
		color: var(--ide-text-primary);
	}

	.blame-info,
	.snippets-info,
	.diff-info {
		padding: 1rem;
		background: color-mix(in srgb, var(--ide-interactive) 10%, transparent);
		border-radius: 8px;
	}

	.blame-info h4,
	.snippets-info h4,
	.diff-info h4 {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		color: var(--ide-interactive);
	}

	.blame-info ul,
	.diff-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary);
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
		color: var(--ide-text-secondary);
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
		color: var(--ide-text-secondary);
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
		background: color-mix(in srgb, var(--ide-interactive) 20%, transparent);
		border-radius: 4px;
		color: var(--ide-interactive);
	}

	.snippet-name {
		font-weight: 500;
		color: var(--ide-text-primary);
	}

	.snippet-desc {
		font-size: 0.85rem;
		color: var(--ide-text-secondary);
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
		color: var(--ide-text-primary);
		white-space: pre-wrap;
	}

	.expanded-preview h5 {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		color: var(--ide-text-secondary);
	}

	.no-snippet {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		color: var(--ide-text-secondary);
		font-size: 0.9rem;
		text-align: center;
		padding: 2rem 1.5rem;
		border: 1px dashed color-mix(in srgb, var(--ide-interactive) 35%, transparent);
		border-radius: 8px;
		background: color-mix(in srgb, var(--ide-interactive) 4%, transparent);
	}

	.no-snippet-text {
		margin: 0;
		color: var(--ide-text-secondary);
		font-weight: 500;
	}

	.no-snippet-hint {
		font-size: 0.75rem;
		color: var(--ide-text-secondary);
	}

	.snippet-categories {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.category h5 {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-primary);
	}

	.category ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.category li {
		font-size: 0.8rem;
		color: var(--ide-text-secondary);
		margin: 0.25rem 0;
	}

	.category code {
		font-family: monospace;
		background: color-mix(in srgb, var(--ide-text-primary) 10%, transparent);
		padding: 1px 4px;
		border-radius: 2px;
		color: var(--ide-interactive);
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
		color: var(--ide-text-secondary);
	}

	.legend-color {
		width: 16px;
		height: 16px;
		border-radius: 3px;
	}

	.legend-color--added {
		background: var(--ide-success);
	}

	.legend-color--modified {
		background: var(--ide-info);
	}

	.legend-color--removed {
		width: 0;
		height: 0;
		border-left: 10px solid var(--ide-error);
		border-top: 5px solid transparent;
		border-bottom: 5px solid transparent;
		border-radius: 0;
	}

	.diff-summary {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--ide-border);
	}

	.diff-summary h5 {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary);
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
		background: color-mix(in srgb, var(--ide-success) 20%, transparent);
		color: var(--ide-success);
	}

	.stat--mod {
		background: color-mix(in srgb, var(--ide-info) 20%, transparent);
		color: var(--ide-info);
	}

	.stat--del {
		background: color-mix(in srgb, var(--ide-error) 20%, transparent);
		color: var(--ide-error);
	}

	/* Selected commit / change detail panels (populated by the click handlers) */
	.selected-commit,
	.selected-change {
		margin-top: 1rem;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid color-mix(in srgb, var(--ide-interactive) 25%, transparent);
		border-radius: 8px;
	}

	.selected-commit h5,
	.selected-change h5 {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
		color: var(--ide-interactive);
	}

	.commit-row,
	.change-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.8rem;
	}

	.commit-sha {
		font-family: 'JetBrains Mono', monospace;
		color: var(--ide-interactive);
	}

	.commit-author {
		color: var(--ide-text-primary);
		font-weight: 500;
	}

	.commit-date,
	.change-line {
		color: var(--ide-text-secondary);
	}

	.commit-message {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--ide-text-secondary);
		line-height: 1.4;
	}

	.change-type {
		padding: 1px 8px;
		border-radius: 4px;
		font-size: 0.75rem;
		text-transform: capitalize;
	}

	.change-type--added {
		background: color-mix(in srgb, var(--ide-success) 20%, transparent);
		color: var(--ide-success);
	}

	.change-type--modified {
		background: color-mix(in srgb, var(--ide-info) 20%, transparent);
		color: var(--ide-info);
	}

	.change-type--removed {
		background: color-mix(in srgb, var(--ide-error) 20%, transparent);
		color: var(--ide-error);
	}

	.change-original {
		margin-top: 0.5rem;
	}

	.change-original-label {
		display: block;
		font-size: 0.7rem;
		color: var(--ide-text-secondary);
		margin-bottom: 0.25rem;
	}

	.change-original pre,
	.change-note {
		margin: 0;
		font-size: 0.75rem;
	}

	.change-original pre {
		font-family: 'JetBrains Mono', monospace;
		color: var(--ide-text-secondary);
		white-space: pre-wrap;
		word-break: break-all;
	}

	.change-note {
		color: var(--ide-text-secondary);
		line-height: 1.4;
	}

	.blame-hint {
		margin: 0.75rem 0 0;
		font-size: 0.78rem;
		color: var(--ide-text-secondary);
		font-style: italic;
	}

	/* ===== Responsive: tablet -> mobile ===== */
	@media (max-width: 860px) {
		.snippets-content {
			grid-template-columns: 1fr;
		}
	}

	/* ===== Responsive: phones ===== */
	@media (max-width: 640px) {
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
