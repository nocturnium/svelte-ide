/**
 * Checks on the packaged dist/ output, run by `npm run package` so that every
 * build that can be published is checked (the matching vitest sweep only runs
 * when dist/ already exists, and in CI it does not when tests run).
 *
 * - No raw control bytes (see src/lib/components/editor/core/source-hygiene.test.ts
 *   for why a raw NUL in shipped code is a defect even when it is harmless at runtime).
 * - No leftover test/spec artifacts or review scratch files.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const problems = [];
let count = 0;

function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name.startsWith('__')) problems.push(path + ': scratch directory in dist');
			walk(path);
			continue;
		}
		if (/\.(test|spec)\./.test(entry.name)) problems.push(path + ': test artifact in dist');
		if (!/\.(js|ts|svelte|css)$/.test(entry.name)) continue;
		count++;
		const bytes = readFileSync(path);
		let line = 1;
		for (const byte of bytes) {
			if (byte === 0x0a) line++;
			else if ((byte < 0x20 && byte !== 0x09 && byte !== 0x0d) || byte === 0x7f) {
				problems.push(
					path + ':' + line + ': raw control byte 0x' + byte.toString(16).padStart(2, '0')
				);
			}
		}
	}
}

walk(DIST);
if (count < 100)
	problems.push('only ' + count + ' files found in dist/; the build looks incomplete');
if (problems.length > 0) {
	console.error('check-dist: ' + problems.length + ' problem(s)\n' + problems.join('\n'));
	process.exit(1);
}
console.log('check-dist: ' + count + ' files clean');
