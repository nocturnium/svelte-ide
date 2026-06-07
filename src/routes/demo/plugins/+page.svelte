<script lang="ts" module>

	/**
	 * Sample proposals served to the embedded <PluginPanel> on a static host.
	 * Shaped to satisfy the wire contract `fetchProposals()` expects from
	 * `GET /api/plugins/proposals` (`{ proposals: [...] }`). Covers the
	 * draft → reviewing → testing → deployed lifecycle so the panel's tabs and
	 * status badges all render populated content.
	 */
	const SAMPLE_PROPOSALS = [
		{
			id: 'prettier-format',
			name: 'Prettier Format',
			description: 'Automatically format code using Prettier on save',
			category: 'transform',
			tags: ['formatting', 'productivity'],
			version: 1,
			status: 'deployed',
			author: 'Alice',
			parameters: { type: 'object', properties: {} },
			implementation: { type: 'module', entryPoint: 'format' },
			testCases: [],
			votes: [],
			issues: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		},
		{
			id: 'eslint-check',
			name: 'ESLint Checker',
			description: 'Real-time ESLint diagnostics and quick fixes',
			category: 'validation',
			tags: ['linting', 'quality'],
			version: 2,
			status: 'deployed',
			author: 'Bob',
			parameters: { type: 'object', properties: {} },
			implementation: { type: 'module', entryPoint: 'check' },
			testCases: [],
			votes: [],
			issues: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		},
		{
			id: 'git-lens',
			name: 'Git Lens',
			description: 'Enhanced Git integration with blame annotations and history',
			category: 'integration',
			tags: ['git', 'history'],
			version: 0,
			status: 'testing',
			author: 'Charlie',
			parameters: { type: 'object', properties: {} },
			implementation: { type: 'module', entryPoint: 'blame' },
			testCases: [],
			votes: [],
			issues: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		},
		{
			id: 'copilot-suggest',
			name: 'AI Suggestions',
			description: 'Inline code suggestions powered by AI',
			category: 'ai',
			tags: ['ai', 'completion'],
			version: 0,
			status: 'reviewing',
			author: 'Diana',
			parameters: { type: 'object', properties: {} },
			implementation: { type: 'module', entryPoint: 'suggest' },
			testCases: [],
			votes: [],
			issues: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		},
		{
			id: 'file-browser',
			name: 'Enhanced File Browser',
			description: 'Advanced file browser with search and filtering',
			category: 'ui',
			tags: ['files', 'navigation'],
			version: 0,
			status: 'draft',
			author: 'Eve',
			parameters: { type: 'object', properties: {} },
			implementation: { type: 'module', entryPoint: 'browse' },
			testCases: [],
			votes: [],
			issues: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		}
	];

</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import { seedProposals } from '$lib/stores/plugin.svelte';
	import PluginPanel from '$lib/components/plugins/PluginPanel.svelte';
	import PluginCard from '$lib/components/plugins/PluginCard.svelte';
	import PluginStatusBadge from '$lib/components/plugins/PluginStatusBadge.svelte';
	import Badge from '$lib/components/core/Badge.svelte';
	import Icon from '$lib/components/core/Icon.svelte';
	import type { PluginStatus, PluginProposal } from '$lib/types/plugin';

	// PluginInfo type matching what PluginCard expects
	interface PluginInfo {
		id: string;
		name: string;
		description: string;
		version: string;
		author: string;
		status: PluginStatus;
	}

	// Populate the embedded <PluginPanel> deterministically on this static host.
	// Seeding the plugin store fills it with sample proposals AND flips it to an
	// offline mode, so the panel's own connect()/fetchProposals() no-op rather than
	// hitting a backend that doesn't exist here. No network, no global patching —
	// the panel renders a populated, connected list with no spinner and no error.
	if (browser) {
		seedProposals(SAMPLE_PROPOSALS as unknown as PluginProposal[]);
	}

	// Sample plugins for demo
	const samplePlugins: PluginInfo[] = [
		{
			id: 'prettier-format',
			name: 'Prettier Format',
			description: 'Automatically format code using Prettier on save',
			status: 'deployed',
			version: '1.2.0',
			author: 'Alice'
		},
		{
			id: 'eslint-check',
			name: 'ESLint Checker',
			description: 'Real-time ESLint diagnostics and quick fixes',
			status: 'deployed',
			version: '2.0.1',
			author: 'Bob'
		},
		{
			id: 'git-lens',
			name: 'Git Lens',
			description: 'Enhanced Git integration with blame annotations and history',
			status: 'testing',
			version: '0.9.0',
			author: 'Charlie'
		},
		{
			id: 'copilot-suggest',
			name: 'AI Suggestions',
			description: 'Inline code suggestions powered by AI',
			status: 'reviewing',
			version: '0.5.0',
			author: 'Diana'
		},
		{
			id: 'file-browser',
			name: 'Enhanced File Browser',
			description: 'Advanced file browser with search and filtering',
			status: 'draft',
			version: '0.1.0',
			author: 'Eve'
		}
	];

	const statuses: PluginStatus[] = [
		'draft',
		'submitted',
		'reviewing',
		'approved',
		'testing',
		'deploying',
		'deployed',
		'rejected',
		'rolled_back'
	];
