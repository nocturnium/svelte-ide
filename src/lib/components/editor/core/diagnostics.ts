/**
 * Diagnostics Manager
 *
 * Manages code diagnostics including:
 * - Errors, warnings, info, hints
 * - Quick fixes and code actions
 * - Diagnostic sources (TypeScript, ESLint, etc.)
 */

export interface Position {
	line: number;
	column: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface DiagnosticRelatedInfo {
	/** Location of related info */
	range: Range;
	/** Message */
	message: string;
	/** File path if different from main diagnostic */
	filePath?: string;
}

export interface DiagnosticTag {
	/** Deprecated code */
	deprecated?: boolean;
	/** Unnecessary code (e.g., unused imports) */
	unnecessary?: boolean;
}

export interface Diagnostic {
	/** Unique identifier */
	id: string;
	/** Range of the diagnostic */
	range: Range;
	/** Severity level */
	severity: DiagnosticSeverity;
	/** Main message */
	message: string;
	/** Source of the diagnostic (e.g., "typescript", "eslint") */
	source: string;
	/** Error/warning code */
	code?: string | number;
	/** URL for more information */
	codeUrl?: string;
	/** Related information */
	relatedInfo?: DiagnosticRelatedInfo[];
	/** Tags for special rendering */
	tags?: DiagnosticTag;
	/** Suggested fixes */
	fixes?: DiagnosticFix[];
}

export interface DiagnosticFix {
	/** Fix title */
	title: string;
	/** Whether this is the preferred fix */
	isPreferred?: boolean;
	/** Text edits to apply */
	edits: TextEdit[];
}

export interface TextEdit {
	/** Range to replace */
	range: Range;
	/** New text */
	newText: string;
}

export interface DiagnosticFilter {
	/** Filter by severity */
	severity?: DiagnosticSeverity[];
	/** Filter by source */
	source?: string[];
	/** Filter by file path */
	filePath?: string;
	/** Search text in messages */
	searchText?: string;
}

export interface DiagnosticsConfig {
	/** Whether diagnostics are enabled */
	enabled: boolean;
	/** Show inline decorations */
	showInline: boolean;
	/** Show gutter icons */
	showGutterIcons: boolean;
	/** Delay before showing diagnostics (ms) */
	showDelay: number;
	/** Maximum diagnostics per file */
	maxPerFile: number;
	/** Severity to show (filter) */
	severityFilter: DiagnosticSeverity[];
}

type Listener = () => void;

/**
 * Diagnostics Manager
 */
export class DiagnosticsManager {
	private _config: DiagnosticsConfig = {
		enabled: true,
		showInline: true,
		showGutterIcons: true,
		showDelay: 500,
		maxPerFile: 100,
		severityFilter: ['error', 'warning', 'info', 'hint']
	};

	private _diagnostics: Map<string, Diagnostic[]> = new Map();
	private _listeners: Set<Listener> = new Set();
	private _idCounter = 0;

	/**
	 * Set diagnostics for a file
	 */
	setDiagnostics(filePath: string, diagnostics: Omit<Diagnostic, 'id'>[]): void {
		const withIds = diagnostics.map((d) => ({
			...d,
			id: `diag-${++this._idCounter}`
		}));

		// Limit per file
		const limited = withIds.slice(0, this._config.maxPerFile);
		this._diagnostics.set(filePath, limited);
		this.notify();
	}

	/**
	 * Add diagnostics to a file
	 */
	addDiagnostics(filePath: string, diagnostics: Omit<Diagnostic, 'id'>[]): void {
		const existing = this._diagnostics.get(filePath) || [];
		const withIds = diagnostics.map((d) => ({
			...d,
			id: `diag-${++this._idCounter}`
		}));

		const combined = [...existing, ...withIds].slice(0, this._config.maxPerFile);
		this._diagnostics.set(filePath, combined);
		this.notify();
	}

	/**
	 * Clear diagnostics for a file
	 */
	clearDiagnostics(filePath: string): void {
		this._diagnostics.delete(filePath);
		this.notify();
	}

