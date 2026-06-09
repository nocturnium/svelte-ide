<script lang="ts">
	/**
	 * Context Lens
	 *
	 * Displays inline, auto-collapsing type annotations and context information.
	 * When cursor enters a function, shows floating header with signature.
	 * For variables, shows subtle type badges.
	 */

	import type { Line } from './core/state';

	interface ContextLensItem {
		/** Type of lens item */
		type: 'function-header' | 'variable-type' | 'parameter-info' | 'return-type';
		/** Line number (0-based) */
		line: number;
		/** Column position */
		column: number;
		/** Content to display */
		content: {
			label: string;
			detail?: string;
			documentation?: string;
		};
		/** When to show */
		visibility: 'always' | 'on-cursor' | 'on-hover';
		/** Optional icon */
		icon?: string;
	}

	interface Props {
		/** Lines to analyze */
		lines: readonly Line[];
		/** Current cursor line */
		cursorLine: number;
		/** Line height in pixels */
		lineHeight: number;
		/** Character width in pixels */
		charWidth: number;
		/** Gutter width in pixels */
		gutterWidth: number;
		/** Whether context lens is enabled */
		enabled?: boolean;
		/** Language for parsing */
		language?: string;
	}

	let {
		lines,
		cursorLine,
		lineHeight,
		charWidth,
		gutterWidth,
		enabled = true,
		language: _language = 'typescript'
	}: Props = $props();

	// Extract context lens items from code
	let lensItems = $derived.by(() => {
		if (!enabled || lines.length === 0) return [];

		const items: ContextLensItem[] = [];

		for (let i = 0; i < lines.length; i++) {
			const text = lines[i].text;

			// Detect function definitions
			const funcMatch = text.match(
				/^(\s*)(export\s+)?(async\s+)?function\s+(\w+)\s*(<[^>]+>)?\s*\(([^)]*)\)(\s*:\s*([^{]+))?/
			);
			if (funcMatch) {
				const [, indent, , isAsync, name, generics, params, , returnType] = funcMatch;
				items.push({
					type: 'function-header',
					line: i,
					column: indent.length,
					content: {
						label: name,
						detail: `${isAsync ? 'async ' : ''}(${params.trim()})${returnType ? ` => ${returnType.trim()}` : ''}`,
						documentation: generics ? `Generic: ${generics}` : undefined
					},
					visibility: 'on-cursor',
					icon: isAsync ? '\u{26A1}' : '\u{0192}'
				});
			}

			// Detect arrow functions with type annotations
			const arrowMatch = text.match(
				/^(\s*)(export\s+)?const\s+(\w+)\s*(<[^>]+>)?\s*=\s*(async\s*)?\(([^)]*)\)(\s*:\s*([^=]+))?\s*=>/
			);
			if (arrowMatch) {
				const [, indent, , name, generics, isAsync, params, , returnType] = arrowMatch;
				items.push({
					type: 'function-header',
					line: i,
					column: indent.length,
					content: {
						label: name,
						detail: `${isAsync ? 'async ' : ''}(${params.trim()})${returnType ? ` => ${returnType.trim()}` : ''}`,
						documentation: generics ? `Generic: ${generics}` : undefined
					},
					visibility: 'on-cursor',
					icon: '\u{21D2}'
				});
			}

			// Detect interface/type definitions
			const typeMatch = text.match(/^(\s*)(export\s+)?(interface|type)\s+(\w+)(<[^>]+>)?/);
			if (typeMatch) {
				const [, indent, , keyword, name, generics] = typeMatch;
				items.push({
					type: 'variable-type',
					line: i,
					column: indent.length,
					content: {
						label: name,
						detail: keyword,
						documentation: generics ? `Generic: ${generics}` : undefined
					},
					visibility: 'on-cursor',
					icon: keyword === 'interface' ? '\u{1D540}' : '\u{1D54B}'
				});
			}

			// Detect class definitions
			const classMatch = text.match(
				/^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)(<[^>]+>)?(\s+extends\s+(\w+))?(\s+implements\s+([^{]+))?/
			);
			if (classMatch) {
				const [, indent, , isAbstract, name, generics, , extendsClass, , implementsInterfaces] =
					classMatch;
				let detail = isAbstract ? 'abstract class' : 'class';
				if (extendsClass) detail += ` extends ${extendsClass}`;
				if (implementsInterfaces) detail += ` implements ${implementsInterfaces.trim()}`;

				items.push({
					type: 'function-header',
					line: i,
					column: indent.length,
					content: {
						label: name,
						detail,
						documentation: generics ? `Generic: ${generics}` : undefined
					},
					visibility: 'on-cursor',
					icon: '\u{1D49E}'
				});
			}
		}

		return items;
	});

	// Filter to visible items based on cursor position
	let visibleItems = $derived(
		lensItems.filter(
			(item) =>
				item.visibility === 'always' ||
				(item.visibility === 'on-cursor' && item.line === cursorLine)
		)
	);

	/**
	 * Get position style for an item
	 */
	function getItemStyle(item: ContextLensItem): string {
		const top = item.line * lineHeight - lineHeight - 2; // Position above the line
		const left = gutterWidth + item.column * charWidth;

		return `top: ${top}px; left: ${left}px;`;
	}
</script>

{#if enabled && visibleItems.length > 0}
	<div class="context-lens" aria-hidden="true">
		{#each visibleItems as item (`${item.line}-${item.type}`)}
			<div class="context-lens__item context-lens__item--{item.type}" style={getItemStyle(item)}>
				{#if item.icon}
					<span class="context-lens__icon">{item.icon}</span>
				{/if}
				<span class="context-lens__label">{item.content.label}</span>
				{#if item.content.detail}
					<span class="context-lens__detail">{item.content.detail}</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.context-lens {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 3;
		overflow: hidden;
	}

	.context-lens__item {
		position: absolute;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 8px;
		background: color-mix(in srgb, var(--ide-bg-elevated) 95%, transparent);
		border: 1px solid var(--ide-border);
		border-radius: 4px;
		font-size: 11px;
		font-family: var(--ide-font-mono);
		white-space: nowrap;
		box-shadow: var(--ide-shadow-md);
		animation: lens-fade-in 0.15s ease-out;
	}

	@keyframes lens-fade-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.context-lens__item--function-header {
		border-left: 3px solid var(--ide-syntax-function);
	}

	.context-lens__item--variable-type {
		border-left: 3px solid var(--ide-syntax-keyword);
	}

	.context-lens__item--parameter-info {
		border-left: 3px solid var(--ide-syntax-string);
	}

	.context-lens__item--return-type {
		border-left: 3px solid var(--ide-syntax-number);
	}

	.context-lens__icon {
		font-size: 12px;
		opacity: 0.8;
	}

	.context-lens__label {
		color: var(--ide-text-primary);
		font-weight: 600;
	}

	.context-lens__detail {
		color: var(--ide-text-muted);
		font-weight: 400;
	}

	@media (prefers-reduced-motion: reduce) {
		.context-lens__item {
			animation: none;
		}
	}
</style>
