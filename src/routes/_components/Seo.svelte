<script lang="ts">
	/**
	 * Seo — the single source of per-route head metadata.
	 *
	 * Emits title, description, canonical, Open Graph and Twitter-card tags. The
	 * canonical/OG URL is derived from the current route, so callers only pass the
	 * page-specific title + description. Every page renders exactly one <Seo>, so
	 * there's no duplication with app.html (whose static title/description/OG were
	 * removed in favour of this).
	 */
	import { page } from '$app/stores';
	import { SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION, OG_IMAGE, absoluteUrl } from '$lib/seo';

	interface Props {
		/** Page title WITHOUT the " | Nocturnium Svelte IDE" suffix (omit on the landing page). */
		title?: string;
		description?: string;
		/** Absolute image URL for the social card. */
		image?: string;
		type?: 'website' | 'article';
	}

	let {
		title,
		description = DEFAULT_DESCRIPTION,
		image = OG_IMAGE,
		type = 'website'
	}: Props = $props();

	const fullTitle = $derived(title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE);
	const url = $derived(absoluteUrl($page.url.pathname));
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />

	<meta property="og:type" content={type} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
</svelte:head>
