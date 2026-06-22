import { describe, it, expect } from 'vitest';
import { createPowerShellTokenizer } from './powershell';
import {
	tok,
	tokLines,
	findTokens,
	expectToken,
	expectTokenType,
	expectLossless
} from '../test-helpers';

const ps = createPowerShellTokenizer();

describe('PowerShell tokenizer', () => {
	describe('keywords', () => {
		it('detects control-flow keywords', () => {
			const line = tok(ps, 'if ($x) { return } else { break }');
			expectToken(line, 'keyword.control', 'if');
			expectToken(line, 'keyword.control', 'return');
			expectToken(line, 'keyword.control', 'else');
			expectToken(line, 'keyword.control', 'break');
		});

		it('detects foreach / while / try-catch-finally', () => {
			const line = tok(
				ps,
				'foreach ($i in $list) { while ($true) { try {} catch {} finally {} } }'
			);
			expectToken(line, 'keyword.control', 'foreach');
			expectToken(line, 'keyword.control', 'while');
			expectToken(line, 'keyword.control', 'try');
			expectToken(line, 'keyword.control', 'catch');
			expectToken(line, 'keyword.control', 'finally');
		});

		it('is case-insensitive for keywords', () => {
			const line = tok(ps, 'IF ($a) { RETURN }');
			expectToken(line, 'keyword.control', 'IF');
			expectToken(line, 'keyword.control', 'RETURN');
		});

		it('detects definition keywords', () => {
			const line = tok(ps, 'function Get-Thing { } class Widget { } enum Color { }');
			expectToken(line, 'keyword.definition', 'function');
			expectToken(line, 'keyword.definition', 'class');
			expectToken(line, 'keyword.definition', 'enum');
		});

		it('detects block / param keywords', () => {
			const line = tok(ps, 'param begin process end');
			expectToken(line, 'keyword', 'param');
			expectToken(line, 'keyword', 'begin');
			expectToken(line, 'keyword', 'process');
			expectToken(line, 'keyword', 'end');
		});
	});

	describe('variables', () => {
		it('detects plain variables', () => {
			const line = tok(ps, '$count = 5');
			expectToken(line, 'variable', '$count');
		});

		it('detects $true and $false as boolean constants', () => {
			const line = tok(ps, '$flag = $true; $other = $false');
			expectToken(line, 'constant.boolean', '$true');
			expectToken(line, 'constant.boolean', '$false');
		});

		it('detects $null as a null constant', () => {
			const line = tok(ps, '$value = $null');
			expectToken(line, 'constant.null', '$null');
		});

		it('detects the $_ automatic variable', () => {
			const line = tok(ps, '$_ | Write-Output');
			expectToken(line, 'variable', '$_');
		});

		it('detects braced variables', () => {
			const line = tok(ps, '${my var} = 1');
			expectToken(line, 'variable', '${my var}');
		});

		it('detects scoped variables', () => {
			const line = tok(ps, '$global:Config = 1');
			expectToken(line, 'variable', '$global:Config');
		});

		it('treats a splatted @name as a single variable reference', () => {
			// Regression: `@splat` previously tokenized as `@` punctuation + the
			// identifier `splat`, losing the splat sigil. It is one variable ref.
			const line = tok(ps, 'Get-ChildItem @splat');
			expectToken(line, 'variable', '@splat');
			expectLossless(line, 'Get-ChildItem @splat');
		});

		it('still tokenizes @{ and @( as hashtable / array literals, not splats', () => {
			const hash = tok(ps, '$h = @{ A = 1 }');
			expectToken(hash, 'punctuation', '@');
			expectToken(hash, 'punctuation.brace', '{');
			expectLossless(hash, '$h = @{ A = 1 }');
			const arr = tok(ps, '$a = @(1, 2)');
			expectToken(arr, 'punctuation', '@');
			expectToken(arr, 'punctuation.paren', '(');
		});
	});

	describe('strings', () => {
		it('detects single-quoted literal strings', () => {
			const line = tok(ps, "$x = 'hello world'");
			expectToken(line, 'string', "'hello world'");
		});

		it('detects double-quoted expandable strings as templates and sub-tokenizes interpolation', () => {
			const line = tok(ps, '$x = "Hello $name"');
			// The literal run, the quotes, and the embedded variable are now distinct.
			expectToken(line, 'string.template', '"');
			expectToken(line, 'string.template', 'Hello ');
			expectToken(line, 'variable', '$name');
			expectLossless(line, '$x = "Hello $name"');
		});

		it('sub-tokenizes a $(...) subexpression inside an expandable string', () => {
			const line = tok(ps, '"Result: $($a + $b)"');
			expectToken(line, 'string.template', '$(');
			expectToken(line, 'variable', '$a');
			expectToken(line, 'operator.arithmetic', '+');
			expectToken(line, 'variable', '$b');
			expectToken(line, 'string.template', ')');
			expectLossless(line, '"Result: $($a + $b)"');
		});

		it('sub-tokenizes a method-call subexpression with a nested string', () => {
			const line = tok(ps, '"Now: $($d.ToString("o"))"');
			expectToken(line, 'string.template', '$(');
			expectToken(line, 'variable', '$d');
			expectToken(line, 'function.call', 'ToString');
			expectLossless(line, '"Now: $($d.ToString("o"))"');
		});

		it('sub-tokenizes a NESTED $(...) subexpression without mangling the inner $(', () => {
			// Regression: a `$(` nested inside another `$(...)` was tokenized by the
			// inner lexer as a lone `$` variable + a `(` paren, because `$(` was not
			// recognized as the subexpression operator outside the string-body scanner.
			// The inner `$(...)` must stay a single subexpression-operator token and
			// the bogus lone `$` must NOT appear.
			const line = tok(ps, '"deep $($a + $($b * 2))"');
			expectToken(line, 'string.template', '$('); // the outer (string-body) delimiter
			expectToken(line, 'operator', '$('); // the nested subexpression operator
			expectToken(line, 'variable', '$a');
			expectToken(line, 'variable', '$b');
			expectToken(line, 'number.integer', '2');
			// No bogus standalone `$` token leaked from the split.
			expect(findTokens(line, 'variable').some((t) => t.text === '$')).toBe(false);
			expectLossless(line, '"deep $($a + $($b * 2))"');
		});

		it('treats a top-level $(...) subexpression operator as a single operator token', () => {
			// Regression: `$(Get-Date)` in code context split `$(` into a lone `$`
			// variable + `(` paren. `$(` is the subexpression operator and must be one
			// token; the matching `)` is a normal paren.
			const line = tok(ps, '$x = $(Get-Date)');
			expectToken(line, 'operator', '$(');
			expectToken(line, 'function.call', 'Get-Date');
			expectToken(line, 'punctuation.paren', ')');
			expect(findTokens(line, 'variable').some((t) => t.text === '$')).toBe(false);
			expectLossless(line, '$x = $(Get-Date)');
		});

		it('still emits a lone $ as a variable when not the subexpression operator', () => {
			// Guard the fix: `$( ` is special, but a bare `$` (e.g. at end of input)
			// must still tokenize as a variable, not get dropped.
			const line = tok(ps, 'echo $');
			expectToken(line, 'variable', '$');
			expectLossless(line, 'echo $');
		});

		it('emits a braced variable inside an expandable string', () => {
			const line = tok(ps, '"value=${my var}"');
			expectToken(line, 'variable', '${my var}');
			expectLossless(line, '"value=${my var}"');
		});

		it('classifies $true / $null inside an expandable string', () => {
			const line = tok(ps, '"flag=$true null=$null"');
			expectToken(line, 'constant.boolean', '$true');
			expectToken(line, 'constant.null', '$null');
			expectLossless(line, '"flag=$true null=$null"');
		});

		it('handles doubled-quote escapes in literal strings', () => {
			const line = tok(ps, "$x = 'it''s here'");
			expectToken(line, 'string', "'it''s here'");
		});

		it('emits backtick escapes inside expandable strings as string.escape', () => {
			const line = tok(ps, '$x = "tab`tend"');
			expectToken(line, 'string.escape', '`t');
			expectToken(line, 'string.template', 'tab');
			expectToken(line, 'string.template', 'end');
			expectLossless(line, '$x = "tab`tend"');
		});

		it('emits `n / `" / a unicode escape distinctly', () => {
			const line = tok(ps, '"line1`nq=`"x`" `u{1F600}"');
			expectToken(line, 'string.escape', '`n');
			expectToken(line, 'string.escape', '`"');
			expectToken(line, 'string.escape', '`u{1F600}');
			expectLossless(line, '"line1`nq=`"x`" `u{1F600}"');
		});

		it('emits a doubled-quote escape inside an expandable string', () => {
			const line = tok(ps, '"she said ""hi"" now"');
			expectToken(line, 'string.escape', '""');
			expectLossless(line, '"she said ""hi"" now"');
		});
	});

	describe('comments', () => {
		it('detects line comments', () => {
			const line = tok(ps, '# this is a comment');
			expectToken(line, 'comment.line', '# this is a comment');
		});

		it('detects single-line block comments', () => {
			const line = tok(ps, '<# inline block #>');
			expectToken(line, 'comment.block', '<# inline block #>');
		});
	});

	describe('numbers', () => {
		it('detects decimal integers as number.integer', () => {
			const line = tok(ps, '$n = 42');
			expectToken(line, 'number.integer', '42');
		});

		it('detects hexadecimal numbers as number.hex', () => {
			const line = tok(ps, '$n = 0xFF');
			expectToken(line, 'number.hex', '0xFF');
		});

		it('detects floats as number.float', () => {
			const line = tok(ps, '$n = 3.14');
			expectToken(line, 'number.float', '3.14');
		});

		it('detects size-suffixed numbers as number.integer', () => {
			const line = tok(ps, '$size = 5MB');
			expectToken(line, 'number.integer', '5MB');
		});

		it('detects binary literals as a single number.binary', () => {
			// Regression: `0b1010` previously tokenized as `0` + the identifier
			// `b1010`, because the number pattern only understood the `0x` prefix.
			const line = tok(ps, '$mask = 0b1010');
			expectToken(line, 'number.binary', '0b1010');
			expectLossless(line, '$mask = 0b1010');
		});

		it('keeps numeric type suffixes attached to the number', () => {
			// Regression: `100L`, `1.5d`, `10ul`, `0xFFL` previously split the type
			// suffix off as a bogus trailing identifier.
			expectToken(tok(ps, '$l = 100L'), 'number.integer', '100L');
			expectToken(tok(ps, '$d = 1.5d'), 'number.float', '1.5d');
			expectToken(tok(ps, '$u = 10ul'), 'number.integer', '10ul');
			expectToken(tok(ps, '$h = 0xFFL'), 'number.hex', '0xFFL');
			expectLossless(tok(ps, '$l = 100L'), '$l = 100L');
		});

		it('does not break ordinary numbers or the range operator', () => {
			expectToken(tok(ps, '$x = 5MB'), 'number.integer', '5MB');
			expectToken(tok(ps, '$x = 1kb'), 'number.integer', '1kb');
			const range = tok(ps, '1..10');
			expectToken(range, 'number.integer', '1');
			expectToken(range, 'operator', '..');
			expectToken(range, 'number.integer', '10');
		});
	});

	describe('range operator', () => {
		it('does not let a number swallow the range operator dots', () => {
			// Regression: `1..10` previously tokenized as `1.` + `.10` (two malformed
			// numbers) because the float pattern ate the first dot of `..`.
			const line = tok(ps, '1..10');
			expectToken(line, 'number.integer', '1');
			expectToken(line, 'operator', '..');
			expectToken(line, 'number.integer', '10');
			expectLossless(line, '1..10');
		});

		it('handles a range inside a pipeline expression', () => {
			const line = tok(ps, '1..5 | ForEach-Object { $_ }');
			expectToken(line, 'number.integer', '1');
			expectToken(line, 'operator', '..');
			expectToken(line, 'number.integer', '5');
			expectToken(line, 'function.call', 'ForEach-Object');
			expectLossless(line, '1..5 | ForEach-Object { $_ }');
		});

		it('keeps a range adjacent to a parenthesized bound intact', () => {
			const line = tok(ps, '0..($n - 1)');
			expectToken(line, 'number.integer', '0');
			expectToken(line, 'operator', '..');
			expectToken(line, 'variable', '$n');
			expectLossless(line, '0..($n - 1)');
		});

		it('still tokenizes ordinary floats and size suffixes correctly', () => {
			expectToken(tok(ps, '$x = 3.14'), 'number.float', '3.14');
			expectToken(tok(ps, '$x = .5'), 'number.float', '.5');
			expectToken(tok(ps, '$x = 1.5e3'), 'number.float', '1.5e3');
			expectToken(tok(ps, '$x = 5MB'), 'number.integer', '5MB');
		});
	});

	describe('member-access operator', () => {
		it('tokenizes the static member operator :: as a plain operator', () => {
			// Regression: `::` was previously classified as operator.arithmetic.
			const line = tok(ps, '[System.Math]::Pi');
			expectToken(line, 'operator', '::');
			expectLossless(line, '[System.Math]::Pi');
		});
	});

	describe('operators and parameters', () => {
		it('detects named comparison operators as operator.comparison', () => {
			const line = tok(ps, 'if ($a -eq $b) { }');
			expectToken(line, 'operator.comparison', '-eq');
		});

		it('detects -match and -like as comparison operators', () => {
			const line = tok(ps, '$s -match $p; $s -like $g');
			expectToken(line, 'operator.comparison', '-match');
			expectToken(line, 'operator.comparison', '-like');
		});

		it('classifies -and / -or / -not as logical and -band / -shl as bitwise', () => {
			const line = tok(ps, '$a -and $b -or -not $c');
			expectToken(line, 'operator.logical', '-and');
			expectToken(line, 'operator.logical', '-or');
			expectToken(line, 'operator.logical', '-not');
			const bits = tok(ps, '$x -band $y -shl 2');
			expectToken(bits, 'operator', '-band');
			expectToken(bits, 'operator', '-shl');
		});

		it('distinguishes -ParameterName flags from operators', () => {
			const line = tok(ps, 'Get-ChildItem -Path C:\\ -Recurse');
			expectToken(line, 'variable.parameter', '-Path');
			expectToken(line, 'variable.parameter', '-Recurse');
		});

		it('detects the pipeline operator', () => {
			const line = tok(ps, 'Get-Process | Sort-Object');
			expectToken(line, 'operator.logical', '|');
		});

		it('detects assignment', () => {
			const line = tok(ps, '$x = 1');
			expectToken(line, 'operator.assignment', '=');
		});
	});

	describe('identifiers and cmdlets', () => {
		it('detects Verb-Noun cmdlets as function calls', () => {
			const line = tok(ps, 'Get-ChildItem; Write-Host; Set-Item');
			expectToken(line, 'function.call', 'Get-ChildItem');
			expectToken(line, 'function.call', 'Write-Host');
			expectToken(line, 'function.call', 'Set-Item');
		});

		it('detects function calls with parentheses', () => {
			const line = tok(ps, 'DoWork($arg)');
			expectToken(line, 'function.call', 'DoWork');
		});

		it('treats bare identifiers as variables', () => {
			const line = tok(ps, 'foo bar baz');
			expectToken(line, 'variable', 'foo');
		});
	});

	describe('type literals', () => {
		it('classifies a builtin accelerator [int] with bracket punctuation', () => {
			const line = tok(ps, '[int]$n = 5');
			expectToken(line, 'punctuation.bracket', '[');
			expectToken(line, 'type.builtin', 'int');
			expectToken(line, 'punctuation.bracket', ']');
			expectToken(line, 'variable', '$n');
			expectLossless(line, '[int]$n = 5');
		});

		it('splits a namespaced type [System.Math] into namespace + class', () => {
			const line = tok(ps, '[System.Math]::Pi');
			expectToken(line, 'type.namespace', 'System');
			expectToken(line, 'punctuation.accessor', '.');
			expectToken(line, 'type.class', 'Math');
			expectToken(line, 'operator', '::');
			expectToken(line, 'property', 'Pi');
			expectLossless(line, '[System.Math]::Pi');
		});

		it('handles an array type [string[]] losslessly', () => {
			const line = tok(ps, '[string[]]$arr = @()');
			expectToken(line, 'type.builtin', 'string');
			expectLossless(line, '[string[]]$arr = @()');
		});

		it('handles a nested generic type argument', () => {
			const line = tok(ps, '[System.Collections.Generic.List[int]]::new()');
			expectToken(line, 'type.namespace', 'Generic');
			expectToken(line, 'type.class', 'List');
			expectToken(line, 'type.builtin', 'int');
			expectToken(line, 'function.call', 'new');
			expectLossless(line, '[System.Collections.Generic.List[int]]::new()');
		});
	});

	describe('member access', () => {
		it('classifies a property after a dot accessor', () => {
			const line = tok(ps, '$_.Length');
			expectToken(line, 'variable', '$_');
			expectToken(line, 'punctuation.accessor', '.');
			expectToken(line, 'property', 'Length');
			expectLossless(line, '$_.Length');
		});

		it('classifies a method call after a dot accessor', () => {
			const line = tok(ps, '$obj.GetType()');
			expectToken(line, 'function.call', 'GetType');
			expectLossless(line, '$obj.GetType()');
		});

		it('classifies a property after a null-conditional accessor', () => {
			const line = tok(ps, '$str?.Length');
			expectToken(line, 'operator', '?.');
			expectToken(line, 'property', 'Length');
			expectLossless(line, '$str?.Length');
		});

		it('classifies a static method after ::', () => {
			const line = tok(ps, '[Math]::Max(1, 2)');
			expectToken(line, 'type.class', 'Math');
			expectToken(line, 'operator', '::');
			expectToken(line, 'function.call', 'Max');
			expectLossless(line, '[Math]::Max(1, 2)');
		});
	});

	describe('redirection operators', () => {
		it('treats 2>&1 as a single operator', () => {
			const line = tok(ps, 'cmd 2>&1');
			expectToken(line, 'operator', '2>&1');
			expectLossless(line, 'cmd 2>&1');
		});

		it('treats *> and 2>> as single operators', () => {
			expectToken(tok(ps, 'cmd *> out.txt'), 'operator', '*>');
			expectToken(tok(ps, 'cmd 2>> err.txt'), 'operator', '2>>');
		});
	});

	describe('definition names', () => {
		it('classifies a function name as function.definition', () => {
			const line = tok(ps, 'function Get-Thing { }');
			expectToken(line, 'function.definition', 'Get-Thing');
		});

		it('classifies a class / enum name as type.class', () => {
			const cls = tok(ps, 'class Widget { }');
			expectToken(cls, 'type.class', 'Widget');
			const en = tok(ps, 'enum Color { Red }');
			expectToken(en, 'type.class', 'Color');
		});
	});

	describe('ternary and null operators', () => {
		it('classifies the PowerShell 7 ternary operator', () => {
			const line = tok(ps, '$r = $a ? $b : $c');
			expectToken(line, 'operator', '?');
			expectToken(line, 'operator', ':');
			expectLossless(line, '$r = $a ? $b : $c');
		});

		it('classifies null-coalescing and null-conditional operators', () => {
			const coalesce = tok(ps, '$v = $a ?? $b');
			expectToken(coalesce, 'operator', '??');
			const assign = tok(ps, '$a ??= $b');
			expectToken(assign, 'operator.assignment', '??=');
			const cond = tok(ps, '$len = $str?.Length');
			expectToken(cond, 'operator', '?.');
			expectLossless(cond, '$len = $str?.Length');
		});
	});

	describe('multi-line constructs', () => {
		it('threads block comments across lines', () => {
			const lines = tokLines(ps, ['<#', 'multi line', 'comment #>', '$after = 1']);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
			expectTokenType(lines[2], 'comment.block');
			expectToken(lines[3], 'variable', '$after');
		});

		it('threads expandable here-strings across lines', () => {
			const lines = tokLines(ps, ['$text = @"', 'line one $name', 'line two', '"@', '$done = 1']);
			expectTokenType(lines[1], 'string.template');
			expectTokenType(lines[2], 'string.template');
			expectTokenType(lines[3], 'string.template');
			expectToken(lines[4], 'variable', '$done');
		});

		it('sub-tokenizes interpolation on here-string continuation lines', () => {
			const lines = tokLines(ps, ['$t = @"', 'Hi $name total $($a + $b)', '"@', '$end = 1']);
			// The embedded variable and subexpression are tokenized even mid here-string.
			expectToken(lines[1], 'variable', '$name');
			expectToken(lines[1], 'string.template', '$(');
			expectToken(lines[1], 'variable', '$a');
			expectToken(lines[1], 'operator.arithmetic', '+');
			lines.forEach((l, i) =>
				expectLossless(l, ['$t = @"', 'Hi $name total $($a + $b)', '"@', '$end = 1'][i])
			);
		});

		it('threads an unterminated double-quoted string across lines with interpolation', () => {
			const src = ['$x = "start $a', 'middle $b', 'end"', '$y = 2'];
			const lines = tokLines(ps, src);
			expectToken(lines[0], 'variable', '$a');
			expectToken(lines[1], 'string.template', 'middle ');
			expectToken(lines[1], 'variable', '$b');
			expectToken(lines[2], 'string.template', '"');
			expectToken(lines[3], 'variable', '$y');
			lines.forEach((l, i) => expectLossless(l, src[i]));
		});

		it('threads literal here-strings across lines', () => {
			const lines = tokLines(ps, ["$text = @'", 'raw $notvar', "'@", '$done = 1']);
			expectTokenType(lines[1], 'string');
			expectTokenType(lines[2], 'string');
			expectToken(lines[3], 'variable', '$done');
		});
	});

	describe('realistic lines', () => {
		it('tokenizes a piped cmdlet expression', () => {
			const line = tok(ps, 'Get-ChildItem -Path . | Where-Object { $_.Length -gt 1KB }');
			expectToken(line, 'function.call', 'Get-ChildItem');
			expectToken(line, 'variable.parameter', '-Path');
			expectToken(line, 'operator.logical', '|');
			expectToken(line, 'function.call', 'Where-Object');
			expectToken(line, 'variable', '$_');
			expectToken(line, 'property', 'Length');
			expectToken(line, 'operator.comparison', '-gt');
			expectToken(line, 'number.integer', '1KB');
		});

		it('tokenizes a function definition header', () => {
			const line = tok(ps, 'function Test-Connection { param($Host) }');
			expectToken(line, 'keyword.definition', 'function');
			// The name right after `function` is now the definition site, not a call.
			expectToken(line, 'function.definition', 'Test-Connection');
			expectToken(line, 'keyword', 'param');
			expectToken(line, 'variable', '$Host');
		});
	});

	describe('lossless reconstruction', () => {
		it('is lossless for an indented assignment', () => {
			const code = '    $result = Get-Item -Path $home';
			expectLossless(tok(ps, code), code);
		});

		it('is lossless for a string with escapes', () => {
			const code = '$msg = "Path is `"$dir`" now"';
			expectLossless(tok(ps, code), code);
		});

		it('is lossless for a comment line', () => {
			const code = '  # configure the module manifest';
			expectLossless(tok(ps, code), code);
		});

		it('is lossless across an expandable here-string', () => {
			const lines = ['$banner = @"', '  Welcome, $user!', '  $(Get-Date)', '"@'];
			const results = tokLines(ps, lines);
			results.forEach((line, i) => expectLossless(line, lines[i]));
		});
	});
});
