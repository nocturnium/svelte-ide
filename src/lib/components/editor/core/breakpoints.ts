/**
 * Breakpoint Manager
 *
 * Manages debugging breakpoints including:
 * - Line breakpoints
 * - Conditional breakpoints
 * - Logpoints
 * - Hit counts
 * - Exception breakpoints
 */

export interface Position {
	line: number;
	column?: number;
}

export type BreakpointType = 'line' | 'conditional' | 'logpoint' | 'function' | 'exception';

export type BreakpointState = 'enabled' | 'disabled' | 'pending' | 'invalid';

export interface Breakpoint {
	/** Unique identifier */
	id: string;
	/** File path */
	filePath: string;
	/** Line number (0-based) */
	line: number;
	/** Column (optional, for inline breakpoints) */
	column?: number;
	/** Breakpoint type */
	type: BreakpointType;
	/** Current state */
	state: BreakpointState;
	/** Condition expression (for conditional breakpoints) */
	condition?: string;
	/** Log message (for logpoints) */
	logMessage?: string;
	/** Hit count condition (e.g., ">= 5", "% 3 == 0") */
	hitCondition?: string;
	/** Current hit count */
	hitCount: number;
	/** Whether breakpoint is verified by debugger */
	verified: boolean;
	/** Error message if invalid */
	errorMessage?: string;
	/** Function name (for function breakpoints) */
	functionName?: string;
	/** Exception types (for exception breakpoints) */
	exceptionTypes?: string[];
	/** Timestamp when created */
	createdAt: Date;
}

export interface BreakpointsConfig {
	/** Whether breakpoints are enabled globally */
	enabled: boolean;
	/** Show breakpoint gutter */
	showGutter: boolean;
	/** Allow conditional breakpoints */
	allowConditional: boolean;
	/** Allow logpoints */
	allowLogpoints: boolean;
	/** Maximum breakpoints per file */
	maxPerFile: number;
}

type Listener = () => void;

/**
 * Breakpoint Manager
 */
export class BreakpointManager {
	private _config: BreakpointsConfig = {
		enabled: true,
		showGutter: true,
		allowConditional: true,
		allowLogpoints: true,
		maxPerFile: 50
	};

	private _breakpoints: Map<string, Breakpoint> = new Map();
	private _listeners: Set<Listener> = new Set();
	private _idCounter = 0;

	/**
	 * Add a breakpoint
	 */
	addBreakpoint(
		filePath: string,
		line: number,
		options?: Partial<
			Omit<Breakpoint, 'id' | 'filePath' | 'line' | 'hitCount' | 'verified' | 'createdAt'>
		>
	): Breakpoint {
		const id = `bp-${++this._idCounter}`;
		const breakpoint: Breakpoint = {
			id,
			filePath,
			line,
			type: options?.type || 'line',
			state: options?.state || 'enabled',
			condition: options?.condition,
			logMessage: options?.logMessage,
			hitCondition: options?.hitCondition,
			hitCount: 0,
			verified: false,
			column: options?.column,
			functionName: options?.functionName,
			exceptionTypes: options?.exceptionTypes,
			createdAt: new Date()
		};

		this._breakpoints.set(id, breakpoint);
		this.notify();
		return breakpoint;
	}

	/**
	 * Remove a breakpoint
	 */
	removeBreakpoint(id: string): boolean {
		const result = this._breakpoints.delete(id);
		if (result) {
			this.notify();
		}
		return result;
	}

	/**
	 * Toggle breakpoint at line (add if not exists, remove if exists)
	 */
	toggleBreakpoint(filePath: string, line: number): Breakpoint | null {
		const existing = this.getBreakpointAtLine(filePath, line);
		if (existing) {
			this.removeBreakpoint(existing.id);
			return null;
		} else {
			return this.addBreakpoint(filePath, line);
		}
	}

	/**
	 * Update a breakpoint
	 */
	updateBreakpoint(
		id: string,
		updates: Partial<Omit<Breakpoint, 'id' | 'createdAt'>>
	): Breakpoint | null {
		const breakpoint = this._breakpoints.get(id);
		if (!breakpoint) return null;

		const updated = { ...breakpoint, ...updates };
		this._breakpoints.set(id, updated);
		this.notify();
		return updated;
	}

