import { describe, it } from 'vitest';
import { createRubyTokenizer } from './ruby';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const rb = createRubyTokenizer();

describe('ruby: keywords', () => {
	it('classifies control keywords', () => {
		const line = tok(rb, 'if x then return end');
		expectToken(line, 'keyword.control', 'if');
		expectToken(line, 'keyword.control', 'then');
		expectToken(line, 'keyword.control', 'return');
		expectToken(line, 'keyword', 'end');
	});

	it('classifies elsif/unless/until control keywords', () => {
		const line = tok(rb, 'elsif a until b unless c');
		expectToken(line, 'keyword.control', 'elsif');
		expectToken(line, 'keyword.control', 'until');
		expectToken(line, 'keyword.control', 'unless');
	});

	it('classifies definition keywords def/class/module', () => {
		const def = tok(rb, 'def run');
		expectToken(def, 'keyword.definition', 'def');
		const cls = tok(rb, 'class Widget');
		expectToken(cls, 'keyword.definition', 'class');
		const mod = tok(rb, 'module Util');
		expectToken(mod, 'keyword.definition', 'module');
	});

	it('treats self and super as keywords', () => {
		const line = tok(rb, 'self.value = super');
		expectToken(line, 'keyword', 'self');
		expectToken(line, 'keyword', 'super');
	});

	it('handles the begin/rescue/ensure family', () => {
		const line = tok(rb, 'begin rescue ensure');
		expectToken(line, 'keyword.control', 'begin');
		expectToken(line, 'keyword.control', 'rescue');
		expectToken(line, 'keyword.control', 'ensure');
	});
});

describe('ruby: module and storage directives', () => {
	it('classifies require/require_relative/include as module keywords', () => {
		const line = tok(rb, "require 'json'");
		expectToken(line, 'keyword.module', 'require');
		const rel = tok(rb, "require_relative '../lib'");
		expectToken(rel, 'keyword.module', 'require_relative');
		const inc = tok(rb, 'include Comparable');
		expectToken(inc, 'keyword.module', 'include');
	});

	it('classifies attr_accessor and visibility as storage keywords', () => {
		const line = tok(rb, 'attr_accessor :name');
		expectToken(line, 'keyword.storage', 'attr_accessor');
		const vis = tok(rb, 'private');
		expectToken(vis, 'keyword.storage', 'private');
		const ar = tok(rb, 'attr_reader :id');
		expectToken(ar, 'keyword.storage', 'attr_reader');
	});
});

