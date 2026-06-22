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
	it('tokenizes decimal integers and underscores as number.integer', () => {
		expectToken(tok(swift, 'let n = 1_000_000'), 'number.integer', '1_000_000');
	});

	it('tokenizes hex, octal, and binary literals with precise subtypes', () => {
		expectToken(tok(swift, 'let h = 0xFF'), 'number.hex', '0xFF');
		// No octal subtype in the vocabulary -> integer.
		expectToken(tok(swift, 'let o = 0o17'), 'number.integer', '0o17');
		expectToken(tok(swift, 'let b = 0b1010'), 'number.binary', '0b1010');
	});

	it('tokenizes floats with exponents as number.float', () => {
		expectToken(tok(swift, 'let f = 3.14'), 'number.float', '3.14');
		expectToken(tok(swift, 'let e = 1.5e10'), 'number.float', '1.5e10');
		// Bare integers stay number.integer; a p-exponent hex float stays number.hex.
		expectToken(tok(swift, 'let i = 42'), 'number.integer', '42');
		expectToken(tok(swift, 'let hf = 0x1.8p3'), 'number.hex', '0x1.8p3');
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
	it('classifies a binding name as variable.definition and a use as variable', () => {
		// `let counter` is the DEFINING occurrence -> variable.definition.
		expectToken(tok(swift, 'let counter = 0'), 'variable.definition', 'counter');
		// A bare use of an identifier (the RHS) stays a plain variable.
		expectToken(tok(swift, 'total = counter'), 'variable', 'counter');
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

// ---------------------------------------------------------------------------
// A+ closures: interpolation sub-tokenization, escapes, number subtypes,
// member-access context, generics, definition naming, contextual keywords.
// Each `it` is a fail-before/pass-after regression for one closed gap.
// ---------------------------------------------------------------------------

describe('SwiftTokenizer - interpolation sub-tokenization', () => {
	it('sub-tokenizes a single interpolation with member access', () => {
		// Before: the whole `\(user.name)` body was one flat string.template token.
		const line = tok(swift, 'let s = "Hi \\(user.name)!"');
		expectToken(line, 'string.template', '\\(');
		expectToken(line, 'string.template', ')');
		expectToken(line, 'variable', 'user');
		expectToken(line, 'punctuation.accessor', '.');
		expectToken(line, 'property', 'name');
		expectToken(line, 'string', '"Hi ');
		expectLossless(line, 'let s = "Hi \\(user.name)!"');
	});

	it('sub-tokenizes an arithmetic interpolation with real number + operators', () => {
		const line = tok(swift, 'print("sum = \\(a + b * 2)")');
		expectToken(line, 'variable', 'a');
		expectToken(line, 'operator.arithmetic', '+');
		expectToken(line, 'operator.arithmetic', '*');
		expectToken(line, 'number.integer', '2');
		expectLossless(line, 'print("sum = \\(a + b * 2)")');
	});

	it('classifies a call inside interpolation as function.call', () => {
		const line = tok(swift, 'let t = "\\(obj.method(x).prop)"');
		expectToken(line, 'function.call', 'method');
		expectToken(line, 'property', 'prop');
		expectLossless(line, 'let t = "\\(obj.method(x).prop)"');
	});

	it('keeps a nested string literal inside interpolation as a string', () => {
		const line = tok(swift, 'Text("\\(item.price, specifier: "%.2f")")');
		expectToken(line, 'string', '"%.2f"');
		expectToken(line, 'property', 'price');
		expectLossless(line, 'Text("\\(item.price, specifier: "%.2f")")');
	});
});

describe('SwiftTokenizer - string escapes', () => {
	it('emits string.escape for \\n \\t \\" \\\\ and \\0', () => {
		const line = tok(swift, 'let s = "a\\tb\\nc\\"d\\\\e\\0"');
		expectToken(line, 'string.escape', '\\t');
		expectToken(line, 'string.escape', '\\n');
		expectToken(line, 'string.escape', '\\"');
		expectToken(line, 'string.escape', '\\\\');
		expectToken(line, 'string.escape', '\\0');
		expectLossless(line, 'let s = "a\\tb\\nc\\"d\\\\e\\0"');
	});

	it('emits string.escape for a unicode-scalar escape \\u{...}', () => {
		const line = tok(swift, 'let u = "\\u{1F600}!"');
		expectToken(line, 'string.escape', '\\u{1F600}');
		expectLossless(line, 'let u = "\\u{1F600}!"');
	});

	it('does not treat an unrecognized backslash as an escape token', () => {
		const line = tok(swift, 'let q = "\\q"');
		// `\q` is not a Swift escape — it stays plain string content, still lossless.
		expectTokenType(line, 'string');
		expectLossless(line, 'let q = "\\q"');
	});
});

describe('SwiftTokenizer - member access context', () => {
	it('classifies a leading dot member as property and a dot call as function.call', () => {
		const line = tok(swift, '.padding(.horizontal, 16)');
		expectToken(line, 'function.call', 'padding');
		expectToken(line, 'property', 'horizontal');
		expectLossless(line, '.padding(.horizontal, 16)');
	});

	it('classifies optional-chained members as properties', () => {
		const line = tok(swift, 'let v = obj?.value');
		expectToken(line, 'property', 'value');
		expectLossless(line, 'let v = obj?.value');
	});
});

describe('SwiftTokenizer - generics as bracket punctuation', () => {
	it('classifies generic < > and the >> close as punctuation.bracket', () => {
		const line = tok(swift, 'let d: Dictionary<String, Array<Int>> = [:]');
		expectToken(line, 'punctuation.bracket', '<');
		expectToken(line, 'punctuation.bracket', '>>');
		expectLossless(line, 'let d: Dictionary<String, Array<Int>> = [:]');
	});

	it('keeps a < or > used as comparison as an operator', () => {
		const lt = tok(swift, 'if a < b {}');
		expectToken(lt, 'operator', '<');
		const gt = tok(swift, 'if count > 10 {}');
		expectToken(gt, 'operator', '>');
	});

	it('keeps a shift operator >> as a single operator in value context', () => {
		const line = tok(swift, 'let m = bits >> 2');
		expectToken(line, 'operator', '>>');
		expectLossless(line, 'let m = bits >> 2');
	});

	it('classifies a generic instantiation name as function.call', () => {
		const line = tok(swift, 'let g = Foo<Bar>(value: 1)');
		expectToken(line, 'function.call', 'Foo');
		expectToken(line, 'punctuation.bracket', '<');
		expectToken(line, 'punctuation.bracket', '>');
		expectLossless(line, 'let g = Foo<Bar>(value: 1)');
	});
});

describe('SwiftTokenizer - definition naming context', () => {
	it('names a function definition as function.definition', () => {
		expectToken(tok(swift, 'func greet() {}'), 'function.definition', 'greet');
		expectToken(tok(swift, 'func map<T>(_ f: T) {}'), 'function.definition', 'map');
		expectToken(tok(swift, 'class func make() {}'), 'function.definition', 'make');
	});

	it('names type definitions, with protocol as type.interface', () => {
		expectToken(tok(swift, 'struct Point {}'), 'type.class', 'Point');
		expectToken(tok(swift, 'enum Color {}'), 'type.class', 'Color');
		expectToken(tok(swift, 'protocol Drawable {}'), 'type.interface', 'Drawable');
		expectToken(tok(swift, 'actor BankAccount {}'), 'type.class', 'BankAccount');
		expectToken(tok(swift, 'typealias Handler = () -> Void'), 'type.class', 'Handler');
	});

	it('names a let/var binding as variable.definition', () => {
		expectToken(tok(swift, 'let counter = 0'), 'variable.definition', 'counter');
		expectToken(tok(swift, 'var total = 0'), 'variable.definition', 'total');
	});
});

describe('SwiftTokenizer - contextual / soft keywords', () => {
	it('treats get/set as keywords in accessor position but not as identifiers', () => {
		const acc = tok(swift, 'var x: Int { get { return _x } set { _x = newValue } }');
		expectToken(acc, 'keyword', 'get');
		expectToken(acc, 'keyword', 'set');
		expectLossless(acc, 'var x: Int { get { return _x } set { _x = newValue } }');
		// `get` used as an ordinary binding name is NOT a keyword.
		expectToken(tok(swift, 'let get = 5'), 'variable.definition', 'get');
	});

	it('keeps class as storage in class func and as definition in class Foo', () => {
		expectToken(tok(swift, 'class func make() {}'), 'keyword.storage', 'class');
		expectToken(tok(swift, 'class Foo {}'), 'keyword.definition', 'class');
	});
});

describe('SwiftTokenizer - raw-string interpolation + escapes', () => {
	it('sub-tokenizes \\#( ) interpolation in a single-pound raw string', () => {
		const line = tok(swift, 'let r = #"path \\#(dir)/\\#(file)"#');
		expectToken(line, 'string.template', '\\#(');
		expectToken(line, 'variable', 'dir');
		expectToken(line, 'variable', 'file');
		expectLossless(line, 'let r = #"path \\#(dir)/\\#(file)"#');
	});

	it('keeps a \\n with the wrong pound count literal in a raw string', () => {
		const line = tok(swift, 'let r = #"literal \\n stays"#');
		// No string.escape token: `\n` is literal text in a raw string.
		expectTokenType(line, 'string');
		expectLossless(line, 'let r = #"literal \\n stays"#');
	});
});

describe('SwiftTokenizer - multi-line string threading with interpolation', () => {
	it('sub-tokenizes interpolation and escapes inside a triple-quoted block', () => {
		const lines = tokLines(swift, ['let s = """', 'Hi \\(name)!', 'tab\\there', '"""']);
		expectToken(lines[1], 'string.template', '\\(');
		expectToken(lines[1], 'variable', 'name');
		expectToken(lines[2], 'string.escape', '\\t');
		expectLossless(lines[1], 'Hi \\(name)!');
		expectLossless(lines[2], 'tab\\there');
	});

	it('threads a multi-line raw string and sub-tokenizes \\#( ) while keeping \\n literal', () => {
		const lines = tokLines(swift, ['let r = #"""', 'raw \\#(x)', 'lit \\n', '"""#']);
		expectToken(lines[1], 'string.template', '\\#(');
		expectToken(lines[1], 'variable', 'x');
		// `\n` in the raw block stays literal string content.
		expectTokenType(lines[2], 'string');
		expectLossless(lines[1], 'raw \\#(x)');
		expectLossless(lines[2], 'lit \\n');
	});
});
