import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	EchoCursorManager,
	createEchoCursorManager,
	getEchoCursorManager,
	type EchoCursorConfig,
	type EchoCursorEvent,
	type EchoCursor
} from './echo-cursor';
import { createEditorState } from './state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManager(config: Partial<EchoCursorConfig> = {}): EchoCursorManager {
	return new EchoCursorManager(config);
}

function collectEvents(manager: EchoCursorManager): EchoCursorEvent[] {
	const events: EchoCursorEvent[] = [];
	manager.subscribe((e) => events.push(e));
	return events;
}

// ---------------------------------------------------------------------------
// createEchoCursorManager / constructor
// ---------------------------------------------------------------------------
describe('createEchoCursorManager', () => {
	it('should return an EchoCursorManager instance', () => {
		const m = createEchoCursorManager();
		expect(m).toBeInstanceOf(EchoCursorManager);
	});

	it('should accept partial config', () => {
		const m = createEchoCursorManager({ defaultDelay: 500, maxEchoCursors: 3 });
		expect(m).toBeInstanceOf(EchoCursorManager);
	});
});

// ---------------------------------------------------------------------------
// getEchoCursorManager (singleton)
// ---------------------------------------------------------------------------
describe('getEchoCursorManager', () => {
	it('should return the same instance on subsequent calls', () => {
		const a = getEchoCursorManager();
		const b = getEchoCursorManager();
		expect(a).toBe(b);
	});
});

