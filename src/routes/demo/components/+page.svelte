<script lang="ts">
	import { base } from '$app/paths';
	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
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

	const buttonCode = `<script lang="ts">
  import { Button } from '@nocturnium/svelte-ide';
<${'/'}script>

<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Danger</Button>

<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

<Button disabled>Disabled</Button>
<Button loading>Loading</Button>
<Button icon={iconPlus}>Add</Button>`;

	const inputCode = `<script lang="ts">
  import { Input } from '@nocturnium/svelte-ide';
  let value = $state('');
<${'/'}script>

<Input placeholder="Enter text..." bind:value />
<Input placeholder="Disabled" disabled />

<!-- error is a first-class prop -->
<Input placeholder="Error state" error="This field is required" />
<Input type="password" placeholder="Password" />`;

	const textareaCode = `<script lang="ts">
  import { Textarea } from '@nocturnium/svelte-ide';
  let value = $state('');
<${'/'}script>

<Textarea placeholder="Enter your message..." bind:value rows={4} />
<Textarea placeholder="Disabled" disabled rows={3} />`;

	const badgeCode = `<Badge>Default</Badge>
<Badge variant="primary">Primary</Badge>
<Badge variant="success">Deployed</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Failed</Badge>
<Badge variant="info">v1.2.3</Badge>`;

	const spinnerCode = `<Spinner size="sm" />
<Spinner size="md" />
<Spinner size="lg" />`;

	const kbdCode = `<Kbd keys={['Ctrl', 'S']} />
<Kbd keys={['Ctrl', 'Shift', 'P']} />
<Kbd keys={['Esc']} />`;

	const avatarCode = `<Avatar name="Alice" size="sm" />
<Avatar name="Bob" size="md" />
<Avatar name="Charlie" size="lg" />

<Avatar name="Alice" color="var(--ide-collab-cursor-1)" />

<!-- AI participant -->
<Avatar name="Claude" isAI />`;

	const tooltipCode = `<Tooltip content="Tooltip on top" position="top">
  <Button variant="ghost">Top</Button>
</Tooltip>
<Tooltip content="Tooltip on right" position="right">
  <Button variant="ghost">Right</Button>
</Tooltip>`;
</script>

