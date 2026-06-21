<script lang="ts">
	/**
	 * Read-only highlighted code block for the language gallery. Highlighted by the
	 * library's own tokenizer — pure + SSR-safe, so each card prerenders to real
	 * highlighted HTML (good for crawlers and instant first paint, no hydration wait).
	 */
	import { tokenize } from '$components/editor/tokenizer';
	import TokenRenderer from '$components/editor/TokenRenderer.svelte';

	interface Props {
		code: string;
		language: string;
	}
	let { code, language }: Props = $props();

	const lines = $derived(tokenize(code.replace(/\n+$/, ''), language));
</script>

<!-- Focusable so keyboard users can scroll a snippet that overflows horizontally. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<pre class="snippet" tabindex="0" role="group" aria-label="{language} code sample"><code
		>{#each lines as line, i (i)}<span class="snippet__line"><TokenRenderer tokens={line} /></span
			>{/each}</code
	></pre>

<style>
	.snippet {
		margin: 0;
		padding: var(--ide-spacing-md, 14px) var(--ide-spacing-lg, 18px);
		overflow-x: auto;
		font-family: var(--ide-font-mono, ui-monospace, monospace);
		font-size: 12.5px;
		line-height: 1.6;
		color: var(--ide-text-primary, #e8eefc);
		background: var(--ide-bg-primary, #0d1421);
		tab-size: 2;
	}
	.snippet code {
		font-family: inherit;
	}
	.snippet__line {
		display: block;
		min-height: 1.6em;
		white-space: pre;
	}
</style>
