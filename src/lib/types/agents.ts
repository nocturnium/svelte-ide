/**
 * Agent-related type definitions
 * For multi-agent coordination and presence/visibility in the editor
 */

import type { CursorPosition } from './editor';

// ============================================================================
// Agent Types
// ============================================================================

export type AgentStatus = 'online' | 'offline' | 'busy' | 'error' | 'stalled';

export type AgentType = 'coder' | 'reviewer' | 'tester' | 'architect' | 'coordinator';

export interface Agent {
	id: string;
	name: string;
	type: AgentType;
	status: AgentStatus;
	capabilities: AgentCapability[];
	currentTask?: AgentTask;
	workspaceId: string;
	joinedAt: string;
	lastActivity: string;
	avatar?: string;
	color?: string; // For UI differentiation (hex color)
}

export type AgentCapability =
	| 'code_generation'
	| 'code_review'
	| 'testing'
	| 'refactoring'
	| 'documentation'
	| 'architecture'
	| 'debugging';

// ============================================================================
// Task Types
// ============================================================================

export interface AgentTask {
	id: string;
	description: string;
	startedAt: string;
	estimatedDuration?: number; // Milliseconds
	progress: AgentProgress;
	files: string[]; // Files being worked on
}

export interface AgentProgress {
	phase: 'planning' | 'implementing' | 'testing' | 'reviewing' | 'complete';
	percentage: number; // 0-100
	tokensUsed: number;
	stepsCompleted: number;
	totalSteps?: number;
	toolCalls: number;
	filesModified: number;
	lastUpdate: string;
}

// ============================================================================
// Team Coordination Types
// ============================================================================

export type TeamEvent =
	| WorkStartedEvent
	| FileModifiedEvent
	| AgentJoinedEvent
	| AgentLeftEvent
	| AgentBlockedEvent
	| AgentConflictEvent
	| TaskCompletedEvent
	| ProgressUpdateEvent;

export interface BaseTeamEvent {
	id: string;
	timestamp: string;
	workspaceId: string;
	agentId: string;
	agent: Agent;
}

export interface WorkStartedEvent extends BaseTeamEvent {
	type: 'work_started';
	task: AgentTask;
}

export interface FileModifiedEvent extends BaseTeamEvent {
	type: 'file_modified';
	path: string;
	operation: 'create' | 'update' | 'delete' | 'rename';
	lockAcquired: boolean;
	linesAdded?: number;
	linesRemoved?: number;
}

export interface AgentJoinedEvent extends BaseTeamEvent {
	type: 'agent_joined';
}

export interface AgentLeftEvent extends BaseTeamEvent {
	type: 'agent_left';
	reason?: string;
}

export interface AgentBlockedEvent extends BaseTeamEvent {
	type: 'blocked';
	reason: string;
	blockedBy?: string; // Another agent ID
	blockedFiles: string[];
}

export interface AgentConflictEvent extends BaseTeamEvent {
	type: 'conflict';
	path: string;
	conflictWith: string; // Agent ID
	resolution: 'pending' | 'resolved' | 'escalated';
}

export interface TaskCompletedEvent extends BaseTeamEvent {
	type: 'task_completed';
	task: AgentTask;
	result: 'success' | 'failure' | 'partial';
	summary: string;
}

export interface ProgressUpdateEvent extends BaseTeamEvent {
	type: 'progress_update';
	progress: AgentProgress;
}

// ============================================================================
// Activity Feed Types
// ============================================================================

export type ActivityType = 'message' | 'action' | 'error' | 'milestone' | 'system';
export type ActivitySeverity = 'info' | 'warning' | 'error' | 'success';

export interface AgentActivity {
	id: string;
	agentId: string;
	agent: Agent;
	timestamp: string;
	type: ActivityType;
	content: string;
	metadata?: ActivityMetadata;
}

export interface ActivityMetadata {
	files?: string[];
	duration?: number;
	severity?: ActivitySeverity;
	actionable?: boolean;
	actionLabel?: string;
	actionCallback?: () => void;
}

// ============================================================================
// Cursor Types (for real-time collaboration)
// ============================================================================

export interface AgentCursor {
	agentId: string;
	agent: Agent;
	filePath: string;
	position: CursorPosition;
	selection?: CursorSelection;
	lastUpdate: string;
}

export interface CursorSelection {
	start: CursorPosition;
	end: CursorPosition;
}

// ============================================================================
// Filter and View Types
// ============================================================================

export type AgentFilter = AgentStatus | 'all';
export type AgentViewMode = 'grid' | 'list' | 'compact';

export interface AgentFilterOptions {
	status?: AgentFilter;
	type?: AgentType | 'all';
	hasTask?: boolean;
	workingOnFile?: string;
}
