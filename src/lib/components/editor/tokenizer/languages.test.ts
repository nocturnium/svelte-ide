import { describe, it, expect } from 'vitest';
import { getTokenizer } from './index';
import type { TokenizedLine, Token, TokenType } from './types';

// ============================================================
// Helpers
// ============================================================

/** Extract the token type sequence from a tokenized line */
function tokenTypes(line: TokenizedLine): string[] {
	return line.tokens.map((t) => t.type);
}

/** Tokenize a single line with the given language, returning the TokenizedLine */
function tok(language: string, code: string): TokenizedLine {
	const tokenizer = getTokenizer(language);
	return tokenizer.tokenizeLine(code, 1, tokenizer.getInitialState());
}

/** Tokenize multiple lines, threading state between them */
function tokLines(language: string, lines: string[]): TokenizedLine[] {
	const tokenizer = getTokenizer(language);
	let state = tokenizer.getInitialState();
	const results: TokenizedLine[] = [];
	for (let i = 0; i < lines.length; i++) {
		const result = tokenizer.tokenizeLine(lines[i], i + 1, state);
		results.push(result);
		state = result.state ?? state;
	}
	return results;
}

/** Find the first token of a given type */
function findToken(line: TokenizedLine, type: TokenType): Token | undefined {
	return line.tokens.find((t) => t.type === type);
}

/** Find all tokens of a given type */
function findTokens(line: TokenizedLine, type: TokenType): Token[] {
	return line.tokens.filter((t) => t.type === type);
}

/** Assert that at least one token of the given type exists with the expected text */
function expectToken(line: TokenizedLine, type: TokenType, text: string): void {
	const matching = line.tokens.filter((t) => t.type === type && t.text === text);
	expect(matching.length, `Expected token {type: '${type}', text: '${text}'} but found none in: ${JSON.stringify(line.tokens.map((t) => ({ type: t.type, text: t.text })))}`).toBeGreaterThan(0);
}

/** Assert that at least one token of the given type exists */
function expectTokenType(line: TokenizedLine, type: TokenType): void {
	const matching = line.tokens.filter((t) => t.type === type);
	expect(matching.length, `Expected at least one token of type '${type}' but found none in: ${JSON.stringify(line.tokens.map((t) => ({ type: t.type, text: t.text })))}`).toBeGreaterThan(0);
}

// ============================================================
// JavaScript / TypeScript
// ============================================================

