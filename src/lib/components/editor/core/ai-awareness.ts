/**
 * AI Awareness System
 *
 * Tracks AI agent focus, attention, and activity within the editor.
 * Enables "Ghost Pair" visualization - showing developers where
 * AI agents are "looking" and what they're considering.
 *
 * Based on CRDT awareness patterns for real-time collaboration.
 */

import type { Position, Selection } from './state';

/**
 * Types of AI attention/activity
 */
export type AIAttentionType =
	| 'reading' // AI is reading/analyzing code
	| 'thinking' // AI is processing/planning
	| 'writing' // AI is actively generating code
	| 'reviewing' // AI is reviewing changes
	| 'waiting'; // AI is waiting for input

/**
 * AI focus region - where the AI is paying attention
 */
export interface AIFocusRegion {
	/** Start line (0-based) */
	startLine: number;
	/** End line (0-based) */
	endLine: number;
	/** Start column (0-based, optional for line-based focus) */
	startColumn?: number;
	/** End column (0-based, optional for line-based focus) */
	endColumn?: number;
	/** Attention intensity (0-1, used for glow effects) */
	intensity: number;
	/** Type of attention */
	type: AIAttentionType;
	/** Optional label for the region */
	label?: string;
}

/**
 * AI cursor position - the AI's "virtual cursor"
 */
export interface AICursor {
	/** Current position */
	position: Position;
	/** Optional selection range */
	selection?: Selection;
	/** Cursor color (hex) */
	color: string;
	/** Whether cursor is visible */
	visible: boolean;
	/** Animation state */
	animation: 'idle' | 'moving' | 'typing' | 'thinking';
}

/**
 * AI agent awareness state
 */
export interface AIAwareness {
	/** Unique agent ID */
	agentId: string;
	/** Agent display name */
	agentName: string;
	/** Agent color for visualization */
	color: string;
	/** Current attention type */
	attentionType: AIAttentionType;
	/** AI cursor position */
	cursor: AICursor | null;
	/** Regions the AI is focused on */
	focusRegions: AIFocusRegion[];
	/** Current activity description */
	activity: string;
	/** Confidence level (0-1) for current action */
	confidence: number;
	/** Timestamp of last update */
	lastUpdate: number;
	/** Whether the agent is actively engaged with this file */
	isActive: boolean;
}

/**
 * Event types for AI awareness changes
 */
export type AIAwarenessEventType =
	| 'cursor-move'
	| 'focus-change'
	| 'attention-change'
	| 'activity-change'
	| 'agent-join'
	| 'agent-leave';

/**
 * AI awareness event
 */
export interface AIAwarenessEvent {
	type: AIAwarenessEventType;
	agentId: string;
	timestamp: number;
	data?: unknown;
}

/**
 * Callback type for awareness changes
 */
export type AIAwarenessCallback = (agents: Map<string, AIAwareness>) => void;

/**
 * AI Awareness Manager
 *
 * Manages AI agent presence and focus within the editor.
 * Supports multiple concurrent AI agents.
 */
export class AIAwarenessManager {
	private agents: Map<string, AIAwareness> = new Map();
	private listeners: Set<AIAwarenessCallback> = new Set();
	private eventHistory: AIAwarenessEvent[] = [];
	private maxHistorySize = 100;

	/**
	 * Register or update an AI agent
	 */
	setAgent(awareness: AIAwareness): void {
		const existing = this.agents.get(awareness.agentId);
		this.agents.set(awareness.agentId, {
			...awareness,
			lastUpdate: Date.now()
		});

		const eventType: AIAwarenessEventType = existing ? 'activity-change' : 'agent-join';
		this.recordEvent(eventType, awareness.agentId);
		this.notifyListeners();
	}

	/**
	 * Remove an AI agent
	 */
	removeAgent(agentId: string): void {
		if (this.agents.has(agentId)) {
			this.agents.delete(agentId);
			this.recordEvent('agent-leave', agentId);
			this.notifyListeners();
		}
	}

	/**
	 * Update AI cursor position
	 */
	updateCursor(agentId: string, cursor: AICursor): void {
		const agent = this.agents.get(agentId);
		if (agent) {
			agent.cursor = cursor;
			agent.lastUpdate = Date.now();
			this.recordEvent('cursor-move', agentId, { position: cursor.position });
			this.notifyListeners();
		}
	}

