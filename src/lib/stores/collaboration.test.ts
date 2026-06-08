import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as collab from './collaboration.svelte';
import type {
	CollaborationUser,
	CollaborationConfig,
	CollaboratorCursor,
	CollaboratorAwareness,
	AIProposedChange
} from '$types';

/**
 * Collaboration store tests
 *
 * Covers initialization, user management, cursor tracking, awareness,
 * AI session lifecycle, change proposals, snapshots, events, and reset.
 */

let uuidCounter = 0;
vi.stubGlobal('crypto', {
	randomUUID: () => `collab-uuid-${++uuidCounter}`
});

beforeEach(() => {
	uuidCounter = 0;
	collab.reset();
});

// ============================================================================
// Helpers
// ============================================================================

/** Minimal test user shape — email is extra data not in CollaborationUser. */
interface TestUser extends CollaborationUser {
	email?: string;
}

function makeUser(id: string, overrides: Partial<TestUser> = {}): TestUser {
	return {
		id,
		name: `User-${id}`,
		color: '',
		email: `${id}@example.com`,
		...overrides
	};
}

/** Minimal test config — tests use documentId; store maps it to roomId via initialize(). */
interface TestConfig extends CollaborationConfig {
	documentId?: string;
}

function makeConfig(overrides: Partial<TestConfig> = {}): TestConfig {
	return {
		roomId: 'doc-1',
		documentId: 'doc-1',
		user: makeUser('local-user'),
		serverUrl: 'ws://localhost:3000',
		...overrides
	};
}


// ============================================================================
// Default state
// ============================================================================

describe('collaboration store — default state', () => {
	it('has no config', () => {
		expect(collab.getConfig()).toBe(null);
	});

	it('status is disconnected', () => {
		expect(collab.getStatus()).toBe('disconnected');
	});

	it('has no error', () => {
		expect(collab.getError()).toBe(null);
	});

	it('is not synced', () => {
		expect(collab.getSynced()).toBe(false);
	});

	it('has no users', () => {
		expect(collab.getUsers()).toEqual([]);
	});

	it('has no cursors', () => {
		expect(collab.getCursors()).toEqual([]);
	});

	it('has no awareness', () => {
		expect(collab.getAwareness()).toEqual([]);
	});

	it('has no AI sessions', () => {
		expect(collab.getAISessions()).toEqual([]);
	});

	it('has no pending changes', () => {
		expect(collab.getPendingChanges()).toEqual([]);
	});

	it('has no snapshots', () => {
		expect(collab.getSnapshots()).toEqual([]);
	});

	it('has no local user', () => {
		expect(collab.getLocalUser()).toBe(null);
	});

	it('is not connected', () => {
		expect(collab.getIsConnected()).toBe(false);
	});
});

// ============================================================================
// Initialization
// ============================================================================

describe('collaboration store — initialization', () => {
	it('initialize sets config and local user', () => {
		const config = makeConfig();
		collab.initialize(config);
		expect(collab.getConfig()).toEqual(config);
		expect(collab.getLocalUser()?.id).toBe('local-user');
	});

	it('initialize sets status to connecting', () => {
		collab.initialize(makeConfig());
		expect(collab.getStatus()).toBe('connecting');
	});
});

// ============================================================================
// Connection status
// ============================================================================

describe('collaboration store — connection status', () => {
	it('setStatus updates status', () => {
		collab.setStatus('connected');
		expect(collab.getStatus()).toBe('connected');
		expect(collab.getIsConnected()).toBe(true);
	});

	it('setStatus with error message sets error', () => {
		collab.setStatus('disconnected', 'Connection lost');
		expect(collab.getError()).toBe('Connection lost');
	});

	it('setStatus connected clears error', () => {
		collab.setStatus('disconnected', 'Connection lost');
		collab.setStatus('connected');
		expect(collab.getError()).toBe(null);
	});

	it('setSynced updates synced state', () => {
		collab.setSynced(true);
		expect(collab.getSynced()).toBe(true);
	});
});

