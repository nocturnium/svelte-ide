import adapter from '@sveltejs/adapter-static';
import { copyFile } from 'node:fs/promises';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const staticAdapter = adapter({ fallback: '404.html' });

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: {
			name: staticAdapter.name,
			async adapt(builder) {
				await staticAdapter.adapt(builder);
				await copyFile('build/404.html', 'build/index.html');
			}
		},
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
