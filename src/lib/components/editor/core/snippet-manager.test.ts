import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	SnippetManager,
	createSnippetManager,
	type Snippet,
	type SnippetEvent
} from './snippet-manager';

// ============================================================
// Helpers
// ============================================================

function makeSnippetInput(overrides: Partial<Omit<Snippet, 'id' | 'isUserDefined' | 'usageCount' | 'lastUsed'>> = {}) {
	return {
		name: overrides.name ?? 'Test Snippet',
		prefix: overrides.prefix ?? 'test',
		body: overrides.body ?? 'console.log($1);$0',
		description: overrides.description ?? 'A test snippet',
		languages: overrides.languages ?? ['javascript'],
		category: overrides.category ?? 'Test'
	};
}

function collectEvents(manager: SnippetManager): SnippetEvent[] {
	const events: SnippetEvent[] = [];
	manager.subscribe((e) => events.push(e));
	return events;
}

// ============================================================
// createSnippetManager factory
// ============================================================

describe('createSnippetManager', () => {
	it('should return a SnippetManager instance', () => {
		const mgr = createSnippetManager();
		expect(mgr).toBeInstanceOf(SnippetManager);
	});

	it('should accept partial config', () => {
		const mgr = createSnippetManager({ maxUserSnippets: 10 });
		expect(mgr).toBeInstanceOf(SnippetManager);
	});
});

// ============================================================
// Built-in snippets
// ============================================================

describe('Built-in snippets', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should load JS built-in snippets for javascript language', () => {
		const jsSnippets = mgr.getSnippetsForLanguage('javascript');
		const ids = jsSnippets.map((s) => s.id);
		expect(ids).toContain('js-log');
		expect(ids).toContain('js-fn');
		expect(ids).toContain('js-arrow');
		expect(ids).toContain('js-for');
		expect(ids).toContain('js-if');
		expect(ids).toContain('js-import');
	});

	it('should load Svelte built-in snippets for svelte language', () => {
		const svelteSnippets = mgr.getSnippetsForLanguage('svelte');
		const ids = svelteSnippets.map((s) => s.id);
		expect(ids).toContain('svelte-script');
		expect(ids).toContain('svelte-state');
		expect(ids).toContain('svelte-derived');
		expect(ids).toContain('svelte-effect');
		expect(ids).toContain('svelte-each');
		expect(ids).toContain('svelte-if');
	});

	it('should not return JS-only snippets for svelte language', () => {
		const svelteSnippets = mgr.getSnippetsForLanguage('svelte');
		const ids = svelteSnippets.map((s) => s.id);
		// js-fn is scoped to javascript/typescript only
		expect(ids).not.toContain('js-fn');
	});

	it('should return typescript snippets for typescript language', () => {
		const tsSnippets = mgr.getSnippetsForLanguage('typescript');
		const ids = tsSnippets.map((s) => s.id);
		expect(ids).toContain('js-fn');
		expect(ids).toContain('js-arrow');
	});

	it('should accept additional built-in snippets via config', () => {
		const custom: Snippet = {
			id: 'custom-builtin',
			name: 'Custom',
			prefix: 'cust',
			body: 'custom($1)$0',
			description: 'Custom built-in',
			languages: ['go'],
			category: 'Custom',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const mgr2 = createSnippetManager({ builtInSnippets: [custom] });
		const goSnippets = mgr2.getSnippetsForLanguage('go');
		expect(goSnippets.map((s) => s.id)).toContain('custom-builtin');
	});

	it('should include language-agnostic snippets (empty languages array) for any language', () => {
		const custom: Snippet = {
			id: 'universal',
			name: 'Universal',
			prefix: 'uni',
			body: '// $0',
			description: 'Universal',
			languages: [],
			category: 'General',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const mgr2 = createSnippetManager({ builtInSnippets: [custom] });
		expect(mgr2.getSnippetsForLanguage('python').map((s) => s.id)).toContain('universal');
		expect(mgr2.getSnippetsForLanguage('rust').map((s) => s.id)).toContain('universal');
	});
});

