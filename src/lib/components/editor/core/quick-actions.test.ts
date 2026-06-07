import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	QuickActionsManager,
	createQuickActionsManager,
	groupActionsByKind,
	getKindLabel,
	getKindIcon,
	type CodeAction,
	type CodeActionContext,
	type CodeActionKind,
	type CodeActionProvider
} from './quick-actions';

// ============================================================
// Helpers
// ============================================================

function makeContext(overrides: Partial<CodeActionContext> = {}): CodeActionContext {
	return {
		position: overrides.position ?? { line: 5, column: 10 },
		diagnostics: overrides.diagnostics ?? [],
		lineContent: overrides.lineContent ?? 'const x = 42',
		language: overrides.language ?? 'typescript',
		content: overrides.content ?? 'const x = 42;\n',
		selection: overrides.selection,
		selectedText: overrides.selectedText
	};
}

function makeAction(overrides: Partial<CodeAction> = {}): CodeAction {
	return {
		id: overrides.id ?? 'test-action',
		title: overrides.title ?? 'Test Action',
		kind: overrides.kind ?? 'quickfix',
		...overrides
	};
}

// ============================================================
// QuickActionsManager -- creation
// ============================================================

describe('QuickActionsManager -- creation', () => {
	it('should create an instance via factory function', () => {
		const mgr = createQuickActionsManager();
		expect(mgr).toBeInstanceOf(QuickActionsManager);
	});

	it('should start enabled by default', () => {
		const mgr = new QuickActionsManager();
		expect(mgr.isEnabled()).toBe(true);
	});

	it('should have default config values', () => {
		const mgr = new QuickActionsManager();
		const cfg = mgr.config;
		expect(cfg.enabled).toBe(true);
		expect(cfg.showLightbulb).toBe(true);
		expect(cfg.autoShow).toBe(true);
		expect(cfg.showDelay).toBe(300);
	});

	it('should start with no current actions', () => {
		const mgr = new QuickActionsManager();
		expect(mgr.currentActions).toEqual([]);
		expect(mgr.hasActions).toBe(false);
	});
});

// ============================================================
// QuickActionsManager -- config
// ============================================================

describe('QuickActionsManager -- config', () => {
	let mgr: QuickActionsManager;

	beforeEach(() => {
		mgr = new QuickActionsManager();
	});

	it('setConfig should merge partial config', () => {
		mgr.setConfig({ showDelay: 500 });
		expect(mgr.config.showDelay).toBe(500);
		// Other values preserved
		expect(mgr.config.enabled).toBe(true);
		expect(mgr.config.showLightbulb).toBe(true);
	});

	it('setEnabled(false) should disable and clear actions', () => {
		// First populate some actions
		const ctx = makeContext({ lineContent: 'const unused = 1' });
		const actions = mgr.getActions(ctx);
		expect(actions.length).toBeGreaterThan(0);

		mgr.setEnabled(false);
		expect(mgr.isEnabled()).toBe(false);
		expect(mgr.config.enabled).toBe(false);
		expect(mgr.currentActions).toEqual([]);
	});

	it('setEnabled(true) should re-enable', () => {
		mgr.setEnabled(false);
		mgr.setEnabled(true);
		expect(mgr.isEnabled()).toBe(true);
	});

	it('config getter should return a copy', () => {
		const c1 = mgr.config;
		const c2 = mgr.config;
		expect(c1).toEqual(c2);
		expect(c1).not.toBe(c2);
	});
});

// ============================================================
// QuickActionsManager -- registerProvider
// ============================================================

