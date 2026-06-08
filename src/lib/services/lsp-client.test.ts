import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	LSPClient,
	createLSPClient,
	positionToOffset,
	offsetToPosition,
	rangeToOffsets
} from './lsp-client';
import type { LSPClientConfig, ServerCapabilities } from '$lib/types/lsp';

// ============================================================================
// WebSocket Mock
// ============================================================================

class MockWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	static instances: MockWebSocket[] = [];
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSING = 2;
	readonly CLOSED = 3;

	readyState = MockWebSocket.CONNECTING;
	url: string;
	onopen: ((event: Event) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;

	send = vi.fn();
	close = vi.fn(() => {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.(new CloseEvent('close'));
	});

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
	}

	/** Test helper: simulate connection opened */
	simulateOpen(): void {
		this.readyState = MockWebSocket.OPEN;
		this.onopen?.(new Event('open'));
	}

	/** Test helper: simulate a message from the server */
	simulateMessage(data: unknown): void {
		this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
	}

	/** Test helper: simulate an error */
	simulateError(): void {
		this.onerror?.(new Event('error'));
	}

	/** Test helper: simulate connection closed */
	simulateClose(): void {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.(new CloseEvent('close'));
	}
}

// Assign globals
vi.stubGlobal('WebSocket', MockWebSocket);

beforeEach(() => {
	MockWebSocket.instances = [];
});

// ============================================================================
// Helpers
// ============================================================================

function getDefaultConfig(overrides: Partial<LSPClientConfig> = {}): LSPClientConfig {
	return {
		serverUrl: 'ws://localhost:9999',
		rootUri: 'file:///workspace',
		autoReconnect: false,
		debug: false,
		requestTimeout: 500,
		...overrides
	};
}

/**
 * Create a client and connect it, returning the client and the underlying mock WS.
 * The server responds to the `initialize` request automatically.
 */
async function createConnectedClient(
	overrides: Partial<LSPClientConfig> = {}
): Promise<{ client: LSPClient; ws: MockWebSocket }> {
	const client = new LSPClient(getDefaultConfig(overrides));

	const connectPromise = client.connect();

	// Grab the most recently created MockWebSocket
	const ws = (client as unknown as { ws: MockWebSocket }).ws;
	ws.simulateOpen();

	// Respond to the initialize request
	const sentData = JSON.parse(ws.send.mock.calls[0][0]);
	ws.simulateMessage({
		jsonrpc: '2.0',
		id: sentData.id,
		result: {
			capabilities: {
				completionProvider: { triggerCharacters: ['.', ':'] },
				hoverProvider: true,
				signatureHelpProvider: { triggerCharacters: ['(', ','] },
				definitionProvider: true,
				typeDefinitionProvider: true,
				referencesProvider: true,
				codeActionProvider: true,
				renameProvider: { prepareProvider: true },
				documentFormattingProvider: true
			}
		}
	});

	await connectPromise;
	return { client, ws };
}

// ============================================================================
// Tests: Factory & Helpers
// ============================================================================

describe('createLSPClient', () => {
	it('should return an LSPClient instance', () => {
		const client = createLSPClient(getDefaultConfig());
		expect(client).toBeInstanceOf(LSPClient);
	});
});

describe('positionToOffset', () => {
	it('should convert line 0, char 0 to offset 0', () => {
		expect(positionToOffset('hello', { line: 0, character: 0 })).toBe(0);
	});

	it('should handle single-line content', () => {
		expect(positionToOffset('hello', { line: 0, character: 3 })).toBe(3);
	});

	it('should handle multi-line content', () => {
		const content = 'abc\ndef\nghi';
		// line 1, char 2 => offset = 4 (abc\n) + 2 = 6
		expect(positionToOffset(content, { line: 1, character: 2 })).toBe(6);
	});

	it('should handle position at line start', () => {
		const content = 'abc\ndef';
		expect(positionToOffset(content, { line: 1, character: 0 })).toBe(4);
	});

	it('should clamp character to line length', () => {
		const content = 'ab\ncd';
		// character 100 on line 0 ("ab" length=2) => clamped to 2
		expect(positionToOffset(content, { line: 0, character: 100 })).toBe(2);
	});
});

