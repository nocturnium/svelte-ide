<script lang="ts">
	import { formatKeybinding } from '$utils/keybindings';

	interface Props {
		keys: string[];
		class?: string;
	}

	let { keys, class: className = '' }: Props = $props();

	const formatted = $derived(formatKeybinding(keys));
</script>

<kbd class="ide-kbd {className}">{formatted}</kbd>

<style>
	.ide-kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px 6px;
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-xs);
		font-weight: 500;
		color: var(--ide-text-secondary);
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-sm);
		box-shadow:
			0 1px 0 var(--ide-border),
			inset 0 -1px 0 color-mix(in srgb, var(--ide-border) 50%, transparent);
		white-space: nowrap;
	}
</style>
