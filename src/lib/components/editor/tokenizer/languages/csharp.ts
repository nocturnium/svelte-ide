/**
 * C# tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// C# keywords (all reserved words, for membership checks)
const keywords = new Set([
	'abstract',
	'as',
	'async',
	'await',
	'base',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'delegate',
	'do',
	'else',
	'enum',
	'extern',
	'finally',
	'for',
	'foreach',
	'goto',
	'if',
	'in',
	'interface',
	'internal',
	'is',
	'lock',
	'nameof',
	'namespace',
	'new',
	'out',
	'override',
	'params',
	'partial',
	'private',
	'protected',
	'public',
	'readonly',
	'record',
	'ref',
	'return',
	'sealed',
	'static',
	'struct',
	'switch',
	'this',
	'throw',
	'try',
	'typeof',
	'unsafe',
	'using',
	'var',
	'virtual',
	'void',
	'volatile',
	'when',
	'while',
	'yield'
]);

const definitionKeywords = new Set([
	'class',
	'struct',
	'interface',
	'enum',
	'record',
	'delegate',
	'void',
	'namespace'
]);

const storageKeywords = new Set([
	'public',
	'private',
	'protected',
	'internal',
	'static',
	'readonly',
	'const',
	'sealed',
	'abstract',
	'virtual',
	'override',
	'async',
	'partial',
	'extern',
	'unsafe',
	'volatile'
]);

const controlKeywords = new Set([
	'if',
	'else',
	'switch',
	'case',
	'for',
	'foreach',
	'while',
	'do',
	'break',
	'continue',
	'return',
	'throw',
	'try',
	'catch',
	'finally',
	'yield',
	'await',
	'goto',
	'lock'
]);

const moduleKeywords = new Set(['using']);

const builtinTypes = new Set([
	'int',
	'string',
	'bool',
	'double',
	'float',
	'decimal',
	'object',
	'byte',
	'sbyte',
	'char',
	'long',
	'ulong',
	'short',
	'ushort',
	'uint',
	'nint',
	'nuint',
	'dynamic',
	'Task',
	'List',
	'Dictionary',
	'IEnumerable',
	'String',
	'Object'
]);

interface CSharpTokenizerState extends TokenizerState {
	/** Inside a multi-line verbatim string (@"...") */
	inVerbatimString?: boolean;
	/** The verbatim string carrying through is interpolated ($@"...") */
	verbatimInterpolated?: boolean;
	/** Inside a multi-line raw string literal ("""...""") */
	inRawString?: boolean;
	/** The number of quotes that closes the carrying raw string */
	rawQuoteCount?: number;
	/** The carrying raw string is interpolated ($"""...) */
	rawInterpolated?: boolean;
}

/** Preprocessor directive names (`#` already consumed). */
const preprocessorDirectives = new Set([
	'if',
	'elif',
	'else',
	'endif',
	'define',
	'undef',
	'warning',
	'error',
	'line',
	'region',
	'endregion',
	'pragma',
	'nullable',
	'checksum'
]);

export class CSharpTokenizer {
	language = 'csharp';

	getInitialState(): CSharpTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: CSharpTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: CSharpTokenizerState = { ...prevState };

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

