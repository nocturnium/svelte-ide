<script lang="ts">
	import { Icon } from '$components/core';
	import { tokenize } from '$components/editor/tokenizer';

	interface Props {
		content: string;
		isStreaming?: boolean;
	}

	let { content, isStreaming = false }: Props = $props();

	interface ParsedBlock {
		type: 'text' | 'code' | 'inline-code';
		content: string;
		language?: string;
	}

	// Parse content into blocks
	const blocks = $derived(parseContent(content));

	function parseContent(text: string): ParsedBlock[] {
		const result: ParsedBlock[] = [];
		const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
		let lastIndex = 0;
		let match;

		while ((match = codeBlockRegex.exec(text)) !== null) {
			// Add text before code block
			if (match.index > lastIndex) {
				const textContent = text.slice(lastIndex, match.index);
				result.push(...parseInlineElements(textContent));
			}

			// Add code block
			result.push({
				type: 'code',
				language: match[1] || 'plaintext',
				content: match[2].trim()
			});

			lastIndex = match.index + match[0].length;
		}

		// Add remaining text
		if (lastIndex < text.length) {
			const remaining = text.slice(lastIndex);
			result.push(...parseInlineElements(remaining));
		}

		return result;
	}

	function parseInlineElements(text: string): ParsedBlock[] {
		const result: ParsedBlock[] = [];
		const inlineCodeRegex = /`([^`]+)`/g;
		let lastIndex = 0;
		let match;

		while ((match = inlineCodeRegex.exec(text)) !== null) {
			if (match.index > lastIndex) {
				result.push({
					type: 'text',
					content: text.slice(lastIndex, match.index)
				});
			}

			result.push({
				type: 'inline-code',
				content: match[1]
			});

			lastIndex = match.index + match[0].length;
		}

		if (lastIndex < text.length) {
			result.push({
				type: 'text',
				content: text.slice(lastIndex)
			});
		}

		return result;
	}

	// Tokenize code for syntax highlighting
	function tokenizeCode(code: string, language: string): { text: string; type: string }[] {
		const lines = tokenize(code, language);
		// Flatten tokens from all lines, adding newlines between lines
		const result: { text: string; type: string }[] = [];
		for (let i = 0; i < lines.length; i++) {
			if (i > 0) {
				result.push({ text: '\n', type: 'text' });
			}
			for (const token of lines[i].tokens) {
				result.push({ text: token.text, type: token.type });
			}
		}
		return result;
	}

	// Escape HTML special characters so raw markup in (untrusted) model output
	// is rendered as text, never interpreted as HTML.
	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	// Whitelist link schemes. Relative/anchor URLs and http(s)/mailto are allowed;
	// anything else (e.g. javascript:, data:, vbscript:) is rejected.
	function safeUrl(url: string): string | null {
		const trimmed = url.trim();
		if (/^(\/|#|\.\/|\.\.\/)/.test(trimmed)) return trimmed;
		if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
		return null;
	}

	// Format text with basic markdown. Input is escaped FIRST, then a small set of
	// safe inline elements is re-introduced — so the only HTML emitted is ours.
	function formatText(text: string): string {
		return escapeHtml(text)
			// Bold
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			// Italic
			.replace(/\*([^*]+)\*/g, '<em>$1</em>')
			// Links (href is validated; unsafe schemes degrade to plain text)
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
				const url = safeUrl(href);
				return url
					? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
					: label;
			})
			// Line breaks
			.replace(/\n/g, '<br>');
	}

	// Copy code to clipboard
	let copiedIndex: number | null = $state(null);

	async function copyCode(code: string, index: number) {
		try {
			await navigator.clipboard.writeText(code);
			copiedIndex = index;
			setTimeout(() => {
				copiedIndex = null;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}
</script>

<div class="message-content" class:streaming={isStreaming}>
	{#each blocks as block, i (i)}
		{#if block.type === 'code'}
			<div class="code-block">
				<div class="code-header">
					<span class="code-language">{block.language}</span>
					<button
						class="code-copy"
						onclick={() => copyCode(block.content, i)}
						title="Copy code"
					>
						{#if copiedIndex === i}
							<Icon name="check" size={14} />
							<span>Copied!</span>
						{:else}
							<Icon name="copy" size={14} />
							<span>Copy</span>
						{/if}
					</button>
				</div>
				<pre class="code-content"><code>{#each tokenizeCode(block.content, block.language || 'plaintext') as token, ti (ti)}<span class="token-{token.type}">{token.text}</span>{/each}</code></pre>
			</div>
		{:else if block.type === 'inline-code'}
			<code class="inline-code">{block.content}</code>
		{:else}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<span class="text-content">{@html formatText(block.content)}</span>
		{/if}
	{/each}

	{#if isStreaming}
		<span class="cursor">|</span>
	{/if}
</div>

<style>
	.message-content {
		font-size: var(--ide-font-size-sm);
		line-height: var(--ide-line-height-relaxed);
		word-break: break-word;
	}

	.message-content :global(strong) {
		font-weight: 600;
	}

	.message-content :global(em) {
		font-style: italic;
	}

	.message-content :global(a) {
		color: var(--color-nocturnium-wave);
		text-decoration: underline;
	}

	.message-content :global(a:hover) {
		opacity: 0.8;
	}

	.text-content {
		white-space: pre-wrap;
	}

	.inline-code {
		padding: 0.125rem 0.375rem;
		font-family: var(--ide-font-mono);
		font-size: 0.85em;
		background: var(--ide-bg-tertiary);
		border-radius: var(--ide-radius-sm);
		color: var(--color-nocturnium-flame);
	}

	.code-block {
		margin: 0.75rem 0;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		overflow: hidden;
	}

	.code-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.375rem 0.75rem;
		background: var(--ide-bg-tertiary);
		border-bottom: 1px solid var(--ide-border);
	}

	.code-language {
		font-size: var(--ide-font-size-xs);
		font-weight: 500;
		color: var(--ide-text-muted);
		text-transform: lowercase;
	}

	.code-copy {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: none;
		border-radius: var(--ide-radius-sm);
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.code-copy:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.code-content {
		margin: 0;
		padding: 0.75rem 1rem;
		background: var(--ide-bg-primary);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		line-height: 1.6;
		overflow-x: auto;
	}

	.code-content code {
		display: block;
	}

	/* Syntax highlighting tokens */
	.code-content :global(.token-keyword) {
		color: var(--syntax-keyword, #c792ea);
	}

	.code-content :global(.token-string) {
		color: var(--syntax-string, #c3e88d);
	}

	.code-content :global(.token-number) {
		color: var(--syntax-number, #f78c6c);
	}

	.code-content :global(.token-comment) {
		color: var(--syntax-comment, #546e7a);
		font-style: italic;
	}

	.code-content :global(.token-function) {
		color: var(--syntax-function, #82aaff);
	}

	.code-content :global(.token-class) {
		color: var(--syntax-class, #ffcb6b);
	}

	.code-content :global(.token-operator) {
		color: var(--syntax-operator, #89ddff);
	}

	.code-content :global(.token-punctuation) {
		color: var(--syntax-punctuation, #89ddff);
	}

	.code-content :global(.token-variable) {
		color: var(--syntax-variable, #f07178);
	}

	.code-content :global(.token-property) {
		color: var(--syntax-property, #f07178);
	}

	.code-content :global(.token-type) {
		color: var(--syntax-type, #ffcb6b);
	}

	.code-content :global(.token-tag) {
		color: var(--syntax-tag, #f07178);
	}

	.code-content :global(.token-attribute) {
		color: var(--syntax-attribute, #c792ea);
	}

	.code-content :global(.token-text),
	.code-content :global(.token-plain) {
		color: var(--ide-text-primary);
	}

	/* Streaming cursor */
	.cursor {
		animation: blink 1s step-end infinite;
		color: var(--color-nocturnium-wave);
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
