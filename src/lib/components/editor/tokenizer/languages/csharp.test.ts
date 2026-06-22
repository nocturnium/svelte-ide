import { describe, it, expect } from 'vitest';
import { createCSharpTokenizer } from './csharp';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const cs = createCSharpTokenizer();

describe('csharp: keywords', () => {
	it('classifies definition keywords', () => {
		const line = tok(cs, 'public class Foo');
		expectToken(line, 'keyword.storage', 'public');
		expectToken(line, 'keyword.definition', 'class');
	});

	it('classifies struct, interface, enum, record as definitions', () => {
		expectToken(tok(cs, 'struct Point'), 'keyword.definition', 'struct');
		expectToken(tok(cs, 'interface IShape'), 'keyword.definition', 'interface');
		expectToken(tok(cs, 'enum Color'), 'keyword.definition', 'enum');
		expectToken(tok(cs, 'record User'), 'keyword.definition', 'record');
	});

	it('classifies storage keywords', () => {
		const line = tok(cs, 'private static readonly int x');
		expectToken(line, 'keyword.storage', 'private');
		expectToken(line, 'keyword.storage', 'static');
		expectToken(line, 'keyword.storage', 'readonly');
	});

	it('classifies control-flow keywords', () => {
		const line = tok(cs, 'if (x) return; else break;');
		expectToken(line, 'keyword.control', 'if');
		expectToken(line, 'keyword.control', 'return');
		expectToken(line, 'keyword.control', 'else');
		expectToken(line, 'keyword.control', 'break');
	});

	it('classifies foreach and async/await', () => {
		const line = tok(cs, 'async Task Run() { await foreach x; }');
		expectToken(line, 'keyword.storage', 'async');
		expectToken(line, 'keyword.control', 'await');
		expectToken(line, 'keyword.control', 'foreach');
	});

	it('classifies using as a module keyword', () => {
		expectToken(tok(cs, 'using System;'), 'keyword.module', 'using');
		expectToken(tok(cs, 'namespace App;'), 'keyword.definition', 'namespace');
	});
});

