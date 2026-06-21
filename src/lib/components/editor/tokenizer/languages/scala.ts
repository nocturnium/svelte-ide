/**
 * Scala tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (def, class, etc.). Scala 3 adds `enum`, `given`, `extension`.
const definitionKeywords = new Set([
	'def',
	'class',
	'trait',
	'object',
	'type',
	'val',
	'var',
	'case',
	'enum',
	'given',
	'extension'
]);

// Storage / modifier keywords. Includes Scala 3 soft modifiers (`inline`,
// `opaque`, `transparent`, `open`, `infix`) which, while context-sensitive in
// the grammar, are universally highlighted as modifiers by Scala editors.
const storageKeywords = new Set([
	'private',
	'protected',
	'final',
	'sealed',
	'abstract',
	'implicit',
	'lazy',
	'override',
	'inline',
	'opaque',
	'transparent',
	'open',
	'infix'
]);

// Control-flow keywords (`then` is a Scala 3 control keyword)
const controlKeywords = new Set([
	'if',
	'else',
	'then',
	'match',
	'for',
	'while',
	'do',
	'yield',
	'return',
	'throw',
	'try',
	'catch',
	'finally'
]);

// Module keywords (`export` is the Scala 3 sibling of `import`)
const moduleKeywords = new Set(['import', 'package', 'export']);

// Other plain keywords. Scala 3 soft keywords `using`, `derives`, `end` are
// included here so they render as keywords rather than bare identifiers.
const otherKeywords = new Set([
	'new',
	'this',
	'super',
	'extends',
	'with',
	'forSome',
	'using',
	'derives',
	'end'
]);

// All keywords (union used for fast membership checks)
const keywords = new Set<string>([
	...definitionKeywords,
	...storageKeywords,
	...controlKeywords,
	...moduleKeywords,
	...otherKeywords
]);

// Built-in types
const builtinTypes = new Set([
	'Int',
	'Long',
	'Double',
	'Float',
	'Boolean',
	'Char',
	'String',
	'Unit',
	'Any',
	'AnyRef',
	'Nothing',
	'List',
	'Map',
	'Option',
	'Seq'
]);

// Boolean / null literals
const booleanLiterals = new Set(['true', 'false']);

interface ScalaTokenizerState extends TokenizerState {
	/** Inside a triple-double-quoted multi-line string. */
	inTripleString?: boolean;
}

export class ScalaTokenizer {
	language = 'scala';

	getInitialState(): ScalaTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: ScalaTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: ScalaTokenizerState = { ...prevState };

		// Resume a block comment carried over from a previous line.
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

