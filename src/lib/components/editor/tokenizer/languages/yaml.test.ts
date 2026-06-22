import { describe, it } from 'vitest';
import { createYamlTokenizer } from './yaml';
import {
	tok,
	tokLines,
	expectToken,
	expectTokenType,
	expectLossless,
	findTokens
} from '../test-helpers';

const yaml = createYamlTokenizer();

describe('yaml: mapping keys', () => {
	it('treats an unquoted key before ": " as a property', () => {
		const line = tok(yaml, 'name: nocturnium');
		expectToken(line, 'property', 'name');
		expectToken(line, 'punctuation.separator', ':');
	});

	it('treats an indented nested key as a property', () => {
		const line = tok(yaml, '  version: 1.6.0');
		expectToken(line, 'property', 'version');
	});

	it('treats a quoted key as a property', () => {
		const line = tok(yaml, '"my key": value');
		expectToken(line, 'property', '"my key"');
	});

	it('treats a key after a list marker as a property', () => {
		const line = tok(yaml, '  - id: 42');
		expectToken(line, 'property', 'id');
		expectToken(line, 'punctuation', '-');
	});

	it('does not treat a colon inside a value as a key separator', () => {
		const line = tok(yaml, 'url: http://example.com');
		expectToken(line, 'property', 'url');
		expectLossless(line, 'url: http://example.com');
	});
});

describe('yaml: comments', () => {
	it('tokenizes a full-line comment', () => {
		const line = tok(yaml, '# this is a comment');
		expectToken(line, 'comment.line', '# this is a comment');
	});

	it('tokenizes a trailing comment after whitespace', () => {
		const line = tok(yaml, 'key: value # trailing');
		expectToken(line, 'comment.line', '# trailing');
	});

	it('does not treat # inside an unquoted scalar as a comment', () => {
		const line = tok(yaml, 'color: "#ff0000"');
		expectToken(line, 'string', '"#ff0000"');
	});

	it('keeps a mid-word # as part of an unquoted scalar (not a comment, not split)', () => {
		// Regression: "page#section" used to break into per-character text tokens
		// because the scalar matcher excluded '#' entirely. A '#' only starts a
		// comment when preceded by whitespace.
		const line = tok(yaml, 'frag: page#section');
		expectToken(line, 'string', 'page#section');
		expectLossless(line, 'frag: page#section');
	});

	it('keeps a URL fragment in an unquoted scalar but still ends at a space-# comment', () => {
		const line = tok(yaml, 'link: http://x.com/p#frag # see docs');
		expectToken(line, 'string', 'http://x.com/p#frag');
		expectToken(line, 'comment.line', '# see docs');
		expectLossless(line, 'link: http://x.com/p#frag # see docs');
	});
});

describe('yaml: strings', () => {
	it('tokenizes a double-quoted string value', () => {
		const line = tok(yaml, 'greeting: "hello world"');
		expectToken(line, 'string', '"hello world"');
	});

	it('tokenizes a single-quoted string value', () => {
		const line = tok(yaml, "greeting: 'hello world'");
		expectToken(line, 'string', "'hello world'");
	});

	it('handles a doubled-quote escape inside single quotes', () => {
		const line = tok(yaml, "msg: 'it''s fine'");
		expectToken(line, 'string', "'it''s fine'");
	});

	it('handles escapes inside double quotes (split into string.escape segments)', () => {
		// Improvement: escapes are now sub-tokenized so the theme can style them
		// distinctly; the literal runs stay `string` and the line is still lossless.
		const line = tok(yaml, 'path: "a\\tb\\nc"');
		expectToken(line, 'string.escape', '\\t');
		expectToken(line, 'string.escape', '\\n');
		expectLossless(line, 'path: "a\\tb\\nc"');
	});

	it('tokenizes a bare unquoted scalar as a string', () => {
		const line = tok(yaml, 'env: production');
		expectToken(line, 'string', 'production');
	});
});

