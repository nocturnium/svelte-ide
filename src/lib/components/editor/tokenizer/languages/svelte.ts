/**
 * Svelte tokenizer for syntax highlighting
 *
 * Supports:
 * - Template directives: {#if}, {#each}, {@html}, etc.
 * - JavaScript expressions in curly braces
 * - Svelte-specific attributes: bind:, on:, use:, transition:, etc.
 * - Script and style sections
 * - HTML template parts
 */

import type { LanguageTokenizer, Token, TokenizedLine, TokenizerState } from '../types';
import { createTypeScriptTokenizer } from './javascript';
import { createCSSTokenizer } from './css';

/**
 * Lightweight token shape used while building tokens in document order.
 * Start/end positions are assigned in a single re-index pass before returning.
 */
type RawToken = Pick<Token, 'type' | 'text'>;

/**
 * Assign sequential start/end positions to tokens in document order.
 * Token N starts where token N-1 ended, since tokens render left-to-right.
 */
function reindexTokens(tokens: RawToken[]): Token[] {
	let cursor = 0;
	return tokens.map((t) => {
		const start = cursor;
		const end = start + t.text.length;
		cursor = end;
		return { type: t.type, text: t.text, start, end };
	});
}

/**
 * Svelte-specific tokenizer state
 */
export interface SvelteTokenizerState extends TokenizerState {
	/** Current context: 'template', 'script', or 'style' */
	context: 'template' | 'script' | 'style';
	/** Depth of nested script/style tags */
	tagDepth: number;
	/** Script/style tokenizer state */
	innerState?: TokenizerState;
}

/**
 * Svelte keywords and directives
 */
const SVELTE_BLOCK_KEYWORDS = new Set([
	'if',
	'else',
	'each',
	'await',
	'then',
	'catch',
	'key',
	'snippet'
]);

const SVELTE_TAG_KEYWORDS = new Set(['html', 'debug', 'const', 'render']);

const SVELTE_ATTRIBUTE_PREFIXES = [
	'bind:',
	'on:',
	'use:',
	'transition:',
	'in:',
	'out:',
	'animate:',
	'let:',
	'class:'
];

/**
 * Svelte tokenizer
 */
export class SvelteTokenizer implements LanguageTokenizer {
	language = 'svelte';
	private tsTokenizer: LanguageTokenizer;
	private cssTokenizer: LanguageTokenizer;

	constructor() {
		this.tsTokenizer = createTypeScriptTokenizer();
		this.cssTokenizer = createCSSTokenizer();
	}

	getInitialState(): SvelteTokenizerState {
		return {
			context: 'template',
			tagDepth: 0
		};
	}

	tokenizeLine(line: string, lineNumber: number, state: SvelteTokenizerState): TokenizedLine {
		const tokens: RawToken[] = [];
		let pos = 0;

		// Handle script context
		if (state.context === 'script') {
			const closeScriptMatch = line.match(/<\/script>/i);
			if (closeScriptMatch) {
				// Tokenize JavaScript part
				const scriptPart = line.substring(0, closeScriptMatch.index);
				if (scriptPart) {
					const result = this.tsTokenizer.tokenizeLine(
						scriptPart,
						lineNumber,
						state.innerState || this.tsTokenizer.getInitialState()
					);
					tokens.push(...result.tokens);
					state.innerState = result.state;
				}

				// Add closing tag
				tokens.push({ type: 'tag.punctuation', text: '</' });
				tokens.push({ type: 'tag.name', text: 'script' });
				tokens.push({ type: 'tag.punctuation', text: '>' });

				// Continue with template for remainder
				state.context = 'template';
				state.innerState = undefined;
				pos = closeScriptMatch.index! + closeScriptMatch[0].length;

				if (pos < line.length) {
					const remaining = this.tokenizeTemplate(line.substring(pos), state);
					tokens.push(...remaining);
				}
			} else {
				// Entire line is JavaScript
				const result = this.tsTokenizer.tokenizeLine(
					line,
					lineNumber,
					state.innerState || this.tsTokenizer.getInitialState()
				);
				tokens.push(...result.tokens);
				state.innerState = result.state;
			}

			return { lineNumber, tokens: reindexTokens(tokens), text: line, state };
		}

		// Handle style context
		if (state.context === 'style') {
			const closeStyleMatch = line.match(/<\/style>/i);
			if (closeStyleMatch) {
				// Tokenize CSS part
				const cssPart = line.substring(0, closeStyleMatch.index);
				if (cssPart) {
					const result = this.cssTokenizer.tokenizeLine(
						cssPart,
						lineNumber,
						state.innerState || this.cssTokenizer.getInitialState()
					);
					tokens.push(...result.tokens);
					state.innerState = result.state;
				}

				// Add closing tag
				tokens.push({ type: 'tag.punctuation', text: '</' });
				tokens.push({ type: 'tag.name', text: 'style' });
				tokens.push({ type: 'tag.punctuation', text: '>' });

				// Continue with template for remainder
				state.context = 'template';
				state.innerState = undefined;
				pos = closeStyleMatch.index! + closeStyleMatch[0].length;

				if (pos < line.length) {
					const remaining = this.tokenizeTemplate(line.substring(pos), state);
					tokens.push(...remaining);
				}
			} else {
				// Entire line is CSS
				const result = this.cssTokenizer.tokenizeLine(
					line,
					lineNumber,
					state.innerState || this.cssTokenizer.getInitialState()
				);
				tokens.push(...result.tokens);
				state.innerState = result.state;
			}

			return { lineNumber, tokens: reindexTokens(tokens), text: line, state };
		}

		// Template context
		const templateTokens = this.tokenizeTemplate(line, state);
		tokens.push(...templateTokens);

		return { lineNumber, tokens: reindexTokens(tokens), text: line, state };
	}

