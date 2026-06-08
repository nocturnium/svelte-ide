<script lang="ts">
	/**
	 * Quick Actions Menu
	 *
	 * Shows a lightbulb indicator when code actions are available,
	 * with a dropdown menu to select and execute actions.
	 */

	import { onMount } from 'svelte';
	import type {
		QuickActionsManager,
		CodeAction
	} from './core/quick-actions';
	import {
		groupActionsByKind,
		getKindIcon
	} from './core/quick-actions';

	interface Props {
		/** Quick actions manager instance */
		manager: QuickActionsManager;
		/** Line height for positioning */
		lineHeight: number;
		/** Current cursor line (0-based) */
		cursorLine: number;
		/** Gutter width offset */
		gutterWidth?: number;
		/** Whether to show the lightbulb */
		showLightbulb?: boolean;
		/** Callback when action is executed */
		onExecute?: (action: CodeAction) => void;
	}

	let {
		manager,
		lineHeight,
		cursorLine,
		gutterWidth = 50,
		showLightbulb = true,
		onExecute
	}: Props = $props();

	let isOpen = $state(false);
	let selectedIndex = $state(0);
	let menuRef = $state<HTMLDivElement>(null!);
	let actions = $state<CodeAction[]>([]);
	let groupedActions = $state<Map<string, CodeAction[]>>(new Map());

	// Subscribe to manager updates
	$effect(() => {
		const unsubscribe = manager.subscribe(() => {
			actions = manager.currentActions;
			groupedActions = groupActionsByKind(actions);
			// Reset selection when actions change
			selectedIndex = 0;
		});

		return unsubscribe;
	});

	// Calculate position
	const lightbulbTop = $derived(cursorLine * lineHeight);

	// Flatten grouped actions for keyboard navigation
	const flatActions = $derived(() => {
		const flat: CodeAction[] = [];
		for (const group of groupedActions.values()) {
			flat.push(...group);
		}
		return flat;
	});

	/**
	 * Toggle menu visibility
	 */
	function toggleMenu() {
		isOpen = !isOpen;
		if (isOpen) {
			selectedIndex = 0;
		}
	}

	/**
	 * Close menu
	 */
	function closeMenu() {
		isOpen = false;
	}

	/**
	 * Handle action selection
	 */
	function selectAction(action: CodeAction) {
		if (!action.disabled) {
			onExecute?.(action);
			closeMenu();
		}
	}

	/**
	 * Handle keyboard navigation
	 */
	function handleKeyDown(e: KeyboardEvent) {
		if (!isOpen) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleMenu();
			}
			return;
		}

		const flat = flatActions();

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, flat.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				if (flat[selectedIndex]) {
					selectAction(flat[selectedIndex]);
				}
				break;
			case 'Escape':
				e.preventDefault();
				closeMenu();
				break;
		}
	}

	/**
	 * Handle click outside to close menu
	 */
	function handleOutsideClick(e: MouseEvent) {
		if (menuRef && !menuRef.contains(e.target as Node)) {
			closeMenu();
		}
	}

	onMount(() => {
		document.addEventListener('click', handleOutsideClick);
		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
	});

	/**
	 * Get action index in flattened list
	 */
	function getActionIndex(action: CodeAction): number {
		return flatActions().findIndex((a) => a.id === action.id);
	}
</script>

