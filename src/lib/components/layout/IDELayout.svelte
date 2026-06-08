<script lang="ts">
	/**
	 * IDELayout - Main IDE layout with resizable panels
	 *
	 * Provides a VS Code-like layout with:
	 * - Activity bar (left icons)
	 * - Resizable left sidebar (file explorer, search, etc.)
	 * - Main editor area
	 * - Resizable right sidebar (AI panel, etc.)
	 * - Resizable bottom panel (terminal, output, etc.)
	 * - Status bar
	 */

	import type { Snippet } from 'svelte';
	import { ResizeHandle } from '$components/core';
	import {
		getLeftSidebarVisible,
		getLeftSidebarWidth,
		setLeftSidebarWidth,
		getRightSidebarVisible,
		getRightSidebarWidth,
		setRightSidebarWidth,
		getBottomPanelVisible,
		getBottomPanelHeight,
		setBottomPanelHeight,
		getStatusBarVisible,
		constraints
	} from '$stores/layout.svelte';

	interface Props {
		/** Additional CSS class */
		class?: string;
		/** Activity bar content — the left icon rail. */
		activityBar?: Snippet;
		/** Left sidebar content (file explorer, search, …); rendered when the left sidebar is visible. */
		leftSidebar?: Snippet;
		/** Main editor area content. */
		editor?: Snippet;
		/** Bottom panel content (terminal, output, …); rendered when the bottom panel is visible. */
		bottomPanel?: Snippet;
		/** Right sidebar content (AI panel, …); rendered when the right sidebar is visible. */
		rightSidebar?: Snippet;
		/** Status bar content; rendered when the status bar is visible. */
		statusBar?: Snippet;
	}

	let {
		class: className = '',
		activityBar,
		leftSidebar,
		editor,
		bottomPanel,
		rightSidebar,
		statusBar
	}: Props = $props();

	// Track resize state for visual feedback
	let isResizingLeft = $state(false);
	let isResizingRight = $state(false);
	let isResizingBottom = $state(false);
</script>

<div
	class="ide-layout {className}"
	class:ide-layout--resizing={isResizingLeft || isResizingRight || isResizingBottom}
