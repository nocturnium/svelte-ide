<script lang="ts">
	/**
	 * LockOverlay Component
	 *
	 * Displays a read-only overlay when a file is locked by another user/agent.
	 * Shows lock holder info, time remaining, and options to request access.
	 */

	import type { VFSFileLock } from '$lib/types';

	interface Props {
		lock: VFSFileLock;
		onRequestAccess?: () => void;
		onOpenReadOnly?: () => void;
		onClose?: () => void;
		showActions?: boolean;
	}

	let { lock, onRequestAccess, onOpenReadOnly, onClose, showActions = true }: Props = $props();

	// Calculate time remaining
	let timeRemaining = $derived.by(() => {
		const expires = new Date(lock.expiresAt).getTime();
		const now = Date.now();
		const remaining = Math.max(0, expires - now);

		if (remaining === 0) return 'Expired';

		const minutes = Math.floor(remaining / 60000);
		const seconds = Math.floor((remaining % 60000) / 1000);

		if (minutes > 0) {
			return `${minutes}m ${seconds}s remaining`;
		}
		return `${seconds}s remaining`;
	});

	// Lock holder display name
	let holderDisplay = $derived(lock.holderType === 'agent' ? `AI: ${lock.holder}` : lock.holder);

	// Lock purpose display
	let purposeDisplay = $derived.by(() => {
		switch (lock.purpose) {
			case 'edit':
				return 'Editing';
			case 'refactor':
				return 'Refactoring';
			case 'delete':
				return 'Deleting';
			case 'rename':
				return 'Renaming';
			default:
				return 'Modifying';
		}
	});
</script>

<div class="lock-overlay">
	<div class="lock-content">
		<div class="lock-icon">
			{#if lock.holderType === 'agent'}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="32"
					height="32"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					<circle cx="12" cy="16" r="1" />
				</svg>
				<span class="ai-sparkle">✦</span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="32"
					height="32"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
			{/if}
		</div>

		<div class="lock-info">
			<h3 class="lock-title">File Locked</h3>
			<p class="lock-holder">
				<span class="label">Locked by:</span>
				<span class="value">{holderDisplay}</span>
			</p>
			<p class="lock-purpose">
				<span class="label">Purpose:</span>
				<span class="value">{purposeDisplay}</span>
			</p>
			<p class="lock-time">
				<span class="label">Time:</span>
				<span class="value time-remaining">{timeRemaining}</span>
			</p>
		</div>

		{#if showActions}
			<div class="lock-actions">
				{#if onRequestAccess}
					<button class="action-btn request" onclick={onRequestAccess}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M15 3h6v6" />
							<path d="M10 14 21 3" />
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						</svg>
						Request Access
					</button>
				{/if}
				{#if onOpenReadOnly}
					<button class="action-btn readonly" onclick={onOpenReadOnly}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						Open Read-Only
					</button>
				{/if}
				{#if onClose}
					<button class="action-btn close" onclick={onClose}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M18 6 6 18" />
							<path d="m6 6 12 12" />
						</svg>
						Close
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="overlay-message">
		<span class="readonly-badge">READ-ONLY</span>
		<span class="message-text">This file is currently being edited by another user</span>
	</div>
</div>

<style>
	.lock-overlay {
		position: absolute;
		inset: 0;
		background: var(--ide-bg-overlay, rgba(0, 0, 0, 0.75));
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 100;
		backdrop-filter: blur(2px);
	}

	.lock-content {
		background: var(--ide-bg-secondary, #1e1e1e);
		border: 1px solid var(--ide-border, #3c3c3c);
		border-radius: 8px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		max-width: 320px;
		text-align: center;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.lock-icon {
		position: relative;
		color: var(--ide-lock-other, #e5c07b);
	}

	.ai-sparkle {
		position: absolute;
		top: -4px;
		right: -8px;
		font-size: 14px;
		color: var(--ide-agent-ai, #d19a66);
		animation: sparkle 2s ease-in-out infinite;
	}

	@keyframes sparkle {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.6;
			transform: scale(1.2);
		}
	}

	.lock-info {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.lock-title {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--ide-text-primary, #e0e0e0);
	}

	.lock-holder,
	.lock-purpose,
	.lock-time {
		margin: 0;
		font-size: 13px;
		color: var(--ide-text-secondary, #a0a0a0);
	}

	.label {
		color: var(--ide-text-muted, #808080);
	}

	.value {
		color: var(--ide-text-primary, #e0e0e0);
		margin-left: 4px;
	}

	.time-remaining {
		color: var(--ide-lock-other, #e5c07b);
		font-family: var(--ide-font-mono, monospace);
	}

	.lock-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: none;
		border-radius: 4px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn.request {
		background: var(--ide-accent, #569cd6);
		color: white;
	}

	.action-btn.request:hover {
		background: var(--ide-accent-hover, #4a8bc4);
	}

	.action-btn.readonly {
		background: var(--ide-bg-tertiary, #2d2d2d);
		color: var(--ide-text-primary, #e0e0e0);
		border: 1px solid var(--ide-border, #3c3c3c);
	}

	.action-btn.readonly:hover {
		background: var(--ide-bg-hover, #3c3c3c);
	}

	.action-btn.close {
		background: transparent;
		color: var(--ide-text-muted, #808080);
	}

	.action-btn.close:hover {
		color: var(--ide-text-primary, #e0e0e0);
	}

	.overlay-message {
		position: absolute;
		bottom: 24px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		background: var(--ide-bg-secondary, #1e1e1e);
		border: 1px solid var(--ide-border, #3c3c3c);
		border-radius: 4px;
	}

	.readonly-badge {
		padding: 2px 6px;
		background: var(--ide-lock-other, #e5c07b);
		color: var(--ide-bg-primary, #1e1e1e);
		font-size: 10px;
		font-weight: 700;
		border-radius: 2px;
		letter-spacing: 0.5px;
	}

	.message-text {
		font-size: 12px;
		color: var(--ide-text-secondary, #a0a0a0);
	}
</style>
