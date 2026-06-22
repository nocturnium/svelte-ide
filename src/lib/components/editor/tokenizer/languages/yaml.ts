/**
 * YAML tokenizer
 *
 * Multi-line constructs threaded via state:
 *   - block scalars ( | and > ) — content lines emitted as `string` until the
 *     indentation drops to/below the parent key.
 *   - double-quoted flow scalars — a "..." opened on one line and closed on a
 *     later one (YAML permits multi-line flow scalars); escapes are sub-tokenized
 *     on every continuation line.
 *   - single-quoted flow scalars — likewise threaded across lines.
 *   - flow collections ( [ ] and { } ) — bracket/brace depth is carried across
 *     lines so a flow mapping/sequence spanning several lines still classifies
 *     keys, separators and values correctly (a "," continues to mean
 *     "key separator" only inside a "{", "entry separator" inside a "[").
 *
 * Sub-tokenization:
 *   - double-quoted string escapes ( \n \t \" \\ \uXXXX \xXX \U........ and the
 *     full YAML escape set ) are emitted as `string.escape` segments inside the
 *     surrounding `string`.
 *   - numbers are classified into precise subtypes: number.hex / number.binary /
 *     number.float / number.integer (octal and timestamps keep the base `number`
 *     type since the vocabulary has no dedicated subtype for them).
 *
 * The tokenizer is strictly lossless: the concatenation of every token's text on
 * a line reconstructs that line byte-for-byte.
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Boolean-like constants (YAML 1.1 truthy/falsy set, plus YAML 1.2 core)
const booleanConstants = new Set([
	'true',
	'false',
	'True',
	'False',
	'TRUE',
	'FALSE',
	'yes',
	'no',
	'Yes',
	'No',
	'YES',
	'NO',
	'on',
	'off',
	'On',
	'Off',
	'ON',
	'OFF'
]);

// Null-like constants
const nullConstants = new Set(['null', 'Null', 'NULL', '~']);

interface YamlTokenizerState extends TokenizerState {
	/** Inside a block scalar (| or >) introduced on a prior line */
	inBlockScalar?: boolean;
	/** The indentation column at which the block scalar's parent key sits */
	blockScalarParentIndent?: number;
	/** Whether the block scalar's content indent has been established yet */
	blockScalarContentIndent?: number;
	/** Inside a double-quoted scalar that opened on a prior line and is not yet closed */
	inDoubleString?: boolean;
	/** Inside a single-quoted scalar that opened on a prior line and is not yet closed */
	inSingleString?: boolean;
	/**
	 * Open flow-collection delimiters carried across lines, innermost last.
	 * Lets a multi-line flow mapping/sequence keep classifying keys vs entries.
	 */
	flowStack?: ('{' | '[')[];
	/**
	 * Snapshot of flowStack as it stood at the START of the current line. Used as
	 * the seed for re-deriving nesting from a line prefix, so we don't double-count
	 * the current line's own brackets (which flowStack has already consumed).
	 */
	lineStartFlowStack?: ('{' | '[')[];
}

export class YamlTokenizer {
	language = 'yaml';

	getInitialState(): YamlTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: YamlTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		const state: YamlTokenizerState = { ...prevState };
		// Copy the flow stack so we never mutate the previous line's array in place.
		state.flowStack = prevState?.flowStack ? [...prevState.flowStack] : [];
		// Remember the line-start nesting so atKeyPosition can re-derive the nesting
		// from a line prefix without double-counting this line's own brackets.
		state.lineStartFlowStack = [...state.flowStack];

		// Resume a multi-line double/single-quoted flow scalar opened on a prior line.
		if (state.inDoubleString) {
			const { tokens: strTokens, closed } = this.continueDoubleString(line, 0);
			tokens.push(...strTokens);
			state.inDoubleString = !closed;
			// If the string closed mid-line, tokenize the remainder normally.
			if (closed) {
				const consumed = strTokens.reduce((n, t) => n + t.text.length, 0);
				this.tokenizeRest(line, consumed, tokens, state);
			}
			if (tokens.length === 0) tokens.push(createToken('text', '', 0));
			return { lineNumber, tokens, text: line, state };
		}
		if (state.inSingleString) {
			const { token, closed } = this.continueSingleString(line, 0);
			tokens.push(token);
			state.inSingleString = !closed;
			if (closed) {
				this.tokenizeRest(line, token.text.length, tokens, state);
			}
			if (tokens.length === 0) tokens.push(createToken('text', '', 0));
			return { lineNumber, tokens, text: line, state };
		}