describe('yaml: numbers and dates', () => {
	it('tokenizes an integer value as number.integer', () => {
		const line = tok(yaml, 'port: 8080');
		expectToken(line, 'number.integer', '8080');
	});

	it('tokenizes a float value as number.float', () => {
		const line = tok(yaml, 'ratio: 3.14');
		expectToken(line, 'number.float', '3.14');
	});

	it('tokenizes a negative number as number.integer', () => {
		const line = tok(yaml, 'offset: -5');
		expectToken(line, 'number.integer', '-5');
	});

	it('tokenizes an ISO date best-effort as a number', () => {
		const line = tok(yaml, 'released: 2026-06-21');
		expectToken(line, 'number', '2026-06-21');
	});

	it('tokenizes a full ISO timestamp as a number', () => {
		const line = tok(yaml, 'at: 2026-06-21T15:30:00Z');
		expectToken(line, 'number', '2026-06-21T15:30:00Z');
		expectLossless(line, 'at: 2026-06-21T15:30:00Z');
	});

	it('tokenizes a hex literal as number.hex', () => {
		// Improvement: hex was previously the bare `number` type.
		expectToken(tok(yaml, 'mask: 0x1A'), 'number.hex', '0x1A');
		expectToken(tok(yaml, 'mask: 0XFF_FF'), 'number.hex', '0XFF_FF');
	});

	it('tokenizes a binary literal as number.binary', () => {
		// Improvement: YAML 1.1 binary was previously the bare `number` type.
		expectToken(tok(yaml, 'bits: 0b1010'), 'number.binary', '0b1010');
	});

	it('tokenizes an octal literal as a number', () => {
		// No dedicated octal subtype in the vocabulary; 0o-form stays base `number`.
		expectToken(tok(yaml, 'mode: 0o17'), 'number', '0o17');
	});

	it('tokenizes an exponent float as number.float', () => {
		expectToken(tok(yaml, 'big: 1.5e10'), 'number.float', '1.5e10');
		expectToken(tok(yaml, 'small: 2E-3'), 'number.float', '2E-3');
		expectToken(tok(yaml, 'lead: .5'), 'number.float', '.5');
	});

	it('tokenizes underscored thousands as number.integer', () => {
		expectToken(tok(yaml, 'n: 1_000_000'), 'number.integer', '1_000_000');
	});

	it('does not classify a dotted version like 3.4.5 as a number', () => {
		// Regression: "3.4.5" must stay a plain scalar (string), not a float.
		const line = tok(yaml, 'ver: 3.4.5');
		expectToken(line, 'string', '3.4.5');
		expectLossless(line, 'ver: 3.4.5');
	});

	it('does not classify a number glued to letters as a number', () => {
		const line = tok(yaml, 'id: 1abc');
		expectToken(line, 'string', '1abc');
		expectLossless(line, 'id: 1abc');
	});

	it('does not split a plain scalar that merely STARTS with a number', () => {
		// Defect: a plain scalar value beginning with a number-shaped run but containing
		// more (space-separated) content was split into a number token plus a trailing
		// string — e.g. "5 apples" became number "5" + string "apples". In YAML the whole
		// value is one plain scalar. A number must be the COMPLETE value, not just its head.
		const a = tok(yaml, 'b: 5 apples');
		expectToken(a, 'string', '5 apples');
		const noNum = a.tokens.filter((t) => t.type.startsWith('number'));
		if (noNum.length > 0) {
			throw new Error(`"5 apples" must not yield a number token: ${JSON.stringify(noNum)}`);
		}
		expectLossless(a, 'b: 5 apples');

		const b = tok(yaml, 'a: 1 2 3');
		expectToken(b, 'string', '1 2 3');
		expectLossless(b, 'a: 1 2 3');

		const c = tok(yaml, 'c: 3.14 is pi');
		expectToken(c, 'string', '3.14 is pi');
		expectLossless(c, 'c: 3.14 is pi');

		// A list-item plain scalar that starts with a number is also one whole scalar.
		const d = tok(yaml, '  - 1 of many');
		expectToken(d, 'string', '1 of many');
		expectLossless(d, '  - 1 of many');
	});

	it('still classifies a standalone number before a trailing comment as a number', () => {
		// Guard the fix above: a number followed by whitespace then a "#" comment is a
		// complete numeric value (the comment is not scalar content), so it must stay a
		// number — this is the case the tightened boundary must NOT break.
		const line = tok(yaml, 'port: 8080 # listen port');
		expectToken(line, 'number.integer', '8080');
		expectToken(line, 'comment.line', '# listen port');
		expectLossless(line, 'port: 8080 # listen port');
	});

	it('classifies number subtypes inside a flow sequence', () => {
		const line = tok(yaml, 'xs: [1, 0x2, 0b11, 3.5]');
		expectToken(line, 'number.integer', '1');
		expectToken(line, 'number.hex', '0x2');
		expectToken(line, 'number.binary', '0b11');
		expectToken(line, 'number.float', '3.5');
		expectLossless(line, 'xs: [1, 0x2, 0b11, 3.5]');
	});
});

