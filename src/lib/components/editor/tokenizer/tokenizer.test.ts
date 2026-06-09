import { describe, it, expect, beforeEach } from 'vitest';
import type { Token, TokenType, TokenizedLine, TokenizerState, LanguageTokenizer } from './types';
import { createToken, PlaintextTokenizer } from './base';
import {
	getTokenizer,
	tokenize,
	getTokenClass,
	tokensToHTML,
	getSupportedLanguages,
	isLanguageSupported,
	resolveLanguage,
	clearTokenizerCache,
	escapeHTML
} from './index';

// ============================================================
// types.ts - Type usability verification
// ============================================================

describe('types.ts - Type usability', () => {
	it('Token interface should be constructable with required fields', () => {
		const token: Token = { type: 'keyword', text: 'const', start: 0, end: 5 };
		expect(token.type).toBe('keyword');
		expect(token.text).toBe('const');
		expect(token.start).toBe(0);
		expect(token.end).toBe(5);
	});

	it('TokenizedLine interface should be constructable with required fields', () => {
		const line: TokenizedLine = {
			lineNumber: 1,
			tokens: [{ type: 'text', text: 'hello', start: 0, end: 5 }],
			text: 'hello'
		};
		expect(line.lineNumber).toBe(1);
		expect(line.tokens).toHaveLength(1);
		expect(line.text).toBe('hello');
	});

	it('TokenizedLine supports optional state field', () => {
		const line: TokenizedLine = {
			lineNumber: 1,
			tokens: [],
			text: '',
			state: { inBlockComment: true }
		};
		expect(line.state?.inBlockComment).toBe(true);
	});

	it('TokenizerState supports all optional fields', () => {
		const state: TokenizerState = {
			inBlockComment: true,
			inTemplateLiteral: false,
			inMultilineString: true,
			stringDelimiter: '"',
			templateDepth: 2,
			custom: { extra: 'data' }
		};
		expect(state.inBlockComment).toBe(true);
		expect(state.templateDepth).toBe(2);
		expect(state.custom?.extra).toBe('data');
	});
});

// ============================================================
// base.ts - createToken helper
// ============================================================

describe('createToken', () => {
	it('should create a token with correct type, text, start, and end', () => {
		const token = createToken('keyword', 'const', 0);
		expect(token.type).toBe('keyword');
		expect(token.text).toBe('const');
		expect(token.start).toBe(0);
		expect(token.end).toBe(5);
	});

	it('should compute end as start + text.length', () => {
		const token = createToken('string', '"hello"', 10);
		expect(token.start).toBe(10);
		expect(token.end).toBe(17);
	});

	it('should handle empty text', () => {
		const token = createToken('text', '', 0);
		expect(token.start).toBe(0);
		expect(token.end).toBe(0);
		expect(token.text).toBe('');
	});

	it('should handle various token types', () => {
		const types: TokenType[] = [
			'comment',
			'string',
			'number',
			'operator',
			'variable',
			'punctuation',
			'text'
		];
		for (const type of types) {
			const token = createToken(type, 'x', 0);
			expect(token.type).toBe(type);
		}
	});
});

// ============================================================
// base.ts - PlaintextTokenizer
// ============================================================

describe('PlaintextTokenizer', () => {
	let tokenizer: PlaintextTokenizer;

	beforeEach(() => {
		tokenizer = new PlaintextTokenizer();
	});

	it('should have language set to "plaintext"', () => {
		expect(tokenizer.language).toBe('plaintext');
	});

	it('should return empty initial state', () => {
		const state = tokenizer.getInitialState();
		expect(state).toEqual({});
	});

	it('should tokenize a line as a single text token', () => {
		const result = tokenizer.tokenizeLine('hello world', 1);
		expect(result.lineNumber).toBe(1);
		expect(result.text).toBe('hello world');
		expect(result.tokens).toHaveLength(1);
		expect(result.tokens[0].type).toBe('text');
		expect(result.tokens[0].text).toBe('hello world');
		expect(result.tokens[0].start).toBe(0);
		expect(result.tokens[0].end).toBe(11);
	});

	it('should handle empty line', () => {
		const result = tokenizer.tokenizeLine('', 1);
		expect(result.tokens).toHaveLength(1);
		expect(result.tokens[0].type).toBe('text');
		expect(result.tokens[0].text).toBe('');
	});

	it('should return empty state object', () => {
		const result = tokenizer.tokenizeLine('anything', 5);
		expect(result.state).toEqual({});
	});

	it('should preserve special characters as-is', () => {
		const result = tokenizer.tokenizeLine('const x = "hello";', 1);
		expect(result.tokens).toHaveLength(1);
		expect(result.tokens[0].text).toBe('const x = "hello";');
		expect(result.tokens[0].type).toBe('text');
	});

	it('should implement LanguageTokenizer interface', () => {
		const t: LanguageTokenizer = tokenizer;
		expect(t.language).toBe('plaintext');
		expect(typeof t.tokenizeLine).toBe('function');
		expect(typeof t.getInitialState).toBe('function');
	});
});

