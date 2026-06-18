<script lang="ts">
	/**
	 * Editor Intelligence Features Demo
	 *
	 * Demonstrates Minimap, Breadcrumbs, Quick Actions, Symbol Outline, and overlay intelligence.
	 */

	import { onMount } from 'svelte';
	import Minimap from '$lib/components/editor/Minimap.svelte';
	import Breadcrumbs, { type BreadcrumbSymbol } from '$lib/components/editor/Breadcrumbs.svelte';
	import QuickActionsMenu from '$lib/components/editor/QuickActionsMenu.svelte';
	import SymbolOutline, { type DocumentSymbol } from '$lib/components/editor/SymbolOutline.svelte';
	import EchoCursorLayer from '$lib/components/editor/EchoCursorLayer.svelte';
	import GhostBracketLayer from '$lib/components/editor/GhostBracketLayer.svelte';
	import ContextLens from '$lib/components/editor/ContextLens.svelte';
	import {
		createQuickActionsManager,
		type QuickActionsManager,
		type CodeAction
	} from '$lib/components/editor/core/quick-actions';
	import {
		createEchoCursorManager,
		type EchoCursorManager
	} from '$lib/components/editor/core/echo-cursor';
	import {
		createBracketHealer,
		type BracketHealer
	} from '$lib/components/editor/core/bracket-healer';
	import {
		createEditorState,
		type EditorState,
		type Line,
		type Position
	} from '$lib/components/editor/core/state';

	// Demo state
	let activeDemo = $state<
		'minimap' | 'breadcrumbs' | 'quickactions' | 'outline' | 'echo' | 'ghost' | 'context'
	>('minimap');

	// Sample code for all demos
	const sampleCode = `import { useState, useEffect, useCallback } from 'react';
import { fetchUserData, updateUserProfile } from '../api/users';
import { Logger } from '../utils/logger';
import type { User, UserProfile, ApiResponse } from '../types';

const logger = new Logger('UserManager');

/**
 * User profile management component
 * Handles loading, displaying, and updating user profiles
 */
interface UserManagerProps {
  userId: string;
  onProfileUpdate?: (profile: UserProfile) => void;
  enableNotifications?: boolean;
}

export class UserManager {
  private cache: Map<string, User> = new Map();
  private logger: Logger;

  constructor(private config: { cacheTimeout: number }) {
    this.logger = new Logger('UserManager');
  }

  async getUser(id: string): Promise<User | null> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    try {
      const response = await fetchUserData(id);
      if (response.success) {
        this.cache.set(id, response.data);
        return response.data;
      }
    } catch (error) {
      this.logger.error('Failed to fetch user:', error);
    }

    return null;
  }

  async updateProfile(id: string, updates: Partial<UserProfile>): Promise<boolean> {
    try {
      const response = await updateUserProfile(id, updates);
      if (response.success) {
        const user = this.cache.get(id);
        if (user) {
          this.cache.set(id, { ...user, profile: { ...user.profile, ...updates } });
        }
        return true;
      }
    } catch (error) {
      this.logger.error('Failed to update profile:', error);
    }
    return false;
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }
}

export function useUserProfile(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUserData(userId);
      setUser(data);
      setError(null);
    } catch (err) {
      setError('Failed to load user');
      logger.error('Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return false;

    try {
      await updateUserProfile(user.id, updates);
      setUser({ ...user, profile: { ...user.profile, ...updates } });
      return true;
    } catch (err) {
      logger.error('Update failed:', err);
      return false;
    }
  };

  return { user, loading, error, updateProfile, reload: loadUser };
}

export const DEFAULT_CONFIG = {
  cacheTimeout: 5000,
  maxRetries: 3,
  enableLogging: true
};`;

	const sampleLines = sampleCode.split('\n');
	const lineHeight = 20;
	const charWidth = 7.8;
	const gutterWidth = 50;
	const editorHeight = 400;

	const ghostBracketCode = `export function reconcileProfile(user: User) {
  if (user.profile?.settings) {
    return {
      id: user.id,
      notifications: user.profile.settings.notifications,
      theme: user.profile.settings.theme
  }

  return null;
}`;
	const ghostBracketLines = ghostBracketCode.split('\n');

	const contextLensCode = `interface UserSession {
  userId: string;
  expiresAt: Date;
}

export async function loadSession(userId: string): Promise<UserSession | null> {
  const response = await fetchSession(userId);
  return response.ok ? response.data : null;
}

export const formatSession = (session: UserSession): string => {
  return session.expiresAt.toISOString();
};`;
	const contextLensLines: Line[] = contextLensCode
		.split('\n')
		.map((text, number) => ({ number, text }));
	const contextLensCursorLine = 5;

	// Minimap state
	let minimapScrollTop = $state(0);
	let minimapHighlights = $state<
		Array<{ line: number; type: 'search' | 'error' | 'warning' | 'change' }>
	>([
		{ line: 5, type: 'change' },
		{ line: 6, type: 'change' },
		{ line: 35, type: 'error' },
		{ line: 42, type: 'warning' },
		{ line: 67, type: 'search' },
		{ line: 68, type: 'search' },
		{ line: 69, type: 'search' }
	]);

	// Breadcrumbs state
	let breadcrumbPath = $state<BreadcrumbSymbol[]>([
		{
			id: 'class-usermanager',
			name: 'UserManager',
			type: 'class',
			line: 18,
			siblings: [
				{ id: 'class-usermanager', name: 'UserManager', type: 'class', line: 18 },
				{ id: 'fn-useuserprofile', name: 'useUserProfile', type: 'function', line: 62 }
			]
		},
		{
			id: 'method-getuser',
			name: 'getUser',
			type: 'method',
			line: 24,
			detail: '(id: string): Promise<User | null>',
			siblings: [
				{
					id: 'method-getuser',
					name: 'getUser',
					type: 'method',
					line: 24,
					detail: '(id: string): Promise<User>'
				},
				{
					id: 'method-updateprofile',
					name: 'updateProfile',
					type: 'method',
					line: 41,
					detail: '(id, updates): Promise<boolean>'
				},
				{
					id: 'method-clearcache',
					name: 'clearCache',
					type: 'method',
					line: 56,
					detail: '(): void'
				}
			]
		}
	]);
	let cursorLine = $state(28);

	// Quick Actions state
	let quickActionsManager = $state<QuickActionsManager>(null!);
	let quickActionsEnabled = $state(true);
	let lastAction = $state<string | null>(null);

	// Overlay state
	let echoCursorManager = $state<EchoCursorManager | null>(null);
	let echoEditorState = $state<EditorState | null>(null);
	let echoSourceContent = $state(contextLensCode);
	let bracketHealer = $state<BracketHealer | null>(null);

	// Symbol Outline state
	let symbols = $state<DocumentSymbol[]>([
		{
			id: 'imports',
			name: 'Imports',
			kind: 'module',
			line: 0,
			endLine: 3,
			children: [
				{ id: 'imp-react', name: 'react', kind: 'import', line: 0 },
				{ id: 'imp-users', name: 'users', kind: 'import', line: 1 },
				{ id: 'imp-logger', name: 'Logger', kind: 'import', line: 2 },
				{ id: 'imp-types', name: 'types', kind: 'import', line: 3 }
			]
		},
		{
			id: 'const-logger',
			name: 'logger',
			kind: 'constant',
			line: 5,
			detail: 'Logger'
		},
		{
			id: 'interface-props',
			name: 'UserManagerProps',
			kind: 'interface',
			line: 11,
			endLine: 15,
			children: [
				{ id: 'prop-userid', name: 'userId', kind: 'property', line: 12, detail: 'string' },
				{
					id: 'prop-onupdate',
					name: 'onProfileUpdate',
					kind: 'property',
					line: 13,
					detail: '(profile) => void'
				},
				{
					id: 'prop-notifications',
					name: 'enableNotifications',
					kind: 'property',
					line: 14,
					detail: 'boolean'
				}
			]
		},
		{
			id: 'class-usermanager',
			name: 'UserManager',
			kind: 'class',
			line: 17,
			endLine: 59,
			children: [
				{
					id: 'prop-cache',
					name: 'cache',
					kind: 'property',
					line: 18,
					detail: 'Map<string, User>',
					visibility: 'private'
				},
				{
					id: 'prop-logger',
					name: 'logger',
					kind: 'property',
					line: 19,
					detail: 'Logger',
					visibility: 'private'
				},
				{
					id: 'method-constructor',
					name: 'constructor',
					kind: 'method',
					line: 21,
					detail: '(config)'
				},
				{
					id: 'method-getuser',
					name: 'getUser',
					kind: 'method',
					line: 25,
					endLine: 39,
					detail: '(id): Promise<User | null>'
				},
				{
					id: 'method-updateprofile',
					name: 'updateProfile',
					kind: 'method',
					line: 41,
					endLine: 54,
					detail: '(id, updates): Promise<boolean>'
				},
				{
					id: 'method-clearcache',
					name: 'clearCache',
					kind: 'method',
					line: 56,
					detail: '(): void'
				}
			]
		},
		{
			id: 'fn-useuserprofile',
			name: 'useUserProfile',
			kind: 'function',
			line: 62,
			endLine: 93,
			detail: '(userId: string)',
			children: [
				{ id: 'var-user', name: 'user', kind: 'variable', line: 63, detail: 'User | null' },
				{ id: 'var-loading', name: 'loading', kind: 'variable', line: 64, detail: 'boolean' },
				{ id: 'var-error', name: 'error', kind: 'variable', line: 65, detail: 'string | null' },
				{
					id: 'fn-loaduser',
					name: 'loadUser',
					kind: 'function',
					line: 67,
					detail: 'useCallback async'
				},
				{
					id: 'fn-updateprofile',
					name: 'updateProfile',
					kind: 'function',
					line: 82,
					detail: 'async'
				}
			]
		},
		{
			id: 'const-config',
			name: 'DEFAULT_CONFIG',
			kind: 'constant',
			line: 95,
			detail: '{ cacheTimeout, maxRetries, enableLogging }'
		}
	]);
	let activeSymbolId = $state<string>('method-getuser');
	let outlineSortBy = $state<'position' | 'name' | 'kind'>('position');

	onMount(() => {
		// Initialize quick actions manager
		quickActionsManager = createQuickActionsManager();

		// Set initial context
		quickActionsManager.updateContext({
			position: { line: cursorLine, column: 10 },
			diagnostics: [],
			lineContent: sampleLines[cursorLine] || '',
			language: 'typescript',
			content: sampleCode
		});

		const echoManager = createEchoCursorManager({ defaultDelay: 220 });
		const realEchoEditor = createEditorState({
			content: echoSourceContent,
			language: 'typescript'
		});
		const detachEchoEditor = echoManager.attach(realEchoEditor);
		echoManager.enable();
		echoManager.addEchoPoint({ line: 5, column: 22 }, { delay: 220, label: 'Mirror A' });
		echoManager.addEchoPoint({ line: 10, column: 8 }, { delay: 420, label: 'Mirror B' });
		echoEditorState = realEchoEditor;
		echoCursorManager = echoManager;

		const healer = createBracketHealer({ debounceMs: 0, minConfidence: 0.5, maxGhosts: 4 });
		healer.setLanguage('typescript');
		healer.analyzeImmediate(ghostBracketCode);
		bracketHealer = healer;

		return () => {
			detachEchoEditor();
			quickActionsManager?.destroy();
			healer.destroy();
		};
	});

	function handleMinimapNavigate(line: number) {
		minimapScrollTop = line;
		cursorLine = line;
	}

	function handleBreadcrumbNavigate(symbol: BreadcrumbSymbol) {
		cursorLine = symbol.line;
	}

	function handleQuickActionExecute(action: CodeAction) {
		lastAction = action.title;
		setTimeout(() => (lastAction = null), 2000);
	}

	function handleSymbolNavigate(symbol: DocumentSymbol) {
		cursorLine = symbol.line;
		activeSymbolId = symbol.id;

		// Update breadcrumb path based on selected symbol
		if (symbol.kind === 'class') {
			breadcrumbPath = [{ ...symbol, type: symbol.kind }];
		} else if (symbol.kind === 'method' || symbol.kind === 'function') {
			// Find parent class if exists
			const parentClass = symbols.find(
				(s) => s.kind === 'class' && s.children?.some((c: DocumentSymbol) => c.id === symbol.id)
			);
			if (parentClass) {
				breadcrumbPath = [
					{ ...parentClass, type: 'class' },
					{ ...symbol, type: symbol.kind }
				];
			} else {
				breadcrumbPath = [{ ...symbol, type: symbol.kind }];
			}
		}
	}

	function positionFromIndex(content: string, index: number): Position {
		const lines = content.slice(0, index).split('\n');
		return {
			line: lines.length - 1,
			column: lines[lines.length - 1].length
		};
	}

	function applyEchoSourceContent(nextContent: string) {
		const state = echoEditorState;
		if (!state || nextContent === echoSourceContent) return;

		const previous = echoSourceContent;
		let prefix = 0;
		while (
			prefix < previous.length &&
			prefix < nextContent.length &&
			previous[prefix] === nextContent[prefix]
		) {
			prefix++;
		}

		let suffix = 0;
		while (
			suffix < previous.length - prefix &&
			suffix < nextContent.length - prefix &&
			previous[previous.length - 1 - suffix] === nextContent[nextContent.length - 1 - suffix]
		) {
			suffix++;
		}

		const from = positionFromIndex(previous, prefix);
		const removedEndIndex = previous.length - suffix;
		const insertedText = nextContent.slice(prefix, nextContent.length - suffix);

		if (removedEndIndex > prefix) {
			state.deleteRange(from, positionFromIndex(previous, removedEndIndex));
		}
		if (insertedText) {
			state.insertAt(from, insertedText);
		}

		echoSourceContent = state.getContent();
	}
