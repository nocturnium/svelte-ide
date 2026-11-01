import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIContext, AISuggestion } from '$types';
import * as ai from './ai.svelte';

/**
 * AI store tests
 *
 * Covers conversation management, message handling, tool registration,
 * configuration, edit sessions, suggestions, and panel state.
 *
 * Note: sendMessage is async and hits a fetch endpoint, so it is tested
 * separately with fetch mocking.
 */

let uuidCounter = 0;
vi.stubGlobal('crypto', {
	randomUUID: () => `ai-uuid-${++uuidCounter}`
});

function resetStore() {
	// Delete all conversations
	for (const c of ai.getConversations()) {
		ai.deleteConversation(c.id);
	}
	// Unregister tools
	for (const t of ai.getTools()) {
		ai.unregisterTool(t.name);
	}
	// Clear suggestions
	ai.clearSuggestions();
	// Close panel
	ai.closePanel();
	// Clear error
	ai.clearError();
	// Resolve all edit sessions to clear them from active state
	// Note: There is no clearEditSessions API, so sessions accumulate across tests.
	// We resolve them to remove them from getActiveEditSessions() results.
	for (const s of ai.getEditSessions()) {
		if (s.status !== 'applied' && s.status !== 'rejected') {
			ai.resolveEditSession(s.id, false);
		}
	}
}

beforeEach(() => {
	uuidCounter = 0;
	resetStore();
});

// ============================================================================
// Default state
// ============================================================================

describe('ai store — default state', () => {
	it('has no conversations', () => {
		expect(ai.getConversations()).toEqual([]);
	});

	it('has no active conversation', () => {
		expect(ai.getActiveConversationId()).toBe(null);
		expect(ai.getActiveConversation()).toBe(null);
	});

	it('has empty messages', () => {
		expect(ai.getMessages()).toEqual([]);
	});

	it('has no tools', () => {
		expect(ai.getTools()).toEqual([]);
	});

	it('panel is closed', () => {
		expect(ai.getIsPanelOpen()).toBe(false);
	});

	it('is not streaming', () => {
		expect(ai.getIsStreaming()).toBe(false);
	});

	it('has no error', () => {
		expect(ai.getError()).toBe(null);
	});

	it('has no suggestions', () => {
		expect(ai.getSuggestions()).toEqual([]);
	});

	it('has no edit sessions', () => {
		expect(ai.getEditSessions()).toEqual([]);
	});
});

// ============================================================================
// Conversation management
// ============================================================================

describe('ai store — conversations', () => {
	it('createConversation creates and activates a new conversation', () => {
		const id = ai.createConversation('Test Conv');
		expect(id).toBe('ai-uuid-1');
		expect(ai.getConversations()).toHaveLength(1);
		expect(ai.getActiveConversationId()).toBe(id);
		expect(ai.getActiveConversation()?.title).toBe('Test Conv');
	});

	it('createConversation uses default title', () => {
		ai.createConversation();
		expect(ai.getActiveConversation()?.title).toBe('New conversation');
	});

	it('createConversation accepts context', () => {
		ai.createConversation('With Context', { currentFile: '/src/a.ts' } as unknown as AIContext);
		expect(ai.getActiveConversation()?.context).toEqual({ currentFile: '/src/a.ts' });
	});

	it('setActiveConversation switches conversations', () => {
		const id1 = ai.createConversation('First');
		const _id2 = ai.createConversation('Second');
		ai.setActiveConversation(id1);
		expect(ai.getActiveConversationId()).toBe(id1);
	});

	it('setActiveConversation ignores invalid id', () => {
		const id = ai.createConversation('Test');
		ai.setActiveConversation('invalid');
		expect(ai.getActiveConversationId()).toBe(id);
	});

	it('setActiveConversation accepts null', () => {
		ai.createConversation('Test');
		ai.setActiveConversation(null);
		expect(ai.getActiveConversationId()).toBe(null);
	});

	it('deleteConversation removes the conversation', () => {
		const id = ai.createConversation('ToDelete');
		ai.deleteConversation(id);
		expect(ai.getConversations()).toHaveLength(0);
	});

	it('deleteConversation moves active to first remaining', () => {
		const id1 = ai.createConversation('First');
		const id2 = ai.createConversation('Second');
		ai.deleteConversation(id2);
		expect(ai.getActiveConversationId()).toBe(id1);
	});

	it('deleteConversation sets active to null when last is deleted', () => {
		const id = ai.createConversation('Only');
		ai.deleteConversation(id);
		expect(ai.getActiveConversationId()).toBe(null);
	});
});

