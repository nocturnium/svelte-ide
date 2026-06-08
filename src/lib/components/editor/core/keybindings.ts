/**
 * Keyboard handling for the custom editor
 *
 * This module provides keybinding management and keyboard event handling.
 */

import type { EditorState } from './state';
import type { Navigation } from './navigation';

/**
 * Modifier keys
 */
export interface Modifiers {
	ctrl?: boolean;
	shift?: boolean;
	alt?: boolean;
	meta?: boolean;
}

/**
 * Keybinding definition
 */
export interface Keybinding {
	/** Key name (e.g., 'a', 'Enter', 'ArrowLeft') */
	key: string;
	/** Required modifiers */
	modifiers?: Modifiers;
	/** Handler function */
	handler: () => boolean | void;
	/** Description for help/documentation */
	description?: string;
	/** Whether binding works in readonly mode */
	readonly?: boolean;
}

/**
 * Normalize key event to consistent format
 */
function normalizeKey(e: KeyboardEvent): string {
	return e.key;
}

/**
 * Check if modifiers match
 */
function modifiersMatch(e: KeyboardEvent, modifiers?: Modifiers): boolean {
	const ctrl = modifiers?.ctrl ?? false;
	const shift = modifiers?.shift ?? false;
	const alt = modifiers?.alt ?? false;
	const meta = modifiers?.meta ?? false;

	// Handle Cmd on Mac as Ctrl
	const ctrlOrMeta = e.ctrlKey || e.metaKey;

	return (
		(ctrl ? ctrlOrMeta : !ctrlOrMeta) &&
		(shift ? e.shiftKey : !e.shiftKey) &&
		(alt ? e.altKey : !e.altKey) &&
		(meta === e.metaKey || ctrl) // Allow meta to match either on its own or as part of ctrl
	);
}

/**
 * Create default keybindings for the editor
 */
export function createDefaultKeybindings(
	state: EditorState,
	nav: Navigation,
	options: {
		onSave?: () => void;
		readonly?: boolean;
		pageSize?: number;
	} = {}
): Keybinding[] {
	const pageSize = options.pageSize ?? 20;
	const keybindings: Keybinding[] = [];

	// ============================================
	// Navigation
	// ============================================

	// Arrow keys
	keybindings.push(
		{
			key: 'ArrowLeft',
			handler: () => nav.moveLeft(),
			description: 'Move cursor left',
			readonly: true
		},
		{
			key: 'ArrowLeft',
			modifiers: { shift: true },
			handler: () => nav.moveLeft(true),
			description: 'Extend selection left',
			readonly: true
		},
		{
			key: 'ArrowRight',
			handler: () => nav.moveRight(),
			description: 'Move cursor right',
			readonly: true
		},
		{
			key: 'ArrowRight',
			modifiers: { shift: true },
			handler: () => nav.moveRight(true),
			description: 'Extend selection right',
			readonly: true
		},
		{
			key: 'ArrowUp',
			handler: () => nav.moveUp(),
			description: 'Move cursor up',
			readonly: true
		},
		{
			key: 'ArrowUp',
			modifiers: { shift: true },
			handler: () => nav.moveUp(true),
			description: 'Extend selection up',
			readonly: true
		},
		{
			key: 'ArrowDown',
			handler: () => nav.moveDown(),
			description: 'Move cursor down',
			readonly: true
		},
		{
			key: 'ArrowDown',
			modifiers: { shift: true },
			handler: () => nav.moveDown(true),
			description: 'Extend selection down',
			readonly: true
		}
	);

	// Word navigation
	keybindings.push(
		{
			key: 'ArrowLeft',
			modifiers: { ctrl: true },
			handler: () => nav.moveWordLeft(),
			description: 'Move to previous word',
			readonly: true
		},
		{
			key: 'ArrowLeft',
			modifiers: { ctrl: true, shift: true },
			handler: () => nav.moveWordLeft(true),
			description: 'Extend selection to previous word',
			readonly: true
		},
		{
			key: 'ArrowRight',
			modifiers: { ctrl: true },
			handler: () => nav.moveWordRight(),
			description: 'Move to next word',
			readonly: true
		},
		{
			key: 'ArrowRight',
			modifiers: { ctrl: true, shift: true },
			handler: () => nav.moveWordRight(true),
			description: 'Extend selection to next word',
			readonly: true
		}
	);

	// Line navigation
	keybindings.push(
		{
			key: 'Home',
			handler: () => nav.moveToLineStart(),
			description: 'Move to line start',
			readonly: true
		},
		{
			key: 'Home',
			modifiers: { shift: true },
			handler: () => nav.moveToLineStart(true),
			description: 'Extend selection to line start',
			readonly: true
		},
		{
			key: 'End',
			handler: () => nav.moveToLineEnd(),
			description: 'Move to line end',
			readonly: true
		},
		{
			key: 'End',
			modifiers: { shift: true },
			handler: () => nav.moveToLineEnd(true),
			description: 'Extend selection to line end',
			readonly: true
		}
	);

	// Document navigation
	keybindings.push(
		{
			key: 'Home',
			modifiers: { ctrl: true },
			handler: () => nav.moveToDocumentStart(),
			description: 'Move to document start',
			readonly: true
		},
		{
			key: 'Home',
			modifiers: { ctrl: true, shift: true },
			handler: () => nav.moveToDocumentStart(true),
			description: 'Extend selection to document start',
			readonly: true
		},
		{
			key: 'End',
			modifiers: { ctrl: true },
			handler: () => nav.moveToDocumentEnd(),
			description: 'Move to document end',
			readonly: true
		},
		{
			key: 'End',
			modifiers: { ctrl: true, shift: true },
			handler: () => nav.moveToDocumentEnd(true),
			description: 'Extend selection to document end',
			readonly: true
		}
	);

	// Page navigation
	keybindings.push(
		{
			key: 'PageUp',
			handler: () => nav.movePageUp(pageSize),
			description: 'Move up one page',
			readonly: true
		},
		{
			key: 'PageUp',
			modifiers: { shift: true },
			handler: () => nav.movePageUp(pageSize, true),
			description: 'Extend selection up one page',
			readonly: true
		},
		{
			key: 'PageDown',
			handler: () => nav.movePageDown(pageSize),
			description: 'Move down one page',
			readonly: true
		},
		{
			key: 'PageDown',
			modifiers: { shift: true },
			handler: () => nav.movePageDown(pageSize, true),
			description: 'Extend selection down one page',
			readonly: true
		}
	);

	// ============================================
	// Selection
	// ============================================

	keybindings.push({
		key: 'a',
		modifiers: { ctrl: true },
		handler: () => state.selectAll(),
		description: 'Select all',
		readonly: true
	});

	// ============================================
	// Editing (only when not readonly)
	// ============================================

	if (!options.readonly) {
		keybindings.push(
			// Basic input is handled by onInput, not keybindings

			// Backspace
			{
				key: 'Backspace',
				handler: () => state.deleteBackward(),
				description: 'Delete character before cursor'
			},
			{
				key: 'Backspace',
				modifiers: { ctrl: true },
				handler: () => {
					// Delete word before cursor
					nav.moveWordLeft(true);
					state.deleteSelection();
				},
				description: 'Delete word before cursor'
			},

			// Delete
			{
				key: 'Delete',
				handler: () => state.deleteForward(),
				description: 'Delete character after cursor'
			},
			{
				key: 'Delete',
				modifiers: { ctrl: true },
				handler: () => {
					// Delete word after cursor
					nav.moveWordRight(true);
					state.deleteSelection();
				},
				description: 'Delete word after cursor'
			},

			// Enter
			{
				key: 'Enter',
				handler: () => state.insertNewline(),
				description: 'Insert new line'
			},

			// Tab
			{
				key: 'Tab',
				handler: () => state.insertTab(),
				description: 'Insert tab'
			},

			// Undo/Redo
			{
				key: 'z',
				modifiers: { ctrl: true },
				handler: () => state.undo(),
				description: 'Undo'
			},
			{
				key: 'z',
				modifiers: { ctrl: true, shift: true },
				handler: () => state.redo(),
				description: 'Redo'
			},
			{
				key: 'y',
				modifiers: { ctrl: true },
				handler: () => state.redo(),
				description: 'Redo'
			}
		);
	}

	// ============================================
	// Custom commands
	// ============================================

	if (options.onSave) {
		keybindings.push({
			key: 's',
			modifiers: { ctrl: true },
			handler: () => {
				options.onSave!();
				return true;
			},
			description: 'Save',
			readonly: true
		});
	}

	return keybindings;
}

