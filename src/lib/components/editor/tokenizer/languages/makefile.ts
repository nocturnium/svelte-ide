/**
 * Makefile tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// GNU make directives. The leading word of a logical line; control-flow flavored.
const directives = new Set([
	'ifeq',
	'ifneq',
	'ifdef',
	'ifndef',
	'else',
	'endif',
	'include',
	'-include',
	'sinclude',
	'define',
	'endef',
	'override',
	'export',
	'unexport',
	'vpath'
]);

// Built-in function names used inside $(...) / ${...} expansions.
const builtinFunctions = new Set([
	'subst',
	'patsubst',
	'strip',
	'findstring',
	'filter',
	'filter-out',
	'sort',
	'word',
	'wordlist',
	'words',
	'firstword',
	'lastword',
	'dir',
	'notdir',
	'suffix',
	'basename',
	'addsuffix',
	'addprefix',
	'join',
	'wildcard',
	'realpath',
	'abspath',
	'if',
	'or',
	'and',
	'foreach',
	'file',
	'call',
	'value',
	'eval',
	'origin',
	'flavor',
	'shell',
	'error',
	'warning',
	'info',
	'guile'
]);

// Special built-in targets (begin with a dot).
const specialTargets = new Set([
	'.PHONY',
	'.DEFAULT',
	'.SUFFIXES',
	'.PRECIOUS',
	'.INTERMEDIATE',
	'.SECONDARY',
	'.SECONDEXPANSION',
	'.DELETE_ON_ERROR',
	'.IGNORE',
	'.LOW_RESOLUTION_TIME',
	'.SILENT',
	'.EXPORT_ALL_VARIABLES',
	'.NOTPARALLEL',
	'.ONESHELL',
	'.POSIX'
]);

interface MakefileTokenizerState extends TokenizerState {
	/** Previous physical line ended with a trailing backslash (logical line continues). */
	inContinuation?: boolean;
	/**
	 * The continued logical line is a recipe (or define body): its continuation lines are
	 * shell/raw text. False means the continued line is a make line (assignment / directive /
	 * prerequisite list) whose continuation should keep value/variable highlighting.
	 */
	continuationIsRecipe?: boolean;
	/** Currently inside a define ... endef block; body lines are treated as recipe-ish. */
	inDefine?: boolean;
}

export class MakefileTokenizer {
	language = 'makefile';

	getInitialState(): MakefileTokenizerState {
		return {};
	}

	tokenizeLine(
		line: string,
		lineNumber: number,
		prevState?: MakefileTokenizerState
	): TokenizedLine {
		const tokens: Token[] = [];
		const state: MakefileTokenizerState = { ...prevState };

		const continued = state.inContinuation === true;
		// Clear continuation; re-set below if this physical line ends with `\`.
		state.inContinuation = false;

		// Inside a define block: body lines are raw command text, but still expand $(...).
		if (state.inDefine && !continued) {
			if (/^\s*endef\b/.test(line)) {
				state.inDefine = false;
				this.scanGeneric(line, tokens);
			} else {
				this.scanRecipeBody(line, 0, tokens);
			}
			if (tokens.length === 0) tokens.push(createToken('text', '', 0));
			this.markContinuation(line, tokens, state, true);
			return { lineNumber, tokens, text: line, state };
		}

		// Recipe lines begin with a literal TAB. They are command text; only $(...)
		// expansions and comments are highlighted, everything else stays plain.
		if (!continued && line.startsWith('\t')) {
			tokens.push(createToken('text', '\t', 0));
			this.scanRecipeBody(line, 1, tokens);
			if (tokens.length === 0) tokens.push(createToken('text', '', 0));
			this.markContinuation(line, tokens, state, true);
			return { lineNumber, tokens, text: line, state };
		}

		// Continuation of a previous logical line. A continued RECIPE stays raw shell text;
		// a continued MAKE line (assignment / directive / prerequisite list) keeps its
		// value/variable highlighting so multi-line assignments are not flattened to plain.
		if (continued) {
			const isRecipe = state.continuationIsRecipe === true;
			if (isRecipe) {
				this.scanRecipeBody(line, 0, tokens);
			} else {
				this.scanMakeLine(line, 0, tokens, state, true);
			}
			if (tokens.length === 0) tokens.push(createToken('text', '', 0));
			this.markContinuation(line, tokens, state, isRecipe);
			return { lineNumber, tokens, text: line, state };
		}

		// Otherwise this is a make (non-recipe) line: a directive, an assignment, a
		// target rule, or a bare comment. Detect a target rule up front so the names
		// before the first colon become target definitions.
		const targetEmitted = this.tryEmitTarget(line, tokens, state);
		const startPos = targetEmitted;

		this.scanMakeLine(line, startPos, tokens, state);

		if (tokens.length === 0) tokens.push(createToken('text', '', 0));
		this.markContinuation(line, tokens, state, false);
		return { lineNumber, tokens, text: line, state };
	}

