/**
 * AI Assistant type definitions
 */

export type AIRole = 'user' | 'assistant' | 'system' | 'tool';

export interface AIMessage {
	id: string;
	role: AIRole;
	content: string;
	timestamp: Date;
	/** Tool calls made by the assistant */
	toolCalls?: AIToolCall[];
	/** Result from a tool execution */
	toolResult?: AIToolResult;
	/** Streaming state */
	isStreaming?: boolean;
	/** Error if message failed */
	error?: string;
	/** Metadata like tokens used */
	metadata?: AIMessageMetadata;
}

export interface AIToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export interface AIToolResult {
	toolCallId: string;
	result: unknown;
	error?: string;
}

export interface AIMessageMetadata {
	model?: string;
	tokensUsed?: number;
	latencyMs?: number;
	finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
}

export interface AIConversation {
	id: string;
	title: string;
	messages: AIMessage[];
	createdAt: Date;
	updatedAt: Date;
	/** Context attached to this conversation */
	context?: AIContext;
}

export interface AIContext {
	/** Currently open files */
	openFiles?: string[];
	/** Selected text from editor */
	selection?: {
		path: string;
		content: string;
		startLine: number;
		endLine: number;
	};
	/** Workspace metadata */
	workspace?: {
		id: string;
		name: string;
		rootPath: string;
	};
	/** Custom context from plugins */
	custom?: Record<string, unknown>;
}

/**
 * AI Tool definition for registration
 */
export interface AITool {
	name: string;
	description: string;
	parameters: AIToolParameters;
	handler: AIToolHandler;
}

export interface AIToolParameters {
	type: 'object';
	properties: Record<string, AIToolProperty>;
	required?: string[];
}

export interface AIToolProperty {
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	description?: string;
	enum?: string[];
	items?: AIToolProperty;
	properties?: Record<string, AIToolProperty>;
}

export type AIToolHandler = (
	args: Record<string, unknown>,
	context: AIContext
) => Promise<unknown>;

/**
 * AI Panel configuration
 */
export interface AIPanelConfig {
	/** API endpoint for chat */
	endpoint?: string;
	/** Model to use */
	model?: string;
	/** System prompt */
	systemPrompt?: string;
	/** Available tools */
	tools?: AITool[];
	/** Max tokens for response */
	maxTokens?: number;
	/** Temperature for response */
	temperature?: number;
	/** Enable streaming responses */
	streaming?: boolean;
	/** Custom headers for API requests */
	headers?: Record<string, string>;
}

/**
 * AI Suggestion for code completion or inline hints
 */
export interface AISuggestion {
	id: string;
	type: 'completion' | 'refactor' | 'fix' | 'explain';
	content: string;
	description?: string;
	range?: {
		startLine: number;
		startColumn: number;
		endLine: number;
		endColumn: number;
	};
	confidence?: number;
}

/**
 * AI editing session for collaborative editing
 */
export interface AIEditSession {
	id: string;
	conversationId: string;
	filePath: string;
	status: 'pending' | 'editing' | 'reviewing' | 'applied' | 'rejected';
	originalContent: string;
	proposedContent?: string;
	diff?: string;
	startedAt: Date;
	completedAt?: Date;
}
