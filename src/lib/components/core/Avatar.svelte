<script lang="ts">
	interface Props {
		name: string;
		src?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
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
		status,
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
	const bgColor = $derived(color ?? (isAI ? 'var(--ide-collab-ai)' : 'var(--ide-interactive)'));
</script>

<div
	class="ide-avatar {className}"
	class:ide-avatar--ai={isAI}
	style="
		--avatar-size: {sizeMap[size]};
		--avatar-font-size: {fontSizeMap[size]};
		--avatar-color: {bgColor};
	"
	title={name}
>
	{#if src}
		<img class="ide-avatar__img" {src} alt={name} />
	{:else}
		<span class="ide-avatar__initials">{initials}</span>
	{/if}
	{#if isAI}
		<span class="ide-avatar__ai-badge">AI</span>
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
		color: white;
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

	.ide-avatar__ai-badge {
		position: absolute;
		bottom: -2px;
		right: -2px;
		padding: 1px 3px;
		font-size: 7px;
		font-weight: 700;
		background: var(--ide-collab-ai);
		border-radius: var(--ide-radius-sm);
		border: 1px solid var(--ide-bg-primary);
	}
</style>
