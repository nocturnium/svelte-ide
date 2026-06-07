import { describe, it, expect, beforeEach } from 'vitest';
import * as layout from './layout.svelte';

/**
 * Layout store tests
 *
 * This store is high priority — consumers rely on 18 functions from it.
 * Tests cover all exported getters, toggles, setters, and compound behaviors.
 */

beforeEach(() => {
	layout.resetLayout();
});

// ============================================================================
// Default state
// ============================================================================

describe('layout store — default state', () => {
	it('left sidebar is visible by default', () => {
		expect(layout.getLeftSidebarVisible()).toBe(true);
	});

	it('left sidebar width is 260 by default', () => {
		expect(layout.getLeftSidebarWidth()).toBe(260);
	});

	it('left sidebar active panel is explorer by default', () => {
		expect(layout.getLeftSidebarActivePanel()).toBe('explorer');
	});

	it('right sidebar is hidden by default', () => {
		expect(layout.getRightSidebarVisible()).toBe(false);
	});

	it('right sidebar width is 260 by default', () => {
		expect(layout.getRightSidebarWidth()).toBe(260);
	});

	it('right sidebar active panel is ai by default', () => {
		expect(layout.getRightSidebarActivePanel()).toBe('ai');
	});

	it('bottom panel is hidden by default', () => {
		expect(layout.getBottomPanelVisible()).toBe(false);
	});

	it('bottom panel height is 200 by default', () => {
		expect(layout.getBottomPanelHeight()).toBe(200);
	});

	it('bottom panel active tab is terminal by default', () => {
		expect(layout.getBottomPanelActiveTab()).toBe('terminal');
	});

	it('activity bar is on the left by default', () => {
		expect(layout.getActivityBarPosition()).toBe('left');
	});

	it('status bar is visible by default', () => {
		expect(layout.getStatusBarVisible()).toBe(true);
	});

	it('is not fullscreen by default', () => {
		expect(layout.getIsFullScreen()).toBe(false);
	});

	it('zen mode is off by default', () => {
		expect(layout.getZenMode()).toBe(false);
	});

	it('command palette is closed by default', () => {
		expect(layout.getCommandPaletteOpen()).toBe(false);
	});

	it('search panel is closed by default', () => {
		expect(layout.getSearchPanelOpen()).toBe(false);
	});

	it('settings is closed by default', () => {
		expect(layout.getSettingsOpen()).toBe(false);
	});
});

// ============================================================================
// Left sidebar
// ============================================================================

describe('layout store — left sidebar', () => {
	it('toggleLeftSidebar hides a visible sidebar', () => {
		layout.toggleLeftSidebar();
		expect(layout.getLeftSidebarVisible()).toBe(false);
	});

	it('toggleLeftSidebar shows a hidden sidebar', () => {
		layout.hideLeftSidebar();
		layout.toggleLeftSidebar();
		expect(layout.getLeftSidebarVisible()).toBe(true);
	});

	it('showLeftSidebar makes sidebar visible', () => {
		layout.hideLeftSidebar();
		layout.showLeftSidebar();
		expect(layout.getLeftSidebarVisible()).toBe(true);
	});

	it('hideLeftSidebar hides sidebar', () => {
		layout.hideLeftSidebar();
		expect(layout.getLeftSidebarVisible()).toBe(false);
	});

	it('setLeftSidebarWidth clamps to minimum 180', () => {
		layout.setLeftSidebarWidth(50);
		expect(layout.getLeftSidebarWidth()).toBe(180);
	});

	it('setLeftSidebarWidth clamps to maximum 500', () => {
		layout.setLeftSidebarWidth(999);
		expect(layout.getLeftSidebarWidth()).toBe(500);
	});

	it('setLeftSidebarWidth accepts value in range', () => {
		layout.setLeftSidebarWidth(300);
		expect(layout.getLeftSidebarWidth()).toBe(300);
	});

	it('setLeftSidebarPanel switches panel and shows sidebar', () => {
		layout.hideLeftSidebar();
		layout.setLeftSidebarPanel('search');
		expect(layout.getLeftSidebarActivePanel()).toBe('search');
		expect(layout.getLeftSidebarVisible()).toBe(true);
	});

	it('setLeftSidebarPanel toggles off when clicking same panel while visible', () => {
		layout.setLeftSidebarPanel('explorer'); // same as default, sidebar visible
		expect(layout.getLeftSidebarVisible()).toBe(false);
	});

	it('setLeftSidebarPanel does not toggle off if sidebar was hidden', () => {
		layout.hideLeftSidebar();
		layout.setLeftSidebarPanel('explorer');
		expect(layout.getLeftSidebarVisible()).toBe(true);
		expect(layout.getLeftSidebarActivePanel()).toBe('explorer');
	});
});

