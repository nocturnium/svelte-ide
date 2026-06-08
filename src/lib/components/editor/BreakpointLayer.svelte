<script module lang="ts">
	function getBreakpointTitle(bp: Breakpoint): string {
		let title = `Breakpoint at line ${bp.line + 1}`;
		if (bp.condition) {
			title += `\nCondition: ${bp.condition}`;
		}
		if (bp.logMessage) {
			title += `\nLog: ${bp.logMessage}`;
		}
		if (bp.hitCondition) {
			title += `\nHit condition: ${bp.hitCondition}`;
		}
		if (bp.hitCount > 0) {
			title += `\nHit count: ${bp.hitCount}`;
		}
		if (bp.state === 'disabled') {
			title += '\n(Disabled)';
		}
		if (bp.errorMessage) {
			title += `\nError: ${bp.errorMessage}`;
		}
		return title;
	}
</script>

<script lang="ts">
	/**
	 * Breakpoint Layer
	 *
	 * Visual layer for displaying and interacting with breakpoints:
	 * - Gutter icons for breakpoints
	 * - Context menu for editing conditions
	 * - Hit count display
	 * - Logpoint indicators
	 */

	import { onMount } from 'svelte';
	import type { BreakpointManager, Breakpoint } from './core/breakpoints';
	import { getBreakpointIcon, getBreakpointColor } from './core/breakpoints';

	interface Props {
		/** Breakpoint manager */
		manager: BreakpointManager;
		/** Current file path */
		filePath: string;
		/** Line height in pixels */
		lineHeight: number;
		/** Gutter width */
		gutterWidth?: number;
		/** Whether enabled */
		enabled?: boolean;
		/** Callback when breakpoint is toggled */
		onToggle?: (line: number) => void;
		/** Callback when breakpoint is edited */
		onEdit?: (breakpoint: Breakpoint) => void;
	}

	let {
		manager,
		filePath,
		lineHeight,
		gutterWidth = 50,
		enabled = true,
		onToggle,
		onEdit: _onEdit
	}: Props = $props();

	let breakpoints = $state<Breakpoint[]>([]);
	let contextMenu = $state<{
		breakpoint: Breakpoint;
		position: { top: number; left: number };
	} | null>(null);
	let editingBreakpoint = $state<Breakpoint | null>(null);
	let conditionInput = $state('');
	let logMessageInput = $state('');
	let hitConditionInput = $state('');
	let editMode = $state<'condition' | 'logpoint' | 'hit'>('condition');

	// Subscribe to manager updates
	$effect(() => {
		const unsubscribe = manager.subscribe(() => {
			breakpoints = manager.getBreakpointsForFile(filePath);
		});

		// Initial load
		breakpoints = manager.getBreakpointsForFile(filePath);

		return unsubscribe;
	});

	/**
	 * Handle gutter click (toggle breakpoint)
	 */
	function handleGutterClick(line: number, event: MouseEvent) {
		// Prevent context menu from opening
		if (event.button !== 0) return;

		const existing = manager.getBreakpointAtLine(filePath, line);
		if (existing) {
			// If holding alt, toggle enabled state
			if (event.altKey) {
				manager.toggleBreakpointEnabled(existing.id);
			} else {
				manager.removeBreakpoint(existing.id);
			}
		} else {
			manager.addBreakpoint(filePath, line);
		}
		onToggle?.(line);
	}

	/**
	 * Handle right-click on breakpoint (show context menu)
	 */
	function handleContextMenu(breakpoint: Breakpoint, event: MouseEvent) {
		event.preventDefault();
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		contextMenu = {
			breakpoint,
			position: {
				top: rect.bottom + 4,
				left: rect.left
			}
		};
	}

	/**
	 * Close context menu
	 */
	function closeContextMenu() {
		contextMenu = null;
	}

	/**
	 * Handle context menu action
	 */
	function handleContextAction(action: string) {
		if (!contextMenu) return;
		const bp = contextMenu.breakpoint;

		switch (action) {
			case 'toggle':
				manager.toggleBreakpointEnabled(bp.id);
				break;
			case 'remove':
				manager.removeBreakpoint(bp.id);
				break;
			case 'condition':
				editMode = 'condition';
				conditionInput = bp.condition || '';
				editingBreakpoint = bp;
				break;
			case 'logpoint':
				editMode = 'logpoint';
				logMessageInput = bp.logMessage || '';
				editingBreakpoint = bp;
				break;
			case 'hitCondition':
				editMode = 'hit';
				hitConditionInput = bp.hitCondition || '';
				editingBreakpoint = bp;
				break;
		}

		closeContextMenu();
	}

	/**
	 * Save edit
	 */
	function saveEdit() {
		if (!editingBreakpoint) return;

		switch (editMode) {
			case 'condition':
				manager.updateBreakpoint(editingBreakpoint.id, {
					condition: conditionInput || undefined,
					type: conditionInput ? 'conditional' : 'line'
				});
				break;
			case 'logpoint':
				manager.updateBreakpoint(editingBreakpoint.id, {
					logMessage: logMessageInput || undefined,
					type: logMessageInput ? 'logpoint' : 'line'
				});
				break;
			case 'hit':
				manager.updateBreakpoint(editingBreakpoint.id, {
					hitCondition: hitConditionInput || undefined
				});
				break;
		}

		cancelEdit();
	}

	/**
	 * Cancel edit
	 */
	function cancelEdit() {
		editingBreakpoint = null;
		conditionInput = '';
		logMessageInput = '';
		hitConditionInput = '';
	}

	/**
	 * Handle keydown in edit input
	 */
	function handleEditKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEdit();
		}
	}

	/**
	 * Handle click outside context menu
	 */
	function handleOutsideClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.breakpoint-context-menu') && !target.closest('.breakpoint-icon')) {
			closeContextMenu();
		}
	}

	onMount(() => {
		document.addEventListener('click', handleOutsideClick);
		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
	});
