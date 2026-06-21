/**
 * Java tokenizer
 */

import type { LanguageTokenizer, Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (introduce a type)
const definitionKeywords = new Set(['class', 'interface', 'enum', 'record', 'void']);

// Storage / modifier keywords
const storageKeywords = new Set([
	'public',
	'private',
	'protected',
	'static',
	'final',
	'abstract',
	'synchronized',
	'volatile',
	'transient',
	'native',
	'default'
]);

// Control-flow keywords
const controlKeywords = new Set([
	'if',
	'else',
	'switch',
	'case',
	'for',
	'while',
	'do',
	'break',
	'continue',
	'return',
	'throw',
	'try',
	'catch',
	'finally'
]);

// Module / package keywords
const moduleKeywords = new Set(['import', 'package']);

// Remaining plain keywords
const otherKeywords = new Set([
	'new',
	'extends',
	'implements',
	'instanceof',
	'this',
	'super',
	'var',
	'sealed',
	'permits',
	'yield'
]);

// Primitive / builtin types
const builtinTypes = new Set([
	'int',
	'long',
	'short',
	'byte',
	'char',
	'boolean',
	'float',
	'double',
	'void'
]);

// Commonly-used standard-library classes
const classTypes = new Set(['String', 'Object', 'Integer', 'List', 'Map', 'Optional']);

interface JavaTokenizerState extends TokenizerState {
	/** Currently inside a multi-line text block (triple-quote). */
	inTextBlock?: boolean;
}

export class JavaTokenizer implements LanguageTokenizer {
	language = 'java';

	getInitialState(): JavaTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: JavaTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: JavaTokenizerState = { ...prevState };

		// Resume a block comment / Javadoc spanning multiple lines.
		if (state.inBlockComment) {
			const endIdx = line.indexOf('*/');
			const type: TokenType = state.custom?.doc ? 'comment.doc' : 'comment.block';
			if (endIdx !== -1) {
				tokens.push(createToken(type, line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
				state.custom = undefined;
			} else {
				tokens.push(createToken(type, line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a multi-line text block.
		if (state.inTextBlock) {
			const endIdx = line.indexOf('"""');
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + 3), 0));
				pos = endIdx + 3;
				state.inTextBlock = false;
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

	private getNextToken(text: string, pos: number, state: JavaTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}

		// Javadoc / block comments
		if (text.startsWith('/**') && !text.startsWith('/**/')) {
			const endIdx = text.indexOf('*/', 3);
			if (endIdx !== -1) {
				return createToken('comment.doc', text.slice(0, endIdx + 2), pos);
			}
			state.inBlockComment = true;
			state.custom = { doc: true };
			return createToken('comment.doc', text, pos);
		}
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 2), pos);
			}
			state.inBlockComment = true;
			state.custom = { doc: false };
			return createToken('comment.block', text, pos);
		}

		// Text blocks (triple-quote). A text block opens when """ is the last
		// non-whitespace content on the line; otherwise treat a complete """..."""
		// on one line as an inline string.
		if (text.startsWith('"""')) {
			const after = text.slice(3);
			if (/^[ \t]*$/.test(after)) {
				state.inTextBlock = true;
				return createToken('string', text, pos);
			}
			const endIdx = text.indexOf('"""', 3);
			if (endIdx !== -1) {
				return createToken('string', text.slice(0, endIdx + 3), pos);
			}
			state.inTextBlock = true;
			return createToken('string', text, pos);
		}

		// Double-quoted strings
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos, '"');
		}

		// Char literals
		if (text.startsWith("'")) {
			const charMatch = text.match(
				/^'(?:\\(?:[btnfr0"'\\]|u[0-9a-fA-F]{4}|[0-3]?[0-7]{1,2})|[^'\\])'/
			);
			if (charMatch) {
				return createToken('string', charMatch[0], pos);
			}
			return this.tokenizeString(text, pos, "'");
		}

		// Annotations: @Identifier
		if (text.startsWith('@')) {
			const annotationMatch = text.match(/^@[a-zA-Z_][a-zA-Z0-9_.]*/);
			if (annotationMatch) {
				return createToken('keyword', annotationMatch[0], pos);
			}
		}

		// Numbers: hex, binary, decimal/float with underscores, exponents, type suffixes.
		const hexMatch = text.match(/^0[xX][0-9a-fA-F_]+[lL]?/);
		if (hexMatch) {
			return createToken('number.hex', hexMatch[0], pos);
		}
		const binMatch = text.match(/^0[bB][01_]+[lL]?/);
		if (binMatch) {
			return createToken('number.binary', binMatch[0], pos);
		}
		const numMatch = text.match(
			/^(?:\d[\d_]*\.[\d_]*(?:[eE][+-]?\d[\d_]*)?[fFdD]?|\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?[fFdD]?|\d[\d_]*(?:[eE][+-]?\d[\d_]*)[fFdD]?|\d[\d_]*[fFdDlL]?)/
		);
		if (numMatch) {
			const word = numMatch[0];
			const type: TokenType =
				word.includes('.') || /[eEfF]/.test(word) ? 'number.float' : 'number.integer';
			return createToken(type, word, pos);
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators
		const opMatch = text.match(
			/^(?:>>>=|>>>|<<=|>>=|->|::|\+\+|--|&&|\|\||==|!=|<=|>=|<<|>>|[+\-*/%&|^!<>=]=?|~|\?|:)/
		);
		if (opMatch) {
			const op = opMatch[0];
			let type: TokenType = 'operator';
			if (op === '=' || /^(?:\+|-|\*|\/|%|&|\||\^|<<|>>|>>>)=$/.test(op)) {
				type = 'operator.assignment';
			} else if (op === '==' || op === '!=' || op === '<=' || op === '>=') {
				type = 'operator.comparison';
			} else if (op === '&&' || op === '||' || op === '!') {
				type = 'operator.logical';
			} else if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
				type = 'operator.arithmetic';
			}
			return createToken(type, op, pos);
		}

		// Angle brackets (generics) — treat as plain operators when not generic context.
		if (text.startsWith('<') || text.startsWith('>')) {
			return createToken('operator', text[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.;]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		// Boolean / null literals
		if (word === 'true' || word === 'false') return 'constant.boolean';
		if (word === 'null') return 'constant.null';

		// Keywords
		if (definitionKeywords.has(word)) return 'keyword.definition';
		if (storageKeywords.has(word)) return 'keyword.storage';
		if (controlKeywords.has(word)) return 'keyword.control';
		if (moduleKeywords.has(word)) return 'keyword.module';
		if (otherKeywords.has(word)) return 'keyword';

		// Builtin primitive types
		if (builtinTypes.has(word)) return 'type.builtin';

		// Common standard-library classes
		if (classTypes.has(word)) return 'type.class';

		// Function call: identifier immediately followed by (
		const afterWord = context.slice(wordLength);
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// PascalCase (and not all-caps constant) => type/class
		if (/^[A-Z][a-zA-Z0-9_$]*$/.test(word) && /[a-z]/.test(word)) {
			return 'type.class';
		}

		return 'variable';
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
			if (text[i] === '\n') {
				break;
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}
}

export function createJavaTokenizer(): LanguageTokenizer {
	return new JavaTokenizer();
}
