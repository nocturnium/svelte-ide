/**
 * C / C++ tokenizer
 *
 * Design notes / closed caveats:
 *  - Numbers emit precise subtypes (number.hex / number.binary / number.float /
 *    number.integer). Hex floats (0x1.8p3) and the p-exponent count as float;
 *    UDL suffixes (1.0_km) inherit the base literal's subtype.
 *  - Strings and char literals sub-tokenize escape sequences (\n, \t, \", \uXXXX,
 *    \xNN, \123 octal, \0) as string.escape inside the surrounding string token —
 *    losslessly. Raw strings are NOT escape-processed (raw strings have no escapes).
 *  - Generic / template angle brackets are tracked with a depth counter: a `<`
 *    opening a type-argument list (adjacent to a type-context token) and its
 *    matching `>` / `>>` close are emitted as punctuation.bracket, while a `<` / `>`
 *    used as comparison and `<<` / `>>` used as shift stay operators.
 *  - Members after an accessor (. -> ::) classify as property (or function.call when
 *    followed by `(`); namespace-qualified members after `::` to a known namespace
 *    keep type/property context.
 *  - Function definitions (a return-typed `name(`) classify as function.definition,
 *    distinct from a bare `name(` call site (function.call).
 *  - Multi-line constructs threaded via state: block comments, raw strings, and
 *    backslash-continued ordinary string/char literals.
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (introduce a type or template scope)
const definitionKeywords = new Set([
	'class',
	'struct',
	'union',
	'enum',
	'namespace',
	'template',
	'typename',
	'concept',
	'requires',
	'void'
]);

// Storage/specifier keywords
const storageKeywords = new Set([
	'const',
	'static',
	'extern',
	'inline',
	'virtual',
	'explicit',
	'friend',
	'mutable',
	'volatile',
	'constexpr',
	'consteval',
	'constinit',
	'register',
	'thread_local',
	'noexcept',
	'public',
	'private',
	'protected'
]);

// Control-flow keywords
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
	'goto',
	'try',
	'catch',
	'throw',
	// Coroutines (C++20) — control-flow-like suspension points
	'co_await',
	'co_return',
	'co_yield'
]);

// Other keywords
const otherKeywords = new Set([
	'new',
	'delete',
	'sizeof',
	'typeid',
	'this',
	'operator',
	'using',
	'auto',
	'decltype',
	'static_assert',
	'static_cast',
	'dynamic_cast',
	'reinterpret_cast',
	'const_cast',
	'alignas',
	'alignof',
	'export',
	'module'
]);

// Contextual ("soft") keywords: real identifiers everywhere, but act as keywords in
// specific syntactic positions. final/override appear after a function signature or
// class head; we classify them as keyword in those (very common) positions.
const contextualKeywords = new Set(['override', 'final']);

// Alternative spellings for operators (C++ reserved keyword-operators).
// These are real keywords, not identifiers, e.g. `a and b`, `not x`, `x bitand y`.
const operatorKeywords = new Set([
	'and',
	'and_eq',
	'bitand',
	'bitor',
	'compl',
	'not',
	'not_eq',
	'or',
	'or_eq',
	'xor',
	'xor_eq'
]);

// Builtin scalar / fixed-width types (used for type-context detection).
const builtinScalarTypes = new Set([
	'int',
	'char',
	'float',
	'double',
	'void',
	'bool',
	'short',
	'long',
	'unsigned',
	'signed',
	'wchar_t',
	'char8_t',
	'char16_t',
	'char32_t',
	'size_t',
	'ssize_t',
	'ptrdiff_t',
	'int8_t',
	'int16_t',
	'int32_t',
	'int64_t',
	'uint8_t',
	'uint16_t',
	'uint32_t',
	'uint64_t',
	'intptr_t',
	'uintptr_t'
]);

// Standard-library container/utility types — used as generic bases (vector<int>),
// so they participate in angle-bracket / type-context detection.
const stdLibTypes = new Set([
	'string',
	'wstring',
	'vector',
	'map',
	'set',
	'pair',
	'tuple',
	'array',
	'list',
	'deque',
	'queue',
	'stack',
	'span',
	'optional',
	'variant',
	'function',
	'unordered_map',
	'unordered_set',
	'shared_ptr',
	'unique_ptr',
	'weak_ptr'
]);

// `std` is a namespace, not a type; tracked separately so member resolution and
// type-context detection treat it correctly.
const builtinTypes = new Set([...builtinScalarTypes, ...stdLibTypes, 'std']);

// Preprocessor directive words (without the leading #)
const preprocessorDirectives = new Set([
	'include',
	'define',
	'undef',
	'ifdef',
	'ifndef',
	'if',
	'else',
	'elif',
	'endif',
	'pragma',
	'error',
	'warning',
	'line',
	'import',
	'using'
]);

interface CppTokenizerState extends TokenizerState {
	/** Inside a multi-line block comment */
	inBlockComment?: boolean;
	/** Inside a multi-line raw string; holds the closing delimiter to look for */
	rawStringDelimiter?: string;
	/**
	 * Inside a backslash-continued ordinary string/char literal spanning lines;
	 * holds the closing quote char (`"` or `'`).
	 */
	continuedStringQuote?: string;
}

