/**
 * Kotlin tokenizer
 *
 * Design notes / closed caveats:
 *  - String templates ($name and ${expr}) are fully SUB-TOKENIZED in both regular
 *    and raw strings: the $ / ${ / } delimiters become `string.template`, and the
 *    inner expression is tokenized with real types (variable, property, operator,
 *    number, function.call, punctuation) via the shared fragment tokenizer. The
 *    surrounding literal text stays `string`. Everything is byte-for-byte lossless.
 *  - Escape sequences (\n \t \uXXXX \" \$ ...) inside regular strings and char
 *    literals are emitted as `string.escape`. Raw strings are literal (no escapes).
 *  - Numbers are sub-typed: number.hex / number.binary / number.float / number.integer.
 *  - Member access: an identifier after `.` / `?.` / `::` is classified `property`
 *    (or `function.call` when followed by `(`).
 *  - Generics: `<` `>` `>>` `>>>` in a type-argument position are emitted as
 *    `punctuation.bracket`, tracked via an angle-bracket depth on a per-line basis.
 *  - Soft / contextual keywords (get, set, by, where, etc.) are classified as
 *    keywords; the implicit lambda parameter `it` is `variable.parameter`.
 *  - Labels (`loop@`, `return@loop`, `this@Outer`) are handled.
 *  - Multi-line constructs threaded via state: block comments, KDoc, and raw
 *    triple-quoted strings (regular double-quoted strings do not span lines).
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (keyword.definition)
const definitionKeywords = new Set([
	'fun',
	'class',
	'interface',
	'object',
	'enum',
	'data',
	'sealed',
	'annotation'
]);

// Storage / modifier keywords (keyword.storage)
const storageKeywords = new Set([
	'val',
	'var',
	'const',
	'lateinit',
	'open',
	'override',
	'abstract',
	'final',
	'private',
	'public',
	'protected',
	'internal',
	'companion',
	'suspend',
	'inline',
	'noinline',
	'crossinline',
	'vararg',
	'tailrec',
	'operator',
	'infix',
	'external',
	'expect',
	'actual',
	'inner'
]);

// Control-flow keywords (keyword.control)
const controlKeywords = new Set([
	'if',
	'else',
	'when',
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

// Module keywords (keyword.module)
const moduleKeywords = new Set(['import', 'package']);

// Remaining plain keywords (keyword)
const otherKeywords = new Set([
	'in',
	'is',
	'as',
	'by',
	'this',
	'super',
	'typealias',
	'where',
	'reified',
	'init',
	'constructor',
	'dynamic'
]);

// Soft / contextual keywords that are only keywords in specific positions. They
// remain valid identifiers elsewhere, so they are resolved with light context.
// `field` is the backing-field reference inside an accessor; `get`/`set` are
// intentionally NOT here because they always appear as `get()` / `set(v)` calls
// and read better as function.call.
const softKeywords = new Set(['field']);

// Built-in types (type.builtin)
const builtinTypes = new Set([
	'Int',
	'Long',
	'Short',
	'Byte',
	'UInt',
	'ULong',
	'UShort',
	'UByte',
	'Char',
	'Boolean',
	'Double',
	'Float',
	'String',
	'CharSequence',
	'Unit',
	'Any',
	'Nothing',
	'Number',
	'Comparable',
	'List',
	'MutableList',
	'Map',
	'MutableMap',
	'Set',
	'MutableSet',
	'Collection',
	'Iterable',
	'Sequence',
	'Pair',
	'Triple',
	'Array',
	'IntArray',
	'LongArray',
	'DoubleArray',
	'FloatArray',
	'BooleanArray',
	'CharArray',
	'ByteArray'
]);

interface KotlinTokenizerState extends TokenizerState {
	/** Inside a /* *\/ block comment (or /** *\/ KDoc) spanning lines */
	inBlockComment?: boolean;
	/** The block comment was opened as a KDoc (/**) */
	blockCommentDoc?: boolean;
	/** Inside a raw triple-quoted string spanning lines */
	inRawString?: boolean;
}

export class KotlinTokenizer {
	language = 'kotlin';

	getInitialState(): KotlinTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: KotlinTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: KotlinTokenizerState = { ...prevState };
		// Tracks the previous SIGNIFICANT token so member access / generics can be
		// classified by context. Reset per line; carrying it across lines is not
		// needed for the heuristics here and keeps line tokenization independent.
		const ctx: TokenContext = { prevType: null, prevText: null, angleDepth: 0 };

