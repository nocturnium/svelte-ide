/**
 * Kotlin tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (keyword.definition)
const definitionKeywords = new Set([
	'fun',
	'class',
	'interface',
	'object',
	'enum',
	'data',
	'sealed',
	'annotation'
]);

// Storage / modifier keywords (keyword.storage)
const storageKeywords = new Set([
	'val',
	'var',
	'const',
	'lateinit',
	'open',
	'override',
	'abstract',
	'private',
	'public',
	'protected',
	'internal',
	'companion',
	'suspend',
	'inline',
	'noinline',
	'crossinline',
	'vararg'
]);

// Control-flow keywords (keyword.control)
const controlKeywords = new Set([
	'if',
	'else',
	'when',
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

// Module keywords (keyword.module)
const moduleKeywords = new Set(['import', 'package']);

// Remaining plain keywords (keyword)
const otherKeywords = new Set([
	'in',
	'is',
	'as',
	'by',
	'this',
	'super',
	'typealias',
	'where',
	'reified'
]);

// Built-in types (type.builtin)
const builtinTypes = new Set([
	'Int',
	'Long',
	'Short',
	'Byte',
	'Char',
	'Boolean',
	'Double',
	'Float',
	'String',
	'Unit',
	'Any',
	'Nothing',
	'List',
	'Map',
	'Set',
	'Array'
]);

interface KotlinTokenizerState extends TokenizerState {
	/** Inside a /* *\/ block comment (or /** *\/ KDoc) spanning lines */
	inBlockComment?: boolean;
	/** The block comment was opened as a KDoc (/**) */
	blockCommentDoc?: boolean;
	/** Inside a raw triple-quoted string spanning lines */
	inRawString?: boolean;
}

export class KotlinTokenizer {
	language = 'kotlin';

	getInitialState(): KotlinTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: KotlinTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: KotlinTokenizerState = { ...prevState };

