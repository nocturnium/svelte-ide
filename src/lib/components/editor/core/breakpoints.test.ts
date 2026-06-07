import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	BreakpointManager,
	createBreakpointManager,
	getBreakpointIcon,
	getBreakpointColor,
	type Breakpoint,
	type BreakpointType,
	type BreakpointState
} from './breakpoints';

// ============================================================
// Helpers
// ============================================================

const FILE_A = '/src/a.ts';
const FILE_B = '/src/b.ts';

// ============================================================
// BreakpointManager — creation
// ============================================================

describe('BreakpointManager — creation', () => {
	it('should create a new instance via factory function', () => {
		const mgr = createBreakpointManager();
		expect(mgr).toBeInstanceOf(BreakpointManager);
	});

	it('should start with no breakpoints', () => {
		const mgr = new BreakpointManager();
		expect(mgr.getAllBreakpoints()).toEqual([]);
		expect(mgr.getCount()).toBe(0);
	});

	it('should start enabled with default config', () => {
		const mgr = new BreakpointManager();
		expect(mgr.isEnabled()).toBe(true);
		expect(mgr.config.showGutter).toBe(true);
		expect(mgr.config.allowConditional).toBe(true);
		expect(mgr.config.allowLogpoints).toBe(true);
		expect(mgr.config.maxPerFile).toBe(50);
	});
});

// ============================================================
// BreakpointManager — addBreakpoint
// ============================================================

describe('BreakpointManager — addBreakpoint', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should add a basic line breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 10);
		expect(bp.id).toBeTruthy();
		expect(bp.filePath).toBe(FILE_A);
		expect(bp.line).toBe(10);
		expect(bp.type).toBe('line');
		expect(bp.state).toBe('enabled');
		expect(bp.hitCount).toBe(0);
		expect(bp.verified).toBe(false);
		expect(bp.createdAt).toBeInstanceOf(Date);
	});

	it('should assign unique ids to each breakpoint', () => {
		const bp1 = mgr.addBreakpoint(FILE_A, 1);
		const bp2 = mgr.addBreakpoint(FILE_A, 2);
		expect(bp1.id).not.toBe(bp2.id);
	});

	it('should add a conditional breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5, {
			type: 'conditional',
			condition: 'x > 10'
		});
		expect(bp.type).toBe('conditional');
		expect(bp.condition).toBe('x > 10');
	});

	it('should add a logpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 7, {
			type: 'logpoint',
			logMessage: 'value is {x}'
		});
		expect(bp.type).toBe('logpoint');
		expect(bp.logMessage).toBe('value is {x}');
	});

	it('should add a breakpoint with hit condition', () => {
		const bp = mgr.addBreakpoint(FILE_A, 3, {
			hitCondition: '>= 5'
		});
		expect(bp.hitCondition).toBe('>= 5');
	});

	it('should add a function breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 0, {
			type: 'function',
			functionName: 'myFunc'
		});
		expect(bp.type).toBe('function');
		expect(bp.functionName).toBe('myFunc');
	});

	it('should add an exception breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 0, {
			type: 'exception',
			exceptionTypes: ['TypeError', 'RangeError']
		});
		expect(bp.type).toBe('exception');
		expect(bp.exceptionTypes).toEqual(['TypeError', 'RangeError']);
	});

	it('should add a breakpoint with column', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5, { column: 12 });
		expect(bp.column).toBe(12);
	});
});

// ============================================================
// BreakpointManager — removeBreakpoint
// ============================================================

describe('BreakpointManager — removeBreakpoint', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should remove an existing breakpoint and return true', () => {
		const bp = mgr.addBreakpoint(FILE_A, 10);
		expect(mgr.removeBreakpoint(bp.id)).toBe(true);
		expect(mgr.getBreakpoint(bp.id)).toBeUndefined();
	});

	it('should return false when removing a nonexistent id', () => {
		expect(mgr.removeBreakpoint('nonexistent')).toBe(false);
	});
});

// ============================================================
// BreakpointManager — toggleBreakpoint
// ============================================================

