/**
 * Mock plugin-host Component API
 * GET - Fetch plugin component code
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Mock component templates
const mockComponents: Record<string, string> = {
	'git-panel': `<script lang="ts">
  let branch = $state('main');
  let changes = $state([
    { file: 'src/app.ts', status: 'modified' },
    { file: 'src/utils.ts', status: 'added' }
  ]);
  let staged = $state<string[]>([]);

  function stageFile(file: string) {
    staged = [...staged, file];
  }

  function unstageFile(file: string) {
    staged = staged.filter(f => f !== file);
  }

  function commit() {
    alert('Committing: ' + staged.join(', '));
    staged = [];
  }
</script>

<div class="git-panel">
  <div class="branch">
    <span>Branch:</span>
    <strong>{branch}</strong>
  </div>

  <div class="changes">
    <h4>Changes ({changes.length})</h4>
    {#each changes as change}
      <div class="change-item">
        <span class="status {change.status}">{change.status[0].toUpperCase()}</span>
        <span class="file">{change.file}</span>
        {#if staged.includes(change.file)}
          <button onclick={() => unstageFile(change.file)}>Unstage</button>
        {:else}
          <button onclick={() => stageFile(change.file)}>Stage</button>
        {/if}
      </div>
    {/each}
  </div>

  {#if staged.length > 0}
    <button class="commit-btn" onclick={commit}>
      Commit {staged.length} file(s)
    </button>
  {/if}
</div>

<style>
  .git-panel { padding: 1rem; }
  .branch { margin-bottom: 1rem; }
  .changes h4 { margin: 0 0 0.5rem; }
  .change-item { display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem 0; }
  .status { width: 20px; text-align: center; font-weight: bold; }
  .status.modified { color: orange; }
  .status.added { color: green; }
  .file { flex: 1; font-family: monospace; font-size: 0.875rem; }
  .commit-btn { margin-top: 1rem; }
</style>`,

	'terminal': `<script lang="ts">
  let output = $state<string[]>(['$ Welcome to the terminal']);
  let input = $state('');

  function handleCommand() {
    if (!input.trim()) return;

    output = [...output, '$ ' + input];

    // Mock command responses
    if (input === 'ls') {
      output = [...output, 'src/  node_modules/  package.json  README.md'];
    } else if (input === 'pwd') {
      output = [...output, '/home/user/project'];
    } else if (input.startsWith('echo ')) {
      output = [...output, input.slice(5)];
    } else if (input === 'clear') {
      output = [];
    } else {
      output = [...output, 'Command not found: ' + input];
    }

    input = '';
  }
</script>

<div class="terminal">
  <div class="output">
    {#each output as line}
      <div>{line}</div>
    {/each}
  </div>
  <div class="input-line">
    <span>$</span>
    <input
      type="text"
      bind:value={input}
      onkeydown={(e) => e.key === 'Enter' && handleCommand()}
      placeholder="Enter command..."
    />
  </div>
</div>

<style>
  .terminal {
    background: #1a1a1a;
    color: #00ff00;
    font-family: monospace;
    padding: 1rem;
    height: 300px;
    display: flex;
    flex-direction: column;
  }
  .output { flex: 1; overflow-y: auto; }
  .output div { margin: 0.25rem 0; }
  .input-line { display: flex; gap: 0.5rem; }
  .input-line input {
    flex: 1;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    outline: none;
  }
</style>`,

	default: `<script lang="ts">
  let count = $state(0);
</script>

<div class="plugin-panel">
  <h3>Plugin Panel</h3>
  <p>Count: {count}</p>
  <button onclick={() => count++}>Increment</button>
</div>

<style>
  .plugin-panel {
    padding: 1rem;
    text-align: center;
  }
</style>`
};

export const GET: RequestHandler = async ({ params, url }) => {
	const { id } = params;
	const path = url.searchParams.get('path') || '';

	// Determine which component to return based on path or id
	let componentKey = 'default';
	if (path.includes('git')) componentKey = 'git-panel';
	else if (path.includes('terminal')) componentKey = 'terminal';
	else if (id.includes('git')) componentKey = 'git-panel';
	else if (id.includes('terminal')) componentKey = 'terminal';

	const code = mockComponents[componentKey] || mockComponents.default;

	return json({
		success: true,
		pluginId: id,
		component: {
			path,
			code,
			language: 'svelte'
		}
	});
};
