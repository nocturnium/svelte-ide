/**
 * Swift tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Swift keywords - definitions
const definitionKeywords = new Set([
	'func',
	'class',
	'struct',
	'enum',
	'protocol',
	'extension',
	'typealias',
	'associatedtype'
]);

// Swift keywords - storage / declaration modifiers
const storageKeywords = new Set([
	'let',
	'var',
	'static',
	'final',
	'private',
	'public',
	'internal',
	'fileprivate',
	'open',
	'lazy',
	'weak',
	'unowned',
	'mutating',
	'nonmutating',
	'override',
	'required',
	'convenience',
	'dynamic'
]);

// Swift keywords - control flow
const controlKeywords = new Set([
	'if',
	'else',
	'guard',
	'switch',
	'case',
	'default',
	'for',
	'while',
	'repeat',
	'break',
	'continue',
	'return',
	'throw',
	'throws',
	'do',
	'try',
	'catch',
	'defer',
	'fallthrough',
	'where'
]);

// Swift keywords - module / import
const moduleKeywords = new Set(['import']);

// Swift keywords - other (self, type expressions, casts, etc.)
const otherKeywords = new Set(['self', 'Self', 'super', 'in', 'as', 'is', 'some', 'any', 'inout']);

// All keywords (used for fast membership checks)
const keywords = new Set<string>([
	...definitionKeywords,
	...storageKeywords,
	...controlKeywords,
	...moduleKeywords,
	...otherKeywords
]);

// Boolean / null constants
const booleanConstants = new Set(['true', 'false']);

// Built-in types
const builtinTypes = new Set([
	'Int',
	'String',
	'Bool',
	'Double',
	'Float',
	'Character',
	'Array',
	'Dictionary',
	'Set',
	'Optional',
	'Void',
	'Any',
	'AnyObject'
]);

interface SwiftTokenizerState extends TokenizerState {
	/** Depth of nested block comments (0 = not in a block comment). */
	blockCommentDepth?: number;
	/** Inside a triple-quoted multi-line string. */
	inMultilineString?: boolean;
}

export class SwiftTokenizer {
	language = 'swift';

	getInitialState(): SwiftTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: SwiftTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: SwiftTokenizerState = { ...prevState };

