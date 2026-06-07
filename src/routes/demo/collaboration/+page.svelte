<script lang="ts">
	import CollaborativeEditor from '$lib/components/editor/CollaborativeEditor.svelte';
	import Avatar from '$lib/components/core/Avatar.svelte';
	import Badge from '$lib/components/core/Badge.svelte';
	import Button from '$lib/components/core/Button.svelte';
	import Icon from '$lib/components/core/Icon.svelte';
	import type { CollaborationUser, CollaboratorCursor } from '$lib/types/crdt';

	// Sample collaborators
	const collaborators: CollaborationUser[] = [
		{ id: '1', name: 'Alice', color: '#4a9eff', isAI: false },
		{ id: '2', name: 'Bob', color: '#22c55e', isAI: false },
		{ id: '3', name: 'Charlie', color: '#f59e0b', isAI: false },
		{ id: '4', name: 'Claude', color: '#a855f7', isAI: true }
	];

	// Sample cursors
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

	let connectionStatus = $state<'disconnected' | 'connecting' | 'connected'>('connected');
	let synced = $state(true);

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
</script>

<div class="demo-page">
	<header class="page-header">
		<h1>Real-time Collaboration</h1>
		<p>CRDT-based collaborative editing with Yjs</p>
	</header>

	<!-- Status Bar -->
	<section class="component-section">
		<h2>Connection Status</h2>
		<p class="section-desc">Real-time sync status indicators</p>

		<div class="status-demo">
			<div class="status-row">
				<span class="status-label">Status:</span>
				<Badge variant={connectionStatus === 'connected' ? 'success' : 'warning'}>
					{connectionStatus}
				</Badge>
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
					{#each collaborators as user}
						<Avatar name={user.name} color={user.color} isAI={user.isAI} size="sm" />
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- Collaborative Editor -->
	<section class="component-section">
		<h2>Collaborative Editor</h2>
		<p class="section-desc">Real-time multi-user editing with cursor awareness</p>

		<div class="editor-header">
			<div class="file-info">
				<span class="file-name">collaboration.ts</span>
				<Badge variant="success">Synced</Badge>
			</div>
			<div class="active-users">
				{#each collaborators.slice(0, 3) as user}
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
			/>
		</div>
	</section>

	<!-- Cursor Visualization -->
	<section class="component-section">
		<h2>Cursor Awareness</h2>
		<p class="section-desc">See where other users are editing</p>

		<div class="cursors-demo">
			{#each cursors as cursor}
				<div class="cursor-info" style="--cursor-color: {cursor.user.color}">
					<div class="cursor-indicator"></div>
					<Avatar name={cursor.user.name} color={cursor.user.color} size="sm" />
					<div class="cursor-details">
						<strong>{cursor.user.name}</strong>
						<span>Line {cursor.position.line}, Col {cursor.position.column}</span>
						{#if cursor.selection}
							<Badge variant="info">Selecting</Badge>
						{/if}
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
				<Avatar name="Claude" isAI color="#a855f7" />
				<div class="session-info">
					<strong>Claude is editing</strong>
					<span>Refactoring fetchUserData function</span>
				</div>
				<Badge variant="info">Active</Badge>
			</div>
			<div class="session-changes">
				<div class="change-item">
					<Badge variant="warning">Pending</Badge>
					<span>Convert to async/await</span>
				</div>
				<div class="change-item">
					<Badge variant="warning">Pending</Badge>
					<span>Add error handling</span>
				</div>
				<div class="change-item">
					<Badge variant="success">Accepted</Badge>
					<span>Add TypeScript types</span>
				</div>
			</div>
			<div class="session-actions">
				<Button variant="primary" size="sm">Accept All</Button>
				<Button variant="ghost" size="sm">Review Changes</Button>
				<Button variant="danger" size="sm">Cancel Session</Button>
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
			<pre><code>{`// Initialize collaboration
import { initialize, setLocalCursor } from '$lib/stores/collaboration.svelte';

await initialize({
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

// Create document snapshot
import { createSnapshot } from '$lib/stores/collaboration.svelte';

await createSnapshot('doc-id', 'Before refactoring');

// AI collaboration session
import { startAISession, proposeAIChange } from '$lib/stores/collaboration.svelte';

const session = await startAISession('doc-id', {
  task: 'Refactor to async/await'
});

proposeAIChange(session.id, {
  type: 'replace',
  range: { start: { line: 5, column: 0 }, end: { line: 10, column: 0 } },
  originalContent: '...',
  proposedContent: '...',
  explanation: 'Converted to async/await syntax'
});`}</code></pre>
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

	.status-label {
		font-size: 0.875rem;
		color: var(--ide-text-secondary);
		min-width: 100px;
	}

	.collaborators-list {
		display: flex;
		gap: 0.5rem;
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
		background: var(--ide-bg-tertiary);
		border-radius: 6px;
	}

	.change-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.8125rem;
		color: var(--ide-text-secondary);
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
		color: var(--color-nocturnium-wave);
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
		background: var(--ide-bg-tertiary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		padding: 1.25rem;
		overflow-x: auto;
	}

	.config-demo pre {
		margin: 0;
	}

	.config-demo code {
		font-family: var(--ide-font-mono);
		font-size: 0.875rem;
		color: var(--ide-text-primary);
	}

	/* Code block scroll affordance */
	.config-demo {
		-webkit-mask-image: linear-gradient(
			to right,
			#000 calc(100% - 1.5rem),
			transparent 100%
		);
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
			flex-wrap: wrap;
		}

		.session-actions :global(button) {
			flex: 1 1 auto;
			min-height: 44px;
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
