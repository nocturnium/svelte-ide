/**
 * Git Blame Manager
 *
 * Provides inline git blame information for the editor.
 * Shows commit info, author, and timestamps per line.
 */

/**
 * Blame information for a single line
 */
export interface BlameInfo {
	/** Line number (0-based) */
	line: number;
	/** Commit SHA (short) */
	commitSha: string;
	/** Full commit SHA */
	fullSha: string;
	/** Author name */
	author: string;
	/** Author email */
	authorEmail: string;
	/** Commit timestamp */
	timestamp: Date;
	/** Commit message (first line) */
	message: string;
	/** Is this line uncommitted? */
	uncommitted: boolean;
	/** Color for visualization (based on recency or author) */
	color?: string;
}

/**
 * Commit details for hover display
 */
export interface CommitDetails {
	sha: string;
	author: string;
	authorEmail: string;
	date: Date;
	message: string;
	filesChanged: number;
	insertions: number;
	deletions: number;
}

/**
 * Blame state for the document
 */
export interface BlameState {
	/** Whether blame is enabled */
	enabled: boolean;
	/** Blame info per line */
	lineBlame: Map<number, BlameInfo>;
	/** Whether currently loading */
	loading: boolean;
	/** Error message if any */
	error: string | null;
	/** Last update timestamp */
	lastUpdated: Date | null;
}

/**
 * Git blame configuration
 */
export interface GitBlameConfig {
	/** Color mode: 'age' colors by recency, 'author' by author */
	colorMode: 'age' | 'author';
	/** Show inline author name */
	showAuthor: boolean;
	/** Show inline timestamp */
	showTimestamp: boolean;
	/** Date format: 'relative' or 'absolute' */
	dateFormat: 'relative' | 'absolute';
	/** Color palette for authors */
	authorColors: string[];
	/** Age color gradient (newest to oldest) */
	ageColors: [string, string];
}

const DEFAULT_CONFIG: GitBlameConfig = {
	colorMode: 'age',
	showAuthor: true,
	showTimestamp: true,
	dateFormat: 'relative',
	authorColors: [
		'#22c55e', // green
		'#3b82f6', // blue
		'#f59e0b', // amber
		'#ec4899', // pink
		'#8b5cf6', // violet
		'#14b8a6', // teal
		'#f97316', // orange
		'#6366f1', // indigo
		'#ef4444', // red
		'#84cc16'  // lime
	],
	ageColors: ['#22c55e', '#6b7280'] // green (new) to gray (old)
};

/**
 * Git Blame Manager
 */
export class GitBlameManager {
	private config: GitBlameConfig;
	private state: BlameState;
	private listeners: Set<(state: BlameState) => void> = new Set();
	private authorColorMap: Map<string, string> = new Map();
	private colorIndex = 0;

	constructor(config: Partial<GitBlameConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.state = {
			enabled: false,
			lineBlame: new Map(),
			loading: false,
			error: null,
			lastUpdated: null
		};
	}

	/**
	 * Enable blame display
	 */
	enable(): void {
		this.state.enabled = true;
		this.notify();
	}

	/**
	 * Disable blame display
	 */
	disable(): void {
		this.state.enabled = false;
		this.notify();
	}

	/**
	 * Toggle blame display
	 */
	toggle(): boolean {
		this.state.enabled = !this.state.enabled;
		this.notify();
		return this.state.enabled;
	}

	/**
	 * Check if blame is enabled
	 */
	isEnabled(): boolean {
		return this.state.enabled;
	}

	/**
	 * Set blame data for lines
	 * This would typically be called after fetching blame from git
	 */
	setBlameData(data: BlameInfo[]): void {
		this.state.lineBlame = new Map();
		this.state.loading = false;
		this.state.error = null;
		this.state.lastUpdated = new Date();

		for (const info of data) {
			// Assign color based on config
			if (this.config.colorMode === 'author') {
				info.color = this.getAuthorColor(info.author);
			} else {
				info.color = this.getAgeColor(info.timestamp);
			}
			this.state.lineBlame.set(info.line, info);
		}

		this.notify();
	}

	/**
	 * Set loading state
	 */
	setLoading(loading: boolean): void {
		this.state.loading = loading;
		if (loading) {
			this.state.error = null;
		}
		this.notify();
	}

	/**
	 * Set error state
	 */
	setError(error: string): void {
		this.state.error = error;
		this.state.loading = false;
		this.notify();
	}

	/**
	 * Clear all blame data
	 */
	clear(): void {
		this.state.lineBlame = new Map();
		this.state.error = null;
		this.state.lastUpdated = null;
		this.notify();
	}

	/**
	 * Get blame info for a specific line
	 */
	getLineBlame(line: number): BlameInfo | undefined {
		return this.state.lineBlame.get(line);
	}

	/**
	 * Get all blame info
	 */
	getAllBlame(): BlameInfo[] {
		return Array.from(this.state.lineBlame.values());
	}

	/**
	 * Get current state
	 */
	getState(): BlameState {
		return { ...this.state };
	}

	/**
	 * Get configuration
	 */
	getConfig(): GitBlameConfig {
		return { ...this.config };
	}

