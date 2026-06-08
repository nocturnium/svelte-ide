/**
 * Code folding detection and management
 *
 * Supports multiple folding strategies:
 * - Indentation-based (Python, YAML)
 * - Bracket-based (JavaScript, TypeScript, JSON, etc.)
 * - Region markers (#region / #endregion)
 */

import type { Line } from './state';

/**
 * A foldable region in the document
 */
export interface FoldRegion {
	/** Start line (0-based) - the line with the fold indicator */
	startLine: number;
	/** End line (0-based) - the last line included in the fold */
	endLine: number;
	/** Indentation level (for nested folds) */
	level: number;
	/** Type of fold region */
	type: 'bracket' | 'indentation' | 'region' | 'comment';
	/** Whether this region is currently collapsed */
	collapsed: boolean;
}

/**
 * Folding strategy configuration
 */
export interface FoldingConfig {
	/** Enable bracket-based folding */
	brackets: boolean;
	/** Enable indentation-based folding */
	indentation: boolean;
	/** Enable region marker folding */
	regions: boolean;
	/** Enable multi-line comment folding */
	comments: boolean;
	/** Minimum lines for a foldable region */
	minLines: number;
}

const DEFAULT_CONFIG: FoldingConfig = {
	brackets: true,
	indentation: true,
	regions: true,
	comments: true,
	minLines: 2
};

/**
 * Bracket pairs for different languages
 * Note: HTML/XML use tag-based folding, not simple bracket matching
 */
const BRACKET_PAIRS: Record<string, [string, string][]> = {
	default: [
		['{', '}'],
		['[', ']'],
		['(', ')']
	]
};

/**
 * HTML5 void elements that don't need closing tags
 */
const HTML_VOID_ELEMENTS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * Extract tag name from an opening or closing tag
 * Returns null if not a valid tag
 */
function extractTagName(text: string, startPos: number): { name: string; isClosing: boolean; endPos: number; isSelfClosing: boolean } | null {
	if (text[startPos] !== '<') return null;

	let pos = startPos + 1;
	const isClosing = text[pos] === '/';
	if (isClosing) pos++;

	// Skip whitespace
	while (pos < text.length && /\s/.test(text[pos])) pos++;

	// Extract tag name (letters, digits, hyphens, underscores, colons for namespaces)
	let name = '';
	while (pos < text.length && /[a-zA-Z0-9\-_:]/.test(text[pos])) {
		name += text[pos].toLowerCase();
		pos++;
	}

	if (!name) return null;

	// Find the end of the tag
	let inAttrString = false;
	let attrStringChar = '';
	while (pos < text.length) {
		const char = text[pos];

		if (!inAttrString) {
			if (char === '"' || char === "'") {
				inAttrString = true;
				attrStringChar = char;
			} else if (char === '>') {
				const isSelfClosing = text[pos - 1] === '/' || HTML_VOID_ELEMENTS.has(name);
				return { name, isClosing, endPos: pos, isSelfClosing };
			}
		} else if (char === attrStringChar) {
			// Check for escaped quotes
			let backslashes = 0;
			let checkPos = pos - 1;
			while (checkPos >= 0 && text[checkPos] === '\\') {
				backslashes++;
				checkPos--;
			}
			if (backslashes % 2 === 0) {
				inAttrString = false;
				attrStringChar = '';
			}
		}
		pos++;
	}

	return null; // Tag not properly closed on this line
}

/**
 * Detect fold regions based on HTML/XML tag matching
 * Properly pairs opening tags with their corresponding closing tags
 */
