import { describe, it } from 'vitest';
import { createMakefileTokenizer } from './makefile';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const t = createMakefileTokenizer();

describe('makefile: directives (keywords)', () => {
	it('treats ifeq as a control keyword', () => {
		const line = tok(t, 'ifeq ($(OS),Windows_NT)');
		expectToken(line, 'keyword.control', 'ifeq');
	});

	it('treats ifndef as a control keyword', () => {
		const line = tok(t, 'ifndef CC');
		expectToken(line, 'keyword.control', 'ifndef');
	});

	it('treats endif as a control keyword', () => {
		const line = tok(t, 'endif');
		expectToken(line, 'keyword.control', 'endif');
	});

	it('treats include as a control keyword', () => {
		const line = tok(t, 'include config.mk');
		expectToken(line, 'keyword.control', 'include');
	});

	it('treats export as a control keyword', () => {
		const line = tok(t, 'export PATH');
		expectToken(line, 'keyword.control', 'export');
	});

	it('treats override as a control keyword', () => {
		const line = tok(t, 'override CFLAGS += -g');
		expectToken(line, 'keyword.control', 'override');
		expectToken(line, 'operator.assignment', '+=');
	});
});

describe('makefile: comments', () => {
	it('tokenizes a full-line comment', () => {
		const line = tok(t, '# build the release binary');
		expectToken(line, 'comment.line', '# build the release binary');
	});

	it('tokenizes a trailing comment after an assignment', () => {
		const line = tok(t, 'CC = gcc # the C compiler');
		expectToken(line, 'comment.line', '# the C compiler');
	});

	it('tokenizes an indented comment', () => {
		const line = tok(t, '   # indented note');
		expectToken(line, 'comment.line', '# indented note');
	});
});

describe('makefile: assignment operators', () => {
	it('tokenizes a recursive = assignment', () => {
		const line = tok(t, 'CC = gcc');
		expectToken(line, 'operator.assignment', '=');
	});

	it('tokenizes a simple := assignment', () => {
		const line = tok(t, 'SRCS := main.c util.c');
		expectToken(line, 'operator.assignment', ':=');
	});

	it('tokenizes an immediate ::= assignment', () => {
		const line = tok(t, 'OBJS ::= $(SRCS:.c=.o)');
		expectToken(line, 'operator.assignment', '::=');
	});

	it('tokenizes an append += assignment', () => {
		const line = tok(t, 'CFLAGS += -Wall');
		expectToken(line, 'operator.assignment', '+=');
	});

	it('tokenizes a conditional ?= assignment', () => {
		const line = tok(t, 'PREFIX ?= /usr/local');
		expectToken(line, 'operator.assignment', '?=');
	});

	it('tokenizes a shell != assignment', () => {
		const line = tok(t, 'DATE != date +%Y');
		expectToken(line, 'operator.assignment', '!=');
	});
});

describe('makefile: targets', () => {
	it('emits a target name as a definition and the colon as punctuation', () => {
		const line = tok(t, 'build: main.o util.o');
		expectToken(line, 'function.definition', 'build');
		expectToken(line, 'punctuation', ':');
	});

	it('classifies prerequisites as variables', () => {
		const line = tok(t, 'app: main.o util.o');
		expectToken(line, 'function.definition', 'app');
		expectToken(line, 'variable', 'main.o');
		expectToken(line, 'variable', 'util.o');
	});

	it('handles multiple target names before the colon', () => {
		const line = tok(t, 'clean distclean:');
		expectToken(line, 'function.definition', 'clean');
		expectToken(line, 'function.definition', 'distclean');
		expectToken(line, 'punctuation', ':');
	});

	it('emits a double-colon rule colon intact', () => {
		const line = tok(t, 'all:: deps');
		expectToken(line, 'function.definition', 'all');
		expectToken(line, 'punctuation', '::');
	});

	it('classifies a special .PHONY target as a builtin', () => {
		const line = tok(t, '.PHONY: build clean test');
		expectToken(line, 'constant.builtin', '.PHONY');
		expectToken(line, 'punctuation', ':');
	});

	it('does not treat an := assignment colon as a rule colon', () => {
		const line = tok(t, 'OBJ := main.o');
		expectToken(line, 'operator.assignment', ':=');
		expectToken(line, 'variable', 'OBJ');
	});
});

describe('makefile: variables and automatic variables', () => {
	it('tokenizes a $(NAME) expansion with punctuation wrapper', () => {
		const line = tok(t, 'OUT = $(BUILD)/app');
		expectToken(line, 'punctuation', '$(');
		expectToken(line, 'variable', 'BUILD');
		expectToken(line, 'punctuation', ')');
	});

	it('tokenizes a ${NAME} braced expansion', () => {
		const line = tok(t, 'OUT = ${BUILD}/app');
		expectToken(line, 'punctuation', '${');
		expectToken(line, 'variable', 'BUILD');
		expectToken(line, 'punctuation', '}');
	});

	it('tokenizes a substitution reference $(SRCS:.c=.o)', () => {
		const line = tok(t, 'OBJS = $(SRCS:.c=.o)');
		expectToken(line, 'variable', 'SRCS:.c=.o');
	});

	it('tokenizes the automatic variable $@ in a recipe', () => {
		const lines = tokLines(t, ['app:', '\t$(CC) -o $@ $^']);
		expectToken(lines[1], 'variable', '$@');
		expectToken(lines[1], 'variable', '$^');
	});

	it('tokenizes the automatic variable $< in a recipe', () => {
		const lines = tokLines(t, ['%.o: %.c', '\t$(CC) -c $< -o $@']);
		expectToken(lines[1], 'variable', '$<');
	});
});

