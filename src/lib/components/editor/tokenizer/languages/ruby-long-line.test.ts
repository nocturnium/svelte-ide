import { describe, expect, it } from 'vitest';
import { tokenize } from '../index';

describe('ruby tokenizer on very long lines', () => {
	it('stays fast and covers the whole line', () => {
		const line = 'var a = "x" + 1; '.repeat(12_000); // ~200k chars
		const start = performance.now();
		const [result] = tokenize(line, 'ruby');
		expect(performance.now() - start).toBeLessThan(2000);
		expect(result.tokens.at(-1)!.end).toBe(line.length);
		expect(result.tokens.map((t) => t.text).join('')).toBe(line);
	});
});
