/**
 * AI Persistence Store
 *
 * Handles saving and loading AI conversations to IndexedDB/localStorage
 */

import type { AIConversation } from '$types';

// Configuration
interface PersistenceConfig {
	dbName: string;
	storeName: string;
	version: number;
	maxConversations: number;
	autoSave: boolean;
	autoSaveDebounceMs: number;
}

const DEFAULT_CONFIG: PersistenceConfig = {
	dbName: 'svelte-ide-ai',
	storeName: 'conversations',
	version: 1,
	maxConversations: 100,
	autoSave: true,
	autoSaveDebounceMs: 1000
};

// Internal plumbing — intentionally NOT reactive ($state). These are written
// synchronously inside initPersistence(); if they were reactive, any $effect that
// transitively calls saveConversation() (e.g. AIPanel's auto-save) would read and
// then write them in the same tick, looping until effect_update_depth_exceeded.
// They are surfaced only through the plain getters below, never read reactively.
let config: PersistenceConfig = { ...DEFAULT_CONFIG };
let db: IDBDatabase | null = null;
let initialized = false;
let error: string | null = null;

// Debounce timer for auto-save
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize the persistence layer
 */
export async function initPersistence(options?: Partial<PersistenceConfig>): Promise<boolean> {
	if (initialized) return true;

	config = { ...DEFAULT_CONFIG, ...options };

	try {
		// Check if IndexedDB is available
		if (!('indexedDB' in globalThis)) {
			console.warn('IndexedDB not available, using localStorage fallback');
			initialized = true;
			return true;
		}

		db = await openDatabase();
		initialized = true;
		error = null;
		return true;
	} catch (err) {
		error = err instanceof Error ? err.message : 'Failed to initialize persistence';
		console.error('Persistence init error:', err);
		return false;
	}
}

/**
 * Open IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(config.dbName, config.version);

		request.onerror = () => reject(request.error);

		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const database = (event.target as IDBOpenDBRequest).result;

			// Create conversations store
			if (!database.objectStoreNames.contains(config.storeName)) {
				const store = database.createObjectStore(config.storeName, { keyPath: 'id' });
				store.createIndex('updatedAt', 'updatedAt', { unique: false });
				store.createIndex('starred', 'starred', { unique: false });
			}
		};
	});
}

/**
 * Save a conversation
 */