	/**
	 * Enable a breakpoint
	 */
	enableBreakpoint(id: string): boolean {
		const bp = this._breakpoints.get(id);
		if (bp && bp.state === 'disabled') {
			bp.state = 'enabled';
			this.notify();
			return true;
		}
		return false;
	}

	/**
	 * Disable a breakpoint
	 */
	disableBreakpoint(id: string): boolean {
		const bp = this._breakpoints.get(id);
		if (bp && bp.state === 'enabled') {
			bp.state = 'disabled';
			this.notify();
			return true;
		}
		return false;
	}

	/**
	 * Toggle breakpoint enabled state
	 */
	toggleBreakpointEnabled(id: string): boolean {
		const bp = this._breakpoints.get(id);
		if (bp) {
			bp.state = bp.state === 'enabled' ? 'disabled' : 'enabled';
			this.notify();
			return true;
		}
		return false;
	}

	/**
	 * Get breakpoint by ID
	 */
	getBreakpoint(id: string): Breakpoint | undefined {
		return this._breakpoints.get(id);
	}

	/**
	 * Get breakpoint at specific line
	 */
	getBreakpointAtLine(filePath: string, line: number): Breakpoint | undefined {
		for (const bp of this._breakpoints.values()) {
			if (bp.filePath === filePath && bp.line === line) {
				return bp;
			}
		}
		return undefined;
	}

	/**
	 * Get all breakpoints for a file
	 */
	getBreakpointsForFile(filePath: string): Breakpoint[] {
		const breakpoints: Breakpoint[] = [];
		for (const bp of this._breakpoints.values()) {
			if (bp.filePath === filePath) {
				breakpoints.push(bp);
			}
		}
		return breakpoints.sort((a, b) => a.line - b.line);
	}

	/**
	 * Get all breakpoints
	 */
	getAllBreakpoints(): Breakpoint[] {
		return [...this._breakpoints.values()].sort((a, b) => {
			const pathCompare = a.filePath.localeCompare(b.filePath);
			if (pathCompare !== 0) return pathCompare;
			return a.line - b.line;
		});
	}

	/**
	 * Get breakpoints grouped by file
	 */
	getBreakpointsByFile(): Map<string, Breakpoint[]> {
		const byFile = new Map<string, Breakpoint[]>();
		for (const bp of this._breakpoints.values()) {
			if (!byFile.has(bp.filePath)) {
				byFile.set(bp.filePath, []);
			}
			byFile.get(bp.filePath)!.push(bp);
		}
		// Sort each file's breakpoints by line
		for (const [path, bps] of byFile) {
			byFile.set(
				path,
				bps.sort((a, b) => a.line - b.line)
			);
		}
		return byFile;
	}

	/**
	 * Clear all breakpoints for a file
	 */
	clearFileBreakpoints(filePath: string): number {
		let count = 0;
		for (const bp of [...this._breakpoints.values()]) {
			if (bp.filePath === filePath) {
				this._breakpoints.delete(bp.id);
				count++;
			}
		}
		if (count > 0) {
			this.notify();
		}
		return count;
	}

	/**
	 * Clear all breakpoints
	 */
	clearAllBreakpoints(): number {
		const count = this._breakpoints.size;
		this._breakpoints.clear();
		if (count > 0) {
			this.notify();
		}
		return count;
	}

	/**
	 * Enable all breakpoints
	 */
	enableAllBreakpoints(): void {
		for (const bp of this._breakpoints.values()) {
			if (bp.state === 'disabled') {
				bp.state = 'enabled';
			}
		}
		this.notify();
	}

	/**
	 * Disable all breakpoints
	 */
	disableAllBreakpoints(): void {
		for (const bp of this._breakpoints.values()) {
			if (bp.state === 'enabled') {
				bp.state = 'disabled';
			}
		}
		this.notify();
	}

