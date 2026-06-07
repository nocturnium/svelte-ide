<script lang="ts">
	/**
	 * Phase 7: Debugging & Diagnostics Demo
	 *
	 * Demonstrates inline diagnostics, problems panel, breakpoints, and debug console.
	 */

	import { onMount } from 'svelte';
	import {
		createDiagnosticsManager,
		generateMockDiagnostics,
		getSeverityIcon,
		getSeverityColor,
		type DiagnosticsManager,
		type Diagnostic
	} from '$lib/components/editor/core/diagnostics';
	import {
		createBreakpointManager,
		type BreakpointManager,
		type Breakpoint
	} from '$lib/components/editor/core/breakpoints';
	import InlineDiagnosticsLayer from '$lib/components/editor/InlineDiagnosticsLayer.svelte';
	import ProblemsPanel from '$lib/components/editor/ProblemsPanel.svelte';
	import BreakpointLayer from '$lib/components/editor/BreakpointLayer.svelte';
	import DebugConsole from '$lib/components/editor/DebugConsole.svelte';
	import type { ConsoleEntry } from '$lib/components/editor/DebugConsole.svelte';

	// Demo state
	let activeDemo = $state<'diagnostics' | 'problems' | 'breakpoints' | 'console'>('diagnostics');

	// Sample code
	const sampleCode = `import { useState, useEffect } from 'react';
import { fetchData } from './api';
import { unusedImport } from './unused';

const logger = console;

interface User {
  id: string
  name: string;
  email: string
}

export function UserComponent({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  let unusedVariable = 'never used';

  useEffect(() => {
    async function loadUser() {
      try {
        const data = await fetchData(userId);
        setUser(data);
      } catch (err) {
        setError(err.message);
        logger.error('Failed to load user:', err);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [userId]);

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div className="user-card">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}

export const helper = (x) => x * 2;

function privateHelper(value) {
  return value + 1
}`;

	const sampleLines = sampleCode.split('\n');
	const lineHeight = 20;
	const charWidth = 8;
	const filePath = 'src/components/UserComponent.tsx';

	// Diagnostics
	let diagnosticsManager = $state<DiagnosticsManager>(null!);
	let diagnosticsEnabled = $state(true);

	// Breakpoints
	let breakpointManager = $state<BreakpointManager>(null!);
	let breakpointsEnabled = $state(true);

	// Console
	let consoleEntries = $state<ConsoleEntry[]>([]);
	let entryId = 0;

	// Preset diagnostics for demo
	const demoDiagnostics: Omit<Diagnostic, 'id'>[] = [
		{
			range: { start: { line: 2, column: 9 }, end: { line: 2, column: 21 } },
			severity: 'warning',
			message: "'unusedImport' is defined but never used",
			source: 'typescript',
			code: 'TS6133',
			tags: { unnecessary: true }
		},
		{
			range: { start: { line: 7, column: 2 }, end: { line: 7, column: 4 } },
			severity: 'error',
			message: "Property 'id' has no initializer and is not definitely assigned",
			source: 'typescript',
			code: 'TS2564',
			fixes: [
				{ title: 'Add definite assignment assertion', isPreferred: true, edits: [] },
				{ title: 'Add initializer', edits: [] }
			]
		},
		{
			range: { start: { line: 8, column: 2 }, end: { line: 8, column: 6 } },
			severity: 'hint',
			message: "Missing semicolon at end of 'name' property",
			source: 'prettier',
			code: 'prettier/semi'
		},
		{
			range: { start: { line: 16, column: 6 }, end: { line: 16, column: 20 } },
			severity: 'warning',
			message: "'unusedVariable' is assigned a value but never used",
			source: 'eslint',
			code: 'no-unused-vars',
			tags: { unnecessary: true }
		},
		{
			range: { start: { line: 24, column: 18 }, end: { line: 24, column: 29 } },
			severity: 'error',
			message: "Property 'message' does not exist on type 'unknown'",
			source: 'typescript',
			code: 'TS2339',
			fixes: [
				{ title: "Add type annotation 'Error'", isPreferred: true, edits: [] }
			]
		},
		{
			range: { start: { line: 43, column: 25 }, end: { line: 43, column: 26 } },
			severity: 'warning',
			message: "Parameter 'x' implicitly has an 'any' type",
			source: 'typescript',
			code: 'TS7006'
		},
		{
			range: { start: { line: 46, column: 2 }, end: { line: 46, column: 18 } },
			severity: 'info',
			message: 'Function missing return type annotation',
			source: 'eslint',
			code: '@typescript-eslint/explicit-function-return-type'
		}
	];

	onMount(() => {
		// Initialize diagnostics manager
		diagnosticsManager = createDiagnosticsManager();
		diagnosticsManager.setDiagnostics(filePath, demoDiagnostics);

		// Initialize breakpoint manager
		breakpointManager = createBreakpointManager();
		// Add some demo breakpoints
		breakpointManager.addBreakpoint(filePath, 19);
		breakpointManager.addBreakpoint(filePath, 22, { type: 'conditional', condition: 'data !== null' });
		breakpointManager.addBreakpoint(filePath, 24, { type: 'logpoint', logMessage: 'Error occurred: {err}' });

		// Add initial console entries
		addConsoleEntry('log', 'Debug session started');
		addConsoleEntry('info', 'Connected to debugger');

		return () => {
			diagnosticsManager?.destroy();
			breakpointManager?.destroy();
		};
	});

	function addConsoleEntry(type: ConsoleEntry['type'], content: unknown, source?: { file: string; line: number }) {
		const entry: ConsoleEntry = {
			id: `entry-${++entryId}`,
			type,
			content,
			timestamp: new Date(),
			source,
			expandable: typeof content === 'object' && content !== null
		};
		consoleEntries = [...consoleEntries, entry];
	}

	function handleEvaluate(expression: string) {
		// Add input entry
		addConsoleEntry('input', expression);

		// Simulate evaluation
		setTimeout(() => {
			try {
				// Simulated results for demo
				if (expression === 'user') {
					addConsoleEntry('output', { id: '123', name: 'John Doe', email: 'john@example.com' });
				} else if (expression === 'loading') {
					addConsoleEntry('output', false);
				} else if (expression === '1 + 1') {
					addConsoleEntry('output', 2);
				} else if (expression.includes('error')) {
					addConsoleEntry('error', 'ReferenceError: error is not defined');
				} else {
					addConsoleEntry('output', `Result: ${expression}`);
				}
			} catch {
				addConsoleEntry('error', 'Evaluation failed');
			}
		}, 100);
	}

	function handleConsoleClear() {
		consoleEntries = [];
		addConsoleEntry('info', 'Console cleared');
	}

	function handleDiagnosticNavigate(path: string, diagnostic: Diagnostic) {
		// In a real app, this would navigate to the file and line
		addConsoleEntry('info', `Navigate to ${path}:${diagnostic.range.start.line + 1}`);
	}

	function handleBreakpointToggle(line: number) {
		addConsoleEntry('info', `Breakpoint toggled at line ${line + 1}`);
	}
