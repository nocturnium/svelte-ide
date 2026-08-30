/**
 * Ruby tokenizer
 *
 * Design notes / closed caveats:
 * - Interpolation is SUB-TOKENIZED. `#{...}` (and the `#@ivar` / `#$gvar` short
 *   forms) inside double-quoted strings, interpolating heredocs, `%Q`/`%W`/`%I`/
 *   bare `%(...)` literals, `%r`/`/.../` regexes, and backtick command strings is
 *   split into: the literal run as `string` (or `string.regex`), `\` escapes as
 *   `string.escape`, the `#{` / `}` delimiters as `string.template`, and the inner
 *   expression tokenized with real types (variable, number, operator, function.call,
 *   punctuation, ...). Every scanner stays byte-for-byte lossless.
 * - Number subtypes: number.hex / number.binary / number.float / number.integer,
 *   including octal (`0o`/`0NN`), rational (`r`) and imaginary (`i`) suffixes.
 * - `?c` character literals, `$global` / `$1` / `$~` special globals, the
 *   regex-vs-division heuristic, multi-line `%`-literals and regexes, and
 *   `__END__` / `DATA` switching are all handled.
 * - Multi-line threading: =begin/=end block comments, heredoc bodies (interpolating
 *   and raw), unterminated interpolating strings, unterminated %-literals, and
 *   unterminated regexes are threaded via state.
 *
 * Inherent limit of a zero-dependency LINE tokenizer: interpolation whose `#{...}`
 * spans multiple physical lines is threaded as raw string content on the
 * continuation lines (the brace expression is not re-entered across the newline),
 * which is rare in idiomatic Ruby and never loses bytes.
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Ruby keywords (all reserved words)
const keywords = new Set([
	'__ENCODING__',
	'__LINE__',
	'__FILE__',
	'BEGIN',
	'END',
	'alias',
	'and',
	'begin',
	'break',
	'case',
	'class',
	'def',
	'defined?',
	'do',
	'else',
	'elsif',
	'end',
	'ensure',
	'false',
	'for',
	'if',
	'in',
	'module',
	'next',
	'nil',
	'not',
	'or',
	'redo',
	'rescue',
	'retry',
	'return',
	'self',
	'super',
	'then',
	'true',
	'undef',
	'unless',
	'until',
	'when',
	'while',
	'yield'
]);

const controlKeywords = new Set([
	'if',
	'elsif',
	'else',
	'unless',
	'case',
	'when',
	'while',
	'until',
	'for',
	'break',
	'next',
	'redo',
	'retry',
	'return',
	'yield',
	'begin',
	'rescue',
	'ensure',
	'raise',
	'then',
	'do',
	'and',
	'or',
	'not',
	'in'
]);

const definitionKeywords = new Set(['def', 'class', 'module']);

const moduleKeywords = new Set([
	'require',
	'require_relative',
	'load',
	'include',
	'extend',
	'prepend',
	'using',
	'autoload'
]);

// Visibility / attribute declaration helpers — frequently used like keywords.
const storageKeywords = new Set([
	'attr_accessor',
	'attr_reader',
	'attr_writer',
	'attr',
	'private',
	'public',
	'protected',
	'module_function',
	'private_constant',
	'private_class_method',
	'public_class_method'
]);

const specialKeywords = new Set(['self', 'super', '__method__', 'defined?']);

// Keywords after which a `/` opens a regex (a value is expected), used to
// disambiguate `when /x/` and `return /x/` from division.
const regexKeywords = new Set([
	'when',
	'and',
	'or',
	'not',
	'if',
	'elsif',
	'unless',
	'while',
	'until',
	'return',
	'case',
	'then',
	'in',
	'do',
	'begin',
	'yield',
	'puts',
	'print',
	'p',
	'match',
	'gsub',
	'sub',
	'scan',
	'split',
	'grep'
]);

const builtinFunctions = new Set([
	'puts',
	'print',
	'p',
	'pp',
	'gets',
	'require',
	'require_relative',
	'lambda',
	'proc',
	'loop',
	'catch',
	'throw',
	'sleep',
	'format',
	'sprintf',
	'printf',
	'freeze',
	'frozen?',
	'dup',
	'clone',
	'tap',
	'then',
	'send',
	'__send__',
	'respond_to?',
	'instance_variable_get',
	'instance_variable_set',
	'raise',
	'fail'
]);

interface RubyTokenizerState extends TokenizerState {
	/** Inside a =begin / =end block comment. */
	inBlockComment?: boolean;
	/** Active heredoc terminator (e.g. "SQL"); set while scanning a heredoc body. */
	heredocTerminator?: string;
	/** Whether the active heredoc is squiggly/dash (~ or -) and so allows indented terminators. */
	heredocIndented?: boolean;
	/** Whether the active heredoc interpolates (`<<~X`/`<<"X"`) vs raw (`<<'X'`). */
	heredocInterpolates?: boolean;
	/** An open multi-line string/regex/percent literal continued from a prior line. */
	openLiteral?: OpenLiteral;
	/** Past a __END__ / =begin DATA boundary: the rest of the file is the DATA section. */
	inDataSection?: boolean;
}

