/**
 * Groovy tokenizer (also covers Gradle build scripts and Jenkinsfiles)
 *
 * Design notes / closed caveats:
 *  - GString interpolation (`$ident`, `$a.b.c`, `${expr}`) is fully SUB-TOKENIZED:
 *    the `$`/`${`/`}` delimiters are emitted as string.template, and the inner
 *    expression is tokenized with real types (variable/property/operator/number/
 *    function.call/punctuation) by re-entering the main token machinery. The
 *    surrounding literal stays `string`. All lossless.
 *  - String escapes (`\n`, `\t`, `\uXXXX`, `\"`, `\\`, `\$`, octal, etc.) are
 *    emitted as string.escape inside both single- and double-quoted strings and
 *    triple GStrings.
 *  - Numbers carry precise subtypes: number.hex / number.binary / number.float /
 *    number.integer (octal `0NNN` classifies as integer).
 *  - Generic/type-argument `<` `>` (incl. `>>` close) are emitted as
 *    punctuation.bracket when an angle-bracket depth is open; `<` opens a context
 *    only after a type name. Spread-dot `*.`, method-reference `.&`, method-pointer
 *    `::`, and direct-field `.@` are single operators. Properties after an
 *    accessor classify as `property`.
 *  - Every multi-line construct (block/doc comment, triple-single string, triple
 *    GString, dollar-slashy) threads via state and is sub-tokenized on resume.
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Groovy keywords
const keywords = new Set([
	'def',
	'class',
	'interface',
	'enum',
	'trait',
	'public',
	'private',
	'protected',
	'static',
	'final',
	'abstract',
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
	'throw',
	'throws',
	'try',
	'catch',
	'finally',
	'import',
	'package',
	'new',
	'this',
	'super',
	'extends',
	'implements',
	'in',
	'as',
	'instanceof',
	'assert',
	'it',
	'void',
	'goto',
	'native',
	'synchronized',
	'transient',
	'volatile'
]);

const definitionKeywords = new Set(['def', 'class', 'interface', 'enum', 'trait']);

const storageKeywords = new Set([
	'public',
	'private',
	'protected',
	'static',
	'final',
	'abstract',
	'native',
	'synchronized',
	'transient',
	'volatile',
	'void'
]);

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
	'throw',
	'try',
	'catch',
	'finally'
]);

const moduleKeywords = new Set(['import', 'package']);

const builtinConstants = new Set(['true', 'false', 'null']);

const builtinTypes = new Set([
	'String',
	'Integer',
	'List',
	'Map',
	'Object',
	'Boolean',
	'Closure',
	'int',
	'long',
	'short',
	'byte',
	'char',
	'float',
	'double',
	'boolean',
	'BigInteger',
	'BigDecimal',
	'Number',
	'Set',
	'Collection',
	'GString',
	'Class'
]);

interface GroovyTokenizerState extends TokenizerState {
	/** Inside a triple-single-quoted multi-line string */
	inTripleSingle?: boolean;
	/** Inside a triple-double-quoted multi-line GString */
	inTripleDouble?: boolean;
	/** Inside a multi-line dollar-slashy string ($/ ... /$) */
	inDollarSlashy?: boolean;
}

export class GroovyTokenizer {
	language = 'groovy';

	/**
	 * Angle-bracket nesting depth for generic/type-argument contexts. When > 0 the
	 * `<`, `>`, and `>>`/`>>>` tokens classify as punctuation.bracket rather than
	 * comparison/shift operators. Scoped per tokenizeLine call (generics never span
	 * lines in idiomatic Groovy), so it lives on the instance only transiently.
	 */
	private angleDepth = 0;

	getInitialState(): GroovyTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: GroovyTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: GroovyTokenizerState = { ...prevState };
		this.angleDepth = 0;

		// Resume a block comment from a previous line
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