export async function saveConversation(
	conversation: AIConversation & { starred?: boolean }
): Promise<void> {
	if (!initialized) await initPersistence();

	const data = {
		...conversation,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain persistence object, not reactive UI state
		updatedAt: new Date()
	};

	if (db) {
		// IndexedDB
		return new Promise((resolve, reject) => {
			const transaction = db!.transaction(config.storeName, 'readwrite');
			const store = transaction.objectStore(config.storeName);
			const request = store.put(data);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} else {
		// localStorage fallback
		const conversations = getLocalStorageConversations();
		const index = conversations.findIndex((c) => c.id === conversation.id);
		if (index >= 0) {
			conversations[index] = data;
		} else {
			conversations.push(data);
		}
		setLocalStorageConversations(conversations);
	}
}

/**
 * Auto-save with debounce
 */
export function autoSaveConversation(conversation: AIConversation & { starred?: boolean }): void {
	if (!config.autoSave) return;

	if (saveTimer) {
		clearTimeout(saveTimer);
	}

	saveTimer = setTimeout(() => {
		saveConversation(conversation);
		saveTimer = null;
	}, config.autoSaveDebounceMs);
}

/**
 * Load all conversations
 */
export async function loadConversations(): Promise<AIConversation[]> {
	if (!initialized) await initPersistence();

	if (db) {
		// IndexedDB
		return new Promise((resolve, reject) => {
			const transaction = db!.transaction(config.storeName, 'readonly');
			const store = transaction.objectStore(config.storeName);
			const request = store.getAll();

			request.onsuccess = () => {
				const conversations = request.result as AIConversation[];
				// Sort by updatedAt descending
				conversations.sort((a, b) => {
					// eslint-disable-next-line svelte/prefer-svelte-reactivity -- temporary sort comparison values, not reactive state
					const dateA = new Date(a.updatedAt).getTime();
					// eslint-disable-next-line svelte/prefer-svelte-reactivity -- temporary sort comparison values, not reactive state
					const dateB = new Date(b.updatedAt).getTime();
					return dateB - dateA;
				});
				resolve(conversations);
			};
			request.onerror = () => reject(request.error);
		});
	} else {
		// localStorage fallback
		return getLocalStorageConversations();
	}
}

/**
 * Load a single conversation by ID
 */
export async function loadConversation(id: string): Promise<AIConversation | null> {
	if (!initialized) await initPersistence();

	if (db) {
		return new Promise((resolve, reject) => {
			const transaction = db!.transaction(config.storeName, 'readonly');
			const store = transaction.objectStore(config.storeName);
			const request = store.get(id);

			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	} else {
		const conversations = getLocalStorageConversations();
		return conversations.find((c) => c.id === id) || null;
	}
}

/**
 * Delete a conversation
 */
export async function deleteConversation(id: string): Promise<void> {
	if (!initialized) await initPersistence();

	if (db) {
		return new Promise((resolve, reject) => {
			const transaction = db!.transaction(config.storeName, 'readwrite');
			const store = transaction.objectStore(config.storeName);
			const request = store.delete(id);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} else {
		const conversations = getLocalStorageConversations();
		const filtered = conversations.filter((c) => c.id !== id);
		setLocalStorageConversations(filtered);
	}
}

/**
 * Delete all conversations
 */
export async function clearAllConversations(): Promise<void> {
	if (!initialized) await initPersistence();

	if (db) {
		return new Promise((resolve, reject) => {
			const transaction = db!.transaction(config.storeName, 'readwrite');
			const store = transaction.objectStore(config.storeName);
			const request = store.clear();

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} else {
		setLocalStorageConversations([]);
	}
}

/**
 * Search conversations
 */
export async function searchConversations(query: string): Promise<AIConversation[]> {
	const conversations = await loadConversations();
	const lowerQuery = query.toLowerCase();

	return conversations.filter((conv) => {
		// Search in title
		if (conv.title.toLowerCase().includes(lowerQuery)) return true;

		// Search in messages
		return conv.messages.some((msg) => msg.content.toLowerCase().includes(lowerQuery));
	});
}

/**
 * Get starred conversations
 */
export async function getStarredConversations(): Promise<AIConversation[]> {
	const conversations = await loadConversations();
	return conversations.filter((c) => (c as AIConversation & { starred?: boolean }).starred);
}

/**
 * Star/unstar a conversation
 */
export async function toggleStarConversation(id: string, starred: boolean): Promise<void> {
	const conversation = await loadConversation(id);
	if (conversation) {
		await saveConversation({ ...conversation, starred });
	}
}

/**
 * Export conversation to JSON
 */
export function exportConversationJSON(conversation: AIConversation): string {
	return JSON.stringify(conversation, null, 2);
}

/**
 * Export conversation to Markdown
 */
export function exportConversationMarkdown(conversation: AIConversation): string {
	const lines: string[] = [
		`# ${conversation.title}`,
		'',
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient formatting value in a pure export function, not reactive state
		`*Created: ${new Date(conversation.createdAt).toLocaleString()}*`,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient formatting value in a pure export function, not reactive state
		`*Updated: ${new Date(conversation.updatedAt).toLocaleString()}*`,
		'',
		'---',
		''
	];

	for (const message of conversation.messages) {
		const role =
			message.role === 'user' ? 'You' : message.role === 'assistant' ? 'AI' : message.role;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient formatting value in a pure export function, not reactive state
		const time = new Date(message.timestamp).toLocaleTimeString();

		lines.push(`## ${role} *${time}*`);
		lines.push('');
		lines.push(message.content);
		lines.push('');

		if (message.toolCalls && message.toolCalls.length > 0) {
			lines.push('### Tool Calls');
			for (const tool of message.toolCalls) {
				lines.push(`- **${tool.name}**: \`${JSON.stringify(tool.arguments)}\``);
			}
			lines.push('');
		}
	}

	return lines.join('\n');
}

/**
 * Import conversation from JSON
 */
export async function importConversationJSON(json: string): Promise<AIConversation | null> {
	try {
		const conversation = JSON.parse(json) as AIConversation;

		// Validate required fields
		if (!conversation.id || !conversation.title || !Array.isArray(conversation.messages)) {
			throw new Error('Invalid conversation format');
		}

		// Generate new ID to avoid conflicts
		conversation.id = crypto.randomUUID();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain object property assignment during import, not reactive state
		conversation.createdAt = new Date();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain object property assignment during import, not reactive state
		conversation.updatedAt = new Date();

		await saveConversation(conversation);
		return conversation;
	} catch (err) {
		console.error('Failed to import conversation:', err);
		return null;
	}
}

/**
 * Prune old conversations to stay under max limit
 */
export async function pruneOldConversations(): Promise<number> {
	const conversations = await loadConversations();

	if (conversations.length <= config.maxConversations) {
		return 0;
	}

	// Sort by updatedAt and keep starred ones
	const toDelete = conversations
		.filter((c) => !(c as AIConversation & { starred?: boolean }).starred)
		.slice(config.maxConversations);

	for (const conv of toDelete) {
		await deleteConversation(conv.id);
	}

	return toDelete.length;
}

// localStorage helpers
function getLocalStorageConversations(): AIConversation[] {
	try {
		const data = localStorage.getItem('ai-conversations');
		return data ? JSON.parse(data) : [];
	} catch {
		return [];
	}
}

function setLocalStorageConversations(conversations: AIConversation[]): void {
	try {
		localStorage.setItem('ai-conversations', JSON.stringify(conversations));
	} catch (err) {
		console.error('Failed to save to localStorage:', err);
	}
}

// Accessors for the internal (non-reactive) persistence state. These return the
// current value; they are not reactive sources — read them imperatively.
export function isInitialized(): boolean {
	return initialized;
}

export function getError(): string | null {
	return error;
}

export function getConfig(): PersistenceConfig {
	return config;
}
