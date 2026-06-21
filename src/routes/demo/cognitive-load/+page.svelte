<script lang="ts">
	/**
	 * Cognitive Load & Ghost Pair Demo
	 *
	 * Demonstrates cognitive load and AI presence features:
	 * - Cognitive Load Meter: Real-time code complexity visualization
	 * - Ghost Pair: AI cursor and focus visualization
	 */

	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import CognitiveLoadMeter from '$lib/components/editor/CognitiveLoadMeter.svelte';
	import {
		type ComplexityMetrics,
		type ComplexityRegion,
		type AIAwareness,
		createAIAwareness
	} from '$lib/components/editor/core';

	const liveDemoCode = `<script lang="ts">
  import { CustomEditor } from '@nocturnium/svelte-ide';
  import type { ComplexityMetrics, AIAwareness } from '@nocturnium/svelte-ide';

  let content = $state(sourceCode);
  let metrics = $state<ComplexityMetrics | null>(null);
  let aiAgents = $state<AIAwareness[]>([claudeAgent]);
<${'/'}script>

<CustomEditor
  {content}
  onChange={(value) => (content = value)}
  language="typescript"
  complexityHighlighting={true}
  complexityThreshold={30}
  {aiAgents}
  showAILabels={true}
  showAIFocusRegions={true}
  onComplexityChange={(m) => (metrics = m)}
/>`;

	// Sample code with varying complexity levels
	const complexCode = `// This file demonstrates code complexity analysis

/**
 * Simple function - Low complexity
 */
function add(a: number, b: number): number {
	return a + b;
}

/**
 * Medium complexity - nested conditionals
 */
function processUser(user: User | null, request: RequestContext): string {
	if (!user) {
		return 'No user';
	}

	if (user.role === 'admin') {
		if (user.permissions.includes('write')) {
			return request.channel === 'api' ? 'Admin API write access' : 'Admin with write access';
		} else {
			return 'Admin readonly';
		}
	}

	return 'Regular user';
}

/**
 * High complexity - validation rules with branching
 */
function validateCheckout(cart: Cart, customer: Customer, flags: FeatureFlags): ValidationResult {
	const errors: string[] = [];

	for (const item of cart.items) {
		if (item.quantity <= 0) {
			errors.push('Invalid quantity');
		} else if (item.quantity > item.stock) {
			errors.push('Insufficient stock');
		}

		if (item.requiresApproval && !customer.isVerified) {
			errors.push('Verification required');
		}
	}

	if (flags.strictApprovals && customer.balance < cart.total) {
		errors.push('Payment review required');
	}

	if (cart.coupon?.expired) {
		errors.push('Coupon expired');
	}

	return {
		ok: errors.length === 0,
		errors
	};
}

/**
 * Critical complexity - Multiple nested loops and conditionals
 * This function would benefit from refactoring!
 */
function analyzeDataMatrix(
	data: number[][],
	config: AnalysisConfig,
	filters: Filter[]
): AnalysisResult {
	const results: number[] = [];
	let totalSum = 0;
	let maxValue = -Infinity;
	let minValue = Infinity;

	for (let i = 0; i < data.length; i++) {
		const row = data[i];

		for (let j = 0; j < row.length; j++) {
			const cell = row[j];

			// Apply filters
			let passesFilters = true;
			for (const filter of filters) {
				if (filter.type === 'range') {
					if (cell < filter.min || cell > filter.max) {
						passesFilters = false;
						break;
					}
				} else if (filter.type === 'modulo') {
					if (cell % filter.divisor !== 0) {
						passesFilters = false;
						break;
					}
				} else if (filter.type === 'custom') {
					try {
						if (!filter.fn(cell, i, j)) {
							passesFilters = false;
							break;
						}
					} catch (error) {
						console.error('Filter error:', error);
						passesFilters = false;
					}
				}
			}

			if (passesFilters) {
				results.push(cell);
				totalSum += cell;

				if (cell > maxValue) maxValue = cell;
				if (cell < minValue) minValue = cell;

				// Additional processing based on config
				if (config.normalize && maxValue !== minValue) {
					const normalized = (cell - minValue) / (maxValue - minValue);
					if (config.threshold && normalized > config.threshold) {
						if (config.callback) {
							config.callback(cell, { row: i, col: j });
						}
					}
				}

				if (config.audit) {
					for (const rule of config.audit.rules) {
						if (rule.enabled) {
							if (rule.mode === 'strict') {
								if (cell > rule.limit) {
									if (config.audit.onViolation) {
										config.audit.onViolation(rule, cell, i, j);
									}
								}
							} else if (rule.mode === 'sampled') {
								if ((i + j) % rule.sampleRate === 0 && cell > rule.limit) {
									results.push(rule.limit);
								}
							}
						}
					}
				}
			}
		}
	}

	return {
		values: results,
		sum: totalSum,
		average: results.length > 0 ? totalSum / results.length : 0,
		max: maxValue === -Infinity ? null : maxValue,
		min: minValue === Infinity ? null : minValue,
		count: results.length
	};
}

// Simple utility - Low complexity
const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
`;

	// Track complexity metrics
	let complexityMetrics = $state<ComplexityMetrics | null>(null);
	let content = $state(complexCode);
	let selectedLanguage = $state('typescript');
	let editorRef = $state<CustomEditor | null>(null);
	let extractMessage = $state<{ text: string; ok: boolean } | null>(null);
	let extractMessageTimer: ReturnType<typeof setTimeout> | undefined;

	function extractSelection() {
		const result = editorRef?.extractFunction();
		clearTimeout(extractMessageTimer);
		if (!result) {
			extractMessage = null;
			return;
		}
		extractMessage = {
			text: result.ok ? 'Extracted into a new function' : result.reason,
			ok: result.ok
		};
		extractMessageTimer = setTimeout(() => (extractMessage = null), result.ok ? 2500 : 4000);
	}

	const languageOptions = ['javascript', 'typescript', 'python', 'go'];

	let hottestRegion = $derived.by(() => {
		if (!complexityMetrics || complexityMetrics.regions.length === 0) return null;
		return complexityMetrics.regions.reduce<ComplexityRegion | null>((hottest, region) => {
			if (!hottest || region.score > hottest.score) return region;
			return hottest;
		}, null);
	});

	function handleComplexityChange(metrics: ComplexityMetrics | null) {
		complexityMetrics = metrics;
	}

	function jumpToHottestRegion() {
		if (!hottestRegion) return;
		editorRef?.scrollToLine(hottestRegion.startLine, hottestRegion);
	}

	// Demo AI agents for Ghost Pair visualization
	let showGhostPair = $state(true);
	let aiAgents = $state<AIAwareness[]>([]);

	// Simulated AI agent
	let claudeAgent = $state(
		createAIAwareness('claude-1', 'Claude', {
			attentionType: 'reading',
			cursor: {
				position: { line: 45, column: 8 },
				// Brand AI-assistant purple (--ide-ai-assistant / aurora-purple). The
				// editor paints the cursor in-canvas from this hex, so it can't read the
				// CSS token directly; keep it in sync with --color-nocturnium-aurora-purple.
				color: '#a78bfa',
				visible: true,
				animation: 'thinking'
			},
			focusRegions: [
				{
					startLine: 40,
					endLine: 95,
					intensity: 0.6,
					type: 'reading',
					label: 'Analyzing complexity'
				}
			],
			activity: 'Analyzing high complexity region',
			confidence: 0.8,
			isActive: true
		})
	);

	// Initialize with Claude agent
	$effect(() => {
		if (showGhostPair) {
			aiAgents = [claudeAgent];
		} else {
			aiAgents = [];
		}
	});

	// Animate AI cursor position
	let animationInterval: ReturnType<typeof setInterval> | null = null;
	let cursorLine = $state(45);
	let cursorDirection = $state(1);

	function startAnimation() {
		if (animationInterval) return;

		animationInterval = setInterval(() => {
			cursorLine += cursorDirection;

			if (cursorLine >= 90) cursorDirection = -1;
			if (cursorLine <= 45) cursorDirection = 1;

			claudeAgent = {
				...claudeAgent,
				cursor: claudeAgent.cursor
					? {
							...claudeAgent.cursor,
							position: { line: cursorLine, column: 8 + Math.floor(Math.random() * 20) },
							animation: Math.random() > 0.7 ? 'thinking' : 'moving'
						}
					: null,
				attentionType: Math.random() > 0.8 ? 'thinking' : 'reading',
				lastUpdate: Date.now()
			};

			if (showGhostPair) {
				aiAgents = [claudeAgent];
			}
		}, 500);
	}

	function stopAnimation() {
		if (animationInterval) {
			clearInterval(animationInterval);
			animationInterval = null;
		}
	}

	// Auto-start animation
	$effect(() => {
		if (showGhostPair) {
			startAnimation();
		} else {
			stopAnimation();
		}

		return () => stopAnimation();
	});

	// Different attention states to cycle through
	const attentionStates = ['reading', 'thinking', 'writing', 'reviewing'] as const;
	let currentAttentionIndex = $state(0);

	function cycleAttentionState() {
		currentAttentionIndex = (currentAttentionIndex + 1) % attentionStates.length;
		const newType = attentionStates[currentAttentionIndex];

		claudeAgent = {
			...claudeAgent,
			attentionType: newType,
			activity: getActivityDescription(newType),
			focusRegions: claudeAgent.focusRegions.map((r) => ({ ...r, type: newType }))
		};

		if (showGhostPair) {
			aiAgents = [claudeAgent];
		}
	}

	function getActivityDescription(type: (typeof attentionStates)[number]): string {
		switch (type) {
			case 'reading':
				return 'Analyzing high complexity region';
			case 'thinking':
				return 'Planning refactoring approach';
			case 'writing':
				return 'Implementing improvements';
			case 'reviewing':
				return 'Verifying changes';
		}
	}
