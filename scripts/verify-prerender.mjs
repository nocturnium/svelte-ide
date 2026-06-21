// Post-build guard for the prerendered static site. Asserts on the REAL deployed
// artifacts in build/ (not a dev/preview server), to catch SEO regressions like
// the homepage being clobbered by the SPA fallback. Run after `npm run build`.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'build');
const errors = [];

const index = await readFile(path.join(build, 'index.html'), 'utf8');
const notFound = await readFile(path.join(build, '404.html'), 'utf8');

// 1. The homepage must be the prerendered page, not the empty SPA fallback.
if (index === notFound) {
	errors.push(
		'build/index.html is identical to build/404.html — the prerendered homepage was clobbered.'
	);
}
if (!/<title>[^<]+<\/title>/.test(index)) {
	errors.push('build/index.html has no <title> — homepage SEO is missing.');
}
if (!index.includes('rel="canonical"')) {
	errors.push('build/index.html has no canonical link.');
}

// 2. Every URL in the sitemap must have a prerendered file (no soft-404s advertised).
const sitemap = await readFile(path.join(build, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const loc of locs) {
	const p = loc.replace(/^https?:\/\/[^/]+/, '');
	const file = p === '' || p === '/' ? 'index.html' : `${p.replace(/\/$/, '')}.html`;
	if (!existsSync(path.join(build, file))) {
		errors.push(`sitemap lists ${loc} but build/${file} does not exist (would soft-404).`);
	}
}

if (errors.length) {
	console.error('✗ prerender verification failed:\n  - ' + errors.join('\n  - '));
	process.exit(1);
}
console.log(
	`✓ prerender verification passed (homepage SEO present; ${locs.length} sitemap URLs all prerendered).`
);
