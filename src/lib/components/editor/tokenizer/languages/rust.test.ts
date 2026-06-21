import { describe, it } from 'vitest';
import { createRustTokenizer } from './rust';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const rust = createRustTokenizer();

describe('rust: keywords', () => {
	it('classifies definition keywords', () => {
		const line = tok(rust, 'fn main() {}');
		expectToken(line, 'keyword.definition', 'fn');
	});

	it('classifies struct/enum/trait/impl as definitions', () => {
		expectToken(tok(rust, 'struct Point;'), 'keyword.definition', 'struct');
		expectToken(tok(rust, 'enum Color {}'), 'keyword.definition', 'enum');
		expectToken(tok(rust, 'trait Draw {}'), 'keyword.definition', 'trait');
		expectToken(tok(rust, 'impl Point {}'), 'keyword.definition', 'impl');
	});

	it('classifies storage keywords', () => {
		const line = tok(rust, 'let mut x = 1;');
		expectToken(line, 'keyword.storage', 'let');
		expectToken(line, 'keyword.storage', 'mut');
	});

	it('classifies module keywords', () => {
		const line = tok(rust, 'pub use crate::foo;');
		expectToken(line, 'keyword.module', 'pub');
		expectToken(line, 'keyword.module', 'use');
		expectToken(line, 'keyword.module', 'crate');
	});

	it('classifies control-flow keywords', () => {
		expectToken(tok(rust, 'if x { return; }'), 'keyword.control', 'if');
		expectToken(tok(rust, 'match x {}'), 'keyword.control', 'match');
		expectToken(tok(rust, 'loop {}'), 'keyword.control', 'loop');
		expectToken(tok(rust, 'for x in xs {}'), 'keyword.control', 'for');
	});

	it('classifies other keywords', () => {
		expectToken(tok(rust, 'x as u32'), 'keyword', 'as');
		expectToken(tok(rust, 'async fn run() {}'), 'keyword', 'async');
		expectToken(tok(rust, 'unsafe { ptr }'), 'keyword', 'unsafe');
	});
});

describe('rust: strings', () => {
	it('tokenizes a plain string', () => {
		const line = tok(rust, 'let s = "hello";');
		expectToken(line, 'string', '"hello"');
	});

	it('emits string.escape inside a string', () => {
		const line = tok(rust, 'let s = "a\\nb\\t";');
		expectToken(line, 'string.escape', '\\n');
		expectToken(line, 'string.escape', '\\t');
	});

	it('handles unicode escapes', () => {
		const line = tok(rust, 'let s = "\\u{1F600}";');
		expectToken(line, 'string.escape', '\\u{1F600}');
	});

	it('tokenizes a single-line raw string', () => {
		const line = tok(rust, 'let re = r"\\d+";');
		expectToken(line, 'string', 'r"\\d+"');
	});

	it('tokenizes a hashed raw string', () => {
		const line = tok(rust, 'let s = r#"a "quote" b"#;');
		expectToken(line, 'string', 'r#"a "quote" b"#');
	});

	it('tokenizes a byte string', () => {
		const line = tok(rust, 'let b = b"bytes";');
		expectTokenType(line, 'string');
	});
});

describe('rust: char literals and lifetimes', () => {
	it('tokenizes a char literal', () => {
		expectToken(tok(rust, "let c = 'a';"), 'string', "'a'");
	});

	it('tokenizes an escaped char literal', () => {
		expectToken(tok(rust, "let c = '\\n';"), 'string', "'\\n'");
	});

	it('tokenizes a unicode char literal', () => {
		expectToken(tok(rust, "let c = '\\u{1F}';"), 'string', "'\\u{1F}'");
	});

	it('detects a named lifetime, not an unterminated char', () => {
		expectToken(tok(rust, "fn f<'a>(x: &'a str) {}"), 'keyword.operator', "'a");
	});

	it("detects the 'static lifetime", () => {
		expectToken(tok(rust, "let s: &'static str = x;"), 'keyword.operator', "'static");
	});
});

describe('rust: comments', () => {
	it('tokenizes a line comment', () => {
		expectToken(tok(rust, '// a comment'), 'comment.line', '// a comment');
	});

	it('tokenizes a doc comment', () => {
		expectToken(tok(rust, '/// doc comment'), 'comment.doc', '/// doc comment');
	});

	it('tokenizes an inner doc comment', () => {
		expectToken(tok(rust, '//! module docs'), 'comment.doc', '//! module docs');
	});

	it('tokenizes a single-line block comment', () => {
		expectToken(tok(rust, '/* block */ let x = 1;'), 'comment.block', '/* block */');
	});
});

describe('rust: numbers', () => {
	it('tokenizes decimal, hex, octal, binary', () => {
		expectToken(tok(rust, 'let n = 42;'), 'number', '42');
		expectToken(tok(rust, 'let n = 0xFF;'), 'number', '0xFF');
		expectToken(tok(rust, 'let n = 0o17;'), 'number', '0o17');
		expectToken(tok(rust, 'let n = 0b1010;'), 'number', '0b1010');
	});

	it('tokenizes underscores and type suffixes', () => {
		expectToken(tok(rust, 'let n = 1_000u32;'), 'number', '1_000u32');
		expectToken(tok(rust, 'let n = 2.0f64;'), 'number', '2.0f64');
		expectToken(tok(rust, 'let n = 3i32;'), 'number', '3i32');
	});

	it('tokenizes float exponents', () => {
		expectToken(tok(rust, 'let n = 1.5e10;'), 'number', '1.5e10');
	});
});