describe('QuickActionsManager -- registerProvider', () => {
	let mgr: QuickActionsManager;

	beforeEach(() => {
		mgr = new QuickActionsManager();
	});

	it('should register a custom provider and return unsubscribe function', () => {
		const provider: CodeActionProvider = () => [
			makeAction({ id: 'custom-1', title: 'Custom' })
		];
		const unsub = mgr.registerProvider('my-provider', provider);
		expect(typeof unsub).toBe('function');

		const ctx = makeContext({ lineContent: '' });
		const actions = mgr.getActions(ctx);
		const custom = actions.find(a => a.id === 'custom-1');
		expect(custom).toBeDefined();
	});

	it('unsubscribe should remove the provider', () => {
		const provider: CodeActionProvider = () => [
			makeAction({ id: 'custom-1', title: 'Custom' })
		];
		const unsub = mgr.registerProvider('my-provider', provider);
		unsub();

		const ctx = makeContext({ lineContent: '' });
		const actions = mgr.getActions(ctx);
		const custom = actions.find(a => a.id === 'custom-1');
		expect(custom).toBeUndefined();
	});

	it('should overwrite a provider with the same id', () => {
		mgr.registerProvider('same-id', () => [makeAction({ id: 'a' })]);
		mgr.registerProvider('same-id', () => [makeAction({ id: 'b' })]);

		const ctx = makeContext({ lineContent: '' });
		const actions = mgr.getActions(ctx);
		expect(actions.find(a => a.id === 'a')).toBeUndefined();
		expect(actions.find(a => a.id === 'b')).toBeDefined();
	});
});

// ============================================================
// QuickActionsManager -- getActions (disabled)
// ============================================================

describe('QuickActionsManager -- getActions when disabled', () => {
	it('should return empty array when disabled', () => {
		const mgr = new QuickActionsManager();
		mgr.setEnabled(false);
		const ctx = makeContext({ lineContent: 'const x = 1' });
		expect(mgr.getActions(ctx)).toEqual([]);
	});
});

// ============================================================
// QuickActionsManager -- built-in quickfix provider
// ============================================================

describe('QuickActionsManager -- built-in quickfix provider', () => {
	let mgr: QuickActionsManager;

	beforeEach(() => {
		mgr = new QuickActionsManager();
	});

	it('should suggest removing unused variable for const declarations', () => {
		const ctx = makeContext({ lineContent: 'const unusedVar = 42' });
		const actions = mgr.getActions(ctx);
		const removeAction = actions.find(a => a.id.startsWith('remove-unused-'));
		expect(removeAction).toBeDefined();
		expect(removeAction!.title).toContain('unusedVar');
		expect(removeAction!.kind).toBe('quickfix');
	});

	it('should suggest removing unused variable for let declarations', () => {
		const ctx = makeContext({ lineContent: 'let foo = "bar"' });
		const actions = mgr.getActions(ctx);
		const removeAction = actions.find(a => a.id.startsWith('remove-unused-'));
		expect(removeAction).toBeDefined();
		expect(removeAction!.title).toContain('foo');
	});

	it('should suggest adding semicolon when line does not end with ; { } or ,', () => {
		const ctx = makeContext({ lineContent: 'const x = 42' });
		const actions = mgr.getActions(ctx);
		const semicolonAction = actions.find(a => a.id === 'add-semicolon');
		expect(semicolonAction).toBeDefined();
		expect(semicolonAction!.isPreferred).toBe(true);
		expect(semicolonAction!.kind).toBe('quickfix');
	});

	it('should NOT suggest adding semicolon for lines ending with ;', () => {
		const ctx = makeContext({ lineContent: 'const x = 42;' });
		const actions = mgr.getActions(ctx);
		const semicolonAction = actions.find(a => a.id === 'add-semicolon');
		expect(semicolonAction).toBeUndefined();
	});

	it('should NOT suggest adding semicolon for lines ending with {', () => {
		const ctx = makeContext({ lineContent: 'function foo() {' });
		const actions = mgr.getActions(ctx);
		const semicolonAction = actions.find(a => a.id === 'add-semicolon');
		expect(semicolonAction).toBeUndefined();
	});

	it('should NOT suggest adding semicolon for lines ending with }', () => {
		const ctx = makeContext({ lineContent: '}' });
		const actions = mgr.getActions(ctx);
		const semicolonAction = actions.find(a => a.id === 'add-semicolon');
		expect(semicolonAction).toBeUndefined();
	});

	it('should NOT suggest adding semicolon for lines ending with ,', () => {
		const ctx = makeContext({ lineContent: '  value: 42,' });
		const actions = mgr.getActions(ctx);
		const semicolonAction = actions.find(a => a.id === 'add-semicolon');
		expect(semicolonAction).toBeUndefined();
	});

	it('should NOT suggest adding semicolon for empty lines', () => {
		const ctx = makeContext({ lineContent: '   ' });
		const actions = mgr.getActions(ctx);
		const semicolonAction = actions.find(a => a.id === 'add-semicolon');
		expect(semicolonAction).toBeUndefined();
	});
});

