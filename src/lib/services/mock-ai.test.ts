import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	streamMockResponse,
	getMockResponse,
	executeMockToolCall,
	createMockMessage,
	generateMockConversation
} from './mock-ai';

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
	randomUUID: () => `mock-uuid-${++uuidCounter}`
});

beforeEach(() => {
	uuidCounter = 0;
});

// ============================================================================
// Tests: streamMockResponse
// ============================================================================

describe('streamMockResponse', () => {
	it('should stream an explain response for explain-type messages', async () => {
		const chunks: string[] = [];
		for await (const chunk of streamMockResponse('Can you explain this code?', {
			streamingDelay: 0,
			responseDelay: 0
		})) {
			chunks.push(chunk);
		}

		const fullText = chunks.join('');
		expect(fullText).toContain('explain');
		expect(chunks.length).toBeGreaterThan(1);
	});

	it('should stream a refactor response for refactor-type messages', async () => {
		const chunks: string[] = [];
		for await (const chunk of streamMockResponse('refactor this code', {
			streamingDelay: 0,
			responseDelay: 0
		})) {
			chunks.push(chunk);
		}

		const fullText = chunks.join('');
		expect(fullText).toContain('refactor');
	});

	it('should stream a bugs response for bug-type messages', async () => {
		const chunks: string[] = [];
		for await (const chunk of streamMockResponse('find bugs in this', {
			streamingDelay: 0,
			responseDelay: 0
		})) {
			chunks.push(chunk);
		}

		const fullText = chunks.join('');
		expect(fullText).toContain('issue');
	});

	it('should stream a tests response for test-type messages', async () => {
		const chunks: string[] = [];
		for await (const chunk of streamMockResponse('write tests', {
			streamingDelay: 0,
			responseDelay: 0
		})) {
			chunks.push(chunk);
		}

		const fullText = chunks.join('');
		expect(fullText).toContain('test');
	});

	it('should stream a default response for unrecognized messages', async () => {
		const chunks: string[] = [];
		for await (const chunk of streamMockResponse('hello world', {
			streamingDelay: 0,
			responseDelay: 0
		})) {
			chunks.push(chunk);
		}

		const fullText = chunks.join('');
		expect(fullText).toContain('suggest');
	});

	it('should throw on simulated error', async () => {
		// Force random to return a value below the error rate
		vi.spyOn(Math, 'random').mockReturnValue(0);

		const gen = streamMockResponse('explain this', {
			streamingDelay: 0,
			responseDelay: 0,
			simulateErrors: true,
			errorRate: 1.0 // 100% error
		});

		await expect(async () => {
			for await (const _chunk of gen) {
				// should throw before yielding
			}
		}).rejects.toThrow('Mock API Error');

		vi.spyOn(Math, 'random').mockRestore();
	});
});

// ============================================================================
// Tests: getMockResponse
// ============================================================================

describe('getMockResponse', () => {
	it('should return content for explain-type messages', async () => {
		const result = await getMockResponse('explain this code', {
			responseDelay: 0
		});

		expect(result.content).toContain('explain');
		expect(typeof result.content).toBe('string');
	});

	it('should return content for refactor-type messages', async () => {
		const result = await getMockResponse('improve this function with async', {
			responseDelay: 0
		});

		expect(result.content).toContain('refactor');
	});

	it('should include tool calls for file-related messages', async () => {
		const result = await getMockResponse('read this file for me', {
			responseDelay: 0
		});

		expect(result.toolCalls).toBeDefined();
		expect(result.toolCalls!.length).toBeGreaterThan(0);
		expect(result.toolCalls!.some((tc) => tc.name === 'read_file')).toBe(true);
	});

	it('should include search tool call for search messages', async () => {
		const result = await getMockResponse('search for all TODOs', {
			responseDelay: 0
		});

		expect(result.toolCalls).toBeDefined();
		expect(result.toolCalls!.some((tc) => tc.name === 'search_files')).toBe(true);
	});

	it('should include run_command tool call for test messages', async () => {
		const result = await getMockResponse('run the tests', {
			responseDelay: 0
		});

		expect(result.toolCalls).toBeDefined();
		expect(result.toolCalls!.some((tc) => tc.name === 'run_command')).toBe(true);
	});

	it('should include edit_file tool call for edit messages', async () => {
		const result = await getMockResponse('edit and fix this code', {
			responseDelay: 0
		});

		expect(result.toolCalls).toBeDefined();
		expect(result.toolCalls!.some((tc) => tc.name === 'edit_file')).toBe(true);
	});

	it('should not include toolCalls for simple messages', async () => {
		const result = await getMockResponse('explain the algorithm', {
			responseDelay: 0
		});

		expect(result.toolCalls).toBeUndefined();
	});

	it('should throw on simulated error', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);

		await expect(
			getMockResponse('test', {
				responseDelay: 0,
				simulateErrors: true,
				errorRate: 1.0
			})
		).rejects.toThrow('Mock API Error');

		vi.spyOn(Math, 'random').mockRestore();
	});
});

// ============================================================================
// Tests: executeMockToolCall
// ============================================================================

