/**
 * Shell / Bash tokenizer
 *
 * Design notes / capabilities (closed limitations):
 *  - INTERPOLATION is sub-tokenized: inside double-quoted strings, `$name`,
 *    `${...}`, `$(...)` and `` `...` `` are emitted with real inner types
 *    (variable, operator, punctuation, number, function.call, ...) rather than
 *    being swallowed into one opaque string token. The surrounding literal runs
 *    stay `string.template`, and the whole thing is byte-for-byte lossless.
 *  - STRING ESCAPES emit `string.escape` (\n \t \" \\ \$ \` inside double quotes;
 *    the full ANSI-C escape set inside $'...').
 *  - NUMBER SUBTYPES: 0xFF -> number.hex, 2#1010 / 16#ff arithmetic bases ->
 *    number.binary / number.hex, 1.5 -> number.float, bare runs -> number.integer.
 *  - PARAMETER EXPANSION `${...}` is sub-tokenized: braces as punctuation.brace,
 *    the name as variable, the operator (:- := :? :+ # ## % %% / //) as operator,
 *    array subscripts as punctuation.bracket.
 *  - MULTI-LINE THREADING: heredoc bodies, AND unterminated double/single/ANSI-C
 *    strings, AND `$(...)`/`${...}`/backtick substitutions, AND backslash line
 *    continuations are all threaded across lines via state.
 *  - OPERATOR SUBTYPES: logical (&& ||), comparison (== != =~ < > <= >=),
 *    assignment (= += -= etc.), arithmetic (+ - * / % ** << >> & | ^).
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Control-flow keywords
const controlKeywords = new Set([
	'if',
	'then',
	'elif',
	'else',
	'fi',
	'for',
	'select',
	'while',
	'until',
	'do',
	'done',
	'case',
	'esac',
	'in',
	'function',
	'time',
	'coproc'
]);

// Shell builtins (commands)
const builtins = new Set([
	'echo',
	'cd',
	'pwd',
	'read',
	'printf',
	'export',
	'local',
	'declare',
	'readonly',
	'set',
	'unset',
	'source',
	'eval',
	'exec',
	'return',
	'exit',
	'shift',
	'trap',
	'test',
	'getopts',
	'alias',
	'unalias',
	'jobs',
	'kill',
	'wait',
	'umask',
	'type',
	'hash',
	'command',
	'builtin',
	'history',
	'bg',
	'fg',
	'let',
	'mapfile',
	'readarray'
]);

// Test operators used inside [ ... ] / [[ ... ]]
const testOperators = new Set([
	'-eq',
	'-ne',
	'-lt',
	'-le',
	'-gt',
	'-ge',
	'-z',
	'-n',
	'-f',
	'-d',
	'-e',
	'-r',
	'-w',
	'-x',
	'-s',
	'-L',
	'-h',
	'-a',
	'-o'
]);

/** A continuation describes a multi-line construct whose body is still open. */
type OpenContext =
	| { kind: 'double' } // unterminated "..."
	| { kind: 'single' } // unterminated '...'
	| { kind: 'ansic' }; // unterminated $'...'

interface ShellTokenizerState extends TokenizerState {
	/** Threaded heredoc body. */
	inHeredoc?: boolean;
	/** The heredoc terminator word (without leading <<, <<- markers). */
	heredocDelimiter?: string;
	/** Whether the heredoc was <<- (leading-tab stripping); affects terminator match. */
	heredocStripTabs?: boolean;
	/** Whether the heredoc body is quoted (no expansion); kept for completeness. */
	heredocQuoted?: boolean;
	/** An unterminated quote/string spanning into the next line. */
	openQuote?: OpenContext['kind'];
}

export class ShellTokenizer {
	language = 'shell';

	getInitialState(): ShellTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: ShellTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		const state: ShellTokenizerState = { ...prevState };

