/**
 * Conflict Predictor
 *
 * Real-time conflict prediction for collaborative editing.
 * Detects when multiple users are editing the same semantic region
 * and predicts potential merge conflicts before they happen.
 */

import type { SemanticRegion } from './semantic-analyzer';

/**
 * User awareness state for conflict detection
 */
export interface UserAwareness {
	/** User ID */
	id: string;
	/** User display name */
	name: string;
	/** User color */
	color: string;
	/** Whether this is an AI agent */
	isAI: boolean;
	/** Current cursor line */
	cursorLine: number;
	/** Current cursor column */
	cursorColumn: number;
	/** Last edit timestamp */
	lastEditTime: number;
	/** Lines edited in the last N seconds */
	recentlyEditedLines: number[];
}

/**
 * Conflict zone information
 */
export interface ConflictZone {
	/** Unique zone ID */
	id: string;
	/** Start line of the conflict zone */
	startLine: number;
	/** End line of the conflict zone */
	endLine: number;
	/** Conflict probability (0-1) */
	probability: number;
	/** Severity level */
	severity: 'low' | 'medium' | 'high' | 'critical';
	/** Users involved in the potential conflict */
	participants: Array<{
		userId: string;
		userName: string;
		color: string;
		cursorLine: number;
		lastEditTime: number;
		isAI: boolean;
	}>;
	/** Semantic context of the conflict zone */
	semanticUnit: string;
	/** Suggested action */
	suggestion?: string;
}

/**
 * Conflict prediction configuration
 */
export interface ConflictPredictorConfig {
	/** Time window for recent edits in ms (default: 30000) */
	recentEditWindow: number;
	/** Minimum proximity in lines to consider conflict (default: 10) */
	proximityThreshold: number;
	/** Probability threshold to show warning (default: 0.3) */
	warningThreshold: number;
	/** Enable AI conflict detection (default: true) */
	includeAI: boolean;
}

const DEFAULT_CONFIG: ConflictPredictorConfig = {
	recentEditWindow: 30000,
	proximityThreshold: 10,
	warningThreshold: 0.3,
	includeAI: true
};

/**
 * Conflict Predictor class
 */
export class ConflictPredictor {
	private config: ConflictPredictorConfig;
	private listeners: Set<(zones: ConflictZone[]) => void> = new Set();
	private lastZones: ConflictZone[] = [];