>
	<!-- Top Row: Activity Bar + Content -->
	<div class="ide-layout__row">
		<!-- Activity Bar -->
		<aside class="ide-layout__activity-bar">
			{@render activityBar?.()}
		</aside>

		<!-- Content Area: Left Sidebar + Main + Right Sidebar -->
		<div class="ide-layout__content">
			<!-- Left Sidebar -->
			{#if getLeftSidebarVisible()}
				<aside
					class="ide-layout__sidebar ide-layout__sidebar--left"
					class:ide-layout__sidebar--resizing={isResizingLeft}
					style="width: {getLeftSidebarWidth()}px;"
				>
					{@render leftSidebar?.()}
				</aside>
				<ResizeHandle
					direction="vertical"
					position="end"
					size={getLeftSidebarWidth()}
					min={constraints.sidebarMinWidth}
					max={constraints.sidebarMaxWidth}
					onResize={setLeftSidebarWidth}
					onResizeStart={() => (isResizingLeft = true)}
					onResizeEnd={() => (isResizingLeft = false)}
				/>
			{/if}

			<!-- Main Content Area -->
			<main class="ide-layout__main">
				<!-- Editor Area -->
				<div class="ide-layout__editor">
					{@render editor?.()}
				</div>

				<!-- Bottom Panel -->
				{#if getBottomPanelVisible()}
					<ResizeHandle
						direction="horizontal"
						position="start"
						size={getBottomPanelHeight()}
						min={constraints.panelMinHeight}
						max={constraints.panelMaxHeight}
						onResize={setBottomPanelHeight}
						onResizeStart={() => (isResizingBottom = true)}
						onResizeEnd={() => (isResizingBottom = false)}
					/>
					<aside
						class="ide-layout__panel ide-layout__panel--bottom"
						class:ide-layout__panel--resizing={isResizingBottom}
						style="height: {getBottomPanelHeight()}px;"
					>
						{@render bottomPanel?.()}
					</aside>
				{/if}
			</main>

			<!-- Right Sidebar -->
			{#if getRightSidebarVisible()}
				<ResizeHandle
					direction="vertical"
					position="start"
					size={getRightSidebarWidth()}
					min={constraints.sidebarMinWidth}
					max={constraints.sidebarMaxWidth}
					onResize={setRightSidebarWidth}
					onResizeStart={() => (isResizingRight = true)}
					onResizeEnd={() => (isResizingRight = false)}
				/>
				<aside
					class="ide-layout__sidebar ide-layout__sidebar--right"
					class:ide-layout__sidebar--resizing={isResizingRight}
					style="width: {getRightSidebarWidth()}px;"
				>
					{@render rightSidebar?.()}
				</aside>
			{/if}
		</div>
	</div>

	<!-- Status Bar -->
	{#if getStatusBarVisible()}
		<footer class="ide-layout__status-bar">
			{@render statusBar?.()}
		</footer>
	{/if}
</div>

<style>
	.ide-layout {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100vw;
		overflow: hidden;
		background: var(--ide-bg-primary);
	}

	/* Optimize during resize - reduce reflows */
	.ide-layout--resizing {
		contain: layout;
	}

	/* Disable pointer events on content during resize for smoother performance */
	.ide-layout--resizing .ide-layout__editor,
	.ide-layout--resizing .ide-layout__panel--bottom {
		pointer-events: none;
	}

	/* Top row: activity bar + content area */
	.ide-layout__row {
		display: flex;
		flex-direction: row;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.ide-layout__activity-bar {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		width: 48px;
		background: var(--ide-bg-secondary);
		border-right: 1px solid var(--ide-border);
	}

	/* Content area: sidebars + main in a row */
	.ide-layout__content {
		display: flex;
		flex-direction: row;
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.ide-layout__sidebar {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		background: var(--ide-bg-secondary);
		overflow: hidden;
		/* Smooth transition when size is applied on mouse up */
		transition: width 0.08s ease-out;
	}

	.ide-layout__sidebar--left {
		border-right: 1px solid var(--ide-border);
	}

	.ide-layout__sidebar--right {
		border-left: 1px solid var(--ide-border);
	}

	.ide-layout__sidebar--resizing {
		/* Disable transition during drag for instant ghost line feedback */
		transition: none;
		will-change: width;
		contain: layout style;
	}

	/* Fade/blur content during resize to hide ugly text reflow */
	.ide-layout--resizing .ide-layout__sidebar > :global(*) {
		opacity: 0.5;
		filter: blur(1px);
		transition:
			opacity 0.1s ease,
			filter 0.1s ease;
	}

	.ide-layout__main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.ide-layout__editor {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	/* Fade editor during resize */
	.ide-layout--resizing .ide-layout__editor > :global(*) {
		opacity: 0.7;
		transition: opacity 0.1s ease;
	}

	.ide-layout__panel {
		flex-shrink: 0;
		background: var(--ide-bg-secondary);
		overflow: hidden;
		/* Smooth transition when size is applied on mouse up */
		transition: height 0.08s ease-out;
	}

	.ide-layout__panel--bottom {
		border-top: 1px solid var(--ide-border);
	}

	.ide-layout__panel--resizing {
		/* Disable transition during drag */
		transition: none;
		will-change: height;
		contain: layout style;
	}

	/* Fade panel content during resize */
	.ide-layout--resizing .ide-layout__panel > :global(*) {
		opacity: 0.5;
		filter: blur(1px);
		transition:
			opacity 0.1s ease,
			filter 0.1s ease;
	}

	.ide-layout__status-bar {
		flex-shrink: 0;
		height: 24px;
		display: flex;
		align-items: center;
		padding: 0 var(--ide-spacing-sm);
		background: var(--ide-bg-tertiary);
		border-top: 1px solid var(--ide-border);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
	}
</style>
