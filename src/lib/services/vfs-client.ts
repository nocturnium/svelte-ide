/**
 * VFS Client Service
 * Handles all HTTP interactions with a virtual filesystem (VFS) backend
 */

import {
	VFSError,
	type VFSFile,
	type VFSFileInfo,
	type VFSDirectory,
	type VFSWorkspace,
	type VFSTransaction,
	type VFSTransactionResult,
	type VFSOperation,
	type VFSFileLock,
	type VFSLockAcquisitionOptions,
	type VFSErrorCode,
	type VFSClientConfig
} from '$lib/types';

const DEFAULT_BASE_URL = '/api/vfs';
const DEFAULT_LOCK_TTL = 300000; // 5 minutes
const DEFAULT_MAX_RETRIES = 30;
const DEFAULT_RETRY_DELAY = 100; // 100ms
const DEFAULT_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// Configuration
// ============================================================================

let config: VFSClientConfig = {
	baseUrl: DEFAULT_BASE_URL,
	timeout: DEFAULT_TIMEOUT,
	lockTTL: DEFAULT_LOCK_TTL,
	maxReconnectAttempts: 10
};

export function configure(newConfig: Partial<VFSClientConfig>): void {
	config = { ...config, ...newConfig };
}

export function getConfig(): VFSClientConfig {
	return { ...config };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const url = `${config.baseUrl}${path}`;
	const timeout = config.timeout ?? DEFAULT_TIMEOUT;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				...options.headers
			}
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ message: response.statusText }));
			throw new VFSError(
				error.message || `HTTP ${response.status}`,
				mapStatusToErrorCode(response.status),
				error
			);
		}

		// Handle empty responses
		const text = await response.text();
		if (!text) {
			return undefined as T;
		}

		return JSON.parse(text);
	} catch (err) {
		if (err instanceof VFSError) throw err;

		if (err instanceof Error && err.name === 'AbortError') {
			throw new VFSError('Request timeout', 'TIMEOUT');
		}

		throw new VFSError(err instanceof Error ? err.message : 'Unknown error', 'NETWORK_ERROR', err);
	} finally {
		clearTimeout(timeoutId);
	}
}

