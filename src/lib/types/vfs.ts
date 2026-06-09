/**
 * VFS-related type definitions
 * For integrating with a virtual filesystem backend that supports file locking,
 * transactions, and Server-Sent-Events
 */

// ============================================================================
// Core VFS Types
// ============================================================================

export interface VFSFileInfo {
	path: string;
	name: string;
	size: number;
	modTime: string; // ISO 8601
	isDir: boolean;
	mode: number; // Unix file permissions
	version: number; // For conflict detection
	checksum?: string; // Content hash for integrity
}

export interface VFSFile {
	info: VFSFileInfo;
	content: string | ArrayBuffer; // Text or binary content
}

export interface VFSDirectory {
	path: string;
	entries: VFSFileInfo[];
	totalSize: number;
	fileCount: number;
	dirCount: number;
}

// ============================================================================
// Workspace Types
// ============================================================================

export interface VFSWorkspace {
	id: string;
	name: string;
	rootPath: string;
	createdAt: string;
	updatedAt: string;
	owner: string;
	settings?: VFSWorkspaceSettings;
}

export interface VFSWorkspaceSettings {
	theme?: string;
	autoSave?: boolean;
	autoSaveDelay?: number;
	fileExclusions?: string[]; // Glob patterns
	searchExclusions?: string[];
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface VFSTransaction {
	id: string;
	workspaceId: string;
	operations: VFSOperation[];
	status: 'pending' | 'committed' | 'rolledback';
	createdAt: string;
	committedAt?: string;
}

export type VFSOperation =
	| { type: 'create'; path: string; content: string }
	| { type: 'update'; path: string; content: string; version: number }
	| { type: 'delete'; path: string; version: number }
	| { type: 'rename'; oldPath: string; newPath: string; version: number }
	| { type: 'mkdir'; path: string };

export interface VFSTransactionResult {
	transactionId: string;
	success: boolean;
	operations: {
		operation: VFSOperation;
		success: boolean;
		error?: string;
		newVersion?: number;
	}[];
}

// ============================================================================
// Lock Types
// ============================================================================

export interface VFSFileLock {
	path: string;
	workspaceId: string;
	holder: string; // User/agent ID
	holderType: 'user' | 'agent';
	holderName?: string; // Display name
	acquiredAt: string;
	expiresAt: string;
	ttl: number; // Milliseconds (5 minutes = 300000)
	refreshCount: number;
	purpose?: 'edit' | 'refactor' | 'delete' | 'rename';
}

export type VFSLockStatus =
	| { status: 'unlocked' }
	| { status: 'locked'; lock: VFSFileLock }
	| { status: 'acquiring' }
	| { status: 'failed'; error: string };

export interface VFSLockAcquisitionOptions {
	ttl?: number; // Default 300000 (5 min)
	maxRetries?: number; // Default 30
	retryDelay?: number; // Default 100ms
	purpose?: VFSFileLock['purpose'];
}

// ============================================================================
// Error Types
// ============================================================================

export class VFSError extends Error {
	statusCode?: number;
	path?: string;
	workspaceId?: string;
	retryable = false;
	userMessage: string;
	technicalDetails?: string;
	recoveryOptions: {
		id: string;
		label: string;
		description: string;
		action: 'retry' | 'force' | 'merge' | 'discard' | 'refresh' | 'wait' | 'cancel';
		recommended?: boolean;
		dangerous?: boolean;
	}[] = [];

	constructor(
		message: string,
		public code: VFSErrorCode,
		public details?: unknown
	) {
		super(message);
		this.name = 'VFSError';
		this.userMessage = message;
		this.technicalDetails = message;
	}
}

export type VFSErrorCode =
	| 'NETWORK_ERROR'
	| 'CONNECTION_LOST'
	| 'TIMEOUT'
	| 'FILE_LOCKED'
	| 'LOCK_EXPIRED'
	| 'LOCK_CONFLICT'
	| 'VERSION_CONFLICT'
	| 'FILE_NOT_FOUND'
	| 'PERMISSION_DENIED'
	| 'WORKSPACE_NOT_FOUND'
	| 'INVALID_OPERATION'
	| 'SERVER_ERROR'
	| 'RATE_LIMITED'
	| 'TRANSACTION_FAILED'
	| 'INVALID_PATH'
	| 'UNKNOWN';

// ============================================================================
// SSE Event Types
// ============================================================================

export type VFSEvent =
	| VFSSnapshotEvent
	| VFSUpdateEvent
	| VFSPingEvent
	| VFSCompleteEvent
	| VFSErrorEvent
	| VFSIterationCompletedEvent
	| VFSChangeClassifiedEvent
	| VFSGateProgressEvent
	| VFSLockAcquiredEvent
	| VFSLockReleasedEvent;

export interface VFSBaseEvent {
	timestamp: string;
	workspaceId: string;
}

export interface VFSSnapshotEvent extends VFSBaseEvent {
	type: 'snapshot';
	files: VFSFileInfo[];
	locks: VFSFileLock[];
	version: number;
}

export interface VFSUpdateEvent extends VFSBaseEvent {
	type: 'update';
	operation: VFSOperation;
	actor: string; // User/agent ID
	actorType: 'user' | 'agent';
	actorName?: string;
	version: number;
	files?: VFSFileInfo[]; // Updated file info
}

export interface VFSPingEvent extends VFSBaseEvent {
	type: 'ping';
	serverTime: string;
}

export interface VFSCompleteEvent extends VFSBaseEvent {
	type: 'complete';
	reason: string;
}

export interface VFSErrorEvent extends VFSBaseEvent {
	type: 'error';
	error: string;
	code: VFSErrorCode;
}

export interface VFSIterationCompletedEvent extends VFSBaseEvent {
	type: 'iteration_completed';
	iterationId: string;
	agentId: string;
	filesModified: string[];
	summary: string;
}

export interface VFSChangeClassifiedEvent extends VFSBaseEvent {
	type: 'change_classified';
	path: string;
	classification: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test';
	confidence: number;
}

export interface VFSGateProgressEvent extends VFSBaseEvent {
	type: 'gate_progress';
	gate: 'planning' | 'implementation' | 'testing' | 'review';
	progress: number; // 0-100
	agentId: string;
}

export interface VFSLockAcquiredEvent extends VFSBaseEvent {
	type: 'lock_acquired';
	lock: VFSFileLock;
}

export interface VFSLockReleasedEvent extends VFSBaseEvent {
	type: 'lock_released';
	path: string;
	holder: string;
}

// ============================================================================
// Connection Types
// ============================================================================

export interface VFSConnectionState {
	status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
	lastEventTime: string | null;
	reconnectAttempts: number;
	error: string | null;
}

export interface VFSClientConfig {
	baseUrl?: string;
	defaultWorkspaceId?: string;
	timeout?: number;
	lockTTL?: number;
	maxReconnectAttempts?: number;
}