describe('yaml: constants', () => {
	it('tokenizes true/false as booleans', () => {
		expectToken(tok(yaml, 'enabled: true'), 'constant.boolean', 'true');
		expectToken(tok(yaml, 'enabled: false'), 'constant.boolean', 'false');
	});

	it('tokenizes yes/no/on/off as booleans', () => {
		expectToken(tok(yaml, 'flag: yes'), 'constant.boolean', 'yes');
		expectToken(tok(yaml, 'flag: off'), 'constant.boolean', 'off');
	});

	it('tokenizes null and ~ as null constants', () => {
		expectToken(tok(yaml, 'value: null'), 'constant.null', 'null');
		expectToken(tok(yaml, 'value: ~'), 'constant.null', '~');
	});
});

describe('yaml: document markers and list items', () => {
	it('tokenizes a document start marker', () => {
		const line = tok(yaml, '---');
		expectToken(line, 'punctuation', '---');
	});

	it('tokenizes a document end marker', () => {
		const line = tok(yaml, '...');
		expectToken(line, 'punctuation', '...');
	});

	it('tokenizes a list item marker', () => {
		const line = tok(yaml, '  - first');
		expectToken(line, 'punctuation', '-');
		expectToken(line, 'string', 'first');
	});
});

describe('yaml: anchors, aliases, tags, merge keys', () => {
	it('tokenizes an anchor as a variable definition', () => {
		const line = tok(yaml, 'base: &defaults');
		expectToken(line, 'variable.definition', '&defaults');
	});

	it('tokenizes an alias as a variable', () => {
		const line = tok(yaml, 'prod: *defaults');
		expectToken(line, 'variable', '*defaults');
	});

	it('tokenizes a secondary tag handle/suffix as type.namespace + type', () => {
		// Improvement: the "!!" handle and the "int" suffix are emitted as distinct
		// tokens (type.namespace + type) so the theme can style the handle apart.
		const line = tok(yaml, 'count: !!int 5');
		expectToken(line, 'type.namespace', '!!');
		expectToken(line, 'type', 'int');
		expectLossless(line, 'count: !!int 5');
	});

	it('tokenizes a named tag handle/suffix as type.namespace + type', () => {
		const line = tok(yaml, 'v: !e!type val');
		expectToken(line, 'type.namespace', '!e!');
		expectToken(line, 'type', 'type');
		expectLossless(line, 'v: !e!type val');
	});

	it('tokenizes a primary "!Custom" tag as a single type', () => {
		const line = tok(yaml, 'v: !Custom value');
		expectToken(line, 'type', '!Custom');
		expectLossless(line, 'v: !Custom value');
	});

	it('tokenizes a verbatim tag containing commas/colons as a single type', () => {
		// Regression: the general "!name" alternative used to match first and
		// truncate "!<tag:yaml.org,2002:str>" at the comma.
		const line = tok(yaml, 'v: !<tag:yaml.org,2002:str> hi');
		expectToken(line, 'type', '!<tag:yaml.org,2002:str>');
		expectToken(line, 'string', 'hi');
		expectLossless(line, 'v: !<tag:yaml.org,2002:str> hi');
	});

	it('tokenizes a merge key', () => {
		const line = tok(yaml, '  <<: *defaults');
		expectToken(line, 'keyword', '<<');
		expectToken(line, 'variable', '*defaults');
	});
});

