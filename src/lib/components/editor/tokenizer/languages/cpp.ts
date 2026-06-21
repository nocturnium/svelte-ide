/**
 * C / C++ tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (introduce a type or template scope)
const definitionKeywords = new Set([
	'class',
	'struct',
	'union',
	'enum',
	'namespace',
	'template',
	'typename',
	'void'
]);

// Storage/specifier keywords
const storageKeywords = new Set([
	'const',
	'static',
	'extern',
	'inline',
	'virtual',
	'explicit',
	'friend',
	'mutable',
	'volatile',
	'constexpr',
	'register',
	'thread_local',
	'public',
	'private',
	'protected'
]);

// Control-flow keywords
const controlKeywords = new Set([
	'if',
	'else',
	'switch',
	'case',
	'default',
	'for',
	'while',
	'do',
	'break',
	'continue',
	'return',
	'goto',
	'try',
	'catch',
	'throw'
]);

// Other keywords
const otherKeywords = new Set([
	'new',
	'delete',
	'sizeof',
	'typeid',
	'this',
	'operator',
	'using',
	'auto',
	'decltype'
]);

// Builtin types
const builtinTypes = new Set([
	'int',
	'char',
	'float',
	'double',
	'void',
	'bool',
	'short',
	'long',
	'unsigned',
	'signed',
	'wchar_t',
	'char8_t',
	'char16_t',
	'char32_t',
	'size_t',
	'ssize_t',
	'ptrdiff_t',
	'int8_t',
	'int16_t',
	'int32_t',
	'int64_t',
	'uint8_t',
	'uint16_t',
	'uint32_t',
	'uint64_t',
	'intptr_t',
	'uintptr_t',
	'std',
	'string',
	'wstring',
	'vector',
	'map',
	'set',
	'pair',
	'array',
	'list',
	'deque',
	'queue',
	'stack',
	'unordered_map',
	'unordered_set',
	'shared_ptr',
	'unique_ptr',
	'weak_ptr'
]);

// Preprocessor directive words (without the leading #)
const preprocessorDirectives = new Set([
	'include',
	'define',
	'undef',
	'ifdef',
	'ifndef',
	'if',
	'else',
	'elif',
	'endif',
	'pragma',
	'error',
	'warning',
	'line',
	'import',
	'using'
]);

interface CppTokenizerState extends TokenizerState {
	/** Inside a multi-line block comment */
	inBlockComment?: boolean;
	/** Inside a multi-line raw string; holds the closing delimiter to look for */
	rawStringDelimiter?: string;
}

export class CppTokenizer {
	language = 'cpp';

	getInitialState(): CppTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: CppTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: CppTokenizerState = { ...prevState };

		// Resume a multi-line block comment
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

