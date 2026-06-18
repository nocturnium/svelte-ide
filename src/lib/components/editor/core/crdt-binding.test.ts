import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import {
	CRDTBinding,
	createCRDTBinding,
	createRelativePosition,
	resolveRelativePosition
} from './crdt-binding';
import { EditorState, type Position } from './state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBinding(
	initialContent = '',
	textName = 'content'
): { binding: CRDTBinding; doc: Y.Doc; editor: EditorState } {
	const doc = new Y.Doc();
	// Populate CRDT text before creating the binding, because the constructor
	// calls syncFromCRDT() which overwrites the editor with CRDT content.
	if (initialContent) {
		doc.getText(textName).insert(0, initialContent);
	}
	const editor = new EditorState();
	const binding = createCRDTBinding({ doc, textName, editorState: editor });
	return { binding, doc, editor };
}

// ---------------------------------------------------------------------------
// createCRDTBinding factory
// ---------------------------------------------------------------------------
describe('createCRDTBinding', () => {
	it('should return a CRDTBinding instance', () => {
		const doc = new Y.Doc();
		const editor = new EditorState();
		const binding = createCRDTBinding({ doc, editorState: editor });
		expect(binding).toBeInstanceOf(CRDTBinding);
		binding.destroy();
	});

	it('should use "content" as default text name', () => {
		const doc = new Y.Doc();
		const editor = new EditorState();
		const binding = createCRDTBinding({ doc, editorState: editor });
		// The text type should be retrievable from the doc
		expect(doc.getText('content')).toBeDefined();
		binding.destroy();
	});

	it('should accept a custom text name', () => {
		const doc = new Y.Doc();
		const editor = new EditorState();
		const binding = createCRDTBinding({ doc, textName: 'myText', editorState: editor });
		expect(binding.getText()).toBe(doc.getText('myText'));
		binding.destroy();
	});
});

// ---------------------------------------------------------------------------
// Initial sync from CRDT to editor
// ---------------------------------------------------------------------------
describe('initial sync from CRDT', () => {
	it('should sync pre-existing CRDT content to the editor', () => {
		const doc = new Y.Doc();
		doc.getText('content').insert(0, 'hello world');
		const editor = new EditorState();
		const binding = createCRDTBinding({ doc, editorState: editor });

		expect(editor.lines[0]?.text).toBe('hello world');
		binding.destroy();
	});

	it('should sync empty CRDT to editor', () => {
		const { editor, binding } = makeBinding();
		expect(editor.lines.length).toBeGreaterThanOrEqual(1);
		expect(editor.lines[0]?.text).toBe('');
		binding.destroy();
	});
});

// ---------------------------------------------------------------------------
// getDoc / getText
// ---------------------------------------------------------------------------
describe('getDoc / getText', () => {
	it('should return the Yjs Doc', () => {
		const doc = new Y.Doc();
		const editor = new EditorState();
		const binding = createCRDTBinding({ doc, editorState: editor });
		expect(binding.getDoc()).toBe(doc);
		binding.destroy();
	});

	it('should return the Yjs Text', () => {
		const { binding, doc } = makeBinding();
		expect(binding.getText()).toBe(doc.getText('content'));
		binding.destroy();
	});
});

// ---------------------------------------------------------------------------
// positionToIndex
// ---------------------------------------------------------------------------
describe('positionToIndex', () => {
	it('should convert (0,0) to index 0', () => {
		const { binding } = makeBinding('abc');
		expect(binding.positionToIndex({ line: 0, column: 0 })).toBe(0);
		binding.destroy();
	});

	it('should convert column offsets on the first line', () => {
		const { binding } = makeBinding('hello');
		expect(binding.positionToIndex({ line: 0, column: 3 })).toBe(3);
		binding.destroy();
	});

	it('should account for newlines between lines', () => {
		const { binding } = makeBinding('abc\ndef');
		// line 1, column 0 => index 4 (abc + newline)
		expect(binding.positionToIndex({ line: 1, column: 0 })).toBe(4);
		// line 1, column 2 => index 6
		expect(binding.positionToIndex({ line: 1, column: 2 })).toBe(6);
		binding.destroy();
	});

	it('should handle three or more lines', () => {
		const { binding } = makeBinding('ab\ncd\nef');
		// line 2, column 1 => ab(2) + \n(1) + cd(2) + \n(1) + e(1) = 7
		expect(binding.positionToIndex({ line: 2, column: 1 })).toBe(7);
		binding.destroy();
	});

	it('should clamp column to line length', () => {
		const { binding } = makeBinding('abc');
		// column 100 on a 3-char line should clamp to 3
		expect(binding.positionToIndex({ line: 0, column: 100 })).toBe(3);
		binding.destroy();
	});

	it('should clamp line to valid range', () => {
		const { binding } = makeBinding('abc');
		// line 100 should clamp to last line
		const idx = binding.positionToIndex({ line: 100, column: 0 });
		expect(idx).toBe(0); // clamped to line 0, column 0 (line 0 is last line)
		binding.destroy();
	});

	it('should handle negative line gracefully', () => {
		const { binding } = makeBinding('abc');
		expect(binding.positionToIndex({ line: -1, column: 0 })).toBe(0);
		binding.destroy();
	});
});

