<script lang="ts">
	/**
	 * Inline Diagnostics Layer
	 *
	 * Shows visual indicators for code diagnostics:
	 * - Squiggly underlines for errors/warnings
	 * - Gutter icons
	 * - Hover tooltips with details
	 * - Quick fix suggestions
	 */

	import type {
		DiagnosticsManager,
		Diagnostic,
		DiagnosticSeverity,
		DiagnosticFix
	} from './core/diagnostics';
	import { getSeverityIcon, getSeverityColor } from './core/diagnostics';

	interface Props {
		/** Diagnostics manager */
		manager: DiagnosticsManager;
		/** Current file path */
		filePath: string;
		/** Line height in pixels */
		lineHeight: number;
		/** Character width for positioning */
		charWidth: number;
		/** Gutter width offset */
		gutterWidth?: number;
		/** Whether enabled */
		enabled?: boolean;
		/** Show squiggly underlines */
		showSquiggles?: boolean;
		/** Show gutter icons */
		showGutterIcons?: boolean;
		/** Callback when fix is applied */
		onApplyFix?: (diagnostic: Diagnostic, fix: DiagnosticFix) => void;
		/** Callback when diagnostic is clicked */
		onDiagnosticClick?: (diagnostic: Diagnostic) => void;
	}

	let {
		manager,
		filePath,
		lineHeight,
		charWidth,
		gutterWidth = 50,
		enabled = true,
		showSquiggles = true,
		showGutterIcons = true,
		onApplyFix,
		onDiagnosticClick
	}: Props = $props();

	let diagnostics = $state<Diagnostic[]>([]);
	let hoveredDiagnostic = $state<Diagnostic | null>(null);
	let tooltipPosition = $state({ top: 0, left: 0 });
	let showTooltip = $state(false);

	// Subscribe to manager updates
	$effect(() => {
		const unsubscribe = manager.subscribe(() => {
			diagnostics = manager.getDiagnostics(filePath);
		});

		// Initial load
		diagnostics = manager.getDiagnostics(filePath);

		return unsubscribe;
	});

	// Group diagnostics by line for gutter icons
	const diagnosticsByLine = $derived(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation variable recreated each derivation, not mutated reactive state
		const byLine = new Map<number, Diagnostic[]>();
		for (const d of diagnostics) {
			const line = d.range.start.line;
			if (!byLine.has(line)) {
				byLine.set(line, []);
			}
			byLine.get(line)!.push(d);
		}
		return byLine;
	});

	// Get unique lines with diagnostics
	const linesWithDiagnostics = $derived(() => {
		return [...diagnosticsByLine().keys()].sort((a, b) => a - b);
	});

	/**
	 * Get the highest severity for a line
	 */
	function getLineSeverity(line: number): DiagnosticSeverity {
		const lineDiags = diagnosticsByLine().get(line) || [];
		if (lineDiags.some((d) => d.severity === 'error')) return 'error';
		if (lineDiags.some((d) => d.severity === 'warning')) return 'warning';
		if (lineDiags.some((d) => d.severity === 'info')) return 'info';
		return 'hint';
	}

	/**
	 * Handle mouse enter on diagnostic
	 */
	function handleMouseEnter(diagnostic: Diagnostic, event: MouseEvent) {
		hoveredDiagnostic = diagnostic;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		tooltipPosition = {
			top: rect.bottom + 4,
			left: Math.max(rect.left, 12)
		};
		showTooltip = true;
	}

	/**
	 * Handle mouse leave
	 */
	function handleMouseLeave() {
		showTooltip = false;
		// Delay clearing to allow tooltip interaction
		setTimeout(() => {
			if (!showTooltip) {
				hoveredDiagnostic = null;
			}
		}, 100);
	}

	/**
	 * Handle tooltip mouse enter (keep tooltip open)
	 */
	function handleTooltipEnter() {
		showTooltip = true;
	}

	/**
	 * Handle tooltip mouse leave
	 */
	function handleTooltipLeave() {
		showTooltip = false;
		hoveredDiagnostic = null;
	}

	/**
	 * Handle fix click
	 */
	function handleFixClick(diagnostic: Diagnostic, fix: DiagnosticFix) {
		onApplyFix?.(diagnostic, fix);
		showTooltip = false;
		hoveredDiagnostic = null;
	}

	/**
	 * Generate squiggle path for SVG
	 */
	function generateSquigglePath(width: number): string {
		const amplitude = 2;
		const frequency = 4;
		let path = `M 0 ${amplitude}`;

		for (let x = 0; x < width; x += frequency) {
			const y = x % (frequency * 2) === 0 ? 0 : amplitude * 2;
			path += ` L ${x + frequency / 2} ${y}`;
		}

		return path;
	}
