/**
 * Echo Cursor Manager
 *
 * Implements "Echo Mode" where your cursor leaves a trail that replays
 * keystrokes with a configurable delay. Type in one place, and edits
 * propagate to echo locations with visible animation.
 */

import type { Position, Selection } from './state';

/**
 * Keystroke event for replay
 */
export interface KeystrokeEvent {
	/** Event ID */
	id: string;
	/** Timestamp when recorded */
	timestamp: number;
	/** Type of keystroke */
	type: 'insert' | 'delete' | 'move' | 'newline' | 'tab';
	/** Data for the keystroke */
	data: {
		/** Text inserted (for insert type) */
		text?: string;
		/** Direction for delete */
		direction?: 'forward' | 'backward';
		/** Count for delete */
		count?: number;
		/** New position for move */
		position?: Position;
	};
}

/**
 * Echo cursor definition
 */
export interface EchoCursor {
	/** Unique ID */
	id: string;
	/** Current position */
	position: Position;
	/** Delay in ms before replaying keystrokes */
	delayMs: number;
	/** Color for visualization */
	color: string;
	/** Whether this echo is active */
	active: boolean;
	/** Current replay position in the keystroke buffer */
	replayIndex: number;
	/** Whether currently animating a keystroke */
	isReplaying: boolean;
	/** Label for display */
	label?: string;
}

/**
 * Echo mode state
 */
export interface EchoModeState {
	/** Whether echo mode is enabled */
	enabled: boolean;
	/** All echo cursors */
	echoCursors: EchoCursor[];
	/** Keystroke buffer */
	keystrokeBuffer: KeystrokeEvent[];
	/** Default delay for new echoes */
	defaultDelay: number;
}

/**
 * Echo cursor event types
 */
export type EchoCursorEvent =
	| { type: 'echo-added'; cursor: EchoCursor }
	| { type: 'echo-removed'; cursorId: string }
	| { type: 'keystroke-recorded'; event: KeystrokeEvent }
	| { type: 'replay-started'; cursorId: string; keystroke: KeystrokeEvent }
	| { type: 'replay-completed'; cursorId: string; keystroke: KeystrokeEvent }
	| { type: 'mode-changed'; enabled: boolean };

/**
 * Echo cursor configuration
 */
export interface EchoCursorConfig {
	/** Default delay in ms (default: 150) */
	defaultDelay: number;
	/** Maximum echo cursors (default: 10) */
	maxEchoCursors: number;
	/** Maximum keystroke buffer size (default: 1000) */
	maxKeystrokeBuffer: number;
	/** Colors for echo cursors */
	colors: string[];
}

const DEFAULT_CONFIG: EchoCursorConfig = {
	defaultDelay: 150,
	maxEchoCursors: 10,
	maxKeystrokeBuffer: 1000,
	colors: [
		'#22c55e', // green
		'#f59e0b', // amber
		'#ec4899', // pink
		'#06b6d4', // cyan
		'#8b5cf6', // violet
		'#ef4444', // red
		'#14b8a6', // teal
		'#f97316', // orange
		'#6366f1', // indigo
		'#84cc16'  // lime
	]
};

/**
 * Echo Cursor Manager
 */
export class EchoCursorManager {
	private config: EchoCursorConfig;
	private echoCursors: Map<string, EchoCursor> = new Map();
	private keystrokeBuffer: KeystrokeEvent[] = [];
	private replayTimers: Map<string, ReturnType<typeof setTimeout>[]> = new Map();
	private listeners: Set<(event: EchoCursorEvent) => void> = new Set();
	private enabled = false;
	private colorIndex = 0;

