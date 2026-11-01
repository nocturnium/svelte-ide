import { describe, it, expect } from 'vitest';
import { isFolder, nodeKey, type FileNode } from './FileExplorer.svelte';

describe('FileExplorer node shapes', () => {
	it('treats the explorer shape (type) and the VFS shape (isDirectory) alike', () => {
		const explorerFolder: FileNode = { id: 'a', name: 'src', path: 'src', type: 'folder' };
		const vfsFolder: FileNode = { name: 'src', path: 'src', isDirectory: true };
		const vfsFile: FileNode = { name: 'a.ts', path: 'src/a.ts', isDirectory: false };
		const explorerFile: FileNode = { id: 'b', name: 'b.ts', path: 'b.ts', type: 'file' };

		expect(isFolder(explorerFolder)).toBe(true);
		expect(isFolder(vfsFolder)).toBe(true);
		expect(isFolder(vfsFile)).toBe(false);
		expect(isFolder(explorerFile)).toBe(false);
	});

	it('keys on id when present and falls back to path, so VFS nodes have unique keys', () => {
		expect(nodeKey({ id: 'x', name: 'n', path: 'p' })).toBe('x');
		const keys = [
			{ name: 'a', path: 'src/a', isDirectory: false },
			{ name: 'b', path: 'src/b', isDirectory: false }
		].map((n) => nodeKey(n));
		expect(new Set(keys).size).toBe(2);
	});
});
