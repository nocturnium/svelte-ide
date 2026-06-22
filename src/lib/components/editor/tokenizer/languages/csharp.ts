/**
 * C# tokenizer
 *
 * Design notes / closed caveats
 * -----------------------------
 * This is a single-line tokenizer threaded with per-line state. It is LOSSLESS:
 * the concatenation of every emitted token's text equals the input line exactly.
 *
 * Sub-tokenization: strings are not emitted as one opaque token. Escape sequences
 * become `string.escape`, and interpolation holes `{expr}` are tokenized with the
 * real expression grammar (variables, properties, operators, numbers, calls,
 * punctuation), with the `{`/`}` delimiters as `punctuation.brace`. The `:format`
 * and `,alignment` suffixes inside a hole are emitted as plain `string` content
 * (they are format specifiers, not expression syntax). `{{`/`}}` are literal
 * braces and stay `string` content.
 *
 * Interpolation is threaded across lines too: an interpolated verbatim ($@"...)
 * or interpolated raw ($"""...) string that opens a `{` hole and runs off the end
 * of the line carries the open-hole depth in state, so the continuation line keeps
 * tokenizing the expression until the matching `}`.
 *
 * Numbers carry precise subtypes (number.hex / number.binary / number.float /
 * number.integer). Member access after a `.` is classified `property` (or
 * `function.call`/`method` when followed by `(`). Generic / type-argument angle
 * brackets `<` `>` `>>` are emitted as `punctuation.bracket` when angle-depth
 * context says we're inside a `<...>`; comparison `<`/`>` keep operator subtypes.
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// C# keywords (all reserved words, for membership checks)
const keywords = new Set([
	'abstract',
	'as',
	'async',
	'await',
	'base',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'default',
	'delegate',
	'do',
	'else',
	'enum',
	'event',
	'explicit',
	'extern',
	'finally',
	'fixed',
	'for',
	'foreach',
	'goto',
	'if',
	'implicit',
	'in',
	'interface',
	'internal',
	'is',
	'lock',
	'nameof',
	'namespace',
	'new',
	'operator',
	'out',
	'override',
	'params',
	'partial',
	'private',
	'protected',
	'public',
	'readonly',
	'record',
	'ref',
	'return',
	'sealed',
	'sizeof',
	'stackalloc',
	'static',
	'struct',
	'switch',
	'this',
	'throw',
	'try',
	'typeof',
	'unchecked',
	'checked',
	'unsafe',
	'using',
	'var',
	'virtual',
	'void',
	'volatile',
	'when',
	'while',
	'yield'
]);

const definitionKeywords = new Set([
	'class',
	'struct',
	'interface',
	'enum',
	'record',
	'delegate',
	'void',
	'namespace'
]);

const storageKeywords = new Set([
	'public',
	'private',
	'protected',
	'internal',
	'static',
	'readonly',
	'const',
	'sealed',
	'abstract',
	'virtual',
	'override',
	'async',
	'partial',
	'extern',
	'unsafe',
	'volatile',
	'fixed',
	'event',
	'params',
	'ref',
	'out',
	'in'
]);

const controlKeywords = new Set([
	'if',
	'else',
	'switch',
	'case',
	'default',
	'for',
	'foreach',
	'while',
	'do',
	'break',
	'continue',
	'return',
	'throw',
	'try',
	'catch',
	'finally',
	'yield',
	'await',
	'goto',
	'lock',
	'when'
]);

const moduleKeywords = new Set(['using']);

// Operator-like keywords (type tests / sizing / introspection operators).
const operatorKeywords = new Set([
	'as',
	'is',
	'new',
	'sizeof',
	'typeof',
	'nameof',
	'stackalloc',
	'checked',
	'unchecked'
]);

const builtinTypes = new Set([
	'int',
	'string',
	'bool',
	'double',
	'float',
	'decimal',
	'object',
	'byte',
	'sbyte',
	'char',
	'long',
	'ulong',
	'short',
	'ushort',
	'uint',
	'nint',
	'nuint',
	'dynamic',
	'Task',
	'List',
	'Dictionary',
	'IEnumerable',
	'String',
	'Object'
]);

/**
 * Contextual keywords: words that are reserved only in certain positions. We keep
 * the conservative, position-independent ones (`var`, `dynamic` handled as a type)
 * already covered; `value` is special-cased in property/setter context below.
 */

