/**
 * Plugin/Extension system type definitions
 * Models a proposal-based plugin lifecycle (draft → review → testing → deployed)
 */

export type PluginStatus =
	| 'draft'
	| 'submitted'
	| 'reviewing'
	| 'approved'
	| 'testing'
	| 'deploying'
	| 'deployed'
	| 'rejected'
	| 'rolled_back';

export type PluginCategory =
	| 'file_ops'
	| 'http'
	| 'analysis'
	| 'transform'
	| 'validation'
	| 'utility'
	| 'integration'
	| 'ui'
	| 'editor'
	| 'ai';

export interface PluginProposal {
	id: string;
	name: string;
	description: string;
	category: PluginCategory;
	tags: string[];
	version: number;
	status: PluginStatus;
	author: string;

	/** JSON Schema for plugin parameters */
	parameters: PluginParameters;

	/** Plugin implementation - can be Svelte component or JS module */
	implementation: PluginImplementation;

	/** Test cases for validation */
	testCases: PluginTestCase[];

	/** Review votes collected during the approval step */
	votes: PluginVote[];

	/** Issues found during review */
	issues: PluginIssue[];

	/** Deployment metrics */
	metrics?: PluginMetrics;

	/** Rollout state for gradual deployment */
	rolloutState?: PluginRolloutState;

	createdAt: Date;
	updatedAt: Date;
	deployedAt?: Date;
}

export interface PluginParameters {
	type: 'object';
	properties: Record<string, PluginParameterProperty>;
	required?: string[];
}

export interface PluginParameterProperty {
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	description?: string;
	default?: unknown;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	items?: PluginParameterProperty;
	properties?: Record<string, PluginParameterProperty>;
}

export interface PluginImplementation {
	/** Type of implementation */
	type: 'component' | 'module' | 'action' | 'provider';

	/** For SSR-rendered components */
	componentPath?: string;

	/** For JS modules */
	moduleCode?: string;

	/** Entry point function name */
	entryPoint?: string;

	/** Dependencies required */
	dependencies?: string[];

	/** Permissions required */
	permissions?: PluginPermission[];
}

export type PluginPermission =
	| 'filesystem:read'
	| 'filesystem:write'
	| 'network:fetch'
	| 'editor:read'
	| 'editor:write'
	| 'ai:invoke'
	| 'ui:render'
	| 'storage:local'
	| 'storage:sync';

export interface PluginTestCase {
	id: string;
	name: string;
	description: string;
	input: Record<string, unknown>;
	expectedOutput?: Record<string, unknown>;
	expectError?: boolean;
	timeout?: number;
}

export interface PluginTestResult {
	testCaseId: string;
	passed: boolean;
	output?: unknown;
	error?: string;
	duration: number;
	executedAt: Date;
}

export interface PluginVote {
	agentId: string;
	agentType: 'security' | 'quality' | 'usability' | 'performance';
	approved: boolean;
	confidence: number;
	weight: number;
	reasoning: string;
	votedAt: Date;
}

export interface PluginIssue {
	id: string;
	severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	category: string;
	message: string;
	location?: string;
	suggestion?: string;
}

export interface PluginMetrics {
	successRate: number;
	avgDuration: number;
	p50Latency: number;
	p95Latency: number;
	p99Latency: number;
	invocationCount: number;
	errorCount: number;
	lastInvokedAt?: Date;
}

export interface PluginRolloutState {
	currentPercentage: number;
	targetPercentage: number;
	stepStartedAt: Date;
	baselineMetrics?: PluginMetrics;
	currentMetrics?: PluginMetrics;
}

/**
 * Plugin event for SSE streaming
 */
export interface PluginEvent {
	id: string;
	proposalId: string;
	type: PluginEventType;
	actor: string;
	details: Record<string, unknown>;
	occurredAt: Date;
}

export type PluginEventType =
	| 'created'
	| 'submitted'
	| 'review_started'
	| 'vote_cast'
	| 'consensus'
	| 'testing_started'
	| 'test_completed'
	| 'approved'
	| 'rejected'
	| 'deploying'
	| 'rollout_step'
	| 'deployed'
	| 'rolled_back'
	| 'feedback';

/**
 * Plugin manifest for registration
 */
export interface PluginManifest {
	name: string;
	version: string;
	description: string;
	author: string;
	category: PluginCategory;
	tags: string[];

	/** Plugin entry points */
	main?: string;
	components?: Record<string, string>;
	actions?: Record<string, string>;
	providers?: Record<string, string>;

	/** Plugin configuration */
	config?: PluginParameters;

	/** Required permissions */
	permissions?: PluginPermission[];

	/** Dependencies on other plugins */
	dependencies?: Record<string, string>;

	/** Activation events */
	activationEvents?: string[];
}

/**
 * Plugin runtime instance
 */
export interface PluginInstance {
	id: string;
	manifest: PluginManifest;
	status: 'inactive' | 'activating' | 'active' | 'error';
	error?: string;

	/** Exported API from the plugin */
	exports?: Record<string, unknown>;

	/** Cleanup function */
	dispose?: () => void;
}

/**
 * Plugin contribution points
 */
export interface PluginContributions {
	/** Commands that can be executed */
	commands?: PluginCommand[];

	/** Menu items */
	menus?: PluginMenuItem[];

	/** Keybindings */
	keybindings?: PluginKeybinding[];

	/** Panel contributions */
	panels?: PluginPanel[];

	/** Status bar items */
	statusBarItems?: PluginStatusBarItem[];

	/** Editor decorations */
	decorations?: PluginDecoration[];

	/** File icon themes */
	iconThemes?: PluginIconTheme[];
}

export interface PluginCommand {
	id: string;
	title: string;
	category?: string;
	icon?: string;
	handler: () => void | Promise<void>;
}

export interface PluginMenuItem {
	command: string;
	group?: string;
	when?: string;
}

export interface PluginKeybinding {
	command: string;
	keys: string[];
	when?: string;
}

export interface PluginPanel {
	id: string;
	title: string;
	icon?: string;
	position: 'left' | 'right' | 'bottom';
	component: string;
}

export interface PluginStatusBarItem {
	id: string;
	text: string;
	tooltip?: string;
	command?: string;
	alignment: 'left' | 'right';
	priority?: number;
}

export interface PluginDecoration {
	id: string;
	type: 'line' | 'range' | 'gutter';
	style: Record<string, string>;
}

export interface PluginIconTheme {
	id: string;
	label: string;
	path: string;
}

/**
 * Plugin sandbox configuration
 */
export interface PluginSandboxConfig {
	enabled: boolean;
	maxExecutionTime: number;
	maxMemory: number;
	networkAccess: boolean;
	filesystemAccess: boolean;
	allowedImports: string[];
	blockedImports: string[];
}
