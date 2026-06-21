/**
 * TOML tokenizer
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

		// Resume a multi-line basic string ("""...)
		if (state.inMultilineBasic) {
			const endIdx = line.indexOf('"""');
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + 3), 0));
				pos = endIdx + 3;
				state.inMultilineBasic = false;
			} else {
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a multi-line literal string ('''...)
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
		// A leading `[` (after optional whitespace) opens a table header — only at
		// the very start of the line's meaningful content.
		let sawNonWhitespace = pos > 0;

		while (pos < line.length) {
			const remaining = line.slice(pos);

			// Detect table header at the first meaningful char of the line.
			if (!sawNonWhitespace && remaining[0] === '[') {
				const headerTokens = this.tokenizeTableHeader(remaining, pos);
				if (headerTokens) {
					for (const t of headerTokens) tokens.push(t);
					pos = headerTokens[headerTokens.length - 1].end;
					sawNonWhitespace = true;
					continue;
				}
			}

			const token = this.getNextToken(remaining, pos, state, valueMode);

			if (token) {
				tokens.push(token);
				pos = token.end;
				if (token.type !== 'text') {
					sawNonWhitespace = true;
				}
				// The `=` separates key from value; everything after is value context.
				if (token.type === 'operator.assignment') {
					valueMode = true;
				}
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				pos += 1;
				sawNonWhitespace = true;
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

	private getNextToken(
		text: string,
		pos: number,
		state: TomlTokenizerState,
		valueMode: boolean
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Comments
		if (text.startsWith('#')) {
			return createToken('comment.line', text, pos);
		}

		// Multi-line basic string
		if (text.startsWith('"""')) {
			const endIdx = text.indexOf('"""', 3);
			if (endIdx !== -1) {
				return createToken('string', text.slice(0, endIdx + 3), pos);
			}
			state.inMultilineBasic = true;
			return createToken('string', text, pos);
		}

		// Multi-line literal string
		if (text.startsWith("'''")) {
			const endIdx = text.indexOf("'''", 3);
			if (endIdx !== -1) {
				return createToken('string', text.slice(0, endIdx + 3), pos);
			}
			state.inMultilineLiteral = true;
			return createToken('string', text, pos);
		}

		// Basic (double-quoted) string
		if (text.startsWith('"')) {
			return this.tokenizeBasicString(text, pos, valueMode);
		}

		// Literal (single-quoted) string
		if (text.startsWith("'")) {
			return this.tokenizeLiteralString(text, pos, valueMode);
		}

		// In value context, recognize value literals before treating words as keys.
		if (valueMode) {
			// Dates / times (RFC 3339)
			const dateMatch = text.match(dateTimeRe);
			if (dateMatch) {
				return createToken('constant.builtin', dateMatch[0], pos);
			}

			// Numbers: hex / oct / bin
			const radixMatch = text.match(/^[+-]?0(?:x[0-9A-Fa-f_]+|o[0-7_]+|b[01_]+)/);
			if (radixMatch) {
				return createToken('number', radixMatch[0], pos);
			}

			// Numbers: float / integer (with underscores, exponents, inf/nan)
			const numMatch = text.match(
				/^[+-]?(?:inf|nan|(?:\d[\d_]*)(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?)/
			);
			if (numMatch) {
				// Guard: a bare word like `information` should not match `inf`.
				const after = text.slice(numMatch[0].length);
				if (!/^[A-Za-z0-9_]/.test(after)) {
					return createToken('number', numMatch[0], pos);
				}
			}

			// Boolean / float-constant value words
			const wordMatch = text.match(/^[A-Za-z_][A-Za-z0-9_-]*/);
			if (wordMatch) {
				const word = wordMatch[0];
				if (booleans.has(word)) {
					return createToken('constant.boolean', word, pos);
				}
				if (floatConstants.has(word)) {
					return createToken('number', word, pos);
				}
				// Other words in value position are bare identifiers (uncommon).
				return createToken('variable', word, pos);
			}
		} else {
			// Key context: a bare/dotted key before `=`.
			const keyMatch = text.match(/^[A-Za-z0-9_-]+/);
			if (keyMatch) {
				return createToken('property', keyMatch[0], pos);
			}
		}

		// Assignment
		if (text.startsWith('=')) {
			return createToken('operator.assignment', '=', pos);
		}

		// Dotted-key / value accessor
		if (text.startsWith('.')) {
			return createToken('punctuation.accessor', '.', pos);
		}

		// Punctuation
		const ch = text[0];
		if (ch === '{' || ch === '}') {
			return createToken('punctuation.brace', ch, pos);
		}
		if (ch === '[' || ch === ']') {
			return createToken('punctuation.bracket', ch, pos);
		}
		if (ch === ',') {
			return createToken('punctuation.separator', ch, pos);
		}

		return null;
	}

	private tokenizeBasicString(text: string, pos: number, valueMode: boolean): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === '"') {
				const str = text.slice(0, i + 1);
				return createToken(this.quotedClassification(str, text.slice(i + 1), valueMode), str, pos);
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}

	private tokenizeLiteralString(text: string, pos: number, valueMode: boolean): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === "'") {
				const str = text.slice(0, i + 1);
				return createToken(this.quotedClassification(str, text.slice(i + 1), valueMode), str, pos);
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}

	/**
	 * A quoted token in key position followed by `=` (or `.`) is a quoted key,
	 * which we color as a property; otherwise it is a string value.
	 */
	private quotedClassification(_str: string, after: string, valueMode: boolean): TokenType {
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
