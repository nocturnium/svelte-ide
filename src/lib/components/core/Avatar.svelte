<script lang="ts">
	import Icon from './Icon.svelte';
	import { parseColor, readableTextColor, TEXT_ON_LIGHT } from '$lib/utils/color';

	interface Props {
		name: string;
		src?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		/** Background colour: any CSS colour, or a variable such as `var(--ide-collab-cursor-1)`. */
		color?: string;
		isAI?: boolean;
		status?: 'online' | 'offline' | 'busy' | 'error' | 'stalled';
		class?: string;
	}

	let {
		name,
		src,
		size = 'md',
		color,
		isAI = false,
		status: _status,
		class: className = ''
	}: Props = $props();

	const sizeMap = {
		xs: '20px',
		sm: '24px',
		md: '32px',
		lg: '40px',
		xl: '48px'
	};

	const fontSizeMap = {
		xs: '8px',
		sm: '10px',
		md: '12px',
		lg: '14px',
		xl: '16px'
	};

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((part) => part[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	const initials = $derived(getInitials(name));
	// Default AI tint is the conversational "assistant" hue. Collaboration/presence
	// call sites (cursors, locks) pass an explicit `--ide-collab-ai` color instead.
	const bgColor = $derived(color ?? (isAI ? 'var(--ide-ai-assistant)' : 'var(--ide-interactive)'));

	// Initials and glyph use whichever of night / white contrasts more with the background.
	// A CSS variable cannot be read from the string, so once mounted the resolved colour is measured.
	let rootEl: HTMLDivElement | undefined = $state();
	let measuredFg = $state<string | null>(null);
	const fgColor = $derived(measuredFg ?? readableTextColor(bgColor) ?? TEXT_ON_LIGHT);

	$effect(() => {
		void bgColor;
		if (!rootEl) return;
		const resolved = getComputedStyle(rootEl).backgroundColor;
		measuredFg = parseColor(resolved) ? readableTextColor(resolved) : null;
	});

	const aiGlyphSize = $derived(Math.round(parseInt(sizeMap[size], 10) * 0.58));
</script>

<div
	bind:this={rootEl}
	class="ide-avatar {className}"
	class:ide-avatar--ai={isAI}
	style="
		--avatar-size: {sizeMap[size]};
		--avatar-font-size: {fontSizeMap[size]};
		--avatar-color: {bgColor};
		--avatar-fg: {fgColor};
	"
	title={name}
>
	{#if src}
		<img class="ide-avatar__img" {src} alt={name} />
	{:else if isAI}
		<span class="ide-avatar__ai-glyph"><Icon name="sparkles" size={aiGlyphSize} /></span>
	{:else}
		<span class="ide-avatar__initials">{initials}</span>
	{/if}
</div>

<style>
	.ide-avatar {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--avatar-size);
		height: var(--avatar-size);
		border-radius: 50%;
		background: var(--avatar-color);
		color: var(--avatar-fg, white);
		font-family: var(--ide-font-sans);
		font-size: var(--avatar-font-size);
		font-weight: 600;
		flex-shrink: 0;
		overflow: hidden;
	}

	.ide-avatar__img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.ide-avatar__initials {
		line-height: 1;
	}

	.ide-avatar__ai-glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 0;
		color: var(--avatar-fg, white);
	}
</style>
