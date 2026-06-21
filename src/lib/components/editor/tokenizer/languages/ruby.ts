/**
 * Ruby tokenizer
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
}

export class RubyTokenizer {
	language = 'ruby';

	getInitialState(): RubyTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: RubyTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: RubyTokenizerState = { ...prevState };

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
			tokens.push(createToken('string', line, 0));
			if (terminatorRe.test(line)) {
				state.heredocTerminator = undefined;
				state.heredocIndented = undefined;
			}
			return { lineNumber, tokens, text: line, state };
		}

		// A =begin at the very start of a line opens a block comment.
		if (/^=begin\b/.test(line)) {
			tokens.push(createToken('comment.block', line, 0));
			state.inBlockComment = true;
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
		fullLine: string,
		state: RubyTokenizerState
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('#')) {
			return createToken('comment.line', text, pos);
		}

		// Heredoc openers — best effort. Records the terminator into state so the
		// body lines are consumed as a string until the terminator line.
		const heredocMatch = text.match(/^<<([~-]?)(["'`]?)([A-Za-z_][A-Za-z0-9_]*)\2/);
		if (heredocMatch) {
			const indented = heredocMatch[1] === '~' || heredocMatch[1] === '-';
			state.heredocTerminator = heredocMatch[3];
			state.heredocIndented = indented;
			return createToken('string', heredocMatch[0], pos);
		}

		// Percent-literal word/symbol arrays: %w[...] %i[...] %W() %I{}
		const percentMatch = text.match(/^%[wiWI]([([{<])/);
		if (percentMatch) {
			return this.tokenizePercentLiteral(text, pos, percentMatch[1]);
		}

		// Symbols: :name, :"...", :+ operator symbols
		if (text.startsWith(':') && !text.startsWith('::')) {
			const symbolToken = this.tokenizeSymbol(text, pos);
			if (symbolToken) {
				return symbolToken;
			}
		}

		// Double-quoted strings (interpolation-aware)
		if (text.startsWith('"')) {
			return this.tokenizeDoubleString(text, pos);
		}

		// Single-quoted strings (literal, no interpolation)
		if (text.startsWith("'")) {
			return this.tokenizeSingleString(text, pos);
		}

		// Backtick command strings
		if (text.startsWith('`')) {
			return this.tokenizeSingleString(text, pos, '`');
		}

		// Numbers
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?|\d[\d_]*(?:[eE][+-]?\d[\d_]*)?))/
		);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Instance / class / global variables: @x, @@x, $x
		const sigilMatch = text.match(/^(?:@@?|\$)[a-zA-Z_][a-zA-Z0-9_]*/);
		if (sigilMatch) {
			return createToken('variable', sigilMatch[0], pos);
		}

		// Identifiers and keywords (may end with ? or ! — predicate / bang methods)
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*[?!]?/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators
		const opMatch = text.match(
			/^(?:<=>|===|\*\*=?|<<=?|>>=?|&&=?|\|\|=?|=~|!~|->|=>|\.\.\.?|::|[+\-*/%&|^]=?|[<>!=]=?|[~?])/
		);
		if (opMatch) {
			return createToken('operator', opMatch[0], pos);
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
			else return createToken('operator', char, pos);
			return createToken(type, char, pos);
		}

		return createToken('text', fullLine[pos], pos);
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
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

		const afterWord = context.slice(wordLength).trim();

		// Built-in / kernel methods
		if (builtinFunctions.has(word)) {
			if (afterWord.startsWith('(')) {
				return 'function.call';
			}
			return 'function';
		}

		// Constant (CapitalizedName) => class/type
		if (/^[A-Z]/.test(word)) {
			return 'type.class';
		}

		// identifier immediately followed by ( => call
		if (context.slice(wordLength).startsWith('(')) {
			return 'function.call';
		}

		return 'variable';
	}

	/** Symbol literal: :name, :"interpolated", :+ etc. Returns null if not a symbol. */
	private tokenizeSymbol(text: string, pos: number): Token | null {
		// Quoted symbol :"..." or :'...'
		const quoted = text.match(/^:(["'])/);
		if (quoted) {
			const delim = quoted[1];
			let i = 2;
			while (i < text.length) {
				if (text[i] === '\\' && i + 1 < text.length) {
					i += 2;
					continue;
				}
				if (text[i] === delim) {
					return createToken('constant.builtin', text.slice(0, i + 1), pos);
				}
				i++;
			}
			return createToken('constant.builtin', text.slice(0, i), pos);
		}

		// Plain symbol :name (optionally predicate/bang/setter)
		const plain = text.match(/^:[a-zA-Z_][a-zA-Z0-9_]*[?!=]?/);
		if (plain) {
			return createToken('constant.builtin', plain[0], pos);
		}

		// Operator symbols like :+ :<< :[] :==
		const opSym = text.match(/^:(?:\[\]=?|<=>|===|==|<<|>>|[+\-*/%<>!~^&|]=?)/);
		if (opSym) {
			return createToken('constant.builtin', opSym[0], pos);
		}

		return null;
	}

	/** Single-quoted (or backtick) string: literal, only \\ and \' (or \`) escapes. */
	private tokenizeSingleString(text: string, pos: number, delim = "'"): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === delim) {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}

	/**
	 * Double-quoted string with escapes and #{...} interpolation. Scans to the
	 * closing quote (or end of line), honouring backslash escapes. A double-quoted
	 * string supports interpolation, so when a `#{` appears in the span the whole
	 * string is classified as `string.template` per the language spec; otherwise it
	 * is a plain `string`. Always returns one token covering the full span, so the
	 * result is lossless.
	 */
	private tokenizeDoubleString(text: string, pos: number): Token {
		let i = 1;
		let hasInterpolation = false;
		let end = text.length;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === '#' && text[i + 1] === '{') {
				hasInterpolation = true;
			}
			if (text[i] === '"') {
				end = i + 1;
				break;
			}
			i++;
		}
		const type: TokenType = hasInterpolation ? 'string.template' : 'string';
		return createToken(type, text.slice(0, end), pos);
	}

	/** %w[...] / %i[...] etc. word & symbol array literals. Best effort, single line. */
	private tokenizePercentLiteral(text: string, pos: number, open: string): Token {
		const close = open === '(' ? ')' : open === '[' ? ']' : open === '{' ? '}' : '>';
		// text[0]='%', text[1]=letter (w/i/W/I), text[2]=opener — scan body from index 3.
		let i = 3;
		let depth = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === open && open !== close) {
				depth++;
			} else if (text[i] === close) {
				depth--;
				if (depth === 0) {
					return createToken('string', text.slice(0, i + 1), pos);
				}
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createRubyTokenizer() {
	return new RubyTokenizer();
}
