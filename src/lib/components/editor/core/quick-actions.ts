/**
 * Quick Actions (Code Actions) Manager
 *
 * Provides contextual code actions like:
 * - Quick fixes for errors/warnings
 * - Refactoring operations
 * - Code generation
 * - Import suggestions
 */

export interface Position {
	line: number;
	column: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export type CodeActionKind =
	| 'quickfix'
	| 'refactor'
	| 'refactor.extract'
	| 'refactor.inline'
	| 'refactor.rename'
	| 'source'
	| 'source.organizeImports'
	| 'source.fixAll'
	| 'generate';

export interface CodeAction {
	/** Unique identifier */
	id: string;
	/** Display title */
	title: string;
	/** Action kind for categorization */
	kind: CodeActionKind;
	/** Optional description */
	description?: string;
	/** Keyboard shortcut hint */
	shortcut?: string;
	/** Whether this is a preferred action */
	isPreferred?: boolean;
	/** Whether this action is disabled */
	disabled?: boolean;
	/** Reason why action is disabled */
	disabledReason?: string;
	/** The edit to apply */
	edit?: CodeEdit;
	/** Command to execute instead of/after edit */
	command?: CodeCommand;
	/** Diagnostics this action addresses */
	diagnostics?: Diagnostic[];
}

export interface CodeEdit {
	/** Text changes to apply */
	changes: TextChange[];
}

export interface TextChange {
	/** Range to replace */
	range: Range;
	/** New text */
	newText: string;
}

export interface CodeCommand {
	/** Command identifier */
	command: string;
	/** Command title */
	title: string;
	/** Command arguments */
	arguments?: unknown[];
}

export interface Diagnostic {
	/** Diagnostic range */
	range: Range;
	/** Severity level */
	severity: 'error' | 'warning' | 'info' | 'hint';
	/** Message */
	message: string;
	/** Source (e.g., "typescript", "eslint") */
	source?: string;
	/** Error code */
	code?: string | number;
}

export interface CodeActionContext {
	/** Current cursor position */
	position: Position;
	/** Current selection range */
	selection?: Range;
	/** Diagnostics at current position */
	diagnostics: Diagnostic[];
	/** Current line content */
	lineContent: string;
	/** Selected text (if any) */
	selectedText?: string;
	/** Language ID */
	language: string;
	/** Full document content */
	content: string;
}

export type CodeActionProvider = (context: CodeActionContext) => CodeAction[];

interface QuickActionsConfig {
	/** Whether quick actions are enabled */
	enabled: boolean;
	/** Show lightbulb indicator */
	showLightbulb: boolean;
	/** Auto-show on cursor position change */
	autoShow: boolean;
	/** Delay before showing actions (ms) */
	showDelay: number;
}

type Listener = () => void;

/**
 * Quick Actions Manager
 */
export class QuickActionsManager {
	private _config: QuickActionsConfig = {
		enabled: true,
		showLightbulb: true,
		autoShow: true,
		showDelay: 300
	};

	private _providers: Map<string, CodeActionProvider> = new Map();
	private _currentActions: CodeAction[] = [];
	private _currentContext: CodeActionContext | null = null;
	private _listeners: Set<Listener> = new Set();
	private _showTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		// Register built-in providers
		this.registerBuiltinProviders();
	}

