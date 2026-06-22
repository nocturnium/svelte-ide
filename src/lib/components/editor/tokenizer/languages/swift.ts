/**
 * Swift tokenizer
 *
 * Design notes / closed caveats:
 *  - String interpolation `\(expr)` (and raw-string `\#(expr)` with matching pound
 *    counts) is SUB-TOKENIZED: the `\(` / `)` delimiters are emitted as
 *    string.template and the inner expression is tokenized with real types
 *    (variable, property, function.call, number, operator, punctuation, ...),
 *    recursively, byte-for-byte lossless.
 *  - String escapes (`\n`, `\t`, `\u{...}`, `\"`, `\\`, `\0`, `\r`, raw `\#n`, ...)
 *    are emitted as string.escape inside the surrounding string literal.
 *  - Numbers are emitted with precise subtypes: number.hex / number.binary /
 *    number.float / number.integer (octal -> number.integer, no octal subtype exists).
 *  - Member access after `.` is classified: `.prop` -> property,
 *    `.call(` -> function.call.
 *  - Generic / type-argument angle brackets `<` `>` (and the `>>` that closes nested
 *    generics) are emitted as punctuation.bracket when angle-bracket depth is open;
 *    comparison/shift operators are preserved when not in that context.
 *  - Multi-line constructs threaded via state: nested block comments, triple-quoted
 *    strings (with interpolation continued across lines), and raw multi-line strings.
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Swift keywords - definitions
const definitionKeywords = new Set([
	'func',
	'class',
	'struct',
	'enum',
	'protocol',
	'extension',
	'typealias',
	'associatedtype',
	'actor',
	'init',
	'deinit',
	'subscript',
	'operator',
	'precedencegroup'
]);

// Swift keywords - storage / declaration modifiers
const storageKeywords = new Set([
	'let',
	'var',
	'static',
	'final',
	'private',
	'public',
	'internal',
	'fileprivate',
	'open',
	'lazy',
	'weak',
	'unowned',
	'mutating',
	'nonmutating',
	'override',
	'required',
	'convenience',
	'dynamic',
	'indirect',
	'optional',
	'class'
]);

// Swift keywords - control flow
const controlKeywords = new Set([
	'if',
	'else',
	'guard',
	'switch',
	'case',
	'default',
	'for',
	'while',
	'repeat',
	'break',
	'continue',
	'return',
	'throw',
	'throws',
	'rethrows',
	'do',
	'try',
	'catch',
	'defer',
	'fallthrough',
	'where',
	'async',
	'await',
	'yield'
]);

// Swift keywords - module / import
const moduleKeywords = new Set(['import']);

// Swift keywords - other (self, type expressions, casts, etc.)
const otherKeywords = new Set([
	'self',
	'Self',
	'super',
	'in',
	'as',
	'is',
	'some',
	'any',
	'inout',
	'throw',
	'nil'
]);

// All keywords (used for fast membership checks). `class` lives in both definition
// and storage sets (e.g. `class func`); it is resolved positionally in
// classifyIdentifier, defaulting to keyword.definition.
const keywords = new Set<string>([
	...definitionKeywords,
	...storageKeywords,
	...controlKeywords,
	...moduleKeywords,
	...otherKeywords
]);

// Property/subscript accessor "soft" keywords: only act as keywords when they sit in
// accessor position (`name {`), so `let get = 5` stays an ordinary binding. Handled in
// applyContextualKeywords.
const accessorKeywords = new Set(['get', 'set', 'willSet', 'didSet']);

// Boolean / null constants
const booleanConstants = new Set(['true', 'false']);

// Built-in types
const builtinTypes = new Set([
	'Int',
	'Int8',
	'Int16',
	'Int32',
	'Int64',
	'UInt',
	'UInt8',
	'UInt16',
	'UInt32',
	'UInt64',
	'String',
	'Substring',
	'Bool',
	'Double',
	'Float',
	'Float32',
	'Float64',
	'CGFloat',
	'Character',
	'Array',
	'Dictionary',
	'Set',
	'Optional',
	'Result',
	'Range',
	'ClosedRange',
	'Void',
	'Any',
	'AnyObject',
	'Never'
]);

// Swift compiler / build-configuration directives. These are single lexemes
// beginning with `#` (e.g. `#if`, `#available`, `#selector`), NOT a `#` token
// followed by an ordinary keyword/identifier.
const compilerDirectives = new Set([
	'if',
	'elseif',
	'else',
	'endif',
	'available',
	'unavailable',
	'selector',
	'keyPath',
	'warning',
	'error',
	'sourceLocation',
	'file',
	'fileID',
	'filePath',
	'line',
	'column',
	'function',
	'dsohandle',
	'colorLiteral',
	'imageLiteral',
	'fileLiteral'
]);

interface SwiftTokenizerState extends TokenizerState {
	/** Depth of nested block comments (0 = not in a block comment). */
	blockCommentDepth?: number;
	/** Inside a triple-quoted multi-line string. */
	inMultilineString?: boolean;
	/** Pound count of an open multi-line string (0 = plain `"""`, >0 = raw `#"""`). */
	multilineStringPounds?: number;
}

