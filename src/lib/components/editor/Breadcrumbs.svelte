<script module lang="ts">
	export interface BreadcrumbSymbol {
		/** Unique identifier */
		id: string;
		/** Display name */
		name: string;
		/** Symbol type */
		type: 'file' | 'module' | 'namespace' | 'class' | 'interface' | 'function' | 'method' | 'property' | 'variable' | 'constant' | 'enum' | 'block';
		/** Line number (0-based) */
		line: number;
		/** Column number */
		column?: number;
		/** Sibling symbols at same level */
		siblings?: BreadcrumbSymbol[];
		/** Detail text (e.g., function signature) */
		detail?: string;
	}
</script>

<script lang="ts">
	/**
	 * Breadcrumbs Navigation
	 *
	 * Shows the current location in code structure hierarchy:
	 * File > Module > Class > Method > Block
	 *
	 * Features:
	 * - Click to navigate to symbol
	 * - Dropdown for sibling symbols
	 * - Icons for different symbol types
	 */

	import { onMount } from 'svelte';

	interface Props {
		/** Current breadcrumb path */
		path: BreadcrumbSymbol[];
		/** File name/path to show as root */
		fileName?: string;
		/** Whether breadcrumbs are enabled */
		enabled?: boolean;
		/** Callback when symbol is clicked */
		onNavigate?: (symbol: BreadcrumbSymbol) => void;
		/** Whether to show file icon */
		showFileIcon?: boolean;
		/** Maximum width before truncation */
		maxWidth?: number;
	}

	let {
		path = [],
		fileName = 'untitled',
		enabled = true,
		onNavigate,
		showFileIcon = true,
		maxWidth
	}: Props = $props();

	let activeDropdown = $state<string | null>(null);
	let dropdownPosition = $state({ top: 0, left: 0 });

	// Symbol type icons
	const typeIcons: Record<BreadcrumbSymbol['type'], string> = {
		file: '📄',
		module: '📦',
		namespace: '◈',
		class: '◆',
		interface: '◇',
		function: 'ƒ',
		method: '⚙',
		property: '●',
		variable: '○',
		constant: '◉',
		enum: '▤',
		block: '▢'
	};

	// Symbol type colors
	const typeColors: Record<BreadcrumbSymbol['type'], string> = {
		file: '#e8e8f0',
		module: '#4ec9b0',
		namespace: '#4ec9b0',
		class: '#4ec9b0',
		interface: '#4ec9b0',
		function: '#dcdcaa',
		method: '#dcdcaa',
		property: '#9cdcfe',
		variable: '#9cdcfe',
		constant: '#4fc1ff',
		enum: '#4ec9b0',
		block: '#c586c0'
	};

	/**
	 * Get file extension for icon
	 */
	function getFileExtension(name: string): string {
		const ext = name.split('.').pop()?.toLowerCase() || '';
		return ext;
	}

	/**
	 * Get file icon based on extension
	 */
	function getFileIcon(name: string): string {
		const ext = getFileExtension(name);
		switch (ext) {
			case 'ts':
			case 'tsx':
				return '🔷';
			case 'js':
			case 'jsx':
				return '🟨';
			case 'svelte':
				return '🔶';
			case 'css':
			case 'scss':
				return '🎨';
			case 'html':
				return '🌐';
			case 'json':
				return '📋';
			case 'md':
				return '📝';
			default:
				return '📄';
		}
	}

	/**
	 * Handle breadcrumb click
	 */
	function handleClick(symbol: BreadcrumbSymbol, event: MouseEvent) {
		if (symbol.siblings && symbol.siblings.length > 0) {
			// Toggle dropdown
			if (activeDropdown === symbol.id) {
				activeDropdown = null;
			} else {
				const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
				dropdownPosition = {
					top: rect.bottom + 2,
					left: rect.left
				};
				activeDropdown = symbol.id;
			}
		} else {
			onNavigate?.(symbol);
		}
	}

	/**
	 * Handle sibling selection from dropdown
	 */
	function handleSiblingSelect(symbol: BreadcrumbSymbol) {
		activeDropdown = null;
		onNavigate?.(symbol);
	}

	/**
	 * Close dropdown when clicking outside
	 */
	function handleOutsideClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.breadcrumb-dropdown') && !target.closest('.breadcrumb-item')) {
			activeDropdown = null;
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
	<nav
		class="breadcrumbs"
		style={maxWidth ? `max-width: ${maxWidth}px;` : ''}
		aria-label="Code navigation breadcrumbs"
	>
		<!-- File root -->
		<button
			class="breadcrumb-item breadcrumb-item--file"
			onclick={() => onNavigate?.({ id: 'file', name: fileName, type: 'file', line: 0 })}
			title={fileName}
		>
			{#if showFileIcon}
				<span class="breadcrumb-icon">{getFileIcon(fileName)}</span>
			{/if}
			<span class="breadcrumb-label">{fileName.split('/').pop()}</span>
		</button>

		<!-- Path segments -->
		{#each path as symbol, index (symbol.id)}
			<span class="breadcrumb-separator">›</span>

			<button
				class="breadcrumb-item"
				class:breadcrumb-item--has-siblings={symbol.siblings && symbol.siblings.length > 0}
				class:breadcrumb-item--active={index === path.length - 1}
				onclick={(e) => handleClick(symbol, e)}
				title="{symbol.type}: {symbol.name}{symbol.detail ? ` - ${symbol.detail}` : ''}"
			>
				<span
					class="breadcrumb-icon breadcrumb-icon--type"
					style="color: {typeColors[symbol.type]};"
				>
					{typeIcons[symbol.type]}
				</span>
				<span class="breadcrumb-label">{symbol.name}</span>
				{#if symbol.siblings && symbol.siblings.length > 0}
					<span class="breadcrumb-chevron" class:breadcrumb-chevron--open={activeDropdown === symbol.id}>
						▾
					</span>
				{/if}
			</button>

			<!-- Dropdown for siblings -->
			{#if activeDropdown === symbol.id && symbol.siblings}
				<div
					class="breadcrumb-dropdown"
					style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px;"
				>
					<div class="dropdown-header">
						{symbol.type}s in scope
					</div>
					<div class="dropdown-list">
						{#each symbol.siblings as sibling (sibling.id)}
							<button
								class="dropdown-item"
								class:dropdown-item--current={sibling.id === symbol.id}
								onclick={() => handleSiblingSelect(sibling)}
							>
								<span
									class="dropdown-icon"
									style="color: {typeColors[sibling.type]};"
								>
									{typeIcons[sibling.type]}
								</span>
								<span class="dropdown-label">{sibling.name}</span>
								{#if sibling.detail}
									<span class="dropdown-detail">{sibling.detail}</span>
								{/if}
								<span class="dropdown-line">:{sibling.line + 1}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/each}

		<!-- Current position indicator -->
		{#if path.length > 0}
			{@const current = path[path.length - 1]}
			<span class="breadcrumb-position">
				Ln {current.line + 1}{current.column !== undefined ? `, Col ${current.column + 1}` : ''}
			</span>
		{/if}
	</nav>
{/if}

<style>
	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 12px;
		background: var(--ide-bg-secondary, #1e1e2e);
		border-bottom: 1px solid var(--ide-border, #333);
		font-size: 12px;
		overflow-x: auto;
		white-space: nowrap;
	}

	.breadcrumbs::-webkit-scrollbar {
		height: 4px;
	}

	.breadcrumbs::-webkit-scrollbar-thumb {
		background: var(--ide-border, #444);
		border-radius: 2px;
	}

	.breadcrumb-item {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 6px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary, #aaa);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.1s ease;
		max-width: 180px;
	}

	.breadcrumb-item:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.breadcrumb-item--active {
		color: var(--ide-text-primary, #e8e8f0);
		font-weight: 500;
	}

	.breadcrumb-item--has-siblings {
		padding-right: 4px;
	}

	.breadcrumb-icon {
		flex-shrink: 0;
		font-size: 11px;
	}

	.breadcrumb-icon--type {
		font-family: monospace;
		font-weight: 600;
	}

	.breadcrumb-label {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.breadcrumb-chevron {
		font-size: 10px;
		opacity: 0.6;
		transition: transform 0.15s ease;
	}

	.breadcrumb-chevron--open {
		transform: rotate(180deg);
	}

	.breadcrumb-separator {
		color: var(--ide-text-muted, #666);
		font-size: 11px;
		margin: 0 2px;
	}

	.breadcrumb-position {
		margin-left: auto;
		padding-left: 12px;
		font-size: 11px;
		color: var(--ide-text-muted, #666);
		font-family: monospace;
	}

	/* Dropdown */
	.breadcrumb-dropdown {
		position: fixed;
		z-index: 1000;
		min-width: 200px;
		max-width: 350px;
		max-height: 300px;
		background: var(--ide-bg-elevated, #252536);
		border: 1px solid var(--ide-border, #333);
		border-radius: 6px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}

	.dropdown-header {
		padding: 6px 10px;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--ide-text-muted, #666);
		background: rgba(0, 0, 0, 0.2);
		border-bottom: 1px solid var(--ide-border, #333);
	}

	.dropdown-list {
		overflow-y: auto;
		max-height: 250px;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		background: transparent;
		border: none;
		color: var(--ide-text-secondary, #aaa);
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s ease;
	}

	.dropdown-item:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.dropdown-item--current {
		background: rgba(168, 85, 247, 0.15);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.dropdown-icon {
		flex-shrink: 0;
		font-family: monospace;
		font-weight: 600;
		font-size: 11px;
	}

	.dropdown-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-detail {
		font-size: 10px;
		color: var(--ide-text-muted, #666);
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100px;
	}

	.dropdown-line {
		font-family: monospace;
		font-size: 10px;
		color: var(--ide-text-muted, #666);
	}
</style>
