import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	AIAwarenessManager,
	createAIAwarenessManager,
	getAIAwarenessManager,
	createAIAwareness,
	getAgentColor,
	AI_AGENT_COLORS,
	type AIAwareness,
	type AIFocusRegion,
	type AICursor,
	type AIAwarenessEvent,
	type AIAwarenessCallback
} from './ai-awareness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAwareness(overrides: Partial<AIAwareness> = {}): AIAwareness {
	return createAIAwareness(
		overrides.agentId ?? 'agent-1',
		overrides.agentName ?? 'Claude',
		overrides
	);
}

function makeCursor(overrides: Partial<AICursor> = {}): AICursor {
	return {
		position: { line: 0, column: 0 },
		color: '#8B5CF6',
		visible: true,
		animation: 'idle',
		...overrides
	};
}

// ---------------------------------------------------------------------------
// getAgentColor
// ---------------------------------------------------------------------------
describe('getAgentColor', () => {
	it('should return purple for claude', () => {
		expect(getAgentColor('Claude')).toBe(AI_AGENT_COLORS.claude);
		expect(getAgentColor('my-claude-agent')).toBe(AI_AGENT_COLORS.claude);
	});

	it('should return green for copilot', () => {
		expect(getAgentColor('GitHub Copilot')).toBe(AI_AGENT_COLORS.copilot);
	});

	it('should return blue for assistant', () => {
		expect(getAgentColor('My Assistant')).toBe(AI_AGENT_COLORS.assistant);
	});

	it('should return default amber for unknown names', () => {
		expect(getAgentColor('CustomBot')).toBe(AI_AGENT_COLORS.default);
		expect(getAgentColor('')).toBe(AI_AGENT_COLORS.default);
	});

	it('should be case-insensitive', () => {
		expect(getAgentColor('CLAUDE')).toBe(AI_AGENT_COLORS.claude);
		expect(getAgentColor('COPILOT')).toBe(AI_AGENT_COLORS.copilot);
	});
});

// ---------------------------------------------------------------------------
// createAIAwareness
// ---------------------------------------------------------------------------
describe('createAIAwareness', () => {
	it('should create awareness with defaults', () => {
		const a = createAIAwareness('a1', 'TestBot');
		expect(a.agentId).toBe('a1');
		expect(a.agentName).toBe('TestBot');
		expect(a.color).toBe(AI_AGENT_COLORS.default); // TestBot is unknown
		expect(a.attentionType).toBe('reading');
		expect(a.cursor).toBeNull();
		expect(a.focusRegions).toEqual([]);
		expect(a.activity).toBe('');
		expect(a.confidence).toBe(0.5);
		expect(a.isActive).toBe(true);
		expect(a.lastUpdate).toBeGreaterThan(0);
	});

	it('should override defaults with options', () => {
		const cursor = makeCursor();
		const regions: AIFocusRegion[] = [{ startLine: 0, endLine: 5, intensity: 0.8, type: 'writing' }];
		const a = createAIAwareness('a2', 'Claude', {
			color: '#000',
			attentionType: 'writing',
			cursor,
			focusRegions: regions,
			activity: 'Generating code',
			confidence: 0.9,
			isActive: false
		});
		expect(a.color).toBe('#000');
		expect(a.attentionType).toBe('writing');
		expect(a.cursor).toBe(cursor);
		expect(a.focusRegions).toBe(regions);
		expect(a.activity).toBe('Generating code');
		expect(a.confidence).toBe(0.9);
		expect(a.isActive).toBe(false);
	});

	it('should derive color from agent name when not explicitly provided', () => {
		const a = createAIAwareness('a3', 'Claude Helper');
		expect(a.color).toBe(AI_AGENT_COLORS.claude);
	});
});

