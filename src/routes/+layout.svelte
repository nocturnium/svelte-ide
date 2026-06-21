<script lang="ts">
	import '@fontsource/inter/400.css';
	import '@fontsource/inter/500.css';
	import '@fontsource/inter/600.css';
	import '@fontsource/inter/700.css';
	import '@fontsource/jetbrains-mono/400.css';
	import '@fontsource/jetbrains-mono/500.css';
	import '@fontsource/jetbrains-mono/600.css';
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION } from '$lib/seo';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	// Site-wide structured data (same on every page) for rich results. The wrapping
	// script tags are assembled from split string fragments so the file never
	// contains a literal opening or closing script tag — Svelte's tokenizer would
	// otherwise treat it as a second script element.
	const jsonLdData = JSON.stringify({
		'@context': 'https://schema.org',
		'@graph': [
			{ '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, description: DEFAULT_DESCRIPTION },
			{
				'@type': 'SoftwareApplication',
				name: SITE_NAME,
				applicationCategory: 'DeveloperApplication',
				operatingSystem: 'Web',
				offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
				description: DEFAULT_DESCRIPTION,
				url: SITE_URL
			}
		]
	});
	const scriptOpen = '<' + 'script type="application/ld+json">';
	const scriptClose = '<' + '/script>';
	const jsonLd = scriptOpen + jsonLdData + scriptClose;
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static, no user input -->
	{@html jsonLd}
</svelte:head>

{@render children()}
