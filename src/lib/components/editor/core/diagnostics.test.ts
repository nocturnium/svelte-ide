import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	DiagnosticsManager,
	createDiagnosticsManager,
	getSeverityIcon,
	getSeverityColor,
	getSeverityLabel,
	sortDiagnostics,
	generateMockDiagnostics,
	type Diagnostic,
	type DiagnosticSeverity,
	type Position,
	type Range
} from './diagnostics';

// ============================================================
// Helpers
// ============================================================

function makeRange(startLine: number, startCol: number, endLine: number, endCol: number): Range {
	return {
		start: { line: startLine, column: startCol },
		end: { line: endLine, column: endCol }
	};
}

function makeDiag(overrides: Partial<Omit<Diagnostic, 'id'>> = {}): Omit<Diagnostic, 'id'> {
	return {
		range: overrides.range ?? makeRange(0, 0, 0, 10),
		severity: overrides.severity ?? 'error',
		message: overrides.message ?? 'test error',
		source: overrides.source ?? 'typescript',
		code: overrides.code,
		codeUrl: overrides.codeUrl,
		relatedInfo: overrides.relatedInfo,
		tags: overrides.tags,
		fixes: overrides.fixes
	};
}

const FILE_A = '/src/a.ts';
const FILE_B = '/src/b.ts';

// ============================================================
// DiagnosticsManager — creation
// ============================================================

describe('DiagnosticsManager — creation', () => {
	it('should create a new instance via factory function', () => {
		const mgr = createDiagnosticsManager();
		expect(mgr).toBeInstanceOf(DiagnosticsManager);
	});

	it('should start with no diagnostics', () => {
		const mgr = new DiagnosticsManager();
		expect(mgr.getDiagnostics(FILE_A)).toEqual([]);
		expect(mgr.getTotalCount()).toBe(0);
	});

	it('should start enabled with default config', () => {
		const mgr = new DiagnosticsManager();
		expect(mgr.isEnabled()).toBe(true);
		expect(mgr.config.showInline).toBe(true);
		expect(mgr.config.showGutterIcons).toBe(true);
		expect(mgr.config.severityFilter).toEqual(['error', 'warning', 'info', 'hint']);
	});
});

// ============================================================
// DiagnosticsManager — setDiagnostics / getDiagnostics
// ============================================================

describe('DiagnosticsManager — setDiagnostics / getDiagnostics', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
	});

	it('should set diagnostics for a file and assign unique ids', () => {
		mgr.setDiagnostics(FILE_A, [makeDiag(), makeDiag({ message: 'second' })]);
		const diags = mgr.getDiagnostics(FILE_A);
		expect(diags).toHaveLength(2);
		expect(diags[0].id).toBeTruthy();
		expect(diags[1].id).toBeTruthy();
		expect(diags[0].id).not.toBe(diags[1].id);
	});

	it('should replace existing diagnostics when calling setDiagnostics again', () => {
		mgr.setDiagnostics(FILE_A, [makeDiag({ message: 'first' })]);
		mgr.setDiagnostics(FILE_A, [makeDiag({ message: 'replaced' })]);
		const diags = mgr.getDiagnostics(FILE_A);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toBe('replaced');
	});

	it('should return empty array for a file with no diagnostics', () => {
		expect(mgr.getDiagnostics('/nonexistent')).toEqual([]);
	});

	it('should limit diagnostics per file to maxPerFile config', () => {
		const many = Array.from({ length: 200 }, (_, i) => makeDiag({ message: `diag-${i}` }));
		mgr.setDiagnostics(FILE_A, many);
		expect(mgr.getDiagnostics(FILE_A).length).toBeLessThanOrEqual(100);
	});
});

// ============================================================
// DiagnosticsManager — addDiagnostics
// ============================================================

