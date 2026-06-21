<script lang="ts" generics="T extends Record<string, unknown>">
	/**
	 * Live-editable props playground. The visitor edits a JSON props object in the
	 * library's OWN editor (dogfooding) and the preview re-renders instantly. We edit
	 * *props*, not arbitrary source — there's no in-browser Svelte compiler — so the
	 * input is strict JSON (parsed with JSON.parse, never eval'd) and the last VALID
	 * value keeps rendering while you mistype.
	 *
	 * SCOPE — only for components whose props are JSON-serializable primitives/enums
	 * (variant/size, booleans, strings, plain labels). Do NOT wire this onto
	 * components with event handlers, snippet/function props, or `bind:value`: JSON
	 * can't express those, so the playground would render a control that silently
	 * lies about the real API. Those need a real controls schema, not this.
	 */
	import { browser } from '$app/environment';
	import { untrack, type Snippet } from 'svelte';
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';

	interface Props {
		/** Initial editable props (rendered as JSON, parsed live on edit). */
		initial: T;
		/** Renders the live preview from the current parsed props. */
		preview: Snippet<[T]>;
		/** Optional: derive a read-only usage snippet from the current props. */
		usage?: (props: T) => string;
		/** Fixed height for the editor pane — the editor needs a definite height. */
		editorHeight?: string;
		/** Reserve preview height so there's no layout shift before hydration. */
		previewMinHeight?: string;
	}
	let {
		initial,
		preview,
		usage,
		editorHeight = '240px',
		previewMinHeight = '150px'
	}: Props = $props();

	// `initial` is a one-time config (the baseline for Reset); untrack the capture so
	// the compiler knows we deliberately read its initial value, not track changes.
	const baseline = untrack(() => initial);
	const initialSource = JSON.stringify(baseline, null, 2);
	let source = $state(initialSource);
	let current = $state<T>(baseline);
	let error = $state<string | null>(null);

	function handleEdit(text: string) {
		source = text;
		try {
			// Parse into a local and validate the SHAPE before touching `current`:
			// `null`, `42`, `[]` are all valid JSON but would make the preview snippet
			// read props off a non-object and crash. Assigning only on success means an
			// invalid edit genuinely holds the last valid render.
			const parsed: unknown = JSON.parse(text);
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new Error('Expected a JSON object of props');
			}
			current = parsed as T;
			error = null;
		} catch (e) {
			// Keep rendering the last valid props; just surface the error.
			error = e instanceof Error ? e.message.replace(/^JSON\.parse:\s*/, '') : 'Invalid JSON';
		}
	}

	function reset() {
		source = initialSource;
		current = baseline;
		error = null;
	}

	const isDirty = $derived(source !== initialSource);
	const usageCode = $derived(usage ? usage(current) : null);
</script>

<div class="props-playground">
	<div class="props-playground__pane props-playground__pane--edit">
		<div class="props-playground__bar">
			<span class="props-playground__tag">props · editable</span>
			{#if isDirty}
				<button type="button" class="props-playground__reset" onclick={reset}>Reset</button>
			{/if}
		</div>
		<div class="props-playground__editor" style="height: {editorHeight}">
			{#if browser}
				<CustomEditor content={source} language="json" onChange={handleEdit} />
			{:else}
				<pre class="props-playground__fallback" aria-hidden="true">{source}</pre>
			{/if}
		</div>
		<p
			class="props-playground__status"
			class:props-playground__status--error={error}
			role="status"
			aria-live="polite"
		>
			{#if error}
				⚠ {error}
			{:else}
				● Live — edits render instantly
			{/if}
		</p>
	</div>

	<div class="props-playground__pane props-playground__pane--preview">
		<div class="props-playground__bar">
			<span class="props-playground__tag">live preview</span>
		</div>
		<div class="props-playground__stage" style="min-height: {previewMinHeight}">
			{@render preview(current)}
		</div>
		{#if usageCode}
			<div class="props-playground__usage">
				<span class="props-playground__usage-label">renders</span>
				<code>{usageCode}</code>
			</div>
		{/if}
	</div>
</div>

<style>
	.props-playground {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		align-items: stretch;
	}

	.props-playground__pane {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ide-border-subtle, #233148);
		border-radius: 10px;
		background: var(--ide-bg-secondary, #131c2e);
		overflow: hidden;
	}

	.props-playground__bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid var(--ide-border-subtle, #233148);
		background: var(--ide-bg-primary, #0d1421);
	}

	.props-playground__tag {
		font-family: var(--ide-font-mono, ui-monospace, monospace);
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ide-text-muted, #93a4c3);
	}

	.props-playground__reset {
		font-size: 11px;
		font-weight: 600;
		color: var(--ide-interactive, #4a8db7);
		background: transparent;
		border: 1px solid var(--ide-border-subtle, #233148);
		border-radius: 6px;
		padding: 2px 10px;
		cursor: pointer;
		transition:
			color 0.12s ease,
			border-color 0.12s ease;
	}
	.props-playground__reset:hover {
		color: var(--ide-text-primary, #e8eefc);
		border-color: var(--ide-interactive, #4a8db7);
	}

	.props-playground__editor {
		position: relative;
		overflow: hidden;
	}
	/* Announce focus on the editor as a whole (the inner caret/active-line shows
	   where you are, but a keyboard user needs to know the control itself is live). */
	.props-playground__editor:focus-within {
		outline: 1px solid var(--ide-interactive, #4a8db7);
		outline-offset: -1px;
	}

	.props-playground__fallback {
		margin: 0;
		padding: 12px;
		font-family: var(--ide-font-mono, ui-monospace, monospace);
		font-size: 13px;
		line-height: 1.6;
		color: var(--ide-text-muted, #93a4c3);
		white-space: pre;
	}

	.props-playground__status {
		margin: 0;
		padding: 7px 12px;
		font-size: 12px;
		font-weight: 500;
		color: var(--ide-success, #6ee7b7);
		border-top: 1px solid var(--ide-border-subtle, #233148);
		background: var(--ide-bg-primary, #0d1421);
	}
	.props-playground__status--error {
		color: var(--ide-danger, #f87171);
	}

	.props-playground__stage {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 24px;
		flex: 1;
		/* A subtle dot-grid canvas so the rendered component is framed and pops,
		   instead of floating in an empty void. */
		background-color: var(--ide-bg-primary, #0d1421);
		background-image: radial-gradient(
			circle,
			var(--ide-border-subtle, #233148) 1px,
			transparent 1px
		);
		background-size: 16px 16px;
		background-position: center;
	}

	.props-playground__usage {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px 10px 12px;
		border-top: 1px solid var(--ide-border-subtle, #233148);
		background: var(--ide-bg-primary, #0d1421);
		overflow-x: auto;
	}
	.props-playground__usage-label {
		flex-shrink: 0;
		font-size: 10px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ide-text-subtle, #64748b);
	}
	.props-playground__usage code {
		font-family: var(--ide-font-mono, ui-monospace, monospace);
		font-size: 12.5px;
		color: var(--ide-text-secondary, #c4d2ec);
		white-space: pre;
	}

	/* In the cramped two-column regime the usage line would scroll its closing tag
	   out of view with no affordance — let it wrap instead of silently truncating. */
	@media (max-width: 1000px) {
		.props-playground__usage code {
			white-space: pre-wrap;
			word-break: break-word;
		}
	}

	@media (max-width: 720px) {
		.props-playground {
			grid-template-columns: 1fr;
		}
	}
</style>
