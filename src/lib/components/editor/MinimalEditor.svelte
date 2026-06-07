<script lang="ts">
	// Minimal editor to debug cursor issue
	interface Props {
		content: string;
	}

	let { content }: Props = $props();
	const lines = $derived(content.split('\n'));
</script>

<div class="editor">
	<div class="editor__content">
		<div class="editor__lines">
			{#each lines as line, i}
				<div class="editor__line">
					<div class="editor__gutter">
						<span class="editor__line-number">{i + 1}</span>
					</div>
					<div class="editor__line-content">{line || '\u00A0'}</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.editor {
		position: relative;
		width: 100%;
		height: 100%;
		background: #0d1421;
		font-family: monospace;
		font-size: 14px;
	}

	.editor__content {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: auto;
		cursor: default;
	}

	.editor__lines {
		position: relative;
		min-height: 100%;
	}

	.editor__line {
		display: flex;
		line-height: 20px;
		cursor: default;
	}

	.editor__gutter {
		width: 50px;
		background: #1a2744;
		text-align: right;
		padding-right: 8px;
		user-select: none;
		cursor: default;
	}

	.editor__line-number {
		color: #666;
		cursor: default;
	}

	.editor__line-content {
		flex: 1;
		padding-left: 8px;
		color: #e8e8f0;
		cursor: text;
	}
</style>