function mapStatusToErrorCode(status: number): VFSErrorCode {
	switch (status) {
		case 401:
		case 403:
			return 'PERMISSION_DENIED';
		case 404:
			return 'FILE_NOT_FOUND';
		case 409:
			return 'VERSION_CONFLICT';
		case 423:
			return 'FILE_LOCKED';
		case 429:
			return 'RATE_LIMITED';
		case 500:
		case 502:
		case 503:
		case 504:
			return 'SERVER_ERROR';
		default:
			return 'NETWORK_ERROR';
	}
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Workspace Operations
// ============================================================================

export async function getWorkspace(workspaceId: string): Promise<VFSWorkspace> {
	return request<VFSWorkspace>(`/workspaces/${workspaceId}`);
}

export async function updateWorkspace(
	workspaceId: string,
	updates: Partial<VFSWorkspace>
): Promise<VFSWorkspace> {
	return request<VFSWorkspace>(`/workspaces/${workspaceId}`, {
		method: 'PATCH',
		body: JSON.stringify(updates)
	});
}

export async function listWorkspaces(): Promise<VFSWorkspace[]> {
	return request<VFSWorkspace[]>('/workspaces');
}

// ============================================================================
// File Operations
// ============================================================================

export async function readFile(workspaceId: string, path: string): Promise<VFSFile> {
	return request<VFSFile>(`/files?workspace=${workspaceId}&path=${encodeURIComponent(path)}`);
}

export async function writeFile(
	workspaceId: string,
	path: string,
	content: string,
	version?: number
): Promise<VFSFileInfo> {
	return request<VFSFileInfo>(`/files`, {
		method: 'PUT',
		body: JSON.stringify({ workspace: workspaceId, path, content, version })
	});
}

export async function deleteFile(
	workspaceId: string,
	path: string,
	version?: number
): Promise<void> {
	return request<void>(`/files`, {
		method: 'DELETE',
		body: JSON.stringify({ workspace: workspaceId, path, version })
	});
}

export async function renameFile(
	workspaceId: string,
	oldPath: string,
	newPath: string,
	version?: number
): Promise<VFSFileInfo> {
	return request<VFSFileInfo>(`/files/rename`, {
		method: 'POST',
		body: JSON.stringify({ workspace: workspaceId, oldPath, newPath, version })
	});
}

export async function getFileInfo(workspaceId: string, path: string): Promise<VFSFileInfo> {
	return request<VFSFileInfo>(
		`/files/info?workspace=${workspaceId}&path=${encodeURIComponent(path)}`
	);
}

export async function copyFile(
	workspaceId: string,
	sourcePath: string,
	destPath: string
): Promise<VFSFileInfo> {
	return request<VFSFileInfo>(`/files/copy`, {
		method: 'POST',
		body: JSON.stringify({ workspace: workspaceId, source: sourcePath, destination: destPath })
	});
}

// ============================================================================
// Directory Operations
// ============================================================================

export async function readDirectory(workspaceId: string, path: string): Promise<VFSDirectory> {
	return request<VFSDirectory>(`/dirs?workspace=${workspaceId}&path=${encodeURIComponent(path)}`);
}

export async function createDirectory(workspaceId: string, path: string): Promise<VFSFileInfo> {
	return request<VFSFileInfo>(`/dirs`, {
		method: 'POST',
		body: JSON.stringify({ workspace: workspaceId, path })
	});
}

export async function deleteDirectory(
	workspaceId: string,
	path: string,
	recursive = false
): Promise<void> {
	return request<void>(`/dirs`, {
		method: 'DELETE',
		body: JSON.stringify({ workspace: workspaceId, path, recursive })
	});
}

// ============================================================================
// Quick Operations (Auto-Transaction)
// ============================================================================

export async function quickWriteFile(
	workspaceId: string,
	path: string,
	content: string
): Promise<VFSFileInfo> {
	return request<VFSFileInfo>(`/quick/files`, {
		method: 'PUT',
		body: JSON.stringify({ workspace: workspaceId, path, content })
	});
}

export async function quickDeleteFile(workspaceId: string, path: string): Promise<void> {
	return request<void>(`/quick/files`, {
		method: 'DELETE',
		body: JSON.stringify({ workspace: workspaceId, path })
	});
}

// ============================================================================
// Transaction Operations
// ============================================================================

export async function beginTransaction(workspaceId: string): Promise<string> {
	const result = await request<{ transactionId: string }>(`/tx/begin`, {
		method: 'POST',
		body: JSON.stringify({ workspace: workspaceId })
	});
	return result.transactionId;
}

export async function commitTransaction(
	transactionId: string,
	operations: VFSOperation[]
): Promise<VFSTransactionResult> {
	return request<VFSTransactionResult>(`/tx/${transactionId}/commit`, {
		method: 'POST',
		body: JSON.stringify({ operations })
	});
}

export async function rollbackTransaction(transactionId: string): Promise<void> {
	return request<void>(`/tx/${transactionId}/rollback`, {
		method: 'POST'
	});
}

export async function getTransaction(transactionId: string): Promise<VFSTransaction> {
	return request<VFSTransaction>(`/tx/${transactionId}`);
}

/**
 * Execute multiple operations in a transaction
 * Auto-commits on success, auto-rollbacks on failure
 */
export async function executeTransaction(
	workspaceId: string,
	operations: VFSOperation[]
): Promise<VFSTransactionResult> {
	const txId = await beginTransaction(workspaceId);

	try {
		const result = await commitTransaction(txId, operations);
		return result;
	} catch (err) {
		await rollbackTransaction(txId).catch(() => {
			// Rollback failed, transaction will auto-expire
		});
		throw err;
	}
}

// ============================================================================
// Lock Operations
// ============================================================================

export async function acquireLock(
	workspaceId: string,
	path: string,
	holder: string,
	options: VFSLockAcquisitionOptions = {}
): Promise<VFSFileLock> {
	const {
		ttl = config.lockTTL ?? DEFAULT_LOCK_TTL,
		maxRetries = DEFAULT_MAX_RETRIES,
		retryDelay = DEFAULT_RETRY_DELAY,
		purpose
	} = options;

	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const lock = await request<VFSFileLock>(`/locks`, {
				method: 'POST',
				body: JSON.stringify({
					workspace: workspaceId,
					path,
					holder,
					ttl,
					purpose
				})
			});

			return lock;
		} catch (err) {
			if (err instanceof VFSError && err.code === 'FILE_LOCKED') {
				lastError = err;
				await sleep(retryDelay);
				continue;
			}

			// Other error, throw immediately
			throw err;
		}
	}

	throw lastError || new VFSError('Failed to acquire lock after retries', 'FILE_LOCKED');
}

