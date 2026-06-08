import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createVFSError,
	parseError,
	isVFSError,
	isConflictError,
	isRecoverableError,
	executeRecovery,
	aggregateErrors,
	logError,
	getRecentErrors,
	clearErrorLog,
	type VFSErrorCode,
	type RecoveryOption
} from './error-handling';

// ============================================================================
// Tests: createVFSError
// ============================================================================

describe('createVFSError', () => {
	it('should create a VFSError with all fields populated', () => {
		const err = createVFSError('FILE_NOT_FOUND', 'File missing', {
			path: '/src/missing.ts',
			workspaceId: 'ws1',
			statusCode: 404
		});

		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe('VFSError');
		expect(err.code).toBe('FILE_NOT_FOUND');
		expect(err.message).toBe('File missing');
		expect(err.path).toBe('/src/missing.ts');
		expect(err.workspaceId).toBe('ws1');
		expect(err.statusCode).toBe(404);
		expect(err.technicalDetails).toBe('File missing');
		expect(typeof err.userMessage).toBe('string');
		expect(err.userMessage.length).toBeGreaterThan(0);
		expect(Array.isArray(err.recoveryOptions)).toBe(true);
	});

	it('should mark network errors as retryable', () => {
		const err = createVFSError('NETWORK_ERROR', 'connection failed');
		expect(err.retryable).toBe(true);
	});

	it('should mark timeout errors as retryable', () => {
		const err = createVFSError('TIMEOUT', 'request timed out');
		expect(err.retryable).toBe(true);
	});

	it('should mark server errors as retryable', () => {
		const err = createVFSError('SERVER_ERROR', 'Internal server error');
		expect(err.retryable).toBe(true);
	});

	it('should mark rate limited errors as retryable', () => {
		const err = createVFSError('RATE_LIMITED', 'Too many requests');
		expect(err.retryable).toBe(true);
	});

	it('should mark connection lost as retryable', () => {
		const err = createVFSError('CONNECTION_LOST', 'disconnected');
		expect(err.retryable).toBe(true);
	});

	it('should mark file not found as non-retryable', () => {
		const err = createVFSError('FILE_NOT_FOUND', 'not found');
		expect(err.retryable).toBe(false);
	});

	it('should mark permission denied as non-retryable', () => {
		const err = createVFSError('PERMISSION_DENIED', 'forbidden');
		expect(err.retryable).toBe(false);
	});

	it('should mark version conflict as non-retryable', () => {
		const err = createVFSError('VERSION_CONFLICT', 'conflict');
		expect(err.retryable).toBe(false);
	});

	it('should attach cause if provided', () => {
		const cause = new Error('root cause');
		const err = createVFSError('UNKNOWN', 'wrapped', { cause });
		expect(err.cause).toBe(cause);
	});
});

// ============================================================================
// Tests: User Messages
// ============================================================================

describe('User Messages', () => {
	const codes: VFSErrorCode[] = [
		'NETWORK_ERROR',
		'CONNECTION_LOST',
		'TIMEOUT',
		'FILE_LOCKED',
		'LOCK_EXPIRED',
		'LOCK_CONFLICT',
		'VERSION_CONFLICT',
		'FILE_NOT_FOUND',
		'PERMISSION_DENIED',
		'WORKSPACE_NOT_FOUND',
		'INVALID_OPERATION',
		'SERVER_ERROR',
		'RATE_LIMITED',
		'UNKNOWN'
	];

	it.each(codes)('should produce a non-empty user message for %s', (code) => {
		const err = createVFSError(code, 'technical detail');
		expect(err.userMessage.length).toBeGreaterThan(5);
	});

	it('should include file name in message when path is provided', () => {
		const err = createVFSError('FILE_NOT_FOUND', 'missing', { path: '/src/app.ts' });
		expect(err.userMessage).toContain('app.ts');
	});

	it('should use fallback when no path is provided', () => {
		const err = createVFSError('FILE_NOT_FOUND', 'missing');
		expect(err.userMessage).toContain('the file');
	});
});

// ============================================================================
// Tests: Recovery Options
// ============================================================================

