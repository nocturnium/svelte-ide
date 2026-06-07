<script lang="ts">
	/**
	 * Inline Diff Layer
	 *
	 * Shows visual indicators for changed, added, and removed lines
	 * compared to a baseline (e.g., last save, last commit).
	 */

	interface DiffLine {
		/** Line number (0-based) */
		line: number;
		/** Type of change */
		type: 'added' | 'modified' | 'removed';
		/** Original content (for modified/removed) */
		originalContent?: string;
	}

	interface Props {
		/** Changed lines to display */
		changes: DiffLine[];
		/** Line height in pixels */
		lineHeight: number;
		/** Whether enabled */
		enabled?: boolean;
		/** Show in gutter only (vs full line highlight) */
		gutterOnly?: boolean;
		/** Gutter indicator width */
		indicatorWidth?: number;
		/** Callback when change indicator is clicked */
		onChangeClick?: (change: DiffLine) => void;
	}

	let {
		changes = [],
		lineHeight,
		enabled = true,
		gutterOnly = true,
		indicatorWidth = 3,
		onChangeClick
	}: Props = $props();

	let hoveredChange = $state<DiffLine | null>(null);
	let tooltipPosition = $state({ top: 0, left: 0 });

	/**
	 * Get color for change type
	 */
	function getColor(type: DiffLine['type']): string {
		switch (type) {
			case 'added':
				return '#22c55e'; // green
			case 'modified':
				return '#3b82f6'; // blue
			case 'removed':
				return '#ef4444'; // red
			default:
				return '#6b7280';
		}
	}

	/**
	 * Get label for change type
	 */
	function getLabel(type: DiffLine['type']): string {
		switch (type) {
			case 'added':
				return 'Added';
			case 'modified':
				return 'Modified';
			case 'removed':
				return 'Removed';
			default:
				return 'Changed';
		}
	}

	/**
	 * Group consecutive changes of the same type
	 */
	function getGroupedChanges(): Array<{ startLine: number; endLine: number; type: DiffLine['type']; changes: DiffLine[] }> {
		if (changes.length === 0) return [];

		const groups: Array<{ startLine: number; endLine: number; type: DiffLine['type']; changes: DiffLine[] }> = [];
		let currentGroup: typeof groups[0] | null = null;

		// Sort by line number
		const sortedChanges = [...changes].sort((a, b) => a.line - b.line);

		for (const change of sortedChanges) {
			if (
				currentGroup &&
				currentGroup.type === change.type &&
				currentGroup.endLine === change.line - 1
			) {
				// Extend current group
				currentGroup.endLine = change.line;
				currentGroup.changes.push(change);
			} else {
				// Start new group
				if (currentGroup) {
					groups.push(currentGroup);
				}
				currentGroup = {
					startLine: change.line,
					endLine: change.line,
					type: change.type,
					changes: [change]
				};
			}
		}

		if (currentGroup) {
			groups.push(currentGroup);
		}

		return groups;
	}

	const groupedChanges = $derived(getGroupedChanges());

	/**
	 * Handle mouse enter on change indicator
	 */
	function handleMouseEnter(change: DiffLine, event: MouseEvent) {
		hoveredChange = change;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		tooltipPosition = {
			top: rect.top + window.scrollY,
			left: rect.right + 8
		};
	}

	/**
	 * Handle mouse leave
	 */
	function handleMouseLeave() {
		hoveredChange = null;
	}

	/**
	 * Handle click on change
	 */
	function handleClick(change: DiffLine) {
		onChangeClick?.(change);
	}
</script>

