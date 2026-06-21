/**
 * Groovy tokenizer (also covers Gradle build scripts and Jenkinsfiles)
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Groovy keywords
const keywords = new Set([
	'def',
	'class',
	'interface',
	'enum',
	'trait',
	'public',
	'private',
	'protected',
	'static',
	'final',
	'abstract',
	'if',
	'else',
	'switch',
	'case',
	'default',
	'for',
	'while',
	'do',
	'break',
	'continue',
	'return',
	'throw',
	'throws',
	'try',
	'catch',
	'finally',
	'import',
	'package',
	'new',
	'this',
	'super',
	'extends',
	'implements',
	'in',
	'as',
	'instanceof',
	'assert',
	'it',
	'void',
	'goto',
	'native',
	'synchronized',
	'transient',
	'volatile'
]);

const definitionKeywords = new Set(['def', 'class', 'interface', 'enum', 'trait']);

const storageKeywords = new Set([
	'public',
	'private',
	'protected',
	'static',
	'final',
	'abstract',
	'native',
	'synchronized',
	'transient',
	'volatile',
	'void'
]);

const controlKeywords = new Set([
	'if',
	'else',
	'switch',
	'case',
	'default',
	'for',
	'while',
	'do',
	'break',
	'continue',
	'return',
	'throw',
	'try',
	'catch',
	'finally'
]);

const moduleKeywords = new Set(['import', 'package']);

const builtinConstants = new Set(['true', 'false', 'null']);

const builtinTypes = new Set([
	'String',
	'Integer',
	'List',
	'Map',
	'Object',
	'Boolean',
	'Closure',
	'int',
	'long',
	'short',
	'byte',
	'char',
	'float',
	'double',
	'boolean',
	'BigInteger',
	'BigDecimal',
	'Number',
	'Set',
	'Collection',
	'GString',
	'Class'
]);

interface GroovyTokenizerState extends TokenizerState {
	/** Inside a triple-single-quoted multi-line string */
	inTripleSingle?: boolean;
	/** Inside a triple-double-quoted multi-line GString */
	inTripleDouble?: boolean;
}

export class GroovyTokenizer {
	language = 'groovy';

	getInitialState(): GroovyTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: GroovyTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: GroovyTokenizerState = { ...prevState };

		// Resume a block comment from a previous line
		if (state.inBlockComment) {
			const endIdx = line.indexOf('*/');
			if (endIdx !== -1) {
				tokens.push(createToken('comment.block', line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
			} else {
				tokens.push(createToken('comment.block', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a triple-single-quoted multi-line string
		if (state.inTripleSingle) {
			const endIdx = line.indexOf("'''");
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + 3), 0));
				pos = endIdx + 3;
				state.inTripleSingle = false;
			} else {
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a triple-double-quoted multi-line GString
		if (state.inTripleDouble) {
			const endIdx = line.indexOf('"""');
			if (endIdx !== -1) {
				tokens.push(createToken('string.template', line.slice(0, endIdx + 3), 0));
				pos = endIdx + 3;
				state.inTripleDouble = false;
			} else {
				tokens.push(createToken('string.template', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos, state, tokens);

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
		state: GroovyTokenizerState,
		emitted: Token[]
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}

		// Shebang (e.g. Jenkinsfile / gradle scripts on line 1)
		if (pos === 0 && text.startsWith('#!')) {
			return createToken('comment.line', text, pos);
		}

		// Doc comments /** ... */
		if (text.startsWith('/**') && !text.startsWith('/**/')) {
			const endIdx = text.indexOf('*/', 3);
			if (endIdx !== -1) {
				return createToken('comment.doc', text.slice(0, endIdx + 2), pos);
			}
			state.inBlockComment = true;
			return createToken('comment.doc', text, pos);
		}

		// Block comments
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 2), pos);
			}
			state.inBlockComment = true;
			return createToken('comment.block', text, pos);
		}

		// Triple-quoted strings
		if (text.startsWith("'''")) {
			return this.tokenizeTripleString(text, pos, "'''", state);
		}
		if (text.startsWith('"""')) {
			return this.tokenizeTripleString(text, pos, '"""', state);
		}

		// Double-quoted GString (interpolated) => string.template
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos, '"', 'string.template');
		}

		// Single-quoted literal string
		if (text.startsWith("'")) {
			return this.tokenizeString(text, pos, "'", 'string');
		}

		// Slashy regex strings — only after =, (, comma, or `return` (avoids
		// confusing the division operator for a regex literal). Best effort.
		if (text.startsWith('/') && !text.startsWith('//') && this.regexAllowed(emitted)) {
			const regex = this.tokenizeSlashy(text, pos);
			if (regex) {
				return regex;
			}
		}

