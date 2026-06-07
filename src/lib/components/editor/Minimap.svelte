<script lang="ts">
	/**
	 * Minimap Component
	 *
	 * A scaled-down overview of the entire document showing:
	 * - Code structure visualization
	 * - Current viewport indicator
	 * - Highlighted regions (search, errors, changes)
	 * - Click-to-navigate functionality
	 */

	import { onMount } from 'svelte';

	interface MinimapHighlight {
		/** Line number (0-based) */
		line: number;
		/** Highlight type */
		type: 'search' | 'error' | 'warning' | 'change' | 'selection' | 'cursor';
		/** Optional column range */
		startColumn?: number;
		endColumn?: number;
	}

	interface Props {
		/** Lines of code to display */
		lines: string[];
		/** Current scroll position (line number) */
		scrollTop: number;
		/** Number of visible lines in viewport */
		visibleLines: number;
		/** Total editor height */
		editorHeight: number;
		/** Highlights to show on minimap */
		highlights?: MinimapHighlight[];
		/** Whether minimap is enabled */
		enabled?: boolean;
		/** Minimap width */
		width?: number;
		/** Scale factor for text */
		scale?: number;
		/** Callback when user clicks to navigate */
		onNavigate?: (line: number) => void;
		/** Show slider/viewport indicator */
		showSlider?: boolean;
	}

	let {
		lines,
		scrollTop,
		visibleLines,
		editorHeight,
		highlights = [],
		enabled = true,
		width = 100,
		scale = 1,
		onNavigate,
		showSlider = true
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement>(null!);
	let container = $state<HTMLDivElement>(null!);
	let isDragging = $state(false);
	let isHovering = $state(false);
	let hoverLine = $state<number | null>(null);

	// Computed constants (derived from props)
	const PADDING = 4;
	const LINE_HEIGHT = $derived(2 * scale);
	const CHAR_WIDTH = $derived(1.2 * scale);
	const MAX_CHARS = $derived(Math.floor((width - 20) / CHAR_WIDTH));

	// Computed values
	const totalHeight = $derived(lines.length * LINE_HEIGHT);
	const scaleFactor = $derived(editorHeight / totalHeight);
	const needsScaling = $derived(totalHeight > editorHeight);

	// Color palette for syntax-like rendering
	const colors = {
		keyword: '#c586c0',
		string: '#ce9178',
		comment: '#6a9955',
		number: '#b5cea8',
		function: '#dcdcaa',
		default: '#9cdcfe',
		background: '#1e1e2e',
		viewport: 'rgba(255, 255, 255, 0.1)',
		viewportBorder: 'rgba(255, 255, 255, 0.3)'
	};

	// Highlight colors
	const highlightColors: Record<MinimapHighlight['type'], string> = {
		search: '#f9e64f',
		error: '#f44747',
		warning: '#ff8c00',
		change: '#3b82f6',
		selection: 'rgba(38, 79, 120, 0.8)',
		cursor: '#aeafad'
	};

	/**
	 * Render the minimap to canvas
	 */
	function render() {
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const devicePixelRatio = window.devicePixelRatio || 1;
		canvas.width = width * devicePixelRatio;
		canvas.height = editorHeight * devicePixelRatio;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${editorHeight}px`;
		ctx.scale(devicePixelRatio, devicePixelRatio);

		// Clear
		ctx.fillStyle = colors.background;
		ctx.fillRect(0, 0, width, editorHeight);

		// Calculate effective line height based on scaling
		const effectiveLineHeight = needsScaling ? (editorHeight / lines.length) : LINE_HEIGHT;
		const effectiveCharWidth = CHAR_WIDTH * (needsScaling ? scaleFactor : 1);

		// Draw highlights first (behind text)
		for (const highlight of highlights) {
			const y = highlight.line * effectiveLineHeight;
			ctx.fillStyle = highlightColors[highlight.type];

			if (highlight.startColumn !== undefined && highlight.endColumn !== undefined) {
				const x = PADDING + highlight.startColumn * effectiveCharWidth;
				const highlightWidth = (highlight.endColumn - highlight.startColumn) * effectiveCharWidth;
				ctx.fillRect(x, y, Math.max(highlightWidth, 3), effectiveLineHeight);
			} else {
				// Full line highlight
				ctx.fillRect(0, y, width, effectiveLineHeight);
			}
		}

		// Draw code lines
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const y = i * effectiveLineHeight;

			// Skip if outside visible area
			if (y > editorHeight) break;

			// Simple syntax-like coloring based on content
			const trimmed = line.trim();
			let color = colors.default;

			if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
				color = colors.comment;
			} else if (trimmed.startsWith('import') || trimmed.startsWith('export') ||
					   trimmed.startsWith('const') || trimmed.startsWith('let') ||
					   trimmed.startsWith('function') || trimmed.startsWith('class') ||
					   trimmed.startsWith('if') || trimmed.startsWith('for') ||
					   trimmed.startsWith('return') || trimmed.startsWith('async')) {
				color = colors.keyword;
			} else if (trimmed.includes('"') || trimmed.includes("'") || trimmed.includes('`')) {
				color = colors.string;
			}

			ctx.fillStyle = color;

			// Draw simplified line representation
			const indent = line.length - line.trimStart().length;
			const content = line.trim().slice(0, MAX_CHARS);

			// Draw as small rectangles representing characters
			let x = PADDING + indent * effectiveCharWidth;
			for (let j = 0; j < content.length && x < width - PADDING; j++) {
				const char = content[j];
				if (char !== ' ') {
					const charWidth = effectiveCharWidth * 0.8;
					ctx.fillRect(x, y + effectiveLineHeight * 0.2, charWidth, effectiveLineHeight * 0.6);
				}
				x += effectiveCharWidth;
			}
		}

		// Draw viewport slider
		if (showSlider) {
			// Use effectiveLineHeight for consistent positioning with click handling
			const sliderY = scrollTop * effectiveLineHeight;
			const sliderHeight = visibleLines * effectiveLineHeight;

			// Viewport background
			ctx.fillStyle = colors.viewport;
			ctx.fillRect(0, sliderY, width, Math.max(sliderHeight, 20));

			// Viewport border
			ctx.strokeStyle = colors.viewportBorder;
			ctx.lineWidth = 1;
			ctx.strokeRect(0.5, sliderY + 0.5, width - 1, Math.max(sliderHeight, 20) - 1);
		}

		// Draw hover indicator
		if (isHovering && hoverLine !== null) {
			const hoverY = hoverLine * effectiveLineHeight;
			ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
			ctx.fillRect(0, hoverY, width, effectiveLineHeight * 3);
		}
	}

	/**
	 * Handle click to navigate
	 */
	function handleClick(e: MouseEvent) {
		const rect = container.getBoundingClientRect();
		const y = e.clientY - rect.top;
		const effectiveLineHeight = needsScaling ? (editorHeight / lines.length) : LINE_HEIGHT;
		const line = Math.floor(y / effectiveLineHeight);
		onNavigate?.(Math.max(0, Math.min(line, lines.length - 1)));
	}

	/**
	 * Handle mouse move for hover effect
	 */
	function handleMouseMove(e: MouseEvent) {
		const rect = container.getBoundingClientRect();
		const y = e.clientY - rect.top;
		const effectiveLineHeight = needsScaling ? (editorHeight / lines.length) : LINE_HEIGHT;
		hoverLine = Math.floor(y / effectiveLineHeight);

		if (isDragging) {
			handleClick(e);
		}
	}

	/**
	 * Handle drag start
	 */
	function handleMouseDown(e: MouseEvent) {
		isDragging = true;
		handleClick(e);

		const handleMouseUp = () => {
			isDragging = false;
			window.removeEventListener('mouseup', handleMouseUp);
			window.removeEventListener('mousemove', handleWindowMouseMove);
		};

		const handleWindowMouseMove = (e: MouseEvent) => {
			if (isDragging) {
				const rect = container.getBoundingClientRect();
				const y = Math.max(0, Math.min(e.clientY - rect.top, editorHeight));
				const effectiveLineHeight = needsScaling ? (editorHeight / lines.length) : LINE_HEIGHT;
				const line = Math.floor(y / effectiveLineHeight);
				onNavigate?.(Math.max(0, Math.min(line, lines.length - 1)));
			}
		};

		window.addEventListener('mouseup', handleMouseUp);
		window.addEventListener('mousemove', handleWindowMouseMove);
	}

	// Re-render when dependencies change
	$effect(() => {
		if (enabled && lines && scrollTop !== undefined && highlights) {
			render();
		}
	});

	onMount(() => {
		render();
	});
