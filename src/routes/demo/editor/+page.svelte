<script lang="ts">
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import EditorTabs from '$lib/components/editor/EditorTabs.svelte';
	import FileIcon from '$lib/components/editor/FileIcon.svelte';
	import Badge from '$lib/components/core/Badge.svelte';
	import Button from '$lib/components/core/Button.svelte';
	import type { EditorTab } from '$lib/types';

	type SampleFile = {
		id: string;
		name: string;
		path: string;
		language: string;
		content: string;
	};

	const files: SampleFile[] = [
		{
			id: 'user-service',
			name: 'user-service.ts',
			path: '/src/user-service.ts',
			language: 'typescript',
			content: `interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

export class UserService {
  private users = new Map<string, User>();

  async create(data: Omit<User, 'id'>): Promise<User> {
    const id = crypto.randomUUID();
    const user: User = { id, ...data };
    this.users.set(id, user);
    return user;
  }

  async get(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async update(id: string, patch: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    const next = { ...user, ...patch };
    this.users.set(id, next);
    return next;
  }
}

export const userService = new UserService();
`
		},
		{
			id: 'worker',
			name: 'worker.go',
			path: '/src/worker.go',
			language: 'go',
			content: `package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Job struct {
	ID      int
	Payload string
}

type Worker struct {
	id      int
	jobs    <-chan Job
	results chan<- string
}

func (w *Worker) Start(ctx context.Context, wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case job := <-w.jobs:
			time.Sleep(50 * time.Millisecond)
			w.results <- fmt.Sprintf("worker %d -> %s", w.id, job.Payload)
		case <-ctx.Done():
			return
		}
	}
}

func main() {
	jobs := make(chan Job, 64)
	results := make(chan string, 64)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	for i := 0; i < 3; i++ {
		w := &Worker{id: i, jobs: jobs, results: results}
		wg.Add(1)
		go w.Start(ctx, &wg)
	}
}
`
		},
		{
			id: 'tasks',
			name: 'tasks.py',
			path: '/src/tasks.py',
			language: 'python',
			content: `from dataclasses import dataclass
from typing import Optional
import asyncio


@dataclass
class Task:
    id: str
    title: str
    priority: int = 0
    done: bool = False


class TaskManager:
    def __init__(self) -> None:
        self._tasks: list[Task] = []

    def add(self, title: str, priority: int = 0) -> Task:
        task = Task(id=str(len(self._tasks)), title=title, priority=priority)
        self._tasks.append(task)
        return task

    def complete(self, task_id: str) -> Optional[Task]:
        for task in self._tasks:
            if task.id == task_id:
                task.done = True
                return task
        return None

    async def run(self) -> None:
        for task in sorted(self._tasks, key=lambda t: -t.priority):
            if not task.done:
                print(f"running: {task.title}")
                await asyncio.sleep(0.1)
`
		},
		{
			id: 'theme',
			name: 'theme.css',
			path: '/src/theme.css',
			language: 'css',
			content: `:root {
  --night: #0d1421;
  --deep: #1a2744;
  --wave: #4a8db7;
  --foam: #a8c5d9;
  --ember: #d4793a;
}

.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--night);
  border-radius: 8px;
  overflow: hidden;
}

.token-keyword {
  color: #a78bfa;
}

.token-string {
  color: #4ade80;
}
`
		},
		{
			id: 'package',
			name: 'package.json',
			path: '/package.json',
			language: 'json',
			content: `{
  "name": "@nocturnium/svelte-ide",
  "version": "0.2.0",
  "type": "module",
  "peerDependencies": {
    "svelte": "^5.0.0"
  },
  "peerDependenciesMeta": {
    "yjs": { "optional": true },
    "y-websocket": { "optional": true }
  },
  "optionalDependencies": {
    "yjs": "^13.6.20",
    "y-websocket": "^2.0.4"
  },
  "keywords": ["svelte", "ide", "editor", "crdt", "collaboration"]
}
`
		},
		{
			id: 'readme',
			name: 'README.md',
			path: '/README.md',
			language: 'markdown',
			content: `# Svelte IDE

A Svelte 5 IDE component library with a **dependency-free editor core**.

## Features

- Custom code editor with syntax highlighting
- Code folding & multi-cursor editing
- CRDT-based real-time collaboration
- Built-in AI assistant panel

> Requires Svelte 5 with runes support.

---

*Built by Nocturnium.*
`
		}
	];

	const languageOptions = [
		{ id: 'typescript', name: 'TypeScript' },
		{ id: 'javascript', name: 'JavaScript' },
		{ id: 'go', name: 'Go' },
		{ id: 'python', name: 'Python' },
		{ id: 'css', name: 'CSS' },
		{ id: 'html', name: 'HTML' },
		{ id: 'json', name: 'JSON' },
		{ id: 'markdown', name: 'Markdown' }
	];

	// Working copies of file contents (so edits persist while switching tabs).
	let buffers = $state<Record<string, string>>(
		Object.fromEntries(files.map((f) => [f.id, f.content]))
	);
	let langOverride = $state<Record<string, string>>(
		Object.fromEntries(files.map((f) => [f.id, f.language]))
	);

	// Tabs that are currently "open" (order preserved). The explorer can reopen
	// any file; closing a tab removes it here but keeps the file in the tree.
	let openIds = $state<string[]>(files.slice(0, 4).map((f) => f.id));
	let activeId = $state(files[0].id);
	let activeFile = $derived(files.find((f) => f.id === activeId) ?? files[0]);
	let activeLanguage = $derived(langOverride[activeId]);

	// Feature toggles
	let folding = $state(true);
	let multiCursor = $state(true);
	let lineNumbers = $state(true);
	let readonly = $state(false);

	// Live cursor position for the status bar
	let cursorLine = $state(1);
	let cursorCol = $state(1);

	// Line count of the active buffer, kept in sync as the user types.
	let lineCount = $derived((buffers[activeId] ?? '').split('\n').length);
	// Human-friendly language label for the status bar.
	let activeLanguageLabel = $derived(
		languageOptions.find((o) => o.id === activeLanguage)?.name ?? activeLanguage
	);

	// Dirty tracking
	let dirty = $derived(Object.fromEntries(files.map((f) => [f.id, buffers[f.id] !== f.content])));

	let tabs = $derived<EditorTab[]>(
		openIds
			.map((id) => files.find((f) => f.id === id))
			.filter((f): f is SampleFile => f !== undefined)
			.map((f) => ({
				id: f.id,
				name: f.name,
				path: f.path,
				content: buffers[f.id],
				language: langOverride[f.id],
				isDirty: dirty[f.id]
			}))
	);

	function selectFile(id: string) {
		if (!openIds.includes(id)) openIds = [...openIds, id];
		activeId = id;
	}

	function closeTab(id: string) {
		const next = openIds.filter((tabId) => tabId !== id);
		openIds = next;
		if (activeId === id && next.length > 0) {
			activeId = next[next.length - 1];
		}
	}

	function resetActive() {
		buffers[activeId] = activeFile.content;
		langOverride[activeId] = activeFile.language;
	}

	const editorPrefs = $derived({ lineNumbers: lineNumbers ? ('on' as const) : ('off' as const) });
