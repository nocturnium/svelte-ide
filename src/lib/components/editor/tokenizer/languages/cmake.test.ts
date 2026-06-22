import { describe, it, expect } from 'vitest';
import { createCMakeTokenizer } from './cmake';
import {
	tok,
	tokLines,
	findTokens,
	expectToken,
	expectTokenType,
	expectLossless
} from '../test-helpers';

const t = createCMakeTokenizer();

describe('cmake: commands and keywords', () => {
	it('classifies a control-flow command as keyword.control', () => {
		const line = tok(t, 'if(BUILD_TESTS)');
		expectToken(line, 'keyword.control', 'if');
		expectToken(line, 'punctuation.paren', '(');
		expectToken(line, 'punctuation.paren', ')');
	});

	it('classifies endif/foreach/endforeach as control keywords, case-insensitively', () => {
		expectToken(tok(t, 'endif()'), 'keyword.control', 'endif');
		expectToken(tok(t, 'foreach(x IN LISTS srcs)'), 'keyword.control', 'foreach');
		expectToken(tok(t, 'endforeach()'), 'keyword.control', 'endforeach');
		expectToken(tok(t, 'IF(WIN32)'), 'keyword.control', 'IF');
		expectToken(tok(t, 'EndIf()'), 'keyword.control', 'EndIf');
	});

	it('classifies known builtin commands as keyword.module', () => {
		expectToken(tok(t, 'project(MyApp)'), 'keyword.module', 'project');
	});

	it('classifies cmake_minimum_required as keyword.module', () => {
		const line = tok(t, 'cmake_minimum_required(VERSION 3.20)');
		expectToken(line, 'keyword.module', 'cmake_minimum_required');
		expectToken(line, 'number.float', '3.20');
	});

	it('classifies an unknown command-with-paren as function.call', () => {
		const line = tok(t, 'my_custom_macro(arg1 arg2)');
		expectToken(line, 'function.call', 'my_custom_macro');
	});

	it('does not treat a bare argument word as a command', () => {
		const line = tok(t, 'set(SOURCES main.cpp)');
		expectToken(line, 'keyword.module', 'set');
		// `SOURCES` is an argument, not followed by `(`.
		expectToken(line, 'variable', 'SOURCES');
	});

	it('classifies a builtin command with whitespace before the paren (valid grammar)', () => {
		// CMake's grammar permits blanks between a command name and its `(`,
		// so `set (X 1)` is identical to `set(X 1)`.
		const line = tok(t, 'set (X 1)');
		expectToken(line, 'keyword.module', 'set');
		expectToken(line, 'punctuation.paren', '(');
		expectLossless(line, 'set (X 1)');
	});

	it('classifies a control command with whitespace before the paren', () => {
		const line = tok(t, 'if (WIN32)');
		expectToken(line, 'keyword.control', 'if');
		expectLossless(line, 'if (WIN32)');
	});

	it('does not mistake a bare argument word before a sub-group for a command', () => {
		// `bar` precedes `(baz)` but is an argument, not a call — must stay a variable.
		const line = tok(t, 'set(FOO bar (baz))');
		expectToken(line, 'keyword.module', 'set');
		expectToken(line, 'variable', 'bar');
		expectLossless(line, 'set(FOO bar (baz))');
	});
});

