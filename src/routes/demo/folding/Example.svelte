<script lang="ts">
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';

	// Sample code with foldable regions
	const javascriptCode = `// Code Folding Demo
// Hover over lines with fold indicators to see them

function calculateTotal(items) {
	let total = 0;

	for (const item of items) {
		if (item.quantity > 0) {
			const subtotal = item.price * item.quantity;
			total += subtotal;
		}
	}

	return total;
}

class ShoppingCart {
	constructor() {
		this.items = [];
		this.discounts = [];
	}

	addItem(product, quantity = 1) {
		const existingItem = this.items.find(
			item => item.product.id === product.id
		);

		if (existingItem) {
			existingItem.quantity += quantity;
		} else {
			this.items.push({
				product,
				quantity,
				addedAt: new Date()
			});
		}
	}

	getTotal() {
		return this.items.reduce((sum, item) => {
			return sum + (item.product.price * item.quantity);
		}, 0);
	}
}

// #region Utility Functions
function formatPrice(cents) {
	return (cents / 100).toFixed(2);
}
// #endregion

export { ShoppingCart, calculateTotal, formatPrice };
`;

	const pythonCode = `# Python Code Folding Demo
# Python uses indentation-based folding

def fibonacci(n):
    """Calculate the nth Fibonacci number."""
    if n <= 1:
        return n

    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b

    return b


class DataProcessor:
    """A class for processing data with various transformations."""

    def __init__(self, data):
        self.data = data
        self.transformations = []

    def transform(self, func):
        """Apply a transformation function to the data."""
        self.transformations.append(func)
        self.data = [func(item) for item in self.data]
        return self

    def filter(self, predicate):
        """Filter data based on a predicate function."""
        self.data = [item for item in self.data if predicate(item)]
        return self
`;

	let selectedLanguage = $state<'javascript' | 'python'>('javascript');
	let foldingEnabled = $state(true);

	const code = $derived(selectedLanguage === 'javascript' ? javascriptCode : pythonCode);
</script>

<div class="folding-demo">
	<div class="controls" role="toolbar" aria-label="Demo controls">
		<div class="control-group">
			<span class="control-label">Language:</span>
			<button
				class="control-btn"
				class:control-btn--active={selectedLanguage === 'javascript'}
				aria-pressed={selectedLanguage === 'javascript'}
				onclick={() => (selectedLanguage = 'javascript')}
			>
				JavaScript
			</button>
			<button
				class="control-btn"
				class:control-btn--active={selectedLanguage === 'python'}
				aria-pressed={selectedLanguage === 'python'}
				onclick={() => (selectedLanguage = 'python')}
			>
				Python
			</button>
		</div>

		<div class="control-group">
			<span class="control-label">Folding:</span>
			<button
				class="control-btn"
				class:control-btn--active={foldingEnabled}
				onclick={() => (foldingEnabled = !foldingEnabled)}
			>
				{foldingEnabled ? 'Enabled' : 'Disabled'}
			</button>
		</div>
	</div>

	<div class="editor-container">
		<CustomEditor
			content={code}
			language={selectedLanguage}
			folding={foldingEnabled}
			readonly={false}
		/>
	</div>
</div>

<style>
	.folding-demo {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-md);
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 1.25rem 1.5rem;
		flex-wrap: wrap;
		padding: 0.5rem 0.75rem;
		background: color-mix(in srgb, var(--ide-bg-secondary) 60%, transparent);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.control-label {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
	}

	.control-btn {
		padding: 0.375rem 0.75rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 4px;
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		cursor: pointer;
		transition:
			background 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.control-btn:hover {
		background: var(--ide-bg-tertiary);
		color: var(--ide-text-primary);
	}

	.control-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.control-btn--active {
		background: var(--ide-interactive-strong);
		border-color: var(--ide-interactive-strong);
		color: #fff;
		font-weight: 500;
	}

	.control-btn--active:hover {
		background: color-mix(in srgb, var(--ide-interactive-strong) 88%, white);
		border-color: color-mix(in srgb, var(--ide-interactive-strong) 88%, white);
		color: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
	}

	.editor-container {
		height: 500px;
		border-radius: var(--ide-radius-md);
		overflow: hidden;
		background: var(--ide-bg-primary);
	}

	.editor-container :global(.custom-editor__content) {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	@media (max-width: 640px) {
		.editor-container {
			height: 340px;
		}

		.control-btn {
			min-height: 44px;
			padding: 0.5rem 0.875rem;
		}

		.control-group {
			flex-wrap: wrap;
		}

		.editor-container :global(.custom-editor__content) {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
		}
	}
</style>
