import { describe, expect, it } from 'vitest';
import { CollaborativeDocument } from './document';
import { createUndoManager } from './undo';

describe('createUndoManager', () => {
	it('uses the document-owned undo manager for all public undo APIs', () => {
		const document = new CollaborativeDocument({
			documentId: 'doc-1',
			enableUndo: false
		});

		expect(document.hasUndoManager()).toBe(false);

		const undo = createUndoManager(document);
		const rawManager = document.getUndoManager();
		const sameUndo = createUndoManager(document);

		expect(document.getUndoManager()).toBe(rawManager);
		expect(document.hasUndoManager()).toBe(true);

		document.insert(0, 'hello');
		expect(undo.getState().canUndo).toBe(true);

		expect(sameUndo.undo()).toBe(true);
		expect(document.getContent()).toBe('');
		expect(undo.getState()).toMatchObject({
			canUndo: false,
			canRedo: true
		});

		expect(document.redo()).toBe(true);
		expect(document.getContent()).toBe('hello');

		undo.destroy();
		sameUndo.destroy();
		document.destroy();
	});
});
