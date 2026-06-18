/**
 * CRDT binding for the custom editor
 *
 * This module provides integration between the custom editor state
 * and Yjs CRDT for real-time collaborative editing.
 */

import * as Y from 'yjs';
import type { EditorState, Position, ChangeEvent } from './state';

/**
 * CRDT binding configuration
 */
export interface CRDTBindingConfig {
	/** Yjs document */
	doc: Y.Doc;
	/** Text type name in the document */
	textName?: string;
	/** Editor state to bind */
	editorState: EditorState;
}

/**
 * Position in both local and CRDT coordinates
 */
export interface CRDTPosition {
	/** Local position (line/column) */
	local: Position;
	/** CRDT index position */
	index: number;
}

/**
 * CRDT binding class that syncs editor state with Yjs
 */
export class CRDTBinding {
	private doc: Y.Doc;
	private text: Y.Text;
	private editorState: EditorState;
	private isUpdating = false;
	private isDestroyed = false;
	private cleanupFns: Array<() => void> = [];

	// Store observer reference for guaranteed cleanup
	private textObserver: ((event: Y.YTextEvent) => void) | null = null;

	constructor(config: CRDTBindingConfig) {
		this.doc = config.doc;
		this.text = config.doc.getText(config.textName ?? 'content');
		this.editorState = config.editorState;

		this.setupBindings();
	}

	/**
	 * Set up bidirectional bindings
	 */
	private setupBindings(): void {
		// Sync initial content
		this.syncFromCRDT();

		// Listen for CRDT changes - use bound method for reliable cleanup
		this.textObserver = (event: Y.YTextEvent) => {
			if (this.isDestroyed || this.isUpdating) return;
			this.handleCRDTChange(event);
		};
		this.text.observe(this.textObserver);
		this.cleanupFns.push(() => {
			if (this.textObserver) {
				this.text.unobserve(this.textObserver);
				this.textObserver = null;
			}
		});

		// Listen for local editor changes
		const unsubscribe = this.editorState.onContentChange((event) => {
			if (this.isDestroyed || this.isUpdating) return;
			this.handleLocalChange(event);
		});
		this.cleanupFns.push(unsubscribe);
	}

	/**
	 * Sync content from CRDT to editor
	 */
	private syncFromCRDT(): void {
		this.isUpdating = true;
		try {
			const content = this.text.toString();
			this.editorState.setContent(content);
		} finally {
			this.isUpdating = false;
		}
	}

	/**
	 * Handle changes from CRDT
	 * Uses Yjs relative positions for accurate cursor preservation during concurrent edits
	 */
	private handleCRDTChange(event: Y.YTextEvent): void {
		this.isUpdating = true;
		try {
			// Capture current selection as relative positions BEFORE applying changes
			// Relative positions survive structural changes to the document
			const currentSelection = this.editorState.selection;
			const anchorIndex = this.positionToIndex(currentSelection.anchor);
			const headIndex = this.positionToIndex(currentSelection.head);

			// Create Yjs relative positions (these track position relative to surrounding content)
			const anchorRelPos = Y.createRelativePositionFromTypeIndex(this.text, anchorIndex);
			const headRelPos = Y.createRelativePositionFromTypeIndex(this.text, headIndex);

			// Resolve relative positions back to absolute positions
			// This correctly handles insertions/deletions around the cursor
			const anchorAbsPos = Y.createAbsolutePositionFromRelativePosition(anchorRelPos, this.doc);
			const headAbsPos = Y.createAbsolutePositionFromRelativePosition(headRelPos, this.doc);

			// Convert back to editor positions with bounds checking
			const maxIndex = this.text.length;
			const newAnchorIndex = anchorAbsPos ? Math.min(anchorAbsPos.index, maxIndex) : 0;
			const newHeadIndex = headAbsPos ? Math.min(headAbsPos.index, maxIndex) : 0;

			// Apply content and selection atomically without triggering intermediate events
			// This prevents race conditions where selection listeners modify state during update
			this.editorState.runWithoutNotifications(() => {
				this.applyCRDTDelta(event.delta);
				const newAnchor = this.indexToPosition(newAnchorIndex);
				const newHead = this.indexToPosition(newHeadIndex);
				this.editorState.setSelection(newAnchor, newHead);
			});
		} finally {
			this.isUpdating = false;
		}
	}

	/**
	 * Apply a Y.Text delta to the editor using bounded index-based edit paths.
	 */
	private applyCRDTDelta(delta: Y.YTextEvent['delta']): void {
		let index = 0;

		for (const op of delta) {
			if (op.retain) {
				index += op.retain;
			}

			if (op.insert !== undefined) {
				const insertedText = String(op.insert);
				const position = this.indexToPosition(index);
				this.editorState.insertAt(position, insertedText);
				index += insertedText.length;
			}

			if (op.delete) {
				const from = this.indexToPosition(index);
				const to = this.indexToPosition(index + op.delete);
				this.editorState.deleteRange(from, to);
			}
		}
	}

	/**
	 * Convert position to index using provided lines (for atomic operations)
	 */
	private positionToIndexWithLines(position: Position, lines: readonly { text: string }[]): number {
		let index = 0;

		// Clamp line to valid range
		const lineNum = Math.min(position.line, lines.length - 1);
		if (lineNum < 0) return 0;

		for (let i = 0; i < lineNum; i++) {
			index += (lines[i]?.text.length ?? 0) + 1; // +1 for newline
		}

		// Clamp column to valid range for this line
		const lineLength = lines[lineNum]?.text.length ?? 0;
		index += Math.min(position.column, lineLength);
		return index;
	}

