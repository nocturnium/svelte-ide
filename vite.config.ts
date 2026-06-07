import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		exclude: ['tests/**', 'node_modules/**']
	},
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:8080',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, '/v1')
			}
		}
	},
	optimizeDeps: {
		include: ['yjs', 'y-codemirror.next', 'lib0']
	}
});