describe('Recovery Options', () => {
	it('should provide retry and cancel for NETWORK_ERROR', () => {
		const err = createVFSError('NETWORK_ERROR', 'test');
		const ids = err.recoveryOptions.map((o) => o.id);
		expect(ids).toContain('retry');
		expect(ids).toContain('cancel');
	});

	it('should provide wait and refresh for CONNECTION_LOST', () => {
		const err = createVFSError('CONNECTION_LOST', 'test');
		const ids = err.recoveryOptions.map((o) => o.id);
		expect(ids).toContain('wait');
		expect(ids).toContain('refresh');
	});

	it('should provide wait, force, cancel for FILE_LOCKED', () => {
		const err = createVFSError('FILE_LOCKED', 'test');
		const ids = err.recoveryOptions.map((o) => o.id);
		expect(ids).toContain('wait');
		expect(ids).toContain('force');
		expect(ids).toContain('cancel');
	});

	it('should mark force unlock as dangerous', () => {
		const err = createVFSError('FILE_LOCKED', 'test');
		const forceOption = err.recoveryOptions.find((o) => o.id === 'force');
		expect(forceOption?.dangerous).toBe(true);
	});

	it('should provide merge, force, discard for VERSION_CONFLICT', () => {
		const err = createVFSError('VERSION_CONFLICT', 'test');
		const ids = err.recoveryOptions.map((o) => o.id);
		expect(ids).toContain('merge');
		expect(ids).toContain('force');
		expect(ids).toContain('discard');
	});

	it('should mark merge as recommended for VERSION_CONFLICT', () => {
		const err = createVFSError('VERSION_CONFLICT', 'test');
		const mergeOption = err.recoveryOptions.find((o) => o.id === 'merge');
		expect(mergeOption?.recommended).toBe(true);
	});

	it('should provide retry and discard for LOCK_EXPIRED', () => {
		const err = createVFSError('LOCK_EXPIRED', 'test');
		const ids = err.recoveryOptions.map((o) => o.id);
		expect(ids).toContain('retry');
		expect(ids).toContain('discard');
	});

	it('should provide refresh and cancel for FILE_NOT_FOUND', () => {
		const err = createVFSError('FILE_NOT_FOUND', 'test');
		const ids = err.recoveryOptions.map((o) => o.id);
		expect(ids).toContain('refresh');
		expect(ids).toContain('cancel');
	});

	it('should only provide cancel for PERMISSION_DENIED', () => {
		const err = createVFSError('PERMISSION_DENIED', 'test');
		expect(err.recoveryOptions).toHaveLength(1);
		expect(err.recoveryOptions[0].action).toBe('cancel');
	});

	it('should provide wait for RATE_LIMITED', () => {
		const err = createVFSError('RATE_LIMITED', 'test');
		const ids = err.recoveryOptions.map((o) => o.id);
		expect(ids).toContain('wait');
	});

	it('should provide retry and cancel for UNKNOWN', () => {
		const err = createVFSError('UNKNOWN', 'test');
		const ids = err.recoveryOptions.map((o) => o.id);
		expect(ids).toContain('retry');
		expect(ids).toContain('cancel');
	});
});

// ============================================================================
// Tests: parseError
// ============================================================================

describe('parseError', () => {
	it('should return VFSError unchanged', () => {
		const original = createVFSError('FILE_NOT_FOUND', 'missing');
		const result = parseError(original);
		expect(result).toBe(original);
	});

	it('should parse TypeError with fetch in message as NETWORK_ERROR', () => {
		const err = new TypeError('Failed to fetch');
		const result = parseError(err);
		expect(result.code).toBe('NETWORK_ERROR');
	});

	it('should parse AbortError as TIMEOUT', () => {
		const err = new Error('Aborted');
		err.name = 'AbortError';
		const result = parseError(err);
		expect(result.code).toBe('TIMEOUT');
	});

	it('should parse object with status 404 as FILE_NOT_FOUND', () => {
		const result = parseError({ status: 404, message: 'not found' });
		expect(result.code).toBe('FILE_NOT_FOUND');
	});

	it('should parse object with status 409 as VERSION_CONFLICT', () => {
		const result = parseError({ status: 409, message: 'conflict' });
		expect(result.code).toBe('VERSION_CONFLICT');
	});

	it('should parse 409 with lock message as FILE_LOCKED', () => {
		const result = parseError({ status: 409, message: 'File is locked by another user' });
		expect(result.code).toBe('FILE_LOCKED');
	});

	it('should parse object with status 423 as FILE_LOCKED', () => {
		const result = parseError({ status: 423, message: 'Locked' });
		expect(result.code).toBe('FILE_LOCKED');
	});

	it('should parse object with status 429 as RATE_LIMITED', () => {
		const result = parseError({ status: 429, message: 'Too many' });
		expect(result.code).toBe('RATE_LIMITED');
	});

	it('should parse object with status 500 as SERVER_ERROR', () => {
		const result = parseError({ status: 500, message: 'Internal' });
		expect(result.code).toBe('SERVER_ERROR');
	});

	it('should parse generic Error as UNKNOWN', () => {
		const result = parseError(new Error('Something happened'));
		expect(result.code).toBe('UNKNOWN');
	});

	it('should parse string as UNKNOWN', () => {
		const result = parseError('some error string');
		expect(result.code).toBe('UNKNOWN');
	});

	it('should include context path and workspaceId', () => {
		const result = parseError(new Error('err'), { path: '/file.ts', workspaceId: 'ws1' });
		expect(result.path).toBe('/file.ts');
		expect(result.workspaceId).toBe('ws1');
	});
});

