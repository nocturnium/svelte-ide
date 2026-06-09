import { describe, it, expect } from 'vitest';
import {
	detectLanguage,
	getExtension,
	getLanguageMimeType,
	isLanguageSupported,
	getSupportedLanguages,
	getLanguageDisplayName,
	getLanguageIcon
} from './language';

// ============================================================
// detectLanguage
// ============================================================

describe('detectLanguage', () => {
	describe('JavaScript/TypeScript extensions', () => {
		it.each([
			['file.js', 'javascript'],
			['file.mjs', 'javascript'],
			['file.cjs', 'javascript'],
			['file.jsx', 'javascript'],
			['file.ts', 'typescript'],
			['file.tsx', 'typescript'],
			['file.mts', 'typescript'],
			['file.cts', 'typescript']
		])('should detect %s as %s', (filename, expected) => {
			expect(detectLanguage(filename)).toBe(expected);
		});
	});

	describe('Web extensions', () => {
		it.each([
			['index.html', 'html'],
			['page.htm', 'html'],
			['style.css', 'css'],
			['style.scss', 'css'],
			['style.sass', 'css'],
			['style.less', 'css']
		])('should detect %s as %s', (filename, expected) => {
			expect(detectLanguage(filename)).toBe(expected);
		});
	});

	describe('Data format extensions', () => {
		it.each([
			['config.json', 'json'],
			['tsconfig.jsonc', 'json'],
			['config.yaml', 'yaml'],
			['config.yml', 'yaml'],
			['config.toml', 'toml'],
			['data.xml', 'xml'],
			['logo.svg', 'xml']
		])('should detect %s as %s', (filename, expected) => {
			expect(detectLanguage(filename)).toBe(expected);
		});
	});

	describe('Markdown extensions', () => {
		it.each([
			['README.md', 'markdown'],
			['file.mdx', 'markdown'],
			['doc.markdown', 'markdown']
		])('should detect %s as %s', (filename, expected) => {
			expect(detectLanguage(filename)).toBe(expected);
		});
	});

	describe('Programming language extensions', () => {
		it.each([
			['script.py', 'python'],
			['main.go', 'go'],
			['lib.rs', 'rust'],
			['App.java', 'java'],
			['script.kt', 'kotlin'],
			['Main.scala', 'scala'],
			['main.c', 'cpp'],
			['main.cpp', 'cpp'],
			['main.cc', 'cpp'],
			['header.h', 'cpp'],
			['header.hpp', 'cpp'],
			['Program.cs', 'csharp'],
			['script.rb', 'ruby'],
			['index.php', 'php'],
			['main.swift', 'swift']
		])('should detect %s as %s', (filename, expected) => {
			expect(detectLanguage(filename)).toBe(expected);
		});
	});

	describe('Shell extensions', () => {
		it.each([
			['script.sh', 'shell'],
			['script.bash', 'shell'],
			['script.zsh', 'shell'],
			['script.fish', 'shell'],
			['script.ps1', 'powershell'],
			['module.psm1', 'powershell']
		])('should detect %s as %s', (filename, expected) => {
			expect(detectLanguage(filename)).toBe(expected);
		});
	});

	describe('Framework extensions', () => {
		it.each([
			['Component.svelte', 'svelte'],
			['Component.vue', 'vue']
		])('should detect %s as %s', (filename, expected) => {
			expect(detectLanguage(filename)).toBe(expected);
		});
	});

	describe('Filename-based detection', () => {
		it.each([
			['Dockerfile', 'dockerfile'],
			['Makefile', 'makefile'],
			['Gemfile', 'ruby'],
			['Rakefile', 'ruby'],
			['Vagrantfile', 'ruby'],
			['Jenkinsfile', 'groovy'],
			['.gitignore', 'gitignore'],
			['.gitattributes', 'gitattributes'],
			['.editorconfig', 'editorconfig'],
			['.env', 'dotenv'],
			['.env.local', 'dotenv'],
			['.env.development', 'dotenv'],
			['.env.production', 'dotenv']
		])('should detect %s as %s', (filename, expected) => {
			expect(detectLanguage(filename)).toBe(expected);
		});
	});

	describe('Path-based detection', () => {
		it('should use the base filename from a full path', () => {
			expect(detectLanguage('some/path/Dockerfile')).toBe('dockerfile');
			expect(detectLanguage('/usr/local/Makefile')).toBe('makefile');
		});
	});

	it('should return plaintext for unknown extensions', () => {
		expect(detectLanguage('file.xyz')).toBe('plaintext');
		expect(detectLanguage('file.unknown')).toBe('plaintext');
	});

	it('should be case insensitive for filenames', () => {
		expect(detectLanguage('DOCKERFILE')).toBe('dockerfile');
		expect(detectLanguage('MAKEFILE')).toBe('makefile');
	});
});

// ============================================================
// getExtension
// ============================================================