// ============================================================
// Snippet registration (addSnippet / getSnippet / deleteSnippet / updateSnippet)
// ============================================================

describe('Snippet registration', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should add a user snippet and assign a generated id', () => {
		const snippet = mgr.addSnippet(makeSnippetInput());
		expect(snippet.id).toMatch(/^user-/);
		expect(snippet.isUserDefined).toBe(true);
		expect(snippet.usageCount).toBe(0);
		expect(snippet.lastUsed).toBeNull();
	});

	it('should retrieve a user snippet by id', () => {
		const snippet = mgr.addSnippet(makeSnippetInput());
		expect(mgr.getSnippet(snippet.id)).toBe(snippet);
	});

	it('should retrieve a built-in snippet by id', () => {
		const s = mgr.getSnippet('js-log');
		expect(s).toBeDefined();
		expect(s!.prefix).toBe('log');
	});

	it('should return undefined for a non-existent id', () => {
		expect(mgr.getSnippet('does-not-exist')).toBeUndefined();
	});

	it('should delete a user snippet and return true', () => {
		const snippet = mgr.addSnippet(makeSnippetInput());
		expect(mgr.deleteSnippet(snippet.id)).toBe(true);
		expect(mgr.getSnippet(snippet.id)).toBeUndefined();
	});

	it('should return false when deleting a non-existent snippet', () => {
		expect(mgr.deleteSnippet('nope')).toBe(false);
	});

	it('should update a user snippet and return true', () => {
		const snippet = mgr.addSnippet(makeSnippetInput());
		const updated = mgr.updateSnippet(snippet.id, { name: 'Updated Name' });
		expect(updated).toBe(true);
		expect(mgr.getSnippet(snippet.id)!.name).toBe('Updated Name');
	});

	it('should return false when updating a non-existent snippet', () => {
		expect(mgr.updateSnippet('nope', { name: 'X' })).toBe(false);
	});

	it('should enforce maxUserSnippets limit', () => {
		const mgr2 = createSnippetManager({ maxUserSnippets: 2 });
		mgr2.addSnippet(makeSnippetInput({ prefix: 'a' }));
		mgr2.addSnippet(makeSnippetInput({ prefix: 'b' }));
		expect(() => mgr2.addSnippet(makeSnippetInput({ prefix: 'c' }))).toThrow(/Maximum snippet limit/);
	});
});

// ============================================================
// getSnippetsForLanguage & findByPrefix
// ============================================================

describe('Snippet lookup', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should include user snippets in language results', () => {
		const s = mgr.addSnippet(makeSnippetInput({ languages: ['python'] }));
		const pythonSnippets = mgr.getSnippetsForLanguage('python');
		expect(pythonSnippets.map((x) => x.id)).toContain(s.id);
	});

	it('should sort snippets by usageCount descending', () => {
		const a = mgr.addSnippet(makeSnippetInput({ prefix: 'aaa', languages: ['ruby'] }));
		const b = mgr.addSnippet(makeSnippetInput({ prefix: 'bbb', languages: ['ruby'] }));
		// Simulate usage
		a.usageCount = 5;
		b.usageCount = 10;
		const rubySnippets = mgr.getSnippetsForLanguage('ruby');
		const aIdx = rubySnippets.findIndex((s) => s.id === a.id);
		const bIdx = rubySnippets.findIndex((s) => s.id === b.id);
		expect(bIdx).toBeLessThan(aIdx);
	});

	it('should find snippets by prefix match (case-insensitive)', () => {
		const results = mgr.findByPrefix('LOG', 'javascript');
		expect(results.some((s) => s.prefix === 'log')).toBe(true);
	});

	it('should find snippets by name substring match', () => {
		const results = mgr.findByPrefix('arrow', 'javascript');
		expect(results.some((s) => s.id === 'js-arrow')).toBe(true);
	});

	it('should return empty for a prefix with no matches', () => {
		expect(mgr.findByPrefix('zzzzz', 'javascript')).toEqual([]);
	});

	it('should scope findByPrefix to the given language', () => {
		const results = mgr.findByPrefix('script', 'javascript');
		// svelte-script should not appear for javascript
		expect(results.some((s) => s.id === 'svelte-script')).toBe(false);
	});
});

