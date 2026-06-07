/**
 * AI store using Svelte 5 runes
 * Manages AI conversations, messages, and tools
 *
 * Note: Svelte 5 modules cannot directly export $derived values.
 * We use getter functions to expose reactive derived state.
 */

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
	model: 'claude-3-5-sonnet',
	systemPrompt: 'You are a helpful coding assistant integrated into an IDE.',
	tools: [],
	maxTokens: 4096,
	temperature: 0.7,
	streaming: true
};

// Reactive state
let state = $state<AIState>({
	conversations: [],
	activeConversationId: null,
	tools: new Map(),
	config: { ...defaultConfig },
	editSessions: [],
	suggestions: [],
	isStreaming: false,
	isPanelOpen: false,
	error: null
});

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
export const conversations = { get current() { return getConversations(); } };
export const activeConversationId = { get current() { return getActiveConversationId(); } };
export const activeConversation = { get current() { return getActiveConversation(); } };
export const messages = { get current() { return getMessages(); } };
export const tools = { get current() { return getTools(); } };
export const config = { get current() { return getConfig(); } };
export const editSessions = { get current() { return getEditSessions(); } };
export const activeEditSessions = { get current() { return getActiveEditSessions(); } };
export const suggestions = { get current() { return getSuggestions(); } };
export const isStreaming = { get current() { return getIsStreaming(); } };
export const isPanelOpen = { get current() { return getIsPanelOpen(); } };
export const error = { get current() { return getError(); } };

/**
 * Create a new conversation
 */
export function createConversation(title?: string, context?: AIContext): string {
	const id = crypto.randomUUID();
	const conversation: AIConversation = {
		id,
		title: title ?? 'New conversation',
		messages: [],
		createdAt: new Date(),
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
export function addMessage(
	message: Omit<AIMessage, 'id' | 'timestamp'>
): string {
	if (!state.activeConversationId) {
		createConversation();
	}

	const id = crypto.randomUUID();
	const newMessage: AIMessage = {
		...message,
		id,
		timestamp: new Date()
	};

	state.conversations = state.conversations.map((c) =>
		c.id === state.activeConversationId
			? { ...c, messages: [...c.messages, newMessage], updatedAt: new Date() }
			: c
	);

	return id;
}

/**
 * Update a message (for streaming)
 */
export function updateMessage(messageId: string, updates: Partial<AIMessage>): void {
	state.conversations = state.conversations.map((c) =>
		c.id === state.activeConversationId
			? {
					...c,
					messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
					updatedAt: new Date()
				}
			: c
	);
}

/**
 * Send a user message and get AI response
 */
export async function sendMessage(content: string, context?: AIContext): Promise<void> {
	if (!content.trim()) return;

	// Add user message
	addMessage({ role: 'user', content });

	// Create placeholder for assistant response
	const assistantId = addMessage({
		role: 'assistant',
		content: '',
		isStreaming: true
	});

	state.isStreaming = true;
	state.error = null;

	try {
		const activeConv = getActiveConversation();
		const response = await fetch(state.config.endpoint ?? '/api/chat', {
			method: 'POST',
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
			let fullContent = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				fullContent += chunk;

				updateMessage(assistantId, {
					content: fullContent,
					isStreaming: true
				});
			}

			updateMessage(assistantId, {
				content: fullContent,
				isStreaming: false
			});
		} else {
			const data = await response.json();
			updateMessage(assistantId, {
				content: data.content,
				toolCalls: data.toolCalls,
				isStreaming: false,
				metadata: data.metadata
			});

			// Handle tool calls
			if (data.toolCalls?.length) {
				for (const toolCall of data.toolCalls) {
					await executeToolCall(toolCall.name, toolCall.arguments, toolCall.id);
				}
			}
		}
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		state.error = errorMessage;
		updateMessage(assistantId, {
			content: '',
			error: errorMessage,
			isStreaming: false
		});
	} finally {
		state.isStreaming = false;
	}
}

/**
 * Execute a tool call
 */
async function executeToolCall(
	toolName: string,
	args: Record<string, unknown>,
	toolCallId: string
): Promise<void> {
	const tool = state.tools.get(toolName);
	if (!tool) {
		addMessage({
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
		const activeConv = getActiveConversation();
		const result = await tool.handler(args, activeConv?.context ?? {});
		addMessage({
			role: 'tool',
			content: '',
			toolResult: {
				toolCallId,
				result
			}
		});
	} catch (err) {
		addMessage({
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
			? { ...s, status: 'reviewing', proposedContent, diff, completedAt: new Date() }
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
			? { ...c, context: { ...c.context, ...context }, updatedAt: new Date() }
			: c
	);
}

/**
 * Clear error state
 */
export function clearError(): void {
	state.error = null;
}
