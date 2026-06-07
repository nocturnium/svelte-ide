/**
 * Language Server Protocol (LSP) Type Definitions
 * Based on LSP 3.17 specification
 */

// ============================================================================
// Basic Types
// ============================================================================

/** Position in a text document (0-indexed) */
export interface Position {
	/** Line position (0-indexed) */
	line: number;
	/** Character offset on line (0-indexed, UTF-16 code units) */
	character: number;
}

/** A range in a text document */
export interface Range {
	/** Start position (inclusive) */
	start: Position;
	/** End position (exclusive) */
	end: Position;
}

/** Represents a location inside a resource */
export interface Location {
	uri: string;
	range: Range;
}

/** A text edit applicable to a document */
export interface TextEdit {
	/** The range to replace */
	range: Range;
	/** The string to insert (empty string for delete) */
	newText: string;
}

/** Describes textual changes on a single text document */
export interface TextDocumentEdit {
	textDocument: VersionedTextDocumentIdentifier;
	edits: TextEdit[];
}

/** An identifier to denote a specific version of a text document */
export interface VersionedTextDocumentIdentifier {
	uri: string;
	version: number;
}

/** A workspace edit represents changes to many resources */
export interface WorkspaceEdit {
	changes?: { [uri: string]: TextEdit[] };
	documentChanges?: TextDocumentEdit[];
}

/** Markup content for documentation */
export interface MarkupContent {
	kind: 'plaintext' | 'markdown';
	value: string;
}

// ============================================================================
// Document Sync
// ============================================================================

/** How documents are synced to the server */
export enum TextDocumentSyncKind {
	None = 0,
	Full = 1,
	Incremental = 2
}

/** An event describing a change to a text document */
export interface TextDocumentContentChangeEvent {
	/** The range that got replaced (for incremental sync) */
	range?: Range;
	/** The length of the range that got replaced (deprecated) */
	rangeLength?: number;
	/** The new text for the range/document */
	text: string;
}

/** Parameters for textDocument/didOpen */
export interface DidOpenTextDocumentParams {
	textDocument: TextDocumentItem;
}

/** An item to transfer a text document from the client to the server */
export interface TextDocumentItem {
	uri: string;
	languageId: string;
	version: number;
	text: string;
}

/** Parameters for textDocument/didChange */
export interface DidChangeTextDocumentParams {
	textDocument: VersionedTextDocumentIdentifier;
	contentChanges: TextDocumentContentChangeEvent[];
}

/** Parameters for textDocument/didClose */
export interface DidCloseTextDocumentParams {
	textDocument: { uri: string };
}

/** Parameters for textDocument/didSave */
export interface DidSaveTextDocumentParams {
	textDocument: { uri: string };
	text?: string;
}

// ============================================================================
// Diagnostics
// ============================================================================

/** Diagnostic severity levels */
export enum DiagnosticSeverity {
	Error = 1,
	Warning = 2,
	Information = 3,
	Hint = 4
}

/** Diagnostic tags */
export enum DiagnosticTag {
	Unnecessary = 1,
	Deprecated = 2
}

/** Related diagnostic information */
export interface DiagnosticRelatedInformation {
	location: Location;
	message: string;
}

/** Represents a diagnostic (error, warning, hint) */
export interface Diagnostic {
	/** The range at which the diagnostic applies */
	range: Range;
	/** The diagnostic's severity */
	severity?: DiagnosticSeverity;
	/** The diagnostic's code (string or number) */
	code?: string | number;
	/** A human-readable string describing the source */
	source?: string;
	/** The diagnostic's message */
	message: string;
	/** Additional metadata about the diagnostic */
	tags?: DiagnosticTag[];
	/** Related diagnostic information */
	relatedInformation?: DiagnosticRelatedInformation[];
	/** Additional data for code actions */
	data?: unknown;
}

/** Parameters for textDocument/publishDiagnostics */
export interface PublishDiagnosticsParams {
	uri: string;
	version?: number;
	diagnostics: Diagnostic[];
}

