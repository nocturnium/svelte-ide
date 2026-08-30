import { describe, it, expect } from 'vitest';
import { parseComplexityResponse } from './complexity-provider';

/**
 * The balanced-brace scanner behind `parseComplexityResponse`.
 *
 * `findRegionsObject` exists because the obvious implementation — span the first
 * `{` to the last `}` — breaks on exactly the models this seam is aimed at.
 * Reasoning models emit paragraphs that quote the code under analysis, braces
 * included, before they answer; the naive span swallows the reasoning and parses
 * nothing.
 *
 * It had no tests. The one adjacent case, "tolerates prose around the JSON",
 * wraps the answer in prose containing NO braces, so it passes identically under
 * the naive implementation and says nothing about the scanner. Everything below
 * is chosen to fail if the scanner is replaced by a first-brace-to-last-brace
 * span, or if its string handling, its resume position, or its
 * last-valid-candidate rule regress.
 *
 * This is untrusted input from a remote model. The tests therefore also cover
 * the shapes nobody sends on purpose: unterminated strings, stray closing
 * braces, and a pathological repeat that must not hang the editor.
 */

const LINES = 20;
const answer = (cc: number) =>
	`{"regions":[{"startLine":0,"endLine":2,"cognitiveComplexity":${cc}}]}`;

describe('findRegionsObject: prose that contains braces', () => {
	it('finds the answer after reasoning that quotes braced code', () => {
		// The case the scanner was written for. A first-to-last span here starts at
		// the `{` of `if (x) {` and ends at the final `}`, which is not valid JSON.
		const reply = [
			'Let me work through this.',
			'The function opens with `if (x) { return 1; }` which is one branch,',
			'and the loop body `for (...) { ... }` adds another.',
			'',
			answer(4)
		].join('\n');

		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(4);
	});

	it('finds the answer when braced code follows it as well', () => {
		const reply = [
			'Here is the result:',
			answer(6),
			'',
			'For reference, the region I scored was `function f() { ... }`.'
		].join('\n');

		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(6);
	});

	it('survives a whole conversation of braces around one answer', () => {
		const noise = Array.from({ length: 12 }, (_, i) => `step ${i}: { partial: ${i} }`).join('\n');
		const reply = `${noise}\n${answer(9)}\n${noise}`;
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(9);
	});
});

describe('findRegionsObject: which candidate wins', () => {
	it('takes the LAST valid answer, not the first', () => {
		// A model that revises itself must be read as having revised itself. Taking
		// the first would render a draft the model already discarded.
		const reply = `First attempt: ${answer(2)}\nOn reflection: ${answer(11)}`;
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(11);
	});

	it('ignores later objects that are valid JSON but carry no regions', () => {
		const reply = `${answer(5)}\nMetadata: {"model":"test","elapsedMs":42}`;
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(5);
	});

	it('ignores earlier objects that are valid JSON but carry no regions', () => {
		const reply = `{"status":"thinking"}\n${answer(7)}`;
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(7);
	});

	it('skips a malformed object and still finds a later good one', () => {
		const reply = `{"regions":[{"startLine":0,]}\n${answer(3)}`;
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(3);
	});
});

describe('findRegionsObject: braces inside strings are not structure', () => {
	it('does not close the object on a brace inside a JSON string', () => {
		// `"}"` would end the object one character early for a depth counter that
		// does not track strings, and the truncated text would not parse.
		const reply =
			'{"regions":[{"startLine":0,"endLine":2,"cognitiveComplexity":8,"name":"f() {}"}]}';
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(8);
	});

	it('handles an escaped quote inside a string', () => {
		const reply =
			'{"regions":[{"startLine":0,"endLine":2,"cognitiveComplexity":5,"name":"say \\" then }"}]}';
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(5);
	});

	it('handles a trailing backslash inside a string without running past the end', () => {
		const reply = `{"regions":[{"note":"c:\\\\"}]}\n${answer(4)}`;
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(4);
	});

	it('is not confused by an apostrophe in prose before the answer', () => {
		// Prose is full of apostrophes, and the scanner treats `'` as a string
		// delimiter so it can also read JS-style object literals.
		const reply = `I'd say it's a 6, and here's why. Anyway:\n${answer(6)}`;
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(6);
	});

	it('recovers when an apostrophe opens an unterminated string mid-candidate', () => {
		// `{ isn't JSON }` opens a `'` string that never closes, so that candidate
		// never balances. The answer after it must still be found.
		const reply = `{ this isn't JSON }\n${answer(10)}`;
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(10);
	});
});