		// Resume an in-progress heredoc body. The whole line is part of the body
		// unless it is the (optionally tab-indented) terminator line.
		if (state.inHeredoc) {
			const delimiter = state.heredocDelimiter ?? '';
			const candidate = state.heredocStripTabs ? line.replace(/^\t+/, '') : line;
			if (candidate === delimiter) {
				state.inHeredoc = false;
				state.heredocDelimiter = undefined;
				state.heredocStripTabs = undefined;
				state.heredocQuoted = undefined;
				const indentLen = line.length - candidate.length;
				if (indentLen > 0) {
					tokens.push(createToken('text', line.slice(0, indentLen), 0));
				}
				tokens.push(createToken('keyword', delimiter, indentLen));
				return { lineNumber, tokens, text: line, state };
			}
			// Unquoted heredoc bodies DO expand $var / $(...) — sub-tokenize them so
			// interpolation is visible; quoted heredocs are literal.
			if (state.heredocQuoted) {
				tokens.push(createToken('string', line, 0));
			} else {
				this.emitInterpolatedRun(line, 0, line.length, 0, tokens, 'string');
			}
			return { lineNumber, tokens, text: line, state };
		}

		// Resume an unterminated string that opened on a previous line.
		let pos = 0;
		if (state.openQuote) {
			pos = this.resumeOpenQuote(line, state, tokens);
		}

