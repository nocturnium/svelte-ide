/**
 * Editor components and utilities
 */

// Components
export { default as Editor } from './Editor.svelte';
export { default as CustomEditor } from './CustomEditor.svelte';
export { default as EditorTabs } from './EditorTabs.svelte';
export { default as EditorPane } from './EditorPane.svelte';
export { default as FileIcon } from './FileIcon.svelte';
export { default as FileExplorer } from './FileExplorer.svelte';

// Cognitive-complexity surface. The analyzer was already public via
// `export * from './core/complexity-analyzer'`, while every component that draws
// its output was exported from nowhere — the engine was importable but the
// picture was not, so a consumer had to reimplement both overlays.
//
// The parser-backed half is exported here too. It was reachable only from the
// package root, so `@nocturnium/svelte-ide/editor` could hand you a provider
// type it had no way to let you satisfy.
export { default as ComplexityLayer } from './ComplexityLayer.svelte';
export { default as ComplexityHeatLayer } from './ComplexityHeatLayer.svelte';
export { default as ComplexityLegend } from './ComplexityLegend.svelte';
export { default as CognitiveLoadMeter } from './CognitiveLoadMeter.svelte';
// Named, not `export *`, for the complexity surface specifically.
//
// `export *` means every symbol a module gains later becomes public API the
// moment it is written, with no decision and no review. That is a poor posture
// generally and an actively bad one the day a major version freezes the surface:
// the whole point of 2.0.0 here is that these shapes stop moving, and a wildcard
// re-export is a standing promise to publish whatever shows up next.
//
// Listing them costs one line per symbol and makes adding to the public API a
// deliberate edit. The remaining `export *` lines below cover older modules whose
// surface this release is not freezing; converting those is worth doing, but it
// is a separate change with a separate blast radius.
export {
	buildComplexityPrompt,
	ComplexityProviderError,
	createChatComplexityProvider,
	createOllamaComplexityProvider,
	createOpenAICompatibleComplexityProvider,
	DEFAULT_MAX_TOKENS,
	mergeProvidedComplexity,
	parseComplexityResponse
} from './core/complexity-provider';
export type {
	ChatCompletion,
	ComplexityProvider,
	ComplexityProviderRequest,
	ComplexityProviderResult,
	ComplexitySource,
	ProvidedComplexityRegion
} from './core/complexity-provider';

export {
	analyzeAstComplexity,
	astComplexityMetrics,
	ComplexityAdapterError,
	createAstComplexityProvider
} from './core/complexity-ast';
export type {
	AstComplexityRegion,
	ComplexityAstAdapter,
	ComplexityNodeKind,
	ComplexityWalkContext
} from './core/complexity-ast';

export { createEstreeAdapter } from './core/complexity-estree';
export type { EstreeNode } from './core/complexity-estree';

export {
	composeComplexityProviders,
	withComplexityCache,
	withComplexityTimeout
} from './core/complexity-compose';
export type { ComplexityCacheOptions } from './core/complexity-compose';

// Core utilities (explicitly excluding CRDT binding; use @nocturnium/svelte-ide/crdt)
export * from './core/state';
export * from './core/navigation';
export * from './core/keybindings';
export * from './core/search';
export * from './core/folding';
export * from './core/multi-cursor';
export {
	COGNITIVE_COMPLEXITY_BANDS,
	ComplexityAnalyzer,
	createComplexityAnalyzer,
	getComplexityAnalyzer,
	getComplexityBandLabel,
	getComplexityContributionLabel,
	getComplexityLevel,
	getComplexityRegionKey,
	getComplexitySuggestion,
	getLegacyComplexityScore,
	summarizeContributions
} from './core/complexity-analyzer';
export type {
	ComplexityContribution,
	ComplexityContributionKind,
	ComplexityContributionSummary,
	ComplexityFactors,
	ComplexityMetrics,
	ComplexityRegion
} from './core/complexity-analyzer';
export * from './core/ai-awareness';
export * from './core/semantic-analyzer';
export * from './core/commands';
export * from './core/bracket-healer';
export * from './core/git-blame';
export * from './core/snippet-manager';
export * from './core/quick-actions';
export * from './core/diagnostics';
export * from './core/breakpoints';

// Explicit re-exports to disambiguate names declared in multiple core modules.
export type { Position } from './core/state';
export type { Diagnostic, Range } from './core/quick-actions';

// Theme
export * from './theme';

// Languages (explicit exports to avoid conflicts with tokenizer)
export {
	getLanguageExtension,
	getLanguageConfig,
	getLanguageFromExtension,
	getLanguageFromFilename,
	getLanguageFromMimeType,
	getAllLanguageConfigs,
	resolveLanguage,
	type LanguageConfig
} from './languages';

// Re-export from languages (these exist in both but we prefer languages versions)
export { getSupportedLanguages, isLanguageSupported } from './languages';

// Tokenizer (explicit exports to avoid conflicts)
export {
	getTokenizer,
	tokenize,
	getTokenClass,
	tokensToHTML,
	PlaintextTokenizer,
	createToken,
	type Token,
	type TokenizedLine,
	type TokenizerState,
	type TokenType,
	type LanguageTokenizer
} from './tokenizer';
