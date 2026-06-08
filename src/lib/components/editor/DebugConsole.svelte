<script lang="ts">
	/**
	 * Debug Console
	 *
	 * Interactive console for debugging:
	 * - Expression evaluation
	 * - Log output display
	 * - Variable inspection
	 * - Command history
	 */

	import { SvelteSet } from 'svelte/reactivity';

	export type ConsoleEntryType = 'input' | 'output' | 'error' | 'warning' | 'info' | 'log';

	export interface ConsoleEntry {
		/** Unique identifier */
		id: string;
		/** Entry type */
		type: ConsoleEntryType;
		/** Content (can be string or structured data) */
		content: unknown;
		/** Timestamp */
		timestamp: Date;
		/** Source location (optional) */
		source?: {
			file: string;
			line: number;
		};
		/** Whether entry is expandable */
		expandable?: boolean;
		/** Whether entry is expanded */
		expanded?: boolean;
	}

	interface Props {
		/** Console entries */
		entries?: ConsoleEntry[];
		/** Whether console is open */
		open?: boolean;
		/** Panel height */
		height?: number;
		/** Callback when expression is evaluated */
		onEvaluate?: (expression: string) => void;
		/** Callback when console is cleared */
		onClear?: () => void;
		/** Callback when panel is closed */
		onClose?: () => void;
		/** Whether to show input */
		showInput?: boolean;
		/** Placeholder text for input */
		inputPlaceholder?: string;
	}

	let {
		entries = [],
		open = true,
		height = 200,
		onEvaluate,
		onClear,
		onClose,
		showInput = true,
		inputPlaceholder = 'Evaluate expression...'
	}: Props = $props();

	let inputValue = $state('');
	let commandHistory = $state<string[]>([]);
	let historyIndex = $state(-1);
	let inputRef = $state<HTMLInputElement>(null!);
	let consoleRef = $state<HTMLDivElement>(null!);
	let filter = $state<ConsoleEntryType | 'all'>('all');
	const expandedIds = new SvelteSet<string>();

	// Filtered entries
	const filteredEntries = $derived(
		filter === 'all' ? entries : entries.filter((e) => e.type === filter)
	);

	// Entry counts by type
	const entryCounts = $derived(() => {
		const counts: Record<ConsoleEntryType | 'all', number> = {
			all: entries.length,
			input: 0,
			output: 0,
			error: 0,
			warning: 0,
			info: 0,
			log: 0
		};
		for (const entry of entries) {
			counts[entry.type]++;
		}
		return counts;
	});

	/**
	 * Handle input submission
	 */
	function handleSubmit() {
		const expression = inputValue.trim();
		if (!expression) return;

		// Add to history
		commandHistory = [expression, ...commandHistory.slice(0, 49)];
		historyIndex = -1;

		// Evaluate
		onEvaluate?.(expression);

		// Clear input
		inputValue = '';
	}

	/**
	 * Handle keyboard navigation
	 */
	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Enter':
				event.preventDefault();
				handleSubmit();
				break;
			case 'ArrowUp':
				if (commandHistory.length > 0) {
					event.preventDefault();
					historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
					inputValue = commandHistory[historyIndex] || '';
				}
				break;
			case 'ArrowDown':
				if (historyIndex >= 0) {
					event.preventDefault();
					historyIndex = Math.max(historyIndex - 1, -1);
					inputValue = historyIndex >= 0 ? commandHistory[historyIndex] : '';
				}
				break;
			case 'Escape':
				if (inputValue) {
					inputValue = '';
					historyIndex = -1;
				}
				break;
			case 'l':
				if (event.ctrlKey) {
					event.preventDefault();
					onClear?.();
				}
				break;
		}
	}

	/**
	 * Toggle entry expansion
	 */
	function toggleExpand(id: string) {
		if (expandedIds.has(id)) {
			expandedIds.delete(id);
		} else {
			expandedIds.add(id);
		}
	}

	/**
	 * Format value for display
	 */
	function formatValue(value: unknown): string {
		if (value === null) return 'null';
		if (value === undefined) return 'undefined';
		if (typeof value === 'string') return `"${value}"`;
		if (typeof value === 'number' || typeof value === 'boolean') return String(value);
		if (typeof value === 'function') return `ƒ ${value.name || 'anonymous'}()`;
		if (Array.isArray(value)) return `Array(${value.length})`;
		if (typeof value === 'object') {
			const constructor = (value as object).constructor?.name;
			return constructor || 'Object';
		}
		return String(value);
	}

	/**
	 * Get type color
	 */
	function getTypeColor(type: ConsoleEntryType): string {
		switch (type) {
			case 'error':
				return '#f44747';
			case 'warning':
				return '#ff8c00';
			case 'info':
				return '#3794ff';
			case 'log':
				return '#9cdcfe';
			case 'input':
				return '#dcdcaa';
			case 'output':
				return '#4ec9b0';
			default:
				return '#aaa';
		}
	}

	/**
	 * Get type icon
	 */
	function getTypeIcon(type: ConsoleEntryType): string {
		switch (type) {
			case 'error':
				return '✕';
			case 'warning':
				return '⚠';
			case 'info':
				return 'ℹ';
			case 'log':
				return '●';
			case 'input':
				return '›';
			case 'output':
				return '‹';
			default:
				return '';
		}
	}

	/**
	 * Format timestamp
	 */
	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3
		});
	}

	// Scroll to bottom when new entries are added
	$effect(() => {
		if (entries.length > 0 && consoleRef) {
			requestAnimationFrame(() => {
				consoleRef.scrollTop = consoleRef.scrollHeight;
			});
		}
	});

	// Focus input when opened
	$effect(() => {
		if (open && showInput) {
			setTimeout(() => inputRef?.focus(), 50);
		}
	});
