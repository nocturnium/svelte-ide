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

	it('sub-tokenizes escape sequences inside a basic string', () => {
		// The escaped quotes are emitted as distinct string.escape tokens, while the
		// surrounding literal text stays `string` — the theme colors them differently.
		const line = tok(toml, 'quote = "she said \\"hi\\""');
		expectToken(line, 'string.escape', '\\"');
		expectToken(line, 'string', '"she said ');
		expectToken(line, 'string', 'hi');
		expectLossless(line, 'quote = "she said \\"hi\\""');
	});

	it('emits string.escape for \\n \\t and unicode escapes', () => {
		// fail-before/pass-after: prior pass kept the whole string as one `string`.
		const line = tok(toml, 'msg = "a\\nb\\tc\\u2603d\\U0001F600e"');
		expectToken(line, 'string.escape', '\\n');
		expectToken(line, 'string.escape', '\\t');
		expectToken(line, 'string.escape', '\\u2603');
		expectToken(line, 'string.escape', '\\U0001F600');
		expectLossless(line, 'msg = "a\\nb\\tc\\u2603d\\U0001F600e"');
	});

	it('does not color an invalid escape as string.escape', () => {
		// `\z` is not a valid TOML escape; it must stay plain string, not be promoted
		// to string.escape, and the line must remain lossless.
		const line = tok(toml, 'p = "a\\zb"');
		expectToken(line, 'string', '"a\\zb"');
		expectLossless(line, 'p = "a\\zb"');
	});

	it('does not process escapes in a literal string', () => {
		const line = tok(toml, "winpath = 'C:\\path\\to'");
		// Single-quoted literals are verbatim: no string.escape tokens, whole token.
		expectToken(line, 'string', "'C:\\path\\to'");
		expectLossless(line, "winpath = 'C:\\path\\to'");
	});

	it('does not escape-split a quoted key that contains a backslash', () => {
		// A quoted *key* is an identifier, not a string value; `\t` inside it must not
		// become a string.escape token — the whole thing stays a single property.
		const line = tok(toml, '"a\\tb" = 1');
		expectToken(line, 'property', '"a\\tb"');
		expectLossless(line, '"a\\tb" = 1');
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
	it('tokenizes a decimal integer with underscores as number.integer', () => {
		const line = tok(toml, 'big = 1_000_000');
		expectToken(line, 'number.integer', '1_000_000');
	});

	it('tokenizes a hex integer as number.hex', () => {
		const line = tok(toml, 'mask = 0xDEAD_BEEF');
		expectToken(line, 'number.hex', '0xDEAD_BEEF');
	});

	it('tokenizes a binary integer as number.binary', () => {
		const bin = tok(toml, 'flags = 0b1010');
		expectToken(bin, 'number.binary', '0b1010');
	});

	it('tokenizes an octal integer as number.integer', () => {
		// The vocabulary has no number.octal subtype; an octal literal is still an
		// integer, so number.integer is the most precise honest classification.
		const oct = tok(toml, 'perm = 0o755');
		expectToken(oct, 'number.integer', '0o755');
	});

	it('tokenizes a float with a fraction as number.float', () => {
		const line = tok(toml, 'pi = 3.14159');
		expectToken(line, 'number.float', '3.14159');
	});

	it('tokenizes a float with an exponent as number.float', () => {
		const line = tok(toml, 'avogadro = 6.022e23');
		expectToken(line, 'number.float', '6.022e23');
	});

	it('tokenizes a bare-exponent float (no fraction) as number.float', () => {
		// `1e6` is a TOML float even with no decimal point.
		const line = tok(toml, 'n = 1e6');
		expectToken(line, 'number.float', '1e6');
	});

	it('tokenizes inf and nan as number.float', () => {
		// TOML defines inf/nan as float values, so they earn the float subtype.
		const inf = tok(toml, 'limit = inf');
		expectToken(inf, 'number.float', 'inf');
		const nan = tok(toml, 'sentinel = nan');
		expectToken(nan, 'number.float', 'nan');
	});

	it('does not fold a sign abutting a prior value into a second number', () => {
		// Regression: `1+2` previously tokenized as [number "1"][number "+2"], the
		// number regex eating the stray `+` as a leading sign. A sign is only a
		// number's sign at a fresh value position; abutting a value it is a lone op.
		const line = tok(toml, 'a = 1+2');
		expectToken(line, 'number.integer', '1');
		expectToken(line, 'number.integer', '2');
		// The `+` must be a standalone text token, NOT folded into a number like `+2`.
		expectToken(line, 'text', '+');
		expectLossless(line, 'a = 1+2');
	});

	it('still attaches a leading sign to a genuine signed number', () => {
		// Guard the regression fix: valid signed numbers (fresh value position,
		// including inside arrays) must keep their sign as part of the number.
		const pos = tok(toml, 'a = +1');
		expectToken(pos, 'number.integer', '+1');
		const neg = tok(toml, 'b = -inf');
		expectToken(neg, 'number.float', '-inf');
		const arr = tok(toml, 'c = [-1, +2]');
		expectToken(arr, 'number.integer', '-1');
		expectToken(arr, 'number.integer', '+2');
		expectLossless(arr, 'c = [-1, +2]');
	});

	it('subtypes a mixed-radix array element by element', () => {
		const line = tok(toml, 'c = [0x10, 0b1, 0o7, 3.5, 1e3, 42]');
		expectToken(line, 'number.hex', '0x10');
		expectToken(line, 'number.binary', '0b1');
		expectToken(line, 'number.integer', '0o7');
		expectToken(line, 'number.float', '3.5');
		expectToken(line, 'number.float', '1e3');
		expectToken(line, 'number.integer', '42');
		expectLossless(line, 'c = [0x10, 0b1, 0o7, 3.5, 1e3, 42]');
	});

	it('degrades an invalid hex literal without dangling letters into a number', () => {
		// `0xZZ` is not valid hex. The tokenizer must NOT emit a partial number.hex
		// with the `ZZ` dangling; it stays lossless and is not colored as a number.
		const line = tok(toml, 'a = 0xZZ');
		const hexTokens = line.tokens.filter((t) => t.type.startsWith('number'));
		// No number token should be emitted for an invalid radix literal.
		expectLossless(line, 'a = 0xZZ');
		if (hexTokens.length > 0) {
			throw new Error('invalid hex must not classify as a number: ' + JSON.stringify(hexTokens));
		}
	});

	it('does not match `inf` inside a longer bare word', () => {
		// `information` must not partial-match `inf` and leave `ormation` dangling.
		const line = tok(toml, 'a = information');
		expectToken(line, 'variable', 'information');
		expectLossless(line, 'a = information');
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

	it('does not mis-color a date prefix abutting identifier chars as a date', () => {
		// fail-before/pass-after: the date matcher used to run UNguarded (unlike the
		// number matchers, which boundary-check). So `2020-01-01extra` partial-matched
		// `2020-01-01` as a `constant.builtin` and left `extra` dangling — coloring an
		// invalid value as a real date. A date is only a date when not immediately
		// followed by an identifier char; otherwise it degrades like a bad number.
		const line = tok(toml, 'v = 2020-01-01extra');
		const dateTokens = line.tokens.filter((t) => t.type === 'constant.builtin');
		if (dateTokens.length > 0) {
			throw new Error(
				'a date prefix abutting identifier chars must NOT classify as a date constant: ' +
					JSON.stringify(dateTokens)
			);
		}
		expectLossless(line, 'v = 2020-01-01extra');
	});

	it('still classifies a real bare date and a date array element', () => {
		// Guard the boundary fix: genuinely-terminated dates (EOL, comma, `]`) keep
		// their date classification.
		const bare = tok(toml, 'd = 2020-01-01');
		expectToken(bare, 'constant.builtin', '2020-01-01');
		const arr = tok(toml, 'ds = [2020-01-01, 2021-02-02]');
		expectToken(arr, 'constant.builtin', '2020-01-01');
		expectToken(arr, 'constant.builtin', '2021-02-02');
		expectLossless(arr, 'ds = [2020-01-01, 2021-02-02]');
	});
});

describe('TOML: arrays and inline tables', () => {
	it('tokenizes an inline array of numbers', () => {
		const line = tok(toml, 'ports = [ 8001, 8002, 8003 ]');
		expectToken(line, 'punctuation.bracket', '[');
		expectToken(line, 'punctuation.bracket', ']');
		expectToken(line, 'punctuation.separator', ',');
		expectToken(line, 'number.integer', '8001');
	});

	it('tokenizes an inline table', () => {
		const line = tok(toml, 'point = { x = 1, y = 2 }');
		expectToken(line, 'punctuation.brace', '{');
		expectToken(line, 'punctuation.brace', '}');
		expectTokenType(line, 'number.integer');
	});

	it('classifies inline-table keys as properties, not bare values', () => {
		// Regression: once the outer `=` flips to value mode, keys inside `{ }`
		// were mis-typed as `variable`. Inline-table members are real keys.
		const line = tok(toml, 'point = { x = 1, y = 2 }');
		expectToken(line, 'property', 'point');
		expectToken(line, 'property', 'x');
		expectToken(line, 'property', 'y');
		expectToken(line, 'number.integer', '1');
		expectToken(line, 'number.integer', '2');
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
		expectToken(line, 'number.integer', '1');
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

	it('threads escape sub-tokenization through a multi-line basic string', () => {
		// fail-before/pass-after: escapes on a CONTINUATION line of a """...""" string
		// must still be colored as string.escape, not swallowed as plain string.
		const lines = tokLines(toml, ['text = """start \\t', 'mid \\u2603', 'end \\n"""']);
		expectToken(lines[0], 'string.escape', '\\t');
		expectToken(lines[1], 'string.escape', '\\u2603');
		expectToken(lines[2], 'string.escape', '\\n');
		expectToken(lines[2], 'string', '"""');
		expectLossless(lines[0], 'text = """start \\t');
		expectLossless(lines[1], 'mid \\u2603');
		expectLossless(lines[2], 'end \\n"""');
	});

	it('does NOT sub-tokenize escapes in a multi-line literal string', () => {
		// '''...''' is verbatim across lines; a `\d` must stay plain string.
		const lines = tokLines(toml, ["re = '''\\d+", "\\w*'''"]);
		const escapes = lines.flatMap((l) => l.tokens.filter((t) => t.type === 'string.escape'));
		if (escapes.length > 0) {
			throw new Error('literal multi-line string must not emit escapes');
		}
		expectLossless(lines[0], "re = '''\\d+");
		expectLossless(lines[1], "\\w*'''");
	});

	it('sub-tokenizes escapes inside an inline-table string value', () => {
		const line = tok(toml, 'dep = { v = "x\\ny" }');
		expectToken(line, 'property', 'v');
		expectToken(line, 'string.escape', '\\n');
		expectLossless(line, 'dep = { v = "x\\ny" }');
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
