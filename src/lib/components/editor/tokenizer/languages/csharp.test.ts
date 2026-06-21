import { describe, it } from 'vitest';
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

	it('handles escape sequences inside strings', () => {
		const line = tok(cs, 'var s = "line\\n\\t\\"end\\"";');
		expectToken(line, 'string', '"line\\n\\t\\"end\\""');
	});

	it('tokenizes char literals', () => {
		expectToken(tok(cs, "char c = 'a';"), 'string', "'a'");
		expectToken(tok(cs, "char nl = '\\n';"), 'string', "'\\n'");
	});

	it('tokenizes single-line verbatim strings as string', () => {
		const line = tok(cs, 'var p = @"C:\\temp\\file.txt";');
		expectToken(line, 'string', '@"C:\\temp\\file.txt"');
	});

	it('treats doubled quote in verbatim as a literal quote', () => {
		const line = tok(cs, 'var q = @"say ""hi"" now";');
		expectToken(line, 'string', '@"say ""hi"" now"');
	});

	it('tokenizes interpolated strings as string.template', () => {
		const line = tok(cs, 'var s = $"Hello {name}!";');
		expectToken(line, 'string.template', '$"Hello {name}!"');
	});

	it('tokenizes interpolated-verbatim strings as string.template', () => {
		const line = tok(cs, 'var s = $@"path {dir}";');
		expectToken(line, 'string.template', '$@"path {dir}"');
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
	it('tokenizes decimal integers and floats', () => {
		expectTokenType(tok(cs, '42'), 'number');
		expectToken(tok(cs, '3.14'), 'number', '3.14');
	});

	it('tokenizes hex and binary literals', () => {
		expectToken(tok(cs, '0xFF_AA'), 'number', '0xFF_AA');
		expectToken(tok(cs, '0b1010_0101'), 'number', '0b1010_0101');
	});

	it('tokenizes numeric suffixes', () => {
		expectToken(tok(cs, '1.5f'), 'number', '1.5f');
		expectToken(tok(cs, '100m'), 'number', '100m');
		expectToken(tok(cs, '64L'), 'number', '64L');
		expectToken(tok(cs, '1_000_000'), 'number', '1_000_000');
	});

	it('does not let an integer swallow a trailing dot (member access on a literal)', () => {
		// Regression: `\.?` in the number regex used to absorb the dot, producing the
		// invalid float `1.` and stealing the `.` accessor from `1.ToString()`.
		const line = tok(cs, '1.ToString()');
		expectToken(line, 'number', '1');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'function.call', 'ToString');
		expectLossless(line, '1.ToString()');
	});

	it('tokenizes the range operator without mangling the operands', () => {
		// Regression: `1..5` used to tokenize as the two bogus numbers `1.` and `.5`,
		// erasing the `..` range operator entirely.
		const line = tok(cs, 'var r = 1..5;');
		expectToken(line, 'number', '1');
		expectToken(line, 'operator', '..');
		expectToken(line, 'number', '5');
		expectLossless(line, 'var r = 1..5;');
	});

	it('keeps float operands intact around a range operator', () => {
		// Regression: `1.0..2.0` used to disintegrate into `1.0 . .2 .0`.
		const line = tok(cs, 'var d = 1.0..2.0;');
		expectToken(line, 'number', '1.0');
		expectToken(line, 'operator', '..');
		expectToken(line, 'number', '2.0');
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
		expectToken(lines[0], 'string', '@"SELECT *');
		expectTokenType(lines[1], 'string');
		expectToken(lines[2], 'string', 'WHERE id = 1"');
	});

	it('threads a multi-line interpolated-verbatim string', () => {
		const lines = tokLines(cs, ['var s = $@"Hello {name},', 'welcome home";']);
		expectToken(lines[0], 'string.template', '$@"Hello {name},');
		expectToken(lines[1], 'string.template', 'welcome home"');
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