// ============================================================
// index.ts - resolveLanguage
// ============================================================

describe('resolveLanguage', () => {
	it('should resolve known aliases to canonical names', () => {
		expect(resolveLanguage('js')).toBe('javascript');
		expect(resolveLanguage('ts')).toBe('typescript');
		expect(resolveLanguage('py')).toBe('python');
		expect(resolveLanguage('md')).toBe('markdown');
		expect(resolveLanguage('golang')).toBe('go');
	});

	it('should be case-insensitive', () => {
		expect(resolveLanguage('JS')).toBe('javascript');
		expect(resolveLanguage('Ts')).toBe('typescript');
		expect(resolveLanguage('PY')).toBe('python');
	});

	it('should strip leading dot from extensions', () => {
		expect(resolveLanguage('.js')).toBe('javascript');
		expect(resolveLanguage('.ts')).toBe('typescript');
		expect(resolveLanguage('.py')).toBe('python');
	});

	it('should return input as-is when no alias found', () => {
		expect(resolveLanguage('javascript')).toBe('javascript');
		expect(resolveLanguage('unknownlang')).toBe('unknownlang');
	});

	it('should resolve file extension aliases', () => {
		expect(resolveLanguage('htm')).toBe('html');
		expect(resolveLanguage('scss')).toBe('css');
		expect(resolveLanguage('jsonc')).toBe('json');
		expect(resolveLanguage('svg')).toBe('xml');
		expect(resolveLanguage('txt')).toBe('plaintext');
	});
});

// ============================================================
// index.ts - getTokenizer
// ============================================================

describe('getTokenizer', () => {
	beforeEach(() => {
		clearTokenizerCache();
	});

	it('should return a tokenizer for javascript', () => {
		const t = getTokenizer('javascript');
		expect(t).toBeDefined();
		expect(t.language).toBe('javascript');
	});

	it('should return a tokenizer for typescript', () => {
		const t = getTokenizer('typescript');
		expect(t).toBeDefined();
		expect(t.language).toBe('typescript');
	});

	it('should return a tokenizer for python', () => {
		const t = getTokenizer('python');
		expect(t.language).toBe('python');
	});

	it('should resolve aliases before lookup', () => {
		const t = getTokenizer('js');
		expect(t.language).toBe('javascript');
	});

	it('should resolve dotted extensions', () => {
		const t = getTokenizer('.ts');
		expect(t.language).toBe('typescript');
	});

	it('should fall back to plaintext for unknown languages', () => {
		const t = getTokenizer('brainfuck');
		expect(t.language).toBe('plaintext');
	});

	it('should cache tokenizer instances', () => {
		const t1 = getTokenizer('javascript');
		const t2 = getTokenizer('javascript');
		expect(t1).toBe(t2);
	});

	it('should return different tokenizers for different languages', () => {
		const js = getTokenizer('javascript');
		const py = getTokenizer('python');
		expect(js).not.toBe(py);
		expect(js.language).toBe('javascript');
		expect(py.language).toBe('python');
	});
});

// ============================================================
// index.ts - clearTokenizerCache
// ============================================================

describe('clearTokenizerCache', () => {
	it('should cause getTokenizer to create new instances after clearing', () => {
		const t1 = getTokenizer('javascript');
		clearTokenizerCache();
		const t2 = getTokenizer('javascript');
		expect(t1).not.toBe(t2);
		expect(t1.language).toBe(t2.language);
	});
});

// ============================================================
// Shared stateful tokenizer race (regression for BUG 2)
//
// getTokenizer caches ONE instance per language and hands it to every
// EditorState. The JS tokenizer previously kept mutable regex/division
// disambiguation state (lastToken) on the instance, so interleaving two
// documents that share the instance corrupted each other's results.
// All per-document mutable state must now live in the threaded per-line state.
// ============================================================

