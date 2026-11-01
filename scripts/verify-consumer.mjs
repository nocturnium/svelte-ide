#!/usr/bin/env node
/**
 * Install the packed tarball into a plain Vite + Svelte project (no SvelteKit)
 * and build it. Catches published code that only works inside SvelteKit
 * (for example a stray $app/* import), missing subpath exports, and a
 * sideEffects setting that drops theme.css.
 *
 * Usage: npm run package && node scripts/verify-consumer.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'svelte-ide-consumer-'));
const run = (cmd, args, cwd = dir) =>
	execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString();

const tarball = run('npm', ['pack', '--silent', '--pack-destination', dir], root)
	.trim()
	.split('\n')
	.pop();

mkdirSync(join(dir, 'src'));
const files = {
	'package.json': JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
	'vite.config.js': [
		"import { defineConfig } from 'vite';",
		"import { svelte } from '@sveltejs/vite-plugin-svelte';",
		'export default defineConfig({ plugins: [svelte()] });'
	].join('\n'),
	'index.html':
		'<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>',
	'src/main.js': [
		"import { mount } from 'svelte';",
		"import '@nocturnium/svelte-ide/theme.css';",
		"import App from './App.svelte';",
		"import { vfsClient, errorHandling, optimistic, ideIntegration, createLSPClient } from '@nocturnium/svelte-ide/services';",
		"import * as stores from '@nocturnium/svelte-ide/stores';",
		'globalThis.__probe = [vfsClient, errorHandling, optimistic, ideIntegration, createLSPClient, stores];',
		"mount(App, { target: document.getElementById('app') });"
	].join('\n'),
	'src/App.svelte': [
		'<script>',
		"\timport { CustomEditor } from '@nocturnium/svelte-ide';",
		"\tlet value = $state('const x = 1;');",
		'</script>',
		'<CustomEditor bind:content={value} language="typescript" />'
	].join('\n')
};
for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body + '\n');

const dev = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies;
run('npm', [
	'install',
	'--no-audit',
	'--no-fund',
	'--silent',
	'vite@' + dev.vite,
	'@sveltejs/vite-plugin-svelte@' + dev['@sveltejs/vite-plugin-svelte'],
	'svelte@' + dev.svelte,
	'./' + tarball
]);
run('npx', ['vite', 'build', '--logLevel', 'error']);

const assets = join(dir, 'dist', 'assets');
const cssText = readdirSync(assets)
	.filter((f) => f.endsWith('.css'))
	.map((f) => readFileSync(join(assets, f), 'utf8'))
	.join('\n');
if (!cssText.includes('--ide-bg-primary')) {
	console.error('theme.css was dropped from the consumer build (check package.json sideEffects).');
	process.exit(1);
}
console.log('Consumer build OK in ' + dir);
