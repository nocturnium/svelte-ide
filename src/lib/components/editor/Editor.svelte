<script lang="ts">
	/**
	 * Editor component - Zero-dependency code editor
	 *
	 * This is the main editor component that wraps the custom editor implementation.
	 * It provides the same interface as the previous CodeMirror-based editor.
	 */

	import CustomEditor from './CustomEditor.svelte';
	import type { EditorPreferences } from '$types';
	import type { AIAwareness } from './core/ai-awareness';

	interface Props {
		/** Document content */
		content: string;
		/** Language for syntax highlighting */
		language?: string;
		/** Whether the editor is read-only */
		readonly?: boolean;
		/** Editor preferences */
		preferences?: Partial<EditorPreferences>;
		/** Additional CSS class */
		class?: string;
		/** Enable code folding */
		folding?: boolean;
		/** Enable multi-cursor editing */
		multiCursor?: boolean;
		/** Maximum number of cursors */
		maxCursors?: number;
		/** AI agents for Ghost Pair visualization */
		aiAgents?: AIAwareness[];
		/** Called when content changes */
		onChange?: (content: string) => void;
		/** Called when cursor position changes */
		onCursorChange?: (line: number, column: number) => void;
		/** Called when save is triggered (Ctrl+S) */
		onSave?: () => void;
	}

	let {
		content = $bindable(),
		language = 'plaintext',
		readonly = false,
		preferences = {},
		class: className = '',
		folding = true,
		multiCursor = true,
		maxCursors = 100,
		aiAgents = [],
		onChange,
		onCursorChange,
		onSave
	}: Props = $props();
</script>

<div class="ide-editor {className}">
	<CustomEditor
		bind:content
		{language}
		{readonly}
		{preferences}
		{folding}
		{multiCursor}
		{maxCursors}
		{aiAgents}
		{onChange}
		{onCursorChange}
		{onSave}
	/>
</div>

<style>
	.ide-editor {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
</style>