describe('JavaScript tokenizer', () => {
	describe('keywords', () => {
		it('detects control-flow keywords', () => {
			const line = tok('javascript', 'if (true) return;');
			expectToken(line, 'keyword.control', 'if');
			expectToken(line, 'keyword.control', 'return');
		});

		it('detects definition keywords', () => {
			const line = tok('javascript', 'const x = 1; let y = 2; var z = 3;');
			expectToken(line, 'keyword.definition', 'const');
			expectToken(line, 'keyword.definition', 'let');
			expectToken(line, 'keyword.definition', 'var');
		});

		it('detects module keywords', () => {
			const line = tok('javascript', 'import { foo } from "bar"');
			expectToken(line, 'keyword.module', 'import');
			expectToken(line, 'keyword.module', 'from');
		});

		it('detects async/await keywords', () => {
			const line = tok('javascript', 'async function f() { await x(); }');
			expectToken(line, 'keyword', 'async');
			expectToken(line, 'keyword.control', 'await');
		});

		it('detects function keyword', () => {
			const line = tok('javascript', 'function hello() {}');
			expectToken(line, 'keyword.definition', 'function');
		});
	});

	describe('strings', () => {
		it('detects double-quoted strings', () => {
			const line = tok('javascript', 'const s = "hello world";');
			expectToken(line, 'string', '"hello world"');
		});

		it('detects single-quoted strings', () => {
			const line = tok('javascript', "const s = 'hello';");
			expectToken(line, 'string', "'hello'");
		});

		it('detects template literals', () => {
			const line = tok('javascript', 'const s = `template`;');
			expectToken(line, 'string.template', '`template`');
		});

		it('handles strings with escape sequences', () => {
			const line = tok('javascript', 'const s = "hello\\nworld";');
			expectToken(line, 'string', '"hello\\nworld"');
		});
	});

	describe('template literals with expressions', () => {
		it('detects template literal start before ${', () => {
			const line = tok('javascript', 'const s = `hello ${name}`;');
			const templates = findTokens(line, 'string.template');
			expect(templates.length).toBeGreaterThan(0);
		});
	});

	describe('comments', () => {
		it('detects single-line comments', () => {
			const line = tok('javascript', '// this is a comment');
			expectToken(line, 'comment.line', '// this is a comment');
		});

		it('detects inline block comments', () => {
			const line = tok('javascript', 'x = /* comment */ 1;');
			expectToken(line, 'comment.block', '/* comment */');
		});

		it('handles multi-line block comments across lines', () => {
			const lines = tokLines('javascript', ['/* start', 'middle', 'end */']);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
			expectTokenType(lines[2], 'comment.block');
		});
	});

	describe('numbers', () => {
		it('detects integer literals', () => {
			const line = tok('javascript', 'const x = 42;');
			expectToken(line, 'number.integer', '42');
		});

		it('detects float literals', () => {
			const line = tok('javascript', 'const x = 3.14;');
			expectToken(line, 'number.float', '3.14');
		});

		it('detects hex literals', () => {
			const line = tok('javascript', 'const x = 0xFF;');
			expectToken(line, 'number.hex', '0xFF');
		});

		it('detects binary literals', () => {
			const line = tok('javascript', 'const x = 0b1010;');
			expectToken(line, 'number.binary', '0b1010');
		});
	});

	describe('regex literals', () => {
		it('detects regex after assignment', () => {
			const line = tok('javascript', 'const re = /pattern/gi;');
			expectToken(line, 'string.regex', '/pattern/gi');
		});

		it('detects regex after return', () => {
			const line = tok('javascript', 'return /test/;');
			expectToken(line, 'string.regex', '/test/');
		});
	});

	describe('arrow functions', () => {
		it('detects arrow operator', () => {
			const line = tok('javascript', 'const fn = (x) => x + 1;');
			expectToken(line, 'operator', '=>');
		});
	});

	describe('operators and punctuation', () => {
		it('detects operators', () => {
			const line = tok('javascript', 'x === y && z !== w');
			expectToken(line, 'operator', '===');
			expectToken(line, 'operator', '&&');
			expectToken(line, 'operator', '!==');
		});

		it('detects punctuation', () => {
			const line = tok('javascript', '{ a: [1, 2] }');
			expectTokenType(line, 'punctuation.brace');
			expectTokenType(line, 'punctuation.bracket');
			expectTokenType(line, 'punctuation.separator');
		});
	});

	describe('identifiers', () => {
		it('classifies boolean constants', () => {
			const line = tok('javascript', 'const a = true; const b = false;');
			expectToken(line, 'constant.boolean', 'true');
			expectToken(line, 'constant.boolean', 'false');
		});

		it('classifies null/undefined', () => {
			const line = tok('javascript', 'x = null; y = undefined;');
			expectToken(line, 'constant.null', 'null');
			expectToken(line, 'constant.null', 'undefined');
		});

		it('classifies function calls', () => {
			const line = tok('javascript', 'console.log("hi"); fetch(url);');
			expectToken(line, 'function.call', 'log');
			expectToken(line, 'function.call', 'fetch');
		});

		it('classifies PascalCase as type when not followed by parens', () => {
			const line = tok('javascript', 'const x: MyClass = y;');
			expectToken(line, 'type.class', 'MyClass');
		});

		it('classifies PascalCase as function call when followed by parens', () => {
			// The tokenizer prioritizes function.call when followed by (
			const line = tok('javascript', 'new MyClass();');
			expectToken(line, 'function.call', 'MyClass');
		});
	});

	describe('realistic multi-token line', () => {
		it('tokenizes a complete statement correctly', () => {
			const line = tok('javascript', 'export async function fetchData(url) {');
			expectToken(line, 'keyword.module', 'export');
			expectToken(line, 'keyword', 'async');
			expectToken(line, 'keyword.definition', 'function');
			expectToken(line, 'function.call', 'fetchData');
			expectToken(line, 'punctuation.paren', '(');
			expectToken(line, 'variable', 'url');
			expectToken(line, 'punctuation.paren', ')');
			expectToken(line, 'punctuation.brace', '{');
		});
	});
});

