/**
 * Timeline Manager
 *
 * Manages document history snapshots for Time Machine Scrubbing.
 * Captures snapshots at regular intervals and on significant events,
 * allowing users to scrub through document history.
 */

/**
 * Snapshot metadata
 */
export interface SnapshotMetadata {
	/** Author ID */
	author: string;
	/** Author display color */
	authorColor: string;
	/** Whether this was an AI change */
	isAI: boolean;
	/** Description of the change */
	description?: string;
	/** Git commit hash if applicable */
	commitHash?: string;
	/** Type of change */
	changeType: 'edit' | 'ai-suggestion' | 'commit' | 'checkpoint' | 'save';
}

/**
 * A snapshot of document state at a point in time
 */
export interface TimelineSnapshot {
	/** Unique snapshot ID */
	id: string;
	/** Timestamp when captured */
	timestamp: number;
	/** Document content */
	content: string;
	/** Snapshot metadata */
	metadata: SnapshotMetadata;
	/** Line count at this snapshot */
	lineCount: number;
	/** Diff from previous snapshot */
	diffFromPrevious?: {
		addedLines: number;
		removedLines: number;
		changedRegions: Array<{ start: number; end: number }>;
	};
}

/**
 * Timeline state
 */
export interface TimelineState {
	/** All snapshots */
	snapshots: TimelineSnapshot[];
	/** Current playback position (0-1, where 1 is live) */
	position: number;
	/** Whether in playback mode */
	isPlayback: boolean;
	/** Playback speed multiplier */
	playbackSpeed: number;
	/** Whether auto-playing */
	isPlaying: boolean;
}

/**
 * Timeline event types
 */
export type TimelineEvent =
	| { type: 'snapshot-added'; snapshot: TimelineSnapshot }
	| { type: 'position-changed'; position: number }
	| { type: 'playback-started' }
	| { type: 'playback-stopped' };

/**
 * Timeline configuration
 */
export interface TimelineConfig {
	/** Interval between auto-snapshots in ms (default: 30000) */
	snapshotInterval: number;
	/** Maximum number of snapshots to keep (default: 500) */
	maxSnapshots: number;
	/** Minimum lines changed to trigger snapshot (default: 5) */
	minLinesForSnapshot: number;
	/** Default author info */
	defaultAuthor: {
		id: string;
		name: string;
		color: string;
	};
}

const DEFAULT_CONFIG: TimelineConfig = {
	snapshotInterval: 30000,
	maxSnapshots: 500,
	minLinesForSnapshot: 5,
	defaultAuthor: {
		id: 'local',
		name: 'You',
		color: '#4a9eff'
	}
};

/**
 * Timeline Manager class
 */
export class TimelineManager {
	private snapshots: TimelineSnapshot[] = [];
	private listeners: Set<(event: TimelineEvent) => void> = new Set();
	private config: TimelineConfig;
	private snapshotTimer: ReturnType<typeof setInterval> | null = null;
	private lastContent: string = '';
	private lastSnapshotTime: number = 0;