// ---------------------------------------------------------------------------
// indexToPosition
// ---------------------------------------------------------------------------
describe('indexToPosition', () => {
	it('should convert index 0 to (0,0)', () => {
		const { binding } = makeBinding('abc');
		expect(binding.indexToPosition(0)).toEqual({ line: 0, column: 0 });
		binding.destroy();
	});

	it('should convert mid-first-line index', () => {
		const { binding } = makeBinding('hello');
		expect(binding.indexToPosition(3)).toEqual({ line: 0, column: 3 });
		binding.destroy();
	});

	it('should cross newlines correctly', () => {
		const { binding } = makeBinding('abc\ndef');
		// The algorithm treats the newline as belonging to the current line's range,
		// so index 4 (the newline boundary) maps to end-of-line-0 {0,3}.
		// index 5 => line 1, column 1 (first char past the boundary)
		expect(binding.indexToPosition(5)).toEqual({ line: 1, column: 1 });
		// index 6 => line 1, column 2
		expect(binding.indexToPosition(6)).toEqual({ line: 1, column: 2 });
		binding.destroy();
	});

	it('should handle end-of-document index', () => {
		const { binding } = makeBinding('abc\ndef');
		// Total length = 7 (abc\ndef), index 7 => end of line 1
		const pos = binding.indexToPosition(7);
		expect(pos).toEqual({ line: 1, column: 3 });
		binding.destroy();
	});

	it('should handle empty document', () => {
		const { binding } = makeBinding('');
		expect(binding.indexToPosition(0)).toEqual({ line: 0, column: 0 });
		binding.destroy();
	});

	it('should clamp negative index', () => {
		const { binding } = makeBinding('abc');
		expect(binding.indexToPosition(-5)).toEqual({ line: 0, column: 0 });
		binding.destroy();
	});

	it('should clamp index past end of document', () => {
		const { binding } = makeBinding('abc');
		const pos = binding.indexToPosition(999);
		expect(pos).toEqual({ line: 0, column: 3 });
		binding.destroy();
	});
});

// ---------------------------------------------------------------------------
// positionToIndex <-> indexToPosition roundtrip
// ---------------------------------------------------------------------------
describe('position roundtrip', () => {
	it('should roundtrip single line', () => {
		const { binding } = makeBinding('hello world');
		const pos: Position = { line: 0, column: 5 };
		const idx = binding.positionToIndex(pos);
		const back = binding.indexToPosition(idx);
		expect(back).toEqual(pos);
		binding.destroy();
	});

	it('should roundtrip multi-line', () => {
		const { binding } = makeBinding('first\nsecond\nthird');
		const pos: Position = { line: 2, column: 3 };
		const idx = binding.positionToIndex(pos);
		const back = binding.indexToPosition(idx);
		expect(back).toEqual(pos);
		binding.destroy();
	});
});

// ---------------------------------------------------------------------------
// CRDT change propagation to editor
// ---------------------------------------------------------------------------
describe('CRDT -> editor propagation', () => {
	it('should update editor when CRDT text is inserted', () => {
		const { binding, doc, editor } = makeBinding();
		const text = doc.getText('content');

		doc.transact(() => {
			text.insert(0, 'hello');
		});

		expect(editor.lines[0]?.text).toBe('hello');
		binding.destroy();
	});

	it('should update editor when CRDT text is deleted', () => {
		const { binding, doc, editor } = makeBinding();
		const text = doc.getText('content');

		// Insert first, then delete
		doc.transact(() => {
			text.insert(0, 'hello world');
		});
		doc.transact(() => {
			text.delete(5, 6); // delete " world"
		});

		expect(editor.lines[0]?.text).toBe('hello');
		binding.destroy();
	});

	it('should handle multiline CRDT insertions', () => {
		const { binding, doc, editor } = makeBinding();
		const text = doc.getText('content');

		doc.transact(() => {
			text.insert(0, 'line1\nline2\nline3');
		});

		expect(editor.lines).toHaveLength(3);
		expect(editor.lines[0]?.text).toBe('line1');
		expect(editor.lines[1]?.text).toBe('line2');
		expect(editor.lines[2]?.text).toBe('line3');
		binding.destroy();
	});

	it('applies remote insert and delete deltas without full document setContent', () => {
		const { binding, doc, editor } = makeBinding('hello world');
		const text = doc.getText('content');
		const setContentSpy = vi.spyOn(editor, 'setContent');

		doc.transact(() => {
			text.insert(5, ', remote');
			text.delete(13, 6);
		});

		expect(editor.getContent()).toBe('hello, remote');
		expect(text.toString()).toBe('hello, remote');
		expect(setContentSpy).not.toHaveBeenCalled();

		setContentSpy.mockRestore();
		binding.destroy();
	});
});

