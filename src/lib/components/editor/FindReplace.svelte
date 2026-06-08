<script lang="ts">
	import { onMount, tick } from 'svelte';

	interface Props {
		/** Current search query */
		query?: string;
		/** Current replace text */
		replaceText?: string;
		/** Whether to show replace controls */
		showReplace?: boolean;
		/** Whether search is case sensitive */
		caseSensitive?: boolean;
		/** Whether to use regex search */
		useRegex?: boolean;
		/** Total number of matches */
		matchCount?: number;
		/** Current match index (1-based) */
		currentMatch?: number;
		/** Called when query changes */
		onQueryChange?: (query: string) => void;
		/** Called when replace text changes */
		onReplaceTextChange?: (text: string) => void;
		/** Called when case sensitivity changes */
		onCaseSensitiveChange?: (value: boolean) => void;
		/** Called when regex mode changes */
		onUseRegexChange?: (value: boolean) => void;
		/** Called to find next match */
		onFindNext?: () => void;
		/** Called to find previous match */
		onFindPrev?: () => void;
		/** Called to replace current match */
		onReplace?: () => void;
		/** Called to replace all matches */
		onReplaceAll?: () => void;
		/** Called to close the find/replace bar */
		onClose?: () => void;
	}

	let {
		query = '',
		replaceText = '',
		showReplace = false,
		caseSensitive = false,
		useRegex = false,
		matchCount = 0,
		currentMatch = 0,
		onQueryChange,
		onReplaceTextChange,
		onCaseSensitiveChange,
		onUseRegexChange,
		onFindNext,
		onFindPrev,
		onReplace,
		onReplaceAll,
		onClose
	}: Props = $props();

	let findInput = $state<HTMLInputElement | null>(null);
	let replaceInput = $state<HTMLInputElement | null>(null);

	// Writable derived: tracks the showReplace prop but allows local overrides (e.g. toggle)
	let showReplaceLocal = $derived(showReplace);

	// Focus find input on mount
	onMount(() => {
		findInput?.focus();
		findInput?.select();
	});

	function handleFindKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (e.shiftKey) {
				onFindPrev?.();
			} else {
				onFindNext?.();
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onClose?.();
		} else if (e.key === 'Tab' && showReplaceLocal && !e.shiftKey) {
			e.preventDefault();
			replaceInput?.focus();
		}
	}

	function handleReplaceKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (e.shiftKey) {
				onReplaceAll?.();
			} else {
				onReplace?.();
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onClose?.();
		} else if (e.key === 'Tab' && e.shiftKey) {
			e.preventDefault();
			findInput?.focus();
		}
	}

	function handleQueryInput(e: Event) {
		const target = e.target as HTMLInputElement;
		onQueryChange?.(target.value);
	}

	function handleReplaceInput(e: Event) {
		const target = e.target as HTMLInputElement;
		onReplaceTextChange?.(target.value);
	}

	function toggleReplace() {
		showReplaceLocal = !showReplaceLocal;
		if (showReplaceLocal) {
			tick().then(() => replaceInput?.focus());
		}
	}

	function toggleCaseSensitive() {
		onCaseSensitiveChange?.(!caseSensitive);
	}

	function toggleRegex() {
		onUseRegexChange?.(!useRegex);
	}

	/** Focus the find input and select all text */
	export function focus() {
		findInput?.focus();
		findInput?.select();
	}

	/** Set the initial query */
	export function setQuery(newQuery: string) {
		onQueryChange?.(newQuery);
		tick().then(() => {
			findInput?.focus();
			findInput?.select();
		});
	}
</script>

