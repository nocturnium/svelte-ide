import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	formatFileSize,
	formatRelativeTime,
	formatDate,
	formatDateTime,
	formatDuration,
	formatPosition,
	formatPath,
	formatNumber,
	formatPercent,
	pluralize,
	truncate,
	camelToTitle,
	snakeToTitle
} from './format';

// ============================================================
// formatFileSize
// ============================================================

describe('formatFileSize', () => {
	it('should return "0 B" for zero bytes', () => {
		expect(formatFileSize(0)).toBe('0 B');
	});

	it('should format bytes', () => {
		expect(formatFileSize(500)).toBe('500 B');
	});

	it('should format kilobytes', () => {
		expect(formatFileSize(1024)).toBe('1 KB');
		expect(formatFileSize(1536)).toBe('1.5 KB');
	});

	it('should format megabytes', () => {
		expect(formatFileSize(1048576)).toBe('1 MB');
		expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
	});

	it('should format gigabytes', () => {
		expect(formatFileSize(1073741824)).toBe('1 GB');
	});

	it('should format terabytes', () => {
		expect(formatFileSize(1099511627776)).toBe('1 TB');
	});
});

// ============================================================
// formatRelativeTime
// ============================================================

describe('formatRelativeTime', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-02T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should return "just now" for times less than 60 seconds ago', () => {
		const date = new Date('2026-04-02T11:59:30Z'); // 30 seconds ago
		expect(formatRelativeTime(date)).toBe('just now');
	});

	it('should return minutes ago', () => {
		const date = new Date('2026-04-02T11:55:00Z'); // 5 minutes ago
		expect(formatRelativeTime(date)).toBe('5m ago');
	});

	it('should return hours ago', () => {
		const date = new Date('2026-04-02T09:00:00Z'); // 3 hours ago
		expect(formatRelativeTime(date)).toBe('3h ago');
	});

	it('should return days ago for less than 7 days', () => {
		const date = new Date('2026-03-30T12:00:00Z'); // 3 days ago
		expect(formatRelativeTime(date)).toBe('3d ago');
	});

	it('should return formatted date for 7+ days ago', () => {
		const date = new Date('2026-03-20T12:00:00Z'); // 13 days ago
		const result = formatRelativeTime(date);
		// Should be a locale date string, not a relative time
		expect(result).not.toContain('ago');
	});
});

// ============================================================
// formatDate
// ============================================================

describe('formatDate', () => {
	it('should format a date with month, day, and year', () => {
		const date = new Date('2026-04-02');
		const result = formatDate(date);
		// Check it contains some recognizable components
		expect(result).toContain('2026');
	});
});

// ============================================================
// formatDateTime
// ============================================================

describe('formatDateTime', () => {
	it('should format a date with time', () => {
		const date = new Date('2026-04-02T14:30:00Z');
		const result = formatDateTime(date);
		expect(result).toContain('2026');
	});
});

// ============================================================
// formatDuration
// ============================================================

describe('formatDuration', () => {
	it('should format milliseconds', () => {
		expect(formatDuration(500)).toBe('500ms');
		expect(formatDuration(0)).toBe('0ms');
	});

	it('should format seconds', () => {
		expect(formatDuration(1000)).toBe('1.0s');
		expect(formatDuration(1500)).toBe('1.5s');
		expect(formatDuration(59999)).toBe('60.0s');
	});

	it('should format minutes and seconds', () => {
		expect(formatDuration(60000)).toBe('1m 0s');
		expect(formatDuration(90000)).toBe('1m 30s');
		expect(formatDuration(3599999)).toBe('59m 59s');
	});

	it('should format hours and minutes', () => {
		expect(formatDuration(3600000)).toBe('1h 0m');
		expect(formatDuration(5400000)).toBe('1h 30m');
		expect(formatDuration(7200000)).toBe('2h 0m');
	});
});

// ============================================================
// formatPosition
// ============================================================

describe('formatPosition', () => {
	it('should format line and column', () => {
		expect(formatPosition(1, 1)).toBe('Ln 1, Col 1');
		expect(formatPosition(10, 25)).toBe('Ln 10, Col 25');
	});
});

// ============================================================
// formatPath
// ============================================================

