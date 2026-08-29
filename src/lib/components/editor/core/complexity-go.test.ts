import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer } from './complexity-analyzer';
import type { Line } from './state';

/**
 * Go region detection.
 *
 * Every case here failed before the type-literal guard in `identifyGoRegions`.
 * The failure mode was the dangerous one: `interface{}` or `struct{}` anywhere in
 * a signature opened the region on the brace of the TYPE LITERAL, which closed on
 * the very next token — so the region spanned the signature alone and reported
 * cognitive complexity **0** for the whole function. Not an approximation, and
 * not a near miss: zero, confidently, for most non-trivial Go.
 *
 * Assertions pin the SPAN as well as the score. The score was only ever wrong
 * because the span was, and a test that checks the number alone would pass again
 * the moment a region collapses to a line that happens to hold no branches.
 */

const mk = (code: string): Line[] => code.split('\n').map((text, number) => ({ number, text }));

function analyze(code: string) {
	const metrics = new ComplexityAnalyzer().analyze(mk(code), 'go');
	return metrics.regions[0];
}

/** if(+1) + for(+1) + if nested one level(+2) = 4 */
const BODY = [
	'\tif v == nil {',
	'\t\treturn 0',
	'\t}',
	'\tfor i := 0; i < 10; i++ {',
	'\t\tif i > 5 {',
	'\t\t\treturn i',
	'\t\t}',
	'\t}',
	'\treturn 1',
	'}'
].join('\n');

describe('Go regions: type literals in a signature are not the body', () => {
	it.each([
		['parameter', 'func Handle(v interface{}) int {'],
		['map value', 'func Handle(m map[string]interface{}) int {'],
		['variadic', 'func Handle(args ...interface{}) int {'],
		['channel', 'func Handle(c chan struct{}) int {'],
		['func-typed parameter', 'func Handle(fn func() struct{}) int {'],
		// Return position is the case a rule anchored on the last `)` gets wrong in
		// the opposite direction: it accepts the literal and rejects the real body.
		['return type interface{}', 'func Handle() interface{} {'],
		['return type struct{}', 'func Handle() struct{} {'],
		['anonymous struct return', 'func Handle() (r struct{ A int }) {']
	])('spans the whole function: %s', (_label, signature) => {
		const region = analyze(`${signature}\n${BODY}`);
		expect(region?.endLine, 'region must reach the closing brace').toBe(10);
		expect(region?.cognitiveComplexity).toBe(4);
		expect(region?.type).toBe('function');
	});

	it('handles a multi-line signature, where no brace sits on the declaration line', () => {
		const code = ['func Handle(', '\tv interface{},', '\tx bool,', ') int {', BODY].join('\n');
		const region = analyze(code);
		expect(region?.startLine).toBe(0);
		expect(region?.endLine).toBe(13);
		expect(region?.cognitiveComplexity).toBe(4);
	});

	it('still opens the body of a `type X struct` declaration', () => {
		// The one shape where a brace after `struct` IS the body. Guarding on the
		// keyword alone would have broken this.
		const region = analyze('type Point struct {\n\tX int\n\tY int\n}');
		expect(region?.type).toBe('class');
		expect(region?.name).toBe('Point');
		expect(region?.endLine).toBe(3);
	});

	it('still opens the body of a `type X interface` declaration', () => {
		const region = analyze('type Shape interface {\n\tArea() float64\n}');
		expect(region?.type).toBe('class');
		expect(region?.name).toBe('Shape');
		expect(region?.endLine).toBe(2);
	});
});

describe('Go regions: generics', () => {
	it('names a generic function', () => {
		// Requiring `(` right after the name dropped every generic function: no
		// region at all, so the file-level fallback claimed the file and the name
		// came back undefined.
		const region = analyze(`func Map[T any](v T) int {\n${BODY}`);
		expect(region?.name).toBe('Map');
		expect(region?.type).toBe('function');
		expect(region?.cognitiveComplexity).toBe(4);
	});

	it('names a generic type declaration', () => {
		const region = analyze('type Stack[T any] struct {\n\titems []T\n}');
		expect(region?.name).toBe('Stack');
		expect(region?.type).toBe('class');
	});

	it('names a method on a receiver', () => {
		const region = analyze(`func (s *Stack) Push(v interface{}) error {\n${BODY}`);
		expect(region?.name).toBe('Push');
		expect(region?.cognitiveComplexity).toBe(4);
	});
});

describe('Go regions: unaffected shapes still work', () => {
	it('scores a signature with no braces in it', () => {
		const region = analyze(`func Handle(v int) int {\n${BODY}`);
		expect(region?.endLine).toBe(10);
		expect(region?.cognitiveComplexity).toBe(4);
	});

	it('finds two functions in one file, each with its own span', () => {
		const code = [
			'func A(v interface{}) int {',
			'\tif v == nil {',
			'\t\treturn 0',
			'\t}',
			'\treturn 1',
			'}',
			'',
			'func B(m map[string]interface{}) int {',
			'\tif m == nil {',
			'\t\treturn 0',
			'\t}',
			'\treturn 1',
			'}'
		].join('\n');
		const regions = new ComplexityAnalyzer().analyze(mk(code), 'go').regions;
		const byName = Object.fromEntries(regions.map((r) => [r.name, r]));
		expect(byName['A']?.endLine).toBe(5);
		expect(byName['B']?.startLine).toBe(7);
		expect(byName['B']?.endLine).toBe(12);
		expect(byName['A']?.cognitiveComplexity).toBe(1);
		expect(byName['B']?.cognitiveComplexity).toBe(1);
	});
});
