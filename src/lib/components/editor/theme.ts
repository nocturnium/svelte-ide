/**
 * Nocturnium theme configuration for the custom editor
 *
 * This module exports theme tokens and CSS variable names used by the editor.
 * The actual styling is applied via CSS variables and token classes.
 */

/**
 * Token color mappings for syntax highlighting
 */
export const tokenColors = {
	// Comments
	comment: 'var(--ide-text-muted)',

	// Strings
	string: 'var(--color-nocturnium-aurora-green)',
	stringTemplate: 'var(--color-nocturnium-aurora-green)',
	stringRegex: 'var(--color-nocturnium-aurora-pink)',
	stringEscape: 'var(--color-nocturnium-aurora-yellow)',

	// Numbers
	number: 'var(--color-nocturnium-aurora-yellow)',

	// Keywords
	keyword: 'var(--color-nocturnium-aurora-purple)',
	keywordControl: 'var(--color-nocturnium-aurora-purple)',
	keywordDefinition: 'var(--color-nocturnium-aurora-purple)',
	keywordModule: 'var(--color-nocturnium-aurora-purple)',

	// Operators
	operator: 'var(--ide-text-primary)',

	// Variables
	variable: 'var(--ide-text-primary)',
	variableDefinition: 'var(--color-nocturnium-wave)',
	variableParameter: 'color-mix(in srgb, var(--color-nocturnium-wave) 80%, var(--ide-text-muted))',

	// Functions
	function: 'var(--color-nocturnium-aurora-blue)',
	functionCall: 'var(--color-nocturnium-aurora-blue)',
	functionDefinition: 'var(--color-nocturnium-aurora-blue)',

	// Properties
	property: 'var(--color-nocturnium-wave)',

	// Types (distinct teal hue so types read differently from numbers/constants)
	type: 'var(--color-nocturnium-teal)',
	typeClass: 'var(--color-nocturnium-teal)',
	typeBuiltin: 'var(--color-nocturnium-teal)',

	// Constants
	constant: 'var(--color-nocturnium-aurora-yellow)',
	constantBoolean: 'var(--color-nocturnium-aurora-yellow)',
	constantNull: 'var(--color-nocturnium-aurora-yellow)',

	// Punctuation
	punctuation: 'var(--ide-text-secondary)',

	// Tags (HTML/XML)
	tag: 'var(--color-nocturnium-aurora-pink)',
	tagAttribute: 'var(--color-nocturnium-aurora-yellow)',
	tagAttributeValue: 'var(--color-nocturnium-aurora-green)',

	// Markup (Markdown)
	markupHeading: 'var(--color-nocturnium-aurora-blue)',
	markupLink: 'var(--color-nocturnium-wave)',
	markupCode: 'var(--color-nocturnium-aurora-green)',
	markupQuote: 'var(--ide-text-secondary)',
	markupList: 'var(--color-nocturnium-ember)',

	// Invalid
	invalid: 'var(--ide-error)'
} as const;

/**
 * Editor UI colors
 */
export const editorColors = {
	// Backgrounds
	background: 'var(--ide-bg-primary)',
	backgroundSecondary: 'var(--ide-bg-secondary)',
	backgroundElevated: 'var(--ide-bg-elevated)',
	backgroundTertiary: 'var(--ide-bg-tertiary)',

	// Text
	text: 'var(--ide-text-primary)',
	textSecondary: 'var(--ide-text-secondary)',
	textMuted: 'var(--ide-text-muted)',

	// Interactive
	cursor: 'var(--ide-interactive)',
	selection: 'var(--ide-bg-tertiary)',
	selectionMatch: 'color-mix(in srgb, var(--ide-interactive) 20%, transparent)',

	// Search
	searchMatch: 'color-mix(in srgb, var(--ide-warning) 30%, transparent)',
	searchMatchSelected: 'color-mix(in srgb, var(--ide-interactive) 30%, transparent)',

	// Brackets
	bracketMatch: 'color-mix(in srgb, var(--ide-interactive) 30%, transparent)',
	bracketMatchOutline: 'var(--ide-interactive)',

	// Gutter
	gutter: 'var(--ide-bg-secondary)',
	gutterBorder: 'var(--ide-border)',
	lineNumber: 'var(--ide-text-muted)',
	lineNumberActive: 'var(--ide-text-secondary)',

	// Active line
	activeLine: 'var(--ide-bg-elevated)',

	// Borders
	border: 'var(--ide-border)'
} as const;

/**
 * Editor theme configuration
 */
export interface EditorTheme {
	name: string;
	isDark: boolean;
	tokenColors: typeof tokenColors;
	editorColors: typeof editorColors;
}

/**
 * Default Nocturnium theme
 */
export const nocturniumTheme: EditorTheme = {
	name: 'nocturnium',
	isDark: true,
	tokenColors,
	editorColors
};

/**
 * Get CSS custom properties for the theme
 */
export function getThemeCSS(theme: EditorTheme = nocturniumTheme): string {
	return `
		/* Token Colors */
		--editor-token-comment: ${theme.tokenColors.comment};
		--editor-token-string: ${theme.tokenColors.string};
		--editor-token-number: ${theme.tokenColors.number};
		--editor-token-keyword: ${theme.tokenColors.keyword};
		--editor-token-operator: ${theme.tokenColors.operator};
		--editor-token-variable: ${theme.tokenColors.variable};
		--editor-token-function: ${theme.tokenColors.function};
		--editor-token-property: ${theme.tokenColors.property};
		--editor-token-type: ${theme.tokenColors.type};
		--editor-token-constant: ${theme.tokenColors.constant};
		--editor-token-punctuation: ${theme.tokenColors.punctuation};
		--editor-token-tag: ${theme.tokenColors.tag};
		--editor-token-invalid: ${theme.tokenColors.invalid};

		/* Editor Colors */
		--editor-bg: ${theme.editorColors.background};
		--editor-bg-secondary: ${theme.editorColors.backgroundSecondary};
		--editor-bg-elevated: ${theme.editorColors.backgroundElevated};
		--editor-text: ${theme.editorColors.text};
		--editor-text-secondary: ${theme.editorColors.textSecondary};
		--editor-text-muted: ${theme.editorColors.textMuted};
		--editor-cursor: ${theme.editorColors.cursor};
		--editor-selection: ${theme.editorColors.selection};
		--editor-gutter: ${theme.editorColors.gutter};
		--editor-gutter-border: ${theme.editorColors.gutterBorder};
		--editor-line-number: ${theme.editorColors.lineNumber};
		--editor-line-number-active: ${theme.editorColors.lineNumberActive};
		--editor-active-line: ${theme.editorColors.activeLine};
		--editor-border: ${theme.editorColors.border};
	`;
}

export default nocturniumTheme;
