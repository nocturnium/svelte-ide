import { describe, it } from 'vitest';
import { createShellTokenizer } from './shell';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

const sh = createShellTokenizer();

describe('shell: keywords', () => {
	it('classifies control-flow keywords', () => {
		const line = tok(sh, 'if true; then echo hi; fi');
		expectToken(line, 'keyword.control', 'if');
		expectToken(line, 'keyword.control', 'then');
		expectToken(line, 'keyword.control', 'fi');
	});

	it('classifies loop keywords', () => {
		const line = tok(sh, 'for i in 1 2 3; do done');
		expectToken(line, 'keyword.control', 'for');
		expectToken(line, 'keyword.control', 'do');
		expectToken(line, 'keyword.control', 'done');
	});

	it('treats "in" as an operator keyword', () => {
		const line = tok(sh, 'case $x in');
		expectToken(line, 'keyword.operator', 'in');
	});

	it('classifies the function keyword as a definition', () => {
		const line = tok(sh, 'function greet {');
		expectToken(line, 'keyword.definition', 'function');
	});

	it('classifies while/until/case/esac', () => {
		const line = tok(sh, 'while until case esac select');
		expectToken(line, 'keyword.control', 'while');
		expectToken(line, 'keyword.control', 'until');
		expectToken(line, 'keyword.control', 'case');
		expectToken(line, 'keyword.control', 'esac');
		expectToken(line, 'keyword.control', 'select');
	});
});

describe('shell: builtins and identifiers', () => {
	it('classifies builtins as functions', () => {
		const line = tok(sh, 'echo hello');
		expectToken(line, 'function', 'echo');
	});

	it('classifies common builtins', () => {
		const line = tok(sh, 'export PATH; local x; readonly Y');
		expectToken(line, 'function', 'export');
		expectToken(line, 'function', 'local');
		expectToken(line, 'function', 'readonly');
	});

	it('treats a word before "(" as a function call', () => {
		const line = tok(sh, 'my_func()');
		expectToken(line, 'function.call', 'my_func');
	});

	it('treats NAME=value target as a variable definition', () => {
		const line = tok(sh, 'COUNT=5');
		expectToken(line, 'variable.definition', 'COUNT');
		expectToken(line, 'operator', '=');
		expectToken(line, 'number', '5');
	});

	it('treats a bare word as a variable', () => {
		const line = tok(sh, 'somecommand arg');
		expectToken(line, 'variable', 'somecommand');
		expectToken(line, 'variable', 'arg');
	});

	it('classifies true/false as boolean constants', () => {
		const line = tok(sh, 'true false');
		expectToken(line, 'constant.boolean', 'true');
		expectToken(line, 'constant.boolean', 'false');
	});
});

describe('shell: variables', () => {
	it('tokenizes $name', () => {
		const line = tok(sh, 'echo $HOME');
		expectToken(line, 'variable', '$HOME');
	});

	it('tokenizes ${name} parameter expansion', () => {
		const line = tok(sh, 'echo ${PATH}');
		expectToken(line, 'variable', '${PATH}');
	});

	it('tokenizes ${var:-default} parameter expansion span', () => {
		const line = tok(sh, 'echo ${NAME:-world}');
		expectToken(line, 'variable', '${NAME:-world}');
	});

	it('tokenizes special parameters', () => {
		const line = tok(sh, 'echo $? $@ $# $$ $! $1 $0');
		expectToken(line, 'variable', '$?');
		expectToken(line, 'variable', '$@');
		expectToken(line, 'variable', '$#');
		expectToken(line, 'variable', '$$');
		expectToken(line, 'variable', '$!');
		expectToken(line, 'variable', '$1');
		expectToken(line, 'variable', '$0');
	});

	it('treats $( as command-substitution punctuation', () => {
		const line = tok(sh, 'x=$(date)');
		expectToken(line, 'punctuation', '$(');
		expectToken(line, 'variable', 'date');
		expectToken(line, 'punctuation.paren', ')');
	});
});

describe('shell: strings', () => {
	it('tokenizes single-quoted literal strings', () => {
		const line = tok(sh, "echo 'no $interp here'");
		expectToken(line, 'string', "'no $interp here'");
	});

	it('tokenizes double-quoted strings as templates', () => {
		const line = tok(sh, 'echo "hello $USER"');
		expectToken(line, 'string.template', '"hello $USER"');
	});

	it('handles escapes inside double-quoted strings', () => {
		const line = tok(sh, 'echo "a \\" b"');
		expectToken(line, 'string.template', '"a \\" b"');
	});

	it("tokenizes ANSI-C $'...' strings", () => {
		const line = tok(sh, "printf $'line\\n'");
		expectToken(line, 'string', "$'line\\n'");
	});
});

describe('shell: comments', () => {
	it('tokenizes a full-line comment', () => {
		const line = tok(sh, '# this is a comment');
		expectToken(line, 'comment.line', '# this is a comment');
	});

	it('tokenizes a shebang line', () => {
		const line = tok(sh, '#!/usr/bin/env bash');
		expectToken(line, 'comment.line', '#!/usr/bin/env bash');
	});

	it('tokenizes a trailing comment after a command', () => {
		const line = tok(sh, 'echo hi # greet');
		expectToken(line, 'comment.line', '# greet');
	});

	it('does NOT treat # inside a word as a comment', () => {
		const line = tok(sh, 'echo foo#bar');
		// The '#' is preceded by a word char, so it never starts a comment.
		expectLossless(line, 'echo foo#bar');
		const hasComment = line.tokens.some((t) => t.type.startsWith('comment'));
		if (hasComment) {
			throw new Error('mid-word # must not start a comment');
		}
	});
});