export class CppTokenizer {
	language = 'cpp';

	// Angle-bracket nesting depth for generic / template argument lists. Reset per
	// line: a multi-line generic is rare and the depth heuristic is line-local, but
	// the open `<` detection re-derives context from the preceding token each time.
	private angleDepth = 0;
	// The previous emitted *significant* token (skipping whitespace), used for the
	// generic-open / function-definition / member heuristics.
	private prevToken: Token | null = null;

	getInitialState(): CppTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: CppTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: CppTokenizerState = { ...prevState };
		this.angleDepth = 0;
		this.prevToken = null;

		// Resume a multi-line block comment
		if (state.inBlockComment) {
			const endIdx = line.indexOf('*/');
			if (endIdx !== -1) {
				this.push(tokens, createToken('comment.block', line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
			} else {
				this.push(tokens, createToken('comment.block', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a multi-line raw string literal R"delim(...)delim"
		if (state.rawStringDelimiter !== undefined) {
			const close = state.rawStringDelimiter;
			const endIdx = line.indexOf(close);
			if (endIdx !== -1) {
				this.push(tokens, createToken('string', line.slice(0, endIdx + close.length), 0));
				pos = endIdx + close.length;
				state.rawStringDelimiter = undefined;
			} else {
				this.push(tokens, createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a backslash-continued ordinary string / char literal.
		if (state.continuedStringQuote !== undefined) {
			pos = this.resumeContinuedString(line, tokens, state);
			if (state.continuedStringQuote !== undefined) {
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Preprocessor directive: first non-space char on the (fresh) line is '#'
		if (pos === 0) {
			const hashMatch = line.match(/^(\s*)#/);
			if (hashMatch) {
				pos = this.tokenizePreprocessor(line, tokens, hashMatch[1].length);
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const before = tokens.length;
			const token = this.getNextToken(remaining, pos, state, tokens);

			if (token) {
				this.push(tokens, token);
				pos = token.end;
			} else if (tokens.length === before) {
				this.push(tokens, createToken('text', remaining[0], pos));
				pos += 1;
			} else {
				// getNextToken pushed sub-tokens itself; advance to the last one's end.
				pos = tokens[tokens.length - 1].end;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	/** Push a token and maintain the significant-token lookbehind. */
	private push(tokens: Token[], token: Token): void {
		tokens.push(token);
		if (token.type !== 'text' || token.text.trim().length > 0) {
			this.prevToken = token;
		}
	}

	/**
	 * Emit tokens for a preprocessor line. Returns the position after the directive
	 * word (and, for #include, after the header). The rest of the line is handled by
	 * the normal scanner so trailing comments/macros still classify correctly.
	 */
	private tokenizePreprocessor(line: string, tokens: Token[], hashPos: number): number {
		let pos = hashPos;

		// Leading whitespace before '#'
		if (hashPos > 0) {
			this.push(tokens, createToken('text', line.slice(0, hashPos), 0));
		}

		// The '#' itself
		this.push(tokens, createToken('keyword.module', '#', pos));
		pos += 1;

		// Optional whitespace between '#' and the directive word
		const wsAfterHash = line.slice(pos).match(/^[ \t]+/);
		if (wsAfterHash) {
			this.push(tokens, createToken('text', wsAfterHash[0], pos));
			pos += wsAfterHash[0].length;
		}

		// Directive word
		const dirMatch = line.slice(pos).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (!dirMatch) {
			return pos;
		}
		const directive = dirMatch[0];
		this.push(
			tokens,
			createToken(
				preprocessorDirectives.has(directive) ? 'keyword.module' : 'keyword',
				directive,
				pos
			)
		);
		pos += directive.length;

		// For #include, the following <...> or "..." is the header path => string
		if (directive === 'include' || directive === 'import') {
			const wsBeforeHeader = line.slice(pos).match(/^[ \t]+/);
			if (wsBeforeHeader) {
				this.push(tokens, createToken('text', wsBeforeHeader[0], pos));
				pos += wsBeforeHeader[0].length;
			}
			const headerMatch = line.slice(pos).match(/^(?:<[^>]*>|"[^"]*")/);
			if (headerMatch) {
				this.push(tokens, createToken('string', headerMatch[0], pos));
				pos += headerMatch[0].length;
			}
		}

		return pos;
	}

	/**
	 * Scan one token starting at `text[0]`. For escape-bearing strings/char literals
	 * the method pushes sub-tokens onto `tokens` itself and returns null (the caller
	 * detects that tokens grew). For everything else it returns a single token.
	 */
	private getNextToken(
		text: string,
		pos: number,
		state: CppTokenizerState,
		tokens: Token[]
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

		// Raw string literals: (prefix)R"delim(...)delim" — may span lines, no escapes
		const rawMatch = text.match(/^(?:u8|u|U|L)?R"([^()\\ \t]*)\(/);
		if (rawMatch) {
			return this.tokenizeRawString(text, pos, rawMatch[0], rawMatch[1], state);
		}

		// String literals (with optional encoding prefix) — sub-tokenizes escapes.
		const strPrefix = text.match(/^(?:u8|u|U|L)?"/);
		if (strPrefix) {
			this.tokenizeQuoted(text, pos, strPrefix[0].length, '"', state, tokens);
			return null;
		}

		// Character literals (with optional encoding prefix) — sub-tokenizes escapes.
		const charPrefix = text.match(/^(?:u8|u|U|L)?'/);
		if (charPrefix) {
			this.tokenizeQuoted(text, pos, charPrefix[0].length, "'", state, tokens);
			return null;
		}

		// Numbers. Trailing [uUlLfFzZ]* covers standard suffixes; the final optional
		// `_ident` group captures user-defined literal suffixes (e.g. 1.0_km, 42_kg) so
		// the literal stays one token instead of splitting off a phantom identifier.
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F']+(?:\.[0-9a-fA-F']*)?(?:[pP][+-]?\d+)?|0[bB][01']+|(?:\d[\d']*\.?[\d']*|\.\d[\d']*)(?:[eE][+-]?\d+)?)[uUlLfFzZ]*(?:_[a-zA-Z_][a-zA-Z0-9_]*)?/
		);
		if (numMatch) {
			return createToken(this.classifyNumber(numMatch[0]), numMatch[0], pos);
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators (multi-char first). <=> (three-way comparison) must precede <=
		// so the spaceship operator is not split into '<=' and '>'. ->* and .* are the
		// pointer-to-member operators; .* must precede the '.' accessor punctuation and
		// follow the number scan (so a float like `3.` is not mistaken for `.*`).
		//
		// Angle brackets in a generic/template-argument context are handled BEFORE the
		// generic operator scan so that `<`, `>` and a `>>` that closes two nested
		// generics become punctuation.bracket instead of operators.
		const angleTok = this.tryAngleBracket(text, pos);
		if (angleTok) {
			return angleTok;
		}

		const opMatch = text.match(
			/^(?:<<=|>>=|<=>|->\*|\.\*|\.\.\.|::|->|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[+\-*/%&|^~!<>=])/
		);
		if (opMatch) {
			return createToken(this.classifyOperator(opMatch[0]), opMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.:;?]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';' || char === ':' || char === '?')
				type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
	}

	/**
	 * Handle `<`, `>` and `>>` when they belong to a generic/template argument list.
	 * Returns a punctuation.bracket token, or null if the angle is not in generic
	 * context (so the normal operator scan classifies it as comparison/shift).
	 */
	private tryAngleBracket(text: string, pos: number): Token | null {
		if (text[0] === '<') {
			// `<=`, `<<`, `<=>` and `<<=` are never a single-`<` generic open.
			if (text[1] === '=' || text[1] === '<') {
				return null;
			}
			if (this.opensGeneric()) {
				this.angleDepth++;
				return createToken('punctuation.bracket', '<', pos);
			}
			return null;
		}
		if (text[0] === '>' && this.angleDepth > 0) {
			// A `>>` that closes two nested generic levels: emit a single bracket token
			// covering both chevrons (keeps it lossless and one styled unit).
			if (text[1] === '>' && this.angleDepth >= 2 && text[2] !== '=') {
				this.angleDepth -= 2;
				return createToken('punctuation.bracket', '>>', pos);
			}
			// `>=` and `>>=` are operators even inside a (mis-detected) generic.
			if (text[1] === '=') {
				return null;
			}
			this.angleDepth--;
			return createToken('punctuation.bracket', '>', pos);
		}
		return null;
	}

	/**
	 * A `<` opens a generic argument list when the previous significant token is a
	 * type-context token: a builtin/std type, a PascalCase type, the `template`
	 * keyword, or one of the `*_cast` keywords. This deliberately excludes plain
	 * variables (`a < b`) and shift usage (`cout << x`), which stay operators.
	 */
	private opensGeneric(): boolean {
		if (this.angleDepth > 0) return true; // already inside a generic argument list
		const p = this.prevToken;
		if (!p) return false;
		if (p.type === 'keyword.definition' && p.text === 'template') return true;
		if (p.type === 'keyword' && /_cast$/.test(p.text)) return true;
		if (
			p.type === 'type.builtin' ||
			p.type === 'type.class' ||
			p.type === 'type' ||
			p.type === 'type.interface' ||
			p.type === 'type.namespace'
		) {
			return true;
		}
		return false;
	}

	private classifyOperator(op: string): TokenType {
		if (op === '::' || op === '->' || op === '.' || op === '->*' || op === '.*')
			return 'punctuation.accessor';
		if (op === '=' || /^[+\-*/%&|^]?=$|^<<=$|^>>=$/.test(op)) return 'operator.assignment';
		if (
			op === '==' ||
			op === '!=' ||
			op === '<' ||
			op === '>' ||
			op === '<=' ||
			op === '>=' ||
			op === '<=>'
		)
			return 'operator.comparison';
		if (op === '&&' || op === '||' || op === '!') return 'operator.logical';
		if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%')
			return 'operator.arithmetic';
		return 'operator';
	}

	private classifyNumber(num: string): TokenType {
		if (/^0[xX]/.test(num)) {
			// Hex float: has a fraction dot or a binary (p/P) exponent.
			if (/[.pP]/.test(num)) return 'number.float';
			return 'number.hex';
		}
		if (/^0[bB]/.test(num)) return 'number.binary';
		// Float: a decimal point or a decimal exponent, OR an f/F floating suffix.
		if (/[.eE]/.test(num) || /[fF](?:_[a-zA-Z0-9_]*)?$/.test(num)) return 'number.float';
		return 'number.integer';
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		const afterWord = context.slice(wordLength);

		// Boolean / null constants
		if (word === 'true' || word === 'false') return 'constant.boolean';
		if (word === 'nullptr') return 'constant.null';
		if (word === 'NULL') return 'constant.builtin';

		// Member access: an identifier right after `.`, `->`, `.*`, `->*`, or `::`
		// classifies relative to the accessor rather than as a free variable/type.
		const prev = this.prevToken;
		const afterAccessor =
			prev &&
			prev.type === 'punctuation.accessor' &&
			(prev.text === '.' ||
				prev.text === '->' ||
				prev.text === '.*' ||
				prev.text === '->*' ||
				prev.text === '::');
		if (afterAccessor) {
			// member(...) => method/static call
			if (afterWord.startsWith('(')) return 'function.call';
			// Scope resolution (`::`) into a type-looking name keeps a type subtype;
			// nested types like std::string::size_type read better as types.
			if (prev.text === '::') {
				if (builtinTypes.has(word)) return 'type.builtin';
				if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) return 'type.class';
				if (/^[A-Z][A-Z0-9]*$/.test(word) && /_/.test(word)) return 'constant';
				// A single `<` right after a `::`-qualified name is a generic open
				// (`Allocator::rebind<U>`) => treat the name as a type so opensGeneric()
				// fires. A `<<` (shift, e.g. `std::cout <<`) does NOT count.
				const afterTrim = afterWord.replace(/^[ \t]*/, '');
				if (afterTrim.startsWith('<') && !afterTrim.startsWith('<<')) return 'type';
				return 'property';
			}
			// `.`/`->` member that is not a call => a data member / property access.
			return 'property';
		}

		// Keywords by category
		if (definitionKeywords.has(word)) return 'keyword.definition';
		if (storageKeywords.has(word)) return 'keyword.storage';
		if (controlKeywords.has(word)) return 'keyword.control';
		if (operatorKeywords.has(word)) return 'keyword.operator';
		if (otherKeywords.has(word)) {
			if (word === 'using' || word === 'export' || word === 'module') return 'keyword.module';
			return 'keyword';
		}

		// Contextual soft keywords (final/override) act as keywords only when they
		// trail a `)`, a type/class name, or another such keyword — not when used as a
		// plain identifier (`int final = 0;`).
		if (contextualKeywords.has(word) && this.inTrailingSpecifierPosition()) {
			return 'keyword';
		}

		// `std` namespace
		if (word === 'std') return 'type.namespace';

		// Builtin types
		if (builtinTypes.has(word)) {
			return 'type.builtin';
		}

		// Function: identifier immediately followed by '(' . If a type/specifier
		// precedes it (a return type or `template`-introduced context), it reads as a
		// definition; otherwise it's a call site.
		if (afterWord.startsWith('(')) {
			return this.looksLikeDefinitionName() ? 'function.definition' : 'function.call';
		}

		// SCREAMING_SNAKE_CASE => macro/constant
		if (/^[A-Z][A-Z0-9_]+$/.test(word) && word.includes('_')) {
			return 'constant';
		}

		// PascalCase => likely a type/class
		if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	/** True when the prev significant token makes a trailing `final`/`override` a keyword. */
	private inTrailingSpecifierPosition(): boolean {
		const p = this.prevToken;
		if (!p) return false;
		// After `)` (function signature), a type/class name (class head), or another
		// trailing specifier keyword.
		if (p.type === 'punctuation.paren' && p.text === ')') return true;
		if (p.type === 'type.class' || p.type === 'type' || p.type === 'type.interface') return true;
		if (p.type === 'keyword' && (p.text === 'override' || p.text === 'final')) return true;
		return false;
	}

	/**
	 * A `name(` reads as a function *definition* when the immediately preceding
	 * significant token is a return-type-ish token (a builtin/class/namespace type or
	 * a `*`/`&` declarator), rather than another value. Conservative: anything else
	 * (a bare call, `obj.method(`, `foo()(`) stays a call.
	 */
	private looksLikeDefinitionName(): boolean {
		const p = this.prevToken;
		if (!p) return false;
		if (
			p.type === 'type.builtin' ||
			p.type === 'type.class' ||
			p.type === 'type' ||
			p.type === 'type.interface' ||
			p.type === 'type.namespace'
		) {
			return true;
		}
		// `void name(` — void is a definition keyword but a genuine return type here.
		if (p.type === 'keyword.definition' && p.text === 'void') return true;
		// A pointer/reference declarator (`int* make(`, `T& get(`) or a closing generic
		// bracket of a return type (`vector<int> build(`) also introduces a definition.
		// The `*` here is the pointer declarator on a return type; matching the
		// documented design, treat it (and the `&` reference declarator) as a definition.
		if (p.type === 'operator.arithmetic' && p.text === '*') return true;
		if (p.type === 'operator' && p.text === '&') return true;
		if (p.type === 'punctuation.bracket' && (p.text === '>' || p.text === '>>')) return true;
		return false;
	}

	private tokenizeRawString(
		text: string,
		pos: number,
		opener: string,
		delimiter: string,
		state: CppTokenizerState
	): Token {
		const close = `)${delimiter}"`;
		const endIdx = text.indexOf(close, opener.length);
		if (endIdx !== -1) {
			return createToken('string', text.slice(0, endIdx + close.length), pos);
		}
		// Spans to the next line(s)
		state.rawStringDelimiter = close;
		return createToken('string', text, pos);
	}

	/**
	 * Tokenize an ordinary (escape-bearing) string or char literal starting at `text`,
	 * emitting the surrounding quote/prefix as `string` and each escape sequence as
	 * `string.escape`. Pushes sub-tokens directly onto `tokens`.
	 *
	 * Handles:
	 *  - termination on the matching unescaped quote;
	 *  - a trailing backslash before EOL => the literal continues on the next line
	 *    (tracked via state.continuedStringQuote);
	 *  - an otherwise-unterminated literal => emit the run as `string` to EOL.
	 */
	private tokenizeQuoted(
		text: string,
		pos: number,
		openLen: number,
		quote: string,
		state: CppTokenizerState,
		tokens: Token[]
	): void {
		// Opening prefix + quote.
		this.push(tokens, createToken('string', text.slice(0, openLen), pos));
		let i = openLen; // index into text
		let runStart = openLen; // start of the current plain-string run

		const flushRun = (endExclusive: number) => {
			if (endExclusive > runStart) {
				this.push(
					tokens,
					createToken('string', text.slice(runStart, endExclusive), pos + runStart)
				);
			}
		};

		while (i < text.length) {
			const ch = text[i];
			if (ch === '\\') {
				const escLen = this.escapeLength(text, i);
				if (i + escLen <= text.length && escLen > 1) {
					flushRun(i);
					this.push(tokens, createToken('string.escape', text.slice(i, i + escLen), pos + i));
					i += escLen;
					runStart = i;
					continue;
				}
				// A lone backslash at EOL is a line continuation: the literal resumes on
				// the next line. Emit the backslash as part of the string run.
				if (i === text.length - 1) {
					i++;
					flushRun(i);
					state.continuedStringQuote = quote;
					return;
				}
				// Backslash with no following char to escape (defensive): treat literally.
				i++;
				continue;
			}
			if (ch === quote) {
				// Closing quote ends the run; include the quote in the closing string token.
				flushRun(i);
				this.push(tokens, createToken('string', text.slice(i, i + 1), pos + i));
				return;
			}
			i++;
		}
		// Unterminated on this line and not a continuation: emit the remaining run.
		flushRun(i);
	}

	/**
	 * Resume a backslash-continued string/char literal on a fresh line. Mirrors
	 * tokenizeQuoted but with no opening quote. Returns the position after the literal
	 * (and clears state.continuedStringQuote) or the line length if it continues again.
	 */
	private resumeContinuedString(line: string, tokens: Token[], state: CppTokenizerState): number {
		const quote = state.continuedStringQuote as string;
		let i = 0;
		let runStart = 0;

		const flushRun = (endExclusive: number) => {
			if (endExclusive > runStart) {
				this.push(tokens, createToken('string', line.slice(runStart, endExclusive), runStart));
			}
		};

		while (i < line.length) {
			const ch = line[i];
			if (ch === '\\') {
				const escLen = this.escapeLength(line, i);
				if (escLen > 1) {
					flushRun(i);
					this.push(tokens, createToken('string.escape', line.slice(i, i + escLen), i));
					i += escLen;
					runStart = i;
					continue;
				}
				if (i === line.length - 1) {
					i++;
					flushRun(i);
					return i; // still continued; state.continuedStringQuote stays set
				}
				i++;
				continue;
			}
			if (ch === quote) {
				flushRun(i);
				this.push(tokens, createToken('string', line.slice(i, i + 1), i));
				state.continuedStringQuote = undefined;
				return i + 1;
			}
			i++;
		}
		flushRun(i);
		return i; // continues again
	}

	/**
	 * Length of the escape sequence starting at `text[i]` (which is a backslash), or 1
	 * if it is not a recognized escape. Recognizes: simple (\n \t \" \\ \0 etc.),
	 * \xHH+ hex, \uHHHH and \UHHHHHHHH, and \NNN octal (1-3 digits).
	 */
	private escapeLength(text: string, i: number): number {
		const next = text[i + 1];
		if (next === undefined) return 1;
		// \xHH... (one or more hex digits)
		if (next === 'x') {
			let j = i + 2;
			while (j < text.length && /[0-9a-fA-F]/.test(text[j])) j++;
			return j > i + 2 ? j - i : 2; // \x with no digits still consumes \x
		}
		// \uHHHH and \UHHHHHHHH (universal character names)
		if (next === 'u' || next === 'U') {
			const want = next === 'u' ? 4 : 8;
			let j = i + 2;
			let count = 0;
			while (j < text.length && count < want && /[0-9a-fA-F]/.test(text[j])) {
				j++;
				count++;
			}
			return count === want ? want + 2 : 2;
		}
		// \NNN octal (up to 3 digits)
		if (next >= '0' && next <= '7') {
			let j = i + 1;
			let count = 0;
			while (j < text.length && count < 3 && text[j] >= '0' && text[j] <= '7') {
				j++;
				count++;
			}
			return j - i;
		}
		// Simple single-char escapes: n t r v f a b 0 \ ' " ? and any other char.
		return 2;
	}
}

export function createCppTokenizer() {
	return new CppTokenizer();
}