describe('DiagnosticsManager — addDiagnostics', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
	});

	it('should append diagnostics to existing ones', () => {
		mgr.setDiagnostics(FILE_A, [makeDiag({ message: 'first' })]);
		mgr.addDiagnostics(FILE_A, [makeDiag({ message: 'second' })]);
		const diags = mgr.getDiagnostics(FILE_A);
		expect(diags).toHaveLength(2);
		expect(diags[0].message).toBe('first');
		expect(diags[1].message).toBe('second');
	});

	it('should work when file has no prior diagnostics', () => {
		mgr.addDiagnostics(FILE_A, [makeDiag({ message: 'new' })]);
		expect(mgr.getDiagnostics(FILE_A)).toHaveLength(1);
	});

	it('should respect maxPerFile when combining', () => {
		const initial = Array.from({ length: 99 }, (_, i) => makeDiag({ message: `init-${i}` }));
		mgr.setDiagnostics(FILE_A, initial);
		mgr.addDiagnostics(FILE_A, [makeDiag({ message: 'extra1' }), makeDiag({ message: 'extra2' })]);
		// 99 + 2 = 101, should be limited to 100
		expect(mgr.getDiagnostics(FILE_A).length).toBeLessThanOrEqual(100);
	});
});

// ============================================================
// DiagnosticsManager — clearDiagnostics / clearAll
// ============================================================

describe('DiagnosticsManager — clearing', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
		mgr.setDiagnostics(FILE_A, [makeDiag()]);
		mgr.setDiagnostics(FILE_B, [makeDiag()]);
	});

	it('should clear diagnostics for a single file', () => {
		mgr.clearDiagnostics(FILE_A);
		expect(mgr.getDiagnostics(FILE_A)).toEqual([]);
		expect(mgr.getDiagnostics(FILE_B)).toHaveLength(1);
	});

	it('should clear all diagnostics', () => {
		mgr.clearAll();
		expect(mgr.getDiagnostics(FILE_A)).toEqual([]);
		expect(mgr.getDiagnostics(FILE_B)).toEqual([]);
		expect(mgr.getTotalCount()).toBe(0);
	});
});

// ============================================================
// DiagnosticsManager — severity levels and filtering
// ============================================================

describe('DiagnosticsManager — severity filtering', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
		mgr.setDiagnostics(FILE_A, [
			makeDiag({ severity: 'error', message: 'err' }),
			makeDiag({ severity: 'warning', message: 'warn' }),
			makeDiag({ severity: 'info', message: 'inf' }),
			makeDiag({ severity: 'hint', message: 'hnt' })
		]);
	});

	it('should return all severities by default', () => {
		expect(mgr.getDiagnostics(FILE_A)).toHaveLength(4);
	});

	it('should filter to only errors', () => {
		mgr.setSeverityFilter(['error']);
		const diags = mgr.getDiagnostics(FILE_A);
		expect(diags).toHaveLength(1);
		expect(diags[0].severity).toBe('error');
	});

	it('should filter to errors and warnings', () => {
		mgr.setSeverityFilter(['error', 'warning']);
		const diags = mgr.getDiagnostics(FILE_A);
		expect(diags).toHaveLength(2);
		expect(diags.map((d) => d.severity)).toEqual(['error', 'warning']);
	});

	it('should return empty when filter is empty', () => {
		mgr.setSeverityFilter([]);
		expect(mgr.getDiagnostics(FILE_A)).toEqual([]);
	});

	it('should return empty when diagnostics are disabled', () => {
		mgr.setEnabled(false);
		expect(mgr.getDiagnostics(FILE_A)).toEqual([]);
		expect(mgr.isEnabled()).toBe(false);
	});

	it('should restore diagnostics when re-enabled', () => {
		mgr.setEnabled(false);
		mgr.setEnabled(true);
		expect(mgr.getDiagnostics(FILE_A)).toHaveLength(4);
	});
});

// ============================================================
// DiagnosticsManager — getCounts / getTotalCount
// ============================================================

describe('DiagnosticsManager — counts', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
		mgr.setDiagnostics(FILE_A, [
			makeDiag({ severity: 'error' }),
			makeDiag({ severity: 'error' }),
			makeDiag({ severity: 'warning' }),
			makeDiag({ severity: 'info' })
		]);
		mgr.setDiagnostics(FILE_B, [makeDiag({ severity: 'hint' }), makeDiag({ severity: 'error' })]);
	});

	it('should count by severity across all files', () => {
		const counts = mgr.getCounts();
		expect(counts.error).toBe(3);
		expect(counts.warning).toBe(1);
		expect(counts.info).toBe(1);
		expect(counts.hint).toBe(1);
	});

	it('should count by severity for a specific file', () => {
		const counts = mgr.getCounts(FILE_A);
		expect(counts.error).toBe(2);
		expect(counts.warning).toBe(1);
		expect(counts.info).toBe(1);
		expect(counts.hint).toBe(0);
	});

	it('should return total count across all files', () => {
		expect(mgr.getTotalCount()).toBe(6);
	});

	it('should return total count for a specific file', () => {
		expect(mgr.getTotalCount(FILE_A)).toBe(4);
		expect(mgr.getTotalCount(FILE_B)).toBe(2);
	});

	it('should respect severity filter in counts', () => {
		mgr.setSeverityFilter(['error']);
		const counts = mgr.getCounts();
		expect(counts.error).toBe(3);
		expect(counts.warning).toBe(0);
		expect(mgr.getTotalCount()).toBe(3);
	});
});