</script>

{#if enabled && diagnostics.length > 0}
	<div class="diagnostics-layer" aria-hidden="true">
		<!-- Gutter icons -->
		{#if showGutterIcons}
			<div class="diagnostics-gutter" style="width: {gutterWidth}px;">
				{#each linesWithDiagnostics() as line (line)}
					{@const severity = getLineSeverity(line)}
					{@const lineDiags = diagnosticsByLine().get(line) || []}
					<button
						class="gutter-icon gutter-icon--{severity}"
						style="top: {line * lineHeight}px; height: {lineHeight}px;"
						onclick={() => onDiagnosticClick?.(lineDiags[0])}
						onmouseenter={(e) => handleMouseEnter(lineDiags[0], e)}
						onmouseleave={handleMouseLeave}
						title="{lineDiags.length} diagnostic{lineDiags.length !== 1 ? 's' : ''}"
					>
						<span class="icon-text">{getSeverityIcon(severity)}</span>
						{#if lineDiags.length > 1}
							<span class="icon-count">{lineDiags.length}</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Squiggly underlines -->
		{#if showSquiggles}
			<div class="diagnostics-squiggles" style="left: {gutterWidth}px;">
				{#each diagnostics as diagnostic (diagnostic.id)}
					{@const startCol = diagnostic.range.start.column}
					{@const endCol = diagnostic.range.end.column}
					{@const width = Math.max((endCol - startCol) * charWidth, charWidth * 2)}
					{@const color = getSeverityColor(diagnostic.severity)}

					<div
						class="squiggle squiggle--{diagnostic.severity}"
						class:squiggle--deprecated={diagnostic.tags?.deprecated}
						class:squiggle--unnecessary={diagnostic.tags?.unnecessary}
						style="
							top: {diagnostic.range.start.line * lineHeight + lineHeight - 4}px;
							left: {startCol * charWidth}px;
							width: {width}px;
						"
						onmouseenter={(e) => handleMouseEnter(diagnostic, e)}
						onmouseleave={handleMouseLeave}
						role="button"
						tabindex={-1}
					>
						<svg class="squiggle-svg" {width} height="4" viewBox="0 0 {width} 4">
							<path d={generateSquigglePath(width)} stroke={color} stroke-width="1" fill="none" />
						</svg>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Tooltip -->
	{#if showTooltip && hoveredDiagnostic}
		<div
			class="diagnostic-tooltip"
			role="tooltip"
			style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px;"
			onmouseenter={handleTooltipEnter}
			onmouseleave={handleTooltipLeave}
		>
			<div class="tooltip-header">
				<span
					class="tooltip-severity"
					style="color: {getSeverityColor(hoveredDiagnostic.severity)};"
				>
					{getSeverityIcon(hoveredDiagnostic.severity)}
				</span>
				<span class="tooltip-source">{hoveredDiagnostic.source}</span>
				{#if hoveredDiagnostic.code}
					<span class="tooltip-code">
						{#if hoveredDiagnostic.codeUrl}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- codeUrl is an external URL from diagnostic data, not a local app path -->
							<a href={hoveredDiagnostic.codeUrl} target="_blank" rel="noopener">
								{hoveredDiagnostic.code}
							</a>
						{:else}
							{hoveredDiagnostic.code}
						{/if}
					</span>
				{/if}
			</div>

			<div class="tooltip-message">{hoveredDiagnostic.message}</div>

			{#if hoveredDiagnostic.relatedInfo && hoveredDiagnostic.relatedInfo.length > 0}
				<div class="tooltip-related">
					{#each hoveredDiagnostic.relatedInfo as info, i (i)}
						<div class="related-item">
							<span class="related-location">
								{info.filePath || 'this file'}:{info.range.start.line + 1}
							</span>
							<span class="related-message">{info.message}</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if hoveredDiagnostic.fixes && hoveredDiagnostic.fixes.length > 0}
				<div class="tooltip-fixes">
					<div class="fixes-header">Quick Fixes</div>
					{#each hoveredDiagnostic.fixes as fix, i (i)}
						<button
							class="fix-button"
							class:fix-button--preferred={fix.isPreferred}
							onclick={() => handleFixClick(hoveredDiagnostic!, fix)}
						>
							<span class="fix-icon">🔧</span>
							<span class="fix-title">{fix.title}</span>
						</button>
					{/each}
				</div>
			{/if}

			<div class="tooltip-location">
				Line {hoveredDiagnostic.range.start.line + 1}, Column {hoveredDiagnostic.range.start
					.column + 1}
			</div>
		</div>
	{/if}
{/if}

<style>
	.diagnostics-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 5;
	}

	.diagnostics-gutter {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
	}

	.gutter-icon {
		position: absolute;
		left: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		padding: 0;
		background: transparent;
		border: none;
		cursor: pointer;
		pointer-events: auto;
		transition: transform 0.1s ease;
	}

	.gutter-icon:hover {
		transform: scale(1.2);
	}

	.icon-text {
		font-size: 12px;
	}

	.gutter-icon--error .icon-text {
		color: #f44747;
	}

	.gutter-icon--warning .icon-text {
		color: #ff8c00;
	}

	.gutter-icon--info .icon-text {
		color: #3794ff;
	}

	.gutter-icon--hint .icon-text {
		color: #6c6c6c;
	}

	.icon-count {
		position: absolute;
		top: -2px;
		right: -4px;
		min-width: 12px;
		height: 12px;
		padding: 0 3px;
		background: var(--ide-bg-elevated, #333);
		border-radius: 6px;
		font-size: 9px;
		font-weight: 600;
		color: var(--ide-text-primary, #e8e8f0);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.diagnostics-squiggles {
		position: absolute;
		top: 0;
		height: 100%;
	}

	.squiggle {
		position: absolute;
		pointer-events: auto;
		cursor: pointer;
	}

	.squiggle--deprecated {
		opacity: 0.6;
	}

	.squiggle--unnecessary {
		opacity: 0.5;
	}

	.squiggle-svg {
		display: block;
	}

	/* Tooltip */
	.diagnostic-tooltip {
		position: fixed;
		z-index: 1000;
		min-width: 300px;
		max-width: 500px;
		background: var(--ide-bg-elevated, #252536);
		border: 1px solid var(--ide-border, #333);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		font-size: 13px;
		pointer-events: auto;
		overflow: hidden;
	}

	.tooltip-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: rgba(0, 0, 0, 0.2);
		border-bottom: 1px solid var(--ide-border, #333);
	}

	.tooltip-severity {
		font-size: 14px;
	}

	.tooltip-source {
		font-weight: 500;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.tooltip-code {
		margin-left: auto;
		font-family: monospace;
		font-size: 11px;
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		color: var(--ide-text-secondary, #aaa);
	}

	.tooltip-code a {
		color: inherit;
		text-decoration: none;
	}

	.tooltip-code a:hover {
		color: var(--ide-interactive, #4f8cc9);
		text-decoration: underline;
	}

	.tooltip-message {
		padding: 12px;
		color: var(--ide-text-primary, #e8e8f0);
		line-height: 1.5;
	}

	.tooltip-related {
		padding: 0 12px 12px;
		border-top: 1px solid var(--ide-border, #333);
	}

	.related-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 0;
		font-size: 12px;
	}

	.related-location {
		font-family: monospace;
		color: var(--ide-text-muted, #888);
	}

	.related-message {
		color: var(--ide-text-secondary, #aaa);
	}

	.tooltip-fixes {
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.15);
		border-top: 1px solid var(--ide-border, #333);
	}

	.fixes-header {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--ide-text-muted, #888);
		margin-bottom: 6px;
	}

	.fix-button {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary, #aaa);
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s ease;
	}

	.fix-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.fix-button--preferred {
		background: rgba(59, 130, 246, 0.15);
		color: #3b82f6;
	}

	.fix-button--preferred:hover {
		background: rgba(59, 130, 246, 0.25);
	}

	.fix-icon {
		font-size: 11px;
	}

	.tooltip-location {
		padding: 8px 12px;
		font-size: 11px;
		font-family: monospace;
		color: var(--ide-text-muted, #888);
		background: rgba(0, 0, 0, 0.2);
		border-top: 1px solid var(--ide-border, #333);
	}
</style>