// ============================================================================
// Completion
// ============================================================================

/** Completion item kinds */
export enum CompletionItemKind {
	Text = 1,
	Method = 2,
	Function = 3,
	Constructor = 4,
	Field = 5,
	Variable = 6,
	Class = 7,
	Interface = 8,
	Module = 9,
	Property = 10,
	Unit = 11,
	Value = 12,
	Enum = 13,
	Keyword = 14,
	Snippet = 15,
	Color = 16,
	File = 17,
	Reference = 18,
	Folder = 19,
	EnumMember = 20,
	Constant = 21,
	Struct = 22,
	Event = 23,
	Operator = 24,
	TypeParameter = 25
}

/** Insert text format */
export enum InsertTextFormat {
	PlainText = 1,
	Snippet = 2
}

/** Completion item insert text mode */
export enum InsertTextMode {
	AsIs = 1,
	AdjustIndentation = 2
}

/** A completion item */
export interface CompletionItem {
	/** The label of this completion item */
	label: string;
	/** Additional details for the label */
	labelDetails?: CompletionItemLabelDetails;
	/** The kind of this completion item */
	kind?: CompletionItemKind;
	/** Tags for this completion item */
	tags?: number[];
	/** A human-readable string with additional information */
	detail?: string;
	/** A human-readable string that represents documentation */
	documentation?: string | MarkupContent;
	/** Select this item when showing */
	preselect?: boolean;
	/** A string that should be used when comparing this item */
	sortText?: string;
	/** A string that should be used when filtering */
	filterText?: string;
	/** A string that should be inserted */
	insertText?: string;
	/** The format of the insert text */
	insertTextFormat?: InsertTextFormat;
	/** How whitespace should be handled */
	insertTextMode?: InsertTextMode;
	/** An edit which is applied when selecting this completion */
	textEdit?: TextEdit;
	/** Additional text edits */
	additionalTextEdits?: TextEdit[];
	/** Characters that trigger commit */
	commitCharacters?: string[];
	/** A command to execute after insertion */
	command?: Command;
	/** Additional data to resolve later */
	data?: unknown;
}

/** Additional details for a completion item label */
export interface CompletionItemLabelDetails {
	detail?: string;
	description?: string;
}

/** Represents a collection of completion items */
export interface CompletionList {
	isIncomplete: boolean;
	items: CompletionItem[];
}

/** Parameters for textDocument/completion */
export interface CompletionParams {
	textDocument: { uri: string };
	position: Position;
	context?: CompletionContext;
}

/** Context for a completion request */
export interface CompletionContext {
	triggerKind: CompletionTriggerKind;
	triggerCharacter?: string;
}

/** How a completion was triggered */
export enum CompletionTriggerKind {
	Invoked = 1,
	TriggerCharacter = 2,
	TriggerForIncompleteCompletions = 3
}

// ============================================================================
// Hover
// ============================================================================

/** The result of a hover request */
export interface Hover {
	/** The hover's content */
	contents: MarkupContent | string | { language: string; value: string };
	/** Optional range to highlight */
	range?: Range;
}

/** Parameters for textDocument/hover */
export interface HoverParams {
	textDocument: { uri: string };
	position: Position;
}

// ============================================================================
// Signature Help
// ============================================================================

/** Signature help represents the signature of something callable */
export interface SignatureHelp {
	/** One or more signatures */
	signatures: SignatureInformation[];
	/** The active signature */
	activeSignature?: number;
	/** The active parameter of the active signature */
	activeParameter?: number;
}

/** Represents the signature of something callable */
export interface SignatureInformation {
	/** The label of this signature */
	label: string;
	/** The human-readable documentation */
	documentation?: string | MarkupContent;
	/** The parameters of this signature */
	parameters?: ParameterInformation[];
	/** The index of the active parameter */
	activeParameter?: number;
}

