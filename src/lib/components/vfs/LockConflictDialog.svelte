<script lang="ts">
	/**
	 * LockConflictDialog - Elegant lock conflict resolution
	 *
	 * Design principles:
	 * - Clear action hierarchy: Primary action prominent, dangerous action gated
	 * - Reassuring messaging: User should never feel their work is at risk
	 * - Responsive: Works on narrow sidebars and mobile
	 * - Accessible: Full keyboard navigation, focus management
	 */

	import { Avatar } from '$lib/components/core';
	import AgentAvatar from '$components/agents/AgentAvatar.svelte';
	import type { VFSFileLock, Agent } from '$lib/types';

	interface Props {
		open: boolean;
		filePath: string;
		lock?: VFSFileLock;
		lockHolderAgent?: Agent;
		errorMessage?: string;
		canForceUnlock?: boolean;
		/** Pending local changes count */
		pendingChanges?: number;
		/** Last successful sync time */
		lastSyncTime?: string;
		onWait?: () => void;
		onRequestAccess?: () => void;
		onOpenReadOnly?: () => void;
		onForceUnlock?: () => void;
		onClose: () => void;
	}

	let {
		open,
		filePath,
		lock,
		lockHolderAgent,
		errorMessage,
		canForceUnlock = false,
		pendingChanges = 0,
		lastSyncTime,
		onWait,
		onRequestAccess,
		onOpenReadOnly,
		onForceUnlock,
		onClose
	}: Props = $props();

	// Force unlock confirmation
	let forceUnlockConfirmed = $state(false);
	let showForceSection = $state(false);

	// Computed values
	let fileName = $derived(filePath.split('/').pop() ?? filePath);

	let timeRemaining = $derived.by(() => {
		if (!lock) return '';
		const expiresAt = new Date(lock.expiresAt).getTime();
		const now = Date.now();
		const remaining = Math.max(0, expiresAt - now);
		const minutes = Math.floor(remaining / 60000);
		const seconds = Math.floor((remaining % 60000) / 1000);
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	});

	let lastSyncDisplay = $derived.by(() => {
		if (!lastSyncTime) return null;
		const date = new Date(lastSyncTime);
		const diff = Date.now() - date.getTime();
		if (diff < 60000) return 'Just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
		return date.toLocaleTimeString();
	});

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function handleForceUnlock() {
		if (forceUnlockConfirmed && onForceUnlock) {
			onForceUnlock();
		}
	}

	// Reset state when dialog opens/closes
	$effect(() => {
		if (!open) {
			forceUnlockConfirmed = false;
			showForceSection = false;
		}
	});
</script>

