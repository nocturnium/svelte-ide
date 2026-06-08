<script lang="ts">
	/**
	 * DiagnosticsPanel - LSP diagnostics list display
	 *
	 * Shows errors, warnings, info, and hints from the language server
	 * in a filterable, navigable panel.
	 */

	import type { Diagnostic, DiagnosticSeverity } from '$lib/types/lsp';

	interface DiagnosticWithFile extends Diagnostic {
		uri: string;
		fileName: string;
	}

	interface Props {
		/** Diagnostics grouped by file URI */
		diagnostics: Map<string, Diagnostic[]>;
		/** Filter by severity (null = show all) */
		severityFilter?: DiagnosticSeverity | null;
		/** Called when a diagnostic is clicked */
		onNavigate: (uri: string, line: number, column: number) => void;
		/** Called when filter changes */
		onFilterChange?: (severity: DiagnosticSeverity | null) => void;
		class?: string;
	}

	let {
		diagnostics,
		severityFilter = null,
		onNavigate,
		onFilterChange,
		class: className = ''
	}: Props = $props();

	// Flatten diagnostics with file info
	let allDiagnostics = $derived(() => {
		const result: DiagnosticWithFile[] = [];
		diagnostics.forEach((diags, uri) => {
			const fileName = uri.split('/').pop() || uri;
			for (const diag of diags) {
				if (severityFilter === null || diag.severity === severityFilter) {
					result.push({ ...diag, uri, fileName });
				}
			}
		});
		// Sort by severity (errors first), then by file, then by line
		return result.sort((a, b) => {
			if (a.severity !== b.severity) {
				return (a.severity ?? 4) - (b.severity ?? 4);
			}
			if (a.uri !== b.uri) {
				return a.uri.localeCompare(b.uri);
			}
			return a.range.start.line - b.range.start.line;
		});
	});

	// Count by severity
	let counts = $derived(() => {
		const result = { errors: 0, warnings: 0, info: 0, hints: 0 };
		diagnostics.forEach((diags) => {
			for (const diag of diags) {
				switch (diag.severity) {
					case 1: result.errors++; break;
					case 2: result.warnings++; break;
					case 3: result.info++; break;
					case 4: result.hints++; break;
				}
			}
		});
		return result;
	});

	function getSeverityIcon(severity?: DiagnosticSeverity): string {
		switch (severity) {
			case 1: return 'error';
			case 2: return 'warning';
			case 3: return 'info';
			case 4: return 'hint';
			default: return 'info';
		}
	}

	function handleDiagnosticClick(diag: DiagnosticWithFile) {
		onNavigate(diag.uri, diag.range.start.line, diag.range.start.character);
	}

	function setFilter(severity: DiagnosticSeverity | null) {
		onFilterChange?.(severity);
	}
</script>

