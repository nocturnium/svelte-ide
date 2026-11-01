/**
 * LSP WebSocket Client
 * Communicates with a language server via WebSocket + JSON-RPC
 */

import type {
	LSPClientConfig,
	LSPConnectionState,
	LSPClientEvents,
	InitializeParams,
	InitializeResult,
	ServerCapabilities,
	ClientCapabilities,
	Position,
	Range,
	TextDocumentItem,
	TextDocumentContentChangeEvent,
	CompletionParams,
	CompletionItem,
	CompletionList,
	CompletionTriggerKind,
	HoverParams,
	Hover,
	SignatureHelpParams,
	SignatureHelp,
	DefinitionParams,
	ReferenceParams,
	Location,
	CodeActionParams,
	CodeAction,
	RenameParams,
	WorkspaceEdit,
	DocumentFormattingParams,
	FormattingOptions,
	TextEdit,
	PublishDiagnosticsParams,
	Diagnostic,
	JSONRPCRequest,
	JSONRPCNotification
} from '$lib/types/lsp';

// ============================================================================
// Default Client Capabilities
// ============================================================================

const DEFAULT_CLIENT_CAPABILITIES: ClientCapabilities = {
	workspace: {
		applyEdit: true,
		workspaceEdit: { documentChanges: true },
		didChangeConfiguration: { dynamicRegistration: true },
		didChangeWatchedFiles: { dynamicRegistration: true },
		symbol: { dynamicRegistration: true },
		executeCommand: { dynamicRegistration: true },
		workspaceFolders: true,
		configuration: true
	},
	textDocument: {
		synchronization: {
			dynamicRegistration: true,
			willSave: true,
			willSaveWaitUntil: true,
			didSave: true
		},
		completion: {
			dynamicRegistration: true,
			completionItem: {
				snippetSupport: true,
				commitCharactersSupport: true,
				documentationFormat: ['markdown', 'plaintext'],
				deprecatedSupport: true,
				preselectSupport: true,
				insertReplaceSupport: true,
				labelDetailsSupport: true
			},
			contextSupport: true
		},
		hover: {
			dynamicRegistration: true,
			contentFormat: ['markdown', 'plaintext']
		},
		signatureHelp: {
			dynamicRegistration: true,
			signatureInformation: {
				documentationFormat: ['markdown', 'plaintext'],
				parameterInformation: { labelOffsetSupport: true }
			},
			contextSupport: true
		},
		definition: { dynamicRegistration: true, linkSupport: true },
		typeDefinition: { dynamicRegistration: true, linkSupport: true },
		implementation: { dynamicRegistration: true, linkSupport: true },
		references: { dynamicRegistration: true },
		documentHighlight: { dynamicRegistration: true },
		documentSymbol: { dynamicRegistration: true },
		codeAction: {
			dynamicRegistration: true,
			codeActionLiteralSupport: {
				codeActionKind: {
					valueSet: [
						'quickfix',
						'refactor',
						'refactor.extract',
						'refactor.inline',
						'refactor.rewrite',
						'source',
						'source.organizeImports',
						'source.fixAll'
					]
				}
			},
			isPreferredSupport: true,
			disabledSupport: true,
			dataSupport: true,
			resolveSupport: { properties: ['edit'] }
		},
		codeLens: { dynamicRegistration: true },
		formatting: { dynamicRegistration: true },
		rangeFormatting: { dynamicRegistration: true },
		onTypeFormatting: { dynamicRegistration: true },
		rename: { dynamicRegistration: true, prepareSupport: true },
		publishDiagnostics: {
			relatedInformation: true,
			tagSupport: { valueSet: [1, 2] },
			versionSupport: true,
			codeDescriptionSupport: true,
			dataSupport: true
		}
	},
	window: {
		workDoneProgress: true,
		showMessage: { messageActionItem: { additionalPropertiesSupport: true } },
		showDocument: { support: true }
	}
};

// ============================================================================
// LSP Client Class
// ============================================================================

/** Offset of an LSP position (UTF-16 code units, which match JS strings). */
function offsetAt(text: string, pos: Position): number {
	let offset = 0;
	for (let line = 0; line < pos.line; line++) {
		const nl = text.indexOf('\n', offset);
		if (nl === -1) return text.length;
		offset = nl + 1;
	}
	const lineEnd = text.indexOf('\n', offset);
	const end = lineEnd === -1 ? text.length : lineEnd;
	return Math.min(offset + pos.character, end);
}

