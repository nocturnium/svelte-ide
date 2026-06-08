import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as editor from './editor.svelte';

/**
 * Editor store tests
 *
 * Covers tab management, active tab navigation, content mutation,
 * cursor updates, split mode, preferences, and loading/error state.
 */

// Mock crypto.randomUUID for deterministic IDs
let uuidCounter = 0;
vi.stubGlobal('crypto', {
	randomUUID: () => `uuid-${++uuidCounter}`
});

beforeEach(() => {
	uuidCounter = 0;
	// Force close all tabs to reset state between tests
	editor.closeAllTabs(true);
	editor.setLoading(false);
	editor.setError(null);
	editor.resetPreferences();
});

// ============================================================================
// Default state
// ============================================================================

describe('editor store — default state', () => {
	it('has no tabs initially', () => {
		expect(editor.getTabs()).toEqual([]);
	});

	it('has no active tab', () => {
		expect(editor.getActiveTabId()).toBe(null);
		expect(editor.getActiveTab()).toBe(null);
	});

	it('split mode is none by default', () => {
		expect(editor.getSplitMode()).toBe('none');
	});

	it('loading is false by default', () => {
		expect(editor.getLoading()).toBe(false);
	});

	it('error is null by default', () => {
		expect(editor.getError()).toBe(null);
	});

	it('has no dirty tabs', () => {
		expect(editor.getDirtyTabs()).toEqual([]);
		expect(editor.getHasDirtyTabs()).toBe(false);
	});
});

// ============================================================================
// openFile
// ============================================================================

describe('editor store — openFile', () => {
	it('opens a file and returns a tab id', () => {
		const id = editor.openFile('/src/main.ts', 'console.log("hello")');
		expect(id).toBe('uuid-1');
		expect(editor.getTabs()).toHaveLength(1);
	});

	it('sets the new tab as active by default', () => {
		const id = editor.openFile('/src/main.ts', 'code');
		expect(editor.getActiveTabId()).toBe(id);
		expect(editor.getActiveTab()?.path).toBe('/src/main.ts');
	});

	it('extracts filename from path', () => {
		editor.openFile('/src/lib/utils/helpers.ts', '');
		expect(editor.getActiveTab()?.name).toBe('helpers.ts');
	});

	it('detects language from filename', () => {
		editor.openFile('/src/app.ts', '');
		expect(editor.getActiveTab()?.language).toBe('typescript');
	});

	it('allows overriding language', () => {
		editor.openFile('/src/app.txt', '', { language: 'markdown' });
		expect(editor.getActiveTab()?.language).toBe('markdown');
	});

	it('returns existing tab id if path already open', () => {
		const id1 = editor.openFile('/src/a.ts', 'code1');
		const id2 = editor.openFile('/src/a.ts', 'code2');
		expect(id1).toBe(id2);
		expect(editor.getTabs()).toHaveLength(1);
	});

	it('focuses existing tab when re-opened', () => {
		editor.openFile('/src/a.ts', 'a');
		editor.openFile('/src/b.ts', 'b');
		expect(editor.getActiveTab()?.path).toBe('/src/b.ts');

		editor.openFile('/src/a.ts', 'a');
		expect(editor.getActiveTab()?.path).toBe('/src/a.ts');
	});

	it('does not focus when focus=false', () => {
		const id1 = editor.openFile('/src/a.ts', 'a');
		editor.openFile('/src/b.ts', 'b', { focus: false });
		expect(editor.getActiveTabId()).toBe(id1);
	});

	it('tracks recent files', () => {
		editor.openFile('/src/a.ts', 'a');
		editor.openFile('/src/b.ts', 'b');
		const recent = editor.getRecentFiles();
		expect(recent[0]).toBe('/src/b.ts');
		expect(recent[1]).toBe('/src/a.ts');
	});

	it('starts with isDirty = false', () => {
		editor.openFile('/src/a.ts', 'code');
		expect(editor.getActiveTab()?.isDirty).toBe(false);
	});
});

