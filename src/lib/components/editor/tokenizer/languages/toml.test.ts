import { describe, it } from 'vitest';
import { createTomlTokenizer } from './toml';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const toml = createTomlTokenizer();

describe('TOML: tables', () => {
	it('tokenizes a simple table header', () => {
		const line = tok(toml, '[package]');
		expectToken(line, 'punctuation.bracket', '[');
		expectToken(line, 'type.class', 'package');
		expectToken(line, 'punctuation.bracket', ']');
	});

	it('tokenizes a dotted table header with accessors', () => {
		const line = tok(toml, '[servers.alpha]');
		expectToken(line, 'type.class', 'servers');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'type.class', 'alpha');
	});

	it('tokenizes an array-of-tables header', () => {
		const line = tok(toml, '[[products]]');
		expectToken(line, 'punctuation.bracket', '[[');
		expectToken(line, 'type.class', 'products');
		expectToken(line, 'punctuation.bracket', ']]');
	});

	it('handles a quoted key segment in a table header', () => {
		const line = tok(toml, '[site."google.com"]');
		expectToken(line, 'type.class', 'site');
		expectToken(line, 'type.class', '"google.com"');
	});
});

describe('TOML: keys and assignment', () => {
	it('classifies a bare key as a property', () => {
		const line = tok(toml, 'name = "value"');
		expectToken(line, 'property', 'name');
		expectToken(line, 'operator.assignment', '=');
	});

	it('classifies a dotted key with an accessor', () => {
		const line = tok(toml, 'physical.color = "orange"');
		expectToken(line, 'property', 'physical');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'color');
	});

	it('classifies a quoted key before = as a property', () => {
		const line = tok(toml, '"character encoding" = "value"');
		expectToken(line, 'property', '"character encoding"');
	});

	it('treats a key with dashes as a property', () => {
		const line = tok(toml, 'rust-version = "1.70"');
		expectToken(line, 'property', 'rust-version');
	});
});

describe('TOML: strings', () => {
	it('tokenizes a basic double-quoted string', () => {
		const line = tok(toml, 'greeting = "hello world"');
		expectToken(line, 'string', '"hello world"');
	});

	it('tokenizes a literal single-quoted string', () => {
		const line = tok(toml, "path = 'C:\\Users\\nodejs'");
		expectToken(line, 'string', "'C:\\Users\\nodejs'");
	});

	it('keeps escapes inside a basic string', () => {
		const line = tok(toml, 'quote = "she said \\"hi\\""');
		expectToken(line, 'string', '"she said \\"hi\\""');
	});

	it('does not process escapes in a literal string', () => {
		const line = tok(toml, "winpath = 'C:\\path\\to'");
		expectToken(line, 'string', "'C:\\path\\to'");
		expectLossless(line, "winpath = 'C:\\path\\to'");
	});
});

describe('TOML: comments', () => {
	it('tokenizes a full-line comment', () => {
		const line = tok(toml, '# this is a comment');
		expectToken(line, 'comment.line', '# this is a comment');
	});

	it('tokenizes a trailing comment after a value', () => {
		const line = tok(toml, 'port = 8080 # the listen port');
		expectToken(line, 'comment.line', '# the listen port');
		expectLossless(line, 'port = 8080 # the listen port');
	});
});

describe('TOML: numbers', () => {
	it('tokenizes an integer with underscores', () => {
		const line = tok(toml, 'big = 1_000_000');
		expectToken(line, 'number', '1_000_000');
	});

	it('tokenizes a hex integer', () => {
		const line = tok(toml, 'mask = 0xDEAD_BEEF');
		expectToken(line, 'number', '0xDEAD_BEEF');
	});

	it('tokenizes octal and binary integers', () => {
		const oct = tok(toml, 'perm = 0o755');
		expectToken(oct, 'number', '0o755');
		const bin = tok(toml, 'flags = 0b1010');
		expectToken(bin, 'number', '0b1010');
	});

	it('tokenizes a float with an exponent', () => {
		const line = tok(toml, 'avogadro = 6.022e23');
		expectToken(line, 'number', '6.022e23');
	});

	it('tokenizes inf and nan as numbers', () => {
		const inf = tok(toml, 'limit = inf');
		expectToken(inf, 'number', 'inf');
		const nan = tok(toml, 'sentinel = nan');
		expectToken(nan, 'number', 'nan');
	});
});

describe('TOML: booleans and dates', () => {
	it('tokenizes boolean values', () => {
		const t = tok(toml, 'enabled = true');
		expectToken(t, 'constant.boolean', 'true');
		const f = tok(toml, 'enabled = false');
		expectToken(f, 'constant.boolean', 'false');
	});

	it('tokenizes an RFC 3339 date-time', () => {
		const line = tok(toml, 'created = 2020-01-01T00:00:00Z');
		expectToken(line, 'constant.builtin', '2020-01-01T00:00:00Z');
	});

	it('tokenizes an offset date-time', () => {
		const line = tok(toml, 'updated = 1979-05-27T07:32:00-08:00');
		expectToken(line, 'constant.builtin', '1979-05-27T07:32:00-08:00');
	});
});