describe('csharp: strings', () => {
	it('tokenizes a basic double-quoted string', () => {
		const line = tok(cs, 'var s = "hello";');
		expectToken(line, 'string', '"hello"');
	});

	it('breaks out escape sequences inside strings as string.escape', () => {
		// The literal stays `string` but each escape is its own `string.escape` token,
		// so the theme can style \n \t \" distinctly. Still byte-for-byte lossless.
		const src = 'var s = "line\\n\\t\\"end\\"";';
		const line = tok(cs, src);
		expectToken(line, 'string', '"line');
		expectToken(line, 'string.escape', '\\n');
		expectToken(line, 'string.escape', '\\t');
		expectToken(line, 'string.escape', '\\"');
		expectLossless(line, src);
	});

	it('breaks out a unicode escape \\uXXXX as a single string.escape', () => {
		const src = 'var s = "caf\\u00e9";';
		const line = tok(cs, src);
		expectToken(line, 'string.escape', '\\u00e9');
		expectLossless(line, src);
	});

	it('tokenizes char literals, with the escape broken out', () => {
		expectToken(tok(cs, "char c = 'a';"), 'string', "'a'");
		const nl = tok(cs, "char nl = '\\n';");
		expectToken(nl, 'string.escape', '\\n');
		expectLossless(nl, "char nl = '\\n';");
		const uni = tok(cs, "char u = '\\u00e9';");
		expectToken(uni, 'string.escape', '\\u00e9');
		expectLossless(uni, "char u = '\\u00e9';");
	});

	it('tokenizes single-line verbatim strings as string', () => {
		const src = 'var p = @"C:\\temp\\file.txt";';
		const line = tok(cs, src);
		// Verbatim opener + body. Backslashes are literal in verbatim strings (no escape).
		expectToken(line, 'string', '@"');
		expectToken(line, 'string', 'C:\\temp\\file.txt');
		expectLossless(line, src);
	});

	it('treats doubled quote in verbatim as a literal quote (string.escape)', () => {
		const src = 'var q = @"say ""hi"" now";';
		const line = tok(cs, src);
		expectToken(line, 'string.escape', '""');
		expectLossless(line, src);
	});

	it('sub-tokenizes interpolated strings: literal + hole expression', () => {
		const src = 'var s = $"Hello {name}!";';
		const line = tok(cs, src);
		expectToken(line, 'string.template', '$"');
		expectToken(line, 'string', 'Hello ');
		expectToken(line, 'punctuation.brace', '{');
		expectToken(line, 'variable', 'name');
		expectToken(line, 'punctuation.brace', '}');
		expectToken(line, 'string', '!');
		expectLossless(line, src);
	});

	it('sub-tokenizes an interpolation hole expression with operators and numbers', () => {
		const src = 'var s = $"Sum = {a + b * 2}";';
		const line = tok(cs, src);
		expectToken(line, 'variable', 'a');
		expectToken(line, 'operator.arithmetic', '+');
		expectToken(line, 'operator.arithmetic', '*');
		expectToken(line, 'number.integer', '2');
		expectLossless(line, src);
	});

	it('keeps the :format / ,alignment suffix of a hole as string content', () => {
		const src = 'var s = $"{x,5:F2} items";';
		const line = tok(cs, src);
		expectToken(line, 'variable', 'x');
		expectToken(line, 'string', ',5:F2');
		expectLossless(line, src);
	});

	it('treats {{ and }} as literal braces, not interpolation', () => {
		const src = 'var s = $"Literal {{ braces }} here {x}";';
		const line = tok(cs, src);
		expectToken(line, 'string', 'Literal {{ braces }} here ');
		expectToken(line, 'variable', 'x');
		expectLossless(line, src);
	});

	it('tokenizes a method call inside an interpolation hole', () => {
		const src = 'Console.WriteLine($"Result: {Compute(n):X8}");';
		const line = tok(cs, src);
		expectToken(line, 'function.call', 'Compute');
		expectToken(line, 'variable', 'n');
		expectToken(line, 'string', ':X8');
		expectLossless(line, src);
	});

	it('sub-tokenizes interpolated-verbatim strings as string.template + hole', () => {
		const src = 'var s = $@"path {dir}";';
		const line = tok(cs, src);
		expectToken(line, 'string.template', '$@"');
		expectToken(line, 'punctuation.brace', '{');
		expectToken(line, 'variable', 'dir');
		expectLossless(line, src);
	});

	it('tokenizes a single-line raw string literal without bleeding on interior quotes', () => {
		// Regression: """She said "hi" to me.""" used to split into an empty "" string,
		// then "She said ", an exposed `hi` variable, " to me.", and another "" — with
		// the interior quotes flipping the string boundaries. It must stay string content.
		const src = 'var raw = """She said "hi" to me.""";';
		const line = tok(cs, src);
		expectToken(line, 'string', '"""');
		expectToken(line, 'string', 'She said "hi" to me.');
		expectLossless(line, src);
	});

	it('sub-tokenizes an interpolated raw string ($"""...""")', () => {
		const src = 'var s = $"""Value is {x} here.""";';
		const line = tok(cs, src);
		expectToken(line, 'string.template', '$"""');
		expectToken(line, 'punctuation.brace', '{');
		expectToken(line, 'variable', 'x');
		expectToken(line, 'string.template', '"""');
		expectLossless(line, src);
	});

	it('tokenizes a $$"""...""" raw string where {{ opens the hole', () => {
		// In a $$ raw string a hole needs TWO braces; a single { is literal content.
		const src = 'var s = $$"""Literal { and {{x}}.""";';
		const line = tok(cs, src);
		expectToken(line, 'string.template', '$$"""');
		expectToken(line, 'punctuation.brace', '{');
		expectToken(line, 'variable', 'x');
		expectLossless(line, src);
	});

	it('threads a multi-line raw string literal across lines without bleeding', () => {
		const lines = tokLines(cs, ['var json = """', '  { "key": "value" }', '  """;']);
		expectToken(lines[0], 'string', '"""');
		// The interior line is entirely string content even though it contains quotes.
		expectToken(lines[1], 'string', '  { "key": "value" }');
		expectToken(lines[2], 'string', '"""');
		expectToken(lines[2], 'punctuation.separator', ';');
		expectLossless(lines[0], 'var json = """');
		expectLossless(lines[1], '  { "key": "value" }');
		expectLossless(lines[2], '  """;');
	});
});

