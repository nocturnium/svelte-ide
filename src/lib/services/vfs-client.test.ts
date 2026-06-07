import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VFSError } from '$lib/types';
import {
	configure,
	getConfig,
	getWorkspace,
	updateWorkspace,
	listWorkspaces,
	readFile,
	writeFile,
	deleteFile,
	renameFile,
	getFileInfo,
	copyFile,
	readDirectory,
	createDirectory,
	deleteDirectory,
	quickWriteFile,
	quickDeleteFile,
	beginTransaction,
	commitTransaction,
	rollbackTransaction,
	getTransaction,
	executeTransaction,
	acquireLock,
	releaseLock,
	refreshLock,
	getLockInfo,
	listLocks,
	forceReleaseLock,
	withLock,
	batchUpdate,
	readFileWithVersion,
	safeWriteFile,
	searchFiles,
	healthCheck
} from './vfs-client';

// ============================================================================
// Fetch Mock Helpers
// ============================================================================

let fetchMock: ReturnType<typeof vi.fn>;

function mockFetchSuccess(data: unknown, status = 200): void {
	fetchMock.mockResolvedValueOnce(
		new Response(JSON.stringify(data), {
			status,
			headers: { 'Content-Type': 'application/json' }
		})
	);
}

function mockFetchEmpty(): void {
	fetchMock.mockResolvedValueOnce(
		new Response('', { status: 200, headers: { 'Content-Type': 'application/json' } })
	);
}

function mockFetchError(status: number, body: { message: string } = { message: 'error' }): void {
	fetchMock.mockResolvedValueOnce(
		new Response(JSON.stringify(body), {
			status,
			statusText: `HTTP ${status}`,
			headers: { 'Content-Type': 'application/json' }
		})
	);
}

function mockFetchNetworkError(): void {
	fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);

	// Reset config to defaults
	configure({
		baseUrl: '/api/vfs',
		timeout: 30000,
		lockTTL: 300000,
		maxReconnectAttempts: 10
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ============================================================================
// Tests: Configuration
// ============================================================================

describe('VFS Client — Configuration', () => {
	it('should return default config', () => {
		const cfg = getConfig();
		expect(cfg.baseUrl).toBe('/api/vfs');
		expect(cfg.timeout).toBe(30000);
	});

	it('should merge partial config', () => {
		configure({ baseUrl: '/custom/vfs', timeout: 5000 });
		const cfg = getConfig();
		expect(cfg.baseUrl).toBe('/custom/vfs');
		expect(cfg.timeout).toBe(5000);
		expect(cfg.lockTTL).toBe(300000); // unchanged
	});

	it('should return a copy (not reference)', () => {
		const cfg1 = getConfig();
		cfg1.baseUrl = '/mutated';
		expect(getConfig().baseUrl).not.toBe('/mutated');
	});
});

// ============================================================================
// Tests: Workspace Operations
// ============================================================================

describe('VFS Client — Workspace Operations', () => {
	it('should get a workspace', async () => {
		const workspace = { id: 'ws1', name: 'Test', rootPath: '/' };
		mockFetchSuccess(workspace);

		const result = await getWorkspace('ws1');
		expect(result).toEqual(workspace);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/workspaces/ws1',
			expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
		);
	});

	it('should update a workspace', async () => {
		const updated = { id: 'ws1', name: 'Updated' };
		mockFetchSuccess(updated);

		const result = await updateWorkspace('ws1', { name: 'Updated' });
		expect(result).toEqual(updated);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/workspaces/ws1',
			expect.objectContaining({ method: 'PATCH' })
		);
	});

	it('should list workspaces', async () => {
		mockFetchSuccess([{ id: 'ws1' }, { id: 'ws2' }]);

		const result = await listWorkspaces();
		expect(result).toHaveLength(2);
	});
});

// ============================================================================
// Tests: File Operations
// ============================================================================

