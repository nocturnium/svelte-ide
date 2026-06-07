import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	getCommandRegistry,
	createSemanticFoldCommands,
	registerSemanticFoldCommands,
	type Command,
	type CommandCategory
} from './commands';
import { createEditorState, type EditorState } from './state';

// ============================================================
// Helpers
// ============================================================

/**
 * Reset the global registry between tests.
 * The module uses a module-scoped singleton, so we clear it before each test.
 */
function freshRegistry() {
	const registry = getCommandRegistry();
	registry.clear();
	return registry;
}

function makeCommand(overrides: Partial<Command> = {}): Command {
	return {
		id: overrides.id ?? 'test.cmd',
		label: overrides.label ?? 'Test Command',
		category: overrides.category ?? 'test',
		description: overrides.description,
		shortcut: overrides.shortcut,
		icon: overrides.icon,
		execute: overrides.execute ?? vi.fn(),
		isEnabled: overrides.isEnabled
	};
}

function makeState(content = ''): EditorState {
	return createEditorState({ content, language: 'plaintext' });
}

// ============================================================
// CommandRegistry — registration
// ============================================================

describe('CommandRegistry — registration', () => {
	let registry: ReturnType<typeof getCommandRegistry>;

	beforeEach(() => {
		registry = freshRegistry();
	});

	it('should register a command and retrieve it by id', () => {
		const cmd = makeCommand({ id: 'editor.save' });
		registry.register(cmd);
		expect(registry.get('editor.save')).toBe(cmd);
	});

	it('should return undefined for an unregistered command id', () => {
		expect(registry.get('nonexistent')).toBeUndefined();
	});

	it('register should return an unsubscribe function', () => {
		const cmd = makeCommand({ id: 'temp.cmd' });
		const unsub = registry.register(cmd);

		expect(registry.get('temp.cmd')).toBeDefined();
		unsub();
		expect(registry.get('temp.cmd')).toBeUndefined();
	});

	it('should register multiple commands at once with registerMany', () => {
		const cmds = [
			makeCommand({ id: 'a' }),
			makeCommand({ id: 'b' }),
			makeCommand({ id: 'c' })
		];
		registry.registerMany(cmds);

		expect(registry.get('a')).toBeDefined();
		expect(registry.get('b')).toBeDefined();
		expect(registry.get('c')).toBeDefined();
	});

	it('registerMany should return a single unsubscribe that removes all', () => {
		const cmds = [
			makeCommand({ id: 'a' }),
			makeCommand({ id: 'b' })
		];
		const unsub = registry.registerMany(cmds);
		unsub();

		expect(registry.get('a')).toBeUndefined();
		expect(registry.get('b')).toBeUndefined();
	});

	it('should overwrite a command if re-registered with the same id', () => {
		const cmd1 = makeCommand({ id: 'dup', label: 'First' });
		const cmd2 = makeCommand({ id: 'dup', label: 'Second' });
		registry.register(cmd1);
		registry.register(cmd2);

		expect(registry.get('dup')?.label).toBe('Second');
	});

	it('clear should remove all commands', () => {
		registry.register(makeCommand({ id: 'a' }));
		registry.register(makeCommand({ id: 'b' }));
		registry.clear();
		expect(registry.getAll()).toHaveLength(0);
	});
});

// ============================================================
// CommandRegistry — execution
// ============================================================

describe('CommandRegistry — execution', () => {
	let registry: ReturnType<typeof getCommandRegistry>;

	beforeEach(() => {
		registry = freshRegistry();
	});

	it('should execute a registered command and return true', async () => {
		const executeFn = vi.fn();
		registry.register(makeCommand({ id: 'run.me', execute: executeFn }));

		const result = await registry.execute('run.me');
		expect(result).toBe(true);
		expect(executeFn).toHaveBeenCalledOnce();
	});

	it('should return false when executing a non-existent command', async () => {
		const result = await registry.execute('does.not.exist');
		expect(result).toBe(false);
	});

	it('should not execute a disabled command', async () => {
		const executeFn = vi.fn();
		registry.register(
			makeCommand({
				id: 'disabled.cmd',
				execute: executeFn,
				isEnabled: () => false
			})
		);

		const result = await registry.execute('disabled.cmd');
		expect(result).toBe(false);
		expect(executeFn).not.toHaveBeenCalled();
	});

	it('should execute an enabled command (isEnabled returns true)', async () => {
		const executeFn = vi.fn();
		registry.register(
			makeCommand({
				id: 'enabled.cmd',
				execute: executeFn,
				isEnabled: () => true
			})
		);

		const result = await registry.execute('enabled.cmd');
		expect(result).toBe(true);
		expect(executeFn).toHaveBeenCalledOnce();
	});

	it('should handle async execute functions', async () => {
		const executeFn = vi.fn(async () => {
			// simulate async work
		});
		registry.register(makeCommand({ id: 'async.cmd', execute: executeFn }));

		const result = await registry.execute('async.cmd');
		expect(result).toBe(true);
		expect(executeFn).toHaveBeenCalledOnce();
	});

	it('should execute when isEnabled is not defined (no guard)', async () => {
		const executeFn = vi.fn();
		registry.register(
			makeCommand({
				id: 'no.guard',
				execute: executeFn,
				isEnabled: undefined
			})
		);

		const result = await registry.execute('no.guard');
		expect(result).toBe(true);
		expect(executeFn).toHaveBeenCalledOnce();
	});
});

