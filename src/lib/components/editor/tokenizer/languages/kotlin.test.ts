import { describe, it } from 'vitest';
import { createKotlinTokenizer } from './kotlin';
import {
	tok,
	tokLines,
	expectToken,
	expectTokenType,
	expectLossless,
	findTokens
} from '../test-helpers';

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

		it('sub-tokenizes a simple $name template', () => {
			// The $ delimiter is string.template; the reference is a real variable.
			const line = tok(kotlin, 'val s = "Hi $name!"');
			expectToken(line, 'string.template', '$');
			expectToken(line, 'variable', 'name');
			expectLossless(line, 'val s = "Hi $name!"');
		});

		it('sub-tokenizes a ${expr} template with real inner types', () => {
			// ${ and } are template delimiters; a + b becomes variable/operator/variable.
			const line = tok(kotlin, 'val s = "sum=${a + b}"');
			expectToken(line, 'string.template', '${');
			expectToken(line, 'string.template', '}');
			expectToken(line, 'operator.arithmetic', '+');
			const vars = line.tokens.filter((t) => t.type === 'variable').map((t) => t.text);
			if (!vars.includes('a') || !vars.includes('b')) {
				throw new Error(`Expected a and b as variables, got ${JSON.stringify(vars)}`);
			}
			expectLossless(line, 'val s = "sum=${a + b}"');
		});

		it('handles nested braces and an inner string inside ${...}', () => {
			const line = tok(kotlin, 'val s = "${m["k"]}"');
			expectToken(line, 'string.template', '${');
			expectToken(line, 'string.template', '}');
			expectToken(line, 'punctuation.bracket', '[');
			expectToken(line, 'punctuation.bracket', ']');
			// The inner "k" is a real (nested) string, not literal text.
			expectToken(line, 'string', 'k');
			expectLossless(line, 'val s = "${m["k"]}"');
		});

		it('sub-tokenizes a dotted $a.b.c template chain', () => {
			const line = tok(kotlin, 'val s = "name=$user.name"');
			expectToken(line, 'string.template', '$');
			expectToken(line, 'variable', 'user');
			expectToken(line, 'punctuation.accessor', '.');
			expectToken(line, 'property', 'name');
			expectLossless(line, 'val s = "name=$user.name"');
		});

		it('tokenizes a plain char literal as one string token', () => {
			expectToken(tok(kotlin, "val c = 'a'"), 'string', "'a'");
		});

		it('breaks out an escaped char literal escape body', () => {
			// '\n' -> ' (string) + \n (string.escape) + ' (string), lossless.
			const line = tok(kotlin, "val n = '\\n'");
			expectToken(line, 'string.escape', '\\n');
			expectLossless(line, "val n = '\\n'");
			const u = tok(kotlin, "val u = '\\u0041'");
			expectToken(u, 'string.escape', '\\u0041');
			expectLossless(u, "val u = '\\u0041'");
		});

		it('breaks out a \\uXXXX unicode escape as a single escape token', () => {
			// Regression: the unicode escape must consume all 6 chars (é), not
			// split into `\u` + a plain `00e9` string segment.
			const line = tok(kotlin, 'val s = "caf\\u00e9"');
			expectToken(line, 'string.escape', '\\u00e9');
			expectLossless(line, 'val s = "caf\\u00e9"');
		});
	});

	describe('backtick-escaped identifiers', () => {
		it('does not classify a backticked keyword as a keyword', () => {
			// `class` is an escaped identifier, NOT the `class` keyword.
			const line = tok(kotlin, 'val `class` = 5');
			expectToken(line, 'variable', '`class`');
			const kws = line.tokens.filter((t) => t.type === 'keyword.definition');
			if (kws.length !== 0) {
				throw new Error(
					`Backticked keyword leaked as keyword.definition: ${JSON.stringify(kws.map((t) => t.text))}`
				);
			}
			expectLossless(line, 'val `class` = 5');
		});

		it('keeps a backticked identifier with spaces as one token', () => {
			const line = tok(kotlin, 'fun `test that it works`() {}');
			expectToken(line, 'function.call', '`test that it works`');
			expectLossless(line, 'fun `test that it works`() {}');
		});

		it('does not classify a backticked `is` as the is keyword', () => {
			const line = tok(kotlin, 'obj.`is`()');
			expectToken(line, 'function.call', '`is`');
			const kws = line.tokens.filter((t) => t.type === 'keyword');
			if (kws.length !== 0) {
				throw new Error(`Backticked keyword leaked: ${JSON.stringify(kws.map((t) => t.text))}`);
			}
			expectLossless(line, 'obj.`is`()');
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

		it('tokenizes referential equality operators as a single comparison token', () => {
			// `===` / `!==` must NOT be mis-split into `==`/`!=` plus a stray `=`
			// that would otherwise read as an assignment operator.
			const eq = tok(kotlin, 'val a = x === y');
			expectToken(eq, 'operator.comparison', '===');
			expectLossless(eq, 'val a = x === y');

			const neq = tok(kotlin, 'val b = x !== y');
			expectToken(neq, 'operator.comparison', '!==');
			expectLossless(neq, 'val b = x !== y');

			// The trailing `=` must not leak through as an assignment operator.
			const assigns = eq.tokens.filter((t) => t.type === 'operator.assignment');
			if (assigns.length !== 1 || assigns[0].text !== '=') {
				throw new Error(
					`Expected exactly one '=' assignment, got ${JSON.stringify(assigns.map((t) => t.text))}`
				);
			}
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

		it('sub-tokenizes templates inside a raw string', () => {
			const lines = tokLines(kotlin, ['val q = """name=$name', 'done"""']);
			expectToken(lines[0], 'string.template', '$');
			expectToken(lines[0], 'variable', 'name');
			expectLossless(lines[0], 'val q = """name=$name');
		});
	});

	describe('realistic lines', () => {
		it('tokenizes a function declaration', () => {
			const line = tok(kotlin, 'fun greet(name: String): String = "Hello, $name"');
			expectToken(line, 'keyword.definition', 'fun');
			expectToken(line, 'type.builtin', 'String');
			expectToken(line, 'string.template', '$');
			expectToken(line, 'variable', 'name');
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

	// ---------------------------------------------------------------------------
	// Regression suite for the A+ closures. Each test fails on the pre-closure
	// tokenizer (template blobs, no member/property/generic/escape sub-typing) and
	// passes now. Losslessness is asserted alongside every classification.
	// ---------------------------------------------------------------------------
	describe('interpolation sub-tokenization', () => {
		it('sub-tokenizes ${expr} inner with operator + variables + property + call', () => {
			const code = 'val s = "owe ${count * user.price.value + tax(rate)}"';
			const line = tok(kotlin, code);
			expectToken(line, 'string.template', '${');
			expectToken(line, 'string.template', '}');
			expectToken(line, 'operator.arithmetic', '*');
			expectToken(line, 'operator.arithmetic', '+');
			expectToken(line, 'variable', 'count');
			expectToken(line, 'variable', 'user');
			expectToken(line, 'punctuation.accessor', '.');
			expectToken(line, 'property', 'price');
			expectToken(line, 'property', 'value');
			expectToken(line, 'function.call', 'tax');
			expectLossless(line, code);
		});

		it('sub-tokenizes a number inside ${...}', () => {
			const line = tok(kotlin, 'val s = "n=${x + 0xFF}"');
			expectToken(line, 'number.hex', '0xFF');
			expectLossless(line, 'val s = "n=${x + 0xFF}"');
		});

		it('handles a nested string and call inside ${...}', () => {
			const code = 'val s = "name=${user["${k}"].trim()}"';
			const line = tok(kotlin, code);
			expectToken(line, 'function.call', 'trim');
			// The deeply nested ${k} is itself a template inside the inner string.
			const tmpl = findTokens(line, 'string.template').map((t) => t.text);
			if (!tmpl.includes('${') || !tmpl.includes('}')) {
				throw new Error(`Expected nested template delimiters, got ${JSON.stringify(tmpl)}`);
			}
			expectLossless(line, code);
		});

		it('sub-tokenizes the dotted $a.b.c simple template as variable + properties', () => {
			const line = tok(kotlin, 'val s = "$user.profile.id"');
			expectToken(line, 'string.template', '$');
			expectToken(line, 'variable', 'user');
			expectToken(line, 'property', 'profile');
			expectToken(line, 'property', 'id');
			expectLossless(line, 'val s = "$user.profile.id"');
		});

		it('keeps the surrounding literal and quotes as string', () => {
			const line = tok(kotlin, 'val s = "Hi $name!"');
			expectToken(line, 'string', '"');
			expectToken(line, 'string', 'Hi ');
			expectToken(line, 'string', '!');
		});

		it('sub-tokenizes a template inside a multi-line raw string body', () => {
			const lines = tokLines(kotlin, ['val q = """', 'id=${row.id} name=$row.name', '"""']);
			expectToken(lines[1], 'string.template', '${');
			expectToken(lines[1], 'property', 'id');
			expectToken(lines[1], 'string.template', '$');
			expectToken(lines[1], 'variable', 'row');
			expectLossless(lines[1], 'id=${row.id} name=$row.name');
		});
	});

	describe('string + char escapes', () => {
		it('breaks out an escaped dollar \\$ as a string.escape', () => {
			const line = tok(kotlin, 'val s = "price is \\$5"');
			expectToken(line, 'string.escape', '\\$');
			expectLossless(line, 'val s = "price is \\$5"');
		});

		it('breaks out an escaped quote \\" without ending the string early', () => {
			const code = 'val s = "say \\"hi\\" now"';
			const line = tok(kotlin, code);
			expectToken(line, 'string.escape', '\\"');
			expectLossless(line, code);
		});

		it('breaks out an escaped char-literal escape body', () => {
			const line = tok(kotlin, "val c = '\\t'");
			expectToken(line, 'string.escape', '\\t');
			expectLossless(line, "val c = '\\t'");
		});
	});

	describe('member access classification', () => {
		it('classifies an identifier after . as property', () => {
			const line = tok(kotlin, 'val n = obj.field');
			expectToken(line, 'punctuation.accessor', '.');
			expectToken(line, 'property', 'field');
		});

		it('classifies a call after . as function.call and a non-call member as property', () => {
			const line = tok(kotlin, 'obj.compute().result');
			expectToken(line, 'function.call', 'compute');
			expectToken(line, 'property', 'result');
		});

		it('classifies a member reference after :: as property and a ctor ref as a type', () => {
			const ref = tok(kotlin, 'val r = String::length');
			expectToken(ref, 'operator', '::');
			expectToken(ref, 'property', 'length');
			expectLossless(ref, 'val r = String::length');
			// A PascalCase name after :: is a constructor reference, not a member.
			const ctor = tok(kotlin, 'val c = ::User');
			expectToken(ctor, 'type.class', 'User');
			expectLossless(ctor, 'val c = ::User');
		});

		it('classifies a member after ?. as property', () => {
			const line = tok(kotlin, 'val n = obj?.size');
			expectToken(line, 'operator', '?.');
			expectToken(line, 'property', 'size');
		});

		it('does NOT treat a keyword-named member as a keyword', () => {
			// `x.is` / `x.in` are member accesses, not the is/in keywords.
			const line = tok(kotlin, 'val r = x.`in`.value');
			const kws = findTokens(line, 'keyword');
			if (kws.length !== 0) {
				throw new Error(
					`Keyword leaked through member access: ${JSON.stringify(kws.map((t) => t.text))}`
				);
			}
			expectLossless(line, 'val r = x.`in`.value');
		});

		it('classifies the implicit lambda parameter it as variable.parameter', () => {
			const line = tok(kotlin, 'list.map { it.length }');
			expectToken(line, 'variable.parameter', 'it');
			expectToken(line, 'property', 'length');
		});
	});

	describe('generics as brackets', () => {
		it('emits < > as punctuation.bracket in a type-argument position', () => {
			const line = tok(kotlin, 'val l: List<String> = listOf()');
			expectToken(line, 'punctuation.bracket', '<');
			expectToken(line, 'punctuation.bracket', '>');
		});

		it('splits a >> generic close against angle depth', () => {
			const line = tok(kotlin, 'val m: Map<String, List<Int>> = mapOf()');
			expectToken(line, 'punctuation.bracket', '>>');
			// The two opens and one >> close are all brackets, none comparison ops.
			const cmp = findTokens(line, 'operator.comparison');
			if (cmp.length !== 0) {
				throw new Error(
					`Generic angle brackets leaked as comparison: ${JSON.stringify(cmp.map((t) => t.text))}`
				);
			}
			expectLossless(line, 'val m: Map<String, List<Int>> = mapOf()');
		});

		it('opens generics for a fun type-parameter list', () => {
			const line = tok(kotlin, 'fun <T> id(x: T): T = x');
			expectToken(line, 'punctuation.bracket', '<');
			expectToken(line, 'punctuation.bracket', '>');
		});

		it('still treats a bare a < b as a comparison operator', () => {
			const line = tok(kotlin, 'val ok = a < b');
			expectToken(line, 'operator.comparison', '<');
		});
	});

	describe('contextual keywords, constants, and labels', () => {
		it('classifies SCREAMING_CASE identifiers as constant, not type', () => {
			expectToken(tok(kotlin, 'val MAX_SIZE = 100'), 'constant', 'MAX_SIZE');
			expectToken(tok(kotlin, 'const val PI_VALUE = 3.14'), 'constant', 'PI_VALUE');
		});

		it('classifies a label definition (loop@) as variable.definition', () => {
			const line = tok(kotlin, 'loop@ for (i in xs) {}');
			expectToken(line, 'variable.definition', 'loop@');
			expectLossless(line, 'loop@ for (i in xs) {}');
		});

		it('classifies a @label reference after a jump keyword as a label, not annotation', () => {
			const line = tok(kotlin, 'return@forEach');
			expectToken(line, 'variable', '@forEach');
			const types = findTokens(line, 'type');
			if (types.length !== 0) {
				throw new Error(
					`@label leaked as an annotation type: ${JSON.stringify(types.map((t) => t.text))}`
				);
			}
		});

		it('still classifies a leading @Annotation as a type', () => {
			expectToken(tok(kotlin, '@Inject lateinit var x: Foo'), 'type', '@Inject');
		});

		it('classifies the backing-field reference `field` as a soft keyword', () => {
			const line = tok(kotlin, 'set(value) { field = value }');
			expectToken(line, 'keyword', 'field');
			expectLossless(line, 'set(value) { field = value }');
		});

		it('treats `field` declared after val/var as a variable name, not the soft keyword', () => {
			// Regression: `field` is a soft keyword only inside an accessor body. As the
			// NAME in `val field = 1` / `var field: Int` it is an ordinary identifier and
			// must NOT be colored as the backing-field keyword.
			const v = tok(kotlin, 'val field = 1');
			expectToken(v, 'variable', 'field');
			if (findTokens(v, 'keyword').some((t) => t.text === 'field')) {
				throw new Error('declared `val field` leaked as the soft keyword');
			}
			expectLossless(v, 'val field = 1');

			const m = tok(kotlin, 'var field: Int = 0');
			expectToken(m, 'variable', 'field');
			if (findTokens(m, 'keyword').some((t) => t.text === 'field')) {
				throw new Error('declared `var field` leaked as the soft keyword');
			}
			expectLossless(m, 'var field: Int = 0');
		});

		it('classifies the new unsigned built-in types', () => {
			expectToken(tok(kotlin, 'val u: UInt = 1u'), 'type.builtin', 'UInt');
			expectToken(tok(kotlin, 'val a: IntArray = intArrayOf()'), 'type.builtin', 'IntArray');
		});
	});

	describe('lossless on deeply nested interpolation', () => {
		it('is lossless for a template containing nested strings, braces, and brackets', () => {
			const code = 'val deep = "${a[b["${c}"]]}"';
			expectLossless(tok(kotlin, code), code);
		});

		it('is lossless for an if/else expression inside ${...}', () => {
			const code = 'val s = "${ if (x > 0) "pos" else "neg" }"';
			expectLossless(tok(kotlin, code), code);
		});
	});
});
