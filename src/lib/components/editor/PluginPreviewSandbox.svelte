<script lang="ts">
	/**
	 * Plugin Preview Sandbox
	 *
	 * A sandboxed environment for previewing plugin effects
	 * before applying them to the main editor. Supports live
	 * code transformation preview with rollback capability.
	 */

	interface PluginTransform {
		/** Transform ID */
		id: string;
		/** Plugin name */
		pluginName: string;
		/** Transform description */
		description: string;
		/** Original code */
		original: string;
		/** Transformed code */
		transformed: string;
		/** Diff hunks */
		diffs: DiffHunk[];
		/** Whether transform is valid */
		isValid: boolean;
		/** Error message if invalid */
		error?: string;
		/** Execution time in ms */
		executionTime: number;
	}

	interface DiffHunk {
		type: 'add' | 'remove' | 'unchanged';
		content: string;
		lineNumber: number;
	}

	interface Props {
		/** Code to transform */
		code: string;
		/** Language for syntax highlighting */
		language?: string;
		/** Available plugins */
		plugins?: PluginDefinition[];
		/** Whether sandbox is visible */
		visible?: boolean;
		/** Callback when transform is applied */
		onApply?: (transform: PluginTransform) => void;
		/** Callback when closed */
		onClose?: () => void;
	}

	interface PluginDefinition {
		id: string;
		name: string;
		description: string;
		icon?: string;
		transform: (code: string) => string | Promise<string>;
	}

	let {
		code,
		language: _language = 'javascript',
		plugins = [],
		visible = false,
		onApply,
		onClose
	}: Props = $props();

	let selectedPlugin = $state<PluginDefinition | null>(null);
	let currentTransform = $state<PluginTransform | null>(null);
	let isProcessing = $state(false);
	let previewMode = $state<'split' | 'unified' | 'diff'>('split');
	let sandboxContainer = $state<HTMLDivElement>(null!);

	// Demo plugins for showcase
	const demoPlugins: PluginDefinition[] = [
		{
			id: 'prettier',
			name: 'Prettier',
			description: 'Format code with Prettier',
			icon: 'P',
			transform: (code) => {
				// Simulate prettier formatting
				return code
					.split('\n')
					.map((line) => line.trimEnd())
					.join('\n');
			}
		},
		{
			id: 'sort-imports',
			name: 'Sort Imports',
			description: 'Alphabetically sort import statements',
			icon: 'S',
			transform: (code) => {
				const lines = code.split('\n');
				const imports: string[] = [];
				const rest: string[] = [];
				let inImports = true;

				for (const line of lines) {
					if (inImports && line.startsWith('import ')) {
						imports.push(line);
					} else {
						if (imports.length > 0) inImports = false;
						rest.push(line);
					}
				}

				imports.sort((a, b) => a.localeCompare(b));
				return [...imports, ...rest].join('\n');
			}
		},
		{
			id: 'add-types',
			name: 'Add Types',
			description: 'Add TypeScript type annotations',
			icon: 'T',
			transform: (code) => {
				// Simple demo: add basic types
				return code
					.replace(/const (\w+) = (\d+)/g, 'const $1: number = $2')
					.replace(/const (\w+) = ['"](.*)["']/g, "const $1: string = '$2'")
					.replace(/const (\w+) = \[/g, 'const $1: unknown[] = [');
			}
		},
		{
			id: 'add-jsdoc',
			name: 'Add JSDoc',
			description: 'Generate JSDoc comments for functions',
			icon: 'D',
			transform: (code) => {
				return code.replace(
					/^(export )?(async )?(function )(\w+)\((.*?)\)/gm,
					(_match, exp, async, fn, name, params) => {
						const paramList = params
							.split(',')
							.filter((p: string) => p.trim())
							.map((p: string) => ` * @param {unknown} ${p.trim().split(':')[0]}`)
							.join('\n');
						const jsdoc = `/**\n * ${name}\n${paramList}\n * @returns {unknown}\n */\n`;
						return `${jsdoc}${exp || ''}${async || ''}${fn}${name}(${params})`;
					}
				);
			}
		},
		{
			id: 'minify',
			name: 'Minify',
			description: 'Minify code by removing whitespace',
			icon: 'M',
			transform: (code) => {
				return code
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => line.length > 0)
					.join(' ')
					.replace(/\s+/g, ' ')
					.replace(/\s*([{};,:])\s*/g, '$1');
			}
		}
	];

	const activePlugins = $derived(plugins.length > 0 ? plugins : demoPlugins);

	/**
	 * Run plugin transform
	 */
	async function runTransform(plugin: PluginDefinition) {
		selectedPlugin = plugin;
		isProcessing = true;

		const startTime = performance.now();

		try {
			const result = await Promise.resolve(plugin.transform(code));
			const executionTime = performance.now() - startTime;

			currentTransform = {
				id: `${plugin.id}-${Date.now()}`,
				pluginName: plugin.name,
				description: plugin.description,
				original: code,
				transformed: result,
				diffs: computeDiffs(code, result),
				isValid: true,
				executionTime
			};
		} catch (error) {
			currentTransform = {
				id: `${plugin.id}-${Date.now()}`,
				pluginName: plugin.name,
				description: plugin.description,
				original: code,
				transformed: code,
				diffs: [],
				isValid: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				executionTime: performance.now() - startTime
			};
		}

		isProcessing = false;
	}

	/**
	 * Compute simple diff between original and transformed
	 */
	function computeDiffs(original: string, transformed: string): DiffHunk[] {
		const originalLines = original.split('\n');
		const transformedLines = transformed.split('\n');
		const diffs: DiffHunk[] = [];

		// Simple line-by-line diff
		const maxLen = Math.max(originalLines.length, transformedLines.length);

		for (let i = 0; i < maxLen; i++) {
			const origLine = originalLines[i];
			const newLine = transformedLines[i];

			if (origLine === undefined && newLine !== undefined) {
				diffs.push({ type: 'add', content: newLine, lineNumber: i + 1 });
			} else if (origLine !== undefined && newLine === undefined) {
				diffs.push({ type: 'remove', content: origLine, lineNumber: i + 1 });
			} else if (origLine !== newLine) {
				diffs.push({ type: 'remove', content: origLine, lineNumber: i + 1 });
				diffs.push({ type: 'add', content: newLine, lineNumber: i + 1 });
			} else {
				diffs.push({ type: 'unchanged', content: origLine, lineNumber: i + 1 });
			}
		}

		return diffs;
	}

	/**
	 * Apply the current transform
	 */
	function applyTransform() {
		if (currentTransform && currentTransform.isValid) {
			onApply?.(currentTransform);
		}
	}

	/**
	 * Reset to original
	 */
	function resetTransform() {
		currentTransform = null;
		selectedPlugin = null;
	}

	/**
	 * Close sandbox
	 */
	function closeSandbox() {
		resetTransform();
		onClose?.();
	}

	/**
	 * Get stats about the transform
	 */
	function getTransformStats(transform: PluginTransform) {
		const added = transform.diffs.filter((d) => d.type === 'add').length;
		const removed = transform.diffs.filter((d) => d.type === 'remove').length;
		const unchanged = transform.diffs.filter((d) => d.type === 'unchanged').length;

		return { added, removed, unchanged };
	}
