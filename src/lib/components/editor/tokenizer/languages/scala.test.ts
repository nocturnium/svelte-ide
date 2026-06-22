import { describe, it, expect } from 'vitest';
import { createScalaTokenizer } from './scala';
import {
	tok,
	tokLines,
	expectToken,
	expectTokenType,
	expectLossless,
	findTokens
} from '../test-helpers';

const scala = createScalaTokenizer();

describe('ScalaTokenizer — keywords', () => {
	it('classifies definition keywords', () => {
		const line = tok(scala, 'def greet(): Unit = ()');
		expectToken(line, 'keyword.definition', 'def');
	});

	it('classifies val and var as definition keywords', () => {
		const line = tok(scala, 'val x = 1');
		expectToken(line, 'keyword.definition', 'val');
	});

	it('classifies class/trait/object as definition keywords', () => {
		const line = tok(scala, 'sealed trait Shape');
		expectToken(line, 'keyword.definition', 'trait');
	});

	it('classifies storage modifiers', () => {
		const line = tok(scala, 'private final lazy val cache = Map()');
		expectToken(line, 'keyword.storage', 'private');
		expectToken(line, 'keyword.storage', 'final');
		expectToken(line, 'keyword.storage', 'lazy');
	});

	it('classifies control-flow keywords', () => {
		const line = tok(scala, 'if (x) yield x else throw e');
		expectToken(line, 'keyword.control', 'if');
		expectToken(line, 'keyword.control', 'yield');
		expectToken(line, 'keyword.control', 'else');
		expectToken(line, 'keyword.control', 'throw');
	});

	it('classifies match as a control keyword', () => {
		const line = tok(scala, 'value match {');
		expectToken(line, 'keyword.control', 'match');
	});

	it('classifies module keywords', () => {
		const line = tok(scala, 'import scala.collection.mutable');
		expectToken(line, 'keyword.module', 'import');
	});

	it('classifies package as a module keyword', () => {
		const line = tok(scala, 'package com.example.app');
		expectToken(line, 'keyword.module', 'package');
	});

	it('classifies new/extends/with as plain keywords', () => {
		const line = tok(scala, 'class A extends B with C');
		expectToken(line, 'keyword', 'extends');
		expectToken(line, 'keyword', 'with');
	});

	it('classifies Scala 3 enum/given/extension as definition keywords', () => {
		const e = tok(scala, 'enum Color { case Red, Green, Blue }');
		expectToken(e, 'keyword.definition', 'enum');

		const g = tok(scala, 'given ordInt: Ord[Int] with');
		expectToken(g, 'keyword.definition', 'given');

		// `extension` is glued to `(` but must still be a keyword, not a function call.
		const x = tok(scala, 'extension (s: String) def shout = s');
		expectToken(x, 'keyword.definition', 'extension');
	});

	it('classifies Scala 3 then as a control keyword', () => {
		const line = tok(scala, 'if x > 0 then a else b');
		expectToken(line, 'keyword.control', 'then');
	});

	it('classifies Scala 3 soft modifiers as storage keywords', () => {
		const line = tok(scala, 'transparent inline def f = 1');
		expectToken(line, 'keyword.storage', 'transparent');
		expectToken(line, 'keyword.storage', 'inline');
	});

	it('classifies opaque type as a storage + definition keyword pair', () => {
		const line = tok(scala, 'opaque type Logarithm = Double');
		expectToken(line, 'keyword.storage', 'opaque');
		expectToken(line, 'keyword.definition', 'type');
	});

	it('classifies using/derives/end/export as keywords, not identifiers', () => {
		const u = tok(scala, 'def max[T](x: T)(using ord: Ord[T]) = x');
		expectToken(u, 'keyword', 'using');

		const d = tok(scala, 'class C derives Eq');
		expectToken(d, 'keyword', 'derives');

		const en = tok(scala, 'end Main');
		expectToken(en, 'keyword', 'end');

		const ex = tok(scala, 'export foo.bar');
		expectToken(ex, 'keyword.module', 'export');
	});
});

