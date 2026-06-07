<script lang="ts">
	/**
	 * SignatureHelpWidget - LSP function signature display
	 *
	 * Shows function signatures with parameter highlighting when
	 * the user is typing function arguments.
	 */

	import type { SignatureHelp, SignatureInformation, ParameterInformation } from '$lib/types/lsp';

	interface Props {
		/** Signature help data from LSP */
		signatureHelp: SignatureHelp;
		/** Position to render the widget */
		position: { x: number; y: number };
		/** Called when widget should close */
		onDismiss: () => void;
		class?: string;
	}

	let {
		signatureHelp,
		position,
		onDismiss,
		class: className = ''
	}: Props = $props();

	let activeSignature = $derived(
		signatureHelp.signatures[signatureHelp.activeSignature ?? 0] as SignatureInformation | undefined
	);

	let activeParameterIndex = $derived(
		signatureHelp.activeParameter ?? activeSignature?.activeParameter ?? 0
	);

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onDismiss();
		}
	}

	function getParameterLabel(param: ParameterInformation): string {
		if (typeof param.label === 'string') {
			return param.label;
		}
		// It's a tuple [start, end] - extract from signature
		if (activeSignature) {
			const [start, end] = param.label;
			return activeSignature.label.substring(start, end);
		}
		return '';
	}

	function parseSignatureLabel(sig: SignatureInformation): { before: string; param: string; after: string } {
		const params = sig.parameters;
		if (!params || params.length === 0 || activeParameterIndex >= params.length) {
			return { before: sig.label, param: '', after: '' };
		}

		const activeParam = params[activeParameterIndex];
		const paramLabel = getParameterLabel(activeParam);

		if (typeof activeParam.label === 'string') {
			// Find the parameter in the signature label
			const paramIndex = sig.label.indexOf(paramLabel);
			if (paramIndex === -1) {
				return { before: sig.label, param: '', after: '' };
			}
			return {
				before: sig.label.substring(0, paramIndex),
				param: paramLabel,
				after: sig.label.substring(paramIndex + paramLabel.length)
			};
		} else {
			// Tuple label [start, end]
			const [start, end] = activeParam.label;
			return {
				before: sig.label.substring(0, start),
				param: sig.label.substring(start, end),
				after: sig.label.substring(end)
			};
		}
	}

	function getParameterDocumentation(param: ParameterInformation): string | undefined {
		if (!param.documentation) return undefined;
		if (typeof param.documentation === 'string') return param.documentation;
		return param.documentation.value;
	}

	function getSignatureDocumentation(sig: SignatureInformation): string | undefined {
		if (!sig.documentation) return undefined;
		if (typeof sig.documentation === 'string') return sig.documentation;
		return sig.documentation.value;
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
	class="signature-help {className}"
	style="left: {position.x}px; top: {position.y}px;"
	role="tooltip"
	aria-label="Signature help"
>
	{#if signatureHelp.signatures.length > 1}
		<div class="signature-help__nav">
			<span class="signature-help__nav-text">
				{(signatureHelp.activeSignature ?? 0) + 1} of {signatureHelp.signatures.length}
			</span>
		</div>
	{/if}

	{#if activeSignature}
		{@const parsed = parseSignatureLabel(activeSignature)}
		<div class="signature-help__signature">
			<code class="signature-help__label">
				<span class="signature-help__label-before">{parsed.before}</span><span class="signature-help__label-param">{parsed.param}</span><span class="signature-help__label-after">{parsed.after}</span>
			</code>
		</div>

		{#if activeSignature.parameters && activeSignature.parameters[activeParameterIndex]}
			{@const paramDoc = getParameterDocumentation(activeSignature.parameters[activeParameterIndex])}
			{#if paramDoc}
				<div class="signature-help__param-doc">
					<span class="signature-help__param-name">
						{getParameterLabel(activeSignature.parameters[activeParameterIndex])}:
					</span>
					<span class="signature-help__param-desc">{paramDoc}</span>
				</div>
			{/if}
		{/if}

		{#if getSignatureDocumentation(activeSignature)}
			<div class="signature-help__doc">
				{getSignatureDocumentation(activeSignature)}
			</div>
		{/if}
	{/if}
</div>

<style>
	.signature-help {
		position: fixed;
		z-index: 1001;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		box-shadow: var(--ide-shadow-lg);
		min-width: 200px;
		max-width: 600px;
		font-size: var(--ide-font-size-sm);
	}

	.signature-help__nav {
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		border-bottom: 1px solid var(--ide-border);
		background: var(--ide-bg-tertiary);
	}

	.signature-help__nav-text {
		font-size: var(--ide-font-size-xs);
		color: var(--ide-text-muted);
	}

	.signature-help__signature {
		padding: var(--ide-spacing-sm);
	}

	.signature-help__label {
		font-family: var(--ide-font-mono);
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-primary);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.signature-help__label-before,
	.signature-help__label-after {
		color: var(--ide-text-secondary);
	}

	.signature-help__label-param {
		color: var(--ide-interactive);
		font-weight: 600;
		background: color-mix(in srgb, var(--ide-interactive) 15%, transparent);
		padding: 0 2px;
		border-radius: 2px;
	}

	.signature-help__param-doc {
		padding: var(--ide-spacing-xs) var(--ide-spacing-sm);
		border-top: 1px solid var(--ide-border);
		background: var(--ide-bg-tertiary);
	}

	.signature-help__param-name {
		font-family: var(--ide-font-mono);
		font-weight: 600;
		color: var(--ide-interactive);
	}

	.signature-help__param-desc {
		color: var(--ide-text-secondary);
		margin-left: var(--ide-spacing-xs);
	}

	.signature-help__doc {
		padding: var(--ide-spacing-sm);
		border-top: 1px solid var(--ide-border);
		color: var(--ide-text-secondary);
		font-size: var(--ide-font-size-xs);
		line-height: 1.5;
	}
</style>
