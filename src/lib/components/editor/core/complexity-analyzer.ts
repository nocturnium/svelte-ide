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

/**
 * The Cognitive Complexity increment kinds this analyzer emits.
 *
 * A closed union rather than `string`: consumers rendering their own breakdown
 * need an exhaustive switch, and an open string silently accepted
 * `kind: 'totally-made-up-kind'` at compile time.
 */
export type ComplexityContributionKind =
	| 'if'
	| 'else'
	| 'else if'
	| 'for'
	| 'while'
	| 'switch'
	| 'catch'
	| 'ternary'
	| 'boolean-sequence'
	| 'labelled-jump'
	| 'goto'
	| 'recursion'
	| 'nested-function';

export interface ComplexityContribution {
	line: number;
	kind: ComplexityContributionKind;
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
	/**
	 * Legacy 0-100 display score.
	 *
	 * @deprecated Saturates at Cognitive Complexity 15, so everything from "worth
	 * a look" to "unmaintainable" reports exactly 100, and only 16 values are
	 * attainable. Read {@link ComplexityRegion.cognitiveComplexity}.
	 */
	score: number;
	/** Band of {@link ComplexityRegion.cognitiveComplexity}. */
	level: ComplexityMetrics['level'];
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
	/**
	 * Legacy 0-100 file score.
	 *
	 * @deprecated Not comparable between files, and it moves the wrong way:
	 * because it is a region-length-weighted mean, appending simple functions
	 * lowers it while the complex code is untouched. Read
	 * {@link ComplexityMetrics.maxCognitiveComplexity} instead.
	 */
	overall: number;
	/** Band of {@link ComplexityMetrics.maxCognitiveComplexity}. */
	level: 'low' | 'medium' | 'high' | 'critical';
	/** Per-region breakdown */
	regions: ComplexityRegion[];
	/** Lines that exceed threshold */
	hotspots: number[];
	/** Sum of exact Cognitive Complexity across all regions */
	totalCognitiveComplexity: number;
	/**
	 * Cognitive Complexity of the hottest single region — the file's headline
	 * number, and the one {@link ComplexityMetrics.level} is derived from.
	 * Unbounded: a region at 113 reports 113.
	 */
	maxCognitiveComplexity: number;
	/**
	 * What produced this reading. `builtin` is the token scanner — instant and
	 * offline, but an approximation of a parser. `provider` means a consumer's
	 * analysis (an AST pass, a language server, a model) refined it.
	 *
	 * Surfaced so the UI can say where a number came from. A reading that cannot
	 * be attributed is one a reader cannot weigh.
	 */
	source?: import('./complexity-provider').ComplexitySource;
	/** Provenance label for a provider reading — a model or tool id. */
	sourceName?: string;
}

/**
 * Cognitive Complexity band boundaries, in raw Cognitive Complexity — NOT in the
 * legacy 0-100 `score`.
 *
 * The anchor is real and citable: SonarSource's default "Cognitive Complexity of
 * a function should not be too high" rule fires at **15**, so that is where
 * `critical` starts. The lower cuts subdivide the run-up to it. Nothing here is
 * a percentage, and the top band is deliberately open-ended: a function at 113
 * is genuinely worse than one at 15, and the UI is expected to say so.
 *
 * Exported so consumers — and this library's own overlays — read the same
 * numbers instead of re-declaring magic thresholds at each call site.
 *
 * @see https://www.sonarsource.com/resources/cognitive-complexity/
 */
export const COGNITIVE_COMPLEXITY_BANDS = {
	/** 0-4: reads in one pass. */
	medium: 5,
	/** 5-9: a second read, still local. */
	high: 10,
	/** 10-14: approaching the refactor threshold. */
	critical: 15
} as const;