describe('ScalaTokenizer — strings', () => {
	it('tokenizes a plain double-quoted string', () => {
		const line = tok(scala, 'val s = "hello"');
		expectToken(line, 'string', '"hello"');
	});

	it('sub-tokenizes an s-interpolator: $name breaks out as a template + variable', () => {
		const line = tok(scala, 'val msg = s"Hi $name"');
		// The literal head keeps the prefix+quote; the substitution is broken out.
		expectToken(line, 'string', 's"Hi ');
		expectToken(line, 'string.template', '$');
		expectToken(line, 'variable', 'name');
		expectToken(line, 'string', '"');
		expectLossless(line, 'val msg = s"Hi $name"');
	});

	it('sub-tokenizes an s-interpolator ${ expr } block with real inner types', () => {
		const line = tok(scala, 'val msg = s"sum=${x + y}"');
		expectToken(line, 'string.template', '${');
		expectToken(line, 'variable', 'x');
		expectToken(line, 'operator.arithmetic', '+');
		expectToken(line, 'variable', 'y');
		expectToken(line, 'string.template', '}');
		expectLossless(line, 'val msg = s"sum=${x + y}"');
	});

	it('sub-tokenizes an f-interpolator with a printf format specifier', () => {
		const line = tok(scala, 'val out = f"$pi%2.2f"');
		expectToken(line, 'string', 'f"');
		expectToken(line, 'string.template', '$');
		expectToken(line, 'variable', 'pi');
		expectToken(line, 'string.escape', '%2.2f');
		expectLossless(line, 'val out = f"$pi%2.2f"');
	});

	it('does NOT interpolate $ inside a raw-interpolator (no escapes either)', () => {
		const line = tok(scala, 'val r = raw"a\\nb $x"');
		// raw strings are literal: \n is NOT an escape, but $x IS still a substitution.
		expectToken(line, 'string', 'raw"a\\nb ');
		expectToken(line, 'string.template', '$');
		expectToken(line, 'variable', 'x');
		expectLossless(line, 'val r = raw"a\\nb $x"');
	});

	it('does NOT interpolate $ inside an un-prefixed plain string', () => {
		// Plain "..." has no interpolator, so $name is literal text.
		const line = tok(scala, 'val p = "$name stays literal"');
		expectToken(line, 'string', '"$name stays literal"');
		expectLossless(line, 'val p = "$name stays literal"');
	});

	it('handles escape sequences inside a string as string.escape', () => {
		const line = tok(scala, 'val q = "she said \\"hi\\"\\n"');
		expectToken(line, 'string.escape', '\\"');
		expectToken(line, 'string.escape', '\\n');
		expectLossless(line, 'val q = "she said \\"hi\\"\\n"');
	});

	it('emits a \\uXXXX unicode escape as one string.escape token', () => {
		const line = tok(scala, 'val u = "caf\\u00e9"');
		expectToken(line, 'string.escape', '\\u00e9');
		expectLossless(line, 'val u = "caf\\u00e9"');
	});

	it('emits an octal escape as one string.escape token', () => {
		const line = tok(scala, 'val o = "\\123x"');
		expectToken(line, 'string.escape', '\\123');
		expectLossless(line, 'val o = "\\123x"');
	});

	it('tokenizes a char literal', () => {
		const line = tok(scala, "val c = 'x'");
		expectToken(line, 'string', "'x'");
	});

	it('tokenizes an escaped char literal', () => {
		const line = tok(scala, "val nl = '\\n'");
		expectToken(line, 'string', "'\\n'");
	});

	it('tokenizes a symbol literal as constant.builtin', () => {
		const line = tok(scala, "val sym = 'mySymbol");
		expectToken(line, 'constant.builtin', "'mySymbol");
	});

	it('keeps an arbitrary custom interpolator prefix attached and interpolates it', () => {
		// `json"..."`, `sql"..."`, `uri"..."` are valid custom interpolators; the prefix
		// is part of the string token, and (being prefixed) the body interpolates `$`.
		const j = tok(scala, 'val q = sql"SELECT * FROM t WHERE id = $id"');
		expectToken(j, 'string', 'sql"SELECT * FROM t WHERE id = ');
		expectToken(j, 'string.template', '$');
		expectToken(j, 'variable', 'id');
		expectLossless(j, 'val q = sql"SELECT * FROM t WHERE id = $id"');

		const u = tok(scala, 'val g = uri"http://$host/path"');
		expectToken(u, 'string.template', '$');
		expectToken(u, 'variable', 'host');
		expectLossless(u, 'val g = uri"http://$host/path"');
	});

	it('keeps a custom triple-quoted interpolator prefix attached (no $ => one token)', () => {
		const line = tok(scala, 'val e = json"""{ "k": 1 }"""');
		expectToken(line, 'string', 'json"""{ "k": 1 }"""');
		expectLossless(line, 'val e = json"""{ "k": 1 }"""');
	});
});

