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
		/** Step (px) for keyboard arrow adjustment (default 10; Shift = 5x) */
		step?: number;
		/** Size to snap to on double-click (defaults to the midpoint of min/max) */
		defaultSize?: number;
		/** Accessible name for the slider (e.g. "Resize left panel") */
		ariaLabel?: string;
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
		step = 10,
		defaultSize,
		ariaLabel,
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
		// Reset to the configured default (or the midpoint of min/max).
		onResize?.(defaultSize ?? Math.round((min + max) / 2));
	}

	// Keyboard operation for the slider role: arrows adjust the size, Home/End jump
	// to min/max. Without this the role="slider" + aria-value* attributes promise
	// an adjustable control that a keyboard/SR user cannot actually move.
	function handleKeyDown(e: KeyboardEvent) {
		const amount = e.shiftKey ? step * 5 : step;
		let next: number;
		switch (e.key) {
			case 'ArrowRight':
			case 'ArrowUp':
				next = size + amount;
				break;
			case 'ArrowLeft':
			case 'ArrowDown':
				next = size - amount;
				break;
			case 'Home':
				next = min;
				break;
			case 'End':
				next = max;
				break;
			case 'Enter':
			case ' ':
				// Keyboard equivalent of double-click-to-reset: snap to the
				// configured default (or the midpoint of min/max).
				next = defaultSize ?? Math.round((min + max) / 2);
				break;
			default:
				return;
		}
		e.preventDefault();
		const clamped = Math.max(min, Math.min(max, next));
		if (clamped !== size) onResize?.(clamped);
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
	onkeydown={handleKeyDown}
	role="slider"
	aria-label={ariaLabel}
	aria-orientation={direction}
	aria-valuenow={size}
	aria-valuemin={min}
	aria-valuemax={max}
	tabindex={0}
>
	<div class="resize-handle__indicator"></div>
	<div class="resize-handle__grip" aria-hidden="true">
		<span></span>
		<span></span>
		<span></span>
	</div>
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
		/* Brighter resting hairline so the handle reads as a grab affordance
		   without leaning on the page's "Drag the edge" labels. */
		background: color-mix(in srgb, var(--ide-border) 55%, var(--ide-text-secondary));
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
	.resize-handle:focus-visible .resize-handle__indicator,
	.resize-handle--dragging .resize-handle__indicator {
		background: var(--ide-interactive, #4a8db7);
	}

	/* Centered grip motif (2-3 dots) so the resting handle reads as grabbable. */
	.resize-handle__grip {
		position: absolute;
		top: 50%;
		left: 50%;
		display: flex;
		gap: 3px;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	.resize-handle__grip span {
		display: block;
		width: 2px;
		height: 2px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--ide-border) 40%, var(--ide-text-secondary));
		transition: background-color 0.15s ease;
	}

	/* Stack the dots along the drag axis (vertical handle = dots in a column). */
	.resize-handle--vertical .resize-handle__grip {
		flex-direction: column;
	}

	.resize-handle:hover .resize-handle__grip span,
	.resize-handle:focus-visible .resize-handle__grip span,
	.resize-handle--dragging .resize-handle__grip span {
		background: var(--ide-interactive, #4a8db7);
	}

	/* Focus styles for keyboard accessibility */
	.resize-handle:focus {
		outline: none;
	}

	.resize-handle:focus-visible {
		outline: 2px solid var(--ide-interactive-focus, #4a8db7);
		outline-offset: 2px;
	}
</style>
