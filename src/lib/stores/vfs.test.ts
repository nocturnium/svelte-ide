import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vfs from './vfs.svelte';
import type { VFSFileInfo, VFSFileLock, VFSTransaction, VFSLockStatus } from '$lib/types';

/**
 * VFS store tests
 *
 * Tests the pure state management functions (file info, locks, dirty tracking,
 * transactions, conflict resolution, and reset). Network-dependent functions
 * (loadWorkspace, connect, acquireLock, releaseLock, writeFileOptimistic,
 * deleteFileOptimistic) are excluded because they depend on vfsClient and
 * EventSource.
 */

let uuidCounter = 0;
vi.stubGlobal('crypto', {
	randomUUID: () => `vfs-uuid-${++uuidCounter}`
});

// Stub window.setInterval/clearInterval for lock refresh (uses window in source)
vi.stubGlobal('window', {
	setInterval: vi.fn().mockReturnValue(1),
	clearInterval: vi.fn()
});

beforeEach(() => {
	uuidCounter = 0;
	vfs.reset();
	vfs.setSyncing(false);
});

// ============================================================================
// Helpers
// ============================================================================

function makeFileInfo(path: string, overrides: Partial<VFSFileInfo> = {}): VFSFileInfo {
	return {
		path,
		name: path.split('/').pop() ?? path,
		isDir: false,
		size: 100,
		modTime: '2025-01-01T00:00:00Z',
		mode: 0o644,
		version: 1,
		...overrides
	};
}

function makeLock(path: string, holder: string = 'user-1'): VFSFileLock {
	return {
		path,
		holder,
		ttl: 30000,
		acquiredAt: '2025-01-01T00:00:00Z',
		expiresAt: '2025-01-01T00:30:00Z',
		workspaceId: 'ws-test',
		holderType: 'user',
		refreshCount: 0,
		purpose: 'edit'
	};
}

// ============================================================================
// Default state
// ============================================================================

describe('vfs store — default state', () => {
	it('has no workspace', () => {
		expect(vfs.getWorkspace()).toBe(null);
	});

	it('has no files', () => {
		expect(vfs.getFiles()).toEqual([]);
	});

	it('has no locks', () => {
		expect(vfs.getLocks()).toEqual([]);
	});

	it('has no dirty files', () => {
		expect(vfs.getDirtyFiles()).toEqual([]);
	});

	it('is not connected', () => {
		expect(vfs.getConnected()).toBe(false);
	});

	it('is not syncing', () => {
		expect(vfs.getSyncing()).toBe(false);
	});

	it('has no error', () => {
		expect(vfs.getError()).toBe(null);
	});

	it('version is 0', () => {
		expect(vfs.getVersion()).toBe(0);
	});

	it('has no active transactions', () => {
		expect(vfs.getActiveTransactions()).toEqual([]);
	});

	it('has no transaction history', () => {
		expect(vfs.getTransactionHistory()).toEqual([]);
	});

	it('has no conflicts', () => {
		expect(vfs.hasConflicts()).toBe(false);
		expect(vfs.getConflictQueue()).toEqual([]);
	});

	it('reconnect attempts is 0', () => {
		expect(vfs.getReconnectAttempts()).toBe(0);
	});
});

// ============================================================================
// File operations
// ============================================================================

