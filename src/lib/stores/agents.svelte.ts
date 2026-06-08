/**
 * Agents store using Svelte 5 runes
 * Manages multi-agent coordination and activity tracking
 *
 * Note: Svelte 5 modules cannot directly export $derived values.
 * We use getter functions to expose reactive derived state.
 */

import type {
	Agent,
	AgentStatus,
	AgentTask,
	AgentProgress,
	TeamEvent,
	AgentActivity,
	AgentCursor,
	AgentFilter,
	AgentType,
	VFSEvent,
	VFSIterationCompletedEvent,
	VFSGateProgressEvent
} from '$lib/types';

interface AgentsState {
	// Agent registry
	agents: Map<string, Agent>; // agentId -> agent

	// Team events
	events: TeamEvent[];
	maxEvents: number;

	// Activity feed
	activities: AgentActivity[];
	maxActivities: number;

	// Cursors (for real-time collaboration)
	cursors: Map<string, AgentCursor>; // agentId -> cursor

	// UI state
	selectedAgentId: string | null;
	filter: AgentFilter;

	// Connection
	connected: boolean;
	error: string | null;
}

const state = $state<AgentsState>({
	agents: new Map(),
	events: [],
	maxEvents: 200,
	activities: [],
	maxActivities: 500,
	cursors: new Map(),
	selectedAgentId: null,
	filter: 'all',
	connected: false,
	error: null
});

// Event handlers
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- internal non-reactive event handler registry, not UI state
const eventHandlers = new Map<TeamEvent['type'] | '*', Set<(event: TeamEvent) => void>>();

// ============================================================================
// Getter Functions (Svelte 5 module-safe)
// ============================================================================

export function getAgents(): Agent[] {
	return Array.from(state.agents.values());
}

export function getAgent(agentId: string): Agent | undefined {
	return state.agents.get(agentId);
}

export function getOnlineAgents(): Agent[] {
	return getAgents().filter((a) => a.status === 'online' || a.status === 'busy');
}

export function getOfflineAgents(): Agent[] {
	return getAgents().filter((a) => a.status === 'offline');
}

export function getBusyAgents(): Agent[] {
	return getAgents().filter((a) => a.status === 'busy');
}

export function getStalledAgents(): Agent[] {
	return getAgents().filter((a) => a.status === 'stalled');
}

export function getAgentsByType(type: AgentType): Agent[] {
	return getAgents().filter((a) => a.type === type);
}

export function getAgentsWorkingOnFile(filePath: string): Agent[] {
	return getAgents().filter((a) => a.currentTask?.files.includes(filePath));
}

export function getEvents(): TeamEvent[] {
	return state.events;
}

export function getActivities(): AgentActivity[] {
	return state.activities;
}

export function getActivitiesForAgent(agentId: string): AgentActivity[] {
	return state.activities.filter((a) => a.agentId === agentId);
}

export function getRecentActivities(count: number): AgentActivity[] {
	return state.activities.slice(0, count);
}

export function getCursors(): AgentCursor[] {
	return Array.from(state.cursors.values());
}

export function getCursor(agentId: string): AgentCursor | undefined {
	return state.cursors.get(agentId);
}

export function getCursorsForFile(filePath: string): AgentCursor[] {
	return getCursors().filter((c) => c.filePath === filePath);
}

export function getSelectedAgent(): Agent | undefined {
	return state.selectedAgentId ? state.agents.get(state.selectedAgentId) : undefined;
}

export function getFilter(): AgentFilter {
	return state.filter;
}

export function getConnected(): boolean {
	return state.connected;
}

export function getError(): string | null {
	return state.error;
}

// Derived getters
export function getFilteredAgents(): Agent[] {
	if (state.filter === 'all') return getAgents();
	return getAgents().filter((a) => a.status === state.filter);
}

export function getActiveTasksCount(): number {
	return getAgents().filter((a) => a.currentTask !== undefined).length;
}

export function getTotalProgress(): number {
	const agents = getBusyAgents();
	if (agents.length === 0) return 0;

	const total = agents.reduce((sum, a) => {
		return sum + (a.currentTask?.progress.percentage ?? 0);
	}, 0);

	return Math.round(total / agents.length);
}

export function getAgentCount(): number {
	return state.agents.size;
}

export function getOnlineCount(): number {
	return getOnlineAgents().length;
}

// Legacy aliases for backward compatibility
export const agents = { get current() { return getAgents(); } };
export const onlineAgents = { get current() { return getOnlineAgents(); } };
export const busyAgents = { get current() { return getBusyAgents(); } };
export const events = { get current() { return getEvents(); } };
export const activities = { get current() { return getActivities(); } };
export const cursors = { get current() { return getCursors(); } };
export const selectedAgent = { get current() { return getSelectedAgent(); } };
export const filter = { get current() { return getFilter(); } };
export const connected = { get current() { return getConnected(); } };
export const error = { get current() { return getError(); } };

// ============================================================================
// Agent Operations
// ============================================================================