</script>

<div class="demo-page">
	<header class="page-header">
		<h1>Plugin System</h1>
		<p>Extensible architecture with proposal-based plugin management</p>
	</header>

	<!-- Plugin Panel Demo -->
	<section class="component-section">
		<h2>Plugin Panel</h2>
		<p class="section-desc">Full plugin management interface with tabs</p>

		<div class="panel-container">
			<PluginPanel initialTab="proposals" />
		</div>
	</section>

	<!-- Plugin Cards -->
	<section class="component-section">
		<h2>Plugin Cards</h2>
		<p class="section-desc">Individual plugin display cards</p>

		<div class="cards-grid">
			{#each samplePlugins as plugin}
				<PluginCard {plugin} />
			{/each}
		</div>
	</section>

	<!-- Status Badges -->
	<section class="component-section">
		<h2>Status Badges</h2>
		<p class="section-desc">Plugin lifecycle status indicators</p>

		<div class="status-grid">
			{#each statuses as status}
				<div class="status-item">
					<PluginStatusBadge {status} />
					<span class="status-label">{status}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- Plugin Categories -->
	<section class="component-section">
		<h2>Plugin Categories</h2>
		<p class="section-desc">Organize plugins by functionality</p>

		<div class="categories-grid">
			<div class="category-card">
				<span class="category-icon"><Icon name="folder" size={24} /></span>
				<strong>file_ops</strong>
				<p>File operations and manipulation</p>
			</div>
			<div class="category-card">
				<span class="category-icon"><Icon name="external" size={24} /></span>
				<strong>http</strong>
				<p>HTTP requests and API calls</p>
			</div>
			<div class="category-card">
				<span class="category-icon"><Icon name="search" size={24} /></span>
				<strong>analysis</strong>
				<p>Code analysis and inspection</p>
			</div>
			<div class="category-card">
				<span class="category-icon"><Icon name="refresh" size={24} /></span>
				<strong>transform</strong>
				<p>Code transformation and formatting</p>
			</div>
			<div class="category-card">
				<span class="category-icon"><Icon name="check" size={24} /></span>
				<strong>validation</strong>
				<p>Linting and validation</p>
			</div>
			<div class="category-card">
				<span class="category-icon"><Icon name="settings" size={24} /></span>
				<strong>utility</strong>
				<p>General utilities</p>
			</div>
			<div class="category-card">
				<span class="category-icon"><Icon name="link" size={24} /></span>
				<strong>integration</strong>
				<p>External service integration</p>
			</div>
			<div class="category-card">
				<span class="category-icon"><Icon name="sidebar" size={24} /></span>
				<strong>ui</strong>
				<p>UI components and panels</p>
			</div>
			<div class="category-card">
				<span class="category-icon"><Icon name="edit" size={24} /></span>
				<strong>editor</strong>
				<p>Editor enhancements</p>
			</div>
			<div class="category-card">
				<span class="category-icon"><Icon name="sparkles" size={24} /></span>
				<strong>ai</strong>
				<p>AI-powered features</p>
			</div>
		</div>
	</section>

	<!-- Plugin Lifecycle -->
	<section class="component-section">
		<h2>Plugin Lifecycle</h2>
		<p class="section-desc">From proposal to deployment</p>

		<div class="lifecycle">
			<div class="lifecycle-step">
				<div class="step-number">1</div>
				<div class="step-content">
					<strong>Draft</strong>
					<p>Create and edit your plugin proposal</p>
				</div>
			</div>
			<div class="lifecycle-arrow">→</div>
			<div class="lifecycle-step">
				<div class="step-number">2</div>
				<div class="step-content">
					<strong>Submit</strong>
					<p>Submit for community review</p>
				</div>
			</div>
			<div class="lifecycle-arrow">→</div>
			<div class="lifecycle-step">
				<div class="step-number">3</div>
				<div class="step-content">
					<strong>Review</strong>
					<p>Community votes and feedback</p>
				</div>
			</div>
			<div class="lifecycle-arrow">→</div>
			<div class="lifecycle-step">
				<div class="step-number">4</div>
				<div class="step-content">
					<strong>Testing</strong>
					<p>Automated tests and validation</p>
				</div>
			</div>
			<div class="lifecycle-arrow">→</div>
			<div class="lifecycle-step">
				<div class="step-number">5</div>
				<div class="step-content">
					<strong>Deploy</strong>
					<p>Gradual rollout to users</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Store API -->
	<section class="component-section">
		<h2>Plugin Store API</h2>
		<p class="section-desc">Managing plugins programmatically</p>

		<div class="config-demo">
			<pre><code>{`// Connect to plugin system
import { connect, createProposal, loadPlugin } from '$lib/stores/plugin.svelte';

// Connect to the backend
await connect('wss://plugins.example.com');

// Create a new plugin proposal
const proposal = await createProposal({
  name: 'My Plugin',
  description: 'Does something useful',
  category: 'utility',
  tags: ['helper', 'productivity'],
  implementation: \`
    export async function execute(context) {
      // Plugin logic here
      return { success: true };
    }
  \`
});

// Register commands
import { registerCommand } from '$lib/stores/plugin.svelte';

registerCommand({
  name: 'myPlugin.run',
  description: 'Run my plugin',
  keybinding: 'Ctrl+Shift+M',
  handler: async () => {
    // Command logic
  }
});

// Load and unload plugins
await loadPlugin('prettier-format');
await unloadPlugin('prettier-format');`}</code></pre>
		</div>
	</section>
</div>

<style>
	.demo-page {
		padding: 2rem 3rem;
		max-width: 1000px;
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

	.component-section {
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--ide-border);
	}

	.component-section:last-child {
		border-bottom: none;
	}

	.component-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--ide-text-primary);
		margin-bottom: 0.25rem;
	}

	.section-desc {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
	}

	.panel-container {
		height: 500px;
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		overflow: hidden;
	}

	.cards-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.status-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.status-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		background: var(--ide-bg-tertiary);
		border: 1px solid transparent;
		border-radius: 6px;
	}

	.status-label {
		font-size: 0.8125rem;
		color: var(--ide-text-secondary);
		font-family: var(--ide-font-mono);
	}

	.categories-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1rem;
	}

	.category-card {
		padding: 1rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		text-align: center;
	}

	.category-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-nocturnium-wave);
		margin-bottom: 0.625rem;
	}

	.category-card strong {
		display: block;
		color: var(--ide-text-primary);
		font-size: 0.875rem;
		margin-bottom: 0.25rem;
	}

	.category-card p {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
		margin: 0;
	}

	.lifecycle {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.lifecycle-step {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
	}

	.step-number {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-nocturnium-wave);
		color: var(--color-nocturnium-night);
		border-radius: 50%;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.step-content strong {
		display: block;
		color: var(--ide-text-primary);
		font-size: 0.875rem;
	}

	.step-content p {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
		margin: 0;
	}

	.lifecycle-arrow {
		color: var(--ide-text-muted);
		font-size: 1.25rem;
	}

	.config-demo {
		background: var(--ide-bg-tertiary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		padding: 1.25rem;
		overflow-x: auto;
	}

	.config-demo pre {
		margin: 0;
	}

	.config-demo code {
		font-family: var(--ide-font-mono);
		font-size: 0.875rem;
		color: var(--ide-text-primary);
	}

	/* Tablet -> mobile shift */
	@media (max-width: 860px) {
		.demo-page {
			padding: 1.5rem 1.25rem;
		}

		.cards-grid {
			grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		}

		.categories-grid {
			grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		}
	}

	/* Mobile: keep the embedded panel and lifecycle legible on narrow screens */
	@media (max-width: 768px) {
		/* Reduce the embedded PluginPanel so it doesn't dominate the scroll, and
		   let its internal tab bar wrap/scroll rather than cramming on one line. */
		.panel-container {
			height: 420px;
		}

		.panel-container :global(.plugin-panel__tabs) {
			flex-wrap: wrap;
		}

		/* Vertical stepper: drop the inline arrows and stack steps with a left rail. */
		.lifecycle {
			flex-direction: column;
			align-items: stretch;
			gap: 0;
		}

		.lifecycle-arrow {
			display: none;
		}

		.lifecycle-step {
			position: relative;
			border-radius: 0;
			border-left: 2px solid var(--ide-border);
			border-top: none;
			border-right: none;
			border-bottom: none;
			background: transparent;
			padding: 0.625rem 0.75rem 0.625rem 1.25rem;
			margin-left: 13px;
		}

		.lifecycle-step:first-child {
			padding-top: 0;
		}

		.lifecycle-step:last-child {
			padding-bottom: 0;
		}

		.step-number {
			position: absolute;
			left: -14px;
			top: 0.5rem;
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

		.cards-grid {
			grid-template-columns: 1fr;
		}

		.categories-grid {
			grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		}

		.status-grid {
			gap: 0.625rem;
		}

		/* Signal horizontal scrollability with a right-edge fade and shrink type. */
		.config-demo {
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 1.75rem), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 1.75rem), transparent);
			padding: 1rem;
		}

		.config-demo code {
			font-size: var(--ide-font-size-xs, 0.75rem);
		}
	}
</style>
