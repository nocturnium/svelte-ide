/**
 * Error Handling Service
 *
 * Provides structured error types, recovery strategies, and user-friendly error messages.
 */

import { VFSError, type VFSErrorCode } from '$lib/types/vfs';

// ============================================================================
// Error Types
// ============================================================================

export { VFSError, type VFSErrorCode };

export interface RecoveryOption {
	id: string;
	label: string;
	description: string;
	action: 'retry' | 'force' | 'merge' | 'discard' | 'refresh' | 'wait' | 'cancel';
	recommended?: boolean;
	dangerous?: boolean;
}

// ============================================================================
// Error Factory
// ============================================================================

/**
 * Create a structured VFS error
 */
export function createVFSError(
	code: VFSErrorCode,
	message: string,
	options: {
		statusCode?: number;
		path?: string;
		workspaceId?: string;
		cause?: Error;
	} = {}
): VFSError {
	const error = new VFSError(message, code, options.cause);
	error.statusCode = options.statusCode;
	error.path = options.path;
	error.workspaceId = options.workspaceId;
	error.cause = options.cause;
	error.retryable = isRetryableError(code);
	error.userMessage = getUserMessage(code, options.path);
	error.technicalDetails = message;
	error.recoveryOptions = getRecoveryOptions(code);

	return error;
}

/**
 * Parse an error response into a VFSError
 */
export function parseError(
	error: unknown,
	context?: { path?: string; workspaceId?: string }
): VFSError {
	// Already a VFSError
	if (isVFSError(error)) {
		error.path ??= context?.path;
		error.workspaceId ??= context?.workspaceId;
		error.retryable = isRetryableError(error.code);
		error.userMessage = getUserMessage(error.code, error.path);
		error.technicalDetails ??= error.message;
		if (error.recoveryOptions.length === 0) {
			error.recoveryOptions = getRecoveryOptions(error.code);
		}
		return error;
	}

	// Network/fetch errors
	if (error instanceof TypeError && error.message.includes('fetch')) {
		return createVFSError('NETWORK_ERROR', 'Network request failed', context);
	}

	// Timeout errors
	if (error instanceof Error && error.name === 'AbortError') {
		return createVFSError('TIMEOUT', 'Request timed out', context);
	}

	// HTTP response errors
	if (error instanceof Response) {
		return parseHttpError(error, context);
	}

	// Error with status property (from fetch responses)
	if (error && typeof error === 'object' && 'status' in error) {
		const status = (error as { status: number }).status;
		const message =
			'message' in error ? String((error as { message: string }).message) : 'Request failed';
		return parseStatusCode(status, message, context);
	}

	// Generic error
	if (error instanceof Error) {
		return createVFSError('UNKNOWN', error.message, { ...context, cause: error });
	}

	return createVFSError('UNKNOWN', String(error), context);
}

/**
 * Parse HTTP response into VFSError
 */
function parseHttpError(
	response: Response,
	context?: { path?: string; workspaceId?: string }
): VFSError {
	return parseStatusCode(response.status, response.statusText, context);
}

/**
 * Map HTTP status code to VFSError
 */
