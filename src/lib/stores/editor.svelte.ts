/**
 * Editor store using Svelte 5 runes
 * Manages tabs, active file, and editor preferences
 *
 * Note: Svelte 5 modules cannot directly export $derived values.
 * We use getter functions to expose reactive derived state.
 */

import { SvelteMap } from 'svelte/reactivity';
import type { EditorTab, EditorPreferences, SplitMode, CursorPosition } from '$types';
import { DEFAULT_EDITOR_PREFERENCES } from '$types';
import { detectLanguage } from '$utils/language';

interface EditorState {
	tabs: EditorTab[];
	activeTabId: string | null;
	splitMode: SplitMode;
	preferences: EditorPreferences;
	recentFiles: string[];
	loading: boolean;
	error: string | null;
}

// Reactive state using $state rune
const state = $state<EditorState>({
	tabs: [],
	activeTabId: null,
	splitMode: 'none',
	preferences: { ...DEFAULT_EDITOR_PREFERENCES },
	recentFiles: [],
	loading: false,
	error: null
});

// Private saved-content baseline used to compute dirty state without changing
// the exported EditorTab shape.
const savedContents = new SvelteMap<string, string>();

function isTabDirty(tab: EditorTab): boolean {
	return tab.content !== (savedContents.get(tab.id) ?? tab.content);
}

// Getter functions for derived values (Svelte 5 module-safe)
export function getTabs(): EditorTab[] {
	return state.tabs;
}

export function getActiveTabId(): string | null {
	return state.activeTabId;
}

export function getActiveTab(): EditorTab | null {
	return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
}

export function getSplitMode(): SplitMode {
	return state.splitMode;
}

export function getPreferences(): EditorPreferences {
	return state.preferences;
}

export function getRecentFiles(): string[] {
	return state.recentFiles;
}

export function getLoading(): boolean {
	return state.loading;
}

export function getError(): string | null {
	return state.error;
}

export function getDirtyTabs(): EditorTab[] {
	return state.tabs.filter((t) => t.isDirty);
}

export function getHasDirtyTabs(): boolean {
	return state.tabs.some((t) => t.isDirty);
}

// Legacy aliases for backward compatibility
export const tabs = {
	get current() {
		return getTabs();
	}
};
export const activeTabId = {
	get current() {
		return getActiveTabId();
	}
};
export const activeTab = {
	get current() {
		return getActiveTab();
	}
};
export const splitMode = {
	get current() {
		return getSplitMode();
	}
};
export const preferences = {
	get current() {
		return getPreferences();
	}
};
export const recentFiles = {
	get current() {
		return getRecentFiles();
	}
};
export const loading = {
	get current() {
		return getLoading();
	}
};
export const error = {
	get current() {
		return getError();
	}
};
export const dirtyTabs = {
	get current() {
		return getDirtyTabs();
	}
};
export const hasDirtyTabs = {
	get current() {
		return getHasDirtyTabs();
	}
};

/**
 * Open a file in a new tab or focus existing tab
 */
export function openFile(
	path: string,
	content: string,
	options?: { language?: string; focus?: boolean }
): string {
	const existing = state.tabs.find((t) => t.path === path);
	if (existing) {
		if (options?.focus !== false) {
			state.activeTabId = existing.id;
		}
		return existing.id;
	}

	const name = path.split('/').pop() ?? path;
	const language = options?.language ?? detectLanguage(name);
	const id = crypto.randomUUID();

	const tab: EditorTab = {
		id,
		path,
		name,
		content,
		language,
		isDirty: false,
		cursorPosition: { line: 1, column: 1 }
	};

	savedContents.set(id, content);
	state.tabs = [...state.tabs, tab];

	if (options?.focus !== false) {
		state.activeTabId = id;
	}

	// Update recent files
	state.recentFiles = [path, ...state.recentFiles.filter((f) => f !== path)].slice(0, 20);

	return id;
}

/**
 * Close a tab by ID
 */
export function closeTab(tabId: string): boolean {
	const index = state.tabs.findIndex((t) => t.id === tabId);
	if (index === -1) return false;

	const tab = state.tabs[index];
	if (isTabDirty(tab)) {
		// Could prompt for save here - returning false indicates unsaved changes
		return false;
	}

	savedContents.delete(tabId);
	state.tabs = state.tabs.filter((t) => t.id !== tabId);

	// Update active tab if we closed the active one
	if (state.activeTabId === tabId) {
		const newIndex = Math.min(index, state.tabs.length - 1);
		state.activeTabId = state.tabs[newIndex]?.id ?? null;
	}

	return true;
}