{#if enabled && changes.length > 0}
	<div class="inline-diff-layer" aria-hidden="true">
		{#each groupedChanges as group (group.startLine)}
			{@const color = getColor(group.type)}
			{@const height = (group.endLine - group.startLine + 1) * lineHeight}

			<!-- Gutter indicator -->
			<div
				class="diff-indicator diff-indicator--{group.type}"
				style="
					top: {group.startLine * lineHeight}px;
					height: {height}px;
					width: {indicatorWidth}px;
					--diff-color: {color};
				"
				onmouseenter={(e) => handleMouseEnter(group.changes[0], e)}
				onmouseleave={handleMouseLeave}
				onclick={() => handleClick(group.changes[0])}
				onkeydown={(e) => e.key === 'Enter' && handleClick(group.changes[0])}
				role="button"
				tabindex={-1}
				title="{getLabel(group.type)}: {group.changes.length} line{group.changes.length !== 1 ? 's' : ''}"
			></div>

			<!-- Optional full-line highlight -->
			{#if !gutterOnly}
				<div
					class="diff-highlight diff-highlight--{group.type}"
					style="
						top: {group.startLine * lineHeight}px;
						height: {height}px;
						left: {indicatorWidth}px;
						--diff-color: {color};
					"
				></div>
			{/if}
		{/each}

		<!-- Removed line markers (triangles in gutter) -->
		{#each changes.filter(c => c.type === 'removed') as removed (removed.line)}
			<div
				class="diff-removed-marker"
				style="top: {removed.line * lineHeight + lineHeight / 2 - 4}px;"
				title="Line removed"
			></div>
		{/each}
	</div>

	<!-- Tooltip -->
	{#if hoveredChange}
		<div
			class="diff-tooltip"
			style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px;"
		>
			<div class="tooltip-header" style="color: {getColor(hoveredChange.type)};">
				{getLabel(hoveredChange.type)} line {hoveredChange.line + 1}
			</div>

			{#if hoveredChange.originalContent}
				<div class="tooltip-original">
					<span class="tooltip-label">Original:</span>
					<pre class="tooltip-content">{hoveredChange.originalContent}</pre>
				</div>
			{/if}

			<div class="tooltip-hint">Click to see full diff</div>
		</div>
	{/if}
{/if}

<style>
	.inline-diff-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 1;
	}

	.diff-indicator {
		position: absolute;
		left: 0;
		background: var(--diff-color);
		pointer-events: auto;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	.diff-indicator:hover {
		opacity: 0.8;
	}

	.diff-indicator--added {
		border-radius: 0 2px 2px 0;
	}

	.diff-indicator--modified {
		border-radius: 0 2px 2px 0;
	}

	.diff-indicator--removed {
		width: 0 !important;
		border-left: 3px solid var(--diff-color);
	}

	.diff-highlight {
		position: absolute;
		right: 0;
		background: var(--diff-color);
		opacity: 0.08;
		pointer-events: none;
	}

	.diff-highlight--added {
		opacity: 0.1;
	}

	.diff-highlight--modified {
		opacity: 0.06;
	}

	/* Removed line marker (small triangle) */
	.diff-removed-marker {
		position: absolute;
		left: 0;
		width: 0;
		height: 0;
		border-left: 8px solid #ef4444;
		border-top: 4px solid transparent;
		border-bottom: 4px solid transparent;
		pointer-events: auto;
		cursor: pointer;
	}

	.diff-removed-marker:hover {
		border-left-color: #f87171;
	}

	/* Tooltip */
	.diff-tooltip {
		position: fixed;
		z-index: 1000;
		min-width: 200px;
		max-width: 400px;
		padding: 10px;
		background: var(--color-surface, #1e1e2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		font-size: 12px;
		pointer-events: none;
	}

	.tooltip-header {
		font-weight: 600;
		margin-bottom: 8px;
	}

	.tooltip-original {
		padding: 6px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		margin-bottom: 8px;
	}

	.tooltip-label {
		display: block;
		font-size: 10px;
		color: var(--color-text-muted, #888);
		margin-bottom: 4px;
	}

	.tooltip-content {
		margin: 0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--color-text-secondary, #aaa);
		white-space: pre-wrap;
		word-break: break-all;
	}

	.tooltip-hint {
		font-size: 10px;
		color: var(--color-text-muted, #888);
		border-top: 1px solid var(--color-border, #333);
		padding-top: 8px;
	}
</style>
