/**
 * VFS store using Svelte 5 runes
 * Manages workspace state, file tree, locks, and SSE events
 *
 * Note: Svelte 5 modules cannot directly export $derived values.
 * We use getter functions to expose reactive derived state.
 */

import type {
	VFSWorkspace,
	VFSFileInfo,
	VFSFileLock,
	VFSEvent,
	VFSTransaction,
	VFSLockStatus,
	VFSErrorCode,
	VFSSnapshotEvent,
	VFSUpdateEvent,
	VFSLockAcquiredEvent,
	VFSLockReleasedEvent
} from '$lib/types';
import * as vfsClient from '$lib/services/vfs-client';
import { SvelteMap } from 'svelte/reactivity';
import { parseError, isConflictError, logError, type VFSError } from '$lib/services/error-handling';
import { optimisticUpdate, type OptimisticResult } from '$lib/services/optimistic';

interface VFSState {
	// Workspace
	workspace: VFSWorkspace | null;
	workspaceLoading: boolean;

	// File tree
	files: VFSFileInfo[];
	fileMap: Map<string, VFSFileInfo>; // path -> info
	dirtyFiles: Set<string>; // Local changes not synced

	// Locks
	locks: Map<string, VFSFileLock>; // path -> lock
	lockStatuses: Map<string, VFSLockStatus>; // path -> status
	pendingLocks: Set<string>; // Paths with acquisition in progress

	// Transactions
	activeTransactions: Map<string, VFSTransaction>; // txId -> transaction
	transactionHistory: VFSTransaction[];

	// SSE Connection
	eventSource: EventSource | null;
	connected: boolean;
	lastEventTime: string | null;
	reconnectAttempts: number;

	// State
	syncing: boolean;
	error: string | null;
	errorCode: VFSErrorCode | null;
	structuredError: VFSError | null;
	version: number; // Workspace version for conflict detection

	// Recovery state
	pendingRetries: Map<string, number>; // operationId -> retryCount
	conflictQueue: Array<{ path: string; localContent: string; serverVersion: number }>;
}

// Reactive state using $state rune
const state = $state<VFSState>({
	workspace: null,
	workspaceLoading: false,
	files: [],
	fileMap: new Map(),
	dirtyFiles: new Set(),
	locks: new Map(),
	lockStatuses: new Map(),
	pendingLocks: new Set(),
	activeTransactions: new Map(),
	transactionHistory: [],
	eventSource: null,
	connected: false,
	lastEventTime: null,
	reconnectAttempts: 0,
	syncing: false,
	error: null,
	errorCode: null,
	structuredError: null,
	version: 0,
	pendingRetries: new Map(),
	conflictQueue: []
});

// Event handlers for SSE
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive internal subscription registry, not UI state
const eventHandlers = new Map<VFSEvent['type'] | '*', Set<(event: VFSEvent) => void>>();

// Lock TTL refresh intervals
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive internal timer registry, not UI state
const lockRefreshIntervals = new Map<string, number>(); // path -> intervalId

// Current user ID (set during initialization)
let currentUserId: string | null = null;

// ============================================================================
// Getter Functions (Svelte 5 module-safe)
// ============================================================================

export function getWorkspace(): VFSWorkspace | null {
	return state.workspace;
}

export function getWorkspaceLoading(): boolean {
	return state.workspaceLoading;
}

export function getFiles(): VFSFileInfo[] {
	return state.files;
}

export function getFileTree(): VFSFileInfo[] {
	return buildTree(state.files);
}

export function getFile(path: string): VFSFileInfo | undefined {
	return state.fileMap.get(path);
}

export function getLocks(): VFSFileLock[] {
	return Array.from(state.locks.values());
}

export function getLock(path: string): VFSFileLock | undefined {
	return state.locks.get(path);
}

export function getLockStatus(path: string): VFSLockStatus {
	return state.lockStatuses.get(path) ?? { status: 'unlocked' };
}

export function isLocked(path: string): boolean {
	return state.locks.has(path);
}

export function isLockedByMe(path: string): boolean {
	if (!currentUserId) return false;
	const lock = state.locks.get(path);
	return lock?.holder === currentUserId;
}

export function isLockedByOther(path: string): boolean {
	if (!currentUserId) return false;
	const lock = state.locks.get(path);
	return lock !== undefined && lock.holder !== currentUserId;
}

export function getMyLocks(): VFSFileLock[] {
	if (!currentUserId) return [];
	return getLocks().filter((lock) => lock.holder === currentUserId);
}

