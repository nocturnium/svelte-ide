<script lang="ts">
	/**
	 * Editor component - Zero-dependency code editor
	 *
	 * This is the main editor component that wraps the custom editor implementation.
	 * It provides the same interface as the previous CodeMirror-based editor.
	 */

	import CustomEditor from './CustomEditor.svelte';
	import type { EditorPreferences } from '$types';

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