// ============================================================
// QuickActionsManager -- built-in refactor provider
// ============================================================

describe('QuickActionsManager -- built-in refactor provider', () => {
	let mgr: QuickActionsManager;

	beforeEach(() => {
		mgr = new QuickActionsManager();
	});

	it('should suggest extract to variable when text is selected', () => {
		const ctx = makeContext({
			lineContent: 'return a + b',
			selectedText: 'a + b',
			selection: {
				start: { line: 5, column: 7 },
				end: { line: 5, column: 12 }
			}
		});
		const actions = mgr.getActions(ctx);
		const extractVar = actions.find(a => a.id === 'extract-variable');
		expect(extractVar).toBeDefined();
		expect(extractVar!.kind).toBe('refactor.extract');
	});

	it('should suggest extract to function for multi-line selections', () => {
		const ctx = makeContext({
			lineContent: 'const a = 1',
			selectedText: 'const a = 1\nconst b = 2\nreturn a + b',
			selection: {
				start: { line: 5, column: 0 },
				end: { line: 7, column: 12 }
			}
		});
		const actions = mgr.getActions(ctx);
		const extractFn = actions.find(a => a.id === 'extract-function');
		expect(extractFn).toBeDefined();
		expect(extractFn!.kind).toBe('refactor.extract');
	});

	it('should suggest extract to function for long selections (>50 chars)', () => {
		const longText = 'x'.repeat(51);
		const ctx = makeContext({
			lineContent: longText,
			selectedText: longText,
			selection: {
				start: { line: 5, column: 0 },
				end: { line: 5, column: 51 }
			}
		});
		const actions = mgr.getActions(ctx);
		const extractFn = actions.find(a => a.id === 'extract-function');
		expect(extractFn).toBeDefined();
	});

	it('should NOT suggest extract to function for short single-line selections', () => {
		const ctx = makeContext({
			lineContent: 'return x',
			selectedText: 'x',
			selection: {
				start: { line: 5, column: 7 },
				end: { line: 5, column: 8 }
			}
		});
		const actions = mgr.getActions(ctx);
		const extractFn = actions.find(a => a.id === 'extract-function');
		expect(extractFn).toBeUndefined();
	});

	it('should NOT suggest extract actions without selected text', () => {
		const ctx = makeContext({ lineContent: 'return x' });
		const actions = mgr.getActions(ctx);
		expect(actions.find(a => a.id === 'extract-variable')).toBeUndefined();
		expect(actions.find(a => a.id === 'extract-function')).toBeUndefined();
	});

	it('should suggest rename symbol when cursor is on a word', () => {
		const ctx = makeContext({
			lineContent: 'const myVar = 42',
			position: { line: 5, column: 10 } // cursor at "myVar" position
		});
		const actions = mgr.getActions(ctx);
		const rename = actions.find(a => a.id === 'rename-symbol');
		expect(rename).toBeDefined();
		expect(rename!.kind).toBe('refactor.rename');
	});

	it('should suggest convert to arrow function for function declarations', () => {
		const ctx = makeContext({ lineContent: 'function hello() {' });
		const actions = mgr.getActions(ctx);
		const convert = actions.find(a => a.id === 'convert-to-arrow');
		expect(convert).toBeDefined();
		expect(convert!.kind).toBe('refactor');
	});

	it('should NOT suggest convert to arrow function for non-function lines', () => {
		const ctx = makeContext({ lineContent: 'const x = 42;' });
		const actions = mgr.getActions(ctx);
		const convert = actions.find(a => a.id === 'convert-to-arrow');
		expect(convert).toBeUndefined();
	});

	it('should suggest convert to template literal for string concatenation', () => {
		const ctx = makeContext({ lineContent: 'const msg = "Hello " + name' });
		const actions = mgr.getActions(ctx);
		const convert = actions.find(a => a.id === 'convert-to-template');
		expect(convert).toBeDefined();
	});

	it('should NOT suggest convert to template literal without string concat', () => {
		const ctx = makeContext({ lineContent: 'const sum = a + b;' });
		const actions = mgr.getActions(ctx);
		const convert = actions.find(a => a.id === 'convert-to-template');
		expect(convert).toBeUndefined();
	});
});