describe('TypeScript tokenizer', () => {
	it('detects TypeScript-specific keywords', () => {
		const line = tok('typescript', 'interface Foo { readonly bar: string; }');
		expectToken(line, 'keyword.definition', 'interface');
		expectToken(line, 'keyword.storage', 'readonly');
		expectToken(line, 'type.builtin', 'string');
	});

	it('detects type keyword', () => {
		const line = tok('typescript', 'type ID = number | string;');
		expectToken(line, 'keyword.definition', 'type');
		expectToken(line, 'type.builtin', 'number');
		expectToken(line, 'type.builtin', 'string');
	});

	it('detects access modifiers', () => {
		const line = tok('typescript', 'private x: number;');
		expectToken(line, 'keyword.storage', 'private');
	});
});

// ============================================================
// Python
// ============================================================

describe('Python tokenizer', () => {
	describe('keywords', () => {
		it('detects control-flow keywords', () => {
			const line = tok('python', 'if x: return y');
			expectToken(line, 'keyword.control', 'if');
			expectToken(line, 'keyword.control', 'return');
		});

		it('detects definition keywords', () => {
			const line = tok('python', 'def foo(): pass');
			expectToken(line, 'keyword.definition', 'def');
			expectToken(line, 'keyword', 'pass');
		});

		it('detects class keyword', () => {
			const line = tok('python', 'class MyClass:');
			expectToken(line, 'keyword.definition', 'class');
		});

		it('detects module keywords', () => {
			const line = tok('python', 'from os import path');
			expectToken(line, 'keyword.module', 'from');
			expectToken(line, 'keyword.module', 'import');
		});

		it('detects async/await', () => {
			const line = tok('python', 'async def foo(): await bar()');
			expectToken(line, 'keyword', 'async');
			expectToken(line, 'keyword.control', 'await');
		});
	});

	describe('strings', () => {
		it('detects double-quoted strings', () => {
			const line = tok('python', 'x = "hello"');
			expectToken(line, 'string', '"hello"');
		});

		it('detects single-quoted strings', () => {
			const line = tok('python', "x = 'world'");
			expectToken(line, 'string', "'world'");
		});

		it('detects f-strings', () => {
			const line = tok('python', 'x = f"hello {name}"');
			const stringTokens = findTokens(line, 'string');
			expect(stringTokens.length).toBeGreaterThan(0);
			const fstring = stringTokens.find((t) => t.text.startsWith('f"'));
			expect(fstring).toBeDefined();
		});

		it('detects triple-quoted strings (single line)', () => {
			const line = tok('python', 'x = """hello world"""');
			expectTokenType(line, 'string');
		});

		it('detects triple-quoted strings (multi-line)', () => {
			const lines = tokLines('python', ['x = """hello', 'world', '"""']);
			expectTokenType(lines[0], 'string');
			expectTokenType(lines[1], 'string');
			expectTokenType(lines[2], 'string');
		});

		it('detects raw strings', () => {
			const line = tok('python', 'x = r"raw\\nstring"');
			const stringTokens = findTokens(line, 'string');
			expect(stringTokens.length).toBeGreaterThan(0);
		});
	});

	describe('comments', () => {
		it('detects hash comments', () => {
			const line = tok('python', '# this is a comment');
			expectToken(line, 'comment.line', '# this is a comment');
		});

		it('detects inline comments', () => {
			const line = tok('python', 'x = 1 # inline');
			expectTokenType(line, 'comment.line');
		});
	});

	describe('numbers', () => {
		it('detects integer literals', () => {
			const line = tok('python', 'x = 42');
			expectToken(line, 'number', '42');
		});

		it('detects float literals', () => {
			const line = tok('python', 'x = 3.14');
			expectToken(line, 'number', '3.14');
		});

		it('detects hex literals', () => {
			const line = tok('python', 'x = 0xFF');
			expectToken(line, 'number', '0xFF');
		});
	});

	describe('decorators', () => {
		it('detects simple decorators', () => {
			const line = tok('python', '@staticmethod');
			expectToken(line, 'function', '@staticmethod');
		});

		it('detects dotted decorators', () => {
			const line = tok('python', '@app.route');
			expectToken(line, 'function', '@app.route');
		});
	});

	describe('builtins', () => {
		it('classifies True/False/None', () => {
			const line = tok('python', 'x = True; y = False; z = None');
			expectToken(line, 'constant.boolean', 'True');
			expectToken(line, 'constant.boolean', 'False');
			expectToken(line, 'constant.null', 'None');
		});

		it('classifies self', () => {
			const line = tok('python', 'self.x = 1');
			expectToken(line, 'constant.builtin', 'self');
		});

		it('classifies builtin function calls', () => {
			const line = tok('python', 'print("hello"); len(x)');
			expectToken(line, 'function.call', 'print');
			expectToken(line, 'function.call', 'len');
		});
	});

	describe('realistic multi-token line', () => {
		it('tokenizes a function definition', () => {
			const line = tok('python', 'def calculate(x, y=10):');
			expectToken(line, 'keyword.definition', 'def');
			expectToken(line, 'function.call', 'calculate');
			expectToken(line, 'variable', 'x');
			expectToken(line, 'number', '10');
		});
	});
});

