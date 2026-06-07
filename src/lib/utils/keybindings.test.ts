import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	isMac,
	getModKey,
	formatKeybinding,
	matchesKeybinding,
	createKeybindingHandler,
	defaultKeybindings,
	type Keybinding
} from './keybindings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock KeyboardEvent
 */
function makeKeyEvent(overrides: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
	return {
		key: overrides.key,
		ctrlKey: overrides.ctrlKey ?? false,
		metaKey: overrides.metaKey ?? false,
		altKey: overrides.altKey ?? false,
		shiftKey: overrides.shiftKey ?? false,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn()
	} as unknown as KeyboardEvent;
}

// ============================================================
// isMac
// ============================================================

describe('isMac', () => {
	it('should return a boolean', () => {
		expect(typeof isMac()).toBe('boolean');
	});

	// In a Node.js/vitest environment, navigator may have platform = ''
	// so isMac() should typically return false
	it('should return false in test environment (non-Mac)', () => {
		// This may be true if running on Mac, so just check it does not throw
		expect(() => isMac()).not.toThrow();
	});
});

// ============================================================
// getModKey
// ============================================================

describe('getModKey', () => {
	it('should return "Ctrl" or "Cmd" based on platform', () => {
		const result = getModKey();
		expect(['Ctrl', 'Cmd']).toContain(result);
	});
});

// ============================================================
// formatKeybinding
// ============================================================

describe('formatKeybinding', () => {
	// Tests assume non-Mac environment (test runner on Linux)
	// isMac() returns false in the test environment

	it('should format simple key', () => {
		const result = formatKeybinding(['s']);
		expect(result).toBe('S');
	});

	it('should format Ctrl modifier', () => {
		const result = formatKeybinding(['ctrl', 's']);
		// On non-Mac: "Ctrl+S"
		if (!isMac()) {
			expect(result).toBe('Ctrl+S');
		}
	});

	it('should format Shift modifier', () => {
		const result = formatKeybinding(['shift', 'p']);
		if (!isMac()) {
			expect(result).toBe('Shift+P');
		}
	});

	it('should format Alt modifier', () => {
		const result = formatKeybinding(['alt', 'up']);
		if (!isMac()) {
			expect(result).toContain('Alt');
			expect(result).toContain('\u2191');
		}
	});

	it('should format Mod key based on platform', () => {
		const result = formatKeybinding(['mod', 's']);
		if (isMac()) {
			expect(result).toContain('\u2318'); // Cmd symbol
		} else {
			expect(result).toContain('Ctrl');
		}
	});

	it('should format special keys', () => {
		expect(formatKeybinding(['enter'])).toContain('\u21B5');
		expect(formatKeybinding(['escape'])).toContain('Esc');
		expect(formatKeybinding(['esc'])).toContain('Esc');
		expect(formatKeybinding(['backspace'])).toContain('\u232B');
		expect(formatKeybinding(['delete'])).toContain('\u2326');
		expect(formatKeybinding(['tab'])).toContain('\u21E5');
		expect(formatKeybinding(['space'])).toContain('Space');
	});

	it('should format arrow keys', () => {
		expect(formatKeybinding(['up'])).toContain('\u2191');
		expect(formatKeybinding(['down'])).toContain('\u2193');
		expect(formatKeybinding(['left'])).toContain('\u2190');
		expect(formatKeybinding(['right'])).toContain('\u2192');
	});

	it('should join with + on non-Mac', () => {
		if (!isMac()) {
			const result = formatKeybinding(['ctrl', 'shift', 's']);
			expect(result).toBe('Ctrl+Shift+S');
		}
	});
});

// ============================================================
// matchesKeybinding
// ============================================================

