/**
 * Rust tokenizer
 */

import type { LanguageTokenizer, Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Rust keywords (all reserved words, used for the membership check)
const keywords = new Set([
	'as',
	'async',
	'await',
	'break',
	'const',
	'continue',
	'crate',
	'dyn',
	'else',
	'enum',
	'extern',
	'fn',
	'for',
	'if',
	'impl',
	'in',
	'let',
	'loop',
	'match',
	'mod',
	'move',
	'mut',
	'pub',
	'ref',
	'return',
	'self',
	'Self',
	'static',
	'struct',
	'super',
	'trait',
	'type',
	'union',
	'unsafe',
	'use',
	'where',
	'while',
	'yield',
	// Reserved-for-future-use keywords. They have no current syntactic role but
	// are reserved words, so they must highlight as keywords rather than fall
	// through to plain identifiers.
	'abstract',
	'become',
	'box',
	'do',
	'final',
	'macro',
	'override',
	'priv',
	'try',
	'typeof',
	'unsized',
	'virtual'
]);

// Definition keywords (introduce a named item)
const definitionKeywords = new Set([
	'fn',
	'struct',
	'enum',
	'trait',
	'impl',
	'type',
	'mod',
	'union'
]);

// Storage / binding modifier keywords
const storageKeywords = new Set(['let', 'mut', 'const', 'static', 'ref', 'move', 'dyn']);

// Module / visibility keywords
const moduleKeywords = new Set(['use', 'crate', 'pub', 'extern']);

// Control-flow keywords
const controlKeywords = new Set([
	'if',
	'else',
	'match',
	'loop',
	'while',
	'for',
	'break',
	'continue',
	'return',
	'yield'
]);

// Built-in / primitive types
const builtinTypes = new Set([
	'i8',
	'i16',
	'i32',
	'i64',
	'i128',
	'isize',
	'u8',
	'u16',
	'u32',
	'u64',
	'u128',
	'usize',
	'f32',
	'f64',
	'bool',
	'char',
	'str',
	'String',
	'Vec',
	'Box',
	'Option',
	'Result',
	'Rc',
	'Arc',
	'HashMap',
	'HashSet',
	'Cow'
]);

// Built-in enum variants / constants
const builtinConstants = new Set(['None', 'Some', 'Ok', 'Err']);

interface RustTokenizerState extends TokenizerState {
	/** Currently inside a multi-line raw string */
	inRawString?: boolean;
	/** Number of closing hashes the active raw string requires */
	rawHashes?: number;
}

export class RustTokenizer implements LanguageTokenizer {
	language = 'rust';

	getInitialState(): RustTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: RustTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: RustTokenizerState = { ...prevState };

		// Shebang: only valid as the very first line, and only when it is NOT an
		// inner attribute (`#![...]`). `#!/usr/bin/env ...` is a shebang and Rust
		// ignores the whole line; render it as a line comment so it does not get
		// shredded into stray `!`, `/`, and identifier tokens.
		if (lineNumber === 1 && line.startsWith('#!') && line[2] !== '[') {
			tokens.push(createToken('comment.line', line, 0));
			return { lineNumber, tokens, text: line, state };
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

		// Handle raw string continuation
		if (state.inRawString) {
			const closing = '"' + '#'.repeat(state.rawHashes ?? 0);
			const endIdx = line.indexOf(closing);
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + closing.length), 0));
				pos = endIdx + closing.length;
				state.inRawString = false;
				state.rawHashes = undefined;
			} else {
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const prevToken = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
			const subTokens = this.getNextToken(remaining, pos, state, prevToken);

			if (subTokens && subTokens.length > 0) {
				tokens.push(...subTokens);
				pos = subTokens[subTokens.length - 1].end;
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
		state: RustTokenizerState,
		prevToken?: Token
	): Token[] | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return [createToken('text', wsMatch[0], pos)];
		}

		// Doc comments (/// and //!) must be checked before plain line comments
		if (text.startsWith('///') || text.startsWith('//!')) {
			return [createToken('comment.doc', text, pos)];
		}

		// Line comments
		if (text.startsWith('//')) {
			return [createToken('comment.line', text, pos)];
		}

		// Block comments (treated as non-nesting)
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return [createToken('comment.block', text.slice(0, endIdx + 2), pos)];
			}
			state.inBlockComment = true;
			return [createToken('comment.block', text, pos)];
		}

		// Attributes: #[...] and #![...]
		if (text.startsWith('#[') || text.startsWith('#![')) {
			const closeIdx = text.indexOf(']');
			if (closeIdx !== -1) {
				return [createToken('keyword', text.slice(0, closeIdx + 1), pos)];
			}
			// Unterminated on this line — claim the rest as keyword (lossless)
			return [createToken('keyword', text, pos)];
		}

		// Raw strings: r"...", r#"..."#, br"...", and more hashes.
		// Must run BEFORE the raw-identifier check so `r#"..."#` is a string, not
		// `r#` + identifier.
		const rawMatch = text.match(/^(b?r)(#*)"/);
		if (rawMatch) {
			return [this.tokenizeRawString(text, pos, rawMatch[1].length, rawMatch[2].length, state)];
		}

		// Raw identifiers: `r#match`, `r#fn`, `r#async` — `r#` followed by an
		// identifier (which may be a keyword). The whole thing is ONE identifier,
		// so the keyword must NOT be highlighted as a keyword in the middle of it.
		const rawIdentMatch = text.match(/^r#([a-zA-Z_][a-zA-Z0-9_]*)/);
		if (rawIdentMatch) {
			const word = rawIdentMatch[0];
			const after = text.slice(word.length);
			// A raw identifier can still be a macro (`r#try!`) or a call.
			if (after.startsWith('!') && !after.startsWith('!=')) {
				return [createToken('function.call', word + '!', pos)];
			}
			const type: TokenType = after.trimStart().startsWith('(') ? 'function.call' : 'variable';
			return [createToken(type, word, pos)];
		}

		// Byte strings: b"..."
		if (text.startsWith('b"')) {
			return this.tokenizeString(text, pos, 1);
		}

		// Byte char literal: b'A', b'\n', b'\xFF'. The `b` prefix is part of the
		// literal — it must not split off as a separate identifier token.
		if (text.startsWith("b'")) {
			const byteCharMatch = text.match(/^b'(?:\\(?:x[0-9a-fA-F]{2}|[nrt0\\'"])|[^'\\])'/);
			if (byteCharMatch) {
				return [createToken('string', byteCharMatch[0], pos)];
			}
		}

		// Regular strings: "..."
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos, 0);
		}

		// Character literals vs lifetimes — both begin with an apostrophe
		if (text.startsWith("'")) {
			return this.tokenizeQuoteConstruct(text, pos);
		}

		// Numbers (with _ separators, 0x/0o/0b, exponents, and type suffixes).
		// A number MUST begin with a digit: the fractional part requires a digit
		// after the dot (\.\d...) so a trailing `..` range (e.g. 0..10) is not
		// swallowed as a float. A number may NOT begin with a leading dot — Rust
		// has no leading-dot floats (`.5` is invalid), and allowing one would eat
		// the accessor dot in tuple-field access like `tuple.0` / `self.0.1`.
		//
		// Immediately after a field accessor (`.`), a number is a tuple-field
		// INDEX and must be lexed as an integer only — never a float — so that a
		// nested access like `a.0.1.2` reads as `a . 0 . 1 . 2` rather than letting
		// `0.1` collapse into one float token and swallow the second accessor dot.
		const afterAccessor = prevToken?.type === 'punctuation.accessor' && prevToken.text === '.';
		const numMatch = afterAccessor
			? text.match(/^\d[\d_]*/)
			: text.match(
					/^(?:0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?[\d_]+)?)(?:[iuf](?:8|16|32|64|128|size))?/
				);
		if (numMatch) {
			return [createToken('number', numMatch[0], pos)];
		}

		// Identifiers, keywords, macros
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			const after = text.slice(word.length);
			// Macro invocation: identifier immediately followed by '!' (but not '!=')
			if (after.startsWith('!') && !after.startsWith('!=')) {
				return [createToken('function.call', word + '!', pos)];
			}
			return [createToken(this.classifyIdentifier(word, text, word.length), word, pos)];
		}

		// Operators (longest-match first)
		const opMatch = text.match(
			/^(?:\.\.=|\.\.\.|->|=>|::|\.\.|<<=|>>=|&&|\|\||==|!=|<=|>=|<<|>>|[-+*/%&|^!<>=]=|[-+*/%&|^!<>=?])/
		);
		if (opMatch) {
			const op = opMatch[0];
			return [createToken(this.classifyOperator(op), op, pos)];
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;@#]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';' || char === ':') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			return [createToken(type, char, pos)];
		}

		return [createToken('text', text[0], pos)];
	}

	private classifyOperator(op: string): TokenType {
		if (op === '->' || op === '=>' || op === '::' || op === '..' || op === '..=' || op === '...') {
			return 'operator';
		}
		if (op === '&&' || op === '||' || op === '!') {
			return 'operator.logical';
		}
		if (op === '==' || op === '!=' || op === '<=' || op === '>=' || op === '<' || op === '>') {
			return 'operator.comparison';
		}
		// Compound and simple assignment (=, +=, -=, *=, /=, %=, &=, |=, ^=, <<=, >>=)
		if (
			op === '=' ||
			(op.endsWith('=') && op !== '==' && op !== '!=' && op !== '<=' && op !== '>=')
		) {
			return 'operator.assignment';
		}
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
			return 'operator.arithmetic';
		}
		return 'operator';
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		// Booleans
		if (word === 'true' || word === 'false') {
			return 'constant.boolean';
		}

		// Built-in enum variants / constants (Some, None, Ok, Err)
		if (builtinConstants.has(word)) {
			return 'constant.builtin';
		}

		// Keywords
		if (keywords.has(word)) {
			if (controlKeywords.has(word)) return 'keyword.control';
			if (definitionKeywords.has(word)) return 'keyword.definition';
			if (storageKeywords.has(word)) return 'keyword.storage';
			if (moduleKeywords.has(word)) return 'keyword.module';
			return 'keyword';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Function call: identifier immediately followed by (
		const afterWord = context.slice(wordLength).trim();
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// Constant convention: ALL_CAPS
		if (/^[A-Z][A-Z0-9_]*$/.test(word) && word.length > 1) {
			return 'constant';
		}

		// Type convention: PascalCase
		if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	private tokenizeRawString(
		text: string,
		pos: number,
		prefixLen: number,
		hashes: number,
		state: RustTokenizerState
	): Token {
		const closing = '"' + '#'.repeat(hashes);
		// Search for the closing delimiter after the opening r#..#"
		const openLen = prefixLen + hashes + 1;
		const endIdx = text.indexOf(closing, openLen);
		if (endIdx !== -1) {
			return createToken('string', text.slice(0, endIdx + closing.length), pos);
		}
		state.inRawString = true;
		state.rawHashes = hashes;
		return createToken('string', text, pos);
	}

	/**
	 * Tokenize a double-quoted (or byte) string into a string token plus inline
	 * string.escape tokens for recognized escape sequences.
	 */
	private tokenizeString(text: string, pos: number, prefixLen: number): Token[] {
		const tokens: Token[] = [];
		// Opening prefix + quote
		let segStart = 0;
		let i = prefixLen + 1; // skip prefix (b) and opening quote

		const flushPlain = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken('string', text.slice(segStart, end), pos + segStart));
			}
		};

		while (i < text.length) {
			const ch = text[i];
			if (ch === '\\' && i + 1 < text.length) {
				const escMatch = text
					.slice(i)
					.match(/^\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|[nrt0\\'"]|.)/);
				const escLen = escMatch ? escMatch[0].length : 2;
				flushPlain(i);
				tokens.push(createToken('string.escape', text.slice(i, i + escLen), pos + i));
				i += escLen;
				segStart = i;
				continue;
			}
			if (ch === '"') {
				flushPlain(i + 1);
				return tokens;
			}
			i++;
		}
		// Unterminated string (Rust strings can span lines, but we treat the
		// remainder of the line as string so the line stays lossless)
		flushPlain(text.length);
		return tokens;
	}

	/**
	 * Disambiguate an apostrophe: a char literal ('a', '\n', '\u{1F}') vs a
	 * lifetime ('a, 'static). A lifetime is an apostrophe + identifier with NO
	 * immediately-following closing apostrophe.
	 */
	private tokenizeQuoteConstruct(text: string, pos: number): Token[] {
		// Char literal: 'x' or an escape, then a closing apostrophe
		const charMatch = text.match(
			/^'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|[nrt0\\'"])|[^'\\])'/
		);
		if (charMatch) {
			return [createToken('string', charMatch[0], pos)];
		}

		// Lifetime: 'ident with no closing apostrophe right after a single char
		const lifetimeMatch = text.match(/^'(?:[a-zA-Z_][a-zA-Z0-9_]*|static)/);
		if (lifetimeMatch && text[lifetimeMatch[0].length] !== "'") {
			return [createToken('keyword.operator', lifetimeMatch[0], pos)];
		}

		// Bare apostrophe — emit as text to stay lossless
		return [createToken('text', "'", pos)];
	}
}

export function createRustTokenizer(): LanguageTokenizer {
	return new RustTokenizer();
}
