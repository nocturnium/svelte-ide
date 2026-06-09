/**
 * Mock AI Service for Demos
 * Simulates AI responses with streaming and tool calls
 */

import type { AIMessage, AIToolCall } from '$types';

// Mock response templates
const MOCK_RESPONSES: Record<string, string> = {
	explain: `I'll explain this code for you.

This function implements a **binary search algorithm** that efficiently finds an element in a sorted array.

\`\`\`typescript
function binarySearch<T>(arr: T[], target: T): number {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }

  return -1;
}
\`\`\`

**Key points:**
- Time complexity: O(log n)
- Space complexity: O(1)
- Requires a sorted array`,

	refactor: `I'll refactor this code to use modern patterns.

Here's the improved version:

\`\`\`typescript
// Before: Callback-based
function fetchData(url, callback) {
  fetch(url)
    .then(res => res.json())
    .then(data => callback(null, data))
    .catch(err => callback(err));
}

// After: Async/await with error handling
async function fetchData(url: string): Promise<Response> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
  }

  return response.json();
}
\`\`\`

**Improvements:**
- Uses async/await for cleaner syntax
- Proper TypeScript types
- Better error handling
- Returns a Promise instead of using callbacks`,

	bugs: `I found several potential issues in your code:

1. **Memory Leak** (Line 42)
   \`\`\`typescript
   // Problem: Event listener never removed
   window.addEventListener('resize', handleResize);

   // Fix: Clean up in useEffect/onDestroy
   return () => window.removeEventListener('resize', handleResize);
   \`\`\`

2. **Race Condition** (Line 67)
   \`\`\`typescript
   // Problem: State update after unmount
   const data = await fetchData();
   setState(data); // Component might be unmounted!

   // Fix: Check if mounted
   if (isMounted) setState(data);
   \`\`\`

3. **Missing Null Check** (Line 89)
   \`\`\`typescript
   // Problem
   user.profile.name.toUpperCase()

   // Fix
   user?.profile?.name?.toUpperCase() ?? 'Unknown'
   \`\`\``,

	tests: `Here are the tests for your function:

\`\`\`typescript
import { describe, it, expect, vi } from 'vitest';
import { calculateTotal } from './cart';

describe('calculateTotal', () => {
  it('should return 0 for empty cart', () => {
    expect(calculateTotal([])).toBe(0);
  });

  it('should sum item prices correctly', () => {
    const items = [
      { name: 'Apple', price: 1.50, quantity: 3 },
      { name: 'Banana', price: 0.75, quantity: 2 }
    ];
    expect(calculateTotal(items)).toBe(6.00);
  });

  it('should apply discount correctly', () => {
    const items = [{ name: 'Item', price: 100, quantity: 1 }];
    expect(calculateTotal(items, 0.1)).toBe(90);
  });

  it('should handle negative quantities', () => {
    const items = [{ name: 'Item', price: 10, quantity: -1 }];
    expect(() => calculateTotal(items)).toThrow('Invalid quantity');
  });
});
\`\`\``,

	default: `I understand you're asking about your code. Let me help!

Based on the context, here's what I can suggest:

1. **Code Quality**: Consider adding more type annotations
2. **Performance**: The current implementation could be optimized
3. **Maintainability**: Breaking this into smaller functions would help

Would you like me to elaborate on any of these points?`
};

// Mock tool call responses
const TOOL_RESPONSES: Record<string, () => unknown> = {
	read_file: () => ({
		content: `import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}`,
		language: 'typescript'
	}),
	search_files: () => ({
		matches: [
			{ file: 'src/components/Button.tsx', line: 15, match: 'TODO: Add loading state' },
			{ file: 'src/utils/api.ts', line: 42, match: 'TODO: Handle rate limiting' },
			{ file: 'src/hooks/useAuth.ts', line: 8, match: 'TODO: Implement refresh token' }
		]
	}),
	run_command: () => ({
		stdout:
			'All tests passed!\n\n  PASS  src/utils/math.test.ts\n  PASS  src/components/Button.test.tsx\n\nTest Suites: 2 passed, 2 total\nTests: 8 passed, 8 total',
		exitCode: 0
	}),
	edit_file: () => ({
		success: true,
		linesChanged: 15
	})
};

export interface MockAIConfig {
	streamingDelay?: number; // ms between chunks
	responseDelay?: number; // initial delay before response
	simulateErrors?: boolean;
	errorRate?: number; // 0-1 probability of error
}

const DEFAULT_CONFIG: MockAIConfig = {
	streamingDelay: 20,
	responseDelay: 500,
	simulateErrors: false,
	errorRate: 0.1
};

/**
 * Detect response type based on user message
 */
function detectResponseType(message: string): string {
	const lower = message.toLowerCase();
	if (lower.includes('explain') || lower.includes('what does')) return 'explain';
	if (lower.includes('refactor') || lower.includes('improve') || lower.includes('async'))
		return 'refactor';
	if (lower.includes('bug') || lower.includes('issue') || lower.includes('problem')) return 'bugs';
	if (lower.includes('test') || lower.includes('spec')) return 'tests';
	return 'default';
}