describe('formatPath', () => {
	it('should return path as-is when under max length', () => {
		const short = 'src/lib/file.ts';
		expect(formatPath(short)).toBe(short);
	});

	it('should truncate long paths with ellipsis', () => {
		const long =
			'src/lib/components/editor/core/very-long-directory-name/another-deep-path/file.ts';
		const result = formatPath(long, 50);
		expect(result.length).toBeLessThanOrEqual(50);
		expect(result).toContain('...');
	});

	it('should handle paths with only two segments', () => {
		const path = 'a/' + 'x'.repeat(60);
		const result = formatPath(path, 50);
		expect(result.length).toBeLessThanOrEqual(50);
		expect(result).toContain('...');
	});

	it('should handle paths where first + last exceed maxLength', () => {
		const path = 'very-long-prefix/middle/very-long-filename-that-exceeds.ts';
		const result = formatPath(path, 30);
		expect(result.length).toBeLessThanOrEqual(30);
		expect(result).toContain('...');
	});

	it('should use default maxLength of 50', () => {
		const short = 'src/file.ts';
		expect(formatPath(short)).toBe(short);
	});
});

// ============================================================
// formatNumber
// ============================================================

describe('formatNumber', () => {
	it('should format numbers with locale formatting', () => {
		// Just verify it returns a string (locale-dependent)
		expect(typeof formatNumber(1234567)).toBe('string');
		expect(formatNumber(0)).toBe('0');
	});
});

// ============================================================
// formatPercent
// ============================================================

describe('formatPercent', () => {
	it('should format a decimal as percentage', () => {
		expect(formatPercent(0.5)).toBe('50%');
		expect(formatPercent(1)).toBe('100%');
		expect(formatPercent(0)).toBe('0%');
	});

	it('should respect decimal places', () => {
		expect(formatPercent(0.3333, 2)).toBe('33.33%');
		expect(formatPercent(0.5, 1)).toBe('50.0%');
	});

	it('should default to 0 decimal places', () => {
		expect(formatPercent(0.756)).toBe('76%');
	});
});

// ============================================================
// pluralize
// ============================================================

describe('pluralize', () => {
	it('should return singular for count 1', () => {
		expect(pluralize(1, 'file')).toBe('1 file');
		expect(pluralize(1, 'match', 'matches')).toBe('1 match');
	});

	it('should return plural for count != 1', () => {
		expect(pluralize(0, 'file')).toBe('0 files');
		expect(pluralize(2, 'file')).toBe('2 files');
		expect(pluralize(5, 'match', 'matches')).toBe('5 matches');
	});

	it('should auto-pluralize with s when no plural given', () => {
		expect(pluralize(3, 'item')).toBe('3 items');
	});
});

// ============================================================
// truncate
// ============================================================

describe('truncate', () => {
	it('should return text unchanged when under max length', () => {
		expect(truncate('hello', 10)).toBe('hello');
	});

	it('should truncate with ellipsis character', () => {
		const result = truncate('hello world', 8);
		expect(result.length).toBe(8);
		expect(result).toContain('\u2026'); // Unicode ellipsis
	});

	it('should handle exact length', () => {
		expect(truncate('hello', 5)).toBe('hello');
	});
});

// ============================================================
// camelToTitle
// ============================================================

describe('camelToTitle', () => {
	it('should convert camelCase to Title Case', () => {
		expect(camelToTitle('helloWorld')).toBe('Hello World');
		expect(camelToTitle('camelCaseString')).toBe('Camel Case String');
	});

	it('should handle single word', () => {
		expect(camelToTitle('hello')).toBe('Hello');
	});

	it('should handle already capitalized first letter', () => {
		expect(camelToTitle('HelloWorld')).toBe('Hello World');
	});
});

// ============================================================
// snakeToTitle
// ============================================================

describe('snakeToTitle', () => {
	it('should convert snake_case to Title Case', () => {
		expect(snakeToTitle('hello_world')).toBe('Hello World');
		expect(snakeToTitle('snake_case_string')).toBe('Snake Case String');
	});

	it('should handle single word', () => {
		expect(snakeToTitle('hello')).toBe('Hello');
	});

	it('should handle empty segments', () => {
		// double underscores produce empty segments
		const result = snakeToTitle('a__b');
		expect(result).toContain('A');
		expect(result).toContain('B');
	});
});
