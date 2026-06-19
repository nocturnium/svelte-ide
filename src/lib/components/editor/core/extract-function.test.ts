import { describe, expect, it } from 'vitest';
import { tokenize } from '../tokenizer';
import { planExtractFunction, type ExtractPlan } from './extract-function';

type TestLine = { number: number; text: string };

function makeLines(code: string): TestLine[] {
	return code.split('\n').map((text, number) => ({ number, text }));
}

function expectPlan(plan: ReturnType<typeof planExtractFunction>): ExtractPlan {
	expect(plan.ok).toBe(true);
	if (!plan.ok) throw new Error(plan.reason);
	return plan;
}

function expectRefusal(
	plan: ReturnType<typeof planExtractFunction>,
	reasonSubstring: string
): void {
	expect(plan.ok).toBe(false);
	if (plan.ok) throw new Error('expected refusal');
	expect(plan.reason).toContain(reasonSubstring);
}

function applyPlan(
	lines: readonly TestLine[],
	plan: ExtractPlan,
	blockStart: number,
	blockEnd: number
): string {
	const next = [
		...lines.slice(0, blockStart).map((line) => line.text),
		plan.callText,
		...lines.slice(blockEnd + 1).map((line) => line.text)
	];
	next.splice(plan.insertAfterLine - (blockEnd - blockStart), 0, plan.functionText);
	return next.join('\n');
}

function expectPostEditValid(
	lines: readonly TestLine[],
	plan: ExtractPlan,
	blockStart: number,
	blockEnd: number,
	language = 'javascript'
): void {
	const edited = applyPlan(lines, plan, blockStart, blockEnd);
	let braces = 0;
	let parens = 0;
	let brackets = 0;
	for (const line of tokenize(edited, language)) {
		for (const token of line.tokens) {
			if (token.type === 'comment' || token.type.startsWith('comment.')) continue;
			if (token.type === 'string' || token.type.startsWith('string.')) continue;
			if (token.type === 'invalid') {
				throw new Error(`invalid token ${token.text}`);
			}
			if (token.text === '{') braces++;
			else if (token.text === '}') braces--;
			else if (token.text === '(') parens++;
			else if (token.text === ')') parens--;
			else if (token.text === '[') brackets++;
			else if (token.text === ']') brackets--;
			expect(braces).toBeGreaterThanOrEqual(0);
			expect(parens).toBeGreaterThanOrEqual(0);
			expect(brackets).toBeGreaterThanOrEqual(0);
		}
	}
	expect({ braces, parens, brackets }).toEqual({ braces: 0, parens: 0, brackets: 0 });
}