{#if showLightbulb && actions.length > 0}
	<div
		class="quick-actions"
		style="top: {lightbulbTop}px; left: {gutterWidth - 24}px;"
		bind:this={menuRef}
	>
		<!-- Lightbulb button -->
		<button
			class="lightbulb"
			class:lightbulb--active={isOpen}
			class:lightbulb--has-preferred={actions.some((a) => a.isPreferred)}
			onclick={toggleMenu}
			onkeydown={handleKeyDown}
			title="Show code actions (Ctrl+.)"
			aria-label="Code actions available"
			aria-expanded={isOpen}
			aria-haspopup="menu"
		>
			<span class="lightbulb-icon">💡</span>
			{#if actions.some((a) => a.kind === 'quickfix')}
				<span class="lightbulb-badge">!</span>
			{/if}
		</button>

		<!-- Actions menu -->
		{#if isOpen}
			<div
				class="actions-menu"
				role="menu"
				aria-label="Code actions"
			>
				{#each [...groupedActions.entries()] as [groupLabel, groupActions] (groupLabel)}
					<div class="action-group">
						<div class="group-header">
							<span class="group-icon">{getKindIcon(groupActions[0]?.kind || 'quickfix')}</span>
							<span class="group-label">{groupLabel}</span>
						</div>

						{#each groupActions as action (action.id)}
							{@const actionIndex = getActionIndex(action)}
							<button
								class="action-item"
								class:action-item--selected={selectedIndex === actionIndex}
								class:action-item--disabled={action.disabled}
								class:action-item--preferred={action.isPreferred}
								onclick={() => selectAction(action)}
								onmouseenter={() => (selectedIndex = actionIndex)}
								role="menuitem"
								disabled={action.disabled}
								title={action.disabled ? action.disabledReason : action.description}
							>
								<span class="action-title">{action.title}</span>
								{#if action.shortcut}
									<span class="action-shortcut">{action.shortcut}</span>
								{/if}
								{#if action.isPreferred}
									<span class="action-preferred" title="Preferred action">★</span>
								{/if}
							</button>
						{/each}
					</div>
				{/each}

				<div class="menu-footer">
					<span class="footer-hint">↑↓ Navigate, Enter Select, Esc Close</span>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.quick-actions {
		position: absolute;
		z-index: 100;
	}

	.lightbulb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: var(--ide-bg-secondary, #252536);
		border: 1px solid var(--ide-border, #333);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
		position: relative;
	}

	.lightbulb:hover {
		background: var(--ide-bg-hover, #2a2a3e);
		border-color: #f9e64f;
	}

	.lightbulb--active {
		background: rgba(249, 230, 79, 0.15);
		border-color: #f9e64f;
	}

	.lightbulb--has-preferred {
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% {
			box-shadow: 0 0 0 0 rgba(249, 230, 79, 0.4);
		}
		50% {
			box-shadow: 0 0 0 4px rgba(249, 230, 79, 0);
		}
	}

	.lightbulb-icon {
		font-size: 12px;
		line-height: 1;
	}

	.lightbulb-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 10px;
		height: 10px;
		background: #f44747;
		border-radius: 50%;
		font-size: 8px;
		font-weight: bold;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.actions-menu {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		min-width: 280px;
		max-width: 400px;
		background: var(--ide-bg-elevated, #252536);
		border: 1px solid var(--ide-border, #333);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}

	.action-group {
		border-bottom: 1px solid var(--ide-border, #333);
	}

	.action-group:last-of-type {
		border-bottom: none;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.2);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--ide-text-muted, #666);
	}

	.group-icon {
		font-size: 11px;
	}

	.action-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: none;
		color: var(--ide-text-secondary, #aaa);
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s ease;
		gap: 8px;
	}

	.action-item:hover:not(:disabled),
	.action-item--selected:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.action-item--disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-item--preferred {
		background: rgba(249, 230, 79, 0.08);
	}

	.action-item--preferred:hover:not(:disabled),
	.action-item--preferred.action-item--selected:not(:disabled) {
		background: rgba(249, 230, 79, 0.15);
	}

	.action-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.action-shortcut {
		font-size: 10px;
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		color: var(--ide-text-muted, #666);
		font-family: monospace;
	}

	.action-preferred {
		color: #f9e64f;
		font-size: 10px;
	}

	.menu-footer {
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.2);
		border-top: 1px solid var(--ide-border, #333);
	}

	.footer-hint {
		font-size: 10px;
		color: var(--ide-text-muted, #666);
	}
</style>
