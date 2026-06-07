<script lang="ts">
	/**
	 * HoverTooltip - LSP hover information display
	 *
	 * Shows type information, documentation, and other hover content
	 * from the language server when hovering over code symbols.
	 */

	import type { Hover, MarkupContent } from '$lib/types/lsp';

	interface Props {
		/** Hover content from LSP */
		hover: Hover;
		/** Position to render the tooltip */
		position: { x: number; y: number };
		/** Maximum width before wrapping */
		maxWidth?: number;
		/** Called when tooltip should close */
		onDismiss: () => void;
		class?: string;
	}

	let {
		hover,
		position,
		maxWidth = 500,
		onDismiss,
		class: className = ''
	}: Props = $props();

	let tooltipRef: HTMLElement;

	// Adjust position to stay within viewport
	let adjustedPosition = $derived(() => {
		if (!tooltipRef) return position;

		const rect = tooltipRef.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let x = position.x;
		let y = position.y;

		// Adjust horizontal position
		if (x + rect.width > viewportWidth - 16) {
			x = viewportWidth - rect.width - 16;
		}
		if (x < 16) x = 16;

		// Adjust vertical position - show above if not enough space below
		if (y + rect.height > viewportHeight - 16) {
			y = position.y - rect.height - 24; // 24px to account for cursor height
		}
		if (y < 16) y = 16;

		return { x, y };
	});

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onDismiss();
		}
	}

	/** A code-block string with an explicit language (LSP MarkedString form). */
	type MarkedString = { language: string; value: string };
	/** The shape a single hover content entry can take. */
	type HoverContent = string | MarkupContent | MarkedString;

	function getHoverContent(): HoverContent | HoverContent[] {
		return hover.contents;
	}

	function renderContent(content: HoverContent): { type: 'text' | 'markdown'; value: string } {
		if (typeof content === 'string') {
			return { type: 'text', value: content };
		}
		if ('kind' in content) {
			return { type: content.kind === 'markdown' ? 'markdown' : 'text', value: content.value };
		}
		// MarkedString with language
		if ('language' in content) {
			return { type: 'markdown', value: `\`\`\`${content.language}\n${content.value}\n\`\`\`` };
		}
		return { type: 'text', value: String(content) };
	}

	function getContentsArray(): HoverContent[] {
		const contents = getHoverContent();
		if (Array.isArray(contents)) {
			return contents;
		}
		return [contents];
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="hover-tooltip {className}"
	style="left: {adjustedPosition().x}px; top: {adjustedPosition().y}px; max-width: {maxWidth}px;"
	bind:this={tooltipRef}
	role="tooltip"
	onclick={(e) => e.stopPropagation()}
>
	<div class="hover-tooltip__content">
		{#each getContentsArray() as content, i}
			{@const rendered = renderContent(content)}
			{#if i > 0}
				<hr class="hover-tooltip__divider" />
			{/if}
			{#if rendered.type === 'markdown'}
				<div class="hover-tooltip__markdown">
					{@html renderMarkdown(rendered.value)}
				</div>
			{:else}
				<pre class="hover-tooltip__text">{rendered.value}</pre>
			{/if}
		{/each}
	</div>
</div>

<script context="module" lang="ts">
	// Simple markdown renderer for hover content
	// Handles code blocks, inline code, bold, italic, and links
	function renderMarkdown(text: string): string {
		let html = escapeHtml(text);

		// Code blocks with language
		html = html.replace(
			/```(\w+)?\n([\s\S]*?)```/g,
			(_, lang, code) => `<pre class="hover-tooltip__code-block" data-lang="${lang || ''}">${code.trim()}</pre>`
		);

		// Inline code
		html = html.replace(/`([^`]+)`/g, '<code class="hover-tooltip__inline-code">$1</code>');

		// Bold
		html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

		// Italic
		html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

		// Links (href is validated; unsafe schemes degrade to plain text)
		html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
			const url = safeUrl(href);
			return url ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>` : label;
		});

		// Line breaks
		html = html.replace(/\n/g, '<br>');

		return html;
	}

	function escapeHtml(text: string): string {
		const map: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return text.replace(/[&<>"']/g, (char) => map[char]);
	}

	// Whitelist link schemes. Relative/anchor URLs and http(s)/mailto are allowed;
	// anything else (e.g. javascript:, data:, vbscript:) is rejected.
	function safeUrl(url: string): string | null {
		const trimmed = url.trim();
		if (/^(\/|#|\.\/|\.\.\/)/.test(trimmed)) return trimmed;
		if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
		return null;
	}
</script>

<style>
	.hover-tooltip {
		position: fixed;
		z-index: 1001;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		box-shadow: var(--ide-shadow-lg);
		overflow: hidden;
		font-size: var(--ide-font-size-sm);
	}

	.hover-tooltip__content {
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		max-height: 400px;
		overflow-y: auto;
	}

	.hover-tooltip__divider {
		border: none;
		border-top: 1px solid var(--ide-border);
		margin: var(--ide-spacing-sm) 0;
	}

	.hover-tooltip__text {
		margin: 0;
		font-family: var(--ide-font-mono);
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--ide-text-primary);
	}

	.hover-tooltip__markdown {
		color: var(--ide-text-primary);
		line-height: 1.5;
	}

	.hover-tooltip__markdown :global(pre) {
		margin: var(--ide-spacing-xs) 0;
		padding: var(--ide-spacing-sm);
		background: var(--ide-bg-tertiary);
		border-radius: var(--ide-radius-sm);
		overflow-x: auto;
	}

	.hover-tooltip__markdown :global(code) {
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
	}

	.hover-tooltip__markdown :global(.hover-tooltip__code-block) {
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-syntax-string);
	}

	.hover-tooltip__markdown :global(.hover-tooltip__inline-code) {
		padding: 0.125em 0.25em;
		background: var(--ide-bg-tertiary);
		border-radius: var(--ide-radius-xs);
		font-size: 0.9em;
	}

	.hover-tooltip__markdown :global(strong) {
		font-weight: 600;
		color: var(--ide-text-primary);
	}

	.hover-tooltip__markdown :global(em) {
		font-style: italic;
	}

	.hover-tooltip__markdown :global(a) {
		color: var(--ide-interactive);
		text-decoration: none;
	}

	.hover-tooltip__markdown :global(a:hover) {
		text-decoration: underline;
	}

	/* Scrollbar styling */
	.hover-tooltip__content::-webkit-scrollbar {
		width: 8px;
	}

	.hover-tooltip__content::-webkit-scrollbar-track {
		background: transparent;
	}

	.hover-tooltip__content::-webkit-scrollbar-thumb {
		background: var(--ide-scrollbar-thumb);
		border-radius: 4px;
	}
</style>