/** Describes an unterminated literal continued onto the next line. */
interface OpenLiteral {
	/** What ends it. For quotes/backtick: the single delimiter char. */
	closer: string;
	/** Opening char for nesting-aware percent literals (only when nestable). */
	opener?: string;
	/** Base token type for literal runs (string | string.regex). */
	type: TokenType;
	/** Whether `#{}` interpolation is active in this literal. */
	interpolates: boolean;
	/** Whether trailing regex flag letters should be consumed after the closer. */
	regexFlags?: boolean;
	/** Open nesting depth carried across lines for nestable percent literals. */
	depth?: number;
}

/**
 * "This literal has no closing delimiter — run to the end of the line", for a
 * heredoc body and anything else whose end is not a character.
 *
 * The empty string, rather than the NUL escape it replaces. It is self-guarding —
 * `closer` is compared against a single character, which can never equal an empty
 * string — and it cannot be rendered into a literal NUL byte by the build. That
 * was not hypothetical: the published `dist/` carried real NUL bytes in this file,
 * which made it `data` to file(1), unreadable to grep and binary in a diff, while
 * `src/` stayed clean and the hygiene test guarding `src/` saw nothing.
 */
const NO_CLOSER = '';

export class RubyTokenizer {
	language = 'ruby';

	getInitialState(): RubyTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: RubyTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: RubyTokenizerState = { ...prevState };

		// Once past __END__, every remaining line is verbatim DATA content.
		if (state.inDataSection) {
			tokens.push(createToken('comment.block', line, 0));
			return { lineNumber, tokens, text: line, state };
		}

		// Resume an open =begin / =end block comment.
		if (state.inBlockComment) {
			tokens.push(createToken('comment.block', line, 0));
			if (/^=end\b/.test(line)) {
				state.inBlockComment = false;
			}
			return { lineNumber, tokens, text: line, state };
		}

		// Resume an open heredoc body.
		if (state.heredocTerminator) {
			const term = state.heredocTerminator;
			const terminatorRe = state.heredocIndented
				? new RegExp('^\\s*' + escapeRegExp(term) + '\\s*$')
				: new RegExp('^' + escapeRegExp(term) + '\\s*$');
			if (terminatorRe.test(line)) {
				state.heredocTerminator = undefined;
				state.heredocIndented = undefined;
				state.heredocInterpolates = undefined;
				// The terminator line itself is part of the heredoc literal.
				if (line.length > 0) tokens.push(createToken('string', line, 0));
				else tokens.push(createToken('text', '', 0));
			} else if (state.heredocInterpolates) {
				this.scanLiteralRun(line, 0, NO_CLOSER, 'string', true, tokens, state);
			} else {
				if (line.length > 0) tokens.push(createToken('string', line, 0));
				else tokens.push(createToken('text', '', 0));
			}
			return { lineNumber, tokens, text: line, state };
		}

		// Resume an open multi-line string / regex / percent literal.
		if (state.openLiteral) {
			this.resumeOpenLiteral(line, tokens, state);
			return { lineNumber, tokens, text: line, state };
		}

		// A =begin at the very start of a line opens a block comment.
		if (/^=begin\b/.test(line)) {
			tokens.push(createToken('comment.block', line, 0));
			state.inBlockComment = true;
			return { lineNumber, tokens, text: line, state };
		}

		// `__END__` on its own line starts the trailing DATA section.
		if (/^__END__\s*$/.test(line)) {
			tokens.push(createToken('keyword', '__END__', 0));
			if (line.length > 7) tokens.push(createToken('text', line.slice(7), 7));
			state.inDataSection = true;
			return { lineNumber, tokens, text: line, state };
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const produced = this.getNextToken(remaining, pos, line, state);

			if (produced && produced.length > 0) {
				for (const t of produced) tokens.push(t);
				pos = produced[produced.length - 1].end;
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
		fullLine: string,
		state: RubyTokenizerState
	): Token[] | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return [createToken('text', wsMatch[0], pos)];
		}

		// Line comments
		if (text.startsWith('#')) {
			return [createToken('comment.line', text, pos)];
		}