	private tokenizeTemplate(line: string, state: SvelteTokenizerState): RawToken[] {
		const tokens: RawToken[] = [];
		let pos = 0;

		while (pos < line.length) {
			const char = line[pos];

			// Check for <script> tag
			if (line.substring(pos).match(/^<script(?:\s|>)/i)) {
				const scriptMatch = line.substring(pos).match(/^<script(?:\s+[^>]*)?>?/i);
				if (scriptMatch) {
					tokens.push(...this.tokenizeTag(scriptMatch[0]));
					pos += scriptMatch[0].length;

					if (scriptMatch[0].endsWith('>')) {
						state.context = 'script';
						state.innerState = this.tsTokenizer.getInitialState();
					}
					continue;
				}
			}

			// Check for <style> tag
			if (line.substring(pos).match(/^<style(?:\s|>)/i)) {
				const styleMatch = line.substring(pos).match(/^<style(?:\s+[^>]*)?>?/i);
				if (styleMatch) {
					tokens.push(...this.tokenizeTag(styleMatch[0]));
					pos += styleMatch[0].length;

					if (styleMatch[0].endsWith('>')) {
						state.context = 'style';
						state.innerState = this.cssTokenizer.getInitialState();
					}
					continue;
				}
			}

			// Svelte template directives: {#if}, {@html}, etc.
			if (char === '{' && pos + 1 < line.length) {
				const nextChar = line[pos + 1];

				if (nextChar === '#' || nextChar === '/' || nextChar === ':' || nextChar === '@') {
					const directiveMatch = line.substring(pos).match(/^\{([#/:@])(\w+)(?:\s+([^}]+))?\}/);
					if (directiveMatch) {
						const [full, prefix, keyword, expression] = directiveMatch;

						// Opening brace
						tokens.push({ type: 'punctuation.brace', text: '{' });

						// Prefix (#, /, :, @)
						tokens.push({ type: 'keyword.control', text: prefix });

						// Keyword
						const isBlockKeyword = SVELTE_BLOCK_KEYWORDS.has(keyword);
						const isTagKeyword = SVELTE_TAG_KEYWORDS.has(keyword);

						if (isBlockKeyword || isTagKeyword) {
							tokens.push({ type: 'keyword.control', text: keyword });
						} else {
							tokens.push({ type: 'text', text: keyword });
						}

						// Expression (if any)
						if (expression) {
							tokens.push({ type: 'text', text: ' ' });
							tokens.push(...this.tokenizeJSExpression(expression));
						}

						// Closing brace
						tokens.push({ type: 'punctuation.brace', text: '}' });

						pos += full.length;
						continue;
					}
				}

				// Regular JavaScript expression
				const exprMatch = line.substring(pos).match(/^\{([^}]+)\}/);
				if (exprMatch) {
					const [full, expression] = exprMatch;

					tokens.push({ type: 'punctuation.brace', text: '{' });
					tokens.push(...this.tokenizeJSExpression(expression));
					tokens.push({ type: 'punctuation.brace', text: '}' });

					pos += full.length;
					continue;
				}
			}

			// HTML tags
			if (char === '<') {
				const tagMatch = line.substring(pos).match(/^<\/?[\w-]+(?:\s+[^>]*)?>?/);
				if (tagMatch) {
					tokens.push(...this.tokenizeTag(tagMatch[0]));
					pos += tagMatch[0].length;
					continue;
				}
			}

			// HTML comments
			if (line.substring(pos).startsWith('<!--')) {
				const commentMatch = line.substring(pos).match(/^<!--.*?(?:-->|$)/);
				if (commentMatch) {
					tokens.push({ type: 'comment', text: commentMatch[0] });
					pos += commentMatch[0].length;
					continue;
				}
			}

			// Regular text
			const textMatch = line.substring(pos).match(/^[^<{]+/);
			if (textMatch) {
				tokens.push({ type: 'text', text: textMatch[0] });
				pos += textMatch[0].length;
				continue;
			}

			// Fallback: single character
			tokens.push({ type: 'text', text: char });
			pos++;
		}

		return tokens;
	}

	private tokenizeTag(tag: string): RawToken[] {
		const tokens: RawToken[] = [];
		let pos = 0;

		// Opening bracket
		if (tag.startsWith('</')) {
			tokens.push({ type: 'tag.punctuation', text: '</' });
			pos = 2;
		} else {
			tokens.push({ type: 'tag.punctuation', text: '<' });
			pos = 1;
		}

		// Tag name
		const nameMatch = tag.substring(pos).match(/^[\w-]+/);
		if (nameMatch) {
			const tagName = nameMatch[0];
			tokens.push({ type: 'tag.name', text: tagName });
			pos += tagName.length;
		}

		// Attributes
		while (pos < tag.length) {
			// Skip whitespace
			const wsMatch = tag.substring(pos).match(/^\s+/);
			if (wsMatch) {
				tokens.push({ type: 'text', text: wsMatch[0] });
				pos += wsMatch[0].length;
				continue;
			}

			// Closing bracket
			if (tag[pos] === '>' || tag.substring(pos).startsWith('/>')) {
				const closing = tag.substring(pos);
				tokens.push({ type: 'tag.punctuation', text: closing });
				break;
			}

			// Attribute name
			const attrMatch = tag.substring(pos).match(/^([\w:-]+)(?:=)?/);
			if (attrMatch) {
				const attrName = attrMatch[1];
				const isSvelteAttr = SVELTE_ATTRIBUTE_PREFIXES.some((prefix) =>
					attrName.startsWith(prefix)
				);

				if (isSvelteAttr) {
					// Highlight Svelte-specific attributes
					const prefixMatch = SVELTE_ATTRIBUTE_PREFIXES.find((p) => attrName.startsWith(p));
					if (prefixMatch) {
						tokens.push({ type: 'keyword.control', text: prefixMatch });
						tokens.push({ type: 'tag.attribute', text: attrName.substring(prefixMatch.length) });
					} else {
						tokens.push({ type: 'tag.attribute', text: attrName });
					}
				} else {
					tokens.push({ type: 'tag.attribute', text: attrName });
				}

				pos += attrName.length;

				// Equals sign
				if (attrMatch[0].endsWith('=')) {
					tokens.push({ type: 'punctuation', text: '=' });
					pos++;

					// Attribute value
					const valueMatch = tag.substring(pos).match(/^(?:"([^"]*)"|'([^']*)'|\{([^}]+)\})/);
					if (valueMatch) {
						if (valueMatch[0].startsWith('{')) {
							// JavaScript expression
							tokens.push({ type: 'punctuation.brace', text: '{' });
							tokens.push(...this.tokenizeJSExpression(valueMatch[3]));
							tokens.push({ type: 'punctuation.brace', text: '}' });
						} else {
							// String value
							const quote = valueMatch[0][0];
							const value = valueMatch[1] || valueMatch[2];
							tokens.push({ type: 'string', text: quote + value + quote });
						}
						pos += valueMatch[0].length;
					}
				}

				continue;
			}

			// Shouldn't reach here, but just in case
			tokens.push({ type: 'text', text: tag[pos] });
			pos++;
		}

		return tokens;
	}

	private tokenizeJSExpression(expression: string): RawToken[] {
		// Simple JavaScript expression tokenization
		const result = this.tsTokenizer.tokenizeLine(expression, 1, this.tsTokenizer.getInitialState());
		return result.tokens;
	}
}

/**
 * Create a Svelte tokenizer
 */
export function createSvelteTokenizer(): SvelteTokenizer {
	return new SvelteTokenizer();
}
