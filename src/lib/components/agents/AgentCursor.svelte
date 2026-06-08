<script lang="ts">
	/**
	 * AgentCursor - Remote cursor indicator for collaborative editing
	 *
	 * Shows:
	 * - Colored cursor line
	 * - Agent name label
	 * - Selection highlight (if any)
	 * - Typing indicator animation
	 */

	import type { Agent, CursorPosition, CursorSelection } from '$lib/types';

	interface Props {
		/** The agent this cursor belongs to */
		agent: Agent;
		/** Cursor position */
		position: CursorPosition;
		/** Selection range (optional) */
		selection?: CursorSelection;
		/** Whether agent is currently typing */
		isTyping?: boolean;
		/** Character width in pixels */
		charWidth: number;
		/** Line height in pixels */
		lineHeight: number;
		/** Scroll offset X */
		scrollX?: number;
		/** Scroll offset Y */
		scrollY?: number;
		/** Gutter width offset */
		gutterWidth?: number;
		/** Additional CSS class */
		class?: string;
	}

	let {
		agent,
		position,
		selection,
		isTyping = false,
		charWidth,
		lineHeight,
		scrollX = 0,
		scrollY = 0,
		gutterWidth = 50,
		class: className = ''
	}: Props = $props();

	// Calculate pixel positions
	let cursorX = $derived(gutterWidth + position.column * charWidth - scrollX);
	let cursorY = $derived((position.line - 1) * lineHeight - scrollY);

	// Get agent color or use default
	let cursorColor = $derived(agent.color ?? 'var(--ide-agent-ai-primary)');

	// Calculate selection dimensions if present
	let hasSelection = $derived(
		selection && (selection.start.line !== selection.end.line || selection.start.column !== selection.end.column)
	);

	function getSelectionStyle() {
		if (!selection) return '';

		const startLine = Math.min(selection.start.line, selection.end.line);
		const endLine = Math.max(selection.start.line, selection.end.line);
		const startCol = selection.start.line < selection.end.line ? selection.start.column :
			(selection.start.line === selection.end.line ? Math.min(selection.start.column, selection.end.column) : selection.end.column);
		const endCol = selection.start.line < selection.end.line ? selection.end.column :
			(selection.start.line === selection.end.line ? Math.max(selection.start.column, selection.end.column) : selection.start.column);

		// For single line selection
		if (startLine === endLine) {
			return `
				top: ${(startLine - 1) * lineHeight - scrollY}px;
				left: ${gutterWidth + startCol * charWidth - scrollX}px;
				width: ${(endCol - startCol) * charWidth}px;
				height: ${lineHeight}px;
			`;
		}

		// Multi-line selections need multiple elements (simplified for now)
		return `
			top: ${(startLine - 1) * lineHeight - scrollY}px;
			left: ${gutterWidth - scrollX}px;
			width: calc(100% - ${gutterWidth}px);
			height: ${(endLine - startLine + 1) * lineHeight}px;
		`;
	}
</script>

<div
	class="agent-cursor {className}"
	class:agent-cursor--typing={isTyping}
	style="
		--cursor-color: {cursorColor};
		--cursor-x: {cursorX}px;
		--cursor-y: {cursorY}px;
		--line-height: {lineHeight}px;
	"
	aria-hidden="true"
>
	<!-- Selection highlight -->
	{#if hasSelection}
		<div class="agent-cursor__selection" style={getSelectionStyle()}></div>
	{/if}

	<!-- Cursor line -->
	<div class="agent-cursor__line"></div>

	<!-- Label -->
	<div class="agent-cursor__label">
		{#if agent.type !== 'coordinator'}
			<span class="agent-cursor__badge">AI</span>
		{/if}
		<span class="agent-cursor__name">{agent.name}</span>
		{#if isTyping}
			<span class="agent-cursor__typing">
				<span></span>
				<span></span>
				<span></span>
			</span>
		{/if}
	</div>
</div>

<style>
	.agent-cursor {
		position: absolute;
		top: var(--cursor-y);
		left: var(--cursor-x);
		pointer-events: none;
		z-index: 50;
		animation: ide-cursor-appear 0.2s ease-out;
	}

	.agent-cursor__line {
		position: absolute;
		top: 0;
		left: 0;
		width: 2px;
		height: var(--line-height);
		background: var(--cursor-color);
		box-shadow: 0 0 8px color-mix(in srgb, var(--cursor-color) 50%, transparent);
	}

	.agent-cursor__line::before {
		content: '';
		position: absolute;
		top: -4px;
		left: -1px;
		width: 4px;
		height: 4px;
		background: var(--cursor-color);
		border-radius: 50%;
	}

	.agent-cursor__selection {
		position: absolute;
		background: color-mix(in srgb, var(--cursor-color) 20%, transparent);
		pointer-events: none;
	}

	.agent-cursor__label {
		position: absolute;
		top: -20px;
		left: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		background: var(--cursor-color);
		border-radius: var(--ide-radius-sm);
		font-size: 10px;
		font-weight: 500;
		color: white;
		white-space: nowrap;
		transform-origin: bottom left;
		animation: ide-slide-down 0.2s ease-out;
	}

	.agent-cursor__badge {
		padding: 0 3px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.5px;
	}

	.agent-cursor__name {
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.agent-cursor__typing {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-left: 4px;
	}

	.agent-cursor__typing span {
		width: 3px;
		height: 3px;
		background: rgba(255, 255, 255, 0.8);
		border-radius: 50%;
		animation: ide-typing-pulse 0.6s infinite;
	}

	.agent-cursor__typing span:nth-child(2) {
		animation-delay: 0.1s;
	}

	.agent-cursor__typing span:nth-child(3) {
		animation-delay: 0.2s;
	}

	/* Typing state animations */
	.agent-cursor--typing .agent-cursor__line {
		animation: ide-pulse 0.5s infinite;
	}
</style>
