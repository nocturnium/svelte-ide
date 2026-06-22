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
	/** Currently inside a multi-line (quote) string carried across lines */
	inString?: boolean;
	/** The prefix length of the active multi-line string (0 = plain, 1 = b") */
	stringPrefixLen?: number;
	/**
	 * Nesting depth of block comments. Rust block comments NEST, so we count how
	 * many open-comment markers are pending and only leave the comment when the
	 * matching close-comment markers bring the depth back to zero.
	 */
	blockCommentDepth?: number;
	/**
	 * Depth of open type-argument angle brackets (`<` ... `>`). When > 0 we are
	 * inside a generic/type-argument list, so `<`, `>`, and `>>` lex as
	 * `punctuation.bracket` rather than comparison/shift operators. Reset at
	 * statement boundaries within a line so a stray `<` in an expression does
	 * not poison the rest of the line.
	 */
	angleDepth?: number;
}

/**
 * The most recent token that is not insignificant whitespace. Whitespace is
 * emitted as a `text` token of spaces/tabs; context classification (definition
 * position, property access, generic open) must look past it.
 */
function lastMeaningful(tokens: Token[]): Token | undefined {
	for (let k = tokens.length - 1; k >= 0; k--) {
		const t = tokens[k];
		if (t.type === 'text' && /^[ \t]*$/.test(t.text)) continue;
		return t;
	}
	return undefined;
}

/**
 * Classify a numeric literal into a precise number subtype based on its
 * radix / shape. Octal has no dedicated TokenType, so it maps to integer.
 */
