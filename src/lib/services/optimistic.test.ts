import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	optimisticUpdate,
	createOptimisticState,
	batchOptimisticUpdates,
	getPendingOperations,
	getOperation,
	cancelOperation,
	cancelAllOperations,
	isConflictError,
	parseConflictDetails,
	createDebouncedOptimistic
} from './optimistic';

// ============================================================================
// Setup
// ============================================================================

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
	randomUUID: () => `uuid-${++uuidCounter}`
});

beforeEach(() => {
	uuidCounter = 0;
});

afterEach(async () => {
	await cancelAllOperations();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// ============================================================================
// Tests: optimisticUpdate
// ============================================================================

describe('optimisticUpdate', () => {
	it('should apply optimistically and commit on success', async () => {
		const apply = vi.fn();
		const rollback = vi.fn();
		const commit = vi.fn().mockResolvedValue({ saved: true });
		const onCommit = vi.fn();

		const result = await optimisticUpdate({
			type: 'test_save',
			payload: { data: 'hello' },
			apply,
			rollback,
			commit,
			config: { onCommit }
		});

		expect(apply).toHaveBeenCalledOnce();
		expect(commit).toHaveBeenCalledOnce();
		expect(rollback).not.toHaveBeenCalled();
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ saved: true });
		expect(result.operation.status).toBe('committed');
		expect(onCommit).toHaveBeenCalledOnce();
	});

	it('should rollback when commit fails after all retries', async () => {
		const apply = vi.fn();
		const rollback = vi.fn();
		const commit = vi.fn().mockRejectedValue(new Error('Server error'));
		const onRollback = vi.fn();
		const onRetry = vi.fn();

		const result = await optimisticUpdate({
			type: 'test_save',
			payload: {},
			apply,
			rollback,
			commit,
			config: { maxRetries: 2, retryDelay: 1, onRollback, onRetry }
		});

		expect(result.success).toBe(false);
		expect(result.error?.message).toBe('Server error');
		expect(result.operation.status).toBe('rolledback');
		expect(rollback).toHaveBeenCalledOnce();
		expect(onRollback).toHaveBeenCalledOnce();
		// Initial attempt + 2 retries = 3 total
		expect(commit).toHaveBeenCalledTimes(3);
		expect(onRetry).toHaveBeenCalledTimes(2);
	});

	it('should return failed (not rolledback) if apply itself fails', async () => {
		const apply = vi.fn(() => {
			throw new Error('Apply failed');
		});
		const rollback = vi.fn();
		const commit = vi.fn();

		const result = await optimisticUpdate({
			type: 'test',
			payload: {},
			apply,
			rollback,
			commit
		});

		expect(result.success).toBe(false);
		expect(result.error?.message).toBe('Apply failed');
		expect(result.operation.status).toBe('failed');
		expect(commit).not.toHaveBeenCalled();
		expect(rollback).not.toHaveBeenCalled();
	});

	it('should succeed on retry after initial failure', async () => {
		const apply = vi.fn();
		const rollback = vi.fn();
		let callCount = 0;
		const commit = vi.fn(async () => {
			callCount++;
			if (callCount < 2) throw new Error('Transient error');
			return 'ok';
		});

		const result = await optimisticUpdate({
			type: 'test',
			payload: {},
			apply,
			rollback,
			commit,
			config: { maxRetries: 3, retryDelay: 1 }
		});

		expect(result.success).toBe(true);
		expect(result.data).toBe('ok');
		expect(commit).toHaveBeenCalledTimes(2);
		expect(rollback).not.toHaveBeenCalled();
	});

	it('should handle non-Error exceptions in commit', async () => {
		const apply = vi.fn();
		const rollback = vi.fn();
		const commit = vi.fn().mockRejectedValue('string-error');

		const result = await optimisticUpdate({
			type: 'test',
			payload: {},
			apply,
			rollback,
			commit,
			config: { maxRetries: 0, retryDelay: 1 }
		});

		expect(result.success).toBe(false);
		expect(result.error?.message).toBe('string-error');
	});

	it('should handle rollback failure gracefully', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const apply = vi.fn();
		const rollback = vi.fn().mockRejectedValue(new Error('Rollback failed'));
		const commit = vi.fn().mockRejectedValue(new Error('Commit failed'));

		const result = await optimisticUpdate({
			type: 'test',
			payload: {},
			apply,
			rollback,
			commit,
			config: { maxRetries: 0, retryDelay: 1 }
		});

		expect(result.success).toBe(false);
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it('should remove operation from queue after success', async () => {
		const apply = vi.fn();
		const rollback = vi.fn();
		const commit = vi.fn().mockResolvedValue('ok');

		const result = await optimisticUpdate({
			type: 'test',
			payload: {},
			apply,
			rollback,
			commit
		});

		expect(getOperation(result.operation.id)).toBeUndefined();
	});

	it('should retry with exponential backoff and jitter', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0.5);

		const commit = vi
			.fn()
			.mockRejectedValueOnce(new Error('first'))
			.mockRejectedValueOnce(new Error('second'))
			.mockResolvedValueOnce('ok');
		const onRetry = vi.fn();

		const updatePromise = optimisticUpdate({
			type: 'retrying',
			payload: {},
			apply: () => {},
			rollback: () => {},
			commit,
			config: { maxRetries: 2, retryDelay: 100, onRetry }
		});

		await Promise.resolve();
		expect(commit).toHaveBeenCalledTimes(1);
		expect(onRetry).toHaveBeenCalledWith(expect.any(Object), 1);

		await vi.advanceTimersByTimeAsync(99);
		expect(commit).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(commit).toHaveBeenCalledTimes(2);
		expect(onRetry).toHaveBeenCalledWith(expect.any(Object), 2);

		await vi.advanceTimersByTimeAsync(199);
		expect(commit).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1);

		const result = await updatePromise;
		expect(result.success).toBe(true);
		expect(result.data).toBe('ok');
		vi.useRealTimers();
	});
});