describe('TOML: arrays and inline tables', () => {
	it('tokenizes an inline array of numbers', () => {
		const line = tok(toml, 'ports = [ 8001, 8002, 8003 ]');
		expectToken(line, 'punctuation.bracket', '[');
		expectToken(line, 'punctuation.bracket', ']');
		expectToken(line, 'punctuation.separator', ',');
		expectToken(line, 'number', '8001');
	});

	it('tokenizes an inline table', () => {
		const line = tok(toml, 'point = { x = 1, y = 2 }');
		expectToken(line, 'punctuation.brace', '{');
		expectToken(line, 'punctuation.brace', '}');
		expectTokenType(line, 'number');
	});

	it('classifies inline-table keys as properties, not bare values', () => {
		// Regression: once the outer `=` flips to value mode, keys inside `{ }`
		// were mis-typed as `variable`. Inline-table members are real keys.
		const line = tok(toml, 'point = { x = 1, y = 2 }');
		expectToken(line, 'property', 'point');
		expectToken(line, 'property', 'x');
		expectToken(line, 'property', 'y');
		expectToken(line, 'number', '1');
		expectToken(line, 'number', '2');
		expectLossless(line, 'point = { x = 1, y = 2 }');
	});

	it('classifies inline-table keys with string values as properties', () => {
		// A realistic Cargo-style dependency spec.
		const line = tok(toml, 'dep = { version = "1.0", features = ["derive"] }');
		expectToken(line, 'property', 'dep');
		expectToken(line, 'property', 'version');
		expectToken(line, 'property', 'features');
		expectToken(line, 'string', '"1.0"');
		expectToken(line, 'string', '"derive"');
		expectLossless(line, 'dep = { version = "1.0", features = ["derive"] }');
	});

	it('classifies dotted keys inside an inline table as properties', () => {
		const line = tok(toml, 'a = { b.c = 1 }');
		expectToken(line, 'property', 'a');
		expectToken(line, 'property', 'b');
		expectToken(line, 'property', 'c');
		expectToken(line, 'punctuation.accessor', '.');
		expectLossless(line, 'a = { b.c = 1 }');
	});

	it('classifies a quoted key inside an inline table as a property', () => {
		const line = tok(toml, 'a = { "ke y" = 1 }');
		expectToken(line, 'property', '"ke y"');
		expectLossless(line, 'a = { "ke y" = 1 }');
	});

	it('handles keys in nested inline tables', () => {
		const line = tok(toml, 'nested = { a = { b = 1 } }');
		expectToken(line, 'property', 'nested');
		expectToken(line, 'property', 'a');
		expectToken(line, 'property', 'b');
		expectLossless(line, 'nested = { a = { b = 1 } }');
	});

	it('keeps array elements as values, not keys, across commas', () => {
		// Guard against the inline-table fix leaking into array context: commas
		// outside `{ }` must NOT re-open key context.
		const line = tok(toml, 'mixed = [1, "two", true]');
		expectToken(line, 'number', '1');
		expectToken(line, 'string', '"two"');
		expectToken(line, 'constant.boolean', 'true');
		expectLossless(line, 'mixed = [1, "two", true]');
	});
});

describe('TOML: multi-line strings', () => {
	it('threads a multi-line basic string across lines', () => {
		const lines = tokLines(toml, ['text = """', 'first line', 'second line"""']);
		expectTokenType(lines[0], 'string');
		expectTokenType(lines[1], 'string');
		expectTokenType(lines[2], 'string');
		expectLossless(lines[1], 'first line');
	});

	it('threads a multi-line literal string across lines', () => {
		const lines = tokLines(toml, ["regex = '''", '\\d+\\.\\d+', "version'''"]);
		expectTokenType(lines[1], 'string');
		expectLossless(lines[1], '\\d+\\.\\d+');
	});

	it('closes a single-line triple-quoted string', () => {
		const line = tok(toml, 'oneline = """just one line"""');
		expectToken(line, 'string', '"""just one line"""');
	});
});

describe('TOML: lossless and realistic lines', () => {
	it('is lossless on an indented dotted assignment', () => {
		const src = '    database.connection.max = 100';
		expectLossless(tok(toml, src), src);
	});

	it('is lossless on a comment line', () => {
		const src = '# Configuration for the build pipeline.';
		expectLossless(tok(toml, src), src);
	});

	it('is lossless on a string with escapes', () => {
		const src = 'msg = "line1\\nline2\\tindented"';
		expectLossless(tok(toml, src), src);
	});

	it('is lossless on an array-of-tables header', () => {
		const src = '[[build.targets]]';
		expectLossless(tok(toml, src), src);
	});

	it('tokenizes a realistic multi-token line', () => {
		const line = tok(toml, 'version = "1.6.0"  # current release');
		expectToken(line, 'property', 'version');
		expectToken(line, 'operator.assignment', '=');
		expectToken(line, 'string', '"1.6.0"');
		expectToken(line, 'comment.line', '# current release');
		expectLossless(line, 'version = "1.6.0"  # current release');
	});
});
