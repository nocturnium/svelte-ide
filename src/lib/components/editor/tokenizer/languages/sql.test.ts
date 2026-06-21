import { describe, it } from 'vitest';
import { createSqlTokenizer } from './sql';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

describe('SqlTokenizer', () => {
	describe('keywords', () => {
		it('classifies SELECT/FROM/WHERE as control keywords', () => {
			const line = tok(createSqlTokenizer(), 'SELECT id FROM users WHERE id = 1');
			expectToken(line, 'keyword.control', 'SELECT');
			expectToken(line, 'keyword.control', 'FROM');
			expectToken(line, 'keyword.control', 'WHERE');
		});

		it('matches keywords case-insensitively but preserves original casing', () => {
			const line = tok(createSqlTokenizer(), 'select * from accounts');
			expectToken(line, 'keyword.control', 'select');
			expectToken(line, 'keyword.control', 'from');
		});

		it('handles mixed-case keywords', () => {
			const line = tok(createSqlTokenizer(), 'Select Distinct name From t');
			expectToken(line, 'keyword.control', 'Select');
			expectToken(line, 'keyword', 'Distinct');
			expectToken(line, 'keyword.control', 'From');
		});

		it('classifies logical/membership words as operator keywords', () => {
			const line = tok(createSqlTokenizer(), 'WHERE a AND b OR c IN (1)');
			expectToken(line, 'keyword.operator', 'AND');
			expectToken(line, 'keyword.operator', 'OR');
			expectToken(line, 'keyword.operator', 'IN');
		});

		it('classifies DDL verbs and object kinds as definition keywords', () => {
			const line = tok(createSqlTokenizer(), 'CREATE TABLE foo');
			expectToken(line, 'keyword.definition', 'CREATE');
			expectToken(line, 'keyword.definition', 'TABLE');
		});

		it('classifies general keywords as keyword', () => {
			const line = tok(createSqlTokenizer(), 'INSERT INTO t SET x AS y');
			expectToken(line, 'keyword', 'SET');
			expectToken(line, 'keyword', 'AS');
		});
	});

	describe('strings', () => {
		it('tokenizes a single-quoted string literal', () => {
			const line = tok(createSqlTokenizer(), "SELECT 'hello world'");
			expectToken(line, 'string', "'hello world'");
		});

		it('treats a doubled single-quote as an escaped quote inside the string', () => {
			const line = tok(createSqlTokenizer(), "WHERE name = 'O''Brien'");
			expectToken(line, 'string', "'O''Brien'");
		});

		it('does not terminate early on the escaped quote', () => {
			const line = tok(createSqlTokenizer(), "VALUES ('a''b', 1)");
			expectToken(line, 'string', "'a''b'");
			expectToken(line, 'number', '1');
		});
	});

	describe('quoted identifiers', () => {
		it('emits a double-quoted identifier as variable', () => {
			const line = tok(createSqlTokenizer(), 'SELECT "user id" FROM t');
			expectToken(line, 'variable', '"user id"');
		});

		it('emits a backtick-quoted identifier as variable', () => {
			const line = tok(createSqlTokenizer(), 'SELECT `order` FROM t');
			expectToken(line, 'variable', '`order`');
		});
	});

	describe('comments', () => {
		it('tokenizes a double-dash line comment', () => {
			const line = tok(createSqlTokenizer(), '-- this is a comment');
			expectToken(line, 'comment.line', '-- this is a comment');
		});

		it('tokenizes a hash line comment (MySQL)', () => {
			const line = tok(createSqlTokenizer(), '# mysql comment');
			expectToken(line, 'comment.line', '# mysql comment');
		});

		it('tokenizes an inline trailing comment', () => {
			const line = tok(createSqlTokenizer(), 'SELECT 1 -- pick one');
			expectToken(line, 'comment.line', '-- pick one');
			expectToken(line, 'keyword.control', 'SELECT');
		});

		it('tokenizes a single-line block comment', () => {
			const line = tok(createSqlTokenizer(), 'SELECT /* note */ 1');
			expectToken(line, 'comment.block', '/* note */');
		});
	});

	describe('numbers', () => {
		it('tokenizes an integer', () => {
			const line = tok(createSqlTokenizer(), 'LIMIT 42');
			expectToken(line, 'number', '42');
		});

		it('tokenizes a decimal', () => {
			const line = tok(createSqlTokenizer(), 'SET price = 19.99');
			expectToken(line, 'number', '19.99');
		});

		it('tokenizes scientific notation', () => {
			const line = tok(createSqlTokenizer(), 'SELECT 1.5e10');
			expectToken(line, 'number', '1.5e10');
		});

		it('tokenizes a leading-dot decimal', () => {
			const line = tok(createSqlTokenizer(), 'SELECT .5');
			expectToken(line, 'number', '.5');
		});
	});

	describe('operators', () => {
		it('classifies comparison operators', () => {
			const line = tok(createSqlTokenizer(), 'WHERE a <> b AND c >= d AND e != f');
			expectToken(line, 'operator.comparison', '<>');
			expectToken(line, 'operator.comparison', '>=');
			expectToken(line, 'operator.comparison', '!=');
		});

		it('classifies arithmetic operators', () => {
			const line = tok(createSqlTokenizer(), 'SELECT a + b * c - d / e');
			expectToken(line, 'operator.arithmetic', '+');
			expectToken(line, 'operator.arithmetic', '*');
			expectToken(line, 'operator.arithmetic', '/');
		});

		it('tokenizes the concatenation operator', () => {
			const line = tok(createSqlTokenizer(), 'SELECT a || b');
			expectToken(line, 'operator', '||');
		});
	});

	describe('identifiers, types, builtins and constants', () => {
		it('classifies builtin column types', () => {
			const line = tok(createSqlTokenizer(), 'CREATE TABLE t (id INTEGER, name VARCHAR)');
			expectToken(line, 'type.builtin', 'INTEGER');
			expectToken(line, 'type.builtin', 'VARCHAR');
		});

		it('classifies a builtin function followed by ( as a call', () => {
			const line = tok(createSqlTokenizer(), 'SELECT COUNT(*) FROM t');
			expectToken(line, 'function.call', 'COUNT');
		});

		it('classifies a user identifier followed by ( as a call', () => {
			const line = tok(createSqlTokenizer(), 'SELECT my_func(x)');
			expectToken(line, 'function.call', 'my_func');
		});

		it('classifies TRUE/FALSE as boolean constants and NULL as null', () => {
			const line = tok(createSqlTokenizer(), 'WHERE active = TRUE AND deleted = NULL');
			expectToken(line, 'constant.boolean', 'TRUE');
			expectToken(line, 'constant.null', 'NULL');
		});

		it('classifies plain identifiers as variables', () => {
			const line = tok(createSqlTokenizer(), 'SELECT customer_name FROM orders');
			expectToken(line, 'variable', 'customer_name');
			expectToken(line, 'variable', 'orders');
		});
	});

	describe('multi-line block comments', () => {
		it('threads an unterminated block comment across lines via state', () => {
			const lines = tokLines(createSqlTokenizer(), [
				'/* a multi-line',
				'   comment body',
				'   ends here */ SELECT 1'
			]);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
			expectToken(lines[2], 'comment.block', '   ends here */');
			expectToken(lines[2], 'keyword.control', 'SELECT');
			expectToken(lines[2], 'number', '1');
		});

		it('keeps an interior block-comment line entirely as comment', () => {
			const lines = tokLines(createSqlTokenizer(), ['/* open', 'still inside', 'close */']);
			expectToken(lines[1], 'comment.block', 'still inside');
		});
	});

	describe('realistic statements', () => {
		it('tokenizes a multi-token JOIN query', () => {
			const line = tok(
				createSqlTokenizer(),
				'SELECT u.id, COUNT(o.id) FROM users u LEFT JOIN orders o ON o.user_id = u.id'
			);
			expectToken(line, 'keyword.control', 'SELECT');
			expectToken(line, 'function.call', 'COUNT');
			expectToken(line, 'keyword.control', 'LEFT');
			expectToken(line, 'keyword.control', 'JOIN');
			expectToken(line, 'keyword.control', 'ON');
			expectToken(line, 'operator.comparison', '=');
			expectToken(line, 'punctuation.accessor', '.');
		});
	});

	describe('lossless reconstruction', () => {
		it('is lossless on an indented statement', () => {
			const original = '\t\tSELECT id, name FROM users WHERE id = 10;';
			expectLossless(tok(createSqlTokenizer(), original), original);
		});

		it('is lossless on a string containing escaped quotes', () => {
			const original = "INSERT INTO t (s) VALUES ('it''s a test');";
			expectLossless(tok(createSqlTokenizer(), original), original);
		});

		it('is lossless on a comment line', () => {
			const original = '  -- TODO: add an index on (user_id, created_at)';
			expectLossless(tok(createSqlTokenizer(), original), original);
		});

		it('is lossless across a multi-line block comment (trickiest construct)', () => {
			const inputs = ['/* changelog', " * v1: don't break ''this''", ' */ COMMIT;'];
			const results = tokLines(createSqlTokenizer(), inputs);
			for (let i = 0; i < inputs.length; i++) {
				expectLossless(results[i], inputs[i]);
			}
		});
	});
});
