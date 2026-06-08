/**
 * Core editor module exports
 */

export * from './state';
export * from './navigation';
export * from './keybindings';
export * from './crdt-binding';
export * from './search';
export * from './folding';
export * from './multi-cursor';
export * from './complexity-analyzer';
export * from './ai-awareness';
export * from './semantic-analyzer';
export * from './commands';
export * from './bracket-healer';
export * from './git-blame';
export * from './snippet-manager';
export * from './quick-actions';
export * from './diagnostics';
export * from './breakpoints';

// Explicit re-exports to disambiguate names declared in multiple modules.
// Explicit named exports take precedence over `export *`, resolving ambiguity.
export type { Position } from './state';
export type { Diagnostic, Range } from './quick-actions';