	/**
	 * Re-arm continuation state if the physical line ends with an unescaped `\`. `isRecipe`
	 * records whether the continued logical line is recipe/shell text (raw) or a make line
	 * (value-highlighted), so the next physical line is scanned in the right mode.
	 */
	private markContinuation(
		line: string,
		tokens: Token[],
		state: MakefileTokenizerState,
		isRecipe: boolean
	): void {
		if (/\\\s*$/.test(line) && !this.endsInComment(tokens)) {
			state.inContinuation = true;
			state.continuationIsRecipe = isRecipe;
		}
	}

	/** Whether the last meaningful token is a comment (a `\` in a comment is not a continuation). */
	private endsInComment(tokens: Token[]): boolean {
		for (let i = tokens.length - 1; i >= 0; i--) {
			const t = tokens[i];
			if (t.type === 'text' && t.text.trim() === '') continue;
			return t.type === 'comment.line';
		}
		return false;
	}

	/**
	 * If `line` (no leading tab) is a target rule, emit the indentation, the target
	 * name(s) and the `:` separator, and return the position just past the colon.
	 * Returns 0 when the line is not a target rule (leaving the whole line unscanned).
	 */
	private tryEmitTarget(line: string, tokens: Token[], state: MakefileTokenizerState): number {
		// A comment or blank line is never a target.
		const trimmedStart = line.match(/^[ \t]*/)?.[0].length ?? 0;
		if (trimmedStart >= line.length || line[trimmedStart] === '#') return 0;

		// The leading word must not be a directive or an assignment.
		const firstWord = line.slice(trimmedStart).match(/^[A-Za-z_][A-Za-z0-9_-]*/)?.[0];
		if (firstWord && directives.has(firstWord)) return 0;

		// Find the rule colon: the first `:` that is not part of `:=`/`::=` and is
		// not inside a $(...) expansion. An assignment colon (`:=`) is not a rule.
		const colonIdx = this.findRuleColon(line);
		if (colonIdx === -1) return 0;

		// Emit leading whitespace, then each target name before the colon.
		if (trimmedStart > 0) {
			tokens.push(createToken('text', line.slice(0, trimmedStart), 0));
		}
		const namePart = line.slice(trimmedStart, colonIdx);
		this.scanTargetNames(namePart, trimmedStart, tokens);

		// Emit the rule colon (and a second `:` for double-colon rules).
		let colonEnd = colonIdx + 1;
		if (line[colonEnd] === ':') colonEnd += 1;
		tokens.push(createToken('punctuation', line.slice(colonIdx, colonEnd), colonIdx));

		// A define directive on a target-looking line is unusual; nothing to set here.
		void state;
		return colonEnd;
	}

