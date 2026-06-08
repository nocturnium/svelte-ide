/**
 * Optimistic Update Service
 *
 * Provides utilities for optimistic UI updates with automatic rollback on failure.
 * Implements a queue-based system for managing pending operations.
 */

// ============================================================================
// Types
// ============================================================================

export interface OptimisticOperation<T> {
	id: string;
	type: string;
	payload: T;
	timestamp: number;
	status: 'pending' | 'committed' | 'failed' | 'rolledback';
	rollbackData?: unknown;
	retryCount: number;
	maxRetries: number;
}

export interface OptimisticConfig {
	maxRetries?: number;
	retryDelay?: number;
	onCommit?: (operation: OptimisticOperation<unknown>) => void;
	onRollback?: (operation: OptimisticOperation<unknown>, error: Error) => void;
	onRetry?: (operation: OptimisticOperation<unknown>, attempt: number) => void;
}

export interface OptimisticResult<T> {
	success: boolean;
	data?: T;
	error?: Error;
	operation: OptimisticOperation<unknown>;
}

type RollbackFn = () => void | Promise<void>;
type CommitFn<T> = () => Promise<T>;

// ============================================================================
// Operation Queue
// ============================================================================

const operationQueue: Map<string, OptimisticOperation<unknown>> = new Map();
const rollbackFunctions: Map<string, RollbackFn> = new Map();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Execute an optimistic update with automatic rollback on failure
 *
 * @example
 * ```typescript
 * const result = await optimisticUpdate({
 *   type: 'file_save',
 *   payload: { path: '/src/main.ts', content: '...' },
 *   apply: () => {
 *     // Apply change locally immediately
 *     updateLocalFile(path, content);
 *   },
 *   rollback: () => {
 *     // Revert to previous state
 *     updateLocalFile(path, previousContent);
 *   },
 *   commit: async () => {
 *     // Persist to server
 *     return await vfsClient.writeFile(workspaceId, path, content);
 *   }
 * });
 * ```
 */
export async function optimisticUpdate<T, R>(options: {
	type: string;
	payload: T;
	apply: () => void;
	rollback: RollbackFn;
	commit: CommitFn<R>;
	config?: OptimisticConfig;
}): Promise<OptimisticResult<R>> {
	const { type, payload, apply, rollback, commit, config = {} } = options;
	const { maxRetries = 3, retryDelay = 1000, onCommit, onRollback, onRetry } = config;

	const operation: OptimisticOperation<T> = {
		id: crypto.randomUUID(),
		type,
		payload,
		timestamp: Date.now(),
		status: 'pending',
		retryCount: 0,
		maxRetries
	};

	// Store operation and rollback
	operationQueue.set(operation.id, operation as OptimisticOperation<unknown>);
	rollbackFunctions.set(operation.id, rollback);

	// Apply optimistically
	try {
		apply();
	} catch (applyError) {
		// If apply fails, don't even try to commit
		operation.status = 'failed';
		operationQueue.delete(operation.id);
		rollbackFunctions.delete(operation.id);
		return {
			success: false,
			error: applyError instanceof Error ? applyError : new Error(String(applyError)),
			operation: operation as OptimisticOperation<unknown>
		};
	}

	// Try to commit with retries
	let lastError: Error | undefined;

	while (operation.retryCount <= maxRetries) {
		try {
			const result = await commit();
			operation.status = 'committed';
			operationQueue.delete(operation.id);
			rollbackFunctions.delete(operation.id);
			onCommit?.(operation as OptimisticOperation<unknown>);

			return {
				success: true,
				data: result,
				operation: operation as OptimisticOperation<unknown>
			};
		} catch (commitError) {
			lastError = commitError instanceof Error ? commitError : new Error(String(commitError));
			operation.retryCount++;

			if (operation.retryCount <= maxRetries) {
				onRetry?.(operation as OptimisticOperation<unknown>, operation.retryCount);
				await delay(retryDelay * operation.retryCount); // Exponential backoff
			}
		}
	}

	// All retries failed - rollback
	operation.status = 'failed';

	try {
		await rollback();
		operation.status = 'rolledback';
		onRollback?.(operation as OptimisticOperation<unknown>, lastError!);
	} catch (rollbackError) {
		console.error('Rollback failed:', rollbackError);
	}

	operationQueue.delete(operation.id);
	rollbackFunctions.delete(operation.id);

	return {
		success: false,
		error: lastError,
		operation: operation as OptimisticOperation<unknown>
	};
}

/**
 * Create an optimistic state manager for a specific resource
 */
export function createOptimisticState<T>(initialValue: T) {
	let currentValue = initialValue;
	let pendingValue: T | null = null;
	let isPending = false;

	return {
		get value(): T {
			return pendingValue ?? currentValue;
		},

		get isPending(): boolean {
			return isPending;
		},

		get confirmedValue(): T {
			return currentValue;
		},

		/**
		 * Apply an optimistic update
		 */
		async update(
			newValue: T,
			commit: () => Promise<T>,
			config?: OptimisticConfig
		): Promise<OptimisticResult<T>> {
			const previousValue = currentValue;
			pendingValue = newValue;
			isPending = true;

			const result = await optimisticUpdate({
				type: 'state_update',
				payload: newValue,
				apply: () => {
					// Already set pendingValue above
				},
				rollback: () => {
					pendingValue = null;
					isPending = false;
				},
				commit: async () => {
					const confirmed = await commit();
					currentValue = confirmed;
					pendingValue = null;
					isPending = false;
					return confirmed;
				},
				config
			});

			if (!result.success) {
				pendingValue = null;
				isPending = false;
				currentValue = previousValue;
			}

			return result;
		},

		/**
		 * Confirm a pending value (e.g., from server response)
		 */
		confirm(value: T): void {
			currentValue = value;
			pendingValue = null;
			isPending = false;
		},

		/**
		 * Reset to initial value
		 */
		reset(): void {
			currentValue = initialValue;
			pendingValue = null;
			isPending = false;
		}
	};
}

