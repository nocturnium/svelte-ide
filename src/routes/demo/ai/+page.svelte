<script lang="ts" module>
	import { browser } from '$app/environment';
	import { streamMockResponse } from '$lib/services/mock-ai';

	/**
	 * Scoped, idempotent static-host chat mock.
	 *
	 * On GitHub Pages there is no backend, so the AI store's `/api/chat` fetch
	 * (fired when a user sends a message in the embedded <AIPanel>) would fail and
	 * surface a red error band. The store performs a raw `fetch(endpoint)` with no
	 * injection hook, so the only way to keep the demo alive without a backend is
	 * to intercept that one request — but *scoped*, not by mutating the global.
	 *
	 * On a static host `/api/chat` does not 404 cleanly: the SPA fallback returns
	 * the app shell as **HTML with status 200**, so trusting `res.ok` would stream
	 * HTML into <AIPanel> instead of a reply. We therefore **short-circuit**: a
	 * matching `/api/chat` request returns the canned streamed Response directly,
	 * never awaiting the real fetch.
	 *
	 * Lifecycle hardening:
	 *  - gated by a module-level sentinel (`chatMockRefCount`) so repeated SPA
	 *    re-mounts do not stack wrappers,
	 *  - torn down via the returned restore() from the page's `onDestroy`, which
	 *    fires on SPA navigation away (no leak across routes), and
	 *  - teardown is identity-guarded: we only restore the saved global if it is
	 *    still the wrapper this scope installed (don't clobber a newer overlay).
	 */
	let chatMockRefCount = 0;
	let savedChatFetch: typeof globalThis.fetch | null = null;
	let installedChatFetch: typeof globalThis.fetch | null = null;

	/** Build a streamed canned-response Response for a /api/chat request body. */
	function cannedChatResponse(body: unknown): Response {
		let prompt = 'Explain this code';
		try {
			const parsed = JSON.parse(String(body ?? '{}')) as {
				messages?: Array<{ role: string; content: string }>;
			};
			const lastUser = [...(parsed.messages ?? [])].reverse().find((m) => m.role === 'user');
			if (lastUser?.content) prompt = lastUser.content;
		} catch {
			/* use default prompt */
		}

		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				const encoder = new TextEncoder();
				try {
					for await (const chunk of streamMockResponse(prompt, {
						responseDelay: 200,
						streamingDelay: 18
					})) {
						controller.enqueue(encoder.encode(chunk));
					}
				} finally {
					controller.close();
				}
			}
		});

		return new Response(stream, {
			status: 200,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}

	function requestUrl(input: RequestInfo | URL): string {
		if (typeof input === 'string') return input;
		if (input instanceof URL) return input.href;
		return input.url;
	}

	/**
	 * Install the scoped /api/chat fallback. Idempotent: only the first caller
	 * wraps `fetch`; the returned restore() removes the wrapper once the last
	 * scope releases it. Returns a no-op restore on the server.
	 */
	function installScopedChatMock(): () => void {
		if (!browser) return () => {};

		if (chatMockRefCount === 0) {
			const baseFetch = globalThis.fetch.bind(globalThis);
			savedChatFetch = globalThis.fetch;

			const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
				if (requestUrl(input).includes('/api/chat')) {
					// Short-circuit: no real backend on a static host, and a 200 here is
					// the SPA HTML fallback, not a stream — so never await the real
					// fetch. Return the canned streamed Response directly.
					return cannedChatResponse(init?.body);
				}
				return baseFetch(input, init);
			};

			installedChatFetch = wrappedFetch;
			globalThis.fetch = wrappedFetch;
		}

		chatMockRefCount += 1;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			chatMockRefCount -= 1;
			if (chatMockRefCount === 0) {
				// Identity-guarded restore: only reset fetch if it is still the wrapper
				// this scope installed (don't clobber a newer overlay).
				if (savedChatFetch && globalThis.fetch === installedChatFetch) {
					globalThis.fetch = savedChatFetch;
				}
				savedChatFetch = null;
				installedChatFetch = null;
			}
		};
	}
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import AIPanel from '$lib/components/ai/AIPanel.svelte';
	import AIMessage from '$lib/components/ai/AIMessage.svelte';
	import AIToolCallDisplay from '$lib/components/ai/AIToolCallDisplay.svelte';
	import AIEditPreview from '$lib/components/ai/AIEditPreview.svelte';
	import { Button, Badge, Icon } from '$lib/components/core';
	import type { AIMessage as AIMessageType, AIToolCall, AIEditSession } from '$lib/types/ai';
	import {
		getMockResponse,
		executeMockToolCall,
		createMockMessage,
		generateMockConversation,
		type MockAIConfig
	} from '$lib/services/mock-ai';
	import { createConversation, addMessage, getMessages, clearError } from '$lib/stores/ai.svelte';

	// Install the scoped chat mock synchronously during this page's setup so the
	// embedded <AIPanel>'s sendMessage() streams a canned reply instead of hitting
	// a missing backend. The module-level ref count keeps repeated SPA re-mounts
	// from stacking wrappers; onDestroy restores the global on SPA navigation away,
	// so nothing leaks across routes.
	const restoreChatMock = installScopedChatMock();
	onDestroy(restoreChatMock);

	// Demo state
	let demoMessages = $state<AIMessageType[]>([]);
	let isStreaming = $state(false);
	let streamingContent = $state('');
	let inputValue = $state('');
	let mockConfig = $state<MockAIConfig>({
		streamingDelay: 20,
		responseDelay: 500,
		simulateErrors: false,
		errorRate: 0.1
	});

	// Tool call demo state
	let toolCallStatuses = $state<Record<string, 'pending' | 'running' | 'completed' | 'error'>>({});
	let toolCallResults = $state<Record<string, unknown>>({});
	let toolCallDurations = $state<Record<string, number>>({});

	// Sample tool calls for demo
	const sampleToolCalls: AIToolCall[] = [
		{ id: 'tc1', name: 'read_file', arguments: { path: '/src/lib/utils.ts' } },
		{ id: 'tc2', name: 'search_files', arguments: { query: 'TODO', include: '**/*.ts' } },
		{ id: 'tc3', name: 'run_command', arguments: { command: 'npm test' } },
		{
			id: 'tc4',
			name: 'edit_file',
			arguments: { path: '/src/lib/utils.ts', startLine: 10, endLine: 25 }
		}
	];

	// Sample edit preview
	const originalCode = `function fetchUserData(userId) {
  return fetch('/api/users/' + userId)
    .then(response => response.json())
    .then(data => data)
    .catch(err => console.error(err));
}`;

	const proposedCode = `async function fetchUserData(userId: string): Promise<User> {
  const response = await fetch(\`/api/users/\${userId}\`);
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  return response.json();
}`;

	// Create mock edit session for preview
	const mockEditSession: AIEditSession = {
		id: 'mock-session-1',
		conversationId: 'mock-conv-1',
		filePath: '/src/lib/utils.ts',
		status: 'reviewing',
		originalContent: originalCode,
		proposedContent: proposedCode,
		diff: `@@ -1,6 +1,7 @@
-function fetchUserData(userId) {
-  return fetch('/api/users/' + userId)
-    .then(response => response.json())
-    .then(data => data)
-    .catch(err => console.error(err));
+async function fetchUserData(userId: string): Promise<User> {
+  const response = await fetch(\`/api/users/\${userId}\`);
+  if (!response.ok) {
+    throw new Error('Failed to fetch user');
+  }
+  return response.json();
 }`,
		startedAt: new Date()
	};

	// Initialize the standalone interactive demo with a sample conversation.
	demoMessages = generateMockConversation(2);

	// Pre-seed the shared AI store so the embedded <AIPanel> below renders an
	// alive conversation on mount instead of an empty state. Seeded after mount
	// so it survives the panel's own initialisation, and only when the store is
	// still empty (idempotent across SPA re-mounts).
	onMount(() => {
		clearError();
		if (getMessages().length === 0) {
			createConversation('Refactoring fetchUserData');
			for (const msg of generateMockConversation(2)) {
				addMessage({
					role: msg.role,
					content: msg.content,
					toolCalls: msg.toolCalls
				});
			}
		}
	});

	// Send message with streaming
	async function handleSendStreaming() {
		if (!inputValue.trim() || isStreaming) return;

		const userMessage = createMockMessage('user', inputValue.trim());
		demoMessages = [...demoMessages, userMessage];
		inputValue = '';
		isStreaming = true;
		streamingContent = '';

		// Create streaming assistant message
		const assistantMessage = createMockMessage('assistant', '', { isStreaming: true });
		demoMessages = [...demoMessages, assistantMessage];

		try {
			for await (const chunk of streamMockResponse(userMessage.content, mockConfig)) {
				streamingContent += chunk;
				// Update the last message
				demoMessages = demoMessages.map((m, i) =>
					i === demoMessages.length - 1 ? { ...m, content: streamingContent } : m
				);
			}
			// Mark as complete
			demoMessages = demoMessages.map((m, i) =>
				i === demoMessages.length - 1 ? { ...m, isStreaming: false } : m
			);
		} catch (err) {
			demoMessages = demoMessages.map((m, i) =>
				i === demoMessages.length - 1
					? { ...m, content: '', error: (err as Error).message, isStreaming: false }
					: m
			);
		} finally {
			isStreaming = false;
			streamingContent = '';
		}
	}

	// Send message without streaming
	async function handleSendNonStreaming() {
		if (!inputValue.trim() || isStreaming) return;

		const userMessage = createMockMessage('user', inputValue.trim());
		demoMessages = [...demoMessages, userMessage];
		inputValue = '';
		isStreaming = true;

		try {
			const response = await getMockResponse(userMessage.content, mockConfig);
			const assistantMessage = createMockMessage('assistant', response.content, {
				toolCalls: response.toolCalls
			});
			demoMessages = [...demoMessages, assistantMessage];
		} catch (err) {
			const errorMessage = createMockMessage('assistant', '', {
				error: (err as Error).message
			});
			demoMessages = [...demoMessages, errorMessage];
		} finally {
			isStreaming = false;
		}
	}

	// Run all tool calls demo
	async function runToolCallsDemo() {
		// Reset states
		toolCallStatuses = {};
		toolCallResults = {};
		toolCallDurations = {};

		for (const toolCall of sampleToolCalls) {
			toolCallStatuses[toolCall.id] = 'pending';
		}

		// Execute sequentially with delays
		for (const toolCall of sampleToolCalls) {
			toolCallStatuses = { ...toolCallStatuses, [toolCall.id]: 'running' };

			try {
				const { result, duration } = await executeMockToolCall(toolCall, mockConfig);
				toolCallResults = { ...toolCallResults, [toolCall.id]: result };
				toolCallDurations = { ...toolCallDurations, [toolCall.id]: duration };
				toolCallStatuses = { ...toolCallStatuses, [toolCall.id]: 'completed' };
			} catch (_err) {
				toolCallStatuses = { ...toolCallStatuses, [toolCall.id]: 'error' };
			}
		}
	}

	// Clear conversation
	function clearConversation() {
		demoMessages = [];
	}

	// Load sample conversation
	function loadSampleConversation() {
		demoMessages = generateMockConversation(3);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendStreaming();
		}
	}