describe('yaml: flow collections', () => {
	it('tokenizes flow sequence brackets and items', () => {
		const line = tok(yaml, 'tags: [a, b, c]');
		expectToken(line, 'punctuation.bracket', '[');
		expectToken(line, 'punctuation.bracket', ']');
		expectTokenType(line, 'punctuation.separator');
		expectLossless(line, 'tags: [a, b, c]');
	});

	it('tokenizes flow mapping braces and keys', () => {
		const line = tok(yaml, 'point: { x: 1, y: 2 }');
		expectToken(line, 'punctuation.brace', '{');
		expectToken(line, 'property', 'x');
		expectToken(line, 'property', 'y');
	});

	it('does not mis-read a flow-sequence entry inside a mapping as a key', () => {
		// Regression: a "," INSIDE a flow sequence "[...]" is an entry separator, not
		// a key separator. The naive "after a comma ⇒ key" heuristic used to grab
		// "2], map" as a single property, swallowing the closing "]" and the next
		// real key. The innermost open flow delimiter ("[" here) must gate this.
		const line = tok(yaml, 'e: {list: [1, 2], map: {x: 1}}');
		expectToken(line, 'property', 'list');
		expectToken(line, 'number.integer', '2');
		expectToken(line, 'punctuation.bracket', ']');
		expectToken(line, 'property', 'map');
		expectToken(line, 'property', 'x');
		// The bogus merged "2], map" property must NOT appear.
		const merged = line.tokens.filter((t) => t.type === 'property' && /\]/.test(t.text));
		if (merged.length > 0) {
			throw new Error(`flow seq entry mis-read as key: ${JSON.stringify(merged)}`);
		}
		expectLossless(line, 'e: {list: [1, 2], map: {x: 1}}');
	});

	it('keeps a seq value and the following mapping key distinct', () => {
		const line = tok(yaml, 'g: {a: [x, y], b: z}');
		expectToken(line, 'string', 'y');
		expectToken(line, 'punctuation.bracket', ']');
		expectToken(line, 'property', 'b');
		expectLossless(line, 'g: {a: [x, y], b: z}');
	});
});

describe('yaml: special floats (inf / nan)', () => {
	it('tokenizes lowercase .inf / .nan as number.float', () => {
		expectToken(tok(yaml, 'x: .inf'), 'number.float', '.inf');
		expectToken(tok(yaml, 'x: .nan'), 'number.float', '.nan');
		expectToken(tok(yaml, 'x: -.inf'), 'number.float', '-.inf');
	});

	it('tokenizes capitalized .Inf / .NaN / .INF as number.float (YAML 1.1)', () => {
		// Regression: these capitalization variants are valid special floats but were
		// classified as plain strings because the number regex only matched lowercase.
		expectToken(tok(yaml, 'x: .Inf'), 'number.float', '.Inf');
		expectToken(tok(yaml, 'x: .NaN'), 'number.float', '.NaN');
		expectToken(tok(yaml, 'x: .INF'), 'number.float', '.INF');
		expectToken(tok(yaml, 'x: .NAN'), 'number.float', '.NAN');
	});
});

describe('yaml: explicit (complex) keys', () => {
	it('tokenizes the "? " explicit-key indicator as punctuation', () => {
		// Regression: "? explicit key" used to collapse into a single plain-scalar
		// string. The "?" (when followed by whitespace) is a mapping-key indicator.
		const line = tok(yaml, '? explicit key');
		expectToken(line, 'punctuation', '?');
		expectToken(line, 'string', 'explicit key');
		expectLossless(line, '? explicit key');
	});

	it('tokenizes an explicit-key indicator at indentation', () => {
		const line = tok(yaml, '  ? key in block');
		expectToken(line, 'punctuation', '?');
		expectLossless(line, '  ? key in block');
	});

	it('does not treat a "?" inside a key name as an indicator', () => {
		const line = tok(yaml, 'val?: ok');
		expectToken(line, 'property', 'val?');
		expectLossless(line, 'val?: ok');
	});
});

describe('yaml: multi-line block scalars', () => {
	it('keeps indented lines after | as string until indentation drops', () => {
		const lines = tokLines(yaml, ['script: |', '  echo hello', '  echo world', 'next: done']);
		expectToken(lines[0], 'keyword', '|');
		expectToken(lines[1], 'string', '  echo hello');
		expectToken(lines[2], 'string', '  echo world');
		expectToken(lines[3], 'property', 'next');
	});

	it('handles a folded block scalar with a chomp indicator', () => {
		const lines = tokLines(yaml, ['description: >-', '  long folded', '  text here', 'done: true']);
		expectToken(lines[0], 'keyword', '>-');
		expectToken(lines[1], 'string', '  long folded');
		expectToken(lines[3], 'property', 'done');
		expectToken(lines[3], 'constant.boolean', 'true');
	});
});

describe('yaml: realistic lines', () => {
	it('tokenizes a deeply nested multi-token mapping line', () => {
		const line = tok(yaml, '    retries: 3 # max attempts before giving up');
		expectToken(line, 'property', 'retries');
		expectToken(line, 'number.integer', '3');
		expectToken(line, 'comment.line', '# max attempts before giving up');
		expectLossless(line, '    retries: 3 # max attempts before giving up');
	});
});

