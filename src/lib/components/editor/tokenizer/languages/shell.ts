/**
 * Shell / Bash tokenizer
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

interface ShellTokenizerState extends TokenizerState {
	/** Inside an ANSI-C ($'...') or single/double quote spanning lines is not standard,
	 *  but a heredoc body is threaded here. */
	inHeredoc?: boolean;
	/** The heredoc terminator word (without leading <<, <<- markers). */
	heredocDelimiter?: string;
	/** Whether the heredoc was <<- (leading-tab stripping); affects terminator match. */
	heredocStripTabs?: boolean;
	/** Whether the heredoc body is quoted (no expansion); kept for completeness. */
	heredocQuoted?: boolean;
}

export class ShellTokenizer {
	language = 'shell';

	getInitialState(): ShellTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: ShellTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: ShellTokenizerState = { ...prevState };

		// Resume an in-progress heredoc body. The whole line is part of the body
		// unless it is the (optionally tab-indented) terminator line.
		if (state.inHeredoc) {
			const delimiter = state.heredocDelimiter ?? '';
			const candidate = state.heredocStripTabs ? line.replace(/^\t+/, '') : line;
			if (candidate === delimiter) {
				// Terminator line: emit indentation (if any) then the delimiter word.
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
			tokens.push(createToken('string', line, 0));
			return { lineNumber, tokens, text: line, state };
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos, line, state);

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

		return { lineNumber, tokens, text: line, state };
	}