/**
 * Force close a tab, ignoring dirty state
 */
export function forceCloseTab(tabId: string): void {
	const index = state.tabs.findIndex((t) => t.id === tabId);
	if (index === -1) return;

	savedContents.delete(tabId);
	state.tabs = state.tabs.filter((t) => t.id !== tabId);

	if (state.activeTabId === tabId) {
		const newIndex = Math.min(index, state.tabs.length - 1);
		state.activeTabId = state.tabs[newIndex]?.id ?? null;
	}
}

/**
 * Close all tabs
 */
export function closeAllTabs(force = false): boolean {
	if (!force && state.tabs.some(isTabDirty)) {
		return false;
	}
	savedContents.clear();
	state.tabs = [];
	state.activeTabId = null;
	return true;
}

/**
 * Close other tabs (keep the specified one)
 */
export function closeOtherTabs(keepTabId: string, force = false): boolean {
	if (!force && state.tabs.some((t) => t.id !== keepTabId && isTabDirty(t))) {
		return false;
	}
	for (const tab of state.tabs) {
		if (tab.id !== keepTabId) {
			savedContents.delete(tab.id);
		}
	}
	state.tabs = state.tabs.filter((t) => t.id === keepTabId);
	state.activeTabId = keepTabId;
	return true;
}

/**
 * Set the active tab
 */
export function setActiveTab(tabId: string): void {
	if (state.tabs.some((t) => t.id === tabId)) {
		state.activeTabId = tabId;
	}
}

/**
 * Update content for a tab
 */
export function updateContent(tabId: string, content: string): void {
	state.tabs = state.tabs.map((t) =>
		t.id === tabId
			? { ...t, content, isDirty: content !== (savedContents.get(tabId) ?? t.content) }
			: t
	);
}

/**
 * Mark a tab as saved
 */
export function markSaved(tabId: string, newContent?: string): void {
	state.tabs = state.tabs.map((t) =>
		t.id === tabId
			? (() => {
					const content = newContent ?? t.content;
					savedContents.set(tabId, content);
					return { ...t, isDirty: false, content };
				})()
			: t
	);
}

/**
 * Update cursor position for a tab
 */
export function updateCursor(tabId: string, position: CursorPosition): void {
	state.tabs = state.tabs.map((t) => (t.id === tabId ? { ...t, cursorPosition: position } : t));
}

/**
 * Mark a tab as being edited by AI
 */
export function setAIEditing(tabId: string, editing: boolean): void {
	state.tabs = state.tabs.map((t) => (t.id === tabId ? { ...t, aiEditing: editing } : t));
}

/**
 * Reorder tabs
 */
export function reorderTabs(fromIndex: number, toIndex: number): void {
	const newTabs = [...state.tabs];
	const [removed] = newTabs.splice(fromIndex, 1);
	newTabs.splice(toIndex, 0, removed);
	state.tabs = newTabs;
}

/**
 * Set split mode
 */
export function setSplitMode(mode: SplitMode): void {
	state.splitMode = mode;
}

/**
 * Update editor preferences
 */
export function updatePreferences(updates: Partial<EditorPreferences>): void {
	state.preferences = { ...state.preferences, ...updates };
}

/**
 * Reset preferences to defaults
 */
export function resetPreferences(): void {
	state.preferences = { ...DEFAULT_EDITOR_PREFERENCES };
}

/**
 * Get a tab by ID
 */
export function getTab(tabId: string): EditorTab | undefined {
	return state.tabs.find((t) => t.id === tabId);
}

/**
 * Get a tab by path
 */
export function getTabByPath(path: string): EditorTab | undefined {
	return state.tabs.find((t) => t.path === path);
}

/**
 * Navigate to next tab
 */
export function nextTab(): void {
	if (state.tabs.length === 0) return;
	const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
	const nextIndex = (currentIndex + 1) % state.tabs.length;
	state.activeTabId = state.tabs[nextIndex].id;
}

/**
 * Navigate to previous tab
 */
export function prevTab(): void {
	if (state.tabs.length === 0) return;
	const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
	const prevIndex = (currentIndex - 1 + state.tabs.length) % state.tabs.length;
	state.activeTabId = state.tabs[prevIndex].id;
}

/**
 * Set loading state
 */
export function setLoading(loadingState: boolean): void {
	state.loading = loadingState;
}

/**
 * Set error state
 */
export function setError(errorState: string | null): void {
	state.error = errorState;
}