function detectHtmlTagFolds(
	lines: readonly Line[],
	minLines: number = 2
): FoldRegion[] {
	const regions: FoldRegion[] = [];

	interface TagInfo {
		name: string;
		line: number;
		column: number;
		level: number;
	}

	const tagStack: TagInfo[] = [];

	for (let lineNum = 0; lineNum < lines.length; lineNum++) {
		const lineText = lines[lineNum].text;
		let _inComment = false;
		let pos = 0;

		while (pos < lineText.length) {
			// Skip HTML comments
			if (lineText.slice(pos, pos + 4) === '<!--') {
				const endComment = lineText.indexOf('-->', pos + 4);
				if (endComment >= 0) {
					pos = endComment + 3;
					continue;
				} else {
					_inComment = true;
					break;
				}
			}

			if (lineText[pos] === '<') {
				const tagInfo = extractTagName(lineText, pos);

				if (tagInfo) {
					if (tagInfo.isClosing) {
						// Find matching opening tag (search from top of stack)
						for (let i = tagStack.length - 1; i >= 0; i--) {
							if (tagStack[i].name === tagInfo.name) {
								const openTag = tagStack[i];
								// Remove all tags from this point up (handles malformed HTML)
								tagStack.splice(i);

								// Create fold region if spans multiple lines
								if (lineNum - openTag.line >= minLines) {
									regions.push({
										startLine: openTag.line,
										endLine: lineNum,
										level: openTag.level,
										type: 'bracket',
										collapsed: false
									});
								}
								break;
							}
						}
					} else if (!tagInfo.isSelfClosing) {
						// Opening tag - push to stack
						tagStack.push({
							name: tagInfo.name,
							line: lineNum,
							column: pos,
							level: tagStack.length
						});
					}
					pos = tagInfo.endPos + 1;
					continue;
				}
			}
			pos++;
		}
	}

	return regions;
}

/**
 * Region markers for different languages
 */