// ============================================================
// Go
// ============================================================

describe('Go tokenizer', () => {
	describe('keywords', () => {
		it('detects control-flow keywords', () => {
			const line = tok('go', 'if err != nil { return err }');
			expectToken(line, 'keyword.control', 'if');
			expectToken(line, 'keyword.control', 'return');
		});

		it('detects definition keywords', () => {
			const line = tok('go', 'func main() {}');
			expectToken(line, 'keyword.definition', 'func');
		});

		it('detects struct/interface keywords', () => {
			const line = tok('go', 'type Foo struct {}');
			expectToken(line, 'keyword.definition', 'type');
			expectToken(line, 'keyword.definition', 'struct');
		});

		it('detects module keywords', () => {
			const line = tok('go', 'package main');
			expectToken(line, 'keyword.module', 'package');
		});

		it('detects import keyword', () => {
			const line = tok('go', 'import "fmt"');
			expectToken(line, 'keyword.module', 'import');
		});

		it('detects defer/go/select', () => {
			const line = tok('go', 'defer close(ch)');
			expectToken(line, 'keyword.control', 'defer');
		});
	});

	describe('strings', () => {
		it('detects interpreted strings', () => {
			const line = tok('go', 'x := "hello"');
			expectToken(line, 'string', '"hello"');
		});

		it('detects raw strings (single line)', () => {
			const line = tok('go', 'x := `raw string`');
			expectToken(line, 'string', '`raw string`');
		});

		it('detects raw strings (multi-line)', () => {
			const lines = tokLines('go', ['x := `line1', 'line2`']);
			expectTokenType(lines[0], 'string');
			expectTokenType(lines[1], 'string');
		});

		it('detects rune literals', () => {
			const line = tok('go', "x := 'a'");
			expectToken(line, 'string', "'a'");
		});
	});

	describe('comments', () => {
		it('detects line comments', () => {
			const line = tok('go', '// this is a comment');
			expectToken(line, 'comment.line', '// this is a comment');
		});

		it('detects block comments', () => {
			const line = tok('go', 'x /* comment */ = 1');
			expectToken(line, 'comment.block', '/* comment */');
		});

		it('handles multi-line block comments', () => {
			const lines = tokLines('go', ['/* start', 'end */']);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
		});
	});

	describe('numbers', () => {
		it('detects integer literals', () => {
			const line = tok('go', 'x := 42');
			expectToken(line, 'number', '42');
		});

		it('detects float literals', () => {
			const line = tok('go', 'x := 3.14');
			expectToken(line, 'number', '3.14');
		});

		it('detects hex literals', () => {
			const line = tok('go', 'x := 0xFF');
			expectToken(line, 'number', '0xFF');
		});
	});

	describe('builtins', () => {
		it('classifies true/false/nil', () => {
			const line = tok('go', 'x := true; y := false; z := nil');
			expectToken(line, 'constant.boolean', 'true');
			expectToken(line, 'constant.boolean', 'false');
		});

		it('classifies nil', () => {
			const line = tok('go', 'if err != nil {');
			expectToken(line, 'constant.null', 'nil');
		});

		it('classifies builtin types', () => {
			const line = tok('go', 'var x int; var y string');
			expectToken(line, 'type.builtin', 'int');
			expectToken(line, 'type.builtin', 'string');
		});

		it('classifies builtin function calls', () => {
			const line = tok('go', 'x := make([]int, 10); y := len(x)');
			expectToken(line, 'function.call', 'make');
			expectToken(line, 'function.call', 'len');
		});
	});

	describe('operators', () => {
		it('detects := operator', () => {
			const line = tok('go', 'x := 1');
			expectToken(line, 'operator', ':=');
		});

		it('detects <- channel operator', () => {
			const line = tok('go', 'ch <- value');
			expectToken(line, 'operator', '<-');
		});
	});

	describe('realistic multi-token line', () => {
		it('tokenizes a function signature', () => {
			const line = tok('go', 'func (s *Server) Handle(w http.ResponseWriter, r *http.Request) error {');
			expectToken(line, 'keyword.definition', 'func');
			expectToken(line, 'function.call', 'Handle');
			expectToken(line, 'type.builtin', 'error');
			expectToken(line, 'punctuation.brace', '{');
		});
	});
});

