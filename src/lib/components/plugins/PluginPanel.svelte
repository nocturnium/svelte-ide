<script lang="ts">
	import { Button, Icon, Badge, Spinner } from '$components/core';
	import {
		getProposals,
		getDeployedProposals,
		getLoadingProposals,
		connect,
		disconnect,
		getConnected,
		fetchProposals,
		loadPlugin,
		unloadPlugin,
		getInstances,
		getError
	} from '$stores/plugin.svelte';
	import PluginCard from './PluginCard.svelte';
	import PluginProposalForm from './PluginProposalForm.svelte';

	interface Props {
		class?: string;
		/** Tab shown first when the panel mounts. Defaults to 'installed'. */
		initialTab?: 'installed' | 'available' | 'proposals';
	}

	let { class: className = '', initialTab = 'installed' }: Props = $props();

	let showCreateForm = $state(false);
	// initialTab is intentionally a one-time seed for the starting tab.
	// svelte-ignore state_referenced_locally
	let activeTab = $state<'installed' | 'available' | 'proposals'>(initialTab);

	$effect(() => {
		// Connect to event stream on mount
		connect();
		fetchProposals();

		return () => {
			disconnect();
		};
	});

	const installedPlugins = $derived(getInstances().filter((i) => i.status === 'active'));
	const availablePlugins = $derived(
		getDeployedProposals().filter((p) => !getInstances().some((i) => i.id === p.id))
	);
</script>

<div class="plugin-panel {className}">
	<div class="plugin-panel__header">
		<div class="plugin-panel__title">
			<Icon name="plugin" size={16} />
			<span>Extensions</span>
			{#if getConnected()}
				<Badge variant="success" size="sm" dot>Live</Badge>
			{/if}
		</div>
		<Button
			variant="ghost"
			size="xs"
			title="Demo only — the create-proposal flow is illustrative on this static host"
			aria-label="New plugin proposal (demo only)"
			onclick={() => (showCreateForm = true)}
		>
			{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
			New
		</Button>
	</div>

	<!-- Tabs -->
	<div class="plugin-panel__tabs">
		<button
			class="plugin-panel__tab"
			class:plugin-panel__tab--active={activeTab === 'installed'}
			onclick={() => (activeTab = 'installed')}
		>
			Installed
			{#if installedPlugins.length > 0}
				<Badge variant="primary" size="sm">{installedPlugins.length}</Badge>
			{/if}
		</button>
		<button
			class="plugin-panel__tab"
			class:plugin-panel__tab--active={activeTab === 'available'}
			onclick={() => (activeTab = 'available')}
		>
			Available
			{#if availablePlugins.length > 0}
				<Badge variant="default" size="sm">{availablePlugins.length}</Badge>
			{/if}
		</button>
		<button
			class="plugin-panel__tab"
			class:plugin-panel__tab--active={activeTab === 'proposals'}
			onclick={() => (activeTab = 'proposals')}
		>
			Proposals
			{#if getProposals().length > 0}
				<Badge variant="warning" size="sm">{getProposals().length}</Badge>
			{/if}
		</button>
	</div>

	<!-- Content -->
	<div class="plugin-panel__content">
		{#if getLoadingProposals()}
			<div class="plugin-panel__loading">
				<Spinner size="md" />
				<span>Loading plugins...</span>
			</div>
		{:else if getError()}
			<div class="plugin-panel__error">
				<Icon name="error" size={24} />
				<span>{getError()}</span>
				<Button variant="ghost" size="sm" onclick={fetchProposals}>Retry</Button>
			</div>
		{:else if activeTab === 'installed'}
			{#if installedPlugins.length === 0}
				<div class="plugin-panel__empty">
					<!-- Static container glyph, not the radial `plugin` spoke (which mirrors
					     the `loading` glyph and reads as a spinner over this empty copy). -->
					<Icon name="folder" size={32} />
					<p>No plugins installed</p>
					<Button variant="secondary" size="sm" onclick={() => (activeTab = 'available')}>
						Browse Available
					</Button>
				</div>
			{:else}
				<div class="plugin-panel__list">
					{#each installedPlugins as instance (instance.id)}
						<PluginCard
							plugin={{
								id: instance.id,
								name: instance.manifest.name,
								description: instance.manifest.description,
								version: instance.manifest.version,
								author: instance.manifest.author,
								status: 'deployed'
							}}
							installed
							onUninstall={() => unloadPlugin(instance.id)}
						/>
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'available'}
			{#if availablePlugins.length === 0}
				<div class="plugin-panel__empty">
					<Icon name="search" size={32} />
					<p>No plugins available</p>
				</div>
			{:else}
				<div class="plugin-panel__list">
					{#each availablePlugins as proposal (proposal.id)}
						<PluginCard
							plugin={{
								id: proposal.id,
								name: proposal.name,
								description: proposal.description,
								version: `${proposal.version}.0.0`,
								author: proposal.author,
								status: proposal.status
							}}
							onInstall={() => loadPlugin(proposal.id)}
						/>
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'proposals'}
			{#if getProposals().length === 0}
				<div class="plugin-panel__empty">
					<Icon name="file" size={32} />
					<p>No proposals yet</p>
					<Button
						variant="primary"
						size="sm"
						title="Demo only — the create-proposal flow is illustrative on this static host"
						aria-label="Create plugin proposal (demo only)"
						onclick={() => (showCreateForm = true)}
					>
						Create Plugin
					</Button>
				</div>
			{:else}
				<div class="plugin-panel__list">
					{#each getProposals() as proposal (proposal.id)}
						<PluginCard
							plugin={{
								id: proposal.id,
								name: proposal.name,
								description: proposal.description,
								version: `${proposal.version}.0.0`,
								author: proposal.author,
								status: proposal.status
							}}
							showStatus
						/>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Create Form Modal -->
	{#if showCreateForm}
		<PluginProposalForm onClose={() => (showCreateForm = false)} />
	{/if}
</div>

<style>
	.plugin-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--ide-bg-primary);
	}

	.plugin-panel__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
	}

	.plugin-panel__title {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
		color: var(--ide-text-primary);
	}

	.plugin-panel__tabs {
		display: flex;
		border-bottom: 1px solid var(--ide-border);
	}

	.plugin-panel__tab {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		flex: 1;
		padding: var(--ide-spacing-sm);
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-xs);
		font-weight: 500;
		color: var(--ide-text-secondary);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: all var(--ide-transition-fast);
	}

	.plugin-panel__tab:hover {
		color: var(--ide-text-primary);
		background: var(--ide-bg-hover);
	}

	.plugin-panel__tab--active {
		color: var(--ide-interactive);
		border-bottom-color: var(--ide-interactive);
	}

	.plugin-panel__content {
		flex: 1;
		overflow-y: auto;
	}

	.plugin-panel__loading,
	.plugin-panel__error,
	.plugin-panel__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--ide-spacing-md);
		height: 100%;
		text-align: center;
		color: var(--ide-text-muted);
	}

	.plugin-panel__error {
		color: var(--ide-error);
	}

	.plugin-panel__list {
		padding: var(--ide-spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-sm);
	}
</style>