describe('cmake: conditional operators', () => {
	it('classifies AND/OR/NOT inside if() as keyword.operator', () => {
		const line = tok(t, 'if(A AND B OR NOT C)');
		expectToken(line, 'keyword.operator', 'AND');
		expectToken(line, 'keyword.operator', 'OR');
		expectToken(line, 'keyword.operator', 'NOT');
		expectLossless(line, 'if(A AND B OR NOT C)');
	});

	it('classifies comparison/test operators inside if() as keyword.operator', () => {
		expectToken(tok(t, 'if(DEFINED X)'), 'keyword.operator', 'DEFINED');
		expectToken(tok(t, 'if(EXISTS "/p")'), 'keyword.operator', 'EXISTS');
		expectToken(tok(t, 'if(X STREQUAL "y")'), 'keyword.operator', 'STREQUAL');
		expectToken(tok(t, 'if(VERSION_LESS 1.2 1.3)'), 'keyword.operator', 'VERSION_LESS');
		expectToken(tok(t, 'while(I LESS 10)'), 'keyword.operator', 'LESS');
	});

	it('does NOT treat operator-named scope keywords outside a condition as operators', () => {
		// TARGET is a scope keyword to set_property, not an if() operator.
		const sp = tok(t, 'set_property(TARGET t PROPERTY P V)');
		expectToken(sp, 'variable', 'TARGET');
		// COMMAND is an argument keyword to add_test, not an operator.
		const at = tok(t, 'add_test(NAME t COMMAND exe)');
		expectToken(at, 'variable', 'COMMAND');
		// A bare AND outside any condition is just an argument word.
		expectToken(tok(t, 'set(X AND)'), 'variable', 'AND');
	});

	it('tracks operator context across nested parens and wrapped lines', () => {
		const nested = tok(t, 'if(NOT (A OR B) AND C)');
		expectToken(nested, 'keyword.operator', 'NOT');
		expectToken(nested, 'keyword.operator', 'OR');
		expectToken(nested, 'keyword.operator', 'AND');

		const lines = tokLines(t, ['if(A AND', '   B OR EXISTS x)', 'set(AND 1)']);
		expectToken(lines[0], 'keyword.operator', 'AND');
		expectToken(lines[1], 'keyword.operator', 'OR');
		expectToken(lines[1], 'keyword.operator', 'EXISTS');
		// Once the condition closes, AND is a plain argument again.
		expectToken(lines[2], 'variable', 'AND');
	});
});

describe('cmake: variables', () => {
	it('sub-tokenizes a ${VAR} reference into delimiter + brace + name', () => {
		const line = tok(t, 'message(${PROJECT_NAME})');
		// `$` delimiter, `{`/`}` braces, and the inner name each get a real type.
		expectToken(line, 'string.template', '$');
		expectToken(line, 'punctuation.brace', '{');
		expectToken(line, 'variable', 'PROJECT_NAME');
		expectToken(line, 'punctuation.brace', '}');
		expectLossless(line, 'message(${PROJECT_NAME})');
	});

	it('sub-tokenizes a $ENV{VAR} reference keeping the namespace on the delimiter', () => {
		const line = tok(t, 'set(PATH $ENV{PATH})');
		// `$ENV` reads as the interpolation delimiter; PATH as the variable name.
		expectToken(line, 'string.template', '$ENV');
		expectToken(line, 'variable', 'PATH');
		expectLossless(line, 'set(PATH $ENV{PATH})');
	});

	it('sub-tokenizes a $CACHE{VAR} reference', () => {
		const line = tok(t, 'message($CACHE{MY_OPTION})');
		expectToken(line, 'string.template', '$CACHE');
		expectToken(line, 'variable', 'MY_OPTION');
		expectLossless(line, 'message($CACHE{MY_OPTION})');
	});

	it('sub-tokenizes a nested ${${inner}} reference, naming the inner var', () => {
		const line = tok(t, 'set(x ${${prefix}_SUFFIX})');
		// The inner reference is recursively split; `prefix` is its own name token
		// and the surrounding `_SUFFIX` literal is a variable name too.
		expectToken(line, 'variable', 'prefix');
		expectToken(line, 'variable', '_SUFFIX');
		// Two opening and two closing braces, one per nesting level.
		expect(findTokens(line, 'punctuation.brace').filter((x) => x.text === '{').length).toBe(2);
		expect(findTokens(line, 'punctuation.brace').filter((x) => x.text === '}').length).toBe(2);
		expectLossless(line, 'set(x ${${prefix}_SUFFIX})');
	});

	it('threads an unterminated ${ across nothing but stays lossless (best effort)', () => {
		const line = tok(t, 'message(${UNCLOSED');
		expectToken(line, 'string.template', '$');
		expectToken(line, 'variable', 'UNCLOSED');
		expectLossless(line, 'message(${UNCLOSED');
	});
});