describe('csharp: preprocessor directives', () => {
	it('tokenizes #region as a single keyword token, not # + identifier', () => {
		// Regression: #region used to split into ["text","#"] + ["variable","region"].
		const line = tok(cs, '#region Helpers');
		expectToken(line, 'keyword', '#region Helpers');
		expectLossless(line, '#region Helpers');
	});

	it('tokenizes #if so DEBUG is not classified as a control keyword', () => {
		// Regression: #if DEBUG split as # + control keyword `if` + type `DEBUG`.
		const line = tok(cs, '#if DEBUG');
		expectToken(line, 'keyword', '#if DEBUG');
		expectLossless(line, '#if DEBUG');
	});

	it('tokenizes the nullable directive as a directive', () => {
		const line = tok(cs, '#nullable enable');
		expectToken(line, 'keyword', '#nullable enable');
		expectLossless(line, '#nullable enable');
	});

	it('tokenizes #pragma and #endregion', () => {
		expectToken(
			tok(cs, '#pragma warning disable CS0168'),
			'keyword',
			'#pragma warning disable CS0168'
		);
		expectToken(tok(cs, '#endregion'), 'keyword', '#endregion');
	});

	it('does not treat a stray # in expression position as a directive', () => {
		// `#unknown` is not a recognized directive, so the # falls through to text
		// rather than swallowing the rest of the line.
		const line = tok(cs, '#unknown');
		expectLossless(line, '#unknown');
	});
});

describe('csharp: comments', () => {
	it('tokenizes line comments', () => {
		const line = tok(cs, 'int x = 1; // assign');
		expectToken(line, 'comment.line', '// assign');
	});

	it('tokenizes XML doc comments as comment.doc', () => {
		const line = tok(cs, '/// <summary>Does a thing.</summary>');
		expectToken(line, 'comment.doc', '/// <summary>Does a thing.</summary>');
	});

	it('tokenizes single-line block comments', () => {
		const line = tok(cs, '/* inline */ var x = 1;');
		expectToken(line, 'comment.block', '/* inline */');
	});
});

describe('csharp: numbers', () => {
	it('tokenizes decimal integers and floats with precise subtypes', () => {
		expectToken(tok(cs, '42'), 'number.integer', '42');
		expectToken(tok(cs, '3.14'), 'number.float', '3.14');
		expectToken(tok(cs, '1.5e10'), 'number.float', '1.5e10');
	});

	it('tokenizes hex and binary literals with precise subtypes', () => {
		expectToken(tok(cs, '0xFF_AA'), 'number.hex', '0xFF_AA');
		expectToken(tok(cs, '0b1010_0101'), 'number.binary', '0b1010_0101');
	});

	it('tokenizes numeric suffixes (f/m => float, L/u => integer)', () => {
		expectToken(tok(cs, '1.5f'), 'number.float', '1.5f');
		expectToken(tok(cs, '100m'), 'number.float', '100m');
		expectToken(tok(cs, '64L'), 'number.integer', '64L');
		expectToken(tok(cs, '1_000_000'), 'number.integer', '1_000_000');
	});

	it('does not let an integer swallow a trailing dot (member access on a literal)', () => {
		// Regression: `\.?` in the number regex used to absorb the dot, producing the
		// invalid float `1.` and stealing the `.` accessor from `1.ToString()`.
		const line = tok(cs, '1.ToString()');
		expectToken(line, 'number.integer', '1');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'function.call', 'ToString');
		expectLossless(line, '1.ToString()');
	});

	it('tokenizes the range operator without mangling the operands', () => {
		// Regression: `1..5` used to tokenize as the two bogus numbers `1.` and `.5`,
		// erasing the `..` range operator entirely.
		const line = tok(cs, 'var r = 1..5;');
		expectToken(line, 'number.integer', '1');
		expectToken(line, 'operator', '..');
		expectToken(line, 'number.integer', '5');
		expectLossless(line, 'var r = 1..5;');
	});

	it('keeps float operands intact around a range operator', () => {
		// Regression: `1.0..2.0` used to disintegrate into `1.0 . .2 .0`.
		const line = tok(cs, 'var d = 1.0..2.0;');
		expectToken(line, 'number.float', '1.0');
		expectToken(line, 'operator', '..');
		expectToken(line, 'number.float', '2.0');
		expectLossless(line, 'var d = 1.0..2.0;');
	});
});

describe('csharp: operators', () => {
	it('classifies assignment and arithmetic operators', () => {
		const line = tok(cs, 'x += y * 2');
		expectToken(line, 'operator.assignment', '+=');
		expectToken(line, 'operator.arithmetic', '*');
	});

	it('classifies comparison and logical operators', () => {
		const line = tok(cs, 'a == b && c != d');
		expectToken(line, 'operator.comparison', '==');
		expectToken(line, 'operator.logical', '&&');
		expectToken(line, 'operator.comparison', '!=');
	});

	it('handles null-coalescing and lambda arrows', () => {
		expectToken(tok(cs, 'x ?? y'), 'operator', '??');
		expectToken(tok(cs, 'a => a + 1'), 'operator', '=>');
		expectToken(tok(cs, 'obj?.Prop'), 'operator', '?.');
	});
});