describe('planExtractFunction', () => {
	it('E1 extracts a single free var with no return', () => {
		const lines = makeLines(['function f(total) {', '\tconsole.log(total);', '}'].join('\n'));
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 2, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			})
		);

		expect(plan.params).toEqual(['total']);
		expect(plan.returns).toEqual([]);
		expect(plan.functionText).toBe('function extracted(total) {\n\tconsole.log(total);\n}');
		expect(plan.callText).toBe('extracted(total);');
		expectPostEditValid(lines, plan, 1, 1);
	});

	it('E2 extracts one input and one declared output', () => {
		const lines = makeLines(
			['function f(x) {', '\tconst doubled = x * 2;', '\tconsole.log(doubled);', '}'].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			})
		);

		expect(plan.params).toEqual(['x']);
		expect(plan.returns).toEqual(['doubled']);
		expect(plan.functionText).toBe(
			'function extracted(x) {\n\tconst doubled = x * 2;\n\treturn doubled;\n}'
		);
		expect(plan.callText).toBe('const doubled = extracted(x);');
		expectPostEditValid(lines, plan, 1, 1);
	});

	it('E3 extracts multiple inputs and object returns', () => {
		const lines = makeLines(
			[
				'function f(a, b) {',
				'\tconst sum = a + b;',
				'\tconst prod = a * b;',
				'\tconsole.log(sum, prod);',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 4, type: 'function' },
				blockStart: 1,
				blockEnd: 2
			})
		);

		expect(plan.params).toEqual(['a', 'b']);
		expect(plan.returns).toEqual(['sum', 'prod']);
		expect(plan.functionText).toBe(
			'function extracted(a, b) {\n\tconst sum = a + b;\n\tconst prod = a * b;\n\treturn { sum, prod };\n}'
		);
		expect(plan.callText).toBe('const { sum, prod } = extracted(a, b);');
		expectPostEditValid(lines, plan, 1, 2);
	});

	it('E4 extracts a single reassigned outer output without const', () => {
		const lines = makeLines(
			[
				'function f(items) {',
				'\tlet count = 0;',
				'\tcount = count + items.length;',
				'\tconsole.log(count);',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 4, type: 'function' },
				blockStart: 2,
				blockEnd: 2
			})
		);

		expect(plan.params).toEqual(['count', 'items']);
		expect(plan.returns).toEqual(['count']);
		expect(plan.functionText).toBe(
			'function extracted(count, items) {\n\tcount = count + items.length;\n\treturn count;\n}'
		);
		expect(plan.callText).toBe('count = extracted(count, items);');
		expectPostEditValid(lines, plan, 2, 2);
	});

	it('E5 treats mutation by reference as no return', () => {
		const lines = makeLines(
			[
				'function f(list, acc) {',
				'\tfor (const item of list) {',
				'\t\tif (item.ok) {',
				'\t\t\tacc.push(item);',
				'\t\t}',
				'\t}',
				'\tconsole.log(acc);',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 7, type: 'function' },
				blockStart: 1,
				blockEnd: 5
			})
		);

		expect(plan.params).toEqual(['list', 'acc']);
		expect(plan.returns).toEqual([]);
		expect(plan.functionText).toBe(
			'function extracted(list, acc) {\n\tfor (const item of list) {\n\t\tif (item.ok) {\n\t\t\tacc.push(item);\n\t\t}\n\t}\n}'
		);
		expect(plan.callText).toBe('extracted(list, acc);');
		expectPostEditValid(lines, plan, 1, 5);
	});

	it('E6 excludes member names from params', () => {
		const lines = makeLines(
			[
				'function f(user, request) {',
				'\tconst label = user.role + request.channel;',
				'\tconsole.log(label);',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			})
		);

		expect(plan.params).toEqual(['user', 'request']);
		expect(plan.returns).toEqual(['label']);
		expect(plan.functionText).toBe(
			'function extracted(user, request) {\n\tconst label = user.role + request.channel;\n\treturn label;\n}'
		);
		expect(plan.callText).toBe('const label = extracted(user, request);');
		expectPostEditValid(lines, plan, 1, 1);
	});

	it('E7 excludes builtins and globals from params', () => {
		const lines = makeLines(
			[
				'function f(x, y) {',
				'\tconst max = Math.max(x, y);',
				'\tconsole.log(x);',
				'\treturn max;',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 4, type: 'function' },
				blockStart: 1,
				blockEnd: 2
			})
		);

		expect(plan.params).toEqual(['x', 'y']);
		expect(plan.returns).toEqual(['max']);
		expect(plan.functionText).toBe(
			'function extracted(x, y) {\n\tconst max = Math.max(x, y);\n\tconsole.log(x);\n\treturn max;\n}'
		);
		expect(plan.callText).toBe('const max = extracted(x, y);');
		expectPostEditValid(lines, plan, 1, 2);
	});

	it('E8 extracts TypeScript with untyped params', () => {
		const lines = makeLines(
			[
				'function f(x: number): void {',
				'\tconst doubled = x * 2;',
				'\tconsole.log(doubled);',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'typescript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			})
		);

		expect(plan.params).toEqual(['x']);
		expect(plan.returns).toEqual(['doubled']);
		expect(plan.functionText).toBe(
			'function extracted(x) {\n\tconst doubled = x * 2;\n\treturn doubled;\n}'
		);
		expect(plan.callText).toBe('const doubled = extracted(x);');
		expectPostEditValid(lines, plan, 1, 1, 'typescript');
	});

	it('returns an outer variable mutated by postfix increment', () => {
		const lines = makeLines(
			['function f(a) {', '\tlet x = a;', '\tx++;', '\tuse(x);', '}'].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 4, type: 'function' },
				blockStart: 2,
				blockEnd: 2
			})
		);

		expect(plan.params).toEqual(['x']);
		expect(plan.returns).toEqual(['x']);
		expect(plan.functionText).toBe('function extracted(x) {\n\tx++;\n\treturn x;\n}');
		expect(plan.callText).toBe('x = extracted(x);');
		expectPostEditValid(lines, plan, 2, 2);
	});

	it.each(['x++;', '++x;', 'x--;', '--x;', 'x ++;', '++ x;', 'x  --;'])(
		'never drops outer mutation for increment/decrement %s',
		(statement) => {
			const lines = makeLines(
				['function f(a) {', '\tlet x = a;', `\t${statement}`, '\tuse(x);', '}'].join('\n')
			);
			const plan = expectPlan(
				planExtractFunction({
					lines,
					language: 'javascript',
					region: { startLine: 0, endLine: 4, type: 'function' },
					blockStart: 2,
					blockEnd: 2
				})
			);

			expect(plan.returns).toContain('x');
			expect(plan.returns).not.toEqual([]);
			expectPostEditValid(lines, plan, 2, 2);
		}
	);

	it('does not treat separated unary plus tokens as an increment', () => {
		const lines = makeLines(['function f(a, b) {', '\ta + +b;', '\tuse(a);', '}'].join('\n'));
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			})
		);

		expect(plan.params).toEqual(['a', 'b']);
		expect(plan.returns).toEqual([]);
		expectPostEditValid(lines, plan, 1, 1);
	});

	it.each(['x &&= 7;', 'x ||= 0;', 'x ??= 7;', 'x **= 2;', 'x >>>= 1;'])(
		'never drops outer mutation for fragmented compound assignment %s',
		(statement) => {
			const lines = makeLines(
				['function f(a) {', '\tlet x = a;', `\t${statement}`, '\tuse(x);', '}'].join('\n')
			);
			const plan = expectPlan(
				planExtractFunction({
					lines,
					language: 'javascript',
					region: { startLine: 0, endLine: 4, type: 'function' },
					blockStart: 2,
					blockEnd: 2
				})
			);

			expect(plan.returns).toContain('x');
			expect(plan.returns).not.toEqual([]);
			expectPostEditValid(lines, plan, 2, 2);
		}
	);

	it('refuses a catch binding used after the extracted block', () => {
		const lines = makeLines(
			['function f() {', '\ttry { risky(); } catch (out) { out = 1; }', '\tsink(out);', '}'].join(
				'\n'
			)
		);
		expectRefusal(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			}),
			'conditionally defined'
		);
	});

	it('keeps an outer parameter used outside a shadowing arrow callback', () => {
		const lines = makeLines(
			['function f(k, rows) {', '\tconst r = rows.map((k) => k + 1) + k;', '\tuse(r);', '}'].join(
				'\n'
			)
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			})
		);

		expect(plan.params).toEqual(['rows', 'k']);
		expect(plan.functionText).toContain('function extracted(rows, k)');
		expect(plan.functionText).toContain('+ k;');
		expect(plan.returns).toEqual(['r']);
		expectPostEditValid(lines, plan, 1, 1);
	});

	it('keeps an outer parameter used outside a shadowing catch binding', () => {
		const lines = makeLines(
			[
				'function f(err, logger) {',
				'\tlogger.info(err);',
				'\ttry { risky(); } catch (err) { logger.warn(err); }',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 2
			})
		);

		expect(plan.params).toEqual(['logger', 'err']);
		expect(plan.returns).toEqual([]);
		expect(plan.functionText).toContain('function extracted(logger, err)');
		expectPostEditValid(lines, plan, 1, 2);
	});

	it('does not treat a non-colliding arrow callback parameter as outer', () => {
		const lines = makeLines(
			[
				'function f(items) {',
				'\tconst values = items.map((it) => it.value);',
				'\tuse(values);',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			})
		);

		expect(plan.params).toEqual(['items']);
		expect(plan.params).not.toContain('it');
		expect(plan.returns).toEqual(['values']);
		expectPostEditValid(lines, plan, 1, 1);
	});

	it('keeps a block-body closure param local without leaking an outer shadowed var', () => {
		// The forEach callback param `d` shadows the outer `d` (used after the
		// block). The block-body brace-range scope must keep the callback's `d`
		// local — so `d` is neither a param nor confused with the outer one.
		const lines = makeLines(
			[
				'function f(d, rows) {',
				'\trows.forEach((d) => {',
				'\t\trecord(d);',
				'\t});',
				'\tsink(d);',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 5, type: 'function' },
				blockStart: 1,
				blockEnd: 3
			})
		);

		expect(plan.params).toEqual(['rows']);
		expect(plan.params).not.toContain('d');
		expect(plan.returns).toEqual([]);
		expectPostEditValid(lines, plan, 1, 3);
	});

	it('refuses a block whose inner lexical let shadows an outer var used after it', () => {
		// `x` is declared before, re-declared with `let` inside the `if`, and read
		// after. Returning the inner `x` would emit a duplicate `const x` at the
		// call site (SyntaxError) — must refuse, not silently miswrite.
		const lines = makeLines(
			[
				'function f(cond) {',
				'\tlet x = 1;',
				'\tif (cond) {',
				'\t\tlet x = 2;',
				'\t\tlog(x);',
				'\t}',
				'\tsink(x);',
				'}'
			].join('\n')
		);
		expectRefusal(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 7, type: 'function' },
				blockStart: 2,
				blockEnd: 5
			}),
			'conditionally defined'
		);
	});

	it('refuses a block whose inner const shadows an outer var used after it', () => {
		const lines = makeLines(
			[
				'function f(cond) {',
				'\tconst y = 5;',
				'\twhile (cond) {',
				'\t\tconst y = 9;',
				'\t\temit(y);',
				'\t}',
				'\treport(y);',
				'}'
			].join('\n')
		);
		expectRefusal(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 7, type: 'function' },
				blockStart: 2,
				blockEnd: 5
			}),
			'conditionally defined'
		);
	});

	it.each(['x+++y', 'x---y'])(
		'does not over-model the trailing operand of %s as a mutation',
		(expr) => {
			// `x+++y` is `x++ + y`: x is incremented (a real mutation), y is only
			// read. Without the run guard, the trailing `y` was spuriously modeled
			// as assigned, forcing a multi-return-with-outer refusal.
			const lines = makeLines(
				['function f(y) {', '\tlet x = 0;', `\t${expr};`, '\tuse(x);', '\tsink(y);', '}'].join('\n')
			);
			const plan = expectPlan(
				planExtractFunction({
					lines,
					language: 'javascript',
					region: { startLine: 0, endLine: 5, type: 'function' },
					blockStart: 2,
					blockEnd: 2
				})
			);

			expect(plan.returns).toContain('x');
			expect(plan.returns).not.toContain('y');
			expectPostEditValid(lines, plan, 2, 2);
		}
	);

	it.each(['obj.x += 1;', 'arr[i]++;'])(
		'keeps member and computed mutation targets out of returns for %s',
		(statement) => {
			const lines = makeLines(
				['function f(obj, arr, i) {', `\t${statement}`, '\tuse(obj, arr, i);', '}'].join('\n')
			);
			const plan = expectPlan(
				planExtractFunction({
					lines,
					language: 'javascript',
					region: { startLine: 0, endLine: 3, type: 'function' },
					blockStart: 1,
					blockEnd: 1
				})
			);

			expect(plan.returns).toEqual([]);
			expectPostEditValid(lines, plan, 1, 1);
		}
	);

	it('extracts object literal keys without treating them as labels', () => {
		const lines = makeLines(
			['function f(x) {', '\tconst o = { key: x };', '\tuse(o);', '}'].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			})
		);

		expect(plan.params).toEqual(['x']);
		expect(plan.returns).toEqual(['o']);
		expect(plan.callText).toBe('const o = extracted(x);');
		expectPostEditValid(lines, plan, 1, 1);
	});

	it('keeps a for-header increment variable local when it is not used after the block', () => {
		const lines = makeLines(
			[
				'function f(arr, n) {',
				'\tlet sum = 0;',
				'\tfor (let i = 0; i < n; i++) {',
				'\t\tsum += arr[i];',
				'\t}',
				'\tuse(sum);',
				'}'
			].join('\n')
		);
		const plan = expectPlan(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 6, type: 'function' },
				blockStart: 2,
				blockEnd: 4
			})
		);

		expect(plan.returns).toContain('sum');
		expect(plan.returns).not.toContain('i');
		expectPostEditValid(lines, plan, 2, 4);
	});

	it('R1 refuses return escaping the extracted function', () => {
		const lines = makeLines(
			['function f(result) {', '\treturn result;', '\tconsole.log(result);', '}'].join('\n')
		);
		expectRefusal(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			}),
			'escape'
		);
	});

	it('R2 refuses await', () => {
		const lines = makeLines(
			[
				'async function f(url) {',
				'\tconst data = await fetch(url);',
				'\tconsole.log(data);',
				'}'
			].join('\n')
		);
		expectRefusal(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			}),
			'await'
		);
	});

	it('R3 refuses this-bound code', () => {
		const lines = makeLines(
			[
				'function f(key, value) {',
				'\tthis.cache.set(key, value);',
				'\tconsole.log(key);',
				'}'
			].join('\n')
		);
		expectRefusal(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 3, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			}),
			'this/arguments'
		);
	});

	it('R4 refuses unbalanced selections', () => {
		const lines = makeLines(
			['function f(ok) {', '\tif (ok) {', '\t\tconsole.log(ok);', '\t}', '}'].join('\n')
		);
		expectRefusal(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 4, type: 'function' },
				blockStart: 1,
				blockEnd: 2
			}),
			'complete set of statements'
		);
	});

	it('R5 refuses non-JavaScript languages', () => {
		const lines = makeLines(['def f(x):', '\tprint(x)'].join('\n'));
		expectRefusal(
			planExtractFunction({
				lines,
				language: 'python',
				region: { startLine: 0, endLine: 1, type: 'function' },
				blockStart: 1,
				blockEnd: 1
			}),
			'JavaScript/TypeScript only'
		);
	});

	it('R6 refuses break escaping its loop', () => {
		const lines = makeLines(
			[
				'function f(items) {',
				'\tfor (const item of items) {',
				'\t\tif (item.done) {',
				'\t\t\tbreak;',
				'\t\t}',
				'\t}',
				'}'
			].join('\n')
		);
		expectRefusal(
			planExtractFunction({
				lines,
				language: 'javascript',
				region: { startLine: 0, endLine: 6, type: 'function' },
				blockStart: 2,
				blockEnd: 4
			}),
			'escape'
		);
	});
});