describe('cmake: strings', () => {
	it('tokenizes a double-quoted string (open/body/close as string tokens)', () => {
		const line = tok(t, 'message("Hello, world")');
		// The string is emitted as quote + body + quote, all typed `string`.
		expectToken(line, 'string', '"');
		expectToken(line, 'string', 'Hello, world');
		expectLossless(line, 'message("Hello, world")');
	});

	it('sub-tokenizes a ${var} embedded in a double-quoted string', () => {
		const line = tok(t, 'set(MSG "version ${VERSION}")');
		// The literal halves stay `string`; the interpolation is split out.
		expectToken(line, 'string', '"');
		expectToken(line, 'string', 'version ');
		expectToken(line, 'string.template', '$');
		expectToken(line, 'variable', 'VERSION');
		expectLossless(line, 'set(MSG "version ${VERSION}")');
	});

	it('sub-tokenizes a generator expression embedded in a string', () => {
		const line = tok(t, 'set(X "$<TARGET_PROPERTY:t,INCLUDE_DIRECTORIES>")');
		expectToken(line, 'string.template', '$<');
		expectToken(line, 'function.call', 'TARGET_PROPERTY');
		expectToken(line, 'punctuation.separator', ':');
		expectToken(line, 'punctuation.separator', ',');
		expectToken(line, 'string.template', '>');
		expectLossless(line, 'set(X "$<TARGET_PROPERTY:t,INCLUDE_DIRECTORIES>")');
	});

	it('tokenizes a bracket argument [[ ... ]] as a string', () => {
		const line = tok(t, 'message([[raw \\ no escapes]])');
		expectToken(line, 'string', '[[raw \\ no escapes]]');
	});

	it('tokenizes an equals-level bracket argument [=[ ... ]=] as a string', () => {
		const line = tok(t, 'set(X [=[has ]] inside]=])');
		expectToken(line, 'string', '[=[has ]] inside]=]');
	});
});

describe('cmake: comments', () => {
	it('tokenizes a full-line comment', () => {
		const line = tok(t, '# configure the build');
		expectToken(line, 'comment.line', '# configure the build');
	});

	it('tokenizes a trailing comment after a command', () => {
		const line = tok(t, 'project(App) # the application');
		expectToken(line, 'keyword.module', 'project');
		expectToken(line, 'comment.line', '# the application');
	});

	it('tokenizes a single-line bracket comment #[[ ... ]]', () => {
		const line = tok(t, '#[[ inline note ]]');
		expectToken(line, 'comment.block', '#[[ inline note ]]');
	});
});

describe('cmake: numbers', () => {
	it('classifies an integer as number.integer', () => {
		expectToken(tok(t, 'set(COUNT 42)'), 'number.integer', '42');
	});

	it('classifies a version-like float as number.float', () => {
		expectToken(tok(t, 'set(VERSION 1.5)'), 'number.float', '1.5');
		// Version triples and exponents are floats too.
		expectToken(tok(t, 'set(V 1.2.3)'), 'number.float', '1.2.3');
		expectToken(tok(t, 'set(F 3.14e10)'), 'number.float', '3.14e10');
	});

	it('classifies a bare hexadecimal literal as number.hex', () => {
		expectToken(tok(t, 'if(X EQUAL 0x1A)'), 'number.hex', '0x1A');
		expectToken(tok(t, 'set(MASK 0XFF)'), 'number.hex', '0XFF');
	});

	it('does not swallow a digit-led identifier as a number', () => {
		// `2nd` is not a number — CMake identifiers cannot start with a digit, but a
		// trailing identifier char means the leading digits were never a number.
		const line = tok(t, 'set(X 2nd)');
		expect(findTokens(line, 'number.integer').length).toBe(0);
		expectLossless(line, 'set(X 2nd)');
	});
});

