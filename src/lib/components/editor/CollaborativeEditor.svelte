<script lang="ts">
	/**
	 * Collaborative Editor component
	 *
	 * This component wraps the custom editor with Yjs CRDT support
	 * for real-time collaborative editing.
	 */

	import { onMount, onDestroy } from 'svelte';
	import * as Y from 'yjs';
	import CustomEditor from './CustomEditor.svelte';
	import {
		createEditorState,
		createCRDTBinding,
		type CRDTBinding
	} from './core';
	import type { EditorPreferences } from '$types';
	import type { CollaborationUser } from '$lib/types/crdt';

	interface Props {
		/** Yjs document for collaboration (optional - will create one if not provided) */
		doc?: Y.Doc;
		/** Document ID for standalone mode */
		documentId?: string;
		/** Initial content when creating a new document */
		initialContent?: string;
		/** Text type name in the Yjs document */
		textName?: string;
		/** Language for syntax highlighting */
		language?: string;
		/** Whether the editor is read-only */
		readonly?: boolean;
		/** Editor preferences */
		preferences?: Partial<EditorPreferences>;
		/** Additional CSS class */
		class?: string;
		/** Current user info for cursor display */
		currentUser?: CollaborationUser;
		/** Called when content changes */
		onChange?: (content: string) => void;
		/** Called when cursor position changes */
		onCursorChange?: (line: number, column: number) => void;
		/** Called when save is triggered (Ctrl+S) */
		onSave?: () => void;
	}

	let {
		doc: externalDoc,
		documentId: _documentId,
		initialContent = '',
		textName = 'content',
		language = 'plaintext',
		readonly = false,
		preferences = {},
		class: className = '',
		currentUser: _currentUser,
		onChange,
		onCursorChange,
		onSave
	}: Props = $props();

	// Create internal doc if none provided
	let internalDoc: Y.Doc | null = null;

	// Editor state and CRDT binding
	let editorState = $state<ReturnType<typeof createEditorState> | null>(null);
	let crdtBinding = $state<CRDTBinding | null>(null);
	let content = $state('');

	// Unsubscribe for the bound editorState content-change listener
	let unsubscribeContent: (() => void) | null = null;

	// Yjs text observer used to mirror remote edits into `content`
	let yTextObserver: (() => void) | null = null;

	// Initialize on mount
	onMount(() => {
		// Use external doc or create internal one
		const doc = externalDoc ?? new Y.Doc();
		if (!externalDoc) {
			internalDoc = doc;
			// Initialize with content if provided
			if (initialContent) {
				const text = doc.getText(textName);
				text.insert(0, initialContent);
			}
		}

		// Create editor state
		editorState = createEditorState({
			content: initialContent,
			language,
			tabSize: preferences.tabSize ?? 2,
			insertSpaces: preferences.insertSpaces ?? false
		});

		// Create CRDT binding
		crdtBinding = createCRDTBinding({
			doc,
			textName,
			editorState
		});

		// Get initial content from CRDT
		content = crdtBinding.getText().toString();

		// Mirror local edits applied to the bound editorState into the prop that
		// drives the inner editor, and notify the outer onChange. (Remote edits are
		// applied with notifications suppressed, so they are handled by the Yjs
		// observer below instead.)
		unsubscribeContent = editorState.onContentChange(() => {
			const next = editorState!.getContent();
			if (next === content) return;
			content = next;
			onChange?.(next);
		});

		// Receive path: observe the Yjs text directly so remote edits from
		// collaborators are reflected into `content` and the outer onChange even
		// though the binding applies them with editorState notifications suppressed.
		const yText = crdtBinding.getText();
		const observer = () => {
			const next = yText.toString();
			if (next === content) return;
			content = next;
			onChange?.(next);
		};
		yText.observe(observer);
		yTextObserver = () => yText.unobserve(observer);
	});

	onDestroy(() => {
		unsubscribeContent?.();
		unsubscribeContent = null;
		yTextObserver?.();
		yTextObserver = null;
		crdtBinding?.destroy();
		internalDoc?.destroy();
	});

	// Handle content changes from the inner editor (local typing).
	//
	// The inner CustomEditor maintains its OWN EditorState, so local edits never
	// reach the CRDT-bound editorState on their own. Push the new content into the
	// binding, which updates the bound editorState and propagates the edit to Yjs
	// so collaborators see it. crdtBinding.setContent is a no-op while a remote
	// update is being applied and when the content is unchanged, which prevents a
	// remote -> local -> remote echo loop. The bound editorState's content-change
	// listener (above) is responsible for updating `content` and firing onChange.
	function handleChange(newContent: string) {
		if (!crdtBinding) {
			// Binding not ready yet (pre-mount) - fall back to local mirroring.
			content = newContent;
			onChange?.(newContent);
			return;
		}
		crdtBinding.setContent(newContent);
	}

	// Handle cursor changes
	function handleCursorChange(line: number, column: number) {
		onCursorChange?.(line, column);

		// Could broadcast cursor position to other collaborators here
		// using Yjs awareness protocol
	}
</script>

<div class="collab-editor {className}">
	{#if editorState}
		<CustomEditor
			{content}
			{language}
			{readonly}
			{preferences}
			onChange={handleChange}
			onCursorChange={handleCursorChange}
			{onSave}
		/>
	{:else}
		<div class="collab-editor__loading">
			<span>Initializing collaborative editor...</span>
		</div>
	{/if}

	<!-- Remote cursors overlay would go here -->
	<div class="collab-editor__cursors">
		<!-- Remote collaborator cursors will be rendered here -->
	</div>
</div>

<style>
	.collab-editor {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.collab-editor__loading {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background: var(--ide-bg-primary);
		color: var(--ide-text-muted);
	}

	.collab-editor__cursors {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 100;
	}
</style>