	/**
	 * Clear all diagnostics
	 */
	clearAll(): void {
		this._diagnostics.clear();
		this.notify();
	}

	/**
	 * Get diagnostics for a file
	 */
	getDiagnostics(filePath: string): Diagnostic[] {
		const diagnostics = this._diagnostics.get(filePath) || [];
		return this.filterDiagnostics(diagnostics);
	}

	/**
	 * Get all diagnostics
	 */
	getAllDiagnostics(): Map<string, Diagnostic[]> {
		const filtered = new Map<string, Diagnostic[]>();
		for (const [path, diagnostics] of this._diagnostics) {
			const filteredDiags = this.filterDiagnostics(diagnostics);
			if (filteredDiags.length > 0) {
				filtered.set(path, filteredDiags);
			}
		}
		return filtered;
	}

	/**
	 * Get diagnostics at a specific position
	 */
	getDiagnosticsAtPosition(filePath: string, position: Position): Diagnostic[] {
		const diagnostics = this.getDiagnostics(filePath);
		return diagnostics.filter((d) => this.positionInRange(position, d.range));
	}

	/**
	 * Get diagnostics for a line
	 */
	getDiagnosticsForLine(filePath: string, line: number): Diagnostic[] {
		const diagnostics = this.getDiagnostics(filePath);
		return diagnostics.filter((d) => d.range.start.line <= line && d.range.end.line >= line);
	}

	/**
	 * Get counts by severity
	 */
	getCounts(filePath?: string): Record<DiagnosticSeverity, number> {
		const counts: Record<DiagnosticSeverity, number> = {
			error: 0,
			warning: 0,
			info: 0,
			hint: 0
		};

		const diagnosticsToCount = filePath
			? [this.getDiagnostics(filePath)]
			: [...this.getAllDiagnostics().values()];

		for (const diagnostics of diagnosticsToCount) {
			for (const d of diagnostics) {
				counts[d.severity]++;
			}
		}

		return counts;
	}

	/**
	 * Get total count
	 */
	getTotalCount(filePath?: string): number {
		const counts = this.getCounts(filePath);
		return counts.error + counts.warning + counts.info + counts.hint;
	}

	/**
	 * Check if position is in range
	 */
	private positionInRange(pos: Position, range: Range): boolean {
		if (pos.line < range.start.line || pos.line > range.end.line) {
			return false;
		}
		if (pos.line === range.start.line && pos.column < range.start.column) {
			return false;
		}
		if (pos.line === range.end.line && pos.column > range.end.column) {
			return false;
		}
		return true;
	}

	/**
	 * Filter diagnostics by config
	 */
	private filterDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
		if (!this._config.enabled) return [];

		return diagnostics.filter((d) => this._config.severityFilter.includes(d.severity));
	}

	/**
	 * Apply a fix
	 */
	applyFix(diagnostic: Diagnostic, fix: DiagnosticFix): TextEdit[] {
		// Return the edits for the caller to apply
		return fix.edits;
	}

	/**
	 * Get config
	 */
	get config(): DiagnosticsConfig {
		return { ...this._config };
	}

	/**
	 * Update config
	 */
	setConfig(config: Partial<DiagnosticsConfig>): void {
		this._config = { ...this._config, ...config };
		this.notify();
	}

	/**
	 * Enable/disable
	 */
	setEnabled(enabled: boolean): void {
		this._config.enabled = enabled;
		this.notify();
	}

	/**
	 * Check if enabled
	 */
	isEnabled(): boolean {
		return this._config.enabled;
	}

	/**
	 * Set severity filter
	 */
	setSeverityFilter(severities: DiagnosticSeverity[]): void {
		this._config.severityFilter = severities;
		this.notify();
	}

	/**
	 * Subscribe to changes
	 */
	subscribe(listener: Listener): () => void {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	}

