<script lang="ts">
	/**
	 * Cognitive complexity & ghost pair demo
	 *
	 * Demonstrates cognitive load and AI presence features:
	 * - Cognitive complexity meter: the metric, measured live
	 * - Ghost Pair: AI cursor and focus visualization
	 */

	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import CognitiveLoadMeter from '$lib/components/editor/CognitiveLoadMeter.svelte';
	import ComplexityLegend from '$lib/components/editor/ComplexityLegend.svelte';
	import {
		COGNITIVE_COMPLEXITY_BANDS,
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
  complexityThreshold={COGNITIVE_COMPLEXITY_BANDS.medium}
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
			if (!hottest || region.cognitiveComplexity > hottest.cognitiveComplexity) return region;
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

	/**
	 * Rows the agent may occupy.
	 *
	 * `processUser` spans lines 13-27 of the sample and is the first region the
	 * gutter marks, so it is both on screen at the initial scroll position and
	 * something the rest of the page is already talking about.
	 *
	 * It used to roam lines 45-90 with a focus region over 40-95. The editor window
	 * is 500px — about 25 rows — so every one of those rows was below the fold, and
	 * the layer's own clipping bug meant they would not have painted even if you
	 * scrolled. Two independent reasons the feature looked dead.
	 */
	const AGENT_FIRST_ROW = 13;
	const AGENT_LAST_ROW = 24;

	// Simulated AI agent
	let claudeAgent = $state(
		createAIAwareness('claude-1', 'Claude', {
			attentionType: 'reading',
			cursor: {
				position: { line: AGENT_FIRST_ROW + 1, column: 8 },
				// Brand AI-assistant purple (--ide-ai-assistant / aurora-purple). The
				// editor paints the cursor in-canvas from this hex, so it can't read the
				// CSS token directly; keep it in sync with --color-nocturnium-aurora-purple.
				color: '#a78bfa',
				visible: true,
				animation: 'thinking'
			},
			focusRegions: [
				{
					startLine: AGENT_FIRST_ROW,
					endLine: AGENT_LAST_ROW,
					intensity: 0.6,
					type: 'reading',
					label: 'Analyzing complexity'
				}
			],
			activity: 'Reading processUser',
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
	let cursorLine = $state(AGENT_FIRST_ROW + 1);
	let cursorDirection = $state(1);

	function startAnimation() {
		if (animationInterval) return;

		animationInterval = setInterval(() => {
			cursorLine += cursorDirection;

			if (cursorLine >= AGENT_LAST_ROW) cursorDirection = -1;
			if (cursorLine <= AGENT_FIRST_ROW + 1) cursorDirection = 1;

			claudeAgent = {
				...claudeAgent,
				cursor: claudeAgent.cursor
					? {
							...claudeAgent.cursor,
							position: { line: cursorLine, column: 8 + Math.floor(Math.random() * 20) },
							animation: Math.random() > 0.7 ? 'thinking' : 'moving'
						}
					: null,
				// `attentionType` is NOT touched here. It used to be reassigned at
				// random every tick, which silently overwrote whatever "Cycle
				// Attention State" had just set — while leaving `activity` and the
				// focus region's type at the cycled value. The rail then read
				// "Verifying changes" beside a canvas drawing the reading glyph, and
				// the screen-reader prefix announced the wrong state. A control whose
				// stated effect is undone half a second later is the exact defect
				// moving these controls next to the canvas was meant to expose.
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
				return 'Reading processUser';
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
	title="Cognitive complexity"
	description="See which functions are hard to hold in your head, scored as you type against SonarSource's published metric — and watch an AI agent's attention move through the same gutter."
	docTitle="Cognitive complexity & ghost pair"
>
	<!-- Cognitive complexity meter -->
	<section class="component-section">
		<h2>The meter</h2>
		<p class="section-desc">
			Regions at or above the Moderate band get a coloured edge in the gutter and a slight lift of
			the background. The code itself is never washed over, so nothing becomes harder to read: in
			the busiest region a comment — the faintest token — measures 5.13:1, against 5.81:1 on
			unmarked code.
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
					? `Jump to hottest region ${hottestRegion.name || hottestRegion.type}, cognitive complexity ${hottestRegion.cognitiveComplexity}`
					: 'No complex region to jump to'}
			>
				<span class="meter-label">Current file</span>
				<CognitiveLoadMeter metrics={complexityMetrics} showDetails={true} size="showcase" />
				<span class="meter-hotspot">
					{#if hottestRegion}
						in <strong>{hottestRegion.name || hottestRegion.type}</strong> · jump to it
					{:else}
						nothing above the Simple band
					{/if}
				</span>
			</button>

			{#if complexityMetrics}
				<!-- Secondary counts only. The headline number lives in the meter to the
				     left and is now stated exactly once: it previously appeared three
				     times in this one strip, and these two supporting stats were
				     rendered larger and brighter than the number they support. -->
				<dl class="metrics-summary">
					<div class="metric">
						<dt class="metric-label">Regions</dt>
						<dd class="metric-value">{complexityMetrics.regions.length}</dd>
					</div>
					<div class="metric">
						<dt class="metric-label">Lines in flagged regions</dt>
						<dd class="metric-value">
							{complexityMetrics.hotspots.length}<span class="metric-of"
								>of {content.split('\n').length}</span
							>
						</dd>
					</div>
				</dl>
			{/if}
		</div>

		<!-- One legend component, shared with the hero, driven by the analyzer's own
		     exported band constants — so the key cannot drift from what is painted.
		     The hand-authored swatches this replaces named 0-49/50-69/70-84/85+ on
		     the deprecated score and coloured them with the four semantic tokens
		     the overlay no longer uses. -->
		<ComplexityLegend />
	</section>

	<!-- Ghost Pair Demo -->
	<section class="component-section">
		<h2>Ghost pair — AI presence</h2>
		<p class="section-desc">
			Visualize AI agents working alongside you: a ghost cursor, a focus-region glow, and an
			activity label showing where an agent is looking. <strong>The agent here is simulated</strong> —
			a scripted cursor on a timer, not a model. It demonstrates the rendering layer your own agent would
			drive.
		</p>

		<p class="section-desc section-desc--pointer">
			The controls sit beside the editor below, next to the canvas they drive. They used to live
			here, two sections above the only surface that renders an agent — so toggling one appeared to
			do nothing at all.
		</p>
	</section>

	<!-- Combined Editor Demo -->
	<section class="component-section">
		<h2>Try it on your own code</h2>
		<p class="section-desc">
			Edit or paste over the sample — every number above updates as you type. This is the library's
			own editor, not a textarea: the page that argues for building an editor from scratch should
			not ask you to type into the browser's default one.
		</p>

		<div class="extract-controls">
			<label class="editor-language" for="code-language">
				Language
				<select id="code-language" bind:value={selectedLanguage}>
					{#each languageOptions as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>
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

		<!-- Canvas and its controls side by side. The ghost-pair controls were two
		     sections up, nowhere near the only canvas that draws an agent. -->
		<div class="canvas-with-rail">
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
						complexityThreshold={COGNITIVE_COMPLEXITY_BANDS.medium}
						{aiAgents}
						showAILabels={true}
						showAIFocusRegions={true}
						onComplexityChange={handleComplexityChange}
					/>
				</div>
			</DemoExhibit>

			<aside class="ghost-rail" aria-label="Ghost pair controls">
				<h3 class="ghost-rail__title">Ghost pair</h3>
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
							<span class="sr-only">{claudeAgent.attentionType}:</span>
							{claudeAgent.activity}
						</span>
					</div>
				{:else}
					<span class="ai-status-hidden">AI cursor hidden — enable to see Claude's focus</span>
				{/if}

				<p class="ghost-rail__note">
					Claude reads <code>processUser</code> — a region the gutter also marks — so the ghost cursor
					lands on rows that are on screen.
				</p>
			</aside>
		</div>
	</section>

	<!-- Feature Highlights -->
	<section class="component-section">
		<h2>What it does</h2>
		<div class="features-grid">
			<div class="feature-card">
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
				<h3>Cognitive complexity</h3>
				<p>
					Real-time analysis of code complexity based on nesting, branching, and function calls.
				</p>
			</div>

			<div class="feature-card">
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

			<div class="feature-card">
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

			<div class="feature-card">
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
	/* One plane, one hierarchy. The supporting counts used to sit in their own
	   --ide-bg-tertiary card — a surface twice as bright as the strip around it —
	   so a line count rendered larger and lighter than the headline it supports,
	   and the eye landed on 117 before it found 113. */
	.meter-showcase {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1.25rem 2.5rem;
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
		/* --ide-text-muted is a 60%-alpha token; on these surfaces it measured
		   2.47:1 on the stat card and 3.93:1 here. Secondary is 10.2:1. */
		color: var(--ide-text-secondary);
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
		font-size: 0.8125rem;
		color: var(--ide-text-secondary);
		transition: color 0.15s ease;
	}

	/* Same plane as the meter, no card, no elevation — these are footnotes. */
	.metrics-summary {
		display: flex;
		gap: 1.5rem;
		margin: 0;
		padding: 0;
		border-left: 1px solid var(--ide-border);
		padding-left: 1.5rem;
	}

	.metric {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
	}

	.metric-value {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ide-text-secondary);
	}

	/* "Hotspot Lines" was a bare count with no denominator, and because regions
	   overlap it could exceed the file's own length — measured 12 flagged lines in
	   an 8-line file. Deduplicated in the analyzer; given a denominator here. */
	.metric-of {
		margin-left: 4px;
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--ide-text-secondary);
		opacity: 0.8;
	}

	.metric-label {
		font-size: 0.75rem;
		color: var(--ide-text-secondary);
		opacity: 0.85;
	}

	/* Paste Panel */

	/* Complexity Legend */

	/* Ghost Pair Controls */
	/* Canvas on the left, the controls that drive it on the right.

	   The editor column carries a min-width and the breakpoint sits at 1140px, not
	   900px. At 900 the two-column grid still applied while the rail — a checkbox
	   and one button — held a fixed 260px and refused to yield any of it, so the
	   editor kept shrinking: at 920px it was cutting `function processUser(user:
	   Us` mid-token with no fade and no scroll cue, and the score chip had marched
	   left into the code. The rail was starving the thing it exists to control. */
	.canvas-with-rail {
		display: grid;
		grid-template-columns: minmax(30rem, 1fr) 260px;
		gap: 1.25rem;
		align-items: start;
	}

	.ghost-rail {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 1rem 1.25rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
	}

	.ghost-rail__title {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		/* Secondary, not muted, for the reason already recorded on `.meter-label`
		   in this same file: --ide-text-muted is a 60%-alpha token and measures
		   3.93:1 on --ide-bg-secondary, under the 4.5:1 floor. Secondary is 10.2:1.
		   The rail's own title was the least legible thing in the rail. */
		color: var(--ide-text-secondary);
	}

	.ghost-rail__note {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--ide-text-secondary);
	}

	.ghost-rail__note code {
		font-family: var(--ide-font-mono);
		font-size: 0.7rem;
	}

	.section-desc--pointer {
		font-size: 0.875rem;
		color: var(--ide-text-muted);
	}

	@media (max-width: 1140px) {
		.canvas-with-rail {
			grid-template-columns: minmax(0, 1fr);
		}

		.ghost-rail {
			/* A horizontal bar once it is full width — it reads as a toolbar for the
			   canvas rather than a card stranded beneath it. */
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.875rem 1.25rem;
			/* Above the canvas, not below it. Stacked under a 500px editor the rail
			   lands off-screen while the canvas is in view, which is the same
			   controls-nowhere-near-their-effect problem this layout was built to
			   fix, rotated ninety degrees. */
			order: -1;
		}

		.ghost-rail__title {
			width: 100%;
		}
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
		/* The one string whose job is to say nothing is broken; it has to be
		   readable. Muted measures 3.93:1 here. */
		color: var(--ide-text-secondary);
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

	.editor-language {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ide-text-secondary);
	}

	.editor-language select {
		padding: 0.375rem 0.5rem;
		font-family: inherit;
		font-size: 0.8125rem;
		text-transform: none;
		letter-spacing: normal;
		color: var(--ide-text-primary);
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 6px;
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
	/* No per-card accent. The complexity ramp is ORDINAL — cyan to terracotta means
	   increasing severity, which is the entire argument for it existing — and
	   spending it as decorative variety across four cards with no severity
	   relationship is the same category error as the --ide-error it replaced. */
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
		/* Give the checkbox and buttons a 48px touch target. The checkbox is the
		   master switch for the whole section and was the only control here without
		   one — a ~20px hit area directly above a comfortable 48px button. */
		.toggle-control {
			min-height: 48px;
			padding: 0 0.25rem;
		}

		.toggle-control input {
			width: 20px;
			height: 20px;
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
