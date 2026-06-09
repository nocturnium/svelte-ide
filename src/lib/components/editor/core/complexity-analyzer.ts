/**
 * Cognitive Complexity Analyzer
 *
 * Analyzes code complexity in real-time to help developers understand
 * cognitive load and identify areas that may benefit from refactoring.
 *
 * Based on cognitive complexity research and common code quality metrics.
 */

import type { Line } from './state';

/**
 * Complexity factors for a code region
 */
export interface ComplexityFactors {
	/** Maximum nesting depth (if/for/while/try) */
	nestingDepth: number;
	/** Number of branching statements (if/else/switch/case/ternary) */
	branchingFactor: number;
	/** Total line count */
	lineCount: number;
	/** Number of unique identifiers */
	identifierCount: number;
	/** Number of function calls */
	callCount: number;
}

/**
 * A region of code with its complexity analysis
 */
export interface ComplexityRegion {
	/** Start line (0-based) */
	startLine: number;
	/** End line (0-based) */
	endLine: number;
	/** Complexity score (0-100) */
	score: number;
	/** Individual factors */
	factors: ComplexityFactors;
	/** Suggested improvement if score is high */
	suggestion?: string;
	/** Region type */
	type: 'function' | 'class' | 'block' | 'file';
	/** Region name if identifiable */
	name?: string;
}

/**
 * Overall complexity metrics for a document
 */
export interface ComplexityMetrics {
	/** Overall complexity score (0-100) */
	overall: number;
	/** Complexity level for display */
	level: 'low' | 'medium' | 'high' | 'critical';
	/** Per-region breakdown */
	regions: ComplexityRegion[];
	/** Lines that exceed threshold */
	hotspots: number[];
}

/**
 * Thresholds for complexity levels
 */
const THRESHOLDS = {
	low: 30,
	medium: 50,
	high: 70,
	critical: 85
};

/**
 * Weights for different complexity factors
 */
const WEIGHTS = {
	nestingDepth: 15,
	branchingFactor: 8,
	lineCount: 0.3,
	identifierCount: 0.2,
	callCount: 0.5
};

/**
 * Patterns for detecting code constructs
 */