describe('yaml: lossless reconstruction', () => {
	it('is lossless for a leading-indentation line', () => {
		const src = '      timeout: 30';
		expectLossless(tok(yaml, src), src);
	});

	it('is lossless for a string with escapes', () => {
		const src = 'pattern: "line1\\nline2\\t\\"quoted\\""';
		expectLossless(tok(yaml, src), src);
	});

	it('is lossless for a comment line', () => {
		const src = '   # configure the production environment';
		expectLossless(tok(yaml, src), src);
	});

	it('is lossless across a block scalar (the trickiest construct)', () => {
		const lines = tokLines(yaml, [
			'run: |',
			'    npm ci',
			'    npm run build',
			'',
			'    npm test',
			'status: ok'
		]);
		expectLossless(lines[0], 'run: |');
		expectLossless(lines[1], '    npm ci');
		expectLossless(lines[2], '    npm run build');
		expectLossless(lines[3], '');
		expectLossless(lines[4], '    npm test');
		expectLossless(lines[5], 'status: ok');
	});
});

describe('yaml: double-quoted escape sub-tokenization', () => {
	it('emits a unicode \\uXXXX escape as string.escape', () => {
		const line = tok(yaml, 'u: "\\u00e9 cafe"');
		expectToken(line, 'string.escape', '\\u00e9');
		expectLossless(line, 'u: "\\u00e9 cafe"');
	});

	it('emits a hex \\xHH escape as string.escape', () => {
		const line = tok(yaml, 'x: "\\x41 = A"');
		expectToken(line, 'string.escape', '\\x41');
		expectLossless(line, 'x: "\\x41 = A"');
	});

	it('emits a 32-bit \\UXXXXXXXX escape as string.escape', () => {
		const line = tok(yaml, 'big: "\\U0001F600 grin"');
		expectToken(line, 'string.escape', '\\U0001F600');
		expectLossless(line, 'big: "\\U0001F600 grin"');
	});

	it('emits an escaped quote and an escaped backslash as string.escape', () => {
		const line = tok(yaml, 'q: "she said \\"hi\\" \\\\done"');
		expectToken(line, 'string.escape', '\\"');
		expectToken(line, 'string.escape', '\\\\');
		expectLossless(line, 'q: "she said \\"hi\\" \\\\done"');
	});

	it('leaves an unrecognized escape in the literal run (no false string.escape)', () => {
		// "\q" is not a YAML escape; it must stay inside the surrounding string and
		// the line must remain lossless — we do not invent an escape token for it.
		const line = tok(yaml, 'bad: "no\\qescape"');
		const escapes = findTokens(line, 'string.escape');
		if (escapes.length > 0) {
			throw new Error(`unexpected string.escape for non-escape: ${JSON.stringify(escapes)}`);
		}
		expectLossless(line, 'bad: "no\\qescape"');
	});

	it('does not sub-tokenize escapes inside single-quoted strings', () => {
		// Single quotes have no backslash escapes in YAML; "\n" is two literal chars.
		const line = tok(yaml, "p: 'a\\nb'");
		expectToken(line, 'string', "'a\\nb'");
		const escapes = findTokens(line, 'string.escape');
		if (escapes.length > 0) {
			throw new Error(`single-quoted strings have no escapes: ${JSON.stringify(escapes)}`);
		}
		expectLossless(line, "p: 'a\\nb'");
	});
});

describe('yaml: multi-line quoted scalars (threaded across lines)', () => {
	it('threads an unterminated double-quoted scalar onto the next line', () => {
		const lines = tokLines(yaml, ['msg: "this is a long', '  string that wraps"', 'next: ok']);
		expectToken(lines[0], 'string', '"this is a long');
		// Continuation line is still string content, then the construct ends and the
		// following line tokenizes normally again.
		expectToken(lines[1], 'string', '  string that wraps"');
		expectToken(lines[2], 'property', 'next');
		expectLossless(lines[0], 'msg: "this is a long');
		expectLossless(lines[1], '  string that wraps"');
		expectLossless(lines[2], 'next: ok');
	});

	it('threads an unterminated single-quoted scalar onto the next line', () => {
		const lines = tokLines(yaml, ["msg: 'hello", "  world'", 'next: ok']);
		expectToken(lines[0], 'string', "'hello");
		expectToken(lines[1], 'string', "  world'");
		expectToken(lines[2], 'property', 'next');
		expectLossless(lines[1], "  world'");
	});

	it('treats a trailing backslash as a line-continuation escape inside a double string', () => {
		const lines = tokLines(yaml, ['msg: "line one \\', '  line two"', 'next: ok']);
		expectToken(lines[0], 'string.escape', '\\');
		expectToken(lines[1], 'string', '  line two"');
		expectToken(lines[2], 'property', 'next');
		expectLossless(lines[0], 'msg: "line one \\');
		expectLossless(lines[1], '  line two"');
	});
});

