/**
 * @nocturnium/svelte-ide
 *
 * Zero-dependency IDE component library for Svelte 5.
 * A lightweight, framework-native alternative to CodeMirror.
 *
 * Core Philosophy:
 * - All UI components built from scratch (no UI libraries)
 * - Native Svelte 5 runes for state management
 * - Custom code editor (no CodeMirror dependency)
 * - Yjs for CRDT collaboration (optional via the ./crdt entry)
 *
 * ============================================================================
 * PUBLIC API SURFACE — what belongs in this root barrel
 * ============================================================================
 *
 * The root entry point (`@nocturnium/svelte-ide`) exposes ONLY the stable,
 * self-contained core: the editors, layout shell, file explorer, core UI
 * primitives, the editor/language/tokenizer/theme utilities, the LSP client,
 * the curated layout-store functions, and the public type surface.
 *
 * Backend-dependent or experimental subsystems are intentionally NOT in the
 * root. They remain fully reachable through their dedicated subpath entries so
 * that intent is explicit and tree-shaking stays clean:
 *
 *   - Agent presence UI ........ `@nocturnium/svelte-ide/components/agents`
 *   - VFS lock/conflict UI ..... `@nocturnium/svelte-ide/components/vfs`
 *   - Plugin UI components ...... `@nocturnium/svelte-ide/components/plugins`
 *   - Plugin runtime/loader .... `@nocturnium/svelte-ide/plugins`
 *   - CRDT collaboration ....... `@nocturnium/svelte-ide/crdt`
 *   - Backend services ......... `@nocturnium/svelte-ide/services/*`
 *   - Full store surface ....... `@nocturnium/svelte-ide/stores`
 *   - Full type/util surface ... `@nocturnium/svelte-ide/types`, `.../utils`
 *
 * Rule of thumb: stable core ships in the root; backend-dependent and
 * experimental subsystems ship via subpath entries and may change in minor
 * versions. See README "API Stability".
 */

// ============================================
// Core UI Components (Zero external dependencies)
// ============================================

/**
 * Core UI primitives - Button
 * @public - Stable API
 */
export { default as Button } from './components/core/Button.svelte';

/**
 * Core UI primitives - Icon
 * @public - Stable API
 */
export { default as Icon } from './components/core/Icon.svelte';

/**
 * Core UI primitives - Input
 * @public - Stable API
 */
export { default as Input } from './components/core/Input.svelte';

/**
 * Core UI primitives - Textarea
 * @public - Stable API
 */
export { default as Textarea } from './components/core/Textarea.svelte';

/**
 * Core UI primitives - Tooltip
 * @public - Stable API
 */
export { default as Tooltip } from './components/core/Tooltip.svelte';

/**
 * Core UI primitives - Kbd
 * @public - Stable API
 */
export { default as Kbd } from './components/core/Kbd.svelte';

/**
 * Core UI primitives - Badge
 * @public - Stable API
 */
export { default as Badge } from './components/core/Badge.svelte';

/**
 * Core UI primitives - Spinner
 * @public - Stable API
 */
export { default as Spinner } from './components/core/Spinner.svelte';

/**
 * Core UI primitives - Avatar
 * @public - Stable API
 */
export { default as Avatar } from './components/core/Avatar.svelte';

/**
 * Core UI primitives - ContextMenu
 * @public - Stable API
 */
export { default as ContextMenu } from './components/core/ContextMenu.svelte';

/**
 * Core UI primitives - ResizeHandle
 * @public - Stable API
 */
export { default as ResizeHandle } from './components/core/ResizeHandle.svelte';

/**
 * Core UI primitives - ErrorBoundary
 * @public - Stable API
 */
export { default as ErrorBoundary } from './components/core/ErrorBoundary.svelte';

/**
 * Core UI primitives - ConnectionStatus
 * @public - Stable API
 */
export { default as ConnectionStatus } from './components/core/ConnectionStatus.svelte';

// ============================================
// Editor Components (Zero external dependencies)
// ============================================

/**
 * Core editor component
 * @public - Stable API
 */
export { default as Editor } from './components/editor/Editor.svelte';

/**
 * Custom editor with full keyboard/mouse handling
 * @public - Stable API
 */
export { default as CustomEditor } from './components/editor/CustomEditor.svelte';

/**
 * Cognitive-complexity visualization.
 *
 * `CustomEditor` is exported here and its props include
 * `onComplexityChange?: (metrics: ComplexityMetrics | null) => void`, but
 * `ComplexityMetrics` was reachable only through the '/components/editor'
 * subpath — so a root-entry consumer was handed a callback whose parameter type
 * they could not name. The overlays themselves were exported from nowhere at
 * all. Both are fixed here.
 *
 * @public - Stable API
 */
