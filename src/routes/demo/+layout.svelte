<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { page } from '$app/stores';
	import ResizeHandle from '$lib/components/core/ResizeHandle.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';

	interface Props {
		children: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	type NavItem = { href: string; label: string; icon: string };
	type NavGroup = { title: string; items: NavItem[] };

	// Grouped navigation. Hrefs are stored WITHOUT the base; we prefix `base`
	// at render time so links stay correct under a deployed sub-path.
	const navGroups: NavGroup[] = [
		{
			title: 'Core',
			items: [
				{ href: '/demo/editor', label: 'Editor', icon: '✎' },
				{ href: '/demo/languages', label: 'Languages', icon: '⌗' },
				{ href: '/demo/folding', label: 'Code Folding', icon: '⊟' },
				{ href: '/demo/stress', label: 'Stress Test', icon: '▥' },
				{ href: '/demo/components', label: 'Components', icon: '▢' },
				{ href: '/demo/resize', label: 'Resizable Panes', icon: '⇔' },
				{ href: '/demo/playground', label: 'Playground', icon: '▶' }
			]
		},
		{
			title: 'Intelligence',
			items: [
				{ href: '/demo/editor-intelligence', label: 'Editor Intelligence', icon: '◈' },
				{ href: '/demo/semantic-features', label: 'Semantic', icon: '◇' },
				{ href: '/demo/cognitive-load', label: 'Cognitive complexity', icon: '◐' },
				{ href: '/demo/debugging', label: 'Debugging', icon: '◎' },
				{ href: '/demo/devx-features', label: 'DevX', icon: '♦' }
			]
		},
		{
			title: 'Collaboration & AI',
			items: [
				{ href: '/demo/ai', label: 'AI Panel', icon: '◆' },
				{ href: '/demo/collaboration', label: 'Collaboration', icon: '⚇' },
				{ href: '/demo/collaboration-features', label: 'Collab Features', icon: '⚉' },
				{ href: '/demo/plugins', label: 'Plugins', icon: '⚡' },
				{ href: '/demo/power-features', label: 'Power Features', icon: '⚙' }
			]
		}
	];

	let currentPath = $derived($page.url.pathname);

	// Routes whose page renders a full application shell (IDE chrome, multi-panel
	// dashboards) rather than prose. These fill the whole content area instead of
	// being capped to the centered reading column. Stored without `base`.
	const FULL_BLEED_PATHS = new Set(['/demo/editor', '/demo/playground']);

	let isFullBleed = $derived(FULL_BLEED_PATHS.has(currentPath.slice(base.length)));

	function isActive(href: string): boolean {
		const target = `${base}${href}`;
		return currentPath === target;
	}

	// Resizable sidebar state
	let sidebarWidth = $state(248);
	let isResizing = $state(false);
	const MIN_SIDEBAR_WIDTH = 200;
	const MAX_SIDEBAR_WIDTH = 380;

	// Mobile drawer state
	let mobileOpen = $state(false);
	let toggleEl = $state<HTMLButtonElement | null>(null);
	let sidebarEl = $state<HTMLElement | null>(null);

	// Close the drawer whenever the route changes.
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		currentPath; // read to declare reactive dependency on route changes
		mobileOpen = false;
	});

	function closeDrawer() {
		mobileOpen = false;
		// Return focus to the toggle so keyboard users aren't stranded.
		toggleEl?.focus();
	}

	// While the drawer is open: trap Tab focus inside it, close on Escape, and
	// move focus into the drawer. The backdrop already closes on click.
	$effect(() => {
		if (!mobileOpen || !sidebarEl) return;

		const drawer = sidebarEl;

		// Move focus into the drawer on open (first focusable element).
		const focusables = () =>
			Array.from(
				drawer.querySelectorAll<HTMLElement>(
					'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
				)
			).filter((el) => el.offsetParent !== null || el === document.activeElement);

		focusables()[0]?.focus();

		function handleKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeDrawer();
				return;
			}
			if (event.key !== 'Tab') return;

			const items = focusables();
			if (items.length === 0) return;
			const first = items[0];
			const last = items[items.length - 1];
			const active = document.activeElement;

			if (event.shiftKey) {
				if (active === first || !drawer.contains(active)) {
					event.preventDefault();
					last.focus();
				}
			} else if (active === last || !drawer.contains(active)) {
				event.preventDefault();
				first.focus();
			}
		}

		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});