// ============================================================
// Snippet expansion (expand)
// ============================================================

describe('Snippet expansion', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should expand a simple snippet with $1 and $0', () => {
		const snippet = mgr.getSnippet('js-log')!;
		const expanded = mgr.expand(snippet);
		expect(expanded.text).toBe('console.log();');
		expect(expanded.tabStops.length).toBe(2);
		// $1 should come before $0
		expect(expanded.tabStops[0].index).toBe(1);
		expect(expanded.tabStops[expanded.tabStops.length - 1].index).toBe(0);
	});

	it('should expand placeholders with default text', () => {
		const snippet = mgr.getSnippet('js-fn')!;
		const expanded = mgr.expand(snippet);
		// body: 'function ${1:name}(${2:params}) {\n\t$0\n}'
		expect(expanded.text).toContain('function name(params)');
		// Placeholder text should be captured
		const ts1 = expanded.tabStops.find((t) => t.index === 1);
		expect(ts1).toBeDefined();
		expect(ts1!.placeholder).toBe('name');
		const ts2 = expanded.tabStops.find((t) => t.index === 2);
		expect(ts2).toBeDefined();
		expect(ts2!.placeholder).toBe('params');
	});

	it('should sort tab stops with $0 last', () => {
		const snippet = mgr.getSnippet('js-fn')!;
		const expanded = mgr.expand(snippet);
		const last = expanded.tabStops[expanded.tabStops.length - 1];
		expect(last.index).toBe(0);
	});

	it('should handle escaped dollar signs', () => {
		const snippet: Snippet = {
			id: 'test-escape',
			name: 'Escape Test',
			prefix: 'esc',
			body: 'price is \\$100$0',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet);
		expect(expanded.text).toContain('price is $100');
	});

	it('should replace built-in variables like CURRENT_YEAR', () => {
		const snippet: Snippet = {
			id: 'test-var',
			name: 'Var Test',
			prefix: 'var',
			body: '// Year: ${CURRENT_YEAR}$0',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet);
		const year = new Date().getFullYear().toString();
		expect(expanded.text).toContain(`// Year: ${year}`);
	});

	it('should support custom variables passed to expand', () => {
		const snippet: Snippet = {
			id: 'test-custom-var',
			name: 'Custom Var',
			prefix: 'cv',
			body: 'File: ${TM_FILENAME}$0',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet, { TM_FILENAME: 'myfile.ts' });
		expect(expanded.text).toBe('File: myfile.ts');
	});

	it('should use variable default value when variable is not set', () => {
		const snippet: Snippet = {
			id: 'test-default-var',
			name: 'Default Var',
			prefix: 'dv',
			body: '${UNKNOWN_VAR:fallback}$0',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet);
		expect(expanded.text).toBe('fallback');
	});

	it('should handle choice placeholders (${1|a,b,c|})', () => {
		const snippet: Snippet = {
			id: 'test-choice',
			name: 'Choice Test',
			prefix: 'ch',
			body: 'type: ${1|string,number,boolean|}$0',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet);
		// First choice should be used as default
		expect(expanded.text).toBe('type: string');
		const ts1 = expanded.tabStops.find((t) => t.index === 1);
		expect(ts1).toBeDefined();
		expect(ts1!.choices).toEqual(['string', 'number', 'boolean']);
	});

	it('should expand a snippet with no tab stops', () => {
		const snippet: Snippet = {
			id: 'test-no-tabstop',
			name: 'No Tabstop',
			prefix: 'nt',
			body: 'just plain text',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet);
		expect(expanded.text).toBe('just plain text');
		expect(expanded.tabStops).toHaveLength(0);
	});

	it('should expand an empty snippet body', () => {
		const snippet: Snippet = {
			id: 'test-empty',
			name: 'Empty',
			prefix: 'emp',
			body: '',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet);
		expect(expanded.text).toBe('');
		expect(expanded.tabStops).toHaveLength(0);
	});

	it('should handle escaped \\n and \\t in body', () => {
		const snippet: Snippet = {
			id: 'test-escaped-chars',
			name: 'Escaped',
			prefix: 'esc2',
			body: 'line1\\nline2\\tindented$0',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet);
		expect(expanded.text).toContain('\n');
		expect(expanded.text).toContain('\t');
	});

	it('should set currentTabStop to 0 on expansion', () => {
		const snippet = mgr.getSnippet('js-fn')!;
		const expanded = mgr.expand(snippet);
		expect(expanded.currentTabStop).toBe(0);
	});

	it('should compute tab stop offsets correctly for simple placeholders', () => {
		const snippet: Snippet = {
			id: 'test-offsets',
			name: 'Offsets',
			prefix: 'off',
			body: 'a${1:XX}b${2:YYY}c$0',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet);
		// Expanded text should be "aXXbYYYc"
		expect(expanded.text).toBe('aXXbYYYc');

		const ts1 = expanded.tabStops.find((t) => t.index === 1)!;
		expect(ts1.start).toBe(1); // "a" then XX
		expect(ts1.end).toBe(3);   // "aXX"
		expect(ts1.placeholder).toBe('XX');

		const ts2 = expanded.tabStops.find((t) => t.index === 2)!;
		expect(ts2.start).toBe(4); // "aXXb" then YYY
		expect(ts2.end).toBe(7);   // "aXXbYYY"
		expect(ts2.placeholder).toBe('YYY');
	});
});

