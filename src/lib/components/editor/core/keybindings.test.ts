import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	KeyboardHandler,
	createKeyboardHandler,
	createDefaultKeybindings,
	type Keybinding
} from './keybindings';
import { createEditorState, type EditorState } from './state';
import { createNavigation, type Navigation } from './navigation';

// ============================================================
// Helpers
// ============================================================

/** Create a minimal KeyboardEvent-like object for testing */
function makeKeyEvent(
	key: string,
	mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}
): KeyboardEvent {
	return {
		key,
		ctrlKey: mods.ctrl ?? false,
		shiftKey: mods.shift ?? false,
		altKey: mods.alt ?? false,
		metaKey: mods.meta ?? false,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn()
	} as unknown as KeyboardEvent;
}

function makeState(content = ''): EditorState {
	return createEditorState({ content, language: 'plaintext' });
}

// ============================================================
// KeyboardHandler — basic operations
// ============================================================

describe('KeyboardHandler — basic operations', () => {
	let handler: KeyboardHandler;

	beforeEach(() => {
		handler = createKeyboardHandler();
	});

	it('should start with an empty keybinding list', () => {
		expect(handler.getKeybindings()).toEqual([]);
	});

	it('should add a keybinding via addKeybinding', () => {
		const binding: Keybinding = {
			key: 'a',
			handler: vi.fn(),
			description: 'test'
		};
		handler.addKeybinding(binding);
		expect(handler.getKeybindings()).toHaveLength(1);
		expect(handler.getKeybindings()[0].key).toBe('a');
	});

	it('should set keybindings replacing all existing ones', () => {
		handler.addKeybinding({ key: 'x', handler: vi.fn() });
		handler.setKeybindings([
			{ key: 'a', handler: vi.fn() },
			{ key: 'b', handler: vi.fn() }
		]);
		expect(handler.getKeybindings()).toHaveLength(2);
		expect(handler.getKeybindings().map((kb) => kb.key)).toEqual(['a', 'b']);
	});

	it('should remove a keybinding by key and modifiers', () => {
		handler.setKeybindings([
			{ key: 'a', handler: vi.fn() },
			{ key: 'a', modifiers: { ctrl: true }, handler: vi.fn() },
			{ key: 'b', handler: vi.fn() }
		]);
		handler.removeKeybinding('a');
		const remaining = handler.getKeybindings();
		// Only the plain 'a' (no modifiers) should have been removed
		expect(remaining).toHaveLength(2);
		expect(remaining.some((kb) => kb.key === 'a' && kb.modifiers?.ctrl)).toBe(true);
		expect(remaining.some((kb) => kb.key === 'b')).toBe(true);
	});

	it('should remove a keybinding with specific modifiers', () => {
		handler.setKeybindings([
			{ key: 'a', handler: vi.fn() },
			{ key: 'a', modifiers: { ctrl: true }, handler: vi.fn() }
		]);
		handler.removeKeybinding('a', { ctrl: true });
		const remaining = handler.getKeybindings();
		expect(remaining).toHaveLength(1);
		expect(remaining[0].modifiers?.ctrl).toBeFalsy();
	});

	it('getKeybindings returns a copy, not the internal array', () => {
		handler.addKeybinding({ key: 'x', handler: vi.fn() });
		const list = handler.getKeybindings();
		list.push({ key: 'y', handler: vi.fn() });
		expect(handler.getKeybindings()).toHaveLength(1);
	});
});

// ============================================================
// KeyboardHandler — event handling
// ============================================================

