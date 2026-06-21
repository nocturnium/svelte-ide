<script lang="ts">
	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
	import Example from './Example.svelte';
	import exampleSource from './Example.svelte?raw';
</script>

<DemoPage
	eyebrow="Stable editor harness"
	title="Basic Code Editor"
	docTitle="Basic Editor Demo"
	description="A standalone CustomEditor with line numbers and per-language syntax highlighting — switch languages to watch the tokenizer repaint, then open the Code tab to see exactly how it's wired."
>
	<DemoExhibit code={exampleSource} language="svelte" filename="Example.svelte">
		<Example />
	</DemoExhibit>
</DemoPage>
