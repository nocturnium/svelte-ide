/**
 * Scala tokenizer
 *
 * Closed caveats (all closeable by a zero-dependency line tokenizer):
 *  - Interpolation is sub-tokenized: s"$name ${x + y}", f"$x%2.2f" (with format
 *    specifiers), and the raw"..." family. Delimiters render as string.template,
 *    the embedded expression is tokenized with real types (variable, property,
 *    operator, function.call, number, punctuation), and the surrounding literal
 *    stays `string`. Plain (un-prefixed) "..." does NOT interpolate `$` — Scala
 *    only interpolates when an interpolator prefix is present.
 *  - String escapes (\n \t \uXXXX \" \\ \uXXXX, octal \123, and the `$$` literal
 *    dollar inside interpolators) are emitted as string.escape. `raw"..."` and
 *    triple-quoted strings are literal: no escape processing.
 *  - Number subtypes: number.hex / number.binary / number.float / number.integer.
 *  - Context classification: members after `.` are `property` (or property.definition
 *    in a `val x.y =` ... no — Scala has no such form; member after `.` => property,
 *    or function.call when followed by `(`); the defined name after def/val/var/
 *    class/object/trait/type/enum/given is emitted with its *.definition subtype.
 *  - Multi-line threading: block comments, triple-quoted strings (with interpolation
 *    + escapes threaded through the resumed continuation, carrying the interpolator
 *    prefix so f-format specs and `$$` keep working across line breaks).
 *
 * Genuinely inherent limits of a single-pass line tokenizer (documented, not bugs):
 *  - Scala uses `[ ]` for type parameters, so there is no `< >` generic-bracket
 *    ambiguity to resolve; `<`/`>` are always operators here.
 *  - A bare PascalCase identifier is heuristically a type vs a singleton/companion
 *    value — indistinguishable without a type checker; we classify by Pascal-case.
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (def, class, etc.). Scala 3 adds `enum`, `given`, `extension`.
const definitionKeywords = new Set([
	'def',
	'class',
	'trait',
	'object',
	'type',
	'val',
	'var',
	'case',
	'enum',
	'given',
	'extension'
]);

// Keywords that introduce a *named* definition whose following identifier should
// be emitted with a `.definition` subtype. `case`/`given` are intentionally absent:
// `case` is overloaded (pattern arm vs enum case) and `given` names are optional.
const namedDefinitionKeywords = new Set(['def', 'class', 'trait', 'object', 'type', 'enum']);

// Storage / modifier keywords. Includes Scala 3 soft modifiers (`inline`,
// `opaque`, `transparent`, `open`, `infix`) which, while context-sensitive in
// the grammar, are universally highlighted as modifiers by Scala editors.
const storageKeywords = new Set([
	'private',
	'protected',
	'final',
	'sealed',
	'abstract',
	'implicit',
	'lazy',
	'override',
	'inline',
	'opaque',
	'transparent',
	'open',
	'infix'
]);

// Control-flow keywords (`then` is a Scala 3 control keyword)
const controlKeywords = new Set([
	'if',
	'else',
	'then',
	'match',
	'for',
	'while',
	'do',
	'yield',
	'return',
	'throw',
	'try',
	'catch',
	'finally'
]);

// Module keywords (`export` is the Scala 3 sibling of `import`)
const moduleKeywords = new Set(['import', 'package', 'export']);

// Other plain keywords. Scala 3 soft keywords `using`, `derives`, `end` are
// included here so they render as keywords rather than bare identifiers.
const otherKeywords = new Set([
	'new',
	'this',
	'super',
	'extends',
	'with',
	'forSome',
	'using',
	'derives',
	'end'
]);

// All keywords (union used for fast membership checks)
const keywords = new Set<string>([
	...definitionKeywords,
	...storageKeywords,
	...controlKeywords,
	...moduleKeywords,
	...otherKeywords
]);

// Built-in types
const builtinTypes = new Set([
	'Int',
	'Long',
	'Short',
	'Byte',
	'Double',
	'Float',
	'Boolean',
	'Char',
	'String',
	'Unit',
	'Any',
	'AnyRef',
	'AnyVal',
	'Nothing',
	'Null',
	'List',
	'Map',
	'Set',
	'Vector',
	'Array',
	'Option',
	'Seq',
	'Iterable',
	'Either',
	'Future'
]);

// Boolean / null literals
const booleanLiterals = new Set(['true', 'false']);

interface ScalaTokenizerState extends TokenizerState {
	/** Inside a triple-double-quoted multi-line string. */
	inTripleString?: boolean;
	/** The triple string's interpolator prefix (''/'s'/'f'/'raw'/custom). */
	triplePrefix?: string;
}