describe('ScalaTokenizer — comments', () => {
	it('tokenizes a line comment', () => {
		const line = tok(scala, '// a single-line comment');
		expectToken(line, 'comment.line', '// a single-line comment');
	});

	it('tokenizes a single-line block comment', () => {
		const line = tok(scala, '/* inline */ val x = 1');
		expectToken(line, 'comment.block', '/* inline */');
	});
});

describe('ScalaTokenizer — numbers', () => {
	it('tokenizes an integer', () => {
		const line = tok(scala, 'val n = 42');
		expectToken(line, 'number.integer', '42');
	});

	it('tokenizes a Long literal with suffix', () => {
		const line = tok(scala, 'val big = 9999L');
		expectToken(line, 'number.integer', '9999L');
	});

	it('tokenizes a hex literal as number.hex', () => {
		const line = tok(scala, 'val mask = 0xFF');
		expectToken(line, 'number.hex', '0xFF');
	});

	it('tokenizes a float with suffix as number.float', () => {
		const line = tok(scala, 'val pi = 3.14f');
		expectToken(line, 'number.float', '3.14f');
	});

	it('tokenizes a number with underscores', () => {
		const line = tok(scala, 'val m = 1_000_000');
		expectToken(line, 'number.integer', '1_000_000');
	});

	it('tokenizes a binary literal as number.binary', () => {
		// Regression: `0b1010` must not split into number `0` + identifier `b1010`.
		const line = tok(scala, 'val bin = 0b1010');
		expectToken(line, 'number.binary', '0b1010');
		expectLossless(line, 'val bin = 0b1010');
	});

	it('does not let an integer swallow a member-access dot', () => {
		// `42.toString` is (42).toString — the dot is an accessor, not a decimal point.
		const line = tok(scala, 'val a = 42.toString');
		expectToken(line, 'number.integer', '42');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'toString');
		expectLossless(line, 'val a = 42.toString');
	});

	it('treats a method call on an integer literal as accessor + call', () => {
		const line = tok(scala, 'val r = 1.to(10)');
		expectToken(line, 'number.integer', '1');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'function.call', 'to');
		expectLossless(line, 'val r = 1.to(10)');
	});

	it('still tokenizes a real float (dot followed by digits)', () => {
		const line = tok(scala, 'val pi = 3.14');
		expectToken(line, 'number.float', '3.14');
	});

	it('tokenizes a leading-dot float', () => {
		const line = tok(scala, 'val half = .5');
		expectToken(line, 'number.float', '.5');
	});

	it('keeps the dot as an accessor after a float method call', () => {
		const line = tok(scala, 'val b = 3.14.round');
		expectToken(line, 'number.float', '3.14');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'round');
	});
});

describe('ScalaTokenizer — operators', () => {
	it('classifies arrow operators as keyword.operator', () => {
		const line = tok(scala, 'xs.map(x => x + 1)');
		expectToken(line, 'keyword.operator', '=>');
	});

	it('classifies the for-comprehension arrow', () => {
		const line = tok(scala, 'for (x <- xs) yield x');
		expectToken(line, 'keyword.operator', '<-');
	});

	it('classifies type-bound operators', () => {
		const line = tok(scala, 'def f[A <: Ordered[A]](a: A) = a');
		expectToken(line, 'keyword.operator', '<:');
	});

	it('classifies arithmetic operators', () => {
		const line = tok(scala, 'val r = a + b * c');
		expectToken(line, 'operator.arithmetic', '+');
		expectToken(line, 'operator.arithmetic', '*');
	});

	it('classifies comparison operators', () => {
		const line = tok(scala, 'if (a == b && c != d) ()');
		expectToken(line, 'operator.comparison', '==');
		expectToken(line, 'operator.logical', '&&');
	});
});