export async function releaseLock(
	workspaceId: string,
	path: string,
	holder: string
): Promise<void> {
	return request<void>(`/locks`, {
		method: 'DELETE',
		body: JSON.stringify({ workspace: workspaceId, path, holder })
	});
}

export async function refreshLock(
	workspaceId: string,
	path: string,
	holder: string
): Promise<VFSFileLock> {
	return request<VFSFileLock>(`/locks/refresh`, {
		method: 'POST',
		body: JSON.stringify({ workspace: workspaceId, path, holder })
	});
}

export async function getLockInfo(workspaceId: string, path: string): Promise<VFSFileLock | null> {
	try {
		return await request<VFSFileLock>(
			`/locks?workspace=${workspaceId}&path=${encodeURIComponent(path)}`
		);
	} catch (err) {
		if (err instanceof VFSError && err.code === 'FILE_NOT_FOUND') {
			return null; // No lock exists
		}
		throw err;
	}
}

export async function listLocks(workspaceId: string): Promise<VFSFileLock[]> {
	return request<VFSFileLock[]>(`/locks?workspace=${workspaceId}`);
}

export async function forceReleaseLock(
	workspaceId: string,
	path: string,
	adminId: string
): Promise<void> {
	return request<void>(`/locks/force`, {
		method: 'DELETE',
		body: JSON.stringify({ workspace: workspaceId, path, admin: adminId })
	});
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Execute a function with a file lock
 * Automatically acquires, executes, and releases
 */
export async function withLock<T>(
	workspaceId: string,
	path: string,
	holder: string,
	fn: () => Promise<T>,
	options?: VFSLockAcquisitionOptions
): Promise<T> {
	const _lock = await acquireLock(workspaceId, path, holder, options);

	try {
		return await fn();
	} finally {
		await releaseLock(workspaceId, path, holder).catch(() => {
			// Lock release failed, will auto-expire
		});
	}
}

/**
 * Batch file operations with automatic locking and transaction
 */
export async function batchUpdate(
	workspaceId: string,
	holder: string,
	updates: Array<{ path: string; content: string; version?: number }>
): Promise<VFSTransactionResult> {
	// Acquire all locks first
	const locks: VFSFileLock[] = [];

	try {
		for (const update of updates) {
			const lock = await acquireLock(workspaceId, update.path, holder);
			locks.push(lock);
		}

		// Execute transaction
		const operations: VFSOperation[] = updates.map((u) => ({
			type: 'update' as const,
			path: u.path,
			content: u.content,
			version: u.version ?? 0
		}));

		return await executeTransaction(workspaceId, operations);
	} finally {
		// Release all locks
		for (const lock of locks) {
			await releaseLock(workspaceId, lock.path, holder).catch(() => {});
		}
	}
}

/**
 * Read file with automatic version tracking
 */
export async function readFileWithVersion(
	workspaceId: string,
	path: string
): Promise<{ content: string; version: number }> {
	const file = await readFile(workspaceId, path);
	return {
		content: typeof file.content === 'string' ? file.content : '',
		version: file.info.version
	};
}

/**
 * Write file with version conflict detection
 */
export async function safeWriteFile(
	workspaceId: string,
	path: string,
	content: string,
	expectedVersion: number
): Promise<VFSFileInfo> {
	return writeFile(workspaceId, path, content, expectedVersion);
}

// ============================================================================
// Search Operations
// ============================================================================

export interface VFSSearchOptions {
	pattern: string;
	caseSensitive?: boolean;
	regex?: boolean;
	includeHidden?: boolean;
	maxResults?: number;
	filePatterns?: string[];
}

export interface VFSSearchResult {
	path: string;
	line: number;
	column: number;
	content: string;
	matchStart: number;
	matchEnd: number;
}

export async function searchFiles(
	workspaceId: string,
	options: VFSSearchOptions
): Promise<VFSSearchResult[]> {
	return request<VFSSearchResult[]>(`/search`, {
		method: 'POST',
		body: JSON.stringify({ workspace: workspaceId, ...options })
	});
}

// ============================================================================
// Health Check
// ============================================================================

export async function healthCheck(): Promise<{ status: 'ok' | 'error'; latency: number }> {
	const start = Date.now();
	try {
		await request<{ status: string }>('/health');
		return { status: 'ok', latency: Date.now() - start };
	} catch {
		return { status: 'error', latency: Date.now() - start };
	}
}
