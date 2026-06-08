/**
 * CRDT-specific types for the collaboration module
 */

import type { Doc as YDoc } from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

export interface DocumentOptions {
	documentId: string;
	initialContent?: string;
	enableUndo?: boolean;
	undoCaptureTimeout?: number;
}

export interface ProviderOptions {
	serverUrl: string;
	roomId: string;
	doc: YDoc;
	awareness?: Awareness;
	params?: Record<string, string>;
	connect?: boolean;
	resyncInterval?: number;
	maxBackoffTime?: number;
}

export interface AwarenessState {
	user: {
		id: string;
		name: string;
		color: string;
		isAI?: boolean;
	};
	cursor?: {
		anchor: number;
		head: number;
	};
	selection?: {
		anchor: number;
		head: number;
	};
	viewingFile?: string;
	editingFile?: string;
	state: 'active' | 'idle' | 'away';
}

export interface CRDTChange {
	origin: string | null;
	local: boolean;
	added: Set<number>;
	updated: Set<number>;
	removed: Set<number>;
}

export interface SyncState {
	synced: boolean;
	pending: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface CRDTEventMap {
	sync: (synced: boolean) => void;
	update: (update: Uint8Array, origin: string | null) => void;
	'awareness-change': (changes: CRDTChange) => void;
	status: (status: { status: ConnectionStatus }) => void;
	error: (error: Error) => void;
}