	constructor(config: Partial<EchoCursorConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Enable echo mode
	 */
	enable(): void {
		this.enabled = true;
		this.emit({ type: 'mode-changed', enabled: true });
	}

	/**
	 * Disable echo mode
	 */
	disable(): void {
		this.enabled = false;
		this.clearAllEchoes();
		this.emit({ type: 'mode-changed', enabled: false });
	}

	/**
	 * Toggle echo mode
	 */
	toggle(): boolean {
		if (this.enabled) {
			this.disable();
		} else {
			this.enable();
		}
		return this.enabled;
	}

	/**
	 * Check if echo mode is enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Add an echo cursor at a position
	 */
	addEchoPoint(position: Position, options?: { delay?: number; label?: string }): EchoCursor | null {
		if (!this.enabled) return null;
		if (this.echoCursors.size >= this.config.maxEchoCursors) return null;

		const id = `echo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const color = this.config.colors[this.colorIndex % this.config.colors.length];
		this.colorIndex++;

		const cursor: EchoCursor = {
			id,
			position: { ...position },
			delayMs: options?.delay ?? this.config.defaultDelay,
			color,
			active: true,
			replayIndex: this.keystrokeBuffer.length, // Start from current position
			isReplaying: false,
			label: options?.label
		};

		this.echoCursors.set(id, cursor);
		this.replayTimers.set(id, []);
		this.emit({ type: 'echo-added', cursor });

		return cursor;
	}

	/**
	 * Remove an echo cursor
	 */
	removeEcho(id: string): boolean {
		const cursor = this.echoCursors.get(id);
		if (!cursor) return false;

		// Clear pending replay timers
		const timers = this.replayTimers.get(id) || [];
		for (const timer of timers) {
			clearTimeout(timer);
		}
		this.replayTimers.delete(id);

		this.echoCursors.delete(id);
		this.emit({ type: 'echo-removed', cursorId: id });

		return true;
	}

	/**
	 * Clear all echo cursors
	 */
	clearAllEchoes(): void {
		for (const id of this.echoCursors.keys()) {
			this.removeEcho(id);
		}
		this.keystrokeBuffer = [];
	}

	/**
	 * Record a keystroke from the primary cursor
	 */
	recordKeystroke(event: Omit<KeystrokeEvent, 'id' | 'timestamp'>): KeystrokeEvent {
		const keystroke: KeystrokeEvent = {
			...event,
			id: `ks-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			timestamp: Date.now()
		};

		this.keystrokeBuffer.push(keystroke);

		// Prune old keystrokes
		if (this.keystrokeBuffer.length > this.config.maxKeystrokeBuffer) {
			this.keystrokeBuffer = this.keystrokeBuffer.slice(-this.config.maxKeystrokeBuffer);
		}

		this.emit({ type: 'keystroke-recorded', event: keystroke });

		// Schedule replay for all echo cursors
		if (this.enabled) {
			for (const cursor of this.echoCursors.values()) {
				this.scheduleReplay(cursor, keystroke);
			}
		}

		return keystroke;
	}

	/**
	 * Record text insertion
	 */
	recordInsert(text: string): KeystrokeEvent {
		return this.recordKeystroke({
			type: 'insert',
			data: { text }
		});
	}

	/**
	 * Record text deletion
	 */
	recordDelete(direction: 'forward' | 'backward', count: number = 1): KeystrokeEvent {
		return this.recordKeystroke({
			type: 'delete',
			data: { direction, count }
		});
	}

	/**
	 * Record newline insertion
	 */
	recordNewline(): KeystrokeEvent {
		return this.recordKeystroke({
			type: 'newline',
			data: {}
		});
	}

	/**
	 * Record tab insertion
	 */
	recordTab(): KeystrokeEvent {
		return this.recordKeystroke({
			type: 'tab',
			data: {}
		});
	}

	/**
	 * Get all echo cursors
	 */
	getEchoCursors(): EchoCursor[] {
		return Array.from(this.echoCursors.values());
	}

	/**
	 * Get echo cursor by ID
	 */
	getEchoCursor(id: string): EchoCursor | undefined {
		return this.echoCursors.get(id);
	}

	/**
	 * Get keystroke buffer
	 */
	getKeystrokeBuffer(): readonly KeystrokeEvent[] {
		return this.keystrokeBuffer;
	}

	/**
	 * Update echo cursor position after replay
	 */
	updateEchoPosition(id: string, position: Position): void {
		const cursor = this.echoCursors.get(id);
		if (cursor) {
			cursor.position = { ...position };
		}
	}

	/**
	 * Subscribe to echo cursor events
	 */
	subscribe(listener: (event: EchoCursorEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Schedule keystroke replay for an echo cursor
	 */
	private scheduleReplay(cursor: EchoCursor, keystroke: KeystrokeEvent): void {
		if (!cursor.active) return;

		const timer = setTimeout(() => {
			cursor.isReplaying = true;
			this.emit({ type: 'replay-started', cursorId: cursor.id, keystroke });

			// Simulate replay completion after a short animation time
			setTimeout(() => {
				cursor.isReplaying = false;
				cursor.replayIndex++;
				this.emit({ type: 'replay-completed', cursorId: cursor.id, keystroke });
			}, 50);
		}, cursor.delayMs);

		const timers = this.replayTimers.get(cursor.id) || [];
		timers.push(timer);
		this.replayTimers.set(cursor.id, timers);
	}

	/**
	 * Emit event to listeners
	 */
	private emit(event: EchoCursorEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (e) {
				console.error('[EchoCursorManager] Listener error:', e);
			}
		}
	}
}

/**
 * Create an echo cursor manager
 */
export function createEchoCursorManager(config?: Partial<EchoCursorConfig>): EchoCursorManager {
	return new EchoCursorManager(config);
}

// Singleton instance
let globalEchoCursorManager: EchoCursorManager | null = null;

/**
 * Get the global echo cursor manager
 */
export function getEchoCursorManager(): EchoCursorManager {
	if (!globalEchoCursorManager) {
		globalEchoCursorManager = createEchoCursorManager();
	}
	return globalEchoCursorManager;
}