// ============================================================
// DiagnosticsManager — getAllDiagnostics
// ============================================================

describe('DiagnosticsManager — getAllDiagnostics', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
	});

	it('should return all diagnostics grouped by file', () => {
		mgr.setDiagnostics(FILE_A, [makeDiag()]);
		mgr.setDiagnostics(FILE_B, [makeDiag(), makeDiag()]);
		const all = mgr.getAllDiagnostics();
		expect(all.size).toBe(2);
		expect(all.get(FILE_A)).toHaveLength(1);
		expect(all.get(FILE_B)).toHaveLength(2);
	});

	it('should omit files with no matching diagnostics after filter', () => {
		mgr.setDiagnostics(FILE_A, [makeDiag({ severity: 'error' })]);
		mgr.setDiagnostics(FILE_B, [makeDiag({ severity: 'hint' })]);
		mgr.setSeverityFilter(['error']);
		const all = mgr.getAllDiagnostics();
		expect(all.size).toBe(1);
		expect(all.has(FILE_A)).toBe(true);
		expect(all.has(FILE_B)).toBe(false);
	});
});

// ============================================================
// DiagnosticsManager — position and line queries
// ============================================================

describe('DiagnosticsManager — position and line queries', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
		mgr.setDiagnostics(FILE_A, [
			makeDiag({ range: makeRange(5, 0, 5, 20), message: 'line5' }),
			makeDiag({ range: makeRange(10, 5, 12, 15), message: 'multi-line' }),
			makeDiag({ range: makeRange(10, 0, 10, 5), message: 'also-line10' })
		]);
	});

	it('should get diagnostics for a specific line', () => {
		const line5 = mgr.getDiagnosticsForLine(FILE_A, 5);
		expect(line5).toHaveLength(1);
		expect(line5[0].message).toBe('line5');
	});

	it('should return multiple diagnostics on the same line', () => {
		const line10 = mgr.getDiagnosticsForLine(FILE_A, 10);
		expect(line10).toHaveLength(2);
	});

	it('should find multi-line diagnostic on middle lines', () => {
		const line11 = mgr.getDiagnosticsForLine(FILE_A, 11);
		expect(line11).toHaveLength(1);
		expect(line11[0].message).toBe('multi-line');
	});

	it('should return empty for a line with no diagnostics', () => {
		expect(mgr.getDiagnosticsForLine(FILE_A, 99)).toEqual([]);
	});

	it('should get diagnostics at a specific position', () => {
		const pos: Position = { line: 5, column: 10 };
		const atPos = mgr.getDiagnosticsAtPosition(FILE_A, pos);
		expect(atPos).toHaveLength(1);
		expect(atPos[0].message).toBe('line5');
	});

	it('should not match position outside range column', () => {
		const pos: Position = { line: 5, column: 25 };
		const atPos = mgr.getDiagnosticsAtPosition(FILE_A, pos);
		expect(atPos).toHaveLength(0);
	});

	it('should not match position before range start column on start line', () => {
		const pos: Position = { line: 10, column: 3 };
		const atPos = mgr.getDiagnosticsAtPosition(FILE_A, pos);
		// Should match 'also-line10' (0-5) but not 'multi-line' (5-15 on start line)
		expect(atPos).toHaveLength(1);
		expect(atPos[0].message).toBe('also-line10');
	});

	it('should not match position after range end column on end line', () => {
		// multi-line diagnostic ends at line 12, col 15
		const pos: Position = { line: 12, column: 20 };
		const atPos = mgr.getDiagnosticsAtPosition(FILE_A, pos);
		expect(atPos).toHaveLength(0);
	});
});

// ============================================================
// DiagnosticsManager — config
// ============================================================

