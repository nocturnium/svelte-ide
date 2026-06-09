/**
 * Semantic Analyzer
 *
 * Analyzes code to identify semantic regions for intelligent folding.
 * Unlike syntax-based folding, semantic folding understands code meaning:
 * - "Collapse all imports"
 * - "Show only public API"
 * - "Hide error handling"
 */

import type { Line } from './state';

/**
 * Semantic categories for code regions
 */
export type SemanticCategory =
	| 'imports' // import/require statements
	| 'exports' // export statements
	| 'types' // type/interface definitions
	| 'constants' // const declarations at module level
	| 'error-handling' // try/catch, .catch(), error checks
	| 'logging' // console.*, logger.*
	| 'tests' // describe/it/test blocks
	| 'setup' // beforeEach, afterEach, setup functions
	| 'private' // private methods, _ prefixed
	| 'public' // public API methods
	| 'comments' // comment blocks
	| 'boilerplate' // common patterns like constructor super()
	| 'function' // function definitions
	| 'class'; // class definitions

/**
 * A semantic region in the code
 */
export interface SemanticRegion {
	/** Category of this region */
	category: SemanticCategory;
	/** Start line (0-based) */
	startLine: number;
	/** End line (0-based) */
	endLine: number;
	/** Confidence score (0-1) */
	confidence: number;
	/** Human-readable label */
	label?: string;
	/** Nested regions */
	children?: SemanticRegion[];
}

/**
 * Pattern configuration for detecting semantic regions
 */
interface PatternConfig {
	/** Pattern to match start of region */
	startPattern?: RegExp;
	/** Pattern to match end of region (if different from block end) */
	endPattern?: RegExp;
	/** Pattern to match single lines */
	linePattern?: RegExp;
	/** Whether region is block-based (uses braces) */
	blockBased?: boolean;
	/**
	 * For block-based patterns: also emit a single-line region when the start
	 * pattern matches a brace-less expression body (e.g. an arrow function whose
	 * body is an expression: `export const f = () => expr`). Without this such a
	 * definition is invisible because there is no `{` to open a block.
	 */
	expressionBody?: boolean;
	/** Whether pattern spans multiple lines */
	multiline?: boolean;
	/** Label generator */
	getLabel?: (match: RegExpMatchArray) => string;
}

type LanguagePatterns = Map<SemanticCategory, PatternConfig>;

/**
 * Pattern definitions for JavaScript/TypeScript
 */