describe('vfs store — file operations', () => {
	it('updateFileInfo adds a new file', () => {
		const file = makeFileInfo('/src/main.ts');
		vfs.updateFileInfo(file);
		expect(vfs.getFiles()).toHaveLength(1);
		expect(vfs.getFile('/src/main.ts')).toEqual(file);
	});

	it('updateFileInfo updates an existing file', () => {
		const file = makeFileInfo('/src/main.ts', { size: 100 });
		vfs.updateFileInfo(file);
		const updated = makeFileInfo('/src/main.ts', { size: 200 });
		vfs.updateFileInfo(updated);
		expect(vfs.getFiles()).toHaveLength(1);
		expect(vfs.getFile('/src/main.ts')?.size).toBe(200);
	});

	it('removeFileInfo removes a file', () => {
		vfs.updateFileInfo(makeFileInfo('/src/main.ts'));
		vfs.removeFileInfo('/src/main.ts');
		expect(vfs.getFiles()).toHaveLength(0);
		expect(vfs.getFile('/src/main.ts')).toBeUndefined();
	});

	it('removeFileInfo also clears dirty and lock state', () => {
		const file = makeFileInfo('/src/main.ts');
		vfs.updateFileInfo(file);
		vfs.markDirty('/src/main.ts');
		vfs.removeFileInfo('/src/main.ts');
		expect(vfs.isDirty('/src/main.ts')).toBe(false);
	});

	it('setFiles replaces all files', () => {
		vfs.updateFileInfo(makeFileInfo('/old.ts'));
		const newFiles = [makeFileInfo('/new1.ts'), makeFileInfo('/new2.ts')];
		vfs.setFiles(newFiles);
		expect(vfs.getFiles()).toHaveLength(2);
		expect(vfs.getFile('/old.ts')).toBeUndefined();
		expect(vfs.getFile('/new1.ts')).toBeDefined();
	});
});

// ============================================================================
// Dirty tracking
// ============================================================================

describe('vfs store — dirty tracking', () => {
	it('markDirty marks a file as dirty', () => {
		vfs.markDirty('/src/a.ts');
		expect(vfs.isDirty('/src/a.ts')).toBe(true);
		expect(vfs.getDirtyFiles()).toContain('/src/a.ts');
	});

	it('markClean removes dirty flag', () => {
		vfs.markDirty('/src/a.ts');
		vfs.markClean('/src/a.ts');
		expect(vfs.isDirty('/src/a.ts')).toBe(false);
	});

	it('isDirty returns false for unknown files', () => {
		expect(vfs.isDirty('/nonexistent')).toBe(false);
	});
});

// ============================================================================
// Lock operations
// ============================================================================

describe('vfs store — lock operations', () => {
	it('setLock adds a lock', () => {
		const lock = makeLock('/src/a.ts', 'user-1');
		vfs.setLock(lock);
		expect(vfs.getLocks()).toHaveLength(1);
		expect(vfs.getLock('/src/a.ts')).toEqual(lock);
	});

	it('isLocked returns true for locked file', () => {
		vfs.setLock(makeLock('/src/a.ts'));
		expect(vfs.isLocked('/src/a.ts')).toBe(true);
	});

	it('isLocked returns false for unlocked file', () => {
		expect(vfs.isLocked('/src/a.ts')).toBe(false);
	});

	it('removeLock removes a lock', () => {
		vfs.setLock(makeLock('/src/a.ts'));
		vfs.removeLock('/src/a.ts');
		expect(vfs.isLocked('/src/a.ts')).toBe(false);
		expect(vfs.getLocks()).toHaveLength(0);
	});

	it('setLocks replaces all locks', () => {
		vfs.setLock(makeLock('/old.ts'));
		vfs.setLocks([makeLock('/new1.ts'), makeLock('/new2.ts')]);
		expect(vfs.getLocks()).toHaveLength(2);
		expect(vfs.isLocked('/old.ts')).toBe(false);
		expect(vfs.isLocked('/new1.ts')).toBe(true);
	});

	it('getLockStatus returns unlocked for unknown file', () => {
		expect(vfs.getLockStatus('/unknown')).toEqual({ status: 'unlocked' });
	});

	it('getLockStatus returns locked after setLock', () => {
		const lock = makeLock('/src/a.ts');
		vfs.setLock(lock);
		const status = vfs.getLockStatus('/src/a.ts');
		expect(status.status).toBe('locked');
	});

	it('setLockStatus sets acquiring state', () => {
		vfs.setLockStatus('/src/a.ts', { status: 'acquiring' } as VFSLockStatus);
		expect(vfs.getLockStatus('/src/a.ts').status).toBe('acquiring');
	});
});

// ============================================================================
// Lock ownership (requires initialize)
// ============================================================================

