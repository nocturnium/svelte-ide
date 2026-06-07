import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VFSLockStatus } from '$lib/types';

// ============================================================================
// Mock Svelte stores before importing module under test.
//
// vi.mock factories are hoisted — they cannot reference variables declared
// in the test file's outer scope.  We use vi.hoisted() to declare mock
// objects that both the factory and the tests can access.
// ============================================================================

const {
	mockVfsStore,
	mockAgentsStore,
	mockCollabStore
} = vi.hoisted(() => {
	const mockVfsStore = {
		initialize: vi.fn(),
		onEvent: vi.fn(() => vi.fn()),
		isLockedByMe: vi.fn(() => false),
		acquireLock: vi.fn(),
		releaseLock: vi.fn(),
		getLockStatus: vi.fn(
			(): { status: VFSLockStatus['status']; lock?: { holder: string } } => ({
				status: 'unlocked'
			})
		),
		getLocks: vi.fn((): unknown[] => []),
		getLock: vi.fn(),
		getConnected: vi.fn(() => true),
		reset: vi.fn(),
		handleVFSEvent: vi.fn()
	};

	const mockAgentsStore = {
		onTeamEvent: vi.fn(() => vi.fn()),
		handleVFSEvent: vi.fn(),
		getAgent: vi.fn(),
		addAgent: vi.fn(),
		removeAgent: vi.fn(),
		setAgentStatus: vi.fn(),
		addEvent: vi.fn(),
		updateCursor: vi.fn(),
		getAgentsWorkingOnFile: vi.fn((): unknown[] => []),
		getOnlineAgents: vi.fn((): unknown[] => []),
		reset: vi.fn()
	};

	const mockCollabStore = {
		initialize: vi.fn(),
		onEvent: vi.fn(() => vi.fn()),
		addUser: vi.fn(),
		removeUser: vi.fn(),
		startAISession: vi.fn(() => 'session-1'),
		setAITask: vi.fn(),
		getAISessions: vi.fn(() => []),
		completeAISession: vi.fn(),
		getUsers: vi.fn(() => []),
		updateCursor: vi.fn(),
		setLocalAwareness: vi.fn(),
		getIsConnected: vi.fn(() => true),
		getSynced: vi.fn(() => true),
		reset: vi.fn()
	};

	return { mockVfsStore, mockAgentsStore, mockCollabStore };
});

vi.mock('$lib/stores/vfs.svelte', () => mockVfsStore);
vi.mock('$lib/stores/agents.svelte', () => mockAgentsStore);
vi.mock('$lib/stores/collaboration.svelte', () => mockCollabStore);

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });

// Now import the module under test
import {
	initialize,
	cleanup,
	isInitialized,
	getContext,
	getOnlineAgents,
	getAllLocks,
	getFileLock,
	canEditFile,
	getFileEditors,
	acquireLockWithContext,
	releaseLockWithContext,
	updateAgentCursorPosition
} from './ide-integration';

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
	vi.clearAllMocks();
	// Ensure clean state
	if (isInitialized()) cleanup();
});

afterEach(() => {
	if (isInitialized()) cleanup();
});

// ============================================================================
// Tests: Initialization
// ============================================================================

describe('IDE Integration — Initialization', () => {
	it('should initialize and set state', () => {
		initialize({
			workspaceId: 'ws1',
			userId: 'user1',
			userName: 'Test User'
		});

		expect(isInitialized()).toBe(true);
		expect(mockVfsStore.initialize).toHaveBeenCalledWith('user1', 'ws1');
	});

	it('should initialize collaboration when enabled', () => {
		initialize({
			workspaceId: 'ws1',
			userId: 'user1',
			userName: 'Test User',
			enableCollaboration: true
		});

		expect(mockCollabStore.initialize).toHaveBeenCalledWith(
			expect.objectContaining({
				user: expect.objectContaining({ id: 'user1', name: 'Test User', isAI: false }),
				roomId: 'ws1'
			})
		);
	});

	it('should initialize collaboration by default (not explicitly false)', () => {
		initialize({
			workspaceId: 'ws1',
			userId: 'user1',
			userName: 'Test User'
		});

		expect(mockCollabStore.initialize).toHaveBeenCalled();
	});

	it('should skip collaboration when explicitly disabled', () => {
		initialize({
			workspaceId: 'ws1',
			userId: 'user1',
			userName: 'Test User',
			enableCollaboration: false
		});

		expect(mockCollabStore.initialize).not.toHaveBeenCalled();
	});

	it('should set up event routing subscriptions', () => {
		initialize({
			workspaceId: 'ws1',
			userId: 'user1',
			userName: 'Test User'
		});

		expect(mockVfsStore.onEvent).toHaveBeenCalledWith('*', expect.any(Function));
		expect(mockAgentsStore.onTeamEvent).toHaveBeenCalledWith('*', expect.any(Function));
		expect(mockCollabStore.onEvent).toHaveBeenCalledWith(expect.any(Function));
	});

	it('should cleanup previous initialization on re-initialize', () => {
		initialize({ workspaceId: 'ws1', userId: 'user1', userName: 'User1' });
		initialize({ workspaceId: 'ws2', userId: 'user2', userName: 'User2' });

		// reset should have been called during the first cleanup
		expect(mockVfsStore.reset).toHaveBeenCalled();
	});
});