// ============================================================
// CSS
// ============================================================

describe('CSS tokenizer', () => {
	describe('selectors', () => {
		it('detects class selectors', () => {
			const line = tok('css', '.container {');
			expectToken(line, 'type.class', '.container');
		});

		it('detects id selectors', () => {
			const line = tok('css', '#main {');
			expectToken(line, 'constant', '#main');
		});
	});

	describe('properties and values', () => {
		it('detects property names followed by colon', () => {
			const line = tok('css', '  color: red;');
			expectToken(line, 'property', 'color');
		});

		it('detects number values with units', () => {
			const line = tok('css', '  width: 100px;');
			expectToken(line, 'number', '100px');
		});

		it('detects percentage values', () => {
			const line = tok('css', '  width: 50%;');
			expectToken(line, 'number', '50%');
		});

		it('detects hex color values', () => {
			const line = tok('css', '  color: #ff0000;');
			expectToken(line, 'constant', '#ff0000');
		});
	});

	describe('at-rules', () => {
		it('detects @media', () => {
			const line = tok('css', '@media (max-width: 768px) {');
			expectToken(line, 'keyword', '@media');
		});

		it('detects @import', () => {
			const line = tok('css', '@import url("styles.css");');
			expectToken(line, 'keyword', '@import');
		});

		it('detects @keyframes', () => {
			const line = tok('css', '@keyframes fadeIn {');
			expectToken(line, 'keyword', '@keyframes');
		});
	});

	describe('strings', () => {
		it('detects double-quoted strings', () => {
			const line = tok('css', 'content: "hello";');
			expectToken(line, 'string', '"hello"');
		});

		it('detects single-quoted strings', () => {
			const line = tok('css', "font-family: 'Arial';");
			expectToken(line, 'string', "'Arial'");
		});
	});

	describe('comments', () => {
		it('detects block comments', () => {
			const line = tok('css', '/* comment */');
			expectToken(line, 'comment.block', '/* comment */');
		});

		it('handles multi-line comments', () => {
			const lines = tokLines('css', ['/* start', 'end */']);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
		});
	});

	describe('numbers', () => {
		it('detects plain numbers', () => {
			const line = tok('css', '  z-index: 10;');
			expectToken(line, 'number', '10');
		});

		it('detects decimal numbers', () => {
			const line = tok('css', '  opacity: 0.5;');
			expectToken(line, 'number', '0.5');
		});
	});

	describe('functions', () => {
		it('detects CSS function names', () => {
			const line = tok('css', '  background: linear-gradient(to right, red, blue);');
			expectToken(line, 'function', 'linear-gradient');
		});
	});

	describe('keywords', () => {
		it('detects CSS value keywords', () => {
			const line = tok('css', '  display: none;');
			expectToken(line, 'keyword', 'none');
		});
	});

	describe('realistic multi-token line', () => {
		it('tokenizes a full rule', () => {
			const line = tok('css', '  margin: 10px 20px auto;');
			expectToken(line, 'property', 'margin');
			expectToken(line, 'number', '10px');
			expectToken(line, 'number', '20px');
			expectToken(line, 'keyword', 'auto');
		});
	});
});

// ============================================================
// HTML
// ============================================================

