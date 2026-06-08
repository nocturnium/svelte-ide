/**
 * JavaScript/TypeScript tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// JavaScript/TypeScript keywords
const keywords = new Set([
	'await',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'export',
	'extends',
	'finally',
	'for',
	'function',
	'if',
	'import',
	'in',
	'instanceof',
	'let',
	'new',
	'of',
	'return',
	'static',
	'super',
	'switch',
	'this',
	'throw',
	'try',
	'typeof',
	'var',
	'void',
	'while',
	'with',
	'yield',
	'async',
	'from',
	'as',
	'get',
	'set'
]);

// TypeScript-specific keywords
const tsKeywords = new Set([
	'abstract',
	'any',
	'as',
	'asserts',
	'bigint',
	'boolean',
	'declare',
	'infer',
	'interface',
	'is',
	'keyof',
	'module',
	'namespace',
	'never',
	'null',
	'number',
	'object',
	'override',
	'private',
	'protected',
	'public',
	'readonly',
	'require',
	'string',
	'symbol',
	'type',
	'undefined',
	'unique',
	'unknown',
	'void'
]);

// Control flow keywords
const controlKeywords = new Set([
	'if',
	'else',
	'for',
	'while',
	'do',
	'switch',
	'case',
	'default',
	'break',
	'continue',
	'return',
	'throw',
	'try',
	'catch',
	'finally',
	'await',
	'yield'
]);

// Built-in constants
const builtins = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

// Built-in type names
const builtinTypes = new Set([
	'Array',
	'Object',
	'String',
	'Number',
	'Boolean',
	'Function',
	'Symbol',
	'Promise',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'Date',
	'RegExp',
	'Error',
	'TypeError',
	'ReferenceError',
	'SyntaxError',
	'JSON',
	'Math',
	'console',
	'window',
	'document',
	'globalThis',
	'Buffer',
	'process'
]);

interface JSTokenizerState extends TokenizerState {
	templateDepth?: number;
	jsxDepth?: number;
	/** Track if regex is valid in current context (for division vs regex ambiguity) */
	expectExpression?: boolean;
	/**
	 * Last significant token text, used for regex/division disambiguation.
	 * Stored per-line in the threaded state (not on the tokenizer instance) so a
	 * single cached tokenizer instance can be safely shared across multiple
	 * EditorStates / split views without corrupting each other's context.
	 */
	lastToken?: string;
}

/**
 * Tokens after which a regex literal can appear (expression start context)
 */
const REGEX_VALID_AFTER = new Set([
	// Keywords that expect expressions
	'return',
	'throw',
	'case',
	'in',
	'of',
	'typeof',
	'instanceof',
	'void',
	'delete',
	'new',
	'await',
	'yield',
	'default',
	'extends',
	'else',
	'do',
	// Operators
	'=',
	'==',
	'===',
	'!=',
	'!==',
	'<',
	'>',
	'<=',
	'>=',
	'+',
	'-',
	'*',
	'/',
	'%',
	'**',
	'&',
	'|',
	'^',
	'~',
	'!',
	'&&',
	'||',
	'??',
	'?',
	':',
	',',
	';',
	'+=',
	'-=',
	'*=',
	'/=',
	'%=',
	'**=',
	'&=',
	'|=',
	'^=',
	'&&=',
	'||=',
	'??=',
	'<<',
	'>>',
	'>>>',
	'<<=',
	'>>=',
	'>>>=',
	// Opening brackets
	'(',
	'[',
	'{',
	// Arrow
	'=>'
]);

/**
 * Tokens after which division operator appears (expression end context)
 */
const DIVISION_VALID_AFTER = new Set([
	// These token types indicate an expression just ended
	')',
	']',
	'}', // Closing brackets
	'++',
	'--' // Postfix operators
]);

export class JavaScriptTokenizer {
	language: string;
	private isTypeScript: boolean;
	private isJSX: boolean;

	constructor(options: { typescript?: boolean; jsx?: boolean } = {}) {
		this.isTypeScript = options.typescript ?? false;
		this.isJSX = options.jsx ?? false;
		this.language = this.isTypeScript
			? this.isJSX
				? 'tsx'
				: 'typescript'
			: this.isJSX
				? 'jsx'
				: 'javascript';
	}

