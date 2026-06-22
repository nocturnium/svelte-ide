import { describe, it, expect } from 'vitest';
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

		it('double-quoted strings without interpolation emit string parts', () => {
			// Sub-tokenized: delimiters + literal body are `string` (no template needed).
			const line = tok(php, '$s = "plain text";');
			expectToken(line, 'string', '"');
			expectToken(line, 'string', 'plain text');
			expectLossless(line, '$s = "plain text";');
		});

		it('sub-tokenizes $var interpolation inside double-quoted strings', () => {
			// The literal stays `string`, the interpolated $name becomes a real variable.
			const line = tok(php, '$s = "Hello $name!";');
			expectToken(line, 'string', '"');
			expectToken(line, 'string', 'Hello ');
			expectToken(line, 'variable', '$name');
			expectToken(line, 'string', '!');
			expectLossless(line, '$s = "Hello $name!";');
		});

		it('sub-tokenizes {$expr} complex interpolation', () => {
			// "{" and "}" are template delimiters; $cart is a variable, ->total a property.
			const line = tok(php, '$s = "Total: {$cart->total}";');
			expectToken(line, 'string', 'Total: ');
			expectToken(line, 'string.template', '{');
			expectToken(line, 'variable', '$cart');
			expectToken(line, 'punctuation.accessor', '->');
			expectToken(line, 'property', 'total');
			expectToken(line, 'string.template', '}');
			expectLossless(line, '$s = "Total: {$cart->total}";');
		});

		it('sub-tokenizes ${name} interpolation', () => {
			const line = tok(php, '$s = "Hi ${name} there";');
			expectToken(line, 'string.template', '${');
			expectToken(line, 'variable', 'name');
			expectToken(line, 'string.template', '}');
			expectLossless(line, '$s = "Hi ${name} there";');
		});

		it('sub-tokenizes $arr[0] and $arr[key] simple index interpolation', () => {
			const line = tok(php, '$s = "first=$arr[0] key=$arr[name]";');
			expectToken(line, 'variable', '$arr');
			expectToken(line, 'punctuation.bracket', '[');
			expectToken(line, 'number.integer', '0');
			expectToken(line, 'string', 'name'); // bareword key in simple interp syntax
			expectLossless(line, '$s = "first=$arr[0] key=$arr[name]";');
		});

		it('sub-tokenizes $obj->prop simple property interpolation', () => {
			const line = tok(php, '$s = "name=$user->name end";');
			expectToken(line, 'variable', '$user');
			expectToken(line, 'punctuation.accessor', '->');
			expectToken(line, 'property', 'name');
			expectLossless(line, '$s = "name=$user->name end";');
		});

		it('emits string.escape for escape sequences inside double-quoted strings', () => {
			const line = tok(php, '$s = "a\\tb\\n\\u{1F600}\\x41\\101";');
			expectToken(line, 'string.escape', '\\t');
			expectToken(line, 'string.escape', '\\n');
			expectToken(line, 'string.escape', '\\u{1F600}');
			expectToken(line, 'string.escape', '\\x41');
			expectToken(line, 'string.escape', '\\101');
			expectLossless(line, '$s = "a\\tb\\n\\u{1F600}\\x41\\101";');
		});

		it("emits string.escape for \\\\ and \\' inside single-quoted strings only", () => {
			const line = tok(php, "$s = 'a\\\\b\\'c\\nd';");
			// In single quotes only \\ and \' are escapes; \n stays literal text.
			expectToken(line, 'string.escape', '\\\\');
			expectToken(line, 'string.escape', "\\'");
			expectToken(line, 'string', "c\\nd'"); // \n is NOT an escape in single quotes
			expectLossless(line, "$s = 'a\\\\b\\'c\\nd';");
		});

		it('handles escaped quotes inside strings losslessly', () => {
			const line = tok(php, '$s = "she said \\"hi\\"";');
			expectToken(line, 'string.escape', '\\"');
			expectLossless(line, '$s = "she said \\"hi\\"";');
		});

		it('threads an unterminated double-quoted string across lines', () => {
			const lines = tokLines(php, ['$s = "line one', 'still $name string";']);
			// First line: opens the string, never closes — interpolation still works.
			expectToken(lines[0], 'string', '"');
			expectToken(lines[0], 'string', 'line one');
			// Second line continues the string and closes it.
			expectToken(lines[1], 'variable', '$name');
			expectToken(lines[1], 'string', '"');
			expectToken(lines[1], 'punctuation.separator', ';');
			expectLossless(lines[0], '$s = "line one');
			expectLossless(lines[1], 'still $name string";');
		});
	});

	describe('numbers', () => {
		it('decimal integers use number.integer', () => {
			expectToken(tok(php, '$n = 42;'), 'number.integer', '42');
		});

		it('hex literals use number.hex', () => {
			expectToken(tok(php, '$n = 0xFF;'), 'number.hex', '0xFF');
		});

		it('binary literals use number.binary', () => {
			expectToken(tok(php, '$n = 0b1010;'), 'number.binary', '0b1010');
		});

		it('octal literals use number.integer', () => {
			expectToken(tok(php, '$n = 0o17;'), 'number.integer', '0o17');
			expectToken(tok(php, '$n = 0755;'), 'number.integer', '0755');
		});

		it('floats use number.float; underscores stay integer', () => {
			expectToken(tok(php, '$n = 3.14;'), 'number.float', '3.14');
			expectToken(tok(php, '$n = 1_000_000;'), 'number.integer', '1_000_000');
			expectToken(tok(php, '$n = 1.5e10;'), 'number.float', '1.5e10');
			expectToken(tok(php, '$n = 2E-3;'), 'number.float', '2E-3');
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
			const lines = tokLines(php, [
				'/**',
				' * Summary',
				' * @return int',
				' */',
				'function f() {}'
			]);
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

		it('threads a heredoc across lines and interpolates the body', () => {
			const lines = tokLines(php, ['$html = <<<HTML', '<p>Hello $name</p>', 'HTML;']);
			expectTokenType(lines[0], 'string');
			// Heredoc body interpolates: literal stays string.template, $name a variable.
			expectToken(lines[1], 'string.template', '<p>Hello ');
			expectToken(lines[1], 'variable', '$name');
			expectToken(lines[1], 'string.template', '</p>');
			expectToken(lines[2], 'string', 'HTML');
			expectLossless(lines[1], '<p>Hello $name</p>');
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
			// Name after `function` is a definition, not a call.
			expectToken(line, 'function.definition', 'getName');
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

	describe('inline HTML (close-tag mode switch)', () => {
		it('treats text after a ?> close tag as inline HTML, not PHP code', () => {
			// Regression: after ?> the tokenizer kept lexing as PHP, so literal markup
			// after the close tag was mis-read as comparison operators / bare identifiers.
			// (Note: the snippet starts in PHP mode, so the close tag is what flips it.)
			const line = tok(php, 'echo $x; ?> trailing <b>HTML</b>');
			expectToken(line, 'keyword', '?>');
			// Everything after ?> is a single inline-HTML text token, not < as comparison.
			expectToken(line, 'text', ' trailing <b>HTML</b>');
			expectLossless(line, 'echo $x; ?> trailing <b>HTML</b>');
		});

		it('re-enters PHP mode at <?= within an inline-HTML run', () => {
			const lines = tokLines(php, ['?>', '<div>Static <?= $title ?> more</div>']);
			// On line 2 we are already in HTML mode from the prior ?>.
			expectToken(lines[1], 'text', '<div>Static ');
			expectToken(lines[1], 'keyword', '<?=');
			expectToken(lines[1], 'variable', '$title');
			expectToken(lines[1], 'keyword', '?>');
			expectToken(lines[1], 'text', ' more</div>');
			expectLossless(lines[1], '<div>Static <?= $title ?> more</div>');
		});

		it('threads inline-HTML mode across lines until the next open tag', () => {
			const lines = tokLines(php, ['echo "x"; ?>', '<ul><li>Item</li></ul>', '<?php $y = 1;']);
			// The whole HTML line is one text token, not tokenized as PHP.
			expectToken(lines[1], 'text', '<ul><li>Item</li></ul>');
			// The open tag on the next line re-enters PHP mode.
			expectToken(lines[2], 'keyword', '<?php');
			expectToken(lines[2], 'variable', '$y');
			lines.forEach((l, i) =>
				expectLossless(l, ['echo "x"; ?>', '<ul><li>Item</li></ul>', '<?php $y = 1;'][i])
			);
		});

		it('leaves an <?xml declaration inside inline HTML as text', () => {
			// In HTML mode, <?xml ...?> is an XML declaration, not a PHP short open tag.
			const lines = tokLines(php, ['?>', '<?xml version="1.0"?>']);
			expectToken(lines[1], 'text', '<?xml version="1.0"?>');
			expectLossless(lines[1], '<?xml version="1.0"?>');
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

	describe('member access classification', () => {
		it('classifies a property after -> as property, a method as function.call', () => {
			const line = tok(php, '$obj->name; $obj->run();');
			expectToken(line, 'property', 'name');
			expectToken(line, 'function.call', 'run');
		});

		it('classifies a chained access correctly (call, property, call)', () => {
			const line = tok(php, '$obj->foo()->bar->baz();');
			const types = line.tokens.filter((t) => ['function.call', 'property'].includes(t.type));
			expectToken(line, 'function.call', 'foo');
			expectToken(line, 'property', 'bar');
			expectToken(line, 'function.call', 'baz');
			// bar must NOT be a call (no following paren).
			if (types.find((t) => t.text === 'bar')?.type === 'function.call') {
				throw new Error('bar misclassified as a call');
			}
		});

		it('classifies ALL_CAPS after :: as a class constant', () => {
			expectToken(tok(php, 'Status::ACTIVE;'), 'constant', 'ACTIVE');
		});

		it('classifies a static method call and Foo::class', () => {
			expectToken(tok(php, 'Repo::make();'), 'function.call', 'make');
			expectToken(tok(php, 'User::class;'), 'keyword', 'class');
		});

		it('classifies a static property access $instance after ::', () => {
			expectToken(tok(php, 'Container::$instance;'), 'variable', '$instance');
		});

		it('classifies a nullsafe method call and a nullsafe property', () => {
			const line = tok(php, '$a?->run()?->value;');
			expectToken(line, 'function.call', 'run');
			expectToken(line, 'property', 'value');
		});
	});

	describe('definition-name classification', () => {
		it('names the class/interface/trait/enum being defined with a type subtype', () => {
			expectToken(tok(php, 'class UserModel {}'), 'type.class', 'UserModel');
			expectToken(tok(php, 'interface Repository {}'), 'type.interface', 'Repository');
			expectToken(tok(php, 'trait Loggable {}'), 'type.class', 'Loggable');
			expectToken(tok(php, 'enum Suit {}'), 'type.class', 'Suit');
		});

		it('names a defined function as function.definition, not a call', () => {
			expectToken(tok(php, 'function compute() {}'), 'function.definition', 'compute');
		});

		it('names the first namespace segment as type.namespace', () => {
			expectToken(tok(php, 'namespace App\\Http;'), 'type.namespace', 'App');
		});
	});

	describe('parameter classification', () => {
		it('marks variables inside a function parameter list as variable.parameter', () => {
			const line = tok(php, 'function f(int $a, ?string $b = null) {}');
			expectToken(line, 'variable.parameter', '$a');
			expectToken(line, 'variable.parameter', '$b');
		});

		it('marks the arrow-fn parameter as variable.parameter', () => {
			const line = tok(php, '$f = fn($n) => $n * 2;');
			expectToken(line, 'variable.parameter', '$n');
			// The body reference $n is NOT in the param list — stays a plain variable.
			const ns = line.tokens.filter((t) => t.text === '$n');
			expect(ns.some((t) => t.type === 'variable')).toBe(true);
		});

		it('does not mark a call argument variable as a parameter', () => {
			const line = tok(php, 'compute($a, $b);');
			expectToken(line, 'variable', '$a');
			expectToken(line, 'variable', '$b');
		});
	});

	describe('named arguments and magic constants', () => {
		it('classifies PHP 8 named arguments as property', () => {
			const line = tok(php, 'setColor(red: 255, green: 0);');
			expectToken(line, 'property', 'red');
			expectToken(line, 'property', 'green');
		});

		it('classifies magic constants as constant.builtin', () => {
			const line = tok(php, 'echo __LINE__ . __CLASS__ . __FUNCTION__;');
			expectToken(line, 'constant.builtin', '__LINE__');
			expectToken(line, 'constant.builtin', '__CLASS__');
			expectToken(line, 'constant.builtin', '__FUNCTION__');
		});
	});

	describe('interpolation sub-tokenization (deep)', () => {
		it('tokenizes a method call inside {$...}', () => {
			const line = tok(php, '$s = "Got: {$obj->getValue()}";');
			expectToken(line, 'string.template', '{');
			expectToken(line, 'variable', '$obj');
			expectToken(line, 'function.call', 'getValue');
			expectToken(line, 'punctuation.paren', '(');
			expectToken(line, 'string.template', '}');
			expectLossless(line, '$s = "Got: {$obj->getValue()}";');
		});

		it('tokenizes nested array keys inside {$...}', () => {
			const src = "$s = \"v: {$data['user']['name']}\";";
			const line = tok(php, src);
			expectToken(line, 'variable', '$data');
			expectToken(line, 'string', "'user'");
			expectToken(line, 'string', "'name'");
			expectLossless(line, src);
		});

		it('tokenizes $this->prop simple interpolation', () => {
			const line = tok(php, '$s = "id={$this->id}";');
			expectToken(line, 'variable', '$this');
			expectToken(line, 'property', 'id');
			expectLossless(line, '$s = "id={$this->id}";');
		});

		it('treats an escaped \\$ as an escape, not interpolation', () => {
			const line = tok(php, '$s = "price \\$5 not $var";');
			expectToken(line, 'string.escape', '\\$');
			expectToken(line, 'variable', '$var');
			// The 5 after \$ is literal string, not a variable.
			expectLossless(line, '$s = "price \\$5 not $var";');
		});

		it('does not interpolate inside a nowdoc body', () => {
			const lines = tokLines(php, ["$h = <<<'EOT'", 'raw $name {$x}', 'EOT;']);
			// Whole nowdoc body is one literal string token — no variable tokens.
			expectToken(lines[1], 'string', 'raw $name {$x}');
			expect(lines[1].tokens.every((t) => t.type === 'string')).toBe(true);
		});

		it('does not truncate {$...} at a brace hidden inside a quoted array key', () => {
			// Regression: findMatchingBrace was string-blind, so the literal `}` inside
			// the single-quoted key `'}'` was counted as the interpolation's closing brace.
			// That cut the expression short — `$a`, a bare `'`, an early `}` template close,
			// then `']}x` bled out as literal string. The brace matcher must skip over
			// quoted string literals.
			const src = '$s = "{$a[\'}\']}x";';
			const line = tok(php, src);
			expectToken(line, 'string.template', '{');
			expectToken(line, 'variable', '$a');
			expectToken(line, 'punctuation.bracket', '[');
			expectToken(line, 'string', "'}'"); // the key is a complete single-quoted string
			expectToken(line, 'punctuation.bracket', ']');
			expectToken(line, 'string.template', '}'); // closes the interpolation, not the key
			expectToken(line, 'string', 'x'); // trailing literal after the interpolation
			expectLossless(line, src);

			// Same hazard with a double-quoted key containing a brace.
			const src2 = '$s = "{$a["k}"]}!";';
			const line2 = tok(php, src2);
			expectToken(line2, 'variable', '$a');
			expectToken(line2, 'string', '"k}"');
			expectToken(line2, 'string.template', '}');
			expectToken(line2, 'string', '!');
			expectLossless(line2, src2);
		});

		it('interpolates inside a heredoc body', () => {
			const lines = tokLines(php, ['$h = <<<HTML', '<p>Hi $name {$o->x}</p>', 'HTML;']);
			expectToken(lines[1], 'variable', '$name');
			expectToken(lines[1], 'string.template', '{');
			expectToken(lines[1], 'variable', '$o');
			expectToken(lines[1], 'property', 'x');
			expectLossless(lines[1], '<p>Hi $name {$o->x}</p>');
		});
	});
});
