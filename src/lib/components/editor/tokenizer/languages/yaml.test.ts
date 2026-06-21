import { describe, it } from 'vitest';
import { createYamlTokenizer } from './yaml';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

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

	it('handles escapes inside double quotes', () => {
		const line = tok(yaml, 'path: "a\\tb\\nc"');
		expectToken(line, 'string', '"a\\tb\\nc"');
	});

	it('tokenizes a bare unquoted scalar as a string', () => {
		const line = tok(yaml, 'env: production');
		expectToken(line, 'string', 'production');
	});
});

describe('yaml: numbers and dates', () => {
	it('tokenizes an integer value', () => {
		const line = tok(yaml, 'port: 8080');
		expectToken(line, 'number', '8080');
	});

	it('tokenizes a float value', () => {
		const line = tok(yaml, 'ratio: 3.14');
		expectToken(line, 'number', '3.14');
	});

	it('tokenizes a negative number', () => {
		const line = tok(yaml, 'offset: -5');
		expectToken(line, 'number', '-5');
	});

	it('tokenizes an ISO date best-effort as a number', () => {
		const line = tok(yaml, 'released: 2026-06-21');
		expectToken(line, 'number', '2026-06-21');
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

	it('tokenizes a tag as a type', () => {
		const line = tok(yaml, 'count: !!int 5');
		expectToken(line, 'type', '!!int');
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
		expectToken(line, 'number', '3');
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