		// Handle raw string continuation ("""..."""  spanning multiple lines)
		if (state.inRawString) {
			const type: TokenType = state.rawInterpolated ? 'string.template' : 'string';
			const quoteCount = state.rawQuoteCount ?? 3;
			const closeIdx = this.findRawStringClose(line, 0, quoteCount);
			if (closeIdx !== -1) {
				const end = closeIdx + quoteCount;
				tokens.push(createToken(type, line.slice(0, end), 0));
				pos = end;
				state.inRawString = false;
				state.rawQuoteCount = undefined;
				state.rawInterpolated = false;
			} else {
				tokens.push(createToken(type, line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Handle verbatim string continuation (@"..." spanning multiple lines)
		if (state.inVerbatimString) {
			const type: TokenType = state.verbatimInterpolated ? 'string.template' : 'string';
			const endIdx = this.findVerbatimEnd(line, 0);
			if (endIdx !== -1) {
				tokens.push(createToken(type, line.slice(0, endIdx + 1), 0));
				pos = endIdx + 1;
				state.inVerbatimString = false;
				state.verbatimInterpolated = false;
			} else {
				tokens.push(createToken(type, line, 0));
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

	private getNextToken(text: string, pos: number, state: CSharpTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Preprocessor directives (#region, #if, #nullable, #pragma, ...). These are
		// only valid at the start of a line (after whitespace, already consumed), and
		// `#` has no other meaning in C#, so consume the whole rest of the line as one
		// directive token. The directive word must be a recognized directive.
		if (text[0] === '#') {
			const dirMatch = text.match(/^#\s*([a-zA-Z]+)/);
			if (dirMatch && preprocessorDirectives.has(dirMatch[1])) {
				return createToken('keyword', text, pos);
			}
		}

		// XML doc comments (/// ...) — must be checked before line comments
		if (text.startsWith('///')) {
			return createToken('comment.doc', text, pos);
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
			}
			state.inBlockComment = true;
			return createToken('comment.block', text, pos);
		}

		// Raw string literals: """..."""  and interpolated raw $"""...""" / $$"""...
		// The opening delimiter is an optional run of `$` followed by a run of >= 3
		// double-quotes. The literal closes on the first run of the SAME number of
		// quotes; shorter runs inside are content (this is what lets a raw string
		// contain "" or """). Checked before the @/$ string handlers below so the
		// triple-quote run is not mistaken for an empty "" string.
		const rawMatch = text.match(/^(\$*)("{3,})/);
		if (rawMatch) {
			const dollars = rawMatch[1];
			const interpolated = dollars.length > 0;
			const quoteCount = rawMatch[2].length;
			const type: TokenType = interpolated ? 'string.template' : 'string';
			const contentStart = dollars.length + quoteCount;
			const closeIdx = this.findRawStringClose(text, contentStart, quoteCount);
			if (closeIdx !== -1) {
				const end = closeIdx + quoteCount;
				return createToken(type, text.slice(0, end), pos);
			}
			state.inRawString = true;
			state.rawQuoteCount = quoteCount;
			state.rawInterpolated = interpolated;
			return createToken(type, text, pos);
		}

		// Verbatim / interpolated-verbatim strings: @"...", $@"...", @$"..."
		const verbatimPrefix = text.match(/^(?:\$@|@\$|@)"/);
		if (verbatimPrefix) {
			const prefix = verbatimPrefix[0];
			const interpolated = prefix.includes('$');
			const type: TokenType = interpolated ? 'string.template' : 'string';
			const endIdx = this.findVerbatimEnd(text, prefix.length - 1);
			if (endIdx !== -1) {
				return createToken(type, text.slice(0, endIdx + 1), pos);
			}
			state.inVerbatimString = true;
			state.verbatimInterpolated = interpolated;
			return createToken(type, text, pos);
		}

		// Interpolated strings: $"..." (single line)
		if (text.startsWith('$"')) {
			return this.tokenizeInterpolated(text, pos);
		}

		// Regular double-quoted strings
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos);
		}

		// Char literals: 'a', '\n', 'A'
		if (text.startsWith("'")) {
			const charMatch = text.match(
				/^'(?:[^'\\]|\\(?:[0abfnrtv\\'"]|x[0-9a-fA-F]{1,4}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}))'/
			);
			if (charMatch) {
				return createToken('string', charMatch[0], pos);
			}
		}

		// Numbers (hex, binary, decimal/float with underscores and suffixes)
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+(?:[uUlL]+)?|0[bB][01_]+(?:[uUlL]+)?|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?(?:[fFdDmMuUlL]+)?)/
		);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Identifiers and keywords (allow leading @ for verbatim identifiers like @class)
		const identMatch = text.match(/^@?[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators
		const opMatch = text.match(
			/^(?:\?\?=|>>=|<<=|=>|\?\?|\?\.|\.\.|\+\+|--|&&|\|\||==|!=|<=|>=|->|<<|>>|[+\-*/%&|^!<>=]=?)/
		);
		if (opMatch) {
			const op = opMatch[0];
			let type: TokenType = 'operator';
			if (op === '=' || op === '+=' || op === '-=' || op === '*=' || op === '/=' || op === '%=') {
				type = 'operator.assignment';
			} else if (
				op === '==' ||
				op === '!=' ||
				op === '<' ||
				op === '>' ||
				op === '<=' ||
				op === '>='
			) {
				type = 'operator.comparison';
			} else if (op === '&&' || op === '||' || op === '!') {
				type = 'operator.logical';
			} else if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
				type = 'operator.arithmetic';
			}
			return createToken(type, op, pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;?]/);
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
		if (word === 'true' || word === 'false') return 'constant.boolean';
		if (word === 'null') return 'constant.null';

		// Keywords
		if (keywords.has(word)) {
			if (definitionKeywords.has(word)) return 'keyword.definition';
			if (storageKeywords.has(word)) return 'keyword.storage';
			if (controlKeywords.has(word)) return 'keyword.control';
			if (moduleKeywords.has(word)) return 'keyword.module';
			return 'keyword';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Followed by ( => function call
		const afterWord = context.slice(wordLength).trim();
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// PascalCase => class/type
		if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	/** Scan a regular double-quoted string starting at pos, handling backslash escapes. */
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

	/** Scan a single-line interpolated string $"..." as one string.template token. */
	private tokenizeInterpolated(text: string, pos: number): Token {
		// Skip the leading $
		let i = 2;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			// Escaped braces {{ and }} are literal, not interpolation boundaries.
			if ((text[i] === '{' && text[i + 1] === '{') || (text[i] === '}' && text[i + 1] === '}')) {
				i += 2;
				continue;
			}
			if (text[i] === '"') {
				return createToken('string.template', text.slice(0, i + 1), pos);
			}
			if (text[i] === '\n') {
				break;
			}
			i++;
		}
		return createToken('string.template', text.slice(0, i), pos);
	}

	/**
	 * Find the start index of the closing delimiter of a raw string literal — the
	 * first maximal run of double-quotes whose length is exactly `quoteCount`. A run
	 * shorter than `quoteCount` is content; a run longer would itself be malformed,
	 * so we require an exact match. Scanning starts at `from`. Returns -1 if no
	 * closing run is found on this slice (the literal continues to the next line).
	 */
	private findRawStringClose(text: string, from: number, quoteCount: number): number {
		let i = from;
		while (i < text.length) {
			if (text[i] === '"') {
				const runStart = i;
				let run = 0;
				while (i < text.length && text[i] === '"') {
					run++;
					i++;
				}
				// A run of >= quoteCount quotes closes the literal; its first
				// `quoteCount` quotes are the delimiter. A shorter run is content.
				if (run >= quoteCount) {
					return runStart;
				}
			} else {
				i++;
			}
		}
		return -1;
	}

	/**
	 * Find the closing quote of a verbatim string, treating a doubled quote ("")
	 * as an escaped literal quote rather than a terminator. `from` is the index of
	 * the opening quote.
	 */
	private findVerbatimEnd(text: string, from: number): number {
		let i = from + 1;
		while (i < text.length) {
			if (text[i] === '"') {
				if (text[i + 1] === '"') {
					i += 2;
					continue;
				}
				return i;
			}
			i++;
		}
		return -1;
	}
}

export function createCSharpTokenizer() {
	return new CSharpTokenizer();
}
