<script lang="ts">
	import { onMount } from 'svelte';
	import CollaborativeEditor from '$lib/components/editor/CollaborativeEditor.svelte';
	import Avatar from '$lib/components/core/Avatar.svelte';
	import Badge from '$lib/components/core/Badge.svelte';
	import Button from '$lib/components/core/Button.svelte';
	import Icon from '$lib/components/core/Icon.svelte';
	import {
		startAISession,
		setAITask,
		proposeAIChange,
		reviewAIChange,
		cancelAISession,
		getPendingChanges,
		getAISessions
	} from '$lib/stores/collaboration.svelte';
	import type { CollaborationUser, CollaboratorCursor, AIProposedChange } from '$lib/types/crdt';

	const collaborationColors = {
		alice: 'var(--ide-collab-cursor-1)',
		bob: 'var(--ide-collab-cursor-3)',
		charlie: 'var(--ide-collab-cursor-5)',
		claude: 'var(--ide-collab-ai)'
	};

	// Sample collaborators
	const collaborators: CollaborationUser[] = [
		{ id: '1', name: 'Alice', color: collaborationColors.alice, isAI: false },
		{ id: '2', name: 'Bob', color: collaborationColors.bob, isAI: false },
		{ id: '3', name: 'Charlie', color: collaborationColors.charlie, isAI: false },
		{ id: '4', name: 'Claude', color: collaborationColors.claude, isAI: true }
	];

	// Sample remote-cursor awareness data. These are illustrative fixed
	// positions for the two remote collaborators (the standalone editor below
	// has no provider, so there is no live remote presence). The local caret's
	// live position is tracked separately via onCursorChange (see `localCursor`).
	const cursors: CollaboratorCursor[] = [
		{
			userId: '1',
			user: collaborators[0],
			position: { line: 5, column: 12 },
			selection: undefined,
			lastActivity: new Date()
		},
		{
			userId: '2',
			user: collaborators[1],
			position: { line: 10, column: 8 },
			selection: { anchor: { line: 10, column: 8 }, head: { line: 10, column: 24 } },
			lastActivity: new Date()
		}
	];

	// Live local caret position, driven by the editor's real onCursorChange callback.
	let localCursor = $state({ line: 1, column: 1 });

	// Connection-status indicators. These are demo controls you can drive below —
	// the embedded editor runs standalone (no server), so toggling these simulates
	// the presence/sync UI rather than reflecting a real socket.
	let connectionStatus = $state<'disconnected' | 'connecting' | 'connected'>('connected');
	let synced = $state(true);

	function cycleConnection() {
		const order = ['connected', 'connecting', 'disconnected'] as const;
		const next = order[(order.indexOf(connectionStatus) + 1) % order.length];
		connectionStatus = next;
		// When fully connected, the doc is up to date; otherwise it falls behind.
		synced = next === 'connected';
	}

	function toggleSynced() {
		synced = !synced;
	}

	const sampleContent = `// Collaborative editing demo
// Multiple users can edit this document in real-time

interface Document {
  id: string;
  title: string;
  content: string;
  collaborators: User[];
}

class CollaborationSession {
  private doc: Y.Doc;
  private provider: WebsocketProvider;

  constructor(roomId: string) {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(
      'wss://collab.example.com',
      roomId,
      this.doc
    );
  }

  getText(): Y.Text {
    return this.doc.getText('content');
  }

  getAwareness(): Awareness {
    return this.provider.awareness;
  }
}`;

	// --- AI Collaboration session, wired to the real collaboration store ---
	// We drive an actual AICollaborationSession + AIProposedChanges through the
	// store and reflect the store's reactive state back into the UI, so the
	// Accept / Review / Cancel buttons exercise the genuine store functions
	// (reviewAIChange / cancelAISession) rather than no-ops.
	let sessionId = $state('');

	const reviewerId = 'demo-reviewer';
	const aiUser: CollaborationUser = {
		id: 'claude',
		name: 'Claude',
		color: collaborationColors.claude,
		isAI: true
	};

	// The task references getText, which is genuinely present in sampleContent
	// (class CollaborationSession.getText), so the narrative matches the code.
	const aiTask = 'Refactoring CollaborationSession.getText';

	// Stable short labels for the changes we propose; the store assigns the ids.
	const changeBlueprints = [
		{ label: 'Memoize the Y.Text lookup', explanation: 'Cache the getText() result' },
		{ label: 'Add a null-doc guard', explanation: 'Guard against an undefined doc' },
		{ label: 'Add a return-type annotation', explanation: 'Annotate the Y.Text return type' }
	] as const;

	// Map change id -> its display label (the store change carries explanation, not a short label).
	let changeLabels = $state<Record<string, string>>({});

	function seedSession() {
		sessionId = startAISession('demo-doc', aiUser);
		setAITask(sessionId, aiTask);
		const labels: Record<string, string> = {};
		for (const bp of changeBlueprints) {
			const id = proposeAIChange(sessionId, {
				type: 'replace',
				range: { startLine: 89, startColumn: 2, endLine: 91, endColumn: 3 },
				originalContent: "return this.doc.getText('content');",
				proposedContent: "return (this._text ??= this.doc.getText('content'));",
				explanation: bp.explanation
			});
			labels[id] = bp.label;
		}
		changeLabels = labels;
	}

	onMount(() => {
		seedSession();
	});

	// Reactive view of this session's changes, derived from the store's state.
	const sessionChanges = $derived(getPendingChanges().filter((c) => c.sessionId === sessionId));

	// Whether this session is still open (not completed/cancelled).
	const sessionActive = $derived(
		getAISessions().some(
			(s) => s.id === sessionId && (s.status === 'active' || s.status === 'pending')
		)
	);

	function statusBadge(status: AIProposedChange['status']): {
		variant: 'success' | 'warning' | 'danger';
		label: string;
	} {
		if (status === 'approved') return { variant: 'success', label: 'Accepted' };
		if (status === 'rejected') return { variant: 'danger', label: 'Rejected' };
		return { variant: 'warning', label: 'Pending' };
	}

	function acceptAll() {
		for (const change of sessionChanges) {
			if (change.status === 'pending') reviewAIChange(change.id, true, reviewerId);
		}
	}

	function reviewNext() {
		// Approve the first still-pending change, mimicking a step-through review.
		const next = sessionChanges.find((c) => c.status === 'pending');
		if (next) reviewAIChange(next.id, true, reviewerId);
	}

	function cancelSession() {
		// Cancel the session: rejects all of its pending changes and removes the AI user.
		if (sessionId) cancelAISession(sessionId);
	}

	function restartSession() {
		seedSession();
	}
