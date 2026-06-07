<script lang="ts">
/**
 * ConnectionStatus Component
 *
 * Displays the current connection status with the VFS server.
 * Shows connected, disconnected, and reconnecting states.
 */

export type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error';

interface Props {
	state: ConnectionState;
	reconnectAttempts?: number;
	maxReconnectAttempts?: number;
	lastEventTime?: string | null;
	errorMessage?: string | null;
	onRetry?: () => void;
	compact?: boolean;
	showLabel?: boolean;
}

let {
	state,
	reconnectAttempts = 0,
	maxReconnectAttempts = 10,
	lastEventTime = null,
	errorMessage = null,
	onRetry,
	compact = false,
	showLabel = true
}: Props = $props();

// Computed display values
let statusLabel = $derived.by(() => {
	switch (state) {
		case 'connected':
			return 'Connected';
		case 'disconnected':
			return 'Disconnected';
		case 'connecting':
			return 'Connecting...';
		case 'reconnecting':
			return `Reconnecting (${reconnectAttempts}/${maxReconnectAttempts})`;
		case 'error':
			return 'Connection Error';
		default:
			return 'Unknown';
	}
});

let statusIcon = $derived.by(() => {
	switch (state) {
		case 'connected':
			return 'check';
		case 'disconnected':
		case 'error':
			return 'x';
		case 'connecting':
		case 'reconnecting':
			return 'loader';
		default:
			return 'circle';
	}
});

let lastSyncDisplay = $derived.by(() => {
	if (!lastEventTime) return null;
	const date = new Date(lastEventTime);
	const now = new Date();
	const diff = now.getTime() - date.getTime();

	if (diff < 60000) return 'Just now';
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
	return date.toLocaleDateString();
});
</script>

<div
	class="connection-status"
	class:compact
	class:connected={state === 'connected'}
	class:disconnected={state === 'disconnected'}
	class:connecting={state === 'connecting' || state === 'reconnecting'}
	class:error={state === 'error'}
	role="status"
	aria-live="polite"
>
	<span class="status-indicator">
		{#if statusIcon === 'check'}
			<svg
				class="icon icon-check"
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="20 6 9 17 4 12" />
			</svg>
		{:else if statusIcon === 'x'}
			<svg
				class="icon icon-x"
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M18 6 6 18M6 6l12 12" />
			</svg>
		{:else if statusIcon === 'loader'}
			<svg
				class="icon icon-loader"
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M21 12a9 9 0 1 1-6.219-8.56" />
			</svg>
		{:else}
			<span class="dot"></span>
		{/if}
	</span>

	{#if showLabel}
		<span class="status-label">{statusLabel}</span>
	{/if}

	{#if lastSyncDisplay && state === 'connected' && !compact}
		<span class="last-sync">Last sync: {lastSyncDisplay}</span>
	{/if}

	{#if (state === 'disconnected' || state === 'error') && onRetry}
		<button class="retry-btn" onclick={onRetry}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
				<path d="M21 3v5h-5" />
				<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
				<path d="M3 21v-5h5" />
			</svg>
			Retry
		</button>
	{/if}

	{#if errorMessage && state === 'error' && !compact}
		<span class="error-message" title={errorMessage}>
			{errorMessage.length > 40 ? `${errorMessage.slice(0, 40)}...` : errorMessage}
		</span>
	{/if}
</div>

<style>
	.connection-status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--ide-text-secondary, #a0a0a0);
		padding: 4px 8px;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	.connection-status.compact {
		padding: 2px 4px;
		gap: 4px;
	}

	.connection-status.connected {
		color: var(--ide-agent-online, #4ec9b0);
	}

	.connection-status.disconnected {
		color: var(--ide-text-muted, #808080);
	}

	.connection-status.connecting {
		color: var(--ide-agent-busy, #dcdcaa);
	}

	.connection-status.error {
		color: var(--ide-error, #f44747);
	}

	.status-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
	}

	.icon {
		width: 14px;
		height: 14px;
	}

	.icon-loader {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: currentColor;
	}

	.status-label {
		font-weight: 500;
	}

	.last-sync {
		color: var(--ide-text-muted, #808080);
		font-size: 11px;
	}

	.retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		background: var(--ide-bg-tertiary, #2d2d2d);
		border: 1px solid var(--ide-border, #3c3c3c);
		border-radius: 3px;
		color: var(--ide-text-secondary, #a0a0a0);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.retry-btn:hover {
		background: var(--ide-bg-hover, #3c3c3c);
		color: var(--ide-text-primary, #e0e0e0);
	}

	.error-message {
		font-size: 11px;
		color: var(--ide-error, #f44747);
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Pulse animation for reconnecting */
	.connection-status.connecting .dot {
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}
</style>