describe('VFS Client — File Operations', () => {
	it('should read a file', async () => {
		const file = { info: { path: '/test.ts', version: 1 }, content: 'hello' };
		mockFetchSuccess(file);

		const result = await readFile('ws1', '/test.ts');
		expect(result).toEqual(file);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/files?workspace=ws1&path=%2Ftest.ts',
			expect.any(Object)
		);
	});

	it('should write a file', async () => {
		const fileInfo = { path: '/test.ts', version: 2 };
		mockFetchSuccess(fileInfo);

		const result = await writeFile('ws1', '/test.ts', 'new content', 1);
		expect(result).toEqual(fileInfo);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/files',
			expect.objectContaining({ method: 'PUT' })
		);
	});

	it('should delete a file', async () => {
		mockFetchEmpty();

		await deleteFile('ws1', '/test.ts', 1);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/files',
			expect.objectContaining({ method: 'DELETE' })
		);
	});

	it('should rename a file', async () => {
		const fileInfo = { path: '/new.ts', version: 2 };
		mockFetchSuccess(fileInfo);

		const result = await renameFile('ws1', '/old.ts', '/new.ts');
		expect(result).toEqual(fileInfo);
	});

	it('should get file info', async () => {
		const info = { path: '/test.ts', size: 100, version: 1 };
		mockFetchSuccess(info);

		const result = await getFileInfo('ws1', '/test.ts');
		expect(result).toEqual(info);
	});

	it('should copy a file', async () => {
		const info = { path: '/copy.ts', version: 1 };
		mockFetchSuccess(info);

		const result = await copyFile('ws1', '/test.ts', '/copy.ts');
		expect(result).toEqual(info);
	});
});

// ============================================================================
// Tests: Directory Operations
// ============================================================================

describe('VFS Client — Directory Operations', () => {
	it('should read a directory', async () => {
		const dir = { path: '/src', entries: [], totalSize: 0, fileCount: 0, dirCount: 0 };
		mockFetchSuccess(dir);

		const result = await readDirectory('ws1', '/src');
		expect(result).toEqual(dir);
	});

	it('should create a directory', async () => {
		const info = { path: '/src/new', isDir: true };
		mockFetchSuccess(info);

		const result = await createDirectory('ws1', '/src/new');
		expect(result).toEqual(info);
	});

	it('should delete a directory', async () => {
		mockFetchEmpty();

		await deleteDirectory('ws1', '/src/old', true);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/dirs',
			expect.objectContaining({ method: 'DELETE' })
		);
	});
});

// ============================================================================
// Tests: Quick Operations
// ============================================================================

describe('VFS Client — Quick Operations', () => {
	it('should quick-write a file', async () => {
		const info = { path: '/quick.ts', version: 1 };
		mockFetchSuccess(info);

		const result = await quickWriteFile('ws1', '/quick.ts', 'content');
		expect(result).toEqual(info);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/quick/files',
			expect.objectContaining({ method: 'PUT' })
		);
	});

	it('should quick-delete a file', async () => {
		mockFetchEmpty();

		await quickDeleteFile('ws1', '/quick.ts');
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/quick/files',
			expect.objectContaining({ method: 'DELETE' })
		);
	});
});

// ============================================================================
// Tests: Transaction Operations
// ============================================================================

