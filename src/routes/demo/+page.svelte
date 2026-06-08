<script lang="ts">
	import { base } from '$app/paths';
	import Badge from '$lib/components/core/Badge.svelte';
	import Icon from '$lib/components/core/Icon.svelte';
	import { tokenize, tokensToHTML } from '$lib/components/editor/tokenizer';

	type Demo = {
		title: string;
		description: string;
		href: string;
		icon: string;
		tag: string;
		featured?: boolean;
	};

	const featured: Demo = {
		title: 'Code Editor',
		description:
			'The flagship demo — a real mini-IDE with a language switcher, sample files, and live feature toggles for folding and multi-cursor.',
		href: '/demo/editor',
		icon: '✎',
		tag: 'Flagship',
		featured: true
	};

	// Each group gets a distinct accent so the taxonomy reads at a glance:
	// Core = wave/blue, Intelligence = aurora-purple, Collaboration & AI = ember.
	const groups: { title: string; accent: string; demos: Demo[] }[] = [
		{
			title: 'Core',
			accent: 'var(--color-nocturnium-wave)',
			demos: [
				{
					title: 'Code Folding',
					description: 'Collapse and expand blocks with bracket and indentation detection.',
					href: '/demo/folding',
					icon: '⊟',
					tag: 'Editor'
				},
				{
					title: 'Components',
					description: 'Buttons, inputs, badges, tooltips and the rest of the UI kit.',
					href: '/demo/components',
					icon: '▢',
					tag: 'UI'
				},
				{
					title: 'Resizable Panes',
					description: 'Smooth resize handles with ghost preview and content fade.',
					href: '/demo/resize',
					icon: '⇔',
					tag: 'Layout'
				},
				{
					title: 'Playground',
					description: 'An interactive sandbox combining every feature into one IDE.',
					href: '/demo/playground',
					icon: '▶',
					tag: 'Full Demo'
				}
			]
		},
		{
			title: 'Intelligence',
			accent: 'var(--color-nocturnium-aurora-purple)',
			demos: [
				{
					title: 'Editor Intelligence',
					description: 'Hovers, completions, and inline signals layered onto the editor.',
					href: '/demo/editor-intelligence',
					icon: '◈',
					tag: 'LSP'
				},
				{
					title: 'Semantic Features',
					description: 'Symbol-aware folding presets and structural navigation.',
					href: '/demo/semantic-features',
					icon: '◇',
					tag: 'Semantic'
				},
				{
					title: 'Cognitive Load',
					description: 'Complexity highlighting that surfaces dense, risky regions.',
					href: '/demo/cognitive-load',
					icon: '◐',
					tag: 'Insight'
				},
				{
					title: 'DevX Features',
					description: 'Command palette, keybindings, and developer-experience polish.',
					href: '/demo/devx-features',
					icon: '♦',
					tag: 'DevX'
				}
			]
		},
		{
			title: 'Collaboration & AI',
			accent: 'var(--color-nocturnium-ember)',
			demos: [
				{
					title: 'AI Panel',
					description: 'Conversational assistant with streaming, tool calls, and edit previews.',
					href: '/demo/ai',
					icon: '◆',
					tag: 'AI'
				},
				{
					title: 'Collaboration',
					description: 'Real-time CRDT editing on Yjs with live cursors and presence.',
					href: '/demo/collaboration',
					icon: '⚇',
					tag: 'CRDT'
				},
				{
					title: 'Plugins',
					description: 'Extensible architecture with proposal-based plugin management.',
					href: '/demo/plugins',
					icon: '⚡',
					tag: 'Plugins'
				},
				{
					title: 'Power Features',
					description: 'Advanced workflows that stitch the primitives together.',
					href: '/demo/power-features',
					icon: '⚙',
					tag: 'Advanced'
				}
			]
		}
	];

	const quickStart = `// Import a component + the theme (required for styling)
import { CustomEditor } from '@nocturnium/svelte-ide';
import '@nocturnium/svelte-ide/theme.css';

// Stores & collaboration via subpath entries
import { toggleLeftSidebar } from '@nocturnium/svelte-ide/stores';
import { CollaborativeDocument } from '@nocturnium/svelte-ide/crdt';`;

	// Render a snippet to highlighted HTML using the library tokenizer — same token
	// classes (and palette) as the landing page and the live editor. Lines are
	// tokenized independently then joined so multi-line state carries line-to-line.
	function highlightToHTML(source: string, language: string): string {
		return tokenize(source, language)
			.map((line) => tokensToHTML(line.tokens))
			.join('\n');
	}

	const quickStartHTML = highlightToHTML(quickStart, 'typescript');

	// Clipboard copy for the quick-start snippet (mirrors the landing page's pattern).
	let copied = $state(false);
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyQuickStart() {
		try {
			await navigator.clipboard.writeText(quickStart);
			copied = true;
			clearTimeout(copyResetTimer);
			copyResetTimer = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}
</script>

<div class="demo-hub">
	<header class="hub-hero">
		<Badge variant="info">Demo gallery</Badge>
		<h1>Explore the library</h1>
		<p class="hub-lede">
			Every surface of <strong>@nocturnium/svelte-ide</strong> — from the editor core to AI and
			real-time collaboration. Pick a demo to see it running.
		</p>
	</header>

	<!-- Featured flagship -->
	<a class="demo-card demo-card--featured" href={`${base}${featured.href}`}>
		<div class="card-head">
			<span class="card-icon card-icon--featured" aria-hidden="true">{featured.icon}</span>
			<span class="demo-tag demo-tag--featured">{featured.tag}</span>
		</div>
		<h2>{featured.title}</h2>
		<p>{featured.description}</p>
		<span class="card-link card-link--featured">Open the flagship demo →</span>
	</a>

	{#each groups as group (group.title)}
		<section
			class="hub-group"
			style={`--group-accent: ${group.accent};`}
			aria-labelledby={`group-${group.title}`}
		>
			<h2 id={`group-${group.title}`} class="group-title">{group.title}</h2>
			<div class="card-grid">
				{#each group.demos as demo (demo.href)}
					<a class="demo-card demo-card--grouped" href={`${base}${demo.href}`}>
						<div class="card-head">
							<span class="card-icon" aria-hidden="true">{demo.icon}</span>
							<span class="demo-tag">{demo.tag}</span>
						</div>
						<h3>{demo.title}</h3>
						<p>{demo.description}</p>
						<span class="card-link">View demo →</span>
					</a>
				{/each}
			</div>
		</section>
	{/each}

	<section class="hub-quickstart" aria-labelledby="hub-qs-title">
		<h2 id="hub-qs-title" class="group-title">Quick start</h2>
		<div class="code-panel">
			<div class="code-bar">
				<span class="dot dot--red" aria-hidden="true"></span>
				<span class="dot dot--amber" aria-hidden="true"></span>
				<span class="dot dot--green" aria-hidden="true"></span>
				<span class="code-file">app.ts</span>
				<button
					class="code-copy"
					type="button"
					onclick={copyQuickStart}
					aria-label="Copy quick start snippet to clipboard"
				>
					{#if copied}
						<Icon name="check" size={14} />
						<span>Copied!</span>
					{:else}
						<Icon name="copy" size={14} />
						<span>Copy</span>
					{/if}
				</button>
			</div>
			<!-- Syntax-highlighted via the library tokenizer (same token classes as the
			     landing page). Read-only HTML — far lighter than mounting a live editor. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<pre class="code-block"><code>{@html quickStartHTML}</code></pre>
		</div>
	</section>
</div>

<style>
	.demo-hub {
		padding: var(--ide-spacing-2xl) var(--ide-spacing-2xl) var(--ide-spacing-3xl);
		max-width: 1100px;
		margin: 0 auto;
	}

	.hub-hero {
		margin-bottom: var(--ide-spacing-2xl);
	}
	.hub-hero h1 {
		font-size: var(--ide-font-size-3xl);
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: var(--ide-spacing-md) 0 var(--ide-spacing-sm);
		color: var(--ide-text-primary);
	}
	.hub-lede {
		font-size: var(--ide-font-size-lg);
		line-height: var(--ide-line-height-relaxed);
		color: var(--ide-text-secondary);
		max-width: 44rem;
		margin: 0;
	}
	.hub-lede strong {
		color: var(--ide-text-primary);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-base);
	}

	/* Cards */
	.demo-card {
		display: flex;
		flex-direction: column;
		padding: var(--ide-spacing-lg);
		background: color-mix(in srgb, var(--ide-bg-secondary) 70%, transparent);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-xl);
		text-decoration: none;
		color: var(--ide-text-primary);
		transition:
			border-color var(--ide-transition-normal),
			transform var(--ide-transition-normal),
			background var(--ide-transition-normal);
	}
	.demo-card:hover {
		border-color: color-mix(in srgb, var(--ide-accent) 60%, var(--ide-border));
		background: var(--ide-bg-secondary);
		transform: translateY(-3px);
	}
	.demo-card:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 3px;
	}

	/* Grid cards inherit their group's accent for hover + icon + tag. */
	.demo-card--grouped:hover {
		border-color: color-mix(in srgb, var(--group-accent) 60%, var(--ide-border));
	}

	/* Featured flagship: gradient accent border + inner glow so the eye lands
	   here first and it reads as distinctly more important than the grid. */
	.demo-card--featured {
		position: relative;
		margin-bottom: var(--ide-spacing-2xl);
		padding: var(--ide-spacing-xl);
		background:
			radial-gradient(
				ellipse 80% 130% at 100% 0%,
				color-mix(in srgb, var(--ide-accent) 26%, transparent),
				transparent 62%
			),
			var(--ide-bg-secondary);
		/* Gradient border via two-layer background-origin trick keeps it token-driven. */
		border: 1px solid transparent;
		background-clip: padding-box;
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--ide-accent) 28%, transparent),
			inset 0 0 48px color-mix(in srgb, var(--ide-accent) 12%, transparent),
			0 8px 30px color-mix(in srgb, var(--ide-accent) 18%, transparent);
	}
	.demo-card--featured::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--ide-accent) 85%, transparent),
			color-mix(in srgb, var(--ide-accent-strong) 60%, transparent) 55%,
			color-mix(in srgb, var(--ide-accent) 30%, transparent)
		);
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
	}
	.demo-card--featured:hover {
		transform: translateY(-4px);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--ide-accent) 34%, transparent),
			inset 0 0 56px color-mix(in srgb, var(--ide-accent) 16%, transparent),
			0 14px 40px color-mix(in srgb, var(--ide-accent) 26%, transparent);
	}
	.demo-card--featured h2 {
		font-size: var(--ide-font-size-2xl);
		font-weight: 700;
		margin: 0 0 var(--ide-spacing-sm);
	}
	.demo-card--featured p {
		max-width: 46rem;
	}

	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--ide-spacing-md);
	}
	.card-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--ide-radius-lg);
		background: color-mix(in srgb, var(--group-accent, var(--ide-accent)) 14%, transparent);
		color: var(--group-accent, var(--ide-accent));
		font-size: var(--ide-font-size-lg);
	}
	.card-icon--featured {
		width: 3rem;
		height: 3rem;
		font-size: var(--ide-font-size-xl);
		background: color-mix(in srgb, var(--ide-accent) 20%, transparent);
		color: var(--ide-accent);
		box-shadow: 0 0 18px color-mix(in srgb, var(--ide-accent) 35%, transparent);
	}

	/* Color-coded taxonomy chips: each group's accent comes from --group-accent. */
	.demo-tag {
		display: inline-flex;
		align-items: center;
		padding: 2px var(--ide-spacing-sm);
		border-radius: var(--ide-radius-full);
		background: color-mix(in srgb, var(--group-accent, var(--ide-accent)) 18%, transparent);
		color: var(--group-accent, var(--ide-accent));
		border: 1px solid color-mix(in srgb, var(--group-accent, var(--ide-accent)) 30%, transparent);
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-xs);
		font-weight: 600;
		letter-spacing: 0.01em;
		white-space: nowrap;
	}
	.demo-tag--featured {
		background: color-mix(in srgb, var(--ide-accent-strong) 22%, transparent);
		color: var(--ide-accent-strong);
		border-color: color-mix(in srgb, var(--ide-accent-strong) 40%, transparent);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.demo-card h3 {
		font-size: var(--ide-font-size-lg);
		font-weight: 600;
		margin: 0 0 var(--ide-spacing-xs);
	}
	.demo-card p {
		font-size: var(--ide-font-size-sm);
		line-height: var(--ide-line-height-relaxed);
		color: var(--ide-text-secondary);
		margin: 0;
		flex: 1;
	}
	.card-link {
		margin-top: var(--ide-spacing-md);
		font-size: var(--ide-font-size-sm);
		font-weight: 500;
		color: var(--group-accent, var(--ide-accent));
	}
	.card-link--featured {
		font-weight: 600;
		color: var(--ide-accent-strong);
	}

	/* Groups */
	.hub-group {
		margin-bottom: var(--ide-spacing-2xl);
	}
	.group-title {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		font-size: var(--ide-font-size-xl);
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--ide-text-primary);
		margin: 0 0 var(--ide-spacing-lg);
		padding-bottom: var(--ide-spacing-sm);
		border-bottom: 1px solid var(--ide-border);
	}
	/* Accent marker ties each section heading to its group color. */
	.group-title::before {
		content: '';
		width: 3px;
		height: 0.9em;
		align-self: center;
		border-radius: var(--ide-radius-full);
		background: var(--group-accent, var(--ide-accent));
	}
	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--ide-spacing-lg);
	}

	/* Quick start */
	.hub-quickstart {
		margin-top: var(--ide-spacing-2xl);
	}
	.code-panel {
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-xl);
		overflow: hidden;
		background: var(--ide-bg-secondary);
		box-shadow: var(--ide-shadow-md);
	}
	.code-bar {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-primary);
		border-bottom: 1px solid var(--ide-border);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: var(--ide-radius-full);
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
	.code-file {
		margin-left: var(--ide-spacing-sm);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}
	/* Copy button pinned to the right edge of the code bar (mirrors the landing page). */
	.code-copy {
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		margin-left: auto;
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

	/* Token colors for tokenizer-rendered HTML in the quick-start block. Mirrors the
	   landing page's palette (and the live CustomEditor) so highlighting reads the
	   same across surfaces. Scoped under .demo-hub so they don't leak app-wide. */
	.demo-hub :global(.token-comment),
	.demo-hub :global(.token-comment-line),
	.demo-hub :global(.token-comment-block),
	.demo-hub :global(.token-comment-doc) {
		color: var(--ide-text-muted);
		font-style: italic;
	}
	.demo-hub :global(.token-string),
	.demo-hub :global(.token-string-template) {
		color: var(--color-nocturnium-aurora-green);
	}
	.demo-hub :global(.token-string-regex) {
		color: var(--color-nocturnium-aurora-pink);
	}
	.demo-hub :global(.token-string-escape) {
		color: var(--color-nocturnium-aurora-yellow);
	}
	.demo-hub :global(.token-number),
	.demo-hub :global(.token-number-integer),
	.demo-hub :global(.token-number-float),
	.demo-hub :global(.token-number-hex),
	.demo-hub :global(.token-number-binary) {
		color: var(--color-nocturnium-aurora-yellow);
	}
	.demo-hub :global(.token-keyword),
	.demo-hub :global(.token-keyword-control),
	.demo-hub :global(.token-keyword-operator),
	.demo-hub :global(.token-keyword-definition),
	.demo-hub :global(.token-keyword-module),
	.demo-hub :global(.token-keyword-storage) {
		color: var(--color-nocturnium-aurora-purple);
	}
	.demo-hub :global(.token-operator),
	.demo-hub :global(.token-operator-arithmetic),
	.demo-hub :global(.token-operator-comparison),
	.demo-hub :global(.token-operator-logical),
	.demo-hub :global(.token-operator-assignment),
	.demo-hub :global(.token-variable) {
		color: var(--ide-text-primary);
	}
	.demo-hub :global(.token-variable-definition) {
		color: var(--color-nocturnium-wave);
	}
	.demo-hub :global(.token-variable-parameter) {
		color: color-mix(in srgb, var(--color-nocturnium-wave) 80%, var(--ide-text-muted));
	}
	.demo-hub :global(.token-function),
	.demo-hub :global(.token-function-definition),
	.demo-hub :global(.token-function-call) {
		color: var(--color-nocturnium-aurora-blue);
	}
	.demo-hub :global(.token-property),
	.demo-hub :global(.token-property-definition) {
		color: var(--color-nocturnium-wave);
	}
	.demo-hub :global(.token-type),
	.demo-hub :global(.token-type-class),
	.demo-hub :global(.token-type-interface),
	.demo-hub :global(.token-type-namespace),
	.demo-hub :global(.token-type-builtin) {
		color: var(--color-nocturnium-teal);
	}
	.demo-hub :global(.token-constant),
	.demo-hub :global(.token-constant-boolean),
	.demo-hub :global(.token-constant-null),
	.demo-hub :global(.token-constant-builtin) {
		color: var(--color-nocturnium-aurora-yellow);
	}
	.demo-hub :global(.token-punctuation),
	.demo-hub :global(.token-punctuation-bracket),
	.demo-hub :global(.token-punctuation-paren),
	.demo-hub :global(.token-punctuation-separator),
	.demo-hub :global(.token-punctuation-accessor) {
		color: var(--ide-text-secondary);
	}
	.demo-hub :global(.token-punctuation-brace) {
		color: var(--color-nocturnium-aurora-yellow);
		font-weight: 600;
	}
	.demo-hub :global(.token-tag),
	.demo-hub :global(.token-tag-name) {
		color: var(--color-nocturnium-aurora-pink);
	}
	.demo-hub :global(.token-tag-attribute) {
		color: var(--color-nocturnium-aurora-yellow);
	}
	.demo-hub :global(.token-tag-attribute-value) {
		color: var(--color-nocturnium-aurora-green);
	}
	.demo-hub :global(.token-tag-punctuation) {
		color: var(--ide-text-secondary);
	}

	@media (max-width: 640px) {
		.demo-hub {
			padding: var(--ide-spacing-xl) var(--ide-spacing-lg) var(--ide-spacing-2xl);
		}
		.card-grid {
			grid-template-columns: 1fr;
		}
		/* Tighten the flagship card on phones: less padding and a softer inner glow so
		   the top of the page is lighter and the CTA sits closer to the fold. */
		.demo-card--featured {
			padding: var(--ide-spacing-lg);
			box-shadow:
				inset 0 1px 0 color-mix(in srgb, var(--ide-accent) 28%, transparent),
				inset 0 0 24px color-mix(in srgb, var(--ide-accent) 10%, transparent),
				0 8px 30px color-mix(in srgb, var(--ide-accent) 18%, transparent);
		}
		/* Wider gaps between the three taxonomies so the groups stay scannable through
		   the long single-column scroll. */
		.hub-group {
			margin-bottom: var(--ide-spacing-3xl);
		}
		/* Drop the mono one step and add a soft right-edge fade as a scroll affordance
		   where long import lines still overflow (mirrors the landing page). */
		.code-block code {
			font-size: var(--ide-font-size-xs);
		}
		.code-block {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
		}
	}
</style>
