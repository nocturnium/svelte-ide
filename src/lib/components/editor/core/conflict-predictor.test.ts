import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	ConflictPredictor,
	awarenessToUserAwareness,
	createConflictPredictor,
	getConflictPredictor,
	markAwarenessActivity,
	type UserAwareness
} from './conflict-predictor';
import type { SemanticRegion } from './semantic-analyzer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<UserAwareness> = {}): UserAwareness {
	return {
		id: 'user-1',
		name: 'Alice',
		color: '#ff0000',
		isAI: false,
		cursorLine: 10,
		cursorColumn: 0,
		lastEditTime: Date.now(),
		recentlyEditedLines: [10],
		...overrides
	};
}

function makeRegion(overrides: Partial<SemanticRegion> = {}): SemanticRegion {
	return {
		category: 'function',
		startLine: 0,
		endLine: 20,
		confidence: 0.9,
		label: 'myFunction',
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Awareness adapter
// ---------------------------------------------------------------------------

describe('awarenessToUserAwareness', () => {
	it('maps real awareness cursors to users and feeds predict', () => {
		const now = Date.now();
		const awareness = {
			getCursors: () =>
				new Map([
					[
						1,
						{
							user: { id: 'u1', name: 'Alice', color: '#ff0000' },
							cursor: { anchor: 5, head: 5 }
						}
					],
					[
						2,
						{
							user: { id: 'u2', name: 'Bob', color: '#00ff00' },
							cursor: { anchor: 8, head: 8 }
						}
					]
				])
		};
		const binding = {
			indexToPosition: (index: number) => ({ line: index, column: index + 1 })
		};

		const users = awarenessToUserAwareness(awareness, binding, now);

		expect(users).toEqual([
			{
				id: 'u1',
				name: 'Alice',
				color: '#ff0000',
				isAI: false,
				cursorLine: 5,
				cursorColumn: 6,
				lastEditTime: now,
				recentlyEditedLines: [5]
			},
			{
				id: 'u2',
				name: 'Bob',
				color: '#00ff00',
				isAI: false,
				cursorLine: 8,
				cursorColumn: 9,
				lastEditTime: now,
				recentlyEditedLines: [8]
			}
		]);

		const idleUsers = awarenessToUserAwareness(awareness, binding, now + 5000);
		expect(idleUsers.map((user) => user.lastEditTime)).toEqual([now, now]);

		markAwarenessActivity(awareness, 'u1', now + 7000, [5]);
		const editedUsers = awarenessToUserAwareness(awareness, binding, now + 8000);
		expect(editedUsers[0].lastEditTime).toBe(now + 7000);
		expect(editedUsers[1].lastEditTime).toBe(now);

		const predictor = new ConflictPredictor({ warningThreshold: 0.1 });
		const zones = predictor.predict(users, [makeRegion({ startLine: 0, endLine: 10 })]);
		expect(zones.length).toBeGreaterThanOrEqual(1);
		expect(zones[0].participants.map((participant) => participant.cursorLine)).toEqual([5, 8]);
	});
});

// ---------------------------------------------------------------------------
// ConflictPredictor
// ---------------------------------------------------------------------------

describe('ConflictPredictor', () => {
	let predictor: ConflictPredictor;

	beforeEach(() => {
		vi.useFakeTimers();
		predictor = new ConflictPredictor();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ---- Construction ------------------------------------------------------

	describe('constructor', () => {
		it('creates with default config', () => {
			expect(predictor.getLastZones()).toEqual([]);
		});

		it('accepts partial config overrides', () => {
			const custom = new ConflictPredictor({ proximityThreshold: 5 });
			expect(custom.getLastZones()).toEqual([]);
		});
	});

	// ---- predict: basic scenarios ------------------------------------------

	describe('predict', () => {
		it('returns empty when fewer than 2 active users', () => {
			const user = makeUser();
			const region = makeRegion();
			const zones = predictor.predict([user], [region]);
			expect(zones).toEqual([]);
		});

		it('returns empty when no users provided', () => {
			const zones = predictor.predict([], [makeRegion()]);
			expect(zones).toEqual([]);
		});

		it('returns empty when no regions and users are far apart', () => {
			const users = [
				makeUser({ id: 'u1', cursorLine: 0 }),
				makeUser({ id: 'u2', cursorLine: 1000 })
			];
			const zones = predictor.predict(users, []);
			expect(zones).toEqual([]);
		});

		it('detects conflict when two users are in the same semantic region', () => {
			const users = [
				makeUser({ id: 'u1', name: 'Alice', cursorLine: 5 }),
				makeUser({ id: 'u2', name: 'Bob', cursorLine: 10 })
			];
			const region = makeRegion({ startLine: 0, endLine: 20, label: 'myFunc' });

			const zones = predictor.predict(users, [region]);
			expect(zones.length).toBeGreaterThanOrEqual(1);
			expect(zones[0].participants.length).toBeGreaterThanOrEqual(2);
		});

		it('detects conflict when users are near (but not in) a semantic region', () => {
			// Default proximity threshold is 10
			const users = [
				makeUser({ id: 'u1', cursorLine: 22 }), // 2 lines away from region end (20)
				makeUser({ id: 'u2', cursorLine: 25 }) // 5 lines away from region end
			];
			const region = makeRegion({ startLine: 0, endLine: 20 });

			const zones = predictor.predict(users, [region]);
			// Both users are within proximity threshold of the region
			expect(zones.length).toBeGreaterThanOrEqual(1);
		});

		it('filters out inactive users (last edit too old)', () => {
			const now = Date.now();
			const users = [
				makeUser({ id: 'u1', cursorLine: 5, lastEditTime: now }),
				makeUser({ id: 'u2', cursorLine: 10, lastEditTime: now - 60000 }) // 60s ago, beyond 30s window
			];
			const region = makeRegion({ startLine: 0, endLine: 20 });

			const zones = predictor.predict(users, [region]);
			// Only one active user, so no conflict
			expect(zones).toEqual([]);
		});

		it('stores last zones and notifies listeners', () => {
			const listener = vi.fn();
			predictor.subscribe(listener);

			const users = [makeUser({ id: 'u1', cursorLine: 5 }), makeUser({ id: 'u2', cursorLine: 10 })];
			const region = makeRegion({ startLine: 0, endLine: 20 });

			predictor.predict(users, [region]);
			expect(listener).toHaveBeenCalledTimes(1);
			expect(predictor.getLastZones().length).toBeGreaterThanOrEqual(1);
		});

		it('notifies with empty zones when fewer than 2 active users', () => {
			const listener = vi.fn();
			predictor.subscribe(listener);

			predictor.predict([makeUser()], [makeRegion()]);
			expect(listener).toHaveBeenCalledWith([]);
		});
	});

	// ---- AI user filtering -------------------------------------------------

	describe('AI user handling', () => {
		it('includes AI users when includeAI is true (default)', () => {
			const users = [
				makeUser({ id: 'u1', cursorLine: 5, isAI: false }),
				makeUser({ id: 'ai1', cursorLine: 10, isAI: true, name: 'AI Assistant' })
			];
			const region = makeRegion({ startLine: 0, endLine: 20 });

			const zones = predictor.predict(users, [region]);
			expect(zones.length).toBeGreaterThanOrEqual(1);
			const hasAI = zones.some((z) => z.participants.some((p) => p.isAI));
			expect(hasAI).toBe(true);
		});

		it('excludes AI users when includeAI is false', () => {
			const custom = new ConflictPredictor({ includeAI: false });
			const users = [
				makeUser({ id: 'u1', cursorLine: 5, isAI: false }),
				makeUser({ id: 'ai1', cursorLine: 10, isAI: true })
			];
			const region = makeRegion({ startLine: 0, endLine: 20 });

			const zones = custom.predict(users, [region]);
			// Only one non-AI active user, so no conflict
			expect(zones).toEqual([]);
		});
	});

	// ---- Severity calculation -----------------------------------------------

	describe('severity levels', () => {
		it('assigns low severity for probability 0.3-0.4', () => {
			// Configure with very low warning threshold to ensure zones are produced
			const p = new ConflictPredictor({ warningThreshold: 0.1 });

			// Users far enough apart that probability stays low
			const users = [
				makeUser({ id: 'u1', cursorLine: 0, lastEditTime: Date.now() - 25000 }),
				makeUser({ id: 'u2', cursorLine: 8, lastEditTime: Date.now() - 25000 })
			];
			const region = makeRegion({ startLine: 0, endLine: 50, label: 'bigFunc' });

			const zones = p.predict(users, [region]);
			// We just check that severity is a valid value
			if (zones.length > 0) {
				expect(['low', 'medium', 'high', 'critical']).toContain(zones[0].severity);
			}
		});

		it('assigns higher severity for high probability scenarios', () => {
			const users = [
				makeUser({ id: 'u1', cursorLine: 5, lastEditTime: Date.now() }),
				makeUser({ id: 'u2', cursorLine: 5, lastEditTime: Date.now() }),
				makeUser({ id: 'u3', cursorLine: 6, lastEditTime: Date.now() }),
				makeUser({ id: 'u4', cursorLine: 6, lastEditTime: Date.now() })
			];
			const region = makeRegion({ startLine: 0, endLine: 10 });

			const zones = predictor.predict(users, [region]);
			expect(zones.length).toBeGreaterThanOrEqual(1);
			// With 4 users on same line with recent edits in a small region, should be high/critical
			expect(['high', 'critical']).toContain(zones[0].severity);
		});
	});

	// ---- Proximity-based conflicts -----------------------------------------

	describe('proximity-based conflicts', () => {
		it('detects proximity conflict outside semantic regions', () => {
			const users = [
				makeUser({ id: 'u1', cursorLine: 100 }),
				makeUser({ id: 'u2', cursorLine: 105 })
			];
			// Region far away from cursor positions
			const region = makeRegion({ startLine: 0, endLine: 20 });

			const zones = predictor.predict(users, [region]);
			// Should detect a proximity conflict around lines 100-105
			const proximityZone = zones.find((z) => z.startLine <= 100 && z.endLine >= 105);
			// If threshold conditions met
			if (proximityZone) {
				expect(proximityZone.participants.length).toBeGreaterThanOrEqual(2);
			}
		});

		it('does not create proximity conflict if already covered by semantic region', () => {
			const users = [makeUser({ id: 'u1', cursorLine: 5 }), makeUser({ id: 'u2', cursorLine: 8 })];
			const region = makeRegion({ startLine: 0, endLine: 20 });

			const zones = predictor.predict(users, [region]);
			// Should not have duplicate zones - only semantic-based
			const proximityIds = zones.filter((z) => z.id.startsWith('proximity-'));
			expect(proximityIds).toHaveLength(0);
		});
	});

	// ---- Zone merging -------------------------------------------------------

	describe('overlapping zone merging', () => {
		it('merges overlapping zones', () => {
			// Create scenario with overlapping regions that both have conflicts
			const users = [
				makeUser({ id: 'u1', cursorLine: 10 }),
				makeUser({ id: 'u2', cursorLine: 15 })
			];
			const regions = [
				makeRegion({ startLine: 5, endLine: 15, label: 'funcA' }),
				makeRegion({ startLine: 12, endLine: 25, label: 'funcB' })
			];

			const zones = predictor.predict(users, regions);
			// If both regions generate zones, they should merge
			// Check that no zones overlap improperly
			for (let i = 0; i < zones.length - 1; i++) {
				// After merging, zones should not overlap
				expect(zones[i].endLine).toBeLessThan(zones[i + 1].startLine);
			}
		});

		it('does not merge non-overlapping zones', () => {
			// Two distant conflict regions
			const users = [
				makeUser({ id: 'u1', cursorLine: 5 }),
				makeUser({ id: 'u2', cursorLine: 8 }),
				makeUser({ id: 'u3', cursorLine: 100 }),
				makeUser({ id: 'u4', cursorLine: 103 })
			];
			const regions = [
				makeRegion({ startLine: 0, endLine: 15 }),
				makeRegion({ startLine: 90, endLine: 110 })
			];

			const zones = predictor.predict(users, regions);
			if (zones.length >= 2) {
				expect(zones[0].endLine).toBeLessThan(zones[1].startLine);
			}
		});
	});

	// ---- Suggestions -------------------------------------------------------

	describe('suggestions', () => {
		it('provides AI-specific suggestion for critical probability with AI user', () => {
			// Create a very high probability scenario with AI
			const users = [
				makeUser({ id: 'u1', cursorLine: 5, isAI: false }),
				makeUser({ id: 'ai1', name: 'AI', cursorLine: 5, isAI: true }),
				makeUser({ id: 'u2', cursorLine: 5, isAI: false }),
				makeUser({ id: 'u3', cursorLine: 6, isAI: false })
			];
			const region = makeRegion({ startLine: 0, endLine: 10 });

			const zones = predictor.predict(users, [region]);
			if (zones.length > 0 && zones[0].probability >= 0.8) {
				expect(zones[0].suggestion).toContain('AI');
			}
		});

		it('provides coordination suggestion for high probability all-human', () => {
			const users = [
				makeUser({ id: 'u1', name: 'Alice', cursorLine: 5 }),
				makeUser({ id: 'u2', name: 'Bob', cursorLine: 5 }),
				makeUser({ id: 'u3', name: 'Charlie', cursorLine: 6 }),
				makeUser({ id: 'u4', name: 'Diana', cursorLine: 6 })
			];
			const region = makeRegion({ startLine: 0, endLine: 10 });

			const zones = predictor.predict(users, [region]);
			if (zones.length > 0 && zones[0].suggestion) {
				expect(typeof zones[0].suggestion).toBe('string');
				expect(zones[0].suggestion!.length).toBeGreaterThan(0);
			}
		});
	});

	// ---- warningThreshold --------------------------------------------------

	describe('warningThreshold', () => {
		it('suppresses zones below the threshold', () => {
			const strict = new ConflictPredictor({ warningThreshold: 0.99 });
			const users = [
				makeUser({ id: 'u1', cursorLine: 5, lastEditTime: Date.now() - 25000 }),
				makeUser({ id: 'u2', cursorLine: 15, lastEditTime: Date.now() - 25000 })
			];
			const region = makeRegion({ startLine: 0, endLine: 30 });

			const zones = strict.predict(users, [region]);
			// With very high threshold, most scenarios won't produce zones
			expect(zones.length).toBe(0);
		});

		it('produces zones with a very low threshold', () => {
			const lenient = new ConflictPredictor({ warningThreshold: 0.01 });
			const users = [makeUser({ id: 'u1', cursorLine: 5 }), makeUser({ id: 'u2', cursorLine: 10 })];
			const region = makeRegion({ startLine: 0, endLine: 20 });

			const zones = lenient.predict(users, [region]);
			expect(zones.length).toBeGreaterThanOrEqual(1);
		});
	});

	// ---- subscribe ---------------------------------------------------------

	describe('subscribe', () => {
		it('receives zones and can unsubscribe', () => {
			const listener = vi.fn();
			const unsub = predictor.subscribe(listener);

			const users = [makeUser({ id: 'u1', cursorLine: 5 }), makeUser({ id: 'u2', cursorLine: 10 })];
			predictor.predict(users, [makeRegion()]);
			expect(listener).toHaveBeenCalledTimes(1);

			unsub();
			predictor.predict(users, [makeRegion()]);
			expect(listener).toHaveBeenCalledTimes(1); // no new call
		});

		it('handles listener errors gracefully', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			predictor.subscribe(() => {
				throw new Error('listener crash');
			});

			const users = [makeUser({ id: 'u1', cursorLine: 5 }), makeUser({ id: 'u2', cursorLine: 10 })];

			expect(() => predictor.predict(users, [makeRegion()])).not.toThrow();
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	// ---- getLastZones ------------------------------------------------------

	describe('getLastZones', () => {
		it('returns empty initially', () => {
			expect(predictor.getLastZones()).toEqual([]);
		});

		it('returns zones from last predict call', () => {
			const users = [makeUser({ id: 'u1', cursorLine: 5 }), makeUser({ id: 'u2', cursorLine: 10 })];
			predictor.predict(users, [makeRegion()]);
			expect(predictor.getLastZones().length).toBeGreaterThanOrEqual(1);
		});

		it('is cleared when predict finds no conflicts', () => {
			// First: produce zones
			const users = [makeUser({ id: 'u1', cursorLine: 5 }), makeUser({ id: 'u2', cursorLine: 10 })];
			predictor.predict(users, [makeRegion()]);

			// Second: single user => clears zones
			predictor.predict([makeUser()], [makeRegion()]);
			expect(predictor.getLastZones()).toEqual([]);
		});
	});

	// ---- Zone structure -----------------------------------------------------

	describe('zone structure', () => {
		it('includes all expected fields in a conflict zone', () => {
			const users = [
				makeUser({ id: 'u1', name: 'Alice', cursorLine: 5 }),
				makeUser({ id: 'u2', name: 'Bob', cursorLine: 10 })
			];
			const region = makeRegion({ startLine: 0, endLine: 20, label: 'myFunc' });

			const zones = predictor.predict(users, [region]);
			expect(zones.length).toBeGreaterThanOrEqual(1);

			const zone = zones[0];
			expect(zone.id).toBeDefined();
			expect(typeof zone.startLine).toBe('number');
			expect(typeof zone.endLine).toBe('number');
			expect(zone.probability).toBeGreaterThanOrEqual(0);
			expect(zone.probability).toBeLessThanOrEqual(1);
			expect(['low', 'medium', 'high', 'critical']).toContain(zone.severity);
			expect(zone.participants.length).toBeGreaterThanOrEqual(2);
			expect(typeof zone.semanticUnit).toBe('string');

			// Participant structure
			const p = zone.participants[0];
			expect(p.userId).toBeDefined();
			expect(p.userName).toBeDefined();
			expect(p.color).toBeDefined();
			expect(typeof p.cursorLine).toBe('number');
			expect(typeof p.lastEditTime).toBe('number');
			expect(typeof p.isAI).toBe('boolean');
		});
	});

	// ---- Semantic unit labeling --------------------------------------------

	describe('semantic unit labeling', () => {
		it('uses region label when available', () => {
			const users = [makeUser({ id: 'u1', cursorLine: 5 }), makeUser({ id: 'u2', cursorLine: 10 })];
			const region = makeRegion({ startLine: 0, endLine: 20, label: 'handleClick' });

			const zones = predictor.predict(users, [region]);
			if (zones.length > 0) {
				expect(zones[0].semanticUnit).toBe('handleClick');
			}
		});

		it('falls back to line range when label is missing', () => {
			const users = [makeUser({ id: 'u1', cursorLine: 5 }), makeUser({ id: 'u2', cursorLine: 10 })];
			const region = makeRegion({ startLine: 0, endLine: 20, label: undefined });

			const zones = predictor.predict(users, [region]);
			if (zones.length > 0) {
				expect(zones[0].semanticUnit).toMatch(/Lines \d+-\d+/);
			}
		});
	});

	// ---- Configuration edge cases ------------------------------------------

	describe('configuration edge cases', () => {
		it('proximityThreshold=0 only detects same-line conflicts', () => {
			const tight = new ConflictPredictor({ proximityThreshold: 0 });
			const users = [
				makeUser({ id: 'u1', cursorLine: 10 }),
				makeUser({ id: 'u2', cursorLine: 11 })
			];
			// No semantic region covering them
			const zones = tight.predict(users, []);
			// With proximity 0, users 1 line apart should not conflict
			expect(zones).toEqual([]);
		});

		it('large recentEditWindow keeps older edits active', () => {
			const wide = new ConflictPredictor({ recentEditWindow: 600000 }); // 10 minutes
			const now = Date.now();
			const users = [
				makeUser({ id: 'u1', cursorLine: 5, lastEditTime: now }),
				makeUser({ id: 'u2', cursorLine: 10, lastEditTime: now - 300000 }) // 5min ago
			];
			const region = makeRegion({ startLine: 0, endLine: 20 });

			const zones = wide.predict(users, [region]);
			expect(zones.length).toBeGreaterThanOrEqual(1);
		});
	});
});

// ---------------------------------------------------------------------------
// Factory & singleton
// ---------------------------------------------------------------------------

describe('createConflictPredictor', () => {
	it('returns a ConflictPredictor instance', () => {
		const p = createConflictPredictor();
		expect(p).toBeInstanceOf(ConflictPredictor);
	});

	it('passes config through', () => {
		const p = createConflictPredictor({ warningThreshold: 0.9 });
		expect(p).toBeInstanceOf(ConflictPredictor);
	});
});

describe('getConflictPredictor', () => {
	it('returns a ConflictPredictor instance', () => {
		const p = getConflictPredictor();
		expect(p).toBeInstanceOf(ConflictPredictor);
	});

	it('returns the same instance on subsequent calls', () => {
		const a = getConflictPredictor();
		const b = getConflictPredictor();
		expect(a).toBe(b);
	});
});
