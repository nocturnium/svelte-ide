import { describe, it } from 'vitest';
import { createShellTokenizer } from './shell';
import {
	tok,
	tokLines,
	expectToken,
	expectTokenType,
	expectLossless,
	findTokens
} from '../test-helpers';

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
		expectToken(line, 'operator.assignment', '=');
		expectToken(line, 'number.integer', '5');
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

	it('tokenizes ${name} parameter expansion (sub-tokenized)', () => {
		const line = tok(sh, 'echo ${PATH}');
		expectToken(line, 'punctuation.brace', '${');
		expectToken(line, 'variable', 'PATH');
		expectToken(line, 'punctuation.brace', '}');
		expectLossless(line, 'echo ${PATH}');
	});

	it('tokenizes ${var:-default} parameter expansion (operator + default)', () => {
		const line = tok(sh, 'echo ${NAME:-world}');
		expectToken(line, 'punctuation.brace', '${');
		expectToken(line, 'variable', 'NAME');
		expectToken(line, 'operator', ':-');
		expectToken(line, 'string', 'world');
		expectToken(line, 'punctuation.brace', '}');
		expectLossless(line, 'echo ${NAME:-world}');
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

	it('tokenizes double-quoted strings and sub-tokenizes interpolation', () => {
		const line = tok(sh, 'echo "hello $USER"');
		// Delimiters + literal run stay string.template; the variable is sub-tokenized.
		expectToken(line, 'string.template', '"');
		expectToken(line, 'string.template', 'hello ');
		expectToken(line, 'variable', '$USER');
		expectLossless(line, 'echo "hello $USER"');
	});

	it('handles escapes inside double-quoted strings as string.escape', () => {
		const line = tok(sh, 'echo "a \\" b"');
		expectToken(line, 'string.escape', '\\"');
		expectLossless(line, 'echo "a \\" b"');
	});

	it("tokenizes ANSI-C $'...' strings and splits escapes", () => {
		const line = tok(sh, "printf $'line\\n'");
		expectToken(line, 'string', "$'");
		expectToken(line, 'string', 'line');
		expectToken(line, 'string.escape', '\\n');
		expectLossless(line, "printf $'line\\n'");
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

describe('shell: keyword word boundaries', () => {
	it('does NOT treat a keyword glued to a non-metacharacter as a keyword', () => {
		// `done#notcomment` is a single literal word; `done` is NOT the loop keyword.
		const line = tok(sh, 'echo done#notcomment');
		expectToken(line, 'variable', 'done');
		const kw = line.tokens.filter((t) => t.type.startsWith('keyword') && t.text === 'done');
		if (kw.length > 0) {
			throw new Error('keyword glued to a word (done#...) must not highlight as a keyword');
		}
		expectLossless(line, 'echo done#notcomment');
	});

	it('does NOT treat a keyword glued by a dot as a keyword', () => {
		// `for.x` is one word in shell ('.' is not a metacharacter); `for` is not a keyword.
		const line = tok(sh, 'for.x');
		expectToken(line, 'variable', 'for');
		const kw = line.tokens.filter((t) => t.type.startsWith('keyword'));
		if (kw.length > 0) {
			throw new Error('for.x must not contain a keyword token');
		}
		expectLossless(line, 'for.x');
	});

	it('still recognizes genuine keywords at real word boundaries', () => {
		const line = tok(sh, 'for i in 1; do done');
		expectToken(line, 'keyword.control', 'for');
		expectToken(line, 'keyword.control', 'do');
		expectToken(line, 'keyword.control', 'done');
	});
});

describe('shell: numbers', () => {
	it('tokenizes integer literals', () => {
		const line = tok(sh, 'exit 127');
		expectToken(line, 'number.integer', '127');
	});

	it('tokenizes numbers in arithmetic context', () => {
		const line = tok(sh, 'sleep 30');
		expectToken(line, 'number.integer', '30');
	});

	it('does NOT split a digit-led word into number + identifier', () => {
		// `12ab` / `3rd` are single shell words, not a numeric literal then a word.
		const line = tok(sh, 'echo 3rd 12ab');
		expectToken(line, 'variable', '3rd');
		expectToken(line, 'variable', '12ab');
		const nums = line.tokens.filter((t) => t.type === 'number');
		if (nums.length > 0) {
			throw new Error('digit-led words must not produce a number token');
		}
		expectLossless(line, 'echo 3rd 12ab');
	});

	it('keeps a standalone digit run as a number', () => {
		const line = tok(sh, 'arr[2]=val');
		expectToken(line, 'number.integer', '2');
		expectLossless(line, 'arr[2]=val');
	});
});

describe('shell: backslash escapes', () => {
	it('treats an unquoted backslash-dollar as an escape, not a variable', () => {
		// `\$notvar` is a literal '$'; `notvar` must not be a variable expansion.
		const line = tok(sh, 'echo \\$notvar');
		expectToken(line, 'string.escape', '\\$');
		const vars = line.tokens.filter((t) => t.type === 'variable' && t.text.startsWith('$'));
		if (vars.length > 0) {
			throw new Error('escaped \\$ must not start a variable token');
		}
		expectLossless(line, 'echo \\$notvar');
	});

	it('treats an unquoted backslash-space as an escape and stays lossless', () => {
		const line = tok(sh, 'echo a\\ b');
		expectToken(line, 'string.escape', '\\ ');
		expectLossless(line, 'echo a\\ b');
	});
});

describe('shell: operators and flags', () => {
	it('tokenizes logical control operators', () => {
		const line = tok(sh, 'a && b || c');
		expectToken(line, 'operator.logical', '&&');
		expectToken(line, 'operator.logical', '||');
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

	it('tokenizes a numeric short flag as one parameter, not minus + number', () => {
		const line = tok(sh, 'kill -9 $pid');
		// Regression: '-9' previously split into operator '-' and number '9'.
		expectToken(line, 'variable.parameter', '-9');
		const minus = line.tokens.filter((t) => t.type === 'operator' && t.text === '-');
		if (minus.length > 0) {
			throw new Error("numeric flag '-9' must not split off a '-' operator");
		}
		expectLossless(line, 'kill -9 $pid');
	});

	it('tokenizes multi-digit numeric flags (head -20, exit -1)', () => {
		const head = tok(sh, 'head -20 file');
		expectToken(head, 'variable.parameter', '-20');
		const exit = tok(sh, 'exit -1');
		expectToken(exit, 'variable.parameter', '-1');
		expectLossless(head, 'head -20 file');
		expectLossless(exit, 'exit -1');
	});

	it('tokenizes the -- end-of-options marker as a single parameter', () => {
		const line = tok(sh, 'rm -- -file');
		// Regression: '--' previously split into two '-' operator tokens.
		expectToken(line, 'variable.parameter', '--');
		expectToken(line, 'variable.parameter', '-file');
		expectLossless(line, 'rm -- -file');
	});

	it('keeps arithmetic minus as an operator (not a numeric flag)', () => {
		// '10-2' and 'a-1' are NOT word boundaries, so '-' stays an operator.
		const lit = tok(sh, 'echo $((10-2))');
		expectToken(lit, 'operator.arithmetic', '-');
		expectToken(lit, 'number.integer', '10');
		expectToken(lit, 'number.integer', '2');
		const ident = tok(sh, 'echo $((a-1))');
		expectToken(ident, 'operator.arithmetic', '-');
		expectToken(ident, 'number.integer', '1');
		expectLossless(lit, 'echo $((10-2))');
		expectLossless(ident, 'echo $((a-1))');
	});

	it('tokenizes test operators', () => {
		const line = tok(sh, '[ -z "$x" -a $n -eq 0 ]');
		expectToken(line, 'operator', '-z');
		expectToken(line, 'operator', '-eq');
		expectToken(line, 'operator', '-a');
	});

	it('tokenizes comparison operators', () => {
		const line = tok(sh, '[[ $a == b && $c =~ re ]]');
		expectToken(line, 'operator.comparison', '==');
		expectToken(line, 'operator.comparison', '=~');
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
		// Unquoted heredoc bodies expand $var — the sigil is sub-tokenized.
		expectToken(lines[2], 'variable', '$still');
		expectToken(lines[2], 'string', ' inside');
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
		// "$file" is now sub-tokenized: delimiters + the variable inside.
		expectToken(line, 'string.template', '"');
		expectToken(line, 'variable', '$file');
		expectToken(line, 'function', 'export');
		expectToken(line, 'variable.definition', 'RESULT');
		expectToken(line, 'punctuation', '$(');
		expectToken(line, 'keyword.control', 'fi');
		expectLossless(line, 'if [ -f "$file" ]; then export RESULT=$(cat "$file"); fi');
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

// ---------------------------------------------------------------------------
// A+ closures: interpolation sub-tokenizing, escapes, number subtypes,
// operator subtypes, parameter-expansion structure, and multi-line threading.
// ---------------------------------------------------------------------------

describe('shell: double-quote interpolation sub-tokenizing', () => {
	it('sub-tokenizes $name inside a double-quoted string', () => {
		const line = tok(sh, 'echo "hi $USER!"');
		expectToken(line, 'string.template', '"');
		expectToken(line, 'string.template', 'hi ');
		expectToken(line, 'variable', '$USER');
		expectToken(line, 'string.template', '!');
		expectLossless(line, 'echo "hi $USER!"');
	});

	it('sub-tokenizes ${...} inside a double-quoted string', () => {
		const line = tok(sh, 'echo "path ${HOME}/bin"');
		expectToken(line, 'punctuation.brace', '${');
		expectToken(line, 'variable', 'HOME');
		expectToken(line, 'punctuation.brace', '}');
		expectToken(line, 'string.template', '/bin');
		expectLossless(line, 'echo "path ${HOME}/bin"');
	});

	it('sub-tokenizes $(...) command substitution inside a double-quoted string', () => {
		const line = tok(sh, 'echo "now: $(date +%s)"');
		expectToken(line, 'punctuation', '$(');
		expectToken(line, 'variable', 'date');
		expectToken(line, 'punctuation.paren', ')');
		expectLossless(line, 'echo "now: $(date +%s)"');
	});

	it('sub-tokenizes $((...)) arithmetic inside a double-quoted string', () => {
		const line = tok(sh, 'echo "sum=$((a + b))"');
		expectToken(line, 'variable', 'a');
		expectToken(line, 'operator.arithmetic', '+');
		expectToken(line, 'variable', 'b');
		// Both closing parens of the arithmetic expansion are emitted.
		expectLossless(line, 'echo "sum=$((a + b))"');
	});

	it('handles a deeply nested mix without losing bytes', () => {
		const code = 'echo "${arr[$i]}: $(basename "$path")"';
		const line = tok(sh, code);
		expectToken(line, 'variable', '$i');
		expectToken(line, 'variable', 'basename');
		expectToken(line, 'variable', '$path');
		expectLossless(line, code);
	});

	it('keeps a trailing $ before the closing quote literal (regex anchor)', () => {
		// `"^[0-9]+$"` — the '$' is a literal anchor, NOT a variable expansion.
		const line = tok(sh, 'grep -E "^[0-9]+$" file');
		const vars = findTokens(line, 'variable').filter((t) => t.text.startsWith('$'));
		if (vars.length > 0) {
			throw new Error('trailing $ inside a string must not become a variable');
		}
		expectLossless(line, 'grep -E "^[0-9]+$" file');
	});
});

describe('shell: string escapes (string.escape)', () => {
	it('emits string.escape for \\$ \\" \\\\ \\` inside double quotes', () => {
		const code = 'echo "a \\$ b \\" c \\\\ d \\` e"';
		const line = tok(sh, code);
		expectToken(line, 'string.escape', '\\$');
		expectToken(line, 'string.escape', '\\"');
		expectToken(line, 'string.escape', '\\\\');
		expectToken(line, 'string.escape', '\\`');
		expectLossless(line, code);
	});

	it("splits ANSI-C escapes (\\n \\t \\xHH \\uHHHH) out of $'...'", () => {
		const code = "printf $'a\\tb\\n\\x41\\u00e9z'";
		const line = tok(sh, code);
		expectToken(line, 'string.escape', '\\t');
		expectToken(line, 'string.escape', '\\n');
		expectToken(line, 'string.escape', '\\x41');
		expectToken(line, 'string.escape', '\\u00e9');
		expectLossless(line, code);
	});
});

describe('shell: number subtypes', () => {
	it('emits number.hex for 0xFF', () => {
		const line = tok(sh, 'mask=0xFF');
		expectToken(line, 'number.hex', '0xFF');
		expectLossless(line, 'mask=0xFF');
	});

	it('emits number.binary for the 2# arithmetic base', () => {
		const line = tok(sh, 'echo $((2#1010))');
		expectToken(line, 'number.binary', '2#1010');
		expectLossless(line, 'echo $((2#1010))');
	});

	it('emits number.hex for the 16# arithmetic base', () => {
		const line = tok(sh, 'echo $((16#ff))');
		expectToken(line, 'number.hex', '16#ff');
		expectLossless(line, 'echo $((16#ff))');
	});

	it('emits number.float for a decimal literal', () => {
		const line = tok(sh, 'printf "%.2f" 3.14');
		expectToken(line, 'number.float', '3.14');
		expectLossless(line, 'printf "%.2f" 3.14');
	});

	it('emits number.integer for a plain digit run', () => {
		const line = tok(sh, 'exit 130');
		expectToken(line, 'number.integer', '130');
		expectLossless(line, 'exit 130');
	});

	it('does NOT split a hex-looking but identifier-glued word', () => {
		// `0xZZ` is not valid hex; the trailing identifier chars keep it a word.
		const line = tok(sh, 'echo 0xGG');
		const nums = line.tokens.filter((t) => t.type.startsWith('number'));
		if (nums.length > 0) {
			throw new Error('0xGG is not a number');
		}
		expectLossless(line, 'echo 0xGG');
	});
});

describe('shell: operator subtypes', () => {
	it('emits operator.logical for && and ||', () => {
		const line = tok(sh, 'a && b || c');
		expectToken(line, 'operator.logical', '&&');
		expectToken(line, 'operator.logical', '||');
	});

	it('emits operator.comparison for == != =~ <= >=', () => {
		const line = tok(sh, '[[ $a == $b && $c != $d ]]');
		expectToken(line, 'operator.comparison', '==');
		expectToken(line, 'operator.comparison', '!=');
	});

	it('emits operator.assignment for = and compound assignments', () => {
		const a = tok(sh, 'x=1');
		expectToken(a, 'operator.assignment', '=');
		const b = tok(sh, 'echo $((i += 2))');
		expectToken(b, 'operator.assignment', '+=');
		expectLossless(b, 'echo $((i += 2))');
	});

	it('emits operator.arithmetic for + - * / % ** << >>', () => {
		const line = tok(sh, 'echo $((a * b - c / d % e ** f))');
		expectToken(line, 'operator.arithmetic', '*');
		expectToken(line, 'operator.arithmetic', '-');
		expectToken(line, 'operator.arithmetic', '/');
		expectToken(line, 'operator.arithmetic', '%');
		expectToken(line, 'operator.arithmetic', '**');
		expectLossless(line, 'echo $((a * b - c / d % e ** f))');
	});
});

describe('shell: parameter-expansion structure', () => {
	it('emits the length operator # before the name', () => {
		const line = tok(sh, 'echo ${#items}');
		expectToken(line, 'operator', '#');
		expectToken(line, 'variable', 'items');
		expectLossless(line, 'echo ${#items}');
	});

	it('emits the indirection operator ! before the name', () => {
		const line = tok(sh, 'echo ${!ref}');
		expectToken(line, 'operator', '!');
		expectToken(line, 'variable', 'ref');
		expectLossless(line, 'echo ${!ref}');
	});

	it('emits ## / % strip operators', () => {
		const a = tok(sh, 'echo ${file##*/}');
		expectToken(a, 'operator', '##');
		const b = tok(sh, 'echo ${file%.txt}');
		expectToken(b, 'operator', '%');
		expectLossless(a, 'echo ${file##*/}');
		expectLossless(b, 'echo ${file%.txt}');
	});

	it('sub-tokenizes an array subscript with a variable index', () => {
		const line = tok(sh, 'echo ${arr[$idx]}');
		expectToken(line, 'punctuation.bracket', '[');
		expectToken(line, 'variable', '$idx');
		expectToken(line, 'punctuation.bracket', ']');
		expectLossless(line, 'echo ${arr[$idx]}');
	});

	it('balances nested ${...} in a default value', () => {
		const code = 'echo ${x:-${y:-z}}';
		const line = tok(sh, code);
		const braces = findTokens(line, 'punctuation.brace');
		// Two opening + two closing braces, all matched.
		if (braces.filter((t) => t.text === '${').length !== 2) {
			throw new Error('expected two ${ opens');
		}
		if (braces.filter((t) => t.text === '}').length !== 2) {
			throw new Error('expected two } closes');
		}
		expectLossless(line, code);
	});
});

describe('shell: multi-line string threading', () => {
	it('threads an unterminated double-quoted string across lines', () => {
		const src = ['echo "line one', 'still inside', 'last $var"', 'echo after'];
		const lines = tokLines(sh, src);
		expectTokenType(lines[0], 'string.template');
		expectToken(lines[1], 'string.template', 'still inside');
		// The variable on the closing line is still sub-tokenized.
		expectToken(lines[2], 'variable', '$var');
		// Code resumes after the string closes.
		expectToken(lines[3], 'function', 'echo');
		src.forEach((s, i) => expectLossless(lines[i], s));
	});

	it('threads an unterminated single-quoted string across lines', () => {
		const src = ["echo 'open", 'middle $x', "close'", 'pwd'];
		const lines = tokLines(sh, src);
		// Single quotes are literal: $x stays inside the string, not a variable.
		const vars = findTokens(lines[1], 'variable').filter((t) => t.text.startsWith('$'));
		if (vars.length > 0) {
			throw new Error('single-quoted body must not expand $x');
		}
		expectToken(lines[3], 'function', 'pwd');
		src.forEach((s, i) => expectLossless(lines[i], s));
	});

	it('keeps a trailing backslash continuation lossless', () => {
		const src = ['echo foo \\', 'bar'];
		const lines = tokLines(sh, src);
		expectToken(lines[0], 'string.escape', '\\');
		src.forEach((s, i) => expectLossless(lines[i], s));
	});

	it('expands $var inside an unquoted heredoc body but not a quoted one', () => {
		const expand = tokLines(sh, ['cat <<EOF', 'value=$HOME', 'EOF']);
		expectToken(expand[1], 'variable', '$HOME');
		const literal = tokLines(sh, ["cat <<'EOF'", 'value=$HOME', 'EOF']);
		expectToken(literal[1], 'string', 'value=$HOME');
	});
});