// ---------------------------------------------------------------------------
// Enable / Disable / Toggle
// ---------------------------------------------------------------------------
describe('enable / disable / toggle', () => {
	let manager: EchoCursorManager;

	beforeEach(() => {
		manager = makeManager();
	});

	it('should start disabled', () => {
		expect(manager.isEnabled()).toBe(false);
	});

	it('should enable', () => {
		manager.enable();
		expect(manager.isEnabled()).toBe(true);
	});

	it('should disable', () => {
		manager.enable();
		manager.disable();
		expect(manager.isEnabled()).toBe(false);
	});

	it('should toggle from disabled to enabled', () => {
		const result = manager.toggle();
		expect(result).toBe(true);
		expect(manager.isEnabled()).toBe(true);
	});

	it('should toggle from enabled to disabled', () => {
		manager.enable();
		const result = manager.toggle();
		expect(result).toBe(false);
		expect(manager.isEnabled()).toBe(false);
	});

	it('should emit mode-changed events on enable', () => {
		const events = collectEvents(manager);
		manager.enable();
		expect(events).toEqual([{ type: 'mode-changed', enabled: true }]);
	});

	it('should emit mode-changed events on disable', () => {
		manager.enable();
		const events = collectEvents(manager);
		manager.disable();
		expect(events[events.length - 1]).toMatchObject({ type: 'mode-changed', enabled: false });
	});

	it('should clear all echoes when disabling', () => {
		manager.enable();
		manager.addEchoPoint({ line: 0, column: 0 });
		manager.addEchoPoint({ line: 1, column: 0 });
		expect(manager.getEchoCursors()).toHaveLength(2);

		manager.disable();
		expect(manager.getEchoCursors()).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// addEchoPoint
// ---------------------------------------------------------------------------
describe('addEchoPoint', () => {
	let manager: EchoCursorManager;

	beforeEach(() => {
		manager = makeManager();
		manager.enable();
	});

	afterEach(() => {
		manager.disable();
	});

	it('should add an echo cursor and return it', () => {
		const cursor = manager.addEchoPoint({ line: 5, column: 10 });
		expect(cursor).not.toBeNull();
		expect(cursor!.position).toEqual({ line: 5, column: 10 });
		expect(cursor!.active).toBe(true);
		expect(cursor!.isReplaying).toBe(false);
	});

	it('should return null when echo mode is disabled', () => {
		manager.disable();
		const cursor = manager.addEchoPoint({ line: 0, column: 0 });
		expect(cursor).toBeNull();
	});

	it('should respect maxEchoCursors', () => {
		const m = makeManager({ maxEchoCursors: 2 });
		m.enable();
		expect(m.addEchoPoint({ line: 0, column: 0 })).not.toBeNull();
		expect(m.addEchoPoint({ line: 1, column: 0 })).not.toBeNull();
		expect(m.addEchoPoint({ line: 2, column: 0 })).toBeNull();
	});

	it('should accept custom delay and label', () => {
		const cursor = manager.addEchoPoint({ line: 0, column: 0 }, { delay: 300, label: 'test' });
		expect(cursor!.delayMs).toBe(300);
		expect(cursor!.label).toBe('test');
	});

	it('should use default delay when none is specified', () => {
		const m = makeManager({ defaultDelay: 200 });
		m.enable();
		const cursor = m.addEchoPoint({ line: 0, column: 0 });
		expect(cursor!.delayMs).toBe(200);
	});

	it('should cycle through colors', () => {
		const colors = ['#aaa', '#bbb'];
		const m = makeManager({ maxEchoCursors: 5, colors });
		m.enable();
		const c1 = m.addEchoPoint({ line: 0, column: 0 });
		const c2 = m.addEchoPoint({ line: 1, column: 0 });
		const c3 = m.addEchoPoint({ line: 2, column: 0 });
		expect(c1!.color).toBe('#aaa');
		expect(c2!.color).toBe('#bbb');
		expect(c3!.color).toBe('#aaa'); // wraps
	});

	it('should emit echo-added event', () => {
		const events = collectEvents(manager);
		const cursor = manager.addEchoPoint({ line: 3, column: 7 });
		const addEvent = events.find((e) => e.type === 'echo-added');
		expect(addEvent).toBeDefined();
		expect((addEvent as { type: 'echo-added'; cursor: EchoCursor }).cursor.id).toBe(cursor!.id);
	});

	it('should set replayIndex to current keystroke buffer length', () => {
		manager.recordInsert('a');
		manager.recordInsert('b');
		const cursor = manager.addEchoPoint({ line: 0, column: 0 });
		expect(cursor!.replayIndex).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// removeEcho
// ---------------------------------------------------------------------------
describe('removeEcho', () => {
	let manager: EchoCursorManager;

	beforeEach(() => {
		manager = makeManager();
		manager.enable();
	});

	it('should remove an existing echo and return true', () => {
		const cursor = manager.addEchoPoint({ line: 0, column: 0 })!;
		expect(manager.removeEcho(cursor.id)).toBe(true);
		expect(manager.getEchoCursors()).toHaveLength(0);
	});

	it('should return false for unknown id', () => {
		expect(manager.removeEcho('nonexistent')).toBe(false);
	});

	it('should emit echo-removed event', () => {
		const cursor = manager.addEchoPoint({ line: 0, column: 0 })!;
		const events = collectEvents(manager);
		manager.removeEcho(cursor.id);
		expect(events.find((e) => e.type === 'echo-removed')).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// clearAllEchoes
// ---------------------------------------------------------------------------
describe('clearAllEchoes', () => {
	it('should remove all echoes and clear the keystroke buffer', () => {
		const manager = makeManager();
		manager.enable();
		manager.addEchoPoint({ line: 0, column: 0 });
		manager.addEchoPoint({ line: 1, column: 1 });
		manager.recordInsert('x');

		manager.clearAllEchoes();

		expect(manager.getEchoCursors()).toHaveLength(0);
		expect(manager.getKeystrokeBuffer()).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Keystroke recording
// ---------------------------------------------------------------------------
describe('keystroke recording', () => {
	let manager: EchoCursorManager;

	beforeEach(() => {
		manager = makeManager();
	});

	it('recordInsert should add an insert keystroke to the buffer', () => {
		const ks = manager.recordInsert('hello');
		expect(ks.type).toBe('insert');
		expect(ks.data.text).toBe('hello');
		expect(ks.id).toBeTruthy();
		expect(ks.timestamp).toBeGreaterThan(0);
	});

	it('recordDelete should add a delete keystroke', () => {
		const ks = manager.recordDelete('backward', 3);
		expect(ks.type).toBe('delete');
		expect(ks.data.direction).toBe('backward');
		expect(ks.data.count).toBe(3);
	});

	it('recordDelete should default count to 1', () => {
		const ks = manager.recordDelete('forward');
		expect(ks.data.count).toBe(1);
	});

	it('recordNewline should add a newline keystroke', () => {
		const ks = manager.recordNewline();
		expect(ks.type).toBe('newline');
	});

	it('recordTab should add a tab keystroke', () => {
		const ks = manager.recordTab();
		expect(ks.type).toBe('tab');
	});

	it('should emit keystroke-recorded event', () => {
		const events = collectEvents(manager);
		manager.recordInsert('a');
		expect(events.find((e) => e.type === 'keystroke-recorded')).toBeDefined();
	});

	it('should prune buffer when exceeding maxKeystrokeBuffer', () => {
		const m = makeManager({ maxKeystrokeBuffer: 5 });
		for (let i = 0; i < 8; i++) {
			m.recordInsert(String(i));
		}
		expect(m.getKeystrokeBuffer().length).toBeLessThanOrEqual(5);
	});
});

// ---------------------------------------------------------------------------
// Replay scheduling
// ---------------------------------------------------------------------------
describe('replay scheduling', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('should schedule replay for all echo cursors when recording a keystroke with mode enabled', () => {
		const manager = makeManager({ defaultDelay: 100 });
		manager.enable();
		manager.addEchoPoint({ line: 0, column: 0 });

		const events = collectEvents(manager);
		manager.recordInsert('x');

		// Advance past the delay
		vi.advanceTimersByTime(100);

		const replayStarted = events.filter((e) => e.type === 'replay-started');
		expect(replayStarted).toHaveLength(1);
	});

	it('should emit replay-completed after animation time', () => {
		const manager = makeManager({ defaultDelay: 100 });
		manager.enable();
		manager.addEchoPoint({ line: 0, column: 0 });

		const events = collectEvents(manager);
		manager.recordInsert('y');

		vi.advanceTimersByTime(100); // delay
		vi.advanceTimersByTime(50); // animation

		const completed = events.filter((e) => e.type === 'replay-completed');
		expect(completed).toHaveLength(1);
	});

	it('should not schedule replay for inactive echo cursors', () => {
		const manager = makeManager({ defaultDelay: 50 });
		manager.enable();
		const cursor = manager.addEchoPoint({ line: 0, column: 0 })!;
		cursor.active = false;

		const events = collectEvents(manager);
		manager.recordInsert('z');

		vi.advanceTimersByTime(200);
		expect(events.filter((e) => e.type === 'replay-started')).toHaveLength(0);
	});

	it('should apply real primary inserts into the echo mirror buffer after delay', () => {
		const primary = createEditorState({ content: '' });
		const manager = makeManager({ defaultDelay: 100 });
		manager.attach(primary);
		manager.enable();
		const cursor = manager.addEchoPoint({ line: 0, column: 0 })!;

		primary.insertAt({ line: 0, column: 0 }, 'echo');
		expect(manager.getEchoContent(cursor.id)).toBe('');

		vi.advanceTimersByTime(100);

		expect(manager.getEchoContent(cursor.id)).toBe('echo');
		expect(manager.getEchoCursor(cursor.id)?.position).toEqual({ line: 0, column: 4 });
	});

	it('should apply real delete content into the echo mirror buffer after delay', () => {
		const primary = createEditorState({ content: 'abc' });
		const manager = makeManager({ defaultDelay: 100 });
		manager.attach(primary);
		manager.enable();
		const cursor = manager.addEchoPoint({ line: 0, column: 3 })!;

		primary.setContent('ab');
		vi.advanceTimersByTime(100);

		expect(manager.getEchoContent(cursor.id)).toBe('ab');
		expect(manager.getEchoCursor(cursor.id)?.position).toEqual({ line: 0, column: 2 });
	});

	it('should advance echo position across multi-character newline inserts', () => {
		const primary = createEditorState({ content: '' });
		const manager = makeManager({ defaultDelay: 100 });
		manager.attach(primary);
		manager.enable();
		const cursor = manager.addEchoPoint({ line: 0, column: 0 })!;

		primary.insertAt({ line: 0, column: 0 }, 'foo\nbar');
		vi.advanceTimersByTime(100);

		expect(manager.getEchoContent(cursor.id)).toBe('foo\nbar');
		expect(manager.getEchoCursor(cursor.id)?.position).toEqual({ line: 1, column: 3 });
	});
});

// ---------------------------------------------------------------------------
// getEchoCursors / getEchoCursor
// ---------------------------------------------------------------------------
describe('getEchoCursors / getEchoCursor', () => {
	it('should return empty array when no cursors', () => {
		const m = makeManager();
		expect(m.getEchoCursors()).toEqual([]);
	});

	it('should return all added cursors', () => {
		const m = makeManager();
		m.enable();
		m.addEchoPoint({ line: 0, column: 0 });
		m.addEchoPoint({ line: 1, column: 1 });
		expect(m.getEchoCursors()).toHaveLength(2);
	});

	it('getEchoCursor should return a specific cursor by ID', () => {
		const m = makeManager();
		m.enable();
		const cursor = m.addEchoPoint({ line: 0, column: 0 })!;
		expect(m.getEchoCursor(cursor.id)).toBeDefined();
		expect(m.getEchoCursor(cursor.id)!.id).toBe(cursor.id);
	});

	it('getEchoCursor should return undefined for unknown id', () => {
		const m = makeManager();
		expect(m.getEchoCursor('nope')).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// updateEchoPosition
// ---------------------------------------------------------------------------
describe('updateEchoPosition', () => {
	it('should update the position of a cursor', () => {
		const m = makeManager();
		m.enable();
		const cursor = m.addEchoPoint({ line: 0, column: 0 })!;
		m.updateEchoPosition(cursor.id, { line: 10, column: 5 });
		expect(m.getEchoCursor(cursor.id)!.position).toEqual({ line: 10, column: 5 });
	});

	it('should be a no-op for unknown id', () => {
		const m = makeManager();
		// Should not throw
		m.updateEchoPosition('nonexistent', { line: 0, column: 0 });
	});
});

// ---------------------------------------------------------------------------
// subscribe / unsubscribe
// ---------------------------------------------------------------------------
describe('subscribe', () => {
	it('should call listener on events', () => {
		const m = makeManager();
		const listener = vi.fn();
		m.subscribe(listener);
		m.enable();
		expect(listener).toHaveBeenCalledWith({ type: 'mode-changed', enabled: true });
	});

	it('should return unsubscribe function', () => {
		const m = makeManager();
		const listener = vi.fn();
		const unsub = m.subscribe(listener);
		unsub();
		m.enable();
		expect(listener).not.toHaveBeenCalled();
	});

	it('should not throw if a listener throws', () => {
		const m = makeManager();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		m.subscribe(() => {
			throw new Error('boom');
		});
		expect(() => m.enable()).not.toThrow();
		errorSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// getKeystrokeBuffer
// ---------------------------------------------------------------------------
describe('getKeystrokeBuffer', () => {
	it('should return recorded keystrokes', () => {
		const m = makeManager();
		m.recordInsert('a');
		m.recordNewline();
		expect(m.getKeystrokeBuffer()).toHaveLength(2);
	});
});