		// Resume a multi-line raw string literal R"delim(...)delim"
		if (state.rawStringDelimiter !== undefined) {
			const close = state.rawStringDelimiter;
			const endIdx = line.indexOf(close);
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + close.length), 0));
				pos = endIdx + close.length;
				state.rawStringDelimiter = undefined;
			} else {
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Preprocessor directive: first non-space char on the (fresh) line is '#'
		if (pos === 0) {
			const hashMatch = line.match(/^(\s*)#/);
			if (hashMatch) {
				pos = this.tokenizePreprocessor(line, tokens, hashMatch[1].length);
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

	/**
	 * Emit tokens for a preprocessor line. Returns the position after the directive
	 * word (and, for #include, after the header). The rest of the line is handled by
	 * the normal scanner so trailing comments/macros still classify correctly.
	 */
	private tokenizePreprocessor(line: string, tokens: Token[], hashPos: number): number {
		let pos = hashPos;

		// Leading whitespace before '#'
		if (hashPos > 0) {
			tokens.push(createToken('text', line.slice(0, hashPos), 0));
		}

		// The '#' itself
		tokens.push(createToken('keyword.module', '#', pos));
		pos += 1;

		// Optional whitespace between '#' and the directive word
		const wsAfterHash = line.slice(pos).match(/^[ \t]+/);
		if (wsAfterHash) {
			tokens.push(createToken('text', wsAfterHash[0], pos));
			pos += wsAfterHash[0].length;
		}

		// Directive word
		const dirMatch = line.slice(pos).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (!dirMatch) {
			return pos;
		}
		const directive = dirMatch[0];
		tokens.push(
			createToken(
				preprocessorDirectives.has(directive) ? 'keyword.module' : 'keyword',
				directive,
				pos
			)
		);
		pos += directive.length;

		// For #include, the following <...> or "..." is the header path => string
		if (directive === 'include' || directive === 'import') {
			const wsBeforeHeader = line.slice(pos).match(/^[ \t]+/);
			if (wsBeforeHeader) {
				tokens.push(createToken('text', wsBeforeHeader[0], pos));
				pos += wsBeforeHeader[0].length;
			}
			const headerMatch = line.slice(pos).match(/^(?:<[^>]*>|"[^"]*")/);
			if (headerMatch) {
				tokens.push(createToken('string', headerMatch[0], pos));
				pos += headerMatch[0].length;
			}
		}

		return pos;
	}

	private getNextToken(text: string, pos: number, state: CppTokenizerState): Token | null {
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

		// Raw string literals: (prefix)R"delim(...)delim" — may span lines
		const rawMatch = text.match(/^(?:u8|u|U|L)?R"([^()\\ \t]*)\(/);
		if (rawMatch) {
			return this.tokenizeRawString(text, pos, rawMatch[0], rawMatch[1], state);
		}

		// String literals (with optional encoding prefix)
		const strPrefix = text.match(/^(?:u8|u|U|L)?"/);
		if (strPrefix) {
			return this.tokenizeString(text, pos, strPrefix[0].length);
		}

		// Character literals (with optional encoding prefix)
		const charPrefix = text.match(/^(?:u8|u|U|L)?'/);
		if (charPrefix) {
			return this.tokenizeCharLiteral(text, pos, charPrefix[0].length);
		}

		// Numbers
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F']+(?:\.[0-9a-fA-F']*)?(?:[pP][+-]?\d+)?|0[bB][01']+|(?:\d[\d']*\.?[\d']*|\.\d[\d']*)(?:[eE][+-]?\d+)?)[uUlLfFzZ]*/
		);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators (multi-char first)
		const opMatch = text.match(
			/^(?:<<=|>>=|->\*|\.\.\.|::|->|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[+\-*/%&|^~!<>=])/
		);
		if (opMatch) {
			return createToken(this.classifyOperator(opMatch[0]), opMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;?]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';' || char === ':' || char === '?')
				type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
	}

	private classifyOperator(op: string): TokenType {
		if (op === '::' || op === '->' || op === '.' || op === '->*') return 'punctuation.accessor';
		if (op === '=' || /^[+\-*/%&|^]?=$|^<<=$|^>>=$/.test(op)) return 'operator.assignment';
		if (op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=')
			return 'operator.comparison';
		if (op === '&&' || op === '||' || op === '!') return 'operator.logical';
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%')
			return 'operator.arithmetic';
		return 'operator';
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		// Boolean / null constants
		if (word === 'true' || word === 'false') return 'constant.boolean';
		if (word === 'nullptr') return 'constant.null';
		if (word === 'NULL') return 'constant.builtin';

		// Keywords by category
		if (definitionKeywords.has(word)) return 'keyword.definition';
		if (storageKeywords.has(word)) return 'keyword.storage';
		if (controlKeywords.has(word)) return 'keyword.control';
		if (otherKeywords.has(word)) {
			if (word === 'using') return 'keyword.module';
			return 'keyword';
		}

		// Builtin types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Function call: identifier immediately followed by '('
		const afterWord = context.slice(wordLength);
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// SCREAMING_SNAKE_CASE => macro/constant
		if (/^[A-Z][A-Z0-9_]+$/.test(word) && word.includes('_')) {
			return 'constant';
		}

		// PascalCase => likely a type/class
		if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	private tokenizeString(text: string, pos: number, openLen: number): Token {
		let i = openLen;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === '"') {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			i++;
		}
		// Unterminated (line continuation aside) — emit to end of line
		return createToken('string', text.slice(0, i), pos);
	}

	private tokenizeCharLiteral(text: string, pos: number, openLen: number): Token {
		let i = openLen;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === "'") {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}

	private tokenizeRawString(
		text: string,
		pos: number,
		opener: string,
		delimiter: string,
		state: CppTokenizerState
	): Token {
		const close = `)${delimiter}"`;
		const endIdx = text.indexOf(close, opener.length);
		if (endIdx !== -1) {
			return createToken('string', text.slice(0, endIdx + close.length), pos);
		}
		// Spans to the next line(s)
		state.rawStringDelimiter = close;
		return createToken('string', text, pos);
	}
}

export function createCppTokenizer() {
	return new CppTokenizer();
}
