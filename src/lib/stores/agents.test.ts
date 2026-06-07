import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as agents from './agents.svelte';

/**
 * Agents store tests
 *
 * Covers agent CRUD, status management, task lifecycle, cursor tracking,
 * event handling, activity feed, filtering, and reset.
 */

let uuidCounter = 0;
vi.stubGlobal('crypto', {
	randomUUID: () => `agent-uuid-${++uuidCounter}`
});

beforeEach(() => {
	uuidCounter = 0;
	agents.reset();
});

// ============================================================================
// Helpers
// ============================================================================

function makeAgent(id: string, overrides: Partial<any> = {}): any {
	return {
		id,
		name: `Agent-${id}`,
		type: 'coder',
		status: 'online',
		capabilities: ['code_generation'],
		workspaceId: 'ws-1',
		joinedAt: '2025-01-01T00:00:00Z',
		lastActivity: '2025-01-01T00:00:00Z',
		color: '#F97316',
		...overrides
	};
}

function makeTask(overrides: Partial<any> = {}): any {
	return {
		id: 'task-1',
		description: 'Test task',
		startedAt: '2025-01-01T00:00:00Z',
		progress: {
			phase: 'implementing',
			percentage: 0,
			tokensUsed: 0,
			stepsCompleted: 0,
			totalSteps: 10,
			toolCalls: 0,
			filesModified: 0,
			lastUpdate: '2025-01-01T00:00:00Z'
		},
		files: ['/src/main.ts'],
		...overrides
	};
}

// ============================================================================
// Default state
// ============================================================================

describe('agents store — default state', () => {
	it('has no agents', () => {
		expect(agents.getAgents()).toEqual([]);
		expect(agents.getAgentCount()).toBe(0);
	});

	it('has no events', () => {
		expect(agents.getEvents()).toEqual([]);
	});

	it('has no activities', () => {
		expect(agents.getActivities()).toEqual([]);
	});

	it('has no cursors', () => {
		expect(agents.getCursors()).toEqual([]);
	});

	it('has no selected agent', () => {
		expect(agents.getSelectedAgent()).toBeUndefined();
	});

	it('filter is all', () => {
		expect(agents.getFilter()).toBe('all');
	});

	it('is not connected', () => {
		expect(agents.getConnected()).toBe(false);
	});

	it('has no error', () => {
		expect(agents.getError()).toBe(null);
	});
});

// ============================================================================
// Agent CRUD
// ============================================================================

describe('agents store — agent CRUD', () => {
	it('addAgent registers an agent', () => {
		agents.addAgent(makeAgent('a1'));
		expect(agents.getAgents()).toHaveLength(1);
		expect(agents.getAgent('a1')?.name).toBe('Agent-a1');
	});

	it('addAgent creates an activity entry', () => {
		agents.addAgent(makeAgent('a1'));
		expect(agents.getActivities()).toHaveLength(1);
		expect(agents.getActivities()[0].content).toContain('joined');
	});

	it('removeAgent deletes an agent', () => {
		agents.addAgent(makeAgent('a1'));
		agents.removeAgent('a1');
		expect(agents.getAgents()).toHaveLength(0);
		expect(agents.getAgent('a1')).toBeUndefined();
	});

	it('removeAgent also removes cursor', () => {
		agents.addAgent(makeAgent('a1'));
		agents.updateCursor({ agentId: 'a1', filePath: '/src/a.ts', position: { line: 1, column: 1 } } as any);
		agents.removeAgent('a1');
		expect(agents.getCursor('a1')).toBeUndefined();
	});

	it('removeAgent creates a left activity', () => {
		agents.addAgent(makeAgent('a1'));
		agents.removeAgent('a1');
		const leftActivity = agents.getActivities().find(a => a.content.includes('left'));
		expect(leftActivity).toBeDefined();
	});

	it('removeAgent does nothing for unknown agent', () => {
		agents.removeAgent('nonexistent');
		expect(agents.getActivities()).toHaveLength(0);
	});

	it('updateAgent merges updates', () => {
		agents.addAgent(makeAgent('a1'));
		agents.updateAgent('a1', { status: 'busy' as any });
		expect(agents.getAgent('a1')?.status).toBe('busy');
	});

	it('updateAgent sets lastActivity', () => {
		agents.addAgent(makeAgent('a1', { lastActivity: '2020-01-01T00:00:00Z' }));
		agents.updateAgent('a1', { status: 'busy' as any });
		expect(agents.getAgent('a1')?.lastActivity).not.toBe('2020-01-01T00:00:00Z');
	});

	it('updateAgent does nothing for unknown agent', () => {
		agents.updateAgent('nonexistent', { status: 'busy' as any });
		// Should not throw
	});
});