// ============================================================================
// User management
// ============================================================================

describe('collaboration store — user management', () => {
	it('addUser adds a user', () => {
		collab.addUser(makeUser('u1'));
		expect(collab.getUsers()).toHaveLength(1);
	});

	it('addUser assigns a color if not provided', () => {
		collab.addUser(makeUser('u1'));
		expect(collab.getUsers()[0].color).toBeDefined();
	});

	it('addUser does not add duplicate users', () => {
		collab.addUser(makeUser('u1'));
		collab.addUser(makeUser('u1'));
		expect(collab.getUsers()).toHaveLength(1);
	});

	it('removeUser removes a user', () => {
		collab.addUser(makeUser('u1'));
		collab.removeUser('u1');
		expect(collab.getUsers()).toHaveLength(0);
	});

	it('removeUser also removes cursor and awareness', () => {
		collab.addUser(makeUser('u1'));
		collab.updateCursor({ userId: 'u1', user: makeUser('u1'), position: { line: 1, column: 1 }, lastActivity: new Date() } satisfies CollaboratorCursor);
		collab.updateAwareness({ userId: 'u1', user: makeUser('u1'), state: 'active' } satisfies CollaboratorAwareness);
		collab.removeUser('u1');
		expect(collab.getCursors()).toHaveLength(0);
		expect(collab.getAwareness()).toHaveLength(0);
	});

	it('getOtherUsers excludes local user', () => {
		collab.initialize(makeConfig());
		collab.addUser(makeUser('local-user'));
		collab.addUser(makeUser('other-user'));
		expect(collab.getOtherUsers()).toHaveLength(1);
		expect(collab.getOtherUsers()[0].id).toBe('other-user');
	});
});

// ============================================================================
// Cursor management
// ============================================================================

describe('collaboration store — cursors', () => {
	it('updateCursor adds a cursor', () => {
		collab.updateCursor({
			userId: 'u1',
			user: makeUser('u1'),
			position: { line: 5, column: 10 },
			lastActivity: new Date()
		} satisfies CollaboratorCursor);
		expect(collab.getCursors()).toHaveLength(1);
	});

	it('updateCursor overwrites existing cursor for same user', () => {
		collab.updateCursor({ userId: 'u1', user: makeUser('u1'), position: { line: 1, column: 1 }, lastActivity: new Date() } satisfies CollaboratorCursor);
		collab.updateCursor({ userId: 'u1', user: makeUser('u1'), position: { line: 10, column: 5 }, lastActivity: new Date() } satisfies CollaboratorCursor);
		expect(collab.getCursors()).toHaveLength(1);
		expect(collab.getCursors()[0].position).toEqual({ line: 10, column: 5 });
	});

	it('setLocalCursor sets cursor for local user', () => {
		collab.initialize(makeConfig());
		collab.setLocalCursor({ line: 3, column: 7 });
		const cursors = collab.getCursors();
		expect(cursors).toHaveLength(1);
		expect(cursors[0].userId).toBe('local-user');
		expect(cursors[0].position).toEqual({ line: 3, column: 7 });
	});

	it('setLocalCursor does nothing without local user', () => {
		collab.setLocalCursor({ line: 1, column: 1 });
		expect(collab.getCursors()).toHaveLength(0);
	});
});

// ============================================================================
// Awareness
// ============================================================================

describe('collaboration store — awareness', () => {
	it('updateAwareness adds awareness data', () => {
		collab.updateAwareness({ userId: 'u1', user: makeUser('u1'), state: 'active' } satisfies CollaboratorAwareness);
		expect(collab.getAwareness()).toHaveLength(1);
	});

	it('setLocalAwareness updates local user awareness', () => {
		collab.initialize(makeConfig());
		collab.setLocalAwareness({ state: 'idle' });
		expect(collab.getAwareness()).toHaveLength(1);
	});

	it('setLocalAwareness does nothing without local user', () => {
		collab.setLocalAwareness({ state: 'active' });
		expect(collab.getAwareness()).toHaveLength(0);
	});
});