const REGION_MARKERS: Record<string, { start: RegExp; end: RegExp }> = {
	default: {
		start: /^\s*(?:\/\/|#|--|\/\*)\s*#?region\b/i,
		end: /^\s*(?:\/\/|#|--|\/\*)\s*#?endregion\b/i
	},
	python: {
		start: /^\s*#\s*region\b/i,
		end: /^\s*#\s*endregion\b/i
	},
	html: {
		start: /^\s*<!--\s*#?region\b/i,
		end: /^\s*<!--\s*#?endregion\b/i
	}
};

/**
 * Get the indentation level of a line (number of leading spaces/tabs)
 */
function getIndentLevel(text: string, tabSize: number = 4): number {
	let level = 0;
	for (const char of text) {
		if (char === ' ') {
			level++;
		} else if (char === '\t') {
			level += tabSize;
		} else {
			break;
		}
	}
	return level;
}

/**
 * Check if a line is effectively empty (whitespace only)
 */
function isEmptyLine(text: string): boolean {
	return text.trim().length === 0;
}

/**
 * Detect fold regions based on indentation
 *
 * Single pass: maintain a stack of "open" indentation blocks. When a non-empty
 * line is less-or-equally indented than the block on top of the stack, that
 * block closes at the last non-empty line seen before it. This replaces the
 * previous O(n^2) approach (which re-scanned forward from every line).
 */
function detectIndentationFolds(
	lines: readonly Line[],
	tabSize: number = 4,
	minLines: number = 2
): FoldRegion[] {
	const regions: FoldRegion[] = [];
	const lineCount = lines.length;

	interface IndentBlock {
		/** Line where the block header sits (its indentation defines the parent level) */
		startLine: number;
		/** Indentation of the header line */
		indent: number;
	}

	const stack: IndentBlock[] = [];
	let lastNonEmptyLine = -1;

	const closeBlock = (block: IndentBlock) => {
		// The block spans from its header down to the last non-empty line that
		// belonged to it (lastNonEmptyLine, captured before the dedent).
		if (lastNonEmptyLine - block.startLine >= minLines) {
			regions.push({
				startLine: block.startLine,
				endLine: lastNonEmptyLine,
				level: block.indent,
				type: 'indentation',
				collapsed: false
			});
		}
	};

	for (let i = 0; i < lineCount; i++) {
		const line = lines[i];
		// Empty lines do not change indentation structure; they are absorbed into
		// the surrounding block (handled because we only close on dedent at a
		// non-empty line, and endLine tracks lastNonEmptyLine).
		if (isEmptyLine(line.text)) continue;

		const indent = getIndentLevel(line.text, tabSize);

		// Close any blocks whose header is at >= this indentation: this line is a
		// sibling or an outdent, so those blocks ended at lastNonEmptyLine.
		while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
			closeBlock(stack.pop()!);
		}

		// This line becomes a potential block header for deeper-indented lines.
		stack.push({ startLine: i, indent });
		lastNonEmptyLine = i;
	}

	// Close any remaining open blocks at end of document.
	while (stack.length > 0) {
		closeBlock(stack.pop()!);
	}

	return regions;
}

/**
 * Detect fold regions based on bracket matching
 */
function detectBracketFolds(
	lines: readonly Line[],
	language: string = 'default',
	minLines: number = 2
): FoldRegion[] {
	const regions: FoldRegion[] = [];
	const pairs = BRACKET_PAIRS[language] || BRACKET_PAIRS.default;

	// Track open brackets: { char, line, column }
	interface BracketInfo {
		char: string;
		closingChar: string;
		line: number;
		column: number;
	}

	const stack: BracketInfo[] = [];

	// Block-comment state must persist across lines: a `/*` on one line keeps us
	// "inside a comment" until a matching `*/` is found, even many lines later.
	let inBlockComment = false;

	for (let lineNum = 0; lineNum < lines.length; lineNum++) {
		const lineText = lines[lineNum].text;
		let inString = false;
		let stringChar = '';
		let inLineComment = false;

		for (let col = 0; col < lineText.length; col++) {
			const char = lineText[col];

			// Inside a block comment: only look for the terminating `*/`.
			if (inBlockComment) {
				if (char === '*' && lineText[col + 1] === '/') {
					inBlockComment = false;
					col++; // consume the '/'
				}
				continue;
			}

			// Handle string detection with proper escape handling
			// Count preceding backslashes: odd = escaped, even = not escaped
			if (char === '"' || char === "'" || char === '`') {
				let backslashCount = 0;
				let checkPos = col - 1;
				while (checkPos >= 0 && lineText[checkPos] === '\\') {
					backslashCount++;
					checkPos--;
				}
				// Quote is escaped only if preceded by odd number of backslashes
				const isEscaped = backslashCount % 2 === 1;

				if (!isEscaped) {
					if (!inString) {
						inString = true;
						stringChar = char;
					} else if (char === stringChar) {
						inString = false;
						stringChar = '';
					}
				}
				continue;
			}

			if (inString) continue;

			// Handle block comment start (outside strings).
			if (char === '/' && lineText[col + 1] === '*') {
				inBlockComment = true;
				col++; // consume the '*'
				continue;
			}

			// Handle line comments
			if (char === '/' && lineText[col + 1] === '/') {
				inLineComment = true;
				break;
			}

			if (inLineComment) continue;

			// Check for opening brackets
			for (const [open, close] of pairs) {
				if (char === open) {
					stack.push({
						char: open,
						closingChar: close,
						line: lineNum,
						column: col
					});
				} else if (char === close && stack.length > 0) {
					// Only match if top of stack is the correct closing bracket
					// This ensures proper nesting (e.g., `{ ( } )` won't match incorrectly)
					const topBracket = stack[stack.length - 1];
					if (topBracket.closingChar === close) {
						stack.pop();

						// Create fold region if spans multiple lines
						if (lineNum - topBracket.line >= minLines) {
							regions.push({
								startLine: topBracket.line,
								endLine: lineNum,
								level: stack.length, // Use current stack depth for level
								type: 'bracket',
								collapsed: false
							});
						}
					}
					// If mismatch, ignore the closing bracket (unbalanced brackets)
				}
			}
		}
	}

	return regions;
}

/**
 * Detect fold regions based on region markers
 */
function detectRegionFolds(
	lines: readonly Line[],
	language: string = 'default'
): FoldRegion[] {
	const regions: FoldRegion[] = [];
	const markers = REGION_MARKERS[language] || REGION_MARKERS.default;

	interface RegionStart {
		line: number;
		level: number;
	}

	const stack: RegionStart[] = [];
	let level = 0;

	for (let i = 0; i < lines.length; i++) {
		const lineText = lines[i].text;

		if (markers.start.test(lineText)) {
			stack.push({ line: i, level: level++ });
		} else if (markers.end.test(lineText) && stack.length > 0) {
			const start = stack.pop()!;
			level--;
			regions.push({
				startLine: start.line,
				endLine: i,
				level: start.level,
				type: 'region',
				collapsed: false
			});
		}
	}

	return regions;
}

/**
 * Detect fold regions for multi-line comments
 */
function detectCommentFolds(
	lines: readonly Line[],
	minLines: number = 2
): FoldRegion[] {
	const regions: FoldRegion[] = [];
	let commentStart = -1;

	for (let i = 0; i < lines.length; i++) {
		const lineText = lines[i].text.trim();

		// Block comment start
		if (lineText.startsWith('/*') && !lineText.includes('*/')) {
			commentStart = i;
		}
		// Block comment end
		else if (commentStart >= 0 && lineText.includes('*/')) {
			if (i - commentStart >= minLines) {
				regions.push({
					startLine: commentStart,
					endLine: i,
					level: 0,
					type: 'comment',
					collapsed: false
				});
			}
			commentStart = -1;
		}
		// HTML comment
		else if (lineText.startsWith('<!--') && !lineText.includes('-->')) {
			commentStart = i;
		} else if (commentStart >= 0 && lineText.includes('-->')) {
			if (i - commentStart >= minLines) {
				regions.push({
					startLine: commentStart,
					endLine: i,
					level: 0,
					type: 'comment',
					collapsed: false
				});
			}
			commentStart = -1;
		}
	}

	return regions;
}

/**
 * Detect all fold regions in a document
 */
export function detectFoldRegions(
	lines: readonly Line[],
	language: string = 'plaintext',
	config: Partial<FoldingConfig> = {}
): FoldRegion[] {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const allRegions: FoldRegion[] = [];

	// Detect different types of fold regions
	if (cfg.brackets) {
		const langLower = language.toLowerCase();
		// Pure HTML/XML use tag-based folding only
		const pureMarkupLanguages = ['html', 'xml', 'xhtml', 'svg'];
		// Mixed languages use both tag and bracket folding
		const mixedLanguages = ['vue', 'svelte', 'jsx', 'tsx'];

		if (pureMarkupLanguages.includes(langLower)) {
			allRegions.push(...detectHtmlTagFolds(lines, cfg.minLines));
		} else if (mixedLanguages.includes(langLower)) {
			// Mixed languages: detect both HTML tags and JS/TS braces
			allRegions.push(...detectHtmlTagFolds(lines, cfg.minLines));
			allRegions.push(...detectBracketFolds(lines, 'default', cfg.minLines));
		} else {
			allRegions.push(...detectBracketFolds(lines, langLower, cfg.minLines));
		}
	}

	if (cfg.indentation) {
		// For languages like Python, prioritize indentation
		const indentLanguages = ['python', 'yaml', 'yml', 'haml', 'slim', 'pug', 'jade'];
		if (indentLanguages.includes(language.toLowerCase())) {
			allRegions.push(...detectIndentationFolds(lines, 4, cfg.minLines));
		}
	}

	if (cfg.regions) {
		allRegions.push(...detectRegionFolds(lines, language));
	}

	if (cfg.comments) {
		allRegions.push(...detectCommentFolds(lines, cfg.minLines));
	}

	// Sort by start line, then by length (longer regions first for nesting)
	allRegions.sort((a, b) => {
		if (a.startLine !== b.startLine) {
			return a.startLine - b.startLine;
		}
		return (b.endLine - b.startLine) - (a.endLine - a.startLine);
	});

	// Remove overlapping regions (keep the first/largest one)
	const filteredRegions: FoldRegion[] = [];
	const coveredLines = new Set<number>();

	for (const region of allRegions) {
		// Check if this region's start line is already covered
		if (coveredLines.has(region.startLine)) {
			continue;
		}

		filteredRegions.push(region);

		// Mark start line as covered (we can still have nested folds with different start lines)
		coveredLines.add(region.startLine);
	}

	return filteredRegions;
}

/**
 * Fold state manager
 */
export class FoldManager {
	private regions: FoldRegion[] = [];
	private collapsedLines: Set<number> = new Set();
	private listeners: Set<() => void> = new Set();

	/**
	 * Update fold regions based on document content
	 */
	updateRegions(lines: readonly Line[], language: string, config?: Partial<FoldingConfig>): void {
		// Preserve collapsed state for regions that still exist
		const wasCollapsed = new Set<number>();
		for (const region of this.regions) {
			if (region.collapsed) {
				wasCollapsed.add(region.startLine);
			}
		}

		this.regions = detectFoldRegions(lines, language, config);

		// Restore collapsed state
		for (const region of this.regions) {
			if (wasCollapsed.has(region.startLine)) {
				region.collapsed = true;
			}
		}

		this.updateCollapsedLines();
	}

	/**
	 * Get all fold regions
	 */
	getRegions(): readonly FoldRegion[] {
		return this.regions;
	}

	/**
	 * Get fold region at a specific line (if it starts there)
	 */
	getRegionAtLine(line: number): FoldRegion | undefined {
		return this.regions.find(r => r.startLine === line);
	}

	/**
	 * Check if a line is hidden (inside a collapsed fold)
	 */
	isLineHidden(line: number): boolean {
		return this.collapsedLines.has(line);
	}

	/**
	 * Check if a line has a fold indicator
	 */
	hasFoldIndicator(line: number): boolean {
		return this.regions.some(r => r.startLine === line);
	}

	/**
	 * Check if the fold at this line is collapsed
	 */
	isFoldCollapsed(line: number): boolean {
		const region = this.getRegionAtLine(line);
		return region?.collapsed ?? false;
	}

	/**
	 * Toggle fold at a line
	 */
	toggleFold(line: number): boolean {
		const region = this.getRegionAtLine(line);
		if (!region) return false;

		region.collapsed = !region.collapsed;
		this.updateCollapsedLines();
		this.emit();
		return true;
	}

	/**
	 * Collapse fold at a line
	 */
	collapse(line: number): boolean {
		const region = this.getRegionAtLine(line);
		if (!region || region.collapsed) return false;

		region.collapsed = true;
		this.updateCollapsedLines();
		this.emit();
		return true;
	}

	/**
	 * Expand fold at a line
	 */
	expand(line: number): boolean {
		const region = this.getRegionAtLine(line);
		if (!region || !region.collapsed) return false;

		region.collapsed = false;
		this.updateCollapsedLines();
		this.emit();
		return true;
	}

	/**
	 * Collapse all folds
	 */
	collapseAll(): void {
		for (const region of this.regions) {
			region.collapsed = true;
		}
		this.updateCollapsedLines();
		this.emit();
	}

	/**
	 * Expand all folds
	 */
	expandAll(): void {
		for (const region of this.regions) {
			region.collapsed = false;
		}
		this.collapsedLines.clear();
		this.emit();
	}

	/**
	 * Collapse folds at a specific nesting level
	 */
	collapseLevel(level: number): void {
		for (const region of this.regions) {
			if (region.level === level) {
				region.collapsed = true;
			}
		}
		this.updateCollapsedLines();
		this.emit();
	}

	/**
	 * Get visible lines (line numbers that should be rendered)
	 */
	getVisibleLines(totalLines: number): number[] {
		const visible: number[] = [];
		for (let i = 0; i < totalLines; i++) {
			if (!this.collapsedLines.has(i)) {
				visible.push(i);
			}
		}
		return visible;
	}

	/**
	 * Get the number of hidden lines after a fold start
	 */
	getHiddenLineCount(startLine: number): number {
		const region = this.getRegionAtLine(startLine);
		if (!region || !region.collapsed) return 0;
		return region.endLine - region.startLine;
	}

	/**
	 * Update the set of collapsed (hidden) lines
	 */
	private updateCollapsedLines(): void {
		this.collapsedLines.clear();

		for (const region of this.regions) {
			if (region.collapsed) {
				// Hide all lines except the first one
				for (let i = region.startLine + 1; i <= region.endLine; i++) {
					this.collapsedLines.add(i);
				}
			}
		}
	}

	/** Maximum listeners to prevent memory leaks */
	private static readonly MAX_LISTENERS = 100;

	/**
	 * Subscribe to fold changes
	 * In development mode, throws an error to catch memory leaks early.
	 * In production, warns and evicts the oldest listener.
	 */
	onChange(callback: () => void): () => void {
		if (this.listeners.size >= FoldManager.MAX_LISTENERS) {
			const msg = `[FoldManager] Maximum listener count (${FoldManager.MAX_LISTENERS}) exceeded. Possible memory leak - ensure listeners are unsubscribed.`;

			// Fail fast in development to catch bugs early
			if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
				throw new Error(msg);
			}

			// In production, warn and auto-cleanup oldest listener
			console.warn(msg);
			const firstListener = this.listeners.values().next().value;
			if (firstListener) {
				this.listeners.delete(firstListener);
			}
		}
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private emit(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (error) {
				console.error('[FoldManager] Listener callback failed:', error);
			}
		}
	}
}

/**
 * Create a new fold manager
 */
export function createFoldManager(): FoldManager {
	return new FoldManager();
}
