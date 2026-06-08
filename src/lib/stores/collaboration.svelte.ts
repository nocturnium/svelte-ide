/**
 * Collaboration store using Svelte 5 runes
 * Manages CRDT-based real-time collaboration
 *
 * Note: Svelte 5 modules cannot directly export $derived values.
 * We use getter functions to expose reactive derived state.
 */

import type {
	CollaborationConfig,
	CollaborationState,
	CollaborationUser,
	CollaboratorCursor,
	CollaboratorAwareness,
	AICollaborationSession,
	AIProposedChange,
	DocumentSnapshot,
	CollaborationEvent,
	CollaborationEventHandler
} from '$types';

interface CollabState {
	config: CollaborationConfig | null;
	status: CollaborationState['status'];
	error: string | null;
	synced: boolean;
	users: CollaborationUser[];
	cursors: Map<string, CollaboratorCursor>;
	awareness: Map<string, CollaboratorAwareness>;
	aiSessions: AICollaborationSession[];
	pendingChanges: AIProposedChange[];
	snapshots: DocumentSnapshot[];
	localUser: CollaborationUser | null;
}

// Reactive state
const state = $state<CollabState>({
	config: null,
	status: 'disconnected',
	error: null,
	synced: false,
	users: [],
	cursors: new Map(),
	awareness: new Map(),
	aiSessions: [],
	pendingChanges: [],
	snapshots: [],
	localUser: null
});

// Event handlers — non-reactive internal pub/sub registry; never mutated as UI state
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const eventHandlers = new Set<CollaborationEventHandler>();

// Getter functions for derived values (Svelte 5 module-safe)
export function getConfig(): CollaborationConfig | null {
	return state.config;
}

export function getStatus(): CollaborationState['status'] {
	return state.status;
}

export function getError(): string | null {
	return state.error;
}

export function getSynced(): boolean {
	return state.synced;
}

export function getUsers(): CollaborationUser[] {
	return state.users;
}

export function getCursors(): CollaboratorCursor[] {
	return Array.from(state.cursors.values());
}

export function getAwareness(): CollaboratorAwareness[] {
	return Array.from(state.awareness.values());
}

export function getAISessions(): AICollaborationSession[] {
	return state.aiSessions;
}

export function getActiveAISessions(): AICollaborationSession[] {
	return state.aiSessions.filter((s) => s.status === 'active');
}

export function getPendingChanges(): AIProposedChange[] {
	return state.pendingChanges;
}

export function getSnapshots(): DocumentSnapshot[] {
	return state.snapshots;
}

export function getLocalUser(): CollaborationUser | null {
	return state.localUser;
}

export function getIsConnected(): boolean {
	return state.status === 'connected';
}

export function getOtherUsers(): CollaborationUser[] {
	return state.users.filter((u) => u.id !== state.localUser?.id);
}

// Legacy aliases for backward compatibility
export const config = { get current() { return getConfig(); } };
export const status = { get current() { return getStatus(); } };
export const error = { get current() { return getError(); } };
export const synced = { get current() { return getSynced(); } };
export const users = { get current() { return getUsers(); } };
export const cursors = { get current() { return getCursors(); } };
export const awareness = { get current() { return getAwareness(); } };
export const aiSessions = { get current() { return getAISessions(); } };
export const activeAISessions = { get current() { return getActiveAISessions(); } };
export const pendingChanges = { get current() { return getPendingChanges(); } };
export const snapshots = { get current() { return getSnapshots(); } };
export const localUser = { get current() { return getLocalUser(); } };
export const isConnected = { get current() { return getIsConnected(); } };
export const otherUsers = { get current() { return getOtherUsers(); } };

// Collaboration colors for cursors
const CURSOR_COLORS = [
	'var(--ide-collab-cursor-1)',
	'var(--ide-collab-cursor-2)',
	'var(--ide-collab-cursor-3)',
	'var(--ide-collab-cursor-4)',
	'var(--ide-collab-cursor-5)'
];

/**
 * Initialize collaboration with config
 */
export function initialize(collabConfig: CollaborationConfig): void {
	state.config = collabConfig;
	state.localUser = collabConfig.user;
	state.status = 'connecting';
}

/**
 * Set connection status
 */
export function setStatus(newStatus: CollaborationState['status'], errorMsg?: string): void {
	state.status = newStatus;
	state.error = errorMsg ?? null;

	if (newStatus === 'connected') {
		emitEvent({ type: 'connected', users: state.users });
	} else if (newStatus === 'disconnected') {
		emitEvent({ type: 'disconnected', reason: errorMsg });
	}
}

/**
 * Set synced state
 */
export function setSynced(syncedState: boolean): void {
	state.synced = syncedState;
}

/**
 * Add a user to the session
 */
export function addUser(user: CollaborationUser): void {
	// Assign a color if not provided
	if (!user.color) {
		const colorIndex = state.users.length % CURSOR_COLORS.length;
		user = { ...user, color: CURSOR_COLORS[colorIndex] };
	}

	if (!state.users.some((u) => u.id === user.id)) {
		state.users = [...state.users, user];
		emitEvent({ type: 'user_joined', user });
	}
}

/**
 * Remove a user from the session
 */
export function removeUser(userId: string): void {
	state.users = state.users.filter((u) => u.id !== userId);
	state.cursors.delete(userId);
	state.awareness.delete(userId);
	emitEvent({ type: 'user_left', userId });
}

/**
 * Update cursor position for a user
 */
export function updateCursor(cursor: CollaboratorCursor): void {
	state.cursors.set(cursor.userId, cursor);
	emitEvent({ type: 'cursor_moved', cursor });
}

/**
 * Update awareness for a user
 */
export function updateAwareness(awarenessData: CollaboratorAwareness): void {
	state.awareness.set(awarenessData.userId, awarenessData);
}

