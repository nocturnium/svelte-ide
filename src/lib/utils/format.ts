/**
 * Formatting utilities
 */

/**
 * Format file size in human-readable form
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 B';

	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const k = 1024;
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * Format a date relative to now
 */
export function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSecs = Math.floor(diffMs / 1000);
	const diffMins = Math.floor(diffSecs / 60);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSecs < 60) {
		return 'just now';
	} else if (diffMins < 60) {
		return `${diffMins}m ago`;
	} else if (diffHours < 24) {
		return `${diffHours}h ago`;
	} else if (diffDays < 7) {
		return `${diffDays}d ago`;
	} else {
		return date.toLocaleDateString();
	}
}

/**
 * Format a date for display
 */
export function formatDate(date: Date): string {
	return date.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Format a date and time for display
 */
export function formatDateTime(date: Date): string {
	return date.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	} else if (ms < 60000) {
		return `${(ms / 1000).toFixed(1)}s`;
	} else if (ms < 3600000) {
		return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
	} else {
		return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
	}
}

/**
 * Format line and column position
 */
export function formatPosition(line: number, column: number): string {
	return `Ln ${line}, Col ${column}`;
}

/**
 * Format a path for display (truncate middle if too long)
 */
export function formatPath(path: string, maxLength: number = 50): string {
	if (path.length <= maxLength) {
		return path;
	}

	const parts = path.split('/');
	if (parts.length <= 2) {
		return path.slice(0, maxLength - 3) + '...';
	}

	const first = parts[0];
	const last = parts[parts.length - 1];
	const middle = '...';

	if (first.length + last.length + middle.length >= maxLength) {
		return '...' + last.slice(-(maxLength - 3));
	}

	return `${first}/${middle}/${last}`;
}

/**
 * Format number with thousands separators
 */
export function formatNumber(num: number): string {
	return num.toLocaleString();
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 0): string {
	return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Pluralize a word based on count
 */
export function pluralize(count: number, singular: string, plural?: string): string {
	if (count === 1) {
		return `${count} ${singular}`;
	}
	return `${count} ${plural ?? singular + 's'}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return text.slice(0, maxLength - 1) + '…';
}

/**
 * Convert camelCase to Title Case
 */
export function camelToTitle(text: string): string {
	return text
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (str) => str.toUpperCase())
		.trim();
}

/**
 * Convert snake_case to Title Case
 */
export function snakeToTitle(text: string): string {
	return text
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