describe('csharp: identifiers and builtins', () => {
	it('classifies builtin types', () => {
		const line = tok(cs, 'int x; string s; bool b; double d;');
		expectToken(line, 'type.builtin', 'int');
		expectToken(line, 'type.builtin', 'string');
		expectToken(line, 'type.builtin', 'bool');
		expectToken(line, 'type.builtin', 'double');
	});

	it('classifies Task, List and Dictionary as builtin types', () => {
		const line = tok(cs, 'Dictionary<string, int> map;');
		expectToken(line, 'type.builtin', 'Dictionary');
		expectToken(line, 'type.builtin', 'string');
	});

	it('classifies PascalCase identifiers as type.class', () => {
		const line = tok(cs, 'Customer c = otherCustomer;');
		expectToken(line, 'type.class', 'Customer');
		expectToken(line, 'variable', 'otherCustomer');
	});

	it('classifies an identifier before ( as a function call', () => {
		const line = tok(cs, 'Console.WriteLine(value);');
		expectToken(line, 'function.call', 'WriteLine');
		expectToken(line, 'type.class', 'Console');
		expectToken(line, 'variable', 'value');
	});

	it('classifies true/false/null as constants', () => {
		const line = tok(cs, 'bool ok = true; object o = null;');
		expectToken(line, 'constant.boolean', 'true');
		expectToken(line, 'constant.null', 'null');
	});
});

describe('csharp: multi-line constructs', () => {
	it('threads a block comment across lines', () => {
		const lines = tokLines(cs, ['/* start', ' middle', ' end */ var x = 1;']);
		expectTokenType(lines[0], 'comment.block');
		expectTokenType(lines[1], 'comment.block');
		expectToken(lines[2], 'comment.block', ' end */');
		expectToken(lines[2], 'keyword', 'var');
	});

	it('threads a multi-line verbatim string across lines', () => {
		const lines = tokLines(cs, ['var sql = @"SELECT *', 'FROM Users', 'WHERE id = 1";']);
		expectToken(lines[0], 'string', '@"');
		expectToken(lines[0], 'string', 'SELECT *');
		expectTokenType(lines[1], 'string');
		expectToken(lines[2], 'string', 'WHERE id = 1');
		expectLossless(lines[0], 'var sql = @"SELECT *');
		expectLossless(lines[2], 'WHERE id = 1";');
	});

	it('threads a multi-line interpolated-verbatim string, sub-tokenizing the hole', () => {
		const lines = tokLines(cs, ['var s = $@"Hello {name},', 'welcome home";']);
		expectToken(lines[0], 'string.template', '$@"');
		expectToken(lines[0], 'punctuation.brace', '{');
		expectToken(lines[0], 'variable', 'name');
		expectToken(lines[0], 'string', ',');
		expectToken(lines[1], 'string', 'welcome home');
		expectLossless(lines[0], 'var s = $@"Hello {name},');
		expectLossless(lines[1], 'welcome home";');
	});

	it('threads an interpolation hole that itself spans lines', () => {
		// The hole `{GetName(\n user)}` opens on line 0 and closes on line 1; the
		// expression keeps tokenizing across the boundary, then the string resumes.
		const lines = tokLines(cs, ['var s = $@"Hi {GetName(', '  who)}!";']);
		expectToken(lines[0], 'punctuation.brace', '{');
		expectToken(lines[0], 'function.call', 'GetName');
		expectToken(lines[1], 'variable', 'who');
		expectToken(lines[1], 'punctuation.brace', '}');
		expectToken(lines[1], 'string', '!');
		expectLossless(lines[0], 'var s = $@"Hi {GetName(');
		expectLossless(lines[1], '  who)}!";');
	});
});