describe('VFS Client — Transaction Operations', () => {
	it('should begin a transaction', async () => {
		mockFetchSuccess({ transactionId: 'tx-123' });

		const txId = await beginTransaction('ws1');
		expect(txId).toBe('tx-123');
	});

	it('should commit a transaction', async () => {
		const txResult = { transactionId: 'tx-123', success: true, operations: [] };
		mockFetchSuccess(txResult);

		const result = await commitTransaction('tx-123', []);
		expect(result).toEqual(txResult);
	});

	it('should rollback a transaction', async () => {
		mockFetchEmpty();

		await rollbackTransaction('tx-123');
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/tx/tx-123/rollback',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('should get transaction status', async () => {
		const tx = { id: 'tx-123', status: 'pending' };
		mockFetchSuccess(tx);

		const result = await getTransaction('tx-123');
		expect(result).toEqual(tx);
	});

	it('should execute a full transaction (begin + commit)', async () => {
		mockFetchSuccess({ transactionId: 'tx-auto' }); // begin
		mockFetchSuccess({ transactionId: 'tx-auto', success: true, operations: [] }); // commit

		const result = await executeTransaction('ws1', [
			{ type: 'create', path: '/new.ts', content: 'hello' }
		]);
		expect(result.success).toBe(true);
	});

	it('should rollback on commit failure in executeTransaction', async () => {
		mockFetchSuccess({ transactionId: 'tx-fail' }); // begin
		mockFetchError(500, { message: 'Commit failed' }); // commit fails
		mockFetchEmpty(); // rollback

		await expect(
			executeTransaction('ws1', [{ type: 'create', path: '/fail.ts', content: '' }])
		).rejects.toThrow();

		// Rollback should have been called
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});

// ============================================================================
// Tests: Lock Operations
// ============================================================================

describe('VFS Client — Lock Operations', () => {
	it('should acquire a lock', async () => {
		const lock = { path: '/test.ts', holder: 'user1', workspaceId: 'ws1' };
		mockFetchSuccess(lock);

		const result = await acquireLock('ws1', '/test.ts', 'user1');
		expect(result).toEqual(lock);
	});

	it('should retry on FILE_LOCKED and eventually succeed', async () => {
		// First attempt: locked
		mockFetchError(423, { message: 'File is locked' });
		// Second attempt: success
		const lock = { path: '/test.ts', holder: 'user1' };
		mockFetchSuccess(lock);

		const result = await acquireLock('ws1', '/test.ts', 'user1', {
			maxRetries: 3,
			retryDelay: 10
		});
		expect(result).toEqual(lock);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('should fail after exhausting retries', async () => {
		// All attempts: locked
		for (let i = 0; i < 3; i++) {
			mockFetchError(423, { message: 'File is locked' });
		}

		await expect(
			acquireLock('ws1', '/test.ts', 'user1', { maxRetries: 3, retryDelay: 1 })
		).rejects.toThrow();
	});

	it('should throw immediately on non-lock errors', async () => {
		mockFetchError(404, { message: 'Not found' });

		await expect(
			acquireLock('ws1', '/test.ts', 'user1', { maxRetries: 3, retryDelay: 1 })
		).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('should release a lock', async () => {
		mockFetchEmpty();

		await releaseLock('ws1', '/test.ts', 'user1');
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/locks',
			expect.objectContaining({ method: 'DELETE' })
		);
	});

	it('should refresh a lock', async () => {
		const lock = { path: '/test.ts', holder: 'user1', refreshCount: 1 };
		mockFetchSuccess(lock);

		const result = await refreshLock('ws1', '/test.ts', 'user1');
		expect(result.refreshCount).toBe(1);
	});

	it('should return null for non-existent lock info', async () => {
		mockFetchError(404, { message: 'Not found' });

		const result = await getLockInfo('ws1', '/test.ts');
		expect(result).toBeNull();
	});

	it('should list locks', async () => {
		mockFetchSuccess([{ path: '/a.ts' }, { path: '/b.ts' }]);

		const result = await listLocks('ws1');
		expect(result).toHaveLength(2);
	});

	it('should force-release a lock', async () => {
		mockFetchEmpty();

		await forceReleaseLock('ws1', '/test.ts', 'admin1');
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/vfs/locks/force',
			expect.objectContaining({ method: 'DELETE' })
		);
	});
});

// ============================================================================
// Tests: Convenience Functions
// ============================================================================

describe('VFS Client — Convenience Functions', () => {
	it('withLock should acquire, execute, and release', async () => {
		const lock = { path: '/test.ts', holder: 'user1' };
		mockFetchSuccess(lock); // acquire
		mockFetchEmpty(); // release

		const result = await withLock('ws1', '/test.ts', 'user1', async () => {
			return 'done';
		});

		expect(result).toBe('done');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('withLock should release even if fn throws', async () => {
		const lock = { path: '/test.ts', holder: 'user1' };
		mockFetchSuccess(lock); // acquire
		mockFetchEmpty(); // release

		await expect(
			withLock('ws1', '/test.ts', 'user1', async () => {
				throw new Error('fn failed');
			})
		).rejects.toThrow('fn failed');

		// Release should still be called
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('readFileWithVersion should extract content and version', async () => {
		const file = { info: { path: '/test.ts', version: 5 }, content: 'hello world' };
		mockFetchSuccess(file);

		const result = await readFileWithVersion('ws1', '/test.ts');
		expect(result.content).toBe('hello world');
		expect(result.version).toBe(5);
	});

	it('safeWriteFile should pass expected version', async () => {
		const info = { path: '/test.ts', version: 6 };
		mockFetchSuccess(info);

		const result = await safeWriteFile('ws1', '/test.ts', 'new', 5);
		expect(result.version).toBe(6);

		// Verify the body contains the version
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.version).toBe(5);
	});
});

// ============================================================================
// Tests: Batch Update
// ============================================================================

describe('VFS Client — batchUpdate', () => {
	it('should acquire locks, execute transaction, and release locks', async () => {
		// Lock 1
		mockFetchSuccess({ path: '/a.ts', holder: 'user1' });
		// Lock 2
		mockFetchSuccess({ path: '/b.ts', holder: 'user1' });
		// Begin transaction
		mockFetchSuccess({ transactionId: 'tx-batch' });
		// Commit transaction
		mockFetchSuccess({ transactionId: 'tx-batch', success: true, operations: [] });
		// Release lock 1
		mockFetchEmpty();
		// Release lock 2
		mockFetchEmpty();

		const result = await batchUpdate('ws1', 'user1', [
			{ path: '/a.ts', content: 'a' },
			{ path: '/b.ts', content: 'b' }
		]);
		expect(result.success).toBe(true);
	});
});

// ============================================================================
// Tests: Search
// ============================================================================

describe('VFS Client — Search', () => {
	it('should search files', async () => {
		const results = [{ path: '/test.ts', line: 10, column: 5, content: 'match', matchStart: 0, matchEnd: 5 }];
		mockFetchSuccess(results);

		const result = await searchFiles('ws1', { pattern: 'match' });
		expect(result).toEqual(results);
	});
});

// ============================================================================
// Tests: Health Check
// ============================================================================

describe('VFS Client — Health Check', () => {
	it('should return ok on success', async () => {
		mockFetchSuccess({ status: 'ok' });

		const result = await healthCheck();
		expect(result.status).toBe('ok');
		expect(result.latency).toBeGreaterThanOrEqual(0);
	});

	it('should return error on failure', async () => {
		mockFetchNetworkError();

		const result = await healthCheck();
		expect(result.status).toBe('error');
		expect(result.latency).toBeGreaterThanOrEqual(0);
	});
});

// ============================================================================
// Tests: Error Handling
// ============================================================================

describe('VFS Client — Error Handling', () => {
	it('should throw VFSError with FILE_NOT_FOUND for 404', async () => {
		mockFetchError(404, { message: 'Not found' });

		try {
			await readFile('ws1', '/missing.ts');
			expect.fail('Should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(VFSError);
			expect((err as VFSError).code).toBe('FILE_NOT_FOUND');
		}
	});

	it('should throw VFSError with PERMISSION_DENIED for 403', async () => {
		mockFetchError(403, { message: 'Forbidden' });

		try {
			await readFile('ws1', '/secret.ts');
			expect.fail('Should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(VFSError);
			expect((err as VFSError).code).toBe('PERMISSION_DENIED');
		}
	});

	it('should throw VFSError with VERSION_CONFLICT for 409', async () => {
		mockFetchError(409, { message: 'Conflict' });

		try {
			await writeFile('ws1', '/test.ts', 'content', 1);
			expect.fail('Should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(VFSError);
			expect((err as VFSError).code).toBe('VERSION_CONFLICT');
		}
	});

	it('should throw VFSError with FILE_LOCKED for 423', async () => {
		mockFetchError(423, { message: 'Locked' });

		try {
			await writeFile('ws1', '/locked.ts', 'content');
			expect.fail('Should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(VFSError);
			expect((err as VFSError).code).toBe('FILE_LOCKED');
		}
	});

	it('should throw VFSError with NETWORK_ERROR for network failures', async () => {
		mockFetchNetworkError();

		try {
			await readFile('ws1', '/test.ts');
			expect.fail('Should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(VFSError);
			expect((err as VFSError).code).toBe('NETWORK_ERROR');
		}
	});

	it('should throw VFSError with NETWORK_ERROR on timeout (AbortError)', async () => {
		fetchMock.mockImplementationOnce(() => {
			const error = new Error('Aborted');
			error.name = 'AbortError';
			return Promise.reject(error);
		});

		try {
			await readFile('ws1', '/test.ts');
			expect.fail('Should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(VFSError);
			expect((err as VFSError).code).toBe('NETWORK_ERROR');
		}
	});
});