</script>

<div class="intelligence-demo">
	<header class="demo-header">
		<h1>Editor Intelligence</h1>
		<p>Navigation aids, code actions, and rendered intelligence overlays</p>
	</header>

	<!-- Demo tabs -->
	<div class="demo-tabs" role="tablist" aria-label="Editor intelligence demos">
		<button
			id="tab-minimap"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'minimap'}
			aria-controls="panel-minimap"
			class:active={activeDemo === 'minimap'}
			onclick={() => (activeDemo = 'minimap')}
		>
			Minimap
		</button>
		<button
			id="tab-breadcrumbs"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'breadcrumbs'}
			aria-controls="panel-breadcrumbs"
			class:active={activeDemo === 'breadcrumbs'}
			onclick={() => (activeDemo = 'breadcrumbs')}
		>
			Breadcrumbs
		</button>
		<button
			id="tab-quickactions"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'quickactions'}
			aria-controls="panel-quickactions"
			class:active={activeDemo === 'quickactions'}
			onclick={() => (activeDemo = 'quickactions')}
		>
			Quick Actions
		</button>
		<button
			id="tab-outline"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'outline'}
			aria-controls="panel-outline"
			class:active={activeDemo === 'outline'}
			onclick={() => (activeDemo = 'outline')}
		>
			Symbol Outline
		</button>
		<button
			id="tab-echo"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'echo'}
			aria-controls="panel-echo"
			class:active={activeDemo === 'echo'}
			onclick={() => (activeDemo = 'echo')}
		>
			Echo Cursors
		</button>
		<button
			id="tab-ghost"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'ghost'}
			aria-controls="panel-ghost"
			class:active={activeDemo === 'ghost'}
			onclick={() => (activeDemo = 'ghost')}
		>
			Ghost Brackets
		</button>
		<button
			id="tab-context"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'context'}
			aria-controls="panel-context"
			class:active={activeDemo === 'context'}
			onclick={() => (activeDemo = 'context')}
		>
			Context Lens
		</button>
	</div>

	<!-- Minimap Demo -->
	{#if activeDemo === 'minimap'}
		<div
			class="demo-section"
			id="panel-minimap"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-minimap"
		>
			<div class="section-header">
				<h2>Minimap</h2>
				<p>A scaled-down overview of the document with highlights and click-to-navigate.</p>
			</div>

			<div class="minimap-demo">
				<div class="editor-container">
					<div class="editor-preview" style="height: {editorHeight}px;">
						<div
							class="code-viewport"
							style="transform: translateY(-{minimapScrollTop * lineHeight}px);"
						>
							{#each sampleLines as line, i (i)}
								<div
									class="code-line"
									class:code-line--current={i === cursorLine}
									style="height: {lineHeight}px;"
								>
									<span class="line-num">{i + 1}</span>
									<span class="line-content">{line || ' '}</span>
								</div>
							{/each}
						</div>
					</div>

					<Minimap
						lines={sampleLines}
						scrollTop={minimapScrollTop}
						visibleLines={Math.floor(editorHeight / lineHeight)}
						{editorHeight}
						highlights={minimapHighlights}
						enabled={true}
						width={100}
						onNavigate={handleMinimapNavigate}
					/>
				</div>

				<div class="minimap-controls">
					<div class="control-group">
						<label>
							Scroll Position: {minimapScrollTop}
							<input
								type="range"
								min="0"
								max={sampleLines.length - 20}
								bind:value={minimapScrollTop}
							/>
						</label>
					</div>

					<div class="highlight-legend">
						<h4>Highlights</h4>
						<div class="legend-items">
							<div class="legend-item">
								<span class="legend-color" style="background: #f9e64f;"></span>
								<span>Search results (3)</span>
							</div>
							<div class="legend-item">
								<span class="legend-color" style="background: #f44747;"></span>
								<span>Errors (1)</span>
							</div>
							<div class="legend-item">
								<span class="legend-color" style="background: #ff8c00;"></span>
								<span>Warnings (1)</span>
							</div>
							<div class="legend-item">
								<span class="legend-color" style="background: #3b82f6;"></span>
								<span>Changes (2)</span>
							</div>
						</div>
					</div>
				</div>

				<div class="feature-info">
					<h4>Features</h4>
					<ul>
						<li>Scaled code preview with syntax coloring</li>
						<li>Viewport slider showing current position</li>
						<li>Highlighted regions for search, errors, warnings</li>
						<li>Click or drag to navigate</li>
						<li>Auto-scaling for large files</li>
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- Breadcrumbs Demo -->
	{#if activeDemo === 'breadcrumbs'}
		<div
			class="demo-section"
			id="panel-breadcrumbs"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-breadcrumbs"
		>
			<div class="section-header">
				<h2>Breadcrumbs</h2>
				<p>Navigation trail showing current location in code structure.</p>
			</div>

			<div class="breadcrumbs-demo">
				<div class="breadcrumbs-container">
					<Breadcrumbs
						path={breadcrumbPath}
						fileName="src/components/UserManager.tsx"
						enabled={true}
						onNavigate={handleBreadcrumbNavigate}
					/>
				</div>

				<div class="editor-preview-small">
					{#each sampleLines.slice(15, 45) as line, i (i)}
						<div
							class="code-line"
							class:code-line--current={i + 15 === cursorLine}
							style="height: {lineHeight}px;"
						>
							<span class="line-num">{i + 16}</span>
							<span class="line-content">{line || ' '}</span>
						</div>
					{/each}
				</div>

				<div class="breadcrumbs-controls">
					<h4>Click breadcrumb items to:</h4>
					<ul>
						<li>Navigate to that symbol</li>
						<li>View sibling symbols (click dropdown arrow)</li>
						<li>Jump between related code sections</li>
					</ul>

					<div class="current-position">
						<strong>Current:</strong> Line {cursorLine + 1}
					</div>
				</div>

				<div class="feature-info">
					<h4>Features</h4>
					<ul>
						<li>Shows file > class > method hierarchy</li>
						<li>Click segments to navigate</li>
						<li>Dropdown shows sibling symbols</li>
						<li>Type-specific icons and colors</li>
						<li>Current line position indicator</li>
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- Quick Actions Demo -->
	{#if activeDemo === 'quickactions'}
		<div
			class="demo-section"
			id="panel-quickactions"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-quickactions"
		>
			<div class="section-header">
				<h2>Quick Actions</h2>
				<p>Context-aware code actions with lightbulb indicator.</p>
			</div>

			<div class="quickactions-demo">
				<div class="quickactions-editor">
					<div class="editor-preview-small" style="position: relative;">
						{#if quickActionsManager}
							<QuickActionsMenu
								manager={quickActionsManager}
								{lineHeight}
								{cursorLine}
								gutterWidth={50}
								showLightbulb={quickActionsEnabled}
								onExecute={handleQuickActionExecute}
							/>
						{/if}

						{#each sampleLines.slice(20, 50) as line, i (i)}
							<div
								class="code-line"
								role="button"
								tabindex={-1}
								class:code-line--current={i + 20 === cursorLine}
								style="height: {lineHeight}px;"
								onclick={() => {
									cursorLine = i + 20;
									quickActionsManager?.updateContext({
										position: { line: cursorLine, column: 10 },
										diagnostics: [],
										lineContent: sampleLines[cursorLine] || '',
										language: 'typescript',
										content: sampleCode
									});
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										cursorLine = i + 20;
									}
								}}
							>
								<span class="line-num">{i + 21}</span>
								<span class="line-content">{line || ' '}</span>
							</div>
						{/each}
					</div>

					{#if lastAction}
						<div class="action-toast">
							Executed: {lastAction}
						</div>
					{/if}
				</div>

				<div class="quickactions-controls">
					<button
						class="control-btn"
						class:active={quickActionsEnabled}
						onclick={() => (quickActionsEnabled = !quickActionsEnabled)}
					>
						{quickActionsEnabled ? 'Disable' : 'Enable'} Quick Actions
					</button>

					<div class="shortcut-hint">
						Keyboard: <code>Ctrl+.</code> to open menu
					</div>
				</div>

				<div class="feature-info">
					<h4>Available Actions</h4>
					<div class="action-categories">
						<div class="category">
							<h5>Quick Fixes</h5>
							<ul>
								<li>Add missing semicolon</li>
								<li>Remove unused variables</li>
							</ul>
						</div>
						<div class="category">
							<h5>Refactoring</h5>
							<ul>
								<li>Extract to variable</li>
								<li>Extract to function</li>
								<li>Rename symbol</li>
								<li>Convert to arrow function</li>
							</ul>
						</div>
						<div class="category">
							<h5>Source Actions</h5>
							<ul>
								<li>Organize imports</li>
								<li>Fix all problems</li>
							</ul>
						</div>
						<div class="category">
							<h5>Generate</h5>
							<ul>
								<li>Generate JSDoc</li>
								<li>Generate getter/setter</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Symbol Outline Demo -->
	{#if activeDemo === 'outline'}
		<div
			class="demo-section"
			id="panel-outline"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-outline"
		>
			<div class="section-header">
				<h2>Symbol Outline</h2>
				<p>Document structure panel for navigation and overview.</p>
			</div>

			<div class="outline-demo">
				<div class="outline-layout">
					<div class="editor-preview-small">
						{#each sampleLines as line, i (i)}
							<div
								class="code-line"
								class:code-line--current={i === cursorLine}
								style="height: {lineHeight}px;"
							>
								<span class="line-num">{i + 1}</span>
								<span class="line-content">{line || ' '}</span>
							</div>
						{/each}
					</div>

					<SymbolOutline
						{symbols}
						{activeSymbolId}
						enabled={true}
						sortBy={outlineSortBy}
						onNavigate={handleSymbolNavigate}
						width={280}
					/>
				</div>

				<div class="outline-controls">
					<div class="sort-controls">
						<span>Sort by:</span>
						<button
							class="sort-btn"
							class:active={outlineSortBy === 'position'}
							onclick={() => (outlineSortBy = 'position')}
						>
							Position
						</button>
						<button
							class="sort-btn"
							class:active={outlineSortBy === 'name'}
							onclick={() => (outlineSortBy = 'name')}
						>
							Name
						</button>
						<button
							class="sort-btn"
							class:active={outlineSortBy === 'kind'}
							onclick={() => (outlineSortBy = 'kind')}
						>
							Kind
						</button>
					</div>
				</div>

				<div class="feature-info">
					<h4>Features</h4>
					<ul>
						<li>Hierarchical symbol tree (classes, methods, properties)</li>
						<li>Search/filter symbols</li>
						<li>Click to navigate to symbol</li>
						<li>Collapse/expand sections</li>
						<li>Sort by position, name, or kind</li>
						<li>Active symbol highlighting</li>
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- Echo Cursor Demo -->
	{#if activeDemo === 'echo'}
		<div
			class="demo-section"
			id="panel-echo"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-echo"
		>
			<div class="section-header">
				<h2>Echo Cursors</h2>
				<p>Delayed mirror cursors replay edits at prepared locations for repeated code changes.</p>
			</div>

			<div class="overlay-demo">
				<div class="overlay-editor">
					{#if echoCursorManager}
						<EchoCursorLayer
							manager={echoCursorManager}
							{lineHeight}
							{charWidth}
							{gutterWidth}
							enabled={true}
						/>
					{/if}

					{#each contextLensLines as line (line.number)}
						<div class="code-line" style="height: {lineHeight}px;">
							<span class="line-num">{line.number + 1}</span>
							<span class="line-content">{line.text || ' '}</span>
						</div>
					{/each}
				</div>

				<div class="feature-info">
					<h4>What It Shows</h4>
					<p>
						Two echo cursors are armed in the editor. Type in the source buffer and the same real
						editor edits propagate after separate delays.
					</p>
				</div>

				<label class="echo-source">
					<span>Source buffer</span>
					<textarea
						value={echoSourceContent}
						oninput={(event) =>
							applyEchoSourceContent((event.currentTarget as HTMLTextAreaElement).value)}
						spellcheck="false"
					></textarea>
				</label>
			</div>
		</div>
	{/if}

	<!-- Ghost Bracket Demo -->
	{#if activeDemo === 'ghost'}
		<div
			class="demo-section"
			id="panel-ghost"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-ghost"
		>
			<div class="section-header">
				<h2>Ghost Brackets</h2>
				<p>
					Structural healing suggestions show missing brackets before the document breaks further.
				</p>
			</div>

			<div class="overlay-demo">
				<div class="overlay-editor">
					{#if bracketHealer}
						<GhostBracketLayer
							healer={bracketHealer}
							{lineHeight}
							{charWidth}
							{gutterWidth}
							enabled={true}
						/>
					{/if}

					{#each ghostBracketLines as line, i (i)}
						<div class="code-line" style="height: {lineHeight}px;">
							<span class="line-num">{i + 1}</span>
							<span class="line-content">{line || ' '}</span>
						</div>
					{/each}
				</div>

				<div class="feature-info">
					<h4>What It Shows</h4>
					<p>
						The bracket healer marks the unclosed object block and places a translucent closing
						brace where it expects the structure to recover.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Context Lens Demo -->
	{#if activeDemo === 'context'}
		<div
			class="demo-section"
			id="panel-context"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-context"
		>
			<div class="section-header">
				<h2>Context Lens</h2>
				<p>
					Inline context labels surface the active symbol signature without opening a side panel.
				</p>
			</div>

			<div class="overlay-demo">
				<div class="overlay-editor overlay-editor--context">
					<ContextLens
						lines={contextLensLines}
						cursorLine={contextLensCursorLine}
						{lineHeight}
						{charWidth}
						{gutterWidth}
						enabled={true}
						language="typescript"
					/>

					{#each contextLensLines as line (line.number)}
						<div
							class="code-line"
							class:code-line--current={line.number === contextLensCursorLine}
							style="height: {lineHeight}px;"
						>
							<span class="line-num">{line.number + 1}</span>
							<span class="line-content">{line.text || ' '}</span>
						</div>
					{/each}
				</div>

				<div class="feature-info">
					<h4>What It Shows</h4>
					<p>
						The cursor is inside an async TypeScript function, so the lens floats its signature
						above the declaration line.
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.intelligence-demo {
		padding: 2rem;
		max-width: 1400px;
		margin: 0 auto;
		overflow-x: hidden;
	}

	.demo-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.demo-header h1 {
		margin: 0 0 0.5rem;
		font-size: 2.25rem;
		letter-spacing: -0.01em;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.demo-header p {
		margin: 0;
		color: var(--ide-text-secondary, #aaa);
	}

	/* Tabs */
	.demo-tabs {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--ide-border, #333);
		padding-bottom: 0.5rem;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		/* Show a thin accent thumb so the off-screen tabs read as
		   scrollable, not just technically reachable. Renders only when
		   the strip overflows (i.e. on narrow/phone widths). */
		scrollbar-width: thin;
		scrollbar-color: color-mix(in srgb, var(--color-nocturnium-aurora-purple) 50%, transparent)
			transparent;
	}

	.demo-tabs::-webkit-scrollbar {
		height: 4px;
	}

	.demo-tabs::-webkit-scrollbar-thumb {
		background: color-mix(in srgb, var(--color-nocturnium-aurora-purple) 50%, transparent);
		border-radius: 2px;
	}

	.tab {
		flex-shrink: 0;
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: none;
		border-radius: 6px 6px 0 0;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tab:hover {
		color: var(--ide-text-primary, #e8e8f0);
		background: rgba(255, 255, 255, 0.05);
	}

	.tab.active {
		color: var(--color-nocturnium-aurora-purple);
		background: color-mix(in srgb, var(--color-nocturnium-aurora-purple) 14%, transparent);
	}

	/* Section */
	.demo-section {
		background: var(--ide-bg-secondary, #1e1e2e);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.section-header {
		margin-bottom: 1.5rem;
	}

	.section-header h2 {
		margin: 0 0 0.5rem;
		font-size: 1.35rem;
		letter-spacing: -0.01em;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.section-header p {
		margin: 0;
		/* Lift the lead-in copy one step toward primary so the eye lands
		   on the demo content rather than washing into the chrome. */
		color: color-mix(
			in srgb,
			var(--ide-text-secondary, #aaa) 55%,
			var(--ide-text-primary, #e8e8f0)
		);
		font-size: 0.9rem;
	}

	/* Editor preview */
	.editor-container {
		display: flex;
		gap: 0;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: hidden;
		margin-bottom: 1rem;
	}

	.editor-preview {
		flex: 1;
		overflow: hidden;
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
	}

	.editor-preview-small {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: auto;
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		max-height: 400px;
		position: relative;
	}

	.code-viewport {
		transition: transform 0.1s ease;
	}

	.code-line {
		display: flex;
		line-height: 20px;
		transition: background 0.1s ease;
	}

	.code-line:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.code-line--current {
		background: color-mix(in srgb, var(--color-nocturnium-aurora-purple) 15%, transparent);
	}

	.line-num {
		width: 40px;
		padding-right: 8px;
		text-align: right;
		color: var(--ide-text-muted, #666);
		user-select: none;
		flex-shrink: 0;
	}

	.line-content {
		flex: 1;
		white-space: pre;
		color: var(--ide-text-primary, #e8e8f0);
	}

	/* Minimap demo */
	.minimap-demo {
		display: grid;
		gap: 1rem;
	}

	.minimap-controls {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
	}

	.control-group {
		flex: 1;
	}

	.control-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.control-group input[type='range'] {
		width: 100%;
	}

	.highlight-legend h4 {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.legend-items {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 2px;
	}

	/* Breadcrumbs demo */
	.breadcrumbs-demo {
		display: grid;
		gap: 1rem;
	}

	.breadcrumbs-container {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: hidden;
	}

	.breadcrumbs-controls {
		padding: 1rem;
		background: color-mix(in srgb, var(--color-nocturnium-aurora-purple) 10%, transparent);
		border-radius: 8px;
	}

	.breadcrumbs-controls h4 {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
		color: var(--color-nocturnium-aurora-purple);
	}

	.breadcrumbs-controls ul {
		margin: 0 0 1rem;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #c4c4d4);
	}

	.current-position {
		font-size: 0.85rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	/* Quick Actions demo */
	.quickactions-demo {
		display: grid;
		gap: 1rem;
	}

	.quickactions-editor {
		position: relative;
	}

	.quickactions-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.control-btn {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--color-nocturnium-aurora-purple) 20%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-nocturnium-aurora-purple) 30%, transparent);
		border-radius: 6px;
		color: var(--color-nocturnium-aurora-purple);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		background: color-mix(in srgb, var(--color-nocturnium-aurora-purple) 30%, transparent);
	}

	.control-btn.active {
		background: var(--color-nocturnium-aurora-purple);
		color: #fff;
	}

	.shortcut-hint {
		font-size: 0.8rem;
		color: var(--ide-text-muted, #666);
	}

	.shortcut-hint code {
		background: rgba(255, 255, 255, 0.1);
		padding: 2px 6px;
		border-radius: 3px;
	}

	.action-toast {
		position: absolute;
		bottom: 12px;
		right: 12px;
		padding: 8px 16px;
		background: #22c55e;
		color: #fff;
		border-radius: 6px;
		font-size: 0.85rem;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.action-categories {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
	}

	.category h5 {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.category ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.category li {
		margin: 0.25rem 0;
		padding-left: 1rem;
		position: relative;
	}

	.category li::before {
		content: '•';
		position: absolute;
		left: 0;
		color: var(--color-nocturnium-aurora-purple);
	}

	/* Outline demo */
	.outline-demo {
		display: grid;
		gap: 1rem;
	}

	.outline-layout {
		display: flex;
		gap: 0;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: hidden;
		height: 500px;
	}

	.outline-layout .editor-preview-small {
		flex: 1;
		border-radius: 0;
		max-height: none;
	}

	.outline-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.sort-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.sort-btn {
		padding: 4px 10px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.sort-btn:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.sort-btn.active {
		background: color-mix(in srgb, var(--color-nocturnium-aurora-purple) 30%, transparent);
		color: var(--color-nocturnium-aurora-purple);
	}

	/* Overlay demos */
	.overlay-demo {
		display: grid;
		gap: 1rem;
	}

	.overlay-editor {
		position: relative;
		min-height: 260px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		padding: 18px 0 14px;
	}

	.overlay-editor--context {
		padding-top: 30px;
	}

	.echo-source {
		display: grid;
		gap: 0.5rem;
	}

	.echo-source span {
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.echo-source textarea {
		min-height: 160px;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid var(--ide-border, #333);
		border-radius: 6px;
		color: var(--ide-text-primary, #e8e8f0);
		font:
			13px/1.5 'JetBrains Mono',
			monospace;
		resize: vertical;
	}

	.overlay-editor :global(.context-lens),
	.overlay-editor :global(.echo-cursor-layer),
	.overlay-editor :global(.ghost-bracket-layer) {
		top: 18px;
		bottom: 14px;
	}

	.overlay-editor--context :global(.context-lens) {
		top: 30px;
	}

	/* Feature info */
	.feature-info {
		padding: 1rem;
		background: color-mix(in srgb, var(--color-nocturnium-aurora-purple) 10%, transparent);
		border-radius: 8px;
		margin-top: 1rem;
	}

	.feature-info h4 {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		color: var(--color-nocturnium-aurora-purple);
	}

	.feature-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #c4c4d4);
	}

	.feature-info p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--ide-text-secondary, #c4c4d4);
	}

	.feature-info li {
		margin: 0.25rem 0;
	}

	/* Responsive: tablet -> mobile */
	@media (max-width: 860px) {
		.intelligence-demo {
			padding: 1.5rem 1.25rem;
		}

		.minimap-controls {
			flex-direction: column;
			gap: 1rem;
		}

		/* Stack the outline editor above the symbol panel so neither
		   steals a fixed width that overflows the viewport. */
		.outline-layout {
			flex-direction: column;
			height: auto;
		}

		.outline-layout .editor-preview-small {
			max-height: 320px;
		}
	}

	/* Responsive: phones */
	@media (max-width: 640px) {
		.intelligence-demo {
			padding: 1.25rem 1rem;
		}

		.demo-header h1 {
			font-size: 1.6rem;
		}

		.tab {
			padding: 0.6rem 1rem;
			font-size: 0.85rem;
			/* keep a comfortable tap target */
			min-height: 44px;
		}

		.demo-section {
			padding: 1.25rem 1rem;
		}

		/* Let the minimap editor scroll horizontally with a fade cue
		   instead of clipping long import lines. Stack the 100px minimap
		   below the code so it never steals editor width on a phone. */
		.editor-container {
			flex-direction: column;
		}

		/* Once the 100px minimap stacks under the code, centre it and swap
		   its side border for a top border so it reads as a deliberate
		   scaled overview rather than a clipped sidebar. */
		.editor-container :global(.minimap) {
			align-self: center;
			border-left: none;
			border-top: 1px solid var(--ide-border, #333);
		}

		.editor-preview {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			font-size: 12px;
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
		}

		.editor-preview-small {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			font-size: 12px;
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
		}

		.legend-items {
			gap: 0.75rem;
		}

		.quickactions-controls,
		.outline-controls {
			flex-wrap: wrap;
		}

		.control-btn {
			min-height: 44px;
		}

		.sort-controls {
			flex-wrap: wrap;
			gap: 0.4rem;
		}

		.sort-btn {
			min-height: 36px;
			padding: 6px 12px;
		}

		.action-categories {
			grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		}

		/* The outline panel ships a fixed 280px inline width; cap it so it
		   never overflows a narrow phone once stacked under the editor. */
		.outline-layout :global(.symbol-outline) {
			width: 100% !important;
			max-width: 100%;
		}
	}
</style>