describe('ruby: strings', () => {
	it('tokenizes single-quoted literal strings', () => {
		// Delimiters + body are separate string tokens; the whole span is lossless.
		const line = tok(rb, "name = 'Ada'");
		expectToken(line, 'string', "'");
		expectToken(line, 'string', 'Ada');
		expectLossless(line, "name = 'Ada'");
	});

	it('tokenizes double-quoted strings without interpolation', () => {
		const line = tok(rb, 'greeting = "hello"');
		expectToken(line, 'string', '"');
		expectToken(line, 'string', 'hello');
		expectLossless(line, 'greeting = "hello"');
	});

	it('sub-tokenizes interpolation in double-quoted strings', () => {
		// The literal runs stay `string`; the `#{` / `}` delimiters become
		// string.template; the inner expression gets real types.
		const line = tok(rb, 'msg = "hi #{name}!"');
		expectToken(line, 'string', '"');
		expectToken(line, 'string', 'hi ');
		expectToken(line, 'string.template', '#{');
		expectToken(line, 'variable', 'name');
		expectToken(line, 'string.template', '}');
		expectLossless(line, 'msg = "hi #{name}!"');
	});

	it('sub-tokenizes a method chain inside interpolation', () => {
		const line = tok(rb, 'm = "v=#{user.name.upcase}"');
		expectToken(line, 'string.template', '#{');
		expectToken(line, 'variable', 'user');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'name');
		expectToken(line, 'property', 'upcase');
		expectLossless(line, 'm = "v=#{user.name.upcase}"');
	});

	it('handles #@ivar / #$global short interpolation', () => {
		const line = tok(rb, 's = "a#@x b#$g"');
		expectToken(line, 'string.template', '#');
		expectToken(line, 'variable', '@x');
		expectToken(line, 'variable', '$g');
		expectLossless(line, 's = "a#@x b#$g"');
	});

	it('keeps single-quoted strings literal even with #{ }', () => {
		const line = tok(rb, "raw = 'no #{interp} here'");
		// No interpolation tokens — the #{...} is literal body in a single-quoted string.
		expectToken(line, 'string', 'no #{interp} here');
		expectLossless(line, "raw = 'no #{interp} here'");
	});

	it('emits string.escape for escapes inside double-quoted strings', () => {
		const line = tok(rb, 'path = "a\\"b\\nc"');
		expectToken(line, 'string.escape', '\\"');
		expectToken(line, 'string.escape', '\\n');
		expectLossless(line, 'path = "a\\"b\\nc"');
	});

	it('emits string.escape for unicode and hex escapes', () => {
		const line = tok(rb, 'u = "\\u00e9 \\u{1F600} \\x41 \\101"');
		expectToken(line, 'string.escape', '\\u00e9');
		expectToken(line, 'string.escape', '\\u{1F600}');
		expectToken(line, 'string.escape', '\\x41');
		expectToken(line, 'string.escape', '\\101');
		expectLossless(line, 'u = "\\u00e9 \\u{1F600} \\x41 \\101"');
	});

	it('tokenizes percent word arrays', () => {
		const line = tok(rb, 'tags = %w[red green blue]');
		expectToken(line, 'string', '%w[');
		expectToken(line, 'string', 'red green blue');
		expectLossless(line, 'tags = %w[red green blue]');
	});

	it('tokenizes percent symbol arrays', () => {
		const line = tok(rb, 'syms = %i(a b c)');
		expectToken(line, 'string', '%i(');
		expectLossless(line, 'syms = %i(a b c)');
	});

	it('sub-tokenizes interpolation in %W and %Q literals', () => {
		const w = tok(rb, 'a = %W[#{x} two]');
		expectToken(w, 'string.template', '#{');
		expectToken(w, 'variable', 'x');
		expectLossless(w, 'a = %W[#{x} two]');
		const q = tok(rb, 'b = %Q{hi #{name}}');
		expectToken(q, 'string.template', '#{');
		expectToken(q, 'variable', 'name');
		expectLossless(q, 'b = %Q{hi #{name}}');
	});

	it('treats backtick command strings as interpolating strings', () => {
		const line = tok(rb, 'out = `ls #{dir}`');
		expectToken(line, 'string', '`');
		expectToken(line, 'string.template', '#{');
		expectToken(line, 'variable', 'dir');
		expectLossless(line, 'out = `ls #{dir}`');
	});

	it('does not close interpolation early on a nested string brace/quote', () => {
		// The `}` and `"` inside `inner["nested"]` must not terminate the #{...} block.
		const code = 's = "outer #{inner["nested"]} done"';
		const line = tok(rb, code);
		expectToken(line, 'string.template', '#{');
		expectToken(line, 'variable', 'inner');
		expectToken(line, 'string.template', '}');
		expectToken(line, 'string', ' done');
		expectLossless(line, code);
	});

	it('tokenizes a nested ternary-with-strings inside interpolation', () => {
		const code = 'r = "a #{x > 0 ? "p" : "n"} b"';
		const line = tok(rb, code);
		expectToken(line, 'operator', '>');
		expectToken(line, 'operator', '?');
		expectLossless(line, code);
	});
});

describe('ruby: percent-literals beyond %w/%i', () => {
	it('tokenizes %q (non-interpolating) literals losslessly', () => {
		const q = tok(rb, 'a = %q{single quoted}');
		expectToken(q, 'string', '%q{');
		expectToken(q, 'string', 'single quoted');
		expectLossless(q, 'a = %q{single quoted}');
		// Regression: the inner `#{x}` must NOT bleed into a line comment.
		const dq = tok(rb, 'b = %Q<double #{x} quoted>');
		expectToken(dq, 'string.template', '#{');
		expectToken(dq, 'variable', 'x');
		expectLossless(dq, 'b = %Q<double #{x} quoted>');
	});

	it('tokenizes %r regex literals (with flags) as string.regex', () => {
		const r = tok(rb, 'e = %r{[a-z]+}i');
		expectToken(r, 'string.regex', '%r{');
		expectToken(r, 'string.regex', '}i');
		expectLossless(r, 'e = %r{[a-z]+}i');
	});

	it('tokenizes %x command literals as a string', () => {
		const x = tok(rb, 'f = %x(ls -la)');
		expectToken(x, 'string', '%x(');
		expectLossless(x, 'f = %x(ls -la)');
	});

	it('supports non-bracket percent delimiters like %q|...|', () => {
		const p = tok(rb, 'g = %q|pipe delim|');
		expectToken(p, 'string', '%q|');
		expectLossless(p, 'g = %q|pipe delim|');
	});
});