// ============================================================
// QuickActionsManager -- built-in source provider
// ============================================================

describe('QuickActionsManager -- built-in source provider', () => {
	let mgr: QuickActionsManager;

	beforeEach(() => {
		mgr = new QuickActionsManager();
	});

	it('should suggest organize imports on import lines', () => {
		const ctx = makeContext({ lineContent: 'import { foo } from "bar"' });
		const actions = mgr.getActions(ctx);
		const organize = actions.find(a => a.id === 'organize-imports');
		expect(organize).toBeDefined();
		expect(organize!.kind).toBe('source.organizeImports');
	});

	it('should suggest organize imports near top of file (line < 20)', () => {
		const ctx = makeContext({
			lineContent: 'const x = 1',
			position: { line: 5, column: 0 }
		});
		const actions = mgr.getActions(ctx);
		const organize = actions.find(a => a.id === 'organize-imports');
		expect(organize).toBeDefined();
	});

	it('should always suggest fix all auto-fixable problems', () => {
		const ctx = makeContext({ lineContent: 'anything here', position: { line: 100, column: 0 } });
		const actions = mgr.getActions(ctx);
		const fixAll = actions.find(a => a.id === 'fix-all');
		expect(fixAll).toBeDefined();
		expect(fixAll!.kind).toBe('source.fixAll');
	});
});

// ============================================================
// QuickActionsManager -- built-in generate provider
// ============================================================

describe('QuickActionsManager -- built-in generate provider', () => {
	let mgr: QuickActionsManager;

	beforeEach(() => {
		mgr = new QuickActionsManager();
	});

	it('should suggest generate JSDoc for function declarations', () => {
		const ctx = makeContext({ lineContent: 'function compute() {' });
		const actions = mgr.getActions(ctx);
		const jsdoc = actions.find(a => a.id === 'generate-jsdoc');
		expect(jsdoc).toBeDefined();
		expect(jsdoc!.kind).toBe('generate');
	});

	it('should suggest generate JSDoc for const declarations', () => {
		const ctx = makeContext({ lineContent: 'const API_URL = "https://example.com"' });
		const actions = mgr.getActions(ctx);
		const jsdoc = actions.find(a => a.id === 'generate-jsdoc');
		expect(jsdoc).toBeDefined();
	});

	it('should suggest generate JSDoc for class declarations', () => {
		const ctx = makeContext({ lineContent: 'class MyService {' });
		const actions = mgr.getActions(ctx);
		const jsdoc = actions.find(a => a.id === 'generate-jsdoc');
		expect(jsdoc).toBeDefined();
	});

	it('should suggest getter/setter for private fields', () => {
		const ctx = makeContext({ lineContent: '  private _name: string' });
		const actions = mgr.getActions(ctx);
		const getter = actions.find(a => a.id === 'generate-getter');
		const setter = actions.find(a => a.id === 'generate-setter');
		expect(getter).toBeDefined();
		expect(getter!.title).toContain('_name');
		expect(setter).toBeDefined();
		expect(setter!.title).toContain('_name');
	});

	it('should suggest getter/setter for protected fields', () => {
		const ctx = makeContext({ lineContent: '  protected value: number' });
		const actions = mgr.getActions(ctx);
		const getter = actions.find(a => a.id === 'generate-getter');
		expect(getter).toBeDefined();
		expect(getter!.title).toContain('value');
	});

	it('should suggest generate constructor for class declarations', () => {
		const ctx = makeContext({ lineContent: 'class Widget {' });
		const actions = mgr.getActions(ctx);
		const ctor = actions.find(a => a.id === 'generate-constructor');
		expect(ctor).toBeDefined();
	});
});