export class SwiftTokenizer {
	language = 'swift';

	getInitialState(): SwiftTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: SwiftTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: SwiftTokenizerState = { ...prevState };
		// Angle-bracket depth is per-line: generics rarely span lines, and resetting
		// each line avoids a stray `<` poisoning every subsequent line.
		let angleDepth = 0;

		// Resume nested block comment from a previous line.
		if (state.blockCommentDepth && state.blockCommentDepth > 0) {
			pos = this.continueBlockComment(line, tokens, state);
			if (pos >= line.length) {
				if (tokens.length === 0) tokens.push(createToken('text', '', 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a triple-quoted multi-line string (plain or raw) from a previous line.
		if (state.inMultilineString) {
			pos = this.continueMultilineString(line, tokens, state);
			if (pos >= line.length) {
				if (tokens.length === 0) tokens.push(createToken('text', '', 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const produced = this.getNextToken(remaining, pos, state, angleDepth);

			if (produced) {
				const arr = Array.isArray(produced) ? produced : [produced];
				for (const t of arr) {
					tokens.push(t);
					// Track angle-bracket nesting for generic punctuation classification.
					if (t.type === 'punctuation.bracket') {
						if (t.text === '<') angleDepth++;
						else if (t.text === '>') angleDepth = Math.max(0, angleDepth - 1);
						else if (t.text === '>>') angleDepth = Math.max(0, angleDepth - 2);
					}
				}
				pos = arr.length > 0 ? arr[arr.length - 1].end : pos + 1;
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				pos += 1;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		// Context passes over the whole token run: member access (.prop / .call),
		// definition naming (func name / let name / type name), and accessor-position
		// contextual keywords (get/set/willSet/didSet).
		this.applyMemberAccess(tokens);
		this.applyDefinitionContext(tokens);
		this.applyContextualKeywords(tokens);

		return { lineNumber, tokens, text: line, state };
	}

	/**
	 * `func name` / `init`(no) -> function.definition; `let/var name` -> variable.definition;
	 * `class/struct/enum/protocol/actor/extension Name` -> type.* ; `func f(label name: T)` and
	 * `(name: T)` parameter names -> variable.parameter. Operates on a tokenized run; only
	 * upgrades plain `variable`/`type.class`/`function.call` tokens, never keywords.
	 */
	private applyDefinitionContext(tokens: Token[]): void {
		// Index of the next non-whitespace token after k.
		const nextSig = (k: number): number => {
			let j = k + 1;
			while (j < tokens.length && tokens[j].type === 'text' && tokens[j].text.trim() === '') j++;
			return j;
		};
		for (let k = 0; k < tokens.length; k++) {
			const t = tokens[k];
			if (t.type === 'keyword.definition') {
				const n = nextSig(k);
				const name = tokens[n];
				if (!name) continue;
				if (t.text === 'func') {
					if (name.type === 'function.call' || name.type === 'variable') {
						name.type = 'function.definition';
					}
				} else if (
					t.text === 'class' ||
					t.text === 'struct' ||
					t.text === 'enum' ||
					t.text === 'protocol' ||
					t.text === 'actor' ||
					t.text === 'extension' ||
					t.text === 'typealias' ||
					t.text === 'associatedtype'
				) {
					if (name.type === 'type.class' || name.type === 'variable') {
						name.type = t.text === 'protocol' ? 'type.interface' : 'type.class';
					}
				}
			} else if (t.type === 'keyword.storage' && (t.text === 'let' || t.text === 'var')) {
				const n = nextSig(k);
				const name = tokens[n];
				// `let x` / `var y` binding name (not `let (a, b)` tuple destructuring start).
				if (name && name.type === 'variable') {
					name.type = 'variable.definition';
				}
			}
		}
	}

	/**
	 * Reclassify member access across a whole tokenized line: an identifier right after a
	 * `.` accessor becomes property, or function.call when immediately followed by `(`.
	 */
	private applyContextualKeywords(tokens: Token[]): void {
		const nextSig = (k: number): Token | undefined => {
			let j = k + 1;
			while (j < tokens.length && tokens[j].type === 'text' && tokens[j].text.trim() === '') j++;
			return tokens[j];
		};
		for (let k = 0; k < tokens.length; k++) {
			const t = tokens[k];
			if (t.type !== 'variable') continue;
			// get/set/willSet/didSet act as keywords only in accessor position: `name {`.
			if (accessorKeywords.has(t.text)) {
				const n = nextSig(k);
				if (n !== undefined && n.type === 'punctuation.brace' && n.text === '{') {
					t.type = 'keyword';
				}
			}
		}
	}

	private getNextToken(
		text: string,
		pos: number,
		state: SwiftTokenizerState,
		angleDepth: number
	): Token | Token[] | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}

		// Block comments (nestable)
		if (text.startsWith('/*')) {
			return this.tokenizeBlockComment(text, pos, state);
		}

		// Raw strings: one or more `#`, then `"` (single-line) or `"""` (multi-line),
		// closing on a `"`/`"""` followed by the SAME number of `#`. Must be checked
		// before compiler directives so `#"..."#` isn't read as a `#`-directive.
		if (text[0] === '#') {
			const poundMatch = text.match(/^#+/);
			const pounds = poundMatch![0].length;
			if (text[pounds] === '"') {
				return this.tokenizeRawString(text, pos, pounds, state);
			}
		}

		// Compiler / build directives: #if, #available, #selector, #warning, ...
		if (text[0] === '#') {
			const dirMatch = text.match(/^#[a-zA-Z_][a-zA-Z0-9_]*/);
			if (dirMatch && compilerDirectives.has(dirMatch[0].slice(1))) {
				return createToken('keyword', dirMatch[0], pos);
			}
		}

		// Triple-quoted multi-line strings
		if (text.startsWith('"""')) {
			return this.tokenizeMultilineString(text, pos, 0, state);
		}

		// Double-quoted strings (with interpolation + escapes)
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos, 0);
		}

		// Numbers (must come before identifiers so 0x... isn't split)
		const numToken = this.tokenizeNumber(text, pos);
		if (numToken) {
			return numToken;
		}

		// Attributes: @objc, @escaping, @Identifier, @available(...)
		if (text.startsWith('@')) {
			const attrMatch = text.match(/^@[a-zA-Z_][a-zA-Z0-9_]*/);
			if (attrMatch) {
				return createToken('keyword', attrMatch[0], pos);
			}
		}

		// Identifiers and keywords (Swift allows backtick-escaped identifiers)
		const escapedIdentMatch = text.match(/^`[a-zA-Z_][a-zA-Z0-9_]*`/);
		if (escapedIdentMatch) {
			return createToken('variable', escapedIdentMatch[0], pos);
		}

		const identMatch = text.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators. `>>` is matched here so a shift in value context is one token; when a
		// generic is open it is reinterpreted below as two closing brackets.
		const opMatch = text.match(
			/^(?:->|\?\?|===|!==|==|!=|<=|>=|&&|\|\||<<=?|>>=?|\+\+|--|\.\.\.|\.\.<|[+\-*/%&|^~<>=!]=?)/
		);
		if (opMatch) {
			const op = opMatch[0];

			// When generics are open, `>` / `>>` close type-argument lists and are bracket
			// punctuation, not shift/comparison operators.
			if (angleDepth > 0 && (op === '>' || op === '>=' || op === '>>' || op === '>>=')) {
				if (op === '>>') return createToken('punctuation.bracket', '>>', pos);
				if (op === '>') return createToken('punctuation.bracket', '>', pos);
				// `>=` / `>>=` while a generic is open: the `>`(s) close the generic; the
				// trailing chars are emitted as the operator that follows.
				if (op === '>=') {
					return [
						createToken('punctuation.bracket', '>', pos),
						createToken('operator.assignment', '=', pos + 1)
					];
				}
				return [
					createToken('punctuation.bracket', '>>', pos),
					createToken('operator.assignment', '=', pos + 2)
				];
			}

			// A lone `<` that opens a generic argument list (`Foo<`, `Array<`) is bracket
			// punctuation; a `<` used as less-than stays an operator. Heuristic: treat `<`
			// as a generic opener only when the previous token was a type-ish identifier;
			// the caller can't easily inform us, so we recheck via the trailing context.
			if (op === '<' && this.looksLikeGenericOpen(text)) {
				return createToken('punctuation.bracket', '<', pos);
			}

			let type: TokenType = 'operator';
			if (op === '=' || op === '+=' || op === '-=' || op === '*=' || op === '/=') {
				type = 'operator.assignment';
			} else if (
				op === '==' ||
				op === '!=' ||
				op === '<=' ||
				op === '>=' ||
				op === '===' ||
				op === '!=='
			) {
				type = 'operator.comparison';
			} else if (op === '&&' || op === '||') {
				type = 'operator.logical';
			} else if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
				type = 'operator.arithmetic';
			}
			return createToken(type, op, pos);
		}

		// Optional / force-unwrap markers and other single-char operators
		const singleOpMatch = text.match(/^[?!]/);
		if (singleOpMatch) {
			return createToken('operator', singleOpMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;]/);
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

	/**
	 * Heuristic for whether a `<` at the start of `text` opens a generic argument list.
	 * `text` begins at the `<`. A generic open is followed by a type-ish token (an
	 * identifier/type, another `<`, `[`, `(`) and eventually a matching `>` before a
	 * line-structural break. We scan a bounded window for a matching `>` while only
	 * crossing generic-legal characters; a `<` used as less-than (`a < b`) fails because
	 * arithmetic/space-separated value expressions won't reach a `>` through that grammar.
	 */
	private looksLikeGenericOpen(text: string): boolean {
		// Must look like `<Type...` — a letter, `_`, `[`, `(`, or nested `<`.
		if (!/^<\s*[A-Za-z_[(<]/.test(text)) return false;
		let depth = 0;
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			if (ch === '<') depth++;
			else if (ch === '>') {
				depth--;
				if (depth === 0) return true;
			} else if (
				// Characters that can't appear inside a generic argument list. If we hit one
				// before the matching `>`, this `<` was a comparison operator.
				ch === ';' ||
				ch === '{' ||
				ch === '}' ||
				ch === '=' ||
				ch === '+' ||
				ch === '%' ||
				ch === '"'
			) {
				return false;
			}
		}
		return false;
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		const after = context.slice(wordLength);

		// Boolean / null constants
		if (booleanConstants.has(word)) {
			return 'constant.boolean';
		}
		if (word === 'nil') {
			return 'constant.null';
		}

		// Keywords
		if (keywords.has(word)) {
			// `class` is both a definition keyword (`class Foo`) and a storage modifier
			// (`class func`/`class var`). Treat trailing `func`/`var`/`let` as storage.
			if (word === 'class') {
				if (/^\s+(func|var|let)\b/.test(after)) return 'keyword.storage';
				return 'keyword.definition';
			}
			if (definitionKeywords.has(word)) return 'keyword.definition';
			if (controlKeywords.has(word)) return 'keyword.control';
			if (storageKeywords.has(word)) return 'keyword.storage';
			if (moduleKeywords.has(word)) return 'keyword.module';
			return 'keyword';
		}

		// Built-in types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Function call: identifier immediately followed by ( OR <generic-args>(
		if (after.startsWith('(')) {
			return 'function.call';
		}
		if (after[0] === '<' && this.looksLikeGenericCall(after)) {
			return 'function.call';
		}

		// Type (PascalCase) — but not a call
		if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
			return 'type.class';
		}

		// Constant-style names (ALL_CAPS_WITH_UNDERSCORES) are common constants
		if (/^[A-Z][A-Z0-9_]+$/.test(word) && word.includes('_')) {
			return 'constant';
		}

		return 'variable';
	}

	/** `Foo<Int>(...)` — a generic instantiation call. `after` begins at `<`. */
	private looksLikeGenericCall(after: string): boolean {
		let depth = 0;
		for (let i = 0; i < after.length; i++) {
			const ch = after[i];
			if (ch === '<') depth++;
			else if (ch === '>') {
				depth--;
				if (depth === 0) return after[i + 1] === '(';
			} else if (ch === ';' || ch === '{' || ch === '"' || ch === '=') {
				return false;
			}
		}
		return false;
	}

	private tokenizeNumber(text: string, pos: number): Token | null {
		// Hex (may be a hex float with p-exponent)
		let m = text.match(
			/^0[xX][0-9a-fA-F][0-9a-fA-F_]*(?:\.[0-9a-fA-F][0-9a-fA-F_]*)?(?:[pP][+-]?\d[\d_]*)?/
		);
		if (m) {
			return createToken('number.hex', m[0], pos);
		}
		// Binary
		m = text.match(/^0[bB][01][01_]*/);
		if (m) {
			return createToken('number.binary', m[0], pos);
		}
		// Octal (no dedicated octal subtype in the vocabulary -> integer)
		m = text.match(/^0[oO][0-7][0-7_]*/);
		if (m) {
			return createToken('number.integer', m[0], pos);
		}
		// Decimal float (has a fractional part or an exponent) vs integer
		m = text.match(/^\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?/);
		if (m) {
			const isFloat = m[0].includes('.') || /[eE]/.test(m[0]);
			return createToken(isFloat ? 'number.float' : 'number.integer', m[0], pos);
		}
		return null;
	}

	/**
	 * Tokenize a double-quoted single-line string (or, inside a raw string with
	 * `pounds` `#` signs, the body of a raw string). Splits out:
	 *  - `\(expr)` interpolation: `\(` and `)` as string.template, body sub-tokenized.
	 *  - escape sequences (`\n`, `\u{...}`, `\"`, ...) as string.escape.
	 * Stays byte-for-byte lossless. The escape/interpolation introducer is `\` for a
	 * plain string and `\` + `pounds` `#` for a raw string.
	 */
	private tokenizeString(text: string, pos: number, pounds: number): Token | Token[] {
		const hashes = '#'.repeat(pounds);
		const escIntro = '\\' + hashes; // `\` for plain, `\#`/`\##` for raw
		const tokens: Token[] = [];
		let i = 1; // past opening quote
		let segmentStart = 0; // start of the current plain-string run

		const flushSegment = (end: number): void => {
			if (end > segmentStart) {
				tokens.push(createToken('string', text.slice(segmentStart, end), pos + segmentStart));
			}
		};

		while (i < text.length) {
			const ch = text[i];

			// Interpolation introducer: `\(` (plain) or `\#(`/`\##(`... (raw, matched pounds).
			if (ch === '\\' && text.startsWith(escIntro, i) && text[i + escIntro.length] === '(') {
				flushSegment(i);
				const parenIdx = i + escIntro.length;
				const interpEnd = this.findInterpolationEnd(text, parenIdx);
				// Opening `\(` / `\#(` marker.
				tokens.push(createToken('string.template', text.slice(i, parenIdx + 1), pos + i));
				// Inner expression body, sub-tokenized with real Swift token types.
				const innerStart = parenIdx + 1;
				const closed = interpEnd <= text.length && text[interpEnd - 1] === ')';
				const innerEnd = closed ? interpEnd - 1 : interpEnd;
				if (innerEnd > innerStart) {
					for (const t of this.tokenizeInterpolation(
						text.slice(innerStart, innerEnd),
						pos + innerStart
					)) {
						tokens.push(t);
					}
				}
				// Closing `)` marker (present only if it was actually found).
				if (closed) {
					tokens.push(createToken('string.template', ')', pos + interpEnd - 1));
				}
				i = interpEnd;
				segmentStart = i;
				continue;
			}

			// Escape sequence: `\<x>` (plain) or `\#<x>`/`\##<x>` (raw). In a raw string a
			// bare `\` with the wrong pound count is a literal backslash, not an escape.
			if (ch === '\\' && (pounds === 0 ? i + 1 < text.length : text.startsWith(escIntro, i))) {
				const escLen = this.escapeLength(text, i, escIntro);
				if (escLen > 0) {
					flushSegment(i);
					tokens.push(createToken('string.escape', text.slice(i, i + escLen), pos + i));
					i += escLen;
					segmentStart = i;
					continue;
				}
			}

			// Closing quote (raw strings close on `"` + matching pounds; handled by the
			// caller via tokenizeRawString, which passes only the body here when pounds=0).
			if (ch === '"' && pounds === 0) {
				flushSegment(i + 1);
				return tokens.length === 1 ? tokens[0] : tokens;
			}

			i++;
		}

		// Unterminated string (no closing quote on this line)
		flushSegment(text.length);
		return tokens.length === 1 ? tokens[0] : tokens;
	}

	/**
	 * Length of the escape sequence starting at `text[i]` (a backslash), where
	 * `escIntro` is the pound-matched introducer (`\` or `\#...`). Returns 0 if the
	 * backslash is not a recognized escape (so it's treated as literal string content).
	 */
	private escapeLength(text: string, i: number, escIntro: string): number {
		const start = i + escIntro.length; // char after `\` (plain) or `\#...` (raw)
		const c = text[start];
		if (c === undefined) return 0;
		// Unicode scalar: `\u{XXXX}`
		if (c === 'u' && text[start + 1] === '{') {
			let j = start + 2;
			while (j < text.length && text[j] !== '}') j++;
			if (text[j] === '}') return j + 1 - i;
			return 0; // unterminated -> leave as literal
		}
		// Single-character escapes recognized by Swift.
		if ('0\\tnr"\'#'.includes(c)) {
			return start + 1 - i;
		}
		return 0;
	}

	/**
	 * Sub-tokenize the body of a `\(...)` interpolation. Reuses the main lexer so the
	 * inner expression gets real types (variable, property, function.call, number,
	 * operator, punctuation, nested strings). Member access after `.` is reclassified
	 * to property / function.call.
	 */
	private tokenizeInterpolation(body: string, basePos: number): Token[] {
		const out: Token[] = [];
		let pos = 0;
		let angleDepth = 0;
		// A throwaway state so nested strings/comments don't mutate the line state.
		const innerState: SwiftTokenizerState = {};
		while (pos < body.length) {
			const remaining = body.slice(pos);
			const produced = this.getNextToken(remaining, basePos + pos, innerState, angleDepth);
			const arr = produced ? (Array.isArray(produced) ? produced : [produced]) : [];
			if (arr.length === 0) {
				out.push(createToken('text', remaining[0], basePos + pos));
				pos += 1;
				continue;
			}
			for (const t of arr) {
				if (t.type === 'punctuation.bracket') {
					if (t.text === '<') angleDepth++;
					else if (t.text === '>') angleDepth = Math.max(0, angleDepth - 1);
					else if (t.text === '>>') angleDepth = Math.max(0, angleDepth - 2);
				}
				out.push(t);
			}
			pos = arr[arr.length - 1].end - basePos;
		}
		return this.applyMemberAccess(out);
	}

	/**
	 * Reclassify identifiers that immediately follow a `.` accessor: `.name` -> property,
	 * `.name(` -> function.call. Operates on an already-tokenized run.
	 */
	private applyMemberAccess(tokens: Token[]): Token[] {
		for (let k = 1; k < tokens.length; k++) {
			const prev = tokens[k - 1];
			const cur = tokens[k];
			// Only a plain `variable` right after a `.` is reclassified; an already-typed
			// function.call / type.class member is left as the lexer found it.
			if (prev.type === 'punctuation.accessor' && prev.text === '.' && cur.type === 'variable') {
				const next = tokens[k + 1];
				cur.type =
					next && next.type === 'punctuation.paren' && next.text === '('
						? 'function.call'
						: 'property';
			}
		}
		return tokens;
	}

	/**
	 * Given an index pointing at the "(" of a `\(`, return the index just past the
	 * matching ")". Falls back to end-of-text if unbalanced.
	 */
	private findInterpolationEnd(text: string, openParenIdx: number): number {
		let depth = 0;
		let i = openParenIdx;
		while (i < text.length) {
			const ch = text[i];
			if (ch === '(') {
				depth++;
			} else if (ch === ')') {
				depth--;
				if (depth === 0) {
					return i + 1;
				}
			} else if (ch === '"') {
				// Skip nested string literal inside the interpolation.
				i++;
				while (i < text.length && text[i] !== '"') {
					if (text[i] === '\\') i++;
					i++;
				}
			}
			i++;
		}
		return text.length;
	}

	/** Tokenize the start of a block comment, tracking nesting depth in state. */
	private tokenizeBlockComment(text: string, pos: number, state: SwiftTokenizerState): Token {
		let depth = 1;
		let i = 2; // past opening /*
		while (i < text.length) {
			if (text[i] === '/' && text[i + 1] === '*') {
				depth++;
				i += 2;
				continue;
			}
			if (text[i] === '*' && text[i + 1] === '/') {
				depth--;
				i += 2;
				if (depth === 0) {
					return createToken('comment.block', text.slice(0, i), pos);
				}
				continue;
			}
			i++;
		}
		// Comment runs past end of line.
		state.blockCommentDepth = depth;
		return createToken('comment.block', text, pos);
	}

	/** Continue a block comment opened on a previous line. Returns new pos. */
	private continueBlockComment(line: string, tokens: Token[], state: SwiftTokenizerState): number {
		let depth = state.blockCommentDepth ?? 1;
		let i = 0;
		while (i < line.length) {
			if (line[i] === '/' && line[i + 1] === '*') {
				depth++;
				i += 2;
				continue;
			}
			if (line[i] === '*' && line[i + 1] === '/') {
				depth--;
				i += 2;
				if (depth === 0) {
					tokens.push(createToken('comment.block', line.slice(0, i), 0));
					state.blockCommentDepth = 0;
					return i;
				}
				continue;
			}
			i++;
		}
		// Still inside the comment after consuming the whole line.
		tokens.push(createToken('comment.block', line, 0));
		state.blockCommentDepth = depth;
		return line.length;
	}

	/**
	 * Tokenize the start of a triple-quoted multi-line string (plain when pounds=0, or
	 * raw when pounds>0). The closing delimiter is `"""` + `pounds` `#` signs. Single
	 * line of the literal is sub-tokenized for escapes + interpolation (lossless); an
	 * open literal threads to the next line via state.
	 */
	private tokenizeMultilineString(
		text: string,
		pos: number,
		pounds: number,
		state: SwiftTokenizerState
	): Token | Token[] {
		const closeMarker = '"""' + '#'.repeat(pounds);
		const openLen = 3 + pounds; // leading `#`s are consumed by the caller's slice for raw
		const endIdx = text.indexOf(closeMarker, openLen);
		if (endIdx !== -1) {
			// Whole literal on one line. Sub-tokenize the inner body for interpolation/escapes.
			return this.tokenizeMultilineSegment(
				text,
				pos,
				pounds,
				openLen,
				endIdx,
				endIdx + closeMarker.length,
				true,
				true
			);
		}
		state.inMultilineString = true;
		state.multilineStringPounds = pounds;
		return this.tokenizeMultilineSegment(
			text,
			pos,
			pounds,
			openLen,
			text.length,
			text.length,
			true,
			false
		);
	}

	/** Continue a triple-quoted string (plain or raw) opened on a previous line. */
	private continueMultilineString(
		line: string,
		tokens: Token[],
		state: SwiftTokenizerState
	): number {
		const pounds = state.multilineStringPounds ?? 0;
		const closeMarker = '"""' + '#'.repeat(pounds);
		const endIdx = line.indexOf(closeMarker);
		if (endIdx !== -1) {
			const seg = this.tokenizeMultilineSegment(
				line,
				0,
				pounds,
				0,
				endIdx,
				endIdx + closeMarker.length,
				false,
				true
			);
			for (const t of Array.isArray(seg) ? seg : [seg]) tokens.push(t);
			state.inMultilineString = false;
			state.multilineStringPounds = 0;
			return endIdx + closeMarker.length;
		}
		const seg = this.tokenizeMultilineSegment(
			line,
			0,
			pounds,
			0,
			line.length,
			line.length,
			false,
			false
		);
		for (const t of Array.isArray(seg) ? seg : [seg]) tokens.push(t);
		return line.length;
	}

	/**
	 * Emit tokens for one physical line's slice of a multi-line string:
	 *  - `openLen` chars at `bodyStart` form the opening delimiter (`"""`/`#"""`) when
	 *    `hasOpen` (string token), otherwise the body starts at 0.
	 *  - the body between the opener and `bodyEnd` is sub-tokenized for escapes +
	 *    interpolation (raw strings: escapes only fire with matching pounds).
	 *  - the closing delimiter (`segEnd-bodyEnd` chars) is emitted as a string token
	 *    when `hasClose`.
	 * Lossless across the full physical line slice [0, segEnd).
	 */
	private tokenizeMultilineSegment(
		line: string,
		pos: number,
		pounds: number,
		openLen: number,
		bodyEnd: number,
		segEnd: number,
		hasOpen: boolean,
		hasClose: boolean
	): Token | Token[] {
		const bodyStart = hasOpen ? openLen : 0;
		const bodyTokens: Token[] = [];
		this.emitStringBody(line.slice(bodyStart, bodyEnd), pos + bodyStart, pounds, bodyTokens);
		const hasRich = bodyTokens.some(
			(t) => t.type === 'string.escape' || t.type === 'string.template'
		);
		// When the body has no escapes/interpolation to surface, collapse the whole
		// physical-line slice into a single `string` token (preserves simple-literal tests).
		if (!hasRich) {
			if (segEnd === 0) return createToken('string', '', pos);
			return createToken('string', line.slice(0, segEnd), pos);
		}
		const tokens: Token[] = [];
		if (hasOpen && openLen > 0) {
			tokens.push(createToken('string', line.slice(0, openLen), pos));
		}
		for (const t of bodyTokens) tokens.push(t);
		if (hasClose && segEnd > bodyEnd) {
			tokens.push(createToken('string', line.slice(bodyEnd, segEnd), pos + bodyEnd));
		}
		if (tokens.length === 0) {
			tokens.push(createToken('string', '', pos));
		}
		return tokens.length === 1 ? tokens[0] : tokens;
	}

	/**
	 * Emit escape + interpolation + plain-string tokens for a raw body slice (no
	 * surrounding quotes). `intro` is `\` (plain) or `\#...` (raw, matched pounds).
	 */
	private emitStringBody(body: string, basePos: number, pounds: number, out: Token[]): void {
		const intro = '\\' + '#'.repeat(pounds);
		let i = 0;
		let segStart = 0;
		const flush = (end: number): void => {
			if (end > segStart)
				out.push(createToken('string', body.slice(segStart, end), basePos + segStart));
		};
		while (i < body.length) {
			const ch = body[i];
			// Interpolation `\(...)` / `\#(...)`
			if (ch === '\\' && body.startsWith(intro, i) && body[i + intro.length] === '(') {
				flush(i);
				const parenIdx = i + intro.length;
				const interpEnd = this.findInterpolationEnd(body, parenIdx);
				out.push(createToken('string.template', body.slice(i, parenIdx + 1), basePos + i));
				const innerStart = parenIdx + 1;
				const closed = interpEnd <= body.length && body[interpEnd - 1] === ')';
				const innerEnd = closed ? interpEnd - 1 : interpEnd;
				if (innerEnd > innerStart) {
					for (const t of this.tokenizeInterpolation(
						body.slice(innerStart, innerEnd),
						basePos + innerStart
					)) {
						out.push(t);
					}
				}
				if (closed) out.push(createToken('string.template', ')', basePos + interpEnd - 1));
				i = interpEnd;
				segStart = i;
				continue;
			}
			// Escape
			if (ch === '\\' && (pounds === 0 ? i + 1 < body.length : body.startsWith(intro, i))) {
				const escLen = this.escapeLength(body, i, intro);
				if (escLen > 0) {
					flush(i);
					out.push(createToken('string.escape', body.slice(i, i + escLen), basePos + i));
					i += escLen;
					segStart = i;
					continue;
				}
			}
			i++;
		}
		flush(body.length);
	}

	/**
	 * Tokenize a raw string opening with `pounds` `#` signs. Handles both single-line
	 * (`#"..."#`) and multi-line (`#"""..."""#`) forms. The closing delimiter is the
	 * matching quote run followed by exactly `pounds` `#` signs. Raw strings only treat
	 * `\#...` (matched pounds) as escapes / interpolation; an open multi-line raw string
	 * threads to the next line via state.
	 */
	private tokenizeRawString(
		text: string,
		pos: number,
		pounds: number,
		state: SwiftTokenizerState
	): Token | Token[] {
		const hashes = '#'.repeat(pounds);
		const isMultiline = text.slice(pounds, pounds + 3) === '"""';
		if (isMultiline) {
			return this.tokenizeMultilineString(text, pos, pounds, state);
		}
		// Single-line raw string: opener is `#...#"`, closer is `"` + `pounds` `#`.
		const openLen = pounds + 1; // leading `#`s + the `"`
		const closeMarker = '"' + hashes;
		const endIdx = text.indexOf(closeMarker, openLen);
		const closeLen = endIdx !== -1 ? closeMarker.length : 0;
		const bodyEnd = endIdx !== -1 ? endIdx : text.length;
		const segEnd = endIdx !== -1 ? endIdx + closeMarker.length : text.length;
		const bodyTokens: Token[] = [];
		this.emitStringBody(text.slice(openLen, bodyEnd), pos + openLen, pounds, bodyTokens);
		const hasRich = bodyTokens.some(
			(t) => t.type === 'string.escape' || t.type === 'string.template'
		);
		if (!hasRich) {
			// No escapes/interpolation -> a single `string` token (preserves simple-raw tests).
			return createToken('string', text.slice(0, segEnd), pos);
		}
		const tokens: Token[] = [createToken('string', text.slice(0, openLen), pos)];
		for (const t of bodyTokens) tokens.push(t);
		if (closeLen > 0) {
			tokens.push(createToken('string', text.slice(endIdx, segEnd), pos + endIdx));
		}
		return tokens;
	}
}

export function createSwiftTokenizer(): SwiftTokenizer {
	return new SwiftTokenizer();
}