describe('KeyboardHandler — handleKeyDown', () => {
	let handler: KeyboardHandler;

	beforeEach(() => {
		handler = createKeyboardHandler();
	});

	it('should invoke handler for a matching plain key', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 'Enter', handler: fn });

		const event = makeKeyEvent('Enter');
		const handled = handler.handleKeyDown(event);

		expect(handled).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
		expect(event.preventDefault).toHaveBeenCalled();
		expect(event.stopPropagation).toHaveBeenCalled();
	});

	it('should not invoke handler when key does not match', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 'Enter', handler: fn });

		const event = makeKeyEvent('Escape');
		const handled = handler.handleKeyDown(event);

		expect(handled).toBe(false);
		expect(fn).not.toHaveBeenCalled();
	});

	it('should match Ctrl modifier', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 's', modifiers: { ctrl: true }, handler: fn });

		// Without Ctrl — should not match
		expect(handler.handleKeyDown(makeKeyEvent('s'))).toBe(false);
		expect(fn).not.toHaveBeenCalled();

		// With Ctrl — should match
		expect(handler.handleKeyDown(makeKeyEvent('s', { ctrl: true }))).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('should match Shift modifier', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 'Tab', modifiers: { shift: true }, handler: fn });

		expect(handler.handleKeyDown(makeKeyEvent('Tab'))).toBe(false);
		expect(handler.handleKeyDown(makeKeyEvent('Tab', { shift: true }))).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('should match Alt modifier', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 'ArrowUp', modifiers: { alt: true }, handler: fn });

		expect(handler.handleKeyDown(makeKeyEvent('ArrowUp'))).toBe(false);
		expect(handler.handleKeyDown(makeKeyEvent('ArrowUp', { alt: true }))).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('should match Ctrl+Shift combined modifiers', () => {
		const fn = vi.fn();
		handler.addKeybinding({
			key: 'z',
			modifiers: { ctrl: true, shift: true },
			handler: fn
		});

		// Only Ctrl — should not match
		expect(handler.handleKeyDown(makeKeyEvent('z', { ctrl: true }))).toBe(false);
		// Only Shift — should not match
		expect(handler.handleKeyDown(makeKeyEvent('z', { shift: true }))).toBe(false);
		// Both — should match
		expect(handler.handleKeyDown(makeKeyEvent('z', { ctrl: true, shift: true }))).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('should treat Meta as Ctrl for bindings requiring ctrl', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 's', modifiers: { ctrl: true }, handler: fn });

		// Meta should also match ctrl bindings (Mac Cmd key)
		expect(handler.handleKeyDown(makeKeyEvent('s', { meta: true }))).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('should not fire when handler is disabled', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 'Enter', handler: fn });
		handler.setEnabled(false);

		const event = makeKeyEvent('Enter');
		expect(handler.handleKeyDown(event)).toBe(false);
		expect(fn).not.toHaveBeenCalled();
	});

	it('should re-enable after setEnabled(true)', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 'Enter', handler: fn });
		handler.setEnabled(false);
		handler.setEnabled(true);

		expect(handler.handleKeyDown(makeKeyEvent('Enter'))).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('should skip non-readonly bindings when readonly=true', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 'Backspace', handler: fn, readonly: false });

		const event = makeKeyEvent('Backspace');
		const handled = handler.handleKeyDown(event, true);

		expect(handled).toBe(false);
		expect(fn).not.toHaveBeenCalled();
	});

	it('should allow readonly bindings when readonly=true', () => {
		const fn = vi.fn();
		handler.addKeybinding({ key: 'ArrowLeft', handler: fn, readonly: true });

		const event = makeKeyEvent('ArrowLeft');
		const handled = handler.handleKeyDown(event, true);

		expect(handled).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('should use first matching keybinding when multiple match', () => {
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		handler.setKeybindings([
			{ key: 'a', handler: fn1 },
			{ key: 'a', handler: fn2 }
		]);

		handler.handleKeyDown(makeKeyEvent('a'));
		expect(fn1).toHaveBeenCalledOnce();
		expect(fn2).not.toHaveBeenCalled();
	});
});

// ============================================================
// createDefaultKeybindings — factory
// ============================================================