<div class="find-replace" role="search" aria-label="Find and replace">
	<!-- Find row -->
	<div class="find-replace__row">
		<button
			class="find-replace__toggle"
			onclick={toggleReplace}
			aria-label={showReplaceLocal ? 'Hide replace' : 'Show replace'}
			aria-expanded={showReplaceLocal}
			title={showReplaceLocal ? 'Hide replace (Ctrl+H)' : 'Show replace (Ctrl+H)'}
		>
			<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
				{#if showReplaceLocal}
					<path d="M6 8L2 4h8L6 8z" />
				{:else}
					<path d="M4 6l4-4v8L4 6z" />
				{/if}
			</svg>
		</button>

		<div class="find-replace__input-wrapper">
			<input
				bind:this={findInput}
				type="text"
				class="find-replace__input"
				placeholder="Find"
				value={query}
				oninput={handleQueryInput}
				onkeydown={handleFindKeyDown}
				aria-label="Search query"
			/>
			{#if query}
				<span class="find-replace__count" aria-live="polite">
					{#if matchCount > 0}
						{currentMatch} of {matchCount}
					{:else}
						No results
					{/if}
				</span>
			{/if}
		</div>

		<div class="find-replace__options">
			<button
				class="find-replace__option"
				class:find-replace__option--active={caseSensitive}
				onclick={toggleCaseSensitive}
				aria-pressed={caseSensitive}
				title="Match case (Alt+C)"
			>
				Aa
			</button>
			<button
				class="find-replace__option"
				class:find-replace__option--active={useRegex}
				onclick={toggleRegex}
				aria-pressed={useRegex}
				title="Use regular expression (Alt+R)"
			>
				.*
			</button>
		</div>

		<div class="find-replace__actions">
			<button
				class="find-replace__action"
				onclick={() => onFindPrev?.()}
				disabled={matchCount === 0}
				aria-label="Previous match"
				title="Previous match (Shift+Enter)"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
					<path d="M7 3L2 8h10L7 3z" />
				</svg>
			</button>
			<button
				class="find-replace__action"
				onclick={() => onFindNext?.()}
				disabled={matchCount === 0}
				aria-label="Next match"
				title="Next match (Enter)"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
					<path d="M7 11L2 6h10L7 11z" />
				</svg>
			</button>
			<button
				class="find-replace__action find-replace__action--close"
				onclick={() => onClose?.()}
				aria-label="Close"
				title="Close (Escape)"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
					<path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" fill="none" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Replace row -->
	{#if showReplaceLocal}
		<div class="find-replace__row find-replace__row--replace">
			<div class="find-replace__spacer"></div>

			<div class="find-replace__input-wrapper">
				<input
					bind:this={replaceInput}
					type="text"
					class="find-replace__input"
					placeholder="Replace"
					value={replaceText}
					oninput={handleReplaceInput}
					onkeydown={handleReplaceKeyDown}
					aria-label="Replace text"
				/>
			</div>

			<div class="find-replace__actions find-replace__actions--replace">
				<button
					class="find-replace__action"
					onclick={() => onReplace?.()}
					disabled={matchCount === 0}
					aria-label="Replace"
					title="Replace (Enter)"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
						<path d="M2 7h8M7 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" fill="none" />
					</svg>
				</button>
				<button
					class="find-replace__action"
					onclick={() => onReplaceAll?.()}
					disabled={matchCount === 0}
					aria-label="Replace all"
					title="Replace all (Shift+Enter)"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
						<path
							d="M1 4h6M1 7h8M1 10h6M10 4l2 2-2 2M10 8l2 2-2 2"
							stroke="currentColor"
							stroke-width="1.2"
							fill="none"
						/>
					</svg>
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.find-replace {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 8px;
		background: var(--ide-bg-secondary);
		border-bottom: 1px solid var(--ide-border);
		font-family: var(--ide-font-sans);
		font-size: 13px;
	}

	.find-replace__row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.find-replace__toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 3px;
		color: var(--ide-text-secondary);
		cursor: pointer;
		transition:
			background 0.1s,
			color 0.1s;
	}

	.find-replace__toggle:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.find-replace__spacer {
		width: 20px;
		flex-shrink: 0;
	}

	.find-replace__input-wrapper {
		position: relative;
		flex: 1;
		max-width: 300px;
	}

	.find-replace__input {
		width: 100%;
		padding: 4px 8px;
		padding-right: 70px;
		background: var(--ide-bg-primary);
		border: 1px solid var(--ide-border);
		border-radius: 4px;
		color: var(--ide-text-primary);
		font-family: var(--ide-font-mono);
		font-size: 12px;
		outline: none;
		transition: border-color 0.1s;
	}

	.find-replace__input:focus {
		border-color: var(--ide-interactive);
	}

	.find-replace__input::placeholder {
		color: var(--ide-text-muted);
	}

	.find-replace__count {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--ide-text-muted);
		font-size: 11px;
		pointer-events: none;
	}

	.find-replace__options {
		display: flex;
		gap: 2px;
	}

	.find-replace__option {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: 22px;
		padding: 0 4px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 3px;
		color: var(--ide-text-secondary);
		font-family: var(--ide-font-mono);
		font-size: 11px;
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}

	.find-replace__option:hover {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.find-replace__option--active {
		background: var(--ide-interactive);
		border-color: var(--ide-interactive);
		color: var(--ide-text-primary);
	}

	.find-replace__option--active:hover {
		background: var(--ide-interactive-hover);
	}

	.find-replace__actions {
		display: flex;
		gap: 2px;
	}

	.find-replace__actions--replace {
		margin-left: auto;
	}

	.find-replace__action {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 22px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 3px;
		color: var(--ide-text-secondary);
		cursor: pointer;
		transition:
			background 0.1s,
			color 0.1s;
	}

	.find-replace__action:hover:not(:disabled) {
		background: var(--ide-bg-hover);
		color: var(--ide-text-primary);
	}

	.find-replace__action:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.find-replace__action--close:hover {
		background: var(--ide-error);
		color: white;
	}
</style>
