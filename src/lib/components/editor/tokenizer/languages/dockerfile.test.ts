import { describe, it, expect } from 'vitest';
import { createDockerfileTokenizer } from './dockerfile';
import {
	tok,
	tokLines,
	expectToken,
	expectTokenType,
	expectLossless,
	findTokens
} from '../test-helpers';

const t = createDockerfileTokenizer();

describe('dockerfile: instructions (keywords)', () => {
	it('treats the leading FROM as a control keyword', () => {
		const line = tok(t, 'FROM node:20-alpine');
		expectToken(line, 'keyword.control', 'FROM');
	});

	it('treats RUN as a control keyword', () => {
		const line = tok(t, 'RUN apt-get update');
		expectToken(line, 'keyword.control', 'RUN');
	});

	it('treats WORKDIR as a plain keyword', () => {
		const line = tok(t, 'WORKDIR /app');
		expectToken(line, 'keyword', 'WORKDIR');
	});

	it('recognizes instructions case-insensitively', () => {
		const line = tok(t, 'from ubuntu:22.04');
		expectToken(line, 'keyword.control', 'from');
	});

	it('does not treat a non-leading instruction word as a keyword', () => {
		const line = tok(t, 'RUN echo FROM');
		// FROM here is an argument to echo, not the leading instruction.
		expectToken(line, 'keyword.control', 'RUN');
		expectToken(line, 'variable', 'FROM');
	});

	it('recognizes the AS keyword in a FROM stage', () => {
		const line = tok(t, 'FROM golang:1.22 AS builder');
		expectToken(line, 'keyword.control', 'FROM');
		expectToken(line, 'keyword', 'AS');
		expectToken(line, 'variable', 'builder');
	});

	it('classifies EXPOSE and its port', () => {
		const line = tok(t, 'EXPOSE 8080');
		expectToken(line, 'keyword', 'EXPOSE');
		// Integer literals carry the precise number.integer subtype.
		expectToken(line, 'number.integer', '8080');
	});
});

describe('dockerfile: comments and directives', () => {
	it('tokenizes a full-line comment', () => {
		const line = tok(t, '# build the production image');
		expectToken(line, 'comment.line', '# build the production image');
	});

	it('treats a parser directive as a comment', () => {
		const line = tok(t, '# syntax=docker/dockerfile:1');
		expectToken(line, 'comment.line', '# syntax=docker/dockerfile:1');
	});

	it('tokenizes a trailing comment after an instruction', () => {
		const line = tok(t, 'USER node # drop root');
		expectToken(line, 'keyword', 'USER');
		expectToken(line, 'comment.line', '# drop root');
	});
});

describe('dockerfile: strings', () => {
	it('tokenizes a double-quoted string', () => {
		const line = tok(t, 'ENV MSG "hello world"');
		expectToken(line, 'string', '"hello world"');
	});

	it('tokenizes a single-quoted string', () => {
		const line = tok(t, "LABEL desc 'a single quoted value'");
		expectToken(line, 'string', "'a single quoted value'");
	});

	it('handles escapes inside a double-quoted string', () => {
		const line = tok(t, 'RUN echo "line\\n\\"quoted\\""');
		expectTokenType(line, 'string');
	});

	it('tokenizes JSON-array CMD form', () => {
		const line = tok(t, 'CMD ["nginx", "-g", "daemon off;"]');
		expectToken(line, 'keyword.control', 'CMD');
		expectToken(line, 'punctuation.bracket', '[');
		expectToken(line, 'string', '"nginx"');
		expectToken(line, 'punctuation.separator', ',');
		expectToken(line, 'punctuation.bracket', ']');
	});
});

