/**
 * CMake tokenizer
 *
 * Sub-tokenizes interpolation losslessly: `${VAR}` / `$ENV{VAR}` references and
 * `$<...>` generator expressions emit their delimiters, namespace, names,
 * operators and nested references as distinct sub-tokens (not one opaque blob),
 * both as bare arguments and INSIDE double-quoted strings. String escape
 * sequences (`\n`, `\"`, `\$`, ...) are split out as `string.escape`, and number
 * literals are classified into integer / float / hex subtypes. Multi-line
 * constructs — bracket comments, bracket arguments, double-quoted strings, and an
 * unterminated `${...}` / `$<...>` interior — are threaded across lines via state.
 */

import type { LanguageTokenizer, Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Control-flow commands => keyword.control. Compared case-insensitively.
const controlCommands = new Set([
	'if',
	'elseif',
	'else',
	'endif',
	'foreach',
	'endforeach',
	'while',
	'endwhile',
	'function',
	'endfunction',
	'macro',
	'endmacro',
	'return',
	'break',
	'continue'
]);

// Well-known commands => keyword.module when immediately followed by `(`. These
// read as scripting commands rather than user-defined function calls. Compared
// case-insensitively.
const builtinCommands = new Set([
	'project',
	'add_executable',
	'add_library',
	'target_link_libraries',
	'set',
	'unset',
	'list',
	'string',
	'file',
	'include',
	'find_package',
	'include_directories',
	'target_include_directories',
	'install',
	'message',
	'option',
	'add_subdirectory',
	'cmake_minimum_required',
	'add_definitions',
	'add_compile_options',
	'target_compile_definitions',
	'target_compile_options',
	'target_sources',
	'configure_file',
	'enable_testing',
	'add_test',
	'set_target_properties',
	'set_property',
	'get_property',
	'execute_process',
	'mark_as_advanced',
	'separate_arguments',
	'math',
	'cmake_parse_arguments',
	'cmake_policy',
	'add_custom_command',
	'add_custom_target',
	'add_dependencies',
	'get_filename_component',
	'get_target_property',
	'find_library',
	'find_path',
	'find_program',
	'find_file',
	'source_group',
	'target_compile_features',
	'target_link_directories',
	'target_link_options',
	'try_compile',
	'try_run'
]);

// Boolean constants (CMake treats these case-insensitively).
const booleanConstants = new Set(['on', 'off', 'true', 'false', 'yes', 'no']);

// Operators of the if()/elseif()/while() conditional sub-language. CMake reserves
// these as boolean/comparison/test operators (they are NOT ordinary argument
// words — `if(A AND B)` parses AND as an operator). They are matched
// case-insensitively, like CMake itself. We classify the unambiguous reserved
// operator words globally; with the sole exception of the logical word operators
// (AND/OR/NOT) which only act as operators inside a conditional command, every
// member here is an `if`-only reserved word that does not appear as a plain
// argument value elsewhere, so a context-free match is safe.
const conditionOperators = new Set([
	// logical
	'and',
	'or',
	'not',
	// existence / type tests
	'exists',
	'command',
	'defined',
	'policy',
	'target',
	'test',
	'in_list',
	'is_newer_than',
	'is_directory',
	'is_symlink',
	'is_absolute',
	// numeric / string / version / path comparisons
	'equal',
	'less',
	'less_equal',
	'greater',
	'greater_equal',
	'strequal',
	'strless',
	'strless_equal',
	'strgreater',
	'strgreater_equal',
	'version_equal',
	'version_less',
	'version_less_equal',
	'version_greater',
	'version_greater_equal',
	'path_equal',
	'matches'
]);

interface CMakeTokenizerState extends TokenizerState {
	/** Inside a multi-line double-quoted string. */
	inString?: boolean;
	/** Inside a multi-line bracket comment #[==[ ... ]==]; holds the `=` count. */
	bracketCommentLevel?: number;
	/** Inside a multi-line bracket argument [==[ ... ]==]; holds the `=` count. */
	bracketArgLevel?: number;
	/**
	 * Paren-nesting depth inside an if()/elseif()/while() argument list. Operator
	 * words (AND/OR/EXISTS/...) are only reserved operators within these, so we
	 * only reclassify them while this is > 0. 0/undefined means "not in a
	 * conditional"; threaded across lines so wrapped conditions still work.
	 */
	condParenDepth?: number;
	/** A conditional control keyword was just seen; the next `(` opens its list. */
	condArmed?: boolean;
}

export class CMakeTokenizer implements LanguageTokenizer {
	language = 'cmake';

	getInitialState(): CMakeTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: CMakeTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: CMakeTokenizerState = { ...prevState };

		// Resume a multi-line bracket comment #[==[ ... ]==]
		if (state.bracketCommentLevel !== undefined) {
			const close = `]${'='.repeat(state.bracketCommentLevel)}]`;
			const endIdx = line.indexOf(close);
			if (endIdx !== -1) {
				tokens.push(createToken('comment.block', line.slice(0, endIdx + close.length), 0));
				pos = endIdx + close.length;
				state.bracketCommentLevel = undefined;
			} else {
				tokens.push(createToken('comment.block', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a multi-line bracket argument [==[ ... ]==]
		if (state.bracketArgLevel !== undefined) {
			const close = `]${'='.repeat(state.bracketArgLevel)}]`;
			const endIdx = line.indexOf(close);
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + close.length), 0));
				pos = endIdx + close.length;
				state.bracketArgLevel = undefined;
			} else {
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a multi-line double-quoted string
		if (state.inString) {
			pos = this.continueString(line, 0, tokens, state);
			if (state.inString) {
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Track command position: an unknown word is a command call (and so may be
		// separated from its `(` by blanks) only when it is the first significant
		// word on the line. A word appearing later in an argument list that happens
		// to precede a `(...)` sub-group (`set(FOO bar (baz))`) is an argument, not a
		// call. `sawSignificant` flips true once any non-blank token is emitted.
		let sawSignificant = false;
		while (pos < line.length) {
			const remaining = line.slice(pos);
			const before = tokens.length;
			const consumed = this.emitNextToken(remaining, pos, state, tokens, sawSignificant);

			if (consumed > 0) {
				if (!sawSignificant) {
					for (let k = before; k < tokens.length; k++) {
						if (tokens[k].type !== 'text' || tokens[k].text.trim() !== '') {
							sawSignificant = true;
							break;
						}
					}
				}
				pos += consumed;
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				sawSignificant = true;
				pos += 1;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	/**
	 * Emit the next token(s) for `text` (the remaining slice starting at `pos`).
	 * Most constructs push exactly one token; interpolation and strings push
	 * several sub-tokens. Returns the number of characters consumed (0 if nothing
	 * matched, so the caller can advance one char as `text`).
	 */
	private emitNextToken(
		text: string,
		pos: number,
		state: CMakeTokenizerState,
		out: Token[],
		sawSignificant: boolean
	): number {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			out.push(createToken('text', wsMatch[0], pos));
			return wsMatch[0].length;
		}

		// Bracket comment: #[[ ... ]] or #[=[ ... ]=]
		if (text.startsWith('#[')) {
			const open = text.match(/^#\[(=*)\[/);
			if (open) {
				const level = open[1].length;
				const close = `]${'='.repeat(level)}]`;
				const endIdx = text.indexOf(close, open[0].length);
				if (endIdx !== -1) {
					const slice = text.slice(0, endIdx + close.length);
					out.push(createToken('comment.block', slice, pos));
					return slice.length;
				}
				state.bracketCommentLevel = level;
				out.push(createToken('comment.block', text, pos));
				return text.length;
			}
		}

		// Line comment: # to end of line
		if (text.startsWith('#')) {
			out.push(createToken('comment.line', text, pos));
			return text.length;
		}

		// Bracket argument: [[ ... ]] or [=[ ... ]=]  (raw string literal)
		if (text.startsWith('[')) {
			const open = text.match(/^\[(=*)\[/);
			if (open) {
				const level = open[1].length;
				const close = `]${'='.repeat(level)}]`;
				const endIdx = text.indexOf(close, open[0].length);
				if (endIdx !== -1) {
					const slice = text.slice(0, endIdx + close.length);
					out.push(createToken('string', slice, pos));
					return slice.length;
				}
				state.bracketArgLevel = level;
				out.push(createToken('string', text, pos));
				return text.length;
			}
		}

		// Variable references: ${VAR}, $ENV{VAR}, $CACHE{VAR}
		if (text.startsWith('$') && (text[1] === '{' || /^\$[A-Za-z_][A-Za-z0-9_]*\{/.test(text))) {
			const consumed = this.emitVariable(text, pos, out);
			if (consumed > 0) {
				return consumed;
			}
		}

		// Generator expression: $<...>
		if (text.startsWith('$<')) {
			const consumed = this.emitGeneratorExpr(text, pos, out);
			if (consumed > 0) {
				return consumed;
			}
		}

		// Double-quoted string (may span lines)
		if (text.startsWith('"')) {
			return this.emitString(text, pos, state, out);
		}

		// Numbers: hex (0x1A), float / version (1.2, 1.2.3), or integer (42).
		const numConsumed = this.emitNumber(text, pos, out);
		if (numConsumed > 0) {
			return numConsumed;
		}

		// Identifiers / command names / constants
		const identMatch = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			const inCondition = (state.condParenDepth ?? 0) > 0;
			const atCommandPos = !sawSignificant;
			const type = this.classifyIdentifier(word, text, word.length, inCondition, atCommandPos);
			const token = createToken(type, word, pos);
			out.push(token);
			this.trackConditionContext(token, state);
			return word.length;
		}

		// Bare assignment character (e.g. `set(ENV{FOO}=bar)`).
		if (text.startsWith('=')) {
			out.push(createToken('operator.assignment', '=', pos));
			return 1;
		}

		// Punctuation
		const ch = text[0];
		if (ch === '(' || ch === ')') {
			const token = createToken('punctuation.paren', ch, pos);
			out.push(token);
			this.trackConditionContext(token, state);
			return 1;
		}
		if (ch === '{' || ch === '}') {
			out.push(createToken('punctuation.brace', ch, pos));
			return 1;
		}
		if (ch === '[' || ch === ']') {
			out.push(createToken('punctuation.bracket', ch, pos));
			return 1;
		}
		if (ch === ';' || ch === ',') {
			out.push(createToken('punctuation.separator', ch, pos));
			return 1;
		}

		return 0;
	}

	/**
	 * Maintain the if()/elseif()/while() condition context as tokens are emitted.
	 * Seeing one of those control keywords arms the next `(` to open a condition;
	 * parens are then counted so wrapped/nested conditions track correctly, and the
	 * matching `)` closes it. Threaded via state so conditions wrapped across lines
	 * keep their operator classification.
	 */
	private trackConditionContext(token: Token, state: CMakeTokenizerState): void {
		if (token.type === 'keyword.control') {
			const lower = token.text.toLowerCase();
			if (lower === 'if' || lower === 'elseif' || lower === 'while') {
				state.condArmed = true;
			}
			return;
		}
		if (token.type !== 'punctuation.paren') {
			return;
		}
		if (token.text === '(') {
			if (state.condArmed) {
				state.condParenDepth = 1;
				state.condArmed = false;
			} else if ((state.condParenDepth ?? 0) > 0) {
				state.condParenDepth = (state.condParenDepth ?? 0) + 1;
			}
		} else if (token.text === ')' && (state.condParenDepth ?? 0) > 0) {
			state.condParenDepth = (state.condParenDepth ?? 0) - 1;
		}
	}

	/**
	 * Emit a number literal, classified into a precise subtype:
	 *   - number.hex     `0x1A`, `0XFF`
	 *   - number.float   `1.5`, `1.2.3` (version triples), `3.14e10`
	 *   - number.integer `42`
	 * Returns 0 when the slice isn't a number, or when the digits are actually the
	 * prefix of an identifier (CMake identifiers can't start with a digit, so a
	 * trailing identifier char means this was never a number — e.g. `2nd`).
	 */
	private emitNumber(text: string, pos: number, out: Token[]): number {
		// Hexadecimal: 0x / 0X followed by hex digits.
		const hexMatch = text.match(/^0[xX][0-9a-fA-F]+/);
		if (hexMatch && !/^[A-Za-z_]/.test(text.slice(hexMatch[0].length))) {
			out.push(createToken('number.hex', hexMatch[0], pos));
			return hexMatch[0].length;
		}

		// Decimal integer / float, including version-like triples and exponents.
		const numMatch = text.match(/^\d+(?:\.\d+)*(?:[eE][+-]?\d+)?/);
		if (numMatch) {
			const after = text.slice(numMatch[0].length);
			if (!/^[A-Za-z_]/.test(after)) {
				const isFloat = /[.eE]/.test(numMatch[0]);
				out.push(createToken(isFloat ? 'number.float' : 'number.integer', numMatch[0], pos));
				return numMatch[0].length;
			}
		}
		return 0;
	}

	/**
	 * Sub-tokenize a variable reference: `${VAR}`, `$ENV{VAR}`, `$CACHE{VAR}`,
	 * including nested `${${inner}}`. The `$`/namespace and braces are emitted as
	 * `string.template`/`punctuation.brace`, plain inner name characters as
	 * `variable`, and any nested reference recursively. Returns the number of
	 * characters consumed (0 if it isn't a variable reference after all).
	 */
	private emitVariable(text: string, pos: number, out: Token[]): number {
		// Match `$` + optional namespace ($ENV, $CACHE, ...) + the opening `{`.
		const head = text.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\{/);
		if (!head) {
			return 0;
		}
		const headLen = head[0].length;
		// `$` and any namespace prefix as the interpolation delimiter; the `{`
		// separately as a brace so the open/close pair reads as punctuation.
		out.push(createToken('string.template', text.slice(0, headLen - 1), pos));
		out.push(createToken('punctuation.brace', '{', pos + headLen - 1));

		let i = headLen;
		let nameStart = i;
		let depth = 1;
		const flushName = (end: number) => {
			if (end > nameStart) {
				out.push(createToken('variable', text.slice(nameStart, end), pos + nameStart));
			}
		};

		while (i < text.length) {
			// Nested ${...} / $ENV{...} inside the name.
			if (
				text[i] === '$' &&
				(text[i + 1] === '{' || /^\$[A-Za-z_][A-Za-z0-9_]*\{/.test(text.slice(i)))
			) {
				flushName(i);
				const consumed = this.emitVariable(text.slice(i), pos + i, out);
				if (consumed > 0) {
					i += consumed;
					nameStart = i;
					continue;
				}
			}
			if (text[i] === '{') {
				depth++;
				i++;
				continue;
			}
			if (text[i] === '}') {
				flushName(i);
				depth--;
				out.push(createToken('punctuation.brace', '}', pos + i));
				i++;
				if (depth === 0) {
					return i;
				}
				nameStart = i;
				continue;
			}
			i++;
		}
		// Unterminated on this line — flush the trailing name (best effort).
		flushName(i);
		return i;
	}

	/**
	 * Sub-tokenize a generator expression `$<...>`. The `$<` and `>` are emitted as
	 * `string.template`, a leading expression name (e.g. `CONFIG`, `BOOL`,
	 * `TARGET_PROPERTY`) as `function.call`, the `:` after it as
	 * `punctuation.separator`, commas as separators, nested `$<...>` /  `${...}`
	 * recursively, and remaining literal text as `constant.builtin`. Returns the
	 * characters consumed.
	 */
	private emitGeneratorExpr(text: string, pos: number, out: Token[]): number {
		// `$<`
		out.push(createToken('string.template', '$<', pos));
		let i = 2;
		let litStart = i;
		const flushLit = (end: number) => {
			if (end > litStart) {
				out.push(createToken('constant.builtin', text.slice(litStart, end), pos + litStart));
			}
		};

		// A generator expression begins with an expression name when the first run
		// of identifier chars is immediately followed by `:` or `>` — `$<CONFIG:..>`,
		// `$<BOOL:..>`, `$<TARGET_FILE:t>`. Bare `$<1:..>` (a literal 0/1 condition)
		// has no name, so we only treat a name-shaped head specially.
		const nameMatch = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (
			nameMatch &&
			(text[i + nameMatch[0].length] === ':' || text[i + nameMatch[0].length] === '>')
		) {
			out.push(createToken('function.call', nameMatch[0], pos + i));
			i += nameMatch[0].length;
			litStart = i;
			if (text[i] === ':') {
				out.push(createToken('punctuation.separator', ':', pos + i));
				i++;
				litStart = i;
			}
		}

		while (i < text.length) {
			// Nested generator expression.
			if (text[i] === '$' && text[i + 1] === '<') {
				flushLit(i);
				const consumed = this.emitGeneratorExpr(text.slice(i), pos + i, out);
				i += consumed;
				litStart = i;
				continue;
			}
			// Nested variable reference.
			if (
				text[i] === '$' &&
				(text[i + 1] === '{' || /^\$[A-Za-z_][A-Za-z0-9_]*\{/.test(text.slice(i)))
			) {
				flushLit(i);
				const consumed = this.emitVariable(text.slice(i), pos + i, out);
				if (consumed > 0) {
					i += consumed;
					litStart = i;
					continue;
				}
			}
			if (text[i] === ',') {
				flushLit(i);
				out.push(createToken('punctuation.separator', ',', pos + i));
				i++;
				litStart = i;
				continue;
			}
			if (text[i] === '>') {
				flushLit(i);
				out.push(createToken('string.template', '>', pos + i));
				return i + 1;
			}
			i++;
		}
		// Unterminated on this line — flush the remaining literal (best effort).
		flushLit(i);
		return i;
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		inCondition: boolean,
		atCommandPos: boolean
	): TokenType {
		const lower = word.toLowerCase();

		// Boolean constants (case-insensitive)
		if (booleanConstants.has(lower)) {
			return 'constant.boolean';
		}

		const after = context.slice(wordLength);

		// Control-flow commands are keywords whether or not the `(` is glued on,
		// but in practice they're always called as commands. `function`/`macro`
		// also live in builtinCommands; the control set wins so they color as
		// control flow consistently with their `end*` partners.
		if (controlCommands.has(lower)) {
			return 'keyword.control';
		}

		// Conditional operators (AND/OR/NOT, comparisons, EXISTS/DEFINED/...): these
		// are reserved operator words of the if()/while() sub-language, not argument
		// values. They are ONLY operators inside an if()/elseif()/while() argument
		// list — `set_property(TARGET t ...)` uses TARGET as a scope keyword, not an
		// operator — so we gate on `inCondition`. A word glued to `(` is a command
		// call, never an operator, so we also require it not be immediately followed
		// by `(`.
		if (inCondition && conditionOperators.has(lower) && !after.startsWith('(')) {
			return 'keyword.operator';
		}

		// CMake's grammar permits whitespace between a command name and its
		// opening paren — `set (X 1)` is identical to `set(X 1)`. For a KNOWN
		// builtin we therefore look past leading blanks to find the `(`; this is
		// unambiguous because builtins are reserved command names. For an UNKNOWN
		// word we require the paren to be glued on, so a bare argument word that
		// happens to precede a parenthesized sub-group (`set(FOO bar (baz))`) is
		// not mistaken for a call.
		if (builtinCommands.has(lower)) {
			if (after.replace(/^[ \t]+/, '').startsWith('(')) {
				return 'keyword.module';
			}
			return 'variable';
		}
		// An UNKNOWN word glued to `(` is a call regardless of position
		// (`set(FOO bar(baz))` — `bar(` is a nested call). When the `(` is separated
		// by blanks, it is only a call in COMMAND POSITION (the first word on the
		// line): `my_macro (a)` is a call, but a mid-list argument word that merely
		// precedes a `(...)` sub-group (`set(FOO bar (baz))`) is an argument, so we
		// must NOT treat the spaced form as a call there.
		if (after.startsWith('(')) {
			return 'function.call';
		}
		if (atCommandPos && /^[ \t]+\(/.test(after)) {
			return 'function.call';
		}

		// CMAKE_*, PROJECT_*, and other ALL_CAPS argument words read as variables.
		// Everything else is a bare argument word, which we color as a variable.
		return 'variable';
	}

	/**
	 * Emit a double-quoted string starting at `text`, sub-tokenizing its contents:
	 * escape sequences (`\n`, `\"`, `\$`, ...) become `string.escape`, embedded
	 * `${VAR}` references and `$<...>` generator expressions are sub-tokenized, and
	 * the surrounding literal stays `string`. CMake strings may span lines; when
	 * unterminated we set state.inString and consume the rest of the line.
	 * Returns the number of characters consumed.
	 */
	private emitString(text: string, pos: number, state: CMakeTokenizerState, out: Token[]): number {
		// Opening quote.
		out.push(createToken('string', '"', pos));
		const after = this.scanStringBody(text, 1, pos, out);
		state.inString = !after.closed;
		return after.end;
	}

	/**
	 * Continue a multi-line double-quoted string on a fresh line. Pushes sub-tokens
	 * and updates state.inString. Returns the position after the string body.
	 */
	private continueString(
		line: string,
		pos: number,
		out: Token[],
		state: CMakeTokenizerState
	): number {
		const result = this.scanStringBody(line, 0, pos, out);
		state.inString = !result.closed;
		return result.end;
	}

	/**
	 * Scan a double-quoted string body from `start`, pushing `string`,
	 * `string.escape`, and interpolation sub-tokens. Stops at the closing unescaped
	 * `"` (emitted as `string`) or the end of line. Returns the end position and
	 * whether the string closed on this line.
	 */
	private scanStringBody(
		text: string,
		start: number,
		basePos: number,
		out: Token[]
	): { end: number; closed: boolean } {
		let i = start;
		let litStart = start;
		const flushLit = (end: number) => {
			if (end > litStart) {
				out.push(createToken('string', text.slice(litStart, end), basePos + litStart));
			}
		};

		while (i < text.length) {
			const c = text[i];

			// Escape sequence: backslash + one char (CMake: \" \\ \n \t \r \; \$ \# ...).
			if (c === '\\' && i + 1 < text.length) {
				flushLit(i);
				out.push(createToken('string.escape', text.slice(i, i + 2), basePos + i));
				i += 2;
				litStart = i;
				continue;
			}

			// Embedded variable reference ${VAR} / $ENV{VAR}.
			if (c === '$' && (text[i + 1] === '{' || /^\$[A-Za-z_][A-Za-z0-9_]*\{/.test(text.slice(i)))) {
				flushLit(i);
				const consumed = this.emitVariable(text.slice(i), basePos + i, out);
				if (consumed > 0) {
					i += consumed;
					litStart = i;
					continue;
				}
			}

			// Embedded generator expression $<...>.
			if (c === '$' && text[i + 1] === '<') {
				flushLit(i);
				const consumed = this.emitGeneratorExpr(text.slice(i), basePos + i, out);
				if (consumed > 0) {
					i += consumed;
					litStart = i;
					continue;
				}
			}

			// Closing quote.
			if (c === '"') {
				flushLit(i);
				out.push(createToken('string', '"', basePos + i));
				return { end: i + 1, closed: true };
			}

			i++;
		}

		// Unterminated — a trailing backslash escaped the newline, or the string
		// simply continues on the next line.
		flushLit(i);
		return { end: i, closed: false };
	}
}

export function createCMakeTokenizer(): LanguageTokenizer {
	return new CMakeTokenizer();
}