// ============================================================================
// closeTab
// ============================================================================

describe('editor store — closeTab', () => {
	it('closes a clean tab', () => {
		const id = editor.openFile('/src/a.ts', 'a');
		const result = editor.closeTab(id);
		expect(result).toBe(true);
		expect(editor.getTabs()).toHaveLength(0);
	});

	it('refuses to close a dirty tab', () => {
		const id = editor.openFile('/src/a.ts', 'a');
		editor.updateContent(id, 'modified');
		const result = editor.closeTab(id);
		expect(result).toBe(false);
		expect(editor.getTabs()).toHaveLength(1);
	});

	it('returns false for nonexistent tab id', () => {
		expect(editor.closeTab('nonexistent')).toBe(false);
	});

	it('updates active tab to adjacent tab after close', () => {
		editor.openFile('/src/a.ts', 'a');
		const id2 = editor.openFile('/src/b.ts', 'b');
		editor.openFile('/src/c.ts', 'c');
		editor.setActiveTab(id2);

		editor.closeTab(id2);
		// Should select next tab (c) or previous (a)
		expect(editor.getActiveTab()).not.toBe(null);
	});

	it('sets active to null when last tab is closed', () => {
		const id = editor.openFile('/src/a.ts', 'a');
		editor.closeTab(id);
		expect(editor.getActiveTabId()).toBe(null);
	});
});

// ============================================================================
// forceCloseTab
// ============================================================================

describe('editor store — forceCloseTab', () => {
	it('force closes even dirty tabs', () => {
		const id = editor.openFile('/src/a.ts', 'a');
		editor.updateContent(id, 'modified');
		editor.forceCloseTab(id);
		expect(editor.getTabs()).toHaveLength(0);
	});

	it('does nothing for nonexistent tab', () => {
		editor.openFile('/src/a.ts', 'a');
		editor.forceCloseTab('nonexistent');
		expect(editor.getTabs()).toHaveLength(1);
	});
});

// ============================================================================
// closeAllTabs, closeOtherTabs
// ============================================================================

describe('editor store — closeAllTabs', () => {
	it('closes all clean tabs', () => {
		editor.openFile('/src/a.ts', 'a');
		editor.openFile('/src/b.ts', 'b');
		const result = editor.closeAllTabs();
		expect(result).toBe(true);
		expect(editor.getTabs()).toHaveLength(0);
	});

	it('refuses if any tab is dirty and force=false', () => {
		const id = editor.openFile('/src/a.ts', 'a');
		editor.openFile('/src/b.ts', 'b');
		editor.updateContent(id, 'dirty');
		expect(editor.closeAllTabs()).toBe(false);
		expect(editor.getTabs()).toHaveLength(2);
	});

	it('force closes all tabs even with dirty ones', () => {
		const id = editor.openFile('/src/a.ts', 'a');
		editor.updateContent(id, 'dirty');
		expect(editor.closeAllTabs(true)).toBe(true);
		expect(editor.getTabs()).toHaveLength(0);
	});
});

describe('editor store — closeOtherTabs', () => {
	it('closes all tabs except the specified one', () => {
		editor.openFile('/src/a.ts', 'a');
		const id2 = editor.openFile('/src/b.ts', 'b');
		editor.openFile('/src/c.ts', 'c');
		const result = editor.closeOtherTabs(id2);
		expect(result).toBe(true);
		expect(editor.getTabs()).toHaveLength(1);
		expect(editor.getActiveTabId()).toBe(id2);
	});

	it('refuses if other tabs are dirty and force=false', () => {
		const id1 = editor.openFile('/src/a.ts', 'a');
		const id2 = editor.openFile('/src/b.ts', 'b');
		editor.updateContent(id1, 'dirty');
		expect(editor.closeOtherTabs(id2)).toBe(false);
	});

	it('force closes other dirty tabs', () => {
		const id1 = editor.openFile('/src/a.ts', 'a');
		const id2 = editor.openFile('/src/b.ts', 'b');
		editor.updateContent(id1, 'dirty');
		expect(editor.closeOtherTabs(id2, true)).toBe(true);
		expect(editor.getTabs()).toHaveLength(1);
	});
});

