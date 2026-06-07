/**
 * Command System
 *
 * Provides a centralized command registry for the editor.
 * Commands can be executed via keyboard shortcuts or the command palette.
 */

import type { EditorState } from './state';
import type { SemanticCategory } from './semantic-analyzer';
import { getSemanticAnalyzer, DEFAULT_FOLD_PRESETS, type FoldPreset } from './semantic-analyzer';

/**
 * Command definition
 */
export interface Command {
	/** Unique command identifier */
	id: string;
	/** Display label */
	label: string;
	/** Category for grouping */
	category: string;
	/** Description */
	description?: string;
	/** Keyboard shortcut (display only) */
	shortcut?: string;
	/** Icon (unicode or emoji) */
	icon?: string;
	/** Execute the command */
	execute: () => void | Promise<void>;
	/** Check if command is enabled */
	isEnabled?: () => boolean;
}

/**
 * Command category
 */
export interface CommandCategory {
	id: string;
	label: string;
	icon?: string;
}

/**
 * Command registry
 */
class CommandRegistry {
	private commands = new Map<string, Command>();
	private categories = new Map<string, CommandCategory>();

	/**
	 * Register a command
	 */
	register(command: Command): () => void {
		this.commands.set(command.id, command);
		return () => this.commands.delete(command.id);
	}

	/**
	 * Register multiple commands
	 */
	registerMany(commands: Command[]): () => void {
		const unsubscribes = commands.map((cmd) => this.register(cmd));
		return () => unsubscribes.forEach((unsub) => unsub());
	}

	/**
	 * Register a category
	 */
	registerCategory(category: CommandCategory): void {
		this.categories.set(category.id, category);
	}

	/**
	 * Get a command by ID
	 */
	get(id: string): Command | undefined {
		return this.commands.get(id);
	}

	/**
	 * Execute a command by ID
	 */
	async execute(id: string): Promise<boolean> {
		const command = this.commands.get(id);
		if (!command) return false;

		if (command.isEnabled && !command.isEnabled()) {
			return false;
		}

		await command.execute();
		return true;
	}

	/**
	 * Get all commands
	 */
	getAll(): Command[] {
		return Array.from(this.commands.values());
	}

	/**
	 * Get commands by category
	 */
	getByCategory(categoryId: string): Command[] {
		return this.getAll().filter((cmd) => cmd.category === categoryId);
	}

	/**
	 * Search commands
	 */
	search(query: string): Command[] {
		const q = query.toLowerCase();
		return this.getAll().filter(
			(cmd) =>
				cmd.label.toLowerCase().includes(q) ||
				cmd.description?.toLowerCase().includes(q) ||
				cmd.category.toLowerCase().includes(q)
		);
	}

	/**
	 * Get all categories
	 */
	getCategories(): CommandCategory[] {
		return Array.from(this.categories.values());
	}

	/**
	 * Clear all commands
	 */
	clear(): void {
		this.commands.clear();
	}
}

// Global command registry
let globalRegistry: CommandRegistry | null = null;

/**
 * Get the global command registry
 */
export function getCommandRegistry(): CommandRegistry {
	if (!globalRegistry) {
		globalRegistry = new CommandRegistry();
		initializeCategories(globalRegistry);
	}
	return globalRegistry;
}

/**
 * Initialize default categories
 */
function initializeCategories(registry: CommandRegistry): void {
	registry.registerCategory({ id: 'fold', label: 'Folding', icon: '▼' });
	registry.registerCategory({ id: 'fold.semantic', label: 'Semantic Folding', icon: '◇' });
	registry.registerCategory({ id: 'fold.preset', label: 'Fold Presets', icon: '◈' });
	registry.registerCategory({ id: 'navigation', label: 'Navigation', icon: '→' });
	registry.registerCategory({ id: 'edit', label: 'Edit', icon: '✎' });
	registry.registerCategory({ id: 'view', label: 'View', icon: '◉' });
	registry.registerCategory({ id: 'search', label: 'Search', icon: '⌕' });
}

/**
 * Semantic fold action types
 */
export type SemanticFoldAction = 'fold' | 'unfold' | 'toggle' | 'focus';

/**
 * Create semantic fold commands for the editor
 */