// ============================================================================
// Right sidebar
// ============================================================================

describe('layout store — right sidebar', () => {
	it('toggleRightSidebar shows a hidden sidebar', () => {
		layout.toggleRightSidebar();
		expect(layout.getRightSidebarVisible()).toBe(true);
	});

	it('toggleRightSidebar hides a visible sidebar', () => {
		layout.showRightSidebar();
		layout.toggleRightSidebar();
		expect(layout.getRightSidebarVisible()).toBe(false);
	});

	it('showRightSidebar makes sidebar visible', () => {
		layout.showRightSidebar();
		expect(layout.getRightSidebarVisible()).toBe(true);
	});

	it('hideRightSidebar hides sidebar', () => {
		layout.showRightSidebar();
		layout.hideRightSidebar();
		expect(layout.getRightSidebarVisible()).toBe(false);
	});

	it('setRightSidebarWidth clamps to minimum 180', () => {
		layout.setRightSidebarWidth(10);
		expect(layout.getRightSidebarWidth()).toBe(180);
	});

	it('setRightSidebarWidth clamps to maximum 500', () => {
		layout.setRightSidebarWidth(800);
		expect(layout.getRightSidebarWidth()).toBe(500);
	});

	it('setRightSidebarWidth accepts value in range', () => {
		layout.setRightSidebarWidth(400);
		expect(layout.getRightSidebarWidth()).toBe(400);
	});

	it('setRightSidebarPanel switches panel and shows sidebar', () => {
		layout.setRightSidebarPanel('plugins');
		expect(layout.getRightSidebarActivePanel()).toBe('plugins');
		expect(layout.getRightSidebarVisible()).toBe(true);
	});

	it('setRightSidebarPanel toggles off when clicking same panel while visible', () => {
		layout.showRightSidebar();
		layout.setRightSidebarPanel('ai'); // same as default, sidebar visible
		expect(layout.getRightSidebarVisible()).toBe(false);
	});
});

// ============================================================================
// Bottom panel
// ============================================================================

describe('layout store — bottom panel', () => {
	it('toggleBottomPanel shows a hidden panel', () => {
		layout.toggleBottomPanel();
		expect(layout.getBottomPanelVisible()).toBe(true);
	});

	it('toggleBottomPanel hides a visible panel', () => {
		layout.showBottomPanel();
		layout.toggleBottomPanel();
		expect(layout.getBottomPanelVisible()).toBe(false);
	});

	it('showBottomPanel makes panel visible', () => {
		layout.showBottomPanel();
		expect(layout.getBottomPanelVisible()).toBe(true);
	});

	it('hideBottomPanel hides panel', () => {
		layout.showBottomPanel();
		layout.hideBottomPanel();
		expect(layout.getBottomPanelVisible()).toBe(false);
	});

	it('setBottomPanelHeight clamps to minimum 100', () => {
		layout.setBottomPanelHeight(20);
		expect(layout.getBottomPanelHeight()).toBe(100);
	});

	it('setBottomPanelHeight clamps to maximum 500', () => {
		layout.setBottomPanelHeight(999);
		expect(layout.getBottomPanelHeight()).toBe(500);
	});

	it('setBottomPanelHeight accepts value in range', () => {
		layout.setBottomPanelHeight(350);
		expect(layout.getBottomPanelHeight()).toBe(350);
	});

	it('setBottomPanelTab switches tab and shows panel', () => {
		layout.setBottomPanelTab('problems');
		expect(layout.getBottomPanelActiveTab()).toBe('problems');
		expect(layout.getBottomPanelVisible()).toBe(true);
	});

	it('setBottomPanelTab toggles off when clicking same tab while visible', () => {
		layout.showBottomPanel();
		layout.setBottomPanelTab('terminal'); // same as default
		expect(layout.getBottomPanelVisible()).toBe(false);
	});
});

// ============================================================================
// Activity bar, status bar
// ============================================================================

