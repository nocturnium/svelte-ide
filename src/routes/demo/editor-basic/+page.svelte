<script lang="ts">
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import type { EditorPreferences } from '$types';

	type Sample = {
		label: string;
		language: string;
		content: string;
	};

	const samples: Sample[] = [
		{
			label: 'TypeScript',
			language: 'typescript',
			content: `interface User {
  id: number;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
}

const users: User[] = [
  { id: 1, name: 'Ada Lovelace', role: 'admin' },
  { id: 2, name: 'Grace Hopper', role: 'editor' },
  { id: 3, name: 'Katherine Johnson', role: 'viewer' }
];

function formatUser(user: User): string {
  const label = user.role === 'admin' ? 'Owner' : 'Member';
  return \`\${label}: \${user.name}\`;
}

for (const user of users) {
  console.log(formatUser(user));
}

export function findUser(id: number): User | undefined {
  return users.find((user) => user.id === id);
}
`
		},
		{
			label: 'JavaScript',
			language: 'javascript',
			content: `const queue = ['compile', 'test', 'package'];
const completed = new Set();

async function runPipeline(tasks) {
  for (const task of tasks) {
    console.log('Running ' + task);
    await Promise.resolve(task);
    completed.add(task);
  }

  return {
    ok: completed.size === tasks.length,
    finishedAt: new Date().toISOString()
  };
}

runPipeline(queue).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});
`
		},
		{
			label: 'Python',
			language: 'python',
			content: `from dataclasses import dataclass
from typing import Iterable


@dataclass
class User:
    id: int
    name: str
    role: str


def active_names(users: Iterable[User]) -> list[str]:
    names: list[str] = []
    for user in users:
        if user.role != "archived":
            names.append(user.name.upper())
    return names


users = [
    User(1, "Ada Lovelace", "admin"),
    User(2, "Grace Hopper", "editor"),
]

print(active_names(users))
`
		},
		{
			label: 'JSON',
			language: 'json',
			content: `{
  "project": "svelte-ide",
  "version": "1.0.1",
  "features": {
    "lineNumbers": true,
    "syntaxHighlighting": true,
    "languages": ["typescript", "javascript", "python", "json"]
  },
  "users": [
    { "id": 1, "name": "Ada Lovelace", "role": "admin" },
    { "id": 2, "name": "Grace Hopper", "role": "editor" }
  ],
  "updated": "2026-06-08T12:00:00Z"
}
`
		},
		{
			label: 'HTML',
			language: 'html',
			content: `<section class="profile-card">
  <h1>Editor Harness</h1>
  <p data-state="ready">Syntax highlighting is active.</p>
  <button type="button" aria-label="Run demo">Run</button>
</section>
`
		},
		{
			label: 'CSS',
			language: 'css',
			content: `.profile-card {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  color: var(--ide-text-primary);
  border: 1px solid var(--ide-border);
}

.profile-card button:hover {
  background: var(--ide-bg-hover);
}
`
		},
		{
			label: 'Go',
			language: 'go',
			content: `package main

import "fmt"

type User struct {
	ID   int
	Name string
	Role string
}

func main() {
	users := []User{{ID: 1, Name: "Ada", Role: "admin"}}
	for _, user := range users {
		fmt.Printf("%s:%s\\n", user.Role, user.Name)
	}
}
`
		},
		{
			label: 'Markdown',
			language: 'markdown',
			content: `# Editor Harness

- Stable route for e2e coverage
- Real line numbers and syntax tokens
- Deterministic language samples

\`\`\`ts
const ready = true;
\`\`\`
`
		}
	];

	let activeSample = $state(samples[0]);
	let content = $state(samples[0].content);

	const preferences: Partial<EditorPreferences> = {
		lineNumbers: 'on',
		insertSpaces: true,
		tabSize: 2,
		wordWrap: 'off'
	};

	function selectSample(sample: Sample) {
		activeSample = sample;
		content = sample.content;
	}
</script>

<svelte:head>
	<title>Basic Editor Demo | Nocturnium Svelte IDE</title>
</svelte:head>

<main class="editor-basic">
	<header class="editor-basic__header">
		<p class="editor-basic__eyebrow">Stable editor harness</p>
		<h1>Basic Code Editor</h1>
	</header>

	<div class="language-switcher" aria-label="Choose editor language">
		{#each samples as sample (sample.language)}
			<button
				type="button"
				class:active={activeSample.language === sample.language}
				class="language-btn"
				aria-pressed={activeSample.language === sample.language}
				onclick={() => selectSample(sample)}
			>
				{sample.label}
			</button>
		{/each}
	</div>

	<div class="editor-container" style="height: 480px">
		<CustomEditor
			bind:content
			language={activeSample.language}
			{preferences}
			complexityHighlighting={false}
			showAIFocusRegions={false}
		/>
	</div>
</main>

<style>
	.editor-basic {
		display: flex;
		flex-direction: column;
		gap: var(--ide-spacing-lg);
		max-width: 980px;
		margin: 0 auto;
		padding: var(--ide-spacing-2xl);
	}

	.editor-basic__header {
		display: grid;
		gap: var(--ide-spacing-xs);
	}

	.editor-basic__eyebrow {
		margin: 0;
		color: var(--ide-accent);
		font-size: var(--ide-font-size-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.editor-basic h1 {
		margin: 0;
		color: var(--ide-text-primary);
		font-size: var(--ide-font-size-3xl);
		font-weight: 800;
	}

	.language-switcher {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ide-spacing-sm);
	}

	.language-btn {
		padding: var(--ide-spacing-xs) var(--ide-spacing-md);
		color: var(--ide-text-secondary);
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-md);
		font: inherit;
		font-size: var(--ide-font-size-sm);
		cursor: pointer;
		transition:
			color var(--ide-transition-fast),
			background var(--ide-transition-fast),
			border-color var(--ide-transition-fast);
	}

	.language-btn:hover {
		color: var(--ide-text-primary);
		background: var(--ide-bg-hover);
	}

	.language-btn.active {
		color: var(--ide-accent-strong);
		background: color-mix(in srgb, var(--ide-accent) 14%, var(--ide-bg-secondary));
		border-color: color-mix(in srgb, var(--ide-accent) 55%, var(--ide-border));
	}

	.language-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.editor-container {
		overflow: hidden;
		border: 1px solid var(--ide-border);
		border-radius: var(--ide-radius-lg);
		background: var(--ide-bg-primary);
		box-shadow: var(--ide-shadow-md);
	}

	@media (max-width: 640px) {
		.editor-basic {
			padding: var(--ide-spacing-xl) var(--ide-spacing-lg);
		}
	}
</style>