// ============================================================================
// Agent status and filtering
// ============================================================================

describe('agents store — status and filtering', () => {
	beforeEach(() => {
		agents.addAgent(makeAgent('a1', { status: 'online' }));
		agents.addAgent(makeAgent('a2', { status: 'busy' }));
		agents.addAgent(makeAgent('a3', { status: 'offline' }));
		agents.addAgent(makeAgent('a4', { status: 'stalled' }));
	});

	it('getOnlineAgents returns online and busy agents', () => {
		expect(agents.getOnlineAgents()).toHaveLength(2);
	});

	it('getOfflineAgents returns only offline', () => {
		expect(agents.getOfflineAgents()).toHaveLength(1);
		expect(agents.getOfflineAgents()[0].id).toBe('a3');
	});

	it('getBusyAgents returns only busy', () => {
		expect(agents.getBusyAgents()).toHaveLength(1);
		expect(agents.getBusyAgents()[0].id).toBe('a2');
	});

	it('getStalledAgents returns only stalled', () => {
		expect(agents.getStalledAgents()).toHaveLength(1);
		expect(agents.getStalledAgents()[0].id).toBe('a4');
	});

	it('getAgentsByType filters by type', () => {
		agents.addAgent(makeAgent('a5', { type: 'reviewer' }));
		expect(agents.getAgentsByType('reviewer' as any)).toHaveLength(1);
		expect(agents.getAgentsByType('coder' as any)).toHaveLength(4);
	});

	it('setAgentStatus updates agent status', () => {
		agents.setAgentStatus('a1', 'busy' as any);
		expect(agents.getAgent('a1')?.status).toBe('busy');
	});

	it('getFilteredAgents returns all when filter is all', () => {
		expect(agents.getFilteredAgents()).toHaveLength(4);
	});

	it('setFilter changes filter and getFilteredAgents respects it', () => {
		agents.setFilter('busy' as any);
		expect(agents.getFilter()).toBe('busy');
		expect(agents.getFilteredAgents()).toHaveLength(1);
	});

	it('getOnlineCount returns count of online+busy', () => {
		expect(agents.getOnlineCount()).toBe(2);
	});

	it('getAgentCount returns total count', () => {
		expect(agents.getAgentCount()).toBe(4);
	});
});

// ============================================================================
// Task management
// ============================================================================

describe('agents store — task management', () => {
	beforeEach(() => {
		agents.addAgent(makeAgent('a1'));
	});

	it('setAgentTask assigns a task', () => {
		const task = makeTask();
		agents.setAgentTask('a1', task);
		expect(agents.getAgent('a1')?.currentTask).toBeDefined();
		expect(agents.getAgent('a1')?.currentTask?.description).toBe('Test task');
	});

	it('setAgentTask creates an activity when task is set', () => {
		const activitiesBefore = agents.getActivities().length;
		agents.setAgentTask('a1', makeTask());
		expect(agents.getActivities().length).toBeGreaterThan(activitiesBefore);
	});

	it('setAgentTask can clear task with undefined', () => {
		agents.setAgentTask('a1', makeTask());
		agents.setAgentTask('a1', undefined);
		expect(agents.getAgent('a1')?.currentTask).toBeUndefined();
	});

	it('updateAgentProgress updates task progress', () => {
		agents.setAgentTask('a1', makeTask());
		agents.updateAgentProgress('a1', { percentage: 50, stepsCompleted: 5 });
		expect(agents.getAgent('a1')?.currentTask?.progress.percentage).toBe(50);
		expect(agents.getAgent('a1')?.currentTask?.progress.stepsCompleted).toBe(5);
	});

	it('updateAgentProgress does nothing without task', () => {
		agents.updateAgentProgress('a1', { percentage: 50 });
		// Should not throw
	});

	it('completeAgentTask clears task and sets status to online', () => {
		agents.setAgentTask('a1', makeTask());
		agents.updateAgent('a1', { status: 'busy' as any });
		agents.completeAgentTask('a1', 'success', 'Task completed');
		expect(agents.getAgent('a1')?.currentTask).toBeUndefined();
		expect(agents.getAgent('a1')?.status).toBe('online');
	});

	it('completeAgentTask creates a milestone activity', () => {
		agents.setAgentTask('a1', makeTask());
		const before = agents.getActivities().length;
		agents.completeAgentTask('a1', 'success', 'Done!');
		expect(agents.getActivities().length).toBeGreaterThan(before);
		expect(agents.getActivities()[0].content).toBe('Done!');
	});

	it('getActiveTasksCount counts agents with tasks', () => {
		expect(agents.getActiveTasksCount()).toBe(0);
		agents.setAgentTask('a1', makeTask());
		expect(agents.getActiveTasksCount()).toBe(1);
	});

	it('getAgentsWorkingOnFile finds agents by file', () => {
		agents.setAgentTask('a1', makeTask({ files: ['/src/main.ts'] }));
		expect(agents.getAgentsWorkingOnFile('/src/main.ts')).toHaveLength(1);
		expect(agents.getAgentsWorkingOnFile('/src/other.ts')).toHaveLength(0);
	});

	it('getTotalProgress averages busy agent progress', () => {
		agents.addAgent(makeAgent('a2', { status: 'busy' }));
		agents.setAgentTask('a1', makeTask());
		agents.updateAgent('a1', { status: 'busy' as any });
		agents.updateAgentProgress('a1', { percentage: 60 });
		agents.setAgentTask('a2', makeTask());
		agents.updateAgentProgress('a2', { percentage: 80 });
		expect(agents.getTotalProgress()).toBe(70);
	});

	it('getTotalProgress returns 0 with no busy agents', () => {
		expect(agents.getTotalProgress()).toBe(0);
	});
});

