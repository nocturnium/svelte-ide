/**
 * Filesystem-related type definitions
 */

export interface FileNode {
	path: string;
	name: string;
	isDirectory: boolean;
	children?: FileNode[];
	size?: number;
	modifiedAt?: Date;
	language?: string;
}

export interface FileEntry {
	path: string;
	name: string;
	content: string;
	language: string;
	size: number;
	lineCount: number;
	version?: number;
}

export interface FileStat {
	path: string;
	name: string;
	isDirectory: boolean;
	size: number;
	createdAt: Date;
	modifiedAt: Date;
}

export interface FileOperation {
	type: 'create' | 'read' | 'update' | 'delete' | 'rename' | 'move';
	path: string;
	newPath?: string;
	content?: string;
}

export interface SearchOptions {
	regex?: boolean;
	caseSensitive?: boolean;
	wholeWord?: boolean;
	includePattern?: string;
	excludePattern?: string;
	maxResults?: number;
}

export interface SearchResult {
	path: string;
	line: number;
	column: number;
	content: string;
	matches: TextMatch[];
}

export interface TextMatch {
	start: number;
	end: number;
	text: string;
}

export type WatchCallback = (event: WatchEvent) => void;
export type Unsubscribe = () => void;

export interface WatchEvent {
	type: 'create' | 'change' | 'delete';
	path: string;
}

/**
 * Filesystem adapter interface for pluggable backends
 */
export interface FilesystemAdapter {
	// Read operations
	readFile(path: string): Promise<FileEntry>;
	readDirectory(path: string): Promise<FileNode[]>;
	exists(path: string): Promise<boolean>;
	stat(path: string): Promise<FileStat>;

	// Write operations
	writeFile(path: string, content: string): Promise<void>;
	createDirectory(path: string): Promise<void>;
	delete(path: string): Promise<void>;
	rename(oldPath: string, newPath: string): Promise<void>;
	copy(source: string, destination: string): Promise<void>;

	// Search operations
	search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

	// Watch operations (optional)
	watch?(path: string, callback: WatchCallback): Unsubscribe;
}