describe('cmake: operators and punctuation', () => {
	it('tokenizes parentheses as paren punctuation and a bare assignment', () => {
		const line = tok(t, 'enable_testing()');
		expectToken(line, 'punctuation.paren', '(');
		expectToken(line, 'punctuation.paren', ')');
		expectToken(tok(t, 'set(ENV{FOO}=bar)'), 'operator.assignment', '=');
	});

	it('tokenizes a list separator semicolon', () => {
		const line = tok(t, 'set(LIBS a;b;c)');
		expectToken(line, 'punctuation.separator', ';');
	});
});

describe('cmake: constants and builtins', () => {
	it('classifies ON/OFF as boolean constants', () => {
		expectToken(tok(t, 'option(USE_FOO "use foo" ON)'), 'constant.boolean', 'ON');
		expectToken(tok(t, 'set(BAR OFF)'), 'constant.boolean', 'OFF');
	});

	it('classifies TRUE/FALSE/YES/NO as boolean constants', () => {
		expectToken(tok(t, 'set(A TRUE)'), 'constant.boolean', 'TRUE');
		expectToken(tok(t, 'set(B FALSE)'), 'constant.boolean', 'FALSE');
		expectToken(tok(t, 'set(C YES)'), 'constant.boolean', 'YES');
		expectToken(tok(t, 'set(D NO)'), 'constant.boolean', 'NO');
	});

	it('sub-tokenizes a nested generator expression', () => {
		const line = tok(t, 'target_compile_options(t PRIVATE $<$<CONFIG:Debug>:-g>)');
		// `$<` / `>` are the gen-expr delimiters, CONFIG the expression name, the `:`
		// a separator, and the literal payload constant.builtin.
		expectToken(line, 'string.template', '$<');
		expectToken(line, 'function.call', 'CONFIG');
		expectToken(line, 'punctuation.separator', ':');
		expectToken(line, 'constant.builtin', 'Debug');
		expectToken(line, 'string.template', '>');
		expectLossless(line, 'target_compile_options(t PRIVATE $<$<CONFIG:Debug>:-g>)');
	});
});

describe('cmake: multi-line constructs', () => {
	it('threads a multi-line bracket comment across lines', () => {
		const lines = tokLines(t, ['#[[ this comment', 'spans several', 'lines ]]', 'project(App)']);
		expectToken(lines[0], 'comment.block', '#[[ this comment');
		expectToken(lines[1], 'comment.block', 'spans several');
		expectToken(lines[2], 'comment.block', 'lines ]]');
		// Code resumes normally after the comment closes.
		expectToken(lines[3], 'keyword.module', 'project');
	});

	it('threads a multi-line equals-level bracket argument', () => {
		const lines = tokLines(t, ['set(DOC [=[ first line', 'second ]] still in', 'done ]=])']);
		expectToken(lines[0], 'keyword.module', 'set');
		expectTokenType(lines[0], 'string');
		expectTokenType(lines[1], 'string');
		expectToken(lines[2], 'string', 'done ]=]');
	});

	it('threads a multi-line double-quoted string', () => {
		const lines = tokLines(t, ['message("line one', 'line two")', 'project(App)']);
		expectTokenType(lines[0], 'string');
		expectTokenType(lines[1], 'string');
		expectToken(lines[2], 'keyword.module', 'project');
	});

	it('sub-tokenizes interpolation on BOTH lines of a multi-line string', () => {
		const lines = tokLines(t, ['set(S "first ${A}', 'second ${B}")', 'project(App)']);
		// Interpolation is sub-tokenized on the opening line...
		expectToken(lines[0], 'variable', 'A');
		expectToken(lines[0], 'string.template', '$');
		// ...and on the continuation line, which still resumes inside the string.
		expectToken(lines[1], 'variable', 'B');
		expectToken(lines[1], 'string.template', '$');
		// Code resumes after the string closes.
		expectToken(lines[2], 'keyword.module', 'project');
		expectLossless(lines[0], 'set(S "first ${A}');
		expectLossless(lines[1], 'second ${B}")');
	});

	it('threads a generator expression split across two lines of a string', () => {
		const lines = tokLines(t, ['set(G "$<CONFIG:', 'Debug>")']);
		expectToken(lines[0], 'string.template', '$<');
		expectToken(lines[0], 'function.call', 'CONFIG');
		expectLossless(lines[0], 'set(G "$<CONFIG:');
		expectLossless(lines[1], 'Debug>")');
	});
});

