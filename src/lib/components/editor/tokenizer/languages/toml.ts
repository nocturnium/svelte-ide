/**
 * TOML tokenizer
 *
 * Closed limitations (vs. the prior A-/B+ pass):
 *   - Basic strings ("..." and """...""") now sub-tokenize escape sequences as
 *     `string.escape` (\n \t \uXXXX \UXXXXXXXX \" \\ \b \f \r). Literal strings
 *     ('...' and '''...''') do NOT process escapes, by spec, so they stay whole.
 *     The escape pass threads through multi-line basic strings via state.
 *   - Numbers emit precise subtypes: number.hex / number.binary / number.float /
 *     number.integer. Octal has no dedicated subtype in the vocabulary, so an
 *     octal integer maps to number.integer (it is still an integer). inf/nan are
 *     number.float (TOML defines them as float values).
 *   - Multi-line basic/literal strings are threaded via state, and the basic
 *     variant carries its escape sub-tokenization across the line boundary.
 *
 * The only construct a zero-dependency line tokenizer cannot fully resolve is
 * semantic validity that requires whole-document context (e.g. a date that is
 * calendrically impossible, or a duplicate key) — those are out of scope for a
 * syntax highlighter, which colors by lexical shape.
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// TOML special value words
const booleans = new Set(['true', 'false']);
const floatConstants = new Set(['inf', 'nan']);

/**
 * RFC 3339 date / time / date-time literals, best effort.
 * Matches: full dates, local/offset date-times, local times.
 */
const dateTimeRe =
	/^(?:\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?)/;

/**
 * Recognized escape sequences inside a TOML *basic* string. TOML permits exactly:
 *   \b \t \n \f \r \" \\  and the unicode forms \uXXXX (4 hex) / \UXXXXXXXX (8 hex).
 * A backslash followed by anything else is an INVALID escape in TOML; we leave it
 * as plain string text so we never mis-color a non-escape as an escape.
 */