		// Resume a triple-quoted string carried over from a previous line.
		if (state.inTripleString) {
			const endIdx = line.indexOf('"""');
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + 3), 0));
				pos = endIdx + 3;
				state.inTripleString = false;
			} else {
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
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

	private getNextToken(text: string, pos: number, state: ScalaTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}

		// Block comments
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 2), pos);
			} else {
				state.inBlockComment = true;
				return createToken('comment.block', text, pos);
			}
		}

		// Interpolated / triple / plain strings.
		// A string may be prefixed by an interpolator identifier glued to the opening
		// quote: s"...", f"...", raw"...", and ARBITRARY custom interpolators such as
		// json"...", sql"...", uri"...". Per the Scala grammar any identifier directly
		// abutting a quote (no intervening whitespace) is an interpolator prefix, so the
		// prefix is consumed as part of the string token rather than split off.
		const strMatch = text.match(/^([A-Za-z_][A-Za-z0-9_]*)?"""|^([A-Za-z_][A-Za-z0-9_]*)?"/);
		if (strMatch) {
			const prefix = (strMatch[1] ?? strMatch[2] ?? '') as string;
			const afterPrefix = text.slice(prefix.length);
			if (afterPrefix.startsWith('"""')) {
				return this.tokenizeTripleString(text, pos, prefix.length, state);
			}
			return this.tokenizeString(text, pos, prefix.length);
		}

		// Char literals vs. symbol literals.
		// Char: 'a' or '\n' (has a closing quote). Symbol: 'name (apostrophe + identifier).
		if (text.startsWith("'")) {
			const charMatch = text.match(/^'(?:\\(?:[btnfr"'\\]|u[0-9a-fA-F]{4}|[0-7]{1,3})|[^'\\])'/);
			if (charMatch) {
				return createToken('string', charMatch[0], pos);
			}
			const symbolMatch = text.match(/^'[A-Za-z_][A-Za-z0-9_]*/);
			if (symbolMatch) {
				return createToken('constant.builtin', symbolMatch[0], pos);
			}
		}

		// Numbers: hex, or decimal/float with optional underscores and L/f/F/d/D suffix.
		// A trailing dot is only part of the number when followed by a fractional digit
		// (e.g. 3.14); in `42.toString` the dot is a member accessor, so the integer form
		// must NOT swallow it.
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+[lL]?|0[bB][01_]+[lL]?|(?:\d[\d_]*\.\d[\d_]*|\.\d[\d_]*|\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?[lLfFdD]?)/
		);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Backtick-quoted identifiers: `yield`, `type`, etc. The contents are always a plain
		// identifier even when they spell a reserved word, so never classify as a keyword.
		if (text.startsWith('`')) {
			const backtickMatch = text.match(/^`[^`\n]+`/);
			if (backtickMatch) {
				return createToken('variable', backtickMatch[0], pos);
			}
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators (longest first). Includes Scala-specific arrows and type bounds.
		const opMatch = text.match(
			/^(?:=:=|<:|>:|=>|<-|->|<%|&&|\|\||==|!=|<=|>=|<<|>>>|>>|[+\-*/%&|^~<>=!]=?)/
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
		// Boolean / null literals
		if (booleanLiterals.has(word)) {
			return 'constant.boolean';
		}
		if (word === 'null') {
			return 'constant.null';
		}

		// Keywords
		if (keywords.has(word)) {
			if (definitionKeywords.has(word)) return 'keyword.definition';
			if (storageKeywords.has(word)) return 'keyword.storage';
			if (controlKeywords.has(word)) return 'keyword.control';
			if (moduleKeywords.has(word)) return 'keyword.module';
			return 'keyword';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		const afterWord = context.slice(wordLength).trim();

		// Identifier immediately followed by ( => function call.
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// PascalCase => a class/type.
		if (/^[A-Z][A-Za-z0-9]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	private classifyOperator(op: string): TokenType {
		if (op === '=>' || op === '<-' || op === '->' || op === '<:' || op === '>:' || op === '<%') {
			return 'keyword.operator';
		}
		if (op === '=') return 'operator.assignment';
		if (op === '+=' || op === '-=' || op === '*=' || op === '/=' || op === '%=') {
			return 'operator.assignment';
		}
		if (op === '==' || op === '!=' || op === '<=' || op === '>=' || op === '<' || op === '>') {
			return 'operator.comparison';
		}
		if (op === '=:=') return 'operator.comparison';
		if (op === '&&' || op === '||' || op === '!') return 'operator.logical';
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
			return 'operator.arithmetic';
		}
		return 'operator';
	}

	private tokenizeString(text: string, pos: number, prefixLen: number): Token {
		// Start scanning just past the prefix and the opening quote.
		let i = prefixLen + 1;
		while (i < text.length) {
			if (text[i] === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (text[i] === '"') {
				return createToken('string', text.slice(0, i + 1), pos);
			}
			if (text[i] === '\n') {
				break;
			}
			i++;
		}
		// Unterminated single-line string: consume to end of line (stays lossless).
		return createToken('string', text.slice(0, i), pos);
	}

	private tokenizeTripleString(
		text: string,
		pos: number,
		prefixLen: number,
		state: ScalaTokenizerState
	): Token {
		const searchStart = prefixLen + 3;
		const endIdx = text.indexOf('"""', searchStart);
		if (endIdx !== -1) {
			return createToken('string', text.slice(0, endIdx + 3), pos);
		}
		state.inTripleString = true;
		return createToken('string', text, pos);
	}
}

export function createScalaTokenizer() {
	return new ScalaTokenizer();
}
