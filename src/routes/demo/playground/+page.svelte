<script lang="ts">
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import EditorTabs from '$lib/components/editor/EditorTabs.svelte';
	import AIPanel from '$lib/components/ai/AIPanel.svelte';
	import PluginPanel from '$lib/components/plugins/PluginPanel.svelte';
	import Button from '$lib/components/core/Button.svelte';
	import Badge from '$lib/components/core/Badge.svelte';
	import FileIcon from '$lib/components/editor/FileIcon.svelte';
	import ResizeHandle from '$lib/components/core/ResizeHandle.svelte';
	import type { EditorTab } from '$lib/types';

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

	// Resizable panel state
	let leftPanelWidth = $state(240);
	let rightPanelWidth = $state(350);
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

	function openFile(id: string) {
		if (!tabs.find((t) => t.id === id)) {
			const file = files.find((f) => f.id === id);
			if (file) {
				tabs = [...tabs, file];
			}
		}
		activeTabId = id;
	}

	function closeTab(id: string) {
		tabs = tabs.filter((t) => t.id !== id);
		if (activeTabId === id && tabs.length > 0) {
			activeTabId = tabs[tabs.length - 1].id;
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

<div class="playground" class:playground--resizing={isResizing}>
	<!-- Activity Bar -->
	<div class="activity-bar">
		<button
			class="activity-btn"
			class:active={leftPanelOpen && leftPanel === 'files'}
			onclick={() => {
				if (leftPanel === 'files' && leftPanelOpen) {
					leftPanelOpen = false;
				} else {
					leftPanel = 'files';
					leftPanelOpen = true;
				}
			}}
			title="Explorer"
		>
			📁
		</button>
		<button
			class="activity-btn"
			class:active={leftPanelOpen && leftPanel === 'plugins'}
			onclick={() => {
				if (leftPanel === 'plugins' && leftPanelOpen) {
					leftPanelOpen = false;
				} else {
					leftPanel = 'plugins';
					leftPanelOpen = true;
				}
			}}
			title="Plugins"
		>
			⚡
		</button>
		<div class="activity-spacer"></div>
		<button
			class="activity-btn"
			class:active={rightPanelOpen}
			onclick={() => (rightPanelOpen = !rightPanelOpen)}
			title="AI Assistant"
		>
			◈
		</button>
		<button
			class="activity-btn"
			class:active={bottomPanelOpen}
			onclick={() => (bottomPanelOpen = !bottomPanelOpen)}
			title="Terminal"
		>
			⌨
		</button>
	</div>

	<!-- Left Panel -->
	{#if leftPanelOpen}
		<div class="left-panel" style="width: {leftPanelWidth}px;">
			{#if leftPanel === 'files'}
				<div class="panel-header">
					<span>Explorer</span>
				</div>
				<div class="file-tree">
					{#each fileTree as item}
						{#if item.type === 'folder'}
							<div class="tree-folder">
								<span class="folder-icon">📂</span>
								<span>{item.name}</span>
							</div>
							{#if item.children}
								<div class="tree-children">
									{#each item.children as child}
										{#if child.type === 'folder'}
											<div class="tree-folder">
												<span class="folder-icon">📁</span>
												<span>{child.name}</span>
											</div>
											{#if child.children}
												<div class="tree-children">
													{#each child.children as grandchild}
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

	<!-- Main Content -->
	<div class="main-content">
		<div class="editor-area">
			<EditorTabs
				{tabs}
				{activeTabId}
				onSelect={(id: string) => (activeTabId = id)}
				onClose={closeTab}
			/>
			<div class="editor-wrapper">
				{#if activeFile}
					{#key activeTabId}
						<CustomEditor {content} {language} onChange={handleContentChange} onSave={handleSave} />
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
				<div class="panel-tabs">
					<button class="panel-tab active">Terminal</button>
					<button class="panel-tab">Output</button>
					<button class="panel-tab">Problems</button>
				</div>
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
			</div>
		{/if}
	</div>

	<!-- Right Panel (AI) -->
	{#if rightPanelOpen}
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

		<div class="right-panel" style="width: {rightPanelWidth}px;">
			<AIPanel />
		</div>
	{/if}

	<!-- Status Bar -->
	<div class="status-bar">
		<div class="status-left">
			<Badge variant="success">Connected</Badge>
			<span class="status-item">main</span>
		</div>
		<div class="status-right">
			<span class="status-item">{language}</span>
			<span class="status-item">UTF-8</span>
			<span class="status-item">Ln 1, Col 1</span>
		</div>
	</div>
</div>

<style>
	.playground {
		display: flex;
		flex-wrap: wrap;
		height: calc(100vh - 60px);
		background: var(--ide-bg-primary);
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
		font-size: 1.25rem;
		cursor: pointer;
		opacity: 0.6;
		transition: all 0.15s ease;
	}

	.activity-btn:hover {
		opacity: 1;
		background: var(--ide-bg-hover);
	}

	.activity-btn.active {
		opacity: 1;
		background: var(--color-nocturnium-wave);
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
		color: var(--ide-text-muted);
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

	.tree-file.active {
		background: var(--color-nocturnium-wave);
		color: var(--color-nocturnium-night);
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
		color: var(--ide-text-muted);
		cursor: pointer;
	}

	.panel-tab.active {
		color: var(--ide-text-primary);
		border-bottom: 2px solid var(--color-nocturnium-wave);
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
		color: var(--color-nocturnium-wave);
	}

	.terminal-output {
		margin-bottom: 0.25rem;
		padding-left: 1rem;
	}

	.terminal-output .info {
		color: var(--ide-text-muted);
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
		background: var(--color-nocturnium-ocean);
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
		color: var(--ide-text-secondary);
	}
</style>