describe('dockerfile: variables', () => {
	it('tokenizes a simple $variable', () => {
		const line = tok(t, 'WORKDIR $HOME');
		expectToken(line, 'variable', '$HOME');
	});

	it('sub-tokenizes a braced ${variable} into delimiters + name', () => {
		const line = tok(t, 'RUN echo ${APP_VERSION}');
		expectToken(line, 'punctuation.brace', '${');
		expectToken(line, 'variable', 'APP_VERSION');
		expectToken(line, 'punctuation.brace', '}');
		expectLossless(line, 'RUN echo ${APP_VERSION}');
	});

	it('sub-tokenizes a braced default ${name:-default} interior', () => {
		const line = tok(t, 'ARG PORT=${PORT:-8080}');
		expectToken(line, 'keyword', 'ARG');
		expectToken(line, 'punctuation.brace', '${');
		expectToken(line, 'variable', 'PORT');
		// The `:-` default-value operator is surfaced as an operator.
		expectToken(line, 'operator', ':-');
		// The default literal is a real number with its precise subtype.
		expectToken(line, 'number.integer', '8080');
		expectToken(line, 'punctuation.brace', '}');
		expectLossless(line, 'ARG PORT=${PORT:-8080}');
	});
});

describe('dockerfile: flags', () => {
	it('tokenizes a --from flag on COPY', () => {
		const line = tok(t, 'COPY --from=builder /app/bin /usr/local/bin');
		expectToken(line, 'keyword', 'COPY');
		expectToken(line, 'variable.parameter', '--from');
	});

	it('tokenizes a --platform flag on FROM', () => {
		const line = tok(t, 'FROM --platform=linux/amd64 alpine:3.20');
		expectToken(line, 'variable.parameter', '--platform');
	});

	it('tokenizes a --chown flag on ADD', () => {
		const line = tok(t, 'ADD --chown=node:node . /app');
		expectToken(line, 'variable.parameter', '--chown');
	});
});

describe('dockerfile: numbers and operators', () => {
	it('tokenizes a STOPSIGNAL number', () => {
		const line = tok(t, 'STOPSIGNAL 9');
		expectToken(line, 'keyword', 'STOPSIGNAL');
		expectToken(line, 'number.integer', '9');
	});

	it('tokenizes the assignment in ENV key=value', () => {
		const line = tok(t, 'ENV NODE_ENV=production');
		expectToken(line, 'keyword', 'ENV');
		expectToken(line, 'operator.assignment', '=');
	});

	it('tokenizes && in a RUN shell chain', () => {
		const line = tok(t, 'RUN apt-get update && apt-get install -y curl');
		expectToken(line, 'operator.logical', '&&');
	});
});

describe('dockerfile: identifiers and bare words', () => {
	it('classifies a bare image-ref word as a variable', () => {
		const line = tok(t, 'FROM alpine');
		expectToken(line, 'variable', 'alpine');
	});

	it('keeps a digit-suffixed word intact rather than splitting a number', () => {
		const line = tok(t, 'RUN node18 --version');
		expectToken(line, 'variable', 'node18');
	});
});

describe('dockerfile: multi-line constructs', () => {
	it('threads a backslash-continued RUN across physical lines', () => {
		const lines = tokLines(t, [
			'RUN apt-get update && \\',
			'    apt-get install -y curl && \\',
			'    rm -rf /var/lib/apt/lists/*'
		]);
		// First line: RUN is the instruction.
		expectToken(lines[0], 'keyword.control', 'RUN');
		// Continuation lines must NOT re-classify their first word as an instruction.
		// (apt-get splits as apt / - / get since `-` is not an identifier char.)
		expectToken(lines[1], 'variable', 'apt');
		expectToken(lines[2], 'variable', 'rm');
	});

	it('starts a fresh logical line after a continuation ends', () => {
		const lines = tokLines(t, ['ENV A=1 \\', '    B=2', 'WORKDIR /app']);
		// The line after the continuation block is a fresh instruction.
		expectToken(lines[2], 'keyword', 'WORKDIR');
	});

	it('does not treat a backslash inside a comment as a continuation', () => {
		const lines = tokLines(t, ['# a comment ending in a backslash \\', 'FROM scratch']);
		expectToken(lines[1], 'keyword.control', 'FROM');
	});
});

