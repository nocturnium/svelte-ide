/**
 * Java tokenizer
 *
 * Design notes / closed caveats:
 *  - String & char & text-block ESCAPES are sub-tokenized: the literal body stays
 *    `string` while `\n`, `\t`, `\uXXXX`, `\"`, octal `\012`, etc. are emitted as
 *    `string.escape`. Multi-line text blocks thread the same escape handling.
 *  - GENERICS: a `<` that follows a type (or a generic `>` close) opens a generic
 *    context tracked via `angleDepth` in state. While open, `<`/`>` and the close
 *    shifts `>>`/`>>>` are split into individual `punctuation.bracket` tokens
 *    instead of operators. Relational `a < b` / shift `a >> b` stay operators.
 *    The depth threads across lines so a multi-line `Map<K,\n  V>` resolves.
 *  - PROPERTY ACCESS: an identifier after a `.` accessor is `property` (or
 *    `function.call` before `(`); ALL_CAPS members are `constant`.
 *  - CONSTANTS: ALL_CAPS identifiers (e.g. `MAX_SIZE`) classify as `constant`.
 *  - Java has no string interpolation, so there is no inner-expression
 *    sub-tokenization to do (String.format placeholders are runtime, not lexical).
 */

import type { LanguageTokenizer, Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (introduce a type)
const definitionKeywords = new Set(['class', 'interface', 'enum', 'record', 'void']);

// Storage / modifier keywords
const storageKeywords = new Set([
	'public',
	'private',
	'protected',
	'static',
	'final',
	'abstract',
	'synchronized',
	'volatile',
	'transient',
	'native',
	'strictfp',
	'default'
]);

// Control-flow keywords
const controlKeywords = new Set([
	'if',
	'else',
	'switch',
	'case',
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
	'assert'
]);

// Module / package keywords
const moduleKeywords = new Set(['import', 'package']);

// Remaining plain keywords
const otherKeywords = new Set([
	'new',
	'extends',
	'implements',
	'instanceof',
	'this',
	'super',
	'var',
	'sealed',
	'permits',
	'yield',
	'const',
	'goto'
]);

// Primitive / builtin types
const builtinTypes = new Set([
	'int',
	'long',
	'short',
	'byte',
	'char',
	'boolean',
	'float',
	'double',
	'void'
]);

// Commonly-used standard-library classes
const classTypes = new Set(['String', 'Object', 'Integer', 'List', 'Map', 'Optional']);

// Token types that, when they are the previous significant token, mean a following
// `<` opens a generic type-argument list (rather than a less-than operator).
const genericOpenAfter = new Set<TokenType>([
	'type',
	'type.class',
	'type.interface',
	'type.namespace',
	'type.builtin'
]);

interface JavaTokenizerState extends TokenizerState {
	/** Currently inside a multi-line text block (triple-quote). */
	inTextBlock?: boolean;
	/** Open generic angle-bracket depth carried across lines. */
	angleDepth?: number;
	/** Type of the previous significant (non-whitespace, non-comment) token. */
	prevSignificant?: TokenType;
	/** Text of the previous significant token (for `>` close after a type). */
	prevSignificantText?: string;
}

export class JavaTokenizer implements LanguageTokenizer {
	language = 'java';

	getInitialState(): JavaTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: JavaTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: JavaTokenizerState = { ...prevState };

		// Resume a block comment / Javadoc spanning multiple lines.
		if (state.inBlockComment) {
			const endIdx = line.indexOf('*/');
			const type: TokenType = state.custom?.doc ? 'comment.doc' : 'comment.block';
			if (endIdx !== -1) {
				tokens.push(createToken(type, line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
				state.custom = undefined;
			} else {
				tokens.push(createToken(type, line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a multi-line text block (triple-quote), sub-tokenizing escapes.
		if (state.inTextBlock) {
			const endIdx = line.indexOf('"""');
			if (endIdx !== -1) {
				this.pushStringWithEscapes(tokens, line.slice(0, endIdx + 3), 0);
				pos = endIdx + 3;
				state.inTextBlock = false;
			} else {
				this.pushStringWithEscapes(tokens, line, 0);
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const before = tokens.length;
			const consumed = this.emitNextToken(tokens, remaining, pos, state);

			if (consumed > 0) {
				// Track the previous significant token for context-sensitive decisions.
				for (let k = before; k < tokens.length; k++) {
					const t = tokens[k];
					if (t.type !== 'text' || t.text.trim() !== '') {
						if (
							t.type !== 'comment.line' &&
							t.type !== 'comment.block' &&
							t.type !== 'comment.doc'
						) {
							state.prevSignificant = t.type;
							state.prevSignificantText = t.text;
						}
					}
				}
				pos += consumed;
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

	/**
	 * Produce the next token(s) starting at `text`, pushing them onto `tokens`.
	 * Returns the number of characters consumed (0 if nothing matched).
	 */
	private emitNextToken(
		tokens: Token[],
		text: string,
		pos: number,
		state: JavaTokenizerState
	): number {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			tokens.push(createToken('text', wsMatch[0], pos));
			return wsMatch[0].length;
		}

		// Line comments
		if (text.startsWith('//')) {
			tokens.push(createToken('comment.line', text, pos));
			return text.length;
		}

		// Javadoc / block comments
		if (text.startsWith('/**') && !text.startsWith('/**/')) {
			const endIdx = text.indexOf('*/', 3);
			if (endIdx !== -1) {
				tokens.push(createToken('comment.doc', text.slice(0, endIdx + 2), pos));
				return endIdx + 2;
			}
			state.inBlockComment = true;
			state.custom = { doc: true };
			tokens.push(createToken('comment.doc', text, pos));
			return text.length;
		}
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				tokens.push(createToken('comment.block', text.slice(0, endIdx + 2), pos));
				return endIdx + 2;
			}
			state.inBlockComment = true;
			state.custom = { doc: false };
			tokens.push(createToken('comment.block', text, pos));
			return text.length;
		}

		// Text blocks (triple-quote). A text block opens when """ is the last
		// non-whitespace content on the line; otherwise treat a complete """..."""
		// on one line as an inline string.
		if (text.startsWith('"""')) {
			const after = text.slice(3);
			if (/^[ \t]*$/.test(after)) {
				state.inTextBlock = true;
				tokens.push(createToken('string', text, pos));
				return text.length;
			}
			const endIdx = text.indexOf('"""', 3);
			if (endIdx !== -1) {
				this.pushStringWithEscapes(tokens, text.slice(0, endIdx + 3), pos);
				return endIdx + 3;
			}
			state.inTextBlock = true;
			this.pushStringWithEscapes(tokens, text, pos);
			return text.length;
		}

		// Double-quoted strings
		if (text.startsWith('"')) {
			return this.emitString(tokens, text, pos, '"');
		}

		// Char literals
		if (text.startsWith("'")) {
			const charMatch = text.match(
				/^'(?:\\(?:[btnfrs0"'\\]|u+[0-9a-fA-F]{4}|[0-3]?[0-7]{1,2})|[^'\\])'/
			);
			if (charMatch) {
				this.pushStringWithEscapes(tokens, charMatch[0], pos);
				return charMatch[0].length;
			}
			return this.emitString(tokens, text, pos, "'");
		}

		// Annotations: @Identifier
		if (text.startsWith('@')) {
			const annotationMatch = text.match(/^@[a-zA-Z_][a-zA-Z0-9_.]*/);
			if (annotationMatch) {
				tokens.push(createToken('keyword', annotationMatch[0], pos));
				return annotationMatch[0].length;
			}
		}

		// Numbers: hex, binary, decimal/float with underscores, exponents, type suffixes.
		// Hex floating-point: 0x1.8p1, 0x1p-4, 0xA.Bp2f. The binary exponent `p` is
		// mandatory, so match this BEFORE the plain-hex rule (which would stop at the dot).
		const hexFloatMatch = text.match(
			/^0[xX](?:[0-9a-fA-F_]+\.?[0-9a-fA-F_]*|\.[0-9a-fA-F_]+)[pP][+-]?\d[\d_]*[fFdD]?/
		);
		if (hexFloatMatch) {
			tokens.push(createToken('number.float', hexFloatMatch[0], pos));
			return hexFloatMatch[0].length;
		}
		const hexMatch = text.match(/^0[xX][0-9a-fA-F_]+[lL]?/);
		if (hexMatch) {
			tokens.push(createToken('number.hex', hexMatch[0], pos));
			return hexMatch[0].length;
		}
		const binMatch = text.match(/^0[bB][01_]+[lL]?/);
		if (binMatch) {
			tokens.push(createToken('number.binary', binMatch[0], pos));
			return binMatch[0].length;
		}
		const numMatch = text.match(
			/^(?:\d[\d_]*\.[\d_]*(?:[eE][+-]?\d[\d_]*)?[fFdD]?|\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?[fFdD]?|\d[\d_]*(?:[eE][+-]?\d[\d_]*)[fFdD]?|\d[\d_]*[fFdDlL]?)/
		);
		if (numMatch) {
			const word = numMatch[0];
			const type: TokenType =
				word.includes('.') || /[eEfFdD.]/.test(word.replace(/[lL]$/, ''))
					? 'number.float'
					: 'number.integer';
			tokens.push(createToken(type, word, pos));
			return word.length;
		}

		// Contextual modifier keyword `non-sealed` (a single hyphenated keyword in
		// the grammar; without this it would split into `non` / `-` / `sealed`).
		// Require a word boundary after it so it doesn't swallow `non-sealedness`.
		if (text.startsWith('non-sealed') && !/^non-sealed[a-zA-Z0-9_$]/.test(text)) {
			tokens.push(createToken('keyword.storage', 'non-sealed', pos));
			return 'non-sealed'.length;
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
		if (identMatch) {
			const word = identMatch[0];
			const type = this.classifyIdentifier(word, text, word.length, state);
			tokens.push(createToken(type, word, pos));
			return word.length;
		}

		// Generic angle brackets — close (`>`, `>>`, `>>>`) and open (`<`).
		// When inside a generic context, split the close shifts into individual
		// `punctuation.bracket` tokens and decrement the depth per `>`.
		if (text.startsWith('>') && (state.angleDepth ?? 0) > 0) {
			let n = 0;
			while (n < text.length && text[n] === '>' && (state.angleDepth ?? 0) > 0) {
				tokens.push(createToken('punctuation.bracket', '>', pos + n));
				state.angleDepth = (state.angleDepth ?? 0) - 1;
				n++;
			}
			return n;
		}
		if (text.startsWith('<') && this.opensGeneric(state)) {
			state.angleDepth = (state.angleDepth ?? 0) + 1;
			tokens.push(createToken('punctuation.bracket', '<', pos));
			return 1;
		}

		// Operators
		const opMatch = text.match(
			/^(?:>>>=|>>>|<<=|>>=|->|::|\+\+|--|&&|\|\||==|!=|<=|>=|<<|>>|[+\-*/%&|^!<>=]=?|~|\?|:)/
		);
		if (opMatch) {
			const op = opMatch[0];
			let type: TokenType = 'operator';
			if (op === '=' || /^(?:\+|-|\*|\/|%|&|\||\^|<<|>>|>>>)=$/.test(op)) {
				type = 'operator.assignment';
			} else if (op === '==' || op === '!=' || op === '<=' || op === '>=') {
				type = 'operator.comparison';
			} else if (op === '&&' || op === '||' || op === '!') {
				type = 'operator.logical';
			} else if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
				type = 'operator.arithmetic';
			}
			// An assignment cannot appear inside a generic type-argument list, so an
			// open angle-depth here was a misfire; reset to avoid leaking depth.
			if (type === 'operator.assignment') {
				state.angleDepth = 0;
			}
			tokens.push(createToken(type, op, pos));
			return op.length;
		}

		// Angle brackets outside a generic context — plain operators.
		if (text.startsWith('<') || text.startsWith('>')) {
			tokens.push(createToken('operator', text[0], pos));
			return 1;
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.;]/);
		if (punctMatch) {
			const char = punctMatch[0];
			// Safety valve: none of these can appear inside a generic type-argument
			// list (type args are types/wildcards/bounds — never statements, blocks,
			// or parenthesized expressions), so an open angle-depth here was a
			// misfire (e.g. `Foo < bar;`, or `check(Foo < bar)`). Reset it so a leaked
			// depth can't corrupt a later relational `>`/`<` — and because the depth
			// threads across lines, a `(`/`)` reset stops a misfire inside `(...)`
			// from bleeding into a following line such as `while (i > 0)`.
			if (char === ';' || char === '{' || char === '}' || char === '(' || char === ')') {
				state.angleDepth = 0;
			}
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			tokens.push(createToken(type, char, pos));
			return 1;
		}

		return 0;
	}

	/**
	 * Decide whether a `<` opens a generic type-argument list. True when already
	 * nested in a generic context, or when the previous significant token is a
	 * type (e.g. `List<`, `Map<`), or a `>` that closed a prior generic (`A<B<C>>`
	 * is closed left-to-right so this mostly matters for the open side).
	 */
	private opensGeneric(state: JavaTokenizerState): boolean {
		if ((state.angleDepth ?? 0) > 0) return true;
		const prev = state.prevSignificant;
		const prevText = state.prevSignificantText ?? '';
		if (prev && genericOpenAfter.has(prev)) return true;
		// A capitalized identifier classified as a property (qualified type name,
		// e.g. `Map.Entry<...>`), a function name, or a definition name whose first
		// letter is uppercase (e.g. `class A<T>` where the single-letter name `A`
		// classifies as a plain identifier) opens a generic parameter list.
		if (
			(prev === 'property' || prev === 'variable' || prev === 'function') &&
			/^[A-Z]/.test(prevText)
		) {
			return true;
		}
		return false;
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		state: JavaTokenizerState
	): TokenType {
		// Boolean / null literals
		if (word === 'true' || word === 'false') return 'constant.boolean';
		if (word === 'null') return 'constant.null';

		const afterAccessor = state.prevSignificant === 'punctuation.accessor';
		const afterWord = context.slice(wordLength);
		const isCall = afterWord.startsWith('(');

		// Member access: an identifier immediately following a `.` accessor is a
		// property (or a method call when followed by `(`), not a free variable or
		// a type. This must win over the keyword/type classification below so e.g.
		// `obj.class` / `Color.RED` / `System.out` are members, not keywords/types.
		if (afterAccessor) {
			if (isCall) return 'function.call';
			if (this.isConstantName(word)) return 'constant';
			return 'property';
		}

		// Keywords
		if (definitionKeywords.has(word)) return 'keyword.definition';
		if (storageKeywords.has(word)) return 'keyword.storage';
		if (controlKeywords.has(word)) return 'keyword.control';
		if (moduleKeywords.has(word)) return 'keyword.module';
		if (otherKeywords.has(word)) return 'keyword';

		// Builtin primitive types
		if (builtinTypes.has(word)) return 'type.builtin';

		// Common standard-library classes
		if (classTypes.has(word)) return 'type.class';

		// Function call: identifier immediately followed by (
		if (isCall) {
			return 'function.call';
		}

		// ALL_CAPS (with no lowercase) => a constant (e.g. MAX_SIZE, PI).
		if (this.isConstantName(word)) {
			return 'constant';
		}

		// PascalCase (and not all-caps constant) => type/class
		if (/^[A-Z][a-zA-Z0-9_$]*$/.test(word) && /[a-z]/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	/** ALL_CAPS_WITH_UNDERSCORES, at least one letter, no lowercase (constants). */
	private isConstantName(word: string): boolean {
		return /^[A-Z][A-Z0-9_$]*$/.test(word) && /[A-Z]/.test(word) && word.length > 1;
	}

	/**
	 * Tokenize a quoted string starting at `text`, pushing the literal as `string`
	 * and any escape sequences within it as `string.escape`. Returns the number of
	 * characters consumed (including both delimiters when the string is closed; up
	 * to the newline / end-of-line for an unterminated string).
	 */
	private emitString(tokens: Token[], text: string, pos: number, delimiter: string): number {
		let i = 1;
		let end = -1;
		while (i < text.length) {
			const ch = text[i];
			if (ch === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (ch === delimiter) {
				end = i + 1;
				break;
			}
			if (ch === '\n') break;
			i++;
		}
		const literal = end === -1 ? text.slice(0, i) : text.slice(0, end);
		this.pushStringWithEscapes(tokens, literal, pos);
		return literal.length;
	}

	/**
	 * Push a string literal as alternating `string` / `string.escape` tokens so an
	 * escape like `\n`, `\t`, `\uXXXX`, `\"`, `\\` or an octal `\012` renders with
	 * the escape style. The concatenation of pushed tokens equals `literal`.
	 */
	private pushStringWithEscapes(tokens: Token[], literal: string, pos: number): void {
		// Matches Java escapes: \b \t \n \f \r \s \" \' \\ , unicode \uXXXX (with
		// extra leading u's allowed), and octal \0..\377.
		const escapeRe = /\\(?:u+[0-9a-fA-F]{4}|[0-3][0-7]{2}|[0-7]{1,2}|[btnfrs0"'\\])/g;
		let last = 0;
		let m: RegExpExecArray | null;
		while ((m = escapeRe.exec(literal)) !== null) {
			if (m.index > last) {
				tokens.push(createToken('string', literal.slice(last, m.index), pos + last));
			}
			tokens.push(createToken('string.escape', m[0], pos + m.index));
			last = m.index + m[0].length;
		}
		if (last < literal.length) {
			tokens.push(createToken('string', literal.slice(last), pos + last));
		} else if (literal.length === 0) {
			tokens.push(createToken('string', '', pos));
		}
	}
}

export function createJavaTokenizer(): LanguageTokenizer {
	return new JavaTokenizer();
}
