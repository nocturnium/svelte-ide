/**
 * Inline markdown for already-escaped text: bold, italic and links.
 *
 * Callers must HTML-escape their input first. Links are cut out before
 * emphasis runs, so a * inside a URL can never inject tags into an href
 * attribute, and only http(s), mailto, anchors and same-site paths become
 * links. Anything else (javascript:, data:, protocol-relative //host) is shown
 * as its label text.
 */

/** Return the URL if it is safe to put in an href, otherwise null. */
export function safeUrl(url: string): string | null {
	const trimmed = url.trim();
	// "//host/path" is protocol-relative: it navigates off-site with the page's scheme.
	if (trimmed.startsWith('//')) return null;
	if (/^(\/|#|\.\/|\.\.\/)/.test(trimmed)) return trimmed;
	if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
	return null;
}

function emphasis(html: string): string {
	return html
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/** Apply bold, italic and links to escaped text. rel is set on every link. */
export function formatInlineMarkdown(escaped: string, rel = 'noopener noreferrer'): string {
	const link = /\[([^\]]+)\]\(([^)]+)\)/g;
	let out = '';
	let last = 0;
	for (const match of escaped.matchAll(link)) {
		out += emphasis(escaped.slice(last, match.index));
		const url = safeUrl(match[2]);
		const label = emphasis(match[1]);
		out += url
			? '<a href="' + url + '" target="_blank" rel="' + rel + '">' + label + '</a>'
			: label;
		last = match.index + match[0].length;
	}
	return out + emphasis(escaped.slice(last));
}