		// Numbers — decimal, hex, underscores, floats, and Groovy suffixes (G/L/I/f/d/g)
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?[gGlLiIfFdD]?)/
		);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators (longest first)
		const opMatch = text.match(
			/^(?:<=>|\*\*=|>>>=?|<<=|>>=|===?|!==?|<=|>=|&&|\|\||\+\+|--|\*\*|\?:|\?\.|\?=|\.\.<?|->|=~|==~|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[+\-*/%&|^!<>=~?])/
		);
		if (opMatch) {
			return createToken(this.classifyOperator(opMatch[0]), opMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;@]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';' || char === ':') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		// Built-in constants
		if (builtinConstants.has(word)) {
			if (word === 'true' || word === 'false') return 'constant.boolean';
			if (word === 'null') return 'constant.null';
			return 'constant.builtin';
		}

		// Keywords
		if (keywords.has(word)) {
			if (controlKeywords.has(word)) return 'keyword.control';
			if (definitionKeywords.has(word)) return 'keyword.definition';
			if (storageKeywords.has(word)) return 'keyword.storage';
			if (moduleKeywords.has(word)) return 'keyword.module';
			return 'keyword';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Function call: identifier immediately followed by (
		const afterWord = context.slice(wordLength);
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// PascalCase identifiers read as class/type names
		if (/^[A-Z][a-zA-Z0-9_$]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	private classifyOperator(op: string): TokenType {
		// Comparison (incl. spaceship, regex match, case-insensitive match)
		if (
			op === '==' ||
			op === '===' ||
			op === '!=' ||
			op === '!==' ||
			op === '<' ||
			op === '>' ||
			op === '<=' ||
			op === '>=' ||
			op === '<=>' ||
			op === '=~' ||
			op === '==~'
		) {
			return 'operator.comparison';
		}
		// Logical
		if (op === '&&' || op === '||' || op === '!') {
			return 'operator.logical';
		}
		// Arithmetic
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%' || op === '**') {
			return 'operator.arithmetic';
		}
		// Assignment (plain `=` and compound assignments ending in `=`)
		if (op === '=' || /^(?:\+|-|\*|\/|%|&|\||\^|>>>|<<|>>|\*\*)=$/.test(op)) {
			return 'operator.assignment';
		}
		return 'operator';
	}

	private regexAllowed(emitted: Token[]): boolean {
		// Find the last significant (non-whitespace) token already emitted.
		for (let i = emitted.length - 1; i >= 0; i--) {
			const t = emitted[i];
			if (t.type === 'text' && t.text.trim() === '') {
				continue;
			}
			// Slashy strings are typically valid after assignment, an open paren,
			// a comma, or the `return` keyword.
			if (t.type === 'operator.assignment' && t.text === '=') return true;
			if (t.type === 'punctuation.paren' && t.text === '(') return true;
			if (t.type === 'punctuation.separator' && t.text === ',') return true;
			if (t.type === 'keyword.control' && t.text === 'return') return true;
			// Groovy's regex-find/match operators (`=~`, `==~`) and the pattern
			// operator (`~/.../`) are essentially always followed by a slashy regex.
			// `==~` tokenizes as `==` then a standalone `~`, so allowing a trailing
			// `~` operator covers both `==~` and the leading pattern operator.
			if (t.type === 'operator.comparison' && t.text === '=~') return true;
			if (t.type === 'operator' && t.text === '~') return true;
			return false;
		}
		// Start of line: assume a statement context where a regex is plausible.
		return true;
	}

	private tokenizeSlashy(text: string, pos: number): Token | null {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === '/') {
				return createToken('string.regex', text.slice(0, i + 1), pos);
			}
			i++;
		}
		// Unterminated on this line — treat as not-a-regex (likely division).
		return null;
	}

	private tokenizeString(text: string, pos: number, delimiter: string, type: TokenType): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === delimiter) {
				return createToken(type, text.slice(0, i + 1), pos);
			}
			i++;
		}
		// Unterminated single-line string — emit what we have (stays lossless).
		return createToken(type, text.slice(0, i), pos);
	}

	private tokenizeTripleString(
		text: string,
		pos: number,
		delimiter: string,
		state: GroovyTokenizerState
	): Token {
		const type: TokenType = delimiter === '"""' ? 'string.template' : 'string';
		const endIdx = text.indexOf(delimiter, 3);
		if (endIdx !== -1) {
			return createToken(type, text.slice(0, endIdx + 3), pos);
		}
		if (delimiter === '"""') {
			state.inTripleDouble = true;
		} else {
			state.inTripleSingle = true;
		}
		return createToken(type, text, pos);
	}
}

export function createGroovyTokenizer(): GroovyTokenizer {
	return new GroovyTokenizer();
}