/** Represents a parameter of a callable-signature */
export interface ParameterInformation {
	/** The label of this parameter */
	label: string | [number, number];
	/** The human-readable documentation */
	documentation?: string | MarkupContent;
}

/** Parameters for textDocument/signatureHelp */
export interface SignatureHelpParams {
	textDocument: { uri: string };
	position: Position;
	context?: SignatureHelpContext;
}

/** Additional information about the context in which a signature help request was triggered */
export interface SignatureHelpContext {
	triggerKind: SignatureHelpTriggerKind;
	triggerCharacter?: string;
	isRetrigger: boolean;
	activeSignatureHelp?: SignatureHelp;
}

/** How a signature help was triggered */
export enum SignatureHelpTriggerKind {
	Invoked = 1,
	TriggerCharacter = 2,
	ContentChange = 3
}

// ============================================================================
// Go to Definition / References
// ============================================================================

/** Parameters for textDocument/definition */
export interface DefinitionParams {
	textDocument: { uri: string };
	position: Position;
}

/** Parameters for textDocument/references */
export interface ReferenceParams {
	textDocument: { uri: string };
	position: Position;
	context: ReferenceContext;
}

/** Reference context */
export interface ReferenceContext {
	includeDeclaration: boolean;
}

// ============================================================================
// Code Actions
// ============================================================================

/** A code action represents a change that can be performed in code */
export interface CodeAction {
	/** A short, human-readable title */
	title: string;
	/** The kind of the code action */
	kind?: CodeActionKind;
	/** The diagnostics that this code action resolves */
	diagnostics?: Diagnostic[];
	/** Marks this as a preferred action */
	isPreferred?: boolean;
	/** The workspace edit this code action performs */
	edit?: WorkspaceEdit;
	/** A command to execute */
	command?: Command;
	/** Additional data */
	data?: unknown;
}

/** Code action kinds */
export type CodeActionKind =
	| 'quickfix'
	| 'refactor'
	| 'refactor.extract'
	| 'refactor.inline'
	| 'refactor.rewrite'
	| 'source'
	| 'source.organizeImports'
	| 'source.fixAll';

/** Parameters for textDocument/codeAction */
export interface CodeActionParams {
	textDocument: { uri: string };
	range: Range;
	context: CodeActionContext;
}

/** Context for a code action request */
export interface CodeActionContext {
	diagnostics: Diagnostic[];
	only?: CodeActionKind[];
	triggerKind?: CodeActionTriggerKind;
}

/** How a code action was triggered */
export enum CodeActionTriggerKind {
	Invoked = 1,
	Automatic = 2
}

// ============================================================================
// Rename
// ============================================================================

/** Parameters for textDocument/rename */
export interface RenameParams {
	textDocument: { uri: string };
	position: Position;
	newName: string;
}

/** Parameters for textDocument/prepareRename */
export interface PrepareRenameParams {
	textDocument: { uri: string };
	position: Position;
}

// ============================================================================
// Formatting
// ============================================================================

/** Parameters for textDocument/formatting */
export interface DocumentFormattingParams {
	textDocument: { uri: string };
	options: FormattingOptions;
}

/** Formatting options */
export interface FormattingOptions {
	tabSize: number;
	insertSpaces: boolean;
	trimTrailingWhitespace?: boolean;
	insertFinalNewline?: boolean;
	trimFinalNewlines?: boolean;
}

// ============================================================================
// Commands
// ============================================================================

/** Represents a reference to a command */
export interface Command {
	/** Title of the command */
	title: string;
	/** The identifier of the actual command handler */
	command: string;
	/** Arguments to the command handler */
	arguments?: unknown[];
}

// ============================================================================
// Server Capabilities
// ============================================================================