export class ScalaTokenizer {
	language = 'scala';

	getInitialState(): ScalaTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: ScalaTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		this.currentTokens = tokens;
		let pos = 0;
		const state: ScalaTokenizerState = { ...prevState };

		// Resume a block comment carried over from a previous line.
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

		// Resume a triple-quoted string carried over from a previous line.
		if (state.inTripleString) {
			const prefix = state.triplePrefix ?? '';
			const endIdx = line.indexOf('"""');
			const end = endIdx !== -1 ? endIdx + 3 : line.length;
			this.emitStringBody(tokens, line.slice(0, end), 0, prefix, true);
			if (endIdx !== -1) {
				pos = end;
				state.inTripleString = false;
				state.triplePrefix = undefined;
			} else {
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);

			// Strings can emit many tokens (interpolation breakouts), so they are
			// handled inline and push directly into the stream.
			const strStart = this.matchStringStart(remaining);
			if (strStart) {
				pos = this.tokenizeStringLike(tokens, remaining, pos, strStart, state);
				continue;
			}

			const token = this.getNextToken(remaining, pos, state);
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

		return { lineNumber, tokens: this.coalesceStrings(tokens), text: line, state };
	}

	/**
	 * Merge runs of adjacent, contiguous plain `string` tokens into one. This keeps
	 * a literal like "hello" a single token while preserving the breakout tokens
	 * (string.escape / string.template / interpolated-expression tokens) that sit
	 * between string segments in an interpolated literal. Subtypes are never merged.
	 */
	private coalesceStrings(tokens: Token[]): Token[] {
		const out: Token[] = [];
		for (const t of tokens) {
			const prev = out[out.length - 1];
			if (prev && prev.type === 'string' && t.type === 'string' && prev.end === t.start) {
				prev.text += t.text;
				prev.end = t.end;
			} else {
				out.push(t);
			}
		}
		return out;
	}

	/**
	 * Detect the start of a string literal. A string may be prefixed by an
	 * interpolator identifier glued to the opening quote: s"...", f"...", raw"...",
	 * and ARBITRARY custom interpolators (json"...", sql"...", uri"..."). Per the
	 * Scala grammar any identifier directly abutting a quote (no whitespace) is an
	 * interpolator prefix, so the prefix is consumed as part of the string.
	 * Returns the prefix length and whether the quote is triple, or null.
	 */
	private matchStringStart(text: string): { prefix: string; triple: boolean } | null {
		const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)?("""|")/);
		if (!m) return null;
		return { prefix: m[1] ?? '', triple: m[2] === '"""' };
	}

	private tokenizeStringLike(
		tokens: Token[],
		text: string,
		pos: number,
		start: { prefix: string; triple: boolean },
		state: ScalaTokenizerState
	): number {
		const { prefix, triple } = start;
		const quoteLen = triple ? 3 : 1;
		const open = prefix + (triple ? '"""' : '"');

		// Opening delimiter (with any interpolator prefix glued on).
		tokens.push(createToken('string', open, pos));
		const i = open.length;

		const closeQuote = triple ? '"""' : '"';
		const interpolating = prefix !== '';
		const raw = prefix === 'raw';

		// Find the body extent (up to closing quote or, for single-line strings,
		// end of line). For triple strings we may run off the end of the line. The
		// scan skips over `${ ... }` interpolation blocks so that a nested string of
		// the SAME quote — s"${ s"inner" }" — does not terminate the outer string
		// early, and so that a `"` typed inside an interpolation is not mistaken for
		// the close quote.
		let bodyEnd = -1;
		let j = i;
		while (j < text.length) {
			const ch = text[j];
			// Escapes only matter in non-raw, single/double (non-triple) strings.
			if (!raw && !triple && ch === '\\') {
				j += 2;
				continue;
			}
			// Skip a balanced `${ ... }` interpolation block.
			if (interpolating && ch === '$' && text[j + 1] === '{') {
				let depth = 1;
				j += 2;
				while (j < text.length && depth > 0) {
					if (text[j] === '{') depth++;
					else if (text[j] === '}') depth--;
					j++;
				}
				continue;
			}
			if (triple) {
				if (text.startsWith('"""', j)) {
					bodyEnd = j;
					break;
				}
			} else if (ch === '"') {
				bodyEnd = j;
				break;
			}
			j++;
		}

		if (bodyEnd === -1) {
			// Unterminated on this line.
			if (triple) {
				// Triple strings span lines: thread state and consume to EOL.
				this.emitStringBody(tokens, text.slice(i), pos + i, prefix, true);
				state.inTripleString = true;
				state.triplePrefix = prefix;
				return pos + text.length;
			}
			// Single-line string ran off the end: consume rest as body (lossless).
			this.emitStringBody(tokens, text.slice(i), pos + i, prefix, false);
			return pos + text.length;
		}

		// Body between the open quote and the close quote.
		this.emitStringBody(tokens, text.slice(i, bodyEnd), pos + i, prefix, triple);
		// Closing delimiter.
		tokens.push(createToken('string', closeQuote, pos + bodyEnd));
		return pos + bodyEnd + quoteLen;
	}

