/**
 * Python tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Python keywords
const keywords = new Set([
	'and',
	'as',
	'assert',
	'async',
	'await',
	'break',
	'class',
	'continue',
	'def',
	'del',
	'elif',
	'else',
	'except',
	'finally',
	'for',
	'from',
	'global',
	'if',
	'import',
	'in',
	'is',
	'lambda',
	'nonlocal',
	'not',
	'or',
	'pass',
	'raise',
	'return',
	'try',
	'while',
	'with',
	'yield'
]);

const controlKeywords = new Set([
	'if',
	'elif',
	'else',
	'for',
	'while',
	'try',
	'except',
	'finally',
	'with',
	'break',
	'continue',
	'return',
	'raise',
	'yield',
	'await'
]);

const builtins = new Set(['True', 'False', 'None', 'self', 'cls']);

const builtinFunctions = new Set([
	'abs',
	'all',
	'any',
	'ascii',
	'bin',
	'bool',
	'bytearray',
	'bytes',
	'callable',
	'chr',
	'classmethod',
	'compile',
	'complex',
	'delattr',
	'dict',
	'dir',
	'divmod',
	'enumerate',
	'eval',
	'exec',
	'filter',
	'float',
	'format',
	'frozenset',
	'getattr',
	'globals',
	'hasattr',
	'hash',
	'help',
	'hex',
	'id',
	'input',
	'int',
	'isinstance',
	'issubclass',
	'iter',
	'len',
	'list',
	'locals',
	'map',
	'max',
	'memoryview',
	'min',
	'next',
	'object',
	'oct',
	'open',
	'ord',
	'pow',
	'print',
	'property',
	'range',
	'repr',
	'reversed',
	'round',
	'set',
	'setattr',
	'slice',
	'sorted',
	'staticmethod',
	'str',
	'sum',
	'super',
	'tuple',
	'type',
	'vars',
	'zip',
	'__import__'
]);

interface PythonTokenizerState extends TokenizerState {
	stringDelimiter?: string;
	stringTriple?: boolean;
}

export class PythonTokenizer {
	language = 'python';

	getInitialState(): PythonTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: PythonTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: PythonTokenizerState = { ...prevState };

		// Handle multi-line string continuation
		if (state.inMultilineString && state.stringDelimiter) {
			const result = this.tokenizeMultilineStringContinuation(line, pos, state);
			tokens.push(...result.tokens);
			pos = result.pos;
			if (pos >= line.length) {
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

	private getNextToken(text: string, pos: number, state: PythonTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Comments
		if (text.startsWith('#')) {
			return createToken('comment.line', text, pos);
		}

		// Triple-quoted strings
		const tripleMatch = text.match(/^(?:f|r|b|fr|rf|br|rb)?(?:'''|""")/i);
		if (tripleMatch) {
			const prefix = tripleMatch[0];
			const delimiter = prefix.slice(-3);
			return this.tokenizeTripleString(text, pos, delimiter, state);
		}

		// Regular strings
		const stringMatch = text.match(/^(?:f|r|b|fr|rf|br|rb)?["']/i);
		if (stringMatch) {
			const prefix = stringMatch[0];
			const delimiter = prefix.slice(-1);
			return this.tokenizeString(text, pos, delimiter);
		}

		// Numbers
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?j?)/
		);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Decorators
		if (text.startsWith('@')) {
			const decoratorMatch = text.match(/^@[a-zA-Z_][a-zA-Z0-9_.]*/);
			if (decoratorMatch) {
				return createToken('function', decoratorMatch[0], pos);
			}
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, identMatch[0].length), word, pos);
		}

		// Operators
		const opMatch = text.match(/^(?:->|:=|==|!=|<=|>=|<<|>>|\*\*|\/\/|[+\-*/%&|^~<>=!@])/);
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
			if (word === 'True' || word === 'False') return 'constant.boolean';
			if (word === 'None') return 'constant.null';
			return 'constant.builtin';
		}

		// Keywords
		if (keywords.has(word)) {
			if (controlKeywords.has(word)) return 'keyword.control';
			if (word === 'def' || word === 'class' || word === 'lambda') return 'keyword.definition';
			if (word === 'import' || word === 'from' || word === 'as') return 'keyword.module';
			return 'keyword';
		}

		// Built-in functions
		if (builtinFunctions.has(word)) {
			const afterWord = context.slice(wordLength).trim();
			if (afterWord.startsWith('(')) {
				return 'function.call';
			}
			return 'type.builtin';
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

		// Magic methods/attributes
		if (word.startsWith('__') && word.endsWith('__')) {
			return 'constant.builtin';
		}

		return 'variable';
	}

	private tokenizeString(text: string, pos: number, delimiter: string): Token {
		// Find prefix length
		const prefixMatch = text.match(/^(?:f|r|b|fr|rf|br|rb)?/i);
		const prefixLen = prefixMatch ? prefixMatch[0].length : 0;

		let i = prefixLen + 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === delimiter) {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			if (text[i] === '\n') {
				break;
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}

	private tokenizeTripleString(
		text: string,
		pos: number,
		delimiter: string,
		state: PythonTokenizerState
	): Token {
		// Find prefix length
		const prefixMatch = text.match(/^(?:f|r|b|fr|rf|br|rb)?/i);
		const prefixLen = prefixMatch ? prefixMatch[0].length : 0;

		const searchStart = prefixLen + 3;
		const endIdx = text.indexOf(delimiter, searchStart);

		if (endIdx !== -1) {
			return createToken('string', text.slice(0, endIdx + 3), pos);
		} else {
			state.inMultilineString = true;
			state.stringDelimiter = delimiter;
			return createToken('string', text, pos);
		}
	}

	private tokenizeMultilineStringContinuation(
		line: string,
		startPos: number,
		state: PythonTokenizerState
	): { tokens: Token[]; pos: number } {
		const tokens: Token[] = [];
		const delimiter = state.stringDelimiter || '"""';
		const endIdx = line.indexOf(delimiter);

		if (endIdx !== -1) {
			tokens.push(createToken('string', line.slice(0, endIdx + 3), startPos));
			state.inMultilineString = false;
			state.stringDelimiter = undefined;
			return { tokens, pos: endIdx + 3 };
		} else {
			tokens.push(createToken('string', line, startPos));
			return { tokens, pos: line.length };
		}
	}
}

export function createPythonTokenizer() {
	return new PythonTokenizer();
}