describe('DiagnosticsManager — config', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
	});

	it('should update config with partial values', () => {
		mgr.setConfig({ showDelay: 1000 });
		expect(mgr.config.showDelay).toBe(1000);
		// Other values should remain
		expect(mgr.config.enabled).toBe(true);
	});

	it('should return a copy of config (not a reference)', () => {
		const config1 = mgr.config;
		const config2 = mgr.config;
		expect(config1).not.toBe(config2);
		expect(config1).toEqual(config2);
	});
});

// ============================================================
// DiagnosticsManager — applyFix
// ============================================================

describe('DiagnosticsManager — applyFix', () => {
	it('should return the text edits from a fix', () => {
		const mgr = new DiagnosticsManager();
		const fix = {
			title: 'Fix it',
			isPreferred: true,
			edits: [{ range: makeRange(1, 0, 1, 5), newText: 'const' }]
		};
		const diag = { ...makeDiag(), id: 'test', fixes: [fix] } as Diagnostic;
		const edits = mgr.applyFix(diag, fix);
		expect(edits).toEqual(fix.edits);
	});
});

// ============================================================
// DiagnosticsManager — subscribe / notify
// ============================================================

describe('DiagnosticsManager — subscribe', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
	});

	it('should notify listeners on setDiagnostics', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.setDiagnostics(FILE_A, [makeDiag()]);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('should notify on addDiagnostics, clearDiagnostics, clearAll', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.addDiagnostics(FILE_A, [makeDiag()]);
		mgr.clearDiagnostics(FILE_A);
		mgr.clearAll();
		expect(listener).toHaveBeenCalledTimes(3);
	});

	it('should notify on config changes', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.setConfig({ showDelay: 200 });
		mgr.setEnabled(false);
		mgr.setSeverityFilter(['error']);
		expect(listener).toHaveBeenCalledTimes(3);
	});

	it('should unsubscribe correctly', () => {
		const listener = vi.fn();
		const unsub = mgr.subscribe(listener);
		unsub();
		mgr.setDiagnostics(FILE_A, [makeDiag()]);
		expect(listener).not.toHaveBeenCalled();
	});
});

// ============================================================
// DiagnosticsManager — destroy
// ============================================================

describe('DiagnosticsManager — destroy', () => {
	it('should clear all data and listeners', () => {
		const mgr = new DiagnosticsManager();
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.setDiagnostics(FILE_A, [makeDiag()]);
		mgr.destroy();
		expect(mgr.getDiagnostics(FILE_A)).toEqual([]);
		// After destroy, setting diagnostics should not call old listener
		// (listeners were cleared, but we can still use the manager)
		listener.mockClear();
		mgr.setDiagnostics(FILE_A, [makeDiag()]);
		expect(listener).not.toHaveBeenCalled();
	});
});

// ============================================================
// Edge cases
// ============================================================

describe('DiagnosticsManager — edge cases', () => {
	let mgr: DiagnosticsManager;

	beforeEach(() => {
		mgr = new DiagnosticsManager();
	});

	it('should handle empty diagnostics array in setDiagnostics', () => {
		mgr.setDiagnostics(FILE_A, []);
		expect(mgr.getDiagnostics(FILE_A)).toEqual([]);
	});

	it('should handle overlapping ranges on the same line', () => {
		mgr.setDiagnostics(FILE_A, [
			makeDiag({ range: makeRange(3, 0, 3, 10), message: 'overlap-a' }),
			makeDiag({ range: makeRange(3, 5, 3, 15), message: 'overlap-b' })
		]);
		const line3 = mgr.getDiagnosticsForLine(FILE_A, 3);
		expect(line3).toHaveLength(2);
	});

	it('should handle diagnostics at line 0', () => {
		mgr.setDiagnostics(FILE_A, [makeDiag({ range: makeRange(0, 0, 0, 5) })]);
		expect(mgr.getDiagnosticsForLine(FILE_A, 0)).toHaveLength(1);
	});

	it('should handle diagnostics with all optional fields', () => {
		mgr.setDiagnostics(FILE_A, [
			makeDiag({
				code: 'TS2322',
				codeUrl: 'https://example.com',
				relatedInfo: [
					{
						range: makeRange(1, 0, 1, 5),
						message: 'related',
						filePath: FILE_B
					}
				],
				tags: { deprecated: true, unnecessary: false },
				fixes: [
					{
						title: 'quick fix',
						isPreferred: true,
						edits: [{ range: makeRange(0, 0, 0, 5), newText: 'fixed' }]
					}
				]
			})
		]);
		const diag = mgr.getDiagnostics(FILE_A)[0];
		expect(diag.code).toBe('TS2322');
		expect(diag.relatedInfo).toHaveLength(1);
		expect(diag.tags?.deprecated).toBe(true);
		expect(diag.fixes).toHaveLength(1);
	});
});

