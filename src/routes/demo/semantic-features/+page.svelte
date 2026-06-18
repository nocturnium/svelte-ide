<script lang="ts">
	/**
	 * Semantic Features Demo
	 *
	 * Demonstrates semantic code understanding features:
	 * - Semantic Fold Zones
	 * - Context Lens
	 * - Live Structure Map
	 */

	import { SvelteMap } from 'svelte/reactivity';
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import StructureMap from '$lib/components/editor/StructureMap.svelte';
	import {
		type ComplexityMetrics,
		type SemanticRegion,
		getSemanticAnalyzer,
		DEFAULT_FOLD_PRESETS,
		type FoldPreset
	} from '$lib/components/editor/core';

	// Sample TypeScript code with various semantic regions
	const sampleCode = `// Import statements
import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { EventEmitter } from 'events';

// Type definitions
interface User {
	id: string;
	name: string;
	email: string;
	role: 'admin' | 'user' | 'guest';
	createdAt: Date;
}

interface ApiResponse<T> {
	success: boolean;
	data: T;
	error?: string;
}

// Constants
const MAX_RETRIES = 3;
const API_TIMEOUT = 5000;
const CACHE_TTL = 60000;

/**
 * UserService - Manages user operations
 * Handles CRUD operations and caching
 */
export class UserService extends EventEmitter {
	private cache: Map<string, User> = new Map();
	private retryCount = 0;

	constructor(private apiUrl: string) {
		super();
		this.initializeCache();
	}

	private async initializeCache(): Promise<void> {
		try {
			const users = await this.fetchAllUsers();
			users.forEach(user => this.cache.set(user.id, user));
			console.log('Cache initialized with', this.cache.size, 'users');
		} catch (error) {
			console.error('Failed to initialize cache:', error);
		}
	}

	/**
	 * Get user by ID
	 */
	async getUser(id: string): Promise<User | null> {
		// Check cache first
		if (this.cache.has(id)) {
			return this.cache.get(id)!;
		}

		try {
			const response = await fetch(\`\${this.apiUrl}/users/\${id}\`);
			if (!response.ok) {
				throw new Error(\`HTTP \${response.status}\`);
			}
			const user = await response.json();
			this.cache.set(id, user);
			return user;
		} catch (error) {
			console.error('Failed to fetch user:', error);
			return null;
		}
	}

	/**
	 * Create a new user
	 */
	async createUser(data: Omit<User, 'id' | 'createdAt'>): Promise<ApiResponse<User>> {
		try {
			const response = await fetch(\`\${this.apiUrl}/users\`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				throw new Error(\`HTTP \${response.status}\`);
			}

			const user = await response.json();
			this.cache.set(user.id, user);
			this.emit('user:created', user);

			return { success: true, data: user };
		} catch (error) {
			console.error('Failed to create user:', error);
			return {
				success: false,
				data: null as unknown as User,
				error: String(error)
			};
		}
	}

	private async fetchAllUsers(): Promise<User[]> {
		const response = await fetch(\`\${this.apiUrl}/users\`);
		return response.json();
	}

	private _privateMethod(): void {
		// Private implementation detail
		console.log('Private method called');
	}
}

// Test suite
describe('UserService', () => {
	let service: UserService;

	beforeEach(() => {
		service = new UserService('http://api.example.com');
	});

	afterEach(() => {
		// Cleanup
	});

	it('should get user by id', async () => {
		const user = await service.getUser('123');
		expect(user).toBeDefined();
	});

	it('should create a new user', async () => {
		const result = await service.createUser({
			name: 'Test User',
			email: 'test@example.com',
			role: 'user'
		});
		expect(result.success).toBe(true);
	});

	it('should handle errors gracefully', async () => {
		const result = await service.getUser('invalid');
		expect(result).toBeNull();
	});
});

// Utility functions
export function formatDate(date: Date): string {
	return date.toISOString().split('T')[0];
}

export const capitalize = (str: string): string =>
	str.charAt(0).toUpperCase() + str.slice(1);
`;

	let content = $state(sampleCode);
	let cursorLine = $state(0);
	let _cursorColumn = $state(0);
	let complexityMetrics = $state<ComplexityMetrics | null>(null);
	let scrollLine = $state(0);

	// Get semantic regions
	const analyzer = getSemanticAnalyzer();
	let semanticRegions = $derived(
		analyzer.analyze(
			content.split('\n').map((text, i) => ({ text, number: i + 1 })),
			'typescript'
		)
	);

	// Group regions by category for display
	let regionsByCategory = $derived.by(() => {
		const groups = new SvelteMap<string, SemanticRegion[]>();
		for (const region of semanticRegions) {
			const existing = groups.get(region.category) || [];
			existing.push(region);
			groups.set(region.category, existing);
		}
		return groups;
	});

	// Active preset
	let activePreset = $state<FoldPreset | null>(null);

	// Editor instance — exposes applyFoldPreset()/unfoldAll() via bind:this so the
	// preset cards drive real folding in the live editor.
	let editor = $state<CustomEditor | null>(null);

	function applyPreset(preset: FoldPreset) {
		activePreset = preset;
		editor?.applyFoldPreset(preset);
	}

	function clearPreset() {
		activePreset = null;
		editor?.unfoldAll();
	}

	// Get category color
	function getCategoryColor(category: string): string {
		const colors: Record<string, string> = {
			imports: '#6b7280',
			exports: '#22c55e',
			types: '#f59e0b',
			function: '#3b82f6',
			class: '#8b5cf6',
			tests: '#06b6d4',
			'error-handling': '#ef4444',
			logging: '#f97316',
			comments: '#64748b',
			private: '#94a3b8',
			constants: '#eab308'
		};
		return colors[category] || '#888';
	}

	// Handle scroll
	function handleScroll(e: Event) {
		const target = e.target as HTMLElement;
		scrollLine = Math.floor(target.scrollTop / 20); // Approximate line height
	}

	// Navigate to line
	function navigateToLine(line: number) {
		cursorLine = line;
		// In real implementation, scroll editor to line
	}

	// Mobile: collapsible Structure Map
	let structureMapOpen = $state(false);

	// Symbol count surfaced on the collapsed mobile accordion toggle so its value
	// is legible before expanding. Mirrors the structural categories StructureMap
	// renders (see StructureMap.svelte structuralCategories) so the badge matches
	// what's inside.
	const STRUCTURE_CATEGORIES = ['function', 'class', 'exports', 'types', 'tests', 'imports'];
	let structureSymbolCount = $derived(
		semanticRegions.filter((r) => STRUCTURE_CATEGORIES.includes(r.category)).length
	);
