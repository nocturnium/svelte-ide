/**
 * Core editor module exports
 */

export * from './state';
export * from './navigation';
export * from './keybindings';
// NOTE: './crdt-binding' is intentionally NOT re-exported here. It imports yjs
// (an optional peer dependency), so leaking it through this barrel would force
// yjs onto every consumer of the non-collaborative editor. The CRDT binding is
// available through the dedicated `@nocturnium/svelte-ide/crdt` entry instead.
export * from './search';
export * from './folding';
export * from './multi-cursor';
export * from './complexity-analyzer';
export * from './complexity-provider';
export * from './complexity-ast';
export * from './complexity-estree';
export * from './complexity-compose';
export * from './ai-awareness';
export * from './semantic-analyzer';
export * from './commands';
export * from './bracket-healer';
export * from './git-blame';
export * from './snippet-manager';
export * from './quick-actions';
export * from './diagnostics';
export * from './breakpoints';
export * from './extract-function';
export * from './apply-extract-plan';
export * from './extract-variable';
export * from './organize-imports';

// Explicit re-exports to disambiguate names declared in multiple modules.
// Explicit named exports take precedence over `export *`, resolving ambiguity.
export type { Position } from './state';
export type { Diagnostic, Range } from './quick-actions';