// ============================================================================
// Tests: Cleanup
// ============================================================================

describe('IDE Integration — Cleanup', () => {
	it('should reset all stores', () => {
		initialize({ workspaceId: 'ws1', userId: 'user1', userName: 'User' });
		cleanup();

		expect(mockVfsStore.reset).toHaveBeenCalled();
		expect(mockAgentsStore.reset).toHaveBeenCalled();
		expect(mockCollabStore.reset).toHaveBeenCalled();
		expect(isInitialized()).toBe(false);
	});

	it('should unsubscribe all event handlers', () => {
		const unsub1 = vi.fn();
		const unsub2 = vi.fn();
		const unsub3 = vi.fn();
		mockVfsStore.onEvent.mockReturnValueOnce(unsub1);
		mockAgentsStore.onTeamEvent.mockReturnValueOnce(unsub2);
		mockCollabStore.onEvent.mockReturnValueOnce(unsub3);

		initialize({ workspaceId: 'ws1', userId: 'user1', userName: 'User' });
		cleanup();

		expect(unsub1).toHaveBeenCalled();
		expect(unsub2).toHaveBeenCalled();
		expect(unsub3).toHaveBeenCalled();
	});
});

// ============================================================================
// Tests: Context
// ============================================================================

describe('IDE Integration — Context', () => {
	it('should return null when not initialized', () => {
		expect(getContext()).toBeNull();
	});

	it('should return context when initialized', () => {
		initialize({ workspaceId: 'ws1', userId: 'user1', userName: 'User1' });

		const ctx = getContext();
		expect(ctx).toEqual({
			workspaceId: 'ws1',
			userId: 'user1',
			userName: 'User1',
			connected: true,
			synced: true
		});
	});

	it('should reflect connection status', () => {
		initialize({ workspaceId: 'ws1', userId: 'user1', userName: 'User1' });
		mockVfsStore.getConnected.mockReturnValue(false);

		const ctx = getContext();
		expect(ctx?.connected).toBe(false);
	});
});

// ============================================================================
// Tests: Agent & Lock Getters
// ============================================================================

describe('IDE Integration — Getters', () => {
	beforeEach(() => {
		initialize({ workspaceId: 'ws1', userId: 'user1', userName: 'User1' });
	});

	it('getOnlineAgents should delegate to agents store', () => {
		const agents = [{ id: 'a1', name: 'Agent1' }];
		mockAgentsStore.getOnlineAgents.mockReturnValue(agents);

		expect(getOnlineAgents()).toBe(agents);
	});

	it('getAllLocks should delegate to vfs store', () => {
		const locks = [{ path: '/a.ts' }];
		mockVfsStore.getLocks.mockReturnValue(locks);

		expect(getAllLocks()).toBe(locks);
	});

	it('getFileLock should delegate to vfs store', () => {
		const lock = { path: '/a.ts', holder: 'user1' };
		mockVfsStore.getLock.mockReturnValue(lock);

		expect(getFileLock('/a.ts')).toBe(lock);
	});

	it('getFileEditors should delegate to agents store', () => {
		const agents = [{ id: 'a1' }];
		mockAgentsStore.getAgentsWorkingOnFile.mockReturnValue(agents);

		expect(getFileEditors('/a.ts')).toBe(agents);
	});
});

// ============================================================================
// Tests: canEditFile
// ============================================================================

