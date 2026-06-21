/**
 * SEO constants + the public-route manifest.
 *
 * The site deploys to the custom domain below (GitHub Pages serves it from the
 * root, so there is no base-path subdirectory). All canonical / Open Graph /
 * sitemap URLs are absolute and built from `SITE_URL`.
 */

export const SITE_URL = 'https://ide.nocturnium.ai';
export const SITE_NAME = 'Nocturnium Svelte IDE';

export const DEFAULT_TITLE = 'Nocturnium Svelte IDE — Zero-dependency code editor for Svelte 5';
export const DEFAULT_DESCRIPTION =
	'A zero-dependency IDE component library for Svelte 5: a fast custom code editor with syntax highlighting, code folding, multi-cursor, an LSP client, CRDT collaboration, and a built-in AI assistant. No CodeMirror, no Monaco.';

/** Branded 1200×630 social share card (committed at static/og.png). */
export const OG_IMAGE = `${SITE_URL}/og.png`;

/** Absolute canonical/OG URL for a route path (no trailing slash; '/' → root). */
export function absoluteUrl(pathname: string): string {
	if (pathname === '/' || pathname === '') return SITE_URL;
	return SITE_URL + pathname.replace(/\/$/, '');
}

/**
 * Routes for the sitemap. ONLY prerendered routes belong here — the editor,
 * playground, and collaboration demos opt out of prerendering (ssr=false in their
 * +page.ts) and are served via the SPA fallback, which returns HTTP 404 to
 * crawlers; listing them would advertise soft-404s. They stay discoverable via
 * the demo hub's links. Keep in sync when adding/changing a prerendered demo page.
 */
export const SITEMAP_ROUTES: { path: string; priority: number; changefreq: string }[] = [
	{ path: '/', priority: 1.0, changefreq: 'weekly' },
	{ path: '/demo', priority: 0.9, changefreq: 'weekly' },
	{ path: '/demo/editor-basic', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/folding', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/components', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/resize', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/stress', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/editor-intelligence', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/semantic-features', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/cognitive-load', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/debugging', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/devx-features', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/ai', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/plugins', priority: 0.7, changefreq: 'monthly' },
	{ path: '/demo/power-features', priority: 0.7, changefreq: 'monthly' }
];
