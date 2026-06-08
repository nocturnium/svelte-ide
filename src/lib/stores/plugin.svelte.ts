/**
 * Plugin store using Svelte 5 runes.
 *
 * Manages the proposal-based plugin lifecycle (draft → review → testing →
 * deployed) against a backend "plugin host". The host is expected to expose a
 * REST + Server-Sent-Events API under a configurable base path (default
 * `/api/plugins`); see {@link connect} and the fetch helpers below for the
 * exact contract.
 *
 * Note: Svelte 5 modules cannot directly export $derived values.
 * We use getter functions to expose reactive derived state.
 */

import type {
	PluginProposal,
	PluginInstance,
	PluginManifest,
	PluginEvent,
	PluginStatus,
	PluginCommand,
	PluginPanel
} from '$types';

interface PluginState {
	/** All plugin proposals (draft, reviewing, deployed, etc.) */
	proposals: PluginProposal[];
	/** Active plugin instances */
	instances: Map<string, PluginInstance>;
	/** Registered commands from plugins */
	commands: Map<string, PluginCommand>;
	/** Registered panels from plugins */
	panels: Map<string, PluginPanel>;
	/** Event stream connection */
	eventSource: EventSource | null;
	/** Connection status */
	connected: boolean;
	/** Loading states */
	loadingProposals: boolean;
	loadingInstance: string | null;
	/** Error state */
	error: string | null;
}

// Reactive state
const state = $state<PluginState>({
	proposals: [],
	instances: new Map(),
	commands: new Map(),
	panels: new Map(),
	eventSource: null,
	connected: false,
	loadingProposals: false,
	loadingInstance: null,
	error: null
});

/**
 * Offline seeding: populate the store with proposals without any network call.
 * When seeded, connect()/fetchProposals() no-op so an embedded panel renders the
 * seeded data on a static host (e.g. the docs demo) with no spinner or error.
 * Internal utility — intentionally NOT re-exported from the package root.
 */
let demoOffline = false;

export function seedProposals(proposals: PluginProposal[]): void {
	demoOffline = true;
	state.proposals = proposals;
	state.loadingProposals = false;
	state.connected = true;
	state.error = null;
}

// Getter functions for derived values (Svelte 5 module-safe)
export function getProposals(): PluginProposal[] {
	return state.proposals;
}

export function getInstances(): PluginInstance[] {
	return Array.from(state.instances.values());
}

export function getActiveInstances(): PluginInstance[] {
	return getInstances().filter((i) => i.status === 'active');
}

export function getCommands(): PluginCommand[] {
	return Array.from(state.commands.values());
}

export function getPanels(): PluginPanel[] {
	return Array.from(state.panels.values());
}

export function getConnected(): boolean {
	return state.connected;
}

export function getLoadingProposals(): boolean {
	return state.loadingProposals;
}

export function getLoadingInstance(): string | null {
	return state.loadingInstance;
}

export function getError(): string | null {
	return state.error;
}

export function getDraftProposals(): PluginProposal[] {
	return state.proposals.filter((p) => p.status === 'draft');
}

export function getReviewingProposals(): PluginProposal[] {
	return state.proposals.filter((p) => p.status === 'reviewing');
}

export function getDeployedProposals(): PluginProposal[] {
	return state.proposals.filter((p) => p.status === 'deployed');
}

// Legacy aliases for backward compatibility
export const proposals = { get current() { return getProposals(); } };
export const instances = { get current() { return getInstances(); } };
export const activeInstances = { get current() { return getActiveInstances(); } };
export const commands = { get current() { return getCommands(); } };
export const panels = { get current() { return getPanels(); } };
export const connected = { get current() { return getConnected(); } };
export const loadingProposals = { get current() { return getLoadingProposals(); } };
export const loadingInstance = { get current() { return getLoadingInstance(); } };
export const error = { get current() { return getError(); } };
export const draftProposals = { get current() { return getDraftProposals(); } };
export const reviewingProposals = { get current() { return getReviewingProposals(); } };
export const deployedProposals = { get current() { return getDeployedProposals(); } };

// Event handlers
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- internal non-reactive event dispatch registry, not UI state
const eventHandlers = new Map<string, Set<(event: PluginEvent) => void>>();