		// Resume a triple-single-quoted multi-line string (literal — escapes only)
		if (state.inTripleSingle) {
			const endIdx = line.indexOf("'''");
			if (endIdx !== -1) {
				this.pushStringWithEscapes(tokens, line.slice(0, endIdx + 3), 0, 'string', false);
				pos = endIdx + 3;
				state.inTripleSingle = false;
			} else {
				this.pushStringWithEscapes(tokens, line, 0, 'string', false);
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a triple-double-quoted multi-line GString (escapes + interpolation)
		if (state.inTripleDouble) {
			const endIdx = line.indexOf('"""');
			if (endIdx !== -1) {
				this.pushGStringBody(tokens, line.slice(0, endIdx + 3), 0);
				pos = endIdx + 3;
				state.inTripleDouble = false;
			} else {
				this.pushGStringBody(tokens, line, 0);
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a multi-line dollar-slashy string ($/ ... /$)
		if (state.inDollarSlashy) {
			const endIdx = this.findDollarSlashyEnd(line, 0);
			if (endIdx !== -1) {
				this.pushDollarSlashyBody(tokens, line.slice(0, endIdx + 2), 0);
				pos = endIdx + 2;
				state.inDollarSlashy = false;
			} else {
				this.pushDollarSlashyBody(tokens, line, 0);
				return { lineNumber, tokens, text: line, state };
			}
		}

		this.tokenizeChunk(tokens, line, pos, state);

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	/**
	 * Tokenize a span of normal Groovy code starting at `pos` to end of `line`,
	 * pushing into `tokens`. Used both for whole lines and for the inner expression
	 * of a `${...}` interpolation (which is plain Groovy code). Returns end pos.
	 */
	private tokenizeChunk(
		tokens: Token[],
		line: string,
		pos: number,
		state: GroovyTokenizerState
	): number {
		while (pos < line.length) {
			const consumed = this.consumeNextToken(line, pos, state, tokens);
			if (consumed > pos) {
				pos = consumed;
			} else {
				tokens.push(createToken('text', line[pos], pos));
				pos += 1;
			}
		}
		return pos;
	}

	/**
	 * Consume the next token at `pos` in `line`, pushing one or more tokens into
	 * `tokens`. Returns the new position (== pos if nothing matched). String/regex
	 * handlers may push multiple sub-tokens.
	 */
	private consumeNextToken(
		line: string,
		pos: number,
		state: GroovyTokenizerState,
		tokens: Token[]
	): number {
		const text = line.slice(pos);

		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			tokens.push(createToken('text', wsMatch[0], pos));
			return pos + wsMatch[0].length;
		}

		// Line comments
		if (text.startsWith('//')) {
			tokens.push(createToken('comment.line', text, pos));
			return pos + text.length;
		}

		// Shebang (e.g. Jenkinsfile / gradle scripts on line 1)
		if (pos === 0 && text.startsWith('#!')) {
			tokens.push(createToken('comment.line', text, pos));
			return pos + text.length;
		}

		// Doc comments /** ... */
		if (text.startsWith('/**') && !text.startsWith('/**/')) {
			const endIdx = text.indexOf('*/', 3);
			if (endIdx !== -1) {
				tokens.push(createToken('comment.doc', text.slice(0, endIdx + 2), pos));
				return pos + endIdx + 2;
			}
			state.inBlockComment = true;
			tokens.push(createToken('comment.doc', text, pos));
			return pos + text.length;
		}

		// Block comments
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				tokens.push(createToken('comment.block', text.slice(0, endIdx + 2), pos));
				return pos + endIdx + 2;
			}
			state.inBlockComment = true;
			tokens.push(createToken('comment.block', text, pos));
			return pos + text.length;
		}

		// Triple-quoted strings
		if (text.startsWith("'''")) {
			return this.tokenizeTripleString(tokens, line, pos, "'''", state);
		}
		if (text.startsWith('"""')) {
			return this.tokenizeTripleString(tokens, line, pos, '"""', state);
		}

		// Double-quoted GString (interpolated) => sub-tokenized template
		if (text.startsWith('"')) {
			return this.tokenizeGString(tokens, line, pos);
		}

		// Single-quoted literal string (escapes, no interpolation)
		if (text.startsWith("'")) {
			return this.tokenizeSingleString(tokens, line, pos);
		}

		// Dollar-slashy string: $/ ... /$ (may span multiple lines). Inside,
		// only `$$`, `$/` and `/$` are special; bare `/` and `$` are literal.
		// Interpolation ($x, ${...}) is still active inside dollar-slashy strings.
		if (text.startsWith('$/')) {
			return this.tokenizeDollarSlashy(tokens, line, pos, state);
		}

		// Slashy regex strings — only after =, (, comma, or `return` (avoids
		// confusing the division operator for a regex literal). Best effort.
		if (text.startsWith('/') && !text.startsWith('//') && this.regexAllowed(tokens)) {
			const end = this.tokenizeSlashy(tokens, line, pos);
			if (end > pos) {
				return end;
			}
		}

		// Numbers — decimal, hex, binary, underscores, floats, and Groovy type
		// suffixes (g/G, l/L, i/I, f/F, d/D). Per the Groovy spec, suffixes apply
		// to hex/binary/octal literals too (e.g. 0xFFi, 0b1111L).
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+[gGlLiI]?|0[bB][01_]+[gGlLiI]?|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?[gGlLiIfFdD]?)/
		);
		if (numMatch) {
			tokens.push(createToken(this.classifyNumber(numMatch[0]), numMatch[0], pos));
			return pos + numMatch[0].length;
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
		if (identMatch) {
			const word = identMatch[0];
			tokens.push(createToken(this.classifyIdentifier(word, text, word.length, tokens), word, pos));
			return pos + word.length;
		}

		// Operators (longest first). Includes spread-dot `*.`, method-reference
		// `.&`, direct-field `.@`, method-pointer `::`, elvis `?:`, safe-nav `?.`,
		// spaceship `<=>`, ranges `..`/`..<`, regex find/match `=~`/`==~`.
		const opEnd = this.tokenizeOperatorOrAngle(tokens, line, pos);
		if (opEnd > pos) {
			return opEnd;
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;@]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';' || char === ':') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			tokens.push(createToken(type, char, pos));
			return pos + 1;
		}

		return pos;
	}

	/**
	 * Handle `<`, `>`, `>>`, `>>>` with generic/type-argument awareness, then fall
	 * back to the general operator matcher. When inside a generic context (angle
	 * depth > 0) or opening one after a type name, the angle brackets become
	 * punctuation.bracket. Returns the new position (== pos if nothing matched).
	 */
	private tokenizeOperatorOrAngle(tokens: Token[], line: string, pos: number): number {
		const text = line.slice(pos);

		// Closing generic brackets: `>`, `>>`, `>>>` while a generic is open.
		if (this.angleDepth > 0 && text[0] === '>') {
			// Consume as many `>` as there are open angle levels (max the run length).
			let run = 0;
			while (run < text.length && text[run] === '>') run++;
			const close = Math.min(run, this.angleDepth);
			for (let k = 0; k < close; k++) {
				tokens.push(createToken('punctuation.bracket', '>', pos + k));
			}
			this.angleDepth -= close;
			return pos + close;
		}

		// Opening a generic context: `<` immediately after a type/class name or a
		// `>` close (nested generics) — i.e. the previous significant token reads as
		// a type. e.g. `List<`, `Map<String,`, `List<List<`.
		if (text[0] === '<' && text[1] !== '<' && text[1] !== '=' && this.genericOpenAllowed(tokens)) {
			this.angleDepth++;
			tokens.push(createToken('punctuation.bracket', '<', pos));
			return pos + 1;
		}

		// Inside a generic context, `,` and `?` (wildcard) still come through the
		// normal punctuation/operator path; only the angle brackets are special.

		const opMatch = text.match(
			/^(?:\.\.<|<=>|\*\*=|>>>=|>>=|<<=|===|!==|\*\.|\.&|\.@|::|<=|>=|==~|=~|&&|\|\||\+\+|--|\*\*|\?:|\?\.|\?=|\.\.|->|<<|>>|==|!=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[+\-*/%&|^!<>=~?])/
		);
		if (opMatch) {
			tokens.push(createToken(this.classifyOperator(opMatch[0]), opMatch[0], pos));
			return pos + opMatch[0].length;
		}
		return pos;
	}

	/**
	 * Whether a `<` here should open a generic/type-argument context: true when the
	 * last significant token reads as a type (builtin/class) or a generic close.
	 */
	private genericOpenAllowed(tokens: Token[]): boolean {
		for (let i = tokens.length - 1; i >= 0; i--) {
			const t = tokens[i];
			if (t.type === 'text' && t.text.trim() === '') continue;
			// After a type name, or a generic close (nested generics like `List<List<`).
			if (
				t.type === 'type.builtin' ||
				t.type === 'type.class' ||
				t.type === 'type' ||
				t.type === 'type.interface' ||
				(t.type === 'punctuation.bracket' && t.text === '>')
			) {
				return true;
			}
			// `def <T> ...` generic method / `extends`/`implements`/`new` type-param
			// positions. None of these keyword tokens are ever the left operand of a
			// `<` comparison, so opening a generic context here is safe.
			if (
				(t.type === 'keyword.definition' && t.text === 'def') ||
				(t.type === 'keyword' &&
					(t.text === 'new' || t.text === 'extends' || t.text === 'implements'))
			) {
				return true;
			}
			return false;
		}
		return false;
	}

	private classifyNumber(num: string): TokenType {
		if (/^0[xX]/.test(num)) return 'number.hex';
		if (/^0[bB]/.test(num)) return 'number.binary';
		// Float: a decimal point, an exponent, or a float/double suffix.
		if (/[.eE]/.test(num) || /[fFdD]$/.test(num)) return 'number.float';
		return 'number.integer';
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		tokens: Token[]
	): TokenType {
		// Built-in constants
		if (builtinConstants.has(word)) {
			if (word === 'true' || word === 'false') return 'constant.boolean';
			if (word === 'null') return 'constant.null';
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

		const afterWord = context.slice(wordLength);
		const prev = this.lastSignificant(tokens);
		const afterAccessor =
			prev !== null &&
			((prev.type === 'punctuation.accessor' && prev.text === '.') ||
				(prev.type === 'operator' &&
					(prev.text === '?.' ||
						prev.text === '*.' ||
						prev.text === '.@' ||
						prev.text === '.&' ||
						prev.text === '::')));

		// A member access (`.foo`, `?.foo`, `*.foo`, `.@foo`, `.&foo`, `::foo`):
		// method call vs property. Builtins are NOT re-classified as types here —
		// `obj.String` is a property access, not a type reference.
		if (afterAccessor) {
			if (afterWord.startsWith('(')) return 'function.call';
			return 'property';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Function call: identifier immediately followed by (
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// SCREAMING_SNAKE_CASE reads as a constant (checked before PascalCase, which
		// would otherwise greedily claim all-caps identifiers as class names).
		if (/^[A-Z][A-Z0-9_$]*$/.test(word) && /_/.test(word)) {
			return 'constant';
		}

		// PascalCase identifiers read as class/type names
		if (/^[A-Z][a-zA-Z0-9_$]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	private lastSignificant(tokens: Token[]): Token | null {
		for (let i = tokens.length - 1; i >= 0; i--) {
			const t = tokens[i];
			if (t.type === 'text' && t.text.trim() === '') continue;
			return t;
		}
		return null;
	}

	private classifyOperator(op: string): TokenType {
		// Spread-dot, method-reference, method-pointer, direct-field access — these
		// are member-access operators; keep them as the generic operator subtype so
		// they are visually distinct from arithmetic/comparison.
		if (op === '*.' || op === '.&' || op === '::' || op === '.@') {
			return 'operator';
		}
		// Comparison (incl. spaceship, regex match, case-insensitive match)
		if (
			op === '==' ||
			op === '===' ||
			op === '!=' ||
			op === '!==' ||
			op === '<' ||
			op === '>' ||
			op === '<=' ||
			op === '>=' ||
			op === '<=>' ||
			op === '=~' ||
			op === '==~'
		) {
			return 'operator.comparison';
		}
		// Logical
		if (op === '&&' || op === '||' || op === '!') {
			return 'operator.logical';
		}
		// Arithmetic
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%' || op === '**') {
			return 'operator.arithmetic';
		}
		// Assignment (plain `=` and compound assignments ending in `=`)
		if (op === '=' || /^(?:\+|-|\*|\/|%|&|\||\^|>>>|<<|>>|\*\*)=$/.test(op)) {
			return 'operator.assignment';
		}
		return 'operator';
	}

	private regexAllowed(emitted: Token[]): boolean {
		// Find the last significant (non-whitespace) token already emitted.
		for (let i = emitted.length - 1; i >= 0; i--) {
			const t = emitted[i];
			if (t.type === 'text' && t.text.trim() === '') {
				continue;
			}
			// Slashy strings are typically valid after assignment, an open paren,
			// a comma, or the `return` keyword.
			if (t.type === 'operator.assignment' && t.text === '=') return true;
			if (t.type === 'punctuation.paren' && t.text === '(') return true;
			if (t.type === 'punctuation.separator' && t.text === ',') return true;
			if (t.type === 'punctuation.brace' && t.text === '{') return true;
			if (t.type === 'keyword.control' && t.text === 'return') return true;
			// Groovy's regex-find/match operators (`=~`, `==~`) and the pattern
			// operator (`~/.../`) are essentially always followed by a slashy regex.
			if (t.type === 'operator.comparison' && (t.text === '=~' || t.text === '==~')) return true;
			if (t.type === 'operator' && t.text === '~') return true;
			return false;
		}
		// Start of line: assume a statement context where a regex is plausible.
		return true;
	}

	/**
	 * Tokenize a slashy regex string `/.../`, emitting `\` escapes as string.escape
	 * and `${...}`/`$ident` interpolation sub-tokenized (slashy strings ARE
	 * GStrings). Returns the new position, or `pos` if unterminated (not a regex).
	 */
	private tokenizeSlashy(tokens: Token[], line: string, pos: number): number {
		// Find the terminating unescaped `/`.
		let i = pos + 1;
		while (i < line.length) {
			if (line[i] === '\\' && i + 1 < line.length) {
				i += 2;
				continue;
			}
			// Skip over `${...}` so a `/` inside interpolation doesn't end it early.
			if (line[i] === '$' && line[i + 1] === '{') {
				i = this.skipInterpolationBlock(line, i);
				continue;
			}
			if (line[i] === '/') {
				this.pushSlashyBody(tokens, line.slice(pos, i + 1), pos);
				return i + 1;
			}
			i++;
		}
		// Unterminated on this line — treat as not-a-regex (likely division).
		return pos;
	}

	/** Push a slashy-regex span, sub-tokenizing escapes and interpolation. */
	private pushSlashyBody(tokens: Token[], body: string, basePos: number): void {
		this.pushInterpolatedBody(tokens, body, basePos, 'string.regex', /^\\./);
	}

	/**
	 * Tokenize a multi-line dollar-slashy string ($/ ... /$). Inside the body the
	 * only escape sequences are `$$` (literal $) and `$/` (literal /); the string
	 * terminates at the first `/$`. Interpolation ($x, ${...}) is active. Threads
	 * across lines via state.inDollarSlashy.
	 */
	private tokenizeDollarSlashy(
		tokens: Token[],
		line: string,
		pos: number,
		state: GroovyTokenizerState
	): number {
		const endIdx = this.findDollarSlashyEnd(line, pos);
		if (endIdx !== -1) {
			this.pushDollarSlashyBody(tokens, line.slice(pos, endIdx + 2), pos);
			return endIdx + 2;
		}
		// Unterminated on this line — continue on the next.
		state.inDollarSlashy = true;
		this.pushDollarSlashyBody(tokens, line.slice(pos), pos);
		return line.length;
	}

	/** Index of the terminating `/$` in a dollar-slashy body, honoring `$$`/`$/`. */
	private findDollarSlashyEnd(line: string, from: number): number {
		let i = from;
		// When starting a fresh `$/`, skip the opener so its `/` isn't mistaken.
		if (line[from] === '$' && line[from + 1] === '/') i = from + 2;
		while (i < line.length) {
			if (line[i] === '$' && (line[i + 1] === '$' || line[i + 1] === '/')) {
				i += 2; // `$$` or `$/` escape
				continue;
			}
			if (line[i] === '/' && line[i + 1] === '$') {
				return i;
			}
			i++;
		}
		return -1;
	}

	/**
	 * Push a dollar-slashy span: `$$`/`$/` escapes as string.escape, `${...}`/`$id`
	 * interpolation sub-tokenized, the rest as string.regex. The opening `$/`
	 * delimiter (when present at the start) is emitted as a plain string.regex run
	 * so it is not mistaken for a `$/` literal-slash escape.
	 */
	private pushDollarSlashyBody(tokens: Token[], body: string, basePos: number): void {
		let offset = 0;
		let rest = body;
		if (body.startsWith('$/')) {
			tokens.push(createToken('string.regex', '$/', basePos));
			offset = 2;
			rest = body.slice(2);
		}
		this.pushInterpolatedBody(tokens, rest, basePos + offset, 'string.regex', /^\$[$/]/);
	}

	/**
	 * Tokenize a double-quoted GString, sub-tokenizing escapes (`\n`, `\uXXXX`, …)
	 * and interpolation (`$ident`, `$a.b`, `${expr}`). Returns the new position.
	 */
	private tokenizeGString(tokens: Token[], line: string, pos: number): number {
		let i = pos + 1; // skip opening quote
		while (i < line.length) {
			const ch = line[i];
			if (ch === '\\' && i + 1 < line.length) {
				i += 2;
				continue;
			}
			if (ch === '$' && line[i + 1] === '{') {
				i = this.skipInterpolationBlock(line, i);
				continue;
			}
			if (ch === '"') {
				this.pushGStringBody(tokens, line.slice(pos, i + 1), pos);
				return i + 1;
			}
			i++;
		}
		// Unterminated single-line GString — emit what we have (stays lossless).
		this.pushGStringBody(tokens, line.slice(pos), pos);
		return line.length;
	}

	/** Push a double-quoted/triple GString body: escapes + interpolation. */
	private pushGStringBody(tokens: Token[], body: string, basePos: number): void {
		this.pushInterpolatedBody(
			tokens,
			body,
			basePos,
			'string.template',
			/^\\(?:u[0-9a-fA-F]{0,4}|.)/
		);
	}

	/**
	 * Tokenize a single-quoted literal string. No interpolation, but escapes ARE
	 * processed. Returns the new position.
	 */
	private tokenizeSingleString(tokens: Token[], line: string, pos: number): number {
		let i = pos + 1;
		while (i < line.length) {
			if (line[i] === '\\' && i + 1 < line.length) {
				i += 2;
				continue;
			}
			if (line[i] === "'") {
				this.pushStringWithEscapes(tokens, line.slice(pos, i + 1), pos, 'string', true);
				return i + 1;
			}
			i++;
		}
		// Unterminated single-line string — emit what we have (stays lossless).
		this.pushStringWithEscapes(tokens, line.slice(pos), pos, 'string', true);
		return line.length;
	}

	private tokenizeTripleString(
		tokens: Token[],
		line: string,
		pos: number,
		delimiter: string,
		state: GroovyTokenizerState
	): number {
		const isGString = delimiter === '"""';
		const endIdx = line.indexOf(delimiter, pos + 3);
		if (endIdx !== -1) {
			const body = line.slice(pos, endIdx + 3);
			if (isGString) this.pushGStringBody(tokens, body, pos);
			else this.pushStringWithEscapes(tokens, body, pos, 'string', false);
			return endIdx + 3;
		}
		if (isGString) {
			state.inTripleDouble = true;
			this.pushGStringBody(tokens, line.slice(pos), pos);
		} else {
			state.inTripleSingle = true;
			this.pushStringWithEscapes(tokens, line.slice(pos), pos, 'string', false);
		}
		return line.length;
	}

	/** Advance past a `${ ... }` block starting at `i` (`line[i]==='$'`). Honors
	 *  nested braces and skips nested strings so their braces/quotes don't confuse
	 *  the matcher. Returns the index just past the closing `}` (or end of line). */
	private skipInterpolationBlock(line: string, i: number): number {
		let depth = 1;
		let j = i + 2;
		while (j < line.length && depth > 0) {
			const c = line[j];
			if (c === '\\' && j + 1 < line.length) {
				j += 2;
				continue;
			}
			if (c === '"' || c === "'") {
				j = this.skipNestedString(line, j);
				continue;
			}
			if (c === '{') depth++;
			else if (c === '}') depth--;
			if (depth === 0) {
				j++;
				break;
			}
			j++;
		}
		return j;
	}

	/** Skip a nested quoted string inside interpolation; returns index past close. */
	private skipNestedString(line: string, i: number): number {
		const q = line[i];
		let j = i + 1;
		while (j < line.length) {
			if (line[j] === '\\' && j + 1 < line.length) {
				j += 2;
				continue;
			}
			if (line[j] === q) return j + 1;
			j++;
		}
		return j;
	}

	/**
	 * Core string sub-tokenizer shared by GStrings, slashy regexes and dollar-slashy
	 * strings. Walks `body`, emitting:
	 *   - `string.escape` for spans matched by `escapeRe` at the current index,
	 *   - sub-tokenized interpolation (`$ident`, `$a.b.c`, `${expr}`),
	 *   - and the remaining literal runs as `litType`.
	 * `basePos` is the absolute start of `body`. Lossless: every character of `body`
	 * is emitted exactly once.
	 */
	private pushInterpolatedBody(
		tokens: Token[],
		body: string,
		basePos: number,
		litType: TokenType,
		escapeRe: RegExp
	): void {
		let i = 0;
		let segStart = 0;

		const flush = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken(litType, body.slice(segStart, end), basePos + segStart));
			}
		};

		while (i < body.length) {
			const rest = body.slice(i);

			// Escape sequence.
			const esc = rest.match(escapeRe);
			if (esc && esc.index === 0 && esc[0].length > 0) {
				flush(i);
				tokens.push(createToken('string.escape', esc[0], basePos + i));
				i += esc[0].length;
				segStart = i;
				continue;
			}

			// `${ expr }` interpolation.
			if (body[i] === '$' && body[i + 1] === '{') {
				flush(i);
				const blockEnd = this.skipInterpolationBlock(body, i);
				// Opening `${`
				tokens.push(createToken('string.template', '${', basePos + i));
				// Inner expression (everything up to a trailing `}` if present).
				const closed = body[blockEnd - 1] === '}';
				const innerEnd = closed ? blockEnd - 1 : blockEnd;
				const inner = body.slice(i + 2, innerEnd);
				if (inner.length > 0) {
					this.pushInnerExpression(tokens, inner, basePos + i + 2);
				}
				if (closed) {
					tokens.push(createToken('string.template', '}', basePos + blockEnd - 1));
				}
				i = blockEnd;
				segStart = i;
				continue;
			}

			// `$ident` (optionally dotted: `$a.b.c`) interpolation.
			if (body[i] === '$' && /[a-zA-Z_]/.test(body[i + 1] ?? '')) {
				flush(i);
				const m = rest.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*/);
				const span = m ? m[0] : '$';
				// Emit `$` as template marker, then the dotted path with property types.
				tokens.push(createToken('string.template', '$', basePos + i));
				this.pushDottedPath(tokens, span.slice(1), basePos + i + 1);
				i += span.length;
				segStart = i;
				continue;
			}

			i++;
		}
		flush(body.length);
	}

	/** Emit a `$a.b.c` dotted path: first segment variable, the rest property,
	 *  with `.` accessors between. */
	private pushDottedPath(tokens: Token[], path: string, basePos: number): void {
		const parts = path.split('.');
		let offset = 0;
		for (let k = 0; k < parts.length; k++) {
			const name = parts[k];
			if (k > 0) {
				tokens.push(createToken('punctuation.accessor', '.', basePos + offset));
				offset += 1;
			}
			tokens.push(createToken(k === 0 ? 'variable' : 'property', name, basePos + offset));
			offset += name.length;
		}
	}

	/**
	 * Tokenize the inner expression of a `${ ... }` block as real Groovy code,
	 * re-entering the main token machinery. `basePos` is the absolute offset of the
	 * first inner char. A throwaway state isolates multi-line flags. Lossless.
	 */
	private pushInnerExpression(tokens: Token[], inner: string, basePos: number): void {
		const innerTokens: Token[] = [];
		const savedAngle = this.angleDepth;
		this.angleDepth = 0;
		const throwaway: GroovyTokenizerState = {};
		this.tokenizeChunk(innerTokens, inner, 0, throwaway);
		this.angleDepth = savedAngle;
		// Shift positions to absolute and re-emit.
		for (const t of innerTokens) {
			tokens.push(createToken(t.type, t.text, basePos + t.start));
		}
	}

	/**
	 * Push a literal string span (single-quoted or triple-single), emitting escape
	 * sequences as string.escape. `hasInterp` is false for these (no GString
	 * interpolation), so only escapes are broken out.
	 */
	private pushStringWithEscapes(
		tokens: Token[],
		body: string,
		basePos: number,
		litType: TokenType,
		_hasInterp: boolean
	): void {
		void _hasInterp;
		let i = 0;
		let segStart = 0;
		const flush = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken(litType, body.slice(segStart, end), basePos + segStart));
			}
		};
		while (i < body.length) {
			if (body[i] === '\\' && i + 1 < body.length) {
				flush(i);
				const m = body.slice(i).match(/^\\(?:u[0-9a-fA-F]{0,4}|.)/);
				const esc = m ? m[0] : body.slice(i, i + 2);
				tokens.push(createToken('string.escape', esc, basePos + i));
				i += esc.length;
				segStart = i;
				continue;
			}
			i++;
		}
		flush(body.length);
	}
}

export function createGroovyTokenizer(): GroovyTokenizer {
	return new GroovyTokenizer();
}
