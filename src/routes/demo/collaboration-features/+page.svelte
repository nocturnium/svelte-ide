<script lang="ts">
	/**
	 * Phase 3: Collaboration Features Demo
	 *
	 * Demonstrates:
	 * - Time Machine Scrubbing
	 * - Collaborative Conflict Theater
	 */

	import { onMount } from 'svelte';
	import Icon from '$lib/components/core/Icon.svelte';
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import TimelineScrubber from '$lib/components/editor/TimelineScrubber.svelte';
	import ConflictZoneLayer from '$lib/components/editor/ConflictZoneLayer.svelte';
	import {
		createTimelineManager,
		type SnapshotMetadata
	} from '$lib/components/editor/core/timeline';
	import {
		createConflictPredictor,
		type ConflictZone,
		type UserAwareness
	} from '$lib/components/editor/core/conflict-predictor';
	import { getSemanticAnalyzer } from '$lib/components/editor/core/semantic-analyzer';

	// Sample code shown in the editor for the demo. This is inert display text —
	// it exercises the syntax highlighting, timeline, and conflict layers only.
	const SAMPLE_CODE = `// Order Processing Module

interface Order {
  id: string;
  items: LineItem[];
  total: number;
  createdAt: Date;
}

interface LineItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

interface OrderResult {
  success: boolean;
  order?: Order;
  error?: string;
}

const TAX_RATE = 0.08;

/**
 * Calculate the subtotal for a set of line items.
 */
export function calculateSubtotal(items: LineItem[]): number {
  return items.reduce((sum, item) => {
    return sum + item.unitPrice * item.quantity;
  }, 0);
}

/**
 * Build an order from a list of line items.
 */
export function createOrder(items: LineItem[]): OrderResult {
  if (items.length === 0) {
    return { success: false, error: 'Order must contain at least one item' };
  }

  const subtotal = calculateSubtotal(items);
  const total = subtotal + subtotal * TAX_RATE;

  const order: Order = {
    id: \`order-\${Date.now()}\`,
    items,
    total,
    createdAt: new Date()
  };

  return { success: true, order };
}

/**
 * Apply a percentage discount to an order total.
 */
export function applyDiscount(order: Order, percent: number): Order {
  const factor = 1 - percent / 100;
  return {
    ...order,
    total: order.total * factor
  };
}
`;

	// Timeline state
	const timelineManager = createTimelineManager({
		snapshotInterval: 5000, // Faster for demo
		maxSnapshots: 100
	});

	// Conflict predictor
	const conflictPredictor = createConflictPredictor({
		recentEditWindow: 60000,
		proximityThreshold: 15,
		warningThreshold: 0.2
	});

	const semanticAnalyzer = getSemanticAnalyzer();

	let content = $state(SAMPLE_CODE);
	let timelinePosition = $state(1);
	let isPlayback = $state(false);
	let isPlaying = $state(false);
	let playbackContent = $state('');

	// Simulated users for conflict demo
	let simulatedUsers = $state<UserAwareness[]>([
		{
			id: 'user-1',
			name: 'You',
			color: '#4a9eff',
			isAI: false,
			cursorLine: 30,
			cursorColumn: 0,
			lastEditTime: Date.now(),
			recentlyEditedLines: [28, 29, 30, 31]
		}
	]);

	let conflictZones = $state<ConflictZone[]>([]);
	let markers = $state<
		Array<{
			position: number;
			color: string;
			type: SnapshotMetadata['changeType'];
			label: string;
			timestamp: number;
		}>
	>([]);

	// Initialize timeline
	onMount(() => {
		timelineManager.start(SAMPLE_CODE);

		// Create some initial history for demo
		setTimeout(() => {
			timelineManager.captureSnapshot(SAMPLE_CODE, {
				author: 'alice',
				authorColor: '#22c55e',
				isAI: false,
				description: 'Added user interface',
				changeType: 'edit'
			});
		}, 100);

		setTimeout(() => {
			timelineManager.captureSnapshot(SAMPLE_CODE, {
				author: 'ai-assistant',
				authorColor: 'var(--ide-ai-assistant)',
				isAI: true,
				description: 'Added error handling',
				changeType: 'ai-suggestion'
			});
		}, 200);

		setTimeout(() => {
			timelineManager.captureSnapshot(SAMPLE_CODE, {
				author: 'bob',
				authorColor: '#f59e0b',
				isAI: false,
				description: 'Refactored auth logic',
				changeType: 'edit'
			});
		}, 300);

		// Update markers
		const updateMarkers = () => {
			markers = timelineManager.getMarkers();
		};
		updateMarkers();

		const unsubscribe = timelineManager.subscribe(() => {
			updateMarkers();
		});

		return () => {
			unsubscribe();
			timelineManager.stop();
		};
	});

	// Update conflicts when users change
	$effect(() => {
		const regions = semanticAnalyzer.analyze(
			content.split('\n').map((text, i) => ({ text, number: i + 1 })),
			'typescript'
		);
		conflictZones = conflictPredictor.predict(simulatedUsers, regions);
	});

	function handleContentChange(newContent: string) {
		content = newContent;
		timelineManager.recordChange(newContent);
		timelineManager.captureOnEdit(newContent);
	}

	function handlePositionChange(position: number) {
		timelinePosition = position;

		if (position < 1) {
			isPlayback = true;
			const snapshotContent = timelineManager.getContentAtPosition(position);
			if (snapshotContent) {
				playbackContent = snapshotContent;
			}
		} else {
			isPlayback = false;
			playbackContent = '';
		}
	}

	function handleGoLive() {
		timelinePosition = 1;
		isPlayback = false;
		playbackContent = '';
	}

	// Simulated collaborators for demo
	function addSimulatedUser() {
		const colors = ['#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];
		const names = ['Alice', 'Bob', 'Carol', 'Dave'];
		const index = simulatedUsers.length - 1;

		if (index < 4) {
			simulatedUsers = [
				...simulatedUsers,
				{
					id: `user-${Date.now()}`,
					name: names[index],
					color: colors[index],
					isAI: false,
					cursorLine: Math.floor(Math.random() * 50) + 20,
					cursorColumn: 0,
					lastEditTime: Date.now(),
					recentlyEditedLines: []
				}
			];
		}
	}

	function addAIAgent() {
		simulatedUsers = [
			...simulatedUsers,
			{
				id: `ai-${Date.now()}`,
				name: 'AI Assistant',
				color: 'var(--ide-ai-assistant)',
				isAI: true,
				cursorLine: 45,
				cursorColumn: 0,
				lastEditTime: Date.now(),
				recentlyEditedLines: [44, 45, 46, 47]
			}
		];
	}

	function clearUsers() {
		simulatedUsers = [simulatedUsers[0]]; // Keep "You"
	}

	function moveUserCursor(userId: string, line: number) {
		simulatedUsers = simulatedUsers.map((u) =>
			u.id === userId ? { ...u, cursorLine: line, lastEditTime: Date.now() } : u
		);
	}
</script>

<div class="demo-page">
	<header class="demo-header">
		<h1>Phase 3: Collaboration Features</h1>
		<p>Time Machine Scrubbing and Collaborative Conflict Theater</p>
	</header>

	<div class="demo-content">
		<!-- Time Machine Section -->
		<section class="demo-section">
			<h2>Time Machine Scrubbing</h2>
			<p class="demo-description">
				Scrub through document history with the timeline below. Colored markers show different
				authors and change types.
			</p>

			<div class="timeline-demo">
				<div class="timeline-info">
					<div class="timeline-stat">
						<span class="stat-label">Snapshots</span>
						<span class="stat-value">{markers.length}</span>
					</div>
					<div class="timeline-stat">
						<span class="stat-label">Mode</span>
						<span class="stat-value" class:playback={isPlayback}>
							{isPlayback ? 'Playback' : 'Live'}
						</span>
					</div>
					<div class="timeline-stat">
						<span class="stat-label">Position</span>
						<span class="stat-value">{Math.round(timelinePosition * 100)}%</span>
					</div>
				</div>

				<TimelineScrubber
					{markers}
					bind:position={timelinePosition}
					{isPlayback}
					{isPlaying}
					duration={timelineManager.getDuration()}
					onPositionChange={handlePositionChange}
					onGoLive={handleGoLive}
					enabled={true}
				/>

				<div class="timeline-legend">
					<div class="legend-item">
						<span class="legend-dot" style="background: #4a9eff"></span>
						<span>You</span>
					</div>
					<div class="legend-item">
						<span class="legend-dot" style="background: #22c55e"></span>
						<span>Alice</span>
					</div>
					<div class="legend-item">
						<span class="legend-dot" style="background: var(--ide-ai-assistant)"></span>
						<span>AI</span>
					</div>
					<div class="legend-item">
						<span class="legend-dot" style="background: #f59e0b"></span>
						<span>Bob</span>
					</div>
				</div>
			</div>
		</section>

		<!-- Conflict Theater Section -->
		<section class="demo-section">
			<h2>Collaborative Conflict Theater</h2>
			<p class="demo-description">
				Real-time conflict prediction when multiple users edit nearby regions. Add collaborators to
				see conflict zones appear.
			</p>

			<div class="conflict-controls">
				<button class="demo-btn" onclick={addSimulatedUser} disabled={simulatedUsers.length >= 5}>
					Add Collaborator
				</button>
				<button class="demo-btn demo-btn--ai" onclick={addAIAgent}> Add AI Agent </button>
				<button
					class="demo-btn demo-btn--secondary"
					onclick={clearUsers}
					disabled={simulatedUsers.length <= 1}
				>
					Clear All
				</button>
			</div>

			<div class="users-list">
				{#each simulatedUsers as user (user.id)}
					<div class="user-card" style="--user-color: {user.color}">
						<div
							class="user-avatar"
							style="background: {user.color}"
							role="img"
							aria-label={user.isAI ? `${user.name} (AI agent)` : `${user.name} avatar`}
						>
							{#if user.isAI}
								<Icon name="bot" size={18} class="ai-icon" />
							{:else}
								{user.name.charAt(0)}
							{/if}
						</div>
						<div class="user-info">
							<span class="user-name">
								{user.name}
								{#if user.isAI}
									<span class="ai-badge">AI</span>
								{/if}
							</span>
							<span class="user-line">Line {user.cursorLine + 1}</span>
						</div>
						{#if user.id !== 'user-1'}
							<input
								type="range"
								min="0"
								max="80"
								value={user.cursorLine}
								oninput={(e) => moveUserCursor(user.id, parseInt(e.currentTarget.value))}
								class="user-slider"
							/>
						{/if}
					</div>
				{/each}
			</div>

			{#if conflictZones.length > 0}
				<div class="conflict-summary">
					<h3>Active Conflict Zones</h3>
					{#each conflictZones as zone (zone.id)}
						<div class="conflict-card conflict-card--{zone.severity}">
							<div class="conflict-probability">{Math.round(zone.probability * 100)}%</div>
							<div class="conflict-details">
								<div class="conflict-region">{zone.semanticUnit}</div>
								<div class="conflict-participants">
									{zone.participants.map((p) => p.userName).join(', ')}
								</div>
								{#if zone.suggestion}
									<div class="conflict-suggestion">{zone.suggestion}</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Editor with overlay -->
		<section class="demo-section demo-section--editor">
			<h2>Editor with Conflict Zones</h2>
			<div class="editor-container">
				<div class="conflict-overlay">
					<ConflictZoneLayer
						zones={conflictZones}
						lineHeight={20}
						gutterWidth={50}
						showParticipants={true}
						enabled={true}
					/>
				</div>
				<CustomEditor
					content={isPlayback ? playbackContent : content}
					language="typescript"
					readonly={isPlayback}
					onChange={handleContentChange}
					folding={true}
				/>
			</div>
		</section>
	</div>
</div>

<style>
	.demo-page {
		min-height: 100vh;
		background: var(--ide-bg-primary);
		color: var(--ide-text-primary);
		overflow-x: hidden;
	}

	.demo-header {
		padding: 2rem;
		border-bottom: 1px solid var(--ide-border);
		background: var(--ide-bg-secondary);
	}

	.demo-header h1 {
		margin: 0 0 0.5rem 0;
		font-size: 2rem;
		font-weight: 700;
	}

	.demo-header p {
		margin: 0;
		color: var(--ide-text-muted);
	}

	.demo-content {
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.demo-section {
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		padding: 1.5rem;
	}

	.demo-section h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.demo-description {
		margin: 0 0 1rem 0;
		color: var(--ide-text-muted);
		font-size: 0.875rem;
	}

	/* Timeline Demo */
	.timeline-demo {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.timeline-info {
		display: flex;
		gap: 2rem;
	}

	.timeline-stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-value {
		font-size: 1rem;
		font-weight: 600;
	}

	.stat-value.playback {
		color: #f59e0b;
	}

	.timeline-legend {
		display: flex;
		gap: 1.5rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--ide-text-muted);
	}

	.legend-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	/* Conflict Controls */
	.conflict-controls {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.demo-btn {
		padding: 0.5rem 1rem;
		background: var(--color-nocturnium-wave);
		color: var(--color-nocturnium-night);
		/* Transparent border reserves the box so the outlined secondary button
		   stays the same height as the filled ones (no row misalignment). */
		border: 1px solid transparent;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	.demo-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.demo-btn--ai {
		background: var(--ide-ai-assistant);
		color: #fff;
	}

	.demo-btn--secondary {
		background: var(--ide-bg-elevated);
		color: var(--ide-text-secondary);
		/* Outline so the secondary action still reads as a button even when
		   disabled (e.g. 'Clear All' on first load), not an empty/error state. */
		border-color: var(--ide-border);
	}

	/* Users List */
	.users-list {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.user-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: var(--ide-bg-elevated);
		border: 1px solid var(--ide-border);
		border-left: 3px solid var(--user-color);
		border-radius: 6px;
		min-width: 200px;
	}

	.user-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		color: #fff;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.user-name {
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.user-line {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
	}

	.ai-badge {
		padding: 1px 4px;
		background: color-mix(in srgb, var(--ide-ai-assistant) 20%, transparent);
		border-radius: 3px;
		font-size: 0.625rem;
		color: var(--ide-ai-assistant);
	}

	.user-avatar :global(.ai-icon) {
		display: block;
		color: #fff;
	}

	.user-slider {
		width: 80px;
		margin-left: auto;
	}

	/* Conflict Summary */
	.conflict-summary {
		margin-top: 1rem;
	}

	.conflict-summary h3 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--ide-text-secondary);
	}

	.conflict-card {
		display: flex;
		gap: 1rem;
		padding: 0.75rem;
		background: var(--ide-bg-elevated);
		border-radius: 6px;
		margin-bottom: 0.5rem;
		border-left: 3px solid;
	}

	.conflict-card--low {
		border-left-color: #22c55e;
	}
	.conflict-card--medium {
		border-left-color: #eab308;
	}
	.conflict-card--high {
		border-left-color: #f59e0b;
	}
	.conflict-card--critical {
		border-left-color: #ef4444;
	}

	.conflict-probability {
		font-size: 1.25rem;
		font-weight: 700;
		min-width: 50px;
	}

	.conflict-details {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.conflict-region {
		font-weight: 500;
	}

	.conflict-participants {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
	}

	.conflict-suggestion {
		font-size: 0.75rem;
		color: #eab308;
		font-style: italic;
	}

	/* Editor */
	.demo-section--editor {
		flex: 1;
		min-height: 400px;
	}

	.editor-container {
		position: relative;
		height: 400px;
		min-width: 0;
		border: 1px solid var(--ide-border);
		border-radius: 6px;
		overflow: hidden;
	}

	/* Let the editor host fill — its internal scroll owns long lines */
	.editor-container :global(.custom-editor) {
		min-width: 0;
		box-sizing: border-box;
	}

	.conflict-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 10;
	}

	/* ── Responsive: tablet → mobile ─────────────────────────────── */
	@media (max-width: 860px) {
		.demo-header,
		.demo-content {
			padding: 1.5rem;
		}

		.demo-section {
			min-width: 0;
		}

		/* Controls wrap instead of overflowing the card */
		.conflict-controls {
			flex-wrap: wrap;
		}

		.demo-btn {
			flex: 1 1 auto;
			min-height: 44px;
		}

		/* Tighter stat rhythm on narrow columns */
		.timeline-info {
			gap: 1rem;
		}

		.timeline-legend {
			flex-wrap: wrap;
			gap: 0.75rem 1.25rem;
		}
	}

	/* ── Responsive: phones ──────────────────────────────────────── */
	@media (max-width: 640px) {
		.demo-header,
		.demo-content {
			padding: 1.25rem;
		}

		.demo-header h1 {
			font-size: 1.625rem;
		}

		.demo-section {
			padding: 1.25rem;
		}

		.demo-section h2 {
			font-size: 1.25rem;
		}

		/* Stack user cards full-width so nothing crowds the column */
		.users-list {
			gap: 0.75rem;
		}

		.user-card {
			min-width: 0;
			width: 100%;
		}

		.user-slider {
			width: 96px;
		}

		.timeline-info {
			gap: 0.75rem 1.25rem;
			flex-wrap: wrap;
		}

		/* Conflict cards: keep probability + details readable when narrow */
		.conflict-card {
			gap: 0.75rem;
		}

		/* Balanced control group on phones: the primary action spans the full
		   width and the two secondary actions share an even second row, so the
		   group never looks unbalanced/incomplete on first load. */
		.conflict-controls {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.5rem;
		}

		.conflict-controls .demo-btn:first-child {
			grid-column: 1 / -1;
		}

		/* Right-edge scroll affordance for the horizontally scrollable code,
		   matching the power-features code preview. Signals the editor pane
		   scrolls sideways when sample lines run past the narrow column. */
		.editor-container :global(.custom-editor) {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent);
		}
	}
</style>