interface CSharpTokenizerState extends TokenizerState {
	/** Inside a multi-line verbatim string (@"...") */
	inVerbatimString?: boolean;
	/** The verbatim string carrying through is interpolated ($@"...") */
	verbatimInterpolated?: boolean;
	/** Inside a multi-line raw string literal ("""...""") */
	inRawString?: boolean;
	/** The number of quotes that closes the carrying raw string */
	rawQuoteCount?: number;
	/** The carrying raw string is interpolated ($"""...) */
	rawInterpolated?: boolean;
	/** Number of `$` in an interpolated raw string => braces needed to open a hole */
	rawDollarCount?: number;
	/**
	 * If a carrying interpolated string (verbatim or raw) was inside an open `{...}`
	 * interpolation hole when the line ended, this is the brace depth still open.
	 * The continuation line resumes tokenizing the expression until depth hits 0.
	 */
	interpHoleDepth?: number;
	/**
	 * If a carried interpolation hole was inside nested `(...)`/`[...]` when the line
	 * ended, this is that paren/bracket depth, so the continuation line keeps treating
	 * `,`/`:` as expression syntax (not the hole's alignment/format specifier).
	 */
	interpHoleParenDepth?: number;
}

/** Preprocessor directive names (`#` already consumed). */
const preprocessorDirectives = new Set([
	'if',
	'elif',
	'else',
	'endif',
	'define',
	'undef',
	'warning',
	'error',
	'line',
	'region',
	'endregion',
	'pragma',
	'nullable',
	'checksum'
]);

export class CSharpTokenizer {
	language = 'csharp';

	getInitialState(): CSharpTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: CSharpTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: CSharpTokenizerState = { ...prevState };
		// Angle-bracket depth for generic/type-argument context, reset per line.
		const ctx: TokenizeCtx = { angleDepth: 0 };

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