	constructor(config: Partial<TimelineConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Start auto-snapshot timer
	 */
	start(initialContent: string): void {
		this.lastContent = initialContent;
		this.lastSnapshotTime = Date.now();

		// Capture initial snapshot
		this.captureSnapshot(initialContent, {
			author: this.config.defaultAuthor.id,
			authorColor: this.config.defaultAuthor.color,
			isAI: false,
			description: 'Initial state',
			changeType: 'checkpoint'
		});

		// Start auto-snapshot timer
		this.snapshotTimer = setInterval(() => {
			if (this.lastContent) {
				this.captureSnapshot(this.lastContent, {
					author: this.config.defaultAuthor.id,
					authorColor: this.config.defaultAuthor.color,
					isAI: false,
					description: 'Auto-checkpoint',
					changeType: 'checkpoint'
				});
			}
		}, this.config.snapshotInterval);
	}

	/**
	 * Stop auto-snapshot timer
	 */
	stop(): void {
		if (this.snapshotTimer) {
			clearInterval(this.snapshotTimer);
			this.snapshotTimer = null;
		}
	}

	/**
	 * Record content change (for tracking changes between snapshots)
	 */
	recordChange(content: string): void {
		this.lastContent = content;
	}

	/**
	 * Capture a snapshot.
	 *
	 * `timestamp` defaults to now; pass an explicit value to seed/import historical
	 * snapshots (e.g. reconstructing a prior editing session) so the timeline spreads
	 * over real time and each marker has a distinct key.
	 */
	captureSnapshot(
		content: string,
		metadata: SnapshotMetadata,
		timestamp: number = Date.now()
	): TimelineSnapshot {
		const lineCount = content.split('\n').length;

		// Calculate diff from previous
		let diffFromPrevious: TimelineSnapshot['diffFromPrevious'] | undefined;
		if (this.snapshots.length > 0) {
			const prevSnapshot = this.snapshots[this.snapshots.length - 1];
			diffFromPrevious = this.calculateDiff(prevSnapshot.content, content);
		}

		const snapshot: TimelineSnapshot = {
			id: `snapshot-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
			timestamp,
			content,
			metadata,
			lineCount,
			diffFromPrevious
		};

		this.snapshots.push(snapshot);
		this.lastSnapshotTime = timestamp;
		this.lastContent = content;

		// Prune old snapshots if needed
		this.pruneSnapshots();

		// Notify listeners
		this.emit({ type: 'snapshot-added', snapshot });

		return snapshot;
	}

	/**
	 * Capture snapshot on significant edit
	 */
	captureOnEdit(content: string, author?: Partial<SnapshotMetadata>): void {
		const lastSnapshot = this.snapshots[this.snapshots.length - 1];
		if (lastSnapshot?.content === content) {
			this.lastContent = content;
			return;
		}

		const lineCount = content.split('\n').length;
		const lastLineCount = this.snapshots.length > 0 ? lastSnapshot.lineCount : 0;

		const linesDiff = Math.abs(lineCount - lastLineCount);
		const timeSinceLastSnapshot = Date.now() - this.lastSnapshotTime;

		// Capture if significant change or enough time passed
		if (linesDiff >= this.config.minLinesForSnapshot || timeSinceLastSnapshot > 10000) {
			this.captureSnapshot(content, {
				author: author?.author ?? this.config.defaultAuthor.id,
				authorColor: author?.authorColor ?? this.config.defaultAuthor.color,
				isAI: author?.isAI ?? false,
				description: author?.description ?? 'Edit',
				changeType: author?.changeType ?? 'edit'
			});
		}
	}

	/**
	 * Capture snapshot for AI suggestion
	 */
	captureAISuggestion(content: string, description: string): void {
		this.captureSnapshot(content, {
			author: 'ai-assistant',
			authorColor: '#a855f7',
			isAI: true,
			description,
			changeType: 'ai-suggestion'
		});
	}

	/**
	 * Capture snapshot on save
	 */
	captureOnSave(content: string): void {
		this.captureSnapshot(content, {
			author: this.config.defaultAuthor.id,
			authorColor: this.config.defaultAuthor.color,
			isAI: false,
			description: 'Saved',
			changeType: 'save'
		});
	}

	/**
	 * Get all snapshots
	 */
	getSnapshots(): readonly TimelineSnapshot[] {
		return this.snapshots;
	}

	/**
	 * Get snapshot at normalized position (0-1)
	 */
	getSnapshotAtPosition(position: number): TimelineSnapshot | null {
		if (this.snapshots.length === 0) return null;
		if (position >= 1) return this.snapshots[this.snapshots.length - 1];
		if (position <= 0) return this.snapshots[0];

		const index = Math.floor(position * (this.snapshots.length - 1));
		return this.snapshots[index];
	}

	/**
	 * Get content at normalized position
	 */
	getContentAtPosition(position: number): string | null {
		const snapshot = this.getSnapshotAtPosition(position);
		return snapshot?.content ?? null;
	}

	/**
	 * Get snapshot by ID
	 */
	getSnapshotById(id: string): TimelineSnapshot | undefined {
		return this.snapshots.find((s) => s.id === id);
	}

	/**
	 * Get timeline duration in ms
	 */
	getDuration(): number {
		if (this.snapshots.length < 2) return 0;
		return this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp;
	}

	/**
	 * Get position for a timestamp
	 */
	getPositionForTimestamp(timestamp: number): number {
		if (this.snapshots.length < 2) return 1;

		const start = this.snapshots[0].timestamp;
		const end = this.snapshots[this.snapshots.length - 1].timestamp;
		const duration = end - start;

		if (duration === 0) return 1;
		return Math.max(0, Math.min(1, (timestamp - start) / duration));
	}

	/**
	 * Get markers for timeline UI
	 */
	getMarkers(): Array<{
		position: number;
		color: string;
		type: SnapshotMetadata['changeType'];
		label: string;
		timestamp: number;
	}> {
		if (this.snapshots.length === 0) return [];

		const start = this.snapshots[0].timestamp;
		const duration = this.getDuration() || 1;

		return this.snapshots.map((snapshot) => ({
			position: (snapshot.timestamp - start) / duration,
			color: snapshot.metadata.authorColor,
			type: snapshot.metadata.changeType,
			label: snapshot.metadata.description || snapshot.metadata.changeType,
			timestamp: snapshot.timestamp
		}));
	}

	/**
	 * Subscribe to timeline events
	 */
	subscribe(listener: (event: TimelineEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Clear all snapshots
	 */
	clear(): void {
		this.snapshots = [];
		this.lastContent = '';
		this.lastSnapshotTime = 0;
	}

	/**
	 * Calculate diff between two content strings
	 */
	private calculateDiff(
		oldContent: string,
		newContent: string
	): TimelineSnapshot['diffFromPrevious'] {
		const oldLines = oldContent.split('\n');
		const newLines = newContent.split('\n');

		let addedLines = 0;
		let removedLines = 0;
		const changedRegions: Array<{ start: number; end: number }> = [];

		// Simple line-by-line comparison
		const maxLen = Math.max(oldLines.length, newLines.length);
		let regionStart = -1;

		for (let i = 0; i < maxLen; i++) {
			const oldLine = oldLines[i] ?? '';
			const newLine = newLines[i] ?? '';

			if (oldLine !== newLine) {
				if (regionStart === -1) regionStart = i;
				if (i >= oldLines.length) addedLines++;
				else if (i >= newLines.length) removedLines++;
				else {
					// Changed line counts as both add and remove
					addedLines++;
					removedLines++;
				}
			} else if (regionStart !== -1) {
				changedRegions.push({ start: regionStart, end: i - 1 });
				regionStart = -1;
			}
		}

		if (regionStart !== -1) {
			changedRegions.push({ start: regionStart, end: maxLen - 1 });
		}

		return { addedLines, removedLines, changedRegions };
	}

	/**
	 * Prune old snapshots to stay within limit
	 */
	private pruneSnapshots(): void {
		if (this.snapshots.length <= this.config.maxSnapshots) return;

		// Keep first, last, and evenly distributed middle snapshots
		const toRemove = this.snapshots.length - this.config.maxSnapshots;

		// Remove oldest non-significant snapshots (keep checkpoints, saves, commits)
		const significantTypes: SnapshotMetadata['changeType'][] = ['commit', 'save', 'checkpoint'];

		for (let i = 1; i < this.snapshots.length - 1 && toRemove > 0; i++) {
			if (!significantTypes.includes(this.snapshots[i].metadata.changeType)) {
				this.snapshots.splice(i, 1);
				i--;
			}
		}
	}

	/**
	 * Emit event to listeners
	 */
	private emit(event: TimelineEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (e) {
				console.error('[TimelineManager] Listener error:', e);
			}
		}
	}
}

/**
 * Create a timeline manager instance
 */
export function createTimelineManager(config?: Partial<TimelineConfig>): TimelineManager {
	return new TimelineManager(config);
}

// Singleton instance
let globalTimelineManager: TimelineManager | null = null;

/**
 * Get the global timeline manager
 */
export function getTimelineManager(): TimelineManager {
	if (!globalTimelineManager) {
		globalTimelineManager = createTimelineManager();
	}
	return globalTimelineManager;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	const now = new Date();

	// Same day - show time only
	if (date.toDateString() === now.toDateString()) {
		return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	// Different day - show date and time
	return date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	}
	return `${seconds}s`;
}