</script>

{#if enabled}
	<div class="breakpoint-layer">
		<!-- Breakpoint indicators in gutter -->
		<div class="breakpoint-gutter" style="width: {gutterWidth}px;">
			{#each breakpoints as breakpoint (breakpoint.id)}
				{@const icon = getBreakpointIcon(breakpoint)}
				{@const color = getBreakpointColor(breakpoint)}
				<button
					class="breakpoint-icon"
					class:breakpoint-icon--disabled={breakpoint.state === 'disabled'}
					class:breakpoint-icon--invalid={breakpoint.state === 'invalid'}
					class:breakpoint-icon--conditional={breakpoint.type === 'conditional'}
					class:breakpoint-icon--logpoint={breakpoint.type === 'logpoint'}
					style="
						top: {breakpoint.line * lineHeight}px;
						height: {lineHeight}px;
						--bp-color: {color};
					"
					onclick={(e) => handleGutterClick(breakpoint.line, e)}
					oncontextmenu={(e) => handleContextMenu(breakpoint, e)}
					title={getBreakpointTitle(breakpoint)}
				>
					<span class="icon-symbol">{icon}</span>
					{#if breakpoint.hitCount > 0}
						<span class="hit-count">{breakpoint.hitCount}</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Clickable gutter area for adding breakpoints -->
		<div
			class="breakpoint-click-area"
			role="button"
			tabindex={-1}
			style="width: {gutterWidth}px;"
			onclick={(e) => {
				const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
				const y = e.clientY - rect.top;
				const line = Math.floor(y / lineHeight);
				handleGutterClick(line, e);
			}}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					const _rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
					handleGutterClick(0, e as unknown as MouseEvent);
				}
			}}
		></div>
	</div>

	<!-- Context menu -->
	{#if contextMenu}
		<div
			class="breakpoint-context-menu"
			style="top: {contextMenu.position.top}px; left: {contextMenu.position.left}px;"
		>
			<button class="menu-item" onclick={() => handleContextAction('toggle')}>
				{contextMenu.breakpoint.state === 'disabled' ? 'Enable' : 'Disable'} Breakpoint
			</button>
			<button class="menu-item" onclick={() => handleContextAction('remove')}>
				Remove Breakpoint
			</button>
			<div class="menu-divider"></div>
			<button class="menu-item" onclick={() => handleContextAction('condition')}>
				Edit Condition...
			</button>
			<button class="menu-item" onclick={() => handleContextAction('logpoint')}>
				Edit Log Message...
			</button>
			<button class="menu-item" onclick={() => handleContextAction('hitCondition')}>
				Edit Hit Count...
			</button>
		</div>
	{/if}

	<!-- Edit dialog -->
	{#if editingBreakpoint}
		<div
			class="breakpoint-edit-overlay"
			role="presentation"
			onclick={cancelEdit}
			onkeydown={(e) => e.key === 'Escape' && cancelEdit()}
		>
			<div
				class="breakpoint-edit-dialog"
				role="dialog"
				tabindex={-1}
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<div class="dialog-header">
					{#if editMode === 'condition'}
						Edit Condition
					{:else if editMode === 'logpoint'}
						Edit Log Message
					{:else}
						Edit Hit Count
					{/if}
				</div>
				<div class="dialog-content">
					{#if editMode === 'condition'}
						<label class="dialog-label">
							Break when expression is true:
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								class="dialog-input"
								bind:value={conditionInput}
								onkeydown={handleEditKeydown}
								placeholder="e.g., x > 5 && y !== null"
								autofocus
							/>
						</label>
						<p class="dialog-hint">Expression will be evaluated in the current scope.</p>
					{:else if editMode === 'logpoint'}
						<label class="dialog-label">
							Log message (use {'{expression}'} for values):
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								class="dialog-input"
								bind:value={logMessageInput}
								onkeydown={handleEditKeydown}
								placeholder="e.g., Value is {'{x}'}, status: {'{status}'}"
								autofocus
							/>
						</label>
						<p class="dialog-hint">Logpoints log a message without stopping execution.</p>
					{:else}
						<label class="dialog-label">
							Break when hit count:
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								class="dialog-input"
								bind:value={hitConditionInput}
								onkeydown={handleEditKeydown}
								placeholder="e.g., >= 5, == 10, % 3 == 0"
								autofocus
							/>
						</label>
						<p class="dialog-hint">
							Examples: ">= 5" (5th hit onwards), "% 3 == 0" (every 3rd hit)
						</p>
					{/if}
				</div>
				<div class="dialog-actions">
					<button class="dialog-btn dialog-btn--cancel" onclick={cancelEdit}> Cancel </button>
					<button class="dialog-btn dialog-btn--save" onclick={saveEdit}> Save </button>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	.breakpoint-layer {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		pointer-events: none;
		z-index: 4;
	}

	.breakpoint-gutter {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
	}

	.breakpoint-click-area {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		pointer-events: auto;
		cursor: pointer;
		opacity: 0;
	}

	.breakpoint-click-area:hover {
		background: rgba(244, 71, 71, 0.1);
	}

	.breakpoint-icon {
		position: absolute;
		left: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: transparent;
		border: none;
		cursor: pointer;
		pointer-events: auto;
		z-index: 1;
	}

	.icon-symbol {
		font-size: 14px;
		color: var(--bp-color);
		transition: transform 0.15s ease;
	}

	.breakpoint-icon:hover .icon-symbol {
		transform: scale(1.2);
	}

	.breakpoint-icon--disabled .icon-symbol {
		opacity: 0.5;
	}

	.breakpoint-icon--invalid .icon-symbol {
		opacity: 0.3;
	}

	.breakpoint-icon--conditional::after {
		content: '?';
		position: absolute;
		top: 2px;
		right: 2px;
		font-size: 8px;
		font-weight: bold;
		color: #fff;
		background: #f44747;
		border-radius: 50%;
		width: 10px;
		height: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.breakpoint-icon--logpoint .icon-symbol {
		color: #f9e64f;
	}

	.hit-count {
		position: absolute;
		top: -2px;
		right: -4px;
		min-width: 14px;
		height: 14px;
		padding: 0 4px;
		background: #3794ff;
		border-radius: 7px;
		font-size: 9px;
		font-weight: 600;
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Context menu */
	.breakpoint-context-menu {
		position: fixed;
		z-index: 1000;
		min-width: 180px;
		background: var(--ide-bg-elevated, #252536);
		border: 1px solid var(--ide-border, #333);
		border-radius: 6px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		padding: 4px 0;
		overflow: hidden;
	}

	.menu-item {
		display: block;
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: none;
		color: var(--ide-text-secondary, #aaa);
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s ease;
	}

	.menu-item:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.menu-divider {
		height: 1px;
		background: var(--ide-border, #333);
		margin: 4px 0;
	}

	/* Edit dialog */
	.breakpoint-edit-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.breakpoint-edit-dialog {
		width: 400px;
		background: var(--ide-bg-elevated, #252536);
		border: 1px solid var(--ide-border, #333);
		border-radius: 8px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		overflow: hidden;
	}

	.dialog-header {
		padding: 12px 16px;
		background: rgba(0, 0, 0, 0.2);
		border-bottom: 1px solid var(--ide-border, #333);
		font-size: 14px;
		font-weight: 500;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.dialog-content {
		padding: 16px;
	}

	.dialog-label {
		display: block;
		font-size: 12px;
		color: var(--ide-text-secondary, #aaa);
		margin-bottom: 8px;
	}

	.dialog-input {
		width: 100%;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--ide-border, #333);
		border-radius: 4px;
		color: var(--ide-text-primary, #e8e8f0);
		font-family: monospace;
		font-size: 13px;
		margin-top: 6px;
		outline: none;
	}

	.dialog-input:focus {
		border-color: var(--ide-interactive, #4f8cc9);
	}

	.dialog-hint {
		margin: 12px 0 0;
		font-size: 11px;
		color: var(--ide-text-muted, #888);
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 16px;
		background: rgba(0, 0, 0, 0.1);
		border-top: 1px solid var(--ide-border, #333);
	}

	.dialog-btn {
		padding: 8px 16px;
		border: none;
		border-radius: 4px;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.dialog-btn--cancel {
		background: transparent;
		color: var(--ide-text-secondary, #aaa);
	}

	.dialog-btn--cancel:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.dialog-btn--save {
		background: #3794ff;
		color: #fff;
	}

	.dialog-btn--save:hover {
		background: #2a7cd6;
	}
</style>
