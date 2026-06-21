<script lang="ts">
	import ResizeHandle from '$lib/components/core/ResizeHandle.svelte';

	let leftPanelWidth = $state(250);
	let rightPanelWidth = $state(300);
	let topPanelHeight = $state(200);

	let isResizingLeft = $state(false);
	let isResizingRight = $state(false);
	let isResizingTop = $state(false);

	let isResizing = $derived(isResizingLeft || isResizingRight || isResizingTop);

	const HANDLE = 6;
	let bottomHeight = $derived(Math.max(0, 400 - topPanelHeight - HANDLE));
</script>

<div class="resize-demo">
	<div class="resize-block">
		<h3>Three-Column Layout</h3>
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
					<p class="panel__static">Fills the remaining space between the side panels</p>
					<p>
						Left: {leftPanelWidth}px <span class="panel__divider">|</span> Right: {rightPanelWidth}px
					</p>
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
	</div>

	<div class="resize-block">
		<h3>Vertical Split</h3>
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
					<p>Height: {bottomHeight}px <span class="panel__derived">(derived live)</span></p>
					<p>Fills the remaining vertical space as the top panel resizes</p>
					<div class="panel__readout" aria-hidden="true">{bottomHeight}<span>px</span></div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.resize-demo {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-xl);
	}

	.resize-block h3 {
		margin: 0 0 var(--ide-spacing-sm);
		font-size: var(--ide-font-size-base);
		font-weight: 600;
		color: var(--ide-text-secondary);
	}

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

	.three-column-demo--resizing .panel--left,
	.three-column-demo--resizing .panel--right {
		transition: none;
	}

	.three-column-demo--resizing .panel__content {
		opacity: 0.5;
		filter: blur(1px);
	}

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

	.vertical-split-demo--resizing .panel--top {
		transition: none;
	}

	.vertical-split-demo--resizing .panel__content {
		opacity: 0.5;
		filter: blur(1px);
	}

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
		color: var(--ide-text-secondary);
		font-style: italic;
	}

	.panel__static {
		color: var(--ide-text-muted);
		font-size: 0.8125rem;
	}

	.panel__derived {
		color: var(--ide-text-muted);
		font-size: 0.75rem;
		font-style: italic;
	}

	.panel__divider {
		color: var(--ide-text-muted);
		margin: 0 0.15em;
	}

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
		color: color-mix(in srgb, var(--ide-text-primary) 28%, transparent);
		user-select: none;
	}

	.panel__readout span {
		font-size: 1rem;
		font-weight: 500;
		margin-left: 0.15em;
	}

	@media (max-width: 860px) {
		.three-column-demo .panel--right {
			width: clamp(180px, 28vw, var(--right-width));
		}
	}

	@media (max-width: 640px) {
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

		.three-column-demo .panel--center,
		.three-column-demo .panel--right {
			border-top: 1px solid var(--ide-border);
		}

		.three-column-demo :global(.resize-handle--vertical) {
			display: none;
		}

		.vertical-split-demo :global(.resize-handle--horizontal) {
			height: 24px;
			margin: -9px 0;
		}

		.panel__readout {
			font-size: 1.875rem;
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
