<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type { EditorPreferences } from '$types';
	import {
		createEditorState,
		createNavigation,
		createKeyboardHandler,
		createDefaultKeybindings,
		createFoldManager,
		type EditorState,
		type Selection,
		type SearchMatch,
		type FoldManager,
		type FoldRegion,
		type Cursor
	} from './core';
	import FindReplace from './FindReplace.svelte';
	import { createEditorFind, type EditorFind } from './editor-find';
	import { selectNextOccurrence, selectAllOccurrences } from './editor-multicursor';
	import { createEditorInput } from './editor-input';
	import { createEditorScroll } from './editor-scroll';
	import ComplexityLayer from './ComplexityLayer.svelte';
	import ComplexityHeatLayer from './ComplexityHeatLayer.svelte';
	import AIFocusLayer from './AIFocusLayer.svelte';
	import EditorSelections from './EditorSelections.svelte';
	import EditorLines from './EditorLines.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import {
		getComplexityAnalyzer,
		type ComplexityMetrics,
		type ComplexityRegion
	} from './core/complexity-analyzer';
	import { registerSemanticFoldCommands } from './core/commands';
	import { getSemanticAnalyzer, type FoldPreset } from './core/semantic-analyzer';
	import type { AIAwareness } from './core/ai-awareness';
	import {
		CURSOR_BLINK_MS,
		ONCHANGE_DEBOUNCE_MS,
		DEFAULT_CHAR_WIDTH,
		DEFAULT_LINE_HEIGHT,
		DEFAULT_GUTTER_WIDTH,
		CONTENT_PADDING,
		GUTTER_PADDING,
		FALLBACK_VIEWPORT_HEIGHT,
		DEFAULT_FONT_SIZE,
		DEFAULT_WORD_WRAP_COLUMN
	} from './constants';

	interface Props {
		content: string;
		language?: string;
		readonly?: boolean;
		preferences?: Partial<EditorPreferences>;
		class?: string;
		/** Enable code folding */
		folding?: boolean;
		/** Enable multi-cursor editing (default: true) */
		multiCursor?: boolean;
		/** Maximum number of cursors (default: 100) */
		maxCursors?: number;
		/** Enable complexity highlighting (default: false) */
		complexityHighlighting?: boolean;
		/** Minimum complexity score to show highlighting (default: 50) */
		complexityThreshold?: number;
		/** AI agents for Ghost Pair visualization */
		aiAgents?: AIAwareness[];
		/** Show AI cursor labels (default: true) */
		showAILabels?: boolean;
		/** Show AI focus regions (default: false) */
		showAIFocusRegions?: boolean;
		onChange?: (content: string) => void;
		onCursorChange?: (line: number, column: number) => void;
		/** Callback when cursors change (for multi-cursor) */
		onCursorsChange?: (cursors: readonly Cursor[]) => void;
		/** Callback when complexity metrics change */
		onComplexityChange?: (metrics: ComplexityMetrics | null) => void;
		onSave?: () => void;
	}

	let {
		content = $bindable(),
		language = 'plaintext',
		readonly = false,
		preferences = {},
		class: className = '',
		folding = true,
		multiCursor = true,
		maxCursors = 100,
		complexityHighlighting = false,
		complexityThreshold = 50,
		aiAgents = [],
		showAILabels = true,
		showAIFocusRegions = false,
		onChange,
		onCursorChange,
		onCursorsChange,
		onComplexityChange,
		onSave
	}: Props = $props();

	// Default preferences
	const defaultPrefs: EditorPreferences = {
		fontSize: DEFAULT_FONT_SIZE,
		fontFamily: 'JetBrains Mono',
		tabSize: 2,
		insertSpaces: false,
		wordWrap: 'off',
		wordWrapColumn: DEFAULT_WORD_WRAP_COLUMN,
		lineNumbers: 'on',
		minimap: false,
		bracketMatching: true,
		autoCloseBrackets: true,
		highlightActiveLine: true,
		renderWhitespace: 'none',
		theme: 'nocturnium'
	};

	const mergedPrefs = $derived({ ...defaultPrefs, ...preferences });

	// Editor state
	let editorState = $state<EditorState>(null!);
	let navigation: ReturnType<typeof createNavigation>;
	let keyboardHandler: ReturnType<typeof createKeyboardHandler>;

	// Fold manager
	let foldManager: FoldManager = createFoldManager();
	let foldRegions = $state<readonly FoldRegion[]>([]);
	let visibleLineIndices = $state<number[]>([]);
	let unsubscribeFold: (() => void) | null = null;

	// Complexity analyzer
	const complexityAnalyzer = getComplexityAnalyzer();
	let complexityMetrics = $state<ComplexityMetrics | null>(null);
	let complexityUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
	let complexityFlashTimeout: ReturnType<typeof setTimeout> | null = null;
	let complexityFlashRegionKey = $state('');

	// DOM refs
	let container: HTMLDivElement;
	let editorContent = $state<HTMLDivElement>(null!);
	let hiddenInput: HTMLTextAreaElement;
	let measureSpan: HTMLSpanElement;

	// Computed measurements
	let charWidth = $state(DEFAULT_CHAR_WIDTH);
	let lineHeight = $state(DEFAULT_LINE_HEIGHT);

	// Gutter width will be calculated after lines is defined
	let gutterWidth = $state(DEFAULT_GUTTER_WIDTH);

	// Scroll state
	let scrollTop = $state(0);
	let scrollLeft = $state(0);

	// Reactive viewport height of the scrollable content area. Drives line
	// virtualization (only rows within scrollTop +/- viewport + overscan render).
	let viewportHeight = $state(FALLBACK_VIEWPORT_HEIGHT);
	let viewportWidth = $state(0);

	// Selection rendering
	let cursorVisible = $state(true);
	let cursorBlinkInterval: ReturnType<typeof setInterval>;

	// Track previous content prop to detect external changes only
	let previousContentProp = $state(content);

	// Track the content the editor itself last emitted (via onChange / bind:content
	// write-back). When the parent round-trips this value back into the `content`
	// prop, we must treat it as an echo and NOT call setContent — doing so would
	// rebuild the document model every keystroke, wiping undo/redo and collapsing
	// multi-cursor. Only a genuine external change (content !== what we emitted and
	// !== the current editor content) should re-apply via setContent.
	let lastEmittedContent = content;

	// Track last cursor position to avoid unnecessary blink resets
	let lastCursorLine = -1;
	let lastCursorColumn = -1;

	// Input handler module (created in initEditor)
	let inputHandlers = $state(null as unknown as ReturnType<typeof createEditorInput>);

	function lineToVisualRow(line: number): number {
		const lineCount = editorState?.lineCount ?? lines.length;
		if (!folding || lineCount <= 0) return Math.max(0, Math.floor(line));
		return foldManager.lineToVisualRow(line, lineCount);
	}

	function visualRowToLine(visualRow: number): number {
		const lineCount = editorState?.lineCount ?? lines.length;
		if (!folding || lineCount <= 0) return Math.max(0, Math.floor(visualRow));
		return foldManager.visualRowToLine(visualRow, lineCount);
	}

	// Scroll management module
	const editorScroll = createEditorScroll({
		getEditorContent: () => editorContent,
		getSelection: () => selection,
		lineToVisualRow: (line) => lineToVisualRow(line),
		getMeasurements: () => ({ lineHeight, charWidth, gutterWidth, contentPadding: CONTENT_PADDING })
	});
	const { scrollCursorIntoView } = editorScroll;

	// Cleanup functions for subscriptions
	let unsubscribeContent: (() => void) | null = null;
	let unsubscribeSelection: (() => void) | null = null;
	let unsubscribeCursors: (() => void) | null = null;

	// Debounce timeout for onChange
	let onChangeTimeout: ReturnType<typeof setTimeout> | null = null;

	// Debounce timeout for fold region detection
	let foldUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

	// Reactive state from editor
	let lines = $state<readonly ReturnType<typeof editorState.getLine>[]>([]);
	let selection = $state<Selection>({
		anchor: { line: 0, column: 0 },
		head: { line: 0, column: 0 }
	});
	let hasSelection = $state(false);
	let cursors = $state<readonly Cursor[]>([]);
	let hasMultipleCursors = $state(false);

	// Update gutter width when lines change
	$effect(() => {
		const lineCount = lines.length || 1;
		const digits = Math.max(2, String(lineCount).length);
		gutterWidth = digits * charWidth + GUTTER_PADDING;
	});

	// Find/Replace state
	let showFindReplace = $state(false);
	let findReplaceComponent = $state<FindReplace | null>(null);
	let editorFind: EditorFind;

	// Reactive wrappers for find/replace state (drive template reactivity via $state)
	let searchQuery = $state('');
	let replaceTextState = $state('');
	let searchCaseSensitive = $state(false);
	let searchUseRegex = $state(false);
	let searchMatches = $state<SearchMatch[]>([]);
	let currentMatchIndex = $state(-1);

	/** Sync reactive $state from the editorFind module after any mutation */
	function syncFindState(): void {
		searchQuery = editorFind.query;
		replaceTextState = editorFind.replaceText;
		searchCaseSensitive = editorFind.caseSensitive;
		searchUseRegex = editorFind.useRegex;
		searchMatches = editorFind.matches;
		currentMatchIndex = editorFind.currentIndex;
	}

	// Command palette state
	let showCommandPalette = $state(false);

	// Screen reader dynamic announcements
	let srAnnouncement = $state('');

	// Helper to make screen reader announcements
	function announce(message: string) {
		// Clear first to ensure repeated messages are announced
		srAnnouncement = '';
		requestAnimationFrame(() => {
			srAnnouncement = message;
		});
	}

	// Debounced onChange to avoid excessive callbacks
	function debouncedOnChange(newContent: string) {
		if (onChangeTimeout) {
			clearTimeout(onChangeTimeout);
		}
		onChangeTimeout = setTimeout(() => {
			try {
				onChange?.(newContent);
			} catch (error) {
				// Report error to console for debugging
				console.error('[CustomEditor] onChange callback failed:', error);
			} finally {
				// Always clear timeout reference, even if onChange throws
				onChangeTimeout = null;
			}
		}, ONCHANGE_DEBOUNCE_MS);
	}

	// Initialize editor
	function initEditor() {
		// Clean up old subscriptions before creating new ones
		unsubscribeContent?.();
		unsubscribeSelection?.();
		unsubscribeCursors?.();
		unsubscribeFold?.();
		unsubscribeContent = null;
		unsubscribeSelection = null;
		unsubscribeCursors = null;
		unsubscribeFold = null;

		editorState = createEditorState({
			content,
			language,
			tabSize: mergedPrefs.tabSize,
			insertSpaces: mergedPrefs.insertSpaces,
			maxCursors: multiCursor ? maxCursors : 1
		});

		initEditorFind();

		navigation = createNavigation(editorState);
		keyboardHandler = createKeyboardHandler();

		// Set up keybindings
		const keybindings = createDefaultKeybindings(editorState, navigation, {
			onSave,
			readonly,
			pageSize: Math.floor((container?.clientHeight ?? FALLBACK_VIEWPORT_HEIGHT) / lineHeight)
		});
		keyboardHandler.setKeybindings(keybindings);

		// Subscribe to state changes and store unsubscribe functions
		unsubscribeContent = editorState.onContentChange(() => {
			lines = editorState.lines;
			const newContent = editorState.getContent();
			// Record what we emit so the round-trip back through the `content` prop is
			// recognised as an echo (see external-change $effect below).
			lastEmittedContent = newContent;
			// Write back to the bindable prop so `bind:content` consumers stay in sync.
			content = newContent;
			previousContentProp = newContent;
			debouncedOnChange(newContent);
			// Update fold regions when content changes (debounced for performance)
			if (folding) {
				debouncedUpdateFoldRegions();
			}
			// Update complexity metrics when content changes (debounced for performance)
			if (complexityHighlighting) {
				debouncedUpdateComplexity();
			}
		});

		unsubscribeSelection = editorState.onSelectionChange((sel) => {
			selection = sel;
			hasSelection = editorState.hasSelection;
			onCursorChange?.(sel.head.line + 1, sel.head.column + 1);

			// Only reset blink if cursor position actually changed
			if (sel.head.line !== lastCursorLine || sel.head.column !== lastCursorColumn) {
				lastCursorLine = sel.head.line;
				lastCursorColumn = sel.head.column;
				resetCursorBlink();
			}
		});

		// Subscribe to cursor changes (multi-cursor)
		unsubscribeCursors = editorState.onCursorChange((allCursors) => {
			cursors = allCursors;
			hasMultipleCursors = allCursors.length > 1;
			onCursorsChange?.(allCursors);
		});

		// Subscribe to fold changes
		unsubscribeFold = foldManager.onChange(() => {
			foldRegions = foldManager.getRegions();
			visibleLineIndices = foldManager.getVisibleLines(editorState.lineCount);
		});

		// Initial state
		lines = editorState.lines;
		selection = editorState.selection;
		cursors = editorState.allCursors;
		hasMultipleCursors = cursors.length > 1;

		// Initialize folding
		if (folding) {
			updateFoldRegions();
		}

		// Initialize complexity analysis
		if (complexityHighlighting) {
			updateComplexityMetrics();
		}

		// Create input handler module
		inputHandlers = createEditorInput({
			getEditorState: () => editorState,
			getNavigation: () => navigation,
			getKeyboardHandler: () => keyboardHandler,
			getFoldManager: () => foldManager,

			getEditorContent: () => editorContent,
			getHiddenInput: () => hiddenInput,
			getMeasureSpan: () => measureSpan,

			isReadonly: () => readonly,
			isMultiCursor: () => multiCursor,
			isFolding: () => folding,
			hasMultipleCursors: () => hasMultipleCursors,
			getSelection: () => selection,
			getCursors: () => cursors,
			getScrollPosition: () => ({ scrollTop, scrollLeft }),
			getMeasurements: () => ({ charWidth, lineHeight, gutterWidth }),
			visualRowToLine: (visualRow) => visualRowToLine(visualRow),

			onOpenFind: (withReplace) => openFind(withReplace),
			onCloseFind: () => closeFind(),
			onFindNext: () => handleFindNext(),
			onFindPrev: () => handleFindPrev(),
			onFoldCurrent: () => handleFoldCurrent(),
			onUnfoldCurrent: () => handleUnfoldCurrent(),
			onFoldAll: () => foldManager.collapseAll(),
			onUnfoldAll: () => foldManager.expandAll(),
			onSelectNextOccurrence: () => selectNextOccurrence(editorState),
			onSelectAllOccurrences: () => selectAllOccurrences(editorState),
			onShowCommandPalette: () => {
				showCommandPalette = true;
			},
			onSave,
			announce,
			resetCursorBlink,
			stopCursorBlink: () => {
				if (cursorBlinkInterval) {
					clearInterval(cursorBlinkInterval);
				}
			},

			setCharWidth: (w) => {
				charWidth = w;
			},
			setLineHeight: (h) => {
				lineHeight = h;
			},
			setScrollTop: (v) => {
				scrollTop = v;
			},
			setScrollLeft: (v) => {
				scrollLeft = v;
			},
			setCursorVisible: (v) => {
				cursorVisible = v;
			},

			isShowFindReplace: () => showFindReplace,
			getSearchQuery: () => searchQuery,
			getSearchMatchCount: () => searchMatches.length
		});
	}

	// Update fold regions
	function updateFoldRegions() {
		if (!editorState || !folding) return;
		foldManager.updateRegions(editorState.lines, language);
		foldRegions = foldManager.getRegions();
		visibleLineIndices = foldManager.getVisibleLines(editorState.lineCount);
	}

	// Debounced fold region update for performance on large files
	function debouncedUpdateFoldRegions() {
		if (foldUpdateTimeout) {
			clearTimeout(foldUpdateTimeout);
		}
		foldUpdateTimeout = setTimeout(() => {
			updateFoldRegions();
			foldUpdateTimeout = null;
		}, 250); // Longer debounce for fold detection
	}

	// Update complexity metrics
	function updateComplexityMetrics() {
		if (!editorState || !complexityHighlighting) {
			complexityMetrics = null;
			return;
		}
		const metrics = complexityAnalyzer.analyze(editorState.lines, language);
		complexityMetrics = metrics;
		onComplexityChange?.(metrics);
	}

	// Debounced complexity update for performance
	function debouncedUpdateComplexity() {
		if (complexityUpdateTimeout) {
			clearTimeout(complexityUpdateTimeout);
		}
		complexityUpdateTimeout = setTimeout(() => {
			updateComplexityMetrics();
			complexityUpdateTimeout = null;
		}, 300); // Slightly longer debounce for complexity analysis
	}

	// Fold/unfold handlers
	function handleFoldCurrent() {
		if (!folding || !editorState) return;
		const currentLine = selection.head.line;
		// Fold the innermost block the cursor is *inside*, not only when the cursor
		// sits on the fold header. Skip already-collapsed regions so repeated
		// presses fold progressively outward (VS Code behaviour).
		const region = foldManager.getInnermostRegionContaining(currentLine, 'uncollapsed');
		if (region) {
			foldManager.collapse(region.startLine);
		}
	}

	function handleUnfoldCurrent() {
		if (!folding || !editorState) return;
		const currentLine = selection.head.line;
		// Expand the innermost collapsed block containing the cursor (mirrors fold).
		const region = foldManager.getInnermostRegionContaining(currentLine, 'collapsed');
		if (region) {
			foldManager.expand(region.startLine);
		}
	}

	/**
	 * Collapse every semantic region whose category is listed in `preset.hide`,
	 * after first expanding everything so presets compose predictably. Shared by
	 * the command-palette preset commands and the exported imperative API.
	 */
	function applyFoldPresetInternal(preset: FoldPreset) {
		if (!folding || !editorState) return;
		foldManager.expandAll();
		const analyzer = getSemanticAnalyzer();
		const semanticRegions = analyzer.analyze(editorState.lines, language);
		const foldRegions = foldManager.getRegions();

		// Semantic region boundaries don't always line up exactly with bracket-fold
		// headers — a function's foldable `{` can sit a line below its doc-commented
		// header, and a hidden category (e.g. `private`, `error-handling`) may cover
		// several nested blocks. So collapse every foldable block whose header falls
		// within a hidden semantic region's range, rather than requiring an exact
		// header-line match (which silently folded almost nothing). collapse() is
		// idempotent, so collapsing the same header twice is harmless.
		for (const region of semanticRegions) {
			if (!preset.hide.includes(region.category)) continue;
			for (const fold of foldRegions) {
				if (fold.startLine >= region.startLine && fold.startLine <= region.endLine) {
					foldManager.collapse(fold.startLine);
				}
			}
		}
	}

	/**
	 * Imperative API (accessible via `bind:this`): apply a semantic fold preset.
	 */
	export function applyFoldPreset(preset: FoldPreset) {
		applyFoldPresetInternal(preset);
	}

	/**
	 * Imperative API (accessible via `bind:this`): expand all folded regions.
	 */
	export function unfoldAll() {
		if (!folding || !editorState) return;
		foldManager.expandAll();
	}

	function getComplexityRegionKey(region: ComplexityRegion): string {
		return `${region.startLine}:${region.endLine}:${region.name ?? region.type}:${region.score}`;
	}

	export function flashComplexityRegion(region: ComplexityRegion) {
		if (complexityFlashTimeout) {
			clearTimeout(complexityFlashTimeout);
		}

		complexityFlashRegionKey = '';
		requestAnimationFrame(() => {
			complexityFlashRegionKey = getComplexityRegionKey(region);
			complexityFlashTimeout = setTimeout(() => {
				complexityFlashRegionKey = '';
				complexityFlashTimeout = null;
			}, 1000);
		});
	}

	/**
	 * Imperative API (accessible via `bind:this`): scroll a raw document line into
	 * view and optionally flash the matching complexity region.
	 */
	export async function scrollToLine(line: number, region?: ComplexityRegion) {
		await tick();
		if (!editorContent) return;

		const row = lineToVisualRow(line);
		const targetTop = row * lineHeight;
		editorContent.scrollTop = Math.max(0, targetTop - editorContent.clientHeight * 0.3);

		if (region) {
			flashComplexityRegion(region);
		}
		hiddenInput?.focus();
	}

	function handleFoldIndicatorClick(lineNumber: number, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const wasCollapsed = foldManager.isFoldCollapsed(lineNumber);
		foldManager.toggleFold(lineNumber);
		const hiddenLines = foldManager.getHiddenLineCount(lineNumber);
		if (wasCollapsed) {
			announce(`Expanded fold at line ${lineNumber + 1}, ${hiddenLines} lines now visible`);
		} else {
			announce(`Collapsed fold at line ${lineNumber + 1}, ${hiddenLines} lines hidden`);
		}
	}

	// Memoized visible lines for rendering (filters out folded lines).
	// The array position of each entry is its VISUAL ROW (folded lines are
	// compacted out), which maps to a vertical offset of visualRow * lineHeight.
	let visibleLines = $derived.by(() => {
		if (!folding || visibleLineIndices.length === 0) {
			return lines.map((line, index) => ({ line, index }));
		}
		return visibleLineIndices
			.filter((index) => index >= 0 && index < lines.length)
			.map((index) => ({
				line: lines[index],
				index
			}));
	});

	/** Extra rows rendered above/below the viewport to avoid blank edges while scrolling. */
	const ROW_OVERSCAN = 8;

	// Total scrollable content height (in px) for the full document, accounting
	// for folded/hidden lines. Drives the spacer so the scrollbar stays correct.
	let totalContentHeight = $derived(Math.max(visibleLines.length, 1) * lineHeight);
	let estimatedContentWidth = $derived.by(() => {
		let maxLineLength = 0;
		for (const line of lines) {
			maxLineLength = Math.max(maxLineLength, line?.text.length ?? 0);
		}
		return Math.max(
			viewportWidth,
			gutterWidth + CONTENT_PADDING + maxLineLength * charWidth + CONTENT_PADDING
		);
	});

	// Windowed slice of visibleLines: only the rows intersecting the viewport
	// (plus overscan) are rendered to the DOM. Each entry keeps its absolute
	// visualRow so it can be positioned at its true offset (visualRow * lineHeight),
	// independent of the slice. This caps DOM nodes at ~viewport-worth regardless
	// of document size (10k+ lines still render only the visible window).
	let windowedLines = $derived.by(() => {
		const rowCount = visibleLines.length;
		if (rowCount === 0) return [];

		const rowsPerViewport = Math.ceil((viewportHeight || FALLBACK_VIEWPORT_HEIGHT) / lineHeight);
		const firstRow = Math.max(0, Math.floor(scrollTop / lineHeight) - ROW_OVERSCAN);
		const lastRow = Math.min(rowCount - 1, firstRow + rowsPerViewport + ROW_OVERSCAN * 2);

		const slice: Array<{
			line: (typeof visibleLines)[number]['line'];
			index: number;
			visualRow: number;
		}> = [];
		for (let visualRow = firstRow; visualRow <= lastRow; visualRow++) {
			const entry = visibleLines[visualRow];
			if (!entry) continue;
			slice.push({ line: entry.line, index: entry.index, visualRow });
		}
		return slice;
	});

	// Check if a line has a fold indicator
	function hasFoldIndicator(lineIndex: number): boolean {
		if (!folding) return false;
		return foldManager.hasFoldIndicator(lineIndex);
	}

	// Check if fold is collapsed at a line
	function isFoldCollapsed(lineIndex: number): boolean {
		if (!folding) return false;
		return foldManager.isFoldCollapsed(lineIndex);
	}

	// Get number of hidden lines for a collapsed fold
	function getHiddenLineCount(lineIndex: number): number {
		if (!folding) return 0;
		return foldManager.getHiddenLineCount(lineIndex);
	}

	// Multi-cursor selection helpers are in ./editor-multicursor.ts

	// Cursor blink management
	function resetCursorBlink() {
		cursorVisible = true;
		if (cursorBlinkInterval) {
			clearInterval(cursorBlinkInterval);
		}
		cursorBlinkInterval = setInterval(() => {
			cursorVisible = !cursorVisible;
		}, CURSOR_BLINK_MS);
	}

	// ============================================
	// Find/Replace functions
	// ============================================

	function initEditorFind(): void {
		editorFind = createEditorFind({
			getLines: () => editorState.lines,
			getLineCount: () => editorState.lineCount,
			getSelection: () => editorState.selection,
			setSelection: (anchor, head) => editorState.setSelection(anchor, head),
			setCursor: (pos) => editorState.setCursor(pos),
			setContent: (content) => editorState.setContent(content),
			scrollCursorIntoView: () => scrollCursorIntoView(),
			focusEditor: () => hiddenInput?.focus(),
			isReadonly: () => readonly,
			lineToVisualRow: (line) => lineToVisualRow(line)
		});
	}

	function openFind(_withReplace = false) {
		showFindReplace = true;

		// Pre-fill with selected text if any
		if (editorState?.hasSelection) {
			const selectedText = editorState.getSelectedText();
			// Only use selection if it's a single line
			if (!selectedText.includes('\n')) {
				editorFind.setQuery(selectedText);
				syncFindState();
			}
		}

		tick().then(() => {
			findReplaceComponent?.focus();
		});
	}

	function closeFind() {
		showFindReplace = false;
		hiddenInput?.focus();
	}

	function handleQueryChange(query: string) {
		editorFind.setQuery(query);
		syncFindState();
	}

	function handleFindNext() {
		editorFind.findNext();
		syncFindState();
	}

	function handleFindPrev() {
		editorFind.findPrev();
		syncFindState();
	}

	function handleReplace() {
		editorFind.replace();
		syncFindState();
	}

	function handleReplaceAll() {
		editorFind.replaceAll();
		syncFindState();
	}

	// Memoized match highlight rectangles (only for visible matches)
	let matchRects = $derived.by(() => {
		if (searchMatches.length === 0) return [];

		const viewportHeight = untrack(() => editorContent?.clientHeight ?? FALLBACK_VIEWPORT_HEIGHT);

		return editorFind.computeMatchRects(
			{ scrollTop, viewportHeight },
			{ lineHeight, charWidth, gutterWidth, contentPadding: CONTENT_PADDING }
		);
	});

	// Watch for content prop changes (external changes only, not user typing)
	$effect(() => {
		// Only react to a GENUINE external change to the `content` prop (e.g. a file
		// switch or a programmatic set), never to an echo of our own emission.
		//
		// An echo happens when the parent feeds our onChange / bind:content value back
		// into the `content` prop. We detect it three ways:
		//   1. content === previousContentProp — prop hasn't actually changed.
		//   2. content === lastEmittedContent — it's exactly what we just emitted.
		//   3. content === editorState.getContent() — the editor already holds this text.
		// Any of these means calling setContent would needlessly rebuild the document,
		// wiping undo/redo history and collapsing multi-cursor selections.
		if (
			editorState &&
			content !== previousContentProp &&
			content !== lastEmittedContent &&
			content !== untrack(() => editorState.getContent())
		) {
			// Preserve scroll position when external content changes
			const savedScrollTop = untrack(() => editorContent?.scrollTop ?? 0);
			const savedScrollLeft = untrack(() => editorContent?.scrollLeft ?? 0);

			editorState.setContent(content);
			previousContentProp = content; // Update the tracked prop value
			lastEmittedContent = content; // Keep echo-tracking in sync after external set

			// Restore scroll position after content update (clamped to new content bounds)
			const contentEl = untrack(() => editorContent);
			if (contentEl) {
				// Use requestAnimationFrame to ensure DOM has updated
				const rafId = requestAnimationFrame(() => {
					if (contentEl) {
						contentEl.scrollTop = Math.min(
							savedScrollTop,
							contentEl.scrollHeight - contentEl.clientHeight
						);
						contentEl.scrollLeft = Math.min(
							savedScrollLeft,
							contentEl.scrollWidth - contentEl.clientWidth
						);
					}
				});
				// Cleanup: cancel pending RAF if effect re-runs
				return () => cancelAnimationFrame(rafId);
			}
		}
	});

	// Watch for language changes
	$effect(() => {
		if (editorState && language !== editorState.language) {
			editorState.setLanguage(language);
			if (complexityHighlighting) {
				updateComplexityMetrics();
			}
		}
	});

	// Watch for selection changes to scroll into view
	$effect(() => {
		if (selection) {
			// Use untrack for the scroll function to prevent unnecessary re-runs
			untrack(() => scrollCursorIntoView());
		}
	});

	// Ensure cursor is on a visible line after fold changes
	$effect(() => {
		if (folding && editorState && foldManager.isLineHidden(selection.head.line)) {
			// Find the fold region containing the cursor and move to its start
			for (const region of foldRegions) {
				if (
					region.collapsed &&
					selection.head.line > region.startLine &&
					selection.head.line <= region.endLine
				) {
					editorState.setCursor({ line: region.startLine, column: 0 });
					break;
				}
			}
		}
	});

	// ResizeObserver for container size changes
	let resizeObserver: ResizeObserver | null = null;

	// Cleanup for semantic fold commands
	let unregisterSemanticFoldCommands: (() => void) | null = null;

	onMount(() => {
		// SSR guard - ensure we're in browser environment
		if (typeof window === 'undefined') return;

		initEditor();
		inputHandlers.measureCharacter();
		resetCursorBlink();

		// Measure the initial viewport height for line virtualization.
		if (editorContent) {
			viewportHeight = editorContent.clientHeight || FALLBACK_VIEWPORT_HEIGHT;
			viewportWidth = editorContent.clientWidth || 0;
		}

		// Register semantic fold commands for the command palette
		unregisterSemanticFoldCommands = registerSemanticFoldCommands(editorState, {
			onFoldLines: (startLine, _endLine) => {
				// FoldManager.collapse expects the start line of a fold region
				foldManager?.collapse(startLine);
			},
			onUnfoldLines: (startLine, _endLine) => {
				foldManager?.expand(startLine);
			},
			onFoldAll: () => {
				foldManager?.collapseAll();
			},
			onUnfoldAll: () => {
				foldManager?.expandAll();
			},
			onApplyPreset: (preset) => {
				applyFoldPresetInternal(preset);
			},
			getLanguage: () => language
		});

		// Note: Global mouse events are now attached/detached per-drag in handleMouseDown/handleMouseUp
		// This prevents conflicts between multiple editor instances

		// Watch for container resize to recalculate character measurements and the
		// content viewport height (the latter drives line virtualization).
		resizeObserver = new ResizeObserver(() => {
			inputHandlers.measureCharacter();
			if (editorContent) {
				viewportHeight = editorContent.clientHeight || FALLBACK_VIEWPORT_HEIGHT;
				viewportWidth = editorContent.clientWidth || 0;
			}
		});
		if (container) {
			resizeObserver.observe(container);
		}

		return () => {
			// Clean up resize observer
			resizeObserver?.disconnect();
			resizeObserver = null;

			// Clean up any active global event listeners
			inputHandlers.cleanupGlobalListeners();

			// Clean up cursor blink interval
			if (cursorBlinkInterval) {
				clearInterval(cursorBlinkInterval);
			}

			// Clean up editor state subscriptions
			unsubscribeContent?.();
			unsubscribeSelection?.();
			unsubscribeCursors?.();
			unsubscribeFold?.();
			unsubscribeContent = null;
			unsubscribeSelection = null;
			unsubscribeCursors = null;
			unsubscribeFold = null;

			// Clean up debounce timeout
			if (onChangeTimeout) {
				clearTimeout(onChangeTimeout);
				onChangeTimeout = null;
			}

			// Clean up fold update timeout
			if (foldUpdateTimeout) {
				clearTimeout(foldUpdateTimeout);
				foldUpdateTimeout = null;
			}

			// Clean up complexity update timeout
			if (complexityUpdateTimeout) {
				clearTimeout(complexityUpdateTimeout);
				complexityUpdateTimeout = null;
			}

			if (complexityFlashTimeout) {
				clearTimeout(complexityFlashTimeout);
				complexityFlashTimeout = null;
			}

			// Clean up semantic fold command registration
			unregisterSemanticFoldCommands?.();
			unregisterSemanticFoldCommands = null;
		};
	});