{#if open}
	<div
		class="lock-dialog-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="lock-dialog-title"
		tabindex="-1"
		onclick={handleBackdropClick}
		onkeydown={handleKeyDown}
	>
		<div class="lock-dialog">
			<!-- Header -->
			<header class="lock-dialog__header">
				<div class="lock-dialog__icon">
					<svg
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
				</div>
				<div class="lock-dialog__title-group">
					<h2 id="lock-dialog-title">File is Locked</h2>
					<p class="lock-dialog__filename">{fileName}</p>
				</div>
				<button class="lock-dialog__close" onclick={onClose} aria-label="Close dialog">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			</header>

			<!-- Content -->
			<div class="lock-dialog__content">
				<!-- Lock holder info -->
				{#if lock}
					<div class="lock-holder">
						{#if lockHolderAgent}
							<AgentAvatar agent={lockHolderAgent} size="lg" showPhase={true} />
						{:else}
							<Avatar name={lock.holderName ?? lock.holder} size="lg" />
						{/if}
						<div class="lock-holder__info">
							<span class="lock-holder__name">
								{lockHolderAgent?.name ?? lock.holderName ?? lock.holder}
							</span>
							<span class="lock-holder__meta">
								{lock.holderType === 'agent' ? 'AI Agent' : 'User'}
								{#if lock.purpose}
									&middot; {lock.purpose}
								{/if}
							</span>
							{#if lockHolderAgent?.currentTask}
								<span class="lock-holder__task">
									{lockHolderAgent.currentTask.description}
								</span>
							{/if}
						</div>
						<div class="lock-holder__timer">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								width="14"
								height="14"
							>
								<circle cx="12" cy="12" r="10" />
								<polyline points="12 6 12 12 16 14" />
							</svg>
							<span>{timeRemaining}</span>
						</div>
					</div>
				{/if}

				<!-- Error message -->
				{#if errorMessage}
					<div class="lock-dialog__error" role="alert">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							width="16"
							height="16"
						>
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
						<span>{errorMessage}</span>
					</div>
				{/if}

				<!-- Reassurance message -->
				<div class="lock-dialog__reassurance">
					{#if pendingChanges > 0}
						<div class="reassurance-item reassurance-item--saved">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								width="14"
								height="14"
							>
								<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
								<polyline points="22 4 12 14.01 9 11.01" />
							</svg>
							<span>{pendingChanges} local change{pendingChanges !== 1 ? 's' : ''} saved</span>
						</div>
					{/if}
					{#if lastSyncDisplay}
						<div class="reassurance-item">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								width="14"
								height="14"
							>
								<polyline points="23 4 23 10 17 10" />
								<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
							</svg>
							<span>Last synced {lastSyncDisplay}</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Actions with clear hierarchy -->
			<div class="lock-dialog__actions">
				<!-- Safe options row -->
				<div class="action-row action-row--safe">
					{#if onOpenReadOnly}
						<button class="action-btn action-btn--safe" onclick={onOpenReadOnly}>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								width="18"
								height="18"
							>
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
							<span>View Read-Only</span>
						</button>
					{/if}
					{#if onWait}
						<button class="action-btn action-btn--safe" onclick={onWait}>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								width="18"
								height="18"
							>
								<circle cx="12" cy="12" r="10" />
								<polyline points="12 6 12 12 16 14" />
							</svg>
							<span>Wait for Release</span>
						</button>
					{/if}
				</div>

				<!-- Primary action -->
				{#if onRequestAccess}
					<button class="action-btn action-btn--primary" onclick={onRequestAccess}>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							width="18"
							height="18"
						>
							<line x1="22" y1="2" x2="11" y2="13" />
							<polygon points="22 2 15 22 11 13 2 9 22 2" />
						</svg>
						<span>Request Access</span>
						<span class="action-hint">Notifies the current editor</span>
					</button>
				{/if}

				<!-- Dangerous action (gated) -->
				{#if canForceUnlock && onForceUnlock}
					{#if !showForceSection}
						<button class="action-toggle" onclick={() => (showForceSection = true)}>
							More options...
						</button>
					{:else}
						<div class="force-section">
							<div class="force-warning">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									width="16"
									height="16"
								>
									<path
										d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
									/>
									<line x1="12" y1="9" x2="12" y2="13" />
									<line x1="12" y1="17" x2="12.01" y2="17" />
								</svg>
								<span>Force unlock may cause data loss for the current editor</span>
							</div>
							<label class="force-confirm">
								<input type="checkbox" bind:checked={forceUnlockConfirmed} />
								<span>I understand the risks</span>
							</label>
							<button
								class="action-btn action-btn--danger"
								onclick={handleForceUnlock}
								disabled={!forceUnlockConfirmed}
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									width="18"
									height="18"
								>
									<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
									<path d="M7 11V7a5 5 0 0 1 9.9-1" />
								</svg>
								<span>Force Unlock</span>
							</button>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<footer class="lock-dialog__footer">
				<button class="cancel-btn" onclick={onClose}> Cancel </button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.lock-dialog-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(2px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--ide-z-modal);
		padding: var(--ide-spacing-md);
		animation: fade-in 0.15s ease-out;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.lock-dialog {
		width: 100%;
		max-width: 440px;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-xl);
		box-shadow:
			var(--ide-shadow-xl),
			0 0 60px rgba(0, 0, 0, 0.3);
		animation: slide-up 0.2s ease-out;
		overflow: hidden;
	}

	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(20px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Header */
	.lock-dialog__header {
		display: flex;
		align-items: flex-start;
		gap: var(--ide-spacing-md);
		padding: var(--ide-spacing-lg);
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--ide-lock-other) 8%, transparent) 0%,
			transparent 100%
		);
	}

	.lock-dialog__icon {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--ide-lock-other) 15%, transparent);
		border-radius: 50%;
		color: var(--ide-lock-other);
		flex-shrink: 0;
	}

	.lock-dialog__icon svg {
		width: 22px;
		height: 22px;
	}

	.lock-dialog__title-group {
		flex: 1;
		min-width: 0;
	}

	.lock-dialog__title-group h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
		color: var(--ide-text-primary);
	}

	.lock-dialog__filename {
		margin: 4px 0 0;
		font-size: 13px;
		font-family: var(--ide-font-mono);
		color: var(--ide-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.lock-dialog__close {
		width: 32px;
		height: 32px;
		min-width: 44px;
		min-height: 44px;
		margin: -8px -8px 0 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: var(--ide-radius-md);
		color: var(--ide-text-muted);
		cursor: pointer;
		transition: all var(--ide-transition-fast);
	}

	.lock-dialog__close svg {
		width: 18px;
		height: 18px;
	}

	.lock-dialog__close:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.lock-dialog__close:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	/* Content */
	.lock-dialog__content {
		padding: 0 var(--ide-spacing-lg) var(--ide-spacing-lg);
	}

	/* Lock holder card */
	.lock-holder {
		display: flex;
		align-items: flex-start;
		gap: var(--ide-spacing-md);
		padding: var(--ide-spacing-md);
		background: var(--ide-bg-primary);
		border-radius: var(--ide-radius-lg);
		margin-bottom: var(--ide-spacing-md);
	}

	.lock-holder__info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.lock-holder__name {
		font-weight: 600;
		color: var(--ide-text-primary);
		font-size: 14px;
	}

	.lock-holder__meta {
		font-size: 12px;
		color: var(--ide-text-muted);
	}

	.lock-holder__task {
		font-size: 12px;
		color: var(--ide-text-secondary);
		margin-top: 4px;
	}

	.lock-holder__timer {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: color-mix(in srgb, var(--ide-lock-other) 15%, transparent);
		border-radius: var(--ide-radius-full);
		color: var(--ide-lock-other);
		font-size: 12px;
		font-weight: 500;
		font-family: var(--ide-font-mono);
		white-space: nowrap;
	}

	/* Error */
	.lock-dialog__error {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: color-mix(in srgb, var(--ide-error) 10%, transparent);
		border-radius: var(--ide-radius-md);
		color: var(--ide-error);
		font-size: 13px;
		margin-bottom: var(--ide-spacing-md);
	}

	/* Reassurance */
	.lock-dialog__reassurance {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.reassurance-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--ide-text-muted);
	}

	.reassurance-item--saved {
		color: var(--ide-success);
	}

	/* Actions */
	.lock-dialog__actions {
		padding: 0 var(--ide-spacing-lg) var(--ide-spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-sm);
	}

	.action-row {
		display: flex;
		gap: var(--ide-spacing-sm);
	}

	.action-row--safe {
		flex-wrap: wrap;
	}

	.action-btn {
		flex: 1;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		border: none;
		border-radius: var(--ide-radius-md);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--ide-transition-fast);
	}

	.action-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.action-btn--safe {
		background: var(--ide-bg-primary);
		color: var(--ide-text-primary);
		border: 1px solid var(--ide-border);
		min-width: calc(50% - 4px);
	}

	.action-btn--safe:hover {
		background: var(--ide-bg-hover);
		border-color: var(--ide-text-muted);
	}

	.action-btn--primary {
		flex-direction: column;
		gap: 4px;
		background: linear-gradient(
			135deg,
			var(--ide-interactive) 0%,
			var(--ide-interactive-active) 100%
		);
		color: white;
		padding: 14px 16px;
	}

	.action-btn--primary:hover {
		filter: brightness(1.1);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--ide-interactive) 40%, transparent);
	}

	.action-hint {
		font-size: 11px;
		font-weight: 400;
		opacity: 0.8;
	}

	.action-btn--danger {
		background: var(--ide-error);
		color: white;
	}

	.action-btn--danger:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.action-btn--danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-toggle {
		background: transparent;
		border: none;
		color: var(--ide-text-muted);
		font-size: 12px;
		cursor: pointer;
		padding: 8px;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.action-toggle:hover {
		color: var(--ide-text-secondary);
	}

	/* Force unlock section */
	.force-section {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-sm);
		padding: var(--ide-spacing-md);
		background: color-mix(in srgb, var(--ide-error) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-error) 20%, transparent);
		border-radius: var(--ide-radius-md);
		animation: fade-in 0.15s ease-out;
	}

	.force-warning {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 12px;
		color: var(--ide-error);
		line-height: 1.4;
	}

	.force-warning svg {
		flex-shrink: 0;
		margin-top: 1px;
	}

	.force-confirm {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--ide-text-primary);
		cursor: pointer;
		padding: 4px 0;
	}

	.force-confirm input {
		width: 16px;
		height: 16px;
		accent-color: var(--ide-error);
	}

	/* Footer */
	.lock-dialog__footer {
		display: flex;
		justify-content: center;
		padding: var(--ide-spacing-md);
		border-top: 1px solid var(--ide-border);
		background: var(--ide-bg-primary);
	}

	.cancel-btn {
		background: transparent;
		border: none;
		color: var(--ide-text-muted);
		font-size: 13px;
		cursor: pointer;
		padding: 8px 16px;
		min-height: 44px;
		border-radius: var(--ide-radius-md);
		transition: all var(--ide-transition-fast);
	}

	.cancel-btn:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.cancel-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	/* Responsive */
	@media (max-width: 480px) {
		.lock-dialog {
			max-width: 100%;
			margin: var(--ide-spacing-sm);
		}

		.action-row--safe {
			flex-direction: column;
		}

		.action-btn--safe {
			min-width: 100%;
		}

		.lock-holder {
			flex-wrap: wrap;
		}

		.lock-holder__timer {
			width: 100%;
			justify-content: center;
			margin-top: 8px;
		}
	}
</style>