function parseStatusCode(
	status: number,
	message: string,
	context?: { path?: string; workspaceId?: string }
): VFSError {
	const options = { statusCode: status, ...context };

	switch (status) {
		case 401:
		case 403:
			return createVFSError('PERMISSION_DENIED', message, options);
		case 404:
			return createVFSError('FILE_NOT_FOUND', message, options);
		case 409:
			if (message.toLowerCase().includes('lock')) {
				return createVFSError('FILE_LOCKED', message, options);
			}
			return createVFSError('VERSION_CONFLICT', message, options);
		case 423:
			return createVFSError('FILE_LOCKED', message, options);
		case 429:
			return createVFSError('RATE_LIMITED', message, options);
		case 500:
		case 502:
		case 503:
		case 504:
			return createVFSError('SERVER_ERROR', message, options);
		default:
			return createVFSError('UNKNOWN', message, options);
	}
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Check if error is a VFSError
 */
export function isVFSError(error: unknown): error is VFSError {
	return error instanceof VFSError;
}

/**
 * Check if error code is retryable
 */
function isRetryableError(code: VFSErrorCode): boolean {
	return ['NETWORK_ERROR', 'CONNECTION_LOST', 'TIMEOUT', 'SERVER_ERROR', 'RATE_LIMITED'].includes(
		code
	);
}

/**
 * Check if error is a conflict that needs user resolution
 */
export function isConflictError(error: VFSError): boolean {
	return ['FILE_LOCKED', 'LOCK_CONFLICT', 'VERSION_CONFLICT'].includes(error.code);
}

/**
 * Check if error is recoverable with user action
 */
export function isRecoverableError(error: VFSError): boolean {
	return error.recoveryOptions.length > 0;
}

// ============================================================================
// User Messages
// ============================================================================

/**
 * Get user-friendly error message
 */
function getUserMessage(code: VFSErrorCode, path?: string): string {
	const fileName = path ? path.split('/').pop() : 'the file';

	switch (code) {
		case 'NETWORK_ERROR':
			return 'Unable to connect to the server. Please check your internet connection.';
		case 'CONNECTION_LOST':
			return 'Connection to the server was lost. Attempting to reconnect...';
		case 'TIMEOUT':
			return 'The request took too long to complete. Please try again.';
		case 'FILE_LOCKED':
			return `${fileName} is currently being edited by another user.`;
		case 'LOCK_EXPIRED':
			return `Your editing session for ${fileName} has expired.`;
		case 'LOCK_CONFLICT':
			return `There was a conflict acquiring the lock for ${fileName}.`;
		case 'VERSION_CONFLICT':
			return `${fileName} was modified by someone else while you were editing.`;
		case 'FILE_NOT_FOUND':
			return `${fileName} could not be found. It may have been moved or deleted.`;
		case 'PERMISSION_DENIED':
			return `You don't have permission to access ${fileName}.`;
		case 'WORKSPACE_NOT_FOUND':
			return 'The workspace could not be found.';
		case 'INVALID_OPERATION':
			return 'This operation is not allowed.';
		case 'SERVER_ERROR':
			return 'The server encountered an error. Please try again later.';
		case 'RATE_LIMITED':
			return 'Too many requests. Please wait a moment before trying again.';
		default:
			return 'An unexpected error occurred. Please try again.';
	}
}

/**
 * Get recovery options for error code
 */
function getRecoveryOptions(code: VFSErrorCode): RecoveryOption[] {
	switch (code) {
		case 'NETWORK_ERROR':
		case 'TIMEOUT':
		case 'SERVER_ERROR':
			return [
				{
					id: 'retry',
					label: 'Retry',
					description: 'Try the operation again',
					action: 'retry',
					recommended: true
				},
				{
					id: 'cancel',
					label: 'Cancel',
					description: 'Cancel this operation',
					action: 'cancel'
				}
			];

		case 'CONNECTION_LOST':
			return [
				{
					id: 'wait',
					label: 'Wait for Reconnection',
					description: 'The system will automatically reconnect',
					action: 'wait',
					recommended: true
				},
				{
					id: 'refresh',
					label: 'Refresh Page',
					description: 'Reload the page to reconnect',
					action: 'refresh'
				}
			];

		case 'FILE_LOCKED':
			return [
				{
					id: 'wait',
					label: 'Wait',
					description: 'Wait for the lock to be released',
					action: 'wait',
					recommended: true
				},
				{
					id: 'force',
					label: 'Force Unlock',
					description: 'Take over the lock (may cause data loss for the other user)',
					action: 'force',
					dangerous: true
				},
				{
					id: 'cancel',
					label: 'Open Read-Only',
					description: 'View the file without editing',
					action: 'cancel'
				}
			];

		case 'LOCK_EXPIRED':
			return [
				{
					id: 'retry',
					label: 'Reacquire Lock',
					description: 'Try to get the lock again and save',
					action: 'retry',
					recommended: true
				},
				{
					id: 'discard',
					label: 'Discard Changes',
					description: 'Lose your unsaved changes',
					action: 'discard',
					dangerous: true
				}
			];

		case 'VERSION_CONFLICT':
			return [
				{
					id: 'merge',
					label: 'Merge Changes',
					description: 'Review and merge your changes with the server version',
					action: 'merge',
					recommended: true
				},
				{
					id: 'force',
					label: 'Overwrite',
					description: 'Replace server version with your changes',
					action: 'force',
					dangerous: true
				},
				{
					id: 'discard',
					label: 'Use Server Version',
					description: 'Discard your changes and use the latest version',
					action: 'discard'
				}
			];

		case 'FILE_NOT_FOUND':
			return [
				{
					id: 'refresh',
					label: 'Refresh File List',
					description: 'Update the file explorer',
					action: 'refresh',
					recommended: true
				},
				{
					id: 'cancel',
					label: 'Close',
					description: 'Close this file tab',
					action: 'cancel'
				}
			];

		case 'PERMISSION_DENIED':
			return [
				{
					id: 'cancel',
					label: 'OK',
					description: 'Acknowledge and close',
					action: 'cancel'
				}
			];

		case 'RATE_LIMITED':
			return [
				{
					id: 'wait',
					label: 'Wait',
					description: 'Wait a moment before retrying',
					action: 'wait',
					recommended: true
				}
			];

		default:
			return [
				{
					id: 'retry',
					label: 'Retry',
					description: 'Try the operation again',
					action: 'retry'
				},
				{
					id: 'cancel',
					label: 'Cancel',
					description: 'Cancel this operation',
					action: 'cancel'
				}
			];
	}
}

// ============================================================================
// Error Recovery
// ============================================================================

export interface ErrorRecoveryHandler {
	onRetry: () => Promise<void>;
	onForce: () => Promise<void>;
	onMerge: () => Promise<void>;
	onDiscard: () => Promise<void>;
	onRefresh: () => Promise<void>;
	onWait: () => Promise<void>;
	onCancel: () => void;
}

/**
 * Execute a recovery action
 */
export async function executeRecovery(
	option: RecoveryOption,
	handlers: Partial<ErrorRecoveryHandler>
): Promise<void> {
	switch (option.action) {
		case 'retry':
			await handlers.onRetry?.();
			break;
		case 'force':
			await handlers.onForce?.();
			break;
		case 'merge':
			await handlers.onMerge?.();
			break;
		case 'discard':
			await handlers.onDiscard?.();
			break;
		case 'refresh':
			await handlers.onRefresh?.();
			break;
		case 'wait':
			await handlers.onWait?.();
			break;
		case 'cancel':
			handlers.onCancel?.();
			break;
	}
}

// ============================================================================
// Error Aggregation
// ============================================================================

export interface AggregatedErrors {
	total: number;
	byCode: Map<VFSErrorCode, VFSError[]>;
	retryable: VFSError[];
	needsUserAction: VFSError[];
	fatal: VFSError[];
}

/**
 * Aggregate multiple errors for batch operations
 */
export function aggregateErrors(errors: VFSError[]): AggregatedErrors {
	const byCode = new Map<VFSErrorCode, VFSError[]>();
	const retryable: VFSError[] = [];
	const needsUserAction: VFSError[] = [];
	const fatal: VFSError[] = [];

	for (const error of errors) {
		// Group by code
		const existing = byCode.get(error.code) || [];
		existing.push(error);
		byCode.set(error.code, existing);

		// Categorize
		if (error.retryable) {
			retryable.push(error);
		} else if (isConflictError(error)) {
			needsUserAction.push(error);
		} else {
			fatal.push(error);
		}
	}

	return {
		total: errors.length,
		byCode,
		retryable,
		needsUserAction,
		fatal
	};
}

// ============================================================================
// Logging
// ============================================================================

export type ErrorLogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface ErrorLogEntry {
	timestamp: number;
	error: VFSError;
	level: ErrorLogLevel;
	context?: Record<string, unknown>;
}

const errorLog: ErrorLogEntry[] = [];
const MAX_LOG_SIZE = 100;

/**
 * Log an error
 */
export function logError(
	error: VFSError,
	level: ErrorLogLevel = 'error',
	context?: Record<string, unknown>
): void {
	const entry: ErrorLogEntry = {
		timestamp: Date.now(),
		error,
		level,
		context
	};

	errorLog.push(entry);

	// Trim log if too large
	if (errorLog.length > MAX_LOG_SIZE) {
		errorLog.shift();
	}

	// Also log to console in development
	if (typeof window !== 'undefined' && (window as unknown as { __DEV__?: boolean }).__DEV__) {
		const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
		logFn(`[VFS ${level.toUpperCase()}]`, error.code, error.userMessage, context);
	}
}

/**
 * Get recent errors
 */
export function getRecentErrors(limit: number = 10): ErrorLogEntry[] {
	return errorLog.slice(-limit);
}

/**
 * Clear error log
 */
export function clearErrorLog(): void {
	errorLog.length = 0;
}