		// Resume a block comment / KDoc continuation
		if (state.inBlockComment) {
			const type: TokenType = state.blockCommentDoc ? 'comment.doc' : 'comment.block';
			const endIdx = line.indexOf('*/');
			if (endIdx !== -1) {
				tokens.push(createToken(type, line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
				state.blockCommentDoc = false;
			} else {
				tokens.push(createToken(type, line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a raw triple-quoted string continuation
		if (state.inRawString) {
			const endIdx = line.indexOf('"""');
			if (endIdx !== -1) {
				this.pushRawStringSegment(tokens, line.slice(0, endIdx + 3), 0);
				pos = endIdx + 3;
				state.inRawString = false;
			} else {
				this.pushRawStringSegment(tokens, line, 0);
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);

			// Strings can yield multiple tokens (template breakouts), so they are
			// handled inline and push directly into the token stream.
			if (remaining.startsWith('"""')) {
				pos = this.tokenizeRawString(tokens, remaining, pos, state);
				ctx.prevType = 'string';
				ctx.prevText = '"""';
				continue;
			}
			if (remaining.startsWith('"')) {
				pos = this.tokenizeString(tokens, remaining, pos);
				ctx.prevType = 'string';
				ctx.prevText = '"';
				continue;
			}

			// Escaped char literal ('\n', '\uXXXX', '\'', ...) — breaks the escape out.
			const charEsc = this.tokenizeCharLiteral(tokens, remaining, pos);
			if (charEsc !== -1) {
				pos = charEsc;
				ctx.prevType = 'string';
				ctx.prevText = "'";
				continue;
			}

			const token = this.getNextToken(remaining, pos, state, ctx);
			if (token) {
				tokens.push(token);
				pos = token.end;
				// Whitespace is not "significant" for context heuristics.
				if (token.type !== 'text' || token.text.trim().length > 0) {
					ctx.prevType = token.type;
					ctx.prevText = token.text;
				}
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
		state: KotlinTokenizerState,
		ctx: TokenContext
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}

		// Block comments and KDoc
		if (text.startsWith('/*')) {
			const isDoc = text.startsWith('/**') && !text.startsWith('/**/');
			const type: TokenType = isDoc ? 'comment.doc' : 'comment.block';
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken(type, text.slice(0, endIdx + 2), pos);
			} else {
				state.inBlockComment = true;
				state.blockCommentDoc = isDoc;
				return createToken(type, text, pos);
			}
		}

		// Plain char literal ('a'). Escaped char literals are split into
		// quote/escape/quote tokens by tokenizeCharLiteral before this point.
		if (text.startsWith("'")) {
			const charMatch = text.match(/^'[^'\\]'/);
			if (charMatch) {
				return createToken('string', charMatch[0], pos);
			}
		}

		// A `@label` reference after a jump/this/super keyword (return@loop,
		// break@loop, continue@loop, this@Outer, super@Base) is a label, not an
		// annotation. Classify the @name as variable so it reads as a label ref.
		if (
			text.startsWith('@') &&
			(ctx.prevText === 'return' ||
				ctx.prevText === 'break' ||
				ctx.prevText === 'continue' ||
				ctx.prevText === 'this' ||
				ctx.prevText === 'super')
		) {
			const labelMatch = text.match(/^@[a-zA-Z_][a-zA-Z0-9_]*/);
			if (labelMatch) {
				return createToken('variable', labelMatch[0], pos);
			}
		}

		// Annotations: @Identifier (optionally use-site target, e.g. @field:Json).
		if (text.startsWith('@')) {
			const annMatch = text.match(/^@[a-zA-Z_][a-zA-Z0-9_]*(?::[a-zA-Z_][a-zA-Z0-9_]*)?/);
			if (annMatch) {
				return createToken('type', annMatch[0], pos);
			}
		}

		// Numbers (hex, binary, decimal/float with underscores and suffixes).
		// The fractional part requires a digit after the dot so that the range
		// operator `..` (e.g. 0..9) is not mis-parsed as a float.
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)[uU]?[lLfF]?/
		);
		if (numMatch) {
			return this.classifyNumber(numMatch[0], pos);
		}

		// Backtick-escaped identifiers (e.g. `class`, `is`, `test that it works`).
		// The backticks turn the contents into a plain identifier, so any keyword
		// inside must NOT be classified as a keyword. The whole span is one name.
		if (text.startsWith('`')) {
			const btMatch = text.match(/^`[^`\r\n]*`/);
			if (btMatch) {
				const after = text.slice(btMatch[0].length);
				const accessor = ctx.prevType === 'punctuation.accessor' || ctx.prevText === '::';
				let type: TokenType;
				if (after.startsWith('(')) type = 'function.call';
				else if (accessor) type = 'property';
				else type = 'variable';
				return createToken(type, btMatch[0], pos);
			}
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			const after = text.slice(word.length);
			// Label definition: `loop@` (a trailing @ NOT followed by an identifier —
			// `this@Outer` is the keyword `this` + accessor, handled separately).
			if (after.startsWith('@') && !/^[a-zA-Z_]/.test(after[1] ?? '')) {
				return createToken('variable.definition', word + '@', pos);
			}
			return createToken(this.classifyIdentifier(word, text, word.length, ctx), word, pos);
		}

		// Generic angle brackets in a type-argument position become brackets. We
		// open on a `<` that directly follows a type/identifier/`>`-ish context and
		// close the matching `>` / `>>` / `>>>` while depth is positive.
		if (
			ctx.angleDepth > 0 &&
			(text.startsWith('>>>') || text.startsWith('>>') || text[0] === '>')
		) {
			const run = text.startsWith('>>>') ? '>>>' : text.startsWith('>>') ? '>>' : '>';
			const consumed = Math.min(run.length, ctx.angleDepth);
			ctx.angleDepth -= consumed;
			return createToken('punctuation.bracket', run.slice(0, consumed), pos);
		}
		if (text[0] === '<' && this.opensGeneric(ctx, text)) {
			ctx.angleDepth += 1;
			return createToken('punctuation.bracket', '<', pos);
		}

		// Operators
		const opMatch = text.match(
			/^(?:===|!==|\?:|\?\.|!!|\.\.<|\.\.|->|::|==|!=|<=|>=|&&|\|\||\+\+|--|[+\-*/%]=|[+\-*/%<>=!&|]=?)/
		);
		if (opMatch) {
			return createToken(this.classifyOperator(opMatch[0]), opMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;?@]/);
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

	/**
	 * Decide whether a `<` opens a generic / type-argument list (so it and its
	 * matching `>` render as brackets) rather than a less-than comparison.
	 * Heuristic: a `<` opens generics when it directly follows a type or an
	 * identifier (a constructor/function name or type reference) — `List<`,
	 * `Map<`, `mutableMapOf<`, `Foo<` — and is itself followed by a plausible
	 * type-argument start (identifier, `*` star-projection, `>` empty-ish, or
	 * whitespace then one of those). Comparisons like `a < b` follow a value but
	 * the disambiguation that matters visually is the dotted/typed case, so we
	 * require the next non-space char to look like a type argument.
	 */
	private opensGeneric(ctx: TokenContext, text: string): boolean {
		// `fun <T> ...` / `class Foo<...>` — a type-parameter list directly after a
		// definition keyword always opens generics.
		if (ctx.prevText === 'fun' || ctx.prevText === 'class' || ctx.prevText === 'interface') {
			return true;
		}
		const next = text.slice(1).replace(/^[ \t]+/, '');
		// A type/builtin name before `<` is unambiguously a generic: List<…>, Map<…>.
		if (
			ctx.prevType === 'type.builtin' ||
			ctx.prevType === 'type.class' ||
			ctx.prevType === 'type'
		) {
			return /^[A-Za-z_(*?>]/.test(next) || next === '';
		}
		// A value-ish name (function call, property, plain variable) before `<` is
		// ambiguous with the less-than operator (`a < b`). Only treat it as generics
		// when the first type argument clearly looks like a type: an uppercase name,
		// a star/`?` projection, or a `(` function-type opener. This keeps `a < b`
		// and `i < size` as comparisons while still catching `mutableMapOf<String>`.
		const valueish =
			ctx.prevType === 'function.call' ||
			ctx.prevType === 'function.definition' ||
			ctx.prevType === 'property' ||
			ctx.prevType === 'constant' ||
			ctx.prevType === 'variable';
		if (!valueish) return false;
		return /^[A-Z(*?]/.test(next);
	}

	private classifyOperator(op: string): TokenType {
		if (
			op === '==' ||
			op === '!=' ||
			op === '===' ||
			op === '!==' ||
			op === '<=' ||
			op === '>=' ||
			op === '<' ||
			op === '>'
		) {
			return 'operator.comparison';
		}
		if (op === '&&' || op === '||' || op === '!') {
			return 'operator.logical';
		}
		if (op === '=' || /^[+\-*/%]=$/.test(op)) {
			return 'operator.assignment';
		}
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
			return 'operator.arithmetic';
		}
		return 'operator';
	}

	private classifyNumber(num: string, pos: number): Token {
		if (/^0[xX]/.test(num)) {
			return createToken('number.hex', num, pos);
		}
		if (/^0[bB]/.test(num)) {
			return createToken('number.binary', num, pos);
		}
		if (/[.eEfF]/.test(num)) {
			return createToken('number.float', num, pos);
		}
		return createToken('number.integer', num, pos);
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		ctx: TokenContext
	): TokenType {
		const afterWord = context.slice(wordLength);
		// `.` and `?.` are member accessors. `::` is a callable/property reference
		// (`String::length`, `obj::method`) when the referenced name is a member —
		// but `::User` is a constructor reference and stays a type, so the `::` case
		// only binds as a member for a lowercase-initial name.
		const accessor =
			ctx.prevType === 'punctuation.accessor' ||
			ctx.prevText === '?.' ||
			(ctx.prevText === '::' && /^[a-z_]/.test(word));

		// Member access binds before keyword classification: `x.class`, `it.value`,
		// `obj.get` are members, NOT keywords.
		if (accessor) {
			if (afterWord.startsWith('(')) return 'function.call';
			return 'property';
		}

		// Boolean / null constants
		if (word === 'true' || word === 'false') return 'constant.boolean';
		if (word === 'null') return 'constant.null';

		// The implicit single lambda parameter.
		if (word === 'it') return 'variable.parameter';

		// Keywords
		if (definitionKeywords.has(word)) return 'keyword.definition';
		if (storageKeywords.has(word)) return 'keyword.storage';
		if (controlKeywords.has(word)) return 'keyword.control';
		if (moduleKeywords.has(word)) return 'keyword.module';
		if (otherKeywords.has(word)) return 'keyword';

		// Soft keywords (e.g. `field`) — only as keywords when not used as a call or
		// member; `getThing()` is a call, `obj.get` is a member (handled above). They
		// are ALSO valid identifiers, so a soft keyword immediately following a
		// declaration keyword (`val field = 1`, `var field: Int`) is the NAME being
		// declared, not the backing-field reference — classify it as a variable.
		const decl = ctx.prevText === 'val' || ctx.prevText === 'var';
		if (softKeywords.has(word) && !afterWord.startsWith('(') && !decl) {
			return 'keyword';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Function call: identifier immediately followed by (
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// CONSTANT_CASE => constant (all-caps screaming-snake; checked before the
		// PascalCase rule, which would otherwise swallow MAX_SIZE as a type).
		if (/^[A-Z][A-Z0-9_]*$/.test(word) && word.length > 1) {
			return 'constant';
		}

		// PascalCase => type
		if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	/**
	 * Tokenize an ESCAPED char literal ('\n', '\uXXXX', '\'', ...), pushing the
	 * opening quote (string), the escape body (string.escape), and the closing
	 * quote (string). Returns the new absolute position, or -1 when `text` does not
	 * start with an escaped char literal (a plain 'a' is handled in getNextToken).
	 */
	private tokenizeCharLiteral(tokens: Token[], text: string, pos: number): number {
		const m = text.match(/^'(\\(?:u[0-9a-fA-F]{4}|[btnr'"\\$]|.))'/);
		if (!m) return -1;
		const esc = m[1]; // the \… escape body
		tokens.push(createToken('string', "'", pos));
		tokens.push(createToken('string.escape', esc, pos + 1));
		tokens.push(createToken('string', "'", pos + 1 + esc.length));
		return pos + m[0].length;
	}

	/**
	 * Tokenize a double-quoted string, breaking out string templates ($name and
	 * ${expr}) and escape sequences. Pushes directly into `tokens`; returns the
	 * new position after the closing quote (or end of line).
	 */
	private tokenizeString(tokens: Token[], text: string, pos: number): number {
		// Opening quote is its own string token so the literal delimiters render.
		tokens.push(createToken('string', '"', pos));
		let i = 1; // consume opening "
		let segStart = 1; // start of the current plain-string segment (relative to text)

		const flushSegment = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken('string', text.slice(segStart, end), pos + segStart));
			}
		};

		while (i < text.length) {
			const ch = text[i];

			// Escape sequence (\uXXXX unicode escape, or \<char> incl. \$ and \").
			if (ch === '\\' && i + 1 < text.length) {
				flushSegment(i);
				const uniMatch = text.slice(i).match(/^\\u[0-9a-fA-F]{4}/);
				const escLen = uniMatch ? uniMatch[0].length : 2;
				tokens.push(createToken('string.escape', text.slice(i, i + escLen), pos + i));
				i += escLen;
				segStart = i;
				continue;
			}

			// Template: ${ expr } — sub-tokenize the inner expression.
			if (ch === '$' && text[i + 1] === '{') {
				flushSegment(i);
				const end = this.emitBraceTemplate(tokens, text, i, pos);
				i = end;
				segStart = i;
				continue;
			}

			// Template: $name(.member)* — sub-tokenize the simple reference chain.
			if (ch === '$' && /[a-zA-Z_]/.test(text[i + 1] ?? '')) {
				flushSegment(i);
				const end = this.emitSimpleTemplate(tokens, text, i, pos);
				i = end;
				segStart = i;
				continue;
			}

			// Closing quote
			if (ch === '"') {
				flushSegment(i);
				tokens.push(createToken('string', '"', pos + i));
				return pos + i + 1;
			}

			i++;
		}

		// Unterminated on this line — emit what remains as string (Kotlin double
		// strings don't span lines; this keeps the line lossless).
		flushSegment(text.length);
		return pos + text.length;
	}

	/**
	 * Tokenize a raw triple-quoted string ("""..."""). Raw strings have no escapes
	 * but DO support templates. May span multiple lines via state.inRawString.
	 * Pushes directly into `tokens`; returns the new position.
	 */
	private tokenizeRawString(
		tokens: Token[],
		text: string,
		pos: number,
		state: KotlinTokenizerState
	): number {
		const endIdx = text.indexOf('"""', 3);
		if (endIdx !== -1) {
			this.pushRawStringSegment(tokens, text.slice(0, endIdx + 3), pos);
			return pos + endIdx + 3;
		}
		// Unterminated — continues on the next line.
		state.inRawString = true;
		this.pushRawStringSegment(tokens, text, pos);
		return pos + text.length;
	}

	/**
	 * Push a raw-string chunk, breaking out $name / ${expr} templates. No escape
	 * handling (raw strings are literal). `chunkPos` is the absolute start.
	 */
	private pushRawStringSegment(tokens: Token[], chunk: string, chunkPos: number): void {
		let i = 0;
		let segStart = 0;

		const flushSegment = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken('string', chunk.slice(segStart, end), chunkPos + segStart));
			}
		};

		while (i < chunk.length) {
			const ch = chunk[i];

			if (ch === '$' && chunk[i + 1] === '{') {
				flushSegment(i);
				const end = this.emitBraceTemplate(tokens, chunk, i, chunkPos);
				i = end;
				segStart = i;
				continue;
			}

			if (ch === '$' && /[a-zA-Z_]/.test(chunk[i + 1] ?? '')) {
				flushSegment(i);
				const end = this.emitSimpleTemplate(tokens, chunk, i, chunkPos);
				i = end;
				segStart = i;
				continue;
			}

			i++;
		}

		flushSegment(chunk.length);
	}

	/**
	 * Emit a `$name` / `$name.member.chain` template. The leading `$` is a
	 * `string.template` delimiter; the first identifier is a `variable`; each
	 * `.member` is `punctuation.accessor` + `property`. `start` indexes the `$`.
	 * Returns the index just past the template.
	 */
	private emitSimpleTemplate(
		tokens: Token[],
		text: string,
		start: number,
		basePos: number
	): number {
		tokens.push(createToken('string.template', '$', basePos + start));
		let i = start + 1;
		const first = text.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (!first) return i; // shouldn't happen given the call guard
		tokens.push(createToken('variable', first[0], basePos + i));
		i += first[0].length;
		// A simple template only extends through dotted member access (no calls,
		// brackets, or operators — those require ${ ... }). Stop otherwise.
		while (text[i] === '.' && /[a-zA-Z_]/.test(text[i + 1] ?? '')) {
			tokens.push(createToken('punctuation.accessor', '.', basePos + i));
			i += 1;
			const member = text.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
			if (!member) break;
			tokens.push(createToken('property', member[0], basePos + i));
			i += member[0].length;
		}
		return i;
	}

	/**
	 * Emit a `${ expr }` template: the `${` and matching `}` are `string.template`
	 * delimiters and the inner expression is fully tokenized with real types.
	 * Handles nested braces. `start` indexes the `$`. Returns the index just past
	 * the closing `}` (or end of text when unterminated on this line).
	 */
	private emitBraceTemplate(tokens: Token[], text: string, start: number, basePos: number): number {
		tokens.push(createToken('string.template', '${', basePos + start));
		let depth = 1;
		let j = start + 2;
		const exprStart = j;
		while (j < text.length && depth > 0) {
			const cj = text[j];
			// Skip over nested string literals so their braces/quotes don't throw off
			// the brace matcher (e.g. ${ m["}"] } or a nested "$x" template string).
			if (cj === '"') {
				if (text.startsWith('"""', j)) {
					const close = text.indexOf('"""', j + 3);
					j = close === -1 ? text.length : close + 3;
					continue;
				}
				j++;
				while (j < text.length && text[j] !== '"') {
					if (text[j] === '\\') j++; // skip an escaped char
					j++;
				}
				j++; // consume closing quote (or run off the end harmlessly)
				continue;
			}
			if (cj === '{') depth++;
			else if (cj === '}') {
				depth--;
				if (depth === 0) break;
			}
			j++;
		}
		const exprEnd = j; // index of the closing } (or text.length if unterminated)
		const inner = text.slice(exprStart, exprEnd);
		if (inner.length > 0) {
			this.tokenizeFragment(tokens, inner, basePos + exprStart);
		}
		if (j < text.length && text[j] === '}') {
			tokens.push(createToken('string.template', '}', basePos + j));
			return j + 1;
		}
		// Unterminated template (truncated line) — nothing more to emit.
		return text.length;
	}

	/**
	 * Tokenize a fragment of plain Kotlin expression source (the inside of a
	 * `${ ... }` template) with real token types, pushing into `tokens`. This is a
	 * self-contained pass — it does not recurse into nested strings spanning lines,
	 * but it does handle nested double-quoted strings, numbers, identifiers,
	 * member access, operators and punctuation, all lossless.
	 */
	private tokenizeFragment(tokens: Token[], fragment: string, basePos: number): void {
		const fragState: KotlinTokenizerState = {};
		const ctx: TokenContext = { prevType: null, prevText: null, angleDepth: 0 };
		let p = 0;
		while (p < fragment.length) {
			const rest = fragment.slice(p);
			if (rest.startsWith('"""')) {
				// tokenizeRawString/tokenizeString return ABSOLUTE positions; convert
				// back to a fragment-relative index for the loop.
				p = this.tokenizeRawString(tokens, rest, basePos + p, fragState) - basePos;
				ctx.prevType = 'string';
				ctx.prevText = '"""';
				continue;
			}
			if (rest.startsWith('"')) {
				p = this.tokenizeString(tokens, rest, basePos + p) - basePos;
				ctx.prevType = 'string';
				ctx.prevText = '"';
				continue;
			}
			const charEsc = this.tokenizeCharLiteral(tokens, rest, basePos + p);
			if (charEsc !== -1) {
				p = charEsc - basePos;
				ctx.prevType = 'string';
				ctx.prevText = "'";
				continue;
			}
			const token = this.getNextToken(rest, basePos + p, fragState, ctx);
			if (token) {
				tokens.push(token);
				p += token.text.length;
				if (token.type !== 'text' || token.text.trim().length > 0) {
					ctx.prevType = token.type;
					ctx.prevText = token.text;
				}
			} else {
				tokens.push(createToken('text', rest[0], basePos + p));
				p += 1;
			}
		}
	}
}

/** Lightweight per-line context for member-access and generic disambiguation. */
interface TokenContext {
	prevType: TokenType | null;
	prevText: string | null;
	angleDepth: number;
}

export function createKotlinTokenizer() {
	return new KotlinTokenizer();
}