describe('createDefaultKeybindings', () => {
	let state: EditorState;
	let nav: Navigation;

	beforeEach(() => {
		state = makeState('hello\nworld');
		nav = createNavigation(state);
	});

	it('should return an array of keybindings', () => {
		const bindings = createDefaultKeybindings(state, nav);
		expect(Array.isArray(bindings)).toBe(true);
		expect(bindings.length).toBeGreaterThan(0);
	});

	it('should include navigation keybindings (ArrowLeft, ArrowRight, etc.)', () => {
		const bindings = createDefaultKeybindings(state, nav);
		const keys = bindings.map((b) => b.key);
		expect(keys).toContain('ArrowLeft');
		expect(keys).toContain('ArrowRight');
		expect(keys).toContain('ArrowUp');
		expect(keys).toContain('ArrowDown');
	});

	it('should include Home/End keybindings', () => {
		const bindings = createDefaultKeybindings(state, nav);
		const keys = bindings.map((b) => b.key);
		expect(keys).toContain('Home');
		expect(keys).toContain('End');
	});

	it('should include PageUp/PageDown keybindings', () => {
		const bindings = createDefaultKeybindings(state, nav);
		const keys = bindings.map((b) => b.key);
		expect(keys).toContain('PageUp');
		expect(keys).toContain('PageDown');
	});

	it('should include select-all (Ctrl+A)', () => {
		const bindings = createDefaultKeybindings(state, nav);
		const selectAll = bindings.find(
			(b) => b.key === 'a' && b.modifiers?.ctrl
		);
		expect(selectAll).toBeDefined();
		expect(selectAll!.description).toContain('Select all');
	});

	it('should include editing keybindings when not readonly', () => {
		const bindings = createDefaultKeybindings(state, nav, { readonly: false });
		const keys = bindings.map((b) => b.key);
		expect(keys).toContain('Backspace');
		expect(keys).toContain('Delete');
		expect(keys).toContain('Enter');
		expect(keys).toContain('Tab');
	});

	it('should include undo/redo keybindings when not readonly', () => {
		const bindings = createDefaultKeybindings(state, nav);
		const undoBinding = bindings.find(
			(b) => b.key === 'z' && b.modifiers?.ctrl && !b.modifiers?.shift
		);
		const redoBinding = bindings.find(
			(b) => b.key === 'z' && b.modifiers?.ctrl && b.modifiers?.shift
		);
		expect(undoBinding).toBeDefined();
		expect(redoBinding).toBeDefined();
	});

	it('should exclude editing keybindings in readonly mode', () => {
		const bindings = createDefaultKeybindings(state, nav, { readonly: true });
		const keys = bindings.map((b) => b.key);
		expect(keys).not.toContain('Backspace');
		expect(keys).not.toContain('Delete');
		expect(keys).not.toContain('Enter');
		expect(keys).not.toContain('Tab');
	});

	it('should include save keybinding when onSave is provided', () => {
		const saveFn = vi.fn();
		const bindings = createDefaultKeybindings(state, nav, { onSave: saveFn });
		const save = bindings.find((b) => b.key === 's' && b.modifiers?.ctrl);
		expect(save).toBeDefined();
		expect(save!.description).toContain('Save');
	});

	it('should not include save keybinding when onSave is not provided', () => {
		const bindings = createDefaultKeybindings(state, nav);
		const save = bindings.find((b) => b.key === 's' && b.modifiers?.ctrl);
		expect(save).toBeUndefined();
	});

	it('should mark navigation bindings as readonly', () => {
		const bindings = createDefaultKeybindings(state, nav);
		const arrowLeft = bindings.find(
			(b) => b.key === 'ArrowLeft' && !b.modifiers?.ctrl && !b.modifiers?.shift
		);
		expect(arrowLeft?.readonly).toBe(true);
	});

	it('every keybinding should have a description', () => {
		const bindings = createDefaultKeybindings(state, nav);
		for (const b of bindings) {
			expect(b.description).toBeTruthy();
		}
	});
});

// ============================================================
// Integration: KeyboardHandler + createDefaultKeybindings
// ============================================================

describe('KeyboardHandler + createDefaultKeybindings integration', () => {
	it('should handle arrow key events from default keybindings', () => {
		const state = makeState('hello\nworld');
		const nav = createNavigation(state);
		const bindings = createDefaultKeybindings(state, nav);

		const handler = createKeyboardHandler();
		handler.setKeybindings(bindings);

		// Cursor starts at 0,0; pressing ArrowRight should move it
		const event = makeKeyEvent('ArrowRight');
		const handled = handler.handleKeyDown(event);
		expect(handled).toBe(true);
		expect(state.selection.head.column).toBe(1);
	});

	it('should handle Ctrl+A select all from default keybindings', () => {
		const state = makeState('hello\nworld');
		const nav = createNavigation(state);
		const bindings = createDefaultKeybindings(state, nav);

		const handler = createKeyboardHandler();
		handler.setKeybindings(bindings);

		const event = makeKeyEvent('a', { ctrl: true });
		handler.handleKeyDown(event);

		// Selection should cover the full document
		expect(state.selection.anchor.line).toBe(0);
		expect(state.selection.anchor.column).toBe(0);
		// Head should be at the end of the document
		expect(state.selection.head.line).toBe(1);
		expect(state.selection.head.column).toBe(5); // "world" length
	});

	it('should invoke onSave callback through keybinding handler', () => {
		const state = makeState('content');
		const nav = createNavigation(state);
		const saveFn = vi.fn();
		const bindings = createDefaultKeybindings(state, nav, { onSave: saveFn });

		const handler = createKeyboardHandler();
		handler.setKeybindings(bindings);

		handler.handleKeyDown(makeKeyEvent('s', { ctrl: true }));
		expect(saveFn).toHaveBeenCalledOnce();
	});

	it('should skip editing keybindings in readonly mode', () => {
		const state = makeState('hello');
		const nav = createNavigation(state);
		const bindings = createDefaultKeybindings(state, nav);

		const handler = createKeyboardHandler();
		handler.setKeybindings(bindings);

		// Backspace should NOT work in readonly mode
		const event = makeKeyEvent('Backspace');
		const handled = handler.handleKeyDown(event, true);
		expect(handled).toBe(false);
		expect(state.getContent()).toBe('hello');
	});
});
