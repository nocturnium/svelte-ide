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
export * from './core/complexity-provider';
export * from './core/complexity-ast';
export * from './core/complexity-estree';
export * from './core/complexity-compose';

// Core utilities (explicitly excluding CRDT binding; use @nocturnium/svelte-ide/crdt)
export * from './core/state';
export * from './core/navigation';
export * from './core/keybindings';
export * from './core/search';
export * from './core/folding';
export * from './core/multi-cursor';
export * from './core/complexity-analyzer';
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