// ============================================================
// Snippet session (startSession / nextTabStop / prevTabStop)
// ============================================================

describe('Snippet session', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should start a session and mark it active', () => {
		const snippet = mgr.getSnippet('js-fn')!;
		const session = mgr.startSession(snippet, { line: 0, column: 0 });
		expect(session.isActive).toBe(true);
		expect(mgr.hasActiveSession()).toBe(true);
		expect(mgr.getActiveSession()).toBe(session);
	});

	it('should increment snippet usageCount on session start', () => {
		const snippet = mgr.getSnippet('js-log')!;
		const before = snippet.usageCount;
		mgr.startSession(snippet, { line: 0, column: 0 });
		expect(snippet.usageCount).toBe(before + 1);
	});

	it('should set lastUsed on session start', () => {
		// Use a fresh user snippet so lastUsed is guaranteed null
		const snippet = mgr.addSnippet(makeSnippetInput({ prefix: 'lu' }));
		expect(snippet.lastUsed).toBeNull();
		mgr.startSession(snippet, { line: 0, column: 0 });
		expect(snippet.lastUsed).toBeInstanceOf(Date);
	});

	it('should store the start position', () => {
		const snippet = mgr.getSnippet('js-log')!;
		const session = mgr.startSession(snippet, { line: 5, column: 10 });
		expect(session.startPosition).toEqual({ line: 5, column: 10 });
	});

	it('should end previous session when starting a new one', () => {
		const snippet = mgr.getSnippet('js-log')!;
		const session1 = mgr.startSession(snippet, { line: 0, column: 0 });
		const session2 = mgr.startSession(snippet, { line: 1, column: 0 });
		expect(session1.isActive).toBe(false);
		expect(session2.isActive).toBe(true);
	});

	it('should end session explicitly', () => {
		const snippet = mgr.getSnippet('js-log')!;
		const session = mgr.startSession(snippet, { line: 0, column: 0 });
		mgr.endSession();
		expect(session.isActive).toBe(false);
		expect(mgr.hasActiveSession()).toBe(false);
		expect(mgr.getActiveSession()).toBeNull();
	});

	it('should be a no-op to endSession when no session is active', () => {
		expect(() => mgr.endSession()).not.toThrow();
	});

	it('should pass variables to expand during startSession', () => {
		const snippet: Snippet = {
			id: 'test-session-vars',
			name: 'Vars',
			prefix: 'sv',
			body: '${TM_FILENAME}$0',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const session = mgr.startSession(snippet, { line: 0, column: 0 }, { TM_FILENAME: 'hello.ts' });
		expect(session.expanded.text).toBe('hello.ts');
	});
});

