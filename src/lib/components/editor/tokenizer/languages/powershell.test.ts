import { describe, it } from 'vitest';
import { createPowerShellTokenizer } from './powershell';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

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
	});

	describe('strings', () => {
		it('detects single-quoted literal strings', () => {
			const line = tok(ps, "$x = 'hello world'");
			expectToken(line, 'string', "'hello world'");
		});

		it('detects double-quoted expandable strings as templates', () => {
			const line = tok(ps, '$x = "Hello $name"');
			expectToken(line, 'string.template', '"Hello $name"');
		});

		it('handles doubled-quote escapes in literal strings', () => {
			const line = tok(ps, "$x = 'it''s here'");
			expectToken(line, 'string', "'it''s here'");
		});

		it('handles backtick escapes in expandable strings', () => {
			const line = tok(ps, '$x = "tab`tend"');
			expectToken(line, 'string.template', '"tab`tend"');
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
		it('detects decimal integers', () => {
			const line = tok(ps, '$n = 42');
			expectToken(line, 'number', '42');
		});

		it('detects hexadecimal numbers', () => {
			const line = tok(ps, '$n = 0xFF');
			expectToken(line, 'number', '0xFF');
		});

		it('detects floats', () => {
			const line = tok(ps, '$n = 3.14');
			expectToken(line, 'number', '3.14');
		});

		it('detects size-suffixed numbers', () => {
			const line = tok(ps, '$size = 5MB');
			expectToken(line, 'number', '5MB');
		});
	});

	describe('range operator', () => {
		it('does not let a number swallow the range operator dots', () => {
			// Regression: `1..10` previously tokenized as `1.` + `.10` (two malformed
			// numbers) because the float pattern ate the first dot of `..`.
			const line = tok(ps, '1..10');
			expectToken(line, 'number', '1');
			expectToken(line, 'operator', '..');
			expectToken(line, 'number', '10');
			expectLossless(line, '1..10');
		});

		it('handles a range inside a pipeline expression', () => {
			const line = tok(ps, '1..5 | ForEach-Object { $_ }');
			expectToken(line, 'number', '1');
			expectToken(line, 'operator', '..');
			expectToken(line, 'number', '5');
			expectToken(line, 'function.call', 'ForEach-Object');
			expectLossless(line, '1..5 | ForEach-Object { $_ }');
		});

		it('keeps a range adjacent to a parenthesized bound intact', () => {
			const line = tok(ps, '0..($n - 1)');
			expectToken(line, 'number', '0');
			expectToken(line, 'operator', '..');
			expectToken(line, 'variable', '$n');
			expectLossless(line, '0..($n - 1)');
		});

		it('still tokenizes ordinary floats and size suffixes correctly', () => {
			expectToken(tok(ps, '$x = 3.14'), 'number', '3.14');
			expectToken(tok(ps, '$x = .5'), 'number', '.5');
			expectToken(tok(ps, '$x = 1.5e3'), 'number', '1.5e3');
			expectToken(tok(ps, '$x = 5MB'), 'number', '5MB');
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
		it('detects named comparison operators', () => {
			const line = tok(ps, 'if ($a -eq $b) { }');
			expectToken(line, 'operator.logical', '-eq');
		});

		it('detects -match and -like operators', () => {
			const line = tok(ps, '$s -match $p; $s -like $g');
			expectToken(line, 'operator.logical', '-match');
			expectToken(line, 'operator.logical', '-like');
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
			expectToken(line, 'operator.logical', '-gt');
			expectToken(line, 'number', '1KB');
		});

		it('tokenizes a function definition header', () => {
			const line = tok(ps, 'function Test-Connection { param($Host) }');
			expectToken(line, 'keyword.definition', 'function');
			expectToken(line, 'function.call', 'Test-Connection');
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