/** Defines the capabilities provided by a language server */
export interface ServerCapabilities {
	textDocumentSync?: TextDocumentSyncKind | TextDocumentSyncOptions;
	completionProvider?: CompletionOptions;
	hoverProvider?: boolean;
	signatureHelpProvider?: SignatureHelpOptions;
	definitionProvider?: boolean;
	typeDefinitionProvider?: boolean;
	implementationProvider?: boolean;
	referencesProvider?: boolean;
	documentHighlightProvider?: boolean;
	documentSymbolProvider?: boolean;
	codeActionProvider?: boolean | CodeActionOptions;
	codeLensProvider?: CodeLensOptions;
	documentFormattingProvider?: boolean;
	documentRangeFormattingProvider?: boolean;
	documentOnTypeFormattingProvider?: DocumentOnTypeFormattingOptions;
	renameProvider?: boolean | RenameOptions;
	documentLinkProvider?: DocumentLinkOptions;
	executeCommandProvider?: ExecuteCommandOptions;
	workspaceSymbolProvider?: boolean;
}

/** Text document sync options */
export interface TextDocumentSyncOptions {
	openClose?: boolean;
	change?: TextDocumentSyncKind;
	save?: boolean | { includeText?: boolean };
}

/** Completion options */
export interface CompletionOptions {
	triggerCharacters?: string[];
	resolveProvider?: boolean;
}

/** Signature help options */
export interface SignatureHelpOptions {
	triggerCharacters?: string[];
	retriggerCharacters?: string[];
}

/** Code action options */
export interface CodeActionOptions {
	codeActionKinds?: CodeActionKind[];
	resolveProvider?: boolean;
}

/** Code lens options */
export interface CodeLensOptions {
	resolveProvider?: boolean;
}

/** Document on type formatting options */
export interface DocumentOnTypeFormattingOptions {
	firstTriggerCharacter: string;
	moreTriggerCharacter?: string[];
}

/** Rename options */
export interface RenameOptions {
	prepareProvider?: boolean;
}

/** Document link options */
export interface DocumentLinkOptions {
	resolveProvider?: boolean;
}

/** Execute command options */
export interface ExecuteCommandOptions {
	commands: string[];
}

// ============================================================================
// Initialize
// ============================================================================

/** Parameters for the initialize request */
export interface InitializeParams {
	processId: number | null;
	rootUri: string | null;
	capabilities: ClientCapabilities;
	initializationOptions?: unknown;
	trace?: 'off' | 'messages' | 'verbose';
	workspaceFolders?: WorkspaceFolder[] | null;
}

/** Workspace folder */
export interface WorkspaceFolder {
	uri: string;
	name: string;
}