describe('dockerfile: BuildKit heredocs', () => {
	it('does not lex a heredoc body line as an instruction', () => {
		const lines = tokLines(t, ['RUN <<EOF', 'RUN apt-get update', 'FROM here is text', 'EOF']);
		// The opener line is a real RUN instruction with the `<<` operator + delimiter.
		expectToken(lines[0], 'keyword.control', 'RUN');
		// Body lines are verbatim content, NOT Dockerfile instructions: the leading
		// `RUN`/`FROM` here must NOT be highlighted as keywords.
		expectToken(lines[1], 'text', 'RUN apt-get update');
		expectToken(lines[2], 'text', 'FROM here is text');
		expectToken(lines[3], 'text', 'EOF');
	});

	it('resumes Dockerfile lexing after the heredoc closes', () => {
		const lines = tokLines(t, ['RUN <<EOF', 'echo hi', 'EOF', 'FROM alpine']);
		expectToken(lines[2], 'text', 'EOF');
		// The line after the closing delimiter is a fresh instruction again.
		expectToken(lines[3], 'keyword.control', 'FROM');
	});

	it('threads multiple heredocs opened on one line, in order', () => {
		const lines = tokLines(t, [
			'COPY <<f1 <<f2 /dest',
			'content one',
			'f1',
			'content two',
			'f2',
			'RUN x'
		]);
		expectToken(lines[1], 'text', 'content one');
		expectToken(lines[2], 'text', 'f1');
		expectToken(lines[3], 'text', 'content two');
		expectToken(lines[4], 'text', 'f2');
		// Only after BOTH delimiters close does normal lexing resume.
		expectToken(lines[5], 'keyword.control', 'RUN');
	});

	it('closes a <<- heredoc whose terminator is tab-indented', () => {
		const lines = tokLines(t, ['RUN <<-EOT', '\tbody line', '\tEOT', 'WORKDIR /app']);
		expectToken(lines[1], 'text', '\tbody line');
		expectToken(lines[2], 'text', '\tEOT');
		expectToken(lines[3], 'keyword', 'WORKDIR');
	});

	it('treats a quoted heredoc delimiter and closes on the bare word', () => {
		const lines = tokLines(t, ['RUN <<"EOF"', 'literal $NOEXPAND', 'EOF', 'FROM scratch']);
		expectToken(lines[1], 'text', 'literal $NOEXPAND');
		expectToken(lines[3], 'keyword.control', 'FROM');
	});

	it('does not start a heredoc for a plain redirection (2>&1, > file)', () => {
		const lines = tokLines(t, ['RUN echo done > /tmp/x 2>&1', 'FROM alpine']);
		// No heredoc opened, so the next line is still a real instruction.
		expectToken(lines[1], 'keyword.control', 'FROM');
	});

	it('is lossless across a heredoc block', () => {
		const src = ['RUN <<EOF', 'RUN apt-get update', '\techo "x"', 'EOF'];
		const lines = tokLines(t, src);
		lines.forEach((line, i) => expectLossless(line, src[i]));
	});
});

describe('dockerfile: realistic multi-token line', () => {
	it('tokenizes a HEALTHCHECK with flags, numbers and a JSON array', () => {
		const line = tok(
			t,
			'HEALTHCHECK --interval=30s --timeout=3s CMD ["curl", "-f", "http://localhost/"] || exit 1'
		);
		expectToken(line, 'keyword.control', 'HEALTHCHECK');
		expectToken(line, 'variable.parameter', '--interval');
		expectToken(line, 'variable.parameter', '--timeout');
		expectTokenType(line, 'string');
		expectToken(line, 'operator.logical', '||');
		expectToken(line, 'number.integer', '1');
	});
});

