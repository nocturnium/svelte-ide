import { SITE_URL, SITEMAP_ROUTES } from '$lib/seo';

// Prerendered to a static sitemap.xml at build time (no runtime server on the
// static host). All URLs are absolute against the custom domain.
export const prerender = true;

export function GET() {
	const urls = SITEMAP_ROUTES.map((r) => {
		const loc = r.path === '/' ? SITE_URL : `${SITE_URL}${r.path}`;
		return `  <url>
    <loc>${loc}</loc>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority.toFixed(1)}</priority>
  </url>`;
	}).join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml' }
	});
}
