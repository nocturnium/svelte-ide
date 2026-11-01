/**
 * Every value imported from the published package in README.md and docs/
 * must actually be exported from the entry point the doc uses. A quickstart
 * that imports an undefined component is a broken product.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const entries: Record<string, () => Promise<Record<string, unknown>>> = {
	'@nocturnium/svelte-ide': () => import('$lib/index'),
	'@nocturnium/svelte-ide/stores': () => import('$lib/stores'),
	'@nocturnium/svelte-ide/services': () => import('$lib/services'),
	'@nocturnium/svelte-ide/components/editor': () => import('$lib/components/editor'),
	'@nocturnium/svelte-ide/components/core': () => import('$lib/components/core'),
	'@nocturnium/svelte-ide/components/ai': () => import('$lib/components/ai'),
	'@nocturnium/svelte-ide/components/layout': () => import('$lib/components/layout'),
	'@nocturnium/svelte-ide/components/lsp': () => import('$lib/components/lsp'),
	'@nocturnium/svelte-ide/components/agents': () => import('$lib/components/agents'),
	'@nocturnium/svelte-ide/components/vfs': () => import('$lib/components/vfs'),
	'@nocturnium/svelte-ide/components/plugins': () => import('$lib/components/plugins'),
	'@nocturnium/svelte-ide/utils': () => import('$lib/utils'),
	'@nocturnium/svelte-ide/types': () => import('$lib/types'),
	'@nocturnium/svelte-ide/plugins': () => import('$lib/plugins'),
	'@nocturnium/svelte-ide/crdt': () => import('$lib/crdt')
};

function markdownFiles(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) markdownFiles(path, out);
		else if (path.endsWith('.md')) out.push(path);
	}
	return out;
}

describe('documented imports', () => {
	it('resolve to real exports', async () => {
		const files = [...markdownFiles('docs'), 'README.md'];
		const problems: string[] = [];
		const loaded: Record<string, Record<string, unknown>> = {};
		const pattern = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+'(@nocturnium\/svelte-ide[^']*)'/g;

		for (const file of files) {
			const text = readFileSync(file, 'utf8');
			for (const match of text.matchAll(pattern)) {
				if (match[1]) continue; // type-only import
				const entry = match[3];
				if (entry.endsWith('.css')) continue;
				const load = entries[entry];
				if (!load) {
					problems.push(file + ': unknown entry ' + entry);
					continue;
				}
				loaded[entry] ??= await load();
				const names = match[2].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
				for (const raw of names.split(',')) {
					const name = raw
						.trim()
						.split(/\s+as\s+/)[0]
						.trim();
					if (!name || name.startsWith('type ')) continue;
					if (!(name in loaded[entry]))
						problems.push(file + ': ' + name + ' is not exported from ' + entry);
				}
			}
		}
		expect([...new Set(problems)]).toEqual([]);
	}, 60_000);
});
