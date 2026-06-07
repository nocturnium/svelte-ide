<script lang="ts">
	import { Icon, Badge, Spinner } from '$components/core';
	import type { AIToolCall } from '$types';

	interface Props {
		toolCall: AIToolCall;
		status?: 'pending' | 'running' | 'completed' | 'error';
		result?: unknown;
		error?: string;
		duration?: number;
		startedAt?: Date;
	}

	let {
		toolCall,
		status = 'completed',
		result,
		error,
		duration,
		startedAt
	}: Props = $props();

	let expanded = $state(false);
	let showResult = $state(false);

	// Format duration nicely
	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
	}

	// Get status badge variant
	function getStatusVariant(s: string): 'info' | 'warning' | 'success' | 'danger' {
		switch (s) {
			case 'pending':
				return 'info';
			case 'running':
				return 'warning';
			case 'completed':
				return 'success';
			case 'error':
				return 'danger';
			default:
				return 'info';
		}
	}

	// Get status icon
	function getStatusIcon(s: string): string {
		switch (s) {
			case 'pending':
				return 'clock';
			case 'running':
				return 'loader';
			case 'completed':
				return 'check';
			case 'error':
				return 'x';
			default:
				return 'zap';
		}
	}

	// Format result for display
	function formatResult(r: unknown): string {
		if (r === undefined || r === null) return 'null';
		if (typeof r === 'string') return r;
		try {
			return JSON.stringify(r, null, 2);
		} catch {
			return String(r);
		}
	}

	// Truncate long results
	function truncateResult(r: string, maxLength: number = 500): { text: string; truncated: boolean } {
		if (r.length <= maxLength) return { text: r, truncated: false };
		return { text: r.slice(0, maxLength), truncated: true };
	}

	const formattedResult = $derived(result !== undefined ? formatResult(result) : null);
	const truncatedResult = $derived(formattedResult ? truncateResult(formattedResult) : null);
</script>

<div class="tool-call" class:tool-call--error={status === 'error'}>
	<button
		class="tool-call__header"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
		aria-label={`${toolCall.name} tool call, ${status}. ${expanded ? 'Click to collapse' : 'Click to expand'}`}
	>
		<span class="tool-call__expand" aria-hidden="true">
			<Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
		</span>

		<span class="tool-call__icon">
			{#if status === 'running'}
				<Spinner size="sm" />
			{:else}
				<Icon name="zap" size={14} />
			{/if}
		</span>

		<span class="tool-call__name">{toolCall.name}</span>

		<div class="tool-call__badges">
			<Badge variant={getStatusVariant(status)} size="sm">
				{#if status !== 'running'}
					<Icon name={getStatusIcon(status)} size={10} />
				{/if}
				{status}
			</Badge>

			{#if duration !== undefined}
				<Badge variant="default" size="sm">
					<Icon name="clock" size={10} />
					{formatDuration(duration)}
				</Badge>
			{/if}
		</div>
	</button>

	{#if expanded}
		<div class="tool-call__content">
			<!-- Arguments Section -->
			<div class="tool-call__section">
				<div class="tool-call__section-header">
					<Icon name="arrow-right" size={12} />
					<span>Arguments</span>
				</div>
				<pre class="tool-call__code">{JSON.stringify(toolCall.arguments, null, 2)}</pre>
			</div>

			<!-- Result Section -->
			{#if status === 'completed' && formattedResult}
				<div class="tool-call__section">
					<div class="tool-call__section-header">
						<Icon name="arrow-left" size={12} />
						<span>Result</span>
						{#if truncatedResult?.truncated}
							<button
								class="tool-call__toggle"
								onclick={() => (showResult = !showResult)}
							>
								{showResult ? 'Show less' : 'Show full'}
							</button>
						{/if}
					</div>
					<pre class="tool-call__code tool-call__code--result">{showResult || !truncatedResult?.truncated ? formattedResult : truncatedResult?.text + '...'}</pre>
				</div>
			{/if}

			<!-- Error Section -->
			{#if status === 'error' && error}
				<div class="tool-call__section tool-call__section--error">
					<div class="tool-call__section-header">
						<Icon name="alert-triangle" size={12} />
						<span>Error</span>
					</div>
					<pre class="tool-call__code tool-call__code--error">{error}</pre>
				</div>
			{/if}

			<!-- Timing Info -->
			{#if startedAt}
				<div class="tool-call__timing">
					<span>Started: {startedAt.toLocaleTimeString()}</span>
					{#if duration}
						<span>Duration: {formatDuration(duration)}</span>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tool-call {
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		overflow: hidden;
		transition: border-color 0.15s ease;
	}

	.tool-call:hover {
		border-color: color-mix(in srgb, var(--ide-border) 70%, var(--color-nocturnium-wave));
	}

	.tool-call--error {
		border-color: color-mix(in srgb, var(--ide-error) 50%, transparent);
	}

	.tool-call__header {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-sm);
		width: 100%;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		background: var(--ide-bg-secondary);
		border: none;
		color: var(--ide-text-primary);
		font-family: var(--ide-font-sans);
		font-size: var(--ide-font-size-sm);
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
	}

	.tool-call__header:hover {
		background: var(--ide-bg-hover);
	}

	.tool-call__header:focus-visible {
		outline: 2px solid var(--color-nocturnium-wave);
		outline-offset: -2px;
	}

	.tool-call__expand {
		color: var(--ide-text-muted);
		transition: transform 0.15s ease;
	}

	.tool-call__icon {
		display: flex;
		align-items: center;
		color: var(--color-nocturnium-wave);
	}

	.tool-call__name {
		flex: 1;
		font-family: var(--ide-font-mono);
		font-weight: 500;
	}

	.tool-call__badges {
		display: flex;
		gap: var(--ide-spacing-xs);
	}

	.tool-call__content {
		padding: var(--ide-spacing-md);
		background: var(--ide-bg-primary);
		border-top: 1px solid var(--ide-border);
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-md);
	}

	.tool-call__section {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-xs);
	}

	.tool-call__section--error {
		background: color-mix(in srgb, var(--ide-error) 10%, transparent);
		padding: var(--ide-spacing-sm);
		border-radius: var(--ide-radius-sm);
		margin: calc(-1 * var(--ide-spacing-xs));
	}

	.tool-call__section-header {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		font-size: var(--ide-font-size-xs);
		font-weight: 600;
		color: var(--ide-text-secondary);
	}

	.tool-call__toggle {
		margin-left: auto;
		padding: 0.125rem 0.375rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-sm);
		font-size: 10px;
		color: var(--ide-text-muted);
		cursor: pointer;
	}

	.tool-call__toggle:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.tool-call__code {
		margin: 0;
		padding: var(--ide-spacing-sm);
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-xs);
		background: var(--ide-bg-secondary);
		border-radius: var(--ide-radius-sm);
		overflow-x: auto;
		max-height: 200px;
		overflow-y: auto;
	}

	.tool-call__code--result {
		background: color-mix(in srgb, var(--ide-success) 10%, var(--ide-bg-secondary));
	}

	.tool-call__code--error {
		background: transparent;
		color: var(--ide-error);
	}

	.tool-call__timing {
		display: flex;
		gap: var(--ide-spacing-md);
		padding-top: var(--ide-spacing-sm);
		border-top: 1px solid var(--ide-border);
		font-size: 10px;
		color: var(--ide-text-muted);
	}
</style>
