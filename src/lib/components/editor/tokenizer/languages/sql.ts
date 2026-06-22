/**
 * SQL tokenizer
 *
 * Keywords are matched CASE-INSENSITIVELY (the word is upper-cased before the
 * Set lookup) but the original text is always emitted, so `select` and `SELECT`
 * both classify as keywords while the source casing is preserved losslessly.
 *
 * Quoted-identifier choice: double-quoted ("col") and backtick-quoted (`col`)
 * spans are delimited IDENTIFIERS in SQL, not string literals, so they are
 * emitted as `variable`. Single-quoted spans are string literals (with the
 * standard doubled-quote `''` escape) and emit as `string`.
 *
 * String escapes: inside a single-quoted literal the standard doubled-quote
 * `''`, backslash C-escapes (`\n`, `\t`, `\\`, `\'`), `\xHH`, `\ooo` (octal) and
 * Unicode `\uXXXX` / `\UXXXXXXXX` escapes are split out as `string.escape`
 * sub-tokens so the body remains `string` but the escapes are styled distinctly.
 * The whole thing is still byte-for-byte lossless.
 *
 * Numbers carry precise subtypes: `number.hex` (0xFF / X'FF'), `number.binary`
 * (0b10 / B'10'), `number.float` (a dot or exponent), and `number.integer`.
 *
 * Bind parameters are first-class: PostgreSQL positional `$1`, named `:name` /
 * `@name` (also a T-SQL local), and the `?` placeholder all emit as
 * `variable.parameter`. (`@@global` stays a `variable` system reference.)
 *
 * PostgreSQL JSON / array / range / regex operators (`->`, `->>`, `#>`, `#>>`,
 * `@>`, `<@`, `?`, `?|`, `?&`, `#-`, `&&`, `<<`, `>>`, `||`, `~`, `~*`, `!~`,
 * `!~*`, `@@`) are tokenized as operators (logical/comparison subtypes where
 * they fit) instead of leaking out as stray text.
 *
 * Member access: an identifier following an accessor `.` (`t.col`, `s.t.col`)
 * is emitted as `property` rather than `variable`, and a property immediately
 * before `(` as a `function.call` (method-style call).
 *
 * Multi-line single-quoted strings are threaded across lines via state (an
 * unterminated literal — typically a backslash-continued or genuinely multi-row
 * string — keeps the next line in string context).
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// General + control keywords (case-insensitive; stored upper-case)
const keywords = new Set([
	'SELECT',
	'FROM',
	'WHERE',
	'INSERT',
	'INTO',
	'UPDATE',
	'DELETE',
	'CREATE',
	'DROP',
	'ALTER',
	'TABLE',
	'INDEX',
	'VIEW',
	'DATABASE',
	'SCHEMA',
	'JOIN',
	'INNER',
	'LEFT',
	'RIGHT',
	'FULL',
	'OUTER',
	'CROSS',
	'ON',
	'USING',
	'GROUP',
	'BY',
	'ORDER',
	'ASC',
	'DESC',
	'HAVING',
	'UNION',
	'ALL',
	'INTERSECT',
	'EXCEPT',
	'VALUES',
	'SET',
	'AS',
	'DISTINCT',
	'LIMIT',
	'OFFSET',
	'FETCH',
	'RETURNING',
	'WITH',
	'AND',
	'OR',
	'NOT',
	'IS',
	'IN',
	'LIKE',
	'ILIKE',
	'BETWEEN',
	'EXISTS',
	'CASE',
	'WHEN',
	'THEN',
	'ELSE',
	'END',
	'PRIMARY',
	'KEY',
	'FOREIGN',
	'REFERENCES',
	'DEFAULT',
	'CONSTRAINT',
	'UNIQUE',
	'CHECK',
	'CASCADE',
	'BEGIN',
	'COMMIT',
	'ROLLBACK',
	'TRANSACTION',
	'GRANT',
	'REVOKE',
	'OVER',
	'PARTITION',
	'WINDOW',
	'FILTER',
	'WITHIN',
	'RECURSIVE',
	'LATERAL',
	'NATURAL',
	'FUNCTION',
	'PROCEDURE',
	'TRIGGER',
	'RETURNS',
	'RETURN',
	'DECLARE',
	'LANGUAGE',
	'NULLS',
	'FIRST',
	'LAST',
	'ROWS',
	'RANGE',
	'GROUPS',
	'PRECEDING',
	'FOLLOWING',
	'UNBOUNDED',
	'CURRENT',
	'ROW'
]);

// Statement / clause keywords styled as control flow
const controlKeywords = new Set([
	'SELECT',
	'FROM',
	'WHERE',
	'INSERT',
	'INTO',
	'UPDATE',
	'DELETE',
	'JOIN',
	'INNER',
	'LEFT',
	'RIGHT',
	'FULL',
	'OUTER',
	'CROSS',
	'ON',
	'USING',
	'GROUP',
	'BY',
	'ORDER',
	'HAVING',
	'UNION',
	'INTERSECT',
	'EXCEPT',
	'VALUES',
	'LIMIT',
	'OFFSET',
	'FETCH',
	'RETURNING',
	'WITH',
	'CASE',
	'WHEN',
	'THEN',
	'ELSE',
	'END',
	'BEGIN',
	'COMMIT',
	'ROLLBACK',
	'OVER',
	'PARTITION',
	'WINDOW',
	'WITHIN',
	'FILTER'
]);

// Logical / membership keywords styled as operator-keywords
const operatorKeywords = new Set([
	'AND',
	'OR',
	'NOT',
	'IS',
	'IN',
	'LIKE',
	'ILIKE',
	'BETWEEN',
	'EXISTS'
]);

// Definition keywords (DDL verbs and object kinds)
const definitionKeywords = new Set([
	'CREATE',
	'DROP',
	'ALTER',
	'TABLE',
	'INDEX',
	'VIEW',
	'DATABASE',
	'SCHEMA',
	'CONSTRAINT',
	'FUNCTION',
	'PROCEDURE',
	'TRIGGER'
]);

// Built-in column types
const builtinTypes = new Set([
	'INT',
	'INTEGER',
	'BIGINT',
	'SMALLINT',
	'VARCHAR',
	'CHAR',
	'TEXT',
	'NVARCHAR',
	'DATE',
	'TIME',
	'TIMESTAMP',
	'DATETIME',
	'BOOLEAN',
	'BOOL',
	'FLOAT',
	'REAL',
	'DOUBLE',
	'DECIMAL',
	'NUMERIC',
	'SERIAL',
	'UUID',
	'JSON',
	'JSONB',
	'BLOB'
]);

// Built-in functions
const builtinFunctions = new Set([
	'COUNT',
	'SUM',
	'AVG',
	'MIN',
	'MAX',
	'COALESCE',
	'NULLIF',
	'CAST',
	'CONVERT',
	'NOW',
	'CURRENT_TIMESTAMP',
	'LENGTH',
	'UPPER',
	'LOWER',
	'SUBSTRING',
	'TRIM'
]);

interface SqlTokenizerState extends TokenizerState {
	inBlockComment?: boolean;
	/**
	 * Nesting depth of PostgreSQL block comments (they nest, unlike most SQL
	 * dialects). 0/undefined means not inside a block comment.
	 */
	blockCommentDepth?: number;
	/**
	 * When inside a PostgreSQL dollar-quoted string, this holds the exact closing
	 * delimiter we are waiting for (e.g. `$$` or `$body$`). Undefined when not in
	 * a dollar-quoted body.
	 */
	dollarTag?: string;
	/**
	 * When inside a multi-line single-quoted string literal, holds the prefix
	 * (`''`, `'`, `e'`, `x'`, ...) flag so the continuation knows it is still a
	 * string. We only need to know we are open; the closing delimiter is always a
	 * single `'`. `escapeString` records whether backslash escapes are honoured
	 * (always true for our purposes — MySQL/E-strings).
	 */
	inString?: boolean;
}