</script>

{#if visible}
	<div class="plugin-sandbox" bind:this={sandboxContainer}>
		<div class="plugin-sandbox__header">
			<h3 class="plugin-sandbox__title">Plugin Preview Sandbox</h3>
			<div class="plugin-sandbox__actions">
				<div class="preview-mode-toggle">
					<button
						class="mode-btn"
						class:active={previewMode === 'split'}
						onclick={() => (previewMode = 'split')}
					>
						Split
					</button>
					<button
						class="mode-btn"
						class:active={previewMode === 'unified'}
						onclick={() => (previewMode = 'unified')}
					>
						Unified
					</button>
					<button
						class="mode-btn"
						class:active={previewMode === 'diff'}
						onclick={() => (previewMode = 'diff')}
					>
						Diff
					</button>
				</div>
				<button class="plugin-sandbox__close" onclick={closeSandbox}>Close</button>
			</div>
		</div>

		<div class="plugin-sandbox__content">
			<!-- Plugin selector sidebar -->
			<div class="plugin-sidebar">
				<h4 class="plugin-sidebar__title">Available Plugins</h4>
				<div class="plugin-list">
					{#each activePlugins as plugin (plugin.id)}
						<button
							class="plugin-item"
							class:plugin-item--selected={selectedPlugin?.id === plugin.id}
							onclick={() => runTransform(plugin)}
							disabled={isProcessing}
						>
							<span class="plugin-item__icon">{plugin.icon || plugin.name[0]}</span>
							<div class="plugin-item__info">
								<span class="plugin-item__name">{plugin.name}</span>
								<span class="plugin-item__desc">{plugin.description}</span>
							</div>
						</button>
					{/each}
				</div>
			</div>

			<!-- Preview area -->
			<div class="preview-area">
				{#if isProcessing}
					<div class="preview-loading">
						<span class="loading-spinner"></span>
						<span>Processing...</span>
					</div>
				{:else if currentTransform}
					{@const stats = getTransformStats(currentTransform)}

					<!-- Transform info bar -->
					<div class="transform-info">
						<span class="transform-plugin">{currentTransform.pluginName}</span>
						<span class="transform-stats">
							<span class="stat stat--add">+{stats.added}</span>
							<span class="stat stat--remove">-{stats.removed}</span>
						</span>
						<span class="transform-time">{currentTransform.executionTime.toFixed(1)}ms</span>

						{#if currentTransform.isValid}
							<button class="apply-btn" onclick={applyTransform}>Apply Changes</button>
						{:else}
							<span class="transform-error">Error: {currentTransform.error}</span>
						{/if}

						<button class="reset-btn" onclick={resetTransform}>Reset</button>
					</div>

					<!-- Preview content -->
					<div class="preview-content preview-content--{previewMode}">
						{#if previewMode === 'split'}
							<div class="split-view">
								<div class="split-pane">
									<div class="pane-header">Original</div>
									<pre class="code-block">{currentTransform.original}</pre>
								</div>
								<div class="split-pane">
									<div class="pane-header">Transformed</div>
									<pre class="code-block">{currentTransform.transformed}</pre>
								</div>
							</div>
						{:else if previewMode === 'unified'}
							<pre class="code-block">{currentTransform.transformed}</pre>
						{:else}
							<div class="diff-view">
								{#each currentTransform.diffs as hunk, i (i)}
									{#if hunk.type !== 'unchanged' || true}
										<div class="diff-line diff-line--{hunk.type}">
											<span class="diff-line__num">{hunk.lineNumber}</span>
											<span class="diff-line__sign"
												>{hunk.type === 'add' ? '+' : hunk.type === 'remove' ? '-' : ' '}</span
											>
											<span class="diff-line__content">{hunk.content}</span>
										</div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<div class="preview-empty">
						<p>Select a plugin to preview its transformation</p>
						<p class="preview-hint">
							Your code will be transformed in this sandbox before applying
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.plugin-sandbox {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 90vw;
		max-width: 1200px;
		height: 80vh;
		background: var(--ide-bg-secondary, #1a2744);
		border: 1px solid var(--ide-border, #a8c5d9);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		z-index: 1000;
	}

	.plugin-sandbox__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--ide-border, #a8c5d9);
	}

	.plugin-sandbox__title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--ide-text-primary, #f4f1e0);
	}

	.plugin-sandbox__actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.preview-mode-toggle {
		display: flex;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		padding: 2px;
	}

	.mode-btn {
		padding: 4px 12px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary, #a8c5d9);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-btn:hover {
		color: var(--ide-text-primary, #f4f1e0);
	}

	.mode-btn.active {
		background: rgba(168, 85, 247, 0.2);
		color: #a855f7;
	}

	.plugin-sandbox__close {
		padding: 6px 12px;
		background: rgba(239, 68, 68, 0.2);
		border: none;
		border-radius: 4px;
		color: #ef4444;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.plugin-sandbox__close:hover {
		background: rgba(239, 68, 68, 0.3);
	}

	.plugin-sandbox__content {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	/* Plugin sidebar */
	.plugin-sidebar {
		width: 240px;
		border-right: 1px solid var(--ide-border, #a8c5d9);
		padding: 12px;
		overflow-y: auto;
	}

	.plugin-sidebar__title {
		margin: 0 0 12px;
		font-size: 12px;
		font-weight: 600;
		color: var(--ide-text-secondary, #a8c5d9);
		text-transform: uppercase;
	}

	.plugin-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.plugin-item {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		text-align: left;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.plugin-item:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: var(--ide-border, #a8c5d9);
	}

	.plugin-item--selected {
		background: rgba(168, 85, 247, 0.1);
		border-color: rgba(168, 85, 247, 0.3);
	}

	.plugin-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.plugin-item__icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: rgba(168, 85, 247, 0.2);
		border-radius: 6px;
		color: #a855f7;
		font-weight: 600;
		flex-shrink: 0;
	}

	.plugin-item__info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.plugin-item__name {
		font-size: 13px;
		font-weight: 500;
		color: var(--ide-text-primary, #f4f1e0);
	}

	.plugin-item__desc {
		font-size: 11px;
		color: var(--ide-text-muted, #a8c5d9);
	}

	/* Preview area */
	.preview-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.preview-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 100%;
		color: var(--ide-text-secondary, #a8c5d9);
	}

	.loading-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(168, 85, 247, 0.2);
		border-top-color: #a855f7;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.transform-info {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid var(--ide-border, #a8c5d9);
		font-size: 12px;
	}

	.transform-plugin {
		font-weight: 600;
		color: #a855f7;
	}

	.transform-stats {
		display: flex;
		gap: 8px;
	}

	.stat {
		padding: 2px 6px;
		border-radius: 4px;
		font-family: monospace;
		font-size: 11px;
	}

	.stat--add {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
	}

	.stat--remove {
		background: rgba(239, 68, 68, 0.2);
		color: #ef4444;
	}

	.transform-time {
		color: var(--ide-text-muted, #a8c5d9);
	}

	.transform-error {
		color: #ef4444;
		flex: 1;
	}

	.apply-btn {
		margin-left: auto;
		padding: 6px 16px;
		background: rgba(34, 197, 94, 0.2);
		border: none;
		border-radius: 4px;
		color: #22c55e;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.apply-btn:hover {
		background: rgba(34, 197, 94, 0.3);
	}

	.reset-btn {
		padding: 6px 12px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary, #a8c5d9);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.reset-btn:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.preview-content {
		flex: 1;
		overflow: auto;
		padding: 12px;
	}

	.preview-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--ide-text-secondary, #a8c5d9);
		text-align: center;
	}

	.preview-hint {
		font-size: 12px;
		color: var(--ide-text-muted, #a8c5d9);
		margin-top: 8px;
	}

	.code-block {
		margin: 0;
		padding: 12px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 6px;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ide-text-primary, #f4f1e0);
		overflow: auto;
		white-space: pre;
	}

	/* Split view */
	.split-view {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		height: 100%;
	}

	.split-pane {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.pane-header {
		padding: 6px 12px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 6px 6px 0 0;
		font-size: 11px;
		font-weight: 600;
		color: var(--ide-text-secondary, #a8c5d9);
		text-transform: uppercase;
	}

	.split-pane .code-block {
		flex: 1;
		border-radius: 0 0 6px 6px;
	}

	/* Diff view */
	.diff-view {
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 13px;
		line-height: 1.5;
	}

	.diff-line {
		display: flex;
		padding: 0 8px;
	}

	.diff-line--add {
		background: rgba(34, 197, 94, 0.1);
	}

	.diff-line--remove {
		background: rgba(239, 68, 68, 0.1);
	}

	.diff-line__num {
		width: 40px;
		color: var(--ide-text-muted, #a8c5d9);
		text-align: right;
		padding-right: 8px;
		user-select: none;
	}

	.diff-line__sign {
		width: 16px;
		color: var(--ide-text-muted, #a8c5d9);
	}

	.diff-line--add .diff-line__sign {
		color: #22c55e;
	}

	.diff-line--remove .diff-line__sign {
		color: #ef4444;
	}

	.diff-line__content {
		flex: 1;
		white-space: pre;
	}

	.diff-line--add .diff-line__content {
		color: #22c55e;
	}

	.diff-line--remove .diff-line__content {
		color: #ef4444;
	}
</style>