describe('csharp: realistic lines and losslessness', () => {
	it('tokenizes an indented method signature', () => {
		const src = '    public async Task<int> GetCountAsync(string key)';
		const line = tok(cs, src);
		expectToken(line, 'keyword.storage', 'public');
		expectToken(line, 'keyword.storage', 'async');
		expectToken(line, 'type.builtin', 'Task');
		expectToken(line, 'function.call', 'GetCountAsync');
		expectLossless(line, src);
	});

	it('is lossless for a string with escapes', () => {
		const src = 'logger.Log("path=\\"C:\\\\bin\\" done\\n");';
		expectLossless(tok(cs, src), src);
	});

	it('is lossless for a comment line', () => {
		const src = '        // TODO: handle the @verbatim "edge" case';
		expectLossless(tok(cs, src), src);
	});

	it('is lossless across a multi-line verbatim string', () => {
		const lines = tokLines(cs, ['  var q = @"a ""b""', '  c";']);
		expectLossless(lines[0], '  var q = @"a ""b""');
		expectLossless(lines[1], '  c";');
	});
});

describe('csharp: context classification', () => {
	it('classifies a member after an accessor as a property', () => {
		const line = tok(cs, 'var n = customer.Name;');
		expectToken(line, 'variable', 'customer');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'Name');
		expectLossless(line, 'var n = customer.Name;');
	});

	it('classifies a member after a null-conditional ?. as a property', () => {
		const line = tok(cs, 'var n = customer?.Name;');
		expectToken(line, 'operator', '?.');
		expectToken(line, 'property', 'Name');
		expectLossless(line, 'var n = customer?.Name;');
	});

	it('classifies a method member as function.call, not a property', () => {
		const line = tok(cs, 'obj.DoWork(x);');
		expectToken(line, 'function.call', 'DoWork');
		expectToken(line, 'variable', 'x');
		expectLossless(line, 'obj.DoWork(x);');
	});

	it('treats generic angle brackets as punctuation.bracket, not comparison', () => {
		const line = tok(cs, 'List<int> xs;');
		expectToken(line, 'type.builtin', 'List');
		expectToken(line, 'punctuation.bracket', '<');
		expectToken(line, 'type.builtin', 'int');
		expectToken(line, 'punctuation.bracket', '>');
		expectLossless(line, 'List<int> xs;');
	});

	it('splits the close of a nested generic (>>) into two brackets', () => {
		const line = tok(cs, 'Dictionary<string, List<int>> m;');
		const brackets = line.tokens.filter((t) => t.type === 'punctuation.bracket');
		// Two opens + two closes = four bracket tokens, none merged into >>.
		expect(brackets.map((t) => t.text)).toEqual(['<', '<', '>', '>']);
		expectLossless(line, 'Dictionary<string, List<int>> m;');
	});

	it('keeps value comparisons as operators, not generic brackets', () => {
		const line = tok(cs, 'if (a < b && c > d) { }');
		expectToken(line, 'operator.comparison', '<');
		expectToken(line, 'operator.comparison', '>');
		expectLossless(line, 'if (a < b && c > d) { }');
	});

	it('classifies a generic method invocation member as function.call with bracket args', () => {
		const line = tok(cs, 'var r = items.Cast<Item>();');
		expectToken(line, 'function.call', 'Cast');
		expectToken(line, 'punctuation.bracket', '<');
		expectToken(line, 'type.class', 'Item');
		expectToken(line, 'punctuation.bracket', '>');
		expectLossless(line, 'var r = items.Cast<Item>();');
	});

	it('classifies type-test / introspection words as keyword.operator', () => {
		const isLine = tok(cs, 'if (o is string s) { }');
		expectToken(isLine, 'keyword.operator', 'is');
		const asLine = tok(cs, 'var x = o as Foo;');
		expectToken(asLine, 'keyword.operator', 'as');
		const newLine = tok(cs, 'var x = new Foo();');
		expectToken(newLine, 'keyword.operator', 'new');
		const tofLine = tok(cs, 'var t = typeof(int);');
		expectToken(tofLine, 'keyword.operator', 'typeof');
	});

	it('treats a verbatim identifier (@class) as a variable, not the keyword', () => {
		const line = tok(cs, '@class.DoThing();');
		expectToken(line, 'variable', '@class');
		// A member followed by `(` is a call even when it comes after the accessor.
		expectToken(line, 'function.call', 'DoThing');
		expectLossless(line, '@class.DoThing();');
	});

	it('classifies a default-context word and switch arms', () => {
		const line = tok(cs, 'switch (x) { default: break; }');
		expectToken(line, 'keyword.control', 'switch');
		expectToken(line, 'keyword.control', 'default');
		expectToken(line, 'keyword.control', 'break');
		expectLossless(line, 'switch (x) { default: break; }');
	});
});
