import { describe, expect, it } from 'vitest';
import { formatInlineMarkdown, safeUrl } from './safe-markdown';

describe('safeUrl', () => {
	it('allows web, mail, anchors and same-site paths', () => {
		for (const ok of ['https://e.com', 'HTTP://e.com', 'mailto:a@b.c', '#x', '/a', './a', '../a']) {
			expect(safeUrl(ok)).toBe(ok);
		}
	});

	it('rejects script schemes and protocol-relative URLs', () => {
		for (const bad of [
			'javascript:alert(1)',
			' JaVaScRiPt:1',
			'data:text/html,x',
			'//evil.example',
			'vbscript:x'
		]) {
			expect(safeUrl(bad)).toBeNull();
		}
	});
});

describe('formatInlineMarkdown', () => {
	it('keeps emphasis markers inside a URL out of the href', () => {
		expect(formatInlineMarkdown('[a](https://e.com/*x*)')).toBe(
			'<a href="https://e.com/*x*" target="_blank" rel="noopener noreferrer">a</a>'
		);
	});

	it('formats emphasis in labels and surrounding text', () => {
		expect(formatInlineMarkdown('**b** and [*c*](/p)')).toBe(
			'<strong>b</strong> and <a href="/p" target="_blank" rel="noopener noreferrer"><em>c</em></a>'
		);
	});

	it('degrades unsafe links to their label', () => {
		expect(formatInlineMarkdown('[x](javascript:alert)')).toBe('x');
		expect(formatInlineMarkdown('[x](javascript:alert(1))')).not.toContain('href');
		expect(formatInlineMarkdown('[x](//evil.example)')).toBe('x');
	});
});
