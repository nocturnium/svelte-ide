import { describe, expect, it } from 'vitest';
import { parse } from 'acorn';
import { planExtractVariable, type ExtractVariablePlan } from './extract-variable';

type PlanResult = ReturnType<typeof planExtractVariable>;

function toLines(code: string): { text: string }[] {
	return code.split('\n').map((text) => ({ text }));
}

/** Build a single-line selection covering the first occurrence of `snippet`. */
function selectionFor(code: string, lineIndex: number, snippet: string) {
	const lineText = code.split('\n')[lineIndex];
	const column = lineText.indexOf(snippet);
	if (column < 0) throw new Error(`snippet not found on line ${lineIndex}: ${snippet}`);
	return {
		start: { line: lineIndex, column },
		end: { line: lineIndex, column: column + snippet.length }
	};
}

function plan(
	code: string,
	lineIndex: number,
	snippet: string,
	language = 'javascript'
): PlanResult {
	return planExtractVariable({
		lines: toLines(code),
		language,
		selection: selectionFor(code, lineIndex, snippet)
	});
}

function expectPlan(result: PlanResult): ExtractVariablePlan {
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.reason);
	return result;
}

function expectRefusal(result: PlanResult, reasonSubstring: string): void {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error('expected a refusal but planning succeeded');
	expect(result.reason).toContain(reasonSubstring);
}

/** Apply the plan to the source the way the editor would, for the parser oracle. */
function applyPlanToSource(code: string, p: ExtractVariablePlan): string {
	const out = code.split('\n');
	const line = out[p.insertLine];
	out[p.insertLine] =
		line.slice(0, p.replaceRange.start.column) + p.varName + line.slice(p.replaceRange.end.column);
	out.splice(p.insertLine, 0, p.declarationLine);
	return out.join('\n');
}

/** The parser oracle: an accepted rewrite must be valid JS, not merely balanced. */
function expectAppliedParses(code: string, p: ExtractVariablePlan): string {
	const edited = applyPlanToSource(code, p);
	expect(() => parse(edited, { ecmaVersion: 'latest', sourceType: 'module' })).not.toThrow();
	return edited;
}

describe('planExtractVariable — accepts', () => {
	it('hoists a binary expression and leaves valid code', () => {
		const code = ['function f(order) {', '\tconst tax = subtotal * order.taxRate;', '}'].join('\n');
		const result = expectPlan(plan(code, 1, 'subtotal * order.taxRate'));
		expect(result.declarationLine).toBe('\tconst extracted = subtotal * order.taxRate;');
		const edited = expectAppliedParses(code, result);
		expect(edited).toContain('const extracted = subtotal * order.taxRate;');
		expect(edited).toContain('const tax = extracted;');
	});

	it('hoists a chained call with nested commas (depth > 0)', () => {
		const code = [
			'function f(order) {',
			'\tconst subtotal = order.items.reduce((sum, item) => sum + item.price, 0);',
			'}'
		].join('\n');
		const result = expectPlan(
			plan(code, 1, 'order.items.reduce((sum, item) => sum + item.price, 0)')
		);
		expectAppliedParses(code, result);
	});

	it('hoists a string-concatenation expression', () => {
		const code = ['function f(total) {', "\tprintLine('Total: ' + total);", '}'].join('\n');
		const result = expectPlan(plan(code, 1, "'Total: ' + total"));
		expectAppliedParses(code, result);
	});

	it('hoists a complete ternary', () => {
		const code = ['function f(active) {', "\tconst label = active ? 'on' : 'off';", '}'].join('\n');
		const result = expectPlan(plan(code, 1, "active ? 'on' : 'off'"));
		expectAppliedParses(code, result);
	});

	it('hoists an optional-chaining member expression', () => {
		const code = ['function f(user) {', '\tconst name = user?.profile?.name;', '}'].join('\n');
		const result = expectPlan(plan(code, 1, 'user?.profile?.name'));
		expectAppliedParses(code, result);
	});
});