</script>

<svelte:head>
	<title>Editor | Nocturnium Svelte IDE</title>
</svelte:head>

<div class="editor-demo">
	<header class="demo-header">
		<div class="demo-header-text">
			<Badge variant="primary">Flagship</Badge>
			<h1>Code Editor</h1>
			<p>
				A real mini-IDE built entirely from <strong>@nocturnium/svelte-ide</strong> primitives — switch
				files, change languages, and toggle features live.
			</p>
		</div>
	</header>

	<!-- Toolbar -->
	<div class="toolbar" role="toolbar" aria-label="Editor controls">
		<div class="toolbar-group">
			<label class="control" for="lang-select">
				<span class="control-label">Language</span>
				<select
					id="lang-select"
					class="select"
					value={activeLanguage}
					onchange={(e) => (langOverride[activeId] = e.currentTarget.value)}
				>
					{#each languageOptions as opt (opt.id)}
						<option value={opt.id}>{opt.name}</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="toolbar-group toolbar-toggles">
			<button
				class="toggle"
				class:on={folding}
				aria-pressed={folding}
				onclick={() => (folding = !folding)}
			>
				<span class="toggle-dot" aria-hidden="true"></span> Folding
			</button>
			<button
				class="toggle"
				class:on={multiCursor}
				aria-pressed={multiCursor}
				onclick={() => (multiCursor = !multiCursor)}
			>
				<span class="toggle-dot" aria-hidden="true"></span> Multi-cursor
			</button>
			<button
				class="toggle"
				class:on={lineNumbers}
				aria-pressed={lineNumbers}
				onclick={() => (lineNumbers = !lineNumbers)}
			>
				<span class="toggle-dot" aria-hidden="true"></span> Line numbers
			</button>
			<button
				class="toggle toggle--mode"
				class:on={readonly}
				aria-pressed={readonly}
				onclick={() => (readonly = !readonly)}
			>
				<span class="toggle-dot" aria-hidden="true"></span> Read-only
			</button>
		</div>

		<div class="toolbar-group toolbar-end">
			<Button variant="ghost" size="sm" onclick={resetActive} disabled={!dirty[activeId]}>
				Reset file
			</Button>
		</div>
	</div>

	<!-- IDE shell -->
	<div class="ide">
		<aside class="explorer" aria-label="File explorer">
			<div class="explorer-head">Explorer</div>
			<ul class="file-list">
				{#each files as file (file.id)}
					<li>
						<button
							class="file-row"
							class:active={file.id === activeId}
							aria-current={file.id === activeId ? 'true' : undefined}
							onclick={() => selectFile(file.id)}
						>
							<FileIcon filename={file.name} />
							<span class="file-name">{file.name}</span>
							{#if dirty[file.id]}
								<span class="file-dirty" aria-label="unsaved changes">●</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</aside>

		<div class="editor-pane">
			<EditorTabs {tabs} activeTabId={activeId} onSelect={selectFile} onClose={closeTab} />
			<div class="editor-host" class:editor-host--readonly={readonly}>
				{#if readonly && openIds.length > 0}
					<span class="readonly-chip" aria-hidden="true">
						<span class="readonly-chip-lock">🔒</span> Read-only
					</span>
				{/if}
				{#if openIds.length > 0}
					{#key activeId}
						<CustomEditor
							bind:content={buffers[activeId]}
							language={activeLanguage}
							{folding}
							{multiCursor}
							{readonly}
							preferences={editorPrefs}
							complexityHighlighting={false}
							onCursorChange={(line, col) => {
								cursorLine = line;
								cursorCol = col;
							}}
						/>
					{/key}
				{:else}
					<div class="editor-empty">
						<p>No file open.</p>
						<p class="editor-empty-hint">Choose a file from the explorer to start editing.</p>
					</div>
				{/if}
			</div>
			<div class="status-bar" role="status" aria-label="Editor status">
				{#if openIds.length > 0}
					<span class="status-item status-file">{activeFile.name}</span>
					{#if dirty[activeId]}
						<span class="status-item status-dirty" title="Unsaved changes">● modified</span>
					{:else}
						<span class="status-item status-saved" title="No unsaved changes">Saved</span>
					{/if}
					<span class="status-spacer"></span>
					<span class="status-item status-secondary" title="Cursor position"
						>Ln {cursorLine}, Col {cursorCol}</span
					>
					<span class="status-sep status-secondary" aria-hidden="true"></span>
					<span class="status-item status-secondary" title="Lines in file"
						>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span
					>
					<span class="status-sep status-secondary" aria-hidden="true"></span>
					{#if readonly}
						<span class="status-item status-readonly" title="File is read-only">Read-only</span>
					{:else}
						<span class="status-item status-secondary" title="Editable">UTF-8</span>
					{/if}
					<span class="status-sep status-secondary" aria-hidden="true"></span>
					<span class="status-item status-lang" title="Active language">{activeLanguageLabel}</span>
				{:else}
					<span class="status-item">Ready</span>
					<span class="status-spacer"></span>
					<span class="status-item">UTF-8</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- Capability hints -->
	<section class="hints" aria-label="Editor capabilities">
		<div class="hint">
			<kbd>Ctrl</kbd> + <kbd>D</kbd>
			<span>Add a cursor at the next occurrence</span>
		</div>
		<div class="hint">
			<kbd>Ctrl</kbd> + <kbd>F</kbd>
			<span>Find &amp; replace with regex support</span>
		</div>
		<div class="hint">
			<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>[</kbd>
			<span>Fold the current block</span>
		</div>
	</section>

	<!-- Supporting demos -->
	<section class="component-section" aria-labelledby="icons-title">
		<h2 id="icons-title">File icons</h2>
		<p class="section-desc">Language-aware icons for the file tree and tabs.</p>
		<div class="file-icons-grid">
			{#each ['index.ts', 'app.tsx', 'main.js', 'App.svelte', 'index.html', 'styles.css', 'data.json', 'main.py', 'server.go', 'README.md', 'config.yaml', 'Dockerfile'] as filename, i (i)}
				<div class="file-icon-item">
					<FileIcon {filename} />
					<span>{filename}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="component-section" aria-labelledby="caps-title">
		<h2 id="caps-title">What's inside the editor core</h2>
		<div class="features-list">
			{#each [{ t: 'Syntax highlighting', d: 'Tokenizers for TypeScript, JavaScript, Python, Go, HTML, CSS, JSON, Markdown and more.' }, { t: 'Multi-cursor & selection', d: 'Add cursors, select occurrences, and edit in parallel with full selection support.' }, { t: 'Code folding', d: 'Bracket- and indentation-aware folds with semantic presets.' }, { t: 'Find & replace', d: 'Incremental search, regex, case sensitivity, and replace-all.' }, { t: 'Virtualized rendering', d: 'Only the visible window renders — smooth at 10k+ lines.' }, { t: 'No editor-engine dependency', d: 'No CodeMirror, no Monaco — the editor core is pure Svelte 5. Real-time collaboration is an optional peer (yjs).' }] as feature, i (i)}
				<div class="feature">
					<span class="feature-icon" aria-hidden="true">✓</span>
					<div>
						<strong>{feature.t}</strong>
						<p>{feature.d}</p>
					</div>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.editor-demo {
		padding: var(--ide-spacing-xl) var(--ide-spacing-2xl) var(--ide-spacing-2xl);
		max-width: 1100px;
		margin: 0 auto;
	}

	.demo-header {
		margin-bottom: var(--ide-spacing-xl);
	}
	.demo-header-text h1 {
		font-size: var(--ide-font-size-3xl);
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: var(--ide-spacing-sm) 0 var(--ide-spacing-sm);
		color: var(--ide-text-primary);
	}
	.demo-header-text p {
		font-size: var(--ide-font-size-base);
		line-height: var(--ide-line-height-relaxed);
		color: var(--ide-text-secondary);
		max-width: 46rem;
		margin: 0;
	}
	.demo-header-text strong {
		color: var(--ide-text-primary);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-sm);
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ide-spacing-lg);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-lg);
		/* Detach the control cluster from the editor window so the toolbar and the
		   editor surface read as two distinct blocks, not one crowded one. */
		margin-bottom: var(--ide-spacing-md);
	}
	.toolbar-group {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
	}
	.toolbar-toggles {
		flex-wrap: wrap;
	}
	.toolbar-end {
		margin-left: auto;
	}
	.control {
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
	}
	.control-label {
		font-size: var(--ide-font-size-xs);
		/* AA: this xs uppercase label carries real meaning ("LANGUAGE"); --ide-text-muted
		   (~3.97:1 on bg-secondary) fails the 4.5:1 floor, so use the full-opacity secondary. */
		color: var(--ide-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.select {
		appearance: none;
		background: var(--ide-bg-tertiary);
		color: var(--ide-text-primary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		padding: var(--ide-spacing-xs) var(--ide-spacing-md) var(--ide-spacing-xs) var(--ide-spacing-sm);
		font-size: var(--ide-font-size-sm);
		font-family: var(--ide-font-sans);
		cursor: pointer;
	}
	.select:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		background: transparent;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-sm);
		cursor: pointer;
		transition:
			border-color var(--ide-transition-fast),
			color var(--ide-transition-fast);
	}
	.toggle:hover {
		color: var(--ide-text-primary);
	}
	.toggle.on {
		border-color: color-mix(in srgb, var(--ide-accent) 60%, var(--ide-border));
		background: color-mix(in srgb, var(--ide-accent) 14%, transparent);
		color: var(--ide-text-primary);
	}
	.toggle:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}
	.toggle-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--ide-radius-full);
		background: var(--ide-text-muted);
		transition: background var(--ide-transition-fast);
	}
	.toggle.on .toggle-dot {
		background: var(--ide-accent);
		box-shadow: 0 0 8px color-mix(in srgb, var(--ide-accent) 70%, transparent);
	}
	/* Read-only is a mode change, not a benign feature flag, so its on-state reads in
	   warning amber instead of the accent so enabling it is unmistakable at a glance —
	   not a same-looking pill confirmed only by a one-word status swap. */
	.toggle--mode.on {
		border-color: color-mix(in srgb, var(--ide-warning) 60%, var(--ide-border));
		background: color-mix(in srgb, var(--ide-warning) 16%, transparent);
		color: var(--ide-text-primary);
	}
	.toggle--mode.on .toggle-dot {
		background: var(--ide-warning);
		box-shadow: 0 0 8px color-mix(in srgb, var(--ide-warning) 70%, transparent);
	}

	/* IDE shell */
	.ide {
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr);
		height: 520px;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-lg);
		overflow: hidden;
		background: var(--ide-bg-primary);
	}

	.explorer {
		background: var(--ide-bg-secondary);
		border-right: 1px solid var(--ide-border);
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.explorer-head {
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		font-size: var(--ide-font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		/* AA: "EXPLORER" heading must read as a real section label, not decorative grey. */
		color: var(--ide-text-secondary);
		border-bottom: 1px solid var(--ide-border);
	}
	.file-list {
		list-style: none;
		margin: 0;
		padding: var(--ide-spacing-xs);
		overflow-y: auto;
	}
	.file-row {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		width: 100%;
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		background: transparent;
		border: none;
		border-radius: var(--ide-radius-sm);
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-sm);
		text-align: left;
		cursor: pointer;
		transition:
			background var(--ide-transition-fast),
			color var(--ide-transition-fast);
	}
	.file-row:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}
	.file-row.active {
		background: color-mix(in srgb, var(--ide-accent) 16%, transparent);
		color: var(--ide-text-primary);
	}
	.file-row:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: -2px;
	}
	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-dirty {
		margin-left: auto;
		color: var(--ide-accent);
		font-size: var(--ide-font-size-xs);
	}

	.editor-pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		/* Bound the pane to the IDE shell's track height. Without this, a grid item's
		   default min-height:auto lets the flex column grow past its 520px share, which
		   pushed the status bar below the .ide overflow:hidden clip (it was invisible).
		   Pinning the height makes the editor-host take the leftover space and scroll
		   internally, keeping the status bar visible at the bottom of the shell. */
		min-height: 0;
		height: 100%;
		overflow: hidden;
		background: var(--ide-bg-primary);
	}
	.editor-host {
		flex: 1 1 0;
		/* min-height:0 lets this flex child shrink below its content height so the
		   CustomEditor (which scrolls internally) owns the overflow, not the pane. */
		min-height: 0;
		overflow: hidden;
		/* Positioning context for the read-only lock chip overlay. */
		position: relative;
	}
	/* When read-only is active, a faint amber inset ring on the surface reinforces the
	   mode beyond the toolbar toggle + status word — the editor itself looks locked. */
	.editor-host--readonly {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ide-warning) 32%, transparent);
	}
	.readonly-chip {
		position: absolute;
		top: var(--ide-spacing-sm);
		right: var(--ide-spacing-sm);
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		padding: 2px var(--ide-spacing-sm);
		border-radius: var(--ide-radius-full);
		background: color-mix(in srgb, var(--ide-warning) 18%, var(--ide-bg-secondary));
		border: 1px solid color-mix(in srgb, var(--ide-warning) 50%, transparent);
		color: var(--ide-text-primary);
		font-size: var(--ide-font-size-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
		pointer-events: none;
	}
	.readonly-chip-lock {
		font-size: 0.7em;
		line-height: 1;
	}
	/* Source-fidelity: kill programming ligatures on the editor surface so Go's
	   directional-channel operators `<-chan` / `chan<-` (and `->`, `<=`, `!=`)
	   render as their literal two-character source, not a collapsed arrow glyph.
	   Scoped to this page's editor instance via :global() under .editor-host. */
	.editor-host :global(.custom-editor),
	.editor-host :global(.custom-editor__measure) {
		font-variant-ligatures: none;
		font-feature-settings:
			'liga' 0,
			'calt' 0;
	}
	.editor-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--ide-spacing-xs);
		height: 100%;
		color: var(--ide-text-muted);
		text-align: center;
	}
	.editor-empty p {
		margin: 0;
		font-size: var(--ide-font-size-sm);
	}
	.editor-empty-hint {
		font-size: var(--ide-font-size-xs);
	}

	.status-bar {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-xs) var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border-top: 1px solid var(--ide-border);
		font-size: var(--ide-font-size-xs);
		/* AA: the secondary metrics (Ln/Col, line count, UTF-8) inherit this base color and
		   carry real data, so it must clear 4.5:1 — full-opacity secondary, not muted. */
		color: var(--ide-text-secondary);
		font-family: var(--ide-font-mono);
		min-height: 1.75rem;
		/* Pinned to the bottom of the editor pane — never shrink or scroll away. */
		flex: 0 0 auto;
	}
	.status-item {
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
	}
	.status-file {
		color: var(--ide-text-secondary);
		font-weight: 500;
	}
	.status-spacer {
		flex: 1;
	}
	/* Thin vertical rule between right-side status segments. */
	.status-sep {
		width: 1px;
		height: 0.9rem;
		background: var(--ide-border);
	}
	.status-lang {
		color: var(--ide-accent);
		text-transform: capitalize;
	}
	.status-dirty {
		color: var(--ide-warning);
	}
	.status-saved {
		color: var(--ide-success);
	}
	.status-readonly {
		color: var(--ide-accent-strong);
		font-weight: 600;
	}

	/* Hints */
	.hints {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ide-spacing-md);
		margin: var(--ide-spacing-lg) 0 var(--ide-spacing-2xl);
	}
	.hint {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: color-mix(in srgb, var(--ide-bg-secondary) 60%, transparent);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-secondary);
	}
	kbd {
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		padding: 1px var(--ide-spacing-xs);
		background: var(--ide-bg-tertiary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-sm);
		color: var(--ide-text-primary);
	}

	/* Supporting sections */
	.component-section {
		margin-top: var(--ide-spacing-2xl);
		padding-top: var(--ide-spacing-xl);
		border-top: 1px solid var(--ide-border);
	}
	.component-section h2 {
		font-size: var(--ide-font-size-xl);
		font-weight: 700;
		color: var(--ide-text-primary);
		margin: 0 0 var(--ide-spacing-xs);
	}
	.section-desc {
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-sm);
		margin: 0 0 var(--ide-spacing-lg);
	}
	.file-icons-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--ide-spacing-sm);
	}
	.file-icon-item {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
	}
	.features-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--ide-spacing-md);
	}
	.feature {
		display: flex;
		align-items: flex-start;
		gap: var(--ide-spacing-md);
		padding: var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-lg);
	}
	.feature-icon {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--ide-success);
		font-size: var(--ide-font-size-base);
		/* Match the bold card title's line box so the check centers against the
		   heading cap height instead of floating above the baseline. */
		line-height: var(--ide-line-height-normal);
	}
	.feature strong {
		display: block;
		color: var(--ide-text-primary);
		line-height: var(--ide-line-height-normal);
		margin-bottom: var(--ide-spacing-xs);
	}
	.feature p {
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-sm);
		line-height: var(--ide-line-height-normal);
		margin: 0;
	}

	@media (max-width: 760px) {
		.editor-demo {
			padding: var(--ide-spacing-lg) var(--ide-spacing-lg) var(--ide-spacing-2xl);
			/* Guard against any descendant bleeding past the viewport edge. */
			overflow-x: hidden;
		}
		.ide {
			grid-template-columns: 1fr;
			/* Use auto height so the stacked explorer + editor-pane size themselves.
			   Avoid a fixed height here since the explorer row height is variable. */
			height: auto;
		}
		.explorer {
			border-right: none;
			border-bottom: 1px solid var(--ide-border);
		}
		.file-list {
			display: flex;
			flex-wrap: wrap;
			gap: var(--ide-spacing-xs);
		}
		.file-row {
			width: auto;
		}
		/* In the wrapped chip cluster every file reads as a flat pill, so the faint
		   desktop fill alone can get lost. Keep the accent fill but add an accent
		   ring (inset shadow = no size shift) so the current file is unmistakable. */
		.file-row.active {
			background: color-mix(in srgb, var(--ide-accent) 20%, transparent);
			box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ide-accent) 40%, transparent);
		}
		/* On mobile the .ide is height:auto so .editor-pane's height:100% resolves to
		   auto, and flex:1 1 0 with min-height:0 can collapse to 0px when the flex
		   container has no fixed size.  Give .editor-pane an explicit height so the
		   flex children (tabs + editor-host + status-bar) distribute correctly. */
		.editor-pane {
			height: 420px;
			/* Anchor the scroll-affordance chevron to the tab strip's top-right. */
			position: relative;
		}
		.editor-host {
			/* Explicit height is a fallback; the flex:1 1 0 will fill whatever the
			   pane leaves after the tabs + status-bar take their share (~64px).
			   min-height ensures CustomEditor's ResizeObserver always measures > 0. */
			height: auto;
			min-height: 280px;
		}
		.toolbar-end {
			margin-left: 0;
		}

		/* Let icons sit 2-3 per row instead of one full-width row each. */
		.file-icons-grid {
			grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		}

		/* Shrink editor-tab chrome so the open-tab strip is not clipped, and let it
		   scroll with a right-edge fade affordance. EditorTabs already does
		   overflow-x:auto internally; we relax its min-width and mask the pane. */
		.editor-pane :global(.editor-tabs__tab) {
			min-width: 84px;
		}
		.editor-pane :global(.editor-tabs) {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 18px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 18px), transparent);
		}
		/* The fade alone is easy to miss on the dark theme with no visible scrollbar.
		   Pair it with a faint right-pointing chevron, vertically centered on the
		   fixed-height tab strip, so the off-screen tabs are unmistakable on touch.
		   It sits on top of the masked strip (painted after) and ignores pointer
		   events so it never blocks a tab tap. */
		.editor-pane::after {
			content: '';
			position: absolute;
			top: calc(var(--ide-tab-height) / 2);
			right: 7px;
			width: 6px;
			height: 6px;
			transform: translateY(-50%) rotate(45deg);
			border-top: 1.5px solid var(--ide-text-muted);
			border-right: 1.5px solid var(--ide-text-muted);
			pointer-events: none;
		}

		/* Let the status line wrap rather than crowd against the panel edges. */
		.status-bar {
			flex-wrap: wrap;
			row-gap: 2px;
		}
	}

	@media (max-width: 640px) {
		/* Give the primary filename + Saved badge room to breathe by retiring the
		   secondary col/char/encoding metrics on the most cramped screens. */
		.editor-pane {
			height: 400px;
		}
		.editor-host {
			height: auto;
			min-height: 280px;
		}
		.status-secondary {
			display: none;
		}
		/* The leading spacer pushes filename + status badge to opposite ends; with the
		   secondary metrics gone, keep them grouped at the start so they breathe. */
		.status-spacer {
			flex: 0 0 auto;
		}
	}
</style>
