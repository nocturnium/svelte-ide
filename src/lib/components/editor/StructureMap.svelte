<script lang="ts">
	/**
	 * Structure Map
	 *
	 * A semantic replacement for the traditional minimap.
	 * Shows labeled function/class blocks with color-coded indicators:
	 * - Error density
	 * - Test coverage
	 * - AI pending changes
	 * - Collaborator positions
	 */

	import type { Line } from './core/state';
	import type { SemanticRegion, SemanticCategory } from './core/semantic-analyzer';
	import { getSemanticAnalyzer } from './core/semantic-analyzer';
	import type { ComplexityMetrics } from './core/complexity-analyzer';

	interface StructureNode {
		/** Stable unique id (keyed-each safe — multiple regions can share a start line) */
		id: string;
		/** Node type */
		type: SemanticCategory;
		/** Node name */
		name: string;
		/** Start line (0-based) */
		startLine: number;
		/** End line (0-based) */
		endLine: number;
		/** Child nodes */
		children: StructureNode[];
		/** Metrics */
		metrics: {
			errorCount: number;
			warningCount: number;
			complexity?: number;
		};
		/** Activity indicators */
		activity: {
			collaborators: string[];
			aiPending: boolean;
			recentlyChanged: boolean;
		};
	}

	interface Props {
		/** Editor lines */
		lines: readonly Line[];
		/** Current scroll position (line number) */
		scrollLine: number;
		/** Visible line count */
		visibleLines: number;
		/** Total line count */
		totalLines: number;
		/** Current cursor line */
		cursorLine: number;
		/** Complexity metrics */
		complexityMetrics?: ComplexityMetrics | null;
		/** Language */
		language?: string;
		/** Width of the structure map */
		width?: number;
		/** Whether enabled */
		enabled?: boolean;
		/** Callback when a node is clicked */
		onNodeClick?: (line: number) => void;
	}

	let {
		lines,
		scrollLine,
		visibleLines,
		totalLines,
		cursorLine,
		complexityMetrics = null,
		language = 'typescript',
		width = 120,
		enabled = true,
		onNodeClick
	}: Props = $props();

	const analyzer = getSemanticAnalyzer();

	// Build structure from semantic regions
	let structure = $derived.by(() => {
		if (!enabled || lines.length === 0) return [];

		const regions = analyzer.analyze(lines, language);
		const nodes: StructureNode[] = [];

		// Filter to main structural elements
		const structuralCategories: SemanticCategory[] = [
			'function',
			'class',
			'exports',
			'types',
			'tests',
			'imports'
		];

		for (let ri = 0; ri < regions.length; ri++) {
			const region = regions[ri];
			if (!structuralCategories.includes(region.category)) continue;

			// Get complexity for this region
			let complexity = 0;
			if (complexityMetrics) {
				const regionMetric = complexityMetrics.regions.find(
					(r) => r.startLine <= region.startLine && r.endLine >= region.endLine
				);
				complexity = regionMetric?.score ?? 0;
			}

			nodes.push({
				// region index guarantees uniqueness even when two regions share a start line
				id: `${region.category}:${region.startLine}-${region.endLine}:${ri}`,
				type: region.category,
				name: region.label || region.category,
				startLine: region.startLine,
				endLine: region.endLine,
				children: [],
				metrics: {
					errorCount: 0,
					warningCount: 0,
					complexity
				},
				activity: {
					collaborators: [],
					aiPending: false,
					recentlyChanged: false
				}
			});
		}

		// Sort by line number
		nodes.sort((a, b) => a.startLine - b.startLine);

		return nodes;
	});

	// Calculate viewport indicator position
	let viewportTop = $derived((scrollLine / Math.max(1, totalLines)) * 100);
	let viewportHeight = $derived((visibleLines / Math.max(1, totalLines)) * 100);

	/**
	 * Get node height as percentage
	 */
	function getNodeHeight(node: StructureNode): number {
		return ((node.endLine - node.startLine + 1) / Math.max(1, totalLines)) * 100;
	}

	/**
	 * Get node top position as percentage
	 */
	function getNodeTop(node: StructureNode): number {
		return (node.startLine / Math.max(1, totalLines)) * 100;
	}

	/**
	 * Get color for node type
	 */
	function getNodeColor(type: SemanticCategory): string {
		switch (type) {
			case 'function':
				return '#3b82f6';
			case 'class':
				return '#8b5cf6';
			case 'exports':
				return '#22c55e';
			case 'types':
				return '#f59e0b';
			case 'tests':
				return '#06b6d4';
			case 'imports':
				return '#6b7280';
			default:
				return '#64748b';
		}
	}

	/**
	 * Get complexity color
	 */
	function getComplexityColor(score: number): string {
		if (score >= 70) return '#ef4444';
		if (score >= 50) return '#f59e0b';
		if (score >= 30) return '#3b82f6';
		return 'transparent';
	}

	/**
	 * Get icon for node type
	 */
	function getNodeIcon(type: SemanticCategory): string {
		switch (type) {
			case 'function':
				return '\u{0192}';
			case 'class':
				return '\u{1D49E}';
			case 'exports':
				return '\u{21D2}';
			case 'types':
				return '\u{1D54B}';
			case 'tests':
				return '\u{1F9EA}';
			case 'imports':
				return '\u{21E9}';
			default:
				return '\u{25AA}';
		}
	}

	/**
	 * Handle node click
	 */
	function handleNodeClick(node: StructureNode) {
		onNodeClick?.(node.startLine);
	}

	/**
	 * Check if cursor is in node
	 */
	function isCursorInNode(node: StructureNode): boolean {
		return cursorLine >= node.startLine && cursorLine <= node.endLine;
	}
