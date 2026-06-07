<script lang="ts">
	/**
	 * Problems Panel
	 *
	 * Lists all diagnostics across files with:
	 * - Filtering by severity, source, file
	 * - Grouping by file
	 * - Quick navigation
	 * - Batch actions
	 */

	import type {
		DiagnosticsManager,
		Diagnostic,
		DiagnosticSeverity
	} from './core/diagnostics';
	import {
		getSeverityIcon,
		getSeverityColor,
		getSeverityLabel,
		sortDiagnostics
	} from './core/diagnostics';

	interface Props {
		/** Diagnostics manager */
		manager: DiagnosticsManager;
		/** Whether panel is open */
		open?: boolean;
		/** Panel height */
		height?: number;
		/** Callback when diagnostic is clicked */
		onNavigate?: (filePath: string, diagnostic: Diagnostic) => void;
		/** Callback when panel is closed */
		onClose?: () => void;
	}

	let {
		manager,
		open = true,
		height = 200,
		onNavigate,
		onClose
	}: Props = $props();

	let allDiagnostics = $state<Map<string, Diagnostic[]>>(new Map());
	let searchQuery = $state('');
	let severityFilter = $state<DiagnosticSeverity[]>(['error', 'warning', 'info', 'hint']);
	let sourceFilter = $state<string | null>(null);
	let collapsedFiles = $state<Set<string>>(new Set());
	let groupByFile = $state(true);

	// Subscribe to manager updates
	$effect(() => {
		const unsubscribe = manager.subscribe(() => {
			allDiagnostics = manager.getAllDiagnostics();
		});

		// Initial load
		allDiagnostics = manager.getAllDiagnostics();

		return unsubscribe;
	});

	// Get all unique sources
	const allSources = $derived(() => {
		const sources = new Set<string>();
		for (const diagnostics of allDiagnostics.values()) {
			for (const d of diagnostics) {
				sources.add(d.source);
			}
		}
		return [...sources].sort();
	});

	// Filter diagnostics
	const filteredDiagnostics = $derived(() => {
		const filtered = new Map<string, Diagnostic[]>();

		for (const [filePath, diagnostics] of allDiagnostics) {
			const filteredList = diagnostics.filter((d) => {
				// Severity filter
				if (!severityFilter.includes(d.severity)) return false;

				// Source filter
				if (sourceFilter && d.source !== sourceFilter) return false;

				// Search filter
				if (searchQuery) {
					const query = searchQuery.toLowerCase();
					const matchesMessage = d.message.toLowerCase().includes(query);
					const matchesCode = d.code?.toString().toLowerCase().includes(query);
					const matchesFile = filePath.toLowerCase().includes(query);
					if (!matchesMessage && !matchesCode && !matchesFile) return false;
				}

				return true;
			});

			if (filteredList.length > 0) {
				filtered.set(filePath, sortDiagnostics(filteredList));
			}
		}

		return filtered;
	});

	// Get counts
	const counts = $derived(() => {
		const c: Record<DiagnosticSeverity, number> = { error: 0, warning: 0, info: 0, hint: 0 };
		for (const diagnostics of filteredDiagnostics().values()) {
			for (const d of diagnostics) {
				c[d.severity]++;
			}
		}
		return c;
	});

	const totalCount = $derived(() => {
		return counts().error + counts().warning + counts().info + counts().hint;
	});

	/**
	 * Toggle severity filter
	 */
	function toggleSeverity(severity: DiagnosticSeverity) {
		if (severityFilter.includes(severity)) {
			severityFilter = severityFilter.filter((s) => s !== severity);
		} else {
			severityFilter = [...severityFilter, severity];
		}
	}

	/**
	 * Toggle file collapse
	 */
	function toggleFileCollapse(filePath: string) {
		const newCollapsed = new Set(collapsedFiles);
		if (newCollapsed.has(filePath)) {
			newCollapsed.delete(filePath);
		} else {
			newCollapsed.add(filePath);
		}
		collapsedFiles = newCollapsed;
	}

	/**
	 * Expand all files
	 */
	function expandAll() {
		collapsedFiles = new Set();
	}

	/**
	 * Collapse all files
	 */
	function collapseAll() {
		collapsedFiles = new Set(filteredDiagnostics().keys());
	}

	/**
	 * Get file name from path
	 */
	function getFileName(path: string): string {
		return path.split('/').pop() || path;
	}

	/**
	 * Get directory from path
	 */
	function getDirectory(path: string): string {
		const parts = path.split('/');
		parts.pop();
		return parts.join('/') || '.';
	}

	/**
	 * Handle diagnostic click
	 */
	function handleDiagnosticClick(filePath: string, diagnostic: Diagnostic) {
		onNavigate?.(filePath, diagnostic);
	}
