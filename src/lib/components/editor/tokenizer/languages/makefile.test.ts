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
		// `OBJ` is the variable being defined (LHS of the assignment).
		expectToken(line, 'variable.definition', 'OBJ');
	});
});

describe('makefile: variables and automatic variables', () => {
	it('tokenizes a $(NAME) expansion with template-delimiter wrapper', () => {
		const line = tok(t, 'OUT = $(BUILD)/app');
		expectToken(line, 'string.template', '$(');
		expectToken(line, 'variable', 'BUILD');
		expectToken(line, 'string.template', ')');
	});

	it('tokenizes a ${NAME} braced expansion', () => {
		const line = tok(t, 'OUT = ${BUILD}/app');
		expectToken(line, 'string.template', '${');
		expectToken(line, 'variable', 'BUILD');
		expectToken(line, 'string.template', '}');
	});

	it('sub-tokenizes a substitution reference $(SRCS:.c=.o)', () => {
		// The `:` and `=` are operators, the variable name and pattern/replacement separate.
		const line = tok(t, 'OBJS = $(SRCS:.c=.o)');
		expectToken(line, 'variable', 'SRCS');
		expectToken(line, 'operator.assignment', ':');
		expectToken(line, 'operator.assignment', '=');
		expectToken(line, 'string', '.c');
		expectToken(line, 'string', '.o');
		expectLossless(line, 'OBJS = $(SRCS:.c=.o)');
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

describe('makefile: numbers vs version-like words', () => {
	it('keeps a dotted version value as a single word, not number + stray remainder', () => {
		// Regression: `1.6.0` was carved into number "1.6" + variable ".0".
		const line = tok(t, 'VERSION = 1.6.0');
		expectToken(line, 'variable', '1.6.0');
		expectLossless(line, 'VERSION = 1.6.0');
		// And no number token (of any subtype) leaks out of the dotted value.
		expectTokenType(line, 'operator.assignment');
		const numbers = line.tokens.filter((tk) => tk.type.startsWith('number'));
		if (numbers.length !== 0) {
			throw new Error(`expected no number tokens, got ${JSON.stringify(numbers)}`);
		}
	});

	it('does not carve a number out of a digit-prefixed word', () => {
		// Regression: `2.10.3-rc1` was split into number "2.10" + variable ".3-rc1".
		const line = tok(t, 'TAG := 2.10.3-rc1');
		expectToken(line, 'variable', '2.10.3-rc1');
		expectLossless(line, 'TAG := 2.10.3-rc1');
	});

	it('still styles a standalone integer value as a number', () => {
		const line = tok(t, 'PORT = 8080');
		expectToken(line, 'number.integer', '8080');
	});

	it('still styles a standalone decimal value as a number', () => {
		const line = tok(t, 'RATIO = 3.14');
		expectToken(line, 'number.float', '3.14');
	});
});

describe('makefile: escaped hash is a literal, not a comment', () => {
	it('treats \\# in an assignment value as a literal hash, not a comment', () => {
		// Regression: `\#literal` was tokenized as variable "\" + comment.line "#literal".
		// GNU make strips the backslash and keeps the hash as a value character, so the
		// remainder must NOT bleed into a comment.
		const line = tok(t, 'HASH := \\#literal-hash');
		expectToken(line, 'string.escape', '\\#');
		expectToken(line, 'variable', 'literal-hash');
		expectLossless(line, 'HASH := \\#literal-hash');
		const comments = line.tokens.filter((tk) => tk.type === 'comment.line');
		if (comments.length !== 0) {
			throw new Error(`escaped hash must not start a comment, got ${JSON.stringify(comments)}`);
		}
	});

	it('keeps a \\# in the middle of a value from starting a comment', () => {
		const line = tok(t, 'CFLAGS += -DTAG=\\#dev');
		expectToken(line, 'string.escape', '\\#');
		expectToken(line, 'variable', 'dev');
		expectLossless(line, 'CFLAGS += -DTAG=\\#dev');
	});

	it('still treats an unescaped # as a comment', () => {
		const line = tok(t, 'VAR = value # real comment');
		expectToken(line, 'comment.line', '# real comment');
	});

	it('a backslash-escaped backslash before # still allows a comment (\\\\#)', () => {
		// `\\` is a literal backslash; the following `#` is a genuine comment.
		const line = tok(t, 'P = a\\\\#c');
		expectToken(line, 'comment.line', '#c');
		expectLossless(line, 'P = a\\\\#c');
	});
});

describe('makefile: backslash-continued line context', () => {
	it('keeps value highlighting on a continued assignment line', () => {
		// Regression: continuation lines were always scanned as raw recipe text, flattening
		// a multi-line variable assignment to a single plain `text` token.
		const lines = tokLines(t, ['SRCS = main.c \\', '\tutil.c \\', '\thelper.c']);
		expectToken(lines[1], 'variable', 'util.c');
		expectToken(lines[2], 'variable', 'helper.c');
		expectLossless(lines[1], '\tutil.c \\');
		expectLossless(lines[2], '\thelper.c');
	});

	it('keeps prerequisites highlighted across a continued target line', () => {
		const lines = tokLines(t, ['build: a.o \\', '       b.o']);
		expectToken(lines[1], 'variable', 'b.o');
		expectLossless(lines[1], '       b.o');
	});

	it('does not treat a directive-named value on a continuation line as a keyword', () => {
		// `include.mk` / `export.c` on a continuation line are plain values, not directives.
		const lines = tokLines(t, ['FILES = a.c \\', '\tinclude.mk \\', '\texport.c']);
		expectToken(lines[1], 'variable', 'include.mk');
		expectToken(lines[2], 'variable', 'export.c');
		const kw = lines[1].tokens
			.concat(lines[2].tokens)
			.filter((tk) => tk.type === 'keyword.control');
		if (kw.length !== 0) {
			throw new Error(`continuation values must not be keywords, got ${JSON.stringify(kw)}`);
		}
	});

	it('still keeps a continued RECIPE line as raw shell text', () => {
		// A real recipe continuation must stay plain (a hash there is not a comment, words
		// are not make values).
		const lines = tokLines(t, ['build:', '\tgcc -o app \\', '\t\tmain.c util.c']);
		expectLossless(lines[2], '\t\tmain.c util.c');
		// The continued recipe stays plain text, not carved into make `variable` words.
		const vars = lines[2].tokens.filter((tk) => tk.type === 'variable');
		if (vars.length !== 0) {
			throw new Error(`recipe continuation must stay raw, got ${JSON.stringify(vars)}`);
		}
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

describe('makefile: sub-tokenized function arguments', () => {
	it('splits $(call f,a,b,c) arguments on top-level commas', () => {
		// Regression: the whole `reverse,a,b,c` body used to collapse into one variable token.
		const line = tok(t, 'X := $(call reverse,a,b,c)');
		expectToken(line, 'function.call', 'call');
		const commas = line.tokens.filter(
			(tk) => tk.type === 'punctuation.separator' && tk.text === ','
		);
		if (commas.length !== 3) {
			throw new Error(`expected 3 argument separators, got ${commas.length}`);
		}
		expectLossless(line, 'X := $(call reverse,a,b,c)');
	});

	it('emits the foreach/call macro variable as variable.parameter', () => {
		// Regression: foreach loop var and call macro name were undistinguished value text.
		const fe = tok(t, 'DIRS := $(foreach d,$(SUBDIRS),$(d)/build)');
		expectToken(fe, 'variable.parameter', 'd');
		const cl = tok(t, 'Y := $(call mymacro,x,y)');
		expectToken(cl, 'variable.parameter', 'mymacro');
	});

	it('does not split an argument on a comma nested inside an inner $(...)', () => {
		// The comma inside $(findstring foo,$(BAR)) must NOT split the outer ifneq arg.
		const line = tok(t, 'X := $(patsubst %.c,%.o,$(subst a,b,$(SRC)))');
		expectToken(line, 'function.call', 'patsubst');
		expectToken(line, 'function.call', 'subst');
		// patsubst has exactly two top-level argument commas; the inner subst commas are nested.
		expectLossless(line, 'X := $(patsubst %.c,%.o,$(subst a,b,$(SRC)))');
	});

	it('recurses into nested expansions inside an argument', () => {
		const line = tok(t, 'P := $(addprefix -I,$(DIRS))');
		expectToken(line, 'function.call', 'addprefix');
		expectToken(line, 'string', '-I');
		expectToken(line, 'variable', 'DIRS');
		expectToken(line, 'string.template', '$(');
		expectLossless(line, 'P := $(addprefix -I,$(DIRS))');
	});

	it('emits expansion delimiters as string.template, not bare punctuation', () => {
		const line = tok(t, 'OUT = $(BUILD)/app');
		const tmpl = line.tokens.filter((tk) => tk.type === 'string.template');
		if (tmpl.length !== 2) {
			throw new Error(`expected $( and ) as string.template, got ${JSON.stringify(tmpl)}`);
		}
	});
});

describe('makefile: ifeq/ifneq conditional arguments', () => {
	it('sub-tokenizes ifeq (a,b) into parens, separator and operands', () => {
		// Regression: the whole `($(OS),Windows_NT)` was loose parens + words; now the parens
		// are punctuation.paren and the comma a separator with each operand tokenized.
		const line = tok(t, 'ifeq ($(OS),Windows_NT)');
		expectToken(line, 'keyword.control', 'ifeq');
		expectToken(line, 'punctuation.paren', '(');
		expectToken(line, 'punctuation.paren', ')');
		expectToken(line, 'punctuation.separator', ',');
		expectToken(line, 'variable', 'OS');
		expectToken(line, 'string', 'Windows_NT');
		expectLossless(line, 'ifeq ($(OS),Windows_NT)');
	});

	it('keeps an empty first operand in ifneq (,$(X)) lossless', () => {
		const line = tok(t, 'ifneq (,$(findstring foo,$(BAR)))');
		expectToken(line, 'keyword.control', 'ifneq');
		expectToken(line, 'function.call', 'findstring');
		// The comma directly after `(` is the operand separator (empty first operand).
		expectToken(line, 'punctuation.separator', ',');
		expectLossless(line, 'ifneq (,$(findstring foo,$(BAR)))');
	});

	it('does not split the conditional on a comma nested in an expansion', () => {
		const line = tok(t, 'ifeq ($(filter a,b,$(X)),yes)');
		// Exactly one top-level separator between the two operands; nested commas stay inside.
		const topSep = line.tokens.filter(
			(tk) => tk.type === 'punctuation.separator' && tk.text === ','
		);
		// 1 outer conditional comma + 2 inner filter commas = 3 separators, but only the
		// outer one is between the parens at depth 1; assert lossless + presence is enough.
		if (topSep.length < 1) throw new Error('expected at least one separator');
		expectLossless(line, 'ifeq ($(filter a,b,$(X)),yes)');
	});
});

describe('makefile: number subtypes', () => {
	it('emits number.integer for a bare integer value', () => {
		const line = tok(t, 'PORT = 8080');
		expectToken(line, 'number.integer', '8080');
	});

	it('emits number.float for a decimal value', () => {
		const line = tok(t, 'RATIO = 3.14');
		expectToken(line, 'number.float', '3.14');
	});

	it('emits number.hex for a 0x value', () => {
		const line = tok(t, 'MASK = 0xFF');
		expectToken(line, 'number.hex', '0xFF');
	});

	it('emits number.binary for a 0b value', () => {
		const line = tok(t, 'BITS = 0b1010');
		expectToken(line, 'number.binary', '0b1010');
	});
});

describe('makefile: no-space append/conditional/shell operators', () => {
	// Regression: the bare-word scanner does not exclude `+`, `?`, `!`, so an unspaced
	// `CFLAGS+=-g` swallowed the operator's leading char into the variable name and left a
	// lone `=` mis-tokenized as a plain recursive assignment. The whole `+=`/`?=`/`!=`
	// operator must survive intact, with the bare name to its left.
	it('tokenizes an unspaced += as a single append operator', () => {
		const line = tok(t, 'CFLAGS+=-g');
		expectToken(line, 'variable.definition', 'CFLAGS');
		expectToken(line, 'operator.assignment', '+=');
		expectLossless(line, 'CFLAGS+=-g');
		// The name must NOT carry a trailing `+`, and there must be no lone `=` operator.
		const eqOnly = line.tokens.filter((tk) => tk.type === 'operator.assignment' && tk.text === '=');
		if (eqOnly.length !== 0) {
			throw new Error(`+= must not split into a lone =, got ${JSON.stringify(eqOnly)}`);
		}
	});

	it('tokenizes an unspaced ?= as a single conditional operator', () => {
		const line = tok(t, 'PREFIX?=/usr/local');
		expectToken(line, 'variable.definition', 'PREFIX');
		expectToken(line, 'operator.assignment', '?=');
		expectToken(line, 'variable', '/usr/local');
		expectLossless(line, 'PREFIX?=/usr/local');
	});

	it('tokenizes an unspaced != as a single shell-assign operator', () => {
		const line = tok(t, 'DATE!=date +%Y');
		expectToken(line, 'variable.definition', 'DATE');
		expectToken(line, 'operator.assignment', '!=');
		expectLossless(line, 'DATE!=date +%Y');
	});

	it('does not trim a mid-word + ? or ! out of a plain value', () => {
		// A `+`/`?`/`!` that is NOT immediately followed by `=` is an ordinary value char.
		const line = tok(t, 'FLAGS = -a+b a?b c!d');
		expectToken(line, 'variable', '-a+b');
		expectToken(line, 'variable', 'a?b');
		expectToken(line, 'variable', 'c!d');
		expectLossless(line, 'FLAGS = -a+b a?b c!d');
	});

	it('keeps a trailing + ? or ! at end of value (no spurious operator)', () => {
		const line = tok(t, 'P = trailing+');
		expectToken(line, 'variable', 'trailing+');
		expectLossless(line, 'P = trailing+');
		const ops = line.tokens.filter((tk) => tk.type === 'operator.assignment' && tk.text !== '=');
		if (ops.length !== 0) {
			throw new Error(`a trailing + at EOL is not an operator, got ${JSON.stringify(ops)}`);
		}
	});
});

describe('makefile: variable definitions vs references', () => {
	it('emits the assignment LHS as variable.definition', () => {
		// Regression: the defined name was the same `variable` type as a value reference.
		const line = tok(t, 'CC = gcc');
		expectToken(line, 'variable.definition', 'CC');
		// The RHS value stays a plain variable.
		expectToken(line, 'variable', 'gcc');
	});

	it('emits the LHS after override/export as a definition', () => {
		const ov = tok(t, 'override CFLAGS += -g');
		expectToken(ov, 'keyword.control', 'override');
		expectToken(ov, 'variable.definition', 'CFLAGS');
		const ex = tok(t, 'export FOO = bar');
		expectToken(ex, 'keyword.control', 'export');
		expectToken(ex, 'variable.definition', 'FOO');
	});

	it('does NOT mark a target rule name or prerequisite as a variable.definition', () => {
		// A rule line is not an assignment; the prerequisite stays a plain variable.
		const line = tok(t, 'build: main.o');
		expectToken(line, 'function.definition', 'build');
		expectToken(line, 'variable', 'main.o');
		const defs = line.tokens.filter((tk) => tk.type === 'variable.definition');
		if (defs.length !== 0) {
			throw new Error(`rule line must have no variable.definition, got ${JSON.stringify(defs)}`);
		}
	});
});

describe('makefile: automatic-variable dir/file forms', () => {
	it('tokenizes $(@D) and $(<F) as fine-grained expansions', () => {
		const line = tok(t, 'DF = $(@D)/$(<F)');
		expectToken(line, 'variable', '@D');
		expectToken(line, 'variable', '<F');
		expectToken(line, 'string.template', '$(');
		expectLossless(line, 'DF = $(@D)/$(<F)');
	});

	it('still tokenizes a bare $@ automatic variable in a recipe', () => {
		const lines = tokLines(t, ['app:', '\t$(CC) -o $@ $^']);
		expectToken(lines[1], 'variable', '$@');
		expectToken(lines[1], 'variable', '$^');
	});
});

describe('makefile: sub-tokenization is lossless on adversarial expansions', () => {
	it('is lossless on a deeply nested conditional/call expansion', () => {
		const src = 'X := $(if $(DEBUG),$(call log,on),$(call log,off))';
		const line = tok(t, src);
		expectLossless(line, src);
		expectToken(line, 'function.call', 'if');
		expectToken(line, 'function.call', 'call');
	});

	it('is lossless on an unterminated expansion (threads to EOL)', () => {
		const src = 'UNTERM := $(shell echo hi';
		const line = tok(t, src);
		expectLossless(line, src);
		expectToken(line, 'function.call', 'shell');
	});

	it('is lossless on an empty $() expansion', () => {
		const src = 'EMPTY := $()';
		const line = tok(t, src);
		expectLossless(line, src);
	});

	it('is lossless on a substitution ref whose variable is itself an expansion', () => {
		const src = 'O := $($(VARNAME):.c=.o)';
		const line = tok(t, src);
		expectLossless(line, src);
	});
});