<div class="diagnostics-panel {className}">
	<div class="diagnostics-panel__header">
		<h3 class="diagnostics-panel__title">Problems</h3>
		<div class="diagnostics-panel__filters">
			<button
				class="diagnostics-panel__filter"
				class:diagnostics-panel__filter--active={severityFilter === null}
				onclick={() => setFilter(null)}
				title="Show all"
			>
				All ({allDiagnostics().length})
			</button>
			<button
				class="diagnostics-panel__filter diagnostics-panel__filter--error"
				class:diagnostics-panel__filter--active={severityFilter === 1}
				onclick={() => setFilter(1)}
				title="Show errors"
				disabled={counts().errors === 0}
			>
				<span class="diagnostics-panel__icon diagnostics-panel__icon--error">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG icons are static string literals defined in this file, not user content -->
					{@html errorIcon}
				</span>
				{counts().errors}
			</button>
			<button
				class="diagnostics-panel__filter diagnostics-panel__filter--warning"
				class:diagnostics-panel__filter--active={severityFilter === 2}
				onclick={() => setFilter(2)}
				title="Show warnings"
				disabled={counts().warnings === 0}
			>
				<span class="diagnostics-panel__icon diagnostics-panel__icon--warning">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG icons are static string literals defined in this file, not user content -->
					{@html warningIcon}
				</span>
				{counts().warnings}
			</button>
			<button
				class="diagnostics-panel__filter diagnostics-panel__filter--info"
				class:diagnostics-panel__filter--active={severityFilter === 3}
				onclick={() => setFilter(3)}
				title="Show info"
				disabled={counts().info === 0}
			>
				<span class="diagnostics-panel__icon diagnostics-panel__icon--info">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG icons are static string literals defined in this file, not user content -->
					{@html infoIcon}
				</span>
				{counts().info}
			</button>
		</div>
	</div>

	<div class="diagnostics-panel__list">
		{#if allDiagnostics().length === 0}
			<div class="diagnostics-panel__empty">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG icons are static string literals defined in this file, not user content -->
			<span class="diagnostics-panel__empty-icon">{@html checkIcon}</span>
				<span>No problems detected</span>
			</div>
		{:else}
			{#each allDiagnostics() as diag (diag.uri + ':' + diag.range.start.line + ':' + diag.range.start.character + ':' + diag.message)}
				<button
					class="diagnostics-panel__item diagnostics-panel__item--{getSeverityIcon(diag.severity)}"
					onclick={() => handleDiagnosticClick(diag)}
				>
					<span class="diagnostics-panel__item-icon">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG icons are static string literals defined in this file, not user content -->
						{@html getSeveritySVG(diag.severity)}
					</span>
					<div class="diagnostics-panel__item-content">
						<span class="diagnostics-panel__item-message">{diag.message}</span>
						<span class="diagnostics-panel__item-location">
							{diag.fileName}:{diag.range.start.line + 1}:{diag.range.start.character + 1}
							{#if diag.source}
								<span class="diagnostics-panel__item-source">[{diag.source}]</span>
							{/if}
							{#if diag.code}
								<span class="diagnostics-panel__item-code">({diag.code})</span>
							{/if}
						</span>
					</div>
				</button>
			{/each}
		{/if}
	</div>
</div>

<script module lang="ts">
	const errorIcon = `<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--ide-bg-primary)" stroke-width="1.5"/></svg>`;
	const warningIcon = `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1L1 15h14L8 1z" fill="currentColor"/><path d="M8 6v4M8 12v1" stroke="var(--ide-bg-primary)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
	const infoIcon = `<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 5v1M8 8v4" stroke="var(--ide-bg-primary)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
	const checkIcon = `<svg viewBox="0 0 16 16" width="24" height="24"><circle cx="8" cy="8" r="7" fill="var(--ide-success)" opacity="0.2"/><path d="M5 8l2 2 4-4" stroke="var(--ide-success)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

	function getSeveritySVG(severity?: number): string {
		switch (severity) {
			case 1: return errorIcon;
			case 2: return warningIcon;
			case 3: return infoIcon;
			case 4: return `<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4v5M8 11v1" stroke="var(--ide-bg-primary)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
			default: return infoIcon;
		}
	}
</script>

<style>
	.diagnostics-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--ide-bg-secondary);
		border-top: 1px solid var(--ide-border);
	}

	.diagnostics-panel__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		border-bottom: 1px solid var(--ide-border);
		background: var(--ide-bg-tertiary);
	}

	.diagnostics-panel__title {
		margin: 0;
		font-size: var(--ide-font-size-sm);
		font-weight: 500;
		color: var(--ide-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.diagnostics-panel__filters {
		display: flex;
		gap: var(--ide-spacing-xs);
	}

	.diagnostics-panel__filter {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border: none;
		border-radius: var(--ide-radius-sm);
		background: transparent;
		color: var(--ide-text-secondary);
		font: inherit;
		font-size: var(--ide-font-size-xs);
		cursor: pointer;
		transition: all var(--ide-transition-fast);
	}

	.diagnostics-panel__filter:hover:not(:disabled) {
		background: var(--ide-bg-hover);
	}

	.diagnostics-panel__filter:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.diagnostics-panel__filter--active {
		background: var(--ide-bg-active);
		color: var(--ide-text-primary);
	}

	.diagnostics-panel__icon {
		display: flex;
		align-items: center;
	}

	.diagnostics-panel__icon--error {
		color: var(--ide-error);
	}

	.diagnostics-panel__icon--warning {
		color: var(--ide-warning);
	}

	.diagnostics-panel__icon--info {
		color: var(--ide-info);
	}

	.diagnostics-panel__list {
		flex: 1;
		overflow-y: auto;
	}

	.diagnostics-panel__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--ide-spacing-sm);
		height: 100%;
		color: var(--ide-text-muted);
		font-size: var(--ide-font-size-sm);
	}

	.diagnostics-panel__item {
		display: flex;
		align-items: flex-start;
		gap: var(--ide-spacing-sm);
		width: 100%;
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		border: none;
		border-bottom: 1px solid var(--ide-border-light);
		background: transparent;
		color: var(--ide-text-primary);
		font: inherit;
		font-size: var(--ide-font-size-sm);
		text-align: left;
		cursor: pointer;
		transition: background var(--ide-transition-fast);
	}

	.diagnostics-panel__item:hover {
		background: var(--ide-bg-hover);
	}

	.diagnostics-panel__item:last-child {
		border-bottom: none;
	}

	.diagnostics-panel__item-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		margin-top: 2px;
	}

	.diagnostics-panel__item--error .diagnostics-panel__item-icon {
		color: var(--ide-error);
	}

	.diagnostics-panel__item--warning .diagnostics-panel__item-icon {
		color: var(--ide-warning);
	}

	.diagnostics-panel__item--info .diagnostics-panel__item-icon {
		color: var(--ide-info);
	}

	.diagnostics-panel__item--hint .diagnostics-panel__item-icon {
		color: var(--ide-text-muted);
	}

	.diagnostics-panel__item-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.diagnostics-panel__item-message {
		color: var(--ide-text-primary);
		word-break: break-word;
	}

	.diagnostics-panel__item-location {
		font-size: var(--ide-font-size-xs);
		font-family: var(--ide-font-mono);
		color: var(--ide-text-muted);
	}

	.diagnostics-panel__item-source {
		color: var(--ide-text-secondary);
	}

	.diagnostics-panel__item-code {
		color: var(--ide-text-muted);
	}

	/* Scrollbar styling */
	.diagnostics-panel__list::-webkit-scrollbar {
		width: 8px;
	}

	.diagnostics-panel__list::-webkit-scrollbar-track {
		background: transparent;
	}

	.diagnostics-panel__list::-webkit-scrollbar-thumb {
		background: var(--ide-scrollbar-thumb);
		border-radius: 4px;
	}
</style>