export { default as ComplexityLayer } from './components/editor/ComplexityLayer.svelte';
export { default as ComplexityHeatLayer } from './components/editor/ComplexityHeatLayer.svelte';
export { default as ComplexityLegend } from './components/editor/ComplexityLegend.svelte';
export { default as CognitiveLoadMeter } from './components/editor/CognitiveLoadMeter.svelte';
export {
	COGNITIVE_COMPLEXITY_BANDS,
	getComplexityLevel,
	getComplexityBandLabel,
	getComplexityRegionKey,
	getComplexityAnalyzer,
	createComplexityAnalyzer
} from './components/editor/core/complexity-analyzer';
export type {
	ComplexityMetrics,
	ComplexityRegion,
	ComplexityFactors,
	ComplexityContribution,
	ComplexityContributionKind
} from './components/editor/core/complexity-analyzer';

/**
 * Pluggable complexity analysis. The built-in scanner is instant and offline but
 * approximates a parser; these let a consumer supply something that actually
 * parses — an AST pass, a language server, or a small model on a local Ollama or
 * any OpenAI-compatible endpoint. The library never calls a model itself, so the
 * package keeps zero runtime dependencies and no code leaves a machine unless
 * the consumer wires it to.
 *
 * @public - Stable API
 */
export {
	buildComplexityPrompt,
	parseComplexityResponse,
	createChatComplexityProvider,
	createOllamaComplexityProvider,
	createOpenAICompatibleComplexityProvider,
	mergeProvidedComplexity,
	ComplexityProviderError
} from './components/editor/core/complexity-provider';
export type {
	ComplexityProvider,
	ComplexityProviderRequest,
	ComplexityProviderResult,
	ProvidedComplexityRegion,
	ComplexitySource,
	ChatCompletion
} from './components/editor/core/complexity-provider';

/**
 * Editor tab bar component
 * @public - Stable API
 */
export { default as EditorTabs } from './components/editor/EditorTabs.svelte';

/**
 * Editor pane container
 * @public - Stable API
 */
export { default as EditorPane } from './components/editor/EditorPane.svelte';

/**
 * File icon component
 * @public - Stable API
 */
export { default as FileIcon } from './components/editor/FileIcon.svelte';

/**
 * File explorer sidebar component and associated types
 * @public - Stable API (FileExplorer, FileChangeStatus)
 * @experimental - GitFileStatus type may change in future versions
 */
export {
	default as FileExplorer,
	type FileChangeStatus,
	type GitFileStatus
} from './components/editor/FileExplorer.svelte';

/**
 * Editor core utilities and types
 *
 * Functions and types marked below:
 *   createEditorState, createNavigation, createKeyboardHandler,
 *   createDefaultKeybindings,
 *   EditorState, Position, Selection, Line, ChangeEvent,
 *   Navigation, KeyboardHandler, Keybinding,
 *   Cursor, CursorManager, CursorManagerConfig
 *
 * @public - Stable API
 */
export {
	createEditorState,
	type EditorState,
	type Position,
	type Selection,
	type Line,
	type ChangeEvent
} from './components/editor/core/state';

export { createNavigation, type Navigation } from './components/editor/core/navigation';

export {
	createKeyboardHandler,
	createDefaultKeybindings,
	type KeyboardHandler,
	type Keybinding
} from './components/editor/core/keybindings';

export {
	type Cursor,
	type CursorManager,
	type CursorManagerConfig
} from './components/editor/core/multi-cursor';

/**
 * Editor theme utilities and types
 * @public - Stable API
 */
export {
	nocturniumTheme,
	tokenColors,
	editorColors,
	getThemeCSS,
	type EditorTheme
} from './components/editor/theme';

/**
 * Language configuration utilities and types
 * @public - Stable API
 */
export {
	getLanguageExtension,
	getSupportedLanguages,
	isLanguageSupported,
	getLanguageConfig,
	getLanguageFromExtension,
	getLanguageFromFilename,
	resolveLanguage,
	type LanguageConfig
} from './components/editor/languages';

/**
 * Tokenizer utilities and types
 * @public - Stable API
 */
export {
	getTokenizer,
	tokenize,
	getTokenClass,
	tokensToHTML,
	type Token,
	type TokenizedLine,
	type TokenizerState,
	type TokenType,
	type LanguageTokenizer
} from './components/editor/tokenizer';

// ============================================
// AI Components (Zero external dependencies)
// ============================================

