<script lang="ts">
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import Seo from '../../_components/Seo.svelte';
	import EditorTabs from '$lib/components/editor/EditorTabs.svelte';
	import AIPanel from '$lib/components/ai/AIPanel.svelte';
	import PluginPanel from '$lib/components/plugins/PluginPanel.svelte';
	import Badge from '$lib/components/core/Badge.svelte';
	import Icon from '$lib/components/core/Icon.svelte';
	import FileIcon from '$lib/components/editor/FileIcon.svelte';
	import ResizeHandle from '$lib/components/core/ResizeHandle.svelte';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { seedProposals } from '$lib/stores/plugin.svelte';
	import { installScopedChatMock } from '../_components/scoped-chat-mock';
	import type { EditorTab } from '$lib/types';
	import type { PluginProposal } from '$lib/types/plugin';

	// Seed the plugin store with sample proposals and flip it to offline mode so the
	// embedded <PluginPanel> renders populated content WITHOUT calling /api/plugins/*
	// (which 404s on this static host, and whose SSE stream would auto-reconnect in a
	// loop). Mirrors the dedicated plugins demo.
	const SAMPLE_PROPOSALS = [
		{
			id: 'prettier-format',
			name: 'Prettier Format',
			description: 'Automatically format code using Prettier on save',
			category: 'transform',
			tags: ['formatting'],
			version: 1,
			status: 'deployed',
			author: 'Alice',
			parameters: { type: 'object', properties: {} },
			implementation: { type: 'module', entryPoint: 'format' },
			testCases: [],
			votes: [],
			issues: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		},
		{
			id: 'eslint-check',
			name: 'ESLint Checker',
			description: 'Lint code with ESLint and surface issues inline',
			category: 'analysis',
			tags: ['linting'],
			version: 1,
			status: 'reviewing',
			author: 'Bob',
			parameters: { type: 'object', properties: {} },
			implementation: { type: 'module', entryPoint: 'lint' },
			testCases: [],
			votes: [],
			issues: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		},
		{
			id: 'word-count',
			name: 'Word Count',
			description: 'Show a live word and character count in the status bar',
			category: 'ui',
			tags: ['writing'],
			version: 1,
			status: 'draft',
			author: 'Carol',
			parameters: { type: 'object', properties: {} },
			implementation: { type: 'module', entryPoint: 'count' },
			testCases: [],
			votes: [],
			issues: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		}
	];

	if (browser) {
		seedProposals(SAMPLE_PROPOSALS as unknown as PluginProposal[]);
	}

	// File system simulation
	const files: EditorTab[] = [
		{
			id: '1',
			name: 'index.ts',
			path: '/src/index.ts',
			language: 'typescript',
			isDirty: false,
			content: `import { App } from './App';
import { createServer } from './server';

const app = new App({
  port: 3000,
  env: process.env.NODE_ENV || 'development'
});

const server = createServer(app);

server.listen(() => {
  console.log('Server running on http://localhost:3000');
});

export { app, server };`
		},
		{
			id: '2',
			name: 'App.svelte',
			path: '/src/App.svelte',
			language: 'svelte',
			isDirty: false,
			content: [
				'<' + 'script lang="ts">',
				"  import Header from './components/Header.svelte';",
				"  import Sidebar from './components/Sidebar.svelte';",
				"  import Editor from './components/Editor.svelte';",
				'',
				"  let theme = $state('dark');",
				'  let sidebarOpen = $state(true);',
				'</' + 'script>',
				'',
				'<div class="app" class:dark={theme === \'dark\'}>',
				'  <Header bind:theme />',
				'',
				'  {#if sidebarOpen}',
				'    <Sidebar />',
				'  {/if}',
				'',
				'  <main>',
				'    <Editor />',
				'  </main>',
				'</div>',
				'',
				'<' + 'style>',
				'  .app {',
				'    display: flex;',
				'    height: 100vh;',
				'  }',
				'',
				'  main {',
				'    flex: 1;',
				'    overflow: hidden;',
				'  }',
				'</' + 'style>'
			].join('\n')
		},
		{
			id: '3',
			name: 'utils.ts',
			path: '/src/lib/utils.ts',
			language: 'typescript',
			isDirty: false,
			content: `export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return bytes.toFixed(1) + ' ' + units[i];
}`
		},
		{
			id: '4',
			name: 'styles.css',
			path: '/src/styles.css',
			language: 'css',
			isDirty: false,
			content: `:root {
  --bg-primary: #0a0a14;
  --bg-secondary: #12121e;
  --text-primary: #e8e8f0;
  --text-secondary: #a0a0b0;
  --accent: #4a9eff;
  --border: rgba(255, 255, 255, 0.1);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
}

button {
  cursor: pointer;
  border: none;
  background: var(--accent);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 4px;
}

button:hover {
  opacity: 0.9;
}`
		},
		{
			id: '5',
			name: 'package.json',
			path: '/package.json',
			language: 'json',
			isDirty: false,
			content: `{
  "name": "@nocturnium/svelte-ide",
  "version": "0.1.0",
  "description": "A powerful IDE built with Svelte",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "check": "svelte-check --tsconfig ./tsconfig.json"
  },
  "dependencies": {
    "@sveltejs/kit": "^2.0.0",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/adapter-auto": "^3.0.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0"
  }
}`
		},
		{
			id: '6',
			name: 'README.md',
			path: '/README.md',
			language: 'markdown',
			isDirty: false,
			content: `# Nocturnium IDE

A modern, feature-rich IDE built with Svelte 5.

## Features

- **Syntax Highlighting**: Support for TypeScript, JavaScript, Svelte, CSS, JSON, and more
- **Multi-cursor Editing**: Edit multiple locations simultaneously
- **Code Folding**: Collapse and expand code blocks
- **Find & Replace**: Powerful search with regex support
- **AI Integration**: Built-in AI assistance for coding

## Getting Started

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
\`\`\`

## Architecture

The IDE is built with:
- **Svelte 5** for reactive UI
- **SvelteKit** for routing and SSR
- **Custom Editor** with virtual scrolling
- **Zero dependencies** for syntax highlighting

## License

MIT License - see LICENSE file for details
`
		}
	];

	// State - use full EditorTab objects
	let tabs = $state<EditorTab[]>([...files]);
	let activeTabId = $state('1');
	let leftPanelOpen = $state(true);
	let rightPanelOpen = $state(true);
	let leftPanel = $state<'files' | 'plugins'>('files');
	let bottomPanelOpen = $state(false);
	let activeBottomTab = $state<'terminal' | 'output' | 'problems'>('terminal');

	// Live cursor position, fed by CustomEditor's onCursorChange (already 1-based).
	// Reset to 1,1 on tab switch since the {#key activeTabId} block remounts the editor.
	let cursor = $state({ line: 1, column: 1 });

	// Responsive: the shell is sized to its OWN width, not the viewport, so it
	// adapts correctly whether it's inset beside the demo sidebar, embedded, or
	// maximized to fullscreen. Below this width the three panes can't coexist with
	// a usable editor, so panels collapse into single-pane drawer overlays.
	const NARROW_WIDTH = 1040;
	let isNarrow = $state(false);
	let playgroundEl = $state<HTMLElement | null>(null);

	// First-run affordance: pulse the Explorer rail icon on narrow layouts until the
	// user opens any drawer, signalling that files/AI live behind the activity rail.
	let railHintSeen = $state(false);

	$effect(() => {
		const el = playgroundEl;
		if (!el) return;
		const apply = (width: number) => {
			const narrow = width > 0 && width < NARROW_WIDTH;
			if (narrow === isNarrow) return;
			isNarrow = narrow;
			if (narrow) {
				// When narrow, drawers start closed so the editor owns the width.
				leftPanelOpen = false;
				rightPanelOpen = false;
				bottomPanelOpen = false;
			} else {
				// Back to a wide layout — restore the tiled file + AI panels.
				leftPanelOpen = true;
				rightPanelOpen = true;
			}
		};
		apply(el.getBoundingClientRect().width);
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) apply(entry.contentRect.width);
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	// ----- Full page -----
	// The playground always opens full page: the CSS overlay below
	// (.playground--full-page) fills the browser window so it reads as a real IDE,
	// consistently, however you arrive at the route. Exiting restores the demo
	// chrome — the docs sidebar on desktop, the sticky mobile bar and its drawer
	// toggle below 861px. There is intentionally NO OS-level fullscreen
	// (requestFullscreen): it behaved differently from the windowed overlay (OS
	// fullscreen on click vs a windowed overlay on load), which is the very
	// inconsistency this replaces.
	//
	// The control is labelled by its mechanism ("Full page"), not by a destination:
	// what exiting reveals differs by viewport, so a "docs sidebar" label would be
	// wrong on mobile, where the sidebar stays a closed drawer behind the layout's
	// own hamburger.
	let isFullPage = $state(true);

	function toggleFullPage() {
		isFullPage = !isFullPage;
	}

	$effect(() => {
		// Esc leaves full page: an escape hatch back to the demo navigation. It is a
		// no-op when already exited, so the shortcut is advertised (aria-keyshortcuts
		// + the title hint) only in the state where it does something.
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isFullPage) {
				e.preventDefault();
				isFullPage = false;
			}
		};
		document.addEventListener('keydown', onKeydown);
		return () => document.removeEventListener('keydown', onKeydown);
	});

	// No AI backend exists on the static demo host, so the embedded <AIPanel> would
	// fetch /api/chat and surface a red error band. Install the same scoped,
	// ref-counted mock the dedicated AI demo uses: it intercepts that one request
	// and streams a canned reply. Installed synchronously during setup (before the
	// panel can send anything) and released on teardown, so nothing leaks to other
	// routes. NOT an $effect — updating store state from inside one self-invalidates.
	onDestroy(installScopedChatMock());

	// On mobile, only one drawer may be open at a time (single-pane overlay model).
	function openLeft(panel: 'files' | 'plugins') {
		railHintSeen = true;
		if (leftPanel === panel && leftPanelOpen) {
			leftPanelOpen = false;
			return;
		}
		leftPanel = panel;
		leftPanelOpen = true;
		if (isNarrow) rightPanelOpen = false;
	}

	function toggleRight() {
		railHintSeen = true;
		rightPanelOpen = !rightPanelOpen;
		if (rightPanelOpen && isNarrow) leftPanelOpen = false;
	}

	function closeDrawers() {
		leftPanelOpen = false;
		rightPanelOpen = false;
	}

	// Resizable panel state. The AI panel defaults a touch narrower (320, not 350)
	// so on a standard ~1440px laptop the editor + tab strip keep breathing room
	// with all three panels open, instead of crushing the tabs to scroll on load.
	let leftPanelWidth = $state(240);
	let rightPanelWidth = $state(320);
	let isResizingLeft = $state(false);
	let isResizingRight = $state(false);
	let isResizing = $derived(isResizingLeft || isResizingRight);

	let activeFile = $derived(files.find((f) => f.id === activeTabId));
	let content = $derived(activeFile?.content || '');
	let language = $derived(activeFile?.language || 'typescript');

	// File tree structure with proper typing
	interface FileTreeItem {
		name: string;
		type: 'file' | 'folder';
		id?: string;
		children?: FileTreeItem[];
	}

	const fileTree: FileTreeItem[] = [
		{
			name: 'src',
			type: 'folder',
			children: [
				{ name: 'components', type: 'folder', children: [] },
				{
					name: 'lib',
					type: 'folder',
					children: [{ name: 'utils.ts', type: 'file', id: '3' }]
				},
				{ name: 'index.ts', type: 'file', id: '1' },
				{ name: 'App.svelte', type: 'file', id: '2' },
				{ name: 'styles.css', type: 'file', id: '4' }
			]
		},
		{ name: 'package.json', type: 'file', id: '5' },
		{ name: 'README.md', type: 'file', id: '6' },
		{ name: 'tsconfig.json', type: 'file' }
	];

	function selectTab(id: string) {
		// The {#key activeTabId} editor remounts on switch; reset the readout so it
		// reflects the freshly-mounted editor rather than the previous file's caret.
		cursor = { line: 1, column: 1 };
		activeTabId = id;
	}

	function openFile(id: string) {
		if (!tabs.find((t) => t.id === id)) {
			const file = files.find((f) => f.id === id);
			if (file) {
				tabs = [...tabs, file];
			}
		}
		selectTab(id);
	}

	function closeTab(id: string) {
		const wasActive = activeTabId === id;
		tabs = tabs.filter((t) => t.id !== id);
		if (wasActive && tabs.length > 0) {
			selectTab(tabs[tabs.length - 1].id);
		}
	}

	function handleSave() {
		// Mark the current file as saved
		const activeTab = tabs.find((t) => t.id === activeTabId);
		if (activeTab && activeTab.isDirty) {
			activeTab.isDirty = false;
			tabs = [...tabs]; // Trigger reactivity
			console.log(`Saved: ${activeTab.name}`);
		}
	}

	function handleContentChange(newContent: string) {
		// Mark the current file as dirty when content changes
		const activeTab = tabs.find((t) => t.id === activeTabId);
		if (activeTab && activeTab.content !== newContent) {
			activeTab.content = newContent;
			if (!activeTab.isDirty) {
				activeTab.isDirty = true;
				tabs = [...tabs]; // Trigger reactivity
			}
		}
	}