	/**
	 * Emit the inner body of a string (everything between the delimiters), breaking
	 * out escape sequences and interpolation. `prefix` is the interpolator prefix
	 * (''/'s'/'f'/'raw'/custom); only prefixed strings interpolate, and only
	 * non-raw, non-triple strings process backslash escapes.
	 */
	private emitStringBody(
		tokens: Token[],
		body: string,
		base: number,
		prefix: string,
		triple: boolean
	): void {
		const interpolating = prefix !== '';
		const processEscapes = prefix !== 'raw' && !triple;
		let i = 0;
		let segStart = 0;

		const flush = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken('string', body.slice(segStart, end), base + segStart));
			}
		};

		while (i < body.length) {
			const ch = body[i];

			// Backslash escapes (only in non-raw single/double quoted strings).
			if (processEscapes && ch === '\\' && i + 1 < body.length) {
				flush(i);
				const rest = body.slice(i);
				const uni = rest.match(/^\\u[0-9a-fA-F]{4}/);
				const oct = rest.match(/^\\[0-7]{1,3}/);
				const simple = rest.match(/^\\[btnfr"'\\$]/);
				const escLen = uni ? uni[0].length : simple ? 2 : oct ? oct[0].length : 2;
				tokens.push(createToken('string.escape', body.slice(i, i + escLen), base + i));
				i += escLen;
				segStart = i;
				continue;
			}

			// Interpolation (only when a prefix is present).
			if (interpolating && ch === '$') {
				const next = body[i + 1];

				// `$$` is a literal dollar sign.
				if (next === '$') {
					flush(i);
					tokens.push(createToken('string.escape', '$$', base + i));
					i += 2;
					segStart = i;
					continue;
				}

				// `${ expr }` — tokenize the inner expression with real types.
				if (next === '{') {
					flush(i);
					let depth = 1;
					let j = i + 2;
					while (j < body.length && depth > 0) {
						if (body[j] === '{') depth++;
						else if (body[j] === '}') {
							depth--;
							if (depth === 0) break;
						}
						j++;
					}
					const exprEnd = j < body.length ? j : body.length; // index of closing }
					tokens.push(createToken('string.template', '${', base + i));
					this.tokenizeInterpolatedExpr(tokens, body.slice(i + 2, exprEnd), base + i + 2);
					if (j < body.length) {
						tokens.push(createToken('string.template', '}', base + j));
						i = j + 1;
					} else {
						i = body.length;
					}
					segStart = i;
					// f-interpolator format spec after the substitution.
					i = this.consumeFormatSpec(tokens, body, i, base, prefix);
					segStart = i;
					continue;
				}

				// `$ident` (optionally with `.member` chains).
				const idMatch = body.slice(i + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
				if (idMatch) {
					flush(i);
					tokens.push(createToken('string.template', '$', base + i));
					let k = i + 1 + idMatch[0].length;
					tokens.push(createToken('variable', idMatch[0], base + i + 1));
					// Member-access chain: $obj.field.value
					let chain = body.slice(k);
					let chainMatch = chain.match(/^\.([A-Za-z_][A-Za-z0-9_]*)/);
					while (chainMatch) {
						tokens.push(createToken('punctuation.accessor', '.', base + k));
						tokens.push(createToken('property', chainMatch[1], base + k + 1));
						k += chainMatch[0].length;
						chain = body.slice(k);
						chainMatch = chain.match(/^\.([A-Za-z_][A-Za-z0-9_]*)/);
					}
					i = k;
					segStart = i;
					// f-interpolator format spec after the substitution.
					i = this.consumeFormatSpec(tokens, body, i, base, prefix);
					segStart = i;
					continue;
				}
			}

			i++;
		}

		flush(body.length);
	}

	/**
	 * In an f-interpolator, a substitution may be followed by a printf-style format
	 * specifier (e.g. %2.2f, %05d, %s, %-10s). Emit it as string.escape (a meta
	 * directive, visually distinct from the literal text). No-op for non-f strings.
	 * Returns the new index.
	 */
	private consumeFormatSpec(
		tokens: Token[],
		body: string,
		i: number,
		base: number,
		prefix: string
	): number {
		if (prefix !== 'f') return i;
		const m = body.slice(i).match(/^%[-+ 0#,(]*\d*(?:\.\d+)?[a-zA-Z%]/);
		if (m) {
			tokens.push(createToken('string.escape', m[0], base + i));
			return i + m[0].length;
		}
		return i;
	}

	/**
	 * Tokenize the expression inside `${ ... }` with full Scala types. Reuses the
	 * scalar token machinery so operators, numbers, calls, members and punctuation
	 * all get precise subtypes. Strings nested inside the interpolation are handled
	 * too (Scala allows `s"${ s"$x" }"`).
	 */
	private tokenizeInterpolatedExpr(tokens: Token[], expr: string, base: number): void {
		let pos = 0;
		const state: ScalaTokenizerState = {};
		while (pos < expr.length) {
			const remaining = expr.slice(pos);
			const strStart = this.matchStringStart(remaining);
			if (strStart) {
				pos = this.tokenizeStringLike(tokens, remaining, base + pos, strStart, state) - base;
				continue;
			}
			const token = this.getNextToken(remaining, base + pos, state);
			if (token) {
				tokens.push(token);
				pos = token.end - base;
			} else {
				tokens.push(createToken('text', remaining[0], base + pos));
				pos += 1;
			}
		}
	}

	private getNextToken(text: string, pos: number, state: ScalaTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}

		// Block comments
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 2), pos);
			} else {
				state.inBlockComment = true;
				return createToken('comment.block', text, pos);
			}
		}

		// Char literals vs. symbol literals.
		// Char: 'a' or '\n' (has a closing quote). Symbol: 'name (apostrophe + identifier).
		if (text.startsWith("'")) {
			const charMatch = text.match(/^'(?:\\(?:[btnfr"'\\]|u[0-9a-fA-F]{4}|[0-7]{1,3})|[^'\\])'/);
			if (charMatch) {
				return createToken('string', charMatch[0], pos);
			}
			const symbolMatch = text.match(/^'[A-Za-z_][A-Za-z0-9_]*/);
			if (symbolMatch) {
				return createToken('constant.builtin', symbolMatch[0], pos);
			}
		}

		// Numbers: hex, binary, or decimal/float with optional underscores and
		// L/f/F/d/D suffix. A trailing dot is only part of the number when followed
		// by a fractional digit (e.g. 3.14); in `42.toString` the dot is a member
		// accessor, so the integer form must NOT swallow it.
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+[lL]?|0[bB][01_]+[lL]?|(?:\d[\d_]*\.\d[\d_]*|\.\d[\d_]*|\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?[lLfFdD]?)/
		);
		if (numMatch) {
			return createToken(this.classifyNumber(numMatch[0]), numMatch[0], pos);
		}

		// Backtick-quoted identifiers: `yield`, `type`, etc. The contents are always a plain
		// identifier even when they spell a reserved word, so never classify as a keyword.
		if (text.startsWith('`')) {
			const backtickMatch = text.match(/^`[^`\n]+`/);
			if (backtickMatch) {
				const after = text.slice(backtickMatch[0].length);
				const type: TokenType = after.startsWith('(') ? 'function.call' : 'variable';
				return createToken(type, backtickMatch[0], pos);
			}
		}

		// Annotations: @deprecated, @main, @scala.annotation.tailrec
		if (text.startsWith('@')) {
			const annMatch = text.match(/^@[A-Za-z_][A-Za-z0-9_]*/);
			if (annMatch) {
				return createToken('type', annMatch[0], pos);
			}
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			const lastTok = this.lastSignificantToken();
			return createToken(this.classifyIdentifier(word, text, word.length, lastTok), word, pos);
		}

		// Operators (longest first). Includes Scala-specific arrows and type bounds.
		const opMatch = text.match(
			/^(?:=:=|<:<|>:>|<:|>:|=>|<-|->|<%|&&|\|\||==|!=|<=|>=|<<|>>>|>>|[+\-*/%&|^~<>=!]=?)/
		);
		if (opMatch) {
			return createToken(this.classifyOperator(opMatch[0]), opMatch[0], pos);
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
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
	}

	/**
	 * The live token array for the line currently being tokenized. Reset at the top
	 * of tokenizeLine and pushed into by every token emitter (including interpolation
	 * breakouts), so lastSignificantToken() can look back for context-sensitive
	 * classification (member-after-accessor, the name after a definition keyword).
	 */
	private currentTokens: Token[] = [];

	private lastSignificantToken(): Token | undefined {
		for (let k = this.currentTokens.length - 1; k >= 0; k--) {
			const t = this.currentTokens[k];
			if (t.type === 'text' && /^[ \t]*$/.test(t.text)) continue;
			return t;
		}
		return undefined;
	}

	private classifyNumber(num: string): TokenType {
		if (/^0[xX]/.test(num)) return 'number.hex';
		if (/^0[bB]/.test(num)) return 'number.binary';
		if (/[.eEfFdD]/.test(num)) return 'number.float';
		return 'number.integer';
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		prev: Token | undefined
	): TokenType {
		// Member access: an identifier directly after a `.` accessor is a property
		// (or a method call when followed by `(`).
		if (prev && prev.type === 'punctuation.accessor') {
			const afterDot = context.slice(wordLength).trimStart();
			if (afterDot.startsWith('(')) return 'function.call';
			return 'property';
		}

		// The name introduced by a definition keyword (def f, class C, type T, ...).
		if (prev && prev.text && prev.type.startsWith('keyword')) {
			// `def name` => a function definition; class/trait/object/type/enum => a type.
			if (namedDefinitionKeywords.has(prev.text)) {
				if (prev.text === 'def') return 'function.definition';
				return 'type.class';
			}
			// `val name` / `var name` => a value/variable binding being defined.
			if (prev.text === 'val' || prev.text === 'var') {
				return 'variable.definition';
			}
		}

		// Boolean / null literals
		if (booleanLiterals.has(word)) {
			return 'constant.boolean';
		}
		if (word === 'null') {
			return 'constant.null';
		}

		// Keywords
		if (keywords.has(word)) {
			if (definitionKeywords.has(word)) return 'keyword.definition';
			if (storageKeywords.has(word)) return 'keyword.storage';
			if (controlKeywords.has(word)) return 'keyword.control';
			if (moduleKeywords.has(word)) return 'keyword.module';
			return 'keyword';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		const afterWord = context.slice(wordLength).trim();

		// Identifier immediately followed by ( => function call.
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// PascalCase => a class/type.
		if (/^[A-Z][A-Za-z0-9]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	private classifyOperator(op: string): TokenType {
		if (op === '=>' || op === '<-' || op === '->' || op === '<:' || op === '>:' || op === '<%') {
			return 'keyword.operator';
		}
		if (op === '=') return 'operator.assignment';
		if (op === '+=' || op === '-=' || op === '*=' || op === '/=' || op === '%=') {
			return 'operator.assignment';
		}
		if (op === '==' || op === '!=' || op === '<=' || op === '>=' || op === '<' || op === '>') {
			return 'operator.comparison';
		}
		if (op === '=:=' || op === '<:<' || op === '>:>') return 'operator.comparison';
		if (op === '&&' || op === '||' || op === '!') return 'operator.logical';
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
			return 'operator.arithmetic';
		}
		return 'operator';
	}
}

export function createScalaTokenizer() {
	return new ScalaTokenizer();
}