describe('offsetToPosition', () => {
	it('should convert offset 0 to line 0, char 0', () => {
		expect(offsetToPosition('hello', 0)).toEqual({ line: 0, character: 0 });
	});

	it('should handle mid-line offset', () => {
		expect(offsetToPosition('hello', 3)).toEqual({ line: 0, character: 3 });
	});

	it('should handle multi-line offset', () => {
		const content = 'abc\ndef\nghi';
		// offset 6 => line 1, char 2
		expect(offsetToPosition(content, 6)).toEqual({ line: 1, character: 2 });
	});

	it('should handle offset past end of document', () => {
		const content = 'ab\ncd';
		const pos = offsetToPosition(content, 1000);
		expect(pos.line).toBe(1);
		expect(pos.character).toBe(2);
	});

	it('should handle offset at newline boundary', () => {
		const content = 'abc\ndef';
		// offset 4 => first char of second line
		expect(offsetToPosition(content, 4)).toEqual({ line: 1, character: 0 });
	});
});

describe('rangeToOffsets', () => {
	it('should convert a range to start and end offsets', () => {
		const content = 'abc\ndef\nghi';
		const result = rangeToOffsets(content, {
			start: { line: 0, character: 1 },
			end: { line: 1, character: 2 }
		});
		expect(result).toEqual({ start: 1, end: 6 });
	});
});

// ============================================================================
// Tests: LSPClient — Connection Lifecycle
// ============================================================================

describe('LSPClient — Connection Lifecycle', () => {
	let client: LSPClient;

	beforeEach(() => {
		vi.useFakeTimers();
		client = new LSPClient(getDefaultConfig());
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should start in disconnected state', () => {
		expect(client.state).toBe('disconnected');
		expect(client.isReady).toBe(false);
		expect(client.capabilities).toBeNull();
	});

	it('should transition through states during connect', async () => {
		const states: string[] = [];
		client.on('onConnectionStateChange', (s) => states.push(s));

		const connectPromise = client.connect();
		const ws = (client as unknown as { ws: MockWebSocket }).ws;

		expect(client.state).toBe('connecting');

		ws.simulateOpen();
		// After open, state goes to connected -> initializing (inside initialize)

		const sentData = JSON.parse(ws.send.mock.calls[0][0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: sentData.id,
			result: { capabilities: {} }
		});

		await connectPromise;

		expect(client.state).toBe('ready');
		expect(client.isReady).toBe(true);
		expect(states).toContain('connecting');
		expect(states).toContain('connected');
		expect(states).toContain('initializing');
		expect(states).toContain('ready');
	});

	it('should reject connect if WebSocket errors during connecting', async () => {
		const connectPromise = client.connect();
		const ws = (client as unknown as { ws: MockWebSocket }).ws;
		ws.simulateError();

		await expect(connectPromise).rejects.toThrow('WebSocket error');
	});

	it('should ignore connect call if already connected/connecting', async () => {
		const p1 = client.connect();
		// Second call should return immediately (no-op)
		const p2 = client.connect();
		await expect(p2).resolves.toBeUndefined();

		const ws = (client as unknown as { ws: MockWebSocket }).ws;
		ws.simulateOpen();
		const sentData = JSON.parse(ws.send.mock.calls[0][0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: sentData.id,
			result: { capabilities: {} }
		});
		await p1;
	});

	it('should set capabilities after initialization', async () => {
		const capHandler = vi.fn();
		client.on('onServerCapabilities', capHandler);

		const connectPromise = client.connect();
		const ws = (client as unknown as { ws: MockWebSocket }).ws;
		ws.simulateOpen();

		const sentData = JSON.parse(ws.send.mock.calls[0][0]);
		const mockCapabilities = { completionProvider: { triggerCharacters: ['.'] } };
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: sentData.id,
			result: { capabilities: mockCapabilities }
		});

		await connectPromise;

		expect(client.capabilities).toEqual(mockCapabilities);
		expect(capHandler).toHaveBeenCalledWith(mockCapabilities);
	});

	it('should send initialized notification after init response', async () => {
		const connectPromise = client.connect();
		const ws = (client as unknown as { ws: MockWebSocket }).ws;
		ws.simulateOpen();

		const initReq = JSON.parse(ws.send.mock.calls[0][0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: initReq.id,
			result: { capabilities: {} }
		});

		await connectPromise;

		// Second send call should be the 'initialized' notification
		expect(ws.send.mock.calls.length).toBeGreaterThanOrEqual(2);
		const initNotif = JSON.parse(ws.send.mock.calls[1][0]);
		expect(initNotif.method).toBe('initialized');
		expect(initNotif.id).toBeUndefined();
	});
});