export function addAgent(agent: Agent): void {
	state.agents.set(agent.id, agent);

	// Create activity
	addActivity({
		id: crypto.randomUUID(),
		agentId: agent.id,
		agent,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
		timestamp: new Date().toISOString(),
		type: 'milestone',
		content: `${agent.name} joined the workspace`,
		metadata: { severity: 'info' }
	});
}

export function removeAgent(agentId: string): void {
	const agent = state.agents.get(agentId);
	if (!agent) return;

	state.agents.delete(agentId);
	state.cursors.delete(agentId);

	// Create activity
	addActivity({
		id: crypto.randomUUID(),
		agentId,
		agent,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
		timestamp: new Date().toISOString(),
		type: 'milestone',
		content: `${agent.name} left the workspace`,
		metadata: { severity: 'info' }
	});
}

export function updateAgent(agentId: string, updates: Partial<Agent>): void {
	const agent = state.agents.get(agentId);
	if (!agent) return;

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
	const updated = { ...agent, ...updates, lastActivity: new Date().toISOString() };
	state.agents.set(agentId, updated);
}

export function setAgentStatus(agentId: string, status: AgentStatus): void {
	updateAgent(agentId, { status });
}

export function setAgentTask(agentId: string, task: AgentTask | undefined): void {
	updateAgent(agentId, { currentTask: task });

	if (task) {
		const agent = state.agents.get(agentId);
		if (agent) {
			addActivity({
				id: crypto.randomUUID(),
				agentId,
				agent,
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
				timestamp: new Date().toISOString(),
				type: 'action',
				content: `Started: ${task.description}`,
				metadata: { files: task.files }
			});
		}
	}
}

export function updateAgentProgress(agentId: string, progress: Partial<AgentProgress>): void {
	const agent = state.agents.get(agentId);
	if (!agent?.currentTask) return;

	const updated: Agent = {
		...agent,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
		lastActivity: new Date().toISOString(),
		currentTask: {
			...agent.currentTask,
			progress: {
				...agent.currentTask.progress,
				...progress,
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
				lastUpdate: new Date().toISOString()
			}
		}
	};

	state.agents.set(agentId, updated);
}

export function completeAgentTask(
	agentId: string,
	result: 'success' | 'failure' | 'partial',
	summary: string
): void {
	const agent = state.agents.get(agentId);
	if (!agent?.currentTask) return;

	// Add completion activity
	addActivity({
		id: crypto.randomUUID(),
		agentId,
		agent,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
		timestamp: new Date().toISOString(),
		type: 'milestone',
		content: summary,
		metadata: {
			severity: result === 'success' ? 'success' : result === 'failure' ? 'error' : 'warning',
			files: agent.currentTask.files
		}
	});

	// Clear task and set status
	updateAgent(agentId, {
		currentTask: undefined,
		status: 'online'
	});
}

// ============================================================================
// Cursor Operations
// ============================================================================

export function updateCursor(cursor: AgentCursor): void {
	state.cursors.set(cursor.agentId, cursor);
}

export function removeCursor(agentId: string): void {
	state.cursors.delete(agentId);
}

export function clearCursorsForFile(filePath: string): void {
	for (const [agentId, cursor] of state.cursors) {
		if (cursor.filePath === filePath) {
			state.cursors.delete(agentId);
		}
	}
}

// ============================================================================
// Event Operations
// ============================================================================

export function addEvent(event: TeamEvent): void {
	state.events = [event, ...state.events].slice(0, state.maxEvents);

	// Notify handlers
	const handlers = eventHandlers.get(event.type);
	if (handlers) {
		handlers.forEach((handler) => handler(event));
	}

	const wildcardHandlers = eventHandlers.get('*');
	if (wildcardHandlers) {
		wildcardHandlers.forEach((handler) => handler(event));
	}

	// Convert to activity
	eventToActivity(event);
}

export function onTeamEvent(
	type: TeamEvent['type'] | '*',
	handler: (event: TeamEvent) => void
): () => void {
	if (!eventHandlers.has(type)) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- internal handler set, not reactive UI state
		eventHandlers.set(type, new Set());
	}
	eventHandlers.get(type)!.add(handler);

	return () => {
		eventHandlers.get(type)?.delete(handler);
	};
}

// ============================================================================
// Activity Operations
// ============================================================================

export function addActivity(activity: AgentActivity): void {
	state.activities = [activity, ...state.activities].slice(0, state.maxActivities);
}