describe('dockerfile: contextual in-line keywords (as / none)', () => {
	it('does not treat `as` as a keyword in a RUN shell command', () => {
		const line = tok(t, 'RUN gcc -S -o out.s as input.c');
		// `as` here is a shell argument (the assembler), not the FROM stage keyword.
		expectToken(line, 'variable', 'as');
	});

	it('does not treat `none` as a keyword when it is a flag value', () => {
		const line = tok(t, 'RUN --network=none pip install x');
		// `none` here is the value of --network, not the HEALTHCHECK NONE keyword.
		expectToken(line, 'variable', 'none');
	});

	it('does not treat a bare `none` in a RUN script as a keyword', () => {
		const line = tok(t, 'RUN echo none here');
		expectToken(line, 'variable', 'none');
	});

	it('still treats AS as a keyword inside a FROM stage', () => {
		const line = tok(t, 'FROM golang:1.22 AS builder');
		expectToken(line, 'keyword', 'AS');
	});

	it('still treats NONE as a keyword after HEALTHCHECK', () => {
		const line = tok(t, 'HEALTHCHECK NONE');
		expectToken(line, 'keyword', 'NONE');
	});

	it('keeps AS a keyword when FROM spills onto a continuation line', () => {
		const lines = tokLines(t, ['FROM golang:1.22 \\', '    AS builder']);
		// The instruction context (FROM) must thread across the `\` continuation.
		expectToken(lines[1], 'keyword', 'AS');
		expectToken(lines[1], 'variable', 'builder');
	});
});

describe('dockerfile: lossless reconstruction', () => {
	it('is lossless on an indented continuation line', () => {
		const line = tok(t, '    apt-get install -y curl && \\');
		expectLossless(line, '    apt-get install -y curl && \\');
	});

	it('is lossless on a string with escapes', () => {
		const line = tok(t, 'RUN echo "say \\"hi\\" now"');
		expectLossless(line, 'RUN echo "say \\"hi\\" now"');
	});

	it('is lossless on a comment line', () => {
		const line = tok(t, '# syntax=docker/dockerfile:1.7');
		expectLossless(line, '# syntax=docker/dockerfile:1.7');
	});

	it('is lossless on a HEALTHCHECK with flags and a JSON array (trickiest)', () => {
		const src = 'HEALTHCHECK --interval=30s CMD ["curl", "-f", "http://localhost/"] || exit 1';
		const line = tok(t, src);
		expectLossless(line, src);
	});

	it('is lossless on a braced default variable', () => {
		const line = tok(t, 'ARG PORT=${PORT:-8080}');
		expectLossless(line, 'ARG PORT=${PORT:-8080}');
	});
});

// ---------------------------------------------------------------------------
// A+ closures: precise interpolation, string escapes, number subtypes, the
// `# escape=` parser directive, and nested-instruction context. Each test is a
// fail-before / pass-after regression for one closed gap, and asserts lossless.
// ---------------------------------------------------------------------------

describe('dockerfile: variable expansion sub-tokenization', () => {
	it('emits the :+ alternate-value operator and its value', () => {
		const line = tok(t, 'RUN echo ${FOO:+enabled}');
		expectToken(line, 'punctuation.brace', '${');
		expectToken(line, 'variable', 'FOO');
		expectToken(line, 'operator', ':+');
		expectToken(line, 'variable', 'enabled');
		expectToken(line, 'punctuation.brace', '}');
		expectLossless(line, 'RUN echo ${FOO:+enabled}');
	});

	it('emits the := assign-default and :? error operators', () => {
		const assign = tok(t, 'ENV X=${X:=fallback}');
		expectToken(assign, 'operator', ':=');
		expectToken(assign, 'variable', 'fallback');
		expectLossless(assign, 'ENV X=${X:=fallback}');

		const err = tok(t, 'RUN : ${REQUIRED:?must be set}');
		expectToken(err, 'operator', ':?');
		expectLossless(err, 'RUN : ${REQUIRED:?must be set}');
	});

	it('emits the # strip-prefix and % strip-suffix operators', () => {
		const pre = tok(t, 'RUN echo ${PATH#/usr/}');
		expectToken(pre, 'operator', '#');
		expectLossless(pre, 'RUN echo ${PATH#/usr/}');

		const suf = tok(t, 'RUN echo ${FILE%.tar}');
		expectToken(suf, 'operator', '%');
		expectLossless(suf, 'RUN echo ${FILE%.tar}');
	});

	it('sub-tokenizes a NESTED ${...} inside the default, with its own number subtype', () => {
		const line = tok(t, 'RUN echo ${A:-${B:-0xFF}}');
		// Two opening and two closing braces, balanced.
		expect(findTokens(line, 'punctuation.brace').filter((x) => x.text === '${').length).toBe(2);
		expect(findTokens(line, 'punctuation.brace').filter((x) => x.text === '}').length).toBe(2);
		expectToken(line, 'variable', 'A');
		expectToken(line, 'variable', 'B');
		// The nested default `0xFF` is a precise hex number, not a bare word.
		expectToken(line, 'number.hex', '0xFF');
		expectLossless(line, 'RUN echo ${A:-${B:-0xFF}}');
	});

	it('keeps a bare $name / $$ / positional $1 as a single variable token', () => {
		const line = tok(t, 'RUN echo $HOME $$ $1');
		expectToken(line, 'variable', '$HOME');
		expectToken(line, 'variable', '$$');
		expectToken(line, 'variable', '$1');
		expectLossless(line, 'RUN echo $HOME $$ $1');
	});

	it('is lossless on an unterminated braced expansion', () => {
		const line = tok(t, 'RUN echo ${BROKEN:-');
		expectToken(line, 'punctuation.brace', '${');
		expectToken(line, 'variable', 'BROKEN');
		expectToken(line, 'operator', ':-');
		expectLossless(line, 'RUN echo ${BROKEN:-');
	});
});

