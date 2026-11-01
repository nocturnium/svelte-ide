/**
 * AI store using Svelte 5 runes
 * Manages AI conversations, messages, and tools
 *
 * Note: Svelte 5 modules cannot directly export $derived values.
 * We use getter functions to expose reactive derived state.
 */

import { SvelteMap } from 'svelte/reactivity';
import type {
	AIMessage,
	AIConversation,
	AIContext,
	AITool,
	AIPanelConfig,
	AIEditSession,
	AISuggestion
} from '$types';

interface AIState {
	conversations: AIConversation[];
	activeConversationId: string | null;
	tools: Map<string, AITool>;
	config: AIPanelConfig;
	editSessions: AIEditSession[];
	suggestions: AISuggestion[];
	isStreaming: boolean;
	isPanelOpen: boolean;
	error: string | null;
}

// Default configuration
const defaultConfig: AIPanelConfig = {
	endpoint: '/api/chat',
	model: 'nocturnium-demo-mock',
	systemPrompt: 'You are a helpful coding assistant integrated into an IDE.',
	tools: [],
	maxTokens: 4096,
	temperature: 0.7,
	streaming: true
};

// Reactive state
const state = $state<AIState>({
	conversations: [],
	activeConversationId: null,
	tools: new SvelteMap(),
	config: { ...defaultConfig },
	editSessions: [],
	suggestions: [],
	isStreaming: false,
	isPanelOpen: false,
	error: null
});

/** Abort controller for the in-flight sendMessage request, if any. */
let streamController: AbortController | null = null;

// Getter functions for derived values (Svelte 5 module-safe)
export function getConversations(): AIConversation[] {
	return state.conversations;
}

export function getActiveConversationId(): string | null {
	return state.activeConversationId;
}

export function getActiveConversation(): AIConversation | null {
	return state.conversations.find((c) => c.id === state.activeConversationId) ?? null;
}

export function getMessages(): AIMessage[] {
	const active = getActiveConversation();
	return active?.messages ?? [];
}

export function getTools(): AITool[] {
	return Array.from(state.tools.values());
}

export function getConfig(): AIPanelConfig {
	return state.config;
}

export function getEditSessions(): AIEditSession[] {
	return state.editSessions;
}

export function getActiveEditSessions(): AIEditSession[] {
	return state.editSessions.filter((s) => s.status === 'editing');
}

export function getSuggestions(): AISuggestion[] {
	return state.suggestions;
}

export function getIsStreaming(): boolean {
	return state.isStreaming;
}

export function getIsPanelOpen(): boolean {
	return state.isPanelOpen;
}

export function getError(): string | null {
	return state.error;
}

// Legacy aliases for backward compatibility
export const conversations = {
	get current() {
		return getConversations();
	}
};
export const activeConversationId = {
	get current() {
		return getActiveConversationId();
	}
};
export const activeConversation = {
	get current() {
		return getActiveConversation();
	}
};
export const messages = {
	get current() {
		return getMessages();
	}
};
export const tools = {
	get current() {
		return getTools();
	}
};
export const config = {
	get current() {
		return getConfig();
	}
};
export const editSessions = {
	get current() {
		return getEditSessions();
	}
};
export const activeEditSessions = {
	get current() {
		return getActiveEditSessions();
	}
};
export const suggestions = {
	get current() {
		return getSuggestions();
	}
};
export const isStreaming = {
	get current() {
		return getIsStreaming();
	}
};
export const isPanelOpen = {
	get current() {
		return getIsPanelOpen();
	}
};
export const error = {
	get current() {
		return getError();
	}
};

/**
 * Create a new conversation
 */
export function createConversation(title?: string, context?: AIContext): string {
	const id = crypto.randomUUID();
	const conversation: AIConversation = {
		id,
		title: title ?? 'New conversation',
		messages: [],
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- timestamp snapshot stored on a plain AIConversation object; type expects Date, not SvelteDate
		createdAt: new Date(),
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- timestamp snapshot stored on a plain AIConversation object; type expects Date, not SvelteDate
		updatedAt: new Date(),
		context
	};

	state.conversations = [...state.conversations, conversation];
	state.activeConversationId = id;
	return id;
}

/**
 * Set active conversation
 */
export function setActiveConversation(conversationId: string | null): void {
	if (conversationId === null || state.conversations.some((c) => c.id === conversationId)) {
		state.activeConversationId = conversationId;
	}
}

/**
 * Delete a conversation
 */
