/**
 * Snippet Manager
 *
 * Manages code snippets with tab stops, placeholders, and variable expansion.
 * Supports VS Code-style snippet syntax.
 */

import type { Position } from './state';

/**
 * Snippet definition
 */
export interface Snippet {
	/** Unique ID */
	id: string;
	/** Display name */
	name: string;
	/** Trigger prefix (what user types to activate) */
	prefix: string;
	/** Snippet body (with placeholders) */
	body: string;
	/** Description */
	description: string;
	/** Languages this snippet applies to (empty = all) */
	languages: string[];
	/** Category for organization */
	category: string;
	/** Whether this is a user-defined snippet */
	isUserDefined: boolean;
	/** Usage count for sorting */
	usageCount: number;
	/** Last used timestamp */
	lastUsed: Date | null;
}

/**
 * Parsed placeholder/tab stop
 */
export interface SnippetTabStop {
	/** Tab stop index (0 = final position, 1+ = visit order) */
	index: number;
	/** Start offset in expanded text */
	start: number;
	/** End offset in expanded text */
	end: number;
	/** Placeholder text (if any) */
	placeholder: string;
	/** Choices (if this is a choice placeholder) */
	choices?: string[];
	/** Variable name (if this is a variable) */
	variable?: string;
}

/**
 * Expanded snippet ready for insertion
 */
export interface ExpandedSnippet {
	/** Expanded text */
	text: string;
	/** Tab stops in order */
	tabStops: SnippetTabStop[];
	/** Current tab stop index */
	currentTabStop: number;
}

/**
 * Snippet session (active snippet editing)
 */
export interface SnippetSession {
	/** Session ID */
	id: string;
	/** Snippet being edited */
	snippet: Snippet;
	/** Expanded content */
	expanded: ExpandedSnippet;
	/** Start position in document */
	startPosition: Position;
	/** Whether session is active */
	isActive: boolean;
}

/**
 * Snippet manager configuration
 */
export interface SnippetManagerConfig {
	/** Maximum number of user snippets */
	maxUserSnippets: number;
	/** Built-in snippets */
	builtInSnippets: Snippet[];
}

const DEFAULT_CONFIG: SnippetManagerConfig = {
	maxUserSnippets: 500,
	builtInSnippets: []
};

/**
 * Built-in JavaScript/TypeScript snippets
 */
const JS_SNIPPETS: Snippet[] = [
	{
		id: 'js-log',
		name: 'Console Log',
		prefix: 'log',
		body: 'console.log($1);$0',
		description: 'Log to console',
		languages: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
		category: 'Debug',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-fn',
		name: 'Function',
		prefix: 'fn',
		body: 'function ${1:name}(${2:params}) {\n\t$0\n}',
		description: 'Function declaration',
		languages: ['javascript', 'typescript'],
		category: 'Functions',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-arrow',
		name: 'Arrow Function',
		prefix: 'af',
		body: 'const ${1:name} = (${2:params}) => {\n\t$0\n};',
		description: 'Arrow function',
		languages: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
		category: 'Functions',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-async-fn',
		name: 'Async Function',
		prefix: 'afn',
		body: 'async function ${1:name}(${2:params}) {\n\t$0\n}',
		description: 'Async function declaration',
		languages: ['javascript', 'typescript'],
		category: 'Functions',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-for',
		name: 'For Loop',
		prefix: 'for',
		body: 'for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {\n\t$0\n}',
		description: 'For loop',
		languages: ['javascript', 'typescript'],
		category: 'Loops',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-forof',
		name: 'For...of Loop',
		prefix: 'forof',
		body: 'for (const ${1:item} of ${2:iterable}) {\n\t$0\n}',
		description: 'For...of loop',
		languages: ['javascript', 'typescript'],
		category: 'Loops',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-if',
		name: 'If Statement',
		prefix: 'if',
		body: 'if (${1:condition}) {\n\t$0\n}',
		description: 'If statement',
		languages: ['javascript', 'typescript'],
		category: 'Control',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-ifel',
		name: 'If...Else',
		prefix: 'ifel',
		body: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}',
		description: 'If...else statement',
		languages: ['javascript', 'typescript'],
		category: 'Control',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-trycatch',
		name: 'Try...Catch',
		prefix: 'try',
		body: 'try {\n\t$1\n} catch (${2:error}) {\n\t$0\n}',
		description: 'Try...catch block',
		languages: ['javascript', 'typescript'],
		category: 'Error Handling',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-import',
		name: 'Import',
		prefix: 'imp',
		body: "import { $2 } from '$1';$0",
		description: 'Named import',
		languages: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
		category: 'Modules',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'js-export',
		name: 'Export',
		prefix: 'exp',
		body: 'export { $1 };$0',
		description: 'Named export',
		languages: ['javascript', 'typescript'],
		category: 'Modules',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	}
];

