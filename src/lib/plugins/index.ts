/**
 * Plugin System API
 *
 * A proposal-based plugin/extension system. Plugins move through a
 * lifecycle (draft → review → testing → deployed) coordinated by a backend
 * "plugin host" that you provide. See {@link createPluginLoader} and the
 * plugin store for the HTTP/SSE contract the host is expected to implement.
 *
 * Plugins can be:
 * 1. UI Components (server-rendered by the plugin host)
 * 2. JS Modules (executed by the plugin host, out of band)
 * 3. Actions (commands that can be invoked)
 * 4. Providers (services that provide data/functionality)
 */

import type { PluginManifest, PluginInstance, PluginCommand, PluginPanel } from '$types';

/**
 * Plugin registry for managing loaded plugins
 */
class PluginRegistry {
	private plugins = new Map<string, PluginInstance>();
	private commands = new Map<string, PluginCommand>();
	private panels = new Map<string, PluginPanel>();

	/**
	 * Register a plugin instance
	 */
	register(plugin: PluginInstance): void {
		this.plugins.set(plugin.id, plugin);
	}

	/**
	 * Unregister a plugin
	 */
	unregister(pluginId: string): void {
		const plugin = this.plugins.get(pluginId);
		if (plugin) {
			plugin.dispose?.();
			this.plugins.delete(pluginId);

			// Remove associated commands and panels
			for (const [id] of this.commands) {
				if (id.startsWith(`${pluginId}:`)) {
					this.commands.delete(id);
				}
			}
			for (const [id] of this.panels) {
				if (id.startsWith(`${pluginId}:`)) {
					this.panels.delete(id);
				}
			}
		}
	}

	/**
	 * Get a plugin by ID
	 */
	get(pluginId: string): PluginInstance | undefined {
		return this.plugins.get(pluginId);
	}

	/**
	 * Get all plugins
	 */
	getAll(): PluginInstance[] {
		return Array.from(this.plugins.values());
	}

	/**
	 * Register a command
	 */
	registerCommand(pluginId: string, command: PluginCommand): void {
		const fullId = `${pluginId}:${command.id}`;
		this.commands.set(fullId, { ...command, id: fullId });
	}

	/**
	 * Execute a command
	 */
	async executeCommand(commandId: string): Promise<void> {
		const command = this.commands.get(commandId);
		if (command) {
			await command.handler();
		}
	}

	/**
	 * Get all commands
	 */
	getCommands(): PluginCommand[] {
		return Array.from(this.commands.values());
	}

	/**
	 * Register a panel
	 */
	registerPanel(pluginId: string, panel: PluginPanel): void {
		const fullId = `${pluginId}:${panel.id}`;
		this.panels.set(fullId, { ...panel, id: fullId });
	}

	/**
	 * Get all panels
	 */
	getPanels(): PluginPanel[] {
		return Array.from(this.panels.values());
	}

	/**
	 * Get panels by position
	 */
	getPanelsByPosition(position: 'left' | 'right' | 'bottom'): PluginPanel[] {
		return this.getPanels().filter((p) => p.position === position);
	}
}

// Global plugin registry
export const pluginRegistry = new PluginRegistry();

/**
 * Plugin loader for server-rendered components served by the plugin host
 */
export interface PluginLoader {
	/**
	 * Load a plugin component from the server
	 */
	loadComponent(proposalId: string, componentPath: string): Promise<{ default: unknown }>;

	/**
	 * Load a plugin module from the server
	 */
	loadModule(proposalId: string, entryPoint: string): Promise<Record<string, unknown>>;
}

/**
 * Create a plugin loader bound to a plugin-host HTTP API.
 *
 * @param apiBase - Base path of the plugin host's REST API (same-origin).
 *                  Defaults to `/api/plugins`.
 */
export function createPluginLoader(apiBase = '/api/plugins'): PluginLoader {
	return {
		async loadComponent(proposalId: string, componentPath: string) {
			const url = `${apiBase}/plugins/${proposalId}/component?path=${encodeURIComponent(componentPath)}`;
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Failed to load component: ${response.status}`);
			}

			// The server returns a compiled Svelte component
			// (the plugin host compiles and returns the component)
			const module = await response.json();
			return module;
		},

		async loadModule(proposalId: string, entryPoint: string) {
			const url = `${apiBase}/plugins/${proposalId}/module?entry=${encodeURIComponent(entryPoint)}`;
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Failed to load module: ${response.status}`);
			}

			// The server executes the module in a sandbox and returns the exports
			const exports = await response.json();
			return exports;
		}
	};
}

/**
 * Define a plugin manifest
 */
export function definePlugin(manifest: PluginManifest): PluginManifest {
	return manifest;
}

/**
 * Define a plugin command
 */
export function defineCommand(command: Omit<PluginCommand, 'id'> & { id: string }): PluginCommand {
	return command;
}

/**
 * Define a plugin panel
 */
export function definePanel(panel: Omit<PluginPanel, 'id'> & { id: string }): PluginPanel {
	return panel;
}