		while (pos < line.length) {
			const next = this.getNextToken(line, pos, state, tokens);
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
	 * Consume the next construct starting at `pos`, pushing one or more tokens onto
	 * `tokens`, and return the new position. Returns `pos` unchanged if nothing
	 * matched (caller emits a single fallback character).
	 */
	private getNextToken(
		line: string,
		pos: number,
		state: ShellTokenizerState,
		tokens: Token[]
	): number {
		const text = line.slice(pos);

		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			tokens.push(createToken('text', wsMatch[0], pos));
			return pos + wsMatch[0].length;
		}

		// Trailing backslash line continuation: '\' as the final char of the line
		// continues the logical line. Emit it as an escape (the next line is
		// tokenized fresh, which is the correct rendering of a continued line).
		if (text === '\\') {
			tokens.push(createToken('string.escape', '\\', pos));
			return pos + 1;
		}

		// Unquoted backslash escape: '\' protects the next character literally.
		if (text[0] === '\\' && text.length > 1) {
			tokens.push(createToken('string.escape', text.slice(0, 2), pos));
			return pos + 2;
		}

		// Shebang (only meaningful at column 0).
		if (pos === 0 && text.startsWith('#!')) {
			tokens.push(createToken('comment.line', text, pos));
			return line.length;
		}

		// Comments at a word boundary.
		if (text.startsWith('#') && this.isCommentStart(line, pos)) {
			tokens.push(createToken('comment.line', text, pos));
			return line.length;
		}

		// Heredoc operator: <<- or << followed by an optional quote and a word.
		const heredocMatch = text.match(/^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
		if (heredocMatch) {
			const stripTabs = text.startsWith('<<-');
			state.inHeredoc = true;
			state.heredocDelimiter = heredocMatch[2];
			state.heredocStripTabs = stripTabs;
			state.heredocQuoted = heredocMatch[1] !== '';
			tokens.push(createToken('operator', heredocMatch[0], pos));
			return pos + heredocMatch[0].length;
		}

		// Here-string: <<<
		if (text.startsWith('<<<')) {
			tokens.push(createToken('operator', '<<<', pos));
			return pos + 3;
		}

		// ANSI-C quoting: $'...'
		if (text.startsWith("$'")) {
			return this.tokenizeAnsiC(line, pos, state, tokens);
		}

		// Single-quoted strings: literal, no interpolation.
		if (text.startsWith("'")) {
			return this.tokenizeSingleQuote(line, pos, state, tokens);
		}

		// Double-quoted strings: sub-tokenized for interpolation + escapes.
		if (text.startsWith('"')) {
			return this.tokenizeDoubleQuote(line, pos, state, tokens);
		}

		// Variables and substitutions outside quotes: $name, ${...}, $(...), $((...)).
		if (text[0] === '$') {
			const consumed = this.tokenizeDollar(line, pos, tokens);
			if (consumed > pos) {
				return consumed;
			}
		}

		// Backtick command substitution: emit delimiter, sub-tokenize the interior.
		if (text[0] === '`') {
			return this.tokenizeBacktick(line, pos, tokens);
		}

		// Redirection / file-descriptor operators (e.g. 2>&1, >>, &>, >|).
		// A bare '>'/'<' that is immediately followed by '=' is NOT redirection — it
		// is the start of a '>='/'<=' comparison, which must fall through to the
		// comparison matcher below. (A fd-prefixed form like `2>=f` stays a redirect:
		// the `\d+` alternatives are tried first and are not gated by the lookahead.)
		const redirMatch = text.match(
			/^(?:\d*>>|\d*>&\d*|\d*>\||&>>|&>|\d+>|>(?!=)|\d*<&\d*|\d+<|<(?![=>])|<>)/
		);
		if (redirMatch) {
			tokens.push(createToken('operator', redirMatch[0], pos));
			return pos + redirMatch[0].length;
		}

		// Logical control operators: && ||
		const logicalMatch = text.match(/^(?:&&|\|\|)/);
		if (logicalMatch) {
			tokens.push(createToken('operator.logical', logicalMatch[0], pos));
			return pos + logicalMatch[0].length;
		}

		// Other control operators: ;; ;& ;;& |& | & ;
		const ctrlMatch = text.match(/^(?:;;&|;;|;&|\|&|[|&;])/);
		if (ctrlMatch) {
			tokens.push(createToken('operator', ctrlMatch[0], pos));
			return pos + ctrlMatch[0].length;
		}

		// Arithmetic compound-assignment operators: += -= *= /= %= **= etc.
		const compoundAssign = text.match(/^(?:\*\*=|<<=|>>=|[+\-*/%&|^]=)/);
		if (compoundAssign) {
			tokens.push(createToken('operator.assignment', compoundAssign[0], pos));
			return pos + compoundAssign[0].length;
		}

		// Comparison operators within conditionals/arithmetic.
		const cmpMatch = text.match(/^(?:==|!=|=~|<=|>=)/);
		if (cmpMatch) {
			tokens.push(createToken('operator.comparison', cmpMatch[0], pos));
			return pos + cmpMatch[0].length;
		}

		// Assignment / single '='
		if (text[0] === '=') {
			tokens.push(createToken('operator.assignment', '=', pos));
			return pos + 1;
		}

		// Flags: -x, --long-name (best effort: parameter).
		const flagMatch = text.match(/^--?[A-Za-z][A-Za-z0-9-]*/);
		if (flagMatch) {
			const word = flagMatch[0];
			if (testOperators.has(word)) {
				tokens.push(createToken('operator', word, pos));
			} else {
				tokens.push(createToken('variable.parameter', word, pos));
			}
			return pos + word.length;
		}

		// Dash-led options at a word boundary.
		if (text[0] === '-' && this.isWordStart(line, pos)) {
			const endOpts = text.match(/^--(?=[ \t]|$)/);
			if (endOpts) {
				tokens.push(createToken('variable.parameter', '--', pos));
				return pos + 2;
			}
			const numFlag = text.match(/^-\d+/);
			if (numFlag) {
				tokens.push(createToken('variable.parameter', numFlag[0], pos));
				return pos + numFlag[0].length;
			}
		}

		// Numbers (with subtypes). A digit run is only a number when it forms a
		// complete word — if an identifier char glues onto it that is NOT part of a
		// recognised numeric form, the whole run is a single shell word.
		const numConsumed = this.tokenizeNumber(line, pos, tokens);
		if (numConsumed > pos) {
			return numConsumed;
		}

		// Identifiers / words / keywords / builtins.
		const identMatch = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			tokens.push(createToken(this.classifyIdentifier(word, text, word.length), word, pos));
			return pos + word.length;
		}
		const wordMatch = text.match(/^[A-Za-z0-9_]+/);
		if (wordMatch) {
			tokens.push(createToken('variable', wordMatch[0], pos));
			return pos + wordMatch[0].length;
		}

		// Punctuation / brackets / parens / braces.
		const punctMatch = text.match(/^[{}()[\].,:]/);
		if (punctMatch) {
			tokens.push(createToken(this.punctType(punctMatch[0]), punctMatch[0], pos));
			return pos + 1;
		}

		// Arithmetic / glob operators (subtype where the meaning is unambiguous).
		const arithMatch = text.match(/^(?:\*\*|<<|>>|[+\-*/%^])/);
		if (arithMatch) {
			tokens.push(createToken('operator.arithmetic', arithMatch[0], pos));
			return pos + arithMatch[0].length;
		}
		const opMatch = text.match(/^[~!<>?]/);
		if (opMatch) {
			tokens.push(createToken('operator', opMatch[0], pos));
			return pos + 1;
		}

		return pos;
	}

