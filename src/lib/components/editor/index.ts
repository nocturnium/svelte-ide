/**
 * Editor components and utilities
 */

// Components
export { default as Editor } from './Editor.svelte';
export { default as CustomEditor } from './CustomEditor.svelte';
export { default as CollaborativeEditor } from './CollaborativeEditor.svelte';
export { default as EditorTabs } from './EditorTabs.svelte';
export { default as EditorPane } from './EditorPane.svelte';
export { default as FileIcon } from './FileIcon.svelte';
export { default as FileExplorer } from './FileExplorer.svelte';

// Core utilities
export * from './core';

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
	SimpleTokenizer,
	GrammarTokenizer,
	createToken,
	type Token,
	type TokenizedLine,
	type TokenizerState,
	type TokenType,
	type LanguageTokenizer,
	type TokenRule,
	type LanguageGrammar
} from './tokenizer';
