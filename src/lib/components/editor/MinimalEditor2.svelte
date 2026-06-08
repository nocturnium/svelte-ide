<script lang="ts">
	// Minimal editor with CSS variables like CustomEditor
	interface Props {
		content: string;
	}

	let { content }: Props = $props();
	const lines = $derived(content.split('\n'));
</script>

<div class="custom-editor">
	<div class="custom-editor__content">
		<div class="custom-editor__lines">
			{#each lines as line, i (i)}
				<div class="custom-editor__line">
					<div class="custom-editor__gutter">
						<span class="custom-editor__line-number">{i + 1}</span>
					</div>
					<div class="custom-editor__line-content">{line || '\u00A0'}</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.custom-editor {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--ide-bg-primary);
		font-family: var(--ide-font-mono);
		font-size: 14px;
	}

	.custom-editor__content {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: auto;
		cursor: default;
	}

	.custom-editor__lines {
		position: relative;
		min-height: 100%;
		z-index: 2;
	}

	.custom-editor__line {
		display: flex;
		line-height: 20px;
		min-height: 20px;
		cursor: default;
	}

	.custom-editor__gutter {
		position: sticky;
		left: 0;
		width: 50px;
		min-width: 50px;
		background: var(--ide-bg-secondary);
		border-right: 1px solid var(--ide-border);
		text-align: right;
		padding-right: 8px;
		user-select: none;
		cursor: default;
		z-index: 3;
	}

	.custom-editor__line-number {
		color: var(--ide-text-muted);
		cursor: default;
	}

	.custom-editor__line-content {
		flex: 1;
		white-space: pre;
		padding-left: 8px;
		color: var(--ide-text-primary);
		cursor: text;
	}
</style>
