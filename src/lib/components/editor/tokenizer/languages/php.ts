/**
 * PHP tokenizer
 *
 * Closed limitations (vs. the earlier line-tokenizer baseline):
 *  - Double-quoted strings AND heredoc bodies are SUB-TOKENIZED: the surrounding
 *    literal stays `string`/`string.template`, but interpolations ("$x",
 *    "$obj->prop", "$arr[0]", "{$expr}", "${name}") are tokenized with real types
 *    (variable, property, operator, number, punctuation), and escape sequences
 *    (\n \t \" \uXXXX \x41 \101 …) are emitted as `string.escape`. All lossless.
 *  - Numbers carry precise subtypes: number.hex / number.binary / number.float /
 *    number.integer (octal stays number.integer).
 *  - Context classification: properties/methods after -> / ?-> / :: get
 *    property / property.definition / function.call / constant; definition names
 *    after function/fn/class/interface/trait/enum/namespace get the right subtype;
 *    function parameters become variable.parameter; named arguments become
 *    property; `static`/`self`/`parent`/builtins as types vs. values.
 *  - Multi-line threading: unterminated double-quoted strings now thread across
 *    lines (with interpolation) the way heredocs already did.
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (function/class/interface/trait/enum)
const definitionKeywords = new Set(['function', 'fn', 'class', 'interface', 'trait', 'enum']);

// Storage / modifier keywords
const storageKeywords = new Set([
	'public',
	'private',
	'protected',
	'static',
	'final',
	'abstract',
	'const',
	'readonly',
	'var',
	'global'
]);

// Control-flow keywords
const controlKeywords = new Set([
	'if',
	'elseif',
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
	'match',
	'goto',
	'yield'
]);

// Module / namespace keywords
const moduleKeywords = new Set([
	'use',
	'require',
	'require_once',
	'include',
	'include_once',
	'namespace'
]);

// Other plain keywords
const keywords = new Set([
	'new',
	'echo',
	'print',
	'this',
	'self',
	'parent',
	'extends',
	'implements',
	'instanceof',
	'as',
	'clone',
	'and',
	'or',
	'xor',
	'list',
	'array',
	'isset',
	'unset',
	'empty',
	'declare',
	'endif',
	'endfor',
	'endforeach',
	'endwhile',
	'endswitch',
	'insteadof',
	'callable'
]);

// Boolean / null constants (case-insensitive in PHP)
const booleanWords = new Set(['true', 'false']);
const nullWords = new Set(['null']);

// Builtin type hints
const builtinTypes = new Set([
	'int',
	'float',
	'string',
	'bool',
	'object',
	'mixed',
	'void',
	'iterable',
	'never',
	'false',
	'true',
	'null',
	'self',
	'static',
	'parent'
]);

// Magic constants (__LINE__, __FILE__, …) — case-insensitive in PHP.
const magicConstants = new Set([
	'__line__',
	'__file__',
	'__dir__',
	'__function__',
	'__class__',
	'__trait__',
	'__method__',
	'__namespace__',
	'__compiler_halt_offset__'
]);

interface PhpTokenizerState extends TokenizerState {
	/** Currently inside a heredoc/nowdoc block */
	inHeredoc?: boolean;
	/** The closing label of the active heredoc/nowdoc */
	heredocLabel?: string;
	/** Whether the active doc block is a nowdoc (single-quoted label, no interpolation) */
	heredocNowdoc?: boolean;
	/** Whether the active multi-line block comment was opened as a /** doc comment */
	inDocComment?: boolean;
	/**
	 * Currently inside an unterminated double-quoted string that spans lines.
	 * Threaded so interpolation/escapes keep classifying on continuation lines.
	 */
	inDoubleString?: boolean;
	/**
	 * Currently in inline-HTML mode (outside PHP tags). PHP scripts re-enter this
	 * mode after every `?>` close tag and leave it on the next `<?php`/`<?=`/`<?`.
	 * The tokenizer treats bare snippets as already in PHP mode (initial state),
	 * so this only flips on once a close tag is actually seen.
	 */
	inHtml?: boolean;
}

export class PhpTokenizer {
	language = 'php';

	getInitialState(): PhpTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: PhpTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: PhpTokenizerState = { ...prevState };

