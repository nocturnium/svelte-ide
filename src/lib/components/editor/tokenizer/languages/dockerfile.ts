/**
 * Dockerfile tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Dockerfile instructions (the first word on a logical line). Matched
// case-insensitively; conventionally uppercase.
const instructions = new Set([
	'add',
	'arg',
	'cmd',
	'copy',
	'entrypoint',
	'env',
	'expose',
	'from',
	'healthcheck',
	'label',
	'maintainer',
	'onbuild',
	'run',
	'shell',
	'stopsignal',
	'user',
	'volume',
	'workdir'
]);

// Control-flow-flavored instructions get keyword.control; the rest keyword.
const controlInstructions = new Set(['cmd', 'entrypoint', 'from', 'healthcheck', 'onbuild', 'run']);

interface DockerfileTokenizerState extends TokenizerState {
	/** Still inside the same logical line: a previous physical line ended with `\`. */
	inContinuation?: boolean;
	/** The leading instruction word of the current logical line has been consumed. */
	afterInstruction?: boolean;
	/** Lowercase leading instruction of the current logical line (threads across `\` continuations). */
	instruction?: string;
	/**
	 * Pending BuildKit heredoc closing delimiters, in order. While non-empty,
	 * physical lines are heredoc *body* content (a shell script or file data) and
	 * are emitted verbatim — they must NOT be lexed as Dockerfile instructions.
	 * Each entry is the bare delimiter word; `tabStripped` mirrors a `<<-` start
	 * (the closing line may be indented with leading tabs).
	 */
	heredocDelims?: { word: string; tabStripped: boolean }[];
}

export class DockerfileTokenizer {
	language = 'dockerfile';

	getInitialState(): DockerfileTokenizerState {
		return {};
	}

	tokenizeLine(
		line: string,
		lineNumber: number,
		prevState?: DockerfileTokenizerState
	): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: DockerfileTokenizerState = { ...prevState };
		// Copy the heredoc stack so we never mutate the previous line's state object.
		if (state.heredocDelims) state.heredocDelims = state.heredocDelims.slice();

		// Heredoc body: while delimiters are pending, this physical line is verbatim
		// body content (shell script / file data), NOT a Dockerfile instruction.
		if (state.heredocDelims && state.heredocDelims.length > 0) {
			const next = state.heredocDelims[0];
			// The closing line is the delimiter word alone (leading tabs allowed for `<<-`).
			const candidate = next.tabStripped ? line.replace(/^\t+/, '') : line;
			if (candidate === next.word) {
				state.heredocDelims = state.heredocDelims.slice(1);
			}
			tokens.push(createToken('text', line.length > 0 ? line : '', 0));
			return { lineNumber, tokens, text: line, state };
		}

