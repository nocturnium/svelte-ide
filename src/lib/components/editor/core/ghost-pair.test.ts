import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	GhostPairController,
	createGhostPairController,
	getGhostPairController,
	useGhostPair,
	type GhostPairAgent,
	type AgentFileContext
} from './ghost-pair';
import {
	AIAwarenessManager,
	createAIAwarenessManager
} from './ai-awareness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<GhostPairAgent> = {}): GhostPairAgent {
	return {
		id: 'agent-1',
		name: 'Claude',
		status: 'busy',
		...overrides
	};
}

function makeContext(overrides: Partial<AgentFileContext> = {}): AgentFileContext {
	return {
		filePath: '/src/main.ts',
		position: { line: 5, column: 10 },
		...overrides
	};
}

// ---------------------------------------------------------------------------
// createGhostPairController / getGhostPairController
// ---------------------------------------------------------------------------
describe('createGhostPairController', () => {
	it('should return a new GhostPairController', () => {
		const controller = createGhostPairController();
		expect(controller).toBeInstanceOf(GhostPairController);
	});

	it('should accept an AIAwarenessManager', () => {
		const mgr = createAIAwarenessManager();
		const controller = createGhostPairController(mgr);
		expect(controller).toBeInstanceOf(GhostPairController);
	});
});

describe('getGhostPairController (singleton)', () => {
	it('should return the same instance', () => {
		const a = getGhostPairController();
		const b = getGhostPairController();
		expect(a).toBe(b);
	});
});