describe('JavaScript tokenizer — shared instance safety', () => {
	beforeEach(() => {
		clearTokenizerCache();
	});

	/** Does the line contain a regex literal token? */
	function hasRegex(line: TokenizedLine): boolean {
		return line.tokens.some((t) => t.type === 'string.regex');
	}

	it('shares one cached instance across getTokenizer() calls', () => {
		// Documenting the (intentional) sharing the fix must make safe.
		expect(getTokenizer('javascript')).toBe(getTokenizer('javascript'));
	});

	it('keeps no per-document mutable disambiguation state on the instance', () => {
		// Core of the fix: regex/division context (formerly `this.lastToken`)
		// must NOT live on the shared instance. tokenizeLine() must be a pure
		// function of (line, state); the instance carries only immutable config.
		const tok = getTokenizer('javascript');
		expect((tok as unknown as { lastToken?: unknown }).lastToken).toBeUndefined();

		// Tokenizing should not stamp any mutable disambiguation field onto it.
		tok.tokenizeLine('const x = a / b;', 1, tok.getInitialState());
		expect((tok as unknown as { lastToken?: unknown }).lastToken).toBeUndefined();
	});

	it('disambiguates regex vs division per (line, state), independent of call order', () => {
		const tok = getTokenizer('javascript');

		// Division context: `x / b / c` has no regex literal.
		const aLine = tok.tokenizeLine('const x = a / b / c;', 1, tok.getInitialState());
		expect(hasRegex(aLine)).toBe(false);

		// Assignment context: `= /foo/g` is a regex literal — and the shared
		// instance must yield this regardless of the division line tokenized
		// immediately before it on the same instance.
		const bLine = tok.tokenizeLine('const re = /foo/g;', 1, tok.getInitialState());
		expect(hasRegex(bLine)).toBe(true);
		expect(bLine.tokens.find((t) => t.type === 'string.regex')?.text).toBe('/foo/g');
	});

	it('carries lastToken in the threaded line state so it survives a round-trip', () => {
		const tok = getTokenizer('javascript');
		// After tokenizing, the returned state should hold the last significant
		// token (proving it is threaded through state, not stored on the instance).
		const line = tok.tokenizeLine('const x = 5', 1, tok.getInitialState());
		expect((line.state as { lastToken?: string }).lastToken).toBe('5');
	});
});

// ============================================================
// index.ts - isLanguageSupported
// ============================================================

describe('isLanguageSupported', () => {
	it('should return true for supported languages', () => {
		expect(isLanguageSupported('javascript')).toBe(true);
		expect(isLanguageSupported('typescript')).toBe(true);
		expect(isLanguageSupported('python')).toBe(true);
		expect(isLanguageSupported('html')).toBe(true);
		expect(isLanguageSupported('css')).toBe(true);
		expect(isLanguageSupported('json')).toBe(true);
		expect(isLanguageSupported('go')).toBe(true);
		expect(isLanguageSupported('markdown')).toBe(true);
		expect(isLanguageSupported('svelte')).toBe(true);
		expect(isLanguageSupported('plaintext')).toBe(true);
	});

	it('should return true for language aliases', () => {
		expect(isLanguageSupported('js')).toBe(true);
		expect(isLanguageSupported('ts')).toBe(true);
		expect(isLanguageSupported('py')).toBe(true);
		expect(isLanguageSupported('md')).toBe(true);
	});

	it('should return false for unsupported languages', () => {
		expect(isLanguageSupported('brainfuck')).toBe(false);
		expect(isLanguageSupported('cobol')).toBe(false);
		expect(isLanguageSupported('fortran')).toBe(false);
	});
});

// ============================================================
// index.ts - getSupportedLanguages
// ============================================================

describe('getSupportedLanguages', () => {
	it('should return an array of strings', () => {
		const langs = getSupportedLanguages();
		expect(Array.isArray(langs)).toBe(true);
		expect(langs.length).toBeGreaterThan(0);
		for (const lang of langs) {
			expect(typeof lang).toBe('string');
		}
	});

	it('should include core languages', () => {
		const langs = getSupportedLanguages();
		expect(langs).toContain('javascript');
		expect(langs).toContain('typescript');
		expect(langs).toContain('python');
		expect(langs).toContain('html');
		expect(langs).toContain('css');
		expect(langs).toContain('json');
		expect(langs).toContain('go');
		expect(langs).toContain('markdown');
		expect(langs).toContain('svelte');
		expect(langs).toContain('plaintext');
	});

	it('should include jsx and tsx variants', () => {
		const langs = getSupportedLanguages();
		expect(langs).toContain('jsx');
		expect(langs).toContain('tsx');
	});

	it('should include xml', () => {
		const langs = getSupportedLanguages();
		expect(langs).toContain('xml');
	});
});