describe('yaml: multi-line flow collections (threaded across lines)', () => {
	it('keeps classifying keys inside a flow mapping that spans lines', () => {
		const lines = tokLines(yaml, ['cfg: {', '  a: 1,', '  b: 2', '}', 'next: ok']);
		// Inside the still-open "{", "a" and "b" are keys even though they start the line.
		expectToken(lines[1], 'property', 'a');
		expectToken(lines[1], 'number.integer', '1');
		expectToken(lines[2], 'property', 'b');
		expectToken(lines[3], 'punctuation.brace', '}');
		expectToken(lines[4], 'property', 'next');
		lines.forEach((l, i) => expectLossless(l, ['cfg: {', '  a: 1,', '  b: 2', '}', 'next: ok'][i]));
	});

	it('keeps key/value classification straight in a nested flow map across lines', () => {
		// Regression: re-deriving the in-line flow nesting must seed from the LINE-START
		// stack, not the already-mutated live stack, or the "}" gets double-counted and
		// the trailing "s" key on "  r }, s: 2 }" is missed. The value "r" must stay a
		// scalar, and the unquoted-key body must not span the "}" / ",".
		const r0 = tok(yaml, 'o: { p: { q:');
		const second = yaml.tokenizeLine('  r }, s: 2 }', 2, r0.state);
		expectToken(second, 'string', 'r');
		expectToken(second, 'property', 's');
		expectToken(second, 'number.integer', '2');
		const spanning = second.tokens.filter((t) => t.type === 'property' && /[},]/.test(t.text));
		if (spanning.length > 0) {
			throw new Error(`key spanned flow punctuation: ${JSON.stringify(spanning)}`);
		}
		expectLossless(second, '  r }, s: 2 }');
	});

	it('does NOT classify entries as keys inside a flow sequence that spans lines', () => {
		// Regression: a line-leading scalar inside an open "[" is an entry, not a key,
		// so it must stay a string and never be mis-read as a property.
		const lines = tokLines(yaml, ['list: [', '  alpha,', '  beta', ']']);
		expectToken(lines[1], 'string', 'alpha');
		expectToken(lines[2], 'string', 'beta');
		const keys = lines[1].tokens.filter((t) => t.type === 'property');
		if (keys.length > 0) {
			throw new Error(`flow-seq entry mis-read as key across lines: ${JSON.stringify(keys)}`);
		}
		expectToken(lines[3], 'punctuation.bracket', ']');
		lines.forEach((l, i) => expectLossless(l, ['list: [', '  alpha,', '  beta', ']'][i]));
	});
});

describe('yaml: directives', () => {
	it('tokenizes a %YAML version directive', () => {
		const line = tok(yaml, '%YAML 1.2');
		expectToken(line, 'keyword.control', '%YAML');
		expectToken(line, 'number.float', '1.2');
		expectLossless(line, '%YAML 1.2');
	});

	it('tokenizes a %TAG directive with a handle and prefix', () => {
		const line = tok(yaml, '%TAG !e! tag:example.com,2000:app/');
		expectToken(line, 'keyword.control', '%TAG');
		expectToken(line, 'type', '!e!');
		expectLossless(line, '%TAG !e! tag:example.com,2000:app/');
	});

	it('keeps a trailing comment on a directive line as a comment', () => {
		const line = tok(yaml, '%FOO bar # note');
		expectToken(line, 'keyword.control', '%FOO');
		expectToken(line, 'comment.line', '# note');
		expectLossless(line, '%FOO bar # note');
	});

	it('does not treat a mid-line % as a directive', () => {
		const line = tok(yaml, 'pct: 50%');
		expectToken(line, 'string', '50%');
		expectLossless(line, 'pct: 50%');
	});
});

describe('yaml: verbatim tag stays intact', () => {
	it('keeps a verbatim "!<...>" tag as a single type token', () => {
		const line = tok(yaml, 'v: !<tag:yaml.org,2002:str> hi');
		expectToken(line, 'type', '!<tag:yaml.org,2002:str>');
		expectLossless(line, 'v: !<tag:yaml.org,2002:str> hi');
	});
});