describe('ruby: regex vs division', () => {
	it('treats a slash literal in value position as a regex', () => {
		const line = tok(rb, 'r = /foo.*bar/i');
		expectToken(line, 'string.regex', '/');
		expectToken(line, 'string.regex', 'foo.*bar');
		expectToken(line, 'string.regex', '/i');
		expectLossless(line, 'r = /foo.*bar/i');
	});

	it('sub-tokenizes escapes and interpolation inside a regex', () => {
		const line = tok(rb, 'm = /^#{prefix}\\d+$/');
		expectToken(line, 'string.escape', '\\d');
		expectToken(line, 'string.template', '#{');
		expectToken(line, 'variable', 'prefix');
		expectLossless(line, 'm = /^#{prefix}\\d+$/');
	});

	it('does not let a # inside a regex bleed into a line comment', () => {
		// Before the fix `#/` was tokenized as a `comment.line`, swallowing the close.
		const line = tok(rb, 'if line =~ /^\\s*#/');
		// The literal still closes; a `string.regex` close `/` exists and it is lossless.
		expectToken(line, 'string.regex', '/');
		expectLossless(line, 'if line =~ /^\\s*#/');
	});

	it('recognizes a regex argument right after an opening paren or comma', () => {
		const line = tok(rb, 'gsub(/\\d+/, "N")');
		expectToken(line, 'string.escape', '\\d');
		expectLossless(line, 'gsub(/\\d+/, "N")');
	});

	it('keeps a slash between two values as the division operator', () => {
		const div = tok(rb, 'x = 10 / 2');
		expectToken(div, 'operator', '/');
		const chain = tok(rb, 'y = a / b / c');
		// Two division operators, no regex swallowing `b / c`.
		expectToken(chain, 'operator', '/');
		expectLossless(chain, 'y = a / b / c');
	});
});

describe('ruby: symbols', () => {
	it('tokenizes plain symbols as constant.builtin', () => {
		const line = tok(rb, 'h = { key: 1, other: :name }');
		expectToken(line, 'constant.builtin', ':name');
	});

	it('tokenizes non-interpolating quoted symbols', () => {
		const line = tok(rb, "send(:'dynamic name')");
		expectToken(line, 'constant.builtin', ":'dynamic name'");
	});

	it('sub-tokenizes an interpolating quoted symbol', () => {
		const line = tok(rb, 'd = :"key_#{n}"');
		expectToken(line, 'constant.builtin', ':');
		expectToken(line, 'string.template', '#{');
		expectToken(line, 'variable', 'n');
		expectLossless(line, 'd = :"key_#{n}"');
	});

	it('tokenizes predicate and bang symbols', () => {
		const line = tok(rb, 'respond_to? :valid?');
		expectToken(line, 'constant.builtin', ':valid?');
	});
});

describe('ruby: comments', () => {
	it('tokenizes line comments', () => {
		const line = tok(rb, 'x = 1 # set x');
		expectToken(line, 'comment.line', '# set x');
	});

	it('tokenizes a full-line comment', () => {
		const line = tok(rb, '# frozen_string_literal: true');
		expectToken(line, 'comment.line', '# frozen_string_literal: true');
	});
});

describe('ruby: numbers', () => {
	it('tokenizes integers with underscores as number.integer', () => {
		const line = tok(rb, 'big = 1_000_000');
		expectToken(line, 'number.integer', '1_000_000');
	});

	it('emits precise subtypes for hex, binary, and octal', () => {
		expectToken(tok(rb, 'h = 0xFF'), 'number.hex', '0xFF');
		expectToken(tok(rb, 'b = 0b1010'), 'number.binary', '0b1010');
		expectToken(tok(rb, 'o = 0o17'), 'number.integer', '0o17');
		expectToken(tok(rb, 'l = 0755'), 'number.integer', '0755');
	});

	it('tokenizes floats (with exponent) as number.float', () => {
		expectToken(tok(rb, 'f = 3.14e-2'), 'number.float', '3.14e-2');
		expectToken(tok(rb, 'g = 1e9'), 'number.float', '1e9');
		expectToken(tok(rb, 'h = 2.5'), 'number.float', '2.5');
	});

	it('handles rational and imaginary suffixes', () => {
		expectToken(tok(rb, 'r = 3r'), 'number.integer', '3r');
		expectToken(tok(rb, 'i = 4i'), 'number.integer', '4i');
		expectToken(tok(rb, 'c = 2.0i'), 'number.float', '2.0i');
	});
});

