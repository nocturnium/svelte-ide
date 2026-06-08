/**
 * Layout store using Svelte 5 runes
 * Manages IDE panel visibility and sizes
 *
 * Note: Svelte 5 modules cannot directly export $derived values.
 * We use getter functions to expose reactive derived state.
 */

import { browser } from '$app/environment';

interface LayoutState {
	// Sidebar
	leftSidebarVisible: boolean;
	leftSidebarWidth: number;
	leftSidebarActivePanel: string;
	rightSidebarVisible: boolean;
	rightSidebarWidth: number;
	rightSidebarActivePanel: string;

	// Bottom panel
	bottomPanelVisible: boolean;
	bottomPanelHeight: number;
	bottomPanelActiveTab: string;

	// Activity bar
	activityBarPosition: 'left' | 'hidden';

	// Status bar
	statusBarVisible: boolean;

	// Full screen
	isFullScreen: boolean;
	zenMode: boolean;

	// Modal/overlay state
	commandPaletteOpen: boolean;
	searchPanelOpen: boolean;
	settingsOpen: boolean;
}

// Default sizes
const SIDEBAR_DEFAULT_WIDTH = 260;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 500;
const PANEL_DEFAULT_HEIGHT = 200;
const PANEL_MIN_HEIGHT = 100;
const PANEL_MAX_HEIGHT = 500;

// Reactive state
const state = $state<LayoutState>({
	leftSidebarVisible: true,
	leftSidebarWidth: SIDEBAR_DEFAULT_WIDTH,
	leftSidebarActivePanel: 'explorer',
	rightSidebarVisible: false,
	rightSidebarWidth: SIDEBAR_DEFAULT_WIDTH,
	rightSidebarActivePanel: 'ai',
	bottomPanelVisible: false,
	bottomPanelHeight: PANEL_DEFAULT_HEIGHT,
	bottomPanelActiveTab: 'terminal',
	activityBarPosition: 'left',
	statusBarVisible: true,
	isFullScreen: false,
	zenMode: false,
	commandPaletteOpen: false,
	searchPanelOpen: false,
	settingsOpen: false
});

// Getter functions for derived values (Svelte 5 module-safe)
export function getLeftSidebarVisible(): boolean {
	return state.leftSidebarVisible && !state.zenMode;
}

export function getLeftSidebarWidth(): number {
	return state.leftSidebarWidth;
}

export function getLeftSidebarActivePanel(): string {
	return state.leftSidebarActivePanel;
}

export function getRightSidebarVisible(): boolean {
	return state.rightSidebarVisible && !state.zenMode;
}

export function getRightSidebarWidth(): number {
	return state.rightSidebarWidth;
}

export function getRightSidebarActivePanel(): string {
	return state.rightSidebarActivePanel;
}

export function getBottomPanelVisible(): boolean {
	return state.bottomPanelVisible && !state.zenMode;
}

export function getBottomPanelHeight(): number {
	return state.bottomPanelHeight;
}

export function getBottomPanelActiveTab(): string {
	return state.bottomPanelActiveTab;
}

export function getActivityBarPosition(): 'left' | 'hidden' {
	return state.activityBarPosition;
}

export function getStatusBarVisible(): boolean {
	return state.statusBarVisible && !state.zenMode;
}

export function getIsFullScreen(): boolean {
	return state.isFullScreen;
}

export function getZenMode(): boolean {
	return state.zenMode;
}

export function getCommandPaletteOpen(): boolean {
	return state.commandPaletteOpen;
}

export function getSearchPanelOpen(): boolean {
	return state.searchPanelOpen;
}

export function getSettingsOpen(): boolean {
	return state.settingsOpen;
}

// Computed editor area dimensions
export function getEditorAreaStyle(): {
	marginLeft: string;
	marginRight: string;
	marginBottom: string;
} {
	const left = state.leftSidebarVisible && !state.zenMode ? state.leftSidebarWidth : 0;
	const right = state.rightSidebarVisible && !state.zenMode ? state.rightSidebarWidth : 0;
	const bottom = state.bottomPanelVisible && !state.zenMode ? state.bottomPanelHeight : 0;
	const activityBar = state.activityBarPosition === 'left' && !state.zenMode ? 48 : 0;
	const statusBar = state.statusBarVisible && !state.zenMode ? 24 : 0;

	return {
		marginLeft: `${activityBar + left}px`,
		marginRight: `${right}px`,
		marginBottom: `${bottom + statusBar}px`
	};
}

/**
 * Toggle left sidebar visibility
 */
export function toggleLeftSidebar(): void {
	state.leftSidebarVisible = !state.leftSidebarVisible;
}

/**
 * Show left sidebar
 */
export function showLeftSidebar(): void {
	state.leftSidebarVisible = true;
}

/**
 * Hide left sidebar
 */
export function hideLeftSidebar(): void {
	state.leftSidebarVisible = false;
}

/**
 * Set left sidebar width
 */
export function setLeftSidebarWidth(width: number): void {
	state.leftSidebarWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width));
}

/**
 * Set left sidebar active panel
 */
export function setLeftSidebarPanel(panel: string): void {
	if (state.leftSidebarActivePanel === panel && state.leftSidebarVisible) {
		// Toggle off if clicking same panel
		state.leftSidebarVisible = false;
	} else {
		state.leftSidebarActivePanel = panel;
		state.leftSidebarVisible = true;
	}
}

/**
 * Toggle right sidebar visibility
 */
export function toggleRightSidebar(): void {
	state.rightSidebarVisible = !state.rightSidebarVisible;
}

