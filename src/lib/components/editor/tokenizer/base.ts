/**
 * Base tokenizer with common functionality
 */

import type {
	Token,
	TokenizedLine,
	TokenizerState,
	TokenType,
	LanguageTokenizer
} from './types';

/**
 * Create a token
 */
export function createToken(type: TokenType, text: string, start: number): Token {
	return {
		type,
		text,
		start,
		end: start + text.length
	};
}

/**
 * Plaintext tokenizer - no highlighting
 */
export class PlaintextTokenizer implements LanguageTokenizer {
	language = 'plaintext';

	getInitialState(): TokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number): TokenizedLine {
		return {
			lineNumber,
			tokens: [createToken('text', line, 0)],
			text: line,
			state: {}
		};
	}
}