</script>

<div class="demo-layout" class:demo-layout--resizing={isResizing}>
	<!-- Mobile top bar (hidden on desktop) -->
	<div class="mobile-bar">
		<button
			bind:this={toggleEl}
			class="mobile-toggle"
			aria-expanded={mobileOpen}
			aria-controls="demo-sidebar"
			onclick={() => (mobileOpen = !mobileOpen)}
		>
			<span aria-hidden="true">{mobileOpen ? '✕' : '☰'}</span>
			<span class="ide-visually-hidden">Toggle navigation</span>
		</button>
		<a class="mobile-brand" href={resolve('/')}>
			<BrandMark size={22} />
			<span>Nocturnium IDE</span>
		</a>
	</div>

	<aside
		bind:this={sidebarEl}
		id="demo-sidebar"
		class="demo-sidebar"
		class:demo-sidebar--open={mobileOpen}
		style="width: {sidebarWidth}px;"
	>
		<div class="demo-header">
			<a class="demo-logo" href={resolve('/')} aria-label="Nocturnium Svelte IDE — home">
				<BrandMark size={24} />
				<span class="logo-text">Nocturnium</span>
			</a>
			<div class="demo-header-meta">
				<span class="product-tag">Svelte IDE</span>
				<span class="version-pill">v{__APP_VERSION__}</span>
			</div>
		</div>

		<nav class="demo-nav" aria-label="Demo navigation">
			<a class="nav-home" href={resolve('/')}>
				<span class="nav-icon" aria-hidden="true">←</span>
				<span class="nav-label">Back to home</span>
			</a>
			<a
				class="nav-item nav-overview"
				class:active={isActive('/demo')}
				href={resolve('/demo')}
				aria-current={isActive('/demo') ? 'page' : undefined}
			>
				<span class="nav-icon" aria-hidden="true">⌂</span>
				<span class="nav-label">Overview</span>
			</a>

			{#each navGroups as group (group.title)}
				<div class="nav-group">
					<h2 class="nav-group-title">{group.title}</h2>
					{#each group.items as item (item.href)}
						<a
							class="nav-item"
							class:active={isActive(item.href)}
							href={`${base}${item.href}`}
							aria-current={isActive(item.href) ? 'page' : undefined}
						>
							<span class="nav-icon" aria-hidden="true">{item.icon}</span>
							<span class="nav-label">{item.label}</span>
						</a>
					{/each}
				</div>
			{/each}
		</nav>

		<div class="demo-footer">
			<a
				class="footer-gh"
				href="https://github.com/nocturnium/svelte-ide"
				target="_blank"
				rel="noopener"
			>
				<span aria-hidden="true">★</span>
				<span>GitHub</span>
			</a>
			<span class="footer-meta">MIT · Svelte 5</span>
		</div>
	</aside>

	<!-- Backdrop for mobile drawer -->
	{#if mobileOpen}
		<button class="mobile-backdrop" aria-label="Close navigation" onclick={closeDrawer}></button>
	{/if}

	<div class="resize-handle-wrap">
		<ResizeHandle
			direction="vertical"
			position="end"
			size={sidebarWidth}
			min={MIN_SIDEBAR_WIDTH}
			max={MAX_SIDEBAR_WIDTH}
			onResize={(size) => (sidebarWidth = size)}
			onResizeStart={() => (isResizing = true)}
			onResizeEnd={() => (isResizing = false)}
		/>
	</div>

	<main class="demo-content" class:demo-content--bleed={isFullBleed}>
		<div class="demo-content__inner">
			{@render children()}
		</div>
	</main>
</div>

<style>
	.demo-layout {
		display: flex;
		min-height: 100vh;
		background: var(--ide-bg-primary);
	}

	/* Mobile bar */
	.mobile-bar {
		display: none;
		position: sticky;
		top: 0;
		z-index: var(--ide-z-sticky);
		align-items: center;
		gap: var(--ide-spacing-md);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border-bottom: 1px solid var(--ide-border);
	}
	.mobile-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		background: var(--ide-bg-tertiary);
		color: var(--ide-text-primary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		font-size: var(--ide-font-size-base);
		cursor: pointer;
	}
	.mobile-brand {
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		font-weight: 600;
		color: var(--ide-text-primary);
		text-decoration: none;
	}

	/* Sidebar */
	.demo-sidebar {
		background: var(--ide-bg-secondary);
		border-right: 1px solid var(--ide-border);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		min-width: 200px;
		max-width: 380px;
		height: 100vh;
		position: sticky;
		top: 0;
		transition: width 0.08s ease-out;
		overflow: hidden;
	}

	.demo-layout--resizing .demo-sidebar {
		transition: none;
	}
	.demo-layout--resizing .demo-nav {
		opacity: 0.7;
	}

	.demo-header {
		padding: var(--ide-spacing-lg) var(--ide-spacing-md) var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
	}
	.demo-logo {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		text-decoration: none;
		color: var(--ide-text-primary);
	}
	.logo-text {
		font-weight: 700;
		font-size: var(--ide-font-size-lg);
		letter-spacing: -0.01em;
	}
	.demo-header-meta {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		margin-top: var(--ide-spacing-sm);
		padding-left: calc(var(--ide-font-size-xl) + var(--ide-spacing-sm));
	}
	.product-tag {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
	}
	.version-pill {
		font-size: var(--ide-font-size-xs);
		font-family: var(--ide-font-mono);
		color: var(--ide-accent);
		background: color-mix(in srgb, var(--ide-accent) 14%, transparent);
		padding: 1px var(--ide-spacing-sm);
		border-radius: var(--ide-radius-full);
	}

	/* Nav */
	.demo-nav {
		flex: 1;
		padding: var(--ide-spacing-md) var(--ide-spacing-sm);
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-xs);
		overflow-y: auto;
	}

	.nav-home {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-sm);
		border-radius: var(--ide-radius-md);
		color: var(--ide-text-muted);
		text-decoration: none;
		font-size: var(--ide-font-size-xs);
		transition: color var(--ide-transition-fast);
	}
	.nav-home:hover {
		color: var(--ide-text-primary);
	}

	.nav-group {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-xs);
		margin-top: var(--ide-spacing-md);
	}
	.nav-group-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ide-text-muted);
		margin: 0 0 var(--ide-spacing-xs);
		padding: 0 var(--ide-spacing-sm);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-sm);
		border-radius: var(--ide-radius-md);
		color: var(--ide-text-secondary);
		text-decoration: none;
		font-size: var(--ide-font-size-sm);
		transition:
			background var(--ide-transition-fast),
			color var(--ide-transition-fast);
		position: relative;
	}
	.nav-overview {
		margin-top: var(--ide-spacing-xs);
	}
	.nav-item:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}
	.nav-item.active {
		background: color-mix(in srgb, var(--ide-accent) 16%, transparent);
		color: var(--ide-text-primary);
		font-weight: 600;
	}
	.nav-item.active::before {
		content: '';
		position: absolute;
		left: 0;
		top: 20%;
		bottom: 20%;
		width: 3px;
		border-radius: var(--ide-radius-full);
		background: var(--ide-accent);
	}
	.nav-item:focus-visible,
	.nav-home:focus-visible,
	.demo-logo:focus-visible,
	.footer-gh:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}
	.nav-icon {
		width: 1.25rem;
		text-align: center;
		flex-shrink: 0;
		color: var(--ide-text-muted);
	}
	.nav-item.active .nav-icon {
		color: var(--ide-accent);
	}
	.nav-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Footer */
	.demo-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--ide-spacing-md);
		border-top: 1px solid var(--ide-border);
	}
	.footer-gh {
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-secondary);
		text-decoration: none;
		transition: color var(--ide-transition-fast);
	}
	.footer-gh:hover {
		color: var(--ide-text-primary);
	}
	.footer-meta {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}

	/* Content */
	.demo-content {
		flex: 1;
		min-width: 0;
		overflow: auto;
		/* Establish a height context so full-height demos (height: 100%)
		   resolve against the viewport, not their intrinsic content. */
		display: flex;
		flex-direction: column;
	}

	/* Shared rhythm for every routed demo page: one max-width, centered, with
	   consistent gutters — so individual pages don't each re-implement it.
	   Uses min-height (never a fixed height) so full-height editor demos that
	   set `height: 100%` still resolve correctly without being clipped. */
	.demo-content__inner {
		width: 100%;
		max-width: 1280px;
		margin-inline: auto;
		padding: var(--ide-spacing-xl) var(--ide-spacing-2xl) var(--ide-spacing-2xl);
		min-height: 100%;
		box-sizing: border-box;
	}

	/* Centered prose/card pages use progressively more of the screen on large
	   displays for a modern, less-empty feel (full-bleed pages opt out above). */
	@media (min-width: 1600px) {
		.demo-content__inner {
			max-width: 1440px;
		}
	}
	@media (min-width: 1920px) {
		.demo-content__inner {
			max-width: 1600px;
		}
	}

	@media (max-width: 860px) {
		.demo-content__inner {
			padding: var(--ide-spacing-lg) var(--ide-spacing-lg) var(--ide-spacing-2xl);
		}
	}

	/* Center each routed page's content column. The layout owns horizontal
	   rhythm (consistent gutters), but a page's own scoped max-width wins over
	   this reset on specificity — so instead of fighting it we just force the
	   column to center (!important beats the page's own margin) rather than
	   letting it sit left-shifted, which most pages did. Bleed pages have
	   full-width children, so the auto margin is a no-op there. Vertical spacing
	   stays with each page. */
	.demo-content__inner > :global(*) {
		max-width: none;
		margin-inline: auto !important;
		padding-inline: 0;
	}

	/* Full-bleed pages (app shells, multi-panel dashboards) fill the entire content
	   area instead of the centered reading column — no max-width, no gutters — and
	   stretch vertically so their own height:100% / flex chrome resolves against the
	   viewport. Driven by FULL_BLEED_PATHS in the script above. */
	.demo-content--bleed .demo-content__inner {
		max-width: none;
		margin-inline: 0;
		padding: 0;
	}
	/* Defeat the routed page's own root max-width/centering so it truly fills.
	   Inner prose keeps its own narrower max-width (it's a deeper descendant). */
	.demo-content--bleed .demo-content__inner > :global(*) {
		max-width: none;
		margin-inline: 0;
	}
	/* Fill the viewport height only on wider screens. On mobile each full-bleed
	   page keeps its own natural single-column flow, so we don't force flex heights
	   that leave dead space under the stacked mobile layout. */
	@media (min-width: 861px) {
		.demo-content--bleed .demo-content__inner {
			display: flex;
			flex-direction: column;
			flex: 1;
			min-height: 0;
		}
		.demo-content--bleed .demo-content__inner > :global(*) {
			flex: 1;
			min-height: 0;
		}
	}

	.mobile-backdrop {
		display: none;
		position: fixed;
		inset: 0;
		z-index: calc(var(--ide-z-overlay) - 1);
		background: color-mix(in srgb, var(--ide-bg-primary) 70%, transparent);
		border: none;
		cursor: pointer;
	}

	/* Responsive: sidebar becomes a slide-in drawer */
	@media (max-width: 860px) {
		.mobile-bar {
			display: flex;
		}
		.demo-layout {
			flex-direction: column;
		}
		.demo-sidebar {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			height: 100vh;
			width: min(82vw, 320px) !important;
			z-index: var(--ide-z-overlay);
			transform: translateX(-100%);
			transition: transform var(--ide-transition-normal);
		}
		.demo-sidebar--open {
			transform: translateX(0);
			box-shadow: var(--ide-shadow-xl);
		}
		.mobile-backdrop {
			display: block;
		}
		.resize-handle-wrap {
			display: none;
		}
	}
</style>
