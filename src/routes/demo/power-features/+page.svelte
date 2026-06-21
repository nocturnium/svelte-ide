<script lang="ts">
	/**
	 * Power Features Demo
	 *
	 * Demonstrates Echo Cursors, Bracket Healing, and Plugin Preview.
	 */

	import { onMount } from 'svelte';
	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import {
		createEchoCursorManager,
		type EchoCursor,
		type EchoCursorManager
	} from '$lib/components/editor/core/echo-cursor';
	import {
		createBracketHealer,
		type BracketHealer,
		type BracketMismatch,
		type GhostBracket
	} from '$lib/components/editor/core/bracket-healer';
	import {
		createEditorState,
		type EditorState,
		type Position
	} from '$lib/components/editor/core/state';
	import PluginPreviewSandbox from '$lib/components/editor/PluginPreviewSandbox.svelte';
	import { tokenize, tokensToHTML } from '$lib/components/editor/tokenizer';

	// Demo state
	let activeDemo = $state<'echo' | 'bracket' | 'plugin'>('echo');

	// Echo cursor demo
	let echoManager: EchoCursorManager;
	let echoEditorState = $state<EditorState | null>(null);
	let echoEnabled = $state(false);
	let echoCursors = $state<EchoCursor[]>([]);
	// Snapshot of each echo's real EditorState mirror buffer, keyed by cursor id.
	// Refreshed from echoManager.getEchoContent() so the replayed buffers are
	// actually surfaced in the UI (not just the cursor markers).
	let echoMirrorContents = $state<Record<string, string>>({});
	let echoSourceContent = $state(`const user = getUser();
const profile = user.profile;
const status = profile.status;

renderUser(user);
renderProfile(profile);
renderStatus(status);`);
	let keystrokeLog = $state<string[]>([]);

	// Bracket healer demo
	let bracketHealer: BracketHealer;
	let bracketCode = $state(`function processData(items) {  // '{' opened here is never closed
	const results = [];
	for (let i = 0; i < items.length; i++) {
		if (items[i].valid {  // Missing closing paren
			results.push(transform(items[i]));
		}
	}
	return results;
// The function body's closing brace is missing — flagged at line 1, where '{' opened`);
	let ghosts = $state<GhostBracket[]>([]);
	let mismatches = $state<BracketMismatch[]>([]);

	// Color the "n issue(s)" badge by the most severe issue actually present so it
	// matches the severity the healer assigns (unclosed brackets are 'warning').
	let mismatchSeverity = $derived<'error' | 'warning' | 'info'>(
		mismatches.some((m) => m.severity === 'error')
			? 'error'
			: mismatches.some((m) => m.severity === 'warning')
				? 'warning'
				: 'info'
	);

	// Plugin sandbox demo
	let sandboxVisible = $state(false);
	// Deliberately loose sample: several lines carry trailing whitespace so the
	// Prettier preview yields a real, satisfying diff (it trims line ends) instead
	// of a silent +0 -0 no-op.
	let sandboxCode = $state(
		[
			'// Inert sample source for the plugin preview.   ',
			'function formatPrice(value) {   ',
			'\tconst rounded = Math.round(value * 100) / 100;  ',
			"\treturn '$' + rounded.toFixed(2);",
			'}',
			'',
			'function summarize(items) {  ',
			'\tconst total = items.reduce((sum, item) => sum + item.price, 0);   ',
			'\tconst count = items.length;',
			'\tconst name = "cart";  ',
			'',
			'\treturn {',
			'\t\tname,',
			'\t\tcount,   ',
			'\t\ttotal: formatPrice(total)',
			'\t};',
			'}',
			'',
			'export { formatPrice, summarize };'
		].join('\n')
	);

	// Line height for visualizations
	const lineHeight = 20;
	const codeEditorPreferences = {
		fontSize: 13,
		fontFamily: 'monospace',
		lineNumbers: 'off',
		minimap: false,
		wordWrap: 'off'
	} as const;

	function highlightCode(source: string, language: string): string {
		return tokenize(source, language)
			.map((line) => tokensToHTML(line.tokens))
			.join('\n');
	}

	let sandboxCodeHTML = $derived(highlightCode(sandboxCode, 'javascript'));

	onMount(() => {
		// Initialize echo manager
		echoManager = createEchoCursorManager({ defaultDelay: 200 });
		const realEchoEditor = createEditorState({
			content: echoSourceContent,
			language: 'javascript'
		});
		const detachEchoEditor = echoManager.attach(realEchoEditor);
		echoEditorState = realEchoEditor;
		echoManager.subscribe((event) => {
			echoCursors = echoManager.getEchoCursors();
			refreshEchoMirrors();

			if (event.type === 'keystroke-recorded') {
				const ks = event.event;
				let msg = '';
				switch (ks.type) {
					case 'insert':
						msg = `Insert: "${ks.data.text}"`;
						break;
					case 'delete':
						msg = `Delete: ${ks.data.direction}`;
						break;
					case 'newline':
						msg = 'Newline';
						break;
					case 'tab':
						msg = 'Tab';
						break;
				}
				keystrokeLog = [...keystrokeLog.slice(-9), msg];
			}
		});

		// Initialize bracket healer
		bracketHealer = createBracketHealer();
		bracketHealer.subscribe((state) => {
			ghosts = state.ghosts.filter((g) => !g.dismissed);
			mismatches = state.mismatches;
		});
		bracketHealer.analyzeImmediate(bracketCode);

		return () => {
			detachEchoEditor();
			echoManager?.disable();
			bracketHealer?.destroy();
		};
	});

	// Pull each echo's real mirror-buffer content out of the manager so the
	// replayed buffers can be rendered. Keeps the caption honest: the visible
	// mirror buffers are backed by real EditorState instances.
	function refreshEchoMirrors() {
		const next: Record<string, string> = {};
		for (const cursor of echoManager.getEchoCursors()) {
			next[cursor.id] = echoManager.getEchoContent(cursor.id);
		}
		echoMirrorContents = next;
	}

	function toggleEchoMode() {
		if (echoEnabled) {
			echoManager.disable();
		} else {
			echoManager.enable();
		}
		echoEnabled = echoManager.isEnabled();
		refreshEchoMirrors();
	}

	function addEchoPoint(line: number, delay: number) {
		if (!echoEnabled) {
			echoManager.enable();
			echoEnabled = true;
		}
		const _cursor = echoManager.addEchoPoint(
			{ line, column: 0 },
			{ delay, label: `Echo ${line + 1}` }
		);
		echoCursors = echoManager.getEchoCursors();
		refreshEchoMirrors();
	}

	function clearEchoes() {
		echoManager.clearAllEchoes();
		echoCursors = [];
		echoMirrorContents = {};
	}

	function positionFromIndex(content: string, index: number): Position {
		const lines = content.slice(0, index).split('\n');
		return {
			line: lines.length - 1,
			column: lines[lines.length - 1].length
		};
	}

	function applyEchoSourceContent(nextContent: string) {
		const state = echoEditorState;
		if (!state || nextContent === echoSourceContent) return;

		const previous = echoSourceContent;
		let prefix = 0;
		while (
			prefix < previous.length &&
			prefix < nextContent.length &&
			previous[prefix] === nextContent[prefix]
		) {
			prefix++;
		}

		let suffix = 0;
		while (
			suffix < previous.length - prefix &&
			suffix < nextContent.length - prefix &&
			previous[previous.length - 1 - suffix] === nextContent[nextContent.length - 1 - suffix]
		) {
			suffix++;
		}

		const from = positionFromIndex(previous, prefix);
		const removedEndIndex = previous.length - suffix;
		const insertedText = nextContent.slice(prefix, nextContent.length - suffix);

		if (removedEndIndex > prefix) {
			state.deleteRange(from, positionFromIndex(previous, removedEndIndex));
		}
		if (insertedText) {
			state.insertAt(from, insertedText);
		}

		echoSourceContent = state.getContent();
	}

	function updateBracketCode(value: string) {
		bracketCode = value;
		bracketHealer?.analyzeImmediate(bracketCode);
	}

	function acceptGhost(ghost: GhostBracket) {
		// Insert the ghost bracket at the position
		const lines = bracketCode.split('\n');
		const line = lines[ghost.position.line];
		lines[ghost.position.line] =
			line.slice(0, ghost.position.column) + ghost.character + line.slice(ghost.position.column);
		bracketCode = lines.join('\n');
		bracketHealer.acceptGhost(ghost.id);
		bracketHealer.analyzeImmediate(bracketCode);
	}

	function handlePluginApply(transform: { transformed: string }) {
		sandboxCode = transform.transformed;
		sandboxVisible = false;
	}

	const echoCode = `<script lang="ts">
  import { createEchoCursorManager } from '@nocturnium/svelte-ide';
  import { createEditorState } from '@nocturnium/svelte-ide';

  const editor = createEditorState({ content: source, language: 'javascript' });
  const echoes = createEchoCursorManager({ defaultDelay: 200 });
  echoes.attach(editor);
  echoes.enable();

  // Drop an echo that replays your keystrokes after a delay.
  echoes.addEchoPoint({ line: 2, column: 0 }, { delay: 100, label: 'Echo 3' });

  // Mirror each echo's replayed buffer into the UI.
  echoes.subscribe(() => {
    cursors = echoes.getEchoCursors();
  });
<${'/'}script>`;
</script>

