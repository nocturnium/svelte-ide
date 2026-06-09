import {
	getSupportedLanguages as getTokenizerSupportedLanguages,
	resolveLanguage
} from '../components/editor/tokenizer';

/**
 * Language detection and utilities
 */

const extensionToLanguage: Record<string, string> = {
	// JavaScript / TypeScript
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'javascript',
	ts: 'typescript',
	tsx: 'typescript',
	mts: 'typescript',
	cts: 'typescript',

	// Web
	html: 'html',
	htm: 'html',
	css: 'css',
	scss: 'css',
	sass: 'css',
	less: 'css',

	// Data formats
	json: 'json',
	jsonc: 'json',
	yaml: 'yaml',
	yml: 'yaml',
	toml: 'toml',
	xml: 'xml',
	svg: 'xml',

	// Markdown
	md: 'markdown',
	mdx: 'markdown',
	markdown: 'markdown',

	// Programming languages
	py: 'python',
	pyw: 'python',
	go: 'go',
	rs: 'rust',
	java: 'java',
	kt: 'kotlin',
	kts: 'kotlin',
	scala: 'scala',
	c: 'cpp',
	cpp: 'cpp',
	cc: 'cpp',
	cxx: 'cpp',
	h: 'cpp',
	hpp: 'cpp',
	hxx: 'cpp',
	cs: 'csharp',
	rb: 'ruby',
	php: 'php',
	swift: 'swift',

	// Shell
	sh: 'shell',
	bash: 'shell',
	zsh: 'shell',
	fish: 'shell',
	ps1: 'powershell',
	psm1: 'powershell',

	// Database
	sql: 'sql',
	psql: 'sql',
	mysql: 'sql',

	// Config
	dockerfile: 'dockerfile',
	makefile: 'makefile',
	cmake: 'cmake',

	// Svelte
	svelte: 'svelte',

	// Vue
	vue: 'vue'
};

const filenameToLanguage: Record<string, string> = {
	dockerfile: 'dockerfile',
	makefile: 'makefile',
	cmakelists: 'cmake',
	gemfile: 'ruby',
	rakefile: 'ruby',
	vagrantfile: 'ruby',
	jenkinsfile: 'groovy',
	'.gitignore': 'gitignore',
	'.gitattributes': 'gitattributes',
	'.editorconfig': 'editorconfig',
	'.env': 'dotenv',
	'.env.local': 'dotenv',
	'.env.development': 'dotenv',
	'.env.production': 'dotenv'
};

/**
 * Detect language from filename
 */
export function detectLanguage(filename: string): string {
	const lowerFilename = filename.toLowerCase();

	// Check exact filename matches first
	if (filenameToLanguage[lowerFilename]) {
		return filenameToLanguage[lowerFilename];
	}

	// Check for files without extension but known names
	const baseName = lowerFilename.split('/').pop() ?? lowerFilename;
	if (filenameToLanguage[baseName]) {
		return filenameToLanguage[baseName];
	}

	// Get extension
	const ext = getExtension(filename);
	if (ext && extensionToLanguage[ext]) {
		return extensionToLanguage[ext];
	}

	return 'plaintext';
}

/**
 * Get file extension (lowercase, without dot)
 */
export function getExtension(filename: string): string {
	const lastDot = filename.lastIndexOf('.');
	if (lastDot === -1 || lastDot === filename.length - 1) {
		return '';
	}
	return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Get MIME type for a language
 */
export function getLanguageMimeType(language: string): string {
	const mimeTypes: Record<string, string> = {
		javascript: 'text/javascript',
		typescript: 'text/typescript',
		html: 'text/html',
		css: 'text/css',
		json: 'application/json',
		xml: 'application/xml',
		markdown: 'text/markdown',
		python: 'text/x-python',
		go: 'text/x-go',
		rust: 'text/x-rust',
		java: 'text/x-java',
		cpp: 'text/x-c++src',
		sql: 'text/x-sql',
		yaml: 'text/x-yaml',
		plaintext: 'text/plain'
	};

	return mimeTypes[language] ?? 'text/plain';
}

/**
 * Check if a language is supported for syntax highlighting
 */
export function isLanguageSupported(language: string): boolean {
	return getTokenizerSupportedLanguages().includes(resolveLanguage(language));
}

/**
 * Get languages with real syntax tokenizers.
 */
export function getSupportedLanguages(): string[] {
	return getTokenizerSupportedLanguages();
}

/**
 * Get display name for a language
 */
export function getLanguageDisplayName(language: string): string {
	const displayNames: Record<string, string> = {
		javascript: 'JavaScript',
		typescript: 'TypeScript',
		html: 'HTML',
		css: 'CSS',
		json: 'JSON',
		xml: 'XML',
		yaml: 'YAML',
		markdown: 'Markdown',
		python: 'Python',
		go: 'Go',
		rust: 'Rust',
		java: 'Java',
		kotlin: 'Kotlin',
		scala: 'Scala',
		cpp: 'C++',
		csharp: 'C#',
		ruby: 'Ruby',
		php: 'PHP',
		swift: 'Swift',
		sql: 'SQL',
		shell: 'Shell',
		powershell: 'PowerShell',
		dockerfile: 'Dockerfile',
		makefile: 'Makefile',
		svelte: 'Svelte',
		vue: 'Vue',
		plaintext: 'Plain Text'
	};

	return displayNames[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}

/**
 * Get icon name for a language (for use with icon components)
 */
export function getLanguageIcon(language: string): string {
	// Returns icon identifiers that can be mapped to actual icons
	const iconMap: Record<string, string> = {
		javascript: 'file-js',
		typescript: 'file-ts',
		html: 'file-html',
		css: 'file-css',
		json: 'file-json',
		markdown: 'file-md',
		python: 'file-python',
		go: 'file-go',
		rust: 'file-rust',
		java: 'file-java',
		cpp: 'file-cpp',
		svelte: 'file-svelte',
		vue: 'file-vue'
	};

	return iconMap[language] ?? 'file';
}