const PATTERNS = {
	// Nesting increasers
	nestingStart: /\b(if|for|while|switch|try|catch|with)\s*\(|=>\s*\{|\bdo\s*\{/,
	// Branching statements
	branching: /\b(if|else\s+if|else|case|default|\?.*:)/g,
	// Function definitions — exclude control flow keywords from method-style match
	functionDef:
		/\b(function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\(|(?!(?:if|else|for|while|do|switch|try|catch|finally|with|return|throw|new|typeof|void|delete|await|yield)\b)(\w+)\s*\([^)]*\)\s*\{|class\s+(\w+))/,
	// Function calls
	functionCall: /\b\w+\s*\(/g,
	// Identifiers (simplified)
	identifier: /\b[a-zA-Z_]\w*\b/g,
	// Block openers
	blockOpen: /\{/g,
	// Block closers
	blockClose: /\}/g
};

/**
 * Complexity Analyzer class
 */
export class ComplexityAnalyzer {
	private cache: Map<string, ComplexityMetrics> = new Map();
	private cacheKey: string = '';

	/**
	 * Analyze complexity of the given lines
	 */
	analyze(lines: readonly Line[], language: string = 'javascript'): ComplexityMetrics {
		// Simple cache check based on content hash
		const key = this.computeCacheKey(lines);
		if (key === this.cacheKey && this.cache.has(key)) {
			return this.cache.get(key)!;
		}

		const regions = this.identifyRegions(lines, language);
		const analyzedRegions = regions.map((region) => this.analyzeRegion(lines, region));
		const hotspots = this.findHotspots(analyzedRegions);
		const overall = this.calculateOverall(analyzedRegions, lines.length);

		const metrics: ComplexityMetrics = {
			overall,
			level: this.getLevel(overall),
			regions: analyzedRegions,
			hotspots
		};

		this.cacheKey = key;
		this.cache.set(key, metrics);

		return metrics;
	}

	/**
	 * Get complexity for a specific line
	 */
	getLineComplexity(metrics: ComplexityMetrics, line: number): number {
		for (const region of metrics.regions) {
			if (line >= region.startLine && line <= region.endLine) {
				return region.score;
			}
		}
		return 0;
	}

	/**
	 * Check if a line is a hotspot
	 */
	isHotspot(metrics: ComplexityMetrics, line: number): boolean {
		return metrics.hotspots.includes(line);
	}

	/**
	 * Compute a cache key from all line content using a fast hash
	 */
	private computeCacheKey(lines: readonly Line[]): string {
		// Use a simple DJB2 hash across all line content for reliable cache invalidation
		let hash = 5381;
		for (let i = 0; i < lines.length; i++) {
			const text = lines[i].text;
			for (let j = 0; j < text.length; j++) {
				hash = ((hash << 5) + hash + text.charCodeAt(j)) | 0;
			}
			// Include newline separator in hash
			hash = ((hash << 5) + hash + 10) | 0;
		}
		return `${lines.length}:${hash}`;
	}

	/**
	 * Identify code regions (functions, classes, blocks)
	 *
	 * Uses brace-depth tracking to correctly handle inline braces
	 * (object literals, destructuring) that don't represent new blocks.
	 */
	private identifyRegions(
		lines: readonly Line[],
		_language: string
	): Array<{ startLine: number; endLine: number; type: ComplexityRegion['type']; name?: string }> {
		const regions: Array<{
			startLine: number;
			endLine: number;
			type: ComplexityRegion['type'];
			name?: string;
		}> = [];

		// Track blocks with their brace depth at push time
		const blockStack: Array<{
			line: number;
			type: ComplexityRegion['type'];
			name?: string;
			depth: number; // brace depth when this block was opened
		}> = [];

		let braceDepth = 0;
		let pendingDef:
			| {
					line: number;
					type: 'function' | 'class';
					name?: string;
					depth: number;
			  }
			| undefined;

		for (let i = 0; i < lines.length; i++) {
			const text = lines[i].text;

			// Check for function/class definition
			const funcMatch = text.match(PATTERNS.functionDef);
			const currentBlock = blockStack[blockStack.length - 1];
			const defCandidate = this.getDefinitionCandidate(
				text,
				funcMatch,
				currentBlock?.type === 'class' && braceDepth === currentBlock.depth
			);
			if (defCandidate) {
				pendingDef = {
					line: i,
					type: defCandidate.type,
					name: defCandidate.name,
					depth: braceDepth
				};
			}

			// Process character by character to properly match braces
			// Skip braces inside strings and comments
			let inString: string | null = null;
			let inLineComment = false;

			for (let ch = 0; ch < text.length; ch++) {
				const c = text[ch];
				const next = text[ch + 1];

				// Handle line comments
				if (!inString && c === '/' && next === '/') {
					inLineComment = true;
					break;
				}

				// Handle strings
				if (!inLineComment) {
					if (inString) {
						if (c === inString && text[ch - 1] !== '\\') {
							inString = null;
						}
						continue;
					} else if (c === '"' || c === "'" || c === '`') {
						inString = c;
						continue;
					}
				}

				if (!inString && !inLineComment) {
					if (c === '{') {
						braceDepth++;
						// If this is the opening brace of a function/class def, push it
						if (
							pendingDef &&
							braceDepth === pendingDef.depth + 1 &&
							this.isDefOpeningBrace(text, ch, pendingDef.type)
						) {
							blockStack.push({
								line: pendingDef.line,
								type: pendingDef.type,
								name: pendingDef.name,
								depth: braceDepth
							});
							pendingDef = undefined;
						} else if (
							!funcMatch ||
							braceDepth > (blockStack.length > 0 ? blockStack[blockStack.length - 1].depth : 0) + 1
						) {
							// Anonymous/inline brace — only push as block if it's a
							// statement-level block (i.e., after control flow keyword on this line)
							const prefix = text.slice(0, ch).trim();
							if (
								/\b(if|else|for|while|do|switch|try|catch|finally)\b/.test(prefix) ||
								prefix.endsWith('=>') ||
								prefix.endsWith(')')
							) {
								blockStack.push({ line: i, type: 'block', depth: braceDepth });
							}
							// Otherwise it's an expression brace (object literal, destructuring) — ignore
						}
					} else if (c === '}') {
						// Close: pop if this brace matches a tracked block's depth
						if (blockStack.length > 0 && braceDepth === blockStack[blockStack.length - 1].depth) {
							const block = blockStack.pop()!;
							if (block.type === 'function' || block.type === 'class') {
								regions.push({
									startLine: block.line,
									endLine: i,
									type: block.type,
									name: block.name
								});
							}
						}
						braceDepth = Math.max(0, braceDepth - 1);
						if (pendingDef && braceDepth < pendingDef.depth) {
							pendingDef = undefined;
						}
					}
				}
			}
		}

		// If no regions found, treat whole file as one region
		if (regions.length === 0 && lines.length > 0) {
			regions.push({
				startLine: 0,
				endLine: lines.length - 1,
				type: 'file'
			});
		}

		return regions;
	}

	/**
	 * Check if a `{` at position `ch` is the opening brace of a function/class definition
	 */
	private isDefOpeningBrace(text: string, ch: number, type: 'function' | 'class'): boolean {
		// For class: `class Foo {` — the `{` follows the class name
		if (type === 'class') {
			return true; // First `{` on a class line is the class body
		}
		// For functions: the `{` should follow the parameter list closing `)`
		// with an optional TypeScript return type, or follow `=>` for arrow functions.
		const before = text.slice(0, ch).trimEnd();
		return /\)\s*(:\s*[^{};]+)?\s*$/.test(before) || before.endsWith('=>');
	}

	/**
	 * Extract a definition candidate before its body brace is seen.
	 */
	private getDefinitionCandidate(
		text: string,
		funcMatch: RegExpMatchArray | null,
		allowMethodStyle: boolean
	): { type: 'function' | 'class'; name?: string } | undefined {
		if (funcMatch) {
			return {
				type: funcMatch[5] ? 'class' : 'function',
				name: funcMatch[2] || funcMatch[3] || funcMatch[4] || funcMatch[5]
			};
		}

		if (!allowMethodStyle) {
			return undefined;
		}

		const trimmed = text.trim();
		const methodMatch = trimmed.match(
			/^(?:(?:public|private|protected|static|async|readonly|override)\s+)*(?!(?:if|else|for|while|do|switch|try|catch|finally|with|return|throw|new|typeof|void|delete|await|yield)\b)(\w+)\s*\(/
		);
		if (methodMatch) {
			return { type: 'function', name: methodMatch[1] };
		}

		return undefined;
	}

	/**
	 * Analyze a specific region
	 */
	private analyzeRegion(
		lines: readonly Line[],
		region: { startLine: number; endLine: number; type: ComplexityRegion['type']; name?: string }
	): ComplexityRegion {
		const factors = this.calculateFactors(lines, region.startLine, region.endLine);
		const score = this.calculateScore(factors);
		const suggestion = this.getSuggestion(factors, score);

		return {
			...region,
			score,
			factors,
			suggestion
		};
	}

	/**
	 * Calculate complexity factors for a range of lines
	 */
	private calculateFactors(
		lines: readonly Line[],
		startLine: number,
		endLine: number
	): ComplexityFactors {
		let nestingDepth = 0;
		let maxNesting = 0;
		let branchingFactor = 0;
		let callCount = 0;
		const identifiers = new Set<string>();

		// Use a global version of the nesting pattern so we can count all matches per line
		const nestingStartGlobal = /\b(if|for|while|switch|try|catch|with)\s*\(|=>\s*\{|\bdo\s*\{/g;

		// Keywords that should NOT be counted as function calls
		const controlKeywords = new Set([
			'if',
			'for',
			'while',
			'switch',
			'catch',
			'function',
			'return',
			'typeof',
			'new',
			'throw',
			'await',
			'yield',
			'import',
			'export',
			'class',
			'super',
			'this',
			'void',
			'delete',
			'in',
			'of'
		]);

		for (let i = startLine; i <= endLine && i < lines.length; i++) {
			const text = lines[i].text;

			// Track nesting — count ALL nesting openers per line
			nestingStartGlobal.lastIndex = 0;
			let nestingMatches = 0;
			while (nestingStartGlobal.exec(text) !== null) {
				nestingMatches++;
			}
			nestingDepth += nestingMatches;
			maxNesting = Math.max(maxNesting, nestingDepth);

			// Count closing braces (simplified nesting tracking)
			const closes = (text.match(PATTERNS.blockClose) || []).length;
			nestingDepth = Math.max(0, nestingDepth - closes);

			// Count branching
			const branches = text.match(PATTERNS.branching);
			if (branches) {
				branchingFactor += branches.length;
			}

			// Count function calls — exclude control keywords and function declaration names
			const callRegex = /\b(\w+)\s*\(/g;
			let callMatch: RegExpExecArray | null;
			while ((callMatch = callRegex.exec(text)) !== null) {
				if (controlKeywords.has(callMatch[1])) continue;
				// Skip function declaration names: "function foo(" → "foo" is not a call
				const before = text.slice(0, callMatch.index).trimEnd();
				if (before.endsWith('function')) continue;
				callCount++;
			}

			// Collect identifiers
			const ids = text.match(PATTERNS.identifier);
			if (ids) {
				ids.forEach((id) => identifiers.add(id));
			}
		}

		return {
			nestingDepth: maxNesting,
			branchingFactor,
			lineCount: endLine - startLine + 1,
			identifierCount: identifiers.size,
			callCount
		};
	}

	/**
	 * Calculate complexity score from factors
	 */
	private calculateScore(factors: ComplexityFactors): number {
		const score =
			factors.nestingDepth * WEIGHTS.nestingDepth +
			factors.branchingFactor * WEIGHTS.branchingFactor +
			factors.lineCount * WEIGHTS.lineCount +
			factors.identifierCount * WEIGHTS.identifierCount +
			factors.callCount * WEIGHTS.callCount;

		return Math.min(100, Math.round(score));
	}

	/**
	 * Get suggestion based on factors
	 */
	private getSuggestion(factors: ComplexityFactors, score: number): string | undefined {
		if (score < THRESHOLDS.medium) {
			return undefined;
		}

		if (factors.nestingDepth > 4) {
			return 'Deep nesting detected. Consider extracting nested logic into separate functions.';
		}

		if (factors.lineCount > 50) {
			return 'Long function detected. Consider breaking it into smaller, focused functions.';
		}

		if (factors.branchingFactor > 10) {
			return 'High branching complexity. Consider using a lookup table, strategy pattern, or polymorphism.';
		}

		if (factors.callCount > 20) {
			return 'Many function calls. Consider if some operations can be combined or simplified.';
		}

		if (score >= THRESHOLDS.high) {
			return 'High cognitive complexity. This code may be difficult to understand and maintain.';
		}

		return undefined;
	}

	/**
	 * Find hotspot lines (lines in high-complexity regions)
	 */
	private findHotspots(regions: ComplexityRegion[]): number[] {
		const hotspots: number[] = [];

		for (const region of regions) {
			if (region.score >= THRESHOLDS.high) {
				for (let i = region.startLine; i <= region.endLine; i++) {
					hotspots.push(i);
				}
			}
		}

		return hotspots;
	}

	/**
	 * Calculate overall complexity
	 */
	private calculateOverall(regions: ComplexityRegion[], _totalLines: number): number {
		if (regions.length === 0) return 0;

		// Weighted average based on region size
		let totalWeight = 0;
		let weightedSum = 0;

		for (const region of regions) {
			const weight = region.endLine - region.startLine + 1;
			weightedSum += region.score * weight;
			totalWeight += weight;
		}

		// Normalize to total lines
		const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

		// Boost score slightly for files with many high-complexity regions
		const highComplexityCount = regions.filter((r) => r.score >= THRESHOLDS.high).length;
		const boost = Math.min(10, highComplexityCount * 2);

		return Math.min(100, Math.round(avgScore + boost));
	}

	/**
	 * Get complexity level from score
	 */
	private getLevel(score: number): ComplexityMetrics['level'] {
		if (score >= THRESHOLDS.critical) return 'critical';
		if (score >= THRESHOLDS.high) return 'high';
		if (score >= THRESHOLDS.medium) return 'medium';
		return 'low';
	}
}

/**
 * Create a new complexity analyzer
 */
export function createComplexityAnalyzer(): ComplexityAnalyzer {
	return new ComplexityAnalyzer();
}

/**
 * Singleton instance for convenience
 */
let defaultAnalyzer: ComplexityAnalyzer | null = null;

export function getComplexityAnalyzer(): ComplexityAnalyzer {
	if (!defaultAnalyzer) {
		defaultAnalyzer = createComplexityAnalyzer();
	}
	return defaultAnalyzer;
}