	getInitialState(): JSTokenizerState {
		return {
			templateDepth: 0,
			jsxDepth: 0
		};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: JSTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: JSTokenizerState = {
			...this.getInitialState(),
			...prevState
		};

		// Reset context tracking at start of line if no continuation state
		if (!state.inBlockComment && !state.inTemplateLiteral) {
			// At line start, assume expression context (regex is valid)
			state.lastToken = '';
		}

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

		// Handle template literal continuation
		if (state.inTemplateLiteral && (state.templateDepth ?? 0) > 0) {
			const result = this.tokenizeTemplateLiteralContinuation(line, pos, state);
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
				this.updateLastToken(token, state);
				pos = token.end;
			} else {
				// No match - shouldn't happen but handle gracefully
				const fallbackToken = createToken('text', remaining[0], pos);
				tokens.push(fallbackToken);
				this.updateLastToken(fallbackToken, state);
				pos += 1;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	private getNextToken(text: string, pos: number, state: JSTokenizerState): Token | null {
		// Skip whitespace
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

		// Template literals
		if (text.startsWith('`')) {
			return this.tokenizeTemplateLiteral(text, pos, state);
		}

		// Regular strings
		if (text.startsWith('"') || text.startsWith("'")) {
			return this.tokenizeString(text, pos, text[0]);
		}

		// Regular expressions vs division - use context to disambiguate
		if (text.startsWith('/') && !text.startsWith('//') && !text.startsWith('/*')) {
			// Check if we're in a context where regex is valid
			const canBeRegex = this.canStartRegex(state);

			if (canBeRegex) {
				const regexLiteral = this.tryMatchRegex(text);
				if (regexLiteral) {
					return createToken('string.regex', regexLiteral, pos);
				}
			}
			// Otherwise, fall through to operator handling (will be tokenized as '/')
		}

		// Numbers
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?n?)/
		);
		if (numMatch) {
			const numText = numMatch[0];
			let type: TokenType = 'number';
			if (numText.startsWith('0x') || numText.startsWith('0X')) {
				type = 'number.hex';
			} else if (numText.startsWith('0b') || numText.startsWith('0B')) {
				type = 'number.binary';
			} else if (numText.includes('.') || numText.includes('e') || numText.includes('E')) {
				type = 'number.float';
			} else {
				type = 'number.integer';
			}
			return createToken(type, numText, pos);
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, identMatch[0].length), word, pos);
		}

		// JSX tags (basic)
		if (this.isJSX && text.startsWith('<')) {
			return this.tokenizeJSXTag(text, pos, state);
		}

		// Operators
		const opMatch = text.match(
			/^(?:>>>|===|!==|<<=|>>=|=>|&&|\|\||[+\-*/%&|^!<>=]=?|[?:.~]|\?\?|\?\.)/
		);
		if (opMatch) {
			return createToken('operator', opMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),;]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';') type = 'punctuation.separator';
			return createToken(type, char, pos);
		}

		// Dot accessor
		if (text.startsWith('.')) {
			return createToken('punctuation.accessor', '.', pos);
		}

		// Default: single character
		return createToken('text', text[0], pos);
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		// Check for built-in constants
		if (builtins.has(word)) {
			if (word === 'true' || word === 'false') return 'constant.boolean';
			if (word === 'null' || word === 'undefined') return 'constant.null';
			return 'constant.builtin';
		}

		// Check for keywords
		if (keywords.has(word)) {
			if (controlKeywords.has(word)) return 'keyword.control';
			if (
				word === 'function' ||
				word === 'class' ||
				word === 'const' ||
				word === 'let' ||
				word === 'var'
			) {
				return 'keyword.definition';
			}
			if (word === 'import' || word === 'export' || word === 'from' || word === 'as') {
				return 'keyword.module';
			}
			return 'keyword';
		}

		// TypeScript keywords
		if (this.isTypeScript && tsKeywords.has(word)) {
			if (word === 'interface' || word === 'type' || word === 'namespace' || word === 'module') {
				return 'keyword.definition';
			}
			// Type keywords like 'string', 'number', 'boolean' etc
			if (
				[
					'string',
					'number',
					'boolean',
					'any',
					'unknown',
					'never',
					'void',
					'null',
					'undefined',
					'object',
					'symbol',
					'bigint'
				].includes(word)
			) {
				return 'type.builtin';
			}
			return 'keyword.storage';
		}

		// Check if followed by ( - likely a function call
		const afterWord = context.slice(wordLength).trim();
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// Check if it's a type (PascalCase)
		if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
			if (builtinTypes.has(word)) return 'type.builtin';
			return 'type.class';
		}

		// Would need more context to detect 'function foo' pattern

		return 'variable';
	}

	/**
	 * Check if a regex literal can start in the current context
	 * This disambiguates between `/` as division vs regex start.
	 * Reads the last significant token from the threaded per-line state.
	 */
	private canStartRegex(state: JSTokenizerState): boolean {
		const lastToken = state.lastToken;

		// At start of expression or line, regex is valid
		if (!lastToken) return true;

		// After certain operators and keywords, regex is valid
		if (REGEX_VALID_AFTER.has(lastToken)) return true;

		// After identifiers, numbers, or closing brackets, it's division
		if (DIVISION_VALID_AFTER.has(lastToken)) return false;

		// If last token was an identifier or number, it's likely division
		// (e.g., `x / 2` or `5 / 2`)
		if (/^[a-zA-Z_$]/.test(lastToken) || /^\d/.test(lastToken)) {
			return false;
		}

		// Default to allowing regex in ambiguous cases
		return true;
	}

	/**
	 * Update the last token for context tracking.
	 * Stores onto the threaded per-line state so that a shared tokenizer
	 * instance does not leak context across documents.
	 */
	private updateLastToken(token: Token, state: JSTokenizerState): void {
		// Track significant tokens for regex/division disambiguation
		const text = token.text.trim();
		if (text && token.type !== 'comment' && !token.type.startsWith('comment.')) {
			state.lastToken = text;
		}
	}

	/**
	 * Try to match a regex literal using iterative parsing (avoids regex DoS)
	 * Returns the matched regex string or null if not a valid regex
	 */
	private tryMatchRegex(text: string): string | null {
		if (text.length < 2 || text[0] !== '/') return null;

		let i = 1;
		let inCharClass = false;

		// Match regex body
		while (i < text.length) {
			const char = text[i];

			// End of line means not a valid regex literal
			if (char === '\n') return null;

			// Handle escape sequences
			if (char === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}

			// Track character class [...] to ignore / inside
			if (char === '[' && !inCharClass) {
				inCharClass = true;
				i++;
				continue;
			}
			if (char === ']' && inCharClass) {
				inCharClass = false;
				i++;
				continue;
			}

			// End of regex body (not inside character class)
			if (char === '/' && !inCharClass) {
				i++; // Include the closing /

				// Match flags
				while (i < text.length && /[gimsuvy]/.test(text[i])) {
					i++;
				}

				return text.slice(0, i);
			}

			i++;
		}

		return null; // Unclosed regex
	}

	private tokenizeString(text: string, pos: number, delimiter: string): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2; // Skip escape sequence
				continue;
			}
			if (text[i] === delimiter) {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			if (text[i] === '\n') {
				// Unterminated string
				return createToken('string', text.slice(0, i), pos);
			}
			i++;
		}
		// Unterminated string at end of line
		return createToken('string', text, pos);
	}

	private tokenizeTemplateLiteral(text: string, pos: number, state: JSTokenizerState): Token {
		let i = 1;
		let result = '`';

		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				result += text.slice(i, i + 2);
				i += 2;
				continue;
			}
			if (text[i] === '`') {
				result += '`';
				return createToken('string.template', result, pos);
			}
			if (text[i] === '$' && text[i + 1] === '{') {
				// Template expression - for simplicity, tokenize up to this point
				if (result.length > 1) {
					// Return string part first
					state.inTemplateLiteral = true;
					state.templateDepth = (state.templateDepth ?? 0) + 1;
					return createToken('string.template', result, pos);
				}
			}
			result += text[i];
			i++;
		}

		// Multi-line template literal
		state.inTemplateLiteral = true;
		return createToken('string.template', result, pos);
	}

	private tokenizeTemplateLiteralContinuation(
		line: string,
		startPos: number,
		state: JSTokenizerState
	): { tokens: Token[]; pos: number } {
		const tokens: Token[] = [];
		let pos = startPos;
		let result = '';

		while (pos < line.length) {
			if (line[pos] === '\\' && pos + 1 < line.length) {
				result += line.slice(pos, pos + 2);
				pos += 2;
				continue;
			}
			if (line[pos] === '`') {
				result += '`';
				tokens.push(createToken('string.template', result, startPos));
				state.inTemplateLiteral = false;
				state.templateDepth = Math.max(0, (state.templateDepth ?? 1) - 1);
				return { tokens, pos: pos + 1 };
			}
			result += line[pos];
			pos++;
		}

		if (result) {
			tokens.push(createToken('string.template', result, startPos));
		}
		return { tokens, pos };
	}

	private tokenizeJSXTag(text: string, pos: number, _state: JSTokenizerState): Token {
		// Simple JSX tag detection
		const match = text.match(/^<\/?[a-zA-Z][a-zA-Z0-9.]*(?:\s+[^>]*)?\/?>/);
		if (match) {
			return createToken('tag', match[0], pos);
		}
		// Just the opening <
		return createToken('tag.punctuation', '<', pos);
	}
}

// Factory functions for convenience
export function createJavaScriptTokenizer() {
	return new JavaScriptTokenizer();
}

export function createTypeScriptTokenizer() {
	return new JavaScriptTokenizer({ typescript: true });
}

export function createJSXTokenizer() {
	return new JavaScriptTokenizer({ jsx: true });
}

export function createTSXTokenizer() {
	return new JavaScriptTokenizer({ typescript: true, jsx: true });
}