describe('dockerfile: string escapes and in-string interpolation', () => {
	it('emits string.escape for C-style escapes inside a double-quoted string', () => {
		const line = tok(t, 'RUN echo "a\\nb\\tc"');
		expectToken(line, 'string.escape', '\\n');
		expectToken(line, 'string.escape', '\\t');
		// The literal runs around the escapes remain plain strings.
		expectTokenType(line, 'string');
		expectLossless(line, 'RUN echo "a\\nb\\tc"');
	});

	it('emits string.escape for an escaped quote inside the string', () => {
		const line = tok(t, 'RUN echo "say \\"hi\\""');
		expect(findTokens(line, 'string.escape').filter((x) => x.text === '\\"').length).toBe(2);
		expectLossless(line, 'RUN echo "say \\"hi\\""');
	});

	it('emits string.escape for \\uXXXX, \\u{...} and \\xNN', () => {
		const line = tok(t, 'ENV M "snow\\u2603 emoji\\u{1F600} byte\\x41"');
		expectToken(line, 'string.escape', '\\u2603');
		expectToken(line, 'string.escape', '\\u{1F600}');
		expectToken(line, 'string.escape', '\\x41');
		expectLossless(line, 'ENV M "snow\\u2603 emoji\\u{1F600} byte\\x41"');
	});

	it('expands $VAR and ${...} INSIDE a double-quoted string, keeping the rest string', () => {
		const line = tok(t, 'ENV URL "http://$HOST:${PORT}/x"');
		expectToken(line, 'variable', '$HOST');
		expectToken(line, 'punctuation.brace', '${');
		expectToken(line, 'variable', 'PORT');
		expectToken(line, 'punctuation.brace', '}');
		// Surrounding literal stays a string.
		expectTokenType(line, 'string');
		expectLossless(line, 'ENV URL "http://$HOST:${PORT}/x"');
	});

	it('does NOT expand or escape inside a single-quoted string (POSIX literal)', () => {
		const line = tok(t, "RUN echo 'no $EXPAND and \\n literal'");
		// The whole single-quoted body is one literal string: no variable, no escape.
		expect(findTokens(line, 'variable').some((x) => x.text === '$EXPAND')).toBe(false);
		expect(findTokens(line, 'string.escape').length).toBe(0);
		expectToken(line, 'string', "'no $EXPAND and \\n literal'");
		expectLossless(line, "RUN echo 'no $EXPAND and \\n literal'");
	});

	it('is lossless on an unterminated double-quoted string', () => {
		const line = tok(t, 'ENV X "unterminated \\n value');
		expectToken(line, 'string.escape', '\\n');
		expectLossless(line, 'ENV X "unterminated \\n value');
	});
});