	/**
	 * Update AI focus regions
	 */
	updateFocusRegions(agentId: string, regions: AIFocusRegion[]): void {
		const agent = this.agents.get(agentId);
		if (agent) {
			agent.focusRegions = regions;
			agent.lastUpdate = Date.now();
			this.recordEvent('focus-change', agentId, { regionCount: regions.length });
			this.notifyListeners();
		}
	}

	/**
	 * Update AI attention type
	 */
	updateAttention(agentId: string, type: AIAttentionType, activity?: string): void {
		const agent = this.agents.get(agentId);
		if (agent) {
			agent.attentionType = type;
			if (activity !== undefined) {
				agent.activity = activity;
			}
			agent.lastUpdate = Date.now();
			this.recordEvent('attention-change', agentId, { type, activity });
			this.notifyListeners();
		}
	}

	/**
	 * Get all active AI agents
	 */
	getAgents(): Map<string, AIAwareness> {
		return new Map(this.agents);
	}

	/**
	 * Get a specific agent
	 */
	getAgent(agentId: string): AIAwareness | undefined {
		return this.agents.get(agentId);
	}

	/**
	 * Get active agents (updated within last 30 seconds)
	 */
	getActiveAgents(): AIAwareness[] {
		const now = Date.now();
		const staleThreshold = 30000; // 30 seconds

		return Array.from(this.agents.values()).filter(
			(agent) => agent.isActive && now - agent.lastUpdate < staleThreshold
		);
	}

	/**
	 * Subscribe to awareness changes
	 */
	onChange(callback: AIAwarenessCallback): () => void {
		this.listeners.add(callback);
		return () => {
			this.listeners.delete(callback);
		};
	}

	/**
	 * Get recent events
	 */
	getRecentEvents(count: number = 10): AIAwarenessEvent[] {
		return this.eventHistory.slice(-count);
	}

	/**
	 * Clear all agents
	 */
	clear(): void {
		this.agents.clear();
		this.eventHistory = [];
		this.notifyListeners();
	}

	/**
	 * Record an event
	 */
	private recordEvent(type: AIAwarenessEventType, agentId: string, data?: unknown): void {
		this.eventHistory.push({
			type,
			agentId,
			timestamp: Date.now(),
			data
		});

		// Trim history
		if (this.eventHistory.length > this.maxHistorySize) {
			this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
		}
	}

	/**
	 * Notify all listeners
	 */
	private notifyListeners(): void {
		const snapshot = this.getAgents();
		for (const callback of this.listeners) {
			try {
				callback(snapshot);
			} catch (error) {
				console.error('[AIAwarenessManager] Listener error:', error);
			}
		}
	}
}

/**
 * Default AI agent colors
 */
export const AI_AGENT_COLORS = {
	claude: '#8B5CF6', // Purple (Anthropic brand)
	assistant: '#3B82F6', // Blue
	copilot: '#22C55E', // Green
	default: '#F59E0B' // Amber
};

/**
 * Get color for AI agent
 */
export function getAgentColor(agentName: string): string {
	const normalized = agentName.toLowerCase();
	if (normalized.includes('claude')) return AI_AGENT_COLORS.claude;
	if (normalized.includes('copilot')) return AI_AGENT_COLORS.copilot;
	if (normalized.includes('assistant')) return AI_AGENT_COLORS.assistant;
	return AI_AGENT_COLORS.default;
}

/**
 * Create a new AI awareness state
 */
export function createAIAwareness(
	agentId: string,
	agentName: string,
	options: Partial<Omit<AIAwareness, 'agentId' | 'agentName'>> = {}
): AIAwareness {
	return {
		agentId,
		agentName,
		color: options.color ?? getAgentColor(agentName),
		attentionType: options.attentionType ?? 'reading',
		cursor: options.cursor ?? null,
		focusRegions: options.focusRegions ?? [],
		activity: options.activity ?? '',
		confidence: options.confidence ?? 0.5,
		lastUpdate: Date.now(),
		isActive: options.isActive ?? true
	};
}

/**
 * Singleton instance
 */
let defaultManager: AIAwarenessManager | null = null;

export function getAIAwarenessManager(): AIAwarenessManager {
	if (!defaultManager) {
		defaultManager = new AIAwarenessManager();
	}
	return defaultManager;
}

/**
 * Create a new manager instance
 */
export function createAIAwarenessManager(): AIAwarenessManager {
	return new AIAwarenessManager();
}