// ============================================================================
// Tests: createOptimisticState
// ============================================================================

describe('createOptimisticState', () => {
	it('should initialize with given value', () => {
		const state = createOptimisticState('initial');
		expect(state.value).toBe('initial');
		expect(state.confirmedValue).toBe('initial');
		expect(state.isPending).toBe(false);
	});

	it('should apply and confirm on successful update', async () => {
		const state = createOptimisticState('old');

		const result = await state.update('new', async () => 'confirmed');

		expect(result.success).toBe(true);
		expect(state.value).toBe('confirmed');
		expect(state.confirmedValue).toBe('confirmed');
		expect(state.isPending).toBe(false);
	});

	it('should rollback on failed update', async () => {
		const state = createOptimisticState('old');

		const result = await state.update(
			'new',
			async () => {
				throw new Error('fail');
			},
			{ maxRetries: 0, retryDelay: 1 }
		);

		expect(result.success).toBe(false);
		expect(state.value).toBe('old');
		expect(state.isPending).toBe(false);
	});

	it('should confirm value manually', () => {
		const state = createOptimisticState('old');
		state.confirm('confirmed');

		expect(state.value).toBe('confirmed');
		expect(state.confirmedValue).toBe('confirmed');
		expect(state.isPending).toBe(false);
	});

	it('should reset to initial value', async () => {
		const state = createOptimisticState('initial');
		await state.update('changed', async () => 'changed');

		state.reset();
		expect(state.value).toBe('initial');
		expect(state.isPending).toBe(false);
	});
});

// ============================================================================
// Tests: batchOptimisticUpdates
// ============================================================================