// ============================================================
// Tab stop navigation
// ============================================================

describe('Tab stop navigation', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should navigate forward through tab stops', () => {
		// js-fn has tab stops: $1:name, $2:params, $0 (sorted as [1, 2, 0])
		const snippet = mgr.getSnippet('js-fn')!;
		mgr.startSession(snippet, { line: 0, column: 0 });

		// currentTabStop starts at 0 (first tab stop = $1)
		const first = mgr.getCurrentTabStop();
		expect(first).toBeDefined();
		expect(first!.index).toBe(1);

		// Navigate next to $2
		const second = mgr.nextTabStop();
		expect(second).toBeDefined();
		expect(second!.index).toBe(2);

		// Navigate next to $0 (final position tab stop)
		const finalStop = mgr.nextTabStop();
		expect(finalStop).toBeDefined();
		expect(finalStop!.index).toBe(0);

		// One more nextTabStop at the last position => session ends, returns null
		const beyondFinal = mgr.nextTabStop();
		expect(beyondFinal).toBeNull();
		expect(mgr.hasActiveSession()).toBe(false);
	});

	it('should navigate backward through tab stops', () => {
		const snippet = mgr.getSnippet('js-fn')!;
		mgr.startSession(snippet, { line: 0, column: 0 });

		// Move forward first
		mgr.nextTabStop(); // now at $2

		// Move backward
		const prev = mgr.prevTabStop();
		expect(prev).toBeDefined();
		expect(prev!.index).toBe(1);
	});

	it('should return null when navigating backward at the first tab stop', () => {
		const snippet = mgr.getSnippet('js-fn')!;
		mgr.startSession(snippet, { line: 0, column: 0 });
		expect(mgr.prevTabStop()).toBeNull();
	});

	it('should return null for nextTabStop with no active session', () => {
		expect(mgr.nextTabStop()).toBeNull();
	});

	it('should return null for prevTabStop with no active session', () => {
		expect(mgr.prevTabStop()).toBeNull();
	});

	it('should return null for getCurrentTabStop with no active session', () => {
		expect(mgr.getCurrentTabStop()).toBeNull();
	});

	it('should handle a snippet with only $0 (single tab stop)', () => {
		const snippet: Snippet = {
			id: 'test-only-final',
			name: 'Only Final',
			prefix: 'of',
			body: 'done$0',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		mgr.startSession(snippet, { line: 0, column: 0 });
		// Only one tab stop ($0), currentTabStop=0 which is the last
		// nextTabStop should end the session since currentTabStop >= length - 1
		const result = mgr.nextTabStop();
		expect(result).toBeNull();
		expect(mgr.hasActiveSession()).toBe(false);
	});
});

// ============================================================
// Categories
// ============================================================