export function getOtherLocks(): VFSFileLock[] {
	if (!currentUserId) return getLocks();
	return getLocks().filter((lock) => lock.holder !== currentUserId);
}

export function getDirtyFiles(): string[] {
	return Array.from(state.dirtyFiles);
}

export function isDirty(path: string): boolean {
	return state.dirtyFiles.has(path);
}

export function getActiveTransactions(): VFSTransaction[] {
	return Array.from(state.activeTransactions.values());
}

export function getTransactionHistory(): VFSTransaction[] {
	return state.transactionHistory;
}

export function getConnected(): boolean {
	return state.connected;
}

export function getSyncing(): boolean {
	return state.syncing;
}

export function getError(): string | null {
	return state.error;
}

export function getErrorCode(): VFSErrorCode | null {
	return state.errorCode;
}

export function getVersion(): number {
	return state.version;
}

export function getReconnectAttempts(): number {
	return state.reconnectAttempts;
}

export function getStructuredError(): VFSError | null {
	return state.structuredError;
}

export function getConflictQueue(): Array<{
	path: string;
	localContent: string;
	serverVersion: number;
}> {
	return state.conflictQueue;
}

export function hasConflicts(): boolean {
	return state.conflictQueue.length > 0;
}

export function getPendingRetryCount(operationId: string): number {
	return state.pendingRetries.get(operationId) ?? 0;
}

// Derived getters
export function getLockedFiles(): VFSFileInfo[] {
	return state.files.filter((f) => state.locks.has(f.path));
}

export function getMyLockedFiles(): VFSFileInfo[] {
	return state.files.filter((f) => isLockedByMe(f.path));
}

export function getDirectories(): VFSFileInfo[] {
	return state.files.filter((f) => f.isDir);
}

export function getFilesInDirectory(dirPath: string): VFSFileInfo[] {
	const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
	return state.files.filter(
		(f) => f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes('/')
	);
}

// Legacy aliases for backward compatibility
export const workspace = {
	get current() {
		return getWorkspace();
	}
};
export const workspaceLoading = {
	get current() {
		return getWorkspaceLoading();
	}
};
export const files = {
	get current() {
		return getFiles();
	}
};
export const fileTree = {
	get current() {
		return getFileTree();
	}
};
export const locks = {
	get current() {
		return getLocks();
	}
};
export const dirtyFiles = {
	get current() {
		return getDirtyFiles();
	}
};
export const activeTransactions = {
	get current() {
		return getActiveTransactions();
	}
};
export const connected = {
	get current() {
		return getConnected();
	}
};
export const syncing = {
	get current() {
		return getSyncing();
	}
};
export const error = {
	get current() {
		return getError();
	}
};

// ============================================================================
// Initialization
// ============================================================================

export function initialize(userId: string, workspaceId?: string): void {
	currentUserId = userId;
	if (workspaceId) {
		loadWorkspace(workspaceId);
	}
}

// ============================================================================
// Workspace Operations
// ============================================================================

export async function loadWorkspace(workspaceId: string): Promise<void> {
	state.workspaceLoading = true;
	state.error = null;

	try {
		const workspace = await vfsClient.getWorkspace(workspaceId);
		state.workspace = workspace;

		// Connect to SSE stream
		connect(workspaceId);
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to load workspace';
	} finally {
		state.workspaceLoading = false;
	}
}

// ============================================================================
// File Operations
// ============================================================================

export function updateFileInfo(fileInfo: VFSFileInfo): void {
	state.fileMap.set(fileInfo.path, fileInfo);

	const index = state.files.findIndex((f) => f.path === fileInfo.path);
	if (index >= 0) {
		state.files[index] = fileInfo;
	} else {
		state.files = [...state.files, fileInfo];
	}
}

export function removeFileInfo(path: string): void {
	state.fileMap.delete(path);
	state.files = state.files.filter((f) => f.path !== path);
	state.dirtyFiles.delete(path);
	removeLock(path);
}

export function markDirty(path: string): void {
	state.dirtyFiles.add(path);
}

export function markClean(path: string): void {
	state.dirtyFiles.delete(path);
}

export function setFiles(files: VFSFileInfo[]): void {
	state.files = files;
	state.fileMap = new SvelteMap(files.map((f) => [f.path, f]));
}

// ============================================================================
// Optimistic File Operations with Error Recovery
// ============================================================================

/**
 * Write file content with optimistic update and automatic rollback on failure
 */