/**
 * Connect to the plugin host's Server-Sent-Events stream.
 *
 * @param endpoint - SSE endpoint on your plugin host. Defaults to
 *                    `/api/plugins/stream` (same-origin).
 */
export function connect(endpoint = '/api/plugins/stream'): void {
	if (demoOffline) {
		state.connected = true;
		return;
	}
	if (state.eventSource) {
		state.eventSource.close();
	}

	const eventSource = new EventSource(endpoint);

	eventSource.onopen = () => {
		state.connected = true;
		state.error = null;
	};

	eventSource.onerror = () => {
		state.connected = false;
		state.error = 'Connection to plugin server lost';
	};

	eventSource.onmessage = (event) => {
		try {
			const pluginEvent = JSON.parse(event.data) as PluginEvent;
			handleEvent(pluginEvent);
		} catch {
			console.error('Failed to parse plugin event');
		}
	};

	state.eventSource = eventSource;
}

/**
 * Disconnect from the event stream
 */
export function disconnect(): void {
	if (state.eventSource) {
		state.eventSource.close();
		state.eventSource = null;
	}
	state.connected = false;
}

/**
 * Handle incoming plugin events
 */
function handleEvent(event: PluginEvent): void {
	// Update proposal state based on event
	switch (event.type) {
		case 'created':
			// Proposal created - refresh list
			fetchProposals();
			break;

		case 'submitted':
		case 'review_started':
		case 'approved':
		case 'rejected':
		case 'testing_started':
		case 'deploying':
		case 'deployed':
		case 'rolled_back':
			// Status change - update the proposal
			updateProposalStatus(event.proposalId, event.type as PluginStatus);
			break;

		case 'vote_cast':
			// Vote received - could update UI to show vote progress
			break;

		case 'test_completed':
			// Test completed - could update test results display
			break;

		case 'rollout_step':
			// Rollout progress - could show progress bar
			break;
	}

	// Notify subscribed handlers
	const handlers = eventHandlers.get(event.type);
	if (handlers) {
		handlers.forEach((handler) => handler(event));
	}

	// Notify wildcard handlers
	const wildcardHandlers = eventHandlers.get('*');
	if (wildcardHandlers) {
		wildcardHandlers.forEach((handler) => handler(event));
	}
}

/**
 * Subscribe to plugin events
 */
export function onEvent(
	type: PluginEvent['type'] | '*',
	handler: (event: PluginEvent) => void
): () => void {
	if (!eventHandlers.has(type)) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- internal non-reactive handler bucket, not UI state
		eventHandlers.set(type, new Set());
	}
	eventHandlers.get(type)!.add(handler);

	return () => {
		eventHandlers.get(type)?.delete(handler);
	};
}

/**
 * Fetch all proposals from the server
 */
export async function fetchProposals(): Promise<void> {
	if (demoOffline) {
		state.loadingProposals = false;
		return;
	}
	state.loadingProposals = true;
	state.error = null;

	try {
		const response = await fetch('/api/plugins/proposals');
		if (!response.ok) throw new Error(`Failed to fetch proposals: ${response.status}`);

		const data = await response.json();
		state.proposals = data.proposals ?? [];
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to fetch proposals';
	} finally {
		state.loadingProposals = false;
	}
}

/**
 * Create a new plugin proposal
 */
export async function createProposal(
	proposal: Omit<PluginProposal, 'id' | 'version' | 'status' | 'votes' | 'issues' | 'createdAt' | 'updatedAt'>
): Promise<string | null> {
	state.error = null;

	try {
		const response = await fetch('/api/plugins/proposals', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(proposal)
		});

		if (!response.ok) throw new Error(`Failed to create proposal: ${response.status}`);

		const data = await response.json();
		state.proposals = [...state.proposals, data];
		return data.id;
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to create proposal';
		return null;
	}
}

/**
 * Submit a proposal for review
 */
export async function submitProposal(proposalId: string): Promise<boolean> {
	state.error = null;

	try {
		const response = await fetch(`/api/plugins/proposals/${proposalId}/submit`, {
			method: 'POST'
		});

		if (!response.ok) throw new Error(`Failed to submit proposal: ${response.status}`);

		updateProposalStatus(proposalId, 'submitted');
		return true;
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to submit proposal';
		return false;
	}
}

/**
 * Update local proposal status
 */
