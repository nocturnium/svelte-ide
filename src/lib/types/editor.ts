/**
 * Editor-related type definitions
 */

export interface EditorTab {
	id: string;
	path: string;
	name: string;
	content: string;
	language: string;
	isDirty: boolean;
	cursorPosition?: CursorPosition;
	scrollPosition?: ScrollPosition;
	/** Indicates if this tab is being edited by AI */
	aiEditing?: boolean;
	/** Version for CRDT conflict resolution */
	version?: number;
}

export interface CursorPosition {
	line: number;
	column: number;
}

export interface ScrollPosition {
	top: number;
	left: number;
}

export interface EditorPreferences {
	fontSize: number;
	fontFamily: string;
	tabSize: number;
	insertSpaces: boolean;
	wordWrap: 'off' | 'on' | 'wordWrapColumn';
	wordWrapColumn: number;
	lineNumbers: 'on' | 'off' | 'relative';
	minimap: boolean;
	bracketMatching: boolean;
	autoCloseBrackets: boolean;
	highlightActiveLine: boolean;
	renderWhitespace: 'none' | 'boundary' | 'all';
	theme: string;
}

export type SplitMode = 'none' | 'horizontal' | 'vertical';

export interface EditorSelection {
	anchor: CursorPosition;
	head: CursorPosition;
}

export interface EditorViewState {
	cursorPosition: CursorPosition;
	scrollPosition: ScrollPosition;
	selections: EditorSelection[];
	foldedRanges: number[];
}

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
	fontSize: 14,
	fontFamily: 'JetBrains Mono',
	tabSize: 2,
	insertSpaces: false,
	wordWrap: 'off',
	wordWrapColumn: 80,
	lineNumbers: 'on',
	minimap: false,
	bracketMatching: true,
	autoCloseBrackets: true,
	highlightActiveLine: true,
	renderWhitespace: 'none',
	theme: 'nocturnium'
};
