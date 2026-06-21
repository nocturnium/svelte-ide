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

		it('tokenizes double-quoted GStrings as templates', () => {
			const line = tok(groovy, 'def s = "Hello, $name"');
			expectToken(line, 'string.template', '"Hello, $name"');
		});

		it('tokenizes GString with ${expr} interpolation as one template token', () => {
			const line = tok(groovy, 'def s = "total: ${a + b}"');
			expectToken(line, 'string.template', '"total: ${a + b}"');
		});

		it('handles escaped quotes inside strings', () => {
			const line = tok(groovy, "def s = 'it\\'s ok'");
			expectToken(line, 'string', "'it\\'s ok'");
		});

		it('tokenizes a slashy regex after assignment', () => {
			const line = tok(groovy, 'def p = /\\d+/');
			expectToken(line, 'string.regex', '/\\d+/');
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
			expectToken(line, 'string.regex', '/\\d+/');
			expectLossless(line, 'if (s =~ /\\d+/) {}');
		});

		it('tokenizes a slashy regex after the match operator ==~', () => {
			const line = tok(groovy, 'def m = s ==~ /^\\d+$/');
			expectToken(line, 'string.regex', '/^\\d+$/');
			expectLossless(line, 'def m = s ==~ /^\\d+$/');
		});

		it('tokenizes a slashy regex after the pattern operator ~', () => {
			const line = tok(groovy, 'def p = ~/[a-z]+/');
			expectToken(line, 'operator', '~');
			expectToken(line, 'string.regex', '/[a-z]+/');
			expectLossless(line, 'def p = ~/[a-z]+/');
		});

		it('does not let a nested double-quote inside ${} interpolation end the GString early', () => {
			// Regression: a `"` inside `${foo("...")}` previously terminated the
			// GString early, leaking the interpolation body out as code and
			// reopening a second string token. Brace-aware scanning keeps it whole.
			const code = 'def x = "nested ${foo("${bar}")} end"';
			const line = tok(groovy, code);
			expectToken(line, 'string.template', '"nested ${foo("${bar}")} end"');
			expectLossless(line, code);
		});

		it('keeps a nested closure/map inside ${} interpolation within one GString token', () => {
			const code = 'def x = "deep ${ [a:1, b:[2,3]].collect { it } }"';
			const line = tok(groovy, code);
			expectToken(line, 'string.template', '"deep ${ [a:1, b:[2,3]].collect { it } }"');
			expectLossless(line, code);
		});

		it('tokenizes a single-line dollar-slashy string', () => {
			// Regression: `$/ ... /$` was previously shredded into `$`, `/`,
			// identifiers and a division operator. It is one string token, and
			// `$$` / `$/` inside are escapes that must not terminate it.
			const code = 'def q = $/ a $$ b /$';
			const line = tok(groovy, code);
			expectToken(line, 'string.regex', '$/ a $$ b /$');
			expectLossless(line, code);
		});

		it('does not terminate a dollar-slashy string at an escaped $/', () => {
			const code = 'def p = $/path $/ literal slash/$';
			const line = tok(groovy, code);
			expectToken(line, 'string.regex', '$/path $/ literal slash/$');
			expectLossless(line, code);
		});

		it('threads a multi-line dollar-slashy string across lines', () => {
			const lines = tokLines(groovy, ['def q = $/', 'line two $x', 'end /$ + foo()']);
			expectTokenType(lines[0], 'string.regex');
			expectTokenType(lines[1], 'string.regex');
			expectToken(lines[2], 'string.regex', 'end /$');
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
		it('tokenizes decimal integers', () => {
			expectToken(tok(groovy, 'def n = 42'), 'number', '42');
		});

		it('tokenizes hex literals', () => {
			expectToken(tok(groovy, 'def h = 0xFF'), 'number', '0xFF');
		});

		it('tokenizes underscored numbers', () => {
			expectToken(tok(groovy, 'def big = 1_000_000'), 'number', '1_000_000');
		});

		it('tokenizes floats and suffixed numbers', () => {
			expectToken(tok(groovy, 'def f = 3.14'), 'number', '3.14');
			expectToken(tok(groovy, 'def g = 100G'), 'number', '100G');
			expectToken(tok(groovy, 'def l = 99L'), 'number', '99L');
		});

		it('does not swallow the range operator into a number', () => {
			// Regression: `0..5` previously tokenized as number `0.` + number `.5`,
			// erasing the `..` range operator. The decimal point must only be
			// consumed when a digit follows it.
			const line = tok(groovy, 'for (i in 0..5) {}');
			expectToken(line, 'number', '0');
			expectToken(line, 'operator', '..');
			expectToken(line, 'number', '5');
			expectLossless(line, 'for (i in 0..5) {}');
		});

		it('keeps the exclusive range operator distinct from numbers', () => {
			const line = tok(groovy, 'def r = 1..<10');
			expectToken(line, 'number', '1');
			expectToken(line, 'operator', '..<');
			expectToken(line, 'number', '10');
			expectLossless(line, 'def r = 1..<10');
		});

		it('still tokenizes real floats with a fractional part', () => {
			expectToken(tok(groovy, 'def d = 2.0'), 'number', '2.0');
			expectToken(tok(groovy, 'def x = 0.5'), 'number', '0.5');
		});

		it('keeps an integer suffix on hex and binary literals', () => {
			// Regression: `0xFFi` previously tokenized as number `0xFF` + variable
			// `i`, dropping the valid Groovy `i`/`I` integer suffix from hex/binary
			// literals (assert 0xFFi.class == Integer per the Groovy spec).
			expectToken(tok(groovy, 'def e = 0xFFi'), 'number', '0xFFi');
			expectToken(tok(groovy, 'def l = 0b1111L'), 'number', '0b1111L');
			expectToken(tok(groovy, 'def g = 0xFFG'), 'number', '0xFFG');
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
