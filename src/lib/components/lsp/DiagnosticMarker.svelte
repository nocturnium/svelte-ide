<script lang="ts">
	/**
	 * DiagnosticMarker - Inline diagnostic indicator
	 *
	 * Renders squiggly underlines and gutter icons for diagnostics
	 * at specific positions in the editor.
	 */

	import type { Diagnostic, DiagnosticSeverity } from '$lib/types/lsp';

	interface Props {
		/** The diagnostic to display */
		diagnostic: Diagnostic;
		/** Whether this is a gutter marker or inline underline */
		type?: 'gutter' | 'inline';
		/** Called when marker is clicked */
		onClick?: () => void;
		class?: string;
	}

	let {
		diagnostic,
		type = 'inline',
		onClick,
		class: className = ''
	}: Props = $props();

	function getSeverityClass(severity?: DiagnosticSeverity): string {
		switch (severity) {
			case 1: return 'error';
			case 2: return 'warning';
			case 3: return 'info';
			case 4: return 'hint';
			default: return 'info';
		}
	}

	function getSeverityLabel(severity?: DiagnosticSeverity): string {
		switch (severity) {
			case 1: return 'Error';
			case 2: return 'Warning';
			case 3: return 'Info';
			case 4: return 'Hint';
			default: return 'Diagnostic';
		}
	}
</script>

{#if type === 'gutter'}
	<button
		class="diagnostic-gutter diagnostic-gutter--{getSeverityClass(diagnostic.severity)} {className}"
		title="{getSeverityLabel(diagnostic.severity)}: {diagnostic.message}"
		onclick={onClick}
		aria-label="{getSeverityLabel(diagnostic.severity)} on line {diagnostic.range.start.line + 1}"
	>
		{@html getGutterIcon(diagnostic.severity)}
	</button>
{:else}
	<span
		class="diagnostic-inline diagnostic-inline--{getSeverityClass(diagnostic.severity)} {className}"
		title="{getSeverityLabel(diagnostic.severity)}: {diagnostic.message}"
		role="button"
		tabindex="0"
		onclick={onClick}
		onkeydown={(e) => e.key === 'Enter' && onClick?.()}
	></span>
{/if}

<script context="module" lang="ts">
	function getGutterIcon(severity?: number): string {
		const color = severity === 1 ? 'var(--ide-error)' :
			severity === 2 ? 'var(--ide-warning)' :
			severity === 3 ? 'var(--ide-info)' :
			'var(--ide-text-muted)';

		switch (severity) {
			case 1: // Error - filled circle with X
				return `<svg viewBox="0 0 16 16" width="12" height="12">
					<circle cx="8" cy="8" r="6" fill="${color}"/>
					<path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--ide-bg-primary)" stroke-width="1.5" stroke-linecap="round"/>
				</svg>`;
			case 2: // Warning - triangle
				return `<svg viewBox="0 0 16 16" width="12" height="12">
					<path d="M8 2L1 14h14L8 2z" fill="${color}"/>
					<path d="M8 6v4M8 12v1" stroke="var(--ide-bg-primary)" stroke-width="1.5" stroke-linecap="round"/>
				</svg>`;
			case 3: // Info - circle with i
				return `<svg viewBox="0 0 16 16" width="12" height="12">
					<circle cx="8" cy="8" r="6" fill="${color}"/>
					<path d="M8 5v1M8 8v4" stroke="var(--ide-bg-primary)" stroke-width="1.5" stroke-linecap="round"/>
				</svg>`;
			case 4: // Hint - lightbulb outline
				return `<svg viewBox="0 0 16 16" width="12" height="12">
					<path d="M8 1a5 5 0 013 9v2a1 1 0 01-1 1H6a1 1 0 01-1-1v-2a5 5 0 013-9z" fill="none" stroke="${color}" stroke-width="1.2"/>
					<path d="M6 14h4" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>
				</svg>`;
			default:
				return `<svg viewBox="0 0 16 16" width="12" height="12">
					<circle cx="8" cy="8" r="4" fill="${color}"/>
				</svg>`;
		}
	}
</script>

<style>
	.diagnostic-gutter {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		transition: transform var(--ide-transition-fast);
	}

	.diagnostic-gutter:hover {
		transform: scale(1.15);
	}

	.diagnostic-gutter:focus-visible {
		outline: 2px solid var(--ide-interactive);
		outline-offset: 1px;
		border-radius: 2px;
	}

	.diagnostic-inline {
		position: relative;
		display: inline;
		cursor: pointer;
	}

	.diagnostic-inline::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2px;
		background-repeat: repeat-x;
		background-size: 4px 2px;
		background-position: bottom;
	}

	.diagnostic-inline--error::after {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='2'%3E%3Cpath d='M0 2 L1 0 L2 2 L3 0 L4 2' stroke='%23f44336' fill='none' stroke-width='0.5'/%3E%3C/svg%3E");
	}

	.diagnostic-inline--warning::after {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='2'%3E%3Cpath d='M0 2 L1 0 L2 2 L3 0 L4 2' stroke='%23ff9800' fill='none' stroke-width='0.5'/%3E%3C/svg%3E");
	}

	.diagnostic-inline--info::after {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='2'%3E%3Cpath d='M0 2 L1 0 L2 2 L3 0 L4 2' stroke='%232196f3' fill='none' stroke-width='0.5'/%3E%3C/svg%3E");
	}

	.diagnostic-inline--hint::after {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='2'%3E%3Cpath d='M0 2 L1 0 L2 2 L3 0 L4 2' stroke='%239e9e9e' fill='none' stroke-width='0.5'/%3E%3C/svg%3E");
	}

	.diagnostic-inline:hover::after {
		height: 3px;
	}
</style>