/**
 * AI assistant panel
 * @public - Stable API
 */
export { default as AIPanel } from './components/ai/AIPanel.svelte';

/**
 * AI message display component
 * @public - Stable API
 */
export { default as AIMessage } from './components/ai/AIMessage.svelte';

/**
 * AI tool call display component
 * @public - Stable API
 */
export { default as AIToolCallDisplay } from './components/ai/AIToolCallDisplay.svelte';

/**
 * AI edit preview component
 * @public - Stable API
 */
export { default as AIEditPreview } from './components/ai/AIEditPreview.svelte';

/**
 * AI inline edit component
 * @public - Stable API
 */
export { default as AIInlineEdit } from './components/ai/AIInlineEdit.svelte';

/**
 * AI suggestion widget component
 * @public - Stable API
 */
export { default as AISuggestionWidget } from './components/ai/AISuggestionWidget.svelte';

// ============================================
// Layout Components (Zero external dependencies)
// ============================================

/**
 * Main IDE layout shell
 * @public - Stable API
 */
export { default as IDELayout } from './components/layout/IDELayout.svelte';

/**
 * Status bar component
 * @public - Stable API
 */
export { default as StatusBar } from './components/layout/StatusBar.svelte';

// ============================================
// LSP Components (Zero external dependencies)
// ============================================

/**
 * LSP-integrated editor component
 * @public - Stable API
 */
export { default as LSPEditor } from './components/lsp/LSPEditor.svelte';

/**
 * Autocomplete widget for LSP completions
 * @public - Stable API
 */
export { default as AutocompleteWidget } from './components/lsp/AutocompleteWidget.svelte';

/**
 * Hover tooltip for LSP hover information
 * @public - Stable API
 */
export { default as HoverTooltip } from './components/lsp/HoverTooltip.svelte';

/**
 * Signature help widget for LSP signature information
 * @public - Stable API
 */
export { default as SignatureHelpWidget } from './components/lsp/SignatureHelpWidget.svelte';

/**
 * Diagnostics panel for LSP diagnostic display
 * @public - Stable API
 */
export { default as DiagnosticsPanel } from './components/lsp/DiagnosticsPanel.svelte';

/**
 * Diagnostic marker for inline LSP diagnostic display
 * @public - Stable API
 */
export { default as DiagnosticMarker } from './components/lsp/DiagnosticMarker.svelte';

/**
 * LSP client service
 *
 * Exports: LSPClient, createLSPClient, positionToOffset, offsetToPosition, rangeToOffsets
 *
 * @public - Stable API
 */
export {
	LSPClient,
	createLSPClient,
	positionToOffset,
	offsetToPosition,
	rangeToOffsets
} from './services/lsp-client';

/**
 * Public LSP types
 * @public - Diagnostic, LSPConnectionState, ServerCapabilities are part of the stable API
 */
export type { Diagnostic, LSPConnectionState, ServerCapabilities } from './types/lsp';

// ============================================
// Stores (Svelte 5 runes, zero external dependencies)
// ============================================

/**
 * Layout store functions — the curated, stable store surface for the root.
 *
 * Only these layout-store functions are part of the @public root API. The full
 * store surface (editor, AI, plugin, collaboration, VFS, agents — including
 * internal setters, getters, and mock/reset helpers) remains available via the
 * dedicated `@nocturnium/svelte-ide/stores` subpath entry for callers that opt
 * into it.
 *
 * @public - Stable API
 */
export {
	toggleLeftSidebar,
	toggleRightSidebar,
	toggleBottomPanel,
	setLeftSidebarPanel,
	setRightSidebarPanel,
	setBottomPanelTab,
	getLeftSidebarVisible,
	getLeftSidebarActivePanel,
	getRightSidebarVisible,
	getRightSidebarActivePanel,
	getBottomPanelVisible,
	getBottomPanelActiveTab,
	openCommandPalette,
	closeCommandPalette,
	getCommandPaletteOpen,
	focusAIPanel,
	focusTerminal,
	focusExplorer
} from './stores/layout.svelte';

// ============================================
// Public Types
// ============================================

/**
 * Editor types
 * @public - Stable API
 */
export type * from './types/editor';

/**
 * Filesystem types
 * @public - Stable API
 */
export type * from './types/filesystem';

/**
 * AI types
 * @public - Stable API
 */
export type * from './types/ai';

// ============================================
// CRDT Module (requires yjs, y-websocket)
// Import separately: import { ... } from '@nocturnium/svelte-ide/crdt'
// ============================================
// See: ./crdt/index.ts