	/** Map a single punctuation char to its precise subtype. */
	private punctType(char: string): TokenType {
		if (char === '{' || char === '}') return 'punctuation.brace';
		if (char === '[' || char === ']') return 'punctuation.bracket';
		if (char === '(' || char === ')') return 'punctuation.paren';
		if (char === ',' || char === ':') return 'punctuation.separator';
		if (char === '.') return 'punctuation.accessor';
		return 'punctuation';
	}

	/** A '#' starts a comment only at a token boundary. */
	private isCommentStart(line: string, pos: number): boolean {
		if (pos === 0) return true;
		const prev = line[pos - 1];
		return prev === ' ' || prev === '\t' || prev === ';' || prev === '&' || prev === '|';
	}

	/** Whether `pos` begins a new shell word. */
	private isWordStart(line: string, pos: number): boolean {
		if (pos === 0) return true;
		const prev = line[pos - 1];
		return (
			prev === ' ' ||
			prev === '\t' ||
			prev === ';' ||
			prev === '&' ||
			prev === '|' ||
			prev === '(' ||
			prev === '{'
		);
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		const afterWord = context.slice(wordLength);
		const nextChar = afterWord[0] ?? '';
		const isCompleteWord = nextChar === '' || /[ \t|&;)<>]/.test(nextChar);

		if (isCompleteWord) {
			if (word === 'true' || word === 'false') {
				return 'constant.boolean';
			}
			if (controlKeywords.has(word)) {
				if (word === 'function') return 'keyword.definition';
				if (word === 'in') return 'keyword.operator';
				return 'keyword.control';
			}
			if (builtins.has(word)) {
				return 'function';
			}
		}

		// Function call: word immediately followed by '('
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// Variable assignment target: NAME=... (but NAME== is a comparison, not an
		// assignment, so require the '=' not be doubled).
		if (afterWord[0] === '=' && afterWord[1] !== '=') {
			return 'variable.definition';
		}

