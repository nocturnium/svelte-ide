/**
 * WebSocket provider for Yjs collaboration
 * Handles connection, sync, and reconnection
 */

import { WebsocketProvider } from 'y-websocket';
import type { Doc as YDoc } from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { ProviderOptions, ConnectionStatus, AwarenessState } from './types';

export class CollaborativeProvider {
	readonly provider: WebsocketProvider;
	readonly awareness: Awareness;
	private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
	private syncListeners: Set<(synced: boolean) => void> = new Set();

	constructor(options: ProviderOptions) {
		// Create awareness if not provided
		this.awareness = options.awareness ?? new Awareness(options.doc);

		// Create WebSocket provider
		this.provider = new WebsocketProvider(options.serverUrl, options.roomId, options.doc, {
			awareness: this.awareness,
			params: options.params,
			connect: options.connect ?? true,
			resyncInterval: options.resyncInterval ?? 30000,
			maxBackoffTime: options.maxBackoffTime ?? 10000
		});

		// Setup event forwarding
		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.provider.on('status', ({ status }: { status: string }) => {
			const mappedStatus = status as ConnectionStatus;
			this.statusListeners.forEach((listener) => listener(mappedStatus));
		});

		this.provider.on('sync', (synced: boolean) => {
			this.syncListeners.forEach((listener) => listener(synced));
		});
	}

	/**
	 * Get current connection status
	 */
	get status(): ConnectionStatus {
		if (this.provider.wsconnected) return 'connected';
		if (this.provider.wsconnecting) return 'connecting';
		return 'disconnected';
	}

	/**
	 * Check if synced with server
	 */
	get synced(): boolean {
		return this.provider.synced;
	}

	/**
	 * Connect to the server
	 */
	connect(): void {
		this.provider.connect();
	}

	/**
	 * Disconnect from the server
	 */
	disconnect(): void {
		this.provider.disconnect();
	}

	/**
	 * Set local awareness state
	 */
	setLocalState(state: Partial<AwarenessState>): void {
		const currentState = this.awareness.getLocalState() as AwarenessState | null;
		this.awareness.setLocalState({
			...currentState,
			...state
		});
	}

	/**
	 * Get local awareness state
	 */
	getLocalState(): AwarenessState | null {
		return this.awareness.getLocalState() as AwarenessState | null;
	}

	/**
	 * Get all awareness states
	 */
	getStates(): Map<number, AwarenessState> {
		return this.awareness.getStates() as Map<number, AwarenessState>;
	}

	/**
	 * Get awareness state for a specific client
	 */
	getState(clientId: number): AwarenessState | undefined {
		return this.getStates().get(clientId);
	}

	/**
	 * Subscribe to connection status changes
	 */
	onStatus(callback: (status: ConnectionStatus) => void): () => void {
		this.statusListeners.add(callback);
		return () => this.statusListeners.delete(callback);
	}

	/**
	 * Subscribe to sync state changes
	 */
	onSync(callback: (synced: boolean) => void): () => void {
		this.syncListeners.add(callback);
		return () => this.syncListeners.delete(callback);
	}

	/**
	 * Subscribe to awareness changes
	 */
	onAwarenessChange(
		callback: (
			changes: { added: number[]; updated: number[]; removed: number[] },
			origin: string
		) => void
	): () => void {
		this.awareness.on('change', callback);
		return () => this.awareness.off('change', callback);
	}

	/**
	 * Get all connected client IDs
	 */
	getClientIds(): number[] {
		return Array.from(this.getStates().keys());
	}

	/**
	 * Get the local client ID
	 */
	get clientId(): number {
		return this.awareness.clientID;
	}

	/**
	 * Destroy the provider
	 */
	destroy(): void {
		this.provider.destroy();
		this.awareness.destroy();
		this.statusListeners.clear();
		this.syncListeners.clear();
	}
}

/**
 * Create a provider with sensible defaults for IDE usage
 */
export function createProvider(
	doc: YDoc,
	serverUrl: string,
	roomId: string,
	user: { id: string; name: string; color: string; isAI?: boolean }
): CollaborativeProvider {
	const provider = new CollaborativeProvider({
		serverUrl,
		roomId,
		doc,
		connect: true
	});

	// Set initial awareness state
	provider.setLocalState({
		user,
		state: 'active'
	});

	return provider;
}
