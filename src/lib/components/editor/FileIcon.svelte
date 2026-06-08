<script lang="ts">
	import { getExtension } from '$utils/language';

	interface Props {
		filename: string;
		isDirectory?: boolean;
		expanded?: boolean;
		size?: number;
		class?: string;
	}

	let {
		filename,
		isDirectory = false,
		expanded = false,
		size = 16,
		class: className = ''
	}: Props = $props();

	// Color mapping for file types
	const extensionColors: Record<string, string> = {
		// JavaScript/TypeScript
		js: '#f7df1e',
		mjs: '#f7df1e',
		jsx: '#61dafb',
		ts: '#3178c6',
		tsx: '#3178c6',

		// Web
		html: '#e34c26',
		css: '#1572b6',
		scss: '#cc6699',
		sass: '#cc6699',
		less: '#1d365d',

		// Data
		json: '#cbcb41',
		yaml: '#cb171e',
		yml: '#cb171e',
		xml: '#0060ac',
		toml: '#9c4121',

		// Markdown
		md: '#083fa1',
		mdx: '#1b1f24',

		// Languages
		py: '#3572a5',
		go: '#00add8',
		rs: '#dea584',
		java: '#b07219',
		kt: '#a97bff',
		c: '#555555',
		cpp: '#f34b7d',
		cs: '#178600',
		rb: '#701516',
		php: '#4f5d95',
		swift: '#f05138',

		// Shell
		sh: '#89e051',
		bash: '#89e051',
		zsh: '#89e051',

		// Config
		dockerfile: '#0db7ed',
		gitignore: '#f05032',
		env: '#ecd53f',

		// Svelte/Vue
		svelte: '#ff3e00',
		vue: '#42b883'
	};

	const ext = $derived(getExtension(filename));
	const color = $derived(extensionColors[ext] ?? 'var(--ide-text-muted)');

	// Simple file type icon paths
	const icons = {
		folder: 'M2 6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z',
		folderOpen:
			'M2 6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v1H8a3 3 0 00-3 3v2.5L3.5 18A2 2 0 012 16V6z M6 12a2 2 0 012-2h12l-2 8H8a2 2 0 01-2-2v-4z',
		file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H14a1 1 0 01-1-1V3.5z'
	};

	const iconPath = $derived(
		isDirectory ? (expanded ? icons.folderOpen : icons.folder) : icons.file
	);
	const iconColor = $derived(isDirectory ? 'var(--ide-interactive)' : color);
</script>

<svg
	class="file-icon {className}"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={isDirectory ? iconColor : 'none'}
	stroke={isDirectory ? 'none' : iconColor}
	stroke-width="1.5"
	aria-hidden="true"
>
	<path d={iconPath}></path>
	{#if !isDirectory && ext}
		<!-- Show extension badge for better recognition -->
	{/if}
</svg>

<style>
	.file-icon {
		flex-shrink: 0;
	}
</style>
