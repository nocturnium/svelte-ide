import { describe, expect, it } from 'vitest';
import { parse } from 'acorn';
import { planOrganizeImports, type OrganizeImportsPlan } from './organize-imports';

type PlanResult = ReturnType<typeof planOrganizeImports>;

function toLines(code: string): { text: string }[] {
	return code.split('\n').map((text) => ({ text }));
}

function plan(code: string, language = 'javascript'): PlanResult {
	return planOrganizeImports({ lines: toLines(code), language });
}

function expectPlan(result: PlanResult): OrganizeImportsPlan {
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.reason);
	return result;
}

function expectRefusal(result: PlanResult, reasonSubstring: string): void {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error('expected a refusal but planning succeeded');
	expect(result.reason).toContain(reasonSubstring);
}

function applyPlan(code: string, p: OrganizeImportsPlan): string {
	const out = code.split('\n');
	out.splice(p.startLine, p.endLine - p.startLine + 1, ...p.newText.split('\n'));
	return out.join('\n');
}

/** Parser oracle: the organized module must be valid JS (no redeclare etc.). */
function expectAppliedParses(code: string, p: OrganizeImportsPlan): string {
	const edited = applyPlan(code, p);
	expect(() => parse(edited, { ecmaVersion: 'latest', sourceType: 'module' })).not.toThrow();
	return edited;
}

describe('planOrganizeImports — accepts', () => {
	it('sorts by module path and removes an exact duplicate', () => {
		const code = [
			"import { printLine } from './io';",
			"import { formatCurrency, formatPercent } from './money';",
			"import { printLine } from './io';",
			'',
			'function renderInvoice() {}'
		].join('\n');
		const result = expectPlan(plan(code));
		expect(result.newText).toBe(
			[
				"import { printLine } from './io';",
				"import { formatCurrency, formatPercent } from './money';"
			].join('\n')
		);
		const edited = expectAppliedParses(code, result);
		// The body is untouched and the duplicate is gone.
		expect(edited).toContain('function renderInvoice() {}');
		expect(edited.match(/printLine/g)?.length).toBe(1);
	});

	it('sorts named specifiers within an import', () => {
		const code = ["import { b, a, c } from 'x';", '', 'const y = 1;'].join('\n');
		const result = expectPlan(plan(code));
		expect(result.newText).toBe("import { a, b, c } from 'x';");
		expectAppliedParses(code, result);
	});

	it('sorts statements by source', () => {
		const code = ["import { z } from './zebra';", "import { a } from './apple';"].join('\n');
		const result = expectPlan(plan(code));
		expect(result.newText.split('\n')[0]).toContain('./apple');
		expect(result.newText.split('\n')[1]).toContain('./zebra');
	});

	it('handles a default + named import', () => {
		const code = ["import Foo, { b, a } from 'x';", '', 'Foo;'].join('\n');
		const result = expectPlan(plan(code));
		expect(result.newText).toBe("import Foo, { a, b } from 'x';");
		expectAppliedParses(code, result);
	});

	it('handles a namespace import', () => {
		const code = ["import { b } from './b';", "import * as ns from './a';", '', 'ns;'].join('\n');
		const result = expectPlan(plan(code));
		expect(result.newText).toBe(
			["import * as ns from './a';", "import { b } from './b';"].join('\n')
		);
		expectAppliedParses(code, result);
	});

	it('leaves a leading license comment untouched', () => {
		const code = ['// Copyright 2026', "import { b } from './b';", "import { a } from './a';"].join(
			'\n'
		);
		const result = expectPlan(plan(code));
		expect(result.startLine).toBe(1);
		const edited = applyPlan(code, result);
		expect(edited.split('\n')[0]).toBe('// Copyright 2026');
		expect(edited.split('\n')[1]).toContain('./a');
	});
});

describe('planOrganizeImports — refusals', () => {
	it('refuses when there are no imports', () => {
		expectRefusal(plan('const x = 1;\nconst y = 2;'), 'No imports');
	});

	it('refuses a side-effect import', () => {
		const code = ["import './polyfill';", "import { a } from './a';"].join('\n');
		expectRefusal(plan(code), 'Side-effect');
	});

	it('refuses a multi-line import', () => {
		const code = ['import {', '\ta,', '\tb', "} from 'x';"].join('\n');
		expectRefusal(plan(code), 'Multi-line');
	});

	it('refuses comments interleaved in the block', () => {
		const code = ["import { a } from './a';", '// group two', "import { b } from './b';"].join(
			'\n'
		);
		expectRefusal(plan(code), 'Comments between imports');
	});

	it('refuses when imports are already organized', () => {
		const code = ["import { a } from './a';", "import { b } from './b';"].join('\n');
		expectRefusal(plan(code), 'already organized');
	});

	it('refuses an unparseable import statement', () => {
		const code = ["import { a } from 'x' extra junk;"].join('\n');
		expectRefusal(plan(code), 'Could not safely parse');
	});

	it('refuses an unsupported language', () => {
		expectRefusal(plan("import foo from 'bar'", 'python'), 'JavaScript/TypeScript only');
	});
});

describe('planOrganizeImports — adversarial regressions (ph3 hardening)', () => {
	it('does not misread a default import named `type` as a type-only import', () => {
		// `import type , { a }` is a DEFAULT import named `type` plus a named import
		// `a` — NOT a TS `import type`. Misreading it dropped the `type` binding and
		// emitted invalid JS. The binding must survive and the output must parse.
		const code = ["import type , { a } from './a';", "import b from './b';"].join('\n');
		const result = expectPlan(plan(code));
		const edited = expectAppliedParses(code, result);
		expect(edited).toContain('import type, { a }');
	});

	it('still treats a genuine `import type { … }` as type-only and sorts it', () => {
		// (No acorn oracle — `import type` is TS-only syntax acorn cannot parse.)
		const code = ["import type { B, A } from './t';", "import { c } from './c';"].join('\n');
		const result = expectPlan(plan(code));
		expect(result.newText).toContain('import type { A, B }');
	});

	it('refuses two comma-separated default imports (invalid JS)', () => {
		const code = ["import A, B from 'x';", "import { z } from 'y';"].join('\n');
		expectRefusal(plan(code), 'Could not safely parse');
	});

	it('refuses a namespace import combined with a named clause (invalid JS)', () => {
		const code = ["import * as ns, { a } from 'm';", "import { z } from 'y';"].join('\n');
		expectRefusal(plan(code), 'Could not safely parse');
	});

	it('refuses default + namespace + named together (invalid JS)', () => {
		const code = ["import Foo, * as ns, { a } from 'x';", "import { z } from 'y';"].join('\n');
		expectRefusal(plan(code), 'Could not safely parse');
	});

	it('organizes when a body comment follows the import block (not interleaved)', () => {
		const code = [
			"import { b } from './b';",
			"import { a } from './a';",
			'// helpers',
			'function h() {}'
		].join('\n');
		const result = expectPlan(plan(code));
		expect(result.newText.split('\n')[0]).toContain('./a');
		const edited = expectAppliedParses(code, result);
		expect(edited).toContain('// helpers');
		expect(edited).toContain('function h() {}');
	});
});
