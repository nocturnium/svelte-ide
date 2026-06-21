<script lang="ts">
	import { onMount } from 'svelte';
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import type { EditorPreferences } from '$types';
	import Seo from '../../_components/Seo.svelte';

	type SizeOption = {
		label: string;
		lines: number;
	};

	const sizeOptions: SizeOption[] = [
		{ label: '1k', lines: 1_000 },
		{ label: '10k', lines: 10_000 },
		{ label: '50k', lines: 50_000 }
	];
	const DEFAULT_LINE_COUNT = 50_000;

	const preferences: Partial<EditorPreferences> = {
		lineNumbers: 'on',
		insertSpaces: true,
		tabSize: 2,
		wordWrap: 'off',
		minimap: false,
		highlightActiveLine: true
	};

	let selectedLineCount = $state(DEFAULT_LINE_COUNT);
	let editorHost = $state<HTMLDivElement | null>(null);
	let renderedLineNodes = $state(0);
	let fps = $state(0);
	let content = $state(generateDocument(DEFAULT_LINE_COUNT));

	let removeScrollListener: (() => void) | null = null;
	let fpsFrame = 0;

	function formatNumber(value: number): string {
		return new Intl.NumberFormat('en-US').format(value);
	}

	function generateDocument(lineCount: number): string {
		const lines = new Array<string>(lineCount);
		const templates = [
			(index: number) =>
				`export const order_${index} = hydrateOrder({ id: ${index}, region: 'us-west', priority: ${index % 7} });`,
			(index: number) =>
				`if (order_${index}.priority > 3) queueDispatch(order_${index}, metrics.latencyP95);`,
			(index: number) =>
				`const invoice_${index} = await ledger.createInvoice(order_${index}.customerId, order_${index}.items);`,
			(index: number) =>
				`logger.debug('pipeline:batch', { line: ${index}, shard: ${index % 32}, retry: false });`,
			(index: number) =>
				`cache.set(\`order:${index}\`, serialize(order_${index}), { ttl: 60_000, tags: ['stress-demo'] });`,
			(index: number) =>
				`metrics.histogram('editor.virtual.row', ${index % 100}, { windowed: true, size: ${lineCount} });`
		];

		for (let i = 0; i < lineCount; i += 1) {
			lines[i] = templates[i % templates.length](i + 1);
		}

		return lines.join('\n');
	}

	function updateRenderedLineCount() {
		renderedLineNodes =
			editorHost?.querySelectorAll('.custom-editor__line').length ?? renderedLineNodes;
	}

	function bindEditorScroll() {
		removeScrollListener?.();
		removeScrollListener = null;

		const scroller = editorHost?.querySelector<HTMLElement>('.custom-editor__content');
		if (!scroller) return;

		let pending = false;
		const scheduleUpdate = () => {
			if (pending) return;
			pending = true;
			requestAnimationFrame(() => {
				pending = false;
				updateRenderedLineCount();
			});
		};

		scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
		removeScrollListener = () => scroller.removeEventListener('scroll', scheduleUpdate);
		updateRenderedLineCount();
	}

	function selectSize(lineCount: number) {
		selectedLineCount = lineCount;
		content = generateDocument(lineCount);
		requestAnimationFrame(() => {
			bindEditorScroll();
			updateRenderedLineCount();
		});
	}

	onMount(() => {
		const bindFrame = requestAnimationFrame(bindEditorScroll);

		let frames = 0;
		let lastSample = performance.now();
		const sampleFps = (now: number) => {
			frames += 1;
			if (now - lastSample >= 500) {
				fps = Math.round((frames * 1000) / (now - lastSample));
				frames = 0;
				lastSample = now;
				updateRenderedLineCount();
			}
			fpsFrame = requestAnimationFrame(sampleFps);
		};

		fpsFrame = requestAnimationFrame(sampleFps);

		return () => {
			cancelAnimationFrame(bindFrame);
			cancelAnimationFrame(fpsFrame);
			removeScrollListener?.();
		};
	});
</script>

<Seo
	title="Stress Demo"
	description="A real Nocturnium CustomEditor rendering a generated 50,000-line file — proof that virtualized rendering stays smooth, with live DOM-node and FPS counters."
/>

