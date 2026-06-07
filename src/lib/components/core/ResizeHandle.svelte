<script lang="ts">
	/**
	 * ResizeHandle - Draggable handle for resizing panels
	 *
	 * Supports vertical (left/right) and horizontal (top/bottom) orientations.
	 * Resizes in real-time as you drag.
	 */
	import { onDestroy } from 'svelte';

	interface Props {
		/** Orientation of the resize handle */
		direction: 'vertical' | 'horizontal';
		/** Position relative to the panel */
		position?: 'start' | 'end';
		/** Minimum size in pixels */
		min?: number;
		/** Maximum size in pixels */
		max?: number;
		/** Current size in pixels */
		size: number;
		/** Callback when size changes */
		onResize?: (size: number) => void;
		/** Callback when drag starts */
		onResizeStart?: () => void;
		/** Callback when drag ends */
		onResizeEnd?: () => void;
		/** Additional CSS class */
		class?: string;
	}

	let {
		direction,
		position = 'end',
		min = 100,
		max = 800,
		size,
		onResize,
		onResizeStart,
		onResizeEnd,
		class: className = ''
	}: Props = $props();

	let isDragging = $state(false);

	// Non-reactive tracking variables (captured in closures)
	let dragState = {
		active: false,
		startPos: 0,
		startSize: 0
	};

	function handleMouseDown(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		isDragging = true;
		dragState.active = true;
		dragState.startPos = direction === 'vertical' ? e.clientX : e.clientY;
		dragState.startSize = size;

		onResizeStart?.();

		// Use document-level listeners for reliable tracking
		document.addEventListener('mousemove', handleMouseMove, { capture: true });
		document.addEventListener('mouseup', handleMouseUp, { capture: true });
		document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
		document.body.style.userSelect = 'none';
	}

	function handleMouseMove(e: MouseEvent) {
		if (!dragState.active) return;

		e.preventDefault();

		const currentPos = direction === 'vertical' ? e.clientX : e.clientY;
		let delta = currentPos - dragState.startPos;

		// Invert delta for 'start' position (resizing from left/top edge)
		if (position === 'start') {
			delta = -delta;
		}

		// Clamp to min/max and apply immediately
		const newSize = Math.max(min, Math.min(max, dragState.startSize + delta));
		onResize?.(newSize);
	}

	function handleMouseUp(e: MouseEvent) {
		if (!dragState.active) return;

		e.preventDefault();

		dragState.active = false;
		isDragging = false;

		onResizeEnd?.();

		document.removeEventListener('mousemove', handleMouseMove, { capture: true });
		document.removeEventListener('mouseup', handleMouseUp, { capture: true });
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	function handleDoubleClick() {
		// Reset to default size on double-click
		const defaultSize = Math.round((min + max) / 2);
		onResize?.(defaultSize);
	}

	// Cleanup on destroy
	onDestroy(() => {
		if (dragState.active) {
			document.removeEventListener('mousemove', handleMouseMove, { capture: true });
			document.removeEventListener('mouseup', handleMouseUp, { capture: true });
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		}
	});
</script>

<div
	class="resize-handle resize-handle--{direction} {className}"
	class:resize-handle--dragging={isDragging}
	onmousedown={handleMouseDown}
	ondblclick={handleDoubleClick}
	role="slider"
	aria-orientation={direction}
	aria-valuenow={size}
	aria-valuemin={min}
	aria-valuemax={max}
	tabindex={0}
>
	<div class="resize-handle__indicator"></div>
</div>

<style>
	.resize-handle {
		position: relative;
		flex-shrink: 0;
		background: transparent;
		transition: background-color 0.15s ease;
		z-index: 10;
	}

	.resize-handle--vertical {
		width: 6px;
		height: 100%;
		align-self: stretch;
		cursor: col-resize;
	}

	.resize-handle--horizontal {
		width: 100%;
		height: 6px;
		justify-self: stretch;
		cursor: row-resize;
	}

	.resize-handle:hover,
	.resize-handle--dragging {
		background: var(--ide-interactive, #4a8db7);
	}

	.resize-handle__indicator {
		position: absolute;
		background: var(--ide-border, rgba(45, 90, 123, 0.4));
		transition: background-color 0.15s ease;
	}

	.resize-handle--vertical .resize-handle__indicator {
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
		transform: translateX(-50%);
	}

	.resize-handle--horizontal .resize-handle__indicator {
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		transform: translateY(-50%);
	}

	.resize-handle:hover .resize-handle__indicator,
	.resize-handle--dragging .resize-handle__indicator {
		background: var(--ide-interactive, #4a8db7);
	}

	/* Focus styles for keyboard accessibility */
	.resize-handle:focus {
		outline: none;
	}

	.resize-handle:focus-visible {
		outline: 2px solid var(--ide-interactive, #4a8db7);
		outline-offset: -2px;
	}
</style>