export function deleteConversation(conversationId: string): void {
	state.conversations = state.conversations.filter((c) => c.id !== conversationId);
	if (state.activeConversationId === conversationId) {
		state.activeConversationId = state.conversations[0]?.id ?? null;
	}
}

/**
 * Add a message to the active conversation
 */
export function addMessage(message: Omit<AIMessage, 'id' | 'timestamp'>): string {
	if (!state.activeConversationId) {
		createConversation();
	}

	return addMessageTo(state.activeConversationId!, message);
}

/**
 * Add a message to a specific conversation, regardless of which one is active.
 */
function addMessageTo(
	conversationId: string,
	message: Omit<AIMessage, 'id' | 'timestamp'>
): string {
	const id = crypto.randomUUID();
	const newMessage: AIMessage = {
		...message,
		id,
		timestamp: new Date()
	};

	state.conversations = state.conversations.map((c) =>
		c.id === conversationId
			? { ...c, messages: [...c.messages, newMessage], updatedAt: new Date() }
			: c
	);

	return id;
}

/**
 * Update a message (for streaming)
 */
export function updateMessage(messageId: string, updates: Partial<AIMessage>): void {
	if (!state.activeConversationId) return;
	updateMessageIn(state.activeConversationId, messageId, updates);
}

/**
 * Update a message in a specific conversation, regardless of which one is active.
 */
function updateMessageIn(
	conversationId: string,
	messageId: string,
	updates: Partial<AIMessage>
): void {
	state.conversations = state.conversations.map((c) =>
		c.id === conversationId
			? {
					...c,
					messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
					updatedAt: new Date()
				}
			: c
	);
}

/**
 * Stop the in-flight response, keeping whatever has streamed so far.
 * The assistant message is finalised (isStreaming false) and no error is reported.
 */
export function cancelStreaming(): void {
	streamController?.abort();
}

/**
 * Send a user message and get AI response
 *
 * The reply is written to the conversation that was active when the message was sent,
 * even if the user switches conversations while it streams. Calls made while another
 * response is streaming are ignored.
 */
export async function sendMessage(content: string, context?: AIContext): Promise<void> {
	if (!content.trim()) return;
	if (streamController) return;

	if (!state.activeConversationId) {
		createConversation();
	}
	const conversationId = state.activeConversationId!;
	const controller = new AbortController();
	streamController = controller;

	// Add user message
	addMessageTo(conversationId, { role: 'user', content });

	// Create placeholder for assistant response
	const assistantId = addMessageTo(conversationId, {
		role: 'assistant',
		content: '',
		isStreaming: true
	});

	state.isStreaming = true;
	state.error = null;

	let fullContent = '';

	try {
		const activeConv = state.conversations.find((c) => c.id === conversationId);
		const response = await fetch(state.config.endpoint ?? '/api/chat', {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				...state.config.headers
			},
			body: JSON.stringify({
				messages: activeConv?.messages.slice(0, -1) ?? [],
				model: state.config.model,
				systemPrompt: state.config.systemPrompt,
				tools: Array.from(state.tools.values()).map((t) => ({
					name: t.name,
					description: t.description,
					parameters: t.parameters
				})),
				maxTokens: state.config.maxTokens,
				temperature: state.config.temperature,
				context: context ?? activeConv?.context
			})
		});

		if (!response.ok) {
			throw new Error(`API error: ${response.status}`);
		}

		if (state.config.streaming && response.body) {
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			// Wake a pending read() when the user cancels.
			controller.signal.addEventListener('abort', () => void reader.cancel().catch(() => {}), {
				once: true
			});

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				fullContent += decoder.decode(value, { stream: true });

				updateMessageIn(conversationId, assistantId, {
					content: fullContent,
					isStreaming: true
				});
			}

			fullContent += decoder.decode();
			updateMessageIn(conversationId, assistantId, {
				content: fullContent,
				isStreaming: false
			});
		} else {
			const data = await response.json();
			updateMessageIn(conversationId, assistantId, {
				content: data.content,
				toolCalls: data.toolCalls,
				isStreaming: false,
				metadata: data.metadata
			});

			// Handle tool calls
			if (data.toolCalls?.length) {
				for (const toolCall of data.toolCalls) {
					await executeToolCall(conversationId, toolCall.name, toolCall.arguments, toolCall.id);
				}
			}
		}
	} catch (err) {
		if (controller.signal.aborted) {
			updateMessageIn(conversationId, assistantId, {
				content: fullContent,
				isStreaming: false
			});
			return;
		}
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		state.error = errorMessage;
		updateMessageIn(conversationId, assistantId, {
			content: '',
			error: errorMessage,
			isStreaming: false
		});
	} finally {
		streamController = null;
		state.isStreaming = false;
	}
}