describe('HTML tokenizer', () => {
	describe('tags', () => {
		it('detects opening tags', () => {
			const line = tok('html', '<div>');
			expectTokenType(line, 'tag');
		});

		it('detects closing tags', () => {
			const line = tok('html', '</div>');
			expectTokenType(line, 'tag');
		});

		it('detects self-closing tags', () => {
			const line = tok('html', '<br/>');
			expectTokenType(line, 'tag');
		});

		it('detects tags with attributes', () => {
			const line = tok('html', '<div class="foo" id="bar">');
			expectTokenType(line, 'tag');
			// The whole tag is one token
			const tagToken = findToken(line, 'tag');
			expect(tagToken).toBeDefined();
			expect(tagToken!.text).toContain('class=');
		});
	});

	describe('comments', () => {
		it('detects HTML comments on single line', () => {
			const line = tok('html', '<!-- comment -->');
			expectToken(line, 'comment.block', '<!-- comment -->');
		});

		it('handles multi-line HTML comments', () => {
			const lines = tokLines('html', ['<!-- start', 'end -->']);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
		});
	});

	describe('entities', () => {
		it('detects HTML entities', () => {
			const line = tok('html', '&amp; &lt; &#x2F;');
			expectToken(line, 'constant.builtin', '&amp;');
			expectToken(line, 'constant.builtin', '&lt;');
			expectToken(line, 'constant.builtin', '&#x2F;');
		});
	});

	describe('DOCTYPE', () => {
		it('detects DOCTYPE declaration', () => {
			const line = tok('html', '<!DOCTYPE html>');
			expectTokenType(line, 'keyword');
		});
	});

	describe('realistic multi-token line', () => {
		it('tokenizes a tag with content', () => {
			const line = tok('html', '<h1 class="title">Hello</h1>');
			const types = tokenTypes(line);
			expect(types).toContain('tag');
			// The text "Hello" between tags
			const textTokens = line.tokens.filter((t) => t.type === 'text' && t.text.includes('Hello'));
			expect(textTokens.length).toBeGreaterThan(0);
		});

		it('tokenizes self-closing with attributes', () => {
			const line = tok('html', '<img src="photo.jpg" alt="Photo" />');
			expectTokenType(line, 'tag');
		});
	});
});

// ============================================================
// Markdown
// ============================================================

describe('Markdown tokenizer', () => {
	describe('headings', () => {
		it('detects h1', () => {
			const line = tok('markdown', '# Heading');
			expectToken(line, 'markup.heading', '#');
		});

		it('detects h3', () => {
			const line = tok('markdown', '### Sub-heading');
			expectToken(line, 'markup.heading', '###');
		});
	});

	describe('emphasis', () => {
		it('detects bold text', () => {
			const line = tok('markdown', 'This is **bold** text');
			expectToken(line, 'markup.bold', '**bold**');
		});

		it('detects italic text', () => {
			const line = tok('markdown', 'This is *italic* text');
			expectToken(line, 'markup.italic', '*italic*');
		});
	});

	describe('code', () => {
		it('detects inline code', () => {
			const line = tok('markdown', 'Use `code` here');
			expectToken(line, 'markup.code', '`code`');
		});

		it('detects fenced code block start', () => {
			const line = tok('markdown', '```javascript');
			expectTokenType(line, 'markup.code');
		});

		it('handles multi-line fenced code blocks', () => {
			const lines = tokLines('markdown', ['```js', 'const x = 1;', '```']);
			expectTokenType(lines[0], 'markup.code');
			expectTokenType(lines[1], 'markup.code');
			expectTokenType(lines[2], 'markup.code');
		});

		it('detects indented code blocks', () => {
			const line = tok('markdown', '    const x = 1;');
			expectTokenType(line, 'markup.code');
		});
	});

	describe('links', () => {
		it('detects inline links', () => {
			const line = tok('markdown', 'Click [here](http://example.com) please');
			expectToken(line, 'markup.link', '[here](http://example.com)');
		});

		it('detects images', () => {
			const line = tok('markdown', '![alt text](image.png)');
			expectToken(line, 'markup.link', '![alt text](image.png)');
		});
	});

	describe('lists', () => {
		it('detects unordered list markers', () => {
			const line = tok('markdown', '- item one');
			expectToken(line, 'markup.list', '-');
		});

		it('detects ordered list markers', () => {
			const line = tok('markdown', '1. first item');
			expectToken(line, 'markup.list', '1.');
		});
	});

	describe('block quotes', () => {
		it('detects block quote prefix', () => {
			const line = tok('markdown', '> quoted text');
			expectTokenType(line, 'markup.quote');
		});
	});

	describe('realistic multi-token line', () => {
		it('tokenizes a heading with inline elements', () => {
			const line = tok('markdown', '## A **bold** heading with `code`');
			expectToken(line, 'markup.heading', '##');
			expectToken(line, 'markup.bold', '**bold**');
			expectToken(line, 'markup.code', '`code`');
		});
	});
});