	/**
	 * Register built-in action providers
	 */
	private registerBuiltinProviders(): void {
		// Quick fix provider for common issues
		this.registerProvider('quickfix', (ctx) => {
			const actions: CodeAction[] = [];

			// Fix for unused variables
			if (ctx.lineContent.includes('const ') || ctx.lineContent.includes('let ')) {
				const match = ctx.lineContent.match(/(?:const|let)\s+(\w+)/);
				if (match) {
					actions.push({
						id: `remove-unused-${match[1]}`,
						title: `Remove unused variable '${match[1]}'`,
						kind: 'quickfix',
						description: 'Remove the declaration of unused variable',
						edit: {
							changes: [
								{
									range: {
										start: { line: ctx.position.line, column: 0 },
										end: { line: ctx.position.line + 1, column: 0 }
									},
									newText: ''
								}
							]
						}
					});
				}
			}

			// Add missing semicolon
			if (
				!ctx.lineContent.trim().endsWith(';') &&
				!ctx.lineContent.trim().endsWith('{') &&
				!ctx.lineContent.trim().endsWith('}') &&
				!ctx.lineContent.trim().endsWith(',') &&
				ctx.lineContent.trim().length > 0
			) {
				actions.push({
					id: 'add-semicolon',
					title: 'Add missing semicolon',
					kind: 'quickfix',
					isPreferred: true,
					edit: {
						changes: [
							{
								range: {
									start: { line: ctx.position.line, column: ctx.lineContent.trimEnd().length },
									end: { line: ctx.position.line, column: ctx.lineContent.trimEnd().length }
								},
								newText: ';'
							}
						]
					}
				});
			}

			return actions;
		});

		// Refactoring provider
		this.registerProvider('refactor', (ctx) => {
			const actions: CodeAction[] = [];

			// Extract to variable
			if (ctx.selectedText && ctx.selectedText.length > 0) {
				actions.push({
					id: 'extract-variable',
					title: 'Extract to variable',
					kind: 'refactor.extract',
					shortcut: 'Ctrl+Alt+V',
					command: {
						command: 'refactor.extractVariable',
						title: 'Extract Variable',
						arguments: [ctx.selection, ctx.selectedText]
					}
				});

				// Extract to function
				if (ctx.selectedText.includes('\n') || ctx.selectedText.length > 50) {
					actions.push({
						id: 'extract-function',
						title: 'Extract to function',
						kind: 'refactor.extract',
						shortcut: 'Ctrl+Alt+M',
						command: {
							command: 'refactor.extractFunction',
							title: 'Extract Function',
							arguments: [ctx.selection, ctx.selectedText]
						}
					});
				}
			}

			// Rename symbol
			const wordMatch = ctx.lineContent.substring(0, ctx.position.column).match(/\w+$/);
			if (wordMatch) {
				actions.push({
					id: 'rename-symbol',
					title: `Rename '${wordMatch[0]}'`,
					kind: 'refactor.rename',
					shortcut: 'F2',
					command: {
						command: 'refactor.rename',
						title: 'Rename Symbol',
						arguments: [ctx.position, wordMatch[0]]
					}
				});
			}

			// Convert to arrow function
			if (ctx.lineContent.includes('function ')) {
				actions.push({
					id: 'convert-to-arrow',
					title: 'Convert to arrow function',
					kind: 'refactor',
					description: 'Convert function declaration to arrow function expression'
				});
			}

			// Convert to template literal
			if (
				ctx.lineContent.includes(' + ') &&
				(ctx.lineContent.includes('"') || ctx.lineContent.includes("'"))
			) {
				actions.push({
					id: 'convert-to-template',
					title: 'Convert to template literal',
					kind: 'refactor',
					description: 'Convert string concatenation to template literal'
				});
			}

			return actions;
		});

		// Source actions provider
		this.registerProvider('source', (ctx) => {
			const actions: CodeAction[] = [];

			// Organize imports
			if (ctx.lineContent.includes('import ') || ctx.position.line < 20) {
				actions.push({
					id: 'organize-imports',
					title: 'Organize imports',
					kind: 'source.organizeImports',
					shortcut: 'Shift+Alt+O',
					command: {
						command: 'source.organizeImports',
						title: 'Organize Imports'
					}
				});
			}

			// Fix all auto-fixable issues
			actions.push({
				id: 'fix-all',
				title: 'Fix all auto-fixable problems',
				kind: 'source.fixAll',
				command: {
					command: 'source.fixAll',
					title: 'Fix All'
				}
			});

			return actions;
		});

		// Generate actions provider
		this.registerProvider('generate', (ctx) => {
			const actions: CodeAction[] = [];

			// Generate JSDoc
			if (
				ctx.lineContent.includes('function ') ||
				ctx.lineContent.includes('const ') ||
				ctx.lineContent.includes('class ')
			) {
				actions.push({
					id: 'generate-jsdoc',
					title: 'Generate JSDoc comment',
					kind: 'generate',
					description: 'Add documentation comment above declaration'
				});
			}

			// Generate getter/setter (for class properties)
			if (ctx.lineContent.includes('private ') || ctx.lineContent.includes('protected ')) {
				const propMatch = ctx.lineContent.match(/(?:private|protected)\s+(\w+)/);
				if (propMatch) {
					actions.push({
						id: 'generate-getter',
						title: `Generate getter for '${propMatch[1]}'`,
						kind: 'generate'
					});
					actions.push({
						id: 'generate-setter',
						title: `Generate setter for '${propMatch[1]}'`,
						kind: 'generate'
					});
				}
			}

			// Generate constructor
			if (ctx.lineContent.includes('class ')) {
				actions.push({
					id: 'generate-constructor',
					title: 'Generate constructor',
					kind: 'generate'
				});
			}

			return actions;
		});
	}

	/**
	 * Register a code action provider
	 */
	registerProvider(id: string, provider: CodeActionProvider): () => void {
		this._providers.set(id, provider);
		return () => this._providers.delete(id);
	}