		// Resume nested block comment from a previous line.
		if (state.blockCommentDepth && state.blockCommentDepth > 0) {
			pos = this.continueBlockComment(line, tokens, state);
			if (pos >= line.length) {
				if (tokens.length === 0) tokens.push(createToken('text', '', 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a triple-quoted multi-line string from a previous line.
		if (state.inMultilineString) {
			pos = this.continueMultilineString(line, tokens, state);
			if (pos >= line.length) {
				if (tokens.length === 0) tokens.push(createToken('text', '', 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const produced = this.getNextToken(remaining, pos, state);

			if (produced) {
				if (Array.isArray(produced)) {
					for (const t of produced) tokens.push(t);
					pos = produced.length > 0 ? produced[produced.length - 1].end : pos + 1;
				} else {
					tokens.push(produced);
					pos = produced.end;
				}
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
		state: SwiftTokenizerState
	): Token | Token[] | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}

		// Block comments (nestable)
		if (text.startsWith('/*')) {
			return this.tokenizeBlockComment(text, pos, state);
		}

		// Triple-quoted multi-line strings
		if (text.startsWith('"""')) {
			return this.tokenizeMultilineString(text, pos, state);
		}

		// Double-quoted strings (with interpolation)
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos);
		}

		// Numbers (must come before identifiers so 0x... isn't split)
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F][0-9a-fA-F_]*(?:\.[0-9a-fA-F][0-9a-fA-F_]*)?(?:[pP][+-]?\d[\d_]*)?|0[oO][0-7][0-7_]*|0[bB][01][01_]*|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?)/
		);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Attributes: @objc, @escaping, @Identifier
		if (text.startsWith('@')) {
			const attrMatch = text.match(/^@[a-zA-Z_][a-zA-Z0-9_]*/);
			if (attrMatch) {
				return createToken('keyword', attrMatch[0], pos);
			}
		}

		// Identifiers and keywords (Swift allows backtick-escaped identifiers)
		const escapedIdentMatch = text.match(/^`[a-zA-Z_][a-zA-Z0-9_]*`/);
		if (escapedIdentMatch) {
			return createToken('variable', escapedIdentMatch[0], pos);
		}

		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators
		const opMatch = text.match(
			/^(?:->|\?\?|===|!==|==|!=|<=|>=|&&|\|\||<<|>>|\+\+|--|\.\.\.|\.\.<|[+\-*/%&|^~<>=!]=?)/
		);
		if (opMatch) {
			const op = opMatch[0];
			let type: TokenType = 'operator';
			if (op === '=' || op === '+=' || op === '-=' || op === '*=' || op === '/=') {
				type = 'operator.assignment';
			} else if (
				op === '==' ||
				op === '!=' ||
				op === '<=' ||
				op === '>=' ||
				op === '===' ||
				op === '!=='
			) {
				type = 'operator.comparison';
			} else if (op === '&&' || op === '||') {
				type = 'operator.logical';
			} else if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
				type = 'operator.arithmetic';
			}
			return createToken(type, op, pos);
		}

		// Optional / force-unwrap markers and other single-char operators
		const singleOpMatch = text.match(/^[?!]/);
		if (singleOpMatch) {
			return createToken('operator', singleOpMatch[0], pos);
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
		// Boolean / null constants
		if (booleanConstants.has(word)) {
			return 'constant.boolean';
		}
		if (word === 'nil') {
			return 'constant.null';
		}

		// Keywords
		if (keywords.has(word)) {
			if (definitionKeywords.has(word)) return 'keyword.definition';
			if (controlKeywords.has(word)) return 'keyword.control';
			if (storageKeywords.has(word)) return 'keyword.storage';
			if (moduleKeywords.has(word)) return 'keyword.module';
			return 'keyword';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Function call: identifier immediately followed by (
		if (context.slice(wordLength).startsWith('(')) {
			return 'function.call';
		}

		// Type (PascalCase) — but not a call
		if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
			return 'type.class';
		}

		// Constant-style names (ALL_CAPS_WITH_UNDERSCORES) are common constants
		if (/^[A-Z][A-Z0-9_]+$/.test(word) && word.includes('_')) {
			return 'constant';
		}

		return 'variable';
	}

	/**
	 * Tokenize a double-quoted single-line string, splitting out `\(...)`
	 * interpolation segments as string.template tokens. Stays lossless.
	 */
	private tokenizeString(text: string, pos: number): Token | Token[] {
		const tokens: Token[] = [];
		let i = 1; // past opening quote
		let segmentStart = 0; // start of the current plain-string run

		const flushSegment = (end: number): void => {
			if (end > segmentStart) {
				tokens.push(createToken('string', text.slice(segmentStart, end), pos + segmentStart));
			}
		};

		while (i < text.length) {
			const ch = text[i];

			// Escaped interpolation: \( ... )
			if (ch === '\\' && text[i + 1] === '(') {
				flushSegment(i);
				const interpEnd = this.findInterpolationEnd(text, i + 1);
				// Opening "\(" marker
				tokens.push(createToken('string.template', text.slice(i, i + 2), pos + i));
				// Inner expression body
				const innerStart = i + 2;
				const innerEnd = interpEnd - 1; // position of closing )
				if (innerEnd > innerStart) {
					tokens.push(
						createToken('string.template', text.slice(innerStart, innerEnd), pos + innerStart)
					);
				}
				// Closing ")" marker (present only if it was actually found)
				if (interpEnd <= text.length && text[interpEnd - 1] === ')') {
					tokens.push(createToken('string.template', ')', pos + innerEnd));
				}
				i = interpEnd;
				segmentStart = i;
				continue;
			}

			// Other escape sequence
			if (ch === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}

			// Closing quote
			if (ch === '"') {
				flushSegment(i + 1);
				return tokens.length === 1 ? tokens[0] : tokens;
			}

			i++;
		}

		// Unterminated string (no closing quote on this line)
		flushSegment(text.length);
		return tokens.length === 1 ? tokens[0] : tokens;
	}

	/**
	 * Given an index pointing at the "(" of a `\(`, return the index just past the
	 * matching ")". Falls back to end-of-text if unbalanced.
	 */
	private findInterpolationEnd(text: string, openParenIdx: number): number {
		let depth = 0;
		let i = openParenIdx;
		while (i < text.length) {
			const ch = text[i];
			if (ch === '(') {
				depth++;
			} else if (ch === ')') {
				depth--;
				if (depth === 0) {
					return i + 1;
				}
			} else if (ch === '"') {
				// Skip nested string literal inside the interpolation.
				i++;
				while (i < text.length && text[i] !== '"') {
					if (text[i] === '\\') i++;
					i++;
				}
			}
			i++;
		}
		return text.length;
	}

	/** Tokenize the start of a block comment, tracking nesting depth in state. */
	private tokenizeBlockComment(text: string, pos: number, state: SwiftTokenizerState): Token {
		let depth = 1;
		let i = 2; // past opening /*
		while (i < text.length) {
			if (text[i] === '/' && text[i + 1] === '*') {
				depth++;
				i += 2;
				continue;
			}
			if (text[i] === '*' && text[i + 1] === '/') {
				depth--;
				i += 2;
				if (depth === 0) {
					return createToken('comment.block', text.slice(0, i), pos);
				}
				continue;
			}
			i++;
		}
		// Comment runs past end of line.
		state.blockCommentDepth = depth;
		return createToken('comment.block', text, pos);
	}

	/** Continue a block comment opened on a previous line. Returns new pos. */
	private continueBlockComment(line: string, tokens: Token[], state: SwiftTokenizerState): number {
		let depth = state.blockCommentDepth ?? 1;
		let i = 0;
		while (i < line.length) {
			if (line[i] === '/' && line[i + 1] === '*') {
				depth++;
				i += 2;
				continue;
			}
			if (line[i] === '*' && line[i + 1] === '/') {
				depth--;
				i += 2;
				if (depth === 0) {
					tokens.push(createToken('comment.block', line.slice(0, i), 0));
					state.blockCommentDepth = 0;
					return i;
				}
				continue;
			}
			i++;
		}
		// Still inside the comment after consuming the whole line.
		tokens.push(createToken('comment.block', line, 0));
		state.blockCommentDepth = depth;
		return line.length;
	}

	/** Tokenize the start of a triple-quoted multi-line string. */
	private tokenizeMultilineString(text: string, pos: number, state: SwiftTokenizerState): Token {
		const endIdx = text.indexOf('"""', 3);
		if (endIdx !== -1) {
			return createToken('string', text.slice(0, endIdx + 3), pos);
		}
		state.inMultilineString = true;
		return createToken('string', text, pos);
	}

	/** Continue a triple-quoted string opened on a previous line. Returns new pos. */
	private continueMultilineString(
		line: string,
		tokens: Token[],
		state: SwiftTokenizerState
	): number {
		const endIdx = line.indexOf('"""');
		if (endIdx !== -1) {
			tokens.push(createToken('string', line.slice(0, endIdx + 3), 0));
			state.inMultilineString = false;
			return endIdx + 3;
		}
		tokens.push(createToken('string', line, 0));
		return line.length;
	}
}

export function createSwiftTokenizer(): SwiftTokenizer {
	return new SwiftTokenizer();
}
