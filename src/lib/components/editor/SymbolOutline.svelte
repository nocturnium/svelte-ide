<script module lang="ts">
	export type SymbolKind =
		| 'file'
		| 'module'
		| 'namespace'
		| 'class'
		| 'interface'
		| 'type'
		| 'enum'
		| 'function'
		| 'method'
		| 'property'
		| 'variable'
		| 'constant'
		| 'parameter'
		| 'import'
		| 'export';

	export interface DocumentSymbol {
		/** Unique identifier */
		id: string;
		/** Symbol name */
		name: string;
		/** Symbol kind */
		kind: SymbolKind;
		/** Detail text (e.g., type annotation, parameters) */
		detail?: string;
		/** Line number (0-based) */
		line: number;
		/** End line */
		endLine?: number;
		/** Column */
		column?: number;
		/** Children symbols */
		children?: DocumentSymbol[];
		/** Whether symbol is deprecated */
		deprecated?: boolean;
		/** Visibility modifier */
		visibility?: 'public' | 'private' | 'protected';
	}
</script>

<script lang="ts">
	/**
	 * Symbol Outline Panel
	 *
	 * Shows document structure as a navigable tree:
	 * - Classes, interfaces, types
	 * - Functions and methods
	 * - Variables and constants
	 * - Imports and exports
	 */

	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		/** Symbols to display */
		symbols: DocumentSymbol[];
		/** Currently active symbol (at cursor) */
		activeSymbolId?: string | null;
		/** Whether outline is enabled */
		enabled?: boolean;
		/** Filter text */
		filter?: string;
		/** Sort order */
		sortBy?: 'position' | 'name' | 'kind';
		/** Whether to show collapsed by default */
		defaultCollapsed?: boolean;
		/** Callback when symbol is clicked */
		onNavigate?: (symbol: DocumentSymbol) => void;
		/** Panel width */
		width?: number;
	}

	let {
		symbols = [],
		activeSymbolId = null,
		enabled = true,
		filter = '',
		sortBy = 'position',
		defaultCollapsed = false,
		onNavigate,
		width = 250
	}: Props = $props();

	let searchQuery = $state('');
	const collapsedIds = new SvelteSet<string>();
	let hoveredSymbol = $state<DocumentSymbol | null>(null);

	// Symbol icons and colors
	const symbolConfig: Record<SymbolKind, { icon: string; color: string }> = {
		file: { icon: '📄', color: '#e8e8f0' },
		module: { icon: '📦', color: '#4ec9b0' },
		namespace: { icon: '◈', color: '#4ec9b0' },
		class: { icon: '◆', color: '#4ec9b0' },
		interface: { icon: '◇', color: '#4ec9b0' },
		type: { icon: '▣', color: '#4ec9b0' },
		enum: { icon: '▤', color: '#4ec9b0' },
		function: { icon: 'ƒ', color: '#dcdcaa' },
		method: { icon: '⚙', color: '#dcdcaa' },
		property: { icon: '●', color: '#9cdcfe' },
		variable: { icon: '○', color: '#9cdcfe' },
		constant: { icon: '◉', color: '#4fc1ff' },
		parameter: { icon: '◌', color: '#9cdcfe' },
		import: { icon: '↓', color: '#c586c0' },
		export: { icon: '↑', color: '#c586c0' }
	};

	// Filter symbols recursively
	function filterSymbols(symbols: DocumentSymbol[], query: string): DocumentSymbol[] {
		if (!query) return symbols;

		const lowerQuery = query.toLowerCase();
		const result: DocumentSymbol[] = [];

		for (const symbol of symbols) {
			const matches = symbol.name.toLowerCase().includes(lowerQuery);
			const filteredChildren = symbol.children ? filterSymbols(symbol.children, query) : [];

			if (matches || filteredChildren.length > 0) {
				result.push({
					...symbol,
					children: filteredChildren.length > 0 ? filteredChildren : symbol.children
				});
			}
		}

		return result;
	}

	// Sort symbols
	function sortSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
		const sorted = [...symbols];

		switch (sortBy) {
			case 'name':
				sorted.sort((a, b) => a.name.localeCompare(b.name));
				break;
			case 'kind': {
				const kindOrder: SymbolKind[] = [
					'import',
					'export',
					'class',
					'interface',
					'type',
					'enum',
					'function',
					'method',
					'property',
					'variable',
					'constant'
				];
				sorted.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
				break;
			}
			case 'position':
			default:
				sorted.sort((a, b) => a.line - b.line);
		}

		// Recursively sort children
		return sorted.map((s) => ({
			...s,
			children: s.children ? sortSymbols(s.children) : undefined
		}));
	}

	// Computed filtered and sorted symbols
	const effectiveFilter = $derived(filter || searchQuery);
	const filteredSymbols = $derived(filterSymbols(symbols, effectiveFilter));
	const sortedSymbols = $derived(sortSymbols(filteredSymbols));

	// Expand all when filtering
	$effect(() => {
		if (effectiveFilter) {
			collapsedIds.clear();
		}
	});

	/**
	 * Toggle symbol collapse state
	 */
	function toggleCollapse(symbol: DocumentSymbol) {
		if (collapsedIds.has(symbol.id)) {
			collapsedIds.delete(symbol.id);
		} else {
			collapsedIds.add(symbol.id);
		}
	}

	/**
	 * Check if symbol is collapsed
	 */
	function isCollapsed(symbol: DocumentSymbol): boolean {
		if (effectiveFilter) return false;
		if (defaultCollapsed && !collapsedIds.has(`expanded-${symbol.id}`)) {
			return !collapsedIds.has(symbol.id) ? true : false;
		}
		return collapsedIds.has(symbol.id);
	}

	/**
	 * Handle symbol click
	 */
	function handleSymbolClick(symbol: DocumentSymbol, event: MouseEvent) {
		// If clicking on expand chevron, toggle collapse
		if ((event.target as HTMLElement).closest('.symbol-chevron')) {
			toggleCollapse(symbol);
			return;
		}

		onNavigate?.(symbol);
	}

	/**
	 * Expand all symbols
	 */
	function expandAll() {
		collapsedIds.clear();
	}

	/**
	 * Collapse all symbols
	 */
	function collapseAll() {
		collapsedIds.clear();
		function collectIds(syms: DocumentSymbol[]) {
			for (const s of syms) {
				if (s.children && s.children.length > 0) {
					collapsedIds.add(s.id);
					collectIds(s.children);
				}
			}
		}
		collectIds(symbols);
	}

	/**
	 * Get visibility icon
	 */
	function getVisibilityIcon(visibility?: 'public' | 'private' | 'protected'): string {
		switch (visibility) {
			case 'private':
				return '🔒';
			case 'protected':
				return '🔐';
			default:
				return '';
		}
	}

	/**
	 * Count total symbols
	 */
	function countSymbols(symbols: DocumentSymbol[]): number {
		let count = symbols.length;
		for (const s of symbols) {
			if (s.children) {
				count += countSymbols(s.children);
			}
		}
		return count;
	}

	const totalCount = $derived(countSymbols(symbols));
	const filteredCount = $derived(countSymbols(filteredSymbols));