<DemoPage
	eyebrow="Collaboration & AI"
	title="Power Features"
	description="Echo Cursors, Bracket Healing, and Plugin Preview."
>
	<!-- Demo tabs -->
	<div class="demo-tabs">
		<button class="tab" class:active={activeDemo === 'echo'} onclick={() => (activeDemo = 'echo')}>
			Echo Cursors
		</button>
		<button
			class="tab"
			class:active={activeDemo === 'bracket'}
			onclick={() => (activeDemo = 'bracket')}
		>
			Bracket Healing
		</button>
		<button
			class="tab"
			class:active={activeDemo === 'plugin'}
			onclick={() => (activeDemo = 'plugin')}
		>
			Plugin Preview
		</button>
	</div>

	<!-- Echo Cursors Demo -->
	{#if activeDemo === 'echo'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Echo Cursors</h2>
				<p>
					Create cursor "echoes" that replay your keystrokes with a delay. Type once, edit multiple
					locations with a temporal wave effect.
				</p>
			</div>

			<DemoExhibit code={echoCode} language="svelte" filename="echo-cursors.svelte">
				<div class="echo-demo">
					<div class="echo-controls">
						<button class="control-btn" class:active={echoEnabled} onclick={toggleEchoMode}>
							{echoEnabled ? 'Disable' : 'Enable'} Echo Mode
						</button>

						{#if echoEnabled}
							<div class="echo-actions">
								<span class="action-label">Add Echo at Line:</span>
								<button class="small-btn" onclick={() => addEchoPoint(2, 100)}>3 (100ms)</button>
								<button class="small-btn" onclick={() => addEchoPoint(5, 200)}>6 (200ms)</button>
								<button class="small-btn" onclick={() => addEchoPoint(8, 300)}>9 (300ms)</button>
							</div>

							<button class="control-btn control-btn--danger" onclick={clearEchoes}>
								Clear All Echoes
							</button>
						{/if}
					</div>

					<div class="echo-visualization">
						<div class="editor-mock-wrap">
							<div class="editor-mock">
								{#each echoSourceContent.split('\n') as line, i (i)}
									<div class="mock-line">
										<span class="line-num">{i + 1}</span>
										<span class="line-content">{line || ' '}</span>
									</div>
								{/each}

								<!-- Echo cursor overlay (simplified for demo) -->
								{#each echoCursors as cursor (cursor.id)}
									<div
										class="echo-marker"
										style="top: {cursor.position.line * lineHeight}px; --color: {cursor.color};"
									>
										<span class="echo-caret"></span>
										<span class="echo-label">{cursor.label} ({cursor.delayMs}ms)</span>
									</div>
								{/each}
							</div>

							{#if echoCursors.length > 0}
								<div class="echo-mirrors">
									{#each echoCursors as cursor (cursor.id)}
										<div class="echo-mirror" style="--color: {cursor.color};">
											<div class="echo-mirror__header">
												<span class="echo-mirror__dot"></span>
												<span class="echo-mirror__label">{cursor.label}</span>
												<span class="echo-mirror__delay">{cursor.delayMs}ms</span>
											</div>
											<pre class="echo-mirror__buffer">{echoMirrorContents[cursor.id] ?? ''}</pre>
										</div>
									{/each}
								</div>
							{/if}

							<p class="mock-caption" role="note">
								Each echo's buffer above is a real EditorState mirror — keystrokes you type in the
								source replay into it after the echo's delay.
							</p>
						</div>

						<div class="keystroke-log">
							<h4>Keystroke Log</h4>
							{#if keystrokeLog.length === 0}
								<p class="log-empty">Keystrokes will appear here...</p>
							{:else}
								{#each keystrokeLog as log, i (i)}
									<div class="log-entry" style="opacity: {1 - i * 0.08};">{log}</div>
								{/each}
							{/if}
						</div>
					</div>

					<label class="echo-source">
						<span>Source buffer</span>
						<textarea
							value={echoSourceContent}
							oninput={(event) =>
								applyEchoSourceContent((event.currentTarget as HTMLTextAreaElement).value)}
							spellcheck="false"
						></textarea>
					</label>

					<div class="echo-info">
						<h4>How It Works</h4>
						<ul>
							<li>Enable Echo Mode and add echo points at different lines</li>
							<li>Each echo has a configurable delay (100-500ms typical)</li>
							<li>Keystrokes at your main cursor are recorded</li>
							<li>Echo cursors replay the same keystrokes after their delay</li>
							<li>Perfect for repetitive edits across multiple locations</li>
						</ul>
					</div>
				</div>
			</DemoExhibit>
		</section>
	{/if}

	<!-- Bracket Healing Demo -->
	{#if activeDemo === 'bracket'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Bracket Healing</h2>
				<p>
					Intelligent detection of mismatched brackets with "ghost bracket" suggestions to heal the
					document structure.
				</p>
			</div>

			<div class="bracket-demo">
				<div class="bracket-editor">
					<div class="editor-header">
						<span>Code with bracket issues</span>
						<span class="mismatch-count mismatch-count--{mismatchSeverity}">
							{mismatches.length} issue{mismatches.length !== 1 ? 's' : ''} detected
						</span>
					</div>
					<div class="code-input">
						<CustomEditor
							content={bracketCode}
							language="javascript"
							readonly={false}
							folding={false}
							multiCursor={false}
							preferences={codeEditorPreferences}
							onChange={updateBracketCode}
						/>
					</div>
				</div>

				<div class="bracket-analysis">
					<div class="analysis-section">
						<h4>Ghost Bracket Suggestions</h4>
						{#if ghosts.length === 0}
							<p class="analysis-empty">No ghost brackets suggested</p>
						{:else}
							{#each ghosts as ghost (ghost.id)}
								<div class="ghost-suggestion">
									<div class="ghost-info">
										<span class="ghost-char">'{ghost.character}'</span>
										<span class="ghost-pos"
											>Line {ghost.position.line + 1}, Col {ghost.position.column}</span
										>
										<span
											class="ghost-confidence"
											style="color: {ghost.confidence > 0.8
												? 'var(--ide-success)'
												: 'var(--ide-warning)'}"
										>
											{Math.round(ghost.confidence * 100)}%
										</span>
									</div>
									<div class="ghost-reason">{ghost.reason}</div>
									<button class="accept-btn" onclick={() => acceptGhost(ghost)}>Insert</button>
								</div>
							{/each}
						{/if}
					</div>

					<div class="analysis-section">
						<h4>Detected Issues</h4>
						{#if mismatches.length === 0}
							<p class="analysis-empty">No bracket issues found</p>
						{:else}
							{#each mismatches as mm, i (i)}
								<div class="mismatch-item mismatch-item--{mm.severity}">
									<span class="mm-icon">
										{mm.issue === 'unclosed' ? '⚠' : mm.issue === 'unexpected' ? '✕' : '≠'}
									</span>
									<span class="mm-char">'{mm.character}'</span>
									<span class="mm-pos">Line {mm.position.line + 1}</span>
									<span class="mm-issue">{mm.issue}</span>
									{#if mm.expected}
										<span class="mm-expected">expected '{mm.expected}'</span>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- Plugin Preview Demo -->
	{#if activeDemo === 'plugin'}
		<section class="demo-section">
			<div class="section-header">
				<h2>Plugin Preview</h2>
				<p>
					Preview a plugin's transformation — see the diff and stats — before applying it to your
					code. Trusted plugin code runs in this editor's realm, not an isolated sandbox.
				</p>
			</div>

			<div class="plugin-demo">
				<div class="plugin-code">
					<div class="editor-header">
						<span>Source Code</span>
						<button class="open-sandbox-btn" onclick={() => (sandboxVisible = true)}>
							Open Plugin Preview
						</button>
					</div>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<pre class="code-preview"><code>{@html sandboxCodeHTML}</code></pre>
				</div>

				<div class="plugin-info">
					<h4>Available Demo Plugins</h4>
					<ul>
						<li><strong>Prettier</strong> - Format code with consistent style</li>
						<li><strong>Sort Imports</strong> - Alphabetically organize imports</li>
						<li><strong>Add Types</strong> - Add TypeScript type annotations</li>
						<li><strong>Add JSDoc</strong> - Generate JSDoc comments for functions</li>
						<li><strong>Minify</strong> - Compress code by removing whitespace</li>
					</ul>
					<p class="info-note">
						Click "Open Plugin Preview" to preview transformations before applying them.
					</p>
				</div>
			</div>
		</section>
	{/if}

	<PluginPreviewSandbox
		code={sandboxCode}
		language="javascript"
		visible={sandboxVisible}
		onApply={handlePluginApply}
		onClose={() => (sandboxVisible = false)}
	/>
</DemoPage>

<style>
	/* Tabs */
	.demo-tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--ide-border, #333);
		padding-bottom: 0.5rem;
	}

	.tab {
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: none;
		border-radius: 6px 6px 0 0;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s ease;
		/* Active underline indicator (transparent until active) so layout never shifts */
		border-bottom: 2px solid transparent;
	}

	.tab:hover {
		color: var(--ide-text-primary, #e8e8f0);
		background: rgba(255, 255, 255, 0.05);
	}

	.tab:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.tab.active {
		color: var(--ide-interactive);
		background: color-mix(in srgb, var(--ide-interactive) 12%, transparent);
		border-bottom-color: var(--ide-interactive);
	}

	/* Section */
	.demo-section {
		background: var(--ide-bg-secondary, #1e1e2e);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.section-header {
		margin-bottom: 1.5rem;
	}

	.section-header h2 {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.section-header p {
		margin: 0;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.9rem;
	}

	/* Echo Demo */
	.echo-demo {
		display: grid;
		gap: 1.5rem;
	}

	.echo-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
	}

	.control-btn {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--ide-interactive) 20%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-interactive) 30%, transparent);
		border-radius: 6px;
		color: var(--ide-interactive);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		background: color-mix(in srgb, var(--ide-interactive) 30%, transparent);
	}

	.control-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	/* Filled active pill: deeper blue so white text clears AA (~5.3:1). */
	.control-btn.active {
		background: var(--ide-interactive-strong);
		border-color: var(--ide-interactive-strong);
		color: #fff;
	}

	.control-btn--danger {
		background: color-mix(in srgb, var(--ide-error) 20%, transparent);
		border-color: color-mix(in srgb, var(--ide-error) 35%, transparent);
		color: var(--ide-error);
	}

	.control-btn--danger:hover {
		background: color-mix(in srgb, var(--ide-error) 30%, transparent);
	}

	.echo-actions,
	.echo-source {
		display: flex;
	}

	.echo-actions {
		align-items: center;
		gap: 0.5rem;
	}

	.echo-source {
		flex-direction: column;
		gap: 0.5rem;
	}

	.echo-source span {
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.echo-source textarea {
		min-height: 150px;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid var(--ide-border, #333);
		border-radius: 6px;
		color: var(--ide-text-primary, #e8e8f0);
		font: 13px/1.5 monospace;
		resize: vertical;
	}

	/* Brand focus ring (blue) instead of the default browser blue outline. */
	.echo-source textarea:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
		border-color: var(--ide-interactive);
	}

	.action-label {
		font-size: 0.8rem;
		/* Functional UI label: secondary (not muted) so it clears AA on the card. */
		color: var(--ide-text-secondary, #aaa);
	}

	.small-btn {
		padding: 0.25rem 0.5rem;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.small-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		color: var(--ide-text-primary, #e8e8f0);
	}

	.small-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.echo-visualization {
		display: grid;
		grid-template-columns: 1fr 250px;
		gap: 1rem;
		/* Keep both columns top-aligned; the left column carries its own min-height
		   so a short mirror buffer no longer collapses below the log card. */
		align-items: start;
	}

	.editor-mock-wrap {
		/* Allow the 1fr grid column to shrink instead of forcing overflow. */
		min-width: 0;
		/* Match the Keystroke Log card's height so the two columns stay vertically
		   aligned regardless of how many lines the mirror buffer has. */
		min-height: 140px;
	}

	.editor-mock {
		position: relative;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		padding: 0.5rem 0;
		font-family: monospace;
		font-size: 13px;
		overflow: hidden;
	}

	/* Clarifies that the editor is a non-interactive preview driven by the buttons. */
	.mock-caption {
		margin: 0.5rem 0 0;
		font-size: 0.75rem;
		font-style: italic;
		color: var(--ide-text-muted, #9b9bb0);
	}

	/* Real EditorState mirror buffers, one per echo cursor. */
	.echo-mirrors {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.echo-mirror {
		min-width: 0;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid var(--ide-border, #333);
		border-left: 3px solid var(--color);
		border-radius: 6px;
		overflow: hidden;
	}

	.echo-mirror__header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.6rem;
		background: rgba(255, 255, 255, 0.04);
		font-size: 0.7rem;
	}

	.echo-mirror__dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color);
		flex-shrink: 0;
	}

	.echo-mirror__label {
		color: var(--ide-text-secondary, #aaa);
		font-weight: 600;
	}

	.echo-mirror__delay {
		margin-left: auto;
		color: var(--ide-text-muted, #9b9bb0);
	}

	.echo-mirror__buffer {
		margin: 0;
		padding: 0.5rem 0.6rem;
		font-family: monospace;
		font-size: 11px;
		line-height: 1.5;
		color: var(--ide-text-secondary, #b4b4c4);
		white-space: pre;
		overflow-x: auto;
		max-height: 160px;
		overflow-y: auto;
	}

	.mock-line {
		display: flex;
		padding: 0 0.5rem;
		height: 20px;
		line-height: 20px;
	}

	.line-num {
		width: 30px;
		text-align: right;
		padding-right: 0.5rem;
		color: var(--ide-text-muted, #9b9bb0);
	}

	.line-content {
		color: var(--ide-text-secondary, #b4b4c4);
	}

	.echo-marker {
		position: absolute;
		left: 40px;
		right: 0.75rem;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 20px;
		pointer-events: none;
	}

	.echo-caret {
		width: 2px;
		height: 16px;
		background: var(--color);
		border-radius: 1px;
		animation: blink 1s ease-in-out infinite;
	}

	@keyframes blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	.echo-label {
		/* Sit in the right margin instead of over the line's leading code. */
		margin-left: auto;
		padding: 2px 6px;
		background: var(--color);
		border-radius: 4px;
		font-size: 10px;
		color: #fff;
	}

	.keystroke-log {
		display: flex;
		flex-direction: column;
		min-height: 140px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--ide-border, #333);
		border-radius: 8px;
		padding: 1rem;
	}

	.keystroke-log h4 {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.log-empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		font-size: 0.75rem;
		color: var(--ide-text-muted, #9b9bb0);
		font-style: italic;
	}

	.log-entry {
		font-family: monospace;
		font-size: 0.75rem;
		padding: 0.25rem 0;
		color: var(--ide-success);
	}

	.echo-info {
		padding: 1rem;
		background: color-mix(in srgb, var(--ide-interactive) 10%, transparent);
		border-radius: 8px;
	}

	.echo-info h4 {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
		color: var(--ide-interactive);
	}

	.echo-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.echo-info li {
		margin: 0.25rem 0;
	}

	/* Bracket Demo */
	.bracket-demo {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 1.5rem;
	}

	.bracket-editor {
		display: flex;
		flex-direction: column;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px 8px 0 0;
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.mismatch-count {
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.75rem;
		/* Neutral default; severity modifiers below tint it to match the engine. */
		background: rgba(255, 255, 255, 0.08);
		color: var(--ide-text-secondary, #aaa);
	}

	.mismatch-count--error {
		background: color-mix(in srgb, var(--ide-error) 20%, transparent);
		color: var(--ide-error);
	}

	.mismatch-count--warning {
		background: color-mix(in srgb, var(--ide-warning) 20%, transparent);
		color: var(--ide-warning);
	}

	.code-input {
		flex: 1;
		min-height: 300px;
		max-width: 100%;
		box-sizing: border-box;
		background: rgba(0, 0, 0, 0.3);
		border: none;
		border-radius: 0 0 8px 8px;
		color: var(--ide-text-primary, #e8e8f0);
		overflow: hidden;
	}

	.code-input :global(.custom-editor) {
		height: 100%;
		min-height: 300px;
		background: transparent;
		--editor-font-size: 13px !important;
	}

	.code-input :global(.custom-editor__content) {
		background: transparent;
		border-radius: 0 0 8px 8px;
	}

	.code-input :global(.custom-editor__line-content) {
		padding-right: 1rem;
	}

	.bracket-analysis {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.analysis-section {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		padding: 1rem;
	}

	.analysis-section h4 {
		margin: 0 0 0.75rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.analysis-empty {
		font-size: 0.8rem;
		color: var(--ide-text-muted, #9b9bb0);
		font-style: italic;
	}

	.ghost-suggestion {
		padding: 0.75rem;
		background: color-mix(in srgb, var(--ide-success) 12%, transparent);
		border-radius: 6px;
		margin-bottom: 0.5rem;
	}

	.ghost-info {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.ghost-char {
		font-family: monospace;
		font-weight: bold;
		color: var(--ide-success);
	}

	.ghost-pos {
		font-size: 0.75rem;
		color: var(--ide-text-muted, #9b9bb0);
	}

	.ghost-confidence {
		margin-left: auto;
		font-size: 0.75rem;
		font-weight: bold;
	}

	.ghost-reason {
		font-size: 0.75rem;
		color: var(--ide-text-secondary, #aaa);
		margin-bottom: 0.5rem;
	}

	.accept-btn {
		padding: 0.25rem 0.75rem;
		background: color-mix(in srgb, var(--ide-success) 20%, transparent);
		border: none;
		border-radius: 4px;
		color: var(--ide-success);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.accept-btn:hover {
		background: color-mix(in srgb, var(--ide-success) 30%, transparent);
	}

	.accept-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.mismatch-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 4px;
		margin-bottom: 0.25rem;
		font-size: 0.8rem;
	}

	.mismatch-item--error {
		background: color-mix(in srgb, var(--ide-error) 12%, transparent);
	}

	.mismatch-item--warning {
		background: color-mix(in srgb, var(--ide-warning) 12%, transparent);
	}

	.mm-icon {
		font-size: 0.9rem;
	}

	.mismatch-item--error .mm-icon {
		color: var(--ide-error);
	}

	.mismatch-item--warning .mm-icon {
		color: var(--ide-warning);
	}

	.mm-char {
		font-family: monospace;
		font-weight: bold;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.mm-pos {
		color: var(--ide-text-muted, #9b9bb0);
	}

	.mm-issue {
		color: var(--ide-text-secondary, #aaa);
	}

	.mm-expected {
		font-size: 0.75rem;
		color: var(--ide-text-muted, #9b9bb0);
	}

	/* Plugin Demo */
	.plugin-demo {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 1.5rem;
	}

	.plugin-code {
		display: flex;
		flex-direction: column;
	}

	.open-sandbox-btn {
		padding: 0.375rem 1rem;
		/* Filled primary: deeper blue so white text clears AA (~5.3:1). */
		background: var(--ide-interactive-strong);
		border: none;
		border-radius: 4px;
		color: #fff;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.open-sandbox-btn:hover {
		background: var(--ide-interactive);
	}

	.open-sandbox-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.code-preview {
		flex: 1;
		min-height: 300px;
		max-width: 100%;
		box-sizing: border-box;
		margin: 0;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 0 0 8px 8px;
		font-family: monospace;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ide-text-primary, #e8e8f0);
		overflow-x: auto;
		overflow-y: auto;
		white-space: pre;
	}

	.code-preview code {
		font-family: inherit;
		font-size: inherit;
	}

	.plugin-info {
		background: color-mix(in srgb, var(--ide-interactive) 10%, transparent);
		border-radius: 8px;
		padding: 1rem;
	}

	.plugin-info h4 {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		color: var(--ide-interactive);
	}

	.plugin-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.plugin-info li {
		margin: 0.4rem 0;
	}

	.plugin-info li strong {
		color: var(--ide-text-primary, #e8e8f0);
	}

	.info-note {
		margin-top: 1rem;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 6px;
		font-size: 0.8rem;
		color: var(--ide-text-muted, #9b9bb0);
	}

	/* ===== Responsive: tablet -> mobile ===== */
	@media (max-width: 860px) {
		/* Collapse every two-column region to a single stacked column so the
		   fixed 250/300px side panels no longer overflow the viewport. */
		.echo-visualization,
		.bracket-demo,
		.plugin-demo {
			grid-template-columns: 1fr;
		}

		/* Tab strip becomes a horizontal scroller with comfortable tap targets. */
		.demo-tabs {
			flex-wrap: nowrap;
			overflow-x: auto;
			scrollbar-width: none;
			-webkit-overflow-scrolling: touch;
			/* Right-edge fade to signal the strip scrolls. */
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
		}

		.demo-tabs::-webkit-scrollbar {
			display: none;
		}

		.tab {
			flex: 0 0 auto;
			white-space: nowrap;
			min-height: 44px;
		}

		/* Keep the bracket/plugin code surfaces contained; they no longer share a
		   row with a fixed analysis column, so let them size to the card. */
		.code-input,
		.code-preview {
			min-height: 220px;
		}

		.code-input :global(.custom-editor) {
			min-height: 220px;
		}
	}

	/* ===== Responsive: phones ===== */
	@media (max-width: 640px) {
		.demo-section {
			padding: 1.25rem 1rem;
		}

		/* Tighter tab padding so all three short labels are more likely to fit
		   without scrolling, plus a wider right-edge fade so the third demo
		   ("Plugin Preview") stays discoverable when the strip does scroll. */
		.demo-tabs {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent);
		}

		.tab {
			padding: 0.75rem 1rem;
		}

		/* Stack control rows so they don't wrap awkwardly mid-label. */
		.echo-actions {
			flex-wrap: wrap;
		}

		/* Roomier tap targets for the small demo buttons on touch screens. */
		.small-btn {
			min-height: 36px;
			padding: 0.4rem 0.6rem;
			font-size: 0.8rem;
		}

		/* Phones get the extra-small code size for denser line fit. */
		.code-input,
		.code-preview,
		.editor-mock {
			font-size: var(--ide-font-size-xs, 11px);
		}

		.code-input {
			--power-code-font-size: var(--ide-font-size-xs, 11px);
		}

		.code-input :global(.custom-editor) {
			--editor-font-size: var(--power-code-font-size) !important;
		}

		/* Right-edge scroll affordance for the horizontally scrollable code preview. */
		.code-preview {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent);
		}
	}
</style>