		// Resume a block comment / KDoc continuation
		if (state.inBlockComment) {
			const type: TokenType = state.blockCommentDoc ? 'comment.doc' : 'comment.block';
			const endIdx = line.indexOf('*/');
			if (endIdx !== -1) {
				tokens.push(createToken(type, line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
				state.blockCommentDoc = false;
			} else {
				tokens.push(createToken(type, line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a raw triple-quoted string continuation
		if (state.inRawString) {
			const endIdx = line.indexOf('"""');
			if (endIdx !== -1) {
				this.pushRawStringSegment(tokens, line.slice(0, endIdx + 3), 0);
				pos = endIdx + 3;
				state.inRawString = false;
			} else {
				this.pushRawStringSegment(tokens, line, 0);
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);

			// Strings can yield multiple tokens (template breakouts), so they are
			// handled inline and push directly into the token stream.
			if (remaining.startsWith('"""')) {
				pos = this.tokenizeRawString(tokens, remaining, pos, state);
				continue;
			}
			if (remaining.startsWith('"')) {
				pos = this.tokenizeString(tokens, remaining, pos);
				continue;
			}

			const token = this.getNextToken(remaining, pos, state);
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

	private getNextToken(text: string, pos: number, state: KotlinTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}

		// Block comments and KDoc
		if (text.startsWith('/*')) {
			const isDoc = text.startsWith('/**') && !text.startsWith('/**/');
			const type: TokenType = isDoc ? 'comment.doc' : 'comment.block';
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken(type, text.slice(0, endIdx + 2), pos);
			} else {
				state.inBlockComment = true;
				state.blockCommentDoc = isDoc;
				return createToken(type, text, pos);
			}
		}

		// Char literals
		if (text.startsWith("'")) {
			const charMatch = text.match(/^'(?:\\(?:u[0-9a-fA-F]{4}|[btnr'"\\$]|.)|[^'\\])'/);
			if (charMatch) {
				return createToken('string', charMatch[0], pos);
			}
		}

		// Annotations: @Identifier (optionally use-site target, e.g. @field:Json)
		if (text.startsWith('@')) {
			const annMatch = text.match(/^@[a-zA-Z_][a-zA-Z0-9_]*(?::[a-zA-Z_][a-zA-Z0-9_]*)?/);
			if (annMatch) {
				return createToken('type', annMatch[0], pos);
			}
		}

		// Numbers (hex, binary, decimal/float with underscores and suffixes).
		// The fractional part requires a digit after the dot so that the range
		// operator `..` (e.g. 0..9) is not mis-parsed as a float.
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)[uU]?[lLfF]?/
		);
		if (numMatch) {
			return this.classifyNumber(numMatch[0], pos);
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators
		const opMatch = text.match(
			/^(?:\?:|\?\.|!!|\.\.|->|::|==|!=|<=|>=|&&|\|\||\+\+|--|[+\-*/%]=|[+\-*/%<>=!&|]=?)/
		);
		if (opMatch) {
			return createToken(this.classifyOperator(opMatch[0]), opMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;?@]/);
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

	private classifyOperator(op: string): TokenType {
		if (op === '==' || op === '!=' || op === '<=' || op === '>=' || op === '<' || op === '>') {
			return 'operator.comparison';
		}
		if (op === '&&' || op === '||' || op === '!') {
			return 'operator.logical';
		}
		if (op === '=' || /^[+\-*/%]=$/.test(op)) {
			return 'operator.assignment';
		}
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
			return 'operator.arithmetic';
		}
		return 'operator';
	}

	private classifyNumber(num: string, pos: number): Token {
		if (/^0[xX]/.test(num)) {
			return createToken('number.hex', num, pos);
		}
		if (/^0[bB]/.test(num)) {
			return createToken('number.binary', num, pos);
		}
		if (/[.eEfF]/.test(num)) {
			return createToken('number.float', num, pos);
		}
		return createToken('number.integer', num, pos);
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		// Boolean / null constants
		if (word === 'true' || word === 'false') return 'constant.boolean';
		if (word === 'null') return 'constant.null';

		// Keywords
		if (definitionKeywords.has(word)) return 'keyword.definition';
		if (storageKeywords.has(word)) return 'keyword.storage';
		if (controlKeywords.has(word)) return 'keyword.control';
		if (moduleKeywords.has(word)) return 'keyword.module';
		if (otherKeywords.has(word)) return 'keyword';

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Function call: identifier immediately followed by (
		const afterWord = context.slice(wordLength);
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// PascalCase => type
		if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	/**
	 * Tokenize a double-quoted string, breaking out string templates ($name and
	 * ${expr}) and escape sequences. Pushes directly into `tokens`; returns the
	 * new position after the closing quote (or end of line).
	 */
	private tokenizeString(tokens: Token[], text: string, pos: number): number {
		let i = 1; // consume opening "
		let segStart = 0; // start of the current plain-string segment (relative to text)

		const flushSegment = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken('string', text.slice(segStart, end), pos + segStart));
			}
		};

		while (i < text.length) {
			const ch = text[i];

			// Escape sequence
			if (ch === '\\' && i + 1 < text.length) {
				flushSegment(i);
				tokens.push(createToken('string.escape', text.slice(i, i + 2), pos + i));
				i += 2;
				segStart = i;
				continue;
			}

			// Template: ${ expr }
			if (ch === '$' && text[i + 1] === '{') {
				flushSegment(i);
				let depth = 1;
				let j = i + 2;
				while (j < text.length && depth > 0) {
					if (text[j] === '{') depth++;
					else if (text[j] === '}') depth--;
					if (depth === 0) break;
					j++;
				}
				const end = j < text.length ? j + 1 : text.length;
				tokens.push(createToken('string.template', text.slice(i, end), pos + i));
				i = end;
				segStart = i;
				continue;
			}

			// Template: $name
			if (ch === '$' && /[a-zA-Z_]/.test(text[i + 1] ?? '')) {
				flushSegment(i);
				const nameMatch = text.slice(i).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*/);
				const tmpl = nameMatch ? nameMatch[0] : '$';
				tokens.push(createToken('string.template', tmpl, pos + i));
				i += tmpl.length;
				segStart = i;
				continue;
			}

			// Closing quote
			if (ch === '"') {
				flushSegment(i + 1);
				return pos + i + 1;
			}

			i++;
		}

		// Unterminated on this line — emit what remains as string (Kotlin double
		// strings don't span lines; this keeps the line lossless).
		flushSegment(text.length);
		return pos + text.length;
	}

	/**
	 * Tokenize a raw triple-quoted string ("""..."""). Raw strings have no escapes
	 * but DO support templates. May span multiple lines via state.inRawString.
	 * Pushes directly into `tokens`; returns the new position.
	 */
	private tokenizeRawString(
		tokens: Token[],
		text: string,
		pos: number,
		state: KotlinTokenizerState
	): number {
		const endIdx = text.indexOf('"""', 3);
		if (endIdx !== -1) {
			this.pushRawStringSegment(tokens, text.slice(0, endIdx + 3), pos);
			return pos + endIdx + 3;
		}
		// Unterminated — continues on the next line.
		state.inRawString = true;
		this.pushRawStringSegment(tokens, text, pos);
		return pos + text.length;
	}

	/**
	 * Push a raw-string chunk, breaking out $name / ${expr} templates. No escape
	 * handling (raw strings are literal). `chunkPos` is the absolute start.
	 */
	private pushRawStringSegment(tokens: Token[], chunk: string, chunkPos: number): void {
		let i = 0;
		let segStart = 0;

		const flushSegment = (end: number) => {
			if (end > segStart) {
				tokens.push(createToken('string', chunk.slice(segStart, end), chunkPos + segStart));
			}
		};

		while (i < chunk.length) {
			const ch = chunk[i];

			if (ch === '$' && chunk[i + 1] === '{') {
				flushSegment(i);
				let depth = 1;
				let j = i + 2;
				while (j < chunk.length && depth > 0) {
					if (chunk[j] === '{') depth++;
					else if (chunk[j] === '}') depth--;
					if (depth === 0) break;
					j++;
				}
				const end = j < chunk.length ? j + 1 : chunk.length;
				tokens.push(createToken('string.template', chunk.slice(i, end), chunkPos + i));
				i = end;
				segStart = i;
				continue;
			}

			if (ch === '$' && /[a-zA-Z_]/.test(chunk[i + 1] ?? '')) {
				flushSegment(i);
				const nameMatch = chunk.slice(i).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*/);
				const tmpl = nameMatch ? nameMatch[0] : '$';
				tokens.push(createToken('string.template', tmpl, chunkPos + i));
				i += tmpl.length;
				segStart = i;
				continue;
			}

			i++;
		}

		flushSegment(chunk.length);
	}
}

export function createKotlinTokenizer() {
	return new KotlinTokenizer();
}
