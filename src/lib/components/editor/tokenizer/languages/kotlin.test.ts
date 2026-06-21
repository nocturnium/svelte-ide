import { describe, it } from 'vitest';
import { createKotlinTokenizer } from './kotlin';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const kotlin = createKotlinTokenizer();

describe('Kotlin tokenizer', () => {
	describe('keywords', () => {
		it('classifies definition keywords', () => {
			expectToken(tok(kotlin, 'fun main() {}'), 'keyword.definition', 'fun');
			expectToken(tok(kotlin, 'class User'), 'keyword.definition', 'class');
			expectToken(tok(kotlin, 'data class Point'), 'keyword.definition', 'data');
			expectToken(tok(kotlin, 'sealed interface Shape'), 'keyword.definition', 'interface');
			expectToken(tok(kotlin, 'object Singleton'), 'keyword.definition', 'object');
		});

		it('classifies storage / modifier keywords', () => {
			expectToken(tok(kotlin, 'val x = 1'), 'keyword.storage', 'val');
			expectToken(tok(kotlin, 'var count = 0'), 'keyword.storage', 'var');
			expectToken(tok(kotlin, 'const val PI = 3.14'), 'keyword.storage', 'const');
			expectToken(tok(kotlin, 'private suspend fun load() {}'), 'keyword.storage', 'private');
			expectToken(tok(kotlin, 'override fun toString()'), 'keyword.storage', 'override');
		});

		it('classifies control-flow keywords', () => {
			expectToken(tok(kotlin, 'if (x) return'), 'keyword.control', 'if');
			expectToken(tok(kotlin, 'when (x) {'), 'keyword.control', 'when');
			expectToken(tok(kotlin, 'for (i in 0..9)'), 'keyword.control', 'for');
			expectToken(tok(kotlin, 'return value'), 'keyword.control', 'return');
		});

		it('classifies module keywords', () => {
			expectToken(tok(kotlin, 'import kotlin.collections.List'), 'keyword.module', 'import');
			expectToken(tok(kotlin, 'package com.nocturnium.app'), 'keyword.module', 'package');
		});

		it('classifies remaining plain keywords', () => {
			expectToken(tok(kotlin, 'for (x in list)'), 'keyword', 'in');
			expectToken(tok(kotlin, 'val y = x as Int'), 'keyword', 'as');
			expectToken(tok(kotlin, 'if (x is String)'), 'keyword', 'is');
			expectToken(tok(kotlin, 'this.value'), 'keyword', 'this');
		});
	});

	describe('strings', () => {
		it('tokenizes a basic double-quoted string', () => {
			expectTokenType(tok(kotlin, 'val s = "hello"'), 'string');
		});

		it('breaks out escape sequences', () => {
			const line = tok(kotlin, 'val s = "a\\nb\\t"');
			expectToken(line, 'string.escape', '\\n');
			expectToken(line, 'string.escape', '\\t');
		});

		it('breaks out a simple $name template', () => {
			const line = tok(kotlin, 'val s = "Hi $name!"');
			expectToken(line, 'string.template', '$name');
		});

		it('breaks out a ${expr} template', () => {
			const line = tok(kotlin, 'val s = "sum=${a + b}"');
			expectToken(line, 'string.template', '${a + b}');
		});

		it('handles nested braces inside ${...}', () => {
			const line = tok(kotlin, 'val s = "${m["k"]}"');
			expectToken(line, 'string.template', '${m["k"]}');
		});

		it('tokenizes char literals as string', () => {
			expectToken(tok(kotlin, "val c = 'a'"), 'string', "'a'");
			expectToken(tok(kotlin, "val n = '\\n'"), 'string', "'\\n'");
		});
	});

	describe('comments', () => {
		it('tokenizes line comments', () => {
			expectToken(tok(kotlin, '// a comment'), 'comment.line', '// a comment');
		});

		it('tokenizes single-line block comments', () => {
			expectToken(tok(kotlin, '/* block */'), 'comment.block', '/* block */');
		});

		it('tokenizes single-line KDoc as comment.doc', () => {
			expectToken(tok(kotlin, '/** docs */'), 'comment.doc', '/** docs */');
		});
	});

	describe('numbers', () => {
		it('tokenizes integers and longs', () => {
			expectTokenType(tok(kotlin, 'val a = 42'), 'number.integer');
			expectToken(tok(kotlin, 'val b = 1_000L'), 'number.integer', '1_000L');
		});

		it('tokenizes floats with suffixes', () => {
			expectTokenType(tok(kotlin, 'val a = 3.14'), 'number.float');
			expectToken(tok(kotlin, 'val f = 2.5f'), 'number.float', '2.5f');
		});

		it('tokenizes hex and binary literals', () => {
			expectToken(tok(kotlin, 'val h = 0xFF'), 'number.hex', '0xFF');
			expectToken(tok(kotlin, 'val b = 0b1010'), 'number.binary', '0b1010');
		});

		it('tokenizes underscored and unsigned literals', () => {
			expectToken(tok(kotlin, 'val u = 0xCAFE_BABEu'), 'number.hex', '0xCAFE_BABEu');
		});
	});

	describe('operators', () => {
		it('classifies arithmetic and comparison operators', () => {
			expectToken(tok(kotlin, 'a + b'), 'operator.arithmetic', '+');
			expectToken(tok(kotlin, 'a == b'), 'operator.comparison', '==');
			expectToken(tok(kotlin, 'a != b'), 'operator.comparison', '!=');
		});

		it('classifies logical and assignment operators', () => {
			expectToken(tok(kotlin, 'a && b'), 'operator.logical', '&&');
			expectToken(tok(kotlin, 'x += 1'), 'operator.assignment', '+=');
		});

		it('tokenizes Kotlin-specific operators', () => {
			expectToken(tok(kotlin, 'val y = x ?: 0'), 'operator', '?:');
			expectToken(tok(kotlin, 'val z = x?.length'), 'operator', '?.');
			expectToken(tok(kotlin, 'val r = 0..9'), 'operator', '..');
		});
	});

	describe('identifiers, builtins, and annotations', () => {
		it('classifies built-in types', () => {
			expectToken(tok(kotlin, 'val x: Int = 1'), 'type.builtin', 'Int');
			expectToken(tok(kotlin, 'val s: String = ""'), 'type.builtin', 'String');
			expectToken(tok(kotlin, 'val l: List<Int>'), 'type.builtin', 'List');
		});

		it('classifies booleans and null', () => {
			expectToken(tok(kotlin, 'val ok = true'), 'constant.boolean', 'true');
			expectToken(tok(kotlin, 'val no = false'), 'constant.boolean', 'false');
			expectToken(tok(kotlin, 'val n = null'), 'constant.null', 'null');
		});

		it('classifies function calls', () => {
			expectToken(tok(kotlin, 'println(x)'), 'function.call', 'println');
		});

		it('classifies PascalCase names as types', () => {
			expectToken(tok(kotlin, 'val u = MyType'), 'type.class', 'MyType');
		});

		it('classifies plain identifiers as variables', () => {
			expectToken(tok(kotlin, 'val total = amount'), 'variable', 'amount');
		});

		it('tokenizes annotations', () => {
			expectToken(tok(kotlin, '@Override fun f() {}'), 'type', '@Override');
			expectToken(tok(kotlin, '@JvmStatic'), 'type', '@JvmStatic');
		});
	});

	describe('multi-line constructs', () => {
		it('threads a multi-line block comment via state', () => {
			const lines = tokLines(kotlin, ['/* start', ' middle', ' end */ val x = 1']);
			expectTokenType(lines[0], 'comment.block');
			expectToken(lines[1], 'comment.block', ' middle');
			expectTokenType(lines[2], 'comment.block');
			expectToken(lines[2], 'keyword.storage', 'val');
		});

		it('threads a multi-line KDoc via state', () => {
			const lines = tokLines(kotlin, ['/**', ' * doc', ' */']);
			expectTokenType(lines[0], 'comment.doc');
			expectToken(lines[1], 'comment.doc', ' * doc');
			expectToken(lines[2], 'comment.doc', ' */');
		});

		it('threads a raw triple-quoted string via state', () => {
			const lines = tokLines(kotlin, ['val sql = """', 'SELECT *', '""".trimIndent()']);
			expectTokenType(lines[0], 'string');
			expectToken(lines[1], 'string', 'SELECT *');
			expectTokenType(lines[2], 'string');
		});

		it('breaks out templates inside a raw string', () => {
			const lines = tokLines(kotlin, ['val q = """name=$name', 'done"""']);
			expectToken(lines[0], 'string.template', '$name');
		});
	});

	describe('realistic lines', () => {
		it('tokenizes a function declaration', () => {
			const line = tok(kotlin, 'fun greet(name: String): String = "Hello, $name"');
			expectToken(line, 'keyword.definition', 'fun');
			expectToken(line, 'type.builtin', 'String');
			expectToken(line, 'string.template', '$name');
		});

		it('tokenizes a property with elvis operator', () => {
			const line = tok(kotlin, 'val count: Int = map["k"] ?: 0');
			expectToken(line, 'keyword.storage', 'val');
			expectToken(line, 'type.builtin', 'Int');
			expectToken(line, 'operator', '?:');
		});
	});

	describe('lossless reconstruction', () => {
		it('is lossless for a line with leading indentation', () => {
			const code = '        private val state = mutableMapOf<String, Int>()';
			expectLossless(tok(kotlin, code), code);
		});

		it('is lossless for a string with escapes and templates', () => {
			const code = 'val msg = "Hello\\t$name, you have ${count} items\\n"';
			expectLossless(tok(kotlin, code), code);
		});

		it('is lossless for a comment line', () => {
			const code = '    // TODO: handle the $edge case carefully';
			expectLossless(tok(kotlin, code), code);
		});

		it('is lossless across a multi-line raw string', () => {
			const lines = tokLines(kotlin, ['val q = """SELECT ${cols}', '  FROM t WHERE id = $id"""']);
			expectLossless(lines[0], 'val q = """SELECT ${cols}');
			expectLossless(lines[1], '  FROM t WHERE id = $id"""');
		});
	});
});
