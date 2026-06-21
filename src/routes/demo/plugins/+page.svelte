<script lang="ts" module>
	/**
	 * Sample proposals served to the embedded <PluginPanel> on a static host.
	 * Shaped to satisfy the wire contract `fetchProposals()` expects from
	 * `GET /api/plugins/proposals` (`{ proposals: [...] }`). Every proposal carries
	 * an IN-FLIGHT status (draft → submitted → reviewing → approved → testing) and
	 * never 'deployed': a proposal under review can't already be shipped, and the
	 * Install CTA / 'Available' tab are reserved for deployed plugins only — so the
	 * panel never shows a 'deployed' badge beside an 'Install' button.
	 */
	const SAMPLE_PROPOSALS = [
		{
			id: 'prettier-format',
			name: 'Prettier Format',
			description: 'Automatically format code using Prettier on save',
			category: 'transform',
			tags: ['formatting', 'productivity'],
			version: 1,
			status: 'approved',
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
			status: 'submitted',
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
			version: 1,
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
			version: 1,
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
			version: 1,
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
	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
	import { seedProposals } from '$lib/stores/plugin.svelte';
	import PluginPanel from '$lib/components/plugins/PluginPanel.svelte';
	import PluginCard from '$lib/components/plugins/PluginCard.svelte';
	import PluginStatusBadge from '$lib/components/plugins/PluginStatusBadge.svelte';
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

	// Cards and the embedded PluginPanel share ONE source of truth: SAMPLE_PROPOSALS.
	// We derive the card list from those same proposals and format the version exactly
	// the way PluginPanel does (`${proposal.version}.0.0`), so a plugin can never show
	// one version in the panel and a different one on its card.
	const samplePlugins: PluginInfo[] = SAMPLE_PROPOSALS.map((p) => ({
		id: p.id,
		name: p.name,
		description: p.description,
		status: p.status as PluginStatus,
		version: `${p.version}.0.0`,
		author: p.author
	}));

	// Forward lifecycle, in order — mirrors the Plugin Lifecycle stepper below.
	const lifecycleStatuses: PluginStatus[] = [
		'draft',
		'submitted',
		'reviewing',
		'approved',
		'testing',
		'deploying',
		'deployed'
	];
	// Terminal / negative outcomes, separated to express the state model.
	const terminalStatuses: PluginStatus[] = ['rejected', 'rolled_back'];

	const panelCode = `<script lang="ts">
  import { PluginPanel } from '@nocturnium/svelte-ide';
  import { connect } from '@nocturnium/svelte-ide/stores';

  // Open the Server-Sent-Events stream the panel reads proposals from.
  connect('https://plugins.example.com/api/plugins/stream');
<${'/'}script>

<!-- Full plugin management UI: proposals, review, and available tabs. -->
<PluginPanel initialTab="proposals" />`;
</script>

<DemoPage
	eyebrow="Collaboration & AI"
	title="Plugins"
	description="Extensible architecture with proposal-based plugin management."
>
	<!-- Plugin Panel Demo -->
	<section class="component-section">
		<h2>Plugin Panel</h2>
		<p class="section-desc">Full plugin management interface with tabs</p>

		<DemoExhibit code={panelCode} language="svelte" filename="PluginPanel.svelte" padded={false}>
			<div class="panel-container">
				<PluginPanel initialTab="proposals" />
			</div>
		</DemoExhibit>
	</section>

	<!-- Plugin Cards -->
	<section class="component-section">
		<h2>Plugin Cards</h2>
		<p class="section-desc">Individual plugin display cards</p>

		<div class="cards-grid">
			{#each samplePlugins as plugin (plugin.id)}
				<PluginCard {plugin} />
			{/each}
		</div>
	</section>

	<!-- Status Badges -->
	<section class="component-section">
		<h2>Status Badges</h2>
		<p class="section-desc">Plugin lifecycle status indicators</p>

		<div class="status-groups">
			<div class="status-group">
				<span class="status-group-label">Lifecycle</span>
				<div class="status-grid">
					{#each lifecycleStatuses as status (status)}
						<div class="status-item">
							<PluginStatusBadge {status} />
							<span class="status-label">{status}</span>
						</div>
					{/each}
				</div>
			</div>
			<div class="status-group status-group--terminal">
				<span class="status-group-label">Terminal</span>
				<div class="status-grid">
					{#each terminalStatuses as status (status)}
						<div class="status-item">
							<PluginStatusBadge {status} />
							<span class="status-label">{status}</span>
						</div>
					{/each}
				</div>
			</div>
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
			<pre><code
					>{`// Connect to plugin system
import {
  connect,
  createProposal,
  loadPlugin,
  unloadPlugin
} from '@nocturnium/svelte-ide/stores';

// Connect to the backend's Server-Sent-Events stream.
// connect() is synchronous (void) and opens an EventSource over HTTP;
// it defaults to the same-origin '/api/plugins/stream'.
connect('https://plugins.example.com/api/plugins/stream');

// Create a new plugin proposal. createProposal is async and resolves
// to the new proposal's id (or null on failure).
const proposalId = await createProposal({
  name: 'My Plugin',
  description: 'Does something useful',
  category: 'utility',
  tags: ['helper', 'productivity'],
  author: 'you',
  parameters: { type: 'object', properties: {} },
  testCases: [],
  implementation: {
    type: 'module',
    entryPoint: 'execute',
    moduleCode: \`
      export async function execute(context) {
        // Plugin logic here
        return { success: true };
      }
    \`
  }
});

// Register a command. registerCommand(pluginId, command) takes the
// owning plugin's id plus a { id, title, handler } command.
import { registerCommand } from '@nocturnium/svelte-ide/stores';

registerCommand('my-plugin', {
  id: 'run',
  title: 'Run my plugin',
  handler: async () => {
    // Command logic
  }
});

// Load and unload plugins. loadPlugin is async; unloadPlugin is sync (void).
await loadPlugin('prettier-format');
unloadPlugin('prettier-format');`}</code
				></pre>
		</div>
	</section>
</DemoPage>

<style>
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
		overflow: hidden;
	}

	.cards-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.status-groups {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.status-group {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	/* Set terminal/negative states apart from the forward lifecycle. */
	.status-group--terminal {
		padding-top: 1rem;
		border-top: 1px solid var(--ide-border);
	}

	.status-group-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		/* Small (11px) section label — use the AA-safe secondary token, not the
		   ~3:1 muted token, so the group headings stay legible. */
		color: var(--ide-text-secondary);
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
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.category-card:hover {
		border-color: var(--ide-interactive);
		background: var(--ide-bg-tertiary);
	}

	.category-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ide-interactive);
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
		/* 12px description carries real taxonomy copy — keep it >=AA with the
		   secondary token rather than the washed-out muted token. */
		color: var(--ide-text-secondary);
		margin: 0;
	}

	.lifecycle {
		/* Single source of truth for the step circle size; the mobile rail
		   offsets below are derived from it so they stay self-correcting. */
		--step-circle: 28px;
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
		width: var(--step-circle);
		height: var(--step-circle);
		display: flex;
		align-items: center;
		justify-content: center;
		/* Filled accent disc with DARK (night) text — dark-on-wave passes AA, so
		   the standard interactive token is correct here (no -strong needed, which
		   is reserved for white-on-accent fills). */
		background: var(--ide-interactive);
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
		/* 12px lifecycle description — AA-safe secondary, not muted. */
		color: var(--ide-text-secondary);
		margin: 0;
	}

	.lifecycle-arrow {
		color: var(--ide-text-muted);
		font-size: 1.25rem;
	}

	.config-demo {
		background: var(--ide-bg-primary);
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
		.cards-grid {
			grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		}

		.categories-grid {
			grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		}
	}

	/* Mobile: keep the embedded panel and lifecycle legible on narrow screens */
	@media (max-width: 768px) {
		/* Give the embedded PluginPanel enough height to surface more proposal
		   rows so the page doesn't trap the user in a tiny nested scroll region,
		   while still capping it so it doesn't swallow short viewports. Let its
		   internal tab bar wrap rather than cramming onto one line. */
		.panel-container {
			height: min(78vh, 500px);
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
			/* The contiguous left borders (gap is 0) form one unbroken rail. */
			border-left: 2px solid var(--ide-border);
			border-top: none;
			border-right: none;
			border-bottom: none;
			background: transparent;
			/* Offsets are derived from the circle size so a font/padding tweak
			   can't drift the numbers off the rail. */
			padding: 0.625rem 0.75rem 0.625rem calc(var(--step-circle) / 2 + 0.75rem);
			margin-left: calc(var(--step-circle) / 2);
		}

		.lifecycle-step:first-child {
			padding-top: 0;
		}

		.lifecycle-step:last-child {
			padding-bottom: 0;
		}

		.step-number {
			position: absolute;
			/* Center the circle horizontally on the 2px rail (its center sits
			   1px inside the padding box, hence the -1px). */
			left: calc(var(--step-circle) / -2 - 1px);
			top: 0.5rem;
		}
	}

	/* Phones */
	@media (max-width: 640px) {
		.cards-grid {
			grid-template-columns: 1fr;
		}

		/* On the narrowest phones, drop the cramped two-up icon grid for a
		   single-column labeled list: icon on the left, name + description
		   left-aligned and comfortably legible — reads as taxonomy, not filler. */
		.categories-grid {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}

		.category-card {
			display: grid;
			grid-template-columns: auto 1fr;
			align-items: center;
			column-gap: 0.875rem;
			text-align: left;
			padding: 0.75rem 0.875rem;
		}

		.category-icon {
			grid-row: 1 / span 2;
			margin-bottom: 0;
		}

		.category-card strong {
			margin-bottom: 0.125rem;
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
