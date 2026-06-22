/**
 * PowerShell tokenizer
 *
 * Closed limitations (A+ pass):
 *  - Expandable strings ("..." and @"..."@ here-strings) are SUB-TOKENIZED:
 *    the literal text stays string.template, embedded $var / ${var} / $(...) are
 *    tokenized as real variables / sub-expressions, and backtick escapes (`n `t
 *    `u{1F600} `" `$ ``) emit string.escape — all losslessly.
 *  - Number subtypes: number.hex / number.binary / number.float / number.integer.
 *  - Type literals [int] / [System.Math] / [string[]] emit type.builtin /
 *    type.class / type.namespace with the brackets as punctuation.bracket, and the
 *    member after :: / . is classified as property / function.call.
 *  - Redirection operators (2>&1, *>, 2>>, 1>&2, >, >>) are a single operator token.
 *  - Definition names are precise: `function Foo` -> function.definition,
 *    `class C` / `enum E` -> type.class, attributes [CmdletBinding()] -> type.
 *  - Multi-line threading: block comments, expandable + literal here-strings, and
 *    unterminated double-quoted strings all thread via state (with interpolation
 *    still sub-tokenized on every continuation line).
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// PowerShell keywords are case-insensitive; matched against the lowercased word.
const controlKeywords = new Set([
	'if',
	'elseif',
	'else',
	'switch',
	'for',
	'foreach',
	'while',
	'do',
	'until',
	'break',
	'continue',
	'return',
	'throw',
	'try',
	'catch',
	'finally',
	'trap'
]);

const definitionKeywords = new Set(['function', 'filter', 'class', 'enum']);

const otherKeywords = new Set(['param', 'begin', 'process', 'end', 'in', 'data', 'dynamicparam']);

// Storage / modifier-ish contextual keywords used inside class bodies.
const storageKeywords = new Set(['hidden', 'static', 'using']);

// Named operators / type operators spelled with a leading hyphen.
// Split into comparison-ish (relational/equality/pattern/membership) vs logical/
// bitwise/format so we can emit the precise operator subtype.
const comparisonOperators = new Set([
	'eq',
	'ne',
	'gt',
	'lt',
	'ge',
	'le',
	'match',
	'notmatch',
	'like',
	'notlike',
	'contains',
	'notcontains',
	'in',
	'notin',
	'is',
	'isnot',
	'ceq',
	'cne',
	'cgt',
	'clt',
	'cge',
	'cle',
	'cmatch',
	'cnotmatch',
	'clike',
	'cnotlike',
	'ccontains',
	'cnotcontains',
	'ieq',
	'ine',
	'igt',
	'ilt',
	'ige',
	'ile',
	'imatch',
	'inotmatch',
	'ilike',
	'inotlike',
	'icontains',
	'inotcontains'
]);

const logicalOperators = new Set(['and', 'or', 'not', 'xor']);

const bitwiseOperators = new Set(['band', 'bor', 'bnot', 'bxor', 'shl', 'shr']);

// Remaining named operators that are arithmetic-ish / conversion / formatting.
const otherNamedOperators = new Set(['join', 'split', 'replace', 'as', 'f', 'csplit', 'creplace']);

// Automatic variables that carry special meaning.
const booleanVariables = new Set(['true', 'false']);

// Well-known .NET / PowerShell builtin type accelerators -> type.builtin.
const builtinTypes = new Set([
	'int',
	'int16',
	'int32',
	'int64',
	'long',
	'short',
	'byte',
	'sbyte',
	'uint',
	'uint16',
	'uint32',
	'uint64',
	'ulong',
	'ushort',
	'float',
	'double',
	'decimal',
	'single',
	'bool',
	'boolean',
	'string',
	'char',
	'object',
	'void',
	'array',
	'hashtable',
	'ordered',
	'datetime',
	'timespan',
	'guid',
	'regex',
	'version',
	'uri',
	'xml',
	'switch',
	'scriptblock',
	'pscustomobject',
	'psobject',
	'type',
	'bigint',
	'nullable'
]);

interface PowerShellTokenizerState extends TokenizerState {
	/** Inside a <# ... #> block comment */
	inBlockComment?: boolean;
	/** Inside an expandable here-string @" ... "@ */
	inHereStringDouble?: boolean;
	/** Inside a literal here-string @' ... '@ */
	inHereStringSingle?: boolean;
	/** Inside an unterminated double-quoted expandable string (line continuation) */
	inDoubleString?: boolean;
}