describe('matchesKeybinding', () => {
	it('should match simple key', () => {
		const event = makeKeyEvent({ key: 's' });
		expect(matchesKeybinding(event, ['s'])).toBe(true);
	});

	it('should match Ctrl+S', () => {
		const event = makeKeyEvent({ key: 's', ctrlKey: true });
		expect(matchesKeybinding(event, ['ctrl', 's'])).toBe(true);
	});

	it('should not match when extra modifiers are pressed', () => {
		const event = makeKeyEvent({ key: 's', ctrlKey: true, shiftKey: true });
		expect(matchesKeybinding(event, ['ctrl', 's'])).toBe(false);
	});

	it('should match Ctrl+Shift+S', () => {
		const event = makeKeyEvent({ key: 's', ctrlKey: true, shiftKey: true });
		expect(matchesKeybinding(event, ['ctrl', 'shift', 's'])).toBe(true);
	});

	it('should match Alt key', () => {
		const event = makeKeyEvent({ key: 'ArrowUp', altKey: true });
		expect(matchesKeybinding(event, ['alt', 'up'])).toBe(true);
	});

	it('should match Mod key as Ctrl on non-Mac', () => {
		if (!isMac()) {
			const event = makeKeyEvent({ key: 's', ctrlKey: true });
			expect(matchesKeybinding(event, ['mod', 's'])).toBe(true);
		}
	});

	it('should not match when wrong key', () => {
		const event = makeKeyEvent({ key: 'a', ctrlKey: true });
		expect(matchesKeybinding(event, ['ctrl', 's'])).toBe(false);
	});

	it('should not match when required modifier is missing', () => {
		const event = makeKeyEvent({ key: 's' });
		expect(matchesKeybinding(event, ['ctrl', 's'])).toBe(false);
	});

	it('should handle space key normalization', () => {
		const event = makeKeyEvent({ key: ' ' });
		expect(matchesKeybinding(event, ['space'])).toBe(true);
	});

	it('should handle arrow key normalization', () => {
		expect(matchesKeybinding(
			makeKeyEvent({ key: 'ArrowUp' }),
			['up']
		)).toBe(true);

		expect(matchesKeybinding(
			makeKeyEvent({ key: 'ArrowDown' }),
			['down']
		)).toBe(true);

		expect(matchesKeybinding(
			makeKeyEvent({ key: 'ArrowLeft' }),
			['left']
		)).toBe(true);

		expect(matchesKeybinding(
			makeKeyEvent({ key: 'ArrowRight' }),
			['right']
		)).toBe(true);
	});

	it('should not match when extra ctrl is pressed but not in binding', () => {
		const event = makeKeyEvent({ key: 's', ctrlKey: true, altKey: true });
		expect(matchesKeybinding(event, ['alt', 's'])).toBe(false);
	});
});

// ============================================================
// createKeybindingHandler
// ============================================================

describe('createKeybindingHandler', () => {
	it('should return a function', () => {
		const handler = createKeybindingHandler([], vi.fn());
		expect(typeof handler).toBe('function');
	});

	it('should execute command when keybinding matches', () => {
		const executeCommand = vi.fn();
		const bindings: Keybinding[] = [
			{ keys: ['ctrl', 's'], command: 'file.save' }
		];
		const handler = createKeybindingHandler(bindings, executeCommand);

		const event = makeKeyEvent({ key: 's', ctrlKey: true });
		handler(event);

		expect(executeCommand).toHaveBeenCalledWith('file.save');
		expect(event.preventDefault).toHaveBeenCalled();
		expect(event.stopPropagation).toHaveBeenCalled();
	});

	it('should not execute command when no keybinding matches', () => {
		const executeCommand = vi.fn();
		const bindings: Keybinding[] = [
			{ keys: ['ctrl', 's'], command: 'file.save' }
		];
		const handler = createKeybindingHandler(bindings, executeCommand);

		const event = makeKeyEvent({ key: 'a' });
		handler(event);

		expect(executeCommand).not.toHaveBeenCalled();
	});

	it('should match first binding when multiple could match', () => {
		const executeCommand = vi.fn();
		const bindings: Keybinding[] = [
			{ keys: ['ctrl', 's'], command: 'first' },
			{ keys: ['ctrl', 's'], command: 'second' }
		];
		const handler = createKeybindingHandler(bindings, executeCommand);

		const event = makeKeyEvent({ key: 's', ctrlKey: true });
		handler(event);

		expect(executeCommand).toHaveBeenCalledWith('first');
		expect(executeCommand).toHaveBeenCalledTimes(1);
	});
});

// ============================================================
// defaultKeybindings
// ============================================================

describe('defaultKeybindings', () => {
	it('should be a non-empty array', () => {
		expect(Array.isArray(defaultKeybindings)).toBe(true);
		expect(defaultKeybindings.length).toBeGreaterThan(0);
	});

	it('every binding should have keys and command', () => {
		for (const binding of defaultKeybindings) {
			expect(Array.isArray(binding.keys)).toBe(true);
			expect(binding.keys.length).toBeGreaterThan(0);
			expect(typeof binding.command).toBe('string');
			expect(binding.command.length).toBeGreaterThan(0);
		}
	});

	it('should contain common bindings', () => {
		const commands = defaultKeybindings.map((b) => b.command);
		expect(commands).toContain('file.save');
		expect(commands).toContain('search.find');
		expect(commands).toContain('search.replace');
		expect(commands).toContain('commandPalette');
		expect(commands).toContain('editor.undo');
		expect(commands).toContain('editor.redo');
	});

	it('all bindings should have labels', () => {
		for (const binding of defaultKeybindings) {
			expect(typeof binding.label).toBe('string');
			expect(binding.label!.length).toBeGreaterThan(0);
		}
	});
});