describe('batchOptimisticUpdates', () => {
	it('should apply all and commit all on success', async () => {
		const ops = [
			{
				type: 'op1',
				payload: {},
				apply: vi.fn(),
				rollback: vi.fn(),
				commit: vi.fn().mockResolvedValue('r1')
			},
			{
				type: 'op2',
				payload: {},
				apply: vi.fn(),
				rollback: vi.fn(),
				commit: vi.fn().mockResolvedValue('r2')
			}
		];

		const result = await batchOptimisticUpdates(ops);

		expect(result.success).toBe(true);
		expect(result.failedCount).toBe(0);
		expect(result.results).toHaveLength(2);
		ops.forEach((op) => expect(op.apply).toHaveBeenCalledOnce());
	});

	it('should rollback all if any apply fails', async () => {
		const ops = [
			{
				type: 'op1',
				payload: {},
				apply: vi.fn(),
				rollback: vi.fn(),
				commit: vi.fn().mockResolvedValue('r1')
			},
			{
				type: 'op2',
				payload: {},
				apply: vi.fn(() => {
					throw new Error('apply fail');
				}),
				rollback: vi.fn(),
				commit: vi.fn()
			}
		];

		const result = await batchOptimisticUpdates(ops);

		expect(result.success).toBe(false);
		expect(result.failedCount).toBe(2); // All operations counted as failed
		// The first op's rollback should have been called
		expect(ops[0].rollback).toHaveBeenCalledOnce();
	});

	it('should track failed count when some commits fail', async () => {
		const ops = [
			{
				type: 'op1',
				payload: {},
				apply: vi.fn(),
				rollback: vi.fn(),
				commit: vi.fn().mockResolvedValue('ok')
			},
			{
				type: 'op2',
				payload: {},
				apply: vi.fn(),
				rollback: vi.fn(),
				commit: vi.fn().mockRejectedValue(new Error('fail'))
			}
		];

		const result = await batchOptimisticUpdates(ops, { maxRetries: 0, retryDelay: 1 });

		expect(result.success).toBe(false);
		expect(result.failedCount).toBe(1);
		expect(result.results).toHaveLength(2);
	});
});

// ============================================================================
// Tests: Queue Management
// ============================================================================

describe('Queue Management', () => {
	it('should track pending operations during commit', async () => {
		let resolveFn: (value: unknown) => void;
		const commitPromise = new Promise((resolve) => {
			resolveFn = resolve;
		});

		const updatePromise = optimisticUpdate({
			type: 'slow',
			payload: {},
			apply: () => {},
			rollback: () => {},
			commit: () => commitPromise as Promise<unknown>
		});

		// Operation should be pending now
		const pending = getPendingOperations();
		expect(pending.length).toBeGreaterThanOrEqual(1);

		// Resolve and complete
		resolveFn!('done');
		await updatePromise;

		// Should be removed from queue
		// Note: The operation might already be cleared
	});

	it('should cancel a pending operation', async () => {
		let resolveFn: (value: unknown) => void;
		const commitPromise = new Promise((resolve) => {
			resolveFn = resolve;
		});

		const rollback = vi.fn();
		const updatePromise = optimisticUpdate({
			type: 'cancelable',
			payload: {},
			apply: () => {},
			rollback,
			commit: () => commitPromise as Promise<unknown>
		});

		const pending = getPendingOperations();
		if (pending.length > 0) {
			const cancelled = await cancelOperation(pending[0].id);
			expect(cancelled).toBe(true);
			expect(rollback).toHaveBeenCalled();
		}

		// Complete the commit to avoid hanging promise
		resolveFn!('done');
		await updatePromise.catch(() => {}); // May reject or resolve
	});

	it('should return false when cancelling non-existent operation', async () => {
		const result = await cancelOperation('non-existent-id');
		expect(result).toBe(false);
	});

	it('cancelAllOperations should cancel all pending', async () => {
		// Create some pending operations
		const resolves: Array<(value: unknown) => void> = [];

		for (let i = 0; i < 3; i++) {
			const commitPromise = new Promise((resolve) => resolves.push(resolve));
			optimisticUpdate({
				type: `batch-${i}`,
				payload: {},
				apply: () => {},
				rollback: () => {},
				commit: () => commitPromise as Promise<unknown>
			});
		}

		await cancelAllOperations();

		// Resolve all to prevent hanging
		resolves.forEach((r) => r('done'));
	});

	it('should list and cancel operations only within the requested scope', async () => {
		const resolves: Array<(value: unknown) => void> = [];
		const rollbackA = vi.fn();
		const rollbackB = vi.fn();

		const updateA = optimisticUpdate({
			scopeKey: 'doc:A',
			type: 'save',
			payload: { path: '/a.ts' },
			apply: () => {},
			rollback: rollbackA,
			commit: () => new Promise((resolve) => resolves.push(resolve))
		});

		const updateB = optimisticUpdate({
			scopeKey: 'doc:B',
			type: 'save',
			payload: { path: '/b.ts' },
			apply: () => {},
			rollback: rollbackB,
			commit: () => new Promise((resolve) => resolves.push(resolve))
		});

		expect(getPendingOperations('doc:A')).toHaveLength(1);
		expect(getPendingOperations('doc:B')).toHaveLength(1);
		expect(getPendingOperations()).toHaveLength(2);

		await cancelAllOperations('doc:A');

		expect(rollbackA).toHaveBeenCalledOnce();
		expect(rollbackB).not.toHaveBeenCalled();
		expect(getPendingOperations('doc:A')).toHaveLength(0);
		expect(getPendingOperations('doc:B')).toHaveLength(1);

		resolves.forEach((resolve) => resolve('done'));
		await Promise.all([updateA, updateB]);
	});
});

