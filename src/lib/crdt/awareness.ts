/**
 * Awareness protocol for cursor and selection sync
 */

import { Awareness } from 'y-protocols/awareness';
import type { Doc as YDoc } from 'yjs';
import type { AwarenessState } from './types';

export interface AwarenessUser {
	id: string;
	name: string;
	color: string;
	isAI?: boolean;
}

export interface AwarenessProtocol {
	awareness: Awareness;
	setUser(user: AwarenessUser): void;
	setCursor(anchor: number, head: number): void;
	setSelection(anchor: number, head: number): void;
	setViewingFile(path: string | undefined): void;
	setEditingFile(path: string | undefined): void;
	setState(state: 'active' | 'idle' | 'away'): void;
	getUsers(): AwarenessUser[];
	getCursors(): Map<number, { user: AwarenessUser; cursor: { anchor: number; head: number } }>;
	onUsersChange(callback: (users: AwarenessUser[]) => void): () => void;
	destroy(): void;
}

export interface CreateAwarenessProtocolOptions {
	destroyAwareness?: boolean;
}

/**
 * Create an awareness protocol instance.
 *
 * Pass a provider-owned Awareness instance to broadcast presence through that
 * provider. Passing a Y.Doc creates a standalone Awareness instance.
 */
export function createAwarenessProtocol(
	source: YDoc | Awareness,
	options: CreateAwarenessProtocolOptions = {}
): AwarenessProtocol {
	const ownsAwareness = source instanceof Awareness;
	const awareness = ownsAwareness ? source : new Awareness(source);
	const shouldDestroyAwareness = options.destroyAwareness ?? !ownsAwareness;
	const userChangeCallbacks = new Set<(users: AwarenessUser[]) => void>();

	// Track awareness changes
	awareness.on('change', () => {
		const users = getUsers();
		userChangeCallbacks.forEach((cb) => cb(users));
	});

	function getLocalState(): AwarenessState | null {
		return awareness.getLocalState() as AwarenessState | null;
	}

	function setLocalState(updates: Partial<AwarenessState>): void {
		const current = getLocalState();
		awareness.setLocalState({
			...current,
			...updates
		});
	}

	function getUsers(): AwarenessUser[] {
		const states = awareness.getStates() as Map<number, AwarenessState>;
		const users: AwarenessUser[] = [];

		states.forEach((state) => {
			if (state.user) {
				users.push(state.user);
			}
		});

		return users;
	}

	function getCursors(): Map<
		number,
		{ user: AwarenessUser; cursor: { anchor: number; head: number } }
	> {
		const states = awareness.getStates() as Map<number, AwarenessState>;
		const cursors = new Map<
			number,
			{ user: AwarenessUser; cursor: { anchor: number; head: number } }
		>();

		states.forEach((state, clientId) => {
			if (state.user && state.cursor) {
				cursors.set(clientId, {
					user: state.user,
					cursor: state.cursor
				});
			}
		});

		return cursors;
	}

	return {
		awareness,

		setUser(user: AwarenessUser): void {
			setLocalState({ user, state: 'active' });
		},

		setCursor(anchor: number, head: number): void {
			setLocalState({ cursor: { anchor, head } });
		},

		setSelection(anchor: number, head: number): void {
			setLocalState({ selection: { anchor, head } });
		},

		setViewingFile(path: string | undefined): void {
			setLocalState({ viewingFile: path });
		},

		setEditingFile(path: string | undefined): void {
			setLocalState({ editingFile: path });
		},

		setState(state: 'active' | 'idle' | 'away'): void {
			setLocalState({ state });
		},

		getUsers,
		getCursors,

		onUsersChange(callback: (users: AwarenessUser[]) => void): () => void {
			userChangeCallbacks.add(callback);
			// Immediately call with current users
			callback(getUsers());
			return () => userChangeCallbacks.delete(callback);
		},

		destroy(): void {
			if (shouldDestroyAwareness) {
				awareness.destroy();
			}
			userChangeCallbacks.clear();
		}
	};
}

/**
 * Generate a random color for a user
 */
export function generateUserColor(): string {
	const colors = [
		'#60a5fa', // blue
		'#a78bfa', // purple
		'#4ade80', // green
		'#f472b6', // pink
		'#facc15', // yellow
		'#fb923c', // orange
		'#22d3ee', // cyan
		'#e879f9' // fuchsia
	];
	return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Generate initials from a name
 */
export function getInitials(name: string): string {
	return name
		.split(' ')
		.map((part) => part[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
}