// ---------------------------------------------------------------------------
// createAIAwarenessManager / getAIAwarenessManager
// ---------------------------------------------------------------------------
describe('createAIAwarenessManager', () => {
	it('should return a fresh manager instance', () => {
		const m = createAIAwarenessManager();
		expect(m).toBeInstanceOf(AIAwarenessManager);
		expect(m.getAgents().size).toBe(0);
	});
});

describe('getAIAwarenessManager (singleton)', () => {
	it('should return the same instance', () => {
		const a = getAIAwarenessManager();
		const b = getAIAwarenessManager();
		expect(a).toBe(b);
	});
});

// ---------------------------------------------------------------------------
// AIAwarenessManager – setAgent / getAgent / getAgents
// ---------------------------------------------------------------------------
describe('AIAwarenessManager – agent registration', () => {
	let manager: AIAwarenessManager;

	beforeEach(() => {
		manager = createAIAwarenessManager();
	});

	it('should register a new agent', () => {
		const a = makeAwareness();
		manager.setAgent(a);
		expect(manager.getAgent('agent-1')).toBeDefined();
		expect(manager.getAgent('agent-1')!.agentName).toBe('Claude');
	});

	it('should update an existing agent', () => {
		manager.setAgent(makeAwareness({ activity: 'reading' }));
		manager.setAgent(makeAwareness({ activity: 'writing' }));
		expect(manager.getAgent('agent-1')!.activity).toBe('writing');
	});

	it('should set lastUpdate timestamp', () => {
		const before = Date.now();
		manager.setAgent(makeAwareness());
		const a = manager.getAgent('agent-1')!;
		expect(a.lastUpdate).toBeGreaterThanOrEqual(before);
	});

	it('getAgents should return a copy of the map', () => {
		manager.setAgent(makeAwareness());
		const agents = manager.getAgents();
		agents.delete('agent-1');
		expect(manager.getAgent('agent-1')).toBeDefined(); // still there
	});

	it('getAgent should return undefined for unknown id', () => {
		expect(manager.getAgent('nope')).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// AIAwarenessManager – removeAgent
// ---------------------------------------------------------------------------
describe('AIAwarenessManager – removeAgent', () => {
	let manager: AIAwarenessManager;

	beforeEach(() => {
		manager = createAIAwarenessManager();
	});

	it('should remove an existing agent', () => {
		manager.setAgent(makeAwareness());
		manager.removeAgent('agent-1');
		expect(manager.getAgent('agent-1')).toBeUndefined();
	});

	it('should be a no-op for an unknown agent', () => {
		// Should not throw, and should not emit events
		const cb = vi.fn();
		manager.onChange(cb);
		manager.removeAgent('nonexistent');
		expect(cb).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// AIAwarenessManager – updateCursor
// ---------------------------------------------------------------------------
describe('AIAwarenessManager – updateCursor', () => {
	let manager: AIAwarenessManager;

	beforeEach(() => {
		manager = createAIAwarenessManager();
		manager.setAgent(makeAwareness());
	});

	it('should update the cursor on an existing agent', () => {
		const cursor = makeCursor({ position: { line: 10, column: 5 } });
		manager.updateCursor('agent-1', cursor);
		expect(manager.getAgent('agent-1')!.cursor).toEqual(cursor);
	});

	it('should update lastUpdate timestamp', () => {
		const before = Date.now();
		manager.updateCursor('agent-1', makeCursor());
		expect(manager.getAgent('agent-1')!.lastUpdate).toBeGreaterThanOrEqual(before);
	});

	it('should be a no-op for unknown agent', () => {
		// Should not throw
		manager.updateCursor('nonexistent', makeCursor());
	});
});

// ---------------------------------------------------------------------------
// AIAwarenessManager – updateFocusRegions
// ---------------------------------------------------------------------------
describe('AIAwarenessManager – updateFocusRegions', () => {
	let manager: AIAwarenessManager;

	beforeEach(() => {
		manager = createAIAwarenessManager();
		manager.setAgent(makeAwareness());
	});

	it('should update focus regions', () => {
		const regions: AIFocusRegion[] = [
			{ startLine: 0, endLine: 10, intensity: 0.7, type: 'reading' },
			{ startLine: 15, endLine: 20, intensity: 0.3, type: 'thinking' }
		];
		manager.updateFocusRegions('agent-1', regions);
		expect(manager.getAgent('agent-1')!.focusRegions).toEqual(regions);
	});

	it('should be a no-op for unknown agent', () => {
		manager.updateFocusRegions('nonexistent', []);
	});
});

// ---------------------------------------------------------------------------
// AIAwarenessManager – updateAttention
// ---------------------------------------------------------------------------
describe('AIAwarenessManager – updateAttention', () => {
	let manager: AIAwarenessManager;

	beforeEach(() => {
		manager = createAIAwarenessManager();
		manager.setAgent(makeAwareness());
	});

	it('should update attention type', () => {
		manager.updateAttention('agent-1', 'writing');
		expect(manager.getAgent('agent-1')!.attentionType).toBe('writing');
	});

	it('should update activity when provided', () => {
		manager.updateAttention('agent-1', 'writing', 'Generating function');
		expect(manager.getAgent('agent-1')!.activity).toBe('Generating function');
	});

	it('should not change activity when not provided', () => {
		manager.setAgent(makeAwareness({ activity: 'original' }));
		manager.updateAttention('agent-1', 'thinking');
		expect(manager.getAgent('agent-1')!.activity).toBe('original');
	});

	it('should be a no-op for unknown agent', () => {
		manager.updateAttention('nonexistent', 'thinking');
	});
});

// ---------------------------------------------------------------------------
// AIAwarenessManager – getActiveAgents
// ---------------------------------------------------------------------------
describe('AIAwarenessManager – getActiveAgents', () => {
	let manager: AIAwarenessManager;

	beforeEach(() => {
		manager = createAIAwarenessManager();
	});

	it('should return only agents that are active and recently updated', () => {
		manager.setAgent(makeAwareness({ agentId: 'a1', isActive: true }));
		manager.setAgent(makeAwareness({ agentId: 'a2', isActive: false }));
		const active = manager.getActiveAgents();
		expect(active).toHaveLength(1);
		expect(active[0].agentId).toBe('a1');
	});

	it('should exclude stale agents (lastUpdate > 30s ago)', () => {
		const awareness = makeAwareness({ agentId: 'stale', isActive: true });
		manager.setAgent(awareness);

		// Manually set lastUpdate to 31 seconds ago
		const stored = manager.getAgent('stale')!;
		(stored as any).lastUpdate = Date.now() - 31000;

		expect(manager.getActiveAgents()).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// AIAwarenessManager – onChange
// ---------------------------------------------------------------------------
describe('AIAwarenessManager – onChange', () => {
	let manager: AIAwarenessManager;

	beforeEach(() => {
		manager = createAIAwarenessManager();
	});

	it('should notify on setAgent', () => {
		const cb = vi.fn();
		manager.onChange(cb);
		manager.setAgent(makeAwareness());
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb.mock.calls[0][0]).toBeInstanceOf(Map);
	});

	it('should notify on removeAgent', () => {
		manager.setAgent(makeAwareness());
		const cb = vi.fn();
		manager.onChange(cb);
		manager.removeAgent('agent-1');
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('should notify on updateCursor', () => {
		manager.setAgent(makeAwareness());
		const cb = vi.fn();
		manager.onChange(cb);
		manager.updateCursor('agent-1', makeCursor());
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('should notify on updateFocusRegions', () => {
		manager.setAgent(makeAwareness());
		const cb = vi.fn();
		manager.onChange(cb);
		manager.updateFocusRegions('agent-1', []);
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('should notify on updateAttention', () => {
		manager.setAgent(makeAwareness());
		const cb = vi.fn();
		manager.onChange(cb);
		manager.updateAttention('agent-1', 'writing');
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('unsubscribe should stop notifications', () => {
		const cb = vi.fn();
		const unsub = manager.onChange(cb);
		unsub();
		manager.setAgent(makeAwareness());
		expect(cb).not.toHaveBeenCalled();
	});

	it('should not throw if a listener throws', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		manager.onChange(() => {
			throw new Error('boom');
		});
		expect(() => manager.setAgent(makeAwareness())).not.toThrow();
		errorSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// AIAwarenessManager – getRecentEvents
// ---------------------------------------------------------------------------
describe('AIAwarenessManager – getRecentEvents', () => {
	let manager: AIAwarenessManager;

	beforeEach(() => {
		manager = createAIAwarenessManager();
	});

	it('should return empty array when no events', () => {
		expect(manager.getRecentEvents()).toEqual([]);
	});

	it('should record agent-join event on setAgent for new agent', () => {
		manager.setAgent(makeAwareness());
		const events = manager.getRecentEvents();
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events[0].type).toBe('agent-join');
		expect(events[0].agentId).toBe('agent-1');
	});

	it('should record activity-change event on setAgent for existing agent', () => {
		manager.setAgent(makeAwareness());
		manager.setAgent(makeAwareness({ activity: 'updated' }));
		const events = manager.getRecentEvents(10);
		expect(events[1].type).toBe('activity-change');
	});

	it('should record agent-leave event on removeAgent', () => {
		manager.setAgent(makeAwareness());
		manager.removeAgent('agent-1');
		const events = manager.getRecentEvents(10);
		const leaveEvent = events.find((e) => e.type === 'agent-leave');
		expect(leaveEvent).toBeDefined();
	});

	it('should record cursor-move event on updateCursor', () => {
		manager.setAgent(makeAwareness());
		manager.updateCursor('agent-1', makeCursor());
		const events = manager.getRecentEvents(10);
		expect(events.find((e) => e.type === 'cursor-move')).toBeDefined();
	});

	it('should record focus-change event on updateFocusRegions', () => {
		manager.setAgent(makeAwareness());
		manager.updateFocusRegions('agent-1', []);
		const events = manager.getRecentEvents(10);
		expect(events.find((e) => e.type === 'focus-change')).toBeDefined();
	});

	it('should record attention-change event on updateAttention', () => {
		manager.setAgent(makeAwareness());
		manager.updateAttention('agent-1', 'writing');
		const events = manager.getRecentEvents(10);
		expect(events.find((e) => e.type === 'attention-change')).toBeDefined();
	});

	it('should respect count parameter', () => {
		manager.setAgent(makeAwareness({ agentId: 'a1' }));
		manager.setAgent(makeAwareness({ agentId: 'a2' }));
		manager.setAgent(makeAwareness({ agentId: 'a3' }));
		const events = manager.getRecentEvents(2);
		expect(events).toHaveLength(2);
	});

	it('should trim history when exceeding max size (100)', () => {
		// Generate more than 100 events
		for (let i = 0; i < 110; i++) {
			manager.setAgent(makeAwareness({ agentId: `a-${i}` }));
		}
		const events = manager.getRecentEvents(200);
		expect(events.length).toBeLessThanOrEqual(100);
	});
});

// ---------------------------------------------------------------------------
// AIAwarenessManager – clear
// ---------------------------------------------------------------------------
describe('AIAwarenessManager – clear', () => {
	it('should remove all agents and event history', () => {
		const manager = createAIAwarenessManager();
		manager.setAgent(makeAwareness({ agentId: 'a1' }));
		manager.setAgent(makeAwareness({ agentId: 'a2' }));

		manager.clear();

		expect(manager.getAgents().size).toBe(0);
		expect(manager.getRecentEvents()).toEqual([]);
	});

	it('should notify listeners on clear', () => {
		const manager = createAIAwarenessManager();
		manager.setAgent(makeAwareness());
		const cb = vi.fn();
		manager.onChange(cb);
		manager.clear();
		expect(cb).toHaveBeenCalledTimes(1);
	});
});
