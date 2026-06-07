/**
 * Ghost Pair Integration
 *
 * Connects the AI Awareness system with the application's agent system.
 * Provides utilities to translate agent state to AI awareness for
 * real-time visualization in the editor.
 */

import {
	type AIAwareness,
	type AIAttentionType,
	type AIFocusRegion,
	type AICursor,
	createAIAwareness,
	getAgentColor,
	getAIAwarenessManager,
	AIAwarenessManager
} from './ai-awareness';
import type { Position, Selection } from './state';

/**
 * Agent task phase mapping to AI attention type
 */
const PHASE_TO_ATTENTION: Record<string, AIAttentionType> = {
	planning: 'thinking',
	implementing: 'writing',
	testing: 'reviewing',
	reviewing: 'reviewing',
	complete: 'waiting',
	idle: 'waiting'
};

/**
 * Minimal agent interface for integration
 * This should match the Agent type from your types
 */
export interface GhostPairAgent {
	id: string;
	name: string;
	status: 'online' | 'busy' | 'offline';
	currentTask?: {
		description?: string;
		files?: string[];
		progress?: {
			phase?: string;
			percentage?: number;
		};
	};
}

/**
 * File context for an agent
 */
export interface AgentFileContext {
	/** Current file path the agent is working on */
	filePath: string;
	/** Current cursor position */
	position?: Position;
	/** Current selection */
	selection?: Selection;
	/** Lines the agent is focused on */
	focusLines?: { start: number; end: number; intensity?: number }[];
	/** Activity description */
	activity?: string;
}

/**
 * Ghost Pair Controller
 *
 * Manages the connection between application agents and editor visualization.
 */
export class GhostPairController {
	private manager: AIAwarenessManager;
	private agentContexts: Map<string, AgentFileContext> = new Map();
	private currentFilePath: string = '';

	constructor(manager?: AIAwarenessManager) {
		this.manager = manager ?? getAIAwarenessManager();
	}

	/**
	 * Set the current file being edited
	 */
	setCurrentFile(filePath: string): void {
		this.currentFilePath = filePath;
		this.refreshVisibleAgents();
	}

	/**
	 * Register or update an agent
	 */
	updateAgent(agent: GhostPairAgent, context?: AgentFileContext): void {
		if (context) {
			this.agentContexts.set(agent.id, context);
		}

		// Only create awareness for agents working on the current file
		const agentContext = this.agentContexts.get(agent.id);
		const isWorkingOnCurrentFile =
			agentContext?.filePath === this.currentFilePath ||
			agent.currentTask?.files?.includes(this.currentFilePath);

		if (!isWorkingOnCurrentFile && agent.status !== 'busy') {
			// Remove agent if not relevant to current file
			this.manager.removeAgent(agent.id);
			return;
		}

		// Determine attention type from task phase
		const phase = agent.currentTask?.progress?.phase ?? 'idle';
		const attentionType: AIAttentionType = PHASE_TO_ATTENTION[phase] ?? 'reading';

		// Build cursor if position is available
		let cursor: AICursor | null = null;
		if (agentContext?.position) {
			cursor = {
				position: agentContext.position,
				selection: agentContext.selection,
				color: getAgentColor(agent.name),
				visible: true,
				animation: this.getAnimationFromAttention(attentionType)
			};
		}

		// Build focus regions
		const focusRegions: AIFocusRegion[] = [];
		if (agentContext?.focusLines) {
			for (const focus of agentContext.focusLines) {
				focusRegions.push({
					startLine: focus.start,
					endLine: focus.end,
					intensity: focus.intensity ?? 0.5,
					type: attentionType
				});
			}
		}

		// Create/update awareness
		const awareness = createAIAwareness(agent.id, agent.name, {
			attentionType,
			cursor,
			focusRegions,
			activity: agentContext?.activity ?? agent.currentTask?.description ?? '',
			confidence: (agent.currentTask?.progress?.percentage ?? 50) / 100,
			isActive: agent.status === 'busy' || agent.status === 'online'
		});

		this.manager.setAgent(awareness);
	}

	/**
	 * Update agent cursor position
	 */
	updateAgentCursor(agentId: string, position: Position, animation?: AICursor['animation']): void {
		const context = this.agentContexts.get(agentId);
		if (context) {
			context.position = position;
			this.agentContexts.set(agentId, context);
		}

		const agent = this.manager.getAgent(agentId);
		if (agent) {
			this.manager.updateCursor(agentId, {
				position,
				color: agent.color,
				visible: true,
				animation: animation ?? 'moving'
			});
		}
	}

	/**
	 * Update agent focus regions
	 */
	updateAgentFocus(agentId: string, focusLines: { start: number; end: number; intensity?: number }[]): void {
		const agent = this.manager.getAgent(agentId);
		if (!agent) return;

		const regions: AIFocusRegion[] = focusLines.map((focus) => ({
			startLine: focus.start,
			endLine: focus.end,
			intensity: focus.intensity ?? 0.5,
			type: agent.attentionType
		}));

		this.manager.updateFocusRegions(agentId, regions);
	}

	/**
	 * Remove an agent
	 */
	removeAgent(agentId: string): void {
		this.agentContexts.delete(agentId);
		this.manager.removeAgent(agentId);
	}

	/**
	 * Get agents visible in the current file
	 */
	getVisibleAgents(): AIAwareness[] {
		return this.manager.getActiveAgents();
	}

	/**
	 * Subscribe to awareness changes
	 */
	onChange(callback: (agents: Map<string, AIAwareness>) => void): () => void {
		return this.manager.onChange(callback);
	}

	/**
	 * Clear all agents
	 */
	clear(): void {
		this.agentContexts.clear();
		this.manager.clear();
	}

	/**
	 * Refresh visibility based on current file
	 */
	private refreshVisibleAgents(): void {
		for (const [agentId, context] of this.agentContexts) {
			if (context.filePath !== this.currentFilePath) {
				this.manager.removeAgent(agentId);
			}
		}
	}

	/**
	 * Get cursor animation from attention type
	 */
	private getAnimationFromAttention(type: AIAttentionType): AICursor['animation'] {
		switch (type) {
			case 'writing':
				return 'typing';
			case 'thinking':
				return 'thinking';
			case 'reading':
			case 'reviewing':
				return 'moving';
			default:
				return 'idle';
		}
	}
}

/**
 * Singleton controller
 */
let defaultController: GhostPairController | null = null;

export function getGhostPairController(): GhostPairController {
	if (!defaultController) {
		defaultController = new GhostPairController();
	}
	return defaultController;
}

/**
 * Create a new controller instance
 */
export function createGhostPairController(manager?: AIAwarenessManager): GhostPairController {
	return new GhostPairController(manager);
}

/**
 * Hook-style helper for Svelte components
 *
 * Usage in a Svelte component:
 * ```svelte
 * <script>
 *   import { useGhostPair } from './core/ghost-pair';
 *
 *   let { agents } = useGhostPair(filePath);
 * </script>
 *
 * <CustomEditor aiAgents={agents} ... />
 * ```
 */
export function useGhostPair(
	filePath: string,
	applicationAgents: GhostPairAgent[] = []
): { agents: AIAwareness[] } {
	const controller = getGhostPairController();
	controller.setCurrentFile(filePath);

	// Update agents
	for (const agent of applicationAgents) {
		if (agent.status !== 'offline') {
			controller.updateAgent(agent);
		}
	}

	return {
		agents: controller.getVisibleAgents()
	};
}