// ============================================================================
// AI collaboration sessions
// ============================================================================

describe('collaboration store — AI sessions', () => {
	beforeEach(() => {
		collab.initialize(makeConfig());
		collab.addUser(makeUser('local-user'));
	});

	it('startAISession creates a pending session and adds AI user', () => {
		const aiUser = makeUser('ai-bot', { isAI: true, name: 'AI Assistant' });
		const id = collab.startAISession('doc-1', aiUser);
		expect(id).toBeDefined();
		expect(collab.getAISessions()).toHaveLength(1);
		expect(collab.getAISessions()[0].status).toBe('pending');
		// AI user added to users
		expect(collab.getUsers().some(u => u.isAI)).toBe(true);
	});

	it('updateAISession modifies session', () => {
		const id = collab.startAISession('doc-1', makeUser('ai'));
		collab.updateAISession(id, { status: 'active' });
		expect(collab.getAISessions()[0].status).toBe('active');
	});

	it('setAITask sets task and status to active', () => {
		const id = collab.startAISession('doc-1', makeUser('ai'));
		collab.setAITask(id, 'Refactoring utils');
		const session = collab.getAISessions()[0];
		expect(session.currentTask).toBe('Refactoring utils');
		expect(session.status).toBe('active');
	});

	it('getActiveAISessions returns only active sessions', () => {
		const id1 = collab.startAISession('doc-1', makeUser('ai-1'));
		collab.startAISession('doc-1', makeUser('ai-2'));
		collab.updateAISession(id1, { status: 'active' });
		expect(collab.getActiveAISessions()).toHaveLength(1);
	});

	it('completeAISession sets completed and removes AI user', () => {
		const aiUser = makeUser('ai-bot');
		const id = collab.startAISession('doc-1', aiUser);
		collab.completeAISession(id);
		expect(collab.getAISessions().find(s => s.id === id)?.status).toBe('completed');
		expect(collab.getUsers().find(u => u.id === 'ai-bot')).toBeUndefined();
	});

	it('cancelAISession sets cancelled and rejects pending changes', () => {
		const aiUser = makeUser('ai-bot');
		const sessionId = collab.startAISession('doc-1', aiUser);
		collab.proposeAIChange(sessionId,
			// Simplified test shape; store accepts the structural superset at runtime
			{ type: 'insert', content: 'new code', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } } as unknown as Omit<AIProposedChange, 'id' | 'sessionId' | 'status'>
		);
		collab.cancelAISession(sessionId);
		expect(collab.getAISessions().find(s => s.id === sessionId)?.status).toBe('cancelled');
		expect(collab.getPendingChanges().every(c => c.status === 'rejected')).toBe(true);
	});
});

// ============================================================================
// Change proposals
// ============================================================================

describe('collaboration store — AI change proposals', () => {
	let sessionId: string;

	beforeEach(() => {
		collab.initialize(makeConfig());
		collab.addUser(makeUser('local-user'));
		sessionId = collab.startAISession('doc-1', makeUser('ai'));
	});

	it('proposeAIChange adds a pending change', () => {
		const _id = collab.proposeAIChange(sessionId,
			// Simplified test shape; store accepts the structural superset at runtime
			{ type: 'replace', content: 'updated', range: { start: { line: 1, column: 1 }, end: { line: 5, column: 1 } } } as unknown as Omit<AIProposedChange, 'id' | 'sessionId' | 'status'>
		);
		expect(collab.getPendingChanges()).toHaveLength(1);
		expect(collab.getPendingChanges()[0].status).toBe('pending');
		expect(collab.getPendingChanges()[0].sessionId).toBe(sessionId);
	});

	it('reviewAIChange approves a change', () => {
		const changeId = collab.proposeAIChange(sessionId,
			// Simplified test shape; store accepts the structural superset at runtime
			{ type: 'replace', content: 'x', range: {} as unknown as AIProposedChange['range'] } as unknown as Omit<AIProposedChange, 'id' | 'sessionId' | 'status'>
		);
		collab.reviewAIChange(changeId, true, 'reviewer-1');
		expect(collab.getPendingChanges()[0].status).toBe('approved');
	});

	it('reviewAIChange rejects a change', () => {
		const changeId = collab.proposeAIChange(sessionId,
			// Simplified test shape; store accepts the structural superset at runtime
			{ type: 'replace', content: 'x', range: {} as unknown as AIProposedChange['range'] } as unknown as Omit<AIProposedChange, 'id' | 'sessionId' | 'status'>
		);
		collab.reviewAIChange(changeId, false, 'reviewer-1');
		expect(collab.getPendingChanges()[0].status).toBe('rejected');
	});
});

