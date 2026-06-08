/**
 * IDE Integration Service
 *
 * Coordinates VFS, Agents, and Collaboration stores into a unified system.
 * Handles cross-store communication and event routing.
 */

import * as vfsStore from '$lib/stores/vfs.svelte';
import * as agentsStore from '$lib/stores/agents.svelte';
import * as collabStore from '$lib/stores/collaboration.svelte';
import type {
	VFSEvent,
	VFSFileLock,
	VFSUpdateEvent,
	VFSLockAcquiredEvent,
	VFSLockReleasedEvent,
	Agent,
	AgentCursor,
	TeamEvent,
	CollaborationUser
} from '$lib/types';

// ============================================================================
// Types
// ============================================================================

export interface IDEIntegrationConfig {
	workspaceId: string;
	userId: string;
	userName: string;
	vfsEndpoint?: string;
	enableAgentSync?: boolean;
	enableCollaboration?: boolean;
}

export interface IDEContext {
	workspaceId: string;
	userId: string;
	userName: string;
	connected: boolean;
	synced: boolean;
}

type Unsubscribe = () => void;

// ============================================================================
// State
// ============================================================================

let config: IDEIntegrationConfig | null = null;
let subscriptions: Unsubscribe[] = [];
let initialized = false;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the IDE integration layer
 * Connects all stores and sets up event routing
 */
export function initialize(integrationConfig: IDEIntegrationConfig): void {
	if (initialized) {
		cleanup();
	}

	config = integrationConfig;

	// Initialize VFS store
	vfsStore.initialize(config.userId, config.workspaceId);

	// Initialize collaboration if enabled
	if (config.enableCollaboration !== false) {
		const collabUser: CollaborationUser = {
			id: config.userId,
			name: config.userName,
			isAI: false,
			color: 'var(--ide-collab-cursor-1)'
		};

		collabStore.initialize({
			user: collabUser,
			roomId: config.workspaceId,
			serverUrl: config.vfsEndpoint ?? '/api/collab'
		});
	}

	// Set up event routing
	setupEventRouting();

	initialized = true;
}

/**
 * Set up cross-store event routing
 */