	/**
	 * Update configuration
	 */
	setConfig(config: Partial<GitBlameConfig>): void {
		this.config = { ...this.config, ...config };

		// Recompute colors if mode changed
		if (config.colorMode) {
			for (const [_line, info] of this.state.lineBlame) {
				if (this.config.colorMode === 'author') {
					info.color = this.getAuthorColor(info.author);
				} else {
					info.color = this.getAgeColor(info.timestamp);
				}
			}
		}

		this.notify();
	}

	/**
	 * Get color for an author
	 */
	private getAuthorColor(author: string): string {
		if (!this.authorColorMap.has(author)) {
			const color = this.config.authorColors[this.colorIndex % this.config.authorColors.length];
			this.authorColorMap.set(author, color);
			this.colorIndex++;
		}
		return this.authorColorMap.get(author)!;
	}

	/**
	 * Get color based on age (newer = greener, older = grayer)
	 */
	private getAgeColor(timestamp: Date): string {
		const now = Date.now();
		const age = now - timestamp.getTime();

		// Age ranges in milliseconds
		const oneDay = 24 * 60 * 60 * 1000;
		const oneWeek = 7 * oneDay;
		const oneMonth = 30 * oneDay;
		const sixMonths = 6 * oneMonth;
		const oneYear = 365 * oneDay;

		// Return color based on age
		if (age < oneDay) return '#22c55e';      // Today - bright green
		if (age < oneWeek) return '#4ade80';     // This week - green
		if (age < oneMonth) return '#86efac';    // This month - light green
		if (age < sixMonths) return '#9ca3af';   // Recent - gray
		if (age < oneYear) return '#6b7280';     // Old - darker gray
		return '#4b5563';                         // Ancient - darkest gray
	}

	/**
	 * Format timestamp for display
	 */
	formatTimestamp(date: Date): string {
		if (this.config.dateFormat === 'relative') {
			return this.formatRelativeTime(date);
		}
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	/**
	 * Format relative time (e.g., "2 days ago")
	 */
	private formatRelativeTime(date: Date): string {
		const now = Date.now();
		const diff = now - date.getTime();

		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		const weeks = Math.floor(days / 7);
		const months = Math.floor(days / 30);
		const years = Math.floor(days / 365);

		if (years > 0) return `${years}y ago`;
		if (months > 0) return `${months}mo ago`;
		if (weeks > 0) return `${weeks}w ago`;
		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return 'just now';
	}

	/**
	 * Subscribe to state changes
	 */
	subscribe(listener: (state: BlameState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Notify listeners
	 */
	private notify(): void {
		const state = this.getState();
		for (const listener of this.listeners) {
			try {
				listener(state);
			} catch (e) {
				console.error('[GitBlameManager] Listener error:', e);
			}
		}
	}
}

/**
 * Create a git blame manager
 */
export function createGitBlameManager(config?: Partial<GitBlameConfig>): GitBlameManager {
	return new GitBlameManager(config);
}

/**
 * Generate mock blame data for testing/demo
 */
export function generateMockBlameData(lineCount: number): BlameInfo[] {
	const authors = [
		{ name: 'Alice Chen', email: 'alice@example.com' },
		{ name: 'Bob Smith', email: 'bob@example.com' },
		{ name: 'Carol White', email: 'carol@example.com' },
		{ name: 'David Lee', email: 'david@example.com' }
	];

	const messages = [
		'Initial commit',
		'Add feature X',
		'Fix bug in Y',
		'Refactor Z module',
		'Update dependencies',
		'Improve performance',
		'Add tests',
		'Fix typo',
		'Clean up code',
		'Add documentation'
	];

	const now = Date.now();
	const blameData: BlameInfo[] = [];

	// Generate commits
	const commits: Array<{
		sha: string;
		author: typeof authors[0];
		timestamp: Date;
		message: string;
	}> = [];

	for (let i = 0; i < 10; i++) {
		const daysAgo = Math.floor(Math.random() * 365);
		commits.push({
			sha: Math.random().toString(16).substr(2, 7),
			author: authors[Math.floor(Math.random() * authors.length)],
			timestamp: new Date(now - daysAgo * 24 * 60 * 60 * 1000),
			message: messages[Math.floor(Math.random() * messages.length)]
		});
	}

	// Assign commits to lines (consecutive lines often share commits)
	let currentCommit = commits[0];
	let runLength = 0;

	for (let line = 0; line < lineCount; line++) {
		// Switch commit occasionally
		if (runLength > 3 + Math.random() * 10) {
			currentCommit = commits[Math.floor(Math.random() * commits.length)];
			runLength = 0;
		}

		blameData.push({
			line,
			commitSha: currentCommit.sha,
			fullSha: currentCommit.sha + 'abcdef1234567890',
			author: currentCommit.author.name,
			authorEmail: currentCommit.author.email,
			timestamp: currentCommit.timestamp,
			message: currentCommit.message,
			uncommitted: Math.random() < 0.05 // 5% chance of uncommitted line
		});

		runLength++;
	}

	return blameData;
}
