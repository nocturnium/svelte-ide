<script lang="ts">
	/**
	 * AutocompleteWidget - LSP completion suggestions dropdown
	 *
	 * Displays completion items from the language server with:
	 * - Item kind icons
	 * - Labels and details
	 * - Documentation preview
	 * - Keyboard navigation
	 */

	import type { CompletionItem } from '$lib/types/lsp';

	interface Props {
		/** Completion items to display */
		items: CompletionItem[];
		/** Currently selected index */
		selectedIndex?: number;
		/** Position to render the widget */
		position: { x: number; y: number };
		/** Maximum height before scrolling */
		maxHeight?: number;
		/** Called when an item is selected */
		onSelect: (item: CompletionItem) => void;
		/** Called when widget should close */
		onDismiss: () => void;
		/** Called when selection changes */
		onSelectionChange?: (index: number) => void;
		class?: string;
	}

	let {
		items,
		selectedIndex = 0,
		position,
		maxHeight = 300,
		onSelect,
		onDismiss,
		onSelectionChange,
		class: className = ''
	}: Props = $props();

	let listRef: HTMLElement;

	// Scroll selected item into view
	$effect(() => {
		if (listRef && selectedIndex >= 0) {
			const selectedEl = listRef.children[selectedIndex] as HTMLElement;
			if (selectedEl) {
				selectedEl.scrollIntoView({ block: 'nearest' });
			}
		}
	});

	// Icon mapping for completion item kinds
	const kindIcons: Record<number, string> = {
		1: 'abc', // Text
		2: 'symbol-method', // Method
		3: 'symbol-function', // Function
		4: 'symbol-constructor', // Constructor
		5: 'symbol-field', // Field
		6: 'symbol-variable', // Variable
		7: 'symbol-class', // Class
		8: 'symbol-interface', // Interface
		9: 'symbol-module', // Module
		10: 'symbol-property', // Property
		11: 'symbol-unit', // Unit
		12: 'symbol-value', // Value
		13: 'symbol-enum', // Enum
		14: 'symbol-keyword', // Keyword
		15: 'symbol-snippet', // Snippet
		16: 'symbol-color', // Color
		17: 'symbol-file', // File
		18: 'symbol-reference', // Reference
		19: 'folder', // Folder
		20: 'symbol-enum-member', // EnumMember
		21: 'symbol-constant', // Constant
		22: 'symbol-struct', // Struct
		23: 'symbol-event', // Event
		24: 'symbol-operator', // Operator
		25: 'symbol-type-parameter' // TypeParameter
	};

	const kindLabels: Record<number, string> = {
		1: 'Text',
		2: 'Method',
		3: 'Function',
		4: 'Constructor',
		5: 'Field',
		6: 'Variable',
		7: 'Class',
		8: 'Interface',
		9: 'Module',
		10: 'Property',
		11: 'Unit',
		12: 'Value',
		13: 'Enum',
		14: 'Keyword',
		15: 'Snippet',
		16: 'Color',
		17: 'File',
		18: 'Reference',
		19: 'Folder',
		20: 'EnumMember',
		21: 'Constant',
		22: 'Struct',
		23: 'Event',
		24: 'Operator',
		25: 'TypeParameter'
	};

	function getKindIcon(kind?: number): string {
		return kindIcons[kind ?? 1] ?? 'symbol-misc';
	}

	function getKindLabel(kind?: number): string {
		return kindLabels[kind ?? 1] ?? 'Unknown';
	}

	function handleKeyDown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowUp': {
				e.preventDefault();
				const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
				onSelectionChange?.(prevIndex);
				break;
			}
			case 'ArrowDown': {
				e.preventDefault();
				const nextIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
				onSelectionChange?.(nextIndex);
				break;
			}
			case 'Enter':
			case 'Tab':
				e.preventDefault();
				if (items[selectedIndex]) {
					onSelect(items[selectedIndex]);
				}
				break;
			case 'Escape':
				e.preventDefault();
				onDismiss();
				break;
		}
	}

	function handleItemClick(item: CompletionItem, index: number) {
		onSelectionChange?.(index);
		onSelect(item);
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
	class="autocomplete-widget {className}"
	style="left: {position.x}px; top: {position.y}px; max-height: {maxHeight}px;"
	role="listbox"
	aria-label="Completions"
>
	<div class="autocomplete-widget__list" bind:this={listRef}>
		{#each items as item, i (item.label + i)}
			<button
				class="autocomplete-widget__item"
				class:autocomplete-widget__item--selected={i === selectedIndex}
				class:autocomplete-widget__item--deprecated={item.tags?.includes(2)}
				role="option"
				aria-selected={i === selectedIndex}
				onclick={() => handleItemClick(item, i)}
				onmouseenter={() => onSelectionChange?.(i)}
			>
				<span
					class="autocomplete-widget__icon autocomplete-widget__icon--{getKindIcon(item.kind)}"
					title={getKindLabel(item.kind)}
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG is generated from a hardcoded internal lookup map; no user input reaches this -->
					{@html getKindSVG(item.kind)}
				</span>
				<span class="autocomplete-widget__label">
					{item.label}
					{#if item.labelDetails?.detail}
						<span class="autocomplete-widget__label-detail">{item.labelDetails.detail}</span>
					{/if}
				</span>
				{#if item.detail}
					<span class="autocomplete-widget__detail">{item.detail}</span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Documentation preview for selected item -->
	{#if items[selectedIndex]?.documentation}
		<div class="autocomplete-widget__docs">
			{#if typeof items[selectedIndex].documentation === 'string'}
				<pre>{items[selectedIndex].documentation}</pre>
			{:else if items[selectedIndex].documentation?.kind === 'markdown'}
				<div class="autocomplete-widget__docs-markdown">
					{items[selectedIndex].documentation.value}
				</div>
			{:else}
				<pre>{items[selectedIndex].documentation?.value}</pre>
			{/if}
		</div>
	{/if}
</div>

<script module lang="ts">
	// SVG icons for completion item kinds
	function getKindSVG(kind?: number): string {
		const icons: Record<number, string> = {
			2: '<path d="M4 4h4v2H4v4H2V4h2zm10 0h2v6h-4V8h2V4zm-6 8h4v4H8v-4zm8 0h2v4h-4v-2h2v-2z" fill="currentColor"/>',
			3: '<path d="M4 4h8v2H4v8H2V4h2zm6 4h4v8h-2v-6H8V8h2z" fill="currentColor"/>',
			6: '<path d="M4 4h8v4H8V6H6v4H4V4zm0 8h2v4H4v-4zm4 0h8v4H8v-4z" fill="currentColor"/>',
			7: '<path d="M4 4h8v2H4v8H2V4h2zm4 4h6v8H6V8h2zm2 2v4h2v-4h-2z" fill="currentColor"/>',
			8: '<path d="M6 4h8v2H6v8H4V4h2zm6 4h2v8H8v-2h4V8z" fill="currentColor"/>',
			9: '<path d="M2 4h4v2H2v8h8v2H2V4zm6 2h8v10H8V6zm2 2v6h4V8h-4z" fill="currentColor"/>',
			13: '<path d="M4 4h8v2H4v8H2V4h2zm4 4h6v8H6V8h2zm2 2v2h2v-2h-2z" fill="currentColor"/>',
			14: '<path d="M4 6h10v2H4v6H2V6h2zm4 4h6v6H6v-6h2zm2 2v2h2v-2h-2z" fill="currentColor"/>',
			15: '<path d="M4 4v12h12V4H4zm2 2h8v8H6V6z" fill="currentColor"/>',
			21: '<path d="M8 2l6 6-6 6-6-6 6-6zm0 2.83L4.83 8 8 11.17 11.17 8 8 4.83z" fill="currentColor"/>'
		};
		return `<svg viewBox="0 0 16 16" width="16" height="16">${icons[kind ?? 1] ?? '<circle cx="8" cy="8" r="4" fill="currentColor"/>'}</svg>`;
	}
</script>

<style>
	.autocomplete-widget {
		position: fixed;
		z-index: 1000;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		box-shadow: var(--ide-shadow-lg);
		overflow: hidden;
		display: flex;
		min-width: 300px;
		max-width: 500px;
	}

	.autocomplete-widget__list {
		flex: 1;
		overflow-y: auto;
		max-height: inherit;
	}

	.autocomplete-widget__item {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		width: 100%;
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		background: transparent;
		border: none;
		font: inherit;
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-primary);
		text-align: left;
		cursor: pointer;
		transition: background var(--ide-transition-fast);
	}

	.autocomplete-widget__item:hover,
	.autocomplete-widget__item--selected {
		background: var(--ide-bg-hover);
	}

	.autocomplete-widget__item--selected {
		background: var(--ide-interactive);
		color: white;
	}

	.autocomplete-widget__item--deprecated {
		text-decoration: line-through;
		opacity: 0.7;
	}

	.autocomplete-widget__icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		color: var(--ide-text-secondary);
	}

	.autocomplete-widget__item--selected .autocomplete-widget__icon {
		color: inherit;
	}

	.autocomplete-widget__icon :global(svg) {
		width: 100%;
		height: 100%;
	}

	.autocomplete-widget__label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--ide-font-mono);
	}

	.autocomplete-widget__label-detail {
		opacity: 0.7;
		margin-left: var(--ide-spacing-xs);
	}

	.autocomplete-widget__detail {
		flex-shrink: 0;
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.autocomplete-widget__item--selected .autocomplete-widget__detail {
		color: inherit;
		opacity: 0.8;
	}

	.autocomplete-widget__docs {
		width: 300px;
		max-height: inherit;
		overflow-y: auto;
		padding: var(--ide-spacing-sm);
		border-left: 1px solid var(--ide-border);
		background: var(--ide-bg-tertiary);
	}

	.autocomplete-widget__docs pre {
		margin: 0;
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--ide-text-secondary);
	}

	.autocomplete-widget__docs-markdown {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		line-height: 1.5;
	}

	/* Scrollbar styling */
	.autocomplete-widget__list::-webkit-scrollbar,
	.autocomplete-widget__docs::-webkit-scrollbar {
		width: 8px;
	}

	.autocomplete-widget__list::-webkit-scrollbar-track,
	.autocomplete-widget__docs::-webkit-scrollbar-track {
		background: transparent;
	}

	.autocomplete-widget__list::-webkit-scrollbar-thumb,
	.autocomplete-widget__docs::-webkit-scrollbar-thumb {
		background: var(--ide-scrollbar-thumb);
		border-radius: 4px;
	}
</style>