function updateProposalStatus(proposalId: string, status: PluginStatus | string): void {
	// Map event types to status if needed
	const statusMap: Record<string, PluginStatus> = {
		review_started: 'reviewing',
		testing_started: 'testing'
	};

	const newStatus = (statusMap[status] ?? status) as PluginStatus;

	state.proposals = state.proposals.map((p) =>
		p.id === proposalId ? { ...p, status: newStatus, updatedAt: new Date() } : p
	);
}

/**
 * Load and activate a deployed plugin
 */
export async function loadPlugin(proposalId: string): Promise<boolean> {
	const proposal = state.proposals.find((p) => p.id === proposalId);
	if (!proposal || proposal.status !== 'deployed') {
		state.error = 'Plugin must be deployed before loading';
		return false;
	}

	state.loadingInstance = proposalId;
	state.error = null;

	try {
		// For SSR-rendered components, fetch the component from the server
		if (proposal.implementation.type === 'component' && proposal.implementation.componentPath) {
			const response = await fetch(
				`/api/plugins/plugins/${proposalId}/component?path=${encodeURIComponent(proposal.implementation.componentPath)}`
			);
			if (!response.ok) throw new Error('Failed to load plugin component');

			// The server renders the component and returns it
			// (server-side rendering performed by the plugin host)
		}

		// Create plugin instance
		const instance: PluginInstance = {
			id: proposalId,
			manifest: proposalToManifest(proposal),
			status: 'active'
		};

		state.instances.set(proposalId, instance);

		// Register contributions
		registerContributions(proposalId, proposal);

		return true;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Failed to load plugin';
		state.error = errorMessage;

		state.instances.set(proposalId, {
			id: proposalId,
			manifest: proposalToManifest(proposal),
			status: 'error',
			error: errorMessage
		});

		return false;
	} finally {
		state.loadingInstance = null;
	}
}

/**
 * Unload a plugin
 */
export function unloadPlugin(proposalId: string): void {
	const instance = state.instances.get(proposalId);
	if (!instance) return;

	// Call dispose if available
	instance.dispose?.();

	// Unregister contributions
	unregisterContributions(proposalId);

	state.instances.delete(proposalId);
}

/**
 * Convert proposal to manifest format
 */
function proposalToManifest(proposal: PluginProposal): PluginManifest {
	return {
		name: proposal.name,
		version: `${proposal.version}.0.0`,
		description: proposal.description,
		author: proposal.author,
		category: proposal.category,
		tags: proposal.tags,
		permissions: proposal.implementation.permissions
	};
}

/**
 * Register plugin contributions (commands, panels, etc.)
 */
function registerContributions(_pluginId: string, _proposal: PluginProposal): void {
	// This would parse the plugin and register its contributions
	// For now, we'll just note that this is where dynamic registration happens
}

/**
 * Unregister plugin contributions
 */
function unregisterContributions(pluginId: string): void {
	// Remove commands registered by this plugin
	for (const [id] of state.commands) {
		if (id.startsWith(`${pluginId}:`)) {
			state.commands.delete(id);
		}
	}

	// Remove panels registered by this plugin
	for (const [id] of state.panels) {
		if (id.startsWith(`${pluginId}:`)) {
			state.panels.delete(id);
		}
	}
}

/**
 * Register a command from a plugin
 */
export function registerCommand(pluginId: string, command: PluginCommand): void {
	const fullId = `${pluginId}:${command.id}`;
	state.commands.set(fullId, { ...command, id: fullId });
}

/**
 * Register a panel from a plugin
 */
export function registerPanel(pluginId: string, panel: PluginPanel): void {
	const fullId = `${pluginId}:${panel.id}`;
	state.panels.set(fullId, { ...panel, id: fullId });
}

/**
 * Execute a command
 */
export async function executeCommand(commandId: string): Promise<void> {
	const command = state.commands.get(commandId);
	if (!command) {
		state.error = `Command not found: ${commandId}`;
		return;
	}

	try {
		await command.handler();
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Command execution failed';
	}
}

/**
 * Get a proposal by ID
 */
export function getProposal(proposalId: string): PluginProposal | undefined {
	return state.proposals.find((p) => p.id === proposalId);
}

/**
 * Get an instance by ID
 */
export function getInstance(pluginId: string): PluginInstance | undefined {
	return state.instances.get(pluginId);
}

/**
 * Clear error state
 */
export function clearError(): void {
	state.error = null;
}