describe('Categories', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should return all categories when no language is specified', () => {
		const cats = mgr.getCategories();
		expect(cats).toContain('Debug');
		expect(cats).toContain('Functions');
		expect(cats).toContain('Loops');
		expect(cats).toContain('Control');
		expect(cats).toContain('Runes');
		expect(cats).toContain('Template');
		expect(cats).toContain('Structure');
	});

	it('should return categories sorted alphabetically', () => {
		const cats = mgr.getCategories();
		const sorted = [...cats].sort();
		expect(cats).toEqual(sorted);
	});

	it('should return only categories relevant to a language', () => {
		const cats = mgr.getCategories('svelte');
		expect(cats).toContain('Runes');
		expect(cats).toContain('Template');
		// Some JS snippets also apply to svelte (like js-log which includes javascriptreact),
		// but js-fn is not scoped for svelte
		expect(cats).not.toContain('Loops'); // js Loops not in svelte
	});

	it('should include user snippet categories', () => {
		mgr.addSnippet(makeSnippetInput({ category: 'MyCustomCategory', languages: [] }));
		const cats = mgr.getCategories();
		expect(cats).toContain('MyCustomCategory');
	});
});

// ============================================================
// Export / Import
// ============================================================

describe('Export / Import snippets', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should export user snippets as JSON', () => {
		mgr.addSnippet(makeSnippetInput({ name: 'Export Me' }));
		const json = mgr.exportUserSnippets();
		const parsed = JSON.parse(json);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed.length).toBe(1);
		expect(parsed[0].name).toBe('Export Me');
	});

	it('should export empty array when no user snippets exist', () => {
		const json = mgr.exportUserSnippets();
		expect(JSON.parse(json)).toEqual([]);
	});

	it('should import snippets from JSON and return count', () => {
		const snippets = [
			makeSnippetInput({ name: 'Imported 1', prefix: 'i1' }),
			makeSnippetInput({ name: 'Imported 2', prefix: 'i2' })
		];
		const json = JSON.stringify(snippets);
		const count = mgr.importUserSnippets(json);
		expect(count).toBe(2);
	});

	it('should stop importing when maxUserSnippets is reached', () => {
		const mgr2 = createSnippetManager({ maxUserSnippets: 1 });
		const snippets = [
			makeSnippetInput({ name: 'A', prefix: 'a' }),
			makeSnippetInput({ name: 'B', prefix: 'b' })
		];
		const count = mgr2.importUserSnippets(JSON.stringify(snippets));
		expect(count).toBe(1);
	});

	it('should round-trip export/import', () => {
		mgr.addSnippet(makeSnippetInput({ name: 'Round Trip', prefix: 'rt' }));
		const json = mgr.exportUserSnippets();

		const mgr2 = createSnippetManager();
		const count = mgr2.importUserSnippets(json);
		expect(count).toBe(1);
		const all = mgr2.getSnippetsForLanguage('javascript');
		expect(all.some((s) => s.name === 'Round Trip')).toBe(true);
	});
});

// ============================================================
// Events / subscribe
// ============================================================