	/**
	 * Handle local editor changes
	 */
	private handleLocalChange(event: ChangeEvent): void {
		this.isUpdating = true;
		try {
			this.doc.transact(() => {
				switch (event.type) {
					case 'insert':
						if (event.text) {
							const index = this.positionToIndex(event.from);
							this.text.insert(index, event.text);
						}
						break;

					case 'delete':
						if (event.to) {
							const fromIndex = this.positionToIndex(event.from);
							const toIndex = this.positionToIndex(event.to);
							this.text.delete(fromIndex, toIndex - fromIndex);
						}
						break;

					case 'replace': {
						// A `replace` rewrites the whole document (setContent, undo/redo,
						// replace-all, external load). The event's from/to are computed
						// against the POST-change line array, but the Yjs text still holds
						// the OLD content here, so deriving a delete range from them would
						// target the wrong span and corrupt the shared doc.
						//
						// Make replace robust: delete the entire current Yjs range and
						// insert the full new content. This is correct regardless of the
						// from/to positions carried on the event.
						const currentLength = this.text.length;
						if (currentLength > 0) {
							this.text.delete(0, currentLength);
						}
						// Source the full content from the editor itself, not from
						// event.text: undo/redo emit a `replace` with no `text`, so
						// trusting event.text here would empty the shared doc. getContent()
						// is the authoritative post-change content for any replace emitter.
						const fullContent = this.editorState.getContent();
						if (fullContent) {
							this.text.insert(0, fullContent);
						}
						break;
					}
				}
			});
		} finally {
			this.isUpdating = false;
		}
	}

	/**
	 * Convert editor position to CRDT index
	 */
	positionToIndex(position: Position): number {
		return this.positionToIndexWithLines(position, this.editorState.lines);
	}

	/**
	 * Convert CRDT index to editor position
	 */
	indexToPosition(index: number): Position {
		const lines = this.editorState.lines;

		// Handle edge cases
		if (lines.length === 0) return { line: 0, column: 0 };
		if (index <= 0) return { line: 0, column: 0 };

		let remaining = index;
		let line = 0;

		while (line < lines.length) {
			const lineText = lines[line]?.text ?? '';
			const lineLength = lineText.length + 1; // +1 for newline

			// For the last line, don't add newline to length calculation
			const isLastLine = line === lines.length - 1;
			const effectiveLength = isLastLine ? lineText.length : lineLength;

			if (remaining <= effectiveLength) {
				return { line, column: Math.min(remaining, lineText.length) };
			}
			remaining -= lineLength;
			line++;
		}

		// At end of document - clamp to last valid position
		const lastLine = lines.length - 1;
		return {
			line: lastLine,
			column: lines[lastLine]?.text.length ?? 0
		};
	}

	/**
	 * Apply a full local content replacement into the bound editor state,
	 * which propagates to the CRDT / Yjs text via the local-change listener.
	 *
	 * Use this for edits that originate outside the bound EditorState (e.g. an
	 * inner editor component that maintains its own state) so that local typing
	 * reaches collaborators. No-op while a remote update is being applied, which
	 * also prevents a remote -> local -> remote echo loop.
	 *
	 * @returns `true` if the content changed and was propagated, `false` otherwise.
	 */
	setContent(content: string): boolean {
		// Guard against echoing a remote update back into the CRDT.
		if (this.isDestroyed || this.isUpdating) return false;
		// Skip no-op writes (content already matches the editor state).
		if (this.editorState.getContent() === content) return false;
		this.editorState.setContent(content);
		return true;
	}

	/**
	 * Whether a remote (CRDT-originated) update is currently being applied.
	 * Callers can use this to suppress re-sending an echoed local change.
	 */
	get isApplyingRemoteChange(): boolean {
		return this.isUpdating;
	}

	/**
	 * Get the Yjs text type
	 */
	getText(): Y.Text {
		return this.text;
	}

	/**
	 * Get the Yjs document
	 */
	getDoc(): Y.Doc {
		return this.doc;
	}

	/**
	 * Clean up bindings
	 */
	destroy(): void {
		// Prevent further operations
		this.isDestroyed = true;

		// Run all cleanup functions
		for (const cleanup of this.cleanupFns) {
			try {
				cleanup();
			} catch {
				// Ignore cleanup errors to ensure all cleanups run
			}
		}
		this.cleanupFns = [];
		this.textObserver = null;
	}
}

/**
 * Create a CRDT binding
 */
export function createCRDTBinding(config: CRDTBindingConfig): CRDTBinding {
	return new CRDTBinding(config);
}

/**
 * Relative position for cursor synchronization
 */
export interface RelativePosition {
	/** Yjs relative position */
	yRelPos: Y.RelativePosition;
}

/**
 * Create a relative position from an editor position
 */
export function createRelativePosition(
	text: Y.Text,
	binding: CRDTBinding,
	position: Position
): RelativePosition {
	const index = binding.positionToIndex(position);
	const yRelPos = Y.createRelativePositionFromTypeIndex(text, index);
	return { yRelPos };
}

/**
 * Resolve a relative position to an editor position
 */
export function resolveRelativePosition(
	doc: Y.Doc,
	binding: CRDTBinding,
	relPos: RelativePosition
): Position | null {
	const absPos = Y.createAbsolutePositionFromRelativePosition(relPos.yRelPos, doc);
	if (!absPos) return null;
	return binding.indexToPosition(absPos.index);
}