		// A new logical line begins unless the previous physical line continued
		// via a trailing backslash. Reset the per-logical-line instruction flag.
		const continued = state.inContinuation === true;
		if (!continued) {
			state.afterInstruction = false;
			// A fresh logical line has no instruction context yet; `as`/`none` are
			// only keywords in their own instruction (FROM/HEALTHCHECK), so clear it.
			state.instruction = undefined;
		}
		// Clear continuation; it is re-set below if this line ends with `\`.
		state.inContinuation = false;

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos, state, line);

			if (token) {
				tokens.push(token);
				pos = token.end;
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				pos += 1;
			}
		}

		// BuildKit heredocs: `RUN <<EOF` / `COPY <<-EOT file` / `RUN <<"EOF"`.
		// Collect every here-doc opener on this logical line, in order; the next
		// physical line(s) are body content until each delimiter closes. A `\`
		// continuation does not open the body early — body starts on the next line.
		if (!this.endsInComment(tokens)) {
			const openers = this.collectHeredocOpeners(line);
			if (openers.length > 0) {
				state.heredocDelims = [...(state.heredocDelims ?? []), ...openers];
				// A heredoc body takes over the next line; cancel any `\` continuation
				// so the body is not mis-read as a continued logical line.
				state.inContinuation = false;
				if (tokens.length === 0) tokens.push(createToken('text', '', 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Line continuation: a trailing backslash (only whitespace after it)
		// keeps the logical line open into the next physical line.
		if (/\\\s*$/.test(line) && !this.endsInComment(tokens)) {
			state.inContinuation = true;
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	/** Whether the final non-whitespace token is a comment (a `\` inside a comment is not a continuation). */
	private endsInComment(tokens: Token[]): boolean {
		for (let i = tokens.length - 1; i >= 0; i--) {
			const t = tokens[i];
			if (t.type === 'text' && t.text.trim() === '') continue;
			return t.type === 'comment.line';
		}
		return false;
	}

	/**
	 * Find BuildKit heredoc openers (`<<WORD`, `<<-WORD`, `<<"WORD"`, `<<'WORD'`)
	 * on a logical line, in source order. A redirection like `2>&1` or `> file`
	 * is single `<`/`>` and never matches. Quoted delimiters close on the bare
	 * word (the quotes only suppress expansion in the body, which we don't lex).
	 */
	private collectHeredocOpeners(line: string): { word: string; tabStripped: boolean }[] {
		const openers: { word: string; tabStripped: boolean }[] = [];
		const re = /<<(-?)\s*(?:"([A-Za-z_][\w.-]*)"|'([A-Za-z_][\w.-]*)'|([A-Za-z_][\w.-]*))/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(line)) !== null) {
			const word = m[2] ?? m[3] ?? m[4];
			if (!word) continue;
			openers.push({ word, tabStripped: m[1] === '-' });
		}
		return openers;
	}

	private getNextToken(
		text: string,
		pos: number,
		state: DockerfileTokenizerState,
		line: string
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Comments / parser directives (# syntax=, # escape=) run to EOL.
		if (text.startsWith('#')) {
			return createToken('comment.line', text, pos);
		}

		// Leading instruction keyword: the first word of a logical line.
		if (!state.afterInstruction) {
			const before = line.slice(0, pos);
			// Only treat as instruction if nothing but whitespace precedes it.
			if (/^[ \t]*$/.test(before)) {
				const instrMatch = text.match(/^[A-Za-z][A-Za-z]*/);
				if (instrMatch && instructions.has(instrMatch[0].toLowerCase())) {
					state.afterInstruction = true;
					const word = instrMatch[0];
					state.instruction = word.toLowerCase();
					const type: TokenType = controlInstructions.has(word.toLowerCase())
						? 'keyword.control'
						: 'keyword';
					return createToken(type, word, pos);
				}
			}
		}

		// Variable expansion: ${name}, ${name:-default}, ${name:+alt}, $name.
		if (text.startsWith('$')) {
			const braced = text.match(/^\$\{[^}]*\}/);
			if (braced) {
				return createToken('variable', braced[0], pos);
			}
			const simple = text.match(/^\$[A-Za-z_][A-Za-z0-9_]*/);
			if (simple) {
				return createToken('variable', simple[0], pos);
			}
		}

		// Long flags: --platform=..., --from=..., --chown=..., --interval=...
		// Emit the `--flag` name only; the rest is scanned normally.
		const flagMatch = text.match(/^--[A-Za-z][A-Za-z0-9-]*/);
		if (flagMatch) {
			return createToken('variable.parameter', flagMatch[0], pos);
		}

		// Double-quoted strings
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos, '"');
		}

		// Single-quoted strings
		if (text.startsWith("'")) {
			return this.tokenizeString(text, pos, "'");
		}

		// Numbers (ports, signals, intervals like 30s are split: number then unit).
		const numMatch = text.match(/^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)/);
		if (numMatch && !this.isInsideWord(text, line, pos)) {
			return createToken('number', numMatch[0], pos);
		}

		// Identifiers / bare words (image refs, args, package names, in-line keywords).
		const identMatch = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, state), word, pos);
		}

		// Operators (assignment in ENV/ARG/LABEL key=value, &&/|| in RUN scripts).
		const opMatch = text.match(/^(?:&&|\|\||>>|<<|[=|&<>])/);
		if (opMatch) {
			const op = opMatch[0];
			let type: TokenType = 'operator';
			if (op === '=') type = 'operator.assignment';
			else if (op === '&&' || op === '||') type = 'operator.logical';
			return createToken(type, op, pos);
		}

		// Punctuation (JSON-array forms, separators, accessors).
		const punctMatch = text.match(/^[{}[\](),:;]/);
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

	/** Avoid treating digits embedded in a bare word (e.g. node18) as a standalone number. */
	private isInsideWord(text: string, line: string, pos: number): boolean {
		if (pos === 0) return false;
		const prev = line[pos - 1];
		return /[A-Za-z_]/.test(prev) && /^\d/.test(text);
	}

	private classifyIdentifier(word: string, state: DockerfileTokenizerState): TokenType {
		// `as` and `none` are keywords ONLY in their own instruction context
		// (FROM ... AS <name>; HEALTHCHECK NONE). Everywhere else — shell args,
		// flag values like `--network=none`, image refs — they are bare words.
		const lower = word.toLowerCase();
		if (lower === 'as' && state.instruction === 'from') {
			return 'keyword';
		}
		if (lower === 'none' && state.instruction === 'healthcheck') {
			return 'keyword';
		}
		return 'variable';
	}

	private tokenizeString(text: string, pos: number, delimiter: string): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === delimiter) {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			i++;
		}
		// Unterminated string: consume the rest of the line (Dockerfile strings
		// do not span physical lines except via `\` continuation, handled per-line).
		return createToken('string', text.slice(0, i), pos);
	}
}

export function createDockerfileTokenizer() {
	return new DockerfileTokenizer();
}
