/**
 * JSON tokenizer
 */

import type { Token, TokenizedLine, TokenizerState } from '../types';
import { createToken } from '../base';

export class JSONTokenizer {
	language = 'json';

	getInitialState(): TokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: TokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: TokenizerState = { ...prevState };

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos);

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

	private getNextToken(text: string, pos: number): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Property keys (strings before colon)
		if (text.startsWith('"')) {
			const stringEnd = this.findStringEnd(text);
			const str = text.slice(0, stringEnd);
			// Check if followed by colon (property key)
			const afterString = text.slice(stringEnd).trim();
			if (afterString.startsWith(':')) {
				return createToken('property', str, pos);
			}
			return createToken('string', str, pos);
		}

		// Numbers
		const numMatch = text.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Boolean and null
		const boolMatch = text.match(/^(?:true|false)\b/);
		if (boolMatch) {
			return createToken('constant.boolean', boolMatch[0], pos);
		}

		const nullMatch = text.match(/^null\b/);
		if (nullMatch) {
			return createToken('constant.null', nullMatch[0], pos);
		}

		// Punctuation
		if (text[0] === '{' || text[0] === '}') {
			return createToken('punctuation.brace', text[0], pos);
		}
		if (text[0] === '[' || text[0] === ']') {
			return createToken('punctuation.bracket', text[0], pos);
		}
		if (text[0] === ':' || text[0] === ',') {
			return createToken('punctuation.separator', text[0], pos);
		}

		return createToken('text', text[0], pos);
	}

	private findStringEnd(text: string): number {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === '"') {
				return i + 1;
			}
			i++;
		}
		return text.length;
	}
}

export function createJSONTokenizer() {
	return new JSONTokenizer();
}