</script>

<div class="demo-page">
	<header class="page-header">
		<h1>Real-time Collaboration</h1>
		<p>CRDT-based collaborative editing with Yjs</p>
	</header>

	<!-- Status Bar -->
	<section class="component-section">
		<h2>Connection Status</h2>
		<p class="section-desc">
			Sync-status indicator components. Drive them with the controls below to see each
			connection/sync state — the embedded editor runs standalone, so these reflect demo state, not
			a live socket.
		</p>

		<div class="status-demo">
			<div class="status-row">
				<span class="status-label">Status:</span>
				<span class="status-value" data-status={connectionStatus}>
					<span class="status-dot" aria-hidden="true"></span>
					<Badge variant={connectionStatus === 'connected' ? 'success' : 'warning'}>
						{connectionStatus}
					</Badge>
				</span>
			</div>
			<div class="status-row">
				<span class="status-label">Synced:</span>
				<Badge variant={synced ? 'success' : 'info'}>
					{synced ? 'Up to date' : 'Syncing...'}
				</Badge>
			</div>
			<div class="status-row">
				<span class="status-label">Collaborators:</span>
				<div class="collaborators-list">
					{#each collaborators as user (user.id)}
						<Avatar name={user.name} color={user.color} isAI={user.isAI} size="sm" />
					{/each}
					<span class="collab-count">{collaborators.length} sample users</span>
				</div>
			</div>
			<div class="status-row status-controls">
				<span class="status-label">Controls:</span>
				<Button variant="secondary" size="sm" onclick={cycleConnection}>Cycle status</Button>
				<Button variant="ghost" size="sm" onclick={toggleSynced}>Toggle synced</Button>
			</div>
		</div>
	</section>

	<!-- Collaborative Editor -->
	<section class="component-section">
		<h2>Collaborative Editor</h2>
		<p class="section-desc">
			The editor is CRDT-backed (Yjs) and exposes a live <code>onCursorChange</code> callback. This instance
			runs standalone with no provider, so the presence strip below is illustrative sample data — but
			your own caret position underneath is genuinely live.
		</p>

		<div class="editor-header">
			<div class="file-info">
				<span class="file-name">collaboration.ts</span>
				<Badge variant="default">Standalone</Badge>
			</div>
			<div class="active-users" aria-label="Sample collaborator presence">
				{#each collaborators.slice(0, 3) as user (user.id)}
					<div class="user-cursor" style="--cursor-color: {user.color}">
						<Avatar name={user.name} color={user.color} isAI={user.isAI} size="sm" />
						<span class="user-name">{user.name}</span>
					</div>
				{/each}
				{#if collaborators.length > 3}
					<span class="more-users">+{collaborators.length - 3}</span>
				{/if}
			</div>
		</div>

		<div class="editor-container">
			<CollaborativeEditor
				documentId="demo-doc"
				initialContent={sampleContent}
				language="typescript"
				onCursorChange={(line, column) => (localCursor = { line, column })}
			/>
		</div>

		<div class="editor-footer">
			<span class="presence-note">Presence strip above is sample data.</span>
			<span class="live-caret">
				Your caret: <strong>Ln {localCursor.line}, Col {localCursor.column}</strong> (live)
			</span>
		</div>
	</section>

	<!-- Cursor Visualization -->
	<section class="component-section">
		<h2>Cursor Awareness</h2>
		<p class="section-desc">
			The awareness-row UI for remote collaborators. These are sample positions (a live provider
			would feed them from the editor's <code>onCursorChange</code>); your own live caret is shown
			under the editor above.
		</p>

		<div class="cursors-demo">
			<!-- Local user row: genuinely live, driven by the editor's onCursorChange. -->
			<div class="cursor-info cursor-info--you" style="--cursor-color: var(--ide-interactive)">
				<div class="cursor-indicator"></div>
				<Avatar name="You" color="var(--ide-interactive)" size="sm" />
				<div class="cursor-details">
					<strong>You</strong>
					<span>Line {localCursor.line}, Col {localCursor.column}</span>
					<Badge variant="success">Live</Badge>
				</div>
			</div>
			{#each cursors as cursor (cursor.userId)}
				<div class="cursor-info" style="--cursor-color: {cursor.user.color}">
					<div class="cursor-indicator"></div>
					<Avatar name={cursor.user.name} color={cursor.user.color} size="sm" />
					<div class="cursor-details">
						<strong>{cursor.user.name}</strong>
						<span>Line {cursor.position.line}, Col {cursor.position.column}</span>
						{#if cursor.selection}
							<Badge variant="info">Selecting</Badge>
						{/if}
						<Badge variant="default">Sample</Badge>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- AI Collaboration -->
	<section class="component-section">
		<h2>AI Collaboration Sessions</h2>
		<p class="section-desc">AI assistants can join as collaborators</p>

		<div class="ai-session">
			<div class="session-header">
				<Avatar name="Claude" isAI color={collaborationColors.claude} />
				<div class="session-info">
					<strong>Claude is editing</strong>
					<span>{aiTask}</span>
				</div>
				<Badge variant={sessionActive ? 'info' : 'default'}>
					{sessionActive ? 'Active' : 'Closed'}
				</Badge>
			</div>
			<div class="session-changes">
				{#if sessionChanges.length === 0}
					<div class="change-item">
						<span>No pending changes — the session has been closed.</span>
					</div>
				{:else}
					{#each sessionChanges as change (change.id)}
						{@const badge = statusBadge(change.status)}
						<div class="change-item">
							<Badge variant={badge.variant}>{badge.label}</Badge>
							<span>{changeLabels[change.id] ?? change.explanation ?? change.id}</span>
						</div>
					{/each}
				{/if}
			</div>
			<div class="session-actions">
				{#if sessionActive}
					<Button variant="primary" size="sm" onclick={acceptAll}>Accept All</Button>
					<Button variant="secondary" size="sm" onclick={reviewNext}>Review Next</Button>
					<Button variant="danger" size="sm" onclick={cancelSession}>Cancel Session</Button>
				{:else}
					<Button variant="secondary" size="sm" onclick={restartSession}>Restart Session</Button>
				{/if}
			</div>
		</div>
	</section>

	<!-- CRDT Features -->
	<section class="component-section">
		<h2>CRDT Features</h2>
		<div class="features-list">
			<div class="feature">
				<span class="feature-icon"><Icon name="git-merge" size={20} /></span>
				<div>
					<strong>Conflict-Free</strong>
					<p>CRDT ensures all edits merge correctly without conflicts</p>
				</div>
			</div>
			<div class="feature">
				<span class="feature-icon"><Icon name="link" size={20} /></span>
				<div>
					<strong>Offline Support</strong>
					<p>Edit offline and sync when reconnected</p>
				</div>
			</div>
			<div class="feature">
				<span class="feature-icon"><Icon name="refresh" size={20} /></span>
				<div>
					<strong>Undo/Redo</strong>
					<p>Per-user undo history that respects collaborative edits</p>
				</div>
			</div>
			<div class="feature">
				<span class="feature-icon"><Icon name="users" size={20} /></span>
				<div>
					<strong>Awareness Protocol</strong>
					<p>Share cursor positions, selections, and user state</p>
				</div>
			</div>
			<div class="feature">
				<span class="feature-icon"><Icon name="clock" size={20} /></span>
				<div>
					<strong>Document Snapshots</strong>
					<p>Create and restore document versions</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Store API -->
	<section class="component-section">
		<h2>Collaboration Store API</h2>

		<div class="config-demo">
			<pre><code
					>{`// Initialize collaboration
import { initialize, setLocalCursor } from '$lib/stores/collaboration.svelte';

initialize({
  serverUrl: 'wss://collab.example.com',
  roomId: 'my-document',
  user: {
    id: 'user-123',
    name: 'Alice',
    color: '#4a9eff'
  }
});

// Update local cursor position
setLocalCursor({
  line: 10,
  column: 5
});

// Create a document snapshot (2nd arg is the content to capture)
import { createSnapshot } from '$lib/stores/collaboration.svelte';

createSnapshot('doc-id', currentDocumentText, 'manual');

// AI collaboration session — pass an AI user; returns the session id
import { startAISession, proposeAIChange } from '$lib/stores/collaboration.svelte';

const sessionId = startAISession('doc-id', {
  id: 'claude',
  name: 'Claude',
  color: '#a78bfa'
});

proposeAIChange(sessionId, {
  type: 'replace',
  range: { startLine: 5, startColumn: 0, endLine: 10, endColumn: 0 },
  originalContent: '...',
  proposedContent: '...',
  explanation: 'Converted to async/await syntax'
});`}</code
				></pre>
		</div>
	</section>
</div>

<style>
	.demo-page {
		padding: 2rem 3rem;
		max-width: 1000px;
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

	.status-demo {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
	}

	.status-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.status-controls {
		flex-wrap: wrap;
		border-top: 1px dashed var(--ide-border);
		padding-top: 1rem;
	}

	.status-label {
		font-size: 0.875rem;
		color: var(--ide-text-secondary);
		min-width: 100px;
	}

	.section-desc code {
		font-family: var(--ide-font-mono);
		font-size: 0.8125rem;
		color: var(--ide-text-primary);
		background: var(--ide-bg-tertiary);
		padding: 0.05rem 0.3rem;
		border-radius: 4px;
	}

	.status-value {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--ide-text-muted);
	}

	.status-value[data-status='connected'] .status-dot {
		background: var(--ide-success);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--ide-success) 22%, transparent);
	}

	.status-value[data-status='connecting'] .status-dot {
		background: var(--ide-warning);
	}

	.status-value[data-status='disconnected'] .status-dot {
		background: var(--ide-error);
	}

	.collaborators-list {
		display: flex;
		align-items: center;
	}

	/* Overlapping presence stack with live count */
	.collaborators-list :global(.ide-avatar) {
		margin-left: -0.5rem;
		box-shadow: 0 0 0 2px var(--ide-bg-secondary);
	}

	.collaborators-list :global(.ide-avatar:first-child) {
		margin-left: 0;
	}

	.collab-count {
		margin-left: 0.625rem;
		font-size: 0.75rem;
		color: var(--ide-text-muted);
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-bottom: none;
		border-radius: 8px 8px 0 0;
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.file-name {
		font-size: 0.875rem;
		color: var(--ide-text-primary);
		font-weight: 500;
	}

	.active-users {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.user-cursor {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--cursor-color) 15%, transparent);
		border-radius: 4px;
	}

	.user-name {
		font-size: 0.75rem;
		color: var(--ide-text-secondary);
	}

	.more-users {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
		padding: 0.25rem 0.5rem;
		background: var(--ide-bg-tertiary);
		border-radius: 4px;
	}

	.editor-container {
		height: 350px;
		border: 1px solid var(--ide-border);
		border-radius: 0 0 8px 8px;
		overflow: hidden;
	}

	.editor-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem 1rem;
		margin-top: 0.625rem;
		font-size: 0.75rem;
		color: var(--ide-text-muted);
	}

	.live-caret strong {
		color: var(--ide-text-primary);
		font-variant-numeric: tabular-nums;
	}

	.cursors-demo {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.cursor-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-left: 3px solid var(--cursor-color);
		border-radius: 6px;
	}

	.cursor-info--you {
		background: color-mix(in srgb, var(--ide-interactive) 8%, var(--ide-bg-secondary));
	}

	.cursor-indicator {
		width: 8px;
		height: 8px;
		background: var(--cursor-color);
		border-radius: 50%;
	}

	@media (prefers-reduced-motion: no-preference) {
		.cursor-indicator {
			animation: pulse 1.5s infinite;
		}

		.status-value[data-status='connected'] .status-dot {
			animation: pulse 1.5s infinite;
		}

		@keyframes pulse {
			0%,
			100% {
				opacity: 1;
			}
			50% {
				opacity: 0.5;
			}
		}
	}

	.cursor-details {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.cursor-details strong {
		color: var(--ide-text-primary);
		font-size: 0.875rem;
	}

	.cursor-details span {
		color: var(--ide-text-muted);
		font-size: 0.8125rem;
	}

	.ai-session {
		padding: 1.25rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
	}

	.session-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.session-info {
		flex: 1;
	}

	.session-info strong {
		display: block;
		color: var(--ide-text-primary);
		font-size: 0.875rem;
	}

	.session-info span {
		font-size: 0.8125rem;
		color: var(--ide-text-muted);
	}

	.session-changes {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 0.75rem;
		/* Demote the nested panel: a near-black tint + subtle border instead of the
		   bright ocean (--ide-bg-tertiary), so it reads as a quiet nested list rather
		   than the brightest surface on the card, and the change labels clear AA. */
		background: var(--ide-bg-primary);
		border: 1px solid var(--ide-border);
		border-radius: 6px;
	}

	.change-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.8125rem;
		/* Primary text so labels clear WCAG AA on the nested panel. */
		color: var(--ide-text-primary);
	}

	.session-actions {
		display: flex;
		gap: 0.5rem;
	}

	.features-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.feature {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: var(--ide-bg-secondary);
		border-radius: 8px;
	}

	.feature-icon {
		color: var(--ide-interactive);
		font-size: 1.25rem;
	}

	.feature strong {
		display: block;
		color: var(--ide-text-primary);
		margin-bottom: 0.25rem;
	}

	.feature p {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin: 0;
	}

	.config-demo {
		background: var(--ide-bg-primary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		padding: 1.25rem;
		overflow-x: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--ide-border) transparent;
	}

	.config-demo::-webkit-scrollbar {
		height: 8px;
	}

	.config-demo::-webkit-scrollbar-track {
		background: transparent;
	}

	.config-demo::-webkit-scrollbar-thumb {
		background: var(--ide-border);
		border-radius: 4px;
	}

	.config-demo pre {
		margin: 0;
		/* Keep the fade mask over trailing padding so the last glyph is never clipped */
		padding-right: 1.75rem;
	}

	.config-demo code {
		font-family: var(--ide-font-mono);
		font-size: 0.875rem;
		color: var(--ide-text-primary);
	}

	/* Code block scroll affordance */
	.config-demo {
		-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent 100%);
		mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent 100%);
	}

	/* Tablet -> mobile shift */
	@media (max-width: 860px) {
		.demo-page {
			padding: 1.5rem;
			overflow-x: hidden;
		}

		.editor-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.active-users {
			flex-wrap: wrap;
		}

		.session-actions {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}

		.session-actions :global(button) {
			width: 100%;
			min-height: 44px;
		}

		/* Primary 'Accept All' spans the full width; secondary + destructive
		   share the row below so the danger button is never orphaned. */
		.session-actions :global(button:first-child) {
			grid-column: 1 / -1;
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

		.component-section h2 {
			font-size: 1.25rem;
		}

		.status-row {
			flex-wrap: wrap;
			gap: 0.5rem 0.75rem;
		}

		.status-label {
			min-width: 0;
		}

		.cursor-details {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
		}

		.config-demo code {
			font-size: var(--ide-font-size-xs);
		}
	}
</style>