/**
 * Built-in Svelte snippets
 */
const SVELTE_SNIPPETS: Snippet[] = [
	{
		id: 'svelte-script',
		name: 'Script Block',
		prefix: 'script',
		body: '<script lang="ts">\n\t$0\n</script>',
		description: 'Svelte script block',
		languages: ['svelte'],
		category: 'Structure',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'svelte-state',
		name: 'State Rune',
		prefix: 'state',
		body: 'let ${1:name} = \\$state(${2:initialValue});$0',
		description: 'Svelte 5 $state rune',
		languages: ['svelte'],
		category: 'Runes',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'svelte-derived',
		name: 'Derived Rune',
		prefix: 'derived',
		body: 'let ${1:name} = \\$derived(${2:expression});$0',
		description: 'Svelte 5 $derived rune',
		languages: ['svelte'],
		category: 'Runes',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'svelte-effect',
		name: 'Effect Rune',
		prefix: 'effect',
		body: '\\$effect(() => {\n\t$0\n});',
		description: 'Svelte 5 $effect rune',
		languages: ['svelte'],
		category: 'Runes',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'svelte-props',
		name: 'Props Interface',
		prefix: 'props',
		body: 'interface Props {\n\t${1:propName}: ${2:type};\n}\n\nlet { ${1:propName} }: Props = \\$props();$0',
		description: 'Svelte 5 props with interface',
		languages: ['svelte'],
		category: 'Runes',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'svelte-each',
		name: 'Each Block',
		prefix: 'each',
		body: '{#each ${1:items} as ${2:item}}\n\t$0\n{/each}',
		description: 'Svelte each block',
		languages: ['svelte'],
		category: 'Template',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	},
	{
		id: 'svelte-if',
		name: 'If Block',
		prefix: 'sif',
		body: '{#if ${1:condition}}\n\t$0\n{/if}',
		description: 'Svelte if block',
		languages: ['svelte'],
		category: 'Template',
		isUserDefined: false,
		usageCount: 0,
		lastUsed: null
	}
];

/**
 * Snippet Manager
 */
export class SnippetManager {
	private config: SnippetManagerConfig;
	private snippets: Map<string, Snippet> = new Map();
	private userSnippets: Map<string, Snippet> = new Map();
	private activeSession: SnippetSession | null = null;
	private listeners: Set<(event: SnippetEvent) => void> = new Set();

	constructor(config: Partial<SnippetManagerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Load built-in snippets
		this.loadBuiltInSnippets();
	}

	/**
	 * Load built-in snippets
	 */
	private loadBuiltInSnippets(): void {
		const allBuiltIn = [...JS_SNIPPETS, ...SVELTE_SNIPPETS, ...this.config.builtInSnippets];

		for (const snippet of allBuiltIn) {
			this.snippets.set(snippet.id, snippet);
		}
	}

	/**
	 * Add a user-defined snippet
	 */
	addSnippet(snippet: Omit<Snippet, 'id' | 'isUserDefined' | 'usageCount' | 'lastUsed'>): Snippet {
		if (this.userSnippets.size >= this.config.maxUserSnippets) {
			throw new Error(`Maximum snippet limit (${this.config.maxUserSnippets}) reached`);
		}

		const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const newSnippet: Snippet = {
			...snippet,
			id,
			isUserDefined: true,
			usageCount: 0,
			lastUsed: null
		};

		this.userSnippets.set(id, newSnippet);
		this.emit({ type: 'snippet-added', snippet: newSnippet });

		return newSnippet;
	}

	/**
	 * Update a user-defined snippet
	 */
	updateSnippet(id: string, updates: Partial<Omit<Snippet, 'id' | 'isUserDefined'>>): boolean {
		const snippet = this.userSnippets.get(id);
		if (!snippet) return false;

		Object.assign(snippet, updates);
		this.emit({ type: 'snippet-updated', snippet });

		return true;
	}

	/**
	 * Delete a user-defined snippet
	 */
	deleteSnippet(id: string): boolean {
		const deleted = this.userSnippets.delete(id);
		if (deleted) {
			this.emit({ type: 'snippet-deleted', snippetId: id });
		}
		return deleted;
	}

