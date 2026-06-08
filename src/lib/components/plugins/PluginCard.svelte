<script lang="ts">
	import { Button, Icon, Badge } from '$components/core';
	import type { PluginStatus } from '$types';

	interface PluginInfo {
		id: string;
		name: string;
		description: string;
		version: string;
		author: string;
		status: PluginStatus;
	}

	interface Props {
		plugin: PluginInfo;
		installed?: boolean;
		showStatus?: boolean;
		onInstall?: () => void;
		onUninstall?: () => void;
	}

	let { plugin, installed = false, showStatus = false, onInstall, onUninstall }: Props = $props();

	function getStatusVariant(
		status: PluginStatus
	): 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' {
		switch (status) {
			case 'draft':
				return 'default';
			case 'submitted':
			case 'reviewing':
				return 'warning';
			case 'approved':
			case 'testing':
				return 'info';
			case 'deploying':
			case 'deployed':
				return 'success';
			case 'rejected':
			case 'rolled_back':
				return 'error';
			default:
				return 'default';
		}
	}
</script>

<div class="plugin-card">
	<div class="plugin-card__info">
		<div class="plugin-card__header">
			<span class="plugin-card__name">{plugin.name}</span>
			<span class="plugin-card__version">v{plugin.version}</span>
		</div>
		<p class="plugin-card__description">{plugin.description}</p>
		<div class="plugin-card__meta">
			<span class="plugin-card__author">
				<Icon name="user" size={10} />
				{plugin.author}
			</span>
			{#if showStatus}
				<Badge variant={getStatusVariant(plugin.status)} size="sm">
					{plugin.status}
				</Badge>
			{/if}
		</div>
	</div>
	<div class="plugin-card__actions">
		{#if installed}
			<Button variant="danger" size="xs" onclick={onUninstall}>Uninstall</Button>
		{:else if plugin.status === 'deployed'}
			<Button variant="primary" size="xs" onclick={onInstall}>Install</Button>
		{/if}
	</div>
</div>

<style>
	.plugin-card {
		display: flex;
		gap: var(--ide-spacing-md);
		padding: var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		transition: border-color var(--ide-transition-fast);
	}

	.plugin-card:hover {
		border-color: var(--ide-interactive);
	}

	.plugin-card__info {
		flex: 1;
		min-width: 0;
	}

	.plugin-card__header {
		display: flex;
		align-items: baseline;
		gap: var(--ide-spacing-sm);
		margin-bottom: var(--ide-spacing-xs);
	}

	.plugin-card__name {
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
		color: var(--ide-text-primary);
	}

	.plugin-card__version {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}

	.plugin-card__description {
		margin: 0 0 var(--ide-spacing-sm);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		line-height: var(--ide-line-height-normal);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.plugin-card__meta {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-md);
	}

	.plugin-card__author {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		font-size: 10px;
		color: var(--ide-text-muted);
	}

	.plugin-card__actions {
		display: flex;
		align-items: flex-start;
	}
</style>
