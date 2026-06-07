/**
 * Remove co-located test/spec artifacts from the packaged `dist/` output.
 *
 * `svelte-package` copies the whole of `src/lib` into `dist/`, including the
 * co-located `*.test.ts` / `*.spec.ts` files (compiled to `.js` + `.d.ts`).
 * Those should not ship in the published tarball, so this script — run as part
 * of `npm run package` after `svelte-package` — strips them. Cross-platform.
 */
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
let removed = 0;

function walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return; // dist/ may not exist yet (e.g. nothing to strip)
	}
	for (const entry of entries) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(p);
		} else if (/\.(test|spec)\./.test(entry.name)) {
			rmSync(p);
			removed++;
		}
	}
}

walk(DIST);
console.log(`strip-dist-tests: removed ${removed} test artifact(s) from ${DIST}/`);