	constructor(config: Partial<ConflictPredictorConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Predict conflict zones based on user awareness and semantic regions
	 */
	predict(users: UserAwareness[], semanticRegions: SemanticRegion[]): ConflictZone[] {
		const zones: ConflictZone[] = [];
		const now = Date.now();

		// Filter to active users (edited recently)
		const activeUsers = users.filter((user) => {
			if (!this.config.includeAI && user.isAI) return false;
			return now - user.lastEditTime < this.config.recentEditWindow;
		});

		// Need at least 2 active users for conflict
		if (activeUsers.length < 2) {
			this.lastZones = [];
			this.notifyListeners([]);
			return [];
		}

		// Check each semantic region for multiple users
		for (const region of semanticRegions) {
			const usersInRegion = activeUsers.filter(
				(user) => user.cursorLine >= region.startLine && user.cursorLine <= region.endLine
			);

			// Also check for users near the region
			const usersNearRegion = activeUsers.filter((user) => {
				const distanceToRegion = Math.min(
					Math.abs(user.cursorLine - region.startLine),
					Math.abs(user.cursorLine - region.endLine)
				);
				return distanceToRegion <= this.config.proximityThreshold && !usersInRegion.includes(user);
			});

			const allRelevantUsers = [...usersInRegion, ...usersNearRegion];

			if (allRelevantUsers.length >= 2) {
				const probability = this.calculateProbability(allRelevantUsers, region, now);

				if (probability >= this.config.warningThreshold) {
					zones.push({
						id: `conflict-${region.startLine}-${region.endLine}`,
						startLine: region.startLine,
						endLine: region.endLine,
						probability,
						severity: this.getSeverity(probability),
						participants: allRelevantUsers.map((user) => ({
							userId: user.id,
							userName: user.name,
							color: user.color,
							cursorLine: user.cursorLine,
							lastEditTime: user.lastEditTime,
							isAI: user.isAI
						})),
						semanticUnit: region.label || `Lines ${region.startLine + 1}-${region.endLine + 1}`,
						suggestion: this.getSuggestion(allRelevantUsers, probability)
					});
				}
			}
		}

		// Also check for proximity-based conflicts outside semantic regions
		const proximityZones = this.detectProximityConflicts(activeUsers, semanticRegions);
		zones.push(...proximityZones);

		// Merge overlapping zones
		const mergedZones = this.mergeOverlappingZones(zones);

		this.lastZones = mergedZones;
		this.notifyListeners(mergedZones);

		return mergedZones;
	}

	/**
	 * Get the last predicted zones
	 */
	getLastZones(): ConflictZone[] {
		return this.lastZones;
	}

	/**
	 * Subscribe to conflict zone changes
	 */
	subscribe(listener: (zones: ConflictZone[]) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Calculate conflict probability
	 */
	private calculateProbability(
		users: UserAwareness[],
		region: SemanticRegion,
		now: number
	): number {
		// Factors:
		// 1. Number of users (more users = higher probability)
		// 2. Cursor proximity (closer = higher probability)
		// 3. Edit recency (more recent = higher probability)
		// 4. Region size (smaller = higher probability due to less space)

		const userCount = users.length;
		const userCountFactor = Math.min(1, (userCount - 1) / 3); // 2 users = 0.33, 3 = 0.66, 4+ = 1

		// Calculate average cursor proximity
		const cursorLines = users.map((u) => u.cursorLine);
		const avgProximity = this.calculateAverageProximity(cursorLines);
		const proximityFactor = Math.max(0, 1 - avgProximity / this.config.proximityThreshold);

		// Calculate edit recency factor
		const recencyFactors = users.map((u) => {
			const timeSinceEdit = now - u.lastEditTime;
			return Math.max(0, 1 - timeSinceEdit / this.config.recentEditWindow);
		});
		const avgRecency = recencyFactors.reduce((a, b) => a + b, 0) / recencyFactors.length;

		// Region size factor (smaller regions are more conflict-prone)
		const regionSize = region.endLine - region.startLine + 1;
		const sizeFactor = Math.min(1, 10 / regionSize);

		// Weighted combination
		const probability =
			userCountFactor * 0.3 + proximityFactor * 0.35 + avgRecency * 0.25 + sizeFactor * 0.1;

		return Math.min(1, Math.max(0, probability));
	}

	/**
	 * Calculate average pairwise proximity between cursor positions
	 */
	private calculateAverageProximity(lines: number[]): number {
		if (lines.length < 2) return Infinity;

		let totalDistance = 0;
		let pairs = 0;

		for (let i = 0; i < lines.length; i++) {
			for (let j = i + 1; j < lines.length; j++) {
				totalDistance += Math.abs(lines[i] - lines[j]);
				pairs++;
			}
		}

		return pairs > 0 ? totalDistance / pairs : Infinity;
	}

	/**
	 * Get severity level from probability
	 */
	private getSeverity(probability: number): ConflictZone['severity'] {
		if (probability >= 0.8) return 'critical';
		if (probability >= 0.6) return 'high';
		if (probability >= 0.4) return 'medium';
		return 'low';
	}

	/**
	 * Get suggestion based on conflict state
	 */
	private getSuggestion(users: UserAwareness[], probability: number): string {
		const userNames = users.map((u) => u.name);
		const aiUsers = users.filter((u) => u.isAI);
		const humanUsers = users.filter((u) => !u.isAI);

		if (probability >= 0.8) {
			if (aiUsers.length > 0 && humanUsers.length > 0) {
				return `AI is editing nearby. Consider pausing AI changes.`;
			}
			return `High conflict risk with ${userNames.join(', ')}. Consider coordinating.`;
		}

		if (probability >= 0.6) {
			return `${userNames.join(' and ')} are editing nearby.`;
		}

		return `Multiple editors in this area.`;
	}

	/**
	 * Detect proximity-based conflicts outside semantic regions
	 */
	private detectProximityConflicts(
		users: UserAwareness[],
		semanticRegions: SemanticRegion[]
	): ConflictZone[] {
		const zones: ConflictZone[] = [];

		// Group users by proximity
		const visited = new Set<string>();

		for (let i = 0; i < users.length; i++) {
			if (visited.has(users[i].id)) continue;

			const cluster: UserAwareness[] = [users[i]];
			visited.add(users[i].id);

			for (let j = i + 1; j < users.length; j++) {
				if (visited.has(users[j].id)) continue;

				const distance = Math.abs(users[i].cursorLine - users[j].cursorLine);
				if (distance <= this.config.proximityThreshold) {
					cluster.push(users[j]);
					visited.add(users[j].id);
				}
			}

			if (cluster.length >= 2) {
				// Check if this cluster is already covered by a semantic region
				const minLine = Math.min(...cluster.map((u) => u.cursorLine));
				const maxLine = Math.max(...cluster.map((u) => u.cursorLine));

				const isInSemanticRegion = semanticRegions.some(
					(r) => minLine >= r.startLine && maxLine <= r.endLine
				);

				if (!isInSemanticRegion) {
					const probability = this.calculateProximityProbability(cluster);

					if (probability >= this.config.warningThreshold) {
						zones.push({
							id: `proximity-${minLine}-${maxLine}`,
							startLine: Math.max(0, minLine - 2),
							endLine: maxLine + 2,
							probability,
							severity: this.getSeverity(probability),
							participants: cluster.map((user) => ({
								userId: user.id,
								userName: user.name,
								color: user.color,
								cursorLine: user.cursorLine,
								lastEditTime: user.lastEditTime,
								isAI: user.isAI
							})),
							semanticUnit: `Lines ${minLine + 1}-${maxLine + 1}`,
							suggestion: this.getSuggestion(cluster, probability)
						});
					}
				}
			}
		}

		return zones;
	}

	/**
	 * Calculate probability for proximity-based conflict
	 */
	private calculateProximityProbability(users: UserAwareness[]): number {
		const now = Date.now();

		// Simpler calculation for proximity conflicts
		const cursorLines = users.map((u) => u.cursorLine);
		const avgProximity = this.calculateAverageProximity(cursorLines);
		const proximityFactor = Math.max(0, 1 - avgProximity / this.config.proximityThreshold);

		const recencyFactors = users.map((u) => {
			const timeSinceEdit = now - u.lastEditTime;
			return Math.max(0, 1 - timeSinceEdit / this.config.recentEditWindow);
		});
		const avgRecency = recencyFactors.reduce((a, b) => a + b, 0) / recencyFactors.length;

		return proximityFactor * 0.6 + avgRecency * 0.4;
	}

	/**
	 * Merge overlapping conflict zones
	 */
	private mergeOverlappingZones(zones: ConflictZone[]): ConflictZone[] {
		if (zones.length <= 1) return zones;

		// Sort by start line
		const sorted = [...zones].sort((a, b) => a.startLine - b.startLine);
		const merged: ConflictZone[] = [];

		let current = sorted[0];

		for (let i = 1; i < sorted.length; i++) {
			const next = sorted[i];

			if (next.startLine <= current.endLine + 1) {
				// Merge overlapping zones
				current = {
					...current,
					id: `${current.id}-${next.id}`,
					endLine: Math.max(current.endLine, next.endLine),
					probability: Math.max(current.probability, next.probability),
					severity: this.getSeverity(Math.max(current.probability, next.probability)),
					participants: this.mergeParticipants(current.participants, next.participants),
					semanticUnit: current.semanticUnit
				};
			} else {
				merged.push(current);
				current = next;
			}
		}

		merged.push(current);
		return merged;
	}

	/**
	 * Merge participant lists, removing duplicates
	 */
	private mergeParticipants(
		a: ConflictZone['participants'],
		b: ConflictZone['participants']
	): ConflictZone['participants'] {
		const seen = new Set<string>();
		const result: ConflictZone['participants'] = [];

		for (const p of [...a, ...b]) {
			if (!seen.has(p.userId)) {
				seen.add(p.userId);
				result.push(p);
			}
		}

		return result;
	}

	/**
	 * Notify listeners of zone changes
	 */
	private notifyListeners(zones: ConflictZone[]): void {
		for (const listener of this.listeners) {
			try {
				listener(zones);
			} catch (e) {
				console.error('[ConflictPredictor] Listener error:', e);
			}
		}
	}
}

/**
 * Create a conflict predictor instance
 */
export function createConflictPredictor(
	config?: Partial<ConflictPredictorConfig>
): ConflictPredictor {
	return new ConflictPredictor(config);
}

// Singleton instance
let globalPredictor: ConflictPredictor | null = null;

/**
 * Get the global conflict predictor
 */
export function getConflictPredictor(): ConflictPredictor {
	if (!globalPredictor) {
		globalPredictor = createConflictPredictor();
	}
	return globalPredictor;
}