// ============================================================================
// Snapshots
// ============================================================================

describe('collaboration store — snapshots', () => {
	beforeEach(() => {
		collab.initialize(makeConfig());
	});

	it('createSnapshot creates and returns id', () => {
		const id = collab.createSnapshot('doc-1', 'content at v1');
		expect(id).toBeDefined();
		expect(collab.getSnapshots()).toHaveLength(1);
	});

	it('createSnapshot auto-increments version per document', () => {
		collab.createSnapshot('doc-1', 'v1');
		collab.createSnapshot('doc-1', 'v2');
		const snapshots = collab.getSnapshots();
		expect(snapshots[0].version).toBe(1);
		expect(snapshots[1].version).toBe(2);
	});

	it('getDocumentSnapshots filters by document id', () => {
		collab.createSnapshot('doc-1', 'a');
		collab.createSnapshot('doc-2', 'b');
		expect(collab.getDocumentSnapshots('doc-1')).toHaveLength(1);
	});
});

// ============================================================================
// Event subscription
// ============================================================================

describe('collaboration store — events', () => {
	it('onEvent returns unsubscribe function', () => {
		const handler = vi.fn();
		const unsub = collab.onEvent(handler);
		expect(typeof unsub).toBe('function');
		unsub();
	});

	it('event handler receives events on user join', () => {
		const handler = vi.fn();
		collab.onEvent(handler);
		collab.addUser(makeUser('u1'));
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'user_joined' }));
	});

	it('event handler receives events on user leave', () => {
		const handler = vi.fn();
		collab.addUser(makeUser('u1'));
		collab.onEvent(handler);
		collab.removeUser('u1');
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'user_left' }));
	});
});

// ============================================================================
// getUserColor
// ============================================================================

describe('collaboration store — getUserColor', () => {
	it('returns a CSS variable string', () => {
		const color = collab.getUserColor(0);
		expect(color).toContain('var(--ide-collab-cursor-');
	});

	it('wraps around color list', () => {
		const c0 = collab.getUserColor(0);
		const c5 = collab.getUserColor(5);
		expect(c0).toBe(c5);
	});
});

// ============================================================================
// Disconnect and Reset
// ============================================================================

describe('collaboration store — disconnect', () => {
	it('disconnect clears users, cursors, awareness', () => {
		collab.addUser(makeUser('u1'));
		collab.updateCursor({ userId: 'u1', user: makeUser('u1'), position: { line: 1, column: 1 }, lastActivity: new Date() } satisfies CollaboratorCursor);
		collab.disconnect();
		expect(collab.getStatus()).toBe('disconnected');
		expect(collab.getUsers()).toEqual([]);
		expect(collab.getCursors()).toEqual([]);
		expect(collab.getSynced()).toBe(false);
	});
});

describe('collaboration store — reset', () => {
	it('reset clears all state including config', () => {
		collab.initialize(makeConfig());
		collab.addUser(makeUser('u1'));
		collab.reset();
		expect(collab.getConfig()).toBe(null);
		expect(collab.getLocalUser()).toBe(null);
		expect(collab.getAISessions()).toEqual([]);
		expect(collab.getPendingChanges()).toEqual([]);
		expect(collab.getSnapshots()).toEqual([]);
	});
});