		// Heredoc openers — best effort. Records the terminator into state so the
		// body lines are consumed as a string until the terminator line.
		const heredocMatch = text.match(/^<<([~-]?)(["'`]?)([A-Za-z_][A-Za-z0-9_]*)\2/);
		if (heredocMatch && this.heredocAllowedHere(fullLine, pos)) {
			const indented = heredocMatch[1] === '~' || heredocMatch[1] === '-';
			const quote = heredocMatch[2];
			state.heredocTerminator = heredocMatch[3];
			state.heredocIndented = indented;
			// Single-quoted terminator => raw (no interpolation); everything else interpolates.
			state.heredocInterpolates = quote !== "'";
			return [createToken('string', heredocMatch[0], pos)];
		}

		// Percent-literals. Word/symbol arrays (%w %i %W %I) and the string-like
		// forms %q %Q %r %x %s with any of the bracket delimiters () [] {} <> or a
		// non-alphanumeric delimiter char. Sub-tokenized when interpolating.
		const percentMatch = text.match(/^%([wiWIqQrxs])([([{<]|[^A-Za-z0-9\s])/);
		if (percentMatch) {
			const letter = percentMatch[1];
			const open = percentMatch[2];
			// %r => regex; %W/%I => interpolating word/symbol arrays; %Q/%x => interpolating strings.
			const type: TokenType = letter === 'r' ? 'string.regex' : 'string';
			const interpolates =
				letter === 'Q' || letter === 'W' || letter === 'I' || letter === 'x' || letter === 'r';
			return this.tokenizePercentLiteral(text, pos, open, type, 2, interpolates, state);
		}
		// Bare `%(...)`, `%[...]`, `%{...}`, `%<...>` (no type letter) is an interpolating %Q string.
		const barePercentMatch = text.match(/^%([([{<])/);
		if (barePercentMatch && this.regexAllowedHere(fullLine, pos)) {
			return this.tokenizePercentLiteral(text, pos, barePercentMatch[1], 'string', 1, true, state);
		}

		// Character literal: ?a, ?\n, ?é — a single-character string value. Only
		// in value position (so `x ? a : b` ternary isn't misread).
		if (text.startsWith('?') && this.regexAllowedHere(fullLine, pos)) {
			const charToken = this.tokenizeCharLiteral(text, pos);
			if (charToken) return charToken;
		}

		// Symbols: :name, :"...", :+ operator symbols
		if (text.startsWith(':') && !text.startsWith('::')) {
			const symbolTokens = this.tokenizeSymbol(text, pos);
			if (symbolTokens) {
				return symbolTokens;
			}
		}

		// Double-quoted strings (interpolation-aware, sub-tokenized)
		if (text.startsWith('"')) {
			return this.tokenizeQuoted(text, pos, '"', true, state);
		}

		// Single-quoted strings (literal, no interpolation, only \\ and \' escapes)
		if (text.startsWith("'")) {
			return this.tokenizeQuoted(text, pos, "'", false, state);
		}

		// Backtick command strings (interpolating)
		if (text.startsWith('`')) {
			return this.tokenizeQuoted(text, pos, '`', true, state);
		}

		// Regex literals: /.../flags. Ambiguous with division, so only treat a `/` as
		// a regex opener in positions where a value (not a binary operator) is expected.
		if (text.startsWith('/') && this.regexAllowedHere(fullLine, pos)) {
			const regexTokens = this.tokenizeRegex(text, pos, state);
			if (regexTokens) {
				return regexTokens;
			}
		}

		// Numbers (with subtypes).
		const numberTokens = this.tokenizeNumber(text, pos);
		if (numberTokens) {
			return numberTokens;
		}

		// Special globals: $stdin, $LOAD_PATH, $1, $~, $!, $&, $`, $', $+, $0, $: etc.
		const globalMatch = text.match(
			/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*|\d+|[~!@&`'+/\\,;.<>*$?:"0]|-[a-zA-Z0-9])/
		);
		if (globalMatch) {
			return [createToken('variable', globalMatch[0], pos)];
		}

		// Instance / class variables: @x, @@x
		const sigilMatch = text.match(/^@@?[a-zA-Z_][a-zA-Z0-9_]*/);
		if (sigilMatch) {
			return [createToken('variable', sigilMatch[0], pos)];
		}

		// Identifiers and keywords (may end with ? or ! — predicate / bang methods)
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*[?!]?/);
		if (identMatch) {
			const word = identMatch[0];
			const afterAccessor = this.precededByMethodAccessor(fullLine, pos);
			const type = this.classifyIdentifier(word, text, word.length, afterAccessor, fullLine, pos);
			return [createToken(type, word, pos)];
		}

		// Operators
		const opMatch = text.match(
			/^(?:<=>|===|\*\*=?|<<=?|>>=?|&&=?|\|\|=?|=~|!~|->|=>|&\.|\.\.\.?|::|[+\-*/%&|^]=?|[<>!=]=?|[~?])/
		);
		if (opMatch) {
			return [createToken('operator', opMatch[0], pos)];
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.;:&|]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';' || char === ':') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			else return [createToken('operator', char, pos)];
			return [createToken(type, char, pos)];
		}

		return [createToken('text', fullLine[pos], pos)];
	}

	/**
	 * True when the character(s) immediately before `pos` form a method-call
	 * accessor (`.` or safe-nav `&.`), so the following name is a method invocation.
	 */
	private precededByMethodAccessor(fullLine: string, pos: number): boolean {
		let i = pos - 1;
		while (i >= 0 && (fullLine[i] === ' ' || fullLine[i] === '\t')) {
			i--;
		}
		if (i < 0 || fullLine[i] !== '.') {
			return false;
		}
		// Reject range operators `..` and `...`.
		if (fullLine[i - 1] === '.') {
			return false;
		}
		return true;
	}

	/**
	 * True when the char immediately before `pos` is a `::` scope resolution, so the
	 * following Capitalized name is a namespaced constant (`Foo::Bar`).
	 */
	private precededByScopeResolution(fullLine: string, pos: number): boolean {
		return pos >= 2 && fullLine[pos - 1] === ':' && fullLine[pos - 2] === ':';
	}

	/**
	 * `<<HEREDOC` is only a heredoc opener in value position. After an identifier or
	 * value, `a << b` is the append/shovel operator. We reuse the regex/value
	 * heuristic but also explicitly reject when a bare `<<` (no quote, lowercase) sits
	 * right after a value — handled by regexAllowedHere returning false there.
	 */
	private heredocAllowedHere(fullLine: string, pos: number): boolean {
		return this.regexAllowedHere(fullLine, pos);
	}

	/**
	 * Heuristic for the classic regex-vs-division ambiguity (also gates `?c`, bare
	 * `%(`, and `<<HEREDOC`). A literal begins only where a *value* is expected.
	 */
	private regexAllowedHere(fullLine: string, pos: number): boolean {
		let i = pos - 1;
		while (i >= 0 && (fullLine[i] === ' ' || fullLine[i] === '\t')) {
			i--;
		}
		if (i < 0) {
			return true; // start of line / only whitespace before
		}
		const ch = fullLine[i];
		// A standalone `?` is the ternary operator (`cond ? x : y`), so a *value* — and
		// hence a literal (`?c` char, regex, ...) — is expected after it. A `?` that is
		// glued to a word (`valid?`) is a predicate method name, i.e. a value, so a
		// following `/` is division. Distinguish by the char before the `?`.
		if (ch === '?' && !/[A-Za-z0-9_]/.test(fullLine[i - 1] ?? '')) {
			return true;
		}
		// A value or closing delimiter before => division / operator, not a literal.
		if (/[A-Za-z0-9_)\]}"'`?]/.test(ch)) {
			const before = fullLine.slice(0, i + 1);
			const wordMatch = before.match(/([A-Za-z_][A-Za-z0-9_]*[?!]?)$/);
			if (wordMatch && regexKeywords.has(wordMatch[1])) {
				return true;
			}
			return false;
		}
		// After (, [, {, comma, operators, etc. => value position => literal allowed.
		return true;
	}

	/** Tokenize a number with a precise subtype, plus a rational/imaginary suffix. */
	private tokenizeNumber(text: string, pos: number): Token[] | null {
		// Hex
		let m = text.match(/^0[xX][0-9a-fA-F_]+/);
		if (m) return this.numberWithSuffix(text, pos, m[0], 'number.hex');
		// Binary
		m = text.match(/^0[bB][01_]+/);
		if (m) return this.numberWithSuffix(text, pos, m[0], 'number.binary');
		// Octal (0o17 or legacy 0NN) — classify as integer (no number.octal subtype).
		m = text.match(/^0[oO][0-7_]+/);
		if (m) return this.numberWithSuffix(text, pos, m[0], 'number.integer');
		m = text.match(/^0[dD][0-9_]+/);
		if (m) return this.numberWithSuffix(text, pos, m[0], 'number.integer');
		// Float: requires a fractional part or exponent.
		m = text.match(/^\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?/);
		if (m) return this.numberWithSuffix(text, pos, m[0], 'number.float');
		m = text.match(/^\d[\d_]*[eE][+-]?\d[\d_]*/);
		if (m) return this.numberWithSuffix(text, pos, m[0], 'number.float');
		// Plain integer (incl. legacy octal like 017 — still an integer value).
		m = text.match(/^\d[\d_]*/);
		if (m) return this.numberWithSuffix(text, pos, m[0], 'number.integer');
		return null;
	}

	/** Attach a trailing rational `r` and/or imaginary `i` suffix to a number token. */
	private numberWithSuffix(text: string, pos: number, body: string, type: TokenType): Token[] {
		const rest = text.slice(body.length);
		// `r` (rational) and/or `i` (imaginary) suffix — but ONLY when the literal
		// actually ends there. `5rescue`, `2in`, `1if` etc. are a number then an
		// identifier/keyword, not a suffix; consuming the leading r/i would swallow
		// part of the next word (and mis-split it). A real suffix is not followed by a
		// further identifier-continuation char.
		const suffix = rest.match(/^(r?i?|i)(?![A-Za-z0-9_])/);
		const suf = suffix ? suffix[0] : '';
		return [createToken(type, body + suf, pos)];
	}

	/** Character literal: ?a ?\n ?\t ?é ?\x41 ?\s — emitted as one string token. */
	private tokenizeCharLiteral(text: string, pos: number): Token[] | null {
		// Escaped form: ?\n, ?\u{...}, ?A, ?\x41, ?\123, ?\C-a, ?\M-a
		const esc = text.match(
			/^\?\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{1,4}|x[0-9a-fA-F]{1,2}|[0-7]{1,3}|[CM]-.|.)/
		);
		if (esc) {
			return [createToken('string', esc[0], pos)];
		}
		// Simple form: ?a — only when the next char is a single word char not followed
		// by another word char (otherwise it's a ternary like `cond ? foo : bar`).
		const simple = text.match(/^\?([A-Za-z0-9_])/);
		if (simple && !/[A-Za-z0-9_]/.test(text[2] ?? '')) {
			return [createToken('string', simple[0], pos)];
		}
		// Non-word single char: ?# ?. ?( etc.
		const nonword = text.match(/^\?([^\sA-Za-z0-9_\\])/);
		if (nonword) {
			return [createToken('string', nonword[0], pos)];
		}
		return null;
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		afterAccessor: boolean,
		fullLine: string,
		pos: number
	): TokenType {
		const afterWordRaw = context.slice(wordLength);

		// Method definition name: `def foo`, `def self.foo`, `def Klass.foo`.
		// Checked first so the accessor in `def self.foo` does not mis-route the name
		// to a call. The receiver itself (`self`/`Klass` before the `.`) is excluded by
		// requiring that the word is NOT immediately followed by a `.` accessor.
		if (!afterWordRaw.trimStart().startsWith('.') && this.precededByDef(fullLine, pos)) {
			return 'function.definition';
		}

		// `name:` label syntax (hash key / keyword arg) => property.
		if (/^:(?![:])/.test(afterWordRaw) && !/^[A-Z]/.test(word)) {
			return 'property';
		}

		// A name right after a method-call accessor (`obj.class`, `x&.then`) is a
		// method, never a reserved word / builtin.
		if (afterAccessor && !/^[A-Z]/.test(word)) {
			return afterWordRaw.startsWith('(') ? 'function.call' : 'property';
		}

		// Boolean / null constants
		if (word === 'true' || word === 'false') return 'constant.boolean';
		if (word === 'nil') return 'constant.null';

		// Special "value" keywords treated as keyword per spec
		if (specialKeywords.has(word) || word === '__method__') {
			return 'keyword';
		}

		// Reserved words
		if (keywords.has(word)) {
			if (definitionKeywords.has(word)) return 'keyword.definition';
			if (controlKeywords.has(word)) return 'keyword.control';
			return 'keyword';
		}

		// Module / mixin directives
		if (moduleKeywords.has(word)) {
			return 'keyword.module';
		}

		// Visibility / attribute declarations
		if (storageKeywords.has(word)) {
			return 'keyword.storage';
		}

		const afterWord = afterWordRaw.trim();

		// Built-in / kernel methods
		if (builtinFunctions.has(word)) {
			if (afterWord.startsWith('(')) {
				return 'function.call';
			}
			return 'function';
		}

		// Constant (CapitalizedName).
		if (/^[A-Z]/.test(word)) {
			// `Foo::Bar` or `Foo::` => namespace; otherwise a class/type-like constant.
			if (afterWordRaw.startsWith('::')) return 'type.namespace';
			if (this.precededByScopeResolution(fullLine, pos)) {
				return afterWordRaw.startsWith('::') ? 'type.namespace' : 'type.class';
			}
			// ALL_CAPS (and not followed by `(`) reads as a value constant.
			if (/^[A-Z][A-Z0-9_]*$/.test(word) && !afterWordRaw.startsWith('(')) {
				return 'constant';
			}
			return 'type.class';
		}

		// identifier immediately followed by ( => call
		if (afterWordRaw.startsWith('(')) {
			return 'function.call';
		}

		return 'variable';
	}

	/** True when `def` (optionally `def self.`) immediately precedes the name at pos. */
	private precededByDef(fullLine: string, pos: number): boolean {
		const before = fullLine.slice(0, pos);
		// `def name`, `def self.name`, `def Klass.name`
		return /\bdef\s+(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)?$/.test(before);
	}

	/**
	 * Symbol literal: :name, :"interp", :+ etc. Returns the token list, or null.
	 * `:"..."` interpolating symbols are sub-tokenized like a double-quoted string.
	 */
	private tokenizeSymbol(text: string, pos: number): Token[] | null {
		// Quoted symbol :"..." or :'...'
		const quoted = text.match(/^:(["'])/);
		if (quoted) {
			const delim = quoted[1];
			const interp = delim === '"';
			// Emit the leading `:` as part of the constant, then scan the quoted body.
			// We render the whole thing (delimiters included) as constant.builtin when
			// non-interpolating; when interpolating we sub-tokenize the inner expr.
			if (!interp) {
				let i = 2;
				while (i < text.length) {
					if (text[i] === '\\' && i + 1 < text.length) {
						i += 2;
						continue;
					}
					if (text[i] === delim) {
						return [createToken('constant.builtin', text.slice(0, i + 1), pos)];
					}
					i++;
				}
				return [createToken('constant.builtin', text.slice(0, i), pos)];
			}
			// Interpolating :"...": leading `:"` as constant.builtin, then sub-tokenize.
			const tokens: Token[] = [createToken('constant.builtin', ':', pos)];
			const strTokens = this.tokenizeQuoted(text.slice(1), pos + 1, '"', true);
			for (const t of strTokens) tokens.push(t);
			return tokens;
		}

		// Plain symbol :name (optionally predicate/bang/setter)
		const plain = text.match(/^:[a-zA-Z_][a-zA-Z0-9_]*[?!=]?/);
		if (plain) {
			return [createToken('constant.builtin', plain[0], pos)];
		}

		// Operator symbols like :+ :<< :[] :==
		const opSym = text.match(/^:(?:\[\]=?|<=>|===|==|<<|>>|[+\-*/%<>!~^&|]=?)/);
		if (opSym) {
			return [createToken('constant.builtin', opSym[0], pos)];
		}

		return null;
	}

	/**
	 * Tokenize a quoted literal (`"`, `` ` ``, or `'`) into multiple tokens: the
	 * delimiters and literal runs as `string`, `\` escapes as `string.escape`, and
	 * `#{...}` / `#@x` / `#$x` interpolation sub-tokenized when `interpolates`. If the
	 * literal does not close on this line and it interpolates, an openLiteral is
	 * recorded so the next line continues it.
	 */
	private tokenizeQuoted(
		text: string,
		pos: number,
		delim: string,
		interpolates: boolean,
		state?: RubyTokenizerState
	): Token[] {
		const tokens: Token[] = [];
		// Opening delimiter.
		tokens.push(createToken('string', delim, pos));
		const closed = this.scanLiteralRun(
			text,
			1,
			delim,
			'string',
			interpolates,
			tokens,
			state ?? {},
			pos
		);
		if (!closed && interpolates && state) {
			state.openLiteral = { closer: delim, type: 'string', interpolates: true };
		}
		return tokens;
	}

	/**
	 * Scan a literal body starting at index `start` in `text`, pushing tokens for
	 * literal runs (`baseType`), `\` escapes (`string.escape`), and `#{}`/`#@`/`#$`
	 * interpolation. `closer` is the single closing delimiter char; pass
	 * {@link NO_CLOSER} for "no closer — whole line", e.g. a heredoc body. Returns
	 * true if the closer was consumed on this line. `basePos` is the absolute
	 * column of index 0 of `text`.
	 */
	private scanLiteralRun(
		text: string,
		start: number,
		closer: string,
		baseType: TokenType,
		interpolates: boolean,
		tokens: Token[],
		state: RubyTokenizerState,
		basePos = 0
	): boolean {
		let i = start;
		let runStart = start;
		const flushRun = (end: number) => {
			if (end > runStart) {
				tokens.push(createToken(baseType, text.slice(runStart, end), basePos + runStart));
			}
		};
		while (i < text.length) {
			const c = text[i];
			// Backslash escape.
			if (c === '\\' && i + 1 < text.length) {
				flushRun(i);
				const escLen = this.escapeLength(text, i);
				tokens.push(createToken('string.escape', text.slice(i, i + escLen), basePos + i));
				i += escLen;
				runStart = i;
				continue;
			}
			// Interpolation.
			if (interpolates && c === '#' && text[i + 1] === '{') {
				flushRun(i);
				i = this.emitInterpolation(text, i, basePos, tokens);
				runStart = i;
				continue;
			}
			if (interpolates && c === '#' && (text[i + 1] === '@' || text[i + 1] === '$')) {
				// Short interpolation: #@ivar, #@@cvar, #$global.
				const short = text.slice(i + 1).match(/^(?:@@?|\$)[a-zA-Z_][a-zA-Z0-9_]*/);
				if (short) {
					flushRun(i);
					tokens.push(createToken('string.template', '#', basePos + i));
					tokens.push(createToken('variable', short[0], basePos + i + 1));
					i += 1 + short[0].length;
					runStart = i;
					continue;
				}
			}
			// Closer.
			if (closer !== NO_CLOSER && c === closer) {
				flushRun(i);
				tokens.push(createToken(baseType, c, basePos + i));
				return true;
			}
			i++;
		}
		flushRun(i);
		return false;
	}

	/**
	 * Emit a `#{ expr }` interpolation block: `#{` and the matching `}` as
	 * string.template, and the inner expression tokenized with real token types.
	 * Tracks brace nesting so a `}` inside the expression doesn't close early.
	 * Returns the index just past the closing `}` (or end of line if unterminated).
	 */
	private emitInterpolation(
		text: string,
		hashPos: number,
		basePos: number,
		tokens: Token[]
	): number {
		tokens.push(createToken('string.template', '#{', basePos + hashPos));
		let i = hashPos + 2;
		let depth = 1;
		const exprStart = i;
		// Find the matching close brace, respecting nested braces and inner strings.
		while (i < text.length) {
			const c = text[i];
			if (c === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (c === '"' || c === "'") {
				i = this.skipInnerString(text, i, c);
				continue;
			}
			if (c === '{') {
				depth++;
			} else if (c === '}') {
				depth--;
				if (depth === 0) break;
			}
			i++;
		}
		const exprEnd = i; // index of the closing `}` (or text.length if unterminated)
		const inner = text.slice(exprStart, exprEnd);
		this.tokenizeExpression(inner, basePos + exprStart, tokens);
		if (i < text.length) {
			tokens.push(createToken('string.template', '}', basePos + exprEnd));
			return exprEnd + 1;
		}
		return exprEnd;
	}

	/** Skip over a nested quoted string inside interpolation; returns index past it. */
	private skipInnerString(text: string, start: number, delim: string): number {
		let i = start + 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === delim) return i + 1;
			i++;
		}
		return i;
	}

	/**
	 * Tokenize an interpolation expression with the real Ruby vocabulary. Reuses
	 * getNextToken so the inner expr gets variable / number / operator / function.call
	 * / property / punctuation types. Falls back char-by-char to stay lossless.
	 */
	private tokenizeExpression(expr: string, basePos: number, tokens: Token[]): void {
		let pos = 0;
		const localState: RubyTokenizerState = {};
		while (pos < expr.length) {
			const remaining = expr.slice(pos);
			const produced = this.getNextToken(remaining, pos, expr, localState);
			if (produced && produced.length > 0) {
				for (const t of produced) {
					tokens.push(createToken(t.type, t.text, basePos + t.start));
				}
				pos = produced[produced.length - 1].end;
			} else {
				tokens.push(createToken('text', expr[pos], basePos + pos));
				pos += 1;
			}
		}
	}

	/** Length of a backslash escape starting at index i (the `\`). At least 2. */
	private escapeLength(text: string, i: number): number {
		const n = text[i + 1];
		if (n === 'u') {
			if (text[i + 2] === '{') {
				let j = i + 3;
				while (j < text.length && text[j] !== '}') j++;
				return Math.min(j + 1, text.length) - i;
			}
			let j = i + 2;
			let count = 0;
			while (j < text.length && count < 4 && /[0-9a-fA-F]/.test(text[j])) {
				j++;
				count++;
			}
			return j - i;
		}
		if (n === 'x') {
			let j = i + 2;
			let count = 0;
			while (j < text.length && count < 2 && /[0-9a-fA-F]/.test(text[j])) {
				j++;
				count++;
			}
			return j - i;
		}
		if (n >= '0' && n <= '7') {
			let j = i + 1;
			let count = 0;
			while (j < text.length && count < 3 && text[j] >= '0' && text[j] <= '7') {
				j++;
				count++;
			}
			return j - i;
		}
		return 2;
	}

	/**
	 * Tokenize a `/.../flags` regex literal: delimiters/literal as string.regex,
	 * escapes as string.escape, `#{}` interpolation sub-tokenized. Threads to the
	 * next line if unterminated.
	 */
	private tokenizeRegex(text: string, pos: number, state: RubyTokenizerState): Token[] | null {
		const tokens: Token[] = [createToken('string.regex', '/', pos)];
		const closed = this.scanRegexBody(text, 1, '/', tokens, pos, state);
		if (!closed) {
			state.openLiteral = {
				closer: '/',
				type: 'string.regex',
				interpolates: true,
				regexFlags: true
			};
		}
		return tokens;
	}

	/**
	 * Scan a regex body. Character classes `[...]` are tracked so a `/` inside them is
	 * literal. Escapes -> string.escape, `#{}` -> interpolation. On close, consume
	 * trailing flag letters. Returns true if closed on this line.
	 */
	private scanRegexBody(
		text: string,
		start: number,
		closer: string,
		tokens: Token[],
		basePos: number,
		_state: RubyTokenizerState
	): boolean {
		let i = start;
		let runStart = start;
		let inClass = false;
		const flushRun = (end: number) => {
			if (end > runStart)
				tokens.push(createToken('string.regex', text.slice(runStart, end), basePos + runStart));
		};
		while (i < text.length) {
			const c = text[i];
			if (c === '\\' && i + 1 < text.length) {
				flushRun(i);
				tokens.push(createToken('string.escape', text.slice(i, i + 2), basePos + i));
				i += 2;
				runStart = i;
				continue;
			}
			if (c === '#' && text[i + 1] === '{') {
				flushRun(i);
				i = this.emitInterpolation(text, i, basePos, tokens);
				runStart = i;
				continue;
			}
			if (c === '[') inClass = true;
			else if (c === ']') inClass = false;
			else if (c === closer && !inClass) {
				flushRun(i);
				// Closing delimiter + flags.
				let j = i + 1;
				while (j < text.length && /[a-z]/.test(text[j])) j++;
				tokens.push(createToken('string.regex', text.slice(i, j), basePos + i));
				return true;
			}
			i++;
		}
		flushRun(i);
		return false;
	}

	/**
	 * Percent-literals: %w[...] %i[...] %q{...} %Q<...> %r{...} %x(...) and bare
	 * %(...). Delimiter-balanced; sub-tokenized for interpolation when `interpolates`.
	 * `bodyOffset` is the count of chars before the body (2 for `%X`, 1 for bare `%`).
	 */
	private tokenizePercentLiteral(
		text: string,
		pos: number,
		open: string,
		type: TokenType,
		bodyOffset: number,
		interpolates: boolean,
		state?: RubyTokenizerState
	): Token[] {
		const close =
			open === '(' ? ')' : open === '[' ? ']' : open === '{' ? '}' : open === '<' ? '>' : open;
		// Emit the `%X<open>` (or `%<open>`) prefix as a literal token.
		const prefix = text.slice(0, bodyOffset + 1);
		const tokens: Token[] = [createToken(type, prefix, pos)];
		const ref = { depth: 1 };
		const closed = this.scanPercentBody(
			text,
			bodyOffset + 1,
			open,
			close,
			type,
			interpolates,
			1,
			tokens,
			pos,
			ref
		);
		// Unterminated on this line — thread the literal onto the next line so the
		// body (and any `#` in it) is not mis-tokenized as code / a line comment.
		// Carry the surviving nesting depth so a nestable literal balances correctly.
		if (!closed && state) {
			state.openLiteral = {
				closer: close,
				opener: open !== close ? open : undefined,
				type: type === 'string.regex' ? 'string.regex' : 'string',
				interpolates,
				regexFlags: type === 'string.regex',
				depth: ref.depth
			};
		}
		return tokens;
	}

	/**
	 * Scan the body of a percent literal (delimiter-balanced) starting at index
	 * `start`, beginning at nesting `depth`. Pushes literal runs / escapes /
	 * interpolation tokens. On close, consumes the closer (plus regex flags for a
	 * `string.regex`). Returns true if the literal closed on this line; otherwise the
	 * caller threads it via openLiteral. `depthRef` carries the surviving depth back.
	 */
	private scanPercentBody(
		text: string,
		start: number,
		open: string,
		close: string,
		type: TokenType,
		interpolates: boolean,
		depth: number,
		tokens: Token[],
		basePos: number,
		depthRef?: { depth: number }
	): boolean {
		const nestable = open !== close;
		const baseType: TokenType = type === 'string.regex' ? 'string.regex' : 'string';
		let i = start;
		let runStart = start;
		const flushRun = (end: number) => {
			if (end > runStart)
				tokens.push(createToken(baseType, text.slice(runStart, end), basePos + runStart));
		};
		while (i < text.length) {
			const c = text[i];
			if (c === '\\' && i + 1 < text.length) {
				flushRun(i);
				tokens.push(createToken('string.escape', text.slice(i, i + 2), basePos + i));
				i += 2;
				runStart = i;
				continue;
			}
			if (interpolates && c === '#' && text[i + 1] === '{') {
				flushRun(i);
				i = this.emitInterpolation(text, i, basePos, tokens);
				runStart = i;
				continue;
			}
			if (nestable && c === open) {
				depth++;
			} else if (c === close) {
				depth--;
				if (depth === 0) {
					flushRun(i);
					let j = i + 1;
					if (type === 'string.regex') {
						while (j < text.length && /[a-z]/.test(text[j])) j++;
					}
					tokens.push(createToken(baseType, text.slice(i, j), basePos + i));
					if (depthRef) depthRef.depth = 0;
					return true;
				}
			}
			i++;
		}
		flushRun(i);
		if (depthRef) depthRef.depth = depth;
		return false;
	}

	/** Resume an open multi-line string/regex/percent literal on a fresh line. */
	private resumeOpenLiteral(line: string, tokens: Token[], state: RubyTokenizerState): void {
		const lit = state.openLiteral!;
		// Percent literals (`%Q{}`, `%r()`, `%w[]`, bare `%()`, ...) carry a `depth`.
		// They are delimiter-balanced, so resume them with the depth-aware scanner —
		// reusing scanRegexBody/scanLiteralRun would mis-handle nested delimiters and
		// (worse) re-treat a `#` on a continuation line as a line comment.
		if (lit.depth !== undefined) {
			const ref = { depth: lit.depth };
			const closed = this.scanPercentBody(
				line,
				0,
				lit.opener ?? lit.closer,
				lit.closer,
				lit.type,
				lit.interpolates,
				lit.depth,
				tokens,
				0,
				ref
			);
			if (closed) state.openLiteral = undefined;
			else lit.depth = ref.depth;
		} else if (lit.type === 'string.regex') {
			const closed = this.scanRegexBody(line, 0, lit.closer, tokens, 0, state);
			if (closed) state.openLiteral = undefined;
		} else {
			const closed = this.scanLiteralRun(
				line,
				0,
				lit.closer,
				'string',
				lit.interpolates,
				tokens,
				state,
				0
			);
			if (closed) state.openLiteral = undefined;
		}
		if (tokens.length === 0) tokens.push(createToken('text', '', 0));
	}
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createRubyTokenizer() {
	return new RubyTokenizer();
}
