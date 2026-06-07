<script lang="ts">
	/**
	 * Git Blame Layer
	 *
	 * Displays inline git blame information in the editor gutter.
	 * Shows author, timestamp, and commit info with hover details.
	 */

	import { onMount } from 'svelte';
	import type { GitBlameManager, BlameInfo, BlameState } from './core/git-blame';

	interface Props {
		/** Git blame manager instance */
		manager: GitBlameManager;
		/** Line height in pixels */
		lineHeight: number;
		/** Gutter width for positioning */
		gutterWidth?: number;
		/** Width of the blame column */
		blameWidth?: number;
		/** Whether enabled */
		enabled?: boolean;
		/** Callback when commit is clicked */
		onCommitClick?: (info: BlameInfo) => void;
	}

	let {
		manager,
		lineHeight,
		gutterWidth = 50,
		blameWidth = 200,
		enabled = true,
		onCommitClick
	}: Props = $props();

	let blameData = $state<BlameInfo[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hoveredLine = $state<number | null>(null);
	let tooltipInfo = $state<BlameInfo | null>(null);
	let tooltipPosition = $state({ top: 0, left: 0 });

	// Subscribe to manager state
	onMount(() => {
		const state = manager.getState();
		blameData = manager.getAllBlame();
		loading = state.loading;
		error = state.error;

		const unsubscribe = manager.subscribe((newState: BlameState) => {
			blameData = manager.getAllBlame();
			loading = newState.loading;
			error = newState.error;
		});

		return unsubscribe;
	});

	const config = $derived(manager.getConfig());

	/**
	 * Group consecutive lines with same commit for compact display
	 */
	function getBlameGroups(): Array<{ startLine: number; endLine: number; info: BlameInfo }> {
		const groups: Array<{ startLine: number; endLine: number; info: BlameInfo }> = [];
		let currentGroup: { startLine: number; endLine: number; info: BlameInfo } | null = null;

		for (const info of blameData) {
			if (
				currentGroup &&
				currentGroup.info.commitSha === info.commitSha &&
				currentGroup.endLine === info.line - 1
			) {
				// Extend current group
				currentGroup.endLine = info.line;
			} else {
				// Start new group
				if (currentGroup) {
					groups.push(currentGroup);
				}
				currentGroup = {
					startLine: info.line,
					endLine: info.line,
					info
				};
			}
		}

		if (currentGroup) {
			groups.push(currentGroup);
		}

		return groups;
	}

	const blameGroups = $derived(getBlameGroups());

	/**
	 * Handle mouse enter on blame row
	 */
	function handleMouseEnter(info: BlameInfo, event: MouseEvent) {
		hoveredLine = info.line;
		tooltipInfo = info;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		tooltipPosition = {
			top: rect.top + window.scrollY,
			left: rect.right + 8
		};
	}

	/**
	 * Handle mouse leave
	 */
	function handleMouseLeave() {
		hoveredLine = null;
		tooltipInfo = null;
	}

	/**
	 * Handle commit click
	 */
	function handleClick(info: BlameInfo) {
		onCommitClick?.(info);
	}

	/**
	 * Truncate text with ellipsis
	 */
	function truncate(text: string, maxLen: number): string {
		if (text.length <= maxLen) return text;
		return text.slice(0, maxLen - 1) + '\u2026';
	}

	/**
	 * Get author initials
	 */
	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

{#if enabled && manager.isEnabled() && blameData.length > 0}
	<div
		class="git-blame-layer"
		style="left: {gutterWidth}px; width: {blameWidth}px;"
		aria-hidden="true"
	>
		{#if loading}
			<div class="git-blame-loading">
				<span class="loading-spinner"></span>
				Loading blame...
			</div>
		{:else if error}
			<div class="git-blame-error">{error}</div>
		{:else}
			{#each blameGroups as group (group.startLine)}
				{@const info = group.info}
				{@const height = (group.endLine - group.startLine + 1) * lineHeight}
				<div
					class="git-blame-row"
					class:git-blame-row--uncommitted={info.uncommitted}
					class:git-blame-row--hovered={hoveredLine !== null &&
						hoveredLine >= group.startLine &&
						hoveredLine <= group.endLine}
					style="top: {group.startLine * lineHeight}px; height: {height}px; --blame-color: {info.color};"
					onmouseenter={(e) => handleMouseEnter(info, e)}
					onmouseleave={handleMouseLeave}
					onclick={() => handleClick(info)}
					onkeydown={(e) => e.key === 'Enter' && handleClick(info)}
					role="button"
					tabindex={-1}
				>
					<!-- Color indicator bar -->
					<div class="git-blame-bar"></div>

					<!-- Content (only show for first line of group) -->
					{#if group.startLine === group.endLine || height >= lineHeight}
						<div class="git-blame-content">
							{#if info.uncommitted}
								<span class="git-blame-uncommitted">Uncommitted</span>
							{:else}
								{#if config.showAuthor}
									<span class="git-blame-author" title={info.author}>
										{truncate(info.author, 15)}
									</span>
								{/if}
								{#if config.showTimestamp}
									<span class="git-blame-time">
										{manager.formatTimestamp(info.timestamp)}
									</span>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	<!-- Tooltip -->
	{#if tooltipInfo}
		<div
			class="git-blame-tooltip"
			style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px;"
		>
			<div class="tooltip-header">
				<div class="tooltip-avatar" style="background: {tooltipInfo.color};">
					{getInitials(tooltipInfo.author)}
				</div>
				<div class="tooltip-author-info">
					<span class="tooltip-author">{tooltipInfo.author}</span>
					<span class="tooltip-email">{tooltipInfo.authorEmail}</span>
				</div>
			</div>

			<div class="tooltip-commit">
				<span class="tooltip-sha">{tooltipInfo.commitSha}</span>
				<span class="tooltip-date">
					{tooltipInfo.timestamp.toLocaleDateString(undefined, {
						year: 'numeric',
						month: 'short',
						day: 'numeric',
						hour: '2-digit',
						minute: '2-digit'
					})}
				</span>
			</div>

			<div class="tooltip-message">
				{tooltipInfo.message}
			</div>

			{#if tooltipInfo.uncommitted}
				<div class="tooltip-uncommitted-badge">Uncommitted changes</div>
			{/if}

			<div class="tooltip-hint">Click to view full commit</div>
		</div>
	{/if}
{/if}

<style>
	.git-blame-layer {
		position: absolute;
		top: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.15);
		border-right: 1px solid var(--ide-border, #333);
		overflow: hidden;
		z-index: 2;
	}

	.git-blame-loading,
	.git-blame-error {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-size: 12px;
		color: var(--ide-text-muted, #888);
	}

	.git-blame-error {
		color: var(--ide-error, #ef4444);
	}

	.loading-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--ide-interactive, #4f8cc9);
		border-radius: 50%;
		margin-right: 8px;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.git-blame-row {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: flex-start;
		cursor: pointer;
		transition: background 0.1s ease;
		overflow: hidden;
	}

	.git-blame-row:hover,
	.git-blame-row--hovered {
		background: rgba(255, 255, 255, 0.05);
	}

	.git-blame-row--uncommitted {
		font-style: italic;
	}

	.git-blame-bar {
		width: 3px;
		height: 100%;
		background: var(--blame-color, #6b7280);
		flex-shrink: 0;
	}

	.git-blame-content {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 8px;
		height: 20px;
		line-height: 20px;
		font-size: 11px;
		white-space: nowrap;
		overflow: hidden;
	}

	.git-blame-author {
		color: var(--ide-text-secondary, #aaa);
		font-weight: 500;
	}

	.git-blame-time {
		color: var(--ide-text-muted, #888);
		font-size: 10px;
	}

	.git-blame-uncommitted {
		color: var(--ide-warning, #f59e0b);
		font-size: 10px;
	}

	/* Tooltip */
	.git-blame-tooltip {
		position: fixed;
		z-index: 1000;
		min-width: 280px;
		max-width: 400px;
		padding: 12px;
		background: var(--color-surface, #1e1e2e);
		border: 1px solid var(--color-border, #333);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		font-size: 12px;
		pointer-events: none;
	}

	.tooltip-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
	}

	.tooltip-avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		font-size: 14px;
		font-weight: 600;
		color: #fff;
		flex-shrink: 0;
	}

	.tooltip-author-info {
		display: flex;
		flex-direction: column;
	}

	.tooltip-author {
		font-weight: 600;
		color: var(--color-text, #e8e8f0);
	}

	.tooltip-email {
		font-size: 11px;
		color: var(--color-text-muted, #888);
	}

	.tooltip-commit {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		margin-bottom: 8px;
	}

	.tooltip-sha {
		font-family: monospace;
		font-size: 12px;
		color: var(--ide-interactive, #4f8cc9);
	}

	.tooltip-date {
		color: var(--color-text-muted, #888);
		font-size: 11px;
	}

	.tooltip-message {
		color: var(--color-text, #e8e8f0);
		line-height: 1.4;
		margin-bottom: 8px;
	}

	.tooltip-uncommitted-badge {
		display: inline-block;
		padding: 2px 8px;
		background: rgba(245, 158, 11, 0.2);
		border-radius: 4px;
		color: #f59e0b;
		font-size: 10px;
		margin-bottom: 8px;
	}

	.tooltip-hint {
		font-size: 10px;
		color: var(--color-text-muted, #888);
		border-top: 1px solid var(--color-border, #333);
		padding-top: 8px;
		margin-top: 4px;
	}
</style>
