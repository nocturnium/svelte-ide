<script lang="ts">
	/**
	 * Cognitive Load & Ghost Pair Demo
	 *
	 * Demonstrates the Phase 1 killer features:
	 * - Cognitive Load Meter: Real-time code complexity visualization
	 * - Ghost Pair: AI cursor and focus visualization
	 */

	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import CognitiveLoadMeter from '$lib/components/editor/CognitiveLoadMeter.svelte';
	import {
		type ComplexityMetrics,
		type AIAwareness,
		createAIAwareness
	} from '$lib/components/editor/core';

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
function processUser(user: User | null): string {
	if (!user) {
		return 'No user';
	}

	if (user.role === 'admin') {
		if (user.permissions.includes('write')) {
			return 'Admin with write access';
		} else {
			return 'Admin readonly';
		}
	}

	return 'Regular user';
}

/**
 * HIGH COMPLEXITY - Multiple nested loops and conditionals
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

	function handleComplexityChange(metrics: ComplexityMetrics | null) {
		complexityMetrics = metrics;
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
				color: '#8B5CF6',
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

<div class="demo-page">
	<header class="page-header">
		<h1>Cognitive Load & Ghost Pair</h1>
		<p>Phase 1 killer features: real-time complexity visualization and AI presence</p>
	</header>

	<!-- Cognitive Load Meter Demo -->
	<section class="component-section">
		<h2>Cognitive Load Meter</h2>
		<p class="section-desc">
			Real-time code complexity analysis with visual highlighting. Complex regions are highlighted
			with color intensity.
		</p>

		<!-- Standalone meter display -->
		<div class="meter-showcase">
			<div class="meter-card">
				<span class="meter-label">Current File Complexity</span>
				<CognitiveLoadMeter metrics={complexityMetrics} showDetails={true} />
			</div>

			{#if complexityMetrics}
				<div class="metrics-summary">
					<div class="metric">
						<span
							class="metric-value"
							style="color: {complexityMetrics.level === 'critical'
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
			Visualize AI agents working alongside you. See where they're looking, what they're thinking,
			and what they're changing.
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

		<div class="editor-container">
			<CustomEditor
				{content}
				onChange={(value) => (content = value)}
				language="typescript"
				readonly={false}
				complexityHighlighting={true}
				complexityThreshold={50}
				{aiAgents}
				showAILabels={true}
				showAIFocusRegions={true}
				onComplexityChange={handleComplexityChange}
			/>
		</div>
	</section>

	<!-- Feature Highlights -->
	<section class="component-section">
		<h2>Feature Highlights</h2>
		<div class="features-grid">
			<div class="feature-card" style="--feature-accent: var(--color-error, #ef4444)">
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

			<div class="feature-card" style="--feature-accent: #8b5cf6">
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

			<div class="feature-card" style="--feature-accent: var(--color-success, #22c55e)">
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
				<p>Hover over complex regions to see actionable suggestions for improvement.</p>
			</div>

			<div class="feature-card" style="--feature-accent: var(--color-warning, #f59e0b)">
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
				<p>Distinct visual states for reading, thinking, writing, and reviewing activities.</p>
			</div>
		</div>
	</section>
</div>

<style>
	.demo-page {
		padding: 2rem 3rem;
		max-width: 1000px;
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
	}

	.meter-label {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
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

	.metric-label {
		font-size: 0.8125rem;
		color: var(--ide-text-muted);
		text-align: center;
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
		accent-color: #8b5cf6;
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
		border-color: #8b5cf6;
	}

	.control-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.control-btn:focus-visible,
	.toggle-control input:focus-visible {
		outline: 2px solid #8b5cf6;
		outline-offset: 2px;
	}

	.ai-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: rgba(139, 92, 246, 0.1);
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 6px;
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
		color: #8b5cf6;
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

	/* Editor Container */
	.editor-container {
		height: 500px;
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		overflow: hidden;
	}

	/* Features Grid */
	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
	}

	.feature-card {
		--feature-accent: var(--ide-interactive);
		padding: 1.25rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		transition:
			transform 0.15s ease,
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.feature-card:hover {
		transform: translateY(-2px);
		border-color: color-mix(in srgb, var(--feature-accent) 45%, var(--ide-border));
		box-shadow:
			0 6px 18px rgba(0, 0, 0, 0.35),
			0 0 0 1px color-mix(in srgb, var(--feature-accent) 28%, transparent);
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
		.demo-page {
			padding: 1.75rem 1.5rem;
		}

		/* Lower min column width so 2+ feature cards sit per row */
		.features-grid {
			grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		}
	}

	@media (max-width: 768px) {
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
		.demo-page {
			padding: 1.25rem 1rem;
		}

		.page-header h1 {
			font-size: 1.625rem;
		}

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
