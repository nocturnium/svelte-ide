<script lang="ts">
	/**
	 * LockIndicator - Badge showing lock status on files
	 *
	 * Visual states:
	 * - Unlocked: No indicator shown
	 * - Owned by you: Green lock (filled)
	 * - Owned by other: Yellow lock (outline)
	 * - AI owns: Ember lock with sparkle
	 * - Acquiring: Blue lock with spinner
	 * - Conflict: Red lock with exclamation
	 */

	import type { VFSFileLock, VFSLockStatus } from '$lib/types';
	import { Tooltip, Icon } from '$lib/components/core';

	interface Props {
		/** Current lock status */
		status: VFSLockStatus;
		/** Whether current user owns the lock */
		isOwned?: boolean;
		/** Whether lock is held by an AI agent */
		isAI?: boolean;
		/** Size of the indicator */
		size?: 'xs' | 'sm' | 'md';
		/** Show tooltip with details */
		showTooltip?: boolean;
		/** Additional CSS class */
		class?: string;
	}

	let {
		status,
		isOwned = false,
		isAI = false,
		size = 'sm',
		showTooltip = true,
		class: className = ''
	}: Props = $props();

	const sizeMap = {
		xs: 12,
		sm: 14,
		md: 16
	};

	let iconSize = $derived(sizeMap[size]);

	function getStatusClass(): string {
		if (status.status === 'unlocked') return '';
		if (status.status === 'acquiring') return 'lock-indicator--pending';
		if (status.status === 'failed') return 'lock-indicator--conflict';

		// Locked status
		if (isOwned) return 'lock-indicator--owned';
		if (isAI) return 'lock-indicator--ai';
		return 'lock-indicator--other';
	}

	function getTooltipText(): string {
		if (status.status === 'unlocked') return 'Unlocked';
		if (status.status === 'acquiring') return 'Acquiring lock...';
		if (status.status === 'failed') return `Lock failed: ${status.error}`;

		const lock = status.lock;
		const timeRemaining = getTimeRemaining(lock);

		if (isOwned) return `Locked by you (${timeRemaining} remaining)`;
		if (isAI) return `AI Agent editing (${timeRemaining} remaining)`;
		return `Locked by ${lock.holderName ?? lock.holder} (${timeRemaining} remaining)`;
	}

	function getTimeRemaining(lock: VFSFileLock): string {
		const expiresAt = new Date(lock.expiresAt).getTime();
		const now = Date.now();
		const remaining = Math.max(0, expiresAt - now);

		const minutes = Math.floor(remaining / 60000);
		const seconds = Math.floor((remaining % 60000) / 1000);

		if (minutes > 0) return `${minutes}:${seconds.toString().padStart(2, '0')}`;
		return `${seconds}s`;
	}

</script>

{#if status.status !== 'unlocked'}
	{#if showTooltip}
		<Tooltip content={getTooltipText()} position="top">
			<div class="lock-indicator {getStatusClass()} {className}">
				{#if status.status === 'acquiring'}
					<Icon name="loader" size={iconSize} class="lock-indicator__spinner" />
				{:else if status.status === 'failed'}
					<Icon name="alert-circle" size={iconSize} />
				{:else if isAI}
					<svg
						class="lock-indicator__icon"
						viewBox="0 0 16 16"
						fill="currentColor"
						width={iconSize}
						height={iconSize}
					>
						<path
							d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2m3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2"
						/>
					</svg>
					<span class="lock-indicator__sparkle">*</span>
				{:else}
					<svg
						class="lock-indicator__icon"
						viewBox="0 0 16 16"
						fill={isOwned ? 'currentColor' : 'none'}
						stroke="currentColor"
						stroke-width={isOwned ? 0 : 1.5}
						width={iconSize}
						height={iconSize}
					>
						{#if isOwned}
							<path
								d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2m3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2"
							/>
						{:else}
							<rect x="3" y="7" width="10" height="8" rx="1" />
							<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
						{/if}
					</svg>
				{/if}
			</div>
		</Tooltip>
	{:else}
		<div class="lock-indicator {getStatusClass()} {className}">
			{#if status.status === 'acquiring'}
				<Icon name="loader" size={iconSize} class="lock-indicator__spinner" />
			{:else if status.status === 'failed'}
				<Icon name="alert-circle" size={iconSize} />
			{:else}
				<Icon name="lock" size={iconSize} />
			{/if}
		</div>
	{/if}
{/if}

<style>
	.lock-indicator {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.lock-indicator--owned {
		color: var(--ide-lock-owned);
	}

	.lock-indicator--other {
		color: var(--ide-lock-other);
	}

	.lock-indicator--ai {
		color: var(--ide-agent-ai-primary);
	}

	.lock-indicator--pending {
		color: var(--ide-lock-pending);
	}

	.lock-indicator--conflict {
		color: var(--ide-lock-conflict);
		animation: ide-conflict-flash 0.5s infinite;
	}

	.lock-indicator__icon {
		display: block;
	}

	.lock-indicator__sparkle {
		position: absolute;
		top: -4px;
		right: -4px;
		font-size: 10px;
		color: var(--color-nocturnium-flame);
		animation: ide-pulse 1s infinite;
	}

	:global(.lock-indicator__spinner) {
		animation: ide-spin 1s linear infinite;
	}
</style>
