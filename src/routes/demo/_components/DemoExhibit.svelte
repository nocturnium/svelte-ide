<script module lang="ts">
	// Per-instance counter so multiple exhibits on one page get unique element
	// ids (the ARIA tab/panel relationships require document-unique ids).
	let exhibitCount = 0;
</script>

<script lang="ts">
	/**
	 * DemoExhibit — a live demo paired with the exact source that produces it.
	 *
	 * A [ Preview | Code ] tab toggle: the Preview face renders the live `children`
	 * (the demo itself); the Code face shows `code` highlighted by the library's own
	 * tokenizer — the docs eat their own dog food. Pass each demo's own
	 * `Example.svelte?raw` as `code` and `<Example />` as the children, so the shown
	 * source IS the executed source and can never drift.
	 *
	 * The tablist mirrors the landing-page quick-start (WAI-ARIA tabs + roving
	 * tabindex); copy-to-clipboard mirrors AIMessageContent.
	 */
	import { tokenize } from '$components/editor/tokenizer';
	import TokenRenderer from '$components/editor/TokenRenderer.svelte';
	import Icon from '$components/core/Icon.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Source shown in the Code tab — pass the demo's own `Example.svelte?raw`. */
		code: string;
		/** Tokenizer language for the Code tab (defaults to svelte). */
		language?: string;
		/** Optional filename label shown in the window bar. */
		filename?: string;
		/**
		 * Pad the preview pane. Editor-style previews that should fill the window
		 * edge-to-edge (their own frame supplies the height) pass `false`.
		 */
		padded?: boolean;
		/** The live demo. */
		children: Snippet;
	}

	let { code, language = 'svelte', filename, padded = true, children }: Props = $props();

	const TABS = [
		{ id: 'preview', label: 'Preview' },
		{ id: 'code', label: 'Code' }
	] as const;
	type TabId = (typeof TABS)[number]['id'];

	// Document-unique id prefix for this exhibit's tab/panel pairs.
	const uid = `dx${(exhibitCount += 1)}`;

	let view = $state<TabId>('preview');

	// Strip a trailing newline so the Code tab has no dangling blank last line.
	const source = $derived(code.replace(/\n+$/, ''));
	const lines = $derived(tokenize(source, language));

	// Roving-tabindex arrow-key navigation (WAI-ARIA tabs pattern), matching the
	// landing-page quick-start tabs.
	let tabButtons = $state<Record<TabId, HTMLButtonElement | null>>({
		preview: null,
		code: null
	});

	function onTabKeydown(event: KeyboardEvent, index: number) {
		const last = TABS.length - 1;
		let next = index;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
			next = index === last ? 0 : index + 1;
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
			next = index === 0 ? last : index - 1;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = last;
		else return;

		event.preventDefault();
		const target = TABS[next];
		view = target.id;
		tabButtons[target.id]?.focus();
	}

	// Clipboard copy (mirrors AIMessageContent / landing quick-start).
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	// Legacy fallback for contexts where the async Clipboard API is unavailable or
	// permission-blocked (older browsers, some sandboxed/automated contexts).
	function legacyCopy(text: string): boolean {
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.top = '-9999px';
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}

	async function copySource() {
		// Acknowledge the click immediately so the user always gets feedback; the
		// write itself is best-effort (a real secure-context browser always
		// succeeds, but the async Clipboard API can be permission-blocked in
		// sandboxed/automated contexts, in which case we try the legacy path).
		copied = true;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 2000);

		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(source);
				return;
			}
		} catch {
			// Fall through to the legacy path.
		}
		legacyCopy(source);
	}
</script>

<div class="exhibit">
	<div class="exhibit__bar">
		<div class="exhibit__tabs" role="tablist" aria-label="Demo view">
			{#each TABS as tab, i (tab.id)}
				<button
					class="exhibit__tab"
					class:active={view === tab.id}
					role="tab"
					id={`${uid}-tab-${tab.id}`}
					aria-selected={view === tab.id}
					aria-controls={`${uid}-panel-${tab.id}`}
					tabindex={view === tab.id ? 0 : -1}
					bind:this={tabButtons[tab.id]}
					onclick={() => (view = tab.id)}
					onkeydown={(e) => onTabKeydown(e, i)}
				>
					{tab.label}
				</button>
			{/each}
		</div>
		{#if filename}<span class="exhibit__file">{filename}</span>{/if}
		<button
			class="exhibit__copy"
			type="button"
			onclick={copySource}
			aria-label="Copy source to clipboard"
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

	<div
		class="exhibit__preview"
		class:exhibit__preview--padded={padded}
		role="tabpanel"
		id={`${uid}-panel-preview`}
		aria-labelledby={`${uid}-tab-preview`}
		hidden={view !== 'preview'}
	>
		{@render children()}
	</div>

	<div
		class="exhibit__codepanel"
		role="tabpanel"
		id={`${uid}-panel-code`}
		aria-labelledby={`${uid}-tab-code`}
		hidden={view !== 'code'}
		tabindex="0"
	>
		<pre class="exhibit__code"><code
				>{#each lines as line, i (i)}<span class="exhibit__line"
						><TokenRenderer tokens={line} /></span
					>{/each}</code
			></pre>
	</div>
</div>

<style>
	.exhibit {
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-xl);
		overflow: hidden;
		background: var(--ide-bg-secondary);
		box-shadow: var(--ide-shadow-lg);
	}

	/* Window bar: [ Preview | Code ] tabs left, optional filename, copy right. */
	.exhibit__bar {
		display: flex;
		align-items: stretch;
		gap: var(--ide-spacing-sm);
		background: var(--ide-bg-primary);
		border-bottom: 1px solid var(--ide-border);
	}
	.exhibit__tabs {
		display: flex;
	}
	.exhibit__tab {
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
	.exhibit__tab:hover {
		color: var(--ide-text-secondary);
	}
	.exhibit__tab.active {
		color: var(--ide-text-primary);
		border-bottom-color: var(--ide-accent);
	}
	.exhibit__tab:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: -2px;
	}

	.exhibit__file {
		display: inline-flex;
		align-items: center;
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}

	.exhibit__copy {
		display: inline-flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		margin-left: auto;
		margin-block: var(--ide-spacing-xs);
		margin-right: var(--ide-spacing-sm);
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
	.exhibit__copy:hover {
		color: var(--ide-text-primary);
		background: var(--ide-bg-hover);
		border-color: var(--ide-border);
	}
	.exhibit__copy:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	/* Preview face */
	.exhibit__preview {
		background: var(--ide-bg-primary);
	}
	.exhibit__preview--padded {
		padding: var(--ide-spacing-lg);
	}

	/* Code face */
	.exhibit__codepanel {
		background: var(--ide-bg-primary);
	}
	.exhibit__codepanel:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: -2px;
	}
	.exhibit__code {
		margin: 0;
		padding: var(--ide-spacing-lg);
		max-height: 32rem;
		overflow: auto;
		background: var(--ide-bg-primary);
	}
	.exhibit__code code {
		display: block;
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-sm);
		line-height: var(--ide-line-height-relaxed);
		color: var(--ide-text-primary);
		white-space: pre;
		tab-size: 2;
	}
	.exhibit__line {
		display: block;
		min-height: 1lh;
	}

	@media (max-width: 640px) {
		.exhibit__code code {
			font-size: var(--ide-font-size-xs);
		}
		/* Soft right-edge fade as a scroll affordance where code overflows. */
		.exhibit__code {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent);
		}
	}
</style>