</script>

<div class="demo-page">
	<header class="page-header">
		<h1>Semantic Features</h1>
		<p>Intelligent code understanding with semantic folding, context lens, and structure map</p>
	</header>

	<!-- Semantic Regions Overview -->
	<section class="component-section">
		<h2>Semantic Analysis</h2>
		<p class="section-desc">
			The semantic analyzer identifies meaningful code regions beyond simple syntax.
		</p>

		<div class="regions-overview">
			{#each [...regionsByCategory.entries()] as [category, regions] (category)}
				<div class="region-group">
					<div class="region-group__header">
						<span class="region-group__color" style="background: {getCategoryColor(category)}"
						></span>
						<span class="region-group__name">{category}</span>
						<span class="region-group__count">{regions.length}</span>
					</div>
					<ul class="region-group__list">
						{#each regions.slice(0, 3) as region (region.startLine)}
							<li>
								<button class="region-item" onclick={() => navigateToLine(region.startLine)}>
									<span class="region-item__label">{region.label || category}</span>
									<span class="region-item__lines"
										>L{region.startLine + 1}-{region.endLine + 1}</span
									>
								</button>
							</li>
						{/each}
						{#if regions.length > 3}
							<li class="region-more">+{regions.length - 3} more</li>
						{/if}
					</ul>
				</div>
			{/each}
		</div>
	</section>

	<!-- Fold Presets -->
	<section class="component-section">
		<h2>Fold Presets</h2>
		<p class="section-desc">
			One-click folding based on semantic understanding. Hide tests, show only exports, focus on
			debugging.
		</p>

		<div class="presets-grid">
			{#each DEFAULT_FOLD_PRESETS as preset (preset.id)}
				<div class="preset-card" class:preset-card--active={activePreset?.id === preset.id}>
					<button
						class="preset-card__apply"
						onclick={() => applyPreset(preset)}
						aria-pressed={activePreset?.id === preset.id}
					>
						<span class="preset-card__icon">{preset.icon}</span>
						<div class="preset-card__content">
							<span class="preset-card__name">{preset.name}</span>
							<span class="preset-card__desc">{preset.description}</span>
						</div>
					</button>
					{#if activePreset?.id === preset.id}
						<button
							class="preset-card__clear"
							aria-label="Clear active preset"
							onclick={() => clearPreset()}
						>
							<span aria-hidden="true">✕</span>
						</button>
					{/if}
				</div>
			{/each}
		</div>

		{#if activePreset}
			<div class="active-preset-info">
				<strong>Active:</strong>
				{activePreset.name} - Showing: {activePreset.show.join(', ')} | Hiding: {activePreset.hide.join(
					', '
				)}
			</div>
		{/if}
	</section>

	<!-- Editor with Structure Map -->
	<section class="component-section">
		<h2>Live Demo</h2>
		<p class="section-desc">
			Editor with Context Lens (hover over functions) and Structure Map (right panel).
		</p>

		<div class="editor-with-map">
			<div class="editor-pane" onscroll={handleScroll}>
				<CustomEditor
					bind:this={editor}
					{content}
					onChange={(value) => (content = value)}
					language="typescript"
					readonly={false}
					folding={true}
					complexityHighlighting={true}
					onCursorChange={(line, col) => {
						cursorLine = line;
						_cursorColumn = col;
					}}
					onComplexityChange={(metrics) => {
						complexityMetrics = metrics;
					}}
				/>
			</div>

			<!-- Desktop: side-by-side structure pane -->
			<div class="structure-pane">
				<StructureMap
					lines={content.split('\n').map((text, i) => ({ text, number: i + 1 }))}
					{scrollLine}
					visibleLines={25}
					totalLines={content.split('\n').length}
					{cursorLine}
					{complexityMetrics}
					language="typescript"
					width={180}
					enabled={true}
					onNodeClick={navigateToLine}
				/>
			</div>
		</div>

		<!-- Mobile: collapsible Structure Map accordion (hidden on desktop) -->
		<div class="structure-accordion">
			<button
				class="structure-accordion__toggle"
				onclick={() => (structureMapOpen = !structureMapOpen)}
				aria-expanded={structureMapOpen}
				aria-controls="structure-map-mobile"
			>
				<svg
					class="structure-accordion__icon"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<rect x="3" y="3" width="7" height="7" />
					<rect x="14" y="3" width="7" height="7" />
					<rect x="3" y="14" width="7" height="7" />
					<rect x="14" y="14" width="7" height="7" />
				</svg>
				Structure Map
				<span class="structure-accordion__badge"
					>{structureSymbolCount} {structureSymbolCount === 1 ? 'symbol' : 'symbols'}</span
				>
				<svg
					class="structure-accordion__chevron"
					class:structure-accordion__chevron--open={structureMapOpen}
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path d="M6 9l6 6 6-6" />
				</svg>
			</button>
			{#if structureMapOpen}
				<div class="structure-accordion__body" id="structure-map-mobile">
					<div class="structure-accordion__scroll">
						<StructureMap
							lines={content.split('\n').map((text, i) => ({ text, number: i + 1 }))}
							{scrollLine}
							visibleLines={25}
							totalLines={content.split('\n').length}
							{cursorLine}
							{complexityMetrics}
							language="typescript"
							width={340}
							enabled={true}
							onNodeClick={navigateToLine}
						/>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Feature Cards -->
	<section class="component-section">
		<h2>Feature Highlights</h2>
		<div class="features-grid">
			<div class="feature-card">
				<div class="feature-icon" style="color: #8b5cf6">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M4 6h16M4 12h10M4 18h16" />
					</svg>
				</div>
				<h3>Semantic Folding</h3>
				<p>Fold by meaning, not syntax. "Hide all tests" or "Show only exports" with one click.</p>
			</div>

			<div class="feature-card">
				<div class="feature-icon" style="color: #3b82f6">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 16v-4M12 8h.01" />
					</svg>
				</div>
				<h3>Context Lens</h3>
				<p>
					Inline type information appears as you navigate. See function signatures without hovering.
				</p>
			</div>

			<div class="feature-card">
				<div class="feature-icon" style="color: #22c55e">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<rect x="3" y="3" width="7" height="7" />
						<rect x="14" y="3" width="7" height="7" />
						<rect x="3" y="14" width="7" height="7" />
						<rect x="14" y="14" width="7" height="7" />
					</svg>
				</div>
				<h3>Structure Map</h3>
				<p>Semantic minimap replacement. See functions, classes, and complexity at a glance.</p>
			</div>

			<div class="feature-card">
				<div class="feature-icon" style="color: #f59e0b">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
						/>
					</svg>
				</div>
				<h3>Fold Presets</h3>
				<p>
					Save and share folding configurations. Perfect for code review, debugging, or
					documentation.
				</p>
			</div>
		</div>
	</section>
</div>

<style>
	.demo-page {
		padding: 2rem 3rem;
		max-width: 1200px;
		overflow-x: hidden;
	}

	.page-header {
		margin-bottom: 2.5rem;
	}

	.page-header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: var(--ide-text-primary);
		margin-bottom: 0.5rem;
	}

	.page-header p {
		color: var(--ide-text-secondary);
	}

	.component-section {
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--ide-border);
	}

	.component-section:last-child {
		border-bottom: none;
	}

	.component-section h2 {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--ide-text-primary);
		margin-bottom: 0.25rem;
	}

	.section-desc {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
	}

	/* Regions Overview */
	.regions-overview {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1rem;
	}

	.region-group {
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		overflow: hidden;
	}

	.region-group__header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid var(--ide-border);
	}

	.region-group__color {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}

	.region-group__name {
		flex: 1;
		font-weight: 600;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		color: var(--ide-text-secondary);
		text-transform: uppercase;
	}

	.region-group__count {
		padding: 2px 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		font-size: 0.75rem;
		color: var(--ide-text-muted);
	}

	.region-group__list {
		list-style: none;
		padding: 8px;
		margin: 0;
	}

	.region-item {
		display: flex;
		justify-content: space-between;
		width: 100%;
		padding: 6px 8px;
		background: none;
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary);
		font-size: 0.75rem;
		cursor: pointer;
		text-align: left;
	}

	.region-item:hover {
		background: rgba(255, 255, 255, 0.05);
		color: var(--ide-text-primary);
	}

	.region-item__lines {
		color: var(--ide-text-muted);
		font-family: var(--ide-font-mono);
	}

	.region-more {
		padding: 4px 8px;
		font-size: 0.75rem;
		color: var(--ide-text-muted);
		font-style: italic;
	}

	/* Fold Presets */
	.presets-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.preset-card {
		position: relative;
		display: flex;
		align-items: stretch;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		transition: all 0.15s ease;
	}

	.preset-card:hover {
		border-color: var(--ide-interactive);
		background: var(--ide-bg-hover);
	}

	.preset-card--active {
		border-color: var(--ide-interactive);
		background: rgba(74, 158, 255, 0.1);
	}

	.preset-card__apply {
		flex: 1;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 16px;
		background: none;
		border: none;
		border-radius: 8px;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.preset-card__icon {
		font-size: 1.5rem;
		line-height: 1;
	}

	.preset-card__content {
		flex: 1;
	}

	.preset-card__name {
		display: block;
		font-weight: 600;
		color: var(--ide-text-primary);
		margin-bottom: 2px;
	}

	.preset-card__desc {
		display: block;
		font-size: 0.75rem;
		color: var(--ide-text-muted);
	}

	/* Keep room for the clear button so the name/description never slide under it. */
	.preset-card--active .preset-card__apply {
		padding-right: 40px;
	}

	.preset-card__clear {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		color: var(--ide-text-muted);
		cursor: pointer;
		font-size: 0.8125rem;
		line-height: 1;
	}

	.preset-card__clear:hover {
		background: rgba(255, 255, 255, 0.2);
		color: var(--ide-text-primary);
	}

	.active-preset-info {
		padding: 12px 16px;
		background: rgba(74, 158, 255, 0.1);
		border: 1px solid rgba(74, 158, 255, 0.3);
		border-radius: 6px;
		font-size: 0.875rem;
		color: var(--ide-text-secondary);
	}

	.active-preset-info strong {
		color: var(--ide-text-primary);
	}

	/* Editor with Map */
	.editor-with-map {
		display: flex;
		height: 500px;
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		overflow: hidden;
	}

	.editor-pane {
		flex: 1;
		min-width: 0;
		overflow: auto;
	}

	.structure-pane {
		flex-shrink: 0;
	}

	/* Mobile Structure Map accordion — hidden on desktop */
	.structure-accordion {
		display: none;
	}

	/* Features Grid */
	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
	}

	.feature-card {
		padding: 1.25rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		transition: border-color 0.15s ease;
	}

	.feature-card:hover {
		border-color: var(--ide-interactive);
	}

	.feature-icon {
		margin-bottom: 0.75rem;
		color: var(--ide-interactive);
	}

	.feature-card h3 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--ide-text-primary);
		margin-bottom: 0.5rem;
	}

	.feature-card p {
		font-size: 0.8125rem;
		color: var(--ide-text-secondary);
		line-height: 1.5;
		margin: 0;
	}

	/* Tablet -> mobile: stack editor; move StructureMap to accordion below */
	@media (max-width: 860px) {
		.editor-with-map {
			flex-direction: column;
			height: auto;
		}

		.editor-pane {
			min-height: 360px;
		}

		/* Hide the side-by-side pane; the accordion below takes over */
		.structure-pane {
			display: none;
		}

		/* Show the accordion */
		.structure-accordion {
			display: block;
			margin-top: 0.75rem;
			border: 1px solid var(--ide-border);
			border-radius: 8px;
			overflow: hidden;
		}

		.structure-accordion__toggle {
			display: flex;
			align-items: center;
			gap: 8px;
			width: 100%;
			padding: 10px 14px;
			background: var(--ide-bg-secondary);
			border: none;
			color: var(--ide-text-primary);
			font-size: 0.875rem;
			font-weight: 600;
			cursor: pointer;
			text-align: left;
			transition: background 0.15s ease;
		}

		.structure-accordion__toggle:hover {
			background: var(--ide-bg-hover);
		}

		.structure-accordion__icon {
			flex-shrink: 0;
			color: var(--ide-interactive);
		}

		.structure-accordion__badge {
			padding: 2px 8px;
			background: rgba(255, 255, 255, 0.1);
			border-radius: 10px;
			font-size: 0.75rem;
			font-weight: 500;
			color: var(--ide-text-muted);
		}

		.structure-accordion__chevron {
			margin-left: auto;
			flex-shrink: 0;
			color: var(--ide-text-muted);
			transition: transform 0.2s ease;
		}

		.structure-accordion__chevron--open {
			transform: rotate(180deg);
		}

		.structure-accordion__body {
			border-top: 1px solid var(--ide-border);
			background: var(--ide-bg-primary, var(--ide-bg-secondary));
		}

		.structure-accordion__scroll {
			overflow-x: auto;
			padding: 8px 0;
		}
	}

	@media (max-width: 768px) {
		.demo-page {
			padding: 1.75rem 1.5rem;
		}
	}

	/* Phones */
	@media (max-width: 640px) {
		.demo-page {
			padding: 1.25rem 1rem;
		}

		.page-header h1 {
			font-size: 1.625rem;
		}

		.component-section {
			margin-bottom: 2.25rem;
			padding-bottom: 1.5rem;
		}

		.component-section h2 {
			font-size: 1.25rem;
		}

		.region-item {
			padding: 8px;
			font-size: 0.7rem;
		}

		.region-group__list {
			padding: 6px;
		}

		.presets-grid {
			grid-template-columns: 1fr;
		}

		.features-grid {
			grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		}
	}

	@media (max-width: 420px) {
		.regions-overview {
			grid-template-columns: 1fr;
		}
	}
</style>
