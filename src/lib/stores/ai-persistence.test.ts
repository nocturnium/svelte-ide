import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIConversation } from '$types';
import * as persistence from './ai-persistence.svelte';

/**
 * AI Persistence store tests
 *
 * Tests the pure/synchronous functions (export formats, config, getters).
 * IndexedDB-dependent functions are tested with localStorage fallback
 * since IndexedDB is not available in the vitest environment.
 */

let uuidCounter = 0;
vi.stubGlobal('crypto', {
	randomUUID: () => `persist-uuid-${++uuidCounter}`
});

// Mock localStorage for the fallback path
const localStorageData: Record<string, string> = {};
vi.stubGlobal('localStorage', {
	getItem: (key: string) => localStorageData[key] ?? null,
	setItem: (key: string, value: string) => { localStorageData[key] = value; },
	removeItem: (key: string) => { delete localStorageData[key]; },
	clear: () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); }
});

beforeEach(() => {
	uuidCounter = 0;
	Object.keys(localStorageData).forEach(k => delete localStorageData[k]);
});

// ============================================================================
// Helpers
// ============================================================================

function makeConversation(overrides: Partial<AIConversation> = {}): AIConversation {
	return {
		id: `conv-${++uuidCounter}`,
		title: 'Test Conversation',
		messages: [
			{
				id: 'msg-1',
				role: 'user',
				content: 'Hello AI',
				timestamp: new Date('2025-01-01T10:00:00Z')
			},
			{
				id: 'msg-2',
				role: 'assistant',
				content: 'Hello! How can I help?',
				timestamp: new Date('2025-01-01T10:00:05Z')
			}
		],
		createdAt: new Date('2025-01-01T10:00:00Z'),
		updatedAt: new Date('2025-01-01T10:05:00Z'),
		...overrides
	};
}

// ============================================================================
// Export JSON
// ============================================================================

describe('ai-persistence — exportConversationJSON', () => {
	it('returns valid JSON string', () => {
		const conv = makeConversation();
		const json = persistence.exportConversationJSON(conv);
		const parsed = JSON.parse(json);
		expect(parsed.title).toBe('Test Conversation');
		expect(parsed.messages).toHaveLength(2);
	});

	it('output is pretty-printed with 2-space indent', () => {
		const conv = makeConversation();
		const json = persistence.exportConversationJSON(conv);
		expect(json).toContain('\n');
		expect(json).toContain('  ');
	});
});

// ============================================================================
// Export Markdown
// ============================================================================

describe('ai-persistence — exportConversationMarkdown', () => {
	it('starts with title header', () => {
		const conv = makeConversation({ title: 'My Chat' });
		const md = persistence.exportConversationMarkdown(conv);
		expect(md.startsWith('# My Chat')).toBe(true);
	});

	it('includes user and assistant messages', () => {
		const conv = makeConversation();
		const md = persistence.exportConversationMarkdown(conv);
		expect(md).toContain('## You');
		expect(md).toContain('## AI');
		expect(md).toContain('Hello AI');
		expect(md).toContain('Hello! How can I help?');
	});

	it('includes tool calls when present', () => {
		const conv = makeConversation({
			messages: [
				{
					id: 'msg-1',
					role: 'assistant',
					content: 'Let me check...',
					timestamp: new Date(),
					toolCalls: [
						{ id: 'tc-1', name: 'read_file', arguments: { path: '/src/a.ts' } }
					]
				}
			]
		});
		const md = persistence.exportConversationMarkdown(conv);
		expect(md).toContain('### Tool Calls');
		expect(md).toContain('read_file');
	});

	it('includes Created and Updated timestamps', () => {
		const conv = makeConversation();
		const md = persistence.exportConversationMarkdown(conv);
		expect(md).toContain('*Created:');
		expect(md).toContain('*Updated:');
	});
});

// ============================================================================
// Getters
// ============================================================================

describe('ai-persistence — getters', () => {
	it('getConfig returns default config', () => {
		const cfg = persistence.getConfig();
		expect(cfg.dbName).toBe('svelte-ide-ai');
		expect(cfg.storeName).toBe('conversations');
		expect(cfg.maxConversations).toBe(100);
		expect(cfg.autoSave).toBe(true);
	});

	it('getError returns null initially', () => {
		expect(persistence.getError()).toBe(null);
	});
});

// ============================================================================
// localStorage fallback path (IndexedDB not available in vitest)
// ============================================================================

