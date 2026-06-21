import { describe, it } from 'vitest';
import { createCppTokenizer } from './cpp';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

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
	});

	describe('builtin types and constants', () => {
		it('classifies builtin scalar and fixed-width types', () => {
			const line = tok(cpp, 'unsigned long count = 0;');
			expectToken(line, 'type.builtin', 'unsigned');
			expectToken(line, 'type.builtin', 'long');
			expectToken(tok(cpp, 'uint32_t flags = 0;'), 'type.builtin', 'uint32_t');
		});

		it('classifies std and string as builtin types', () => {
			const line = tok(cpp, 'std::string name;');
			expectToken(line, 'type.builtin', 'std');
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
		it('tokenizes a double-quoted string', () => {
			const line = tok(cpp, 'const char* s = "hello";');
			expectToken(line, 'string', '"hello"');
		});

		it('handles escape sequences inside strings', () => {
			const line = tok(cpp, 'auto s = "line\\n\\t\\"end\\"";');
			expectToken(line, 'string', '"line\\n\\t\\"end\\""');
		});

		it('tokenizes plain and escaped char literals', () => {
			expectToken(tok(cpp, "char c = 'a';"), 'string', "'a'");
			expectToken(tok(cpp, "char nl = '\\n';"), 'string', "'\\n'");
		});

		it('tokenizes prefixed string literals (L and u8)', () => {
			expectToken(tok(cpp, 'auto w = L"wide";'), 'string', 'L"wide"');
			expectToken(tok(cpp, 'auto u = u8"utf8";'), 'string', 'u8"utf8"');
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
		it('tokenizes decimal, float, hex and binary literals', () => {
			expectToken(tok(cpp, 'double d = 3.14e2;'), 'number', '3.14e2');
			expectToken(tok(cpp, 'int mask = 0xFF00;'), 'number', '0xFF00');
			expectToken(tok(cpp, 'int b = 0b1010;'), 'number', '0b1010');
		});

		it('tokenizes numeric suffixes and digit separators', () => {
			expectToken(tok(cpp, 'auto u = 100u;'), 'number', '100u');
			expectToken(tok(cpp, 'auto f = 1.5f;'), 'number', '1.5f');
			expectToken(tok(cpp, "auto big = 1'000'000;"), 'number', "1'000'000");
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
			expectToken(line, 'function.call', 'max');
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