describe('dockerfile: number subtypes', () => {
	it('classifies a hex literal as number.hex', () => {
		const line = tok(t, 'STOPSIGNAL 0x9');
		expectToken(line, 'number.hex', '0x9');
		expectLossless(line, 'STOPSIGNAL 0x9');
	});

	it('classifies a binary literal as number.binary', () => {
		const line = tok(t, 'ENV MASK=0b1010');
		expectToken(line, 'number.binary', '0b1010');
		expectLossless(line, 'ENV MASK=0b1010');
	});

	it('classifies a decimal-point literal as number.float', () => {
		const line = tok(t, 'LABEL version=1.5');
		expectToken(line, 'number.float', '1.5');
		expectLossless(line, 'LABEL version=1.5');
	});

	it('classifies a plain integer as number.integer', () => {
		const line = tok(t, 'EXPOSE 443');
		expectToken(line, 'number.integer', '443');
	});

	it('still does not split a number out of a digit-suffixed bare word', () => {
		const line = tok(t, 'RUN node18 --version');
		expectToken(line, 'variable', 'node18');
		expect(findTokens(line, 'number.integer').length).toBe(0);
	});
});

describe('dockerfile: # escape= parser directive', () => {
	it('switches the continuation char to a backtick and threads FROM ... AS across it', () => {
		const lines = tokLines(t, ['# escape=`', 'FROM golang:1.22`', '    AS builder', 'RUN make']);
		// The directive itself is a comment.
		expectToken(lines[0], 'comment.line', '# escape=`');
		// A trailing backtick now continues the logical line, so AS stays a keyword.
		expectToken(lines[2], 'keyword', 'AS');
		expectToken(lines[2], 'variable', 'builder');
		// And the next line begins a fresh instruction again.
		expectToken(lines[3], 'keyword.control', 'RUN');
	});

	it('with backtick escape, a trailing backslash is NOT a continuation', () => {
		const lines = tokLines(t, ['# escape=`', 'FROM alpine \\', 'RUN echo fresh-line']);
		// `\` is now an ordinary char; the second line is its own logical line.
		expectToken(lines[2], 'keyword.control', 'RUN');
	});

	it('honors an explicit # escape=\\ directive (default) without breaking continuations', () => {
		const lines = tokLines(t, ['# escape=\\', 'RUN a && \\', '    b']);
		expectToken(lines[1], 'keyword.control', 'RUN');
		// `b` on the continuation line must not be re-lexed as an instruction.
		expectToken(lines[2], 'variable', 'b');
	});

	it('ignores a stray escape= directive that appears AFTER the first instruction', () => {
		const lines = tokLines(t, ['FROM alpine', '# escape=`', 'RUN echo x \\', '    y']);
		// The directive window closed at FROM, so `\` still continues here.
		expectToken(lines[1], 'comment.line', '# escape=`');
		expectToken(lines[3], 'variable', 'y');
	});
});

describe('dockerfile: nested-instruction context keywords', () => {
	it('classifies the CMD inside HEALTHCHECK as a control keyword', () => {
		const line = tok(t, 'HEALTHCHECK --interval=30s CMD curl -f http://localhost/');
		expectToken(line, 'keyword.control', 'HEALTHCHECK');
		expectToken(line, 'keyword.control', 'CMD');
	});

	it('classifies the RUN/CMD/ENTRYPOINT inside ONBUILD as a control keyword', () => {
		const run = tok(t, 'ONBUILD RUN make');
		expectToken(run, 'keyword.control', 'ONBUILD');
		expectToken(run, 'keyword.control', 'RUN');

		const cmd = tok(t, 'ONBUILD CMD ["app"]');
		expectToken(cmd, 'keyword.control', 'CMD');
	});

	it('does NOT promote a bare CMD word in an ordinary RUN script', () => {
		const line = tok(t, 'RUN cmd /c echo hi');
		// Lowercase `cmd` here is a Windows shell argument, not the instruction.
		expectToken(line, 'variable', 'cmd');
	});
});
