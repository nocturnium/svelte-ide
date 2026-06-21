/**
 * YAML tokenizer
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
}

export class YamlTokenizer {
	language = 'yaml';

	getInitialState(): YamlTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: YamlTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		const state: YamlTokenizerState = { ...prevState };

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

		let pos = 0;
		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos, line, state);

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

	private getNextToken(
		text: string,
		pos: number,
		line: string,
		state: YamlTokenizerState
	): Token | null {
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

		// Merge key "<<" (special mapping key) — detect before the generic key path,
		// which would otherwise classify it as a property.
		if (text.startsWith('<<') && this.atKeyPosition(line, pos)) {
			return createToken('keyword', '<<', pos);
		}

		// Mapping key: an unquoted/quoted scalar immediately followed by ':' then
		// whitespace/end. Only treat as a key when it sits at the start of a value
		// position (start of line, after indentation, after "- ", or after "{"/",").
		if (this.atKeyPosition(line, pos)) {
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

		// Tags: !!str, !Custom, !<verbatim>
		const tagMatch = text.match(/^!(?:!?[^\s,[\]{}]*|<[^>]*>)/);
		if (tagMatch) {
			return createToken('type', tagMatch[0], pos);
		}

		// Block scalar introducers: | or > with optional chomp/indent indicators.
		const blockScalarMatch = text.match(/^[|>][+-]?\d?(?=\s*(?:#.*)?$)/);
		if (blockScalarMatch) {
			state.inBlockScalar = true;
			state.blockScalarParentIndent = this.leadingIndent(line);
			state.blockScalarContentIndent = undefined;
			return createToken('keyword', blockScalarMatch[0], pos);
		}

		// Double-quoted strings (with escapes)
		if (text[0] === '"') {
			return this.tokenizeDoubleString(text, pos);
		}

		// Single-quoted strings (doubled '' is the escape)
		if (text[0] === "'") {
			return this.tokenizeSingleString(text, pos);
		}

		// Numbers (integers, floats, and best-effort dates) — only when standing
		// alone as a value, not embedded in a larger unquoted scalar.
		const numMatch = text.match(
			/^[-+]?(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|(?:\d[\d_]*\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|\.inf|\.nan)/
		);
		if (numMatch) {
			const after = text[numMatch[0].length];
			if (after === undefined || after === ' ' || after === ',' || after === ']' || after === '}') {
				return createToken('number', numMatch[0], pos);
			}
			// Best-effort ISO date/time, e.g. 2026-06-21 or timestamps.
			const dateMatch = text.match(
				/^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}(?::?\d{2})?)?)?/
			);
			if (dateMatch) {
				return createToken('number', dateMatch[0], pos);
			}
		}

		// Flow punctuation and the value-position colon.
		const punctChar = text[0];
		if (punctChar === '{' || punctChar === '}') {
			return createToken('punctuation.brace', punctChar, pos);
		}
		if (punctChar === '[' || punctChar === ']') {
			return createToken('punctuation.bracket', punctChar, pos);
		}
		if (punctChar === ',') {
			return createToken('punctuation.separator', punctChar, pos);
		}
		if (punctChar === ':') {
			return createToken('punctuation.separator', punctChar, pos);
		}

		// Bare/unquoted scalar value — emit up to a comment, comma, or flow close.
		const scalarMatch = text.match(/^[^\s#,[\]{}][^#,[\]{}]*?(?=\s+#|[,[\]{}]|\s*$)/);
		if (scalarMatch && scalarMatch[0].length > 0) {
			const scalar = scalarMatch[0].replace(/\s+$/, '');
			if (scalar.length > 0) {
				return createToken(this.classifyScalar(scalar), scalar, pos);
			}
		}

		return createToken('text', text[0], pos);
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
	private atKeyPosition(line: string, pos: number): boolean {
		const before = line.slice(0, pos);
		if (before.trim() === '') return true;
		// After a list-item marker: indentation followed by one or more "- ".
		if (/^[ ]*(?:-[ ]+)+$/.test(before)) return true;
		// Inside a flow mapping, after "{" or "," (ignoring whitespace).
		if (/[{,]\s*$/.test(before)) return true;
		return false;
	}

	/**
	 * Attempt to read a mapping key (quoted or unquoted scalar) that is immediately
	 * followed by ":" and then whitespace or end of line. Returns a property token
	 * for the key (the following ":" is tokenized separately as a separator).
	 */
	private tryMappingKey(text: string, pos: number): Token | null {
		// Quoted key
		if (text[0] === '"' || text[0] === "'") {
			const str =
				text[0] === '"'
					? this.tokenizeDoubleString(text, pos)
					: this.tokenizeSingleString(text, pos);
			const after = text.slice(str.text.length);
			if (/^:(?:\s|$)/.test(after)) {
				return createToken('property', str.text, pos);
			}
			return null;
		}

		// Unquoted key: characters up to a ':' that is followed by space/end.
		const keyMatch = text.match(/^([^\s#,[\]{}][^:#]*?)(?=:(?:\s|$))/);
		if (keyMatch) {
			const key = keyMatch[1];
			if (key.length > 0 && !key.includes(': ')) {
				return createToken('property', key, pos);
			}
		}
		return null;
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

	private tokenizeDoubleString(text: string, pos: number): Token {
		let i = 1;
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
		return createToken('string', text.slice(0, i), pos);
	}

	private tokenizeSingleString(text: string, pos: number): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === "'") {
				// A doubled '' is an escaped quote, not the end.
				if (text[i + 1] === "'") {
					i += 2;
					continue;
				}
				return createToken('string', text.slice(0, i + 1), pos);
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}
}

export function createYamlTokenizer() {
	return new YamlTokenizer();
}