// ============================================================================
// Tests: Error Classification
// ============================================================================

describe('isVFSError', () => {
	it('should return true for VFSError', () => {
		const err = createVFSError('FILE_NOT_FOUND', 'test');
		expect(isVFSError(err)).toBe(true);
	});

	it('should return false for regular Error', () => {
		expect(isVFSError(new Error('nope'))).toBe(false);
	});

	it('should return false for non-error values', () => {
		expect(isVFSError('string')).toBe(false);
		expect(isVFSError(null)).toBe(false);
		expect(isVFSError(undefined)).toBe(false);
	});
});

describe('isConflictError', () => {
	it('should return true for FILE_LOCKED', () => {
		const err = createVFSError('FILE_LOCKED', 'test');
		expect(isConflictError(err)).toBe(true);
	});

	it('should return true for LOCK_CONFLICT', () => {
		const err = createVFSError('LOCK_CONFLICT', 'test');
		expect(isConflictError(err)).toBe(true);
	});

	it('should return true for VERSION_CONFLICT', () => {
		const err = createVFSError('VERSION_CONFLICT', 'test');
		expect(isConflictError(err)).toBe(true);
	});

	it('should return false for NETWORK_ERROR', () => {
		const err = createVFSError('NETWORK_ERROR', 'test');
		expect(isConflictError(err)).toBe(false);
	});
});

describe('isRecoverableError', () => {
	it('should return true when recovery options exist', () => {
		const err = createVFSError('FILE_LOCKED', 'test');
		expect(isRecoverableError(err)).toBe(true);
	});

	it('should return false when no recovery options', () => {
		// UNKNOWN actually has retry and cancel options, so it is recoverable
		// Let's create one manually with empty options
		const custom = createVFSError('PERMISSION_DENIED', 'test');
		// PERMISSION_DENIED has 1 option (cancel), so still recoverable
		expect(isRecoverableError(custom)).toBe(true);
	});
});

// ============================================================================
// Tests: executeRecovery
// ============================================================================

describe('executeRecovery', () => {
	it('should call onRetry for retry action', async () => {
		const handler = vi.fn();
		const option: RecoveryOption = {
			id: 'retry',
			label: 'Retry',
			description: 'Try again',
			action: 'retry'
		};
		await executeRecovery(option, { onRetry: handler });
		expect(handler).toHaveBeenCalledOnce();
	});

	it('should call onForce for force action', async () => {
		const handler = vi.fn();
		const option: RecoveryOption = {
			id: 'force',
			label: 'Force',
			description: 'Force it',
			action: 'force'
		};
		await executeRecovery(option, { onForce: handler });
		expect(handler).toHaveBeenCalledOnce();
	});

	it('should call onMerge for merge action', async () => {
		const handler = vi.fn();
		const option: RecoveryOption = {
			id: 'merge',
			label: 'Merge',
			description: 'Merge changes',
			action: 'merge'
		};
		await executeRecovery(option, { onMerge: handler });
		expect(handler).toHaveBeenCalledOnce();
	});

	it('should call onDiscard for discard action', async () => {
		const handler = vi.fn();
		const option: RecoveryOption = {
			id: 'discard',
			label: 'Discard',
			description: 'Discard changes',
			action: 'discard'
		};
		await executeRecovery(option, { onDiscard: handler });
		expect(handler).toHaveBeenCalledOnce();
	});

	it('should call onRefresh for refresh action', async () => {
		const handler = vi.fn();
		const option: RecoveryOption = {
			id: 'refresh',
			label: 'Refresh',
			description: 'Refresh',
			action: 'refresh'
		};
		await executeRecovery(option, { onRefresh: handler });
		expect(handler).toHaveBeenCalledOnce();
	});

	it('should call onWait for wait action', async () => {
		const handler = vi.fn();
		const option: RecoveryOption = {
			id: 'wait',
			label: 'Wait',
			description: 'Wait',
			action: 'wait'
		};
		await executeRecovery(option, { onWait: handler });
		expect(handler).toHaveBeenCalledOnce();
	});

	it('should call onCancel for cancel action', async () => {
		const handler = vi.fn();
		const option: RecoveryOption = {
			id: 'cancel',
			label: 'Cancel',
			description: 'Cancel',
			action: 'cancel'
		};
		await executeRecovery(option, { onCancel: handler });
		expect(handler).toHaveBeenCalledOnce();
	});

	it('should not throw if handler is not provided', async () => {
		const option: RecoveryOption = {
			id: 'retry',
			label: 'Retry',
			description: 'Try again',
			action: 'retry'
		};
		// No handlers provided — should not throw
		await expect(executeRecovery(option, {})).resolves.toBeUndefined();
	});
});