	/**
	 * Mark breakpoint as verified by debugger
	 */
	verifyBreakpoint(id: string, verified: boolean, errorMessage?: string): void {
		const bp = this._breakpoints.get(id);
		if (bp) {
			bp.verified = verified;
			bp.state = verified ? 'enabled' : 'invalid';
			bp.errorMessage = errorMessage;
			this.notify();
		}
	}

	/**
	 * Increment hit count for breakpoint
	 */
	incrementHitCount(id: string): number {
		const bp = this._breakpoints.get(id);
		if (bp) {
			bp.hitCount++;
			this.notify();
			return bp.hitCount;
		}
		return 0;
	}

	/**
	 * Reset hit counts for all breakpoints
	 */
	resetHitCounts(): void {
		for (const bp of this._breakpoints.values()) {
			bp.hitCount = 0;
		}
		this.notify();
	}

	/**
	 * Check if breakpoint should trigger based on conditions
	 */
	shouldBreakpointTrigger(id: string): boolean {
		const bp = this._breakpoints.get(id);
		if (!bp || bp.state !== 'enabled') return false;

		// Check hit condition
		if (bp.hitCondition) {
			const count = bp.hitCount;
			try {
				// Simple hit condition evaluation
				if (bp.hitCondition.startsWith('>=')) {
					const value = parseInt(bp.hitCondition.slice(2).trim());
					if (count < value) return false;
				} else if (bp.hitCondition.startsWith('==')) {
					const value = parseInt(bp.hitCondition.slice(2).trim());
					if (count !== value) return false;
				} else if (bp.hitCondition.startsWith('%')) {
					const match = bp.hitCondition.match(/%\s*(\d+)\s*==\s*(\d+)/);
					if (match) {
						const divisor = parseInt(match[1]);
						const remainder = parseInt(match[2]);
						if (count % divisor !== remainder) return false;
					}
				}
			} catch {
				// Invalid hit condition, trigger anyway
			}
		}

		return true;
	}

	/**
	 * Get count
	 */
	getCount(filePath?: string): number {
		if (filePath) {
			return this.getBreakpointsForFile(filePath).length;
		}
		return this._breakpoints.size;
	}

	/**
	 * Get config
	 */
	get config(): BreakpointsConfig {
		return { ...this._config };
	}

	/**
	 * Update config
	 */
	setConfig(config: Partial<BreakpointsConfig>): void {
		this._config = { ...this._config, ...config };
		this.notify();
	}

	/**
	 * Enable/disable globally
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
	 * Export breakpoints (for persistence)
	 */
	exportBreakpoints(): string {
		return JSON.stringify([...this._breakpoints.values()]);
	}

	/**
	 * Import breakpoints (from persistence)
	 */
	importBreakpoints(json: string): void {
		try {
			const breakpoints = JSON.parse(json) as Breakpoint[];
			this._breakpoints.clear();
			for (const bp of breakpoints) {
				bp.createdAt = new Date(bp.createdAt);
				this._breakpoints.set(bp.id, bp);
			}
			this.notify();
		} catch (e) {
			console.error('Failed to import breakpoints:', e);
		}
	}

	/**
	 * Clean up
	 */
	destroy(): void {
		this._listeners.clear();
		this._breakpoints.clear();
	}
}

/**
 * Create a new BreakpointManager instance
 */
export function createBreakpointManager(): BreakpointManager {
	return new BreakpointManager();
}

/**
 * Get icon for breakpoint type
 */
export function getBreakpointIcon(breakpoint: Breakpoint): string {
	if (breakpoint.type === 'logpoint') return '◆';
	if (breakpoint.type === 'conditional') return '◉';
	if (breakpoint.type === 'function') return 'ƒ';
	if (breakpoint.type === 'exception') return '⚡';
	return '●';
}

/**
 * Get color for breakpoint state
 */
export function getBreakpointColor(breakpoint: Breakpoint): string {
	if (breakpoint.state === 'disabled') return '#6c6c6c';
	if (breakpoint.state === 'invalid') return '#888888';
	if (breakpoint.state === 'pending') return '#ff8c00';
	if (breakpoint.type === 'logpoint') return '#f9e64f';
	if (breakpoint.type === 'conditional') return '#f44747';
	return '#f44747';
}
