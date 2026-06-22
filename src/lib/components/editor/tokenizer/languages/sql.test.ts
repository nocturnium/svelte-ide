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

		it('classifies ASC/DESC sort-direction modifiers as keywords (not variables)', () => {
			const line = tok(createSqlTokenizer(), 'ORDER BY created_at DESC, name ASC');
			expectToken(line, 'keyword', 'DESC');
			expectToken(line, 'keyword', 'ASC');
			expectLossless(line, 'ORDER BY created_at DESC, name ASC');
		});

		it('matches ASC/DESC case-insensitively', () => {
			const line = tok(createSqlTokenizer(), 'order by x asc, y desc');
			expectToken(line, 'keyword', 'asc');
			expectToken(line, 'keyword', 'desc');
		});
	});

	describe('strings', () => {
		it('tokenizes a single-quoted string literal', () => {
			const line = tok(createSqlTokenizer(), "SELECT 'hello world'");
			expectToken(line, 'string', "'hello world'");
		});

		it('treats a doubled single-quote as an escaped quote inside the string', () => {
			const line = tok(createSqlTokenizer(), "WHERE name = 'O''Brien'");
			// The doubled '' is split out as string.escape; the body stays string.
			expectToken(line, 'string', "'O");
			expectToken(line, 'string.escape', "''");
			expectToken(line, 'string', "Brien'");
			expectLossless(line, "WHERE name = 'O''Brien'");
		});

		it('does not terminate early on the escaped quote', () => {
			const line = tok(createSqlTokenizer(), "VALUES ('a''b', 1)");
			expectToken(line, 'string', "'a");
			expectToken(line, 'string.escape', "''");
			expectToken(line, 'string', "b'");
			expectToken(line, 'number.integer', '1');
			expectLossless(line, "VALUES ('a''b', 1)");
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
			expectToken(line, 'number.integer', '42');
		});

		it('tokenizes a decimal', () => {
			const line = tok(createSqlTokenizer(), 'SET price = 19.99');
			expectToken(line, 'number.float', '19.99');
		});

		it('tokenizes scientific notation', () => {
			const line = tok(createSqlTokenizer(), 'SELECT 1.5e10');
			expectToken(line, 'number.float', '1.5e10');
		});

		it('tokenizes a leading-dot decimal', () => {
			const line = tok(createSqlTokenizer(), 'SELECT .5');
			expectToken(line, 'number.float', '.5');
		});

		it('tokenizes a hex literal as number.hex', () => {
			const line = tok(createSqlTokenizer(), 'SELECT 0xFF, 0Xa0');
			expectToken(line, 'number.hex', '0xFF');
			expectToken(line, 'number.hex', '0Xa0');
			expectLossless(line, 'SELECT 0xFF, 0Xa0');
		});

		it('tokenizes a binary literal as number.binary', () => {
			const line = tok(createSqlTokenizer(), 'SELECT 0b1010, 0B11');
			expectToken(line, 'number.binary', '0b1010');
			expectToken(line, 'number.binary', '0B11');
			expectLossless(line, 'SELECT 0b1010, 0B11');
		});

		it("tokenizes a hex bit-string literal X'..' as number.hex", () => {
			const line = tok(createSqlTokenizer(), "SELECT X'1F', x'00ab'");
			expectToken(line, 'number.hex', "X'1F'");
			expectToken(line, 'number.hex', "x'00ab'");
			expectLossless(line, "SELECT X'1F', x'00ab'");
		});

		it("tokenizes a binary bit-string literal B'..' as number.binary", () => {
			const line = tok(createSqlTokenizer(), "SELECT B'101', b'0'");
			expectToken(line, 'number.binary', "B'101'");
			expectToken(line, 'number.binary', "b'0'");
			expectLossless(line, "SELECT B'101', b'0'");
		});

		it('classifies a plain integer as number.integer (not float)', () => {
			const line = tok(createSqlTokenizer(), 'SELECT 100');
			expectToken(line, 'number.integer', '100');
			const floats = line.tokens.filter((t) => t.type === 'number.float');
			if (floats.length !== 0) throw new Error('integer misclassified as float');
		});

		it('does not let a leading-dot number swallow a member accessor', () => {
			// After an identifier, `.5` is accessor `.` + number `5`, NOT a `.5` decimal.
			const line = tok(createSqlTokenizer(), 'SELECT t1.5 FROM t1');
			expectToken(line, 'variable', 't1');
			expectToken(line, 'punctuation.accessor', '.');
			expectToken(line, 'number.integer', '5');
			expectLossless(line, 'SELECT t1.5 FROM t1');
		});

		it('keeps a leading-dot decimal after a closing paren as an accessor', () => {
			const line = tok(createSqlTokenizer(), 'SELECT (a).5');
			expectToken(line, 'punctuation.accessor', '.');
			expectToken(line, 'number.integer', '5');
			expectLossless(line, 'SELECT (a).5');
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
			expectToken(lines[2], 'number.integer', '1');
		});

		it('keeps an interior block-comment line entirely as comment', () => {
			const lines = tokLines(createSqlTokenizer(), ['/* open', 'still inside', 'close */']);
			expectToken(lines[1], 'comment.block', 'still inside');
		});
	});

	describe('PostgreSQL dollar-quoted strings', () => {
		it('tokenizes a plain $$...$$ dollar-quoted string as one string', () => {
			const line = tok(createSqlTokenizer(), 'SELECT $$dollar quoted$$ AS d');
			expectToken(line, 'string', '$$dollar quoted$$');
			expectToken(line, 'keyword', 'AS');
			expectLossless(line, 'SELECT $$dollar quoted$$ AS d');
		});

		it('tokenizes a tagged $body$...$body$ string as one string', () => {
			const line = tok(
				createSqlTokenizer(),
				'AS $body$ BEGIN RETURN 1; END $body$ LANGUAGE plpgsql'
			);
			expectToken(line, 'string', '$body$ BEGIN RETURN 1; END $body$');
			expectLossless(line, 'AS $body$ BEGIN RETURN 1; END $body$ LANGUAGE plpgsql');
		});

		it('threads a multi-line dollar-quoted body across lines via state', () => {
			const lines = tokLines(createSqlTokenizer(), [
				'SELECT $tag$ line one',
				'still inside; SELECT not-a-keyword',
				'end of body $tag$ AS x'
			]);
			expectToken(lines[0], 'string', '$tag$ line one');
			// Interior line is wholly the string — no keyword/operator leakage.
			expectToken(lines[1], 'string', 'still inside; SELECT not-a-keyword');
			expectToken(lines[2], 'string', 'end of body $tag$');
			expectToken(lines[2], 'keyword', 'AS');
			for (let i = 0; i < 3; i++) {
				expectLossless(
					lines[i],
					['SELECT $tag$ line one', 'still inside; SELECT not-a-keyword', 'end of body $tag$ AS x'][
						i
					]
				);
			}
		});

		it('does not confuse a $1 bind parameter with a dollar-quote opener', () => {
			const line = tok(createSqlTokenizer(), 'WHERE id = $1');
			expectToken(line, 'variable.parameter', '$1');
			expectLossless(line, 'WHERE id = $1');
		});
	});

	describe('PostgreSQL :: cast operator', () => {
		it('classifies :: as an operator (not two stray characters)', () => {
			const line = tok(createSqlTokenizer(), 'SELECT price::numeric, n::int4');
			expectToken(line, 'operator', '::');
			expectToken(line, 'type.builtin', 'numeric');
			expectLossless(line, 'SELECT price::numeric, n::int4');
		});
	});

	describe('escape strings', () => {
		it('honours a backslash-escaped quote inside a string (MySQL / E-string)', () => {
			const line = tok(createSqlTokenizer(), "SELECT 'quote\\'inside' FROM t");
			// The \' is split out as string.escape; the literal does not terminate on it.
			expectToken(line, 'string', "'quote");
			expectToken(line, 'string.escape', "\\'");
			expectToken(line, 'string', "inside'");
			expectToken(line, 'keyword.control', 'FROM');
			expectLossless(line, "SELECT 'quote\\'inside' FROM t");
		});

		it('folds an E-prefix into the string literal and splits the escape', () => {
			const line = tok(createSqlTokenizer(), "SELECT E'it\\'s escaped' AS v");
			// E prefix + opening quote are a string sub-token; \' is a string.escape.
			expectToken(line, 'string', 'E');
			expectToken(line, 'string', "'it");
			expectToken(line, 'string.escape', "\\'");
			expectToken(line, 'string', "s escaped'");
			expectToken(line, 'keyword', 'AS');
			expectLossless(line, "SELECT E'it\\'s escaped' AS v");
		});

		it('folds an N-prefix (T-SQL unicode) into the string literal', () => {
			const line = tok(createSqlTokenizer(), "SELECT N'unicode literal'");
			expectToken(line, 'string', 'N');
			expectToken(line, 'string', "'unicode literal'");
			expectLossless(line, "SELECT N'unicode literal'");
		});

		it('emits common C escapes (\\n, \\t, \\\\) as string.escape', () => {
			const line = tok(createSqlTokenizer(), "SELECT E'line1\\nline2\\tend\\\\done'");
			expectToken(line, 'string.escape', '\\n');
			expectToken(line, 'string.escape', '\\t');
			expectToken(line, 'string.escape', '\\\\');
			expectLossless(line, "SELECT E'line1\\nline2\\tend\\\\done'");
		});

		it('emits \\uXXXX / \\xHH / octal escapes as string.escape', () => {
			const line = tok(createSqlTokenizer(), "SELECT E'\\u00e9\\x41\\101'");
			expectToken(line, 'string.escape', '\\u00e9');
			expectToken(line, 'string.escape', '\\x41');
			expectToken(line, 'string.escape', '\\101');
			expectLossless(line, "SELECT E'\\u00e9\\x41\\101'");
		});
	});

	describe('T-SQL bracket identifiers and variables', () => {
		it('emits a bracket-quoted identifier as a single variable', () => {
			const line = tok(createSqlTokenizer(), 'SELECT [Order Details].[Qty] FROM [Order Details]');
			expectToken(line, 'variable', '[Order Details]');
			expectToken(line, 'variable', '[Qty]');
			expectLossless(line, 'SELECT [Order Details].[Qty] FROM [Order Details]');
		});

		it('does not treat an array subscript [] as a bracket identifier', () => {
			const line = tok(createSqlTokenizer(), 'SELECT arr::int[]');
			expectToken(line, 'operator', '::');
			// [] stays as plain text, not a variable.
			const brackets = line.tokens.filter((t) => t.type === 'variable' && t.text.includes('['));
			if (brackets.length !== 0) throw new Error('array subscript misread as identifier');
			expectLossless(line, 'SELECT arr::int[]');
		});

		it('classifies @@global as a system variable and @local as a parameter', () => {
			const line = tok(createSqlTokenizer(), 'SELECT @@ROWCOUNT, @count');
			expectToken(line, 'variable', '@@ROWCOUNT');
			expectToken(line, 'variable.parameter', '@count');
			expectLossless(line, 'SELECT @@ROWCOUNT, @count');
		});
	});

	describe('nested block comments (PostgreSQL)', () => {
		it('closes a nested block comment at the OUTER */, not the inner one', () => {
			const lines = tokLines(createSqlTokenizer(), [
				'/* block start',
				'  nested /* inner */ still going',
				'   end */ SELECT 99'
			]);
			// The interior line must NOT leak code after the inner */.
			expectToken(lines[1], 'comment.block', '  nested /* inner */ still going');
			expectToken(lines[2], 'comment.block', '   end */');
			expectToken(lines[2], 'keyword.control', 'SELECT');
			expectToken(lines[2], 'number.integer', '99');
		});

		it('closes a single-line nested block comment at the outer */', () => {
			const line = tok(createSqlTokenizer(), 'SELECT /* a /* b */ c */ 1');
			expectToken(line, 'comment.block', '/* a /* b */ c */');
			expectToken(line, 'number.integer', '1');
			expectLossless(line, 'SELECT /* a /* b */ c */ 1');
		});
	});

	describe('window keywords', () => {
		it('classifies OVER and PARTITION as control keywords', () => {
			const line = tok(createSqlTokenizer(), 'SELECT COUNT(*) OVER (PARTITION BY dept) FROM emp');
			expectToken(line, 'keyword.control', 'OVER');
			expectToken(line, 'keyword.control', 'PARTITION');
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

	describe('PostgreSQL JSON / array / range operators', () => {
		it('classifies -> and ->> JSON access operators', () => {
			const line = tok(createSqlTokenizer(), "SELECT data->'a', data->>'b' FROM t");
			expectToken(line, 'operator', '->');
			expectToken(line, 'operator', '->>');
			expectLossless(line, "SELECT data->'a', data->>'b' FROM t");
		});

		it('classifies #> and #>> JSON path operators (not a hash comment)', () => {
			const line = tok(createSqlTokenizer(), "SELECT meta#>'{x}', meta#>>'{y}' FROM t");
			expectToken(line, 'operator', '#>');
			expectToken(line, 'operator', '#>>');
			// No part of the line leaked into a line comment.
			const comments = line.tokens.filter((t) => t.type === 'comment.line');
			if (comments.length !== 0) throw new Error('JSON path # misread as a comment');
			expectLossless(line, "SELECT meta#>'{x}', meta#>>'{y}' FROM t");
		});

		it('classifies containment and overlap operators @> <@ &&', () => {
			const line = tok(createSqlTokenizer(), "WHERE tags @> '{a}' AND '{b}' <@ tags AND a && b");
			expectToken(line, 'operator', '@>');
			expectToken(line, 'operator', '<@');
			expectToken(line, 'operator', '&&');
			expectLossless(line, "WHERE tags @> '{a}' AND '{b}' <@ tags AND a && b");
		});

		it('classifies the #- delete-path operator', () => {
			const line = tok(createSqlTokenizer(), "SELECT a #- '{p}' FROM t");
			expectToken(line, 'operator', '#-');
			expectLossless(line, "SELECT a #- '{p}' FROM t");
		});

		it('classifies bit-shift << >> and full-text @@ operators', () => {
			const line = tok(createSqlTokenizer(), 'SELECT a << 2, b >> 1, tsv @@ q FROM t');
			expectToken(line, 'operator', '<<');
			expectToken(line, 'operator', '>>');
			expectToken(line, 'operator', '@@');
			expectLossless(line, 'SELECT a << 2, b >> 1, tsv @@ q FROM t');
		});

		it('classifies regex match operators ~ ~* !~ !~*', () => {
			const line = tok(
				createSqlTokenizer(),
				"WHERE a ~ 'x' AND b ~* 'y' AND c !~ 'z' AND d !~* 'w'"
			);
			expectToken(line, 'operator', '~');
			expectToken(line, 'operator', '~*');
			expectToken(line, 'operator', '!~');
			expectToken(line, 'operator', '!~*');
			expectLossless(line, "WHERE a ~ 'x' AND b ~* 'y' AND c !~ 'z' AND d !~* 'w'");
		});

		it('classifies the jsonb existence operators ? ?| ?&', () => {
			const line = tok(createSqlTokenizer(), "WHERE doc ? 'k' AND doc ?| a AND doc ?& b");
			// A bare ? after an operand is the existence operator, not a placeholder.
			expectToken(line, 'operator', '?');
			expectToken(line, 'operator', '?|');
			expectToken(line, 'operator', '?&');
			expectLossless(line, "WHERE doc ? 'k' AND doc ?| a AND doc ?& b");
		});
	});

	describe('bind parameters', () => {
		it('classifies a positional $N parameter as variable.parameter', () => {
			const line = tok(createSqlTokenizer(), 'WHERE id = $1 AND x = $42');
			expectToken(line, 'variable.parameter', '$1');
			expectToken(line, 'variable.parameter', '$42');
			expectLossless(line, 'WHERE id = $1 AND x = $42');
		});

		it('classifies a named :name parameter as variable.parameter (not a :: cast)', () => {
			const line = tok(createSqlTokenizer(), 'WHERE id = :id AND s = :status');
			expectToken(line, 'variable.parameter', ':id');
			expectToken(line, 'variable.parameter', ':status');
			// The :: cast operator must still win over named-param parsing.
			const cast = tok(createSqlTokenizer(), 'SELECT x::int');
			expectToken(cast, 'operator', '::');
			expectLossless(line, 'WHERE id = :id AND s = :status');
		});

		it('classifies a ? placeholder in operand position as variable.parameter', () => {
			const line = tok(createSqlTokenizer(), 'INSERT INTO t VALUES (?, ?, ?)');
			const params = line.tokens.filter((t) => t.type === 'variable.parameter' && t.text === '?');
			if (params.length !== 3) throw new Error('expected three ? placeholders');
			expectLossless(line, 'INSERT INTO t VALUES (?, ?, ?)');
		});

		it('classifies @local as a parameter and @@global as a system variable', () => {
			const line = tok(createSqlTokenizer(), 'SET @x = @@SPID');
			expectToken(line, 'variable.parameter', '@x');
			expectToken(line, 'variable', '@@SPID');
			expectLossless(line, 'SET @x = @@SPID');
		});
	});

	describe('number subtypes', () => {
		it('classifies 0x.. as number.hex and 0b.. as number.binary', () => {
			const line = tok(createSqlTokenizer(), 'SELECT 0xFF + 0b101');
			expectToken(line, 'number.hex', '0xFF');
			expectToken(line, 'number.binary', '0b101');
			expectLossless(line, 'SELECT 0xFF + 0b101');
		});

		it("classifies X'..' / B'..' bit-string literals as hex/binary numbers", () => {
			const line = tok(createSqlTokenizer(), "SELECT X'1a', B'10'");
			expectToken(line, 'number.hex', "X'1a'");
			expectToken(line, 'number.binary', "B'10'");
			expectLossless(line, "SELECT X'1a', B'10'");
		});

		it('distinguishes integer from float', () => {
			const line = tok(createSqlTokenizer(), 'SELECT 7, 7.0, 7e3, .7');
			expectToken(line, 'number.integer', '7');
			expectToken(line, 'number.float', '7.0');
			expectToken(line, 'number.float', '7e3');
			expectToken(line, 'number.float', '.7');
			expectLossless(line, 'SELECT 7, 7.0, 7e3, .7');
		});
	});

	describe('string.escape sub-tokens', () => {
		it('splits C-style escapes inside an E-string', () => {
			const line = tok(createSqlTokenizer(), "SELECT E'a\\nb\\tc\\\\d'");
			expectToken(line, 'string.escape', '\\n');
			expectToken(line, 'string.escape', '\\t');
			expectToken(line, 'string.escape', '\\\\');
			expectLossless(line, "SELECT E'a\\nb\\tc\\\\d'");
		});

		it('splits \\uXXXX, \\xHH and octal escapes', () => {
			const line = tok(createSqlTokenizer(), "SELECT E'\\u00e9\\x41\\101'");
			expectToken(line, 'string.escape', '\\u00e9');
			expectToken(line, 'string.escape', '\\x41');
			expectToken(line, 'string.escape', '\\101');
			expectLossless(line, "SELECT E'\\u00e9\\x41\\101'");
		});

		it('splits the doubled-quote escape and keeps the body as string', () => {
			const line = tok(createSqlTokenizer(), "SELECT 'a''b'");
			expectToken(line, 'string', "'a");
			expectToken(line, 'string.escape', "''");
			expectToken(line, 'string', "b'");
			expectLossless(line, "SELECT 'a''b'");
		});
	});

	describe('member-access properties', () => {
		it('classifies an identifier after an accessor as a property', () => {
			const line = tok(createSqlTokenizer(), 'SELECT u.name, s.t.col FROM s.users u');
			expectToken(line, 'property', 'name');
			expectToken(line, 'property', 'col');
			expectLossless(line, 'SELECT u.name, s.t.col FROM s.users u');
		});

		it('classifies a keyword-named column after an accessor as a property, not a keyword', () => {
			const line = tok(createSqlTokenizer(), 'SELECT t.order, t.from FROM orders t');
			expectToken(line, 'property', 'order');
			expectToken(line, 'property', 'from');
			// The standalone FROM is still a control keyword.
			expectToken(line, 'keyword.control', 'FROM');
			expectLossless(line, 'SELECT t.order, t.from FROM orders t');
		});

		it('classifies a property immediately before ( as a method-style call', () => {
			const line = tok(createSqlTokenizer(), 'SELECT obj.method(x)');
			expectToken(line, 'function.call', 'method');
			expectLossless(line, 'SELECT obj.method(x)');
		});

		it('classifies a property after a quoted-identifier accessor', () => {
			const line = tok(createSqlTokenizer(), 'SELECT t."Col".inner FROM t');
			expectToken(line, 'property', 'inner');
			expectLossless(line, 'SELECT t."Col".inner FROM t');
		});
	});

	describe('multi-line single-quoted string threading', () => {
		it('threads an unterminated single-quoted literal across lines via state', () => {
			const inputs = [
				"SELECT 'line one \\",
				'still in string; SELECT not-a-keyword',
				"ends here' AS x"
			];
			const lines = tokLines(createSqlTokenizer(), inputs);
			// Interior line is wholly string — no keyword leakage.
			expectToken(lines[1], 'string', 'still in string; SELECT not-a-keyword');
			expectToken(lines[2], 'string', "ends here'");
			expectToken(lines[2], 'keyword', 'AS');
			for (let i = 0; i < inputs.length; i++) {
				expectLossless(lines[i], inputs[i]);
			}
		});

		it('keeps doubled-quote escapes intact across the continuation', () => {
			const inputs = ["SELECT 'it''s open", "and ''closes'' here' AS x"];
			const lines = tokLines(createSqlTokenizer(), inputs);
			expectToken(lines[1], 'string.escape', "''");
			expectToken(lines[1], 'keyword', 'AS');
			for (let i = 0; i < inputs.length; i++) {
				expectLossless(lines[i], inputs[i]);
			}
		});
	});

	describe('array subscript punctuation', () => {
		it('classifies int[] array brackets as punctuation.bracket', () => {
			const line = tok(createSqlTokenizer(), 'SELECT x::int[]');
			expectToken(line, 'operator', '::');
			expectToken(line, 'type.builtin', 'int');
			const brackets = line.tokens.filter((t) => t.type === 'punctuation.bracket');
			if (brackets.length !== 2) throw new Error('expected two array-subscript brackets');
			expectLossless(line, 'SELECT x::int[]');
		});
	});

	describe('re-audit hardening (seam regressions)', () => {
		it('does not turn comparisons or shifts into brackets/generics', () => {
			// A generic-depth tracker (if ever added) must never claim < > << >>.
			const line = tok(createSqlTokenizer(), 'WHERE a < b AND c > d AND a << 2 AND b >> 1');
			expectToken(line, 'operator.comparison', '<');
			expectToken(line, 'operator.comparison', '>');
			expectToken(line, 'operator', '<<');
			expectToken(line, 'operator', '>>');
			const brackets = line.tokens.filter((t) => t.type === 'punctuation.bracket');
			if (brackets.length !== 0) throw new Error('comparison/shift leaked into a bracket');
			expectLossless(line, 'WHERE a < b AND c > d AND a << 2 AND b >> 1');
		});

		it('keeps numbers and operators distinct when glued together', () => {
			const line = tok(createSqlTokenizer(), 'SELECT 1<2, 3>4, 5<>6, 1+2, 9%2');
			expectToken(line, 'number.integer', '1');
			expectToken(line, 'operator.comparison', '<');
			expectToken(line, 'operator.comparison', '<>');
			expectToken(line, 'operator.arithmetic', '+');
			expectToken(line, 'operator.arithmetic', '%');
			expectLossless(line, 'SELECT 1<2, 3>4, 5<>6, 1+2, 9%2');
		});

		it('leaves a string open when its closing quote is backslash-escaped', () => {
			// `'a\'` — the \' escapes the quote, so the literal is unterminated and the
			// escape must not be dropped/duplicated (lossless) and state stays open.
			const line = tok(createSqlTokenizer(), "SELECT 'a\\'");
			expectToken(line, 'string', "'a");
			expectToken(line, 'string.escape', "\\'");
			if ((line.state as { inString?: boolean } | undefined)?.inString !== true)
				throw new Error('escaped close-quote should leave string open');
			expectLossless(line, "SELECT 'a\\'");
		});

		it('keeps a doubled-quote run open when no real close quote follows', () => {
			// `'\\''` is backslash-escape + escaped-quote with no terminator: unterminated.
			const line = tok(createSqlTokenizer(), "SELECT '\\\\''");
			expectToken(line, 'string.escape', '\\\\');
			expectToken(line, 'string.escape', "''");
			if ((line.state as { inString?: boolean } | undefined)?.inString !== true)
				throw new Error('quote run should leave string open');
			expectLossless(line, "SELECT '\\\\''");
		});

		it('keeps a terminated prefixed E-string lossless when it abuts a cast', () => {
			// Regression on the prefixed-string return-length math: E'ends' must stop
			// at the close quote so ::text is re-scanned, not swallowed.
			const line = tok(createSqlTokenizer(), "SELECT E'ends'::text");
			expectToken(line, 'string', 'E');
			expectToken(line, 'string', "'ends'");
			expectToken(line, 'operator', '::');
			expectToken(line, 'type.builtin', 'text');
			expectLossless(line, "SELECT E'ends'::text");
		});

		it('threads an unterminated prefixed E-string across lines losslessly', () => {
			const inputs = ["SELECT E'open\\", 'still in string', "close' AS y"];
			const lines = tokLines(createSqlTokenizer(), inputs);
			expectToken(lines[1], 'string', 'still in string');
			expectToken(lines[2], 'string', "close'");
			expectToken(lines[2], 'keyword', 'AS');
			for (let i = 0; i < inputs.length; i++) {
				expectLossless(lines[i], inputs[i]);
			}
		});

		it('distinguishes the jsonb ? operator from a ? placeholder by operand context', () => {
			// `?` after an operand (here a string from data->'a') is the existence
			// operator; a `?` in operand position is a placeholder.
			const op = tok(createSqlTokenizer(), "WHERE data->'a' ? 'k'");
			expectToken(op, 'operator', '?');
			const ph = tok(createSqlTokenizer(), 'SELECT ? FROM t');
			expectToken(ph, 'variable.parameter', '?');
			expectLossless(op, "WHERE data->'a' ? 'k'");
		});

		it('produces contiguous, in-bounds token offsets on a dense mixed line', () => {
			const original = "SELECT t.col, E'x\\n', 0xFF, a->>'b', x::int[] FROM s.t WHERE id = $1;";
			const line = tok(createSqlTokenizer(), original);
			let cursor = 0;
			for (const t of line.tokens) {
				if (t.start !== cursor) throw new Error('non-contiguous token start at ' + cursor);
				if (t.end !== cursor + t.text.length) throw new Error('bad token end at ' + cursor);
				cursor = t.end;
			}
			if (cursor !== original.length) throw new Error('offsets do not span the line');
			expectLossless(line, original);
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
