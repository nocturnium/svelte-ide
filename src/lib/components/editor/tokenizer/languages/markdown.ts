/**
 * Markdown tokenizer
 */

import type { Token, TokenizedLine, TokenizerState } from '../types';
import { createToken } from '../base';

interface MarkdownTokenizerState extends TokenizerState {
	inFencedCode?: boolean;
	codeLanguage?: string;
}

export class MarkdownTokenizer {
	language = 'markdown';

	getInitialState(): MarkdownTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: MarkdownTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		const state: MarkdownTokenizerState = { ...prevState };

		// Handle fenced code block
		if (state.inFencedCode) {
			if (line.match(/^```\s*$/)) {
				tokens.push(createToken('markup.code', line, 0));
				state.inFencedCode = false;
				state.codeLanguage = undefined;
			} else {
				tokens.push(createToken('markup.code', line, 0));
			}
			return { lineNumber, tokens, text: line, state };
		}

		// Check for fenced code block start
		const fenceMatch = line.match(/^```(\w*)/);
		if (fenceMatch) {
			tokens.push(createToken('markup.code', line, 0));
			state.inFencedCode = true;
			state.codeLanguage = fenceMatch[1] || undefined;
			return { lineNumber, tokens, text: line, state };
		}

		// Headings
		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			tokens.push(createToken('markup.heading', headingMatch[1], 0));
			tokens.push(createToken('text', ' ', headingMatch[1].length));
			this.tokenizeInline(headingMatch[2], headingMatch[1].length + 1, tokens);
			return { lineNumber, tokens, text: line, state };
		}

		// Horizontal rule
		if (line.match(/^(?:[-*_]\s*){3,}$/)) {
			tokens.push(createToken('punctuation', line, 0));
			return { lineNumber, tokens, text: line, state };
		}

		// Block quotes
		const quoteMatch = line.match(/^(>\s*)/);
		if (quoteMatch) {
			tokens.push(createToken('markup.quote', quoteMatch[1], 0));
			this.tokenizeInline(line.slice(quoteMatch[1].length), quoteMatch[1].length, tokens);
			return { lineNumber, tokens, text: line, state };
		}

		// Unordered lists
		const ulMatch = line.match(/^(\s*[-*+])\s/);
		if (ulMatch) {
			tokens.push(createToken('markup.list', ulMatch[1], 0));
			tokens.push(createToken('text', ' ', ulMatch[1].length));
			this.tokenizeInline(line.slice(ulMatch[0].length), ulMatch[0].length, tokens);
			return { lineNumber, tokens, text: line, state };
		}

		// Ordered lists
		const olMatch = line.match(/^(\s*\d+\.)\s/);
		if (olMatch) {
			tokens.push(createToken('markup.list', olMatch[1], 0));
			tokens.push(createToken('text', ' ', olMatch[1].length));
			this.tokenizeInline(line.slice(olMatch[0].length), olMatch[0].length, tokens);
			return { lineNumber, tokens, text: line, state };
		}

		// Indented code block
		if (line.match(/^(?: {4}|\t)/)) {
			tokens.push(createToken('markup.code', line, 0));
			return { lineNumber, tokens, text: line, state };
		}

		// Regular paragraph
		this.tokenizeInline(line, 0, tokens);

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	private tokenizeInline(text: string, offset: number, tokens: Token[]): void {
		let pos = 0;

		while (pos < text.length) {
			const remaining = text.slice(pos);

			// Inline code
			const codeMatch = remaining.match(/^`([^`]+)`/);
			if (codeMatch) {
				tokens.push(createToken('markup.code', codeMatch[0], offset + pos));
				pos += codeMatch[0].length;
				continue;
			}

			// Images ![alt](url)
			const imgMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
			if (imgMatch) {
				tokens.push(createToken('markup.link', imgMatch[0], offset + pos));
				pos += imgMatch[0].length;
				continue;
			}

			// Links [text](url)
			const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
			if (linkMatch) {
				tokens.push(createToken('markup.link', linkMatch[0], offset + pos));
				pos += linkMatch[0].length;
				continue;
			}

			// Reference-style links [text][ref]
			const refLinkMatch = remaining.match(/^\[([^\]]+)\]\[([^\]]*)\]/);
			if (refLinkMatch) {
				tokens.push(createToken('markup.link', refLinkMatch[0], offset + pos));
				pos += refLinkMatch[0].length;
				continue;
			}

			// Autolinks <url>
			const autoLinkMatch = remaining.match(/^<(https?:\/\/[^>]+)>/);
			if (autoLinkMatch) {
				tokens.push(createToken('markup.link', autoLinkMatch[0], offset + pos));
				pos += autoLinkMatch[0].length;
				continue;
			}

			// Bold **text** or __text__
			const boldMatch = remaining.match(/^(?:\*\*([^*]+)\*\*|__([^_]+)__)/);
			if (boldMatch) {
				tokens.push(createToken('markup.bold', boldMatch[0], offset + pos));
				pos += boldMatch[0].length;
				continue;
			}

			// Italic *text* or _text_
			const italicMatch = remaining.match(/^(?:\*([^*]+)\*|_([^_]+)_)/);
			if (italicMatch) {
				tokens.push(createToken('markup.italic', italicMatch[0], offset + pos));
				pos += italicMatch[0].length;
				continue;
			}

			// Strikethrough ~~text~~
			const strikeMatch = remaining.match(/^~~([^~]+)~~/);
			if (strikeMatch) {
				tokens.push(createToken('punctuation', strikeMatch[0], offset + pos));
				pos += strikeMatch[0].length;
				continue;
			}

			// Regular text
			const textMatch = remaining.match(/^[^`*_[!<~]+/);
			if (textMatch) {
				tokens.push(createToken('text', textMatch[0], offset + pos));
				pos += textMatch[0].length;
				continue;
			}

			// Single character fallback
			tokens.push(createToken('text', remaining[0], offset + pos));
			pos += 1;
		}
	}
}

export function createMarkdownTokenizer() {
	return new MarkdownTokenizer();
}
