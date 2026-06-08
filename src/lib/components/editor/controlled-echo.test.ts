import { describe, it, expect, beforeEach } from 'vitest';
import { createEditorState, type EditorState } from './core';

/**
 * Controlled-mode echo regression tests.
 *
 * Background: in CustomEditor.svelte the `content` prop is controlled. When the
 * user types, the editor emits via onChange (and writes back through
 * `bind:content`); a typical parent feeds that value straight back into the
 * `content` prop. The external-change effect must recognise that round-trip as
 * an ECHO and skip `editorState.setContent(content)` — otherwise the document
 * model is rebuilt every keystroke, wiping undo/redo and collapsing multi-cursor.
 *
 * There is no component-test harness in this repo (no jsdom / testing-library),
 * so these tests model the exact content-prop round-trip CustomEditor performs:
 *  - track `lastEmittedContent` and `previousContentProp`
 *  - on internal change: record + write back to the prop
 *  - on prop change: apply via setContent ONLY for a genuine external change
 *
 * `applyContentProp` below is a faithful re-implementation of CustomEditor's
 * external-change guard. If that guard regresses, these tests fail.
 */

/**
 * Harness mirroring CustomEditor's controlled-content wiring.
 */
function createControlledHarness(initial: string) {
	const state: EditorState = createEditorState({ content: initial, language: 'plaintext' });

	// Mirror of CustomEditor's tracking variables.
	let previousContentProp = initial;
	let lastEmittedContent = initial;

	// The "parent's" copy of the content prop (what gets bound / passed back in).
	let contentProp = initial;

	let setContentCalls = 0;

	// Mirror of CustomEditor's onContentChange subscriber: records emission and
	// echoes the value back into the prop (as a `bind:content` parent would).
	const unsubscribe = state.onContentChange(() => {
		const newContent = state.getContent();
		lastEmittedContent = newContent;
		previousContentProp = newContent;
		// Parent round-trips the emitted value straight back into the prop.
		contentProp = newContent;
		applyContentProp();
	});

	// Mirror of CustomEditor's external-change $effect guard.
	function applyContentProp(): void {
		if (
			contentProp !== previousContentProp &&
			contentProp !== lastEmittedContent &&
			contentProp !== state.getContent()
		) {
			state.setContent(contentProp);
			previousContentProp = contentProp;
			lastEmittedContent = contentProp;
			setContentCalls++;
		}
	}

	return {
		state,
		get setContentCalls() {
			return setContentCalls;
		},
		/** Simulate a genuine external prop change (e.g. file switch). */
		setExternalContent(value: string) {
			contentProp = value;
			applyContentProp();
		},
		dispose() {
			unsubscribe();
		}
	};
}

describe('Controlled-mode echo bug', () => {
	let harness: ReturnType<typeof createControlledHarness>;

	beforeEach(() => {
		harness = createControlledHarness('hello');
	});

	it('does NOT call setContent on the onChange -> prop round-trip (echo)', () => {
		const { state } = harness;

		state.setCursor({ line: 0, column: 5 });
		state.insert(' world'); // user types -> emits -> parent echoes prop back

		// The echo must be ignored: no setContent rebuild.
		expect(harness.setContentCalls).toBe(0);
		expect(state.getContent()).toBe('hello world');
	});

	it('preserves undo history across the echo round-trip', () => {
		const { state } = harness;

		state.setCursor({ line: 0, column: 5 });
		state.insert(' world');

		// Undo must still be available — the echo did not wipe history.
		expect(state.canUndo).toBe(true);
		expect(harness.setContentCalls).toBe(0);

		const undone = state.undo();
		expect(undone).toBe(true);
		expect(state.getContent()).toBe('hello');
	});

	it('does not collapse multi-cursor across the echo round-trip', () => {
		const { state: _state } = harness;

		harness.dispose();
		harness = createControlledHarness('a\nb\nc');

		const s = harness.state;
		s.setCursor({ line: 0, column: 1 });
		s.addCursor({ line: 1, column: 1 });
		s.addCursor({ line: 2, column: 1 });
		expect(s.allCursors.length).toBe(3);

		// Type at all cursors; this emits and echoes the prop back.
		s.insert('X');

		// Multi-cursor survives — setContent (which resets to a single cursor) was skipped.
		expect(harness.setContentCalls).toBe(0);
		expect(s.allCursors.length).toBe(3);
		expect(s.getContent()).toBe('aX\nbX\ncX');
	});

	it('still applies a GENUINE external content change via setContent', () => {
		const { state } = harness;

		// A real external change (file switch) must rebuild the document.
		harness.setExternalContent('completely different');

		expect(harness.setContentCalls).toBe(1);
		expect(state.getContent()).toBe('completely different');
	});

	it('treats setting the prop to the editor\'s current content as a no-op', () => {
		const { state } = harness;

		// Parent re-passes the unchanged value: must not rebuild.
		harness.setExternalContent('hello');

		expect(harness.setContentCalls).toBe(0);
		expect(state.getContent()).toBe('hello');
	});

	it('handles edit -> external change -> edit without stale echo state', () => {
		const { state } = harness;

		state.setCursor({ line: 0, column: 5 });
		state.insert('!'); // -> 'hello!'
		expect(harness.setContentCalls).toBe(0);

		harness.setExternalContent('fresh file'); // genuine external change
		expect(harness.setContentCalls).toBe(1);
		expect(state.getContent()).toBe('fresh file');

		// Editing again after an external change must still echo-guard correctly.
		state.setCursor({ line: 0, column: 10 });
		state.insert('!'); // -> 'fresh file!'
		expect(harness.setContentCalls).toBe(1); // unchanged: the edit echo was ignored
		expect(state.getContent()).toBe('fresh file!');
	});
});