// ============================================================================
// Cursor operations
// ============================================================================

describe('agents store — cursors', () => {
	it('updateCursor adds/updates a cursor', () => {
		const cursor = { agentId: 'a1', filePath: '/src/a.ts', position: { line: 1, column: 1 } } as any;
		agents.updateCursor(cursor);
		expect(agents.getCursors()).toHaveLength(1);
		expect(agents.getCursor('a1')).toEqual(cursor);
	});

	it('removeCursor removes a cursor', () => {
		agents.updateCursor({ agentId: 'a1', filePath: '/src/a.ts', position: { line: 1, column: 1 } } as any);
		agents.removeCursor('a1');
		expect(agents.getCursors()).toHaveLength(0);
	});

	it('getCursorsForFile filters by file path', () => {
		agents.updateCursor({ agentId: 'a1', filePath: '/src/a.ts', position: { line: 1, column: 1 } } as any);
		agents.updateCursor({ agentId: 'a2', filePath: '/src/b.ts', position: { line: 1, column: 1 } } as any);
		expect(agents.getCursorsForFile('/src/a.ts')).toHaveLength(1);
	});

	it('clearCursorsForFile removes all cursors for a file', () => {
		agents.updateCursor({ agentId: 'a1', filePath: '/src/a.ts', position: { line: 1, column: 1 } } as any);
		agents.updateCursor({ agentId: 'a2', filePath: '/src/a.ts', position: { line: 2, column: 1 } } as any);
		agents.updateCursor({ agentId: 'a3', filePath: '/src/b.ts', position: { line: 1, column: 1 } } as any);
		agents.clearCursorsForFile('/src/a.ts');
		expect(agents.getCursors()).toHaveLength(1);
		expect(agents.getCursorsForFile('/src/a.ts')).toHaveLength(0);
	});
});

// ============================================================================
// Event operations
// ============================================================================

describe('agents store — events', () => {
	it('addEvent pushes to event list', () => {
		const event = {
			type: 'agent_joined',
			agentId: 'a1',
			agent: makeAgent('a1'),
			timestamp: '2025-01-01T00:00:00Z'
		} as any;
		agents.addEvent(event);
		expect(agents.getEvents()).toHaveLength(1);
	});

	it('events are capped at maxEvents (200)', () => {
		for (let i = 0; i < 210; i++) {
			agents.addEvent({
				type: 'progress_update',
				agentId: 'a1',
				agent: makeAgent('a1'),
				timestamp: '2025-01-01T00:00:00Z'
			} as any);
		}
		expect(agents.getEvents().length).toBeLessThanOrEqual(200);
	});

	it('onTeamEvent subscribes to specific event types', () => {
		const handler = vi.fn();
		const unsub = agents.onTeamEvent('agent_joined', handler);

		agents.addEvent({
			type: 'agent_joined',
			agentId: 'a1',
			agent: makeAgent('a1'),
			timestamp: '2025-01-01T00:00:00Z'
		} as any);

		expect(handler).toHaveBeenCalledTimes(1);
		unsub();

		agents.addEvent({
			type: 'agent_joined',
			agentId: 'a1',
			agent: makeAgent('a1'),
			timestamp: '2025-01-01T00:00:00Z'
		} as any);

		expect(handler).toHaveBeenCalledTimes(1); // Not called again
	});

	it('onTeamEvent wildcard receives all events', () => {
		const handler = vi.fn();
		agents.onTeamEvent('*', handler);

		agents.addEvent({
			type: 'agent_joined',
			agentId: 'a1',
			agent: makeAgent('a1'),
			timestamp: '2025-01-01T00:00:00Z'
		} as any);

		agents.addEvent({
			type: 'agent_left',
			agentId: 'a1',
			agent: makeAgent('a1'),
			timestamp: '2025-01-01T00:00:00Z'
		} as any);

		expect(handler).toHaveBeenCalledTimes(2);
	});
});