describe('ScalaTokenizer — identifiers & builtins', () => {
	it('classifies builtin types', () => {
		const line = tok(scala, 'val xs: List[Int] = List()');
		expectToken(line, 'type.builtin', 'List');
		expectToken(line, 'type.builtin', 'Int');
	});

	it('classifies Option and String builtins', () => {
		const line = tok(scala, 'def find(k: String): Option[Int] = None');
		expectToken(line, 'type.builtin', 'String');
		expectToken(line, 'type.builtin', 'Option');
	});

	it('classifies true/false/null literals', () => {
		const line = tok(scala, 'val flag = true; val empty = null');
		expectToken(line, 'constant.boolean', 'true');
		expectToken(line, 'constant.null', 'null');
	});

	it('classifies a function call', () => {
		const line = tok(scala, 'process(input)');
		expectToken(line, 'function.call', 'process');
	});

	it('classifies PascalCase as a class type', () => {
		const line = tok(scala, 'val acc = MyAccumulator');
		expectToken(line, 'type.class', 'MyAccumulator');
	});

	it('classifies lowercase identifiers as variables', () => {
		const line = tok(scala, 'val total = items');
		expectToken(line, 'variable', 'items');
	});

	it('treats a backtick-quoted reserved word as a plain identifier', () => {
		// `type` is an escaped identifier, NOT the `type` keyword.
		const line = tok(scala, 'val `type` = 5');
		expectToken(line, 'variable', '`type`');
		expectLossless(line, 'val `type` = 5');
	});

	it('treats a backticked Java method call as a function call after the accessor', () => {
		const line = tok(scala, 'Thread.`yield`()');
		expectToken(line, 'function.call', '`yield`');
		expectLossless(line, 'Thread.`yield`()');
	});
});

describe('ScalaTokenizer — multi-line constructs', () => {
	it('threads a multi-line block comment across lines', () => {
		const lines = tokLines(scala, ['/* start of', ' * a doc comment', ' */ val x = 1']);
		expectTokenType(lines[0], 'comment.block');
		expectTokenType(lines[1], 'comment.block');
		expectToken(lines[2], 'comment.block', ' */');
		expectToken(lines[2], 'keyword.definition', 'val');
	});

	it('threads a triple-quoted string across lines', () => {
		const lines = tokLines(scala, ['val q = """line one', 'line two', 'line three"""']);
		expectTokenType(lines[0], 'string');
		expectTokenType(lines[1], 'string');
		expectTokenType(lines[2], 'string');
		expectToken(lines[1], 'string', 'line two');
	});
});

describe('ScalaTokenizer — realistic lines', () => {
	it('tokenizes a case class definition', () => {
		const line = tok(scala, 'case class Point(x: Int, y: Int)');
		expectToken(line, 'keyword.definition', 'case');
		expectToken(line, 'keyword.definition', 'class');
		// The class name after `class` is the type being defined, not a call.
		expectToken(line, 'type.class', 'Point');
		expectToken(line, 'type.builtin', 'Int');
	});

	it('tokenizes a pattern-match case arm', () => {
		const line = tok(scala, '  case Some(value) => println(value)');
		expectToken(line, 'keyword.definition', 'case');
		expectToken(line, 'function.call', 'Some');
		expectToken(line, 'keyword.operator', '=>');
		expectToken(line, 'function.call', 'println');
	});
});

