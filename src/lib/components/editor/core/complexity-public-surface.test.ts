import { describe, it, expect } from 'vitest';
import {
	getComplexityLevel,
	summarizeContributions,
	type ComplexityMetrics,
	type ComplexityRegion
} from './complexity-analyzer';

/**
 * What a consumer has to write to feed their own analysis in.
 *
 * `ComplexityMetrics` is an INPUT type, not just an output: it is the prop
 * `ComplexityLayer` and `ComplexityHeatLayer` take. So its required members are a
 * bill every consumer pays, and it used to require `score`, `overall` and a
 * five-member `factors` object — four of whose members are documented as no part
 * of the metric. Anyone rendering their own reading had to fabricate six numbers
 * they were simultaneously told not to read.
 *
 * These are compile-time assertions wearing a test's clothes. The bodies barely
 * matter; if `score`, `overall` or `factors` ever become required again, this
 * file stops type-checking and `npm run check` fails.
 */

describe('a consumer can build metrics without fabricating deprecated fields', () => {
	it('constructs a region from only what the metric actually defines', () => {
		const region: ComplexityRegion = {
			startLine: 0,
			endLine: 9,
			type: 'function',
			name: 'handle',
			cognitiveComplexity: 12,
			level: getComplexityLevel(12),
			contributions: [
				{ line: 1, kind: 'if', increment: 1, nesting: 0, reason: 'if branch (+1, nesting 0)' },
				{ line: 4, kind: 'for', increment: 2, nesting: 1, reason: 'for loop (+2, nesting 1)' }
			]
			// No `score`. No `factors`. Both omitted deliberately.
		};

		expect(region.score).toBeUndefined();
		expect(region.factors).toBeUndefined();
		expect(summarizeContributions(region.contributions).total).toBe(3);
	});

	it('constructs file-level metrics without the legacy mean', () => {
		const metrics: ComplexityMetrics = {
			level: 'high',
			regions: [],
			hotspots: [],
			totalCognitiveComplexity: 12,
			maxCognitiveComplexity: 12,
			source: 'provider',
			sourceName: 'my-parser'
			// No `overall`.
		};

		expect(metrics.overall).toBeUndefined();
		expect(metrics.maxCognitiveComplexity).toBe(12);
	});
});