// ============================================================
// index.ts - tokenize
// ============================================================

describe('tokenize', () => {
	beforeEach(() => {
		clearTokenizerCache();
	});

	it('should return an array of TokenizedLine objects', () => {
		const result = tokenize('hello', 'plaintext');
		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(1);
		expect(result[0].lineNumber).toBe(1);
		expect(result[0].text).toBe('hello');
	});

	it('should split content on newlines', () => {
		const result = tokenize('line1\nline2\nline3', 'plaintext');
		expect(result).toHaveLength(3);
		expect(result[0].text).toBe('line1');
		expect(result[1].text).toBe('line2');
		expect(result[2].text).toBe('line3');
	});

	it('should use 1-based line numbers', () => {
		const result = tokenize('a\nb\nc', 'plaintext');
		expect(result[0].lineNumber).toBe(1);
		expect(result[1].lineNumber).toBe(2);
		expect(result[2].lineNumber).toBe(3);
	});

	it('should handle empty content', () => {
		const result = tokenize('', 'plaintext');
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('');
	});

	it('should produce valid tokens with plaintext tokenizer', () => {
		const result = tokenize('just some text', 'plaintext');
		expect(result[0].tokens).toHaveLength(1);
		expect(result[0].tokens[0].type).toBe('text');
		expect(result[0].tokens[0].text).toBe('just some text');
	});

	it('should tokenize JavaScript code into multiple token types', () => {
		const result = tokenize('const x = "hello";', 'javascript');
		expect(result).toHaveLength(1);

		const tokens = result[0].tokens;
		expect(tokens.length).toBeGreaterThan(1);

		// Find expected token types
		// 'const' should produce a keyword token
		const constToken = tokens.find((t) => t.text === 'const');
		expect(constToken).toBeDefined();
		expect(constToken!.type).toMatch(/^keyword/);

		// 'x' should be a variable or identifier
		const xToken = tokens.find((t) => t.text === 'x');
		expect(xToken).toBeDefined();
		expect(xToken!.type).toBe('variable');

		// '=' should be an operator
		const eqToken = tokens.find((t) => t.text === '=');
		expect(eqToken).toBeDefined();
		expect(eqToken!.type).toBe('operator');

		// '"hello"' should be a string
		const strToken = tokens.find((t) => t.text === '"hello"');
		expect(strToken).toBeDefined();
		expect(strToken!.type).toBe('string');
	});

	it('should tokenize JavaScript line comments', () => {
		const result = tokenize('// this is a comment', 'javascript');
		const tokens = result[0].tokens;
		const commentToken = tokens.find((t) => t.type === 'comment.line');
		expect(commentToken).toBeDefined();
		expect(commentToken!.text).toBe('// this is a comment');
	});

	it('should tokenize JavaScript numbers', () => {
		const result = tokenize('42 3.14 0xFF', 'javascript');
		const tokens = result[0].tokens;
		const intToken = tokens.find((t) => t.text === '42');
		expect(intToken).toBeDefined();
		expect(intToken!.type).toMatch(/^number/);

		const floatToken = tokens.find((t) => t.text === '3.14');
		expect(floatToken).toBeDefined();
		expect(floatToken!.type).toBe('number.float');

		const hexToken = tokens.find((t) => t.text === '0xFF');
		expect(hexToken).toBeDefined();
		expect(hexToken!.type).toBe('number.hex');
	});

	it('should carry state across lines for block comments', () => {
		const result = tokenize('/* start\ncontinue\nend */', 'javascript');
		expect(result).toHaveLength(3);

		// First line opens block comment
		expect(result[0].tokens[0].type).toBe('comment.block');
		// Second line continues block comment
		expect(result[1].tokens[0].type).toBe('comment.block');
		// Third line closes block comment
		expect(result[2].tokens[0].type).toBe('comment.block');
	});

	it('should handle unknown language by falling back to plaintext', () => {
		const result = tokenize('code here', 'nonexistentlang');
		expect(result).toHaveLength(1);
		expect(result[0].tokens[0].type).toBe('text');
	});
});

