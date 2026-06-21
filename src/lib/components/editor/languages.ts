/**
 * Language support for the custom editor
 *
 * This module provides language detection and configuration
 * using the custom tokenizer system (no CodeMirror dependency).
 */

import {
	resolveLanguage,
	isLanguageSupported as tokenizerSupported,
	getSupportedLanguages as getTokenizerLanguages
} from './tokenizer';

/**
 * Language configuration
 */
export interface LanguageConfig {
	/** Language identifier */
	id: string;
	/** Display name */
	name: string;
	/** File extensions (without dot) */
	extensions: string[];
	/** MIME types */
	mimeTypes: string[];
	/** Line comment prefix */
	lineComment?: string;
	/** Block comment delimiters */
	blockComment?: [string, string];
	/** Auto-closing pairs */
	autoClosingPairs?: Array<[string, string]>;
	/** Surrounding pairs */
	surroundingPairs?: Array<[string, string]>;
	/** Word pattern regex */
	wordPattern?: RegExp;
}

/**
 * Language configurations
 */
const languages: Record<string, LanguageConfig> = {
	javascript: {
		id: 'javascript',
		name: 'JavaScript',
		extensions: ['js', 'mjs', 'cjs'],
		mimeTypes: ['text/javascript', 'application/javascript'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['`', '`']
		],
		surroundingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['`', '`']
		],
		wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",./<>?\s]+)/g
	},
	typescript: {
		id: 'typescript',
		name: 'TypeScript',
		extensions: ['ts', 'mts', 'cts'],
		mimeTypes: ['text/typescript', 'application/typescript'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['`', '`'],
			['<', '>']
		],
		surroundingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['`', '`'],
			['<', '>']
		]
	},
	jsx: {
		id: 'jsx',
		name: 'JavaScript React',
		extensions: ['jsx'],
		mimeTypes: ['text/jsx'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['`', '`'],
			['<', '>']
		]
	},
	tsx: {
		id: 'tsx',
		name: 'TypeScript React',
		extensions: ['tsx'],
		mimeTypes: ['text/tsx'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['`', '`'],
			['<', '>']
		]
	},
	html: {
		id: 'html',
		name: 'HTML',
		extensions: ['html', 'htm', 'xhtml'],
		mimeTypes: ['text/html'],
		blockComment: ['<!--', '-->'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['<', '>']
		]
	},
	css: {
		id: 'css',
		name: 'CSS',
		extensions: ['css'],
		mimeTypes: ['text/css'],
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	json: {
		id: 'json',
		name: 'JSON',
		extensions: ['json', 'jsonc', 'json5'],
		mimeTypes: ['application/json'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['"', '"']
		]
	},
	python: {
		id: 'python',
		name: 'Python',
		extensions: ['py', 'pyw', 'pyi'],
		mimeTypes: ['text/x-python'],
		lineComment: '#',
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	go: {
		id: 'go',
		name: 'Go',
		extensions: ['go'],
		mimeTypes: ['text/x-go'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['`', '`']
		]
	},
	markdown: {
		id: 'markdown',
		name: 'Markdown',
		extensions: ['md', 'markdown', 'mdown', 'mkd'],
		mimeTypes: ['text/markdown'],
		autoClosingPairs: [
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['`', '`'],
			['*', '*'],
			['_', '_']
		]
	},
	xml: {
		id: 'xml',
		name: 'XML',
		extensions: ['xml', 'xsl', 'xslt', 'svg', 'rss', 'atom'],
		mimeTypes: ['text/xml', 'application/xml'],
		blockComment: ['<!--', '-->'],
		autoClosingPairs: [
			['"', '"'],
			["'", "'"],
			['<', '>']
		]
	},
	yaml: {
		id: 'yaml',
		name: 'YAML',
		extensions: ['yaml', 'yml'],
		mimeTypes: ['text/yaml'],
		lineComment: '#',
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	rust: {
		id: 'rust',
		name: 'Rust',
		extensions: ['rs'],
		mimeTypes: ['text/x-rust'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"']
		]
	},
	java: {
		id: 'java',
		name: 'Java',
		extensions: ['java'],
		mimeTypes: ['text/x-java'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	cpp: {
		id: 'cpp',
		name: 'C++',
		extensions: ['c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx'],
		mimeTypes: ['text/x-c++src', 'text/x-csrc'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	csharp: {
		id: 'csharp',
		name: 'C#',
		extensions: ['cs'],
		mimeTypes: ['text/x-csharp'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	kotlin: {
		id: 'kotlin',
		name: 'Kotlin',
		extensions: ['kt', 'kts'],
		mimeTypes: ['text/x-kotlin'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	scala: {
		id: 'scala',
		name: 'Scala',
		extensions: ['scala', 'sc'],
		mimeTypes: ['text/x-scala'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	swift: {
		id: 'swift',
		name: 'Swift',
		extensions: ['swift'],
		mimeTypes: ['text/x-swift'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"']
		]
	},
	ruby: {
		id: 'ruby',
		name: 'Ruby',
		extensions: ['rb'],
		mimeTypes: ['text/x-ruby'],
		lineComment: '#',
		blockComment: ['=begin', '=end'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	php: {
		id: 'php',
		name: 'PHP',
		extensions: ['php', 'phtml'],
		mimeTypes: ['application/x-httpd-php', 'text/x-php'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	groovy: {
		id: 'groovy',
		name: 'Groovy',
		extensions: ['groovy', 'gradle'],
		mimeTypes: ['text/x-groovy'],
		lineComment: '//',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	shell: {
		id: 'shell',
		name: 'Shell',
		extensions: ['sh', 'bash', 'zsh', 'fish', 'ksh'],
		mimeTypes: ['text/x-sh', 'application/x-sh'],
		lineComment: '#',
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	powershell: {
		id: 'powershell',
		name: 'PowerShell',
		extensions: ['ps1', 'psm1', 'psd1'],
		mimeTypes: ['application/x-powershell'],
		lineComment: '#',
		blockComment: ['<#', '#>'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	sql: {
		id: 'sql',
		name: 'SQL',
		extensions: ['sql', 'psql', 'mysql', 'pgsql'],
		mimeTypes: ['text/x-sql', 'application/sql'],
		lineComment: '--',
		blockComment: ['/*', '*/'],
		autoClosingPairs: [
			['(', ')'],
			['"', '"'],
			["'", "'"]
		]
	},
	toml: {
		id: 'toml',
		name: 'TOML',
		extensions: ['toml'],
		mimeTypes: ['application/toml'],
		lineComment: '#',
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['"', '"'],
			["'", "'"]
		]
	},
	dockerfile: {
		id: 'dockerfile',
		name: 'Dockerfile',
		extensions: ['dockerfile', 'containerfile'],
		mimeTypes: ['text/x-dockerfile'],
		lineComment: '#',
		autoClosingPairs: [
			['[', ']'],
			['"', '"'],
			["'", "'"]
		]
	},
	makefile: {
		id: 'makefile',
		name: 'Makefile',
		extensions: ['makefile', 'mk', 'mak'],
		mimeTypes: ['text/x-makefile'],
		lineComment: '#',
		autoClosingPairs: [
			['(', ')'],
			['{', '}'],
			['"', '"'],
			["'", "'"]
		]
	},
	cmake: {
		id: 'cmake',
		name: 'CMake',
		extensions: ['cmake'],
		mimeTypes: ['text/x-cmake'],
		lineComment: '#',
		autoClosingPairs: [
			['(', ')'],
			['"', '"']
		]
	},
	vue: {
		id: 'vue',
		name: 'Vue',
		extensions: ['vue'],
		mimeTypes: ['text/x-vue'],
		blockComment: ['<!--', '-->'],
		autoClosingPairs: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
			['"', '"'],
			["'", "'"],
			['<', '>']
		]
	},
	plaintext: {
		id: 'plaintext',
		name: 'Plain Text',
		extensions: ['txt', 'text'],
		mimeTypes: ['text/plain'],
		autoClosingPairs: []
	}
};

// Extension to language mapping
const extensionMap = new Map<string, string>();
for (const [id, config] of Object.entries(languages)) {
	for (const ext of config.extensions) {
		extensionMap.set(ext.toLowerCase(), id);
	}
}

// MIME type to language mapping
const mimeMap = new Map<string, string>();
for (const [id, config] of Object.entries(languages)) {
	for (const mime of config.mimeTypes) {
		mimeMap.set(mime.toLowerCase(), id);
	}
}

/**
 * Get language ID from file extension
 */
export function getLanguageFromExtension(extension: string): string {
	const ext = extension.toLowerCase().replace(/^\./, '');
	return extensionMap.get(ext) ?? 'plaintext';
}

/**
 * Get language ID from MIME type
 */
export function getLanguageFromMimeType(mimeType: string): string {
	return mimeMap.get(mimeType.toLowerCase()) ?? 'plaintext';
}

/**
 * Get language ID from filename
 */
export function getLanguageFromFilename(filename: string): string {
	const ext = filename.split('.').pop() ?? '';
	return getLanguageFromExtension(ext);
}

/**
 * Get language configuration
 */
export function getLanguageConfig(language: string): LanguageConfig {
	const resolved = resolveLanguage(language);
	return languages[resolved] ?? languages['plaintext'];
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): boolean {
	return tokenizerSupported(language);
}

/**
 * Get list of supported languages
 */
export function getSupportedLanguages(): string[] {
	return getTokenizerLanguages();
}

/**
 * Get all language configurations
 */
export function getAllLanguageConfigs(): LanguageConfig[] {
	return Object.values(languages);
}

// For backwards compatibility - these functions previously loaded CodeMirror extensions
// Now they just return the language string since tokenization is handled internally

/**
 * @deprecated Use getLanguageConfig instead
 */
export async function getLanguageExtension(language: string): Promise<string | null> {
	const resolved = resolveLanguage(language);
	return isLanguageSupported(resolved) ? resolved : null;
}

// Re-export tokenizer functions for convenience
export { resolveLanguage } from './tokenizer';
