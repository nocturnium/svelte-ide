/**
 * Editor constants
 *
 * Central location for all magic numbers and configuration values
 * used throughout the custom editor components.
 */

// ==================== Timing ====================

/** Cursor blink interval in milliseconds */
export const CURSOR_BLINK_MS = 530;

/** Debounce delay for onChange callback in milliseconds */
export const ONCHANGE_DEBOUNCE_MS = 50;

/** Time window for grouping consecutive edits in undo history (ms) */
export const HISTORY_GROUP_TIMEOUT_MS = 300;

// ==================== Layout ====================

/** Default character width in pixels (monospace) */
export const DEFAULT_CHAR_WIDTH = 8;

/** Default line height in pixels */
export const DEFAULT_LINE_HEIGHT = 20;

/** Default gutter (line numbers) width in pixels */
export const DEFAULT_GUTTER_WIDTH = 50;

/** Padding between gutter and content area in pixels */
export const CONTENT_PADDING = 8;

/** Right padding inside the gutter for line numbers */
export const GUTTER_PADDING = 24;

/** Line height multiplier for calculating line spacing */
export const LINE_HEIGHT_MULTIPLIER = 1.4;

/** Fallback viewport height for page size calculations */
export const FALLBACK_VIEWPORT_HEIGHT = 400;

// ==================== Typography ====================

/** Default font size in pixels */
export const DEFAULT_FONT_SIZE = 14;

/** Default word wrap column */
export const DEFAULT_WORD_WRAP_COLUMN = 80;

// ==================== History ====================

/** Maximum number of entries in undo/redo stack */
export const MAX_HISTORY_SIZE = 100;