		// Resume a block scalar (| or >) started on a previous line.
		if (state.inBlockScalar) {
			const indent = this.leadingIndent(line);
			const parentIndent = state.blockScalarParentIndent ?? 0;

			// A blank line stays inside the block scalar.
			if (line.trim() === '') {
				if (line.length > 0) {
					tokens.push(createToken('string', line, 0));
				} else {
					tokens.push(createToken('text', '', 0));
				}
				return { lineNumber, tokens, text: line, state };
			}

			// Establish the content indent from the first non-blank content line.
			if (state.blockScalarContentIndent === undefined) {
				state.blockScalarContentIndent = indent;
			}

			// Content belongs to the block scalar while it is indented deeper than the
			// parent key. Once indentation drops to or below the parent, the block ends.
			if (indent > parentIndent) {
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}

			// Block scalar has ended; fall through and tokenize this line normally.
			state.inBlockScalar = false;
			state.blockScalarParentIndent = undefined;
			state.blockScalarContentIndent = undefined;
		}

		// Directive lines: %YAML 1.2, %TAG !x! tag:example.com,2000:app/ — only at
		// column 0. The leading "%directive" is a control keyword.
		if (this.tokenizeDirective(line, tokens)) {
			if (tokens.length === 0) tokens.push(createToken('text', '', 0));
			return { lineNumber, tokens, text: line, state };
		}

		this.tokenizeRest(line, 0, tokens, state);

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	/** Tokenize `line` from `start` to its end, appending tokens. */
	private tokenizeRest(
		line: string,
		start: number,
		tokens: Token[],
		state: YamlTokenizerState
	): void {
		let pos = start;
		while (pos < line.length) {
			const remaining = line.slice(pos);
			const produced = this.getNextToken(remaining, pos, line, state);

			if (produced) {
				const arr = Array.isArray(produced) ? produced : [produced];
				if (arr.length > 0) {
					tokens.push(...arr);
					pos = arr[arr.length - 1].end;
					continue;
				}
			}
			tokens.push(createToken('text', remaining[0], pos));
			pos += 1;
		}
	}

