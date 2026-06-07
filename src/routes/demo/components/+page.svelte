<script lang="ts">
	import Button from '$lib/components/core/Button.svelte';
	import Input from '$lib/components/core/Input.svelte';
	import Textarea from '$lib/components/core/Textarea.svelte';
	import Badge from '$lib/components/core/Badge.svelte';
	import Spinner from '$lib/components/core/Spinner.svelte';
	import Kbd from '$lib/components/core/Kbd.svelte';
	import Avatar from '$lib/components/core/Avatar.svelte';
	import Tooltip from '$lib/components/core/Tooltip.svelte';

	let inputValue = $state('');
	let textareaValue = $state('');
	let isLoading = $state(false);

	function simulateLoading() {
		isLoading = true;
		setTimeout(() => (isLoading = false), 2000);
	}
</script>

<div class="demo-page">
	<header class="page-header">
		<h1>Core Components</h1>
		<p>Essential UI building blocks for the IDE</p>
	</header>

	<!-- Buttons Section -->
	<section class="component-section">
		<h2>Button</h2>
		<p class="section-desc">Versatile button component with multiple variants and states</p>

		<div class="demo-group">
			<h3>Variants</h3>
			<div class="demo-row">
				<Button variant="primary">Primary</Button>
				<Button variant="secondary">Secondary</Button>
				<Button variant="ghost">Ghost</Button>
				<Button variant="danger">Danger</Button>
			</div>
		</div>

		<div class="demo-group">
			<h3>Sizes</h3>
			<div class="demo-row">
				<Button size="sm">Small</Button>
				<Button size="md">Medium</Button>
				<Button size="lg">Large</Button>
			</div>
		</div>

		<div class="demo-group">
			<h3>States</h3>
			<div class="demo-row">
				<Button disabled>Disabled</Button>
				<Button loading>Loading</Button>
				<Button onclick={simulateLoading} loading={isLoading}>
					{isLoading ? 'Working...' : 'Click Me'}
				</Button>
			</div>
		</div>

		<div class="demo-group">
			<h3>Icon Buttons</h3>
			<div class="demo-row">
				<Button variant="ghost" size="sm">+ Add</Button>
				<Button variant="ghost" size="sm">✓ Save</Button>
				<Button variant="danger" size="sm">✕ Delete</Button>
			</div>
		</div>
	</section>

	<!-- Input Section -->
	<section class="component-section">
		<h2>Input</h2>
		<p class="section-desc">Text input fields with validation states</p>

		<div class="demo-group">
			<h3>Basic</h3>
			<div class="input-demos">
				<Input placeholder="Enter text..." bind:value={inputValue} />
				<label class="field">
					<span class="field__label">Username</span>
					<Input placeholder="With label" />
				</label>
				<Input placeholder="Disabled" disabled />
			</div>
		</div>

		<div class="demo-group">
			<h3>States</h3>
			<div class="input-demos">
				<Input placeholder="Error state" error="This field is required" />
				<Input placeholder="Success state" />
				<label class="field">
					<Input placeholder="With helper" />
					<span class="field__helper">Must be at least 8 characters</span>
				</label>
			</div>
		</div>

		<div class="demo-group">
			<h3>Types</h3>
			<div class="input-demos">
				<label class="field">
					<span class="field__label">Password</span>
					<Input type="password" placeholder="Password" />
				</label>
				<label class="field">
					<span class="field__label">Email</span>
					<Input type="email" placeholder="email@example.com" />
				</label>
				<label class="field">
					<span class="field__label">Count</span>
					<Input type="number" placeholder="0" />
				</label>
			</div>
		</div>
	</section>

	<!-- Textarea Section -->
	<section class="component-section">
		<h2>Textarea</h2>
		<p class="section-desc">Multi-line text input</p>

		<div class="demo-group">
			<div class="input-demos">
				<Textarea placeholder="Enter your message..." bind:value={textareaValue} rows={4} />
				<label class="field">
					<span class="field__label">Description</span>
					<Textarea placeholder="With label" rows={3} />
				</label>
				<Textarea placeholder="Disabled" disabled rows={3} />
			</div>
		</div>
	</section>

	<!-- Badge Section -->
	<section class="component-section">
		<h2>Badge</h2>
		<p class="section-desc">Status indicators and labels</p>

		<div class="demo-group">
			<h3>Variants</h3>
			<div class="demo-row">
				<Badge>Default</Badge>
				<Badge variant="primary">Primary</Badge>
				<Badge variant="success">Success</Badge>
				<Badge variant="warning">Warning</Badge>
				<Badge variant="danger">Danger</Badge>
				<Badge variant="info">Info</Badge>
			</div>
		</div>

		<div class="demo-group">
			<h3>Use Cases</h3>
			<div class="demo-row">
				<Badge variant="success">Deployed</Badge>
				<Badge variant="warning">Pending</Badge>
				<Badge variant="danger">Failed</Badge>
				<Badge variant="info">v1.2.3</Badge>
				<Badge variant="primary">New</Badge>
			</div>
		</div>
	</section>

	<!-- Spinner Section -->
	<section class="component-section">
		<h2>Spinner</h2>
		<p class="section-desc">Loading indicators</p>

		<div class="demo-group">
			<h3>Sizes</h3>
			<div class="demo-row">
				<Spinner size="sm" />
				<Spinner size="md" />
				<Spinner size="lg" />
			</div>
		</div>
	</section>

	<!-- Kbd Section -->
	<section class="component-section">
		<h2>Keyboard Shortcuts</h2>
		<p class="section-desc">Display keyboard shortcuts and key combinations</p>

		<div class="demo-group">
			<div class="demo-row">
				<Kbd keys={['Ctrl', 'S']} />
				<span class="kbd-label">Save</span>
			</div>
			<div class="demo-row">
				<Kbd keys={['Ctrl', 'Shift', 'P']} />
				<span class="kbd-label">Command Palette</span>
			</div>
			<div class="demo-row">
				<Kbd keys={['Esc']} />
				<span class="kbd-label">Close Panel</span>
			</div>
		</div>
	</section>

	<!-- Avatar Section -->
	<section class="component-section">
		<h2>Avatar</h2>
		<p class="section-desc">User avatars for collaboration</p>

		<div class="demo-group">
			<h3>Sizes</h3>
			<div class="demo-row">
				<Avatar name="Alice" size="sm" />
				<Avatar name="Bob" size="md" />
				<Avatar name="Charlie" size="lg" />
			</div>
		</div>

		<div class="demo-group">
			<h3>With Colors</h3>
			<div class="demo-row">
				<Avatar name="Alice" color="#4a9eff" />
				<Avatar name="Bob" color="#22c55e" />
				<Avatar name="Charlie" color="#f59e0b" />
				<Avatar name="Diana" color="#ef4444" />
				<Avatar name="Eve" color="#a855f7" />
			</div>
		</div>

		<div class="demo-group">
			<h3>AI User</h3>
			<div class="demo-row">
				<Avatar name="Claude" isAI />
				<span class="avatar-label">AI Assistant</span>
			</div>
		</div>
	</section>

	<!-- Tooltip Section -->
	<section class="component-section">
		<h2>Tooltip</h2>
		<p class="section-desc">Contextual information on hover</p>

		<div class="demo-group">
			<h3>Positions</h3>
			<div class="demo-row tooltip-row">
				<Tooltip content="Tooltip on top" position="top">
					<Button variant="ghost">Top</Button>
				</Tooltip>
				<Tooltip content="Tooltip on right" position="right">
					<Button variant="ghost">Right</Button>
				</Tooltip>
				<Tooltip content="Tooltip on bottom" position="bottom">
					<Button variant="ghost">Bottom</Button>
				</Tooltip>
				<Tooltip content="Tooltip on left" position="left">
					<Button variant="ghost">Left</Button>
				</Tooltip>
			</div>
		</div>
	</section>
</div>

<style>
	.demo-page {
		padding: 2rem 3rem;
		max-width: 1000px;
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

	.demo-group {
		margin-bottom: 1.5rem;
	}

	.demo-group h3 {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--ide-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.75rem;
	}

	.demo-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}

	.tooltip-row {
		gap: 1.5rem;
	}

	.input-demos {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 400px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field__label {
		font-size: 0.875rem;
		color: var(--ide-text-secondary);
	}

	.field__helper {
		font-size: 0.75rem;
		color: var(--ide-text-muted);
	}

	.kbd-label {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin-left: 0.5rem;
	}

	.avatar-label {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin-left: 0.5rem;
	}
</style>