describe('ScalaTokenizer — lossless', () => {
	it('is lossless on a line with leading indentation', () => {
		const original = '    val result = compute(a, b) + offset';
		expectLossless(tok(scala, original), original);
	});

	it('is lossless on a string with escapes', () => {
		const original = 'val path = "C:\\\\Users\\\\\\"name\\""';
		expectLossless(tok(scala, original), original);
	});

	it('is lossless on a comment line', () => {
		const original = '  // TODO: handle the empty-collection edge case';
		expectLossless(tok(scala, original), original);
	});

	it('is lossless across a threaded triple-quoted string', () => {
		const lines = ['val sql = s"""SELECT * FROM t', 'WHERE id = $id', 'ORDER BY name"""'];
		const results = tokLines(scala, lines);
		for (let i = 0; i < lines.length; i++) {
			expectLossless(results[i], lines[i]);
		}
	});

	it('is lossless on a symbol-vs-char tricky line', () => {
		const original = "val pair = ('a', 'tag, 'b')";
		expectLossless(tok(scala, original), original);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// A+ closures: each suite below is a fail-before/pass-after regression guarding
// one of the closed gap classes (interpolation sub-tokenization, escapes, number
// subtypes, context classification, multi-line threading).
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalaTokenizer — interpolation sub-tokenization', () => {
	it('breaks out a bare $ident substitution (template + variable)', () => {
		const line = tok(scala, 'val m = s"Hi $name."');
		expectToken(line, 'string', 's"Hi ');
		expectToken(line, 'string.template', '$');
		expectToken(line, 'variable', 'name');
		expectToken(line, 'string', '."');
		expectLossless(line, 'val m = s"Hi $name."');
	});

	it('tokenizes a ${ expr } block with real inner operator/number types', () => {
		const line = tok(scala, 'val m = s"sum=${x + y * 2}"');
		expectToken(line, 'string.template', '${');
		expectToken(line, 'variable', 'x');
		expectToken(line, 'operator.arithmetic', '+');
		expectToken(line, 'variable', 'y');
		expectToken(line, 'operator.arithmetic', '*');
		expectToken(line, 'number.integer', '2');
		expectToken(line, 'string.template', '}');
		expectLossless(line, 'val m = s"sum=${x + y * 2}"');
	});

	it('classifies a member chain after a $ident substitution', () => {
		const line = tok(scala, 'val m = s"$user.name done"');
		expectToken(line, 'string.template', '$');
		expectToken(line, 'variable', 'user');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'name');
		expectLossless(line, 'val m = s"$user.name done"');
	});

	it('classifies a function call inside ${ ... }', () => {
		const line = tok(scala, 'val q = s"r: ${compute(a, b)}!"');
		expectToken(line, 'string.template', '${');
		expectToken(line, 'function.call', 'compute');
		expectToken(line, 'punctuation.paren', '(');
		expectToken(line, 'string.template', '}');
		expectLossless(line, 'val q = s"r: ${compute(a, b)}!"');
	});

	it('tokenizes a member access inside ${ ... }', () => {
		const line = tok(scala, 'val m = s"${addr.city}"');
		expectToken(line, 'variable', 'addr');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'city');
		expectLossless(line, 'val m = s"${addr.city}"');
	});

	it('emits an f-interpolator printf format specifier as string.escape', () => {
		const line = tok(scala, 'val o = f"$pi%2.2f and ${n}%05d"');
		expectToken(line, 'string.escape', '%2.2f');
		expectToken(line, 'string.escape', '%05d');
		expectLossless(line, 'val o = f"$pi%2.2f and ${n}%05d"');
	});

	it('does NOT treat % as a format spec in a non-f interpolator', () => {
		// In an s-interpolator, ${x}px must keep `px` literal, not eat a format spec.
		const line = tok(scala, 's"${x}px"');
		expectToken(line, 'string', 'px"');
		expectLossless(line, 's"${x}px"');
	});

	it('treats $$ as a literal-dollar escape inside an interpolator', () => {
		const line = tok(scala, 'val d = s"cost $$5 for $item"');
		expectToken(line, 'string.escape', '$$');
		expectToken(line, 'string.template', '$');
		expectToken(line, 'variable', 'item');
		expectLossless(line, 'val d = s"cost $$5 for $item"');
	});

	it('does NOT interpolate $ in an un-prefixed plain string', () => {
		const line = tok(scala, 'val p = "$name literal"');
		expectToken(line, 'string', '"$name literal"');
		// No template breakout at all.
		expect(findTokens(line, 'string.template')).toHaveLength(0);
		expectLossless(line, 'val p = "$name literal"');
	});

	it('interpolates $ but skips escapes in a raw interpolator', () => {
		const line = tok(scala, 'val r = raw"a\\nb $x"');
		// \n is literal in raw strings — never a string.escape.
		expect(findTokens(line, 'string.escape')).toHaveLength(0);
		expectToken(line, 'string.template', '$');
		expectToken(line, 'variable', 'x');
		expectLossless(line, 'val r = raw"a\\nb $x"');
	});

	it('sub-tokenizes a string nested inside ${ ... } of the same quote', () => {
		const line = tok(scala, 'val z = s"outer ${ s"inner $x" } tail"');
		// The inner same-quote string must not terminate the outer string early;
		// its $x must still sub-tokenize.
		expectToken(line, 'string.template', '${');
		expectToken(line, 'string', 's"inner ');
		expectToken(line, 'variable', 'x');
		expectToken(line, 'string.template', '}');
		expectLossless(line, 'val z = s"outer ${ s"inner $x" } tail"');
	});

	it('handles a lone $ (not a substitution) losslessly', () => {
		const line = tok(scala, 's"price is $ here"');
		expectLossless(line, 's"price is $ here"');
	});

	it('handles an unterminated ${ losslessly', () => {
		const line = tok(scala, 's"${unclosed');
		expectToken(line, 'string.template', '${');
		expectLossless(line, 's"${unclosed');
	});

	it('does NOT let a } inside a nested string close the ${ } block early', () => {
		// Regression: the brace matcher must skip nested string literals. Previously
		// the `}` inside "}" ended the interpolation, bleeding the outer string and
		// mis-tokenizing the trailing `}` and `"{"` as bare punctuation/strings.
		const line = tok(scala, 'val v = s"${ if (x) "}" else "{" }"');
		// The whole conditional is one interpolation: both braces stay inside their
		// nested string literals, and the closing template `}` is the FINAL brace.
		expectToken(line, 'string.template', '${');
		expectToken(line, 'keyword.control', 'if');
		expectToken(line, 'string', '"}"');
		expectToken(line, 'keyword.control', 'else');
		expectToken(line, 'string', '"{"');
		expectToken(line, 'string.template', '}');
		// Exactly one opening and one closing interpolation delimiter — no stray
		// `punctuation.brace` leaked from a prematurely-closed block.
		expect(findTokens(line, 'string.template').map((t) => t.text)).toEqual(['${', '}']);
		expect(findTokens(line, 'punctuation.brace')).toHaveLength(0);
		expectLossless(line, 'val v = s"${ if (x) "}" else "{" }"');
	});

	it('skips a char literal holding a brace when matching the ${ } block', () => {
		const line = tok(scala, 'val c = s"${ if (ch == \'}\') 1 else 0 }"');
		expectToken(line, 'string.template', '${');
		expectToken(line, 'string', "'}'");
		expect(findTokens(line, 'string.template').map((t) => t.text)).toEqual(['${', '}']);
		expectLossless(line, 'val c = s"${ if (ch == \'}\') 1 else 0 }"');
	});
});