describe('layout store — activity bar and status bar', () => {
	it('toggleActivityBar hides the activity bar', () => {
		layout.toggleActivityBar();
		expect(layout.getActivityBarPosition()).toBe('hidden');
	});

	it('toggleActivityBar restores the activity bar', () => {
		layout.toggleActivityBar();
		layout.toggleActivityBar();
		expect(layout.getActivityBarPosition()).toBe('left');
	});

	it('toggleStatusBar hides the status bar', () => {
		layout.toggleStatusBar();
		expect(layout.getStatusBarVisible()).toBe(false);
	});

	it('toggleStatusBar restores the status bar', () => {
		layout.toggleStatusBar();
		layout.toggleStatusBar();
		expect(layout.getStatusBarVisible()).toBe(true);
	});
});

// ============================================================================
// Zen mode
// ============================================================================

describe('layout store — zen mode', () => {
	it('toggleZenMode enables zen mode', () => {
		layout.toggleZenMode();
		expect(layout.getZenMode()).toBe(true);
	});

	it('zen mode hides left sidebar via getter', () => {
		layout.toggleZenMode();
		// The underlying state is still visible=true, but getLeftSidebarVisible returns false in zen
		expect(layout.getLeftSidebarVisible()).toBe(false);
	});

	it('zen mode hides right sidebar via getter', () => {
		layout.showRightSidebar();
		layout.toggleZenMode();
		expect(layout.getRightSidebarVisible()).toBe(false);
	});

	it('zen mode hides bottom panel via getter', () => {
		layout.showBottomPanel();
		layout.toggleZenMode();
		expect(layout.getBottomPanelVisible()).toBe(false);
	});

	it('zen mode hides status bar via getter', () => {
		layout.toggleZenMode();
		expect(layout.getStatusBarVisible()).toBe(false);
	});

	it('exitZenMode restores visibility', () => {
		layout.toggleZenMode();
		layout.exitZenMode();
		expect(layout.getZenMode()).toBe(false);
		expect(layout.getLeftSidebarVisible()).toBe(true);
		expect(layout.getStatusBarVisible()).toBe(true);
	});
});

// ============================================================================
// Command palette, search panel, settings
// ============================================================================

describe('layout store — command palette', () => {
	it('openCommandPalette opens it', () => {
		layout.openCommandPalette();
		expect(layout.getCommandPaletteOpen()).toBe(true);
	});

	it('closeCommandPalette closes it', () => {
		layout.openCommandPalette();
		layout.closeCommandPalette();
		expect(layout.getCommandPaletteOpen()).toBe(false);
	});

	it('toggleCommandPalette toggles', () => {
		layout.toggleCommandPalette();
		expect(layout.getCommandPaletteOpen()).toBe(true);
		layout.toggleCommandPalette();
		expect(layout.getCommandPaletteOpen()).toBe(false);
	});
});

describe('layout store — search panel', () => {
	it('openSearchPanel opens search and shows left sidebar with search panel', () => {
		layout.hideLeftSidebar();
		layout.openSearchPanel();
		expect(layout.getSearchPanelOpen()).toBe(true);
		expect(layout.getLeftSidebarActivePanel()).toBe('search');
		expect(layout.getLeftSidebarVisible()).toBe(true);
	});

	it('closeSearchPanel closes search', () => {
		layout.openSearchPanel();
		layout.closeSearchPanel();
		expect(layout.getSearchPanelOpen()).toBe(false);
	});

	it('toggleSearchPanel toggles', () => {
		layout.toggleSearchPanel();
		expect(layout.getSearchPanelOpen()).toBe(true);
		layout.toggleSearchPanel();
		expect(layout.getSearchPanelOpen()).toBe(false);
	});
});

describe('layout store — settings', () => {
	it('openSettings opens it', () => {
		layout.openSettings();
		expect(layout.getSettingsOpen()).toBe(true);
	});

	it('closeSettings closes it', () => {
		layout.openSettings();
		layout.closeSettings();
		expect(layout.getSettingsOpen()).toBe(false);
	});

	it('toggleSettings toggles', () => {
		layout.toggleSettings();
		expect(layout.getSettingsOpen()).toBe(true);
		layout.toggleSettings();
		expect(layout.getSettingsOpen()).toBe(false);
	});
});

// ============================================================================
// Focus helpers
// ============================================================================