	/**
	 * Notify listeners
	 */
	private notify(): void {
		for (const listener of this._listeners) {
			listener();
		}
	}

	/**
	 * Clean up
	 */
	destroy(): void {
		this._listeners.clear();
		this._diagnostics.clear();
	}
}

/**
 * Create a new DiagnosticsManager instance
 */
export function createDiagnosticsManager(): DiagnosticsManager {
	return new DiagnosticsManager();
}

/**
 * Get severity icon
 */
export function getSeverityIcon(severity: DiagnosticSeverity): string {
	switch (severity) {
		case 'error':
			return '✕';
		case 'warning':
			return '⚠';
		case 'info':
			return 'ℹ';
		case 'hint':
			return '💡';
	}
}

/**
 * Get severity color
 */
export function getSeverityColor(severity: DiagnosticSeverity): string {
	switch (severity) {
		case 'error':
			return 'var(--ide-error)';
		case 'warning':
			return 'var(--ide-warning)';
		case 'info':
			return 'var(--ide-info)';
		case 'hint':
			return 'var(--ide-text-muted)';
	}
}

/**
 * Get severity label
 */
export function getSeverityLabel(severity: DiagnosticSeverity): string {
	switch (severity) {
		case 'error':
			return 'Error';
		case 'warning':
			return 'Warning';
		case 'info':
			return 'Info';
		case 'hint':
			return 'Hint';
	}
}

/**
 * Sort diagnostics by severity then line
 */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
	const severityOrder: Record<DiagnosticSeverity, number> = {
		error: 0,
		warning: 1,
		info: 2,
		hint: 3
	};

	return [...diagnostics].sort((a, b) => {
		const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
		if (severityDiff !== 0) return severityDiff;
		return a.range.start.line - b.range.start.line;
	});
}

/**
 * Generate mock diagnostics for testing
 */
export function generateMockDiagnostics(lineCount: number): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const sources = ['typescript', 'eslint', 'prettier'];
	const severities: DiagnosticSeverity[] = ['error', 'warning', 'info', 'hint'];

	const errorMessages = [
		{ code: 'TS2322', message: "Type 'string' is not assignable to type 'number'" },
		{ code: 'TS2339', message: "Property 'foo' does not exist on type 'Bar'" },
		{ code: 'TS2304', message: "Cannot find name 'undefined_var'" },
		{ code: 'TS7006', message: "Parameter 'x' implicitly has an 'any' type" }
	];

	const warningMessages = [
		{ code: 'no-unused-vars', message: "'x' is defined but never used" },
		{ code: 'prefer-const', message: "'let' can be replaced with 'const'" },
		{ code: 'no-console', message: 'Unexpected console statement' }
	];

	// Generate ~10% of lines with diagnostics
	const numDiagnostics = Math.floor(lineCount * 0.1);

	for (let i = 0; i < numDiagnostics; i++) {
		const line = Math.floor(Math.random() * lineCount);
		const severity = severities[Math.floor(Math.random() * severities.length)];
		const source = sources[Math.floor(Math.random() * sources.length)];

		let messageInfo;
		if (severity === 'error') {
			messageInfo = errorMessages[Math.floor(Math.random() * errorMessages.length)];
		} else if (severity === 'warning') {
			messageInfo = warningMessages[Math.floor(Math.random() * warningMessages.length)];
		} else {
			messageInfo = { code: 'info', message: 'Consider refactoring this code' };
		}

		diagnostics.push({
			id: `mock-${i}`,
			range: {
				start: { line, column: Math.floor(Math.random() * 20) },
				end: { line, column: Math.floor(Math.random() * 20) + 20 }
			},
			severity,
			message: messageInfo.message,
			source,
			code: messageInfo.code,
			fixes:
				severity === 'error' || severity === 'warning'
					? [
							{
								title: `Fix: ${messageInfo.message.slice(0, 30)}...`,
								isPreferred: true,
								edits: []
							}
						]
					: undefined
		});
	}

	return sortDiagnostics(diagnostics);
}
