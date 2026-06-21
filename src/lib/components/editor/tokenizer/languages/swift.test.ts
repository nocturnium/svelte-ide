import { describe, it } from 'vitest';
import { createSwiftTokenizer } from './swift';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const swift = createSwiftTokenizer();

describe('SwiftTokenizer - keywords', () => {
	it('classifies definition keywords', () => {
		expectToken(tok(swift, 'func greet() {}'), 'keyword.definition', 'func');
		expectToken(tok(swift, 'class Foo {}'), 'keyword.definition', 'class');
		expectToken(tok(swift, 'struct Point {}'), 'keyword.definition', 'struct');
		expectToken(tok(swift, 'enum Direction {}'), 'keyword.definition', 'enum');
		expectToken(tok(swift, 'protocol Drawable {}'), 'keyword.definition', 'protocol');
		expectToken(tok(swift, 'extension String {}'), 'keyword.definition', 'extension');
	});

	it('classifies storage / modifier keywords', () => {
		expectToken(tok(swift, 'let x = 1'), 'keyword.storage', 'let');
		expectToken(tok(swift, 'var y = 2'), 'keyword.storage', 'var');
		expectToken(tok(swift, 'private func f() {}'), 'keyword.storage', 'private');
		expectToken(tok(swift, 'static let shared = 0'), 'keyword.storage', 'static');
		expectToken(tok(swift, 'weak var delegate: Foo?'), 'keyword.storage', 'weak');
		expectToken(tok(swift, 'override func go() {}'), 'keyword.storage', 'override');
	});

	it('classifies control-flow keywords', () => {
		expectToken(tok(swift, 'if cond {}'), 'keyword.control', 'if');
		expectToken(tok(swift, 'guard let v = x else {}'), 'keyword.control', 'guard');
		expectToken(tok(swift, 'for i in items {}'), 'keyword.control', 'for');
		expectToken(tok(swift, 'switch value {}'), 'keyword.control', 'switch');
		expectToken(tok(swift, 'return result'), 'keyword.control', 'return');
		expectToken(tok(swift, 'try parse()'), 'keyword.control', 'try');
	});

	it('classifies import as a module keyword', () => {
		expectToken(tok(swift, 'import Foundation'), 'keyword.module', 'import');
	});

	it('classifies other keywords (self, as, is, some, inout)', () => {
		expectToken(tok(swift, 'self.value = 1'), 'keyword', 'self');
		expectToken(tok(swift, 'x as Int'), 'keyword', 'as');
		expectToken(tok(swift, 'x is String'), 'keyword', 'is');
		expectToken(tok(swift, 'var body: some View'), 'keyword', 'some');
	});

	it('classifies concurrency keywords async / await / rethrows', () => {
		// Regression: `async` and `await` previously fell through to `variable`,
		// and `rethrows` (sibling of the handled `throws`) was also unrecognized.
		expectToken(tok(swift, 'func f() async {}'), 'keyword.control', 'async');
		expectToken(tok(swift, 'let r = await fetch()'), 'keyword.control', 'await');
		expectToken(
			tok(swift, 'func f(_ b: () throws -> Void) rethrows {}'),
			'keyword.control',
			'rethrows'
		);
		// `async let` is a concurrency binding; `async` must still be a keyword here.
		const al = tok(swift, 'async let value = load()');
		expectToken(al, 'keyword.control', 'async');
		expectToken(al, 'keyword.storage', 'let');
		expectLossless(al, 'async let value = load()');
	});

	it('classifies declaration keywords init / deinit / subscript / actor / operator', () => {
		// Regression: `init` and `subscript` were mis-typed as function.call (they are
		// followed by `(`), and `deinit` / `actor` / `operator` fell through to variable.
		expectToken(tok(swift, 'init(x: Int) {}'), 'keyword.definition', 'init');
		expectToken(tok(swift, 'deinit {}'), 'keyword.definition', 'deinit');
		expectToken(tok(swift, 'subscript(i: Int) -> Int {}'), 'keyword.definition', 'subscript');
		expectToken(tok(swift, 'actor BankAccount {}'), 'keyword.definition', 'actor');
		const op = tok(swift, 'static func == (l: P, r: P) -> Bool {}');
		expectLossless(op, 'static func == (l: P, r: P) -> Bool {}');
		expectToken(tok(swift, 'infix operator +-: Additive'), 'keyword.definition', 'operator');
	});
});

describe('SwiftTokenizer - constants', () => {
	it('classifies true/false as booleans', () => {
		expectToken(tok(swift, 'let ok = true'), 'constant.boolean', 'true');
		expectToken(tok(swift, 'let no = false'), 'constant.boolean', 'false');
	});

	it('classifies nil as null', () => {
		expectToken(tok(swift, 'var x: Int? = nil'), 'constant.null', 'nil');
	});
});