// ============================================================================
// Tests: LSPClient — Disconnect & Reconnect
// ============================================================================

describe('LSPClient — Disconnect & Reconnect', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should send shutdown and exit on disconnect when ready', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		// Start disconnect
		const disconnectPromise = client.disconnect();

		// The shutdown request gets sent
		const shutdownCall = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'shutdown';
		});
		expect(shutdownCall).toBeDefined();

		// Respond to shutdown
		const shutdownReq = JSON.parse(shutdownCall![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: shutdownReq.id,
			result: null
		});

		await disconnectPromise;
		expect(ws.close).toHaveBeenCalled();
		expect(client.state).toBe('disconnected');
	});

	it('should cancel pending requests on disconnect', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		// Send a request that won't be answered
		const hoverPromise = client.hover('file:///test.ts', { line: 0, character: 0 });

		// Simulate unexpected close
		ws.simulateClose();

		await expect(hoverPromise).rejects.toThrow('Connection closed');
	});

	it('should attempt reconnection when autoReconnect is enabled', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const client = new LSPClient(
			getDefaultConfig({ autoReconnect: true, maxReconnectAttempts: 3, reconnectDelay: 100 })
		);

		// First connect
		const connectPromise = client.connect();
		const ws1 = (client as unknown as { ws: MockWebSocket }).ws;
		ws1.simulateOpen();
		const initReq = JSON.parse(ws1.send.mock.calls[0][0]);
		ws1.simulateMessage({
			jsonrpc: '2.0',
			id: initReq.id,
			result: { capabilities: {} }
		});
		await connectPromise;

		// Simulate disconnect
		ws1.simulateClose();
		expect(client.state).toBe('disconnected');
		expect(ws1.close).toHaveBeenCalled();
		expect(ws1.onopen).toBeNull();
		expect(ws1.onclose).toBeNull();
		expect(ws1.onerror).toBeNull();
		expect(ws1.onmessage).toBeNull();
		expect(MockWebSocket.instances).toHaveLength(1);

		// Advance timer to trigger reconnect
		vi.advanceTimersByTime(100);

		// A new WebSocket should have been created (connect called again)
		const ws2 = (client as unknown as { ws: MockWebSocket }).ws;
		expect(ws2).toBeDefined();
		expect(ws2).not.toBe(ws1);
		expect(MockWebSocket.instances).toHaveLength(2);
	});

	it('should use growing reconnect delays and stop after maxReconnectAttempts', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const errorHandler = vi.fn();
		const client = new LSPClient(
			getDefaultConfig({ autoReconnect: true, maxReconnectAttempts: 2, reconnectDelay: 50 })
		);
		client.on('onError', errorHandler);

		// First connect
		const connectPromise = client.connect();
		const ws1 = (client as unknown as { ws: MockWebSocket }).ws;
		ws1.simulateOpen();
		const initReq = JSON.parse(ws1.send.mock.calls[0][0]);
		ws1.simulateMessage({
			jsonrpc: '2.0',
			id: initReq.id,
			result: { capabilities: {} }
		});
		await connectPromise;

		// Disconnect — triggers reconnect attempt 1
		ws1.simulateClose();
		expect(vi.getTimerCount()).toBe(1);
		expect(MockWebSocket.instances).toHaveLength(1);

		vi.advanceTimersByTime(49);
		expect(MockWebSocket.instances).toHaveLength(1);
		vi.advanceTimersByTime(1);

		// The second WS attempt fails
		const ws2 = (client as unknown as { ws: MockWebSocket }).ws;
		ws2.simulateError();
		ws2.simulateClose();
		expect(errorHandler).toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);
		expect(MockWebSocket.instances).toHaveLength(2);

		vi.advanceTimersByTime(99);
		expect(MockWebSocket.instances).toHaveLength(2);
		vi.advanceTimersByTime(1);

		const ws3 = (client as unknown as { ws: MockWebSocket }).ws;
		expect(ws3).not.toBe(ws2);
		expect(MockWebSocket.instances).toHaveLength(3);

		ws3.simulateError();
		ws3.simulateClose();
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(1000);
		expect(MockWebSocket.instances).toHaveLength(3);
	});

	it('should not reconnect after intentional disconnect', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient({
			autoReconnect: true,
			maxReconnectAttempts: 3,
			reconnectDelay: 50
		});
		vi.useFakeTimers();

		const disconnectPromise = client.disconnect();
		const shutdownCall = ws.send.mock.calls.find((c) => JSON.parse(c[0]).method === 'shutdown');
		expect(shutdownCall).toBeDefined();

		const shutdownReq = JSON.parse(shutdownCall![0]);
		ws.simulateMessage({ jsonrpc: '2.0', id: shutdownReq.id, result: null });
		await disconnectPromise;

		expect(client.state).toBe('disconnected');
		expect(ws.close).toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(500);
		expect(MockWebSocket.instances).toHaveLength(1);
	});

	it('should clear a pending reconnect timer when a manual connect succeeds', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const client = new LSPClient(
			getDefaultConfig({ autoReconnect: true, maxReconnectAttempts: 3, reconnectDelay: 100 })
		);

		const firstConnect = client.connect();
		const ws1 = (client as unknown as { ws: MockWebSocket }).ws;
		ws1.simulateOpen();
		const initReq1 = JSON.parse(ws1.send.mock.calls[0][0]);
		ws1.simulateMessage({ jsonrpc: '2.0', id: initReq1.id, result: { capabilities: {} } });
		await firstConnect;

		ws1.simulateClose();
		expect(vi.getTimerCount()).toBe(1);

		const secondConnect = client.connect();
		const ws2 = (client as unknown as { ws: MockWebSocket }).ws;
		expect(ws2).not.toBe(ws1);
		ws2.simulateOpen();
		const initReq2 = JSON.parse(ws2.send.mock.calls[0][0]);
		ws2.simulateMessage({ jsonrpc: '2.0', id: initReq2.id, result: { capabilities: {} } });
		await secondConnect;

		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(500);
		expect(MockWebSocket.instances).toHaveLength(2);
	});
});

