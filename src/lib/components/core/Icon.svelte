<script lang="ts">
	interface Props {
		name: string;
		size?: number | string;
		class?: string;
	}

	let { name, size = 16, class: className = '' }: Props = $props();

	// Icon paths - using simple SVG paths for common icons
	const icons: Record<string, string> = {
		// Files
		file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM13 3.5L18.5 9H14a1 1 0 0 1-1-1V3.5z',
		folder: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z',
		'folder-open':
			'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v2M2 11h20l-2 8H4l-2-8z',
		'file-code':
			'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2',

		// Actions
		close: 'M18 6L6 18M6 6l12 12',
		plus: 'M12 5v14M5 12h14',
		minus: 'M5 12h14',
		check: 'M20 6L9 17l-5-5',
		x: 'M18 6L6 18M6 6l12 12',
		search: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
		settings:
			'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
		refresh:
			'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
		save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
		copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
		trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
		edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',

		// Navigation
		'chevron-right': 'M9 18l6-6-6-6',
		'chevron-down': 'M6 9l6 6 6-6',
		'chevron-up': 'M18 15l-6-6-6 6',
		'chevron-left': 'M15 18l-6-6 6-6',
		'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
		'arrow-right': 'M5 12h14M12 5l7 7-7 7',
		menu: 'M3 12h18M3 6h18M3 18h18',

		// UI
		sidebar: 'M3 3h18v18H3V3zM9 3v18',
		terminal: 'M4 17l6-6-6-6M12 19h8',
		code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
		split: 'M12 3v18M3 3h18v18H3z',
		maximize:
			'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
		minimize:
			'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3',

		// AI
		sparkles: 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z',
		bot: 'M12 8V4H8M12 8a4 4 0 0 0-4 4v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6a4 4 0 0 0-4-4zM9 13h.01M15 13h.01',
		wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M12.2 11.8L11 13M12.2 6.2L11 5M12 12l-9 9',
		message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z',
		'message-circle':
			'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
		send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
		// loader: a continuous spinner ring (3/4 arc with a leading cap) — distinct from `loading`'s 8 discrete spokes
		loader: 'M21 12a9 9 0 1 1-6.219-8.56',

		// Status
		info: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01',
		warning:
			'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
		error:
			'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM15 9l-6 6M9 9l6 6',
		success: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
		loading:
			'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',

		// Users
		user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
		users:
			'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',

		// Git
		'git-branch':
			'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
		'git-commit': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM1.05 12H8M16 12h6.95',
		'git-merge':
			'M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21V9a9 9 0 0 0 9 9M6 21h12',
		'git-compare':
			'M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM13 6h3a2 2 0 0 1 2 2v7M11 18H8a2 2 0 0 1-2-2V9',

		// Misc
		play: 'M5 3l14 9-14 9V3z',
		pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
		stop: 'M6 4h12v16H6z',
		link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
		external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
		clock: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
		zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
		plugin:
			'M12 2v6M12 18v4M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M18 12h4M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24',
		database:
			'M12 8c4.418 0 8-1.343 8-3s-3.582-3-8-3-8 1.343-8 3 3.582 3 8 3zM20 5v6c0 1.657-3.582 3-8 3s-8-1.343-8-3V5M20 11v6c0 1.657-3.582 3-8 3s-8-1.343-8-3v-6'
	};

	const path = $derived(icons[name] ?? icons.file);
	const sizeValue = $derived(typeof size === 'number' ? `${size}px` : size);

	// Dev-time guard: warn when a name misses the map so silent `file`-fallback drift is caught.
	$effect(() => {
		if (import.meta.env.DEV && !(name in icons)) {
			console.warn(`[Icon] no glyph for name "${name}" — falling back to the generic "file" icon`);
		}
	});
</script>

<svg
	class="ide-icon {className}"
	width={sizeValue}
	height={sizeValue}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={path}></path>
</svg>

<style>
	.ide-icon {
		flex-shrink: 0;
		display: inline-block;
		vertical-align: middle;
	}
</style>
