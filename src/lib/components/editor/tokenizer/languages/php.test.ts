import { describe, it } from 'vitest';
import { createPhpTokenizer } from './php';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const php = createPhpTokenizer();

describe('PHP tokenizer', () => {
	describe('tags', () => {
		it('recognizes the <?php open tag', () => {
			const line = tok(php, '<?php echo $x;');
			expectToken(line, 'keyword', '<?php');
		});

		it('recognizes the <?= short echo tag', () => {
			const line = tok(php, '<?= $name ?>');
			expectToken(line, 'keyword', '<?=');
			expectToken(line, 'keyword', '?>');
		});

		it('recognizes the ?> close tag', () => {
			const line = tok(php, 'return; ?>');
			expectToken(line, 'keyword', '?>');
		});
	});

	describe('keywords', () => {
		it('detects definition keywords', () => {
			const line = tok(php, 'function foo() {}');
			expectToken(line, 'keyword.definition', 'function');
		});

		it('detects class/interface/trait/enum as definitions', () => {
			expectToken(tok(php, 'class Foo {}'), 'keyword.definition', 'class');
			expectToken(tok(php, 'interface Bar {}'), 'keyword.definition', 'interface');
			expectToken(tok(php, 'trait Baz {}'), 'keyword.definition', 'trait');
			expectToken(tok(php, 'enum Suit {}'), 'keyword.definition', 'enum');
		});

		it('detects storage / modifier keywords', () => {
			const line = tok(php, 'public static final readonly const');
			expectToken(line, 'keyword.storage', 'public');
			expectToken(line, 'keyword.storage', 'static');
			expectToken(line, 'keyword.storage', 'final');
			expectToken(line, 'keyword.storage', 'readonly');
			expectToken(line, 'keyword.storage', 'const');
		});

		it('detects control-flow keywords', () => {
			const line = tok(php, 'foreach ($items as $i) { continue; }');
			expectToken(line, 'keyword.control', 'foreach');
			expectToken(line, 'keyword.control', 'continue');
		});

		it('detects match as a control keyword', () => {
			const line = tok(php, 'return match ($x) { 1 => true };');
			expectToken(line, 'keyword.control', 'match');
			expectToken(line, 'keyword.control', 'return');
		});

		it('detects module keywords', () => {
			expectToken(tok(php, 'use App\\Models\\User;'), 'keyword.module', 'use');
			expectToken(tok(php, 'namespace App\\Http;'), 'keyword.module', 'namespace');
			expectToken(tok(php, 'require_once "db.php";'), 'keyword.module', 'require_once');
		});

		it('detects other keywords (new, echo, extends)', () => {
			const line = tok(php, 'class A extends B {}');
			expectToken(line, 'keyword', 'extends');
			expectToken(tok(php, 'new User();'), 'keyword', 'new');
			expectToken(tok(php, 'echo $msg;'), 'keyword', 'echo');
		});
	});

	describe('variables', () => {
		it('tokenizes $variable including the sigil', () => {
			const line = tok(php, '$count = 0;');
			expectToken(line, 'variable', '$count');
		});

		it('tokenizes $this', () => {
			const line = tok(php, '$this->value = 1;');
			expectToken(line, 'variable', '$this');
		});
	});

	describe('constants', () => {
		it('detects boolean constants case-insensitively', () => {
			expectToken(tok(php, '$a = true;'), 'constant.boolean', 'true');
			expectToken(tok(php, '$a = FALSE;'), 'constant.boolean', 'FALSE');
		});

		it('detects null constant', () => {
			expectToken(tok(php, '$a = null;'), 'constant.null', 'null');
			expectToken(tok(php, '$a = NULL;'), 'constant.null', 'NULL');
		});

		it('treats ALL_CAPS identifiers as constants', () => {
			const line = tok(php, 'echo MAX_SIZE;');
			expectToken(line, 'constant', 'MAX_SIZE');
		});
	});

	describe('strings', () => {
		it('single-quoted strings are literal', () => {
			const line = tok(php, "$s = 'hello world';");
			expectToken(line, 'string', "'hello world'");
		});

		it('double-quoted strings without interpolation are plain strings', () => {
			const line = tok(php, '$s = "plain text";');
			expectToken(line, 'string', '"plain text"');
		});

		it('double-quoted strings with $var interpolation are templates', () => {
			const line = tok(php, '$s = "Hello $name!";');
			expectToken(line, 'string.template', '"Hello $name!"');
		});

		it('double-quoted strings with {$expr} interpolation are templates', () => {
			const line = tok(php, '$s = "Total: {$cart->total}";');
			expectToken(line, 'string.template', '"Total: {$cart->total}"');
		});

		it('handles escaped quotes inside strings', () => {
			const line = tok(php, '$s = "she said \\"hi\\"";');
			expectToken(line, 'string', '"she said \\"hi\\""');
		});
	});

	describe('numbers', () => {
		it('decimal integers', () => {
			expectToken(tok(php, '$n = 42;'), 'number', '42');
		});

		it('hex literals', () => {
			expectToken(tok(php, '$n = 0xFF;'), 'number', '0xFF');
		});

		it('binary literals', () => {
			expectToken(tok(php, '$n = 0b1010;'), 'number', '0b1010');
		});

		it('floats and underscores', () => {
			expectToken(tok(php, '$n = 3.14;'), 'number', '3.14');
			expectToken(tok(php, '$n = 1_000_000;'), 'number', '1_000_000');
		});
	});

	describe('comments', () => {
		it('// line comments', () => {
			expectToken(tok(php, '$x = 1; // inline'), 'comment.line', '// inline');
		});

		it('# line comments', () => {
			expectToken(tok(php, '# shell-style comment'), 'comment.line', '# shell-style comment');
		});

		it('single-line block comments', () => {
			expectToken(tok(php, '/* a block */'), 'comment.block', '/* a block */');
		});

		it('doc comments use comment.doc', () => {
			expectToken(tok(php, '/** @param int $x */'), 'comment.doc', '/** @param int $x */');
		});

		it('threads a multi-line doc comment as comment.doc on every line', () => {
			// Regression: continuation lines of a /** ... */ docblock were mis-typed as
			// comment.block, so a docblock rendered with two different colors.
			const lines = tokLines(php, ['/**', ' * Summary', ' * @return int', ' */', 'function f() {}']);
			expectToken(lines[0], 'comment.doc', '/**');
			expectToken(lines[1], 'comment.doc', ' * Summary');
			expectToken(lines[2], 'comment.doc', ' * @return int');
			expectToken(lines[3], 'comment.doc', ' */');
			expectToken(lines[4], 'keyword.definition', 'function');
			lines.forEach((l, i) =>
				expectLossless(l, ['/**', ' * Summary', ' * @return int', ' */', 'function f() {}'][i])
			);
		});

		it('treats /**/ as an empty block comment, not an unterminated doc comment', () => {
			// Regression: /**/ matched the /** doc-comment opener and bled into the rest
			// of the file as an unterminated comment.
			const line = tok(php, '$x = 1; /**/ $y = 2;');
			expectToken(line, 'comment.block', '/**/');
			// Code after the empty comment must still tokenize, not be swallowed.
			expectToken(line, 'variable', '$y');
			expectLossless(line, '$x = 1; /**/ $y = 2;');
		});
	});

	describe('operators', () => {
		it('arrow and scope accessors', () => {
			const line = tok(php, '$obj->method(); Foo::bar();');
			expectToken(line, 'punctuation.accessor', '->');
			expectToken(line, 'punctuation.accessor', '::');
		});

		it('null-coalescing and nullsafe operators', () => {
			expectTokenType(tok(php, '$x = $a ?? $b;'), 'operator');
			expectToken(tok(php, '$x = $a?->b;'), 'punctuation.accessor', '?->');
		});

		it('comparison and assignment operators', () => {
			const line = tok(php, '$x === $y;');
			expectToken(line, 'operator.comparison', '===');
			expectToken(tok(php, '$x .= "y";'), 'operator.assignment', '.=');
		});

		it('fat arrow in array syntax', () => {
			const line = tok(php, "['a' => 1]");
			expectToken(line, 'operator', '=>');
		});
	});

	describe('identifiers and calls', () => {
		it('treats identifier before ( as a function call', () => {
			const line = tok(php, 'strlen($s);');
			expectToken(line, 'function.call', 'strlen');
		});

		it('treats PascalCase identifiers as class names', () => {
			const line = tok(php, '$u instanceof UserModel;');
			expectToken(line, 'type.class', 'UserModel');
		});

		it('treats lowercase bare identifiers as variables', () => {
			const line = tok(php, 'int $age');
			expectToken(line, 'type.builtin', 'int');
		});
	});

	describe('multi-line constructs', () => {
		it('threads a multi-line block comment across lines', () => {
			const lines = tokLines(php, ['/* start of', ' a comment', ' end */ $x = 1;']);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
			expectToken(lines[2], 'variable', '$x');
		});

		it('threads a heredoc across lines', () => {
			const lines = tokLines(php, ['$html = <<<HTML', '<p>Hello $name</p>', 'HTML;']);
			expectTokenType(lines[0], 'string');
			expectTokenType(lines[1], 'string');
			expectToken(lines[2], 'string', 'HTML');
		});

		it('threads a nowdoc across lines', () => {
			const lines = tokLines(php, ["$raw = <<<'EOT'", 'no $interp here', 'EOT;']);
			expectTokenType(lines[0], 'string');
			expectTokenType(lines[1], 'string');
			expectToken(lines[2], 'string', 'EOT');
		});

		it('handles an indented heredoc closer (PHP 7.3+)', () => {
			const lines = tokLines(php, ['$x = <<<SQL', '    SELECT 1', '    SQL;']);
			expectToken(lines[2], 'string', 'SQL');
		});
	});

	describe('realistic lines', () => {
		it('tokenizes a typed method signature', () => {
			const line = tok(php, 'public function getName(): string {');
			expectToken(line, 'keyword.storage', 'public');
			expectToken(line, 'keyword.definition', 'function');
			expectToken(line, 'function.call', 'getName');
			expectToken(line, 'type.builtin', 'string');
			expectToken(line, 'punctuation.brace', '{');
		});

		it('tokenizes an array map with arrow fn', () => {
			const line = tok(php, '$out = array_map(fn($n) => $n * 2, $nums);');
			expectToken(line, 'variable', '$out');
			expectToken(line, 'function.call', 'array_map');
			expectToken(line, 'keyword.definition', 'fn');
			expectToken(line, 'operator.arithmetic', '*');
		});
	});

	describe('lossless reconstruction', () => {
		it('reconstructs a line with leading indentation', () => {
			const src = '        return $this->repository->find($id);';
			expectLossless(tok(php, src), src);
		});

		it('reconstructs a string with escapes', () => {
			const src = '$path = "C:\\\\Users\\\\$user\\\\file.txt";';
			expectLossless(tok(php, src), src);
		});

		it('reconstructs a comment line', () => {
			const src = '    // TODO: handle the $edge case (carefully)';
			expectLossless(tok(php, src), src);
		});

		it('reconstructs every line of a threaded heredoc', () => {
			const lines = tokLines(php, ['$q = <<<SQL', '  SELECT * FROM users WHERE id = 1', 'SQL;']);
			expectLossless(lines[0], '$q = <<<SQL');
			expectLossless(lines[1], '  SELECT * FROM users WHERE id = 1');
			expectLossless(lines[2], 'SQL;');
		});
	});
});