describe('planExtractVariable — refusals', () => {
	it('refuses a multi-line selection', () => {
		const code = ['function f() {', '\tconst a = 1;', '\tconst b = 2;', '}'].join('\n');
		const result = planExtractVariable({
			lines: toLines(code),
			language: 'javascript',
			selection: { start: { line: 1, column: 1 }, end: { line: 2, column: 5 } }
		});
		expectRefusal(result, 'single-line');
	});

	it('refuses an assignment', () => {
		const code = ['function f(count) {', '\tcount = count + 1;', '}'].join('\n');
		expectRefusal(plan(code, 1, 'count = count + 1'), 'assignment');
	});

	it('refuses a statement (return)', () => {
		const code = ['function f(total) {', '\treturn total;', '}'].join('\n');
		expectRefusal(plan(code, 1, 'return total'), 'not a statement');
	});

	it('refuses a selection containing a semicolon', () => {
		const code = ['function f() {', '\tfoo(); bar();', '}'].join('\n');
		expectRefusal(plan(code, 1, 'foo(); bar()'), 'not a statement');
	});

	it('refuses a top-level comma (sequence)', () => {
		const code = ['function f(a, b) {', '\tconst pair = [a, b];', '}'].join('\n');
		expectRefusal(plan(code, 1, 'a, b'), 'multiple expressions');
	});

	it('refuses await', () => {
		const code = ['async function f(id) {', '\tconst x = await fetchUserData(id);', '}'].join('\n');
		expectRefusal(plan(code, 1, 'await fetchUserData(id)'), 'await');
	});

	it('refuses an unbalanced selection', () => {
		const code = ['function f(items) {', '\tconst n = items.reduce((s, x) => s + x, 0);', '}'].join(
			'\n'
		);
		expectRefusal(plan(code, 1, 'reduce((s'), 'complete expression');
	});

	it('refuses a trivial single identifier', () => {
		const code = ['function f(total) {', '\tprintLine(total);', '}'].join('\n');
		expectRefusal(plan(code, 1, 'total'), 'simple value');
	});

	it('refuses when an `extracted` identifier already exists', () => {
		const code = [
			'function f(order) {',
			'\tconst extracted = 1;',
			'\tconst tax = subtotal * order.taxRate;',
			'}'
		].join('\n');
		expectRefusal(plan(code, 2, 'subtotal * order.taxRate'), 'already exists');
	});

	it('refuses a selection containing a comment', () => {
		const code = ['function f(a, b) {', '\tconst s = a + b; // sum', '}'].join('\n');
		expectRefusal(plan(code, 1, 'a + b; // sum'), 'comment');
	});

	it('refuses an incomplete ternary', () => {
		const code = ['function f(active) {', "\tconst label = active ? 'on';", '}'].join('\n');
		expectRefusal(plan(code, 1, "active ? 'on'"), 'complete expression');
	});

	it('refuses a dangling trailing operator', () => {
		const code = ['function f(subtotal) {', '\tconst x = subtotal + tax;', '}'].join('\n');
		expectRefusal(plan(code, 1, 'subtotal +'), 'complete expression');
	});

	it('refuses a leading binary operator', () => {
		const code = ['function f(order) {', '\tconst tax = subtotal * order.taxRate;', '}'].join('\n');
		expectRefusal(plan(code, 1, '* order.taxRate'), 'complete expression');
	});

	it('refuses a spread element', () => {
		const code = ['function f(args) {', '\tconst all = collect(...args);', '}'].join('\n');
		expectRefusal(plan(code, 1, '...args'), 'complete expression');
	});

	it('refuses an empty / whitespace selection', () => {
		const code = ['function f() {', '\tconst a = 1;', '}'].join('\n');
		const result = planExtractVariable({
			lines: toLines(code),
			language: 'javascript',
			selection: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }
		});
		expectRefusal(result, 'Select an expression');
	});

	it('refuses an unsupported language', () => {
		const code = ['x := a * b'].join('\n');
		expectRefusal(plan(code, 0, 'a * b', 'go'), 'JavaScript/TypeScript only');
	});
});