describe('ruby: operators', () => {
	it('tokenizes the spaceship and equality operators', () => {
		const line = tok(rb, 'a <=> b == c');
		expectToken(line, 'operator', '<=>');
		expectToken(line, 'operator', '==');
	});

	it('tokenizes assignment and compound operators', () => {
		const line = tok(rb, 'x ||= y');
		expectToken(line, 'operator', '||=');
	});

	it('tokenizes the hash-rocket', () => {
		const line = tok(rb, '{ :a => 1 }');
		expectToken(line, 'operator', '=>');
	});
});

describe('ruby: identifiers, builtins, and variables', () => {
	it('classifies constants (Capitalized) as type.class', () => {
		const line = tok(rb, 'User.find');
		expectToken(line, 'type.class', 'User');
	});

	it('classifies booleans and nil', () => {
		const line = tok(rb, 'ok = true || false');
		expectToken(line, 'constant.boolean', 'true');
		expectToken(line, 'constant.boolean', 'false');
		expectToken(tok(rb, 'x = nil'), 'constant.null', 'nil');
	});

	it('classifies function calls (identifier followed by paren)', () => {
		const line = tok(rb, 'compute(1, 2)');
		expectToken(line, 'function.call', 'compute');
	});

	it('classifies kernel builtins like puts', () => {
		const line = tok(rb, 'puts message');
		expectToken(line, 'function', 'puts');
		expectToken(tok(rb, 'print("x")'), 'function.call', 'print');
	});

	it('tokenizes instance, class, and global variables with their sigils', () => {
		expectToken(tok(rb, '@name = 1'), 'variable', '@name');
		expectToken(tok(rb, '@@count = 0'), 'variable', '@@count');
		expectToken(tok(rb, '$global = 2'), 'variable', '$global');
	});

	it('classifies plain identifiers as variable', () => {
		const line = tok(rb, 'total = subtotal');
		expectToken(line, 'variable', 'total');
		expectToken(line, 'variable', 'subtotal');
	});
});

describe('ruby: keyword-named method calls (after an accessor)', () => {
	it('treats a reserved word after a dot as a property, not a keyword', () => {
		// `obj.class` is the Object#class method, NOT the `class` definition keyword.
		// Members after an accessor are emitted as `property` (a distinct, styled type).
		const line = tok(rb, 'obj.class.name');
		expectToken(line, 'variable', 'obj');
		expectToken(line, 'property', 'class');
		expectToken(line, 'property', 'name');
		expectLossless(line, 'obj.class.name');
	});

	it('does not mark `.then`/`.begin`/`.end` after a dot as keywords', () => {
		const line = tok(rb, 'value.then { |v| v }');
		// `then` here is Object#then (yield_self), a method — must not be keyword.control.
		expectToken(line, 'property', 'then');
		const ends = tok(rb, 'range.begin');
		expectToken(ends, 'property', 'begin');
	});

	it('keeps a builtin used as a method call after a dot a function call', () => {
		const line = tok(rb, 'obj.send(:to_s)');
		expectToken(line, 'function.call', 'send');
	});

	it('still classifies a leading def/class/module as a definition keyword', () => {
		// Regression guard: the accessor rule must not swallow real definitions.
		expectToken(tok(rb, 'def run'), 'keyword.definition', 'def');
		expectToken(tok(rb, 'class Widget'), 'keyword.definition', 'class');
	});

	it('does not treat a range operator as a method accessor', () => {
		// `1..end` is a range; `end` is the keyword here, not a method off `1.`.
		const line = tok(rb, 'arr[0..self]');
		expectToken(line, 'keyword', 'self');
	});

	it('resolves an ALL_CAPS member after a dot as a constant', () => {
		const line = tok(rb, 'mod.CONST');
		expectToken(line, 'constant', 'CONST');
	});

	it('resolves a Capitalized (mixed-case) member after a dot as a class/type', () => {
		const line = tok(rb, 'mod.Klass');
		expectToken(line, 'type.class', 'Klass');
	});
});