describe('SwiftTokenizer - builtin types', () => {
	it('classifies builtin types', () => {
		expectToken(tok(swift, 'let n: Int = 0'), 'type.builtin', 'Int');
		expectToken(tok(swift, 'let s: String = ""'), 'type.builtin', 'String');
		expectToken(tok(swift, 'let arr: Array<Int> = []'), 'type.builtin', 'Array');
		expectToken(tok(swift, 'let b: Bool = true'), 'type.builtin', 'Bool');
		expectToken(tok(swift, 'func f() -> Void {}'), 'type.builtin', 'Void');
	});

	it('classifies PascalCase user types as type.class', () => {
		expectToken(tok(swift, 'let p: Point = origin'), 'type.class', 'Point');
		expectToken(tok(swift, 'var view: ContentView'), 'type.class', 'ContentView');
	});
});

describe('SwiftTokenizer - strings', () => {
	it('tokenizes a simple double-quoted string', () => {
		expectToken(tok(swift, 'let s = "hello"'), 'string', '"hello"');
	});

	it('handles escapes inside strings', () => {
		const line = tok(swift, 'let s = "a\\"b\\n"');
		expectTokenType(line, 'string');
		expectLossless(line, 'let s = "a\\"b\\n"');
	});

	it('emits interpolation markers as string.template', () => {
		const line = tok(swift, 'let s = "Hi \\(name)!"');
		expectToken(line, 'string.template', '\\(');
		expectTokenType(line, 'string.template');
		expectLossless(line, 'let s = "Hi \\(name)!"');
	});

	it('handles interpolation with a nested call', () => {
		const line = tok(swift, 'print("sum = \\(a + b)")');
		expectTokenType(line, 'string.template');
		expectLossless(line, 'print("sum = \\(a + b)")');
	});

	it('tokenizes a single-line triple-quoted string', () => {
		expectToken(tok(swift, 'let s = """one"""'), 'string', '"""one"""');
	});
});

describe('SwiftTokenizer - comments', () => {
	it('tokenizes line comments', () => {
		expectToken(tok(swift, '// a comment'), 'comment.line', '// a comment');
	});

	it('tokenizes a single-line block comment', () => {
		expectToken(tok(swift, 'let x = 1 /* note */'), 'comment.block', '/* note */');
	});

	it('handles a nested block comment on one line', () => {
		const line = tok(swift, '/* outer /* inner */ still */');
		expectToken(line, 'comment.block', '/* outer /* inner */ still */');
		expectLossless(line, '/* outer /* inner */ still */');
	});
});

describe('SwiftTokenizer - numbers', () => {
	it('tokenizes decimal integers and underscores', () => {
		expectToken(tok(swift, 'let n = 1_000_000'), 'number', '1_000_000');
	});

	it('tokenizes hex, octal, and binary literals', () => {
		expectToken(tok(swift, 'let h = 0xFF'), 'number', '0xFF');
		expectToken(tok(swift, 'let o = 0o17'), 'number', '0o17');
		expectToken(tok(swift, 'let b = 0b1010'), 'number', '0b1010');
	});

	it('tokenizes floats with exponents', () => {
		expectToken(tok(swift, 'let f = 3.14'), 'number', '3.14');
		expectToken(tok(swift, 'let e = 1.5e10'), 'number', '1.5e10');
	});
});

describe('SwiftTokenizer - operators', () => {
	it('classifies assignment, comparison, logical, arithmetic', () => {
		expectToken(tok(swift, 'x = 1'), 'operator.assignment', '=');
		expectToken(tok(swift, 'a == b'), 'operator.comparison', '==');
		expectToken(tok(swift, 'a && b'), 'operator.logical', '&&');
		expectToken(tok(swift, 'a + b'), 'operator.arithmetic', '+');
	});

	it('tokenizes the nil-coalescing and range operators', () => {
		expectToken(tok(swift, 'let v = a ?? b'), 'operator', '??');
		expectToken(tok(swift, 'for i in 0...10 {}'), 'operator', '...');
		expectToken(tok(swift, 'for i in 0..<n {}'), 'operator', '..<');
	});

	it('tokenizes the function arrow', () => {
		expectToken(tok(swift, 'func f() -> Int {}'), 'operator', '->');
	});
});

