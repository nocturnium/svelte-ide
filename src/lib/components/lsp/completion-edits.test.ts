import { describe, expect, it } from 'vitest';
import { applyContentChanges } from '../../services/lsp-client';
import { expandSnippet, planCompletionEdits, type CompletionPlan } from './completion-edits';

/** Apply a plan the way CustomEditor.applyEdits does (bottom-up). */
function apply(content: string, plan: CompletionPlan): string {
	const changes = [...plan.edits]
		.sort((a, b) => b.from.line - a.from.line || b.from.column - a.from.column)
		.map((e) => ({
			range: {
				start: { line: e.from.line, character: e.from.column },
				end: { line: e.to.line, character: e.to.column }
			},
			text: e.text
		}));
	return applyContentChanges(content, changes);
}

describe('planCompletionEdits', () => {
	it('replaces the identifier fragment before the caret', () => {
		const content = 'const x = con';
		const plan = planCompletionEdits({ label: 'console' }, content, 0, 13);
		expect(apply(content, plan)).toBe('const x = console');
		expect(plan.caret).toEqual({ line: 0, column: 17 });
	});

	it('prefers insertText over label', () => {
		const plan = planCompletionEdits({ label: 'log', insertText: 'log()' }, 'console.lo', 0, 10);
		expect(apply('console.lo', plan)).toBe('console.log()');
	});

	it('honours textEdit ranges, including insert/replace edits', () => {
		const content = 'foo.barBaz';
		const plain = planCompletionEdits(
			{
				label: 'qux',
				textEdit: {
					range: { start: { line: 0, character: 4 }, end: { line: 0, character: 10 } },
					newText: 'qux'
				}
			},
			content,
			0,
			7
		);
		expect(apply(content, plain)).toBe('foo.qux');
		const insertReplace = planCompletionEdits(
			{
				label: 'qux',
				textEdit: {
					insert: { start: { line: 0, character: 4 }, end: { line: 0, character: 7 } },
					replace: { start: { line: 0, character: 4 }, end: { line: 0, character: 10 } },
					newText: 'qux'
				} as never
			},
			content,
			0,
			7
		);
		expect(apply(content, insertReplace)).toBe('foo.qux');
	});

	it('expands snippets and lands on the first tab stop', () => {
		const plan = planCompletionEdits(
			{ label: 'for', insertText: 'for (${1:i}; $2) {\n\t$0\n}', insertTextFormat: 2 },
			'fo',
			0,
			2
		);
		expect(apply('fo', plan)).toBe('for (i; ) {\n\t\n}');
		expect(plan.caret).toEqual({ line: 0, column: 5 });
	});

	it('applies additionalTextEdits (auto-import) and keeps the caret on the completion', () => {
		const content = 'line one\nuseSt';
		const plan = planCompletionEdits(
			{
				label: 'useState',
				additionalTextEdits: [
					{
						range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
						newText: "import { useState } from 'react';\n"
					}
				]
			},
			content,
			1,
			5
		);
		expect(apply(content, plan)).toBe("import { useState } from 'react';\nline one\nuseState");
		expect(plan.caret).toEqual({ line: 2, column: 8 });
	});
});

describe('expandSnippet', () => {
	it('handles choices, escapes and variables with defaults', () => {
		expect(expandSnippet('${1|a,b|} \\$ ${TM_SELECTED_TEXT:sel}').text).toBe('a $ sel');
		expect(expandSnippet('plain').caret).toBe(5);
	});
});

describe('applyContentChanges', () => {
	it('applies incremental and full changes in order', () => {
		const after = applyContentChanges('hello\nworld', [
			{
				range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
				text: 'there'
			},
			{ range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } }, text: ',' }
		]);
		expect(after).toBe('hello,\nthere');
		expect(applyContentChanges('x', [{ text: 'full' }])).toBe('full');
	});
});
