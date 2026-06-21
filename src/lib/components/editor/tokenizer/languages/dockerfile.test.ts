import { describe, it } from 'vitest';
import { createDockerfileTokenizer } from './dockerfile';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

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
		expectToken(line, 'number', '8080');
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

	it('tokenizes a braced ${variable}', () => {
		const line = tok(t, 'RUN echo ${APP_VERSION}');
		expectToken(line, 'variable', '${APP_VERSION}');
	});

	it('tokenizes a braced default ${name:-default}', () => {
		const line = tok(t, 'ARG PORT=${PORT:-8080}');
		expectToken(line, 'keyword', 'ARG');
		expectToken(line, 'variable', '${PORT:-8080}');
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
		expectToken(line, 'number', '9');
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
		expectToken(line, 'number', '1');
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