describe('findRegionsObject: malformed input declines instead of throwing', () => {
	it.each([
		['a stray closing brace before anything', '}}}'],
		['an unclosed object', '{"regions":[{"startLine":0,'],
		['an unterminated string', '{"regions":"'],
		['braces with no JSON anywhere', 'if (x) { y(); } else { z(); }'],
		['empty text', ''],
		['only whitespace', '   \n\t  ']
	])('%s', (_label, reply) => {
		expect(() => parseComplexityResponse(reply, LINES)).not.toThrow();
		expect(parseComplexityResponse(reply, LINES)).toBeNull();
	});

	it('declines on a top-level array, which is not the documented shape', () => {
		expect(
			parseComplexityResponse('[{"startLine":0,"endLine":2,"cognitiveComplexity":3}]', LINES)
		).toBeNull();
	});
});

describe('findRegionsObject: shapes real APIs and models actually emit', () => {
	it('reads an answer wrapped in an envelope', () => {
		// Structured-output APIs return `{"result": …}`, and models asked for an
		// envelope oblige. A top-level-only check declined this outright while the
		// bare form parsed fine.
		expect(
			parseComplexityResponse(`{"result":${answer(7)}}`, LINES)?.regions[0].cognitiveComplexity
		).toBe(7);
	});

	it('reads an answer nested two levels down', () => {
		expect(
			parseComplexityResponse(`{"data":{"analysis":${answer(5)}}}`, LINES)?.regions[0]
				.cognitiveComplexity
		).toBe(5);
	});

	it('prefers the final answer over a superseded draft across a long transcript', () => {
		// The regression the work budget introduced. Scanning forwards and keeping
		// the last winner meant exhausting the budget silently returned an EARLIER
		// candidate: at 26KB of ordinary prose this produced the draft the model had
		// already revised, cc=3, in place of its final cc=14. Preferring the last
		// candidate is the entire reason this function exists.
		const noise = Array.from(
			{ length: 800 },
			(_, i) => `Looking at line ${i}: the guard \`if (cfg.enabled) {\` opens a branch`
		).join('\n');
		const reply = `${answer(3)}\n${noise}\n${answer(14)}`;
		expect(reply.length).toBeGreaterThan(40_000);
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(14);
	});
});

describe('findRegionsObject: fenced replies', () => {
	it('answers from the LAST fence, not the first', () => {
		// A reply that restates the code in a ```js fence and answers in a ```json
		// one below it. Taking the first fence and searching only inside it declined
		// this shape entirely.
		const reply = ['```js', 'if (x) { y(); }', '```', '', '```json', answer(9), '```'].join('\n');
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(9);
	});

	it('reads the answer out of a fence whose code contains braces', () => {
		const reply = ['Here you go:', '```json', answer(12), '```'].join('\n');
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(12);
	});

	it('reads a fence with no language tag', () => {
		const reply = ['```', answer(1), '```'].join('\n');
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(1);
	});
});

describe('findRegionsObject: cost on hostile input', () => {
	// The scan is quadratic in the worst case, and a work budget is what bounds
	// it. Measured before the budget existed: 2k chars 9ms, 10k 131ms, 20k 531ms,
	// 40k 2.1s — on the same thread as typing, from a string a remote model
	// supplies. These assert the budget holds, and that it does not cost
	// correctness on inputs that finish well inside it.
	it('stays fast on a long run of unbalanced opening braces', () => {
		const hostile = '{'.repeat(200_000);
		const started = performance.now();
		expect(parseComplexityResponse(hostile, LINES)).toBeNull();
		// Unbudgeted this shape is ~50s. Generous headroom for a loaded CI box;
		// the point is the difference between bounded and quadratic, not the ms.
		expect(performance.now() - started).toBeLessThan(1000);
	});

	it('stays fast on a long run of quoted braces', () => {
		const hostile = `${'"{"'.repeat(60_000)}\n${answer(2)}`;
		const started = performance.now();
		parseComplexityResponse(hostile, LINES);
		expect(performance.now() - started).toBeLessThan(1000);
	});

	it('still reads a realistic reply buried in a long transcript', () => {
		// The budget must not cost correctness at sizes a real transport produces.
		// DEFAULT_MAX_TOKENS caps the bundled transports at roughly 5k characters.
		const transcript = Array.from(
			{ length: 60 },
			(_, i) => `Considering region ${i}: \`if (x) { y(); }\` looks like one branch.`
		).join('\n');
		const reply = `${transcript}\n${answer(13)}`;
		expect(reply.length).toBeGreaterThan(3000);
		expect(parseComplexityResponse(reply, LINES)?.regions[0].cognitiveComplexity).toBe(13);
	});
});