describe('BreakpointManager — toggleBreakpoint', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should add a breakpoint when none exists at line', () => {
		const bp = mgr.toggleBreakpoint(FILE_A, 5);
		expect(bp).not.toBeNull();
		expect(bp!.line).toBe(5);
		expect(mgr.getCount()).toBe(1);
	});

	it('should remove the breakpoint when one already exists at line', () => {
		mgr.addBreakpoint(FILE_A, 5);
		const result = mgr.toggleBreakpoint(FILE_A, 5);
		expect(result).toBeNull();
		expect(mgr.getCount()).toBe(0);
	});

	it('should only affect the specified file', () => {
		mgr.addBreakpoint(FILE_A, 5);
		mgr.addBreakpoint(FILE_B, 5);
		mgr.toggleBreakpoint(FILE_A, 5);
		expect(mgr.getBreakpointsForFile(FILE_A)).toHaveLength(0);
		expect(mgr.getBreakpointsForFile(FILE_B)).toHaveLength(1);
	});
});

// ============================================================
// BreakpointManager — updateBreakpoint
// ============================================================

describe('BreakpointManager — updateBreakpoint', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should update breakpoint fields', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		const updated = mgr.updateBreakpoint(bp.id, {
			type: 'conditional',
			condition: 'x > 0'
		});
		expect(updated).not.toBeNull();
		expect(updated!.type).toBe('conditional');
		expect(updated!.condition).toBe('x > 0');
		// Original fields should persist
		expect(updated!.line).toBe(5);
		expect(updated!.filePath).toBe(FILE_A);
	});

	it('should return null for a nonexistent breakpoint', () => {
		expect(mgr.updateBreakpoint('nonexistent', { type: 'line' })).toBeNull();
	});
});

// ============================================================
// BreakpointManager — enable / disable
// ============================================================

describe('BreakpointManager — enable / disable', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should disable an enabled breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		expect(mgr.disableBreakpoint(bp.id)).toBe(true);
		expect(mgr.getBreakpoint(bp.id)!.state).toBe('disabled');
	});

	it('should enable a disabled breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		mgr.disableBreakpoint(bp.id);
		expect(mgr.enableBreakpoint(bp.id)).toBe(true);
		expect(mgr.getBreakpoint(bp.id)!.state).toBe('enabled');
	});

	it('should return false when disabling an already disabled breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		mgr.disableBreakpoint(bp.id);
		expect(mgr.disableBreakpoint(bp.id)).toBe(false);
	});

	it('should return false when enabling an already enabled breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		expect(mgr.enableBreakpoint(bp.id)).toBe(false);
	});

	it('should toggle enabled state', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		expect(mgr.getBreakpoint(bp.id)!.state).toBe('enabled');
		mgr.toggleBreakpointEnabled(bp.id);
		expect(mgr.getBreakpoint(bp.id)!.state).toBe('disabled');
		mgr.toggleBreakpointEnabled(bp.id);
		expect(mgr.getBreakpoint(bp.id)!.state).toBe('enabled');
	});

	it('should return false when toggling nonexistent breakpoint', () => {
		expect(mgr.toggleBreakpointEnabled('nonexistent')).toBe(false);
	});

	it('should enable all breakpoints', () => {
		const bp1 = mgr.addBreakpoint(FILE_A, 1);
		const bp2 = mgr.addBreakpoint(FILE_A, 2);
		mgr.disableBreakpoint(bp1.id);
		mgr.disableBreakpoint(bp2.id);
		mgr.enableAllBreakpoints();
		expect(mgr.getBreakpoint(bp1.id)!.state).toBe('enabled');
		expect(mgr.getBreakpoint(bp2.id)!.state).toBe('enabled');
	});

	it('should disable all breakpoints', () => {
		const bp1 = mgr.addBreakpoint(FILE_A, 1);
		const bp2 = mgr.addBreakpoint(FILE_A, 2);
		mgr.disableAllBreakpoints();
		expect(mgr.getBreakpoint(bp1.id)!.state).toBe('disabled');
		expect(mgr.getBreakpoint(bp2.id)!.state).toBe('disabled');
	});
});

