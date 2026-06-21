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
	'REVOKE'
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
	'ROLLBACK'
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
	'CONSTRAINT'
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

		// Handle block comment continuation
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

		// Single-quoted string literals (doubled '' is an escaped quote)
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

		// Identifiers and keywords (allow leading _ and trailing digits/underscores)
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
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
		// terminate the string; a lone ' does.
		let i = 1;
		while (i < text.length) {
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
		return createToken('string', text.slice(0, i), pos);
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
