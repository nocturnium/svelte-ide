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
			const token = this.getNextToken(remaining, pos, state, prev);

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
		state: SqlTokenizerState,
		prev?: Token
	): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Line comments: -- to end of line
		if (text.startsWith('--')) {
			return createToken('comment.line', text, pos);
		}

		// Line comments: # to end of line (MySQL)
		if (text.startsWith('#')) {
			return createToken('comment.line', text, pos);
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
				return createToken('comment.block', text.slice(0, i), pos);
			}
			state.inBlockComment = true;
			state.blockCommentDepth = depth;
			return createToken('comment.block', text, pos);
		}

		// Prefixed string literals: E'...' (PostgreSQL escape string), N'...'
		// (T-SQL unicode), B'...'/X'...' (bit/hex). The prefix is folded into the
		// string token so `E'\n'` is one literal, not identifier + string. The
		// prefix is a single ASCII letter immediately before the opening quote.
		const prefixedString = text.match(/^([eEnNbBxX])'/);
		if (prefixedString) {
			const prefix = prefixedString[1];
			const inner = this.tokenizeString(text.slice(1), pos + 1);
			return createToken('string', prefix + inner.text, pos);
		}

		// Single-quoted string literals (doubled '' is an escaped quote;
		// backslash escapes are honoured for MySQL / escape-string compatibility)
		if (text.startsWith("'")) {
			return this.tokenizeString(text, pos);
		}

		// Double-quoted quoted identifier
		if (text.startsWith('"')) {
			return this.tokenizeIdentifierQuote(text, pos, '"');
		}

		// Backtick-quoted identifier (MySQL)
		if (text.startsWith('`')) {
			return this.tokenizeIdentifierQuote(text, pos, '`');
		}

		// T-SQL bracket-quoted identifier: [Order Details]. A `]]` is an escaped
		// closing bracket inside the identifier. A `[` glued to the end of a value
		// (e.g. `int[]`, `arr[1]`) is an array subscript, not a delimited
		// identifier, so it is suppressed when the previous token ends like a
		// qualifier with no whitespace between.
		if (text.startsWith('[')) {
			const isSubscript = prev !== undefined && this.endsLikeQualifier(prev.text);
			if (!isSubscript) {
				return this.tokenizeBracketIdentifier(text, pos);
			}
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
				return createToken('string', text.slice(0, closeIdx + tag.length), pos);
			}
			state.dollarTag = tag;
			return createToken('string', text, pos);
		}

		// Numbers: integer, decimal, scientific.
		//
		// A leading dot (".5") is only a number when the dot is NOT a member
		// accessor. After an identifier-like token ("t1.5", "alias.5", `foo`.5)
		// the dot is an accessor and the digits are a separate number, so the
		// leading-dot form is suppressed and the dot falls through to
		// punctuation below.
		const dotIsAccessor =
			text[0] === '.' && prev !== undefined && this.endsLikeQualifier(prev.text);
		const numPattern = dotIsAccessor
			? /^(?:\d+\.?\d*)(?:[eE][+-]?\d+)?/
			: /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
		const numMatch = text.match(numPattern);
		if (numMatch && numMatch[0].length > 0) {
			return createToken('number', numMatch[0], pos);
		}

		// T-SQL variables: @@global (system) and @local. Stops at the first
		// non-identifier character.
		const atMatch = text.match(/^@@?[A-Za-z_][A-Za-z0-9_]*/);
		if (atMatch) {
			return createToken('variable', atMatch[0], pos);
		}

		// Identifiers and keywords (allow leading _ and trailing digits/underscores)
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// PostgreSQL cast operator `::` (must be tested before single `:` / other ops).
		if (text.startsWith('::')) {
			return createToken('operator', '::', pos);
		}

		// Operators
		const opMatch = text.match(/^(?:\|\||<>|!=|>=|<=|[=<>+\-*/%])/);
		if (opMatch) {
			const op = opMatch[0];
			let type: TokenType = 'operator';
			if (
				op === '=' ||
				op === '<>' ||
				op === '!=' ||
				op === '>=' ||
				op === '<=' ||
				op === '<' ||
				op === '>'
			) {
				type = 'operator.comparison';
			} else if (op === '||') {
				type = 'operator';
			} else if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
				type = 'operator.arithmetic';
			}
			return createToken(type, op, pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[(),.;]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
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
		return /[A-Za-z0-9_)"`]/.test(last);
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		const upper = word.toUpperCase();

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

	private tokenizeString(text: string, pos: number): Token {
		// Single-quoted literal. A doubled '' is an escaped quote and does NOT
		// terminate the string; a lone ' does. A backslash escapes the next
		// character (MySQL default and PostgreSQL E'' escape strings), so `\'`
		// does not terminate the literal either.
		let i = 1;
		while (i < text.length) {
			if (text[i] === '\\') {
				// Backslash escape: skip the escaped character (if any).
				i += 2;
				continue;
			}
			if (text[i] === "'") {
				if (text[i + 1] === "'") {
					i += 2;
					continue;
				}
				return createToken('string', text.slice(0, i + 1), pos);
			}
			i++;
		}
		// Unterminated on this line — emit the remainder as a string.
		return createToken('string', text.slice(0, text.length), pos);
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
