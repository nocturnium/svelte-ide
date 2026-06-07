/**
 * CSS tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// CSS properties (common ones)
const properties = new Set([
	'align-content', 'align-items', 'align-self', 'animation', 'animation-delay',
	'animation-direction', 'animation-duration', 'animation-fill-mode', 'animation-iteration-count',
	'animation-name', 'animation-play-state', 'animation-timing-function', 'background',
	'background-attachment', 'background-blend-mode', 'background-clip', 'background-color',
	'background-image', 'background-origin', 'background-position', 'background-repeat',
	'background-size', 'border', 'border-bottom', 'border-color', 'border-left', 'border-radius',
	'border-right', 'border-style', 'border-top', 'border-width', 'bottom', 'box-shadow',
	'box-sizing', 'color', 'content', 'cursor', 'display', 'filter', 'flex', 'flex-basis',
	'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap', 'float', 'font',
	'font-family', 'font-size', 'font-style', 'font-weight', 'gap', 'grid', 'grid-area',
	'grid-column', 'grid-gap', 'grid-row', 'grid-template', 'grid-template-areas',
	'grid-template-columns', 'grid-template-rows', 'height', 'justify-content', 'justify-items',
	'justify-self', 'left', 'letter-spacing', 'line-height', 'list-style', 'margin',
	'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-height', 'max-width',
	'min-height', 'min-width', 'object-fit', 'opacity', 'order', 'outline', 'overflow',
	'overflow-x', 'overflow-y', 'padding', 'padding-bottom', 'padding-left', 'padding-right',
	'padding-top', 'place-content', 'place-items', 'place-self', 'pointer-events', 'position',
	'resize', 'right', 'row-gap', 'text-align', 'text-decoration', 'text-indent', 'text-overflow',
	'text-shadow', 'text-transform', 'top', 'transform', 'transform-origin', 'transition',
	'transition-delay', 'transition-duration', 'transition-property', 'transition-timing-function',
	'user-select', 'vertical-align', 'visibility', 'white-space', 'width', 'word-break',
	'word-spacing', 'word-wrap', 'z-index'
]);

// CSS at-rules
const atRules = new Set([
	'@media', '@keyframes', '@import', '@font-face', '@supports', '@page', '@charset',
	'@namespace', '@viewport', '@counter-style', '@font-feature-values', '@property', '@layer'
]);

interface CSSTokenizerState extends TokenizerState {
	inRule?: boolean;
	inValue?: boolean;
}

export class CSSTokenizer {
	language = 'css';

	getInitialState(): CSSTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: CSSTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: CSSTokenizerState = { ...prevState };

		// Handle multi-line comment continuation
		if (state.inBlockComment) {
			const endIdx = line.indexOf('*/');
			if (endIdx !== -1) {
				tokens.push(createToken('comment.block', line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
			} else {
				tokens.push(createToken('comment.block', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos, state);

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

	private getNextToken(text: string, pos: number, state: CSSTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Comments
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 2), pos);
			} else {
				state.inBlockComment = true;
				return createToken('comment.block', text, pos);
			}
		}

		// At-rules
		const atRuleMatch = text.match(/^@[a-zA-Z-]+/);
		if (atRuleMatch) {
			return createToken('keyword', atRuleMatch[0], pos);
		}

		// Selectors - class
		const classMatch = text.match(/^\.[a-zA-Z_-][a-zA-Z0-9_-]*/);
		if (classMatch) {
			return createToken('type.class', classMatch[0], pos);
		}

		// Selectors - id
		const idMatch = text.match(/^#[a-zA-Z_-][a-zA-Z0-9_-]*/);
		if (idMatch) {
			return createToken('constant', idMatch[0], pos);
		}

		// Pseudo-classes and pseudo-elements
		const pseudoMatch = text.match(/^:{1,2}[a-zA-Z-]+(?:\([^)]*\))?/);
		if (pseudoMatch) {
			return createToken('variable', pseudoMatch[0], pos);
		}

		// Property names
		const propMatch = text.match(/^[a-zA-Z-]+(?=\s*:)/);
		if (propMatch) {
			const prop = propMatch[0];
			if (properties.has(prop) || prop.startsWith('--')) {
				return createToken('property', prop, pos);
			}
			return createToken('property', prop, pos);
		}

		// CSS variables
		const varMatch = text.match(/^var\s*\(\s*--[a-zA-Z0-9_-]+\s*(?:,[^)]*)?\)/);
		if (varMatch) {
			return createToken('function.call', varMatch[0], pos);
		}

		// Functions
		const funcMatch = text.match(/^[a-zA-Z-]+(?=\s*\()/);
		if (funcMatch) {
			return createToken('function', funcMatch[0], pos);
		}

		// Colors - hex
		const hexMatch = text.match(/^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/);
		if (hexMatch) {
			return createToken('constant', hexMatch[0], pos);
		}

		// Numbers with units
		const numMatch = text.match(/^-?(?:\d+\.?\d*|\.\d+)(?:px|em|rem|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc|deg|rad|grad|turn|s|ms|Hz|kHz|dpi|dpcm|dppx)?/);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Strings
		if (text.startsWith('"') || text.startsWith("'")) {
			return this.tokenizeString(text, pos, text[0]);
		}

		// Keywords (color names, etc.)
		const keywordMatch = text.match(/^[a-zA-Z-]+/);
		if (keywordMatch) {
			const word = keywordMatch[0];
			// Common CSS keywords
			if (['inherit', 'initial', 'unset', 'revert', 'none', 'auto', 'transparent', 'currentColor', 'important'].includes(word)) {
				return createToken('keyword', word, pos);
			}
			// Color names
			if (['red', 'blue', 'green', 'white', 'black', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey'].includes(word)) {
				return createToken('constant', word, pos);
			}
			return createToken('text', word, pos);
		}

		// Punctuation
		if (text[0] === '{' || text[0] === '}') {
			if (text[0] === '{') state.inRule = true;
			if (text[0] === '}') state.inRule = false;
			return createToken('punctuation.brace', text[0], pos);
		}
		if (text[0] === '(' || text[0] === ')') {
			return createToken('punctuation.paren', text[0], pos);
		}
		if (text[0] === '[' || text[0] === ']') {
			return createToken('punctuation.bracket', text[0], pos);
		}
		if (text[0] === ':' || text[0] === ';' || text[0] === ',') {
			return createToken('punctuation.separator', text[0], pos);
		}

		return createToken('text', text[0], pos);
	}

	private tokenizeString(text: string, pos: number, delimiter: string): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === delimiter) {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			i++;
		}
		return createToken('string', text, pos);
	}
}

export function createCSSTokenizer() {
	return new CSSTokenizer();
}