</script>

{#if open}
	<div class="debug-console" style="height: {height}px;">
		<!-- Header -->
		<div class="console-header">
			<div class="header-left">
				<h3 class="console-title">Debug Console</h3>
			</div>

			<div class="header-filters">
				{#each (['all', 'error', 'warning', 'info', 'log'] as const) as filterType (filterType)}
					{@const count = entryCounts()[filterType]}
					<button
						class="filter-btn"
						class:active={filter === filterType}
						class:has-items={count > 0}
						style="--filter-color: {getTypeColor(filterType === 'all' ? 'log' : filterType)};"
						onclick={() => (filter = filterType)}
					>
						{#if filterType !== 'all'}
							<span class="filter-icon">{getTypeIcon(filterType)}</span>
						{/if}
						<span class="filter-label">
							{filterType === 'all' ? 'All' : filterType.charAt(0).toUpperCase() + filterType.slice(1)}
						</span>
						{#if count > 0}
							<span class="filter-count">{count}</span>
						{/if}
					</button>
				{/each}
			</div>

			<div class="header-actions">
				<button class="action-btn" onclick={onClear} title="Clear console (Ctrl+L)">
					🗑
				</button>
				{#if onClose}
					<button class="action-btn" onclick={onClose} title="Close">
						×
					</button>
				{/if}
			</div>
		</div>

		<!-- Console output -->
		<div class="console-output" bind:this={consoleRef}>
			{#if filteredEntries.length === 0}
				<div class="console-empty">
					{#if filter !== 'all'}
						No {filter} entries
					{:else}
						Console is empty
					{/if}
				</div>
			{:else}
				{#each filteredEntries as entry (entry.id)}
					{@const isExpanded = expandedIds.has(entry.id)}
					<div
						class="console-entry console-entry--{entry.type}"
						class:expandable={entry.expandable}
						class:expanded={isExpanded}
					>
						<span class="entry-icon" style="color: {getTypeColor(entry.type)};">
							{getTypeIcon(entry.type)}
						</span>

						{#if entry.expandable}
							<button
								class="entry-expand"
								onclick={() => toggleExpand(entry.id)}
							>
								{isExpanded ? '▾' : '▸'}
							</button>
						{/if}

						<div class="entry-content">
							{#if entry.type === 'input'}
								<span class="entry-prompt">›</span>
								<code class="entry-code">{entry.content}</code>
							{:else if typeof entry.content === 'string'}
								<span class="entry-text">{entry.content}</span>
							{:else if entry.expandable && isExpanded}
								<pre class="entry-json">{JSON.stringify(entry.content, null, 2)}</pre>
							{:else}
								<span class="entry-value">{formatValue(entry.content)}</span>
							{/if}
						</div>

						{#if entry.source}
							<span class="entry-source">
								{entry.source.file}:{entry.source.line}
							</span>
						{/if}

						<span class="entry-time">{formatTime(entry.timestamp)}</span>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Input -->
		{#if showInput}
			<div class="console-input">
				<span class="input-prompt">›</span>
				<input
					type="text"
					class="input-field"
					bind:this={inputRef}
					bind:value={inputValue}
					onkeydown={handleKeyDown}
					placeholder={inputPlaceholder}
				/>
				<button
					class="input-submit"
					onclick={handleSubmit}
					disabled={!inputValue.trim()}
				>
					⏎
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.debug-console {
		display: flex;
		flex-direction: column;
		background: var(--ide-bg-secondary, #1e1e2e);
		border-top: 1px solid var(--ide-border, #333);
		overflow: hidden;
	}

	.console-header {
		display: flex;
		align-items: center;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.2);
		border-bottom: 1px solid var(--ide-border, #333);
		gap: 12px;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.console-title {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--ide-text-primary, #e8e8f0);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.header-filters {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 1;
	}

	.filter-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--ide-text-muted, #666);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.filter-btn:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.filter-btn.active {
		border-color: var(--filter-color);
		color: var(--filter-color);
	}

	.filter-icon {
		font-size: 10px;
	}

	.filter-count {
		padding: 1px 5px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		font-size: 10px;
	}

	.filter-btn.has-items .filter-count {
		font-weight: 600;
	}

	.header-actions {
		display: flex;
		gap: 4px;
	}

	.action-btn {
		width: 24px;
		height: 24px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: var(--ide-text-muted, #666);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.action-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.console-output {
		flex: 1;
		overflow-y: auto;
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
	}

	.console-empty {
		padding: 24px;
		text-align: center;
		color: var(--ide-text-muted, #666);
		font-size: 12px;
	}

	.console-entry {
		display: flex;
		align-items: flex-start;
		padding: 4px 12px;
		gap: 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.console-entry:hover {
		background: rgba(255, 255, 255, 0.02);
	}

	.console-entry--error {
		background: rgba(244, 71, 71, 0.08);
	}

	.console-entry--warning {
		background: rgba(255, 140, 0, 0.08);
	}

	.entry-icon {
		flex-shrink: 0;
		width: 14px;
		font-size: 10px;
		text-align: center;
		padding-top: 2px;
	}

	.entry-expand {
		flex-shrink: 0;
		width: 14px;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--ide-text-muted, #666);
		font-size: 10px;
		cursor: pointer;
	}

	.entry-expand:hover {
		color: var(--ide-text-primary, #e8e8f0);
	}

	.entry-content {
		flex: 1;
		min-width: 0;
		word-break: break-word;
	}

	.entry-prompt {
		color: #dcdcaa;
		margin-right: 6px;
	}

	.entry-code {
		color: #dcdcaa;
	}

	.entry-text {
		color: var(--ide-text-primary, #e8e8f0);
	}

	.entry-value {
		color: #4ec9b0;
	}

	.entry-json {
		margin: 4px 0 0;
		padding: 8px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		font-size: 11px;
		color: var(--ide-text-secondary, #aaa);
		white-space: pre-wrap;
	}

	.console-entry--error .entry-text {
		color: #f44747;
	}

	.console-entry--warning .entry-text {
		color: #ff8c00;
	}

	.entry-source {
		flex-shrink: 0;
		font-size: 10px;
		color: var(--ide-text-muted, #666);
	}

	.entry-time {
		flex-shrink: 0;
		font-size: 10px;
		color: var(--ide-text-muted, #555);
		font-family: monospace;
	}

	/* Input */
	.console-input {
		display: flex;
		align-items: center;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.15);
		border-top: 1px solid var(--ide-border, #333);
		gap: 8px;
	}

	.input-prompt {
		color: #dcdcaa;
		font-family: 'JetBrains Mono', monospace;
		font-size: 14px;
	}

	.input-field {
		flex: 1;
		padding: 6px 0;
		background: transparent;
		border: none;
		color: var(--ide-text-primary, #e8e8f0);
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		outline: none;
	}

	.input-field::placeholder {
		color: var(--ide-text-muted, #555);
	}

	.input-submit {
		width: 28px;
		height: 28px;
		padding: 0;
		background: rgba(55, 148, 255, 0.15);
		border: none;
		border-radius: 4px;
		color: #3794ff;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.input-submit:hover:not(:disabled) {
		background: rgba(55, 148, 255, 0.25);
	}

	.input-submit:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
</style>