// ============================================================================
// Tests: LSPClient — Message Handling
// ============================================================================

describe('LSPClient — Message Handling', () => {
	it('should resolve pending request on response', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const hoverPromise = client.hover('file:///test.ts', { line: 0, character: 0 });

		// Find the hover request
		const hoverCall = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/hover';
		});
		expect(hoverCall).toBeDefined();

		const hoverReq = JSON.parse(hoverCall![0]);
		const hoverResult = { contents: { kind: 'markdown', value: 'test hover' } };
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: hoverReq.id,
			result: hoverResult
		});

		const result = await hoverPromise;
		expect(result).toEqual(hoverResult);
	});

	it('should reject pending request on error response', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const hoverPromise = client.hover('file:///test.ts', { line: 0, character: 0 });

		const hoverCall = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/hover';
		});
		const hoverReq = JSON.parse(hoverCall![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: hoverReq.id,
			error: { code: -32600, message: 'Invalid request' }
		});

		await expect(hoverPromise).rejects.toThrow('Invalid request');
	});

	it('should invoke notification handlers', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const handler = vi.fn();
		client.onNotification('custom/event', handler);

		ws.simulateMessage({
			jsonrpc: '2.0',
			method: 'custom/event',
			params: { data: 42 }
		});

		expect(handler).toHaveBeenCalledWith({ data: 42 });
	});

	it('should allow unsubscribing from notifications', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const handler = vi.fn();
		const unsub = client.onNotification('custom/event', handler);

		ws.simulateMessage({ jsonrpc: '2.0', method: 'custom/event', params: {} });
		expect(handler).toHaveBeenCalledTimes(1);

		unsub();
		ws.simulateMessage({ jsonrpc: '2.0', method: 'custom/event', params: {} });
		expect(handler).toHaveBeenCalledTimes(1); // unchanged
	});

	it('should dispatch a notification to multiple subscribers (no overwrite)', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const a = vi.fn();
		const b = vi.fn();
		client.onNotification('custom/event', a);
		client.onNotification('custom/event', b);

		ws.simulateMessage({ jsonrpc: '2.0', method: 'custom/event', params: { n: 1 } });

		expect(a).toHaveBeenCalledWith({ n: 1 });
		expect(b).toHaveBeenCalledWith({ n: 1 });
	});

	it('should remove only the unsubscribed notification handler, leaving others', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const a = vi.fn();
		const b = vi.fn();
		const unsubA = client.onNotification('custom/event', a);
		client.onNotification('custom/event', b);

		unsubA();
		ws.simulateMessage({ jsonrpc: '2.0', method: 'custom/event', params: {} });

		expect(a).not.toHaveBeenCalled();
		expect(b).toHaveBeenCalledTimes(1);
	});

	it('should isolate errors thrown by one notification handler from the others', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const bad = vi.fn(() => {
			throw new Error('boom');
		});
		const good = vi.fn();
		client.onNotification('custom/event', bad);
		client.onNotification('custom/event', good);

		expect(() =>
			ws.simulateMessage({ jsonrpc: '2.0', method: 'custom/event', params: {} })
		).not.toThrow();
		expect(good).toHaveBeenCalledTimes(1);
	});

	it('should handle diagnostics notifications', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const diagHandler = vi.fn();
		client.on('onDiagnostics', diagHandler);

		const diagnostics = [
			{
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
				message: 'Test error',
				severity: 1
			}
		];

		ws.simulateMessage({
			jsonrpc: '2.0',
			method: 'textDocument/publishDiagnostics',
			params: { uri: 'file:///test.ts', diagnostics }
		});

		expect(diagHandler).toHaveBeenCalledWith({
			uri: 'file:///test.ts',
			diagnostics
		});

		expect(client.getDiagnostics('file:///test.ts')).toEqual(diagnostics);
	});

	it('should timeout requests', async () => {
		vi.useRealTimers();
		const { client } = await createConnectedClient({ requestTimeout: 50 });

		// Don't respond — should timeout
		await expect(client.hover('file:///test.ts', { line: 0, character: 0 })).rejects.toThrow(
			'timed out'
		);
	});
});

