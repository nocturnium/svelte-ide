/**
 * Keyboard shortcut utilities
 */

export interface Keybinding {
	keys: string[];
	command: string;
	when?: string;
	label?: string;
}

/**
 * Check if running on macOS
 */
export function isMac(): boolean {
	if (typeof navigator === 'undefined') return false;
	return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/**
 * Get the modifier key name for the current platform
 */
export function getModKey(): string {
	return isMac() ? 'Cmd' : 'Ctrl';
}

/**
 * Format a key combination for display
 */
export function formatKeybinding(keys: string[]): string {
	return keys
		.map((key) => {
			switch (key.toLowerCase()) {
				case 'mod':
					return isMac() ? '⌘' : 'Ctrl';
				case 'ctrl':
					return isMac() ? '⌃' : 'Ctrl';
				case 'alt':
					return isMac() ? '⌥' : 'Alt';
				case 'shift':
					return isMac() ? '⇧' : 'Shift';
				case 'meta':
				case 'cmd':
					return '⌘';
				case 'enter':
					return '↵';
				case 'escape':
				case 'esc':
					return 'Esc';
				case 'backspace':
					return '⌫';
				case 'delete':
					return '⌦';
				case 'tab':
					return '⇥';
				case 'space':
					return 'Space';
				case 'up':
					return '↑';
				case 'down':
					return '↓';
				case 'left':
					return '←';
				case 'right':
					return '→';
				default:
					return key.toUpperCase();
			}
		})
		.join(isMac() ? '' : '+');
}

/**
 * Check if a keyboard event matches a key combination
 */
export function matchesKeybinding(event: KeyboardEvent, keys: string[]): boolean {
	const normalizedKeys = keys.map((k) => k.toLowerCase());

	// Check modifiers
	const needsMod = normalizedKeys.includes('mod');
	const needsCtrl = normalizedKeys.includes('ctrl');
	const needsAlt = normalizedKeys.includes('alt');
	const needsShift = normalizedKeys.includes('shift');
	const needsMeta = normalizedKeys.includes('meta') || normalizedKeys.includes('cmd');

	// On Mac, 'mod' maps to Meta (Cmd), on others to Ctrl
	const modKey = isMac() ? event.metaKey : event.ctrlKey;

	if (needsMod && !modKey) return false;
	if (needsCtrl && !event.ctrlKey) return false;
	if (needsAlt && !event.altKey) return false;
	if (needsShift && !event.shiftKey) return false;
	if (needsMeta && !event.metaKey) return false;

	// Check if extra modifiers are pressed
	const modifiersInBinding = ['mod', 'ctrl', 'alt', 'shift', 'meta', 'cmd'];
	const hasExtraCtrl = event.ctrlKey && !needsCtrl && !(needsMod && !isMac());
	const hasExtraAlt = event.altKey && !needsAlt;
	const hasExtraShift = event.shiftKey && !needsShift;
	const hasExtraMeta = event.metaKey && !needsMeta && !(needsMod && isMac());

	if (hasExtraCtrl || hasExtraAlt || hasExtraShift || hasExtraMeta) {
		return false;
	}

	// Get the main key (non-modifier)
	const mainKey = normalizedKeys.find((k) => !modifiersInBinding.includes(k));
	if (!mainKey) return false;

	// Normalize event key
	let eventKey = event.key.toLowerCase();

	// Handle special keys
	if (eventKey === ' ') eventKey = 'space';
	if (eventKey === 'arrowup') eventKey = 'up';
	if (eventKey === 'arrowdown') eventKey = 'down';
	if (eventKey === 'arrowleft') eventKey = 'left';
	if (eventKey === 'arrowright') eventKey = 'right';

	return eventKey === mainKey;
}

/**
 * Create a keyboard event handler for a set of keybindings
 */
export function createKeybindingHandler(
	bindings: Keybinding[],
	executeCommand: (command: string) => void
): (event: KeyboardEvent) => void {
	return (event: KeyboardEvent) => {
		for (const binding of bindings) {
			if (matchesKeybinding(event, binding.keys)) {
				event.preventDefault();
				event.stopPropagation();
				executeCommand(binding.command);
				return;
			}
		}
	};
}

/**
 * Default IDE keybindings
 */
export const defaultKeybindings: Keybinding[] = [
	// File operations
	{ keys: ['mod', 's'], command: 'file.save', label: 'Save' },
	{ keys: ['mod', 'shift', 's'], command: 'file.saveAll', label: 'Save All' },
	{ keys: ['mod', 'w'], command: 'file.close', label: 'Close Tab' },
	{ keys: ['mod', 'shift', 'w'], command: 'file.closeAll', label: 'Close All Tabs' },
	{ keys: ['mod', 'n'], command: 'file.new', label: 'New File' },
	{ keys: ['mod', 'o'], command: 'file.open', label: 'Open File' },

	// Navigation
	{ keys: ['mod', 'p'], command: 'quickOpen', label: 'Quick Open' },
	{ keys: ['mod', 'shift', 'p'], command: 'commandPalette', label: 'Command Palette' },
	{ keys: ['mod', 'g'], command: 'goToLine', label: 'Go to Line' },
	{ keys: ['ctrl', 'tab'], command: 'tab.next', label: 'Next Tab' },
	{ keys: ['ctrl', 'shift', 'tab'], command: 'tab.prev', label: 'Previous Tab' },

	// Search
	{ keys: ['mod', 'f'], command: 'search.find', label: 'Find' },
	{ keys: ['mod', 'h'], command: 'search.replace', label: 'Find and Replace' },
	{ keys: ['mod', 'shift', 'f'], command: 'search.global', label: 'Search in Files' },

	// View
	{ keys: ['mod', 'b'], command: 'view.sidebar', label: 'Toggle Sidebar' },
	{ keys: ['mod', 'j'], command: 'view.panel', label: 'Toggle Panel' },
	{ keys: ['mod', '`'], command: 'view.terminal', label: 'Toggle Terminal' },
	{ keys: ['mod', 'shift', 'e'], command: 'view.explorer', label: 'Focus Explorer' },
	{ keys: ['mod', '\\'], command: 'view.splitEditor', label: 'Split Editor' },
	{ keys: ['mod', 'k', 'z'], command: 'view.zenMode', label: 'Toggle Zen Mode' },

	// Editor
	{ keys: ['mod', '/'], command: 'editor.toggleComment', label: 'Toggle Comment' },
	{ keys: ['mod', 'd'], command: 'editor.addSelection', label: 'Add Selection' },
	{ keys: ['mod', 'shift', 'k'], command: 'editor.deleteLine', label: 'Delete Line' },
	{ keys: ['alt', 'up'], command: 'editor.moveLineUp', label: 'Move Line Up' },
	{ keys: ['alt', 'down'], command: 'editor.moveLineDown', label: 'Move Line Down' },
	{ keys: ['mod', '['], command: 'editor.outdent', label: 'Outdent Line' },
	{ keys: ['mod', ']'], command: 'editor.indent', label: 'Indent Line' },
	{ keys: ['mod', 'z'], command: 'editor.undo', label: 'Undo' },
	{ keys: ['mod', 'shift', 'z'], command: 'editor.redo', label: 'Redo' },

	// AI
	{ keys: ['mod', 'i'], command: 'ai.toggle', label: 'Toggle AI Panel' },
	{ keys: ['mod', 'shift', 'i'], command: 'ai.explain', label: 'Explain Selection' },
	{ keys: ['mod', 'k'], command: 'ai.inline', label: 'Inline AI Edit' }
];