</script>

{#if enabled}
	<div class="structure-map" style="width: {width}px;">
		<div class="structure-map__header">
			<span class="structure-map__title">Structure</span>
			<span class="structure-map__count">{structure.length}</span>
		</div>

		<div class="structure-map__content">
			<!-- Viewport indicator -->
			<div
				class="structure-map__viewport"
				style="top: {viewportTop}%; height: {Math.max(2, viewportHeight)}%;"
			></div>

			<!-- Structure nodes -->
			{#each structure as node (node.id)}
				<button
					class="structure-map__node"
					class:structure-map__node--active={isCursorInNode(node)}
					class:structure-map__node--complex={node.metrics.complexity && node.metrics.complexity >= 50}
					style="
						top: {getNodeTop(node)}%;
						height: {Math.max(1, getNodeHeight(node))}%;
						--node-color: {getNodeColor(node.type)};
						--complexity-color: {getComplexityColor(node.metrics.complexity ?? 0)};
					"
					onclick={() => handleNodeClick(node)}
					title="{node.name} (lines {node.startLine + 1}-{node.endLine + 1})"
				>
					<span class="structure-map__node-icon">{getNodeIcon(node.type)}</span>
					<span class="structure-map__node-name">{node.name}</span>
					{#if node.metrics.complexity && node.metrics.complexity >= 50}
						<span class="structure-map__node-complexity">{node.metrics.complexity}</span>
					{/if}
				</button>
			{/each}

			<!-- Cursor indicator -->
			<div
				class="structure-map__cursor"
				style="top: {(cursorLine / Math.max(1, totalLines)) * 100}%;"
			></div>
		</div>

		<!-- Legend -->
		<div class="structure-map__legend">
			<div class="structure-map__legend-item">
				<span class="structure-map__legend-color" style="background: #3b82f6"></span>
				<span>fn</span>
			</div>
			<div class="structure-map__legend-item">
				<span class="structure-map__legend-color" style="background: #8b5cf6"></span>
				<span>class</span>
			</div>
			<div class="structure-map__legend-item">
				<span class="structure-map__legend-color" style="background: #22c55e"></span>
				<span>export</span>
			</div>
			<div class="structure-map__legend-item">
				<span class="structure-map__legend-color" style="background: #f59e0b"></span>
				<span>type</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.structure-map {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-surface, #1a1a2e);
		border-left: 1px solid var(--color-border, #333);
		font-size: 11px;
		user-select: none;
	}

	.structure-map__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 10px;
		border-bottom: 1px solid var(--color-border, #333);
	}

	.structure-map__title {
		font-weight: 600;
		color: var(--color-text, #e8e8f0);
		text-transform: uppercase;
		font-size: 10px;
		letter-spacing: 0.05em;
	}

	.structure-map__count {
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		font-size: 10px;
		color: var(--color-text-muted, #888);
	}

	.structure-map__content {
		flex: 1;
		position: relative;
		overflow: hidden;
		padding: 4px;
	}

	.structure-map__viewport {
		position: absolute;
		left: 0;
		right: 0;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		pointer-events: none;
		z-index: 1;
	}

	.structure-map__node {
		position: absolute;
		left: 4px;
		right: 4px;
		display: flex;
		align-items: flex-start;
		gap: 4px;
		padding: 2px 6px;
		background: rgba(var(--node-color-rgb, 59, 130, 246), 0.15);
		border: none;
		border-left: 3px solid var(--node-color);
		border-radius: 0 3px 3px 0;
		cursor: pointer;
		text-align: left;
		color: var(--color-text, #e8e8f0);
		font-size: 10px;
		overflow: hidden;
		transition: background 0.15s ease;
		z-index: 2;
	}

	.structure-map__node:hover {
		background: rgba(var(--node-color-rgb, 59, 130, 246), 0.25);
	}

	.structure-map__node--active {
		background: rgba(var(--node-color-rgb, 59, 130, 246), 0.3);
		box-shadow: inset 0 0 0 1px var(--node-color);
	}

	.structure-map__node--complex {
		border-right: 2px solid var(--complexity-color);
	}

	.structure-map__node-icon {
		flex-shrink: 0;
		width: 12px;
		text-align: center;
		opacity: 0.7;
	}

	.structure-map__node-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.structure-map__node-complexity {
		flex-shrink: 0;
		padding: 0 4px;
		background: var(--complexity-color);
		border-radius: 8px;
		font-size: 9px;
		font-weight: 600;
		color: #fff;
	}

	.structure-map__cursor {
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--color-cursor, #4a9eff);
		pointer-events: none;
		z-index: 10;
		box-shadow: 0 0 4px var(--color-cursor, #4a9eff);
	}

	.structure-map__legend {
		display: flex;
		gap: 8px;
		padding: 6px 10px;
		border-top: 1px solid var(--color-border, #333);
		flex-wrap: wrap;
	}

	.structure-map__legend-item {
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--color-text-muted, #888);
		font-size: 9px;
	}

	.structure-map__legend-color {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
</style>