// ============================================================
// BreakpointManager — queries
// ============================================================

describe('BreakpointManager — queries', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
		mgr.addBreakpoint(FILE_A, 10);
		mgr.addBreakpoint(FILE_A, 5);
		mgr.addBreakpoint(FILE_A, 20);
		mgr.addBreakpoint(FILE_B, 3);
	});

	it('should get breakpoint by id', () => {
		const bp = mgr.addBreakpoint(FILE_A, 99);
		expect(mgr.getBreakpoint(bp.id)).toBe(bp);
	});

	it('should return undefined for unknown id', () => {
		expect(mgr.getBreakpoint('nonexistent')).toBeUndefined();
	});

	it('should get breakpoint at a specific line', () => {
		const bp = mgr.getBreakpointAtLine(FILE_A, 10);
		expect(bp).toBeDefined();
		expect(bp!.line).toBe(10);
	});

	it('should return undefined when no breakpoint at line', () => {
		expect(mgr.getBreakpointAtLine(FILE_A, 999)).toBeUndefined();
	});

	it('should get all breakpoints for a file sorted by line', () => {
		const bps = mgr.getBreakpointsForFile(FILE_A);
		expect(bps).toHaveLength(3);
		expect(bps.map((b) => b.line)).toEqual([5, 10, 20]);
	});

	it('should return empty array for file with no breakpoints', () => {
		expect(mgr.getBreakpointsForFile('/empty')).toEqual([]);
	});

	it('should get all breakpoints sorted by file then line', () => {
		const all = mgr.getAllBreakpoints();
		expect(all).toHaveLength(4);
		// FILE_A comes before FILE_B alphabetically
		expect(all[0].filePath).toBe(FILE_A);
		expect(all[all.length - 1].filePath).toBe(FILE_B);
	});

	it('should get breakpoints grouped by file', () => {
		const byFile = mgr.getBreakpointsByFile();
		expect(byFile.size).toBe(2);
		expect(byFile.get(FILE_A)).toHaveLength(3);
		expect(byFile.get(FILE_B)).toHaveLength(1);
		// Within each file, sorted by line
		const aLines = byFile.get(FILE_A)!.map((b) => b.line);
		expect(aLines).toEqual([5, 10, 20]);
	});

	it('should get count for specific file', () => {
		expect(mgr.getCount(FILE_A)).toBe(3);
		expect(mgr.getCount(FILE_B)).toBe(1);
	});

	it('should get total count', () => {
		expect(mgr.getCount()).toBe(4);
	});
});

// ============================================================
// BreakpointManager — clearing
// ============================================================

describe('BreakpointManager — clearing', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
		mgr.addBreakpoint(FILE_A, 1);
		mgr.addBreakpoint(FILE_A, 2);
		mgr.addBreakpoint(FILE_B, 3);
	});

	it('should clear breakpoints for a single file', () => {
		const removed = mgr.clearFileBreakpoints(FILE_A);
		expect(removed).toBe(2);
		expect(mgr.getBreakpointsForFile(FILE_A)).toEqual([]);
		expect(mgr.getBreakpointsForFile(FILE_B)).toHaveLength(1);
	});

	it('should return 0 when clearing a file with no breakpoints', () => {
		expect(mgr.clearFileBreakpoints('/empty')).toBe(0);
	});

	it('should clear all breakpoints', () => {
		const removed = mgr.clearAllBreakpoints();
		expect(removed).toBe(3);
		expect(mgr.getCount()).toBe(0);
	});

	it('should return 0 when clearing all from empty manager', () => {
		mgr.clearAllBreakpoints();
		expect(mgr.clearAllBreakpoints()).toBe(0);
	});
});

// ============================================================
// BreakpointManager — hit counts
// ============================================================