// ============================================================
// JSON
// ============================================================

describe('JSON tokenizer', () => {
	describe('property keys', () => {
		it('detects property keys (strings before colon)', () => {
			const line = tok('json', '  "name": "value"');
			expectToken(line, 'property', '"name"');
		});
	});

	describe('strings', () => {
		it('detects string values', () => {
			const line = tok('json', '  "key": "hello world"');
			expectToken(line, 'string', '"hello world"');
		});

		it('detects strings with escapes', () => {
			const line = tok('json', '  "key": "hello\\nworld"');
			expectToken(line, 'string', '"hello\\nworld"');
		});
	});

	describe('numbers', () => {
		it('detects integers', () => {
			const line = tok('json', '  "count": 42');
			expectToken(line, 'number', '42');
		});

		it('detects negative numbers', () => {
			const line = tok('json', '  "offset": -10');
			expectToken(line, 'number', '-10');
		});

		it('detects floats', () => {
			const line = tok('json', '  "pi": 3.14');
			expectToken(line, 'number', '3.14');
		});

		it('detects scientific notation', () => {
			const line = tok('json', '  "big": 1e10');
			expectToken(line, 'number', '1e10');
		});
	});

	describe('booleans and null', () => {
		it('detects true', () => {
			const line = tok('json', '  "active": true');
			expectToken(line, 'constant.boolean', 'true');
		});

		it('detects false', () => {
			const line = tok('json', '  "active": false');
			expectToken(line, 'constant.boolean', 'false');
		});

		it('detects null', () => {
			const line = tok('json', '  "value": null');
			expectToken(line, 'constant.null', 'null');
		});
	});

	describe('punctuation', () => {
		it('detects braces', () => {
			const line = tok('json', '{ }');
			expectToken(line, 'punctuation.brace', '{');
			expectToken(line, 'punctuation.brace', '}');
		});

		it('detects brackets', () => {
			const line = tok('json', '[ ]');
			expectToken(line, 'punctuation.bracket', '[');
			expectToken(line, 'punctuation.bracket', ']');
		});

		it('detects separators', () => {
			const line = tok('json', '  "a": 1, "b": 2');
			expectToken(line, 'punctuation.separator', ':');
			expectToken(line, 'punctuation.separator', ',');
		});
	});

	describe('realistic multi-token line', () => {
		it('tokenizes a complete JSON object line', () => {
			const line = tok('json', '  { "name": "Alice", "age": 30, "active": true }');
			expectToken(line, 'punctuation.brace', '{');
			expectToken(line, 'property', '"name"');
			expectToken(line, 'string', '"Alice"');
			expectToken(line, 'property', '"age"');
			expectToken(line, 'number', '30');
			expectToken(line, 'property', '"active"');
			expectToken(line, 'constant.boolean', 'true');
			expectToken(line, 'punctuation.brace', '}');
		});
	});
});

// ============================================================
// Svelte
// ============================================================

