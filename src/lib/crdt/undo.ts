/**
 * Undo manager for CRDT documents
 */

import * as Y from 'yjs';
import type { CollaborativeDocument } from './document';

export interface UndoManagerOptions {
	captureTimeout?: number;
	trackedOrigins?: Set<unknown>;
	deleteFilter?: (item: Y.Item) => boolean;
}

export interface UndoManagerState {
	canUndo: boolean;
	canRedo: boolean;
	undoStackSize: number;
	redoStackSize: number;
}

export interface UndoManagerInstance {
	undo(): boolean;
	redo(): boolean;
	clear(): void;
	stopCapturing(): void;
	getState(): UndoManagerState;
	onStateChange(callback: (state: UndoManagerState) => void): () => void;
	destroy(): void;
}

/**
 * Create an undo manager for a collaborative document
 */
export function createUndoManager(
	document: CollaborativeDocument,
	options: UndoManagerOptions = {}
): UndoManagerInstance {
	const {
		captureTimeout = 500,
		trackedOrigins = new Set([null, 'local']),
		deleteFilter
	} = options;

	const text = document.getText();
	const manager = new Y.UndoManager(text, {
		captureTimeout,
		trackedOrigins,
		deleteFilter
	});

	const stateCallbacks = new Set<(state: UndoManagerState) => void>();

	function getState(): UndoManagerState {
		return {
			canUndo: manager.canUndo(),
			canRedo: manager.canRedo(),
			undoStackSize: manager.undoStack.length,
			redoStackSize: manager.redoStack.length
		};
	}

	function notifyStateChange(): void {
		const state = getState();
		stateCallbacks.forEach((cb) => cb(state));
	}

	// Listen for stack changes
	manager.on('stack-item-added', notifyStateChange);
	manager.on('stack-item-popped', notifyStateChange);
	manager.on('stack-cleared', notifyStateChange);

	return {
		undo(): boolean {
			const result = manager.undo();
			return result !== null;
		},

		redo(): boolean {
			const result = manager.redo();
			return result !== null;
		},

		clear(): void {
			manager.clear();
		},

		stopCapturing(): void {
			manager.stopCapturing();
		},

		getState,

		onStateChange(callback: (state: UndoManagerState) => void): () => void {
			stateCallbacks.add(callback);
			// Immediately call with current state
			callback(getState());
			return () => stateCallbacks.delete(callback);
		},

		destroy(): void {
			manager.destroy();
			stateCallbacks.clear();
		}
	};
}

/**
 * Create an undo manager that tracks multiple users
 * Useful for collaborative editing where you want to undo only your own changes
 */
export function createUserUndoManager(
	document: CollaborativeDocument,
	userId: string,
	options: Omit<UndoManagerOptions, 'trackedOrigins'> = {}
): UndoManagerInstance {
	return createUndoManager(document, {
		...options,
		trackedOrigins: new Set([userId])
	});
}