describe('cmake: string escapes', () => {
	it('emits string.escape for an escaped quote and a newline escape', () => {
		const line = tok(t, 'message("path \\"${DIR}\\" now\\n")');
		expectToken(line, 'string.escape', '\\"');
		expectToken(line, 'string.escape', '\\n');
		// Interpolation between the escapes is still sub-tokenized.
		expectToken(line, 'variable', 'DIR');
		expectLossless(line, 'message("path \\"${DIR}\\" now\\n")');
	});

	it('emits string.escape for CMake escapes \\t \\; \\$ \\# \\\\', () => {
		const src = 'message("\\t\\;\\$\\#\\\\")';
		const line = tok(t, src);
		for (const esc of ['\\t', '\\;', '\\$', '\\#', '\\\\']) {
			expectToken(line, 'string.escape', esc);
		}
		expectLossless(line, src);
	});
});

describe('cmake: unknown command position', () => {
	it('treats a spaced unknown command in COMMAND position as a call', () => {
		const line = tok(t, 'my_macro (a b)');
		expectToken(line, 'function.call', 'my_macro');
		expectLossless(line, 'my_macro (a b)');
	});

	it('does NOT treat a mid-list argument before a sub-group as a call', () => {
		// `bar (baz)` is an argument followed by a group, not a call — the spaced
		// form only reads as a call in command position.
		const line = tok(t, 'set(FOO bar (baz))');
		expectToken(line, 'variable', 'bar');
		expectLossless(line, 'set(FOO bar (baz))');
	});

	it('classifies math/cmake_policy and other added builtins as keyword.module', () => {
		expectToken(tok(t, 'math(EXPR x "1 + 2")'), 'keyword.module', 'math');
		expectToken(tok(t, 'cmake_policy(SET CMP0077 NEW)'), 'keyword.module', 'cmake_policy');
		expectToken(tok(t, 'get_target_property(v t P)'), 'keyword.module', 'get_target_property');
	});
});

describe('cmake: realistic multi-token line', () => {
	it('tokenizes a target_link_libraries call with a generator expression', () => {
		const src = 'target_link_libraries(app PRIVATE ${LIBS} $<$<BOOL:${WIN32}>:ws2_32>)';
		const line = tok(t, src);
		expectToken(line, 'keyword.module', 'target_link_libraries');
		expectToken(line, 'variable', 'app');
		// ${LIBS} is now sub-tokenized: delimiter + name.
		expectToken(line, 'variable', 'LIBS');
		// The generator expression payload + nested ${WIN32} interpolation.
		expectToken(line, 'function.call', 'BOOL');
		expectToken(line, 'variable', 'WIN32');
		expectToken(line, 'constant.builtin', ':ws2_32');
		expectToken(line, 'punctuation.paren', '(');
		expectLossless(line, src);
	});
});

describe('cmake: lossless reconstruction', () => {
	it('is lossless on an indented command line', () => {
		const src = '    target_include_directories(app PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)';
		expectLossless(tok(t, src), src);
	});

	it('is lossless on a string with escapes', () => {
		const src = 'message("path is \\"${DIR}\\" now")';
		expectLossless(tok(t, src), src);
	});

	it('is lossless on a comment line', () => {
		const src = '# cmake_minimum_required must be the first command';
		expectLossless(tok(t, src), src);
	});

	it('is lossless on an equals-level bracket argument (trickiest)', () => {
		const src = 'set(X [=[ contains ]] and "quotes" ]=])';
		expectLossless(tok(t, src), src);
	});

	it('is lossless on a generator expression line', () => {
		const src = 'target_compile_definitions(t PRIVATE $<$<CONFIG:Release>:NDEBUG>)';
		expectLossless(tok(t, src), src);
	});
});