describe('getExtension', () => {
	it('should return lowercase extension without dot', () => {
		expect(getExtension('file.ts')).toBe('ts');
		expect(getExtension('file.JS')).toBe('js');
	});

	it('should return empty string for no extension', () => {
		expect(getExtension('Makefile')).toBe('');
	});

	it('should return empty string when dot is at end', () => {
		expect(getExtension('file.')).toBe('');
	});

	it('should handle multiple dots', () => {
		expect(getExtension('file.test.ts')).toBe('ts');
		expect(getExtension('archive.tar.gz')).toBe('gz');
	});

	it('should handle dotfiles', () => {
		expect(getExtension('.gitignore')).toBe('gitignore');
	});
});

// ============================================================
// getLanguageMimeType
// ============================================================

describe('getLanguageMimeType', () => {
	it.each([
		['javascript', 'text/javascript'],
		['typescript', 'text/typescript'],
		['html', 'text/html'],
		['css', 'text/css'],
		['json', 'application/json'],
		['xml', 'application/xml'],
		['markdown', 'text/markdown'],
		['python', 'text/x-python'],
		['go', 'text/x-go'],
		['rust', 'text/x-rust'],
		['plaintext', 'text/plain']
	])('should return correct MIME type for %s', (language, expected) => {
		expect(getLanguageMimeType(language)).toBe(expected);
	});

	it('should return text/plain for unknown languages', () => {
		expect(getLanguageMimeType('unknown')).toBe('text/plain');
	});
});

// ============================================================
// isLanguageSupported
// ============================================================

describe('isLanguageSupported', () => {
	it.each([
		'javascript',
		'typescript',
		'html',
		'css',
		'json',
		'markdown',
		'python',
		'go',
		'xml',
		'svelte',
		'plaintext',
		'vue'
	])('should return true for supported language: %s', (language) => {
		expect(isLanguageSupported(language)).toBe(true);
	});

	it.each(['rust', 'java', 'cpp', 'sql', 'yaml', 'php', 'kotlin', 'ruby', 'unknown'])(
		'should return false for unsupported language: %s',
		(language) => {
			expect(isLanguageSupported(language)).toBe(false);
		}
	);

	it('should agree with getSupportedLanguages for the full candidate set', () => {
		const supported = getSupportedLanguages();
		const candidates = [
			'javascript',
			'typescript',
			'jsx',
			'tsx',
			'html',
			'css',
			'json',
			'markdown',
			'python',
			'go',
			'xml',
			'svelte',
			'plaintext',
			'rust',
			'java',
			'cpp',
			'sql',
			'yaml',
			'php'
		];

		for (const language of candidates) {
			expect(isLanguageSupported(language)).toBe(supported.includes(language));
		}
	});
});

// ============================================================
// getLanguageDisplayName
// ============================================================

describe('getLanguageDisplayName', () => {
	it.each([
		['javascript', 'JavaScript'],
		['typescript', 'TypeScript'],
		['html', 'HTML'],
		['css', 'CSS'],
		['json', 'JSON'],
		['xml', 'XML'],
		['yaml', 'YAML'],
		['markdown', 'Markdown'],
		['python', 'Python'],
		['go', 'Go'],
		['rust', 'Rust'],
		['java', 'Java'],
		['kotlin', 'Kotlin'],
		['cpp', 'C++'],
		['csharp', 'C#'],
		['ruby', 'Ruby'],
		['php', 'PHP'],
		['swift', 'Swift'],
		['sql', 'SQL'],
		['shell', 'Shell'],
		['powershell', 'PowerShell'],
		['dockerfile', 'Dockerfile'],
		['makefile', 'Makefile'],
		['svelte', 'Svelte'],
		['vue', 'Vue'],
		['plaintext', 'Plain Text']
	])('should return %s for %s', (language, expected) => {
		expect(getLanguageDisplayName(language)).toBe(expected);
	});

	it('should capitalize first letter for unknown languages', () => {
		expect(getLanguageDisplayName('foobar')).toBe('Foobar');
	});
});

// ============================================================
// getLanguageIcon
// ============================================================

describe('getLanguageIcon', () => {
	it.each([
		['javascript', 'file-js'],
		['typescript', 'file-ts'],
		['html', 'file-html'],
		['css', 'file-css'],
		['json', 'file-json'],
		['markdown', 'file-md'],
		['python', 'file-python'],
		['go', 'file-go'],
		['rust', 'file-rust'],
		['java', 'file-java'],
		['cpp', 'file-cpp'],
		['svelte', 'file-svelte'],
		['vue', 'file-vue']
	])('should return %s for %s', (language, expected) => {
		expect(getLanguageIcon(language)).toBe(expected);
	});

	it('should return "file" for unknown languages', () => {
		expect(getLanguageIcon('unknown')).toBe('file');
		expect(getLanguageIcon('plaintext')).toBe('file');
	});
});