// ============================================================================
// Message management
// ============================================================================

describe('ai store — messages', () => {
	it('addMessage adds to active conversation', () => {
		ai.createConversation('Test');
		const msgId = ai.addMessage({ role: 'user', content: 'Hello' });
		expect(msgId).toBe('ai-uuid-2');
		const msgs = ai.getMessages();
		expect(msgs).toHaveLength(1);
		expect(msgs[0].role).toBe('user');
		expect(msgs[0].content).toBe('Hello');
	});

	it('addMessage creates conversation if none active', () => {
		const _msgId = ai.addMessage({ role: 'user', content: 'Auto create' });
		expect(ai.getConversations()).toHaveLength(1);
		expect(ai.getMessages()).toHaveLength(1);
	});

	it('addMessage assigns id and timestamp', () => {
		ai.createConversation();
		ai.addMessage({ role: 'user', content: 'test' });
		const msg = ai.getMessages()[0];
		expect(msg.id).toBeDefined();
		expect(msg.timestamp).toBeInstanceOf(Date);
	});

	it('updateMessage modifies existing message', () => {
		ai.createConversation();
		const msgId = ai.addMessage({ role: 'assistant', content: 'partial' });
		ai.updateMessage(msgId, { content: 'full response' });
		expect(ai.getMessages()[0].content).toBe('full response');
	});
});

// ============================================================================
// Tool registration
// ============================================================================

describe('ai store — tools', () => {
	it('registerTool adds a tool', () => {
		ai.registerTool({
			name: 'read_file',
			description: 'Read a file',
			parameters: { type: 'object', properties: {} },
			handler: async () => 'content'
		});
		expect(ai.getTools()).toHaveLength(1);
		expect(ai.getTools()[0].name).toBe('read_file');
	});

	it('unregisterTool removes a tool', () => {
		ai.registerTool({
			name: 'to_remove',
			description: 'Temp',
			parameters: { type: 'object', properties: {} },
			handler: async () => null
		});
		ai.unregisterTool('to_remove');
		expect(ai.getTools()).toHaveLength(0);
	});
});

// ============================================================================
// Configuration
// ============================================================================

describe('ai store — config', () => {
	it('default config has expected values', () => {
		const cfg = ai.getConfig();
		expect(cfg.endpoint).toBe('/api/chat');
		expect(cfg.model).toBe('nocturnium-demo-mock');
		expect(cfg.streaming).toBe(true);
	});

	it('updateConfig merges updates', () => {
		ai.updateConfig({ model: 'gpt-4', temperature: 0.3 });
		const cfg = ai.getConfig();
		expect(cfg.model).toBe('gpt-4');
		expect(cfg.temperature).toBe(0.3);
		// Others unchanged
		expect(cfg.streaming).toBe(true);
	});
});

// ============================================================================
// Panel toggle
// ============================================================================

describe('ai store — panel', () => {
	it('togglePanel opens a closed panel', () => {
		ai.togglePanel();
		expect(ai.getIsPanelOpen()).toBe(true);
	});

	it('togglePanel closes an open panel', () => {
		ai.openPanel();
		ai.togglePanel();
		expect(ai.getIsPanelOpen()).toBe(false);
	});

	it('openPanel / closePanel work correctly', () => {
		ai.openPanel();
		expect(ai.getIsPanelOpen()).toBe(true);
		ai.closePanel();
		expect(ai.getIsPanelOpen()).toBe(false);
	});
});

// ============================================================================
// Edit sessions
// ============================================================================