// ============================================================================
// Activity operations
// ============================================================================

describe('agents store — activities', () => {
	it('addActivity pushes to the front', () => {
		agents.addActivity({
			id: 'act-1',
			agentId: 'a1',
			agent: makeAgent('a1'),
			timestamp: '2025-01-01T00:00:00Z',
			type: 'action',
			content: 'Did something'
		} as any);
		expect(agents.getActivities()).toHaveLength(1);
	});

	it('getActivitiesForAgent filters by agent id', () => {
		agents.addActivity({
			id: 'act-1', agentId: 'a1', agent: makeAgent('a1'),
			timestamp: '2025-01-01T00:00:00Z', type: 'action', content: 'A1 action'
		} as any);
		agents.addActivity({
			id: 'act-2', agentId: 'a2', agent: makeAgent('a2'),
			timestamp: '2025-01-01T00:00:00Z', type: 'action', content: 'A2 action'
		} as any);
		expect(agents.getActivitiesForAgent('a1')).toHaveLength(1);
	});

	it('getRecentActivities returns first N activities', () => {
		for (let i = 0; i < 5; i++) {
			agents.addActivity({
				id: `act-${i}`, agentId: 'a1', agent: makeAgent('a1'),
				timestamp: '2025-01-01T00:00:00Z', type: 'action', content: `Action ${i}`
			} as any);
		}
		expect(agents.getRecentActivities(3)).toHaveLength(3);
	});

	it('clearActivities empties the list', () => {
		agents.addActivity({
			id: 'act-1', agentId: 'a1', agent: makeAgent('a1'),
			timestamp: '2025-01-01T00:00:00Z', type: 'action', content: 'Test'
		} as any);
		agents.clearActivities();
		expect(agents.getActivities()).toHaveLength(0);
	});

	it('clearEvents empties the events list', () => {
		agents.addEvent({
			type: 'agent_joined', agentId: 'a1', agent: makeAgent('a1'),
			timestamp: '2025-01-01T00:00:00Z'
		} as any);
		agents.clearEvents();
		expect(agents.getEvents()).toHaveLength(0);
	});
});

// ============================================================================
// UI operations
// ============================================================================

describe('agents store — UI operations', () => {
	it('selectAgent sets selected agent', () => {
		agents.addAgent(makeAgent('a1'));
		agents.selectAgent('a1');
		expect(agents.getSelectedAgent()?.id).toBe('a1');
	});

	it('selectAgent with null deselects', () => {
		agents.addAgent(makeAgent('a1'));
		agents.selectAgent('a1');
		agents.selectAgent(null);
		expect(agents.getSelectedAgent()).toBeUndefined();
	});
});

// ============================================================================
// Connection and error
// ============================================================================

describe('agents store — connection and error', () => {
	it('setConnected updates state', () => {
		agents.setConnected(true);
		expect(agents.getConnected()).toBe(true);
	});

	it('setError updates error', () => {
		agents.setError('something failed');
		expect(agents.getError()).toBe('something failed');
	});

	it('clearError clears error', () => {
		agents.setError('err');
		agents.clearError();
		expect(agents.getError()).toBe(null);
	});
});

// ============================================================================
// Reset
// ============================================================================

describe('agents store — reset', () => {
	it('reset clears all state', () => {
		agents.addAgent(makeAgent('a1'));
		agents.updateCursor({ agentId: 'a1', filePath: '/src/a.ts', position: { line: 1, column: 1 } } as any);
		agents.setConnected(true);
		agents.setError('err');
		agents.selectAgent('a1');

		agents.reset();

		expect(agents.getAgents()).toEqual([]);
		expect(agents.getEvents()).toEqual([]);
		expect(agents.getActivities()).toEqual([]);
		expect(agents.getCursors()).toEqual([]);
		expect(agents.getSelectedAgent()).toBeUndefined();
		expect(agents.getFilter()).toBe('all');
		expect(agents.getConnected()).toBe(false);
		expect(agents.getError()).toBe(null);
	});
});

// ============================================================================
// Mock data
// ============================================================================

describe('agents store — addMockAgents', () => {
	it('populates 3 mock agents', () => {
		agents.addMockAgents();
		expect(agents.getAgents()).toHaveLength(3);
		expect(agents.getAgent('agent-1')?.name).toBe('CodeBot');
		expect(agents.getAgent('agent-2')?.name).toBe('ReviewBot');
		expect(agents.getAgent('agent-3')?.name).toBe('TestBot');
	});
});