/**
 * Legacy 0-100 display score.
 *
 * @deprecated Saturates at Cognitive Complexity 15 — every region from "worth a
 * look" to "unmaintainable" reports exactly 100, and only 16 values are
 * attainable at all. Read {@link ComplexityRegion.cognitiveComplexity} instead,
 * which is unbounded and defensible. Retained so existing consumers keep
 * compiling; this library's own UI no longer displays it.
 */
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

		const maxCognitiveComplexity = this.calculateMaxCognitive(analyzedRegions);

		const metrics: ComplexityMetrics = {
			overall,
			level: getComplexityLevel(maxCognitiveComplexity),
			regions: analyzedRegions,
			hotspots,
			totalCognitiveComplexity,
			maxCognitiveComplexity
		};

		this.cacheKey = key;
		this.cache.set(key, metrics);

		return metrics;
	}

	/**
	 * Get complexity for a specific line
	 */
	getLineComplexity(metrics: ComplexityMetrics, line: number): number {
		// Raw Cognitive Complexity, not the deprecated score — this accessor was the
		// one public path still handing the saturating value out.
		// A line can sit inside several nested regions; report the highest so an
		// inner simple region never masks the hot function around it.
		let best = 0;
		for (const region of metrics.regions) {
			if (line >= region.startLine && line <= region.endLine && region.cognitiveComplexity > best) {
				best = region.cognitiveComplexity;
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
			// Skip braces inside strings, comments and regex literals
			let inString: string | null = null;
			let inLineComment = false;
			let inRegex = false;
			let inRegexClass = false;
			// Last non-space character, to tell a regex literal from division.
			let prevSignificant = '';

			for (let ch = 0; ch < text.length; ch++) {
				const c = text[ch];
				const next = text[ch + 1];

				// Inside a regex literal: consume to the closing delimiter. A `{` here
				// is a quantifier or a literal brace, never a block. Missing this made
				// `/[{,]\\s*$/` inflate the brace depth so its enclosing function never
				// closed — one 20-line method in this repo's own YAML tokenizer was
				// reported as 379 lines at cognitive complexity 127.
				if (inRegex) {
					if (c === '\\') {
						ch++;
					} else if (inRegexClass) {
						if (c === ']') inRegexClass = false;
					} else if (c === '[') {
						inRegexClass = true;
					} else if (c === '/') {
						inRegex = false;
					}
					continue;
				}

				// Handle line comments
				if (!inString && c === '/' && next === '/') {
					inLineComment = true;
					break;
				}

				// Handle strings
				if (!inLineComment) {
					if (inString) {
						// Consume the escape and its target together. Looking BACK at
						// `text[ch - 1] !== '\\'` mis-reads a literal ending in an escaped
						// backslash — in `"\\"` the character before the closing quote IS a
						// backslash, so the string never closed, the rest of the line
						// (including its `{`) was swallowed, brace depth desynchronised and
						// the enclosing region truncated. Measured across this repo: 58
						// truncated regions, the worst reporting cognitive complexity 2 for a
						// function whose true value is 39 — an under-report, which is the
						// dangerous direction: it calls the hottest function in a file fine.
						if (c === '\\') {
							ch++;
							continue;
						}
						if (c === inString) {
							inString = null;
						}
						continue;
					} else if (c === '"' || c === "'" || c === '`') {
						inString = c;
						prevSignificant = c;
						continue;
					}
				}

				// A `/` starts a regex only where a value may begin; after an operand it
				// is division. `a / b` must not swallow the rest of the line.
				if (!inString && !inLineComment && c === '/' && next !== '/' && next !== '*') {
					if (prevSignificant === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prevSignificant)) {
						inRegex = true;
						continue;
					}
				}

				if (c.trim() !== '') prevSignificant = c;

				if (!inString && !inLineComment) {
					// A statement end retires an unconsumed definition candidate. A
					// concise arrow whose body sits on the NEXT line —
					// `const isImportLine = (t) =>` / `  /^\s*import\b/.test(t);` —
					// left the candidate pending, and it then attached to the next
					// unrelated `{` (the following `for` loop), producing a region that
					// swallowed its enclosing function: 21 lines at cognitive complexity
					// 13 against a truth of 0.
					if (c === ';' && pendingDef && braceDepth === pendingDef.depth) {
						pendingDef = undefined;
					}

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

			for (let t = 0; t < tokens.length; t++) {
				const token = tokens[t];
				if (token.type === 'punctuation.brace' && token.text === '{') {
					braceDepth++;
					// `interface{}` and `struct{}` are TYPE LITERALS, not bodies. They
					// appear in parameter lists, return types, map values, channels and
					// variadics, and their brace would otherwise open the region on the
					// signature and close it on the very next token — which reported
					// cognitive complexity 0 for any Go function whose signature
					// mentions one. That is most non-trivial Go.
					//
					// The keyword before the brace is what settles it, and it has to be:
					// a return-position `func F() interface{} {` puts the literal AFTER
					// the parameter list, where a rule based on the last `)` accepts the
					// literal's brace and rejects the real body.
					//
					// `type X struct {` is the one shape where this brace IS the body.
					// That arrives as a 'class' pending, so it is excluded below.
					const previous = tokens[t - 1]?.text;
					const isTypeLiteral =
						pending?.type === 'function' && (previous === 'interface' || previous === 'struct');

					if (pending && !isTypeLiteral && braceDepth === pending.depth + 1) {
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
			// `(` for an ordinary function, `[` for a generic one: `func Map[T any](…)`.
			// Requiring `(` dropped every generic function on the floor — no region at
			// all, so the file-level fallback claimed the whole file and the function
			// lost its name.
			const follower = tokens[nameIndex + 1]?.text;
			if (name && /^[A-Za-z_]\w*$/.test(name) && (follower === '(' || follower === '[')) {
				return { type: 'function', name };
			}
		}

		const typeIndex = tokens.findIndex((token) => token.text === 'type');
		if (typeIndex !== -1) {
			const name = tokens[typeIndex + 1]?.text;
			let kindIndex = typeIndex + 2;
			// Step over generic parameters the same way: `type Stack[T any] struct {`.
			if (tokens[kindIndex]?.text === '[') {
				let depth = 0;
				for (let i = kindIndex; i < tokens.length; i++) {
					if (tokens[i].text === '[') depth++;
					else if (tokens[i].text === ']') {
						depth--;
						if (depth === 0) {
							kindIndex = i + 1;
							break;
						}
					}
				}
			}
			const kind = tokens[kindIndex]?.text;
			if (name && (kind === 'struct' || kind === 'interface')) {
				return { type: 'class', name };
			}
		}

		return undefined;
	}

	/**
	 * Is the `{` at `ch` the opening brace of a function/class BODY?
	 *
	 * Used by the brace-language scanner only. Go does NOT come through here — it
	 * has its own region pass, and this rule is actively wrong for it: the last-`)`
	 * anchor accepts the literal's brace in `func F() interface{} {` and rejects the
	 * real body. See the type-literal guard in `identifyGoRegions`.
	 *
	 * The shape that previously fooled this truncated the region and silently
	 * under-reported:
	 *
	 *   `): Promise<{ content: string }> {`  — the object type inside the generic
	 *       matched first, so the region opened and closed on the return type.
	 */
	private isDefOpeningBrace(text: string, ch: number, type: 'function' | 'class'): boolean {
		// For class: `class Foo {` — the `{` follows the class name
		if (type === 'class') {
			return true; // First `{` on a class line is the class body
		}

		const before = text.slice(0, ch).trimEnd();
		if (before.endsWith('=>')) return true;

		const lastParen = before.lastIndexOf(')');
		if (lastParen === -1) return false;
		const after = before.slice(lastParen + 1);

		// An unclosed `<` between the parameter list and this brace means the brace
		// belongs to a generic argument, not the body.
		const opens = (after.match(/</g) || []).length;
		const closes = (after.match(/>/g) || []).length;
		if (opens > closes) return false;

		// An `=` means a default value, not a return type.
		if (after.includes('=')) return false;

		// Exactly three shapes may sit between the parameter list and a body brace:
		//   nothing            `function f() {`
		//   `: T`, T non-empty `function f(): string {`   (an empty `: ` means the
		//                       brace IS the return type, as in `): { a: string } {`)
		//   a bare type        `func Handle() int {`      (Go has no colon)
		return (
			/^\s*$/.test(after) ||
			/^\s*:\s*[^{};=]+$/.test(after) ||
			/^\s*[\w[\]*.]+[\w[\]*.\s]*$/.test(after)
		);
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

				// A CONCISE arrow — `const depth = () => xs.length + n;` — has no block,
				// so there is no body brace for its region to close on. The candidate
				// stayed pending and attached to the next unrelated `{`, producing a
				// region that swallowed the enclosing function: `effectiveNesting` in
				// this very file measured cc 107 against a truth of 0, and because the
				// phantom sorts first it took regions[0] AND set maxCognitiveComplexity.
				// Block-bodied arrows are unaffected — they open a real region.
				const arrowAt = text.indexOf('=>');
				if (arrowAt !== -1) {
					const afterArrow = text.slice(arrowAt + 2).trim();
					// `=> {` opens a block; `=> (` may open a multi-line parenthesised
					// body; anything else on the line is a concise expression body.
					if (afterArrow !== '' && !afterArrow.startsWith('{')) {
						return undefined;
					}
				}
			}
			// The method-style branch (`name(params) {`) also matches a CALL whose
			// argument happens to be a function — `xs.map(function (x) {` captured
			// `map` and produced a phantom region named after the method, which then
			// became regions[0] and shadowed the real enclosing function in every
			// headline that reads the first region. Two signals rule it out: a name
			// reached through `.` is a call, not a declaration; and a parameter list
			// that itself contains `function` or `=>` is an argument list.
			if (funcMatch[4] && !funcMatch[2] && !funcMatch[3] && !funcMatch[5]) {
				const at = funcMatch.index ?? text.indexOf(funcMatch[4]);
				const before = text.slice(0, at).trimEnd();
				const params = text.slice(at + funcMatch[4].length);
				if (before.endsWith('.') || /\bfunction\b|=>/.test(params)) {
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
		const suggestion = this.getSuggestion(factors, cognitiveComplexity);

		return {
			...region,
			score,
			level: getComplexityLevel(cognitiveComplexity),
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
		// Region-scoped so a wrapped condition is scored the same as a one-liner.
		const booleanState = { lastByParenDepth: new Map<number, string>(), parenDepth: 0 };
		const doWhileDepths: number[] = [];
		const isGo = language === 'go';
		/**
		 * Ternaries chained in the alternate — `a ? x : b ? y : z` — are NESTED, and a
		 * structural increment carries the nesting penalty, so the second is +2 and
		 * the chain scores 3 rather than 2. The nesting stack only pushes on braces,
		 * so a brace-less chain never registered. Region-scoped rather than per-line,
		 * so a Prettier-wrapped chain scores the same as a one-line one.
		 */
		let ternaryDepth = 0;
		/**
		 * Nesting contributed by BRACELESS bodies.
		 *
		 * `nestingStack` only pushes when a `{` consumes the pending latch, so
		 * `if (a) if (b) if (c)` scored 3 where SonarSource says 6 — every
		 * contribution reported `nesting 0`. Nesting is the central rule of the
		 * metric, and a brace is not part of it. A construct that arms the latch
		 * raises this depth immediately; a `{` that consumes the latch moves the
		 * nesting onto `nestingStack` and resets this, and a statement end clears it.
		 */
		let bracelessDepth = 0;
		/** Paren depth, so a `;` inside `for (;;)` is not a statement end. */
		let parenDepth = 0;
		const effectiveNesting = () => nestingStack.length + bracelessDepth;
		// Tokens that can only sit between two INDEPENDENT ternaries, never between
		// the two halves of a chain — so seeing one ends the chain.
		const TERNARY_RESET = new Set([
			';',
			',',
			// `)`, `&&` and `||` close off a ternary: `(a?1:2) && (b?3:4)` is two
			// SIBLINGS, not a chain. Omitting them let ternaryDepth climb across
			// independent ternaries and scored that expression 8 against a truth of 4.
			')',
			'&&',
			'||',
			'{',
			'}',
			'return',
			'const',
			'let',
			'var',
			'if',
			'for',
			'while',
			'case'
		]);

		for (let lineIndex = region.startLine; lineIndex <= region.endLine; lineIndex++) {
			const rawTokens = tokenized[lineIndex]?.tokens ?? [];
			const tokens = this.getCodeTokens(rawTokens);
			// Ordinal of the `?` currently being examined, counted across the line.
			// `isRealTernary` has to consult the UNFILTERED stream (see its doc), and
			// `?` survives filtering, so the nth `?` here is the nth `?` there.
			let questionOrdinal = 0;
			const boolContributions = this.getBooleanSequenceContributions(
				tokens,
				lineIndex,
				effectiveNesting(),
				booleanState
			);
			contributions.push(...boolContributions);

			for (let i = 0; i < tokens.length; i++) {
				const token = tokens[i];

				if (token.text === '(') parenDepth++;
				else if (token.text === ')') parenDepth = Math.max(0, parenDepth - 1);

				// Statement end: nothing braceless survives it. The parenDepth guard keeps
				// `for (a; b; c)` intact in brace languages; the loop-kind guard does the
				// same for Go, whose `for i := 0; i < n; i++` header has no parentheses at
				// all, so its separators would otherwise disarm the loop before its brace.
				//
				// Go puts an unparenthesised `;` in `if` and `switch` headers too —
				// `if x := f(); x > 0 {` — so those kinds are exempt as well, but only in
				// Go. A bare `;` terminator is vanishingly rare there (gofmt removes it),
				// whereas in a brace language it genuinely ends the statement.
				const goHeaderSeparator =
					language === 'go' && (pendingB2?.kind === 'if' || pendingB2?.kind === 'switch');
				if (
					token.text === ';' &&
					parenDepth === 0 &&
					!goHeaderSeparator &&
					pendingB2?.kind !== 'for' &&
					pendingB2?.kind !== 'while'
				) {
					bracelessDepth = 0;
					pendingB2 = undefined;
				}

				if (TERNARY_RESET.has(token.text)) ternaryDepth = 0;

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
					// A composite literal in a Go control header is not the block body.
					// `if x := (Point{1, 2}); x.X > 0 {` gave the latch to the LITERAL's
					// brace, which closed on the same line and popped the nesting again,
					// so the body ran at depth 0 and everything inside was undercounted.
					//
					// Go requires such a literal to be parenthesised precisely because it
					// is otherwise ambiguous with the block brace, so paren depth is the
					// language's own disambiguator rather than a guess.
					const goCompositeLiteral = language === 'go' && parenDepth > 0;
					if (pendingB2 && !goCompositeLiteral) {
						// The brace takes ownership of the nesting the latch was holding,
						// so it moves from bracelessDepth onto the stack rather than being
						// counted twice.
						nestingStack.push({ depth: braceDepth, kind: pendingB2.kind });
						pendingB2 = undefined;
						bracelessDepth = Math.max(0, bracelessDepth - 1);
					}
					continue;
				}

				if (token.text === 'else') {
					const next = this.nextNonTextToken(tokens, i + 1);
					if (next?.text === 'if') {
						this.addContribution(contributions, lineIndex, 'else if', 1, effectiveNesting());
						pendingB2 = { kind: 'else if', line: lineIndex };
						bracelessDepth++;
						skipIfAfterElse = true;
					} else {
						this.addContribution(contributions, lineIndex, 'else', 1, effectiveNesting());
						pendingB2 = { kind: 'else', line: lineIndex };
						bracelessDepth++;
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
						1 + effectiveNesting(),
						effectiveNesting()
					);
					pendingB2 = { kind: 'if', line: lineIndex };
					bracelessDepth++;
					continue;
				}

				if (token.text === 'for') {
					this.addContribution(
						contributions,
						lineIndex,
						'for',
						1 + effectiveNesting(),
						effectiveNesting()
					);
					pendingB2 = { kind: 'for', line: lineIndex };
					bracelessDepth++;
					continue;
				}

				if (!isGo && token.text === 'do') {
					this.addContribution(
						contributions,
						lineIndex,
						'while',
						1 + effectiveNesting(),
						effectiveNesting()
					);
					pendingB2 = { kind: 'while', line: lineIndex };
					bracelessDepth++;
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
						1 + effectiveNesting(),
						effectiveNesting()
					);
					pendingB2 = { kind: 'while', line: lineIndex };
					bracelessDepth++;
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
						1 + effectiveNesting(),
						effectiveNesting()
					);
					pendingB2 = { kind: 'switch', line: lineIndex };
					bracelessDepth++;
					continue;
				}

				if (!isGo && token.text === 'catch') {
					this.addContribution(
						contributions,
						lineIndex,
						'catch',
						1 + effectiveNesting(),
						effectiveNesting()
					);
					pendingB2 = { kind: 'catch', line: lineIndex };
					bracelessDepth++;
					continue;
				}

				if (!isGo && token.text === '?') {
					const isTernary = this.isRealTernary(rawTokens, questionOrdinal);
					questionOrdinal++;
					if (!isTernary) continue;
					const ternaryNesting = effectiveNesting() + ternaryDepth;
					ternaryDepth++;
					this.addContribution(
						contributions,
						lineIndex,
						'ternary',
						1 + ternaryNesting,
						ternaryNesting
					);
					// NOT bracelessDepth: a ternary's nesting is tracked by ternaryDepth,
					// which distinguishes a chain (`a?x:b?y:z`, nested) from siblings
					// (`(a?1:2) && (b?3:4)`, not). Incrementing both double-counted.
					pendingB2 = { kind: 'ternary', line: lineIndex };
					continue;
				}

				if (this.isLabelledJump(tokens, i, isGo)) {
					this.addContribution(contributions, lineIndex, 'labelled-jump', 1, effectiveNesting());
					continue;
				}

				if (this.isDirectRecursiveCall(tokens, i, lineIndex, region)) {
					this.addContribution(contributions, lineIndex, 'recursion', 1, effectiveNesting());
					continue;
				}

				if (this.isNestedFunctionToken(tokens, i, lineIndex, region, language)) {
					this.addContribution(contributions, lineIndex, 'nested-function', 0, nestingStack.length);
					pendingB2 = { kind: 'nested-function', line: lineIndex };
					bracelessDepth++;
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
		// Region-scoped so a wrapped condition is scored the same as a one-liner.
		const booleanState = { lastByParenDepth: new Map<number, string>(), parenDepth: 0 };

		for (let lineIndex = region.startLine; lineIndex <= region.endLine; lineIndex++) {
			const line = tokenized[lineIndex];
			const tokens = this.getCodeTokens(line?.tokens ?? []);
			if (tokens.length === 0) continue;

			const indent = this.getIndent(line.text);
			while (nestingStack.length > 0 && indent <= nestingStack[nestingStack.length - 1].indent) {
				nestingStack.pop();
			}

			contributions.push(
				...this.getBooleanSequenceContributions(
					tokens,
					lineIndex,
					nestingStack.length,
					booleanState
				)
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

			// A `lambda` is a nested function: no increment of its own, but it raises
			// nesting for whatever it contains — exactly as a JS arrow does. Without
			// this, `g = lambda v: 1 if v else 0` scored 1 while the arrow it
			// translates to scored 2, and the arrow's 2 is the oracle-verified value.
			//
			// It does not push onto nestingStack: a lambda is a single expression, so
			// its scope ends with the line rather than with the indent block.
			const lambdaCount = tokens.filter((token) => token.text === 'lambda').length;
			for (let depth = 0; depth < lambdaCount; depth++) {
				this.addContribution(
					contributions,
					lineIndex,
					'nested-function',
					0,
					nestingStack.length + depth
				);
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
			} else if (first === 'match' && tokens[tokens.length - 1]?.text === ':') {
				// `match` is a SOFT keyword — still a perfectly ordinary identifier, and
				// `match = re.match(...)` is one of the most common lines in Python.
				// Requiring the statement to end in a colon separates the two, and is
				// the same shape the language itself uses to disambiguate.
				this.addContribution(
					contributions,
					lineIndex,
					'switch',
					1 + nestingStack.length,
					nestingStack.length
				);
				nestingStack.push({ indent, kind: 'switch' });
			} else if (this.isPythonTernary(tokens)) {
				// A ternary inside a lambda sits one level deeper per enclosing lambda,
				// counting only those that open before the `if`.
				const ifIndex = tokens.findIndex((token) => token.text === 'if');
				const enclosingLambdas = tokens
					.slice(0, ifIndex)
					.filter((token) => token.text === 'lambda').length;
				const nesting = nestingStack.length + enclosingLambdas;
				this.addContribution(contributions, lineIndex, 'ternary', 1 + nesting, nesting);
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

	/**
	 * Boolean-operator sequence increments for one line.
	 *
	 * `state` is owned by the CALLER and threaded across every line of the region,
	 * because a sequence does not end at a line break. Building it per line made the
	 * score depend on formatting: one increment when a condition fits on one line,
	 * one per operator once Prettier wrapped the identical expression. Measured, a
	 * 16-term `&&` chain scored 2 on one line and 16 wrapped — Simple to past the
	 * refactor threshold with no semantic change. SonarSource awards one increment
	 * per sequence precisely so that layout is irrelevant.
	 */
	private getBooleanSequenceContributions(
		tokens: Token[],
		line: number,
		nesting: number,
		state: { lastByParenDepth: Map<number, string>; parenDepth: number }
	): ComplexityContribution[] {
		const contributions: ComplexityContribution[] = [];
		const lastByParenDepth = state.lastByParenDepth;
		let parenDepth = state.parenDepth;

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.text === '(') {
				parenDepth++;
				continue;
			}
			if (token.text === ')') {
				lastByParenDepth.delete(parenDepth);
				parenDepth = Math.max(0, parenDepth - 1);
				continue;
			}
			// `,` ends a sequence; `:` does NOT. A ternary's colon sits in the middle of
			// an expression, and clearing on it split `(a?1:2) && (b?3:4)` into two runs
			// so the single `&&` chain was charged twice.
			if (token.text === ';' || token.text === ',' || token.text === '{' || token.text === '}') {
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

			// `||=` and `&&=` are ASSIGNMENTS, not boolean sequences. The tokenizer
			// emits them as the operator followed by `=`, so `a.x ||= 1` was
			// indistinguishable from a real `a || b` chain and took a +1 the reader
			// never pays — there is no second branch to hold in your head. `??=` was
			// already correct only because `??` is not in the operator list at all.
			//
			// This returns BEFORE recording the run, so a logical assignment also
			// cannot start or extend a sequence.
			let next = i + 1;
			while (next < tokens.length && tokens[next].text.trim() === '') next++;
			if (tokens[next]?.text === '=') continue;

			const normalized = token.text === 'and' ? '&&' : token.text === 'or' ? '||' : token.text;
			const previous = lastByParenDepth.get(parenDepth);
			if (previous !== normalized) {
				this.addContribution(contributions, line, 'boolean-sequence', 1, nesting);
			}
			lastByParenDepth.set(parenDepth, normalized);
		}

		state.parenDepth = parenDepth;

		// End of line ends the SEQUENCE unless the line is obviously continued.
		// Removing the `:` reset fixed a JS ternary splitting a single `&&` chain in
		// two, but `:` and the newline are the only statement terminators Python and
		// Go have, so two separate `and`-chains collapsed into one increment in both
		// — and in JS written without semicolons. A line is continued when it ends on
		// an operator or comma, or when a bracket is still open; otherwise the
		// statement is over. This keeps the wrapped-condition invariant (a `&&` chain
		// broken across lines still scores once) without merging separate statements.
		const tail = tokens[tokens.length - 1]?.text ?? '';
		const continues =
			parenDepth > 0 ||
			tail === '&&' ||
			tail === '||' ||
			tail === 'and' ||
			tail === 'or' ||
			tail === ',' ||
			tail === '(' ||
			tail === '=' ||
			tail === '+';
		if (!continues) {
			lastByParenDepth.clear();
			state.parenDepth = 0;
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

	/**
	 * Nearest token in `step` direction that is not pure whitespace.
	 */
	private significantNeighbor(tokens: Token[], index: number, step: 1 | -1): Token | undefined {
		for (let i = index + step; i >= 0 && i < tokens.length; i += step) {
			if (tokens[i].text.trim() !== '') return tokens[i];
		}
		return undefined;
	}

	/**
	 * Is the `ordinal`-th `?` on this line a real conditional (ternary) operator?
	 *
	 * Takes the UNFILTERED token stream on purpose. `getCodeTokens` drops string and
	 * template tokens so that keywords inside literals are not counted as branches —
	 * but that also removes a ternary's consequent, leaving `?` directly adjacent to
	 * `:` and making `c ? 'a' : 'b'` indistinguishable from the TS optional member
	 * `name?: T`. Filtering first silently dropped every string-branch ternary,
	 * which is the most common shape in the language; the homepage hero read 15
	 * when SonarSource says 16.
	 *
	 * Three constructs produce a bare `?` and introduce NO branch:
	 *
	 *   optional chaining        `a?.b`       -> `?` followed by `.`
	 *   nullish coalescing       `a ?? b`     -> two adjacent `?` tokens
	 *   TS optional param/prop   `name?: T`   -> `?` followed by `:`
	 *
	 * SonarSource specifies this exclusion directly: Cognitive Complexity "ignores
	 * null-coalescing operators", with `a?.myObj` as the worked example. Ternaries,
	 * by contrast, take a structural increment WITH the nesting penalty.
	 *
	 * @see https://www.sonarsource.com/docs/CognitiveComplexity.pdf
	 */
	private isRealTernary(rawTokens: Token[], ordinal: number): boolean {
		let seen = -1;
		let index = -1;
		for (let i = 0; i < rawTokens.length; i++) {
			if (rawTokens[i].text === '?') {
				seen++;
				if (seen === ordinal) {
					index = i;
					break;
				}
			}
		}
		if (index === -1) return false;

		// Second `?` of a `??` pair.
		if (this.significantNeighbor(rawTokens, index, -1)?.text === '?') return false;

		const next = this.significantNeighbor(rawTokens, index, 1);
		if (!next) return false;

		// `?.` optional chaining, `??` nullish coalescing, `?:` optional member.
		return next.text !== '.' && next.text !== '?' && next.text !== ':';
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

		// A member call is not recursion unless the receiver is the instance itself.
		// `db.save(x)` inside `save()` — and `this.contexts.clear()` inside `clear()`
		// — matched the region name and took a false +1 each, so every delegating
		// wrapper in a service layer reported recursion. The tooltip printed the
		// claim against a specific line, which is worse than a wrong total.
		if (previous === '.') {
			const receiver = tokens[index - 2]?.text;
			if (receiver !== 'this' && receiver !== 'self') return false;
		}
		if (
			line === region.startLine &&
			previous === ')' &&
			tokens.slice(0, index).some((t) => t.text === 'func')
		) {
			return false;
		}

		// A declaration is not a call to itself. Only `function`/`func`/`def` were
		// excluded, but a JS/TS class method, object-literal method, getter or setter
		// has no such keyword — so `name(` on its own declaration line matched the
		// region name and every method took a phantom +1 recursion increment. An
		// identical body scored 13 as a free function and 14 as a method, and twenty
		// trivial branchless methods reported a total of 20 against a truth of 0.
		if (line === region.startLine && this.isDeclarationPosition(tokens, index)) {
			return false;
		}

		return true;
	}

	/**
	 * Is `tokens[index]` the NAME being declared, rather than a call to it?
	 *
	 * True when nothing before it on the line can begin a call expression: the name
	 * is first, or is preceded only by declaration-position keywords/modifiers
	 * (`get`, `set`, `async`, `static`, `public`, `*`, …) or by a member separator
	 * in an object literal.
	 */
	private isDeclarationPosition(tokens: Token[], index: number): boolean {
		const DECLARATION_MODIFIERS = new Set([
			'get',
			'set',
			'async',
			'static',
			'public',
			'private',
			'protected',
			'readonly',
			'abstract',
			'override',
			'export',
			'default',
			'*'
		]);

		for (let i = index - 1; i >= 0; i--) {
			const text = tokens[i].text;
			if (text.trim() === '') continue;
			// `{` / `,` / `;` open a member slot in a class body or object literal.
			if (text === '{' || text === ',' || text === ';') return true;
			if (DECLARATION_MODIFIERS.has(text)) continue;
			// A decorator sits between the member slot and the name and is not a call
			// expression. `@Input() compute()` otherwise read the DECORATOR's closing
			// paren as evidence that `compute` was being called, so every decorated
			// method took a phantom +1 recursion increment against its own name.
			const decorator = this.decoratorStart(tokens, i);
			if (decorator !== -1) {
				i = decorator; // the loop's own i-- steps past the `@`
				continue;
			}
			return false;
		}
		return true;
	}

	/**
	 * If the tokens ending at `index` form a decorator, return the index of its
	 * `@`; otherwise -1.
	 *
	 * Handles all four shapes, because the narrow ones are not enough: a check for
	 * `@Name` alone misses `@Foo.Bar()`, and one that only skips a paren group
	 * misses `@ns.Dec`. Both appear in ordinary Angular and NestJS code.
	 *
	 *   `@Input`  `@Input()`  `@Input({ alias: 'x' })`  `@Foo.Bar()`  `@ns.Dec`
	 */
	private decoratorStart(tokens: Token[], index: number): number {
		let i = index;
		const skipBlank = () => {
			while (i >= 0 && tokens[i].text.trim() === '') i--;
		};

		skipBlank();
		if (i < 0) return -1;

		// An optional balanced argument list. Only parens are counted, so an object
		// literal argument passes through without confusing the depth.
		if (tokens[i].text === ')') {
			let depth = 0;
			while (i >= 0) {
				const text = tokens[i].text;
				if (text === ')') depth++;
				else if (text === '(') {
					depth--;
					if (depth === 0) {
						i--;
						break;
					}
				}
				i--;
			}
			if (depth !== 0) return -1;
		}

		// A dotted identifier chain: `Dec`, `ns.Dec`, `Foo.Bar`.
		skipBlank();
		let sawName = false;
		while (i >= 0) {
			const text = tokens[i].text;
			if (text.trim() === '') {
				i--;
				continue;
			}
			if (!/^[A-Za-z_$][\w$]*$/.test(text)) break;
			sawName = true;
			i--;
			skipBlank();
			if (i >= 0 && tokens[i].text === '.') {
				i--;
				continue;
			}
			break;
		}
		if (!sawName) return -1;

		skipBlank();
		return i >= 0 && tokens[i].text === '@' ? i : -1;
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
	private getSuggestion(
		factors: ComplexityFactors,
		cognitiveComplexity: number
	): string | undefined {
		if (cognitiveComplexity < COGNITIVE_COMPLEXITY_BANDS.medium) {
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

		if (cognitiveComplexity >= COGNITIVE_COMPLEXITY_BANDS.high) {
			return 'High cognitive complexity. This code may be difficult to understand and maintain.';
		}

		return undefined;
	}

	/**
	 * Find hotspot lines (lines in high-complexity regions)
	 */
	private findHotspots(regions: ComplexityRegion[]): number[] {
		// Deduplicated and sorted. Regions overlap — an inner block sits inside its
		// enclosing function — and pushing every line of every qualifying region
		// counted the shared lines once per region. Measured: 12 "hotspot lines" in
		// an 8-line file, i.e. 150% of the document, on a stat the demo renders as a
		// headline number.
		const hotspots = new Set<number>();

		for (const region of regions) {
			if (region.cognitiveComplexity >= COGNITIVE_COMPLEXITY_BANDS.high) {
				for (let i = region.startLine; i <= region.endLine; i++) {
					hotspots.add(i);
				}
			}
		}

		return [...hotspots].sort((a, b) => a - b);
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
		const highComplexityCount = regions.filter(
			(r) => r.cognitiveComplexity >= COGNITIVE_COMPLEXITY_BANDS.high
		).length;
		const boost = Math.min(10, highComplexityCount * 2);

		return Math.min(100, Math.round(avgScore + boost));
	}

	/**
	 * The file's headline Cognitive Complexity: the hottest single region.
	 *
	 * Deliberately a MAX, not a mean. The legacy {@link ComplexityMetrics.overall}
	 * averages region scores weighted by region length, which means appending
	 * trivially simple functions drags the file's number down without touching a
	 * line of the complex code — measured 100/"critical" -> 25/"low" from padding
	 * alone, with the hot function and the total Cognitive Complexity unchanged.
	 * A number you can improve by writing more code is not a number worth showing.
	 */
	private calculateMaxCognitive(regions: ComplexityRegion[]): number {
		// FUNCTION regions only. Cognitive Complexity is defined per function; a
		// class region aggregates every method it contains, so including it made the
		// file's headline a class — one tokenizer here reported its class at 215
		// while its hottest actual method was 46 — under a label reading "hottest
		// function". Falls back to the widest available scope when a file has no
		// function region at all, so the number never silently becomes zero.
		let max = 0;
		let sawFunction = false;
		for (const region of regions) {
			if (region.type !== 'function') continue;
			sawFunction = true;
			if (region.cognitiveComplexity > max) max = region.cognitiveComplexity;
		}
		if (sawFunction) return max;
		for (const region of regions) {
			if (region.cognitiveComplexity > max) max = region.cognitiveComplexity;
		}
		return max;
	}
}

/**
 * Band for a raw Cognitive Complexity value.
 *
 * `critical` starts at SonarSource's published refactor threshold of 15; it is
 * open-ended by design, so callers should show the underlying number alongside
 * the band rather than treating the band as the whole story.
 */
/**
 * Stable identity for a region, shared by every component that renders or
 * flashes one.
 *
 * It was previously re-declared in three places: CustomEditor keyed on the
 * deprecated `score` while both overlays keyed on `cognitiveComplexity`. Since
 * `score = min(100, cc * 7)`, the keys could never match for any region actually
 * drawn, so jump-to-hottest silently never flashed. A retained deprecated field
 * quietly rotted a feature; one exported function removes the class of bug.
 */
export function getComplexityRegionKey(region: ComplexityRegion): string {
	return `${region.startLine}:${region.endLine}:${region.name ?? region.type}:${region.cognitiveComplexity}`;
}

/**
 * Human label for a band — the single source of the vocabulary.
 *
 * The tooltip said "Medium/High/Critical" while the legend and meter said
 * "Moderate/Complex/Refactor", for the same band, in the same viewport, with the
 * legend nominally the key that decodes the chip. "Refactor" over "Critical"
 * because the band starts at SonarSource's refactor threshold: a prompt to
 * restructure, not an emergency.
 */
export function getComplexityBandLabel(level: ComplexityMetrics['level']): string {
	if (level === 'critical') return 'Refactor';
	if (level === 'high') return 'Complex';
	if (level === 'medium') return 'Moderate';
	return 'Simple';
}

export function getComplexityLevel(cognitiveComplexity: number): ComplexityMetrics['level'] {
	if (cognitiveComplexity >= COGNITIVE_COMPLEXITY_BANDS.critical) return 'critical';
	if (cognitiveComplexity >= COGNITIVE_COMPLEXITY_BANDS.high) return 'high';
	if (cognitiveComplexity >= COGNITIVE_COMPLEXITY_BANDS.medium) return 'medium';
	return 'low';
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
