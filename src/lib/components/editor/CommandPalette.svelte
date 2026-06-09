<script lang="ts">
	/**
	 * Command Palette
	 *
	 * A searchable command palette (Ctrl+Shift+P) for quick access to editor commands.
	 * Inspired by VS Code's command palette.
	 */

	import { getCommandRegistry, type Command } from './core/commands';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		/** Whether the palette is open */
		open?: boolean;
		/** Callback when palette closes */
		onClose?: () => void;
		/** Placeholder text */
		placeholder?: string;
	}

	let { open = $bindable(false), onClose, placeholder = 'Type a command...' }: Props = $props();

	const registry = getCommandRegistry();

	let query = $state('');
	let selectedIndex = $state(0);
	let inputElement: HTMLInputElement | null = $state(null);

	// Get filtered commands
	let commands = $derived.by(() => {
		const all = registry.getAll();
		if (!query.trim()) {
			// Group by category when no search
			return all.sort((a, b) => {
				if (a.category !== b.category) {
					return a.category.localeCompare(b.category);
				}
				return a.label.localeCompare(b.label);
			});
		}
		return registry.search(query);
	});

	// Group commands by category
	let groupedCommands = $derived.by(() => {
		const groups = new SvelteMap<string, Command[]>();
		for (const cmd of commands) {
			const existing = groups.get(cmd.category) || [];
			existing.push(cmd);
			groups.set(cmd.category, existing);
		}
		return groups;
	});

	// Flat list for keyboard navigation
	let flatCommands = $derived(commands);

	// Reset selection when query changes
	$effect(() => {
		// Track query to reset selection on each change
		void query;
		selectedIndex = 0;
	});

	// Focus input when opened
	$effect(() => {
		if (open && inputElement) {
			query = '';
			selectedIndex = 0;
			// Small delay to ensure DOM is ready
			setTimeout(() => inputElement?.focus(), 10);
		}
	});

	function handleKeyDown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, flatCommands.length - 1);
				scrollToSelected();
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				scrollToSelected();
				break;
			case 'Enter':
				e.preventDefault();
				executeSelected();
				break;
			case 'Escape':
				e.preventDefault();
				close();
				break;
		}
	}

	function scrollToSelected() {
		const selected = document.querySelector('.command-palette__item--selected');
		selected?.scrollIntoView({ block: 'nearest' });
	}

	function executeSelected() {
		const command = flatCommands[selectedIndex];
		if (command) {
			executeCommand(command);
		}
	}

	function executeCommand(command: Command) {
		close();
		// Execute after close to avoid UI glitches
		setTimeout(() => {
			command.execute();
		}, 50);
	}

	function close() {
		open = false;
		onClose?.();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			close();
		}
	}

	function highlightMatch(text: string, search: string): string {
		if (!search.trim()) return escapeHtml(text);

		const regex = new RegExp(`(${escapeRegex(search)})`, 'gi');
		return escapeHtml(text).replace(regex, '<mark>$1</mark>');
	}

	function escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function escapeRegex(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function getCategoryLabel(categoryId: string): string {
		const categories = registry.getCategories();
		const cat = categories.find((c) => c.id === categoryId);
		return cat?.label || categoryId;
	}

	function getCategoryIcon(categoryId: string): string {
		const categories = registry.getCategories();
		const cat = categories.find((c) => c.id === categoryId);
		return cat?.icon || '';
	}

	// Global index tracker for flat list
	function getFlatIndex(category: string, indexInCategory: number): number {
		let idx = 0;
		for (const [cat, cmds] of groupedCommands) {
			if (cat === category) {
				return idx + indexInCategory;
			}
			idx += cmds.length;
		}
		return idx;
	}
</script>

{#if open}
	<div
		class="command-palette__backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeyDown}
		role="dialog"
		tabindex={-1}
		aria-modal="true"
		aria-label="Command palette"
	>
		<div class="command-palette">
			<div class="command-palette__header">
				<span class="command-palette__icon">&#x2318;</span>
				<input
					bind:this={inputElement}
					bind:value={query}
					type="text"
					class="command-palette__input"
					{placeholder}
					autocomplete="off"
					spellcheck="false"
				/>
				<button class="command-palette__close" onclick={close} aria-label="Close">
					&#x2715;
				</button>
			</div>

			<div class="command-palette__content">
				{#if flatCommands.length === 0}
					<div class="command-palette__empty">No commands found</div>
				{:else}
					{#each [...groupedCommands] as [category, categoryCommands], _categoryIdx (category)}
						<div class="command-palette__group">
							<div class="command-palette__group-header">
								<span class="command-palette__group-icon">{getCategoryIcon(category)}</span>
								<span class="command-palette__group-label">{getCategoryLabel(category)}</span>
							</div>
							{#each categoryCommands as command, cmdIdx (command.id)}
								{@const flatIdx = getFlatIndex(category, cmdIdx)}
								<button
									class="command-palette__item"
									class:command-palette__item--selected={flatIdx === selectedIndex}
									onclick={() => executeCommand(command)}
									onmouseenter={() => (selectedIndex = flatIdx)}
								>
									<span class="command-palette__item-icon">{command.icon || ''}</span>
									<span class="command-palette__item-label">
										<!-- eslint-disable-next-line svelte/no-at-html-tags -- content is sanitized via escapeHtml before regex substitution -->
										{@html highlightMatch(command.label, query)}
									</span>
									{#if command.shortcut}
										<span class="command-palette__item-shortcut">{command.shortcut}</span>
									{/if}
								</button>
							{/each}
						</div>
					{/each}
				{/if}
			</div>

			<div class="command-palette__footer">
				<span class="command-palette__hint">
					<kbd>&#x2191;</kbd><kbd>&#x2193;</kbd> Navigate
				</span>
				<span class="command-palette__hint">
					<kbd>&#x21B5;</kbd> Execute
				</span>
				<span class="command-palette__hint">
					<kbd>Esc</kbd> Close
				</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.command-palette__backdrop {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		padding-top: 10vh;
		backdrop-filter: blur(2px);
	}

	.command-palette {
		width: 100%;
		max-width: 600px;
		max-height: 70vh;
		background: var(--ide-bg-secondary, #1a2744);
		border: 1px solid var(--ide-border, #a8c5d9);
		border-radius: 12px;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.command-palette__header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--ide-border, #a8c5d9);
		background: var(--ide-bg-elevated, #1a2744);
	}

	.command-palette__icon {
		font-size: 18px;
		color: var(--ide-text-muted, #a8c5d9);
	}

	.command-palette__input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 16px;
		color: var(--ide-text-primary, #f4f1e0);
		font-family: inherit;
	}

	.command-palette__input::placeholder {
		color: var(--ide-text-muted, #a8c5d9);
	}

	.command-palette__close {
		background: none;
		border: none;
		color: var(--ide-text-muted, #a8c5d9);
		cursor: pointer;
		font-size: 16px;
		padding: 4px 8px;
		border-radius: 4px;
		transition: background 0.15s ease;
	}

	.command-palette__close:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--ide-text-primary, #f4f1e0);
	}

	.command-palette__content {
		flex: 1;
		overflow-y: auto;
		padding: 8px 0;
	}

	.command-palette__empty {
		padding: 24px;
		text-align: center;
		color: var(--ide-text-muted, #a8c5d9);
	}

	.command-palette__group {
		margin-bottom: 8px;
	}

	.command-palette__group-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 16px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ide-text-muted, #a8c5d9);
	}

	.command-palette__group-icon {
		opacity: 0.7;
	}

	.command-palette__item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px 16px;
		background: transparent;
		border: none;
		text-align: left;
		color: var(--ide-text-primary, #f4f1e0);
		cursor: pointer;
		font-size: 14px;
		transition: background 0.1s ease;
	}

	.command-palette__item:hover,
	.command-palette__item--selected {
		background: rgba(255, 255, 255, 0.08);
	}

	.command-palette__item--selected {
		background: var(--ide-interactive, #4a8db7) !important;
		color: #fff;
	}

	.command-palette__item-icon {
		width: 20px;
		text-align: center;
		opacity: 0.7;
	}

	.command-palette__item-label {
		flex: 1;
	}

	.command-palette__item-label :global(mark) {
		background: rgba(255, 200, 0, 0.3);
		color: inherit;
		border-radius: 2px;
	}

	.command-palette__item--selected .command-palette__item-label :global(mark) {
		background: rgba(255, 255, 255, 0.3);
	}

	.command-palette__item-shortcut {
		font-size: 11px;
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		color: var(--ide-text-muted, #a8c5d9);
	}

	.command-palette__item--selected .command-palette__item-shortcut {
		background: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.9);
	}

	.command-palette__footer {
		display: flex;
		justify-content: center;
		gap: 24px;
		padding: 10px 16px;
		border-top: 1px solid var(--ide-border, #a8c5d9);
		background: var(--ide-bg-elevated, #1a2744);
	}

	.command-palette__hint {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--ide-text-muted, #a8c5d9);
	}

	.command-palette__hint kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		font-family: inherit;
		font-size: 10px;
	}
</style>