<main class="stress-demo">
	<header class="stress-hero">
		<div class="stress-hero__copy">
			<p class="eyebrow">Virtualized editor stress test</p>
			<h1>{formatNumber(selectedLineCount)} lines, ~{renderedLineNodes} DOM nodes, {fps}fps.</h1>
			<p>
				The real CustomEditor is mounted below with a generated TypeScript-scale workload. Only the
				visible window is in the DOM while the document remains fully scrollable.
			</p>
		</div>

		<div class="metrics" aria-label="Live editor stress metrics">
			<div class="metric">
				<span class="metric__value" data-testid="stress-line-count"
					>{formatNumber(selectedLineCount)}</span
				>
				<span class="metric__label">total lines</span>
			</div>
			<div class="metric">
				<span class="metric__value" data-testid="stress-rendered-line-count"
					>{renderedLineNodes}</span
				>
				<span class="metric__label">rendered .custom-editor__line nodes</span>
			</div>
			<div class="metric">
				<span class="metric__value" data-testid="stress-fps">{fps}</span>
				<span class="metric__label">live fps</span>
			</div>
		</div>
	</header>

	<section class="toolbar" aria-label="Document size">
		<span class="toolbar__label">Document size</span>
		<div class="size-control">
			{#each sizeOptions as option (option.lines)}
				<button
					type="button"
					class:active={selectedLineCount === option.lines}
					aria-pressed={selectedLineCount === option.lines}
					onclick={() => selectSize(option.lines)}
				>
					{option.label}
				</button>
			{/each}
		</div>
	</section>

	<section class="editor-shell" aria-label="Stress test editor">
		<div class="editor-chrome">
			<div class="window-dots" aria-hidden="true">
				<span class="dot dot--red"></span>
				<span class="dot dot--amber"></span>
				<span class="dot dot--green"></span>
			</div>
			<span class="file-name">generated-large-file.txt</span>
			<span class="proof-pill">real CustomEditor</span>
		</div>
		<div bind:this={editorHost} class="editor-container">
			<CustomEditor
				bind:content
				language="plaintext"
				{preferences}
				folding={false}
				complexityHighlighting={false}
				showAIFocusRegions={false}
			/>
		</div>
	</section>
</main>

<style>
	.stress-demo {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-lg);
		min-height: 100%;
		color: var(--ide-text-primary);
	}

	.stress-hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
		gap: var(--ide-spacing-xl);
		align-items: stretch;
		padding: var(--ide-spacing-xl);
		border: 1px solid color-mix(in srgb, var(--ide-accent) 28%, var(--ide-border));
		border-radius: var(--ide-radius-xl);
		background:
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--ide-bg-secondary) 86%, transparent),
				color-mix(in srgb, var(--ide-bg-primary) 94%, var(--ide-accent))
			),
			var(--ide-bg-secondary);
		box-shadow: var(--ide-shadow-md);
	}

	.stress-hero__copy {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--ide-spacing-md);
	}

	.eyebrow {
		margin: 0;
		color: var(--ide-accent);
		font-size: var(--ide-font-size-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.stress-hero h1 {
		max-width: 15ch;
		margin: 0;
		color: var(--ide-text-primary);
		font-size: var(--ide-font-size-3xl);
		font-weight: 800;
		line-height: var(--ide-line-height-tight);
	}

	.stress-hero p {
		max-width: 56rem;
		margin: 0;
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-base);
		line-height: var(--ide-line-height-relaxed);
	}

	.metrics {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--ide-spacing-sm);
	}

	.metric {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--ide-spacing-xs);
		min-height: 5rem;
		padding: var(--ide-spacing-md);
		border: 1px solid color-mix(in srgb, var(--ide-accent) 18%, var(--ide-border));
		border-radius: var(--ide-radius-lg);
		background: color-mix(in srgb, var(--ide-bg-primary) 72%, transparent);
	}

	.metric__value {
		color: var(--ide-accent-strong);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-2xl);
		font-weight: 700;
		line-height: 1;
	}

	.metric__label {
		color: var(--ide-text-muted);
		font-size: var(--ide-font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ide-spacing-md);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-lg);
		background: var(--ide-bg-secondary);
	}

	.toolbar__label {
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
	}

	.size-control {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		background: var(--ide-bg-primary);
	}

	.size-control button {
		min-width: 3.5rem;
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		color: var(--ide-text-secondary);
		background: transparent;
		border: 0;
		border-radius: var(--ide-radius-sm);
		font: inherit;
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
		cursor: pointer;
		transition:
			color var(--ide-transition-fast),
			background var(--ide-transition-fast);
	}

	.size-control button:hover {
		color: var(--ide-text-primary);
		background: var(--ide-bg-hover);
	}

	.size-control button.active {
		color: var(--ide-accent-strong);
		background: color-mix(in srgb, var(--ide-accent) 18%, transparent);
	}

	.size-control button:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.editor-shell {
		display: flex;
		height: min(68vh, 720px);
		min-height: 560px;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-xl);
		background: var(--ide-bg-secondary);
		box-shadow: var(--ide-shadow-lg);
	}

	.editor-chrome {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
		background: var(--ide-bg-primary);
	}

	.window-dots {
		display: inline-flex;
		gap: var(--ide-spacing-xs);
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: var(--ide-radius-full);
	}

	.dot--red {
		background: #ff5f57;
	}

	.dot--amber {
		background: var(--color-nocturnium-flame);
	}

	.dot--green {
		background: var(--color-nocturnium-aurora-green);
	}

	.file-name {
		color: var(--ide-text-muted);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
	}

	.proof-pill {
		margin-left: auto;
		padding: 2px var(--ide-spacing-sm);
		color: var(--ide-accent);
		border: 1px solid color-mix(in srgb, var(--ide-accent) 32%, transparent);
		border-radius: var(--ide-radius-full);
		background: color-mix(in srgb, var(--ide-accent) 12%, transparent);
		font-size: var(--ide-font-size-xs);
		font-weight: 700;
		text-transform: uppercase;
	}

	.editor-container {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: var(--ide-bg-primary);
	}

	@media (max-width: 860px) {
		.stress-hero {
			grid-template-columns: 1fr;
			padding: var(--ide-spacing-lg);
		}

		.stress-hero h1 {
			max-width: none;
			font-size: var(--ide-font-size-2xl);
		}

		.toolbar {
			align-items: stretch;
			flex-direction: column;
		}

		.size-control {
			width: 100%;
		}

		.size-control button {
			flex: 1;
		}

		.editor-shell {
			height: 520px;
			min-height: 520px;
		}
	}
</style>
