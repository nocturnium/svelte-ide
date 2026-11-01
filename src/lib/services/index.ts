/**
 * @nocturnium/svelte-ide/services
 *
 * Backend-facing services. These are experimental and live outside the root
 * entry so that importing the editor never pulls in network clients.
 *
 * The LSP client is also exported from the package root as stable API.
 */
export * as vfsClient from './vfs-client';
export * as ideIntegration from './ide-integration';
export * as errorHandling from './error-handling';
export * as optimistic from './optimistic';
export {
	LSPClient,
	createLSPClient,
	applyContentChanges,
	positionToOffset,
	offsetToPosition,
	rangeToOffsets
} from './lsp-client';
