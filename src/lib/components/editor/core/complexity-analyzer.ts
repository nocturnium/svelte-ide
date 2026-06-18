/**
 * Cognitive Complexity Analyzer
 *
 * Analyzes code complexity in real-time to help developers understand
 * cognitive load and identify areas that may benefit from refactoring.
 *
 * Based on cognitive complexity research and common code quality metrics.
 */

import type { Line } from './state';
import { resolveLanguage, tokenize } from '../tokenizer';
import type { Token, TokenizedLine } from '../tokenizer';

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

export interface ComplexityContribution {
	line: number;
	kind: string;
	reason: string;
	increment: number;
	nesting: number;
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
	/** Exact SonarSource Cognitive Complexity score */
	cognitiveComplexity: number;
	/** Per-increment Cognitive Complexity contribution breakdown */
	contributions: ComplexityContribution[];
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
	/** Sum of exact Cognitive Complexity across all regions */
	totalCognitiveComplexity: number;
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

const COGNITIVE_SCORE_MULTIPLIER = 7;

type SupportedComplexityLanguage = 'javascript' | 'typescript' | 'python' | 'go';

type RawRegion = {
	startLine: number;
	endLine: number;
	type: ComplexityRegion['type'];
	name?: string;
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
		const complexityLanguage = this.getComplexityLanguage(language);
		// Simple cache check based on content hash
		const key = `${complexityLanguage}:${this.computeCacheKey(lines)}`;
		if (key === this.cacheKey && this.cache.has(key)) {
			return this.cache.get(key)!;
		}

		const tokenized = tokenize(lines.map((line) => line.text).join('\n'), complexityLanguage);
		const regions = this.identifyRegions(lines, complexityLanguage, tokenized);
		const analyzedRegions = regions.map((region) =>
			this.analyzeRegion(lines, region, complexityLanguage, tokenized)
		);
		const hotspots = this.findHotspots(analyzedRegions);
		const overall = this.calculateOverall(analyzedRegions, lines.length);
		const totalCognitiveComplexity = analyzedRegions.reduce(
			(total, region) => total + region.cognitiveComplexity,
			0
		);

		const metrics: ComplexityMetrics = {
			overall,
			level: this.getLevel(overall),
			regions: analyzedRegions,
			hotspots,
			totalCognitiveComplexity
		};

		this.cacheKey = key;
		this.cache.set(key, metrics);

		return metrics;
	}