describe('Events', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should emit snippet-added on addSnippet', () => {
		const events = collectEvents(mgr);
		mgr.addSnippet(makeSnippetInput());
		expect(events.length).toBe(1);
		expect(events[0].type).toBe('snippet-added');
	});

	it('should emit snippet-updated on updateSnippet', () => {
		const snippet = mgr.addSnippet(makeSnippetInput());
		const events = collectEvents(mgr);
		mgr.updateSnippet(snippet.id, { name: 'New' });
		expect(events.some((e) => e.type === 'snippet-updated')).toBe(true);
	});

	it('should emit snippet-deleted on deleteSnippet', () => {
		const snippet = mgr.addSnippet(makeSnippetInput());
		const events = collectEvents(mgr);
		mgr.deleteSnippet(snippet.id);
		expect(events.some((e) => e.type === 'snippet-deleted')).toBe(true);
	});

	it('should emit session-started on startSession', () => {
		const events = collectEvents(mgr);
		const snippet = mgr.getSnippet('js-log')!;
		mgr.startSession(snippet, { line: 0, column: 0 });
		expect(events.some((e) => e.type === 'session-started')).toBe(true);
	});

	it('should emit session-ended on endSession', () => {
		const snippet = mgr.getSnippet('js-log')!;
		mgr.startSession(snippet, { line: 0, column: 0 });
		const events = collectEvents(mgr);
		mgr.endSession();
		expect(events.some((e) => e.type === 'session-ended')).toBe(true);
	});

	it('should emit tabstop-changed on nextTabStop', () => {
		const snippet = mgr.getSnippet('js-fn')!;
		mgr.startSession(snippet, { line: 0, column: 0 });
		const events = collectEvents(mgr);
		mgr.nextTabStop();
		expect(events.some((e) => e.type === 'tabstop-changed')).toBe(true);
	});

	it('should emit tabstop-changed on prevTabStop', () => {
		const snippet = mgr.getSnippet('js-fn')!;
		mgr.startSession(snippet, { line: 0, column: 0 });
		mgr.nextTabStop();
		const events = collectEvents(mgr);
		mgr.prevTabStop();
		expect(events.some((e) => e.type === 'tabstop-changed')).toBe(true);
	});

	it('should unsubscribe when the returned function is called', () => {
		const events: SnippetEvent[] = [];
		const unsub = mgr.subscribe((e) => events.push(e));
		mgr.addSnippet(makeSnippetInput({ prefix: 'x' }));
		expect(events.length).toBe(1);

		unsub();
		mgr.addSnippet(makeSnippetInput({ prefix: 'y' }));
		expect(events.length).toBe(1); // no new events
	});

	it('should not throw if a listener throws', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mgr.subscribe(() => { throw new Error('boom'); });
		expect(() => mgr.addSnippet(makeSnippetInput())).not.toThrow();
		consoleSpy.mockRestore();
	});
});

// ============================================================
// Edge cases
// ============================================================

describe('Edge cases', () => {
	let mgr: SnippetManager;

	beforeEach(() => {
		mgr = createSnippetManager();
	});

	it('should handle snippet with multiple references to same tab stop index', () => {
		// js-for uses ${1:i} multiple times
		const snippet = mgr.getSnippet('js-for')!;
		const expanded = mgr.expand(snippet);
		// All $1 references should be expanded
		expect(expanded.text).toContain('for (let i = 0; i < array.length; i++)');
	});

	it('should handle Svelte escaped dollar signs in runes', () => {
		const snippet = mgr.getSnippet('svelte-state')!;
		const expanded = mgr.expand(snippet);
		// The body has \\$state which should produce $state
		expect(expanded.text).toContain('$state');
	});

	it('should handle snippet with only escaped text and no tab stops', () => {
		const snippet: Snippet = {
			id: 'test-pure-escape',
			name: 'Pure Escape',
			prefix: 'pe',
			body: 'cost \\$100\\n',
			description: '',
			languages: [],
			category: 'Test',
			isUserDefined: false,
			usageCount: 0,
			lastUsed: null
		};
		const expanded = mgr.expand(snippet);
		expect(expanded.text).toBe('cost $100\n');
		expect(expanded.tabStops).toHaveLength(0);
	});

	it('should handle hasActiveSession returning false initially', () => {
		expect(mgr.hasActiveSession()).toBe(false);
	});

	it('should handle getActiveSession returning null initially', () => {
		expect(mgr.getActiveSession()).toBeNull();
	});

	it('should handle a language with zero matching snippets', () => {
		const result = mgr.getSnippetsForLanguage('cobol');
		expect(result).toEqual([]);
	});

	it('should handle consecutive session starts without explicit endSession', () => {
		const s1 = mgr.getSnippet('js-log')!;
		const s2 = mgr.getSnippet('js-fn')!;
		const session1 = mgr.startSession(s1, { line: 0, column: 0 });
		const session2 = mgr.startSession(s2, { line: 1, column: 0 });
		expect(session1.isActive).toBe(false);
		expect(session2.isActive).toBe(true);
		expect(mgr.getActiveSession()).toBe(session2);
	});
});
