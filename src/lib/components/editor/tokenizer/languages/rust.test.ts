import { describe, it, expect } from 'vitest';
import { createRustTokenizer } from './rust';
import {
	tok,
	tokLines,
	findTokens,
	expectToken,
	expectTokenType,
	expectLossless
} from '../test-helpers';

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
	it('tokenizes decimal, hex, octal, binary into precise subtypes', () => {
		expectToken(tok(rust, 'let n = 42;'), 'number.integer', '42');
		expectToken(tok(rust, 'let n = 0xFF;'), 'number.hex', '0xFF');
		// Rust octal has no dedicated token subtype; it maps to number.integer.
		expectToken(tok(rust, 'let n = 0o17;'), 'number.integer', '0o17');
		expectToken(tok(rust, 'let n = 0b1010;'), 'number.binary', '0b1010');
	});

	it('tokenizes underscores and type suffixes', () => {
		expectToken(tok(rust, 'let n = 1_000u32;'), 'number.integer', '1_000u32');
		expectToken(tok(rust, 'let n = 2.0f64;'), 'number.float', '2.0f64');
		expectToken(tok(rust, 'let n = 3i32;'), 'number.integer', '3i32');
	});

	it('tokenizes float exponents', () => {
		expectToken(tok(rust, 'let n = 1.5e10;'), 'number.float', '1.5e10');
	});

	it('classifies an integer with an f suffix as a float, and e-exponent as float', () => {
		expectToken(tok(rust, 'let n = 5f32;'), 'number.float', '5f32');
		expectToken(tok(rust, 'let n = 2e9;'), 'number.float', '2e9');
		expectToken(tok(rust, 'let n = 0xDEAD_BEEFu32;'), 'number.hex', '0xDEAD_BEEFu32');
	});

	// Regression: a tuple-field accessor dot must NOT be swallowed into a
	// leading-dot "float". Rust has no `.5` literals, so `tuple.0` is field
	// access: the `.` is an accessor and `0` is an integer index. Previously the
	// number matcher had a `\.\d` alternation that ate the dot, producing a bogus
	// `.0` number token and dropping the accessor.
	it('keeps the accessor dot in tuple-field access (no leading-dot float)', () => {
		const line = tok(rust, 'self.0 = 1;');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'number.integer', '0');
		// No bogus float token containing the accessor dot.
		expect(findTokens(line, 'number.float').some((t) => t.text.startsWith('.'))).toBe(false);
		expectLossless(line, 'self.0 = 1;');
	});

	it('splits nested tuple-field access into separate index numbers', () => {
		// `a.0.1.2` must read as a . 0 . 1 . 2 — not a . 0.1 . 2 (which would let
		// `0.1` collapse into one float and swallow the second accessor dot).
		const line = tok(rust, 'a.0.1.2');
		const numbers = findTokens(line, 'number.integer').map((t) => t.text);
		expect(numbers).toEqual(['0', '1', '2']);
		expect(findTokens(line, 'punctuation.accessor').length).toBe(3);
		expectLossless(line, 'a.0.1.2');
	});

	it('still parses a genuine float method call (float, then accessor, then call)', () => {
		const line = tok(rust, 'let y = 1.0.max(2.0);');
		expectToken(line, 'number.float', '1.0');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'function.call', 'max');
		expectToken(line, 'number.float', '2.0');
		expectLossless(line, 'let y = 1.0.max(2.0);');
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

describe('rust: raw identifiers, byte chars, shebang, reserved words', () => {
	// Regression: `r#match` is ONE raw identifier that lets a keyword be used as a
	// name. It must not split into `r` + `#` + the keyword `match` (which would
	// paint keyword highlighting into the middle of an identifier).
	it('treats a raw identifier as a single identifier, not a keyword', () => {
		const line = tok(rust, 'let r#match = 5;');
		expectToken(line, 'variable', 'r#match');
		expect(findTokens(line, 'keyword.control').length).toBe(0);
		expectLossless(line, 'let r#match = 5;');
	});

	it('treats a raw-identifier call as a function call (not split keyword)', () => {
		const line = tok(rust, 'fn r#fn() {}');
		expectToken(line, 'function.call', 'r#fn');
		expectLossless(line, 'fn r#fn() {}');
	});

	// Regression: a byte-char literal `b'A'` is one literal; the `b` prefix must
	// not split off as a separate identifier token.
	it('keeps the b prefix on a byte-char literal', () => {
		const line = tok(rust, "let b = b'A';");
		expectToken(line, 'string', "b'A'");
		expectLossless(line, "let b = b'A';");
	});

	it('keeps the b prefix on an escaped byte-char literal', () => {
		const line = tok(rust, "let n = b'\\n';");
		expectToken(line, 'string', "b'\\n'");
	});

	// Regression: a first-line shebang is ignored by Rust; it must render as a
	// single comment, not get shredded into `!`, `/`, and identifier tokens.
	it('renders a first-line shebang as a comment', () => {
		const lines = tokLines(rust, ['#!/usr/bin/env run', 'fn main() {}']);
		expectToken(lines[0], 'comment.line', '#!/usr/bin/env run');
		expectLossless(lines[0], '#!/usr/bin/env run');
		// Inner attributes on the first line must still be attributes, not a shebang.
		expectToken(tok(rust, '#![no_std]'), 'keyword', '#![no_std]');
	});

	// Regression: reserved-for-future-use words must highlight as keywords, not
	// fall through to plain identifiers.
	it('classifies reserved words as keywords', () => {
		expectToken(tok(rust, 'become x;'), 'keyword', 'become');
		expectToken(tok(rust, 'box val;'), 'keyword', 'box');
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

// ---------------------------------------------------------------------------
// A+ closures: format interpolation, number subtypes, context classification,
// nesting block comments, multi-line strings. Each block adds a fail-before /
// pass-after regression for one closed gap.
// ---------------------------------------------------------------------------

describe('rust: number subtypes', () => {
	it('emits number.hex / number.binary / number.integer / number.float', () => {
		expectToken(tok(rust, 'let n = 0xDEAD_BEEF;'), 'number.hex', '0xDEAD_BEEF');
		expectToken(tok(rust, 'let n = 0b1010_1100;'), 'number.binary', '0b1010_1100');
		expectToken(tok(rust, 'let n = 1_000;'), 'number.integer', '1_000');
		expectToken(tok(rust, 'let n = 3.14;'), 'number.float', '3.14');
		expectToken(tok(rust, 'let n = 6.022e23;'), 'number.float', '6.022e23');
		// Octal has no dedicated subtype; integer is the closest member.
		expectToken(tok(rust, 'let n = 0o755;'), 'number.integer', '0o755');
	});

	it('treats an f-suffixed integer and a bare exponent as floats', () => {
		expectToken(tok(rust, 'let a = 5f64;'), 'number.float', '5f64');
		expectToken(tok(rust, 'let b = 2e10;'), 'number.float', '2e10');
	});

	it('keeps a hex literal with a type suffix as hex (not float from the e)', () => {
		// 0xFE has an `e`/`E` digit but is NOT a float; radix wins over shape.
		expectToken(tok(rust, 'let x = 0xFEu8;'), 'number.hex', '0xFEu8');
	});
});

describe('rust: format-macro interpolation', () => {
	it('sub-tokenizes a named argument with template braces', () => {
		const line = tok(rust, 'println!("Hello {name}!");');
		expectToken(line, 'string.template', '{');
		expectToken(line, 'variable', 'name');
		expectToken(line, 'string.template', '}');
		// Surrounding literal stays a plain string.
		expectToken(line, 'string', '"Hello ');
		expectLossless(line, 'println!("Hello {name}!");');
	});

	it('sub-tokenizes a positional index as an integer', () => {
		const line = tok(rust, 'println!("{0} and {1}", a, b);');
		const ints = findTokens(line, 'number.integer').map((t) => t.text);
		expect(ints).toEqual(['0', '1']);
		expectLossless(line, 'println!("{0} and {1}", a, b);');
	});

	it('paints the format spec after the colon as template metadata', () => {
		const line = tok(rust, 'println!("{value:>width$.2}");');
		expectToken(line, 'variable', 'value');
		expectToken(line, 'string.template', ':>width$.2');
		expectLossless(line, 'println!("{value:>width$.2}");');
	});

	it('handles a bare debug placeholder {:?}', () => {
		const line = tok(rust, 'println!("{:?}", x);');
		expectToken(line, 'string.template', '{');
		expectToken(line, 'string.template', ':?');
		expectToken(line, 'string.template', '}');
		expectLossless(line, 'println!("{:?}", x);');
	});

	it('treats {{ and }} as literal-brace escapes, not interpolation', () => {
		const line = tok(rust, 'println!("{{literal}} {x}");');
		expectToken(line, 'string.escape', '{{');
		expectToken(line, 'string.escape', '}}');
		// The real placeholder still interpolates.
		expectToken(line, 'variable', 'x');
		expect(findTokens(line, 'string.template').length).toBeGreaterThan(0);
		expectLossless(line, 'println!("{{literal}} {x}");');
	});

	it('sub-tokenizes a dotted field path inside a placeholder', () => {
		const line = tok(rust, 'format!("{self.count}")');
		expectToken(line, 'variable', 'self');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'count');
		expectLossless(line, 'format!("{self.count}")');
	});

	it('does NOT interpolate inside a byte string', () => {
		const line = tok(rust, 'let b = b"{x}";');
		// No template braces: a byte string is never a format argument.
		expect(findTokens(line, 'string.template').length).toBe(0);
		expectLossless(line, 'let b = b"{x}";');
	});
});

describe('rust: property vs method context', () => {
	it('classifies a field after an accessor as a property', () => {
		const line = tok(rust, 'let z = obj.field.nested;');
		const props = findTokens(line, 'property').map((t) => t.text);
		expect(props).toEqual(['field', 'nested']);
		expectLossless(line, 'let z = obj.field.nested;');
	});

	it('keeps a method call after an accessor as a function call', () => {
		const line = tok(rust, 'obj.compute();');
		expectToken(line, 'function.call', 'compute');
		expect(findTokens(line, 'property').length).toBe(0);
	});

	it('treats postfix .await as a control keyword, not a property', () => {
		const line = tok(rust, 'let r = fetch().await;');
		expectToken(line, 'keyword.control', 'await');
		expectLossless(line, 'let r = fetch().await;');
	});
});

describe('rust: definition-position names', () => {
	it('names the function after fn as a definition', () => {
		const line = tok(rust, 'fn  compute() {}');
		expectToken(line, 'function.definition', 'compute');
		expectLossless(line, 'fn  compute() {}');
	});

	it('names the module after mod as a namespace', () => {
		expectToken(tok(rust, 'mod network {}'), 'type.namespace', 'network');
	});

	it('names a lowercase struct after struct as a type', () => {
		// PascalCase already reads as a type; the def-context catches a non-Pascal
		// name too, which the convention fallback would have missed.
		expectToken(tok(rust, 'struct widget;'), 'type.class', 'widget');
	});
});

describe('rust: generic angle brackets', () => {
	it('lexes a nested generic list as brackets, splitting the >> close', () => {
		const line = tok(rust, 'let v: Vec<HashMap<String, u32>> = x;');
		const brackets = findTokens(line, 'punctuation.bracket').map((t) => t.text);
		expect(brackets).toEqual(['<', '<', '>', '>']);
		// No comparison/shift operators leaked into the type list.
		expect(findTokens(line, 'operator.comparison').length).toBe(0);
		expect(findTokens(line, 'operator').filter((t) => t.text === '>>').length).toBe(0);
		expectLossless(line, 'let v: Vec<HashMap<String, u32>> = x;');
	});

	it('lexes a turbofish ::<T> as brackets', () => {
		const line = tok(rust, 'let n = s.parse::<u32>().unwrap();');
		const brackets = findTokens(line, 'punctuation.bracket').map((t) => t.text);
		expect(brackets).toEqual(['<', '>']);
		expectLossless(line, 'let n = s.parse::<u32>().unwrap();');
	});

	it('keeps a real comparison as a comparison operator, not a bracket', () => {
		const line = tok(rust, 'if a < b && c > d {}');
		expect(findTokens(line, 'punctuation.bracket').length).toBe(0);
		expectToken(line, 'operator.comparison', '<');
		expectToken(line, 'operator.comparison', '>');
		expectLossless(line, 'if a < b && c > d {}');
	});

	it('keeps a shift operator a shift when no generic is open', () => {
		const line = tok(rust, 'let x = a >> 2;');
		expectToken(line, 'operator', '>>');
		expect(findTokens(line, 'punctuation.bracket').length).toBe(0);
	});

	it('does not let a generic poison the rest of the line after the ;', () => {
		const line = tok(rust, 'let v: Vec<u8> = y; let z = a >> 1;');
		expectToken(line, 'operator', '>>');
		expectLossless(line, 'let v: Vec<u8> = y; let z = a >> 1;');
	});
});

describe('rust: nesting block comments', () => {
	it('closes at the OUTER */ for a nested block comment on one line', () => {
		const line = tok(rust, '/* outer /* inner */ still */ let x = 1;');
		expectToken(line, 'comment.block', '/* outer /* inner */ still */');
		expectToken(line, 'keyword.storage', 'let');
		expectLossless(line, '/* outer /* inner */ still */ let x = 1;');
	});

	it('threads a nested block comment across multiple lines', () => {
		const lines = tokLines(rust, ['/* a /* b', 'still nested */ c */ let x = 1;']);
		expectTokenType(lines[0], 'comment.block');
		expectTokenType(lines[1], 'comment.block');
		// The inner+outer both close on line 2, so code resumes after them.
		expectToken(lines[1], 'keyword.storage', 'let');
		expectLossless(lines[1], 'still nested */ c */ let x = 1;');
	});
});

describe('rust: multi-line string threading', () => {
	it('threads a plain string across lines and resumes as a string', () => {
		const lines = tokLines(rust, ['let s = "line one', 'line two";']);
		expectTokenType(lines[0], 'string');
		// The continuation line is still inside the string, not code.
		expectToken(lines[1], 'string', 'line two"');
		expectToken(lines[1], 'punctuation.separator', ';');
		expect(findTokens(lines[1], 'variable').length).toBe(0);
		expectLossless(lines[1], 'line two";');
	});

	it('sub-tokenizes escapes and interpolation on a continued string line', () => {
		const lines = tokLines(rust, ['let s = "head \\n', 'tail {x} end";']);
		expectToken(lines[0], 'string.escape', '\\n');
		expectToken(lines[1], 'variable', 'x');
		expectToken(lines[1], 'string.template', '{');
		expectLossless(lines[1], 'tail {x} end";');
	});
});
