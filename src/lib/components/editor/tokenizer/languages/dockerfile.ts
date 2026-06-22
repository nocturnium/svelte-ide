/**
 * Dockerfile tokenizer
 *
 * Closed limitations (vs. the prior flat line-tokenizer):
 *  - Variable expansion `${name:-default}` interiors are SUB-TOKENIZED: the `${`/`}`
 *    delimiters become punctuation.brace, the parameter name is variable, the
 *    `:-`/`:+`/`:=`/`:?`/`#`/`%`/`/` modifier is operator, and the default expression
 *    is tokenized (nested ${...}/$name, words, numbers). Bare `$name` / `$$` / `$1`
 *    stay a single variable token.
 *  - Strings sub-tokenize escapes (`\n`, `\t`, `\"`, `\uXXXX`, `\xNN`, `\0`, …) as
 *    string.escape, and double-quoted strings expand `$VAR` / `${...}` inline
 *    (single-quoted strings are literal, per POSIX sh).
 *  - Numbers carry precise subtypes: number.hex / number.binary / number.float /
 *    number.integer.
 *  - The `# escape=` parser directive is honored: it switches the logical-line
 *    continuation character (default `\`) to a backtick, threading across the file.
 *    It is only recognized in the leading directive block, before the first instruction.
 *  - The nested CMD/ENTRYPOINT/RUN after HEALTHCHECK / ONBUILD keeps control-keyword
 *    classification even when it is not the leading word.
 *
 * Remaining inherent limit of a zero-dependency LINE tokenizer: it does not parse the
 * full shell grammar inside RUN bodies (word-splitting, command substitution `$(...)`
 * structure, here-strings); bare shell words are classified as variable, which the
 * theme styles. Modelling shell is a whole second language and out of scope for a
 * Dockerfile line tokenizer.
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
	/** Still inside the same logical line: a previous physical line ended with the escape char. */
	inContinuation?: boolean;
	/** The leading instruction word of the current logical line has been consumed. */
	afterInstruction?: boolean;
	/** Lowercase leading instruction of the current logical line (threads across continuations). */
	instruction?: string;
	/**
	 * The active line-continuation / escape character. Defaults to `\`; the
	 * `# escape=` parser directive (only valid before the first instruction) may
	 * switch it to a backtick. Threads across the whole file via state.
	 */
	escapeChar?: string;
	/**
	 * True once any non-directive, non-comment, non-blank line has been seen: parser
	 * directives (`# escape=`, `# syntax=`) are only honored before that point.
	 */
	directivesClosed?: boolean;
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
		const escapeChar = state.escapeChar ?? '\\';

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
		// via a trailing escape char. Reset the per-logical-line instruction flag.
		const continued = state.inContinuation === true;
		if (!continued) {
			state.afterInstruction = false;
			// A fresh logical line has no instruction context yet; `as`/`none` are
			// only keywords in their own instruction (FROM/HEALTHCHECK), so clear it.
			state.instruction = undefined;
		}
		// Clear continuation; it is re-set below if this line ends with the escape char.
		state.inContinuation = false;

		// Parser directives (`# escape=`, `# syntax=`) are only valid in the leading
		// comment block, before the first build instruction. Honor `# escape=` here.
		if (!continued && !state.directivesClosed) {
			const directive = this.matchParserDirective(line);
			if (directive) {
				if (directive.name === 'escape' && (directive.value === '`' || directive.value === '\\')) {
					state.escapeChar = directive.value;
				}
				tokens.push(createToken('comment.line', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
			// A blank line or another comment keeps the directive window open; any
			// other content closes it (directives must precede the first instruction).
			if (line.trim() !== '' && !line.trimStart().startsWith('#')) {
				state.directivesClosed = true;
			}
		} else if (!continued) {
			// Already past the directive block; nothing to do.
		}

		while (pos < line.length) {
			const before = tokens.length;
			pos = this.scanInto(line, pos, state, tokens);
			// Safety: scanInto must always make progress.
			if (tokens.length === before && pos < line.length) {
				tokens.push(createToken('text', line[pos], pos));
				pos += 1;
			}
		}

		// BuildKit heredocs: `RUN <<EOF` / `COPY <<-EOT file` / `RUN <<"EOF"`.
		// Collect every here-doc opener on this logical line, in order; the next
		// physical line(s) are body content until each delimiter closes.
		if (!this.endsInComment(tokens)) {
			const openers = this.collectHeredocOpeners(line);
			if (openers.length > 0) {
				state.heredocDelims = [...(state.heredocDelims ?? []), ...openers];
				// A heredoc body takes over the next line; cancel any continuation
				// so the body is not mis-read as a continued logical line.
				state.inContinuation = false;
				if (tokens.length === 0) tokens.push(createToken('text', '', 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Line continuation: a trailing escape char (only whitespace after it)
		// keeps the logical line open into the next physical line.
		if (this.endsWithContinuation(line, escapeChar) && !this.endsInComment(tokens)) {
			state.inContinuation = true;
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	/** Match a `# escape=x` / `# syntax=...` parser directive (single directive on the line). */
	private matchParserDirective(line: string): { name: string; value: string } | null {
		const m = line.match(/^#\s*([A-Za-z]+)\s*=\s*(\S+)\s*$/);
		if (!m) return null;
		return { name: m[1].toLowerCase(), value: m[2] };
	}

	/** True if the physical line ends with the active continuation char followed only by whitespace. */
	private endsWithContinuation(line: string, escapeChar: string): boolean {
		const trimmed = line.replace(/\s+$/, '');
		return trimmed.endsWith(escapeChar);
	}

	/** Whether the final non-whitespace token is a comment (an escape char inside a comment is not a continuation). */
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

	/**
	 * Scan one lexeme (or one composite construct that emits several tokens) starting
	 * at `pos`, pushing token(s) into `tokens`, and return the new position. May push
	 * multiple tokens for constructs that sub-tokenize (`${...}`, quoted strings).
	 */
	private scanInto(
		line: string,
		pos: number,
		state: DockerfileTokenizerState,
		tokens: Token[]
	): number {
		const text = line.slice(pos);

		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			tokens.push(createToken('text', wsMatch[0], pos));
			return pos + wsMatch[0].length;
		}

		// Comments / parser directives (# syntax=, # escape=) run to EOL.
		if (text.startsWith('#')) {
			tokens.push(createToken('comment.line', text, pos));
			return pos + text.length;
		}

		// Leading instruction keyword: the first word of a logical line.
		if (!state.afterInstruction) {
			const before = line.slice(0, pos);
			if (/^[ \t]*$/.test(before)) {
				const instrMatch = text.match(/^[A-Za-z][A-Za-z]*/);
				if (instrMatch && instructions.has(instrMatch[0].toLowerCase())) {
					state.afterInstruction = true;
					const word = instrMatch[0];
					state.instruction = word.toLowerCase();
					const type: TokenType = controlInstructions.has(word.toLowerCase())
						? 'keyword.control'
						: 'keyword';
					tokens.push(createToken(type, word, pos));
					return pos + word.length;
				}
			}
		}

		// Variable expansion: braced ${...} is sub-tokenized; $name / $$ / $1 are single.
		if (text.startsWith('${')) {
			const consumed = this.expandBraced(text, pos, tokens);
			if (consumed > 0) return pos + consumed;
		}
		if (text.startsWith('$')) {
			const simple = text.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*|\$|[0-9]+|[@*#?!-])/);
			if (simple) {
				tokens.push(createToken('variable', simple[0], pos));
				return pos + simple[0].length;
			}
		}

		// Long flags: --platform=..., --from=..., --chown=..., --interval=...
		const flagMatch = text.match(/^--[A-Za-z][A-Za-z0-9-]*/);
		if (flagMatch) {
			tokens.push(createToken('variable.parameter', flagMatch[0], pos));
			return pos + flagMatch[0].length;
		}

		// Double-quoted strings interpolate (escapes + $expansions); single-quoted are literal.
		if (text.startsWith('"')) {
			return this.scanString(text, pos, '"', true, tokens);
		}
		if (text.startsWith("'")) {
			return this.scanString(text, pos, "'", false, tokens);
		}

		// Numbers (ports, signals, intervals like 30s are split: number then unit).
		const numMatch = text.match(/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?)/);
		if (numMatch && !this.isInsideWord(text, line, pos)) {
			tokens.push(createToken(this.numberType(numMatch[0]), numMatch[0], pos));
			return pos + numMatch[0].length;
		}

		// Identifiers / bare words (image refs, args, package names, in-line keywords).
		const identMatch = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			tokens.push(createToken(this.classifyIdentifier(word, state), word, pos));
			return pos + word.length;
		}

		// Operators (assignment in ENV/ARG/LABEL key=value, &&/|| in RUN scripts).
		const opMatch = text.match(/^(?:&&|\|\||>>|<<|[=|&<>])/);
		if (opMatch) {
			const op = opMatch[0];
			let type: TokenType = 'operator';
			if (op === '=') type = 'operator.assignment';
			else if (op === '&&' || op === '||') type = 'operator.logical';
			tokens.push(createToken(type, op, pos));
			return pos + op.length;
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
			tokens.push(createToken(type, char, pos));
			return pos + char.length;
		}

		// Single unknown char -> verbatim text.
		tokens.push(createToken('text', line[pos], pos));
		return pos + 1;
	}

	/**
	 * Emit the sub-tokens of a braced `${ ... }` expansion into `out`, returning the
	 * number of source characters consumed (0 if `text` does not start a valid `${`).
	 * Grammar handled: `${name}`, `${name:-default}`, `${name:+alt}`, `${name:=def}`,
	 * `${name:?err}`, `${name#pat}`, `${name%pat}`, `${name/a/b}` (default kept as
	 * words), and nested `${...}` / `$name` / numbers in the default. Unterminated
	 * `${` consumes to EOL, still lossless.
	 */
	private expandBraced(text: string, pos: number, out: Token[]): number {
		if (!text.startsWith('${')) return 0;
		out.push(createToken('punctuation.brace', '${', pos));
		let i = 2;
		// Parameter name (or positional/special).
		const nameM = text.slice(i).match(/^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*#?!])/);
		if (nameM) {
			out.push(createToken('variable', nameM[0], pos + i));
			i += nameM[0].length;
		}
		// Optional modifier operator: :- :+ := :? : ## # %% % // /.
		const modM = text.slice(i).match(/^(?::[-+=?]|:|##|#|%%|%|\/\/|\/)/);
		if (modM) {
			out.push(createToken('operator', modM[0], pos + i));
			i += modM[0].length;
		}
		// Default / replacement expression up to the matching `}` (tracks nesting).
		let depth = 1;
		while (i < text.length && depth > 0) {
			const ch = text[i];
			if (ch === '}') {
				depth--;
				out.push(createToken('punctuation.brace', '}', pos + i));
				i += 1;
				if (depth === 0) break;
				continue;
			}
			if (ch === '{') {
				depth++;
				out.push(createToken('punctuation.brace', '{', pos + i));
				i += 1;
				continue;
			}
			// Nested expansion inside the default: the recursive call consumes its own
			// matching `}`, so our running `depth` is unchanged.
			if (text.startsWith('${', i)) {
				const consumed = this.expandBraced(text.slice(i), pos + i, out);
				if (consumed > 0) {
					i += consumed;
					continue;
				}
			}
			if (ch === '$') {
				const sm = text.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*|\$|[0-9]+)/);
				if (sm) {
					out.push(createToken('variable', sm[0], pos + i));
					i += sm[0].length;
					continue;
				}
			}
			if (ch === ' ' || ch === '\t') {
				const wsm = text.slice(i).match(/^[ \t]+/)!;
				out.push(createToken('text', wsm[0], pos + i));
				i += wsm[0].length;
				continue;
			}
			// A number literal in the default (e.g. ${PORT:-8080}).
			const prev = text[i - 1] ?? '';
			const dnum = text.slice(i).match(/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?)/);
			if (dnum && !/[A-Za-z0-9_]/.test(prev)) {
				out.push(createToken(this.numberType(dnum[0]), dnum[0], pos + i));
				i += dnum[0].length;
				continue;
			}
			// A bare word run (default literal, path, etc.) — stop at $ { } and space.
			const wordM = text.slice(i).match(/^[^${}\s]+/);
			if (wordM) {
				out.push(createToken('variable', wordM[0], pos + i));
				i += wordM[0].length;
				continue;
			}
			out.push(createToken('text', ch, pos + i));
			i += 1;
		}
		return i;
	}

	/**
	 * Scan a quoted string starting at `text[0]` into `out`, sub-tokenizing escape
	 * sequences (always) and, for interpolating (double-quoted) strings, `$VAR` /
	 * `${...}` expansions. The literal runs between specials are emitted as `string`;
	 * escapes as `string.escape`; expansions via the variable path. Returns the new
	 * absolute position. Unterminated strings consume to EOL (lossless).
	 */
	private scanString(
		text: string,
		pos: number,
		delimiter: string,
		interpolate: boolean,
		out: Token[]
	): number {
		let i = 1; // past the opening delimiter
		let literalStart = 0; // start of the current pending literal run (incl. opening quote)
		const flushLiteral = (end: number) => {
			if (end > literalStart) {
				out.push(createToken('string', text.slice(literalStart, end), pos + literalStart));
			}
			literalStart = end;
		};

		while (i < text.length) {
			const ch = text[i];
			// Escape sequences are only meaningful in double-quoted strings; in POSIX
			// single-quoted strings a backslash is a literal character and the string
			// ends at the next `'`, so we do NOT treat `\` specially there.
			if (interpolate && ch === '\\' && i + 1 < text.length) {
				const esc = this.matchEscape(text, i, delimiter);
				if (esc > 0) {
					flushLiteral(i);
					out.push(createToken('string.escape', text.slice(i, i + esc), pos + i));
					i += esc;
					literalStart = i;
					continue;
				}
				// Not a recognized escape: keep as literal, skip the pair to avoid mis-closing.
				i += 2;
				continue;
			}
			// Interpolation inside double quotes.
			if (interpolate && ch === '$') {
				if (text.startsWith('${', i)) {
					flushLiteral(i);
					const consumed = this.expandBraced(text.slice(i), pos + i, out);
					if (consumed > 0) {
						i += consumed;
						literalStart = i;
						continue;
					}
				}
				const sm = text.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*|\$|[0-9]+)/);
				if (sm) {
					flushLiteral(i);
					out.push(createToken('variable', sm[0], pos + i));
					i += sm[0].length;
					literalStart = i;
					continue;
				}
			}
			// Closing delimiter.
			if (ch === delimiter) {
				flushLiteral(i + 1);
				return pos + i + 1;
			}
			i++;
		}
		// Unterminated: flush the remainder as one string token.
		flushLiteral(text.length);
		return pos + text.length;
	}

	/**
	 * Length of a recognized escape sequence starting at `text[i]` (which is `\`).
	 * Recognizes: `\n \t \r \\ \" \' \0 \a \b \f \v`, `\xNN`, `\uNNNN`, `\u{N..}`,
	 * and the escaped string delimiter. Returns 0 if not a recognized escape.
	 */
	private matchEscape(text: string, i: number, delimiter: string): number {
		const next = text[i + 1];
		if (next === undefined) return 0;
		// \uXXXX or \u{XXXX}
		if (next === 'u') {
			const braced = text.slice(i).match(/^\\u\{[0-9a-fA-F]+\}/);
			if (braced) return braced[0].length;
			const fixed = text.slice(i).match(/^\\u[0-9a-fA-F]{4}/);
			if (fixed) return fixed[0].length;
			return 0;
		}
		// \xNN
		if (next === 'x') {
			const hex = text.slice(i).match(/^\\x[0-9a-fA-F]{2}/);
			if (hex) return hex[0].length;
			return 0;
		}
		// Single-char C-style escapes + escaped delimiter + escaped backslash.
		if ('ntr\\0abfv'.includes(next) || next === delimiter || next === '$' || next === '`') {
			return 2;
		}
		return 0;
	}

	/** Classify a numeric literal's precise subtype. */
	private numberType(num: string): TokenType {
		if (/^0[xX]/.test(num)) return 'number.hex';
		if (/^0[bB]/.test(num)) return 'number.binary';
		if (num.includes('.')) return 'number.float';
		return 'number.integer';
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
		// HEALTHCHECK ... CMD ... and ONBUILD CMD/RUN/ENTRYPOINT: the nested
		// instruction word is itself a control keyword even though it is not the
		// leading word of the physical line.
		if (
			(lower === 'cmd' || lower === 'entrypoint' || lower === 'run') &&
			(state.instruction === 'healthcheck' || state.instruction === 'onbuild')
		) {
			return 'keyword.control';
		}
		return 'variable';
	}
}

export function createDockerfileTokenizer() {
	return new DockerfileTokenizer();
}
