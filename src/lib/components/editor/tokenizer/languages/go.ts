/**
 * Go tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Go keywords
const keywords = new Set([
	'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
	'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
	'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var'
]);

const controlKeywords = new Set([
	'break', 'case', 'continue', 'default', 'defer', 'else', 'fallthrough',
	'for', 'go', 'goto', 'if', 'range', 'return', 'select', 'switch'
]);

const builtins = new Set([
	'true', 'false', 'nil', 'iota'
]);

const builtinFunctions = new Set([
	'append', 'cap', 'close', 'complex', 'copy', 'delete', 'imag', 'len',
	'make', 'new', 'panic', 'print', 'println', 'real', 'recover'
]);

const builtinTypes = new Set([
	'bool', 'byte', 'complex64', 'complex128', 'error', 'float32', 'float64',
	'int', 'int8', 'int16', 'int32', 'int64', 'rune', 'string',
	'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr'
]);

interface GoTokenizerState extends TokenizerState {
	inRawString?: boolean;
}

export class GoTokenizer {
	language = 'go';

	getInitialState(): GoTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: GoTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: GoTokenizerState = { ...prevState };

		// Handle block comment continuation
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

		// Handle raw string continuation
		if (state.inRawString) {
			const endIdx = line.indexOf('`');
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + 1), 0));
				pos = endIdx + 1;
				state.inRawString = false;
			} else {
				tokens.push(createToken('string', line, 0));
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

	private getNextToken(text: string, pos: number, state: GoTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}

		// Block comments
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 2), pos);
			} else {
				state.inBlockComment = true;
				return createToken('comment.block', text, pos);
			}
		}

		// Raw strings
		if (text.startsWith('`')) {
			const endIdx = text.indexOf('`', 1);
			if (endIdx !== -1) {
				return createToken('string', text.slice(0, endIdx + 1), pos);
			} else {
				state.inRawString = true;
				return createToken('string', text, pos);
			}
		}

		// Interpreted strings
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos);
		}

		// Rune literals
		if (text.startsWith("'")) {
			const runeMatch = text.match(/^'(?:[^'\\]|\\(?:[abfnrtv\\'"]|[0-7]{3}|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}))'/);
			if (runeMatch) {
				return createToken('string', runeMatch[0], pos);
			}
		}

		// Numbers
		const numMatch = text.match(/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?i?)/);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, identMatch[0].length), word, pos);
		}

		// Operators
		const opMatch = text.match(/^(?:<-|:=|&&|\|\||<<|>>|&\^|[+\-*/%&|^!<>=]=?)/);
		if (opMatch) {
			return createToken('operator', opMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';' || char === ':') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		// Built-in constants
		if (builtins.has(word)) {
			if (word === 'true' || word === 'false') return 'constant.boolean';
			if (word === 'nil') return 'constant.null';
			return 'constant.builtin';
		}

		// Keywords
		if (keywords.has(word)) {
			if (controlKeywords.has(word)) return 'keyword.control';
			if (word === 'func' || word === 'type' || word === 'struct' || word === 'interface') {
				return 'keyword.definition';
			}
			if (word === 'import' || word === 'package') return 'keyword.module';
			return 'keyword';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Built-in functions
		if (builtinFunctions.has(word)) {
			const afterWord = context.slice(wordLength).trim();
			if (afterWord.startsWith('(')) {
				return 'function.call';
			}
			return 'function';
		}

		// Check if followed by ( - likely a function call
		const afterWord = context.slice(wordLength).trim();
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// Check if it's a type (PascalCase)
		if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	private tokenizeString(text: string, pos: number): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === '"') {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			if (text[i] === '\n') {
				break;
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}
}

export function createGoTokenizer() {
	return new GoTokenizer();
}