</script>

<div
	bind:this={container}
	class="custom-editor {className}"
	style="
		--editor-font-size: {mergedPrefs.fontSize}px;
		--editor-font-family: {mergedPrefs.fontFamily};
		--editor-line-height: {lineHeight}px;
		--editor-char-width: {charWidth}px;
		--editor-gutter-width: {gutterWidth}px;
	"
>
	<!-- Find/Replace bar -->
	{#if showFindReplace}
		<FindReplace
			bind:this={findReplaceComponent}
			query={searchQuery}
			replaceText={replaceTextState}
			caseSensitive={searchCaseSensitive}
			useRegex={searchUseRegex}
			matchCount={searchMatches.length}
			currentMatch={currentMatchIndex >= 0 ? currentMatchIndex + 1 : 0}
			onQueryChange={handleQueryChange}
			onReplaceTextChange={(text) => {
				editorFind.setReplaceText(text);
				syncFindState();
			}}
			onCaseSensitiveChange={(value) => {
				editorFind.setCaseSensitive(value);
				syncFindState();
			}}
			onUseRegexChange={(value) => {
				editorFind.setUseRegex(value);
				syncFindState();
			}}
			onFindNext={handleFindNext}
			onFindPrev={handleFindPrev}
			onReplace={handleReplace}
			onReplaceAll={handleReplaceAll}
			onClose={closeFind}
		/>
	{/if}

	<!-- Hidden input for capturing keyboard events -->
	<textarea
		bind:this={hiddenInput}
		class="custom-editor__input"
		autocomplete="off"
		spellcheck={false}
		tabindex={0}
		onkeydown={inputHandlers.handleKeyDown}
		oninput={inputHandlers.handleInput}
		onpaste={inputHandlers.handlePaste}
		oncopy={inputHandlers.handleCopy}
		oncut={inputHandlers.handleCut}
		onfocus={inputHandlers.handleFocus}
		onblur={inputHandlers.handleBlur}
		oncompositionstart={inputHandlers.handleCompositionStart}
		oncompositionend={inputHandlers.handleCompositionEnd}
	></textarea>

	<!-- Measure span for character dimensions -->
	<span bind:this={measureSpan} class="custom-editor__measure">M</span>

	<!-- Screen reader status (announces cursor position changes) -->
	<div class="custom-editor__sr-status" aria-live="polite" aria-atomic="true">
		{readonly ? 'Read-only. ' : ''}Line {selection.head.line + 1}, Column {selection.head.column +
			1}{hasSelection
			? `, ${Math.abs(selection.head.line - selection.anchor.line) + 1} lines selected`
			: ''}{hasMultipleCursors ? `, ${cursors.length} cursors active` : ''}{searchMatches.length > 0
			? `, ${searchMatches.length} search matches, match ${currentMatchIndex + 1} of ${searchMatches.length}`
			: ''}
	</div>

	<!-- Dynamic screen reader announcements for actions -->
	<div class="custom-editor__sr-status" aria-live="assertive" aria-atomic="true">
		{srAnnouncement}
	</div>

	<!-- Hidden keyboard shortcuts help for screen readers -->
	<div id="editor-help" class="custom-editor__sr-status">
		Keyboard shortcuts: Ctrl+F to find, Ctrl+H to replace, Ctrl+D to add cursor at next occurrence,
		Ctrl+Shift+L to select all occurrences, Escape to clear.{folding
			? ' Ctrl+Shift+[ to fold, Ctrl+Shift+] to unfold.'
			: ''}
	</div>

	<!-- Main editor content -->
	<div
		bind:this={editorContent}
		class="custom-editor__content"
		class:custom-editor__content--readonly={readonly}
		onmousedown={inputHandlers.handleMouseDown}
		onscroll={inputHandlers.handleScroll}
		role="textbox"
		aria-multiline="true"
		aria-readonly={readonly}
		aria-label={readonly ? 'Read-only code editor' : 'Code editor'}
		aria-describedby="editor-help"
		tabindex={0}
	>
		<!-- Complexity highlighting layer (bottommost) -->
		{#if complexityHighlighting && complexityMetrics}
			<ComplexityHeatLayer
				metrics={complexityMetrics}
				{lineHeight}
				{gutterWidth}
				totalHeight={totalContentHeight}
				contentWidth={estimatedContentWidth}
				minScore={complexityThreshold}
				enabled={complexityHighlighting}
				flashRegionKey={complexityFlashRegionKey}
				lineToVisualRow={(line) => lineToVisualRow(line)}
			/>
			<ComplexityLayer
				metrics={complexityMetrics}
				{lineHeight}
				{gutterWidth}
				totalHeight={totalContentHeight}
				minScore={complexityThreshold}
				enabled={complexityHighlighting}
				flashRegionKey={complexityFlashRegionKey}
				lineToVisualRow={(line) => lineToVisualRow(line)}
			/>
		{/if}

		<!-- AI Focus Layer (Ghost Pair visualization) -->
		{#if aiAgents.length > 0}
			<AIFocusLayer
				agents={aiAgents}
				{lineHeight}
				{charWidth}
				{gutterWidth}
				contentPadding={CONTENT_PADDING}
				showLabels={showAILabels}
				showFocusRegions={showAIFocusRegions}
				enabled={true}
			/>
		{/if}

		<!-- Gutter background (extends full height of content, matching the virtualized spacer) -->
		{#if mergedPrefs.lineNumbers !== 'off'}
			<div
				class="custom-editor__gutter-bg"
				style="width: {gutterWidth}px; height: {totalContentHeight}px;"
			></div>
		{/if}

		<!-- Search match highlights (below selection) -->
		{#if showFindReplace && searchMatches.length > 0}
			<div class="custom-editor__matches">
				{#each matchRects as rect, i (i)}
					<div
						class="custom-editor__match"
						class:custom-editor__match--current={rect.isCurrent}
						style="top: {rect.top}px; left: {rect.left}px; width: {rect.width}px; height: {rect.height}px;"
					></div>
				{/each}
			</div>
		{/if}

		<!-- Selection layer + cursors -->
		<EditorSelections
			{cursors}
			{cursorVisible}
			{readonly}
			{lineHeight}
			{charWidth}
			{gutterWidth}
			contentPadding={CONTENT_PADDING}
			{scrollTop}
			{viewportHeight}
			getLine={(n) => editorState.getLine(n)}
			lineCount={editorState?.lineCount ?? 0}
			lineToVisualRow={(line) => lineToVisualRow(line)}
		/>

		<!-- Lines (virtualized: only the windowed slice is rendered) -->
		<EditorLines
			{windowedLines}
			totalHeight={totalContentHeight}
			{lineHeight}
			activeLine={selection.head.line}
			highlightActiveLine={mergedPrefs.highlightActiveLine}
			lineNumbers={mergedPrefs.lineNumbers}
			{gutterWidth}
			tabSize={mergedPrefs.tabSize}
			{folding}
			{hasFoldIndicator}
			{isFoldCollapsed}
			{getHiddenLineCount}
			onFoldIndicatorClick={handleFoldIndicatorClick}
			onExpandFold={(index) => foldManager.expand(index)}
		/>
	</div>
</div>

<!-- Command Palette -->
<CommandPalette bind:open={showCommandPalette} onClose={() => editorContent?.focus()} />

<style>
	.custom-editor {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--ide-bg-primary);
		font-family: var(--editor-font-family), var(--ide-font-mono);
		font-size: var(--editor-font-size);
	}

	.custom-editor__input {
		position: absolute;
		top: 0;
		left: 0;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: 0;
		border: none;
		outline: none;
		background: transparent;
		color: transparent;
		resize: none;
		overflow: hidden;
		white-space: pre;
		z-index: -1;
		opacity: 0;
	}

	.custom-editor__measure {
		position: absolute;
		visibility: hidden;
		white-space: pre;
		font-family: var(--editor-font-family), var(--ide-font-mono);
		font-size: var(--editor-font-size);
		line-height: 1.4;
	}

	/* Screen reader only - visually hidden but accessible */
	.custom-editor__sr-status {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.custom-editor__content {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: auto;
		cursor: default;
	}

	.custom-editor__content--readonly {
		cursor: default;
	}

	.custom-editor__matches {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		pointer-events: none;
		z-index: 0;
	}

	.custom-editor__match {
		position: absolute;
		background: rgba(255, 213, 0, 0.25);
		border: 1px solid rgba(255, 213, 0, 0.5);
		border-radius: 2px;
		box-sizing: border-box;
	}

	.custom-editor__match--current {
		background: rgba(255, 213, 0, 0.45);
		border-color: rgba(255, 213, 0, 0.8);
	}

	/* Gutter background - extends full height of content */
	.custom-editor__gutter-bg {
		position: absolute;
		top: 0;
		left: 0;
		min-height: 100%;
		background: var(--ide-bg-secondary);
		border-right: 1px solid var(--ide-border);
		z-index: 1;
		pointer-events: none;
	}

	/* Token styles */
	:global(.token-comment),
	:global(.token-comment-line),
	:global(.token-comment-block),
	:global(.token-comment-doc) {
		color: var(--ide-syntax-comment);
		font-style: italic;
	}

	:global(.token-string),
	:global(.token-string-template) {
		color: var(--ide-syntax-string);
	}

	:global(.token-string-regex) {
		color: var(--ide-syntax-tag);
	}

	:global(.token-string-escape) {
		color: var(--ide-syntax-constant);
	}

	:global(.token-number),
	:global(.token-number-integer),
	:global(.token-number-float),
	:global(.token-number-hex),
	:global(.token-number-binary) {
		color: var(--ide-syntax-number);
	}

	:global(.token-keyword),
	:global(.token-keyword-control),
	:global(.token-keyword-operator),
	:global(.token-keyword-definition),
	:global(.token-keyword-module),
	:global(.token-keyword-storage) {
		color: var(--ide-syntax-keyword);
	}

	:global(.token-operator),
	:global(.token-operator-arithmetic),
	:global(.token-operator-comparison),
	:global(.token-operator-logical),
	:global(.token-operator-assignment) {
		color: var(--ide-syntax-operator);
	}

	:global(.token-variable) {
		color: var(--ide-syntax-variable);
	}

	:global(.token-variable-definition) {
		color: var(--ide-accent);
	}

	:global(.token-variable-parameter) {
		color: color-mix(in srgb, var(--ide-accent) 80%, var(--ide-text-muted));
	}

	:global(.token-function),
	:global(.token-function-definition),
	:global(.token-function-call) {
		color: var(--ide-syntax-function);
	}

	:global(.token-property),
	:global(.token-property-definition) {
		color: var(--ide-accent);
	}

	:global(.token-type),
	:global(.token-type-class),
	:global(.token-type-interface),
	:global(.token-type-namespace),
	:global(.token-type-builtin) {
		color: var(--ide-syntax-type);
	}

	:global(.token-constant),
	:global(.token-constant-boolean),
	:global(.token-constant-null),
	:global(.token-constant-builtin) {
		color: var(--ide-syntax-constant);
	}

	:global(.token-punctuation),
	:global(.token-punctuation-bracket),
	:global(.token-punctuation-brace),
	:global(.token-punctuation-paren),
	:global(.token-punctuation-separator),
	:global(.token-punctuation-accessor) {
		color: var(--ide-syntax-punctuation);
	}

	/* Svelte template braces - make them stand out */
	:global(.token-punctuation-brace) {
		color: var(--ide-syntax-constant);
		font-weight: 600;
	}

	:global(.token-tag),
	:global(.token-tag-name) {
		color: var(--ide-syntax-tag);
	}

	:global(.token-tag-attribute) {
		color: var(--ide-syntax-attribute);
	}

	:global(.token-tag-attribute-value) {
		color: var(--ide-syntax-string);
	}

	:global(.token-tag-punctuation) {
		color: var(--ide-syntax-punctuation);
	}

	:global(.token-markup-heading) {
		color: var(--ide-syntax-function);
		font-weight: bold;
	}

	:global(.token-markup-bold) {
		font-weight: bold;
	}

	:global(.token-markup-italic) {
		font-style: italic;
	}

	:global(.token-markup-link) {
		color: var(--ide-accent);
		text-decoration: underline;
	}

	:global(.token-markup-code) {
		color: var(--ide-syntax-string);
		background: var(--ide-bg-tertiary);
	}

	:global(.token-markup-quote) {
		color: var(--ide-text-secondary);
		font-style: italic;
	}

	:global(.token-markup-list) {
		color: var(--ide-text-accent);
	}

	:global(.token-invalid) {
		color: var(--ide-error);
	}
</style>