describe('Svelte tokenizer', () => {
	describe('template directives', () => {
		it('detects {#if} blocks', () => {
			const line = tok('svelte', '{#if condition}');
			const types = tokenTypes(line);
			expect(types).toContain('keyword.control');
			const kwTokens = line.tokens.filter((t) => t.type === 'keyword.control');
			const texts = kwTokens.map((t) => t.text);
			expect(texts).toContain('#');
			expect(texts).toContain('if');
		});

		it('detects {/if} closing blocks', () => {
			const line = tok('svelte', '{/if}');
			const kwTokens = line.tokens.filter((t) => t.type === 'keyword.control');
			const texts = kwTokens.map((t) => t.text);
			expect(texts).toContain('/');
			expect(texts).toContain('if');
		});

		it('detects {:else} blocks', () => {
			const line = tok('svelte', '{:else}');
			const kwTokens = line.tokens.filter((t) => t.type === 'keyword.control');
			const texts = kwTokens.map((t) => t.text);
			expect(texts).toContain(':');
			expect(texts).toContain('else');
		});

		it('detects {#each} blocks', () => {
			const line = tok('svelte', '{#each items as item}');
			const kwTokens = line.tokens.filter((t) => t.type === 'keyword.control');
			const texts = kwTokens.map((t) => t.text);
			expect(texts).toContain('#');
			expect(texts).toContain('each');
		});

		it('detects {@html} tags', () => {
			const line = tok('svelte', '{@html content}');
			const kwTokens = line.tokens.filter((t) => t.type === 'keyword.control');
			const texts = kwTokens.map((t) => t.text);
			expect(texts).toContain('@');
			expect(texts).toContain('html');
		});

		it('detects {@debug} tags', () => {
			const line = tok('svelte', '{@debug variable}');
			const kwTokens = line.tokens.filter((t) => t.type === 'keyword.control');
			const texts = kwTokens.map((t) => t.text);
			expect(texts).toContain('@');
			expect(texts).toContain('debug');
		});
	});

	describe('template expressions', () => {
		it('wraps expressions in brace punctuation', () => {
			const line = tok('svelte', '<p>{message}</p>');
			const braces = findTokens(line, 'punctuation.brace');
			expect(braces.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('script blocks', () => {
		it('transitions to script context on <script>', () => {
			const lines = tokLines('svelte', ['<script>', 'const x = 1;', '</script>']);
			// First line contains the script tag
			const line1Types = tokenTypes(lines[0]);
			expect(line1Types).toContain('tag.name');
			// Second line should be tokenized as JavaScript/TypeScript
			// Look for keyword.definition from TS tokenizer
			expectToken(lines[1], 'keyword.definition', 'const');
			// Third line closes
			const line3Types = tokenTypes(lines[2]);
			expect(line3Types).toContain('tag.name');
		});
	});

	describe('style blocks', () => {
		it('transitions to style context on <style>', () => {
			const lines = tokLines('svelte', ['<style>', '.foo { color: red; }', '</style>']);
			const line1Types = tokenTypes(lines[0]);
			expect(line1Types).toContain('tag.name');
			// Second line should be tokenized as CSS
			// The CSS tokenizer should detect .foo as a class selector
			expectTokenType(lines[1], 'type.class');
			// Third line closes
			const line3Types = tokenTypes(lines[2]);
			expect(line3Types).toContain('tag.name');
		});
	});

	describe('HTML tags in template', () => {
		it('detects tag names', () => {
			const line = tok('svelte', '<div class="wrapper">');
			expectTokenType(line, 'tag.name');
		});

		it('detects closing tags', () => {
			const line = tok('svelte', '</div>');
			expectTokenType(line, 'tag.punctuation');
			expectTokenType(line, 'tag.name');
		});
	});

	describe('Svelte attributes', () => {
		it('detects bind: directive', () => {
			const line = tok('svelte', '<input bind:value={name} />');
			const kwTokens = line.tokens.filter((t) => t.type === 'keyword.control');
			const bindToken = kwTokens.find((t) => t.text === 'bind:');
			expect(bindToken).toBeDefined();
		});

		it('detects on: directive', () => {
			const line = tok('svelte', '<button on:click={handler}>Click</button>');
			const kwTokens = line.tokens.filter((t) => t.type === 'keyword.control');
			const onToken = kwTokens.find((t) => t.text === 'on:');
			expect(onToken).toBeDefined();
		});
	});

	describe('comments', () => {
		it('detects HTML comments in template', () => {
			const line = tok('svelte', '<!-- a comment -->');
			expectTokenType(line, 'comment');
		});
	});

	describe('realistic multi-token line', () => {
		it('tokenizes a Svelte each block', () => {
			const line = tok('svelte', '{#each items as item, index}');
			const kwTokens = line.tokens.filter((t) => t.type === 'keyword.control');
			const texts = kwTokens.map((t) => t.text);
			expect(texts).toContain('#');
			expect(texts).toContain('each');
			expectTokenType(line, 'punctuation.brace');
		});
	});
});