/**
 * Keyboard handler class
 */
export class KeyboardHandler {
	private keybindings: Keybinding[] = [];
	private enabled = true;

	/**
	 * Set keybindings
	 */
	setKeybindings(keybindings: Keybinding[]): void {
		this.keybindings = keybindings;
	}

	/**
	 * Add a keybinding
	 */
	addKeybinding(keybinding: Keybinding): void {
		this.keybindings.push(keybinding);
	}

	/**
	 * Remove a keybinding
	 */
	removeKeybinding(key: string, modifiers?: Modifiers): void {
		this.keybindings = this.keybindings.filter(
			(kb) => !(kb.key === key && this.modifiersEqual(kb.modifiers, modifiers))
		);
	}

	/**
	 * Enable/disable keyboard handling
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	/**
	 * Handle a keyboard event
	 * Returns true if the event was handled
	 */
	handleKeyDown(e: KeyboardEvent, readonly = false): boolean {
		if (!this.enabled) {
			return false;
		}

		const key = normalizeKey(e);

		// Find matching keybinding
		for (const binding of this.keybindings) {
			if (binding.key === key && modifiersMatch(e, binding.modifiers)) {
				// Skip non-readonly bindings in readonly mode
				if (readonly && !binding.readonly) {
					continue;
				}

				const result = binding.handler();
				if (result !== false) {
					e.preventDefault();
					e.stopPropagation();
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Check if modifiers are equal
	 */
	private modifiersEqual(a?: Modifiers, b?: Modifiers): boolean {
		return (
			(a?.ctrl ?? false) === (b?.ctrl ?? false) &&
			(a?.shift ?? false) === (b?.shift ?? false) &&
			(a?.alt ?? false) === (b?.alt ?? false) &&
			(a?.meta ?? false) === (b?.meta ?? false)
		);
	}

	/**
	 * Get all keybindings for documentation
	 */
	getKeybindings(): Keybinding[] {
		return [...this.keybindings];
	}
}

/**
 * Create keyboard handler
 */
export function createKeyboardHandler(): KeyboardHandler {
	return new KeyboardHandler();
}
