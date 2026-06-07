<script lang="ts">
	/**
	 * TokenRenderer - Safely renders tokenized line content without @html
	 *
	 * This component prevents XSS by rendering tokens as DOM elements
	 * instead of using innerHTML/dangerouslySetInnerHTML.
	 * Merges adjacent tokens of the same type to reduce DOM overhead.
	 */
	import { getTokenClass, type TokenizedLine, type Token } from './tokenizer';

	interface Props {
		tokens: TokenizedLine | undefined;
		tabSize?: number;
	}

	let { tokens, tabSize = 2 }: Props = $props();

	// Process text to handle whitespace for display
	function processText(text: string): string {
		// Replace tabs with spaces for display
		return text.replace(/\t/g, ' '.repeat(tabSize));
	}

	// Merge adjacent tokens of the same type to reduce DOM elements
	let mergedTokens = $derived.by(() => {
		if (!tokens?.tokens?.length) return [];

		const result: Token[] = [];
		let current: Token | null = null;

		for (const token of tokens.tokens) {
			if (current && current.type === token.type) {
				// Merge with current token
				current = {
					type: current.type,
					text: current.text + token.text,
					start: current.start,
					end: token.end
				};
			} else {
				// Push previous and start new
				if (current) result.push(current);
				current = { ...token };
			}
		}
		if (current) result.push(current);

		return result;
	});
</script>

{#if mergedTokens.length > 0}
	{#each mergedTokens as token}
		{#if token.type === 'text'}
			<span class="token-text">{processText(token.text) || '\u00A0'}</span>
		{:else}
			<span class={getTokenClass(token.type)}>{processText(token.text) || '\u00A0'}</span>
		{/if}
	{/each}
{:else}
	<span>&nbsp;</span>
{/if}

<style>
	/* Whitespace handling */
	span {
		white-space: pre;
	}
</style>
