import { describe, it } from 'vitest';
import { createScalaTokenizer } from './scala';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

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
});

describe('ScalaTokenizer — strings', () => {
	it('tokenizes a plain double-quoted string', () => {
		const line = tok(scala, 'val s = "hello"');
		expectToken(line, 'string', '"hello"');
	});

	it('tokenizes an s-interpolator string as one token', () => {
		const line = tok(scala, 'val msg = s"Hi $name"');
		expectToken(line, 'string', 's"Hi $name"');
	});

	it('tokenizes an f-interpolator string', () => {
		const line = tok(scala, 'val out = f"$pi%2.2f"');
		expectToken(line, 'string', 'f"$pi%2.2f"');
	});

	it('tokenizes a raw-interpolator string', () => {
		const line = tok(scala, 'val r = raw"a\\nb"');
		expectToken(line, 'string', 'raw"a\\nb"');
	});

	it('handles escape sequences inside a string', () => {
		const line = tok(scala, 'val q = "she said \\"hi\\""');
		expectToken(line, 'string', '"she said \\"hi\\""');
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
		expectToken(line, 'number', '42');
	});

	it('tokenizes a Long literal with suffix', () => {
		const line = tok(scala, 'val big = 9999L');
		expectToken(line, 'number', '9999L');
	});

	it('tokenizes a hex literal', () => {
		const line = tok(scala, 'val mask = 0xFF');
		expectToken(line, 'number', '0xFF');
	});

	it('tokenizes a float with suffix', () => {
		const line = tok(scala, 'val pi = 3.14f');
		expectToken(line, 'number', '3.14f');
	});

	it('tokenizes a number with underscores', () => {
		const line = tok(scala, 'val m = 1_000_000');
		expectToken(line, 'number', '1_000_000');
	});

	it('does not let an integer swallow a member-access dot', () => {
		// `42.toString` is (42).toString — the dot is an accessor, not a decimal point.
		const line = tok(scala, 'val a = 42.toString');
		expectToken(line, 'number', '42');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'variable', 'toString');
		expectLossless(line, 'val a = 42.toString');
	});

	it('treats a method call on an integer literal as accessor + call', () => {
		const line = tok(scala, 'val r = 1.to(10)');
		expectToken(line, 'number', '1');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'function.call', 'to');
		expectLossless(line, 'val r = 1.to(10)');
	});

	it('still tokenizes a real float (dot followed by digits)', () => {
		const line = tok(scala, 'val pi = 3.14');
		expectToken(line, 'number', '3.14');
	});

	it('tokenizes a leading-dot float', () => {
		const line = tok(scala, 'val half = .5');
		expectToken(line, 'number', '.5');
	});

	it('keeps the dot as an accessor after a float method call', () => {
		const line = tok(scala, 'val b = 3.14.round');
		expectToken(line, 'number', '3.14');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'variable', 'round');
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

	it('treats a backticked Java method name as an identifier', () => {
		const line = tok(scala, 'Thread.`yield`()');
		expectToken(line, 'variable', '`yield`');
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
		expectToken(line, 'function.call', 'Point');
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