describe('executeMockToolCall', () => {
	it('should execute read_file tool call', async () => {
		const result = await executeMockToolCall(
			{ id: 'tc-1', name: 'read_file', arguments: { path: '/test.ts' } },
			{ responseDelay: 0 }
		);

		expect(result.result).toBeDefined();
		expect((result.result as { content: string }).content).toBeDefined();
		expect(result.duration).toBeGreaterThanOrEqual(0);
	});

	it('should execute search_files tool call', async () => {
		const result = await executeMockToolCall(
			{ id: 'tc-2', name: 'search_files', arguments: { query: 'TODO' } },
			{ responseDelay: 0 }
		);

		expect((result.result as { matches: unknown[] }).matches).toBeDefined();
	});

	it('should execute run_command tool call', async () => {
		const result = await executeMockToolCall(
			{ id: 'tc-3', name: 'run_command', arguments: { command: 'npm test' } },
			{ responseDelay: 0 }
		);

		const r = result.result as { stdout: string; exitCode: number };
		expect(r.stdout).toContain('passed');
		expect(r.exitCode).toBe(0);
	});

	it('should execute edit_file tool call', async () => {
		const result = await executeMockToolCall(
			{ id: 'tc-4', name: 'edit_file', arguments: { path: '/test.ts' } },
			{ responseDelay: 0 }
		);

		const r = result.result as { success: boolean; linesChanged: number };
		expect(r.success).toBe(true);
		expect(r.linesChanged).toBe(15);
	});

	it('should return generic result for unknown tool', async () => {
		const result = await executeMockToolCall(
			{ id: 'tc-5', name: 'unknown_tool', arguments: {} },
			{ responseDelay: 0 }
		);

		expect((result.result as { success: boolean }).success).toBe(true);
	});

	it('should throw on simulated error', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);

		await expect(
			executeMockToolCall(
				{ id: 'tc-err', name: 'read_file', arguments: {} },
				{ responseDelay: 0, simulateErrors: true, errorRate: 1.0 }
			)
		).rejects.toThrow('Tool execution failed');

		vi.spyOn(Math, 'random').mockRestore();
	});
});

// ============================================================================
// Tests: createMockMessage
// ============================================================================

describe('createMockMessage', () => {
	it('should create a user message', () => {
		const msg = createMockMessage('user', 'Hello');

		expect(msg.role).toBe('user');
		expect(msg.content).toBe('Hello');
		expect(msg.id).toBeDefined();
		expect(msg.timestamp).toBeInstanceOf(Date);
	});

	it('should create an assistant message with metadata', () => {
		const msg = createMockMessage('assistant', 'Here is my response');

		expect(msg.role).toBe('assistant');
		expect(msg.metadata).toBeDefined();
		expect(msg.metadata!.model).toBe('claude-3-5-sonnet-mock');
		expect(typeof msg.metadata!.tokensUsed).toBe('number');
		expect(typeof msg.metadata!.latencyMs).toBe('number');
	});

	it('should not add metadata for user messages', () => {
		const msg = createMockMessage('user', 'test');
		expect(msg.metadata).toBeUndefined();
	});

	it('should merge custom options', () => {
		const customDate = new Date(2024, 0, 1);
		const msg = createMockMessage('assistant', 'test', {
			timestamp: customDate,
			metadata: { model: 'custom-model' }
		});

		expect(msg.timestamp).toBe(customDate);
		expect(msg.metadata!.model).toBe('custom-model');
	});

	it('should calculate approximate token count from content length', () => {
		const content = 'A'.repeat(100);
		const msg = createMockMessage('assistant', content);

		// tokensUsed = Math.floor(content.length / 4) = 25
		expect(msg.metadata!.tokensUsed).toBe(25);
	});
});

// ============================================================================
// Tests: generateMockConversation
// ============================================================================

describe('generateMockConversation', () => {
	it('should generate default 3 turns (6 messages)', () => {
		const messages = generateMockConversation();

		expect(messages).toHaveLength(6);
		// Should alternate user/assistant
		expect(messages[0].role).toBe('user');
		expect(messages[1].role).toBe('assistant');
		expect(messages[2].role).toBe('user');
		expect(messages[3].role).toBe('assistant');
	});

	it('should generate specified number of turns', () => {
		const messages = generateMockConversation(1);
		expect(messages).toHaveLength(2); // 1 turn = 1 user + 1 assistant

		const messages5 = generateMockConversation(5);
		expect(messages5).toHaveLength(10);
	});

	it('should have timestamps in chronological order', () => {
		const messages = generateMockConversation(3);

		for (let i = 1; i < messages.length; i++) {
			expect(messages[i].timestamp.getTime()).toBeGreaterThanOrEqual(
				messages[i - 1].timestamp.getTime()
			);
		}
	});

	it('should have non-empty content for all messages', () => {
		const messages = generateMockConversation(4);

		for (const msg of messages) {
			expect(msg.content.length).toBeGreaterThan(0);
		}
	});

	it('should include tool calls in the second turn assistant message', () => {
		const messages = generateMockConversation(3);
		// Turn index 1 (i=1) corresponds to messages[2] (user) and messages[3] (assistant)
		const secondAssistant = messages[3];
		expect(secondAssistant.toolCalls).toBeDefined();
	});

	it('should cycle through prompts when turns exceed prompt count', () => {
		const messages = generateMockConversation(6);
		// 4 prompts cycle, so turn 4 should have same prompt as turn 0
		// messages[0] and messages[8] should have the same user content
		expect(messages[0].content).toBe(messages[8].content);
	});
});