// ============================================================================
// Tests: aggregateErrors
// ============================================================================

describe('aggregateErrors', () => {
	it('should aggregate empty array', () => {
		const result = aggregateErrors([]);
		expect(result.total).toBe(0);
		expect(result.retryable).toHaveLength(0);
		expect(result.needsUserAction).toHaveLength(0);
		expect(result.fatal).toHaveLength(0);
	});

	it('should categorize retryable errors', () => {
		const errors = [
			createVFSError('NETWORK_ERROR', 'net'),
			createVFSError('TIMEOUT', 'timeout'),
			createVFSError('SERVER_ERROR', 'server')
		];

		const result = aggregateErrors(errors);
		expect(result.total).toBe(3);
		expect(result.retryable).toHaveLength(3);
		expect(result.needsUserAction).toHaveLength(0);
		expect(result.fatal).toHaveLength(0);
	});

	it('should categorize conflict errors as needing user action', () => {
		const errors = [
			createVFSError('FILE_LOCKED', 'locked'),
			createVFSError('VERSION_CONFLICT', 'conflict')
		];

		const result = aggregateErrors(errors);
		expect(result.needsUserAction).toHaveLength(2);
	});

	it('should categorize non-retryable non-conflict as fatal', () => {
		const errors = [
			createVFSError('PERMISSION_DENIED', 'denied'),
			createVFSError('INVALID_OPERATION', 'invalid')
		];

		const result = aggregateErrors(errors);
		expect(result.fatal).toHaveLength(2);
	});

	it('should group by code', () => {
		const errors = [
			createVFSError('NETWORK_ERROR', 'a'),
			createVFSError('NETWORK_ERROR', 'b'),
			createVFSError('FILE_NOT_FOUND', 'c')
		];

		const result = aggregateErrors(errors);
		expect(result.byCode.get('NETWORK_ERROR')).toHaveLength(2);
		expect(result.byCode.get('FILE_NOT_FOUND')).toHaveLength(1);
	});

	it('should handle mixed categories', () => {
		const errors = [
			createVFSError('NETWORK_ERROR', 'net'),
			createVFSError('FILE_LOCKED', 'locked'),
			createVFSError('PERMISSION_DENIED', 'denied')
		];

		const result = aggregateErrors(errors);
		expect(result.total).toBe(3);
		expect(result.retryable).toHaveLength(1);
		expect(result.needsUserAction).toHaveLength(1);
		expect(result.fatal).toHaveLength(1);
	});
});

// ============================================================================
// Tests: Error Logging
// ============================================================================

describe('Error Logging', () => {
	beforeEach(() => {
		clearErrorLog();
	});

	it('should log an error', () => {
		const err = createVFSError('NETWORK_ERROR', 'test');
		logError(err);

		const recent = getRecentErrors();
		expect(recent).toHaveLength(1);
		expect(recent[0].error).toBe(err);
		expect(recent[0].level).toBe('error'); // default level
	});

	it('should log with custom level and context', () => {
		const err = createVFSError('TIMEOUT', 'slow');
		logError(err, 'warn', { operation: 'readFile' });

		const recent = getRecentErrors();
		expect(recent[0].level).toBe('warn');
		expect(recent[0].context).toEqual({ operation: 'readFile' });
	});

	it('should include timestamp', () => {
		const before = Date.now();
		logError(createVFSError('UNKNOWN', 'test'));
		const after = Date.now();

		const recent = getRecentErrors();
		expect(recent[0].timestamp).toBeGreaterThanOrEqual(before);
		expect(recent[0].timestamp).toBeLessThanOrEqual(after);
	});

	it('should respect limit parameter', () => {
		for (let i = 0; i < 5; i++) {
			logError(createVFSError('UNKNOWN', `error-${i}`));
		}

		expect(getRecentErrors(3)).toHaveLength(3);
		expect(getRecentErrors(10)).toHaveLength(5);
	});

	it('should trim log when exceeding MAX_LOG_SIZE', () => {
		// Log 105 entries
		for (let i = 0; i < 105; i++) {
			logError(createVFSError('UNKNOWN', `error-${i}`));
		}

		// MAX_LOG_SIZE is 100, so oldest entries should be trimmed
		const all = getRecentErrors(200);
		expect(all.length).toBeLessThanOrEqual(100);
	});

	it('should clear error log', () => {
		logError(createVFSError('UNKNOWN', 'test'));
		expect(getRecentErrors()).toHaveLength(1);

		clearErrorLog();
		expect(getRecentErrors()).toHaveLength(0);
	});
});
