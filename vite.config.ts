import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
// `defineConfig` from vitest/config (not 'vite') so the inline `test` block is typed.
import { defineConfig } from 'vitest/config';

// Single source of truth for the displayed app version: read package.json at
// config-load time and inject it as a compile-time constant. The demo UI renders
// `__APP_VERSION__` (declared in src/app.d.ts) so the site version can never drift
// from the published package version — semantic-release bumps package.json and the
// next Pages build picks the new version up automatically.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	plugins: [tailwindcss(), sveltekit()],
	test: {
		// Polyfill browser event globals (CloseEvent) absent on Node < 23 (incl. CI).
		setupFiles: ['./vitest.setup.ts'],
		// Exclude e2e specs and build output. The .svelte-kit/__package__ dir holds
		// transformed copies of the *.test.* files emitted by `svelte-package`; without
		// excluding it, `vitest run` would also execute those stale duplicates.
		exclude: ['tests/**', 'node_modules/**', '.svelte-kit/**', 'dist/**', 'build/**']
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
