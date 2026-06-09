/**
 * HTML/XML tokenizer
 */

import type { Token, TokenizedLine, TokenizerState } from '../types';
import { createToken } from '../base';
import { createCSSTokenizer } from './css';
import { createJavaScriptTokenizer } from './javascript';

interface HTMLTokenizerState extends TokenizerState {
	inScript?: boolean;
	inStyle?: boolean;
	innerState?: TokenizerState;
}

export class HTMLTokenizer {
	language: string;
	private isXML: boolean;
	private jsTokenizer = createJavaScriptTokenizer();
	private cssTokenizer = createCSSTokenizer();

	constructor(options: { xml?: boolean } = {}) {
		this.isXML = options.xml ?? false;
		this.language = this.isXML ? 'xml' : 'html';
	}

	getInitialState(): HTMLTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: HTMLTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: HTMLTokenizerState = { ...prevState };

		// Handle multi-line comment continuation
		if (state.inBlockComment) {
			const endIdx = line.indexOf('-->');
			if (endIdx !== -1) {
				tokens.push(createToken('comment.block', line.slice(0, endIdx + 3), 0));
				pos = endIdx + 3;
				state.inBlockComment = false;
			} else {
				tokens.push(createToken('comment.block', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		if (!this.isXML && state.inScript) {
			const closeScriptMatch = line.match(/<\/script>/i);
			if (closeScriptMatch) {
				const scriptPart = line.slice(0, closeScriptMatch.index);
				if (scriptPart) {
					const result = this.jsTokenizer.tokenizeLine(
						scriptPart,
						lineNumber,
						state.innerState ?? this.jsTokenizer.getInitialState()
					);
					tokens.push(...result.tokens);
					state.innerState = result.state;
				}
				state.inScript = false;
				state.innerState = undefined;
				pos = closeScriptMatch.index!;
			} else {
				const result = this.jsTokenizer.tokenizeLine(
					line,
					lineNumber,
					state.innerState ?? this.jsTokenizer.getInitialState()
				);
				state.innerState = result.state;
				return {
					lineNumber,
					tokens: result.tokens,
					text: line,
					state
				};
			}
		}

		if (!this.isXML && state.inStyle) {
			const closeStyleMatch = line.match(/<\/style>/i);
			if (closeStyleMatch) {
				const stylePart = line.slice(0, closeStyleMatch.index);
				if (stylePart) {
					const result = this.cssTokenizer.tokenizeLine(
						stylePart,
						lineNumber,
						state.innerState ?? this.cssTokenizer.getInitialState()
					);
					tokens.push(...result.tokens);
					state.innerState = result.state;
				}
				state.inStyle = false;
				state.innerState = undefined;
				pos = closeStyleMatch.index!;
			} else {
				const result = this.cssTokenizer.tokenizeLine(
					line,
					lineNumber,
					state.innerState ?? this.cssTokenizer.getInitialState()
				);
				state.innerState = result.state;
				return {
					lineNumber,
					tokens: result.tokens,
					text: line,
					state
				};
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos, state, line);

			if (token) {
				tokens.push(token);
				pos = token.end;
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				pos += 1;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	private getNextToken(
		text: string,
		pos: number,
		state: HTMLTokenizerState,
		_fullLine: string
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Comments
		if (text.startsWith('<!--')) {
			const endIdx = text.indexOf('-->', 4);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 3), pos);
			} else {
				state.inBlockComment = true;
				return createToken('comment.block', text, pos);
			}
		}

		// DOCTYPE
		if (text.match(/^<!DOCTYPE/i)) {
			const endIdx = text.indexOf('>');
			if (endIdx !== -1) {
				return createToken('keyword', text.slice(0, endIdx + 1), pos);
			}
		}

		// CDATA (XML)
		if (this.isXML && text.startsWith('<![CDATA[')) {
			const endIdx = text.indexOf(']]>');
			if (endIdx !== -1) {
				return createToken('string', text.slice(0, endIdx + 3), pos);
			}
			return createToken('string', text, pos);
		}

		// Processing instructions (XML)
		if (this.isXML && text.startsWith('<?')) {
			const endIdx = text.indexOf('?>');
			if (endIdx !== -1) {
				return createToken('keyword', text.slice(0, endIdx + 2), pos);
			}
		}

		// Closing tag
		const closingTagMatch = text.match(/^<\/([a-zA-Z][a-zA-Z0-9:-]*)>/);
		if (closingTagMatch) {
			const tagName = closingTagMatch[1].toLowerCase();
			if (tagName === 'script') {
				state.inScript = false;
				state.innerState = undefined;
			}
			if (tagName === 'style') {
				state.inStyle = false;
				state.innerState = undefined;
			}
			return createToken('tag', closingTagMatch[0], pos);
		}

		// Opening tag
		const openingTagMatch = text.match(/^<([a-zA-Z][a-zA-Z0-9:-]*)(?:\s|\/?>|$)/);
		if (openingTagMatch) {
			return this.tokenizeTag(text, pos, state);
		}

		// Entity references
		const entityMatch = text.match(/^&(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/);
		if (entityMatch) {
			return createToken('constant.builtin', entityMatch[0], pos);
		}

		// Text content
		const textMatch = text.match(/^[^<&]+/);
		if (textMatch) {
			return createToken('text', textMatch[0], pos);
		}

		return createToken('text', text[0], pos);
	}

	private tokenizeTag(text: string, pos: number, state: HTMLTokenizerState): Token {
		// Match entire tag with attributes
		const selfClosingMatch = text.match(/^<([a-zA-Z][a-zA-Z0-9:-]*)([^>]*?)\/>/);
		const openingMatch = text.match(/^<([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/);

		if (selfClosingMatch) {
			return createToken('tag', selfClosingMatch[0], pos);
		}

		if (openingMatch) {
			const tagName = openingMatch[1].toLowerCase();
			if (!this.isXML && tagName === 'script') {
				state.inScript = true;
				state.innerState = this.jsTokenizer.getInitialState();
			}
			if (!this.isXML && tagName === 'style') {
				state.inStyle = true;
				state.innerState = this.cssTokenizer.getInitialState();
			}
			return createToken('tag', openingMatch[0], pos);
		}

		// Partial tag - just match the tag name part
		const partialMatch = text.match(/^<([a-zA-Z][a-zA-Z0-9:-]*)/);
		if (partialMatch) {
			return createToken('tag.name', partialMatch[0], pos);
		}

		return createToken('tag.punctuation', '<', pos);
	}
}

export function createHTMLTokenizer() {
	return new HTMLTokenizer();
}

export function createXMLTokenizer() {
	return new HTMLTokenizer({ xml: true });
}