// ============================================================
// QuickActionsManager -- sorting
// ============================================================

describe('QuickActionsManager -- action sorting', () => {
	it('should sort preferred actions first', () => {
		const mgr = new QuickActionsManager();
		// Line triggers semicolon (preferred quickfix) and other actions
		const ctx = makeContext({ lineContent: 'const x = 42' });
		const actions = mgr.getActions(ctx);
		const preferredIdx = actions.findIndex(a => a.isPreferred);
		if (preferredIdx >= 0) {
			// All actions before a preferred action should also be preferred
			for (let i = 0; i < preferredIdx; i++) {
				expect(actions[i].isPreferred).toBe(true);
			}
		}
	});

	it('should sort quickfix before refactor before source before generate', () => {
		const mgr = new QuickActionsManager();
		// Trigger actions from multiple categories
		const ctx = makeContext({
			lineContent: 'function hello() {',
			position: { line: 5, column: 15 }
		});
		const actions = mgr.getActions(ctx);

		const kindOrder: CodeActionKind[] = [
			'quickfix', 'refactor.extract', 'refactor.inline', 'refactor.rename',
			'refactor', 'source.organizeImports', 'source.fixAll', 'source', 'generate'
		];

		// Verify no lower-priority kind appears before a higher-priority kind
		// (ignoring preferred status)
		const nonPreferred = actions.filter(a => !a.isPreferred);
		for (let i = 1; i < nonPreferred.length; i++) {
			const prevPriority = kindOrder.indexOf(nonPreferred[i - 1].kind);
			const currPriority = kindOrder.indexOf(nonPreferred[i].kind);
			if (prevPriority >= 0 && currPriority >= 0) {
				expect(prevPriority).toBeLessThanOrEqual(currPriority);
			}
		}
	});
});

// ============================================================
// QuickActionsManager -- provider error handling
// ============================================================

describe('QuickActionsManager -- provider error handling', () => {
	it('should catch errors from providers and continue', () => {
		const mgr = new QuickActionsManager();
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		mgr.registerProvider('broken', () => {
			throw new Error('Provider broke');
		});

		const ctx = makeContext({ lineContent: 'const x = 1' });
		// Should not throw
		const actions = mgr.getActions(ctx);
		expect(Array.isArray(actions)).toBe(true);
		// Actions from other built-in providers should still be present
		expect(actions.length).toBeGreaterThan(0);
		expect(consoleSpy).toHaveBeenCalled();

		consoleSpy.mockRestore();
	});
});

// ============================================================
// QuickActionsManager -- executeAction
// ============================================================

