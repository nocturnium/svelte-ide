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
		// yjs (peer dep) ships CJS that benefits from pre-bundling; lib0 is its
		// transitive dep. (y-codemirror.next is intentionally absent — this
		// library does not use CodeMirror, and listing it produced a noisy
		// "Failed to resolve dependency" error on every dev start.)
		include: ['yjs', 'lib0']
	}
});