describe('rust: operators', () => {
	it('tokenizes path and arrow operators', () => {
		expectToken(tok(rust, 'std::mem::swap'), 'operator', '::');
		expectToken(tok(rust, 'fn f() -> i32 {}'), 'operator', '->');
		expectToken(tok(rust, 'x => y'), 'operator', '=>');
	});

	it('tokenizes range operators', () => {
		expectToken(tok(rust, '0..10'), 'operator', '..');
		expectToken(tok(rust, '0..=10'), 'operator', '..=');
	});

	it('tokenizes logical and question operators', () => {
		expectToken(tok(rust, 'a && b'), 'operator.logical', '&&');
		expectToken(tok(rust, 'a || b'), 'operator.logical', '||');
		expectToken(tok(rust, 'foo()?'), 'operator', '?');
	});

	it('tokenizes comparison and assignment', () => {
		expectToken(tok(rust, 'a == b'), 'operator.comparison', '==');
		expectToken(tok(rust, 'x += 1'), 'operator.assignment', '+=');
	});
});

describe('rust: identifiers, builtins, macros, attributes', () => {
	it('classifies builtin types', () => {
		expectToken(tok(rust, 'let v: Vec<u8> = vec![];'), 'type.builtin', 'Vec');
		expectToken(tok(rust, 'let v: Vec<u8> = vec![];'), 'type.builtin', 'u8');
		expectToken(tok(rust, 'let s: String = x;'), 'type.builtin', 'String');
	});

	it('classifies builtin constants and booleans', () => {
		expectToken(tok(rust, 'let x = None;'), 'constant.builtin', 'None');
		expectToken(tok(rust, 'let x = Some(1);'), 'constant.builtin', 'Some');
		expectToken(tok(rust, 'let b = true;'), 'constant.boolean', 'true');
	});

	it('classifies macros including the bang', () => {
		expectToken(tok(rust, 'println!("hi");'), 'function.call', 'println!');
		expectToken(tok(rust, 'vec![1, 2, 3];'), 'function.call', 'vec!');
	});

	it('classifies function calls', () => {
		expectToken(tok(rust, 'compute(x)'), 'function.call', 'compute');
	});

	it('classifies attributes as a keyword', () => {
		expectToken(tok(rust, '#[derive(Debug)]'), 'keyword', '#[derive(Debug)]');
		expectToken(tok(rust, '#![no_std]'), 'keyword', '#![no_std]');
	});

	it('classifies plain identifiers as variables', () => {
		expectToken(tok(rust, 'let total = sum;'), 'variable', 'total');
	});
});

describe('rust: multi-line constructs', () => {
	it('threads a block comment across lines', () => {
		const lines = tokLines(rust, ['/* start', 'middle', 'end */ let x = 1;']);
		expectTokenType(lines[0], 'comment.block');
		expectTokenType(lines[1], 'comment.block');
		expectToken(lines[2], 'keyword.storage', 'let');
	});

	it('threads a multi-line raw string with hashes', () => {
		const lines = tokLines(rust, ['let s = r#"line one', 'line two"#;']);
		expectTokenType(lines[0], 'string');
		expectTokenType(lines[1], 'string');
		expectToken(lines[1], 'punctuation.separator', ';');
	});
});

describe('rust: realistic lines', () => {
	it('tokenizes a function signature with a lifetime and return type', () => {
		const line = tok(rust, "pub fn first<'a>(items: &'a [String]) -> Option<&'a String> {");
		expectToken(line, 'keyword.module', 'pub');
		expectToken(line, 'keyword.definition', 'fn');
		expectToken(line, 'keyword.operator', "'a");
		expectToken(line, 'type.builtin', 'Option');
		expectToken(line, 'type.builtin', 'String');
		expectToken(line, 'operator', '->');
	});

	it('tokenizes a method-chain call line', () => {
		const line = tok(rust, 'let total: u32 = items.iter().map(double).sum();');
		expectToken(line, 'keyword.storage', 'let');
		expectToken(line, 'type.builtin', 'u32');
		expectToken(line, 'function.call', 'iter');
		expectToken(line, 'function.call', 'map');
		expectToken(line, 'function.call', 'sum');
	});
});

describe('rust: lossless', () => {
	it('is lossless on an indented line', () => {
		const src = '        let mut count: usize = 0;';
		expectLossless(tok(rust, src), src);
	});

	it('is lossless on a string with escapes', () => {
		const src = 'let path = "C:\\\\Users\\\\name\\n";';
		expectLossless(tok(rust, src), src);
	});

	it('is lossless on a comment line', () => {
		const src = '    /// Returns the answer to everything.';
		expectLossless(tok(rust, src), src);
	});

	it('is lossless on a hashed raw string with embedded quotes', () => {
		const src = 'let q = r#"SELECT * FROM "t" WHERE a = 1"#;';
		expectLossless(tok(rust, src), src);
	});

	it('is lossless on an attribute and lifetime line', () => {
		const src = "#[inline] fn id<'a>(x: &'a T) -> &'a T { x }";
		expectLossless(tok(rust, src), src);
	});
});