const JAVASCRIPT_PATTERNS: LanguagePatterns = new Map([
	[
		'imports',
		{
			startPattern: /^import\s|^const\s+\w+\s*=\s*require\s*\(/,
			endPattern: /^(?!import|const\s+\w+\s*=\s*require)/,
			multiline: true,
			getLabel: () => 'Import statements'
		}
	],
	[
		'exports',
		{
			startPattern: /^export\s+(default\s+)?(function|class|const|let|var|interface|type)/,
			blockBased: true,
			getLabel: (m: RegExpMatchArray) => `Export: ${m[2] || 'default'}`
		}
	],
	[
		'types',
		{
			startPattern: /^(export\s+)?(interface|type)\s+(\w+)/,
			blockBased: true,
			getLabel: (m: RegExpMatchArray) => `Type: ${m[3]}`
		}
	],
	[
		'error-handling',
		{
			startPattern: /\btry\s*\{/,
			blockBased: true,
			getLabel: () => 'Error handling'
		}
	],
	[
		'logging',
		{
			linePattern: /\b(console|logger)\.\w+\s*\(/,
			getLabel: () => 'Logging'
		}
	],
	[
		'tests',
		{
			startPattern: /\b(describe|it|test|beforeEach|afterEach|beforeAll|afterAll)\s*\(/,
			blockBased: true,
			getLabel: (m: RegExpMatchArray) => `Test: ${m[1]}`
		}
	],
	[
		'comments',
		{
			startPattern: /^\s*\/\*\*/,
			endPattern: /\*\/\s*$/,
			multiline: true,
			getLabel: () => 'Documentation'
		}
	],
	[
		'function',
		{
			startPattern:
				/^(export\s+)?(async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/,
			blockBased: true,
			expressionBody: true,
			getLabel: (m: RegExpMatchArray) => `Function: ${m[3] || m[4] || 'anonymous'}`
		}
	],
	[
		'class',
		{
			startPattern: /^(export\s+)?class\s+(\w+)/,
			blockBased: true,
			getLabel: (m: RegExpMatchArray) => `Class: ${m[2]}`
		}
	],
	[
		'private',
		{
			startPattern: /^\s*(private|#)\s*(\w+)|^\s*_\w+\s*[=(:]/,
			blockBased: true,
			getLabel: () => 'Private member'
		}
	],
	[
		'constants',
		{
			linePattern: /^(export\s+)?const\s+[A-Z][A-Z0-9_]+\s*=/,
			getLabel: () => 'Constants'
		}
	]
]);

/**
 * Pattern definitions for Python
 */
const PYTHON_PATTERNS: LanguagePatterns = new Map([
	[
		'imports',
		{
			startPattern: /^(import\s|from\s+\w+\s+import)/,
			endPattern: /^(?!import|from\s)/,
			multiline: true,
			getLabel: () => 'Import statements'
		}
	],
	[
		'function',
		{
			startPattern: /^(async\s+)?def\s+(\w+)/,
			blockBased: true,
			getLabel: (m: RegExpMatchArray) => `Function: ${m[2]}`
		}
	],
	[
		'class',
		{
			startPattern: /^class\s+(\w+)/,
			blockBased: true,
			getLabel: (m: RegExpMatchArray) => `Class: ${m[1]}`
		}
	],
	[
		'tests',
		{
			startPattern: /^def\s+test_\w+|^class\s+Test\w+/,
			blockBased: true,
			getLabel: () => 'Test'
		}
	],
	[
		'comments',
		{
			startPattern: /^\s*"""/,
			endPattern: /"""\s*$/,
			multiline: true,
			getLabel: () => 'Docstring'
		}
	],
	[
		'error-handling',
		{
			startPattern: /^\s*try\s*:/,
			blockBased: true,
			getLabel: () => 'Error handling'
		}
	],
	[
		'private',
		{
			startPattern: /^\s*def\s+_\w+|^\s*_\w+\s*=/,
			blockBased: true,
			getLabel: () => 'Private member'
		}
	]
]);

/**
 * Default patterns for unknown languages
 */
const DEFAULT_PATTERNS: LanguagePatterns = new Map([
	[
		'comments',
		{
			startPattern: /^\s*\/\*|^\s*#|^\s*\/\//,
			getLabel: () => 'Comment'
		}
	],
	[
		'function',
		{
			startPattern: /function\s+\w+|def\s+\w+|fn\s+\w+/,
			blockBased: true,
			getLabel: () => 'Function'
		}
	]
]);

/**
 * Get patterns for a language
 */
function getPatternsForLanguage(language: string): LanguagePatterns {
	const normalized = language.toLowerCase();

	if (normalized === 'javascript' || normalized === 'typescript' || normalized === 'svelte') {
		return JAVASCRIPT_PATTERNS;
	}
	if (normalized === 'python') {
		return PYTHON_PATTERNS;
	}

	return DEFAULT_PATTERNS;
}

/**
 * Semantic Analyzer class
 */
export class SemanticAnalyzer {
	private cache: Map<string, SemanticRegion[]> = new Map();
	private cacheKey: string = '';

	/**
	 * Analyze lines and return semantic regions
	 */
	analyze(lines: readonly Line[], language: string): SemanticRegion[] {
		// Simple cache check
		const key = `${language}:${lines.length}:${lines[0]?.text ?? ''}`;
		if (key === this.cacheKey && this.cache.has(key)) {
			return this.cache.get(key)!;
		}

		const patterns = getPatternsForLanguage(language);
		const regions: SemanticRegion[] = [];

		// Track block depth for block-based patterns
		const blockStack: Array<{
			category: SemanticCategory;
			startLine: number;
			depth: number;
			label?: string;
		}> = [];
		let currentDepth = 0;

		// Track multiline regions
		const multilineRegions: Map<SemanticCategory, { startLine: number; label?: string }> =
			new Map();

		for (let i = 0; i < lines.length; i++) {
			const text = lines[i].text;

			// Count braces for depth tracking
			const opens = (text.match(/\{/g) || []).length;
			const closes = (text.match(/\}/g) || []).length;

			// Check for pattern matches
			for (const [category, config] of patterns) {
				// Line patterns (single line matches)
				if (config.linePattern) {
					if (config.linePattern.test(text)) {
						// Find or create a contiguous region
						const lastRegion = regions.find(
							(r) => r.category === category && r.endLine === i - 1 && !config.blockBased
						);

						if (lastRegion) {
							lastRegion.endLine = i;
						} else {
							regions.push({
								category,
								startLine: i,
								endLine: i,
								confidence: 0.9,
								label: config.getLabel?.(text.match(config.linePattern)!) ?? category
							});
						}
					}
				}

				// Multiline patterns
				if (config.multiline && config.startPattern && config.endPattern) {
					if (!multilineRegions.has(category) && config.startPattern.test(text)) {
						multilineRegions.set(category, {
							startLine: i,
							label: config.getLabel?.(text.match(config.startPattern)!)
						});
					} else if (multilineRegions.has(category) && config.endPattern.test(text)) {
						const start = multilineRegions.get(category)!;
						regions.push({
							category,
							startLine: start.startLine,
							endLine: i,
							confidence: 0.85,
							label: start.label ?? category
						});
						multilineRegions.delete(category);
					}
				}

				// Multiline without explicit end (ends when pattern stops matching)
				if (config.multiline && config.startPattern && !config.endPattern) {
					if (!multilineRegions.has(category) && config.startPattern.test(text)) {
						multilineRegions.set(category, {
							startLine: i,
							label: config.getLabel?.(text.match(config.startPattern)!)
						});
					} else if (multilineRegions.has(category)) {
						if (!config.startPattern.test(text) && text.trim() !== '') {
							// End the region
							const start = multilineRegions.get(category)!;
							regions.push({
								category,
								startLine: start.startLine,
								endLine: i - 1,
								confidence: 0.8,
								label: start.label ?? category
							});
							multilineRegions.delete(category);
						}
					}
				}

				// Block-based patterns
				if (config.blockBased && config.startPattern) {
					const match = text.match(config.startPattern);
					if (match && opens > 0) {
						blockStack.push({
							category,
							startLine: i,
							depth: currentDepth + opens,
							label: config.getLabel?.(match)
						});
					} else if (match && config.expressionBody && text.includes('=>')) {
						// Brace-less expression-bodied arrow (e.g. `export const f = () => x`):
						// no block to track, so record it as a single-line region.
						regions.push({
							category,
							startLine: i,
							endLine: i,
							confidence: 0.85,
							label: config.getLabel?.(match)
						});
					}
				}
			}

			// Update depth
			currentDepth += opens - closes;

			// Check if any blocks closed
			while (blockStack.length > 0 && currentDepth < blockStack[blockStack.length - 1].depth) {
				const block = blockStack.pop()!;
				regions.push({
					category: block.category,
					startLine: block.startLine,
					endLine: i,
					confidence: 0.9,
					label: block.label
				});
			}
		}

		// Close any remaining multiline regions
		for (const [category, start] of multilineRegions) {
			regions.push({
				category,
				startLine: start.startLine,
				endLine: lines.length - 1,
				confidence: 0.7,
				label: start.label ?? category
			});
		}

		// Sort by start line
		regions.sort((a, b) => a.startLine - b.startLine);

		// Cache result
		this.cacheKey = key;
		this.cache.set(key, regions);

		return regions;
	}

	/**
	 * Get regions by category
	 */
	getByCategory(regions: SemanticRegion[], category: SemanticCategory): SemanticRegion[] {
		return regions.filter((r) => r.category === category);
	}

	/**
	 * Get all categories present in regions
	 */
	getCategories(regions: SemanticRegion[]): SemanticCategory[] {
		return [...new Set(regions.map((r) => r.category))];
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
		this.cacheKey = '';
	}
}

/**
 * Fold preset configuration
 */
export interface FoldPreset {
	id: string;
	name: string;
	description: string;
	/** Categories to keep visible */
	show: SemanticCategory[];
	/** Categories to collapse */
	hide: SemanticCategory[];
	/** Icon for UI */
	icon?: string;
}

/**
 * Default fold presets
 */
export const DEFAULT_FOLD_PRESETS: FoldPreset[] = [
	{
		id: 'code-review',
		name: 'Code Review',
		description: 'Hide tests, show implementation',
		show: ['exports', 'public', 'function', 'class'],
		hide: ['tests', 'setup', 'imports', 'comments'],
		icon: '\u{1F50D}'
	},
	{
		id: 'api-surface',
		name: 'API Surface',
		description: 'Show only public interface',
		show: ['exports', 'types', 'public'],
		hide: ['private', 'tests', 'error-handling', 'logging', 'comments'],
		icon: '\u{1F4E4}'
	},
	{
		id: 'debugging',
		name: 'Debugging',
		description: 'Show error handling and logging',
		show: ['error-handling', 'logging'],
		hide: ['comments', 'types', 'tests'],
		icon: '\u{1F41B}'
	},
	{
		id: 'tests-only',
		name: 'Tests Only',
		description: 'Show only test code',
		show: ['tests', 'setup'],
		hide: ['imports', 'comments', 'types'],
		icon: '\u{1F9EA}'
	},
	{
		id: 'minimal',
		name: 'Minimal View',
		description: 'Hide boilerplate and comments',
		show: ['function', 'class', 'exports'],
		hide: ['imports', 'comments', 'boilerplate', 'logging'],
		icon: '\u{1F4CB}'
	},
	{
		id: 'documentation',
		name: 'Documentation',
		description: 'Show types and comments',
		show: ['types', 'comments', 'exports'],
		hide: ['private', 'tests', 'error-handling', 'logging'],
		icon: '\u{1F4D6}'
	}
];

/**
 * Singleton instance
 */
let defaultAnalyzer: SemanticAnalyzer | null = null;

export function getSemanticAnalyzer(): SemanticAnalyzer {
	if (!defaultAnalyzer) {
		defaultAnalyzer = new SemanticAnalyzer();
	}
	return defaultAnalyzer;
}

/**
 * Create new analyzer instance
 */
export function createSemanticAnalyzer(): SemanticAnalyzer {
	return new SemanticAnalyzer();
}