describe('makefile: functions', () => {
	it('classifies $(shell ...) as a function call', () => {
		const line = tok(t, 'GIT_SHA := $(shell git rev-parse HEAD)');
		expectToken(line, 'function.call', 'shell');
	});

	it('classifies $(wildcard ...) as a function call', () => {
		const line = tok(t, 'SRCS := $(wildcard src/*.c)');
		expectToken(line, 'function.call', 'wildcard');
	});

	it('classifies $(patsubst ...) as a function call', () => {
		const line = tok(t, 'OBJS := $(patsubst %.c,%.o,$(SRCS))');
		expectToken(line, 'function.call', 'patsubst');
	});

	it('classifies $(foreach ...) as a function call', () => {
		const line = tok(t, 'DIRS := $(foreach d,$(SUBDIRS),$(d)/build)');
		expectToken(line, 'function.call', 'foreach');
	});

	it('classifies $(call ...) as a function call', () => {
		const line = tok(t, 'X := $(call reverse,a,b)');
		expectToken(line, 'function.call', 'call');
	});
});

describe('makefile: recipe lines', () => {
	it('keeps the leading tab as a text token', () => {
		const lines = tokLines(t, ['build:', '\tgcc -o app main.c']);
		expectTokenType(lines[1], 'text');
		expectToken(lines[1], 'text', '\t');
	});

	it('still expands $(...) inside a recipe command', () => {
		const lines = tokLines(t, ['build:', '\t$(CC) $(CFLAGS) -o app']);
		// CC is not a builtin function, so the expansion body is a plain variable.
		expectToken(lines[1], 'variable', 'CC');
		expectToken(lines[1], 'variable', 'CFLAGS');
	});
});

describe('makefile: multi-line constructs', () => {
	it('threads a backslash-continued recipe across physical lines', () => {
		const lines = tokLines(t, ['build:', '\tgcc -o app \\', '\t    main.c util.c']);
		// The continuation line stays recipe text; no spurious target on line 3.
		expectLossless(lines[2], '\t    main.c util.c');
	});

	it('threads a define ... endef block', () => {
		const lines = tokLines(t, ['define GREETING', 'echo hello $(USER)', 'endef']);
		expectToken(lines[0], 'keyword.control', 'define');
		expectToken(lines[1], 'variable', 'USER');
		expectToken(lines[2], 'keyword.control', 'endef');
	});

	it('resumes a normal line after a define block ends', () => {
		const lines = tokLines(t, ['define FOO', 'body', 'endef', 'all: build']);
		expectToken(lines[3], 'function.definition', 'all');
	});
});

describe('makefile: realistic multi-token line', () => {
	it('tokenizes a compile recipe with vars and automatic vars', () => {
		const lines = tokLines(t, ['%.o: %.c $(HEADERS)', '\t$(CC) $(CFLAGS) -c $< -o $@']);
		const recipe = lines[1];
		expectToken(recipe, 'variable', 'CC');
		expectToken(recipe, 'variable', '$<');
		expectToken(recipe, 'variable', '$@');
		expectToken(recipe, 'text', '\t');
	});

	it('tokenizes an assignment using nested functions', () => {
		const line = tok(t, 'OBJS := $(patsubst %.c,%.o,$(wildcard *.c))');
		expectToken(line, 'function.call', 'patsubst');
		expectToken(line, 'operator.assignment', ':=');
	});
});

describe('makefile: lossless reconstruction', () => {
	it('is lossless on an indented target line', () => {
		const src = '   build: main.o util.o';
		const line = tok(t, src);
		expectLossless(line, src);
	});

	it('is lossless on a recipe with escapes and a comment-like char', () => {
		const lines = tokLines(t, ['greet:', '\techo "hi\\nthere" # not a comment in shell']);
		expectLossless(lines[1], '\techo "hi\\nthere" # not a comment in shell');
	});

	it('is lossless on a comment line', () => {
		const src = '# the trickiest $(part) of the build';
		const line = tok(t, src);
		expectLossless(line, src);
	});

	it('is lossless on a nested-function substitution (trickiest)', () => {
		const src = 'OBJS := $(patsubst %.c,%.o,$(wildcard src/*.c)) $(EXTRA:.cpp=.o)';
		const line = tok(t, src);
		expectLossless(line, src);
	});

	it('is lossless on an automatic-variable recipe', () => {
		const lines = tokLines(t, ['%.o: %.c', '\t$(CC) -c $< -o $@ $(CFLAGS)']);
		expectLossless(lines[1], '\t$(CC) -c $< -o $@ $(CFLAGS)');
	});
});