	/**
	 * Index of the rule-defining colon, or -1. Skips `:=`/`::=` (assignment) and any
	 * colon inside a $(...) / ${...} expansion.
	 */
	private findRuleColon(line: string): number {
		let depth = 0;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (c === '#') return -1;
			if (c === '$' && (line[i + 1] === '(' || line[i + 1] === '{')) {
				depth++;
				i++;
				continue;
			}
			if (depth > 0) {
				if (c === ')' || c === '}') depth--;
				continue;
			}
			if (c === ':') {
				// `:=` and `::=` are assignment, not a rule colon.
				if (line[i + 1] === '=') return -1;
				if (line[i + 1] === ':' && line[i + 2] === '=') return -1;
				return i;
			}
			if (c === '=') return -1; // a plain `=` before any colon means assignment.
		}
		return -1;
	}

	/** Tokenize the space-separated target names left of the rule colon. */
	private scanTargetNames(text: string, offset: number, tokens: Token[]): void {
		let pos = 0;
		while (pos < text.length) {
			const remaining = text.slice(pos);
			const ws = remaining.match(/^[ \t]+/);
			if (ws) {
				tokens.push(createToken('text', ws[0], offset + pos));
				pos += ws[0].length;
				continue;
			}
			// A $(...) expansion can appear in a target name.
			if (remaining.startsWith('$')) {
				const v = this.matchVariable(remaining);
				if (v) {
					this.emitVariable(v, offset + pos, tokens);
					pos += v.length;
					continue;
				}
			}
			const name = remaining.match(/^[^\s:#$]+/);
			if (name) {
				const word = name[0];
				const type: TokenType = specialTargets.has(word)
					? 'constant.builtin'
					: 'function.definition';
				tokens.push(createToken(type, word, offset + pos));
				pos += word.length;
				continue;
			}
			tokens.push(createToken('text', remaining[0], offset + pos));
			pos += 1;
		}
	}

	/**
	 * Scan a non-recipe make line (directives, assignments, prerequisites, comments).
	 * `suppressDirective` is set for continuation lines, where the first word can never
	 * begin a new directive (e.g. a value `include.mk` must stay a plain word).
	 */
	private scanMakeLine(
		line: string,
		startPos: number,
		tokens: Token[],
		state: MakefileTokenizerState,
		suppressDirective = false
	): void {
		let pos = startPos;
		// Whether the leading directive on this logical line has been consumed yet.
		let sawLeadingWord = startPos > 0 || suppressDirective;
		// The exclusive end of the assignment LHS region (the index of the assignment
		// operator), or -1 when this line is not an assignment. Identifiers before it are
		// the variable(s) being DEFINED and emit `variable.definition`.
		const assignOp = suppressDirective ? -1 : this.findAssignmentOp(line, startPos);
		// True immediately after consuming an `ifeq`/`ifneq` keyword, so the following
		// `(arg1,arg2)` is sub-tokenized as a conditional argument pair rather than as a
		// loose paren and two words.
		let afterCondDirective = false;
		while (pos < line.length) {
			const remaining = line.slice(pos);

			// Conditional argument pair: `ifeq (a,b)` / `ifneq ($(OS),Windows_NT)`. Only the
			// parenthesized form is special; the `ifeq "a" "b"` quoted form falls through.
			if (afterCondDirective) {
				const ws = remaining.match(/^[ \t]+/);
				const at = ws ? pos + ws[0].length : pos;
				if (line[at] === '(') {
					if (ws) tokens.push(createToken('text', ws[0], pos));
					pos = this.emitConditionalArgs(line, at, tokens);
					afterCondDirective = false;
					sawLeadingWord = true;
					continue;
				}
				afterCondDirective = false;
			}

			// Intercept variable expansions so $(shell ...) emits a function.call.
			if (remaining[0] === '$') {
				const v = this.matchVariable(remaining);
				if (v) {
					this.emitVariable(v, pos, tokens);
					pos += v.length;
					sawLeadingWord = true;
					continue;
				}
			}
			const token = this.getNextToken(remaining, pos, state, line, !sawLeadingWord);
			if (token) {
				if (token.type !== 'text' || token.text.trim() !== '') {
					sawLeadingWord = true;
				}
				if (token.type === 'keyword.control' && (token.text === 'ifeq' || token.text === 'ifneq')) {
					afterCondDirective = true;
				}
				// A bare word left of the assignment operator is the variable being defined.
				if (token.type === 'variable' && assignOp !== -1 && token.start < assignOp) {
					token.type = 'variable.definition';
				}
				tokens.push(token);
				pos = token.end;
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				pos += 1;
			}
		}
	}

	/**
	 * Sub-tokenize an `ifeq`/`ifneq` conditional argument pair `(arg1,arg2)` starting at the
	 * `(` at `open`. Emits the parens as punctuation.paren, the top-level comma as a
	 * separator, and each operand's interior (variables, nested expansions, literal words)
	 * with full sub-tokenization. Returns the position just past the closing `)`, or past the
	 * unterminated remainder if there is no close.
	 */
	private emitConditionalArgs(line: string, open: number, tokens: Token[]): number {
		// Locate the matching close paren and the top-level comma between the two operands,
		// skipping any parens that belong to nested `$(...)` expansions.
		let depth = 0;
		let comma = -1;
		let close = -1;
		for (let i = open; i < line.length; i++) {
			const c = line[i];
			if (c === '$' && (line[i + 1] === '(' || line[i + 1] === '{')) {
				depth++;
				i++;
				continue;
			}
			if (c === '(' || c === '{') depth++;
			else if (c === ')' || c === '}') {
				depth--;
				if (depth === 0) {
					close = i;
					break;
				}
			} else if (c === ',' && depth === 1 && comma === -1) {
				comma = i;
			}
		}

		tokens.push(createToken('punctuation.paren', '(', open));
		const argEnd = close === -1 ? line.length : close;
		if (comma === -1) {
			this.scanExpansionText(line.slice(open + 1, argEnd), open + 1, tokens, 'string');
		} else {
			this.scanExpansionText(line.slice(open + 1, comma), open + 1, tokens, 'string');
			tokens.push(createToken('punctuation.separator', ',', comma));
			this.scanExpansionText(line.slice(comma + 1, argEnd), comma + 1, tokens, 'string');
		}
		if (close !== -1) {
			tokens.push(createToken('punctuation.paren', ')', close));
			return close + 1;
		}
		return line.length;
	}

	/**
	 * Index of the assignment operator (`=` `:=` `::=` `+=` `?=` `!=`) on a make line, or -1
	 * when the line is not an assignment. Skips operators inside `$(...)` expansions and stops
	 * at a comment. A rule colon (`target:`) reached before any operator means the line is a
	 * rule, not an assignment, so -1 is returned.
	 */
	private findAssignmentOp(line: string, start: number): number {
		let depth = 0;
		for (let i = start; i < line.length; i++) {
			const c = line[i];
			if (c === '#') return -1;
			if (c === '$' && (line[i + 1] === '(' || line[i + 1] === '{')) {
				depth++;
				i++;
				continue;
			}
			if (depth > 0) {
				if (c === ')' || c === '}') depth--;
				continue;
			}
			if (c === '=') {
				// A bare `=` (and `:=`/`::=`/`+=`/`?=`/`!=` — the operator char itself).
				return i;
			}
			if (c === ':') {
				// `:=` / `::=` are assignment operators; report the `:` start.
				if (line[i + 1] === '=' || (line[i + 1] === ':' && line[i + 2] === '=')) return i;
				// A plain rule colon: this is a target rule, not an assignment.
				return -1;
			}
		}
		return -1;
	}

	/** Scan recipe-body text from `start`: only comments and $(...) expansions highlight. */
	private scanRecipeBody(line: string, start: number, tokens: Token[]): void {
		let pos = start;
		let plainStart = start;
		const flushPlain = (end: number) => {
			if (end > plainStart) {
				tokens.push(createToken('text', line.slice(plainStart, end), plainStart));
			}
		};
		while (pos < line.length) {
			const c = line[pos];
			if (c === '$') {
				const v = this.matchVariable(line.slice(pos));
				if (v) {
					flushPlain(pos);
					this.emitVariable(v, pos, tokens);
					pos += v.length;
					plainStart = pos;
					continue;
				}
				// `$$` is an escaped literal dollar; keep it plain.
				if (line[pos + 1] === '$') {
					pos += 2;
					continue;
				}
			}
			pos += 1;
		}
		flushPlain(line.length);
	}

	private getNextToken(
		text: string,
		pos: number,
		state: MakefileTokenizerState,
		line: string,
		atLineStart: boolean
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Escaped literal hash: `\#` is a literal `#`, NOT a comment (GNU make strips the
		// backslash and keeps the hash as a value character). Consume the two-char escape
		// atomically so the comment branch below never sees an escaped hash.
		if (text.startsWith('\\#')) {
			return createToken('string.escape', '\\#', pos);
		}

		// Comments run to end of line.
		if (text.startsWith('#')) {
			return createToken('comment.line', text, pos);
		}

		// Escaped literal dollar: `$$`. (Real $(...) expansions are intercepted by the
		// callers before getNextToken so they can emit fine-grained tokens.)
		if (text.startsWith('$$')) {
			return createToken('text', '$$', pos);
		}

		// Leading directive keyword (first word of the logical line).
		if (atLineStart) {
			const before = line.slice(0, pos);
			if (/^[ \t]*$/.test(before)) {
				const dirMatch = text.match(/^-?[A-Za-z][A-Za-z0-9_-]*/);
				if (dirMatch && directives.has(dirMatch[0])) {
					const word = dirMatch[0];
					if (word === 'define') state.inDefine = true;
					return createToken('keyword.control', word, pos);
				}
			}
		}

		// Assignment operators: = := ::= += ?= !=
		const assignMatch = text.match(/^(?:::=|:=|\?=|\+=|!=|=)/);
		if (assignMatch) {
			return createToken('operator.assignment', assignMatch[0], pos);
		}

		// Numbers (rare in makefiles, but keep them styled where they occur). Only treat
		// a numeric literal as a number when it spans a WHOLE bare word — i.e. it is not
		// a leading digit run of a longer word such as a version string (`1.6.0`) or a
		// flag value (`12abc`). Otherwise the word would be carved into a `number` plus a
		// stray `variable`/word remainder.
		const numMatch = text.match(/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?)/);
		if (numMatch && !this.isInsideWord(text, line, pos) && this.isWholeWord(text, numMatch[0])) {
			const lit = numMatch[0];
			let numType: TokenType = 'number.integer';
			if (/^0[xX]/.test(lit)) numType = 'number.hex';
			else if (/^0[bB]/.test(lit)) numType = 'number.binary';
			else if (lit.includes('.')) numType = 'number.float';
			return createToken(numType, lit, pos);
		}

		// Special targets / dotted names (e.g. .PHONY appearing as a prerequisite).
		const dottedMatch = text.match(/^\.[A-Za-z_][A-Za-z0-9_]*/);
		if (dottedMatch && specialTargets.has(dottedMatch[0])) {
			return createToken('constant.builtin', dottedMatch[0], pos);
		}

		// Bare words: prerequisites, values, in-line directive words.
		const identMatch = text.match(/^[^\s:=#$()'"`]+/);
		if (identMatch) {
			let word = identMatch[0];
			// The bare-word class does not exclude `+`, `?`, `!`, so a no-space append /
			// conditional / shell assignment (`CFLAGS+=-g`, `PREFIX?=/usr/local`, `DATE!=date`)
			// would swallow the operator's leading char into the variable name and leave the
			// `=` to mis-tokenize as a plain recursive `=`. If the word ends in one of those
			// chars and the very next character is `=`, give the char back so the next pass
			// matches the full `+=` / `?=` / `!=` operator. A mid-word `+`/`?`/`!` (a value like
			// `-a+b`) is untouched because it is not followed by `=`.
			if (
				word.length > 1 &&
				(word.endsWith('+') || word.endsWith('?') || word.endsWith('!')) &&
				text[word.length] === '='
			) {
				word = word.slice(0, -1);
			}
			return createToken(this.classifyIdentifier(word), word, pos);
		}

		// Punctuation that survives outside expansions.
		const punctMatch = text.match(/^[()[\]{},;:]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';' || char === ':') type = 'punctuation.separator';
			return createToken(type, char, pos);
		}

		return null;
	}

	/** Avoid splitting a number out of an embedded digit run inside a bare word. */
	private isInsideWord(text: string, line: string, pos: number): boolean {
		if (pos === 0) return false;
		const prev = line[pos - 1];
		return /[A-Za-z_]/.test(prev) && /^\d/.test(text);
	}

	/**
	 * Whether `match` (a leading numeric literal in `text`) is the entire bare word, i.e.
	 * the very next character is a word boundary the bare-word scanner would not consume.
	 * A trailing `.`, `-`, digit or letter means the digits are just a prefix of a longer
	 * word (a version like `1.6.0`, a value like `12abc`) and must not become a number.
	 */
	private isWholeWord(text: string, match: string): boolean {
		if (match.length >= text.length) return true;
		const next = text[match.length];
		// Same delimiter set as the bare-word identifier regex below.
		return /[\s:=#$()'"`]/.test(next);
	}

	private classifyIdentifier(word: string): TokenType {
		if (directives.has(word)) {
			return 'keyword.control';
		}
		if (specialTargets.has(word)) {
			return 'constant.builtin';
		}
		return 'variable';
	}

	/**
	 * Match a leading variable expansion at the start of `text`. Returns the matched
	 * literal (including the `$` and any wrapping parens/braces), or null. Handles:
	 *  - automatic vars: $@ $< $^ $? $* $% $+ $| and their D/F forms $(@D) etc.
	 *  - $(NAME), ${NAME}, including nested $(...) and substitution $(VAR:a=b).
	 *  - single-char variable $X.
	 */
	private matchVariable(text: string): string | null {
		if (text[0] !== '$') return null;
		const second = text[1];
		if (second === '(' || second === '{') {
			const open = second;
			const close = open === '(' ? ')' : '}';
			let depth = 0;
			for (let i = 1; i < text.length; i++) {
				const c = text[i];
				if (c === open) depth++;
				else if (c === close) {
					depth--;
					if (depth === 0) return text.slice(0, i + 1);
				}
			}
			// Unterminated expansion: take the rest of the line.
			return text;
		}
		// Automatic variables: a single following char.
		if (second && '@<^?*%+|'.includes(second)) {
			return text.slice(0, 2);
		}
		// $X single-letter variable.
		if (second && /[A-Za-z_]/.test(second)) {
			return text.slice(0, 2);
		}
		return null;
	}

	/**
	 * Emit a variable expansion as fine-grained tokens: the `$(` / `${` wrapper as
	 * string.template, a leading built-in function name as function.call, and the inner
	 * body sub-tokenized (nested `$(...)`, substitution refs `$(VAR:pat=repl)`, and
	 * comma-separated function arguments). Falls back to fine-grained automatic-variable
	 * tokens for `$@` / `$(@D)` / `$X` forms. Pushed onto `tokens`.
	 */
	private emitVariable(matched: string, pos: number, tokens: Token[]): void {
		const open = matched[1];
		if (open !== '(' && open !== '{') {
			// $@, $<, $X, ... — a single variable token.
			tokens.push(createToken('variable', matched, pos));
			return;
		}
		const close = open === '(' ? ')' : '}';
		const hasClose = matched.endsWith(close);
		const innerStart = 2;
		const innerEnd = hasClose ? matched.length - 1 : matched.length;
		const inner = matched.slice(innerStart, innerEnd);
		const innerPos = pos + innerStart;

		// Opening `$(` (or `${`) — template-delimiter coloring for the expansion wrapper.
		tokens.push(createToken('string.template', matched.slice(0, 2), pos));

		// An automatic-variable reference wrapped for its dir/file form: `$(@D)`, `$(<F)`,
		// `$(^D)` etc. The body is a single automatic var char optionally followed by D/F.
		const autoMatch = inner.match(/^([@<^?*%+|])([DF]?)$/);
		if (autoMatch) {
			tokens.push(createToken('variable', inner, innerPos));
		} else {
			// Leading built-in function call: `$(shell ...)`, `$(call f,a,b)`, `$(patsubst ...)`.
			const fnMatch = inner.match(/^([A-Za-z][A-Za-z0-9-]*)([ \t])/);
			if (fnMatch && builtinFunctions.has(fnMatch[1])) {
				const fnName = fnMatch[1];
				tokens.push(createToken('function.call', fnName, innerPos));
				// The whitespace separating the function name from its first argument.
				const wsLen = fnMatch[2].length;
				tokens.push(createToken('text', fnMatch[2], innerPos + fnName.length));
				const argStart = fnName.length + wsLen;
				this.scanFunctionArgs(fnName, inner.slice(argStart), innerPos + argStart, tokens);
			} else if (this.findSubstColon(inner) !== -1) {
				// Substitution reference: `$(VAR:pat=repl)` / `$(VAR:.c=.o)`.
				this.emitSubstitutionRef(inner, innerPos, tokens);
			} else if (inner.length > 0) {
				// Plain variable reference, possibly containing nested `$(...)`.
				this.scanExpansionText(inner, innerPos, tokens, 'variable');
			}
		}

		// Closing paren/brace.
		if (hasClose) {
			tokens.push(createToken('string.template', close, pos + matched.length - 1));
		}
	}

	/**
	 * Index of the substitution colon inside a `$(VAR:pat=repl)` body, or -1. The colon
	 * must sit at top level (not inside a nested `$(...)`) and the body must also contain
	 * a top-level `=` after it for it to be a real substitution reference.
	 */
	private findSubstColon(inner: string): number {
		let depth = 0;
		let colon = -1;
		for (let i = 0; i < inner.length; i++) {
			const c = inner[i];
			if (c === '$' && (inner[i + 1] === '(' || inner[i + 1] === '{')) {
				depth++;
				i++;
				continue;
			}
			if (c === '(' || c === '{') depth++;
			else if (c === ')' || c === '}') {
				if (depth > 0) depth--;
			} else if (depth === 0) {
				if (c === ':' && colon === -1) colon = i;
				else if (c === '=' && colon !== -1) return colon;
			}
		}
		return -1;
	}

	/**
	 * Emit a `$(VAR:pat=repl)` substitution reference: the variable name, the `:` and `=`
	 * as assignment-flavored operators, and the pattern/replacement (which may themselves
	 * contain nested `$(...)`).
	 */
	private emitSubstitutionRef(inner: string, basePos: number, tokens: Token[]): void {
		const colon = this.findSubstColon(inner);
		const eq = inner.indexOf('=', colon + 1);
		// Variable name (may itself be an expansion such as `$(SRCS)`).
		this.scanExpansionText(inner.slice(0, colon), basePos, tokens, 'variable');
		tokens.push(createToken('operator.assignment', ':', basePos + colon));
		// Pattern between `:` and `=`.
		this.scanExpansionText(inner.slice(colon + 1, eq), basePos + colon + 1, tokens, 'string');
		tokens.push(createToken('operator.assignment', '=', basePos + eq));
		// Replacement after `=`.
		this.scanExpansionText(inner.slice(eq + 1), basePos + eq + 1, tokens, 'string');
	}

	/**
	 * Tokenize the comma-separated arguments of a built-in function. Top-level commas are
	 * separators; nested `$(...)` and `${...}` are recursed into so a comma inside a nested
	 * expansion does not split an argument. The first argument of `foreach`/`call` macro
	 * functions is the loop/parameter variable name, emitted as `variable.parameter`.
	 */
	private scanFunctionArgs(fnName: string, args: string, basePos: number, tokens: Token[]): void {
		const firstArgIsParam = fnName === 'foreach' || fnName === 'call';
		let argIndex = 0;
		let segStart = 0;
		let depth = 0;
		const flushArg = (end: number) => {
			const seg = args.slice(segStart, end);
			const role: TokenType = firstArgIsParam && argIndex === 0 ? 'variable.parameter' : 'string';
			this.scanExpansionText(seg, basePos + segStart, tokens, role);
		};
		for (let i = 0; i < args.length; i++) {
			const c = args[i];
			if (c === '$' && (args[i + 1] === '(' || args[i + 1] === '{')) {
				depth++;
				i++;
				continue;
			}
			if (depth > 0) {
				if (c === ')' || c === '}') depth--;
				continue;
			}
			if (c === ',') {
				flushArg(i);
				tokens.push(createToken('punctuation.separator', ',', basePos + i));
				segStart = i + 1;
				argIndex++;
			}
		}
		flushArg(args.length);
	}

	/**
	 * Tokenize a stretch of expansion text that may contain nested `$(...)` expansions and
	 * automatic variables interleaved with literal characters. Literal runs are emitted with
	 * `literalType` (e.g. `variable` for a name body, `string` for a function-argument body);
	 * nested expansions are recursed through `emitVariable` so they get full sub-tokenization.
	 */
	private scanExpansionText(
		text: string,
		basePos: number,
		tokens: Token[],
		literalType: TokenType
	): void {
		let pos = 0;
		let plainStart = 0;
		const flushPlain = (end: number) => {
			if (end > plainStart) {
				tokens.push(createToken(literalType, text.slice(plainStart, end), basePos + plainStart));
			}
		};
		while (pos < text.length) {
			if (text[pos] === '$') {
				const v = this.matchVariable(text.slice(pos));
				if (v) {
					flushPlain(pos);
					this.emitVariable(v, basePos + pos, tokens);
					pos += v.length;
					plainStart = pos;
					continue;
				}
				if (text[pos + 1] === '$') {
					// `$$` escaped dollar — keep with the literal run.
					pos += 2;
					continue;
				}
			}
			pos += 1;
		}
		flushPlain(text.length);
	}

	/** Tokenize an endef / stray make line with the generic scanner. */
	private scanGeneric(line: string, tokens: Token[]): void {
		const state: MakefileTokenizerState = {};
		let pos = 0;
		while (pos < line.length) {
			const remaining = line.slice(pos);
			if (remaining[0] === '$') {
				const v = this.matchVariable(remaining);
				if (v) {
					this.emitVariable(v, pos, tokens);
					pos += v.length;
					continue;
				}
			}
			const token = this.getNextToken(remaining, pos, state, line, pos === 0);
			if (token) {
				tokens.push(token);
				pos = token.end;
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				pos += 1;
			}
		}
	}
}

export function createMakefileTokenizer() {
	return new MakefileTokenizer();
}