// ============================================================
// index.ts - getTokenClass
// ============================================================

describe('getTokenClass', () => {
	it('should prefix token type with "token-"', () => {
		expect(getTokenClass('keyword')).toBe('token-keyword');
		expect(getTokenClass('string')).toBe('token-string');
		expect(getTokenClass('number')).toBe('token-number');
		expect(getTokenClass('text')).toBe('token-text');
	});

	it('should convert dots to hyphens', () => {
		expect(getTokenClass('comment.line')).toBe('token-comment-line');
		expect(getTokenClass('comment.block')).toBe('token-comment-block');
		expect(getTokenClass('string.template')).toBe('token-string-template');
		expect(getTokenClass('number.hex')).toBe('token-number-hex');
		expect(getTokenClass('keyword.control')).toBe('token-keyword-control');
	});

	it('should handle deeply nested token types', () => {
		expect(getTokenClass('tag.attribute.value')).toBe('token-tag-attribute-value');
	});

	it('should handle punctuation types', () => {
		expect(getTokenClass('punctuation.bracket')).toBe('token-punctuation-bracket');
		expect(getTokenClass('punctuation.brace')).toBe('token-punctuation-brace');
		expect(getTokenClass('punctuation.separator')).toBe('token-punctuation-separator');
	});
});

// ============================================================
// index.ts - escapeHTML
// ============================================================

describe('escapeHTML', () => {
	it('should escape ampersands', () => {
		expect(escapeHTML('a & b')).toBe('a &amp; b');
	});

	it('should escape angle brackets', () => {
		expect(escapeHTML('<div>')).toBe('&lt;div&gt;');
	});

	it('should escape double quotes', () => {
		expect(escapeHTML('"hello"')).toBe('&quot;hello&quot;');
	});

	it('should escape single quotes', () => {
		expect(escapeHTML("'hello'")).toBe('&#039;hello&#039;');
	});

	it('should escape all special characters together', () => {
		expect(escapeHTML('<a href="x" title=\'y\'>&')).toBe(
			'&lt;a href=&quot;x&quot; title=&#039;y&#039;&gt;&amp;'
		);
	});

	it('should return empty string for empty input', () => {
		expect(escapeHTML('')).toBe('');
	});

	it('should leave normal text unchanged', () => {
		expect(escapeHTML('hello world 123')).toBe('hello world 123');
	});
});

// ============================================================
// index.ts - tokensToHTML
// ============================================================

describe('tokensToHTML', () => {
	it('should render non-text tokens as spans with class', () => {
		const tokens: Token[] = [createToken('keyword', 'const', 0)];
		const html = tokensToHTML(tokens);
		expect(html).toBe('<span class="token-keyword">const</span>');
	});

	it('should render text tokens without a span wrapper', () => {
		const tokens: Token[] = [createToken('text', ' ', 0)];
		const html = tokensToHTML(tokens);
		expect(html).toBe(' ');
	});

	it('should concatenate multiple tokens', () => {
		const tokens: Token[] = [
			createToken('keyword', 'const', 0),
			createToken('text', ' ', 5),
			createToken('variable', 'x', 6)
		];
		const html = tokensToHTML(tokens);
		expect(html).toBe(
			'<span class="token-keyword">const</span> <span class="token-variable">x</span>'
		);
	});

	it('should escape HTML characters in token text', () => {
		const tokens: Token[] = [createToken('string', '"<script>"', 0)];
		const html = tokensToHTML(tokens);
		expect(html).toBe('<span class="token-string">&quot;&lt;script&gt;&quot;</span>');
	});

	it('should handle empty token array', () => {
		const html = tokensToHTML([]);
		expect(html).toBe('');
	});

	it('should use dot-to-hyphen class naming for nested types', () => {
		const tokens: Token[] = [createToken('comment.line', '// hello', 0)];
		const html = tokensToHTML(tokens);
		expect(html).toBe('<span class="token-comment-line">// hello</span>');
	});

	it('should handle tokens with special characters in text', () => {
		const tokens: Token[] = [createToken('operator', '&&', 0)];
		const html = tokensToHTML(tokens);
		expect(html).toBe('<span class="token-operator">&amp;&amp;</span>');
	});
});
