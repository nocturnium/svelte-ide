import { describe, it, expect } from 'vitest';
import { createCppTokenizer } from './cpp';
import {
	tok,
	tokLines,
	expectToken,
	expectTokenType,
	expectLossless,
	findTokens
} from '../test-helpers';

const cpp = createCppTokenizer();

describe('C/C++ tokenizer', () => {
	describe('keywords', () => {
		it('classifies definition keywords (class/struct/enum/namespace)', () => {
			expectToken(tok(cpp, 'class Widget {'), 'keyword.definition', 'class');
			expectToken(tok(cpp, 'struct Point {'), 'keyword.definition', 'struct');
			expectToken(tok(cpp, 'enum Color {'), 'keyword.definition', 'enum');
			expectToken(tok(cpp, 'namespace nx {'), 'keyword.definition', 'namespace');
		});

		it('classifies storage and access specifiers as storage keywords', () => {
			const line = tok(cpp, 'static constexpr int kMax = 10;');
			expectToken(line, 'keyword.storage', 'static');
			expectToken(line, 'keyword.storage', 'constexpr');
			expectToken(tok(cpp, 'public:'), 'keyword.storage', 'public');
		});

		it('classifies control-flow keywords', () => {
			const line = tok(cpp, 'if (x) return y; else break;');
			expectToken(line, 'keyword.control', 'if');
			expectToken(line, 'keyword.control', 'return');
			expectToken(line, 'keyword.control', 'else');
			expectToken(line, 'keyword.control', 'break');
		});

		it('classifies using as a module keyword', () => {
			const line = tok(cpp, 'using namespace std;');
			expectToken(line, 'keyword.module', 'using');
		});

		it('classifies other keywords (new/sizeof)', () => {
			expectToken(tok(cpp, 'auto p = new Node();'), 'keyword', 'new');
			expectToken(tok(cpp, 'size_t n = sizeof buf;'), 'keyword', 'sizeof');
		});

		it('classifies C++20 coroutine keywords as control keywords', () => {
			// Regression: co_await/co_return/co_yield were mis-classified as variables.
			expectToken(tok(cpp, 'co_await task;'), 'keyword.control', 'co_await');
			expectToken(tok(cpp, 'co_return value;'), 'keyword.control', 'co_return');
			expectToken(tok(cpp, 'co_yield item;'), 'keyword.control', 'co_yield');
		});

		it('classifies concept/requires as definition keywords', () => {
			// Regression: concept/requires were mis-classified as variables.
			expectToken(
				tok(cpp, 'concept Integral = is_integral_v<T>;'),
				'keyword.definition',
				'concept'
			);
			expectToken(tok(cpp, 'requires std::copyable<T>'), 'keyword.definition', 'requires');
		});

		it('classifies consteval/constinit/noexcept as storage keywords', () => {
			// Regression: consteval/constinit were mis-classified as variables.
			expectToken(tok(cpp, 'consteval int sq(int n);'), 'keyword.storage', 'consteval');
			expectToken(tok(cpp, 'constinit int g;'), 'keyword.storage', 'constinit');
			expectToken(tok(cpp, 'void f() noexcept(true) {'), 'keyword.storage', 'noexcept');
		});

		it('classifies cast/sizeof-family keywords (not as function calls)', () => {
			// Regression: static_cast(...) and static_assert(...) were function.call/variable.
			expectToken(tok(cpp, 'static_cast<int>(d);'), 'keyword', 'static_cast');
			expectToken(tok(cpp, 'reinterpret_cast<T*>(p);'), 'keyword', 'reinterpret_cast');
			expectToken(tok(cpp, 'static_assert(true);'), 'keyword', 'static_assert');
			expectToken(tok(cpp, 'alignof(T);'), 'keyword', 'alignof');
		});

		it('classifies alternative operator keywords (and/or/not/bitand)', () => {
			// Regression: and/or/not/and_eq/bitand were mis-classified as variables.
			const line = tok(cpp, 'b = x and not y or z;');
			expectToken(line, 'keyword.operator', 'and');
			expectToken(line, 'keyword.operator', 'not');
			expectToken(line, 'keyword.operator', 'or');
			expectToken(tok(cpp, 'a and_eq bitand b;'), 'keyword.operator', 'and_eq');
		});

		it('classifies export/module as module keywords (C++20 modules)', () => {
			const line = tok(cpp, 'export module foo;');
			expectToken(line, 'keyword.module', 'export');
			expectToken(line, 'keyword.module', 'module');
			expectLossless(line, 'export module foo;');
		});
	});

	describe('builtin types and constants', () => {
		it('classifies builtin scalar and fixed-width types', () => {
			const line = tok(cpp, 'unsigned long count = 0;');
			expectToken(line, 'type.builtin', 'unsigned');
			expectToken(line, 'type.builtin', 'long');
			expectToken(tok(cpp, 'uint32_t flags = 0;'), 'type.builtin', 'uint32_t');
		});

		it('classifies std as a namespace and string as a builtin type', () => {
			const line = tok(cpp, 'std::string name;');
			expectToken(line, 'type.namespace', 'std');
			expectToken(line, 'type.builtin', 'string');
		});

		it('classifies true/false as boolean constants', () => {
			const line = tok(cpp, 'bool ok = true && false;');
			expectToken(line, 'constant.boolean', 'true');
			expectToken(line, 'constant.boolean', 'false');
		});

		it('classifies nullptr as null and NULL as builtin constant', () => {
			expectToken(tok(cpp, 'Node* p = nullptr;'), 'constant.null', 'nullptr');
			expectToken(tok(cpp, 'char* s = NULL;'), 'constant.builtin', 'NULL');
		});
	});

	describe('strings and char literals', () => {
		it('tokenizes a double-quoted string (opening quote, body, closing quote)', () => {
			const line = tok(cpp, 'const char* s = "hello";');
			// The literal is sub-tokenized: opening/closing quotes + the body run.
			expectToken(line, 'string', '"');
			expectToken(line, 'string', 'hello');
			expectLossless(line, 'const char* s = "hello";');
		});

		it('handles escape sequences inside strings as string.escape', () => {
			const line = tok(cpp, 'auto s = "line\\n\\t\\"end\\"";');
			// Each escape is its own string.escape token inside the surrounding string.
			expectToken(line, 'string.escape', '\\n');
			expectToken(line, 'string.escape', '\\t');
			expectToken(line, 'string.escape', '\\"');
			expectToken(line, 'string', 'line');
			expectLossless(line, 'auto s = "line\\n\\t\\"end\\"";');
		});

		it('tokenizes plain and escaped char literals', () => {
			const plain = tok(cpp, "char c = 'a';");
			expectToken(plain, 'string', "'");
			expectToken(plain, 'string', 'a');
			expectLossless(plain, "char c = 'a';");
			const esc = tok(cpp, "char nl = '\\n';");
			expectToken(esc, 'string.escape', '\\n');
			expectLossless(esc, "char nl = '\\n';");
		});

		it('tokenizes prefixed string literals (L and u8)', () => {
			const wide = tok(cpp, 'auto w = L"wide";');
			expectToken(wide, 'string', 'L"');
			expectToken(wide, 'string', 'wide');
			expectLossless(wide, 'auto w = L"wide";');
			const utf8 = tok(cpp, 'auto u = u8"utf8";');
			expectToken(utf8, 'string', 'u8"');
			expectLossless(utf8, 'auto u = u8"utf8";');
		});

		it('tokenizes a single-line raw string', () => {
			const line = tok(cpp, 'auto r = R"(a\\b"c)";');
			expectToken(line, 'string', 'R"(a\\b"c)"');
		});
	});

	describe('comments', () => {
		it('tokenizes line and single-line block comments', () => {
			expectToken(tok(cpp, 'int x = 1; // trailing'), 'comment.line', '// trailing');
			expectToken(tok(cpp, 'int /* inline */ y;'), 'comment.block', '/* inline */');
		});
	});

	describe('numbers', () => {
		it('tokenizes decimal, float, hex and binary literals with precise subtypes', () => {
			expectToken(tok(cpp, 'double d = 3.14e2;'), 'number.float', '3.14e2');
			expectToken(tok(cpp, 'int mask = 0xFF00;'), 'number.hex', '0xFF00');
			expectToken(tok(cpp, 'int b = 0b1010;'), 'number.binary', '0b1010');
			expectToken(tok(cpp, 'int n = 42;'), 'number.integer', '42');
		});

		it('tokenizes numeric suffixes and digit separators with subtypes', () => {
			expectToken(tok(cpp, 'auto u = 100u;'), 'number.integer', '100u');
			expectToken(tok(cpp, 'auto f = 1.5f;'), 'number.float', '1.5f');
			expectToken(tok(cpp, "auto big = 1'000'000;"), 'number.integer', "1'000'000");
		});

		it('keeps a user-defined literal suffix as part of the number', () => {
			// Regression: 1.0_km / 42_kg split the underscore-suffix into a phantom variable.
			// The subtype follows the base literal (float vs integer vs hex).
			expectToken(tok(cpp, 'auto dist = 1.0_km;'), 'number.float', '1.0_km');
			expectToken(tok(cpp, 'auto mass = 42_kg;'), 'number.integer', '42_kg');
			expectToken(tok(cpp, "auto h = 0xFF'00_rgb;"), 'number.hex', "0xFF'00_rgb");
		});

		it('keeps digit separators inside hex and binary literals', () => {
			expectToken(tok(cpp, "auto x = 0xFF'EC'DE'12;"), 'number.hex', "0xFF'EC'DE'12");
			expectToken(tok(cpp, "auto b = 0b1010'1100;"), 'number.binary', "0b1010'1100");
		});
	});

	describe('operators and punctuation', () => {
		it('classifies arithmetic, comparison and logical operators', () => {
			const line = tok(cpp, 'bool z = a + b < c && !d;');
			expectToken(line, 'operator.arithmetic', '+');
			expectToken(line, 'operator.comparison', '<');
			expectToken(line, 'operator.logical', '&&');
		});

		it('classifies :: and -> as accessors and brackets/braces correctly', () => {
			const line = tok(cpp, 'auto v = ns::obj->field;');
			expectToken(line, 'punctuation.accessor', '::');
			expectToken(line, 'punctuation.accessor', '->');
			const brackets = tok(cpp, 'arr[0] = {1};');
			expectToken(brackets, 'punctuation.bracket', '[');
			expectToken(brackets, 'punctuation.brace', '{');
		});

		it('treats ->* and .* as pointer-to-member accessors', () => {
			// Regression: .* was split into '.' + '*'; ->* must stay one token.
			expectToken(tok(cpp, 'ptr->*memfn();'), 'punctuation.accessor', '->*');
			const dotStar = tok(cpp, 'obj.*field = 5;');
			expectToken(dotStar, 'punctuation.accessor', '.*');
			expectLossless(dotStar, 'obj.*field = 5;');
		});

		it('does not mistake a trailing-dot float times x for .*', () => {
			// `3.*x` is the float `3.` followed by `* x`, not the `.*` operator.
			const line = tok(cpp, 'auto y = 3.*x;');
			expectToken(line, 'number.float', '3.');
			expectToken(line, 'operator.arithmetic', '*');
			expectLossless(line, 'auto y = 3.*x;');
		});

		it('keeps the three-way comparison <=> as one comparison operator', () => {
			const line = tok(cpp, 'auto c = (a <=> b);');
			// Regression: <=> must not be split into '<=' and '>'.
			expectToken(line, 'operator.comparison', '<=>');
			expectLossless(line, 'auto c = (a <=> b);');
		});
	});

	describe('identifiers, functions and macros', () => {
		it('marks an identifier followed by ( as a function call', () => {
			const line = tok(cpp, 'compute(value);');
			expectToken(line, 'function.call', 'compute');
		});

		it('marks plain identifiers as variables', () => {
			const line = tok(cpp, 'total = subtotal;');
			expectToken(line, 'variable', 'total');
			expectToken(line, 'variable', 'subtotal');
		});

		it('marks PascalCase as a type/class and SCREAMING_SNAKE as a constant', () => {
			expectToken(tok(cpp, 'Widget thing;'), 'type.class', 'Widget');
			expectToken(tok(cpp, 'int n = MAX_SIZE;'), 'constant', 'MAX_SIZE');
		});
	});

	describe('preprocessor directives', () => {
		it('tokenizes #include with angle-bracket and quoted headers', () => {
			const angle = tok(cpp, '#include <vector>');
			expectToken(angle, 'keyword.module', '#');
			expectToken(angle, 'keyword.module', 'include');
			expectToken(angle, 'string', '<vector>');
			const quoted = tok(cpp, '#include "widget.h"');
			expectToken(quoted, 'keyword.module', 'include');
			expectToken(quoted, 'string', '"widget.h"');
		});

		it('tokenizes #define, #ifndef and indented #pragma directives', () => {
			expectToken(tok(cpp, '#define MAX 100'), 'keyword.module', 'define');
			expectToken(tok(cpp, '#ifndef GUARD_H'), 'keyword.module', 'ifndef');
			const pragma = tok(cpp, '  #pragma once');
			expectToken(pragma, 'keyword.module', '#');
			expectToken(pragma, 'keyword.module', 'pragma');
		});
	});

	describe('multi-line constructs', () => {
		it('threads a block comment across lines', () => {
			const lines = tokLines(cpp, ['/* start', ' * middle', ' end */ int x;']);
			expectTokenType(lines[0], 'comment.block');
			expectTokenType(lines[1], 'comment.block');
			expectToken(lines[2], 'type.builtin', 'int');
		});

		it('threads a multi-line raw string across lines', () => {
			const lines = tokLines(cpp, ['auto q = R"sql(SELECT *', 'FROM t)sql";']);
			expectTokenType(lines[0], 'string');
			expectToken(lines[1], 'string', 'FROM t)sql"');
		});
	});

	describe('realistic lines', () => {
		it('tokenizes a templated function signature', () => {
			const line = tok(cpp, 'template <typename T> T max(T a, T b) {');
			expectToken(line, 'keyword.definition', 'template');
			expectToken(line, 'keyword.definition', 'typename');
			// A return-typed `name(` is a definition; the template <...> brackets are
			// generic punctuation, not comparison operators.
			expectToken(line, 'function.definition', 'max');
			expectToken(line, 'punctuation.bracket', '<');
			expectToken(line, 'punctuation.bracket', '>');
		});
	});

	describe('number subtypes (A+ closure)', () => {
		it('emits number.hex for hex literals (incl. digit separators)', () => {
			expectToken(tok(cpp, 'int m = 0xDEAD'), 'number.hex', '0xDEAD');
			expectToken(tok(cpp, "auto x = 0xFF'EC;"), 'number.hex', "0xFF'EC");
		});

		it('emits number.binary for binary literals', () => {
			expectToken(tok(cpp, 'int b = 0b1010;'), 'number.binary', '0b1010');
		});

		it('emits number.float for fractional, exponent, f-suffix and hex-float forms', () => {
			expectToken(tok(cpp, 'auto a = 3.14;'), 'number.float', '3.14');
			expectToken(tok(cpp, 'auto b = 1e9;'), 'number.float', '1e9');
			expectToken(tok(cpp, 'auto c = 2.0f;'), 'number.float', '2.0f');
			expectToken(tok(cpp, 'auto d = 3.;'), 'number.float', '3.');
			expectToken(tok(cpp, 'auto e = .5;'), 'number.float', '.5');
			// Hex float: a binary (p) exponent makes it a float, not a hex integer.
			expectToken(tok(cpp, 'auto h = 0x1.8p3;'), 'number.float', '0x1.8p3');
		});

		it('emits number.integer for plain, suffixed, octal and separated decimals', () => {
			expectToken(tok(cpp, 'int n = 42;'), 'number.integer', '42');
			expectToken(tok(cpp, 'auto u = 100u;'), 'number.integer', '100u');
			expectToken(tok(cpp, 'int o = 0777;'), 'number.integer', '0777');
			expectToken(tok(cpp, "auto big = 1'000'000;"), 'number.integer', "1'000'000");
		});

		it('inherits the base subtype across a user-defined-literal suffix', () => {
			expectToken(tok(cpp, 'auto a = 1.0_km;'), 'number.float', '1.0_km');
			expectToken(tok(cpp, 'auto b = 42_kg;'), 'number.integer', '42_kg');
			expectToken(tok(cpp, "auto c = 0xFF'00_rgb;"), 'number.hex', "0xFF'00_rgb");
		});
	});

	describe('string escape sub-tokenization (A+ closure)', () => {
		it('emits string.escape for simple, hex, unicode and octal escapes', () => {
			const simple = tok(cpp, 'auto s = "a\\n\\t\\\\b";');
			expectToken(simple, 'string.escape', '\\n');
			expectToken(simple, 'string.escape', '\\t');
			expectToken(simple, 'string.escape', '\\\\');
			expectLossless(simple, 'auto s = "a\\n\\t\\\\b";');

			const hexUni = tok(cpp, 'auto s = "\\x41\\u00e9\\U0001F600";');
			expectToken(hexUni, 'string.escape', '\\x41');
			expectToken(hexUni, 'string.escape', '\\u00e9');
			expectToken(hexUni, 'string.escape', '\\U0001F600');
			expectLossless(hexUni, 'auto s = "\\x41\\u00e9\\U0001F600";');

			const octal = tok(cpp, 'auto s = "\\033[0m";');
			expectToken(octal, 'string.escape', '\\033');
			// The non-escape remainder stays plain string.
			expectToken(octal, 'string', '[0m');
			expectLossless(octal, 'auto s = "\\033[0m";');
		});

		it('emits string.escape inside a character literal', () => {
			const c = tok(cpp, "char tab = '\\t';");
			expectToken(c, 'string.escape', '\\t');
			expectLossless(c, "char tab = '\\t';");
		});

		it('keeps the escaped quote inside the string (not a terminator)', () => {
			const s = tok(cpp, 'auto s = "say \\"hi\\"";');
			expectToken(s, 'string.escape', '\\"');
			// Exactly two escaped quotes, both string.escape; the literal stays one run.
			expectToken(s, 'string', 'say ');
			expectLossless(s, 'auto s = "say \\"hi\\"";');
		});

		it('does NOT sub-tokenize escapes inside a raw string', () => {
			const r = tok(cpp, 'auto r = R"(a\\nb)";');
			// Raw strings have no escapes: the whole literal is one string token.
			expectToken(r, 'string', 'R"(a\\nb)"');
			expect(findTokens(r, 'string.escape').length).toBe(0);
		});
	});

	describe('generic / template angle brackets (A+ closure)', () => {
		it('emits punctuation.bracket for type-argument < > and the closing >>', () => {
			const v = tok(cpp, 'std::vector<int> v;');
			expectToken(v, 'punctuation.bracket', '<');
			expectToken(v, 'punctuation.bracket', '>');
			expect(findTokens(v, 'operator.comparison').length).toBe(0);

			const nested = tok(cpp, 'map<int, vector<int>> m;');
			expectToken(nested, 'punctuation.bracket', '>>');
			expectLossless(nested, 'map<int, vector<int>> m;');
		});

		it('still treats < and > as comparison between plain values', () => {
			const cmp = tok(cpp, 'bool z = a < b && c > d;');
			const brackets = findTokens(cmp, 'punctuation.bracket');
			expect(brackets.length).toBe(0);
			expectToken(cmp, 'operator.comparison', '<');
			expectToken(cmp, 'operator.comparison', '>');
		});

		it('keeps << and >> as shift operators, not generic brackets', () => {
			const shift = tok(cpp, 'auto x = a << 2 >> 1;');
			expectToken(shift, 'operator', '<<');
			expectToken(shift, 'operator', '>>');
			expect(findTokens(shift, 'punctuation.bracket').length).toBe(0);
		});

		it('treats a cast/template angle list as brackets', () => {
			const cast = tok(cpp, 'static_cast<int>(d);');
			expectToken(cast, 'punctuation.bracket', '<');
			expectToken(cast, 'punctuation.bracket', '>');
		});

		it('does not mis-open a generic on std::cout << (shift after namespace member)', () => {
			const c = tok(cpp, 'std::cout << x;');
			expect(findTokens(c, 'punctuation.bracket').length).toBe(0);
			expectToken(c, 'operator', '<<');
		});
	});

	describe('member / property classification (A+ closure)', () => {
		it('classifies a non-call member after . or -> as a property', () => {
			expectToken(tok(cpp, 'auto v = obj.field;'), 'property', 'field');
			expectToken(tok(cpp, 'auto v = obj->field;'), 'property', 'field');
		});

		it('classifies a called member as a function.call, not a property', () => {
			const m = tok(cpp, 'obj->method();');
			expectToken(m, 'function.call', 'method');
			expect(findTokens(m, 'property').length).toBe(0);
		});

		it('classifies a chained data member as a property', () => {
			const chain = tok(cpp, 'a.b.c.d();');
			expectToken(chain, 'property', 'b');
			expectToken(chain, 'property', 'c');
			expectToken(chain, 'function.call', 'd');
		});

		it('classifies std as a namespace and a ::-qualified value as a property', () => {
			const s = tok(cpp, 'auto v = ns::value;');
			expectToken(s, 'property', 'value');
			expectToken(tok(cpp, 'std::cout << x;'), 'type.namespace', 'std');
		});
	});

	describe('contextual keywords and function definitions (A+ closure)', () => {
		it('classifies trailing override / final as keywords', () => {
			expectToken(tok(cpp, 'void f() override;'), 'keyword', 'override');
			expectToken(tok(cpp, 'class A final {};'), 'keyword', 'final');
		});

		it('treats final/override as a plain identifier outside specifier position', () => {
			// `int override = 0;` — override is just a variable name here.
			expectToken(tok(cpp, 'int override = 0;'), 'variable', 'override');
		});

		it('distinguishes a return-typed definition name from a bare call', () => {
			expectToken(tok(cpp, 'int compute(int x) {'), 'function.definition', 'compute');
			expectToken(tok(cpp, 'void run() {'), 'function.definition', 'run');
			expectToken(tok(cpp, 'compute(value);'), 'function.call', 'compute');
		});
	});

	describe('backslash line-continuation in string literals (A+ closure)', () => {
		it('threads a backslash-continued string across lines, escapes intact', () => {
			const lines = tokLines(cpp, ['auto s = "abc\\', 'def\\n";']);
			expectTokenType(lines[0], 'string');
			// Line two resumes the string, sub-tokenizes the \\n escape, and closes.
			expectToken(lines[1], 'string.escape', '\\n');
			expectToken(lines[1], 'string', '"');
			expectLossless(lines[0], 'auto s = "abc\\');
			expectLossless(lines[1], 'def\\n";');
		});
	});

	describe('lossless reconstruction', () => {
		it('is lossless on an indented statement', () => {
			const code = '\t\tstd::vector<int> nums = {1, 2, 3};';
			expectLossless(tok(cpp, code), code);
		});

		it('is lossless on a string with escapes', () => {
			const code = 'const char* path = "C:\\\\tmp\\\\file.txt\\n";';
			expectLossless(tok(cpp, code), code);
		});

		it('is lossless on a comment line', () => {
			const code = '    // TODO(jd): refactor this loop -> use std::transform';
			expectLossless(tok(cpp, code), code);
		});

		it('is lossless on a preprocessor include directive', () => {
			const code = '#  include <unordered_map>';
			expectLossless(tok(cpp, code), code);
		});

		it('is lossless across a multi-line raw string', () => {
			const lines = ['  auto json = R"json({', '    "k": "v"', '  })json";'];
			const results = tokLines(cpp, lines);
			for (let i = 0; i < lines.length; i++) {
				expectLossless(results[i], lines[i]);
			}
		});
	});
});