</script>

{#if enabled}
	<div class="symbol-outline" style="width: {width}px;">
		<!-- Header -->
		<div class="outline-header">
			<h3 class="outline-title">Outline</h3>
			<div class="outline-actions">
				<button class="action-btn" onclick={expandAll} title="Expand all">
					⊞
				</button>
				<button class="action-btn" onclick={collapseAll} title="Collapse all">
					⊟
				</button>
			</div>
		</div>

		<!-- Search -->
		<div class="outline-search">
			<input
				type="text"
				class="search-input"
				placeholder="Filter symbols..."
				bind:value={searchQuery}
			/>
			{#if searchQuery}
				<button class="search-clear" onclick={() => (searchQuery = '')}>
					×
				</button>
			{/if}
		</div>

		<!-- Symbol count -->
		<div class="outline-info">
			{#if effectiveFilter}
				{filteredCount} of {totalCount} symbols
			{:else}
				{totalCount} symbols
			{/if}
		</div>

		<!-- Symbol tree -->
		<div class="outline-tree">
			{#if sortedSymbols.length === 0}
				<div class="outline-empty">
					{#if effectiveFilter}
						No symbols matching "{effectiveFilter}"
					{:else}
						No symbols found
					{/if}
				</div>
			{:else}
				{#each sortedSymbols as symbol (symbol.id)}
					{@const config = symbolConfig[symbol.kind]}
					{@const hasChildren = symbol.children && symbol.children.length > 0}
					{@const collapsed = hasChildren && isCollapsed(symbol)}

					<div class="symbol-group">
						<button
							class="symbol-item"
							class:symbol-item--active={activeSymbolId === symbol.id}
							class:symbol-item--deprecated={symbol.deprecated}
							class:symbol-item--has-children={hasChildren}
							onclick={(e) => handleSymbolClick(symbol, e)}
							onmouseenter={() => (hoveredSymbol = symbol)}
							onmouseleave={() => (hoveredSymbol = null)}
							title="{symbol.kind}: {symbol.name}{symbol.detail ? ` - ${symbol.detail}` : ''}"
						>
							{#if hasChildren}
								<span
									class="symbol-chevron"
									class:symbol-chevron--collapsed={collapsed}
								>
									▾
								</span>
							{:else}
								<span class="symbol-spacer"></span>
							{/if}

							<span class="symbol-icon" style="color: {config.color};">
								{config.icon}
							</span>

							{#if symbol.visibility}
								<span class="symbol-visibility">
									{getVisibilityIcon(symbol.visibility)}
								</span>
							{/if}

							<span class="symbol-name" class:deprecated={symbol.deprecated}>
								{symbol.name}
							</span>

							{#if symbol.detail}
								<span class="symbol-detail">{symbol.detail}</span>
							{/if}

							<span class="symbol-line">:{symbol.line + 1}</span>
						</button>

						<!-- Children -->
						{#if hasChildren && !collapsed}
							<div class="symbol-children">
								{#each symbol.children as child (child.id)}
									{@const childConfig = symbolConfig[child.kind]}
									{@const childHasChildren = child.children && child.children.length > 0}
									{@const childCollapsed = childHasChildren && isCollapsed(child)}

									<div class="symbol-group symbol-group--nested">
										<button
											class="symbol-item symbol-item--nested"
											class:symbol-item--active={activeSymbolId === child.id}
											class:symbol-item--deprecated={child.deprecated}
											onclick={(e) => handleSymbolClick(child, e)}
											onmouseenter={() => (hoveredSymbol = child)}
											onmouseleave={() => (hoveredSymbol = null)}
										>
											{#if childHasChildren}
												<span
													class="symbol-chevron"
													class:symbol-chevron--collapsed={childCollapsed}
													onclick={(e) => { e.stopPropagation(); toggleCollapse(child); }}
													onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleCollapse(child); } }}
													role="button"
													tabindex={-1}
												>
													▾
												</span>
											{:else}
												<span class="symbol-spacer"></span>
											{/if}

											<span class="symbol-icon" style="color: {childConfig.color};">
												{childConfig.icon}
											</span>

											{#if child.visibility}
												<span class="symbol-visibility">
													{getVisibilityIcon(child.visibility)}
												</span>
											{/if}

											<span class="symbol-name" class:deprecated={child.deprecated}>
												{child.name}
											</span>

											{#if child.detail}
												<span class="symbol-detail">{child.detail}</span>
											{/if}

											<span class="symbol-line">:{child.line + 1}</span>
										</button>

										<!-- Third level children -->
										{#if childHasChildren && !childCollapsed}
											<div class="symbol-children">
												{#each child.children as grandchild (grandchild.id)}
													{@const gcConfig = symbolConfig[grandchild.kind]}
													<button
														class="symbol-item symbol-item--nested symbol-item--level-2"
														class:symbol-item--active={activeSymbolId === grandchild.id}
														class:symbol-item--deprecated={grandchild.deprecated}
														onclick={() => onNavigate?.(grandchild)}
													>
														<span class="symbol-spacer"></span>
														<span class="symbol-icon" style="color: {gcConfig.color};">
															{gcConfig.icon}
														</span>
														<span class="symbol-name">{grandchild.name}</span>
														<span class="symbol-line">:{grandchild.line + 1}</span>
													</button>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<!-- Hover preview -->
		{#if hoveredSymbol}
			<div class="outline-preview">
				<div class="preview-kind">{hoveredSymbol.kind}</div>
				<div class="preview-name">{hoveredSymbol.name}</div>
				{#if hoveredSymbol.detail}
					<div class="preview-detail">{hoveredSymbol.detail}</div>
				{/if}
				<div class="preview-location">
					Line {hoveredSymbol.line + 1}
					{#if hoveredSymbol.endLine}
						- {hoveredSymbol.endLine + 1}
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.symbol-outline {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--ide-bg-secondary, #1e1e2e);
		border-left: 1px solid var(--ide-border, #333);
		overflow: hidden;
	}

	.outline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid var(--ide-border, #333);
	}

	.outline-title {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--ide-text-primary, #e8e8f0);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.outline-actions {
		display: flex;
		gap: 4px;
	}

	.action-btn {
		width: 22px;
		height: 22px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: var(--ide-text-muted, #666);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.action-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.outline-search {
		position: relative;
		padding: 8px 12px;
		border-bottom: 1px solid var(--ide-border, #333);
	}

	.search-input {
		width: 100%;
		padding: 6px 28px 6px 10px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--ide-border, #333);
		border-radius: 4px;
		color: var(--ide-text-primary, #e8e8f0);
		font-size: 12px;
		outline: none;
	}

	.search-input:focus {
		border-color: var(--ide-interactive, #4f8cc9);
	}

	.search-input::placeholder {
		color: var(--ide-text-muted, #666);
	}

	.search-clear {
		position: absolute;
		right: 18px;
		top: 50%;
		transform: translateY(-50%);
		width: 18px;
		height: 18px;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--ide-text-muted, #666);
		font-size: 14px;
		cursor: pointer;
	}

	.search-clear:hover {
		color: var(--ide-text-primary, #e8e8f0);
	}

	.outline-info {
		padding: 4px 12px;
		font-size: 10px;
		color: var(--ide-text-muted, #666);
		border-bottom: 1px solid var(--ide-border, #333);
	}

	.outline-tree {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}

	.outline-empty {
		padding: 24px 12px;
		text-align: center;
		color: var(--ide-text-muted, #666);
		font-size: 12px;
	}


	.symbol-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 4px 12px;
		background: transparent;
		border: none;
		color: var(--ide-text-secondary, #aaa);
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s ease;
		gap: 4px;
	}

	.symbol-item:hover {
		background: rgba(255, 255, 255, 0.05);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.symbol-item--active {
		background: rgba(168, 85, 247, 0.15);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.symbol-item--nested {
		padding-left: 24px;
	}

	.symbol-item--level-2 {
		padding-left: 44px;
	}

	.symbol-item--deprecated {
		opacity: 0.6;
	}

	.symbol-chevron {
		width: 12px;
		font-size: 10px;
		color: var(--ide-text-muted, #666);
		transition: transform 0.15s ease;
		cursor: pointer;
	}

	.symbol-chevron--collapsed {
		transform: rotate(-90deg);
	}

	.symbol-spacer {
		width: 12px;
	}

	.symbol-icon {
		flex-shrink: 0;
		width: 16px;
		font-family: monospace;
		font-size: 11px;
		font-weight: 600;
		text-align: center;
	}

	.symbol-visibility {
		font-size: 10px;
		margin-right: 2px;
	}

	.symbol-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.symbol-name.deprecated {
		text-decoration: line-through;
	}

	.symbol-detail {
		font-size: 10px;
		color: var(--ide-text-muted, #666);
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 80px;
	}

	.symbol-line {
		font-family: monospace;
		font-size: 10px;
		color: var(--ide-text-muted, #666);
		margin-left: auto;
	}


	/* Hover preview */
	.outline-preview {
		padding: 8px 12px;
		border-top: 1px solid var(--ide-border, #333);
		background: rgba(0, 0, 0, 0.2);
	}

	.preview-kind {
		font-size: 10px;
		text-transform: uppercase;
		color: var(--ide-text-muted, #666);
		margin-bottom: 4px;
	}

	.preview-name {
		font-size: 13px;
		font-weight: 500;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.preview-detail {
		font-size: 11px;
		color: var(--ide-text-secondary, #aaa);
		margin-top: 2px;
	}

	.preview-location {
		font-size: 10px;
		color: var(--ide-text-muted, #666);
		font-family: monospace;
		margin-top: 4px;
	}
</style>
