<script lang="ts">
	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
	import Example from './Example.svelte';
	import exampleSource from './Example.svelte?raw';
</script>

<DemoPage
	eyebrow="Core layout"
	title="Resizable Panes"
	description="Drag the handles between panels to resize — the edge follows your cursor live and content fades to hide reflow. Open the Code tab for the ResizeHandle wiring."
>
	<p class="touch-note" role="note">
		Tip: resize handles are drag-driven. On a touch device, view this demo on a wider screen to drag
		the panel edges directly.
	</p>

	<DemoExhibit code={exampleSource} language="svelte" filename="Example.svelte">
		<Example />
	</DemoExhibit>

	<section class="doc">
		<h2>Features</h2>
		<ul class="features-list">
			<li>
				<strong>Live Edge:</strong> The handle highlights and the panel edge tracks your cursor in real
				time as you drag
			</li>
			<li><strong>Smooth Transitions:</strong> Panel sizes animate smoothly when released</li>
			<li><strong>Content Fade:</strong> Panel content fades during resize to hide text reflow</li>
			<li><strong>Min/Max Constraints:</strong> Panels respect minimum and maximum size limits</li>
			<li>
				<strong>Double-click Reset:</strong> Double-click the handle to reset the panel to its default
				size
			</li>
		</ul>
	</section>
</DemoPage>

<style>
	.touch-note {
		display: none;
		margin: 0;
		padding: 0.75rem 1rem;
		border: 1px solid var(--ide-border);
		border-left: 3px solid var(--ide-interactive);
		border-radius: var(--ide-radius-md);
		background: var(--ide-bg-secondary);
		color: var(--ide-text-secondary);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

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

	.features-list li {
		padding: 0.5rem 0;
		color: var(--ide-text-secondary);
		border-bottom: 1px solid var(--ide-border);
	}

	.features-list li:last-child {
		border-bottom: none;
	}

	.features-list strong {
		color: var(--ide-text-primary);
	}

	@media (max-width: 640px) {
		.touch-note {
			display: block;
		}
	}
</style>