/** Client capabilities */
export interface ClientCapabilities {
	workspace?: {
		applyEdit?: boolean;
		workspaceEdit?: { documentChanges?: boolean };
		didChangeConfiguration?: { dynamicRegistration?: boolean };
		didChangeWatchedFiles?: { dynamicRegistration?: boolean };
		symbol?: { dynamicRegistration?: boolean };
		executeCommand?: { dynamicRegistration?: boolean };
		workspaceFolders?: boolean;
		configuration?: boolean;
	};
	textDocument?: {
		synchronization?: {
			dynamicRegistration?: boolean;
			willSave?: boolean;
			willSaveWaitUntil?: boolean;
			didSave?: boolean;
		};
		completion?: {
			dynamicRegistration?: boolean;
			completionItem?: {
				snippetSupport?: boolean;
				commitCharactersSupport?: boolean;
				documentationFormat?: ('plaintext' | 'markdown')[];
				deprecatedSupport?: boolean;
				preselectSupport?: boolean;
				insertReplaceSupport?: boolean;
				labelDetailsSupport?: boolean;
			};
			completionItemKind?: { valueSet?: CompletionItemKind[] };
			contextSupport?: boolean;
		};
		hover?: {
			dynamicRegistration?: boolean;
			contentFormat?: ('plaintext' | 'markdown')[];
		};
		signatureHelp?: {
			dynamicRegistration?: boolean;
			signatureInformation?: {
				documentationFormat?: ('plaintext' | 'markdown')[];
				parameterInformation?: { labelOffsetSupport?: boolean };
			};
			contextSupport?: boolean;
		};
		declaration?: { dynamicRegistration?: boolean; linkSupport?: boolean };
		definition?: { dynamicRegistration?: boolean; linkSupport?: boolean };
		typeDefinition?: { dynamicRegistration?: boolean; linkSupport?: boolean };
		implementation?: { dynamicRegistration?: boolean; linkSupport?: boolean };
		references?: { dynamicRegistration?: boolean };
		documentHighlight?: { dynamicRegistration?: boolean };
		documentSymbol?: { dynamicRegistration?: boolean };
		codeAction?: {
			dynamicRegistration?: boolean;
			codeActionLiteralSupport?: { codeActionKind: { valueSet: CodeActionKind[] } };
			isPreferredSupport?: boolean;
			disabledSupport?: boolean;
			dataSupport?: boolean;
			resolveSupport?: { properties: string[] };
		};
		codeLens?: { dynamicRegistration?: boolean };
		formatting?: { dynamicRegistration?: boolean };
		rangeFormatting?: { dynamicRegistration?: boolean };
		onTypeFormatting?: { dynamicRegistration?: boolean };
		rename?: { dynamicRegistration?: boolean; prepareSupport?: boolean };
		publishDiagnostics?: {
			relatedInformation?: boolean;
			tagSupport?: { valueSet: DiagnosticTag[] };
			versionSupport?: boolean;
			codeDescriptionSupport?: boolean;
			dataSupport?: boolean;
		};
	};
	window?: {
		workDoneProgress?: boolean;
		showMessage?: { messageActionItem?: { additionalPropertiesSupport?: boolean } };
		showDocument?: { support?: boolean };
	};
}

/** The result of the initialize request */
export interface InitializeResult {
	capabilities: ServerCapabilities;
	serverInfo?: { name: string; version?: string };
}

// ============================================================================
// JSON-RPC Types
// ============================================================================

/** JSON-RPC request */
export interface JSONRPCRequest {
	jsonrpc: '2.0';
	id: number | string;
	method: string;
	params?: unknown;
}

/** JSON-RPC response */
export interface JSONRPCResponse {
	jsonrpc: '2.0';
	id: number | string | null;
	result?: unknown;
	error?: JSONRPCError;
}

/** JSON-RPC notification (no id, no response expected) */
export interface JSONRPCNotification {
	jsonrpc: '2.0';
	method: string;
	params?: unknown;
}

/** JSON-RPC error */
export interface JSONRPCError {
	code: number;
	message: string;
	data?: unknown;
}

/** Standard JSON-RPC error codes */
export enum JSONRPCErrorCode {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603,
	ServerNotInitialized = -32002,
	UnknownErrorCode = -32001,
	RequestCancelled = -32800,
	ContentModified = -32801
}

// ============================================================================
// LSP Client Configuration
// ============================================================================

/** Configuration for the LSP client */
export interface LSPClientConfig {
	/** WebSocket URL to connect to */
	serverUrl: string;
	/** Root URI of the workspace */
	rootUri: string;
	/** Auto-reconnect on disconnect */
	autoReconnect?: boolean;
	/** Reconnect delay in ms */
	reconnectDelay?: number;
	/** Maximum reconnect attempts */
	maxReconnectAttempts?: number;
	/** Request timeout in ms */
	requestTimeout?: number;
	/** Debug mode (logs all messages) */
	debug?: boolean;
}

/** LSP client connection state */
export type LSPConnectionState =
	| 'disconnected'
	| 'connecting'
	| 'connected'
	| 'initializing'
	| 'ready'
	| 'error';

/** LSP client events */
export interface LSPClientEvents {
	onConnectionStateChange: (state: LSPConnectionState) => void;
	onDiagnostics: (params: PublishDiagnosticsParams) => void;
	onError: (error: Error) => void;
	onServerCapabilities: (capabilities: ServerCapabilities) => void;
}
