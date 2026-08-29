import { describe, it, expect, vi } from 'vitest';
import {
	buildComplexityPrompt,
	createChatComplexityProvider,
	mergeProvidedComplexity,
	parseComplexityResponse
} from './complexity-provider';
import {
	ComplexityAnalyzer,
	getComplexityLevel,
	type ComplexityMetrics
} from './complexity-analyzer';
import type { Line } from './state';

const makeLines = (code: string): Line[] =>
	code.split('\n').map((text, number) => ({ number, text }));

const SAMPLE = [
	'function hot(x) {',
	'  if (x > 1) {',
	'    if (x > 2) return 2;',
	'  }',
	'  return 0;',
	'}'
].join('\n');

function baselineFor(code: string): ComplexityMetrics {
	return new ComplexityAnalyzer().analyze(makeLines(code), 'typescript');
}

describe('complexity provider: response validation', () => {
	// A model reply is untrusted input. Rendering an unvalidated number
	// confidently is precisely the failure this seam exists to escape, so every
	// malformed shape must DECLINE rather than degrade.
	const lineCount = 6;

	it('accepts a well-formed reply', () => {
		const r = parseComplexityResponse(
			'{"regions":[{"startLine":0,"endLine":5,"cognitiveComplexity":3}]}',
			lineCount
		);
		expect(r?.regions).toEqual([
			{ startLine: 0, endLine: 5, cognitiveComplexity: 3, name: undefined }
		]);
	});

	it('unwraps a fenced reply, because models fence anyway', () => {
		const r = parseComplexityResponse(
			'```json\n{"regions":[{"startLine":0,"endLine":2,"cognitiveComplexity":1}]}\n```',
			lineCount
		);
		expect(r?.regions).toHaveLength(1);
	});

	it('tolerates prose around the JSON', () => {
		const r = parseComplexityResponse(
			'Sure! Here is the analysis:\n{"regions":[{"startLine":0,"endLine":2,"cognitiveComplexity":4}]}\nHope that helps.',
			lineCount
		);
		expect(r?.regions[0].cognitiveComplexity).toBe(4);
	});

	it.each([
		['not JSON at all', 'I could not analyze that.'],
		['valid JSON, wrong shape', '{"result":"ok"}'],
		['regions not an array', '{"regions":"lots"}'],
		['missing complexity', '{"regions":[{"startLine":0,"endLine":2}]}'],
		[
			'complexity not a number',
			'{"regions":[{"startLine":0,"endLine":2,"cognitiveComplexity":"high"}]}'
		],
		['negative complexity', '{"regions":[{"startLine":0,"endLine":2,"cognitiveComplexity":-3}]}'],
		[
			'fractional complexity',
			'{"regions":[{"startLine":0,"endLine":2,"cognitiveComplexity":2.5}]}'
		],
		['end before start', '{"regions":[{"startLine":4,"endLine":1,"cognitiveComplexity":2}]}'],
		['negative line', '{"regions":[{"startLine":-1,"endLine":2,"cognitiveComplexity":2}]}'],
		['start past EOF', '{"regions":[{"startLine":900,"endLine":901,"cognitiveComplexity":2}]}'],
		['empty regions', '{"regions":[]}']
	])('declines: %s', (_label, reply) => {
		expect(parseComplexityResponse(reply, lineCount)).toBeNull();
	});

	it('clamps an over-long end line rather than dropping the region', () => {
		const r = parseComplexityResponse(
			'{"regions":[{"startLine":0,"endLine":9999,"cognitiveComplexity":2}]}',
			lineCount
		);
		expect(r?.regions[0].endLine).toBe(lineCount - 1);
	});

	it('keeps the valid regions from a partly-bad reply', () => {
		const r = parseComplexityResponse(
			'{"regions":[{"startLine":0,"endLine":2,"cognitiveComplexity":3},{"startLine":9,"endLine":1,"cognitiveComplexity":"x"}]}',
			lineCount
		);
		expect(r?.regions).toHaveLength(1);
	});
});

describe('complexity provider: prompt', () => {
	it('numbers the lines it asks about, so returned indices are unambiguous', () => {
		const prompt = buildComplexityPrompt({
			code: SAMPLE,
			language: 'typescript',
			baseline: baselineFor(SAMPLE),
			signal: new AbortController().signal
		});
		expect(prompt).toContain('0: function hot(x) {');
		expect(prompt).toContain('5: }');
		expect(prompt).toContain('typescript');
		// The rules, not a target number — a prompt that names a threshold invites
		// the model to hit it.
		expect(prompt).toContain('nesting penalty');
		expect(prompt).not.toMatch(/threshold is 15/);
	});
});

describe('complexity provider: transport wrapper', () => {
	it('passes the abort signal through and returns validated regions', async () => {
		const complete = vi.fn(
			async (_prompt: string, _signal: AbortSignal) =>
				'{"regions":[{"startLine":0,"endLine":5,"cognitiveComplexity":9,"name":"hot"}]}'
		);
		const provider = createChatComplexityProvider(complete, { source: 'test-model' });
		const controller = new AbortController();

		const result = await provider({
			code: SAMPLE,
			language: 'typescript',
			baseline: baselineFor(SAMPLE),
			signal: controller.signal
		});

		expect(complete).toHaveBeenCalledOnce();
		expect(complete.mock.calls[0][1]).toBe(controller.signal);
		expect(result?.source).toBe('test-model');
		expect(result?.regions[0].cognitiveComplexity).toBe(9);
	});

	it('declines when the model returns nonsense', async () => {
		const provider = createChatComplexityProvider(async () => 'no idea, sorry');
		const result = await provider({
			code: SAMPLE,
			language: 'typescript',
			baseline: baselineFor(SAMPLE),
			signal: new AbortController().signal
		});
		expect(result).toBeNull();
	});
});

describe('complexity provider: merge', () => {
	it('replaces the overlapping region and re-derives the headline', () => {
		const baseline = baselineFor(SAMPLE);
		expect(baseline.maxCognitiveComplexity).toBe(3);

		const merged = mergeProvidedComplexity(
			baseline,
			{ regions: [{ startLine: 0, endLine: 5, cognitiveComplexity: 20 }], source: 'm' },
			getComplexityLevel
		);

		expect(merged.maxCognitiveComplexity).toBe(20);
		expect(merged.level).toBe('critical');
		expect(merged.regions.filter((r) => r.startLine === 0)).toHaveLength(1);
	});

	it('keeps built-in regions the provider did not speak about', () => {
		const two = `${SAMPLE}\n\nfunction other(y) {\n  if (y) return 1;\n  return 0;\n}`;
		const baseline = baselineFor(two);
		const before = baseline.regions.length;

		const merged = mergeProvidedComplexity(
			baseline,
			{ regions: [{ startLine: 0, endLine: 5, cognitiveComplexity: 11 }] },
			getComplexityLevel
		);

		// The untouched function survives; only the overlapping one is replaced.
		expect(merged.regions.length).toBe(before);
		expect(merged.regions.some((r) => r.name === 'other')).toBe(true);
		expect(merged.maxCognitiveComplexity).toBe(11);
	});

	it('carries the band forward so the UI cannot disagree with the number', () => {
		const baseline = baselineFor(SAMPLE);
		const merged = mergeProvidedComplexity(
			baseline,
			{ regions: [{ startLine: 0, endLine: 5, cognitiveComplexity: 7 }] },
			getComplexityLevel
		);
		const region = merged.regions.find((r) => r.startLine === 0);
		expect(region?.level).toBe(getComplexityLevel(7));
	});
});