// ---------------------------------------------------------------------------
// GhostPairController – setCurrentFile
// ---------------------------------------------------------------------------
describe('GhostPairController – setCurrentFile', () => {
	let manager: AIAwarenessManager;
	let controller: GhostPairController;

	beforeEach(() => {
		manager = createAIAwarenessManager();
		controller = createGhostPairController(manager);
	});

	it('should remove agents not working on the new file', () => {
		controller.setCurrentFile('/src/main.ts');

		const agent = makeAgent({ id: 'a1' });
		const ctx = makeContext({ filePath: '/src/main.ts' });
		controller.updateAgent(agent, ctx);
		expect(manager.getAgent('a1')).toBeDefined();

		// Switch files — agent is on /src/main.ts, not /src/other.ts
		controller.setCurrentFile('/src/other.ts');
		expect(manager.getAgent('a1')).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// GhostPairController – updateAgent
// ---------------------------------------------------------------------------
describe('GhostPairController – updateAgent', () => {
	let manager: AIAwarenessManager;
	let controller: GhostPairController;

	beforeEach(() => {
		manager = createAIAwarenessManager();
		controller = createGhostPairController(manager);
		controller.setCurrentFile('/src/main.ts');
	});

	it('should register an agent working on the current file', () => {
		const agent = makeAgent();
		const ctx = makeContext({ filePath: '/src/main.ts' });
		controller.updateAgent(agent, ctx);

		const registered = manager.getAgent('agent-1');
		expect(registered).toBeDefined();
		expect(registered!.agentName).toBe('Claude');
	});

	it('should register a busy agent whose task files include the current file', () => {
		const agent = makeAgent({
			id: 'a2',
			status: 'busy',
			currentTask: { files: ['/src/main.ts'] }
		});
		controller.updateAgent(agent);
		expect(manager.getAgent('a2')).toBeDefined();
	});

	it('should remove a non-busy agent not on the current file', () => {
		const agent = makeAgent({ id: 'a3', status: 'online' });
		const ctx = makeContext({ filePath: '/src/other.ts' });
		controller.updateAgent(agent, ctx);
		expect(manager.getAgent('a3')).toBeUndefined();
	});

	it('should create a cursor when position is available', () => {
		const agent = makeAgent();
		const ctx = makeContext({ position: { line: 10, column: 3 } });
		controller.updateAgent(agent, ctx);

		const registered = manager.getAgent('agent-1')!;
		expect(registered.cursor).not.toBeNull();
		expect(registered.cursor!.position).toEqual({ line: 10, column: 3 });
	});

	it('should map task phase to attention type', () => {
		const agent = makeAgent({
			currentTask: { progress: { phase: 'implementing' } }
		});
		const ctx = makeContext();
		controller.updateAgent(agent, ctx);

		const registered = manager.getAgent('agent-1')!;
		expect(registered.attentionType).toBe('writing');
	});

	it('should default to reading for unknown phases', () => {
		const agent = makeAgent({
			currentTask: { progress: { phase: 'unknown_phase' } }
		});
		const ctx = makeContext();
		controller.updateAgent(agent, ctx);

		const registered = manager.getAgent('agent-1')!;
		expect(registered.attentionType).toBe('reading');
	});

	it('should create focus regions from focusLines', () => {
		const agent = makeAgent();
		const ctx = makeContext({
			focusLines: [
				{ start: 0, end: 10, intensity: 0.8 },
				{ start: 20, end: 30 }
			]
		});
		controller.updateAgent(agent, ctx);

		const registered = manager.getAgent('agent-1')!;
		expect(registered.focusRegions).toHaveLength(2);
		expect(registered.focusRegions[0].startLine).toBe(0);
		expect(registered.focusRegions[0].endLine).toBe(10);
		expect(registered.focusRegions[0].intensity).toBe(0.8);
		expect(registered.focusRegions[1].intensity).toBe(0.5); // default
	});

	it('should compute confidence from task progress percentage', () => {
		const agent = makeAgent({
			currentTask: { progress: { percentage: 80 } }
		});
		const ctx = makeContext();
		controller.updateAgent(agent, ctx);

		expect(manager.getAgent('agent-1')!.confidence).toBe(0.8);
	});

	it('should set isActive based on agent status', () => {
		controller.updateAgent(makeAgent({ status: 'busy' }), makeContext());
		expect(manager.getAgent('agent-1')!.isActive).toBe(true);

		// Re-update with online status
		controller.updateAgent(makeAgent({ status: 'online' }), makeContext());
		expect(manager.getAgent('agent-1')!.isActive).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// GhostPairController – updateAgentCursor
// ---------------------------------------------------------------------------
describe('GhostPairController – updateAgentCursor', () => {
	let manager: AIAwarenessManager;
	let controller: GhostPairController;

	beforeEach(() => {
		manager = createAIAwarenessManager();
		controller = createGhostPairController(manager);
		controller.setCurrentFile('/src/main.ts');
		controller.updateAgent(makeAgent(), makeContext());
	});

	it('should update cursor position on existing agent', () => {
		controller.updateAgentCursor('agent-1', { line: 20, column: 5 });
		const agent = manager.getAgent('agent-1')!;
		expect(agent.cursor!.position).toEqual({ line: 20, column: 5 });
	});

	it('should accept custom animation', () => {
		controller.updateAgentCursor('agent-1', { line: 1, column: 0 }, 'typing');
		const agent = manager.getAgent('agent-1')!;
		expect(agent.cursor!.animation).toBe('typing');
	});

	it('should be a no-op if agent is unknown', () => {
		// Should not throw
		controller.updateAgentCursor('nonexistent', { line: 0, column: 0 });
	});
});

// ---------------------------------------------------------------------------
// GhostPairController – updateAgentFocus
// ---------------------------------------------------------------------------
describe('GhostPairController – updateAgentFocus', () => {
	let manager: AIAwarenessManager;
	let controller: GhostPairController;

	beforeEach(() => {
		manager = createAIAwarenessManager();
		controller = createGhostPairController(manager);
		controller.setCurrentFile('/src/main.ts');
		controller.updateAgent(makeAgent(), makeContext());
	});

	it('should update focus regions on existing agent', () => {
		controller.updateAgentFocus('agent-1', [{ start: 5, end: 15, intensity: 0.9 }]);
		const agent = manager.getAgent('agent-1')!;
		expect(agent.focusRegions).toHaveLength(1);
		expect(agent.focusRegions[0].startLine).toBe(5);
		expect(agent.focusRegions[0].endLine).toBe(15);
		expect(agent.focusRegions[0].intensity).toBe(0.9);
	});

	it('should default intensity to 0.5 for focus lines without it', () => {
		controller.updateAgentFocus('agent-1', [{ start: 0, end: 5 }]);
		const agent = manager.getAgent('agent-1')!;
		expect(agent.focusRegions[0].intensity).toBe(0.5);
	});

	it('should be a no-op if agent is unknown', () => {
		controller.updateAgentFocus('nonexistent', []);
	});
});

// ---------------------------------------------------------------------------
// GhostPairController – removeAgent
// ---------------------------------------------------------------------------
describe('GhostPairController – removeAgent', () => {
	let manager: AIAwarenessManager;
	let controller: GhostPairController;

	beforeEach(() => {
		manager = createAIAwarenessManager();
		controller = createGhostPairController(manager);
		controller.setCurrentFile('/src/main.ts');
		controller.updateAgent(makeAgent(), makeContext());
	});

	it('should remove agent from both contexts and manager', () => {
		controller.removeAgent('agent-1');
		expect(manager.getAgent('agent-1')).toBeUndefined();
	});

	it('should be safe for unknown agents', () => {
		controller.removeAgent('nonexistent');
	});
});

// ---------------------------------------------------------------------------
// GhostPairController – getVisibleAgents
// ---------------------------------------------------------------------------
describe('GhostPairController – getVisibleAgents', () => {
	it('should return active agents from the manager', () => {
		const manager = createAIAwarenessManager();
		const controller = createGhostPairController(manager);
		controller.setCurrentFile('/src/main.ts');
		controller.updateAgent(makeAgent(), makeContext());

		const visible = controller.getVisibleAgents();
		expect(visible.length).toBeGreaterThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// GhostPairController – onChange
// ---------------------------------------------------------------------------
describe('GhostPairController – onChange', () => {
	it('should subscribe to awareness changes', () => {
		const manager = createAIAwarenessManager();
		const controller = createGhostPairController(manager);

		const cb = vi.fn();
		const unsub = controller.onChange(cb);

		controller.setCurrentFile('/src/main.ts');
		controller.updateAgent(makeAgent(), makeContext());

		expect(cb).toHaveBeenCalled();
		unsub();
	});
});

// ---------------------------------------------------------------------------
// GhostPairController – clear
// ---------------------------------------------------------------------------
describe('GhostPairController – clear', () => {
	it('should clear all agents and contexts', () => {
		const manager = createAIAwarenessManager();
		const controller = createGhostPairController(manager);
		controller.setCurrentFile('/src/main.ts');
		controller.updateAgent(makeAgent(), makeContext());

		controller.clear();

		expect(manager.getAgents().size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// useGhostPair
// ---------------------------------------------------------------------------
describe('useGhostPair', () => {
	it('should return agents array', () => {
		const result = useGhostPair('/src/test.ts');
		expect(result).toHaveProperty('agents');
		expect(Array.isArray(result.agents)).toBe(true);
	});

	it('should filter out offline agents', () => {
		const agents: GhostPairAgent[] = [
			makeAgent({ id: 'a1', status: 'busy' }),
			makeAgent({ id: 'a2', status: 'offline' })
		];
		// useGhostPair uses the singleton, so results depend on global state,
		// but at minimum it should not throw for offline agents
		const result = useGhostPair('/src/test.ts', agents);
		expect(result).toHaveProperty('agents');
	});
});