describe('layout store — focus helpers', () => {
	it('focusAIPanel opens right sidebar with ai panel', () => {
		layout.focusAIPanel();
		expect(layout.getRightSidebarActivePanel()).toBe('ai');
		expect(layout.getRightSidebarVisible()).toBe(true);
	});

	it('focusExplorer opens left sidebar with explorer panel', () => {
		layout.hideLeftSidebar();
		layout.focusExplorer();
		expect(layout.getLeftSidebarActivePanel()).toBe('explorer');
		expect(layout.getLeftSidebarVisible()).toBe(true);
	});

	it('focusTerminal opens bottom panel with terminal tab', () => {
		layout.focusTerminal();
		expect(layout.getBottomPanelActiveTab()).toBe('terminal');
		expect(layout.getBottomPanelVisible()).toBe(true);
	});
});

// ============================================================================
// Editor area style computation
// ============================================================================

describe('layout store — getEditorAreaStyle', () => {
	it('returns correct margins with default layout', () => {
		const style = layout.getEditorAreaStyle();
		// Left = activityBar(48) + leftSidebar(260) = 308
		expect(style.marginLeft).toBe('308px');
		// Right sidebar hidden = 0
		expect(style.marginRight).toBe('0px');
		// Bottom panel hidden, statusBar visible = 24
		expect(style.marginBottom).toBe('24px');
	});

	it('returns zero margins in zen mode', () => {
		layout.toggleZenMode();
		const style = layout.getEditorAreaStyle();
		expect(style.marginLeft).toBe('0px');
		expect(style.marginRight).toBe('0px');
		expect(style.marginBottom).toBe('0px');
	});

	it('accounts for right sidebar when visible', () => {
		layout.showRightSidebar();
		layout.setRightSidebarWidth(300);
		const style = layout.getEditorAreaStyle();
		expect(style.marginRight).toBe('300px');
	});

	it('accounts for bottom panel when visible', () => {
		layout.showBottomPanel();
		layout.setBottomPanelHeight(250);
		const style = layout.getEditorAreaStyle();
		// Bottom panel(250) + statusBar(24) = 274
		expect(style.marginBottom).toBe('274px');
	});

	it('accounts for hidden activity bar', () => {
		layout.toggleActivityBar(); // hide
		const style = layout.getEditorAreaStyle();
		// Only leftSidebar(260), no activity bar
		expect(style.marginLeft).toBe('260px');
	});
});

// ============================================================================
// Constraints export
// ============================================================================

describe('layout store — constraints', () => {
	it('exports expected constraint values', () => {
		expect(layout.constraints.sidebarMinWidth).toBe(180);
		expect(layout.constraints.sidebarMaxWidth).toBe(500);
		expect(layout.constraints.sidebarDefaultWidth).toBe(260);
		expect(layout.constraints.panelMinHeight).toBe(100);
		expect(layout.constraints.panelMaxHeight).toBe(500);
		expect(layout.constraints.panelDefaultHeight).toBe(200);
	});
});

// ============================================================================
// resetLayout
// ============================================================================

describe('layout store — resetLayout', () => {
	it('restores all state to defaults after mutations', () => {
		layout.hideLeftSidebar();
		layout.showRightSidebar();
		layout.showBottomPanel();
		layout.toggleActivityBar();
		layout.toggleStatusBar();
		layout.toggleZenMode();
		layout.setLeftSidebarWidth(400);
		layout.setRightSidebarWidth(400);
		layout.setBottomPanelHeight(400);
		layout.setLeftSidebarPanel('search');
		layout.setRightSidebarPanel('plugins');
		layout.setBottomPanelTab('problems');

		layout.resetLayout();

		expect(layout.getLeftSidebarVisible()).toBe(true);
		expect(layout.getLeftSidebarWidth()).toBe(260);
		expect(layout.getLeftSidebarActivePanel()).toBe('explorer');
		expect(layout.getRightSidebarVisible()).toBe(false);
		expect(layout.getRightSidebarWidth()).toBe(260);
		expect(layout.getRightSidebarActivePanel()).toBe('ai');
		expect(layout.getBottomPanelVisible()).toBe(false);
		expect(layout.getBottomPanelHeight()).toBe(200);
		expect(layout.getBottomPanelActiveTab()).toBe('terminal');
		expect(layout.getActivityBarPosition()).toBe('left');
		expect(layout.getStatusBarVisible()).toBe(true);
		expect(layout.getIsFullScreen()).toBe(false);
		expect(layout.getZenMode()).toBe(false);
	});
});