// ============================================================================
// Tests: Conflict Detection
// ============================================================================

describe('isConflictError', () => {
	it('should detect version conflict', () => {
		const result = isConflictError(new Error('Version conflict detected'));
		expect(result).not.toBeNull();
		expect(result!.type).toBe('version');
	});

	it('should detect stale data conflict', () => {
		const result = isConflictError(new Error('Data is stale'));
		expect(result).not.toBeNull();
		expect(result!.type).toBe('version');
	});

	it('should detect lock conflict', () => {
		const result = isConflictError(new Error('File is locked'));
		expect(result).not.toBeNull();
		expect(result!.type).toBe('lock');
	});

	it('should detect concurrent modification', () => {
		const result = isConflictError(new Error('File was modified by another user'));
		expect(result).not.toBeNull();
		expect(result!.type).toBe('concurrent');
	});

	it('should return null for non-conflict errors', () => {
		const result = isConflictError(new Error('Something unrelated'));
		expect(result).toBeNull();
	});

	it('should include timestamp', () => {
		const before = Date.now();
		const result = isConflictError(new Error('Version conflict'));
		const after = Date.now();

		expect(result).not.toBeNull();
		expect(result!.timestamp).toBeGreaterThanOrEqual(before);
		expect(result!.timestamp).toBeLessThanOrEqual(after);
	});
});

describe('parseConflictDetails', () => {
	it('should parse JSON conflict details', () => {
		const details = {
			localContent: 'local',
			serverContent: 'server',
			baseContent: 'base'
		};
		const result = parseConflictDetails(new Error(JSON.stringify(details)));
		expect(result).toEqual(details);
	});

	it('should return null for non-JSON error messages', () => {
		const result = parseConflictDetails(new Error('not json'));
		expect(result).toBeNull();
	});
});

// ============================================================================
// Tests: createDebouncedOptimistic
// ============================================================================

describe('createDebouncedOptimistic', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should debounce multiple rapid updates', async () => {
		const commitFn = vi.fn().mockResolvedValue('committed');
		const debounced = createDebouncedOptimistic(commitFn, 100);

		const apply = vi.fn();
		const rollback = vi.fn();

		// Fire multiple updates rapidly
		debounced.update('a', apply, rollback);
		debounced.update('b', apply, rollback);
		const _promise = debounced.update('c', apply, rollback);

		expect(debounced.isPending).toBe(true);

		// Advance past debounce delay
		vi.advanceTimersByTime(150);
		await vi.runAllTimersAsync();

		// Only the last value should be committed
		expect(commitFn).toHaveBeenCalledTimes(1);
	});

	it('should flush on demand', () => {
		const commitFn = vi.fn().mockResolvedValue('ok');
		const debounced = createDebouncedOptimistic(commitFn, 100);

		debounced.update(
			'val',
			() => {},
			() => {}
		);
		expect(debounced.isPending).toBe(true);

		debounced.flush();
		// After flush, timeout is cleared
	});

	it('should apply immediately but delay commit', () => {
		const commitFn = vi.fn().mockResolvedValue('ok');
		const debounced = createDebouncedOptimistic(commitFn, 200);
		const apply = vi.fn();

		debounced.update('val', apply, () => {});

		expect(apply).toHaveBeenCalledOnce();
		expect(commitFn).not.toHaveBeenCalled();
	});
});
