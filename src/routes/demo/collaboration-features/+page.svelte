<script lang="ts">
	/**
	 * Collaboration Features Demo
	 *
	 * Demonstrates:
	 * - Time Machine Scrubbing
	 * - Collaborative Conflict Theater
	 */

	import { onMount } from 'svelte';
	import * as Y from 'yjs';
	import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
	import { createAwarenessProtocol } from '$lib/crdt/awareness';
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import CollaborativeEditor from '$lib/components/editor/CollaborativeEditor.svelte';
	import TimelineScrubber from '$lib/components/editor/TimelineScrubber.svelte';
	import ConflictZoneLayer from '$lib/components/editor/ConflictZoneLayer.svelte';
	import {
		createTimelineManager,
		type SnapshotMetadata
	} from '$lib/components/editor/core/timeline';
	import {
		awarenessToUserAwareness,
		createConflictPredictor,
		markAwarenessActivity,
		type ConflictZone,
		type UserAwareness
	} from '$lib/components/editor/core/conflict-predictor';
	import { getSemanticAnalyzer } from '$lib/components/editor/core/semantic-analyzer';

	// Initial code shared by the two live editors in this demo.
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

	const primaryUser = {
		id: 'local-user',
		name: 'You',
		color: '#4a9eff'
	};

	const secondaryUser = {
		id: 'reviewer-user',
		name: 'Reviewer',
		color: '#22c55e'
	};

	const sharedDoc = new Y.Doc();
	const sharedText = sharedDoc.getText('content');
	if (sharedText.length === 0) {
		sharedText.insert(0, SAMPLE_CODE);
	}

	const primaryAwareness = new Awareness(sharedDoc);
	const secondaryAwareness = new Awareness(sharedDoc);
	// Both Awareness instances default to sharedDoc.clientID, so without a distinct
	// id the second editor's presence overwrites the first's slot in the relayed
	// states map and the predictor only ever sees one user (no conflict zone can
	// form). Give the second editor its own presence id so two real cursors show.
	secondaryAwareness.setLocalState(null);
	secondaryAwareness.clientID = sharedDoc.clientID + 1;
	secondaryAwareness.setLocalState({});
	const predictorAwareness = createAwarenessProtocol(primaryAwareness, { destroyAwareness: false });

	// Timeline state
	const timelineManager = createTimelineManager({
		snapshotInterval: 60000,
		maxSnapshots: 100,
		minLinesForSnapshot: 0,
		defaultAuthor: {
			id: primaryUser.id,
			name: primaryUser.name,
			color: primaryUser.color
		}
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
	let awarenessUsers = $state<UserAwareness[]>([]);
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
	let primaryCursorLine = 0;
	let secondaryCursorLine = 0;

	const awarenessBinding = {
		indexToPosition(index: number) {
			const lines = content.split('\n');
			if (lines.length === 0 || index <= 0) return { line: 0, column: 0 };

			let remaining = index;
			for (let line = 0; line < lines.length; line++) {
				const lineText = lines[line] ?? '';
				const isLastLine = line === lines.length - 1;
				const effectiveLength = isLastLine ? lineText.length : lineText.length + 1;

				if (remaining <= effectiveLength) {
					return { line, column: Math.min(remaining, lineText.length) };
				}
				remaining -= lineText.length + 1;
			}

			const lastLine = lines.length - 1;
			return { line: lastLine, column: lines[lastLine]?.length ?? 0 };
		}
	};

	// Initialize timeline
	onMount(() => {
		timelineManager.start(SAMPLE_CODE);
		primaryAwareness.setLocalStateField('user', primaryUser);
		secondaryAwareness.setLocalStateField('user', secondaryUser);

		// Update markers
		const updateMarkers = () => {
			markers = timelineManager.getMarkers();
		};
		updateMarkers();

		const unsubscribe = timelineManager.subscribe(() => {
			updateMarkers();
		});

		let relayingAwareness = false;
		const relayAwareness = (source: Awareness, target: Awareness) => {
			const relay = (changes: { added: number[]; updated: number[]; removed: number[] }) => {
				if (relayingAwareness) return;

				const changedClients = [...changes.added, ...changes.updated, ...changes.removed];
				if (changedClients.length === 0) return;

				relayingAwareness = true;
				try {
					applyAwarenessUpdate(
						target,
						encodeAwarenessUpdate(source, changedClients),
						'collaboration-features-demo'
					);
				} finally {
					relayingAwareness = false;
				}
				refreshConflicts();
			};

			source.on('update', relay);
			return () => source.off('update', relay);
		};

		const stopPrimaryRelay = relayAwareness(primaryAwareness, secondaryAwareness);
		const stopSecondaryRelay = relayAwareness(secondaryAwareness, primaryAwareness);
		const unsubscribePresence = predictorAwareness.onUsersChange(() => {
			refreshConflicts();
		});
		refreshConflicts();

		return () => {
			unsubscribe();
			unsubscribePresence();
			stopPrimaryRelay();
			stopSecondaryRelay();
			timelineManager.stop();
			predictorAwareness.destroy();
			primaryAwareness.destroy();
			secondaryAwareness.destroy();
			sharedDoc.destroy();
		};
	});

	function refreshConflicts(now = Date.now()) {
		const regions = semanticAnalyzer.analyze(
			content.split('\n').map((text, i) => ({ text, number: i + 1 })),
			'typescript'
		);
		awarenessUsers = awarenessToUserAwareness(predictorAwareness, awarenessBinding, now);
		conflictZones = conflictPredictor.predict(awarenessUsers, regions);
	}

	function handleContentChange(newContent: string, user: typeof primaryUser, recentLine: number) {
		content = newContent;
		timelineManager.recordChange(newContent);
		timelineManager.captureOnEdit(newContent, {
			author: user.id,
			authorColor: user.color,
			isAI: false,
			description: 'Edit',
			changeType: 'edit'
		});
		markAwarenessActivity(predictorAwareness, user.id, Date.now(), [Math.max(0, recentLine)]);
		refreshConflicts();
	}

	function handleCursorActivity(userId: string, line: number) {
		const cursorLine = Math.max(0, line - 1);
		if (userId === primaryUser.id) {
			primaryCursorLine = cursorLine;
		} else {
			secondaryCursorLine = cursorLine;
		}
		refreshConflicts();
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
</script>

<div class="demo-page">
	<header class="demo-header">
		<h1>Collaboration Features</h1>
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
						<span class="legend-dot" style="background: {primaryUser.color}"></span>
						<span>{primaryUser.name}</span>
					</div>
					<div class="legend-item">
						<span class="legend-dot" style="background: {secondaryUser.color}"></span>
						<span>{secondaryUser.name}</span>
					</div>
				</div>
			</div>
		</section>

		<!-- Conflict Theater Section -->
		<section class="demo-section">
			<h2>Collaborative Conflict Theater</h2>
			<p class="demo-description">
				Real-time conflict prediction from two live editors sharing the same in-page document.
			</p>

			<div class="users-list">
				{#each awarenessUsers as user (user.id)}
					<div class="user-card" style="--user-color: {user.color}">
						<div
							class="user-avatar"
							style="background: {user.color}"
							role="img"
							aria-label={user.isAI ? `${user.name} (AI agent)` : `${user.name} avatar`}
						>
							{#if user.isAI}
								AI
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
			<h2>Shared Editors with Conflict Zones</h2>
			<div class="collab-editor-grid">
				<div class="editor-pane">
					<div class="editor-pane__header">
						<span class="legend-dot" style="background: {primaryUser.color}"></span>
						<span>{isPlayback ? 'Timeline Playback' : primaryUser.name}</span>
					</div>
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
						{#if isPlayback}
							<CustomEditor
								content={playbackContent}
								language="typescript"
								readonly={true}
								folding={true}
							/>
						{:else}
							<CollaborativeEditor
								doc={sharedDoc}
								awareness={primaryAwareness}
								initialContent={SAMPLE_CODE}
								textName="content"
								language="typescript"
								currentUser={primaryUser}
								onChange={(value) => handleContentChange(value, primaryUser, primaryCursorLine)}
								onCursorChange={(line) => handleCursorActivity(primaryUser.id, line)}
							/>
						{/if}
					</div>
				</div>

				<div class="editor-pane">
					<div class="editor-pane__header">
						<span class="legend-dot" style="background: {secondaryUser.color}"></span>
						<span>{secondaryUser.name}</span>
					</div>
					<div class="editor-container">
						<CollaborativeEditor
							doc={sharedDoc}
							awareness={secondaryAwareness}
							initialContent={SAMPLE_CODE}
							textName="content"
							language="typescript"
							currentUser={secondaryUser}
							onChange={(value) => handleContentChange(value, secondaryUser, secondaryCursorLine)}
							onCursorChange={(line) => handleCursorActivity(secondaryUser.id, line)}
						/>
					</div>
				</div>
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

	.collab-editor-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1rem;
	}

	.editor-pane {
		min-width: 0;
	}

	.editor-pane__header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--ide-text-secondary);
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

		.collab-editor-grid {
			grid-template-columns: 1fr;
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

		.timeline-info {
			gap: 0.75rem 1.25rem;
			flex-wrap: wrap;
		}

		/* Conflict cards: keep probability + details readable when narrow */
		.conflict-card {
			gap: 0.75rem;
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