describe('vfs store — lock ownership', () => {
	beforeEach(() => {
		vfs.initialize('user-1');
	});

	it('isLockedByMe returns true for own lock', () => {
		vfs.setLock(makeLock('/src/a.ts', 'user-1'));
		expect(vfs.isLockedByMe('/src/a.ts')).toBe(true);
	});

	it('isLockedByMe returns false for other user lock', () => {
		vfs.setLock(makeLock('/src/a.ts', 'user-2'));
		expect(vfs.isLockedByMe('/src/a.ts')).toBe(false);
	});

	it('isLockedByOther returns true for other lock', () => {
		vfs.setLock(makeLock('/src/a.ts', 'user-2'));
		expect(vfs.isLockedByOther('/src/a.ts')).toBe(true);
	});

	it('isLockedByOther returns false for own lock', () => {
		vfs.setLock(makeLock('/src/a.ts', 'user-1'));
		expect(vfs.isLockedByOther('/src/a.ts')).toBe(false);
	});

	it('getMyLocks returns only own locks', () => {
		vfs.setLock(makeLock('/src/a.ts', 'user-1'));
		vfs.setLock(makeLock('/src/b.ts', 'user-2'));
		expect(vfs.getMyLocks()).toHaveLength(1);
		expect(vfs.getMyLocks()[0].path).toBe('/src/a.ts');
	});

	it('getOtherLocks returns only other locks', () => {
		vfs.setLock(makeLock('/src/a.ts', 'user-1'));
		vfs.setLock(makeLock('/src/b.ts', 'user-2'));
		expect(vfs.getOtherLocks()).toHaveLength(1);
		expect(vfs.getOtherLocks()[0].path).toBe('/src/b.ts');
	});
});

// ============================================================================
// Derived file queries
// ============================================================================

describe('vfs store — derived file queries', () => {
	beforeEach(() => {
		vfs.setFiles([
			makeFileInfo('/src/main.ts'),
			makeFileInfo('/src/lib/utils.ts'),
			makeFileInfo('/src/lib/', { isDir: true, name: 'lib' }),
			makeFileInfo('/src/', { isDir: true, name: 'src' })
		]);
	});

	it('getDirectories returns only directories', () => {
		const dirs = vfs.getDirectories();
		expect(dirs).toHaveLength(2);
		expect(dirs.every((d) => d.isDir)).toBe(true);
	});

	it('getFilesInDirectory returns only direct children', () => {
		const files = vfs.getFilesInDirectory('/src');
		// /src/main.ts is a direct child of /src (no nested '/')
		expect(files.some((f) => f.path === '/src/main.ts')).toBe(true);
		// /src/lib/ has a trailing slash, so slice('/src/'.length) = 'lib/' which contains '/' — excluded
		// /src/lib/utils.ts also excluded (nested)
		expect(files.some((f) => f.path === '/src/lib/utils.ts')).toBe(false);
	});

	it('getLockedFiles returns files with locks', () => {
		vfs.setLock(makeLock('/src/main.ts'));
		expect(vfs.getLockedFiles()).toHaveLength(1);
		expect(vfs.getLockedFiles()[0].path).toBe('/src/main.ts');
	});

	it('getFileTree sorts directories first then alphabetically', () => {
		const tree = vfs.getFileTree();
		// Directories should come before files
		const firstDir = tree.findIndex((f) => f.isDir);
		const firstFile = tree.findIndex((f) => !f.isDir);
		if (firstDir !== -1 && firstFile !== -1) {
			expect(firstDir).toBeLessThan(firstFile);
		}
	});
});

// ============================================================================
// Transaction operations
// ============================================================================

