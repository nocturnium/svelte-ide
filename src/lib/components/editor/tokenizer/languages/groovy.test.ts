import { describe, it } from 'vitest';
import { createGroovyTokenizer } from './groovy';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const groovy = createGroovyTokenizer();

describe('Groovy tokenizer', () => {
	describe('keywords', () => {
		it('detects definition keywords', () => {
			const line = tok(groovy, 'def x = 1');
			expectToken(line, 'keyword.definition', 'def');
		});

		it('detects class/interface/enum/trait definitions', () => {
			expectToken(tok(groovy, 'class Foo {}'), 'keyword.definition', 'class');
			expectToken(tok(groovy, 'interface Bar {}'), 'keyword.definition', 'interface');
			expectToken(tok(groovy, 'enum Color {}'), 'keyword.definition', 'enum');
			expectToken(tok(groovy, 'trait Walks {}'), 'keyword.definition', 'trait');
		});

		it('detects storage modifiers', () => {
			const line = tok(groovy, 'public static final int N = 3');
			expectToken(line, 'keyword.storage', 'public');
			expectToken(line, 'keyword.storage', 'static');
			expectToken(line, 'keyword.storage', 'final');
		});

		it('detects control-flow keywords', () => {
			const line = tok(groovy, 'if (x) return y else throw e');
			expectToken(line, 'keyword.control', 'if');
			expectToken(line, 'keyword.control', 'return');
			expectToken(line, 'keyword.control', 'else');
			expectToken(line, 'keyword.control', 'throw');
		});

		it('detects try/catch/finally', () => {
			const line = tok(groovy, 'try { x } catch (e) {} finally {}');
			expectToken(line, 'keyword.control', 'try');
			expectToken(line, 'keyword.control', 'catch');
			expectToken(line, 'keyword.control', 'finally');
		});

		it('detects module keywords', () => {
			const line = tok(groovy, 'import groovy.json.JsonSlurper');
			expectToken(line, 'keyword.module', 'import');
		});

		it('detects package keyword', () => {
			const line = tok(groovy, 'package com.example');
			expectToken(line, 'keyword.module', 'package');
		});

		it('detects other keywords (new, instanceof, as, in)', () => {
			expectToken(tok(groovy, 'new Foo()'), 'keyword', 'new');
			expectToken(tok(groovy, 'x instanceof Map'), 'keyword', 'instanceof');
			expectToken(tok(groovy, 'list as Set'), 'keyword', 'as');
			expectToken(tok(groovy, 'for (i in 0..5) {}'), 'keyword', 'in');
		});
	});

	describe('strings', () => {
		it('tokenizes single-quoted literal strings', () => {
			const line = tok(groovy, "def s = 'hello'");
			expectToken(line, 'string', "'hello'");
		});

		it('sub-tokenizes a double-quoted GString: literal + $ marker + variable', () => {
			// The GString is broken into a leading literal `string.template` run, the
			// `$` interpolation marker, and the interpolated `variable` — all lossless.
			const line = tok(groovy, 'def s = "Hello, $name"');
			expectToken(line, 'string.template', '"Hello, ');
			expectToken(line, 'string.template', '$');
			expectToken(line, 'variable', 'name');
			expectLossless(line, 'def s = "Hello, $name"');
		});

		it('sub-tokenizes a dotted $a.b interpolation as variable + property', () => {
			const line = tok(groovy, 'echo "user $req.user.name"');
			expectToken(line, 'string.template', '$');
			expectToken(line, 'variable', 'req');
			expectToken(line, 'property', 'user');
			expectToken(line, 'property', 'name');
			expectLossless(line, 'echo "user $req.user.name"');
		});

		it('sub-tokenizes ${expr} interpolation with real inner-expression types', () => {
			// The `${` and `}` delimiters are string.template; the inner expression is
			// tokenized with real types (variable, operator, number).
			const line = tok(groovy, 'def s = "total: ${a + b * 2}"');
			expectToken(line, 'string.template', '${');
			expectToken(line, 'string.template', '}');
			expectToken(line, 'variable', 'a');
			expectToken(line, 'operator.arithmetic', '+');
			expectToken(line, 'number.integer', '2');
			expectLossless(line, 'def s = "total: ${a + b * 2}"');
		});

		it('emits a function.call inside ${} interpolation', () => {
			const line = tok(groovy, 'echo "Build ${env.getProperty("X")} ok"');
			expectToken(line, 'function.call', 'getProperty');
			expectToken(line, 'variable', 'env');
			expectLossless(line, 'echo "Build ${env.getProperty("X")} ok"');
		});

		it('handles escaped quotes inside single-quoted strings (with escape token)', () => {
			const line = tok(groovy, "def s = 'it\\'s ok'");
			expectToken(line, 'string.escape', "\\'");
			expectLossless(line, "def s = 'it\\'s ok'");
		});

		it('emits string.escape for \\n \\t \\uXXXX and \\$ inside a GString', () => {
			const code = 'def s = "tab\\there \\u0041 \\$lit"';
			const line = tok(groovy, code);
			expectToken(line, 'string.escape', '\\t');
			expectToken(line, 'string.escape', '\\u0041');
			expectToken(line, 'string.escape', '\\$');
			expectLossless(line, code);
		});

		it('does not interpolate an escaped \\${...} but does the following $real', () => {
			const code = 'def s = "lit \\${no} and $real"';
			const line = tok(groovy, code);
			expectToken(line, 'string.escape', '\\$');
			expectToken(line, 'string.template', '$');
			expectToken(line, 'variable', 'real');
			expectLossless(line, code);
		});

		it('tokenizes a slashy regex after assignment (escape broken out)', () => {
			const line = tok(groovy, 'def p = /\\d+/');
			// `\d` is emitted as string.escape; the surrounding `/` ... `+/` stay regex.
			expectToken(line, 'string.escape', '\\d');
			expectTokenType(line, 'string.regex');
			expectLossless(line, 'def p = /\\d+/');
		});

		it('does NOT treat division as a regex', () => {
			const line = tok(groovy, 'def r = a / b');
			expectTokenType(line, 'operator.arithmetic');
		});

		it('tokenizes a slashy regex after the find operator =~', () => {
			// Regression: the regex body bled into code (`/`, `\`, `d`, `+`, `/`)
			// because `=~` was not a recognized regex-allowing context.
			const line = tok(groovy, 'if (s =~ /\\d+/) {}');
			expectToken(line, 'operator.comparison', '=~');
			expectToken(line, 'string.escape', '\\d');
			expectTokenType(line, 'string.regex');
			expectLossless(line, 'if (s =~ /\\d+/) {}');
		});

		it('tokenizes a slashy regex after the match operator ==~', () => {
			const line = tok(groovy, 'def m = s ==~ /^\\d+$/');
			expectTokenType(line, 'string.regex');
			expectToken(line, 'string.escape', '\\d');
			expectLossless(line, 'def m = s ==~ /^\\d+$/');
		});

		it('tokenizes a slashy regex after the pattern operator ~', () => {
			const line = tok(groovy, 'def p = ~/[a-z]+/');
			expectToken(line, 'operator', '~');
			expectTokenType(line, 'string.regex');
			expectLossless(line, 'def p = ~/[a-z]+/');
		});

		it('sub-tokenizes ${...} interpolation inside a slashy regex', () => {
			// Slashy strings are GStrings: `${id}` interpolates with real types, and
			// `\d` is a string.escape — the `/` inside `${}` does not end the regex.
			const code = 'def p = /user_${id}_\\d+/';
			const line = tok(groovy, code);
			expectToken(line, 'string.template', '${');
			expectToken(line, 'variable', 'id');
			expectToken(line, 'string.escape', '\\d');
			expectLossless(line, code);
		});

		it('does not let a nested double-quote inside ${} interpolation end the GString early', () => {
			// Regression: a `"` inside `${foo("...")}` previously terminated the
			// GString early. Brace-aware scanning keeps the whole construct intact and
			// now fully sub-tokenizes the nested GString.
			const code = 'def x = "nested ${foo("${bar}")} end"';
			const line = tok(groovy, code);
			expectToken(line, 'function.call', 'foo');
			expectToken(line, 'variable', 'bar');
			expectToken(line, 'string.template', ' end"');
			expectLossless(line, code);
		});

		it('keeps a nested closure/map inside ${} interpolation lossless and typed', () => {
			const code = 'def x = "deep ${ [a:1, b:[2,3]].collect { it } }"';
			const line = tok(groovy, code);
			expectToken(line, 'property', 'collect');
			expectToken(line, 'keyword', 'it');
			expectToken(line, 'number.integer', '1');
			expectLossless(line, code);
		});

		it('tokenizes a single-line dollar-slashy string with escapes', () => {
			// Regression: `$/ ... /$` was previously shredded into `$`, `/`,
			// identifiers and a division operator. It is a regex string; `$$` inside
			// is a string.escape that must not terminate it.
			const code = 'def q = $/ a $$ b /$';
			const line = tok(groovy, code);
			expectToken(line, 'string.regex', '$/');
			expectToken(line, 'string.escape', '$$');
			expectLossless(line, code);
		});

		it('does not terminate a dollar-slashy string at an escaped $/', () => {
			const code = 'def p = $/path $/ literal slash/$';
			const line = tok(groovy, code);
			expectToken(line, 'string.escape', '$/');
			expectTokenType(line, 'string.regex');
			expectLossless(line, code);
		});

		it('sub-tokenizes ${} interpolation inside a dollar-slashy string', () => {
			const code = 'def q = $/path ${x} end/$';
			const line = tok(groovy, code);
			expectToken(line, 'string.template', '${');
			expectToken(line, 'variable', 'x');
			expectLossless(line, code);
		});

		it('threads a multi-line dollar-slashy string across lines', () => {
			const lines = tokLines(groovy, ['def q = $/', 'line two $x', 'end /$ + foo()']);
			expectTokenType(lines[0], 'string.regex');
			expectTokenType(lines[1], 'string.regex');
			// `$x` on the middle line is interpolated even across the multi-line body.
			expectToken(lines[1], 'variable', 'x');
			expectToken(lines[2], 'function.call', 'foo');
			expectLossless(lines[1], 'line two $x');
		});
	});

	describe('comments', () => {
		it('tokenizes line comments', () => {
			const line = tok(groovy, '// a comment');
			expectToken(line, 'comment.line', '// a comment');
		});

		it('tokenizes single-line block comments', () => {
			const line = tok(groovy, 'def x /* inline */ = 1');
			expectToken(line, 'comment.block', '/* inline */');
		});

		it('tokenizes single-line doc comments', () => {
			const line = tok(groovy, '/** docs */');
			expectToken(line, 'comment.doc', '/** docs */');
		});
	});

	describe('numbers', () => {
		it('tokenizes decimal integers as number.integer', () => {
			expectToken(tok(groovy, 'def n = 42'), 'number.integer', '42');
		});

		it('tokenizes hex literals as number.hex', () => {
			expectToken(tok(groovy, 'def h = 0xFF'), 'number.hex', '0xFF');
		});

		it('tokenizes binary literals as number.binary', () => {
			expectToken(tok(groovy, 'def b = 0b1010'), 'number.binary', '0b1010');
		});

		it('tokenizes octal-style literals as number.integer', () => {
			expectToken(tok(groovy, 'def o = 0777'), 'number.integer', '0777');
		});

		it('tokenizes underscored numbers as number.integer', () => {
			expectToken(tok(groovy, 'def big = 1_000_000'), 'number.integer', '1_000_000');
		});

		it('tokenizes floats and suffixed numbers with float/integer subtypes', () => {
			expectToken(tok(groovy, 'def f = 3.14'), 'number.float', '3.14');
			expectToken(tok(groovy, 'def g = 100G'), 'number.integer', '100G');
			expectToken(tok(groovy, 'def l = 99L'), 'number.integer', '99L');
			expectToken(tok(groovy, 'def d = 1.5e10'), 'number.float', '1.5e10');
			expectToken(tok(groovy, 'def x = 2.0f'), 'number.float', '2.0f');
		});

		it('classifies a float/double suffix without a decimal point as number.float', () => {
			// `42d`/`42f` are floating-point in Groovy even without a `.`.
			expectToken(tok(groovy, 'def d = 42d'), 'number.float', '42d');
			expectToken(tok(groovy, 'def f = 7f'), 'number.float', '7f');
		});

		it('does not swallow the range operator into a number', () => {
			// Regression: `0..5` previously tokenized as number `0.` + number `.5`,
			// erasing the `..` range operator. The decimal point must only be
			// consumed when a digit follows it.
			const line = tok(groovy, 'for (i in 0..5) {}');
			expectToken(line, 'number.integer', '0');
			expectToken(line, 'operator', '..');
			expectToken(line, 'number.integer', '5');
			expectLossless(line, 'for (i in 0..5) {}');
		});

		it('keeps the exclusive range operator distinct from numbers', () => {
			const line = tok(groovy, 'def r = 1..<10');
			expectToken(line, 'number.integer', '1');
			expectToken(line, 'operator', '..<');
			expectToken(line, 'number.integer', '10');
			expectLossless(line, 'def r = 1..<10');
		});

		it('still tokenizes real floats with a fractional part', () => {
			expectToken(tok(groovy, 'def d = 2.0'), 'number.float', '2.0');
			expectToken(tok(groovy, 'def x = 0.5'), 'number.float', '0.5');
		});

		it('keeps an integer suffix on hex and binary literals', () => {
			// Regression: `0xFFi` previously tokenized as number `0xFF` + variable
			// `i`, dropping the valid Groovy `i`/`I` integer suffix from hex/binary
			// literals (assert 0xFFi.class == Integer per the Groovy spec).
			expectToken(tok(groovy, 'def e = 0xFFi'), 'number.hex', '0xFFi');
			expectToken(tok(groovy, 'def l = 0b1111L'), 'number.binary', '0b1111L');
			expectToken(tok(groovy, 'def g = 0xFFG'), 'number.hex', '0xFFG');
		});
	});

	describe('operators', () => {
		it('classifies arithmetic operators', () => {
			expectTokenType(tok(groovy, 'a + b * c'), 'operator.arithmetic');
		});

		it('classifies comparison operators', () => {
			expectToken(tok(groovy, 'a == b'), 'operator.comparison', '==');
			expectToken(tok(groovy, 'x <=> y'), 'operator.comparison', '<=>');
		});

		it('classifies logical operators', () => {
			expectToken(tok(groovy, 'a && b || c'), 'operator.logical', '&&');
			expectToken(tok(groovy, 'a && b || c'), 'operator.logical', '||');
		});

		it('classifies assignment operators', () => {
			expectToken(tok(groovy, 'x = 1'), 'operator.assignment', '=');
			expectToken(tok(groovy, 'x += 1'), 'operator.assignment', '+=');
		});
	});

	describe('identifiers and builtins', () => {
		it('classifies builtin types', () => {
			const line = tok(groovy, 'List<String> items = []');
			expectToken(line, 'type.builtin', 'List');
			expectToken(line, 'type.builtin', 'String');
		});

		it('classifies Map and Closure builtins', () => {
			expectToken(tok(groovy, 'Map config = [:]'), 'type.builtin', 'Map');
			expectToken(tok(groovy, 'Closure c = {}'), 'type.builtin', 'Closure');
		});

		it('classifies booleans and null', () => {
			expectToken(tok(groovy, 'def b = true'), 'constant.boolean', 'true');
			expectToken(tok(groovy, 'def b = false'), 'constant.boolean', 'false');
			expectToken(tok(groovy, 'def n = null'), 'constant.null', 'null');
		});

		it('classifies a function call', () => {
			const line = tok(groovy, 'println("hi")');
			expectToken(line, 'function.call', 'println');
		});

		it('classifies plain identifiers as variables', () => {
			const line = tok(groovy, 'def total = items');
			expectToken(line, 'variable', 'items');
		});

		it('classifies the implicit it parameter', () => {
			const line = tok(groovy, 'list.each { println it }');
			expectToken(line, 'keyword', 'it');
		});

		it('classifies a member after an accessor as property', () => {
			const line = tok(groovy, 'config.build.name = "x"');
			expectToken(line, 'variable', 'config');
			expectToken(line, 'property', 'build');
			expectToken(line, 'property', 'name');
		});

		it('classifies a method call after an accessor as function.call', () => {
			const line = tok(groovy, 'obj.doThing(1)');
			expectToken(line, 'function.call', 'doThing');
		});

		it('classifies SCREAMING_SNAKE_CASE as a constant', () => {
			expectToken(tok(groovy, 'def x = MAX_SIZE'), 'constant', 'MAX_SIZE');
		});
	});

	describe('context classification: operators and generics', () => {
		it('emits the spread-dot operator *. as one token', () => {
			const line = tok(groovy, 'def names = users*.name');
			expectToken(line, 'operator', '*.');
			expectToken(line, 'property', 'name');
			expectLossless(line, 'def names = users*.name');
		});

		it('emits the method-reference operator .& as one token', () => {
			const line = tok(groovy, 'def ref = str.&toUpperCase');
			expectToken(line, 'operator', '.&');
			expectToken(line, 'property', 'toUpperCase');
			expectLossless(line, 'def ref = str.&toUpperCase');
		});

		it('emits the method-pointer operator :: as one token', () => {
			const line = tok(groovy, 'def ref = String::valueOf');
			expectToken(line, 'operator', '::');
			expectToken(line, 'property', 'valueOf');
			expectLossless(line, 'def ref = String::valueOf');
		});

		it('emits the direct-field operator .@ as one token', () => {
			const line = tok(groovy, 'def v = obj.@field');
			expectToken(line, 'operator', '.@');
			expectToken(line, 'property', 'field');
			expectLossless(line, 'def v = obj.@field');
		});

		it('treats the generic angle brackets as punctuation.bracket', () => {
			const line = tok(groovy, 'List<String> items = []');
			const brackets = line.tokens.filter((t) => t.type === 'punctuation.bracket');
			expectToken(line, 'punctuation.bracket', '<');
			expectToken(line, 'punctuation.bracket', '>');
			// `<` and `>` here are NOT comparison operators.
			if (line.tokens.some((t) => t.type === 'operator.comparison')) {
				throw new Error('generic <> must not be comparison operators');
			}
			if (brackets.length < 2) throw new Error('expected both angle brackets');
		});

		it('splits a nested generic close >> into two punctuation.bracket tokens', () => {
			const line = tok(groovy, 'Map<String, List<Integer>> m = [:]');
			const closes = line.tokens.filter((t) => t.type === 'punctuation.bracket' && t.text === '>');
			if (closes.length !== 2) {
				throw new Error('expected two close-angle brackets, got ' + closes.length);
			}
			expectLossless(line, 'Map<String, List<Integer>> m = [:]');
		});

		it('opens a generic context for a `def <T>` generic method', () => {
			const line = tok(groovy, 'def <T> T id(T x) { x }');
			expectToken(line, 'punctuation.bracket', '<');
			expectToken(line, 'punctuation.bracket', '>');
			expectLossless(line, 'def <T> T id(T x) { x }');
		});

		it('does NOT treat a real less-than/greater-than as generic brackets', () => {
			const line = tok(groovy, 'if (a < b && c > d) {}');
			expectToken(line, 'operator.comparison', '<');
			expectToken(line, 'operator.comparison', '>');
		});

		it('keeps a left-shift operator distinct from a generic open', () => {
			const line = tok(groovy, 'def x = 1 << 4');
			expectToken(line, 'operator', '<<');
		});
	});

	describe('multi-line constructs', () => {
		it('threads a block comment across lines', () => {
			const lines = tokLines(groovy, ['/* start', ' middle', ' end */ def x = 1']);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
			expectToken(lines[2], 'keyword.definition', 'def');
		});

		it('threads a triple-single-quoted string across lines', () => {
			const lines = tokLines(groovy, ["def s = '''line one", 'line two', "line three'''"]);
			expectTokenType(lines[0], 'string');
			expectTokenType(lines[1], 'string');
			expectTokenType(lines[2], 'string');
		});

		it('threads a triple-double-quoted GString across lines', () => {
			const lines = tokLines(groovy, ['def s = """first $x', 'second line', 'third"""']);
			expectTokenType(lines[0], 'string.template');
			expectTokenType(lines[1], 'string.template');
			expectTokenType(lines[2], 'string.template');
		});

		it('resumes code after a multi-line GString closes', () => {
			const lines = tokLines(groovy, ['def s = """open', 'close""" + foo()']);
			expectToken(lines[1], 'function.call', 'foo');
		});
	});

	describe('realistic lines', () => {
		it('tokenizes a closure with an arrow and parameters', () => {
			const line = tok(groovy, 'def add = { a, b -> a + b }');
			expectToken(line, 'keyword.definition', 'def');
			expectToken(line, 'operator', '->');
			expectToken(line, 'punctuation.brace', '{');
		});

		it('tokenizes a Gradle dependency declaration', () => {
			const line = tok(groovy, "testImplementation('org.spockframework:spock-core:2.3')");
			expectToken(line, 'function.call', 'testImplementation');
			expectToken(line, 'string', "'org.spockframework:spock-core:2.3'");
		});
	});

	describe('lossless', () => {
		it('is lossless on an indented method definition', () => {
			const code = '    def String greet(String who) {';
			expectLossless(tok(groovy, code), code);
		});

		it('is lossless on a string with escapes', () => {
			const code = "def path = 'C:\\\\Users\\\\me\\\\file.txt'";
			expectLossless(tok(groovy, code), code);
		});

		it('is lossless on a comment line', () => {
			const code = '    // configure the build  ';
			expectLossless(tok(groovy, code), code);
		});

		it('is lossless on a GString with nested interpolation', () => {
			const code = 'echo "Building ${env.JOB_NAME} #${env.BUILD_NUMBER}"';
			expectLossless(tok(groovy, code), code);
		});

		it('is lossless across a multi-line triple GString', () => {
			const lines = ['  def report = """', 'Status: ${status}', '"""'];
			const results = tokLines(groovy, lines);
			for (let i = 0; i < lines.length; i++) {
				expectLossless(results[i], lines[i]);
			}
		});
	});
});