describe('BreakpointManager — hit counts', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should start with hit count 0', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		expect(bp.hitCount).toBe(0);
	});

	it('should increment hit count', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		expect(mgr.incrementHitCount(bp.id)).toBe(1);
		expect(mgr.incrementHitCount(bp.id)).toBe(2);
		expect(mgr.getBreakpoint(bp.id)!.hitCount).toBe(2);
	});

	it('should return 0 when incrementing nonexistent breakpoint', () => {
		expect(mgr.incrementHitCount('nonexistent')).toBe(0);
	});

	it('should reset all hit counts', () => {
		const bp1 = mgr.addBreakpoint(FILE_A, 1);
		const bp2 = mgr.addBreakpoint(FILE_A, 2);
		mgr.incrementHitCount(bp1.id);
		mgr.incrementHitCount(bp2.id);
		mgr.incrementHitCount(bp2.id);
		mgr.resetHitCounts();
		expect(mgr.getBreakpoint(bp1.id)!.hitCount).toBe(0);
		expect(mgr.getBreakpoint(bp2.id)!.hitCount).toBe(0);
	});
});

// ============================================================
// BreakpointManager — shouldBreakpointTrigger
// ============================================================

describe('BreakpointManager — shouldBreakpointTrigger', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should trigger for enabled breakpoint with no conditions', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(true);
	});

	it('should not trigger for disabled breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		mgr.disableBreakpoint(bp.id);
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(false);
	});

	it('should not trigger for nonexistent breakpoint', () => {
		expect(mgr.shouldBreakpointTrigger('nonexistent')).toBe(false);
	});

	it('should evaluate >= hit condition', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5, { hitCondition: '>= 3' });
		// hitCount = 0, should not trigger
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(false);
		mgr.incrementHitCount(bp.id); // 1
		mgr.incrementHitCount(bp.id); // 2
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(false);
		mgr.incrementHitCount(bp.id); // 3
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(true);
		mgr.incrementHitCount(bp.id); // 4
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(true);
	});

	it('should evaluate == hit condition', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5, { hitCondition: '== 2' });
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(false);
		mgr.incrementHitCount(bp.id); // 1
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(false);
		mgr.incrementHitCount(bp.id); // 2
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(true);
		mgr.incrementHitCount(bp.id); // 3
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(false);
	});

	it('should evaluate modulo hit condition', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5, { hitCondition: '% 3 == 0' });
		// hitCount = 0 -> 0 % 3 == 0 -> true
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(true);
		mgr.incrementHitCount(bp.id); // 1
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(false);
		mgr.incrementHitCount(bp.id); // 2
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(false);
		mgr.incrementHitCount(bp.id); // 3
		expect(mgr.shouldBreakpointTrigger(bp.id)).toBe(true);
	});
});

// ============================================================
// BreakpointManager — verify
// ============================================================

describe('BreakpointManager — verify', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should verify a breakpoint', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		mgr.verifyBreakpoint(bp.id, true);
		const updated = mgr.getBreakpoint(bp.id)!;
		expect(updated.verified).toBe(true);
		expect(updated.state).toBe('enabled');
	});

	it('should mark breakpoint invalid with error message', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		mgr.verifyBreakpoint(bp.id, false, 'No executable code at line 5');
		const updated = mgr.getBreakpoint(bp.id)!;
		expect(updated.verified).toBe(false);
		expect(updated.state).toBe('invalid');
		expect(updated.errorMessage).toBe('No executable code at line 5');
	});

	it('should do nothing for nonexistent breakpoint', () => {
		// Should not throw
		mgr.verifyBreakpoint('nonexistent', true);
	});
});

// ============================================================
// BreakpointManager — serialization
// ============================================================