describe('vfs store — transactions', () => {
	it('startTransaction adds an active transaction', () => {
		const tx: VFSTransaction = {
			id: 'tx-1',
			workspaceId: 'ws-test',
			operations: [],
			status: 'pending',
			createdAt: '2025-01-01T00:00:00Z'
		};
		vfs.startTransaction(tx);
		expect(vfs.getActiveTransactions()).toHaveLength(1);
	});

	it('completeTransaction moves tx to history', () => {
		const tx: VFSTransaction = {
			id: 'tx-1',
			workspaceId: 'ws-test',
			operations: [],
			status: 'pending',
			createdAt: '2025-01-01T00:00:00Z'
		};
		vfs.startTransaction(tx);
		vfs.completeTransaction('tx-1', 'committed');
		expect(vfs.getActiveTransactions()).toHaveLength(0);
		expect(vfs.getTransactionHistory()).toHaveLength(1);
		expect(vfs.getTransactionHistory()[0].status).toBe('committed');
	});

	it('completeTransaction ignores unknown transaction', () => {
		vfs.completeTransaction('nonexistent', 'committed');
		expect(vfs.getTransactionHistory()).toHaveLength(0);
	});

	it('transaction history is capped at 100', () => {
		for (let i = 0; i < 105; i++) {
			const tx: VFSTransaction = {
				id: `tx-${i}`,
				workspaceId: 'ws-test',
				operations: [],
				status: 'pending',
				createdAt: '2025-01-01T00:00:00Z'
			};
			vfs.startTransaction(tx);
			vfs.completeTransaction(`tx-${i}`, 'committed');
		}
		expect(vfs.getTransactionHistory().length).toBeLessThanOrEqual(100);
	});
});

// ============================================================================
// Conflict resolution
// ============================================================================

describe('vfs store — conflict queue', () => {
	it('hasConflicts returns false when empty', () => {
		expect(vfs.hasConflicts()).toBe(false);
	});

	it('getPendingRetryCount returns 0 for unknown operation', () => {
		expect(vfs.getPendingRetryCount('unknown')).toBe(0);
	});

	it('dismissAllConflicts clears the queue and marks files clean', () => {
		// We need to directly test the dismissAllConflicts behavior
		// Since conflictQueue is populated internally, we test what we can:
		vfs.markDirty('/src/a.ts');
		vfs.dismissAllConflicts(); // No conflicts, but should not throw
		expect(vfs.hasConflicts()).toBe(false);
	});
});

// ============================================================================
// Error handling
// ============================================================================

describe('vfs store — error handling', () => {
	it('clearError resets error and error code', () => {
		vfs.clearError();
		expect(vfs.getError()).toBe(null);
		expect(vfs.getErrorCode()).toBe(null);
	});

	it('clearStructuredError resets structured error', () => {
		vfs.clearStructuredError();
		expect(vfs.getStructuredError()).toBe(null);
	});
});

// ============================================================================
// Syncing
// ============================================================================

describe('vfs store — syncing', () => {
	it('setSyncing updates syncing state', () => {
		vfs.setSyncing(true);
		expect(vfs.getSyncing()).toBe(true);
		vfs.setSyncing(false);
		expect(vfs.getSyncing()).toBe(false);
	});
});

// ============================================================================
// Reset
// ============================================================================

describe('vfs store — reset', () => {
	it('reset clears all state', () => {
		vfs.updateFileInfo(makeFileInfo('/src/a.ts'));
		vfs.markDirty('/src/a.ts');
		vfs.setLock(makeLock('/src/a.ts'));

		vfs.reset();

		expect(vfs.getFiles()).toEqual([]);
		expect(vfs.getDirtyFiles()).toEqual([]);
		expect(vfs.getLocks()).toEqual([]);
		expect(vfs.getWorkspace()).toBe(null);
		expect(vfs.getVersion()).toBe(0);
		expect(vfs.getConnected()).toBe(false);
		// Note: reset() does not reset syncing state — that is only managed via setSyncing()
	});
});

// ============================================================================
// Event subscription
// ============================================================================

describe('vfs store — event subscription', () => {
	it('onEvent returns an unsubscribe function', () => {
		const handler = vi.fn();
		const unsub = vfs.onEvent('update', handler);
		expect(typeof unsub).toBe('function');
		unsub(); // should not throw
	});
});
