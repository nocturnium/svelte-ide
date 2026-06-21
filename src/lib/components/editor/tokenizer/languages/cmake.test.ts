import { describe, it } from 'vitest';
import { createCMakeTokenizer } from './cmake';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

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
		expectToken(line, 'number', '3.20');
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

describe('cmake: variables', () => {
	it('tokenizes a ${VAR} reference', () => {
		const line = tok(t, 'message(${PROJECT_NAME})');
		expectToken(line, 'variable', '${PROJECT_NAME}');
	});

	it('tokenizes a $ENV{VAR} reference', () => {
		const line = tok(t, 'set(PATH $ENV{PATH})');
		expectToken(line, 'variable', '$ENV{PATH}');
	});

	it('tokenizes a $CACHE{VAR} reference', () => {
		const line = tok(t, 'message($CACHE{MY_OPTION})');
		expectToken(line, 'variable', '$CACHE{MY_OPTION}');
	});

	it('tokenizes a nested ${${inner}} reference as one variable', () => {
		const line = tok(t, 'set(x ${${prefix}_SUFFIX})');
		expectToken(line, 'variable', '${${prefix}_SUFFIX}');
	});
});

describe('cmake: strings', () => {
	it('tokenizes a double-quoted string', () => {
		const line = tok(t, 'message("Hello, world")');
		expectToken(line, 'string', '"Hello, world"');
	});

	it('keeps a string with a ${var} inside as a single string token', () => {
		const line = tok(t, 'set(MSG "version ${VERSION}")');
		expectToken(line, 'string', '"version ${VERSION}"');
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
	it('tokenizes an integer and a version-like float', () => {
		expectToken(tok(t, 'set(COUNT 42)'), 'number', '42');
		expectToken(tok(t, 'set(VERSION 1.5)'), 'number', '1.5');
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

	it('treats a generator expression best-effort', () => {
		const line = tok(t, 'target_compile_options(t PRIVATE $<$<CONFIG:Debug>:-g>)');
		expectTokenType(line, 'constant.builtin');
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
});

describe('cmake: realistic multi-token line', () => {
	it('tokenizes a target_link_libraries call with a generator expression', () => {
		const line = tok(t, 'target_link_libraries(app PRIVATE ${LIBS} $<$<BOOL:${WIN32}>:ws2_32>)');
		expectToken(line, 'keyword.module', 'target_link_libraries');
		expectToken(line, 'variable', 'app');
		expectToken(line, 'variable', '${LIBS}');
		expectTokenType(line, 'constant.builtin');
		expectToken(line, 'punctuation.paren', '(');
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