// ============================================================================
// Tests: LSPClient — Document Sync
// ============================================================================

describe('LSPClient — Document Sync', () => {
	it('should send didOpen notification', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		client.didOpen('file:///test.ts', 'typescript', 1, 'const x = 1;');

		const openCall = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/didOpen';
		});
		expect(openCall).toBeDefined();

		const parsed = JSON.parse(openCall![0]);
		expect(parsed.params.textDocument.uri).toBe('file:///test.ts');
		expect(parsed.params.textDocument.languageId).toBe('typescript');
		expect(parsed.params.textDocument.version).toBe(1);
		expect(parsed.params.textDocument.text).toBe('const x = 1;');
	});

	it('should send didChange notification', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		client.didOpen('file:///test.ts', 'typescript', 1, 'hello');
		client.didChange('file:///test.ts', 2, [{ text: 'world' }]);

		const changeCall = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/didChange';
		});
		expect(changeCall).toBeDefined();
		const parsed = JSON.parse(changeCall![0]);
		expect(parsed.params.textDocument.version).toBe(2);
	});

	it('should send didSave notification', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		client.didSave('file:///test.ts', 'saved content');

		const saveCall = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/didSave';
		});
		expect(saveCall).toBeDefined();
		const parsed = JSON.parse(saveCall![0]);
		expect(parsed.params.text).toBe('saved content');
	});

	it('should send didClose notification and clear caches', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		// Open and then push diagnostics
		client.didOpen('file:///test.ts', 'typescript', 1, 'x');
		ws.simulateMessage({
			jsonrpc: '2.0',
			method: 'textDocument/publishDiagnostics',
			params: { uri: 'file:///test.ts', diagnostics: [{ message: 'err' }] }
		});
		expect(client.getDiagnostics('file:///test.ts').length).toBe(1);

		// Close clears diagnostics
		client.didClose('file:///test.ts');
		expect(client.getDiagnostics('file:///test.ts')).toEqual([]);

		const closeCall = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/didClose';
		});
		expect(closeCall).toBeDefined();
	});
});