export async function writeFileOptimistic(
	path: string,
	content: string,
	_options: { createIfNotExists?: boolean } = {}
): Promise<OptimisticResult<VFSFileInfo>> {
	if (!state.workspace) {
		const error = parseError(new Error('Workspace not initialized'), { path });
		return {
			success: false,
			error,
			operation: {
				id: '',
				type: 'file_write',
				payload: { path, content },
				timestamp: Date.now(),
				status: 'failed',
				retryCount: 0,
				maxRetries: 3
			}
		};
	}

	const previousFile = state.fileMap.get(path);
	const workspaceId = state.workspace.id;

	return await optimisticUpdate({
		type: 'file_write',
		payload: { path, content },
		apply: () => {
			// Optimistically update file info
			markDirty(path);
			if (previousFile) {
				updateFileInfo({
					...previousFile,
					size: new Blob([content]).size,
					// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ephemeral Date used only for toISOString(), not stored as reactive state
					modTime: new Date().toISOString()
				});
			}
		},
		rollback: () => {
			// Restore previous state
			markClean(path);
			if (previousFile) {
				updateFileInfo(previousFile);
			}
		},
		commit: async () => {
			const result = await vfsClient.quickWriteFile(workspaceId, path, content);
			markClean(path);
			updateFileInfo(result);
			return result;
		},
		config: {
			maxRetries: 3,
			retryDelay: 1000,
			onRollback: (op, error) => {
				const vfsError = parseError(error, { path, workspaceId });
				state.structuredError = vfsError;
				logError(vfsError, 'error', { operation: op.type, path });

				// Queue conflict if version mismatch
				if (isConflictError(vfsError)) {
					state.conflictQueue.push({
						path,
						localContent: content,
						serverVersion: state.version
					});
				}
			}
		}
	});
}

/**
 * Delete file with optimistic update
 */
