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

	removeItem(productId) {
		const index = this.items.findIndex(
			item => item.product.id === productId
		);

		if (index !== -1) {
			this.items.splice(index, 1);
		}
	}

	getTotal() {
		return this.items.reduce((sum, item) => {
			return sum + (item.product.price * item.quantity);
		}, 0);
	}

	applyDiscount(code) {
		const discount = this.discounts.find(d => d.code === code);

		if (discount && discount.isValid()) {
			return this.getTotal() * (1 - discount.percentage);
		}

		return this.getTotal();
	}
}

/*
 * Multi-line comments can also be folded.
 * This is useful for documentation blocks
 * or temporarily hiding large comment sections.
 */

// #region Utility Functions
function formatPrice(cents) {
	return (cents / 100).toFixed(2);
}

function validateEmail(email) {
	const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
	return regex.test(email);
}

function debounce(fn, delay) {
	let timeout;
	return (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), delay);
	};
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
        self.cache = {}

    def transform(self, func):
        """Apply a transformation function to the data."""
        self.transformations.append(func)
        self.data = [func(item) for item in self.data]
        return self

    def filter(self, predicate):
        """Filter data based on a predicate function."""
        self.data = [item for item in self.data if predicate(item)]
        return self

    def map(self, func):
        """Map a function over the data."""
        return self.transform(func)

    def reduce(self, func, initial=None):
        """Reduce the data to a single value."""
        result = initial
        for item in self.data:
            if result is None:
                result = item
            else:
                result = func(result, item)
        return result


def process_batch(items, batch_size=100):
    """Process items in batches for efficiency."""
    results = []

    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]

        # Process each batch
        processed = []
        for item in batch:
            if item.is_valid():
                processed.append(item.process())

        results.extend(processed)

    return results
