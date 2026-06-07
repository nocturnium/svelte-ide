/**
 * IDE Event system type definitions
 */

export interface IDEEvent<T = unknown> {
	type: IDEEventType;
	payload: T;
	timestamp: number;
	source?: string;
}

export type IDEEventType =
	// File events
	| 'file:open'
	| 'file:close'
	| 'file:save'
	| 'file:create'
	| 'file:delete'
	| 'file:rename'
	| 'file:move'
	// Editor events
	| 'editor:change'
	| 'editor:cursor'
	| 'editor:selection'
	| 'editor:focus'
	| 'editor:blur'
	| 'editor:scroll'
	// Tab events
	| 'tab:open'
	| 'tab:close'
	| 'tab:switch'
	| 'tab:reorder'
	// Search events
	| 'search:query'
	| 'search:result'
	| 'search:navigate'
	// Command events
	| 'command:execute'
	| 'command:register'
	| 'command:unregister'
	// Panel events
	| 'panel:toggle'
	| 'panel:resize'
	| 'panel:focus'
	// Layout events
	| 'layout:change'
	| 'layout:reset'
	// AI events
	| 'ai:message'
	| 'ai:tool_call'
	| 'ai:edit_start'
	| 'ai:edit_complete'
	| 'ai:suggestion'
	// Collaboration events
	| 'collab:connect'
	| 'collab:disconnect'
	| 'collab:user_join'
	| 'collab:user_leave'
	| 'collab:cursor'
	| 'collab:sync'
	// Plugin events
	| 'plugin:load'
	| 'plugin:unload'
	| 'plugin:error'
	| 'plugin:message';

export interface IDEAction {
	id: string;
	label: string;
	description?: string;
	icon?: string;
	keybinding?: string[];
	when?: string;
	handler: () => void | Promise<void>;
}

export interface IDECommand extends IDEAction {
	category?: string;
}

export interface IDEKeybinding {
	keys: string[];
	command: string;
	when?: string;
	args?: Record<string, unknown>;
}

/**
 * Event bus for IDE-wide communication
 */
export interface EventBus {
	emit<T>(type: IDEEventType, payload: T): void;
	on<T>(type: IDEEventType, handler: (event: IDEEvent<T>) => void): () => void;
	once<T>(type: IDEEventType, handler: (event: IDEEvent<T>) => void): () => void;
	off(type: IDEEventType, handler: (event: IDEEvent) => void): void;
}

/**
 * File event payloads
 */
export interface FileOpenPayload {
	path: string;
	content?: string;
	language?: string;
}

export interface FileClosePayload {
	path: string;
	saved: boolean;
}

export interface FileSavePayload {
	path: string;
	content: string;
}

export interface FileCreatePayload {
	path: string;
	isDirectory: boolean;
	content?: string;
}

export interface FileDeletePayload {
	path: string;
	isDirectory: boolean;
}

export interface FileRenamePayload {
	oldPath: string;
	newPath: string;
}

/**
 * Editor event payloads
 */
export interface EditorChangePayload {
	path: string;
	content: string;
	changes: {
		from: number;
		to: number;
		insert: string;
	}[];
}

export interface EditorCursorPayload {
	path: string;
	line: number;
	column: number;
}

export interface EditorSelectionPayload {
	path: string;
	selections: {
		anchor: { line: number; column: number };
		head: { line: number; column: number };
	}[];
}

/**
 * Command event payloads
 */
export interface CommandExecutePayload {
	commandId: string;
	args?: Record<string, unknown>;
	source?: 'keybinding' | 'menu' | 'palette' | 'api';
}

/**
 * AI event payloads
 */
export interface AIMessagePayload {
	conversationId: string;
	messageId: string;
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
}

export interface AIEditPayload {
	conversationId: string;
	path: string;
	type: 'start' | 'progress' | 'complete' | 'cancel';
	content?: string;
}

/**
 * Collaboration event payloads
 */
export interface CollabUserPayload {
	userId: string;
	userName: string;
	isAI?: boolean;
}

export interface CollabCursorPayload {
	userId: string;
	path: string;
	line: number;
	column: number;
}