function eventToActivity(event: TeamEvent): void {
	let content: string;
	let type: AgentActivity['type'] = 'action';
	const metadata: AgentActivity['metadata'] = {};

	switch (event.type) {
		case 'work_started':
			content = `Started: ${event.task.description}`;
			type = 'milestone';
			metadata.files = event.task.files;
			break;

		case 'file_modified':
			content = `${event.operation} ${event.path}`;
			metadata.files = [event.path];
			break;

		case 'blocked':
			content = `Blocked: ${event.reason}`;
			type = 'error';
			metadata.severity = 'warning';
			metadata.files = event.blockedFiles;
			break;

		case 'conflict':
			content = `Conflict on ${event.path}`;
			type = 'error';
			metadata.severity = 'error';
			metadata.files = [event.path];
			break;

		case 'task_completed':
			content = `Completed: ${event.task.description} (${event.result})`;
			type = 'milestone';
			metadata.severity = event.result === 'success' ? 'success' : 'warning';
			break;

		case 'agent_joined':
			content = `${event.agent.name} joined`;
			type = 'system';
			break;

		case 'agent_left':
			content = `${event.agent.name} left${event.reason ? `: ${event.reason}` : ''}`;
			type = 'system';
			break;

		case 'progress_update':
			// Don't create activity for progress updates
			return;

		default:
			return;
	}

	addActivity({
		id: crypto.randomUUID(),
		agentId: event.agentId,
		agent: event.agent,
		timestamp: event.timestamp,
		type,
		content,
		metadata
	});
}

// ============================================================================
// UI Operations
// ============================================================================

export function selectAgent(agentId: string | null): void {
	state.selectedAgentId = agentId;
}

export function setFilter(filter: AgentFilter): void {
	state.filter = filter;
}

export function clearActivities(): void {
	state.activities = [];
}

export function clearEvents(): void {
	state.events = [];
}

// ============================================================================
// Integration with VFS Events
// ============================================================================

export function handleVFSEvent(event: VFSEvent): void {
	switch (event.type) {
		case 'iteration_completed': {
			const iterEvent = event as VFSIterationCompletedEvent;
			const agent = state.agents.get(iterEvent.agentId);
			if (agent) {
				updateAgentProgress(iterEvent.agentId, {
					phase: 'complete',
					percentage: 100,
					filesModified: iterEvent.filesModified.length
				});

				addActivity({
					id: crypto.randomUUID(),
					agentId: iterEvent.agentId,
					agent,
					timestamp: iterEvent.timestamp,
					type: 'milestone',
					content: iterEvent.summary,
					metadata: { files: iterEvent.filesModified, severity: 'success' }
				});
			}
			break;
		}

		case 'gate_progress': {
			const gateEvent = event as VFSGateProgressEvent;
			updateAgentProgress(gateEvent.agentId, {
				phase:
					gateEvent.gate === 'implementation'
						? 'implementing'
						: gateEvent.gate === 'review'
							? 'reviewing'
							: gateEvent.gate,
				percentage: gateEvent.progress
			});
			break;
		}
	}
}

// ============================================================================
// Connection Status
// ============================================================================

export function setConnected(connected: boolean): void {
	state.connected = connected;
}

export function setError(error: string | null): void {
	state.error = error;
}

export function clearError(): void {
	state.error = null;
}

// ============================================================================
// Reset
// ============================================================================

export function reset(): void {
	state.agents.clear();
	state.events = [];
	state.activities = [];
	state.cursors.clear();
	state.selectedAgentId = null;
	state.filter = 'all';
	state.connected = false;
	state.error = null;
}

// ============================================================================
// Mock Data (for development)
// ============================================================================

export function addMockAgents(): void {
	const mockAgents: Agent[] = [
		{
			id: 'agent-1',
			name: 'CodeBot',
			type: 'coder',
			status: 'busy',
			capabilities: ['code_generation', 'refactoring'],
			workspaceId: 'ws-1',
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
			joinedAt: new Date().toISOString(),
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
			lastActivity: new Date().toISOString(),
			color: '#F97316',
			currentTask: {
				id: 'task-1',
				description: 'Implementing VFS integration',
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
				startedAt: new Date().toISOString(),
				progress: {
					phase: 'implementing',
					percentage: 65,
					tokensUsed: 12500,
					stepsCompleted: 8,
					totalSteps: 12,
					toolCalls: 24,
					filesModified: 3,
					// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
					lastUpdate: new Date().toISOString()
				},
				files: ['src/lib/stores/vfs.svelte.ts', 'src/lib/types/vfs.ts']
			}
		},
		{
			id: 'agent-2',
			name: 'ReviewBot',
			type: 'reviewer',
			status: 'online',
			capabilities: ['code_review', 'testing'],
			workspaceId: 'ws-1',
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
			joinedAt: new Date().toISOString(),
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
			lastActivity: new Date().toISOString(),
			color: '#8B5CF6'
		},
		{
			id: 'agent-3',
			name: 'TestBot',
			type: 'tester',
			status: 'offline',
			capabilities: ['testing', 'debugging'],
			workspaceId: 'ws-1',
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
			joinedAt: new Date(Date.now() - 3600000).toISOString(),
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient Date used only for toISOString(), not stored as reactive state
			lastActivity: new Date(Date.now() - 300000).toISOString(),
			color: '#10B981'
		}
	];

	for (const agent of mockAgents) {
		state.agents.set(agent.id, agent);
	}
}