`;

	let selectedLanguage = $state<'javascript' | 'python'>('javascript');
	let foldingEnabled = $state(true);

	const code = $derived(selectedLanguage === 'javascript' ? javascriptCode : pythonCode);
</script>

<div class="demo-page">
	<header class="page-header">
		<h1>Code Folding</h1>
		<p>Collapse and expand code blocks to navigate large files more easily.</p>
	</header>

	<section class="demo-section">
		<h2>Interactive Demo</h2>
		<p class="section-desc">
			Hover over lines to see fold indicators. Click the arrows to collapse or expand regions.
		</p>

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
	</section>

	<section class="demo-section">
		<h2>Features</h2>
		<ul class="features-list">
			<li>
				<strong>Bracket-based folding:</strong> Automatically detects foldable regions based on matching
				braces, brackets, and parentheses (JavaScript, TypeScript, JSON, etc.)
			</li>
			<li>
				<strong>Indentation-based folding:</strong> For languages like Python that use indentation for
				structure
			</li>
			<li>
				<strong>Region markers:</strong> Use <code>// #region</code> and <code>// #endregion</code> comments
				to define custom foldable sections
			</li>
			<li>
				<strong>Multi-line comments:</strong> Long block comments can be collapsed to reduce clutter
			</li>
			<li>
				<strong>Keyboard shortcuts:</strong>
				<ul>
					<li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>[</kbd> - Fold current region</li>
					<li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>]</kbd> - Unfold current region</li>
					<li><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>[</kbd> - Fold all regions</li>
					<li><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>]</kbd> - Unfold all regions</li>
				</ul>
			</li>
		</ul>
	</section>

	<section class="demo-section">
		<h2>Fold Indicators</h2>
		<div class="indicator-examples">
			<div class="indicator-example">
				<span class="fold-demo-icon expanded">▼</span>
				<span>Expanded - click to collapse</span>
			</div>
			<div class="indicator-example">
				<span class="fold-demo-icon collapsed">▶</span>
				<span>Collapsed - click to expand</span>
			</div>
			<div class="indicator-example">
				<span class="fold-demo-placeholder">...</span>
				<span>Indicates hidden lines (click to expand)</span>
			</div>
		</div>
	</section>
</div>

<style>
	.demo-page {
		padding: 2rem 3rem;
		max-width: 1200px;
		min-height: 100vh;
		overflow-x: hidden;
	}

	.page-header {
		margin-bottom: 2.5rem;
	}

	.page-header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: var(--ide-text-primary);
		margin-bottom: 0.5rem;
	}

	.page-header p {
		color: var(--ide-text-secondary);
	}

	.demo-section {
		margin-bottom: 3rem;
	}

	.demo-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--ide-text-primary);
		margin-bottom: 0.25rem;
	}

	.section-desc {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 1.25rem 1.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		/* Group the Language + Folding controls into a single bordered toolbar so
		   they read as one intentional unit (mirrors the editor demo's toolbar). */
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
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		background: var(--ide-bg-tertiary);
		color: var(--ide-text-primary);
	}

	.control-btn:focus-visible {
		outline: 2px solid var(--ide-interactive);
		outline-offset: 2px;
	}

	.control-btn--active {
		background: var(--ide-interactive);
		border-color: var(--ide-interactive);
		color: white;
	}

	.control-btn--active:hover {
		background: var(--ide-interactive);
		color: white;
	}

	.editor-container {
		height: 500px;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		overflow: hidden;
	}

	/* Ensure the inner code surface remains horizontally scrollable on touch so
	   long lines are reachable instead of being clipped at the right edge. */
	.editor-container :global(.custom-editor__content) {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.features-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.features-list > li {
		padding: 0.75rem 0;
		color: var(--ide-text-secondary);
		border-bottom: 1px solid var(--ide-border);
	}

	.features-list > li:last-child {
		border-bottom: none;
	}

	.features-list strong {
		color: var(--ide-text-primary);
	}

	.features-list code {
		background: var(--ide-bg-tertiary);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		font-family: var(--ide-font-mono);
		font-size: 0.85em;
	}

	.features-list ul {
		margin-top: 0.5rem;
		padding-left: 1.5rem;
	}

	.features-list kbd {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 3px;
		font-family: var(--ide-font-mono);
		font-size: 0.8em;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
	}

	.indicator-examples {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--ide-bg-secondary);
		border-radius: var(--ide-radius-md);
	}

	.indicator-example {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: var(--ide-text-secondary);
	}

	.fold-demo-icon {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
	}

	.fold-demo-icon.expanded {
		color: var(--ide-text-muted);
	}

	.fold-demo-icon.collapsed {
		color: var(--ide-interactive);
	}

	.fold-demo-placeholder {
		padding: 0 6px;
		background: var(--ide-bg-tertiary);
		border: 1px solid var(--ide-border);
		border-radius: 3px;
		font-size: 0.85em;
		color: var(--ide-text-muted);
	}

	/* Tablet -> mobile shift */
	@media (max-width: 860px) {
		.demo-page {
			padding: 1.75rem 1.5rem;
		}

		.controls {
			gap: 1rem 1.5rem;
		}
	}

	/* Phones */
	@media (max-width: 640px) {
		.demo-page {
			padding: 1.25rem 1rem;
		}

		.page-header h1 {
			font-size: 1.625rem;
		}

		/* Keep the editor from dominating the viewport. The editor measures its
		   own font/line metrics in JS, so we constrain height (not font-size)
		   and let the inner code surface scroll horizontally on touch. */
		.editor-container {
			height: 340px;
		}

		/* Comfortable touch targets for the language / folding toggles. */
		.control-btn {
			min-height: 44px;
			padding: 0.5rem 0.875rem;
		}

		.control-group {
			flex-wrap: wrap;
		}

		/* Long code lines extend past the viewport on phones, and touch platforms
		   hide the horizontal scrollbar until the user drags. Fade the right edge of
		   the code surface so it reads as "scrolls sideways" instead of an abrupt cut. */
		.editor-container :global(.custom-editor__content) {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
		}
	}
</style>