/** Apply LSP content changes (full or incremental) in order to a text. */
export function applyContentChanges(
	text: string,
	changes: readonly TextDocumentContentChangeEvent[]
): string {
	let result = text;
	for (const change of changes) {
		if (!change.range) {
			result = change.text;
			continue;
		}
		const start = offsetAt(result, change.range.start);
		const end = Math.max(start, offsetAt(result, change.range.end));
		result = result.slice(0, start) + change.text + result.slice(end);
	}
	return result;
}

export class LSPClient {
	private ws: WebSocket | null = null;
	private requestId = 0;
	private pendingRequests = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timeout: ReturnType<typeof setTimeout>;
		}
	>();
	// Each method may have multiple subscribers; store a Set so subscribing does
	// not clobber an existing handler and unsubscribing removes only its own.
	private notificationHandlers = new Map<string, Set<(params: unknown) => void>>();

	private _state: LSPConnectionState = 'disconnected';
	private _capabilities: ServerCapabilities | null = null;
	private reconnectAttempts = 0;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private intentionalDisconnect = false;
	private incomingBuffer = '';

	// Document tracking
	// The latest full text is kept so documents can be re-opened after a
	// reconnect (or opened late, if didOpen was called before the socket was up).
	private openDocuments = new Map<string, { version: number; languageId: string; text: string }>();
	private diagnosticsCache = new Map<string, Diagnostic[]>();

	// Event handlers. Each event may have multiple subscribers; store a Set per
	// event so on() does not overwrite a prior handler and the returned
	// unsubscribe removes only the specific callback it registered.
	private eventHandlers: {
		[K in keyof LSPClientEvents]?: Set<LSPClientEvents[K]>;
	} = {};

	constructor(private config: LSPClientConfig) {
		// Set defaults
		this.config = {
			autoReconnect: true,
			reconnectDelay: 1000,
			maxReconnectAttempts: 5,
			requestTimeout: 30000,
			debug: false,
			...config
		};

		// Register built-in notification handlers
		this.onNotification('textDocument/publishDiagnostics', (params) => {
			const diagnosticsParams = params as PublishDiagnosticsParams;
			this.diagnosticsCache.set(diagnosticsParams.uri, diagnosticsParams.diagnostics);
			this.emitEvent('onDiagnostics', diagnosticsParams);
		});
	}

	// ============================================================================
	// Connection Management
	// ============================================================================

	get state(): LSPConnectionState {
		return this._state;
	}

	get capabilities(): ServerCapabilities | null {
		return this._capabilities;
	}

	get isReady(): boolean {
		return this._state === 'ready';
	}

	/**
	 * Dispatch an event to every subscriber registered via on(). Iterates a copy
	 * so a handler that unsubscribes during dispatch cannot corrupt iteration,
	 * and isolates handler errors so one failure does not block the others.
	 */
	private emitEvent<K extends keyof LSPClientEvents>(
		event: K,
		...args: Parameters<LSPClientEvents[K]>
	): void {
		const handlers = this.eventHandlers[event] as Set<LSPClientEvents[K]> | undefined;
		if (!handlers) return;
		for (const handler of [...handlers]) {
			try {
				(handler as (...a: Parameters<LSPClientEvents[K]>) => void)(...args);
			} catch (err) {
				if (this.config.debug) {
					console.error(`[LSP] Event handler for "${String(event)}" threw:`, err);
				}
			}
		}
	}

	private setState(state: LSPConnectionState): void {
		this._state = state;
		this.emitEvent('onConnectionStateChange', state);
		if (this.config.debug) {
			console.log(`[LSP] State changed to: ${state}`);
		}
	}

	async connect(): Promise<void> {
		if (this._state !== 'disconnected' && this._state !== 'error') {
			return;
		}

		this.intentionalDisconnect = false;
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
		this.cleanupSocket();
		this.setState('connecting');

		return new Promise((resolve, reject) => {
			let settled = false;
			const settle = (err?: unknown) => {
				if (settled) return;
				settled = true;
				if (err) reject(err);
				else resolve();
			};
			try {
				const socket = new WebSocket(this.config.serverUrl);
				this.ws = socket;

				socket.onopen = async () => {
					if (socket !== this.ws) {
						settle(new Error('Connection superseded'));
						return;
					}
					if (this.reconnectTimeout) {
						clearTimeout(this.reconnectTimeout);
						this.reconnectTimeout = null;
					}
					this.reconnectAttempts = 0;
					this.setState('connected');

					try {
						await this.initialize();
						settle();
					} catch (err) {
						settle(err);
					}
				};

				socket.onclose = () => {
					// A socket that closes before (or during) initialisation must
					// settle connect(); otherwise callers awaiting it hang forever.
					settle(new Error('Connection closed'));
					this.handleDisconnect(socket);
				};

				socket.onerror = (_event) => {
					if (socket !== this.ws) return;
					const error = new Error('WebSocket error');
					this.emitEvent('onError', error);
					settle(error);
				};

				socket.onmessage = (event) => {
					if (socket !== this.ws) return;
					this.handleMessage(event.data);
				};
			} catch (err) {
				this.setState('error');
				settle(err);
			}
		});
	}

	private cleanupSocket(socket: WebSocket | null = this.ws): void {
		if (!socket) return;
		socket.onopen = null;
		socket.onclose = null;
		socket.onerror = null;
		socket.onmessage = null;
		if (socket.readyState !== WebSocket.CLOSING) {
			socket.close();
		}
		if (socket === this.ws) {
			this.ws = null;
			this.incomingBuffer = '';
		}
	}

	private getReconnectDelay(attempt: number): number {
		const baseDelay = this.config.reconnectDelay ?? 1000;
		const exponentialDelay = baseDelay * 2 ** (attempt - 1);
		const jitter = 0.75 + Math.random() * 0.5;
		return Math.round(exponentialDelay * jitter);
	}

	private handleDisconnect(socket: WebSocket | null = this.ws): void {
		// Ignore close events from sockets that have already been replaced.
		if (socket !== this.ws) return;
		const wasIntentional = this.intentionalDisconnect;
		this.cleanupSocket(socket);
		this.setState('disconnected');

		// Cancel pending requests
		for (const [_id, pending] of this.pendingRequests) {
			clearTimeout(pending.timeout);
			pending.reject(new Error('Connection closed'));
		}
		this.pendingRequests.clear();

		if (wasIntentional) {
			this.intentionalDisconnect = false;
			return;
		}

		// Auto-reconnect
		if (
			this.config.autoReconnect &&
			this.reconnectAttempts < (this.config.maxReconnectAttempts ?? 5)
		) {
			this.reconnectAttempts++;
			const delay = this.getReconnectDelay(this.reconnectAttempts);

			if (this.config.debug) {
				console.log(`[LSP] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
			}

			this.reconnectTimeout = setTimeout(() => {
				this.connect().catch((err) => {
					this.emitEvent('onError', err);
				});
			}, delay);
		}
	}

	async disconnect(): Promise<void> {
		this.intentionalDisconnect = true;
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		if (this.ws) {
			// Send shutdown request
			if (this._state === 'ready') {
				try {
					await this.sendRequest('shutdown', null);
					this.sendNotification('exit', null);
				} catch {
					// Ignore errors during shutdown
				}
			}

			this.cleanupSocket();
		}

		this.setState('disconnected');
		this.intentionalDisconnect = false;
	}

	// ============================================================================
	// Initialize
	// ============================================================================

	private async initialize(): Promise<void> {
		this.setState('initializing');

		const params: InitializeParams = {
			processId: null,
			rootUri: this.config.rootUri,
			capabilities: DEFAULT_CLIENT_CAPABILITIES,
			workspaceFolders: [
				{
					uri: this.config.rootUri,
					name: this.config.rootUri.split('/').pop() ?? 'workspace'
				}
			]
		};

		const result = (await this.sendRequest('initialize', params)) as InitializeResult;
		this._capabilities = result.capabilities;
		this.emitEvent('onServerCapabilities', result.capabilities);

		// Send initialized notification
		this.sendNotification('initialized', {});

		this.setState('ready');

		// Re-open documents that were open before a reconnect, or that were
		// opened while the socket was down. The server has no state for them.
		for (const [uri, doc] of this.openDocuments) {
			this.sendNotification('textDocument/didOpen', {
				textDocument: { uri, languageId: doc.languageId, version: doc.version, text: doc.text }
			});
		}

		if (this.config.debug) {
			console.log('[LSP] Initialized with capabilities:', result.capabilities);
		}
	}

	// ============================================================================
	// JSON-RPC Transport
	// ============================================================================

	private handleMessage(data: string): void {
		this.incomingBuffer += data;

		for (const rawMessage of this.extractCompleteMessages()) {
			try {
				const message = JSON.parse(rawMessage);
				this.dispatchMessage(message);
			} catch (err) {
				if (this.config.debug) {
					console.error('[LSP] Failed to parse message:', err);
				}
			}
		}
	}

	private extractCompleteMessages(): string[] {
		const messages: string[] = [];
		let start = -1;
		let depth = 0;
		let inString = false;
		let escaped = false;
		let consumedUntil = 0;

		for (let i = 0; i < this.incomingBuffer.length; i++) {
			const char = this.incomingBuffer[i];

			if (start === -1) {
				if (/\s/.test(char)) {
					consumedUntil = i + 1;
					continue;
				}
				if (char !== '{') {
					consumedUntil = i + 1;
					continue;
				}
				start = i;
				depth = 1;
				continue;
			}

			if (escaped) {
				escaped = false;
				continue;
			}

			if (char === '\\' && inString) {
				escaped = true;
				continue;
			}

			if (char === '"') {
				inString = !inString;
				continue;
			}

			if (inString) {
				continue;
			}

			if (char === '{') {
				depth++;
			} else if (char === '}') {
				depth--;
				if (depth === 0) {
					messages.push(this.incomingBuffer.slice(start, i + 1));
					start = -1;
					consumedUntil = i + 1;
				}
			}
		}

		this.incomingBuffer =
			start === -1 ? this.incomingBuffer.slice(consumedUntil) : this.incomingBuffer.slice(start);

		return messages;
	}

	private dispatchMessage(message: unknown): void {
		try {
			if (!message || typeof message !== 'object') {
				return;
			}

			const rpcMessage = message as {
				id?: number | string | null;
				method?: string;
				params?: unknown;
				result?: unknown;
				error?: { message: string };
			};

			if (this.config.debug) {
				console.log('[LSP] Received:', rpcMessage);
			}

			if (
				rpcMessage.method &&
				'id' in rpcMessage &&
				rpcMessage.id !== null &&
				rpcMessage.id !== undefined
			) {
				// Server -> client request. It must be answered, and its id lives in
				// the server's id space, so it must never be matched to our pending
				// requests.
				this.handleServerRequest(rpcMessage.id, rpcMessage.method, rpcMessage.params);
			} else if ('id' in rpcMessage && rpcMessage.id !== null) {
				// Response to a request
				const pending =
					typeof rpcMessage.id === 'number' ? this.pendingRequests.get(rpcMessage.id) : undefined;
				if (pending) {
					clearTimeout(pending.timeout);
					this.pendingRequests.delete(rpcMessage.id as number);

					if (rpcMessage.error) {
						pending.reject(new Error(rpcMessage.error.message));
					} else {
						pending.resolve(rpcMessage.result);
					}
				}
			} else if (rpcMessage.method) {
				// Server notification or request — dispatch to every subscriber.
				const handlers = this.notificationHandlers.get(rpcMessage.method);
				if (handlers && handlers.size > 0) {
					// Iterate a copy so a handler can unsubscribe during dispatch.
					for (const handler of [...handlers]) {
						try {
							handler(rpcMessage.params);
						} catch (err) {
							if (this.config.debug) {
								console.error(`[LSP] Notification handler for "${rpcMessage.method}" threw:`, err);
							}
						}
					}
				} else if (this.config.debug) {
					console.log(`[LSP] Unhandled notification: ${rpcMessage.method}`);
				}
			}
		} catch (err) {
			if (this.config.debug) {
				console.error('[LSP] Failed to handle message:', err);
			}
		}
	}

	/**
	 * Answer a request the server sent us. Subscribers registered with
	 * onNotification() for the method are still called (for observation); the
	 * reply is a sensible default so servers that block on these (for example
	 * workspace/configuration or client/registerCapability) keep working.
	 */
	private handleServerRequest(id: number | string, method: string, params: unknown): void {
		const handlers = this.notificationHandlers.get(method);
		if (handlers) {
			for (const handler of [...handlers]) {
				try {
					handler(params);
				} catch (err) {
					if (this.config.debug) {
						console.error(`[LSP] Request handler for "${method}" threw:`, err);
					}
				}
			}
		}

		let response: Record<string, unknown>;
		switch (method) {
			case 'workspace/configuration': {
				const items = (params as { items?: unknown[] } | undefined)?.items ?? [];
				response = { result: items.map(() => null) };
				break;
			}
			case 'client/registerCapability':
			case 'client/unregisterCapability':
			case 'window/workDoneProgress/create':
			case 'window/showMessageRequest':
			case 'workspace/semanticTokens/refresh':
			case 'workspace/inlayHint/refresh':
			case 'workspace/codeLens/refresh':
			case 'workspace/diagnostic/refresh':
				response = { result: null };
				break;
			case 'workspace/workspaceFolders':
				response = {
					result: [
						{ uri: this.config.rootUri, name: this.config.rootUri.split('/').pop() ?? 'workspace' }
					]
				};
				break;
			case 'workspace/applyEdit':
				response = { result: { applied: false, failureReason: 'Not supported by this client' } };
				break;
			default:
				response = { error: { code: -32601, message: `Method not found: ${method}` } };
		}

		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, ...response }));
	}

	private async sendRequest<T>(method: string, params: unknown): Promise<T> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error('Not connected to LSP server');
		}

		const id = ++this.requestId;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request ${method} timed out`));
			}, this.config.requestTimeout ?? 30000);

			this.pendingRequests.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timeout
			});

			const request: JSONRPCRequest = {
				jsonrpc: '2.0',
				id,
				method,
				params
			};

			if (this.config.debug) {
				console.log('[LSP] Sending:', request);
			}

			this.ws!.send(JSON.stringify(request));
		});
	}

	private sendNotification(method: string, params: unknown): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return;
		}

		const notification: JSONRPCNotification = {
			jsonrpc: '2.0',
			method,
			params
		};

		if (this.config.debug) {
			console.log('[LSP] Sending notification:', notification);
		}

		this.ws.send(JSON.stringify(notification));
	}

	onNotification(method: string, handler: (params: unknown) => void): () => void {
		let handlers = this.notificationHandlers.get(method);
		if (!handlers) {
			handlers = new Set();
			this.notificationHandlers.set(method, handlers);
		}
		handlers.add(handler);

		// Unsubscribe removes only this specific callback, leaving any other
		// subscribers to the same method intact.
		return () => {
			const set = this.notificationHandlers.get(method);
			if (!set) return;
			set.delete(handler);
			if (set.size === 0) {
				this.notificationHandlers.delete(method);
			}
		};
	}

	// ============================================================================
	// Event Handlers
	// ============================================================================

	on<K extends keyof LSPClientEvents>(event: K, handler: LSPClientEvents[K]): () => void {
		let handlers = this.eventHandlers[event] as Set<LSPClientEvents[K]> | undefined;
		if (!handlers) {
			handlers = new Set<LSPClientEvents[K]>();
			(this.eventHandlers as Record<string, Set<unknown>>)[event] = handlers as Set<unknown>;
		}
		handlers.add(handler);

		// Unsubscribe removes only this specific callback, leaving any other
		// subscribers to the same event intact.
		return () => {
			const set = this.eventHandlers[event] as Set<LSPClientEvents[K]> | undefined;
			if (!set) return;
			set.delete(handler);
			if (set.size === 0) {
				delete this.eventHandlers[event];
			}
		};
	}

	// ============================================================================
	// Document Sync
	// ============================================================================

	didOpen(uri: string, languageId: string, version: number, text: string): void {
		this.openDocuments.set(uri, { version, languageId, text });
		// Before initialisation the server cannot accept documents; initialize()
		// replays everything in openDocuments once the server is ready.
		if (this._state !== 'ready') return;

		const params: TextDocumentItem = {
			uri,
			languageId,
			version,
			text
		};

		this.sendNotification('textDocument/didOpen', { textDocument: params });
	}

	didChange(uri: string, version: number, changes: TextDocumentContentChangeEvent[]): void {
		const doc = this.openDocuments.get(uri);
		if (doc) {
			doc.version = version;
			// Keep the replay snapshot current so a reconnect re-opens the
			// document with the text the editor actually has.
			doc.text = applyContentChanges(doc.text, changes);
		}
		if (this._state !== 'ready') return;

		this.sendNotification('textDocument/didChange', {
			textDocument: { uri, version },
			contentChanges: changes
		});
	}

	didSave(uri: string, text?: string): void {
		this.sendNotification('textDocument/didSave', {
			textDocument: { uri },
			text
		});
	}

	didClose(uri: string): void {
		this.openDocuments.delete(uri);
		this.diagnosticsCache.delete(uri);

		this.sendNotification('textDocument/didClose', {
			textDocument: { uri }
		});
	}

	// ============================================================================
	// Completion
	// ============================================================================

	async completion(
		uri: string,
		position: Position,
		triggerKind: CompletionTriggerKind = 1,
		triggerCharacter?: string
	): Promise<CompletionItem[]> {
		if (!this._capabilities?.completionProvider) {
			return [];
		}

		const params: CompletionParams = {
			textDocument: { uri },
			position,
			context: { triggerKind, triggerCharacter }
		};

		const result = await this.sendRequest<CompletionList | CompletionItem[] | null>(
			'textDocument/completion',
			params
		);

		if (!result) return [];
		if (Array.isArray(result)) return result;
		return result.items;
	}

	async completionResolve(item: CompletionItem): Promise<CompletionItem> {
		if (!this._capabilities?.completionProvider?.resolveProvider) {
			return item;
		}

		return this.sendRequest<CompletionItem>('completionItem/resolve', item);
	}

	// ============================================================================
	// Hover
	// ============================================================================

	async hover(uri: string, position: Position): Promise<Hover | null> {
		if (!this._capabilities?.hoverProvider) {
			return null;
		}

		const params: HoverParams = {
			textDocument: { uri },
			position
		};

		return this.sendRequest<Hover | null>('textDocument/hover', params);
	}

	// ============================================================================
	// Signature Help
	// ============================================================================

	async signatureHelp(
		uri: string,
		position: Position,
		triggerCharacter?: string
	): Promise<SignatureHelp | null> {
		if (!this._capabilities?.signatureHelpProvider) {
			return null;
		}

		const params: SignatureHelpParams = {
			textDocument: { uri },
			position,
			context: {
				triggerKind: triggerCharacter ? 2 : 1,
				triggerCharacter,
				isRetrigger: false
			}
		};

		return this.sendRequest<SignatureHelp | null>('textDocument/signatureHelp', params);
	}

	// ============================================================================
	// Go to Definition
	// ============================================================================

	async definition(uri: string, position: Position): Promise<Location[]> {
		if (!this._capabilities?.definitionProvider) {
			return [];
		}

		const params: DefinitionParams = {
			textDocument: { uri },
			position
		};

		const result = await this.sendRequest<Location | Location[] | null>(
			'textDocument/definition',
			params
		);

		if (!result) return [];
		return Array.isArray(result) ? result : [result];
	}

	async typeDefinition(uri: string, position: Position): Promise<Location[]> {
		if (!this._capabilities?.typeDefinitionProvider) {
			return [];
		}

		const result = await this.sendRequest<Location | Location[] | null>(
			'textDocument/typeDefinition',
			{ textDocument: { uri }, position }
		);

		if (!result) return [];
		return Array.isArray(result) ? result : [result];
	}

	// ============================================================================
	// References
	// ============================================================================

	async references(
		uri: string,
		position: Position,
		includeDeclaration = true
	): Promise<Location[]> {
		if (!this._capabilities?.referencesProvider) {
			return [];
		}

		const params: ReferenceParams = {
			textDocument: { uri },
			position,
			context: { includeDeclaration }
		};

		const result = await this.sendRequest<Location[] | null>('textDocument/references', params);

		return result ?? [];
	}

	// ============================================================================
	// Code Actions
	// ============================================================================

	async codeAction(
		uri: string,
		range: Range,
		diagnostics: Diagnostic[] = []
	): Promise<CodeAction[]> {
		if (!this._capabilities?.codeActionProvider) {
			return [];
		}

		const params: CodeActionParams = {
			textDocument: { uri },
			range,
			context: { diagnostics }
		};

		const result = await this.sendRequest<CodeAction[] | null>('textDocument/codeAction', params);

		return result ?? [];
	}

	// ============================================================================
	// Rename
	// ============================================================================

	async prepareRename(
		uri: string,
		position: Position
	): Promise<Range | { range: Range; placeholder: string } | null> {
		const renameOptions = this._capabilities?.renameProvider;
		if (!renameOptions || (typeof renameOptions === 'object' && !renameOptions.prepareProvider)) {
			return null;
		}

		return this.sendRequest<Range | { range: Range; placeholder: string } | null>(
			'textDocument/prepareRename',
			{ textDocument: { uri }, position }
		);
	}

	async rename(uri: string, position: Position, newName: string): Promise<WorkspaceEdit | null> {
		if (!this._capabilities?.renameProvider) {
			return null;
		}

		const params: RenameParams = {
			textDocument: { uri },
			position,
			newName
		};

		return this.sendRequest<WorkspaceEdit | null>('textDocument/rename', params);
	}

	// ============================================================================
	// Formatting
	// ============================================================================

	async formatting(uri: string, options?: Partial<FormattingOptions>): Promise<TextEdit[]> {
		if (!this._capabilities?.documentFormattingProvider) {
			return [];
		}

		const params: DocumentFormattingParams = {
			textDocument: { uri },
			options: {
				tabSize: options?.tabSize ?? 2,
				insertSpaces: options?.insertSpaces ?? true,
				trimTrailingWhitespace: options?.trimTrailingWhitespace,
				insertFinalNewline: options?.insertFinalNewline,
				trimFinalNewlines: options?.trimFinalNewlines
			}
		};

		const result = await this.sendRequest<TextEdit[] | null>('textDocument/formatting', params);

		return result ?? [];
	}

	// ============================================================================
	// Diagnostics
	// ============================================================================

	getDiagnostics(uri: string): Diagnostic[] {
		return this.diagnosticsCache.get(uri) ?? [];
	}

	getAllDiagnostics(): Map<string, Diagnostic[]> {
		return new Map(this.diagnosticsCache);
	}

	// ============================================================================
	// Utility Methods
	// ============================================================================

	getCompletionTriggerCharacters(): string[] {
		return this._capabilities?.completionProvider?.triggerCharacters ?? [];
	}

	getSignatureHelpTriggerCharacters(): string[] {
		return this._capabilities?.signatureHelpProvider?.triggerCharacters ?? [];
	}

	supportsFeature(feature: keyof ServerCapabilities): boolean {
		if (!this._capabilities) return false;
		return !!this._capabilities[feature];
	}
}

// ============================================================================
// Factory Function
// ============================================================================

export function createLSPClient(config: LSPClientConfig): LSPClient {
	return new LSPClient(config);
}

// ============================================================================
// Helper: Position Utilities
// ============================================================================

export function positionToOffset(content: string, position: Position): number {
	const lines = content.split('\n');
	let offset = 0;

	for (let i = 0; i < position.line && i < lines.length; i++) {
		offset += lines[i].length + 1; // +1 for newline
	}

	offset += Math.min(position.character, lines[position.line]?.length ?? 0);
	return offset;
}

export function offsetToPosition(content: string, offset: number): Position {
	const lines = content.split('\n');
	let remaining = offset;

	for (let line = 0; line < lines.length; line++) {
		if (remaining <= lines[line].length) {
			return { line, character: remaining };
		}
		remaining -= lines[line].length + 1;
	}

	// Past end of document
	return {
		line: lines.length - 1,
		character: lines[lines.length - 1]?.length ?? 0
	};
}

export function rangeToOffsets(content: string, range: Range): { start: number; end: number } {
	return {
		start: positionToOffset(content, range.start),
		end: positionToOffset(content, range.end)
	};
}
