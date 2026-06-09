/**
 * Collaborative Document using Yjs
 * Provides a wrapper around Yjs Doc for IDE integration
 */

import * as Y from 'yjs';
import type { DocumentOptions } from './types';

export interface CollaborativeUndoManagerOptions {
	captureTimeout?: number;
	trackedOrigins?: Set<unknown>;
	deleteFilter?: (item: Y.Item) => boolean;
}

export class CollaborativeDocument {
	readonly doc: Y.Doc;
	readonly id: string;
	private texts: Map<string, Y.Text> = new Map();
	private undoManager: Y.UndoManager | null = null;

	constructor(options: DocumentOptions) {
		this.id = options.documentId;
		this.doc = new Y.Doc();

		// Create initial text if provided
		if (options.initialContent !== undefined) {
			const text = this.getText('content');
			text.insert(0, options.initialContent);
		}

		// Setup undo manager if enabled
		if (options.enableUndo !== false) {
			this.getUndoManager({ captureTimeout: options.undoCaptureTimeout });
		}
	}

	/**
	 * Get or create a Y.Text for a given key
	 */
	getText(key: string = 'content'): Y.Text {
		let text = this.texts.get(key);
		if (!text) {
			text = this.doc.getText(key);
			this.texts.set(key, text);
		}
		return text;
	}

	/**
	 * Get the content as a string
	 */
	getContent(key: string = 'content'): string {
		return this.getText(key).toString();
	}

	/**
	 * Set the entire content (replaces existing)
	 */
	setContent(content: string, key: string = 'content'): void {
		const text = this.getText(key);
		this.doc.transact(() => {
			text.delete(0, text.length);
			text.insert(0, content);
		});
	}

	/**
	 * Insert text at position
	 */
	insert(index: number, content: string, key: string = 'content'): void {
		this.getText(key).insert(index, content);
	}

	/**
	 * Delete text at position
	 */
	delete(index: number, length: number, key: string = 'content'): void {
		this.getText(key).delete(index, length);
	}

	/**
	 * Apply a delta (for CodeMirror integration)
	 */
	applyDelta(
		changes: Array<{ from: number; to: number; insert: string }>,
		key: string = 'content'
	): void {
		const text = this.getText(key);

		this.doc.transact(() => {
			// Apply changes in reverse order to maintain correct positions
			const sortedChanges = [...changes].sort((a, b) => b.from - a.from);

			for (const change of sortedChanges) {
				const deleteLen = change.to - change.from;
				if (deleteLen > 0) {
					text.delete(change.from, deleteLen);
				}
				if (change.insert) {
					text.insert(change.from, change.insert);
				}
			}
		});
	}

	/**
	 * Subscribe to text changes
	 */
	onTextChange(
		callback: (event: Y.YTextEvent, transaction: Y.Transaction) => void,
		key: string = 'content'
	): () => void {
		const text = this.getText(key);
		text.observe(callback);
		return () => text.unobserve(callback);
	}

	/**
	 * Subscribe to any document updates
	 */
	onUpdate(callback: (update: Uint8Array, origin: unknown) => void): () => void {
		this.doc.on('update', callback);
		return () => this.doc.off('update', callback);
	}

	/**
	 * Setup undo manager
	 */
	getUndoManager(options: CollaborativeUndoManagerOptions = {}): Y.UndoManager {
		if (this.undoManager) return this.undoManager;

		const { captureTimeout = 500, trackedOrigins = new Set([null, 'local']), deleteFilter } = options;
		this.undoManager = new Y.UndoManager(this.getText(), {
			trackedOrigins,
			captureTimeout,
			deleteFilter
		});
		return this.undoManager;
	}

	/**
	 * Check whether this document currently owns an undo manager.
	 */
	hasUndoManager(): boolean {
		return this.undoManager !== null;
	}

	/**
	 * Track additional origins for undo
	 */
	trackOrigin(origin: string): void {
		this.getUndoManager().trackedOrigins.add(origin);
	}

	/**
	 * Undo last change
	 */
	undo(): boolean {
		if (!this.undoManager) return false;
		return this.undoManager.undo() !== null;
	}

	/**
	 * Redo last undone change
	 */
	redo(): boolean {
		if (!this.undoManager) return false;
		return this.undoManager.redo() !== null;
	}

	/**
	 * Check if can undo
	 */
	canUndo(): boolean {
		return this.undoManager?.canUndo() ?? false;
	}

	/**
	 * Check if can redo
	 */
	canRedo(): boolean {
		return this.undoManager?.canRedo() ?? false;
	}

	/**
	 * Clear undo/redo history
	 */
	clearHistory(): void {
		this.undoManager?.clear();
	}

	/**
	 * Create a snapshot of the current state
	 */
	createSnapshot(): Uint8Array {
		return Y.encodeStateAsUpdate(this.doc);
	}

	/**
	 * Apply a snapshot
	 */
	applySnapshot(snapshot: Uint8Array): void {
		Y.applyUpdate(this.doc, snapshot);
	}

	/**
	 * Get the state vector for sync
	 */
	getStateVector(): Uint8Array {
		return Y.encodeStateVector(this.doc);
	}

	/**
	 * Get diff from a state vector
	 */
	getDiff(stateVector: Uint8Array): Uint8Array {
		return Y.encodeStateAsUpdate(this.doc, stateVector);
	}

	/**
	 * Merge updates from another document
	 */
	merge(update: Uint8Array): void {
		Y.applyUpdate(this.doc, update);
	}

	/**
	 * Destroy the document
	 */
	destroy(): void {
		this.undoManager?.destroy();
		this.doc.destroy();
		this.texts.clear();
	}
}