	private getNextToken(
		text: string,
		pos: number,
		line: string,
		state: ShellTokenizerState
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Shebang (only meaningful at column 0, but treat any leading #! as a doc comment)
		if (pos === 0 && text.startsWith('#!')) {
			return createToken('comment.line', text, pos);
		}

		// Comments: '#' begins a comment when at a word boundary (start of line or
		// preceded by whitespace / a command separator). Inside a word like foo#bar
		// the '#' is a literal character.
		if (text.startsWith('#') && this.isCommentStart(line, pos)) {
			return createToken('comment.line', text, pos);
		}

		// Heredoc operator: <<- or << followed by an optional quote and a word.
		const heredocMatch = text.match(/^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
		if (heredocMatch) {
			const stripTabs = text.startsWith('<<-');
			state.inHeredoc = true;
			state.heredocDelimiter = heredocMatch[2];
			state.heredocStripTabs = stripTabs;
			state.heredocQuoted = heredocMatch[1] !== '';
			return createToken('operator', heredocMatch[0], pos);
		}

		// Here-string: <<<
		if (text.startsWith('<<<')) {
			return createToken('operator', '<<<', pos);
		}

		// Single-quoted strings: literal, no interpolation.
		if (text.startsWith("'")) {
			return this.tokenizeSingleQuote(text, pos);
		}

		// ANSI-C quoting: $'...'
		if (text.startsWith("$'")) {
			return this.tokenizeAnsiC(text, pos);
		}

		// Double-quoted strings: emitted as a single string token (interpolation kept inline).
		if (text.startsWith('"')) {
			return this.tokenizeDoubleQuote(text, pos);
		}

		// Variables: $name, ${...}, $1, $@, $?, $#, $$, $!, $0, $*, $-
		if (text.startsWith('$')) {
			const varToken = this.tokenizeVariable(text, pos);
			if (varToken) {
				return varToken;
			}
		}

		// Backtick command substitution delimiter.
		if (text.startsWith('`')) {
			return createToken('punctuation', '`', pos);
		}

		// Redirection / file-descriptor operators (e.g. 2>&1, >>, &>, >|).
		const redirMatch = text.match(/^(?:\d*>>|\d*>&\d*|\d*>\||&>>|&>|\d*>|\d*<&\d*|\d*<|<>)/);
		if (redirMatch) {
			return createToken('operator', redirMatch[0], pos);
		}

		// Control operators: && || ;; ;& ;;& | |& & ;
		const ctrlMatch = text.match(/^(?:&&|\|\||;;&|;;|;&|\|&|[|&;])/);
		if (ctrlMatch) {
			return createToken('operator', ctrlMatch[0], pos);
		}

		// Test / comparison operators within conditionals.
		const cmpMatch = text.match(/^(?:==|!=|=~|<=|>=)/);
		if (cmpMatch) {
			return createToken('operator', cmpMatch[0], pos);
		}

		// Assignment / single '='
		if (text.startsWith('=')) {
			return createToken('operator', '=', pos);
		}

		// Flags: -x, --long-name (best effort: parameter).
		const flagMatch = text.match(/^--?[A-Za-z][A-Za-z0-9-]*/);
		if (flagMatch) {
			const word = flagMatch[0];
			if (testOperators.has(word)) {
				return createToken('operator', word, pos);
			}
			return createToken('variable.parameter', word, pos);
		}

		// Numbers (integers; shell has no native floats).
		const numMatch = text.match(/^\d+/);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Identifiers / words / keywords / builtins.
		const identMatch = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Punctuation / brackets / parens / braces.
		const punctMatch = text.match(/^[{}()[\].,:]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ':') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		// Standalone arithmetic / glob operators.
		const opMatch = text.match(/^[+\-*/%~!<>^?]/);
		if (opMatch) {
			return createToken('operator', opMatch[0], pos);
		}

		return createToken('text', text[0], pos);
	}

	/** A '#' starts a comment only at a token boundary (start of line or after whitespace/separator). */
	private isCommentStart(line: string, pos: number): boolean {
		if (pos === 0) return true;
		const prev = line[pos - 1];
		return prev === ' ' || prev === '\t' || prev === ';' || prev === '&' || prev === '|';
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		// Boolean-ish constants
		if (word === 'true' || word === 'false') {
			return 'constant.boolean';
		}

		// Control-flow keywords
		if (controlKeywords.has(word)) {
			if (word === 'function') return 'keyword.definition';
			if (word === 'in') return 'keyword.operator';
			return 'keyword.control';
		}

		// Builtins
		if (builtins.has(word)) {
			return 'function';
		}

		// Function call: word immediately followed by '('
		const afterWord = context.slice(wordLength);
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// Variable assignment target: NAME=...
		if (afterWord.startsWith('=')) {
			return 'variable.definition';
		}

		return 'variable';
	}

	/** Single-quoted: everything until the next single quote, literally. */
	private tokenizeSingleQuote(text: string, pos: number): Token {
		const endIdx = text.indexOf("'", 1);
		if (endIdx !== -1) {
			return createToken('string', text.slice(0, endIdx + 1), pos);
		}
		return createToken('string', text, pos);
	}

	/** ANSI-C $'...' with backslash escapes. */
	private tokenizeAnsiC(text: string, pos: number): Token {
		let i = 2;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === "'") {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			i++;
		}
		return createToken('string', text, pos);
	}

	/** Double-quoted with backslash escapes; interpolation is kept inside the string token. */
	private tokenizeDoubleQuote(text: string, pos: number): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === '"') {
				return createToken('string.template', text.slice(0, i + 1), pos);
			}
			i++;
		}
		return createToken('string.template', text, pos);
	}

	/** $name, ${...}, and special parameters. Returns null if '$' is not a valid sigil here. */
	private tokenizeVariable(text: string, pos: number): Token | null {
		// $(...) command substitution => treat $( as punctuation so the inner re-tokenizes.
		if (text.startsWith('$(')) {
			return createToken('punctuation', '$(', pos);
		}

		// ${...} parameter expansion: capture the whole braced span on this line.
		if (text.startsWith('${')) {
			const endIdx = text.indexOf('}', 2);
			if (endIdx !== -1) {
				return createToken('variable', text.slice(0, endIdx + 1), pos);
			}
			return createToken('variable', text, pos);
		}

		// $name
		const nameMatch = text.match(/^\$[A-Za-z_][A-Za-z0-9_]*/);
		if (nameMatch) {
			return createToken('variable', nameMatch[0], pos);
		}

		// Special parameters: $1 $@ $? $# $$ $! $0 $* $- $_
		const specialMatch = text.match(/^\$[@?#$!*\-0-9_]/);
		if (specialMatch) {
			return createToken('variable', specialMatch[0], pos);
		}

		return null;
	}
}

export function createShellTokenizer() {
	return new ShellTokenizer();
}
