<script lang="ts">
	/**
	 * AgentPresenceBar - Compact bar showing active agents
	 *
	 * Displays in the activity bar or header area, showing:
	 * - Stacked avatars of online agents
	 * - Expandable to show full list
	 * - Quick status overview
	 */

	import { Icon, Tooltip } from '$lib/components/core';
	import AgentAvatar from './AgentAvatar.svelte';
	import type { Agent } from '$lib/types';

	interface Props {
		/** List of agents */
		agents: Agent[];
		/** Maximum avatars to show before collapsing */
		maxVisible?: number;
		/** Orientation */
		orientation?: 'horizontal' | 'vertical';
		/** Show expand button */
		expandable?: boolean;
		/** Called when expand is clicked */
		onExpand?: () => void;
		/** Called when agent is clicked */
		onAgentClick?: (agent: Agent) => void;
		/** Additional CSS class */
		class?: string;
	}

	let {
		agents,
		maxVisible = 5,
		orientation = 'horizontal',
		expandable = true,
		onExpand,
		onAgentClick,
		class: className = ''
	}: Props = $props();

	// Filter to online/busy agents
	let activeAgents = $derived(agents.filter((a) => a.status === 'online' || a.status === 'busy'));
	let visibleAgents = $derived(activeAgents.slice(0, maxVisible));
	let overflowCount = $derived(Math.max(0, activeAgents.length - maxVisible));

	// Group by status for summary
	let busyCount = $derived(agents.filter((a) => a.status === 'busy').length);
	let stalledCount = $derived(agents.filter((a) => a.status === 'stalled').length);
</script>

<div
	class="presence-bar presence-bar--{orientation} {className}"
	role="group"
	aria-label="Active agents"
>
	{#if activeAgents.length > 0}
		<div class="presence-bar__avatars">
			{#each visibleAgents as agent, i (agent.id)}
				<Tooltip content="{agent.name} ({agent.status})" position={orientation === 'vertical' ? 'right' : 'bottom'}>
					<button
						class="presence-bar__avatar"
						style="--index: {i}; --total: {visibleAgents.length}"
						onclick={() => onAgentClick?.(agent)}
					>
						<AgentAvatar {agent} size="sm" showBadge={false} showProgress={false} />
					</button>
				</Tooltip>
			{/each}

			{#if overflowCount > 0}
				<Tooltip content="{overflowCount} more agents">
					<button class="presence-bar__overflow" onclick={onExpand}>
						+{overflowCount}
					</button>
				</Tooltip>
			{/if}
		</div>

		<div class="presence-bar__summary">
			{#if busyCount > 0}
				<Tooltip content="{busyCount} agent{busyCount > 1 ? 's' : ''} working">
					<span class="presence-bar__stat presence-bar__stat--busy">
						<span class="presence-bar__dot presence-bar__dot--busy"></span>
						{busyCount}
					</span>
				</Tooltip>
			{/if}
			{#if stalledCount > 0}
				<Tooltip content="{stalledCount} agent{stalledCount > 1 ? 's' : ''} stalled">
					<span class="presence-bar__stat presence-bar__stat--stalled">
						<span class="presence-bar__dot presence-bar__dot--stalled"></span>
						{stalledCount}
					</span>
				</Tooltip>
			{/if}
		</div>
	{:else}
		<div class="presence-bar__empty">
			<Icon name="users" size={14} />
			<span>No agents</span>
		</div>
	{/if}

	{#if expandable && activeAgents.length > 0}
		<Tooltip content="View all agents">
			<button class="presence-bar__expand" onclick={onExpand}>
				<Icon name={orientation === 'vertical' ? 'chevron-right' : 'chevron-down'} size={12} />
			</button>
		</Tooltip>
	{/if}
</div>

<style>
	.presence-bar {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-xs);
	}

	.presence-bar--vertical {
		flex-direction: column;
		padding: var(--ide-spacing-sm) var(--ide-spacing-xs);
	}

	.presence-bar__avatars {
		display: flex;
		align-items: center;
	}

	.presence-bar--horizontal .presence-bar__avatars {
		flex-direction: row;
	}

	.presence-bar--vertical .presence-bar__avatars {
		flex-direction: column;
	}

	.presence-bar__avatar {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		padding: 0;
		cursor: pointer;
		transition: transform var(--ide-transition-fast), z-index var(--ide-transition-fast);
	}

	/* Stacked effect for horizontal - overlap avatars */
	.presence-bar--horizontal .presence-bar__avatar:not(:first-child) {
		margin-left: -8px;
	}

	.presence-bar--horizontal .presence-bar__avatar:hover {
		transform: translateY(-2px);
		z-index: 100;
	}

	/* Stacked effect for vertical - overlap avatars */
	.presence-bar--vertical .presence-bar__avatar:not(:first-child) {
		margin-top: -6px;
	}

	.presence-bar--vertical .presence-bar__avatar:hover {
		transform: translateX(2px);
		z-index: 100;
	}

	.presence-bar__overflow {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		font-size: 10px;
		font-weight: 600;
		color: var(--ide-text-secondary);
		background: var(--ide-bg-tertiary);
		border: 2px solid var(--ide-bg-secondary);
		border-radius: 50%;
		cursor: pointer;
		transition: all var(--ide-transition-fast);
	}

	.presence-bar--horizontal .presence-bar__overflow {
		margin-left: -8px;
	}

	.presence-bar--vertical .presence-bar__overflow {
		margin-top: -6px;
	}

	.presence-bar__overflow:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.presence-bar__summary {
		display: flex;
		gap: var(--ide-spacing-xs);
	}

	.presence-bar--vertical .presence-bar__summary {
		flex-direction: column;
	}

	.presence-bar__stat {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		color: var(--ide-text-muted);
	}

	.presence-bar__dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.presence-bar__dot--busy {
		background: var(--ide-agent-busy);
		animation: ide-pulse 2s infinite;
	}

	.presence-bar__dot--stalled {
		background: var(--ide-agent-stalled);
		animation: ide-lock-warning 1s infinite;
	}

	.presence-bar__empty {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}

	.presence-bar__expand {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: transparent;
		border: none;
		border-radius: var(--ide-radius-sm);
		color: var(--ide-text-muted);
		cursor: pointer;
		transition: all var(--ide-transition-fast);
	}

	.presence-bar__expand:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}
</style>