function setupEventRouting(): void {
	// Route VFS events to agents store
	const vfsUnsub = vfsStore.onEvent('*', (event) => {
		handleVFSEvent(event);
	});
	subscriptions.push(vfsUnsub);

	// Route team events to collaboration
	const teamUnsub = agentsStore.onTeamEvent('*', (event) => {
		handleTeamEvent(event);
	});
	subscriptions.push(teamUnsub);

	// Route collaboration events to agents
	const collabUnsub = collabStore.onEvent((event) => {
		handleCollabEvent(event);
	});
	subscriptions.push(collabUnsub);
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle VFS events and route to appropriate stores
 */
function handleVFSEvent(event: VFSEvent): void {
	// Forward agent-related events to agents store
	agentsStore.handleVFSEvent(event);

	switch (event.type) {
		case 'update': {
			const updateEvent = event as VFSUpdateEvent;
			// If update is from an agent, create team event
			if (updateEvent.actorType === 'agent') {
				const agent = agentsStore.getAgent(updateEvent.actor);
				if (agent) {
					const operation = updateEvent.operation;
					const operationPath = operation.type === 'rename' ? operation.newPath : operation.path;
					agentsStore.addEvent({
						id: crypto.randomUUID(),
						timestamp: updateEvent.timestamp,
						workspaceId: event.workspaceId,
						agentId: updateEvent.actor,
						agent,
						type: 'file_modified',
						path: operationPath,
						operation: operation.type as 'create' | 'update' | 'delete' | 'rename',
						lockAcquired: vfsStore.isLockedByMe(operationPath)
					});
				}
			}
			break;
		}

		case 'lock_acquired': {
			const lockEvent = event as VFSLockAcquiredEvent;
			// If lock acquired by agent, update agent status
			if (lockEvent.lock.holderType === 'agent') {
				agentsStore.setAgentStatus(lockEvent.lock.holder, 'busy');
			}
			break;
		}

		case 'lock_released': {
			const releaseEvent = event as VFSLockReleasedEvent;
			// Check if agent should return to online status
			const agent = agentsStore.getAgent(releaseEvent.holder);
			if (agent && agent.status === 'busy' && !agent.currentTask) {
				agentsStore.setAgentStatus(releaseEvent.holder, 'online');
			}
			break;
		}
	}
}

/**
 * Handle team events and route to collaboration
 */
function handleTeamEvent(event: TeamEvent): void {
	if (!config?.enableCollaboration) return;

	switch (event.type) {
		case 'agent_joined': {
			// Add agent as collaboration user
			const collabUser: CollaborationUser = {
				id: event.agent.id,
				name: event.agent.name,
				isAI: true,
				color: event.agent.color ?? 'var(--ide-collab-ai)'
			};
			collabStore.addUser(collabUser);
			break;
		}

		case 'agent_left': {
			collabStore.removeUser(event.agentId);
			break;
		}

		case 'work_started': {
			// Start AI collaboration session
			const aiUser: CollaborationUser = {
				id: event.agent.id,
				name: event.agent.name,
				isAI: true,
				color: event.agent.color ?? 'var(--ide-collab-ai)'
			};
			const sessionId = collabStore.startAISession(config!.workspaceId, aiUser);
			collabStore.setAITask(sessionId, event.task.description);
			break;
		}

		case 'task_completed': {
			// Find and complete the AI session
			const sessions = collabStore.getAISessions();
			const session = sessions.find((s) => s.aiUser.id === event.agentId && s.status === 'active');
			if (session) {
				collabStore.completeAISession(session.id);
			}
			break;
		}
	}
}

/**
 * Handle collaboration events
 */
function handleCollabEvent(event: { type: string; [key: string]: unknown }): void {
	// Map collaboration events back to agent store if needed
	switch (event.type) {
		case 'user_joined': {
			const user = event.user as CollaborationUser;
			if (user.isAI) {
				// An AI joined via collaboration - register as agent
				const existingAgent = agentsStore.getAgent(user.id);
				if (!existingAgent) {
					agentsStore.addAgent({
						id: user.id,
						name: user.name,
						type: 'coder',
						status: 'online',
						capabilities: ['code_generation'],
						workspaceId: config?.workspaceId ?? '',
						joinedAt: new Date().toISOString(),
						lastActivity: new Date().toISOString(),
						color: user.color
					});
				}
			}
			break;
		}

		case 'user_left': {
			const userId = event.userId as string;
			const agent = agentsStore.getAgent(userId);
			if (agent) {
				agentsStore.removeAgent(userId);
			}
			break;
		}

		case 'cursor_moved': {
			// Convert collaboration cursor to agent cursor if from AI
			const cursor = event.cursor as { userId: string; position: { line: number; column: number } };
			const user = collabStore.getUsers().find((u) => u.id === cursor.userId);
			if (user?.isAI) {
				const agent = agentsStore.getAgent(cursor.userId);
				if (agent) {
					agentsStore.updateCursor({
						agentId: cursor.userId,
						agent,
						filePath: config?.workspaceId ?? '', // Would need actual file path
						position: cursor.position,
						lastUpdate: new Date().toISOString()
					});
				}
			}
			break;
		}
	}
}

// ============================================================================
// Agent Cursor Sync
// ============================================================================

/**
 * Update agent cursor position (called from editor)
 */
export function updateAgentCursorPosition(
	agentId: string,
	filePath: string,
	position: { line: number; column: number },
	selection?: { start: { line: number; column: number }; end: { line: number; column: number } }
): void {
	const agent = agentsStore.getAgent(agentId);
	if (!agent) return;

	const cursor: AgentCursor = {
		agentId,
		agent,
		filePath,
		position,
		selection,
		lastUpdate: new Date().toISOString()
	};

	agentsStore.updateCursor(cursor);

	// Also update collaboration cursors
	if (config?.enableCollaboration) {
		collabStore.updateCursor({
			userId: agentId,
			user: {
				id: agent.id,
				name: agent.name,
				isAI: true,
				color: agent.color ?? 'var(--ide-collab-ai)'
			},
			position,
			selection: selection
				? {
						anchor: selection.start,
						head: selection.end
					}
				: undefined,
			lastActivity: new Date()
		});
	}
}

// ============================================================================
// Lock Coordination
// ============================================================================

/**
 * Acquire lock with agent awareness
 */
export async function acquireLockWithContext(
	filePath: string,
	purpose?: VFSFileLock['purpose']
): Promise<VFSFileLock | null> {
	const lock = await vfsStore.acquireLock(filePath, purpose);

	if (lock) {
		// Notify collaboration that we're editing this file
		if (config?.enableCollaboration) {
			collabStore.setLocalAwareness({
				editingFile: filePath,
				state: 'active'
			});
		}
	}

	return lock;
}

/**
 * Release lock with cleanup
 */
export async function releaseLockWithContext(filePath: string): Promise<void> {
	await vfsStore.releaseLock(filePath);

	// Update awareness
	if (config?.enableCollaboration) {
		collabStore.setLocalAwareness({
			editingFile: undefined,
			state: 'idle'
		});
	}
}

/**
 * Check if file can be edited (not locked by others)
 */
export function canEditFile(filePath: string): boolean {
	const lockStatus = vfsStore.getLockStatus(filePath);

	if (lockStatus.status === 'unlocked') return true;
	if (lockStatus.status === 'locked') {
		return lockStatus.lock.holder === config?.userId;
	}

	return false;
}

/**
 * Get agents currently editing a file
 */
export function getFileEditors(filePath: string): Agent[] {
	return agentsStore.getAgentsWorkingOnFile(filePath);
}

// ============================================================================
// Context Getters
// ============================================================================

/**
 * Get current IDE context
 */
export function getContext(): IDEContext | null {
	if (!config) return null;

	return {
		workspaceId: config.workspaceId,
		userId: config.userId,
		userName: config.userName,
		connected: vfsStore.getConnected() && collabStore.getIsConnected(),
		synced: collabStore.getSynced()
	};
}

/**
 * Get all online agents
 */
export function getOnlineAgents(): Agent[] {
	return agentsStore.getOnlineAgents();
}

/**
 * Get all locks
 */
export function getAllLocks(): VFSFileLock[] {
	return vfsStore.getLocks();
}

/**
 * Get lock for specific file
 */
export function getFileLock(filePath: string): VFSFileLock | undefined {
	return vfsStore.getLock(filePath);
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup all subscriptions and reset state
 */
export function cleanup(): void {
	// Unsubscribe all
	subscriptions.forEach((unsub) => unsub());
	subscriptions = [];

	// Reset stores
	vfsStore.reset();
	agentsStore.reset();
	collabStore.reset();

	config = null;
	initialized = false;
}

/**
 * Check if integration is initialized
 */
export function isInitialized(): boolean {
	return initialized;
}
