/**
 * Mock Chat API for AI Panel
 * POST - Send message and get AI response (streaming or non-streaming)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Mock response templates
const RESPONSES: Record<string, string> = {
	explain: `I'll explain this code for you.

This is a **well-structured function** that demonstrates several important patterns:

\`\`\`typescript
function processData(input: string[]): ProcessedData {
  return input
    .filter(item => item.length > 0)
    .map(item => item.trim())
    .reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
}
\`\`\`

**Key observations:**
- Uses functional programming patterns (filter, map, reduce)
- Properly typed with TypeScript generics
- Handles edge cases by filtering empty strings`,

	refactor: `Here's the refactored version using modern patterns:

\`\`\`typescript
// Before: Callback-based approach
function fetchData(url, callback) {
  fetch(url)
    .then(res => res.json())
    .then(data => callback(null, data))
    .catch(err => callback(err));
}

// After: Modern async/await
async function fetchData(url: string): Promise<ApiResponse> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }

  return response.json();
}
\`\`\`

**Improvements made:**
- Converted to async/await for cleaner syntax
- Added proper TypeScript types
- Improved error handling with custom error class`,

	bugs: `I found several issues in the code:

1. **Potential null reference** at line 15
   \`\`\`typescript
   // Unsafe
   user.profile.name.toUpperCase()

   // Safe
   user?.profile?.name?.toUpperCase() ?? 'Unknown'
   \`\`\`

2. **Memory leak** - event listener not cleaned up
3. **Race condition** in async state updates`,

	tests: `Here are comprehensive tests for your function:

\`\`\`typescript
import { describe, it, expect } from 'vitest';
import { calculateTotal } from './cart';

describe('calculateTotal', () => {
  it('returns 0 for empty cart', () => {
    expect(calculateTotal([])).toBe(0);
  });

  it('calculates sum correctly', () => {
    const items = [
      { price: 10, quantity: 2 },
      { price: 5, quantity: 3 }
    ];
    expect(calculateTotal(items)).toBe(35);
  });

  it('applies discount', () => {
    const items = [{ price: 100, quantity: 1 }];
    expect(calculateTotal(items, 0.1)).toBe(90);
  });
});
\`\`\``,

	default: `I understand your question. Let me help you with that.

Based on the context, here are some suggestions:

1. Consider adding error handling
2. The code structure looks good but could use some optimization
3. TypeScript types could be more specific

Would you like me to elaborate on any of these points?`
};

function detectResponseType(message: string): string {
	const lower = message.toLowerCase();
	if (lower.includes('explain') || lower.includes('what')) return 'explain';
	if (lower.includes('refactor') || lower.includes('improve')) return 'refactor';
	if (lower.includes('bug') || lower.includes('issue')) return 'bugs';
	if (lower.includes('test')) return 'tests';
	return 'default';
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const messages = body.messages || [];
	const streaming = body.streaming !== false;

	// Get the last user message
	const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user');
	const userContent = lastUserMessage?.content || '';

	const responseType = detectResponseType(userContent);
	const fullResponse = RESPONSES[responseType] || RESPONSES.default;

	if (streaming) {
		// Stream response word by word
		const words = fullResponse.split(' ');
		const stream = new ReadableStream({
			async start(controller) {
				// Initial delay
				await new Promise((r) => setTimeout(r, 300));

				for (let i = 0; i < words.length; i++) {
					const chunk = words[i] + (i < words.length - 1 ? ' ' : '');
					controller.enqueue(new TextEncoder().encode(chunk));
					await new Promise((r) => setTimeout(r, 20));
				}
				controller.close();
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/plain',
				'Transfer-Encoding': 'chunked'
			}
		});
	} else {
		// Non-streaming response
		await new Promise((r) => setTimeout(r, 500));

		return json({
			content: fullResponse,
			metadata: {
				model: 'claude-3-5-sonnet-mock',
				tokensUsed: Math.floor(fullResponse.length / 4),
				latencyMs: 500
			}
		});
	}
};