describe('IDE Integration — canEditFile', () => {
	beforeEach(() => {
		initialize({ workspaceId: 'ws1', userId: 'user1', userName: 'User1' });
	});

	it('should return true for unlocked files', () => {
		mockVfsStore.getLockStatus.mockReturnValue({ status: 'unlocked' });
		expect(canEditFile('/a.ts')).toBe(true);
	});

	it('should return true if locked by current user', () => {
		mockVfsStore.getLockStatus.mockReturnValue({
			status: 'locked',
			lock: { holder: 'user1' }
		});
		expect(canEditFile('/a.ts')).toBe(true);
	});

	it('should return false if locked by another user', () => {
		mockVfsStore.getLockStatus.mockReturnValue({
			status: 'locked',
			lock: { holder: 'other-user' }
		});
		expect(canEditFile('/a.ts')).toBe(false);
	});

	it('should return false for acquiring status', () => {
		mockVfsStore.getLockStatus.mockReturnValue({ status: 'acquiring' });
		expect(canEditFile('/a.ts')).toBe(false);
	});
});

// ============================================================================
// Tests: Lock Coordination
// ============================================================================

describe('IDE Integration — Lock Coordination', () => {
	beforeEach(() => {
		initialize({
			workspaceId: 'ws1',
			userId: 'user1',
			userName: 'User1',
			enableCollaboration: true
		});
	});

	it('acquireLockWithContext should call vfsStore and update awareness', async () => {
		const lock = { path: '/a.ts', holder: 'user1' };
		mockVfsStore.acquireLock.mockResolvedValue(lock);

		const result = await acquireLockWithContext('/a.ts', 'edit');

		expect(result).toBe(lock);
		expect(mockVfsStore.acquireLock).toHaveBeenCalledWith('/a.ts', 'edit');
		expect(mockCollabStore.setLocalAwareness).toHaveBeenCalledWith({
			editingFile: '/a.ts',
			state: 'active'
		});
	});

	it('acquireLockWithContext should not update awareness if lock failed', async () => {
		mockVfsStore.acquireLock.mockResolvedValue(null);

		const result = await acquireLockWithContext('/a.ts');

		expect(result).toBeNull();
		expect(mockCollabStore.setLocalAwareness).not.toHaveBeenCalled();
	});

	it('releaseLockWithContext should release lock and update awareness', async () => {
		mockVfsStore.releaseLock.mockResolvedValue(undefined);

		await releaseLockWithContext('/a.ts');

		expect(mockVfsStore.releaseLock).toHaveBeenCalledWith('/a.ts');
		expect(mockCollabStore.setLocalAwareness).toHaveBeenCalledWith({
			editingFile: undefined,
			state: 'idle'
		});
	});
});

// ============================================================================
// Tests: Agent Cursor Sync
// ============================================================================

describe('IDE Integration — Agent Cursor Sync', () => {
	beforeEach(() => {
		initialize({
			workspaceId: 'ws1',
			userId: 'user1',
			userName: 'User1',
			enableCollaboration: true
		});
	});

	it('should update agent cursor in agents store', () => {
		const agent = { id: 'agent1', name: 'Agent1', color: '#ff0' };
		mockAgentsStore.getAgent.mockReturnValue(agent);

		updateAgentCursorPosition('agent1', '/test.ts', { line: 5, column: 10 });

		expect(mockAgentsStore.updateCursor).toHaveBeenCalledWith(
			expect.objectContaining({
				agentId: 'agent1',
				filePath: '/test.ts',
				position: { line: 5, column: 10 }
			})
		);
	});

	it('should also update collaboration cursor', () => {
		const agent = { id: 'agent1', name: 'Agent1', color: '#ff0' };
		mockAgentsStore.getAgent.mockReturnValue(agent);

		updateAgentCursorPosition('agent1', '/test.ts', { line: 5, column: 10 });

		expect(mockCollabStore.updateCursor).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'agent1',
				position: { line: 5, column: 10 }
			})
		);
	});

	it('should handle selection in cursor update', () => {
		const agent = { id: 'agent1', name: 'Agent1' };
		mockAgentsStore.getAgent.mockReturnValue(agent);

		const selection = {
			start: { line: 1, column: 0 },
			end: { line: 3, column: 5 }
		};
		updateAgentCursorPosition('agent1', '/test.ts', { line: 1, column: 0 }, selection);

		expect(mockAgentsStore.updateCursor).toHaveBeenCalledWith(
			expect.objectContaining({ selection })
		);
	});

	it('should skip if agent not found', () => {
		mockAgentsStore.getAgent.mockReturnValue(undefined);

		updateAgentCursorPosition('unknown', '/test.ts', { line: 0, column: 0 });

		expect(mockAgentsStore.updateCursor).not.toHaveBeenCalled();
	});
});
