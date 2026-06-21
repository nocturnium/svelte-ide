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
		const line = tok(rb, "name = 'Ada'");
		expectToken(line, 'string', "'Ada'");
	});

	it('tokenizes double-quoted strings without interpolation', () => {
		const line = tok(rb, 'greeting = "hello"');
		expectToken(line, 'string', '"hello"');
	});

	it('marks interpolated double-quoted strings as string.template', () => {
		const line = tok(rb, 'msg = "hi #{name}!"');
		expectToken(line, 'string.template', '"hi #{name}!"');
	});

	it('keeps single-quoted strings literal even with #{ }', () => {
		const line = tok(rb, "raw = 'no #{interp} here'");
		expectToken(line, 'string', "'no #{interp} here'");
	});

	it('handles escapes inside double-quoted strings', () => {
		const line = tok(rb, 'path = "a\\"b\\nc"');
		expectToken(line, 'string', '"a\\"b\\nc"');
	});

	it('tokenizes percent word arrays', () => {
		const line = tok(rb, 'tags = %w[red green blue]');
		expectToken(line, 'string', '%w[red green blue]');
	});

	it('tokenizes percent symbol arrays', () => {
		const line = tok(rb, 'syms = %i(a b c)');
		expectToken(line, 'string', '%i(a b c)');
	});
});

describe('ruby: percent-literals beyond %w/%i', () => {
	it('tokenizes %q and %Q string literals as a single string token', () => {
		expectToken(tok(rb, 'a = %q{single quoted}'), 'string', '%q{single quoted}');
		// Regression: the inner `#{x}` must NOT bleed into a line comment.
		const dq = tok(rb, 'b = %Q<double #{x} quoted>');
		expectToken(dq, 'string', '%Q<double #{x} quoted>');
		expectLossless(dq, 'b = %Q<double #{x} quoted>');
	});

	it('tokenizes %r regex literals (with flags) as string.regex', () => {
		expectToken(tok(rb, 'e = %r{[a-z]+}i'), 'string.regex', '%r{[a-z]+}i');
	});

	it('tokenizes %x command literals as a string', () => {
		expectToken(tok(rb, 'f = %x(ls -la)'), 'string', '%x(ls -la)');
	});
});

describe('ruby: regex vs division', () => {
	it('treats a slash literal in value position as a regex', () => {
		expectToken(tok(rb, 'r = /foo.*bar/i'), 'string.regex', '/foo.*bar/i');
	});

	it('does not let a # inside a regex bleed into a line comment', () => {
		// Before the fix `#/` was tokenized as a `comment.line`, swallowing the close.
		const line = tok(rb, 'if line =~ /^\\s*#/');
		expectToken(line, 'string.regex', '/^\\s*#/');
		expectLossless(line, 'if line =~ /^\\s*#/');
	});

	it('recognizes a regex argument right after an opening paren or comma', () => {
		const line = tok(rb, 'gsub(/\\d+/, "N")');
		expectToken(line, 'string.regex', '/\\d+/');
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

	it('tokenizes quoted symbols', () => {
		const line = tok(rb, 'send(:"dynamic name")');
		expectToken(line, 'constant.builtin', ':"dynamic name"');
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
	it('tokenizes integers with underscores', () => {
		const line = tok(rb, 'big = 1_000_000');
		expectToken(line, 'number', '1_000_000');
	});

	it('tokenizes hex, binary, and octal', () => {
		expectToken(tok(rb, 'h = 0xFF'), 'number', '0xFF');
		expectToken(tok(rb, 'b = 0b1010'), 'number', '0b1010');
		expectToken(tok(rb, 'o = 0o17'), 'number', '0o17');
	});

	it('tokenizes floats with exponent', () => {
		const line = tok(rb, 'f = 3.14e-2');
		expectToken(line, 'number', '3.14e-2');
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
	it('treats a reserved word after a dot as a method, not a keyword', () => {
		// `obj.class` is the Object#class method, NOT the `class` definition keyword.
		const line = tok(rb, 'obj.class.name');
		expectToken(line, 'variable', 'obj');
		expectToken(line, 'variable', 'class');
		expectToken(line, 'variable', 'name');
		expectLossless(line, 'obj.class.name');
	});

	it('does not mark `.then`/`.begin`/`.end` after a dot as keywords', () => {
		const line = tok(rb, 'value.then { |v| v }');
		// `then` here is Object#then (yield_self), a method — must not be keyword.control.
		expectToken(line, 'variable', 'then');
		const ends = tok(rb, 'range.begin');
		expectToken(ends, 'variable', 'begin');
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

	it('still resolves a Capitalized member after a dot as a constant/type', () => {
		const line = tok(rb, 'mod.CONST');
		expectToken(line, 'type.class', 'CONST');
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
		expectToken(lines[4], 'number', '1');
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
});

describe('ruby: realistic lines', () => {
	it('tokenizes a method definition with interpolation', () => {
		const line = tok(rb, 'def greet(name) = "Hello, #{name}"');
		expectToken(line, 'keyword.definition', 'def');
		expectToken(line, 'function.call', 'greet');
		expectToken(line, 'variable', 'name');
		expectToken(line, 'string.template', '"Hello, #{name}"');
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