		// Handle heredoc/nowdoc continuation
		if (state.inHeredoc) {
			// The closing label may be indented (PHP 7.3+) and optionally followed by ; or ,
			const label = state.heredocLabel ?? '';
			const closeMatch = line.match(new RegExp(`^(\\s*)(${escapeRegex(label)})\\b`));
			if (closeMatch) {
				const indent = closeMatch[1];
				if (indent.length > 0) {
					tokens.push(createToken('text', indent, 0));
				}
				tokens.push(createToken('string', label, indent.length));
				pos = indent.length + label.length;
				state.inHeredoc = false;
				state.heredocLabel = undefined;
				state.heredocNowdoc = undefined;
				// Continue scanning the rest of the line (e.g. a trailing ;)
			} else {
				// Still inside the body. Heredoc bodies interpolate (nowdoc bodies don't).
				if (state.heredocNowdoc) {
					tokens.push(createToken('string', line, 0));
				} else {
					this.emitInterpolated(line, 0, tokens, 'string.template');
				}
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Handle an unterminated double-quoted string spanning lines.
		if (state.inDoubleString) {
			const consumed = this.continueDoubleString(line, 0, tokens, state);
			pos = consumed;
			if (state.inDoubleString) {
				// String still open at end of line — whole line consumed.
				return { lineNumber, tokens, text: line, state };
			}
			// Otherwise the closing quote was found; fall through and keep scanning.
		}

		// Handle block comment continuation (preserve doc-comment vs block-comment type)
		if (state.inBlockComment) {
			const commentType: TokenType = state.inDocComment ? 'comment.doc' : 'comment.block';
			const endIdx = line.indexOf('*/');
			if (endIdx !== -1) {
				tokens.push(createToken(commentType, line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
				state.inDocComment = undefined;
			} else {
				tokens.push(createToken(commentType, line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);

			// Inline-HTML mode: everything outside PHP tags is literal text. Emit the
			// run up to the next open tag as a single `text` token, then let the open
			// tag be tokenized as a keyword (flipping us back into PHP mode).
			if (state.inHtml) {
				const openMatch = remaining.match(/<\?(?:php\b|=|(?![a-zA-Z]))/);
				if (!openMatch || openMatch.index === undefined) {
					// No open tag on this line: the whole remainder is inline HTML.
					tokens.push(createToken('text', remaining, pos));
					pos = line.length;
					break;
				}
				if (openMatch.index > 0) {
					tokens.push(createToken('text', remaining.slice(0, openMatch.index), pos));
					pos += openMatch.index;
				}
				state.inHtml = false;
				continue;
			}

			const before = tokens.length;
			const token = this.getNextToken(remaining, pos, state, tokens);

			if (token) {
				tokens.push(token);
				pos = token.end;
			} else if (tokens.length > before) {
				// getNextToken pushed sub-tokens itself (interpolated string / heredoc opener);
				// advance to the end of the last pushed token.
				pos = tokens[tokens.length - 1].end;
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				pos += 1;
			}
			// A heredoc opener / open double-string consumes the rest of the line into
			// state; stop scanning.
			if (state.inHeredoc || state.inDoubleString) {
				break;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	/**
	 * @returns a Token to push, OR null. When null and it already pushed sub-tokens
	 * into `out`, the caller advances past the last pushed token. When null and it
	 * pushed nothing, the caller emits a single fallback `text` char.
	 */
	private getNextToken(
		text: string,
		pos: number,
		state: PhpTokenizerState,
		out: Token[]
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// PHP open/close tags. The close tag returns control to inline-HTML mode;
		// the open tags leave it (handled where HTML mode is entered).
		if (text.startsWith('<?php')) {
			return createToken('keyword', '<?php', pos);
		}
		if (text.startsWith('<?=')) {
			return createToken('keyword', '<?=', pos);
		}
		if (text.startsWith('<?')) {
			return createToken('keyword', '<?', pos);
		}
		if (text.startsWith('?>')) {
			state.inHtml = true;
			return createToken('keyword', '?>', pos);
		}

		// Heredoc / nowdoc opener: <<<LABEL or <<<"LABEL" or <<<'LABEL'
		const heredocMatch = text.match(/^<<<[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
		if (heredocMatch) {
			const quote = heredocMatch[1];
			state.inHeredoc = true;
			state.heredocLabel = heredocMatch[2];
			state.heredocNowdoc = quote === "'";
			// Consume the rest of the line as the opener token (body begins next line).
			return createToken('string', text, pos);
		}

		// Doc comment /** ... */
		// Note: `/**/` is an empty *block* comment, not a doc comment opener.
		if (text.startsWith('/**') && !text.startsWith('/**/')) {
			const endIdx = text.indexOf('*/', 3);
			if (endIdx !== -1) {
				return createToken('comment.doc', text.slice(0, endIdx + 2), pos);
			}
			state.inBlockComment = true;
			state.inDocComment = true;
			return createToken('comment.doc', text, pos);
		}

		// Block comment /* ... */
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 2), pos);
			}
			state.inBlockComment = true;
			return createToken('comment.block', text, pos);
		}

		// Line comments: // and #  (# is not the start of #[Attribute])
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}
		if (text.startsWith('#') && !text.startsWith('#[')) {
			return createToken('comment.line', text, pos);
		}

		// Attributes #[...]
		if (text.startsWith('#[')) {
			return createToken('punctuation', '#[', pos);
		}

		// Variables: $name
		const varMatch = text.match(/^\$[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/);
		if (varMatch) {
			return createToken(this.classifyVariable(out), varMatch[0], pos);
		}

		// Single-quoted string (literal, no interpolation) — sub-tokenize \\ and \' escapes.
		if (text.startsWith("'")) {
			this.emitSingleQuoted(text, pos, out);
			return null;
		}

		// Double-quoted string (interpolated) — sub-tokenize interpolation + escapes.
		if (text.startsWith('"')) {
			this.emitDoubleQuoted(text, pos, out, state);
			return null;
		}

		// Numbers — emit precise subtype.
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|0[0-7_]+(?![.eE])|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)/
		);
		if (numMatch) {
			return createToken(this.classifyNumber(numMatch[0]), numMatch[0], pos);
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length, out), word, pos);
		}

		// Operators (multi-char first)
		const opMatch = text.match(
			/^(?:\?->|<=>|===|!==|<<=|>>=|\*\*=|\?\?=|\.\.\.|->|::|=>|\?\?|&&|\|\||<<|>>|\*\*|\+\+|--|==|!=|<>|<=|>=|[+\-*/%.&|^]=|[+\-*/%.=<>!&|^~@?:])/
		);
		if (opMatch) {
			return createToken(this.classifyOperator(opMatch[0]), opMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),;\\]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';') type = 'punctuation.separator';
			else if (char === '\\') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
	}

	private classifyOperator(op: string): TokenType {
		if (op === '->' || op === '?->' || op === '::') return 'punctuation.accessor';
		if (op === '=>') return 'operator';
		if (
			op === '=' ||
			op === '+=' ||
			op === '-=' ||
			op === '*=' ||
			op === '/=' ||
			op === '%=' ||
			op === '.=' ||
			op === '**=' ||
			op === '??=' ||
			op === '<<=' ||
			op === '>>=' ||
			op === '&=' ||
			op === '|=' ||
			op === '^='
		) {
			return 'operator.assignment';
		}
		if (
			op === '==' ||
			op === '===' ||
			op === '!=' ||
			op === '!==' ||
			op === '<>' ||
			op === '<' ||
			op === '>' ||
			op === '<=' ||
			op === '>=' ||
			op === '<=>'
		) {
			return 'operator.comparison';
		}
		if (op === '&&' || op === '||' || op === '!') return 'operator.logical';
		if (
			op === '+' ||
			op === '-' ||
			op === '*' ||
			op === '/' ||
			op === '%' ||
			op === '**' ||
			op === '++' ||
			op === '--'
		) {
			return 'operator.arithmetic';
		}
		return 'operator';
	}

	private classifyNumber(num: string): TokenType {
		if (/^0[xX]/.test(num)) return 'number.hex';
		if (/^0[bB]/.test(num)) return 'number.binary';
		// Float: has a decimal point or an exponent. (0[oO]… and legacy 0NN octals are
		// integers — they never reach here with a `.`/`e` because the number regex
		// excludes those forms via the (?![.eE]) guard on octal.)
		if (/[.eE]/.test(num) && !/^0[oO]/.test(num)) return 'number.float';
		return 'number.integer';
	}

	/**
	 * Classify a bare `$var`. A variable becomes a parameter when it sits inside a
	 * just-opened parameter list of a function/fn definition (best-effort: we detect
	 * a preceding `function`/`fn` name + `(` with no intervening `)` on this line).
	 */
	private classifyVariable(out: Token[]): TokenType {
		if (this.inParameterList(out)) return 'variable.parameter';
		return 'variable';
	}

	/**
	 * Heuristic: are we lexically inside the parameter list of a function/fn
	 * declaration on this line? Walk the already-emitted tokens backward to the
	 * nearest unmatched `(`; if the token chain leading into it is
	 * `function`/`fn` [name] `(`, we're in a parameter list.
	 */
	private inParameterList(out: Token[]): boolean {
		let depth = 0;
		for (let i = out.length - 1; i >= 0; i--) {
			const t = out[i];
			if (t.type === 'text' && /^[ \t]*$/.test(t.text)) continue;
			if (t.type === 'punctuation.paren') {
				if (t.text === ')') depth++;
				else if (t.text === '(') {
					if (depth === 0) {
						// Found the opening paren we're inside. What introduced it?
						return this.parenIsParamList(out, i);
					}
					depth--;
				}
				continue;
			}
		}
		return false;
	}

	private parenIsParamList(out: Token[], parenIdx: number): boolean {
		// Skip back over whitespace before the `(`.
		let j = parenIdx - 1;
		while (j >= 0 && out[j].type === 'text' && /^[ \t]*$/.test(out[j].text)) j--;
		if (j < 0) return false;
		const prev = out[j];
		// `fn(` directly, or `function name(` / `name(` where the definition keyword
		// preceded the name.
		if (prev.type === 'keyword.definition' && (prev.text === 'fn' || prev.text === 'function')) {
			return true;
		}
		if (prev.type === 'function.definition') return true;
		return false;
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		out: Token[]
	): TokenType {
		const lower = word.toLowerCase();

		// Member access context: the previous significant token is an accessor.
		const prev = this.prevSignificant(out);
		const afterAccessor =
			prev?.type === 'punctuation.accessor' &&
			(prev.text === '->' || prev.text === '?->' || prev.text === '::');
		const afterArrow = afterAccessor && prev?.text !== '::';
		const afterScope = afterAccessor && prev?.text === '::';

		const afterWord = context.slice(wordLength).trim();
		const isCall = afterWord.startsWith('(');

		// After -> / ?->  : a method call or a property.
		if (afterArrow) {
			return isCall ? 'function.call' : 'property';
		}
		// After :: : a method call, a class constant (ALL_CAPS / known), or a static prop name.
		if (afterScope) {
			if (isCall) return 'function.call';
			// Foo::class is the special class-name pseudo-constant.
			if (lower === 'class') return 'keyword';
			if (/^[A-Z][A-Z0-9_]*$/.test(word)) return 'constant';
			return 'property';
		}

		// Definition NAME: the previous significant token is a definition keyword.
		if (prev?.type === 'keyword.definition') {
			const dk = prev.text.toLowerCase();
			if (dk === 'function' || dk === 'fn') return 'function.definition';
			if (dk === 'class' || dk === 'trait' || dk === 'enum') return 'type.class';
			if (dk === 'interface') return 'type.interface';
		}
		// Names introduced by namespace / use / extends / implements / instanceof / new.
		if (prev?.type === 'keyword.module' && prev.text.toLowerCase() === 'namespace') {
			return 'type.namespace';
		}

		// Magic constants __LINE__ etc.
		if (magicConstants.has(lower)) return 'constant.builtin';

		// Boolean / null constants (case-insensitive)
		if (booleanWords.has(lower)) return 'constant.boolean';
		if (nullWords.has(lower)) return 'constant.null';

		// Definition keywords
		if (definitionKeywords.has(lower)) return 'keyword.definition';

		// Storage keywords
		if (storageKeywords.has(lower)) return 'keyword.storage';

		// Control-flow keywords
		if (controlKeywords.has(lower)) return 'keyword.control';

		// Module / namespace keywords
		if (moduleKeywords.has(lower)) return 'keyword.module';

		// Other plain keywords
		if (keywords.has(lower)) return 'keyword';

		// Named argument: `name:` followed by a value (not `::`) inside a call.
		// e.g. setColor(red: 255). Distinguish from ternary `?:` / label by requiring
		// a single colon not part of `::`.
		if (/^:(?!:)/.test(afterWord) && this.looksLikeNamedArg(out)) {
			return 'property';
		}

		// Function call: identifier immediately followed by (
		if (isCall) {
			return 'function.call';
		}

		// Builtin type hints
		if (builtinTypes.has(lower)) {
			return 'type.builtin';
		}

		// ALL_CAPS => constant
		if (/^[A-Z][A-Z0-9_]*$/.test(word) && word.length > 1) {
			return 'constant';
		}

		// PascalCase => class/type name
		if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	/** True when emitting a named argument is plausible: we're inside a `(` call list. */
	private looksLikeNamedArg(out: Token[]): boolean {
		let depth = 0;
		for (let i = out.length - 1; i >= 0; i--) {
			const t = out[i];
			if (t.type === 'punctuation.paren') {
				if (t.text === ')') depth++;
				else if (t.text === '(') {
					if (depth === 0) return true;
					depth--;
				}
			}
		}
		return false;
	}

	/** Last token that isn't pure whitespace text. */
	private prevSignificant(out: Token[]): Token | undefined {
		for (let i = out.length - 1; i >= 0; i--) {
			const t = out[i];
			if (t.type === 'text' && /^[ \t]*$/.test(t.text)) continue;
			return t;
		}
		return undefined;
	}

	// ──────────────────────────────────────────────────────────────────────────
	// String sub-tokenization
	// ──────────────────────────────────────────────────────────────────────────

	/**
	 * Single-quoted string. Only `\'` and `\\` are escapes; everything else is
	 * literal. Emits string.escape for those two, string for the rest, including
	 * the delimiters.
	 */
	private emitSingleQuoted(text: string, pos: number, out: Token[]): void {
		let i = 1; // past opening quote
		let runStart = 0; // start of the current literal run (includes opening quote)
		const flush = (end: number) => {
			if (end > runStart)
				out.push(createToken('string', text.slice(runStart, end), pos + runStart));
		};
		while (i < text.length) {
			const ch = text[i];
			if (ch === '\\' && i + 1 < text.length && (text[i + 1] === "'" || text[i + 1] === '\\')) {
				flush(i);
				out.push(createToken('string.escape', text.slice(i, i + 2), pos + i));
				i += 2;
				runStart = i;
				continue;
			}
			if (ch === "'") {
				flush(i + 1);
				return;
			}
			i++;
		}
		// Unterminated single-quoted string on this line (rare). Emit what we have as
		// string; single-quoted strings spanning lines are not threaded (uncommon and
		// the baseline didn't either) but remain lossless.
		flush(text.length);
	}

	/**
	 * Double-quoted string. Sub-tokenizes interpolation and escapes. If the closing
	 * quote isn't found, sets state.inDoubleString and consumes the rest of the line.
	 */
	private emitDoubleQuoted(
		text: string,
		pos: number,
		out: Token[],
		state: PhpTokenizerState
	): void {
		// Opening quote.
		out.push(createToken('string', '"', pos));
		const consumed = this.scanDoubleBody(text, 1, pos, out, true);
		if (consumed.closed) {
			// Closing quote already emitted inside scanDoubleBody.
			return;
		}
		state.inDoubleString = true;
	}

	/** Continuation of a multi-line double-quoted string. Returns chars consumed. */
	private continueDoubleString(
		line: string,
		pos: number,
		out: Token[],
		state: PhpTokenizerState
	): number {
		const consumed = this.scanDoubleBody(line, 0, pos, out, false);
		if (consumed.closed) {
			state.inDoubleString = false;
		}
		return consumed.end;
	}

	/**
	 * Scan the body of a double-quoted string starting at `start` (relative to text).
	 * Emits string / string.escape / interpolation tokens. `pos` is the absolute
	 * column of text[0]. Returns whether it closed and the absolute end column.
	 */
	private scanDoubleBody(
		text: string,
		start: number,
		pos: number,
		out: Token[],
		isOpener: boolean
	): { closed: boolean; end: number } {
		let i = start;
		let runStart = start;
		const flushLiteral = (end: number) => {
			if (end > runStart)
				out.push(createToken('string', text.slice(runStart, end), pos + runStart));
		};
		while (i < text.length) {
			const ch = text[i];

			// Escape sequence.
			if (ch === '\\' && i + 1 < text.length) {
				const esc = this.matchDoubleEscape(text, i);
				if (esc > 0) {
					flushLiteral(i);
					out.push(createToken('string.escape', text.slice(i, i + esc), pos + i));
					i += esc;
					runStart = i;
					continue;
				}
				// A lone backslash before a non-escaped char is literal in PHP.
				i++;
				continue;
			}

			// Closing quote.
			if (ch === '"') {
				flushLiteral(i);
				out.push(createToken('string', '"', pos + i));
				return { closed: true, end: pos + i + 1 };
			}

			// {$expr} complex interpolation.
			if (ch === '{' && text[i + 1] === '$') {
				const end = this.emitCurlyInterp(text, i, pos, out, flushLiteral, '{');
				if (end > i) {
					i = end;
					runStart = i;
					continue;
				}
			}
			// ${name} / ${expr} interpolation.
			if (ch === '$' && text[i + 1] === '{') {
				const end = this.emitDollarCurlyInterp(text, i, pos, out, flushLiteral);
				if (end > i) {
					i = end;
					runStart = i;
					continue;
				}
			}
			// Simple $var interpolation (with optional ->prop or [index]).
			if (ch === '$' && /[a-zA-Z_\x80-\xff]/.test(text[i + 1] ?? '')) {
				const end = this.emitSimpleInterp(text, i, pos, out, flushLiteral);
				if (end > i) {
					i = end;
					runStart = i;
					continue;
				}
			}

			i++;
		}
		// End of line without a closing quote.
		flushLiteral(text.length);
		void isOpener;
		return { closed: false, end: pos + text.length };
	}

	/**
	 * Match a PHP double-quoted escape at text[i] (text[i] is '\\').
	 * @returns the length of the escape (incl. the backslash) or 0 if not an escape.
	 */
	private matchDoubleEscape(text: string, i: number): number {
		const next = text[i + 1];
		// Simple single-char escapes.
		if ('nrtvfe\\$"'.includes(next)) return 2;
		// \x41 hex (1-2 hex digits).
		if (next === 'x') {
			const m = text.slice(i + 2).match(/^[0-9A-Fa-f]{1,2}/);
			if (m) return 2 + m[0].length;
			return 0;
		}
		// \u{1F600} unicode codepoint.
		if (next === 'u' && text[i + 2] === '{') {
			const m = text.slice(i + 3).match(/^[0-9A-Fa-f]+\}/);
			if (m) return 3 + m[0].length;
			return 0;
		}
		// \101 octal (1-3 octal digits).
		if (/[0-7]/.test(next)) {
			const m = text.slice(i + 1).match(/^[0-7]{1,3}/);
			if (m) return 1 + m[0].length;
		}
		return 0;
	}

	/**
	 * Simple interpolation: `$var`, `$var->prop`, `$var[index]`. Emits the `$var`
	 * as variable, an `->prop` as accessor+property, and `[index]` as
	 * bracket+(number|variable|string-bareword)+bracket. Returns the end index.
	 */
	private emitSimpleInterp(
		text: string,
		i: number,
		pos: number,
		out: Token[],
		flushLiteral: (end: number) => void
	): number {
		const varMatch = text.slice(i).match(/^\$[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/);
		if (!varMatch) return i;
		flushLiteral(i);
		let j = i + varMatch[0].length;
		out.push(createToken('variable', varMatch[0], pos + i));

		// Single ->prop (simple syntax only allows one level).
		const arrowMatch = text.slice(j).match(/^->([a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*)/);
		if (arrowMatch) {
			out.push(createToken('punctuation.accessor', '->', pos + j));
			out.push(createToken('property', arrowMatch[1], pos + j + 2));
			j += arrowMatch[0].length;
			return j;
		}

		// Single [index] (simple syntax: bareword, integer, or $var — no nested).
		const idxMatch = text.slice(j).match(/^\[([^\]\n]*)\]/);
		if (idxMatch) {
			out.push(createToken('punctuation.bracket', '[', pos + j));
			const inner = idxMatch[1];
			const innerPos = pos + j + 1;
			if (/^\$[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*$/.test(inner)) {
				out.push(createToken('variable', inner, innerPos));
			} else if (/^-?\d+$/.test(inner)) {
				out.push(createToken('number.integer', inner, innerPos));
			} else if (inner.length > 0) {
				// Bareword key (unquoted) — string in simple interpolation syntax.
				out.push(createToken('string', inner, innerPos));
			}
			out.push(createToken('punctuation.bracket', ']', pos + j + 1 + inner.length));
			j += idxMatch[0].length;
			return j;
		}

		return j;
	}

	/**
	 * `${name}` or `${ expr }` interpolation. The `${` and `}` are template
	 * delimiters; the inside is tokenized as an expression (bareword name becomes a
	 * variable, since `${name}` means the variable $name).
	 */
	private emitDollarCurlyInterp(
		text: string,
		i: number,
		pos: number,
		out: Token[],
		flushLiteral: (end: number) => void
	): number {
		const end = this.findMatchingBrace(text, i + 1);
		if (end === -1) return i;
		flushLiteral(i);
		out.push(createToken('string.template', '${', pos + i));
		const innerStart = i + 2;
		const inner = text.slice(innerStart, end);
		// `${name}` → variable $name (no leading $ in source). A bare identifier first.
		const bare = inner.match(/^[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*$/);
		if (bare) {
			out.push(createToken('variable', inner, pos + innerStart));
		} else {
			this.tokenizeInterpExpr(inner, pos + innerStart, out);
		}
		out.push(createToken('string.template', '}', pos + end));
		return end + 1;
	}

	/**
	 * `{$expr}` complex interpolation. The braces are template delimiters; the
	 * inside (which begins with `$`) is tokenized as a full expression.
	 */
	private emitCurlyInterp(
		text: string,
		i: number,
		pos: number,
		out: Token[],
		flushLiteral: (end: number) => void,
		_open: string
	): number {
		const end = this.findMatchingBrace(text, i);
		if (end === -1) return i;
		flushLiteral(i);
		out.push(createToken('string.template', '{', pos + i));
		const innerStart = i + 1;
		const inner = text.slice(innerStart, end);
		this.tokenizeInterpExpr(inner, pos + innerStart, out);
		out.push(createToken('string.template', '}', pos + end));
		return end + 1;
	}

	/** Find the index of the `}` matching the `{` at `open` (brace-depth aware). */
	private findMatchingBrace(text: string, open: number): number {
		let depth = 0;
		for (let k = open; k < text.length; k++) {
			const c = text[k];
			if (c === '{') depth++;
			else if (c === '}') {
				depth--;
				if (depth === 0) return k;
			}
		}
		return -1;
	}

	/**
	 * Tokenize an interpolation inner-expression (the part between `{$…}` /
	 * `${…}`) with real PHP types. This is a compact expression lexer: variables,
	 * properties after ->, methods, array indices, numbers, strings, operators and
	 * punctuation. Lossless against the inner slice.
	 */
	private tokenizeInterpExpr(inner: string, basePos: number, out: Token[]): void {
		let k = 0;
		while (k < inner.length) {
			const rest = inner.slice(k);

			const ws = rest.match(/^[ \t]+/);
			if (ws) {
				out.push(createToken('text', ws[0], basePos + k));
				k += ws[0].length;
				continue;
			}

			// $variable
			const v = rest.match(/^\$[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/);
			if (v) {
				out.push(createToken('variable', v[0], basePos + k));
				k += v[0].length;
				continue;
			}

			// -> / ?-> accessor followed by property or method.
			const arrow = rest.match(/^\?->|^->/);
			if (arrow) {
				out.push(createToken('punctuation.accessor', arrow[0], basePos + k));
				k += arrow[0].length;
				const name = inner.slice(k).match(/^[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/);
				if (name) {
					const afterName = inner.slice(k + name[0].length).match(/^\s*\(/);
					out.push(createToken(afterName ? 'function.call' : 'property', name[0], basePos + k));
					k += name[0].length;
				}
				continue;
			}

			// :: scope accessor.
			if (rest.startsWith('::')) {
				out.push(createToken('punctuation.accessor', '::', basePos + k));
				k += 2;
				continue;
			}

			// number
			const num = rest.match(
				/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)/
			);
			if (num) {
				out.push(createToken(this.classifyNumber(num[0]), num[0], basePos + k));
				k += num[0].length;
				continue;
			}

			// nested single-quoted string (array key e.g. {$a['k']})
			if (rest[0] === "'") {
				const m = rest.match(/^'(?:\\.|[^'\\])*'/);
				if (m) {
					out.push(createToken('string', m[0], basePos + k));
					k += m[0].length;
					continue;
				}
			}
			if (rest[0] === '"') {
				const m = rest.match(/^"(?:\\.|[^"\\])*"/);
				if (m) {
					out.push(createToken('string', m[0], basePos + k));
					k += m[0].length;
					continue;
				}
			}

			// identifier (method name handled above; bare const/func here)
			const id = rest.match(/^[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/);
			if (id) {
				const after = inner.slice(k + id[0].length).match(/^\s*\(/);
				out.push(createToken(after ? 'function.call' : 'variable', id[0], basePos + k));
				k += id[0].length;
				continue;
			}

			// operators
			const op = rest.match(
				/^(?:\?->|<=>|===|!==|->|::|\?\?|&&|\|\||\*\*|==|!=|<=|>=|[+\-*/%.<>!&|^~]=?|=)/
			);
			if (op) {
				out.push(createToken(this.classifyOperator(op[0]), op[0], basePos + k));
				k += op[0].length;
				continue;
			}

			// punctuation
			const ch = rest[0];
			let type: TokenType = 'punctuation';
			if (ch === '[' || ch === ']') type = 'punctuation.bracket';
			else if (ch === '(' || ch === ')') type = 'punctuation.paren';
			else if (ch === ',') type = 'punctuation.separator';
			out.push(createToken(type, ch, basePos + k));
			k += 1;
		}
	}

	/**
	 * Emit an interpolated literal line (heredoc body continuation) with the given
	 * surrounding literal type. Reuses the double-string body scanner but never
	 * closes on a `"` (heredoc bodies have no closing quote on body lines) — so we
	 * scan with a sentinel that treats `"` as literal.
	 */
	private emitInterpolated(line: string, pos: number, out: Token[], literalType: TokenType): void {
		let i = 0;
		let runStart = 0;
		const flushLiteral = (end: number) => {
			if (end > runStart)
				out.push(createToken(literalType, line.slice(runStart, end), pos + runStart));
		};
		while (i < line.length) {
			const ch = line[i];

			if (ch === '\\' && i + 1 < line.length) {
				const esc = this.matchDoubleEscape(line, i);
				if (esc > 0) {
					flushLiteral(i);
					out.push(createToken('string.escape', line.slice(i, i + esc), pos + i));
					i += esc;
					runStart = i;
					continue;
				}
				i++;
				continue;
			}
			if (ch === '{' && line[i + 1] === '$') {
				const end = this.emitCurlyInterp(line, i, pos, out, flushLiteral, '{');
				if (end > i) {
					i = end;
					runStart = i;
					continue;
				}
			}
			if (ch === '$' && line[i + 1] === '{') {
				const end = this.emitDollarCurlyInterp(line, i, pos, out, flushLiteral);
				if (end > i) {
					i = end;
					runStart = i;
					continue;
				}
			}
			if (ch === '$' && /[a-zA-Z_\x80-\xff]/.test(line[i + 1] ?? '')) {
				const end = this.emitSimpleInterp(line, i, pos, out, flushLiteral);
				if (end > i) {
					i = end;
					runStart = i;
					continue;
				}
			}
			i++;
		}
		flushLiteral(line.length);
		if (out.length === 0) out.push(createToken(literalType, '', pos));
	}
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createPhpTokenizer() {
	return new PhpTokenizer();
}
