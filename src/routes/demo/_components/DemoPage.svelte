<script lang="ts">
	/**
	 * DemoPage — the shared template every prose/demo route renders inside.
	 *
	 * Owns the one canonical page head (left-aligned eyebrow → H1 → description) so
	 * sibling demos can't drift in alignment or depth, and sets the document
	 * `<title>` declaratively (on load, not after interaction). Full-bleed app-shell
	 * routes (the editor / playground) do NOT use this — they render their own chrome.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		/** Small uppercase kicker above the title. */
		eyebrow?: string;
		/** Page H1 (also the default document title base). */
		title: string;
		/** One-line description under the title. */
		description?: string;
		/** Document `<title>` base, when it should differ from the H1. */
		docTitle?: string;
		/** Optional header-right slot (badges, links). */
		actions?: Snippet;
		/** Page body. */
		children: Snippet;
	}

	let { eyebrow, title, description, docTitle, actions, children }: Props = $props();
</script>

<svelte:head>
	<title>{docTitle ?? title} | Nocturnium Svelte IDE</title>
</svelte:head>

<div class="demo-page">
	<header class="demo-page__head">
		<div class="demo-page__heading">
			{#if eyebrow}<p class="demo-page__eyebrow">{eyebrow}</p>{/if}
			<h1 class="demo-page__title">{title}</h1>
			{#if description}<p class="demo-page__desc">{description}</p>{/if}
		</div>
		{#if actions}
			<div class="demo-page__actions">{@render actions()}</div>
		{/if}
	</header>

	<div class="demo-page__body">
		{@render children()}
	</div>
</div>

<style>
	.demo-page {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-2xl);
		width: 100%;
	}

	.demo-page__head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--ide-spacing-lg);
		flex-wrap: wrap;
	}
	.demo-page__heading {
		display: grid;
		gap: var(--ide-spacing-sm);
	}

	.demo-page__eyebrow {
		margin: 0;
		color: var(--ide-accent);
		font-size: var(--ide-font-size-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.demo-page__title {
		margin: 0;
		color: var(--ide-text-primary);
		font-size: var(--ide-font-size-3xl);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.demo-page__desc {
		margin: 0;
		max-width: 46rem;
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-lg);
		line-height: var(--ide-line-height-relaxed);
	}

	.demo-page__actions {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
	}

	.demo-page__body {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-2xl);
	}
</style>