describe('BreakpointManager — serialization', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should export breakpoints to JSON', () => {
		mgr.addBreakpoint(FILE_A, 5);
		mgr.addBreakpoint(FILE_B, 10, { type: 'conditional', condition: 'x > 0' });
		const json = mgr.exportBreakpoints();
		const parsed = JSON.parse(json);
		expect(parsed).toHaveLength(2);
		expect(parsed[0].filePath).toBe(FILE_A);
		expect(parsed[1].condition).toBe('x > 0');
	});

	it('should import breakpoints from JSON', () => {
		mgr.addBreakpoint(FILE_A, 5);
		const json = mgr.exportBreakpoints();

		const mgr2 = new BreakpointManager();
		mgr2.importBreakpoints(json);
		expect(mgr2.getCount()).toBe(1);
		const imported = mgr2.getAllBreakpoints()[0];
		expect(imported.filePath).toBe(FILE_A);
		expect(imported.line).toBe(5);
		expect(imported.createdAt).toBeInstanceOf(Date);
	});

	it('should roundtrip export/import preserving data', () => {
		mgr.addBreakpoint(FILE_A, 5, {
			type: 'conditional',
			condition: 'x > 10',
			hitCondition: '>= 3'
		});
		mgr.addBreakpoint(FILE_B, 20, {
			type: 'logpoint',
			logMessage: 'value: {val}'
		});
		const json = mgr.exportBreakpoints();

		const mgr2 = new BreakpointManager();
		mgr2.importBreakpoints(json);
		expect(mgr2.getCount()).toBe(2);
		const all = mgr2.getAllBreakpoints();
		expect(all[0].type).toBe('conditional');
		expect(all[0].condition).toBe('x > 10');
		expect(all[1].type).toBe('logpoint');
		expect(all[1].logMessage).toBe('value: {val}');
	});

	it('should handle invalid JSON gracefully (no throw)', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mgr.importBreakpoints('not valid json {{{');
		expect(mgr.getCount()).toBe(0);
		consoleSpy.mockRestore();
	});

	it('should clear existing breakpoints on import', () => {
		mgr.addBreakpoint(FILE_A, 1);
		mgr.addBreakpoint(FILE_A, 2);
		const mgr2 = new BreakpointManager();
		mgr2.addBreakpoint(FILE_B, 99);
		const json = mgr.exportBreakpoints();
		mgr2.importBreakpoints(json);
		expect(mgr2.getCount()).toBe(2);
		expect(mgr2.getBreakpointsForFile(FILE_B)).toHaveLength(0);
	});
});

// ============================================================
// BreakpointManager — config
// ============================================================

describe('BreakpointManager — config', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should update config with partial values', () => {
		mgr.setConfig({ maxPerFile: 10 });
		expect(mgr.config.maxPerFile).toBe(10);
		expect(mgr.config.enabled).toBe(true);
	});

	it('should return a copy of config (not a reference)', () => {
		const c1 = mgr.config;
		const c2 = mgr.config;
		expect(c1).not.toBe(c2);
		expect(c1).toEqual(c2);
	});

	it('should toggle global enabled state', () => {
		mgr.setEnabled(false);
		expect(mgr.isEnabled()).toBe(false);
		mgr.setEnabled(true);
		expect(mgr.isEnabled()).toBe(true);
	});
});

// ============================================================
// BreakpointManager — subscribe / notify
// ============================================================

describe('BreakpointManager — subscribe', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should notify listeners on addBreakpoint', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.addBreakpoint(FILE_A, 5);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('should notify on removeBreakpoint (when successful)', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.removeBreakpoint(bp.id);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('should not notify on failed removeBreakpoint', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.removeBreakpoint('nonexistent');
		expect(listener).not.toHaveBeenCalled();
	});

	it('should notify on toggle, enable, disable, verify, update', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5);
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.disableBreakpoint(bp.id);
		mgr.enableBreakpoint(bp.id);
		mgr.toggleBreakpointEnabled(bp.id);
		mgr.verifyBreakpoint(bp.id, true);
		mgr.updateBreakpoint(bp.id, { line: 6 });
		expect(listener).toHaveBeenCalledTimes(5);
	});

	it('should notify on clear operations', () => {
		mgr.addBreakpoint(FILE_A, 1);
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.clearFileBreakpoints(FILE_A);
		mgr.addBreakpoint(FILE_A, 1);
		mgr.clearAllBreakpoints();
		expect(listener).toHaveBeenCalledTimes(3);
	});

	it('should unsubscribe correctly', () => {
		const listener = vi.fn();
		const unsub = mgr.subscribe(listener);
		unsub();
		mgr.addBreakpoint(FILE_A, 5);
		expect(listener).not.toHaveBeenCalled();
	});
});

// ============================================================
// BreakpointManager — destroy
// ============================================================

