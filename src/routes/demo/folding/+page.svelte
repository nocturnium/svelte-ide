<script lang="ts">
	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
	import Example from './Example.svelte';
	import exampleSource from './Example.svelte?raw';
</script>

<DemoPage
	eyebrow="Core editor"
	title="Code Folding"
	description="Collapse and expand code blocks to navigate large files. Toggle the language and folding, then open the Code tab to see the exact CustomEditor props."
>
	<DemoExhibit code={exampleSource} language="svelte" filename="Example.svelte">
		<Example />
	</DemoExhibit>

	<section class="doc">
		<h2>Features</h2>
		<ul class="features-list">
			<li>
				<strong>Bracket-based folding:</strong> Automatically detects foldable regions based on matching
				braces, brackets, and parentheses (JavaScript, TypeScript, JSON, etc.)
			</li>
			<li>
				<strong>Indentation-based folding:</strong> For languages like Python that use indentation for
				structure
			</li>
			<li>
				<strong>Region markers:</strong> Use <code>// #region</code> and
				<code>// #endregion</code> comments to define custom foldable sections
			</li>
			<li>
				<strong>Multi-line comments:</strong> Long block comments can be collapsed to reduce clutter
			</li>
			<li>
				<strong>Keyboard shortcuts:</strong>
				<ul>
					<li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>[</kbd> - Fold current region</li>
					<li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>]</kbd> - Unfold current region</li>
					<li><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>[</kbd> - Fold all regions</li>
					<li><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>]</kbd> - Unfold all regions</li>
				</ul>
			</li>
		</ul>
	</section>

	<section class="doc">
		<h2>Fold Indicators</h2>
		<div class="indicator-examples">
			<div class="indicator-example">
				<span class="fold-demo-icon expanded">▼</span>
				<span>Expanded - click to collapse</span>
			</div>
			<div class="indicator-example">
				<span class="fold-demo-icon collapsed">▶</span>
				<span>Collapsed - click to expand</span>
			</div>
			<div class="indicator-example">
				<span class="fold-demo-placeholder">...</span>
				<span>Indicates hidden lines (click to expand)</span>
			</div>
		</div>
	</section>
</DemoPage>

<style>
	.doc h2 {
		font-size: var(--ide-font-size-xl);
		font-weight: 600;
		color: var(--ide-text-primary);
		margin: 0 0 var(--ide-spacing-md);
	}

	.features-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.features-list > li {
		padding: 0.75rem 0;
		color: var(--ide-text-secondary);
		border-bottom: 1px solid var(--ide-border);
	}

	.features-list > li:last-child {
		border-bottom: none;
	}

	.features-list strong {
		color: var(--ide-text-primary);
	}

	.features-list code {
		background: var(--ide-bg-tertiary);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		font-family: var(--ide-font-mono);
		font-size: 0.85em;
	}

	.features-list ul {
		margin-top: 0.5rem;
		padding-left: 1.5rem;
	}

	.features-list kbd {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 3px;
		font-family: var(--ide-font-mono);
		font-size: 0.8em;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
	}

	.indicator-examples {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--ide-bg-secondary);
		border-radius: var(--ide-radius-md);
	}

	.indicator-example {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: var(--ide-text-secondary);
	}

	.fold-demo-icon {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
	}

	.fold-demo-icon.expanded {
		color: var(--ide-text-secondary);
	}

	.fold-demo-icon.collapsed {
		color: var(--ide-interactive);
	}

	.fold-demo-placeholder {
		padding: 0 6px;
		background: var(--ide-bg-tertiary);
		border: 1px solid var(--ide-border);
		border-radius: 3px;
		font-size: 0.85em;
		color: var(--ide-text-secondary);
	}
</style>
