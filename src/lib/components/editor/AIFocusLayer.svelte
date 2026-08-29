<script lang="ts">
	/**
	 * AI Focus Layer
	 *
	 * Renders AI agent focus visualization in the editor:
	 * - Ghost cursors showing where AI is "looking"
	 * - Focus region highlights with glow effects
	 * - Activity indicators and labels
	 *
	 * Creates the "Ghost Pair" programming experience.
	 */

	import type { AIAwareness, AIFocusRegion, AICursor } from './core/ai-awareness';

	interface Props {
		/** AI agents to visualize */
		agents: AIAwareness[];
		/** Line height in pixels */
		lineHeight: number;
		/** Character width in pixels */
		charWidth: number;
		/** Gutter width in pixels */
		gutterWidth: number;
		/** Content padding in pixels */
		contentPadding?: number;
		/** Whether to show cursor labels */
		showLabels?: boolean;
		/** Whether to show focus regions */
		showFocusRegions?: boolean;
		/** Whether the layer is enabled */
		enabled?: boolean;
		/**
		 * Full height of the scrollable content in pixels.
		 *
		 * The layer must span the whole document. It used to be stretched with
		 * `bottom: 0`, which resolves against the containing block — the editor's
		 * padding box, i.e. ONE VIEWPORT — so with `overflow: hidden` a ghost cursor
		 * or focus region below the first screenful was clipped away entirely. The
		 * feature looked broken exactly when the agent moved somewhere interesting.
		 *
		 * The identical bug and fix are documented on the sibling overlay in
		 * `ComplexityLayer.svelte` ('Height is set inline to the full content
		 * height so indicators below the first viewport are not clipped').
		 */
		totalHeight?: number;
		/** Estimated full scrollable content width in pixels. */
		contentWidth?: number;
		/**
		 * Maps a raw document line to its rendered visual row.
		 *
		 * Required alongside `totalHeight`, not optional polish. `totalHeight` is
		 * measured in VISUAL ROWS (folded ranges collapse to one), while an agent
		 * reports a raw document line. Sizing the layer by one and positioning
		 * within it by the other puts the ghost cursor on the wrong row for every
		 * line after a collapsed fold.
		 */
		lineToVisualRow?: (line: number) => number;
	}

	let {
		agents,
		lineHeight,
		charWidth,
		gutterWidth,
		contentPadding = 8,
		showLabels = true,
		showFocusRegions = true,
		enabled = true,
		totalHeight = 0,
		contentWidth = 0,
		lineToVisualRow = (line: number) => line
	}: Props = $props();

	/** Top edge of a raw document line, in the layer's coordinates. */
	const rowTop = (line: number) => lineToVisualRow(Math.max(0, line)) * lineHeight;

	// Filter to active agents with cursors
	let visibleAgents = $derived(
		enabled
			? agents.filter((a) => a.isActive && (a.cursor?.visible || a.focusRegions.length > 0))
			: []
	);

	/**
	 * Get cursor position style
	 */
	function getCursorStyle(cursor: AICursor, color: string): string {
		const left = gutterWidth + contentPadding + cursor.position.column * charWidth;
		const top = rowTop(cursor.position.line);

		return `
			left: ${left}px;
			top: ${top}px;
			height: ${lineHeight}px;
			--ai-color: ${color};
		`;
	}

	/**
	 * Get focus region style
	 */
	function getRegionStyle(region: AIFocusRegion, color: string): string {
		// Measured in visual rows at both ends, so a fold inside the region shrinks
		// the glow with the code rather than leaving it spanning empty space.
		const startRow = lineToVisualRow(Math.max(0, region.startLine));
		const endRow = Math.max(startRow, lineToVisualRow(Math.max(0, region.endLine)));
		const top = startRow * lineHeight;
		const height = (endRow - startRow + 1) * lineHeight;

		// Calculate left/width if column info provided
		let left = gutterWidth + contentPadding;
		let width = 'calc(100% - var(--region-left))';

		if (region.startColumn !== undefined && region.endColumn !== undefined) {
			left += region.startColumn * charWidth;
			width = `${(region.endColumn - region.startColumn) * charWidth}px`;
		}

		return `
			top: ${top}px;
			left: ${left}px;
			height: ${height}px;
			width: ${width};
			--ai-color: ${color};
			--ai-intensity: ${region.intensity};
			--region-left: ${left}px;
		`;
	}

	/**
	 * Get label position style
	 */
	function getLabelStyle(cursor: AICursor): string {
		const left = gutterWidth + contentPadding + cursor.position.column * charWidth + 4;
		// Sits one label-height ABOVE the caret, so on the first row it lands at a
		// negative offset. That is why the layer must not clip its own overflow.
		const top = rowTop(cursor.position.line) - 20;

		return `left: ${left}px; top: ${top}px;`;
	}

	/**
	 * Get attention type icon/indicator
	 */
	function getAttentionIndicator(type: AIAwareness['attentionType']): string {
		switch (type) {
			case 'reading':
				return '\u{1F440}'; // Eyes
			case 'thinking':
				return '\u{1F4AD}'; // Thought bubble
			case 'writing':
				return '\u{270D}\u{FE0F}'; // Writing hand
			case 'reviewing':
				return '\u{1F50D}'; // Magnifying glass
			case 'waiting':
				return '\u{23F3}'; // Hourglass
			default:
				return '🤖'; // Robot
		}
	}

	/**
	 * Get cursor animation class
	 */
	function getCursorAnimationClass(animation: AICursor['animation']): string {
		switch (animation) {
			case 'moving':
				return 'ai-focus-layer__cursor--moving';
			case 'typing':
				return 'ai-focus-layer__cursor--typing';
			case 'thinking':
				return 'ai-focus-layer__cursor--thinking';
			default:
				return 'ai-focus-layer__cursor--idle';
		}
	}
