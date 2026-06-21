<script lang="ts">
	import DemoPage from '../_components/DemoPage.svelte';
	import CodeSnippet from './CodeSnippet.svelte';
	import samples from './samples.json';

	const totalLanguages = samples.groups.reduce((n, g) => n + g.items.length, 0);

	let copiedId = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	async function copy(id: string, code: string) {
		try {
			await navigator.clipboard.writeText(code);
		} catch {
			// Fallback for clipboard-restricted contexts.
			const ta = document.createElement('textarea');
			ta.value = code;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			try {
				document.execCommand('copy');
			} catch {
				/* no-op */
			}
			ta.remove();
		}
		copiedId = id;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copiedId = null), 1600);
	}
</script>

<DemoPage
	eyebrow="Syntax Highlighting"
	title="Language Gallery"
	description="{totalLanguages} languages, highlighted by the editor's own zero-dependency tokenizer — no Prism, no Highlight.js, no CodeMirror grammar packs."
	metaDescription="Nocturnium Svelte IDE highlights {totalLanguages} languages out of the box — JavaScript, TypeScript, Python, Rust, Go, Java, C/C++, C#, Ruby, PHP, SQL, YAML, and more — with a built-in zero-dependency tokenizer."
>
	<p class="intro">
		Every snippet below is rendered by the same tokenizer that powers the editor — pure,
		synchronous, and SSR-safe, so it highlights {totalLanguages} languages on first paint with zero extra
		dependencies. Detection maps file extensions to these automatically (open a <code>.rs</code>,
		<code>.sql</code>, or <code>.yaml</code> file and it just works).
	</p>

	<div class="stats">
		<span class="stats__item"><strong>{totalLanguages}</strong> languages</span>
		<span class="stats__sep" aria-hidden="true">·</span>
		<span class="stats__item"><strong>0</strong> runtime dependencies</span>
		<span class="stats__sep" aria-hidden="true">·</span>
		<span class="stats__item">SSR-safe</span>
	</div>

	{#each samples.groups as group (group.group)}
		<section class="lang-group">
			<h2 class="lang-group__title">
				{group.group}<span class="lang-group__count">{group.items.length}</span>
			</h2>
			<div class="lang-grid">
				{#each group.items as lang (lang.id)}
					<article class="lang-card">
						<header class="lang-card__head">
							<span class="lang-card__name">{lang.name}</span>
							<span class="lang-card__id">{lang.id}</span>
							<button
								type="button"
								class="lang-card__copy"
								class:lang-card__copy--done={copiedId === lang.id}
								onclick={() => copy(lang.id, lang.code)}
								aria-label="Copy {lang.name} snippet"
							>
								{copiedId === lang.id ? 'Copied' : 'Copy'}
							</button>
						</header>
						<CodeSnippet code={lang.code} language={lang.id} />
					</article>
				{/each}
			</div>
		</section>
	{/each}

	<p class="scope-note">
		Every language here gets full syntax highlighting, file-type detection, and comment-toggle.
		Structural editing (folding, bracket matching) works across the brace-based languages; the
		deeper refactoring tools — extract function, organize imports — are currently tuned for
		JavaScript &amp; TypeScript.
	</p>
</DemoPage>

<style>
	.intro {
		margin: 0 0 8px;
		max-width: 70ch;
		font-size: 15px;
		line-height: 1.6;
		color: var(--ide-text-secondary, #c4d2ec);
	}
	.intro code {
		font-family: var(--ide-font-mono, ui-monospace, monospace);
		font-size: 0.88em;
		color: var(--ide-interactive, #4a8db7);
		background: var(--ide-bg-secondary, #131c2e);
		padding: 1px 5px;
		border-radius: 4px;
	}

	.lang-group {
		margin-top: 36px;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 10px;
		margin: 14px 0 4px;
		font-size: 13px;
		color: var(--ide-text-muted, #93a4c3);
	}
	.stats__item strong {
		color: var(--ide-text-primary, #e8eefc);
		font-size: 16px;
		font-weight: 700;
	}
	.stats__sep {
		color: var(--ide-text-subtle, #64748b);
	}

	.lang-group__title {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 16px;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ide-text-muted, #93a4c3);
		padding-bottom: 8px;
		border-bottom: 1px solid var(--ide-border-subtle, #233148);
	}
	.lang-group__count {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0;
		color: var(--ide-text-subtle, #64748b);
		background: var(--ide-bg-secondary, #131c2e);
		border: 1px solid var(--ide-border-subtle, #233148);
		border-radius: 999px;
		padding: 1px 8px;
	}

	.lang-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
		gap: 16px;
		align-items: start;
	}

	.lang-card {
		border: 1px solid var(--ide-border-subtle, #233148);
		border-radius: 10px;
		overflow: hidden;
		background: var(--ide-bg-secondary, #131c2e);
		transition:
			border-color 0.15s ease,
			transform 0.15s ease;
	}
	.lang-card:hover {
		border-color: var(--ide-interactive, #4a8db7);
		transform: translateY(-2px);
	}

	.lang-card__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--ide-border-subtle, #233148);
		background: var(--ide-bg-primary, #0d1421);
	}
	.lang-card__name {
		font-size: 14px;
		font-weight: 600;
		color: var(--ide-text-primary, #e8eefc);
	}
	.lang-card__id {
		margin-left: auto;
		font-family: var(--ide-font-mono, ui-monospace, monospace);
		font-size: 11px;
		color: var(--ide-text-subtle, #64748b);
	}
	.lang-card__copy {
		flex-shrink: 0;
		font-size: 11px;
		font-weight: 600;
		color: var(--ide-text-muted, #93a4c3);
		background: var(--ide-bg-secondary, #131c2e);
		border: 1px solid var(--ide-border-subtle, #233148);
		border-radius: 6px;
		padding: 2px 9px;
		cursor: pointer;
		transition:
			color 0.12s ease,
			border-color 0.12s ease;
	}
	.lang-card__copy:hover {
		color: var(--ide-text-primary, #e8eefc);
		border-color: var(--ide-interactive, #4a8db7);
	}
	.lang-card__copy--done {
		color: var(--ide-success, #6ee7b7);
		border-color: var(--ide-success, #6ee7b7);
	}

	.scope-note {
		margin: 40px 0 0;
		max-width: 70ch;
		padding-top: 16px;
		border-top: 1px solid var(--ide-border-subtle, #233148);
		font-size: 13px;
		line-height: 1.6;
		color: var(--ide-text-muted, #93a4c3);
	}

	@media (max-width: 720px) {
		.lang-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
