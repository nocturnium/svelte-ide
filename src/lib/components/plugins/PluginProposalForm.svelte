<script lang="ts">
	import { Button, Icon, Input, Textarea } from '$components/core';
	import { createProposal, submitProposal } from '$stores/plugin.svelte';
	import type { PluginCategory } from '$types';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let name = $state('');
	let description = $state('');
	let category = $state<PluginCategory>('utility');
	let tags = $state('');
	let author = $state('');
	let isSubmitting = $state(false);
	let error = $state('');

	const categories: { value: PluginCategory; label: string }[] = [
		{ value: 'file_ops', label: 'File Operations' },
		{ value: 'http', label: 'HTTP/API' },
		{ value: 'analysis', label: 'Analysis' },
		{ value: 'transform', label: 'Transform' },
		{ value: 'validation', label: 'Validation' },
		{ value: 'utility', label: 'Utility' },
		{ value: 'integration', label: 'Integration' },
		{ value: 'ui', label: 'UI Component' },
		{ value: 'editor', label: 'Editor Extension' },
		{ value: 'ai', label: 'AI Enhancement' }
	];

	async function handleSubmit() {
		if (!name.trim() || !description.trim() || !author.trim()) {
			error = 'Please fill in all required fields';
			return;
		}

		isSubmitting = true;
		error = '';

		try {
			const proposalId = await createProposal({
				name: name.trim(),
				description: description.trim(),
				category,
				tags: tags
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean),
				author: author.trim(),
				parameters: { type: 'object', properties: {} },
				implementation: {
					type: 'module',
					moduleCode: '',
					permissions: []
				},
				testCases: []
			});

			if (proposalId) {
				onClose();
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create proposal';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
<div class="plugin-form-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation">
	<div
		class="plugin-form"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		tabindex={-1}
	>
		<div class="plugin-form__header">
			<h2>Create Plugin Proposal</h2>
			<Button variant="ghost" size="xs" onclick={onClose}>
				<Icon name="close" size={16} />
			</Button>
		</div>

		<form class="plugin-form__content" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
			{#if error}
				<div class="plugin-form__error">
					<Icon name="error" size={14} />
					{error}
				</div>
			{/if}

			<div class="plugin-form__field">
				<label for="name">Name *</label>
				<Input
					id="name"
					bind:value={name}
					placeholder="my-awesome-plugin"
					fullWidth
				/>
			</div>

			<div class="plugin-form__field">
				<label for="description">Description *</label>
				<Textarea
					id="description"
					bind:value={description}
					placeholder="What does this plugin do?"
					rows={3}
					fullWidth
				/>
			</div>

			<div class="plugin-form__field">
				<label for="category">Category</label>
				<select
					id="category"
					class="plugin-form__select"
					bind:value={category}
				>
					{#each categories as cat}
						<option value={cat.value}>{cat.label}</option>
					{/each}
				</select>
			</div>

			<div class="plugin-form__field">
				<label for="tags">Tags</label>
				<Input
					id="tags"
					bind:value={tags}
					placeholder="comma, separated, tags"
					fullWidth
				/>
			</div>

			<div class="plugin-form__field">
				<label for="author">Author *</label>
				<Input
					id="author"
					bind:value={author}
					placeholder="your@email.com"
					fullWidth
				/>
			</div>

			<div class="plugin-form__actions">
				<Button variant="ghost" onclick={onClose} disabled={isSubmitting}>
					Cancel
				</Button>
				<Button variant="primary" type="submit" loading={isSubmitting}>
					Create Proposal
				</Button>
			</div>
		</form>
	</div>
</div>

<style>
	.plugin-form-overlay {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		z-index: var(--ide-z-modal);
		animation: ide-fade-in var(--ide-transition-fast);
	}

	.plugin-form {
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		background: var(--ide-bg-elevated);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-lg);
		box-shadow: var(--ide-shadow-xl);
		overflow: hidden;
		animation: ide-slide-up var(--ide-transition-normal);
	}

	.plugin-form__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
	}

	.plugin-form__header h2 {
		margin: 0;
		font-size: var(--ide-font-size-lg);
		font-weight: 600;
		color: var(--ide-text-primary);
	}

	.plugin-form__content {
		padding: var(--ide-spacing-md);
		overflow-y: auto;
	}

	.plugin-form__error {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		margin-bottom: var(--ide-spacing-md);
		background: color-mix(in srgb, var(--ide-error) 15%, transparent);
		color: var(--ide-error);
		font-size: var(--ide-font-size-sm);
		border-radius: var(--ide-radius-md);
	}

	.plugin-form__field {
		margin-bottom: var(--ide-spacing-md);
	}

	.plugin-form__field label {
		display: block;
		margin-bottom: var(--ide-spacing-xs);
		font-size: var(--ide-font-size-sm);
		font-weight: 500;
		color: var(--ide-text-secondary);
	}

	.plugin-form__select {
		width: 100%;
		height: 2.25rem;
		padding: 0 var(--ide-spacing-md);
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-sm);
		background: var(--ide-bg-secondary);
		color: var(--ide-text-primary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
	}

	.plugin-form__actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--ide-spacing-sm);
		padding-top: var(--ide-spacing-md);
		border-top: 1px solid var(--ide-border);
	}
</style>
