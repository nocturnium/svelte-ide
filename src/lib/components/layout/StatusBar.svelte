<script lang="ts">
	/**
	 * StatusBar - Contextual IDE status bar
	 *
	 * Design principle: Show CONTEXT, not just counts
	 * - "Claude (editing)" not "2 agents"
	 * - "Lock expires 2:34" not "1 lock"
	 * - Communicate state at a glance
	 */

	import { Icon, Tooltip, Spinner } from '$lib/components/core';
	import CognitiveLoadMeter from '$lib/components/editor/CognitiveLoadMeter.svelte';
	import type { ComplexityMetrics } from '$lib/components/editor/core/complexity-analyzer';
	import type { Agent, VFSFileLock } from '$lib/types';

	interface Props {
		/** Current git branch */
		branch?: string;
		/** List of agents */
		agents?: Agent[];
		/** List of active locks */
		locks?: VFSFileLock[];
		/** Current file path (to show relevant lock info) */
		currentFilePath?: string;
		/** Current user ID (to identify your locks) */
		userId?: string;
		/** Current cursor line */
		cursorLine?: number;
		/** Current cursor column */
		cursorColumn?: number;
		/** Current file language */
		language?: string;
		/** Current file encoding */
		encoding?: string;
		/** Current file line ending */
		lineEnding?: 'LF' | 'CRLF';
		/** Whether syncing with server */
		syncing?: boolean;
		/** Whether connected to server */
		connected?: boolean;
		/** Number of unsaved files */
		dirtyCount?: number;
		/** Current file complexity metrics */
		complexityMetrics?: ComplexityMetrics | null;
		/** Called when branch is clicked */
		onBranchClick?: () => void;
		/** Called when agents indicator is clicked */
		onAgentsClick?: () => void;
		/** Called when locks indicator is clicked */
		onLocksClick?: () => void;
		/** Called when language is clicked */
		onLanguageClick?: () => void;
		/** Called when complexity meter is clicked */
		onComplexityClick?: () => void;
		/** Additional CSS class */
		class?: string;
	}

	let {
		branch,
		agents = [],
		locks = [],
		currentFilePath,
		userId,
		cursorLine = 1,
		cursorColumn = 1,
		language = 'Plain Text',
		encoding = 'UTF-8',
		lineEnding = 'LF',
		syncing = false,
		connected = true,
		dirtyCount = 0,
		complexityMetrics = null,
		onBranchClick,
		onAgentsClick,
		onLocksClick,
		onLanguageClick,
		onComplexityClick,
		class: className = ''
	}: Props = $props();

	// Agent context
	let onlineAgents = $derived(agents.filter((a) => a.status === 'online' || a.status === 'busy'));
	let busyAgents = $derived(agents.filter((a) => a.status === 'busy'));
	let idleAgents = $derived(agents.filter((a) => a.status === 'online'));

	// Find the "featured" busy agent to highlight
	let featuredAgent = $derived.by(() => {
		// Prefer agent working on current file
		if (currentFilePath) {
			const agentOnFile = busyAgents.find(a =>
				a.currentTask?.files?.includes(currentFilePath)
			);
			if (agentOnFile) return agentOnFile;
		}
		// Otherwise show first busy agent
		return busyAgents[0];
	});

	// Agent activity description
	let agentActivityLabel = $derived.by(() => {
		if (!featuredAgent) {
			if (idleAgents.length === 0) return null;
			if (idleAgents.length === 1) return `${idleAgents[0].name} idle`;
			return `${idleAgents.length} agents idle`;
		}

		const phase = featuredAgent.currentTask?.progress?.phase;
		let action = 'working';
		switch (phase) {
			case 'planning': action = 'planning'; break;
			case 'implementing': action = 'coding'; break;
			case 'testing': action = 'testing'; break;
			case 'complete': action = 'done'; break;
		}

		const otherBusy = busyAgents.length - 1;
		const suffix = otherBusy > 0 ? ` +${otherBusy}` : '';
		return `${featuredAgent.name} (${action})${suffix}`;
	});

	// Lock context for current file
	let currentFileLock = $derived(
		currentFilePath ? locks.find(l => l.path === currentFilePath) : undefined
	);
	let isMyLock = $derived(
		currentFileLock && userId ? currentFileLock.holder === userId : false
	);
	let otherLocks = $derived(
		locks.filter(l => l.path !== currentFilePath)
	);

	// Lock expiry countdown
	let lockExpiryText = $state<string | null>(null);

	$effect(() => {
		if (!currentFileLock) {
			lockExpiryText = null;
			return;
		}

		const updateExpiry = () => {
			const expiresAt = new Date(currentFileLock!.expiresAt).getTime();
			const now = Date.now();
			const remaining = Math.max(0, expiresAt - now);

			if (remaining === 0) {
				lockExpiryText = 'expired';
				return;
			}

			const minutes = Math.floor(remaining / 60000);
			const seconds = Math.floor((remaining % 60000) / 1000);
			lockExpiryText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
		};

		updateExpiry();
		const interval = setInterval(updateExpiry, 1000);
		return () => clearInterval(interval);
	});

	// Lock status label
	let lockLabel = $derived.by(() => {
		if (currentFileLock) {
			if (isMyLock) {
				return `Locked by you (${lockExpiryText})`;
			}
			return `Locked by ${currentFileLock.holder}`;
		}
		if (otherLocks.length === 0) return null;
		if (otherLocks.length === 1) {
			return `1 file locked`;
		}
		return `${otherLocks.length} files locked`;
	});

	// Tooltip details
	let agentTooltip = $derived.by(() => {
		if (busyAgents.length === 0 && idleAgents.length === 0) {
			return 'No agents online';
		}
		const parts: string[] = [];
		if (busyAgents.length > 0) {
			parts.push(`${busyAgents.length} working`);
		}
		if (idleAgents.length > 0) {
			parts.push(`${idleAgents.length} idle`);
		}
		return parts.join(', ');
	});

	let lockTooltip = $derived.by(() => {
		if (currentFileLock) {
			if (isMyLock) {
				return `You hold the lock. Expires in ${lockExpiryText}.`;
			}
			return `${currentFileLock.holder} is editing this file.`;
		}
		if (locks.length === 0) return 'No files locked';
		const holders = [...new Set(locks.map(l => l.holder))];
		return `Locked by: ${holders.join(', ')}`;
	});