		return 'variable';
	}

	// --------------------------------------------------------------------------
	// Numbers
	// --------------------------------------------------------------------------

	/** Tokenize a numeric literal at `pos`, emitting the precise subtype. */
	private tokenizeNumber(line: string, pos: number, tokens: Token[]): number {
		const text = line.slice(pos);

		// Hex: 0xFF / 0Xff
		const hex = text.match(/^0[xX][0-9A-Fa-f]+/);
		if (hex && this.isNumberWord(text, hex[0].length)) {
			tokens.push(createToken('number.hex', hex[0], pos));
			return pos + hex[0].length;
		}

		// Arithmetic radix: base#digits (e.g. 2#1010, 16#ff, 8#17, 36#zz).
		const radix = text.match(/^(\d+)#([0-9A-Za-z@_]+)/);
		if (radix && this.isNumberWord(text, radix[0].length)) {
			const base = parseInt(radix[1], 10);
			const type: TokenType = base === 2 ? 'number.binary' : base === 16 ? 'number.hex' : 'number';
			tokens.push(createToken(type, radix[0], pos));
			return pos + radix[0].length;
		}

		// Float: 1.5 / 0.25 / 10.  (bash itself is integer-only, but float literals
		// appear in arithmetic-for-bc, printf %f, etc. — emit the precise subtype).
		const float = text.match(/^\d+\.\d+/);
		if (float && this.isNumberWord(text, float[0].length)) {
			tokens.push(createToken('number.float', float[0], pos));
			return pos + float[0].length;
		}

		// Integer: a plain digit run, only when it forms a complete word.
		const int = text.match(/^\d+/);
		if (int && this.isNumberWord(text, int[0].length)) {
			tokens.push(createToken('number.integer', int[0], pos));
			return pos + int[0].length;
		}

		return pos;
	}

	/**
	 * A numeric match is a real number only if the character that follows is not an
	 * identifier char (so `12ab`, `3rd` stay one shell word) — except '.' and '#'
	 * which are handled by the float/radix matchers above.
	 */
	private isNumberWord(text: string, len: number): boolean {
		const after = text[len] ?? '';
		return !/[A-Za-z_]/.test(after);
	}

	// --------------------------------------------------------------------------
	// $ expansions (outside quotes)
	// --------------------------------------------------------------------------

	/**
	 * Tokenize a `$`-led construct outside quotes. Returns new pos, or `pos` if the
	 * '$' is not a valid sigil here (caller falls through to literal handling).
	 */
	private tokenizeDollar(line: string, pos: number, tokens: Token[]): number {
		const text = line.slice(pos);

		// Arithmetic expansion $((...)) — emit the doubled paren as punctuation and
		// sub-tokenize the inner expression up to the matching ')'. Works the same
		// whether or not we are inside a double-quoted string.
		if (text.startsWith('$((')) {
			tokens.push(createToken('punctuation', '$', pos));
			tokens.push(createToken('punctuation.paren', '(', pos + 1));
			tokens.push(createToken('punctuation.paren', '(', pos + 2));
			const close = this.findParenClose(line, pos + 3);
			this.scanRange(line, pos + 3, close, tokens);
			// Emit the closing '))' when present (it is two parens for $((...)).
			let after = close;
			if (line[after] === ')') {
				tokens.push(createToken('punctuation.paren', ')', after));
				after++;
			}
			if (line[after] === ')') {
				tokens.push(createToken('punctuation.paren', ')', after));
				after++;
			}
			return after;
		}

		// Command substitution $( ... ) — sub-tokenize the interior and emit the
		// matching close paren, so it tokenizes correctly inside double quotes too.
		if (text.startsWith('$(')) {
			tokens.push(createToken('punctuation', '$(', pos));
			const close = this.findParenClose(line, pos + 2);
			this.scanRange(line, pos + 2, close, tokens);
			if (line[close] === ')') {
				tokens.push(createToken('punctuation.paren', ')', close));
				return close + 1;
			}
			return line.length;
		}

		// Parameter expansion ${ ... } — sub-tokenize braces/name/operator.
		if (text.startsWith('${')) {
			return this.tokenizeParamExpansion(line, pos, tokens);
		}

		// $name
		const nameMatch = text.match(/^\$[A-Za-z_][A-Za-z0-9_]*/);
		if (nameMatch) {
			tokens.push(createToken('variable', nameMatch[0], pos));
			return pos + nameMatch[0].length;
		}

		// Special parameters: $1 $@ $? $# $$ $! $0 $* $- $_
		const specialMatch = text.match(/^\$[@?#$!*\-0-9_]/);
		if (specialMatch) {
			tokens.push(createToken('variable', specialMatch[0], pos));
			return pos + specialMatch[0].length;
		}

		return pos;
	}

	/**
	 * Sub-tokenize a `${ ... }` parameter expansion: braces as punctuation.brace,
	 * the (possibly subscripted) name as variable, the modifier operator, and a
	 * recursively-tokenized word/value tail. Threads to end-of-line if unterminated.
	 */
	private tokenizeParamExpansion(line: string, pos: number, tokens: Token[]): number {
		// Find the matching close brace (single line; nesting is rare in ${} but we
		// track depth so `${x:-${y}}` stays balanced).
		let i = pos + 2;
		let depth = 1;
		while (i < line.length && depth > 0) {
			const c = line[i];
			if (c === '\\' && i + 1 < line.length) {
				i += 2;
				continue;
			}
			if (c === '{') depth++;
			else if (c === '}') depth--;
			if (depth === 0) break;
			i++;
		}
		const end = depth === 0 ? i : line.length; // index of '}' or EOL
		const closeFound = depth === 0;

		tokens.push(createToken('punctuation.brace', '${', pos));
		const inner = line.slice(pos + 2, end);
		this.emitParamInner(inner, pos + 2, tokens);
		if (closeFound) {
			tokens.push(createToken('punctuation.brace', '}', end));
			return end + 1;
		}
		return line.length;
	}

	/** Emit the tokens inside a `${...}` (without the braces). */
	private emitParamInner(inner: string, base: number, tokens: Token[]): void {
		if (inner.length === 0) return;
		let i = 0;

		// Leading sigils: length-of `#name`, indirection `!name`, or `#` alone.
		const lead = inner.match(/^[#!]/);
		if (lead && /[A-Za-z0-9_@*]/.test(inner[1] ?? '')) {
			tokens.push(createToken('operator', lead[0], base));
			i = 1;
		}

		// The parameter name (or special param), possibly with an array subscript.
		const nameMatch = inner.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*?#$!-])/);
		if (nameMatch) {
			tokens.push(createToken('variable', nameMatch[0], base + i));
			i += nameMatch[0].length;

			// Array subscript: [expr]
			if (inner[i] === '[') {
				const close = inner.indexOf(']', i);
				const subEnd = close === -1 ? inner.length : close;
				tokens.push(createToken('punctuation.bracket', '[', base + i));
				this.emitInterpolatedRun(inner, i + 1, subEnd, base, tokens, 'variable');
				if (close !== -1) {
					tokens.push(createToken('punctuation.bracket', ']', base + close));
					i = close + 1;
				} else {
					i = inner.length;
				}
			}
		}

		if (i >= inner.length) return;

		// The modifier operator: :- := :? :+ , ^ ^^ , ,, / // # ## % %% : (offset)
		const opMatch = inner.slice(i).match(/^(?::-|:=|:\?|:\+|##|%%|\/\/|\^\^|,,|:|#|%|\/|\^|,)/);
		if (opMatch) {
			tokens.push(createToken('operator', opMatch[0], base + i));
			i += opMatch[0].length;
			// The replacement/default tail can itself contain expansions and escapes.
			this.emitInterpolatedRun(inner, i, inner.length, base, tokens, 'string');
			return;
		}

		// Anything left (offsets `:n:m`, unusual forms) — emit as a value run.
		this.emitInterpolatedRun(inner, i, inner.length, base, tokens, 'string');
	}

	/**
	 * Find the index of the paren that closes a `$(`/`$((` opened just before
	 * `from`, honouring nested parens, single/double quotes, and backslash escapes.
	 * Returns the index of the closing ')' (for `$((` the FIRST of the trailing
	 * '))'), or line.length if the construct is unterminated on this line.
	 */
	private findParenClose(line: string, from: number): number {
		let depth = 0;
		let i = from;
		while (i < line.length) {
			const c = line[i];
			if (c === '\\' && i + 1 < line.length) {
				i += 2;
				continue;
			}
			if (c === "'") {
				const e = line.indexOf("'", i + 1);
				if (e === -1) return line.length;
				i = e + 1;
				continue;
			}
			if (c === '"') {
				// Skip a nested double-quoted span (respecting escapes).
				i++;
				while (i < line.length) {
					if (line[i] === '\\' && i + 1 < line.length) {
						i += 2;
						continue;
					}
					if (line[i] === '"') break;
					i++;
				}
				i++;
				continue;
			}
			if (c === '(') {
				depth++;
				i++;
				continue;
			}
			if (c === ')') {
				if (depth === 0) return i;
				depth--;
				i++;
				continue;
			}
			i++;
		}
		return line.length;
	}

	/** Backtick command substitution `...` — sub-tokenize the interior. */
	private tokenizeBacktick(line: string, pos: number, tokens: Token[]): number {
		tokens.push(createToken('punctuation', '`', pos));
		let i = pos + 1;
		while (i < line.length) {
			if (line[i] === '\\' && i + 1 < line.length) {
				i += 2;
				continue;
			}
			if (line[i] === '`') break;
			i++;
		}
		const end = i < line.length ? i : line.length;
		// Re-tokenize the inner shell command via getNextToken (a sub-scan).
		this.scanRange(line, pos + 1, end, tokens);
		if (i < line.length) {
			tokens.push(createToken('punctuation', '`', i));
			return i + 1;
		}
		return line.length;
	}

	/**
	 * Tokenize a sub-range [from, to) of `line` as ordinary shell, used for the
	 * interiors of `` `...` `` and `$(...)` where the meaning is a nested command.
	 */
	private scanRange(line: string, from: number, to: number, tokens: Token[]): void {
		const sub = line.slice(0, to); // keep absolute positions correct
		const throwaway: ShellTokenizerState = {};
		let p = from;
		while (p < to) {
			const next = this.getNextToken(sub, p, throwaway, tokens);
			if (next > p) {
				p = next;
			} else {
				tokens.push(createToken('text', line[p], p));
				p += 1;
			}
		}
	}

	// --------------------------------------------------------------------------
	// Quoted strings
	// --------------------------------------------------------------------------

	/** Single-quoted: literal, no interpolation. Threads across lines if unterminated. */
	private tokenizeSingleQuote(
		line: string,
		pos: number,
		state: ShellTokenizerState,
		tokens: Token[]
	): number {
		const endIdx = line.indexOf("'", pos + 1);
		if (endIdx !== -1) {
			tokens.push(createToken('string', line.slice(pos, endIdx + 1), pos));
			return endIdx + 1;
		}
		// Unterminated — thread to next line.
		tokens.push(createToken('string', line.slice(pos), pos));
		state.openQuote = 'single';
		return line.length;
	}

	/** ANSI-C $'...' with the full backslash-escape set emitted as string.escape. */
	private tokenizeAnsiC(
		line: string,
		pos: number,
		state: ShellTokenizerState,
		tokens: Token[]
	): number {
		tokens.push(createToken('string', "$'", pos));
		const end = this.emitAnsiCBody(line, pos + 2, tokens);
		if (end < line.length) {
			tokens.push(createToken('string', "'", end));
			return end + 1;
		}
		state.openQuote = 'ansic';
		return line.length;
	}

	/**
	 * Emit the body of a $'...' string from `start`, splitting out escapes. Returns
	 * the index of the closing quote, or line.length if unterminated.
	 */
	private emitAnsiCBody(line: string, start: number, tokens: Token[]): number {
		// ANSI-C escapes: \a \b \e \E \f \n \r \t \v \\ \' \" \? \nnn \xHH \cX
		// \uHHHH \UHHHHHHHH
		const escapeRe =
			/\\(?:[abeEfnrtv\\'"?]|[0-7]{1,3}|x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{1,4}|U[0-9A-Fa-f]{1,8}|c.)/y;
		let i = start;
		let litStart = start;
		const flushLiteral = (upto: number) => {
			if (upto > litStart) {
				tokens.push(createToken('string', line.slice(litStart, upto), litStart));
			}
		};
		while (i < line.length) {
			const c = line[i];
			if (c === "'") {
				flushLiteral(i);
				return i;
			}
			if (c === '\\') {
				escapeRe.lastIndex = i;
				const m = escapeRe.exec(line);
				if (m && m.index === i) {
					flushLiteral(i);
					tokens.push(createToken('string.escape', m[0], i));
					i += m[0].length;
					litStart = i;
					continue;
				}
				// Lone backslash at EOL or unknown escape — keep as literal.
			}
			i++;
		}
		flushLiteral(line.length);
		return line.length;
	}

	/**
	 * Double-quoted string: sub-tokenize escapes and `$`/backtick interpolation,
	 * keeping literal runs as string.template. Threads across lines if unterminated.
	 */
	private tokenizeDoubleQuote(
		line: string,
		pos: number,
		state: ShellTokenizerState,
		tokens: Token[]
	): number {
		tokens.push(createToken('string.template', '"', pos));
		const end = this.emitDoubleBody(line, pos + 1, tokens);
		if (end < line.length) {
			tokens.push(createToken('string.template', '"', end));
			return end + 1;
		}
		state.openQuote = 'double';
		return line.length;
	}

	/**
	 * Emit the interior of a double-quoted string from `start`. Returns the index of
	 * the closing quote, or line.length if unterminated (multi-line thread).
	 */
	private emitDoubleBody(line: string, start: number, tokens: Token[]): number {
		let i = start;
		let litStart = start;
		const flushLiteral = (upto: number) => {
			if (upto > litStart) {
				tokens.push(createToken('string.template', line.slice(litStart, upto), litStart));
			}
		};

		while (i < line.length) {
			const c = line[i];

			// Inside double quotes, backslash only escapes $ ` " \ and newline;
			// before any other char it is a literal backslash.
			if (c === '\\' && i + 1 < line.length) {
				const n = line[i + 1];
				if (n === '$' || n === '`' || n === '"' || n === '\\') {
					flushLiteral(i);
					tokens.push(createToken('string.escape', line.slice(i, i + 2), i));
					i += 2;
					litStart = i;
					continue;
				}
				i += 2;
				continue;
			}

			if (c === '"') {
				flushLiteral(i);
				return i;
			}

			// Interpolation: $... or `...` inside the string.
			if (c === '$' || c === '`') {
				// Peek without committing — only flush the preceding literal if the
				// sigil actually opens an expansion (avoids re-emitting the literal
				// when `$"` / a lone `$` is just a literal dollar).
				const probe: Token[] = [];
				const consumed =
					c === '`' ? this.tokenizeBacktick(line, i, probe) : this.tokenizeDollar(line, i, probe);
				if (consumed > i) {
					flushLiteral(i);
					tokens.push(...probe);
					i = consumed;
					litStart = i;
					continue;
				}
				// A lone '$' or '`' not starting a valid expansion — keep literal.
			}

			i++;
		}

		flushLiteral(line.length);
		return line.length;
	}

	/**
	 * Emit a run [from, to) that may contain `$`/backtick interpolation, keeping the
	 * non-interpolated parts as `literalType`. Used for unquoted heredoc bodies and
	 * ${...} value tails. Lossless.
	 */
	private emitInterpolatedRun(
		line: string,
		from: number,
		to: number,
		_base: number,
		tokens: Token[],
		literalType: TokenType
	): void {
		let i = from;
		let litStart = from;
		const flushLiteral = (upto: number) => {
			if (upto > litStart) {
				tokens.push(createToken(literalType, line.slice(litStart, upto), litStart));
			}
		};
		while (i < to) {
			const c = line[i];
			if (c === '\\' && i + 1 < to) {
				i += 2;
				continue;
			}
			if (c === '$' || c === '`') {
				const probe: Token[] = [];
				const consumed =
					c === '`' ? this.tokenizeBacktick(line, i, probe) : this.tokenizeDollar(line, i, probe);
				if (consumed > i) {
					flushLiteral(i);
					tokens.push(...probe);
					i = consumed;
					litStart = i;
					continue;
				}
			}
			i++;
		}
		flushLiteral(to);
	}

	// --------------------------------------------------------------------------
	// Multi-line resume
	// --------------------------------------------------------------------------

	/**
	 * Resume an unterminated string opened on a previous line. Returns the position
	 * to continue ordinary tokenizing from (after the close, or end of line).
	 */
	private resumeOpenQuote(line: string, state: ShellTokenizerState, tokens: Token[]): number {
		const kind = state.openQuote;
		state.openQuote = undefined;

		if (kind === 'single') {
			const endIdx = line.indexOf("'");
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + 1), 0));
				return endIdx + 1;
			}
			tokens.push(createToken('string', line, 0));
			state.openQuote = 'single';
			return line.length;
		}

		if (kind === 'ansic') {
			const end = this.emitAnsiCBody(line, 0, tokens);
			if (end < line.length) {
				tokens.push(createToken('string', "'", end));
				return end + 1;
			}
			state.openQuote = 'ansic';
			return line.length;
		}

		// double
		const end = this.emitDoubleBody(line, 0, tokens);
		if (end < line.length) {
			tokens.push(createToken('string.template', '"', end));
			return end + 1;
		}
		state.openQuote = 'double';
		return line.length;
	}
}

export function createShellTokenizer() {
	return new ShellTokenizer();
}