export async function deleteFileOptimistic(path: string): Promise<OptimisticResult<void>> {
	if (!state.workspace) {
		const error = parseError(new Error('Workspace not initialized'), { path });
		return {
			success: false,
			error,
			operation: {
				id: '',
				type: 'file_delete',
				payload: { path },
				timestamp: Date.now(),
				status: 'failed',
				retryCount: 0,
				maxRetries: 3
			}
		};
	}

	const previousFile = state.fileMap.get(path);
	const previousLock = state.locks.get(path);
	const workspaceId = state.workspace.id;

	return await optimisticUpdate({
		type: 'file_delete',
		payload: { path },
		apply: () => {
			removeFileInfo(path);
		},
		rollback: () => {
			if (previousFile) {
				updateFileInfo(previousFile);
			}
			if (previousLock) {
				setLock(previousLock);
			}
		},
		commit: async () => {
			await vfsClient.deleteFile(workspaceId, path);
		},
		config: {
			maxRetries: 2,
			retryDelay: 500,
			onRollback: (op, error) => {
				const vfsError = parseError(error, { path, workspaceId });
				state.structuredError = vfsError;
				logError(vfsError, 'error', { operation: op.type, path });
			}
		}
	});
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Resolve a file conflict
 */
export function resolveConflict(
	path: string,
	resolution: 'use_local' | 'use_server' | 'merge',
	mergedContent?: string
): void {
	const conflictIndex = state.conflictQueue.findIndex((c) => c.path === path);
	if (conflictIndex === -1) return;

	const conflict = state.conflictQueue[conflictIndex];
	state.conflictQueue = state.conflictQueue.filter((_, i) => i !== conflictIndex);

	switch (resolution) {
		case 'use_local':
			// Re-attempt write with force flag
			if (state.workspace) {
				vfsClient
					.quickWriteFile(state.workspace.id, path, conflict.localContent)
					.then((result) => {
						updateFileInfo(result);
						markClean(path);
					})
					.catch((err) => {
						state.structuredError = parseError(err, { path });
					});
			}
			break;

		case 'use_server':
			// Discard local changes, mark clean
			markClean(path);
			break;

		case 'merge':
			// Write merged content
			if (mergedContent && state.workspace) {
				vfsClient
					.quickWriteFile(state.workspace.id, path, mergedContent)
					.then((result) => {
						updateFileInfo(result);
						markClean(path);
					})
					.catch((err) => {
						state.structuredError = parseError(err, { path });
					});
			}
			break;
	}
}

/**
 * Dismiss all conflicts (use server versions)
 */
export function dismissAllConflicts(): void {
	for (const conflict of state.conflictQueue) {
		markClean(conflict.path);
	}
	state.conflictQueue = [];
}

/**
 * Retry a failed operation
 */
export async function retryOperation(operationId: string): Promise<boolean> {
	const retryCount = state.pendingRetries.get(operationId) ?? 0;
	if (retryCount >= 3) {
		return false;
	}

	state.pendingRetries.set(operationId, retryCount + 1);
	// The actual retry logic would be implemented based on the operation type
	// This is a placeholder for the retry mechanism
	return true;
}

/**
 * Clear structured error
 */
export function clearStructuredError(): void {
	state.structuredError = null;
}

// ============================================================================
// Lock Operations
// ============================================================================

export function setLock(lock: VFSFileLock): void {
	state.locks.set(lock.path, lock);
	state.lockStatuses.set(lock.path, { status: 'locked', lock });
	state.pendingLocks.delete(lock.path);

	// Start TTL refresh if it's our lock
	if (lock.holder === currentUserId) {
		startLockRefresh(lock);
	}
}

export function removeLock(path: string): void {
	state.locks.delete(path);
	state.lockStatuses.set(path, { status: 'unlocked' });
	state.pendingLocks.delete(path);
	stopLockRefresh(path);
}

export function setLockStatus(path: string, status: VFSLockStatus): void {
	state.lockStatuses.set(path, status);

	if (status.status === 'acquiring') {
		state.pendingLocks.add(path);
	} else {
		state.pendingLocks.delete(path);
	}
}

export function setLocks(locks: VFSFileLock[]): void {
	state.locks = new SvelteMap(locks.map((l) => [l.path, l]));

	// Update lock statuses
	for (const lock of locks) {
		state.lockStatuses.set(lock.path, { status: 'locked', lock });
	}

	// Start refresh timers for our locks
	for (const lock of locks) {
		if (lock.holder === currentUserId) {
			startLockRefresh(lock);
		}
	}
}

function startLockRefresh(lock: VFSFileLock): void {
	// Refresh at 80% of TTL to ensure we don't lose the lock
	const refreshInterval = lock.ttl * 0.8;

	const intervalId = window.setInterval(async () => {
		await refreshLockTTL(lock.path);
	}, refreshInterval);

	lockRefreshIntervals.set(lock.path, intervalId);
}

function stopLockRefresh(path: string): void {
	const intervalId = lockRefreshIntervals.get(path);
	if (intervalId) {
		clearInterval(intervalId);
		lockRefreshIntervals.delete(path);
	}
}

async function refreshLockTTL(path: string): Promise<void> {
	if (!state.workspace || !currentUserId) return;

	try {
		const lock = await vfsClient.refreshLock(state.workspace.id, path, currentUserId);
		setLock(lock);
	} catch (_err) {
		// Refresh failed - lock may have expired
		removeLock(path);
		state.error = `Lock expired on ${path}`;
	}
}

// Public lock acquisition
export async function acquireLock(
	path: string,
	purpose?: VFSFileLock['purpose']
): Promise<VFSFileLock | null> {
	if (!state.workspace || !currentUserId) {
		state.error = 'Workspace or user not initialized';
		return null;
	}

	setLockStatus(path, { status: 'acquiring' });

	try {
		const lock = await vfsClient.acquireLock(state.workspace.id, path, currentUserId, { purpose });
		setLock(lock);
		return lock;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Failed to acquire lock';
		setLockStatus(path, { status: 'failed', error: errorMessage });
		state.error = errorMessage;
		return null;
	}
}

export async function releaseLock(path: string): Promise<void> {
	if (!state.workspace || !currentUserId) return;

	try {
		await vfsClient.releaseLock(state.workspace.id, path, currentUserId);
		removeLock(path);
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to release lock';
	}
}

export async function releaseAllMyLocks(): Promise<void> {
	const myLocks = getMyLocks();
	for (const lock of myLocks) {
		await releaseLock(lock.path);
	}
}

// ============================================================================
// Transaction Operations
// ============================================================================

export function startTransaction(transaction: VFSTransaction): void {
	state.activeTransactions.set(transaction.id, transaction);
}

export function completeTransaction(
	transactionId: string,
	status: 'committed' | 'rolledback'
): void {
	const tx = state.activeTransactions.get(transactionId);
	if (!tx) return;

	tx.status = status;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ephemeral Date used only for toISOString(), not stored as reactive state
	tx.committedAt = new Date().toISOString();

	state.activeTransactions.delete(transactionId);
	state.transactionHistory = [tx, ...state.transactionHistory].slice(0, 100); // Keep last 100
}

// ============================================================================
// SSE Connection
// ============================================================================

const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function connect(workspaceId: string): void {
	if (state.eventSource) {
		state.eventSource.close();
	}

	const endpoint = `/api/vfs/workspaces/${workspaceId}/stream`;
	const eventSource = new EventSource(endpoint);

	eventSource.onopen = () => {
		state.connected = true;
		state.error = null;
		state.reconnectAttempts = 0;
	};

	eventSource.onerror = () => {
		state.connected = false;
		state.error = 'VFS connection lost';

		if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
			const delay = BASE_RECONNECT_DELAY * Math.pow(2, state.reconnectAttempts);
			state.reconnectAttempts++;

			setTimeout(() => {
				if (!state.connected) {
					connect(workspaceId);
				}
			}, delay);
		} else {
			state.error = 'Failed to reconnect after multiple attempts';
		}
	};

	eventSource.onmessage = (event) => {
		try {
			const vfsEvent = JSON.parse(event.data) as VFSEvent;
			handleEvent(vfsEvent);
		} catch {
			console.error('Failed to parse VFS event');
		}
	};

	state.eventSource = eventSource;
}

