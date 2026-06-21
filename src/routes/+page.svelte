<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import '../app.css';
	import Seo from './_components/Seo.svelte';
	import Badge from '$lib/components/core/Badge.svelte';
	import Button from '$lib/components/core/Button.svelte';
	import Icon from '$lib/components/core/Icon.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { tokenize, tokensToHTML } from '$lib/components/editor/tokenizer';

	// Live editor showcased in the hero, lazy-mounted and read-only (edits are
	// discarded so the sample always reads cleanly).
	const heroSample = `type Signal = {
  kind: 'error' | 'latency' | 'memory';
  count: number;
  owner?: string;
};

export function triageLoad(
  signals: Signal[],
  queueDepth: number
): string {
  let score = 0;
  for (const signal of signals) {
    if (signal.kind === 'error') {
      if (signal.count > 3 && queueDepth > 20) {
        if (signal.owner) score += signal.count * 6;
        else if (queueDepth > 80) score += 24;
        else score += 12;
      } else {
        score += 3;
      }
    } else if (signal.count > 5) {
      score += 10;
    }
  }
  return score > 80 ? 'critical' : 'clear';
}
`;

	// Render a snippet to highlighted HTML using the library tokenizer (same token
	// classes as the live editor). Lines are tokenized independently then joined,
	// so multi-line constructs carry their state line-to-line.
	function highlightToHTML(source: string, language: string): string {
		return tokenize(source, language)
			.map((line) => tokensToHTML(line.tokens))
			.join('\n');
	}

	// Static, lightweight syntax-highlighted paint for the hero. This is what ships
	// in the initial bundle; the heavyweight live editor is loaded on demand below.
	const heroHTML = highlightToHTML(heroSample, 'typescript');

	// Lazy-mounted live editor: paint the static <pre> immediately, then swap in the
	// real CustomEditor once it scrolls near the viewport and the main thread is idle.
	let heroEditorHost = $state<HTMLDivElement | null>(null);
	let HeroEditor = $state<
		typeof import('$lib/components/editor/CustomEditor.svelte').default | null
	>(null);

	onMount(() => {
		if (!heroEditorHost) return;

		let cancelled = false;
		let idleHandle: number | undefined;

		const load = async () => {
			if (cancelled || HeroEditor) return;
			const mod = await import('$lib/components/editor/CustomEditor.svelte');
			if (!cancelled) HeroEditor = mod.default;
		};

		const scheduleIdleLoad = () => {
			if (typeof requestIdleCallback === 'function') {
				idleHandle = requestIdleCallback(() => void load(), { timeout: 2000 });
			} else {
				idleHandle = window.setTimeout(() => void load(), 200);
			}
		};

		// If IntersectionObserver is unavailable, just load on idle.
		if (typeof IntersectionObserver !== 'function') {
			scheduleIdleLoad();
			return () => {
				cancelled = true;
			};
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						observer.disconnect();
						scheduleIdleLoad();
						break;
					}
				}
			},
			{ rootMargin: '200px' }
		);
		observer.observe(heroEditorHost);

		return () => {
			cancelled = true;
			observer.disconnect();
			if (idleHandle !== undefined) {
				if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle);
				else clearTimeout(idleHandle);
			}
		};
	});

	const features = [
		{
			icon: '◷',
			title: 'Zero editor dependencies',
			description:
				'No CodeMirror, no Monaco, no WASM. A purpose-built editor core in pure Svelte 5 — small, fast, and fully yours to theme.'
		},
		{
			icon: '⟡',
			title: 'Real editing model',
			description:
				'Multi-cursor, multi-line cursors, find & replace with regex, code folding, and virtualized rendering that stays smooth at 10k+ lines.'
		},
		{
			icon: '✦',
			title: 'AI panel surface',
			description:
				'A built-in demo assistant panel for wiring your own model backend, plus inline edit previews and ghost-cursor visualization for AI pairing.'
		},
		{
			icon: '⚇',
			title: 'CRDT collaboration',
			description:
				'Real-time multiplayer editing on Yjs with live cursors and presence. Conflict-free by construction, offline-friendly.'
		},
		{
			icon: '◐',
			title: 'Syntax for 12 languages',
			description:
				'JavaScript, TypeScript, JSX, TSX, HTML, XML, CSS, JSON, Python, Go, Markdown, and Svelte — tokenized with a Nocturnium-tuned palette.'
		},
		{
			icon: '⌘',
			title: 'Runes-first API',
			description:
				'Bindable props, snippet slots, and typed callbacks. Drop a component in, wire $state, and ship — no wrappers required.'
		}
	];

	const stats = [
		{ value: '0', label: 'Editor dependencies' },
		{ value: '10+', label: 'Languages highlighted' },
		{ value: '10k+', label: 'Lines, still smooth' },
		{ value: 'Svelte 5', label: 'Runes throughout' }
	];

	const quickStart = `npm install @nocturnium/svelte-ide`;

	const usageCode = `<script lang="ts">
  import { CustomEditor } from '@nocturnium/svelte-ide';
  import '@nocturnium/svelte-ide/theme.css';

  // Subpath entries for stores & collaboration
  import { toggleLeftSidebar } from '@nocturnium/svelte-ide/stores';
  import { CollaborativeDocument } from '@nocturnium/svelte-ide/crdt';

  let code = $state('const hello = "world";');
<${'/'}script>

<CustomEditor bind:content={code} language="typescript" folding multiCursor />`;

	// Quick start tabs: real syntax highlighting via the library tokenizer (read-only
	// HTML — far lighter than mounting an editor). Each tab is a tablist/tabpanel pair.
	const quickTabs = [
		{
			id: 'install',
			label: 'Install',
			code: quickStart,
			html: highlightToHTML(quickStart, 'plaintext')
		},
		{
			id: 'usage',
			label: 'Usage',
			code: usageCode,
			html: highlightToHTML(usageCode, 'svelte')
		}
	] as const;

	type QuickTabId = (typeof quickTabs)[number]['id'];

	let activeTab = $state<QuickTabId>('install');
	const activeQuickTab = $derived(quickTabs.find((t) => t.id === activeTab) ?? quickTabs[0]);

	// Keep references to the tab buttons so arrow keys can move focus between them.
	let tabButtons = $state<Record<QuickTabId, HTMLButtonElement | null>>({
		install: null,
		usage: null
	});

	function selectTab(id: QuickTabId) {
		activeTab = id;
	}

	// Roving-tabindex arrow-key navigation for the tablist (WAI-ARIA tabs pattern).
	function onTabKeydown(event: KeyboardEvent, index: number) {
		const last = quickTabs.length - 1;
		let next = index;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
			next = index === last ? 0 : index + 1;
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
			next = index === 0 ? last : index - 1;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = last;
		else return;

		event.preventDefault();
		const target = quickTabs[next];
		activeTab = target.id;
		tabButtons[target.id]?.focus();
	}

	// Clipboard copy for the active code block (mirrors AIMessageContent's pattern).
	let copiedTab = $state<QuickTabId | null>(null);
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyActive() {
		try {
			await navigator.clipboard.writeText(activeQuickTab.code);
			copiedTab = activeQuickTab.id;
			clearTimeout(copyResetTimer);
			copyResetTimer = setTimeout(() => {
				copiedTab = null;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}
</script>

<Seo />

<div class="landing">
	<a class="skip-link" href="#main">Skip to content</a>

	<!-- Top bar -->
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="Nocturnium Svelte IDE — home">
			<BrandMark size={26} />
			<span class="brand-name">Nocturnium</span>
			<span class="brand-sub">Svelte IDE</span>
		</a>
		<nav class="topnav" aria-label="Primary">
			<a href={resolve('/demo')}>Demos</a>
			<a class="topnav-secondary" href={resolve('/demo/editor')}>Editor</a>
			<a href="https://github.com/nocturnium/svelte-ide" target="_blank" rel="noopener">GitHub ↗</a>
		</nav>
	</header>

	<main id="main">
		<!-- Hero -->
		<section class="hero" aria-labelledby="hero-title">
			<div class="hero-copy">
				<div class="eyebrow">
					<Badge variant="info">v{__APP_VERSION__}</Badge>
					<span class="eyebrow-text">Live cognitive-load thermal map</span>
				</div>
				<h1 id="hero-title">
					See your code's <span class="grad">cognitive load</span> as a live visual layer.
				</h1>
				<p class="lede">
					A from-scratch, Svelte 5-native editor for code editors, AI assistants, and collaborative
					tools. No CodeMirror, no Monaco, zero runtime editor deps — just Svelte, fast, themeable,
					and production-ready.
				</p>
				<div class="hero-actions">
					<Button variant="primary" size="lg" onclick={() => goto(resolve('/demo/editor'))}>
						Try the editor
					</Button>
					<Button variant="secondary" size="lg" onclick={() => goto(resolve('/demo'))}>
						Browse demos
					</Button>
				</div>
				<a class="hero-tertiary" href={resolve('/demo/playground')}>
					Or see the full IDE playground <span aria-hidden="true">→</span>
				</a>
				<dl class="hero-stats">
					{#each stats as stat, i (i)}
						<div class="stat">
							<dt class="stat-value">{stat.value}</dt>
							<dd class="stat-label">{stat.label}</dd>
						</div>
					{/each}
				</dl>
			</div>

			<!-- Live editor showcase -->
			<div class="hero-editor" aria-label="Live code editor preview">
				<div class="window">
					<div class="window-bar">
						<span class="dot dot--red" aria-hidden="true"></span>
						<span class="dot dot--amber" aria-hidden="true"></span>
						<span class="dot dot--green" aria-hidden="true"></span>
						<span class="window-title">cognitive-load.ts</span>
						<Badge variant="primary">live</Badge>
					</div>
					<div class="window-body" bind:this={heroEditorHost}>
						{#if HeroEditor}
							<HeroEditor
								content={heroSample}
								language="typescript"
								readonly
								folding
								multiCursor
								complexityHighlighting={true}
							/>
						{:else}
							<!-- Lightweight syntax-highlighted paint shown until the live
							     editor lazy-loads. Same token classes as the real editor. -->
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- heroHTML is produced by highlightToHTML which escapes all user content through the tokenizer -->
							<pre class="hero-static" aria-hidden="true"><code>{@html heroHTML}</code></pre>
						{/if}
					</div>
				</div>
				<div class="hero-editor-glow" aria-hidden="true"></div>
			</div>
		</section>

		<!-- Feature grid -->
		<section class="features" aria-labelledby="features-title">
			<div class="section-head">
				<h2 id="features-title">Everything an editor needs, nothing it doesn't</h2>
				<p>A focused set of primitives that compose into a real IDE.</p>
			</div>
			<div class="feature-grid">
				{#each features as feature, i (i)}
					<article class="feature-card">
						<span class="feature-icon" aria-hidden="true">{feature.icon}</span>
						<h3>{feature.title}</h3>
						<p>{feature.description}</p>
					</article>
				{/each}
			</div>
		</section>

		<!-- Quick start -->
		<section class="quickstart" aria-labelledby="quickstart-title">
			<div class="section-head">
				<h2 id="quickstart-title">Up and running in minutes</h2>
				<p>Install the package, import the theme, drop in a component.</p>
			</div>
			<div class="code-panel">
				<div class="code-tabbar">
					<div class="code-tabs" role="tablist" aria-label="Quick start steps">
						{#each quickTabs as tab, i (tab.id)}
							<button
								class="code-tab"
								class:active={activeTab === tab.id}
								role="tab"
								id={`qs-tab-${tab.id}`}
								aria-selected={activeTab === tab.id}
								aria-controls={`qs-panel-${tab.id}`}
								tabindex={activeTab === tab.id ? 0 : -1}
								bind:this={tabButtons[tab.id]}
								onclick={() => selectTab(tab.id)}
								onkeydown={(e) => onTabKeydown(e, i)}
							>
								{tab.label}
							</button>
						{/each}
					</div>
					<button
						class="code-copy"
						type="button"
						onclick={copyActive}
						aria-label={`Copy ${activeQuickTab.label.toLowerCase()} snippet to clipboard`}
					>
						{#if copiedTab === activeQuickTab.id}
							<Icon name="check" size={14} />
							<span>Copied!</span>
						{:else}
							<Icon name="copy" size={14} />
							<span>Copy</span>
						{/if}
					</button>
				</div>
				{#each quickTabs as tab (tab.id)}
					<div
						class="code-panelbody"
						role="tabpanel"
						id={`qs-panel-${tab.id}`}
						aria-labelledby={`qs-tab-${tab.id}`}
						hidden={activeTab !== tab.id}
						tabindex="0"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<pre class="code-block"><code>{@html tab.html}</code></pre>
					</div>
				{/each}
			</div>
			<div class="quickstart-cta">
				<Button variant="primary" size="md" onclick={() => goto(resolve('/demo/editor'))}>
					See it in action →
				</Button>
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="footer">
		<div class="footer-grid">
			<div class="footer-brand">
				<BrandMark size={24} />
				<div>
					<strong>Nocturnium Svelte IDE</strong>
					<p>Zero-dependency IDE components for Svelte 5.</p>
				</div>
			</div>
			<nav class="footer-links" aria-label="Footer">
				<a href={resolve('/demo')}>Demos</a>
				<a href={resolve('/demo/editor')}>Editor</a>
				<a href={resolve('/demo/playground')}>Playground</a>
				<a href="https://github.com/nocturnium/svelte-ide" target="_blank" rel="noopener"
					>GitHub ↗</a
				>
			</nav>
		</div>
		<div class="footer-base">
			<span>Built with Svelte 5</span>
			<span class="sep" aria-hidden="true">·</span>
			<span>MIT License</span>
			<span class="sep" aria-hidden="true">·</span>
			<span>© 2026 Nocturnium</span>
		</div>
	</footer>
</div>

<style>
	.landing {
		min-height: 100vh;
		background:
			radial-gradient(
				ellipse 80% 50% at 50% -10%,
				color-mix(in srgb, var(--ide-accent) 16%, transparent),
				transparent 70%
			),
			var(--ide-bg-primary);
		color: var(--ide-text-primary);
	}

	.skip-link {
		position: absolute;
		left: var(--ide-spacing-md);
		top: -3rem;
		z-index: var(--ide-z-tooltip);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-elevated);
		color: var(--ide-text-primary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		transition: top var(--ide-transition-fast);
		text-decoration: none;
	}
	.skip-link:focus-visible {
		top: var(--ide-spacing-md);
	}

	/* Top bar */
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ide-spacing-lg);
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--ide-spacing-lg) var(--ide-spacing-xl);
	}

	.brand {
		display: inline-flex;
		/* Center the mark + both wordmark spans on one axis (was baseline, which
		   sank the smaller "Svelte IDE" sub-label out of line with "Nocturnium"). */
		align-items: center;
		gap: var(--ide-spacing-sm);
		text-decoration: none;
		color: var(--ide-text-primary);
	}
	.brand-name {
		font-weight: 700;
		font-size: var(--ide-font-size-lg);
		letter-spacing: -0.01em;
		line-height: 1;
	}
	.brand-sub {
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-muted);
		line-height: 1;
	}

	.topnav {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-lg);
	}
	.topnav a {
		color: var(--ide-text-secondary);
		text-decoration: none;
		font-size: var(--ide-font-size-sm);
		font-weight: 500;
		transition: color var(--ide-transition-fast);
	}
	.topnav a:hover {
		color: var(--ide-text-primary);
	}
	.topnav a:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 3px;
		border-radius: var(--ide-radius-sm);
	}

	/* Hero */
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.28fr);
		gap: var(--ide-spacing-2xl);
		align-items: center;
		max-width: 1240px;
		margin: 0 auto;
		padding: var(--ide-spacing-3xl) var(--ide-spacing-xl) var(--ide-spacing-2xl);
	}

	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		margin-bottom: var(--ide-spacing-lg);
	}
	.eyebrow-text {
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-secondary);
		letter-spacing: 0.01em;
	}

	h1 {
		font-size: var(--ide-font-size-4xl);
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.03em;
		text-wrap: balance;
		margin: 0 0 var(--ide-spacing-md);
	}
	.grad {
		/* Keep BOTH words of the highlighted phrase vivid. The old terminal stop was
		   --ide-accent-strong (the warm flame tone), which landed the second word on a
		   muted grey-tan that read as dimmed/disabled. Run the phrase along the brand's
		   saturated aurora ramp instead (blue -> vivid blue -> aurora purple) with the
		   stops compressed inward so there's no low-saturation tail. The interactive
		   accent stays blue; only the headline flourish picks up the purple terminal. */
		background: linear-gradient(
			120deg,
			var(--ide-accent) 0%,
			var(--color-nocturnium-aurora-blue) 35%,
			var(--color-nocturnium-aurora-purple) 75%
		);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		color: transparent;
	}

	.lede {
		font-size: var(--ide-font-size-lg);
		line-height: var(--ide-line-height-relaxed);
		color: var(--ide-text-secondary);
		max-width: 34rem;
		margin: 0 0 var(--ide-spacing-xl);
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ide-spacing-md);
		margin-bottom: var(--ide-spacing-md);
	}

	.hero-tertiary {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		margin-bottom: var(--ide-spacing-2xl);
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-sm);
		font-weight: 500;
		text-decoration: none;
		transition: color var(--ide-transition-fast);
	}
	.hero-tertiary span {
		transition: transform var(--ide-transition-fast);
	}
	.hero-tertiary:hover {
		color: var(--ide-text-primary);
	}
	.hero-tertiary:hover span {
		transform: translateX(2px);
	}
	.hero-tertiary:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 3px;
		border-radius: var(--ide-radius-sm);
	}

	.hero-stats {
		display: grid;
		grid-template-columns: repeat(4, auto);
		gap: var(--ide-spacing-xl);
		margin: 0;
		padding-top: var(--ide-spacing-lg);
		border-top: 1px solid var(--ide-border);
	}
	.stat {
		margin: 0;
		/* Keep the repeat(2, 1fr) tracks truly equal on mobile so the wider
		   "Svelte 5" cell can't push the columns out of balance. */
		min-width: 0;
	}
	.stat-value {
		font-size: var(--ide-font-size-2xl);
		font-weight: 700;
		color: var(--ide-text-primary);
		line-height: 1.1;
	}
	.stat-label {
		margin: var(--ide-spacing-xs) 0 0;
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}

	/* Hero editor window */
	.hero-editor {
		position: relative;
	}
	.window {
		position: relative;
		z-index: 1;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-xl);
		overflow: hidden;
		background: var(--ide-bg-secondary);
		box-shadow: var(--ide-shadow-xl);
	}
	.window-bar {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-primary);
		border-bottom: 1px solid var(--ide-border);
	}
	.dot {
		width: 11px;
		height: 11px;
		border-radius: var(--ide-radius-full);
		flex-shrink: 0;
	}
	.dot--red {
		background: #ff5f57;
	}
	.dot--amber {
		background: var(--color-nocturnium-flame);
	}
	.dot--green {
		background: var(--color-nocturnium-aurora-green);
	}
	.window-title {
		margin-left: var(--ide-spacing-sm);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
		margin-right: auto;
	}
	.window-body {
		height: 420px;
		background: var(--ide-bg-primary);
	}

	/* Static syntax-highlighted paint shown before the live editor lazy-loads.
	   Scrolls horizontally rather than hard-clipping; a soft right-edge fade is
	   added at narrow widths (below) to signal there's more to scroll. */
	.hero-static {
		height: 100%;
		margin: 0;
		padding: var(--ide-spacing-md) var(--ide-spacing-lg);
		overflow: auto;
		background: var(--ide-bg-primary);
	}
	.hero-static code {
		display: block;
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-sm);
		line-height: var(--ide-line-height-relaxed);
		color: var(--ide-text-primary);
		white-space: pre;
		tab-size: 2;
	}

	.hero-editor-glow {
		position: absolute;
		inset: 8% 4% -12% 4%;
		z-index: 0;
		background: radial-gradient(
			ellipse at center,
			color-mix(in srgb, var(--ide-error) 42%, transparent),
			color-mix(in srgb, var(--color-nocturnium-flame) 24%, transparent) 46%,
			transparent 72%
		);
		filter: blur(56px);
		opacity: 0.72;
		pointer-events: none;
	}

	/* Sections */
	.section-head {
		text-align: center;
		max-width: 42rem;
		margin: 0 auto var(--ide-spacing-2xl);
	}
	.section-head h2 {
		font-size: var(--ide-font-size-3xl);
		font-weight: 700;
		letter-spacing: -0.02em;
		margin: 0 0 var(--ide-spacing-sm);
	}
	.section-head p {
		font-size: var(--ide-font-size-lg);
		color: var(--ide-text-secondary);
		margin: 0;
	}

	.features {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--ide-spacing-3xl) var(--ide-spacing-xl);
	}
	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: var(--ide-spacing-lg);
		/* Size each card to its own content rather than the row's tallest card.
		   Equalizing heights (the grid default align-items: stretch) sank the
		   title/body of shorter-copy cards toward the bottom, opening a dead gap
		   below the top-pinned icon and breaking the icon-to-heading rhythm. With
		   start alignment the icon's margin-bottom is the single source of that
		   spacing, so it's exactly --ide-spacing-md on every card. */
		align-items: start;
	}
	.feature-card {
		padding: var(--ide-spacing-xl);
		background: color-mix(in srgb, var(--ide-bg-secondary) 70%, transparent);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-xl);
		transition:
			border-color var(--ide-transition-normal),
			transform var(--ide-transition-normal),
			background var(--ide-transition-normal);
	}
	.feature-card:hover {
		border-color: color-mix(in srgb, var(--ide-accent) 60%, var(--ide-border));
		background: var(--ide-bg-secondary);
		transform: translateY(-3px);
	}
	.feature-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--ide-radius-lg);
		background: color-mix(in srgb, var(--ide-accent) 14%, transparent);
		color: var(--ide-accent);
		font-size: var(--ide-font-size-xl);
		margin-bottom: var(--ide-spacing-md);
	}
	.feature-card h3 {
		font-size: var(--ide-font-size-lg);
		font-weight: 600;
		margin: 0 0 var(--ide-spacing-sm);
	}
	.feature-card p {
		font-size: var(--ide-font-size-sm);
		line-height: var(--ide-line-height-relaxed);
		color: var(--ide-text-secondary);
		margin: 0;
	}

	/* Quick start */
	.quickstart {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--ide-spacing-2xl) var(--ide-spacing-xl) var(--ide-spacing-3xl);
	}
	.code-panel {
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-xl);
		overflow: hidden;
		background: var(--ide-bg-secondary);
		box-shadow: var(--ide-shadow-lg);
	}
	.code-tabbar {
		display: flex;
		align-items: stretch;
		justify-content: space-between;
		gap: var(--ide-spacing-sm);
		background: var(--ide-bg-primary);
		border-bottom: 1px solid var(--ide-border);
	}
	.code-tabs {
		display: flex;
	}
	.code-copy {
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		margin: var(--ide-spacing-xs) var(--ide-spacing-sm);
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--ide-radius-sm);
		cursor: pointer;
		transition:
			color var(--ide-transition-fast),
			background var(--ide-transition-fast),
			border-color var(--ide-transition-fast);
	}
	.code-copy:hover {
		color: var(--ide-text-primary);
		background: var(--ide-bg-hover);
		border-color: var(--ide-border);
	}
	.code-copy:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}
	.code-panelbody:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: -2px;
	}
	.code-tab {
		padding: var(--ide-spacing-sm) var(--ide-spacing-lg);
		font-size: var(--ide-font-size-sm);
		font-family: var(--ide-font-sans);
		color: var(--ide-text-muted);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: color var(--ide-transition-fast);
	}
	.code-tab:hover {
		color: var(--ide-text-secondary);
	}
	.code-tab.active {
		color: var(--ide-text-primary);
		border-bottom-color: var(--ide-accent);
	}
	.code-tab:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: -2px;
	}
	.code-block {
		margin: 0;
		padding: var(--ide-spacing-lg);
		overflow-x: auto;
		background: var(--ide-bg-primary);
	}
	.code-block code {
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-sm);
		line-height: var(--ide-line-height-relaxed);
		color: var(--ide-text-primary);
		white-space: pre;
		tab-size: 2;
	}
	.quickstart-cta {
		display: flex;
		justify-content: center;
		margin-top: var(--ide-spacing-xl);
	}

	/* Footer */
	.footer {
		border-top: 1px solid var(--ide-border);
		background: color-mix(in srgb, var(--ide-bg-secondary) 50%, transparent);
	}
	.footer-grid {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--ide-spacing-xl);
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--ide-spacing-2xl) var(--ide-spacing-xl) var(--ide-spacing-lg);
	}
	.footer-brand {
		display: flex;
		align-items: flex-start;
		gap: var(--ide-spacing-md);
	}
	.footer-brand strong {
		display: block;
		font-size: var(--ide-font-size-base);
	}
	.footer-brand p {
		margin: var(--ide-spacing-xs) 0 0;
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-muted);
		max-width: 24rem;
	}
	.footer-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ide-spacing-lg);
		align-items: center;
	}
	.footer-links a {
		color: var(--ide-text-secondary);
		text-decoration: none;
		font-size: var(--ide-font-size-sm);
		transition: color var(--ide-transition-fast);
	}
	.footer-links a:hover {
		color: var(--ide-text-primary);
	}
	.footer-links a:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 3px;
		border-radius: var(--ide-radius-sm);
	}
	.footer-base {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--ide-spacing-sm);
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--ide-spacing-md) var(--ide-spacing-xl) var(--ide-spacing-xl);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}
	.sep {
		opacity: 0.4;
	}

	/* Responsive */
	@media (max-width: 900px) {
		.hero {
			grid-template-columns: 1fr;
			gap: var(--ide-spacing-2xl);
			padding-top: var(--ide-spacing-2xl);
		}
		.lede {
			max-width: none;
		}
		.window-body {
			height: 340px;
		}
	}

	@media (max-width: 640px) {
		/* Give the brand lockup and nav links room to breathe instead of jamming
		   against the viewport edges: tighten the side padding and drop the
		   "Svelte IDE" sub-label so the nav isn't fighting it for horizontal space. */
		.topbar {
			padding: var(--ide-spacing-lg) var(--ide-spacing-md);
		}
		.brand-sub {
			display: none;
		}
		.topnav {
			gap: var(--ide-spacing-md);
		}
		/* Keep primary nav reachable on phones: "Demos" + "GitHub" stay visible,
		   only the secondary "Editor" shortcut collapses (it's the hero CTA anyway). */
		.topnav-secondary {
			display: none;
		}
		/* Fluid headline so it scales down and breaks evenly instead of stranding
		   "5." (and the gradient word) on its own line. */
		h1 {
			font-size: clamp(2rem, 9vw, var(--ide-font-size-4xl));
		}
		.hero-stats {
			grid-template-columns: repeat(2, 1fr);
			gap: var(--ide-spacing-lg);
		}
		.feature-grid {
			grid-template-columns: 1fr;
		}
		.footer-grid {
			flex-direction: column;
		}
		/* Drop the mono one step on phones so the hero sample and quick-start code
		   fit with less horizontal scrolling. */
		.hero-static code,
		.code-block code {
			font-size: var(--ide-font-size-xs);
		}
		/* Soft-wrap the static hero paint on phones so long lines fold at whitespace
		   rather than getting clipped mid-token (which can read as truncated). Once
		   wrapped it no longer scrolls horizontally, so it skips the fade mask below. */
		.hero-static code {
			white-space: pre-wrap;
		}
		/* Soft right-edge fade as a scroll affordance where the quick-start code
		   still overflows horizontally. */
		.code-block {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
		}
		/* Same scroll affordance for the live hero editor: fade the right edge so a
		   long line reads as scrollable rather than hard-clipped mid-token. */
		.window-body {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent);
		}
	}
</style>