</script>

{#if open}
	<div class="problems-panel" style="height: {height}px;">
		<!-- Header -->
		<div class="panel-header">
			<div class="header-left">
				<h3 class="panel-title">Problems</h3>
				<span class="panel-count">{totalCount()}</span>
			</div>

			<div class="header-filters">
				<!-- Severity filters -->
				{#each (['error', 'warning', 'info', 'hint'] as const) as severity}
					{@const count = counts()[severity]}
					<button
						class="severity-filter"
						class:active={severityFilter.includes(severity)}
						class:has-items={count > 0}
						style="--severity-color: {getSeverityColor(severity)};"
						onclick={() => toggleSeverity(severity)}
						title="{getSeverityLabel(severity)}s ({count})"
					>
						<span class="filter-icon">{getSeverityIcon(severity)}</span>
						<span class="filter-count">{count}</span>
					</button>
				{/each}

				<!-- Source filter -->
				<select
					class="source-filter"
					bind:value={sourceFilter}
					title="Filter by source"
				>
					<option value={null}>All sources</option>
					{#each allSources() as source}
						<option value={source}>{source}</option>
					{/each}
				</select>
			</div>

			<div class="header-actions">
				<button class="action-btn" onclick={expandAll} title="Expand all">
					⊞
				</button>
				<button class="action-btn" onclick={collapseAll} title="Collapse all">
					⊟
				</button>
				<button
					class="action-btn"
					class:active={groupByFile}
					onclick={() => (groupByFile = !groupByFile)}
					title="Group by file"
				>
					📁
				</button>
				{#if onClose}
					<button class="action-btn close-btn" onclick={onClose} title="Close panel">
						×
					</button>
				{/if}
			</div>
		</div>

		<!-- Search -->
		<div class="panel-search">
			<input
				type="text"
				class="search-input"
				placeholder="Filter problems..."
				bind:value={searchQuery}
			/>
			{#if searchQuery}
				<button class="search-clear" onclick={() => (searchQuery = '')}>
					×
				</button>
			{/if}
		</div>

		<!-- Problems list -->
		<div class="panel-content">
			{#if totalCount() === 0}
				<div class="panel-empty">
					{#if searchQuery || sourceFilter || severityFilter.length < 4}
						No problems match the current filters
					{:else}
						No problems detected
					{/if}
				</div>
			{:else if groupByFile}
				<!-- Grouped by file -->
				{#each [...filteredDiagnostics().entries()] as [filePath, diagnostics] (filePath)}
					{@const isCollapsed = collapsedFiles.has(filePath)}
					<div class="file-group">
						<button class="file-header" onclick={() => toggleFileCollapse(filePath)}>
							<span class="file-chevron" class:collapsed={isCollapsed}>▾</span>
							<span class="file-icon">📄</span>
							<span class="file-name">{getFileName(filePath)}</span>
							<span class="file-path">{getDirectory(filePath)}</span>
							<span class="file-count">{diagnostics.length}</span>
						</button>

						{#if !isCollapsed}
							<div class="file-diagnostics">
								{#each diagnostics as diagnostic (diagnostic.id)}
									<button
										class="diagnostic-item"
										onclick={() => handleDiagnosticClick(filePath, diagnostic)}
									>
										<span
											class="diagnostic-icon"
											style="color: {getSeverityColor(diagnostic.severity)};"
										>
											{getSeverityIcon(diagnostic.severity)}
										</span>
										<span class="diagnostic-message">{diagnostic.message}</span>
										<span class="diagnostic-source">{diagnostic.source}</span>
										{#if diagnostic.code}
											<span class="diagnostic-code">{diagnostic.code}</span>
										{/if}
										<span class="diagnostic-location">
											[Ln {diagnostic.range.start.line + 1}, Col {diagnostic.range.start.column + 1}]
										</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			{:else}
				<!-- Flat list -->
				{#each [...filteredDiagnostics().entries()] as [filePath, diagnostics]}
					{#each diagnostics as diagnostic (diagnostic.id)}
						<button
							class="diagnostic-item diagnostic-item--flat"
							onclick={() => handleDiagnosticClick(filePath, diagnostic)}
						>
							<span
								class="diagnostic-icon"
								style="color: {getSeverityColor(diagnostic.severity)};"
							>
								{getSeverityIcon(diagnostic.severity)}
							</span>
							<span class="diagnostic-message">{diagnostic.message}</span>
							<span class="diagnostic-file">{getFileName(filePath)}</span>
							<span class="diagnostic-source">{diagnostic.source}</span>
							<span class="diagnostic-location">
								[Ln {diagnostic.range.start.line + 1}]
							</span>
						</button>
					{/each}
				{/each}
			{/if}
		</div>
	</div>
{/if}

<style>
	.problems-panel {
		display: flex;
		flex-direction: column;
		background: var(--ide-bg-secondary, #1e1e2e);
		border-top: 1px solid var(--ide-border, #333);
		overflow: hidden;
	}

	.panel-header {
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

	.panel-title {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--ide-text-primary, #e8e8f0);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.panel-count {
		padding: 2px 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		font-size: 11px;
		font-weight: 500;
		color: var(--ide-text-secondary, #aaa);
	}

	.header-filters {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 1;
	}

	.severity-filter {
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

	.severity-filter:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.severity-filter.active {
		border-color: var(--severity-color);
		color: var(--severity-color);
	}

	.severity-filter.has-items .filter-count {
		font-weight: 600;
	}

	.source-filter {
		padding: 4px 8px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--ide-border, #333);
		border-radius: 4px;
		color: var(--ide-text-secondary, #aaa);
		font-size: 11px;
		outline: none;
		cursor: pointer;
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

	.action-btn.active {
		color: #a855f7;
	}

	.close-btn {
		font-size: 16px;
	}

	.panel-search {
		position: relative;
		padding: 8px 12px;
		border-bottom: 1px solid var(--ide-border, #333);
	}

	.search-input {
		width: 100%;
		padding: 6px 28px 6px 10px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--ide-border, #333);
		border-radius: 4px;
		color: var(--ide-text-primary, #e8e8f0);
		font-size: 12px;
		outline: none;
	}

	.search-input:focus {
		border-color: var(--ide-interactive, #4f8cc9);
	}

	.search-clear {
		position: absolute;
		right: 18px;
		top: 50%;
		transform: translateY(-50%);
		width: 18px;
		height: 18px;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--ide-text-muted, #666);
		font-size: 14px;
		cursor: pointer;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
	}

	.panel-empty {
		padding: 24px;
		text-align: center;
		color: var(--ide-text-muted, #666);
		font-size: 13px;
	}

	/* File group */
	.file-group {
		border-bottom: 1px solid var(--ide-border, #333);
	}

	.file-header {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.1);
		border: none;
		color: var(--ide-text-primary, #e8e8f0);
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		gap: 8px;
	}

	.file-header:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.file-chevron {
		font-size: 10px;
		color: var(--ide-text-muted, #666);
		transition: transform 0.15s ease;
	}

	.file-chevron.collapsed {
		transform: rotate(-90deg);
	}

	.file-icon {
		font-size: 11px;
	}

	.file-name {
		font-weight: 500;
	}

	.file-path {
		flex: 1;
		color: var(--ide-text-muted, #666);
		font-size: 11px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-count {
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		font-size: 10px;
		color: var(--ide-text-secondary, #aaa);
	}

	/* Diagnostic item */
	.diagnostic-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 6px 12px 6px 36px;
		background: transparent;
		border: none;
		color: var(--ide-text-secondary, #aaa);
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		gap: 8px;
	}

	.diagnostic-item:hover {
		background: rgba(255, 255, 255, 0.05);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.diagnostic-item--flat {
		padding-left: 12px;
		border-bottom: 1px solid var(--ide-border, #333);
	}

	.diagnostic-icon {
		flex-shrink: 0;
		font-size: 11px;
	}

	.diagnostic-message {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.diagnostic-file {
		font-weight: 500;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.diagnostic-source {
		font-size: 10px;
		padding: 1px 4px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		color: var(--ide-text-muted, #888);
	}

	.diagnostic-code {
		font-family: monospace;
		font-size: 10px;
		color: var(--ide-text-muted, #888);
	}

	.diagnostic-location {
		font-family: monospace;
		font-size: 10px;
		color: var(--ide-text-muted, #666);
	}
</style>