/**
 * Show right sidebar
 */
export function showRightSidebar(): void {
	state.rightSidebarVisible = true;
}

/**
 * Hide right sidebar
 */
export function hideRightSidebar(): void {
	state.rightSidebarVisible = false;
}

/**
 * Set right sidebar width
 */
export function setRightSidebarWidth(width: number): void {
	state.rightSidebarWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width));
}

/**
 * Set right sidebar active panel
 */
export function setRightSidebarPanel(panel: string): void {
	if (state.rightSidebarActivePanel === panel && state.rightSidebarVisible) {
		state.rightSidebarVisible = false;
	} else {
		state.rightSidebarActivePanel = panel;
		state.rightSidebarVisible = true;
	}
}

/**
 * Toggle bottom panel visibility
 */
export function toggleBottomPanel(): void {
	state.bottomPanelVisible = !state.bottomPanelVisible;
}

/**
 * Show bottom panel
 */
export function showBottomPanel(): void {
	state.bottomPanelVisible = true;
}

/**
 * Hide bottom panel
 */
export function hideBottomPanel(): void {
	state.bottomPanelVisible = false;
}

/**
 * Set bottom panel height
 */
export function setBottomPanelHeight(height: number): void {
	state.bottomPanelHeight = Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, height));
}

/**
 * Set bottom panel active tab
 */
export function setBottomPanelTab(tab: string): void {
	if (state.bottomPanelActiveTab === tab && state.bottomPanelVisible) {
		state.bottomPanelVisible = false;
	} else {
		state.bottomPanelActiveTab = tab;
		state.bottomPanelVisible = true;
	}
}

/**
 * Toggle activity bar visibility
 */
export function toggleActivityBar(): void {
	state.activityBarPosition = state.activityBarPosition === 'left' ? 'hidden' : 'left';
}

/**
 * Toggle status bar visibility
 */
export function toggleStatusBar(): void {
	state.statusBarVisible = !state.statusBarVisible;
}

/**
 * Toggle full screen mode
 */
export function toggleFullScreen(): void {
	state.isFullScreen = !state.isFullScreen;

	if (!browser || typeof document === 'undefined') return;

	if (state.isFullScreen) {
		document.documentElement.requestFullscreen?.();
	} else {
		document.exitFullscreen?.();
	}
}

/**
 * Toggle zen mode (distraction-free editing)
 */
export function toggleZenMode(): void {
	state.zenMode = !state.zenMode;
}

/**
 * Exit zen mode
 */
export function exitZenMode(): void {
	state.zenMode = false;
}

/**
 * Open command palette
 */
export function openCommandPalette(): void {
	state.commandPaletteOpen = true;
}

/**
 * Close command palette
 */
export function closeCommandPalette(): void {
	state.commandPaletteOpen = false;
}

/**
 * Toggle command palette
 */
export function toggleCommandPalette(): void {
	state.commandPaletteOpen = !state.commandPaletteOpen;
}

/**
 * Open search panel
 */
export function openSearchPanel(): void {
	state.searchPanelOpen = true;
	state.leftSidebarActivePanel = 'search';
	state.leftSidebarVisible = true;
}

/**
 * Close search panel
 */
export function closeSearchPanel(): void {
	state.searchPanelOpen = false;
}

/**
 * Toggle search panel
 */
export function toggleSearchPanel(): void {
	if (state.searchPanelOpen) {
		closeSearchPanel();
	} else {
		openSearchPanel();
	}
}

/**
 * Open settings
 */
export function openSettings(): void {
	state.settingsOpen = true;
}

/**
 * Close settings
 */
export function closeSettings(): void {
	state.settingsOpen = false;
}

/**
 * Toggle settings
 */
export function toggleSettings(): void {
	state.settingsOpen = !state.settingsOpen;
}

/**
 * Reset layout to defaults
 */
export function resetLayout(): void {
	state.leftSidebarVisible = true;
	state.leftSidebarWidth = SIDEBAR_DEFAULT_WIDTH;
	state.leftSidebarActivePanel = 'explorer';
	state.rightSidebarVisible = false;
	state.rightSidebarWidth = SIDEBAR_DEFAULT_WIDTH;
	state.rightSidebarActivePanel = 'ai';
	state.bottomPanelVisible = false;
	state.bottomPanelHeight = PANEL_DEFAULT_HEIGHT;
	state.bottomPanelActiveTab = 'terminal';
	state.activityBarPosition = 'left';
	state.statusBarVisible = true;
	state.isFullScreen = false;
	state.zenMode = false;
}

/**
 * Focus the AI panel
 */
export function focusAIPanel(): void {
	state.rightSidebarActivePanel = 'ai';
	state.rightSidebarVisible = true;
}

/**
 * Focus the explorer panel
 */
export function focusExplorer(): void {
	state.leftSidebarActivePanel = 'explorer';
	state.leftSidebarVisible = true;
}

/**
 * Focus the terminal
 */
export function focusTerminal(): void {
	state.bottomPanelActiveTab = 'terminal';
	state.bottomPanelVisible = true;
}

/**
 * Get layout constraints
 */
export const constraints = {
	sidebarMinWidth: SIDEBAR_MIN_WIDTH,
	sidebarMaxWidth: SIDEBAR_MAX_WIDTH,
	sidebarDefaultWidth: SIDEBAR_DEFAULT_WIDTH,
	panelMinHeight: PANEL_MIN_HEIGHT,
	panelMaxHeight: PANEL_MAX_HEIGHT,
	panelDefaultHeight: PANEL_DEFAULT_HEIGHT
};