// Regression suite locking the false-accepts found by the adversarial workflow
// (Track H ph3 hardening). Each refusal here once returned ok:true and produced
// invalid JS, dropped a binding, or changed behavior.
describe('planExtractVariable — adversarial regressions (ph3 hardening)', () => {
	it('refuses a leading keyword operator (in)', () => {
		const code = ['function f(key, registry) {', '\tconst has = key in registry;', '}'].join('\n');
		expectRefusal(plan(code, 1, 'in registry'), 'complete expression');
	});

	it('refuses a leading keyword operator (instanceof)', () => {
		const code = ['function f(node) {', '\tconst ok = node instanceof Element;', '}'].join('\n');
		expectRefusal(plan(code, 1, 'instanceof Element'), 'complete expression');
	});

	it.each([
		['typeof', 'function f(value) {\n\tconst t = typeof value;\n}'],
		['void', 'function f(thing) {\n\tconst u = void thing;\n}'],
		['delete', 'function f(obj) {\n\tconst d = delete obj.prop;\n}'],
		['new', 'function f() {\n\tconst inst = new Widget();\n}']
	])('refuses a lone unary keyword (%s)', (keyword, code) => {
		expectRefusal(plan(code, 1, keyword), 'complete expression');
	});

	it('refuses a mis-ordered ternary (colon before its ?)', () => {
		const code = ['function f(a, b, c, d, e) {', '\tconst l = a ? b : c ? d : e;', '}'].join('\n');
		expectRefusal(plan(code, 1, 'b : c ? d'), 'complete expression');
	});

	it('refuses a selection that splits a template literal', () => {
		// The unmatched `${` makes the brace balance reject it as incomplete.
		const code = ['function f(user) {', '\tconst s = `hi ${user} bye`;', '}'].join('\n');
		expectRefusal(plan(code, 1, '`hi ${user'), 'complete expression');
	});

	it('refuses a selection whose start is inside a string literal', () => {
		const code = ['function f() {', "\tconst v = 'foo' + 'bar';", '}'].join('\n');
		expectRefusal(plan(code, 1, "oo' + 'bar"), 'splits a string');
	});

	it('refuses a selection whose end is inside a block comment (would drop a binding)', () => {
		const code = [
			'function f(a, b) {',
			'\tconst s = a + b /* note */;',
			'\tconst t = 7;',
			'}'
		].join('\n');
		expectRefusal(plan(code, 1, 'a + b /* no'), 'splits a string');
	});

	it.each([
		['short-circuit &&', 'function f(a, obj) {\n\treturn a && obj.run();\n}', 'obj.run()'],
		['ternary branch', 'function f(cond) {\n\treturn cond ? expensive() : 0;\n}', 'expensive()'],
		['nullish ??', 'function f(x) {\n\treturn x ?? compute();\n}', 'compute()'],
		['sibling operand', 'function f() {\n\tconst r = b() + a();\n}', 'a()']
	])('refuses hoisting a call out of a larger expression (%s)', (_label, code, snippet) => {
		expectRefusal(plan(code, 1, snippet), 'when it runs');
	});

	it('refuses a parenthesized assignment', () => {
		const code = ['function f() {', '\twhile ((line = next())) {}', '}'].join('\n');
		expectRefusal(plan(code, 1, '(line = next())'), 'assignment');
	});

	it('refuses a parenthesized compound assignment', () => {
		const code = ['function f(o) {', '\tlog((o.n += 1));', '}'].join('\n');
		expectRefusal(plan(code, 1, '(o.n += 1)'), 'assignment');
	});

	it('refuses a prefix increment (mutation)', () => {
		const code = ['function f(a, arr) {', '\treturn arr[++a];', '}'].join('\n');
		expectRefusal(plan(code, 1, '++a'), 'mutates');
	});

	it('refuses a dangling TS `as` assertion', () => {
		expectRefusal(
			plan('const result = doStuff(value as);', 0, 'value as', 'typescript'),
			'complete expression'
		);
	});

	it('refuses a dangling TS `satisfies`', () => {
		expectRefusal(
			plan('const result = doStuff(config satisfies);', 0, 'config satisfies', 'typescript'),
			'complete expression'
		);
	});

	// These must STILL be accepted — the hardening must not over-refuse complete,
	// safe expressions (a false refuse is safe but a usability regression).
	it.each([
		[
			'full `in` expression',
			'function f(key, registry) {\n\tconst has = key in registry;\n}',
			'key in registry'
		],
		[
			'full `instanceof`',
			'function f(node) {\n\tconst ok = node instanceof Element;\n}',
			'node instanceof Element'
		],
		['full `typeof`', 'function f(value) {\n\tconst t = typeof value;\n}', 'typeof value'],
		[
			'a `new` expression as the whole value',
			'function f() {\n\tconst inst = new Widget();\n}',
			'new Widget()'
		],
		[
			'a call as the complete RHS',
			'function f(order) {\n\tconst s = order.items.reduce(fn, 0);\n}',
			'order.items.reduce(fn, 0)'
		],
		[
			'a parenthesized sequence as the complete value',
			'function f() {\n\treturn (init(), value);\n}',
			'(init(), value)'
		]
	])('still accepts %s', (_label, code, snippet) => {
		const result = expectPlan(plan(code, 1, snippet));
		expectAppliedParses(code, result);
	});
});

