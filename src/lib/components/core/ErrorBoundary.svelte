<script lang="ts">
/**
 * ErrorBoundary Component
 *
 * Catches errors in child components and displays a fallback UI.
 * Provides retry and recovery options.
 */

import type { Snippet } from 'svelte';
import type { VFSError, RecoveryOption } from '$lib/services/error-handling';
import { isVFSError } from '$lib/services/error-handling';

interface Props {
	children: Snippet;
	fallback?: Snippet<[{ error: Error; reset: () => void }]>;
	onError?: (error: Error) => void;
	onReset?: () => void;
	showDetails?: boolean;
}

let { children, fallback, onError, onReset, showDetails = false }: Props = $props();

let error = $state<Error | null>(null);
let showTechnicalDetails = $state(false);

// Derived error info
let vfsError = $derived(error && isVFSError(error) ? (error as VFSError) : null);
let errorTitle = $derived(vfsError?.code ?? 'Error');
let errorMessage = $derived(vfsError?.userMessage ?? error?.message ?? 'An unexpected error occurred');
let recoveryOptions = $derived(vfsError?.recoveryOptions ?? []);

function handleError(e: Error) {
	error = e;
	onError?.(e);
}

function reset() {
	error = null;
	showTechnicalDetails = false;
	onReset?.();
}

function handleRecovery(option: RecoveryOption) {
	if (option.action === 'retry' || option.action === 'refresh') {
		reset();
	}
	// Other actions would be handled by parent via onError
}

// Expose error handler for programmatic use
export function setError(e: Error) {
	handleError(e);
}

export function clearError() {
	reset();
}
</script>

{#if error}
	{#if fallback}
		{@render fallback({ error, reset })}
	{:else}
		<div class="error-boundary" role="alert">
			<div class="error-content">
				<div class="error-icon">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
				</div>

				<h2 class="error-title">{errorTitle}</h2>
				<p class="error-message">{errorMessage}</p>

				{#if recoveryOptions.length > 0}
					<div class="recovery-options">
						{#each recoveryOptions as option (option.id)}
							<button
								class="recovery-btn"
								class:recommended={option.recommended}
								class:dangerous={option.dangerous}
								onclick={() => handleRecovery(option)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				{:else}
					<div class="recovery-options">
						<button class="recovery-btn recommended" onclick={reset}>
							Try Again
						</button>
					</div>
				{/if}

				{#if showDetails && (vfsError?.technicalDetails || error.stack)}
					<button
						class="details-toggle"
						onclick={() => (showTechnicalDetails = !showTechnicalDetails)}
					>
						{showTechnicalDetails ? 'Hide' : 'Show'} Technical Details
					</button>

					{#if showTechnicalDetails}
						<div class="technical-details">
							{#if vfsError}
								<div class="detail-row">
									<span class="detail-label">Code:</span>
									<span class="detail-value">{vfsError.code}</span>
								</div>
								{#if vfsError.statusCode}
									<div class="detail-row">
										<span class="detail-label">Status:</span>
										<span class="detail-value">{vfsError.statusCode}</span>
									</div>
								{/if}
								{#if vfsError.path}
									<div class="detail-row">
										<span class="detail-label">Path:</span>
										<span class="detail-value">{vfsError.path}</span>
									</div>
								{/if}
							{/if}
							{#if error.stack}
								<pre class="stack-trace">{error.stack}</pre>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
{:else}
	{@render children()}
{/if}

<style>
	.error-boundary {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		padding: 24px;
		background: var(--ide-bg-primary, #1e1e1e);
	}

	.error-content {
		max-width: 480px;
		text-align: center;
	}

	.error-icon {
		color: var(--ide-error, #f44747);
		margin-bottom: 16px;
	}

	.error-title {
		margin: 0 0 8px;
		font-size: 20px;
		font-weight: 600;
		color: var(--ide-text-primary, #e0e0e0);
	}

	.error-message {
		margin: 0 0 20px;
		font-size: 14px;
		color: var(--ide-text-secondary, #a0a0a0);
		line-height: 1.5;
	}

	.recovery-options {
		display: flex;
		gap: 8px;
		justify-content: center;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}

	.recovery-btn {
		padding: 8px 16px;
		border: 1px solid var(--ide-border, #3c3c3c);
		border-radius: 4px;
		background: var(--ide-bg-secondary, #252526);
		color: var(--ide-text-primary, #e0e0e0);
		font-size: 13px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.recovery-btn:hover {
		background: var(--ide-bg-hover, #3c3c3c);
	}

	.recovery-btn.recommended {
		background: var(--ide-accent, #569cd6);
		border-color: var(--ide-accent, #569cd6);
		color: white;
	}

	.recovery-btn.recommended:hover {
		background: var(--ide-accent-hover, #4a8bc4);
	}

	.recovery-btn.dangerous {
		border-color: var(--ide-error, #f44747);
		color: var(--ide-error, #f44747);
	}

	.recovery-btn.dangerous:hover {
		background: rgba(244, 71, 71, 0.1);
	}

	.details-toggle {
		background: transparent;
		border: none;
		color: var(--ide-text-muted, #808080);
		font-size: 12px;
		cursor: pointer;
		text-decoration: underline;
		margin-bottom: 12px;
	}

	.details-toggle:hover {
		color: var(--ide-text-secondary, #a0a0a0);
	}

	.technical-details {
		text-align: left;
		background: var(--ide-bg-secondary, #252526);
		border: 1px solid var(--ide-border, #3c3c3c);
		border-radius: 4px;
		padding: 12px;
	}

	.detail-row {
		display: flex;
		gap: 8px;
		font-size: 12px;
		margin-bottom: 4px;
	}

	.detail-label {
		color: var(--ide-text-muted, #808080);
		min-width: 60px;
	}

	.detail-value {
		color: var(--ide-text-primary, #e0e0e0);
		font-family: var(--ide-font-mono, monospace);
	}

	.stack-trace {
		margin: 8px 0 0;
		padding: 8px;
		background: var(--ide-bg-primary, #1e1e1e);
		border-radius: 4px;
		font-family: var(--ide-font-mono, monospace);
		font-size: 11px;
		color: var(--ide-text-muted, #808080);
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 200px;
		overflow: auto;
	}
</style>