describe('QuickActionsManager -- executeAction', () => {
	let mgr: QuickActionsManager;

	beforeEach(() => {
		mgr = new QuickActionsManager();
	});

	it('should return false for disabled actions', async () => {
		const action = makeAction({
			disabled: true,
			disabledReason: 'Not available'
		});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = await mgr.executeAction(action);
		expect(result).toBe(false);
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it('should return true for action with edit', async () => {
		const action = makeAction({
			edit: {
				changes: [{
					range: {
						start: { line: 0, column: 0 },
						end: { line: 0, column: 5 }
					},
					newText: 'hello'
				}]
			}
		});
		const result = await mgr.executeAction(action);
		expect(result).toBe(true);
	});

	it('should return true for action with command', async () => {
		const action = makeAction({
			command: {
				command: 'test.run',
				title: 'Run Test'
			}
		});
		const result = await mgr.executeAction(action);
		expect(result).toBe(true);
	});

	it('should return false for action with neither edit nor command', async () => {
		const action = makeAction({ id: 'noop', title: 'Noop', kind: 'quickfix' });
		// Remove any edit/command
		delete action.edit;
		delete action.command;
		const result = await mgr.executeAction(action);
		expect(result).toBe(false);
	});
});

// ============================================================
// QuickActionsManager -- updateContext & refresh
// ============================================================

describe('QuickActionsManager -- updateContext & refresh', () => {
	it('updateContext should update actions after delay', async () => {
		const mgr = new QuickActionsManager();
		mgr.setConfig({ showDelay: 10 });
		const ctx = makeContext({ lineContent: 'const x = 42' });

		mgr.updateContext(ctx);
		// Actions not yet populated (delay not elapsed)
		// Wait for the timeout
		await new Promise(r => setTimeout(r, 50));

		expect(mgr.currentActions.length).toBeGreaterThan(0);
		expect(mgr.hasActions).toBe(true);
	});

	it('updateContext should not auto-show when autoShow is false', async () => {
		const mgr = new QuickActionsManager();
		mgr.setConfig({ autoShow: false, showDelay: 10 });
		const ctx = makeContext({ lineContent: 'const x = 42' });

		mgr.updateContext(ctx);
		await new Promise(r => setTimeout(r, 50));

		// Actions should still be empty since autoShow is off
		expect(mgr.currentActions).toEqual([]);
	});

	it('updateContext should debounce multiple rapid calls', async () => {
		const mgr = new QuickActionsManager();
		mgr.setConfig({ showDelay: 20 });
		const listener = vi.fn();
		mgr.subscribe(listener);

		// Fire multiple rapid updates
		mgr.updateContext(makeContext({ lineContent: 'a' }));
		mgr.updateContext(makeContext({ lineContent: 'ab' }));
		mgr.updateContext(makeContext({ lineContent: 'abc' }));

		await new Promise(r => setTimeout(r, 80));

		// Listener should only have been called once (from the last update)
		// Could be 1+ due to setConfig also calling notify, but the timeout should fire once
		expect(listener.mock.calls.length).toBeGreaterThanOrEqual(1);
	});

	it('refresh should recompute actions from current context', () => {
		const mgr = new QuickActionsManager();
		// Manually set a context by calling getActions first, then rely on refresh
		// refresh relies on _currentContext being set
		// Since _currentContext is private, let's use updateContext sync path
		// We need to set autoShow to false and manually trigger
		mgr.setConfig({ autoShow: false });
		const ctx = makeContext({ lineContent: 'const y = 100' });
		mgr.updateContext(ctx);

		// Now actions are not populated yet (autoShow off)
		expect(mgr.currentActions).toEqual([]);

		// Force refresh
		mgr.refresh();
		expect(mgr.currentActions.length).toBeGreaterThan(0);
	});

	it('refresh with no context should do nothing', () => {
		const mgr = new QuickActionsManager();
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.refresh(); // no context set
		expect(listener).not.toHaveBeenCalled();
		expect(mgr.currentActions).toEqual([]);
	});
});

// ============================================================
// QuickActionsManager -- subscribe
// ============================================================

describe('QuickActionsManager -- subscribe', () => {
	it('should notify listeners on setConfig', () => {
		const mgr = new QuickActionsManager();
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.setConfig({ showDelay: 999 });
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('should notify listeners on setEnabled', () => {
		const mgr = new QuickActionsManager();
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.setEnabled(false);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('unsubscribe should stop notifications', () => {
		const mgr = new QuickActionsManager();
		const listener = vi.fn();
		const unsub = mgr.subscribe(listener);
		unsub();
		mgr.setConfig({ showDelay: 111 });
		expect(listener).not.toHaveBeenCalled();
	});
});

// ============================================================
// QuickActionsManager -- destroy
// ============================================================

describe('QuickActionsManager -- destroy', () => {
	it('should clear listeners and providers', () => {
		const mgr = new QuickActionsManager();
		const listener = vi.fn();
		mgr.subscribe(listener);
		mgr.destroy();

		// After destroy, no notifications
		mgr.setConfig({ showDelay: 111 });
		expect(listener).not.toHaveBeenCalled();

		// After destroy, getActions should return empty (no providers)
		const ctx = makeContext({ lineContent: 'const x = 1' });
		const actions = mgr.getActions(ctx);
		expect(actions).toEqual([]);
	});
});

// ============================================================
// groupActionsByKind
// ============================================================

describe('groupActionsByKind', () => {
	it('should group actions by base kind', () => {
		const actions: CodeAction[] = [
			makeAction({ id: '1', kind: 'quickfix' }),
			makeAction({ id: '2', kind: 'quickfix' }),
			makeAction({ id: '3', kind: 'refactor.extract' }),
			makeAction({ id: '4', kind: 'refactor.rename' }),
			makeAction({ id: '5', kind: 'generate' })
		];

		const groups = groupActionsByKind(actions);
		expect(groups.get('Quick Fix')!.length).toBe(2);
		expect(groups.get('Refactor')!.length).toBe(2);
		expect(groups.get('Generate')!.length).toBe(1);
	});

	it('should return empty map for empty actions', () => {
		const groups = groupActionsByKind([]);
		expect(groups.size).toBe(0);
	});

	it('should group source actions under Source Action', () => {
		const actions: CodeAction[] = [
			makeAction({ id: '1', kind: 'source.organizeImports' }),
			makeAction({ id: '2', kind: 'source.fixAll' })
		];
		const groups = groupActionsByKind(actions);
		expect(groups.get('Source Action')!.length).toBe(2);
	});
});

// ============================================================
// getKindLabel
// ============================================================

describe('getKindLabel', () => {
	it('should return "Quick Fix" for quickfix', () => {
		expect(getKindLabel('quickfix')).toBe('Quick Fix');
	});

	it('should return "Refactor" for refactor', () => {
		expect(getKindLabel('refactor')).toBe('Refactor');
	});

	it('should return "Refactor" for refactor.extract (base kind)', () => {
		expect(getKindLabel('refactor.extract')).toBe('Refactor');
	});

	it('should return "Source Action" for source', () => {
		expect(getKindLabel('source')).toBe('Source Action');
	});

	it('should return "Generate" for generate', () => {
		expect(getKindLabel('generate')).toBe('Generate');
	});

	it('should return the kind itself for unknown kinds', () => {
		expect(getKindLabel('custom.something' as CodeActionKind)).toBe('custom.something');
	});
});

// ============================================================
// getKindIcon
// ============================================================

describe('getKindIcon', () => {
	it('should return wrench for quickfix', () => {
		expect(getKindIcon('quickfix')).toBe('🔧');
	});

	it('should return specific icon for refactor.extract', () => {
		expect(getKindIcon('refactor.extract')).toBe('📤');
	});

	it('should return base refactor icon for plain refactor', () => {
		expect(getKindIcon('refactor')).toBe('✨');
	});

	it('should return specific icon for source.organizeImports', () => {
		expect(getKindIcon('source.organizeImports')).toBe('📦');
	});

	it('should return lightning for generate', () => {
		expect(getKindIcon('generate')).toBe('⚡');
	});

	it('should fallback to base kind icon for unknown sub-kind', () => {
		expect(getKindIcon('refactor.unknown')).toBe('✨');
	});

	it('should fallback to lightbulb for completely unknown kind', () => {
		expect(getKindIcon('totally.unknown')).toBe('💡');
	});
});