	/**
	 * Get all snippets for a language
	 */
	getSnippetsForLanguage(language: string): Snippet[] {
		const result: Snippet[] = [];

		// Built-in snippets
		for (const snippet of this.snippets.values()) {
			if (snippet.languages.length === 0 || snippet.languages.includes(language)) {
				result.push(snippet);
			}
		}

		// User snippets
		for (const snippet of this.userSnippets.values()) {
			if (snippet.languages.length === 0 || snippet.languages.includes(language)) {
				result.push(snippet);
			}
		}

		// Sort by usage count (most used first)
		result.sort((a, b) => b.usageCount - a.usageCount);

		return result;
	}

	/**
	 * Find snippets matching a prefix
	 */
	findByPrefix(prefix: string, language: string): Snippet[] {
		const snippets = this.getSnippetsForLanguage(language);
		const lowerPrefix = prefix.toLowerCase();

		return snippets.filter(
			(s) =>
				s.prefix.toLowerCase().startsWith(lowerPrefix) ||
				s.name.toLowerCase().includes(lowerPrefix)
		);
	}

	/**
	 * Get snippet by ID
	 */
	getSnippet(id: string): Snippet | undefined {
		return this.snippets.get(id) || this.userSnippets.get(id);
	}

	/**
	 * Expand a snippet body with variables
	 */
	expand(snippet: Snippet, variables?: Record<string, string>): ExpandedSnippet {
		let text = snippet.body;
		const tabStops: SnippetTabStop[] = [];

		// Replace escaped characters
		text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\$/g, '\x00DOLLAR\x00');

