<script lang="ts">
	/**
	 * AgentActivityPanel - Shows agents and their activities
	 *
	 * Features:
	 * - Grid/list view toggle for agents
	 * - Real-time activity feed
	 * - Agent filtering by status
	 * - Click to select and view agent details
	 */

	import { Icon, Button, Badge } from '$lib/components/core';
	import AgentAvatar from './AgentAvatar.svelte';
	import type { Agent, AgentActivity, AgentFilter, AgentViewMode } from '$lib/types';

	interface Props {
		/** List of agents to display */
		agents: Agent[];
		/** Activity feed items */
		activities: AgentActivity[];
		/** Currently selected agent ID */
		selectedAgentId?: string | null;
		/** Current filter */
		filter?: AgentFilter;
		/** View mode */
		viewMode?: AgentViewMode;
		/** Called when agent is selected */
		onSelectAgent?: (agentId: string | null) => void;
		/** Called when filter changes */
		onFilterChange?: (filter: AgentFilter) => void;
		/** Called when view mode changes */
		onViewModeChange?: (mode: AgentViewMode) => void;
		/** Additional CSS class */
		class?: string;
	}

	let {
		agents,
		activities,
		selectedAgentId = null,
		filter = 'all',
		viewMode = 'grid',
		onSelectAgent,
		onFilterChange,
		onViewModeChange,
		class: className = ''
	}: Props = $props();

	// Derived values
	let filteredAgents = $derived(
		filter === 'all' ? agents : agents.filter((a) => a.status === filter)
	);

	let selectedAgent = $derived(agents.find((a) => a.id === selectedAgentId));

	let selectedAgentActivities = $derived(
		selectedAgentId ? activities.filter((a) => a.agentId === selectedAgentId) : activities
	);

	let onlineCount = $derived(agents.filter((a) => a.status === 'online' || a.status === 'busy').length);
	let busyCount = $derived(agents.filter((a) => a.status === 'busy').length);

	function formatTime(timestamp: string): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();

		if (diff < 60000) return 'just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
		return date.toLocaleDateString();
	}

	function getActivityIcon(type: AgentActivity['type']): string {
		switch (type) {
			case 'action':
				return 'play';
			case 'message':
				return 'message-circle';
			case 'error':
				return 'alert-circle';
			case 'milestone':
				return 'flag';
			case 'system':
				return 'info';
			default:
				return 'activity';
		}
	}

	function getActivityColor(type: AgentActivity['type']): string {
		switch (type) {
			case 'error':
				return 'var(--ide-error)';
			case 'milestone':
				return 'var(--ide-success)';
			case 'system':
				return 'var(--ide-info)';
			default:
				return 'var(--ide-text-secondary)';
		}
	}
</script>

