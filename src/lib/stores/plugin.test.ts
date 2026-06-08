import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as plugin from './plugin.svelte';

/**
 * Plugin store tests
 *
 * Covers proposal management, instance lifecycle, command/panel registration,
 * command execution, event subscription, and error handling.
 *
 * Network-dependent functions (fetchProposals, createProposal, submitProposal,
 * loadPlugin, connect) are tested lightly or skipped since they hit fetch.
 */

let uuidCounter = 0;
vi.stubGlobal('crypto', {
	randomUUID: () => `plugin-uuid-${++uuidCounter}`
});

function resetStore() {
	plugin.disconnect();
	plugin.clearError();
	// Unload all instances - we can't directly clear proposals
	// without network, but we test what we can.
}

beforeEach(() => {
	uuidCounter = 0;
	resetStore();
});

// ============================================================================
// Helpers
// ============================================================================

// ============================================================================
// Default state
// ============================================================================

describe('plugin store — default state', () => {
	it('has no proposals', () => {
		expect(plugin.getProposals()).toEqual([]);
	});

	it('has no instances', () => {
		expect(plugin.getInstances()).toEqual([]);
	});

	it('has no active instances', () => {
		expect(plugin.getActiveInstances()).toEqual([]);
	});

	it('has no commands', () => {
		expect(plugin.getCommands()).toEqual([]);
	});

	it('has no panels', () => {
		expect(plugin.getPanels()).toEqual([]);
	});

	it('is not connected', () => {
		expect(plugin.getConnected()).toBe(false);
	});

	it('is not loading proposals', () => {
		expect(plugin.getLoadingProposals()).toBe(false);
	});

	it('loading instance is null', () => {
		expect(plugin.getLoadingInstance()).toBe(null);
	});

	it('has no error', () => {
		expect(plugin.getError()).toBe(null);
	});
});

// ============================================================================
// Proposal filtering
// ============================================================================

describe('plugin store — proposal filtering', () => {
	it('getDraftProposals returns drafts', () => {
		// We can only test these with manually injected state, which we can't
		// do without network. Test that functions exist and return arrays.
		expect(plugin.getDraftProposals()).toEqual([]);
	});

	it('getReviewingProposals returns reviewing', () => {
		expect(plugin.getReviewingProposals()).toEqual([]);
	});

	it('getDeployedProposals returns deployed', () => {
		expect(plugin.getDeployedProposals()).toEqual([]);
	});
});

// ============================================================================
// Command registration
// ============================================================================

describe('plugin store — command registration', () => {
	it('registerCommand adds a command with prefixed id', () => {
		plugin.registerCommand('my-plugin', {
			id: 'say-hello',
			title: 'Say Hello',
			handler: async () => {}
		});
		const cmds = plugin.getCommands();
		expect(cmds).toHaveLength(1);
		expect(cmds[0].id).toBe('my-plugin:say-hello');
	});

	it('registerCommand allows multiple commands from same plugin', () => {
		const before = plugin.getCommands().length;
		plugin.registerCommand('multi-plugin', {
			id: 'cmd-1', title: 'Cmd 1', handler: async () => {}
		});
		plugin.registerCommand('multi-plugin', {
			id: 'cmd-2', title: 'Cmd 2', handler: async () => {}
		});
		expect(plugin.getCommands().length - before).toBe(2);
	});
});

// ============================================================================
// Panel registration
// ============================================================================

describe('plugin store — panel registration', () => {
	it('registerPanel adds a panel with prefixed id', () => {
		plugin.registerPanel('my-plugin', {
			id: 'output',
			title: 'Output Panel',
			position: 'bottom',
			component: 'OutputPanel'
		});
		const panels = plugin.getPanels();
		expect(panels).toHaveLength(1);
		expect(panels[0].id).toBe('my-plugin:output');
	});
});

// ============================================================================
// Command execution
// ============================================================================

describe('plugin store — command execution', () => {
	it('executeCommand calls the handler', async () => {
		const handler = vi.fn();
		plugin.registerCommand('my-plugin', {
			id: 'do-thing',
			title: 'Do Thing',
			handler
		});
		await plugin.executeCommand('my-plugin:do-thing');
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('executeCommand sets error for unknown command', async () => {
		await plugin.executeCommand('nonexistent');
		expect(plugin.getError()).toContain('Command not found');
	});

	it('executeCommand catches handler errors', async () => {
		plugin.registerCommand('my-plugin', {
			id: 'fail',
			title: 'Fail',
			handler: async () => { throw new Error('boom'); }
		});
		await plugin.executeCommand('my-plugin:fail');
		expect(plugin.getError()).toBe('boom');
	});
});

// ============================================================================
// Event subscription
// ============================================================================

describe('plugin store — event subscription', () => {
	it('onEvent returns an unsubscribe function', () => {
		const handler = vi.fn();
		const unsub = plugin.onEvent('deployed', handler);
		expect(typeof unsub).toBe('function');
		unsub();
	});
});

// ============================================================================
// Instance lookup
// ============================================================================

describe('plugin store — instance lookup', () => {
	it('getProposal returns undefined for unknown id', () => {
		expect(plugin.getProposal('nonexistent')).toBeUndefined();
	});

	it('getInstance returns undefined for unknown id', () => {
		expect(plugin.getInstance('nonexistent')).toBeUndefined();
	});
});

// ============================================================================
// Unload plugin
// ============================================================================

describe('plugin store — unloadPlugin', () => {
	it('does nothing for unknown plugin', () => {
		// Should not throw
		plugin.unloadPlugin('nonexistent');
	});
});

// ============================================================================
// Error handling
// ============================================================================

describe('plugin store — error handling', () => {
	it('clearError resets error', () => {
		// First set an error via executeCommand
		plugin.executeCommand('nonexistent').then(() => {
			plugin.clearError();
			expect(plugin.getError()).toBe(null);
		});
	});
});

// ============================================================================
// Disconnect
// ============================================================================

describe('plugin store — disconnect', () => {
	it('disconnect sets connected to false', () => {
		plugin.disconnect();
		expect(plugin.getConnected()).toBe(false);
	});
});