// ============================================================================
// Tests: LSPClient — Language Features
// ============================================================================

describe('LSPClient — Language Features', () => {
	it('should return empty array if completion not supported', async () => {
		vi.useRealTimers();
		const client = new LSPClient(getDefaultConfig());
		const connectPromise = client.connect();
		const ws = (client as unknown as { ws: MockWebSocket }).ws;
		ws.simulateOpen();
		const initReq = JSON.parse(ws.send.mock.calls[0][0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: initReq.id,
			result: { capabilities: {} } // No completionProvider
		});
		await connectPromise;

		const result = await client.completion('file:///test.ts', { line: 0, character: 0 });
		expect(result).toEqual([]);
	});

	it('should handle completion returning a list', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const completionPromise = client.completion('file:///test.ts', { line: 0, character: 5 });

		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/completion';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: req.id,
			result: { isIncomplete: false, items: [{ label: 'foo' }, { label: 'bar' }] }
		});

		const result = await completionPromise;
		expect(result).toEqual([{ label: 'foo' }, { label: 'bar' }]);
	});

	it('should handle completion returning an array', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const completionPromise = client.completion('file:///test.ts', { line: 0, character: 5 });

		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/completion';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: req.id,
			result: [{ label: 'baz' }]
		});

		const result = await completionPromise;
		expect(result).toEqual([{ label: 'baz' }]);
	});

	it('should handle completion returning null', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const completionPromise = client.completion('file:///test.ts', { line: 0, character: 5 });

		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/completion';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({ jsonrpc: '2.0', id: req.id, result: null });

		const result = await completionPromise;
		expect(result).toEqual([]);
	});

	it('should return null from hover when not supported', async () => {
		vi.useRealTimers();
		const client = new LSPClient(getDefaultConfig());
		const connectPromise = client.connect();
		const ws = (client as unknown as { ws: MockWebSocket }).ws;
		ws.simulateOpen();
		const initReq = JSON.parse(ws.send.mock.calls[0][0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: initReq.id,
			result: { capabilities: {} }
		});
		await connectPromise;

		expect(await client.hover('file:///test.ts', { line: 0, character: 0 })).toBeNull();
	});

	it('should request definition and normalize to array', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const defPromise = client.definition('file:///test.ts', { line: 5, character: 10 });

		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/definition';
		});
		const req = JSON.parse(call![0]);
		const singleLocation = {
			uri: 'file:///other.ts',
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }
		};
		ws.simulateMessage({ jsonrpc: '2.0', id: req.id, result: singleLocation });

		const result = await defPromise;
		expect(result).toEqual([singleLocation]);
	});

	it('should request typeDefinition', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const defPromise = client.typeDefinition('file:///test.ts', { line: 0, character: 0 });
		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/typeDefinition';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({ jsonrpc: '2.0', id: req.id, result: null });

		expect(await defPromise).toEqual([]);
	});

	it('should request references', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const refPromise = client.references('file:///test.ts', { line: 1, character: 3 });
		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/references';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: req.id,
			result: [
				{
					uri: 'file:///a.ts',
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }
				}
			]
		});

		const result = await refPromise;
		expect(result).toHaveLength(1);
	});

	it('should request codeAction', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const range = {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 5 }
		};
		const actionPromise = client.codeAction('file:///test.ts', range);
		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/codeAction';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: req.id,
			result: [{ title: 'Fix import', kind: 'quickfix' }]
		});

		const result = await actionPromise;
		expect(result).toEqual([{ title: 'Fix import', kind: 'quickfix' }]);
	});

	it('should request rename', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const renamePromise = client.rename('file:///test.ts', { line: 0, character: 4 }, 'newName');
		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/rename';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: req.id,
			result: {
				changes: {
					'file:///test.ts': [
						{
							range: { start: { line: 0, character: 4 }, end: { line: 0, character: 7 } },
							newText: 'newName'
						}
					]
				}
			}
		});

		const result = await renamePromise;
		expect(result).toBeDefined();
		expect(result!.changes).toBeDefined();
	});

	it('should request prepareRename', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const prepPromise = client.prepareRename('file:///test.ts', { line: 0, character: 4 });
		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/prepareRename';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: req.id,
			result: {
				range: { start: { line: 0, character: 4 }, end: { line: 0, character: 7 } },
				placeholder: 'foo'
			}
		});

		const result = await prepPromise;
		expect(result).toBeDefined();
	});

	it('should request formatting', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const fmtPromise = client.formatting('file:///test.ts', { tabSize: 4 });
		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/formatting';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: req.id,
			result: [
				{
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
					newText: '    '
				}
			]
		});

		const result = await fmtPromise;
		expect(result).toHaveLength(1);
	});

	it('should request signatureHelp', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const sigPromise = client.signatureHelp('file:///test.ts', { line: 0, character: 10 }, '(');
		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'textDocument/signatureHelp';
		});
		const req = JSON.parse(call![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: req.id,
			result: { signatures: [{ label: 'fn(a: number)' }], activeSignature: 0, activeParameter: 0 }
		});

		const result = await sigPromise;
		expect(result!.signatures).toHaveLength(1);
	});

	it('should request completionResolve when resolveProvider is true', async () => {
		vi.useRealTimers();
		// Create client with resolveProvider enabled
		const client = new LSPClient(getDefaultConfig());
		const connectPromise = client.connect();
		const ws = (client as unknown as { ws: MockWebSocket }).ws;
		ws.simulateOpen();
		const initReq = JSON.parse(ws.send.mock.calls[0][0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: initReq.id,
			result: {
				capabilities: {
					completionProvider: { triggerCharacters: ['.'], resolveProvider: true }
				}
			}
		});
		await connectPromise;

		const item = { label: 'foo' };
		const resolvePromise = client.completionResolve(item);
		const call = ws.send.mock.calls.find((c) => {
			const parsed = JSON.parse(c[0]);
			return parsed.method === 'completionItem/resolve';
		});
		expect(call).toBeDefined();
		const req = JSON.parse(call![0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: req.id,
			result: { label: 'foo', detail: 'Full detail' }
		});

		const result = await resolvePromise;
		expect(result.detail).toBe('Full detail');
	});

	it('should return item as-is when completionResolve not supported', async () => {
		vi.useRealTimers();
		// Create client with resolveProvider NOT enabled
		const client = new LSPClient(getDefaultConfig());
		const connectPromise = client.connect();
		const ws = (client as unknown as { ws: MockWebSocket }).ws;
		ws.simulateOpen();
		const initReq = JSON.parse(ws.send.mock.calls[0][0]);
		ws.simulateMessage({
			jsonrpc: '2.0',
			id: initReq.id,
			result: {
				capabilities: {
					completionProvider: { triggerCharacters: ['.'] } // no resolveProvider
				}
			}
		});
		await connectPromise;

		const item = { label: 'foo' };
		const result = await client.completionResolve(item);
		expect(result).toBe(item); // returned unchanged
	});
});