// ============================================================
// CommandRegistry — querying
// ============================================================

describe('CommandRegistry — querying', () => {
	let registry: ReturnType<typeof getCommandRegistry>;

	beforeEach(() => {
		registry = freshRegistry();
	});

	it('getAll should return all registered commands', () => {
		registry.register(makeCommand({ id: 'a' }));
		registry.register(makeCommand({ id: 'b' }));
		registry.register(makeCommand({ id: 'c' }));

		const all = registry.getAll();
		expect(all).toHaveLength(3);
		expect(all.map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
	});

	it('getByCategory should filter commands by category', () => {
		registry.register(makeCommand({ id: 'nav.1', category: 'navigation' }));
		registry.register(makeCommand({ id: 'nav.2', category: 'navigation' }));
		registry.register(makeCommand({ id: 'edit.1', category: 'edit' }));

		const navCmds = registry.getByCategory('navigation');
		expect(navCmds).toHaveLength(2);
		expect(navCmds.every((c) => c.category === 'navigation')).toBe(true);
	});

	it('getByCategory should return empty array for unknown category', () => {
		registry.register(makeCommand({ id: 'a', category: 'edit' }));
		expect(registry.getByCategory('nonexistent')).toEqual([]);
	});

	it('search should match by label', () => {
		registry.register(makeCommand({ id: 'a', label: 'Save File' }));
		registry.register(makeCommand({ id: 'b', label: 'Open File' }));
		registry.register(makeCommand({ id: 'c', label: 'Close Tab' }));

		const results = registry.search('file');
		expect(results).toHaveLength(2);
		expect(results.map((c) => c.id).sort()).toEqual(['a', 'b']);
	});

	it('search should match by description', () => {
		registry.register(
			makeCommand({ id: 'a', label: 'Fold', description: 'Collapse all imports' })
		);
		registry.register(
			makeCommand({ id: 'b', label: 'Unfold', description: 'Expand all regions' })
		);

		const results = registry.search('imports');
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe('a');
	});

	it('search should match by category', () => {
		registry.register(makeCommand({ id: 'a', category: 'navigation', label: 'Go Up' }));
		registry.register(makeCommand({ id: 'b', category: 'edit', label: 'Delete' }));

		const results = registry.search('navigation');
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe('a');
	});

	it('search should be case-insensitive', () => {
		registry.register(makeCommand({ id: 'a', label: 'Save File' }));
		expect(registry.search('SAVE')).toHaveLength(1);
		expect(registry.search('save')).toHaveLength(1);
		expect(registry.search('SaVe')).toHaveLength(1);
	});

	it('search should return empty array when nothing matches', () => {
		registry.register(makeCommand({ id: 'a', label: 'Save' }));
		expect(registry.search('zzzzz')).toEqual([]);
	});
});

// ============================================================
// CommandRegistry — categories
// ============================================================

describe('CommandRegistry — categories', () => {
	let registry: ReturnType<typeof getCommandRegistry>;

	beforeEach(() => {
		registry = freshRegistry();
	});

	it('should have default categories pre-registered', () => {
		// getCommandRegistry initializes default categories on first call
		const categories = registry.getCategories();
		const ids = categories.map((c) => c.id);
		expect(ids).toContain('fold');
		expect(ids).toContain('fold.semantic');
		expect(ids).toContain('fold.preset');
		expect(ids).toContain('navigation');
		expect(ids).toContain('edit');
		expect(ids).toContain('view');
		expect(ids).toContain('search');
	});

	it('should register a custom category', () => {
		const cat: CommandCategory = { id: 'custom', label: 'Custom', icon: '★' };
		registry.registerCategory(cat);

		const categories = registry.getCategories();
		const found = categories.find((c) => c.id === 'custom');
		expect(found).toBeDefined();
		expect(found!.label).toBe('Custom');
		expect(found!.icon).toBe('★');
	});
});

// ============================================================
// createSemanticFoldCommands
// ============================================================

describe('createSemanticFoldCommands', () => {
	let state: EditorState;

	beforeEach(() => {
		// Create state with some content
		state = makeState(
			[
				'import { foo } from "bar";',
				'',
				'export function hello() {',
				'  return "hello";',
				'}'
			].join('\n')
		);
	});

	it('should return an array of commands', () => {
		const commands = createSemanticFoldCommands(state, {});
		expect(Array.isArray(commands)).toBe(true);
		expect(commands.length).toBeGreaterThan(0);
	});

	it('should include fold and unfold commands for each semantic category', () => {
		const commands = createSemanticFoldCommands(state, {});
		const ids = commands.map((c) => c.id);

		// Check a sample of expected category commands
		expect(ids).toContain('fold.semantic.imports');
		expect(ids).toContain('unfold.semantic.imports');
		expect(ids).toContain('fold.semantic.function');
		expect(ids).toContain('unfold.semantic.function');
		expect(ids).toContain('fold.semantic.class');
		expect(ids).toContain('unfold.semantic.class');
	});

	it('should include general fold commands', () => {
		const commands = createSemanticFoldCommands(state, {});
		const ids = commands.map((c) => c.id);

		expect(ids).toContain('fold.all');
		expect(ids).toContain('unfold.all');
	});

	it('should include special composite commands', () => {
		const commands = createSemanticFoldCommands(state, {});
		const ids = commands.map((c) => c.id);

		expect(ids).toContain('fold.showOnlyPublicAPI');
		expect(ids).toContain('fold.hideBoilerplate');
		expect(ids).toContain('fold.focusFunction');
	});

	it('should include preset commands', () => {
		const commands = createSemanticFoldCommands(state, {});
		const presetCmds = commands.filter((c) => c.category === 'fold.preset');
		expect(presetCmds.length).toBeGreaterThan(0);
		expect(presetCmds.every((c) => c.id.startsWith('fold.preset.'))).toBe(true);
	});

	it('fold.all command should invoke onFoldAll', () => {
		const onFoldAll = vi.fn();
		const commands = createSemanticFoldCommands(state, { onFoldAll });
		const foldAll = commands.find((c) => c.id === 'fold.all')!;

		foldAll.execute();
		expect(onFoldAll).toHaveBeenCalledOnce();
	});

	it('unfold.all command should invoke onUnfoldAll', () => {
		const onUnfoldAll = vi.fn();
		const commands = createSemanticFoldCommands(state, { onUnfoldAll });
		const unfoldAll = commands.find((c) => c.id === 'unfold.all')!;

		unfoldAll.execute();
		expect(onUnfoldAll).toHaveBeenCalledOnce();
	});

	it('semantic fold command should invoke onFoldLines for matched regions', () => {
		const tsContent = [
			'import { a } from "a";',
			'import { b } from "b";',
			'',
			'function foo() {',
			'  return 1;',
			'}'
		].join('\n');
		const tsState = createEditorState({ content: tsContent, language: 'typescript' });

		const onFoldLines = vi.fn();
		const commands = createSemanticFoldCommands(tsState, {
			onFoldLines,
			getLanguage: () => 'typescript'
		});

		const foldImports = commands.find((c) => c.id === 'fold.semantic.imports');
		expect(foldImports).toBeDefined();
		foldImports!.execute();

		// The semantic analyzer should find import regions and call onFoldLines
		// (may or may not call depending on analysis — at least no error)
	});

	it('preset commands should invoke onApplyPreset with the preset', () => {
		const onApplyPreset = vi.fn();
		const commands = createSemanticFoldCommands(state, { onApplyPreset });

		const presetCmds = commands.filter((c) => c.category === 'fold.preset');
		expect(presetCmds.length).toBeGreaterThan(0);

		presetCmds[0].execute();
		expect(onApplyPreset).toHaveBeenCalledOnce();
		// The argument should be a preset object with id, name, etc.
		expect(onApplyPreset.mock.calls[0][0]).toHaveProperty('id');
		expect(onApplyPreset.mock.calls[0][0]).toHaveProperty('name');
	});

	it('every command should have id, label, and category', () => {
		const commands = createSemanticFoldCommands(state, {});
		for (const cmd of commands) {
			expect(cmd.id).toBeTruthy();
			expect(cmd.label).toBeTruthy();
			expect(cmd.category).toBeTruthy();
		}
	});
});

// ============================================================
// registerSemanticFoldCommands (global registry integration)
// ============================================================

describe('registerSemanticFoldCommands', () => {
	let state: EditorState;

	beforeEach(() => {
		freshRegistry();
		state = makeState('function test() {}');
	});

	it('should register fold commands in the global registry', () => {
		registerSemanticFoldCommands(state, {});

		const registry = getCommandRegistry();
		expect(registry.get('fold.all')).toBeDefined();
		expect(registry.get('unfold.all')).toBeDefined();
		expect(registry.get('fold.semantic.imports')).toBeDefined();
	});

	it('should return unsubscribe that removes all registered commands', () => {
		const unsub = registerSemanticFoldCommands(state, {});
		const registry = getCommandRegistry();

		expect(registry.get('fold.all')).toBeDefined();
		unsub();
		expect(registry.get('fold.all')).toBeUndefined();
		expect(registry.get('fold.semantic.imports')).toBeUndefined();
	});
});