export class SqlTokenizer {
	language = 'sql';

	getInitialState(): SqlTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: SqlTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: SqlTokenizerState = { ...prevState };

		// Handle dollar-quoted body continuation (PostgreSQL). The body runs until
		// the exact matching tag is seen; nothing inside is interpreted as SQL.
		if (state.dollarTag) {
			const tag = state.dollarTag;
			const endIdx = line.indexOf(tag);
			if (endIdx !== -1) {
				tokens.push(createToken('string', line.slice(0, endIdx + tag.length), 0));
				pos = endIdx + tag.length;
				state.dollarTag = undefined;
			} else {
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Handle a multi-line single-quoted string continuation. The literal runs
		// until an unescaped, non-doubled `'`; escapes inside are sub-tokenized.
		if (pos === 0 && state.inString) {
			const closed = this.continueString(line, 0, state, tokens);
			pos = closed;
			if (state.inString) {
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Handle block comment continuation (PostgreSQL block comments nest).
		if (pos === 0 && (state.inBlockComment || (state.blockCommentDepth ?? 0) > 0)) {
			const consumed = this.continueBlockComment(line, state);
			if (consumed > 0) {
				tokens.push(createToken('comment.block', line.slice(0, consumed), 0));
				pos = consumed;
			}
			if ((state.blockCommentDepth ?? 0) > 0) {
				// Still open at end of line.
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const prev = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
			const consumed = this.getNextTokens(remaining, pos, state, prev, tokens);

			if (consumed > 0) {
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
	 * Emit the next token(s) for `text` (starting at absolute column `pos`),
	 * pushing them onto `out`. Returns the number of characters consumed (0 if no
	 * rule matched, so the caller emits a single `text` fallback char). Most rules
	 * push exactly one token; strings may push several (body + escapes).
	 */
	private getNextTokens(
		text: string,
		pos: number,
		state: SqlTokenizerState,
		prev: Token | undefined,
		out: Token[]
	): number {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			out.push(createToken('text', wsMatch[0], pos));
			return wsMatch[0].length;
		}

		// Line comments: -- to end of line
		if (text.startsWith('--')) {
			out.push(createToken('comment.line', text, pos));
			return text.length;
		}

		// Line comments: # to end of line (MySQL). Guard against the `#>`/`#>>`/`#-`
		// PostgreSQL JSON path operators, which start with `#` but are operators.
		if (text.startsWith('#') && !/^#(>>?|-)/.test(text)) {
			out.push(createToken('comment.line', text, pos));
			return text.length;
		}

		// Block comments (PostgreSQL block comments nest, so we track depth rather
		// than stopping at the first `*/`).
		if (text.startsWith('/*')) {
			let depth = 1;
			let i = 2;
			while (i < text.length && depth > 0) {
				if (text[i] === '/' && text[i + 1] === '*') {
					depth++;
					i += 2;
				} else if (text[i] === '*' && text[i + 1] === '/') {
					depth--;
					i += 2;
				} else {
					i++;
				}
			}
			if (depth === 0) {
				out.push(createToken('comment.block', text.slice(0, i), pos));
				return i;
			}
			state.inBlockComment = true;
			state.blockCommentDepth = depth;
			out.push(createToken('comment.block', text, pos));
			return text.length;
		}

		// Bit-string / hex-string literals: X'FF' (hex) and B'10' (binary). These
		// are NUMERIC literals in SQL, so they classify as number.hex/number.binary
		// rather than plain strings. Tested before the generic prefixed-string rule.
		const bitString = text.match(/^([xX])('[0-9A-Fa-f]*')/);
		if (bitString) {
			out.push(createToken('number.hex', bitString[0], pos));
			return bitString[0].length;
		}
		const binString = text.match(/^([bB])('[01]*')/);
		if (binString) {
			out.push(createToken('number.binary', binString[0], pos));
			return binString[0].length;
		}

		// Prefixed string literals: E'...' (PostgreSQL escape string), N'...'
		// (T-SQL unicode). The prefix is folded into the string token so `E'\n'`
		// stays one logical literal (a `string` prefix sub-token), while the escape
		// inside is still split out. The prefix is a single ASCII letter immediately
		// before the opening quote.
		const prefixedString = text.match(/^([eEnN])'/);
		if (prefixedString) {
			const prefix = prefixedString[1];
			out.push(createToken('string', prefix, pos));
			this.tokenizeString(text.slice(1), pos + 1, state, out);
			return state.inString ? text.length : this.lastEnd(out) - pos;
		}

		// Single-quoted string literals (doubled '' is an escaped quote; backslash
		// escapes are honoured for MySQL / escape-string compatibility). Escapes
		// inside are emitted as string.escape sub-tokens.
		if (text.startsWith("'")) {
			this.tokenizeString(text, pos, state, out);
			return state.inString ? text.length : this.lastEnd(out) - pos;
		}

		// Double-quoted quoted identifier
		if (text.startsWith('"')) {
			out.push(this.tokenizeIdentifierQuote(text, pos, '"'));
			return this.lastEnd(out) - pos;
		}

		// Backtick-quoted identifier (MySQL)
		if (text.startsWith('`')) {
			out.push(this.tokenizeIdentifierQuote(text, pos, '`'));
			return this.lastEnd(out) - pos;
		}

		// T-SQL bracket-quoted identifier: [Order Details]. A `]]` is an escaped
		// closing bracket inside the identifier. A `[` glued to the end of a value
		// (e.g. `int[]`, `arr[1]`) is an array subscript, not a delimited
		// identifier, so it is suppressed when the previous token ends like a
		// qualifier with no whitespace between.
		if (text.startsWith('[')) {
			const isSubscript = prev !== undefined && this.endsLikeQualifier(prev.text);
			if (!isSubscript) {
				out.push(this.tokenizeBracketIdentifier(text, pos));
				return this.lastEnd(out) - pos;
			}
		}

		// PostgreSQL positional bind parameter: $1, $2, ... A bare `$<digits>` is a
		// parameter; `$<ident>$` is a dollar-quote opener (handled below). We only
		// take this branch when the `$` is NOT followed by an identifier-then-`$`.
		const positionalParam = text.match(/^\$\d+/);
		if (positionalParam) {
			out.push(createToken('variable.parameter', positionalParam[0], pos));
			return positionalParam[0].length;
		}

		// PostgreSQL dollar-quoted string: $$...$$ or $tag$...$tag$. The opening
		// delimiter is $<optional-tag>$ where tag is an identifier. We open the
		// span here and thread the body across lines via state.dollarTag.
		const dollarOpen = text.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
		if (dollarOpen) {
			const tag = dollarOpen[0];
			const bodyStart = tag.length;
			const closeIdx = text.indexOf(tag, bodyStart);
			if (closeIdx !== -1) {
				out.push(createToken('string', text.slice(0, closeIdx + tag.length), pos));
				return closeIdx + tag.length;
			}
			state.dollarTag = tag;
			out.push(createToken('string', text, pos));
			return text.length;
		}

		// Numbers: hex (0x..), binary (0b..), float (dot or exponent), integer.
		//
		// A leading dot (".5") is only a number when the dot is NOT a member
		// accessor. After an identifier-like token ("t1.5", "alias.5", `foo`.5)
		// the dot is an accessor and the digits are a separate number, so the
		// leading-dot form is suppressed and the dot falls through to punctuation.
		const numConsumed = this.tokenizeNumber(text, pos, prev, out);
		if (numConsumed > 0) return numConsumed;

		// Named bind parameter: :name (but NOT the :: cast operator, tested below).
		// Also `:1` style positional in some drivers.
		const namedParam = text.match(/^:[A-Za-z_][A-Za-z0-9_]*/);
		if (namedParam && !text.startsWith('::')) {
			out.push(createToken('variable.parameter', namedParam[0], pos));
			return namedParam[0].length;
		}

		// `?` placeholder (JDBC / ODBC style) — but NOT the PostgreSQL jsonb
		// existence operators `?`, `?|`, `?&`, which only appear between operands
		// (after a value). The `?|`/`?&` forms are unambiguously operators. A bare
		// `?` is genuinely ambiguous between the jsonb existence operator (after an
		// operand) and a positional placeholder (in operand position); we pick by
		// the previous NON-WHITESPACE token: after a value/operand it is the
		// operator, otherwise a placeholder.
		if (text.startsWith('?')) {
			const lastMeaningful = this.lastMeaningfulToken(out);
			const isOperator =
				/^\?[|&]/.test(text) ||
				(lastMeaningful !== undefined && this.endsLikeOperand(lastMeaningful));
			if (isOperator) {
				const m = text.match(/^\?[|&]?/);
				const op = m ? m[0] : '?';
				out.push(createToken('operator', op, pos));
				return op.length;
			}
			out.push(createToken('variable.parameter', '?', pos));
			return 1;
		}

		// T-SQL variables: @@global (system) and @local. @@ is a system reference
		// (variable); a single @name is a parameter/local (variable.parameter).
		const sysVar = text.match(/^@@[A-Za-z_][A-Za-z0-9_]*/);
		if (sysVar) {
			out.push(createToken('variable', sysVar[0], pos));
			return sysVar[0].length;
		}
		const localVar = text.match(/^@[A-Za-z_][A-Za-z0-9_]*/);
		if (localVar) {
			out.push(createToken('variable.parameter', localVar[0], pos));
			return localVar[0].length;
		}

		// Identifiers and keywords (allow leading _ and trailing digits/underscores)
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			out.push(createToken(this.classifyIdentifier(word, text, word.length, prev), word, pos));
			return word.length;
		}

		// PostgreSQL cast operator `::` (must be tested before single `:` / other ops).
		if (text.startsWith('::')) {
			out.push(createToken('operator', '::', pos));
			return 2;
		}

		// Operators — including PostgreSQL JSON / array / range / regex operators.
		// Ordered longest-first so multi-char operators win over their prefixes.
		const opConsumed = this.tokenizeOperator(text, pos, out);
		if (opConsumed > 0) return opConsumed;

		// Punctuation
		const punctMatch = text.match(/^[(){}[\],.;]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === ',' || char === ';') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			out.push(createToken(type, char, pos));
			return 1;
		}

		return 0;
	}

	/** The end column of the most recently pushed token. */
	private lastEnd(out: Token[]): number {
		return out.length > 0 ? out[out.length - 1].end : 0;
	}

	/** The most recently pushed token that is not pure whitespace. */
	private lastMeaningfulToken(out: Token[]): Token | undefined {
		for (let i = out.length - 1; i >= 0; i--) {
			const t = out[i];
			if (t.type === 'text' && /^[ \t]*$/.test(t.text)) continue;
			return t;
		}
		return undefined;
	}

	/**
	 * Tokenize a numeric literal. Emits a precise subtype:
	 *   number.hex      0xFF / 0Xff
	 *   number.binary   0b10 / 0B01
	 *   number.float    has a fractional part or an exponent
	 *   number.integer  plain digits
	 * Returns characters consumed, or 0 if `text` does not begin with a number.
	 */
	private tokenizeNumber(text: string, pos: number, prev: Token | undefined, out: Token[]): number {
		// Hex literal: 0x / 0X followed by hex digits.
		const hex = text.match(/^0[xX][0-9A-Fa-f]+/);
		if (hex) {
			out.push(createToken('number.hex', hex[0], pos));
			return hex[0].length;
		}
		// Binary literal: 0b / 0B followed by binary digits.
		const bin = text.match(/^0[bB][01]+/);
		if (bin) {
			out.push(createToken('number.binary', bin[0], pos));
			return bin[0].length;
		}

		const dotIsAccessor =
			text[0] === '.' && prev !== undefined && this.endsLikeQualifier(prev.text);
		const numPattern = dotIsAccessor
			? /^(?:\d+\.?\d*)(?:[eE][+-]?\d+)?/
			: /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
		const numMatch = text.match(numPattern);
		if (numMatch && numMatch[0].length > 0) {
			const lit = numMatch[0];
			const isFloat = /[.eE]/.test(lit);
			out.push(createToken(isFloat ? 'number.float' : 'number.integer', lit, pos));
			return lit.length;
		}
		return 0;
	}

	/**
	 * Tokenize an operator at the start of `text`. Handles standard SQL operators
	 * AND the PostgreSQL JSON / array / range / regex operator family. Ordered
	 * longest-first. Returns characters consumed, or 0.
	 */
	private tokenizeOperator(text: string, pos: number, out: Token[]): number {
		// Three-char operators first.
		const three = text.match(/^(?:->>|#>>|!~\*)/);
		if (three) {
			out.push(createToken('operator', three[0], pos));
			return 3;
		}

		// Two-char operators.
		const two = text.match(/^(?:->|#>|#-|@>|<@|<<|>>|&&|\|\||\|\/|!~|~\*|<=|>=|<>|!=|@@|\^@)/);
		if (two) {
			const op = two[0];
			let type: TokenType = 'operator';
			if (op === '<=' || op === '>=' || op === '<>' || op === '!=') {
				type = 'operator.comparison';
			}
			out.push(createToken(type, op, pos));
			return 2;
		}

		// Single-char operators.
		const one = text.match(/^[=<>+\-*/%&|^~@#]/);
		if (one) {
			const op = one[0];
			let type: TokenType = 'operator';
			if (op === '=' || op === '<' || op === '>') {
				type = 'operator.comparison';
			} else if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
				type = 'operator.arithmetic';
			}
			out.push(createToken(type, op, pos));
			return 1;
		}
		return 0;
	}

	/**
	 * True when the previous token's trailing character makes a following `.`
	 * read as a member accessor (so `.<digits>` is NOT a leading-dot decimal):
	 * an identifier character, a closing paren, or a closing quoted-identifier
	 * delimiter.
	 */
	private endsLikeQualifier(text: string): boolean {
		const last = text[text.length - 1];
		if (last === undefined) return false;
		return /[A-Za-z0-9_)"`\]]/.test(last);
	}

	/**
	 * True when `prev` is a value/operand-producing token — used to disambiguate
	 * the jsonb `?` existence operator (after an operand) from a `?` bind
	 * placeholder (in operand position).
	 */
	private endsLikeOperand(prev: Token): boolean {
		if (
			prev.type === 'variable' ||
			prev.type === 'variable.parameter' ||
			prev.type === 'property' ||
			prev.type === 'string' ||
			prev.type.startsWith('number') ||
			prev.type === 'type.builtin'
		) {
			return true;
		}
		return prev.type === 'punctuation.paren' && prev.text === ')';
	}

	private classifyIdentifier(
		word: string,
		context: string,
		wordLength: number,
		prev: Token | undefined
	): TokenType {
		const upper = word.toUpperCase();

		// Member access: an identifier directly after an accessor `.` is a property
		// of the qualifier (`t.col`, `schema.table.col`). A property right before
		// `(` is a method-style call. This is checked before keyword/type lookup so
		// `t.order` reads as a property, not the ORDER keyword.
		const afterAccessor = prev !== undefined && prev.type === 'punctuation.accessor';
		if (afterAccessor) {
			const afterWord = context.slice(wordLength);
			if (afterWord.startsWith('(')) return 'function.call';
			return 'property';
		}

		// Boolean / null constants
		if (upper === 'TRUE' || upper === 'FALSE') return 'constant.boolean';
		if (upper === 'NULL') return 'constant.null';

		// Built-in functions (call form when immediately followed by '(')
		if (builtinFunctions.has(upper)) {
			const afterWord = context.slice(wordLength);
			if (afterWord.startsWith('(')) {
				return 'function.call';
			}
			return 'function';
		}

		// Built-in types
		if (builtinTypes.has(upper)) {
			return 'type.builtin';
		}

		// Keywords
		if (keywords.has(upper)) {
			if (controlKeywords.has(upper)) return 'keyword.control';
			if (operatorKeywords.has(upper)) return 'keyword.operator';
			if (definitionKeywords.has(upper)) return 'keyword.definition';
			return 'keyword';
		}

		// User identifier immediately followed by '(' => function call
		const afterWord = context.slice(wordLength);
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		return 'variable';
	}

	/**
	 * Tokenize a single-quoted string literal beginning at `text[0] === "'"`,
	 * splitting escape sequences into `string.escape` sub-tokens. The literal body
	 * (and opening/closing quotes) are `string`. A doubled `''` is an escaped
	 * quote and is emitted as `string.escape`. If the line ends before the closing
	 * quote, `state.inString` is set so the next line continues the literal.
	 * Pushes tokens to `out`.
	 */
	private tokenizeString(text: string, pos: number, state: SqlTokenizerState, out: Token[]): void {
		// The opening quote starts a `string` run we flush lazily.
		let runStart = 0; // index in text of the current string run start
		let i = 1; // skip opening quote

		const flush = (end: number) => {
			if (end > runStart) {
				out.push(createToken('string', text.slice(runStart, end), pos + runStart));
			}
		};

		while (i < text.length) {
			const c = text[i];
			if (c === '\\') {
				// Backslash C-style escape. Classify the maximal known escape form.
				const esc = this.matchBackslashEscape(text, i);
				flush(i);
				out.push(createToken('string.escape', text.slice(i, i + esc), pos + i));
				i += esc;
				runStart = i;
				continue;
			}
			if (c === "'") {
				if (text[i + 1] === "'") {
					// Doubled '' is an escaped quote.
					flush(i);
					out.push(createToken('string.escape', "''", pos + i));
					i += 2;
					runStart = i;
					continue;
				}
				// Closing quote: include it in the trailing string run and finish.
				flush(i + 1);
				return;
			}
			i++;
		}
		// Unterminated on this line — flush the remainder as string and stay open.
		flush(text.length);
		state.inString = true;
	}

	/**
	 * Continue an open multi-line single-quoted string into `line` from column
	 * `start`. Mirrors tokenizeString but with no opening quote. Clears
	 * `state.inString` when the closing quote is found. Returns the column after
	 * the consumed span (== line.length when still open).
	 */
	private continueString(
		line: string,
		start: number,
		state: SqlTokenizerState,
		out: Token[]
	): number {
		let runStart = start;
		let i = start;

		const flush = (end: number) => {
			if (end > runStart) {
				out.push(createToken('string', line.slice(runStart, end), runStart));
			}
		};

		while (i < line.length) {
			const c = line[i];
			if (c === '\\') {
				const esc = this.matchBackslashEscape(line, i);
				flush(i);
				out.push(createToken('string.escape', line.slice(i, i + esc), i));
				i += esc;
				runStart = i;
				continue;
			}
			if (c === "'") {
				if (line[i + 1] === "'") {
					flush(i);
					out.push(createToken('string.escape', "''", i));
					i += 2;
					runStart = i;
					continue;
				}
				flush(i + 1);
				state.inString = false;
				return i + 1;
			}
			i++;
		}
		flush(line.length);
		return line.length;
	}

	/**
	 * Return the length of the backslash escape sequence starting at `text[i]`
	 * (where `text[i] === '\\'`). Recognises `\xHH`, `\ooo` (1-3 octal digits),
	 * `\uXXXX`, `\UXXXXXXXX`, and single-character C escapes (`\n`, `\t`, `\\`,
	 * `\'`, ...). A trailing lone backslash at end of line yields length 1.
	 */
	private matchBackslashEscape(text: string, i: number): number {
		const next = text[i + 1];
		if (next === undefined) return 1; // lone trailing backslash
		if (next === 'x' || next === 'X') {
			const hex = text.slice(i + 2).match(/^[0-9A-Fa-f]{1,2}/);
			return hex ? 2 + hex[0].length : 2;
		}
		if (next === 'u') {
			const hex = text.slice(i + 2).match(/^[0-9A-Fa-f]{1,4}/);
			return hex ? 2 + hex[0].length : 2;
		}
		if (next === 'U') {
			const hex = text.slice(i + 2).match(/^[0-9A-Fa-f]{1,8}/);
			return hex ? 2 + hex[0].length : 2;
		}
		if (next >= '0' && next <= '7') {
			const oct = text.slice(i + 1).match(/^[0-7]{1,3}/);
			return oct ? 1 + oct[0].length : 2;
		}
		// Generic single-character escape (\n \t \r \\ \' \" \0 \b \f ...).
		return 2;
	}

	/**
	 * Continue an already-open (possibly nested) block comment into `line`,
	 * mutating `state.blockCommentDepth`. Returns the number of characters
	 * consumed from the start of the line. PostgreSQL block comments nest.
	 */
	private continueBlockComment(line: string, state: SqlTokenizerState): number {
		let depth = state.blockCommentDepth ?? 1;
		let i = 0;
		while (i < line.length && depth > 0) {
			if (line[i] === '/' && line[i + 1] === '*') {
				depth++;
				i += 2;
			} else if (line[i] === '*' && line[i + 1] === '/') {
				depth--;
				i += 2;
			} else {
				i++;
			}
		}
		state.blockCommentDepth = depth;
		state.inBlockComment = depth > 0;
		return i;
	}

	private tokenizeBracketIdentifier(text: string, pos: number): Token {
		// T-SQL [delimited identifier]. A doubled `]]` is an escaped bracket.
		let i = 1;
		while (i < text.length) {
			if (text[i] === ']') {
				if (text[i + 1] === ']') {
					i += 2;
					continue;
				}
				return createToken('variable', text.slice(0, i + 1), pos);
			}
			i++;
		}
		return createToken('variable', text.slice(0, text.length), pos);
	}

	private tokenizeIdentifierQuote(text: string, pos: number, delim: string): Token {
		// Double-quoted / backtick-quoted delimited identifier. A doubled delimiter
		// is an escaped delimiter inside the identifier.
		let i = 1;
		while (i < text.length) {
			if (text[i] === delim) {
				if (text[i + 1] === delim) {
					i += 2;
					continue;
				}
				return createToken('variable', text.slice(0, i + 1), pos);
			}
			i++;
		}
		return createToken('variable', text.slice(0, i), pos);
	}
}

export function createSqlTokenizer() {
	return new SqlTokenizer();
}
