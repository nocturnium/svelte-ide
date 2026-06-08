<script lang="ts">
	/**
	 * LSPEditor - CustomEditor with LSP integration
	 *
	 * Wraps the CustomEditor component and adds LSP-powered features:
	 * - Autocomplete (Ctrl+Space or typing)
	 * - Hover information (mouse hover with delay)
	 * - Signature help (typing '(' or ',')
	 * - Inline diagnostics
	 */

	import { onMount } from 'svelte';
	import type { EditorPreferences } from '$lib/types';
	import type { LSPClient } from '$lib/services/lsp-client';
	import type {
		CompletionItem,
		Hover,
		SignatureHelp,
		Diagnostic
	} from '$lib/types/lsp';
	import type { Cursor } from '../editor/core/multi-cursor';
	import CustomEditor from '../editor/CustomEditor.svelte';
	import AutocompleteWidget from './AutocompleteWidget.svelte';
	import HoverTooltip from './HoverTooltip.svelte';
	import SignatureHelpWidget from './SignatureHelpWidget.svelte';

	interface Props {
		/** Editor content */
		content: string;
		/** File URI for LSP */
		uri: string;
		/** Language identifier */
		language?: string;
		/** LSP client instance */
		lspClient?: LSPClient;
		/** Read-only mode */
		readonly?: boolean;
		/** Editor preferences */
		preferences?: Partial<EditorPreferences>;
		/** Enable code folding (default: true) */
		folding?: boolean;
		/** Enable multi-cursor editing (default: true) */
		multiCursor?: boolean;
		/** Maximum number of cursors (default: 100) */
		maxCursors?: number;
		/** Additional CSS class */
		class?: string;
		/** Called when content changes */
		onChange?: (content: string) => void;
		/** Called when cursor moves */
		onCursorChange?: (line: number, column: number) => void;
		/** Called when cursors change (for multi-cursor) */
		onCursorsChange?: (cursors: readonly Cursor[]) => void;
		/** Called on save (Ctrl+S) */
		onSave?: () => void;
		/** Called when diagnostics are received */
		onDiagnostics?: (diagnostics: Diagnostic[]) => void;
	}

	let {
		content = $bindable(),
		uri,
		language = 'plaintext',
		lspClient,
		readonly = false,
		preferences = {},
		folding = true,
		multiCursor = true,
		maxCursors = 100,
		class: className = '',
		onChange,
		onCursorChange,
		onCursorsChange,
		onSave,
		onDiagnostics
	}: Props = $props();

	// LSP feature states
	let completionItems = $state<CompletionItem[]>([]);
	let completionPosition = $state({ x: 0, y: 0 });
	let completionSelectedIndex = $state(0);
	let showCompletion = $state(false);

	let hoverData = $state<Hover | null>(null);
	let hoverPosition = $state({ x: 0, y: 0 });
	let showHover = $state(false);

	let signatureHelpData = $state<SignatureHelp | null>(null);
	let signaturePosition = $state({ x: 0, y: 0 });
	let showSignatureHelp = $state(false);

	let _diagnostics = $state<Diagnostic[]>([]);

	// Cursor position tracking
	let cursorLine = $state(1);
	let cursorColumn = $state(1);

	// Debounce timers
	let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
	let completionTimeout: ReturnType<typeof setTimeout> | null = null;

	// Editor reference for position calculations
	let editorContainer: HTMLDivElement;
	let editorRef: CustomEditor;

	// Document version for LSP
	let documentVersion = 1;

	// Track if document is open in LSP
	let documentOpen = false;

	// Open document when client connects
	async function openDocument() {
		if (!lspClient || documentOpen) return;

		try {
			lspClient.didOpen(uri, language, documentVersion, content);
			documentOpen = true;
		} catch (err) {
			console.error('[LSP] Failed to open document:', err);
		}
	}

	// Handle content changes
	async function handleChange(newContent: string) {
		onChange?.(newContent);

		if (!lspClient || !documentOpen) return;

		documentVersion++;
		try {
			lspClient.didChange(uri, documentVersion, [{ text: newContent }]);
		} catch (err) {
			console.error('[LSP] Failed to send didChange:', err);
		}
	}

	// Handle cursor changes
	function handleCursorChange(line: number, column: number) {
		cursorLine = line;
		cursorColumn = column;
		onCursorChange?.(line, column);

		// Hide popups when cursor moves
		hideCompletion();
		hideHover();
	}

	// === Completion ===

	async function requestCompletion() {
		if (!lspClient || !documentOpen) return;

		try {
			const items = await lspClient.completion(uri, {
				line: cursorLine - 1,
				character: cursorColumn - 1
			});

			if (items.length === 0) {
				hideCompletion();
				return;
			}

			completionItems = items;
			completionSelectedIndex = 0;
			completionPosition = calculatePopupPosition();
			showCompletion = true;
		} catch (err) {
			console.error('[LSP] Completion error:', err);
			hideCompletion();
		}
	}

	function hideCompletion() {
		showCompletion = false;
		completionItems = [];
	}

	function handleCompletionSelect(_item: CompletionItem) {
		// TODO: Apply text edit from completion item using _item.insertText ?? _item.label
		// For now, just insert at cursor position
		// This would need integration with the editor's insert method

		hideCompletion();
	}

	function handleCompletionSelectionChange(index: number) {
		completionSelectedIndex = index;
	}

	// === Hover ===

	async function requestHover(line: number, character: number) {
		if (!lspClient || !documentOpen) return;

		try {
			const result = await lspClient.hover(uri, { line, character });

			if (!result || !result.contents) {
				hideHover();
				return;
			}

			hoverData = result;
			showHover = true;
		} catch (err) {
			console.error('[LSP] Hover error:', err);
			hideHover();
		}
	}

	function hideHover() {
		showHover = false;
		hoverData = null;
	}

	// === Signature Help ===

	async function requestSignatureHelp() {
		if (!lspClient || !documentOpen) return;

		try {
			const result = await lspClient.signatureHelp(uri, {
				line: cursorLine - 1,
				character: cursorColumn - 1
			});

			if (!result || result.signatures.length === 0) {
				hideSignatureHelp();
				return;
			}

			signatureHelpData = result;
			signaturePosition = calculatePopupPosition();
			showSignatureHelp = true;
		} catch (err) {
			console.error('[LSP] Signature help error:', err);
			hideSignatureHelp();
		}
	}

	function hideSignatureHelp() {
		showSignatureHelp = false;
		signatureHelpData = null;
	}

	// === Diagnostics ===

	function handleDiagnosticsUpdate(params: { uri: string; diagnostics: Diagnostic[] }) {
		if (params.uri === uri) {
			_diagnostics = params.diagnostics;
			onDiagnostics?.(params.diagnostics);
		}
	}

	// === Keyboard Handling ===

	function handleKeyDown(e: KeyboardEvent) {
		// Handle completion navigation
		if (showCompletion) {
			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault();
					completionSelectedIndex = completionSelectedIndex > 0
						? completionSelectedIndex - 1
						: completionItems.length - 1;
					return;
				case 'ArrowDown':
					e.preventDefault();
					completionSelectedIndex = completionSelectedIndex < completionItems.length - 1
						? completionSelectedIndex + 1
						: 0;
					return;
				case 'Enter':
				case 'Tab':
					e.preventDefault();
					if (completionItems[completionSelectedIndex]) {
						handleCompletionSelect(completionItems[completionSelectedIndex]);
					}
					return;
				case 'Escape':
					e.preventDefault();
					hideCompletion();
					return;
			}
		}

		// Manual completion trigger (Ctrl+Space)
		if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
			e.preventDefault();
			requestCompletion();
			return;
		}

		// Trigger signature help on '(' or ','
		if (e.key === '(' || e.key === ',') {
			// Delay to allow character to be inserted
			setTimeout(() => requestSignatureHelp(), 50);
		}

		// Hide signature help on ')'
		if (e.key === ')') {
			hideSignatureHelp();
		}

		// Auto-complete after typing (debounced)
		if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
			if (completionTimeout) clearTimeout(completionTimeout);
			completionTimeout = setTimeout(() => {
				// Only trigger for identifier characters
				if (/[a-zA-Z0-9_.]/.test(e.key)) {
					requestCompletion();
				}
			}, 100);
		}
	}

	// === Mouse Handling ===

	function handleMouseMove(e: MouseEvent) {
		// Clear previous hover timeout
		if (hoverTimeout) clearTimeout(hoverTimeout);

		// Calculate position from mouse
		const rect = editorContainer?.getBoundingClientRect();
		if (!rect) return;

		// Store mouse position for hover popup
		hoverPosition = { x: e.clientX, y: e.clientY + 20 };

		// Debounce hover request
		hoverTimeout = setTimeout(() => {
			// Calculate line/column from mouse position
			// This is approximate - would need editor internals for exact position
			const lineHeight = 20; // Approximate
			const charWidth = 8; // Approximate
			const gutterWidth = 50; // Approximate

			const x = e.clientX - rect.left - gutterWidth;
			const y = e.clientY - rect.top;

			if (x < 0) return; // In gutter

			const line = Math.floor(y / lineHeight);
			const character = Math.floor(x / charWidth);

			if (line >= 0 && character >= 0) {
				requestHover(line, character);
			}
		}, 500);
	}

	function handleMouseLeave() {
		if (hoverTimeout) clearTimeout(hoverTimeout);
		hideHover();
	}

	// === Position Calculation ===

	function calculatePopupPosition(): { x: number; y: number } {
		// Calculate popup position based on cursor
		// This needs editor position + cursor offset
		const rect = editorContainer?.getBoundingClientRect();
		if (!rect) return { x: 0, y: 0 };

		const lineHeight = 20; // Approximate
		const charWidth = 8; // Approximate
		const gutterWidth = 50; // Approximate

		const x = rect.left + gutterWidth + (cursorColumn - 1) * charWidth;
		const y = rect.top + (cursorLine) * lineHeight;

		return { x, y };
	}

	// === Lifecycle ===

	let unsubscribeDiagnostics: (() => void) | null = null;

	onMount(() => {
		// Open document when mounted with client
		if (lspClient) {
			openDocument();

			// Subscribe to diagnostics using the correct API
			unsubscribeDiagnostics = lspClient.on('onDiagnostics', handleDiagnosticsUpdate);
		}

		return () => {
			// Clear timers
			if (hoverTimeout) clearTimeout(hoverTimeout);
			if (completionTimeout) clearTimeout(completionTimeout);

			// Unsubscribe from diagnostics
			if (unsubscribeDiagnostics) {
				unsubscribeDiagnostics();
				unsubscribeDiagnostics = null;
			}

			// Close document
			if (lspClient && documentOpen) {
				lspClient.didClose(uri);
			}
		};
	});

	// Watch for client changes
	$effect(() => {
		if (lspClient && !documentOpen) {
			openDocument();
			// Unsubscribe previous subscription
			if (unsubscribeDiagnostics) {
				unsubscribeDiagnostics();
			}
			// Re-subscribe with correct API
			unsubscribeDiagnostics = lspClient.on('onDiagnostics', handleDiagnosticsUpdate);
		}
	});