// ============================================================
// Utility functions
// ============================================================

describe('getSeverityIcon', () => {
	it('should return correct icons', () => {
		expect(getSeverityIcon('error')).toBe('✕');
		expect(getSeverityIcon('warning')).toBe('⚠');
		expect(getSeverityIcon('info')).toBe('ℹ');
		// Monochrome glyph, not the 💡 color emoji (which would ignore `color` and
		// render the lowest severity louder than a warning).
		expect(getSeverityIcon('hint')).toBe('◇');
	});
});

describe('getSeverityColor', () => {
	it('should return correct colors', () => {
		expect(getSeverityColor('error')).toBe('var(--ide-error)');
		expect(getSeverityColor('warning')).toBe('var(--ide-warning)');
		expect(getSeverityColor('info')).toBe('var(--ide-info)');
		expect(getSeverityColor('hint')).toBe('var(--ide-text-muted)');
	});
});

describe('getSeverityLabel', () => {
	it('should return correct labels', () => {
		expect(getSeverityLabel('error')).toBe('Error');
		expect(getSeverityLabel('warning')).toBe('Warning');
		expect(getSeverityLabel('info')).toBe('Info');
		expect(getSeverityLabel('hint')).toBe('Hint');
	});
});

describe('sortDiagnostics', () => {
	it('should sort by severity first, then by line', () => {
		const diags: Diagnostic[] = [
			{ ...makeDiag({ severity: 'info', range: makeRange(1, 0, 1, 5) }), id: '1' },
			{ ...makeDiag({ severity: 'error', range: makeRange(10, 0, 10, 5) }), id: '2' },
			{ ...makeDiag({ severity: 'error', range: makeRange(2, 0, 2, 5) }), id: '3' },
			{ ...makeDiag({ severity: 'warning', range: makeRange(5, 0, 5, 5) }), id: '4' },
			{ ...makeDiag({ severity: 'hint', range: makeRange(0, 0, 0, 5) }), id: '5' }
		];
		const sorted = sortDiagnostics(diags);
		expect(sorted.map((d) => d.severity)).toEqual(['error', 'error', 'warning', 'info', 'hint']);
		// Within errors, line 2 before line 10
		expect(sorted[0].range.start.line).toBe(2);
		expect(sorted[1].range.start.line).toBe(10);
	});

	it('should not mutate the original array', () => {
		const diags: Diagnostic[] = [
			{ ...makeDiag({ severity: 'hint' }), id: '1' },
			{ ...makeDiag({ severity: 'error' }), id: '2' }
		];
		const sorted = sortDiagnostics(diags);
		expect(sorted).not.toBe(diags);
		expect(diags[0].severity).toBe('hint'); // original unchanged
	});
});

describe('generateMockDiagnostics', () => {
	it('should generate roughly 10% of lineCount diagnostics', () => {
		const diags = generateMockDiagnostics(100);
		// ~10% of 100 = 10
		expect(diags.length).toBe(10);
	});

	it('should generate sorted diagnostics', () => {
		const diags = generateMockDiagnostics(200);
		// Verify sorted by severity
		const severityOrder: Record<DiagnosticSeverity, number> = {
			error: 0,
			warning: 1,
			info: 2,
			hint: 3
		};
		for (let i = 1; i < diags.length; i++) {
			const prev = severityOrder[diags[i - 1].severity];
			const curr = severityOrder[diags[i].severity];
			if (prev === curr) {
				expect(diags[i].range.start.line).toBeGreaterThanOrEqual(diags[i - 1].range.start.line);
			} else {
				expect(curr).toBeGreaterThanOrEqual(prev);
			}
		}
	});

	it('should handle zero lines', () => {
		const diags = generateMockDiagnostics(0);
		expect(diags).toHaveLength(0);
	});
});