<div class="agent-panel {className}">
	<!-- Header -->
	<div class="agent-panel__header">
		<div class="agent-panel__title">
			<Icon name="users" size={16} />
			<span>Agents</span>
			<Badge variant="secondary" size="sm">{onlineCount}/{agents.length}</Badge>
		</div>
		<div class="agent-panel__actions">
			<Button
				variant="ghost"
				size="xs"
				onclick={() => onViewModeChange?.(viewMode === 'grid' ? 'list' : 'grid')}
				title={viewMode === 'grid' ? 'List view' : 'Grid view'}
			>
				<Icon name={viewMode === 'grid' ? 'list' : 'grid'} size={14} />
			</Button>
		</div>
	</div>

	<!-- Filter tabs -->
	<div class="agent-panel__filters" role="tablist">
		<button
			class="agent-panel__filter"
			class:agent-panel__filter--active={filter === 'all'}
			onclick={() => onFilterChange?.('all')}
			role="tab"
			aria-selected={filter === 'all'}
		>
			All ({agents.length})
		</button>
		<button
			class="agent-panel__filter"
			class:agent-panel__filter--active={filter === 'online'}
			onclick={() => onFilterChange?.('online')}
			role="tab"
			aria-selected={filter === 'online'}
		>
			Online ({onlineCount})
		</button>
		<button
			class="agent-panel__filter"
			class:agent-panel__filter--active={filter === 'busy'}
			onclick={() => onFilterChange?.('busy')}
			role="tab"
			aria-selected={filter === 'busy'}
		>
			Busy ({busyCount})
		</button>
	</div>

	<!-- Agent grid/list -->
	<div class="agent-panel__agents agent-panel__agents--{viewMode}">
		{#each filteredAgents as agent (agent.id)}
			<button
				class="agent-card"
				class:agent-card--selected={selectedAgentId === agent.id}
				class:agent-card--compact={viewMode === 'list'}
				onclick={() => onSelectAgent?.(selectedAgentId === agent.id ? null : agent.id)}
			>
				<AgentAvatar {agent} size={viewMode === 'grid' ? 'md' : 'sm'} />
				<div class="agent-card__info">
					<span class="agent-card__name">{agent.name}</span>
					{#if agent.currentTask}
						<span class="agent-card__task">{agent.currentTask.description}</span>
						{#if viewMode === 'grid'}
							<div class="agent-card__progress">
								<div
									class="agent-card__progress-bar"
									style="width: {agent.currentTask.progress.percentage}%"
								></div>
							</div>
						{/if}
					{:else}
						<span class="agent-card__status">{agent.status}</span>
					{/if}
				</div>
				{#if agent.currentTask && viewMode === 'list'}
					<span class="agent-card__percent">{agent.currentTask.progress.percentage}%</span>
				{/if}
			</button>
		{/each}

		{#if filteredAgents.length === 0}
			<div class="agent-panel__empty">
				<Icon name="users" size={24} />
				<span>No agents {filter !== 'all' ? filter : ''}</span>
			</div>
		{/if}
	</div>

	<!-- Selected agent details -->
	{#if selectedAgent}
		<div class="agent-panel__details">
			<div class="agent-panel__details-header">
				<AgentAvatar agent={selectedAgent} size="lg" />
				<div class="agent-panel__details-info">
					<h3>{selectedAgent.name}</h3>
					<span class="agent-panel__details-type">{selectedAgent.type}</span>
				</div>
				<Button variant="ghost" size="xs" onclick={() => onSelectAgent?.(null)}>
					<Icon name="x" size={14} />
				</Button>
			</div>

			{#if selectedAgent.currentTask}
				<div class="agent-panel__task">
					<div class="agent-panel__task-header">
						<Icon name="play" size={12} />
						<span>{selectedAgent.currentTask.description}</span>
					</div>
					<div class="agent-panel__task-progress">
						<div
							class="agent-panel__task-bar"
							style="width: {selectedAgent.currentTask.progress.percentage}%"
						></div>
					</div>
					<div class="agent-panel__task-stats">
						<span>{selectedAgent.currentTask.progress.phase}</span>
						<span>{selectedAgent.currentTask.progress.filesModified} files</span>
						<span>{selectedAgent.currentTask.progress.toolCalls} calls</span>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Activity feed -->
	<div class="agent-panel__feed">
		<div class="agent-panel__feed-header">
			<Icon name="activity" size={14} />
			<span>{selectedAgent ? `${selectedAgent.name}'s Activity` : 'All Activity'}</span>
		</div>
		<div class="agent-panel__feed-list">
			{#each selectedAgentActivities.slice(0, 50) as activity (activity.id)}
				<div class="activity-item" class:activity-item--error={activity.type === 'error'}>
					<div class="activity-item__icon" style="color: {getActivityColor(activity.type)}">
						<Icon name={getActivityIcon(activity.type)} size={12} />
					</div>
					<div class="activity-item__content">
						<span class="activity-item__agent">{activity.agent.name}</span>
						<span class="activity-item__text">{activity.content}</span>
					</div>
					<span class="activity-item__time">{formatTime(activity.timestamp)}</span>
				</div>
			{/each}

			{#if selectedAgentActivities.length === 0}
				<div class="agent-panel__empty">
					<Icon name="inbox" size={20} />
					<span>No activity yet</span>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.agent-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--ide-bg-secondary);
		overflow: hidden;
	}

	.agent-panel__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
	}

	.agent-panel__title {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
		color: var(--ide-text-primary);
	}

	.agent-panel__actions {
		display: flex;
		gap: var(--ide-spacing-xs);
	}

	.agent-panel__filters {
		display: flex;
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		gap: var(--ide-spacing-xs);
		border-bottom: 1px solid var(--ide-border);
	}

	.agent-panel__filter {
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		background: transparent;
		border: none;
		border-radius: var(--ide-radius-sm);
		cursor: pointer;
		transition: all var(--ide-transition-fast);
	}

	.agent-panel__filter:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.agent-panel__filter--active {
		background: var(--ide-bg-tertiary);
		color: var(--ide-text-primary);
	}

	.agent-panel__agents {
		padding: var(--ide-spacing-sm);
		overflow-y: auto;
	}

	.agent-panel__agents--grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: var(--ide-spacing-sm);
	}

	.agent-panel__agents--list {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-xs);
	}

	.agent-card {
		display: flex;
		align-items: flex-start;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm);
		background: var(--ide-bg-primary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		cursor: pointer;
		transition: all var(--ide-transition-fast);
		text-align: left;
	}

	.agent-card:hover {
		border-color: var(--ide-interactive);
	}

	.agent-card--selected {
		border-color: var(--ide-interactive);
		background: var(--ide-bg-tertiary);
	}

	.agent-card--compact {
		align-items: center;
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
	}

	.agent-card__info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.agent-card__name {
		font-size: var(--ide-font-size-sm);
		font-weight: 500;
		color: var(--ide-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.agent-card__task {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.agent-card__status {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
		text-transform: capitalize;
	}

	.agent-card__progress {
		height: 3px;
		background: var(--ide-progress-track);
		border-radius: 2px;
		margin-top: 4px;
		overflow: hidden;
	}

	.agent-card__progress-bar {
		height: 100%;
		background: var(--ide-progress-fill);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.agent-card__percent {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
		font-family: var(--ide-font-mono);
	}

	.agent-panel__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-xl);
		color: var(--ide-text-muted);
		font-size: var(--ide-font-size-sm);
	}

	.agent-panel__details {
		padding: var(--ide-spacing-sm);
		border-top: 1px solid var(--ide-border);
		background: var(--ide-bg-primary);
	}

	.agent-panel__details-header {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
	}

	.agent-panel__details-info {
		flex: 1;
	}

	.agent-panel__details-info h3 {
		margin: 0;
		font-size: var(--ide-font-size-sm);
		font-weight: 600;
	}

	.agent-panel__details-type {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
		text-transform: capitalize;
	}

	.agent-panel__task {
		margin-top: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm);
		background: var(--ide-bg-secondary);
		border-radius: var(--ide-radius-sm);
	}

	.agent-panel__task-header {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		margin-bottom: var(--ide-spacing-xs);
	}

	.agent-panel__task-progress {
		height: 4px;
		background: var(--ide-progress-track);
		border-radius: 2px;
		overflow: hidden;
	}

	.agent-panel__task-bar {
		height: 100%;
		background: linear-gradient(90deg, var(--ide-agent-ai-primary), var(--color-nocturnium-flame));
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.agent-panel__task-stats {
		display: flex;
		gap: var(--ide-spacing-md);
		margin-top: var(--ide-spacing-xs);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}

	.agent-panel__feed {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-top: 1px solid var(--ide-border);
	}

	.agent-panel__feed-header {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		padding: var(--ide-spacing-sm);
		font-size: var(--ide-font-size-xs);
		font-weight: 600;
		color: var(--ide-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.agent-panel__feed-list {
		flex: 1;
		overflow-y: auto;
		padding: 0 var(--ide-spacing-sm) var(--ide-spacing-sm);
	}

	.activity-item {
		display: flex;
		align-items: flex-start;
		gap: var(--ide-spacing-xs);
		padding: var(--ide-spacing-xs) 0;
		border-bottom: 1px solid var(--ide-border);
	}

	.activity-item:last-child {
		border-bottom: none;
	}

	.activity-item--error {
		background: color-mix(in srgb, var(--ide-error) 10%, transparent);
		margin: 0 calc(-1 * var(--ide-spacing-sm));
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		border-radius: var(--ide-radius-sm);
	}

	.activity-item__icon {
		flex-shrink: 0;
		padding-top: 2px;
	}

	.activity-item__content {
		flex: 1;
		min-width: 0;
		font-size: var(--ide-font-size-xs);
	}

	.activity-item__agent {
		font-weight: 500;
		color: var(--ide-text-primary);
	}

	.activity-item__text {
		color: var(--ide-text-secondary);
		margin-left: var(--ide-spacing-xs);
	}

	.activity-item__time {
		flex-shrink: 0;
		font-size: 10px;
		color: var(--ide-text-muted);
	}
</style>
