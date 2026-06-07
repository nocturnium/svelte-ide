/**
 * CRDT (Conflict-free Replicated Data Types) type definitions
 * for collaborative editing with users and AI
 */

export interface CollaborationConfig {
	/** WebSocket server URL for Yjs sync */
	serverUrl: string;
	/** Room/document identifier */
	roomId: string;
	/** Current user information */
	user: CollaborationUser;
	/** Enable awareness (cursors, selections) */
	awareness?: boolean;
	/** Reconnection settings */
	reconnect?: {
		maxRetries: number;
		baseDelay: number;
		maxDelay: number;
	};
}

export interface CollaborationUser {
	id: string;
	name: string;
	color: string;
	/** Whether this is an AI participant */
	isAI?: boolean;
	/** Avatar URL or initials */
	avatar?: string;
}

export interface CollaborationState {
	/** Connection status */
	status: 'connecting' | 'connected' | 'disconnected' | 'error';
	/** Error message if status is 'error' */
	error?: string;
	/** Connected users in the room */
	users: CollaborationUser[];
	/** Synced document state */
	synced: boolean;
	/** Pending local changes */
	pendingChanges: number;
}

export interface CollaboratorCursor {
	userId: string;
	user: CollaborationUser;
	position: {
		line: number;
		column: number;
	};
	selection?: {
		anchor: { line: number; column: number };
		head: { line: number; column: number };
	};
	lastActivity: Date;
}

export interface CollaboratorAwareness {
	userId: string;
	user: CollaborationUser;
	cursor?: CollaboratorCursor['position'];
	selection?: CollaboratorCursor['selection'];
	/** Currently viewing file */
	viewingFile?: string;
	/** Currently editing file */
	editingFile?: string;
	/** Idle/active state */
	state: 'active' | 'idle' | 'away';
}

/**
 * Document operation for CRDT sync
 */
export interface DocumentOperation {
	type: 'insert' | 'delete' | 'retain';
	position?: number;
	content?: string;
	length?: number;
	attributes?: Record<string, unknown>;
}

/**
 * Snapshot of document state at a point in time
 */
export interface DocumentSnapshot {
	id: string;
	documentId: string;
	content: string;
	version: number;
	createdAt: Date;
	createdBy: CollaborationUser;
	/** Reason for snapshot */
	reason?: 'manual' | 'auto' | 'ai_edit' | 'checkpoint';
}

/**
 * AI collaboration session
 */
export interface AICollaborationSession {
	id: string;
	documentId: string;
	status: 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';
	/** AI user participating in this session */
	aiUser: CollaborationUser;
	/** Human users in the session */
	humanUsers: CollaborationUser[];
	/** What the AI is currently doing */
	currentTask?: string;
	/** Proposed changes waiting for approval */
	pendingChanges?: AIProposedChange[];
	startedAt: Date;
	updatedAt: Date;
}

export interface AIProposedChange {
	id: string;
	sessionId: string;
	type: 'insert' | 'delete' | 'replace';
	range: {
		startLine: number;
		startColumn: number;
		endLine: number;
		endColumn: number;
	};
	originalContent: string;
	proposedContent: string;
	explanation?: string;
	status: 'pending' | 'approved' | 'rejected' | 'modified';
	reviewedBy?: string;
	reviewedAt?: Date;
}

/**
 * Conflict resolution strategy
 */
export type ConflictResolution = 'last_write_wins' | 'first_write_wins' | 'manual' | 'ai_assisted';

/**
 * Undo/Redo manager for CRDT
 */
export interface UndoManager {
	canUndo: boolean;
	canRedo: boolean;
	undoStack: UndoItem[];
	redoStack: UndoItem[];
}

export interface UndoItem {
	id: string;
	operations: DocumentOperation[];
	userId: string;
	timestamp: Date;
	description?: string;
}

/**
 * Presence information for real-time collaboration
 */
export interface PresenceState {
	[clientId: string]: CollaboratorAwareness;
}

/**
 * Events emitted by the collaboration system
 */
export type CollaborationEvent =
	| { type: 'connected'; users: CollaborationUser[] }
	| { type: 'disconnected'; reason?: string }
	| { type: 'user_joined'; user: CollaborationUser }
	| { type: 'user_left'; userId: string }
	| { type: 'cursor_moved'; cursor: CollaboratorCursor }
	| { type: 'selection_changed'; userId: string; selection: CollaboratorCursor['selection'] }
	| { type: 'document_changed'; operations: DocumentOperation[]; origin: string }
	| { type: 'sync_complete'; version: number }
	| { type: 'conflict'; operations: DocumentOperation[]; resolution: ConflictResolution }
	| { type: 'ai_edit_started'; session: AICollaborationSession }
	| { type: 'ai_edit_proposed'; change: AIProposedChange }
	| { type: 'ai_edit_completed'; sessionId: string }
	| { type: 'snapshot_created'; snapshot: DocumentSnapshot };

export type CollaborationEventHandler = (event: CollaborationEvent) => void;

/**
 * Options for Yjs document initialization
 */
export interface YjsDocumentOptions {
	/** Document ID for multi-document support */
	documentId: string;
	/** Initial content if document is new */
	initialContent?: string;
	/** Enable undo manager */
	undoManager?: boolean;
	/** Capture timeout for undo grouping (ms) */
	undoCaptureTimeout?: number;
	/** Enable persistence */
	persistence?: {
		enabled: boolean;
		/** IndexedDB database name */
		dbName?: string;
	};
}