const escapeRe = /^\\(?:[btnfr"\\]|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/;

interface TomlTokenizerState extends TokenizerState {
	/** Inside a multi-line basic string (""") */
	inMultilineBasic?: boolean;
	/** Inside a multi-line literal string (''') */
	inMultilineLiteral?: boolean;
}

export class TomlTokenizer {
	language = 'toml';

	getInitialState(): TomlTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: TomlTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: TomlTokenizerState = { ...prevState };

		// Resume a multi-line basic string ("""...). Sub-tokenize escapes in the
		// spanned region just as a single-line basic string would.
		if (state.inMultilineBasic) {
			const endIdx = line.indexOf('"""');
			if (endIdx !== -1) {
				const segEnd = endIdx + 3;
				for (const t of this.emitBasicStringBody(line.slice(0, segEnd), 0)) tokens.push(t);
				pos = segEnd;
				state.inMultilineBasic = false;
			} else {
				for (const t of this.emitBasicStringBody(line, 0)) tokens.push(t);
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a multi-line literal string ('''...). Literal strings never process
		// escapes, so the spanned region stays a single string token.
		if (state.inMultilineLiteral) {
			const endIdx = line.indexOf("'''");
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + 3), 0));
				pos = endIdx + 3;
				state.inMultilineLiteral = false;
			} else {
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// `=` separates key context from value context; flip once we pass it.
		let valueMode = false;
		// Depth of open inline tables (`{`). Inline tables re-open key context for
		// their members, so keys inside `{ ... }` are keys, not bare values.
		let inlineTableDepth = 0;
		// A leading `[` (after optional whitespace) opens a table header — only at
		// the very start of the line's meaningful content.
		let sawNonWhitespace = pos > 0;
		// Whether the previous meaningful token already produced a value (number,
		// string, date, boolean, or a closing `]`/`}`). A leading `+`/`-` is only a
		// number's sign at a fresh value position — directly after another value it
		// is a stray operator, so a regex must NOT fold it into a second number.
		let prevWasValue = false;

		while (pos < line.length) {
			const remaining = line.slice(pos);

			// Detect table header at the first meaningful char of the line.
			if (!sawNonWhitespace && remaining[0] === '[') {
				const headerTokens = this.tokenizeTableHeader(remaining, pos);
				if (headerTokens) {
					for (const t of headerTokens) tokens.push(t);
					pos = headerTokens[headerTokens.length - 1].end;
					sawNonWhitespace = true;
					prevWasValue = true;
					continue;
				}
			}

			const produced = this.getNextTokens(remaining, pos, state, valueMode, prevWasValue);

			if (produced && produced.length > 0) {
				for (const t of produced) tokens.push(t);
				const last = produced[produced.length - 1];
				const first = produced[0];
				pos = last.end;
				if (first.type !== 'text') {
					sawNonWhitespace = true;
				}
				// A sign abutting the next char is a fresh-value sign only when the
				// previous meaningful token did NOT itself yield a value. Classify off
				// the leading token's family (an escape-split string is still a string).
				if (first.type !== 'text') {
					const baseType = first.type;
					prevWasValue =
						baseType === 'number' ||
						baseType === 'number.integer' ||
						baseType === 'number.float' ||
						baseType === 'number.hex' ||
						baseType === 'number.binary' ||
						baseType === 'string' ||
						baseType === 'string.escape' ||
						baseType === 'constant.boolean' ||
						baseType === 'constant.builtin' ||
						last.text === ']' ||
						last.text === '}';
				}
				// Track key/value context. `=` opens a value; inline-table braces and
				// their member separators re-open key context for the next key.
				if (first.type === 'operator.assignment') {
					valueMode = true;
				} else if (first.text === '{') {
					inlineTableDepth += 1;
					valueMode = false;
				} else if (first.text === '}') {
					if (inlineTableDepth > 0) inlineTableDepth -= 1;
					// A closed inline table is itself a value.
					valueMode = true;
				} else if (first.type === 'punctuation.separator' && inlineTableDepth > 0) {
					// `,` between inline-table members starts the next key.
					valueMode = false;
				}
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				pos += 1;
				sawNonWhitespace = true;
				prevWasValue = false;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	/**
	 * Tokenize a `[table.name]` or `[[array.of.tables]]` header.
	 * Returns null if the remaining text is not actually a table header.
	 */
	private tokenizeTableHeader(text: string, pos: number): Token[] | null {
		const isArray = text.startsWith('[[');
		const open = isArray ? '[[' : '[';
		const close = isArray ? ']]' : ']';
		const closeIdx = text.indexOf(close, open.length);
		if (closeIdx === -1) {
			return null;
		}

		const tokens: Token[] = [];
		let local = pos;

		// Opening bracket(s)
		tokens.push(createToken('punctuation.bracket', open, local));
		local += open.length;

		// Inner dotted name (may contain quoted segments, dots, whitespace)
		const inner = text.slice(open.length, closeIdx);
		let i = 0;
		while (i < inner.length) {
			const ch = inner[i];
			if (ch === ' ' || ch === '\t') {
				const wsMatch = inner.slice(i).match(/^[ \t]+/);
				const ws = wsMatch ? wsMatch[0] : ch;
				tokens.push(createToken('text', ws, local));
				local += ws.length;
				i += ws.length;
				continue;
			}
			if (ch === '.') {
				tokens.push(createToken('punctuation.accessor', '.', local));
				local += 1;
				i += 1;
				continue;
			}
			if (ch === '"' || ch === "'") {
				const seg = this.readQuotedKeySegment(inner.slice(i), ch);
				tokens.push(createToken('type.class', seg, local));
				local += seg.length;
				i += seg.length;
				continue;
			}
			// Bare key segment
			const bareMatch = inner.slice(i).match(/^[A-Za-z0-9_-]+/);
			if (bareMatch) {
				tokens.push(createToken('type.class', bareMatch[0], local));
				local += bareMatch[0].length;
				i += bareMatch[0].length;
				continue;
			}
			// Unexpected char — stay lossless
			tokens.push(createToken('text', ch, local));
			local += 1;
			i += 1;
		}

		// Closing bracket(s)
		tokens.push(createToken('punctuation.bracket', close, local));
		local += close.length;

		return tokens;
	}

	/** Read a quoted key segment, returning the raw matched text (incl. quotes). */
	private readQuotedKeySegment(text: string, quote: string): string {
		let i = 1;
		while (i < text.length) {
			if (quote === '"' && text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === quote) {
				return text.slice(0, i + 1);
			}
			i++;
		}
		return text;
	}

	/**
	 * Emit one or more tokens for the next construct. Most constructs are a single
	 * token; basic strings split into a `string` body with inline `string.escape`
	 * tokens, so this returns an array.
	 */
	private getNextTokens(
		text: string,
		pos: number,
		state: TomlTokenizerState,
		valueMode: boolean,
		prevWasValue: boolean
	): Token[] | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return [createToken('text', wsMatch[0], pos)];
		}

		// Comments
		if (text.startsWith('#')) {
			return [createToken('comment.line', text, pos)];
		}

		// Multi-line basic string
		if (text.startsWith('"""')) {
			const endIdx = text.indexOf('"""', 3);
			if (endIdx !== -1) {
				return this.emitBasicStringBody(text.slice(0, endIdx + 3), pos);
			}
			state.inMultilineBasic = true;
			return this.emitBasicStringBody(text, pos);
		}

		// Multi-line literal string (no escapes processed)
		if (text.startsWith("'''")) {
			const endIdx = text.indexOf("'''", 3);
			if (endIdx !== -1) {
				return [createToken('string', text.slice(0, endIdx + 3), pos)];
			}
			state.inMultilineLiteral = true;
			return [createToken('string', text, pos)];
		}

		// Basic (double-quoted) string
		if (text.startsWith('"')) {
			return this.tokenizeBasicString(text, pos, valueMode);
		}

		// Literal (single-quoted) string
		if (text.startsWith("'")) {
			return [this.tokenizeLiteralString(text, pos, valueMode)];
		}

		// In value context, recognize value literals before treating words as keys.
		if (valueMode) {
			// A `+`/`-` that abuts a value already emitted (e.g. the stray `+` in the
			// invalid `1+2`) is a lone operator, not the sign of a fresh number. Emit
			// it as text so the number regexes below don't fold it into `+2`.
			if (prevWasValue && (text[0] === '+' || text[0] === '-')) {
				return [createToken('text', text[0], pos)];
			}

			// Dates / times (RFC 3339)
			const dateMatch = text.match(dateTimeRe);
			if (dateMatch) {
				return [createToken('constant.builtin', dateMatch[0], pos)];
			}

			// Numbers: hex / oct / bin — emit precise subtypes.
			const hexMatch = text.match(/^[+-]?0x[0-9A-Fa-f_]+/);
			if (hexMatch && this.numberBoundaryOk(text, hexMatch[0])) {
				return [createToken('number.hex', hexMatch[0], pos)];
			}
			const binMatch = text.match(/^[+-]?0b[01_]+/);
			if (binMatch && this.numberBoundaryOk(text, binMatch[0])) {
				return [createToken('number.binary', binMatch[0], pos)];
			}
			// Octal has no dedicated vocabulary subtype; it is still an integer.
			const octMatch = text.match(/^[+-]?0o[0-7_]+/);
			if (octMatch && this.numberBoundaryOk(text, octMatch[0])) {
				return [createToken('number.integer', octMatch[0], pos)];
			}

			// Floats: must have a fractional part and/or an exponent (or be inf/nan).
			const floatMatch = text.match(
				/^[+-]?(?:inf|nan|\d[\d_]*(?:\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?|[eE][+-]?\d[\d_]*))/
			);
			if (floatMatch && this.numberBoundaryOk(text, floatMatch[0])) {
				return [createToken('number.float', floatMatch[0], pos)];
			}

			// Plain decimal integers (with underscore grouping).
			const intMatch = text.match(/^[+-]?\d[\d_]*/);
			if (intMatch && this.numberBoundaryOk(text, intMatch[0])) {
				return [createToken('number.integer', intMatch[0], pos)];
			}

			// Boolean / float-constant value words
			const wordMatch = text.match(/^[A-Za-z_][A-Za-z0-9_-]*/);
			if (wordMatch) {
				const word = wordMatch[0];
				if (booleans.has(word)) {
					return [createToken('constant.boolean', word, pos)];
				}
				if (floatConstants.has(word)) {
					return [createToken('number.float', word, pos)];
				}
				// Other words in value position are bare identifiers (uncommon).
				return [createToken('variable', word, pos)];
			}
		} else {
			// Key context: a bare/dotted key before `=`.
			const keyMatch = text.match(/^[A-Za-z0-9_-]+/);
			if (keyMatch) {
				return [createToken('property', keyMatch[0], pos)];
			}
		}

		// Assignment
		if (text.startsWith('=')) {
			return [createToken('operator.assignment', '=', pos)];
		}

		// Dotted-key / value accessor
		if (text.startsWith('.')) {
			return [createToken('punctuation.accessor', '.', pos)];
		}

		// Punctuation
		const ch = text[0];
		if (ch === '{' || ch === '}') {
			return [createToken('punctuation.brace', ch, pos)];
		}
		if (ch === '[' || ch === ']') {
			return [createToken('punctuation.bracket', ch, pos)];
		}
		if (ch === ',') {
			return [createToken('punctuation.separator', ch, pos)];
		}

		return null;
	}

	/**
	 * A number match is only valid when the character after it is not an identifier
	 * char — otherwise `0xZZ`, `information`, `1foo` etc. would partial-match and the
	 * trailing letters would dangle. Returning false lets the caller fall through to
	 * the bare-word / text path, keeping the line lossless and honestly colored.
	 */
	private numberBoundaryOk(text: string, match: string): boolean {
		const after = text.slice(match.length);
		return !/^[A-Za-z0-9_]/.test(after);
	}

	/** Tokenize a single-line basic string, splitting out escape sequences. */
	private tokenizeBasicString(text: string, pos: number, valueMode: boolean): Token[] {
		// Find the closing quote (honoring escapes) to know where the string ends and
		// whether the trailing context makes this a quoted key rather than a value.
		let end = -1;
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === '"') {
				end = i + 1;
				break;
			}
			i++;
		}

		if (end === -1) {
			// Unterminated single-line basic string: take the remainder, still split
			// escapes so e.g. a dangling `"a\nb` colors its escape.
			return this.emitBasicStringBody(text, pos);
		}

		const str = text.slice(0, end);
		const cls = this.quotedClassification(text.slice(end), valueMode);
		if (cls === 'property') {
			// A quoted key — color the whole thing as a property (no escape splitting;
			// it is an identifier, not a string value).
			return [createToken('property', str, pos)];
		}
		return this.emitBasicStringBody(str, pos);
	}

	/**
	 * Emit the tokens for a span of basic-string text: plain `string` runs with
	 * inline `string.escape` tokens for each recognized escape. The span may be a
	 * complete string, an unterminated remainder, or a multi-line slice — the body
	 * logic is identical, which is what keeps multi-line escapes consistent.
	 */
	private emitBasicStringBody(text: string, pos: number): Token[] {
		const tokens: Token[] = [];
		let segStart = 0;
		let i = 0;

		const flushPlain = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken('string', text.slice(segStart, end), pos + segStart));
			}
		};

		while (i < text.length) {
			if (text[i] === '\\') {
				const escMatch = text.slice(i).match(escapeRe);
				if (escMatch) {
					flushPlain(i);
					tokens.push(createToken('string.escape', escMatch[0], pos + i));
					i += escMatch[0].length;
					segStart = i;
					continue;
				}
				// Not a recognized TOML escape — keep it as plain string text.
			}
			i++;
		}
		flushPlain(text.length);

		// Guarantee at least one token (e.g. an empty resumed slice) for losslessness.
		if (tokens.length === 0) {
			tokens.push(createToken('string', text, pos));
		}
		return tokens;
	}

	private tokenizeLiteralString(text: string, pos: number, valueMode: boolean): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === "'") {
				const str = text.slice(0, i + 1);
				const cls = this.quotedClassification(text.slice(i + 1), valueMode);
				return createToken(cls, str, pos);
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}

	/**
	 * A quoted token in key position followed by `=` (or `.`) is a quoted key,
	 * which we color as a property; otherwise it is a string value.
	 */
	private quotedClassification(after: string, valueMode: boolean): TokenType {
		if (!valueMode) {
			const trimmed = after.replace(/^[ \t]+/, '');
			if (trimmed.startsWith('=') || trimmed.startsWith('.')) {
				return 'property';
			}
		}
		return 'string';
	}
}

export function createTomlTokenizer() {
	return new TomlTokenizer();
}