	/**
	 * A directive line ( %YAML / %TAG / %custom ) starting at column 0. Emits the
	 * "%name" as keyword.control and tokenizes the rest as plain content/comment.
	 * Returns true when the line was a directive (and fully tokenized into `tokens`).
	 */
	private tokenizeDirective(line: string, tokens: Token[]): boolean {
		const m = line.match(/^%([A-Za-z][\w-]*)/);
		if (!m) return false;
		const name = m[0];
		tokens.push(createToken('keyword.control', name, 0));
		// Remainder: whitespace-separated parameters. Keep it simple and lossless —
		// emit a trailing comment if present, otherwise the rest as type/string text.
		let pos = name.length;
		while (pos < line.length) {
			const rest = line.slice(pos);
			const ws = rest.match(/^[ \t]+/);
			if (ws) {
				tokens.push(createToken('text', ws[0], pos));
				pos += ws[0].length;
				continue;
			}
			if (rest[0] === '#' && (line[pos - 1] === ' ' || line[pos - 1] === '\t')) {
				tokens.push(createToken('comment.line', rest, pos));
				pos = line.length;
				break;
			}
			// A tag handle like "!x!" or a tag prefix / version number — emit as type.
			const param = rest.match(/^[^\s#]+/);
			if (param) {
				const isVersion = /^\d+\.\d+$/.test(param[0]);
				tokens.push(createToken(isVersion ? 'number.float' : 'type', param[0], pos));
				pos += param[0].length;
				continue;
			}
			tokens.push(createToken('text', rest[0], pos));
			pos += 1;
		}
		return true;
	}

	private getNextToken(
		text: string,
		pos: number,
		line: string,
		state: YamlTokenizerState
	): Token | Token[] | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Comments: '#' only starts a comment at line start or after whitespace.
		if (text[0] === '#') {
			if (pos === 0 || line[pos - 1] === ' ' || line[pos - 1] === '\t') {
				return createToken('comment.line', text, pos);
			}
		}

		// Document markers at the very start of a line: --- or ...
		if (pos === 0) {
			const markerMatch = text.match(/^(?:---|\.\.\.)/);
			if (markerMatch) {
				return createToken('punctuation', markerMatch[0], pos);
			}
		}

		// List item marker: a leading "- " (or a bare "-" at end of line).
		if (text[0] === '-' && (text.length === 1 || text[1] === ' ')) {
			const before = line.slice(0, pos);
			if (before.trim() === '') {
				return createToken('punctuation', '-', pos);
			}
		}

		// Explicit/complex key indicator "? " and explicit value indicator (a ":"
		// at the start of a value position). The "?" only acts as an indicator when
		// followed by whitespace or end of line; "?foo" is plain scalar content.
		if (text[0] === '?' && (text.length === 1 || text[1] === ' ' || text[1] === '\t')) {
			const before = line.slice(0, pos);
			if (before.trim() === '' || /^[ ]*(?:-[ ]+)+$/.test(before)) {
				return createToken('punctuation', '?', pos);
			}
		}

		// Merge key "<<" (special mapping key) — detect before the generic key path,
		// which would otherwise classify it as a property.
		if (text.startsWith('<<') && this.atKeyPosition(line, pos, state)) {
			return createToken('keyword', '<<', pos);
		}

		// Mapping key: an unquoted/quoted scalar immediately followed by ':' then
		// whitespace/end. Only treat as a key when it sits at the start of a value
		// position (start of line, after indentation, after "- ", or after "{"/",").
		if (this.atKeyPosition(line, pos, state)) {
			const keyToken = this.tryMappingKey(text, pos);
			if (keyToken) {
				return keyToken;
			}
		}

		// Anchors: &anchor
		const anchorMatch = text.match(/^&[^\s,[\]{}]+/);
		if (anchorMatch) {
			return createToken('variable.definition', anchorMatch[0], pos);
		}

		// Aliases: *alias
		const aliasMatch = text.match(/^\*[^\s,[\]{}]+/);
		if (aliasMatch) {
			return createToken('variable', aliasMatch[0], pos);
		}

		// Tags: !!str, !Custom, !<verbatim>. The verbatim "<...>" form is tried
		// first so its inner commas/brackets are not truncated by the general form.
		const tagToken = this.tryTag(text, pos);
		if (tagToken) {
			return tagToken;
		}

		// Block scalar introducers: | or > with optional chomp/indent indicators.
		const blockScalarMatch = text.match(/^[|>][+-]?\d?(?=\s*(?:#.*)?$)/);
		if (blockScalarMatch) {
			state.inBlockScalar = true;
			state.blockScalarParentIndent = this.leadingIndent(line);
			state.blockScalarContentIndent = undefined;
			return createToken('keyword', blockScalarMatch[0], pos);
		}

		// Double-quoted strings (with escapes), possibly unterminated (multi-line).
		if (text[0] === '"') {
			const { tokens: strTokens, closed } = this.tokenizeDoubleString(text, pos);
			state.inDoubleString = !closed;
			return strTokens;
		}

		// Single-quoted strings (doubled '' is the escape), possibly unterminated.
		if (text[0] === "'") {
			const { token, closed } = this.tokenizeSingleString(text, pos);
			state.inSingleString = !closed;
			return token;
		}

		// Numbers (integers, floats, hex, binary, octal) and best-effort timestamps —
		// only when standing alone as a value, not embedded in a larger scalar.
		const numToken = this.tryNumber(text, pos);
		if (numToken) {
			return numToken;
		}

		// Flow punctuation and the value-position colon.
		const punctChar = text[0];
		if (punctChar === '{') {
			state.flowStack?.push('{');
			return createToken('punctuation.brace', punctChar, pos);
		}
		if (punctChar === '}') {
			if (state.flowStack && state.flowStack[state.flowStack.length - 1] === '{') {
				state.flowStack.pop();
			}
			return createToken('punctuation.brace', punctChar, pos);
		}
		if (punctChar === '[') {
			state.flowStack?.push('[');
			return createToken('punctuation.bracket', punctChar, pos);
		}
		if (punctChar === ']') {
			if (state.flowStack && state.flowStack[state.flowStack.length - 1] === '[') {
				state.flowStack.pop();
			}
			return createToken('punctuation.bracket', punctChar, pos);
		}
		if (punctChar === ',') {
			return createToken('punctuation.separator', punctChar, pos);
		}
		if (punctChar === ':') {
			return createToken('punctuation.separator', punctChar, pos);
		}

		// Bare/unquoted scalar value — emit up to a comment, comma, or flow close.
		// A '#' only ends the scalar (starting a comment) when it is preceded by
		// whitespace; a '#' embedded mid-word (e.g. page#section) is scalar content.
		const scalarLen = this.scanBareScalar(text);
		if (scalarLen > 0) {
			const scalar = text.slice(0, scalarLen).replace(/\s+$/, '');
			if (scalar.length > 0) {
				return createToken(this.classifyScalar(scalar), scalar, pos);
			}
		}

		return createToken('text', text[0], pos);
	}

	/**
	 * Length of a bare (unquoted) plain scalar starting at the head of `text`.
	 * Stops at a flow indicator (",[]{}"), or at a '#' that begins a comment
	 * (i.e. preceded by whitespace), or at end of input. A '#' that is NOT
	 * preceded by whitespace is treated as ordinary scalar content, so values
	 * like "page#section" stay a single scalar. Returns 0 if the first
	 * character cannot start a scalar.
	 */
	private scanBareScalar(text: string): number {
		const first = text[0];
		if (first === undefined || first === ' ' || first === '\t') return 0;
		if (first === ',' || first === '[' || first === ']' || first === '{' || first === '}') {
			return 0;
		}
		if (first === '#') return 0;
		let i = 0;
		while (i < text.length) {
			const ch = text[i];
			if (ch === ',' || ch === '[' || ch === ']' || ch === '{' || ch === '}') break;
			if (ch === '#' && i > 0 && (text[i - 1] === ' ' || text[i - 1] === '\t')) break;
			i++;
		}
		return i;
	}

	/** Number of leading spaces (significant indentation) on a line. */
	private leadingIndent(line: string): number {
		const m = line.match(/^[ ]*/);
		return m ? m[0].length : 0;
	}

	/**
	 * True when `pos` is a position where a mapping key may legitimately begin:
	 * start of line, after only indentation, immediately after a "- " list marker,
	 * or after a flow "{" / "," in a flow mapping.
	 */
	private atKeyPosition(line: string, pos: number, state: YamlTokenizerState): boolean {
		const before = line.slice(0, pos);
		if (before.trim() === '') {
			// At the very start of a continuation line inside a flow collection, the
			// carried-over flow context decides: a key may begin only inside a "{".
			const carry = state.lineStartFlowStack;
			if (pos === 0 && carry && carry.length > 0) {
				return carry[carry.length - 1] === '{';
			}
			return true;
		}
		// After a list-item marker: indentation followed by one or more "- ".
		if (/^[ ]*(?:-[ ]+)+$/.test(before)) return true;
		// Inside a flow collection, immediately after "{" or "," (ignoring
		// whitespace). A "," is only a key separator when the innermost open flow
		// delimiter is a mapping "{"; inside a flow sequence "[...]" a comma
		// separates plain entries, NOT key/value pairs — so a scalar there must not
		// be mis-read as a mapping key (which would swallow the closing "]").
		if (/[{,]\s*$/.test(before)) {
			// Seed with the LINE-START stack (not the live, already-mutated flowStack),
			// then let `before` re-derive this line's own nesting — avoids double-count.
			const open = this.innermostFlowDelimiter(before, state.lineStartFlowStack);
			// "{" preceding ⇒ start of a flow mapping ⇒ key position.
			// "," preceding ⇒ key position only if we are inside a "{" mapping.
			if (/\{\s*$/.test(before)) return true;
			return open === '{';
		}
		return false;
	}

	/**
	 * The innermost currently-open flow delimiter ("{" or "[") for the given prefix.
	 * Carried-over flow context (`carry`, the open delimiters from prior lines) seeds
	 * the stack so a flow collection spanning multiple lines is tracked correctly.
	 * Quoted spans are skipped so brackets inside strings do not affect nesting.
	 */
	private innermostFlowDelimiter(before: string, carry?: ('{' | '[')[]): '{' | '[' | null {
		const stack: ('{' | '[')[] = carry ? [...carry] : [];
		let i = 0;
		while (i < before.length) {
			const ch = before[i];
			if (ch === '"') {
				i++;
				while (i < before.length && before[i] !== '"') {
					if (before[i] === '\\') i++;
					i++;
				}
				i++;
				continue;
			}
			if (ch === "'") {
				i++;
				while (i < before.length) {
					if (before[i] === "'") {
						if (before[i + 1] === "'") {
							i += 2;
							continue;
						}
						break;
					}
					i++;
				}
				i++;
				continue;
			}
			if (ch === '{' || ch === '[') {
				stack.push(ch);
			} else if (ch === '}' || ch === ']') {
				stack.pop();
			}
			i++;
		}
		return stack.length > 0 ? stack[stack.length - 1] : null;
	}

	/**
	 * Attempt to read a mapping key (quoted or unquoted scalar) that is immediately
	 * followed by ":" and then whitespace or end of line. Returns a property token
	 * for the key (the following ":" is tokenized separately as a separator).
	 */
	private tryMappingKey(text: string, pos: number): Token | null {
		// Quoted key — only a key when it CLOSES on this line and ":" follows.
		if (text[0] === '"' || text[0] === "'") {
			const { token, closed } =
				text[0] === '"'
					? (() => {
							const r = this.tokenizeDoubleString(text, pos);
							// Collapse the escape-split tokens into one span for the key length.
							const span = r.tokens.reduce((n, t) => n + t.text.length, 0);
							return { token: createToken('property', text.slice(0, span), pos), closed: r.closed };
						})()
					: (() => {
							const r = this.tokenizeSingleString(text, pos);
							return {
								token: createToken('property', r.token.text, pos),
								closed: r.closed
							};
						})();
			if (!closed) return null;
			const after = text.slice(token.text.length);
			if (/^:(?:\s|$)/.test(after)) {
				return token;
			}
			return null;
		}

		// Unquoted key: characters up to a ':' that is followed by space/end. The key
		// body excludes flow indicators (",{}[]") so a key never spans a flow close —
		// e.g. on a flow-mapping continuation line "  r }, s: 2" the key must be "s",
		// not the whole "r }, s" run.
		const keyMatch = text.match(/^([^\s#,[\]{}][^:#,{}[\]]*?)(?=:(?:\s|$))/);
		if (keyMatch) {
			const key = keyMatch[1];
			if (key.length > 0 && !key.includes(': ')) {
				return createToken('property', key, pos);
			}
		}
		return null;
	}

	/**
	 * Tag tokenization. A tag is split into a `type.namespace` handle (e.g. "!!" or
	 * "!foo!") and a `type` suffix when a named handle is present, so secondary/named
	 * tag handles read distinctly; the verbatim "!<...>" form is a single `type`.
	 */
	private tryTag(text: string, pos: number): Token | Token[] | null {
		if (text[0] !== '!') return null;
		// Verbatim tag: !<...> — a single type token (inner commas/colons preserved).
		const verbatim = text.match(/^!<[^>]*>/);
		if (verbatim) {
			return createToken('type', verbatim[0], pos);
		}
		// Secondary handle "!!suffix" or named handle "!handle!suffix".
		const named = text.match(/^(!(?:![^\s,[\]{}!]*|[\w-]+![^\s,[\]{}!]*))/);
		if (named) {
			const whole = named[0];
			// Split handle from suffix at the last "!".
			const lastBang = whole.lastIndexOf('!');
			const handle = whole.slice(0, lastBang + 1);
			const suffix = whole.slice(lastBang + 1);
			const out: Token[] = [createToken('type.namespace', handle, pos)];
			if (suffix.length > 0) {
				out.push(createToken('type', suffix, pos + handle.length));
			}
			return out;
		}
		// Primary handle "!suffix" or a bare "!".
		const primary = text.match(/^!(?:[^\s,[\]{}]*)/);
		if (primary) {
			return createToken('type', primary[0], pos);
		}
		return null;
	}

	/**
	 * Classify and emit a number token with a precise subtype. Returns null when the
	 * head of `text` is not a standalone numeric value (the caller then treats it as
	 * scalar content). Subtypes:
	 *   number.hex     0x1A
	 *   number.binary  0b1010 (YAML 1.1)
	 *   number.float   3.14, 1e3, .5, .inf/.nan
	 *   number.integer 42, -5, 1_000
	 *   number (base)  octal (0o17 / 017) and ISO timestamps — no dedicated subtype.
	 */
	private tryNumber(text: string, pos: number): Token | null {
		const hex = text.match(/^[-+]?0[xX][0-9a-fA-F][0-9a-fA-F_]*/);
		if (hex && this.numberBoundaryOk(text, hex[0].length)) {
			return createToken('number.hex', hex[0], pos);
		}
		const bin = text.match(/^[-+]?0[bB][01][01_]*/);
		if (bin && this.numberBoundaryOk(text, bin[0].length)) {
			return createToken('number.binary', bin[0], pos);
		}
		const oct = text.match(/^[-+]?0[oO][0-7][0-7_]*/);
		if (oct && this.numberBoundaryOk(text, oct[0].length)) {
			return createToken('number', oct[0], pos);
		}
		// Special floats .inf / .nan in all YAML capitalizations.
		const special = text.match(/^[-+]?\.(?:inf|Inf|INF|nan|NaN|NAN)/);
		if (special && this.numberBoundaryOk(text, special[0].length)) {
			return createToken('number.float', special[0], pos);
		}
		// Decimal int / float with optional underscores, fraction and exponent.
		const dec = text.match(/^[-+]?(?:\d[\d_]*\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
		if (
			dec &&
			dec[0].length > 0 &&
			/\d/.test(dec[0]) &&
			this.numberBoundaryOk(text, dec[0].length)
		) {
			// Distinguish ISO timestamps (e.g. 2026-06-21) from plain decimals before
			// committing to a number subtype: a "-" or ":" right after means a date.
			const after = text[dec[0].length];
			if (after === '-' || after === ':') {
				const dateMatch = text.match(
					/^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}(?::?\d{2})?)?)?/
				);
				if (dateMatch && this.numberBoundaryOk(text, dateMatch[0].length)) {
					return createToken('number', dateMatch[0], pos);
				}
				// A bare clock time HH:MM:SS — also a timestamp.
				return null;
			}
			const isFloat = /[.eE]/.test(dec[0]);
			return createToken(isFloat ? 'number.float' : 'number.integer', dec[0], pos);
		}
		// A 4-digit-led date that didn't match the decimal rule above (defensive).
		const dateMatch = text.match(
			/^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}(?::?\d{2})?)?)?/
		);
		if (dateMatch && this.numberBoundaryOk(text, dateMatch[0].length)) {
			return createToken('number', dateMatch[0], pos);
		}
		return null;
	}

	/**
	 * A numeric literal must be a standalone value — the char after it must end the
	 * token (EOL, whitespace, or a flow terminator). Otherwise "1abc" or "3.4.5"
	 * is an unquoted scalar, not a number.
	 */
	private numberBoundaryOk(text: string, len: number): boolean {
		const after = text[len];
		return (
			after === undefined ||
			after === ' ' ||
			after === '\t' ||
			after === ',' ||
			after === ']' ||
			after === '}'
		);
	}

	private classifyScalar(scalar: string): TokenType {
		if (booleanConstants.has(scalar)) {
			return 'constant.boolean';
		}
		if (nullConstants.has(scalar)) {
			return 'constant.null';
		}
		return 'string';
	}

	/**
	 * Tokenize a double-quoted string starting at `text[0] === '"'`, splitting
	 * recognized escape sequences into `string.escape` tokens. Returns the token
	 * list plus whether the closing quote was found on this line. When unclosed,
	 * the caller threads `inDoubleString` so the next line continues the string.
	 */
	private tokenizeDoubleString(text: string, pos: number): { tokens: Token[]; closed: boolean } {
		return this.scanDoubleString(text, pos, true);
	}

	/**
	 * Continue a double-quoted string on a continuation line (no opening quote).
	 */
	private continueDoubleString(text: string, pos: number): { tokens: Token[]; closed: boolean } {
		return this.scanDoubleString(text, pos, false);
	}

	/**
	 * Core double-quoted scanner. `hasOpen` indicates whether `text[0]` is the
	 * opening quote (false on continuation lines). Emits alternating `string` and
	 * `string.escape` tokens. A trailing backslash means the line is continued.
	 */
	private scanDoubleString(
		text: string,
		pos: number,
		hasOpen: boolean
	): { tokens: Token[]; closed: boolean } {
		const tokens: Token[] = [];
		let i = hasOpen ? 1 : 0;
		let literalStart = 0; // index of the start of the current literal run
		const flush = (end: number) => {
			if (end > literalStart) {
				tokens.push(createToken('string', text.slice(literalStart, end), pos + literalStart));
			}
		};

		while (i < text.length) {
			const ch = text[i];
			if (ch === '\\') {
				const escLen = this.doubleEscapeLength(text, i);
				if (escLen > 0) {
					flush(i);
					tokens.push(createToken('string.escape', text.slice(i, i + escLen), pos + i));
					i += escLen;
					literalStart = i;
					continue;
				}
				// A lone trailing backslash continues the string on the next line.
				if (i === text.length - 1) {
					flush(i);
					tokens.push(createToken('string.escape', '\\', pos + i));
					return { tokens, closed: false };
				}
				i++;
				continue;
			}
			if (ch === '"') {
				flush(i + 1); // include the closing quote in the literal run
				return { tokens, closed: true };
			}
			i++;
		}
		// Reached end of line without a closing quote: string continues next line.
		flush(text.length);
		if (tokens.length === 0) {
			tokens.push(createToken('string', text.slice(literalStart), pos + literalStart));
		}
		return { tokens, closed: false };
	}

	/**
	 * Length of a recognized double-quoted escape starting at `text[i] === '\\'`,
	 * or 0 if `\` is not followed by a recognized escape char. Covers the full YAML
	 * 1.2 escape set including \xHH, \uHHHH and \UHHHHHHHH.
	 */
	private doubleEscapeLength(text: string, i: number): number {
		const next = text[i + 1];
		if (next === undefined) return 0;
		// \xHH
		if (next === 'x' && /^[0-9a-fA-F]{2}/.test(text.slice(i + 2))) return 4;
		// \uHHHH
		if (next === 'u' && /^[0-9a-fA-F]{4}/.test(text.slice(i + 2))) return 6;
		// \UHHHHHHHH
		if (next === 'U' && /^[0-9a-fA-F]{8}/.test(text.slice(i + 2))) return 10;
		// Single-char escapes: \0 \a \b \t \n \v \f \r \e \" \\ \/ \N \_ \L \P \  \space etc.
		if ('0abtnvfre"\\/N_LP \t'.includes(next)) return 2;
		return 0;
	}

	/**
	 * Tokenize a single-quoted string starting at `text[0] === "'"`. A doubled ''
	 * is the escape. Returns the token plus whether it closed on this line.
	 */
	private tokenizeSingleString(text: string, pos: number): { token: Token; closed: boolean } {
		let i = 1;
		while (i < text.length) {
			if (text[i] === "'") {
				if (text[i + 1] === "'") {
					i += 2;
					continue;
				}
				return { token: createToken('string', text.slice(0, i + 1), pos), closed: true };
			}
			i++;
		}
		return { token: createToken('string', text.slice(0, i), pos), closed: false };
	}

	/**
	 * Continue a single-quoted string on a continuation line (no opening quote).
	 */
	private continueSingleString(text: string, pos: number): { token: Token; closed: boolean } {
		let i = 0;
		while (i < text.length) {
			if (text[i] === "'") {
				if (text[i + 1] === "'") {
					i += 2;
					continue;
				}
				return { token: createToken('string', text.slice(0, i + 1), pos), closed: true };
			}
			i++;
		}
		return { token: createToken('string', text.slice(0, i), pos), closed: false };
	}
}

export function createYamlTokenizer() {
	return new YamlTokenizer();
}