	/**
	 * Get available actions for context
	 */
	getActions(context: CodeActionContext): CodeAction[] {
		if (!this._config.enabled) return [];

		const actions: CodeAction[] = [];

		for (const provider of this._providers.values()) {
			try {
				const providerActions = provider(context);
				actions.push(...providerActions);
			} catch (e) {
				console.error('Code action provider error:', e);
			}
		}

		// Sort by kind and preferred status
		return actions.sort((a, b) => {
			// Preferred actions first
			if (a.isPreferred && !b.isPreferred) return -1;
			if (!a.isPreferred && b.isPreferred) return 1;

			// Then by kind priority
			const kindPriority: Record<CodeActionKind, number> = {
				quickfix: 0,
				'refactor.extract': 1,
				'refactor.inline': 2,
				'refactor.rename': 3,
				refactor: 4,
				'source.organizeImports': 5,
				'source.fixAll': 6,
				source: 7,
				generate: 8
			};

			return (kindPriority[a.kind] ?? 99) - (kindPriority[b.kind] ?? 99);
		});
	}

	/**
	 * Update context and refresh actions
	 */
	updateContext(context: CodeActionContext): void {
		if (this._showTimeout) {
			clearTimeout(this._showTimeout);
		}

		if (!this._config.autoShow) {
			this._currentContext = context;
			return;
		}

		this._showTimeout = setTimeout(() => {
			this._currentContext = context;
			this._currentActions = this.getActions(context);
			this.notify();
		}, this._config.showDelay);
	}

	/**
	 * Force refresh actions
	 */
	refresh(): void {
		if (this._currentContext) {
			this._currentActions = this.getActions(this._currentContext);
			this.notify();
		}
	}

	/**
	 * Execute a code action
	 */
	async executeAction(action: CodeAction): Promise<boolean> {
		if (action.disabled) {
			console.warn('Cannot execute disabled action:', action.disabledReason);
			return false;
		}

		// If action has an edit, apply it
		if (action.edit) {
			// The edit would be applied by the editor
			// Return the edit for the caller to handle
			return true;
		}

		// If action has a command, execute it
		if (action.command) {
			// The command would be executed by the editor
			// Return true to indicate the action was triggered
			return true;
		}

		return false;
	}

	/**
	 * Get current actions
	 */
	get currentActions(): CodeAction[] {
		return this._currentActions;
	}

	/**
	 * Check if actions are available
	 */
	get hasActions(): boolean {
		return this._currentActions.length > 0;
	}

	/**
	 * Get config
	 */
	get config(): QuickActionsConfig {
		return { ...this._config };
	}

	/**
	 * Update config
	 */
	setConfig(config: Partial<QuickActionsConfig>): void {
		this._config = { ...this._config, ...config };
		this.notify();
	}

	/**
	 * Enable/disable quick actions
	 */
	setEnabled(enabled: boolean): void {
		this._config.enabled = enabled;
		if (!enabled) {
			this._currentActions = [];
		}
		this.notify();
	}

	/**
	 * Check if enabled
	 */
	isEnabled(): boolean {
		return this._config.enabled;
	}

	/**
	 * Subscribe to changes
	 */
	subscribe(listener: Listener): () => void {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	}

	/**
	 * Notify listeners
	 */
	private notify(): void {
		for (const listener of this._listeners) {
			listener();
		}
	}

	/**
	 * Clean up
	 */
	destroy(): void {
		if (this._showTimeout) {
			clearTimeout(this._showTimeout);
		}
		this._listeners.clear();
		this._providers.clear();
	}
}

/**
 * Create a new QuickActionsManager instance
 */
export function createQuickActionsManager(): QuickActionsManager {
	return new QuickActionsManager();
}

/**
 * Group actions by kind for display
 */
export function groupActionsByKind(actions: CodeAction[]): Map<string, CodeAction[]> {
	const groups = new Map<string, CodeAction[]>();

	for (const action of actions) {
		// Get the base kind (e.g., "refactor" from "refactor.extract")
		const baseKind = action.kind.split('.')[0];
		const kindLabel = getKindLabel(baseKind as CodeActionKind);

		if (!groups.has(kindLabel)) {
			groups.set(kindLabel, []);
		}
		groups.get(kindLabel)!.push(action);
	}

	return groups;
}

/**
 * Get display label for action kind
 */
export function getKindLabel(kind: CodeActionKind | string): string {
	const labels: Record<string, string> = {
		quickfix: 'Quick Fix',
		refactor: 'Refactor',
		source: 'Source Action',
		generate: 'Generate'
	};

	const baseKind = kind.split('.')[0];
	return labels[baseKind] || kind;
}

/**
 * Get icon for action kind
 */
export function getKindIcon(kind: CodeActionKind | string): string {
	const icons: Record<string, string> = {
		quickfix: '🔧',
		refactor: '✨',
		'refactor.extract': '📤',
		'refactor.inline': '📥',
		'refactor.rename': '✏️',
		source: '📋',
		'source.organizeImports': '📦',
		'source.fixAll': '✅',
		generate: '⚡'
	};

	return icons[kind] || icons[kind.split('.')[0]] || '💡';
}
