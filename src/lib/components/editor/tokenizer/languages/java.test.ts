import { describe, it } from 'vitest';
import { createJavaTokenizer } from './java';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

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

		it('tokenizes a string with escapes', () => {
			const line = tok(java, 'String s = "a\\tb\\"c";');
			expectToken(line, 'string', '"a\\tb\\"c"');
		});

		it('tokenizes a simple char literal', () => {
			expectToken(tok(java, "char c = 'a';"), 'string', "'a'");
		});

		it('tokenizes escaped and unicode char literals', () => {
			expectToken(tok(java, "char nl = '\\n';"), 'string', "'\\n'");
			expectToken(tok(java, "char u = '\\u0041';"), 'string', "'\\u0041'");
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
});