describe('ruby: multi-line constructs', () => {
	it('threads =begin / =end block comments across lines', () => {
		const lines = tokLines(rb, [
			'=begin',
			'documentation here',
			'still inside',
			'=end',
			'code = 1'
		]);
		expectTokenType(lines[0], 'comment.block');
		expectTokenType(lines[1], 'comment.block');
		expectTokenType(lines[2], 'comment.block');
		expectTokenType(lines[3], 'comment.block');
		// After =end the next line is normal code again.
		expectToken(lines[4], 'variable', 'code');
		expectToken(lines[4], 'number.integer', '1');
	});

	it('threads a heredoc body across lines', () => {
		const lines = tokLines(rb, [
			'sql = <<~SQL',
			'  SELECT * FROM users',
			'  WHERE id = 1',
			'SQL',
			'puts sql'
		]);
		expectTokenType(lines[0], 'string'); // the <<~SQL opener
		expectTokenType(lines[1], 'string'); // body
		expectTokenType(lines[2], 'string'); // body
		expectTokenType(lines[3], 'string'); // terminator line
		expectToken(lines[4], 'function', 'puts'); // back to code
	});

	it('sub-tokenizes interpolation in an interpolating heredoc body', () => {
		const src = ['sql = <<~SQL', '  SELECT #{col} FROM t', 'SQL'];
		const lines = tokLines(rb, src);
		expectToken(lines[1], 'string.template', '#{');
		expectToken(lines[1], 'variable', 'col');
		expectToken(lines[1], 'string.template', '}');
		lines.forEach((l, i) => expectLossless(l, src[i]));
	});

	it("keeps a single-quoted heredoc (<<~'X') raw — no interpolation", () => {
		const src = ["raw = <<~'TXT'", '  no #{interp} here', 'TXT'];
		const lines = tokLines(rb, src);
		// The body line is a plain string; `#{interp}` is NOT split out.
		expectToken(lines[1], 'string', '  no #{interp} here');
		lines.forEach((l, i) => expectLossless(l, src[i]));
	});

	it('threads an unterminated interpolating string across lines', () => {
		const src = ['x = "start #{a}', 'middle', 'end"'];
		const lines = tokLines(rb, src);
		expectToken(lines[0], 'string.template', '#{');
		expectToken(lines[0], 'variable', 'a');
		// Continuation lines are still string content until the closing quote.
		expectTokenType(lines[1], 'string');
		expectToken(lines[2], 'string', '"');
		lines.forEach((l, i) => expectLossless(l, src[i]));
		// Back to normal code after the string closes.
		const after = rb.tokenizeLine('y = 1', 4, lines[2].state);
		expectToken(after, 'number.integer', '1');
	});

	it('threads an unterminated regex across lines (with flags on close)', () => {
		const src = ['m = /start', 'rest/i', 'code = 1'];
		const lines = tokLines(rb, src);
		expectTokenType(lines[0], 'string.regex');
		expectToken(lines[1], 'string.regex', '/i');
		expectToken(lines[2], 'number.integer', '1');
		lines.forEach((l, i) => expectLossless(l, src[i]));
	});
});

describe('ruby: character literals', () => {
	it('tokenizes simple and escaped character literals as strings', () => {
		expectToken(tok(rb, 'c = ?a'), 'string', '?a');
		expectToken(tok(rb, 'n = ?\\n'), 'string', '?\\n');
		expectToken(tok(rb, 'u = ?\\u{1F600}'), 'string', '?\\u{1F600}');
	});

	it('does not mistake a ternary for a character literal', () => {
		const line = tok(rb, 'r = cond ? x : y');
		// The `?` here is the ternary operator, NOT a `?x` char literal.
		expectToken(line, 'operator', '?');
		expectToken(line, 'variable', 'x');
		expectLossless(line, 'r = cond ? x : y');
	});
});