export function createSemanticFoldCommands(
	editorState: EditorState,
	options: {
		onFoldLines?: (startLine: number, endLine: number) => void;
		onUnfoldLines?: (startLine: number, endLine: number) => void;
		onFoldAll?: () => void;
		onUnfoldAll?: () => void;
		onApplyPreset?: (preset: FoldPreset) => void;
		getLanguage?: () => string;
	}
): Command[] {
	const analyzer = getSemanticAnalyzer();
	const commands: Command[] = [];

	// Helper to get regions
	const getRegions = () => {
		const language = options.getLanguage?.() || 'typescript';
		return analyzer.analyze(editorState.lines, language);
	};

	// Helper to fold by category
	const foldByCategory = (category: SemanticCategory, action: SemanticFoldAction) => {
		const regions = getRegions();
		const categoryRegions = analyzer.getByCategory(regions, category);

		for (const region of categoryRegions) {
			if (action === 'fold' && options.onFoldLines) {
				options.onFoldLines(region.startLine, region.endLine);
			} else if (action === 'unfold' && options.onUnfoldLines) {
				options.onUnfoldLines(region.startLine, region.endLine);
			}
		}
	};

	// Category-based fold commands
	const categoryCommands: Array<{
		category: SemanticCategory;
		label: string;
		icon: string;
	}> = [
		{ category: 'imports', label: 'Imports', icon: '↓' },
		{ category: 'exports', label: 'Exports', icon: '↑' },
		{ category: 'types', label: 'Types/Interfaces', icon: 'T' },
		{ category: 'function', label: 'Functions', icon: 'ƒ' },
		{ category: 'class', label: 'Classes', icon: 'C' },
		{ category: 'tests', label: 'Tests', icon: '✓' },
		{ category: 'comments', label: 'Comments', icon: '#' },
		{ category: 'error-handling', label: 'Error Handling', icon: '!' },
		{ category: 'logging', label: 'Logging', icon: '⊙' },
		{ category: 'private', label: 'Private Members', icon: '_' }
	];

	// Add fold/unfold commands for each category
	for (const { category, label, icon } of categoryCommands) {
		commands.push(
			{
				id: `fold.semantic.${category}`,
				label: `Fold ${label}`,
				category: 'fold.semantic',
				description: `Collapse all ${label.toLowerCase()} in the document`,
				icon,
				execute: () => foldByCategory(category, 'fold')
			},
			{
				id: `unfold.semantic.${category}`,
				label: `Unfold ${label}`,
				category: 'fold.semantic',
				description: `Expand all ${label.toLowerCase()} in the document`,
				icon,
				execute: () => foldByCategory(category, 'unfold')
			}
		);
	}

	// Preset commands
	for (const preset of DEFAULT_FOLD_PRESETS) {
		commands.push({
			id: `fold.preset.${preset.id}`,
			label: `Apply Preset: ${preset.name}`,
			category: 'fold.preset',
			description: preset.description,
			icon: preset.icon,
			execute: () => options.onApplyPreset?.(preset)
		});
	}

	// General fold commands
	commands.push(
		{
			id: 'fold.all',
			label: 'Fold All',
			category: 'fold',
			description: 'Collapse all foldable regions',
			shortcut: 'Ctrl+K Ctrl+0',
			icon: '▼',
			execute: () => options.onFoldAll?.()
		},
		{
			id: 'unfold.all',
			label: 'Unfold All',
			category: 'fold',
			description: 'Expand all folded regions',
			shortcut: 'Ctrl+K Ctrl+J',
			icon: '▶',
			execute: () => options.onUnfoldAll?.()
		},
		{
			id: 'fold.showOnlyPublicAPI',
			label: 'Show Only Public API',
			category: 'fold.semantic',
			description: 'Fold everything except exports and public methods',
			icon: '◉',
			execute: () => {
				// Fold all first
				options.onFoldAll?.();
				// Then unfold exports
				foldByCategory('exports', 'unfold');
			}
		},
		{
			id: 'fold.hideBoilerplate',
			label: 'Hide Boilerplate',
			category: 'fold.semantic',
			description: 'Fold imports, types, and constants',
			icon: '◌',
			execute: () => {
				foldByCategory('imports', 'fold');
				foldByCategory('types', 'fold');
				foldByCategory('constants', 'fold');
			}
		},
		{
			id: 'fold.focusFunction',
			label: 'Focus Current Function',
			category: 'fold.semantic',
			description: 'Fold everything except the current function',
			icon: 'ƒ',
			execute: () => {
				const cursorLine = editorState.selection.head.line;
				const regions = getRegions();
				const functions = analyzer.getByCategory(regions, 'function');

				// Find function containing cursor
				const currentFn = functions.find(
					(r) => r.startLine <= cursorLine && r.endLine >= cursorLine
				);

				if (currentFn) {
					// Fold all
					options.onFoldAll?.();
					// Unfold current function
					options.onUnfoldLines?.(currentFn.startLine, currentFn.endLine);
				}
			}
		}
	);

	return commands;
}

/**
 * Register semantic fold commands with the global registry
 */
export function registerSemanticFoldCommands(
	editorState: EditorState,
	options: Parameters<typeof createSemanticFoldCommands>[1]
): () => void {
	const registry = getCommandRegistry();
	const commands = createSemanticFoldCommands(editorState, options);
	return registry.registerMany(commands);
}