// ============================================================================
// Tests: LSPClient — Diagnostics Accessors
// ============================================================================

describe('LSPClient — Diagnostics', () => {
	it('should return empty diagnostics for unknown uri', () => {
		const client = new LSPClient(getDefaultConfig());
		expect(client.getDiagnostics('file:///unknown.ts')).toEqual([]);
	});

	it('should return all diagnostics map', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		ws.simulateMessage({
			jsonrpc: '2.0',
			method: 'textDocument/publishDiagnostics',
			params: { uri: 'file:///a.ts', diagnostics: [{ message: 'a' }] }
		});
		ws.simulateMessage({
			jsonrpc: '2.0',
			method: 'textDocument/publishDiagnostics',
			params: { uri: 'file:///b.ts', diagnostics: [{ message: 'b' }] }
		});

		const all = client.getAllDiagnostics();
		expect(all.size).toBe(2);
		expect(all.get('file:///a.ts')).toEqual([{ message: 'a' }]);
	});
});

// ============================================================================
// Tests: LSPClient — Utility Methods
// ============================================================================

describe('LSPClient — Utility Methods', () => {
	it('should return trigger characters from capabilities', async () => {
		vi.useRealTimers();
		const { client } = await createConnectedClient();
		expect(client.getCompletionTriggerCharacters()).toEqual(['.', ':']);
		expect(client.getSignatureHelpTriggerCharacters()).toEqual(['(', ',']);
	});

	it('should check feature support', async () => {
		vi.useRealTimers();
		const { client } = await createConnectedClient();
		expect(client.supportsFeature('completionProvider')).toBe(true);
		expect(client.supportsFeature('hoverProvider')).toBe(true);
		expect(client.supportsFeature('foldingRangeProvider' as keyof ServerCapabilities)).toBe(false);
	});

	it('should return false for supportsFeature when not connected', () => {
		const client = new LSPClient(getDefaultConfig());
		expect(client.supportsFeature('hoverProvider')).toBe(false);
	});
});