</script>

{#if enabled && visibleAgents.length > 0}
	<div
		class="ai-focus-layer"
		aria-hidden="true"
		style="
			height: {totalHeight ? `${totalHeight}px` : '100%'};
			width: {contentWidth ? `${contentWidth}px` : '100%'};
		"
	>
		{#each visibleAgents as agent (agent.agentId)}
			<!-- Focus regions (background glow) -->
			{#if showFocusRegions && agent.focusRegions.length > 0}
				{#each agent.focusRegions as region, idx (`${agent.agentId}-region-${idx}`)}
					<div
						class="ai-focus-layer__region"
						class:ai-focus-layer__region--reading={region.type === 'reading'}
						class:ai-focus-layer__region--thinking={region.type === 'thinking'}
						class:ai-focus-layer__region--writing={region.type === 'writing'}
						class:ai-focus-layer__region--reviewing={region.type === 'reviewing'}
						style={getRegionStyle(region, agent.color)}
					>
						{#if region.label}
							<span class="ai-focus-layer__region-label">{region.label}</span>
						{/if}
					</div>
				{/each}
			{/if}

			<!-- AI Cursor (ghost cursor with glow) -->
			{#if agent.cursor?.visible}
				<div
					class="ai-focus-layer__cursor {getCursorAnimationClass(agent.cursor.animation)}"
					style={getCursorStyle(agent.cursor, agent.color)}
				>
					<!-- Cursor glow effect -->
					<div class="ai-focus-layer__cursor-glow"></div>
					<!-- Cursor line -->
					<div class="ai-focus-layer__cursor-line"></div>
				</div>

				<!-- Agent label -->
				{#if showLabels}
					<div class="ai-focus-layer__label" style={getLabelStyle(agent.cursor)}>
						<span class="ai-focus-layer__label-indicator">
							{getAttentionIndicator(agent.attentionType)}
						</span>
						<span class="ai-focus-layer__label-name" style="color: {agent.color}">
							{agent.agentName}
						</span>
						{#if agent.activity}
							<span class="ai-focus-layer__label-activity">{agent.activity}</span>
						{/if}
					</div>
				{/if}
			{/if}
		{/each}
	</div>
{/if}

<style>
	.ai-focus-layer {
		position: absolute;
		top: 0;
		left: 0;
		/* Size comes from the inline height/width above, which carry the full
		   scrollable content extent. `min-*` keeps the layer covering the viewport
		   when a caller has not measured it yet; `right`/`bottom: 0` used to size
		   the layer to one viewport and hide the agent below the fold. */
		min-width: 100%;
		min-height: 100%;
		pointer-events: none;
		z-index: 5;
		/* Still hidden, and deliberately. Once the layer spans the whole document
		   there is nothing real left for it to clip: the only child that lands
		   outside is the agent label on row 0, drawn a label-height above its
		   cursor, and that sits above the editor's own scrollport, which no setting
		   here can reveal. Keeping it hidden is a guarantee that no overlay can ever
		   widen the editor's scrollable area. */
		overflow: hidden;
	}

	/* Focus Region Styles */
	.ai-focus-layer__region {
		position: absolute;
		border-radius: 4px;
		pointer-events: none;
		transition:
			opacity 0.3s ease,
			background 0.3s ease;
	}

	/* Reading - subtle blue glow */
	.ai-focus-layer__region--reading {
		background: linear-gradient(
			90deg,
			rgba(var(--ai-color-rgb, 59, 130, 246), calc(var(--ai-intensity) * 0.15)) 0%,
			rgba(var(--ai-color-rgb, 59, 130, 246), calc(var(--ai-intensity) * 0.05)) 50%,
			transparent 100%
		);
		box-shadow: inset 0 0 20px
			rgba(var(--ai-color-rgb, 59, 130, 246), calc(var(--ai-intensity) * 0.1));
	}

	/* Thinking - pulsing purple glow */
	.ai-focus-layer__region--thinking {
		background: linear-gradient(
			90deg,
			rgba(var(--ai-color-rgb, 139, 92, 246), calc(var(--ai-intensity) * 0.2)) 0%,
			rgba(var(--ai-color-rgb, 139, 92, 246), calc(var(--ai-intensity) * 0.08)) 50%,
			transparent 100%
		);
		animation: region-think-pulse 2s ease-in-out infinite;
	}

	/* Writing - bright green glow */
	.ai-focus-layer__region--writing {
		background: linear-gradient(
			90deg,
			rgba(34, 197, 94, calc(var(--ai-intensity) * 0.25)) 0%,
			rgba(34, 197, 94, calc(var(--ai-intensity) * 0.1)) 50%,
			transparent 100%
		);
		box-shadow: inset 0 0 30px rgba(34, 197, 94, calc(var(--ai-intensity) * 0.15));
	}

	/* Reviewing - amber scan effect */
	.ai-focus-layer__region--reviewing {
		background: linear-gradient(
			90deg,
			rgba(245, 158, 11, calc(var(--ai-intensity) * 0.15)) 0%,
			rgba(245, 158, 11, calc(var(--ai-intensity) * 0.05)) 50%,
			transparent 100%
		);
		animation: region-scan 3s linear infinite;
	}

	@keyframes region-think-pulse {
		0%,
		100% {
			opacity: 0.7;
		}
		50% {
			opacity: 1;
		}
	}

	@keyframes region-scan {
		0% {
			background-position: -100% 0;
		}
		100% {
			background-position: 200% 0;
		}
	}

	.ai-focus-layer__region-label {
		position: absolute;
		right: 8px;
		top: 2px;
		font-size: 10px;
		color: var(--ide-text-muted, #a8c5d9);
		opacity: 0.7;
	}

	/* AI Cursor Styles */
	.ai-focus-layer__cursor {
		position: absolute;
		width: 2px;
		pointer-events: none;
		z-index: 10;
	}

	.ai-focus-layer__cursor-line {
		position: absolute;
		top: 0;
		left: 0;
		width: 2px;
		height: 100%;
		background: var(--ai-color);
		border-radius: 1px;
	}

	.ai-focus-layer__cursor-glow {
		position: absolute;
		top: -4px;
		left: -8px;
		width: 18px;
		height: calc(100% + 8px);
		background: radial-gradient(
			ellipse at center,
			rgba(var(--ai-color-rgb, 139, 92, 246), 0.4) 0%,
			rgba(var(--ai-color-rgb, 139, 92, 246), 0.1) 50%,
			transparent 70%
		);
		filter: blur(4px);
		border-radius: 50%;
	}

	/* Cursor Animations */
	.ai-focus-layer__cursor--idle {
		animation: cursor-idle-pulse 2s ease-in-out infinite;
	}

	.ai-focus-layer__cursor--moving {
		animation: cursor-move-trail 0.3s ease-out;
	}

	.ai-focus-layer__cursor--typing {
		animation: cursor-type-flash 0.15s ease-in-out infinite;
	}

	.ai-focus-layer__cursor--thinking {
		animation: cursor-think-glow 1.5s ease-in-out infinite;
	}

	@keyframes cursor-idle-pulse {
		0%,
		100% {
			opacity: 0.8;
		}
		50% {
			opacity: 0.5;
		}
	}

	@keyframes cursor-move-trail {
		0% {
			opacity: 0.3;
			transform: scaleY(0.8);
		}
		100% {
			opacity: 1;
			transform: scaleY(1);
		}
	}

	@keyframes cursor-type-flash {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}

	@keyframes cursor-think-glow {
		0%,
		100% {
			filter: brightness(1);
		}
		50% {
			filter: brightness(1.5);
		}
	}

	.ai-focus-layer__cursor--thinking .ai-focus-layer__cursor-glow {
		animation: glow-expand 1.5s ease-in-out infinite;
	}

	@keyframes glow-expand {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.4;
		}
		50% {
			transform: scale(1.5);
			opacity: 0.6;
		}
	}

	/* Agent Label */
	.ai-focus-layer__label {
		position: absolute;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		background: rgba(30, 30, 30, 0.95);
		border: 1px solid var(--ide-border, #a8c5d9);
		border-radius: 4px;
		font-size: 11px;
		white-space: nowrap;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		z-index: 15;
		pointer-events: none;
	}

	.ai-focus-layer__label-indicator {
		font-size: 12px;
		line-height: 1;
	}

	.ai-focus-layer__label-name {
		font-weight: 600;
	}

	.ai-focus-layer__label-activity {
		color: var(--ide-text-muted, #a8c5d9);
		font-size: 10px;
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Selection highlight for AI cursor selection */
	.ai-focus-layer__selection {
		position: absolute;
		background: rgba(var(--ai-color-rgb, 139, 92, 246), 0.2);
		border: 1px solid rgba(var(--ai-color-rgb, 139, 92, 246), 0.4);
		border-radius: 2px;
		pointer-events: none;
	}
</style>