		// Handle raw string continuation ("""..."""  spanning multiple lines)
		if (state.inRawString) {
			pos = this.continueRawString(tokens, line, state, ctx);
			if (state.inRawString) {
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Handle verbatim string continuation (@"..." spanning multiple lines)
		if (state.inVerbatimString) {
			pos = this.continueVerbatimString(tokens, line, state, ctx);
			if (state.inVerbatimString) {
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const next = this.getNextToken(tokens, line, pos, state, ctx);
			if (next > pos) {
				pos = next;
			} else {
				tokens.push(createToken('text', line[pos], pos));
				pos += 1;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	/**
	 * Consume the next token(s) at `pos` in `line`, pushing onto `tokens`. Returns
	 * the new position (> pos on success, == pos if nothing matched so the caller
	 * can emit a fallback `text` char).
	 */
	private getNextToken(
		tokens: Token[],
		line: string,
		pos: number,
		state: CSharpTokenizerState,
		ctx: TokenizeCtx
	): number {
		const text = line.slice(pos);

		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			tokens.push(createToken('text', wsMatch[0], pos));
			return pos + wsMatch[0].length;
		}

		// Preprocessor directives (#region, #if, #nullable, #pragma, ...). These are
		// only valid at the start of a line (after whitespace, already consumed), and
		// `#` has no other meaning in C#, so consume the whole rest of the line as one
		// directive token. The directive word must be a recognized directive.
		if (text[0] === '#') {
			const dirMatch = text.match(/^#\s*([a-zA-Z]+)/);
			if (dirMatch && preprocessorDirectives.has(dirMatch[1])) {
				tokens.push(createToken('keyword', text, pos));
				return pos + text.length;
			}
		}

		// XML doc comments (/// ...) — must be checked before line comments
		if (text.startsWith('///')) {
			tokens.push(createToken('comment.doc', text, pos));
			return pos + text.length;
		}

		// Line comments
		if (text.startsWith('//')) {
			tokens.push(createToken('comment.line', text, pos));
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

		// Raw string literals: """..."""  and interpolated raw $"""...""" / $$"""...
		// The opening delimiter is an optional run of `$` followed by a run of >= 3
		// double-quotes. The literal closes on the first run of the SAME number of
		// quotes; shorter runs inside are content (this is what lets a raw string
		// contain "" or """). Checked before the @/$ string handlers below so the
		// triple-quote run is not mistaken for an empty "" string.
		const rawMatch = text.match(/^(\$*)("{3,})/);
		if (rawMatch) {
			return this.startRawString(
				tokens,
				line,
				pos,
				state,
				ctx,
				rawMatch[1].length,
				rawMatch[2].length
			);
		}

		// Verbatim / interpolated-verbatim strings: @"...", $@"...", @$"..."
		const verbatimPrefix = text.match(/^(?:\$@|@\$|@)"/);
		if (verbatimPrefix) {
			const prefix = verbatimPrefix[0];
			const interpolated = prefix.includes('$');
			return this.startVerbatimString(tokens, line, pos, state, ctx, prefix.length, interpolated);
		}

		// Interpolated strings: $"..." (single line)
		if (text.startsWith('$"')) {
			return this.tokenizeInterpolated(tokens, line, pos, ctx);
		}

		// Regular double-quoted strings
		if (text.startsWith('"')) {
			return this.tokenizeString(tokens, line, pos);
		}

		// Char literals: 'a', '\n', 'A' — emit the escape inside as string.escape.
		if (text[0] === "'") {
			const consumed = this.tokenizeChar(tokens, line, pos);
			if (consumed > pos) return consumed;
		}

		// Numbers (hex, binary, decimal/float with underscores and suffixes)
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+(?:[uUlL]+)?|0[bB][01_]+(?:[uUlL]+)?|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?(?:[fFdDmMuUlL]+)?)/
		);
		if (numMatch) {
			tokens.push(createToken(this.classifyNumber(numMatch[0]), numMatch[0], pos));
			return pos + numMatch[0].length;
		}

		// Identifiers and keywords (allow leading @ for verbatim identifiers like @class)
		const identMatch = text.match(/^@?[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			tokens.push(createToken(this.classifyIdentifier(word, line, pos, tokens, ctx), word, pos));
			return pos + word.length;
		}

		// Operators (and generic angle brackets, handled inside).
		const consumedOp = this.tokenizeOperatorOrAngle(tokens, text, pos, ctx);
		if (consumedOp > pos) return consumedOp;

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;?]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';' || char === ':') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			tokens.push(createToken(type, char, pos));
			// A separator/paren/brace resets generic context: `a < b, c > d` is not a
			// generic. We only keep angle context tight to immediate type-argument runs.
			return pos + 1;
		}

		return pos;
	}

	/** number.hex / number.binary / number.float / number.integer */
	private classifyNumber(num: string): TokenType {
		if (/^0[xX]/.test(num)) return 'number.hex';
		if (/^0[bB]/.test(num)) return 'number.binary';
		// Float if it has a decimal point, an exponent, or a float/decimal suffix.
		if (/[.eE]/.test(num) || /[fFdDmM]/.test(num)) return 'number.float';
		return 'number.integer';
	}

	private classifyIdentifier(
		word: string,
		line: string,
		pos: number,
		tokens: Token[],
		ctx: TokenizeCtx
	): TokenType {
		// Boolean / null constants
		if (word === 'true' || word === 'false') return 'constant.boolean';
		if (word === 'null') return 'constant.null';

		// Keywords (verbatim identifiers like @class are NOT keywords — the @ escapes).
		if (!word.startsWith('@') && keywords.has(word)) {
			if (definitionKeywords.has(word)) return 'keyword.definition';
			if (storageKeywords.has(word)) return 'keyword.storage';
			if (controlKeywords.has(word)) return 'keyword.control';
			if (moduleKeywords.has(word)) return 'keyword.module';
			if (operatorKeywords.has(word)) return 'keyword.operator';
			return 'keyword';
		}

		// Built-in types
		if (!word.startsWith('@') && builtinTypes.has(word)) {
			return 'type.builtin';
		}

		const afterWord = line.slice(pos + word.length);
		const trimmedAfter = afterWord.replace(/^[ \t]+/, '');
		// A call is `(` immediately, or a generic method invocation `<...>(`.
		const followedByCall = trimmedAfter.startsWith('(') || this.followedByGenericCall(trimmedAfter);

		// Member access: a previous non-whitespace token was the `.` accessor.
		const prev = this.prevSignificant(tokens);
		const afterAccessor = prev?.type === 'punctuation.accessor';
		// `?.` null-conditional accessor also yields a member.
		const afterNullAccessor = prev?.type === 'operator' && prev?.text === '?.';

		if (afterAccessor || afterNullAccessor) {
			if (followedByCall) return 'function.call';
			// Inside generic context after a `.`, a PascalCase member is still a type.
			if (ctx.angleDepth > 0 && /^@?[A-Z][a-zA-Z0-9_]*$/.test(word)) return 'type.class';
			return 'property';
		}

		// Followed by ( => function call
		if (followedByCall) {
			return 'function.call';
		}

		// Inside a generic/type-argument list, PascalCase or builtin-ish names are types.
		if (ctx.angleDepth > 0 && /^@?[A-Z][a-zA-Z0-9_]*$/.test(word)) {
			return 'type.class';
		}

		// PascalCase => class/type (strip a leading @ for the casing test)
		const bare = word.startsWith('@') ? word.slice(1) : word;
		if (/^[A-Z][a-zA-Z0-9_]*$/.test(bare)) {
			return 'type.class';
		}

		return 'variable';
	}

	/** The most recent token that is not whitespace `text`. */
	private prevSignificant(tokens: Token[]): Token | undefined {
		for (let i = tokens.length - 1; i >= 0; i--) {
			const t = tokens[i];
			if (t.type === 'text' && /^[ \t]*$/.test(t.text)) continue;
			return t;
		}
		return undefined;
	}

	/**
	 * Operators, plus generic angle-bracket context tracking. Returns the new pos.
	 *
	 * Angle brackets are ambiguous in a line tokenizer. We use a heuristic: a `<`
	 * immediately preceded by a type-ish token (type.class / type.builtin / a
	 * generic-close bracket) and immediately followed (after optional ws) by a
	 * type-ish start opens a generic context, emitting `<` as punctuation.bracket
	 * and incrementing angle depth. Inside a generic context, `>` and `>>` close it
	 * as punctuation.bracket. Otherwise `<`/`>` are comparison operators.
	 */
	private tokenizeOperatorOrAngle(
		tokens: Token[],
		text: string,
		pos: number,
		ctx: TokenizeCtx
	): number {
		// Generic close: >> or > while inside a generic context.
		if (ctx.angleDepth > 0 && text[0] === '>') {
			// `>>=` and `>=` are real operators even mid-generic-context — but inside a
			// type-argument list a bare `>` or `>>` closes nesting. Be conservative:
			// only treat plain `>` / `>>` (not followed by `=`) as closers.
			if (text.startsWith('>>') && text[2] !== '=') {
				tokens.push(createToken('punctuation.bracket', '>', pos));
				tokens.push(createToken('punctuation.bracket', '>', pos + 1));
				ctx.angleDepth = Math.max(0, ctx.angleDepth - 2);
				return pos + 2;
			}
			if (text[0] === '>' && text[1] !== '=' && text[1] !== '>') {
				tokens.push(createToken('punctuation.bracket', '>', pos));
				ctx.angleDepth = Math.max(0, ctx.angleDepth - 1);
				return pos + 1;
			}
		}

		// Generic open: `<` that looks like a type-argument list.
		if (text[0] === '<' && text[1] !== '=' && text[1] !== '<' && this.opensGeneric(tokens, text)) {
			tokens.push(createToken('punctuation.bracket', '<', pos));
			ctx.angleDepth += 1;
			return pos + 1;
		}

		const opMatch = text.match(
			/^(?:\?\?=|>>=|<<=|=>|\?\?|\?\.|\.\.|\+\+|--|&&|\|\||==|!=|<=|>=|->|<<|>>|[+\-*/%&|^!<>=]=?)/
		);
		if (opMatch) {
			const op = opMatch[0];
			let type: TokenType = 'operator';
			if (op === '=' || op === '+=' || op === '-=' || op === '*=' || op === '/=' || op === '%=') {
				type = 'operator.assignment';
			} else if (
				op === '==' ||
				op === '!=' ||
				op === '<' ||
				op === '>' ||
				op === '<=' ||
				op === '>='
			) {
				type = 'operator.comparison';
			} else if (op === '&&' || op === '||' || op === '!') {
				type = 'operator.logical';
			} else if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
				type = 'operator.arithmetic';
			}
			tokens.push(createToken(type, op, pos));
			return pos + op.length;
		}

		return pos;
	}

	/**
	 * Heuristic: does the `<` at the start of `text` open a generic type-argument
	 * list? True when the previous significant token is a name that could be generic
	 * (type / identifier / property / generic-close) AND the bracket content scans as
	 * a balanced type-argument list (only type-ish chars: letters, digits, `_`, `@`,
	 * `.`, `,`, `?`, `[`, `]`, whitespace, nested `<>`) closed by `>` that is then
	 * followed by `(`, `.`, `,`, `)`, `>`, `[`, `{`, whitespace, or end-of-line.
	 * This rejects value comparisons like `x < 3` or `a < b && c > d` (the `&` is not
	 * a type-arg char) while accepting `List<int>`, `Dictionary<string, int>`,
	 * `Foo.Bar<T>`, and generic method calls `Select<Item, string>(...)`.
	 */
	private opensGeneric(tokens: Token[], text: string): boolean {
		const prev = this.prevSignificant(tokens);
		if (!prev) return false;
		const prevOk =
			prev.type === 'type.class' ||
			prev.type === 'type.builtin' ||
			prev.type === 'type.interface' ||
			prev.type === 'type' ||
			prev.type === 'function.call' ||
			prev.type === 'property' ||
			prev.type === 'variable' ||
			(prev.type === 'punctuation.bracket' && prev.text === '>');
		if (!prevOk) return false;
		// After `<`, a type argument starts with a letter, `_`, `@`, or nested `<`.
		const after = text[1];
		if (!/[A-Za-z_@<]/.test(after ?? '')) return false;
		return this.scanGenericArgs(text, 1) !== -1;
	}

	/**
	 * Whether the slice begins with `<...>(` — a generic method invocation. Used so
	 * `Select<Item, string>(...)` classifies the member as a call.
	 */
	private followedByGenericCall(text: string): boolean {
		if (text[0] !== '<') return false;
		const end = this.scanGenericArgs(text, 1);
		if (end === -1) return false;
		return text[end] === '(';
	}

	/**
	 * From `start` (the index just past a `<`), scan a balanced generic-argument list
	 * containing only type-argument characters. Returns the index just past the
	 * matching close `>` if it looks like a valid type-argument list AND the char
	 * after the close is a generic-context follower; otherwise -1.
	 */
	private scanGenericArgs(text: string, start: number): number {
		let i = start;
		let depth = 1;
		while (i < text.length) {
			const ch = text[i];
			if (ch === '<') {
				depth++;
				i++;
				continue;
			}
			if (ch === '>') {
				depth--;
				i++;
				if (depth === 0) {
					// Validate the follower: a generic close is followed by `(`, `.`, `,`,
					// `)`, `>`, `[`, `]`, `{`, `;`, whitespace, or end-of-line.
					const follow = text[i];
					if (follow === undefined || /[(.,)>[\]{};:= \t]/.test(follow)) return i;
					return -1;
				}
				continue;
			}
			// Only type-argument characters are allowed inside.
			if (!/[A-Za-z0-9_@.,?[\] \t]/.test(ch)) return -1;
			i++;
		}
		return -1; // unbalanced on this line — treat `<` as a comparison operator
	}

	/**
	 * Scan a regular double-quoted string starting at `pos` in `line`. Emits the
	 * literal as `string` segments with `string.escape` tokens broken out. C# regular
	 * strings do not span lines, so an unterminated string is closed at EOL losslessly.
	 */
	private tokenizeString(tokens: Token[], line: string, pos: number): number {
		const text = line.slice(pos);
		let i = 1; // consume opening "
		let segStart = 0;
		const flush = (end: number) => {
			if (end > segStart)
				tokens.push(createToken('string', text.slice(segStart, end), pos + segStart));
		};
		while (i < text.length) {
			const ch = text[i];
			if (ch === '\\') {
				const esc = this.matchEscape(text, i);
				if (esc > 0) {
					flush(i);
					tokens.push(createToken('string.escape', text.slice(i, i + esc), pos + i));
					i += esc;
					segStart = i;
					continue;
				}
			}
			if (ch === '"') {
				flush(i + 1);
				return pos + i + 1;
			}
			if (ch === '\n') break;
			i++;
		}
		flush(i);
		return pos + i;
	}

	/**
	 * Char literal: 'a', '\n', '\uXXXX'. Emits opening/closing quotes + content as
	 * `string`, with any escape as `string.escape`. Returns new pos, or pos if it
	 * doesn't look like a char literal (so the caller falls through).
	 */
	private tokenizeChar(tokens: Token[], line: string, pos: number): number {
		const charMatch = line
			.slice(pos)
			.match(
				/^'(?:[^'\\\n]|\\(?:[0abfnrtv\\'"]|x[0-9a-fA-F]{1,4}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}))'/
			);
		if (!charMatch) return pos;
		const lit = charMatch[0];
		if (lit[1] === '\\') {
			// '\n' => ' | \n | '
			tokens.push(createToken('string', "'", pos));
			const escLen = lit.length - 2; // between the quotes
			tokens.push(createToken('string.escape', lit.slice(1, 1 + escLen), pos + 1));
			tokens.push(createToken('string', "'", pos + lit.length - 1));
		} else {
			tokens.push(createToken('string', lit, pos));
		}
		return pos + lit.length;
	}

	/**
	 * Match a C# escape sequence at `text[i]` (where text[i] === '\\'). Returns the
	 * length of the escape (>= 2) or 0 if it is not a recognized escape.
	 */
	private matchEscape(text: string, i: number): number {
		const m = text
			.slice(i)
			.match(/^\\(?:[0abfnrtv\\'"]|x[0-9a-fA-F]{1,4}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})/);
		return m ? m[0].length : 0;
	}

	/**
	 * Tokenize a single-line interpolated string $"...". Breaks out escapes and
	 * interpolation holes {expr}. Returns new pos. If the string runs off the end of
	 * the line it is closed losslessly at EOL (single-line $"" doesn't span lines).
	 */
	private tokenizeInterpolated(
		tokens: Token[],
		line: string,
		pos: number,
		ctx: TokenizeCtx
	): number {
		const text = line.slice(pos);
		// Emit the `$"` opener as string.template so the whole literal still reads as one.
		tokens.push(createToken('string.template', '$"', pos));
		let i = 2;
		let segStart = 2;
		const flush = (end: number) => {
			if (end > segStart)
				tokens.push(createToken('string', text.slice(segStart, end), pos + segStart));
		};
		// A throwaway state: single-line $"..." strings do not span lines, so a hole
		// that runs off the end is simply closed at EOL (lossless). We never propagate
		// interpHoleDepth out of a single-line interpolated string.
		const localState: CSharpTokenizerState = {};
		while (i < text.length) {
			const ch = text[i];
			if (ch === '\\') {
				const esc = this.matchEscape(text, i);
				if (esc > 0) {
					flush(i);
					tokens.push(createToken('string.escape', text.slice(i, i + esc), pos + i));
					i += esc;
					segStart = i;
					continue;
				}
			}
			// Literal braces {{ }}
			if ((ch === '{' && text[i + 1] === '{') || (ch === '}' && text[i + 1] === '}')) {
				i += 2;
				continue;
			}
			// Interpolation hole
			if (ch === '{') {
				flush(i);
				i = this.tokenizeHoleThreaded(tokens, line, pos + i, ctx, localState) - pos;
				localState.interpHoleDepth = 0;
				segStart = i;
				continue;
			}
			if (ch === '"') {
				flush(i);
				tokens.push(createToken('string.template', '"', pos + i));
				return pos + i + 1;
			}
			if (ch === '\n') break;
			i++;
		}
		flush(i);
		return pos + i;
	}

	/**
	 * From a `,`/`:` inside an interpolation hole, find the end of the format/
	 * alignment specifier: the matching close `}` at the hole's depth. Nested `{}`
	 * inside a format spec are unusual; we balance braces to be safe.
	 */
	private findHoleFormatEnd(line: string, from: number): number {
		let i = from;
		let depth = 0;
		while (i < line.length) {
			const ch = line[i];
			if (ch === '{') depth++;
			else if (ch === '}') {
				if (depth === 0) return i;
				depth--;
			}
			i++;
		}
		return i;
	}

	// ----- Verbatim strings (@"...") -----

	private startVerbatimString(
		tokens: Token[],
		line: string,
		pos: number,
		state: CSharpTokenizerState,
		ctx: TokenizeCtx,
		prefixLen: number,
		interpolated: boolean
	): number {
		const type: TokenType = interpolated ? 'string.template' : 'string';
		// Emit the prefix (@" / $@" / @$") as the string-opener type.
		tokens.push(createToken(type, line.slice(pos, pos + prefixLen), pos));
		return this.scanVerbatimBody(tokens, line, pos + prefixLen, state, ctx, interpolated, true);
	}

	private continueVerbatimString(
		tokens: Token[],
		line: string,
		state: CSharpTokenizerState,
		ctx: TokenizeCtx
	): number {
		const interpolated = !!state.verbatimInterpolated;
		// If we ended the previous line mid-hole, resume the expression first.
		if (state.interpHoleDepth && state.interpHoleDepth > 0) {
			const resumed = this.resumeHole(tokens, line, 0, ctx, state);
			if (state.interpHoleDepth > 0) return line.length; // still in the hole
			return this.scanVerbatimBody(tokens, line, resumed, state, ctx, interpolated, false);
		}
		return this.scanVerbatimBody(tokens, line, 0, state, ctx, interpolated, false);
	}

	/**
	 * Scan a verbatim string body from `start`. `"` closes it unless doubled (""),
	 * which is a literal quote (escape). When interpolated, `{expr}` holes are
	 * tokenized; `{{`/`}}` are literal. Sets state.inVerbatimString if it runs off
	 * the line. Returns new pos.
	 */
	private scanVerbatimBody(
		tokens: Token[],
		line: string,
		start: number,
		state: CSharpTokenizerState,
		ctx: TokenizeCtx,
		interpolated: boolean,
		_opening: boolean
	): number {
		const type: TokenType = interpolated ? 'string.template' : 'string';
		let i = start;
		let segStart = start;
		const flush = (end: number) => {
			if (end > segStart) tokens.push(createToken('string', line.slice(segStart, end), segStart));
		};
		while (i < line.length) {
			const ch = line[i];
			// Doubled quote "" is a literal quote (escape) in verbatim strings.
			if (ch === '"' && line[i + 1] === '"') {
				flush(i);
				tokens.push(createToken('string.escape', '""', i));
				i += 2;
				segStart = i;
				continue;
			}
			if (ch === '"') {
				flush(i);
				tokens.push(createToken(type, '"', i));
				state.inVerbatimString = false;
				state.verbatimInterpolated = false;
				return i + 1;
			}
			if (interpolated) {
				if ((ch === '{' && line[i + 1] === '{') || (ch === '}' && line[i + 1] === '}')) {
					i += 2;
					continue;
				}
				if (ch === '{') {
					flush(i);
					const holeEnd = this.tokenizeHoleThreaded(tokens, line, i, ctx, state);
					i = holeEnd;
					segStart = i;
					if (state.interpHoleDepth && state.interpHoleDepth > 0) {
						// Hole ran off the end of the line; carry across.
						state.inVerbatimString = true;
						state.verbatimInterpolated = true;
						return line.length;
					}
					continue;
				}
			}
			i++;
		}
		flush(i);
		// Unterminated on this line — carries to the next.
		state.inVerbatimString = true;
		state.verbatimInterpolated = interpolated;
		return line.length;
	}

	// ----- Raw strings ("""...""") -----

	private startRawString(
		tokens: Token[],
		line: string,
		pos: number,
		state: CSharpTokenizerState,
		ctx: TokenizeCtx,
		dollarCount: number,
		quoteCount: number
	): number {
		const interpolated = dollarCount > 0;
		const type: TokenType = interpolated ? 'string.template' : 'string';
		const openLen = dollarCount + quoteCount;
		tokens.push(createToken(type, line.slice(pos, pos + openLen), pos));
		return this.scanRawBody(
			tokens,
			line,
			pos + openLen,
			state,
			ctx,
			quoteCount,
			interpolated,
			dollarCount
		);
	}

	private continueRawString(
		tokens: Token[],
		line: string,
		state: CSharpTokenizerState,
		ctx: TokenizeCtx
	): number {
		const interpolated = !!state.rawInterpolated;
		const quoteCount = state.rawQuoteCount ?? 3;
		const dollarCount = state.rawDollarCount ?? (interpolated ? 1 : 0);
		if (state.interpHoleDepth && state.interpHoleDepth > 0) {
			const resumed = this.resumeHole(tokens, line, 0, ctx, state);
			if (state.interpHoleDepth > 0) return line.length;
			return this.scanRawBody(
				tokens,
				line,
				resumed,
				state,
				ctx,
				quoteCount,
				interpolated,
				dollarCount
			);
		}
		return this.scanRawBody(tokens, line, 0, state, ctx, quoteCount, interpolated, dollarCount);
	}

	/**
	 * Scan a raw-string body. Closes on the first run of >= quoteCount quotes (its
	 * first quoteCount quotes are the delimiter). When interpolated, holes are
	 * opened by a run of `dollarCount` braces `{` (e.g. $$"""...{{x}}..."""). For the
	 * common single-`$` case this is one `{`.
	 */
	private scanRawBody(
		tokens: Token[],
		line: string,
		start: number,
		state: CSharpTokenizerState,
		ctx: TokenizeCtx,
		quoteCount: number,
		interpolated: boolean,
		dollarCount: number
	): number {
		const type: TokenType = interpolated ? 'string.template' : 'string';
		const braceRun = Math.max(1, dollarCount);
		let i = start;
		let segStart = start;
		const flush = (end: number) => {
			if (end > segStart) tokens.push(createToken('string', line.slice(segStart, end), segStart));
		};
		while (i < line.length) {
			const ch = line[i];
			// Closing quote run?
			if (ch === '"') {
				let run = 0;
				let j = i;
				while (j < line.length && line[j] === '"') {
					run++;
					j++;
				}
				if (run >= quoteCount) {
					flush(i);
					tokens.push(createToken(type, line.slice(i, i + quoteCount), i));
					state.inRawString = false;
					state.rawQuoteCount = undefined;
					state.rawInterpolated = false;
					state.rawDollarCount = undefined;
					// Any quotes beyond the delimiter are subsequent content/tokens; but a
					// run exactly == quoteCount is clean. Resume normal tokenization after.
					return i + quoteCount;
				}
				// Shorter run is content.
				i = j;
				continue;
			}
			if (interpolated && ch === '{') {
				// A run of `braceRun` braces opens a hole; fewer are literal content.
				let run = 0;
				let j = i;
				while (j < line.length && line[j] === '{') {
					run++;
					j++;
				}
				if (run >= braceRun) {
					flush(i);
					// Emit the opening brace run delimiters as braces, then the expression.
					const holeEnd = this.tokenizeHoleThreaded(tokens, line, i, ctx, state, braceRun);
					i = holeEnd;
					segStart = i;
					if (state.interpHoleDepth && state.interpHoleDepth > 0) {
						state.inRawString = true;
						state.rawQuoteCount = quoteCount;
						state.rawInterpolated = true;
						state.rawDollarCount = dollarCount;
						return line.length;
					}
					continue;
				}
				i = j; // literal braces
				continue;
			}
			i++;
		}
		flush(i);
		state.inRawString = true;
		state.rawQuoteCount = quoteCount;
		state.rawInterpolated = interpolated;
		state.rawDollarCount = dollarCount;
		return line.length;
	}

	/**
	 * Like tokenizeHole, but threads an open hole across lines via state. `braceRun`
	 * is how many `{` open the hole (1 for normal/verbatim/$, N for $N raw strings).
	 * On a hole that runs off the end of the line, sets state.interpHoleDepth.
	 */
	private tokenizeHoleThreaded(
		tokens: Token[],
		line: string,
		pos: number,
		_ctx: TokenizeCtx,
		state: CSharpTokenizerState,
		braceRun = 1
	): number {
		// Emit the opening brace run.
		for (let k = 0; k < braceRun; k++) {
			tokens.push(createToken('punctuation.brace', '{', pos + k));
		}
		const innerCtx: TokenizeCtx = { angleDepth: 0 };
		const start = pos + braceRun;
		const end = this.scanHoleExpr(tokens, line, start, innerCtx, state, 1);
		return end;
	}

	/** Resume a hole that carried across a line boundary. */
	private resumeHole(
		tokens: Token[],
		line: string,
		start: number,
		_ctx: TokenizeCtx,
		state: CSharpTokenizerState
	): number {
		const innerCtx: TokenizeCtx = { angleDepth: 0 };
		const depth = state.interpHoleDepth ?? 1;
		return this.scanHoleExpr(tokens, line, start, innerCtx, state, depth);
	}

	/**
	 * Tokenize the expression body of an interpolation hole starting at `start` with
	 * an already-open brace depth of `openDepth`. Emits the closing `}` as
	 * punctuation.brace. If the hole runs off the end of the line, records the still-
	 * open depth in state.interpHoleDepth and returns line.length.
	 *
	 * The `,alignment` / `:format` specifier of an interpolation hole is only valid
	 * at the TOP LEVEL of the hole expression — C# requires `(...)` around anything
	 * that itself uses `,` or `:` (multi-arg calls, ternaries). So a `,`/`:` is only
	 * a format/alignment specifier when we are at the hole's brace root AND not inside
	 * any nested `(...)` or `[...]`; otherwise it is ordinary expression syntax (an
	 * argument separator, an indexer separator, a ternary/label colon).
	 */
	private scanHoleExpr(
		tokens: Token[],
		line: string,
		start: number,
		innerCtx: TokenizeCtx,
		state: CSharpTokenizerState,
		openDepth: number
	): number {
		let i = start;
		let depth = openDepth;
		// Nesting depth of `(...)` and `[...]` within the hole, so a `,`/`:` inside a
		// call or indexer is not mistaken for the hole's alignment/format separator.
		let parenDepth = state.interpHoleParenDepth ?? 0;
		while (i < line.length && depth > 0) {
			const ch = line[i];
			if (ch === '}') {
				depth--;
				tokens.push(createToken('punctuation.brace', '}', i));
				i++;
				if (depth === 0) {
					state.interpHoleDepth = 0;
					state.interpHoleParenDepth = 0;
					return i;
				}
				continue;
			}
			if (ch === '{') {
				depth++;
				tokens.push(createToken('punctuation.brace', '{', i));
				i++;
				continue;
			}
			if (depth === 1 && parenDepth === 0 && (ch === ':' || ch === ',')) {
				const fmtEnd = this.findHoleFormatEnd(line, i);
				tokens.push(createToken('string', line.slice(i, fmtEnd), i));
				i = fmtEnd;
				continue;
			}
			if (ch === '(' || ch === '[') {
				parenDepth++;
			} else if ((ch === ')' || ch === ']') && parenDepth > 0) {
				parenDepth--;
			}
			if (ch === '"') {
				i = this.tokenizeString(tokens, line, i);
				continue;
			}
			const ws = line.slice(i).match(/^[ \t]+/);
			if (ws) {
				tokens.push(createToken('text', ws[0], i));
				i += ws[0].length;
				continue;
			}
			const next = this.getNextToken(tokens, line, i, { inBlockComment: false }, innerCtx);
			if (next > i) {
				i = next;
			} else {
				tokens.push(createToken('text', line[i], i));
				i++;
			}
		}
		if (depth > 0) {
			state.interpHoleDepth = depth;
			state.interpHoleParenDepth = parenDepth;
			return line.length;
		}
		state.interpHoleDepth = 0;
		state.interpHoleParenDepth = 0;
		return i;
	}
}

/** Per-line tokenization context (mutable, not threaded across lines). */
interface TokenizeCtx {
	/** Open generic/type-argument angle-bracket depth. */
	angleDepth: number;
}

export function createCSharpTokenizer() {
	return new CSharpTokenizer();
}