// ============================================================================
// Tests: LSPClient — Event Handler Unsubscribe
// ============================================================================

describe('LSPClient — Event Handlers', () => {
	it('should allow unsubscribing from events', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const handler = vi.fn();
		const unsub = client.on('onError', handler);

		// Trigger an error
		ws.simulateError();
		expect(handler).toHaveBeenCalledTimes(1);

		unsub();
		ws.simulateError();
		expect(handler).toHaveBeenCalledTimes(1); // no new calls
	});

	it('should dispatch an event to multiple subscribers (no overwrite)', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const a = vi.fn();
		const b = vi.fn();
		client.on('onError', a);
		client.on('onError', b);

		ws.simulateError();

		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
	});

	it('should remove only the unsubscribed event handler, leaving others active', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const a = vi.fn();
		const b = vi.fn();
		const unsubA = client.on('onError', a);
		client.on('onError', b);

		unsubA();
		ws.simulateError();

		expect(a).not.toHaveBeenCalled();
		expect(b).toHaveBeenCalledTimes(1);
	});

	it('should isolate errors thrown by one event handler from the others', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const bad = vi.fn(() => {
			throw new Error('handler boom');
		});
		const good = vi.fn();
		client.on('onError', bad);
		client.on('onError', good);

		expect(() => ws.simulateError()).not.toThrow();
		expect(good).toHaveBeenCalledTimes(1);
	});

	it('should keep the built-in diagnostics handler working alongside extra onDiagnostics subscribers', async () => {
		vi.useRealTimers();
		const { client, ws } = await createConnectedClient();

		const extra = vi.fn();
		client.on('onDiagnostics', extra);

		const diagnostics = [{ message: 'x', severity: 1 }];
		ws.simulateMessage({
			jsonrpc: '2.0',
			method: 'textDocument/publishDiagnostics',
			params: { uri: 'file:///z.ts', diagnostics }
		});

		// External subscriber fires AND the cache (built-in handler) is updated.
		expect(extra).toHaveBeenCalledWith({ uri: 'file:///z.ts', diagnostics });
		expect(client.getDiagnostics('file:///z.ts')).toEqual(diagnostics);
	});
});

// ============================================================================
// Tests: LSPClient — sendRequest error when not connected
// ============================================================================

describe('LSPClient — Not connected errors', () => {
	it('should throw when sending request while disconnected', async () => {
		vi.useRealTimers();
		const client = new LSPClient(getDefaultConfig());
		// Force capabilities so it tries to actually send the request
		(client as unknown as { _capabilities: ServerCapabilities })._capabilities = {
			hoverProvider: true
		};

		await expect(client.hover('file:///test.ts', { line: 0, character: 0 })).rejects.toThrow(
			'Not connected'
		);
	});

	it('should silently skip notifications when not connected', () => {
		const client = new LSPClient(getDefaultConfig());
		// Should not throw
		client.didSave('file:///test.ts', 'content');
	});
});