/**
 * Execute a tool call
 */
async function executeToolCall(
	conversationId: string,
	toolName: string,
	args: Record<string, unknown>,
	toolCallId: string
): Promise<void> {
	const tool = state.tools.get(toolName);
	if (!tool) {
		addMessageTo(conversationId, {
			role: 'tool',
			content: '',
			toolResult: {
				toolCallId,
				result: null,
				error: `Tool not found: ${toolName}`
			}
		});
		return;
	}

	try {
		const activeConv = state.conversations.find((c) => c.id === conversationId);
		const result = await tool.handler(args, activeConv?.context ?? {});
		addMessageTo(conversationId, {
			role: 'tool',
			content: '',
			toolResult: {
				toolCallId,
				result
			}
		});
	} catch (err) {
		addMessageTo(conversationId, {
			role: 'tool',
			content: '',
			toolResult: {
				toolCallId,
				result: null,
				error: err instanceof Error ? err.message : 'Tool execution failed'
			}
		});
	}
}

/**
 * Register a tool
 */
export function registerTool(tool: AITool): void {
	state.tools.set(tool.name, tool);
}

/**
 * Unregister a tool
 */
export function unregisterTool(toolName: string): void {
	state.tools.delete(toolName);
}

/**
 * Update AI configuration
 */
export function updateConfig(updates: Partial<AIPanelConfig>): void {
	state.config = { ...state.config, ...updates };
}

/**
 * Toggle AI panel visibility
 */
export function togglePanel(): void {
	state.isPanelOpen = !state.isPanelOpen;
}

/**
 * Open AI panel
 */
export function openPanel(): void {
	state.isPanelOpen = true;
}

/**
 * Close AI panel
 */
export function closePanel(): void {
	state.isPanelOpen = false;
}

/**
 * Start an AI edit session
 */
export function startEditSession(
	conversationId: string,
	filePath: string,
	originalContent: string
): string {
	const id = crypto.randomUUID();
	const session: AIEditSession = {
		id,
		conversationId,
		filePath,
		status: 'pending',
		originalContent,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- timestamp snapshot on plain AIEditSession object; type expects Date, not SvelteDate
		startedAt: new Date()
	};

	state.editSessions = [...state.editSessions, session];
	return id;
}

/**
 * Update edit session status
 */
export function updateEditSession(sessionId: string, updates: Partial<AIEditSession>): void {
	state.editSessions = state.editSessions.map((s) =>
		s.id === sessionId ? { ...s, ...updates } : s
	);
}

/**
 * Complete an edit session
 */
export function completeEditSession(
	sessionId: string,
	proposedContent: string,
	diff?: string
): void {
	state.editSessions = state.editSessions.map((s) =>
		s.id === sessionId
			? // eslint-disable-next-line svelte/prefer-svelte-reactivity -- timestamp snapshot on plain AIEditSession object; type expects Date, not SvelteDate
				{ ...s, status: 'reviewing', proposedContent, diff, completedAt: new Date() }
			: s
	);
}

/**
 * Apply or reject an edit session
 */
export function resolveEditSession(sessionId: string, apply: boolean): void {
	state.editSessions = state.editSessions.map((s) =>
		s.id === sessionId ? { ...s, status: apply ? 'applied' : 'rejected' } : s
	);
}

/**
 * Add a suggestion
 */
export function addSuggestion(suggestion: Omit<AISuggestion, 'id'>): string {
	const id = crypto.randomUUID();
	state.suggestions = [...state.suggestions, { ...suggestion, id }];
	return id;
}

/**
 * Remove a suggestion
 */
export function removeSuggestion(suggestionId: string): void {
	state.suggestions = state.suggestions.filter((s) => s.id !== suggestionId);
}

/**
 * Clear all suggestions
 */
export function clearSuggestions(): void {
	state.suggestions = [];
}

/**
 * Update conversation context
 */
export function updateContext(context: Partial<AIContext>): void {
	if (!state.activeConversationId) return;

	state.conversations = state.conversations.map((c) =>
		c.id === state.activeConversationId
			? // eslint-disable-next-line svelte/prefer-svelte-reactivity -- timestamp snapshot on plain AIConversation object; type expects Date, not SvelteDate
				{ ...c, context: { ...c.context, ...context }, updatedAt: new Date() }
			: c
	);
}

/**
 * Clear error state
 */
export function clearError(): void {
	state.error = null;
}
