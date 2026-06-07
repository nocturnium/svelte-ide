/**
 * CRDT module for collaborative editing
 * Uses Yjs for conflict-free replicated data types
 */

export { CollaborativeDocument } from './document';
export { CollaborativeProvider } from './provider';
export { createAwarenessProtocol } from './awareness';
export { createUndoManager } from './undo';
export type * from './types';