</script>

<Seo
	title="Playground"
	description="The full Nocturnium IDE composed from the library — file explorer, tabbed editors, an AI panel, and a live status bar — all in pure Svelte 5."
/>

<div
	class="playground"
	class:playground--resizing={isResizing}
	class:playground--full-page={isFullPage}
	class:is-narrow={isNarrow}
	bind:this={playgroundEl}
>
	<!-- Activity Bar -->
	<div class="activity-bar">
		<button
			class="activity-btn"
			class:active={leftPanelOpen && leftPanel === 'files'}
			class:activity-btn--hint={isNarrow && !railHintSeen}
			onclick={() => openLeft('files')}
			aria-label="Toggle Explorer"
			aria-pressed={leftPanelOpen && leftPanel === 'files'}
			title="Explorer"
		>
			<Icon name="folder" size={20} />
		</button>
		<button
			class="activity-btn"
			class:active={leftPanelOpen && leftPanel === 'plugins'}
			onclick={() => openLeft('plugins')}
			aria-label="Toggle Plugins"
			aria-pressed={leftPanelOpen && leftPanel === 'plugins'}
			title="Plugins"
		>
			<Icon name="plugin" size={20} />
		</button>
		<div class="activity-spacer"></div>
		<button
			class="activity-btn"
			class:active={rightPanelOpen}
			onclick={toggleRight}
			aria-label="Toggle AI Assistant"
			aria-pressed={rightPanelOpen}
			title="AI Assistant"
		>
			<Icon name="sparkles" size={20} />
		</button>
		<button
			class="activity-btn"
			class:active={bottomPanelOpen}
			onclick={() => (bottomPanelOpen = !bottomPanelOpen)}
			aria-label="Toggle Terminal"
			aria-pressed={bottomPanelOpen}
			title="Terminal"
		>
			<Icon name="terminal" size={20} />
		</button>
		<button
			class="activity-btn"
			class:active={isFullPage}
			onclick={toggleFullPage}
			aria-label="Toggle Full Page"
			aria-pressed={isFullPage}
			aria-keyshortcuts={isFullPage ? 'Escape' : undefined}
			title={isFullPage ? 'Exit full page (Esc)' : 'Full page'}
		>
			<Icon name={isFullPage ? 'minimize' : 'maximize'} size={20} />
		</button>
	</div>

	<!-- Mobile scrim: tapping outside an open drawer closes it -->
	{#if isNarrow && (leftPanelOpen || rightPanelOpen)}
		<button class="mobile-scrim" aria-label="Close panel" onclick={closeDrawers}></button>
	{/if}

	<!-- Left Panel -->
	{#if leftPanelOpen}
		<div
			class="left-panel"
			class:left-panel--drawer={isNarrow}
			style={isNarrow ? '' : `width: ${leftPanelWidth}px;`}
		>
			{#if leftPanel === 'files'}
				<div class="panel-header">
					<span>Explorer</span>
				</div>
				<div class="file-tree">
					{#each fileTree as item (item.name)}
						{#if item.type === 'folder'}
							<div class="tree-folder">
								<span class="folder-icon">📂</span>
								<span>{item.name}</span>
							</div>
							{#if item.children}
								<div class="tree-children">
									{#each item.children as child (child.name)}
										{#if child.type === 'folder'}
											<div class="tree-folder">
												<span class="folder-icon">📁</span>
												<span>{child.name}</span>
											</div>
											{#if child.children}
												<div class="tree-children">
													{#each child.children as grandchild (grandchild.name)}
														<button
															class="tree-file"
															class:active={activeTabId === grandchild.id}
															onclick={() => grandchild.id && openFile(grandchild.id)}
														>
															<FileIcon filename={grandchild.name} />
															<span>{grandchild.name}</span>
														</button>
													{/each}
												</div>
											{/if}
										{:else}
											<button
												class="tree-file"
												class:active={activeTabId === child.id}
												onclick={() => child.id && openFile(child.id)}
											>
												<FileIcon filename={child.name} />
												<span>{child.name}</span>
											</button>
										{/if}
									{/each}
								</div>
							{/if}
						{:else}
							<button class="tree-file" onclick={() => item.id && openFile(item.id)}>
								<FileIcon filename={item.name} />
								<span>{item.name}</span>
							</button>
						{/if}
					{/each}
				</div>
			{:else}
				<PluginPanel />
			{/if}
		</div>

		{#if !isNarrow}
			<ResizeHandle
				direction="vertical"
				position="end"
				size={leftPanelWidth}
				min={180}
				max={400}
				onResize={(size) => (leftPanelWidth = size)}
				onResizeStart={() => (isResizingLeft = true)}
				onResizeEnd={() => (isResizingLeft = false)}
			/>
		{/if}
	{/if}

	<!-- Main Content -->
	<div class="main-content">
		<div class="editor-area">
			<EditorTabs
				{tabs}
				{activeTabId}
				onSelect={(id: string) => selectTab(id)}
				onClose={closeTab}
			/>
			<div class="editor-wrapper">
				{#if activeFile}
					{#key activeTabId}
						<CustomEditor
							{content}
							{language}
							onChange={handleContentChange}
							onSave={handleSave}
							onCursorChange={(line, column) => (cursor = { line, column })}
						/>
					{/key}
				{:else}
					<div class="empty-state">
						<p>Select a file to edit</p>
					</div>
				{/if}
			</div>
		</div>

		{#if bottomPanelOpen}
			<div class="bottom-panel">
				<div class="panel-tabs" role="tablist">
					<button
						class="panel-tab"
						class:active={activeBottomTab === 'terminal'}
						role="tab"
						aria-selected={activeBottomTab === 'terminal'}
						onclick={() => (activeBottomTab = 'terminal')}>Terminal</button
					>
					<button
						class="panel-tab"
						class:active={activeBottomTab === 'output'}
						role="tab"
						aria-selected={activeBottomTab === 'output'}
						onclick={() => (activeBottomTab = 'output')}>Output</button
					>
					<button
						class="panel-tab"
						class:active={activeBottomTab === 'problems'}
						role="tab"
						aria-selected={activeBottomTab === 'problems'}
						onclick={() => (activeBottomTab = 'problems')}>Problems</button
					>
				</div>
				{#if activeBottomTab === 'terminal'}
					<div class="terminal">
						<div class="terminal-line">
							<span class="prompt">$</span>
							<span>npm run dev</span>
						</div>
						<div class="terminal-output">
							<span class="info">Starting development server...</span>
						</div>
						<div class="terminal-output">
							<span class="success">Ready on http://localhost:5173</span>
						</div>
						<div class="terminal-line">
							<span class="prompt">$</span>
							<span class="cursor">|</span>
						</div>
					</div>
				{:else if activeBottomTab === 'output'}
					<div class="terminal">
						<div class="terminal-output">
							<span class="info">[vite] connected.</span>
						</div>
						<div class="terminal-output">
							<span class="info">[vite] hmr update /src/App.svelte</span>
						</div>
						<div class="terminal-output">
							<span class="success">page reload src/index.ts</span>
						</div>
					</div>
				{:else}
					<div class="terminal">
						<div class="terminal-output">
							<span class="success">No problems detected in the open files.</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Right Panel (AI) -->
	{#if rightPanelOpen}
		{#if !isNarrow}
			<ResizeHandle
				direction="vertical"
				position="start"
				size={rightPanelWidth}
				min={250}
				max={500}
				onResize={(size) => (rightPanelWidth = size)}
				onResizeStart={() => (isResizingRight = true)}
				onResizeEnd={() => (isResizingRight = false)}
			/>
		{/if}

		<div
			class="right-panel"
			class:right-panel--drawer={isNarrow}
			style={isNarrow ? '' : `width: ${rightPanelWidth}px;`}
		>
			<AIPanel />
		</div>
	{/if}

	<!-- Status Bar -->
	<div class="status-bar">
		<div class="status-left">
			<Badge variant="secondary">Demo</Badge>
		</div>
		<div class="status-right">
			<button
				class="status-full-page-btn"
				onclick={toggleFullPage}
				aria-pressed={isFullPage}
				aria-keyshortcuts={isFullPage ? 'Escape' : undefined}
				title={isFullPage ? 'Exit full page (Esc)' : 'Full page'}
			>
				<Icon name={isFullPage ? 'minimize' : 'maximize'} size={13} />
				<!-- Label stays stable so the accessible name matches the visible text
				     (WCAG 2.5.3); aria-pressed carries the state. -->
				<span>Full page</span>
			</button>
			<span class="status-item">{language}</span>
			<span class="status-item status-item--secondary">UTF-8</span>
			<span class="status-item">Ln {cursor.line}, Col {cursor.column}</span>
		</div>
	</div>
</div>

<style>
	.playground {
		display: flex;
		flex-wrap: wrap;
		height: calc(100vh - 60px);
		background: var(--ide-bg-primary);
		overflow-x: hidden;
	}

	/* Full page: escape the demo chrome (sidebar + header) and fill the window.
	   Sits above the layout's mobile bar and drawer (--ide-z-overlay: 300) so the
	   demo nav cannot peek through; exiting drops back below it. */
	.playground--full-page {
		position: fixed;
		inset: 0;
		z-index: 1000;
		/* Size from `inset: 0` alone — it resolves against the *visible* viewport.
		   Do NOT reintroduce width/height here: `100vh` overshoots the visible area
		   on mobile browsers that exclude the address bar, which pushed the
		   status-bar exit off-screen (both exits sat in the last 32px), and `100vw`
		   ignores the desktop scrollbar. `auto` is required rather than simply
		   omitting them, so `.playground`'s own `height: calc(100vh - 60px)` cannot
		   over-constrain the box and cancel `bottom: 0`. */
		width: auto;
		height: auto;
	}

	/* Upper row (everything except status bar) */
	.activity-bar,
	.left-panel,
	.main-content,
	.right-panel {
		height: calc(100% - 24px);
	}

	/* Resize handles need full height */
	.playground :global(.resize-handle--vertical) {
		height: calc(100% - 24px);
	}

	/* Activity Bar */
	.activity-bar {
		width: 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem 0;
		background: var(--ide-bg-tertiary);
		border-right: 1px solid var(--ide-border);
		flex-shrink: 0;
	}

	.activity-btn {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: var(--ide-text-secondary);
		font-size: 1.25rem;
		cursor: pointer;
		opacity: 0.6;
		transition: all 0.15s ease;
	}

	.activity-btn:hover {
		opacity: 1;
		color: var(--ide-text-primary);
		background: var(--ide-bg-hover);
	}

	.activity-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.activity-btn.active {
		opacity: 1;
		/* Filled active state with white glyph: use the deeper blue token
		   (--ide-interactive-strong, ocean) — white on it is ~5.3:1, clearing AA;
		   white on plain --ide-interactive (#4a8db7) is only ~3.4:1. */
		color: #fff;
		background: var(--ide-interactive-strong);
	}

	/* First-run hint: a few soft wave-tinted pulses draw the eye to the rail on
	   mobile, then settle. Cleared as soon as the user opens any drawer. */
	.activity-btn--hint {
		opacity: 1;
		color: var(--ide-text-primary);
		animation: rail-hint 1.8s ease-out 3;
	}

	@keyframes rail-hint {
		0%,
		100% {
			box-shadow: 0 0 0 0 transparent;
		}
		50% {
			box-shadow: 0 0 8px 1px color-mix(in srgb, var(--ide-interactive) 55%, transparent);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.activity-btn--hint {
			animation: none;
		}
	}

	.activity-spacer {
		flex: 1;
	}

	/* Left Panel */
	.left-panel {
		background: var(--ide-bg-secondary);
		border-right: 1px solid var(--ide-border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		flex-shrink: 0;
		transition: width 0.08s ease-out;
	}

	.playground--resizing .left-panel {
		transition: none;
	}

	.panel-header {
		padding: 0.75rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		/* Secondary (not muted) so the 0.75rem uppercase label clears AA */
		color: var(--ide-text-secondary);
		border-bottom: 1px solid var(--ide-border);
	}

	.file-tree {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.tree-folder {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem;
		font-size: 0.8125rem;
		color: var(--ide-text-secondary);
	}

	.tree-children {
		padding-left: 1rem;
	}

	.tree-file {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: transparent;
		border: none;
		border-radius: 4px;
		font-size: 0.8125rem;
		color: var(--ide-text-secondary);
		cursor: pointer;
		text-align: left;
	}

	.tree-file:hover {
		background: var(--ide-bg-hover);
	}

	.tree-file:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: -2px;
	}

	.tree-file.active {
		/* Filled selected row carries white text, so use the deeper blue token
		   (--ide-interactive-strong) for AA — see activity-btn.active above. */
		background: var(--ide-interactive-strong);
		color: #fff;
	}

	/* Main Content */
	.main-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		flex: 1;
		min-width: 0;
	}

	.editor-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.editor-wrapper {
		flex: 1;
		overflow: hidden;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--ide-text-muted);
	}

	/* Bottom Panel */
	.bottom-panel {
		height: 200px;
		background: var(--ide-bg-secondary);
		border-top: 1px solid var(--ide-border);
		display: flex;
		flex-direction: column;
	}

	.panel-tabs {
		display: flex;
		padding: 0 0.5rem;
		border-bottom: 1px solid var(--ide-border);
	}

	.panel-tab {
		padding: 0.5rem 1rem;
		background: transparent;
		border: none;
		font-size: 0.8125rem;
		/* Secondary (not muted) so the inactive tab labels clear AA as small text */
		color: var(--ide-text-secondary);
		cursor: pointer;
	}

	.panel-tab:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: -2px;
	}

	.panel-tab.active {
		color: var(--ide-text-primary);
		border-bottom: 2px solid var(--ide-interactive);
	}

	.terminal {
		flex: 1;
		padding: 0.75rem 1rem;
		font-family: var(--ide-font-mono);
		font-size: 0.8125rem;
		overflow-y: auto;
	}

	.terminal-line {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.prompt {
		color: var(--ide-interactive);
	}

	.terminal-output {
		margin-bottom: 0.25rem;
		padding-left: 1rem;
	}

	.terminal-output .info {
		/* Secondary (not muted) so log lines clear AA as small mono text */
		color: var(--ide-text-secondary);
	}

	.terminal-output .success {
		color: var(--ide-success);
	}

	.cursor {
		animation: blink 1s step-end infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	/* Right Panel */
	.right-panel {
		background: var(--ide-bg-secondary);
		border-left: 1px solid var(--ide-border);
		overflow: hidden;
		flex-shrink: 0;
		transition: width 0.08s ease-out;
	}

	.playground--resizing .right-panel {
		transition: none;
	}

	/* Fade content during resize */
	.playground--resizing .file-tree,
	.playground--resizing .right-panel {
		opacity: 0.7;
	}

	/* Status Bar */
	.status-bar {
		width: 100%;
		height: 24px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 0.75rem;
		background: var(--ide-bg-secondary);
		border-top: 1px solid var(--ide-border);
		flex-shrink: 0;
	}

	.status-left,
	.status-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.status-item {
		font-size: 0.75rem;
		color: var(--ide-text-primary);
	}

	.status-full-page-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 18px;
		padding: 0 0.5rem;
		border: 1px solid var(--ide-border);
		border-radius: 4px;
		background: transparent;
		color: var(--ide-text-primary);
		font-size: 0.72rem;
		font-weight: 500;
		line-height: 1;
		cursor: pointer;
		transition:
			background 0.12s ease,
			border-color 0.12s ease;
	}

	.status-full-page-btn:hover {
		background: var(--ide-bg-hover, rgba(255, 255, 255, 0.06));
		border-color: var(--ide-accent, #6a92e8);
	}

	.status-full-page-btn:focus-visible {
		outline: 2px solid var(--ide-accent, #6a92e8);
		outline-offset: 1px;
	}

	/* Mobile scrim behind drawers */
	.mobile-scrim {
		position: absolute;
		inset: 0 0 24px 48px;
		z-index: 20;
		background: rgba(0, 0, 0, 0.5);
		border: none;
		padding: 0;
		cursor: pointer;
		animation: scrim-in 0.15s ease-out;
	}

	@keyframes scrim-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* ===== Narrow shell: single-pane with drawer overlays =====
	   Driven by the playground's OWN width (the .is-narrow class set via
	   ResizeObserver), not the viewport — so it triggers correctly whether the
	   shell is inset beside the demo sidebar, embedded, or maximized. */
	/* `position: relative` here only exists to give the drawer overlays a containing
	   block. Full page already provides one via `position: fixed`, so stand down
	   rather than out-specify it: `.playground.is-narrow` (0,2,0) would otherwise
	   beat `.playground--full-page` (0,1,0) and silently disable full page on every
	   viewport under 1040px — which is what shipped in v1.16.0. */
	.playground.is-narrow:not(.playground--full-page) {
		position: relative;
	}

	/* Activity bar stays as the persistent rail to drive drawers */
	.playground.is-narrow .activity-bar {
		z-index: 30;
	}

	/* Larger, comfortable touch targets when narrow */
	.playground.is-narrow .activity-btn {
		width: 44px;
		height: 44px;
		opacity: 0.75;
	}

	/* Editor sits BESIDE the 48px activity rail and owns the remaining width.
	   flex-basis must be 0 (not 100%) — with the shell's flex-wrap:wrap a 100%
	   basis would wrap main-content onto a new row below the full-height rail,
	   leaving it zero height and the editor blank. */
	.playground.is-narrow .main-content {
		flex: 1 1 0;
		min-width: 0;
		height: calc(100% - 24px);
	}

	/* Left + right panels become drawers anchored beside the rail. Widths are
	   container-relative (% of the shell), so a drawer never overflows the shell
	   when it's inset by the demo sidebar. */
	.playground.is-narrow .left-panel--drawer,
	.playground.is-narrow .right-panel--drawer {
		position: absolute;
		top: 0;
		bottom: 24px;
		z-index: 25;
		width: min(360px, calc(100% - 48px)) !important;
		max-width: calc(100% - 48px);
		box-shadow: 0 0 24px rgba(0, 0, 0, 0.45);
	}

	.playground.is-narrow .left-panel--drawer {
		left: 48px;
		transition: none;
	}

	.playground.is-narrow .right-panel--drawer {
		right: 0;
		transition: none;
	}

	/* AI drawer must have enough room to be usable, not a thin strip */
	.playground.is-narrow .right-panel--drawer :global(.ai-panel) {
		min-height: 100%;
	}

	/* ===== Phones ===== */
	@media (max-width: 640px) {
		/* Drawers span the shell width beside the rail (not under it, which would
		   clip the panel header/contents) over the editor */
		.playground.is-narrow .left-panel--drawer,
		.playground.is-narrow .right-panel--drawer {
			width: calc(100% - 48px) !important;
			max-width: calc(100% - 48px);
			left: 48px;
			right: auto;
		}

		.mobile-scrim {
			inset: 0 0 24px 48px;
		}

		/* Tighter chrome so content gets the space */
		.panel-header {
			padding: 0.625rem 0.875rem;
		}

		.status-left,
		.status-right {
			gap: 0.625rem;
		}

		.status-bar {
			padding: 0 0.5rem;
		}

		/* Shed secondary status metrics on phones so the bar doesn't crowd;
		   keep the active language and live cursor position as the priority. */
		.status-item--secondary {
			display: none;
		}
	}
</style>