/**
 * Update local user's cursor
 */
export function setLocalCursor(
	position: { line: number; column: number },
	selection?: { anchor: { line: number; column: number }; head: { line: number; column: number } }
): void {
	if (!state.localUser) return;

	const cursor: CollaboratorCursor = {
		userId: state.localUser.id,
		user: state.localUser,
		position,
		selection,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		lastActivity: new Date()
	};

	state.cursors.set(state.localUser.id, cursor);
}

/**
 * Update local user's awareness
 */
export function setLocalAwareness(updates: Partial<Omit<CollaboratorAwareness, 'userId' | 'user'>>): void {
	if (!state.localUser) return;

	const current = state.awareness.get(state.localUser.id);
	const awarenessData: CollaboratorAwareness = {
		...current,
		userId: state.localUser.id,
		user: state.localUser,
		state: 'active',
		...updates
	};

	state.awareness.set(state.localUser.id, awarenessData);
}

/**
 * Start an AI collaboration session
 */
export function startAISession(documentId: string, aiUser: CollaborationUser): string {
	const id = crypto.randomUUID();
	const session: AICollaborationSession = {
		id,
		documentId,
		status: 'pending',
		aiUser: { ...aiUser, isAI: true, color: 'var(--ide-collab-ai)' },
		humanUsers: state.users.filter((u) => !u.isAI),
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		startedAt: new Date(),
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		updatedAt: new Date()
	};

	state.aiSessions = [...state.aiSessions, session];

	// Add AI as a user
	addUser(session.aiUser);

	emitEvent({ type: 'ai_edit_started', session });
	return id;
}

/**
 * Update AI session status
 */
export function updateAISession(sessionId: string, updates: Partial<AICollaborationSession>): void {
	state.aiSessions = state.aiSessions.map((s) =>
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		s.id === sessionId ? { ...s, ...updates, updatedAt: new Date() } : s
	);
}

/**
 * Set current task for AI session
 */
export function setAITask(sessionId: string, task: string): void {
	updateAISession(sessionId, { currentTask: task, status: 'active' });
}

/**
 * Propose a change from AI
 */
export function proposeAIChange(
	sessionId: string,
	change: Omit<AIProposedChange, 'id' | 'sessionId' | 'status'>
): string {
	const id = crypto.randomUUID();
	const proposedChange: AIProposedChange = {
		...change,
		id,
		sessionId,
		status: 'pending'
	};

	state.pendingChanges = [...state.pendingChanges, proposedChange];
	emitEvent({ type: 'ai_edit_proposed', change: proposedChange });
	return id;
}

/**
 * Review an AI proposed change
 */
export function reviewAIChange(
	changeId: string,
	approved: boolean,
	reviewerId: string
): void {
	state.pendingChanges = state.pendingChanges.map((c) =>
		c.id === changeId
			? {
					...c,
					status: approved ? 'approved' : 'rejected',
					reviewedBy: reviewerId,
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					reviewedAt: new Date()
				}
			: c
	);
}

/**
 * Complete an AI session
 */
export function completeAISession(sessionId: string): void {
	const session = state.aiSessions.find((s) => s.id === sessionId);
	if (!session) return;

	updateAISession(sessionId, { status: 'completed' });

	// Remove AI user
	removeUser(session.aiUser.id);

	// Clear pending changes for this session
	state.pendingChanges = state.pendingChanges.filter((c) => c.sessionId !== sessionId);

	emitEvent({ type: 'ai_edit_completed', sessionId });
}

/**
 * Cancel an AI session
 */
export function cancelAISession(sessionId: string): void {
	const session = state.aiSessions.find((s) => s.id === sessionId);
	if (!session) return;

	updateAISession(sessionId, { status: 'cancelled' });
	removeUser(session.aiUser.id);

	// Reject all pending changes for this session
	state.pendingChanges = state.pendingChanges.map((c) =>
		c.sessionId === sessionId ? { ...c, status: 'rejected' } : c
	);
}

/**
 * Create a document snapshot
 */
export function createSnapshot(
	documentId: string,
	content: string,
	reason: DocumentSnapshot['reason'] = 'manual'
): string {
	const id = crypto.randomUUID();
	const snapshot: DocumentSnapshot = {
		id,
		documentId,
		content,
		version: state.snapshots.filter((s) => s.documentId === documentId).length + 1,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		createdAt: new Date(),
		createdBy: state.localUser!,
		reason
	};

	state.snapshots = [...state.snapshots, snapshot];
	emitEvent({ type: 'snapshot_created', snapshot });
	return id;
}

/**
 * Get snapshots for a document
 */
export function getDocumentSnapshots(documentId: string): DocumentSnapshot[] {
	return state.snapshots.filter((s) => s.documentId === documentId);
}

/**
 * Subscribe to collaboration events
 */
export function onEvent(handler: CollaborationEventHandler): () => void {
	eventHandlers.add(handler);
	return () => eventHandlers.delete(handler);
}

/**
 * Emit a collaboration event
 */
function emitEvent(event: CollaborationEvent): void {
	eventHandlers.forEach((handler) => handler(event));
}

/**
 * Disconnect and cleanup
 */
export function disconnect(): void {
	state.status = 'disconnected';
	state.users = [];
	state.cursors.clear();
	state.awareness.clear();
	state.synced = false;
}

/**
 * Reset collaboration state
 */
export function reset(): void {
	disconnect();
	state.config = null;
	state.localUser = null;
	state.aiSessions = [];
	state.pendingChanges = [];
	state.snapshots = [];
	state.error = null;
}

/**
 * Get user color by index
 */
export function getUserColor(index: number): string {
	return CURSOR_COLORS[index % CURSOR_COLORS.length];
}
