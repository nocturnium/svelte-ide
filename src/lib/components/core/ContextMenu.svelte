<script lang="ts">
	import Icon from './Icon.svelte';
	import Kbd from './Kbd.svelte';

	export interface ContextMenuItem {
		id: string;
		label: string;
		icon?: string;
		shortcut?: string[];
		disabled?: boolean;
		danger?: boolean;
		separator?: boolean;
	}

	interface Props {
		items: ContextMenuItem[];
		x: number;
		y: number;
		onSelect: (item: ContextMenuItem) => void;
		onClose: () => void;
	}

	let { items, x, y, onSelect, onClose }: Props = $props();

	let menuRef: HTMLDivElement;

	// Adjust position to stay in viewport
	let adjustedX = $state(0);
	let adjustedY = $state(0);

	$effect(() => {
		// Initialize with prop values and adjust based on viewport
		if (menuRef) {
			const rect = menuRef.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			if (x + rect.width > viewportWidth) {
				adjustedX = viewportWidth - rect.width - 8;
			} else {
				adjustedX = x;
			}

			if (y + rect.height > viewportHeight) {
				adjustedY = viewportHeight - rect.height - 8;
			} else {
				adjustedY = y;
			}
		} else {
			// Before menu is mounted, use initial prop values
			adjustedX = x;
			adjustedY = y;
		}
	});

	function handleClick(item: ContextMenuItem) {
		if (item.disabled || item.separator) return;
		onSelect(item);
		onClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="ide-context-menu-backdrop" onclick={handleBackdropClick} role="presentation">
	<div
		bind:this={menuRef}
		class="ide-context-menu"
		style="left: {adjustedX}px; top: {adjustedY}px"
		role="menu"
	>
		{#each items as item (item.id)}
			{#if item.separator}
				<div class="ide-context-menu__separator"></div>
			{:else}
				<button
					class="ide-context-menu__item"
					class:ide-context-menu__item--disabled={item.disabled}
					class:ide-context-menu__item--danger={item.danger}
					disabled={item.disabled}
					role="menuitem"
					onclick={() => handleClick(item)}
				>
					{#if item.icon}
						<Icon name={item.icon} size={14} />
					{:else}
						<span class="ide-context-menu__icon-placeholder"></span>
					{/if}
					<span class="ide-context-menu__label">{item.label}</span>
					{#if item.shortcut}
						<Kbd keys={item.shortcut} />
					{/if}
				</button>
			{/if}
		{/each}
	</div>
</div>

<style>
	.ide-context-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--ide-z-dropdown);
	}

	.ide-context-menu {
		position: fixed;
		min-width: 180px;
		padding: var(--ide-spacing-xs);
		background: var(--ide-bg-elevated);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-lg);
		box-shadow: var(--ide-shadow-lg);
		animation: ide-fade-in var(--ide-transition-fast);
	}

	.ide-context-menu__item {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		width: 100%;
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-primary);
		background: transparent;
		border: none;
		border-radius: var(--ide-radius-sm);
		cursor: pointer;
		text-align: left;
		transition: background var(--ide-transition-fast);
	}

	.ide-context-menu__item:hover:not(:disabled) {
		background: var(--ide-bg-hover);
	}

	.ide-context-menu__item--disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ide-context-menu__item--danger {
		color: var(--ide-error);
	}

	.ide-context-menu__item--danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--ide-error) 15%, transparent);
	}

	.ide-context-menu__icon-placeholder {
		width: 14px;
	}

	.ide-context-menu__label {
		flex: 1;
	}

	.ide-context-menu__separator {
		height: 1px;
		margin: var(--ide-spacing-xs) 0;
		background: var(--ide-border);
	}
</style>