/**
 * Generate mock tool calls based on message
 */
function generateToolCalls(message: string): AIToolCall[] {
	const lower = message.toLowerCase();
	const calls: AIToolCall[] = [];

	if (lower.includes('read') || lower.includes('file') || lower.includes('show')) {
		calls.push({
			id: crypto.randomUUID(),
			name: 'read_file',
			arguments: { path: '/src/lib/utils.ts' }
		});
	}

	if (lower.includes('search') || lower.includes('find') || lower.includes('todo')) {
		calls.push({
			id: crypto.randomUUID(),
			name: 'search_files',
			arguments: { query: 'TODO', include: '**/*.ts' }
		});
	}

	if (lower.includes('test') || lower.includes('run')) {
		calls.push({
			id: crypto.randomUUID(),
			name: 'run_command',
			arguments: { command: 'npm test' }
		});
	}

	if (lower.includes('edit') || lower.includes('change') || lower.includes('fix')) {
		calls.push({
			id: crypto.randomUUID(),
			name: 'edit_file',
			arguments: { path: '/src/lib/utils.ts', startLine: 10, endLine: 25 }
		});
	}

	return calls;
}

/**
 * Simulate streaming response
 */
export async function* streamMockResponse(
	message: string,
	config: MockAIConfig = {}
): AsyncGenerator<string, void, unknown> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const responseType = detectResponseType(message);
	const fullResponse = MOCK_RESPONSES[responseType] || MOCK_RESPONSES.default;

	// Initial delay
	await sleep(cfg.responseDelay!);

	// Simulate error
	if (cfg.simulateErrors && Math.random() < cfg.errorRate!) {
		throw new Error('Mock API Error: Connection timeout');
	}

	// Stream character by character (or by words for speed)
	const words = fullResponse.split(' ');
	for (let i = 0; i < words.length; i++) {
		yield words[i] + (i < words.length - 1 ? ' ' : '');
		await sleep(cfg.streamingDelay!);
	}
}

/**
 * Get mock response (non-streaming)
 */
export async function getMockResponse(
	message: string,
	config: MockAIConfig = {}
): Promise<{ content: string; toolCalls?: AIToolCall[] }> {
	const cfg = { ...DEFAULT_CONFIG, ...config };

	await sleep(cfg.responseDelay!);

	if (cfg.simulateErrors && Math.random() < cfg.errorRate!) {
		throw new Error('Mock API Error: Rate limit exceeded');
	}

	const responseType = detectResponseType(message);
	const toolCalls = generateToolCalls(message);

	return {
		content: MOCK_RESPONSES[responseType] || MOCK_RESPONSES.default,
		toolCalls: toolCalls.length > 0 ? toolCalls : undefined
	};
}

/**
 * Execute mock tool call
 */
export async function executeMockToolCall(
	toolCall: AIToolCall,
	config: MockAIConfig = {}
): Promise<{ result: unknown; duration: number }> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const start = Date.now();

	// Simulate execution time
	await sleep(500 + Math.random() * 1000);

	if (cfg.simulateErrors && Math.random() < cfg.errorRate!) {
		throw new Error(`Tool execution failed: ${toolCall.name}`);
	}

	const handler = TOOL_RESPONSES[toolCall.name];
	const result = handler ? handler() : { success: true };

	return {
		result,
		duration: Date.now() - start
	};
}

/**
 * Create a mock AI message with metadata
 */
export function createMockMessage(
	role: 'user' | 'assistant',
	content: string,
	options: Partial<AIMessage> = {}
): AIMessage {
	return {
		id: crypto.randomUUID(),
		role,
		content,
		timestamp: new Date(),
		...options,
		metadata:
			role === 'assistant'
				? {
						model: 'nocturnium-demo-mock',
						tokensUsed: Math.floor(content.length / 4),
						latencyMs: Math.floor(500 + Math.random() * 1500),
						...options.metadata
					}
				: options.metadata
	};
}

/**
 * Generate a conversation with mock messages
 */
export function generateMockConversation(turns: number = 3): AIMessage[] {
	const messages: AIMessage[] = [];
	const prompts = [
		'Can you explain this code?',
		'How can I refactor this to use async/await?',
		'Are there any bugs in this file?',
		'Write some tests for this function'
	];

	for (let i = 0; i < turns; i++) {
		const userContent = prompts[i % prompts.length];
		const responseType = detectResponseType(userContent);

		messages.push(
			createMockMessage('user', userContent, {
				timestamp: new Date(Date.now() - (turns - i) * 60000)
			})
		);

		messages.push(
			createMockMessage('assistant', MOCK_RESPONSES[responseType], {
				timestamp: new Date(Date.now() - (turns - i) * 60000 + 5000),
				toolCalls: i === 1 ? generateToolCalls(userContent) : undefined
			})
		);
	}

	return messages;
}

// Helper
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
