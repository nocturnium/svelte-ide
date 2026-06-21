import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// SSR + prerender are on by default (see src/routes/+layout.ts). adapter-static
		// prerenders every reachable route to its own HTML; the fallback shell
		// (404.html) serves the client-only routes that opt out of prerendering.
		// NOTE: we used to copy 404.html → index.html for the SPA root, but now that
		// the homepage prerenders, that copy would clobber its real SEO HTML — so it's
		// gone, and the prerendered build/index.html is shipped as-is.
		adapter: adapter({ fallback: '404.html' }),
		paths: {
			base: process.env.BASE_PATH || ''
		},
		alias: {
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$types: 'src/lib/types',
			$utils: 'src/lib/utils',
			$plugins: 'src/lib/plugins',
			$crdt: 'src/lib/crdt',
			$themes: 'src/lib/themes'
		}
	}
};

export default config;