</script>

<DemoPage
	eyebrow="Intelligence"
	title="Cognitive Load"
	description="Real-time complexity visualization and AI presence."
	docTitle="Cognitive Load & Ghost Pair"
>
	<!-- Cognitive Load Meter Demo -->
	<section class="component-section">
		<h2>Cognitive Load Meter</h2>
		<p class="section-desc">
			Real-time code complexity analysis with visual highlighting. Complex regions are highlighted
			with color intensity.
		</p>

		<!-- Standalone meter display -->
		<div class="meter-showcase">
			<button
				type="button"
				class="meter-card"
				class:meter-card--interactive={!!hottestRegion}
				onclick={jumpToHottestRegion}
				disabled={!hottestRegion}
				aria-label={hottestRegion
					? `Jump to hottest region ${hottestRegion.name || hottestRegion.type}, score ${hottestRegion.score}`
					: 'No complex region to jump to'}
			>
				<span class="meter-label">Current File Complexity</span>
				<CognitiveLoadMeter metrics={complexityMetrics} showDetails={true} />
				<span class="meter-hotspot">
					{#if hottestRegion}
						hottest: {hottestRegion.name || hottestRegion.type} - {hottestRegion.score}
					{:else}
						hottest: none
					{/if}
				</span>
			</button>

			{#if complexityMetrics}
				<div class="metrics-summary">
					<div class="metric">
						<span
							class="metric-value metric-value--heat"
							style="--metric-color: {complexityMetrics.level === 'critical'
								? 'var(--ide-error)'
								: complexityMetrics.level === 'high'
									? 'var(--ide-warning)'
									: complexityMetrics.level === 'medium'
										? 'var(--ide-info)'
										: 'var(--ide-success)'}">{complexityMetrics.overall}</span
						>
						<span class="metric-label">Overall Score</span>
					</div>
					<div class="metric">
						<span class="metric-value">{complexityMetrics.regions.length}</span>
						<span class="metric-label">Regions Analyzed</span>
					</div>
					<div class="metric">
						<span class="metric-value">{complexityMetrics.hotspots.length}</span>
						<span class="metric-label">Hotspot Lines</span>
					</div>
				</div>
			{/if}
		</div>

		<div class="paste-panel">
			<div class="paste-panel__header">
				<label for="code-language">Language</label>
				<select id="code-language" bind:value={selectedLanguage}>
					{#each languageOptions as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>
			<label class="paste-panel__label" for="visitor-code">Paste your code</label>
			<textarea
				id="visitor-code"
				bind:value={content}
				spellcheck={false}
				placeholder="Paste JavaScript, TypeScript, Python, or Go here"
			></textarea>
		</div>

		<!-- Legend (ranges match the analyzer's complexity levels) -->
		<div class="complexity-legend">
			<div class="legend-item">
				<span class="legend-color" style="background: var(--ide-success)"></span>
				<span>Low (0-49)</span>
			</div>
			<div class="legend-item">
				<span class="legend-color" style="background: var(--ide-info)"></span>
				<span>Medium (50-69)</span>
			</div>
			<div class="legend-item">
				<span class="legend-color" style="background: var(--ide-warning)"></span>
				<span>High (70-84)</span>
			</div>
			<div class="legend-item">
				<span class="legend-color" style="background: var(--ide-error)"></span>
				<span>Critical (85+)</span>
			</div>
		</div>
	</section>

	<!-- Ghost Pair Demo -->
	<section class="component-section">
		<h2>Ghost Pair - AI Presence</h2>
		<p class="section-desc">
			Visualize AI agents working alongside you. A ghost cursor, a focus-region glow, and an
			activity label show where an agent is looking and what it's focused on.
		</p>

		<div class="ghost-pair-controls">
			<label class="toggle-control">
				<input type="checkbox" bind:checked={showGhostPair} />
				<span class="toggle-label">Show AI Cursor</span>
			</label>

			<button class="control-btn" onclick={cycleAttentionState} disabled={!showGhostPair}>
				Cycle Attention State
			</button>

			{#if showGhostPair && claudeAgent}
				<div class="ai-status">
					<span class="ai-dot" style="background: {claudeAgent.color}"></span>
					<span class="ai-name">{claudeAgent.agentName}</span>
					<span class="ai-activity">
						<span class="ai-emoji" aria-hidden="true">
							{claudeAgent.attentionType === 'reading'
								? '\u{1F440}'
								: claudeAgent.attentionType === 'thinking'
									? '\u{1F4AD}'
									: claudeAgent.attentionType === 'writing'
										? '\u{270D}\u{FE0F}'
										: '\u{1F50D}'}
						</span>
						<span class="sr-only">{claudeAgent.attentionType}:</span>
						{claudeAgent.activity}
					</span>
				</div>
			{:else}
				<span class="ai-status-hidden">AI cursor hidden — enable to see Claude's focus</span>
			{/if}
		</div>
	</section>

	<!-- Combined Editor Demo -->
	<section class="component-section">
		<h2>Live Demo</h2>
		<p class="section-desc">
			Edit the code below to see complexity analysis update in real-time. The AI cursor shows where
			Claude is "looking".
		</p>

		<div class="extract-controls">
			<button class="control-btn extract-btn" onclick={extractSelection}
				>⟐ Extract to function</button
			>
			<span class="extract-hint"
				>Select a block of statements inside a function, then extract it.</span
			>
			{#if extractMessage}
				<span
					class="extract-toast"
					class:extract-toast--ok={extractMessage.ok}
					role="status"
					aria-live="polite">{extractMessage.text}</span
				>
			{/if}
		</div>

		<DemoExhibit
			code={liveDemoCode}
			language="svelte"
			filename="CognitiveLoad.svelte"
			padded={false}
		>
			<div class="editor-container">
				<CustomEditor
					bind:this={editorRef}
					{content}
					onChange={(value) => (content = value)}
					language={selectedLanguage}
					readonly={false}
					complexityHighlighting={true}
					complexityThreshold={30}
					{aiAgents}
					showAILabels={true}
					showAIFocusRegions={true}
					onComplexityChange={handleComplexityChange}
				/>
			</div>
		</DemoExhibit>
	</section>

	<!-- Feature Highlights -->
	<section class="component-section">
		<h2>Feature Highlights</h2>
		<div class="features-grid">
			<div class="feature-card" style="--feature-accent: var(--ide-error)">
				<div class="feature-icon">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"
						/>
						<path
							d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"
						/>
					</svg>
				</div>
				<h3>Cognitive Complexity</h3>
				<p>
					Real-time analysis of code complexity based on nesting, branching, and function calls.
				</p>
			</div>

			<div class="feature-card" style="--feature-accent: var(--ide-ai-assistant)">
				<div class="feature-icon">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<circle cx="12" cy="12" r="3" />
						<path d="M12 2v2" />
						<path d="M12 20v2" />
						<path d="M2 12h2" />
						<path d="M20 12h2" />
					</svg>
				</div>
				<h3>AI Focus Tracking</h3>
				<p>See where AI agents are looking with ghost cursors and focus region highlights.</p>
			</div>

			<div class="feature-card" style="--feature-accent: var(--ide-success)">
				<div class="feature-icon">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
						<polyline points="14 2 14 8 20 8" />
						<path d="M12 18v-6" />
						<path d="m9 15 3 3 3-3" />
					</svg>
				</div>
				<h3>Refactoring Suggestions</h3>
				<p>
					Hover the gutter markers on high-complexity regions for a breakdown, with an actionable
					suggestion once a region crosses the medium threshold.
				</p>
			</div>

			<div class="feature-card" style="--feature-accent: var(--ide-warning)">
				<div class="feature-icon">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 2v4" />
						<path d="m6.343 6.343-2.828 2.828" />
						<path d="M2 12h4" />
						<path d="m6.343 17.657-2.828-2.828" />
						<path d="M12 18v4" />
						<path d="m17.657 17.657 2.828-2.828" />
						<path d="M18 12h4" />
						<path d="m17.657 6.343 2.828 2.828" />
					</svg>
				</div>
				<h3>Activity Visualization</h3>
				<p>
					A distinct cursor glyph and focus-glow color for each activity state — reading, thinking,
					writing, and reviewing.
				</p>
			</div>
		</div>
	</section>
</DemoPage>

<style>
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
		font-weight: 600;
		color: var(--ide-text-primary);
		margin-bottom: 0.25rem;
	}

	.section-desc {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
	}

	/* Meter Showcase */
	.meter-showcase {
		display: flex;
		align-items: center;
		gap: 2rem;
		padding: 1.5rem;
		background: var(--ide-bg-secondary);
		border-radius: 12px;
		margin-bottom: 1.5rem;
	}

	.meter-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
		padding: 0;
		background: transparent;
		border: 0;
		color: inherit;
		font: inherit;
		text-align: left;
	}

	.meter-label {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.meter-card--interactive {
		cursor: pointer;
	}

	.meter-card--interactive:hover .meter-hotspot {
		color: var(--ide-text-primary);
	}

	.meter-card:focus-visible {
		outline: 2px solid var(--ide-interactive-focus, var(--ide-info));
		outline-offset: 4px;
		border-radius: 4px;
	}

	.meter-card:disabled {
		cursor: default;
	}

	.meter-hotspot {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
		transition: color 0.15s ease;
	}

	.metrics-summary {
		display: flex;
		gap: 1.5rem;
		padding: 0.875rem 1.25rem;
		background: var(--ide-bg-tertiary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.metric-value {
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.metric-value--heat {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		height: 30px;
		padding: 0 10px;
		border: 1px solid color-mix(in srgb, var(--metric-color) 65%, transparent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--metric-color) 18%, var(--ide-bg-primary));
		box-shadow:
			0 0 18px color-mix(in srgb, var(--metric-color) 32%, transparent),
			inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent);
		color: var(--metric-color);
		font-size: 22px;
		font-weight: 800;
		line-height: 1;
		text-shadow: 0 0 12px color-mix(in srgb, var(--metric-color) 48%, transparent);
		box-sizing: border-box;
	}

	.metric-label {
		font-size: 0.8125rem;
		color: var(--ide-text-muted);
		text-align: center;
	}

	/* Paste Panel */
	.paste-panel {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		margin-bottom: 1.5rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
	}

	.paste-panel__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.paste-panel__header label,
	.paste-panel__label {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.paste-panel select,
	.paste-panel textarea {
		background: var(--ide-bg-primary);
		border: 1px solid var(--ide-border);
		border-radius: 6px;
		color: var(--ide-text-primary);
		font: inherit;
	}

	.paste-panel select {
		padding: 0.45rem 2rem 0.45rem 0.65rem;
		color: var(--ide-text-secondary);
		/* Replace the native OS dropdown chrome with a themed chevron. */
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5' stroke='%23a8c5d9' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.65rem center;
	}

	.paste-panel textarea {
		width: 100%;
		min-height: 150px;
		padding: 0.75rem;
		font-family: var(--ide-font-mono);
		font-size: 0.8125rem;
		line-height: 1.5;
		resize: vertical;
	}

	.paste-panel select:focus-visible,
	.paste-panel textarea:focus-visible {
		outline: 2px solid var(--ide-interactive-focus, var(--ide-info));
		outline-offset: 2px;
	}

	/* Complexity Legend */
	.complexity-legend {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--ide-text-secondary);
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}

	/* Ghost Pair Controls */
	.ghost-pair-controls {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1rem 1.5rem;
		background: var(--ide-bg-secondary);
		border-radius: 8px;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.toggle-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.toggle-control input {
		width: 18px;
		height: 18px;
		accent-color: var(--ide-ai-assistant);
	}

	.toggle-label {
		font-size: 0.875rem;
		color: var(--ide-text-secondary);
	}

	.control-btn {
		padding: 0.5rem 1rem;
		background: var(--ide-bg-tertiary);
		border: 1px solid var(--ide-border);
		border-radius: 6px;
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover:not(:disabled) {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
		border-color: var(--ide-ai-assistant);
	}

	.control-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.control-btn:focus-visible,
	.toggle-control input:focus-visible {
		outline: 2px solid var(--ide-ai-assistant);
		outline-offset: 2px;
	}

	.ai-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: color-mix(in srgb, var(--ide-ai-assistant) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-ai-assistant) 30%, transparent);
		border-radius: 6px;
	}

	/* Communicates the off-state so the freed panel space reads as "hidden",
	   not "broken". */
	.ai-status-hidden {
		font-size: 0.8125rem;
		font-style: italic;
		color: var(--ide-text-muted);
	}

	.ai-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		animation: ai-pulse 2s ease-in-out infinite;
	}

	@keyframes ai-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.ai-name {
		font-weight: 600;
		color: var(--ide-ai-assistant);
		font-size: 0.875rem;
	}

	.ai-activity {
		color: var(--ide-text-secondary);
		font-size: 0.8125rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.extract-controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.extract-hint {
		font-size: 0.8125rem;
		color: var(--ide-text-muted);
	}

	.extract-toast {
		font-size: 0.8125rem;
		padding: 0.25rem 0.6rem;
		border-radius: 6px;
		color: var(--ide-warning);
		background: color-mix(in srgb, var(--ide-warning) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-warning) 35%, transparent);
	}

	.extract-toast--ok {
		color: var(--ide-success);
		background: color-mix(in srgb, var(--ide-success) 14%, transparent);
		border-color: color-mix(in srgb, var(--ide-success) 35%, transparent);
	}

	/* The extract action is a refactor, not an AI control — use the page's
	   interactive accent instead of the shared .control-btn AI-purple. */
	.extract-btn:hover:not(:disabled) {
		border-color: var(--ide-interactive);
	}

	.extract-btn:focus-visible {
		outline-color: var(--ide-interactive-focus);
	}

	/* Editor Container — the definite height the CustomEditor needs to render;
	   DemoExhibit (padded={false}) supplies the surrounding frame. */
	.editor-container {
		height: 500px;
		overflow: hidden;
	}

	/* Features Grid */
	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
	}

	/* Feature cards are descriptive content, not links/buttons — keep the hover
	   subtle (border tint only). The translateY lift + box-shadow read as a press
	   affordance and promise an action these <div>s don't have. */
	.feature-card {
		--feature-accent: var(--ide-interactive);
		padding: 1.25rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		transition: border-color 0.15s ease;
	}

	.feature-card:hover {
		border-color: color-mix(in srgb, var(--feature-accent) 45%, var(--ide-border));
	}

	.feature-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		margin-bottom: 0.75rem;
		border-radius: 10px;
		color: var(--feature-accent);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--feature-accent) 22%, transparent),
			color-mix(in srgb, var(--feature-accent) 8%, transparent)
		);
		border: 1px solid color-mix(in srgb, var(--feature-accent) 30%, transparent);
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

	/* ===== Responsive ===== */
	@media (max-width: 860px) {
		/* Lower min column width so 2+ feature cards sit per row */
		.features-grid {
			grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		}
	}

	@media (max-width: 768px) {
		/* Tidy 2x2 grid at the tablet band instead of 3+1 with a lonely card;
		   grid-auto-rows: 1fr equalizes heights so a wrapped title doesn't desync
		   the row baselines. */
		.features-grid {
			grid-template-columns: repeat(2, 1fr);
			grid-auto-rows: 1fr;
		}

		/* Stack the meter card above its metrics so no data is clipped */
		.meter-showcase {
			flex-direction: column;
			align-items: stretch;
		}

		.metrics-summary {
			justify-content: space-between;
			gap: 1rem;
		}

		.metric {
			flex: 1;
		}
	}

	@media (max-width: 640px) {
		/* Allow controls to wrap and give the checkbox a 48px touch target */
		.ghost-pair-controls {
			gap: 0.875rem 1rem;
		}

		.toggle-control {
			min-height: 48px;
		}

		.control-btn {
			min-height: 48px;
		}

		/* Taller editor on phones since this is the page's primary interactive
		   demo; the content scrolls horizontally so long lines stay reachable
		   instead of being clipped, with a right-edge fade to cue the overflow. */
		.editor-container {
			height: 400px;
		}

		.editor-container :global(.custom-editor__content) {
			-webkit-overflow-scrolling: touch;
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
		}
	}
</style>
