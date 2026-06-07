/**
 * Bracket Healer
 *
 * Intelligent bracket completion and morphing system.
 * Detects mismatched brackets and suggests "ghost brackets"
 * to heal document structure.
 */

import type { Position } from './state';

/**
 * Bracket pair definition
 */
export interface BracketPair {
	open: string;
	close: string;
	/** Language-specific (e.g., JSX angle brackets) */
	language?: string[];
}

/**
 * Bracket match result
 */
export interface BracketMatch {
	/** Opening bracket position */
	openPos: Position;
	/** Closing bracket position (null if unmatched) */
	closePos: Position | null;
	/** Bracket type */
	type: BracketPair;
	/** Whether this pair is complete */
	isComplete: boolean;
	/** Nesting depth */
	depth: number;
}

/**
 * Ghost bracket suggestion
 */
export interface GhostBracket {
	/** Unique ID */
	id: string;
	/** Position where ghost should appear */
	position: Position;
	/** Character to insert */
	character: string;
	/** Type: 'open' or 'close' */
	type: 'open' | 'close';
	/** Matching bracket position */
	matchPosition: Position;
	/** Confidence score (0-1) */
	confidence: number;
	/** Suggested fix reason */
	reason: string;
	/** Whether user dismissed this suggestion */
	dismissed: boolean;
}

/**
 * Bracket mismatch diagnostic
 */
export interface BracketMismatch {
	/** Position of the problematic bracket */
	position: Position;
	/** The bracket character */
	character: string;
	/** Expected bracket (if mismatched) */
	expected?: string;
	/** Type of issue */
	issue: 'unclosed' | 'unexpected' | 'mismatched';
	/** Severity */
	severity: 'error' | 'warning' | 'info';
}

/**
 * Bracket healer state
 */
export interface BracketHealerState {
	/** All bracket matches */
	matches: BracketMatch[];
	/** Ghost bracket suggestions */
	ghosts: GhostBracket[];
	/** Mismatch diagnostics */
	mismatches: BracketMismatch[];
	/** Whether healing is enabled */
	enabled: boolean;
}

/**
 * Bracket healer configuration
 */
export interface BracketHealerConfig {
	/** Bracket pairs to match */
	pairs: BracketPair[];
	/** Minimum confidence to show ghost */
	minConfidence: number;
	/** Maximum ghost suggestions */
	maxGhosts: number;
	/** Debounce time for analysis */
	debounceMs: number;
}

const DEFAULT_PAIRS: BracketPair[] = [
	{ open: '(', close: ')' },
	{ open: '[', close: ']' },
	{ open: '{', close: '}' },
	{ open: '<', close: '>', language: ['html', 'xml', 'jsx', 'tsx', 'svelte', 'vue'] }
];

const DEFAULT_CONFIG: BracketHealerConfig = {
	pairs: DEFAULT_PAIRS,
	minConfidence: 0.5,
	maxGhosts: 5,
	debounceMs: 150
};

/**
 * Token for bracket tracking
 */
interface BracketToken {
	char: string;
	position: Position;
	isOpen: boolean;
	pair: BracketPair;
}

/**
 * Bracket Healer Manager
 */
export class BracketHealer {
	private config: BracketHealerConfig;
	private state: BracketHealerState;
	private language = 'javascript';
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private listeners: Set<(state: BracketHealerState) => void> = new Set();

	constructor(config: Partial<BracketHealerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.state = {
			matches: [],
			ghosts: [],
			mismatches: [],
			enabled: true
		};
	}

	/**
	 * Set current language
	 */
	setLanguage(language: string): void {
		this.language = language;
	}

	/**
	 * Enable/disable healing
	 */
	setEnabled(enabled: boolean): void {
		this.state.enabled = enabled;
		if (!enabled) {
			this.state = { ...this.state, matches: [], ghosts: [], mismatches: [] };
		}
		this.notify();
	}