	/**
	 * Get complexity for a specific line
	 */
	getLineComplexity(metrics: ComplexityMetrics, line: number): number {
		// A line can sit inside several nested regions; report the highest score
		// so an inner low-complexity region never masks the hot function around it.
		let best = 0;
		for (const region of metrics.regions) {
			if (line >= region.startLine && line <= region.endLine && region.score > best) {
				best = region.score;
			}
		}
		return best;
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

	private getComplexityLanguage(language: string): SupportedComplexityLanguage {
		const resolved = resolveLanguage(language);
		if (
			resolved === 'javascript' ||
			resolved === 'typescript' ||
			resolved === 'python' ||
			resolved === 'go'
		) {
			return resolved;
		}
		return 'javascript';
	}

	/**
	 * Identify code regions (functions, classes, blocks)
	 *
	 * Uses brace-depth tracking to correctly handle inline braces
	 * (object literals, destructuring) that don't represent new blocks.
	 */
	private identifyRegions(
		lines: readonly Line[],
		language: SupportedComplexityLanguage,
		tokenized: TokenizedLine[]
	): RawRegion[] {
		if (language === 'python') {
			return this.identifyPythonRegions(lines, tokenized);
		}
		if (language === 'go') {
			return this.identifyGoRegions(lines, tokenized);
		}

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

	private identifyPythonRegions(lines: readonly Line[], tokenized: TokenizedLine[]): RawRegion[] {
		const regions: RawRegion[] = [];
		const stack: Array<{
			startLine: number;
			indent: number;
			type: ComplexityRegion['type'];
			name?: string;
		}> = [];

		for (let i = 0; i < lines.length; i++) {
			const tokens = this.getCodeTokens(tokenized[i]?.tokens ?? []);
			if (tokens.length === 0) continue;

			const indent = this.getIndent(lines[i].text);
			while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
				const region = stack.pop()!;
				regions.push({
					startLine: region.startLine,
					endLine: Math.max(region.startLine, i - 1),
					type: region.type,
					name: region.name
				});
			}

			const first = tokens[0]?.text;
			const second = tokens[1]?.text;
			const isAsyncDef = first === 'async' && second === 'def';
			const isDef = first === 'def' || isAsyncDef;
			const isClass = first === 'class';

			if (isDef || isClass) {
				const keywordIndex = isAsyncDef ? 1 : 0;
				const name = tokens[keywordIndex + 1]?.text;
				stack.push({
					startLine: i,
					indent,
					type: isClass ? 'class' : 'function',
					name
				});
			}
		}

		while (stack.length > 0) {
			const region = stack.pop()!;
			regions.push({
				startLine: region.startLine,
				endLine: lines.length - 1,
				type: region.type,
				name: region.name
			});
		}

		if (regions.length === 0 && lines.length > 0) {
			regions.push({ startLine: 0, endLine: lines.length - 1, type: 'file' });
		}

		return regions.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
	}

	private identifyGoRegions(lines: readonly Line[], tokenized: TokenizedLine[]): RawRegion[] {
		const regions: RawRegion[] = [];
		const stack: Array<{
			startLine: number;
			depth: number;
			type: ComplexityRegion['type'];
			name?: string;
		}> = [];
		let braceDepth = 0;
		let pending:
			| { line: number; type: ComplexityRegion['type']; name?: string; depth: number }
			| undefined;

		for (let i = 0; i < lines.length; i++) {
			const tokens = this.getCodeTokens(tokenized[i]?.tokens ?? []);
			const declaration = this.getGoDeclaration(tokens);
			if (declaration) {
				pending = { line: i, type: declaration.type, name: declaration.name, depth: braceDepth };
			}

			for (const token of tokens) {
				if (token.type === 'punctuation.brace' && token.text === '{') {
					braceDepth++;
					if (pending && braceDepth === pending.depth + 1) {
						stack.push({
							startLine: pending.line,
							depth: braceDepth,
							type: pending.type,
							name: pending.name
						});
						pending = undefined;
					}
				} else if (token.type === 'punctuation.brace' && token.text === '}') {
					if (stack.length > 0 && braceDepth === stack[stack.length - 1].depth) {
						const region = stack.pop()!;
						regions.push({
							startLine: region.startLine,
							endLine: i,
							type: region.type,
							name: region.name
						});
					}
					braceDepth = Math.max(0, braceDepth - 1);
					if (pending && braceDepth < pending.depth) {
						pending = undefined;
					}
				}
			}
		}

		if (regions.length === 0 && lines.length > 0) {
			regions.push({ startLine: 0, endLine: lines.length - 1, type: 'file' });
		}

		return regions.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
	}

	private getGoDeclaration(
		tokens: Token[]
	): { type: ComplexityRegion['type']; name?: string } | undefined {
		const funcIndex = tokens.findIndex((token) => token.text === 'func');
		if (funcIndex !== -1) {
			let nameIndex = funcIndex + 1;
			if (tokens[nameIndex]?.text === '(') {
				let depth = 0;
				for (let i = nameIndex; i < tokens.length; i++) {
					if (tokens[i].text === '(') depth++;
					else if (tokens[i].text === ')') {
						depth--;
						if (depth === 0) {
							nameIndex = i + 1;
							break;
						}
					}
				}
			}
			const name = tokens[nameIndex]?.text;
			if (name && /^[A-Za-z_]\w*$/.test(name) && tokens[nameIndex + 1]?.text === '(') {
				return { type: 'function', name };
			}
		}

		const typeIndex = tokens.findIndex((token) => token.text === 'type');
		if (typeIndex !== -1) {
			const name = tokens[typeIndex + 1]?.text;
			const kind = tokens[typeIndex + 2]?.text;
			if (name && (kind === 'struct' || kind === 'interface')) {
				return { type: 'class', name };
			}
		}

		return undefined;
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
			// The arrow-assignment branch (`name = (`) also matches a parenthesised
			// expression like `const x = (a - b) / c`, which is NOT a function.
			// Only treat it as one when the line actually starts an arrow: it
			// contains `=>`, or it has an unclosed `(` that opens a multi-line arrow
			// signature. Otherwise the stale candidate gets attached to the next
			// `if (...) {` block and a phantom region is reported.
			const isArrowAssignment = !!funcMatch[3] && !funcMatch[2] && !funcMatch[4] && !funcMatch[5];
			if (isArrowAssignment) {
				const opens = (text.match(/\(/g) || []).length;
				const closes = (text.match(/\)/g) || []).length;
				if (!text.includes('=>') && opens <= closes) {
					return undefined;
				}
			}
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
		region: RawRegion,
		language: SupportedComplexityLanguage,
		tokenized: TokenizedLine[]
	): ComplexityRegion {
		const factors = this.calculateFactors(lines, region.startLine, region.endLine);
		const contributions = this.calculateCognitiveContributions(region, language, tokenized);
		const cognitiveComplexity = contributions.reduce(
			(total, contribution) => total + contribution.increment,
			0
		);
		const score = this.calculateScore(cognitiveComplexity);
		const suggestion = this.getSuggestion(factors, score);

		return {
			...region,
			score,
			factors,
			suggestion,
			cognitiveComplexity,
			contributions
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

	private calculateCognitiveContributions(
		region: RawRegion,
		language: SupportedComplexityLanguage,
		tokenized: TokenizedLine[]
	): ComplexityContribution[] {
		if (language === 'python') {
			return this.calculatePythonCognitiveContributions(region, tokenized);
		}
		return this.calculateBraceCognitiveContributions(region, language, tokenized);
	}

	private calculateBraceCognitiveContributions(
		region: RawRegion,
		language: SupportedComplexityLanguage,
		tokenized: TokenizedLine[]
	): ComplexityContribution[] {
		const contributions: ComplexityContribution[] = [];
		const nestingStack: Array<{ depth: number; kind: string }> = [];
		let braceDepth = 0;
		let pendingB2: { kind: ComplexityContribution['kind']; line: number } | undefined;
		let skipIfAfterElse = false;
		const doWhileDepths: number[] = [];
		const isGo = language === 'go';

		for (let lineIndex = region.startLine; lineIndex <= region.endLine; lineIndex++) {
			const tokens = this.getCodeTokens(tokenized[lineIndex]?.tokens ?? []);
			const boolContributions = this.getBooleanSequenceContributions(
				tokens,
				lineIndex,
				nestingStack.length
			);
			contributions.push(...boolContributions);

			for (let i = 0; i < tokens.length; i++) {
				const token = tokens[i];

				if (token.type === 'punctuation.brace' && token.text === '}') {
					while (
						nestingStack.length > 0 &&
						nestingStack[nestingStack.length - 1].depth === braceDepth
					) {
						nestingStack.pop();
					}
					braceDepth = Math.max(0, braceDepth - 1);
					continue;
				}

				if (token.type === 'punctuation.brace' && token.text === '{') {
					braceDepth++;
					if (pendingB2) {
						nestingStack.push({ depth: braceDepth, kind: pendingB2.kind });
						pendingB2 = undefined;
					}
					continue;
				}

				if (token.text === 'else') {
					const next = this.nextNonTextToken(tokens, i + 1);
					if (next?.text === 'if') {
						this.addContribution(contributions, lineIndex, 'else if', 1, nestingStack.length);
						pendingB2 = { kind: 'else if', line: lineIndex };
						skipIfAfterElse = true;
					} else {
						this.addContribution(contributions, lineIndex, 'else', 1, nestingStack.length);
						pendingB2 = { kind: 'else', line: lineIndex };
					}
					continue;
				}

				if (token.text === 'if') {
					if (skipIfAfterElse) {
						skipIfAfterElse = false;
						continue;
					}
					this.addContribution(
						contributions,
						lineIndex,
						'if',
						1 + nestingStack.length,
						nestingStack.length
					);
					pendingB2 = { kind: 'if', line: lineIndex };
					continue;
				}

				if (token.text === 'for') {
					this.addContribution(
						contributions,
						lineIndex,
						'for',
						1 + nestingStack.length,
						nestingStack.length
					);
					pendingB2 = { kind: 'for', line: lineIndex };
					continue;
				}

				if (!isGo && token.text === 'do') {
					this.addContribution(
						contributions,
						lineIndex,
						'while',
						1 + nestingStack.length,
						nestingStack.length
					);
					pendingB2 = { kind: 'while', line: lineIndex };
					doWhileDepths.push(braceDepth);
					continue;
				}

				if (!isGo && token.text === 'while') {
					// The `while` that closes a do…while loop belongs to the same loop,
					// already counted at `do` (SonarSource: one increment per loop) — skip
					// it rather than double-count.
					if (doWhileDepths.length > 0 && doWhileDepths[doWhileDepths.length - 1] === braceDepth) {
						doWhileDepths.pop();
						continue;
					}
					this.addContribution(
						contributions,
						lineIndex,
						'while',
						1 + nestingStack.length,
						nestingStack.length
					);
					pendingB2 = { kind: 'while', line: lineIndex };
					continue;
				}

				if (
					token.text === 'switch' ||
					(isGo && (token.text === 'select' || this.isGoTypeSwitch(tokens, i)))
				) {
					this.addContribution(
						contributions,
						lineIndex,
						'switch',
						1 + nestingStack.length,
						nestingStack.length
					);
					pendingB2 = { kind: 'switch', line: lineIndex };
					continue;
				}

				if (!isGo && token.text === 'catch') {
					this.addContribution(
						contributions,
						lineIndex,
						'catch',
						1 + nestingStack.length,
						nestingStack.length
					);
					pendingB2 = { kind: 'catch', line: lineIndex };
					continue;
				}

				if (!isGo && token.text === '?') {
					this.addContribution(
						contributions,
						lineIndex,
						'ternary',
						1 + nestingStack.length,
						nestingStack.length
					);
					pendingB2 = { kind: 'ternary', line: lineIndex };
					continue;
				}

				if (this.isLabelledJump(tokens, i, isGo)) {
					this.addContribution(contributions, lineIndex, 'labelled-jump', 1, nestingStack.length);
					continue;
				}

				if (this.isDirectRecursiveCall(tokens, i, lineIndex, region)) {
					this.addContribution(contributions, lineIndex, 'recursion', 1, nestingStack.length);
					continue;
				}

				if (this.isNestedFunctionToken(tokens, i, lineIndex, region, language)) {
					this.addContribution(contributions, lineIndex, 'nested-function', 0, nestingStack.length);
					pendingB2 = { kind: 'nested-function', line: lineIndex };
				}
			}
		}

		return contributions;
	}

	private calculatePythonCognitiveContributions(
		region: RawRegion,
		tokenized: TokenizedLine[]
	): ComplexityContribution[] {
		const contributions: ComplexityContribution[] = [];
		const nestingStack: Array<{ indent: number; kind: string }> = [];

		for (let lineIndex = region.startLine; lineIndex <= region.endLine; lineIndex++) {
			const line = tokenized[lineIndex];
			const tokens = this.getCodeTokens(line?.tokens ?? []);
			if (tokens.length === 0) continue;

			const indent = this.getIndent(line.text);
			while (nestingStack.length > 0 && indent <= nestingStack[nestingStack.length - 1].indent) {
				nestingStack.pop();
			}

			contributions.push(
				...this.getBooleanSequenceContributions(tokens, lineIndex, nestingStack.length)
			);

			for (let i = 0; i < tokens.length; i++) {
				if (this.isDirectRecursiveCall(tokens, i, lineIndex, region)) {
					this.addContribution(contributions, lineIndex, 'recursion', 1, nestingStack.length);
				}
			}

			const first = tokens[0]?.text;
			const second = tokens[1]?.text;
			const isAsyncDef = first === 'async' && second === 'def';
			const isNestedDef = (first === 'def' || isAsyncDef) && lineIndex !== region.startLine;
			const isNestedClass = first === 'class' && lineIndex !== region.startLine;

			if (isNestedDef || isNestedClass) {
				this.addContribution(contributions, lineIndex, 'nested-function', 0, nestingStack.length);
				nestingStack.push({ indent, kind: 'nested-function' });
				continue;
			}

			if (first === 'if') {
				this.addContribution(
					contributions,
					lineIndex,
					'if',
					1 + nestingStack.length,
					nestingStack.length
				);
				nestingStack.push({ indent, kind: 'if' });
			} else if (first === 'elif') {
				this.addContribution(contributions, lineIndex, 'else if', 1, nestingStack.length);
				nestingStack.push({ indent, kind: 'else if' });
			} else if (first === 'else') {
				this.addContribution(contributions, lineIndex, 'else', 1, nestingStack.length);
				nestingStack.push({ indent, kind: 'else' });
			} else if (first === 'for') {
				this.addContribution(
					contributions,
					lineIndex,
					'for',
					1 + nestingStack.length,
					nestingStack.length
				);
				nestingStack.push({ indent, kind: 'for' });
			} else if (first === 'while') {
				this.addContribution(
					contributions,
					lineIndex,
					'while',
					1 + nestingStack.length,
					nestingStack.length
				);
				nestingStack.push({ indent, kind: 'while' });
			} else if (first === 'except') {
				this.addContribution(
					contributions,
					lineIndex,
					'catch',
					1 + nestingStack.length,
					nestingStack.length
				);
				nestingStack.push({ indent, kind: 'catch' });
			} else if (this.isPythonTernary(tokens)) {
				this.addContribution(
					contributions,
					lineIndex,
					'ternary',
					1 + nestingStack.length,
					nestingStack.length
				);
			}
		}

		return contributions;
	}

	private getCodeTokens(tokens: Token[]): Token[] {
		return tokens.filter((token) => {
			if (token.type === 'text') return token.text.trim().length > 0;
			if (token.type === 'comment' || token.type.startsWith('comment.')) return false;
			if (token.type === 'string' || token.type.startsWith('string.')) return false;
			return true;
		});
	}

	private getIndent(text: string): number {
		return text.match(/^[ \t]*/)?.[0].replace(/\t/g, '    ').length ?? 0;
	}

	private addContribution(
		contributions: ComplexityContribution[],
		line: number,
		kind: ComplexityContribution['kind'],
		increment: number,
		nesting: number
	): void {
		contributions.push({
			line,
			kind,
			increment,
			nesting,
			reason: `${this.describeContributionKind(kind)} (+${increment}, nesting ${nesting})`
		});
	}

	private describeContributionKind(kind: string): string {
		switch (kind) {
			case 'else if':
				return 'else if branch';
			case 'else':
				return 'else branch';
			case 'for':
				return 'for loop';
			case 'while':
				return 'while loop';
			case 'switch':
				return 'switch';
			case 'catch':
				return 'catch clause';
			case 'ternary':
				return 'ternary expression';
			case 'boolean-sequence':
				return 'boolean operator sequence';
			case 'labelled-jump':
				return 'labelled jump';
			case 'recursion':
				return 'recursive call';
			case 'nested-function':
				return 'nested function';
			default:
				return 'if branch';
		}
	}

	private getBooleanSequenceContributions(
		tokens: Token[],
		line: number,
		nesting: number
	): ComplexityContribution[] {
		const contributions: ComplexityContribution[] = [];
		const lastByParenDepth = new Map<number, string>();
		let parenDepth = 0;

		for (const token of tokens) {
			if (token.text === '(') {
				parenDepth++;
				continue;
			}
			if (token.text === ')') {
				lastByParenDepth.delete(parenDepth);
				parenDepth = Math.max(0, parenDepth - 1);
				continue;
			}
			if (token.text === ';' || token.text === '{' || token.text === '}' || token.text === ':') {
				lastByParenDepth.clear();
				continue;
			}
			if (
				token.text !== '&&' &&
				token.text !== '||' &&
				token.text !== 'and' &&
				token.text !== 'or'
			) {
				continue;
			}

			const normalized = token.text === 'and' ? '&&' : token.text === 'or' ? '||' : token.text;
			const previous = lastByParenDepth.get(parenDepth);
			if (previous !== normalized) {
				this.addContribution(contributions, line, 'boolean-sequence', 1, nesting);
			}
			lastByParenDepth.set(parenDepth, normalized);
		}

		return contributions;
	}

	private nextNonTextToken(tokens: Token[], start: number): Token | undefined {
		return tokens.slice(start).find((token) => token.text.trim().length > 0);
	}

	private isGoTypeSwitch(tokens: Token[], index: number): boolean {
		return (
			tokens[index].text === 'switch' &&
			tokens.slice(index + 1).some((token) => token.text === 'type')
		);
	}

	private isLabelledJump(tokens: Token[], index: number, isGo: boolean): boolean {
		const token = tokens[index];
		if (token.text === 'goto') {
			return !!tokens[index + 1] && /^[A-Za-z_]\w*$/.test(tokens[index + 1].text);
		}
		if (token.text !== 'break' && token.text !== 'continue') {
			return false;
		}
		const next = tokens[index + 1];
		if (!next) return false;
		if (isGo) {
			return /^[A-Za-z_]\w*$/.test(next.text);
		}
		return /^[A-Za-z_$][\w$]*$/.test(next.text);
	}

	private isNestedFunctionToken(
		tokens: Token[],
		index: number,
		line: number,
		region: RawRegion,
		language: SupportedComplexityLanguage
	): boolean {
		const token = tokens[index];
		if (token.text === '=>') {
			return line !== region.startLine;
		}
		if (token.text !== 'function' && token.text !== 'func') {
			return false;
		}
		if (line === region.startLine) {
			return false;
		}
		if (language === 'go') {
			return true;
		}
		return token.text === 'function';
	}

	private isDirectRecursiveCall(
		tokens: Token[],
		index: number,
		line: number,
		region: RawRegion
	): boolean {
		if (!region.name || tokens[index].text !== region.name || tokens[index + 1]?.text !== '(') {
			return false;
		}

		const previous = tokens[index - 1]?.text;
		if (previous === 'function' || previous === 'func' || previous === 'def') {
			return false;
		}
		if (
			line === region.startLine &&
			previous === ')' &&
			tokens.slice(0, index).some((t) => t.text === 'func')
		) {
			return false;
		}

		return true;
	}

	private isPythonTernary(tokens: Token[]): boolean {
		if (tokens[0]?.text === 'if') return false;
		const ifIndex = tokens.findIndex((token) => token.text === 'if');
		if (ifIndex <= 0) return false;
		return tokens.slice(ifIndex + 1).some((token) => token.text === 'else');
	}

	/**
	 * Calculate complexity score from factors
	 */
	private calculateScore(cognitiveComplexity: number): number {
		return Math.min(100, Math.round(cognitiveComplexity * COGNITIVE_SCORE_MULTIPLIER));
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
