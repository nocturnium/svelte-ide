import { describe, it, expect } from 'vitest';
import { createEditorState, type EditorState } from './state';
import { planExtractFunction, type ExtractPlan } from './extract-function';
import {
	applyExtractPlan,
	extractFunctionAt,
	findEnclosingFunctionRegion
} from './apply-extract-plan';
import { getComplexityAnalyzer, type ComplexityMetrics } from './complexity-analyzer';

function stateFrom(code: string): EditorState {
	return createEditorState({ content: code, language: 'typescript' });
}

function planFor(
	code: string,
	region: { startLine: number; endLine: number },
	blockStart: number,
	blockEnd: number
): ExtractPlan {
	const lines = code.split('\n').map((text) => ({ text }));
	const result = planExtractFunction({
		lines,
		language: 'typescript',
		region: { ...region, type: 'function' },
		blockStart,
		blockEnd
	});
	if (!result.ok) throw new Error(`expected a plan, got refusal: ${result.reason}`);
	return result;
}

function selectLines(editor: EditorState, from: number, to: number): void {
	const end = editor.getLine(to)?.text.length ?? 0;
	editor.setSelection({ line: from, column: 0 }, { line: to, column: end });
}

function balanced(text: string): boolean {
	return (text.match(/{/g) || []).length === (text.match(/}/g) || []).length;
}

describe('applyExtractPlan', () => {
	it('replaces a single-line block with the call and appends the new function', () => {
		const code = ['function f(total) {', '\tconsole.log(total);', '}'].join('\n');
		const editor = stateFrom(code);
		applyExtractPlan(editor, planFor(code, { startLine: 0, endLine: 2 }, 1, 1), 1, 1);

		expect(editor.getContent()).toBe(
			[
				'function f(total) {',
				'\textracted(total);',
				'}',
				'function extracted(total) {',
				'\tconsole.log(total);',
				'}'
			].join('\n')
		);
		expect(balanced(editor.getContent())).toBe(true);
	});

	it('handles a multi-line block and is a single undo/redo', () => {
		const code = [
			'function f(list, acc) {',
			'\tfor (const item of list) {',
			'\t\tif (item.ok) {',
			'\t\t\tacc.push(item);',
			'\t\t}',
			'\t}',
			'\treturn acc;',
			'}'
		].join('\n');
		const editor = stateFrom(code);
		const plan = planFor(code, { startLine: 0, endLine: 7 }, 1, 5);
		applyExtractPlan(editor, plan, 1, 5);

		const after = editor.getContent();
		expect(after).toContain('\textracted(list, acc);');
		expect(after).toContain('function extracted(list, acc) {');
		expect(balanced(after)).toBe(true);

		editor.undo();
		expect(editor.getContent()).toBe(code);
		editor.redo();
		expect(editor.getContent()).toBe(after);
	});
});

describe('findEnclosingFunctionRegion', () => {
	it('returns the innermost function region containing the block', () => {
		const metrics = {
			regions: [
				{ startLine: 0, endLine: 20, type: 'function' },
				{ startLine: 5, endLine: 12, type: 'function' },
				{ startLine: 6, endLine: 10, type: 'block' }
			]
		} as unknown as ComplexityMetrics;

		expect(findEnclosingFunctionRegion(metrics, 7, 8)?.startLine).toBe(5);
		expect(findEnclosingFunctionRegion(metrics, 0, 1)?.startLine).toBe(0);
		expect(findEnclosingFunctionRegion(metrics, 30, 31)).toBeUndefined();
		expect(findEnclosingFunctionRegion(null, 0, 0)).toBeUndefined();
	});
});

describe('extractFunctionAt', () => {
	const analyzer = getComplexityAnalyzer();
	const metricsOf = (editor: EditorState): ComplexityMetrics =>
		analyzer.analyze(editor.lines, editor.language);

	it('extracts the selected block end-to-end and one undo restores it', () => {
		const code = ['function f(a) {', '\tconst doubled = a * 2;', '\tuse(doubled);', '}'].join('\n');
		const editor = stateFrom(code);
		selectLines(editor, 1, 1);

		const result = extractFunctionAt(editor, metricsOf(editor));
		expect(result.ok).toBe(true);

		const after = editor.getContent();
		expect(after).toContain('function extracted(a)');
		expect(after).toContain('extracted(a)');
		expect(balanced(after)).toBe(true);

		editor.undo();
		expect(editor.getContent()).toBe(code);
	});

	it('passes the planner refusal through (block escapes with return)', () => {
		const code = ['function f() {', '\tif (cond) {', '\t\treturn 1;', '\t}', '\tdone();', '}'].join(
			'\n'
		);
		const editor = stateFrom(code);
		selectLines(editor, 1, 3);

		const result = extractFunctionAt(editor, metricsOf(editor));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason.toLowerCase()).toContain('escape');
		// The editor is untouched on refusal.
		expect(editor.getContent()).toBe(code);
	});

	it('refuses when there is no selection', () => {
		const editor = stateFrom('function f() {}');
		expect(extractFunctionAt(editor, metricsOf(editor)).ok).toBe(false);
	});

	it('refuses when the selection is not inside a function', () => {
		const editor = stateFrom('const x = 1;\nconst y = 2;');
		selectLines(editor, 0, 1);
		expect(extractFunctionAt(editor, metricsOf(editor)).ok).toBe(false);
	});

	it('refuses extracting from inside a class method (would insert a bare function in the class body)', () => {
		const code = ['class C {', '\tm(a) {', '\t\tconst d = a * 2;', '\t\tuse(d);', '\t}', '}'].join(
			'\n'
		);
		const editor = stateFrom(code);
		selectLines(editor, 2, 3);

		const result = extractFunctionAt(editor, metricsOf(editor));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason.toLowerCase()).toContain('method');
		expect(editor.getContent()).toBe(code);
	});

	it('refuses extracting from inside an object-literal method (no enclosing class region)', () => {
		const code = [
			'const o = {',
			'\tm(a) {',
			'\t\tconst d = a * 2;',
			'\t\tuse(d);',
			'\t}',
			'};'
		].join('\n');
		const editor = stateFrom(code);
		selectLines(editor, 2, 3);

		const result = extractFunctionAt(editor, metricsOf(editor));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason.toLowerCase()).toContain('method');
		expect(editor.getContent()).toBe(code);
	});
});
