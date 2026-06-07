<script lang="ts">
	interface Props {
		size?: 'xs' | 'sm' | 'md' | 'lg';
		class?: string;
	}

	let { size = 'md', class: className = '' }: Props = $props();

	const sizeMap = {
		xs: '12px',
		sm: '16px',
		md: '24px',
		lg: '32px'
	};
</script>

<div
	class="ide-spinner {className}"
	style="--spinner-size: {sizeMap[size]}"
	role="status"
	aria-label="Loading"
>
	<span class="ide-visually-hidden">Loading...</span>
</div>

<style>
	.ide-spinner {
		width: var(--spinner-size);
		height: var(--spinner-size);
		border: 2px solid var(--ide-border);
		border-top-color: var(--ide-interactive);
		border-radius: 50%;
		animation: ide-spin 0.6s linear infinite;
	}
</style>