describe('ai-persistence — localStorage fallback', () => {
	it('saveConversation and loadConversations round-trip', async () => {
		// Initialize without IndexedDB — should fall back to localStorage
		await persistence.initPersistence();
		expect(persistence.isInitialized()).toBe(true);

		const conv = makeConversation({ id: 'test-conv-1' });
		await persistence.saveConversation(conv);

		const loaded = await persistence.loadConversations();
		expect(loaded.some(c => c.id === 'test-conv-1')).toBe(true);
	});

	it('loadConversation by id', async () => {
		await persistence.initPersistence();
		const conv = makeConversation({ id: 'lookup-conv' });
		await persistence.saveConversation(conv);

		const found = await persistence.loadConversation('lookup-conv');
		expect(found?.id).toBe('lookup-conv');
	});

	it('loadConversation returns null for unknown id', async () => {
		await persistence.initPersistence();
		const found = await persistence.loadConversation('nonexistent');
		expect(found).toBe(null);
	});

	it('deleteConversation removes a conversation', async () => {
		await persistence.initPersistence();
		const conv = makeConversation({ id: 'to-delete' });
		await persistence.saveConversation(conv);
		await persistence.deleteConversation('to-delete');

		const found = await persistence.loadConversation('to-delete');
		expect(found).toBe(null);
	});

	it('clearAllConversations removes all', async () => {
		await persistence.initPersistence();
		await persistence.saveConversation(makeConversation({ id: 'c1' }));
		await persistence.saveConversation(makeConversation({ id: 'c2' }));
		await persistence.clearAllConversations();

		const all = await persistence.loadConversations();
		expect(all).toHaveLength(0);
	});

	it('searchConversations finds by title', async () => {
		await persistence.initPersistence();
		await persistence.saveConversation(makeConversation({ id: 'c1', title: 'React Hooks' }));
		await persistence.saveConversation(makeConversation({ id: 'c2', title: 'Svelte Stores' }));

		const results = await persistence.searchConversations('react');
		expect(results).toHaveLength(1);
		expect(results[0].title).toBe('React Hooks');
	});

	it('searchConversations finds by message content', async () => {
		await persistence.initPersistence();
		await persistence.saveConversation(makeConversation({
			id: 'c1',
			title: 'Chat',
			messages: [{ id: 'm1', role: 'user', content: 'how to use useState', timestamp: new Date() }]
		}));

		const results = await persistence.searchConversations('useState');
		expect(results).toHaveLength(1);
	});

	it('toggleStarConversation stars a conversation', async () => {
		await persistence.initPersistence();
		await persistence.saveConversation(makeConversation({ id: 'star-me' }));
		await persistence.toggleStarConversation('star-me', true);

		const starred = await persistence.getStarredConversations();
		expect(starred.some(c => c.id === 'star-me')).toBe(true);
	});

	it('importConversationJSON imports valid JSON', async () => {
		await persistence.initPersistence();
		const conv = makeConversation({ id: 'original-id', title: 'Imported Chat' });
		const json = JSON.stringify(conv);

		const imported = await persistence.importConversationJSON(json);
		expect(imported).not.toBe(null);
		// ID should be regenerated
		expect(imported?.id).not.toBe('original-id');
		expect(imported?.title).toBe('Imported Chat');
	});

	it('importConversationJSON returns null for invalid JSON', async () => {
		await persistence.initPersistence();
		const result = await persistence.importConversationJSON('not valid json');
		expect(result).toBe(null);
	});

	it('importConversationJSON returns null for missing required fields', async () => {
		await persistence.initPersistence();
		const result = await persistence.importConversationJSON(JSON.stringify({ foo: 'bar' }));
		expect(result).toBe(null);
	});
});

// ============================================================================
// Prune
// ============================================================================

describe('ai-persistence — pruneOldConversations', () => {
	it('returns 0 when under limit', async () => {
		await persistence.initPersistence();
		await persistence.saveConversation(makeConversation({ id: 'c1' }));
		const pruned = await persistence.pruneOldConversations();
		expect(pruned).toBe(0);
	});
});

// ============================================================================
// Init idempotency
// ============================================================================

describe('ai-persistence — initPersistence', () => {
	it('returns true on repeated init', async () => {
		const first = await persistence.initPersistence();
		const second = await persistence.initPersistence();
		expect(first).toBe(true);
		expect(second).toBe(true);
	});
});