describe('SwiftTokenizer - identifiers, builtins, attributes', () => {
	it('classifies a plain identifier as variable', () => {
		expectToken(tok(swift, 'let counter = 0'), 'variable', 'counter');
	});

	it('classifies a function call', () => {
		expectToken(tok(swift, 'doWork()'), 'function.call', 'doWork');
	});

	it('classifies attributes as keyword', () => {
		expectToken(tok(swift, '@objc func f() {}'), 'keyword', '@objc');
		expectToken(tok(swift, '@escaping closure'), 'keyword', '@escaping');
	});
});

describe('SwiftTokenizer - multi-line constructs', () => {
	it('threads a multi-line block comment across lines', () => {
		const lines = tokLines(swift, ['/* start', 'middle', 'end */ let x = 1']);
		expectToken(lines[0], 'comment.block', '/* start');
		expectToken(lines[1], 'comment.block', 'middle');
		expectToken(lines[2], 'comment.block', 'end */');
		expectToken(lines[2], 'keyword.storage', 'let');
	});

	it('threads a nested multi-line block comment correctly', () => {
		const lines = tokLines(swift, ['/* a /* b', 'still in */ inner */ done']);
		expectToken(lines[0], 'comment.block', '/* a /* b');
		expectToken(lines[1], 'comment.block', 'still in */ inner */');
		expectToken(lines[1], 'variable', 'done');
	});

	it('threads a triple-quoted multi-line string across lines', () => {
		const lines = tokLines(swift, ['let s = """', 'line one', 'line two', '""" + tail']);
		expectToken(lines[0], 'string', '"""');
		expectToken(lines[1], 'string', 'line one');
		expectToken(lines[2], 'string', 'line two');
		expectToken(lines[3], 'string', '"""');
		expectLossless(lines[1], 'line one');
	});
});

describe('SwiftTokenizer - compiler directives', () => {
	it('classifies #if / #endif as single keyword lexemes, not split # + control', () => {
		// Regression: `#if` was emitted as a bare `#` text token followed by the
		// control keyword `if`, and `#endif` as `#` + variable `endif`.
		const a = tok(swift, '#if DEBUG');
		expectToken(a, 'keyword', '#if');
		expectLossless(a, '#if DEBUG');
		const b = tok(swift, '#endif');
		expectToken(b, 'keyword', '#endif');
		expectLossless(b, '#endif');
	});

	it('classifies #available / #selector / #warning as directive keywords', () => {
		// Regression: these were emitted as `#` text + a `function.call` token.
		expectToken(tok(swift, '#available(iOS 15, *)'), 'keyword', '#available');
		expectToken(tok(swift, '#selector(MyClass.method)'), 'keyword', '#selector');
		expectToken(tok(swift, '#warning("nope")'), 'keyword', '#warning');
	});
});

describe('SwiftTokenizer - raw strings', () => {
	it('keeps a single-pound raw string as one string token', () => {
		const line = tok(swift, 'let r = #"no \\(interp) here"#');
		expectToken(line, 'string', '#"no \\(interp) here"#');
		expectLossless(line, 'let r = #"no \\(interp) here"#');
	});

	it('does not let an embedded "# close a two-pound raw string early', () => {
		// Regression: `##"... "# ..."##` ended at the first plain `"`, leaking the
		// remainder back into code (the inner `"#` is NOT the closing delimiter).
		const line = tok(swift, 'let r2 = ##"two pounds "# inside"##');
		expectToken(line, 'string', '##"two pounds "# inside"##');
		expectLossless(line, 'let r2 = ##"two pounds "# inside"##');
	});

	it('threads a multi-line raw string and closes on the pounded delimiter', () => {
		const lines = tokLines(swift, ['let rb = #"""', '    raw block', '    """#']);
		expectToken(lines[0], 'string', '#"""');
		expectToken(lines[1], 'string', '    raw block');
		expectToken(lines[2], 'string', '    """#');
		expectLossless(lines[1], '    raw block');
	});
});

describe('SwiftTokenizer - realistic lines', () => {
	it('tokenizes a guard-let with multiple token kinds', () => {
		const line = tok(swift, '    guard let value = optional else { return nil }');
		expectToken(line, 'keyword.control', 'guard');
		expectToken(line, 'keyword.storage', 'let');
		expectToken(line, 'keyword.control', 'else');
		expectToken(line, 'constant.null', 'nil');
		expectLossless(line, '    guard let value = optional else { return nil }');
	});

	it('tokenizes a function definition signature losslessly', () => {
		const line = tok(swift, 'func add(_ a: Int, _ b: Int) -> Int {');
		expectToken(line, 'keyword.definition', 'func');
		expectToken(line, 'type.builtin', 'Int');
		expectLossless(line, 'func add(_ a: Int, _ b: Int) -> Int {');
	});
});