describe('ruby: special globals', () => {
	it('tokenizes named and punctuation globals as variables', () => {
		const line = tok(rb, 'puts $stdout, $LOAD_PATH, $1, $~, $!, $0');
		expectToken(line, 'variable', '$stdout');
		expectToken(line, 'variable', '$LOAD_PATH');
		expectToken(line, 'variable', '$1');
		expectToken(line, 'variable', '$~');
		expectToken(line, 'variable', '$!');
		expectToken(line, 'variable', '$0');
		expectLossless(line, 'puts $stdout, $LOAD_PATH, $1, $~, $!, $0');
	});
});

describe('ruby: labels, namespaces, and constants', () => {
	it('classifies a hash/keyword label as a property', () => {
		const line = tok(rb, 'h = { name: 1, age: 2 }');
		expectToken(line, 'property', 'name');
		expectToken(line, 'property', 'age');
	});

	it('classifies scope-resolved names as namespace then class', () => {
		const line = tok(rb, 'x = Foo::Bar::Baz');
		expectToken(line, 'type.namespace', 'Foo');
		expectToken(line, 'type.namespace', 'Bar');
		expectToken(line, 'type.class', 'Baz');
		expectLossless(line, 'x = Foo::Bar::Baz');
	});

	it('classifies an ALL_CAPS bareword as a constant', () => {
		expectToken(tok(rb, 'MAX = 10'), 'constant', 'MAX');
	});
});

describe('ruby: __END__ / DATA section', () => {
	it('treats everything after a lone __END__ as a verbatim data block', () => {
		const src = ['puts 1', '__END__', 'raw #{not} interpolated', '<<not a heredoc'];
		const lines = tokLines(rb, src);
		expectToken(lines[0], 'number.integer', '1');
		expectToken(lines[1], 'keyword', '__END__');
		expectTokenType(lines[2], 'comment.block');
		expectTokenType(lines[3], 'comment.block');
		lines.forEach((l, i) => expectLossless(l, src[i]));
	});
});

describe('ruby: shovel operator vs heredoc', () => {
	it('keeps `<<` after a value as the append operator', () => {
		const line = tok(rb, 'list << item');
		expectToken(line, 'operator', '<<');
		expectToken(line, 'variable', 'item');
		expectLossless(line, 'list << item');
	});

	it('still opens a heredoc in value position', () => {
		const src = ['x = <<HEREDOC', 'body', 'HEREDOC'];
		const lines = tokLines(rb, src);
		expectTokenType(lines[0], 'string');
		expectTokenType(lines[1], 'string');
		lines.forEach((l, i) => expectLossless(l, src[i]));
	});
});

describe('ruby: realistic lines', () => {
	it('tokenizes a method definition with interpolation', () => {
		const line = tok(rb, 'def greet(name) = "Hello, #{name}"');
		expectToken(line, 'keyword.definition', 'def');
		expectToken(line, 'function.definition', 'greet');
		expectToken(line, 'variable', 'name');
		expectToken(line, 'string.template', '#{');
		expectLossless(line, 'def greet(name) = "Hello, #{name}"');
	});

	it('tokenizes a class with attr_accessor and a constant', () => {
		const line = tok(rb, 'class Account < ApplicationRecord');
		expectToken(line, 'keyword.definition', 'class');
		expectToken(line, 'type.class', 'Account');
		expectToken(line, 'operator', '<');
		expectToken(line, 'type.class', 'ApplicationRecord');
	});
});

describe('ruby: lossless reconstruction', () => {
	it('is lossless on an indented line', () => {
		const code = '    result = compute(value) + 10';
		expectLossless(tok(rb, code), code);
	});

	it('is lossless on a string with escapes', () => {
		const code = 'msg = "line1\\nline2 \\"quoted\\" #{name}"';
		expectLossless(tok(rb, code), code);
	});

	it('is lossless on a comment line', () => {
		const code = '  # TODO: refactor this :symbol and @ivar';
		expectLossless(tok(rb, code), code);
	});

	it('is lossless across a heredoc (trickiest construct)', () => {
		const lines = ['query = <<-EOT', '  some text @ivar #{x}', 'EOT'];
		const results = tokLines(rb, lines);
		results.forEach((line, i) => expectLossless(line, lines[i]));
	});

	it('is lossless on a percent-literal and symbol line', () => {
		const code = 'cfg = { tags: %w[a b c], mode: :fast }';
		expectLossless(tok(rb, code), code);
	});
});