</script>

<!-- Editor surface: role="application" delegates keyboard to the editor; the mouse
	 handlers drive hover tooltips. Genuinely an interactive canvas, not a static div. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={editorContainer}
	class="lsp-editor {className}"
	onkeydown={handleKeyDown}
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
	role="application"
>
	<CustomEditor
		bind:this={editorRef}
		bind:content
		{language}
		{readonly}
		{preferences}
		{folding}
		{multiCursor}
		{maxCursors}
		onChange={handleChange}
		onCursorChange={handleCursorChange}
		{onCursorsChange}
		{onSave}
	/>

	<!-- Autocomplete Widget -->
	{#if showCompletion && completionItems.length > 0}
		<AutocompleteWidget
			items={completionItems}
			selectedIndex={completionSelectedIndex}
			position={completionPosition}
			onSelect={handleCompletionSelect}
			onDismiss={hideCompletion}
			onSelectionChange={handleCompletionSelectionChange}
		/>
	{/if}

	<!-- Hover Tooltip -->
	{#if showHover && hoverData}
		<HoverTooltip
			hover={hoverData}
			position={hoverPosition}
			onDismiss={hideHover}
		/>
	{/if}

	<!-- Signature Help -->
	{#if showSignatureHelp && signatureHelpData}
		<SignatureHelpWidget
			signatureHelp={signatureHelpData}
			position={signaturePosition}
			onDismiss={hideSignatureHelp}
		/>
	{/if}
</div>

<style>
	.lsp-editor {
		position: relative;
		width: 100%;
		height: 100%;
	}
</style>
