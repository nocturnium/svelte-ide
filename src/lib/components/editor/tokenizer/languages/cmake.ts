/**
 * CMake tokenizer
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
	'separate_arguments'
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
			const result = this.continueString(line, 0);
			tokens.push(result.token);
			pos = result.end;
			if (result.closed) {
				state.inString = false;
			} else {
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos, state);

			if (token) {
				tokens.push(token);
				pos = token.end;
				this.trackConditionContext(token, state);
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

	private getNextToken(text: string, pos: number, state: CMakeTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Bracket comment: #[[ ... ]] or #[=[ ... ]=]
		if (text.startsWith('#[')) {
			const open = text.match(/^#\[(=*)\[/);
			if (open) {
				const level = open[1].length;
				const close = `]${'='.repeat(level)}]`;
				const endIdx = text.indexOf(close, open[0].length);
				if (endIdx !== -1) {
					return createToken('comment.block', text.slice(0, endIdx + close.length), pos);
				}
				state.bracketCommentLevel = level;
				return createToken('comment.block', text, pos);
			}
		}

		// Line comment: # to end of line
		if (text.startsWith('#')) {
			return createToken('comment.line', text, pos);
		}

		// Bracket argument: [[ ... ]] or [=[ ... ]=]  (string literal)
		if (text.startsWith('[')) {
			const open = text.match(/^\[(=*)\[/);
			if (open) {
				const level = open[1].length;
				const close = `]${'='.repeat(level)}]`;
				const endIdx = text.indexOf(close, open[0].length);
				if (endIdx !== -1) {
					return createToken('string', text.slice(0, endIdx + close.length), pos);
				}
				state.bracketArgLevel = level;
				return createToken('string', text, pos);
			}
		}

		// Variable references: ${VAR}, $ENV{VAR}, $CACHE{VAR}
		if (text.startsWith('$') && (text[1] === '{' || /^\$[A-Za-z_][A-Za-z0-9_]*\{/.test(text))) {
			const varToken = this.tokenizeVariable(text, pos);
			if (varToken) {
				return varToken;
			}
		}

		// Generator expression: $<...> (best effort, single-line)
		if (text.startsWith('$<')) {
			const genToken = this.tokenizeGeneratorExpr(text, pos);
			if (genToken) {
				return genToken;
			}
		}

		// Double-quoted string (may span lines)
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos, state);
		}

		// Numbers (integers and simple floats; version triples split on `.`)
		const numMatch = text.match(/^\d+(?:\.\d+)?/);
		if (numMatch) {
			// Don't swallow a number that is actually the prefix of an identifier
			// (e.g. `2nd`) — CMake identifiers don't start with a digit, so a
			// trailing identifier char means this was never a number.
			const after = text.slice(numMatch[0].length);
			if (!/^[A-Za-z_]/.test(after)) {
				return createToken('number', numMatch[0], pos);
			}
		}

		// Identifiers / command names / constants
		const identMatch = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			const inCondition = (state.condParenDepth ?? 0) > 0;
			return createToken(this.classifyIdentifier(word, text, word.length, inCondition), word, pos);
		}

		// Operators (assignment / comparison-ish characters appearing bare)
		if (text.startsWith('=')) {
			return createToken('operator.assignment', '=', pos);
		}

		// Punctuation
		const ch = text[0];
		if (ch === '(' || ch === ')') {
			return createToken('punctuation.paren', ch, pos);
		}
		if (ch === '{' || ch === '}') {
			return createToken('punctuation.brace', ch, pos);
		}
		if (ch === '[' || ch === ']') {
			return createToken('punctuation.bracket', ch, pos);
		}
		if (ch === ';' || ch === ',') {
			return createToken('punctuation.separator', ch, pos);
		}

		return null;
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
	 * Tokenize a variable reference: ${VAR}, $ENV{VAR}, $CACHE{VAR}.
	 * Returns a single `variable` token spanning the whole reference, including a
	 * balanced (best-effort) set of braces and any nested ${...}.
	 */
	private tokenizeVariable(text: string, pos: number): Token | null {
		// Match an optional namespace prefix ($ENV, $CACHE, ...) then the `{`.
		const head = text.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\{/);
		if (!head) {
			return null;
		}

		let depth = 0;
		let i = 0;
		while (i < text.length) {
			const c = text[i];
			if (c === '{') {
				depth++;
			} else if (c === '}') {
				depth--;
				if (depth === 0) {
					return createToken('variable', text.slice(0, i + 1), pos);
				}
			}
			i++;
		}
		// Unterminated on this line — take the rest as a (best-effort) variable.
		return createToken('variable', text, pos);
	}

	/**
	 * Tokenize a generator expression $<...> as a single token (best effort).
	 * Brace-matched on `<`/`>`; falls back to the rest of the line if unbalanced.
	 */
	private tokenizeGeneratorExpr(text: string, pos: number): Token | null {
		let depth = 0;
		let i = 1; // start at the `<`
		while (i < text.length) {
			const c = text[i];
			if (c === '<') {
				depth++;
			} else if (c === '>') {
				depth--;
				if (depth === 0) {
					return createToken('constant.builtin', text.slice(0, i + 1), pos);
				}
			}
			i++;
		}
		return createToken('constant.builtin', text, pos);
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		inCondition: boolean
	): TokenType {
		const lower = word.toLowerCase();

		// Boolean constants (case-insensitive)
		if (booleanConstants.has(lower)) {
			return 'constant.boolean';
		}

		// Control-flow commands are keywords whether or not the `(` is glued on,
		// but in practice they're always called as commands.
		if (controlCommands.has(lower)) {
			return 'keyword.control';
		}

		const after = context.slice(wordLength);

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
		if (after.startsWith('(')) {
			return 'function.call';
		}

		// CMAKE_*, PROJECT_*, and other ALL_CAPS argument words read as variables.
		// Everything else is a bare argument word, which we color as a variable.
		return 'variable';
	}

	/**
	 * Tokenize a double-quoted string starting at `text`. CMake strings may span
	 * multiple lines; when unterminated we set state.inString and return the rest.
	 */
	private tokenizeString(text: string, pos: number, state: CMakeTokenizerState): Token {
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
		// Unterminated: a trailing backslash escapes the newline / string continues.
		state.inString = true;
		return createToken('string', text.slice(0, i), pos);
	}

	/**
	 * Continue a multi-line double-quoted string on a fresh line. Returns the
	 * token, the position after it, and whether the string closed on this line.
	 */
	private continueString(
		line: string,
		pos: number
	): { token: Token; end: number; closed: boolean } {
		let i = 0;
		while (i < line.length) {
			if (line[i] === '\\' && i + 1 < line.length) {
				i += 2;
				continue;
			}
			if (line[i] === '"') {
				return {
					token: createToken('string', line.slice(0, i + 1), pos),
					end: i + 1,
					closed: true
				};
			}
			i++;
		}
		return { token: createToken('string', line, pos), end: line.length, closed: false };
	}
}

export function createCMakeTokenizer(): LanguageTokenizer {
	return new CMakeTokenizer();
}
