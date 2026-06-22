import { describe, it, expect } from 'vitest';
import { createJavaTokenizer } from './java';
import {
	tok,
	tokLines,
	expectToken,
	expectTokenType,
	expectLossless,
	findTokens
} from '../test-helpers';

describe('JavaTokenizer', () => {
	const java = createJavaTokenizer();

	describe('keywords', () => {
		it('classifies definition keywords', () => {
			const line = tok(java, 'public class Foo {');
			expectToken(line, 'keyword.definition', 'class');
			expectToken(line, 'keyword.storage', 'public');
		});

		it('classifies interface, enum and record as definitions', () => {
			expectToken(tok(java, 'interface Shape {'), 'keyword.definition', 'interface');
			expectToken(tok(java, 'enum Color {'), 'keyword.definition', 'enum');
			expectToken(tok(java, 'record Point(int x) {'), 'keyword.definition', 'record');
		});

		it('classifies storage / modifier keywords', () => {
			const line = tok(java, 'private static final int X = 1;');
			expectToken(line, 'keyword.storage', 'private');
			expectToken(line, 'keyword.storage', 'static');
			expectToken(line, 'keyword.storage', 'final');
		});

		it('classifies control-flow keywords', () => {
			const line = tok(java, 'if (x) return; else break;');
			expectToken(line, 'keyword.control', 'if');
			expectToken(line, 'keyword.control', 'return');
			expectToken(line, 'keyword.control', 'else');
			expectToken(line, 'keyword.control', 'break');
		});

		it('classifies module keywords', () => {
			expectToken(tok(java, 'package com.example.app;'), 'keyword.module', 'package');
			expectToken(tok(java, 'import java.util.List;'), 'keyword.module', 'import');
		});

		it('classifies new, extends, implements, instanceof, var', () => {
			const line = tok(java, 'class A extends B implements C {');
			expectToken(line, 'keyword', 'extends');
			expectToken(line, 'keyword', 'implements');
			expectToken(tok(java, 'new Object()'), 'keyword', 'new');
			expectToken(tok(java, 'x instanceof String'), 'keyword', 'instanceof');
			expectToken(tok(java, 'var list = items;'), 'keyword', 'var');
		});

		it('classifies throws as a control keyword, not a variable', () => {
			const line = tok(java, 'void read() throws IOException {');
			expectToken(line, 'keyword.control', 'throws');
			expectLossless(line, 'void read() throws IOException {');
		});

		it('classifies assert as a control keyword, not a variable', () => {
			const line = tok(java, 'assert count > 0;');
			expectToken(line, 'keyword.control', 'assert');
			expectLossless(line, 'assert count > 0;');
		});

		it('classifies strictfp as a storage keyword', () => {
			const line = tok(java, 'strictfp class Calc {');
			expectToken(line, 'keyword.storage', 'strictfp');
			expectLossless(line, 'strictfp class Calc {');
		});

		it('classifies reserved const and goto as keywords', () => {
			expectToken(tok(java, 'const int X = 1;'), 'keyword', 'const');
			expectToken(tok(java, 'goto label;'), 'keyword', 'goto');
		});

		it('classifies the hyphenated non-sealed modifier as a single keyword', () => {
			const line = tok(java, 'public non-sealed class Circle implements Shape {}');
			expectToken(line, 'keyword.storage', 'non-sealed');
			expectLossless(line, 'public non-sealed class Circle implements Shape {}');
		});

		it('does not mistake a camelCase identifier for the non-sealed keyword', () => {
			const line = tok(java, 'int nonSealed = 1;');
			expectToken(line, 'variable', 'nonSealed');
			expectLossless(line, 'int nonSealed = 1;');
		});
	});

	describe('types and constants', () => {
		it('classifies primitive types as builtin', () => {
			const line = tok(java, 'int a; long b; boolean c; double d;');
			expectToken(line, 'type.builtin', 'int');
			expectToken(line, 'type.builtin', 'long');
			expectToken(line, 'type.builtin', 'boolean');
			expectToken(line, 'type.builtin', 'double');
		});

		it('classifies common library classes', () => {
			const line = tok(java, 'String name; List items; Optional value;');
			expectToken(line, 'type.class', 'String');
			expectToken(line, 'type.class', 'List');
			expectToken(line, 'type.class', 'Optional');
		});

		it('classifies PascalCase identifiers as type.class', () => {
			expectToken(tok(java, 'MyService s;'), 'type.class', 'MyService');
		});

		it('classifies boolean and null literals', () => {
			const line = tok(java, 'boolean ok = true; Object o = null;');
			expectToken(line, 'constant.boolean', 'true');
			expectToken(line, 'constant.null', 'null');
		});
	});

	describe('strings and char literals', () => {
		it('tokenizes a double-quoted string', () => {
			const line = tok(java, 'String s = "hello world";');
			expectToken(line, 'string', '"hello world"');
		});

		it('tokenizes a string with escapes as escape sub-tokens', () => {
			const line = tok(java, 'String s = "a\\tb\\"c";');
			expectToken(line, 'string.escape', '\\t');
			expectToken(line, 'string.escape', '\\"');
			expectLossless(line, 'String s = "a\\tb\\"c";');
		});

		it('tokenizes a simple char literal', () => {
			expectToken(tok(java, "char c = 'a';"), 'string', "'a'");
		});

		it('tokenizes escaped and unicode char literals with escape sub-tokens', () => {
			const nl = tok(java, "char nl = '\\n';");
			expectToken(nl, 'string.escape', '\\n');
			expectLossless(nl, "char nl = '\\n';");
			const u = tok(java, "char u = '\\u0041';");
			expectToken(u, 'string.escape', '\\u0041');
			expectLossless(u, "char u = '\\u0041';");
		});
	});

	describe('comments', () => {
		it('tokenizes a line comment', () => {
			const line = tok(java, 'int x = 1; // assign one');
			expectToken(line, 'comment.line', '// assign one');
		});

		it('tokenizes a single-line Javadoc as comment.doc', () => {
			expectToken(tok(java, '/** quick doc */'), 'comment.doc', '/** quick doc */');
		});
	});

	describe('numbers', () => {
		it('tokenizes integers and longs', () => {
			expectTokenType(tok(java, 'int a = 42;'), 'number.integer');
			expectToken(tok(java, 'long big = 9_000_000L;'), 'number.integer', '9_000_000L');
		});

		it('tokenizes hex and binary literals', () => {
			expectToken(tok(java, 'int h = 0xFF_00;'), 'number.hex', '0xFF_00');
			expectToken(tok(java, 'int b = 0b1010_1010;'), 'number.binary', '0b1010_1010');
		});

		it('tokenizes floats with suffixes and exponents', () => {
			expectToken(tok(java, 'double d = 3.14;'), 'number.float', '3.14');
			expectToken(tok(java, 'float f = 2.0f;'), 'number.float', '2.0f');
			expectToken(tok(java, 'double e = 1.5e10;'), 'number.float', '1.5e10');
		});

		it('tokenizes hex floating-point literals as a single float (not hex + dot + ident)', () => {
			expectToken(tok(java, 'double a = 0x1.8p1;'), 'number.float', '0x1.8p1');
			expectToken(tok(java, 'double b = 0x1p-4;'), 'number.float', '0x1p-4');
			expectToken(tok(java, 'float c = 0xA.Bp2f;'), 'number.float', '0xA.Bp2f');
		});

		it('still classifies plain hex with an L suffix as hex, not float', () => {
			expectToken(tok(java, 'long hl = 0xFFL;'), 'number.hex', '0xFFL');
		});
	});

	describe('operators', () => {
		it('classifies assignment and arithmetic operators', () => {
			const line = tok(java, 'int x = a + b * c;');
			expectToken(line, 'operator.assignment', '=');
			expectToken(line, 'operator.arithmetic', '+');
			expectToken(line, 'operator.arithmetic', '*');
		});

		it('classifies comparison and logical operators', () => {
			const line = tok(java, 'if (a == b && c != d) {');
			expectToken(line, 'operator.comparison', '==');
			expectToken(line, 'operator.comparison', '!=');
			expectToken(line, 'operator.logical', '&&');
		});

		it('tokenizes lambda arrow and method reference', () => {
			expectToken(tok(java, 'x -> x + 1'), 'operator', '->');
			expectToken(tok(java, 'String::valueOf'), 'operator', '::');
		});
	});

	describe('identifiers, calls and annotations', () => {
		it('marks identifier-before-paren as function.call and plain ident as variable', () => {
			const line = tok(java, 'System.out.println(counter);');
			expectToken(line, 'function.call', 'println');
			expectToken(line, 'variable', 'counter');
		});

		it('tokenizes an annotation as a keyword', () => {
			expectToken(tok(java, '@Override'), 'keyword', '@Override');
			expectToken(tok(java, '@SuppressWarnings("unchecked")'), 'keyword', '@SuppressWarnings');
		});
	});

	describe('multi-line constructs', () => {
		it('threads a multi-line block comment across lines', () => {
			const lines = tokLines(java, ['/* start of', ' a comment', ' end */ int x;']);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
			expectToken(lines[2], 'type.builtin', 'int');
		});

		it('threads a multi-line Javadoc as comment.doc', () => {
			const lines = tokLines(java, ['/**', ' * @param x value', ' */']);
			expectTokenType(lines[0], 'comment.doc');
			expectTokenType(lines[1], 'comment.doc');
			expectTokenType(lines[2], 'comment.doc');
		});

		it('threads a multi-line text block', () => {
			const lines = tokLines(java, ['String html = """', '    <p>hi</p>', '    """;']);
			expectTokenType(lines[0], 'string');
			expectTokenType(lines[1], 'string');
			expectToken(lines[0], 'string', '"""');
			// The closing line resumes the string then continues with punctuation.
			expectTokenType(lines[2], 'string');
			expectToken(lines[2], 'punctuation.separator', ';');
		});
	});

	describe('realistic lines', () => {
		it('tokenizes a method declaration with annotation and generics', () => {
			const line = tok(java, 'public static List<String> names(Map<Integer, String> m) {');
			expectToken(line, 'keyword.storage', 'public');
			expectToken(line, 'keyword.storage', 'static');
			expectToken(line, 'type.class', 'List');
			expectToken(line, 'type.class', 'String');
			expectToken(line, 'function.call', 'names');
			expectToken(line, 'punctuation.brace', '{');
		});
	});

	describe('lossless reconstruction', () => {
		it('is lossless on an indented statement', () => {
			const code = '        int total = items.size() + 1;';
			expectLossless(tok(java, code), code);
		});

		it('is lossless on a string with escapes', () => {
			const code = 'String path = "C:\\\\dir\\t\\"quoted\\"";';
			expectLossless(tok(java, code), code);
		});

		it('is lossless on a Javadoc comment line', () => {
			const code = '    /** @return the {@code count} value */';
			expectLossless(tok(java, code), code);
		});

		it('is lossless across a multi-line text block', () => {
			const lines = ['var json = """', '  {"k": "v"}', '  """;'];
			const results = tokLines(java, lines);
			for (let i = 0; i < lines.length; i++) {
				expectLossless(results[i], lines[i]);
			}
		});
	});

	// --- String escape sub-tokenization (string.escape) -------------------------
	describe('string escapes', () => {
		it('emits string.escape for common backslash escapes inside a string', () => {
			const code = 'String s = "a\\tb\\nc\\rd";';
			const line = tok(java, code);
			expectToken(line, 'string.escape', '\\t');
			expectToken(line, 'string.escape', '\\n');
			expectToken(line, 'string.escape', '\\r');
			expectLossless(line, code);
		});

		it('emits string.escape for an escaped quote and backslash', () => {
			const code = 'String s = "say \\"hi\\" \\\\ done";';
			const line = tok(java, code);
			expectToken(line, 'string.escape', '\\"');
			expectToken(line, 'string.escape', '\\\\');
			// the non-escape body remains plain string
			expectToken(line, 'string', '"say ');
			expectLossless(line, code);
		});

		it('emits string.escape for a unicode escape', () => {
			const code = 'String s = "\\u0041\\u00e9";';
			const line = tok(java, code);
			expectToken(line, 'string.escape', '\\u0041');
			expectToken(line, 'string.escape', '\\u00e9');
			expectLossless(line, code);
		});

		it('emits string.escape for octal escapes', () => {
			const code = 'String s = "\\101\\0\\377";';
			const line = tok(java, code);
			const escapes = findTokens(line, 'string.escape').map((t) => t.text);
			expect(escapes).toEqual(['\\101', '\\0', '\\377']);
			expectLossless(line, code);
		});

		it('emits string.escape inside a char literal', () => {
			const tab = tok(java, "char t = '\\t';");
			expectToken(tab, 'string.escape', '\\t');
			expectLossless(tab, "char t = '\\t';");
		});

		it('does not treat a lone backslash-less body as an escape', () => {
			const code = 'String s = "plain text";';
			const line = tok(java, code);
			expect(findTokens(line, 'string.escape')).toHaveLength(0);
			expectToken(line, 'string', '"plain text"');
		});

		it('sub-tokenizes escapes inside a multi-line text block body', () => {
			const lines = tokLines(java, ['String s = """', '  tab\\there \\"q\\"', '  """;']);
			expectToken(lines[1], 'string.escape', '\\t');
			expectToken(lines[1], 'string.escape', '\\"');
			lines.forEach((l, i) =>
				expectLossless(l, ['String s = """', '  tab\\there \\"q\\"', '  """;'][i])
			);
		});
	});

	// --- Number subtypes (float double-suffix, long-hex) ------------------------
	describe('number subtypes', () => {
		it('classifies a double-suffixed literal without a dot as float', () => {
			expectToken(tok(java, 'double d = 3.0d;'), 'number.float', '3.0d');
			expectToken(tok(java, 'float f = 5f;'), 'number.float', '5f');
			expectToken(tok(java, 'double x = 7D;'), 'number.float', '7D');
		});

		it('keeps a long-suffixed hex literal as hex', () => {
			expectToken(tok(java, 'long l = 0xCAFEL;'), 'number.hex', '0xCAFEL');
		});

		it('keeps an underscore-separated plain integer as integer', () => {
			expectToken(tok(java, 'int big = 1_000_000;'), 'number.integer', '1_000_000');
		});
	});

	// --- Generics: angle brackets as punctuation.bracket ------------------------
	describe('generics', () => {
		it('emits the angle brackets of a generic type as punctuation.bracket', () => {
			const line = tok(java, 'List<String> names;');
			expectToken(line, 'punctuation.bracket', '<');
			expectToken(line, 'punctuation.bracket', '>');
			expectLossless(line, 'List<String> names;');
		});

		it('splits a nested generic close >> into two bracket tokens', () => {
			const line = tok(java, 'Map<K, List<V>> m;');
			const closers = findTokens(line, 'punctuation.bracket').filter((t) => t.text === '>');
			expect(closers).toHaveLength(2);
			// none of the closers leaked as a shift operator
			expect(findTokens(line, 'operator').filter((t) => t.text === '>>')).toHaveLength(0);
			expectLossless(line, 'Map<K, List<V>> m;');
		});

		it('splits a triple-nested close >>> into three bracket tokens', () => {
			const line = tok(java, 'Map<K, Map<A, List<V>>> m;');
			const closers = findTokens(line, 'punctuation.bracket').filter((t) => t.text === '>');
			expect(closers).toHaveLength(3);
			expectLossless(line, 'Map<K, Map<A, List<V>>> m;');
		});

		it('brackets the diamond operator', () => {
			const line = tok(java, 'var x = new ArrayList<>();');
			const brackets = findTokens(line, 'punctuation.bracket')
				.map((t) => t.text)
				.filter((t) => t === '<' || t === '>');
			expect(brackets).toEqual(['<', '>']);
			expectLossless(line, 'var x = new ArrayList<>();');
		});

		it('brackets a single-letter generic type parameter declaration', () => {
			const line = tok(java, 'class A<T extends B & C> {}');
			expectToken(line, 'punctuation.bracket', '<');
			expectToken(line, 'punctuation.bracket', '>');
			expectLossless(line, 'class A<T extends B & C> {}');
		});

		it('does NOT treat relational < and shift >> as generic brackets', () => {
			const lt = tok(java, 'if (a < b) {}');
			expectToken(lt, 'operator', '<');
			expect(findTokens(lt, 'punctuation.bracket').filter((t) => t.text === '<')).toHaveLength(0);

			const sh = tok(java, 'int z = a >> 2;');
			expectToken(sh, 'operator', '>>');

			const lsh = tok(java, 'int y = 1 << n;');
			expectToken(lsh, 'operator', '<<');
		});

		it('keeps >>= and >>>= as assignment operators (not generic closes)', () => {
			expectToken(tok(java, 'x >>= 2;'), 'operator.assignment', '>>=');
			expectToken(tok(java, 'x >>>= 1;'), 'operator.assignment', '>>>=');
		});

		it('threads generic angle-depth across lines', () => {
			const lines = tokLines(java, ['Map<String,', '    List<Integer>> m;']);
			// the close on line 2 is bracketed even though it opened on line 1
			const closers = findTokens(lines[1], 'punctuation.bracket').filter((t) => t.text === '>');
			expect(closers).toHaveLength(2);
			expectLossless(lines[0], 'Map<String,');
			expectLossless(lines[1], '    List<Integer>> m;');
		});

		it('resets a misfired generic depth at a statement boundary', () => {
			// `Foo < bar;` is not real generics; the `;` must reset depth so a later
			// `>` on the next line stays a relational operator, uncorrupted.
			const lines = tokLines(java, ['boolean ok = Foo < bar;', 'boolean b = a > c;']);
			expectToken(lines[1], 'operator', '>');
			expect(findTokens(lines[1], 'punctuation.bracket')).toHaveLength(0);
			expectLossless(lines[0], 'boolean ok = Foo < bar;');
			expectLossless(lines[1], 'boolean b = a > c;');
		});

		it('handles generic arrays and casts losslessly', () => {
			expectLossless(tok(java, 'Map<String, int[]> m;'), 'Map<String, int[]> m;');
			expectLossless(tok(java, '(List<String>) obj;'), '(List<String>) obj;');
		});

		it('resets a misfired generic depth at a close paren so it cannot leak to the next line', () => {
			// `check(Foo < bar)` looks like `Foo<...` opening a generic (Foo is a type),
			// but the type-arg list is never closed and there is no ;{}= on the line.
			// A close paren can never appear inside a type-arg list, so it must reset
			// the misfired depth. Otherwise the leaked depth threads to the next line
			// and corrupts an ordinary relational `>` (e.g. `while (i > 0)`), turning it
			// into a punctuation.bracket. Regression: fails before the `)` reset fix.
			const lines = tokLines(java, ['call(Pair < x)', 'while (i > 0) i--;']);
			expectToken(lines[1], 'operator', '>');
			expect(
				findTokens(lines[1], 'punctuation.bracket').filter((t) => t.text === '>')
			).toHaveLength(0);
			expectLossless(lines[0], 'call(Pair < x)');
			expectLossless(lines[1], 'while (i > 0) i--;');
		});

		it('resets a misfired generic depth on the same line after a close paren', () => {
			// `if (Foo < bar) ... a > b` — the `>` after the `)` stays relational.
			const line = tok(java, 'if (Foo < bar) return a > b;');
			expectToken(line, 'operator', '>');
			expect(findTokens(line, 'punctuation.bracket').filter((t) => t.text === '>')).toHaveLength(0);
			expectLossless(line, 'if (Foo < bar) return a > b;');
		});
	});

	// --- Context classification: properties & constants after accessor ----------
	describe('member access classification', () => {
		it('classifies an identifier after . as a property', () => {
			const line = tok(java, 'System.out.println(x);');
			expectToken(line, 'type.class', 'System');
			expectToken(line, 'property', 'out');
			expectToken(line, 'function.call', 'println');
			expectLossless(line, 'System.out.println(x);');
		});

		it('classifies an ALL_CAPS member after . as a constant', () => {
			const line = tok(java, 'int n = Integer.MAX_VALUE;');
			expectToken(line, 'constant', 'MAX_VALUE');
			expectLossless(line, 'int n = Integer.MAX_VALUE;');
		});

		it('classifies an enum constant access as a constant', () => {
			const line = tok(java, 'Color c = Color.RED;');
			expectToken(line, 'constant', 'RED');
			expectLossless(line, 'Color c = Color.RED;');
		});

		it('classifies a keyword-named member after . as a property, not a keyword', () => {
			// `Foo.class` / `obj.new` — `class`/`new` are member names here.
			const c = tok(java, 'Class<?> k = Foo.class;');
			expectToken(c, 'property', 'class');
			expectLossless(c, 'Class<?> k = Foo.class;');
		});

		it('classifies a standalone ALL_CAPS identifier as a constant', () => {
			const line = tok(java, 'static final int MAX_SIZE = 10;');
			expectToken(line, 'constant', 'MAX_SIZE');
			expectLossless(line, 'static final int MAX_SIZE = 10;');
		});

		it('does not classify a single-letter or short cap word as a constant', () => {
			// `T` (type param) and `OK`? OK is two letters -> constant; T alone -> not.
			expectToken(tok(java, 'T value;'), 'variable', 'T');
		});
	});
});
