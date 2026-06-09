/**
 * CRDT module for collaborative editing
 * Uses Yjs for conflict-free replicated data types
 */

export { CollaborativeDocument } from './document';
export { CollaborativeProvider } from './provider';
export { createProvider } from './provider';
export { createAwarenessProtocol, generateUserColor, getInitials } from './awareness';
export { createUndoManager, createUserUndoManager } from './undo';
export { default as CollaborativeEditor } from '../components/editor/CollaborativeEditor.svelte';
export {
	CRDTBinding,
	createCRDTBinding,
	createRelativePosition,
	resolveRelativePosition
} from '../components/editor/core/crdt-binding';
export type * from './types';
export type {
	AwarenessProtocol,
	AwarenessUser,
	CreateAwarenessProtocolOptions
} from './awareness';
export type {
	UndoManagerInstance,
	UndoManagerOptions,
	UndoManagerState
} from './undo';
export type {
	CRDTBindingConfig,
	CRDTPosition,
	RelativePosition
} from '../components/editor/core/crdt-binding';