describe('ScalaTokenizer — string escapes', () => {
	it('emits \\n, \\t and \\" as string.escape', () => {
		const line = tok(scala, 'val s = "a\\tb\\nc\\"d"');
		expect(findTokens(line, 'string.escape').map((t) => t.text)).toEqual(['\\t', '\\n', '\\"']);
		expectLossless(line, 'val s = "a\\tb\\nc\\"d"');
	});

	it('emits a \\uXXXX unicode escape as a single token', () => {
		const line = tok(scala, 'val u = "caf\\u00e9!"');
		expectToken(line, 'string.escape', '\\u00e9');
		expectLossless(line, 'val u = "caf\\u00e9!"');
	});

	it('emits an octal escape as a single token', () => {
		const line = tok(scala, 'val o = "\\123done"');
		expectToken(line, 'string.escape', '\\123');
		expectLossless(line, 'val o = "\\123done"');
	});

	it('emits a backslash-backslash escape as one token', () => {
		const line = tok(scala, 'val w = "C:\\\\dir"');
		expectToken(line, 'string.escape', '\\\\');
		expectLossless(line, 'val w = "C:\\\\dir"');
	});

	it('does NOT process escapes in a triple-quoted string', () => {
		const line = tok(scala, 'val t = """a\\nb"""');
		expect(findTokens(line, 'string.escape')).toHaveLength(0);
		expectLossless(line, 'val t = """a\\nb"""');
	});
});

describe('ScalaTokenizer — number subtypes', () => {
	it('emits number.hex for a hex literal', () => {
		expectToken(tok(scala, 'val h = 0xCAFE_BABEL'), 'number.hex', '0xCAFE_BABEL');
	});

	it('emits number.binary for a binary literal', () => {
		expectToken(tok(scala, 'val b = 0b1010_1100'), 'number.binary', '0b1010_1100');
	});

	it('emits number.float for decimals, exponents and f/d suffixes', () => {
		expectToken(tok(scala, 'val a = 3.14'), 'number.float', '3.14');
		expectToken(tok(scala, 'val b = 3.14e10f'), 'number.float', '3.14e10f');
		expectToken(tok(scala, 'val c = 1.0d'), 'number.float', '1.0d');
		expectToken(tok(scala, 'val d = .5'), 'number.float', '.5');
	});

	it('emits number.integer for plain and Long integers', () => {
		expectToken(tok(scala, 'val a = 42'), 'number.integer', '42');
		expectToken(tok(scala, 'val b = 1_000_000L'), 'number.integer', '1_000_000L');
	});
});