	/**
	 * Analyze document content
	 */
	analyze(content: string): void {
		if (!this.state.enabled) return;

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.performAnalysis(content);
		}, this.config.debounceMs);
	}

	/**
	 * Analyze immediately (no debounce)
	 */
	analyzeImmediate(content: string): void {
		if (!this.state.enabled) return;
		this.performAnalysis(content);
	}

	/**
	 * Perform bracket analysis
	 */
	private performAnalysis(content: string): void {
		const lines = content.split('\n');
		const tokens = this.extractBrackets(lines);
		const { matches, mismatches } = this.matchBrackets(tokens);
		const ghosts = this.generateGhosts(matches, mismatches, lines);

		this.state = {
			...this.state,
			matches,
			mismatches,
			ghosts: ghosts.slice(0, this.config.maxGhosts)
		};

		this.notify();
	}

	/**
	 * Extract all brackets from content
	 */
	private extractBrackets(lines: string[]): BracketToken[] {
		const tokens: BracketToken[] = [];
		const activePairs = this.getActivePairs();

		for (let lineNum = 0; lineNum < lines.length; lineNum++) {
			const line = lines[lineNum];
			let inString = false;
			let stringChar = '';
			let inComment = false;

			for (let col = 0; col < line.length; col++) {
				const char = line[col];
				const prevChar = col > 0 ? line[col - 1] : '';

				// Skip escaped characters
				if (prevChar === '\\') continue;

				// Track string state
				if (!inComment && (char === '"' || char === "'" || char === '`')) {
					if (!inString) {
						inString = true;
						stringChar = char;
					} else if (char === stringChar) {
						inString = false;
					}
					continue;
				}

				// Track comments (basic detection)
				if (!inString && char === '/' && line[col + 1] === '/') {
					break; // Rest of line is comment
				}

				if (inString || inComment) continue;

				// Check for bracket
				for (const pair of activePairs) {
					if (char === pair.open) {
						tokens.push({
							char,
							position: { line: lineNum, column: col },
							isOpen: true,
							pair
						});
					} else if (char === pair.close) {
						tokens.push({
							char,
							position: { line: lineNum, column: col },
							isOpen: false,
							pair
						});
					}
				}
			}
		}

		return tokens;
	}

	/**
	 * Get bracket pairs active for current language
	 */
	private getActivePairs(): BracketPair[] {
		return this.config.pairs.filter((pair) => {
			if (!pair.language) return true;
			return pair.language.includes(this.language);
		});
	}

	/**
	 * Match brackets and find mismatches
	 */
	private matchBrackets(
		tokens: BracketToken[]
	): { matches: BracketMatch[]; mismatches: BracketMismatch[] } {
		const matches: BracketMatch[] = [];
		const mismatches: BracketMismatch[] = [];
		const stack: Array<{ token: BracketToken; depth: number }> = [];
		let depth = 0;

		for (const token of tokens) {
			if (token.isOpen) {
				stack.push({ token, depth });
				depth++;
			} else {
				// Look for matching open bracket
				let matched = false;

				for (let i = stack.length - 1; i >= 0; i--) {
					const openEntry = stack[i];
					if (openEntry.token.pair.close === token.char) {
						// Found match
						matches.push({
							openPos: openEntry.token.position,
							closePos: token.position,
							type: openEntry.token.pair,
							isComplete: true,
							depth: openEntry.depth
						});
						stack.splice(i, 1);
						matched = true;
						depth = Math.max(0, depth - 1);
						break;
					}
				}

				if (!matched) {
					// Unexpected closing bracket
					if (stack.length > 0) {
						const lastOpen = stack[stack.length - 1].token;
						mismatches.push({
							position: token.position,
							character: token.char,
							expected: lastOpen.pair.close,
							issue: 'mismatched',
							severity: 'error'
						});
					} else {
						mismatches.push({
							position: token.position,
							character: token.char,
							issue: 'unexpected',
							severity: 'error'
						});
					}
				}
			}
		}

		// Remaining stack items are unclosed
		for (const entry of stack) {
			matches.push({
				openPos: entry.token.position,
				closePos: null,
				type: entry.token.pair,
				isComplete: false,
				depth: entry.depth
			});
			mismatches.push({
				position: entry.token.position,
				character: entry.token.char,
				issue: 'unclosed',
				severity: 'warning'
			});
		}

		return { matches, mismatches };
	}

	/**
	 * Generate ghost bracket suggestions
	 */
	private generateGhosts(
		matches: BracketMatch[],
		mismatches: BracketMismatch[],
		lines: string[]
	): GhostBracket[] {
		const ghosts: GhostBracket[] = [];
		const dismissedIds = new Set(this.state.ghosts.filter((g) => g.dismissed).map((g) => g.id));

		for (const match of matches) {
			if (!match.isComplete) {
				// Suggest closing bracket
				const ghost = this.suggestClosingBracket(match, lines);
				if (ghost && ghost.confidence >= this.config.minConfidence) {
					ghost.dismissed = dismissedIds.has(ghost.id);
					ghosts.push(ghost);
				}
			}
		}

		// Sort by confidence
		ghosts.sort((a, b) => b.confidence - a.confidence);

		return ghosts;
	}

	/**
	 * Suggest where to place a closing bracket
	 */
	private suggestClosingBracket(match: BracketMatch, lines: string[]): GhostBracket | null {
		const openLine = lines[match.openPos.line];
		let suggestedLine = match.openPos.line;
		let suggestedCol = openLine.length;
		let confidence = 0.6;
		let reason = 'End of line containing opening bracket';

		// Heuristics for better placement

		// 1. If it's a function/block, find matching indentation
		const openIndent = this.getIndentation(openLine);

		for (let i = match.openPos.line + 1; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			if (trimmed === '') continue;

			const indent = this.getIndentation(line);

			// Found a line with same or less indentation
			if (indent <= openIndent && trimmed.length > 0) {
				// Place before this line
				suggestedLine = i - 1;
				suggestedCol = lines[suggestedLine].length;
				confidence = 0.8;
				reason = 'Before dedented line';
				break;
			}

			// Found potential end marker (return, }, etc.)
			if (indent === openIndent && /^(return|break|continue|\})/.test(trimmed)) {
				suggestedLine = i - 1;
				suggestedCol = lines[suggestedLine].length;
				confidence = 0.85;
				reason = 'Before control flow statement';
				break;
			}
		}

		// 2. For simple brackets on same line, suggest end of line
		if (match.openPos.line === suggestedLine) {
			confidence = 0.9;
			reason = 'Same line completion';
		}

		const id = `ghost-${match.openPos.line}-${match.openPos.column}-${match.type.close}`;

		return {
			id,
			position: { line: suggestedLine, column: suggestedCol },
			character: match.type.close,
			type: 'close',
			matchPosition: match.openPos,
			confidence,
			reason,
			dismissed: false
		};
	}

	/**
	 * Get line indentation level
	 */
	private getIndentation(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}

	/**
	 * Accept a ghost bracket suggestion
	 */
	acceptGhost(id: string): GhostBracket | null {
		const ghost = this.state.ghosts.find((g) => g.id === id);
		if (ghost) {
			// Remove from suggestions
			this.state.ghosts = this.state.ghosts.filter((g) => g.id !== id);
			this.notify();
		}
		return ghost ?? null;
	}

	/**
	 * Dismiss a ghost bracket suggestion
	 */
	dismissGhost(id: string): void {
		const ghost = this.state.ghosts.find((g) => g.id === id);
		if (ghost) {
			ghost.dismissed = true;
			this.notify();
		}
	}

	/**
	 * Get current state
	 */
	getState(): BracketHealerState {
		return { ...this.state };
	}

	/**
	 * Get ghost brackets (non-dismissed only)
	 */
	getActiveGhosts(): GhostBracket[] {
		return this.state.ghosts.filter((g) => !g.dismissed);
	}

	/**
	 * Get mismatches
	 */
	getMismatches(): BracketMismatch[] {
		return [...this.state.mismatches];
	}

	/**
	 * Find matching bracket for position
	 */
	findMatchingBracket(position: Position): Position | null {
		for (const match of this.state.matches) {
			if (
				match.openPos.line === position.line &&
				match.openPos.column === position.column &&
				match.closePos
			) {
				return match.closePos;
			}
			if (
				match.closePos &&
				match.closePos.line === position.line &&
				match.closePos.column === position.column
			) {
				return match.openPos;
			}
		}
		return null;
	}

	/**
	 * Subscribe to state changes
	 */
	subscribe(listener: (state: BracketHealerState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Notify listeners
	 */
	private notify(): void {
		const state = this.getState();
		for (const listener of this.listeners) {
			try {
				listener(state);
			} catch (e) {
				console.error('[BracketHealer] Listener error:', e);
			}
		}
	}

	/**
	 * Destroy and cleanup
	 */
	destroy(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		this.listeners.clear();
	}
}

/**
 * Create a bracket healer instance
 */
export function createBracketHealer(config?: Partial<BracketHealerConfig>): BracketHealer {
	return new BracketHealer(config);
}