function classifyNumber(num: string): TokenType {
	if (/^0[xX]/.test(num)) return 'number.hex';
	if (/^0[bB]/.test(num)) return 'number.binary';
	// A float has a fractional part (`.` followed by a digit), an exponent, or
	// an explicit float suffix (f32/f64). Hex/binary/octal are integers.
	if (/^0[oO]/.test(num)) return 'number.integer';
	if (/\.\d|[eE][+-]?\d|f(?:32|64)$/.test(num)) return 'number.float';
	return 'number.integer';
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

		// Handle block comment continuation (nesting-aware). `state.inBlockComment`
		// is kept in sync for compatibility, but `blockCommentDepth` is the source
		// of truth so nested `/* ... /* ... */ ... */` close correctly.
		if (state.inBlockComment) {
			const consumed = this.consumeBlockComment(line, 0, state);
			tokens.push(createToken('comment.block', line.slice(0, consumed), 0));
			pos = consumed;
			if (state.inBlockComment) {
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

		// Handle plain/byte string continuation (Rust strings can span lines).
		// Sub-tokenize the continuation for escapes and format interpolation just
		// like an opening line, threading state when it still does not close.
		if (state.inString) {
			const strTokens = this.tokenizeString(line, 0, 0, state, true);
			tokens.push(...strTokens);
			pos = strTokens.length > 0 ? strTokens[strTokens.length - 1].end : line.length;
			if (state.inString) {
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			// The previous *meaningful* token drives context classification (def
			// position, property access, generic open). Skip whitespace, which is
			// emitted as a `text` token of spaces/tabs, so `fn  name` still sees `fn`.
			const prevToken = lastMeaningful(tokens);
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

		// Block comments (NESTING — Rust block comments nest, unlike C). We open
		// one level and let consumeBlockComment count matching `/*` / `*/` pairs.
		if (text.startsWith('/*')) {
			state.inBlockComment = true;
			state.blockCommentDepth = (state.blockCommentDepth ?? 0) + 1;
			const consumed = this.consumeBlockComment(text, 2, state);
			return [createToken('comment.block', text.slice(0, consumed), pos)];
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
			return this.tokenizeString(text, pos, 1, state);
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
			return this.tokenizeString(text, pos, 0, state);
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
			// A tuple-field index after an accessor is always an integer index.
			const type = afterAccessor ? 'number.integer' : classifyNumber(numMatch[0]);
			return [createToken(type, numMatch[0], pos)];
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
			return [createToken(this.classifyIdentifier(word, text, word.length, prevToken), word, pos)];
		}

		// Generic / type-argument angle brackets. We only treat `<` as a bracket
		// when it opens a type-argument list — i.e. it directly follows a type
		// name or a turbofish `::`. Once depth > 0, the matching `>` (and the
		// fused `>>` that closes two nested lists) are brackets too. This keeps a
		// genuine comparison `a < b` as a comparison operator while painting
		// `Vec<HashMap<String, u32>>` and `parse::<u32>()` as brackets.
		if (text[0] === '<' && text[1] !== '<' && text[1] !== '=') {
			if (this.opensGeneric(prevToken)) {
				state.angleDepth = (state.angleDepth ?? 0) + 1;
				return [createToken('punctuation.bracket', '<', pos)];
			}
		}
		// `>=` and `>>=` inside a generic list are impossible, so leave them to the
		// comparison/assignment path. Any other `>` closes one (or two) open levels.
		const isShiftAssign = text[0] === '>' && text[1] === '>' && text[2] === '=';
		if (text[0] === '>' && text[1] !== '=' && !isShiftAssign && (state.angleDepth ?? 0) > 0) {
			if (text[1] === '>' && (state.angleDepth ?? 0) >= 2) {
				// `>>` closes two nested type-argument lists at once.
				state.angleDepth = (state.angleDepth ?? 0) - 2;
				return [
					createToken('punctuation.bracket', '>', pos),
					createToken('punctuation.bracket', '>', pos + 1)
				];
			}
			// Single `>` closes one level; a `>>` with depth 1 closes one here and
			// the loop re-examines the trailing `>` on the next iteration.
			state.angleDepth = (state.angleDepth ?? 0) - 1;
			return [createToken('punctuation.bracket', '>', pos)];
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
			// A `;` or a brace ends any statement/block; an unclosed generic `<`
			// could not survive it, so clear the angle depth to avoid poisoning the
			// rest of the line/file with phantom brackets.
			if (char === ';' || char === '{' || char === '}') {
				state.angleDepth = 0;
			}
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

	/**
	 * Decide whether a `<` opens a generic / type-argument list. It does when it
	 * directly follows a type name (`Vec<`, `Foo<`), a turbofish path (`::<`), or
	 * a closing generic bracket (`Foo<Bar><` is not valid, but `>` then `<` does
	 * not occur — kept for completeness). A `<` after a value or in `a < b` is a
	 * comparison and is left to the operator path.
	 */
	private opensGeneric(prevToken?: Token): boolean {
		if (!prevToken) return false;
		if (
			prevToken.type === 'type.builtin' ||
			prevToken.type === 'type.class' ||
			prevToken.type === 'type.interface' ||
			prevToken.type === 'type.namespace' ||
			prevToken.type === 'constant' ||
			// Generic parameter list on a definition: `fn first<'a>`, `struct S<T>`.
			prevToken.type === 'function.definition'
		) {
			return true;
		}
		// Turbofish: `parse::<u32>()` — the `<` follows the `::` path operator.
		if (prevToken.type === 'operator' && prevToken.text === '::') {
			return true;
		}
		// `impl<T>` / `impl<T: Trait>`: the generic parameter list on an impl block
		// puts `<` DIRECTLY after the `impl` keyword (no intervening name), so the
		// `function.definition` case above never fires for it. `impl` is the only
		// definition keyword that is immediately followed by a generic `<`; `fn`,
		// `struct`, `enum`, `trait`, `type`, etc. are followed by a name first.
		if (prevToken.type === 'keyword.definition' && prevToken.text === 'impl') {
			return true;
		}
		return false;
	}

	/**
	 * Consume a (possibly nested) block comment starting at `start` within `text`,
	 * using and updating `state.blockCommentDepth`. Returns the index one past the
	 * last consumed character on this line. Leaves `state.inBlockComment` true iff
	 * the comment is still open at end of line.
	 */
	private consumeBlockComment(text: string, start: number, state: RustTokenizerState): number {
		let i = start;
		let depth = state.blockCommentDepth ?? 1;
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
					state.blockCommentDepth = 0;
					state.inBlockComment = false;
					return i;
				}
				continue;
			}
			i++;
		}
		state.blockCommentDepth = depth;
		state.inBlockComment = depth > 0;
		return text.length;
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		prevToken?: Token
	): TokenType {
		// Booleans
		if (word === 'true' || word === 'false') {
			return 'constant.boolean';
		}

		const afterWord = context.slice(wordLength).trimStart();
		const isCall = afterWord.startsWith('(');

		// Definition position: the name immediately after `fn` is the function
		// being DEFINED, and the name after a type-introducing keyword is the
		// type/namespace being defined. We read the previous meaningful token.
		if (prevToken) {
			if (prevToken.type === 'keyword.definition') {
				if (prevToken.text === 'fn') return 'function.definition';
				if (prevToken.text === 'mod') return 'type.namespace';
				// struct / enum / trait / union / type / impl introduce a type name.
				if (definitionKeywords.has(prevToken.text)) return 'type.class';
			}
			// Property / method access: an identifier directly after a `.` accessor.
			// A trailing `(` makes it a method call; otherwise it is a field/property.
			if (prevToken.type === 'punctuation.accessor' && prevToken.text === '.') {
				if (isCall) return 'function.call';
				// `await` is a postfix keyword in `expr.await`, not a property.
				if (word === 'await') return 'keyword.control';
				return 'property';
			}
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
		if (isCall) {
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
	 * tokens for recognized escape sequences AND `std::fmt` format interpolation:
	 *
	 *   - `\n`, `\u{1F}`, `\xFF`, `\"`         -> string.escape
	 *   - `{{` and `}}`                        -> string.escape (literal braces)
	 *   - `{name}`, `{0}`, `{expr:spec}`, `{}` -> braces as string.template, with
	 *      the inner argument expression sub-tokenized (variable / property /
	 *      number / accessor) and the format spec painted as string.template.
	 *
	 * Strings can span lines; when the closing quote is not found the open state
	 * is threaded so the continuation line resumes as a string. Pass
	 * `continuation = true` (with prefixLen 0) for a line that resumes an already
	 * open string from a previous line.
	 */
	private tokenizeString(
		text: string,
		pos: number,
		prefixLen: number,
		state: RustTokenizerState,
		continuation = false
	): Token[] {
		const tokens: Token[] = [];
		let segStart = 0;
		// On an opening line skip the prefix (`b`) and the opening quote; a
		// continuation line resumes at column 0 inside the string body.
		let i = continuation ? 0 : prefixLen + 1;
		// Byte strings (`b"..."`) are never format-macro arguments, so they carry
		// no `{}` interpolation — only escapes. Plain strings do interpolation.
		const effectivePrefix = continuation ? (state.stringPrefixLen ?? 0) : prefixLen;
		const interpolate = effectivePrefix === 0;

		const flushPlain = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken('string', text.slice(segStart, end), pos + segStart));
			}
		};

		while (i < text.length) {
			const ch = text[i];

			// Escape sequence
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

			// Literal-brace escapes `{{` / `}}` — not interpolation.
			if (
				interpolate &&
				((ch === '{' && text[i + 1] === '{') || (ch === '}' && text[i + 1] === '}'))
			) {
				flushPlain(i);
				tokens.push(createToken('string.escape', text.slice(i, i + 2), pos + i));
				i += 2;
				segStart = i;
				continue;
			}

			// Format interpolation `{ ... }`
			if (interpolate && ch === '{') {
				const closeRel = text.indexOf('}', i + 1);
				if (closeRel !== -1) {
					flushPlain(i);
					this.tokenizeFormatArg(text.slice(i, closeRel + 1), pos + i, tokens);
					i = closeRel + 1;
					segStart = i;
					continue;
				}
				// No closing brace on this line — fall through and treat as plain.
			}

			if (ch === '"') {
				flushPlain(i + 1);
				state.inString = false;
				state.stringPrefixLen = undefined;
				return tokens;
			}
			i++;
		}

		// Unterminated on this line: thread the open string forward. Plain `"` and
		// byte `b"` strings span lines in Rust source; raw strings are handled
		// separately. This keeps the line lossless and resumes next line.
		flushPlain(text.length);
		state.inString = true;
		state.stringPrefixLen = continuation ? (state.stringPrefixLen ?? 0) : prefixLen;
		return tokens;
	}

	/**
	 * Sub-tokenize a single format-interpolation group, e.g. `{}`, `{0}`,
	 * `{name}`, `{self.count}`, `{value:>width$.2}`, `{:?}`. The braces become
	 * `string.template` delimiters; the argument expression (before any `:`) is
	 * tokenized into variable / property / number / accessor tokens; the format
	 * spec (after `:`) is painted as `string.template`. Always lossless.
	 */
	private tokenizeFormatArg(group: string, pos: number, out: Token[]): void {
		// Opening brace
		out.push(createToken('string.template', '{', pos));
		const inner = group.slice(1, group.length - 1);
		const innerStart = pos + 1;

		// Split argument reference from the format spec on the first ':'.
		const colonIdx = inner.indexOf(':');
		const argPart = colonIdx === -1 ? inner : inner.slice(0, colonIdx);
		const specPart = colonIdx === -1 ? '' : inner.slice(colonIdx);

		// Tokenize the argument reference: dotted/indexed path of names and
		// integer tuple indices, e.g. `self.count`, `0`, `items.len`.
		let j = 0;
		while (j < argPart.length) {
			const rest = argPart.slice(j);
			const ws = rest.match(/^\s+/);
			if (ws) {
				out.push(createToken('string', ws[0], innerStart + j));
				j += ws[0].length;
				continue;
			}
			const id = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
			if (id) {
				// A name right after a `.` is a property; otherwise a variable.
				const prev = out[out.length - 1];
				const isProp = prev?.type === 'punctuation.accessor' && prev.text === '.';
				out.push(createToken(isProp ? 'property' : 'variable', id[0], innerStart + j));
				j += id[0].length;
				continue;
			}
			const num = rest.match(/^\d+/);
			if (num) {
				out.push(createToken('number.integer', num[0], innerStart + j));
				j += num[0].length;
				continue;
			}
			if (rest[0] === '.') {
				out.push(createToken('punctuation.accessor', '.', innerStart + j));
				j += 1;
				continue;
			}
			// Anything else inside the arg part stays as plain string content.
			out.push(createToken('string', rest[0], innerStart + j));
			j += 1;
		}

		// The format spec (including its leading ':') is template metadata.
		if (specPart) {
			out.push(createToken('string.template', specPart, innerStart + argPart.length));
		}

		// Closing brace
		out.push(createToken('string.template', '}', pos + group.length - 1));
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