{#snippet iconPlus()}
	<svg
		width="1em"
		height="1em"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<line x1="12" y1="5" x2="12" y2="19" />
		<line x1="5" y1="12" x2="19" y2="12" />
	</svg>
{/snippet}

{#snippet iconCheck()}
	<svg
		width="1em"
		height="1em"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<polyline points="20 6 9 17 4 12" />
	</svg>
{/snippet}

{#snippet iconX()}
	<svg
		width="1em"
		height="1em"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<line x1="18" y1="6" x2="6" y2="18" />
		<line x1="6" y1="6" x2="18" y2="18" />
	</svg>
{/snippet}

<DemoPage
	eyebrow="Core UI"
	title="Core Components"
	description="The essential UI primitives — buttons, inputs, badges, and more. Every example pairs the live component with its copy-paste source."
>
	<!-- Button -->
	<section class="component-section">
		<h2>Button</h2>
		<p class="section-desc">Versatile button component with multiple variants and states</p>
		<DemoExhibit code={buttonCode} language="svelte">
			<div class="gallery">
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
						<Button variant="ghost" size="sm" icon={iconPlus}>Add</Button>
						<Button variant="ghost" size="sm" icon={iconCheck}>Save</Button>
						<Button variant="danger" size="sm" icon={iconX}>Delete</Button>
					</div>
				</div>
			</div>
		</DemoExhibit>
	</section>

	<!-- Input -->
	<section class="component-section">
		<h2>Input</h2>
		<p class="section-desc">Text input fields with validation states</p>
		<DemoExhibit code={inputCode} language="svelte">
			<div class="gallery">
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
						<label class="field input-success">
							<Input placeholder="Composed success styling" />
							<span class="field__success"
								>{@render iconCheck()} Looks good (composed, not a prop)</span
							>
						</label>
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
			</div>
		</DemoExhibit>
	</section>

	<!-- Textarea -->
	<section class="component-section">
		<h2>Textarea</h2>
		<p class="section-desc">Multi-line text input</p>
		<DemoExhibit code={textareaCode} language="svelte">
			<div class="input-demos">
				<Textarea placeholder="Enter your message..." bind:value={textareaValue} rows={4} />
				<label class="field">
					<span class="field__label">Description</span>
					<Textarea placeholder="With label" rows={3} />
				</label>
				<Textarea placeholder="Disabled" disabled rows={3} />
			</div>
		</DemoExhibit>
	</section>

	<!-- Badge -->
	<section class="component-section">
		<h2>Badge</h2>
		<p class="section-desc">Status indicators and labels</p>
		<DemoExhibit code={badgeCode} language="svelte">
			<div class="gallery">
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
			</div>
		</DemoExhibit>
	</section>

	<!-- Spinner -->
	<section class="component-section">
		<h2>Spinner</h2>
		<p class="section-desc">Loading indicators</p>
		<DemoExhibit code={spinnerCode} language="svelte">
			<div class="demo-row">
				<Spinner size="sm" />
				<Spinner size="md" />
				<Spinner size="lg" />
			</div>
		</DemoExhibit>
	</section>

	<!-- Kbd -->
	<section class="component-section">
		<h2>Keyboard Shortcuts</h2>
		<p class="section-desc">Display keyboard shortcuts and key combinations</p>
		<DemoExhibit code={kbdCode} language="svelte">
			<div class="kbd-stack">
				<div class="demo-row"><Kbd keys={['Ctrl', 'S']} /><span class="kbd-label">Save</span></div>
				<div class="demo-row">
					<Kbd keys={['Ctrl', 'Shift', 'P']} /><span class="kbd-label">Command Palette</span>
				</div>
				<div class="demo-row"><Kbd keys={['Esc']} /><span class="kbd-label">Close Panel</span></div>
			</div>
		</DemoExhibit>
	</section>

	<!-- Avatar -->
	<section class="component-section">
		<h2>Avatar</h2>
		<p class="section-desc">User avatars for collaboration</p>
		<DemoExhibit code={avatarCode} language="svelte">
			<div class="gallery">
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
						<Avatar name="Alice" color="var(--ide-collab-cursor-1)" />
						<Avatar name="Bob" color="var(--ide-collab-cursor-3)" />
						<Avatar name="Charlie" color="var(--ide-collab-cursor-5)" />
						<Avatar name="Diana" color="var(--ide-collab-cursor-4)" />
						<Avatar name="Eve" color="var(--ide-collab-cursor-2)" />
					</div>
				</div>
				<div class="demo-group">
					<h3>AI User</h3>
					<div class="demo-row">
						<Avatar name="Claude" isAI />
						<span class="avatar-label">AI Assistant</span>
					</div>
				</div>
			</div>
		</DemoExhibit>
	</section>

	<!-- Tooltip -->
	<section class="component-section">
		<h2>Tooltip</h2>
		<p class="section-desc">Contextual information on hover</p>
		<DemoExhibit code={tooltipCode} language="svelte">
			<div class="demo-row tooltip-row">
				<Tooltip content="Tooltip on top" position="top">
					<Button variant="ghost" aria-label="Hover to show a tooltip above the button">Top</Button>
				</Tooltip>
				<Tooltip content="Tooltip on right" position="right">
					<Button variant="ghost" aria-label="Hover to show a tooltip to the right of the button">
						Right
					</Button>
				</Tooltip>
				<Tooltip content="Tooltip on bottom" position="bottom">
					<Button variant="ghost" aria-label="Hover to show a tooltip below the button">
						Bottom
					</Button>
				</Tooltip>
				<Tooltip content="Tooltip on left" position="left">
					<Button variant="ghost" aria-label="Hover to show a tooltip to the left of the button">
						Left
					</Button>
				</Tooltip>
			</div>
		</DemoExhibit>
	</section>

	<footer class="page-footer">
		<a class="footer-next" href={`${base}/demo/resize`}>
			<span class="footer-next__label">Next</span>
			<span class="footer-next__title">Resizable Panes</span>
			<span class="footer-next__arrow" aria-hidden="true">&rarr;</span>
		</a>
		<a
			class="footer-source"
			href="https://github.com/nocturnium/svelte-ide"
			target="_blank"
			rel="noopener"
		>
			<span aria-hidden="true">&#9733;</span>
			<span>Full source on GitHub</span>
		</a>
	</footer>
</DemoPage>

<style>
	.component-section h2 {
		font-size: var(--ide-font-size-xl);
		font-weight: 600;
		color: var(--ide-text-primary);
		margin: 0 0 0.25rem;
	}

	.section-desc {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin: 0 0 1rem;
	}

	.gallery {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.demo-group h3 {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--ide-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 0.75rem;
	}

	.demo-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}

	.tooltip-row {
		gap: 1.5rem;
		margin-top: 2rem;
	}

	.input-demos {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 400px;
	}

	.kbd-stack {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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
		color: var(--ide-text-secondary);
	}

	.input-success :global(.ide-input) {
		border-color: var(--ide-success);
	}

	.field__success {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.75rem;
		color: var(--ide-success);
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

	.page-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--ide-border);
	}

	.footer-next {
		display: inline-flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		text-decoration: none;
		transition:
			border-color var(--ide-transition-fast),
			background var(--ide-transition-fast);
	}

	.footer-next:hover {
		border-color: var(--ide-interactive);
		background: var(--ide-bg-secondary);
	}

	.footer-next__label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ide-text-secondary);
	}

	.footer-next__title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--ide-text-primary);
	}

	.footer-next__arrow {
		color: var(--ide-interactive);
		font-weight: 600;
	}

	.footer-source {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.875rem;
		color: var(--ide-text-secondary);
		text-decoration: none;
		transition: color var(--ide-transition-fast);
	}

	.footer-source:hover {
		color: var(--ide-text-primary);
	}

	.footer-next:focus-visible,
	.footer-source:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}
</style>