		// Built-in variables
		const builtInVars: Record<string, string> = {
			TM_CURRENT_LINE: '',
			TM_CURRENT_WORD: '',
			TM_FILENAME: 'untitled',
			TM_FILENAME_BASE: 'untitled',
			TM_DIRECTORY: '',
			TM_FILEPATH: '',
			CLIPBOARD: '',
			CURRENT_YEAR: new Date().getFullYear().toString(),
			CURRENT_MONTH: String(new Date().getMonth() + 1).padStart(2, '0'),
			CURRENT_DATE: String(new Date().getDate()).padStart(2, '0'),
			CURRENT_HOUR: String(new Date().getHours()).padStart(2, '0'),
			CURRENT_MINUTE: String(new Date().getMinutes()).padStart(2, '0'),
			CURRENT_SECOND: String(new Date().getSeconds()).padStart(2, '0'),
			RANDOM: Math.random().toString(36).substr(2, 6),
			RANDOM_HEX: Math.random().toString(16).substr(2, 6),
			UUID: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substr(2)}`
		};

		const allVars = { ...builtInVars, ...variables };

		// Replace variables: ${VAR_NAME} or ${VAR_NAME:default}
		text = text.replace(/\$\{([A-Z_]+)(?::([^}]*))?\}/g, (_, name, defaultVal) => {
			return allVars[name] ?? defaultVal ?? '';
		});

		// Parse tab stops: $1, ${1}, ${1:placeholder}, ${1|choice1,choice2|}
		const tabStopPattern = /\$(?:(\d+)|{(\d+)(?::([^}|]+))?(?:\|([^}]+)\|)?})/g;
		let match;
		const adjustments: Array<{ start: number; length: number; replacement: string; index: number; placeholder: string; choices?: string[] }> = [];

		while ((match = tabStopPattern.exec(text)) !== null) {
			const fullMatch = match[0];
			const index = parseInt(match[1] ?? match[2], 10);
			const placeholder = match[3] ?? '';
			const choicesStr = match[4];
			const choices = choicesStr ? choicesStr.split(',') : undefined;

			adjustments.push({
				start: match.index,
				length: fullMatch.length,
				replacement: placeholder || (choices ? choices[0] : ''),
				index,
				placeholder: placeholder || (choices ? choices[0] : ''),
				choices
			});
		}

		// Apply adjustments in reverse order to maintain positions
		for (let i = adjustments.length - 1; i >= 0; i--) {
			const adj = adjustments[i];
			text = text.slice(0, adj.start) + adj.replacement + text.slice(adj.start + adj.length);
		}

		// Calculate tab stop positions after all replacements
		let currentOffset = 0;
		for (const adj of adjustments) {
			const adjustedStart = adj.start - currentOffset;
			tabStops.push({
				index: adj.index,
				start: adjustedStart,
				end: adjustedStart + adj.placeholder.length,
				placeholder: adj.placeholder,
				choices: adj.choices
			});
			currentOffset += adj.length - adj.placeholder.length;
		}

		// Sort by index (0 is final, so it goes last)
		tabStops.sort((a, b) => {
			if (a.index === 0) return 1;
			if (b.index === 0) return -1;
			return a.index - b.index;
		});

		// Restore escaped dollars
		// eslint-disable-next-line no-control-regex -- \x00 is used intentionally as a sentinel that cannot appear in snippet text
		text = text.replace(/\x00DOLLAR\x00/g, '$');

		return {
			text,
			tabStops,
			currentTabStop: 0
		};
	}

	/**
	 * Start a snippet session
	 */
	startSession(snippet: Snippet, startPosition: Position, variables?: Record<string, string>): SnippetSession {
		// End any existing session
		this.endSession();

		// Expand the snippet
		const expanded = this.expand(snippet, variables);

		// Update usage stats
		snippet.usageCount++;
		snippet.lastUsed = new Date();

		const session: SnippetSession = {
			id: `session-${Date.now()}`,
			snippet,
			expanded,
			startPosition,
			isActive: true
		};

		this.activeSession = session;
		this.emit({ type: 'session-started', session });

		return session;
	}

	/**
	 * Move to next tab stop
	 */
	nextTabStop(): SnippetTabStop | null {
		if (!this.activeSession) return null;

		const { expanded } = this.activeSession;
		if (expanded.currentTabStop >= expanded.tabStops.length - 1) {
			// At last tab stop (or $0), end session
			this.endSession();
			return null;
		}

		expanded.currentTabStop++;
		const tabStop = expanded.tabStops[expanded.currentTabStop];
		this.emit({ type: 'tabstop-changed', tabStop, session: this.activeSession });

		return tabStop;
	}

	/**
	 * Move to previous tab stop
	 */
	prevTabStop(): SnippetTabStop | null {
		if (!this.activeSession) return null;

		const { expanded } = this.activeSession;
		if (expanded.currentTabStop <= 0) return null;

		expanded.currentTabStop--;
		const tabStop = expanded.tabStops[expanded.currentTabStop];
		this.emit({ type: 'tabstop-changed', tabStop, session: this.activeSession });

		return tabStop;
	}

	/**
	 * Get current tab stop
	 */
	getCurrentTabStop(): SnippetTabStop | null {
		if (!this.activeSession) return null;
		return this.activeSession.expanded.tabStops[this.activeSession.expanded.currentTabStop] ?? null;
	}

	/**
	 * End the current snippet session
	 */
	endSession(): void {
		if (this.activeSession) {
			this.activeSession.isActive = false;
			this.emit({ type: 'session-ended', session: this.activeSession });
			this.activeSession = null;
		}
	}

	/**
	 * Check if a session is active
	 */
	hasActiveSession(): boolean {
		return this.activeSession !== null && this.activeSession.isActive;
	}

	/**
	 * Get active session
	 */
	getActiveSession(): SnippetSession | null {
		return this.activeSession;
	}

	/**
	 * Get all categories
	 */
	getCategories(language?: string): string[] {
		const categories = new Set<string>();
		const snippets = language ? this.getSnippetsForLanguage(language) : [...this.snippets.values(), ...this.userSnippets.values()];

		for (const snippet of snippets) {
			categories.add(snippet.category);
		}

		return Array.from(categories).sort();
	}

	/**
	 * Export user snippets as JSON
	 */
	exportUserSnippets(): string {
		return JSON.stringify(Array.from(this.userSnippets.values()), null, 2);
	}

	/**
	 * Import user snippets from JSON
	 */
	importUserSnippets(json: string): number {
		const snippets = JSON.parse(json) as Snippet[];
		let count = 0;

		for (const snippet of snippets) {
			try {
				this.addSnippet(snippet);
				count++;
			} catch {
				// Skip if max limit reached
			}
		}

		return count;
	}

	/**
	 * Subscribe to events
	 */
	subscribe(listener: (event: SnippetEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Emit event
	 */
	private emit(event: SnippetEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (e) {
				console.error('[SnippetManager] Listener error:', e);
			}
		}
	}
}

/**
 * Snippet events
 */
export type SnippetEvent =
	| { type: 'snippet-added'; snippet: Snippet }
	| { type: 'snippet-updated'; snippet: Snippet }
	| { type: 'snippet-deleted'; snippetId: string }
	| { type: 'session-started'; session: SnippetSession }
	| { type: 'session-ended'; session: SnippetSession }
	| { type: 'tabstop-changed'; tabStop: SnippetTabStop; session: SnippetSession };

/**
 * Create a snippet manager
 */
export function createSnippetManager(config?: Partial<SnippetManagerConfig>): SnippetManager {
	return new SnippetManager(config);
}