export function disconnect(): void {
	if (state.eventSource) {
		state.eventSource.close();
		state.eventSource = null;
	}
	state.connected = false;

	// Clear all lock refresh intervals
	for (const intervalId of lockRefreshIntervals.values()) {
		clearInterval(intervalId);
	}
	lockRefreshIntervals.clear();
}

function handleEvent(event: VFSEvent): void {
	state.lastEventTime = event.timestamp;

	switch (event.type) {
		case 'snapshot':
			handleSnapshot(event as VFSSnapshotEvent);
			break;

		case 'update':
			handleUpdate(event as VFSUpdateEvent);
			break;

		case 'ping':
			// Keep-alive, no action needed
			break;

		case 'complete':
			// Stream ended
			disconnect();
			break;

		case 'error':
			state.error = event.error;
			state.errorCode = event.code;
			break;

		case 'lock_acquired':
			handleLockAcquired(event as VFSLockAcquiredEvent);
			break;

		case 'lock_released':
			handleLockReleased(event as VFSLockReleasedEvent);
			break;

		case 'iteration_completed':
		case 'change_classified':
		case 'gate_progress':
			// Forward to agent store (handled by subscriber)
			break;
	}

	// Notify subscribed handlers
	const handlers = eventHandlers.get(event.type);
	if (handlers) {
		handlers.forEach((handler) => handler(event));
	}

	const wildcardHandlers = eventHandlers.get('*');
	if (wildcardHandlers) {
		wildcardHandlers.forEach((handler) => handler(event));
	}
}

function handleSnapshot(event: VFSSnapshotEvent): void {
	setFiles(event.files);
	setLocks(event.locks);
	state.version = event.version;
}

function handleUpdate(event: VFSUpdateEvent): void {
	if (event.files) {
		event.files.forEach(updateFileInfo);
	}
	state.version = event.version;
}

function handleLockAcquired(event: VFSLockAcquiredEvent): void {
	setLock(event.lock);
}

function handleLockReleased(event: VFSLockReleasedEvent): void {
	removeLock(event.path);
}

export function onEvent(
	type: VFSEvent['type'] | '*',
	handler: (event: VFSEvent) => void
): () => void {
	if (!eventHandlers.has(type)) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- internal subscription set stored in non-reactive eventHandlers registry
		eventHandlers.set(type, new Set());
	}
	eventHandlers.get(type)!.add(handler);

	return () => {
		eventHandlers.get(type)?.delete(handler);
	};
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildTree(files: VFSFileInfo[]): VFSFileInfo[] {
	// For now, return sorted files
	// A full tree implementation would nest children under directories
	return [...files].sort((a, b) => {
		// Directories first, then alphabetically
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
		return a.path.localeCompare(b.path);
	});
}

export function clearError(): void {
	state.error = null;
	state.errorCode = null;
}

export function reset(): void {
	disconnect();
	state.workspace = null;
	state.files = [];
	state.fileMap.clear();
	state.dirtyFiles.clear();
	state.locks.clear();
	state.lockStatuses.clear();
	state.pendingLocks.clear();
	state.activeTransactions.clear();
	state.transactionHistory = [];
	state.error = null;
	state.errorCode = null;
	state.structuredError = null;
	state.version = 0;
	state.reconnectAttempts = 0;
	state.pendingRetries.clear();
	state.conflictQueue = [];
	currentUserId = null;
}

// ============================================================================
// Sync Status
// ============================================================================

export function setSyncing(syncing: boolean): void {
	state.syncing = syncing;
}