describe('shell: numbers', () => {
	it('tokenizes integer literals', () => {
		const line = tok(sh, 'exit 127');
		expectToken(line, 'number', '127');
	});

	it('tokenizes numbers in arithmetic context', () => {
		const line = tok(sh, 'sleep 30');
		expectToken(line, 'number', '30');
	});
});

describe('shell: operators and flags', () => {
	it('tokenizes logical control operators', () => {
		const line = tok(sh, 'a && b || c');
		expectToken(line, 'operator', '&&');
		expectToken(line, 'operator', '||');
	});

	it('tokenizes pipes and separators', () => {
		const line = tok(sh, 'ls | grep x; pwd');
		expectToken(line, 'operator', '|');
		expectToken(line, 'operator', ';');
	});

	it('tokenizes redirections including 2>&1', () => {
		const line = tok(sh, 'cmd > out.txt 2>&1');
		expectToken(line, 'operator', '>');
		expectToken(line, 'operator', '2>&1');
	});

	it('tokenizes >> append and here-string <<<', () => {
		const line = tok(sh, 'cmd >> log <<< input');
		expectToken(line, 'operator', '>>');
		expectToken(line, 'operator', '<<<');
	});

	it('tokenizes short and long flags', () => {
		const line = tok(sh, 'ls -la --color=auto');
		expectToken(line, 'variable.parameter', '-la');
		expectToken(line, 'variable.parameter', '--color');
	});

	it('tokenizes test operators', () => {
		const line = tok(sh, '[ -z "$x" -a $n -eq 0 ]');
		expectToken(line, 'operator', '-z');
		expectToken(line, 'operator', '-eq');
		expectToken(line, 'operator', '-a');
	});

	it('tokenizes comparison operators', () => {
		const line = tok(sh, '[[ $a == b && $c =~ re ]]');
		expectToken(line, 'operator', '==');
		expectToken(line, 'operator', '=~');
	});
});

describe('shell: multi-line heredocs', () => {
	it('threads a heredoc body across lines', () => {
		const lines = tokLines(sh, [
			'cat <<EOF',
			'plain body line',
			'$still inside',
			'EOF',
			'echo done'
		]);
		// The operator on the opening line.
		expectToken(lines[0], 'operator', '<<EOF');
		// Body lines are emitted as strings.
		expectTokenType(lines[1], 'string');
		expectToken(lines[1], 'string', 'plain body line');
		expectToken(lines[2], 'string', '$still inside');
		// Terminator line ends the heredoc.
		expectToken(lines[3], 'keyword', 'EOF');
		// Code resumes after the terminator.
		expectToken(lines[4], 'function', 'echo');
	});

	it('supports <<- tab-stripping heredocs', () => {
		const lines = tokLines(sh, ['cat <<-END', '\tindented', '\tEND', 'pwd']);
		expectToken(lines[0], 'operator', '<<-END');
		expectToken(lines[1], 'string', '\tindented');
		// The tab-indented terminator closes the heredoc.
		expectToken(lines[2], 'keyword', 'END');
		expectToken(lines[3], 'function', 'pwd');
	});

	it('supports quoted heredoc delimiters', () => {
		const lines = tokLines(sh, ["cat <<'EOF'", 'raw $body', 'EOF']);
		expectToken(lines[0], 'operator', "<<'EOF'");
		expectToken(lines[1], 'string', 'raw $body');
		expectToken(lines[2], 'keyword', 'EOF');
	});
});

describe('shell: realistic lines', () => {
	it('tokenizes a realistic conditional assignment', () => {
		const line = tok(sh, 'if [ -f "$file" ]; then export RESULT=$(cat "$file"); fi');
		expectToken(line, 'keyword.control', 'if');
		expectToken(line, 'operator', '-f');
		expectToken(line, 'string.template', '"$file"');
		expectToken(line, 'function', 'export');
		expectToken(line, 'variable.definition', 'RESULT');
		expectToken(line, 'punctuation', '$(');
		expectToken(line, 'keyword.control', 'fi');
	});
});

describe('shell: lossless', () => {
	it('is lossless for a line with leading indentation', () => {
		const code = '\t\tfor f in *.txt; do echo "$f"; done';
		expectLossless(tok(sh, code), code);
	});

	it('is lossless for a string with escapes', () => {
		const code = 'printf "a\\tb\\n\\"quoted\\"" $value';
		expectLossless(tok(sh, code), code);
	});

	it('is lossless for a comment line', () => {
		const code = '  # configure the build: set CFLAGS=-O2 && export it';
		expectLossless(tok(sh, code), code);
	});

	it('is lossless for the trickiest construct (heredoc body + terminator)', () => {
		const lines = tokLines(sh, ['cat <<-EOF', '\t  weird $body && | ;; chars', '\tEOF']);
		expectLossless(lines[0], 'cat <<-EOF');
		expectLossless(lines[1], '\t  weird $body && | ;; chars');
		expectLossless(lines[2], '\tEOF');
	});

	it('is lossless for a dense mixed-punctuation line', () => {
		const code = 'grep -E "^[0-9]+$" file | awk \'{print $1}\' > out 2>&1';
		expectLossless(tok(sh, code), code);
	});
});