</script>

<div class="demo-page">
	<header class="page-header">
		<h1>AI Integration</h1>
		<p>AI assistant panel with conversation UI, tool calls, and edit previews</p>
	</header>

	<!-- Interactive Demo -->
	<section class="component-section">
		<h2>Interactive Mock Demo</h2>
		<p class="section-desc">Test AI interactions with mock streaming responses</p>

		<div class="demo-controls">
			<div class="control-group">
				<label>
					Streaming Delay (ms):
					<input type="range" min="5" max="100" bind:value={mockConfig.streamingDelay} />
					<span>{mockConfig.streamingDelay}ms</span>
				</label>
				<label>
					Response Delay (ms):
					<input type="range" min="0" max="2000" step="100" bind:value={mockConfig.responseDelay} />
					<span>{mockConfig.responseDelay}ms</span>
				</label>
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={mockConfig.simulateErrors} />
					Simulate Errors ({Math.round((mockConfig.errorRate ?? 0.1) * 100)}% chance)
				</label>
			</div>
			<div class="control-buttons">
				<Button variant="secondary" size="sm" onclick={loadSampleConversation}>
					<Icon name="refresh" size={14} />
					Load Sample
				</Button>
				<Button variant="ghost" size="sm" onclick={clearConversation}>
					<Icon name="trash" size={14} />
					Clear
				</Button>
			</div>
		</div>

		<div class="interactive-demo">
			<div class="demo-messages">
				{#if demoMessages.length === 0}
					<div class="empty-state">
						<Icon name="message" size={32} />
						<p>Send a message to start the demo</p>
						<div class="suggestions">
							<button
								onclick={() => {
									inputValue = 'Explain this code';
									handleSendStreaming();
								}}
							>
								Explain this code
							</button>
							<button
								onclick={() => {
									inputValue = 'Refactor to use async/await';
									handleSendStreaming();
								}}
							>
								Refactor code
							</button>
							<button
								onclick={() => {
									inputValue = 'Find bugs in this file';
									handleSendStreaming();
								}}
							>
								Find bugs
							</button>
							<button
								onclick={() => {
									inputValue = 'Write tests for this function';
									handleSendStreaming();
								}}
							>
								Write tests
							</button>
						</div>
					</div>
				{:else}
					{#each demoMessages as message (message.id)}
						<AIMessage {message} />
					{/each}
				{/if}
				{#if isStreaming && streamingContent === ''}
					<div class="typing-indicator">
						<span></span>
						<span></span>
						<span></span>
					</div>
				{/if}
			</div>

			<div class="demo-input">
				<textarea
					bind:value={inputValue}
					placeholder="Try: 'Explain this code', 'Find bugs', 'Write tests'..."
					rows={2}
					disabled={isStreaming}
					onkeydown={handleKeydown}
				></textarea>
				<div class="input-actions">
					<Button
						variant="primary"
						size="sm"
						disabled={!inputValue.trim() || isStreaming}
						onclick={handleSendStreaming}
					>
						{#if isStreaming}
							<span class="spin"><Icon name="loading" size={14} /></span>
						{:else}
							<Icon name="arrow-right" size={14} />
						{/if}
						Stream
					</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={!inputValue.trim() || isStreaming}
						onclick={handleSendNonStreaming}
					>
						<Icon name="zap" size={14} />
						Instant
					</Button>
				</div>
			</div>
		</div>
	</section>

	<!-- Full AI Panel -->
	<section class="component-section">
		<h2>AI Panel Component</h2>
		<p class="section-desc">Full-featured AI assistant panel with sidebar</p>

		<div class="panel-container">
			<AIPanel showSidebar={true} />
		</div>
	</section>

	<!-- Tool Calls Interactive -->
	<section class="component-section">
		<h2>Tool Call Execution</h2>
		<p class="section-desc">Interactive tool call simulation with status updates</p>

		<div class="tool-demo-controls">
			<Button variant="primary" size="sm" onclick={runToolCallsDemo}>
				<Icon name="play" size={14} />
				Run All Tools
			</Button>
			<Badge variant={mockConfig.simulateErrors ? 'warning' : 'success'}>
				Errors: {mockConfig.simulateErrors ? 'ON' : 'OFF'}
			</Badge>
		</div>

		<div class="tool-calls-demo">
			{#each sampleToolCalls as toolCall (toolCall.id)}
				<AIToolCallDisplay
					{toolCall}
					status={toolCallStatuses[toolCall.id] ?? 'pending'}
					result={toolCallResults[toolCall.id]}
					duration={toolCallDurations[toolCall.id]}
				/>
			{/each}
		</div>
	</section>

	<!-- Edit Preview -->
	<section class="component-section">
		<h2>Edit Preview</h2>
		<p class="section-desc">Unified diff view for AI-proposed changes</p>

		<div class="edit-preview-demo">
			<AIEditPreview session={mockEditSession} />
		</div>
	</section>

	<!-- Features -->
	<section class="component-section">
		<h2>AI Features</h2>
		<div class="features-list">
			<div class="feature">
				<span class="feature-icon"><Icon name="zap" size={20} /></span>
				<div>
					<strong>Streaming Responses</strong>
					<p>Real-time streaming of AI responses with typing indicators</p>
				</div>
			</div>
			<div class="feature">
				<span class="feature-icon"><Icon name="terminal" size={20} /></span>
				<div>
					<strong>Tool Calling</strong>
					<p>AI can read files, run commands, search code, and make edits</p>
				</div>
			</div>
			<div class="feature">
				<span class="feature-icon"><Icon name="code" size={20} /></span>
				<div>
					<strong>Code Context</strong>
					<p>Pass open files and selections as conversation context via updateContext()</p>
				</div>
			</div>
			<div class="feature">
				<span class="feature-icon"><Icon name="git-merge" size={20} /></span>
				<div>
					<strong>Edit Sessions</strong>
					<p>Track and review AI-proposed code changes with diff view</p>
				</div>
			</div>
			<div class="feature">
				<span class="feature-icon"><Icon name="save" size={20} /></span>
				<div>
					<strong>Persistence</strong>
					<p>Conversations saved to IndexedDB with search and starring</p>
				</div>
			</div>
		</div>
	</section>

	<!-- API Configuration -->
	<section class="component-section">
		<h2>Configuration</h2>
		<p class="section-desc">AI store configuration options</p>

		<div class="config-demo">
			<pre><code
					>{`// Configure AI in your app
import { updateConfig } from '$lib/stores/ai.svelte';

updateConfig({
  endpoint: '/api/chat',
  model: 'your-model-id',
  systemPrompt: 'You are a helpful coding assistant...',
  maxTokens: 4096,
  temperature: 0.7,
  streaming: true
});

// Register custom tools
import { registerTool } from '$lib/stores/ai.svelte';

registerTool({
  name: 'deploy',
  description: 'Deploy the application',
  parameters: {
    environment: { type: 'string', enum: ['staging', 'production'] }
  },
  handler: async (args) => {
    // Implementation
  }
});`}</code
				></pre>
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

	/* Demo Controls */
	.demo-controls {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1rem;
		margin-bottom: 1rem;
		padding: 1rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
	}

	.control-group {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.control-group label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--ide-text-secondary);
	}

	.control-group input[type='range'] {
		width: 100px;
		accent-color: var(--ide-interactive);
		cursor: pointer;
	}

	.control-group input[type='range']:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.control-group span {
		min-width: 50px;
		font-family: var(--ide-font-mono);
	}

	.checkbox-label {
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox'] {
		accent-color: var(--ide-interactive);
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox']:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.control-buttons {
		display: flex;
		gap: 0.5rem;
	}

	/* Interactive Demo */
	.interactive-demo {
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		overflow: hidden;
	}

	.demo-messages {
		height: 400px;
		overflow-y: auto;
		padding: 1rem;
		background: var(--ide-bg-primary);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--ide-text-secondary);
		text-align: center;
	}

	.empty-state p {
		margin: 1rem 0;
	}

	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
	}

	.suggestions button {
		padding: 0.5rem 1rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 999px;
		font-size: 0.75rem;
		color: var(--ide-text-secondary);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.suggestions button:hover {
		background: var(--ide-interactive);
		border-color: var(--ide-interactive);
		color: var(--ide-text-inverse);
	}

	.suggestions button:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.typing-indicator {
		display: flex;
		gap: 4px;
		padding: 0.75rem 1rem;
		background: var(--ide-bg-secondary);
		border-radius: 12px;
		width: fit-content;
	}

	.typing-indicator span {
		width: 8px;
		height: 8px;
		background: var(--ide-text-muted);
		border-radius: 50%;
		animation: bounce 1.4s infinite ease-in-out;
	}

	.typing-indicator span:nth-child(1) {
		animation-delay: 0s;
	}
	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes bounce {
		0%,
		60%,
		100% {
			transform: translateY(0);
		}
		30% {
			transform: translateY(-4px);
		}
	}

	/* Keep the in-flight Send button's loader visibly alive while streaming. */
	.spin {
		display: inline-flex;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.demo-input {
		display: flex;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--ide-bg-secondary);
		border-top: 1px solid var(--ide-border);
	}

	.demo-input textarea {
		flex: 1;
		padding: 0.75rem;
		background: var(--ide-bg-primary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		font-family: var(--ide-font-sans);
		font-size: 0.875rem;
		color: var(--ide-text-primary);
		resize: none;
	}

	.demo-input textarea:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
		border-color: var(--ide-interactive);
	}

	.input-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* Tool Demo */
	.tool-demo-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.panel-container {
		/* position: relative + overflow: hidden makes this the containing block and
		   clip region for <AIPanel>'s absolutely-positioned conversation rail at
		   small widths, so the rail can never escape and overlap the page heading. */
		position: relative;
		height: 500px;
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		overflow: hidden;
	}

	.tool-calls-demo {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--ide-bg-secondary);
		border: 1px solid var(--ide-border);
		border-radius: 8px;
	}

	.edit-preview-demo {
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		overflow: hidden;
	}

	.features-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.feature {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: var(--ide-bg-secondary);
		border-radius: 8px;
	}

	.feature-icon {
		color: var(--ide-interactive);
		flex-shrink: 0;
	}

	.feature strong {
		display: block;
		color: var(--ide-text-primary);
		margin-bottom: 0.25rem;
	}

	.feature p {
		color: var(--ide-text-secondary);
		font-size: 0.875rem;
		margin: 0;
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

	/* Responsive */
	@media (max-width: 768px) {
		.demo-page {
			padding: 1rem;
		}

		.demo-controls {
			flex-direction: column;
			align-items: stretch;
		}

		.control-group {
			width: 100%;
		}

		/* Let the slider rows span the full mobile column: label text pins left,
		   the value pins right, and the range fills the space between so the row
		   reads tidily instead of leaving a ragged gap. Scoped to the slider
		   labels so the checkbox row keeps its natural left-aligned layout. */
		.control-group label:not(.checkbox-label) {
			justify-content: space-between;
			width: 100%;
		}

		.control-group label:not(.checkbox-label) input[type='range'] {
			flex: 1;
			width: auto;
			min-width: 0;
		}

		.control-group label:not(.checkbox-label) span {
			min-width: 0;
			text-align: right;
		}

		.control-buttons {
			justify-content: flex-end;
		}

		.demo-input {
			flex-direction: column;
		}

		.input-actions {
			flex-direction: row;
		}

		/* Collapse the embedded <AIPanel> to a single column on tablet/mobile.
		   Its conversation rail (Search / All / Starred / Today) goes
		   position: absolute at <=768px; with the page heading above it, the rail
		   was escaping and overlapping the heading/controls. Scoped to this page's
		   panel container, we hide the rail so only the usable chat column shows.
		   :global is required because the rail lives in <AIPanel>, a child component. */
		.panel-container :global(.ai-panel__sidebar) {
			display: none;
		}

		.panel-container :global(.ai-panel__main) {
			flex: 1 1 100%;
			width: 100%;
		}
	}
</style>