</script>

<footer class="status-bar {className}">
	<!-- Left section: Git + Sync -->
	<div class="status-bar__left">
		{#if branch}
			<Tooltip content="Current branch (click to switch)">
				<button class="status-bar__item status-bar__item--clickable" onclick={onBranchClick}>
					<Icon name="git-branch" size={12} />
					<span>{branch}</span>
				</button>
			</Tooltip>
		{/if}

		{#if syncing}
			<Tooltip content="Syncing changes...">
				<span class="status-bar__item status-bar__item--syncing">
					<Spinner size="xs" />
					<span>Syncing</span>
				</span>
			</Tooltip>
		{:else if dirtyCount > 0}
			<Tooltip content="{dirtyCount} unsaved file{dirtyCount > 1 ? 's' : ''}">
				<span class="status-bar__item status-bar__item--dirty">
					<Icon name="circle" size={8} />
					<span>{dirtyCount} unsaved</span>
				</span>
			</Tooltip>
		{/if}
	</div>

	<!-- Center section: Contextual Agent & Lock Info -->
	<div class="status-bar__center">
		<!-- Agent activity (contextual) -->
		{#if agentActivityLabel}
			<Tooltip content={agentTooltip}>
				<button
					class="status-bar__item status-bar__item--clickable status-bar__agent-activity"
					class:status-bar__agent-activity--busy={featuredAgent}
					onclick={onAgentsClick}
				>
					{#if featuredAgent}
						<!-- AI indicator for busy agent -->
						<span class="status-bar__ai-dot" aria-hidden="true"></span>
					{:else}
						<Icon name="users" size={12} />
					{/if}
					<span>{agentActivityLabel}</span>
				</button>
			</Tooltip>
		{/if}

		<!-- Lock status (contextual with countdown) -->
		{#if lockLabel}
			<Tooltip content={lockTooltip}>
				<button
					class="status-bar__item status-bar__item--clickable status-bar__lock"
					class:status-bar__lock--mine={isMyLock}
					class:status-bar__lock--other={currentFileLock && !isMyLock}
					onclick={onLocksClick}
				>
					<Icon name="lock" size={12} />
					<span>{lockLabel}</span>
					{#if isMyLock && lockExpiryText}
						<span
							class="status-bar__expiry"
							class:status-bar__expiry--warning={lockExpiryText && parseInt(lockExpiryText) < 2}
						>
							{lockExpiryText}
						</span>
					{/if}
				</button>
			</Tooltip>
		{/if}
	</div>

	<!-- Right section: Editor info -->
	<div class="status-bar__right">
		<!-- Cognitive complexity meter -->
		{#if complexityMetrics}
			<CognitiveLoadMeter
				metrics={complexityMetrics}
				showDetails={true}
				onclick={onComplexityClick}
			/>
			<span class="status-bar__separator"></span>
		{/if}

		<Tooltip content="Cursor position">
			<span class="status-bar__item">
				Ln {cursorLine}, Col {cursorColumn}
			</span>
		</Tooltip>

		<span class="status-bar__separator"></span>

		<Tooltip content="Line ending">
			<span class="status-bar__item">
				{lineEnding}
			</span>
		</Tooltip>

		<Tooltip content="File encoding">
			<span class="status-bar__item">
				{encoding}
			</span>
		</Tooltip>

		<Tooltip content="Language mode (click to change)">
			<button class="status-bar__item status-bar__item--clickable" onclick={onLanguageClick}>
				{language}
			</button>
		</Tooltip>

		<span class="status-bar__separator"></span>

		<Tooltip content={connected ? 'Connected to server' : 'Disconnected'}>
			<span
				class="status-bar__item status-bar__connection"
				class:status-bar__connection--connected={connected}
				class:status-bar__connection--disconnected={!connected}
			>
				{#if connected}
					<Icon name="wifi" size={12} />
				{:else}
					<Icon name="wifi-off" size={12} />
				{/if}
			</span>
		</Tooltip>
	</div>
</footer>

<style>
	.status-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--ide-status-bar-height, 24px);
		padding: 0 var(--ide-spacing-sm);
		background: var(--ide-bg-tertiary);
		border-top: 1px solid var(--ide-border);
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-secondary);
		user-select: none;
	}

	.status-bar__left,
	.status-bar__center,
	.status-bar__right {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
	}

	.status-bar__left {
		flex: 1;
		justify-content: flex-start;
	}

	.status-bar__center {
		flex: 0 0 auto;
		gap: var(--ide-spacing-md);
	}

	.status-bar__right {
		flex: 1;
		justify-content: flex-end;
	}

	.status-bar__item {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px var(--ide-spacing-xs);
		border-radius: var(--ide-radius-sm);
		transition: all var(--ide-transition-fast);
		min-height: 20px;
	}

	.status-bar__item--clickable {
		background: transparent;
		border: none;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.status-bar__item--clickable:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	/* Focus states for accessibility */
	.status-bar__item--clickable:focus-visible {
		outline: 2px solid var(--ide-focus-ring);
		outline-offset: 1px;
	}

	.status-bar__item--syncing {
		color: var(--ide-info);
	}

	.status-bar__item--dirty {
		color: var(--ide-warning);
	}

	.status-bar__item--dirty :global(.icon) {
		fill: currentColor;
	}

	/* AI Activity Indicator */
	.status-bar__agent-activity {
		font-weight: 500;
	}

	.status-bar__agent-activity--busy {
		color: var(--ide-agent-ai-primary, var(--ide-info));
	}

	.status-bar__ai-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: linear-gradient(
			135deg,
			var(--ide-agent-ai-primary) 0%,
			var(--color-nocturnium-flame) 50%,
			var(--ide-agent-ai-secondary) 100%
		);
		background-size: 200% 200%;
		animation: ai-dot-shimmer 2s ease-in-out infinite;
		box-shadow: 0 0 6px color-mix(in srgb, var(--ide-agent-ai-primary) 50%, transparent);
	}

	@keyframes ai-dot-shimmer {
		0%, 100% { background-position: 0% 50%; }
		50% { background-position: 100% 50%; }
	}

	/* Lock Status */
	.status-bar__lock {
		font-weight: 500;
	}

	.status-bar__lock--mine {
		color: var(--ide-lock-owned, var(--ide-success));
	}

	.status-bar__lock--other {
		color: var(--ide-lock-other, var(--ide-warning));
	}

	/* Lock Expiry Countdown */
	.status-bar__expiry {
		font-family: var(--ide-font-mono);
		font-size: 10px;
		padding: 1px 4px;
		border-radius: var(--ide-radius-sm);
		background: color-mix(in srgb, var(--ide-lock-owned) 20%, transparent);
		color: var(--ide-lock-owned);
	}

	.status-bar__expiry--warning {
		background: color-mix(in srgb, var(--ide-warning) 20%, transparent);
		color: var(--ide-warning);
		animation: expiry-pulse 1s ease-in-out infinite;
	}

	@keyframes expiry-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	.status-bar__separator {
		width: 1px;
		height: 12px;
		background: var(--ide-border);
	}

	.status-bar__connection {
		padding: 2px 4px;
	}

	.status-bar__connection--connected {
		color: var(--ide-success);
	}

	.status-bar__connection--disconnected {
		color: var(--ide-error);
		animation: ide-pulse 1s infinite;
	}

	/* Responsive: hide less important info on narrow screens */
	@media (max-width: 600px) {
		.status-bar__right > :nth-child(n+3):nth-child(-n+5) {
			display: none;
		}
	}

	@media (max-width: 400px) {
		.status-bar__left {
			display: none;
		}
		.status-bar__center {
			flex: 1;
			justify-content: flex-start;
		}
	}
</style>