</script>

{#if enabled}
	<div
		class="minimap"
		class:minimap--dragging={isDragging}
		style="width: {width}px; height: {editorHeight}px;"
		bind:this={container}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseenter={() => (isHovering = true)}
		onmouseleave={() => {
			isHovering = false;
			hoverLine = null;
		}}
		role="slider"
		aria-label="Code minimap"
		aria-valuenow={scrollTop}
		aria-valuemin={0}
		aria-valuemax={lines.length}
		tabindex={-1}
	>
		<canvas bind:this={canvas} class="minimap__canvas"></canvas>

		<!-- Line count indicator -->
		<div class="minimap__info">
			{lines.length} lines
		</div>
	</div>
{/if}

<style>
	.minimap {
		position: relative;
		background: var(--minimap-bg, #1e1e2e);
		border-left: 1px solid var(--ide-border, #333);
		cursor: pointer;
		user-select: none;
		overflow: hidden;
	}

	.minimap--dragging {
		cursor: grabbing;
	}

	.minimap__canvas {
		display: block;
	}

	.minimap__info {
		position: absolute;
		bottom: 4px;
		right: 4px;
		font-size: 9px;
		color: var(--ide-text-muted, #666);
		background: rgba(0, 0, 0, 0.5);
		padding: 2px 4px;
		border-radius: 2px;
		pointer-events: none;
	}
</style>
