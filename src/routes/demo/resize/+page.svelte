<script lang="ts">
	import ResizeHandle from '$lib/components/core/ResizeHandle.svelte';

	// Panel sizes
	let leftPanelWidth = $state(250);
	let rightPanelWidth = $state(300);
	let topPanelHeight = $state(200);

	// Resize states for visual feedback
	let isResizingLeft = $state(false);
	let isResizingRight = $state(false);
	let isResizingTop = $state(false);

	// Track if any resize is happening
	let isResizing = $derived(isResizingLeft || isResizingRight || isResizingTop);
</script>

<div class="demo-page">
	<header class="page-header">
		<h1>Resizable Panes</h1>
		<p>
			Drag the handles between panels to resize. The edge follows your cursor live, and panel
			content fades to hide reflow.
		</p>
	</header>

	<p class="touch-note" role="note">
		Tip: resize handles are drag-driven. On a touch device, view this demo on a wider screen to drag
		the panel edges directly.
	</p>

	<section class="demo-section">
		<h2>Three-Column Layout</h2>
		<p class="section-desc">
			Left sidebar, main content, and right sidebar with vertical resize handles
		</p>

		<div
			class="three-column-demo"
			class:three-column-demo--resizing={isResizing}
			style="--left-width: {leftPanelWidth}px; --right-width: {rightPanelWidth}px;"
		>
			<div class="panel panel--left" class:panel--resizing={isResizingLeft}>
				<div class="panel__header">Left Panel</div>
				<div class="panel__content">
					<p>Width: {leftPanelWidth}px</p>
					<p class="panel__hint">Drag the edge to resize →</p>
					<div class="panel__readout" aria-hidden="true">{leftPanelWidth}<span>px</span></div>
				</div>
			</div>

			<ResizeHandle
				direction="vertical"
				position="end"
				size={leftPanelWidth}
				min={150}
				max={400}
				defaultSize={250}
				ariaLabel="Resize left panel"
				onResize={(size) => (leftPanelWidth = size)}
				onResizeStart={() => (isResizingLeft = true)}
				onResizeEnd={() => (isResizingLeft = false)}
			/>

			<div class="panel panel--center">
				<div class="panel__header">Main Content</div>
				<div class="panel__content panel__content--centered">
					<p>This panel fills the remaining space</p>
					<p>Left: {leftPanelWidth}px | Right: {rightPanelWidth}px</p>
					<div class="panel__skeleton" aria-hidden="true">
						<span></span>
						<span></span>
						<span></span>
					</div>
				</div>
			</div>

			<ResizeHandle
				direction="vertical"
				position="start"
				size={rightPanelWidth}
				min={150}
				max={500}
				defaultSize={300}
				ariaLabel="Resize right panel"
				onResize={(size) => (rightPanelWidth = size)}
				onResizeStart={() => (isResizingRight = true)}
				onResizeEnd={() => (isResizingRight = false)}
			/>

			<div class="panel panel--right" class:panel--resizing={isResizingRight}>
				<div class="panel__header">Right Panel</div>
				<div class="panel__content">
					<p>Width: {rightPanelWidth}px</p>
					<p class="panel__hint">← Drag the edge to resize</p>
					<div class="panel__readout" aria-hidden="true">{rightPanelWidth}<span>px</span></div>
				</div>
			</div>
		</div>
	</section>

	<section class="demo-section">
		<h2>Vertical Split</h2>
		<p class="section-desc">Top and bottom panels with horizontal resize handle</p>

		<div
			class="vertical-split-demo"
			class:vertical-split-demo--resizing={isResizingTop}
			style="--top-height: {topPanelHeight}px;"
		>
			<div class="panel panel--top" class:panel--resizing={isResizingTop}>
				<div class="panel__header">Top Panel</div>
				<div class="panel__content panel__content--centered">
					<p>Height: {topPanelHeight}px</p>
					<p class="panel__hint">Drag the edge to resize ↓</p>
					<div class="panel__readout" aria-hidden="true">{topPanelHeight}<span>px</span></div>
				</div>
			</div>

			<ResizeHandle
				direction="horizontal"
				position="end"
				size={topPanelHeight}
				min={100}
				max={350}
				defaultSize={200}
				ariaLabel="Resize top panel"
				onResize={(size) => (topPanelHeight = size)}
				onResizeStart={() => (isResizingTop = true)}
				onResizeEnd={() => (isResizingTop = false)}
			/>

			<div class="panel panel--bottom">
				<div class="panel__header">Bottom Panel</div>
				<div class="panel__content panel__content--centered">
					<p>This panel fills the remaining vertical space</p>
					<div class="panel__skeleton" aria-hidden="true">
						<span></span>
						<span></span>
						<span></span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="demo-section">
		<h2>Features</h2>
		<ul class="features-list">
			<li>
				<strong>Live Edge:</strong> The handle highlights and the panel edge tracks your cursor in real
				time as you drag
			</li>
			<li><strong>Smooth Transitions:</strong> Panel sizes animate smoothly when released</li>
			<li><strong>Content Fade:</strong> Panel content fades during resize to hide text reflow</li>
			<li><strong>Min/Max Constraints:</strong> Panels respect minimum and maximum size limits</li>
			<li>
				<strong>Double-click Reset:</strong> Double-click the handle to reset the panel to its default
				size
			</li>
		</ul>
	</section>