describe('ai store — edit sessions', () => {
	it('startEditSession creates a pending session', () => {
		const _id = ai.startEditSession('conv-1', '/src/file.ts', 'original');
		expect(ai.getEditSessions()).toHaveLength(1);
		expect(ai.getEditSessions()[0].status).toBe('pending');
		expect(ai.getEditSessions()[0].filePath).toBe('/src/file.ts');
	});

	it('updateEditSession modifies session', () => {
		const id = ai.startEditSession('conv-1', '/src/file.ts', 'original');
		ai.updateEditSession(id, { status: 'editing' });
		expect(ai.getEditSessions()[0].status).toBe('editing');
	});

	it('getActiveEditSessions returns only sessions with editing status', () => {
		const id1 = ai.startEditSession('conv-1', '/src/a.ts', 'a');
		const id2 = ai.startEditSession('conv-1', '/src/b.ts', 'b');
		ai.updateEditSession(id1, { status: 'editing' });
		// id2 remains 'pending', id1 is 'editing'
		const activeSessions = ai.getActiveEditSessions();
		expect(activeSessions.some((s) => s.id === id1)).toBe(true);
		expect(activeSessions.some((s) => s.id === id2)).toBe(false);
		// Verify the filter logic: all returned sessions have 'editing' status
		expect(activeSessions.every((s) => s.status === 'editing')).toBe(true);
	});

	it('completeEditSession sets reviewing status with proposed content', () => {
		const id = ai.startEditSession('conv-1', '/src/file.ts', 'original');
		ai.completeEditSession(id, 'new content', 'diff here');
		const session = ai.getEditSessions()[0];
		expect(session.status).toBe('reviewing');
		expect(session.proposedContent).toBe('new content');
		expect(session.diff).toBe('diff here');
	});

	it('resolveEditSession applies or rejects', () => {
		const id = ai.startEditSession('conv-1', '/src/file.ts', 'original');
		ai.completeEditSession(id, 'proposed');
		ai.resolveEditSession(id, true);
		expect(ai.getEditSessions()[0].status).toBe('applied');

		const id2 = ai.startEditSession('conv-1', '/src/b.ts', 'orig');
		ai.completeEditSession(id2, 'proposed2');
		ai.resolveEditSession(id2, false);
		expect(ai.getEditSessions().find((s) => s.id === id2)?.status).toBe('rejected');
	});
});

// ============================================================================
// Suggestions
// ============================================================================

describe('ai store — suggestions', () => {
	it('addSuggestion adds and returns id', () => {
		const id = ai.addSuggestion({
			type: 'completion',
			content: 'suggested code',
			filePath: '/src/a.ts'
		} as unknown as Omit<AISuggestion, 'id'>);
		expect(ai.getSuggestions()).toHaveLength(1);
		expect(ai.getSuggestions()[0].id).toBe(id);
	});

	it('removeSuggestion removes by id', () => {
		const id = ai.addSuggestion({ type: 'completion', content: 'x' } as Omit<AISuggestion, 'id'>);
		ai.removeSuggestion(id);
		expect(ai.getSuggestions()).toHaveLength(0);
	});

	it('clearSuggestions removes all', () => {
		ai.addSuggestion({ type: 'completion', content: 'a' } as Omit<AISuggestion, 'id'>);
		ai.addSuggestion({ type: 'completion', content: 'b' } as Omit<AISuggestion, 'id'>);
		ai.clearSuggestions();
		expect(ai.getSuggestions()).toHaveLength(0);
	});
});

// ============================================================================
// Context updates
// ============================================================================

describe('ai store — context', () => {
	it('updateContext merges context on active conversation', () => {
		ai.createConversation('Test', { currentFile: '/a.ts' } as unknown as AIContext);
		ai.updateContext({ currentFile: '/b.ts' } as unknown as Partial<AIContext>);
		expect(ai.getActiveConversation()?.context).toMatchObject({ currentFile: '/b.ts' });
	});

	it('updateContext does nothing without active conversation', () => {
		// Should not throw
		ai.updateContext({ currentFile: '/a.ts' } as unknown as Partial<AIContext>);
	});
});

// ============================================================================
// Error handling
// ============================================================================

describe('ai store — error', () => {
	it('clearError resets error state', () => {
		// Force an error state via updateConfig or similar mechanism
		// The error is set internally by sendMessage; we test clearError directly
		ai.clearError();
		expect(ai.getError()).toBe(null);
	});
});

// ============================================================================
// sendMessage streaming (review round 1: E12, E13)
// ============================================================================