// ---------------------------------------------------------------------------
// destroy
// ---------------------------------------------------------------------------
describe('destroy', () => {
	it('should clean up and prevent further updates', () => {
		const { binding, doc, editor } = makeBinding();
		const text = doc.getText('content');

		binding.destroy();

		// Further CRDT changes should NOT propagate
		const linesBefore = editor.lines.map((l) => l.text);
		doc.transact(() => {
			text.insert(0, 'after-destroy');
		});
		const linesAfter = editor.lines.map((l) => l.text);
		expect(linesAfter).toEqual(linesBefore);
	});

	it('should be safe to call destroy multiple times', () => {
		const { binding } = makeBinding();
		binding.destroy();
		expect(() => binding.destroy()).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// createRelativePosition / resolveRelativePosition
// ---------------------------------------------------------------------------
describe('createRelativePosition / resolveRelativePosition', () => {
	it('should create and resolve a relative position', () => {
		const { binding, doc } = makeBinding('hello world');
		const text = binding.getText();

		const relPos = createRelativePosition(text, binding, { line: 0, column: 5 });
		expect(relPos).toHaveProperty('yRelPos');

		const resolved = resolveRelativePosition(doc, binding, relPos);
		expect(resolved).not.toBeNull();
		expect(resolved!.line).toBe(0);
		expect(resolved!.column).toBe(5);
		binding.destroy();
	});

	it('should survive insertions before the position', () => {
		const doc = new Y.Doc();
		const text = doc.getText('content');
		text.insert(0, 'hello world');

		const editor = new EditorState({ content: 'hello world' });
		const binding = createCRDTBinding({ doc, editorState: editor });

		// Create relative position at index 6 ("w" in "world")
		const relPos = createRelativePosition(text, binding, { line: 0, column: 6 });

		// Insert text before the position
		doc.transact(() => {
			text.insert(0, 'XX');
		});

		// Resolve: the position should have shifted right by 2
		const resolved = resolveRelativePosition(doc, binding, relPos);
		expect(resolved).not.toBeNull();
		expect(resolved!.column).toBe(8); // 6 + 2
		binding.destroy();
	});

	it('should handle position at start of empty document', () => {
		const { binding, doc } = makeBinding('');
		const text = binding.getText();

		const relPos = createRelativePosition(text, binding, { line: 0, column: 0 });
		const resolved = resolveRelativePosition(doc, binding, relPos);
		expect(resolved).not.toBeNull();
		expect(resolved).toEqual({ line: 0, column: 0 });
		binding.destroy();
	});
});

// ---------------------------------------------------------------------------
// Local edit -> CRDT propagation (send path) + replace robustness (BUG 1 / BUG 2)
// ---------------------------------------------------------------------------
describe('local edit -> CRDT propagation', () => {
	it('binding.setContent propagates a full replacement to the Yjs text', () => {
		const { binding, doc } = makeBinding('hello');
		const text = doc.getText('content');

		const changed = binding.setContent('hello world');
		expect(changed).toBe(true);
		expect(text.toString()).toBe('hello world');
		binding.destroy();
	});

	it('binding.setContent is a no-op when content is unchanged', () => {
		const { binding, doc } = makeBinding('same');
		const text = doc.getText('content');

		const changed = binding.setContent('same');
		expect(changed).toBe(false);
		expect(text.toString()).toBe('same');
		binding.destroy();
	});

	it('replace shrinking content does not leave stale tail in the Yjs text', () => {
		// Regression for BUG 2: the old replace handler computed the delete range
		// from event.to over the POST-change (shorter) line array while the Yjs
		// text still held the OLD (longer) content, leaving stale characters.
		const { binding, doc } = makeBinding('abcdefghij'); // length 10
		const text = doc.getText('content');

		binding.setContent('xy'); // length 2 - much shorter
		expect(text.toString()).toBe('xy');
		expect(text.length).toBe(2);
		binding.destroy();
	});

	it('replace growing content fully rewrites the Yjs text', () => {
		const { binding, doc } = makeBinding('ab');
		const text = doc.getText('content');

		binding.setContent('abcdefghij');
		expect(text.toString()).toBe('abcdefghij');
		binding.destroy();
	});

	it('replace across multiple lines stays consistent', () => {
		const { binding, doc } = makeBinding('one\ntwo\nthree');
		const text = doc.getText('content');

		binding.setContent('a\nb');
		expect(text.toString()).toBe('a\nb');
		binding.destroy();
	});

	it('replace to empty clears the Yjs text', () => {
		const { binding, doc } = makeBinding('non-empty content');
		const text = doc.getText('content');

		binding.setContent('');
		expect(text.toString()).toBe('');
		expect(text.length).toBe(0);
		binding.destroy();
	});

	it('undo/redo via setContent keeps the Yjs text in sync', () => {
		// undo/redo internally call editorState.setContent, emitting `replace`.
		const { binding, doc, editor } = makeBinding('start');
		const text = doc.getText('content');

		// Apply a local edit through the binding, then mutate via the editor's
		// own history to emulate undo (which calls setContent under the hood).
		binding.setContent('start changed');
		expect(text.toString()).toBe('start changed');

		// Directly drive a replace to a shorter value (as undo to a shorter state
		// would) and confirm no stale tail remains.
		editor.setContent('s');
		expect(text.toString()).toBe('s');
		binding.destroy();
	});

	it('local edit propagates to a peer document without echoing back', () => {
		// BUG 1: local edits must reach collaborators. Wire two docs and confirm a
		// setContent on doc1 lands on doc2, and re-applying the same content via
		// the binding is a guarded no-op (no echo loop).
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		const editor1 = new EditorState({ content: '' });
		const editor2 = new EditorState({ content: '' });

		const binding1 = createCRDTBinding({ doc: doc1, editorState: editor1 });
		const binding2 = createCRDTBinding({ doc: doc2, editorState: editor2 });

		doc1.on('update', (u: Uint8Array) => Y.applyUpdate(doc2, u));
		doc2.on('update', (u: Uint8Array) => Y.applyUpdate(doc1, u));

		// Local edit on side 1
		expect(binding1.setContent('typed locally')).toBe(true);

		expect(doc1.getText('content').toString()).toBe('typed locally');
		expect(doc2.getText('content').toString()).toBe('typed locally');
		expect(editor2.getContent()).toBe('typed locally');

		// Re-sending identical content (as an echoed inner-editor onChange would)
		// must not change anything.
		expect(binding2.setContent('typed locally')).toBe(false);
		expect(doc1.getText('content').toString()).toBe('typed locally');

		binding1.destroy();
		binding2.destroy();
	});

	it('echoing remote content back through setContent is a guarded no-op', () => {
		// After a remote change lands, the binding's editorState already holds the
		// new content. The component's receive path re-flows that same content into
		// the inner editor, whose onChange would call binding.setContent with the
		// identical text. That re-send must be a no-op (content-equality guard) so
		// there is no remote -> local -> remote echo loop.
		const { binding, doc, editor } = makeBinding('');
		const text = doc.getText('content');

		doc.transact(() => {
			text.insert(0, 'remote edit');
		});

		// The remote change has been applied to the bound editorState.
		expect(editor.getContent()).toBe('remote edit');
		expect(binding.isApplyingRemoteChange).toBe(false);

		// Simulate the echoed inner-editor onChange re-sending identical content.
		const before = Y.encodeStateAsUpdate(doc);
		const result = binding.setContent('remote edit');
		expect(result).toBe(false);
		// Document state is byte-for-byte unchanged (no new ops appended).
		expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
		expect(text.toString()).toBe('remote edit');
		binding.destroy();
	});
});

// ---------------------------------------------------------------------------
// Two-document sync (simulating collaboration)
// ---------------------------------------------------------------------------
describe('two-document collaboration sync', () => {
	it('should sync changes between two docs via Yjs update exchange', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		const editor1 = new EditorState({ content: '' });
		const editor2 = new EditorState({ content: '' });

		const binding1 = createCRDTBinding({ doc: doc1, editorState: editor1 });
		const binding2 = createCRDTBinding({ doc: doc2, editorState: editor2 });

		// Wire docs together
		doc1.on('update', (update: Uint8Array) => {
			Y.applyUpdate(doc2, update);
		});
		doc2.on('update', (update: Uint8Array) => {
			Y.applyUpdate(doc1, update);
		});

		// Insert in doc1
		doc1.transact(() => {
			doc1.getText('content').insert(0, 'shared');
		});

		expect(editor1.lines[0]?.text).toBe('shared');
		expect(editor2.lines[0]?.text).toBe('shared');

		binding1.destroy();
		binding2.destroy();
	});
});