// ============================================================================
// setActiveTab
// ============================================================================

describe('editor store — setActiveTab', () => {
	it('switches to a valid tab', () => {
		const id1 = editor.openFile('/src/a.ts', 'a');
		editor.openFile('/src/b.ts', 'b');
		editor.setActiveTab(id1);
		expect(editor.getActiveTabId()).toBe(id1);
	});

	it('does nothing for invalid tab id', () => {
		const id = editor.openFile('/src/a.ts', 'a');
		editor.setActiveTab('invalid');
		expect(editor.getActiveTabId()).toBe(id);
	});
});

// ============================================================================
// Content and dirty tracking
// ============================================================================

describe('editor store — content management', () => {
	it('updateContent marks tab as dirty', () => {
		const id = editor.openFile('/src/a.ts', 'original');
		editor.updateContent(id, 'modified');
		expect(editor.getTab(id)?.isDirty).toBe(true);
		expect(editor.getHasDirtyTabs()).toBe(true);
	});

	it('updateContent clears dirty when content returns to saved value and closeTab succeeds', () => {
		const id = editor.openFile('/src/a.ts', 'original');
		editor.updateContent(id, 'modified');
		expect(editor.getTab(id)?.isDirty).toBe(true);

		editor.updateContent(id, 'original');

		expect(editor.getTab(id)?.isDirty).toBe(false);
		expect(editor.getHasDirtyTabs()).toBe(false);
		expect(editor.closeTab(id)).toBe(true);
		expect(editor.getTab(id)).toBeUndefined();
	});

	it('markSaved clears dirty state', () => {
		const id = editor.openFile('/src/a.ts', 'original');
		editor.updateContent(id, 'modified');
		editor.markSaved(id);
		expect(editor.getTab(id)?.isDirty).toBe(false);
	});

	it('markSaved can update content', () => {
		const id = editor.openFile('/src/a.ts', 'original');
		editor.markSaved(id, 'saved-content');
		expect(editor.getTab(id)?.content).toBe('saved-content');
	});

	it('getDirtyTabs returns only dirty tabs', () => {
		const id1 = editor.openFile('/src/a.ts', 'a');
		editor.openFile('/src/b.ts', 'b');
		editor.updateContent(id1, 'dirty');
		const dirty = editor.getDirtyTabs();
		expect(dirty).toHaveLength(1);
		expect(dirty[0].id).toBe(id1);
	});
});

// ============================================================================
// Cursor updates
// ============================================================================

describe('editor store — cursor updates', () => {
	it('updateCursor changes cursor position', () => {
		const id = editor.openFile('/src/a.ts', 'code');
		editor.updateCursor(id, { line: 5, column: 10 });
		expect(editor.getTab(id)?.cursorPosition).toEqual({ line: 5, column: 10 });
	});
});

// ============================================================================
// AI editing
// ============================================================================

describe('editor store — AI editing', () => {
	it('setAIEditing marks a tab as being AI-edited', () => {
		const id = editor.openFile('/src/a.ts', 'code');
		editor.setAIEditing(id, true);
		expect(editor.getTab(id)?.aiEditing).toBe(true);
	});

	it('setAIEditing can clear AI editing state', () => {
		const id = editor.openFile('/src/a.ts', 'code');
		editor.setAIEditing(id, true);
		editor.setAIEditing(id, false);
		expect(editor.getTab(id)?.aiEditing).toBe(false);
	});
});

// ============================================================================
// Tab reordering
// ============================================================================

describe('editor store — reorderTabs', () => {
	it('moves a tab from one position to another', () => {
		editor.openFile('/src/a.ts', 'a');
		editor.openFile('/src/b.ts', 'b');
		editor.openFile('/src/c.ts', 'c');

		editor.reorderTabs(0, 2);
		const tabs = editor.getTabs();
		expect(tabs[0].path).toBe('/src/b.ts');
		expect(tabs[1].path).toBe('/src/c.ts');
		expect(tabs[2].path).toBe('/src/a.ts');
	});
});