</div>

<style>
	.demo-page {
		padding: 2rem 3rem;
		max-width: 1200px;
		min-height: 100vh;
		overflow-x: hidden;
	}

	.page-header {
		margin-bottom: 2.5rem;
	}

	/* Touch / small-screen guidance — hidden on desktop where dragging works */
	.touch-note {
		display: none;
		margin-top: -1.25rem;
		margin-bottom: 2rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--ide-border);
		border-left: 3px solid var(--ide-interactive, #4a8db7);
		border-radius: var(--ide-radius-md);
		background: var(--ide-bg-secondary);
		color: var(--ide-text-secondary);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.page-header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: var(--ide-text-primary);
		margin-bottom: 0.5rem;
	}

	.page-header p {
		color: var(--ide-text-secondary);
	}

	.demo-section {
		margin-bottom: 3rem;
	}

	.demo-section h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--ide-text-primary);
		margin-bottom: 0.25rem;
	}

	.section-desc {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	/* Three Column Layout */
	.three-column-demo {
		display: flex;
		height: 300px;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		overflow: hidden;
		background: var(--ide-bg-primary);
	}

	.three-column-demo .panel--left {
		width: var(--left-width);
		flex-shrink: 0;
		transition: width 0.08s ease-out;
	}

	.three-column-demo .panel--center {
		flex: 1;
		min-width: 0;
	}

	.three-column-demo .panel--right {
		width: var(--right-width);
		flex-shrink: 0;
		transition: width 0.08s ease-out;
	}

	/* Disable transition during drag */
	.three-column-demo--resizing .panel--left,
	.three-column-demo--resizing .panel--right {
		transition: none;
	}

	/* Fade content during resize */
	.three-column-demo--resizing .panel__content {
		opacity: 0.5;
		filter: blur(1px);
	}

	/* Vertical Split Layout */
	.vertical-split-demo {
		display: flex;
		flex-direction: column;
		height: 400px;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		overflow: hidden;
		background: var(--ide-bg-primary);
	}

	.vertical-split-demo .panel--top {
		height: var(--top-height);
		flex-shrink: 0;
		transition: height 0.08s ease-out;
	}

	.vertical-split-demo .panel--bottom {
		flex: 1;
		min-height: 0;
	}

	/* Disable transition during drag */
	.vertical-split-demo--resizing .panel--top {
		transition: none;
	}

	/* Fade content during resize */
	.vertical-split-demo--resizing .panel__content {
		opacity: 0.5;
		filter: blur(1px);
	}

	/* Panel Styles */
	.panel {
		display: flex;
		flex-direction: column;
		background: var(--ide-bg-secondary);
		overflow: hidden;
	}

	.panel--resizing {
		will-change: width, height;
	}

	.panel__header {
		padding: 0.75rem 1rem;
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--ide-text-primary);
		background: var(--ide-bg-tertiary);
		border-bottom: 1px solid var(--ide-border);
	}

	.panel__content {
		flex: 1;
		padding: 1rem;
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		transition:
			opacity 0.1s ease,
			filter 0.1s ease;
	}

	.panel__content p {
		margin-bottom: 0.5rem;
	}

	.panel__hint {
		color: var(--ide-text-muted);
		font-style: italic;
	}

	/* Centered filler so tall panels read as a deliberate canvas, not a placeholder */
	.panel__content--centered {
		display: flex;
		flex-direction: column;
	}

	.panel__readout {
		margin-top: auto;
		margin-bottom: auto;
		text-align: center;
		font-size: 2.25rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--ide-text-primary);
		opacity: 0.18;
		user-select: none;
	}

	.panel__readout span {
		font-size: 1rem;
		font-weight: 500;
		margin-left: 0.15em;
	}

	/* Faint skeleton rows hint at content without faking real data */
	.panel__skeleton {
		margin-top: auto;
		margin-bottom: auto;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: 100%;
		max-width: 320px;
		opacity: 0.5;
	}

	.panel__skeleton span {
		display: block;
		height: 0.5rem;
		border-radius: 999px;
		background: linear-gradient(90deg, var(--ide-border) 0%, var(--ide-bg-tertiary) 100%);
	}

	.panel__skeleton span:nth-child(1) {
		width: 92%;
	}
	.panel__skeleton span:nth-child(2) {
		width: 74%;
	}
	.panel__skeleton span:nth-child(3) {
		width: 58%;
	}

	/* Features List */
	.features-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.features-list li {
		padding: 0.5rem 0;
		color: var(--ide-text-secondary);
		border-bottom: 1px solid var(--ide-border);
	}

	.features-list li:last-child {
		border-bottom: none;
	}

	.features-list strong {
		color: var(--ide-text-primary);
	}

	/* ── Tablet ─────────────────────────────────────────────── */
	@media (max-width: 860px) {
		.demo-page {
			padding: 1.75rem 1.5rem;
		}

		/* Keep the right sidebar from crowding the center on narrow tablets */
		.three-column-demo .panel--right {
			width: clamp(180px, 28vw, var(--right-width));
		}
	}

	/* ── Phone ──────────────────────────────────────────────── */
	@media (max-width: 640px) {
		.demo-page {
			padding: 1.5rem 1.125rem;
		}

		.page-header h1 {
			font-size: 1.625rem;
		}

		.touch-note {
			display: block;
		}

		/*
		 * Blocker fix: the three-column flex layout overflows a phone viewport
		 * because of the fixed left/right panel widths. Stack the panels
		 * vertically and let each take the full width with an auto height —
		 * mirroring the Vertical Split's graceful stacking.
		 */
		.three-column-demo {
			flex-direction: column;
			height: auto;
		}

		.three-column-demo .panel--left,
		.three-column-demo .panel--center,
		.three-column-demo .panel--right {
			width: 100%;
			flex-shrink: 1;
			flex-basis: auto;
			min-height: 120px;
			transition: none;
		}

		/* Visual divider between stacked panels (replaces the side borders) */
		.three-column-demo .panel--center,
		.three-column-demo .panel--right {
			border-top: 1px solid var(--ide-border);
		}

		/*
		 * Major fix: dragging a thin vertical handle is not viable on touch and,
		 * once stacked, the vertical handles point the wrong way. Hide them on
		 * phones — the touch-note above explains the interaction instead.
		 */
		.three-column-demo :global(.resize-handle--vertical) {
			display: none;
		}

		/* Give the horizontal split handle a touch-friendly hit target */
		.vertical-split-demo :global(.resize-handle--horizontal) {
			height: 24px;
			margin: -9px 0;
		}

		/* Tighten the empty-space ratio now that panels are full-width */
		.panel__readout {
			font-size: 1.875rem;
			/* Lift the watermark off the legibility floor on the darkest panels */
			opacity: 0.26;
		}

		.vertical-split-demo {
			height: auto;
		}

		.vertical-split-demo .panel--top {
			min-height: 140px;
		}

		.vertical-split-demo .panel--bottom {
			min-height: 160px;
		}
	}
</style>