describe('ScalaTokenizer — context classification', () => {
	it('classifies a member after an accessor as property', () => {
		const line = tok(scala, 'val n = obj.field');
		expectToken(line, 'variable', 'obj');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'field');
		expectLossless(line, 'val n = obj.field');
	});

	it('classifies a method call after an accessor as function.call, not property', () => {
		const line = tok(scala, 'val n = obj.method(arg)');
		expectToken(line, 'function.call', 'method');
		expect(findTokens(line, 'property')).toHaveLength(0);
		expectLossless(line, 'val n = obj.method(arg)');
	});

	it('classifies the name after def as function.definition', () => {
		const line = tok(scala, 'def compute(x: Int) = x');
		expectToken(line, 'function.definition', 'compute');
	});

	it('classifies the name after class/trait/object/type/enum as type.class', () => {
		expectToken(tok(scala, 'class Widget(id: Int)'), 'type.class', 'Widget');
		expectToken(tok(scala, 'trait Shape'), 'type.class', 'Shape');
		expectToken(tok(scala, 'object Main extends App'), 'type.class', 'Main');
		expectToken(tok(scala, 'type Logarithm = Double'), 'type.class', 'Logarithm');
		expectToken(tok(scala, 'enum Color:'), 'type.class', 'Color');
	});

	it('classifies the name after val/var as variable.definition', () => {
		expectToken(tok(scala, 'val total = 0'), 'variable.definition', 'total');
		expectToken(tok(scala, 'var counter = 0'), 'variable.definition', 'counter');
	});

	it('classifies an @annotation as a type token', () => {
		const line = tok(scala, '@tailrec def loop() = ()');
		expectToken(line, 'type', '@tailrec');
		expectLossless(line, '@tailrec def loop() = ()');
	});

	it('classifies the Scala 3 generalized type-equality operators', () => {
		const line = tok(scala, 'def f[A <:< B](a: A) = a');
		expectToken(line, 'operator.comparison', '<:<');
		expectLossless(line, 'def f[A <:< B](a: A) = a');
	});

	it('treats type-parameter brackets as punctuation.bracket', () => {
		const line = tok(scala, 'val m: Map[String, List[Int]] = Map()');
		expect(findTokens(line, 'punctuation.bracket').map((t) => t.text)).toEqual([
			'[',
			'[',
			']',
			']'
		]);
		expectLossless(line, 'val m: Map[String, List[Int]] = Map()');
	});
});

describe('ScalaTokenizer — multi-line interpolation threading', () => {
	it('threads interpolation through a multi-line triple-quoted s-string', () => {
		const lines = tokLines(scala, ['val sql = s"""SELECT $col', 'FROM ${table}', 'WHERE x=$y"""']);
		// Line 0: $col breaks out.
		expectToken(lines[0], 'string.template', '$');
		expectToken(lines[0], 'variable', 'col');
		// Line 1: ${table} breaks out even though it began on a prior line.
		expectToken(lines[1], 'string.template', '${');
		expectToken(lines[1], 'variable', 'table');
		expectToken(lines[1], 'string.template', '}');
		// Line 2: $y breaks out and the string closes.
		expectToken(lines[2], 'string.template', '$');
		expectToken(lines[2], 'variable', 'y');
		for (let i = 0; i < lines.length; i++) {
			expectLossless(lines[i], ['val sql = s"""SELECT $col', 'FROM ${table}', 'WHERE x=$y"""'][i]);
		}
	});

	it('threads an f-format specifier across a triple-string line break', () => {
		const lines = tokLines(scala, ['val r = f"""$a%d', '$b%2.2f"""']);
		expectToken(lines[0], 'string.escape', '%d');
		expectToken(lines[1], 'string.escape', '%2.2f');
		expectLossless(lines[0], 'val r = f"""$a%d');
		expectLossless(lines[1], '$b%2.2f"""');
	});
});