// ============================================================================
// Split mode
// ============================================================================

describe('editor store — split mode', () => {
	it('setSplitMode changes mode', () => {
		editor.setSplitMode('horizontal');
		expect(editor.getSplitMode()).toBe('horizontal');
	});

	it('supports all split modes', () => {
		for (const mode of ['none', 'horizontal', 'vertical'] as const) {
			editor.setSplitMode(mode);
			expect(editor.getSplitMode()).toBe(mode);
		}
	});
});

// ============================================================================
// Preferences
// ============================================================================

describe('editor store — preferences', () => {
	it('updatePreferences merges updates', () => {
		editor.updatePreferences({ fontSize: 18, tabSize: 4 });
		const prefs = editor.getPreferences();
		expect(prefs.fontSize).toBe(18);
		expect(prefs.tabSize).toBe(4);
		// Other preferences unchanged
		expect(prefs.wordWrap).toBe('off');
	});

	it('resetPreferences restores defaults', () => {
		editor.updatePreferences({ fontSize: 24 });
		editor.resetPreferences();
		expect(editor.getPreferences().fontSize).toBe(14);
	});
});

// ============================================================================
// Tab lookup
// ============================================================================

describe('editor store — tab lookup', () => {
	it('getTab returns tab by id', () => {
		const id = editor.openFile('/src/a.ts', 'code');
		expect(editor.getTab(id)?.path).toBe('/src/a.ts');
	});

	it('getTab returns undefined for unknown id', () => {
		expect(editor.getTab('nope')).toBeUndefined();
	});

	it('getTabByPath returns tab by path', () => {
		editor.openFile('/src/a.ts', 'code');
		expect(editor.getTabByPath('/src/a.ts')?.name).toBe('a.ts');
	});

	it('getTabByPath returns undefined for unknown path', () => {
		expect(editor.getTabByPath('/nope')).toBeUndefined();
	});
});

// ============================================================================
// Tab navigation
// ============================================================================

describe('editor store — tab navigation', () => {
	it('nextTab cycles forward', () => {
		const id1 = editor.openFile('/src/a.ts', 'a');
		const id2 = editor.openFile('/src/b.ts', 'b');
		const id3 = editor.openFile('/src/c.ts', 'c');

		editor.setActiveTab(id1);
		editor.nextTab();
		expect(editor.getActiveTabId()).toBe(id2);
		editor.nextTab();
		expect(editor.getActiveTabId()).toBe(id3);
		editor.nextTab(); // wraps around
		expect(editor.getActiveTabId()).toBe(id1);
	});

	it('prevTab cycles backward', () => {
		const id1 = editor.openFile('/src/a.ts', 'a');
		editor.openFile('/src/b.ts', 'b');
		const id3 = editor.openFile('/src/c.ts', 'c');

		editor.setActiveTab(id1);
		editor.prevTab(); // wraps around
		expect(editor.getActiveTabId()).toBe(id3);
	});

	it('nextTab does nothing with no tabs', () => {
		editor.nextTab();
		expect(editor.getActiveTabId()).toBe(null);
	});

	it('prevTab does nothing with no tabs', () => {
		editor.prevTab();
		expect(editor.getActiveTabId()).toBe(null);
	});
});

// ============================================================================
// Loading and error
// ============================================================================

describe('editor store — loading and error', () => {
	it('setLoading updates state', () => {
		editor.setLoading(true);
		expect(editor.getLoading()).toBe(true);
	});

	it('setError updates state', () => {
		editor.setError('something broke');
		expect(editor.getError()).toBe('something broke');
	});

	it('setError clears with null', () => {
		editor.setError('err');
		editor.setError(null);
		expect(editor.getError()).toBe(null);
	});
});