describe('BreakpointManager — destroy', () => {
	it('should clear all data and listeners', () => {
		const mgr = new BreakpointManager();
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.addBreakpoint(FILE_A, 5);
		mgr.destroy();
		expect(mgr.getCount()).toBe(0);
		listener.mockClear();
		mgr.addBreakpoint(FILE_A, 10);
		expect(listener).not.toHaveBeenCalled();
	});
});

// ============================================================
// Edge cases
// ============================================================

describe('BreakpointManager — edge cases', () => {
	let mgr: BreakpointManager;

	beforeEach(() => {
		mgr = new BreakpointManager();
	});

	it('should allow duplicate breakpoints on the same line (addBreakpoint)', () => {
		// addBreakpoint does not check for duplicates
		mgr.addBreakpoint(FILE_A, 5);
		mgr.addBreakpoint(FILE_A, 5);
		expect(mgr.getBreakpointsForFile(FILE_A)).toHaveLength(2);
	});

	it('should handle breakpoint at line 0', () => {
		const bp = mgr.addBreakpoint(FILE_A, 0);
		expect(bp.line).toBe(0);
		expect(mgr.getBreakpointAtLine(FILE_A, 0)).toBeDefined();
	});

	it('should handle very large line numbers', () => {
		const bp = mgr.addBreakpoint(FILE_A, 999999);
		expect(bp.line).toBe(999999);
	});

	it('should handle breakpoint with disabled initial state', () => {
		const bp = mgr.addBreakpoint(FILE_A, 5, { state: 'disabled' });
		expect(bp.state).toBe('disabled');
	});

	it('should not notify when clearFileBreakpoints removes 0 items', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.clearFileBreakpoints('/empty-file');
		expect(listener).not.toHaveBeenCalled();
	});

	it('should not notify when clearAllBreakpoints has nothing to clear', () => {
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.clearAllBreakpoints();
		expect(listener).not.toHaveBeenCalled();
	});
});

// ============================================================
// Utility functions
// ============================================================

describe('getBreakpointIcon', () => {
	function bp(type: BreakpointType): Breakpoint {
		return {
			id: 'test',
			filePath: FILE_A,
			line: 0,
			type,
			state: 'enabled',
			hitCount: 0,
			verified: false,
			createdAt: new Date()
		};
	}

	it('should return correct icon for line breakpoint', () => {
		expect(getBreakpointIcon(bp('line'))).toBe('●');
	});

	it('should return correct icon for conditional breakpoint', () => {
		expect(getBreakpointIcon(bp('conditional'))).toBe('◉');
	});

	it('should return correct icon for logpoint', () => {
		expect(getBreakpointIcon(bp('logpoint'))).toBe('◆');
	});

	it('should return correct icon for function breakpoint', () => {
		expect(getBreakpointIcon(bp('function'))).toBe('ƒ');
	});

	it('should return correct icon for exception breakpoint', () => {
		expect(getBreakpointIcon(bp('exception'))).toBe('⚡');
	});
});

describe('getBreakpointColor', () => {
	function bp(state: BreakpointState, type: BreakpointType = 'line'): Breakpoint {
		return {
			id: 'test',
			filePath: FILE_A,
			line: 0,
			type,
			state,
			hitCount: 0,
			verified: false,
			createdAt: new Date()
		};
	}

	it('should return gray for disabled', () => {
		expect(getBreakpointColor(bp('disabled'))).toBe('#6c6c6c');
	});

	it('should return gray for invalid', () => {
		expect(getBreakpointColor(bp('invalid'))).toBe('#888888');
	});

	it('should return orange for pending', () => {
		expect(getBreakpointColor(bp('pending'))).toBe('#ff8c00');
	});

	it('should return yellow for logpoint', () => {
		expect(getBreakpointColor(bp('enabled', 'logpoint'))).toBe('#f9e64f');
	});

	it('should return red for conditional', () => {
		expect(getBreakpointColor(bp('enabled', 'conditional'))).toBe('#f44747');
	});

	it('should return red for regular enabled breakpoint', () => {
		expect(getBreakpointColor(bp('enabled', 'line'))).toBe('#f44747');
	});
});