// Round 2 of the adversarial sweep caught both a residual false-accept and a
// batch of OVER-refusals (the round-1 hardening was too aggressive on common,
// safe expressions). Lock both directions.
describe('planExtractVariable — adversarial regressions round 2', () => {
	it('refuses hoisting an optional call out of a short-circuit (fn?.())', () => {
		const code = ['function f(a, fn) {', '\treturn a && fn?.();', '}'].join('\n');
		expectRefusal(plan(code, 1, 'fn?.()'), 'when it runs');
	});

	it.each([
		[
			'an interpolated template literal',
			'function f(n) {\n\tconst s = `Hello ${n}!`;\n}',
			'`Hello ${n}!`'
		],
		[
			'a nested-interpolation template',
			'function f(a, b) {\n\tconst s = `${a}-${b}`;\n}',
			'`${a}-${b}`'
		],
		['a nullish-coalescing expression', 'function f(a, b) {\n\tconst r = a ?? b;\n}', 'a ?? b'],
		[
			'a mixed ternary + nullish',
			'function f(c, x, y, z) {\n\tconst r = c ? x : y ?? z;\n}',
			'c ? x : y ?? z'
		],
		[
			'a string literal that contains ${',
			'function f(x) {\n\tconst s = x + "cost ${0}";\n}',
			'x + "cost ${0}"'
		],
		[
			'a regex literal containing a backtick',
			'function f(s) {\n\tconst v = s.replace(/`/g, "x");\n}',
			's.replace(/`/g, "x")'
		]
	])('no longer over-refuses %s', (_label, code, snippet) => {
		const result = expectPlan(plan(code, 1, snippet));
		expectAppliedParses(code, result);
	});
});

// Round 3 — the call-context guard now refuses ANY side-effecting construct in a
// sub-expression position, closing the call-FORM holes (tagged template,
// keyword-named property call, optional call) the form-specific detector missed.
describe('planExtractVariable — adversarial regressions round 3', () => {
	it.each([
		['a tagged template', 'function f(a) {\n\treturn a && tag`run ${a}`;\n}', 'tag`run ${a}`'],
		[
			'a keyword-named property call',
			'function f(a, arr) {\n\treturn a && arr.in();\n}',
			'arr.in()'
		],
		[
			'a grouped call in a ternary branch',
			'function f(c) {\n\treturn c ? wrap(go()) : 0;\n}',
			'wrap(go())'
		],
		['a delete expression', 'function f(a, obj) {\n\treturn a && delete obj.x;\n}', 'delete obj.x']
	])('refuses hoisting %s out of a conditional', (_label, code, snippet) => {
		expectRefusal(plan(code, 1, snippet), 'when it runs');
	});

	it('still accepts a tagged template as the complete right-hand side', () => {
		const code = ['function f(n) {', '\tconst s = tag`hi ${n}`;', '}'].join('\n');
		const result = expectPlan(plan(code, 1, 'tag`hi ${n}`'));
		expectAppliedParses(code, result);
	});
});