describe('ai store — sendMessage streaming', () => {
	function streamOf(parts: Uint8Array[], gate?: Promise<void>, gateAfter = parts.length) {
		return new ReadableStream<Uint8Array>({
			async start(controller) {
				for (let i = 0; i < parts.length; i++) {
					if (gate && i === gateAfter) await gate;
					controller.enqueue(parts[i]);
				}
				controller.close();
			}
		});
	}

	function mockFetch(body: ReadableStream<Uint8Array>) {
		const fn = vi.fn(async () => new Response(body, { status: 200 }));
		vi.stubGlobal('fetch', fn);
		return fn;
	}

	const tick = () => new Promise((r) => setTimeout(r, 10));

	it('decodes multi-byte characters split across chunks (E12)', async () => {
		const bytes = new TextEncoder().encode('h\u00e9llo \u{1F600} \u4e16\u754c');
		// Splits inside the e-acute, the emoji and the CJK characters.
		mockFetch(
			streamOf([bytes.slice(0, 2), bytes.slice(2, 8), bytes.slice(8, 12), bytes.slice(12)])
		);
		ai.createConversation();
		await ai.sendMessage('hi');

		const reply = ai.getMessages().at(-1)!;
		expect(reply.content).toBe('h\u00e9llo \u{1F600} \u4e16\u754c');
		expect(reply.content).not.toContain('\ufffd');
		expect(reply.isStreaming).toBe(false);
	});

	it('writes the reply to the original conversation when the user switches mid-stream (E13)', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const enc = new TextEncoder();
		mockFetch(streamOf([enc.encode('part1 '), enc.encode('part2')], gate, 1));

		const first = ai.createConversation('first');
		const pending = ai.sendMessage('question');
		await tick();
		const second = ai.createConversation('second');
		release();
		await pending;

		const convs = ai.getConversations();
		const firstMsgs = convs.find((c) => c.id === first)!.messages;
		expect(firstMsgs.map((m) => m.role)).toEqual(['user', 'assistant']);
		expect(firstMsgs[1].content).toBe('part1 part2');
		expect(firstMsgs[1].isStreaming).toBe(false);
		expect(convs.find((c) => c.id === second)!.messages).toEqual([]);
		expect(ai.getIsStreaming()).toBe(false);
	});

	it('ignores sendMessage while a response is streaming', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const enc = new TextEncoder();
		const fetchMock = mockFetch(streamOf([enc.encode('a'), enc.encode('b')], gate, 1));

		ai.createConversation();
		const pending = ai.sendMessage('one');
		await tick();
		await ai.sendMessage('two');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		release();
		await pending;

		const msgs = ai.getMessages();
		expect(msgs.map((m) => m.content)).toEqual(['one', 'ab']);
	});

	it('cancelStreaming keeps partial content and finalises the message', async () => {
		const enc = new TextEncoder();
		const gate = new Promise<void>(() => {}); // never released
		mockFetch(streamOf([enc.encode('partial'), enc.encode('never')], gate, 1));

		ai.createConversation();
		const pending = ai.sendMessage('go');
		await tick();
		expect(ai.getIsStreaming()).toBe(true);
		expect(ai.getMessages().at(-1)!.content).toBe('partial');

		ai.cancelStreaming();
		await pending;

		const reply = ai.getMessages().at(-1)!;
		expect(reply.content).toBe('partial');
		expect(reply.isStreaming).toBe(false);
		expect(reply.error).toBeUndefined();
		expect(ai.getIsStreaming()).toBe(false);
		expect(ai.getError()).toBe(null);
	});

	it('allows a new message after a cancelled one', async () => {
		const enc = new TextEncoder();
		mockFetch(streamOf([enc.encode('x'), enc.encode('y')], new Promise<void>(() => {}), 1));
		ai.createConversation();
		const pending = ai.sendMessage('one');
		await tick();
		ai.cancelStreaming();
		await pending;

		mockFetch(streamOf([enc.encode('done')]));
		await ai.sendMessage('two');
		expect(ai.getMessages().at(-1)!.content).toBe('done');
	});

	it('cancelStreaming with nothing in flight is a no-op', () => {
		expect(() => ai.cancelStreaming()).not.toThrow();
	});
});