/**
 * Batch multiple optimistic operations
 */
export async function batchOptimisticUpdates(
	operations: Array<{
		type: string;
		payload: unknown;
		apply: () => void;
		rollback: RollbackFn;
		commit: CommitFn<unknown>;
	}>,
	config?: OptimisticConfig
): Promise<{ success: boolean; results: OptimisticResult<unknown>[]; failedCount: number }> {
	const results: OptimisticResult<unknown>[] = [];
	let failedCount = 0;

	// Apply all optimistically first
	const appliedOps: Array<{ op: (typeof operations)[0]; rollback: RollbackFn }> = [];

	for (const op of operations) {
		try {
			op.apply();
			appliedOps.push({ op, rollback: op.rollback });
		} catch {
			// If any apply fails, rollback all previous
			for (const applied of appliedOps.reverse()) {
				try {
					await applied.rollback();
				} catch (rollbackError) {
					console.error('Batch rollback failed:', rollbackError);
				}
			}
			return {
				success: false,
				results: [],
				failedCount: operations.length
			};
		}
	}

	// Commit all
	for (const { op, rollback } of appliedOps) {
		const result = await optimisticUpdate({
			...op,
			apply: () => {}, // Already applied
			rollback,
			config
		});
		results.push(result);
		if (!result.success) failedCount++;
	}

	return {
		success: failedCount === 0,
		results,
		failedCount
	};
}

// ============================================================================
// Queue Management
// ============================================================================

/**
 * Get all pending operations
 */
export function getPendingOperations(): OptimisticOperation<unknown>[] {
	return Array.from(operationQueue.values()).filter((op) => op.status === 'pending');
}

/**
 * Get operation by ID
 */
export function getOperation(id: string): OptimisticOperation<unknown> | undefined {
	return operationQueue.get(id);
}

/**
 * Cancel a pending operation
 */
export async function cancelOperation(id: string): Promise<boolean> {
	const operation = operationQueue.get(id);
	if (!operation || operation.status !== 'pending') {
		return false;
	}

	const rollback = rollbackFunctions.get(id);
	if (rollback) {
		try {
			await rollback();
			operation.status = 'rolledback';
		} catch (error) {
			console.error('Cancel rollback failed:', error);
			return false;
		}
	}

	operationQueue.delete(id);
	rollbackFunctions.delete(id);
	return true;
}

/**
 * Cancel all pending operations
 */
export async function cancelAllOperations(): Promise<void> {
	const pending = getPendingOperations();
	for (const op of pending) {
		await cancelOperation(op.id);
	}
}

// ============================================================================
// Conflict Detection
// ============================================================================

export interface ConflictInfo {
	type: 'version' | 'lock' | 'concurrent';
	localVersion?: number;
	serverVersion?: number;
	conflictingUser?: string;
	path?: string;
	timestamp: number;
}

/**
 * Check if an error indicates a conflict
 */
export function isConflictError(error: Error): ConflictInfo | null {
	const message = error.message.toLowerCase();

	if (message.includes('version') || message.includes('conflict') || message.includes('stale')) {
		return {
			type: 'version',
			timestamp: Date.now()
		};
	}

	if (message.includes('lock') || message.includes('locked')) {
		return {
			type: 'lock',
			timestamp: Date.now()
		};
	}

	if (message.includes('concurrent') || message.includes('modified')) {
		return {
			type: 'concurrent',
			timestamp: Date.now()
		};
	}

	return null;
}

/**
 * Parse conflict details from error
 */
export function parseConflictDetails(
	error: Error
): { localContent?: string; serverContent?: string; baseContent?: string } | null {
	// This would parse structured error responses from the server
	// For now, return null as a placeholder
	try {
		const data = JSON.parse(error.message);
		return {
			localContent: data.localContent,
			serverContent: data.serverContent,
			baseContent: data.baseContent
		};
	} catch {
		return null;
	}
}

// ============================================================================
// Utilities
// ============================================================================

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a debounced optimistic updater
 */
export function createDebouncedOptimistic<T>(
	commitFn: (value: T) => Promise<T>,
	delayMs: number = 500
) {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let pendingValue: T | null = null;
	let pendingResolve: ((result: OptimisticResult<T>) => void) | null = null;

	return {
		update(value: T, apply: () => void, rollback: RollbackFn): Promise<OptimisticResult<T>> {
			// Apply immediately
			apply();
			pendingValue = value;

			// Clear previous timeout
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			return new Promise((resolve) => {
				pendingResolve = resolve;

				timeoutId = setTimeout(async () => {
					if (pendingValue === null) return;

					const result = await optimisticUpdate({
						type: 'debounced_update',
						payload: pendingValue,
						apply: () => {}, // Already applied
						rollback,
						commit: () => commitFn(pendingValue as T)
					});

					pendingValue = null;
					timeoutId = null;
					pendingResolve?.(result);
					pendingResolve = null;
				}, delayMs);
			});
		},

		flush(): void {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		},

		get isPending(): boolean {
			return pendingValue !== null;
		}
	};
}