</script>

<div class="debugging-demo">
	<header class="demo-header">
		<h1>Phase 7: Debugging & Diagnostics</h1>
		<p>Inline errors, problems panel, breakpoints, and debug console</p>
	</header>

	<!-- Demo tabs -->
	<div class="demo-tabs" role="tablist" aria-label="Debugging demos">
		<button
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'diagnostics'}
			class:active={activeDemo === 'diagnostics'}
			onclick={() => (activeDemo = 'diagnostics')}
		>
			Inline Diagnostics
		</button>
		<button
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'problems'}
			class:active={activeDemo === 'problems'}
			onclick={() => (activeDemo = 'problems')}
		>
			Problems Panel
		</button>
		<button
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'breakpoints'}
			class:active={activeDemo === 'breakpoints'}
			onclick={() => (activeDemo = 'breakpoints')}
		>
			Breakpoints
		</button>
		<button
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'console'}
			class:active={activeDemo === 'console'}
			onclick={() => (activeDemo = 'console')}
		>
			Debug Console
		</button>
	</div>

	<!-- Inline Diagnostics Demo -->
	{#if activeDemo === 'diagnostics'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Inline Diagnostics</h2>
				<p>Squiggly underlines and gutter icons for errors, warnings, and hints.</p>
			</div>

			<div class="diagnostics-demo">
				<div class="editor-container">
					<div class="editor-preview" style="position: relative;">
						{#if diagnosticsManager}
							<InlineDiagnosticsLayer
								manager={diagnosticsManager}
								{filePath}
								{lineHeight}
								{charWidth}
								gutterWidth={50}
								enabled={diagnosticsEnabled}
								showSquiggles={true}
								showGutterIcons={true}
							/>
						{/if}

						{#each sampleLines as line, i}
							<div class="code-line" style="height: {lineHeight}px;">
								<span class="line-num">{i + 1}</span>
								<span class="line-content">{line || ' '}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="diagnostics-controls">
					<button
						class="control-btn"
						class:active={diagnosticsEnabled}
						onclick={() => (diagnosticsEnabled = !diagnosticsEnabled)}
					>
						{diagnosticsEnabled ? 'Disable' : 'Enable'} Diagnostics
					</button>
				</div>

				<div class="diagnostics-legend">
					<h4>Severity Levels</h4>
					<div class="legend-items">
						<div class="legend-item">
							<span class="legend-icon" style="color: {getSeverityColor('error')};">
								{getSeverityIcon('error')}
							</span>
							<span>Error - Must fix</span>
						</div>
						<div class="legend-item">
							<span class="legend-icon" style="color: {getSeverityColor('warning')};">
								{getSeverityIcon('warning')}
							</span>
							<span>Warning - Should fix</span>
						</div>
						<div class="legend-item">
							<span class="legend-icon" style="color: {getSeverityColor('info')};">
								{getSeverityIcon('info')}
							</span>
							<span>Info - Suggestion</span>
						</div>
						<div class="legend-item">
							<span class="legend-icon" style="color: {getSeverityColor('hint')};">
								{getSeverityIcon('hint')}
							</span>
							<span>Hint - Style issue</span>
						</div>
					</div>
				</div>

				<div class="feature-info">
					<h4>Features</h4>
					<ul>
						<li>Squiggly underlines with severity colors</li>
						<li>Gutter icons with diagnostic count</li>
						<li>Hover for details and quick fixes</li>
						<li>Click to apply fixes</li>
						<li>Support for deprecated/unnecessary tags</li>
					</ul>
				</div>
			</div>
		</section>
	{/if}

	<!-- Problems Panel Demo -->
	{#if activeDemo === 'problems'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Problems Panel</h2>
				<p>Centralized view of all diagnostics with filtering and navigation.</p>
			</div>

			<div class="problems-demo">
				{#if diagnosticsManager}
					<ProblemsPanel
						manager={diagnosticsManager}
						open={true}
						height={300}
						onNavigate={handleDiagnosticNavigate}
					/>
				{/if}

				<div class="feature-info">
					<h4>Features</h4>
					<ul>
						<li>Filter by severity (errors, warnings, info, hints)</li>
						<li>Filter by source (TypeScript, ESLint, etc.)</li>
						<li>Search across all diagnostics</li>
						<li>Group by file or flat list</li>
						<li>Click to navigate to location</li>
						<li>Collapsible file groups</li>
					</ul>
				</div>
			</div>
		</section>
	{/if}

	<!-- Breakpoints Demo -->
	{#if activeDemo === 'breakpoints'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Breakpoints</h2>
				<p>Visual breakpoint management with conditions and logpoints.</p>
			</div>

			<div class="breakpoints-demo">
				<div class="editor-container">
					<div class="editor-preview" style="position: relative;">
						{#if breakpointManager}
							<BreakpointLayer
								manager={breakpointManager}
								{filePath}
								{lineHeight}
								gutterWidth={50}
								enabled={breakpointsEnabled}
								onToggle={handleBreakpointToggle}
							/>
						{/if}

						{#each sampleLines as line, i}
							<div class="code-line" style="height: {lineHeight}px;">
								<span class="line-num">{i + 1}</span>
								<span class="line-content">{line || ' '}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="breakpoints-controls">
					<button
						class="control-btn"
						class:active={breakpointsEnabled}
						onclick={() => (breakpointsEnabled = !breakpointsEnabled)}
					>
						{breakpointsEnabled ? 'Disable' : 'Enable'} Breakpoints
					</button>
					<span class="hint">Click gutter to toggle, right-click for options</span>
				</div>

				<div class="breakpoints-legend">
					<h4>Breakpoint Types</h4>
					<div class="legend-items">
						<div class="legend-item">
							<span class="legend-icon" style="color: #f44747;">●</span>
							<span>Line breakpoint</span>
						</div>
						<div class="legend-item">
							<span class="legend-icon" style="color: #f44747;">◉</span>
							<span>Conditional breakpoint</span>
						</div>
						<div class="legend-item">
							<span class="legend-icon" style="color: #f9e64f;">◆</span>
							<span>Logpoint (no pause)</span>
						</div>
						<div class="legend-item">
							<span class="legend-icon" style="color: #6c6c6c;">●</span>
							<span>Disabled breakpoint</span>
						</div>
					</div>
				</div>

				<div class="feature-info">
					<h4>Features</h4>
					<ul>
						<li>Click gutter to toggle breakpoints</li>
						<li>Right-click for context menu</li>
						<li>Conditional expressions</li>
						<li>Logpoints with template strings</li>
						<li>Hit count conditions</li>
						<li>Enable/disable without removing</li>
					</ul>
				</div>
			</div>
		</section>
	{/if}

	<!-- Debug Console Demo -->
	{#if activeDemo === 'console'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Debug Console</h2>
				<p>Interactive console for expression evaluation and log output.</p>
			</div>

			<div class="console-demo">
				<DebugConsole
					entries={consoleEntries}
					open={true}
					height={300}
					onEvaluate={handleEvaluate}
					onClear={handleConsoleClear}
					inputPlaceholder="Try: user, loading, 1 + 1, error"
				/>

				<div class="console-hints">
					<h4>Try these expressions:</h4>
					<div class="hint-list">
						<code>user</code> - View user object
						<code>loading</code> - Check loading state
						<code>1 + 1</code> - Simple math
						<code>error</code> - Trigger error
					</div>
				</div>

				<div class="feature-info">
					<h4>Features</h4>
					<ul>
						<li>Expression evaluation in scope</li>
						<li>Command history (Up/Down arrows)</li>
						<li>Filter by message type</li>
						<li>Expandable object inspection</li>
						<li>Source location links</li>
						<li>Clear console (Ctrl+L)</li>
					</ul>
				</div>
			</div>
		</section>
	{/if}
</div>

<style>
	.debugging-demo {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
		overflow-x: hidden;
	}

	.demo-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.demo-header h1 {
		margin: 0 0 0.5rem;
		font-size: 2rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.demo-header p {
		margin: 0;
		color: var(--ide-text-secondary, #aaa);
	}

	/* Tabs */
	.demo-tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--ide-border, #333);
		padding-bottom: 0.5rem;
	}

	.tab {
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: none;
		border-radius: 6px 6px 0 0;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.tab:hover {
		color: var(--ide-text-primary, #e8e8f0);
		background: rgba(255, 255, 255, 0.05);
	}

	.tab.active {
		color: var(--ide-accent, #4a8db7);
		background: color-mix(in srgb, var(--ide-accent, #4a8db7) 14%, transparent);
		box-shadow: inset 0 -2px 0 var(--ide-accent, #4a8db7);
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

	/* Editor */
	.editor-container {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: hidden;
		margin-bottom: 1rem;
	}

	.editor-preview {
		max-height: 400px;
		overflow: auto;
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
	}

	.code-line {
		display: flex;
		line-height: 20px;
	}

	.line-num {
		width: 40px;
		padding-right: 8px;
		text-align: right;
		color: var(--ide-text-muted, #666);
		user-select: none;
		flex-shrink: 0;
		margin-left: 10px;
	}

	.line-content {
		flex: 1;
		white-space: pre;
		color: var(--ide-text-primary, #e8e8f0);
	}

	/* Controls */
	.diagnostics-controls,
	.breakpoints-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.control-btn {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--ide-accent, #4a8db7) 18%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-accent, #4a8db7) 32%, transparent);
		border-radius: 6px;
		color: var(--ide-accent, #4a8db7);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		background: color-mix(in srgb, var(--ide-accent, #4a8db7) 28%, transparent);
	}

	.control-btn.active {
		background: var(--ide-accent, #4a8db7);
		color: #fff;
	}

	.hint {
		font-size: 0.8rem;
		color: var(--ide-text-muted, #888);
	}

	/* Legend */
	.diagnostics-legend,
	.breakpoints-legend {
		padding: 1rem;
		background: color-mix(in srgb, var(--ide-accent, #4a8db7) 9%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-accent, #4a8db7) 18%, transparent);
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.diagnostics-legend h4,
	.breakpoints-legend h4 {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.legend-items {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.legend-icon {
		font-size: 14px;
	}

	/* Console hints */
	.console-hints {
		padding: 1rem;
		background: rgba(55, 148, 255, 0.1);
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.console-hints h4 {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
		color: #3794ff;
	}

	.hint-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.hint-list code {
		font-family: monospace;
		background: rgba(255, 255, 255, 0.1);
		padding: 2px 6px;
		border-radius: 3px;
		color: #3794ff;
	}

	/* Feature info */
	.feature-info {
		padding: 1rem;
		background: color-mix(in srgb, var(--ide-accent, #4a8db7) 9%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-accent, #4a8db7) 18%, transparent);
		border-radius: 8px;
	}

	.feature-info h4 {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.feature-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.feature-info li {
		margin: 0.25rem 0;
	}

	/* Problems/Console demos */
	.problems-demo,
	.console-demo {
		display: grid;
		gap: 1rem;
	}

	/* ===== Responsive: tablet -> mobile ===== */
	@media (max-width: 860px) {
		.debugging-demo {
			padding: 1.5rem 1rem;
		}

		/* Horizontally scrollable tab strip with edge fade */
		.demo-tabs {
			flex-wrap: nowrap;
			overflow-x: auto;
			overflow-y: hidden;
			scroll-snap-type: x proximity;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: thin;
			scrollbar-color: color-mix(in srgb, var(--ide-accent, #4a8db7) 50%, transparent)
				transparent;
			-webkit-mask-image: linear-gradient(
				to right,
				#000 calc(100% - 28px),
				transparent 100%
			);
			mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent 100%);
		}

		.demo-tabs::-webkit-scrollbar {
			height: 4px;
		}

		.demo-tabs::-webkit-scrollbar-thumb {
			background: color-mix(in srgb, var(--ide-accent, #4a8db7) 50%, transparent);
			border-radius: 2px;
		}

		.tab {
			flex: 0 0 auto;
			scroll-snap-align: start;
			min-height: 44px;
		}

		/* Right-edge fade signalling horizontal scroll on code preview */
		.editor-container {
			position: relative;
			-webkit-mask-image: linear-gradient(
				to right,
				#000 calc(100% - 24px),
				transparent 100%
			);
			mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent 100%);
		}

		.editor-preview {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: thin;
		}

		.editor-preview::-webkit-scrollbar {
			height: 6px;
		}

		.editor-preview::-webkit-scrollbar-thumb {
			background: color-mix(in srgb, var(--ide-text-secondary, #aaa) 35%, transparent);
			border-radius: 3px;
		}

		.diagnostics-controls,
		.breakpoints-controls {
			flex-wrap: wrap;
			gap: 0.75rem;
		}

		.control-btn {
			min-height: 44px;
		}
	}

	/* ===== Responsive: phones ===== */
	@media (max-width: 640px) {
		.demo-section {
			padding: 1rem;
			border-radius: 10px;
		}

		.demo-header h1 {
			font-size: 1.6rem;
		}

		/* Flatten nested cards to dividers to avoid box-in-a-box crowding */
		.diagnostics-legend,
		.breakpoints-legend,
		.feature-info,
		.console-hints {
			background: transparent;
			border: none;
			border-top: 1px solid var(--ide-border, #333);
			border-radius: 0;
			padding: 1rem 0 0;
			margin-bottom: 0.75rem;
		}

		/* Smaller code font so more of each line fits */
		.editor-preview {
			font-size: var(--ide-font-size-xs, 0.75rem);
		}

		.tab {
			padding: 0.65rem 1.1rem;
		}
	}
</style>