export class PowerShellTokenizer {
	language = 'powershell';

	getInitialState(): PowerShellTokenizerState {
		return {};
	}

	tokenizeLine(
		line: string,
		lineNumber: number,
		prevState?: PowerShellTokenizerState
	): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: PowerShellTokenizerState = { ...prevState };

		// Resume a block comment from a previous line.
		if (state.inBlockComment) {
			const endIdx = line.indexOf('#>');
			if (endIdx !== -1) {
				tokens.push(createToken('comment.block', line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
			} else {
				tokens.push(createToken('comment.block', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume an expandable here-string. The closing "@ must be at the very
		// start of the line (PowerShell requires the terminator in column 0).
		if (state.inHereStringDouble) {
			if (/^"@/.test(line)) {
				tokens.push(createToken('string.template', '"@', 0));
				pos = 2;
				state.inHereStringDouble = false;
			} else {
				// Continuation line of an expandable here-string: still interpolates.
				this.pushExpandableBody(tokens, line, 0, line.length, 0);
				if (line.length === 0) {
					tokens.push(createToken('string.template', '', 0));
				}
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a literal here-string.
		if (state.inHereStringSingle) {
			if (/^'@/.test(line)) {
				tokens.push(createToken('string', "'@", 0));
				pos = 2;
				state.inHereStringSingle = false;
			} else {
				if (line.length > 0) {
					tokens.push(createToken('string', line, 0));
				} else {
					tokens.push(createToken('string', '', 0));
				}
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume an unterminated double-quoted expandable string.
		if (state.inDoubleString) {
			pos = this.resumeDoubleString(tokens, line, state);
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const consumed = this.consume(tokens, remaining, pos, state);
			if (consumed > 0) {
				pos += consumed;
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
	 * Consume the next lexeme starting at `text` (which is line.slice(pos)).
	 * Pushes one or more tokens and returns the number of characters consumed,
	 * or 0 if nothing matched.
	 */
	private consume(
		tokens: Token[],
		text: string,
		pos: number,
		state: PowerShellTokenizerState
	): number {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			tokens.push(createToken('text', wsMatch[0], pos));
			return wsMatch[0].length;
		}

		// Block comments <# ... #>
		if (text.startsWith('<#')) {
			const endIdx = text.indexOf('#>', 2);
			if (endIdx !== -1) {
				tokens.push(createToken('comment.block', text.slice(0, endIdx + 2), pos));
				return endIdx + 2;
			}
			state.inBlockComment = true;
			tokens.push(createToken('comment.block', text, pos));
			return text.length;
		}

		// Line comments.
		if (text.startsWith('#')) {
			tokens.push(createToken('comment.line', text, pos));
			return text.length;
		}

		// Here-strings must be checked before plain strings.
		if (/^@"\s*$/.test(text)) {
			state.inHereStringDouble = true;
			tokens.push(createToken('string.template', text, pos));
			return text.length;
		}
		if (/^@'\s*$/.test(text)) {
			state.inHereStringSingle = true;
			tokens.push(createToken('string', text, pos));
			return text.length;
		}

		// Splatting: @name / @global:name -> single variable reference.
		const splatMatch = text.match(/^@(?:[a-zA-Z_][a-zA-Z0-9_]*:)?[a-zA-Z_][a-zA-Z0-9_]*/);
		if (splatMatch) {
			tokens.push(createToken('variable', splatMatch[0], pos));
			return splatMatch[0].length;
		}

		// Double-quoted (expandable) string with interpolation + escapes.
		if (text.startsWith('"')) {
			return this.tokenizeDoubleString(tokens, text, pos, state);
		}

		// Single-quoted (literal) string.
		if (text.startsWith("'")) {
			return this.tokenizeSingleString(tokens, text, pos);
		}

		// Variables: $name, ${name}, $_, $$, $?, $^
		if (text.startsWith('$')) {
			const v = this.matchVariable(text, pos);
			if (v) {
				tokens.push(v);
				return v.text.length;
			}
		}

		// Type literal: [int], [System.Math], [string[]], [ValidateNotNull()]
		if (text.startsWith('[')) {
			const consumed = this.tryTokenizeTypeLiteral(tokens, text, pos);
			if (consumed > 0) return consumed;
		}

		// Redirection operators: 2>&1, *>, 2>>, 1>&2, >, >>, < — checked before
		// numbers so a stream id like `2` in `2>&1` is not eaten as a number.
		const redir = text.match(/^(?:[0-9*]>>?(?:&[0-9])?|>>?(?:&[0-9])?|<)/);
		if (redir && /[<>]/.test(redir[0])) {
			tokens.push(createToken('operator', redir[0], pos));
			return redir[0].length;
		}

		// Numbers (with precise subtype).
		const numTok = this.matchNumber(text, pos);
		if (numTok) {
			tokens.push(numTok);
			return numTok.text.length;
		}

		// Named operators and parameters: -eq, -match, -ParameterName, --%
		if (text.startsWith('-')) {
			// Stop-parsing token --%
			if (text.startsWith('--%')) {
				tokens.push(createToken('operator', '--%', pos));
				return 3;
			}
			const dashWord = text.match(/^-[a-zA-Z][a-zA-Z0-9]*/);
			if (dashWord) {
				const word = dashWord[0].slice(1).toLowerCase();
				if (comparisonOperators.has(word)) {
					tokens.push(createToken('operator.comparison', dashWord[0], pos));
					return dashWord[0].length;
				}
				if (logicalOperators.has(word)) {
					tokens.push(createToken('operator.logical', dashWord[0], pos));
					return dashWord[0].length;
				}
				if (bitwiseOperators.has(word) || otherNamedOperators.has(word)) {
					tokens.push(createToken('operator', dashWord[0], pos));
					return dashWord[0].length;
				}
				tokens.push(createToken('variable.parameter', dashWord[0], pos));
				return dashWord[0].length;
			}
		}

		// Identifiers / cmdlets / keywords (and a property after a leading accessor
		// is handled where the accessor is consumed below, not here).
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*(?:-[a-zA-Z_][a-zA-Z0-9_]*)*/);
		if (identMatch) {
			const word = identMatch[0];
			const tok = this.classifyIdentifier(word, text, word.length, tokens);
			tokens.push(createToken(tok, word, pos));
			return word.length;
		}

		// Null-conditional access $x?.Member — operator then property.
		if (text.startsWith('?.')) {
			tokens.push(createToken('operator', '?.', pos));
			const after = text.slice(2);
			if (/^[a-zA-Z_]/.test(after)) {
				this.pushMember(tokens, after, pos + 2);
				return 2 + this.memberLength(after);
			}
			return 2;
		}
		// Null-conditional index $x?[0] — operator '?' then the bracket follows.
		if (text.startsWith('?[')) {
			tokens.push(createToken('operator', '?', pos));
			return 1;
		}

		// Static member access :: — emit the operator then classify the member, so
		// `[Math]::Pi` -> property and `[Math]::Max(` -> function.call. Checked
		// before generic symbolic operators (which would also match `::`).
		if (text.startsWith('::')) {
			tokens.push(createToken('operator', '::', pos));
			const after = text.slice(2);
			const mlen = this.memberLength(after);
			if (mlen > 0) {
				this.pushMember(tokens, after, pos + 2);
				return 2 + mlen;
			}
			return 2;
		}

		// Instance member access via '.' — accessor then property/method. Only when
		// an identifier follows (so `..` range and `.5` float are untouched here;
		// those are handled by the range/number branches above).
		if (text.startsWith('.') && !text.startsWith('..')) {
			const m = text.slice(1).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
			if (m) {
				tokens.push(createToken('punctuation.accessor', '.', pos));
				this.pushMember(tokens, text.slice(1), pos + 1);
				return 1 + m[0].length;
			}
		}

		// Symbolic operators. Pipeline | handled here too. (Redirection handled above.)
		const opMatch = text.match(
			/^(?:\.\.|\?\?=|\?\?|\+\+|--|\*=|\/=|%=|\+=|-=|\|\||&&|[-+*/%](?![a-zA-Z])|[=!]=?|[<>]=?|[|&])/
		);
		if (opMatch) {
			const op = opMatch[0];
			tokens.push(createToken(this.classifyOperator(op), op, pos));
			return op.length;
		}

		// Ternary operator (PowerShell 7): `$cond ? $a : $b`. A standalone '?' is
		// unambiguous; a ' : ' (whitespace-flanked colon) is the ternary alternative
		// branch (scope colons live inside the variable token and never reach here).
		if (text.startsWith('?')) {
			tokens.push(createToken('operator', '?', pos));
			return 1;
		}
		if (text.startsWith(':')) {
			tokens.push(createToken('operator', ':', pos));
			return 1;
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.;@&]/);
		if (punctMatch) {
			const char = punctMatch[0];
			tokens.push(createToken(this.classifyPunctuation(char), char, pos));
			return 1;
		}

		return 0;
	}

	private classifyOperator(op: string): TokenType {
		if (op === '=') return 'operator.assignment';
		if (op === '+=' || op === '-=' || op === '*=' || op === '/=' || op === '%=' || op === '??=')
			return 'operator.assignment';
		if (op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=')
			return 'operator.comparison';
		if (op === '||' || op === '&&' || op === '|' || op === '&') return 'operator.logical';
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%')
			return 'operator.arithmetic';
		if (op === '++' || op === '--') return 'operator.arithmetic';
		// .. :: ?? ?. and anything else stay as the generic operator.
		return 'operator';
	}

	private classifyPunctuation(char: string): TokenType {
		if (char === '{' || char === '}') return 'punctuation.brace';
		if (char === '[' || char === ']') return 'punctuation.bracket';
		if (char === '(' || char === ')') return 'punctuation.paren';
		if (char === ',' || char === ';') return 'punctuation.separator';
		if (char === '.') return 'punctuation.accessor';
		return 'punctuation';
	}

	/** Length of an identifier/member name at the start of `text` (0 if none). */
	private memberLength(text: string): number {
		const m = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		return m ? m[0].length : 0;
	}

	/**
	 * Emit a member name after an accessor. A method call (name followed by '(')
	 * is function.call; a bare member is property.
	 */
	private pushMember(tokens: Token[], text: string, pos: number): void {
		const m = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (!m) return;
		const name = m[0];
		const after = text.slice(name.length).trimStart();
		const type: TokenType = after.startsWith('(') ? 'function.call' : 'property';
		tokens.push(createToken(type, name, pos));
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		prevTokens: Token[]
	): TokenType {
		const lower = word.toLowerCase();

		// Keywords (case-insensitive).
		if (controlKeywords.has(lower)) return 'keyword.control';
		if (definitionKeywords.has(lower)) return 'keyword.definition';
		if (otherKeywords.has(lower)) return 'keyword';
		if (storageKeywords.has(lower)) return 'keyword.storage';

		// Definition NAME: the identifier right after a definition keyword.
		const prevSig = this.lastSignificant(prevTokens);
		if (prevSig && prevSig.type === 'keyword.definition') {
			const kw = prevSig.text.toLowerCase();
			if (kw === 'function' || kw === 'filter') return 'function.definition';
			if (kw === 'class' || kw === 'enum') return 'type.class';
		}

		// Cmdlets follow the Verb-Noun pattern (Get-ChildItem, Write-Host).
		if (/^[A-Za-z]+-[A-Za-z][A-Za-z0-9]*$/.test(word)) {
			return 'function.call';
		}

		// A bare identifier immediately followed by '(' is a function call.
		const afterWord = context.slice(wordLength).trim();
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		return 'variable';
	}

	/** The most recent token that is not whitespace/text padding. */
	private lastSignificant(tokens: Token[]): Token | undefined {
		for (let i = tokens.length - 1; i >= 0; i--) {
			const t = tokens[i];
			if (t.type === 'text' && /^[ \t]*$/.test(t.text)) continue;
			return t;
		}
		return undefined;
	}

	/**
	 * Type literal: [int] / [System.Math] / [string[]] / [ValidateNotNull()].
	 * Emits the brackets as punctuation.bracket and the dotted name as
	 * type.namespace (qualifier segments) + type.builtin/type.class (final),
	 * with '.' accessors between. Returns chars consumed, or 0 if not a type lit.
	 */
	private tryTokenizeTypeLiteral(tokens: Token[], text: string, pos: number): number {
		// Must look like [Name...] — a dotted/qualified identifier optionally with
		// generic args or trailing []. Bare `[` indexing is left to punctuation.
		const m = text.match(/^\[([A-Za-z_][A-Za-z0-9_.`+]*)/);
		if (!m) return 0;
		const inner = m[1];

		const out: Token[] = [];
		out.push(createToken('punctuation.bracket', '[', pos));

		// Split the dotted path; classify the final segment, qualifiers as namespace.
		const segments = inner.split('.');
		let cursor = pos + 1; // after '['
		for (let s = 0; s < segments.length; s++) {
			const seg = segments[s];
			if (s > 0) {
				out.push(createToken('punctuation.accessor', '.', cursor));
				cursor += 1;
			}
			const isFinal = s === segments.length - 1;
			let segType: TokenType;
			if (isFinal) {
				segType = builtinTypes.has(seg.toLowerCase()) ? 'type.builtin' : 'type.class';
			} else {
				segType = 'type.namespace';
			}
			out.push(createToken(segType, seg, cursor));
			cursor += seg.length;
		}

		// Now consume the remainder up to and including the matching ']' (handle one
		// level of nested [] for generic/array forms like [string[]] or [hashtable]).
		const rest = text.slice(cursor - pos);
		let depth = 1;
		let i = 0;
		while (i < rest.length && depth > 0) {
			const ch = rest[i];
			if (ch === '[') depth++;
			else if (ch === ']') depth--;
			i++;
			if (depth === 0) break;
		}
		const tail = rest.slice(0, i); // includes the closing ']'
		// Tokenize the tail: group identifier runs (generic-argument type names) and
		// emit brackets/separators/accessors distinctly. e.g. [string[]] or
		// [System.Collections.Generic.List[int]].
		let tcur = cursor;
		let k = 0;
		while (k < tail.length) {
			const ch = tail[k];
			if (ch === '[' || ch === ']') {
				out.push(createToken('punctuation.bracket', ch, tcur));
				k++;
				tcur++;
			} else if (ch === ',') {
				out.push(createToken('punctuation.separator', ch, tcur));
				k++;
				tcur++;
			} else if (ch === '.') {
				out.push(createToken('punctuation.accessor', ch, tcur));
				k++;
				tcur++;
			} else {
				const idm = tail.slice(k).match(/^[A-Za-z_][A-Za-z0-9_`+]*/);
				if (idm) {
					// A nested generic-argument name. '.' is handled separately above,
					// so each idm is a single dotted segment: namespace if a dot
					// follows, else builtin/class.
					const nextChar = tail[k + idm[0].length];
					const followedByDot = nextChar === '.';
					let segType: TokenType;
					if (followedByDot) segType = 'type.namespace';
					else segType = builtinTypes.has(idm[0].toLowerCase()) ? 'type.builtin' : 'type.class';
					out.push(createToken(segType, idm[0], tcur));
					k += idm[0].length;
					tcur += idm[0].length;
				} else {
					out.push(createToken('text', ch, tcur));
					k++;
					tcur++;
				}
			}
		}

		// If we never found a closing ']', this wasn't a clean type literal; bail
		// out and let punctuation/identifier handling take over losslessly.
		if (depth !== 0) return 0;

		for (const t of out) tokens.push(t);
		return tcur - pos;
	}

	/** Match a $variable starting at text[0]; returns a Token or null. */
	private matchVariable(text: string, pos: number): Token | null {
		// Braced variable: ${name} or ${env:PATH}
		if (text.startsWith('${')) {
			const endIdx = text.indexOf('}', 2);
			if (endIdx !== -1) {
				return createToken('variable', text.slice(0, endIdx + 1), pos);
			}
			return createToken('variable', '$', pos);
		}

		// Special single-char automatic variables: $_, $$, $?, $^
		const specialMatch = text.match(/^\$[_$?^]/);
		if (specialMatch) {
			return createToken('variable', specialMatch[0], pos);
		}

		// Scoped or plain variable: $global:foo, $script:bar, $PSItem, $true
		const varMatch = text.match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*:)?[a-zA-Z_][a-zA-Z0-9_]*/);
		if (varMatch) {
			const raw = varMatch[0];
			const colonIdx = raw.indexOf(':');
			const name = (colonIdx !== -1 ? raw.slice(colonIdx + 1) : raw.slice(1)).toLowerCase();
			if (booleanVariables.has(name)) {
				return createToken('constant.boolean', raw, pos);
			}
			if (name === 'null') {
				return createToken('constant.null', raw, pos);
			}
			return createToken('variable', raw, pos);
		}

		// Lone '$'
		return createToken('variable', '$', pos);
	}

	/** Match a numeric literal; returns a typed Token or null. */
	private matchNumber(text: string, pos: number): Token | null {
		const hex = text.match(/^0[xX][0-9a-fA-F]+(?:[uU]?[lLsy]|[lL])?(?:[kKmMgGtTpP][bB])?/);
		if (hex) {
			return createToken('number.hex', hex[0], pos);
		}
		const bin = text.match(/^0[bB][01]+(?:[uU]?[lLsy]|[lL])?(?:[kKmMgGtTpP][bB])?/);
		if (bin) {
			return createToken('number.binary', bin[0], pos);
		}
		// Float: has a fractional part or an exponent. The dot only matches when
		// digits follow, so `1..10` keeps its range operator intact.
		const flt = text.match(
			/^(?:\d+\.\d+(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)(?:[dD])?(?:[kKmMgGtTpP][bB])?/
		);
		if (flt) {
			return createToken('number.float', flt[0], pos);
		}
		const intg = text.match(/^\d+(?:[uU]?[lLsy]|[lLdD])?(?:[kKmMgGtTpP][bB])?/);
		if (intg) {
			// A trailing 'd' multiplier-less decimal suffix => decimal type, still integer-shaped.
			return createToken('number.integer', intg[0], pos);
		}
		return null;
	}

	/**
	 * Tokenize a double-quoted expandable string starting at text[0] === '"'.
	 * Sub-tokenizes interpolation and escapes. Returns chars consumed.
	 * Sets state.inDoubleString if the string is unterminated on this line.
	 */
	private tokenizeDoubleString(
		tokens: Token[],
		text: string,
		pos: number,
		state: PowerShellTokenizerState
	): number {
		// Opening quote.
		tokens.push(createToken('string.template', '"', pos));
		const end = this.pushExpandableBody(tokens, text, 1, text.length, pos);
		if (end < text.length && text[end] === '"') {
			tokens.push(createToken('string.template', '"', pos + end));
			return end + 1;
		}
		// Unterminated -> continues on the next line.
		state.inDoubleString = true;
		return text.length;
	}

	/** Resume an unterminated double-quoted string on a continuation line. */
	private resumeDoubleString(
		tokens: Token[],
		line: string,
		state: PowerShellTokenizerState
	): number {
		const end = this.pushExpandableBody(tokens, line, 0, line.length, 0);
		if (end < line.length && line[end] === '"') {
			tokens.push(createToken('string.template', '"', end));
			state.inDoubleString = false;
			return end + 1;
		}
		if (line.length === 0) {
			tokens.push(createToken('string.template', '', 0));
		}
		return line.length;
	}

	/**
	 * Walk an expandable-string body from index `from` up to either the closing
	 * unescaped `"` or `limit`. Emits string.template for literal runs,
	 * string.escape for backtick escapes / doubled "", and sub-tokenizes $var,
	 * ${var} and $(...) interpolations. `base` is the absolute column of text[0].
	 * Returns the index (within text) where it stopped (at the closing quote or limit).
	 */
	private pushExpandableBody(
		tokens: Token[],
		text: string,
		from: number,
		limit: number,
		base: number
	): number {
		let i = from;
		let literalStart = from;

		const flushLiteral = (upTo: number) => {
			if (upTo > literalStart) {
				tokens.push(
					createToken('string.template', text.slice(literalStart, upTo), base + literalStart)
				);
			}
		};

		while (i < limit) {
			const ch = text[i];

			// Backtick escape: `n `t `0 `" `$ `` `u{1F600} etc.
			if (ch === '`' && i + 1 < limit) {
				flushLiteral(i);
				let len = 2;
				// `u{...} unicode escape
				if ((text[i + 1] === 'u' || text[i + 1] === 'U') && text[i + 2] === '{') {
					const close = text.indexOf('}', i + 3);
					if (close !== -1 && close < limit) {
						len = close - i + 1;
					}
				}
				tokens.push(createToken('string.escape', text.slice(i, i + len), base + i));
				i += len;
				literalStart = i;
				continue;
			}

			// Closing quote (when scanning a "..." string; here-strings pass limit=len).
			if (ch === '"') {
				// Doubled "" is an escaped quote inside the string.
				if (text[i + 1] === '"') {
					flushLiteral(i);
					tokens.push(createToken('string.escape', '""', base + i));
					i += 2;
					literalStart = i;
					continue;
				}
				// Unescaped closing quote.
				flushLiteral(i);
				return i;
			}

			// Interpolation.
			if (ch === '$' && i + 1 < limit) {
				const next = text[i + 1];
				// $(...) subexpression
				if (next === '(') {
					flushLiteral(i);
					const consumed = this.tokenizeSubexpression(tokens, text, i, limit, base);
					i += consumed;
					literalStart = i;
					continue;
				}
				// ${name}
				if (next === '{') {
					const close = text.indexOf('}', i + 2);
					if (close !== -1 && close < limit) {
						flushLiteral(i);
						tokens.push(createToken('variable', text.slice(i, close + 1), base + i));
						i = close + 1;
						literalStart = i;
						continue;
					}
				}
				// $name / $scope:name / $_  (property chains $a.B are not expanded
				// inside strings unless parenthesized, so we stop at the name).
				const vm = text
					.slice(i, limit)
					.match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*:)?[a-zA-Z_][a-zA-Z0-9_]*|^\$[_$?^]/);
				if (vm) {
					flushLiteral(i);
					const raw = vm[0];
					const colonIdx = raw.indexOf(':');
					const name = (colonIdx !== -1 ? raw.slice(colonIdx + 1) : raw.slice(1)).toLowerCase();
					let type: TokenType = 'variable';
					if (booleanVariables.has(name)) type = 'constant.boolean';
					else if (name === 'null') type = 'constant.null';
					tokens.push(createToken(type, raw, base + i));
					i += raw.length;
					literalStart = i;
					continue;
				}
			}

			i++;
		}

		flushLiteral(limit);
		return limit;
	}

	/**
	 * Tokenize a $( ... ) subexpression embedded in an expandable string, with
	 * balanced-paren tracking, recursing into the real lexer for the inner code.
	 * `start` points at the '$'. Returns chars consumed (including $( and )).
	 */
	private tokenizeSubexpression(
		tokens: Token[],
		text: string,
		start: number,
		limit: number,
		base: number
	): number {
		// Emit "$(" as template delimiters (string.template keeps theme cohesion).
		tokens.push(createToken('string.template', '$(', base + start));
		let i = start + 2;
		let depth = 1;
		// Find the matching ')' tracking nested parens, ignoring those inside
		// nested strings is best-effort; for a line tokenizer this is sufficient.
		const innerStart = i;
		while (i < limit && depth > 0) {
			const ch = text[i];
			if (ch === '(') depth++;
			else if (ch === ')') {
				depth--;
				if (depth === 0) break;
			}
			i++;
		}
		const innerEnd = i; // index of the matching ')' (or limit)
		const inner = text.slice(innerStart, innerEnd);

		// Tokenize the inner expression with the real lexer (no string state leakage).
		this.tokenizeInner(tokens, inner, base + innerStart);

		if (innerEnd < limit && text[innerEnd] === ')') {
			tokens.push(createToken('string.template', ')', base + innerEnd));
			return innerEnd - start + 1;
		}
		// Unterminated subexpression on this line — consumed up to limit.
		return limit - start;
	}

	/** Run the per-lexeme consumer over a plain code fragment (no string framing). */
	private tokenizeInner(tokens: Token[], code: string, base: number): void {
		const scratch: PowerShellTokenizerState = {};
		let pos = 0;
		while (pos < code.length) {
			const remaining = code.slice(pos);
			const before = tokens.length;
			const consumed = this.consume(tokens, remaining, base + pos, scratch);
			if (consumed > 0) {
				pos += consumed;
			} else if (tokens.length === before) {
				tokens.push(createToken('text', remaining[0], base + pos));
				pos += 1;
			} else {
				// consume pushed tokens but reported 0 (shouldn't happen); advance 1.
				pos += 1;
			}
		}
	}

	private tokenizeSingleString(tokens: Token[], text: string, pos: number): number {
		let i = 1;
		while (i < text.length) {
			if (text[i] === "'") {
				// Doubled '' is an escaped quote inside a literal string.
				if (text[i + 1] === "'") {
					i += 2;
					continue;
				}
				tokens.push(createToken('string', text.slice(0, i + 1), pos));
				return i + 1;
			}
			i++;
		}
		tokens.push(createToken('string', text.slice(0, i), pos));
		return i;
	}
}

export function createPowerShellTokenizer(): PowerShellTokenizer {
	return new PowerShellTokenizer();
}
