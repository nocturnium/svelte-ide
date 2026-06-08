/**
 * Tokenizer module for syntax highlighting
 *
 * This module provides zero-dependency syntax highlighting through custom tokenizers.
 * Each language has its own tokenizer that produces tokens for styling.
 */

export * from './types';
export * from './base';

// Language tokenizers
export {
	JavaScriptTokenizer,
	createJavaScriptTokenizer,
	createTypeScriptTokenizer,
	createJSXTokenizer,
	createTSXTokenizer
} from './languages/javascript';
export { HTMLTokenizer, createHTMLTokenizer, createXMLTokenizer } from './languages/html';
export { CSSTokenizer, createCSSTokenizer } from './languages/css';
export { JSONTokenizer, createJSONTokenizer } from './languages/json';
export { PythonTokenizer, createPythonTokenizer } from './languages/python';
export { GoTokenizer, createGoTokenizer } from './languages/go';
export { MarkdownTokenizer, createMarkdownTokenizer } from './languages/markdown';
export { SvelteTokenizer, createSvelteTokenizer } from './languages/svelte';

import type { LanguageTokenizer, Token, TokenizedLine, TokenizerState, TokenType } from './types';
import { PlaintextTokenizer } from './base';
import {
	createJavaScriptTokenizer,
	createTypeScriptTokenizer,
	createJSXTokenizer,
	createTSXTokenizer
} from './languages/javascript';
import { createHTMLTokenizer, createXMLTokenizer } from './languages/html';
import { createCSSTokenizer } from './languages/css';
import { createJSONTokenizer } from './languages/json';
import { createPythonTokenizer } from './languages/python';
import { createGoTokenizer } from './languages/go';
import { createMarkdownTokenizer } from './languages/markdown';
import { createSvelteTokenizer } from './languages/svelte';

/**
 * Language aliases mapping file extensions and common names to canonical language names
 */
const languageAliases: Record<string, string> = {
	// JavaScript
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',

	// TypeScript
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',

	// JSX/TSX
	jsx: 'jsx',
	tsx: 'tsx',

	// HTML
	htm: 'html',
	xhtml: 'html',
	vue: 'html',

	// Svelte
	svelte: 'svelte',

	// XML
	svg: 'xml',
	xsl: 'xml',
	xslt: 'xml',
	rss: 'xml',
	atom: 'xml',
	plist: 'xml',

	// CSS
	scss: 'css',
	sass: 'css',
	less: 'css',

	// JSON
	jsonc: 'json',
	json5: 'json',

	// Python
	py: 'python',
	pyw: 'python',
	pyi: 'python',

	// Go
	golang: 'go',

	// Markdown
	md: 'markdown',
	mkd: 'markdown',
	mkdn: 'markdown',
	mdown: 'markdown',
	markdown: 'markdown',

	// Plain text
	txt: 'plaintext',
	text: 'plaintext'
};

/**
 * Tokenizer factory functions by language
 */
const tokenizerFactories: Record<string, () => LanguageTokenizer> = {
	javascript: createJavaScriptTokenizer,
	typescript: createTypeScriptTokenizer,
	jsx: createJSXTokenizer,
	tsx: createTSXTokenizer,
	html: createHTMLTokenizer,
	xml: createXMLTokenizer,
	css: createCSSTokenizer,
	json: createJSONTokenizer,
	python: createPythonTokenizer,
	go: createGoTokenizer,
	markdown: createMarkdownTokenizer,
	svelte: createSvelteTokenizer,
	plaintext: () => new PlaintextTokenizer()
};

/**
 * Cached tokenizer instances with LRU eviction
 */
const tokenizerCache = new Map<string, LanguageTokenizer>();

/** Maximum number of tokenizers to keep in cache */
const MAX_TOKENIZER_CACHE_SIZE = 20;

/**
 * Get the canonical language name from an alias or extension
 */
export function resolveLanguage(language: string): string {
	const normalized = language.toLowerCase().replace(/^\./, '');
	return languageAliases[normalized] ?? normalized;
}

/**
 * Get a tokenizer for a language (with LRU cache eviction)
 */
export function getTokenizer(language: string): LanguageTokenizer {
	const resolved = resolveLanguage(language);

	// Check cache - if found, move to end for LRU tracking
	const cached = tokenizerCache.get(resolved);
	if (cached) {
		// Move to end (most recently used) by re-inserting
		tokenizerCache.delete(resolved);
		tokenizerCache.set(resolved, cached);
		return cached;
	}

	// Evict least recently used if cache is full
	if (tokenizerCache.size >= MAX_TOKENIZER_CACHE_SIZE) {
		// Map iterates in insertion order, so first key is LRU
		const lruKey = tokenizerCache.keys().next().value;
		if (lruKey) {
			tokenizerCache.delete(lruKey);
		}
	}

	// Create new tokenizer
	const factory = tokenizerFactories[resolved] ?? tokenizerFactories['plaintext'];
	const tokenizer = factory();

	// Cache it
	tokenizerCache.set(resolved, tokenizer);

	return tokenizer;
}

/**
 * Clear the tokenizer cache (useful for testing or memory management)
 */
export function clearTokenizerCache(): void {
	tokenizerCache.clear();
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): boolean {
	const resolved = resolveLanguage(language);
	return resolved in tokenizerFactories;
}

/**
 * Get list of supported languages
 */
export function getSupportedLanguages(): string[] {
	return Object.keys(tokenizerFactories);
}

/**
 * Tokenize content for a given language
 */
export function tokenize(content: string, language: string): TokenizedLine[] {
	const tokenizer = getTokenizer(language);
	const lines = content.split('\n');
	const result: TokenizedLine[] = [];
	let state = tokenizer.getInitialState();

	for (let i = 0; i < lines.length; i++) {
		const tokenized = tokenizer.tokenizeLine(lines[i], i + 1, state);
		result.push(tokenized);
		state = tokenized.state ?? state;
	}

	return result;
}

/**
 * Valid CSS class name pattern (alphanumeric, hyphens, underscores only)
 */
const SAFE_CLASS_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Get CSS class for a token type
 * Sanitizes input to prevent XSS through class name injection
 */
export function getTokenClass(type: TokenType): string {
	// Convert dots to hyphens for CSS class naming
	const className = type.replace(/\./g, '-');

	// Validate the resulting class name contains only safe characters
	// This prevents any potential XSS if an invalid type somehow gets through
	if (!SAFE_CLASS_PATTERN.test(className)) {
		return 'token-text'; // Fallback to safe default
	}

	return `token-${className}`;
}

/**
 * Convert tokens to HTML spans for rendering
 */
export function tokensToHTML(tokens: Token[]): string {
	return tokens
		.map((token) => {
			const className = getTokenClass(token.type);
			const escapedText = escapeHTML(token.text);
			if (token.type === 'text') {
				return escapedText;
			}
			return `<span class="${className}">${escapedText}</span>`;
		})
		.join('');
}

/**
 * Escape HTML special characters
 * Unified HTML escaping function for all editor components
 */
export function escapeHTML(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Re-export types for convenience
export type { Token, TokenizedLine, TokenizerState, TokenType, LanguageTokenizer };
